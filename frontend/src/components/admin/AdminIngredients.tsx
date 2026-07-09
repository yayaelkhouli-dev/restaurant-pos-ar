import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/api/client'
import type { Ingredient, Unit, UnitType } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/hooks/use-toast'
import {
  Package, Plus, Search, Pencil, Trash2, AlertTriangle, Ruler, X, Boxes, History,
} from 'lucide-react'
import type { StockMovement, MovementType } from '@/types'
import { formatCurrency } from '@/lib/utils'

const UNIT_TYPE_LABELS: Record<UnitType, string> = {
  weight: 'وزن',
  volume: 'حجم',
  count: 'عدد',
}

const fmt = (n: number) => `${(n ?? 0).toLocaleString('en-US', { maximumFractionDigits: 3 })}`
const money = (n: number) => formatCurrency(n ?? 0)

export function AdminIngredients() {
  const [tab, setTab] = useState<'ingredients' | 'units'>('ingredients')

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">المخزون والمكوّنات</h1>
        <p className="text-muted-foreground">إدارة المكوّنات الخام ووحدات القياس وتكلفتها</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-border">
        <button
          onClick={() => setTab('ingredients')}
          className={`flex items-center gap-2 px-4 py-2 -mb-px border-b-2 transition-colors ${
            tab === 'ingredients' ? 'border-primary text-primary font-semibold' : 'border-transparent text-muted-foreground'
          }`}
        >
          <Package className="w-4 h-4" /> المكوّنات
        </button>
        <button
          onClick={() => setTab('units')}
          className={`flex items-center gap-2 px-4 py-2 -mb-px border-b-2 transition-colors ${
            tab === 'units' ? 'border-primary text-primary font-semibold' : 'border-transparent text-muted-foreground'
          }`}
        >
          <Ruler className="w-4 h-4" /> وحدات القياس
        </button>
      </div>

      {tab === 'ingredients' ? <IngredientsTab /> : <UnitsTab />}
    </div>
  )
}

// ============================================================
// Ingredients Tab
// ============================================================

const emptyIngredient = {
  name: '', unit_id: '', current_stock: 0, minimum_stock: 0, cost_per_unit: 0, waste_pct: 0, supplier: '',
}

