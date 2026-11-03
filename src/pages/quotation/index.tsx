import { useCallback, useEffect, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import {
  closeNotification,
  showConfirm,
  showError,
  showInfo,
  showLoading,
  showSuccess,
  showTextInput,
  showWarning,
} from '@/utils/notifications'
import {
  CalendarDays,
  ChevronDown,
  Download,
  Edit3,
  Eye,
  Filter,
  FileSpreadsheet,
  FileText,
  Paperclip,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import clsx from 'clsx'
import { apiUrl, billingRequest, fileUrl, formatIdDate, todayInputValue } from '@/utils/billingApi'
import {
  ACTION_BUTTON_CLASSES,
  DOCUMENT_CATEGORY_TOKENS,
  getDocumentCategoryStyle,
  getSemanticStatusClass,
} from '@/utils/semanticTokens'
import CreateNewSuratModal from '@/pages/surat/components/CreateNewSuratModal'
import UploadTemplateModal, { type UploadedTemplateRecord } from '@/pages/surat/components/UploadTemplateModal'
import pdfMake from 'pdfmake/build/pdfmake'
import * as pdfFonts from 'pdfmake/build/vfs_fonts'

pdfMake.vfs = pdfFonts.vfs

type QuotationStatus =
  | 'Draft'
  | 'Sent'
  | 'Follow Up'
  | 'Approved'
  | 'Rejected'
  | 'Revised'

type QuotationType = 'Barang' | 'Jasa' | 'Barang & Jasa'
type FollowUpStatus = 'Belum dijadwalkan' | 'Terjadwal' | 'Selesai' | 'Jatuh tempo'

type QuotationItem = {
  id: string
  description: string
  quantity: number
  unit: string
  unitPrice: number
  discount?: number
  taxRate?: number
  subtotal?: number
}

type QuotationRecord = {
  id: string
  recipient: string
  address: string
  city: string
  date: string
  number: string
  validityDays: string
  senderCompany: string
  introduction: string
  signer: string
  position: string
  email: string
  phone: string
  taxEnabled: boolean
  taxMode: string
  taxRate: number
  taxManualAmount: number
  signatureImage?: string | null
  stampImage?: string | null
  type: QuotationType
  status: QuotationStatus
  title: string | null
  validUntil: string | null
  notes: string | null
  followUpDate: string | null
  followUpStatus: FollowUpStatus
  followUpNotes: string | null
  templateId?: string | null
  template?: { id: string; name: string; fileFormat: string; originalFilename: string } | null
  createdAt: string
  updatedAt: string
  items: QuotationItem[]
  attachments?: Array<{ id: string; name: string; url: string; mimeType: string; size: number }>
  purchaseOrders?: Array<{ id: string; poNumber: string; status: string }>
}

type QuotationDraft = Omit<QuotationRecord, 'createdAt' | 'updatedAt' | 'items' | 'attachments' | 'purchaseOrders'> & {
  items: QuotationItem[]
}

export interface UnifiedDocumentRow {
  id: string
  source: 'quotation' | 'letterDocument'
  type: string
  typeName: string
  templateSlug: string
  number: string
  title: string
  recipient: string
  date: string
  status: string
  templateId?: string | null
  template?: { id: string; name: string; fileFormat: string; originalFilename: string } | null
  createdAt: string
  updatedAt: string
  details?: {
    senderCompany?: string
    itemCount?: number
    purchaseOrderId?: string | null
    purchaseOrders?: Array<{ id: string; poNumber: string; status: string }>
    quotationType?: string
    followUpDate?: string | null
    followUpStatus?: string
  }
  supportedFormats: Array<'pdf' | 'xlsx' | 'docx'>
  route: string
  quotationRecord?: QuotationRecord
}

const statusOptions: QuotationStatus[] = ['Draft', 'Sent', 'Follow Up', 'Approved', 'Rejected', 'Revised']
const statusLabels: Record<QuotationStatus, string> = {
  Draft: 'Draft',
  Sent: 'Terkirim',
  'Follow Up': 'Perlu tindak lanjut',
  Approved: 'Disetujui',
  Rejected: 'Ditolak',
  Revised: 'Direvisi',
}
const typeOptions: QuotationType[] = ['Barang', 'Jasa', 'Barang & Jasa']
const followUpOptions: FollowUpStatus[] = ['Belum dijadwalkan', 'Terjadwal', 'Selesai', 'Jatuh tempo']

const localFallbackKey = 'luma-quotation-manager'

function uid() {
  return `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`
}

function formatDate(value: string | null | undefined, fallback = '—') {
  if (!value) return fallback
  const formatted = formatIdDate(value)
  return formatted === '—' ? fallback : formatted
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(value)
}

function getDefaultItem(): QuotationItem {
  return {
    id: uid(),
    description: '',
    quantity: 1,
    unit: 'pcs',
    unitPrice: 0,
    discount: 0,
    taxRate: 0,
    subtotal: 0,
  }
}

function createEmptyDraft(): QuotationDraft {
  return {
    id: '',
    recipient: '',
    address: '',
    city: '',
    date: todayInputValue(),
    number: '',
    validityDays: '30',
    senderCompany: 'PT Luma',
    introduction: '',
    signer: '',
    position: '',
    email: '',
    phone: '',
    taxEnabled: true,
    taxMode: 'manual',
    taxRate: 11,
    taxManualAmount: 0,
    signatureImage: null,
    stampImage: null,
    type: 'Barang & Jasa',
    status: 'Draft',
    title: '',
    validUntil: '',
    notes: '',
    followUpDate: '',
    followUpStatus: 'Belum dijadwalkan',
    followUpNotes: '',
    items: [getDefaultItem()],
  }
}

function getStatusClass(status: string) {
  return getSemanticStatusClass(status)
}

function getStatusLabel(status: string) {
  if (status in statusLabels) {
    return statusLabels[status as QuotationStatus]
  }
  return status || 'Draft'
}

function getTypeBadgeClass(type: string) {
  return getDocumentCategoryStyle(type).badgeClass
}

function getFollowUpClass(status: FollowUpStatus) {
  switch (status) {
    case 'Belum dijadwalkan':
      return getSemanticStatusClass('Draft')
    case 'Terjadwal':
      return getSemanticStatusClass('Terjadwal')
    case 'Jatuh tempo':
      return getSemanticStatusClass('Pending')
    case 'Selesai':
      return getSemanticStatusClass('Selesai')
    default:
      return getSemanticStatusClass('Draft')
  }
}

function calculateLineTotal(item: QuotationItem) {
  const base = item.quantity * item.unitPrice - (item.discount ?? 0)
  const tax = base * ((item.taxRate ?? 0) / 100)
  return base + tax
}

function getSummaryTotals(items: QuotationItem[]) {
  return items.reduce((sum, item) => sum + calculateLineTotal(item), 0)
}

function getQuotationGrandTotal(record: Pick<QuotationRecord, 'items' | 'taxEnabled' | 'taxMode' | 'taxManualAmount'>) {
  const itemsTotal = getSummaryTotals(record.items)
  const hasItemTax = record.items.some((item) => (item.taxRate ?? 0) > 0)
  if (!hasItemTax && record.taxEnabled && record.taxMode === 'manual' && (record.taxManualAmount ?? 0) > 0) {
    return itemsTotal + Number(record.taxManualAmount)
  }
  return itemsTotal
}

function flattenForExport(rows: UnifiedDocumentRow[]) {
  return rows.map((item) => {
    const q = item.quotationRecord
    return {
      'No. Dokumen': item.number,
      'Jenis Surat': item.typeName,
      'Template': item.template?.name || 'Bawaan Sistem',
      'Penerima / Customer': item.recipient,
      'Jenis Penawaran': q?.type || item.details?.quotationType || '-',
      'Tanggal': formatDate(item.date),
      'Status': getStatusLabel(item.status),
      'Follow Up Date': q ? formatDate(q.followUpDate) : '-',
      'Follow Up Status': q ? q.followUpStatus : '-',
      'Deskripsi / Perihal': item.title || '-',
      'Subtotal': q ? getSummaryTotals(q.items) : 0,
      'Total': q ? getQuotationGrandTotal(q) : 0,
      'Nomor PO terkait': q?.purchaseOrders?.length
        ? q.purchaseOrders.map((po) => po.poNumber).join(', ')
        : item.details?.purchaseOrderId || '-',
      'Dibuat': formatDate(item.createdAt),
      'Diperbarui': formatDate(item.updatedAt),
    }
  })
}

export default function QuotationPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [rows, setRows] = useState<QuotationRecord[]>([])
  const [letterDocs, setLetterDocs] = useState<UnifiedDocumentRow[]>([])
  const [uploadedTemplates, setUploadedTemplates] = useState<UploadedTemplateRecord[]>([])
  const [selected, setSelected] = useState<QuotationRecord | null>(null)
  const [draft, setDraft] = useState<QuotationDraft>(() => createEmptyDraft())

  // Modals
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false)
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false)
  const [templateModalCategory, setTemplateModalCategory] = useState<string>('ALL')
  const [templateModalSelectedId, setTemplateModalSelectedId] = useState<string>('')
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [isDetailOpen, setIsDetailOpen] = useState(false)
  const [isStatusEditorOpen, setIsStatusEditorOpen] = useState(false)

  // Preview Modal
  const [previewDoc, setPreviewDoc] = useState<UnifiedDocumentRow | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewPdfUrl, setPreviewPdfUrl] = useState<string | null>(null)

  // Filters
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [letterTypeFilter, setLetterTypeFilter] = useState('ALL')
  const [statusFilter, setStatusFilter] = useState('Semua')
  const [typeFilter, setTypeFilter] = useState('Semua')
  const [followUpFilter, setFollowUpFilter] = useState('Semua')
  const [dateFilter, setDateFilter] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [isOfflineFallback, setIsOfflineFallback] = useState(false)
  const [isAttachmentUploading, setIsAttachmentUploading] = useState(false)
  const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null)

  const loadUploadedTemplates = useCallback(async () => {
    try {
      const data = await billingRequest<UploadedTemplateRecord[]>('/letter-templates')
      setUploadedTemplates(data || [])
    } catch {
      setUploadedTemplates([])
    }
  }, [])

  const loadRows = useCallback(async (notifyError = true) => {
    setLoading(true)

    try {
      const [quotationRes, unifiedRes] = await Promise.all([
        fetch(apiUrl('/quotations')),
        fetch(apiUrl('/letter-documents/unified')),
      ])

      if (!quotationRes.ok) {
        throw new Error('Gagal memuat quotation')
      }

      const quotationData = (await quotationRes.json()) as QuotationRecord[]
      setRows(quotationData)
      setIsOfflineFallback(false)

      if (unifiedRes.ok) {
        const unifiedData = (await unifiedRes.json()) as UnifiedDocumentRow[]
        setLetterDocs(
          (unifiedData || []).filter((item) => item.source === 'letterDocument'),
        )
      } else {
        setLetterDocs([])
      }

      try {
        localStorage.setItem(localFallbackKey, JSON.stringify(quotationData))
      } catch {
        // The backend data remains available in memory without a local cache.
      }
    } catch {
      let cached: string | null = null
      try {
        cached = localStorage.getItem(localFallbackKey)
      } catch {
        cached = null
      }
      let fallback: QuotationRecord[] = []
      try {
        fallback = cached ? JSON.parse(cached) : []
      } catch {
        localStorage.removeItem(localFallbackKey)
      }
      setRows(fallback)
      setLetterDocs([])
      setIsOfflineFallback(true)
      if (notifyError) {
        await showWarning(
          'Backend tidak dapat dihubungi',
          fallback.length
            ? 'Data lokal ditampilkan. Perubahan belum tersinkron dengan backend.'
            : 'Data quotation belum dapat dimuat. Periksa koneksi backend lalu coba lagi.',
        )
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadRows()
    void loadUploadedTemplates()
  }, [loadRows, loadUploadedTemplates])

  useEffect(() => {
    if (searchParams.get('openTemplates') === '1') {
      setIsTemplateModalOpen(true)
      const next = new URLSearchParams(searchParams)
      next.delete('openTemplates')
      setSearchParams(next, { replace: true })
    }
  }, [searchParams, setSearchParams])

  // Merge Quotation rows with LetterDocument rows into a single unified document list
  const unifiedRows: UnifiedDocumentRow[] = useMemo(() => {
    const quotationMapped: UnifiedDocumentRow[] = rows.map((q) => ({
      id: q.id,
      source: 'quotation',
      type: 'SURAT_PENAWARAN',
      typeName: 'Surat Penawaran',
      templateSlug: 'surat-penawaran',
      number: q.number,
      title: q.title || q.introduction || `Penawaran untuk ${q.recipient}`,
      recipient: q.recipient,
      date: q.date,
      status: q.status || 'Draft',
      templateId: q.templateId || null,
      template: q.template || null,
      createdAt: q.createdAt,
      updatedAt: q.updatedAt,
      details: {
        senderCompany: q.senderCompany,
        itemCount: q.items?.length || 0,
        purchaseOrders: q.purchaseOrders || [],
        quotationType: q.type,
        followUpDate: q.followUpDate,
        followUpStatus: q.followUpStatus,
      },
      supportedFormats: ['pdf', 'xlsx', 'docx'],
      route: `/quotation/surat-penawaran?id=${q.id}`,
      quotationRecord: q,
    }))

    const combined = [...quotationMapped, ...letterDocs]
    return combined.sort((a, b) => {
      const timeA = new Date(a.updatedAt || a.createdAt || 0).getTime()
      const timeB = new Date(b.updatedAt || b.createdAt || 0).getTime()
      return timeB - timeA
    })
  }, [rows, letterDocs])

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase()

    return unifiedRows.filter((item) => {
      const q = item.quotationRecord
      const matchesSearch =
        !term ||
        item.number.toLowerCase().includes(term) ||
        item.recipient.toLowerCase().includes(term) ||
        item.title?.toLowerCase().includes(term) ||
        item.typeName.toLowerCase().includes(term) ||
        (item.template?.name?.toLowerCase().includes(term) ?? false) ||
        (q?.introduction?.toLowerCase().includes(term) ?? false)

      const matchesLetterType = letterTypeFilter === 'ALL' || item.type === letterTypeFilter

      const matchesStatus =
        statusFilter === 'Semua' ||
        item.status.toLowerCase() === statusFilter.toLowerCase()

      const matchesType =
        typeFilter === 'Semua' ||
        (q ? q.type === typeFilter : false)

      const matchesFollowUp =
        followUpFilter === 'Semua' ||
        (q
          ? (followUpFilter === 'Belum dijadwalkan' && q.followUpStatus === 'Belum dijadwalkan') ||
            (followUpFilter === 'Terjadwal' && q.followUpStatus === 'Terjadwal') ||
            (followUpFilter === 'Jatuh tempo' && q.followUpStatus === 'Jatuh tempo') ||
            (followUpFilter === 'Selesai' && q.followUpStatus === 'Selesai')
          : false)

      let matchesDate = true
      if (dateFilter !== 'all') {
        const today = todayInputValue()
        const target = (item.date || '').slice(0, 10)
        if (dateFilter === 'today') {
          matchesDate = target === today
        } else if (dateFilter === '7days') {
          const diff = Math.floor(
            (new Date(`${today}T12:00:00`).getTime() - new Date(`${target}T12:00:00`).getTime()) / 86400000,
          )
          matchesDate = diff >= 0 && diff <= 7
        } else if (dateFilter === '30days') {
          const diff = Math.floor(
            (new Date(`${today}T12:00:00`).getTime() - new Date(`${target}T12:00:00`).getTime()) / 86400000,
          )
          matchesDate = diff >= 0 && diff <= 30
        }
      }
      const matchesDateRange = (!dateFrom || item.date >= dateFrom) && (!dateTo || item.date <= dateTo)

      return (
        matchesSearch &&
        matchesLetterType &&
        matchesStatus &&
        matchesType &&
        matchesFollowUp &&
        matchesDate &&
        matchesDateRange
      )
    })
  }, [unifiedRows, search, letterTypeFilter, statusFilter, typeFilter, followUpFilter, dateFilter, dateFrom, dateTo])

  const pageSize = 10
  const pageCount = Math.max(1, Math.ceil(filteredRows.length / pageSize))
  const currentPage = Math.min(page, pageCount)
  const visibleRows = filteredRows.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  const stats = useMemo(() => {
    return {
      total: unifiedRows.length,
      draft: unifiedRows.filter((item) => item.status.toLowerCase() === 'draft').length,
      followUp: rows.filter((item) => item.status === 'Follow Up' || item.followUpStatus === 'Jatuh tempo').length,
    }
  }, [unifiedRows, rows])

  const activeFilterCount = [
    letterTypeFilter !== 'ALL',
    statusFilter !== 'Semua',
    typeFilter !== 'Semua',
    followUpFilter !== 'Semua',
    dateFilter !== 'all',
    Boolean(dateFrom || dateTo),
  ].filter(Boolean).length

  // Create New now opens Template Selection modal (Section 3)
  const openCreateTemplateModal = () => {
    setTemplateModalCategory('ALL')
    setTemplateModalSelectedId('')
    setIsTemplateModalOpen(true)
  }

  const openEditForm = (record: QuotationRecord) => {
    setDraft({
      ...record,
      id: record.id,
      title: record.title ?? '',
      notes: record.notes ?? '',
      validUntil: record.validUntil ?? '',
      followUpDate: record.followUpDate ?? '',
      followUpNotes: record.followUpNotes ?? '',
      items: record.items.map((item) => ({ ...item, id: item.id ?? uid() })),
    })
    setIsFormOpen(true)
  }

  const handleSaveQuotation = async () => {
    if (isOfflineFallback) {
      await showWarning(
        'Backend tidak tersedia',
        'Data cache hanya untuk melihat. Hubungkan backend dan muat ulang sebelum mengubah quotation.',
      )
      return
    }
    if (!draft.number.trim() || !draft.recipient.trim()) {
      await showWarning('Data belum lengkap', 'Isi nomor quotation dan nama penerima/customer terlebih dahulu.')
      return
    }

    const payload = {
      ...draft,
      items: draft.items.map((item) => ({
        ...item,
        quantity: Number(item.quantity || 1),
        unitPrice: Number(item.unitPrice || 0),
        discount: Number(item.discount || 0),
        taxRate: Number(item.taxRate || 0),
      })),
    }

    showLoading('Menyimpan perubahan...')
    try {
      const response = await fetch(apiUrl(`/quotations/${draft.id}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const errorBody = (await response.json().catch(() => null)) as { error?: string } | null
        throw new Error(errorBody?.error || 'Gagal menyimpan quotation')
      }

      const savedRecord = (await response.json()) as QuotationRecord
      const nextRows = rows.some((item) => item.id === savedRecord.id)
        ? rows.map((item) => (item.id === savedRecord.id ? savedRecord : item))
        : [savedRecord, ...rows]
      setRows(nextRows)
      setSelected((curr) => (curr?.id === savedRecord.id ? savedRecord : curr))
      try {
        localStorage.setItem(localFallbackKey, JSON.stringify(nextRows))
      } catch {
        // The backend remains the source of truth when local caching is unavailable.
      }
      closeNotification()
      setIsFormOpen(false)
      await showSuccess('Quotation berhasil diperbarui')
    } catch (error) {
      closeNotification()
      await showError(
        'Quotation belum tersimpan',
        error instanceof Error
          ? `${error.message} Data formulir tetap terbuka agar Anda dapat mencoba lagi.`
          : 'Backend tidak dapat menyimpan perubahan. Data formulir tetap terbuka agar Anda dapat mencoba lagi.',
      )
    }
  }

  const handleDeleteDocument = async (row: UnifiedDocumentRow) => {
    if (isOfflineFallback) {
      await showWarning(
        'Backend tidak tersedia',
        'Cache lokal bersifat hanya baca. Hubungkan backend dan muat ulang sebelum menghapus dokumen.',
      )
      return
    }
    if (
      !(await showConfirm(
        `Hapus ${row.typeName}?`,
        `Dokumen ${row.number} akan dihapus permanen. Tindakan ini tidak dapat dibatalkan.`,
        'Ya, hapus',
      ))
    ) {
      return
    }

    try {
      showLoading('Menghapus dokumen...')
      if (row.source === 'quotation') {
        const response = await fetch(apiUrl(`/quotations/${row.id}`), { method: 'DELETE' })
        if (!response.ok) {
          const errorBody = (await response.json().catch(() => null)) as { error?: string } | null
          throw new Error(errorBody?.error || 'Gagal menghapus quotation')
        }
        const nextRows = rows.filter((item) => item.id !== row.id)
        setRows(nextRows)
        try {
          localStorage.setItem(localFallbackKey, JSON.stringify(nextRows))
        } catch {
          // ignore
        }
      } else {
        await billingRequest(`/letter-documents/${row.id}`, { method: 'DELETE' })
        setLetterDocs((curr) => curr.filter((item) => item.id !== row.id))
      }
      closeNotification()
      await showSuccess('Dokumen berhasil dihapus')
    } catch (error) {
      closeNotification()
      await showError(
        'Dokumen belum terhapus',
        error instanceof Error ? error.message : 'Backend belum berhasil menghapus data.',
      )
    }
  }

  const generateLetterPdfDef = async (type: string, payload: unknown) => {
    if (type === 'SURAT_PERMINTAAN_BARANG') {
      const { generatePdfDefinition } = await import(
        '@/pages/surat/suratPermintaanBarang/generatePDFDefenition'
      )
      return generatePdfDefinition(payload as Parameters<typeof generatePdfDefinition>[0])
    }
    if (type === 'SURAT_PESANAN') {
      const { generatePdfDefinition } = await import(
        '@/pages/surat/suratPesanan/generatePDFDefenition'
      )
      return generatePdfDefinition(payload as Parameters<typeof generatePdfDefinition>[0])
    }
    if (type === 'SURAT_PERJANJIAN_JUAL_BELI') {
      const { generatePdfDefinition } = await import(
        '@/pages/surat/suratPerjanjianJualBeli/generatePDFDefenition'
      )
      return generatePdfDefinition(payload as Parameters<typeof generatePdfDefinition>[0])
    }
    return null
  }

  const toQuotationExportData = (fullQuote: QuotationRecord) => ({
    recipient: fullQuote.recipient || '',
    address: fullQuote.address || '',
    city: fullQuote.city || '',
    date: fullQuote.date || '',
    number: fullQuote.number || '',
    validityDays: String(fullQuote.validityDays || '30'),
    senderCompany: fullQuote.senderCompany || 'PT Sinergi Karunia Sejahtera',
    introduction: fullQuote.introduction || '',
    signer: fullQuote.signer || '',
    position: fullQuote.position || '',
    email: fullQuote.email || '',
    phone: fullQuote.phone || '',
    taxEnabled: fullQuote.taxEnabled !== false,
    taxMode: (fullQuote.taxMode === 'percentage' ? 'percent' : 'manual') as 'percent' | 'manual',
    taxRate: fullQuote.taxRate ?? 11,
    taxManualAmount: fullQuote.taxManualAmount ?? 0,
    signatureImage: fullQuote.signatureImage || undefined,
    stampImage: fullQuote.stampImage || undefined,
    items: (fullQuote.items || []).map((it) => ({
      id: it.id,
      description: it.description || '',
      quantity: Number(it.quantity || 1),
      unit: it.unit || 'pcs',
      unitPrice: Number(it.unitPrice || 0),
    })),
  })

  const handleOpenPreview = async (doc: UnifiedDocumentRow) => {
    setPreviewDoc(doc)
    setPreviewLoading(true)
    setPreviewPdfUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return null
    })

    try {
      if (doc.source === 'letterDocument') {
        const fullDoc = await billingRequest<{ type: string; payload: unknown }>(
          `/letter-documents/${doc.id}`,
        )
        if (fullDoc?.payload) {
          const docDef = await generateLetterPdfDef(fullDoc.type, fullDoc.payload)
          if (docDef) {
            pdfMake.createPdf(docDef).getBlob((blob) => {
              setPreviewPdfUrl(URL.createObjectURL(blob))
            })
          }
        }
      } else if (doc.source === 'quotation') {
        const fullQuote =
          doc.quotationRecord || (await billingRequest<QuotationRecord>(`/quotations/${doc.id}`))
        if (fullQuote) {
          const { createQuotationPdf } = await import('@/pages/surat/suratPenawaran/exportPdf')
          const blob = await createQuotationPdf(toQuotationExportData(fullQuote))
          setPreviewPdfUrl(URL.createObjectURL(blob))
        }
      }
    } catch {
      // Fallback summary shown in modal
    } finally {
      setPreviewLoading(false)
    }
  }

  const handleDownloadDocument = async (
    doc: UnifiedDocumentRow,
    format: 'pdf' | 'xlsx' | 'docx' = 'pdf',
  ) => {
    showLoading(`Menyiapkan ${format.toUpperCase()}...`)
    try {
      if (doc.source === 'letterDocument') {
        const fullDoc = await billingRequest<{
          type: string
          number: string
          payload: unknown
        }>(`/letter-documents/${doc.id}`)

        if (!fullDoc?.payload) throw new Error('Data surat tidak ditemukan.')

        const docDef = await generateLetterPdfDef(fullDoc.type, fullDoc.payload)
        if (docDef) {
          pdfMake.createPdf(docDef).download(`${doc.number || 'surat'}.pdf`)
          closeNotification()
          await showSuccess('Dokumen berhasil diunduh')
          return
        }
      } else if (doc.source === 'quotation') {
        const fullQuote =
          doc.quotationRecord || (await billingRequest<QuotationRecord>(`/quotations/${doc.id}`))
        if (!fullQuote) throw new Error('Data penawaran tidak ditemukan.')

        const quoteData = toQuotationExportData(fullQuote)
        const { downloadBlob, quotationFileName } = await import(
          '@/pages/surat/suratPenawaran/quotationShared'
        )

        let file: Blob
        if (format === 'pdf') {
          const { createQuotationPdf } = await import('@/pages/surat/suratPenawaran/exportPdf')
          file = await createQuotationPdf(quoteData)
        } else if (format === 'docx') {
          const { createQuotationWord } = await import('@/pages/surat/suratPenawaran/exportWord')
          file = await createQuotationWord(quoteData)
        } else {
          const { createQuotationExcel } = await import('@/pages/surat/suratPenawaran/exportExcel')
          file = await createQuotationExcel(quoteData)
        }

        downloadBlob(file, quotationFileName(quoteData, format))
        closeNotification()
        await showSuccess('Dokumen berhasil diunduh')
        return
      }
      closeNotification()
    } catch (error) {
      closeNotification()
      await showError('Gagal mengunduh dokumen', error instanceof Error ? error.message : 'Periksa koneksi backend.')
    }
  }

  const handleDownloadUploadedTemplate = async (tpl: UploadedTemplateRecord) => {
    try {
      showLoading('Mengunduh file template...')
      const token = localStorage.getItem('token') || ''
      const headers: Record<string, string> = {}
      if (token) headers['Authorization'] = `Bearer ${token}`

      const res = await fetch(apiUrl(`/letter-templates/${tpl.id}/download`), {
        credentials: 'include',
        headers,
      })

      if (!res.ok) throw new Error('Gagal mengunduh file template.')

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = tpl.originalFilename
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)

      closeNotification()
      await showSuccess('File template berhasil diunduh')
    } catch (err) {
      closeNotification()
      await showError('Gagal Mengunduh', err instanceof Error ? err.message : 'Terjadi kesalahan')
    }
  }

  const handleDeleteTemplate = async (tpl: UploadedTemplateRecord) => {
    const confirmed = await showConfirm(
      'Hapus Template?',
      `Apakah Anda yakin ingin menghapus template "${tpl.name}"? Dokumen surat yang sudah pernah dibuat tidak akan terhapus.`,
      'Ya, Hapus Template',
    )
    if (!confirmed) return

    showLoading('Menghapus template...')
    try {
      await billingRequest(`/letter-templates/${tpl.id}`, { method: 'DELETE' })
      closeNotification()
      await showSuccess('Template berhasil dihapus')
      await loadUploadedTemplates()
    } catch (err) {
      closeNotification()
      await showError('Gagal Menghapus', err instanceof Error ? err.message : 'Terjadi kesalahan')
    }
  }

  const updateTransactionStatus = async (record: QuotationRecord, nextStatus: QuotationStatus) => {
    if (isOfflineFallback) {
      await showWarning('Backend tidak tersedia', 'Cache lokal bersifat hanya baca. Hubungkan backend dan muat ulang sebelum mengubah status.')
      return
    }
    if (nextStatus === record.status || updatingStatusId !== null) return
    setUpdatingStatusId(record.id)
    const confirmed = await showConfirm(
      'Ubah status transaksi?',
      `Status ${record.number} akan diubah dari “${statusLabels[record.status]}” menjadi “${statusLabels[nextStatus]}”.`,
      'Ya, ubah status',
    )
    if (!confirmed) {
      setUpdatingStatusId(null)
      return
    }

    showLoading('Menyimpan status transaksi...')
    try {
      const response = await fetch(apiUrl(`/quotations/${record.id}/status`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      })
      if (!response.ok) {
        const errorBody = (await response.json().catch(() => null)) as { error?: string } | null
        throw new Error(errorBody?.error || 'Status transaksi belum berhasil disimpan.')
      }

      const savedStatus = (await response.json()) as { status: QuotationStatus; updatedAt: string }
      const updated = { ...record, status: savedStatus.status, updatedAt: savedStatus.updatedAt }
      const nextRows = rows.map((row) => (row.id === record.id ? updated : row))
      setRows(nextRows)
      setSelected((current) => (current?.id === record.id ? updated : current))
      try {
        localStorage.setItem(localFallbackKey, JSON.stringify(nextRows))
      } catch {
        // Backend remains the source of truth when local cache is unavailable.
      }
      closeNotification()
      setIsStatusEditorOpen(false)
      await showSuccess('Status transaksi berhasil diperbarui', `${record.number}: ${statusLabels[nextStatus]}`)
    } catch (error) {
      closeNotification()
      await showError(
        'Status transaksi belum berubah',
        error instanceof Error ? error.message : 'Periksa koneksi backend lalu coba kembali.',
      )
    } finally {
      setUpdatingStatusId(null)
    }
  }

  const exportToExcel = () => {
    if (!filteredRows.length) {
      void showInfo('Tidak ada data dokumen', 'Sesuaikan filter atau tambahkan dokumen sebelum mengekspor.')
      return
    }

    try {
      const workbook = XLSX.utils.book_new()
      const worksheet = XLSX.utils.json_to_sheet(flattenForExport(filteredRows))
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Quotation')
      XLSX.writeFile(workbook, `quotation-${new Date().toISOString().slice(0, 10)}.xlsx`)
      void showSuccess('File Excel quotation berhasil dibuat')
    } catch {
      void showError('Ekspor gagal', 'File Excel quotation tidak dapat dibuat. Silakan coba kembali.')
    }
  }

  const createQuickIn = async () => {
    if (isOfflineFallback) {
      await showWarning('Backend tidak tersedia', 'PO tidak dapat dibuat dari data cache. Hubungkan backend dan muat ulang terlebih dahulu.')
      return
    }
    const poNumber = await showTextInput('Catat PO masuk', 'Nomor PO pelanggan')
    if (!poNumber) return
    const recipient = selected?.recipient || (await showTextInput('Catat PO masuk', 'Nama customer / penerima PO'))
    if (!recipient) return

    try {
      showLoading('Menyimpan PO...')
      const response = await fetch(apiUrl('/purchase-orders'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          poNumber,
          date: todayInputValue(),
          receivedAt: todayInputValue(),
          recipient,
          quotationId: selected?.id || null,
          notes: 'PO masuk cepat dari halaman Quotation.',
        }),
      })
      const result = (await response.json().catch(() => null)) as { error?: string } | null
      if (!response.ok) throw new Error(result?.error || 'PO tidak berhasil disimpan.')
      closeNotification()
      await loadRows(false)
      await showSuccess('PO In / Quick In berhasil disimpan ke database')
    } catch (error) {
      closeNotification()
      await showError('PO belum berhasil disimpan', error instanceof Error ? error.message : 'Periksa koneksi backend lalu coba kembali.')
    }
  }

  const uploadAttachment = async (file: File | null) => {
    if (isOfflineFallback) {
      await showWarning('Backend tidak tersedia', 'Lampiran hanya dapat diunggah saat backend tersedia dan quotation termuat dari server.')
      return
    }
    if (!file || !selected) return
    const allowedTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'image/png',
      'image/jpeg',
      'image/webp',
    ]
    if (!allowedTypes.includes(file.type)) {
      await showWarning('Format file tidak didukung', 'Gunakan file PDF, DOCX, XLSX, PNG, JPG, atau WEBP.')
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      await showWarning('Ukuran file terlalu besar', 'Ukuran maksimal lampiran adalah 10 MB.')
      return
    }

    setIsAttachmentUploading(true)
    showLoading('Mengunggah lampiran...')
    try {
      const formData = new FormData()
      formData.append('file', file)
      const response = await fetch(apiUrl(`/quotations/${selected.id}/attachments`), {
        method: 'POST',
        body: formData,
      })
      if (!response.ok) throw new Error('Unggah lampiran gagal')
      const attachment = (await response.json()) as NonNullable<QuotationRecord['attachments']>[number]
      const nextAttachments = [attachment, ...(selected.attachments ?? [])]
      const nextSelected = { ...selected, attachments: nextAttachments }
      setSelected(nextSelected)
      setRows((current) => current.map((row) => (row.id === selected.id ? nextSelected : row)))
      try {
        localStorage.setItem(
          localFallbackKey,
          JSON.stringify(rows.map((row) => (row.id === selected.id ? nextSelected : row))),
        )
      } catch {
        // The backend remains the source of truth when local caching is unavailable.
      }
      closeNotification()
      await showSuccess('Lampiran berhasil diunggah')
    } catch {
      closeNotification()
      await showError('Unggah lampiran gagal', 'Periksa koneksi backend dan coba kembali.')
    } finally {
      setIsAttachmentUploading(false)
    }
  }

  const deleteAttachment = async (attachmentId: string) => {
    if (isOfflineFallback) {
      await showWarning('Backend tidak tersedia', 'Lampiran tidak dapat dihapus dari cache lokal.')
      return
    }
    if (!selected) return
    if (!(await showConfirm('Hapus lampiran?', 'Lampiran ini akan dihapus dari quotation.', 'Ya, hapus'))) return

    showLoading('Menghapus lampiran...')
    try {
      const response = await fetch(
        apiUrl(`/quotations/${selected.id}/attachments/${attachmentId}`),
        { method: 'DELETE' },
      )
      if (!response.ok) throw new Error('Hapus lampiran gagal')
      const nextSelected = {
        ...selected,
        attachments: (selected.attachments ?? []).filter((attachment) => attachment.id !== attachmentId),
      }
      setSelected(nextSelected)
      const nextRows = rows.map((row) => (row.id === selected.id ? nextSelected : row))
      setRows(nextRows)
      try {
        localStorage.setItem(localFallbackKey, JSON.stringify(nextRows))
      } catch {
        // The backend remains the source of truth when local caching is unavailable.
      }
      closeNotification()
      await showSuccess('Lampiran berhasil dihapus')
    } catch {
      closeNotification()
      await showError('Hapus lampiran gagal', 'Periksa koneksi backend dan coba kembali.')
    }
  }

  const updateDraftItem = (index: number, field: keyof QuotationItem, value: string | number) => {
    setDraft((current) => {
      const nextItems = [...current.items]
      const item = nextItems[index]
      nextItems[index] = {
        ...item,
        [field]:
          field === 'quantity' || field === 'unitPrice' || field === 'discount' || field === 'taxRate'
            ? Number(value || 0)
            : value,
      }
      nextItems[index].subtotal = calculateLineTotal(nextItems[index])
      return { ...current, items: nextItems }
    })
  }

  const addItem = () => {
    setDraft((current) => ({ ...current, items: [...current.items, getDefaultItem()] }))
  }

  const removeItem = async (index: number) => {
    if (!(await showConfirm('Hapus item penawaran?', 'Item ini akan dihapus dari draft quotation.', 'Ya, hapus'))) return
    setDraft((current) => ({
      ...current,
      items: current.items.length > 1 ? current.items.filter((_, idx) => idx !== index) : [getDefaultItem()],
    }))
  }

  return (
    <div className="scrollbar flex h-full w-full min-w-0 flex-col gap-24 overflow-auto py-8">
      {/* Bagian Atas: Judul Quotation, Deskripsi Singkat, Tombol Create New */}
      <div className="flex items-center justify-between gap-24 phones:flex-col phones:items-start">
        <div>
          <p role="heading" aria-level={1} className="text-[2.6rem] font-semibold text-[#000000]">
            Quotation
          </p>
          <p className="mt-4 text-[1.4rem] text-[#000000]">
            Pusat pembuatan, pengelolaan, dan penerbitan dokumen penawaran serta surat resmi.
          </p>
        </div>
        <div className="flex flex-wrap gap-12">
          <button
            type="button"
            id="btn-create-new-quotation"
            onClick={openCreateTemplateModal}
            className="inline-flex min-h-[4rem] items-center justify-center gap-8 rounded-xl border border-[#0000FF] bg-[#0000FF] px-16 py-8 text-[1.4rem] font-semibold text-white transition-colors hover:bg-[#0000D0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0000FF] focus-visible:ring-offset-2"
          >
            <Plus size={18} className="text-white" />
            Create New
          </button>
          <button
            type="button"
            onClick={createQuickIn}
            className="inline-flex min-h-[4rem] items-center justify-center gap-8 rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] px-16 py-8 text-[1.4rem] font-medium text-[#000000] transition-colors hover:bg-[#F1F5F9]"
          >
            <FileText size={18} />
            PO In / Quick In
          </button>
          <button
            type="button"
            onClick={exportToExcel}
            className="inline-flex min-h-[4rem] items-center justify-center gap-8 rounded-xl border border-[#15803D] bg-[#15803D] px-16 py-8 text-[1.4rem] font-semibold text-white transition-colors hover:bg-[#166534] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#15803D] focus-visible:ring-offset-2"
          >
            <FileSpreadsheet size={18} className="text-white" />
            Export Excel
          </button>
        </div>
      </div>

      {isOfflineFallback && (
        <div role="status" className="rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] px-16 py-12 text-[1.4rem] text-[#000000]">
          Backend tidak tersedia. Data cache lokal ditampilkan sebagai <strong>baca-saja</strong>; perubahan belum tersinkron. Hubungkan backend lalu muat ulang sebelum melakukan transaksi.
        </div>
      )}

      <div className="grid grid-cols-3 gap-16 phones:grid-cols-1">
        <StatCard title="Total Dokumen" value={stats.total} />
        <StatCard title="Draft" value={stats.draft} />
        <StatCard title={statusLabels['Follow Up']} value={stats.followUp} />
      </div>

      {/* Bagian Daftar Dokumen: Pencarian, Filter jenis surat, Filter status, Tabel */}
      <div className="rounded-2xl border border-[#E2E8F0] bg-[#FFFFFF] p-20 shadow-sm">
        <div className="flex flex-col gap-12">
          <div className="flex flex-wrap items-center gap-12">
            <label className="relative min-w-[28rem] max-w-[46rem] flex-1">
              <Search className="absolute left-12 top-1/2 -translate-y-1/2 text-[#64748B]" size={16} />
              <input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value)
                  setPage(1)
                }}
                placeholder="Cari nomor dokumen, penerima, atau perihal..."
                className="min-h-[4.2rem] w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] py-10 pl-40 pr-16 text-[1.4rem] leading-[1.4] text-[#64748B] placeholder:text-[#64748B] focus:border-[#0000FF] focus:bg-[#FFFFFF] focus:outline-none"
              />
            </label>

            {/* Filter Jenis Surat */}
            <select
              aria-label="Filter jenis surat"
              value={letterTypeFilter}
              onChange={(e) => {
                setLetterTypeFilter(e.target.value)
                setPage(1)
              }}
              className="min-h-[4.2rem] rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] px-16 py-8 text-[1.35rem] leading-[1.4] text-[#000000] focus:border-[#0000FF] focus:outline-none"
            >
              <option value="ALL">Semua Jenis Surat</option>
              <option value="SURAT_PENAWARAN">Surat Penawaran</option>
              <option value="SURAT_PERMINTAAN_BARANG">Surat Permintaan Barang</option>
              <option value="SURAT_PESANAN">Surat Pesanan</option>
              <option value="SURAT_PERJANJIAN_JUAL_BELI">Surat Perjanjian Jual Beli</option>
            </select>

            {/* Filter Status */}
            <select
              aria-label="Filter status"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value)
                setPage(1)
              }}
              className="min-h-[4.2rem] rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] px-16 py-8 text-[1.35rem] leading-[1.4] text-[#000000] focus:border-[#0000FF] focus:outline-none"
            >
              <option value="Semua">Semua Status</option>
              <option value="Draft">Draft</option>
              <option value="Disimpan">Disimpan</option>
              {statusOptions
                .filter((st) => st !== 'Draft')
                .map((status) => (
                  <option key={status} value={status}>
                    {statusLabels[status]}
                  </option>
                ))}
            </select>

            <button
              type="button"
              aria-expanded={filtersOpen}
              onClick={() => setFiltersOpen((open) => !open)}
              className="inline-flex min-h-[4.2rem] items-center gap-8 rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] px-16 py-8 text-[1.4rem] font-medium leading-[1.4] text-[#000000] transition-colors hover:bg-[#F1F5F9]"
            >
              <Filter size={16} />
              Filter{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
              <ChevronDown className={clsx('transition-transform', filtersOpen && 'rotate-180')} size={16} />
            </button>
          </div>

          {/* Filter Kategori Surat Cepat (Semantic Category Filter) */}
          <div className="flex flex-wrap items-center justify-between gap-12 pt-4">
            <div className="flex flex-wrap items-center gap-8" role="group" aria-label="Filter cepat kategori surat">
              <button
                type="button"
                data-quotation-category-pill="ALL"
                onClick={() => {
                  setLetterTypeFilter('ALL')
                  setPage(1)
                }}
                className={clsx(
                  'inline-flex items-center gap-8 rounded-xl border px-14 py-7 text-[1.25rem] leading-[1.35] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0000FF]',
                  letterTypeFilter === 'ALL'
                    ? 'border-[#0000FF] bg-[#0000FF] font-semibold text-white shadow-sm'
                    : 'border-[#E2E8F0] bg-[#FFFFFF] font-medium text-[#000000] hover:border-[#0000FF] hover:bg-[#F8FAFC] hover:text-[#0000FF]',
                )}
              >
                <span>Semua Kategori</span>
                <span
                  className={clsx(
                    'rounded-full px-8 py-2 text-[1.15rem] font-semibold leading-[1.2]',
                    letterTypeFilter === 'ALL' ? 'bg-white/20 text-white' : 'bg-[#F1F5F9] text-[#000000]',
                  )}
                >
                  ({unifiedRows.length})
                </span>
              </button>
              {Object.values(DOCUMENT_CATEGORY_TOKENS).map((cat) => {
                const isActive = letterTypeFilter === cat.code
                const count = unifiedRows.filter((r) => r.type === cat.code).length
                return (
                  <button
                    key={cat.code}
                    type="button"
                    data-quotation-category-pill={cat.code}
                    onClick={() => {
                      setLetterTypeFilter(cat.code)
                      setPage(1)
                    }}
                    className={clsx(
                      'inline-flex items-center gap-8 rounded-xl border px-14 py-7 text-[1.25rem] leading-[1.35] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0000FF]',
                      isActive
                        ? 'border-[#0000FF] bg-[#0000FF] font-semibold text-white shadow-sm'
                        : 'border-[#E2E8F0] bg-[#FFFFFF] font-medium text-[#000000] hover:border-[#0000FF] hover:bg-[#F8FAFC] hover:text-[#0000FF]',
                    )}
                  >
                    <span>{cat.label}</span>
                    <span
                      className={clsx(
                        'rounded-full px-8 py-2 text-[1.15rem] font-semibold leading-[1.2]',
                        isActive ? 'bg-white/20 text-white' : 'bg-[#F1F5F9] text-[#000000]',
                      )}
                    >
                      ({count})
                    </span>
                  </button>
                )
              })}
            </div>
            {!loading && (
              <div className="text-[1.35rem] text-[#000000]">
                {filteredRows.length} dari {unifiedRows.length} dokumen
              </div>
            )}
          </div>

          {filtersOpen && (
            <div className="flex flex-wrap items-center gap-12 border-t border-[#E2E8F0] pt-12">
              <select
                aria-label="Filter jenis penawaran"
                value={typeFilter}
                onChange={(e) => {
                  setTypeFilter(e.target.value)
                  setPage(1)
                }}
                className="rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] px-12 py-10 text-[1.35rem] text-[#000000]"
              >
                <option>Semua</option>
                {typeOptions.map((type) => (
                  <option key={type}>{type}</option>
                ))}
              </select>
              <select
                aria-label="Filter tanggal quotation"
                value={dateFilter}
                onChange={(e) => {
                  const val = e.target.value
                  setDateFilter(val)
                  if (val !== 'custom') {
                    setDateFrom('')
                    setDateTo('')
                  }
                  setPage(1)
                }}
                className="rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] px-12 py-10 text-[1.35rem] text-[#000000]"
              >
                <option value="all">Semua tanggal</option>
                <option value="today">Hari ini</option>
                <option value="7days">7 hari terakhir</option>
                <option value="30days">30 hari terakhir</option>
                <option value="custom">Rentang tanggal kustom</option>
              </select>
              {dateFilter === 'custom' && (
                <>
                  <label className="flex items-center gap-8 rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] px-12 py-8 text-[1.3rem] text-[#000000]">
                    <span>Dari:</span>
                    <input
                      aria-label="Tanggal mulai quotation"
                      title="Tanggal mulai quotation"
                      type="date"
                      value={dateFrom}
                      onChange={(event) => {
                        setDateFrom(event.target.value)
                        setPage(1)
                      }}
                      className="min-w-0 bg-transparent text-[1.35rem] text-[#000000]"
                    />
                  </label>
                  <label className="flex items-center gap-8 rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] px-12 py-8 text-[1.3rem] text-[#000000]">
                    <span>Sampai:</span>
                    <input
                      aria-label="Tanggal akhir quotation"
                      title="Tanggal akhir quotation"
                      type="date"
                      value={dateTo}
                      onChange={(event) => {
                        setDateTo(event.target.value)
                        setPage(1)
                      }}
                      className="min-w-0 bg-transparent text-[1.35rem] text-[#000000]"
                    />
                  </label>
                </>
              )}
              <select
                aria-label="Filter tindak lanjut"
                value={followUpFilter}
                onChange={(e) => {
                  setFollowUpFilter(e.target.value)
                  setPage(1)
                }}
                className="rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] px-12 py-10 text-[1.35rem] text-[#000000]"
              >
                <option>Semua</option>
                {followUpOptions.map((status) => (
                  <option key={status}>{status}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => {
                  setSearch('')
                  setLetterTypeFilter('ALL')
                  setStatusFilter('Semua')
                  setTypeFilter('Semua')
                  setFollowUpFilter('Semua')
                  setDateFilter('all')
                  setDateFrom('')
                  setDateTo('')
                  setPage(1)
                }}
                className="rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] px-12 py-10 text-[1.35rem] text-[#000000] transition-colors hover:bg-[#F1F5F9]"
              >
                Reset Filter
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Tabel Dokumen Tersimpan */}
      <div className="overflow-hidden rounded-2xl border border-[#E2E8F0] bg-[#FFFFFF] shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-[112rem] w-full text-left text-[1.35rem]">
            <thead className="border-b border-[#E2E8F0] bg-[#F8FAFC] text-[#000000]">
              <tr>
                <th className="px-16 py-14 text-[1.3rem] font-semibold leading-[1.4]">No. Dokumen</th>
                <th className="px-16 py-14 text-[1.3rem] font-semibold leading-[1.4]">Jenis Surat / Template</th>
                <th className="px-16 py-14 text-[1.3rem] font-semibold leading-[1.4]">Penerima / Customer</th>
                <th className="px-16 py-14 text-[1.3rem] font-semibold leading-[1.4]">Tanggal</th>
                <th className="px-16 py-14 text-[1.3rem] font-semibold leading-[1.4]">Status</th>
                <th className="px-16 py-14 text-[1.3rem] font-semibold leading-[1.4]">Tindak Lanjut / Info</th>
                <th className="px-16 py-14 text-[1.3rem] font-semibold leading-[1.4]">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="p-24 text-center text-[#000000]">
                    Memuat dokumen quotation & surat…
                  </td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-24 text-center text-[#000000]">
                    Tidak ada dokumen yang sesuai dengan filter saat ini.
                  </td>
                </tr>
              ) : (
                visibleRows.map((row) => {
                  const q = row.quotationRecord
                  return (
                    <tr key={`${row.source}-${row.id}`} className="border-t border-[#E2E8F0] transition-colors hover:bg-[#F8FAFC]">
                      <td className="px-16 py-14 font-medium leading-[1.5] text-[#000000]">
                        <button
                          type="button"
                          onClick={() => {
                            if (q) {
                              setSelected(q)
                              setIsDetailOpen(true)
                              setIsStatusEditorOpen(false)
                            } else {
                              void handleOpenPreview(row)
                            }
                          }}
                          className="text-left font-semibold leading-[1.45] text-[#0000FF] hover:text-[#0000FF] hover:underline"
                        >
                          {row.number}
                        </button>
                        {row.title && (
                          <p className="mt-4 max-w-[28rem] break-words text-[1.25rem] leading-[1.45] text-[#000000]" title={row.title}>
                            {row.title}
                          </p>
                        )}
                        {q?.purchaseOrders && q.purchaseOrders.length > 0 && (
                          <p className="mt-4 text-[1.25rem] leading-[1.45] text-[#000000]">
                            PO: {q.purchaseOrders.map((po) => po.poNumber).join(', ')}
                          </p>
                        )}
                      </td>

                      <td className="px-16 py-14 text-[#000000]">
                        <div className="flex flex-col items-start gap-6">
                          <span
                            data-doc-category-badge={row.type}
                            className={clsx(
                              'inline-flex items-center whitespace-nowrap rounded-md px-10 py-4 text-[1.2rem] font-semibold leading-[1.35]',
                              getTypeBadgeClass(row.type),
                            )}
                          >
                            {row.typeName}
                          </span>
                          <span className="whitespace-nowrap text-[1.25rem] leading-[1.45] text-[#000000]">
                            {row.template?.name
                              ? `Template: ${row.template.name}`
                              : q?.type
                                ? `${q.type} · Bawaan`
                                : 'Template Bawaan'}
                          </span>
                        </div>
                      </td>

                      <td className="px-16 py-14 leading-[1.5] text-[#000000]">{row.recipient || '—'}</td>
                      <td className="whitespace-nowrap px-16 py-14 leading-[1.5] text-[#000000]">{formatDate(row.date)}</td>
                      <td className="px-16 py-14">
                        <span
                          data-status-badge={row.status}
                          className={clsx(
                            'inline-flex items-center whitespace-nowrap rounded-full px-12 py-5 text-[1.2rem] font-semibold leading-[1.35]',
                            getStatusClass(row.status),
                          )}
                        >
                          {getStatusLabel(row.status)}
                        </span>
                      </td>

                      <td className="px-16 py-14">
                        {q ? (
                          (() => {
                            const today = todayInputValue()
                            const isOverdue = Boolean(
                              q.followUpDate && q.followUpDate < today && q.followUpStatus !== 'Selesai',
                            )
                            const label = isOverdue
                              ? `Terlambat · ${formatDate(q.followUpDate)}`
                              : q.followUpStatus === 'Selesai'
                                ? 'Selesai'
                                : q.followUpDate
                                  ? `${q.followUpStatus} · ${formatDate(q.followUpDate)}`
                                  : q.followUpStatus === 'Jatuh tempo'
                                    ? 'Terlambat'
                                    : q.followUpStatus
                            return (
                              <span
                                className={clsx(
                                  'inline-flex items-center whitespace-nowrap rounded-full px-12 py-5 text-[1.2rem] font-semibold leading-[1.35]',
                                  getFollowUpClass(isOverdue ? 'Jatuh tempo' : q.followUpStatus),
                                )}
                              >
                                {label}
                              </span>
                            )
                          })()
                        ) : (
                          <span className="whitespace-nowrap text-[1.25rem] leading-[1.45] text-[#000000]">
                            {row.details?.purchaseOrderId ? 'Tersinkron ke PO' : 'Dokumen Surat Resmi'}
                          </span>
                        )}
                      </td>

                      <td className="px-16 py-14">
                        <div className="flex flex-wrap items-center gap-6">
                          {/* Pratinjau Dokumen */}
                          <button
                            type="button"
                            aria-label={`Pratinjau ${row.number}`}
                            title="Pratinjau Dokumen"
                            onClick={() => void handleOpenPreview(row)}
                            className={ACTION_BUTTON_CLASSES.preview}
                          >
                            <Eye aria-hidden="true" className="shrink-0" size={13} />
                            <span>Preview</span>
                          </button>

                          {/* Buka & Edit di Formulir Surat */}
                          <button
                            type="button"
                            aria-label={`Edit ${row.number}`}
                            title="Buka & Edit Dokumen"
                            onClick={() => navigate(row.route)}
                            className={ACTION_BUTTON_CLASSES.edit}
                          >
                            <Pencil aria-hidden="true" className="shrink-0" size={13} />
                            <span>Edit</span>
                          </button>

                          {/* Unduh PDF */}
                          <button
                            type="button"
                            aria-label={`Unduh ${row.number}`}
                            title="Unduh Dokumen (PDF)"
                            onClick={() => void handleDownloadDocument(row, 'pdf')}
                            className={ACTION_BUTTON_CLASSES.download}
                          >
                            <Download aria-hidden="true" className="shrink-0" size={13} />
                            <span>Unduh</span>
                          </button>

                          {/* Detail Quotation (Status, Follow Up, Lampiran) */}
                          {q && (
                            <button
                              type="button"
                              aria-label={`Lihat detail ${row.number}`}
                              title="Lihat detail, status & lampiran"
                              onClick={() => {
                                setSelected(q)
                                setIsDetailOpen(true)
                                setIsStatusEditorOpen(false)
                              }}
                              className={ACTION_BUTTON_CLASSES.preview}
                            >
                              <FileText aria-hidden="true" className="shrink-0" size={13} />
                              <span>Detail{q.attachments?.length ? ` (${q.attachments.length})` : ''}</span>
                            </button>
                          )}

                          {/* Hapus Dokumen */}
                          <button
                            type="button"
                            aria-label={`Hapus ${row.number}`}
                            title="Hapus Dokumen"
                            onClick={() => void handleDeleteDocument(row)}
                            className={ACTION_BUTTON_CLASSES.delete}
                          >
                            <Trash2 aria-hidden="true" className="shrink-0" size={13} />
                            <span>Hapus</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {filteredRows.length > pageSize && (
        <div className="flex flex-wrap items-center justify-between gap-12 rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] px-16 py-12">
          <span className="text-[1.5rem] text-[#000000]">
            Menampilkan {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, filteredRows.length)} dari{' '}
            {filteredRows.length} dokumen
          </span>
          <div className="flex items-center gap-8">
            <button
              type="button"
              onClick={() => setPage((value) => Math.max(1, value - 1))}
              disabled={currentPage === 1}
              className="rounded-lg border border-[#E2E8F0] bg-[#FFFFFF] px-12 py-8 text-[1.5rem] text-[#000000] transition-colors hover:bg-[#F1F5F9] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Sebelumnya
            </button>
            <span className="px-8 text-[1.5rem] text-[#000000]">
              Halaman {currentPage} dari {pageCount}
            </span>
            <button
              type="button"
              onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
              disabled={currentPage === pageCount}
              className="rounded-lg border border-[#E2E8F0] bg-[#FFFFFF] px-12 py-8 text-[1.5rem] text-[#000000] transition-colors hover:bg-[#F1F5F9] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Berikutnya
            </button>
          </div>
        </div>
      )}

      {/* Modal Pemilihan Template (Create New Quotation Flow) */}
      <CreateNewSuratModal
        isOpen={isTemplateModalOpen}
        onClose={() => setIsTemplateModalOpen(false)}
        uploadedTemplates={uploadedTemplates}
        initialCategory={templateModalCategory}
        initialSelectedId={templateModalSelectedId}
        onOpenUploadModal={() => {
          setIsTemplateModalOpen(false)
          setIsUploadModalOpen(true)
        }}
        onDownloadTemplate={(tpl) => void handleDownloadUploadedTemplate(tpl)}
        onDeleteTemplate={(tpl) => void handleDeleteTemplate(tpl)}
      />

      {/* Modal Unggah Template Kustom Baru */}
      <UploadTemplateModal
        isOpen={isUploadModalOpen}
        onClose={() => {
          setIsUploadModalOpen(false)
          setIsTemplateModalOpen(true)
        }}
        onSuccess={(newTemplate) => {
          void loadUploadedTemplates()
          setTemplateModalCategory(newTemplate.letterType)
          setTemplateModalSelectedId(newTemplate.id)
          setIsUploadModalOpen(false)
          setIsTemplateModalOpen(true)
        }}
      />

      {/* Modal Pratinjau Dokumen Interaktif */}
      {previewDoc && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-16 backdrop-blur-sm"
        >
          <div className="flex max-h-[92vh] w-full max-w-[90rem] flex-col overflow-hidden rounded-2xl border border-[#E2E8F0] bg-[#FFFFFF] shadow-xl">
            <div className="flex items-center justify-between border-b border-[#E2E8F0] px-24 py-16">
              <div>
                <div className="flex flex-wrap items-center gap-10">
                  <h3 className="text-[2rem] font-semibold text-[#000000]">
                    Pratinjau Dokumen: {previewDoc.number}
                  </h3>
                  <span
                    data-doc-category-badge={previewDoc.type}
                    className={clsx(
                      'inline-flex items-center rounded-md px-10 py-3 text-[1.2rem] font-semibold leading-[1.35]',
                      getTypeBadgeClass(previewDoc.type),
                    )}
                  >
                    {previewDoc.typeName}
                  </span>
                </div>
                <p className="mt-4 text-[1.3rem] text-[#000000]">
                  Penerima: {previewDoc.recipient}
                </p>
              </div>
              <button
                type="button"
                aria-label="Tutup pratinjau dokumen"
                onClick={() => {
                  setPreviewDoc(null)
                  setPreviewPdfUrl((prev) => {
                    if (prev) URL.revokeObjectURL(prev)
                    return null
                  })
                }}
                className="rounded-xl p-8 text-[#000000] transition-colors hover:bg-[#F1F5F9] hover:text-[#000000]"
              >
                <X size={20} />
              </button>
            </div>

            <div className="scrollbar flex-1 overflow-y-auto p-20">
              {previewLoading ? (
                <div className="flex flex-col items-center justify-center py-40 text-[#000000]">
                  <RefreshCw size={24} className="animate-spin text-[#000000]" />
                  <p className="mt-8 text-[1.4rem]">Menyiapkan pratinjau dokumen...</p>
                </div>
              ) : previewPdfUrl ? (
                <div className="h-[65vh] w-full overflow-hidden rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC]">
                  <iframe
                    title="Pratinjau Dokumen PDF"
                    src={previewPdfUrl}
                    className="h-full w-full"
                  />
                </div>
              ) : (
                <div className="flex flex-col gap-16 rounded-2xl border border-[#E2E8F0] p-20">
                  <div className="grid grid-cols-2 gap-12 text-[1.4rem]">
                    <div>
                      <span className="font-semibold text-[#000000]">Nomor Dokumen:</span>
                      <p className="font-semibold text-[#000000]">{previewDoc.number}</p>
                    </div>
                    <div>
                      <span className="font-semibold text-[#000000]">Jenis Surat:</span>
                      <div className="mt-4">
                        <span
                          className={clsx(
                            'inline-flex items-center rounded-md px-10 py-3 text-[1.2rem] font-semibold leading-[1.35]',
                            getTypeBadgeClass(previewDoc.type),
                          )}
                        >
                          {previewDoc.typeName}
                        </span>
                      </div>
                    </div>
                    <div>
                      <span className="font-semibold text-[#000000]">Penerima:</span>
                      <p className="font-semibold text-[#000000]">{previewDoc.recipient}</p>
                    </div>
                    <div>
                      <span className="font-semibold text-[#000000]">Tanggal:</span>
                      <p className="font-semibold text-[#000000]">{formatDate(previewDoc.date)}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-12 border-t border-[#E2E8F0] bg-[#F8FAFC] px-24 py-16">
              <div className="flex items-center gap-8">
                <span className="text-[1.3rem] font-medium text-[#000000]">Unduh:</span>
                {previewDoc.supportedFormats.map((fmt) => (
                  <button
                    key={fmt}
                    type="button"
                    onClick={() => void handleDownloadDocument(previewDoc, fmt)}
                    className={clsx(ACTION_BUTTON_CLASSES.download, 'uppercase')}
                  >
                    <Download size={13} />
                    <span>{fmt}</span>
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-10">
                <button
                  type="button"
                  onClick={() => {
                    setPreviewDoc(null)
                    setPreviewPdfUrl((prev) => {
                      if (prev) URL.revokeObjectURL(prev)
                      return null
                    })
                  }}
                  className="rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] px-16 py-8 text-[1.4rem] font-medium text-[#000000] transition-colors hover:bg-[#F1F5F9]"
                >
                  Tutup
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const route = previewDoc.route
                    setPreviewDoc(null)
                    navigate(route)
                  }}
                  className="inline-flex items-center gap-6 rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] px-16 py-8 text-[1.4rem] font-semibold text-[#0000FF] transition-colors hover:bg-[#F8FAFC]"
                >
                  <Edit3 size={15} />
                  <span>Buka & Edit Dokumen</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Edit Metadata & Follow-up Quotation */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-24 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-[125rem] overflow-auto rounded-2xl border border-[#E2E8F0] bg-[#FFFFFF] p-24 shadow-xl">
            <div className="mb-20 flex items-center justify-between">
              <div>
                <h2 className="text-[2.4rem] font-semibold text-[#000000]">
                  Edit Quotation
                </h2>
                <p className="mt-2 text-[1.35rem] text-[#000000]">
                  Simpan data quotation, jadwal tindak lanjut, pengirim surat, dan rincian item.
                </p>
              </div>
              <button
                onClick={() => setIsFormOpen(false)}
                aria-label="Tutup formulir quotation"
                className="rounded-full bg-[#F1F5F9] p-10 text-[#000000] transition-colors hover:bg-[#E2E8F0] hover:text-[#000000]"
              >
                <X size={18} />
              </button>
            </div>

            <div className="grid gap-16 desktop:grid-cols-2">
              <section className="rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] p-16">
                <h3 className="mb-14 text-[1.7rem] font-semibold text-[#000000]">Informasi Quotation</h3>
                <div className="space-y-12">
                  <label className="block">
                    <span className="mb-6 block text-[1.35rem] font-medium text-[#000000]">Nomor Quotation</span>
                    <input
                      value={draft.number}
                      onChange={(e) => setDraft((current) => ({ ...current, number: e.target.value }))}
                      className="w-full rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] px-12 py-10 text-[1.4rem] text-[#000000] focus:border-[#0000FF] focus:outline-none"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-6 block text-[1.35rem] font-medium text-[#000000]">Type</span>
                    <select
                      value={draft.type}
                      onChange={(e) => setDraft((current) => ({ ...current, type: e.target.value as QuotationType }))}
                      className="w-full rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] px-12 py-10 text-[1.4rem] text-[#000000] focus:border-[#0000FF] focus:outline-none"
                    >
                      {typeOptions.map((type) => (
                        <option key={type}>{type}</option>
                      ))}
                    </select>
                  </label>
                  <div className="grid gap-12 sm:grid-cols-2">
                    <label className="block">
                      <span className="mb-6 block text-[1.35rem] font-medium text-[#000000]">Tanggal</span>
                      <input
                        type="date"
                        value={draft.date}
                        onChange={(e) => setDraft((current) => ({ ...current, date: e.target.value }))}
                        className="w-full rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] px-12 py-10 text-[1.4rem] text-[#000000] focus:border-[#0000FF] focus:outline-none"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-6 block text-[1.35rem] font-medium text-[#000000]">Berlaku sampai</span>
                      <input
                        type="date"
                        value={draft.validUntil || ''}
                        onChange={(e) => setDraft((current) => ({ ...current, validUntil: e.target.value }))}
                        className="w-full rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] px-12 py-10 text-[1.4rem] text-[#000000] focus:border-[#0000FF] focus:outline-none"
                      />
                    </label>
                  </div>
                  <label className="block">
                    <span className="mb-6 block text-[1.35rem] font-medium text-[#000000]">Judul / Deskripsi Penawaran</span>
                    <input
                      value={draft.title || ''}
                      onChange={(e) => setDraft((current) => ({ ...current, title: e.target.value }))}
                      className="w-full rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] px-12 py-10 text-[1.4rem] text-[#000000] focus:border-[#0000FF] focus:outline-none"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-6 block text-[1.35rem] font-medium text-[#000000]">Status Transaksi</span>
                    <select
                      value={draft.status}
                      onChange={(e) => setDraft((current) => ({ ...current, status: e.target.value as QuotationStatus }))}
                      className="w-full rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] px-12 py-10 text-[1.4rem] text-[#000000] focus:border-[#0000FF] focus:outline-none"
                    >
                      {statusOptions.map((status) => (
                        <option key={status} value={status}>
                          {statusLabels[status]}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </section>

              <section className="rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] p-16">
                <h3 className="mb-14 text-[1.7rem] font-semibold text-[#000000]">Informasi Penerima</h3>
                <div className="space-y-12">
                  <label className="block">
                    <span className="mb-6 block text-[1.35rem] font-medium text-[#000000]">Nama Penerima / Customer</span>
                    <input
                      value={draft.recipient}
                      onChange={(e) => setDraft((current) => ({ ...current, recipient: e.target.value }))}
                      className="w-full rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] px-12 py-10 text-[1.4rem] text-[#000000] focus:border-[#0000FF] focus:outline-none"
                    />
                  </label>
                  <div className="grid gap-12 sm:grid-cols-2">
                    <label className="block">
                      <span className="mb-6 block text-[1.35rem] font-medium text-[#000000]">Alamat</span>
                      <input
                        value={draft.address}
                        onChange={(e) => setDraft((current) => ({ ...current, address: e.target.value }))}
                        className="w-full rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] px-12 py-10 text-[1.4rem] text-[#000000] focus:border-[#0000FF] focus:outline-none"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-6 block text-[1.35rem] font-medium text-[#000000]">Kota</span>
                      <input
                        value={draft.city}
                        onChange={(e) => setDraft((current) => ({ ...current, city: e.target.value }))}
                        className="w-full rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] px-12 py-10 text-[1.4rem] text-[#000000] focus:border-[#0000FF] focus:outline-none"
                      />
                    </label>
                  </div>
                  <div className="grid gap-12 sm:grid-cols-2">
                    <label className="block">
                      <span className="mb-6 block text-[1.35rem] font-medium text-[#000000]">Email</span>
                      <input
                        value={draft.email}
                        onChange={(e) => setDraft((current) => ({ ...current, email: e.target.value }))}
                        className="w-full rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] px-12 py-10 text-[1.4rem] text-[#000000] focus:border-[#0000FF] focus:outline-none"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-6 block text-[1.35rem] font-medium text-[#000000]">Telepon</span>
                      <input
                        value={draft.phone}
                        onChange={(e) => setDraft((current) => ({ ...current, phone: e.target.value }))}
                        className="w-full rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] px-12 py-10 text-[1.4rem] text-[#000000] focus:border-[#0000FF] focus:outline-none"
                      />
                    </label>
                  </div>
                  <label className="block">
                    <span className="mb-6 block text-[1.35rem] font-medium text-[#000000]">Catatan internal</span>
                    <textarea
                      value={draft.notes || ''}
                      onChange={(e) => setDraft((current) => ({ ...current, notes: e.target.value }))}
                      rows={3}
                      className="w-full rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] px-12 py-10 text-[1.4rem] text-[#000000] focus:border-[#0000FF] focus:outline-none"
                    />
                  </label>
                </div>
              </section>

              <section className="rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] p-16">
                <h3 className="mb-14 text-[1.7rem] font-semibold text-[#000000]">Jadwal & Tindak Lanjut (Follow Up)</h3>
                <div className="space-y-12">
                  <div className="grid gap-12 sm:grid-cols-2">
                    <label className="block">
                      <span className="mb-6 block text-[1.35rem] font-medium text-[#000000]">Status Tindak Lanjut</span>
                      <select
                        aria-label="Status Tindak Lanjut"
                        value={draft.followUpStatus}
                        onChange={(e) =>
                          setDraft((current) => ({ ...current, followUpStatus: e.target.value as FollowUpStatus }))
                        }
                        className="w-full rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] px-12 py-10 text-[1.4rem] text-[#000000] focus:border-[#0000FF] focus:outline-none"
                      >
                        {followUpOptions.map((status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block">
                      <span className="mb-6 block text-[1.35rem] font-medium text-[#000000]">Tanggal Tindak Lanjut</span>
                      <input
                        aria-label="Tanggal Tindak Lanjut"
                        type="date"
                        value={draft.followUpDate || ''}
                        onChange={(e) => setDraft((current) => ({ ...current, followUpDate: e.target.value }))}
                        className="w-full rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] px-12 py-10 text-[1.4rem] text-[#000000] focus:border-[#0000FF] focus:outline-none"
                      />
                    </label>
                  </div>
                  <label className="block">
                    <span className="mb-6 block text-[1.35rem] font-medium text-[#000000]">Catatan Tindak Lanjut</span>
                    <textarea
                      aria-label="Catatan Tindak Lanjut"
                      value={draft.followUpNotes || ''}
                      onChange={(e) => setDraft((current) => ({ ...current, followUpNotes: e.target.value }))}
                      placeholder="Catatan hasil komunikasi atau langkah follow-up berikutnya..."
                      rows={3}
                      className="w-full rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] px-12 py-10 text-[1.4rem] text-[#000000] focus:border-[#0000FF] focus:outline-none"
                    />
                  </label>
                </div>
              </section>

              <section className="rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] p-16">
                <h3 className="mb-14 text-[1.7rem] font-semibold text-[#000000]">Pengirim & Penandatangan Surat</h3>
                <div className="space-y-12">
                  <div className="grid gap-12 sm:grid-cols-2">
                    <label className="block">
                      <span className="mb-6 block text-[1.35rem] font-medium text-[#000000]">Perusahaan Pengirim</span>
                      <input
                        aria-label="Perusahaan Pengirim"
                        value={draft.senderCompany}
                        onChange={(e) => setDraft((current) => ({ ...current, senderCompany: e.target.value }))}
                        className="w-full rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] px-12 py-10 text-[1.4rem] text-[#000000] focus:border-[#0000FF] focus:outline-none"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-6 block text-[1.35rem] font-medium text-[#000000]">Masa Berlaku (Hari)</span>
                      <input
                        aria-label="Masa Berlaku (Hari)"
                        value={draft.validityDays}
                        onChange={(e) => setDraft((current) => ({ ...current, validityDays: e.target.value }))}
                        className="w-full rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] px-12 py-10 text-[1.4rem] text-[#000000] focus:border-[#0000FF] focus:outline-none"
                      />
                    </label>
                  </div>
                  <div className="grid gap-12 sm:grid-cols-2">
                    <label className="block">
                      <span className="mb-6 block text-[1.35rem] font-medium text-[#000000]">Nama Penandatangan</span>
                      <input
                        aria-label="Nama Penandatangan"
                        value={draft.signer}
                        onChange={(e) => setDraft((current) => ({ ...current, signer: e.target.value }))}
                        placeholder="Contoh: Budi Santoso"
                        className="w-full rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] px-12 py-10 text-[1.4rem] text-[#000000] focus:border-[#0000FF] focus:outline-none"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-6 block text-[1.35rem] font-medium text-[#000000]">Jabatan Penandatangan</span>
                      <input
                        aria-label="Jabatan Penandatangan"
                        value={draft.position}
                        onChange={(e) => setDraft((current) => ({ ...current, position: e.target.value }))}
                        placeholder="Contoh: Direktur Utama"
                        className="w-full rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] px-12 py-10 text-[1.4rem] text-[#000000] focus:border-[#0000FF] focus:outline-none"
                      />
                    </label>
                  </div>
                  <label className="block">
                    <span className="mb-6 block text-[1.35rem] font-medium text-[#000000]">Kalimat Pembuka Surat Penawaran</span>
                    <textarea
                      aria-label="Kalimat Pembuka Surat Penawaran"
                      value={draft.introduction}
                      onChange={(e) => setDraft((current) => ({ ...current, introduction: e.target.value }))}
                      placeholder="Opsional — kalimat pengantar surat penawaran"
                      rows={2}
                      className="w-full rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] px-12 py-10 text-[1.4rem] text-[#000000] focus:border-[#0000FF] focus:outline-none"
                    />
                  </label>
                </div>
              </section>
            </div>

            <section className="mt-20 rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] p-16">
              <div className="mb-12 flex items-center justify-between">
                <div>
                  <h3 className="text-[1.8rem] font-semibold text-[#000000]">Item Penawaran</h3>
                  <p className="mt-4 text-[1.35rem] text-[#000000]">Isi rincian barang atau jasa, diskon, dan pajak per item.</p>
                </div>
                <button
                  onClick={addItem}
                  className="min-h-[3.8rem] rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] px-12 py-8 text-[1.35rem] font-semibold text-[#0000FF] transition-colors hover:bg-[#F8FAFC]"
                >
                  Tambah Item
                </button>
              </div>
              <div className="space-y-12">
                {draft.items.map((item, index) => (
                  <div
                    key={item.id}
                    className="grid min-w-0 grid-cols-1 gap-10 rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] p-14 sm:grid-cols-2 tablet:grid-cols-4 laptop:grid-cols-8 desktop:grid-cols-8"
                  >
                    <label className="min-w-0 laptop:col-span-2 desktop:col-span-2">
                      <span className="mb-6 block text-[1.3rem] font-medium leading-[1.4] text-[#000000]">Barang / Jasa</span>
                      <input
                        placeholder="Nama barang/jasa"
                        value={item.description}
                        onChange={(e) => updateDraftItem(index, 'description', e.target.value)}
                        className="min-h-[4rem] w-full min-w-0 rounded-xl border border-[#E2E8F0] px-12 py-8 text-[1.35rem] leading-[1.4] text-[#000000] focus:border-[#0000FF] focus:outline-none"
                      />
                    </label>
                    <label>
                      <span className="mb-6 block text-[1.3rem] font-medium leading-[1.4] text-[#000000]">Jumlah</span>
                      <input
                        aria-label={`Jumlah item ${index + 1}`}
                        type="number"
                        min={1}
                        value={item.quantity}
                        onChange={(e) => updateDraftItem(index, 'quantity', e.target.value)}
                        className="min-h-[4rem] w-full rounded-xl border border-[#E2E8F0] px-12 py-8 text-[1.35rem] leading-[1.4] text-[#000000] focus:border-[#0000FF] focus:outline-none"
                      />
                    </label>
                    <label>
                      <span className="mb-6 block text-[1.3rem] font-medium leading-[1.4] text-[#000000]">Satuan</span>
                      <input
                        placeholder="pcs"
                        value={item.unit}
                        onChange={(e) => updateDraftItem(index, 'unit', e.target.value)}
                        className="min-h-[4rem] w-full rounded-xl border border-[#E2E8F0] px-12 py-8 text-[1.35rem] leading-[1.4] text-[#000000] focus:border-[#0000FF] focus:outline-none"
                      />
                    </label>
                    <label>
                      <span className="mb-6 block text-[1.3rem] font-medium leading-[1.4] text-[#000000]">Harga Satuan</span>
                      <input
                        aria-label={`Harga satuan item ${index + 1}`}
                        type="number"
                        min={0}
                        value={item.unitPrice}
                        onChange={(e) => updateDraftItem(index, 'unitPrice', e.target.value)}
                        className="min-h-[4rem] w-full rounded-xl border border-[#E2E8F0] px-12 py-8 text-[1.35rem] leading-[1.4] text-[#000000] focus:border-[#0000FF] focus:outline-none"
                      />
                    </label>
                    <label>
                      <span className="mb-6 block text-[1.3rem] font-medium leading-[1.4] text-[#000000]">Diskon (Rp)</span>
                      <input
                        aria-label={`Diskon item ${index + 1}`}
                        type="number"
                        min={0}
                        value={item.discount ?? 0}
                        onChange={(e) => updateDraftItem(index, 'discount', e.target.value)}
                        className="min-h-[4rem] w-full rounded-xl border border-[#E2E8F0] px-12 py-8 text-[1.35rem] leading-[1.4] text-[#000000] focus:border-[#0000FF] focus:outline-none"
                      />
                    </label>
                    <label>
                      <span className="mb-6 block text-[1.3rem] font-medium leading-[1.4] text-[#000000]">Pajak (%)</span>
                      <input
                        aria-label={`Pajak item ${index + 1}`}
                        type="number"
                        min={0}
                        step="0.5"
                        value={item.taxRate ?? 0}
                        onChange={(e) => updateDraftItem(index, 'taxRate', e.target.value)}
                        className="min-h-[4rem] w-full rounded-xl border border-[#E2E8F0] px-12 py-8 text-[1.35rem] leading-[1.4] text-[#000000] focus:border-[#0000FF] focus:outline-none"
                      />
                    </label>
                    <div className="flex items-end gap-8">
                      <div className="min-w-0 flex-1">
                        <span className="mb-6 block text-[1.3rem] font-medium leading-[1.4] text-[#000000]">Total</span>
                        <span className="block py-8 text-[1.4rem] font-semibold leading-[1.4] text-[#000000]">
                          {formatCurrency(calculateLineTotal(item))}
                        </span>
                      </div>
                      <button
                        type="button"
                        aria-label={`Hapus item ${index + 1}`}
                        title={`Hapus item ${index + 1}`}
                        onClick={() => void removeItem(index)}
                        className={clsx(ACTION_BUTTON_CLASSES.deleteIconOnly, 'ml-auto h-[3.8rem] w-[3.8rem]')}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <div className="mt-24 flex justify-end gap-12">
              <button
                onClick={() => setIsFormOpen(false)}
                className="rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] px-16 py-8 text-[1.4rem] text-[#000000] transition-colors hover:bg-[#F1F5F9]"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveQuotation}
                className="min-h-[4rem] rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] px-16 py-8 text-[1.4rem] font-semibold text-[#0000FF] transition-colors hover:bg-[#F8FAFC]"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Detail Quotation */}
      {isDetailOpen && selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-20 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-[100rem] overflow-auto rounded-2xl border border-[#E2E8F0] bg-[#FFFFFF] p-24 shadow-xl">
            <div className="mb-20 flex items-center justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-10">
                  <p className="text-[2.6rem] font-semibold text-[#000000]">Detail Quotation</p>
                  <span
                    data-doc-category-badge="SURAT_PENAWARAN"
                    className={clsx(
                      'inline-flex items-center rounded-md px-10 py-4 text-[1.2rem] font-semibold leading-[1.35]',
                      getTypeBadgeClass('SURAT_PENAWARAN'),
                    )}
                  >
                    Surat Penawaran
                  </span>
                </div>
                <p className="mt-4 text-[#000000]">{selected.number}</p>
              </div>
              <button onClick={() => setIsDetailOpen(false)} className="rounded-full bg-[#F1F5F9] p-10 text-[#000000] transition-colors hover:bg-[#E2E8F0] hover:text-[#000000]">
                <X size={18} />
              </button>
            </div>

            <div className="grid gap-20 laptop:grid-cols-2 desktop:grid-cols-2">
              <div className="space-y-12">
                <section className="rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] p-16">
                  <h2 className="mb-12 text-[1.8rem] font-semibold text-[#000000]">Informasi Quotation</h2>
                  <div className="flex flex-wrap items-center justify-between gap-12">
                    <div className="flex items-center gap-10">
                      <span className="text-[#000000]">Status Transaksi</span>
                      <span className={clsx('rounded-full px-12 py-6 text-[1.3rem] font-medium', getStatusClass(selected.status))}>
                        {statusLabels[selected.status]}
                      </span>
                    </div>
                    {!isStatusEditorOpen ? (
                      <button
                        type="button"
                        onClick={() => setIsStatusEditorOpen(true)}
                        className="rounded-lg border border-[#E2E8F0] bg-[#FFFFFF] px-12 py-8 text-[1.4rem] font-medium text-[#000000] transition-colors hover:bg-[#F1F5F9]"
                      >
                        Ubah Status
                      </button>
                    ) : (
                      <div className="flex flex-wrap items-center gap-8">
                        <select
                          aria-label={`Pilih status transaksi ${selected.number}`}
                          value={selected.status}
                          disabled={updatingStatusId !== null}
                          onChange={(event) => void updateTransactionStatus(selected, event.target.value as QuotationStatus)}
                          className="rounded-lg border border-[#E2E8F0] bg-[#FFFFFF] px-10 py-8 text-[1.4rem] text-[#000000] disabled:opacity-60"
                        >
                          {statusOptions.map((status) => (
                            <option key={status} value={status}>
                              {statusLabels[status]}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => setIsStatusEditorOpen(false)}
                          className="rounded-xl border border-[#B91C1C] bg-[#B91C1C] px-14 py-6 text-[1.3rem] font-semibold text-white shadow-sm transition-colors hover:bg-[#991B1B]"
                        >
                          Batal
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="mt-16 grid gap-12 sm:grid-cols-2">
                    <div className="rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] p-12">
                      <p className="text-[1.3rem] text-[#000000]">Jenis Penawaran</p>
                      <p className="mt-4 font-medium text-[#000000]">{selected.type}</p>
                    </div>
                    <div className="rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] p-12">
                      <p className="text-[1.3rem] text-[#000000]">Tanggal Quotation</p>
                      <p className="mt-4 font-medium text-[#000000]">{formatDate(selected.date)}</p>
                    </div>
                    <div className="rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] p-12">
                      <p className="text-[1.3rem] text-[#000000]">Berlaku Sampai</p>
                      <p className="mt-4 font-medium text-[#000000]">{formatDate(selected.validUntil)}</p>
                    </div>
                    <div className="rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] p-12">
                      <p className="text-[1.3rem] text-[#000000]">Nomor PO Terkait</p>
                      <p className="mt-4 font-medium text-[#000000]">
                        {selected.purchaseOrders?.length
                          ? selected.purchaseOrders.map((po) => po.poNumber).join(', ')
                          : 'Belum ada PO'}
                      </p>
                    </div>
                  </div>
                </section>
                <section className="rounded-2xl border border-[#E2E8F0] p-16">
                  <h2 className="mb-12 text-[1.8rem] font-semibold text-[#000000]">Penerima / Customer</h2>
                  <div className="space-y-8 text-[1.5rem] text-[#000000]">
                    <p className="font-semibold text-[#000000]">{selected.recipient || 'Nama belum diisi'}</p>
                    <p>{[selected.address, selected.city].filter(Boolean).join(', ') || 'Alamat belum diisi'}</p>
                    <p>{selected.email || 'Email belum diisi'}</p>
                    <p>{selected.phone || 'Telepon belum diisi'}</p>
                  </div>
                </section>
              </div>
              <div className="space-y-12">
                <section className="rounded-2xl border border-[#E2E8F0] p-16">
                  <h2 className="mb-12 text-[1.8rem] font-semibold text-[#000000]">Tindak Lanjut</h2>
                  <div className="space-y-8 text-[1.6rem] text-[#000000]">
                    <p>
                      <span className="text-[#000000]">Jadwal</span>
                      <br />
                      {selected.followUpDate ? formatDate(selected.followUpDate) : 'Belum dijadwalkan'}
                    </p>
                    <p>
                      <span className="text-[#000000]">Status tindak lanjut</span>
                      <br />
                      {selected.followUpStatus}
                    </p>
                    <p>
                      <span className="text-[#000000]">Catatan</span>
                      <br />
                      {selected.followUpNotes || 'Belum ada catatan'}
                    </p>
                  </div>
                </section>
                <section className="rounded-2xl border border-[#E2E8F0] p-16">
                  <h2 className="mb-8 text-[1.8rem] font-semibold text-[#000000]">Pengirim & Deskripsi</h2>
                  <p className="text-[1.4rem] text-[#000000]">
                    <span className="font-semibold text-[#000000]">{selected.senderCompany || 'PT Luma'}</span>
                    {selected.signer
                      ? ` · Penandatangan: ${selected.signer}${selected.position ? ` (${selected.position})` : ''}`
                      : ''}
                  </p>
                  <p className="mt-8 text-[#000000]">{selected.title || selected.introduction || 'Belum ada deskripsi penawaran.'}</p>
                  <p className="mt-12 border-t border-[#E2E8F0] pt-12 text-[1.5rem] text-[#000000]">
                    <span className="font-medium text-[#000000]">Catatan internal:</span>{' '}
                    {selected.notes || 'Tidak ada catatan internal.'}
                  </p>
                </section>
              </div>
            </div>

            <div className="mt-24">
              <p className="mb-8 text-[1.7rem] font-semibold text-[#000000]">Item</p>
              {selected.items.length ? (
                <div className="overflow-x-auto rounded-xl border border-[#E2E8F0]">
                  <table className="min-w-full text-left text-[1.35rem]">
                    <thead className="border-b border-[#E2E8F0] bg-[#F8FAFC] text-[#000000]">
                      <tr>
                        <th className="px-14 py-12 text-[1.25rem] font-semibold leading-[1.4]">Barang / Jasa</th>
                        <th className="px-14 py-12 text-[1.25rem] font-semibold leading-[1.4]">Jumlah</th>
                        <th className="px-14 py-12 text-[1.25rem] font-semibold leading-[1.4]">Satuan</th>
                        <th className="px-14 py-12 text-[1.25rem] font-semibold leading-[1.4]">Harga Satuan</th>
                        <th className="px-14 py-12 text-[1.25rem] font-semibold leading-[1.4]">Diskon</th>
                        <th className="px-14 py-12 text-[1.25rem] font-semibold leading-[1.4]">Pajak (%)</th>
                        <th className="px-14 py-12 text-[1.25rem] font-semibold leading-[1.4]">Total Item</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selected.items.map((item) => (
                        <tr key={item.id} className="border-t border-[#E2E8F0]">
                          <td className="px-14 py-12 leading-[1.45] text-[#000000]">{item.description}</td>
                          <td className="px-14 py-12 leading-[1.45] text-[#000000]">{item.quantity}</td>
                          <td className="px-14 py-12 leading-[1.45] text-[#000000]">{item.unit}</td>
                          <td className="px-14 py-12 leading-[1.45] text-[#000000]">{formatCurrency(item.unitPrice)}</td>
                          <td className="px-14 py-12 leading-[1.45] text-[#000000]">{formatCurrency(item.discount ?? 0)}</td>
                          <td className="px-14 py-12 leading-[1.45] text-[#000000]">{item.taxRate ?? 0}%</td>
                          <td className="px-14 py-12 font-medium leading-[1.45] text-[#000000]">{formatCurrency(calculateLineTotal(item))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-[#000000]">Belum ada item quotation.</p>
              )}
              {selected.items.length > 0 && (
                <div className="mt-12 flex justify-end">
                  <div className="min-w-[26rem] rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-16 py-12 text-right">
                    <p className="text-[1.4rem] text-[#000000]">Total Penawaran</p>
                    <p className="mt-4 text-[2rem] font-semibold text-[#000000]">{formatCurrency(getQuotationGrandTotal(selected))}</p>
                  </div>
                </div>
              )}
            </div>

            <section className="mt-24 rounded-2xl border border-[#E2E8F0] p-16" aria-labelledby="quotation-attachments-title">
              <div className="mb-12 flex flex-wrap items-center justify-between gap-12">
                <div>
                  <h2 id="quotation-attachments-title" className="text-[1.8rem] font-semibold text-[#000000]">
                    Lampiran
                  </h2>
                  <p className="mt-4 text-[1.4rem] text-[#000000]">PDF, DOCX, XLSX, PNG, JPG, atau WEBP · Maks. 10 MB</p>
                </div>
                <label className="inline-flex min-h-[4rem] cursor-pointer items-center gap-8 rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] px-12 py-8 text-[1.5rem] font-medium text-[#000000] transition-colors hover:bg-[#F1F5F9] has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60">
                  <Paperclip aria-hidden="true" size={16} />
                  {isAttachmentUploading ? 'Mengunggah...' : 'Tambah Lampiran'}
                  <input
                    type="file"
                    className="sr-only"
                    accept=".pdf,.docx,.xlsx,.png,.jpg,.jpeg,.webp"
                    disabled={isAttachmentUploading}
                    onChange={(event) => {
                      void uploadAttachment(event.currentTarget.files?.[0] ?? null)
                      event.currentTarget.value = ''
                    }}
                  />
                </label>
              </div>
              {selected.attachments?.length ? (
                <ul className="divide-y divide-[#E2E8F0]">
                  {selected.attachments.map((attachment) => (
                    <li key={attachment.id} className="flex min-w-0 items-center gap-12 py-10">
                      <Paperclip aria-hidden="true" className="shrink-0 text-[#000000]" size={16} />
                      <a
                        href={fileUrl(attachment.url)}
                        target="_blank"
                        rel="noreferrer"
                        className="min-w-0 flex-1 break-words text-[1.5rem] font-medium text-[#0000FF] hover:text-[#0000FF] hover:underline"
                      >
                        {attachment.name}
                      </a>
                      <span className="shrink-0 text-[1.3rem] text-[#000000]">{(attachment.size / (1024 * 1024)).toFixed(2)} MB</span>
                      <button
                        type="button"
                        title={`Hapus lampiran ${attachment.name}`}
                        aria-label={`Hapus lampiran ${attachment.name}`}
                        onClick={() => void deleteAttachment(attachment.id)}
                        className={clsx(ACTION_BUTTON_CLASSES.delete, 'shrink-0')}
                      >
                        <Trash2 aria-hidden="true" size={14} />
                        <span>Hapus</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="rounded-xl bg-[#F8FAFC] px-12 py-16 text-[1.5rem] text-[#000000]">Belum ada lampiran.</p>
              )}
            </section>

            <div className="mt-24 flex flex-wrap justify-end gap-12">
              <button
                onClick={() => {
                  setIsDetailOpen(false)
                  setIsStatusEditorOpen(false)
                }}
                className="rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] px-16 py-8 text-[1.4rem] text-[#000000] transition-colors hover:bg-[#F1F5F9]"
              >
                Tutup
              </button>
              <button
                onClick={() => {
                  setIsDetailOpen(false)
                  openEditForm(selected)
                }}
                className="btn-action-edit inline-flex min-h-[4rem] items-center gap-6 rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] px-16 py-8 text-[1.4rem] font-semibold text-[#0000FF] transition-colors hover:bg-[#F8FAFC]"
              >
                <Pencil size={15} />
                <span>Edit Metadata & Follow Up</span>
              </button>
              <button
                onClick={() => navigate(`/quotation/surat-penawaran?id=${selected.id}`, { state: { quotation: selected } })}
                className="min-h-[4rem] rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] px-16 py-8 text-[1.4rem] font-semibold text-[#0000FF] transition-colors hover:bg-[#F8FAFC]"
              >
                Buka Editor Surat Penawaran
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function StatCard({ title, value }: { title: string; value: number }) {
  return (
    <div className="rounded-2xl border border-[#E2E8F0] bg-[#FFFFFF] p-20 shadow-sm">
      <div className="flex items-center justify-between text-[#000000]">
        <span className="text-[1.6rem]">{title}</span>
        <CalendarDays size={16} className="text-[#000000]" />
      </div>
      <p className="mt-12 text-[3rem] font-semibold text-[#000000]">{value}</p>
    </div>
  )
}
