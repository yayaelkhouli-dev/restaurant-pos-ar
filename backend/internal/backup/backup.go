// Package backup creates, verifies, restores and prunes PostgreSQL dumps of the
// POS database, and mirrors each one to a second location the operator picks.
//
// The mirror is the whole point. On a typical restaurant PC every drive letter
// (C:, D:, ...) is a partition of the same physical disk, so a "backup" written
// next to the database dies with it. A destination the operator chooses — a USB
// stick, an external drive, a network share — is the only copy that survives the
// disk failing.
package backup

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"io"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

// Keys under which the backup configuration lives in the `settings` table.
const (
	keyAutoEnabled   = "backup_auto_enabled"
	keyIntervalHours = "backup_interval_hours"
	keyRetentionDays = "backup_retention_days"
	keyExternalPath  = "backup_external_path"
	keyLastAt        = "backup_last_at"
	keyLastStatus    = "backup_last_status"
)

const (
	defaultIntervalHours = 6
	defaultRetentionDays = 30
	stampLayout          = "20060102_150405"
	idleConns            = 10 // mirrors database.Connect
)

// nameRe is the only gate between a user-supplied string and the filesystem.
// It rejects path separators, "..", and anything this package did not write.
var nameRe = regexp.MustCompile(`^(pos|pre_restore|pre_reset)_\d{8}_\d{6}\.dump$`)

// pruneRe matches ONLY the routine dumps. Safety copies are never auto-deleted.
var pruneRe = regexp.MustCompile(`^pos_\d{8}_\d{6}\.dump$`)

// ValidName reports whether name is a dump this package created. Callers must
// check it before touching the filesystem with a name that came from a request.
func ValidName(name string) bool {
	return name == filepath.Base(name) && nameRe.MatchString(name)
}

// DBConfig is the connection info the pg_dump / pg_restore child processes need.
type DBConfig struct {
	Host, Port, User, Password, DBName string
}

// Info describes one dump file on disk.
type Info struct {
	Name       string    `json:"name"`
	SizeBytes  int64     `json:"size_bytes"`
	CreatedAt  time.Time `json:"created_at"`
	Kind       string    `json:"kind"` // "backup" | "safety"
	OnExternal bool      `json:"on_external"`
}

// Settings is the operator-facing configuration.
type Settings struct {
	AutoEnabled   bool   `json:"auto_enabled"`
	IntervalHours int    `json:"interval_hours"`
	RetentionDays int    `json:"retention_days"`
	ExternalPath  string `json:"external_path"`
	LastAt        string `json:"last_at"`
	LastStatus    string `json:"last_status"`
}

// Status is Settings plus everything the UI needs to explain the current state.
type Status struct {
	Settings
	BackupDir     string `json:"backup_dir"`
	ToolsFound    bool   `json:"tools_found"`
	ToolsDir      string `json:"tools_dir"`
	ExternalOK    bool   `json:"external_ok"`
	ExternalError string `json:"external_error,omitempty"`
}

// Result reports what one backup run actually did.
type Result struct {
	Info          Info   `json:"info"`
	ExternalPath  string `json:"external_path,omitempty"`
	ExternalError string `json:"external_error,omitempty"`
	Pruned        int    `json:"pruned"`
}

// Service serialises every dump/restore through one mutex: two pg_restore runs
// against the same database at once would corrupt it.
type Service struct {
	db        *sql.DB
	cfg       DBConfig
	binDir    string
	backupDir string
	mu        sync.Mutex
}

func New(db *sql.DB, cfg DBConfig) *Service {
	binDir, posRoot := findPGBin(os.Getenv("PG_BIN_DIR"))
	return &Service{
		db:        db,
		cfg:       cfg,
		binDir:    binDir,
		backupDir: resolveBackupDir(os.Getenv("BACKUP_DIR"), posRoot),
	}
}

// BackupDir is exported so the launcher scripts and the installer agree on it.
func (s *Service) BackupDir() string { return s.backupDir }

// Ready reports whether pg_dump was found. Without it nothing here works.
func (s *Service) Ready() bool { return s.binDir != "" }

func exeName(n string) string {
	if runtime.GOOS == "windows" {
		return n + ".exe"
	}
	return n
}