function IngredientsTab() {
  const qc = useQueryClient()
  const { toast } = useToast()
  const [search, setSearch] = useState('')
  const [lowOnly, setLowOnly] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Ingredient | null>(null)
  const [form, setForm] = useState<typeof emptyIngredient>(emptyIngredient)
  const [adjusting, setAdjusting] = useState<Ingredient | null>(null)
  const [adjustDelta, setAdjustDelta] = useState<number>(0)
  const [viewingMovements, setViewingMovements] = useState<Ingredient | null>(null)

  const { data: units = [] } = useQuery({
    queryKey: ['units'],
    queryFn: () => apiClient.getUnits().then(r => r.data || []),
  })

  const { data: ingredients = [], isLoading } = useQuery({
    queryKey: ['ingredients', search, lowOnly],
    queryFn: () => apiClient.getIngredients({ search: search || undefined, low_stock: lowOnly || undefined }).then(r => r.data || []),
  })

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['ingredients'] })
    qc.invalidateQueries({ queryKey: ['recipesOverview'] })
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name,
        unit_id: form.unit_id,
        current_stock: Number(form.current_stock),
        minimum_stock: Number(form.minimum_stock),
        cost_per_unit: Number(form.cost_per_unit),
        waste_pct: Number(form.waste_pct),
        supplier: form.supplier || undefined,
      }
      if (editing) return apiClient.updateIngredient(editing.id, payload)
      return apiClient.createIngredient(payload)
    },
    onSuccess: () => {
      toast({ title: editing ? 'تم تعديل المكوّن' : 'تمت إضافة المكوّن' })
      setShowForm(false); setEditing(null); setForm(emptyIngredient); invalidate()
    },
    onError: (e: any) => toast({ title: 'خطأ', description: e.message, variant: 'destructive' }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.deleteIngredient(id),
    onSuccess: () => { toast({ title: 'تم حذف المكوّن' }); invalidate() },
    onError: (e: any) => toast({ title: 'تعذّر الحذف', description: e.message, variant: 'destructive' }),
  })

  const adjustMutation = useMutation({
    mutationFn: () => apiClient.adjustIngredientStock(adjusting!.id, Number(adjustDelta)),
    onSuccess: () => { toast({ title: 'تم تعديل المخزون' }); setAdjusting(null); setAdjustDelta(0); invalidate() },
    onError: (e: any) => toast({ title: 'خطأ', description: e.message, variant: 'destructive' }),
  })

  const openAdd = () => { setEditing(null); setForm({ ...emptyIngredient, unit_id: units[0]?.id || '' }); setShowForm(true) }
  const openEdit = (ing: Ingredient) => {
    setEditing(ing)
    setForm({
      name: ing.name, unit_id: ing.unit_id || '', current_stock: ing.current_stock,
      minimum_stock: ing.minimum_stock, cost_per_unit: ing.cost_per_unit, waste_pct: ing.waste_pct || 0,
      supplier: ing.supplier || '',
    })
    setShowForm(true)
  }

  const lowCount = ingredients.filter(i => i.is_low_stock).length

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div className="flex items-center gap-3 flex-1 min-w-[280px]">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="ابحث عن مكوّن..." value={search} onChange={e => setSearch(e.target.value)} className="pr-10" />
          </div>
          <Button variant={lowOnly ? 'default' : 'outline'} size="sm" onClick={() => setLowOnly(v => !v)}>
            <AlertTriangle className="w-4 h-4 ml-2" />
            النواقص {lowCount > 0 && `(${lowCount})`}
          </Button>
        </div>
        <Button onClick={openAdd}>
          <Plus className="w-4 h-4 ml-2" /> إضافة مكوّن
        </Button>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex justify-center py-12">
              <div className="w-6 h-6 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : ingredients.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Boxes className="w-10 h-10 mx-auto mb-2 opacity-40" />
              لا توجد مكوّنات. اضغط «إضافة مكوّن» للبدء.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr>
                    <th className="text-right p-3 font-medium">المكوّن</th>
                    <th className="text-center p-3 font-medium">المخزون الحالي</th>
                    <th className="text-center p-3 font-medium">الحد الأدنى</th>
                    <th className="text-center p-3 font-medium">تكلفة الوحدة</th>
                    <th className="text-center p-3 font-medium">المورّد</th>
                    <th className="text-center p-3 font-medium">الحالة</th>
                    <th className="text-center p-3 font-medium">إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {ingredients.map(ing => (
                    <tr key={ing.id} className="border-t border-border hover:bg-muted/30">
                      <td className="p-3 font-medium">{ing.name}</td>
                      <td className="p-3 text-center">{fmt(ing.current_stock)} {ing.unit?.abbreviation || ''}</td>
                      <td className="p-3 text-center text-muted-foreground">{fmt(ing.minimum_stock)} {ing.unit?.abbreviation || ''}</td>
                      <td className="p-3 text-center">{money(ing.cost_per_unit)} / {ing.unit?.abbreviation || 'وحدة'}</td>
                      <td className="p-3 text-center text-muted-foreground">{ing.supplier || '—'}</td>
                      <td className="p-3 text-center">
                        {ing.is_low_stock
                          ? <Badge className="bg-red-100 text-red-700">ناقص</Badge>
                          : <Badge className="bg-green-100 text-green-700">متوفّر</Badge>}
                      </td>
                      <td className="p-3">
                        <div className="flex items-center justify-center gap-1">
                          <Button variant="ghost" size="sm" title="سجل الحركات"
                            onClick={() => setViewingMovements(ing)}>
                            <History className="w-4 h-4 text-purple-600" />
                          </Button>
                          <Button variant="ghost" size="sm" title="تعديل المخزون"
                            onClick={() => { setAdjusting(ing); setAdjustDelta(0) }}>
                            <Boxes className="w-4 h-4 text-blue-600" />
                          </Button>
                          <Button variant="ghost" size="sm" title="تعديل" onClick={() => openEdit(ing)}>
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="sm" title="حذف"
                            onClick={() => { if (confirm(`حذف «${ing.name}»؟`)) deleteMutation.mutate(ing.id) }}>
                            <Trash2 className="w-4 h-4 text-red-600" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Modal */}
      {showForm && (
        <Modal title={editing ? 'تعديل مكوّن' : 'إضافة مكوّن'} onClose={() => setShowForm(false)}>
          <div className="space-y-4">
            <Field label="اسم المكوّن">
              <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="مثال: دقيق" />
            </Field>
            <Field label="وحدة المخزون">
              <select className={selectCls} value={form.unit_id} onChange={e => setForm({ ...form, unit_id: e.target.value })}>
                <option value="" disabled>اختر وحدة</option>
                {units.map(u => <option key={u.id} value={u.id}>{u.name} ({u.abbreviation}) — {UNIT_TYPE_LABELS[u.unit_type]}</option>)}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="المخزون الحالي">
                <Input type="number" value={form.current_stock} onChange={e => setForm({ ...form, current_stock: +e.target.value })} />
              </Field>
              <Field label="الحد الأدنى (تنبيه النقص)">
                <Input type="number" value={form.minimum_stock} onChange={e => setForm({ ...form, minimum_stock: +e.target.value })} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="تكلفة الوحدة (ج.م)">
                <Input type="number" step="0.0001" value={form.cost_per_unit} onChange={e => setForm({ ...form, cost_per_unit: +e.target.value })} />
              </Field>
              <Field label="نسبة الهالك % (الفاقد في التحضير)">
                <Input type="number" step="0.1" min="0" max="99" value={form.waste_pct} onChange={e => setForm({ ...form, waste_pct: +e.target.value })} />
              </Field>
            </div>
            <Field label="المورّد (اختياري)">
              <Input value={form.supplier} onChange={e => setForm({ ...form, supplier: e.target.value })} />
            </Field>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowForm(false)}>إلغاء</Button>
              <Button onClick={() => saveMutation.mutate()} disabled={!form.name || !form.unit_id || saveMutation.isPending}>
                {editing ? 'حفظ التعديل' : 'إضافة'}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Adjust Stock Modal */}
      {adjusting && (
        <Modal title={`تعديل مخزون: ${adjusting.name}`} onClose={() => setAdjusting(null)}>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              المخزون الحالي: <span className="font-semibold text-foreground">{fmt(adjusting.current_stock)} {adjusting.unit?.abbreviation}</span>
            </p>
            <Field label="الكمية (موجبة = إضافة / سالبة = خصم)">
              <Input type="number" value={adjustDelta} onChange={e => setAdjustDelta(+e.target.value)} placeholder="مثال: 5000 أو -2000" />
            </Field>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setAdjustDelta(Math.abs(adjustDelta) || 0)}>+ إضافة</Button>
              <Button variant="outline" className="flex-1" onClick={() => setAdjustDelta(-Math.abs(adjustDelta) || 0)}>− خصم</Button>
            </div>
            <p className="text-sm">
              المخزون بعد التعديل: <span className="font-semibold">{fmt(Math.max((adjusting.current_stock || 0) + Number(adjustDelta), 0))} {adjusting.unit?.abbreviation}</span>
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setAdjusting(null)}>إلغاء</Button>
              <Button onClick={() => adjustMutation.mutate()} disabled={!adjustDelta || adjustMutation.isPending}>تطبيق</Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Movements History Modal */}
      {viewingMovements && (
        <Modal title={`سجل حركات: ${viewingMovements.name}`} onClose={() => setViewingMovements(null)}>
          <MovementsView ingredient={viewingMovements} />
        </Modal>
      )}
    </div>
  )
}

