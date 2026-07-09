import { toast } from "@/hooks/use-toast"
import { formatCurrency } from "@/lib/utils"

export const toastHelpers = {
  success: (title: string, description?: string) => {
    return toast({
      title,
      description,
      variant: "success",
      duration: 4000,
    })
  },

  error: (title: string, description?: string) => {
    return toast({
      title,
      description,
      variant: "destructive",
      duration: 6000,
    })
  },

  warning: (title: string, description?: string) => {
    return toast({
      title,
      description,
      variant: "warning",
      duration: 5000,
    })
  },

  info: (title: string, description?: string) => {
    return toast({
      title,
      description,
      variant: "default",
      duration: 4000,
    })
  },

  // مساعدات استجابة الـ API
  // action = اسم العملية بالعربي مع "ال" (مثل: الحذف، الإضافة، التعديل)
  // entity = اسم العنصر بالعربي مع "ال" (مثل: المنتج، الصنف، الطاولة)
  apiSuccess: (action: string, entity?: string) => {
    return toastHelpers.success(
      `تم ${action} بنجاح`,
      entity ? `${entity}: تم ${action} بنجاح.` : undefined
    )
  },

  apiError: (action: string, error?: any, entity?: string) => {
    const errorMessage = error?.message || error?.toString() || 'حدث خطأ غير متوقع'
    return toastHelpers.error(
      `فشل ${action}`,
      entity ? `تعذّر ${action} (${entity}). ${errorMessage}` : errorMessage
    )
  },

  // عمليات الكاشير الشائعة
  orderCreated: (orderNumber?: string) => {
    return toastHelpers.success(
      "تم إنشاء الطلب",
      orderNumber ? `تم إنشاء الطلب رقم ${orderNumber} بنجاح.` : "تم إنشاء الطلب بنجاح."
    )
  },

  paymentProcessed: (amount?: number) => {
    return toastHelpers.success(
      "تمت معالجة الدفع",
      amount ? `تم دفع ${formatCurrency(amount)} بنجاح.` : "تمت معالجة الدفع بنجاح."
    )
  },

  userCreated: (username: string) => {
    return toastHelpers.success(
      "تم إنشاء الموظف",
      `تم إنشاء الموظف "${username}" بنجاح.`
    )
  },

  userDeleted: (username: string) => {
    return toastHelpers.success(
      "تم حذف الموظف",
      `تم حذف الموظف "${username}" بنجاح.`
    )
  },

  productCreated: (productName: string) => {
    return toastHelpers.success(
      "تمت إضافة المنتج",
      `تمت إضافة "${productName}" إلى المنيو.`
    )
  },

  categoryCreated: (categoryName: string) => {
    return toastHelpers.success(
      "تم إنشاء الصنف",
      `تم إنشاء الصنف "${categoryName}" بنجاح.`
    )
  },

  productUpdated: (productName: string) => {
    return toastHelpers.success(
      "تم تحديث المنتج",
      `تم تحديث "${productName}" بنجاح.`
    )
  },

  categoryUpdated: (categoryName: string) => {
    return toastHelpers.success(
      "تم تحديث الصنف",
      `تم تحديث الصنف "${categoryName}" بنجاح.`
    )
  },

  tableCreated: (tableNumber: string) => {
    return toastHelpers.success(
      "تم إنشاء الطاولة",
      `تم إنشاء الطاولة ${tableNumber} بنجاح.`
    )
  },

  tableUpdated: (tableNumber: string) => {
    return toastHelpers.success(
      "تم تحديث الطاولة",
      `تم تحديث الطاولة ${tableNumber} بنجاح.`
    )
  },

  // التحقق وأخطاء النماذج
  validationError: (message: string) => {
    return toastHelpers.error(
      "خطأ في البيانات",
      message
    )
  },

  networkError: () => {
    return toastHelpers.error(
      "خطأ في الشبكة",
      "تأكد من الاتصال بالإنترنت وحاول مرة أخرى."
    )
  },

  permissionDenied: () => {
    return toastHelpers.error(
      "غير مصرّح",
      "ليس لديك صلاحية لتنفيذ هذا الإجراء."
    )
  }
}
