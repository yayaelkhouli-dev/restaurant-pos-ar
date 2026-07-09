package handlers

import (
	"database/sql"
	"errors"
	"fmt"
	"net/http"

	"pos-backend/internal/models"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// ModifierHandler manages product modifier groups and options
// (الأحجام والإضافات)
type ModifierHandler struct {
	db *sql.DB
}

func NewModifierHandler(db *sql.DB) *ModifierHandler {
	return &ModifierHandler{db: db}
}

// errModifierInvalid marks a chosen modifier set that violates a group's rules.
// Use modifierErrf so the message stays a clean, user-facing Arabic sentence.
var errModifierInvalid = errors.New("invalid_modifiers")

type modifierError struct{ msg string }

func (e *modifierError) Error() string { return e.msg }

// Is lets errors.Is(err, errModifierInvalid) match without polluting the message.
func (e *modifierError) Is(target error) bool { return target == errModifierInvalid }

func modifierErrf(format string, a ...interface{}) error {
	return &modifierError{msg: fmt.Sprintf(format, a...)}
}

// resolvedModifier is a validated, priced modifier selection for one order line.
type resolvedModifier struct {
	ID         string
	Name       string
	PriceDelta float64
}

// txQueryer is satisfied by both *sql.DB and *sql.Tx.
type txQueryer interface {
	QueryRow(query string, args ...interface{}) *sql.Row
	Query(query string, args ...interface{}) (*sql.Rows, error)
}

// resolveItemModifiers validates the chosen modifier IDs against the product's groups
// and returns them with their names/prices plus the total price delta.
//
// Rules enforced: every modifier must belong to the product and be available; each
// group's min_select/max_select must be satisfied (max_select = 0 means unlimited).
func resolveItemModifiers(q txQueryer, productID uuid.UUID, modifierIDs []uuid.UUID) ([]resolvedModifier, float64, error) {
	// Load the product's groups and their selection rules
	groupRows, err := q.Query(`
		SELECT id, name, min_select, max_select FROM modifier_groups WHERE product_id = $1
	`, productID)
	if err != nil {
		return nil, 0, err
	}
	type groupRule struct {
		name            string
		minSel, maxSel  int
		selectedInGroup int
	}
	rules := map[string]*groupRule{}
	for groupRows.Next() {
		var gid, gname string
		var minSel, maxSel int
		if err := groupRows.Scan(&gid, &gname, &minSel, &maxSel); err != nil {
			groupRows.Close()
			return nil, 0, err
		}
		rules[gid] = &groupRule{name: gname, minSel: minSel, maxSel: maxSel}
	}
	groupRows.Close()

	resolved := make([]resolvedModifier, 0, len(modifierIDs))
	delta := 0.0
	seen := map[string]bool{}

	for _, mid := range modifierIDs {
		if seen[mid.String()] {
			continue // ignore duplicates
		}
		seen[mid.String()] = true

		var groupID, name string
		var priceDelta float64
		var available bool
		err := q.QueryRow(`
			SELECT m.group_id, m.name, m.price_delta, m.is_available
			FROM modifiers m
			JOIN modifier_groups g ON g.id = m.group_id
			WHERE m.id = $1 AND g.product_id = $2
		`, mid, productID).Scan(&groupID, &name, &priceDelta, &available)
		if err == sql.ErrNoRows {
			return nil, 0, modifierErrf("الإضافة المختارة غير متاحة لهذا الصنف")
		}
		if err != nil {
			return nil, 0, err
		}
		if !available {
			return nil, 0, modifierErrf("الإضافة «%s» غير متاحة حالياً", name)
		}

		if r, ok := rules[groupID]; ok {
			r.selectedInGroup++
		}
		resolved = append(resolved, resolvedModifier{ID: mid.String(), Name: name, PriceDelta: priceDelta})
		delta += priceDelta
	}

	// Enforce each group's min/max selection rules
	for _, r := range rules {
		if r.selectedInGroup < r.minSel {
			return nil, 0, modifierErrf("يجب اختيار %d على الأقل من «%s»", r.minSel, r.name)
		}
		if r.maxSel > 0 && r.selectedInGroup > r.maxSel {
			return nil, 0, modifierErrf("لا يمكن اختيار أكثر من %d من «%s»", r.maxSel, r.name)
		}
	}

	return resolved, delta, nil
}

// pricedOrderItem is one fully-priced order line, including its chosen modifiers.
type pricedOrderItem struct {
	productID           uuid.UUID
	quantity            int
	unitPrice           float64 // product price + modifier deltas
	totalPrice          float64 // unitPrice * quantity
	specialInstructions *string
	mods                []resolvedModifier
}

// errProductUnavailable is returned when an ordered product is missing/archived.
var errProductUnavailable = errors.New("product_not_found")

// priceOrderItems validates each requested line and prices it, including modifiers.
// Shared by order creation and order modification so both price identically.
func priceOrderItems(q txQueryer, items []models.CreateOrderItem) ([]pricedOrderItem, error) {
	priced := make([]pricedOrderItem, 0, len(items))
	for _, item := range items {
		var price float64
		err := q.QueryRow(
			`SELECT price FROM products WHERE id = $1 AND is_available = true AND is_deleted = false`,
			item.ProductID,
		).Scan(&price)
		if err == sql.ErrNoRows {
			return nil, errProductUnavailable
		}
		if err != nil {
			return nil, err
		}

		mods, delta, merr := resolveItemModifiers(q, item.ProductID, item.ModifierIDs)
		if merr != nil {
			return nil, merr
		}

		unit := price + delta
		priced = append(priced, pricedOrderItem{
			productID:           item.ProductID,
			quantity:            item.Quantity,
			unitPrice:           unit,
			totalPrice:          unit * float64(item.Quantity),
			specialInstructions: item.SpecialInstructions,
			mods:                mods,
		})
	}
	return priced, nil
}

// respondPricingError maps pricing/validation failures to the right HTTP status.
func respondPricingError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, errProductUnavailable):
		c.JSON(http.StatusBadRequest, models.APIResponse{
			Success: false, Message: "الصنف غير موجود أو غير متاح", Error: stringPtr("product_not_found"),
		})
	case errors.Is(err, errModifierInvalid):
		c.JSON(http.StatusBadRequest, models.APIResponse{
			Success: false, Message: err.Error(), Error: stringPtr("invalid_modifiers"),
		})
	default:
		c.JSON(http.StatusInternalServerError, models.APIResponse{
			Success: false, Message: "Failed to price order items", Error: stringPtr(err.Error()),
		})
	}
}

