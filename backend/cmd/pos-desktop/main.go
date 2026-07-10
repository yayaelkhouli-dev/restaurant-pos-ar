// Command pos-desktop is the program a restaurant installs.
//
// It is a single window. Behind that window it starts its own private
// PostgreSQL, creates the database on first launch, serves the API and the UI,
// and shuts everything down again when the window is closed. Nothing has to be
// installed alongside it and nothing is left running afterwards.
//
// The same server is bound to the local network, so the kitchen screen and the
// waiters' tablets open it in a plain browser at http://<this-pc>:<port>.
//
// Build:
//
//	go build -ldflags "-H windowsgui -s -w" -o RestaurantPOS.exe ./cmd/pos-desktop
//
// -H windowsgui is what stops a black console window appearing behind it.
package main

import (
	"fmt"
	"log"
	"os"
	"path/filepath"

	"pos-backend/internal/app"
	"pos-backend/internal/database"
	"pos-backend/internal/middleware"
)

const (
	appTitle = "نظام كاشير المطاعم"
	dbName   = "pos_system"
	dbUser   = "postgres"
	// 5433, never the standard 5432: a customer may already run PostgreSQL.
	dbPort = "5433"

	// bom heads the text files this program leaves for the user; without it
	// Notepad reads their Arabic as mojibake. Written as an escape, never as a
	// literal: Go rejects a byte-order mark in the middle of a source file.
	bom = "\uFEFF"
)

func main() {
	paths, err := resolvePaths()
	if err != nil {
		fatal("تعذّر تحديد مجلدات البرنامج", err)
		return
	}

	// Log to a file. There is no console -- -H windowsgui detaches us from one --
	// so anything written to stderr would vanish, and every support call would
	// begin with "it just doesn't open".
	if lf, err := os.OpenFile(paths.LogFile, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o644); err == nil {
		defer lf.Close()
		log.SetOutput(lf)
	}
	log.Printf("---- starting: app=%s data=%s", paths.AppDir, paths.DataDir)

	// A second copy would fight the first over the database and the port.
	release, err := acquireSingleInstance()
	if err != nil {
		focusExistingWindow()
		return
	}
	defer release()

	pg, err := startDatabase(paths)
	if err != nil {
		fatal("لم تبدأ قاعدة البيانات", err)
		return
	}
	defer pg.Stop()

	// The backup screen shells out to pg_dump; tell it where ours lives and
	// where the customer's dumps belong. Both must be set before app.Start
	// constructs the backup service.
	os.Setenv("PG_BIN_DIR", paths.PgBinDir)
	os.Setenv("BACKUP_DIR", paths.BackupDir)

	// The signing key must live with the data, not beside the binary: an
	// installed program folder is read-only for the person using the till.
	middleware.SetJWTKeyPath(filepath.Join(paths.DataDir, "jwt.key"))

	a, err := app.Start(app.Config{
		DB: database.Config{
			Host:     "127.0.0.1",
			Port:     dbPort,
			User:     dbUser,
			Password: pg.Password(),
			DBName:   dbName,
			SSLMode:  "disable",
		},
		WebDir:         paths.WebDir,
		PortCandidates: []string{"8080", "8081", "8082", "8090", "8095"},
	})
	if err != nil {
		fatal("لم يبدأ البرنامج", err)
		return
	}
	defer a.Shutdown()

	log.Printf("serving on %s", a.LocalURL())
	writeAddressFile(paths, a.Port())

	// Blocks until the user closes the window.
	profile := filepath.Join(paths.DataDir, "webview")
	if err := openWindow(appTitle, a.LocalURL(), profile); err != nil {
		log.Printf("no window: %v", err)
		browserFallback(a.LocalURL(), err)
	}
	log.Println("---- window closed, shutting down")
}

// writeAddressFile leaves the network address on disk so the owner can read it
// off the till and type it into the kitchen screen, instead of hunting through
// ipconfig. The file name is ASCII on purpose; the content is Arabic.
func writeAddressFile(p paths, port string) {
	body := fmt.Sprintf(
		"العنوان على هذا الجهاز:\r\n    http://localhost:%s\r\n\r\n"+
			"من أي جهاز آخر على نفس شبكة المطعم:\r\n%s\r\n",
		port, lanURLs(port),
	)
	path := filepath.Join(p.DataDir, "network-address.txt")
	if err := os.WriteFile(path, []byte(bom+body), 0o644); err != nil {
		log.Printf("could not write %s: %v", path, err)
	}
}

func fatal(title string, err error) {
	log.Printf("FATAL: %s: %v", title, err)
	showError(title, err.Error())
}
