package handlers

import (
	"database/sql"
	"net/http"

	"pos-backend/internal/middleware"
	"pos-backend/internal/models"

	"github.com/gin-gonic/gin"
)

// ShiftHandler manages cash-drawer shifts and the end-of-day (Z) report.
type ShiftHandler struct {
	db *sql.DB
}

func NewShiftHandler(db *sql.DB) *ShiftHandler {
	return &ShiftHandler{db: db}
}

// rowQueryer is satisfied by both *sql.DB and *sql.Tx.
type rowQueryer interface {
	QueryRow(query string, args ...interface{}) *sql.Row
}

// currentShiftID returns the id of the single open shift, or nil when none is open.
// Returned as interface{} so it can be passed straight into a nullable SQL parameter.
func currentShiftID(q rowQueryer) interface{} {
	var id string
	if err := q.QueryRow(`SELECT id FROM shifts WHERE status = 'open' LIMIT 1`).Scan(&id); err != nil {
		return nil
	}
	return id
}

// OpenShift starts a new shift with a starting cash float.
func (h *ShiftHandler) OpenShift(c *gin.Context) {
	userID, _, _, ok := middleware.GetUserFromContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, models.APIResponse{Success: false, Message: "Authentication required", Error: stringPtr("auth_required")})
		return
	}

	var req struct {
		OpeningCash float64 `json:"opening_cash"`
		Notes       *string `json:"notes"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: "Invalid request body", Error: stringPtr(err.Error())})
		return
	}
	if req.OpeningCash < 0 {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: "النقدية الافتتاحية لا يمكن أن تكون بالسالب", Error: stringPtr("invalid_opening_cash")})
		return
	}

	var existing string
	if err := h.db.QueryRow(`SELECT id FROM shifts WHERE status = 'open' LIMIT 1`).Scan(&existing); err == nil {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: "هناك وردية مفتوحة بالفعل — أغلقها أولاً", Error: stringPtr("shift_already_open")})
		return
	}

	var id string
	if err := h.db.QueryRow(`
		INSERT INTO shifts (opened_by, opening_cash, notes, status)
		VALUES ($1, $2, $3, 'open') RETURNING id
	`, userID, req.OpeningCash, req.Notes).Scan(&id); err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to open shift", Error: stringPtr(err.Error())})
		return
	}

	c.JSON(http.StatusCreated, models.APIResponse{Success: true, Message: "تم فتح الوردية", Data: gin.H{"id": id}})
}

// GetCurrentShift returns the open shift (with live totals), or null when none is open.
func (h *ShiftHandler) GetCurrentShift(c *gin.Context) {
	var id string
	var openedAt string
	var openingCash float64
	var openedByName sql.NullString
	err := h.db.QueryRow(`
		SELECT s.id, s.opened_at, s.opening_cash, COALESCE(u.first_name || ' ' || u.last_name, u.username)
		FROM shifts s LEFT JOIN users u ON u.id = s.opened_by
		WHERE s.status = 'open' LIMIT 1
	`).Scan(&id, &openedAt, &openingCash, &openedByName)
	if err == sql.ErrNoRows {
		c.JSON(http.StatusOK, models.APIResponse{Success: true, Message: "No open shift", Data: nil})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to fetch shift", Error: stringPtr(err.Error())})
		return
	}

	netCash, expectedCash := h.cashPosition(id, openingCash)

	c.JSON(http.StatusOK, models.APIResponse{Success: true, Message: "Current shift", Data: gin.H{
		"id": id, "opened_at": openedAt, "opening_cash": openingCash,
		"opened_by": openedByName.String, "net_cash": netCash, "expected_cash": expectedCash,
		"status": "open",
	}})
}

// cashPosition returns the net cash movement of a shift and the expected drawer total.
// Refund rows are stored as negative amounts, so a plain SUM yields the net.
func (h *ShiftHandler) cashPosition(shiftID string, openingCash float64) (float64, float64) {
	var netCash float64
	h.db.QueryRow(`
		SELECT COALESCE(SUM(amount), 0) FROM payments
		WHERE shift_id = $1 AND payment_method = 'cash' AND status IN ('completed', 'refunded')
	`, shiftID).Scan(&netCash)
	return netCash, openingCash + netCash
}

// CloseShift closes the open shift, reconciling the counted cash against expectations.
func (h *ShiftHandler) CloseShift(c *gin.Context) {
	userID, _, _, ok := middleware.GetUserFromContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, models.APIResponse{Success: false, Message: "Authentication required", Error: stringPtr("auth_required")})
		return
	}

	var req struct {
		ClosingCash float64 `json:"closing_cash"`
		Notes       *string `json:"notes"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: "Invalid request body", Error: stringPtr(err.Error())})
		return
	}

	var id string
	var openingCash float64
	err := h.db.QueryRow(`SELECT id, opening_cash FROM shifts WHERE status = 'open' LIMIT 1`).Scan(&id, &openingCash)
	if err == sql.ErrNoRows {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: "لا توجد وردية مفتوحة", Error: stringPtr("no_open_shift")})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to fetch shift", Error: stringPtr(err.Error())})
		return
	}

	_, expectedCash := h.cashPosition(id, openingCash)
	difference := req.ClosingCash - expectedCash

	if _, err := h.db.Exec(`
		UPDATE shifts
		SET status = 'closed', closed_by = $1, closed_at = CURRENT_TIMESTAMP,
		    closing_cash = $2, expected_cash = $3, difference = $4,
		    notes = COALESCE($5, notes)
		WHERE id = $6
	`, userID, req.ClosingCash, expectedCash, difference, req.Notes, id); err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to close shift", Error: stringPtr(err.Error())})
		return
	}

	c.JSON(http.StatusOK, models.APIResponse{Success: true, Message: "تم إغلاق الوردية", Data: gin.H{
		"id": id, "expected_cash": expectedCash, "closing_cash": req.ClosingCash, "difference": difference,
	}})
}

