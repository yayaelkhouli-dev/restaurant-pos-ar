import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import type {
  APIResponse,
  PaginatedResponse,
  LoginRequest,
  LoginResponse,
  User,
  Product,
  Category,
  DiningTable,
  Order,
  OrderItem,
  Payment,
  CreateOrderRequest,
  UpdateOrderStatusRequest,
  ProcessPaymentRequest,
  PaymentSummary,
  DashboardStats,
  SalesReportItem,
  OrdersReportItem,
  KitchenOrder,
  TableStatus,
  OrderFilters,
  ProductFilters,
  TableFilters,
  Unit,
  Ingredient,
  Recipe,
  RecipeOverviewItem,
  RecipeItemInput,
  SubRecipeOverview,
  StockMovement,
  LowStockAlert,
  AppSettings,
  PurchaseListItem,
  PurchaseInput,
  StockCountListItem,
  StockCountItemDetail,
  InventoryReport,
  ModifierGroup,
  BackupInfo,
  BackupStatus,
  BackupSettingsInput,
  BackupRunResult,
} from '@/types';

class APIClient {
  private client: AxiosInstance;

  constructor() {
    // Default to a relative base so LAN terminals proxy through the Vite server
    // instead of hitting their own localhost.
    const apiUrl = import.meta.env?.VITE_API_URL || '/api/v1';
    console.log('🔧 API Client baseURL:', apiUrl);
    console.log('🔧 Environment VITE_API_URL:', import.meta.env?.VITE_API_URL);
    
    this.client = axios.create({
      baseURL: apiUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Request interceptor to add auth token
    this.client.interceptors.request.use(
      (config) => {
        const token = localStorage.getItem('pos_token');
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    // Response interceptor to handle auth errors
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401) {
          const url = error.config?.url || '';
          // A rejected login is the caller's business — bouncing it back to
          // /login would wipe the "wrong password" message.
          const isLoginAttempt = url.includes('/auth/login');
          // Redirecting to /login while already there reloads the page, which
          // re-fires the failing request: an endless reload loop.
          const alreadyOnLogin = window.location.pathname === '/login';

          if (!isLoginAttempt) {
            localStorage.removeItem('pos_token');
            localStorage.removeItem('pos_user');
            if (!alreadyOnLogin) window.location.href = '/login';
          }
        }
        return Promise.reject(error);
      }
    );
  }

  // Helper method to handle API responses
  private async request<T>(config: AxiosRequestConfig): Promise<T> {
    try {
      const response: AxiosResponse<T> = await this.client.request(config);
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(error.response?.data?.message || error.message);
      }
      throw error;
    }
  }

  // Authentication endpoints
  async login(credentials: LoginRequest): Promise<APIResponse<LoginResponse>> {
    return this.request({
      method: 'POST',
      url: '/auth/login',
      data: credentials,
    });
  }

  async logout(): Promise<APIResponse> {
    return this.request({
      method: 'POST',
      url: '/auth/logout',
    });
  }

  async getCurrentUser(): Promise<APIResponse<User>> {
    return this.request({
      method: 'GET',
      url: '/auth/me',
    });
  }

  async changePassword(currentPassword: string, newPassword: string): Promise<APIResponse> {
    return this.request({
      method: 'POST',
      url: '/auth/change-password',
      data: { current_password: currentPassword, new_password: newPassword },
    });
  }

  // Product endpoints
  async getProducts(filters?: ProductFilters): Promise<PaginatedResponse<Product[]>> {
    return this.request({
      method: 'GET',
      url: '/products',
      params: filters,
    });
  }

  async getProduct(id: string): Promise<APIResponse<Product>> {
    return this.request({
      method: 'GET',
      url: `/products/${id}`,
    });
  }

  async getCategories(activeOnly = true): Promise<APIResponse<Category[]>> {
    return this.request({
      method: 'GET',
      url: '/categories',
      params: { active_only: activeOnly },
    });
  }

