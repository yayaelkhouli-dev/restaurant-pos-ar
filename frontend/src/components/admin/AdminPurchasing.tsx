import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/api/client'
import type { Ingredient, Unit } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/hooks/use-toast'
import { Truck, ClipboardCheck, BarChart3, Plus, Trash2, X, Calculator } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

const money = (n: number) => formatCurrency(n ?? 0)
const num = (n: number) => (n ?? 0).toLocaleString('en-US', { maximumFractionDigits: 3 })
const selectCls = 'flex h-10 items-center rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring'

export function AdminPurchasing() {
  const [tab, setTab] = useState<'purchases' | 'count' | 'report'>('purchases')
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">المشتريات والجرد</h1>
        <p className="text-muted-foreground">توريد المكوّنات، الجرد الفعلي، وتقارير المخزون والتكاليف</p>
      </div>

      <div className="flex gap-2 border-b border-border flex-wrap">
        <TabBtn active={tab === 'purchases'} onClick={() => setTab('purchases')} icon={<Truck className="w-4 h-4" />}>التوريد (المشتريات)</TabBtn>
        <TabBtn active={tab === 'count'} onClick={() => setTab('count')} icon={<ClipboardCheck className="w-4 h-4" />}>الجرد</TabBtn>
        <TabBtn active={tab === 'report'} onClick={() => setTab('report')} icon={<BarChart3 className="w-4 h-4" />}>تقرير المخزون</TabBtn>
      </div>

      {tab === 'purchases' && <PurchasesTab />}
      {tab === 'count' && <StockCountTab />}
      {tab === 'report' && <InventoryReportTab />}
    </div>
  )
}

