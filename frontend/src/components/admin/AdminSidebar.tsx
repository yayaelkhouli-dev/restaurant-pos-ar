import { useState, useEffect } from 'react'
import { Link, useRouter, useLocation } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { UserMenu } from '@/components/ui/user-menu'
import { 
  LayoutDashboard, 
  Users, 
  CreditCard, 
  ChefHat,
  Settings,
  User,
  Menu,
  BarChart3,
  UserCog,
  LayoutGrid,
  Package,
  ClipboardList,
  Truck,
  HardDrive,
  ChevronLeft,
  ChevronRight
} from 'lucide-react'
import type { User as UserType } from '@/types'
import apiClient from '@/api/client'

interface AdminSidebarProps {
  user: UserType
}

const adminSections = [
  {
    id: 'dashboard',
    label: 'الرئيسية',
    icon: <LayoutDashboard className="w-5 h-5" />,
    description: 'نظرة عامة وإحصائيات',
    href: '/admin/dashboard'
  },
  {
    id: 'server',
    label: 'واجهة الجرسون',
    icon: <Users className="w-5 h-5" />,
    description: 'واجهة طلبات الجرسون',
    href: '/admin/server'
  },
  {
    id: 'counter',
    label: 'الكاشير / الدفع',
    icon: <CreditCard className="w-5 h-5" />,
    description: 'معالجة الدفع',
    href: '/admin/counter'
  },
  {
    id: 'kitchen',
    label: 'شاشة المطبخ',
    icon: <ChefHat className="w-5 h-5" />,
    description: 'عرض طلبات المطبخ',
    href: '/admin/kitchen'
  },
  {
    id: 'settings',
    label: 'الإعدادات',
    icon: <Settings className="w-5 h-5" />,
    description: 'إعدادات النظام',
    href: '/admin/settings'
  },
  {
    id: 'staff',
    label: 'إدارة الموظفين',
    icon: <UserCog className="w-5 h-5" />,
    description: 'إدارة المستخدمين والصلاحيات',
    href: '/admin/staff'
  },
  {
    id: 'menu',
    label: 'إدارة المنيو',
    icon: <Menu className="w-5 h-5" />,
    description: 'الأصناف والمنتجات',
    href: '/admin/menu'
  },
  {
    id: 'ingredients',
    label: 'المخزون والمكوّنات',
    icon: <Package className="w-5 h-5" />,
    description: 'المكوّنات الخام ووحدات القياس',
    href: '/admin/ingredients'
  },
  {
    id: 'recipes',
    label: 'الوصفات والتكاليف',
    icon: <ClipboardList className="w-5 h-5" />,
    description: 'وصفات الأصناف وتكلفة الطعام',
    href: '/admin/recipes'
  },
  {
    id: 'purchasing',
    label: 'المشتريات والجرد',
    icon: <Truck className="w-5 h-5" />,
    description: 'التوريد والجرد وتقارير المخزون',
    href: '/admin/purchasing'
  },
  {
    id: 'tables',
    label: 'إدارة الطاولات',
    icon: <LayoutGrid className="w-5 h-5" />,
    description: 'إدارة طاولات الصالة',
    href: '/admin/tables'
  },
  {
    id: 'reports',
    label: 'التقارير',
    icon: <BarChart3 className="w-5 h-5" />,
    description: 'التحليلات والتقارير',
    href: '/admin/reports'
  },
  {
    id: 'backups',
    label: 'النسخ الاحتياطي',
    icon: <HardDrive className="w-5 h-5" />,
    description: 'حماية البيانات من الضياع',
    href: '/admin/backups'
  }
]

export function AdminSidebar({ user }: AdminSidebarProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [isTablet, setIsTablet] = useState(false)
  const router = useRouter()
  const location = useLocation()

  // Responsive checks
  useEffect(() => {
    const checkScreenSize = () => {
      const width = window.innerWidth
      setIsMobile(width < 768)
      setIsTablet(width >= 768 && width < 1024)

      if (width < 1024) {
        setSidebarCollapsed(true)
      }
    }

    checkScreenSize()
    window.addEventListener('resize', checkScreenSize)
    return () => window.removeEventListener('resize', checkScreenSize)
  }, [])

  const isActiveRoute = (href: string) => {
    return location.pathname === href
  }

  return (
    <>
      {/* Backdrop for mobile */}
      {(isMobile || isTablet) && !sidebarCollapsed && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 xl:hidden"
          onClick={() => setSidebarCollapsed(true)}
        />
      )}

      {/* Sidebar */}
      <div className={`bg-card border-r border-border transition-all duration-300 flex flex-col z-50 ${
        (isMobile || isTablet) 
          ? `fixed left-0 top-0 h-full ${sidebarCollapsed ? '-translate-x-full w-0' : 'translate-x-0 w-80'}` 
          : `relative ${sidebarCollapsed ? 'w-16' : 'w-64'}`
      }`}>
        
        {/* Header */}
        <div className="p-4 border-b border-border">
          <div className="flex items-center justify-between">
            {!sidebarCollapsed && (
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                  <LayoutDashboard className="w-5 h-5 text-primary-foreground" />
                </div>
                <div>
                  <h1 className="font-bold text-foreground">لوحة الإدارة</h1>
                  <p className="text-xs text-muted-foreground">إدارة المطعم</p>
                </div>
              </div>
            )}
            
            {/* Collapse/Expand Button */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="h-8 w-8 p-0"
            >
              {sidebarCollapsed ? 
                <ChevronRight className="h-4 w-4" /> : 
                <ChevronLeft className="h-4 w-4" />
              }
            </Button>
          </div>
        </div>

        {/* Navigation */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {adminSections.map((section) => (
            <Link
              key={section.id}
              to={section.href}
              className="block"
            >
              <Button
                variant={isActiveRoute(section.href) ? "default" : "ghost"}
                className={`w-full justify-start transition-colors ${
                  sidebarCollapsed && !isMobile && !isTablet ? 'px-2' : 'px-4'
                } ${
                  isTablet ? 'h-12 text-base' : 'h-10 text-sm'
                }`}
              >
                {section.icon}
                {(!sidebarCollapsed || isMobile || isTablet) && (
                  <span className="ml-3">{section.label}</span>
                )}
              </Button>
            </Link>
          ))}
        </div>

        {/* User Menu */}
        <div className="p-4 border-t border-border">
          <UserMenu 
            user={user} 
            collapsed={sidebarCollapsed && !isMobile && !isTablet}
            size={isTablet ? 'lg' : 'md'}
          />
        </div>
      </div>
    </>
  )
}