// insertItemModifiers snapshots the chosen options onto a sold line item.
func insertItemModifiers(tx *sql.Tx, orderItemID uuid.UUID, mods []resolvedModifier) error {
	for _, m := range mods {
		if _, err := tx.Exec(`
			INSERT INTO order_item_modifiers (order_item_id, modifier_id, name, price_delta)
			VALUES ($1, $2, $3, $4)
		`, orderItemID, m.ID, m.Name, m.PriceDelta); err != nil {
			return err
		}
	}
	return nil
}

// ============================================================
// Read: groups + options for a product (all authenticated roles)
// ============================================================

// GetProductModifiers returns the modifier groups (with their options) for a product.
func (h *ModifierHandler) GetProductModifiers(c *gin.Context) {
	productID := c.Param("id")

	groupRows, err := h.db.Query(`
		SELECT id, name, min_select, max_select, sort_order
		FROM modifier_groups WHERE product_id = $1 ORDER BY sort_order, name
	`, productID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to fetch modifier groups", Error: stringPtr(err.Error())})
		return
	}
	defer groupRows.Close()

	groups := make([]map[string]interface{}, 0)
	ids := make([]string, 0)
	for groupRows.Next() {
		var id, name string
		var minSel, maxSel, sortOrder int
		if err := groupRows.Scan(&id, &name, &minSel, &maxSel, &sortOrder); err != nil {
			c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to scan group", Error: stringPtr(err.Error())})
			return
		}
		ids = append(ids, id)
		groups = append(groups, map[string]interface{}{
			"id": id, "name": name, "min_select": minSel, "max_select": maxSel,
			"sort_order": sortOrder, "modifiers": []map[string]interface{}{},
		})
	}

	// Attach options to each group
	for i, gid := range ids {
		optRows, err := h.db.Query(`
			SELECT id, name, price_delta, is_available, sort_order
			FROM modifiers WHERE group_id = $1 ORDER BY sort_order, name
		`, gid)
		if err != nil {
			c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to fetch modifiers", Error: stringPtr(err.Error())})
			return
		}
		opts := make([]map[string]interface{}, 0)
		for optRows.Next() {
			var id, name string
			var priceDelta float64
			var available bool
			var sortOrder int
			if err := optRows.Scan(&id, &name, &priceDelta, &available, &sortOrder); err != nil {
				optRows.Close()
				c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to scan modifier", Error: stringPtr(err.Error())})
				return
			}
			opts = append(opts, map[string]interface{}{
				"id": id, "name": name, "price_delta": priceDelta,
				"is_available": available, "sort_order": sortOrder,
			})
		}
		optRows.Close()
		groups[i]["modifiers"] = opts
	}

	c.JSON(http.StatusOK, models.APIResponse{Success: true, Message: "Modifiers retrieved", Data: groups})
}

