import { z } from 'zod'

// Common validation patterns
export const emailSchema = z.string().email('صيغة البريد الإلكتروني غير صحيحة')
export const passwordSchema = z.string().min(6, 'كلمة المرور يجب أن تكون 6 أحرف على الأقل')
export const requiredStringSchema = z.string().min(1, 'هذا الحقل مطلوب')
export const positiveNumberSchema = z.number().min(0, 'يجب أن يكون رقمًا موجبًا')
export const priceSchema = z.number().min(0.01, 'السعر يجب أن يكون أكبر من 0')

// User/Staff related schemas
export const userRoles = ['admin', 'manager', 'server', 'counter', 'kitchen'] as const
export const userRoleSchema = z.enum(userRoles)

export const createUserSchema = z.object({
  username: requiredStringSchema.min(3, 'اسم المستخدم يجب أن يكون 3 أحرف على الأقل'),
  email: emailSchema,
  password: passwordSchema,
  first_name: requiredStringSchema,
  last_name: requiredStringSchema,
  role: userRoleSchema,
})

export const updateUserSchema = z.object({
  id: z.string().or(z.number()),
  username: requiredStringSchema.min(3, 'اسم المستخدم يجب أن يكون 3 أحرف على الأقل').optional(),
  email: emailSchema.optional(),
  password: passwordSchema.optional(),
  first_name: requiredStringSchema.optional(),
  last_name: requiredStringSchema.optional(),
  role: userRoleSchema.optional(),
})

// Product related schemas
export const productStatusValues = ['active', 'inactive'] as const
export const productStatusSchema = z.enum(productStatusValues)

export const createProductSchema = z.object({
  name: requiredStringSchema.min(2, 'اسم المنتج يجب أن يكون حرفين على الأقل'),
  description: z.string().optional(),
  price: priceSchema,
  category_id: z.string().or(z.number()).transform(val => Number(val)),
  image_url: z.string().url().optional().or(z.literal('')),
  status: productStatusSchema.default('active'),
  preparation_time: z.number().min(0).max(120).default(5), // minutes
})

export const updateProductSchema = createProductSchema.partial().extend({
  id: z.string().or(z.number()),
})

// Category related schemas
export const createCategorySchema = z.object({
  name: requiredStringSchema.min(2, 'اسم الصنف يجب أن يكون حرفين على الأقل'),
  description: z.string().optional(),
  image_url: z.string().url().optional().or(z.literal('')),
  sort_order: z.number().min(0).default(0),
})

export const updateCategorySchema = createCategorySchema.partial().extend({
  id: z.string().or(z.number()),
})

// Table related schemas
export const tableStatusValues = ['available', 'occupied', 'reserved', 'maintenance'] as const
export const tableStatusSchema = z.enum(tableStatusValues)

export const createTableSchema = z.object({
  table_number: requiredStringSchema.min(1, 'رقم الطاولة مطلوب'),
  seats: z.number().min(1, 'الطاولة يجب أن تحتوي على كرسي واحد على الأقل').max(20, 'أقصى عدد 20 كرسي للطاولة'),
  status: tableStatusSchema.default('available'),
  location: z.string().optional(),
})

export const updateTableSchema = createTableSchema.partial().extend({
  id: z.string().or(z.number()),
})

// Order related schemas
export const orderTypeValues = ['dine-in', 'take-away', 'delivery'] as const
export const orderTypeSchema = z.enum(orderTypeValues)

export const orderStatusValues = ['pending', 'confirmed', 'preparing', 'ready', 'served', 'cancelled'] as const
export const orderStatusSchema = z.enum(orderStatusValues)

export const orderItemSchema = z.object({
  product_id: z.number(),
  quantity: z.number().min(1, 'الكمية يجب أن تكون 1 على الأقل'),
  notes: z.string().optional(),
})

export const createOrderSchema = z.object({
  table_id: z.number().optional(),
  customer_name: z.string().optional(),
  order_type: orderTypeSchema,
  notes: z.string().optional(),
  items: z.array(orderItemSchema).min(1, 'الطلب يجب أن يحتوي على صنف واحد على الأقل'),
})

// Settings schemas
export const posSettingsSchema = z.object({
  restaurant_name: requiredStringSchema,
  address: z.string().optional(),
  phone: z.string().optional(),
  email: emailSchema.optional(),
  tax_rate: z.number().min(0).max(1), // 0.08 for 8%
  currency_symbol: requiredStringSchema.default('ج.م'),
  receipt_footer: z.string().optional(),
  auto_print_receipts: z.boolean().default(false),
  order_timeout_minutes: z.number().min(1).max(120).default(30),
})

// Login schema
export const loginSchema = z.object({
  username: requiredStringSchema,
  password: requiredStringSchema,
})

// Export types
export type CreateUserData = z.infer<typeof createUserSchema>
export type UpdateUserData = z.infer<typeof updateUserSchema>
export type CreateProductData = z.infer<typeof createProductSchema>
export type UpdateProductData = z.infer<typeof updateProductSchema>
export type CreateCategoryData = z.infer<typeof createCategorySchema>
export type UpdateCategoryData = z.infer<typeof updateCategorySchema>
export type CreateTableData = z.infer<typeof createTableSchema>
export type UpdateTableData = z.infer<typeof updateTableSchema>
export type CreateOrderData = z.infer<typeof createOrderSchema>
export type LoginData = z.infer<typeof loginSchema>
export type POSSettingsData = z.infer<typeof posSettingsSchema>
