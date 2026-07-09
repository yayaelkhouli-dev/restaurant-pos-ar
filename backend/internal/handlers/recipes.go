package handlers

import (
	"database/sql"
	"errors"
	"fmt"
	"log"
	"net/http"

	"pos-backend/internal/middleware"
	"pos-backend/internal/models"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// recordStockAlert persists a stock alert the manager can see in the admin panel.
// Best-effort: a failure here must never affect the sale, so we only log it.
func recordStockAlert(db *sql.DB, alertType string, orderID, ingredientID uuid.UUID, message string) {
	var oid, iid interface{}
	if orderID != uuid.Nil {
		oid = orderID
	}
	if ingredientID != uuid.Nil {
		iid = ingredientID
	}
	if _, err := db.Exec(`
		INSERT INTO stock_alerts (alert_type, order_id, ingredient_id, message)
		VALUES ($1,$2,$3,$4)`, alertType, oid, iid, message); err != nil {
		log.Printf("stock: failed to record alert: %v", err)
	}
}

// errRecipeCycle is returned when a sub-recipe reference would create a cycle
// (e.g. A uses B and B uses A) — which would corrupt cost/stock calculations.
var errRecipeCycle = errors.New("recipe_cycle")

// subRecipeCreatesCycle reports whether adding the edge ownerRecipeID -> startSubID
// would create a cycle, i.e. whether ownerRecipeID is already reachable from
// startSubID by following sub_recipe_id edges in the existing recipe graph.
func subRecipeCreatesCycle(tx *sql.Tx, ownerRecipeID, startSubID string) (bool, error) {
	if startSubID == ownerRecipeID {
		return true, nil
	}
	visited := map[string]bool{}
	stack := []string{startSubID}
	for len(stack) > 0 {
		cur := stack[len(stack)-1]
		stack = stack[:len(stack)-1]
		if cur == ownerRecipeID {
			return true, nil
		}
		if visited[cur] {
			continue
		}
		visited[cur] = true
		rows, err := tx.Query(`SELECT sub_recipe_id FROM recipe_items WHERE recipe_id = $1 AND sub_recipe_id IS NOT NULL`, cur)
		if err != nil {
			return false, err
		}
		for rows.Next() {
			var sid string
			if err := rows.Scan(&sid); err != nil {
				rows.Close()
				return false, err
			}
			stack = append(stack, sid)
		}
		rows.Close()
	}
	return false, nil
}

// RecipeHandler handles units, ingredients, recipes and sub-recipes
// (نظام الوصفات والمكوّنات والتحضيرات)
type RecipeHandler struct {
	db *sql.DB
}

func NewRecipeHandler(db *sql.DB) *RecipeHandler {
	return &RecipeHandler{db: db}
}

// ============================================================
// Units (وحدات القياس)
// ============================================================

func (h *RecipeHandler) GetUnits(c *gin.Context) {
	rows, err := h.db.Query(`
		SELECT id, name, abbreviation, unit_type, base_factor, is_active, created_at, updated_at
		FROM units WHERE is_active = true ORDER BY unit_type, base_factor
	`)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Failed to fetch units", "error": err.Error()})
		return
	}
	defer rows.Close()

	units := []models.Unit{}
	for rows.Next() {
		var u models.Unit
		if err := rows.Scan(&u.ID, &u.Name, &u.Abbreviation, &u.UnitType, &u.BaseFactor, &u.IsActive, &u.CreatedAt, &u.UpdatedAt); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Failed to scan unit", "error": err.Error()})
			return
		}
		units = append(units, u)
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "Units retrieved successfully", "data": units})
}

func (h *RecipeHandler) CreateUnit(c *gin.Context) {
	var req struct {
		Name         string  `json:"name" binding:"required"`
		Abbreviation string  `json:"abbreviation" binding:"required"`
		UnitType     string  `json:"unit_type" binding:"required"`
		BaseFactor   float64 `json:"base_factor"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "Invalid request body", "error": err.Error()})
		return
	}
	if req.BaseFactor <= 0 {
		req.BaseFactor = 1
	}
	var id string
	err := h.db.QueryRow(`
		INSERT INTO units (name, abbreviation, unit_type, base_factor) VALUES ($1,$2,$3,$4) RETURNING id
	`, req.Name, req.Abbreviation, req.UnitType, req.BaseFactor).Scan(&id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Failed to create unit", "error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"success": true, "message": "Unit created successfully", "data": gin.H{"id": id}})
}

func (h *RecipeHandler) UpdateUnit(c *gin.Context) {
	id := c.Param("id")
	var req struct {
		Name         *string  `json:"name"`
		Abbreviation *string  `json:"abbreviation"`
		UnitType     *string  `json:"unit_type"`
		BaseFactor   *float64 `json:"base_factor"`
		IsActive     *bool    `json:"is_active"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "Invalid request body", "error": err.Error()})
		return
	}
	_, err := h.db.Exec(`
		UPDATE units SET
			name = COALESCE($1, name), abbreviation = COALESCE($2, abbreviation),
			unit_type = COALESCE($3, unit_type), base_factor = COALESCE($4, base_factor),
			is_active = COALESCE($5, is_active), updated_at = CURRENT_TIMESTAMP
		WHERE id = $6
	`, req.Name, req.Abbreviation, req.UnitType, req.BaseFactor, req.IsActive, id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Failed to update unit", "error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "Unit updated successfully"})
}

