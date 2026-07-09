package handlers

import (
	"database/sql"
	"math"
	"net/http"

	"pos-backend/internal/middleware"

	"github.com/gin-gonic/gin"
)

// PurchasingHandler manages purchases (receiving), stock counts, and inventory reports
// (المشتريات/التوريد + الجرد + تقارير المخزون)
type PurchasingHandler struct {
	db *sql.DB
}

func NewPurchasingHandler(db *sql.DB) *PurchasingHandler {
	return &PurchasingHandler{db: db}
}

// ============================================================
// Purchases / Receiving (التوريد) — يزيد المخزون ويحدّث التكلفة بمتوسط مرجّح
// ============================================================

func (h *PurchasingHandler) CreatePurchase(c *gin.Context) {
	var req struct {
		Supplier  *string `json:"supplier"`
		Reference *string `json:"reference"`
		Notes     *string `json:"notes"`
		Items     []struct {
			IngredientID string  `json:"ingredient_id"`
			Quantity     float64 `json:"quantity"`
			UnitID       string  `json:"unit_id"`
			UnitCost     float64 `json:"unit_cost"`
		} `json:"items"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "Invalid request body", "error": err.Error()})
		return
	}
	if len(req.Items) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "الفاتورة يجب أن تحتوي على بند واحد على الأقل"})
		return
	}
	userID, _, _, _ := middleware.GetUserFromContext(c)

	tx, err := h.db.Begin()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Failed to start transaction", "error": err.Error()})
		return
	}
	defer tx.Rollback()

	var purchaseID string
	var createdBy interface{}
	if userID.String() != "00000000-0000-0000-0000-000000000000" {
		createdBy = userID
	}
	err = tx.QueryRow(`
		INSERT INTO purchases (supplier, reference, notes, created_by, total_cost)
		VALUES ($1,$2,$3,$4,0) RETURNING id
	`, req.Supplier, req.Reference, req.Notes, createdBy).Scan(&purchaseID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Failed to create purchase", "error": err.Error()})
		return
	}

	total := 0.0
	for _, it := range req.Items {
		if it.IngredientID == "" || it.UnitID == "" || it.Quantity <= 0 {
			continue
		}
		// current ingredient state + stock-unit factor
		var stockUnitFactor, curStock, curCost float64
		if err := tx.QueryRow(`
			SELECT COALESCE(u.base_factor,1), i.current_stock, i.cost_per_unit
			FROM ingredients i LEFT JOIN units u ON u.id = i.unit_id WHERE i.id = $1
		`, it.IngredientID).Scan(&stockUnitFactor, &curStock, &curCost); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Ingredient not found", "error": err.Error()})
			return
		}
		var purchaseUnitFactor float64
		if err := tx.QueryRow(`SELECT base_factor FROM units WHERE id = $1`, it.UnitID).Scan(&purchaseUnitFactor); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Unit not found", "error": err.Error()})
			return
		}

		qtyStock := it.Quantity * (purchaseUnitFactor / stockUnitFactor) // الكمية بوحدة المخزون
		lineTotal := it.Quantity * it.UnitCost
		total += lineTotal

		costPerStock := curCost
		if qtyStock > 0 {
			costPerStock = lineTotal / qtyStock
		}
		oldClamped := math.Max(curStock, 0)
		newStock := curStock + qtyStock
		newCost := curCost
		if oldClamped+qtyStock > 0 {
			newCost = (oldClamped*curCost + qtyStock*costPerStock) / (oldClamped + qtyStock)
		}

		if _, err := tx.Exec(`UPDATE ingredients SET current_stock = $1, cost_per_unit = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3`,
			newStock, newCost, it.IngredientID); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Failed to update ingredient", "error": err.Error()})
			return
		}
		if _, err := tx.Exec(`
			INSERT INTO purchase_items (purchase_id, ingredient_id, quantity, unit_id, unit_cost, line_total)
			VALUES ($1,$2,$3,$4,$5,$6)
		`, purchaseID, it.IngredientID, it.Quantity, it.UnitID, it.UnitCost, lineTotal); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Failed to insert purchase item", "error": err.Error()})
			return
		}
		if _, err := tx.Exec(`
			INSERT INTO stock_movements (ingredient_id, movement_type, quantity, balance_after, reference_type, reference_id, created_by)
			VALUES ($1,'purchase',$2,$3,'purchase',$4,$5)
		`, it.IngredientID, qtyStock, newStock, purchaseID, createdBy); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Failed to record movement", "error": err.Error()})
			return
		}
	}

	if _, err := tx.Exec(`UPDATE purchases SET total_cost = $1 WHERE id = $2`, total, purchaseID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Failed to finalize purchase", "error": err.Error()})
		return
	}
	if err := tx.Commit(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Failed to commit purchase", "error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"success": true, "message": "تم تسجيل التوريد وتحديث المخزون", "data": gin.H{"id": purchaseID, "total_cost": total}})
}

func (h *PurchasingHandler) GetPurchases(c *gin.Context) {
	rows, err := h.db.Query(`
		SELECT p.id, COALESCE(p.supplier,''), COALESCE(p.reference,''), p.total_cost, p.created_at,
		       COALESCE(u.first_name || ' ' || u.last_name, ''),
		       (SELECT COUNT(*) FROM purchase_items pi WHERE pi.purchase_id = p.id)
		FROM purchases p LEFT JOIN users u ON p.created_by = u.id
		ORDER BY p.created_at DESC LIMIT 100
	`)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Failed to fetch purchases", "error": err.Error()})
		return
	}
	defer rows.Close()
	list := make([]map[string]interface{}, 0)
	for rows.Next() {
		var id, supplier, reference, createdBy string
		var total float64
		var createdAt interface{}
		var itemCount int
		if err := rows.Scan(&id, &supplier, &reference, &total, &createdAt, &createdBy, &itemCount); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Failed to scan purchase", "error": err.Error()})
			return
		}
		list = append(list, map[string]interface{}{
			"id": id, "supplier": supplier, "reference": reference, "total_cost": total,
			"created_at": createdAt, "created_by_name": createdBy, "item_count": itemCount,
		})
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "Purchases retrieved successfully", "data": list})
}

func (h *PurchasingHandler) GetPurchase(c *gin.Context) {
	id := c.Param("id")
	var supplier, reference, notes string
	var total float64
	var createdAt interface{}
	err := h.db.QueryRow(`
		SELECT COALESCE(supplier,''), COALESCE(reference,''), COALESCE(notes,''), total_cost, created_at
		FROM purchases WHERE id = $1
	`, id).Scan(&supplier, &reference, &notes, &total, &createdAt)
	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"success": false, "message": "Purchase not found"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Failed to fetch purchase", "error": err.Error()})
		return
	}
	rows, err := h.db.Query(`
		SELECT COALESCE(ing.name,''), pi.quantity, COALESCE(u.abbreviation,''), pi.unit_cost, pi.line_total
		FROM purchase_items pi
		LEFT JOIN ingredients ing ON ing.id = pi.ingredient_id
		LEFT JOIN units u ON u.id = pi.unit_id
		WHERE pi.purchase_id = $1
	`, id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Failed to fetch purchase items", "error": err.Error()})
		return
	}
	defer rows.Close()
	items := make([]map[string]interface{}, 0)
	for rows.Next() {
		var name, abbr string
		var qty, unitCost, lineTotal float64
		if err := rows.Scan(&name, &qty, &abbr, &unitCost, &lineTotal); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Failed to scan item", "error": err.Error()})
			return
		}
		items = append(items, map[string]interface{}{
			"ingredient_name": name, "quantity": qty, "unit_abbr": abbr, "unit_cost": unitCost, "line_total": lineTotal,
		})
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "Purchase retrieved successfully",
		"data": gin.H{"supplier": supplier, "reference": reference, "notes": notes, "total_cost": total, "created_at": createdAt, "items": items}})
}

// ============================================================
// Stock Counts (الجرد) — نظري مقابل فعلي + تسوية الفرق
// ============================================================

func (h *PurchasingHandler) CreateStockCount(c *gin.Context) {
	var req struct {
		Notes *string `json:"notes"`
		Items []struct {
			IngredientID string  `json:"ingredient_id"`
			CountedQty   float64 `json:"counted_qty"`
		} `json:"items"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "Invalid request body", "error": err.Error()})
		return
	}
	if len(req.Items) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "أدخل عناصر الجرد"})
		return
	}
	userID, _, _, _ := middleware.GetUserFromContext(c)
	var createdBy interface{}
	if userID.String() != "00000000-0000-0000-0000-000000000000" {
		createdBy = userID
	}

	tx, err := h.db.Begin()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Failed to start transaction", "error": err.Error()})
		return
	}
	defer tx.Rollback()

	var countID string
	if err := tx.QueryRow(`INSERT INTO stock_counts (notes, created_by, total_variance_cost) VALUES ($1,$2,0) RETURNING id`,
		req.Notes, createdBy).Scan(&countID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Failed to create stock count", "error": err.Error()})
		return
	}

	totalVarCost := 0.0
	for _, it := range req.Items {
		if it.IngredientID == "" {
			continue
		}
		var sysQty, cost float64
		if err := tx.QueryRow(`SELECT current_stock, cost_per_unit FROM ingredients WHERE id = $1`, it.IngredientID).Scan(&sysQty, &cost); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Ingredient not found", "error": err.Error()})
			return
		}
		variance := it.CountedQty - sysQty
		varCost := variance * cost
		totalVarCost += varCost

		if _, err := tx.Exec(`
			INSERT INTO stock_count_items (count_id, ingredient_id, system_qty, counted_qty, variance, variance_cost)
			VALUES ($1,$2,$3,$4,$5,$6)
		`, countID, it.IngredientID, sysQty, it.CountedQty, variance, varCost); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Failed to insert count item", "error": err.Error()})
			return
		}
		// reconcile system stock to the physical count
		if _, err := tx.Exec(`UPDATE ingredients SET current_stock = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`, it.CountedQty, it.IngredientID); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Failed to reconcile stock", "error": err.Error()})
			return
		}
		if variance != 0 {
			if _, err := tx.Exec(`
				INSERT INTO stock_movements (ingredient_id, movement_type, quantity, balance_after, reference_type, reference_id, created_by)
				VALUES ($1,'adjustment',$2,$3,'count',$4,$5)
			`, it.IngredientID, variance, it.CountedQty, countID, createdBy); err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Failed to record movement", "error": err.Error()})
				return
			}
		}
	}

	if _, err := tx.Exec(`UPDATE stock_counts SET total_variance_cost = $1 WHERE id = $2`, totalVarCost, countID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Failed to finalize count", "error": err.Error()})
		return
	}
	if err := tx.Commit(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Failed to commit count", "error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"success": true, "message": "تم تسجيل الجرد وتسوية المخزون",
		"data": gin.H{"id": countID, "total_variance_cost": totalVarCost}})
}