// ============================================================
// Admin CRUD
// ============================================================

func (h *ModifierHandler) CreateGroup(c *gin.Context) {
	var req struct {
		ProductID string `json:"product_id"`
		Name      string `json:"name"`
		MinSelect int    `json:"min_select"`
		MaxSelect int    `json:"max_select"`
		SortOrder int    `json:"sort_order"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: "Invalid request body", Error: stringPtr(err.Error())})
		return
	}
	if req.Name == "" || req.ProductID == "" {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: "اسم المجموعة والمنتج مطلوبان", Error: stringPtr("missing_fields")})
		return
	}
	if req.MinSelect < 0 || req.MaxSelect < 0 || (req.MaxSelect > 0 && req.MinSelect > req.MaxSelect) {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: "قواعد الاختيار غير صحيحة", Error: stringPtr("invalid_select_rules")})
		return
	}

	var id string
	if err := h.db.QueryRow(`
		INSERT INTO modifier_groups (product_id, name, min_select, max_select, sort_order)
		VALUES ($1,$2,$3,$4,$5) RETURNING id
	`, req.ProductID, req.Name, req.MinSelect, req.MaxSelect, req.SortOrder).Scan(&id); err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to create group", Error: stringPtr(err.Error())})
		return
	}
	c.JSON(http.StatusCreated, models.APIResponse{Success: true, Message: "تم إنشاء المجموعة", Data: gin.H{"id": id}})
}

func (h *ModifierHandler) UpdateGroup(c *gin.Context) {
	id := c.Param("id")
	var req struct {
		Name      string `json:"name"`
		MinSelect int    `json:"min_select"`
		MaxSelect int    `json:"max_select"`
		SortOrder int    `json:"sort_order"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: "Invalid request body", Error: stringPtr(err.Error())})
		return
	}
	if req.MinSelect < 0 || req.MaxSelect < 0 || (req.MaxSelect > 0 && req.MinSelect > req.MaxSelect) {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: "قواعد الاختيار غير صحيحة", Error: stringPtr("invalid_select_rules")})
		return
	}
	res, err := h.db.Exec(`
		UPDATE modifier_groups SET name=$1, min_select=$2, max_select=$3, sort_order=$4, updated_at=CURRENT_TIMESTAMP
		WHERE id=$5
	`, req.Name, req.MinSelect, req.MaxSelect, req.SortOrder, id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to update group", Error: stringPtr(err.Error())})
		return
	}
	if n, _ := res.RowsAffected(); n == 0 {
		c.JSON(http.StatusNotFound, models.APIResponse{Success: false, Message: "Group not found"})
		return
	}
	c.JSON(http.StatusOK, models.APIResponse{Success: true, Message: "تم حفظ المجموعة"})
}

