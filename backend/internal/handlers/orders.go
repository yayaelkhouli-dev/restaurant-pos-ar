package handlers

import (
	"database/sql"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"pos-backend/internal/middleware"
	"pos-backend/internal/models"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type OrderHandler struct {
	db *sql.DB
}

func NewOrderHandler(db *sql.DB) *OrderHandler {
	return &OrderHandler{db: db}
}

// GetOrders retrieves all orders with pagination and filtering
func (h *OrderHandler) GetOrders(c *gin.Context) {
	// Parse query parameters
	page := 1
	perPage := 20
	status := c.Query("status")
	orderType := c.Query("order_type")

	if pageStr := c.Query("page"); pageStr != "" {
		if p, err := strconv.Atoi(pageStr); err == nil && p > 0 {
			page = p
		}
	}

	if perPageStr := c.Query("per_page"); perPageStr != "" {
		if pp, err := strconv.Atoi(perPageStr); err == nil && pp > 0 && pp <= 100 {
			perPage = pp
		}
	}

	offset := (page - 1) * perPage

	// Build query with filters
	queryBuilder := `
		SELECT DISTINCT o.id, o.order_number, o.table_id, o.user_id, o.customer_name,
		       o.customer_phone, o.delivery_address,
		       o.order_type, o.status, o.subtotal, o.tax_amount, o.discount_amount, o.delivery_fee,
		       o.total_amount, o.notes, o.created_at, o.updated_at, o.served_at, o.completed_at,
		       t.table_number, t.location,
		       u.username, u.first_name, u.last_name
		FROM orders o
		LEFT JOIN dining_tables t ON o.table_id = t.id
		LEFT JOIN users u ON o.user_id = u.id
		WHERE 1=1
	`

	var args []interface{}
	argIndex := 0

	// status may be a single value or a comma-separated list (e.g. "pending,confirmed,ready").
	// Split it and use IN(...) so multi-status filters from the counter/server screens work.
	if status != "" {
		placeholders := make([]string, 0)
		for _, p := range strings.Split(status, ",") {
			p = strings.TrimSpace(p)
			if p == "" {
				continue
			}
			argIndex++
			placeholders = append(placeholders, fmt.Sprintf("$%d", argIndex))
			args = append(args, p)
		}
		if len(placeholders) > 0 {
			queryBuilder += " AND o.status IN (" + strings.Join(placeholders, ", ") + ")"
		}
	}

	if orderType != "" {
		argIndex++
		queryBuilder += fmt.Sprintf(" AND o.order_type = $%d", argIndex)
		args = append(args, orderType)
	}

	// Count total records
	countQuery := "SELECT COUNT(*) FROM (" + queryBuilder + ") as count_query"
	var total int
	if err := h.db.QueryRow(countQuery, args...).Scan(&total); err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{
			Success: false,
			Message: "Failed to count orders",
			Error:   stringPtr(err.Error()),
		})
		return
	}

	// Add ordering and pagination
	argIndex++
	queryBuilder += fmt.Sprintf(" ORDER BY o.created_at DESC LIMIT $%d", argIndex)
	args = append(args, perPage)
	
	argIndex++
	queryBuilder += fmt.Sprintf(" OFFSET $%d", argIndex)
	args = append(args, offset)

	rows, err := h.db.Query(queryBuilder, args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{
			Success: false,
			Message: "Failed to fetch orders",
			Error:   stringPtr(err.Error()),
		})
		return
	}
	defer rows.Close()

	// Must be an empty slice, not a nil one: a nil slice marshals to JSON `null`
	// and the clients read `.length` straight off the array.
	orders := []models.Order{}
	for rows.Next() {
		var order models.Order
		var tableNumber, tableLocation sql.NullString
		var username, firstName, lastName sql.NullString

		err := rows.Scan(
			&order.ID, &order.OrderNumber, &order.TableID, &order.UserID, &order.CustomerName,
			&order.CustomerPhone, &order.DeliveryAddress,
			&order.OrderType, &order.Status, &order.Subtotal, &order.TaxAmount, &order.DiscountAmount, &order.DeliveryFee,
			&order.TotalAmount, &order.Notes, &order.CreatedAt, &order.UpdatedAt, &order.ServedAt, &order.CompletedAt,
			&tableNumber, &tableLocation,
			&username, &firstName, &lastName,
		)
		if err != nil {
			c.JSON(http.StatusInternalServerError, models.APIResponse{
				Success: false,
				Message: "Failed to scan order",
				Error:   stringPtr(err.Error()),
			})
			return
		}

		// Add table info if available
		if tableNumber.Valid {
			order.Table = &models.DiningTable{
				TableNumber: tableNumber.String,
				Location:    &tableLocation.String,
			}
		}

		// Add user info if available
		if username.Valid {
			order.User = &models.User{
				Username:  username.String,
				FirstName: firstName.String,
				LastName:  lastName.String,
			}
		}

		// Load order items
		if err := h.loadOrderItems(&order); err != nil {
			c.JSON(http.StatusInternalServerError, models.APIResponse{
				Success: false,
				Message: "Failed to load order items",
				Error:   stringPtr(err.Error()),
			})
			return
		}

		orders = append(orders, order)
	}

	totalPages := (total + perPage - 1) / perPage

	c.JSON(http.StatusOK, models.PaginatedResponse{
		Success: true,
		Message: "Orders retrieved successfully",
		Data:    orders,
		Meta: models.MetaData{
			CurrentPage: page,
			PerPage:     perPage,
			Total:       total,
			TotalPages:  totalPages,
		},
	})
}