  async getProductsByCategory(categoryId: string, availableOnly = true): Promise<APIResponse<Product[]>> {
    return this.request({
      method: 'GET',
      url: `/categories/${categoryId}/products`,
      params: { available_only: availableOnly },
    });
  }

  // Table endpoints
  async getTables(filters?: TableFilters): Promise<APIResponse<DiningTable[]>> {
    return this.request({
      method: 'GET',
      url: '/tables',
      params: filters,
    });
  }

  async getTable(id: string): Promise<APIResponse<DiningTable>> {
    return this.request({
      method: 'GET',
      url: `/tables/${id}`,
    });
  }

  async getTablesByLocation(): Promise<APIResponse<any[]>> {
    return this.request({
      method: 'GET',
      url: '/tables/by-location',
    });
  }

  async getTableStatus(): Promise<APIResponse<TableStatus>> {
    return this.request({
      method: 'GET',
      url: '/tables/status',
    });
  }

  // Order endpoints
  async getOrders(filters?: OrderFilters): Promise<PaginatedResponse<Order[]>> {
    // The backend reads `status` as one comma-separated value. Axios would
    // serialize an array as `status[]=a&status[]=b`, which it silently ignores —
    // dropping the filter entirely and returning completed orders too.
    const params: Record<string, unknown> = { ...(filters ?? {}) };
    if (Array.isArray(params.status)) {
      params.status = params.status.join(',');
    }
    return this.request({
      method: 'GET',
      url: '/orders',
      params,
    });
  }

  async createOrder(order: CreateOrderRequest): Promise<APIResponse<Order>> {
    return this.request({
      method: 'POST',
      url: '/orders',
      data: order,
    });
  }

  async getOrder(id: string): Promise<APIResponse<Order>> {
    return this.request({
      method: 'GET',
      url: `/orders/${id}`,
    });
  }

  async updateOrderStatus(id: string, status: Order['status'], notes?: string): Promise<APIResponse<Order>> {
    const statusUpdate: UpdateOrderStatusRequest = { status, notes };
    return this.request({
      method: 'PATCH',
      url: `/orders/${id}/status`,
      data: statusUpdate,
    });
  }

  // Payment endpoints
  async processPayment(orderId: string, payment: ProcessPaymentRequest): Promise<APIResponse<Payment>> {
    return this.request({
      method: 'POST',
      url: `/orders/${orderId}/payments`,
      data: payment,
    });
  }

  async getPayments(orderId: string): Promise<APIResponse<Payment[]>> {
    return this.request({
      method: 'GET',
      url: `/orders/${orderId}/payments`,
    });
  }

  async getPaymentSummary(orderId: string): Promise<APIResponse<PaymentSummary>> {
    return this.request({
      method: 'GET',
      url: `/orders/${orderId}/payment-summary`,
    });
  }

  // Dashboard endpoints
  async getDashboardStats(): Promise<APIResponse<DashboardStats>> {
    return this.request({
      method: 'GET',
      url: '/admin/dashboard/stats',
    });
  }

  async getSalesReport(period: 'today' | 'week' | 'month' = 'today'): Promise<APIResponse<SalesReportItem[]>> {
    return this.request({
      method: 'GET',
      url: '/admin/reports/sales',
      params: { period },
    });
  }

  async getOrdersReport(): Promise<APIResponse<OrdersReportItem[]>> {
    return this.request({
      method: 'GET',
      url: '/admin/reports/orders',
    });
  }

  async getIncomeReport(period: 'today' | 'week' | 'month' | 'year' = 'today'): Promise<APIResponse<any>> {
    return this.request({
      method: 'GET',
      url: '/admin/reports/income',
      params: { period },
    });
  }

  // Kitchen endpoints
  async getKitchenOrders(status?: string): Promise<APIResponse<Order[]>> {
    return this.request({
      method: 'GET',
      url: '/kitchen/orders',
      params: status && status !== 'all' ? { status } : {},
    });
  }

  async updateOrderItemStatus(orderId: string, itemId: string, status: string): Promise<APIResponse> {
    return this.request({
      method: 'PATCH',
      url: `/kitchen/orders/${orderId}/items/${itemId}/status`,
      data: { status },
    });
  }

