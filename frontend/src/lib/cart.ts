import type { Product } from '@/types'

/** A size / add-on chosen for a cart line. */
export interface SelectedModifier {
  id: string
  name: string
  price_delta: number
}

export interface CartItem {
  /** product id + chosen modifier ids — same product with different options = separate lines */
  key: string
  product: Product
  quantity: number
  special_instructions?: string
  modifiers: SelectedModifier[]
}

/** Stable cart key so identical option sets merge into one line. */
export function cartKey(productId: string, mods: SelectedModifier[]): string {
  return `${productId}::${mods.map((m) => m.id).sort().join(',')}`
}

/** Effective unit price = product price + the deltas of the chosen options. */
export function lineUnitPrice(item: CartItem): number {
  return item.product.price + item.modifiers.reduce((s, m) => s + m.price_delta, 0)
}

/** Cart subtotal (before discount and tax). */
export function cartSubtotal(cart: CartItem[]): number {
  return cart.reduce((total, item) => total + lineUnitPrice(item) * item.quantity, 0)
}

/** Add a product with a specific option set; identical sets merge into one line. */
export function addLine(cart: CartItem[], product: Product, mods: SelectedModifier[]): CartItem[] {
  const key = cartKey(product.id, mods)
  const existing = cart.find((item) => item.key === key)
  if (existing) {
    return cart.map((item) => (item.key === key ? { ...item, quantity: item.quantity + 1 } : item))
  }
  return [...cart, { key, product, quantity: 1, modifiers: mods }]
}

export function incrementLine(cart: CartItem[], key: string): CartItem[] {
  return cart.map((item) => (item.key === key ? { ...item, quantity: item.quantity + 1 } : item))
}

/** Decrement a line, removing it when the quantity would reach zero. */
export function decrementLine(cart: CartItem[], key: string): CartItem[] {
  const existing = cart.find((item) => item.key === key)
  if (existing && existing.quantity > 1) {
    return cart.map((item) => (item.key === key ? { ...item, quantity: item.quantity - 1 } : item))
  }
  return cart.filter((item) => item.key !== key)
}

/** Order payload items, including the chosen modifier ids. */
export function cartToOrderItems(cart: CartItem[]) {
  return cart.map((item) => ({
    product_id: item.product.id,
    quantity: item.quantity,
    special_instructions: item.special_instructions,
    ...(item.modifiers.length > 0 ? { modifier_ids: item.modifiers.map((m) => m.id) } : {}),
  }))
}