// GetOrder retrieves a specific order by ID
func (h *OrderHandler) GetOrder(c *gin.Context) {
	orderID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, models.APIResponse{
			Success: false,
			Message: "Invalid order ID",
			Error:   stringPtr("invalid_uuid"),
		})
		return
	}

	order, err := h.getOrderByID(orderID)
	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, models.APIResponse{
			Success: false,
			Message: "Order not found",
			Error:   stringPtr("order_not_found"),
		})
		return
	}

	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{
			Success: false,
			Message: "Failed to fetch order",
			Error:   stringPtr(err.Error()),
		})
		return
	}

	c.JSON(http.StatusOK, models.APIResponse{
		Success: true,
		Message: "Order retrieved successfully",
		Data:    order,
	})
}

// CreateOrder creates a new order
func (h *OrderHandler) CreateOrder(c *gin.Context) {
	userID, _, _, ok := middleware.GetUserFromContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, models.APIResponse{
			Success: false,
			Message: "Authentication required",
			Error:   stringPtr("auth_required"),
		})
		return
	}

	var req models.CreateOrderRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.APIResponse{
			Success: false,
			Message: "Invalid request body",
			Error:   stringPtr(err.Error()),
		})
		return
	}

	// Validate request
	if len(req.Items) == 0 {
		c.JSON(http.StatusBadRequest, models.APIResponse{
			Success: false,
			Message: "Order must contain at least one item",
			Error:   stringPtr("empty_order"),
		})
		return
	}

	// Reject zero/negative quantities — they would reduce the order total (money loss)
	// and inflate ingredient stock on deduction.
	for _, item := range req.Items {
		if item.Quantity <= 0 {
			c.JSON(http.StatusBadRequest, models.APIResponse{
				Success: false,
				Message: "كمية الصنف يجب أن تكون أكبر من صفر",
				Error:   stringPtr("invalid_quantity"),
			})
			return
		}
	}

	// Start transaction
	tx, err := h.db.Begin()
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{
			Success: false,
			Message: "Failed to start transaction",
			Error:   stringPtr(err.Error()),
		})
		return
	}
	defer tx.Rollback()

	// Generate order number
	orderNumber := h.generateOrderNumber()

	// Price every line once: product price + modifier deltas
	var subtotal float64
	priced, perr := priceOrderItems(tx, req.Items)
	if perr != nil {
		respondPricingError(c, perr)
		return
	}
	for _, p := range priced {
		subtotal += p.totalPrice
	}

	// Apply an optional discount to the subtotal (before tax).
	discountAmount := 0.0
	if req.DiscountType != nil && req.DiscountValue != nil && *req.DiscountValue > 0 {
		switch *req.DiscountType {
		case "percent":
			pct := *req.DiscountValue
			if pct > 100 {
				pct = 100
			}
			discountAmount = subtotal * pct / 100.0
		case "amount":
			discountAmount = *req.DiscountValue
		default:
			c.JSON(http.StatusBadRequest, models.APIResponse{
				Success: false,
				Message: "نوع الخصم غير صحيح (percent أو amount)",
				Error:   stringPtr("invalid_discount_type"),
			})
			return
		}
		if discountAmount > subtotal {
			discountAmount = subtotal // never discount below zero
		}
	}
	discountedSubtotal := subtotal - discountAmount

	// Calculate tax — read the configured tax rate from settings (fallback 10%)
	taxRate := 0.10
	var taxStr string
	if err := tx.QueryRow(`SELECT value FROM settings WHERE key = 'tax_rate'`).Scan(&taxStr); err == nil {
		if v, perr := strconv.ParseFloat(taxStr, 64); perr == nil {
			taxRate = v / 100.0
		}
	}
	taxAmount := discountedSubtotal * taxRate

	// Optional delivery fee added on top of the total
	deliveryFee := 0.0
	if req.DeliveryFee != nil && *req.DeliveryFee > 0 {
		deliveryFee = *req.DeliveryFee
	}
	totalAmount := discountedSubtotal + taxAmount + deliveryFee

	// Create order
	orderID := uuid.New()
	orderQuery := `
		INSERT INTO orders (id, order_number, table_id, user_id, customer_name, customer_phone, delivery_address,
		                   order_type, status, subtotal, tax_amount, discount_amount, delivery_fee, total_amount, notes)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
	`

	// New orders are created as "confirmed" so they immediately appear on the kitchen
	// display (which shows confirmed/preparing/ready). "pending" would never reach the kitchen.
	_, err = tx.Exec(orderQuery, orderID, orderNumber, req.TableID, userID, req.CustomerName,
		req.CustomerPhone, req.DeliveryAddress, req.OrderType, "confirmed", subtotal, taxAmount,
		discountAmount, deliveryFee, totalAmount, req.Notes)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{
			Success: false,
			Message: "Failed to create order",
			Error:   stringPtr(err.Error()),
		})
		return
	}

	// Create order items (unit price already includes the chosen modifiers)
	for _, p := range priced {
		itemID := uuid.New()
		if _, err := tx.Exec(`
			INSERT INTO order_items (id, order_id, product_id, quantity, unit_price, total_price, special_instructions)
			VALUES ($1, $2, $3, $4, $5, $6, $7)
		`, itemID, orderID, p.productID, p.quantity, p.unitPrice, p.totalPrice, p.specialInstructions); err != nil {
			c.JSON(http.StatusInternalServerError, models.APIResponse{
				Success: false,
				Message: "Failed to create order item",
				Error:   stringPtr(err.Error()),
			})
			return
		}
		if err := insertItemModifiers(tx, itemID, p.mods); err != nil {
			c.JSON(http.StatusInternalServerError, models.APIResponse{
				Success: false,
				Message: "Failed to save item modifiers",
				Error:   stringPtr(err.Error()),
			})
			return
		}
	}

	// Update table status if dine-in
	if req.OrderType == "dine_in" && req.TableID != nil {
		_, err = tx.Exec("UPDATE dining_tables SET is_occupied = true WHERE id = $1", *req.TableID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, models.APIResponse{
				Success: false,
				Message: "Failed to update table status",
				Error:   stringPtr(err.Error()),
			})
			return
		}
	}

	// Commit transaction
	if err := tx.Commit(); err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{
			Success: false,
			Message: "Failed to commit transaction",
			Error:   stringPtr(err.Error()),
		})
		return
	}

	// Auto-deduct ingredient stock based on product recipes (non-fatal, never blocks the sale)
	DeductOrderStock(h.db, orderID, userID)

	// Fetch and return the created order
	order, err := h.getOrderByID(orderID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{
			Success: false,
			Message: "Order created but failed to fetch details",
			Error:   stringPtr(err.Error()),
		})
		return
	}

	c.JSON(http.StatusCreated, models.APIResponse{
		Success: true,
		Message: "Order created successfully",
		Data:    order,
	})
}