// ListShifts returns recent shifts (newest first).
func (h *ShiftHandler) ListShifts(c *gin.Context) {
	rows, err := h.db.Query(`
		SELECT s.id, s.opened_at, s.closed_at, s.opening_cash, s.closing_cash, s.expected_cash,
		       s.difference, s.status, COALESCE(u.first_name || ' ' || u.last_name, u.username, '')
		FROM shifts s LEFT JOIN users u ON u.id = s.opened_by
		ORDER BY s.opened_at DESC LIMIT 100
	`)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to fetch shifts", Error: stringPtr(err.Error())})
		return
	}
	defer rows.Close()

	list := make([]map[string]interface{}, 0)
	for rows.Next() {
		var id, status, openedBy string
		var openedAt string
		var closedAt sql.NullString
		var openingCash float64
		var closingCash, expectedCash, difference sql.NullFloat64
		if err := rows.Scan(&id, &openedAt, &closedAt, &openingCash, &closingCash, &expectedCash, &difference, &status, &openedBy); err != nil {
			c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to scan shift", Error: stringPtr(err.Error())})
			return
		}
		list = append(list, map[string]interface{}{
			"id": id, "opened_at": openedAt, "closed_at": closedAt.String, "opening_cash": openingCash,
			"closing_cash": closingCash.Float64, "expected_cash": expectedCash.Float64,
			"difference": difference.Float64, "status": status, "opened_by": openedBy,
		})
	}
	c.JSON(http.StatusOK, models.APIResponse{Success: true, Message: "Shifts retrieved", Data: list})
}

// GetShiftReport builds the Z-report (تقرير آخر اليوم) for a shift.
func (h *ShiftHandler) GetShiftReport(c *gin.Context) {
	shiftID := c.Param("id")

	var status, openedAt, openedBy string
	var closedAt sql.NullString
	var openingCash float64
	var closingCash, storedExpected, storedDiff sql.NullFloat64
	err := h.db.QueryRow(`
		SELECT s.status, s.opened_at, s.closed_at, s.opening_cash, s.closing_cash, s.expected_cash, s.difference,
		       COALESCE(u.first_name || ' ' || u.last_name, u.username, '')
		FROM shifts s LEFT JOIN users u ON u.id = s.opened_by
		WHERE s.id = $1
	`, shiftID).Scan(&status, &openedAt, &closedAt, &openingCash, &closingCash, &storedExpected, &storedDiff, &openedBy)
	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, models.APIResponse{Success: false, Message: "Shift not found", Error: stringPtr("shift_not_found")})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to fetch shift", Error: stringPtr(err.Error())})
		return
	}

	// Payment breakdown by method (refund rows carry negative amounts)
	payRows, err := h.db.Query(`
		SELECT payment_method,
		       COALESCE(SUM(CASE WHEN status = 'completed' THEN amount ELSE 0 END), 0) AS collected,
		       COALESCE(SUM(CASE WHEN status = 'refunded'  THEN amount ELSE 0 END), 0) AS refunded
		FROM payments WHERE shift_id = $1
		GROUP BY payment_method ORDER BY payment_method
	`, shiftID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to fetch payments", Error: stringPtr(err.Error())})
		return
	}
	defer payRows.Close()

	methods := make([]map[string]interface{}, 0)
	var totalCollected, totalRefunded float64
	for payRows.Next() {
		var method string
		var collected, refunded float64
		if err := payRows.Scan(&method, &collected, &refunded); err != nil {
			c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to scan payment", Error: stringPtr(err.Error())})
			return
		}
		totalCollected += collected
		totalRefunded += refunded
		methods = append(methods, map[string]interface{}{
			"payment_method": method, "collected": collected, "refunded": refunded, "net": collected + refunded,
		})
	}

	// Sales figures for the orders settled during this shift
	var ordersCount int
	var subtotal, discount, tax, deliveryFee, total float64
	h.db.QueryRow(`
		SELECT COUNT(*), COALESCE(SUM(subtotal),0), COALESCE(SUM(discount_amount),0),
		       COALESCE(SUM(tax_amount),0), COALESCE(SUM(delivery_fee),0), COALESCE(SUM(total_amount),0)
		FROM orders
		WHERE id IN (SELECT DISTINCT order_id FROM payments WHERE shift_id = $1 AND status = 'completed')
	`, shiftID).Scan(&ordersCount, &subtotal, &discount, &tax, &deliveryFee, &total)

	// Cash reconciliation: use stored values for a closed shift, live values while open
	netCash, expectedCash := h.cashPosition(shiftID, openingCash)
	cash := gin.H{"opening_cash": openingCash, "net_cash": netCash, "expected_cash": expectedCash}
	if status == "closed" {
		cash["expected_cash"] = storedExpected.Float64
		cash["closing_cash"] = closingCash.Float64
		cash["difference"] = storedDiff.Float64
	}

	c.JSON(http.StatusOK, models.APIResponse{Success: true, Message: "Z-report", Data: gin.H{
		"shift": gin.H{
			"id": shiftID, "status": status, "opened_at": openedAt,
			"closed_at": closedAt.String, "opened_by": openedBy,
		},
		"sales": gin.H{
			"orders_count": ordersCount, "subtotal": subtotal, "discount_amount": discount,
			"tax_amount": tax, "delivery_fee": deliveryFee, "total_amount": total,
		},
		"payments": gin.H{
			"methods": methods, "total_collected": totalCollected,
			"total_refunded": totalRefunded, "net": totalCollected + totalRefunded,
		},
		"cash": cash,
	}})
}
