import { createFileRoute } from '@tanstack/react-router'
import { AdminPurchasing } from '@/components/admin/AdminPurchasing'

export const Route = createFileRoute('/admin/purchasing')({
  component: () => <AdminPurchasing />,
})
