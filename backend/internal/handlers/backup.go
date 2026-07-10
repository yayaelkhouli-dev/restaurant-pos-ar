package handlers

import (
	"net/http"

	"pos-backend/internal/backup"
	"pos-backend/internal/middleware"

	"github.com/gin-gonic/gin"
)

// BackupHandler exposes the backup service over HTTP.
//
// Listing and creating a backup are open to admin and manager. Restoring and
// deleting are admin-only: a restore overwrites every order and payment in the
// system, and a manager should not be able to erase the trail of their own shift.
type BackupHandler struct {
	svc *backup.Service
}

func NewBackupHandler(svc *backup.Service) *BackupHandler {
	return &BackupHandler{svc: svc}
}

func requireAdmin(c *gin.Context) bool {
	_, _, role, ok := middleware.GetUserFromContext(c)
	if !ok || role != "admin" {
		c.JSON(http.StatusForbidden, gin.H{
			"success": false,
			"message": "هذه العملية متاحة لمدير النظام فقط",
		})
		return false
	}
	return true
}

// GetBackups lists the dumps on disk, newest first.
func (h *BackupHandler) GetBackups(c *gin.Context) {
	list, err := h.svc.List()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": "تعذّر قراءة مجلد النسخ الاحتياطية",
			"error":   err.Error(),
		})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "Backups retrieved successfully", "data": list})
}

// CreateBackup takes a backup right now.
func (h *BackupHandler) CreateBackup(c *gin.Context) {
	res, err := h.svc.Run()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}

	msg := "تم إنشاء نسخة احتياطية بنجاح"
	if res.ExternalError != "" {
		msg = "تم الحفظ على هذا الجهاز، لكن فشل النسخ للمكان الخارجي: " + res.ExternalError
	} else if res.ExternalPath != "" {
		msg = "تم إنشاء نسخة احتياطية، ونسخة ثانية في المكان الخارجي"
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": msg, "data": res})
}

// RestoreBackup replaces the live database with a chosen dump. Admin only, and
// only with an explicit confirmation flag — a stray click must not wipe a day's
// sales.
func (h *BackupHandler) RestoreBackup(c *gin.Context) {
	if !requireAdmin(c) {
		return
	}

	var req struct {
		Name    string `json:"name" binding:"required"`
		Confirm bool   `json:"confirm"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "طلب غير صالح", "error": err.Error()})
		return
	}
	if !req.Confirm {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "لا بد من تأكيد الاسترجاع صراحةً"})
		return
	}

	safety, err := h.svc.Restore(req.Name)
	if err != nil {
		body := gin.H{"success": false, "message": err.Error()}
		if safety != "" {
			body["data"] = gin.H{"safety_backup": safety}
		}
		c.JSON(http.StatusInternalServerError, body)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "تم استرجاع البيانات. أغلق البرنامج على كل الأجهزة وافتحه من جديد.",
		"data":    gin.H{"safety_backup": safety},
	})
}

// DeleteBackup removes one dump from this machine.
func (h *BackupHandler) DeleteBackup(c *gin.Context) {
	if !requireAdmin(c) {
		return
	}

	var req struct {
		Name string `json:"name" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "طلب غير صالح", "error": err.Error()})
		return
	}
	if err := h.svc.Delete(req.Name); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "تم حذف النسخة"})
}

// DownloadBackup streams a dump so it can be copied to a USB stick by hand.
func (h *BackupHandler) DownloadBackup(c *gin.Context) {
	name := c.Query("name")
	path, err := h.svc.Path(name)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"success": false, "message": err.Error()})
		return
	}
	c.FileAttachment(path, name)
}

// GetBackupSettings returns the schedule plus everything the screen needs to
// explain the current state (where dumps go, whether the tools were found,
// whether the external destination is reachable right now).
func (h *BackupHandler) GetBackupSettings(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "Backup settings retrieved successfully",
		"data":    h.svc.Status(),
	})
}

// UpdateBackupSettings validates and stores the schedule.
func (h *BackupHandler) UpdateBackupSettings(c *gin.Context) {
	if !requireAdmin(c) {
		return
	}

	var req backup.Settings
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "طلب غير صالح", "error": err.Error()})
		return
	}
	if err := h.svc.SaveSettings(req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "تم حفظ إعدادات النسخ الاحتياطي",
		"data":    h.svc.Status(),
	})
}
