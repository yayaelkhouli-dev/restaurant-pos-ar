import { createFileRoute, Navigate, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

import apiClient from '@/api/client'
import type { LoginRequest, LoginResponse, APIResponse } from '@/types'
import { Eye, EyeOff, Store, Users, CreditCard, BarChart3, ChefHat, UserCheck, Settings } from 'lucide-react'

export const Route = createFileRoute('/login')({
  component: LoginPage,
})

function LoginPage() {
  const router = useRouter()
  const [formData, setFormData] = useState<LoginRequest>({ username: '', password: '' })
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')

  // Check if already authenticated
  if (apiClient.isAuthenticated()) {
    return <Navigate to="/" />
  }

  const loginMutation = useMutation({
    mutationFn: async (credentials: LoginRequest) => {
      const response: APIResponse<LoginResponse> = await apiClient.login(credentials)
      return response
    },
    onSuccess: (data) => {
      console.log('Login success:', data)
      console.log('Current API URL:', import.meta.env.VITE_API_URL)
      if (data.success && data.data) {
        apiClient.setAuthToken(data.data.token)
        localStorage.setItem('pos_user', JSON.stringify(data.data.user))
        console.log('Auth token set, redirecting to home...')
        // Full navigation (not SPA) so the force-password-change gate remounts
        // and re-reads the freshly stored user flag.
        setTimeout(() => {
          window.location.href = '/'
        }, 100)
      } else {
        console.error('Login failed:', data)
        setError(data.message || 'Login failed')
      }
    },
    onError: (error: any) => {
      setError(error.message || 'Login failed')
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    
    if (!formData.username || !formData.password) {
      setError('اسم المستخدم وكلمة المرور مطلوبان')
      return
    }

    loginMutation.mutate(formData)
  }

  const fillDemoCredentials = (username: string, password: string) => {
    setFormData({ username, password })
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex">
      {/* Left Panel - Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-blue-600 to-indigo-700 p-12 text-white relative overflow-hidden">
        <div className="relative z-10 flex flex-col justify-center max-w-lg">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center">
              <Store className="w-7 h-7" />
            </div>
            <h1 className="text-3xl font-bold">نظام الكاشير</h1>
          </div>

          <h2 className="text-4xl font-bold mb-6 leading-tight">
            نظام نقاط بيع حديث
            <br />
            <span className="text-blue-200">لمطعمك وكافيهك</span>
          </h2>

          <p className="text-xl text-blue-100 mb-12 leading-relaxed">
            أدِر مطعمك بسهولة مع نظام كاشير متكامل: إدارة الطلبات، متابعة
            المخزون، وتنمية أعمالك بتقارير وتحليلات قوية.
          </p>

          <div className="grid grid-cols-2 gap-6">
            {[
              { icon: Users, title: 'إدارة الموظفين', desc: 'صلاحيات حسب الدور' },
              { icon: CreditCard, title: 'معالجة الدفع', desc: 'طرق دفع متعددة' },
              { icon: BarChart3, title: 'تحليلات فورية', desc: 'رؤى لأعمالك' },
              { icon: Store, title: 'إدارة الطلبات', desc: 'سير عمل المطبخ' },
            ].map((feature, idx) => (
              <div key={idx} className="flex items-start gap-3">
                <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center flex-shrink-0">
                  <feature.icon className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm">{feature.title}</h3>
                  <p className="text-blue-200 text-xs">{feature.desc}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Sponsor Banner */}
          <div className="mt-12 p-4 bg-white/10 backdrop-blur-sm rounded-xl border border-white/20 shadow-lg">
            <div className="text-center mb-3">
              <div className="inline-flex items-center gap-2 bg-white/20 text-white px-3 py-1 rounded-full text-xs font-semibold">
                <div className="w-1.5 h-1.5 bg-white rounded-full animate-pulse"></div>
                مميزات النظام
              </div>
            </div>

            <div className="space-y-3">
              {/* MVP/Project Services */}
              <div className="bg-white/15 rounded-lg p-3 border border-white/20">
                <div className="flex items-start gap-2">
                  <div className="w-6 h-6 bg-white/30 rounded-md flex items-center justify-center flex-shrink-0">
                    <Store className="w-3 h-3 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-white text-sm mb-1">كل أدوات مطعمك في مكان واحد</h3>
                    <p className="text-xs text-blue-100 mb-2 leading-relaxed">
                      إدارة الطلبات والمطبخ والطاولات والتقارير بسهولة
                    </p>
                    <a 
                      href="#"
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="inline-flex items-center text-xs font-medium text-blue-200 hover:text-white transition-colors"
                    >
                      اعرف المزيد ←
                    </a>
                  </div>
                </div>
              </div>

              {/* Coding Bootcamp */}
              <div className="bg-white/15 rounded-lg p-3 border border-white/20">
                <div className="flex items-start gap-2">
                  <div className="w-6 h-6 bg-white/30 rounded-md flex items-center justify-center flex-shrink-0">
                    <Users className="w-3 h-3 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-white text-sm mb-1">بسيط وسريع وسهل الاستخدام</h3>
                    <p className="text-xs text-blue-100 mb-2 leading-relaxed">
                      واجهة سهلة تناسب كل موظفي المطعم
                    </p>
                    <a 
                      href="#"
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="inline-flex items-center text-xs font-medium text-blue-200 hover:text-white transition-colors"
                    >
                      ابدأ الآن ←
                    </a>
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom tagline */}
            <div className="mt-3 pt-3 border-t border-white/20">
              <p className="text-center text-xs text-blue-200">
                ✨ نظام كاشير متكامل لإدارة مطعمك باحترافية
              </p>
            </div>
          </div>
        </div>

        {/* Background Pattern */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-0 left-0 w-full h-full"
               style={{
                 backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
                 backgroundSize: '50px 50px'
               }} />
        </div>
      </div>

      {/* Right Panel - Login Form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          <Card className="shadow-xl border-0">
            <CardHeader className="text-center pb-8">
              <div className="mx-auto w-16 h-16 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center mb-4 shadow-lg">
                <Store className="w-8 h-8 text-white" />
              </div>
              <CardTitle className="text-2xl font-bold">تسجيل الدخول</CardTitle>
              <CardDescription className="text-base">
                🍽️ اختر دورك من الأسفل أو سجّل دخولك يدوياً
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-6">
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">اسم المستخدم</label>
                  <Input
                    type="text"
                    value={formData.username}
                    onChange={(e) => setFormData(prev => ({ ...prev, username: e.target.value }))}
                    className="h-11"
                    autoComplete="username"
                    disabled={loginMutation.isPending}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">كلمة المرور</label>
                  <div className="relative">
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      value={formData.password}
                      onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                      className="h-11 pl-10"
                      autoComplete="current-password"
                      disabled={loginMutation.isPending}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {error && (
                  <div className="bg-gradient-to-r from-red-50 to-red-25 border border-red-200 text-red-700 p-4 rounded-lg text-sm shadow-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 bg-red-500 rounded-full flex items-center justify-center flex-shrink-0">
                        <div className="w-1.5 h-1.5 bg-white rounded-full"></div>
                      </div>
                      <span className="font-medium">فشل تسجيل الدخول</span>
                    </div>
                    <div className="mt-1 text-xs text-red-600">{error}</div>
                  </div>
                )}

                <Button 
                  type="submit" 
                  className="w-full h-11 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-base font-medium transition-all duration-200 shadow-md hover:shadow-lg"
                  disabled={loginMutation.isPending}
                >
                  {loginMutation.isPending ? (
                    <div className="flex items-center justify-center gap-2">
                      <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                      جاري الدخول...
                    </div>
                  ) : (
                    'دخول'
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Mobile Sponsor Banner */}
          <div className="mt-8 w-full max-w-md lg:hidden">
            <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-2xl p-6 shadow-lg">
              <div className="text-center mb-4">
                <div className="inline-flex items-center gap-2 bg-gradient-to-r from-amber-500 to-orange-500 text-white px-4 py-1.5 rounded-full text-sm font-semibold shadow-md">
                  <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
                  مميزات النظام
                </div>
              </div>

              <div className="space-y-4">
                {/* MVP/Project Services */}
                <div className="bg-white/70 rounded-xl p-4 border border-amber-200/50">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-lg flex items-center justify-center flex-shrink-0">
                      <Store className="w-4 h-4 text-white" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-800 mb-1">كل أدوات مطعمك في مكان واحد</h3>
                      <p className="text-sm text-gray-600 mb-2">
                        إدارة الطلبات والمطبخ والطاولات والتقارير بسهولة
                      </p>
                      <a 
                        href="#"
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="inline-flex items-center text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors"
                      >
                        اعرف المزيد ←
                      </a>
                    </div>
                  </div>
                </div>

                {/* Coding Bootcamp */}
                <div className="bg-white/70 rounded-xl p-4 border border-amber-200/50">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 bg-gradient-to-r from-purple-500 to-pink-500 rounded-lg flex items-center justify-center flex-shrink-0">
                      <Users className="w-4 h-4 text-white" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-800 mb-1">بسيط وسريع وسهل الاستخدام</h3>
                      <p className="text-sm text-gray-600 mb-2">
                        واجهة سهلة تناسب كل موظفي المطعم
                      </p>
                      <a 
                        href="#"
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="inline-flex items-center text-sm font-medium text-purple-600 hover:text-purple-700 transition-colors"
                      >
                        ابدأ الآن ←
                      </a>
                    </div>
                  </div>
                </div>
              </div>

              {/* Bottom tagline */}
              <div className="mt-4 pt-4 border-t border-amber-200/50">
                <p className="text-center text-xs text-gray-500">
                  ✨ نظام كاشير متكامل لإدارة مطعمك باحترافية
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