// orderStatusAr labels statuses for user-facing errors.
var orderStatusAr = map[string]string{
	"pending":   "في الانتظار",
	"confirmed": "مؤكّد",
	"preparing": "قيد التحضير",
	"ready":     "جاهز",
	"served":    "تم التقديم",
	"completed": "مكتمل",
	"cancelled": "ملغي",
}

// Which role may drive an order to which status. This endpoint sits on the
// plain authenticated group, so without this map any logged-in user — kitchen
// included — could cancel or complete anybody's order.
//
// "completed" is deliberately absent for EVERY role: an order becomes completed
// only when a payment covers it (see payments.ProcessPayment). Allowing a manual
// jump would let an order be closed with the cash never entering the drawer,
// silently breaking the shift's Z-report.
var allowedOrderStatusByRole = map[string]map[string]bool{
	"kitchen": {"preparing": true, "ready": true, "served": true},
	"server":  {"served": true},
	"counter": {"served": true, "cancelled": true},
	"manager": {"pending": true, "confirmed": true, "preparing": true, "ready": true, "served": true, "cancelled": true},
	"admin":   {"pending": true, "confirmed": true, "preparing": true, "ready": true, "served": true, "cancelled": true},
}

// UpdateOrderStatus updates the status of an order
func (h *OrderHandler) UpdateOrderStatus(c *gin.Context) {
	orderID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, models.APIResponse{
			Success: false,
			Message: "Invalid order ID",
			Error:   stringPtr("invalid_uuid"),
		})
		return
	}

	userID, _, role, ok := middleware.GetUserFromContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, models.APIResponse{
			Success: false,
			Message: "Authentication required",
			Error:   stringPtr("auth_required"),
		})
		return
	}

	var req models.UpdateOrderStatusRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.APIResponse{
			Success: false,
			Message: "Invalid request body",
			Error:   stringPtr(err.Error()),
		})
		return
	}

	// Validate status
	validStatuses := []string{"pending", "confirmed", "preparing", "ready", "served", "completed", "cancelled"}
	isValidStatus := false
	for _, status := range validStatuses {
		if req.Status == status {
			isValidStatus = true
			break
		}
	}

	if !isValidStatus {
		c.JSON(http.StatusBadRequest, models.APIResponse{
			Success: false,
			Message: "Invalid order status",
			Error:   stringPtr("invalid_status"),
		})
		return
	}

	if req.Status == "completed" {
		c.JSON(http.StatusForbidden, models.APIResponse{
			Success: false,
			Message: "لا يمكن إكمال الطلب يدوياً — يكتمل تلقائياً عند سداد كامل المبلغ",
			Error:   stringPtr("complete_requires_payment"),
		})
		return
	}

	if !allowedOrderStatusByRole[role][req.Status] {
		c.JSON(http.StatusForbidden, models.APIResponse{
			Success: false,
			Message: fmt.Sprintf("غير مسموح لصلاحيتك بتغيير حالة الطلب إلى «%s»", orderStatusAr[req.Status]),
			Error:   stringPtr("status_not_allowed_for_role"),
		})
		return
	}

	// Start transaction
	tx, err := h.db.Begin()
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{
			Success: false,
			Message: "Failed to start transaction",
			Error:   stringPtr(err.Error()),
		})
		return
	}
	defer tx.Rollback()

	// Get current order status (lock the row so status changes are serialized)
	var currentStatus string
	err = tx.QueryRow("SELECT status FROM orders WHERE id = $1 FOR UPDATE", orderID).Scan(&currentStatus)
	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, models.APIResponse{
			Success: false,
			Message: "Order not found",
			Error:   stringPtr("order_not_found"),
		})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{
			Success: false,
			Message: "Failed to fetch current order status",
			Error:   stringPtr(err.Error()),
		})
		return
	}

	// Terminal states are final: a completed or cancelled order cannot change status.
	// This blocks the "cancel → pending → cancel" path that would restore stock twice,
	// and prevents re-completing/altering a closed order.
	if (currentStatus == "completed" || currentStatus == "cancelled") && req.Status != currentStatus {
		c.JSON(http.StatusBadRequest, models.APIResponse{
			Success: false,
			Message: "لا يمكن تغيير حالة طلب " + map[string]string{"completed": "مكتمل", "cancelled": "ملغي"}[currentStatus],
			Error:   stringPtr("order_is_terminal"),
		})
		return
	}

	// Update order status
	updateQuery := "UPDATE orders SET status = $1, updated_at = CURRENT_TIMESTAMP"
	args := []interface{}{req.Status, orderID}

	// Set served_at or completed_at timestamps
	if req.Status == "served" {
		updateQuery += ", served_at = CURRENT_TIMESTAMP"
	} else if req.Status == "completed" {
		updateQuery += ", completed_at = CURRENT_TIMESTAMP"
	}

	updateQuery += " WHERE id = $2"

	_, err = tx.Exec(updateQuery, args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{
			Success: false,
			Message: "Failed to update order status",
			Error:   stringPtr(err.Error()),
		})
		return
	}

	// Log status change in history
	historyQuery := `
		INSERT INTO order_status_history (order_id, previous_status, new_status, changed_by, notes)
		VALUES ($1, $2, $3, $4, $5)
	`
	_, err = tx.Exec(historyQuery, orderID, currentStatus, req.Status, userID, req.Notes)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{
			Success: false,
			Message: "Failed to log status change",
			Error:   stringPtr(err.Error()),
		})
		return
	}

	// If order is completed or cancelled, free up the table
	if (req.Status == "completed" || req.Status == "cancelled") {
		_, err = tx.Exec(`
			UPDATE dining_tables
			SET is_occupied = false
			WHERE id IN (SELECT table_id FROM orders WHERE id = $1 AND table_id IS NOT NULL)
		`, orderID)
		if err != nil {
			// Log error but don't fail the transaction
			fmt.Printf("Warning: Failed to update table status: %v\n", err)
		}
	}

	// If a PAID order is being cancelled, record a matching negative "refunded" row for
	// each collected payment, so the cash drawer and income reports reconcile (money out).
	if req.Status == "cancelled" && currentStatus != "cancelled" {
		// The refund belongs to the shift that is open NOW (money leaves the drawer now)
		if _, rerr := tx.Exec(`
			INSERT INTO payments (order_id, payment_method, amount, status, processed_by, processed_at, shift_id)
			SELECT order_id, payment_method, -amount, 'refunded', $2, CURRENT_TIMESTAMP, $3
			FROM payments
			WHERE order_id = $1 AND status = 'completed'
		`, orderID, userID, currentShiftID(tx)); rerr != nil {
			fmt.Printf("Warning: Failed to record refund for order %s: %v\n", orderID, rerr)
		}
	}

	// Commit transaction
	if err := tx.Commit(); err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{
			Success: false,
			Message: "Failed to commit transaction",
			Error:   stringPtr(err.Error()),
		})
		return
	}

	// If the order was just cancelled, restore the deducted ingredient stock (once)
	if req.Status == "cancelled" && currentStatus != "cancelled" {
		RestoreOrderStock(h.db, orderID, userID)
	}

	// Fetch and return the updated order
	order, err := h.getOrderByID(orderID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{
			Success: false,
			Message: "Order updated but failed to fetch details",
			Error:   stringPtr(err.Error()),
		})
		return
	}

	c.JSON(http.StatusOK, models.APIResponse{
		Success: true,
		Message: "Order status updated successfully",
		Data:    order,
	})
}