  // Role-specific order creation
  async createServerOrder(order: CreateOrderRequest): Promise<APIResponse<Order>> {
    return this.request({
      method: 'POST',
      url: '/server/orders',
      data: order,
    });
  }

  async createCounterOrder(order: CreateOrderRequest): Promise<APIResponse<Order>> {
    return this.request({
      method: 'POST',
      url: '/counter/orders',
      data: order,
    });
  }

  // Counter payment processing
  async processCounterPayment(orderId: string, payment: ProcessPaymentRequest): Promise<APIResponse<Payment>> {
    return this.request({
      method: 'POST',
      url: `/counter/orders/${orderId}/payments`,
      data: payment,
    });
  }

  // User management endpoints (Admin only)
  async getUsers(): Promise<APIResponse<User[]>> {
    return this.request({
      method: 'GET',
      url: '/admin/users',
    });
  }

  async createUser(userData: any): Promise<APIResponse<User>> {
    return this.request({
      method: 'POST',
      url: '/admin/users',
      data: userData,
    });
  }

  async updateUser(id: string, userData: any): Promise<APIResponse<User>> {
    return this.request({
      method: 'PATCH',
      url: `/admin/users/${id}`,
      data: userData,
    });
  }

  async deleteUser(id: string): Promise<APIResponse> {
    return this.request({
      method: 'DELETE',
      url: `/admin/users/${id}`,
    });
  }

  // Admin-specific product management
  async createProduct(productData: any): Promise<APIResponse<Product>> {
    return this.request({ method: 'POST', url: '/admin/products', data: productData });
  }

  async updateProduct(id: string, productData: any): Promise<APIResponse<Product>> {
    return this.request({ method: 'PUT', url: `/admin/products/${id}`, data: productData });
  }

  async deleteProduct(id: string): Promise<APIResponse> {
    return this.request({ method: 'DELETE', url: `/admin/products/${id}` });
  }

  // Admin-specific category management  
  async createCategory(categoryData: any): Promise<APIResponse<Category>> {
    return this.request({ method: 'POST', url: '/admin/categories', data: categoryData });
  }

  async updateCategory(id: string, categoryData: any): Promise<APIResponse<Category>> {
    return this.request({ method: 'PUT', url: `/admin/categories/${id}`, data: categoryData });
  }

  async deleteCategory(id: string): Promise<APIResponse> {
    return this.request({ method: 'DELETE', url: `/admin/categories/${id}` });
  }

  // Admin products endpoint with pagination
  async getAdminProducts(params?: { page?: number, per_page?: number, limit?: number, search?: string, category_id?: string }): Promise<APIResponse<Product[]>> {
    // Normalize params (handle both per_page and limit)
    const normalizedParams = {
      page: params?.page,
      per_page: params?.per_page || params?.limit,
      search: params?.search,
      category_id: params?.category_id
    }
    
    return this.request({ 
      method: 'GET', 
      url: '/admin/products',
      params: normalizedParams
    });
  }

  // Admin categories endpoint with pagination
  async getAdminCategories(params?: { page?: number, per_page?: number, limit?: number, search?: string, active_only?: boolean }): Promise<APIResponse<Category[]>> {
    // Normalize params (handle both per_page and limit)
    const normalizedParams = {
      page: params?.page,
      per_page: params?.per_page || params?.limit,
      search: params?.search,
      active_only: params?.active_only
    }
    
    return this.request({ 
      method: 'GET', 
      url: '/admin/categories',
      params: normalizedParams
    });
  }

  // Admin tables endpoint with pagination
  async getAdminTables(params?: { page?: number, limit?: number, search?: string, status?: string }): Promise<APIResponse<DiningTable[]>> {
    return this.request({ 
      method: 'GET', 
      url: '/admin/tables',
      params 
    });
  }

  // Admin-specific table management
  async createTable(tableData: any): Promise<APIResponse<DiningTable>> {
    return this.request({ method: 'POST', url: '/admin/tables', data: tableData });
  }

