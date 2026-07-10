// Package pgboot starts, initialises and stops the private PostgreSQL server
// that ships inside the product.
//
// It exists so the installed program depends on nothing the customer has to
// provide: not a .bat file, not the PATH, not a PostgreSQL somebody else
// installed. The server is a child process of ours, on a port we choose, with
// its data in a folder we know is writable, reachable only from this machine.
package pgboot

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"time"
)

// Nothing here may block forever. A wedged child process would leave the
// cashier staring at a program that never opens and never explains itself.
const (
	quickTimeout = 60 * time.Second  // pg_ctl, pg_isready, createdb
	slowTimeout  = 10 * time.Minute  // initdb, and loading the schema
)

// Config describes one private PostgreSQL instance.
type Config struct {
	BinDir  string // <app>\pgsql\bin
	DataDir string // <data>\pgdata — must be writable by the current user
	LogFile string // <data>\postgres.log
	Port    string // never 5432: the customer may already run PostgreSQL
	DBName  string
	User    string

	// PasswordFile holds the randomly generated superuser password, created on
	// first launch. Every installation gets its own.
	PasswordFile string

	// InitSQLDir holds the numbered migrations, applied in filename order the
	// first time the database is created.
	InitSQLDir string
	// SeedSQL is applied once after the migrations, if the file exists. The
	// trial build uses it to relax the forced password change.
	SeedSQL string
}

type Server struct {
	cfg      Config
	password string
	// startedByUs is false when we attached to a server that was already
	// running, in which case Stop must leave it alone.
	startedByUs bool
	// createdDataDir records that this call built the data directory, so a
	// failed first-time migration may safely wipe it and retry next launch.
	createdDataDir bool
}

// Password is the superuser password for this installation. The API server
// needs it to build its connection string.
func (s *Server) Password() string { return s.password }

func exeName(n string) string {
	if runtime.GOOS == "windows" {
		return n + ".exe"
	}
	return n
}

func (c Config) tool(name string) string { return filepath.Join(c.BinDir, exeName(name)) }

func (s *Server) command(ctx context.Context, name string, args ...string) *exec.Cmd {
	cmd := hideWindow(exec.CommandContext(ctx, s.cfg.tool(name), args...))
	cmd.Env = append(os.Environ(),
		"PGPASSWORD="+s.password,
		"PGCLIENTENCODING=UTF8",
		// "column already exists, skipping" is expected and only frightens
		// whoever reads the log.
		"PGOPTIONS=-c client_min_messages=warning",
	)
	return cmd
}

// run executes a tool that exits on its own and returns everything it printed.
//
// It must never be used for `pg_ctl start`. See runDetaching.
func (s *Server) run(timeout time.Duration, name string, args ...string) ([]byte, error) {
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()

	out, err := s.command(ctx, name, args...).CombinedOutput()
	if ctx.Err() == context.DeadlineExceeded {
		return out, fmt.Errorf("%s لم ينتهِ خلال %s", name, timeout)
	}
	return out, err
}

// runDetaching executes a tool that leaves a daemon behind it.
//
// `pg_ctl start` forks postgres.exe, which inherits pg_ctl's stdout and stderr.
// CombinedOutput waits for every writer of that pipe to close it -- and the
// database server never does, because it is still running. The call would hang
// until the machine is rebooted. Handing the child the NUL device instead of a
// pipe is the whole fix; pg_ctl's -l flag already routes the server's own output
// to a log file, and the exit code tells us whether it worked.
func (s *Server) runDetaching(timeout time.Duration, name string, args ...string) error {
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()

	cmd := s.command(ctx, name, args...)
	cmd.Stdout = nil
	cmd.Stderr = nil
	err := cmd.Run()
	if ctx.Err() == context.DeadlineExceeded {
		return fmt.Errorf("%s لم ينتهِ خلال %s", name, timeout)
	}
	return err
}

func lastLine(out []byte, err error) string {
	lines := strings.Split(strings.TrimSpace(string(out)), "\n")
	for i := len(lines) - 1; i >= 0; i-- {
		if l := strings.TrimSpace(lines[i]); l != "" {
			return l
		}
	}
	return err.Error()
}

func newPassword() (string, error) {
	buf := make([]byte, 24)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(buf), nil
}