// RefundOrder refunds a fully-paid (completed) order. Because a completed order is a
// terminal state that normal status changes cannot touch, refunding is a separate,
// explicit operation: it records a negative "refunded" payment for each collected
// payment (so the drawer/reports reconcile), restores ingredient stock, frees the
// table, and marks the order cancelled.
func (h *OrderHandler) RefundOrder(c *gin.Context) {
	orderID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: "Invalid order ID", Error: stringPtr("invalid_uuid")})
		return
	}
	userID, _, _, ok := middleware.GetUserFromContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, models.APIResponse{Success: false, Message: "Authentication required", Error: stringPtr("auth_required")})
		return
	}
	var body struct {
		Notes *string `json:"notes"`
	}
	_ = c.ShouldBindJSON(&body)

	tx, err := h.db.Begin()
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to start transaction", Error: stringPtr(err.Error())})
		return
	}
	defer tx.Rollback()

	var status string
	err = tx.QueryRow("SELECT status FROM orders WHERE id = $1 FOR UPDATE", orderID).Scan(&status)
	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, models.APIResponse{Success: false, Message: "Order not found", Error: stringPtr("order_not_found")})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to fetch order", Error: stringPtr(err.Error())})
		return
	}
	if status != "completed" {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: "لا يمكن استرداد إلا طلب مدفوع مكتمل", Error: stringPtr("order_not_completed")})
		return
	}

	// The refund belongs to the shift that is open NOW (money leaves the drawer now)
	if _, err = tx.Exec(`
		INSERT INTO payments (order_id, payment_method, amount, status, processed_by, processed_at, shift_id)
		SELECT order_id, payment_method, -amount, 'refunded', $2, CURRENT_TIMESTAMP, $3
		FROM payments WHERE order_id = $1 AND status = 'completed'
	`, orderID, userID, currentShiftID(tx)); err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to record refund", Error: stringPtr(err.Error())})
		return
	}

	if _, err = tx.Exec("UPDATE orders SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = $1", orderID); err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to update order", Error: stringPtr(err.Error())})
		return
	}
	tx.Exec(`INSERT INTO order_status_history (order_id, previous_status, new_status, changed_by, notes) VALUES ($1, 'completed', 'cancelled', $2, $3)`, orderID, userID, body.Notes)
	tx.Exec(`UPDATE dining_tables SET is_occupied = false WHERE id IN (SELECT table_id FROM orders WHERE id = $1 AND table_id IS NOT NULL)`, orderID)

	if err = tx.Commit(); err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to commit refund", Error: stringPtr(err.Error())})
		return
	}

	// Restore the deducted ingredient stock (runs once, after commit).
	RestoreOrderStock(h.db, orderID, userID)

	order, _ := h.getOrderByID(orderID)
	c.JSON(http.StatusOK, models.APIResponse{Success: true, Message: "تم استرداد الطلب بنجاح", Data: order})
}

