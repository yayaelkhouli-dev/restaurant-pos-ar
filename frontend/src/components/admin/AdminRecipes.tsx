import { useState, useMemo, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/api/client'
import type {
  Ingredient, Unit, RecipeOverviewItem, SubRecipeOverview, RecipeItemInput, ComponentType,
} from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/hooks/use-toast'
import { ChefHat, Pencil, Plus, Trash2, X, Search, Calculator, ClipboardList, Beaker } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

const money = (n: number) => formatCurrency(n ?? 0)
const pct = (n: number) => `${(n ?? 0).toFixed(1)}%`
const wasteFactor = (w: number) => (w > 0 && w < 100 ? 1 / (1 - w / 100) : 1)

function foodCostColor(p: number, hasRecipe: boolean) {
  if (!hasRecipe) return 'bg-gray-100 text-gray-500'
  if (p <= 30) return 'bg-green-100 text-green-700'
  if (p <= 40) return 'bg-yellow-100 text-yellow-700'
  return 'bg-red-100 text-red-700'
}

const selectCls = 'flex h-10 items-center rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring'

// ============================================================
// Editor item type + shared cost helper
// ============================================================
interface EditorItem { component_type: ComponentType; ingredient_id?: string; sub_recipe_id?: string; quantity: number; unit_id: string }

function lineCostOf(it: EditorItem, ingMap: Map<string, Ingredient>, subMap: Map<string, SubRecipeOverview>, unitMap: Map<string, Unit>): number {
  const lineUnit = unitMap.get(it.unit_id)
  if (!lineUnit) return 0
  if (it.component_type === 'sub_recipe') {
    const sub = it.sub_recipe_id ? subMap.get(it.sub_recipe_id) : undefined
    const yieldUnit = sub ? unitMap.get(sub.yield_unit_id) : undefined
    if (!sub || !yieldUnit || !sub.yield_quantity) return 0
    const usedInYield = (it.quantity || 0) * (lineUnit.base_factor / yieldUnit.base_factor)
    return sub.batch_cost * (usedInYield / sub.yield_quantity)
  }
  const ing = it.ingredient_id ? ingMap.get(it.ingredient_id) : undefined
  if (!ing || !ing.unit) return 0
  const net = (it.quantity || 0) * (lineUnit.base_factor / ing.unit.base_factor)
  return net * wasteFactor(ing.waste_pct) * ing.cost_per_unit
}

export function AdminRecipes() {
  const [tab, setTab] = useState<'products' | 'preparations'>('products')
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">الوصفات وتكلفة الطعام</h1>
        <p className="text-muted-foreground">وصفات الأصناف، التحضيرات الفرعية، وتكلفة الطعام الحقيقية</p>
      </div>

      <div className="flex gap-2 border-b border-border">
        <button onClick={() => setTab('products')}
          className={`flex items-center gap-2 px-4 py-2 -mb-px border-b-2 transition-colors ${tab === 'products' ? 'border-primary text-primary font-semibold' : 'border-transparent text-muted-foreground'}`}>
          <ClipboardList className="w-4 h-4" /> وصفات الأصناف
        </button>
        <button onClick={() => setTab('preparations')}
          className={`flex items-center gap-2 px-4 py-2 -mb-px border-b-2 transition-colors ${tab === 'preparations' ? 'border-primary text-primary font-semibold' : 'border-transparent text-muted-foreground'}`}>
          <Beaker className="w-4 h-4" /> التحضيرات (وصفات فرعية)
        </button>
      </div>

      {tab === 'products' ? <ProductsTab /> : <PreparationsTab />}
    </div>
  )
}