// Start brings the database up, creating it on first launch, and returns a
// handle that can stop it again.
func Start(cfg Config) (*Server, error) {
	if _, err := os.Stat(cfg.tool("pg_ctl")); err != nil {
		return nil, fmt.Errorf("لم يُعثر على قاعدة البيانات في %s", cfg.BinDir)
	}
	s := &Server{cfg: cfg}

	initialised, err := isInitialised(cfg.DataDir)
	if err != nil {
		return nil, err
	}

	if err := s.resolvePassword(initialised); err != nil {
		return nil, err
	}

	if !initialised {
		log.Println("pgboot: first run — creating the database cluster")
		if err := s.initdb(); err != nil {
			return nil, err
		}
		s.createdDataDir = true
	}

	if s.serverRunning() {
		return nil, fmt.Errorf("قاعدة البيانات تعمل بالفعل من %s — البرنامج مفتوح مرة أخرى؟", cfg.DataDir)
	}
	log.Println("pgboot: starting the server")
	if err := s.startServer(); err != nil {
		return nil, err
	}
	s.startedByUs = true

	log.Println("pgboot: waiting for it to accept connections")
	if err := s.waitReady(45 * time.Second); err != nil {
		s.Stop()
		return nil, err
	}

	if !initialised {
		log.Println("pgboot: creating the database")
		if err := s.createDatabase(); err != nil {
			s.failedFirstRun()
			return nil, err
		}
		log.Println("pgboot: loading the schema")
		if err := s.applySQL(); err != nil {
			s.failedFirstRun()
			return nil, err
		}
	}
	log.Println("pgboot: ready")
	return s, nil
}

// failedFirstRun throws away a half-built database. A partially loaded schema is
// worse than none: the customer would get a program that starts and then breaks
// in ways nobody can explain. Only ever touches a directory this call created.
func (s *Server) failedFirstRun() {
	s.Stop()
	if s.createdDataDir {
		os.RemoveAll(s.cfg.DataDir)
		os.Remove(s.cfg.PasswordFile)
	}
}

// resolvePassword reads the installation's password, or mints one. An existing
// data directory without a password file predates this scheme and used trust
// authentication, so an empty password is correct there.
func (s *Server) resolvePassword(initialised bool) error {
	if data, err := os.ReadFile(s.cfg.PasswordFile); err == nil && len(strings.TrimSpace(string(data))) > 0 {
		s.password = strings.TrimSpace(string(data))
		return nil
	}
	if initialised {
		s.password = ""
		return nil
	}
	pw, err := newPassword()
	if err != nil {
		return fmt.Errorf("تعذّر توليد كلمة سر قاعدة البيانات: %w", err)
	}
	if err := os.MkdirAll(filepath.Dir(s.cfg.PasswordFile), 0o755); err != nil {
		return err
	}
	if err := os.WriteFile(s.cfg.PasswordFile, []byte(pw), 0o600); err != nil {
		return fmt.Errorf("تعذّر حفظ كلمة سر قاعدة البيانات: %w", err)
	}
	s.password = pw
	return nil
}

func isInitialised(dataDir string) (bool, error) {
	st, err := os.Stat(filepath.Join(dataDir, "PG_VERSION"))
	if err == nil {
		return !st.IsDir(), nil
	}
	if os.IsNotExist(err) {
		return false, nil
	}
	return false, err
}

func (s *Server) initdb() error {
	if err := os.MkdirAll(filepath.Dir(s.cfg.DataDir), 0o755); err != nil {
		return fmt.Errorf("تعذّر إنشاء مجلد البيانات: %w", err)
	}
	// scram-sha-256, not trust: otherwise any program running on this PC could
	// open the restaurant's sales data without a password.
	// --locale=C keeps sorting predictable whatever the customer's Windows
	// language is; the encoding is what carries Arabic text.
	out, err := s.run(slowTimeout, "initdb",
		"-D", s.cfg.DataDir,
		"-U", s.cfg.User,
		"-A", "scram-sha-256",
		"--pwfile="+s.cfg.PasswordFile,
		"-E", "UTF8",
		"--locale=C",
	)
	if err != nil {
		return fmt.Errorf("تعذّر تجهيز قاعدة البيانات: %s", lastLine(out, err))
	}

	// Loopback only. The POS is reachable across the restaurant's network on its
	// own HTTP port; the database never should be.
	conf := filepath.Join(s.cfg.DataDir, "postgresql.conf")
	f, err := os.OpenFile(conf, os.O_APPEND|os.O_WRONLY, 0o644)
	if err != nil {
		return fmt.Errorf("تعذّر ضبط قاعدة البيانات: %w", err)
	}
	defer f.Close()
	if _, err := fmt.Fprintf(f, "\nport = %s\nlisten_addresses = '127.0.0.1'\n", s.cfg.Port); err != nil {
		return fmt.Errorf("تعذّر ضبط قاعدة البيانات: %w", err)
	}
	return nil
}