// AddOrderItems appends lines to an open, unpaid order — the "the table wants
// more" case. Unlike UpdateOrderItems it does NOT delete the existing lines, so
// food already cooked or served keeps its item status and the kitchen does not
// re-make it. An order that had already left the kitchen goes back to
// 'confirmed' so the new lines actually get cooked.
func (h *OrderHandler) AddOrderItems(c *gin.Context) {
	userID, _, _, ok := middleware.GetUserFromContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, models.APIResponse{Success: false, Message: "Authentication required", Error: stringPtr("auth_required")})
		return
	}

	orderID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: "Invalid order ID", Error: stringPtr("invalid_order_id")})
		return
	}

	var req models.UpdateOrderItemsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: "Invalid request body", Error: stringPtr(err.Error())})
		return
	}
	if len(req.Items) == 0 {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: "لا توجد أصناف لإضافتها", Error: stringPtr("empty_items")})
		return
	}
	for _, it := range req.Items {
		if it.Quantity <= 0 {
			c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: "كمية الصنف يجب أن تكون أكبر من صفر", Error: stringPtr("invalid_quantity")})
			return
		}
	}

	tx, err := h.db.Begin()
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to start transaction", Error: stringPtr(err.Error())})
		return
	}
	defer tx.Rollback()

	var status string
	var existingDiscount, existingFee float64
	err = tx.QueryRow(
		`SELECT status, discount_amount, delivery_fee FROM orders WHERE id = $1 FOR UPDATE`, orderID,
	).Scan(&status, &existingDiscount, &existingFee)
	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, models.APIResponse{Success: false, Message: "Order not found", Error: stringPtr("order_not_found")})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to fetch order", Error: stringPtr(err.Error())})
		return
	}
	if status == "completed" || status == "cancelled" {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: "لا يمكن الإضافة إلى طلب مكتمل أو ملغي", Error: stringPtr("order_not_modifiable")})
		return
	}

	var paidCount int
	if err := tx.QueryRow(`SELECT COUNT(*) FROM payments WHERE order_id = $1 AND status = 'completed'`, orderID).Scan(&paidCount); err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to check payments", Error: stringPtr(err.Error())})
		return
	}
	if paidCount > 0 {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: "لا يمكن الإضافة إلى طلب تم دفعه — افتح طلباً جديداً", Error: stringPtr("order_already_paid")})
		return
	}

	// Give the whole order's ingredients back, then re-deduct everything (old +
	// new) after commit. Keeps the stock ledger consistent with the saved order.
	if err := processOrderStock(tx, orderID, userID, true); err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to restore stock", Error: stringPtr(err.Error())})
		return
	}

	priced, perr := priceOrderItems(tx, req.Items)
	if perr != nil {
		respondPricingError(c, perr)
		return
	}
	for _, p := range priced {
		itemID := uuid.New()
		if _, err := tx.Exec(`
			INSERT INTO order_items (id, order_id, product_id, quantity, unit_price, total_price, special_instructions)
			VALUES ($1, $2, $3, $4, $5, $6, $7)
		`, itemID, orderID, p.productID, p.quantity, p.unitPrice, p.totalPrice, p.specialInstructions); err != nil {
			c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to insert order item", Error: stringPtr(err.Error())})
			return
		}
		if err := insertItemModifiers(tx, itemID, p.mods); err != nil {
			c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to save item modifiers", Error: stringPtr(err.Error())})
			return
		}
	}

	// Re-total from every line now on the order, old and new.
	var subtotal float64
	if err := tx.QueryRow(`SELECT COALESCE(SUM(total_price), 0) FROM order_items WHERE order_id = $1`, orderID).Scan(&subtotal); err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to recompute subtotal", Error: stringPtr(err.Error())})
		return
	}

	discountAmount := existingDiscount
	if discountAmount > subtotal {
		discountAmount = subtotal
	}
	discountedSubtotal := subtotal - discountAmount

	taxRate := 0.10
	var taxStr string
	if err := tx.QueryRow(`SELECT value FROM settings WHERE key = 'tax_rate'`).Scan(&taxStr); err == nil {
		if v, perr := strconv.ParseFloat(taxStr, 64); perr == nil {
			taxRate = v / 100.0
		}
	}
	taxAmount := discountedSubtotal * taxRate
	totalAmount := discountedSubtotal + taxAmount + existingFee

	// Anything already plated has to go back through the kitchen for the new lines.
	newStatus := status
	if status == "ready" || status == "served" {
		newStatus = "confirmed"
	}
	// Reopening the order un-serves it, so the served timestamp must not linger.
	clearServedAt := newStatus != "served"

	if _, err := tx.Exec(`
		UPDATE orders
		SET subtotal = $1, tax_amount = $2, discount_amount = $3,
		    total_amount = $4, status = $5,
		    served_at = CASE WHEN $6 THEN NULL ELSE served_at END,
		    updated_at = CURRENT_TIMESTAMP
		WHERE id = $7
	`, subtotal, taxAmount, discountAmount, totalAmount, newStatus, clearServedAt, orderID); err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to update order totals", Error: stringPtr(err.Error())})
		return
	}

	if err := tx.Commit(); err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to commit", Error: stringPtr(err.Error())})
		return
	}

	DeductOrderStock(h.db, orderID, userID)

	order, _ := h.getOrderByID(orderID)
	c.JSON(http.StatusOK, models.APIResponse{Success: true, Message: "تمت إضافة الأصناف إلى الطلب", Data: order})
}