  async updateTable(id: string, tableData: any): Promise<APIResponse<DiningTable>> {
    return this.request({ method: 'PUT', url: `/admin/tables/${id}`, data: tableData });
  }

  async deleteTable(id: string): Promise<APIResponse> {
    return this.request({ method: 'DELETE', url: `/admin/tables/${id}` });
  }

  // ============================================================
  // Recipe / Ingredient System (نظام الوصفات والمكوّنات)
  // ============================================================

  // Units
  async getUnits(): Promise<APIResponse<Unit[]>> {
    return this.request({ method: 'GET', url: '/admin/units' });
  }

  async createUnit(data: Partial<Unit>): Promise<APIResponse<{ id: string }>> {
    return this.request({ method: 'POST', url: '/admin/units', data });
  }

  async updateUnit(id: string, data: Partial<Unit>): Promise<APIResponse> {
    return this.request({ method: 'PUT', url: `/admin/units/${id}`, data });
  }

  async deleteUnit(id: string): Promise<APIResponse> {
    return this.request({ method: 'DELETE', url: `/admin/units/${id}` });
  }

  // Ingredients
  async getIngredients(params?: { search?: string; low_stock?: boolean }): Promise<APIResponse<Ingredient[]>> {
    return this.request({ method: 'GET', url: '/admin/ingredients', params });
  }

  async createIngredient(data: Partial<Ingredient>): Promise<APIResponse<{ id: string }>> {
    return this.request({ method: 'POST', url: '/admin/ingredients', data });
  }

  async updateIngredient(id: string, data: Partial<Ingredient>): Promise<APIResponse> {
    return this.request({ method: 'PUT', url: `/admin/ingredients/${id}`, data });
  }

  async adjustIngredientStock(id: string, delta: number): Promise<APIResponse<{ current_stock: number }>> {
    return this.request({ method: 'POST', url: `/admin/ingredients/${id}/adjust-stock`, data: { delta } });
  }

  async deleteIngredient(id: string): Promise<APIResponse> {
    return this.request({ method: 'DELETE', url: `/admin/ingredients/${id}` });
  }

  // Recipes
  async getRecipesOverview(): Promise<APIResponse<RecipeOverviewItem[]>> {
    return this.request({ method: 'GET', url: '/admin/recipes/overview' });
  }

  async getRecipeByProduct(productId: string): Promise<APIResponse<Recipe | null>> {
    return this.request({ method: 'GET', url: `/admin/recipes/product/${productId}` });
  }

  async saveRecipe(
    productId: string,
    data: { yield_quantity: number; notes?: string; items: RecipeItemInput[] }
  ): Promise<APIResponse<{ recipe_id: string }>> {
    return this.request({ method: 'PUT', url: `/admin/recipes/product/${productId}`, data });
  }

  async deleteRecipe(productId: string): Promise<APIResponse> {
    return this.request({ method: 'DELETE', url: `/admin/recipes/product/${productId}` });
  }

  // Sub-recipes / preparations (التحضيرات)
  async getSubRecipes(): Promise<APIResponse<SubRecipeOverview[]>> {
    return this.request({ method: 'GET', url: '/admin/sub-recipes' });
  }

  async getSubRecipe(id: string): Promise<APIResponse<Recipe>> {
    return this.request({ method: 'GET', url: `/admin/sub-recipes/${id}` });
  }

  async createSubRecipe(
    data: { name: string; yield_quantity: number; yield_unit_id: string; notes?: string; items: RecipeItemInput[] }
  ): Promise<APIResponse<{ id: string }>> {
    return this.request({ method: 'POST', url: '/admin/sub-recipes', data });
  }

  async updateSubRecipe(
    id: string,
    data: { name: string; yield_quantity: number; yield_unit_id: string; notes?: string; items: RecipeItemInput[] }
  ): Promise<APIResponse> {
    return this.request({ method: 'PUT', url: `/admin/sub-recipes/${id}`, data });
  }

  async deleteSubRecipe(id: string): Promise<APIResponse> {
    return this.request({ method: 'DELETE', url: `/admin/sub-recipes/${id}` });
  }

