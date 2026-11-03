import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { ArrowLeft, Eye, FilePlus2, Pencil, Plus, Search, Trash2, X } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import { closeNotification, showConfirm, showError, showLoading, showSuccess, showTextInput, showWarning } from '@/utils/notifications'
import { billingRequest, dateInputValue, formatIdDate, formatIdr, todayInputValue } from '@/utils/billingApi'
import { ACTION_BUTTON_CLASSES, getSemanticStatusClass } from '@/utils/semanticTokens'

type InvoiceItem = { id?: string; sourceItemId?: string | null; description: string; quantity: string | number; unit: string; unitPrice: string | number; discount: string | number; taxRate: string | number; subtotal?: string; taxAmount?: string; total?: string }
type SourceQuote = { id: string; number: string; recipient: string; items: Array<{ id: string; description: string; quantity: number; unit: string; unitPrice: number; discount?: number; taxRate?: number }> }
type POOption = { id: string; poNumber: string; recipient: string; status: string; quotationId: string | null; quotation?: { id: string; number: string; recipient: string } | null }
type Invoice = {
  id: string; number: string; customerName: string; issueDate: string | null; dueDate: string; status: string; subtotal: string; taxAmount: string; total: string; paidAmount: string; balance: string; overpayment: string; notes: string | null; purchaseOrderId: string | null; quotationId: string | null
  purchaseOrder?: { id: string; poNumber: string } | null; quotation?: { id: string; number: string } | null; items: InvoiceItem[]; statusHistory: Array<{ fromStatus: string | null; toStatus: string; note: string | null; createdAt: string }>
}
type InvoiceForm = { number: string; customerName: string; issueDate: string; dueDate: string; purchaseOrderId: string; quotationId: string; notes: string; items: InvoiceItem[] }

const today = todayInputValue()
const emptyItem = (): InvoiceItem => ({ description: '', quantity: 1, unit: 'pcs', unitPrice: 0, discount: 0, taxRate: 0 })
const statusLabels: Record<string, string> = { DRAFT: 'Draft', ISSUED: 'Issued', PARTIALLY_PAID: 'Partially Paid', PAID: 'Paid', OVERDUE: 'Overdue', CANCELLED: 'Cancelled', REVIEW_REQUIRED: 'Perlu Ditinjau' }
const statusClass: Record<string, string> = {
  DRAFT: getSemanticStatusClass('Draft'),
  ISSUED: getSemanticStatusClass('Issued'),
  PARTIALLY_PAID: getSemanticStatusClass('Partial'),
  PAID: getSemanticStatusClass('Paid'),
  OVERDUE: getSemanticStatusClass('Overdue'),
  CANCELLED: getSemanticStatusClass('Cancelled'),
  REVIEW_REQUIRED: getSemanticStatusClass('Pending'),
}

function blankForm(nextNumber: string): InvoiceForm {
  const due = new Date()
  due.setDate(due.getDate() + 30)
  return { number: nextNumber, customerName: '', issueDate: today, dueDate: `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, '0')}-${String(due.getDate()).padStart(2, '0')}`, purchaseOrderId: '', quotationId: '', notes: '', items: [emptyItem()] }
}

function suggestedNumber(rows: Invoice[]) {
  const year = new Date().getFullYear()
  const prefix = `INV-${year}-`
  const maxSeq = rows.reduce((max, invoice) => {
    if (!invoice.number.startsWith(prefix)) return max
    const parsed = Number.parseInt(invoice.number.slice(prefix.length), 10)
    return Number.isFinite(parsed) && parsed > max ? parsed : max
  }, 0)
  return `${prefix}${String(maxSeq + 1).padStart(3, '0')}`
}

function estimateTotal(items: InvoiceItem[]) {
  return items.reduce((sum, item) => {
    const subtotal = Math.max(0, Number(item.quantity || 0) * Number(item.unitPrice || 0) - Number(item.discount || 0))
    return sum + subtotal + subtotal * Number(item.taxRate || 0) / 100
  }, 0)
}

