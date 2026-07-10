// Command pos-backend runs the API and the web UI headless, reading its
// configuration from .env. This is the development entry point; the program a
// customer installs is cmd/pos-desktop, which additionally starts its own
// PostgreSQL and opens a window.
package main

import (
	"log"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"

	"pos-backend/internal/app"
	"pos-backend/internal/database"

	"github.com/joho/godotenv"
)

func main() {
	if err := godotenv.Load(); err != nil {
		log.Println("No .env file found, using environment variables")
	}

	a, err := app.Start(app.Config{
		DB: database.Config{
			Host:     getEnv("DB_HOST", "postgres"),
			Port:     getEnv("DB_PORT", "5432"),
			User:     getEnv("DB_USER", "postgres"),
			Password: getEnv("DB_PASSWORD", "postgres123"),
			DBName:   getEnv("DB_NAME", "pos_system"),
			SSLMode:  getEnv("DB_SSLMODE", "disable"),
		},
		Port:   getEnv("PORT", "8080"),
		WebDir: webDir(),
	})
	if err != nil {
		log.Fatalf("Failed to start: %v", err)
	}
	log.Printf("Listening on %s", a.LocalURL())

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)
	<-stop

	log.Println("Shutting down...")
	a.Shutdown()
}

func webDir() string {
	if d := os.Getenv("WEB_DIR"); d != "" {
		return d
	}
	if exe, err := os.Executable(); err == nil {
		return filepath.Join(filepath.Dir(exe), "web")
	}
	return "web"
}

func getEnv(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}