  // Stock movements & alerts (Phase 2)
  async getStockMovements(ingredientId: string): Promise<APIResponse<StockMovement[]>> {
    return this.request({ method: 'GET', url: `/admin/ingredients/${ingredientId}/movements` });
  }

  async getLowStockAlerts(): Promise<APIResponse<LowStockAlert>> {
    return this.request({ method: 'GET', url: '/admin/alerts/low-stock' });
  }

  // System settings
  async getSettings(): Promise<APIResponse<AppSettings>> {
    return this.request({ method: 'GET', url: '/admin/settings' });
  }

  // Public display settings (tax, currency, receipt text) — readable by all roles
  async getPublicSettings(): Promise<APIResponse<AppSettings>> {
    return this.request({ method: 'GET', url: '/settings/public' });
  }

  // Modifiers: sizes and add-ons (الأحجام والإضافات)
  async getProductModifiers(productId: string): Promise<APIResponse<ModifierGroup[]>> {
    return this.request({ method: 'GET', url: `/products/${productId}/modifiers` });
  }

  async createModifierGroup(data: {
    product_id: string; name: string; min_select: number; max_select: number; sort_order?: number;
  }): Promise<APIResponse<{ id: string }>> {
    return this.request({ method: 'POST', url: '/admin/modifier-groups', data });
  }

  async updateModifierGroup(
    id: string,
    data: { name: string; min_select: number; max_select: number; sort_order?: number }
  ): Promise<APIResponse> {
    return this.request({ method: 'PUT', url: `/admin/modifier-groups/${id}`, data });
  }

  async deleteModifierGroup(id: string): Promise<APIResponse> {
    return this.request({ method: 'DELETE', url: `/admin/modifier-groups/${id}` });
  }

  async createModifier(data: {
    group_id: string; name: string; price_delta: number; is_available?: boolean; sort_order?: number;
  }): Promise<APIResponse<{ id: string }>> {
    return this.request({ method: 'POST', url: '/admin/modifiers', data });
  }

  async updateModifier(
    id: string,
    data: { name: string; price_delta: number; is_available?: boolean; sort_order?: number }
  ): Promise<APIResponse> {
    return this.request({ method: 'PUT', url: `/admin/modifiers/${id}`, data });
  }

  async deleteModifier(id: string): Promise<APIResponse> {
    return this.request({ method: 'DELETE', url: `/admin/modifiers/${id}` });
  }

  // Cash-drawer shifts (الورديات)
  async openShift(openingCash: number, notes?: string): Promise<APIResponse<{ id: string }>> {
    return this.request({ method: 'POST', url: '/counter/shifts/open', data: { opening_cash: openingCash, notes } });
  }

  async getCurrentShift(): Promise<APIResponse<any>> {
    return this.request({ method: 'GET', url: '/counter/shifts/current' });
  }

  async closeShift(closingCash: number, notes?: string): Promise<APIResponse<any>> {
    return this.request({ method: 'POST', url: '/counter/shifts/close', data: { closing_cash: closingCash, notes } });
  }

  async getShiftReport(shiftId: string): Promise<APIResponse<any>> {
    return this.request({ method: 'GET', url: `/counter/shifts/${shiftId}/report` });
  }

  async listShifts(): Promise<APIResponse<any[]>> {
    return this.request({ method: 'GET', url: '/admin/shifts' });
  }

  /**
   * Append items to an open, unpaid order without touching the existing lines
   * (so already-served food keeps its kitchen status). Use this when a table
   * orders more; use updateOrderItems only to correct an existing order.
   */
  async addOrderItems(
    orderId: string,
    items: Array<{ product_id: string; quantity: number; special_instructions?: string; modifier_ids?: string[] }>,
    scope: 'server' | 'counter' = 'counter'
  ): Promise<APIResponse<Order>> {
    return this.request({ method: 'POST', url: `/${scope}/orders/${orderId}/items`, data: { items } });
  }

