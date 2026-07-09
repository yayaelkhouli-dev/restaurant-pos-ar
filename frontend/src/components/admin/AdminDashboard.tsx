import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import apiClient from '@/api/client'
import { formatCurrency } from '@/lib/utils'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Banknote,
  ShoppingCart,
  Users,
  Table,
  TrendingUp,
  Plus,
  Settings,
  BarChart3,
  AlertTriangle
} from 'lucide-react'

interface IncomeBreakdownItem {
  period: string
  orders: number
  gross: number
  tax: number
  net: number
}

export function AdminDashboard() {
  const [selectedPeriod, setSelectedPeriod] = useState<'today' | 'week' | 'month'>('today')

  // A dashboard left open on a back-office screen has to track the day's sales
  // as they happen, so both of these poll rather than wait for a mutation.
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['dashboardStats'],
    queryFn: () => apiClient.getDashboardStats().then(res => res.data ?? null),
    refetchInterval: 30_000,
  })

  // Fetch income report
  const { data: income, isLoading: incomeLoading } = useQuery({
    queryKey: ['incomeReport', selectedPeriod],
    queryFn: () => apiClient.getIncomeReport(selectedPeriod).then(res => res.data ?? null),
    refetchInterval: 30_000,
  })

  // Fetch low-stock alerts
  const { data: lowStock } = useQuery({
    queryKey: ['lowStockAlerts'],
    queryFn: () => apiClient.getLowStockAlerts().then(res => res.data),
    refetchInterval: 60000,
  })


  // نسبة التغيّر الحقيقية عن أمس
  const formatDelta = (today: number, yesterday: number) => {
    if (!yesterday || yesterday === 0) {
      return today > 0 ? 'لا توجد بيانات أمس للمقارنة' : 'لا يوجد نشاط'
    }
    const pct = ((today - yesterday) / yesterday) * 100
    const sign = pct >= 0 ? '▲ +' : '▼ '
    return `${sign}${pct.toFixed(0)}% عن أمس`
  }
  const deltaColor = (today: number, yesterday: number) =>
    today >= yesterday ? 'text-green-600' : 'text-red-600'

  if (statsLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">لوحة الإدارة</h1>
          <p className="text-muted-foreground">
            إدارة عمليات مطعمك ومتابعة الأداء
          </p>
        </div>
        <div className="flex gap-2">
          <Link to="/admin/settings">
            <Button variant="outline" size="sm">
              <Settings className="w-4 h-4 ml-2" />
              الإعدادات
            </Button>
          </Link>
          <Link to="/admin/reports">
            <Button variant="outline" size="sm">
              <BarChart3 className="w-4 h-4 ml-2" />
              التقارير
            </Button>
          </Link>
        </div>
      </div>

      {/* Low-stock alert banner */}
      {lowStock && lowStock.count > 0 && (
        <Link to="/admin/ingredients" className="block">
          <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 p-4 hover:bg-red-100 transition-colors">
            <AlertTriangle className="h-5 w-5 text-red-600 shrink-0" />
            <div className="flex-1">
              <p className="font-semibold text-red-800">
                تنبيه نواقص المخزون: {lowStock.count} {lowStock.count === 1 ? 'مكوّن وصل' : 'مكوّنات وصلت'} للحد الأدنى
              </p>
              <p className="text-sm text-red-600">
                {lowStock.ingredients.slice(0, 4).map(i => i.name).join('، ')}
                {lowStock.count > 4 ? ` و${lowStock.count - 4} غيرها...` : ''}
              </p>
            </div>
            <span className="text-sm text-red-700 font-medium whitespace-nowrap">اضغط للمراجعة ←</span>
          </div>
        </Link>
      )}

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">طلبات اليوم</CardTitle>
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.today_orders || 0}</div>
            <p className={`text-xs ${deltaColor(stats?.today_orders || 0, stats?.yesterday_orders || 0)}`}>
              {formatDelta(stats?.today_orders || 0, stats?.yesterday_orders || 0)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">إيرادات اليوم</CardTitle>
            <Banknote className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(stats?.today_revenue || 0)}</div>
            <p className={`text-xs ${deltaColor(stats?.today_revenue || 0, stats?.yesterday_revenue || 0)}`}>
              {formatDelta(stats?.today_revenue || 0, stats?.yesterday_revenue || 0)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">الطلبات النشطة</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.active_orders || 0}</div>
            <p className="text-xs text-muted-foreground">
              قيد التنفيذ حالياً
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">الطاولات المشغولة</CardTitle>
            <Table className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.occupied_tables || 0}</div>
            <p className="text-xs text-muted-foreground">
              طاولات قيد الاستخدام
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Income Report */}
      <Card className="col-span-4">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                تقرير الإيرادات
              </CardTitle>
              <CardDescription>
                تفصيل كامل للإيرادات والأداء
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button 
                variant={selectedPeriod === 'today' ? 'default' : 'outline'} 
                size="sm"
                onClick={() => setSelectedPeriod('today')}
              >
                اليوم
              </Button>
              <Button 
                variant={selectedPeriod === 'week' ? 'default' : 'outline'} 
                size="sm"
                onClick={() => setSelectedPeriod('week')}
              >
                الأسبوع
              </Button>
              <Button 
                variant={selectedPeriod === 'month' ? 'default' : 'outline'} 
                size="sm"
                onClick={() => setSelectedPeriod('month')}
              >
                الشهر
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {incomeLoading ? (
            <div className="flex justify-center py-8">
              <div className="w-6 h-6 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : income ? (
            <div className="space-y-6">
              {/* Summary */}
              <div className="grid gap-4 md:grid-cols-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">
                    {income.summary.total_orders}
                  </div>
                  <div className="text-sm text-muted-foreground">إجمالي الطلبات</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">
                    {formatCurrency(income.summary.gross_income)}
                  </div>
                  <div className="text-sm text-muted-foreground">إجمالي الدخل</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-orange-600">
                    {formatCurrency(income.summary.tax_collected)}
                  </div>
                  <div className="text-sm text-muted-foreground">الضريبة المحصّلة</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-purple-600">
                    {formatCurrency(income.summary.net_income)}
                  </div>
                  <div className="text-sm text-muted-foreground">صافي الدخل</div>
                </div>
              </div>

              {/* Breakdown Table */}
              {income.breakdown && income.breakdown.length > 0 && (
                <div className="border rounded-lg">
                  <div className="grid grid-cols-5 gap-4 p-4 bg-muted/50 font-medium text-sm">
                    <div>الفترة</div>
                    <div className="text-center">الطلبات</div>
                    <div className="text-center">الإجمالي</div>
                    <div className="text-center">الضريبة</div>
                    <div className="text-center">الصافي</div>
                  </div>
                  {income.breakdown.slice(0, 10).map((item: IncomeBreakdownItem, index: number) => (
                    <div key={index} className="grid grid-cols-5 gap-4 p-4 border-t text-sm">
                      <div className="font-medium">
                        {new Date(item.period).toLocaleDateString()}
                      </div>
                      <div className="text-center">{item.orders}</div>
                      <div className="text-center">{formatCurrency(item.gross)}</div>
                      <div className="text-center">{formatCurrency(item.tax)}</div>
                      <div className="text-center font-medium">{formatCurrency(item.net)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              لا توجد بيانات إيرادات
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Link to="/admin/menu" className="block">
          <Card className="hover:shadow-lg transition-shadow cursor-pointer">
            <CardHeader className="text-center">
              <Plus className="h-8 w-8 mx-auto text-blue-600" />
              <CardTitle className="text-lg">إدارة المنيو</CardTitle>
              <CardDescription>إضافة وتعديل وحذف الأصناف والمنتجات</CardDescription>
            </CardHeader>
          </Card>
        </Link>

        <Link to="/admin/tables" className="block">
          <Card className="hover:shadow-lg transition-shadow cursor-pointer">
            <CardHeader className="text-center">
              <Table className="h-8 w-8 mx-auto text-green-600" />
              <CardTitle className="text-lg">إدارة الطاولات</CardTitle>
              <CardDescription>تنظيم طاولات الصالة وأماكن الجلوس</CardDescription>
            </CardHeader>
          </Card>
        </Link>

        <Link to="/admin/staff" className="block">
          <Card className="hover:shadow-lg transition-shadow cursor-pointer">
            <CardHeader className="text-center">
              <Users className="h-8 w-8 mx-auto text-purple-600" />
              <CardTitle className="text-lg">إدارة الموظفين</CardTitle>
              <CardDescription>إضافة وتعديل حسابات الموظفين والصلاحيات</CardDescription>
            </CardHeader>
          </Card>
        </Link>

        <Link to="/admin/reports" className="block">
          <Card className="hover:shadow-lg transition-shadow cursor-pointer">
            <CardHeader className="text-center">
              <BarChart3 className="h-8 w-8 mx-auto text-orange-600" />
              <CardTitle className="text-lg">التقارير</CardTitle>
              <CardDescription>تحليلات وتقارير مفصّلة للأداء</CardDescription>
            </CardHeader>
          </Card>
        </Link>
      </div>
    </div>
  )
}