func (s *Server) serverRunning() bool {
	_, err := s.run(quickTimeout, "pg_ctl", "-D", s.cfg.DataDir, "status")
	return err == nil
}

func (s *Server) startServer() error {
	if err := os.MkdirAll(filepath.Dir(s.cfg.LogFile), 0o755); err != nil {
		return err
	}
	// runDetaching, not run: postgres.exe outlives pg_ctl and would hold a
	// captured pipe open forever.
	if err := s.runDetaching(quickTimeout, "pg_ctl", "-D", s.cfg.DataDir, "-l", s.cfg.LogFile, "-w", "start"); err != nil {
		return fmt.Errorf("لم تبدأ قاعدة البيانات (%v) — راجع %s", err, s.cfg.LogFile)
	}
	return nil
}

// waitReady polls instead of trusting `pg_ctl -w`, which can return before the
// server accepts connections on a cold or antivirus-scanned machine.
func (s *Server) waitReady(timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	var last []byte
	for time.Now().Before(deadline) {
		out, err := s.run(quickTimeout, "pg_isready", "-h", "127.0.0.1", "-p", s.cfg.Port, "-q")
		if err == nil {
			return nil
		}
		last = out
		time.Sleep(500 * time.Millisecond)
	}
	return fmt.Errorf("قاعدة البيانات لم تستجب خلال %s: %s", timeout, strings.TrimSpace(string(last)))
}

func (s *Server) createDatabase() error {
	out, err := s.run(quickTimeout, "createdb", "-h", "127.0.0.1", "-p", s.cfg.Port, "-U", s.cfg.User, s.cfg.DBName)
	if err != nil {
		return fmt.Errorf("تعذّر إنشاء قاعدة البيانات: %s", lastLine(out, err))
	}
	return nil
}

// applySQL loads every migration in filename order, then the optional seed.
// ON_ERROR_STOP makes psql exit non-zero on the first failure rather than
// ploughing on and reporting success over a broken schema.
func (s *Server) applySQL() error {
	entries, err := os.ReadDir(s.cfg.InitSQLDir)
	if err != nil {
		return fmt.Errorf("لم يُعثر على ملفات قاعدة البيانات في %s", s.cfg.InitSQLDir)
	}
	files := []string{}
	for _, e := range entries {
		if !e.IsDir() && strings.EqualFold(filepath.Ext(e.Name()), ".sql") {
			files = append(files, e.Name())
		}
	}
	if len(files) == 0 {
		return errors.New("لا توجد ملفات قاعدة بيانات لتحميلها")
	}
	sort.Strings(files)

	for _, name := range files {
		if err := s.psqlFile(filepath.Join(s.cfg.InitSQLDir, name)); err != nil {
			return fmt.Errorf("فشل تحميل %s: %w", name, err)
		}
	}
	if s.cfg.SeedSQL != "" {
		if _, err := os.Stat(s.cfg.SeedSQL); err == nil {
			if err := s.psqlFile(s.cfg.SeedSQL); err != nil {
				return fmt.Errorf("فشل تحميل بيانات التجربة: %w", err)
			}
		}
	}
	return nil
}

func (s *Server) psqlFile(path string) error {
	out, err := s.run(slowTimeout, "psql",
		"-h", "127.0.0.1", "-p", s.cfg.Port, "-U", s.cfg.User, "-d", s.cfg.DBName,
		"-v", "ON_ERROR_STOP=1", "-q", "-f", path,
	)
	if err != nil {
		return errors.New(lastLine(out, err))
	}
	return nil
}

// Stop shuts the server down, but only if we were the ones who started it.
func (s *Server) Stop() {
	if s == nil || !s.startedByUs {
		return
	}
	log.Println("pgboot: stopping the server")
	if _, err := s.run(quickTimeout, "pg_ctl", "-D", s.cfg.DataDir, "-m", "fast", "stop"); err != nil {
		log.Printf("pgboot: could not stop cleanly: %v", err)
	}
	s.startedByUs = false
}