// findPGBin looks for a portable PostgreSQL laid out as <POS_ROOT>/pgsql/bin,
// walking up from the running binary and the working directory. It returns the
// bin directory and, when the layout matched, <POS_ROOT>. A PATH-installed
// PostgreSQL yields an empty posRoot: its parent is not our install root.
func findPGBin(explicit string) (binDir, posRoot string) {
	has := func(dir string) bool {
		st, err := os.Stat(filepath.Join(dir, exeName("pg_dump")))
		return err == nil && !st.IsDir()
	}

	if explicit != "" && has(explicit) {
		abs, err := filepath.Abs(explicit)
		if err != nil {
			abs = explicit
		}
		return abs, ""
	}

	roots := []string{}
	if exe, err := os.Executable(); err == nil {
		roots = append(roots, filepath.Dir(exe))
	}
	if wd, err := os.Getwd(); err == nil {
		roots = append(roots, wd)
	}
	for _, r := range roots {
		d := r
		for i := 0; i < 4; i++ {
			cand := filepath.Join(d, "pgsql", "bin")
			if has(cand) {
				abs, err := filepath.Abs(cand)
				if err != nil {
					abs = cand
				}
				return abs, filepath.Dir(filepath.Dir(abs))
			}
			parent := filepath.Dir(d)
			if parent == d {
				break
			}
			d = parent
		}
	}

	if p, err := exec.LookPath(exeName("pg_dump")); err == nil {
		return filepath.Dir(p), ""
	}
	return "", ""
}

func resolveBackupDir(explicit, posRoot string) string {
	if explicit != "" {
		return explicit
	}
	if posRoot != "" {
		return filepath.Join(posRoot, "backups")
	}
	if exe, err := os.Executable(); err == nil {
		return filepath.Join(filepath.Dir(exe), "backups")
	}
	return "backups"
}

func (s *Service) tool(name string) string {
	if s.binDir == "" {
		return exeName(name)
	}
	return filepath.Join(s.binDir, exeName(name))
}

func (s *Service) connArgs() []string {
	return []string{"-h", s.cfg.Host, "-p", s.cfg.Port, "-U", s.cfg.User, "-d", s.cfg.DBName}
}

// run executes a PostgreSQL tool. The password goes through the environment,
// never the command line, where it would show up in the process list.
func (s *Service) run(name string, args ...string) ([]byte, error) {
	cmd := exec.Command(s.tool(name), args...)
	cmd.Env = append(os.Environ(), "PGPASSWORD="+s.cfg.Password)
	return cmd.CombinedOutput()
}

// toolError picks the last non-empty line of a failed tool's output: pg_dump and
// pg_restore print the real reason last, after any progress noise.
func toolError(out []byte, err error) string {
	lines := strings.Split(strings.TrimSpace(string(out)), "\n")
	for i := len(lines) - 1; i >= 0; i-- {
		if l := strings.TrimSpace(lines[i]); l != "" {
			return l
		}
	}
	return err.Error()
}

func kindOf(name string) string {
	if strings.HasPrefix(name, "pre_restore_") || strings.HasPrefix(name, "pre_reset_") {
		return "safety"
	}
	return "backup"
}

var errNoTools = errors.New("لم يتم العثور على أدوات PostgreSQL (pg_dump). حدّد مكانها في المتغيّر PG_BIN_DIR")

// verify proves the archive can actually be read back. pg_dump happily leaves a
// truncated file behind when the disk fills, and a dump nobody can restore is
// not a backup — it is a file that lies about being one.
func (s *Service) verify(path string) error {
	out, err := s.run("pg_restore", "-l", path)
	if err != nil {
		return fmt.Errorf("النسخة تالفة وغير صالحة للاسترجاع: %s", toolError(out, err))
	}
	if len(strings.TrimSpace(string(out))) == 0 {
		return errors.New("النسخة تالفة: قائمة محتوياتها فارغة")
	}
	return nil
}