func (h *ModifierHandler) DeleteGroup(c *gin.Context) {
	id := c.Param("id")
	res, err := h.db.Exec(`DELETE FROM modifier_groups WHERE id = $1`, id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to delete group", Error: stringPtr(err.Error())})
		return
	}
	if n, _ := res.RowsAffected(); n == 0 {
		c.JSON(http.StatusNotFound, models.APIResponse{Success: false, Message: "Group not found"})
		return
	}
	c.JSON(http.StatusOK, models.APIResponse{Success: true, Message: "تم حذف المجموعة"})
}

func (h *ModifierHandler) CreateModifier(c *gin.Context) {
	var req struct {
		GroupID     string  `json:"group_id"`
		Name        string  `json:"name"`
		PriceDelta  float64 `json:"price_delta"`
		IsAvailable *bool   `json:"is_available"`
		SortOrder   int     `json:"sort_order"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: "Invalid request body", Error: stringPtr(err.Error())})
		return
	}
	if req.Name == "" || req.GroupID == "" {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: "الاسم والمجموعة مطلوبان", Error: stringPtr("missing_fields")})
		return
	}
	available := true
	if req.IsAvailable != nil {
		available = *req.IsAvailable
	}
	var id string
	if err := h.db.QueryRow(`
		INSERT INTO modifiers (group_id, name, price_delta, is_available, sort_order)
		VALUES ($1,$2,$3,$4,$5) RETURNING id
	`, req.GroupID, req.Name, req.PriceDelta, available, req.SortOrder).Scan(&id); err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to create modifier", Error: stringPtr(err.Error())})
		return
	}
	c.JSON(http.StatusCreated, models.APIResponse{Success: true, Message: "تمت إضافة الخيار", Data: gin.H{"id": id}})
}

func (h *ModifierHandler) UpdateModifier(c *gin.Context) {
	id := c.Param("id")
	var req struct {
		Name        string  `json:"name"`
		PriceDelta  float64 `json:"price_delta"`
		IsAvailable *bool   `json:"is_available"`
		SortOrder   int     `json:"sort_order"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, models.APIResponse{Success: false, Message: "Invalid request body", Error: stringPtr(err.Error())})
		return
	}
	available := true
	if req.IsAvailable != nil {
		available = *req.IsAvailable
	}
	res, err := h.db.Exec(`
		UPDATE modifiers SET name=$1, price_delta=$2, is_available=$3, sort_order=$4, updated_at=CURRENT_TIMESTAMP
		WHERE id=$5
	`, req.Name, req.PriceDelta, available, req.SortOrder, id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to update modifier", Error: stringPtr(err.Error())})
		return
	}
	if n, _ := res.RowsAffected(); n == 0 {
		c.JSON(http.StatusNotFound, models.APIResponse{Success: false, Message: "Modifier not found"})
		return
	}
	c.JSON(http.StatusOK, models.APIResponse{Success: true, Message: "تم حفظ الخيار"})
}

// DeleteModifier removes an option. Past order history keeps its snapshotted
// name/price, so sales reports stay correct.
func (h *ModifierHandler) DeleteModifier(c *gin.Context) {
	id := c.Param("id")
	res, err := h.db.Exec(`DELETE FROM modifiers WHERE id = $1`, id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{Success: false, Message: "Failed to delete modifier", Error: stringPtr(err.Error())})
		return
	}
	if n, _ := res.RowsAffected(); n == 0 {
		c.JSON(http.StatusNotFound, models.APIResponse{Success: false, Message: "Modifier not found"})
		return
	}
	c.JSON(http.StatusOK, models.APIResponse{Success: true, Message: "تم حذف الخيار"})
}