func (h *PurchasingHandler) GetStockCounts(c *gin.Context) {
	rows, err := h.db.Query(`
		SELECT sc.id, sc.total_variance_cost, sc.created_at, COALESCE(u.first_name || ' ' || u.last_name, ''),
		       (SELECT COUNT(*) FROM stock_count_items i WHERE i.count_id = sc.id)
		FROM stock_counts sc LEFT JOIN users u ON sc.created_by = u.id
		ORDER BY sc.created_at DESC LIMIT 100
	`)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Failed to fetch stock counts", "error": err.Error()})
		return
	}
	defer rows.Close()
	list := make([]map[string]interface{}, 0)
	for rows.Next() {
		var id, createdBy string
		var varCost float64
		var createdAt interface{}
		var itemCount int
		if err := rows.Scan(&id, &varCost, &createdAt, &createdBy, &itemCount); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Failed to scan count", "error": err.Error()})
			return
		}
		list = append(list, map[string]interface{}{
			"id": id, "total_variance_cost": varCost, "created_at": createdAt, "created_by_name": createdBy, "item_count": itemCount,
		})
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "Stock counts retrieved successfully", "data": list})
}

func (h *PurchasingHandler) GetStockCount(c *gin.Context) {
	id := c.Param("id")
	rows, err := h.db.Query(`
		SELECT COALESCE(ing.name,''), COALESCE(u.abbreviation,''), sci.system_qty, sci.counted_qty, sci.variance, sci.variance_cost
		FROM stock_count_items sci
		LEFT JOIN ingredients ing ON ing.id = sci.ingredient_id
		LEFT JOIN units u ON u.id = ing.unit_id
		WHERE sci.count_id = $1
		ORDER BY ing.name
	`, id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Failed to fetch count items", "error": err.Error()})
		return
	}
	defer rows.Close()
	items := make([]map[string]interface{}, 0)
	for rows.Next() {
		var name, abbr string
		var sysQty, countedQty, variance, varCost float64
		if err := rows.Scan(&name, &abbr, &sysQty, &countedQty, &variance, &varCost); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Failed to scan count item", "error": err.Error()})
			return
		}
		items = append(items, map[string]interface{}{
			"ingredient_name": name, "unit_abbr": abbr, "system_qty": sysQty, "counted_qty": countedQty,
			"variance": variance, "variance_cost": varCost,
		})
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "Stock count retrieved successfully", "data": items})
}

