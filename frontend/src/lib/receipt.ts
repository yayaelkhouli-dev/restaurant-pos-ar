import { formatCurrency } from '@/lib/utils'

export interface ReceiptItem {
  name: string
  quantity: number
  unitPrice: number
  total: number
  note?: string
}

export interface ReceiptData {
  restaurantName: string
  phone?: string
  address?: string
  header?: string
  footer?: string
  orderNumber: string
  orderTypeLabel?: string
  customerName?: string
  customerPhone?: string
  deliveryAddress?: string
  tableNumber?: string | number
  dateTime: string
  items: ReceiptItem[]
  subtotal: number
  taxAmount: number
  taxRate?: number // fraction, e.g. 0.10
  discountAmount?: number
  deliveryFee?: number
  total: number
  paymentMethodLabel?: string
  amountPaid?: number
  change?: number
  /** Thermal paper width in mm (58 or 80). Defaults to 80. */
  widthMm?: number
}

/**
 * The tax rate an order was actually charged, recovered from its own totals.
 * Never print the rate from current settings: it drifts the moment an admin
 * edits it, and old receipts would then show a percentage nobody ever paid.
 */
export function effectiveTaxRate(order: {
  subtotal: number
  tax_amount: number
  discount_amount?: number
}): number {
  const taxable = order.subtotal - (order.discount_amount ?? 0)
  if (taxable <= 0) return 0
  return order.tax_amount / taxable
}

function esc(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/**
 * Builds an RTL, thermal-printer-friendly (80mm) receipt as a full HTML document.
 * Kept as a pure function so it can be unit-tested / previewed.
 */
export function buildReceiptHTML(d: ReceiptData): string {
  const line = '<div class="sep"></div>'
  const rows = d.items
    .map(
      (it) => `
      <div class="item">
        <div class="item-line">
          <span class="qty">${it.quantity}×</span>
          <span class="name">${esc(it.name)}</span>
          <span class="amt">${formatCurrency(it.total)}</span>
        </div>
        ${it.note ? `<div class="note">${esc(it.note)}</div>` : ''}
      </div>`
    )
    .join('')

  const taxLabel = d.taxRate && d.taxRate > 0 ? `الضريبة (${Math.round(d.taxRate * 100)}%)` : 'الضريبة'
  const w = d.widthMm === 58 ? 58 : 80

  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8" />
<title>إيصال ${esc(d.orderNumber)}</title>
<style>
  @page { size: ${w}mm auto; margin: 0; }
  * { box-sizing: border-box; }
  body {
    font-family: "Tahoma", "Arial", sans-serif;
    width: ${w}mm;
    margin: 0 auto;
    padding: 6px 8px;
    color: #000;
    background: #fff;
    direction: rtl;
    font-size: 12px;
    line-height: 1.5;
  }
  .center { text-align: center; }
  .title { font-size: 16px; font-weight: bold; }
  .muted { color: #333; font-size: 11px; }
  .sep { border-top: 1px dashed #000; margin: 6px 0; }
  .meta { display: flex; justify-content: space-between; font-size: 11px; }
  .item { margin-bottom: 3px; }
  .item-line { display: flex; align-items: baseline; gap: 4px; }
  .item-line .qty { flex: 0 0 auto; font-weight: bold; }
  .item-line .name { flex: 1 1 auto; }
  .item-line .amt { flex: 0 0 auto; }
  .note { font-size: 10px; color: #444; padding-right: 18px; }
  .totals { font-size: 12px; }
  .totals .row { display: flex; justify-content: space-between; }
  .totals .grand { font-size: 15px; font-weight: bold; margin-top: 3px; }
  .foot { font-size: 11px; }
</style>
</head>
<body>
  <div class="center title">${esc(d.restaurantName)}</div>
  ${d.address ? `<div class="center muted">${esc(d.address)}</div>` : ''}
  ${d.phone ? `<div class="center muted">${esc(d.phone)}</div>` : ''}
  ${d.header ? `<div class="center muted">${esc(d.header)}</div>` : ''}
  ${line}
  <div class="meta"><span>رقم الطلب</span><span>${esc(d.orderNumber)}</span></div>
  <div class="meta"><span>التاريخ</span><span>${esc(d.dateTime)}</span></div>
  ${d.orderTypeLabel ? `<div class="meta"><span>النوع</span><span>${esc(d.orderTypeLabel)}</span></div>` : ''}
  ${d.tableNumber ? `<div class="meta"><span>الطاولة</span><span>${esc(String(d.tableNumber))}</span></div>` : ''}
  ${d.customerName ? `<div class="meta"><span>العميل</span><span>${esc(d.customerName)}</span></div>` : ''}
  ${d.customerPhone ? `<div class="meta"><span>التليفون</span><span>${esc(d.customerPhone)}</span></div>` : ''}
  ${d.deliveryAddress ? `<div class="meta"><span>العنوان</span><span>${esc(d.deliveryAddress)}</span></div>` : ''}
  ${line}
  ${rows}
  ${line}
  <div class="totals">
    <div class="row"><span>المجموع الفرعي</span><span>${formatCurrency(d.subtotal)}</span></div>
    ${d.discountAmount && d.discountAmount > 0 ? `<div class="row"><span>الخصم</span><span>- ${formatCurrency(d.discountAmount)}</span></div>` : ''}
    ${d.taxAmount > 0 ? `<div class="row"><span>${taxLabel}</span><span>${formatCurrency(d.taxAmount)}</span></div>` : ''}
    ${d.deliveryFee && d.deliveryFee > 0 ? `<div class="row"><span>رسوم التوصيل</span><span>${formatCurrency(d.deliveryFee)}</span></div>` : ''}
    <div class="row grand"><span>الإجمالي</span><span>${formatCurrency(d.total)}</span></div>
    ${d.paymentMethodLabel ? `<div class="row"><span>طريقة الدفع</span><span>${esc(d.paymentMethodLabel)}</span></div>` : ''}
    ${d.amountPaid != null ? `<div class="row"><span>المدفوع</span><span>${formatCurrency(d.amountPaid)}</span></div>` : ''}
    ${d.change != null && d.change > 0 ? `<div class="row"><span>الباقي</span><span>${formatCurrency(d.change)}</span></div>` : ''}
  </div>
  ${line}
  ${d.footer ? `<div class="center foot">${esc(d.footer)}</div>` : ''}
  <div class="center foot">شكراً لزيارتكم</div>
</body>
</html>`
}

/**
 * Prints a receipt via a hidden iframe (no popup, works with any Windows printer
 * including thermal printers set as default). Falls back to a new window if the
 * iframe approach is blocked.
 */
export function printReceipt(data: ReceiptData): void {
  const html = buildReceiptHTML(data)

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
    // Fallback: open in a new window
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

  const cleanup = () => {
    // Give the print dialog time to grab the content before removing the frame
    setTimeout(() => {
      if (iframe.parentNode) iframe.parentNode.removeChild(iframe)
    }, 1000)
  }

  iframe.onload = () => {
    try {
      iframe.contentWindow?.focus()
      iframe.contentWindow?.print()
    } finally {
      cleanup()
    }
  }
}