// UpdateOrderItems replaces the items of an open, unpaid order and recomputes its
// totals. Ingredient stock for the old items is restored inside the transaction and
// the new items are deducted after commit, so stock always matches the saved order.
func (h *OrderHandler) UpdateOrderItems(c *gin.Context) {
	userID, _, _, ok := middleware.GetUserFromContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, models.APIResponse{Success: false, Message: "Authentication required", Error: stringPtr("auth_required")})
		return
	}

	orderID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: "Invalid order ID", Error: stringPtr("invalid_order_id")})
		return
	}

	var req models.UpdateOrderItemsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: "Invalid request body", Error: stringPtr(err.Error())})
		return
	}
	if len(req.Items) == 0 {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: "الطلب يجب أن يحتوي على صنف واحد على الأقل", Error: stringPtr("empty_order")})
		return
	}
	for _, it := range req.Items {
		if it.Quantity <= 0 {
			c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: "كمية الصنف يجب أن تكون أكبر من صفر", Error: stringPtr("invalid_quantity")})
			return
		}
	}

	tx, err := h.db.Begin()
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to start transaction", Error: stringPtr(err.Error())})
		return
	}
	defer tx.Rollback()

	// Lock the order and check it is still modifiable
	var status string
	var existingDiscount, existingFee float64
	err = tx.QueryRow(
		`SELECT status, discount_amount, delivery_fee FROM orders WHERE id = $1 FOR UPDATE`, orderID,
	).Scan(&status, &existingDiscount, &existingFee)
	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, models.APIResponse{Success: false, Message: "Order not found", Error: stringPtr("order_not_found")})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to fetch order", Error: stringPtr(err.Error())})
		return
	}
	if status == "completed" || status == "cancelled" {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: "لا يمكن تعديل طلب مكتمل أو ملغي", Error: stringPtr("order_not_modifiable")})
		return
	}

	// Refuse to modify an order that already has money against it
	var paidCount int
	if err := tx.QueryRow(`SELECT COUNT(*) FROM payments WHERE order_id = $1 AND status = 'completed'`, orderID).Scan(&paidCount); err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to check payments", Error: stringPtr(err.Error())})
		return
	}
	if paidCount > 0 {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: "لا يمكن تعديل طلب تم دفعه — استخدم الاسترداد", Error: stringPtr("order_already_paid")})
		return
	}

	// Give back the ingredients consumed by the OLD items before replacing them
	if err := processOrderStock(tx, orderID, userID, true); err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to restore stock for old items", Error: stringPtr(err.Error())})
		return
	}

	if _, err := tx.Exec(`DELETE FROM order_items WHERE order_id = $1`, orderID); err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to clear order items", Error: stringPtr(err.Error())})
		return
	}

	// Re-price the new lines (product price + modifier deltas) and insert them
	priced, perr := priceOrderItems(tx, req.Items)
	if perr != nil {
		respondPricingError(c, perr)
		return
	}
	var subtotal float64
	for _, p := range priced {
		subtotal += p.totalPrice
		itemID := uuid.New()
		if _, err := tx.Exec(`
			INSERT INTO order_items (id, order_id, product_id, quantity, unit_price, total_price, special_instructions)
			VALUES ($1, $2, $3, $4, $5, $6, $7)
		`, itemID, orderID, p.productID, p.quantity, p.unitPrice, p.totalPrice, p.specialInstructions); err != nil {
			c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to insert order item", Error: stringPtr(err.Error())})
			return
		}
		if err := insertItemModifiers(tx, itemID, p.mods); err != nil {
			c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to save item modifiers", Error: stringPtr(err.Error())})
			return
		}
	}

	// Discount: recompute when supplied, otherwise keep the existing amount (capped)
	discountAmount := existingDiscount
	if req.DiscountType != nil && req.DiscountValue != nil && *req.DiscountValue > 0 {
		switch *req.DiscountType {
		case "percent":
			pct := *req.DiscountValue
			if pct > 100 {
				pct = 100
			}
			discountAmount = subtotal * pct / 100.0
		case "amount":
			discountAmount = *req.DiscountValue
		default:
			c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: "نوع الخصم غير صحيح (percent أو amount)", Error: stringPtr("invalid_discount_type")})
			return
		}
	}
	if discountAmount > subtotal {
		discountAmount = subtotal
	}
	discountedSubtotal := subtotal - discountAmount

	taxRate := 0.10
	var taxStr string
	if err := tx.QueryRow(`SELECT value FROM settings WHERE key = 'tax_rate'`).Scan(&taxStr); err == nil {
		if v, perr := strconv.ParseFloat(taxStr, 64); perr == nil {
			taxRate = v / 100.0
		}
	}
	taxAmount := discountedSubtotal * taxRate

	deliveryFee := existingFee
	if req.DeliveryFee != nil && *req.DeliveryFee >= 0 {
		deliveryFee = *req.DeliveryFee
	}
	totalAmount := discountedSubtotal + taxAmount + deliveryFee

	if _, err := tx.Exec(`
		UPDATE orders
		SET subtotal = $1, tax_amount = $2, discount_amount = $3, delivery_fee = $4,
		    total_amount = $5, notes = COALESCE($6, notes), updated_at = CURRENT_TIMESTAMP
		WHERE id = $7
	`, subtotal, taxAmount, discountAmount, deliveryFee, totalAmount, req.Notes, orderID); err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to update order totals", Error: stringPtr(err.Error())})
		return
	}

	if err := tx.Commit(); err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to commit order update", Error: stringPtr(err.Error())})
		return
	}

	// Deduct stock for the NEW items (runs once, after commit)
	DeductOrderStock(h.db, orderID, userID)

	order, _ := h.getOrderByID(orderID)
	c.JSON(http.StatusOK, models.APIResponse{Success: true, Message: "تم تعديل الطلب بنجاح", Data: order})
}

