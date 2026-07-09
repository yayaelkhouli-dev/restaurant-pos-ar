package handlers

import (
	"database/sql"
	"net/http"

	"github.com/gin-gonic/gin"
)

// SettingsHandler manages system settings (إعدادات النظام)
type SettingsHandler struct {
	db *sql.DB
}

func NewSettingsHandler(db *sql.DB) *SettingsHandler {
	return &SettingsHandler{db: db}
}

// GetSettings returns all settings as a key/value map
func (h *SettingsHandler) GetSettings(c *gin.Context) {
	rows, err := h.db.Query(`SELECT key, value FROM settings`)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Failed to fetch settings", "error": err.Error()})
		return
	}
	defer rows.Close()

	settings := make(map[string]string)
	for rows.Next() {
		var k string
		var v sql.NullString
		if err := rows.Scan(&k, &v); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Failed to scan setting", "error": err.Error()})
			return
		}
		settings[k] = v.String
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "message": "Settings retrieved successfully", "data": settings})
}

// publicSettingKeys are the display-safe settings any authenticated user may read
// (needed by the cashier/waiter screens for tax preview and receipt printing).
var publicSettingKeys = map[string]bool{
	"restaurant_name": true,
	"currency":        true,
	"tax_rate":        true,
	"service_charge":  true,
	"receipt_header":  true,
	"receipt_footer":  true,
	"receipt_width":   true, // thermal paper width in mm (58 or 80)
	"language":        true,
	"phone":           true,
	"address":         true,
}

// GetPublicSettings returns only the whitelisted display settings.
// Accessible to every authenticated role (not just admin/manager).
func (h *SettingsHandler) GetPublicSettings(c *gin.Context) {
	rows, err := h.db.Query(`SELECT key, value FROM settings`)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Failed to fetch settings", "error": err.Error()})
		return
	}
	defer rows.Close()

	settings := make(map[string]string)
	for rows.Next() {
		var k string
		var v sql.NullString
		if err := rows.Scan(&k, &v); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Failed to scan setting", "error": err.Error()})
			return
		}
		if publicSettingKeys[k] {
			settings[k] = v.String
		}
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "message": "Settings retrieved successfully", "data": settings})
}

// UpdateSettings upserts every key/value pair from the request body
func (h *SettingsHandler) UpdateSettings(c *gin.Context) {
	var body map[string]string
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "Invalid request body", "error": err.Error()})
		return
	}

	tx, err := h.db.Begin()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Failed to start transaction", "error": err.Error()})
		return
	}
	defer tx.Rollback()

	for k, v := range body {
		if _, err := tx.Exec(`
			INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, CURRENT_TIMESTAMP)
			ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP
		`, k, v); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Failed to save setting", "error": err.Error()})
			return
		}
	}

	if err := tx.Commit(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Failed to commit settings", "error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "message": "تم حفظ الإعدادات بنجاح"})
}
