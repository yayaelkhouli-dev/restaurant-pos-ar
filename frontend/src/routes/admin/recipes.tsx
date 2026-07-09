import { createFileRoute } from '@tanstack/react-router'
import { AdminRecipes } from '@/components/admin/AdminRecipes'

export const Route = createFileRoute('/admin/recipes')({
  component: () => <AdminRecipes />,
})