// ============================================================
// Products tab
// ============================================================
function ProductsTab() {
  const [search, setSearch] = useState('')
  const [editingProduct, setEditingProduct] = useState<RecipeOverviewItem | null>(null)

  const { data: overview = [], isLoading } = useQuery({
    queryKey: ['recipesOverview'],
    queryFn: () => apiClient.getRecipesOverview().then(r => r.data || []),
  })

  const filtered = overview.filter(o => o.product_name.toLowerCase().includes(search.toLowerCase()))
  const withRecipe = overview.filter(o => o.has_recipe).length
  const avgFoodCost = (() => {
    const arr = overview.filter(o => o.has_recipe && o.price > 0)
    return arr.length ? arr.reduce((s, o) => s + o.food_cost_pct, 0) / arr.length : 0
  })()

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">أصناف لها وصفة</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{withRecipe} / {overview.length}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">متوسط نسبة تكلفة الطعام</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{pct(avgFoodCost)}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">أصناف بدون وصفة</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-orange-600">{overview.length - withRecipe}</div></CardContent></Card>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="ابحث عن صنف..." value={search} onChange={e => setSearch(e.target.value)} className="pr-10" />
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
                    <th className="text-right p-3 font-medium">الصنف</th>
                    <th className="text-right p-3 font-medium">الفئة</th>
                    <th className="text-center p-3 font-medium">سعر البيع</th>
                    <th className="text-center p-3 font-medium">تكلفة المكوّنات</th>
                    <th className="text-center p-3 font-medium">نسبة تكلفة الطعام</th>
                    <th className="text-center p-3 font-medium">هامش الربح</th>
                    <th className="text-center p-3 font-medium">الوصفة</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(o => (
                    <tr key={o.product_id} className="border-t border-border hover:bg-muted/30">
                      <td className="p-3 font-medium">{o.product_name}</td>
                      <td className="p-3 text-muted-foreground">{o.category_name || '—'}</td>
                      <td className="p-3 text-center">{money(o.price)}</td>
                      <td className="p-3 text-center">{o.has_recipe ? money(o.cost) : '—'}</td>
                      <td className="p-3 text-center">{o.has_recipe ? <Badge className={foodCostColor(o.food_cost_pct, true)}>{pct(o.food_cost_pct)}</Badge> : <span className="text-muted-foreground">—</span>}</td>
                      <td className="p-3 text-center">{o.has_recipe ? <span className={o.margin < 0 ? 'text-red-600 font-medium' : 'text-green-700 font-medium'}>{money(o.margin)}</span> : '—'}</td>
                      <td className="p-3 text-center">
                        <Button variant={o.has_recipe ? 'outline' : 'default'} size="sm" onClick={() => setEditingProduct(o)}>
                          {o.has_recipe ? <><Pencil className="w-4 h-4 ml-1" /> تعديل</> : <><Plus className="w-4 h-4 ml-1" /> إضافة وصفة</>}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {editingProduct && <RecipeEditor product={editingProduct} onClose={() => setEditingProduct(null)} />}
    </div>
  )
}

// ============================================================
// Shared hooks for editors
// ============================================================
function useEditorData() {
  const { data: ingredients = [] } = useQuery({ queryKey: ['ingredients', '', false], queryFn: () => apiClient.getIngredients().then(r => r.data || []) })
  const { data: units = [] } = useQuery({ queryKey: ['units'], queryFn: () => apiClient.getUnits().then(r => r.data || []) })
  const { data: subRecipes = [] } = useQuery({ queryKey: ['subRecipes'], queryFn: () => apiClient.getSubRecipes().then(r => r.data || []) })
  const ingMap = useMemo(() => new Map(ingredients.map(i => [i.id, i])), [ingredients])
  const subMap = useMemo(() => new Map(subRecipes.map(s => [s.id, s])), [subRecipes])
  const unitMap = useMemo(() => new Map(units.map(u => [u.id, u])), [units])
  return { ingredients, units, subRecipes, ingMap, subMap, unitMap }
}

// ============================================================
// Shared components/items editor
// ============================================================
function ItemsEditor({ items, setItems, ingredients, subRecipes, units, ingMap, subMap, unitMap, excludeSubId }: {
  items: EditorItem[]
  setItems: (v: EditorItem[]) => void
  ingredients: Ingredient[]
  subRecipes: SubRecipeOverview[]
  units: Unit[]
  ingMap: Map<string, Ingredient>
  subMap: Map<string, SubRecipeOverview>
  unitMap: Map<string, Unit>
  excludeSubId?: string
}) {
  const availableSubs = subRecipes.filter(s => s.id !== excludeSubId)

  const unitTypeForItem = (it: EditorItem): string | null => {
    if (it.component_type === 'sub_recipe') {
      const sub = it.sub_recipe_id ? subMap.get(it.sub_recipe_id) : undefined
      const yu = sub ? unitMap.get(sub.yield_unit_id) : undefined
      return yu?.unit_type || null
    }
    const ing = it.ingredient_id ? ingMap.get(it.ingredient_id) : undefined
    return ing?.unit?.unit_type || null
  }
  const compatibleUnits = (it: EditorItem): Unit[] => {
    const t = unitTypeForItem(it)
    return t ? units.filter(u => u.unit_type === t) : units
  }

  const addIngredient = () => {
    const ing = ingredients[0]
    setItems([...items, { component_type: 'ingredient', ingredient_id: ing?.id, quantity: 1, unit_id: ing?.unit_id || units[0]?.id || '' }])
  }
  const addSub = () => {
    const sub = availableSubs[0]
    setItems([...items, { component_type: 'sub_recipe', sub_recipe_id: sub?.id, quantity: 1, unit_id: sub?.yield_unit_id || units[0]?.id || '' }])
  }
  const update = (idx: number, patch: Partial<EditorItem>) => {
    setItems(items.map((it, i) => {
      if (i !== idx) return it
      const next = { ...it, ...patch }
      if (patch.component_type) {
        if (patch.component_type === 'ingredient') {
          const ing = ingredients[0]; next.ingredient_id = ing?.id; next.sub_recipe_id = undefined; next.unit_id = ing?.unit_id || units[0]?.id || ''
        } else {
          const sub = availableSubs[0]; next.sub_recipe_id = sub?.id; next.ingredient_id = undefined; next.unit_id = sub?.yield_unit_id || units[0]?.id || ''
        }
      }
      if (patch.ingredient_id) { const ing = ingMap.get(patch.ingredient_id); if (ing?.unit_id) next.unit_id = ing.unit_id }
      if (patch.sub_recipe_id) { const sub = subMap.get(patch.sub_recipe_id); if (sub?.yield_unit_id) next.unit_id = sub.yield_unit_id }
      return next
    }))
  }
  const remove = (idx: number) => setItems(items.filter((_, i) => i !== idx))

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <label className="text-sm font-medium">المكوّنات</label>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={addIngredient} disabled={ingredients.length === 0}><Plus className="w-4 h-4 ml-1" /> مكوّن خام</Button>
          <Button variant="outline" size="sm" onClick={addSub} disabled={availableSubs.length === 0} title={availableSubs.length === 0 ? 'لا توجد تحضيرات' : ''}><Plus className="w-4 h-4 ml-1" /> تحضيرة</Button>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="text-center py-6 text-sm text-muted-foreground border border-dashed rounded-lg">لا توجد مكوّنات بعد.</div>
      ) : (
        <div className="space-y-2">
          {items.map((it, idx) => (
            <div key={idx} className="grid grid-cols-12 gap-2 items-center bg-muted/30 rounded-lg p-2">
              <select className={`${selectCls} col-span-6 sm:col-span-2`} value={it.component_type} onChange={e => update(idx, { component_type: e.target.value as ComponentType })}>
                <option value="ingredient">مكوّن خام</option>
                <option value="sub_recipe">تحضيرة</option>
              </select>
              {it.component_type === 'ingredient' ? (
                <select className={`${selectCls} col-span-6 sm:col-span-4`} value={it.ingredient_id || ''} onChange={e => update(idx, { ingredient_id: e.target.value })}>
                  <option value="" disabled>اختر مكوّن</option>
                  {ingredients.map(ing => <option key={ing.id} value={ing.id}>{ing.name}{ing.waste_pct > 0 ? ` (هالك ${ing.waste_pct}%)` : ''}</option>)}
                </select>
              ) : (
                <select className={`${selectCls} col-span-6 sm:col-span-4`} value={it.sub_recipe_id || ''} onChange={e => update(idx, { sub_recipe_id: e.target.value })}>
                  <option value="" disabled>اختر تحضيرة</option>
                  {availableSubs.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              )}
              <Input type="number" step="0.0001" className="col-span-4 sm:col-span-2" value={it.quantity} onChange={e => update(idx, { quantity: +e.target.value })} />
              <select className={`${selectCls} col-span-4 sm:col-span-2`} value={it.unit_id} onChange={e => update(idx, { unit_id: e.target.value })}>
                {compatibleUnits(it).map(u => <option key={u.id} value={u.id}>{u.abbreviation}</option>)}
              </select>
              <div className="col-span-4 sm:col-span-2 flex items-center justify-between sm:justify-center gap-1">
                <span className="text-sm font-medium">{money(lineCostOf(it, ingMap, subMap, unitMap))}</span>
                <Button variant="ghost" size="sm" onClick={() => remove(idx)}><Trash2 className="w-4 h-4 text-red-600" /></Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, icon, valueClass = '' }: { label: string; value: string; icon?: React.ReactNode; valueClass?: string }) {
  return (
    <div className="text-center">
      <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">{icon}{label}</div>
      <div className={`text-lg font-bold ${valueClass}`}>{value}</div>
    </div>
  )
}

function EditorShell({ title, onClose, children }: { title: React.ReactNode; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <Card className="w-full max-w-3xl max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 sticky top-0 bg-card z-10 border-b">
          <CardTitle className="flex items-center gap-2">{title}</CardTitle>
          <Button variant="ghost" size="sm" onClick={onClose}><X className="w-4 h-4" /></Button>
        </CardHeader>
        <CardContent className="space-y-5 pt-5">{children}</CardContent>
      </Card>
    </div>
  )
}

// ============================================================
// Product recipe editor
// ============================================================
function RecipeEditor({ product, onClose }: { product: RecipeOverviewItem; onClose: () => void }) {
  const qc = useQueryClient()
  const { toast } = useToast()
  const { ingredients, units, subRecipes, ingMap, subMap, unitMap } = useEditorData()
  const [yieldQty, setYieldQty] = useState(1)
  const [notes, setNotes] = useState('')
  const [items, setItems] = useState<EditorItem[]>([])
  const [loaded, setLoaded] = useState(false)

  const { data: recipe, isLoading } = useQuery({
    queryKey: ['recipe', product.product_id],
    queryFn: () => apiClient.getRecipeByProduct(product.product_id).then(r => r.data),
  })

  useEffect(() => {
    if (loaded || isLoading) return
    if (recipe) {
      setYieldQty(recipe.yield_quantity || 1)
      setNotes(recipe.notes || '')
      setItems((recipe.items || []).map(it => ({
        component_type: it.component_type, ingredient_id: it.ingredient_id, sub_recipe_id: it.sub_recipe_id,
        quantity: it.quantity, unit_id: it.unit_id,
      })))
    }
    setLoaded(true)
  }, [recipe, isLoading, loaded])

  const totalCost = items.reduce((s, it) => s + lineCostOf(it, ingMap, subMap, unitMap), 0)
  const costPerServing = yieldQty > 0 ? totalCost / yieldQty : totalCost
  const foodCostPct = product.price > 0 ? (costPerServing / product.price) * 100 : 0
  const margin = product.price - costPerServing

  const toPayload = (): RecipeItemInput[] => items
    .filter(it => it.unit_id && it.quantity > 0 && (it.component_type === 'ingredient' ? it.ingredient_id : it.sub_recipe_id))
    .map(it => ({ component_type: it.component_type, ingredient_id: it.ingredient_id, sub_recipe_id: it.sub_recipe_id, quantity: Number(it.quantity), unit_id: it.unit_id }))

  const saveMutation = useMutation({
    mutationFn: () => apiClient.saveRecipe(product.product_id, { yield_quantity: Number(yieldQty) || 1, notes: notes || undefined, items: toPayload() }),
    onSuccess: () => { toast({ title: 'تم حفظ الوصفة بنجاح' }); qc.invalidateQueries({ queryKey: ['recipesOverview'] }); qc.invalidateQueries({ queryKey: ['recipe', product.product_id] }); onClose() },
    onError: (e: any) => toast({ title: 'خطأ في الحفظ', description: e.message, variant: 'destructive' }),
  })
  const deleteMutation = useMutation({
    mutationFn: () => apiClient.deleteRecipe(product.product_id),
    onSuccess: () => { toast({ title: 'تم حذف الوصفة' }); qc.invalidateQueries({ queryKey: ['recipesOverview'] }); onClose() },
    onError: (e: any) => toast({ title: 'خطأ', description: e.message, variant: 'destructive' }),
  })

  return (
    <EditorShell title={<><ChefHat className="w-5 h-5" /> وصفة: {product.product_name}</>} onClose={onClose}>
      {isLoading ? (
        <div className="flex justify-center py-10"><div className="w-6 h-6 border-4 border-primary border-t-transparent rounded-full animate-spin" /></div>
      ) : ingredients.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">أضف المكوّنات أولاً من صفحة «المخزون والمكوّنات».</div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5"><label className="text-sm font-medium">عدد الحصص الناتجة (Yield)</label><Input type="number" min="1" step="0.1" value={yieldQty} onChange={e => setYieldQty(+e.target.value)} /></div>
            <div className="space-y-1.5"><label className="text-sm font-medium">سعر بيع الصنف</label><Input value={money(product.price)} disabled /></div>
          </div>

          <ItemsEditor items={items} setItems={setItems} ingredients={ingredients} subRecipes={subRecipes} units={units} ingMap={ingMap} subMap={subMap} unitMap={unitMap} />

          <div className="space-y-1.5"><label className="text-sm font-medium">ملاحظات التحضير (اختياري)</label><Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="طريقة التحضير أو ملاحظات..." /></div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-muted/40 rounded-lg p-4">
            <Stat label="تكلفة الوصفة" value={money(totalCost)} icon={<Calculator className="w-4 h-4" />} />
            <Stat label="تكلفة الحصة" value={money(costPerServing)} />
            <Stat label="نسبة تكلفة الطعام" value={pct(foodCostPct)} valueClass={product.price > 0 ? (foodCostPct <= 30 ? 'text-green-600' : foodCostPct <= 40 ? 'text-yellow-600' : 'text-red-600') : ''} />
            <Stat label="هامش الربح" value={money(margin)} valueClass={margin < 0 ? 'text-red-600' : 'text-green-600'} />
          </div>

          <div className="flex items-center justify-between pt-2">
            <div>{recipe && <Button variant="ghost" className="text-red-600 hover:text-red-700" onClick={() => { if (confirm('حذف وصفة هذا الصنف بالكامل؟')) deleteMutation.mutate() }}><Trash2 className="w-4 h-4 ml-1" /> حذف الوصفة</Button>}</div>
            <div className="flex gap-2"><Button variant="outline" onClick={onClose}>إلغاء</Button><Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>حفظ الوصفة</Button></div>
          </div>
        </>
      )}
    </EditorShell>
  )
}

// ============================================================
// Preparations tab + sub-recipe editor
// ============================================================
function PreparationsTab() {
  const [editing, setEditing] = useState<SubRecipeOverview | 'new' | null>(null)
  const { data: subs = [], isLoading } = useQuery({ queryKey: ['subRecipes'], queryFn: () => apiClient.getSubRecipes().then(r => r.data || []) })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground max-w-2xl">التحضيرات تُصنع مرة (مثل صوص أو عجينة) وتُستخدم في أصناف كثيرة. عند البيع يُخصم منها المكوّنات الخام تلقائياً حسب الكمية المستخدمة.</p>
        <Button onClick={() => setEditing('new')}><Plus className="w-4 h-4 ml-2" /> تحضيرة جديدة</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex justify-center py-12"><div className="w-6 h-6 border-4 border-primary border-t-transparent rounded-full animate-spin" /></div>
          ) : subs.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground"><Beaker className="w-10 h-10 mx-auto mb-2 opacity-40" />لا توجد تحضيرات. اضغط «تحضيرة جديدة».</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr>
                    <th className="text-right p-3 font-medium">التحضيرة</th>
                    <th className="text-center p-3 font-medium">الناتج</th>
                    <th className="text-center p-3 font-medium">عدد المكوّنات</th>
                    <th className="text-center p-3 font-medium">تكلفة الدفعة</th>
                    <th className="text-center p-3 font-medium">تكلفة الوحدة</th>
                    <th className="text-center p-3 font-medium">إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {subs.map(s => (
                    <tr key={s.id} className="border-t border-border hover:bg-muted/30">
                      <td className="p-3 font-medium">{s.name}</td>
                      <td className="p-3 text-center">{s.yield_quantity} {s.yield_unit_abbr}</td>
                      <td className="p-3 text-center">{s.item_count}</td>
                      <td className="p-3 text-center">{money(s.batch_cost)}</td>
                      <td className="p-3 text-center">{money(s.cost_per_unit)} / {s.yield_unit_abbr}</td>
                      <td className="p-3 text-center"><Button variant="outline" size="sm" onClick={() => setEditing(s)}><Pencil className="w-4 h-4 ml-1" /> تعديل</Button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {editing && <SubRecipeEditor sub={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

function SubRecipeEditor({ sub, onClose }: { sub: SubRecipeOverview | null; onClose: () => void }) {
  const qc = useQueryClient()
  const { toast } = useToast()
  const { ingredients, units, subRecipes, ingMap, subMap, unitMap } = useEditorData()
  const [name, setName] = useState(sub?.name || '')
  const [yieldQty, setYieldQty] = useState(sub?.yield_quantity || 1)
  const [yieldUnitId, setYieldUnitId] = useState(sub?.yield_unit_id || '')
  const [notes, setNotes] = useState(sub?.notes || '')
  const [items, setItems] = useState<EditorItem[]>([])
  const [loaded, setLoaded] = useState(false)

  const { data: full, isLoading } = useQuery({
    queryKey: ['subRecipe', sub?.id],
    queryFn: () => sub ? apiClient.getSubRecipe(sub.id).then(r => r.data) : Promise.resolve(null),
    enabled: !!sub,
  })

  useEffect(() => {
    if (loaded) return
    if (!sub) { setLoaded(true); return }
    if (isLoading) return
    if (full) {
      setName(full.name || ''); setYieldQty(full.yield_quantity || 1); setYieldUnitId(full.yield_unit_id || ''); setNotes(full.notes || '')
      setItems((full.items || []).map(it => ({ component_type: it.component_type, ingredient_id: it.ingredient_id, sub_recipe_id: it.sub_recipe_id, quantity: it.quantity, unit_id: it.unit_id })))
    }
    setLoaded(true)
  }, [full, isLoading, loaded, sub])

  // default yield unit once units load (for new prep)
  useEffect(() => { if (!yieldUnitId && units.length) setYieldUnitId(units.find(u => u.unit_type === 'volume')?.id || units[0].id) }, [units, yieldUnitId])

  const batchCost = items.reduce((s, it) => s + lineCostOf(it, ingMap, subMap, unitMap), 0)
  const costPerUnit = yieldQty > 0 ? batchCost / yieldQty : batchCost
  const yieldUnitAbbr = unitMap.get(yieldUnitId)?.abbreviation || ''

  const toPayload = (): RecipeItemInput[] => items
    .filter(it => it.unit_id && it.quantity > 0 && (it.component_type === 'ingredient' ? it.ingredient_id : it.sub_recipe_id))
    .map(it => ({ component_type: it.component_type, ingredient_id: it.ingredient_id, sub_recipe_id: it.sub_recipe_id, quantity: Number(it.quantity), unit_id: it.unit_id }))

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = { name, yield_quantity: Number(yieldQty) || 1, yield_unit_id: yieldUnitId, notes: notes || undefined, items: toPayload() }
      return sub ? apiClient.updateSubRecipe(sub.id, payload) : apiClient.createSubRecipe(payload)
    },
    onSuccess: () => { toast({ title: sub ? 'تم حفظ التحضيرة' : 'تم إنشاء التحضيرة' }); qc.invalidateQueries({ queryKey: ['subRecipes'] }); qc.invalidateQueries({ queryKey: ['recipesOverview'] }); onClose() },
    onError: (e: any) => toast({ title: 'خطأ في الحفظ', description: e.message, variant: 'destructive' }),
  })
  const deleteMutation = useMutation({
    mutationFn: () => apiClient.deleteSubRecipe(sub!.id),
    onSuccess: () => { toast({ title: 'تم حذف التحضيرة' }); qc.invalidateQueries({ queryKey: ['subRecipes'] }); onClose() },
    onError: (e: any) => toast({ title: 'تعذّر الحذف', description: e.message, variant: 'destructive' }),
  })

  return (
    <EditorShell title={<><Beaker className="w-5 h-5" /> {sub ? `تحضيرة: ${sub.name}` : 'تحضيرة جديدة'}</>} onClose={onClose}>
      {sub && isLoading ? (
        <div className="flex justify-center py-10"><div className="w-6 h-6 border-4 border-primary border-t-transparent rounded-full animate-spin" /></div>
      ) : ingredients.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">أضف المكوّنات أولاً من صفحة «المخزون والمكوّنات».</div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5 sm:col-span-1"><label className="text-sm font-medium">اسم التحضيرة</label><Input value={name} onChange={e => setName(e.target.value)} placeholder="مثال: صوص طحينة" /></div>
            <div className="space-y-1.5"><label className="text-sm font-medium">الكمية الناتجة</label><Input type="number" min="0.01" step="0.1" value={yieldQty} onChange={e => setYieldQty(+e.target.value)} /></div>
            <div className="space-y-1.5"><label className="text-sm font-medium">وحدة الناتج</label>
              <select className={`${selectCls} w-full`} value={yieldUnitId} onChange={e => setYieldUnitId(e.target.value)}>
                {units.map(u => <option key={u.id} value={u.id}>{u.name} ({u.abbreviation})</option>)}
              </select>
            </div>
          </div>

          <ItemsEditor items={items} setItems={setItems} ingredients={ingredients} subRecipes={subRecipes} units={units} ingMap={ingMap} subMap={subMap} unitMap={unitMap} excludeSubId={sub?.id} />

          <div className="space-y-1.5"><label className="text-sm font-medium">ملاحظات (اختياري)</label><Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} /></div>

          <div className="grid grid-cols-2 gap-3 bg-muted/40 rounded-lg p-4">
            <Stat label="تكلفة الدفعة كاملة" value={money(batchCost)} icon={<Calculator className="w-4 h-4" />} />
            <Stat label={`تكلفة الوحدة (${yieldUnitAbbr})`} value={money(costPerUnit)} />
          </div>

          <div className="flex items-center justify-between pt-2">
            <div>{sub && <Button variant="ghost" className="text-red-600 hover:text-red-700" onClick={() => { if (confirm('حذف هذه التحضيرة؟')) deleteMutation.mutate() }}><Trash2 className="w-4 h-4 ml-1" /> حذف</Button>}</div>
            <div className="flex gap-2"><Button variant="outline" onClick={onClose}>إلغاء</Button><Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !name || !yieldUnitId}>حفظ</Button></div>
          </div>
        </>
      )}
    </EditorShell>
  )
}
