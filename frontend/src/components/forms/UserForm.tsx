import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Form } from '@/components/ui/form'
import { Button } from '@/components/ui/button'
import { 
  TextInputField, 
  SelectField, 
  FormSubmitButton,
  roleOptions 
} from '@/components/forms/FormComponents'
import { createUserSchema, updateUserSchema, type CreateUserData, type UpdateUserData } from '@/lib/form-schemas'
import { toastHelpers } from '@/lib/toast-helpers'
import apiClient from '@/api/client'
import type { User } from '@/types'
import { X } from 'lucide-react'

interface UserFormProps {
  user?: User // If provided, we're editing; otherwise creating
  onSuccess?: () => void
  onCancel?: () => void
  mode?: 'create' | 'edit'
}

export function UserForm({ user, onSuccess, onCancel, mode = 'create' }: UserFormProps) {
  const queryClient = useQueryClient()
  const isEditing = mode === 'edit' && user

  // Choose the appropriate schema and default values
  const schema = isEditing ? updateUserSchema : createUserSchema
  const defaultValues = isEditing 
    ? {
        id: user.id,
        username: user.username,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        role: user.role as any,
        password: '', // Don't pre-fill password for editing
      }
    : {
        username: '',
        email: '',
        password: '',
        first_name: '',
        last_name: '',
        role: 'server' as const,
      }

  const form = useForm<CreateUserData | UpdateUserData>({
    resolver: zodResolver(schema),
    defaultValues,
  })

  // Create mutation
  const createMutation = useMutation({
    mutationFn: (data: CreateUserData) => apiClient.createUser(data),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      toastHelpers.userCreated(`${form.getValues('first_name')} ${form.getValues('last_name')}`)
      form.reset()
      onSuccess?.()
    },
    onError: (error) => {
      toastHelpers.apiError('الإنشاء', error, 'الموظف')
    },
  })

  // Update mutation  
  const updateMutation = useMutation({
    mutationFn: (data: UpdateUserData) => apiClient.updateUser(data.id.toString(), data),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      toastHelpers.apiSuccess('التعديل', 'الموظف')
      onSuccess?.()
    },
    onError: (error) => {
      toastHelpers.apiError('التعديل', error, 'الموظف')
    },
  })

  const onSubmit = (data: CreateUserData | UpdateUserData) => {
    if (isEditing) {
      // Filter out empty password for updates
      const updateData = { ...data } as UpdateUserData
      if (!updateData.password || updateData.password.trim() === '') {
        delete updateData.password
      }
      updateMutation.mutate(updateData)
    } else {
      createMutation.mutate(data as CreateUserData)
    }
  }

  const isLoading = createMutation.isPending || updateMutation.isPending

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>
          {isEditing ? 'تعديل الموظف' : 'إضافة موظف جديد'}
        </CardTitle>
        {onCancel && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onCancel}
            disabled={isLoading}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Personal Information */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <TextInputField
                control={form.control}
                name="first_name"
                label="الاسم الأول"
                placeholder="أدخل الاسم الأول"
                autoComplete="given-name"
              />

              <TextInputField
                control={form.control}
                name="last_name"
                label="اسم العائلة"
                placeholder="أدخل اسم العائلة"
                autoComplete="family-name"
              />
            </div>

            {/* Account Information */}
            <div className="space-y-4">
              <TextInputField
                control={form.control}
                name="username"
                label="اسم المستخدم"
                placeholder="أدخل اسم المستخدم"
                autoComplete="username"
                description="يُستخدم لتسجيل الدخول إلى النظام"
              />

              <TextInputField
                control={form.control}
                name="email"
                label="البريد الإلكتروني"
                type="email"
                placeholder="أدخل البريد الإلكتروني"
                autoComplete="email"
              />

              <TextInputField
                control={form.control}
                name="password"
                label={isEditing ? "كلمة مرور جديدة (اتركها فارغة للإبقاء على الحالية)" : "كلمة المرور"}
                type="password"
                placeholder={isEditing ? "أدخل كلمة مرور جديدة أو اتركها فارغة" : "أدخل كلمة المرور"}
                autoComplete={isEditing ? "new-password" : "new-password"}
                description={isEditing ? "اتركها فارغة للإبقاء على كلمة المرور الحالية" : "6 أحرف على الأقل"}
              />
            </div>

            {/* Role Selection */}
            <SelectField
              control={form.control}
              name="role"
              label="الدور"
              placeholder="اختر دور الموظف"
              options={roleOptions}
              description="يحدد المزايا التي يمكن للموظف الوصول إليها"
            />

            {/* Action Buttons */}
            <div className="flex gap-3 pt-4">
              <FormSubmitButton
                isLoading={isLoading}
                loadingText={isEditing ? "جاري التحديث..." : "جاري الإنشاء..."}
                className="flex-1"
              >
                {isEditing ? 'تحديث الموظف' : 'إضافة الموظف'}
              </FormSubmitButton>
              
              {onCancel && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={onCancel}
                  disabled={isLoading}
                  className="flex-1"
                >
                  إلغاء
                </Button>
              )}
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  )
}