func (h *RecipeHandler) DeleteUnit(c *gin.Context) {
	id := c.Param("id")
	var usage int
	h.db.QueryRow(`
		SELECT (SELECT COUNT(*) FROM ingredients WHERE unit_id = $1)
		     + (SELECT COUNT(*) FROM recipe_items WHERE unit_id = $1)
		     + (SELECT COUNT(*) FROM recipes WHERE yield_unit_id = $1)
	`, id).Scan(&usage)
	if usage > 0 {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "لا يمكن حذف وحدة مستخدمة", "error": "unit_in_use"})
		return
	}
	res, err := h.db.Exec(`DELETE FROM units WHERE id = $1`, id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Failed to delete unit", "error": err.Error()})
		return
	}
	if n, _ := res.RowsAffected(); n == 0 {
		c.JSON(http.StatusNotFound, gin.H{"success": false, "message": "Unit not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "Unit deleted successfully"})
}

// ============================================================
// Ingredients (المكوّنات الخام)
// ============================================================

func (h *RecipeHandler) GetIngredients(c *gin.Context) {
	search := c.Query("search")
	lowOnly := c.Query("low_stock") == "true"

	query := `
		SELECT i.id, i.name, i.unit_id, i.current_stock, i.minimum_stock, i.cost_per_unit, i.waste_pct,
		       i.supplier, i.is_active, i.created_at, i.updated_at,
		       u.name, u.abbreviation, u.unit_type, u.base_factor
		FROM ingredients i
		LEFT JOIN units u ON i.unit_id = u.id
		WHERE i.is_active = true
	`
	var args []interface{}
	if search != "" {
		query += ` AND i.name ILIKE $1`
		args = append(args, "%"+search+"%")
	}
	if lowOnly {
		query += ` AND i.current_stock <= i.minimum_stock`
	}
	query += ` ORDER BY i.name ASC`

	rows, err := h.db.Query(query, args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Failed to fetch ingredients", "error": err.Error()})
		return
	}
	defer rows.Close()

	ingredients := make([]models.Ingredient, 0)
	for rows.Next() {
		var ing models.Ingredient
		var unitName, unitAbbr, unitType sql.NullString
		var baseFactor sql.NullFloat64
		if err := rows.Scan(
			&ing.ID, &ing.Name, &ing.UnitID, &ing.CurrentStock, &ing.MinimumStock, &ing.CostPerUnit, &ing.WastePct,
			&ing.Supplier, &ing.IsActive, &ing.CreatedAt, &ing.UpdatedAt,
			&unitName, &unitAbbr, &unitType, &baseFactor,
		); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Failed to scan ingredient", "error": err.Error()})
			return
		}
		if unitName.Valid && ing.UnitID != nil {
			ing.Unit = &models.Unit{
				ID: *ing.UnitID, Name: unitName.String, Abbreviation: unitAbbr.String,
				UnitType: unitType.String, BaseFactor: baseFactor.Float64,
			}
		}
		ing.IsLowStock = ing.CurrentStock <= ing.MinimumStock
		ingredients = append(ingredients, ing)
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "Ingredients retrieved successfully", "data": ingredients})
}

func (h *RecipeHandler) CreateIngredient(c *gin.Context) {
	var req struct {
		Name         string  `json:"name" binding:"required"`
		UnitID       string  `json:"unit_id" binding:"required"`
		CurrentStock float64 `json:"current_stock"`
		MinimumStock float64 `json:"minimum_stock"`
		CostPerUnit  float64 `json:"cost_per_unit"`
		WastePct     float64 `json:"waste_pct"`
		Supplier     *string `json:"supplier"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "Invalid request body", "error": err.Error()})
		return
	}
	var id string
	err := h.db.QueryRow(`
		INSERT INTO ingredients (name, unit_id, current_stock, minimum_stock, cost_per_unit, waste_pct, supplier)
		VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id
	`, req.Name, req.UnitID, req.CurrentStock, req.MinimumStock, req.CostPerUnit, req.WastePct, req.Supplier).Scan(&id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Failed to create ingredient", "error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"success": true, "message": "Ingredient created successfully", "data": gin.H{"id": id}})
}

func (h *RecipeHandler) UpdateIngredient(c *gin.Context) {
	id := c.Param("id")
	var req struct {
		Name         *string  `json:"name"`
		UnitID       *string  `json:"unit_id"`
		CurrentStock *float64 `json:"current_stock"`
		MinimumStock *float64 `json:"minimum_stock"`
		CostPerUnit  *float64 `json:"cost_per_unit"`
		WastePct     *float64 `json:"waste_pct"`
		Supplier     *string  `json:"supplier"`
		IsActive     *bool    `json:"is_active"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "Invalid request body", "error": err.Error()})
		return
	}
	_, err := h.db.Exec(`
		UPDATE ingredients SET
			name = COALESCE($1, name), unit_id = COALESCE($2, unit_id),
			current_stock = COALESCE($3, current_stock), minimum_stock = COALESCE($4, minimum_stock),
			cost_per_unit = COALESCE($5, cost_per_unit), waste_pct = COALESCE($6, waste_pct),
			supplier = COALESCE($7, supplier), is_active = COALESCE($8, is_active),
			updated_at = CURRENT_TIMESTAMP
		WHERE id = $9
	`, req.Name, req.UnitID, req.CurrentStock, req.MinimumStock, req.CostPerUnit, req.WastePct, req.Supplier, req.IsActive, id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Failed to update ingredient", "error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "Ingredient updated successfully"})
}

