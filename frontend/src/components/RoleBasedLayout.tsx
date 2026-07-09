import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { AdminLayout } from '@/components/admin/AdminLayout'
import { ServerInterface } from '@/components/server/ServerInterface'
import { CounterInterface } from '@/components/counter/CounterInterface'
import { NewEnhancedKitchenLayout } from '@/components/kitchen/NewEnhancedKitchenLayout'
import { 
  LayoutDashboard, 
  Users, 
  CreditCard, 
  ChefHat,
  ShoppingCart,
  Settings,
  LogOut,
  User
} from 'lucide-react'
import type { User as UserType } from '@/types'
import apiClient from '@/api/client'

interface RoleBasedLayoutProps {
  user: UserType
}

export function RoleBasedLayout({ user }: RoleBasedLayoutProps) {
  const [currentView, setCurrentView] = useState<string>(getDefaultView(user.role))

  function getDefaultView(role: string): string {
    switch (role) {
      case 'admin':
      case 'manager':
        return 'dashboard'
      case 'server':
        return 'server'
      case 'counter':
        return 'counter'
      case 'kitchen':
        return 'kitchen'
      default:
        return 'counter' // fallback to the working cashier interface
    }
  }

  const handleLogout = () => {
    apiClient.clearAuth()
    window.location.href = '/login'
  }

  const getRoleConfig = (role: string) => {
    switch (role) {
      case 'admin':
        return {
          title: 'مدير عام',
          color: 'bg-red-100 text-red-800',
          icon: <Settings className="w-4 h-4" />,
          description: 'وصول كامل للنظام وإدارته'
        }
      case 'manager':
        return {
          title: 'مدير',
          color: 'bg-purple-100 text-purple-800',
          icon: <LayoutDashboard className="w-4 h-4" />,
          description: 'إدارة العمليات والتقارير'
        }
      case 'server':
        return {
          title: 'جرسون',
          color: 'bg-blue-100 text-blue-800',
          icon: <Users className="w-4 h-4" />,
          description: 'إنشاء طلبات الصالة'
        }
      case 'counter':
        return {
          title: 'كاشير',
          color: 'bg-green-100 text-green-800',
          icon: <CreditCard className="w-4 h-4" />,
          description: 'إنشاء الطلبات ومعالجة الدفع'
        }
      case 'kitchen':
        return {
          title: 'مطبخ',
          color: 'bg-orange-100 text-orange-800',
          icon: <ChefHat className="w-4 h-4" />,
          description: 'تحضير الطلبات وتحديث حالتها'
        }
      default:
        return {
          title: 'موظف',
          color: 'bg-gray-100 text-gray-800',
          icon: <User className="w-4 h-4" />,
          description: 'وصول عام'
        }
    }
  }

  const roleConfig = getRoleConfig(user.role)

  // Get available views based on user role
  const getAvailableViews = (role: string) => {
    const views = []

    // Admin and managers get all views
    if (role === 'admin' || role === 'manager') {
      views.push(
        { id: 'dashboard', label: 'لوحة التحكم', icon: <LayoutDashboard className="w-4 h-4" /> },
        { id: 'server', label: 'واجهة الجرسون', icon: <Users className="w-4 h-4" /> },
        { id: 'counter', label: 'الكاشير/الدفع', icon: <CreditCard className="w-4 h-4" /> },
        { id: 'kitchen', label: 'شاشة المطبخ', icon: <ChefHat className="w-4 h-4" /> }
      )
    }
    // Server gets the server interface
    else if (role === 'server') {
      views.push(
        { id: 'server', label: 'واجهة الجرسون', icon: <Users className="w-4 h-4" /> }
      )
    }
    // Counter gets the cashier/payment interface
    else if (role === 'counter') {
      views.push(
        { id: 'counter', label: 'الكاشير/الدفع', icon: <CreditCard className="w-4 h-4" /> }
      )
    }
    // Kitchen staff gets kitchen display only
    else if (role === 'kitchen') {
      views.push(
        { id: 'kitchen', label: 'شاشة المطبخ', icon: <ChefHat className="w-4 h-4" /> }
      )
    }
    // Default fallback
    else {
      views.push(
        { id: 'counter', label: 'الكاشير/الدفع', icon: <CreditCard className="w-4 h-4" /> }
      )
    }

    return views
  }

  const availableViews = getAvailableViews(user.role)

  const renderCurrentView = () => {
    switch (currentView) {
      case 'dashboard':
        return <AdminLayout user={user} />
      case 'server':
        return <ServerInterface />
      case 'counter':
        return <CounterInterface />
      case 'kitchen':
        return <NewEnhancedKitchenLayout user={user} />
      default:
        return <CounterInterface />
    }
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Top Navigation Bar */}
      <div className="border-b border-border bg-card px-6 py-3">
        <div className="flex items-center justify-between">
          {/* Left Side - Logo and Navigation */}
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                <ShoppingCart className="w-5 h-5 text-primary-foreground" />
              </div>
              <span className="text-xl font-bold">نظام الكاشير</span>
            </div>

            {/* Navigation Tabs */}
            {availableViews.length > 1 && (
              <div className="flex items-center gap-2">
                {availableViews.map(view => (
                  <Button
                    key={view.id}
                    variant={currentView === view.id ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setCurrentView(view.id)}
                    className="flex items-center gap-2"
                  >
                    {view.icon}
                    {view.label}
                  </Button>
                ))}
              </div>
            )}
          </div>

          {/* Right Side - User Info and Actions */}
          <div className="flex items-center gap-4">
            {/* User Info */}
            <div className="flex items-center gap-3">
              <div className="text-right">
                <div className="font-medium text-sm">
                  {user.first_name} {user.last_name}
                </div>
                <div className="text-xs text-muted-foreground">
                  {roleConfig.description}
                </div>
              </div>
              <Badge className={`${roleConfig.color} font-medium`}>
                {roleConfig.icon}
                <span className="ml-1">{roleConfig.title}</span>
              </Badge>
            </div>

            {/* Logout Button */}
            <Button
              variant="outline"
              size="sm"
              onClick={handleLogout}
              className="flex items-center gap-2"
            >
              <LogOut className="w-4 h-4" />
              تسجيل الخروج
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1">
        {renderCurrentView()}
      </div>
    </div>
  )
}

