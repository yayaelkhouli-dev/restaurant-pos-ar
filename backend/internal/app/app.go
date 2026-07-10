// Package app wires the database, the API and the web UI into one HTTP server.
//
// Both entry points use it: the headless pos-backend.exe used in development,
// and the desktop RestaurantPOS.exe that the customer installs. Keeping the
// wiring in one place means the product a customer runs is the same program the
// developer tested.
package app

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"pos-backend/internal/api"
	"pos-backend/internal/backup"
	"pos-backend/internal/database"
	"pos-backend/internal/middleware"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	_ "github.com/lib/pq"
)

type Config struct {
	DB     database.Config
	Port   string // "" means: pick the first free port from PortCandidates
	WebDir string // built frontend; empty or missing means API only

	// PortCandidates is tried in order when Port is empty. 8080 is popular
	// enough that something else may already own it on a customer's PC.
	PortCandidates []string
}

type App struct {
	db     *sql.DB
	http   *http.Server
	port   string
	cancel context.CancelFunc
}

func (a *App) Port() string { return a.port }

// LocalURL is what the desktop window and this machine's browser open.
func (a *App) LocalURL() string { return "http://127.0.0.1:" + a.port }

// Start opens the database, mounts the API and the UI, and begins serving.
// It returns once the listener is bound, so the caller may open a window
// against LocalURL immediately.
func Start(cfg Config) (*App, error) {
	db, err := database.Connect(cfg.DB)
	if err != nil {
		return nil, fmt.Errorf("تعذّر الاتصال بقاعدة البيانات: %w", err)
	}
	if err := db.Ping(); err != nil {
		db.Close()
		return nil, fmt.Errorf("قاعدة البيانات لا تستجيب: %w", err)
	}

	backupSvc := backup.New(db, backup.DBConfig{
		Host:     cfg.DB.Host,
		Port:     cfg.DB.Port,
		User:     cfg.DB.User,
		Password: cfg.DB.Password,
		DBName:   cfg.DB.DBName,
	})
	if backupSvc.Ready() {
		log.Printf("Backups enabled, writing to %s", backupSvc.BackupDir())
	} else {
		log.Println("WARNING: pg_dump was not found — backups are unavailable.")
	}
	ctx, cancel := context.WithCancel(context.Background())
	backupSvc.StartScheduler(ctx)

	// Bind before anything else can take the port, so the URL we hand back is
	// one the window can actually reach.
	ln, port, err := listen(cfg)
	if err != nil {
		cancel()
		db.Close()
		return nil, err
	}

	router := buildRouter(db, backupSvc, cfg.WebDir)
	srv := &http.Server{Handler: router}

	a := &App{db: db, http: srv, port: port, cancel: cancel}
	go func() {
		if err := srv.Serve(ln); err != nil && err != http.ErrServerClosed {
			log.Printf("http server stopped: %v", err)
		}
	}()
	log.Printf("Serving on port %s", port)
	return a, nil
}

// listen binds 0.0.0.0 so the kitchen screen and the waiters' tablets can reach
// the POS across the restaurant's own network.
func listen(cfg Config) (net.Listener, string, error) {
	candidates := cfg.PortCandidates
	if cfg.Port != "" {
		candidates = []string{cfg.Port}
	}
	if len(candidates) == 0 {
		candidates = []string{"8080", "8081", "8082", "8090", "8095"}
	}
	var lastErr error
	for _, p := range candidates {
		ln, err := net.Listen("tcp", ":"+p)
		if err == nil {
			return ln, p, nil
		}
		lastErr = err
	}
	return nil, "", fmt.Errorf("كل المنافذ مشغولة (%s): %v", strings.Join(candidates, ", "), lastErr)
}

func (a *App) Shutdown() {
	a.cancel()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	a.http.Shutdown(ctx)
	a.db.Close()
}

func buildRouter(db *sql.DB, backupSvc *backup.Service, webDir string) *gin.Engine {
	gin.SetMode(getEnv("GIN_MODE", "release"))
	router := gin.New()
	router.Use(gin.Logger(), gin.Recovery())
	router.Use(cors.New(cors.Config{
		AllowOrigins:     []string{"http://localhost:3000", "http://localhost:5173"},
		AllowMethods:     []string{"GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Content-Length", "Accept-Encoding", "X-CSRF-Token", "Authorization", "accept", "origin", "Cache-Control", "X-Requested-With"},
		AllowCredentials: true,
	}))

	router.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "healthy", "message": "POS API is running"})
	})

	api.SetupRoutes(router.Group("/api/v1"), db, middleware.AuthMiddleware(), backupSvc)
	serveWebUI(router, webDir)
	return router
}

// serveWebUI serves the static bundle and falls back to index.html for any path
// the API did not claim, because the router lives in the browser: a refresh on
// /admin/counter must return the app, not a 404.
func serveWebUI(router *gin.Engine, dir string) {
	if dir == "" {
		return
	}
	index := filepath.Join(dir, "index.html")
	if st, err := os.Stat(index); err != nil || st.IsDir() {
		log.Printf("No web UI at %s — serving API only", dir)
		return
	}
	log.Printf("Serving web UI from %s", dir)

	router.Static("/assets", filepath.Join(dir, "assets"))
	router.StaticFile("/favicon.ico", filepath.Join(dir, "favicon.ico"))

	router.NoRoute(func(c *gin.Context) {
		p := c.Request.URL.Path
		if strings.HasPrefix(p, "/api/") || strings.HasPrefix(p, "/health") {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "message": "Not found"})
			return
		}
		c.File(index)
	})
}

func getEnv(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}