func (h *RecipeHandler) AdjustStock(c *gin.Context) {
	id := c.Param("id")
	var req struct {
		Delta float64 `json:"delta"`
		Notes *string `json:"notes"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "Invalid request body", "error": err.Error()})
		return
	}
	userID, _, _, _ := middleware.GetUserFromContext(c)
	var newStock float64
	err := h.db.QueryRow(`
		UPDATE ingredients SET current_stock = GREATEST(current_stock + $1, 0), updated_at = CURRENT_TIMESTAMP
		WHERE id = $2 RETURNING current_stock
	`, req.Delta, id).Scan(&newStock)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Failed to adjust stock", "error": err.Error()})
		return
	}
	mType := "adjustment"
	if req.Delta > 0 {
		mType = "restock"
	} else if req.Delta < 0 {
		mType = "waste"
	}
	_, _ = h.db.Exec(`
		INSERT INTO stock_movements (ingredient_id, movement_type, quantity, balance_after, reference_type, notes, created_by)
		VALUES ($1,$2,$3,$4,'manual',$5,$6)
	`, id, mType, req.Delta, newStock, req.Notes, userID)
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "Stock adjusted successfully", "data": gin.H{"current_stock": newStock}})
}

func (h *RecipeHandler) GetStockMovements(c *gin.Context) {
	id := c.Param("id")
	rows, err := h.db.Query(`
		SELECT sm.id, sm.ingredient_id, sm.movement_type, sm.quantity, sm.balance_after,
		       sm.reference_type, sm.reference_id, sm.notes, sm.created_by, sm.created_at,
		       COALESCE(u.first_name || ' ' || u.last_name, '') AS created_by_name
		FROM stock_movements sm
		LEFT JOIN users u ON sm.created_by = u.id
		WHERE sm.ingredient_id = $1
		ORDER BY sm.created_at DESC LIMIT 100
	`, id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Failed to fetch movements", "error": err.Error()})
		return
	}
	defer rows.Close()
	movements := make([]models.StockMovement, 0)
	for rows.Next() {
		var m models.StockMovement
		if err := rows.Scan(&m.ID, &m.IngredientID, &m.MovementType, &m.Quantity, &m.BalanceAfter,
			&m.ReferenceType, &m.ReferenceID, &m.Notes, &m.CreatedBy, &m.CreatedAt, &m.CreatedByName); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Failed to scan movement", "error": err.Error()})
			return
		}
		movements = append(movements, m)
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "Stock movements retrieved successfully", "data": movements})
}

func (h *RecipeHandler) GetLowStockAlerts(c *gin.Context) {
	rows, err := h.db.Query(`
		SELECT i.id, i.name, i.current_stock, i.minimum_stock, u.abbreviation
		FROM ingredients i
		LEFT JOIN units u ON i.unit_id = u.id
		WHERE i.is_active = true AND i.current_stock <= i.minimum_stock
		ORDER BY (i.current_stock - i.minimum_stock) ASC
	`)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Failed to fetch low stock alerts", "error": err.Error()})
		return
	}
	defer rows.Close()
	alerts := make([]map[string]interface{}, 0)
	for rows.Next() {
		var id, name string
		var current, minimum float64
		var abbr sql.NullString
		if err := rows.Scan(&id, &name, &current, &minimum, &abbr); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Failed to scan alert", "error": err.Error()})
			return
		}
		alerts = append(alerts, map[string]interface{}{
			"id": id, "name": name, "current_stock": current, "minimum_stock": minimum, "unit_abbr": abbr.String,
		})
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "Low stock alerts retrieved successfully",
		"data": gin.H{"count": len(alerts), "ingredients": alerts}})
}

// GetStockAlerts returns unresolved stock event alerts (failed deductions / oversold).
func (h *RecipeHandler) GetStockAlerts(c *gin.Context) {
	rows, err := h.db.Query(`
		SELECT sa.id, sa.alert_type, sa.message, sa.order_id, sa.ingredient_id, sa.created_at,
		       COALESCE(i.name, '') AS ingredient_name
		FROM stock_alerts sa
		LEFT JOIN ingredients i ON i.id = sa.ingredient_id
		WHERE sa.resolved = false
		ORDER BY sa.created_at DESC
		LIMIT 200
	`)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Failed to fetch stock alerts", "error": err.Error()})
		return
	}
	defer rows.Close()
	alerts := make([]map[string]interface{}, 0)
	for rows.Next() {
		var id, alertType, message, ingredientName string
		var orderID, ingredientID sql.NullString
		var createdAt interface{}
		if err := rows.Scan(&id, &alertType, &message, &orderID, &ingredientID, &createdAt, &ingredientName); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Failed to scan alert", "error": err.Error()})
			return
		}
		alerts = append(alerts, map[string]interface{}{
			"id": id, "alert_type": alertType, "message": message,
			"order_id": orderID.String, "ingredient_id": ingredientID.String,
			"ingredient_name": ingredientName, "created_at": createdAt,
		})
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "Stock alerts retrieved successfully",
		"data": gin.H{"count": len(alerts), "alerts": alerts}})
}

// ResolveStockAlert marks a stock alert as handled.
func (h *RecipeHandler) ResolveStockAlert(c *gin.Context) {
	id := c.Param("id")
	res, err := h.db.Exec(`UPDATE stock_alerts SET resolved = true WHERE id = $1`, id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Failed to resolve alert", "error": err.Error()})
		return
	}
	if n, _ := res.RowsAffected(); n == 0 {
		c.JSON(http.StatusNotFound, gin.H{"success": false, "message": "Alert not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "تم تعليم التنبيه كمُعالَج"})
}

func (h *RecipeHandler) DeleteIngredient(c *gin.Context) {
	id := c.Param("id")
	var usage int
	h.db.QueryRow(`SELECT COUNT(*) FROM recipe_items WHERE ingredient_id = $1`, id).Scan(&usage)
	if usage > 0 {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "لا يمكن حذف مكوّن مستخدم في وصفات", "error": "ingredient_in_use"})
		return
	}
	res, err := h.db.Exec(`DELETE FROM ingredients WHERE id = $1`, id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Failed to delete ingredient", "error": err.Error()})
		return
	}
	if n, _ := res.RowsAffected(); n == 0 {
		c.JSON(http.StatusNotFound, gin.H{"success": false, "message": "Ingredient not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "Ingredient deleted successfully"})
}

// ============================================================
// Cost engine (محرّك التكلفة) — recursive, supports sub-recipes + waste
// ============================================================

// wasteFactor grosses-up a net quantity to account for waste loss.
func wasteFactor(wastePct float64) float64 {
	if wastePct > 0 && wastePct < 100 {
		return 1.0 / (1.0 - wastePct/100.0)
	}
	return 1.0
}

type queryer interface {
	Query(query string, args ...interface{}) (*sql.Rows, error)
}

type rawRecipeItem struct {
	componentType  string
	ingredientID   sql.NullString
	subRecipeID    sql.NullString
	quantity       float64
	itemUnitFactor float64
	ingCostPerUnit float64
	ingWastePct    float64
	ingUnitFactor  float64
	subYieldQty    float64
	subYieldFactor float64
}

func loadRawRecipeItems(q queryer, recipeID string) ([]rawRecipeItem, error) {
	rows, err := q.Query(`
		SELECT
			CASE WHEN ri.sub_recipe_id IS NOT NULL THEN 'sub_recipe' ELSE 'ingredient' END,
			ri.ingredient_id, ri.sub_recipe_id, ri.quantity,
			COALESCE(iu.base_factor, 1),
			COALESCE(ing.cost_per_unit, 0), COALESCE(ing.waste_pct, 0), COALESCE(su.base_factor, 1),
			COALESCE(sr.yield_quantity, 1), COALESCE(syu.base_factor, 1)
		FROM recipe_items ri
		LEFT JOIN units iu ON iu.id = ri.unit_id
		LEFT JOIN ingredients ing ON ing.id = ri.ingredient_id
		LEFT JOIN units su ON su.id = ing.unit_id
		LEFT JOIN recipes sr ON sr.id = ri.sub_recipe_id
		LEFT JOIN units syu ON syu.id = sr.yield_unit_id
		WHERE ri.recipe_id = $1
	`, recipeID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var items []rawRecipeItem
	for rows.Next() {
		var it rawRecipeItem
		if err := rows.Scan(&it.componentType, &it.ingredientID, &it.subRecipeID, &it.quantity,
			&it.itemUnitFactor, &it.ingCostPerUnit, &it.ingWastePct, &it.ingUnitFactor,
			&it.subYieldQty, &it.subYieldFactor); err != nil {
			return nil, err
		}
		items = append(items, it)
	}
	return items, nil
}

// recipeBatchCost returns the total cost of producing one full batch of a recipe,
// recursing into sub-recipes and applying ingredient waste.
func recipeBatchCost(q queryer, recipeID string, depth int) (float64, error) {
	if depth > 12 {
		return 0, nil
	}
	items, err := loadRawRecipeItems(q, recipeID)
	if err != nil {
		return 0, err
	}
	total := 0.0
	for _, it := range items {
		if it.componentType == "sub_recipe" && it.subRecipeID.Valid {
			subBatch, err := recipeBatchCost(q, it.subRecipeID.String, depth+1)
			if err != nil {
				return 0, err
			}
			usedInYield := it.quantity * (it.itemUnitFactor / it.subYieldFactor)
			if it.subYieldQty > 0 {
				total += subBatch * (usedInYield / it.subYieldQty)
			}
		} else if it.ingredientID.Valid {
			net := it.quantity * (it.itemUnitFactor / it.ingUnitFactor)
			total += net * wasteFactor(it.ingWastePct) * it.ingCostPerUnit
		}
	}
	return total, nil
}

// ============================================================
// Recipes — product recipes (وصفات الأصناف)
// ============================================================

func (h *RecipeHandler) GetRecipeByProduct(c *gin.Context) {
	productID := c.Param("product_id")
	var r models.Recipe
	err := h.db.QueryRow(`
		SELECT id, product_id, COALESCE(is_sub_recipe,false), name, yield_quantity, yield_unit_id, notes, created_at, updated_at
		FROM recipes WHERE product_id = $1 AND COALESCE(is_sub_recipe,false) = false
	`, productID).Scan(&r.ID, &r.ProductID, &r.IsSubRecipe, &r.Name, &r.YieldQuantity, &r.YieldUnitID, &r.Notes, &r.CreatedAt, &r.UpdatedAt)
	if err == sql.ErrNoRows {
		c.JSON(http.StatusOK, gin.H{"success": true, "message": "No recipe yet", "data": nil})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Failed to fetch recipe", "error": err.Error()})
		return
	}
	items, err := h.loadRecipeItems(r.ID.String())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Failed to fetch recipe items", "error": err.Error()})
		return
	}
	r.Items = items
	total, _ := recipeBatchCost(h.db, r.ID.String(), 0)
	r.TotalCost = total
	if r.YieldQuantity > 0 {
		r.CostPerUnit = total / r.YieldQuantity
	} else {
		r.CostPerUnit = total
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "Recipe retrieved successfully", "data": r})
}

// loadRecipeItems loads display items (with names + per-line cost) for a recipe.
func (h *RecipeHandler) loadRecipeItems(recipeID string) ([]models.RecipeItem, error) {
	rows, err := h.db.Query(`
		SELECT ri.id, ri.recipe_id, ri.ingredient_id, ri.sub_recipe_id, ri.quantity, ri.unit_id,
		       ri.created_at, ri.updated_at,
		       COALESCE(ing.name,''), COALESCE(sr.name,''), COALESCE(iu.abbreviation,''),
		       COALESCE(iu.base_factor,1),
		       COALESCE(ing.cost_per_unit,0), COALESCE(ing.waste_pct,0), COALESCE(su.base_factor,1),
		       COALESCE(sr.yield_quantity,1), COALESCE(syu.base_factor,1)
		FROM recipe_items ri
		LEFT JOIN ingredients ing ON ing.id = ri.ingredient_id
		LEFT JOIN recipes sr ON sr.id = ri.sub_recipe_id
		LEFT JOIN units iu ON iu.id = ri.unit_id
		LEFT JOIN units su ON su.id = ing.unit_id
		LEFT JOIN units syu ON syu.id = sr.yield_unit_id
		WHERE ri.recipe_id = $1
		ORDER BY ri.created_at
	`, recipeID)
	if err != nil {
		return nil, err
	}

	type tmp struct {
		it             models.RecipeItem
		itemUnitFactor float64
		ingCost        float64
		ingWaste       float64
		ingUnitFactor  float64
		subYieldQty    float64
		subYieldFactor float64
	}
	var rowsData []tmp
	for rows.Next() {
		var t tmp
		var ingID, subID sql.NullString
		if err := rows.Scan(&t.it.ID, &t.it.RecipeID, &ingID, &subID, &t.it.Quantity, &t.it.UnitID,
			&t.it.CreatedAt, &t.it.UpdatedAt, &t.it.IngredientName, &t.it.SubRecipeName, &t.it.UnitName,
			&t.itemUnitFactor, &t.ingCost, &t.ingWaste, &t.ingUnitFactor, &t.subYieldQty, &t.subYieldFactor); err != nil {
			rows.Close()
			return nil, err
		}
		if subID.Valid {
			t.it.ComponentType = "sub_recipe"
			if id, e := uuid.Parse(subID.String); e == nil {
				t.it.SubRecipeID = &id
			}
		} else if ingID.Valid {
			t.it.ComponentType = "ingredient"
			if id, e := uuid.Parse(ingID.String); e == nil {
				t.it.IngredientID = &id
			}
		}
		rowsData = append(rowsData, t)
	}
	rows.Close()

	items := make([]models.RecipeItem, 0, len(rowsData))
	for _, t := range rowsData {
		if t.it.ComponentType == "sub_recipe" && t.it.SubRecipeID != nil {
			subBatch, _ := recipeBatchCost(h.db, t.it.SubRecipeID.String(), 0)
			usedInYield := t.it.Quantity * (t.itemUnitFactor / t.subYieldFactor)
			if t.subYieldQty > 0 {
				t.it.LineCost = subBatch * (usedInYield / t.subYieldQty)
			}
		} else {
			net := t.it.Quantity * (t.itemUnitFactor / t.ingUnitFactor)
			t.it.LineCost = net * wasteFactor(t.ingWaste) * t.ingCost
		}
		items = append(items, t.it)
	}
	return items, nil
}

func (h *RecipeHandler) SaveRecipe(c *gin.Context) {
	productID := c.Param("product_id")
	var req struct {
		YieldQuantity float64 `json:"yield_quantity"`
		Notes         *string `json:"notes"`
		Items         []struct {
			ComponentType string  `json:"component_type"`
			IngredientID  *string `json:"ingredient_id"`
			SubRecipeID   *string `json:"sub_recipe_id"`
			Quantity      float64 `json:"quantity"`
			UnitID        string  `json:"unit_id"`
		} `json:"items"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "Invalid request body", "error": err.Error()})
		return
	}
	if req.YieldQuantity <= 0 {
		req.YieldQuantity = 1
	}

	tx, err := h.db.Begin()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Failed to start transaction", "error": err.Error()})
		return
	}
	defer tx.Rollback()

	var recipeID string
	err = tx.QueryRow(`
		INSERT INTO recipes (product_id, yield_quantity, notes, is_sub_recipe)
		VALUES ($1, $2, $3, false)
		ON CONFLICT (product_id) DO UPDATE SET yield_quantity = EXCLUDED.yield_quantity, notes = EXCLUDED.notes, updated_at = CURRENT_TIMESTAMP
		RETURNING id
	`, productID, req.YieldQuantity, req.Notes).Scan(&recipeID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Failed to save recipe", "error": err.Error()})
		return
	}

	if _, err := tx.Exec(`DELETE FROM recipe_items WHERE recipe_id = $1`, recipeID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Failed to clear recipe items", "error": err.Error()})
		return
	}
	if err := insertRecipeItems(tx, recipeID, req.Items); err != nil {
		if errors.Is(err, errRecipeCycle) {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "لا يمكن حفظ الوصفة: التحضيرة المختارة تُنشئ حلقة مغلقة (وصفة تستدعي نفسها)", "error": "recipe_cycle"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Failed to insert recipe item", "error": err.Error()})
		return
	}
	if err := tx.Commit(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Failed to commit recipe", "error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "تم حفظ الوصفة بنجاح", "data": gin.H{"recipe_id": recipeID}})
}

