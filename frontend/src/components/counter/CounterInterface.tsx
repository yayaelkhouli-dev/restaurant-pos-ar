import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/api/client'
import { formatCurrency } from '@/lib/utils'
import { toastHelpers } from '@/lib/toast-helpers'
import { useStoreSettings } from '@/hooks/useStoreSettings'
import { printReceipt, effectiveTaxRate } from '@/lib/receipt'
import { orderKeys, invalidateOrderData } from '@/lib/query-client'
import { ShiftPanel } from '@/components/counter/ShiftPanel'
import { ModifierDialog } from '@/components/counter/ModifierDialog'
import {
  type CartItem,
  type SelectedModifier,
  cartKey,
  lineUnitPrice,
  cartSubtotal,
  addLine,
  incrementLine as incLine,
  decrementLine as decLine,
  cartToOrderItems,
} from '@/lib/cart'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { 
  Plus, 
  Minus, 
  ShoppingCart, 
  CreditCard, 
  Banknote,
  Check,
  Clock,
  Table as TableIcon,
  Search,
  Package,
  Car,
  Users,
  Receipt,
  History,
  Pencil,
  X
} from 'lucide-react'
import type { Product, Category, DiningTable, Order, ModifierGroup } from '@/types'

interface CreateOrderRequest {
  table_id?: string
  customer_name?: string
  order_type: 'dine_in' | 'takeout' | 'delivery'
  items: Array<{
    product_id: string
    quantity: number
    special_instructions?: string
    modifier_ids?: string[]
  }>
  notes?: string
  discount_type?: 'percent' | 'amount'
  discount_value?: number
  customer_phone?: string
  delivery_address?: string
  delivery_fee?: number
}

interface ProcessPaymentRequest {
  payment_method: 'cash' | 'credit_card' | 'debit_card' | 'digital_wallet'
  amount: number
  reference_number?: string
}

