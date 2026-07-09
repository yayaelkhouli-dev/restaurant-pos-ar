import { QueryClient } from '@tanstack/react-query'

/**
 * The single query cache for the whole app.
 *
 * `staleTime: 0` is deliberate. A POS shows shared, fast-moving state: the waiter
 * opens an order, the kitchen cooks it, the cashier takes the money — on three
 * different screens, often three different devices. A non-zero default staleTime
 * suppresses refetch-on-mount AND refetch-on-focus, so switching to a tab would
 * show minutes-old orders. Reference data that genuinely doesn't move (store
 * settings, modifier groups) opts back into caching with its own staleTime.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 0,
      refetchOnWindowFocus: true,
      retry: 1,
    },
  },
})

/**
 * Every live order list, keyed so one invalidation reaches all of them.
 * They must share the `['orders', …]` prefix — TanStack matches by prefix, so
 * sibling root keys like `['pendingOrders']` and `['active-orders']` would never
 * refresh each other.
 */
export const orderKeys = {
  all: ['orders'] as const,
  pending: ['orders', 'pending'] as const, // cashier: awaiting payment
  active: ['orders', 'active'] as const, // waiter: drives table occupancy
  kitchen: ['orders', 'kitchen'] as const, // kitchen board
}

/**
 * Refresh everything a completed order touches. Call after creating, modifying,
 * paying, serving, refunding or cancelling an order — from any screen.
 */
export function invalidateOrderData(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: orderKeys.all })
  qc.invalidateQueries({ queryKey: ['tables'] })
  qc.invalidateQueries({ queryKey: ['admin-tables'] })
  qc.invalidateQueries({ queryKey: ['tables-summary'] })
  qc.invalidateQueries({ queryKey: ['currentShift'] })
  // money & stock moved, so the admin views are stale too
  qc.invalidateQueries({ queryKey: ['dashboardStats'] })
  qc.invalidateQueries({ queryKey: ['salesReport'] })
  qc.invalidateQueries({ queryKey: ['ordersReport'] })
  qc.invalidateQueries({ queryKey: ['incomeReport'] })
  qc.invalidateQueries({ queryKey: ['lowStockAlerts'] })
  qc.invalidateQueries({ queryKey: ['ingredients'] })
}
