import { useState, useEffect } from 'react'
import { Link } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'
import { setAppCurrency } from '@/lib/utils'
import apiClient from '@/api/client'
import {
  Settings,
  Database,
  Bell,
  Globe,
  Banknote,
  Printer,
  Save,
  RotateCcw,
  HardDrive
} from 'lucide-react'

const DEFAULT_SETTINGS = {
  restaurant_name: 'مطعمي',
  currency: 'EGP',
  tax_rate: '10.00',
  service_charge: '0.00',
  receipt_header: 'شكراً لتناولكم الطعام معنا!',
  receipt_footer: 'في انتظار زيارتكم مجدداً!',
  receipt_width: '80', // thermal paper width in mm: 58 or 80
  notification_email: 'admin@restaurant.com',
  theme: 'light',
  language: 'ar'
}

export function AdminSettings() {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [settings, setSettings] = useState(DEFAULT_SETTINGS)

  // Load saved settings from the backend
  const { data: saved } = useQuery({
    queryKey: ['settings'],
    queryFn: () => apiClient.getSettings().then(res => res.data || {})
  })

  // Real backup state. This card used to print a hardcoded "محدّث" whether or not
  // a backup had ever run.
  const { data: backupStatus } = useQuery({
    queryKey: ['backup-settings'],
    queryFn: () => apiClient.getBackupSettings().then(res => res.data ?? null),
  })

  useEffect(() => {
    if (saved) {
      setSettings(prev => ({ ...prev, ...saved }))
    }
  }, [saved])

  const saveMutation = useMutation({
    mutationFn: () => apiClient.updateSettings(settings),
    onSuccess: () => {
      setAppCurrency(settings.currency)
      // The cashier's tax preview, the receipt header and the paper width all read
      // ['public-settings'], which is cached for minutes. Without this the new
      // values only appear after a manual page refresh.
      queryClient.invalidateQueries({ queryKey: ['public-settings'] })
      queryClient.invalidateQueries({ queryKey: ['settings'] })
      toast({ title: 'تم حفظ الإعدادات بنجاح' })
    },
    onError: (e: any) => toast({ title: 'خطأ في الحفظ', description: e.message, variant: 'destructive' }),
  })

  const handleSave = () => saveMutation.mutate()

  const handleReset = () => {
    setSettings(DEFAULT_SETTINGS)
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">إعدادات النظام</h2>
          <p className="text-muted-foreground">
            ضبط إعدادات نظام الكاشير الخاص بمطعمك
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleReset}>
            <RotateCcw className="w-4 h-4 ml-2" />
            إعادة تعيين
          </Button>
          <Button onClick={handleSave} disabled={saveMutation.isPending}>
            <Save className="w-4 h-4 ml-2" />
            {saveMutation.isPending ? 'جاري الحفظ...' : 'حفظ التغييرات'}
          </Button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Restaurant Information */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="w-5 h-5" />
              معلومات المطعم
            </CardTitle>
            <CardDescription>
              المعلومات الأساسية عن مطعمك
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">اسم المطعم</label>
              <Input
                value={settings.restaurant_name}
                onChange={(e) => setSettings({...settings, restaurant_name: e.target.value})}
                placeholder="أدخل اسم المطعم"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">اللغة</label>
              <select
                className="w-full p-2 border border-input rounded-md bg-background"
                value={settings.language}
                onChange={(e) => setSettings({...settings, language: e.target.value})}
              >
                <option value="ar">العربية</option>
                <option value="en">الإنجليزية</option>
              </select>
            </div>
          </CardContent>
        </Card>

        {/* Financial Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Banknote className="w-5 h-5" />
              الإعدادات المالية
            </CardTitle>
            <CardDescription>
              ضبط العملة والضرائب والرسوم
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">العملة</label>
              <select
                className="w-full p-2 border border-input rounded-md bg-background"
                value={settings.currency}
                onChange={(e) => setSettings({...settings, currency: e.target.value})}
              >
                <option value="EGP">جنيه مصري (ج.م)</option>
                <option value="SAR">ريال سعودي (ر.س)</option>
                <option value="AED">درهم إماراتي (د.إ)</option>
                <option value="USD">دولار ($)</option>
                <option value="EUR">يورو (€)</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-2 block">نسبة الضريبة (%)</label>
                <Input
                  type="number"
                  step="0.01"
                  value={settings.tax_rate}
                  onChange={(e) => setSettings({...settings, tax_rate: e.target.value})}
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">رسوم الخدمة (%)</label>
                <Input
                  type="number"
                  step="0.01"
                  value={settings.service_charge}
                  onChange={(e) => setSettings({...settings, service_charge: e.target.value})}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Receipt Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Printer className="w-5 h-5" />
              إعدادات الفاتورة
            </CardTitle>
            <CardDescription>
              تخصيص مظهر الفاتورة ورسائلها
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">ترويسة الفاتورة</label>
              <Input
                value={settings.receipt_header}
                onChange={(e) => setSettings({...settings, receipt_header: e.target.value})}
                placeholder="رسالة الترويسة"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">تذييل الفاتورة</label>
              <Input
                value={settings.receipt_footer}
                onChange={(e) => setSettings({...settings, receipt_footer: e.target.value})}
                placeholder="رسالة التذييل"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">عرض ورق الطابعة الحرارية</label>
              <div className="flex rounded-md overflow-hidden border border-border w-fit">
                {['80', '58'].map((w) => (
                  <button
                    key={w}
                    type="button"
                    className={`px-4 h-9 text-sm ${
                      settings.receipt_width === w ? 'bg-primary text-primary-foreground' : 'bg-background'
                    }`}
                    onClick={() => setSettings({ ...settings, receipt_width: w })}
                  >
                    {w} مم
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                اختر عرض ورق طابعتك. الإيصال وتقرير آخر اليوم يُطبعان بهذا المقاس عبر طابعة ويندوز الافتراضية.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* System Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="w-5 h-5" />
              إعدادات النظام
            </CardTitle>
            <CardDescription>
              سلوك النظام والتفضيلات
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">المظهر</label>
              <select
                className="w-full p-2 border border-input rounded-md bg-background"
                value={settings.theme}
                onChange={(e) => setSettings({...settings, theme: e.target.value})}
              >
                <option value="light">فاتح</option>
                <option value="dark">داكن</option>
                <option value="system">حسب النظام</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">النسخ الاحتياطي</label>
              <Link to="/admin/backups">
                <Button variant="outline" className="w-full justify-start">
                  <HardDrive className="w-4 h-4 ml-2" />
                  إدارة النسخ الاحتياطي
                </Button>
              </Link>
              <p className="text-xs text-muted-foreground mt-1">
                {backupStatus?.auto_enabled
                  ? `نسخ تلقائي كل ${backupStatus.interval_hours} ساعة`
                  : 'النسخ التلقائي مُطفأ — بياناتك غير محميّة'}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Notifications */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="w-5 h-5" />
              إعدادات الإشعارات
            </CardTitle>
            <CardDescription>
              ضبط التنبيهات والإشعارات
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">بريد الإشعارات</label>
              <Input
                type="email"
                value={settings.notification_email}
                onChange={(e) => setSettings({...settings, notification_email: e.target.value})}
                placeholder="admin@restaurant.com"
              />
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4">
              <div className="flex items-center gap-2">
                <Badge variant="secondary">تنبيهات نقص المخزون</Badge>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">التقارير اليومية</Badge>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">تحديثات النظام</Badge>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">إشعارات الأخطاء</Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* System Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="w-5 h-5" />
            حالة النظام
          </CardTitle>
          <CardDescription>
            صحة النظام الحالية ومعلوماته
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <Badge variant="outline" className="w-full">
                قاعدة البيانات
              </Badge>
              <p className="text-sm text-green-600 mt-1">متصلة</p>
            </div>
            <div className="text-center">
              <Badge variant="outline" className="w-full">
                خادم الـ API
              </Badge>
              <p className="text-sm text-green-600 mt-1">متصل</p>
            </div>
            <div className="text-center">
              <Badge variant="outline" className="w-full">
                آخر نسخة احتياطية
              </Badge>
              {backupStatus?.last_at ? (
                <p className={`text-sm mt-1 ${backupStatus.last_status === 'ok' ? 'text-green-600' : 'text-destructive'}`}>
                  {new Date(backupStatus.last_at).toLocaleDateString('ar-EG')}
                </p>
              ) : (
                <p className="text-sm text-destructive mt-1">لا توجد</p>
              )}
            </div>
            <div className="text-center">
              <Badge variant="outline" className="w-full">
                الإصدار
              </Badge>
              <p className="text-sm text-muted-foreground mt-1">v1.0.0</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
