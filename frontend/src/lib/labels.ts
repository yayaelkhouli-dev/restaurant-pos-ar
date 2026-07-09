// ============================================================
// خريطة التسميات العربية للقيم الثابتة (الحالات/الأنواع/الأدوار)
// تُستخدم لعرض قيم قاعدة البيانات الإنجليزية بالعربية في الواجهة.
// كل دالة ترجع العربية، أو القيمة الأصلية لو مش معروفة (آمنة).
// ------------------------------------------------------------

const norm = (v?: string | null) => (v ?? '').toString().trim().toLowerCase().replace(/[\s-]+/g, '_')

// حالة الطلب
const ORDER_STATUS: Record<string, string> = {
  pending: 'في الانتظار',
  confirmed: 'مؤكّد',
  preparing: 'قيد التحضير',
  ready: 'جاهز',
  served: 'تم التقديم',
  completed: 'مكتمل',
  cancelled: 'ملغي',
  canceled: 'ملغي',
}
export const orderStatusLabel = (s?: string | null): string => ORDER_STATUS[norm(s)] ?? (s ?? '')

// نوع الطلب (يدعم الصيغ المختلفة: dine-in / dine_in / takeaway / take_out ...)
const ORDER_TYPE: Record<string, string> = {
  dine_in: 'صالة',
  dinein: 'صالة',
  take_away: 'تيك أواي',
  takeaway: 'تيك أواي',
  take_out: 'تيك أواي',
  takeout: 'تيك أواي',
  delivery: 'توصيل',
  pickup: 'استلام',
}
export const orderTypeLabel = (t?: string | null): string => ORDER_TYPE[norm(t)] ?? (t ?? '')

// طريقة الدفع
const PAYMENT_METHOD: Record<string, string> = {
  cash: 'نقدي',
  card: 'بطاقة',
  credit_card: 'بطاقة ائتمان',
  debit_card: 'بطاقة خصم',
  wallet: 'محفظة إلكترونية',
  mobile_wallet: 'محفظة إلكترونية',
  mobile: 'محفظة إلكترونية',
  bank_transfer: 'تحويل بنكي',
  online: 'دفع إلكتروني',
}
export const paymentMethodLabel = (m?: string | null): string => PAYMENT_METHOD[norm(m)] ?? (m ?? '')

// أدوار الموظفين
const ROLE: Record<string, string> = {
  admin: 'مدير النظام',
  manager: 'مدير',
  server: 'جرسون',
  waiter: 'جرسون',
  counter: 'كاشير',
  cashier: 'كاشير',
  kitchen: 'مطبخ',
  chef: 'شيف',
}
export const roleLabel = (r?: string | null): string => ROLE[norm(r)] ?? (r ?? '')

// حالة الطاولة
const TABLE_STATUS: Record<string, string> = {
  available: 'متاحة',
  occupied: 'مشغولة',
  reserved: 'محجوزة',
  maintenance: 'صيانة',
  seated: 'متجلَّس عليها',
}
export const tableStatusLabel = (s?: string | null): string => TABLE_STATUS[norm(s)] ?? (s ?? '')

// حالة المنتج
const PRODUCT_STATUS: Record<string, string> = {
  active: 'متاح',
  inactive: 'غير متاح',
}
export const productStatusLabel = (s?: string | null): string => PRODUCT_STATUS[norm(s)] ?? (s ?? '')
