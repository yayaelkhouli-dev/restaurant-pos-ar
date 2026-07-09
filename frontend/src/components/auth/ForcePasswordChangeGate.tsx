import { useEffect, useState } from 'react'
import { ChangePasswordForm } from './ChangePasswordForm'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ShieldAlert } from 'lucide-react'

/**
 * Blocks the app with a forced password-change screen when the logged-in user
 * still carries the must_change_password flag (e.g. default seeded accounts).
 * Reads the user from localStorage (where login stores it) so it works across
 * all authenticated routes without prop drilling.
 */
export function ForcePasswordChangeGate({ children }: { children: React.ReactNode }) {
  const [mustChange, setMustChange] = useState(false)

  useEffect(() => {
    try {
      const raw = localStorage.getItem('pos_user')
      if (raw) {
        const u = JSON.parse(raw)
        setMustChange(!!u?.must_change_password)
      }
    } catch {
      setMustChange(false)
    }
  }, [])

  const handleChanged = () => {
    // Clear the flag locally and reload into the normal app
    try {
      const raw = localStorage.getItem('pos_user')
      if (raw) {
        const u = JSON.parse(raw)
        u.must_change_password = false
        localStorage.setItem('pos_user', JSON.stringify(u))
      }
    } catch {
      /* ignore */
    }
    setMustChange(false)
    window.location.reload()
  }

  if (!mustChange) return <>{children}</>

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4" dir="rtl">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center mb-2">
            <ShieldAlert className="w-6 h-6 text-amber-600" />
          </div>
          <CardTitle>تغيير كلمة السر مطلوب</CardTitle>
        </CardHeader>
        <CardContent>
          <ChangePasswordForm forced onSuccess={handleChanged} />
        </CardContent>
      </Card>
    </div>
  )
}