// insertRecipeItems inserts items that are either ingredients or sub-recipes.
func insertRecipeItems(tx *sql.Tx, recipeID string, items []struct {
	ComponentType string  `json:"component_type"`
	IngredientID  *string `json:"ingredient_id"`
	SubRecipeID   *string `json:"sub_recipe_id"`
	Quantity      float64 `json:"quantity"`
	UnitID        string  `json:"unit_id"`
}) error {
	for _, it := range items {
		if it.UnitID == "" || it.Quantity <= 0 {
			continue
		}
		if it.ComponentType == "sub_recipe" && it.SubRecipeID != nil && *it.SubRecipeID != "" {
			if *it.SubRecipeID == recipeID {
				return errRecipeCycle // direct self-reference
			}
			// Reject indirect cycles (A→B→A) that would corrupt cost/stock math
			cycle, err := subRecipeCreatesCycle(tx, recipeID, *it.SubRecipeID)
			if err != nil {
				return err
			}
			if cycle {
				return errRecipeCycle
			}
			if _, err := tx.Exec(`
				INSERT INTO recipe_items (recipe_id, sub_recipe_id, quantity, unit_id) VALUES ($1,$2,$3,$4)
			`, recipeID, *it.SubRecipeID, it.Quantity, it.UnitID); err != nil {
				return err
			}
		} else if it.IngredientID != nil && *it.IngredientID != "" {
			if _, err := tx.Exec(`
				INSERT INTO recipe_items (recipe_id, ingredient_id, quantity, unit_id) VALUES ($1,$2,$3,$4)
			`, recipeID, *it.IngredientID, it.Quantity, it.UnitID); err != nil {
				return err
			}
		}
	}
	return nil
}