// ============================================================
// Inventory report (تقرير المخزون) — توريد/استهلاك/هالك + القيمة الحالية
// ============================================================

func (h *PurchasingHandler) GetInventoryReport(c *gin.Context) {
	from := c.Query("from")
	to := c.Query("to")
	var fromArg, toArg interface{}
	if from != "" {
		fromArg = from
	}
	if to != "" {
		toArg = to
	}

	rows, err := h.db.Query(`
		SELECT i.id, i.name, COALESCE(u.abbreviation,''), i.current_stock, i.cost_per_unit,
		       COALESCE(SUM(CASE WHEN sm.movement_type IN ('purchase','restock') THEN sm.quantity ELSE 0 END),0) AS received,
		       COALESCE(-SUM(CASE WHEN sm.movement_type IN ('sale','cancel_return') THEN sm.quantity ELSE 0 END),0) AS consumed,
		       COALESCE(-SUM(CASE WHEN sm.movement_type = 'waste' THEN sm.quantity ELSE 0 END),0) AS wasted
		FROM ingredients i
		LEFT JOIN units u ON u.id = i.unit_id
		LEFT JOIN stock_movements sm ON sm.ingredient_id = i.id
			AND sm.created_at >= COALESCE($1::timestamptz, CURRENT_DATE - INTERVAL '30 days')
			AND sm.created_at < COALESCE($2::timestamptz, CURRENT_DATE + INTERVAL '1 day')
		WHERE i.is_active = true
		GROUP BY i.id, i.name, u.abbreviation, i.current_stock, i.cost_per_unit
		ORDER BY i.name ASC
	`, fromArg, toArg)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Failed to build inventory report", "error": err.Error()})
		return
	}
	defer rows.Close()

	report := make([]map[string]interface{}, 0)
	var totalInvValue, totalConsumedValue, totalWastedValue float64
	for rows.Next() {
		var id, name, abbr string
		var curStock, cost, received, consumed, wasted float64
		if err := rows.Scan(&id, &name, &abbr, &curStock, &cost, &received, &consumed, &wasted); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Failed to scan report row", "error": err.Error()})
			return
		}
		stockValue := curStock * cost
		consumedValue := consumed * cost
		wastedValue := wasted * cost
		totalInvValue += stockValue
		totalConsumedValue += consumedValue
		totalWastedValue += wastedValue
		report = append(report, map[string]interface{}{
			"ingredient_id": id, "name": name, "unit_abbr": abbr,
			"received": received, "consumed": consumed, "wasted": wasted,
			"current_stock": curStock, "cost_per_unit": cost, "stock_value": stockValue,
			"consumed_value": consumedValue, "wasted_value": wastedValue,
		})
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "message": "Inventory report retrieved successfully",
		"data": gin.H{
			"items": report,
			"summary": gin.H{
				"total_inventory_value": totalInvValue,
				"total_consumed_value":  totalConsumedValue,
				"total_wasted_value":    totalWastedValue,
			},
		}})
}
