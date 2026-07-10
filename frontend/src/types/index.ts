// API Response Types
export interface APIResponse<T = any> {
  success: boolean;
  message: string;
  data?: T;
  error?: string;
}

export interface PaginatedResponse<T = any> {
  success: boolean;
  message: string;
  data: T;
  meta: MetaData;
}

export interface MetaData {
  current_page: number;
  per_page: number;
  total: number;
  total_pages: number;
}

// User Types
export interface User {
  id: string;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  role: 'admin' | 'manager' | 'cashier' | 'kitchen';
  is_active: boolean;
  must_change_password?: boolean;
  created_at: string;
  updated_at: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  user: User;
}

// Category Types
export interface Category {
  id: string;
  name: string;
  description?: string;
  color?: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// Product Types
export interface Product {
  id: string;
  category_id?: string;
  name: string;
  description?: string;
  price: number;
  image_url?: string;
  barcode?: string;
  sku?: string;
  is_available: boolean;
  preparation_time: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
  category?: Category;
}

// Table Types
export interface DiningTable {
  id: string;
  table_number: string;
  seating_capacity: number;
  location?: string;
  is_occupied: boolean;
  created_at: string;
  updated_at: string;
}

// Order Types
export interface Order {
  id: string;
  order_number: string;
  table_id?: string;
  user_id?: string;
  customer_name?: string;
  customer_phone?: string;
  delivery_address?: string;
  order_type: 'dine_in' | 'takeout' | 'delivery';
  status: 'pending' | 'confirmed' | 'preparing' | 'ready' | 'served' | 'completed' | 'cancelled';
  subtotal: number;
  tax_amount: number;
  discount_amount: number;
  delivery_fee?: number;
  total_amount: number;
  notes?: string;
  created_at: string;
  updated_at: string;
  served_at?: string;
  completed_at?: string;
  table?: DiningTable;
  user?: User;
  items?: OrderItem[];
  payments?: Payment[];
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  special_instructions?: string;
  status: 'pending' | 'preparing' | 'ready' | 'served';
  created_at: string;
  updated_at: string;
  product?: Product;
  modifiers?: OrderItemModifier[];
  notes?: string; // Alternative field name for special instructions
}

// Sizes / add-ons chosen on a sold line (name and price snapshotted at sale time)
export interface OrderItemModifier {
  id: string;
  order_item_id: string;
  modifier_id?: string;
  name: string;
  price_delta: number;
}

// A selectable option inside a modifier group
export interface Modifier {
  id: string;
  name: string;
  price_delta: number;
  is_available: boolean;
  sort_order: number;
}

// A choice group on a product, e.g. "الحجم" (pick one) or "إضافات" (pick any)
export interface ModifierGroup {
  id: string;
  name: string;
  min_select: number;
  max_select: number; // 0 = unlimited
  sort_order: number;
  modifiers: Modifier[];
}

export interface CreateOrderRequest {
  table_id?: string;
  customer_name?: string;
  order_type: 'dine_in' | 'takeout' | 'delivery';
  items: CreateOrderItem[];
  notes?: string;
}

export interface CreateOrderItem {
  product_id: string;
  quantity: number;
  special_instructions?: string;
}

export interface UpdateOrderStatusRequest {
  status: 'pending' | 'confirmed' | 'preparing' | 'ready' | 'served' | 'completed' | 'cancelled';
  notes?: string;
}

// Payment Types
export interface Payment {
  id: string;
  order_id: string;
  payment_method: 'cash' | 'credit_card' | 'debit_card' | 'digital_wallet';
  amount: number;
  reference_number?: string;
  status: 'pending' | 'completed' | 'failed' | 'refunded';
  processed_by?: string;
  processed_at?: string;
  created_at: string;
  processed_by_user?: User;
}

export interface ProcessPaymentRequest {
  payment_method: 'cash' | 'credit_card' | 'debit_card' | 'digital_wallet';
  amount: number;
  reference_number?: string;
}

export interface PaymentSummary {
  order_id: string;
  total_amount: number;
  total_paid: number;
  pending_amount: number;
  remaining_amount: number;
  is_fully_paid: boolean;
  payment_count: number;
}

// Cart Types (Frontend Only)
export interface CartItem {
  product: Product;
  quantity: number;
  special_instructions?: string;
}

export interface Cart {
  items: CartItem[];
  subtotal: number;
  tax_amount: number;
  total_amount: number;
}

// Dashboard Types
export interface DashboardStats {
  today_orders: number;
  today_revenue: number;
  active_orders: number;
  occupied_tables: number;
  yesterday_orders: number;
  yesterday_revenue: number;
}

// Settings (key/value map)
export type AppSettings = Record<string, string>;

// Backups (النسخ الاحتياطي)
export interface BackupInfo {
  name: string;
  size_bytes: number;
  created_at: string;
  /** "safety" dumps are taken automatically before a restore and are never auto-pruned. */
  kind: 'backup' | 'safety';
  /** True when this dump also exists at the external destination. */
  on_external: boolean;
}

export interface BackupSettingsInput {
  auto_enabled: boolean;
  interval_hours: number;
  retention_days: number;
  external_path: string;
}

export interface BackupStatus extends BackupSettingsInput {
  last_at: string;
  last_status: string;
  backup_dir: string;
  /** False when pg_dump could not be located — nothing here works without it. */
  tools_found: boolean;
  tools_dir: string;
  /** Re-checked on every read, so an unplugged USB stick shows up immediately. */
  external_ok: boolean;
  external_error?: string;
}

export interface BackupRunResult {
  info: BackupInfo;
  external_path?: string;
  external_error?: string;
  pruned: number;
}

export interface SalesReportItem {
  date: string;
  order_count: number;
  revenue: number;
}

export interface OrdersReportItem {
  status: string;
  count: number;
  avg_amount: number;
}

// Kitchen Types
export interface KitchenOrder {
  id: string;
  order_number: string;
  table_id?: string;
  table_number?: string;
  order_type: string;
  status: string;
  customer_name?: string;
  created_at: string;
  items?: OrderItem[];
}

// Table Status Types
export interface TableStatus {
  total_tables: number;
  occupied_tables: number;
  available_tables: number;
  occupancy_rate: number;
  by_location: LocationStats[];
}

export interface LocationStats {
  location: string;
  total_tables: number;
  occupied_tables: number;
  available_tables: number;
  occupancy_rate: number;
}

// Filter and Query Types
export interface OrderFilters {
  /** One status, a comma-separated list, or an array (joined by the client). */
  status?: string | string[];
  order_type?: string;
  page?: number;
  per_page?: number;
}

export interface ProductFilters {
  category_id?: string;
  available?: boolean;
  search?: string;
  page?: number;
  per_page?: number;
}

export interface TableFilters {
  location?: string;
  occupied_only?: boolean;
  available_only?: boolean;
}

// ============================================================
// Recipe / Ingredient System Types (نظام الوصفات والمكوّنات)
// ============================================================

export type UnitType = 'weight' | 'volume' | 'count';

export interface Unit {
  id: string;
  name: string;
  abbreviation: string;
  unit_type: UnitType;
  base_factor: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Ingredient {
  id: string;
  name: string;
  unit_id?: string;
  current_stock: number;
  minimum_stock: number;
  cost_per_unit: number;
  waste_pct: number;
  supplier?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  unit?: Unit;
  is_low_stock: boolean;
}

export type ComponentType = 'ingredient' | 'sub_recipe';

export interface RecipeItem {
  id?: string;
  recipe_id?: string;
  component_type: ComponentType;
  ingredient_id?: string;
  sub_recipe_id?: string;
  quantity: number;
  unit_id: string;
  ingredient_name?: string;
  sub_recipe_name?: string;
  unit_name?: string;
  line_cost?: number;
}

export interface Recipe {
  id: string;
  product_id?: string;
  is_sub_recipe: boolean;
  name?: string;
  yield_quantity: number;
  yield_unit_id?: string;
  yield_unit_abbr?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
  items?: RecipeItem[];
  total_cost: number;
  cost_per_unit: number;
}

// التحضيرة (وصفة فرعية) في قائمة السرد
export interface SubRecipeOverview {
  id: string;
  name: string;
  yield_quantity: number;
  yield_unit_id: string;
  yield_unit_abbr: string;
  notes: string;
  item_count: number;
  batch_cost: number;
  cost_per_unit: number;
}

// بند يُرسل للحفظ (وصفة أو تحضيرة)
export interface RecipeItemInput {
  component_type: ComponentType;
  ingredient_id?: string;
  sub_recipe_id?: string;
  quantity: number;
  unit_id: string;
}

export interface RecipeOverviewItem {
  product_id: string;
  product_name: string;
  price: number;
  category_name: string;
  has_recipe: boolean;
  item_count: number;
  cost: number;
  food_cost_pct: number;
  margin: number;
}

export type MovementType = 'sale' | 'purchase' | 'waste' | 'adjustment' | 'cancel_return' | 'restock';

export interface StockMovement {
  id: string;
  ingredient_id: string;
  movement_type: MovementType;
  quantity: number;
  balance_after?: number;
  reference_type?: string;
  reference_id?: string;
  notes?: string;
  created_by?: string;
  created_at: string;
  created_by_name?: string;
}

export interface LowStockAlert {
  count: number;
  ingredients: Array<{
    id: string;
    name: string;
    current_stock: number;
    minimum_stock: number;
    unit_abbr: string;
  }>;
}

// ============================================================
// Purchasing + Stock Counts + Inventory Report (Phase 4)
// ============================================================

export interface PurchaseListItem {
  id: string;
  supplier: string;
  reference: string;
  total_cost: number;
  created_at: string;
  created_by_name: string;
  item_count: number;
}

export interface PurchaseInput {
  supplier?: string;
  reference?: string;
  notes?: string;
  items: Array<{ ingredient_id: string; quantity: number; unit_id: string; unit_cost: number }>;
}

export interface StockCountListItem {
  id: string;
  total_variance_cost: number;
  created_at: string;
  created_by_name: string;
  item_count: number;
}

export interface StockCountItemDetail {
  ingredient_name: string;
  unit_abbr: string;
  system_qty: number;
  counted_qty: number;
  variance: number;
  variance_cost: number;
}

export interface InventoryReportItem {
  ingredient_id: string;
  name: string;
  unit_abbr: string;
  received: number;
  consumed: number;
  wasted: number;
  current_stock: number;
  cost_per_unit: number;
  stock_value: number;
  consumed_value: number;
  wasted_value: number;
}

export interface InventoryReport {
  items: InventoryReportItem[];
  summary: {
    total_inventory_value: number;
    total_consumed_value: number;
    total_wasted_value: number;
  };
}