  // Replace the items of an open, unpaid order (recomputes totals + stock)
  async updateOrderItems(
    orderId: string,
    data: {
      items: Array<{ product_id: string; quantity: number; special_instructions?: string }>;
      discount_type?: 'percent' | 'amount';
      discount_value?: number;
      delivery_fee?: number;
      notes?: string;
    }
  ): Promise<APIResponse<Order>> {
    return this.request({ method: 'PUT', url: `/counter/orders/${orderId}/items`, data });
  }

  async updateSettings(data: AppSettings): Promise<APIResponse> {
    return this.request({ method: 'PUT', url: '/admin/settings', data });
  }

  // Backups (النسخ الاحتياطي)
  async getBackups(): Promise<APIResponse<BackupInfo[]>> {
    return this.request({ method: 'GET', url: '/admin/backups' });
  }

  async createBackup(): Promise<APIResponse<BackupRunResult>> {
    return this.request({ method: 'POST', url: '/admin/backups/create' });
  }

  async restoreBackup(name: string): Promise<APIResponse<{ safety_backup: string }>> {
    // `confirm` is required by the server: a restore overwrites every order and
    // payment, so it must never happen as a side effect of a stray request.
    return this.request({ method: 'POST', url: '/admin/backups/restore', data: { name, confirm: true } });
  }

  async deleteBackup(name: string): Promise<APIResponse> {
    return this.request({ method: 'POST', url: '/admin/backups/delete', data: { name } });
  }

  // Downloads through axios rather than a plain <a href>: the endpoint needs the
  // Authorization header, and a bare link would get a 401 — which the response
  // interceptor turns into a logout.
  async downloadBackup(name: string): Promise<Blob> {
    const response = await this.client.request<Blob>({
      method: 'GET',
      url: '/admin/backups/download',
      params: { name },
      responseType: 'blob',
    });
    return response.data;
  }

  async getBackupSettings(): Promise<APIResponse<BackupStatus>> {
    return this.request({ method: 'GET', url: '/admin/backup-settings' });
  }

  async updateBackupSettings(data: BackupSettingsInput): Promise<APIResponse<BackupStatus>> {
    return this.request({ method: 'PUT', url: '/admin/backup-settings', data });
  }

  // Purchasing (المشتريات)
  async getPurchases(): Promise<APIResponse<PurchaseListItem[]>> {
    return this.request({ method: 'GET', url: '/admin/purchases' });
  }

  async getPurchase(id: string): Promise<APIResponse<any>> {
    return this.request({ method: 'GET', url: `/admin/purchases/${id}` });
  }

  async createPurchase(data: PurchaseInput): Promise<APIResponse<{ id: string; total_cost: number }>> {
    return this.request({ method: 'POST', url: '/admin/purchases', data });
  }

  // Stock counts (الجرد)
  async getStockCounts(): Promise<APIResponse<StockCountListItem[]>> {
    return this.request({ method: 'GET', url: '/admin/stock-counts' });
  }

  async getStockCount(id: string): Promise<APIResponse<StockCountItemDetail[]>> {
    return this.request({ method: 'GET', url: `/admin/stock-counts/${id}` });
  }

  async createStockCount(data: { notes?: string; items: Array<{ ingredient_id: string; counted_qty: number }> }): Promise<APIResponse<{ id: string; total_variance_cost: number }>> {
    return this.request({ method: 'POST', url: '/admin/stock-counts', data });
  }

  // Inventory report (تقرير المخزون)
  async getInventoryReport(from?: string, to?: string): Promise<APIResponse<InventoryReport>> {
    return this.request({ method: 'GET', url: '/admin/reports/inventory', params: { from, to } });
  }

  // Utility methods
  setAuthToken(token: string): void {
    localStorage.setItem('pos_token', token);
  }

  clearAuth(): void {
    localStorage.removeItem('pos_token');
    localStorage.removeItem('pos_user');
  }

  getAuthToken(): string | null {
    return localStorage.getItem('pos_token');
  }

  isAuthenticated(): boolean {
    return !!this.getAuthToken();
  }
}

// Create and export a singleton instance
export const apiClient = new APIClient();
export default apiClient;

