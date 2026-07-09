import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/api/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { formatCurrency } from '@/lib/utils'
import { toastHelpers } from '@/lib/toast-helpers'
import type { Product, ModifierGroup } from '@/types'
import { Plus, Trash2, Layers, Save } from 'lucide-react'

/**
 * Define sizes and add-ons per product.
 *   "اختر واحداً" (pick one)  → min=1, max=1   e.g. الحجم
 *   "اختياري"    (pick any)  → min=0, max=0   e.g. إضافات
 */
export function AdminModifiers() {
  const queryClient = useQueryClient()
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [search, setSearch] = useState('')

  // New-group form
  const [groupName, setGroupName] = useState('')
  const [groupMode, setGroupMode] = useState<'one' | 'any'>('one')

  // New-option form, keyed by group id
  const [optName, setOptName] = useState<Record<string, string>>({})
  const [optPrice, setOptPrice] = useState<Record<string, string>>({})

  const { data: products = [] } = useQuery({
    queryKey: ['products', 'all'],
    queryFn: () => apiClient.getProducts().then(res => res.data || []),
  })

  const { data: groups = [], refetch } = useQuery({
    queryKey: ['product-modifiers', selectedProduct?.id],
    queryFn: () => apiClient.getProductModifiers(selectedProduct!.id).then(res => res.data || []),
    enabled: !!selectedProduct,
  })

  const invalidate = () => {
    refetch()
    // The cashier caches modifiers per product — drop that cache too
    queryClient.invalidateQueries({ queryKey: ['product-modifiers'] })
  }

  const createGroup = useMutation({
    mutationFn: () =>
      apiClient.createModifierGroup({
        product_id: selectedProduct!.id,
        name: groupName.trim(),
        min_select: groupMode === 'one' ? 1 : 0,
        max_select: groupMode === 'one' ? 1 : 0,
        sort_order: groups.length,
      }),
    onSuccess: () => {
      toastHelpers.success('تمت إضافة المجموعة')
      setGroupName('')
      invalidate()
    },
    onError: (e: any) => toastHelpers.apiError('إضافة المجموعة', e?.response?.data?.message || e),
  })

  const deleteGroup = useMutation({
    mutationFn: (id: string) => apiClient.deleteModifierGroup(id),
    onSuccess: () => {
      toastHelpers.success('تم حذف المجموعة')
      invalidate()
    },
    onError: (e: any) => toastHelpers.apiError('حذف المجموعة', e?.response?.data?.message || e),
  })

  const createOption = useMutation({
    mutationFn: (groupId: string) =>
      apiClient.createModifier({
        group_id: groupId,
        name: (optName[groupId] || '').trim(),
        price_delta: parseFloat(optPrice[groupId] || '0') || 0,
      }),
    onSuccess: (_res, groupId) => {
      toastHelpers.success('تمت إضافة الخيار')
      setOptName(prev => ({ ...prev, [groupId]: '' }))
      setOptPrice(prev => ({ ...prev, [groupId]: '' }))
      invalidate()
    },
    onError: (e: any) => toastHelpers.apiError('إضافة الخيار', e?.response?.data?.message || e),
  })

  const deleteOption = useMutation({
    mutationFn: (id: string) => apiClient.deleteModifier(id),
    onSuccess: () => {
      toastHelpers.success('تم حذف الخيار')
      invalidate()
    },
    onError: (e: any) => toastHelpers.apiError('حذف الخيار', e?.response?.data?.message || e),
  })

  const filtered = products.filter((p: Product) =>
    p.name.toLowerCase().includes(search.toLowerCase())
  )

  const groupRule = (g: ModifierGroup) =>
    g.max_select === 1 && g.min_select === 1 ? 'اختر واحداً (مطلوب)' : g.max_select > 0 ? `حتى ${g.max_select}` : 'اختياري (أي عدد)'

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Layers className="w-6 h-6" />
          الأحجام والإضافات
        </h1>
        <p className="text-muted-foreground">
          حدّد لكل صنف أحجامه (صغير/وسط/كبير) وإضافاته (جبنة، صوص...) مع فرق السعر
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Product picker */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-lg">اختر صنفاً</CardTitle>
            <CardDescription>اضغط على صنف لتعديل خياراته</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Input placeholder="بحث..." value={search} onChange={e => setSearch(e.target.value)} />
            <div className="max-h-[60vh] overflow-y-auto space-y-1">
              {filtered.map((p: Product) => (
                <button
                  key={p.id}
                  onClick={() => setSelectedProduct(p)}
                  className={`w-full text-right px-3 py-2 rounded-md text-sm transition-colors ${
                    selectedProduct?.id === p.id ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
                  }`}
                >
                  <div className="flex justify-between">
                    <span className="truncate">{p.name}</span>
                    <span className="text-xs opacity-80">{formatCurrency(p.price)}</span>
                  </div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Groups + options */}
        <Card className="lg:col-span-2">
          {!selectedProduct ? (
            <CardContent className="py-16 text-center text-muted-foreground">
              <Layers className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>اختر صنفاً من القائمة لإدارة أحجامه وإضافاته</p>
            </CardContent>
          ) : (
            <>
              <CardHeader>
                <CardTitle className="text-lg">{selectedProduct.name}</CardTitle>
                <CardDescription>السعر الأساسي: {formatCurrency(selectedProduct.price)}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Add a group */}
                <div className="flex flex-wrap items-center gap-2 p-3 bg-muted/40 rounded-lg">
                  <Input
                    placeholder="اسم المجموعة (مثال: الحجم)"
                    value={groupName}
                    onChange={e => setGroupName(e.target.value)}
                    className="flex-1 min-w-[180px]"
                  />
                  <div className="flex rounded-md overflow-hidden border border-border">
                    <button
                      type="button"
                      className={`px-3 h-9 text-sm ${groupMode === 'one' ? 'bg-primary text-primary-foreground' : 'bg-background'}`}
                      onClick={() => setGroupMode('one')}
                    >
                      اختر واحداً
                    </button>
                    <button
                      type="button"
                      className={`px-3 h-9 text-sm ${groupMode === 'any' ? 'bg-primary text-primary-foreground' : 'bg-background'}`}
                      onClick={() => setGroupMode('any')}
                    >
                      اختياري
                    </button>
                  </div>
                  <Button
                    onClick={() => createGroup.mutate()}
                    disabled={!groupName.trim() || createGroup.isPending}
                  >
                    <Plus className="w-4 h-4 ml-1" />
                    إضافة مجموعة
                  </Button>
                </div>

                {groups.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-6">
                    لا توجد مجموعات لهذا الصنف بعد
                  </p>
                )}

                {groups.map((g: ModifierGroup) => (
                  <div key={g.id} className="border border-border rounded-lg p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{g.name}</span>
                        <Badge variant="outline" className="text-xs">{groupRule(g)}</Badge>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteGroup.mutate(g.id)}
                        disabled={deleteGroup.isPending}
                      >
                        <Trash2 className="w-4 h-4 text-red-600" />
                      </Button>
                    </div>

                    {/* Options */}
                    <div className="space-y-1">
                      {g.modifiers.length === 0 && (
                        <p className="text-xs text-muted-foreground">لا توجد خيارات — أضف أول خيار بالأسفل</p>
                      )}
                      {g.modifiers.map(m => (
                        <div key={m.id} className="flex items-center justify-between px-3 py-1.5 bg-muted/40 rounded">
                          <span className="text-sm">{m.name}</span>
                          <div className="flex items-center gap-3">
                            <span className="text-sm text-muted-foreground">
                              {m.price_delta > 0 ? `+ ${formatCurrency(m.price_delta)}` : m.price_delta < 0 ? formatCurrency(m.price_delta) : 'بدون فرق'}
                            </span>
                            <Button variant="ghost" size="sm" onClick={() => deleteOption.mutate(m.id)}>
                              <Trash2 className="w-3.5 h-3.5 text-red-600" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Add an option */}
                    <div className="flex flex-wrap items-center gap-2">
                      <Input
                        placeholder="اسم الخيار (مثال: كبير)"
                        value={optName[g.id] || ''}
                        onChange={e => setOptName(prev => ({ ...prev, [g.id]: e.target.value }))}
                        className="flex-1 min-w-[140px] h-9"
                      />
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="فرق السعر"
                        value={optPrice[g.id] || ''}
                        onChange={e => setOptPrice(prev => ({ ...prev, [g.id]: e.target.value }))}
                        className="w-32 h-9"
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => createOption.mutate(g.id)}
                        disabled={!(optName[g.id] || '').trim() || createOption.isPending}
                      >
                        <Save className="w-4 h-4 ml-1" />
                        حفظ الخيار
                      </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </>
          )}
        </Card>
      </div>
    </div>
  )
}
