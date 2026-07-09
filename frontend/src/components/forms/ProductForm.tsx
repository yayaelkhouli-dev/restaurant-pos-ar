import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Form } from '@/components/ui/form'
import { Button } from '@/components/ui/button'
import { 
  TextInputField, 
  TextareaField,
  PriceInputField,
  NumberInputField,
  SelectField,
  FormSubmitButton,
  productStatusOptions 
} from '@/components/forms/FormComponents'
import { createProductSchema, updateProductSchema, type CreateProductData, type UpdateProductData } from '@/lib/form-schemas'
import { toastHelpers } from '@/lib/toast-helpers'
import apiClient from '@/api/client'
import type { Product, Category } from '@/types'
import { X } from 'lucide-react'

interface ProductFormProps {
  product?: Product // If provided, we're editing; otherwise creating
  onSuccess?: () => void
  onCancel?: () => void
  mode?: 'create' | 'edit'
}

export function ProductForm({ product, onSuccess, onCancel, mode = 'create' }: ProductFormProps) {
  const queryClient = useQueryClient()
  const isEditing = mode === 'edit' && product

  // Fetch categories for dropdown
  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: () => apiClient.getCategories().then(res => res.data)
  })

  // Create category options for select field
  const categoryOptions = categories.map(cat => ({
    value: cat.id.toString(),
    label: cat.name
  }))

  // Choose the appropriate schema and default values
  const schema = isEditing ? updateProductSchema : createProductSchema
  const defaultValues = isEditing 
    ? {
        id: product.id,
        name: product.name,
        description: product.description || '',
        price: product.price,
        category_id: product.category_id,
        image_url: product.image_url || '',
        status: (product as any).status as any,
        preparation_time: product.preparation_time || 5,
      }
    : {
        name: '',
        description: '',
        price: 0,
        category_id: categories[0]?.id || 1,
        image_url: '',
        status: 'active' as const,
        preparation_time: 5,
      }

  const form = useForm<any>({
    resolver: zodResolver(schema),
    defaultValues,
  })

  // Create mutation
  const createMutation = useMutation({
    mutationFn: (data: CreateProductData) => apiClient.createProduct(data),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['admin-products'] })
      queryClient.invalidateQueries({ queryKey: ['products'] })
      queryClient.invalidateQueries({ queryKey: ['categories'] })
      toastHelpers.productCreated(form.getValues('name'))
      form.reset()
      onSuccess?.()
    },
    onError: (error) => {
      toastHelpers.apiError('الإنشاء', error, 'المنتج')
    },
  })

  // Update mutation  
  const updateMutation = useMutation({
    mutationFn: (data: UpdateProductData) => apiClient.updateProduct(data.id.toString(), data),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['admin-products'] })
      queryClient.invalidateQueries({ queryKey: ['products'] })
      queryClient.invalidateQueries({ queryKey: ['categories'] })
      toastHelpers.apiSuccess('التعديل', 'المنتج')
      onSuccess?.()
    },
    onError: (error) => {
      toastHelpers.apiError('التعديل', error, 'المنتج')
    },
  })

  const onSubmit = (data: CreateProductData | UpdateProductData) => {
    if (isEditing) {
      updateMutation.mutate(data as UpdateProductData)
    } else {
      createMutation.mutate(data as CreateProductData)
    }
  }

  const isLoading = createMutation.isPending || updateMutation.isPending

  if (categories.length === 0) {
    return (
      <Card className="w-full max-w-2xl mx-auto">
        <CardContent className="pt-6">
          <div className="text-center py-8">
            <p className="text-muted-foreground mb-4">
              يجب إنشاء صنف واحد على الأقل قبل إضافة المنتجات.
            </p>
            <Button onClick={onCancel} variant="outline">
              رجوع
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>
          {isEditing ? 'تعديل المنتج' : 'إضافة منتج جديد'}
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
            {/* Basic Information */}
            <div className="space-y-4">
              <TextInputField
                control={form.control}
                name="name"
                label="اسم المنتج"
                placeholder="أدخل اسم المنتج"
                description="الاسم الذي سيظهر في المنيو"
              />

              <TextareaField
                control={form.control}
                name="description"
                label="الوصف"
                placeholder="اكتب وصفاً للمنتج..."
                rows={3}
                description="وصف اختياري للموظفين والعملاء"
              />

              <TextInputField
                control={form.control}
                name="image_url"
                label="رابط الصورة"
                placeholder="https://example.com/image.jpg"
                description="رابط اختياري لصورة المنتج"
              />
            </div>

            {/* Pricing & Details */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <PriceInputField
                control={form.control}
                name="price"
                label="السعر"
                description="سعر بيع المنتج"
              />

              <NumberInputField
                control={form.control}
                name="preparation_time"
                label="وقت التحضير (بالدقائق)"
                min={1}
                max={120}
                description="الوقت التقديري للطهي/التحضير"
              />
            </div>

            {/* Category & Status */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <SelectField
                control={form.control}
                name="category_id"
                label="الصنف"
                options={categoryOptions}
                placeholder="اختر صنفاً"
                description="صنف المنتج لتنظيم المنيو"
              />

              <SelectField
                control={form.control}
                name="status"
                label="الحالة"
                options={productStatusOptions}
                description="المنتجات المفعّلة تظهر في المنيو"
              />
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 pt-4">
              <FormSubmitButton
                isLoading={isLoading}
                loadingText={isEditing ? "جاري التحديث..." : "جاري الإنشاء..."}
                className="flex-1"
              >
                {isEditing ? 'تحديث المنتج' : 'إضافة المنتج'}
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
