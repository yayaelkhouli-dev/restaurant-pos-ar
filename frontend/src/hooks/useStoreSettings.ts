import { useQuery } from '@tanstack/react-query'
import apiClient from '@/api/client'

/**
 * Store display settings shared across the cashier / waiter / receipt screens.
 * Reads the whitelisted public settings endpoint (available to every role),
 * so the tax preview and printed receipt always match what the backend charges.
 */
export interface StoreSettings {
  restaurantName: string
  currency: string
  taxRate: number // fraction, e.g. 0.10 for 10%
  serviceCharge: number // fraction
  receiptHeader: string
  receiptFooter: string
  /** Thermal paper width in mm (58 or 80) */
  receiptWidth: number
  phone: string
  address: string
}

const DEFAULTS: StoreSettings = {
  restaurantName: 'مطعمي',
  currency: 'EGP',
  taxRate: 0.1,
  serviceCharge: 0,
  receiptHeader: '',
  receiptFooter: '',
  receiptWidth: 80,
  phone: '',
  address: '',
}

function toFraction(percent: string | undefined, fallback: number): number {
  if (percent == null || percent === '') return fallback
  const v = parseFloat(percent)
  return Number.isFinite(v) ? v / 100 : fallback
}

export function useStoreSettings(): StoreSettings {
  const { data } = useQuery({
    queryKey: ['public-settings'],
    queryFn: () => apiClient.getPublicSettings().then(res => res.data || {}),
    staleTime: 5 * 60 * 1000, // settings rarely change; cache 5 min
  })

  const s = (data || {}) as Record<string, string>
  return {
    restaurantName: s.restaurant_name || DEFAULTS.restaurantName,
    currency: s.currency || DEFAULTS.currency,
    taxRate: toFraction(s.tax_rate, DEFAULTS.taxRate),
    serviceCharge: toFraction(s.service_charge, DEFAULTS.serviceCharge),
    receiptHeader: s.receipt_header || DEFAULTS.receiptHeader,
    receiptFooter: s.receipt_footer || DEFAULTS.receiptFooter,
    receiptWidth: s.receipt_width === '58' ? 58 : DEFAULTS.receiptWidth,
    phone: s.phone || DEFAULTS.phone,
    address: s.address || DEFAULTS.address,
  }
}
