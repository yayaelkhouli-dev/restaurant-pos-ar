import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/api/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { formatCurrency } from '@/lib/utils'
import { toastHelpers } from '@/lib/toast-helpers'
import { useStoreSettings } from '@/hooks/useStoreSettings'
import { printZReport } from '@/lib/zreport'
import { Wallet, LockOpen, Lock, Printer } from 'lucide-react'

/**
 * Compact cash-drawer control for the cashier screen: open a shift with a
 * starting float, see the expected drawer total, and close it by counting cash.
 * Closing prints the end-of-day (Z) report.
 */
export function ShiftPanel() {
  const storeSettings = useStoreSettings()
  const queryClient = useQueryClient()
  const [showOpen, setShowOpen] = useState(false)
  const [showClose, setShowClose] = useState(false)
  const [openingCash, setOpeningCash] = useState('')
  const [closingCash, setClosingCash] = useState('')

  const { data: shift } = useQuery({
    queryKey: ['currentShift'],
    // `?? null` is load-bearing: TanStack Query treats an undefined result as a
    // failure and keeps the stale value, so a closed shift would still read open.
    queryFn: () => apiClient.getCurrentShift().then((r) => r.data ?? null),
    staleTime: 0,
    refetchInterval: 30_000,
  })

  const openMutation = useMutation({
    mutationFn: () => apiClient.openShift(parseFloat(openingCash) || 0),
    onSuccess: () => {
      toastHelpers.success('تم فتح الوردية')
      setShowOpen(false)
      setOpeningCash('')
      queryClient.invalidateQueries({ queryKey: ['currentShift'] })
    },
    onError: (e: any) => toastHelpers.apiError('فتح الوردية', e?.response?.data?.message || e),
  })

  const printReportFor = async (shiftId: string) => {
    try {
      const rep = await apiClient.getShiftReport(shiftId).then((r) => r.data)
      if (!rep) return
      printZReport({
        restaurantName: storeSettings.restaurantName,
        widthMm: storeSettings.receiptWidth,
        ...rep,
      })
    } catch (e: any) {
      toastHelpers.apiError('طباعة التقرير', e?.response?.data?.message || e)
    }
  }

  const closeMutation = useMutation({
    mutationFn: () => apiClient.closeShift(parseFloat(closingCash) || 0),
    onSuccess: async (res: any) => {
      const closedId = res?.data?.id
      const diff = res?.data?.difference ?? 0
      toastHelpers.success(
        'تم إغلاق الوردية',
        diff === 0 ? 'الدرج مطابق' : diff > 0 ? `زيادة ${formatCurrency(diff)}` : `عجز ${formatCurrency(Math.abs(diff))}`
      )
      setShowClose(false)
      setClosingCash('')
      queryClient.invalidateQueries({ queryKey: ['currentShift'] })
      if (closedId) await printReportFor(closedId)
    },
    onError: (e: any) => toastHelpers.apiError('إغلاق الوردية', e?.response?.data?.message || e),
  })

  // No open shift → offer to open one
  if (!shift) {
    return (
      <div className="flex items-center gap-2">
        {showOpen ? (
          <>
            <Input
              type="number"
              step="0.01"
              min="0"
              placeholder="نقدية البداية"
              value={openingCash}
              onChange={(e) => setOpeningCash(e.target.value)}
              className="h-8 w-32"
            />
            <Button size="sm" onClick={() => openMutation.mutate()} disabled={openMutation.isPending}>
              تأكيد
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowOpen(false)}>
              إلغاء
            </Button>
          </>
        ) : (
          <Button size="sm" variant="outline" onClick={() => setShowOpen(true)}>
            <LockOpen className="w-4 h-4 ml-1" />
            فتح وردية
          </Button>
        )}
      </div>
    )
  }

  // Open shift → show expected drawer + close control
  return (
    <div className="flex items-center gap-2">
      <Badge className="bg-green-100 text-green-800">
        <Wallet className="w-3 h-3 ml-1" />
        وردية مفتوحة
      </Badge>
      <span className="text-xs text-muted-foreground">
        المتوقع في الدرج: <strong>{formatCurrency(shift.expected_cash ?? 0)}</strong>
      </span>

      <Button size="sm" variant="ghost" onClick={() => printReportFor(shift.id)} title="طباعة تقرير الوردية">
        <Printer className="w-4 h-4" />
      </Button>

      {showClose ? (
        <>
          <Input
            type="number"
            step="0.01"
            min="0"
            placeholder="النقدية المعدودة"
            value={closingCash}
            onChange={(e) => setClosingCash(e.target.value)}
            className="h-8 w-36"
          />
          <Button size="sm" onClick={() => closeMutation.mutate()} disabled={closeMutation.isPending}>
            {closeMutation.isPending ? 'جارٍ...' : 'تأكيد الإغلاق'}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setShowClose(false)}>
            إلغاء
          </Button>
        </>
      ) : (
        <Button size="sm" variant="outline" onClick={() => setShowClose(true)}>
          <Lock className="w-4 h-4 ml-1" />
          إغلاق الوردية
        </Button>
      )}
    </div>
  )
}
