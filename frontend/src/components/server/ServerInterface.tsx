import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/api/client'
import { formatCurrency } from '@/lib/utils'
import { toastHelpers } from '@/lib/toast-helpers'
import { useStoreSettings } from '@/hooks/useStoreSettings'
import { orderKeys, invalidateOrderData } from '@/lib/query-client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { 
  Plus, 
  Minus, 
  ShoppingCart, 
  Users, 
  User,
  Check,
  Clock,
  Table as TableIcon,
  Search,
  Settings,
  Package
} from 'lucide-react'
import type { Product, DiningTable, ModifierGroup } from '@/types'
import { ModifierDialog } from '@/components/counter/ModifierDialog'
import {
  type CartItem,
  type SelectedModifier,
  lineUnitPrice,
  cartSubtotal,
  addLine,
  incrementLine as incLine,
  decrementLine as decLine,
  cartToOrderItems,
} from '@/lib/cart'

interface CreateOrderRequest {
  order_type: 'dine_in' | 'takeout' | 'delivery'
  table_id: string
  customer_name?: string
  items: Array<{
    product_id: string
    quantity: number
    special_instructions?: string
    modifier_ids?: string[]
  }>
  notes?: string
}

export function ServerInterface() {
  const storeSettings = useStoreSettings()
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [selectedTable, setSelectedTable] = useState<DiningTable | null>(null)
  const [customerName, setCustomerName] = useState('')
  const [cart, setCart] = useState<CartItem[]>([])
  const [orderNotes, setOrderNotes] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [showTableView, setShowTableView] = useState(false)
  // When set, the sizes / add-ons dialog is open for this product
  const [modifierTarget, setModifierTarget] = useState<{ product: Product; groups: ModifierGroup[] } | null>(null)

  const queryClient = useQueryClient()

  // Fetch categories
  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      try {
        const response = await apiClient.getCategories()
        return response.data || []
      } catch (error) {
        console.error('Failed to fetch categories:', error)
        return []
      }
    }
  })

  // Fetch products
  const { data: products = [] } = useQuery({
    queryKey: ['products', selectedCategory],
    queryFn: async () => {
      try {
        let response
        if (selectedCategory === 'all') {
          response = await apiClient.getProducts()
        } else {
          response = await apiClient.getProductsByCategory(selectedCategory)
        }
        return response.data || []
      } catch (error) {
        console.error('Failed to fetch products:', error)
        return []
      }
    }
  })

  // Table occupancy changes from other screens (counter takes payment, kitchen
  // serves), so it must not sit behind the app-wide 5-minute staleTime.
  const { data: tables = [] } = useQuery({
    queryKey: ['tables'],
    queryFn: async () => {
      try {
        const response = await apiClient.getTables()
        return response.data || []
      } catch (error) {
        console.error('Failed to fetch tables:', error)
        return []
      }
    },
    staleTime: 0,
    refetchInterval: 10_000,
  })

  // Fetch active orders to show table status. 'served' counts as active: the
  // food is out but the bill is unpaid, so the table is still taken.
  const { data: activeOrders = [] } = useQuery({
    queryKey: orderKeys.active,
    queryFn: async () => {
      try {
        const response = await apiClient.getOrders({
          status: 'pending,confirmed,preparing,ready,served',
        })
        return response.data || []
      } catch (error) {
        console.error('Failed to fetch active orders:', error)
        return []
      }
    },
    staleTime: 0,
    refetchInterval: 10_000,
  })

  // Create order mutation (server endpoint - dine-in only)
  const createOrderMutation = useMutation({
    mutationFn: (orderData: CreateOrderRequest) => 
      apiClient.createServerOrder(orderData),
    onSuccess: (data) => {
      const orderNumber = data.data?.order_number
      // Reset form
      setCart([])
      setSelectedTable(null)
      setCustomerName('')
      setOrderNotes('')
      
      // Refresh data
      invalidateOrderData(queryClient)
      
      toastHelpers.orderCreated(orderNumber)
    },
    onError: (error: any) => {
      toastHelpers.apiError('الإنشاء', error, 'الطلب')
    }
  })

  // Filter products based on search
  const filteredProducts = products.filter(product =>
    product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (product.description?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false)
  )

  // Three honest states. The old version had two different states both labelled
  // "مشغولة", so the waiter could not tell them apart.
  const getTableStatus = (table: DiningTable) => {
    const orders = Array.isArray(activeOrders) ? activeOrders : []
    const hasActiveOrder = orders.some(order => order.table_id === table.id)

    if (hasActiveOrder) {
      return { status: 'occupied', label: 'مشغولة — عليها طلب', dot: 'bg-red-500' }
    }
    if (table.is_occupied) {
      return { status: 'seated', label: 'جالس — بدون طلب', dot: 'bg-amber-500' }
    }
    return { status: 'available', label: 'متاحة', dot: 'bg-green-500' }
  }

  // 'TAKEOUT' is a placeholder row for counter takeaway orders, not a real table.
  const dineInTables = tables.filter(table => table.table_number !== 'TAKEOUT')

  const tablesWithStatus = dineInTables.map(table => {
    const orders = Array.isArray(activeOrders) ? activeOrders : []
    return {
      ...table,
      statusInfo: getTableStatus(table),
      activeOrder: orders.find(order => order.table_id === table.id)
    }
  })

  // Every table is selectable. A table that already has a live order does not
  // start a second one — the new lines are appended to the open bill.
  // The open order on the currently selected table, if any.
  const openOrderOnTable = selectedTable
    ? (Array.isArray(activeOrders) ? activeOrders : []).find(o => o.table_id === selectedTable.id)
    : undefined

  const addLineToCart = (product: Product, mods: SelectedModifier[]) => {
    setCart(prev => addLine(prev, product, mods))
  }

  /**
   * Products with modifier groups (sizes / add-ons) must be configured before they
   * can be ordered — the backend rejects an order that violates a group's rules.
   */
  const handleAddProduct = async (product: Product) => {
    try {
      const groups = await queryClient.fetchQuery({
        queryKey: ['product-modifiers', product.id],
        queryFn: () => apiClient.getProductModifiers(product.id).then(r => r.data || []),
        staleTime: 5 * 60 * 1000,
      })
      if (groups && groups.length > 0) {
        setModifierTarget({ product, groups })
        return
      }
    } catch {
      // If options can't be loaded, still let the waiter add the plain product
    }
    addLineToCart(product, [])
  }

  const incrementLine = (key: string) => setCart(prev => incLine(prev, key))
  const decrementLine = (key: string) => setCart(prev => decLine(prev, key))

  const getTotalAmount = () => cartSubtotal(cart)

  // Appending to an open bill instead of opening a second one for the same table.
  const addItemsMutation = useMutation({
    mutationFn: (orderId: string) =>
      apiClient.addOrderItems(orderId, cartToOrderItems(cart), 'server'),
    onSuccess: (data) => {
      setCart([])
      setSelectedTable(null)
      setCustomerName('')
      setOrderNotes('')
      invalidateOrderData(queryClient)
      toastHelpers.success('تمت الإضافة', `أُضيفت الأصناف إلى الطلب ${data.data?.order_number ?? ''}`)
    },
    onError: (error: any) => {
      toastHelpers.apiError('الإضافة', error, 'الطلب')
    }
  })

  const handleCreateOrder = () => {
    if (!selectedTable || cart.length === 0) return

    if (openOrderOnTable) {
      addItemsMutation.mutate(openOrderOnTable.id)
      return
    }

    const orderData: CreateOrderRequest = {
      order_type: 'dine_in',
      table_id: selectedTable.id,
      customer_name: customerName || undefined,
      items: cartToOrderItems(cart),
      notes: orderNotes || undefined
    }

    createOrderMutation.mutate(orderData)
  }


  return (
    <div className="flex flex-col lg:flex-row h-screen bg-background">
      {/* Left Sidebar - Categories and Products */}
      <div className="flex-1 lg:w-2/3 border-r border-border overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-3 sm:p-4 border-b border-border bg-card">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4 mb-3 sm:mb-4">
            <div className="min-w-0 flex-1">
              <h1 className="text-lg sm:text-xl lg:text-2xl font-bold flex items-center truncate">
                <span className="hidden sm:inline">🍽️ محطة الجرسون</span>
                <span className="sm:hidden">🍽️ جرسون</span>
              </h1>
              <p className="text-xs sm:text-sm text-muted-foreground mt-1 hidden sm:block">خد طلبات طاولاتك • قدّم خدمة ممتازة</p>
              <p className="text-xs text-muted-foreground mt-1 sm:hidden">طلبات صالة</p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Badge variant="secondary" className="bg-blue-100 text-blue-800 text-xs px-2 py-1">
                <Users className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
                <span className="hidden sm:inline">خدمة صالة</span>
                <span className="sm:hidden">صالة</span>
              </Badge>
              {Array.isArray(activeOrders) && activeOrders.length > 0 && (
                <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200 text-xs px-2 py-1">
                  {activeOrders.length} <span className="hidden sm:inline">الطلبات النشطة</span><span className="sm:hidden">طلبات</span>
                </Badge>
              )}
            </div>
          </div>

          {/* Search */}
          <div className="relative mb-3 sm:mb-4">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
            <Input
              placeholder="ابحث عن منتج..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 h-10 sm:h-11 text-sm sm:text-base touch-manipulation"
            />
          </div>

          {/* Category Filter */}
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
            <Button
              variant={selectedCategory === 'all' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectedCategory('all')}
              className="whitespace-nowrap min-h-[44px] px-4 text-xs sm:text-sm touch-manipulation flex-shrink-0"
            >
              كل الأصناف
            </Button>
            {categories.map(category => (
              <Button
                key={category.id}
                variant={selectedCategory === category.id ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedCategory(category.id)}
                className="whitespace-nowrap min-h-[44px] px-4 text-xs sm:text-sm touch-manipulation flex-shrink-0"
              >
                {category.name}
              </Button>
            ))}
          </div>
        </div>

        {/* Products Grid */}
        <div className="flex-1 overflow-y-auto p-2 sm:p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
            {filteredProducts.map(product => {
              // A product may span several lines (different options) — show the total
              const inCartQty = cart
                .filter(item => item.product.id === product.id)
                .reduce((sum, item) => sum + item.quantity, 0)
              return (
                <Card key={product.id} className="hover:shadow-md active:scale-95 transition-all duration-150 touch-manipulation">
                  <CardHeader className="pb-2 sm:pb-3 p-3 sm:p-6">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <CardTitle className="text-sm sm:text-base lg:text-lg leading-tight truncate">{product.name}</CardTitle>
                        {product.description && (
                          <CardDescription className="text-xs sm:text-sm mt-1 line-clamp-2">
                            {product.description.substring(0, 50)}
                            {product.description.length > 50 ? '...' : ''}
                          </CardDescription>
                        )}
                      </div>
                      <div className="text-sm sm:text-base lg:text-lg font-bold text-primary flex-shrink-0">
                        {formatCurrency(product.price)}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0 p-3 sm:p-6 sm:pt-0">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1 sm:gap-2 flex-wrap">
                        {product.preparation_time > 0 && (
                          <Badge variant="outline" className="text-xs px-1.5 py-0.5">
                            <Clock className="w-2.5 h-2.5 sm:w-3 sm:h-3 mr-1" />
                            {product.preparation_time} دقيقة
                          </Badge>
                        )}
                        {!product.is_available && (
                          <Badge variant="secondary" className="text-xs px-1.5 py-0.5">
                            غير متاح
                          </Badge>
                        )}
                      </div>

                      {product.is_available && (
                        <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
                          {inCartQty > 0 && (
                            <Badge variant="secondary" className="text-xs px-1.5 py-0.5">
                              {inCartQty}
                            </Badge>
                          )}
                          <Button
                            variant="default"
                            size="sm"
                            onClick={() => handleAddProduct(product)}
                            className="min-h-[36px] px-3 sm:min-h-[44px] sm:px-4 text-xs sm:text-sm touch-manipulation"
                          >
                            <Plus className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
                            <span className="hidden sm:inline">إضافة</span>
                            <span className="sm:hidden">+</span>
                          </Button>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>
      </div>

      {/* Right Sidebar - Cart and Order */}
      <div className="w-full lg:w-1/3 flex flex-col bg-card max-h-screen lg:max-h-none">
        {/* Table Selection */}
        <div className="p-3 sm:p-4 border-b border-border flex-shrink-0">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold flex items-center text-sm sm:text-base">
              <TableIcon className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
              <span className="hidden sm:inline">اختر طاولة</span>
              <span className="sm:hidden">طاولة</span>
            </h3>
            <div className="flex gap-1">
              <Button
                variant={!showTableView ? 'default' : 'outline'}
                size="sm"
                onClick={() => setShowTableView(false)}
                className="min-h-[36px] px-3 text-xs sm:text-sm sm:min-h-[44px] sm:px-4 touch-manipulation"
              >
                قائمة
              </Button>
              <Button
                variant={showTableView ? 'default' : 'outline'}
                size="sm"
                onClick={() => setShowTableView(true)}
                className="min-h-[36px] px-3 text-xs sm:text-sm sm:min-h-[44px] sm:px-4 touch-manipulation"
              >
                الصالة
              </Button>
            </div>
          </div>

          {!showTableView ? (
            // List view. Shows every table — an occupied one must stay visible
            // (greyed out) instead of silently vanishing from the list.
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-44 sm:max-h-52 overflow-y-auto">
              {tablesWithStatus.map(table => (
                <Button
                  key={table.id}
                  variant={selectedTable?.id === table.id ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSelectedTable(table)}
                  title={table.statusInfo.label}
                  className="h-12 sm:h-14 flex flex-col text-xs sm:text-sm min-h-[48px] relative touch-manipulation"
                >
                  <span
                    className={`absolute top-1 start-1 w-2.5 h-2.5 rounded-full ${table.statusInfo.dot}`}
                  />
                  <span className="font-semibold">{table.table_number}</span>
                  <span className="text-[10px] sm:text-xs opacity-75">
                    {table.activeOrder
                      ? `#${table.activeOrder.order_number?.slice(-4)}`
                      : `${table.seating_capacity} كرسي`}
                  </span>
                </Button>
              ))}
            </div>
          ) : (
            // Restaurant Floor View - All Tables with Status
            <div className="space-y-3">
              {/* Status Legend */}
              <div className="grid grid-cols-3 gap-2 text-[10px] sm:text-xs">
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 sm:w-3 sm:h-3 rounded-full bg-green-500 flex-shrink-0"></div>
                  <span className="truncate">متاحة</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 sm:w-3 sm:h-3 rounded-full bg-amber-500 flex-shrink-0"></div>
                  <span className="truncate">جالس</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 sm:w-3 sm:h-3 rounded-full bg-red-500 flex-shrink-0"></div>
                  <span className="truncate">عليها طلب</span>
                </div>
              </div>

              {/* Table Grid */}
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-40 sm:max-h-48 overflow-y-auto">
                {tablesWithStatus.map(table => (
                  <Button
                    key={table.id}
                    onClick={() => setSelectedTable(table)}
                    title={table.statusInfo.label}
                    className={`h-12 sm:h-14 flex flex-col p-1.5 sm:p-2 relative min-h-[48px] cursor-pointer touch-manipulation ${
                      selectedTable?.id === table.id ? 'ring-2 ring-primary' : ''
                    }`}
                  >
                    <div className="font-semibold text-xs sm:text-sm">{table.table_number}</div>
                    <div className="text-[10px] sm:text-xs">{table.seating_capacity} كرسي</div>

                    {/* Status indicator */}
                    <div
                      className={`absolute -top-1 -start-1 w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full ${table.statusInfo.dot}`}
                    />

                    {/* Active order indicator */}
                    {table.activeOrder && (
                      <div className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 text-[9px] sm:text-[10px] bg-red-200 text-red-900 px-1 py-0.5 rounded truncate max-w-full">
                        #{table.activeOrder.order_number?.slice(-4)}
                      </div>
                    )}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* Selected Table Info */}
          {selectedTable && (
            <div
              className={`mt-3 p-2 sm:p-3 rounded-lg border ${
                openOrderOnTable ? 'bg-amber-50 border-amber-300' : 'bg-blue-50 border-blue-200'
              }`}
            >
              <div
                className={`text-xs sm:text-sm font-medium ${
                  openOrderOnTable ? 'text-amber-900' : 'text-blue-900'
                }`}
              >
                المختارة: طاولة {selectedTable.table_number}
              </div>
              <div
                className={`text-[10px] sm:text-xs ${
                  openOrderOnTable ? 'text-amber-800' : 'text-blue-700'
                }`}
              >
                {selectedTable.seating_capacity} كرسي • {selectedTable.location || 'الصالة الرئيسية'}
              </div>
              {openOrderOnTable && (
                <div className="mt-1.5 text-[11px] sm:text-xs font-medium text-amber-900">
                  عليها طلب مفتوح <span dir="ltr">#{openOrderOnTable.order_number}</span> — الأصناف
                  الجديدة هتتضاف عليه، مش هيتعمل طلب جديد.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Guest Information */}
        <div className="p-3 sm:p-4 border-b border-border flex-shrink-0">
          <h3 className="font-semibold mb-3 flex items-center text-sm sm:text-base">
            <User className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
            <span className="hidden sm:inline">بيانات الضيف</span>
            <span className="sm:hidden">بيانات الضيف</span>
          </h3>
          <Input
            placeholder="اسم الضيف (اختياري)"
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            className="h-10 sm:h-11 text-sm sm:text-base touch-manipulation"
          />
          <div className="text-xs text-muted-foreground mt-2 hidden sm:block">
            💡 نصيحة: إضافة أسماء الضيوف تساعد في تقديم خدمة أفضل
          </div>
        </div>

        {/* Cart */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-3 sm:p-4">
            <h3 className="font-semibold mb-3 flex items-center text-sm sm:text-base">
              <ShoppingCart className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
              <span className="hidden sm:inline">أصناف الطلب ({cart.length})</span>
              <span className="sm:hidden">الأصناف ({cart.length})</span>
            </h3>
            
            {cart.length === 0 ? (
              <div className="text-center py-6 sm:py-8 text-muted-foreground">
                <ShoppingCart className="w-8 h-8 sm:w-12 sm:h-12 mx-auto mb-3 opacity-50" />
                <p className="text-sm sm:text-base font-medium">جاهز لأخذ طلب</p>
                <p className="text-xs sm:text-sm mt-1">
                  {selectedTable
                    ? `طاولة ${selectedTable.table_number}`
                    : 'اختر طاولة وأضف أصناف'
                  }
                </p>
              </div>
            ) : (
              <div className="space-y-2 sm:space-y-3">
                {cart.map(item => (
                  <div key={item.key} className="flex items-center justify-between p-2 sm:p-3 bg-muted/50 rounded-lg">
                    <div className="flex-1 min-w-0 mr-2">
                      <div className="font-medium truncate text-sm sm:text-base">{item.product.name}</div>
                      {item.modifiers.length > 0 && (
                        <div className="text-xs text-muted-foreground truncate">
                          {item.modifiers.map(m => m.name).join(' • ')}
                        </div>
                      )}
                      <div className="text-xs sm:text-sm text-muted-foreground">
                        {formatCurrency(lineUnitPrice(item))} × {item.quantity}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
                      <div className="font-medium text-sm sm:text-base">
                        {formatCurrency(lineUnitPrice(item) * item.quantity)}
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => decrementLine(item.key)}
                          className="min-h-[32px] min-w-[32px] p-1 sm:min-h-[36px] sm:min-w-[36px] sm:p-2 touch-manipulation"
                        >
                          <Minus className="h-3 w-3" />
                        </Button>
                        <span className="w-6 sm:w-8 text-center text-sm sm:text-base font-medium">{item.quantity}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => incrementLine(item.key)}
                          className="min-h-[32px] min-w-[32px] p-1 sm:min-h-[36px] sm:min-w-[36px] sm:p-2 touch-manipulation"
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Order Notes */}
            {cart.length > 0 && (
              <div className="mt-4">
                <label className="text-xs sm:text-sm font-medium">ملاحظات الطلب</label>
                <Input
                  placeholder="طلبات خاصة أو ملاحظات..."
                  value={orderNotes}
                  onChange={(e) => setOrderNotes(e.target.value)}
                  className="mt-1 h-10 sm:h-11 text-sm sm:text-base touch-manipulation"
                />
              </div>
            )}
          </div>
        </div>

        {/* Order Summary and Actions */}
        {cart.length > 0 ? (
          <div className="p-3 sm:p-4 border-t border-border bg-card flex-shrink-0">
            <div className="space-y-3">
              {/* Order Summary */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs sm:text-sm text-blue-700">
                    {selectedTable ? `طاولة ${selectedTable.table_number}` : 'لا توجد طاولة مختارة'}
                  </span>
                  <span className="text-xs sm:text-sm text-blue-700">
                    {cart.length} صنف
                  </span>
                </div>
                <div className="flex justify-between text-xs sm:text-sm text-blue-700">
                  <span>المجموع الفرعي:</span>
                  <span>{formatCurrency(getTotalAmount())}</span>
                </div>
                {storeSettings.taxRate > 0 && (
                  <div className="flex justify-between text-xs sm:text-sm text-blue-700">
                    <span>الضريبة ({(storeSettings.taxRate * 100).toFixed(0)}%):</span>
                    <span>{formatCurrency(getTotalAmount() * storeSettings.taxRate)}</span>
                  </div>
                )}
                <div className="flex justify-between text-base sm:text-lg font-semibold text-blue-900 border-t border-blue-200 pt-1 mt-1">
                  <span>إجمالي الطلب:</span>
                  <span>{formatCurrency(getTotalAmount() * (1 + storeSettings.taxRate))}</span>
                </div>
              </div>

              {/* Action Button */}
              <Button
                className="w-full min-h-[48px] sm:min-h-[52px] text-sm sm:text-base font-semibold touch-manipulation"
                size="lg"
                onClick={handleCreateOrder}
                disabled={
                  !selectedTable ||
                  cart.length === 0 ||
                  createOrderMutation.isPending ||
                  addItemsMutation.isPending
                }
              >
                {createOrderMutation.isPending || addItemsMutation.isPending ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                    <span className="hidden sm:inline">جارٍ الإرسال للمطبخ...</span>
                    <span className="sm:hidden">جارٍ الإرسال...</span>
                  </>
                ) : !selectedTable ? (
                  <>
                    <TableIcon className="w-4 h-4 mr-2" />
                    <span className="hidden sm:inline">اختر طاولة أولاً</span>
                    <span className="sm:hidden">اختر طاولة</span>
                  </>
                ) : openOrderOnTable ? (
                  <>
                    <Check className="w-4 h-4 mr-2" />
                    <span className="hidden sm:inline">أضف على الطلب المفتوح</span>
                    <span className="sm:hidden">أضف على الطلب</span>
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4 mr-2" />
                    <span className="hidden sm:inline">إرسال الطلب للمطبخ</span>
                    <span className="sm:hidden">إرسال الطلب</span>
                  </>
                )}
              </Button>

              {/* Server Tips */}
              <div className="text-xs text-center text-muted-foreground hidden sm:block">
                💡 راجع الطلب مع الضيوف قبل الإرسال
              </div>
            </div>
          </div>
        ) : (
          <div className="p-3 sm:p-4 border-t border-border bg-card flex-shrink-0">
            <div className="text-center text-muted-foreground">
              <p className="text-sm sm:text-base font-medium">لا توجد أصناف مختارة</p>
              <p className="text-xs sm:text-sm mt-1">
                {selectedTable ? 'أضف أصناف لبدء الطلب' : 'اختر طاولة للبدء'}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Sizes / add-ons picker */}
      {modifierTarget && (
        <ModifierDialog
          product={modifierTarget.product}
          groups={modifierTarget.groups}
          onCancel={() => setModifierTarget(null)}
          onConfirm={(mods) => {
            addLineToCart(modifierTarget.product, mods)
            setModifierTarget(null)
          }}
        />
      )}
    </div>
  )
}