export function CounterInterface() {
  const storeSettings = useStoreSettings()
  const [activeTab, setActiveTab] = useState<'create' | 'payment'>('create')
  const [orderType, setOrderType] = useState<'dine_in' | 'takeout' | 'delivery'>('dine_in')
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [selectedTable, setSelectedTable] = useState<DiningTable | null>(null)
  const [customerName, setCustomerName] = useState('')
  const [cart, setCart] = useState<CartItem[]>([])
  const [orderNotes, setOrderNotes] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [discountType, setDiscountType] = useState<'percent' | 'amount'>('percent')
  const [discountValue, setDiscountValue] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [deliveryAddress, setDeliveryAddress] = useState('')
  const [deliveryFee, setDeliveryFee] = useState('')
  // When set, the create tab is editing this existing order instead of creating a new one
  const [editingOrder, setEditingOrder] = useState<Order | null>(null)
  // When set, the modifier (sizes / add-ons) dialog is open for this product
  const [modifierTarget, setModifierTarget] = useState<{ product: Product; groups: ModifierGroup[] } | null>(null)
  
  // Payment states
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'credit_card' | 'debit_card' | 'digital_wallet'>('cash')
  const [paymentAmount, setPaymentAmount] = useState('')
  const [referenceNumber, setReferenceNumber] = useState('')
  
  const queryClient = useQueryClient()

  const resetOrderForm = () => {
    setCart([])
    setSelectedTable(null)
    setCustomerName('')
    setOrderNotes('')
    setDiscountValue('')
    setCustomerPhone('')
    setDeliveryAddress('')
    setDeliveryFee('')
  }

  // Fetch categories
  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    // `= []` above only covers undefined; an API that answers `null` still lands here.
    queryFn: () => apiClient.getCategories().then(res => res.data ?? [])
  })

  // Fetch products
  const { data: products = [] } = useQuery({
    queryKey: ['products', selectedCategory],
    queryFn: () => {
      if (selectedCategory === 'all') {
        return apiClient.getProducts().then(res => res.data ?? [])
      } else {
        return apiClient.getProductsByCategory(selectedCategory).then(res => res.data ?? [])
      }
    }
  })

  // Occupancy flips whenever the waiter opens an order or a bill is settled, so
  // this must not sit behind the app-wide 5-minute staleTime.
  const { data: tables = [] } = useQuery({
    queryKey: ['tables'],
    queryFn: () => apiClient.getTables().then(res => res.data ?? []),
    staleTime: 0,
    refetchInterval: 10_000,
  })

  // Open orders: payable now (takeout paid upfront) and editable until paid.
  // Polls because the waiter and the kitchen create/advance orders on other
  // screens; nothing they do can invalidate this cache from another device.
  const { data: pendingOrders = [] } = useQuery({
    queryKey: orderKeys.pending,
    queryFn: () =>
      apiClient
        .getOrders({ status: ['confirmed', 'preparing', 'ready', 'served'] })
        .then(res => res.data ?? []),
    refetchInterval: 8_000,
  })

  // Create order mutation (counter endpoint - all order types)
  const createOrderMutation = useMutation({
    mutationFn: (orderData: CreateOrderRequest) =>
      apiClient.createCounterOrder(orderData),
    onSuccess: () => {
      resetOrderForm()
      invalidateOrderData(queryClient)
      toastHelpers.orderCreated()
    },
    onError: (error: any) => {
      toastHelpers.apiError('الإنشاء', error?.response?.data?.message || error, 'الطلب')
    }
  })

  // Update (modify) an existing open order's items
  const updateOrderMutation = useMutation({
    mutationFn: ({ orderId, data }: { orderId: string; data: any }) =>
      apiClient.updateOrderItems(orderId, data),
    onSuccess: () => {
      resetOrderForm()
      setEditingOrder(null)
      invalidateOrderData(queryClient)
      toastHelpers.success('تم تعديل الطلب بنجاح')
    },
    onError: (error: any) => {
      toastHelpers.apiError('التعديل', error?.response?.data?.message || error, 'الطلب')
    },
  })

  // Process payment mutation
  const processPaymentMutation = useMutation({
    mutationFn: ({ orderId, paymentData }: { orderId: string, paymentData: ProcessPaymentRequest }) =>
      apiClient.processCounterPayment(orderId, paymentData),
    onSuccess: () => {
      // Reset payment form
      setSelectedOrder(null)
      setPaymentAmount('')
      setReferenceNumber('')
      invalidateOrderData(queryClient)
      toastHelpers.paymentProcessed()
    },
    onError: (error: any) => {
      toastHelpers.apiError('الدفع', error?.response?.data?.message || error)
    }
  })

  // Filter products based on search
  const filteredProducts = products.filter(product =>
    product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (product.description?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false)
  )

  // 'TAKEOUT' is a placeholder row for counter takeaway orders, not a real table.
  const dineInTables = tables.filter(table => table.table_number !== 'TAKEOUT')

  /** Add a product with a specific set of options; identical sets merge into one line. */
  const addLineToCart = (product: Product, mods: SelectedModifier[]) => {
    setCart(prev => addLine(prev, product, mods))
  }

  /**
   * Clicking a product opens the options dialog when it has modifier groups,
   * otherwise it goes straight into the cart.
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
      // If options can't be loaded, still let the cashier add the plain product
    }
    addLineToCart(product, [])
  }

  const incrementLine = (key: string) => setCart(prev => incLine(prev, key))
  const decrementLine = (key: string) => setCart(prev => decLine(prev, key))

  const getTotalAmount = () => cartSubtotal(cart)

  // Discount amount applied to the subtotal (before tax), matching the backend
  const getDiscountAmount = () => {
    const v = parseFloat(discountValue)
    if (!v || v <= 0) return 0
    const sub = getTotalAmount()
    const d = discountType === 'percent' ? (sub * Math.min(v, 100)) / 100 : v
    return d > sub ? sub : d
  }

  // Delivery fee is added on top of the taxed total (delivery orders only)
  const getDeliveryFee = () => {
    if (orderType !== 'delivery') return 0
    const v = parseFloat(deliveryFee)
    return v > 0 ? v : 0
  }

  /** Load an existing open order into the cart so it can be modified. */
  const startEditingOrder = async (order: Order) => {
    try {
      const full = await apiClient.getOrder(order.id).then((r: any) => r.data)
      if (!full) return
      const nextCart: CartItem[] = []
      for (const it of full.items || []) {
        const product = products.find((p: Product) => p.id === it.product_id)
        if (!product) continue // product was archived; skip it
        // Restore chosen options; drop any whose modifier was since deleted (modifier_id null)
        const mods: SelectedModifier[] = (it.modifiers || [])
          .filter((m: any) => m.modifier_id)
          .map((m: any) => ({ id: m.modifier_id, name: m.name, price_delta: m.price_delta }))
        nextCart.push({
          key: cartKey(product.id, mods),
          product,
          quantity: it.quantity,
          special_instructions: it.special_instructions,
          modifiers: mods,
        })
      }
      if (nextCart.length === 0) {
        toastHelpers.error('تعذّر التعديل', 'لم يعد بالإمكان تعديل أصناف هذا الطلب')
        return
      }
      setEditingOrder(full)
      setCart(nextCart)
      setOrderType(full.order_type)
      setCustomerName(full.customer_name || '')
      setCustomerPhone(full.customer_phone || '')
      setDeliveryAddress(full.delivery_address || '')
      setDeliveryFee(full.delivery_fee ? String(full.delivery_fee) : '')
      setOrderNotes(full.notes || '')
      setDiscountValue('')
      setSelectedTable(tables.find((t: DiningTable) => t.id === full.table_id) || null)
      setActiveTab('create')
    } catch (e: any) {
      toastHelpers.apiError('فتح الطلب للتعديل', e?.response?.data?.message || e)
    }
  }

  const cancelEditing = () => {
    setEditingOrder(null)
    resetOrderForm()
  }

  const handleCreateOrder = () => {
    if (cart.length === 0) return
    if (!editingOrder && orderType === 'dine_in' && !selectedTable) return

    const discountNum = parseFloat(discountValue)
    const feeNum = getDeliveryFee()
    const items = cartToOrderItems(cart)

    // Editing an existing order → replace its items instead of creating a new one
    if (editingOrder) {
      updateOrderMutation.mutate({
        orderId: editingOrder.id,
        data: {
          items,
          notes: orderNotes || undefined,
          ...(discountNum > 0 ? { discount_type: discountType, discount_value: discountNum } : {}),
          ...(feeNum > 0 ? { delivery_fee: feeNum } : {}),
        },
      })
      return
    }

    const orderData: CreateOrderRequest = {
      table_id: orderType === 'dine_in' ? selectedTable?.id : undefined,
      customer_name: customerName || undefined,
      order_type: orderType,
      items,
      notes: orderNotes || undefined,
      ...(discountNum > 0 ? { discount_type: discountType, discount_value: discountNum } : {}),
      ...(orderType !== 'dine_in' && customerPhone ? { customer_phone: customerPhone } : {}),
      ...(orderType === 'delivery' && deliveryAddress ? { delivery_address: deliveryAddress } : {}),
      ...(feeNum > 0 ? { delivery_fee: feeNum } : {}),
    }

    createOrderMutation.mutate(orderData)
  }

  const paymentMethodLabels: Record<string, string> = {
    cash: 'نقدي',
    credit_card: 'بطاقة ائتمان',
    debit_card: 'بطاقة خصم',
    digital_wallet: 'محفظة رقمية',
  }
  const orderTypeLabels: Record<string, string> = {
    dine_in: 'صالة',
    takeout: 'تيك أواي',
    delivery: 'توصيل',
  }
  const statusLabels: Record<string, string> = {
    pending: 'قيد الانتظار',
    confirmed: 'مؤكَّد',
    preparing: 'قيد التحضير',
    ready: 'جاهز',
    served: 'تم التقديم',
    completed: 'مكتمل',
    cancelled: 'ملغي',
  }

  // Change (الباقي) for cash payments = amount tendered - order total
  const changeDue = (() => {
    if (paymentMethod !== 'cash' || !selectedOrder || !paymentAmount) return 0
    const diff = parseFloat(paymentAmount) - selectedOrder.total_amount
    return diff > 0 ? diff : 0
  })()

  const printOrderReceipt = async (orderId: string, methodKey: string, amountPaid?: number) => {
    try {
      const full = await apiClient.getOrder(orderId).then((r: any) => r.data)
      if (!full) return
      const change =
        methodKey === 'cash' && amountPaid != null ? Math.max(0, amountPaid - full.total_amount) : undefined
      printReceipt({
        restaurantName: storeSettings.restaurantName,
        phone: storeSettings.phone,
        address: storeSettings.address,
        header: storeSettings.receiptHeader,
        footer: storeSettings.receiptFooter,
        orderNumber: full.order_number,
        orderTypeLabel: orderTypeLabels[full.order_type],
        customerName: full.customer_name,
        customerPhone: full.customer_phone,
        deliveryAddress: full.delivery_address,
        tableNumber: full.table?.table_number,
        dateTime: new Date(full.created_at).toLocaleString('ar-EG'),
        items: (full.items || []).map((it: any) => {
          // Show the chosen sizes / add-ons under the line, then any special instructions
          const modNames = (it.modifiers || []).map((m: any) => m.name).join(' • ')
          const note = [modNames, it.special_instructions].filter(Boolean).join(' — ')
          return {
            name: it.product?.name || 'صنف',
            quantity: it.quantity,
            unitPrice: it.unit_price,
            total: it.total_price,
            note: note || undefined,
          }
        }),
        subtotal: full.subtotal,
        taxAmount: full.tax_amount,
        // Derive the rate from this order's own numbers. Reading the *current*
        // setting would print a rate the customer was never charged whenever the
        // tax rate changed after the order was rung up.
        taxRate: effectiveTaxRate(full),
        discountAmount: full.discount_amount,
        deliveryFee: full.delivery_fee,
        total: full.total_amount,
        paymentMethodLabel: paymentMethodLabels[methodKey],
        amountPaid,
        change,
        widthMm: storeSettings.receiptWidth,
      })
    } catch (e: any) {
      toastHelpers.apiError('الطباعة', e?.response?.data?.message || e)
    }
  }

  const handleProcessPayment = async () => {
    if (!selectedOrder || !paymentAmount) return

    const amount = parseFloat(paymentAmount)
    const orderId = selectedOrder.id
    const methodKey = paymentMethod
    const paymentData: ProcessPaymentRequest = {
      payment_method: paymentMethod,
      amount,
      reference_number: referenceNumber || undefined,
    }

    try {
      await processPaymentMutation.mutateAsync({ orderId, paymentData })
      // Payment succeeded — print the receipt (uses tendered amount for change)
      await printOrderReceipt(orderId, methodKey, amount)
    } catch {
      // error toast already shown by the mutation's onError
    }
  }


  const getOrderTypeIcon = (type: string) => {
    switch (type) {
      case 'dine_in': return <Users className="w-4 h-4" />
      case 'takeout': return <Package className="w-4 h-4" />
      case 'delivery': return <Car className="w-4 h-4" />
      default: return <ShoppingCart className="w-4 h-4" />
    }
  }

  const getOrderTypeBadge = (type: string) => {
    const configs = {
      dine_in: { label: 'صالة', color: 'bg-blue-100 text-blue-800' },
      takeout: { label: 'تيك أواي', color: 'bg-green-100 text-green-800' },
      delivery: { label: 'توصيل', color: 'bg-purple-100 text-purple-800' }
    }
    const config = configs[type as keyof typeof configs] || configs.dine_in
    return <Badge className={config.color}>{config.label}</Badge>
  }

  return (
    <div className="flex h-screen bg-background">
      {/* Left Sidebar - Products and Orders */}
      <div className="w-2/3 border-r border-border overflow-hidden flex flex-col">
        {/* Header with Tabs */}
        <div className="p-4 border-b border-border bg-card">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold">الكاشير / الدفع</h1>
              <p className="text-muted-foreground">إنشاء الطلبات ومعالجة المدفوعات</p>
              <div className="mt-2">
                <ShiftPanel />
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant={activeTab === 'create' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setActiveTab('create')}
              >
                <Plus className="w-4 h-4 ml-1" />
                إنشاء طلب
              </Button>
              <Button
                variant={activeTab === 'payment' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setActiveTab('payment')}
              >
                <CreditCard className="w-4 h-4 ml-1" />
                معالجة الدفع
              </Button>
            </div>
          </div>

          {activeTab === 'create' && (
            <>
              {/* Order Type Selection */}
              <div className="flex gap-2 mb-4">
                <Button
                  variant={orderType === 'dine_in' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setOrderType('dine_in')}
                >
                  <Users className="w-4 h-4 ml-1" />
                  صالة
                </Button>
                <Button
                  variant={orderType === 'takeout' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setOrderType('takeout')}
                >
                  <Package className="w-4 h-4 ml-1" />
                  تيك أواي
                </Button>
                <Button
                  variant={orderType === 'delivery' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setOrderType('delivery')}
                >
                  <Car className="w-4 h-4 ml-1" />
                  توصيل
                </Button>
              </div>

              {/* Search */}
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                <Input
                  placeholder="ابحث عن منتج..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>

              {/* Category Filter */}
              <div className="flex gap-2 overflow-x-auto">
                <Button
                  variant={selectedCategory === 'all' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSelectedCategory('all')}
                >
                  الكل
                </Button>
                {categories.map(category => (
                  <Button
                    key={category.id}
                    variant={selectedCategory === category.id ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setSelectedCategory(category.id)}
                  >
                    {category.name}
                  </Button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-4">
          {activeTab === 'create' ? (
            /* Products Grid */
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredProducts.map(product => {
                // A product may appear on several lines (different options) — show the total
                const inCartQty = cart
                  .filter(item => item.product.id === product.id)
                  .reduce((sum, item) => sum + item.quantity, 0)
                return (
                  <Card key={product.id} className="hover:shadow-md transition-shadow">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="text-lg leading-tight">{product.name}</CardTitle>
                          {product.description && (
                            <CardDescription className="text-sm mt-1">
                              {product.description.substring(0, 60)}
                              {product.description.length > 60 ? '...' : ''}
                            </CardDescription>
                          )}
                        </div>
                        <div className="text-lg font-bold text-primary">
                          {formatCurrency(product.price)}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {product.preparation_time > 0 && (
                            <Badge variant="outline" className="text-xs">
                              <Clock className="w-3 h-3 ml-1" />
                              {product.preparation_time} دقيقة
                            </Badge>
                          )}
                          {!product.is_available && (
                            <Badge variant="secondary" className="text-xs">
                              غير متاح
                            </Badge>
                          )}
                        </div>

                        {product.is_available && (
                          <div className="flex items-center gap-2">
                            {inCartQty > 0 && (
                              <Badge variant="secondary" className="text-xs">
                                في الطلب: {inCartQty}
                              </Badge>
                            )}
                            <Button variant="default" size="sm" onClick={() => handleAddProduct(product)}>
                              <Plus className="h-4 w-4 ml-1" />
                              أضف
                            </Button>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          ) : (
            /* Payment Processing - Orders List */
            <div className="space-y-4">
              <h3 className="text-lg font-semibold mb-4">طلبات جاهزة للدفع</h3>
              {pendingOrders.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Receipt className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>لا توجد طلبات جاهزة للدفع</p>
                </div>
              ) : (
                pendingOrders.map(order => (
                  <Card 
                    key={order.id} 
                    className={`cursor-pointer transition-all ${
                      selectedOrder?.id === order.id ? 'ring-2 ring-primary' : 'hover:shadow-md'
                    }`}
                    onClick={() => {
                      setSelectedOrder(order)
                      setPaymentAmount(order.total_amount.toString())
                    }}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {getOrderTypeIcon(order.order_type)}
                          <div>
                            <div className="font-semibold">طلب رقم {order.order_number}</div>
                            <div className="text-sm text-muted-foreground">
                              {order.customer_name && `${order.customer_name} • `}
                              {order.table?.table_number && `طاولة ${order.table.table_number} • `}
                              {order.items?.length || 0} صنف
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-bold">{formatCurrency(order.total_amount)}</div>
                          <div className="flex items-center gap-2 justify-end mt-1">
                            {getOrderTypeBadge(order.order_type)}
                            <Badge variant="outline" className="text-xs">
                              {statusLabels[order.status] || order.status}
                            </Badge>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            className="mt-2"
                            onClick={(e) => {
                              e.stopPropagation()
                              startEditingOrder(order)
                            }}
                          >
                            <Pencil className="w-3 h-3 ml-1" />
                            تعديل
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* Right Sidebar */}
      <div className="w-1/3 flex flex-col bg-card">
        {activeTab === 'create' ? (
          /* Create Order Interface */
          <>
            {/* Editing an existing order */}
            {editingOrder && (
              <div className="p-3 bg-amber-50 border-b border-amber-200 flex items-center justify-between">
                <div className="text-sm">
                  <div className="font-semibold text-amber-900">
                    تعديل الطلب {editingOrder.order_number}
                  </div>
                  <div className="text-amber-700 text-xs">عدّل الأصناف ثم احفظ</div>
                </div>
                <Button variant="ghost" size="sm" onClick={cancelEditing}>
                  <X className="w-4 h-4 ml-1" />
                  إلغاء
                </Button>
              </div>
            )}

            {/* Table/Customer Selection */}
            <div className="p-4 border-b border-border">
              {orderType === 'dine_in' ? (
                <>
                  <h3 className="font-semibold mb-3 flex items-center">
                    <TableIcon className="w-4 h-4 ml-2" />
                    اختر طاولة
                  </h3>
                  {/* Occupied tables stay visible but disabled — hiding them made
                      tables silently disappear with no explanation. */}
                  <div className="grid grid-cols-3 gap-2 mb-4 max-h-44 overflow-y-auto">
                    {dineInTables.map(table => (
                      <Button
                        key={table.id}
                        variant={selectedTable?.id === table.id ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => !table.is_occupied && setSelectedTable(table)}
                        disabled={table.is_occupied}
                        title={
                          table.is_occupied
                            ? 'مشغولة — عليها طلب مفتوح. زوّده من زر «تعديل» في قائمة الطلبات، أو من شاشة الجرسون.'
                            : 'متاحة'
                        }
                        className={`h-12 relative ${table.is_occupied ? 'cursor-not-allowed opacity-60' : ''}`}
                      >
                        <span
                          className={`absolute top-1 start-1 w-2.5 h-2.5 rounded-full ${
                            table.is_occupied ? 'bg-red-500' : 'bg-green-500'
                          }`}
                        />
                        {table.table_number}
                        <span className="text-xs block">
                          {table.seating_capacity} مقعد
                        </span>
                      </Button>
                    ))}
                  </div>
                </>
              ) : (
                <div className="mb-4">
                  <h3 className="font-semibold mb-2">بيانات العميل</h3>
                </div>
              )}
              
              <div className="space-y-2">
                <Input
                  placeholder={orderType === 'dine_in' ? 'اسم العميل (اختياري)' : 'اسم العميل'}
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                />

                {/* Phone is useful for takeout and delivery */}
                {orderType !== 'dine_in' && (
                  <Input
                    type="tel"
                    placeholder="رقم تليفون العميل"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                  />
                )}

                {/* Address + fee only for delivery */}
                {orderType === 'delivery' && (
                  <>
                    <Input
                      placeholder="عنوان التوصيل"
                      value={deliveryAddress}
                      onChange={(e) => setDeliveryAddress(e.target.value)}
                    />
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium whitespace-nowrap">رسوم التوصيل:</span>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0"
                        value={deliveryFee}
                        onChange={(e) => setDeliveryFee(e.target.value)}
                      />
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Cart */}
            <div className="flex-1 overflow-y-auto">
              <div className="p-4">
                <h3 className="font-semibold mb-3 flex items-center">
                  <ShoppingCart className="w-4 h-4 ml-2" />
                  أصناف الطلب ({cart.length})
                </h3>
                
                {cart.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <ShoppingCart className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p>لا توجد أصناف في الطلب</p>
                    <p className="text-sm">أضف أصنافاً من القائمة للبدء</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {cart.map(item => (
                      <div key={item.key} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{item.product.name}</div>
                          {item.modifiers.length > 0 && (
                            <div className="text-xs text-muted-foreground truncate">
                              {item.modifiers.map(m => m.name).join(' • ')}
                            </div>
                          )}
                          <div className="text-sm text-muted-foreground">
                            {formatCurrency(lineUnitPrice(item))} × {item.quantity}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 ml-2">
                          <div className="font-medium">
                            {formatCurrency(lineUnitPrice(item) * item.quantity)}
                          </div>
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="sm" onClick={() => decrementLine(item.key)}>
                              <Minus className="h-3 w-3" />
                            </Button>
                            <span className="w-6 text-center text-sm">{item.quantity}</span>
                            <Button variant="ghost" size="sm" onClick={() => incrementLine(item.key)}>
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
                    <label className="text-sm font-medium">ملاحظات الطلب</label>
                    <Input
                      placeholder="طلبات خاصة أو ملاحظات..."
                      value={orderNotes}
                      onChange={(e) => setOrderNotes(e.target.value)}
                      className="mt-1"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Order Summary and Actions */}
            {cart.length > 0 && (
              <div className="p-4 border-t border-border bg-card">
                <div className="space-y-3">
                  {/* Discount input */}
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium whitespace-nowrap">خصم:</span>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0"
                      value={discountValue}
                      onChange={(e) => setDiscountValue(e.target.value)}
                      className="h-8"
                    />
                    <div className="flex rounded-md overflow-hidden border border-border">
                      <button
                        type="button"
                        className={`px-2 h-8 text-sm ${discountType === 'percent' ? 'bg-primary text-primary-foreground' : 'bg-background'}`}
                        onClick={() => setDiscountType('percent')}
                      >
                        %
                      </button>
                      <button
                        type="button"
                        className={`px-2 h-8 text-sm ${discountType === 'amount' ? 'bg-primary text-primary-foreground' : 'bg-background'}`}
                        onClick={() => setDiscountType('amount')}
                      >
                        {storeSettings.currency}
                      </button>
                    </div>
                  </div>

                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>المجموع الفرعي:</span>
                    <span>{formatCurrency(getTotalAmount())}</span>
                  </div>
                  {getDiscountAmount() > 0 && (
                    <div className="flex justify-between text-sm text-green-700">
                      <span>الخصم:</span>
                      <span>- {formatCurrency(getDiscountAmount())}</span>
                    </div>
                  )}
                  {storeSettings.taxRate > 0 && (
                    <div className="flex justify-between text-sm text-muted-foreground">
                      <span>الضريبة ({(storeSettings.taxRate * 100).toFixed(0)}%):</span>
                      <span>{formatCurrency((getTotalAmount() - getDiscountAmount()) * storeSettings.taxRate)}</span>
                    </div>
                  )}
                  {getDeliveryFee() > 0 && (
                    <div className="flex justify-between text-sm text-muted-foreground">
                      <span>رسوم التوصيل:</span>
                      <span>{formatCurrency(getDeliveryFee())}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-lg font-semibold border-t border-border pt-2">
                    <span>الإجمالي:</span>
                    <span>
                      {formatCurrency(
                        (getTotalAmount() - getDiscountAmount()) * (1 + storeSettings.taxRate) + getDeliveryFee()
                      )}
                    </span>
                  </div>

                  <Button
                    className="w-full"
                    size="lg"
                    onClick={handleCreateOrder}
                    disabled={
                      cart.length === 0 ||
                      (!editingOrder && orderType === 'dine_in' && !selectedTable) ||
                      createOrderMutation.isPending ||
                      updateOrderMutation.isPending
                    }
                  >
                    {createOrderMutation.isPending || updateOrderMutation.isPending ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin ml-2" />
                        {editingOrder ? 'جاري حفظ التعديل...' : 'جاري إنشاء الطلب...'}
                      </>
                    ) : editingOrder ? (
                      <>
                        <Check className="w-4 h-4 ml-2" />
                        حفظ تعديل الطلب {editingOrder.order_number}
                      </>
                    ) : (
                      <>
                        <Check className="w-4 h-4 ml-2" />
                        إنشاء طلب {orderType === 'dine_in' ? 'صالة' : orderType === 'takeout' ? 'تيك أواي' : 'توصيل'}
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </>
        ) : (
          /* Payment Processing Interface */
          <>
            {selectedOrder ? (
              <>
                <div className="p-4 border-b border-border">
                  <h3 className="font-semibold mb-3">تفاصيل الدفع</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span>الطلب:</span>
                      <span>#{selectedOrder.order_number}</span>
                    </div>
                    {selectedOrder.customer_name && (
                      <div className="flex justify-between">
                        <span>العميل:</span>
                        <span>{selectedOrder.customer_name}</span>
                      </div>
                    )}
                    <div className="flex justify-between font-semibold text-lg">
                      <span>الإجمالي:</span>
                      <span>{formatCurrency(selectedOrder.total_amount)}</span>
                    </div>
                  </div>
                </div>

                <div className="p-4 space-y-4">
                  <div>
                    <label className="text-sm font-medium mb-2 block">طريقة الدفع</label>
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        variant={paymentMethod === 'cash' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setPaymentMethod('cash')}
                      >
                        <Banknote className="w-4 h-4 ml-1" />
                        نقدي
                      </Button>
                      <Button
                        variant={paymentMethod === 'credit_card' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setPaymentMethod('credit_card')}
                      >
                        <CreditCard className="w-4 h-4 ml-1" />
                        بطاقة ائتمان
                      </Button>
                      <Button
                        variant={paymentMethod === 'debit_card' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setPaymentMethod('debit_card')}
                      >
                        <CreditCard className="w-4 h-4 ml-1" />
                        بطاقة خصم
                      </Button>
                      <Button
                        variant={paymentMethod === 'digital_wallet' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setPaymentMethod('digital_wallet')}
                      >
                        محفظة رقمية
                      </Button>
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-medium mb-1 block">
                      {paymentMethod === 'cash' ? 'المبلغ المدفوع (النقدية المستلمة)' : 'مبلغ الدفع'}
                    </label>
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={paymentAmount}
                      onChange={(e) => setPaymentAmount(e.target.value)}
                    />
                  </div>

                  {paymentMethod === 'cash' && (
                    <div className="space-y-2">
                      {/* Quick cash amounts */}
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setPaymentAmount(selectedOrder.total_amount.toFixed(2))}
                        >
                          المبلغ بالضبط
                        </Button>
                        {[50, 100, 200, 500].map((d) => (
                          <Button
                            key={d}
                            variant="outline"
                            size="sm"
                            onClick={() => setPaymentAmount(String(d))}
                          >
                            {d}
                          </Button>
                        ))}
                      </div>
                      {/* Change due */}
                      {paymentAmount && (
                        <div
                          className={`flex justify-between items-center p-2 rounded-md text-lg font-semibold ${
                            parseFloat(paymentAmount) >= selectedOrder.total_amount
                              ? 'bg-green-50 text-green-800'
                              : 'bg-red-50 text-red-700'
                          }`}
                        >
                          <span>الباقي للعميل:</span>
                          <span>
                            {parseFloat(paymentAmount) >= selectedOrder.total_amount
                              ? formatCurrency(changeDue)
                              : `ناقص ${formatCurrency(selectedOrder.total_amount - parseFloat(paymentAmount))}`}
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {paymentMethod !== 'cash' && (
                    <div>
                      <label className="text-sm font-medium mb-1 block">الرقم المرجعي</label>
                      <Input
                        placeholder="مرجع العملية"
                        value={referenceNumber}
                        onChange={(e) => setReferenceNumber(e.target.value)}
                      />
                    </div>
                  )}

                  <Button
                    className="w-full"
                    size="lg"
                    onClick={handleProcessPayment}
                    disabled={!paymentAmount || processPaymentMutation.isPending}
                  >
                    {processPaymentMutation.isPending ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin ml-2" />
                        جاري المعالجة...
                      </>
                    ) : (
                      <>
                        <CreditCard className="w-4 h-4 ml-2" />
                        معالجة الدفع
                      </>
                    )}
                  </Button>

                  <Button
                    className="w-full"
                    size="lg"
                    variant="outline"
                    onClick={() =>
                      printOrderReceipt(
                        selectedOrder.id,
                        paymentMethod,
                        paymentAmount ? parseFloat(paymentAmount) : undefined
                      )
                    }
                  >
                    <Receipt className="w-4 h-4 ml-2" />
                    طباعة الإيصال
                  </Button>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <CreditCard className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>اختر طلباً لمعالجة الدفع</p>
                </div>
              </div>
            )}
          </>
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