export default function InvoicePage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [rows, setRows] = useState<Invoice[]>([])
  const [quotes, setQuotes] = useState<SourceQuote[]>([])
  const [purchaseOrders, setPurchaseOrders] = useState<POOption[]>([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [loading, setLoading] = useState(true)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editing, setEditing] = useState<Invoice | null>(null)
  const [selected, setSelected] = useState<Invoice | null>(null)
  const [form, setForm] = useState<InvoiceForm>(blankForm(''))

  const loadRows = useCallback(async () => {
    const params = new URLSearchParams()
    if (search.trim()) params.set('search', search.trim())
    if (statusFilter) params.set('status', statusFilter)
    if (dateFrom) params.set('from', dateFrom)
    if (dateTo) params.set('to', dateTo)
    setRows(await billingRequest<Invoice[]>(`/invoices?${params.toString()}`))
  }, [search, statusFilter, dateFrom, dateTo])

  useEffect(() => {
    let active = true
    Promise.all([
      billingRequest<Invoice[]>('/invoices'),
      billingRequest<SourceQuote[]>('/quotations'),
      billingRequest<POOption[]>('/purchase-orders'),
    ]).then(([invoices, quotationRows, poRows]) => {
      if (!active) return
      setRows(invoices)
      setQuotes(quotationRows)
      setPurchaseOrders(poRows)
      const requestedPO = (location.state as { purchaseOrderId?: string } | null)?.purchaseOrderId
      if (requestedPO) {
        const po = poRows.find((item) => item.id === requestedPO)
        if (po) {
          const next = blankForm(suggestedNumber(invoices))
          next.purchaseOrderId = po.id
          next.quotationId = po.quotationId || ''
          next.customerName = po.recipient
          const quote = quotationRows.find((item) => item.id === po.quotationId)
          if (quote) {
            next.items = quote.items.map((item) => ({
              sourceItemId: item.id,
              description: item.description,
              quantity: item.quantity,
              unit: item.unit,
              unitPrice: item.unitPrice,
              discount: item.discount || 0,
              taxRate: item.taxRate || 0,
            }))
          }
          setSelected(null)
          setEditing(null)
          setForm(next)
          setIsFormOpen(true)
        }
      }
    }).catch((error) => {
      if (active) void showError('Invoice belum dapat dimuat', error instanceof Error ? error.message : 'Periksa koneksi backend.')
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [location.state])

  useEffect(() => {
    if (loading) return
    void loadRows().catch((error) => showError('Pencarian invoice gagal', error instanceof Error ? error.message : 'Silakan coba kembali.'))
  }, [loadRows, loading])

  const startNew = () => {
    const next = blankForm(suggestedNumber(rows))
    const requestedPO = (location.state as { purchaseOrderId?: string } | null)?.purchaseOrderId
    if (requestedPO) {
      const po = purchaseOrders.find((item) => item.id === requestedPO)
      if (po) {
        next.purchaseOrderId = po.id
        next.quotationId = po.quotationId || ''
        next.customerName = po.recipient
        const quote = quotes.find((item) => item.id === po.quotationId)
        if (quote) next.items = quote.items.map((item) => ({ sourceItemId: item.id, description: item.description, quantity: item.quantity, unit: item.unit, unitPrice: item.unitPrice, discount: item.discount || 0, taxRate: item.taxRate || 0 }))
      }
    }
    setSelected(null); setEditing(null); setForm(next); setIsFormOpen(true)
  }

  const editInvoice = (invoice: Invoice) => {
    setSelected(null); setEditing(invoice)
    setForm({ number: invoice.number, customerName: invoice.customerName, issueDate: dateInputValue(invoice.issueDate), dueDate: dateInputValue(invoice.dueDate), purchaseOrderId: invoice.purchaseOrderId || '', quotationId: invoice.quotationId || '', notes: invoice.notes || '', items: invoice.items.map((item) => ({ ...item, quantity: String(item.quantity), unitPrice: String(item.unitPrice), discount: String(item.discount), taxRate: String(item.taxRate) })) })
    setIsFormOpen(true)
  }

  const selectPO = (id: string) => {
    const po = purchaseOrders.find((item) => item.id === id)
    const quote = quotes.find((item) => item.id === (po?.quotationId || ''))
    setForm((current) => ({
      ...current,
      purchaseOrderId: id,
      quotationId: po?.quotationId || '',
      customerName: po?.recipient || current.customerName,
      items: quote?.items.map((item) => ({ sourceItemId: item.id, description: item.description, quantity: item.quantity, unit: item.unit, unitPrice: item.unitPrice, discount: item.discount || 0, taxRate: item.taxRate || 0 })) || current.items,
    }))
  }

  const selectQuote = (id: string) => {
    const quote = quotes.find((item) => item.id === id)
    setForm((current) => ({
      ...current,
      quotationId: id,
      purchaseOrderId: '',
      customerName: quote?.recipient || current.customerName,
      items: quote?.items.map((item) => ({ sourceItemId: item.id, description: item.description, quantity: item.quantity, unit: item.unit, unitPrice: item.unitPrice, discount: item.discount || 0, taxRate: item.taxRate || 0 })) || current.items,
    }))
  }

  const saveInvoice = async (event: FormEvent) => {
    event.preventDefault()
    if (!form.number.trim() || !form.customerName.trim() || !form.dueDate || !form.items.length) {
      await showWarning('Data belum lengkap', 'Nomor, pelanggan, tanggal jatuh tempo, dan minimal satu item wajib diisi.')
      return
    }
    const body = { ...form }
    showLoading(editing ? 'Menyimpan draft invoice...' : 'Membuat draft invoice...')
    try {
      const saved = await billingRequest<Invoice>(editing ? `/invoices/${editing.id}` : '/invoices', { method: editing ? 'PUT' : 'POST', body: JSON.stringify(body) })
      closeNotification(); setIsFormOpen(false); setEditing(null); setSelected(saved)
      await loadRows()
      await showSuccess(editing ? 'Draft invoice diperbarui' : 'Draft invoice berhasil dibuat')
    } catch (error) {
      closeNotification()
      await showError('Invoice belum disimpan', error instanceof Error ? error.message : 'Periksa koneksi backend.')
    }
  }

  const issueInvoice = async (invoice: Invoice) => {
    if (!(await showConfirm('Terbitkan invoice?', `Invoice ${invoice.number} akan dikunci sebagai dokumen terbit.`, 'Ya, terbitkan'))) return
    showLoading('Menerbitkan invoice...')
    try {
      const updated = await billingRequest<Invoice>(`/invoices/${invoice.id}/issue`, { method: 'PATCH', body: '{}' })
      closeNotification(); setSelected(updated); await loadRows(); await showSuccess('Invoice berhasil diterbitkan')
    } catch (error) { closeNotification(); await showError('Invoice belum diterbitkan', error instanceof Error ? error.message : 'Periksa koneksi backend.') }
  }

  const cancelInvoice = async (invoice: Invoice) => {
    const reason = await showTextInput('Batalkan invoice', 'Alasan pembatalan')
    if (!reason) return
    if (!(await showConfirm('Konfirmasi pembatalan invoice?', 'Invoice hanya dapat dibatalkan setelah semua pembayarannya dibatalkan.', 'Ya, batalkan'))) return
    showLoading('Membatalkan invoice...')
    try {
      const updated = await billingRequest<Invoice>(`/invoices/${invoice.id}/cancel`, { method: 'PATCH', body: JSON.stringify({ reason }) })
      closeNotification(); setSelected(updated); await loadRows(); await showSuccess('Invoice dibatalkan')
    } catch (error) { closeNotification(); await showError('Invoice belum dibatalkan', error instanceof Error ? error.message : 'Periksa pembayaran terkait.') }
  }

  const rowsCount = useMemo(() => rows.length, [rows.length])

  return (
    <div className="flex min-w-0 flex-col gap-20 py-8">
      <header className="flex flex-wrap items-start justify-between gap-12">
        <div>
          <h1 className="text-[2.6rem] font-semibold text-[#000000]">Invoice</h1>
          <p className="mt-4 text-[1.4rem] text-[#000000]">Kelola tagihan dari PO, Quotation, atau transaksi langsung.</p>
        </div>
        <div className="flex flex-wrap gap-8">
          <button
            type="button"
            onClick={() => navigate('/po')}
            className="inline-flex min-h-[4.2rem] items-center gap-8 rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] px-16 py-8 text-[1.4rem] font-medium text-[#000000] transition-colors hover:bg-[#F1F5F9]"
          >
            <ArrowLeft size={16} className="text-[#000000]" />
            <span>PO</span>
          </button>
          <button
            type="button"
            onClick={startNew}
            className="inline-flex min-h-[4.2rem] items-center gap-8 rounded-xl border border-[#0000FF] bg-[#0000FF] px-16 py-8 text-[1.4rem] font-semibold text-white transition-colors hover:bg-[#0000D0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0000FF]"
          >
            <Plus size={17} className="text-white" />
            <span>Buat Invoice</span>
          </button>
        </div>
      </header>

      <section className="min-w-0 rounded-2xl border border-[#E2E8F0] bg-[#FFFFFF] p-20">
        <div className="mb-16 flex flex-wrap items-center gap-12">
          <label className="relative w-full max-w-[38rem]">
            <Search aria-hidden="true" className="absolute left-14 top-1/2 -translate-y-1/2 text-[#64748B]" size={16} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Cari no. invoice, pelanggan, PO, atau quotation"
              className="min-h-[4.2rem] w-full rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] py-10 pl-40 pr-14 text-[1.4rem] leading-[1.4] tracking-[0.01rem] text-[#475569] placeholder:text-[#64748B] focus:border-[#0000FF] focus:outline-none focus:ring-2 focus:ring-[#E2E8F0]"
            />
          </label>
          <select
            aria-label="Filter status invoice"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="min-h-[4.2rem] rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] px-14 py-10 text-[1.35rem] leading-[1.4] tracking-[0.01rem] text-[#000000] focus:border-[#0000FF] focus:outline-none focus:ring-2 focus:ring-[#E2E8F0]"
          >
            <option value="">Semua status</option>
            {Object.entries(statusLabels).map(([key, value]) => (
              <option key={key} value={key}>{value}</option>
            ))}
          </select>
          <div className="flex flex-wrap items-center gap-10">
            <label className="inline-flex items-center gap-8 text-[1.35rem] leading-[1.4] text-[#000000]">
              <span>Dari</span>
              <input
                type="date"
                aria-label="Dari tanggal"
                value={dateFrom}
                onChange={(event) => setDateFrom(event.target.value)}
                className="min-h-[4.2rem] rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] px-12 py-10 text-[1.35rem] leading-[1.4] tracking-[0.01rem] text-[#000000] focus:border-[#0000FF] focus:outline-none focus:ring-2 focus:ring-[#E2E8F0]"
              />
            </label>
            <label className="inline-flex items-center gap-8 text-[1.35rem] leading-[1.4] text-[#000000]">
              <span>Sampai</span>
              <input
                type="date"
                aria-label="Sampai tanggal"
                value={dateTo}
                onChange={(event) => setDateTo(event.target.value)}
                className="min-h-[4.2rem] rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] px-12 py-10 text-[1.35rem] leading-[1.4] tracking-[0.01rem] text-[#000000] focus:border-[#0000FF] focus:outline-none focus:ring-2 focus:ring-[#E2E8F0]"
              />
            </label>
          </div>
          <span className="ml-auto whitespace-nowrap text-[1.35rem] font-medium leading-[1.4] text-[#000000]">
            {rowsCount} invoice
          </span>
        </div>

        <div className="invoice-table-container">
          <table className="invoice-table text-left">
            <thead>
              <tr>
                <th className="text-left">No. Invoice</th>
                <th className="text-left">Pelanggan</th>
                <th className="text-left">Tanggal</th>
                <th className="text-left">Jatuh Tempo</th>
                <th className="text-left">PO / Quotation</th>
                <th className="col-number">Total</th>
                <th className="col-number">Dibayar</th>
                <th className="col-number">Sisa</th>
                <th className="text-center">Status</th>
                <th className="text-center">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={10} className="px-16 py-32 text-center text-[1.4rem] text-[#000000]">
                    Memuat invoice…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-16 py-32 text-center text-[1.4rem] text-[#000000]">
                    Belum ada invoice. Buat draft dari PO atau Quotation.
                  </td>
                </tr>
              ) : (
                rows.map((invoice) => {
                  const referenceCode = invoice.purchaseOrder?.poNumber || invoice.quotation?.number || '—'
                  return (
                    <tr
                      key={invoice.id}
                      className="border-b border-[#E2E8F0] last:border-b-0 transition-colors hover:bg-[#F8FAFC]"
                    >
                      <td className="font-semibold text-[#000000]">
                        {invoice.number}
                      </td>
                      <td className="font-medium text-[#000000]">
                        {invoice.customerName}
                      </td>
                      <td className="whitespace-nowrap text-[#000000]">
                        {formatIdDate(invoice.issueDate)}
                      </td>
                      <td className="whitespace-nowrap text-[#000000]">
                        {formatIdDate(invoice.dueDate)}
                      </td>
                      <td className="text-[#000000]">
                        {referenceCode}
                      </td>
                      <td className="col-number font-semibold text-[#000000]">
                        {formatIdr(invoice.total)}
                      </td>
                      <td className="col-number text-[#000000]">
                        {formatIdr(invoice.paidAmount)}
                      </td>
                      <td className="col-number font-medium text-[#000000]">
                        {formatIdr(invoice.balance)}
                      </td>
                      <td className="whitespace-nowrap text-center">
                        <span
                          className={clsx(
                            'inline-flex items-center justify-center whitespace-nowrap rounded-full px-10 py-4 text-[1.2rem] font-semibold leading-[1.35]',
                            statusClass[invoice.status] || statusClass.DRAFT,
                          )}
                        >
                          {statusLabels[invoice.status] || invoice.status}
                        </span>
                      </td>
                      <td className="whitespace-nowrap text-center">
                        <button
                          type="button"
                          onClick={() => setSelected(invoice)}
                          className={ACTION_BUTTON_CLASSES.preview}
                        >
                          <Eye size={14} />
                          <span>Detail</span>
                        </button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {isFormOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-16" onMouseDown={(event) => { if (event.target === event.currentTarget) setIsFormOpen(false) }}><form onSubmit={saveInvoice} className="max-h-[92vh] w-full max-w-[110rem] overflow-auto rounded-2xl border border-[#E2E8F0] bg-[#FFFFFF] p-24 shadow-xl">
        <div className="mb-16 flex items-start justify-between gap-12"><div><h2 className="text-[2.4rem] font-semibold leading-[1.3] text-[#000000]">{editing ? 'Edit Draft Invoice' : 'Buat Invoice'}</h2><p className="mt-4 leading-[1.45] text-[#000000]">Data item disimpan sebagai snapshot dan tidak mengikuti perubahan Quotation.</p></div><button type="button" onClick={() => { setIsFormOpen(false); setEditing(null) }} aria-label="Tutup form invoice" className="rounded-xl p-8 text-[#000000] transition-colors hover:bg-[#F1F5F9] hover:text-[#000000]"><X size={18} /></button></div>
        <div className="grid gap-14 md:grid-cols-2">
          <Field label="Nomor Invoice"><input required maxLength={100} value={form.number} onChange={(event) => setForm({ ...form, number: event.target.value })} className="control" /></Field>
          <Field label="Pelanggan"><input required maxLength={250} value={form.customerName} onChange={(event) => setForm({ ...form, customerName: event.target.value })} className="control" /></Field>
          <Field label="PO Asal (opsional)"><select value={form.purchaseOrderId} onChange={(event) => selectPO(event.target.value)} className="control"><option value="">Tidak terkait PO</option>{purchaseOrders.filter((po) => po.status !== 'CANCELLED').map((po) => <option key={po.id} value={po.id}>{po.poNumber} — {po.recipient}</option>)}</select></Field>
          <Field label="Quotation Asal (opsional)"><select value={form.quotationId} onChange={(event) => selectQuote(event.target.value)} className="control"><option value="">Tidak terkait Quotation</option>{quotes.map((quote) => <option key={quote.id} value={quote.id}>{quote.number} — {quote.recipient}</option>)}</select></Field>
          <Field label="Tanggal Invoice (draft)"><input type="date" value={form.issueDate} onChange={(event) => setForm({ ...form, issueDate: event.target.value })} className="control" /></Field>
          <Field label="Tanggal Jatuh Tempo"><input required type="date" value={form.dueDate} onChange={(event) => setForm({ ...form, dueDate: event.target.value })} className="control" /></Field>
          <Field label="Catatan"><textarea rows={2} maxLength={2000} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} className="control" /></Field>
        </div>
        <section className="mt-16 rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] p-16"><div className="mb-12 flex flex-wrap items-center justify-between gap-8"><div><h3 className="text-[1.8rem] font-semibold leading-[1.3] text-[#000000]">Rincian Invoice</h3><p className="mt-2 text-[1.35rem] leading-[1.4] text-[#0000FF]">Periksa harga dan pajak sebelum menyimpan draft.</p></div><button type="button" onClick={() => setForm({ ...form, items: [...form.items, emptyItem()] })} className="inline-flex min-h-[3.8rem] items-center gap-6 rounded-xl border border-[#0000FF] bg-[#0000FF] px-14 py-8 text-[1.35rem] font-semibold leading-[1.4] text-white shadow-sm transition-colors hover:bg-[#0000D0]"><Plus size={15} className="text-white" />Tambah Item</button></div>
          <div className="space-y-10">{form.items.map((item, index) => <div key={item.id || index} className="grid min-w-0 gap-10 rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] p-14 sm:grid-cols-2 lg:grid-cols-7">
            <label className="min-w-0 lg:col-span-2"><span className="mb-6 block text-[1.3rem] font-medium leading-[1.4] text-[#000000]">Barang / Jasa</span><input required value={item.description} onChange={(event) => updateItem(index, 'description', event.target.value)} className="control" /></label>
            <label><span className="mb-6 block text-[1.3rem] font-medium leading-[1.4] text-[#000000]">Jumlah</span><input required type="number" min="0.001" step="0.001" value={item.quantity} onChange={(event) => updateItem(index, 'quantity', event.target.value)} className="control" /></label>
            <label><span className="mb-6 block text-[1.3rem] font-medium leading-[1.4] text-[#000000]">Satuan</span><input required value={item.unit} onChange={(event) => updateItem(index, 'unit', event.target.value)} className="control" /></label>
            <label><span className="mb-6 block text-[1.3rem] font-medium leading-[1.4] text-[#000000]">Harga Satuan</span><input required type="number" min="0" step="0.01" value={item.unitPrice} onChange={(event) => updateItem(index, 'unitPrice', event.target.value)} className="control" /></label>
            <label><span className="mb-6 block text-[1.3rem] font-medium leading-[1.4] text-[#000000]">Diskon</span><input type="number" min="0" step="0.01" value={item.discount} onChange={(event) => updateItem(index, 'discount', event.target.value)} className="control" /></label>
            <div className="flex items-end gap-8"><label className="min-w-0 flex-1"><span className="mb-6 block text-[1.3rem] font-medium leading-[1.4] text-[#000000]">Pajak (%)</span><input type="number" min="0" max="999.99" step="0.01" value={item.taxRate} onChange={(event) => updateItem(index, 'taxRate', event.target.value)} className="control" /></label><button type="button" disabled={form.items.length === 1} onClick={async () => { if (await showConfirm('Hapus item invoice?', 'Item ini akan dihapus dari rincian invoice.', 'Ya, hapus')) { setForm({ ...form, items: form.items.filter((_, itemIndex) => itemIndex !== index) }) } }} aria-label={`Hapus item ${index + 1}`} className={clsx(ACTION_BUTTON_CLASSES.deleteIconOnly, 'mb-2 h-[3.8rem] w-[3.8rem] disabled:opacity-40')}><Trash2 size={15} /></button></div>
          </div>)}</div>
          <div className="mt-12 flex justify-end"><p className="rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] px-16 py-12 text-right text-[1.35rem] leading-[1.4] text-[#000000]">Perkiraan total <strong className="ml-8 mt-4 block text-[1.8rem] tabular-nums text-[#000000]">{formatIdr(estimateTotal(form.items))}</strong></p></div>
        </section>
        <div className="mt-18 flex justify-end gap-10"><button type="button" onClick={() => { setIsFormOpen(false); setEditing(null) }} className="min-h-[4.2rem] rounded-xl border border-[#B91C1C] bg-[#B91C1C] px-16 py-10 text-[1.4rem] font-semibold leading-[1.4] text-white shadow-sm transition-colors hover:bg-[#991B1B]">Batal</button><button type="submit" className="inline-flex min-h-[4.2rem] items-center gap-6 rounded-xl border border-[#0000FF] bg-[#0000FF] px-18 py-10 text-[1.4rem] font-semibold leading-[1.4] text-white shadow-sm transition-colors hover:bg-[#0000D0]"><FilePlus2 size={16} className="text-white" />Simpan Draft</button></div>
      </form></div>}

      {selected && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-16" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(null) }}><div className="max-h-[90vh] w-full max-w-[96rem] overflow-auto rounded-2xl border border-[#E2E8F0] bg-[#FFFFFF] p-24 shadow-xl">
        <div className="mb-16 flex items-start justify-between gap-12"><div><h2 className="text-[2.4rem] font-semibold leading-[1.3] text-[#000000]">Detail Invoice</h2><p className="mt-4 leading-[1.4] text-[#000000]">{selected.number} · {selected.customerName}</p></div><div className="flex items-center gap-8"><span className={clsx('rounded-md px-10 py-4 text-[1.25rem] font-medium leading-[1.35]', statusClass[selected.status] || statusClass.DRAFT)}>{statusLabels[selected.status] || selected.status}</span><button type="button" onClick={() => setSelected(null)} aria-label="Tutup detail invoice" className="rounded-xl p-8 text-[#000000] transition-colors hover:bg-[#F1F5F9] hover:text-[#000000]"><X size={18} /></button></div></div>
        <div className="grid gap-12 sm:grid-cols-2 lg:grid-cols-4"><Info label="Tanggal Invoice" value={formatIdDate(selected.issueDate)} /><Info label="Jatuh Tempo" value={formatIdDate(selected.dueDate)} /><Info label="PO / Quotation" value={selected.purchaseOrder?.poNumber || selected.quotation?.number || '—'} /><Info label="Total" value={formatIdr(selected.total)} /><Info label="Dibayar Terverifikasi" value={formatIdr(selected.paidAmount)} /><Info label="Sisa Tagihan" value={formatIdr(selected.balance)} /><Info label="Subtotal" value={formatIdr(selected.subtotal)} /><Info label="Pajak" value={formatIdr(selected.taxAmount)} /></div>
        {selected.notes && <p className="mt-12 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-14 leading-[1.5] text-[#000000]">{selected.notes}</p>}
        <div className="mt-16 overflow-x-auto rounded-xl border border-[#E2E8F0]"><table className="w-full min-w-[72rem] text-left text-[1.35rem]"><thead className="border-b border-[#E2E8F0] bg-[#F8FAFC] text-[#000000]"><tr><th className="px-14 py-12 font-semibold leading-[1.4]">Barang / Jasa</th><th className="px-14 py-12 font-semibold leading-[1.4]">Jumlah</th><th className="px-14 py-12 font-semibold leading-[1.4]">Satuan</th><th className="px-14 py-12 text-right font-semibold leading-[1.4]">Harga Satuan</th><th className="px-14 py-12 text-right font-semibold leading-[1.4]">Diskon</th><th className="px-14 py-12 text-right font-semibold leading-[1.4]">Pajak</th><th className="px-14 py-12 text-right font-semibold leading-[1.4]">Total</th></tr></thead><tbody>{selected.items.map((item, index) => <tr key={item.id || index} className="border-t border-[#E2E8F0]"><td className="px-14 py-12 leading-[1.45] text-[#000000]">{item.description}</td><td className="px-14 py-12 leading-[1.45] text-[#000000]">{item.quantity}</td><td className="px-14 py-12 leading-[1.45] text-[#000000]">{item.unit}</td><td className="px-14 py-12 text-right leading-[1.45] tabular-nums text-[#000000]">{formatIdr(item.unitPrice)}</td><td className="px-14 py-12 text-right leading-[1.45] tabular-nums text-[#000000]">{formatIdr(item.discount)}</td><td className="px-14 py-12 text-right leading-[1.45] tabular-nums text-[#000000]">{item.taxRate}%</td><td className="px-14 py-12 text-right font-semibold leading-[1.45] tabular-nums text-[#000000]">{formatIdr(item.total)}</td></tr>)}</tbody></table></div>
        {selected.statusHistory?.length > 0 && <section className="mt-16 rounded-xl border border-[#E2E8F0] p-16"><h3 className="mb-8 font-semibold leading-[1.4] text-[#000000]">Riwayat Status</h3><ul className="space-y-6 text-[1.35rem] leading-[1.45] text-[#000000]">{selected.statusHistory.map((entry, index) => <li key={`${entry.createdAt}-${index}`}>{formatIdDate(entry.createdAt)} · {statusLabels[entry.fromStatus || ''] || '—'} → {statusLabels[entry.toStatus] || entry.toStatus}{entry.note ? ` — ${entry.note}` : ''}</li>)}</ul></section>}
        <div className="mt-18 flex flex-wrap justify-end gap-10">{selected.status === 'DRAFT' && <><button type="button" onClick={() => editInvoice(selected)} className="btn-action-edit inline-flex min-h-[4rem] items-center gap-6 rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] px-14 py-10 font-semibold leading-[1.4] text-[#0000FF] transition-colors hover:bg-[#F8FAFC]"><Pencil size={14} /><span>Edit Draft</span></button><button type="button" onClick={() => void issueInvoice(selected)} className="min-h-[4rem] rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] px-16 py-10 font-semibold leading-[1.4] text-[#0000FF] transition-colors hover:bg-[#F8FAFC]">Terbitkan</button></>}{selected.status !== 'DRAFT' && selected.status !== 'CANCELLED' && <button type="button" onClick={() => navigate('/bukti-bayar', { state: { invoiceId: selected.id } })} className="min-h-[4rem] rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] px-16 py-10 font-semibold leading-[1.4] text-[#0000FF] transition-colors hover:bg-[#F8FAFC]">Catat Pembayaran</button>}{selected.status !== 'CANCELLED' && <button type="button" onClick={() => void cancelInvoice(selected)} className="min-h-[4rem] rounded-xl border border-[#B91C1C] bg-[#B91C1C] px-14 py-10 font-semibold leading-[1.4] text-white shadow-sm transition-colors hover:bg-[#991B1B]">Batalkan Invoice</button>}<button type="button" onClick={() => setSelected(null)} className="min-h-[4rem] rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] px-16 py-10 leading-[1.4] text-[#000000] transition-colors hover:bg-[#F1F5F9]">Tutup</button></div>
      </div></div>}
    </div>
  )

  function updateItem(index: number, key: keyof InvoiceItem, value: string) {
    setForm((current) => ({ ...current, items: current.items.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item) }))
  }
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block min-w-0"><span className="mb-6 block text-[1.4rem] font-medium leading-[1.4] text-[#000000]">{label}</span>{children}</label>
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-14"><p className="text-[1.3rem] leading-[1.4] text-[#000000]">{label}</p><p className="mt-4 break-words text-[1.4rem] font-medium leading-[1.45] text-[#000000]">{value}</p></div>
}