function TabBtn({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2 -mb-px border-b-2 transition-colors ${active ? 'border-primary text-primary font-semibold' : 'border-transparent text-muted-foreground'}`}>
      {icon}{children}
    </button>
  )
}

// ============================================================
// Purchases tab
// ============================================================
function PurchasesTab() {
  const [showNew, setShowNew] = useState(false)
  const { data: purchases = [], isLoading } = useQuery({ queryKey: ['purchases'], queryFn: () => apiClient.getPurchases().then(r => r.data || []) })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground max-w-2xl">سجّل فاتورة توريد المكوّنات الخام. النظام يزيد المخزون ويحدّث تكلفة المكوّن تلقائياً (متوسط مرجّح).</p>
        <Button onClick={() => setShowNew(true)}><Plus className="w-4 h-4 ml-2" /> توريد جديد</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <Spinner />
          ) : purchases.length === 0 ? (
            <Empty icon={<Truck className="w-10 h-10 mx-auto mb-2 opacity-40" />} text="لا توجد فواتير توريد بعد." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr>
                    <th className="text-right p-3 font-medium">المورّد</th>
                    <th className="text-right p-3 font-medium">رقم الفاتورة</th>
                    <th className="text-center p-3 font-medium">عدد البنود</th>
                    <th className="text-center p-3 font-medium">الإجمالي</th>
                    <th className="text-center p-3 font-medium">بواسطة</th>
                    <th className="text-center p-3 font-medium">التاريخ</th>
                  </tr>
                </thead>
                <tbody>
                  {purchases.map(p => (
                    <tr key={p.id} className="border-t border-border hover:bg-muted/30">
                      <td className="p-3 font-medium">{p.supplier || '—'}</td>
                      <td className="p-3 text-muted-foreground">{p.reference || '—'}</td>
                      <td className="p-3 text-center">{p.item_count}</td>
                      <td className="p-3 text-center font-medium">{money(p.total_cost)}</td>
                      <td className="p-3 text-center text-muted-foreground">{p.created_by_name || '—'}</td>
                      <td className="p-3 text-center text-muted-foreground whitespace-nowrap">{new Date(p.created_at).toLocaleDateString('ar-EG')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {showNew && <NewPurchaseModal onClose={() => setShowNew(false)} />}
    </div>
  )
}

interface PItem { ingredient_id: string; quantity: number; unit_id: string; unit_cost: number }

function NewPurchaseModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const { toast } = useToast()
  const { data: ingredients = [] } = useQuery({ queryKey: ['ingredients', '', false], queryFn: () => apiClient.getIngredients().then(r => r.data || []) })
  const { data: units = [] } = useQuery({ queryKey: ['units'], queryFn: () => apiClient.getUnits().then(r => r.data || []) })
  const ingMap = useMemo(() => new Map(ingredients.map(i => [i.id, i])), [ingredients])

  const [supplier, setSupplier] = useState('')
  const [reference, setReference] = useState('')
  const [items, setItems] = useState<PItem[]>([])

  const compatibleUnits = (ingredientId: string): Unit[] => {
    const ing = ingMap.get(ingredientId)
    if (!ing?.unit) return units
    return units.filter(u => u.unit_type === ing.unit!.unit_type)
  }
  const addItem = () => {
    const ing = ingredients[0]
    setItems([...items, { ingredient_id: ing?.id || '', quantity: 1, unit_id: ing?.unit_id || units[0]?.id || '', unit_cost: 0 }])
  }
  const update = (idx: number, patch: Partial<PItem>) => {
    setItems(items.map((it, i) => {
      if (i !== idx) return it
      const next = { ...it, ...patch }
      if (patch.ingredient_id) { const ing = ingMap.get(patch.ingredient_id); if (ing?.unit_id) next.unit_id = ing.unit_id }
      return next
    }))
  }
  const remove = (idx: number) => setItems(items.filter((_, i) => i !== idx))
  const total = items.reduce((s, it) => s + (it.quantity || 0) * (it.unit_cost || 0), 0)

  const saveMutation = useMutation({
    mutationFn: () => apiClient.createPurchase({
      supplier: supplier || undefined, reference: reference || undefined,
      items: items.filter(it => it.ingredient_id && it.unit_id && it.quantity > 0)
        .map(it => ({ ingredient_id: it.ingredient_id, quantity: Number(it.quantity), unit_id: it.unit_id, unit_cost: Number(it.unit_cost) })),
    }),
    onSuccess: () => {
      toast({ title: 'تم تسجيل التوريد وتحديث المخزون' })
      qc.invalidateQueries({ queryKey: ['purchases'] })
      qc.invalidateQueries({ queryKey: ['ingredients'] })
      qc.invalidateQueries({ queryKey: ['recipesOverview'] })
      onClose()
    },
    onError: (e: any) => toast({ title: 'خطأ', description: e.message, variant: 'destructive' }),
  })

  return (
    <Modal title="فاتورة توريد جديدة" onClose={onClose} wide>
      {ingredients.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">أضف المكوّنات أولاً من صفحة «المخزون والمكوّنات».</div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="المورّد (اختياري)"><Input value={supplier} onChange={e => setSupplier(e.target.value)} placeholder="اسم المورّد" /></Field>
            <Field label="رقم الفاتورة (اختياري)"><Input value={reference} onChange={e => setReference(e.target.value)} /></Field>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">البنود</label>
              <Button variant="outline" size="sm" onClick={addItem}><Plus className="w-4 h-4 ml-1" /> إضافة بند</Button>
            </div>
            {items.length === 0 ? (
              <div className="text-center py-6 text-sm text-muted-foreground border border-dashed rounded-lg">اضغط «إضافة بند» لبدء الفاتورة.</div>
            ) : (
              <div className="space-y-2">
                <div className="hidden sm:grid grid-cols-12 gap-2 text-xs text-muted-foreground px-1">
                  <div className="col-span-4">المكوّن</div><div className="col-span-2">الكمية</div><div className="col-span-2">الوحدة</div><div className="col-span-2">سعر الوحدة</div><div className="col-span-2 text-center">الإجمالي</div>
                </div>
                {items.map((it, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-center bg-muted/30 rounded-lg p-2">
                    <select className={`${selectCls} col-span-12 sm:col-span-4`} value={it.ingredient_id} onChange={e => update(idx, { ingredient_id: e.target.value })}>
                      <option value="" disabled>اختر مكوّن</option>
                      {ingredients.map((ing: Ingredient) => <option key={ing.id} value={ing.id}>{ing.name}</option>)}
                    </select>
                    <Input type="number" step="0.0001" className="col-span-4 sm:col-span-2" value={it.quantity} onChange={e => update(idx, { quantity: +e.target.value })} />
                    <select className={`${selectCls} col-span-4 sm:col-span-2`} value={it.unit_id} onChange={e => update(idx, { unit_id: e.target.value })}>
                      {compatibleUnits(it.ingredient_id).map(u => <option key={u.id} value={u.id}>{u.abbreviation}</option>)}
                    </select>
                    <Input type="number" step="0.0001" className="col-span-3 sm:col-span-2" value={it.unit_cost} onChange={e => update(idx, { unit_cost: +e.target.value })} />
                    <div className="col-span-1 sm:col-span-2 flex items-center justify-between sm:justify-center gap-1">
                      <span className="text-sm font-medium">{money((it.quantity || 0) * (it.unit_cost || 0))}</span>
                      <Button variant="ghost" size="sm" onClick={() => remove(idx)}><Trash2 className="w-4 h-4 text-red-600" /></Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between bg-muted/40 rounded-lg p-4">
            <span className="font-medium flex items-center gap-2"><Calculator className="w-4 h-4" /> إجمالي الفاتورة</span>
            <span className="text-xl font-bold">{money(total)}</span>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>إلغاء</Button>
            <Button onClick={() => saveMutation.mutate()} disabled={items.length === 0 || saveMutation.isPending}>حفظ التوريد</Button>
          </div>
        </div>
      )}
    </Modal>
  )
}

// ============================================================
// Stock count tab
// ============================================================
function StockCountTab() {
  const [showNew, setShowNew] = useState(false)
  const { data: counts = [], isLoading } = useQuery({ queryKey: ['stockCounts'], queryFn: () => apiClient.getStockCounts().then(r => r.data || []) })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground max-w-2xl">الجرد يقارن المخزون النظري (ما يقوله النظام) بالفعلي (المعدود)، ويحسب قيمة الفرق (الفاقد) ويسوّي المخزون.</p>
        <Button onClick={() => setShowNew(true)}><Plus className="w-4 h-4 ml-2" /> جرد جديد</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? <Spinner /> : counts.length === 0 ? (
            <Empty icon={<ClipboardCheck className="w-10 h-10 mx-auto mb-2 opacity-40" />} text="لا توجد عمليات جرد بعد." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr>
                    <th className="text-right p-3 font-medium">التاريخ</th>
                    <th className="text-center p-3 font-medium">عدد المكوّنات</th>
                    <th className="text-center p-3 font-medium">قيمة الفرق (الفاقد)</th>
                    <th className="text-center p-3 font-medium">بواسطة</th>
                  </tr>
                </thead>
                <tbody>
                  {counts.map(c => (
                    <tr key={c.id} className="border-t border-border hover:bg-muted/30">
                      <td className="p-3 whitespace-nowrap">{new Date(c.created_at).toLocaleString('ar-EG')}</td>
                      <td className="p-3 text-center">{c.item_count}</td>
                      <td className="p-3 text-center font-medium">
                        <span className={c.total_variance_cost < 0 ? 'text-red-600' : c.total_variance_cost > 0 ? 'text-green-700' : ''}>{money(c.total_variance_cost)}</span>
                      </td>
                      <td className="p-3 text-center text-muted-foreground">{c.created_by_name || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {showNew && <NewStockCountModal onClose={() => setShowNew(false)} />}
    </div>
  )
}

function NewStockCountModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const { toast } = useToast()
  const { data: ingredients = [] } = useQuery({ queryKey: ['ingredients', '', false], queryFn: () => apiClient.getIngredients().then(r => r.data || []) })
  const [counted, setCounted] = useState<Record<string, number>>({})

  const getCounted = (ing: Ingredient) => (counted[ing.id] !== undefined ? counted[ing.id] : ing.current_stock)
  const variance = (ing: Ingredient) => getCounted(ing) - ing.current_stock
  const totalVarCost = ingredients.reduce((s, ing) => s + variance(ing) * ing.cost_per_unit, 0)

  const saveMutation = useMutation({
    mutationFn: () => apiClient.createStockCount({
      items: ingredients.map(ing => ({ ingredient_id: ing.id, counted_qty: Number(getCounted(ing)) })),
    }),
    onSuccess: () => {
      toast({ title: 'تم تسجيل الجرد وتسوية المخزون' })
      qc.invalidateQueries({ queryKey: ['stockCounts'] })
      qc.invalidateQueries({ queryKey: ['ingredients'] })
      onClose()
    },
    onError: (e: any) => toast({ title: 'خطأ', description: e.message, variant: 'destructive' }),
  })

  return (
    <Modal title="جرد جديد" onClose={onClose} wide>
      {ingredients.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">لا توجد مكوّنات للجرد.</div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">أدخل الكمية المعدودة فعلياً لكل مكوّن. الفرق يُحسب تلقائياً والمخزون يُسوّى عند الحفظ.</p>
          <div className="max-h-[55vh] overflow-y-auto border rounded-lg">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-muted-foreground sticky top-0">
                <tr>
                  <th className="text-right p-2 font-medium">المكوّن</th>
                  <th className="text-center p-2 font-medium">النظري</th>
                  <th className="text-center p-2 font-medium">المعدود</th>
                  <th className="text-center p-2 font-medium">الفرق</th>
                </tr>
              </thead>
              <tbody>
                {ingredients.map(ing => {
                  const v = variance(ing)
                  return (
                    <tr key={ing.id} className="border-t border-border">
                      <td className="p-2 font-medium">{ing.name}</td>
                      <td className="p-2 text-center text-muted-foreground">{num(ing.current_stock)} {ing.unit?.abbreviation}</td>
                      <td className="p-2 text-center">
                        <Input type="number" step="0.0001" className="h-8 w-28 mx-auto text-center" value={getCounted(ing)}
                          onChange={e => setCounted({ ...counted, [ing.id]: +e.target.value })} />
                      </td>
                      <td className={`p-2 text-center font-medium ${v < 0 ? 'text-red-600' : v > 0 ? 'text-green-700' : 'text-muted-foreground'}`}>
                        {v > 0 ? '+' : ''}{num(v)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between bg-muted/40 rounded-lg p-4">
            <span className="font-medium">قيمة الفرق الإجمالية (الفاقد)</span>
            <span className={`text-xl font-bold ${totalVarCost < 0 ? 'text-red-600' : totalVarCost > 0 ? 'text-green-700' : ''}`}>{money(totalVarCost)}</span>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>إلغاء</Button>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>حفظ الجرد وتسوية المخزون</Button>
          </div>
        </div>
      )}
    </Modal>
  )
}

// ============================================================
// Inventory report tab
// ============================================================
function InventoryReportTab() {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['inventoryReport', from, to],
    queryFn: () => apiClient.getInventoryReport(from || undefined, to || undefined).then(r => r.data),
  })

  const items = data?.items || []
  const summary = data?.summary || { total_inventory_value: 0, total_consumed_value: 0, total_wasted_value: 0 }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5"><label className="text-sm font-medium">من تاريخ</label><Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="w-44" /></div>
        <div className="space-y-1.5"><label className="text-sm font-medium">إلى تاريخ</label><Input type="date" value={to} onChange={e => setTo(e.target.value)} className="w-44" /></div>
        <Button variant="outline" onClick={() => refetch()}>تحديث</Button>
        <span className="text-xs text-muted-foreground">الافتراضي: آخر 30 يوم</span>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">قيمة المخزون الحالية</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-green-700">{money(summary.total_inventory_value)}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">قيمة الاستهلاك (بيع)</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{money(summary.total_consumed_value)}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">قيمة الهالك/الفاقد</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-orange-600">{money(summary.total_wasted_value)}</div></CardContent></Card>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? <Spinner /> : items.length === 0 ? (
            <Empty icon={<BarChart3 className="w-10 h-10 mx-auto mb-2 opacity-40" />} text="لا توجد بيانات." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr>
                    <th className="text-right p-3 font-medium">المكوّن</th>
                    <th className="text-center p-3 font-medium">توريد</th>
                    <th className="text-center p-3 font-medium">استهلاك (بيع)</th>
                    <th className="text-center p-3 font-medium">هالك</th>
                    <th className="text-center p-3 font-medium">المخزون الحالي</th>
                    <th className="text-center p-3 font-medium">قيمة المخزون</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it: any) => (
                    <tr key={it.ingredient_id} className="border-t border-border hover:bg-muted/30">
                      <td className="p-3 font-medium">{it.name}</td>
                      <td className="p-3 text-center text-green-700">{it.received > 0 ? `+${num(it.received)}` : '—'} {it.received > 0 ? it.unit_abbr : ''}</td>
                      <td className="p-3 text-center">{it.consumed > 0 ? num(it.consumed) : '—'} {it.consumed > 0 ? it.unit_abbr : ''}</td>
                      <td className="p-3 text-center text-orange-600">{it.wasted > 0 ? num(it.wasted) : '—'} {it.wasted > 0 ? it.unit_abbr : ''}</td>
                      <td className="p-3 text-center">{num(it.current_stock)} {it.unit_abbr}</td>
                      <td className="p-3 text-center font-medium">{money(it.stock_value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ============================================================
// Shared small components
// ============================================================
function Spinner() { return <div className="flex justify-center py-12"><div className="w-6 h-6 border-4 border-primary border-t-transparent rounded-full animate-spin" /></div> }
function Empty({ icon, text }: { icon: React.ReactNode; text: string }) { return <div className="text-center py-12 text-muted-foreground">{icon}{text}</div> }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div className="space-y-1.5"><label className="text-sm font-medium">{label}</label>{children}</div> }

function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <Card className={`w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} max-h-[92vh] overflow-y-auto`} onClick={e => e.stopPropagation()}>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 sticky top-0 bg-card z-10 border-b">
          <CardTitle>{title}</CardTitle>
          <Button variant="ghost" size="sm" onClick={onClose}><X className="w-4 h-4" /></Button>
        </CardHeader>
        <CardContent className="pt-5">{children}</CardContent>
      </Card>
    </div>
  )
}