// Helper functions

func (h *OrderHandler) getOrderByID(orderID uuid.UUID) (*models.Order, error) {
	var order models.Order
	var tableNumber, tableLocation sql.NullString
	var username, firstName, lastName sql.NullString

	query := `
		SELECT o.id, o.order_number, o.table_id, o.user_id, o.customer_name,
		       o.customer_phone, o.delivery_address,
		       o.order_type, o.status, o.subtotal, o.tax_amount, o.discount_amount, o.delivery_fee,
		       o.total_amount, o.notes, o.created_at, o.updated_at, o.served_at, o.completed_at,
		       t.table_number, t.location,
		       u.username, u.first_name, u.last_name
		FROM orders o
		LEFT JOIN dining_tables t ON o.table_id = t.id
		LEFT JOIN users u ON o.user_id = u.id
		WHERE o.id = $1
	`

	err := h.db.QueryRow(query, orderID).Scan(
		&order.ID, &order.OrderNumber, &order.TableID, &order.UserID, &order.CustomerName,
		&order.CustomerPhone, &order.DeliveryAddress,
		&order.OrderType, &order.Status, &order.Subtotal, &order.TaxAmount, &order.DiscountAmount, &order.DeliveryFee,
		&order.TotalAmount, &order.Notes, &order.CreatedAt, &order.UpdatedAt, &order.ServedAt, &order.CompletedAt,
		&tableNumber, &tableLocation,
		&username, &firstName, &lastName,
	)

	if err != nil {
		return nil, err
	}

	// Add table info if available
	if tableNumber.Valid {
		order.Table = &models.DiningTable{
			TableNumber: tableNumber.String,
			Location:    &tableLocation.String,
		}
	}

	// Add user info if available
	if username.Valid {
		order.User = &models.User{
			Username:  username.String,
			FirstName: firstName.String,
			LastName:  lastName.String,
		}
	}

	// Load order items
	if err := h.loadOrderItems(&order); err != nil {
		return nil, err
	}

	// Load payments
	if err := h.loadOrderPayments(&order); err != nil {
		return nil, err
	}

	return &order, nil
}

