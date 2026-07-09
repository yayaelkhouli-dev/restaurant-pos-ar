package models

import (
	"time"

	"github.com/google/uuid"
)

// User represents a system user/staff member
type User struct {
	ID           uuid.UUID `json:"id"`
	Username     string    `json:"username"`
	Email        string    `json:"email"`
	PasswordHash string    `json:"-"` // Don't expose password hash in JSON
	FirstName    string    `json:"first_name"`
	LastName     string    `json:"last_name"`
	Role               string    `json:"role"` // admin, manager, server, counter, kitchen
	IsActive           bool      `json:"is_active"`
	MustChangePassword bool      `json:"must_change_password"`
	CreatedAt          time.Time `json:"created_at"`
	UpdatedAt          time.Time `json:"updated_at"`
}

// Category represents a product category
type Category struct {
	ID          uuid.UUID `json:"id"`
	Name        string    `json:"name"`
	Description *string   `json:"description"`
	Color       *string   `json:"color"`
	SortOrder   int       `json:"sort_order"`
	IsActive    bool      `json:"is_active"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// Product represents a menu item/product
type Product struct {
	ID              uuid.UUID  `json:"id"`
	CategoryID      *uuid.UUID `json:"category_id"`
	Name            string     `json:"name"`
	Description     *string    `json:"description"`
	Price           float64    `json:"price"`
	ImageURL        *string    `json:"image_url"`
	Barcode         *string    `json:"barcode"`
	SKU             *string    `json:"sku"`
	IsAvailable     bool       `json:"is_available"`
	PreparationTime int        `json:"preparation_time"` // in minutes
	SortOrder       int        `json:"sort_order"`
	CreatedAt       time.Time  `json:"created_at"`
	UpdatedAt       time.Time  `json:"updated_at"`
	Category        *Category  `json:"category,omitempty"`
}

// DiningTable represents a table or dining area
type DiningTable struct {
	ID              uuid.UUID `json:"id"`
	TableNumber     string    `json:"table_number"`
	SeatingCapacity int       `json:"seating_capacity"`
	Location        *string   `json:"location"`
	IsOccupied      bool      `json:"is_occupied"`
	CreatedAt       time.Time `json:"created_at"`
	UpdatedAt       time.Time `json:"updated_at"`
}

// Order represents a customer order
type Order struct {
	ID             uuid.UUID    `json:"id"`
	OrderNumber    string       `json:"order_number"`
	TableID        *uuid.UUID   `json:"table_id"`
	UserID         *uuid.UUID   `json:"user_id"`
	CustomerName    *string     `json:"customer_name"`
	CustomerPhone   *string     `json:"customer_phone"`
	DeliveryAddress *string     `json:"delivery_address"`
	OrderType       string      `json:"order_type"` // dine_in, takeout, delivery
	Status          string      `json:"status"`     // pending, confirmed, preparing, ready, served, completed, cancelled
	Subtotal        float64     `json:"subtotal"`
	TaxAmount       float64     `json:"tax_amount"`
	DiscountAmount  float64     `json:"discount_amount"`
	DeliveryFee     float64     `json:"delivery_fee"`
	TotalAmount     float64     `json:"total_amount"`
	Notes           *string     `json:"notes"`
	CreatedAt      time.Time    `json:"created_at"`
	UpdatedAt      time.Time    `json:"updated_at"`
	ServedAt       *time.Time   `json:"served_at"`
	CompletedAt    *time.Time   `json:"completed_at"`
	Table          *DiningTable `json:"table,omitempty"`
	User           *User        `json:"user,omitempty"`
	Items          []OrderItem  `json:"items,omitempty"`
	Payments       []Payment    `json:"payments,omitempty"`
}

// OrderItem represents an item within an order
type OrderItem struct {
	ID                  uuid.UUID `json:"id"`
	OrderID             uuid.UUID `json:"order_id"`
	ProductID           uuid.UUID `json:"product_id"`
	Quantity            int       `json:"quantity"`
	UnitPrice           float64   `json:"unit_price"`
	TotalPrice          float64   `json:"total_price"`
	SpecialInstructions *string   `json:"special_instructions"`
	Status              string              `json:"status"` // pending, preparing, ready, served
	CreatedAt           time.Time           `json:"created_at"`
	UpdatedAt           time.Time           `json:"updated_at"`
	Product             *Product            `json:"product,omitempty"`
	Modifiers           []OrderItemModifier `json:"modifiers,omitempty"` // chosen sizes / add-ons
}

// OrderItemModifier is a size/add-on chosen on a sold line. Name and price are
// snapshotted at sale time so history survives modifier deletion.
type OrderItemModifier struct {
	ID          uuid.UUID  `json:"id"`
	OrderItemID uuid.UUID  `json:"order_item_id"`
	ModifierID  *uuid.UUID `json:"modifier_id"`
	Name        string     `json:"name"`
	PriceDelta  float64    `json:"price_delta"`
}

// Payment represents a payment transaction
type Payment struct {
	ID              uuid.UUID  `json:"id"`
	OrderID         uuid.UUID  `json:"order_id"`
	PaymentMethod   string     `json:"payment_method"` // cash, credit_card, debit_card, digital_wallet
	Amount          float64    `json:"amount"`
	ReferenceNumber *string    `json:"reference_number"`
	Status          string     `json:"status"` // pending, completed, failed, refunded
	ProcessedBy     *uuid.UUID `json:"processed_by"`
	ProcessedAt     *time.Time `json:"processed_at"`
	CreatedAt       time.Time  `json:"created_at"`
	ProcessedByUser *User      `json:"processed_by_user,omitempty"`
}

// Inventory represents product inventory
type Inventory struct {
	ID              uuid.UUID  `json:"id"`
	ProductID       uuid.UUID  `json:"product_id"`
	CurrentStock    int        `json:"current_stock"`
	MinimumStock    int        `json:"minimum_stock"`
	MaximumStock    int        `json:"maximum_stock"`
	UnitCost        *float64   `json:"unit_cost"`
	LastRestockedAt *time.Time `json:"last_restocked_at"`
	CreatedAt       time.Time  `json:"created_at"`
	UpdatedAt       time.Time  `json:"updated_at"`
	Product         *Product   `json:"product,omitempty"`
}

// Unit represents a unit of measure (وحدة قياس)
type Unit struct {
	ID           uuid.UUID `json:"id"`
	Name         string    `json:"name"`
	Abbreviation string    `json:"abbreviation"`
	UnitType     string    `json:"unit_type"` // weight, volume, count
	BaseFactor   float64   `json:"base_factor"`
	IsActive     bool      `json:"is_active"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

// Ingredient represents a raw material / stock item (مكوّن خام)
type Ingredient struct {
	ID           uuid.UUID  `json:"id"`
	Name         string     `json:"name"`
	UnitID       *uuid.UUID `json:"unit_id"`
	CurrentStock float64    `json:"current_stock"`
	MinimumStock float64    `json:"minimum_stock"`
	CostPerUnit  float64    `json:"cost_per_unit"`
	WastePct     float64    `json:"waste_pct"` // نسبة الهالك %
	Supplier     *string    `json:"supplier"`
	IsActive     bool       `json:"is_active"`
	CreatedAt    time.Time  `json:"created_at"`
	UpdatedAt    time.Time  `json:"updated_at"`
	Unit         *Unit      `json:"unit,omitempty"`
	IsLowStock   bool       `json:"is_low_stock"`
}

// Recipe represents a product's recipe or a sub-recipe/preparation (وصفة منتج أو تحضيرة)
type Recipe struct {
	ID            uuid.UUID    `json:"id"`
	ProductID     *uuid.UUID   `json:"product_id"`
	IsSubRecipe   bool         `json:"is_sub_recipe"`
	Name          *string      `json:"name"`          // اسم التحضيرة (للوصفات الفرعية)
	YieldQuantity float64      `json:"yield_quantity"`
	YieldUnitID   *uuid.UUID   `json:"yield_unit_id"` // وحدة ناتج التحضيرة
	Notes         *string      `json:"notes"`
	CreatedAt     time.Time    `json:"created_at"`
	UpdatedAt     time.Time    `json:"updated_at"`
	Items         []RecipeItem `json:"items,omitempty"`
	// Computed costing fields
	TotalCost    float64 `json:"total_cost"`     // تكلفة الوصفة كاملة (الدفعة)
	CostPerUnit  float64 `json:"cost_per_unit"`  // تكلفة الحصة/الوحدة الواحدة
	YieldUnitAbbr string `json:"yield_unit_abbr,omitempty"`
}

// RecipeItem represents one line in a recipe — either a raw ingredient or a sub-recipe
type RecipeItem struct {
	ID            uuid.UUID  `json:"id"`
	RecipeID      uuid.UUID  `json:"recipe_id"`
	ComponentType string     `json:"component_type"` // ingredient | sub_recipe
	IngredientID  *uuid.UUID `json:"ingredient_id"`
	SubRecipeID   *uuid.UUID `json:"sub_recipe_id"`
	Quantity      float64    `json:"quantity"`
	UnitID        uuid.UUID  `json:"unit_id"`
	CreatedAt     time.Time  `json:"created_at"`
	UpdatedAt     time.Time  `json:"updated_at"`
	// Joined / computed display fields
	IngredientName string  `json:"ingredient_name,omitempty"`
	SubRecipeName  string  `json:"sub_recipe_name,omitempty"`
	UnitName       string  `json:"unit_name,omitempty"`
	LineCost       float64 `json:"line_cost"` // تكلفة هذا البند
}

// StockMovement is an audit-trail record of an ingredient stock change (حركة مخزون)
type StockMovement struct {
	ID            uuid.UUID  `json:"id"`
	IngredientID  uuid.UUID  `json:"ingredient_id"`
	MovementType  string     `json:"movement_type"` // sale, purchase, waste, adjustment, cancel_return, restock
	Quantity      float64    `json:"quantity"`      // + in / - out, in the ingredient's stock unit
	BalanceAfter  *float64   `json:"balance_after"`
	ReferenceType *string    `json:"reference_type"`
	ReferenceID   *uuid.UUID `json:"reference_id"`
	Notes         *string    `json:"notes"`
	CreatedBy     *uuid.UUID `json:"created_by"`
	CreatedAt     time.Time  `json:"created_at"`
	// joined display fields
	IngredientName string `json:"ingredient_name,omitempty"`
	UnitAbbr       string `json:"unit_abbr,omitempty"`
	CreatedByName  string `json:"created_by_name,omitempty"`
}

// OrderStatusHistory tracks order status changes
type OrderStatusHistory struct {
	ID             uuid.UUID  `json:"id"`
	OrderID        uuid.UUID  `json:"order_id"`
	PreviousStatus *string    `json:"previous_status"`
	NewStatus      string     `json:"new_status"`
	ChangedBy      *uuid.UUID `json:"changed_by"`
	Notes          *string    `json:"notes"`
	CreatedAt      time.Time  `json:"created_at"`
	ChangedByUser  *User      `json:"changed_by_user,omitempty"`
}

// Request/Response DTOs

// CreateOrderRequest represents the request to create a new order
type CreateOrderRequest struct {
	TableID         *uuid.UUID        `json:"table_id"`
	CustomerName    *string           `json:"customer_name"`
	CustomerPhone   *string           `json:"customer_phone"`
	DeliveryAddress *string           `json:"delivery_address"`
	OrderType       string            `json:"order_type"`
	Items           []CreateOrderItem `json:"items"`
	Notes           *string           `json:"notes"`
	DiscountType    *string           `json:"discount_type"`  // "percent" | "amount"
	DiscountValue   *float64          `json:"discount_value"` // percentage (0-100) or a fixed amount
	DeliveryFee     *float64          `json:"delivery_fee"`   // added on top of the total
}

// CreateOrderItem represents an item in the order creation request
type CreateOrderItem struct {
	ProductID           uuid.UUID   `json:"product_id"`
	Quantity            int         `json:"quantity"`
	SpecialInstructions *string     `json:"special_instructions"`
	ModifierIDs         []uuid.UUID `json:"modifier_ids"` // chosen sizes / add-ons
}

// UpdateOrderStatusRequest represents the request to update order status
type UpdateOrderStatusRequest struct {
	Status string  `json:"status"`
	Notes  *string `json:"notes"`
}

// UpdateOrderItemsRequest replaces the items of an existing (unpaid, open) order.
// Discount and delivery fee are optional; when omitted the existing values are kept.
type UpdateOrderItemsRequest struct {
	Items         []CreateOrderItem `json:"items"`
	DiscountType  *string           `json:"discount_type"`
	DiscountValue *float64          `json:"discount_value"`
	DeliveryFee   *float64          `json:"delivery_fee"`
	Notes         *string           `json:"notes"`
}

// ProcessPaymentRequest represents the request to process a payment
type ProcessPaymentRequest struct {
	PaymentMethod   string  `json:"payment_method"`
	Amount          float64 `json:"amount"`
	ReferenceNumber *string `json:"reference_number"`
}

// LoginRequest represents the login request
type LoginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

// LoginResponse represents the login response
type LoginResponse struct {
	Token string `json:"token"`
	User  User   `json:"user"`
}

// APIResponse represents a generic API response.
//
// Data must NOT be `omitempty`: a nil Data would drop the key entirely, the
// browser client would read `undefined`, and TanStack Query rejects undefined —
// it errors and keeps serving the previous value. That is how a closed shift
// kept showing as open. An absent result is `"data": null`, always present.
type APIResponse struct {
	Success bool        `json:"success"`
	Message string      `json:"message"`
	Data    interface{} `json:"data"`
	Error   *string     `json:"error,omitempty"`
}

// PaginatedResponse represents a paginated API response
type PaginatedResponse struct {
	Success bool        `json:"success"`
	Message string      `json:"message"`
	Data    interface{} `json:"data"`
	Meta    MetaData    `json:"meta"`
}

// MetaData represents pagination metadata
type MetaData struct {
	CurrentPage int `json:"current_page"`
	PerPage     int `json:"per_page"`
	Total       int `json:"total"`
	TotalPages  int `json:"total_pages"`
}
