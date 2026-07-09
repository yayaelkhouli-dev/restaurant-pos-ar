import { useEffect } from 'react'
import { createRootRoute, Outlet } from '@tanstack/react-router'
import { QueryClientProvider, useQuery } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { DirectionProvider } from '@radix-ui/react-direction'
import { queryClient } from '@/lib/query-client'
import apiClient from '@/api/client'
import { setAppCurrency } from '@/lib/utils'
import { ForcePasswordChangeGate } from '@/components/auth/ForcePasswordChangeGate'
import '../index.css'

// يحمّل العملة المختارة من الإعدادات ويطبّقها على كل عرض للأسعار
// يستخدم نقطة الإعدادات العامة حتى تعمل لكل الأدوار (مش الأدمن بس)
function CurrencyLoader() {
  const { data } = useQuery({
    queryKey: ['public-settings'],
    queryFn: () => apiClient.getPublicSettings().then(res => res.data || {}),
    staleTime: 1000 * 60 * 10,
  })

  useEffect(() => {
    if (data?.currency) setAppCurrency(data.currency)
  }, [data?.currency])

  return null
}

// Radix primitives (Tabs, DropdownMenu, …) default to dir="ltr" and stamp it on
// their own root element, overriding <html dir="rtl"> for everything nested
// inside them. DirectionProvider makes them all inherit RTL instead.
export const Route = createRootRoute({
  component: () => (
    <DirectionProvider dir="rtl">
      <QueryClientProvider client={queryClient}>
        <CurrencyLoader />
        <ForcePasswordChangeGate>
          <div className="min-h-screen bg-background">
            <Outlet />
          </div>
        </ForcePasswordChangeGate>
        <ReactQueryDevtools initialIsOpen={false} />
      </QueryClientProvider>
    </DirectionProvider>
  ),
})