// ============================================================
// Stock Movements History
// ============================================================

const MOVEMENT_LABELS: Record<MovementType, { label: string; cls: string }> = {
  sale: { label: 'بيع', cls: 'bg-red-100 text-red-700' },
  cancel_return: { label: 'استرجاع إلغاء', cls: 'bg-green-100 text-green-700' },
  restock: { label: 'إضافة مخزون', cls: 'bg-green-100 text-green-700' },
  purchase: { label: 'شراء', cls: 'bg-blue-100 text-blue-700' },
  waste: { label: 'هالك/خصم', cls: 'bg-orange-100 text-orange-700' },
  adjustment: { label: 'تعديل', cls: 'bg-gray-100 text-gray-700' },
}

function MovementsView({ ingredient }: { ingredient: Ingredient }) {
  const { data: movements = [], isLoading } = useQuery({
    queryKey: ['movements', ingredient.id],
    queryFn: () => apiClient.getStockMovements(ingredient.id).then(r => r.data || []),
  })

  if (isLoading) {
    return <div className="flex justify-center py-8"><div className="w-6 h-6 border-4 border-primary border-t-transparent rounded-full animate-spin" /></div>
  }
  if (movements.length === 0) {
    return <div className="text-center py-8 text-muted-foreground">لا توجد حركات مسجّلة لهذا المكوّن بعد.</div>
  }

  const abbr = ingredient.unit?.abbreviation || ''
  return (
    <div className="max-h-[60vh] overflow-y-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-muted-foreground sticky top-0">
          <tr>
            <th className="text-right p-2 font-medium">التاريخ</th>
            <th className="text-center p-2 font-medium">النوع</th>
            <th className="text-center p-2 font-medium">الكمية</th>
            <th className="text-center p-2 font-medium">الرصيد بعدها</th>
          </tr>
        </thead>
        <tbody>
          {movements.map((m: StockMovement) => {
            const meta = MOVEMENT_LABELS[m.movement_type] || MOVEMENT_LABELS.adjustment
            return (
              <tr key={m.id} className="border-t border-border">
                <td className="p-2 text-muted-foreground whitespace-nowrap">{new Date(m.created_at).toLocaleString('ar-EG')}</td>
                <td className="p-2 text-center"><Badge className={meta.cls}>{meta.label}</Badge></td>
                <td className={`p-2 text-center font-medium ${m.quantity < 0 ? 'text-red-600' : 'text-green-700'}`}>
                  {m.quantity > 0 ? '+' : ''}{fmt(m.quantity)} {abbr}
                </td>
                <td className="p-2 text-center">{m.balance_after != null ? `${fmt(m.balance_after)} ${abbr}` : '—'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ============================================================
// Units Tab
// ============================================================

const emptyUnit = { name: '', abbreviation: '', unit_type: 'weight' as UnitType, base_factor: 1 }

function UnitsTab() {
  const qc = useQueryClient()
  const { toast } = useToast()
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Unit | null>(null)
  const [form, setForm] = useState<typeof emptyUnit>(emptyUnit)

  const { data: units = [], isLoading } = useQuery({
    queryKey: ['units'],
    queryFn: () => apiClient.getUnits().then(r => r.data || []),
  })

  const invalidate = () => qc.invalidateQueries({ queryKey: ['units'] })

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = { name: form.name, abbreviation: form.abbreviation, unit_type: form.unit_type, base_factor: Number(form.base_factor) }
      if (editing) return apiClient.updateUnit(editing.id, payload)
      return apiClient.createUnit(payload)
    },
    onSuccess: () => { toast({ title: editing ? 'تم تعديل الوحدة' : 'تمت إضافة الوحدة' }); setShowForm(false); setEditing(null); setForm(emptyUnit); invalidate() },
    onError: (e: any) => toast({ title: 'خطأ', description: e.message, variant: 'destructive' }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.deleteUnit(id),
    onSuccess: () => { toast({ title: 'تم حذف الوحدة' }); invalidate() },
    onError: (e: any) => toast({ title: 'تعذّر الحذف', description: e.message, variant: 'destructive' }),
  })

  const openAdd = () => { setEditing(null); setForm(emptyUnit); setShowForm(true) }
  const openEdit = (u: Unit) => { setEditing(u); setForm({ name: u.name, abbreviation: u.abbreviation, unit_type: u.unit_type, base_factor: u.base_factor }); setShowForm(true) }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground max-w-2xl">
          «معامل التحويل» = كم وحدة أساسية تساوي وحدة واحدة. الأساس: الوزن = جرام، الحجم = مليلتر، العدد = قطعة.
          مثال: كيلوجرام = 1000، لتر = 1000.
        </p>
        <Button onClick={openAdd}><Plus className="w-4 h-4 ml-2" /> إضافة وحدة</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex justify-center py-12"><div className="w-6 h-6 border-4 border-primary border-t-transparent rounded-full animate-spin" /></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr>
                    <th className="text-right p-3 font-medium">الوحدة</th>
                    <th className="text-center p-3 font-medium">الاختصار</th>
                    <th className="text-center p-3 font-medium">النوع</th>
                    <th className="text-center p-3 font-medium">معامل التحويل</th>
                    <th className="text-center p-3 font-medium">إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {units.map(u => (
                    <tr key={u.id} className="border-t border-border hover:bg-muted/30">
                      <td className="p-3 font-medium">{u.name}</td>
                      <td className="p-3 text-center">{u.abbreviation}</td>
                      <td className="p-3 text-center"><Badge variant="outline">{UNIT_TYPE_LABELS[u.unit_type]}</Badge></td>
                      <td className="p-3 text-center">{u.base_factor}</td>
                      <td className="p-3">
                        <div className="flex items-center justify-center gap-1">
                          <Button variant="ghost" size="sm" onClick={() => openEdit(u)}><Pencil className="w-4 h-4" /></Button>
                          <Button variant="ghost" size="sm" onClick={() => { if (confirm(`حذف وحدة «${u.name}»؟`)) deleteMutation.mutate(u.id) }}>
                            <Trash2 className="w-4 h-4 text-red-600" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {showForm && (
        <Modal title={editing ? 'تعديل وحدة' : 'إضافة وحدة'} onClose={() => setShowForm(false)}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="اسم الوحدة"><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="مثال: كيلوجرام" /></Field>
              <Field label="الاختصار"><Input value={form.abbreviation} onChange={e => setForm({ ...form, abbreviation: e.target.value })} placeholder="مثال: كجم" /></Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="النوع">
                <select className={selectCls} value={form.unit_type} onChange={e => setForm({ ...form, unit_type: e.target.value as UnitType })}>
                  <option value="weight">وزن</option>
                  <option value="volume">حجم</option>
                  <option value="count">عدد</option>
                </select>
              </Field>
              <Field label="معامل التحويل"><Input type="number" step="0.0001" value={form.base_factor} onChange={e => setForm({ ...form, base_factor: +e.target.value })} /></Field>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowForm(false)}>إلغاء</Button>
              <Button onClick={() => saveMutation.mutate()} disabled={!form.name || !form.abbreviation || saveMutation.isPending}>
                {editing ? 'حفظ التعديل' : 'إضافة'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ============================================================
// Shared small components
// ============================================================

const selectCls = 'flex h-10 w-full items-center rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium">{label}</label>
      {children}
    </div>
  )
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <Card className="w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>{title}</CardTitle>
          <Button variant="ghost" size="sm" onClick={onClose}><X className="w-4 h-4" /></Button>
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    </div>
  )
}
