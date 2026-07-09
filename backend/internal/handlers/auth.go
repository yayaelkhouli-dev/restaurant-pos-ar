package handlers

import (
	"database/sql"
	"net/http"

	"pos-backend/internal/middleware"
	"pos-backend/internal/models"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"
)

type AuthHandler struct {
	db *sql.DB
}

func NewAuthHandler(db *sql.DB) *AuthHandler {
	return &AuthHandler{db: db}
}

// Login handles user authentication
func (h *AuthHandler) Login(c *gin.Context) {
	var req models.LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.APIResponse{
			Success: false,
			Message: "Invalid request body",
			Error:   stringPtr(err.Error()),
		})
		return
	}

	// Validate input
	if req.Username == "" || req.Password == "" {
		c.JSON(http.StatusBadRequest, models.APIResponse{
			Success: false,
			Message: "Username and password are required",
			Error:   stringPtr("missing_credentials"),
		})
		return
	}

	// Get user from database
	var user models.User
	query := `
		SELECT id, username, email, password_hash, first_name, last_name, role, is_active,
		       COALESCE(must_change_password, false), created_at, updated_at
		FROM users
		WHERE username = $1 AND is_active = true
	`

	err := h.db.QueryRow(query, req.Username).Scan(
		&user.ID, &user.Username, &user.Email, &user.PasswordHash,
		&user.FirstName, &user.LastName, &user.Role, &user.IsActive,
		&user.MustChangePassword, &user.CreatedAt, &user.UpdatedAt,
	)

	if err == sql.ErrNoRows {
		c.JSON(http.StatusUnauthorized, models.APIResponse{
			Success: false,
			Message: "Invalid username or password",
			Error:   stringPtr("invalid_credentials"),
		})
		return
	}

	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{
			Success: false,
			Message: "Database error",
			Error:   stringPtr(err.Error()),
		})
		return
	}

	// Verify password
	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)); err != nil {
		c.JSON(http.StatusUnauthorized, models.APIResponse{
			Success: false,
			Message: "Invalid username or password",
			Error:   stringPtr("invalid_credentials"),
		})
		return
	}

	// Generate JWT token
	token, err := middleware.GenerateToken(&user)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{
			Success: false,
			Message: "Failed to generate token",
			Error:   stringPtr(err.Error()),
		})
		return
	}

	// Return successful login response
	c.JSON(http.StatusOK, models.APIResponse{
		Success: true,
		Message: "Login successful",
		Data: models.LoginResponse{
			Token: token,
			User:  user,
		},
	})
}

// GetCurrentUser returns the current authenticated user
func (h *AuthHandler) GetCurrentUser(c *gin.Context) {
	userID, _, _, ok := middleware.GetUserFromContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, models.APIResponse{
			Success: false,
			Message: "Authentication required",
			Error:   stringPtr("auth_required"),
		})
		return
	}

	// Get user from database
	var user models.User
	query := `
		SELECT id, username, email, first_name, last_name, role, is_active,
		       COALESCE(must_change_password, false), created_at, updated_at
		FROM users
		WHERE id = $1
	`

	err := h.db.QueryRow(query, userID).Scan(
		&user.ID, &user.Username, &user.Email,
		&user.FirstName, &user.LastName, &user.Role, &user.IsActive,
		&user.MustChangePassword, &user.CreatedAt, &user.UpdatedAt,
	)

	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, models.APIResponse{
			Success: false,
			Message: "User not found",
			Error:   stringPtr("user_not_found"),
		})
		return
	}

	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{
			Success: false,
			Message: "Database error",
			Error:   stringPtr(err.Error()),
		})
		return
	}

	c.JSON(http.StatusOK, models.APIResponse{
		Success: true,
		Message: "User retrieved successfully",
		Data:    user,
	})
}

// ChangePassword lets an authenticated user change their own password.
// Verifies the current password, enforces a minimum length, then clears the
// must_change_password flag.
func (h *AuthHandler) ChangePassword(c *gin.Context) {
	userID, _, _, ok := middleware.GetUserFromContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, models.APIResponse{Success: false, Message: "Authentication required", Error: stringPtr("auth_required")})
		return
	}

	var req struct {
		CurrentPassword string `json:"current_password"`
		NewPassword     string `json:"new_password"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: "Invalid request body", Error: stringPtr(err.Error())})
		return
	}
	if len(req.NewPassword) < 6 {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: "كلمة السر الجديدة يجب أن تكون 6 أحرف على الأقل", Error: stringPtr("password_too_short")})
		return
	}
	if req.NewPassword == req.CurrentPassword {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: "كلمة السر الجديدة يجب أن تختلف عن الحالية", Error: stringPtr("password_unchanged")})
		return
	}

	var currentHash string
	if err := h.db.QueryRow(`SELECT password_hash FROM users WHERE id = $1 AND is_active = true`, userID).Scan(&currentHash); err != nil {
		c.JSON(http.StatusUnauthorized, models.APIResponse{Success: false, Message: "User not found", Error: stringPtr("user_not_found")})
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(currentHash), []byte(req.CurrentPassword)); err != nil {
		c.JSON(http.StatusUnauthorized, models.APIResponse{Success: false, Message: "كلمة السر الحالية غير صحيحة", Error: stringPtr("invalid_current_password")})
		return
	}

	newHash, err := bcrypt.GenerateFromPassword([]byte(req.NewPassword), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to hash password", Error: stringPtr(err.Error())})
		return
	}

	if _, err := h.db.Exec(
		`UPDATE users SET password_hash = $1, must_change_password = false, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
		string(newHash), userID,
	); err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to update password", Error: stringPtr(err.Error())})
		return
	}

	c.JSON(http.StatusOK, models.APIResponse{Success: true, Message: "تم تغيير كلمة السر بنجاح"})
}

// Logout handles user logout (in a stateless JWT system, this is mainly client-side)
func (h *AuthHandler) Logout(c *gin.Context) {
	// In a stateless JWT system, logout is handled client-side by removing the token
	// For additional security, you could implement a token blacklist here
	c.JSON(http.StatusOK, models.APIResponse{
		Success: true,
		Message: "Logout successful",
	})
}

// Helper function to create string pointer
func stringPtr(s string) *string {
	return &s
}

