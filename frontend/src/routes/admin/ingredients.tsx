import { createFileRoute } from '@tanstack/react-router'
import { AdminIngredients } from '@/components/admin/AdminIngredients'

export const Route = createFileRoute('/admin/ingredients')({
  component: () => <AdminIngredients />,
})
