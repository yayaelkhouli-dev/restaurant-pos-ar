package middleware

import (
	"crypto/rand"
	"encoding/base64"
	"log"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"pos-backend/internal/models"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

// jwtSecret is resolved once at startup, in order of preference:
//  1. the JWT_SECRET environment variable (recommended for production),
//  2. a persisted key file (jwt.key) next to the binary,
//  3. a freshly generated random secret, which is then saved to jwt.key.
// This guarantees every installation has its own unique, stable signing key
// instead of a hardcoded value shared across all copies.
var jwtSecret = loadJWTSecret()

func loadJWTSecret() []byte {
	if s := os.Getenv("JWT_SECRET"); s != "" {
		return []byte(s)
	}
	const keyFile = "jwt.key"
	if data, err := os.ReadFile(keyFile); err == nil && len(data) >= 32 {
		return data
	}
	buf := make([]byte, 48)
	if _, err := rand.Read(buf); err != nil {
		log.Printf("WARNING: could not generate a random JWT secret: %v", err)
		return []byte("insecure-temporary-secret-please-set-JWT_SECRET")
	}
	secret := []byte(base64.StdEncoding.EncodeToString(buf))
	if err := os.WriteFile(keyFile, secret, 0600); err != nil {
		log.Printf("WARNING: could not persist JWT secret to %s: %v", keyFile, err)
	} else {
		log.Printf("Generated a new random JWT secret and saved it to %s", keyFile)
	}
	return secret
}

// Claims represents the JWT claims
type Claims struct {
	UserID   uuid.UUID `json:"user_id"`
	Username string    `json:"username"`
	Role     string    `json:"role"`
	jwt.RegisteredClaims
}

// GenerateToken generates a JWT token for a user
func GenerateToken(user *models.User) (string, error) {
	// Set token expiration time (24 hours)
	expirationTime := time.Now().Add(24 * time.Hour)

	// Create claims
	claims := &Claims{
		UserID:   user.ID,
		Username: user.Username,
		Role:     user.Role,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(expirationTime),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			Issuer:    "pos-system",
		},
	}

	// Create token
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)

	// Sign token with secret
	tokenString, err := token.SignedString(jwtSecret)
	if err != nil {
		return "", err
	}

	return tokenString, nil
}

// ValidateToken validates a JWT token and returns the claims
func ValidateToken(tokenString string) (*Claims, error) {
	// Parse token
	token, err := jwt.ParseWithClaims(tokenString, &Claims{}, func(token *jwt.Token) (interface{}, error) {
		return jwtSecret, nil
	})

	if err != nil {
		return nil, err
	}

	// Check if token is valid
	if claims, ok := token.Claims.(*Claims); ok && token.Valid {
		return claims, nil
	}

	return nil, jwt.ErrInvalidKey
}

// AuthMiddleware returns a gin middleware function for JWT authentication
func AuthMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		// Get token from Authorization header
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			c.JSON(http.StatusUnauthorized, models.APIResponse{
				Success: false,
				Message: "Authorization header is required",
				Error:   stringPtr("missing_auth_header"),
			})
			c.Abort()
			return
		}

		// Check if header starts with "Bearer "
		if !strings.HasPrefix(authHeader, "Bearer ") {
			c.JSON(http.StatusUnauthorized, models.APIResponse{
				Success: false,
				Message: "Invalid authorization header format",
				Error:   stringPtr("invalid_auth_format"),
			})
			c.Abort()
			return
		}

		// Extract token
		tokenString := strings.TrimPrefix(authHeader, "Bearer ")

		// Validate token
		claims, err := ValidateToken(tokenString)
		if err != nil {
			c.JSON(http.StatusUnauthorized, models.APIResponse{
				Success: false,
				Message: "Invalid or expired token",
				Error:   stringPtr("invalid_token"),
			})
			c.Abort()
			return
		}

		// Set user information in context
		c.Set("user_id", claims.UserID)
		c.Set("username", claims.Username)
		c.Set("role", claims.Role)

		c.Next()
	}
}

