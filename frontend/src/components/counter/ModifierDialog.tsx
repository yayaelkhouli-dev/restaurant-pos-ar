import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/lib/utils'
import type { Product, ModifierGroup } from '@/types'
import type { SelectedModifier } from '@/lib/cart'
import { X } from 'lucide-react'

interface ModifierDialogProps {
  product: Product
  groups: ModifierGroup[]
  onCancel: () => void
  onConfirm: (mods: SelectedModifier[]) => void
}

/**
 * Lets the cashier pick sizes / add-ons before a product goes into the cart.
 * Mirrors the backend rules: max_select = 1 behaves like a radio, max_select = 0
 * means unlimited, and min_select must be satisfied before confirming.
 */
export function ModifierDialog({ product, groups, onCancel, onConfirm }: ModifierDialogProps) {
  const [selected, setSelected] = useState<Record<string, string[]>>({}) // groupId -> modifierIds

  const toggle = (group: ModifierGroup, modifierId: string) => {
    setSelected((prev) => {
      const current = prev[group.id] || []
      const has = current.includes(modifierId)

      // Single-choice group behaves like a radio button
      if (group.max_select === 1) {
        return { ...prev, [group.id]: has ? [] : [modifierId] }
      }

      if (has) return { ...prev, [group.id]: current.filter((id) => id !== modifierId) }

      // Respect an upper bound when one is set (0 = unlimited)
      if (group.max_select > 0 && current.length >= group.max_select) return prev

      return { ...prev, [group.id]: [...current, modifierId] }
    })
  }

  const chosen: SelectedModifier[] = useMemo(() => {
    const out: SelectedModifier[] = []
    for (const g of groups) {
      for (const id of selected[g.id] || []) {
        const m = g.modifiers.find((x) => x.id === id)
        if (m) out.push({ id: m.id, name: m.name, price_delta: m.price_delta })
      }
    }
    return out
  }, [selected, groups])

  const delta = chosen.reduce((s, m) => s + m.price_delta, 0)

  const unmet = groups.find((g) => (selected[g.id] || []).length < g.min_select)
  const canConfirm = !unmet

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onCancel}>
      <div
        className="bg-background rounded-lg shadow-lg w-full max-w-md max-h-[85vh] overflow-y-auto"
        dir="rtl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div>
            <h3 className="font-semibold">{product.name}</h3>
            <p className="text-sm text-muted-foreground">{formatCurrency(product.price)}</p>
          </div>
          <Button variant="ghost" size="sm" onClick={onCancel}>
            <X className="w-4 h-4" />
          </Button>
        </div>

        <div className="p-4 space-y-5">
          {groups.map((group) => {
            const current = selected[group.id] || []
            const rule =
              group.max_select === 1
                ? group.min_select >= 1
                  ? 'اختر واحداً (مطلوب)'
                  : 'اختر واحداً'
                : group.max_select > 0
                ? `اختر حتى ${group.max_select}`
                : 'اختر ما تشاء'

            return (
              <div key={group.id}>
                <div className="flex items-baseline justify-between mb-2">
                  <span className="font-medium">{group.name}</span>
                  <span className="text-xs text-muted-foreground">{rule}</span>
                </div>
                <div className="space-y-1">
                  {group.modifiers
                    .filter((m) => m.is_available)
                    .map((m) => {
                      const isOn = current.includes(m.id)
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => toggle(group, m.id)}
                          className={`w-full flex items-center justify-between px-3 py-2 rounded-md border text-sm transition-colors ${
                            isOn
                              ? 'border-primary bg-primary/10 text-foreground'
                              : 'border-border hover:bg-muted/50'
                          }`}
                        >
                          <span>{m.name}</span>
                          <span className="text-muted-foreground">
                            {m.price_delta > 0 ? `+ ${formatCurrency(m.price_delta)}` : m.price_delta < 0 ? formatCurrency(m.price_delta) : '—'}
                          </span>
                        </button>
                      )
                    })}
                </div>
              </div>
            )
          })}
        </div>

        <div className="p-4 border-t border-border space-y-3">
          <div className="flex justify-between font-semibold">
            <span>سعر الصنف:</span>
            <span>{formatCurrency(product.price + delta)}</span>
          </div>
          {!canConfirm && (
            <p className="text-sm text-red-600">
              يجب اختيار {unmet!.min_select} على الأقل من «{unmet!.name}»
            </p>
          )}
          <Button className="w-full" size="lg" disabled={!canConfirm} onClick={() => onConfirm(chosen)}>
            إضافة للطلب
          </Button>
        </div>
      </div>
    </div>
  )
}
