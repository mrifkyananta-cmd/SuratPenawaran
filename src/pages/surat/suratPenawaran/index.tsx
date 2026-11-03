import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { apiUrl } from '@/utils/billingApi'
import { closeNotification, showConfirm, showError, showLoading, showSuccess, showWarning } from '@/utils/notifications'
import { ACTION_BUTTON_CLASSES, getDocumentCategoryStyle } from '@/utils/semanticTokens'
import {
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  FileSpreadsheet,
  FileText,
  FileType,
  Plus,
  Save,
  Trash2,
} from 'lucide-react'
import ActiveTemplateBanner from '../components/ActiveTemplateBanner'
import { downloadFilledDocxTemplate } from '../utils/docxTemplateFiller'
import type { UploadedTemplateRecord } from '../components/UploadTemplateModal'
import QuotationPreview from './QuotationPreview'
import {
  getIntroduction,
  loadTemplateModel,
  type TemplateModel,
} from './templateModel'
import {
  MAX_INTRODUCTION_LENGTH,
  MAX_ITEMS,
  MAX_ITEM_DESCRIPTION_LENGTH,
  calculateTotals,
  createEmptyItem,
  downloadBlob,
  getPrintedItems,
  quotationFileName,
  rupiahFormatter,
  validateQuotation,
  type ExportFormat,
  type QuotationData,
  type QuotationItem,
  type TaxMode,
} from './quotationShared'

type QuotationFormData = QuotationData & {
  quotationId?: string
  templateId?: string | null
  signatureImage?: string
  stampImage?: string
}

type StoredQuotationSummary = {
  id: string
  number: string
  recipient: string
  address: string
  city: string
  date: string
  validityDays: string
  senderCompany: string
  introduction: string
  signer: string
  position: string
  email: string
  phone: string
  taxEnabled: boolean
  taxMode: TaxMode
  taxRate: number
  taxManualAmount: number
  signatureImage?: string
  stampImage?: string
  templateId?: string | null
  items?: Array<Partial<QuotationItem> & { discount?: number; taxRate?: number }>
}

const initialData: QuotationFormData = {
  recipient: '',
  address: '',
  city: '',
  date: new Date().toLocaleDateString('sv-SE'),
  number: '',
  validityDays: '30',

  senderCompany: 'PT Sinergi Karunia Sejahtera',
  introduction: '',

  signer: '',
  position: '',
  email: '',
  phone: '',

  taxEnabled: true,
  taxMode: 'manual',
  taxRate: 11,
  taxManualAmount: 0,

  items: [createEmptyItem()],
}
type Field = Exclude<keyof QuotationData, 'items'>
type ItemField = Exclude<keyof QuotationItem, 'id'>

const cellInput =
  'min-h-[4rem] w-full rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] px-12 py-10 text-[1.4rem] font-normal leading-[1.45] text-[#000000] focus:border-[#0000FF] focus:outline-none'

/**
 * Mengubah gambar PNG, JPG, atau WEBP menjadi data URL PNG.
 * Hasilnya bisa dipakai untuk pratinjau dan diteruskan ke fungsi ekspor.
 */
function readImageAsPng(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    const objectUrl = URL.createObjectURL(file)

    image.onload = () => {
      try {
        const MAX_IMAGE_DIMENSION = 800
        const naturalWidth = image.naturalWidth || image.width || 1
        const naturalHeight = image.naturalHeight || image.height || 1
        const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(naturalWidth, naturalHeight))

        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.round(naturalWidth * scale))
        canvas.height = Math.max(1, Math.round(naturalHeight * scale))

        const context = canvas.getContext('2d')

        if (!context) {
          URL.revokeObjectURL(objectUrl)
          reject(new Error('Gambar tidak dapat diproses.'))
          return
        }

        context.drawImage(image, 0, 0, canvas.width, canvas.height)

        canvas.toBlob(
          (blob) => {
            URL.revokeObjectURL(objectUrl)

            if (!blob) {
              reject(new Error('Gagal mengonversi gambar.'))
              return
            }

            const reader = new FileReader()

            reader.onload = () => {
              if (typeof reader.result === 'string') {
                resolve(reader.result)
              } else {
                reject(new Error('Gagal membaca gambar.'))
              }
            }

            reader.onerror = () => {
              reject(new Error('Gagal membaca gambar.'))
            }

            reader.readAsDataURL(blob)
          },
          'image/png',
        )
      } catch {
        URL.revokeObjectURL(objectUrl)
        reject(new Error('Gagal memproses gambar.'))
      }
    }

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('File gambar tidak dapat dibuka.'))
    }

    image.src = objectUrl
  })
}