func (h *RecipeHandler) DeleteRecipe(c *gin.Context) {
	productID := c.Param("product_id")
	res, err := h.db.Exec(`DELETE FROM recipes WHERE product_id = $1 AND COALESCE(is_sub_recipe,false) = false`, productID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Failed to delete recipe", "error": err.Error()})
		return
	}
	if n, _ := res.RowsAffected(); n == 0 {
		c.JSON(http.StatusNotFound, gin.H{"success": false, "message": "Recipe not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "Recipe deleted successfully"})
}

func (h *RecipeHandler) GetRecipesOverview(c *gin.Context) {
	rows, err := h.db.Query(`
		SELECT p.id, p.name, p.price, COALESCE(c.name,''), r.id, COALESCE(r.yield_quantity,1),
		       (SELECT COUNT(*) FROM recipe_items ri WHERE ri.recipe_id = r.id)
		FROM products p
		LEFT JOIN categories c ON p.category_id = c.id
		LEFT JOIN recipes r ON r.product_id = p.id AND COALESCE(r.is_sub_recipe,false) = false
		ORDER BY p.sort_order ASC, p.name ASC
	`)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Failed to fetch recipes overview", "error": err.Error()})
		return
	}

	type row struct {
		id, name, catName string
		price             float64
		recipeID          sql.NullString
		yield             float64
		itemCount         int
	}
	var data []row
	for rows.Next() {
		var rw row
		if err := rows.Scan(&rw.id, &rw.name, &rw.price, &rw.catName, &rw.recipeID, &rw.yield, &rw.itemCount); err != nil {
			rows.Close()
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Failed to scan overview row", "error": err.Error()})
			return
		}
		data = append(data, rw)
	}
	rows.Close()

	overview := make([]map[string]interface{}, 0, len(data))
	for _, rw := range data {
		costPerUnit := 0.0
		hasRecipe := rw.recipeID.Valid && rw.itemCount > 0
		if hasRecipe {
			batch, _ := recipeBatchCost(h.db, rw.recipeID.String, 0)
			if rw.yield > 0 {
				costPerUnit = batch / rw.yield
			} else {
				costPerUnit = batch
			}
		}
		foodCostPct := 0.0
		if rw.price > 0 {
			foodCostPct = costPerUnit / rw.price * 100
		}
		overview = append(overview, map[string]interface{}{
			"product_id": rw.id, "product_name": rw.name, "price": rw.price, "category_name": rw.catName,
			"has_recipe": hasRecipe, "item_count": rw.itemCount, "cost": costPerUnit,
			"food_cost_pct": foodCostPct, "margin": rw.price - costPerUnit,
		})
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "Recipes overview retrieved successfully", "data": overview})
}

// ============================================================
// Sub-recipes / preparations (التحضيرات)
// ============================================================

func (h *RecipeHandler) GetSubRecipes(c *gin.Context) {
	rows, err := h.db.Query(`
		SELECT r.id, r.name, r.yield_quantity, r.yield_unit_id, COALESCE(u.abbreviation,''), r.notes,
		       (SELECT COUNT(*) FROM recipe_items ri WHERE ri.recipe_id = r.id)
		FROM recipes r
		LEFT JOIN units u ON u.id = r.yield_unit_id
		WHERE COALESCE(r.is_sub_recipe,false) = true
		ORDER BY r.name ASC
	`)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Failed to fetch sub-recipes", "error": err.Error()})
		return
	}
	type row struct {
		id, name    string
		yield       float64
		yieldUnitID sql.NullString
		unitAbbr    string
		notes       sql.NullString
		itemCount   int
	}
	var data []row
	for rows.Next() {
		var rw row
		if err := rows.Scan(&rw.id, &rw.name, &rw.yield, &rw.yieldUnitID, &rw.unitAbbr, &rw.notes, &rw.itemCount); err != nil {
			rows.Close()
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Failed to scan sub-recipe", "error": err.Error()})
			return
		}
		data = append(data, rw)
	}
	rows.Close()

	result := make([]map[string]interface{}, 0, len(data))
	for _, rw := range data {
		batch, _ := recipeBatchCost(h.db, rw.id, 0)
		costPerUnit := batch
		if rw.yield > 0 {
			costPerUnit = batch / rw.yield
		}
		result = append(result, map[string]interface{}{
			"id": rw.id, "name": rw.name, "yield_quantity": rw.yield, "yield_unit_id": rw.yieldUnitID.String,
			"yield_unit_abbr": rw.unitAbbr, "notes": rw.notes.String, "item_count": rw.itemCount,
			"batch_cost": batch, "cost_per_unit": costPerUnit,
		})
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "Sub-recipes retrieved successfully", "data": result})
}

