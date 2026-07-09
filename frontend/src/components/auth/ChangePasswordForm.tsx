import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import apiClient from '@/api/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toastHelpers } from '@/lib/toast-helpers'
import { KeyRound } from 'lucide-react'

interface ChangePasswordFormProps {
  /** Called after a successful change (e.g. to clear the force-change flag / reload). */
  onSuccess?: () => void
  /** Show a short explanation that a change is required. */
  forced?: boolean
}

export function ChangePasswordForm({ onSuccess, forced }: ChangePasswordFormProps) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [localError, setLocalError] = useState('')

  const mutation = useMutation({
    mutationFn: () => apiClient.changePassword(current, next),
    onSuccess: () => {
      toastHelpers.success('تم تغيير كلمة السر بنجاح')
      setCurrent(''); setNext(''); setConfirm('')
      onSuccess?.()
    },
    onError: (e: any) => {
      toastHelpers.apiError('تغيير كلمة السر', e?.response?.data?.message || e)
    },
  })

  const submit = () => {
    setLocalError('')
    if (next.length < 6) { setLocalError('كلمة السر الجديدة يجب أن تكون 6 أحرف على الأقل'); return }
    if (next !== confirm) { setLocalError('تأكيد كلمة السر لا يطابق'); return }
    if (next === current) { setLocalError('كلمة السر الجديدة يجب أن تختلف عن الحالية'); return }
    mutation.mutate()
  }

  return (
    <div className="space-y-4" dir="rtl">
      {forced && (
        <p className="text-sm text-muted-foreground">
          لأسباب أمنية، يجب تغيير كلمة السر الافتراضية قبل استخدام النظام.
        </p>
      )}
      <div>
        <label className="text-sm font-medium mb-1 block">كلمة السر الحالية</label>
        <Input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} placeholder="••••••" />
      </div>
      <div>
        <label className="text-sm font-medium mb-1 block">كلمة السر الجديدة</label>
        <Input type="password" value={next} onChange={(e) => setNext(e.target.value)} placeholder="6 أحرف على الأقل" />
      </div>
      <div>
        <label className="text-sm font-medium mb-1 block">تأكيد كلمة السر الجديدة</label>
        <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="أعد كتابة كلمة السر" />
      </div>
      {localError && <p className="text-sm text-red-600">{localError}</p>}
      <Button className="w-full" size="lg" onClick={submit} disabled={mutation.isPending || !current || !next || !confirm}>
        <KeyRound className="w-4 h-4 ml-2" />
        {mutation.isPending ? 'جارٍ الحفظ...' : 'تغيير كلمة السر'}
      </Button>
    </div>
  )
}