// create dumps the database and refuses to return an unverified file.
// The caller must already hold s.mu.
func (s *Service) create(prefix string) (Info, error) {
	if s.binDir == "" {
		return Info{}, errNoTools
	}
	if err := os.MkdirAll(s.backupDir, 0o755); err != nil {
		return Info{}, fmt.Errorf("تعذّر إنشاء مجلد النسخ الاحتياطية: %w", err)
	}

	name := prefix + "_" + time.Now().Format(stampLayout) + ".dump"
	if _, err := os.Stat(filepath.Join(s.backupDir, name)); err == nil {
		// Same-second collision: wait for the clock rather than overwrite.
		time.Sleep(time.Second)
		name = prefix + "_" + time.Now().Format(stampLayout) + ".dump"
	}
	path := filepath.Join(s.backupDir, name)

	args := append(s.connArgs(), "-F", "c", "-f", path)
	if out, err := s.run("pg_dump", args...); err != nil {
		os.Remove(path)
		return Info{}, fmt.Errorf("فشل إنشاء النسخة: %s", toolError(out, err))
	}

	st, err := os.Stat(path)
	if err != nil || st.Size() == 0 {
		os.Remove(path)
		return Info{}, errors.New("النسخة خرجت فارغة — لم يُحفَظ أي شيء")
	}
	if err := s.verify(path); err != nil {
		os.Remove(path)
		return Info{}, err
	}

	return Info{Name: name, SizeBytes: st.Size(), CreatedAt: st.ModTime(), Kind: kindOf(name)}, nil
}

// Run takes one backup, mirrors it, prunes old ones, and records the outcome.
// A failure to mirror is reported but does not discard the local dump.
func (s *Service) Run() (Result, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	cfg, _ := s.LoadSettings()

	info, err := s.create("pos")
	if err != nil {
		s.saveStatus(time.Now(), "خطأ: "+err.Error())
		return Result{}, err
	}
	res := Result{Info: info}

	if cfg.ExternalPath != "" {
		dst := filepath.Join(cfg.ExternalPath, info.Name)
		if cerr := copyFile(filepath.Join(s.backupDir, info.Name), dst); cerr != nil {
			res.ExternalError = cerr.Error()
		} else {
			res.ExternalPath = dst
			res.Info.OnExternal = true
		}
	}

	res.Pruned = s.prune(s.backupDir, cfg.RetentionDays)
	if cfg.ExternalPath != "" && res.ExternalError == "" {
		res.Pruned += s.prune(cfg.ExternalPath, cfg.RetentionDays)
	}

	status := "ok"
	if res.ExternalError != "" {
		status = "النسخة المحلية تمّت، وفشل النسخ للمكان الخارجي: " + res.ExternalError
	}
	s.saveStatus(time.Now(), status)
	return res, nil
}

// Restore replaces the live database with a dump. It refuses to start without a
// readable archive, and it always takes a safety copy first, so a mistaken
// restore is itself undoable.
//
// pg_restore runs with --single-transaction: on any error the database is left
// exactly as it was, which is what the failure message promises.
func (s *Service) Restore(name string) (safetyName string, err error) {
	if !ValidName(name) {
		return "", errors.New("اسم ملف غير صالح")
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	if s.binDir == "" {
		return "", errNoTools
	}
	path := filepath.Join(s.backupDir, name)
	st, serr := os.Stat(path)
	if serr != nil || st.IsDir() || st.Size() == 0 {
		return "", errors.New("ملف النسخة غير موجود أو فارغ")
	}
	if verr := s.verify(path); verr != nil {
		return "", verr
	}

	safety, cerr := s.create("pre_restore")
	if cerr != nil {
		return "", fmt.Errorf("تعذّر أخذ نسخة أمان قبل الاسترجاع، فأُلغيت العملية: %w", cerr)
	}

	args := append(s.connArgs(),
		"--clean", "--if-exists", "--no-owner", "--no-privileges", "--single-transaction", path)
	if out, rerr := s.run("pg_restore", args...); rerr != nil {
		return safety.Name, fmt.Errorf("فشل الاسترجاع وقاعدة البيانات لم تتغيّر: %s", toolError(out, rerr))
	}

	// Every pooled connection was opened against the old objects. Cycling the
	// idle pool forces fresh ones rather than serving queries over stale state.
	s.db.SetMaxIdleConns(0)
	s.db.SetMaxIdleConns(idleConns)

	return safety.Name, nil
}

// List returns the dumps on disk, newest first. Never nil: a nil slice marshals
// to JSON `null` and the browser client cannot read `.length` off that.
func (s *Service) List() ([]Info, error) {
	cfg, _ := s.LoadSettings()

	onExternal := map[string]bool{}
	if cfg.ExternalPath != "" {
		if entries, err := os.ReadDir(cfg.ExternalPath); err == nil {
			for _, e := range entries {
				onExternal[e.Name()] = true
			}
		}
	}

	entries, err := os.ReadDir(s.backupDir)
	if err != nil {
		if os.IsNotExist(err) {
			return []Info{}, nil
		}
		return []Info{}, err
	}

	out := []Info{}
	for _, e := range entries {
		if e.IsDir() || !nameRe.MatchString(e.Name()) {
			continue
		}
		fi, err := e.Info()
		if err != nil {
			continue
		}
		out = append(out, Info{
			Name:       e.Name(),
			SizeBytes:  fi.Size(),
			CreatedAt:  fi.ModTime(),
			Kind:       kindOf(e.Name()),
			OnExternal: onExternal[e.Name()],
		})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].CreatedAt.After(out[j].CreatedAt) })
	return out, nil
}