// RequireRole returns a middleware that checks if the user has the required role
func RequireRole(requiredRole string) gin.HandlerFunc {
	return func(c *gin.Context) {
		role, exists := c.Get("role")
		if !exists {
			c.JSON(http.StatusForbidden, models.APIResponse{
				Success: false,
				Message: "Role information not found",
				Error:   stringPtr("missing_role"),
			})
			c.Abort()
			return
		}

		userRole, ok := role.(string)
		if !ok || userRole != requiredRole {
			c.JSON(http.StatusForbidden, models.APIResponse{
				Success: false,
				Message: "Insufficient permissions",
				Error:   stringPtr("insufficient_permissions"),
			})
			c.Abort()
			return
		}

		c.Next()
	}
}

// RequireRoles returns a middleware that checks if the user has any of the required roles
func RequireRoles(requiredRoles []string) gin.HandlerFunc {
	return func(c *gin.Context) {
		role, exists := c.Get("role")
		if !exists {
			c.JSON(http.StatusForbidden, models.APIResponse{
				Success: false,
				Message: "Role information not found",
				Error:   stringPtr("missing_role"),
			})
			c.Abort()
			return
		}

		userRole, ok := role.(string)
		if !ok {
			c.JSON(http.StatusForbidden, models.APIResponse{
				Success: false,
				Message: "Invalid role information",
				Error:   stringPtr("invalid_role"),
			})
			c.Abort()
			return
		}

		// Check if user role is in the required roles
		hasPermission := false
		for _, requiredRole := range requiredRoles {
			if userRole == requiredRole {
				hasPermission = true
				break
			}
		}

		if !hasPermission {
			c.JSON(http.StatusForbidden, models.APIResponse{
				Success: false,
				Message: "Insufficient permissions",
				Error:   stringPtr("insufficient_permissions"),
			})
			c.Abort()
			return
		}

		c.Next()
	}
}

// GetUserFromContext extracts user information from gin context
func GetUserFromContext(c *gin.Context) (uuid.UUID, string, string, bool) {
	userID, userIDExists := c.Get("user_id")
	username, usernameExists := c.Get("username")
	role, roleExists := c.Get("role")

	if !userIDExists || !usernameExists || !roleExists {
		return uuid.Nil, "", "", false
	}

	id, idOk := userID.(uuid.UUID)
	name, nameOk := username.(string)
	userRole, roleOk := role.(string)

	if !idOk || !nameOk || !roleOk {
		return uuid.Nil, "", "", false
	}

	return id, name, userRole, true
}

// RateLimit is a simple fixed-window, per-client-IP rate limiter (in-memory).
// It is used to throttle brute-force attempts on sensitive endpoints (e.g. login).
func RateLimit(maxRequests int, window time.Duration) gin.HandlerFunc {
	type bucket struct {
		count int
		reset time.Time
	}
	var mu sync.Mutex
	clients := make(map[string]*bucket)

	return func(c *gin.Context) {
		ip := c.ClientIP()
		now := time.Now()

		mu.Lock()
		b, ok := clients[ip]
		if !ok || now.After(b.reset) {
			b = &bucket{count: 0, reset: now.Add(window)}
			clients[ip] = b
		}
		b.count++
		count := b.count
		// Opportunistic cleanup so the map does not grow unbounded.
		if len(clients) > 5000 {
			for k, v := range clients {
				if now.After(v.reset) {
					delete(clients, k)
				}
			}
		}
		mu.Unlock()

		if count > maxRequests {
			c.JSON(http.StatusTooManyRequests, models.APIResponse{
				Success: false,
				Message: "عدد كبير من المحاولات. برجاء الانتظار قليلاً ثم إعادة المحاولة.",
				Error:   stringPtr("rate_limited"),
			})
			c.Abort()
			return
		}
		c.Next()
	}
}

// Helper function to create string pointer
func stringPtr(s string) *string {
	return &s
}

