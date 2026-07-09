import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// ------------------------------------------------------------
// العملة (Currency)
// رمز العملة يُقرأ من الإعدادات؛ الافتراضي الجنيه المصري.
// نخزّنه في localStorage ليعمل العرض صحيحًا من أول لقطة قبل تحميل الإعدادات.
// ------------------------------------------------------------
const CURRENCY_SYMBOLS: Record<string, string> = {
  EGP: 'ج.م',
  SAR: 'ر.س',
  AED: 'د.إ',
  USD: '$',
  EUR: '€',
}

function readStoredCurrency(): string {
  try {
    const c = typeof window !== 'undefined' ? window.localStorage.getItem('app_currency') : null
    return c || 'EGP'
  } catch {
    return 'EGP'
  }
}

let currentCurrency = readStoredCurrency()

export function setAppCurrency(code?: string | null): void {
  if (!code) return
  currentCurrency = code
  try {
    window.localStorage.setItem('app_currency', code)
  } catch {
    /* تجاهل أخطاء التخزين */
  }
}

export function getCurrencySymbol(): string {
  return CURRENCY_SYMBOLS[currentCurrency] || currentCurrency
}

export function formatCurrency(amount: number): string {
  const value = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount || 0)
  return `${value} ${getCurrencySymbol()}`
}

// 'ar-EG-u-nu-latn' = أسماء عربية للأشهر مع أرقام لاتينية (تماشيًا مع باقي الأرقام)
export function formatDate(dateString: string): string {
  return new Intl.DateTimeFormat('ar-EG-u-nu-latn', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(dateString))
}

export function formatTime(dateString: string): string {
  return new Intl.DateTimeFormat('ar-EG-u-nu-latn', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(dateString))
}

export function getOrderStatusColor(status: string): string {
  switch (status) {
    case 'pending':
      return 'bg-yellow-100 text-yellow-800'
    case 'confirmed':
      return 'bg-blue-100 text-blue-800'
    case 'preparing':
      return 'bg-orange-100 text-orange-800'
    case 'ready':
      return 'bg-green-100 text-green-800'
    case 'served':
      return 'bg-indigo-100 text-indigo-800'
    case 'completed':
      return 'bg-green-100 text-green-800'
    case 'cancelled':
      return 'bg-red-100 text-red-800'
    default:
      return 'bg-gray-100 text-gray-800'
  }
}

export function getPaymentStatusColor(status: string): string {
  switch (status) {
    case 'pending':
      return 'bg-yellow-100 text-yellow-800'
    case 'completed':
      return 'bg-green-100 text-green-800'
    case 'failed':
      return 'bg-red-100 text-red-800'
    case 'refunded':
      return 'bg-purple-100 text-purple-800'
    default:
      return 'bg-gray-100 text-gray-800'
  }
}

export function calculateOrderTotals(items: Array<{ quantity: number; unit_price?: number; price?: number }>) {
  const subtotal = items.reduce((sum, item) => {
    const price = item.unit_price || item.price || 0
    return sum + (item.quantity * price)
  }, 0)
  
  const taxRate = 0.10 // 10% tax
  const taxAmount = subtotal * taxRate
  const totalAmount = subtotal + taxAmount
  
  return {
    subtotal,
    taxAmount,
    totalAmount,
  }
}

export function getPreparationTimeDisplay(minutes: number): string {
  if (minutes === 0) return 'بدون وقت تحضير'
  if (minutes < 60) return `${minutes} د`

  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60

  if (remainingMinutes === 0) return `${hours} س`
  return `${hours} س ${remainingMinutes} د`
}

export function generateOrderNumber(): string {
  const timestamp = Date.now()
  const random = Math.floor(Math.random() * 1000)
  return `ORD${timestamp}${random}`.slice(-10)
}

export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null
  
  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout)
    timeout = setTimeout(() => func(...args), wait)
  }
}

