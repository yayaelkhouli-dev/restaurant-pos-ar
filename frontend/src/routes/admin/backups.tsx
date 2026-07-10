import { createFileRoute } from '@tanstack/react-router'
import { AdminBackups } from '@/components/admin/AdminBackups'

export const Route = createFileRoute('/admin/backups')({
  component: () => <AdminBackups />,
})
