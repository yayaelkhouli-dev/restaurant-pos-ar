package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"pos-backend/internal/api"
	"pos-backend/internal/backup"
	"pos-backend/internal/database"
	"pos-backend/internal/middleware"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
	_ "github.com/lib/pq"
)

func main() {
	// Load environment variables
	if err := godotenv.Load(); err != nil {
		log.Println("No .env file found, using environment variables")
	}

	// Database configuration
	dbConfig := database.Config{
		Host:     getEnv("DB_HOST", "postgres"),
		Port:     getEnv("DB_PORT", "5432"),
		User:     getEnv("DB_USER", "postgres"),
		Password: getEnv("DB_PASSWORD", "postgres123"),
		DBName:   getEnv("DB_NAME", "pos_system"),
		SSLMode:  getEnv("DB_SSLMODE", "disable"),
	}

	// Initialize database connection
	db, err := database.Connect(dbConfig)
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer db.Close()

	// Test database connection
	if err := db.Ping(); err != nil {
		log.Fatalf("Failed to ping database: %v", err)
	}

	log.Println("Successfully connected to database")

	// Backups. The scheduler is a no-op until an admin turns it on in the UI.
	backupSvc := backup.New(db, backup.DBConfig{
		Host:     dbConfig.Host,
		Port:     dbConfig.Port,
		User:     dbConfig.User,
		Password: dbConfig.Password,
		DBName:   dbConfig.DBName,
	})
	if backupSvc.Ready() {
		log.Printf("Backups enabled, writing to %s", backupSvc.BackupDir())
	} else {
		log.Println("WARNING: pg_dump was not found — backups are unavailable. Set PG_BIN_DIR.")
	}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	backupSvc.StartScheduler(ctx)

	// Initialize Gin router
	gin.SetMode(getEnv("GIN_MODE", "release"))
	router := gin.New()

	// Add middleware
	router.Use(gin.Logger())
	router.Use(gin.Recovery())
	router.Use(cors.New(cors.Config{
		AllowOrigins:     []string{"http://localhost:3000", "http://localhost:3001", "http://localhost:3002", "http://localhost:3003", "http://localhost:5173"},
		AllowMethods:     []string{"GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Content-Length", "Accept-Encoding", "X-CSRF-Token", "Authorization", "accept", "origin", "Cache-Control", "X-Requested-With"},
		AllowCredentials: true,
	}))

	// Add authentication middleware to protected routes
	authMiddleware := middleware.AuthMiddleware()

	// Health check endpoint
	router.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "healthy", "message": "POS API is running"})
	})

	// Initialize API routes
	apiRoutes := router.Group("/api/v1")
	api.SetupRoutes(apiRoutes, db, authMiddleware, backupSvc)

	// Serve the built frontend when it sits next to the binary. This is how the
	// packaged product runs: one process, one port, no Node.js. In development
	// the folder is absent and Vite serves the UI on :3000 instead.
	serveWebUI(router, webDir())

	// Start server
	port := getEnv("PORT", "8080")
	log.Printf("Starting server on port %s", port)

	if err := router.Run(":" + port); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
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

// serveWebUI serves the static bundle and falls back to index.html for any path
// the API did not claim, because the router lives in the browser: a refresh on
// /admin/counter must return the app, not a 404.
func serveWebUI(router *gin.Engine, dir string) {
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

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}