// Delete removes one dump from the local folder. The external mirror is left
// alone: it is the copy that outlives this machine.
func (s *Service) Delete(name string) error {
	if !ValidName(name) {
		return errors.New("اسم ملف غير صالح")
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := os.Remove(filepath.Join(s.backupDir, name)); err != nil {
		if os.IsNotExist(err) {
			return errors.New("الملف غير موجود")
		}
		return err
	}
	return nil
}

// Path resolves a dump name to a filesystem path for download.
func (s *Service) Path(name string) (string, error) {
	if !ValidName(name) {
		return "", errors.New("اسم ملف غير صالح")
	}
	p := filepath.Join(s.backupDir, name)
	if st, err := os.Stat(p); err != nil || st.IsDir() {
		return "", errors.New("الملف غير موجود")
	}
	return p, nil
}

// prune deletes routine dumps older than the retention window. Safety copies
// (pre_restore_*, pre_reset_*) are never touched: they exist precisely because
// somebody was about to destroy data.
func (s *Service) prune(dir string, retentionDays int) int {
	if retentionDays <= 0 {
		return 0
	}
	entries, err := os.ReadDir(dir)
	if err != nil {
		return 0
	}
	cutoff := time.Now().AddDate(0, 0, -retentionDays)
	removed := 0
	for _, e := range entries {
		if e.IsDir() || !pruneRe.MatchString(e.Name()) {
			continue
		}
		fi, err := e.Info()
		if err != nil || !fi.ModTime().Before(cutoff) {
			continue
		}
		if os.Remove(filepath.Join(dir, e.Name())) == nil {
			removed++
		}
	}
	return removed
}

// copyFile writes to a .part file and renames on success, so a reader never
// finds a half-written dump — and a full USB stick never leaves a fake one.
func copyFile(src, dst string) error {
	if err := os.MkdirAll(filepath.Dir(dst), 0o755); err != nil {
		return err
	}
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()

	tmp := dst + ".part"
	out, err := os.Create(tmp)
	if err != nil {
		return err
	}
	if _, err := io.Copy(out, in); err != nil {
		out.Close()
		os.Remove(tmp)
		return err
	}
	if err := out.Sync(); err != nil {
		out.Close()
		os.Remove(tmp)
		return err
	}
	if err := out.Close(); err != nil {
		os.Remove(tmp)
		return err
	}
	os.Remove(dst) // Windows rename does not overwrite
	if err := os.Rename(tmp, dst); err != nil {
		os.Remove(tmp)
		return err
	}
	return nil
}

// checkWritable proves we can actually create a file there, right now. A path
// that merely exists is not a path a USB stick will accept when it is full or
// write-protected.
func checkWritable(dir string) error {
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	probe := filepath.Join(dir, ".pos_write_test")
	f, err := os.Create(probe)
	if err != nil {
		return err
	}
	_, werr := f.WriteString("ok")
	cerr := f.Close()
	os.Remove(probe)
	if werr != nil {
		return werr
	}
	return cerr
}

func (s *Service) LoadSettings() (Settings, error) {
	cfg := Settings{IntervalHours: defaultIntervalHours, RetentionDays: defaultRetentionDays}

	rows, err := s.db.Query(`SELECT key, value FROM settings WHERE key LIKE 'backup\_%'`)
	if err != nil {
		return cfg, err
	}
	defer rows.Close()

	for rows.Next() {
		var k string
		var v sql.NullString
		if err := rows.Scan(&k, &v); err != nil {
			continue
		}
		switch k {
		case keyAutoEnabled:
			cfg.AutoEnabled = v.String == "true"
		case keyIntervalHours:
			if n, err := strconv.Atoi(v.String); err == nil && n > 0 {
				cfg.IntervalHours = n
			}
		case keyRetentionDays:
			if n, err := strconv.Atoi(v.String); err == nil && n > 0 {
				cfg.RetentionDays = n
			}
		case keyExternalPath:
			cfg.ExternalPath = strings.TrimSpace(v.String)
		case keyLastAt:
			cfg.LastAt = v.String
		case keyLastStatus:
			cfg.LastStatus = v.String
		}
	}
	return cfg, rows.Err()
}

// SaveSettings validates before it stores. An external path that cannot be
// written to is rejected at save time, not silently at 3am when it matters.
func (s *Service) SaveSettings(in Settings) error {
	if in.IntervalHours < 1 || in.IntervalHours > 168 {
		return errors.New("فترة النسخ التلقائي لازم تكون بين ساعة و168 ساعة")
	}
	if in.RetentionDays < 1 || in.RetentionDays > 3650 {
		return errors.New("مدة الاحتفاظ بالنسخ لازم تكون بين يوم و3650 يوم")
	}

	ext := strings.TrimSpace(in.ExternalPath)
	if ext != "" {
		if !filepath.IsAbs(ext) {
			return errors.New(`مسار النسخة الخارجية لازم يكون مسار كامل، مثل E:\pos-backups`)
		}
		if err := checkWritable(ext); err != nil {
			return fmt.Errorf("لا يمكن الكتابة في %s — تأكّد أن الفلاشة موصولة: %v", ext, err)
		}
	}

	return s.upsert(map[string]string{
		keyAutoEnabled:   strconv.FormatBool(in.AutoEnabled),
		keyIntervalHours: strconv.Itoa(in.IntervalHours),
		keyRetentionDays: strconv.Itoa(in.RetentionDays),
		keyExternalPath:  ext,
	})
}

func (s *Service) Status() Status {
	cfg, _ := s.LoadSettings()
	st := Status{
		Settings:   cfg,
		BackupDir:  s.backupDir,
		ToolsFound: s.binDir != "",
		ToolsDir:   s.binDir,
		ExternalOK: true,
	}
	if cfg.ExternalPath != "" {
		if err := checkWritable(cfg.ExternalPath); err != nil {
			st.ExternalOK = false
			st.ExternalError = err.Error()
		}
	}
	return st
}

func (s *Service) upsert(kv map[string]string) error {
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	for k, v := range kv {
		if _, err := tx.Exec(`
			INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, CURRENT_TIMESTAMP)
			ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP
		`, k, v); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func (s *Service) saveStatus(at time.Time, status string) {
	if err := s.upsert(map[string]string{
		keyLastAt:     at.Format(time.RFC3339),
		keyLastStatus: status,
	}); err != nil {
		log.Printf("backup: could not record status: %v", err)
	}
}

// StartScheduler runs the automatic backup loop until ctx is cancelled. It wakes
// every minute and compares the clock against the last recorded run, so a PC
// that was switched off overnight backs up shortly after it boots instead of
// skipping the missed slot entirely.
func (s *Service) StartScheduler(ctx context.Context) {
	go func() {
		t := time.NewTicker(time.Minute)
		defer t.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-t.C:
				s.tick()
			}
		}
	}()
}

func (s *Service) tick() {
	cfg, err := s.LoadSettings()
	if err != nil || !cfg.AutoEnabled || s.binDir == "" {
		return
	}
	if cfg.LastAt != "" {
		if last, perr := time.Parse(time.RFC3339, cfg.LastAt); perr == nil {
			if time.Since(last) < time.Duration(cfg.IntervalHours)*time.Hour {
				return
			}
		}
	}
	res, err := s.Run()
	if err != nil {
		log.Printf("backup: automatic run failed: %v", err)
		return
	}
	log.Printf("backup: automatic run wrote %s (%d bytes)", res.Info.Name, res.Info.SizeBytes)
}