func (h *RecipeHandler) GetSubRecipe(c *gin.Context) {
	id := c.Param("id")
	var r models.Recipe
	var unitAbbr sql.NullString
	err := h.db.QueryRow(`
		SELECT r.id, COALESCE(r.is_sub_recipe,false), r.name, r.yield_quantity, r.yield_unit_id, r.notes,
		       r.created_at, r.updated_at, COALESCE(u.abbreviation,'')
		FROM recipes r LEFT JOIN units u ON u.id = r.yield_unit_id
		WHERE r.id = $1 AND COALESCE(r.is_sub_recipe,false) = true
	`, id).Scan(&r.ID, &r.IsSubRecipe, &r.Name, &r.YieldQuantity, &r.YieldUnitID, &r.Notes, &r.CreatedAt, &r.UpdatedAt, &unitAbbr)
	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"success": false, "message": "Sub-recipe not found"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Failed to fetch sub-recipe", "error": err.Error()})
		return
	}
	r.YieldUnitAbbr = unitAbbr.String
	items, err := h.loadRecipeItems(r.ID.String())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Failed to fetch sub-recipe items", "error": err.Error()})
		return
	}
	r.Items = items
	total, _ := recipeBatchCost(h.db, r.ID.String(), 0)
	r.TotalCost = total
	if r.YieldQuantity > 0 {
		r.CostPerUnit = total / r.YieldQuantity
	} else {
		r.CostPerUnit = total
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "Sub-recipe retrieved successfully", "data": r})
}