export default function SuratPenawaran() {
  const location = useLocation()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const urlId = searchParams.get('id')
  const urlTemplateId = searchParams.get('templateId') || ''

  const [data, setData] = useState<QuotationFormData>(() => {
    const incomingState = (location.state as { quotation?: StoredQuotationSummary } | null)?.quotation
    if (!urlId && !incomingState) {
      try {
        const cached = sessionStorage.getItem('luma_unsaved_surat_penawaran')
        if (cached) {
          const parsed = JSON.parse(cached)
          if (parsed && typeof parsed === 'object' && !parsed.quotationId) {
            return { ...initialData, ...parsed }
          }
        }
      } catch {
        // Ignore storage error
      }
    }
    return initialData
  })
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(urlTemplateId || null)
  const [savedQuotations, setSavedQuotations] = useState<StoredQuotationSummary[]>([])
  const [savingQuotation, setSavingQuotation] = useState(false)
  const [error, setError] = useState('')
  const [downloading, setDownloading] = useState<ExportFormat | null>(null)
  const [showPreview, setShowPreview] = useState(true)
  const [model, setModel] = useState<TemplateModel | null>(null)
  
  const [signatureFile, setSignatureFile] = useState<File | null>(null)
  const [stampFile, setStampFile] = useState<File | null>(null)
  const [uploadMessage, setUploadMessage] = useState('')

  useEffect(() => {
    if (!urlId && !data.quotationId) {
      try {
        sessionStorage.setItem('luma_unsaved_surat_penawaran', JSON.stringify(data))
      } catch {
        // Ignore storage error
      }
    }
  }, [data, urlId])

  function applyStoredQuotation(incoming: Omit<Partial<QuotationFormData>, 'items'> & {
    id?: string
    items?: Array<Partial<QuotationItem> & { discount?: number; taxRate?: number }>
  }) {
    const mappedItems = incoming.items?.length
      ? incoming.items.map((item) => {
          const qty = Math.max(1, Number(item.quantity ?? 1))
          const grossUnit = Number(item.unitPrice ?? 0)
          const discount = Math.max(0, Number(item.discount ?? 0))
          const netTotal = Math.max(0, qty * grossUnit - discount)
          return {
            id: String(item.id ?? crypto.randomUUID()),
            quantity: qty,
            unitPrice: netTotal / qty,
            description: item.description ?? '',
            unit: item.unit ?? 'pcs',
          }
        })
      : [createEmptyItem()]
    const firstPositiveItemTax = (incoming.items ?? []).find((item) => Number(item.taxRate ?? 0) > 0)
    const itemTaxSum = (incoming.items ?? []).reduce((sum, item) => {
      const qty = Math.max(1, Number(item.quantity ?? 1))
      const base = Math.max(0, qty * Number(item.unitPrice ?? 0) - Math.max(0, Number(item.discount ?? 0)))
      return sum + base * (Math.max(0, Number(item.taxRate ?? 0)) / 100)
    }, 0)

    const resolvedTaxMode: TaxMode =
      incoming.taxMode === 'percent' || ((incoming.taxManualAmount ?? 0) === 0 && Boolean(firstPositiveItemTax))
        ? 'percent'
        : 'manual'
    const resolvedTaxRate = firstPositiveItemTax
      ? Number(firstPositiveItemTax.taxRate)
      : Number(incoming.taxRate ?? 11)

    setSignatureFile(null)
    setStampFile(null)
    if (incoming.templateId) {
      setActiveTemplateId(incoming.templateId)
    }
    setData((previous) => ({
      ...previous,
      quotationId: incoming.id ?? incoming.quotationId,
      templateId: incoming.templateId ?? previous.templateId,
      recipient: incoming.recipient ?? '',
      address: incoming.address ?? '',
      city: incoming.city ?? '',
      date: incoming.date || previous.date,
      number: incoming.number ?? '',
      validityDays: incoming.validityDays || '30',
      senderCompany: incoming.senderCompany || 'PT Sinergi Karunia Sejahtera',
      introduction: incoming.introduction ?? '',
      signer: incoming.signer ?? '',
      position: incoming.position ?? '',
      email: incoming.email ?? '',
      phone: incoming.phone ?? '',
      taxEnabled: incoming.taxEnabled ?? true,
      taxMode: resolvedTaxMode,
      taxRate: resolvedTaxRate,
      taxManualAmount:
        (incoming.taxManualAmount ?? 0) > 0
          ? Number(incoming.taxManualAmount)
          : resolvedTaxMode === 'manual' && itemTaxSum > 0
            ? Math.round(itemTaxSum)
            : 0,
      signatureImage: incoming.signatureImage || undefined,
      stampImage: incoming.stampImage || undefined,
      items: mappedItems,
    }))
  }

  async function fetchSavedQuotations() {
    try {
      const response = await fetch(apiUrl('/quotations'))
      if (!response.ok) return []
      const list = (await response.json()) as StoredQuotationSummary[]
      setSavedQuotations(list)
      return list
    } catch {
      return []
    }
  }

  useEffect(() => {
    void fetchSavedQuotations().then(async (list) => {
      if (urlId) {
        const found = list.find((item) => item.id === urlId)
        if (found) {
          applyStoredQuotation(found)
        } else {
          try {
            const res = await fetch(apiUrl(`/quotations/${urlId}`))
            if (res.ok) {
              const full = await res.json()
              applyStoredQuotation(full)
            }
          } catch {
            // Ignore
          }
        }
      }
    })
  }, [urlId])

  useEffect(() => {
    const incoming = (location.state as {
      quotation?: Omit<Partial<QuotationFormData>, 'items'> & {
        id?: string
        items?: Array<Partial<QuotationItem> & { discount?: number; taxRate?: number }>
      }
    } | null)?.quotation

    if (incoming) {
      applyStoredQuotation(incoming)
    }
  }, [location.state])

  useEffect(() => {
    async function load() {
      try {
        const result = await loadTemplateModel()
        setModel(result)
      } catch {
        setModel(null)
      }
    }
    void load()
  }, [])

  async function saveToQuotation(targetStatus: 'Draft' | 'Approved' = 'Draft') {
    if (savingQuotation) return

    if (!data.number.trim() || !data.recipient.trim() || !data.date.trim()) {
      await showWarning('Data belum lengkap', 'Isi Nomor Penawaran, Tanggal, dan Nama Penerima sebelum menyimpan ke Quotation.')
      return
    }

    const activeItems = data.items.filter((item) => item.description.trim() !== '' || Number(item.unitPrice) > 0)
    const itemsToSave = activeItems.length > 0 ? activeItems : data.items

    for (let i = 0; i < itemsToSave.length; i += 1) {
      const item = itemsToSave[i]
      const qty = Number(item.quantity)
      const price = Number(item.unitPrice)
      if (!Number.isFinite(qty) || qty < 1 || !Number.isInteger(qty)) {
        await showWarning('Data item belum valid', `Jumlah pada baris produk ke-${i + 1} harus berupa bilangan bulat minimal 1.`)
        return
      }
      if (!Number.isFinite(price) || price < 0) {
        await showWarning('Data item belum valid', `Harga satuan pada baris produk ke-${i + 1} tidak boleh negatif.`)
        return
      }
    }

    setSavingQuotation(true)
    showLoading(targetStatus === 'Draft' ? 'Menyimpan sebagai Draft...' : 'Menyimpan Surat...')
    try {
      const effectiveItemTaxRate =
        data.taxEnabled !== false && data.taxMode === 'percent'
          ? Number(data.taxRate || 0)
          : 0

      const payload = {
        recipient: data.recipient.trim(),
        address: data.address.trim(),
        city: data.city.trim(),
        date: data.date.trim(),
        number: data.number.trim(),
        validityDays: String(data.validityDays || '30').trim() || '30',
        senderCompany: data.senderCompany.trim() || 'PT Luma',
        introduction: data.introduction,
        signer: data.signer.trim(),
        position: data.position.trim(),
        email: data.email.trim(),
        phone: data.phone.trim(),
        taxEnabled: data.taxEnabled !== false,
        taxMode: data.taxMode || 'manual',
        taxRate: Number(data.taxRate || 0),
        taxManualAmount: Number(data.taxManualAmount || 0),
        signatureImage: data.signatureImage ?? null,
        stampImage: data.stampImage ?? null,
        status: targetStatus,
        templateId: activeTemplateId || null,
        items: itemsToSave.map((item, idx) => ({
          id: item.id,
          description: item.description.trim() || `Item ${idx + 1}`,
          quantity: Math.max(1, Math.round(Number(item.quantity || 1))),
          unit: item.unit.trim() || 'pcs',
          unitPrice: Math.max(0, Number(item.unitPrice || 0)),
          discount: 0,
          taxRate: effectiveItemTaxRate,
        })),
      }

      const isUpdating = Boolean(data.quotationId)
      const response = await fetch(
        isUpdating ? apiUrl(`/quotations/${data.quotationId}`) : apiUrl('/quotations'),
        {
          method: isUpdating ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      )

      const body = (await response.json().catch(() => null)) as (StoredQuotationSummary & { error?: string }) | null
      if (!response.ok || !body || !body.id) {
        throw new Error(body?.error || 'Gagal menyimpan ke Quotation.')
      }

      try {
        sessionStorage.removeItem('luma_unsaved_surat_penawaran')
      } catch {
        // Ignore storage error
      }
      setData((prev) => ({ ...prev, quotationId: body.id, templateId: body.templateId ?? activeTemplateId }))
      setSearchParams(
        (body.templateId || activeTemplateId)
          ? { id: body.id, templateId: String(body.templateId || activeTemplateId) }
          : { id: body.id },
      )
      await fetchSavedQuotations()
      closeNotification()
      await showSuccess(
        targetStatus === 'Draft'
          ? 'Draft tersimpan'
          : isUpdating
            ? 'Quotation berhasil diperbarui'
            : 'Surat Penawaran tersimpan',
        `Dokumen ${body.number} berhasil disimpan dengan status ${targetStatus}.`,
      )
    } catch (cause) {
      closeNotification()
      await showError(
        'Gagal menyimpan ke Quotation',
        cause instanceof Error ? cause.message : 'Periksa koneksi backend lalu coba kembali.',
      )
    } finally {
      setSavingQuotation(false)
    }
  }

  function handleCancel() {
    navigate('/quotation')
  }

  function handleBackToTemplates() {
    navigate('/quotation?openTemplates=1')
  }

  function change(field: Field, value: string) {
    setData((previous) => ({
      ...previous,
      [field]: value,
    }))
    setError('')
  }

  function changeItem(id: string, field: ItemField, value: string) {
    setData((previous) => ({
      ...previous,
      items: previous.items.map((item) => {
        if (item.id !== id) return item

        if (field === 'quantity' || field === 'unitPrice') {
          return {
            ...item,
            [field]: value === '' ? 0 : Number(value),
          }
        }

        return {
          ...item,
          [field]: value,
        }
      }),
    }))

    setError('')
  }

  function addItem() {
    setData((previous) =>
      previous.items.length >= MAX_ITEMS
        ? previous
        : {
            ...previous,
            items: [...previous.items, createEmptyItem()],
          },
    )

    setError('')
  }

  async function removeItem(id: string) {
    if (!(await showConfirm('Hapus baris penawaran?', 'Baris ini akan dihapus dari surat yang sedang disusun.', 'Ya, hapus'))) return
    setData((previous) => {
      const items = previous.items.filter((item) => item.id !== id)

      return {
        ...previous,
        items: items.length ? items : [createEmptyItem()],
      }
    })

    setError('')
  }

  async function uploadCompanyAsset(
    kind: 'signature' | 'stamp',
    file: File | null,
  ) {
    if (!file) return

    const allowedTypes = ['image/png', 'image/jpeg', 'image/webp']

    if (!allowedTypes.includes(file.type)) {
      setUploadMessage('Gunakan file gambar PNG, JPG, atau WEBP.')
      return
    }

    const formData = new FormData()
    formData.append('file', file)
    formData.append('type', kind)

    try {
      const response = await fetch(apiUrl('/assets'), {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        throw new Error('Unggah file gagal.')
      }

      await showSuccess('Lampiran berhasil diunggah', `${kind === 'signature' ? 'Tanda tangan' : 'Stempel perusahaan'} tersimpan di backend.`)
    } catch {
      await showWarning('Unggah lampiran gagal', 'Backend tidak dapat menyimpan file. Gambar lokal tetap tersedia untuk dokumen ini.')
    }
  }

  async function handleAssetImageChange(type: 'signature' | 'stamp', file: File | null) {
    setUploadMessage('')
    const setFile = type === 'signature' ? setSignatureFile : setStampFile
    const imageKey = type === 'signature' ? 'signatureImage' : 'stampImage'
    const label = type === 'signature' ? 'tanda tangan' : 'stempel'

    if (!file) {
      setFile(null)
      setData((previous) => ({ ...previous, [imageKey]: undefined }))
      return
    }

    const allowedTypes = ['image/png', 'image/jpeg', 'image/webp']
    if (!allowedTypes.includes(file.type)) {
      setFile(null)
      setUploadMessage('Gunakan file gambar PNG, JPG, atau WEBP.')
      return
    }

    if (file.size > 5 * 1024 * 1024) {
      setFile(null)
      setUploadMessage('Ukuran gambar maksimal 5MB.')
      return
    }

    try {
      const imageDataUrl = await readImageAsPng(file)
      setFile(file)
      setData((previous) => ({ ...previous, [imageKey]: imageDataUrl }))
      await uploadCompanyAsset(type, file)
    } catch (cause) {
      setUploadMessage(
        cause instanceof Error ? cause.message : 'Gagal memproses gambar ' + label + '.',
      )
      await showError(
        'Gambar ' + label + ' gagal diproses',
        'Coba pilih file gambar lain dalam format PNG, JPG, atau WEBP.',
      )
    }
  }

  async function download(format: ExportFormat) {
  const problem = validateQuotation(data)

  if (problem) {
    setError(problem)
    return
  }

  setDownloading(format)
  setError('')
  showLoading('Menyiapkan dokumen...')

  try {
    let file: Blob

    if (format === 'pdf') {
      const { createQuotationPdf } = await import('./exportPdf')

      file = await createQuotationPdf(data)

    } else if (format === 'docx') {

      const { createQuotationWord } = await import('./exportWord')

      file = await createQuotationWord(data)

    } else {

      const { createQuotationExcel } = await import('./exportExcel')

      file = await createQuotationExcel(data)

    }


    downloadBlob(
      file,
      quotationFileName(data, format),
    )

    let linkedToQuotation = false
    if (data.quotationId) {
      try {
        const formData = new FormData()
        formData.append('file', file, quotationFileName(data, format))
        const response = await fetch(apiUrl(`/quotations/${data.quotationId}/attachments`), {
          method: 'POST',
          body: formData,
        })
        linkedToQuotation = response.ok
      } catch {
        linkedToQuotation = false
      }
    }

    closeNotification()
    if (data.quotationId && !linkedToQuotation) {
      await showWarning('Dokumen berhasil diunduh', 'Backend belum menyimpan salinan dokumen pada quotation. File hasil unduhan tetap tersedia di perangkat ini.')
    } else {
      await showSuccess(
        'Dokumen berhasil dibuat',
        data.quotationId
          ? `File ${format.toUpperCase()} berhasil diunduh dan ditautkan ke quotation.`
          : `File ${format.toUpperCase()} berhasil diunduh.`,
      )
    }


  } catch {
    closeNotification()

    setError('Dokumen gagal dibuat. Periksa kembali data dan coba lagi.')
    await showError('Gagal membuat dokumen', 'Periksa kembali data dan coba lagi.')

  } finally {

    setDownloading(null)

  }
}

  const handleDownloadFilledDocx = async (template: UploadedTemplateRecord) => {
    const itemsText = (data.items || [])
      .map(
        (it, idx) =>
          `${idx + 1}. ${it.description || '-'} - ${it.quantity} ${it.unit} @ Rp ${Number(it.unitPrice || 0).toLocaleString('id-ID')}`,
      )
      .join('\n')

    await downloadFilledDocxTemplate(template, data.number, {
      nomor_surat: data.number,
      nama_penerima: data.recipient,
      perusahaan_penerima: data.recipient,
      alamat_penerima: [data.address, data.city].filter(Boolean).join(', '),
      tanggal_surat: data.date,
      perihal: data.introduction || 'Surat Penawaran Harga',
      nama_pengirim: data.signer,
      jabatan_pengirim: data.position,
      perusahaan_pengirim: data.senderCompany,
      email_pengirim: data.email,
      telepon_pengirim: data.phone,
      items: itemsText,
    })
  }

  const { subtotal, tax, grandTotal } = calculateTotals(
  getPrintedItems(data),
  data,
)

  return (
    <div className="scrollbar h-full w-full min-w-0 max-w-full overflow-auto pb-32">
      <div className="mx-auto flex w-full min-w-0 max-w-[190rem] flex-col gap-24">
        <div className="flex min-w-0 max-w-full flex-wrap items-center justify-between gap-16 rounded-2xl border border-[#E2E8F0] bg-[#FFFFFF] p-20 shadow-sm">
          <div className="flex items-center gap-12">
            <button
              type="button"
              onClick={() => handleCancel()}
              title="Kembali ke Quotation"
              className="inline-flex h-[4rem] w-[4rem] shrink-0 items-center justify-center rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] text-[#000000] transition-colors hover:bg-[#F1F5F9] hover:text-[#000000]"
            >
              <ArrowLeft size={18} />
            </button>
            <div>
              <div className="flex flex-wrap items-center gap-10">
                <h1 className="text-[2.6rem] font-semibold leading-[1.3] text-[#000000]">Surat Penawaran</h1>
                <span
                  data-doc-category-badge="SURAT_PENAWARAN"
                  className={`inline-flex items-center rounded-md px-10 py-4 text-[1.2rem] font-semibold leading-[1.35] ${getDocumentCategoryStyle('SURAT_PENAWARAN').badgeClass}`}
                >
                  Surat Penawaran
                </span>
              </div>
              <p className="mt-4 text-[1.4rem] leading-[1.5] text-[#000000]">
                Isi data penawaran & tabel produk, periksa pratinjau, simpan sebagai Draft atau Surat resmi, dan unduh format yang diinginkan.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-10">
            <button
              type="button"
              id="btn-back-to-templates"
              onClick={() => handleBackToTemplates()}
              className="inline-flex min-h-[4rem] items-center gap-6 rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] px-16 py-8 text-[1.35rem] font-medium leading-[1.3] text-[#000000] transition-colors hover:bg-[#F1F5F9]"
            >
              <span>Pilih Template</span>
            </button>
            <select
              aria-label="Pilih Quotation tersimpan"
              value={data.quotationId || ''}
              onChange={(event) => {
                const id = event.target.value
                if (!id) {
                  try {
                    sessionStorage.removeItem('luma_unsaved_surat_penawaran')
                  } catch {
                    // Ignore
                  }
                  setSignatureFile(null)
                  setStampFile(null)
                  setSearchParams(urlTemplateId ? { templateId: urlTemplateId } : {})
                  setData({ ...initialData, items: [createEmptyItem()] })
                  return
                }
                const found = savedQuotations.find((item) => item.id === id)
                if (found) {
                  setSearchParams(found.templateId || urlTemplateId ? { id, templateId: String(found.templateId || urlTemplateId) } : { id })
                  applyStoredQuotation(found)
                }
              }}
              className="min-h-[4rem] rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-12 py-8 text-[1.35rem] leading-[1.4] text-[#000000] focus:border-[#0000FF] focus:bg-[#FFFFFF] focus:outline-none"
            >
              <option value="">— Buat Baru / Tidak Terkait Quotation —</option>
              {savedQuotations.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.number} — {item.recipient}
                </option>
              ))}
            </select>

            {/* Tombol Simpan sebagai Draft */}
            <button
              type="button"
              id="btn-save-draft"
              disabled={savingQuotation}
              onClick={() => void saveToQuotation('Draft')}
              className="inline-flex min-h-[4rem] items-center gap-6 rounded-xl border border-[#E2E8F0] bg-[#F1F5F9] px-16 py-8 text-[1.35rem] font-semibold leading-[1.3] text-[#000000] transition-colors hover:bg-[#E2E8F0] disabled:opacity-60"
            >
              <Save size={16} />
              <span>Simpan sebagai Draft</span>
            </button>

            {/* Tombol Simpan Surat */}
            <button
              type="button"
              id="btn-save-document"
              disabled={savingQuotation}
              onClick={() => void saveToQuotation('Approved')}
              className="inline-flex min-h-[4rem] items-center gap-6 rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] px-16 py-8 text-[1.35rem] font-semibold leading-[1.3] text-[#0000FF] shadow-sm transition-colors hover:bg-[#F8FAFC] disabled:opacity-60"
            >
              <CheckCircle2 size={16} />
              <span>{data.quotationId ? 'Simpan ke Quotation' : 'Simpan Surat'}</span>
            </button>
          </div>
        </div>

        {/* Banner Template Kustom Aktif */}
        {activeTemplateId && (
          <ActiveTemplateBanner
            templateId={activeTemplateId}
            onDownloadFilledDocx={handleDownloadFilledDocx}
          />
        )}

        <div className="grid min-w-0 max-w-full items-start gap-24 desktop:grid-cols-2">
          <div className="flex min-w-0 max-w-full flex-col gap-24">
            {/* Data penerima dan penawaran */}
            <div className="grid min-w-0 max-w-full gap-24 rounded-2xl border border-[#E2E8F0] bg-[#FFFFFF] p-24 shadow-sm laptop:grid-cols-2 desktop:grid-cols-2">
              <section className="flex min-w-0 max-w-full flex-col gap-12">
                <h2 className="text-[1.8rem] font-semibold text-[#000000]">Penerima</h2>

                <FieldInput
                  label="Nama atau perusahaan tujuan *"
                  value={data.recipient}
                  onChange={(value) => change('recipient', value)}
                />

                <FieldInput
                  label="Alamat tujuan"
                  value={data.address}
                  onChange={(value) => change('address', value)}
                />

                <FieldInput
                  label="Kota dan kode pos"
                  value={data.city}
                  onChange={(value) => change('city', value)}
                />
              </section>

              <section className="flex min-w-0 max-w-full flex-col gap-12">
                <h2 className="text-[1.8rem] font-semibold text-[#000000]">Penawaran</h2>

                <FieldInput
                  label="Tanggal *"
                  type="date"
                  value={data.date}
                  onChange={(value) => change('date', value)}
                />

                <FieldInput
                  label="Nomor penawaran *"
                  value={data.number}
                  onChange={(value) => change('number', value)}
                />

                <FieldInput
                  label="Masa berlaku (hari)"
                  type="number"
                  value={data.validityDays}
                  onChange={(value) => change('validityDays', value)}
                />
              </section>
            </div>

            {/* Deskripsi penawaran */}
            <section className="flex min-w-0 max-w-full flex-col gap-12 rounded-2xl border border-[#E2E8F0] bg-[#FFFFFF] p-24 shadow-sm">
              <div>
                <h2 className="text-[1.8rem] font-semibold text-[#000000]">
                  Deskripsi penawaran
                </h2>

                <p className="text-[#000000]">
                  Tulis paragraf pembuka surat. Tekan Enter untuk membuat
                  baris baru.
                </p>
              </div>

              <FieldTextArea
                label="Deskripsi / paragraf pembuka"
                value={data.introduction}
                placeholder={
                  model
                    ? getIntroduction(
                        { ...data, introduction: '' },
                        model,
                      )
                    : ''
                }
                maxLength={MAX_INTRODUCTION_LENGTH}
                rows={6}
                onChange={(value) => change('introduction', value)}
              />
            </section>

            {/* Tabel produk */}
            <section className="flex min-w-0 max-w-full flex-col gap-16 rounded-2xl border border-[#E2E8F0] bg-[#FFFFFF] p-24 shadow-sm">
              <div>
                <h2 className="text-[1.8rem] font-semibold text-[#000000]">Tabel produk</h2>

                <p className="text-[#000000]">
                  Masukkan maksimal 10 item. Deskripsi dapat diperbesar
                  dengan menarik sudut kanan bawah kolom.
                </p>
              </div>

              <div className="w-full max-w-full overflow-x-auto rounded-xl border border-[#E2E8F0]">
                <table className="w-full min-w-[82rem] border-collapse text-left text-[1.35rem]">
                  <thead className="border-b border-[#E2E8F0] bg-[#F8FAFC] text-[#000000]">
                    <tr>
                      <th className="w-[5.2rem] px-12 py-12 text-center font-semibold leading-[1.4]">
                        No
                      </th>
                      <th className="px-12 py-12 font-semibold leading-[1.4]">Deskripsi</th>
                      <th className="w-[10rem] px-12 py-12 font-semibold leading-[1.4]">Jumlah</th>
                      <th className="w-[11rem] px-12 py-12 font-semibold leading-[1.4]">Satuan</th>
                      <th className="w-[18rem] px-12 py-12 font-semibold leading-[1.4]">
                        Harga satuan (Rp)
                      </th>
                      <th className="w-[15rem] px-12 py-12 text-right font-semibold leading-[1.4]">
                        Total (Rp)
                      </th>
                      <th className="w-[5.2rem] px-12 py-12">
                        <span className="sr-only">Hapus</span>
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {data.items.map((item, index) => (
                      <tr
                        className="border-t border-[#E2E8F0] align-top"
                        key={item.id}
                      >
                        <td className="px-12 py-12 pt-18 text-center font-medium text-[#000000]">
                          {index + 1}
                        </td>

                        <td className="px-12 py-12">
                          <textarea
                            aria-label={`Deskripsi produk ${index + 1}`}
                            value={item.description}
                            rows={5}
                            maxLength={MAX_ITEM_DESCRIPTION_LENGTH}
                            placeholder="Nama produk / jasa beserta keterangannya"
                            onChange={(event) =>
                              changeItem(
                                item.id,
                                'description',
                                event.target.value,
                              )
                            }
                            className={cellInput + ' resize-y'}
                          />
                        </td>

                        <td className="px-12 py-12">
                          <input
                            aria-label={`Jumlah produk ${index + 1}`}
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={(event) =>
                              changeItem(
                                item.id,
                                'quantity',
                                event.target.value,
                              )
                            }
                            className={cellInput}
                          />
                        </td>

                        <td className="px-12 py-12">
                          <input
                            aria-label={`Satuan produk ${index + 1}`}
                            value={item.unit}
                            onChange={(event) =>
                              changeItem(
                                item.id,
                                'unit',
                                event.target.value,
                              )
                            }
                            className={cellInput}
                          />
                        </td>

                        <td className="px-12 py-12">
                          <input
                            aria-label={`Harga satuan produk ${index + 1}`}
                            type="number"
                            min="0"
                            value={item.unitPrice}
                            onChange={(event) =>
                              changeItem(
                                item.id,
                                'unitPrice',
                                event.target.value,
                              )
                            }
                            className={cellInput}
                          />
                        </td>

                        <td className="px-12 py-12 pt-18 text-right font-medium text-[#000000]">
                          {Math.round(
                            item.quantity * item.unitPrice,
                          ).toLocaleString('id-ID')}
                        </td>

                        <td className="px-12 py-12 text-center">
                          <button
                            type="button"
                            onClick={() => void removeItem(item.id)}
                            aria-label={`Hapus baris ${index + 1}`}
                            title="Hapus baris"
                            className={`${ACTION_BUTTON_CLASSES.deleteIconOnly} mt-4 h-[3.8rem] w-[3.8rem]`}
                          >
                            <Trash2 size={15} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-wrap items-start justify-between gap-16">
                <button
                  type="button"
                  onClick={addItem}
                  disabled={data.items.length >= MAX_ITEMS}
                  className="inline-flex min-h-[4rem] items-center gap-8 rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] px-16 py-10 text-[1.4rem] font-medium leading-[1.4] text-[#000000] transition-colors hover:bg-[#F1F5F9] disabled:opacity-60"
                >
                  <Plus size={16} />
                  Tambah baris
                </button>

<div className="text-right">
  <p className="text-[1.45rem] leading-[1.5] text-[#000000]">Subtotal: {rupiahFormatter.format(subtotal)}</p>

  <div className="mt-12 flex flex-col items-end gap-10">
    <label className="flex cursor-pointer items-center justify-end gap-8 text-[1.4rem] leading-[1.4] text-[#000000]">
      <input
        type="checkbox"
        checked={data.taxEnabled !== false}
        onChange={(event) =>
          setData((previous) => ({
            ...previous,
            taxEnabled: event.target.checked,
          }))
        }
        className="h-16 w-16 shrink-0 accent-[#2563EB]"
      />
      <span>Gunakan PPN</span>
    </label>

    {data.taxEnabled !== false && (
      <>
        <label className="flex items-center justify-end gap-10 text-[1.4rem] leading-[1.4] text-[#000000]">
          <span>Metode PPN:</span>
          <select
            value={data.taxMode ?? 'manual'}
            onChange={(event) =>
              setData((previous) => ({
                ...previous,
                taxMode: event.target.value as TaxMode,
              }))
            }
            className="min-h-[4rem] rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] px-12 py-8 text-[1.4rem] leading-[1.4] text-[#000000] focus:border-[#0000FF] focus:outline-none"
          >
            <option value="manual">Nominal manual (Rp)</option>
            <option value="percent">Persentase (%)</option>
          </select>
        </label>

        {data.taxMode === 'percent' ? (
          <label className="flex items-center justify-end gap-10 text-[1.4rem] leading-[1.4] text-[#000000]">
            <span>Persentase PPN (%):</span>
            <input
              aria-label="Persentase PPN"
              type="number"
              min="0"
              step="0.01"
              value={data.taxRate ?? 11}
              onChange={(event) =>
                setData((previous) => ({
                  ...previous,
                  taxRate:
                    event.target.value === ''
                      ? 0
                      : Math.max(0, Number(event.target.value) || 0),
                }))
              }
              className="min-h-[4rem] w-[14rem] rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] px-12 py-8 text-right text-[1.4rem] leading-[1.4] text-[#000000] focus:border-[#0000FF] focus:outline-none"
            />
          </label>
        ) : (
          <label className="flex items-center justify-end gap-10 text-[1.4rem] leading-[1.4] text-[#000000]">
            <span>Nominal PPN (Rp):</span>
            <input
              aria-label="Nominal PPN dalam rupiah"
              type="number"
              min="0"
              step="1"
              value={data.taxManualAmount ?? 0}
              onChange={(event) =>
                setData((previous) => ({
                  ...previous,
                  taxManualAmount:
                    event.target.value === ''
                      ? 0
                      : Math.max(0, Number(event.target.value) || 0),
                }))
              }
              className="min-h-[4rem] w-[16rem] rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] px-12 py-8 text-right text-[1.4rem] leading-[1.4] text-[#000000] focus:border-[#0000FF] focus:outline-none"
            />
          </label>
        )}
      </>
    )}
  </div>

  <p className="mt-10 text-[1.45rem] leading-[1.5] text-[#000000]">
    PPN: {rupiahFormatter.format(tax)}
  </p>

  <p className="mt-4 text-[1.6rem] font-semibold leading-[1.5] text-[#000000]">
    Grand total: {rupiahFormatter.format(grandTotal)}
  </p>
</div>
              </div>
            </section>

            {/* Pengirim, tanda tangan, dan stempel */}
            <section className="grid gap-14 rounded-2xl border border-[#E2E8F0] bg-[#FFFFFF] p-24 shadow-sm md:grid-cols-2">
              <h2 className="md:col-span-2 text-[2.2rem] font-semibold leading-[1.3] text-[#000000]">
                Pengirim dan penandatangan
              </h2>

              <FieldInput
                label="Nama perusahaan pengirim *"
                value={data.senderCompany}
                onChange={(value) => change('senderCompany', value)}
              />

              <FieldInput
                label="Nama penandatangan"
                value={data.signer}
                onChange={(value) => change('signer', value)}
              />

              <FieldInput
                label="Jabatan"
                value={data.position}
                onChange={(value) => change('position', value)}
              />

              <FieldInput
                label="Email (opsional)"
                type="email"
                value={data.email}
                onChange={(value) => change('email', value)}
              />

              <FieldInput
                label="Nomor kontak (opsional)"
                type="tel"
                value={data.phone}
                onChange={(value) => change('phone', value)}
              />

              {/* Input tanda tangan */}
              <div className="flex flex-col gap-6">
                <label className="flex min-w-0 flex-col gap-6 text-[1.4rem] font-medium leading-[1.4] text-[#000000]">
                  <span>Template tanda tangan (PNG/JPG/WEBP)</span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={(event) => {
                      void handleAssetImageChange('signature', event.target.files?.[0] ?? null)
                    }}
                    className="min-h-[4.2rem] w-full rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] px-12 py-8 text-[1.35rem] font-normal leading-[1.4] text-[#000000]"
                  />
                </label>

                {signatureFile && (
                  <span className="text-[1.3rem] leading-[1.4] text-[#000000]">
                    Dipilih: {signatureFile.name}
                  </span>
                )}

                {data.signatureImage && (
                  <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-14">
                    <p className="mb-8 text-[1.35rem] font-medium leading-[1.4] text-[#000000]">
                      Pratinjau tanda tangan
                    </p>
                    <img
                      src={data.signatureImage}
                      alt="Pratinjau tanda tangan"
                      className="max-h-[9.6rem] max-w-full object-contain"
                    />
                  </div>
                )}
              </div>

              {/* Input stempel */}
              <div className="flex flex-col gap-6">
                <label className="flex min-w-0 flex-col gap-6 text-[1.4rem] font-medium leading-[1.4] text-[#000000]">
                  <span>Template stempel perusahaan (PNG/JPG/WEBP)</span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={(event) => {
                      void handleAssetImageChange('stamp', event.target.files?.[0] ?? null)
                    }}
                    className="min-h-[4.2rem] w-full rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] px-12 py-8 text-[1.35rem] font-normal leading-[1.4] text-[#000000]"
                  />
                </label>

                {stampFile && (
                  <span className="text-[1.3rem] leading-[1.4] text-[#000000]">
                    Dipilih: {stampFile.name}
                  </span>
                )}

                {data.stampImage && (
                  <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-14">
                    <p className="mb-8 text-[1.35rem] font-medium leading-[1.4] text-[#000000]">
                      Pratinjau stempel
                    </p>
                    <img
                      src={data.stampImage}
                      alt="Pratinjau stempel perusahaan"
                      className="max-h-[9.6rem] max-w-full object-contain"
                    />
                  </div>
                )}
              </div>

              {uploadMessage && (
                <p
                  role="status"
                  className="md:col-span-2 text-[1.35rem] leading-[1.4] text-[#000000]"
                >
                  {uploadMessage}
                </p>
              )}
            </section>

            <p className="text-[1.35rem] leading-[1.4] text-[#000000]">
              Email dan nomor kontak bersifat opsional.
            </p>
          </div>

          {/* Pratinjau surat dan tombol ekspor */}
          <aside className="flex min-w-0 max-w-full flex-col gap-14 rounded-2xl border border-[#E2E8F0] bg-[#FFFFFF] p-24 shadow-sm desktop:sticky desktop:top-0">
            <div className="flex flex-wrap items-center justify-between gap-12">
              <div className="flex flex-wrap items-center gap-10">
                <h2 className="text-[1.8rem] font-semibold leading-[1.3] text-[#000000]">
                  Pratinjau surat
                </h2>
                <span
                  data-preview-doc-badge="SURAT_PENAWARAN"
                  className={`inline-flex items-center rounded-md px-10 py-3 text-[1.15rem] font-semibold leading-[1.3] ${getDocumentCategoryStyle('SURAT_PENAWARAN').badgeClass}`}
                >
                  Surat Penawaran
                </span>
              </div>

              <button
                type="button"
                onClick={() =>
                  setShowPreview((previous) => !previous)
                }
                aria-pressed={showPreview}
                className="btn-action-preview inline-flex min-h-[4rem] items-center gap-8 rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] px-16 py-10 text-[1.35rem] font-semibold leading-[1.4] text-[#000000] transition-colors hover:bg-[#F8FAFC]"
              >
                {showPreview ? <EyeOff size={16} /> : <Eye size={16} />}
                {showPreview ? 'Sembunyikan' : 'Tampilkan pratinjau'}
              </button>
            </div>

            {error && (
              <p role="alert" className="text-[1.35rem] leading-[1.4] text-[#000000]">
                {error}
              </p>
            )}

            <div className="flex flex-wrap gap-10">
              <ExportButton
                icon={<FileSpreadsheet size={16} className="text-white" />}
                label="Unduh Excel (.xlsx)"
                busyLabel="Menyiapkan Excel..."
                busy={downloading === 'xlsx'}
                disabled={downloading !== null}
                onClick={() => download('xlsx')}
                isExcel
              />

              <ExportButton
                icon={<FileText size={16} />}
                label="Unduh PDF (.pdf)"
                busyLabel="Menyiapkan PDF..."
                busy={downloading === 'pdf'}
                disabled={downloading !== null}
                onClick={() => download('pdf')}
              />

              <ExportButton
                icon={<FileType size={16} />}
                label="Unduh Word (.docx)"
                busyLabel="Menyiapkan Word..."
                busy={downloading === 'docx'}
                disabled={downloading !== null}
                onClick={() => download('docx')}
              />
            </div>

            {showPreview && <QuotationPreview data={data} />}
          </aside>
        </div>
      </div>
    </div>
  )
}

function FieldInput({
  label,
  value,
  onChange,
  type = 'text',
}: {
  label: string
  value: string | number
  onChange: (value: string) => void
  type?: string
}) {
  return (
    <label className="flex min-w-0 flex-col gap-6 text-[1.4rem] font-medium leading-[1.4] text-[#000000]">
      <span>{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        min={type === 'number' ? '0' : undefined}
        className="min-h-[4.2rem] w-full rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] px-14 py-10 text-[1.4rem] font-normal leading-[1.45] text-[#000000] focus:border-[#0000FF] focus:outline-none"
      />
    </label>
  )
}

function FieldTextArea({
  label,
  value,
  onChange,
  placeholder,
  maxLength,
  rows = 3,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  maxLength: number
  rows?: number
}) {
  return (
    <label className="flex min-w-0 flex-col gap-6 text-[1.4rem] font-medium leading-[1.4] text-[#000000]">
      <span>{label}</span>
      <textarea
        value={value}
        rows={rows}
        maxLength={maxLength}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="w-full resize-y rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] px-14 py-10 text-[1.4rem] font-normal leading-[1.5] text-[#000000] focus:border-[#0000FF] focus:outline-none"
      />
      <span className="self-end text-[1.3rem] font-normal leading-[1.4] text-[#000000]">
        {value.length}/{maxLength}
      </span>
    </label>
  )
}

function ExportButton({
  icon,
  label,
  busyLabel,
  busy,
  disabled,
  onClick,
  isExcel = false,
}: {
  icon?: JSX.Element
  label: string
  busyLabel?: string
  busy?: boolean
  disabled?: boolean
  onClick: () => void
  isExcel?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={
        isExcel
          ? 'inline-flex min-h-[4rem] items-center justify-center gap-8 rounded-xl border border-[#15803D] bg-[#15803D] px-16 py-10 text-[1.35rem] font-semibold leading-[1.4] text-white transition-colors hover:bg-[#166534] disabled:opacity-60'
          : 'btn-action-download inline-flex min-h-[4rem] items-center justify-center gap-8 rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] px-16 py-10 text-[1.35rem] font-semibold leading-[1.4] text-[#008000] transition-colors hover:bg-[#F8FAFC] disabled:opacity-60'
      }
    >
      {icon}
      {busy ? busyLabel : label}
    </button>
  )
}