func (h *OrderHandler) loadOrderItems(order *models.Order) error {
	query := `
		SELECT oi.id, oi.product_id, oi.quantity, oi.unit_price, oi.total_price, 
		       oi.special_instructions, oi.status, oi.created_at, oi.updated_at,
		       p.name, p.description, p.price, p.preparation_time
		FROM order_items oi
		JOIN products p ON oi.product_id = p.id
		WHERE oi.order_id = $1
		ORDER BY oi.created_at
	`

	rows, err := h.db.Query(query, order.ID)
	if err != nil {
		return err
	}
	defer rows.Close()

	items := []models.OrderItem{}
	for rows.Next() {
		var item models.OrderItem
		var productName, productDescription string
		var productPrice float64
		var preparationTime int

		err := rows.Scan(
			&item.ID, &item.ProductID, &item.Quantity, &item.UnitPrice, &item.TotalPrice,
			&item.SpecialInstructions, &item.Status, &item.CreatedAt, &item.UpdatedAt,
			&productName, &productDescription, &productPrice, &preparationTime,
		)
		if err != nil {
			return err
		}

		item.OrderID = order.ID
		item.Product = &models.Product{
			ID:              item.ProductID,
			Name:            productName,
			Description:     &productDescription,
			Price:           productPrice,
			PreparationTime: preparationTime,
		}

		items = append(items, item)
	}

	// Attach the chosen modifiers (sizes / add-ons) to each line
	if len(items) > 0 {
		modRows, err := h.db.Query(`
			SELECT oim.id, oim.order_item_id, oim.modifier_id, oim.name, oim.price_delta
			FROM order_item_modifiers oim
			JOIN order_items oi ON oi.id = oim.order_item_id
			WHERE oi.order_id = $1
			ORDER BY oim.created_at
		`, order.ID)
		if err != nil {
			return err
		}
		defer modRows.Close()

		byItem := map[uuid.UUID][]models.OrderItemModifier{}
		for modRows.Next() {
			var m models.OrderItemModifier
			var modifierID uuid.NullUUID
			if err := modRows.Scan(&m.ID, &m.OrderItemID, &modifierID, &m.Name, &m.PriceDelta); err != nil {
				return err
			}
			if modifierID.Valid {
				id := modifierID.UUID
				m.ModifierID = &id
			}
			byItem[m.OrderItemID] = append(byItem[m.OrderItemID], m)
		}
		for i := range items {
			items[i].Modifiers = byItem[items[i].ID]
		}
	}

	order.Items = items
	return nil
}

func (h *OrderHandler) loadOrderPayments(order *models.Order) error {
	query := `
		SELECT p.id, p.payment_method, p.amount, p.reference_number, p.status, 
		       p.processed_by, p.processed_at, p.created_at,
		       u.username, u.first_name, u.last_name
		FROM payments p
		LEFT JOIN users u ON p.processed_by = u.id
		WHERE p.order_id = $1
		ORDER BY p.created_at
	`

	rows, err := h.db.Query(query, order.ID)
	if err != nil {
		return err
	}
	defer rows.Close()

	payments := []models.Payment{}
	for rows.Next() {
		var payment models.Payment
		var username, firstName, lastName sql.NullString

		err := rows.Scan(
			&payment.ID, &payment.PaymentMethod, &payment.Amount, &payment.ReferenceNumber,
			&payment.Status, &payment.ProcessedBy, &payment.ProcessedAt, &payment.CreatedAt,
			&username, &firstName, &lastName,
		)
		if err != nil {
			return err
		}

		payment.OrderID = order.ID

		// Add processed by user info if available
		if username.Valid {
			payment.ProcessedByUser = &models.User{
				Username:  username.String,
				FirstName: firstName.String,
				LastName:  lastName.String,
			}
		}

		payments = append(payments, payment)
	}

	order.Payments = payments
	return nil
}

// generateOrderNumber returns a guaranteed-unique order number using a DB sequence
// (ORD + YYMMDD + zero-padded sequence). Falls back to a nanosecond timestamp only if
// the sequence is unavailable. A UNIQUE constraint on orders.order_number backs this up.
func (h *OrderHandler) generateOrderNumber() string {
	var seq int64
	if err := h.db.QueryRow("SELECT nextval('order_number_seq')").Scan(&seq); err == nil {
		return fmt.Sprintf("ORD%s%06d", time.Now().Format("060102"), seq)
	}
	return fmt.Sprintf("ORD%d", time.Now().UnixNano())
}