type subRecipeRequest struct {
	Name          string  `json:"name"`
	YieldQuantity float64 `json:"yield_quantity"`
	YieldUnitID   string  `json:"yield_unit_id"`
	Notes         *string `json:"notes"`
	Items         []struct {
		ComponentType string  `json:"component_type"`
		IngredientID  *string `json:"ingredient_id"`
		SubRecipeID   *string `json:"sub_recipe_id"`
		Quantity      float64 `json:"quantity"`
		UnitID        string  `json:"unit_id"`
	} `json:"items"`
}

func (h *RecipeHandler) CreateSubRecipe(c *gin.Context) {
	var req subRecipeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "Invalid request body", "error": err.Error()})
		return
	}
	if req.Name == "" || req.YieldUnitID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "الاسم ووحدة الناتج مطلوبان"})
		return
	}
	if req.YieldQuantity <= 0 {
		req.YieldQuantity = 1
	}
	tx, err := h.db.Begin()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Failed to start transaction", "error": err.Error()})
		return
	}
	defer tx.Rollback()
	var id string
	err = tx.QueryRow(`
		INSERT INTO recipes (is_sub_recipe, name, yield_quantity, yield_unit_id, notes)
		VALUES (true, $1, $2, $3, $4) RETURNING id
	`, req.Name, req.YieldQuantity, req.YieldUnitID, req.Notes).Scan(&id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Failed to create sub-recipe", "error": err.Error()})
		return
	}
	if err := insertRecipeItems(tx, id, req.Items); err != nil {
		if errors.Is(err, errRecipeCycle) {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "لا يمكن حفظ التحضيرة: تُنشئ حلقة مغلقة (تحضيرة تستدعي نفسها)", "error": "recipe_cycle"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Failed to insert items", "error": err.Error()})
		return
	}
	if err := tx.Commit(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Failed to commit", "error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"success": true, "message": "تم إنشاء التحضيرة بنجاح", "data": gin.H{"id": id}})
}

func (h *RecipeHandler) UpdateSubRecipe(c *gin.Context) {
	id := c.Param("id")
	var req subRecipeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "Invalid request body", "error": err.Error()})
		return
	}
	if req.YieldQuantity <= 0 {
		req.YieldQuantity = 1
	}
	tx, err := h.db.Begin()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Failed to start transaction", "error": err.Error()})
		return
	}
	defer tx.Rollback()
	if _, err := tx.Exec(`
		UPDATE recipes SET name = $1, yield_quantity = $2, yield_unit_id = $3, notes = $4, updated_at = CURRENT_TIMESTAMP
		WHERE id = $5 AND COALESCE(is_sub_recipe,false) = true
	`, req.Name, req.YieldQuantity, req.YieldUnitID, req.Notes, id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Failed to update sub-recipe", "error": err.Error()})
		return
	}
	if _, err := tx.Exec(`DELETE FROM recipe_items WHERE recipe_id = $1`, id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Failed to clear items", "error": err.Error()})
		return
	}
	if err := insertRecipeItems(tx, id, req.Items); err != nil {
		if errors.Is(err, errRecipeCycle) {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "لا يمكن حفظ التحضيرة: تُنشئ حلقة مغلقة (تحضيرة تستدعي نفسها)", "error": "recipe_cycle"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Failed to insert items", "error": err.Error()})
		return
	}
	if err := tx.Commit(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Failed to commit", "error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "تم حفظ التحضيرة بنجاح"})
}

