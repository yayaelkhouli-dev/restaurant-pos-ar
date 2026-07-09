import { formatCurrency } from '@/lib/utils'

export interface ZReportData {
  restaurantName: string
  shift: {
    id: string
    status: string
    opened_at: string
    closed_at?: string
    opened_by?: string
  }
  sales: {
    orders_count: number
    subtotal: number
    discount_amount: number
    tax_amount: number
    delivery_fee: number
    total_amount: number
  }
  payments: {
    methods: Array<{ payment_method: string; collected: number; refunded: number; net: number }>
    total_collected: number
    total_refunded: number
    net: number
  }
  cash: {
    opening_cash: number
    net_cash?: number
    expected_cash: number
    closing_cash?: number
    difference?: number
  }
  /** Thermal paper width in mm (58 or 80). Defaults to 80. */
  widthMm?: number
}

const METHOD_LABELS: Record<string, string> = {
  cash: 'نقدي',
  credit_card: 'بطاقة ائتمان',
  debit_card: 'بطاقة خصم',
  digital_wallet: 'محفظة رقمية',
}

function esc(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function fmtDate(v?: string): string {
  if (!v) return '—'
  const d = new Date(v)
  return isNaN(d.getTime()) ? '—' : d.toLocaleString('ar-EG')
}

/** Builds the end-of-day (Z) report as an RTL, 80mm-thermal-friendly document. */
export function buildZReportHTML(d: ZReportData): string {
  const line = '<div class="sep"></div>'

  const methodRows = d.payments.methods
    .map(
      (m) => `
      <div class="row"><span>${esc(METHOD_LABELS[m.payment_method] || m.payment_method)}</span><span>${formatCurrency(m.net)}</span></div>
      ${m.refunded !== 0 ? `<div class="row sub"><span>منها مرتجع</span><span>${formatCurrency(m.refunded)}</span></div>` : ''}`
    )
    .join('')

  const diff = d.cash.difference
  const diffLabel = diff == null ? '' : diff === 0 ? '(مطابق)' : diff > 0 ? '(زيادة)' : '(عجز)'
  const w = d.widthMm === 58 ? 58 : 80

  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8" />
<title>تقرير آخر اليوم</title>
<style>
  @page { size: ${w}mm auto; margin: 0; }
  * { box-sizing: border-box; }
  body {
    font-family: "Tahoma", "Arial", sans-serif;
    width: ${w}mm; margin: 0 auto; padding: 6px 8px;
    color: #000; background: #fff; direction: rtl;
    font-size: 12px; line-height: 1.5;
  }
  .center { text-align: center; }
  .title { font-size: 16px; font-weight: bold; }
  .subtitle { font-size: 13px; font-weight: bold; margin-top: 2px; }
  .muted { color: #333; font-size: 11px; }
  .sep { border-top: 1px dashed #000; margin: 6px 0; }
  .row { display: flex; justify-content: space-between; }
  .row.sub { font-size: 10px; color: #444; padding-right: 10px; }
  .grand { font-size: 14px; font-weight: bold; }
  .section { font-weight: bold; margin: 4px 0 2px; }
</style>
</head>
<body>
  <div class="center title">${esc(d.restaurantName)}</div>
  <div class="center subtitle">تقرير آخر اليوم (Z)</div>
  ${line}
  <div class="row"><span>الوردية</span><span>${esc(d.shift.id.slice(0, 8))}</span></div>
  <div class="row"><span>فتحها</span><span>${esc(d.shift.opened_by || '—')}</span></div>
  <div class="row"><span>وقت الفتح</span><span>${fmtDate(d.shift.opened_at)}</span></div>
  <div class="row"><span>وقت الإغلاق</span><span>${fmtDate(d.shift.closed_at)}</span></div>
  ${line}

  <div class="section">المبيعات</div>
  <div class="row"><span>عدد الطلبات</span><span>${d.sales.orders_count}</span></div>
  <div class="row"><span>المجموع الفرعي</span><span>${formatCurrency(d.sales.subtotal)}</span></div>
  ${d.sales.discount_amount > 0 ? `<div class="row"><span>الخصومات</span><span>- ${formatCurrency(d.sales.discount_amount)}</span></div>` : ''}
  ${d.sales.tax_amount > 0 ? `<div class="row"><span>الضريبة</span><span>${formatCurrency(d.sales.tax_amount)}</span></div>` : ''}
  ${d.sales.delivery_fee > 0 ? `<div class="row"><span>رسوم التوصيل</span><span>${formatCurrency(d.sales.delivery_fee)}</span></div>` : ''}
  <div class="row grand"><span>إجمالي المبيعات</span><span>${formatCurrency(d.sales.total_amount)}</span></div>
  ${line}

  <div class="section">التحصيل حسب طريقة الدفع</div>
  ${methodRows || '<div class="row"><span>لا يوجد</span><span>—</span></div>'}
  ${d.payments.total_refunded !== 0 ? `<div class="row"><span>إجمالي المرتجعات</span><span>${formatCurrency(d.payments.total_refunded)}</span></div>` : ''}
  <div class="row grand"><span>صافي التحصيل</span><span>${formatCurrency(d.payments.net)}</span></div>
  ${line}

  <div class="section">درج النقدية</div>
  <div class="row"><span>النقدية الافتتاحية</span><span>${formatCurrency(d.cash.opening_cash)}</span></div>
  <div class="row"><span>صافي حركة النقدية</span><span>${formatCurrency(d.cash.net_cash ?? d.cash.expected_cash - d.cash.opening_cash)}</span></div>
  <div class="row grand"><span>المتوقع في الدرج</span><span>${formatCurrency(d.cash.expected_cash)}</span></div>
  ${d.cash.closing_cash != null ? `<div class="row"><span>المعدود فعلياً</span><span>${formatCurrency(d.cash.closing_cash)}</span></div>` : ''}
  ${diff != null ? `<div class="row grand"><span>الفرق ${diffLabel}</span><span>${formatCurrency(diff)}</span></div>` : ''}
  ${line}
  <div class="center muted">طُبع في ${new Date().toLocaleString('ar-EG')}</div>
</body>
</html>`
}

/** Prints the Z-report via a hidden iframe (works with any Windows printer). */
export function printZReport(data: ZReportData): void {
  const html = buildZReportHTML(data)

  const iframe = document.createElement('iframe')
  iframe.setAttribute('aria-hidden', 'true')
  iframe.style.position = 'fixed'
  iframe.style.right = '0'
  iframe.style.bottom = '0'
  iframe.style.width = '0'
  iframe.style.height = '0'
  iframe.style.border = '0'
  document.body.appendChild(iframe)

  const doc = iframe.contentWindow?.document
  if (!doc) {
    const w = window.open('', '_blank', 'width=400,height=600')
    if (w) {
      w.document.write(html)
      w.document.close()
      w.focus()
      w.print()
    }
    document.body.removeChild(iframe)
    return
  }

  doc.open()
  doc.write(html)
  doc.close()

  iframe.onload = () => {
    try {
      iframe.contentWindow?.focus()
      iframe.contentWindow?.print()
    } finally {
      setTimeout(() => {
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe)
      }, 1000)
    }
  }
}
