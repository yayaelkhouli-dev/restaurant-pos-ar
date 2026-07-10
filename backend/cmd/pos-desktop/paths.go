package main

import (
	"errors"
	"fmt"
	"net"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"pos-backend/internal/pgboot"
)

type paths struct {
	AppDir    string // where the .exe and its read-only files live
	DataDir   string // where the database, backups and the signing key live
	PgBinDir  string
	PgDataDir string
	BackupDir string
	WebDir    string
	InitSQL   string
	SeedSQL   string
	LogFile   string
	PgLogFile string
	PassFile  string
}

// portableMarker next to the .exe means "keep everything in this folder".
// The trial build ships one; the installed build does not, because a program
// installed under Program Files cannot write beside itself.
const portableMarker = "portable.marker"

func resolvePaths() (paths, error) {
	exe, err := os.Executable()
	if err != nil {
		return paths{}, err
	}
	appDir := filepath.Dir(exe)

	dataDir, err := resolveDataDir(appDir)
	if err != nil {
		return paths{}, err
	}
	if err := os.MkdirAll(dataDir, 0o755); err != nil {
		return paths{}, fmt.Errorf("لا يمكن الكتابة في %s: %w", dataDir, err)
	}

	p := paths{
		AppDir:    appDir,
		DataDir:   dataDir,
		PgBinDir:  filepath.Join(appDir, "pgsql", "bin"),
		PgDataDir: filepath.Join(dataDir, "pgdata"),
		BackupDir: filepath.Join(dataDir, "backups"),
		WebDir:    filepath.Join(appDir, "web"),
		InitSQL:   filepath.Join(appDir, "database", "init"),
		SeedSQL:   filepath.Join(appDir, "database", "demo", "demo_accounts.sql"),
		LogFile:   filepath.Join(dataDir, "pos.log"),
		PgLogFile: filepath.Join(dataDir, "postgres.log"),
		PassFile:  filepath.Join(dataDir, "db.pass"),
	}

	if _, err := os.Stat(filepath.Join(p.PgBinDir, "pg_ctl.exe")); err != nil {
		return paths{}, fmt.Errorf("الملفات ناقصة: لم يُعثر على %s", p.PgBinDir)
	}
	if _, err := os.Stat(p.InitSQL); err != nil {
		return paths{}, fmt.Errorf("الملفات ناقصة: لم يُعثر على %s", p.InitSQL)
	}
	return p, nil
}

func resolveDataDir(appDir string) (string, error) {
	if d := os.Getenv("POS_DATA_DIR"); d != "" {
		return d, nil
	}
	if _, err := os.Stat(filepath.Join(appDir, portableMarker)); err == nil {
		return filepath.Join(appDir, "data"), nil
	}
	// ProgramData, not AppData: a till is used by whoever is on shift, and they
	// must all see the same orders.
	if pd := os.Getenv("ProgramData"); pd != "" {
		return filepath.Join(pd, "RestaurantPOS"), nil
	}
	return "", errors.New("لم يُعثر على مجلد ProgramData")
}

func startDatabase(p paths) (*pgboot.Server, error) {
	return pgboot.Start(pgboot.Config{
		BinDir:       p.PgBinDir,
		DataDir:      p.PgDataDir,
		LogFile:      p.PgLogFile,
		Port:         dbPort,
		DBName:       dbName,
		User:         dbUser,
		PasswordFile: p.PassFile,
		InitSQLDir:   p.InitSQL,
		SeedSQL:      p.SeedSQL,
	})
}

// lanURLs lists the addresses other devices in the restaurant can use. A PC with
// a VPN or a virtual switch has several; printing them all beats guessing.
func lanURLs(port string) string {
	ifaces, err := net.Interfaces()
	if err != nil {
		return "    (تعذّر تحديد عنوان الشبكة)"
	}
	found := []string{}
	for _, iface := range ifaces {
		if iface.Flags&net.FlagUp == 0 || iface.Flags&net.FlagLoopback != 0 {
			continue
		}
		addrs, err := iface.Addrs()
		if err != nil {
			continue
		}
		for _, a := range addrs {
			ipnet, ok := a.(*net.IPNet)
			if !ok || ipnet.IP.To4() == nil || !ipnet.IP.IsPrivate() {
				continue
			}
			found = append(found, fmt.Sprintf("    http://%s:%s", ipnet.IP.String(), port))
		}
	}
	if len(found) == 0 {
		return "    (هذا الجهاز غير متصل بشبكة)"
	}
	sort.Strings(found)
	return strings.Join(found, "\r\n")
}