func (h *RecipeHandler) DeleteSubRecipe(c *gin.Context) {
	id := c.Param("id")
	var usage int
	h.db.QueryRow(`SELECT COUNT(*) FROM recipe_items WHERE sub_recipe_id = $1`, id).Scan(&usage)
	if usage > 0 {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "لا يمكن حذف تحضيرة مستخدمة في وصفات أخرى", "error": "sub_recipe_in_use"})
		return
	}
	res, err := h.db.Exec(`DELETE FROM recipes WHERE id = $1 AND COALESCE(is_sub_recipe,false) = true`, id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Failed to delete sub-recipe", "error": err.Error()})
		return
	}
	if n, _ := res.RowsAffected(); n == 0 {
		c.JSON(http.StatusNotFound, gin.H{"success": false, "message": "Sub-recipe not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "Sub-recipe deleted successfully"})
}

// ============================================================
// Auto-deduction engine (محرّك الخصم التلقائي) — recursive
// ============================================================

// expandRecipeToIngredients accumulates raw-ingredient usage for a recipe, recursing
// into sub-recipes and applying ingredient waste. accum maps ingredient_id -> quantity
// in that ingredient's stock unit.
func expandRecipeToIngredients(tx *sql.Tx, recipeID string, multiplier float64, accum map[string]float64, depth int) error {
	if depth > 12 {
		return nil
	}
	items, err := loadRawRecipeItems(tx, recipeID)
	if err != nil {
		return err
	}
	for _, it := range items {
		if it.componentType == "sub_recipe" && it.subRecipeID.Valid {
			usedInYield := it.quantity * (it.itemUnitFactor / it.subYieldFactor)
			subMult := 0.0
			if it.subYieldQty > 0 {
				subMult = usedInYield / it.subYieldQty
			}
			if err := expandRecipeToIngredients(tx, it.subRecipeID.String, multiplier*subMult, accum, depth+1); err != nil {
				return err
			}
		} else if it.ingredientID.Valid {
			net := it.quantity * (it.itemUnitFactor / it.ingUnitFactor)
			accum[it.ingredientID.String] += net * wasteFactor(it.ingWastePct) * multiplier
		}
	}
	return nil
}

func processOrderStock(tx *sql.Tx, orderID, userID uuid.UUID, restore bool) error {
	sign := -1.0
	mType := "sale"
	if restore {
		sign = 1.0
		mType = "cancel_return"
	}

	rows, err := tx.Query(`
		SELECT oi.quantity, r.id, COALESCE(NULLIF(r.yield_quantity,0),1)
		FROM order_items oi
		JOIN recipes r ON r.product_id = oi.product_id AND COALESCE(r.is_sub_recipe,false) = false
		WHERE oi.order_id = $1
	`, orderID)
	if err != nil {
		return err
	}
	type oitem struct {
		qty      int
		recipeID string
		yield    float64
	}
	var orderItems []oitem
	for rows.Next() {
		var o oitem
		if err := rows.Scan(&o.qty, &o.recipeID, &o.yield); err != nil {
			rows.Close()
			return err
		}
		orderItems = append(orderItems, o)
	}
	rows.Close()

	accum := map[string]float64{}
	for _, o := range orderItems {
		mult := float64(o.qty)
		if o.yield > 0 {
			mult = float64(o.qty) / o.yield
		}
		if err := expandRecipeToIngredients(tx, o.recipeID, mult, accum, 0); err != nil {
			return err
		}
	}

	for ingID, qty := range accum {
		if qty == 0 {
			continue
		}
		delta := sign * qty
		var balanceAfter float64
		if err := tx.QueryRow(`
			UPDATE ingredients SET current_stock = current_stock + $1, updated_at = CURRENT_TIMESTAMP
			WHERE id = $2 RETURNING current_stock
		`, delta, ingID).Scan(&balanceAfter); err != nil {
			return err
		}
		var createdBy interface{}
		if userID != uuid.Nil {
			createdBy = userID
		}
		if _, err := tx.Exec(`
			INSERT INTO stock_movements (ingredient_id, movement_type, quantity, balance_after, reference_type, reference_id, created_by)
			VALUES ($1,$2,$3,$4,'order',$5,$6)
		`, ingID, mType, delta, balanceAfter, orderID, createdBy); err != nil {
			return err
		}
		// Alert when a sale drives an ingredient negative (oversold). Recorded in the
		// same tx so it commits atomically with the deduction.
		if !restore && balanceAfter < 0 {
			var iname sql.NullString
			tx.QueryRow(`SELECT name FROM ingredients WHERE id = $1`, ingID).Scan(&iname)
			msg := fmt.Sprintf("نقص المخزون: المكوّن «%s» أصبح رصيده بالسالب (%.2f) بعد بيع", iname.String, balanceAfter)
			if _, err := tx.Exec(`
				INSERT INTO stock_alerts (alert_type, order_id, ingredient_id, message)
				VALUES ('negative_stock',$1,$2,$3)`, orderID, ingID, msg); err != nil {
				return err
			}
		}
	}
	return nil
}

// DeductOrderStock / RestoreOrderStock run in their own transaction. Non-fatal: never
// block the sale — log a warning on failure. Call AFTER the order has been committed.
func DeductOrderStock(db *sql.DB, orderID, userID uuid.UUID) {
	runOrderStock(db, orderID, userID, false)
}

func RestoreOrderStock(db *sql.DB, orderID, userID uuid.UUID) {
	runOrderStock(db, orderID, userID, true)
}

func runOrderStock(db *sql.DB, orderID, userID uuid.UUID, restore bool) {
	tx, err := db.Begin()
	if err != nil {
		log.Printf("stock: begin tx failed for order %s: %v", orderID, err)
		return
	}
	defer tx.Rollback()
	if err := processOrderStock(tx, orderID, userID, restore); err != nil {
		log.Printf("stock: processing failed for order %s: %v", orderID, err)
		if !restore {
			recordStockAlert(db, "deduction_failed", orderID, uuid.Nil,
				fmt.Sprintf("فشل خصم المخزون تلقائياً لهذا الطلب — راجع المخزون يدوياً (%v)", err))
		}
		return
	}
	if err := tx.Commit(); err != nil {
		log.Printf("stock: commit failed for order %s: %v", orderID, err)
		if !restore {
			recordStockAlert(db, "deduction_failed", orderID, uuid.Nil,
				"فشل حفظ خصم المخزون لهذا الطلب — راجع المخزون يدوياً")
		}
	}
}
