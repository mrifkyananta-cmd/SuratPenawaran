import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import pdfMake from 'pdfmake/build/pdfmake'
import * as pdfFonts from 'pdfmake/build/vfs_fonts'
import DocumentActions from '@/components/common/documentAction'
import FormInput from '@/components/ui/formInput'
import FormTextArea from '@/components/ui/formTextArea'
import PDFPreview from '@/components/common/pdfPreview'
import { generatePdfDefinition, type SuratPesananFormData } from './generatePDFDefenition'
import dayjs from 'dayjs'
import 'dayjs/locale/id'
import { ArrowLeft, CheckCircle2, Eye, FilePlus2, Plus, Save, Trash2 } from 'lucide-react'
import { closeNotification, showConfirm, showError, showLoading, showSuccess, showWarning } from '@/utils/notifications'
import { billingRequest } from '@/utils/billingApi'
import { ACTION_BUTTON_CLASSES, getDocumentCategoryStyle, getSemanticStatusClass } from '@/utils/semanticTokens'
import ActiveTemplateBanner from '../components/ActiveTemplateBanner'
import { downloadFilledDocxTemplate } from '../utils/docxTemplateFiller'
import type { UploadedTemplateRecord } from '../components/UploadTemplateModal'

pdfMake.vfs = pdfFonts.vfs

type StoredLetterDocument = {
  id: string
  type: string
  number: string
  title: string
  recipient: string
  date: string
  status?: string
  purchaseOrderId: string | null
  payload: SuratPesananFormData
  templateId?: string | null
  updatedAt: string
}

type PurchaseOrderRecord = {
  id: string
  poNumber: string
  recipient: string
  date: string
  notes: string | null
  quotationId: string | null
  quotation?: {
    id: string
    number: string
    recipient: string
    address: string
    city: string
    phone: string
    items: Array<{
      description: string
      quantity: number
      unit: string
      unitPrice: number
    }>
  } | null
}

function createEmptyFormData(): SuratPesananFormData {
  return {
    logo: '',
    header1: 'PT Luma',
    header2: 'Divisi Pengadaan & Kontrak',
    header3: '',
    nomor_surat: '',
    perihal: 'Surat Pesanan Barang (Purchase Order)',
    ref_penawaran: '',
    tempat_tanggal: `Jakarta, ${dayjs().locale('id').format('DD MMMM YYYY')}`,
    vendor_nama: '',
    vendor_perusahaan: '',
    vendor_alamat: '',
    vendor_kontak: '',
    pembuka:
      'Dengan hormat,\nMenindaklanjuti surat penawaran harga yang telah disepakati sebelumnya, bersama ini kami sampaikan pesanan resmi (Purchase Order) untuk barang-barang berikut:',
    items: [{ nama: '', jumlah: 1, satuan: 'Pcs', harga: 0 }],
    kenaPpn: true,
    alamat_kirim: '',
    tgl_kirim: 'Maksimal 7 hari kerja setelah PO diterbitkan',
    syarat_bayar: 'Transfer Bank TOP 30 hari setelah invoice diterima',
    penutup:
      'Demikian surat pesanan ini kami sampaikan. Mohon konfirmasi penerimaan pesanan dan estimasi pengiriman barang. Atas kerjasamanya kami ucapkan terima kasih.',
    pemesan_perusahaan: 'PT Luma',
    pemesan_nama: '',
  }
}

export default function SuratPesanan() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const urlDocId = searchParams.get('id') || ''
  const urlTemplateId = searchParams.get('templateId') || ''

  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [formData, setFormData] = useState<SuratPesananFormData>(() => {
    if (!urlDocId) {
      try {
        const cached = sessionStorage.getItem('luma_unsaved_surat_pesanan')
        if (cached) {
          const parsed = JSON.parse(cached)
          if (parsed && typeof parsed === 'object') {
            return { ...createEmptyFormData(), ...parsed }
          }
        }
      } catch {
        // Ignore storage error
      }
    }
    return createEmptyFormData()
  })
  const [savedDocs, setSavedDocs] = useState<StoredLetterDocument[]>([])
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrderRecord[]>([])
  const [selectedDocId, setSelectedDocId] = useState(urlDocId)
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(urlTemplateId || null)
  const [currentStatus, setCurrentStatus] = useState<string>('Draft')
  const [linkedPoId, setLinkedPoId] = useState('')
  const [syncToPo, setSyncToPo] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showMobilePreview, setShowMobilePreview] = useState(false)

  useEffect(() => {
    if (!urlDocId && !selectedDocId) {
      try {
        sessionStorage.setItem('luma_unsaved_surat_pesanan', JSON.stringify(formData))
      } catch {
        // Ignore storage error
      }
    }
  }, [formData, urlDocId, selectedDocId])

  const loadData = useCallback(async () => {
    try {
      const [docs, pos] = await Promise.all([
        billingRequest<StoredLetterDocument[]>('/letter-documents?type=SURAT_PESANAN'),
        billingRequest<PurchaseOrderRecord[]>('/purchase-orders'),
      ])
      setSavedDocs(docs || [])
      setPurchaseOrders(pos || [])
      return { docs: docs || [], pos: pos || [] }
    } catch {
      return { docs: [], pos: [] }
    }
  }, [])

  useEffect(() => {
    void loadData().then(({ docs }) => {
      if (urlDocId) {
        const found = docs.find((d) => d.id === urlDocId)
        if (found?.payload) {
          setSelectedDocId(found.id)
          setCurrentStatus(found.status || 'Draft')
          setLinkedPoId(found.purchaseOrderId || '')
          if (found.templateId) {
            setActiveTemplateId(found.templateId)
          }
          setFormData({ ...createEmptyFormData(), ...found.payload })
        }
      } else if (urlTemplateId) {
        setActiveTemplateId(urlTemplateId)
      }
    })
  }, [loadData, urlDocId, urlTemplateId])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }))
  }

  const handleItemChange = (index: number, field: string, value: string | number) => {
    setFormData((prev) => {
      const updated = [...prev.items]
      updated[index] = { ...updated[index], [field]: value }
      return { ...prev, items: updated }
    })
  }

  const addItem = () => {
    setFormData((prev) => ({
      ...prev,
      items: [...prev.items, { nama: '', jumlah: 1, satuan: 'Pcs', harga: 0 }],
    }))
  }

  const removeItem = async (index: number) => {
    if (formData.items.length <= 1) return
    if (!(await showConfirm('Hapus barang dari surat pesanan?', 'Perubahan ini berlaku pada dokumen yang sedang disusun.', 'Ya, hapus'))) return
    setFormData((prev) => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index),
    }))
  }

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onloadend = () => {
      setFormData((prev) => ({
        ...prev,
        logo: reader.result as string,
      }))
    }
    reader.readAsDataURL(file)
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const docDef = generatePdfDefinition(formData)
        const pdfDoc = pdfMake.createPdf(docDef)
        pdfDoc.getBlob((blob) => {
          const url = URL.createObjectURL(blob)
          setPdfUrl((prev) => {
            if (prev) URL.revokeObjectURL(prev)
            return url
          })
        })
      } catch (err) {
        console.error('Error generating PDF:', err)
      }
    }, 600)
    return () => clearTimeout(timer)
  }, [formData])

  const handleSelectPO = (poId: string) => {
    setLinkedPoId(poId)
    if (!poId) return
    const po = purchaseOrders.find((item) => item.id === poId)
    if (!po) return

    setFormData((prev) => ({
      ...prev,
      nomor_surat: po.poNumber || prev.nomor_surat,
      vendor_perusahaan: po.recipient || prev.vendor_perusahaan,
      vendor_nama: po.recipient || prev.vendor_nama,
      ref_penawaran: po.quotation?.number || prev.ref_penawaran,
      vendor_alamat: po.quotation
        ? [po.quotation.address, po.quotation.city].filter(Boolean).join(', ')
        : prev.vendor_alamat,
      vendor_kontak: po.quotation?.phone || prev.vendor_kontak,
      items: po.quotation?.items?.length
        ? po.quotation.items.map((item) => ({
            nama: item.description,
            jumlah: Number(item.quantity || 1),
            satuan: item.unit || 'Pcs',
            harga: Number(item.unitPrice || 0),
          }))
        : prev.items,
    }))
  }

  const handleSaveDocument = async (targetStatus: 'Draft' | 'Disimpan' = 'Disimpan') => {
    const recipient = formData.vendor_perusahaan.trim() || formData.vendor_nama.trim()
    if (!formData.nomor_surat.trim() || !recipient) {
      await showWarning('Data belum lengkap', 'Nomor PO dan Nama Perusahaan / Vendor wajib diisi sebelum menyimpan.')
      return
    }

    setSaving(true)
    showLoading(targetStatus === 'Draft' ? 'Menyimpan sebagai Draft...' : 'Menyimpan Surat Pesanan...')
    try {
      const saved = await billingRequest<StoredLetterDocument>(
        selectedDocId ? `/letter-documents/${selectedDocId}` : '/letter-documents',
        {
          method: selectedDocId ? 'PUT' : 'POST',
          body: JSON.stringify({
            type: 'SURAT_PESANAN',
            number: formData.nomor_surat.trim(),
            title: formData.perihal.trim() || 'Surat Pesanan (PO)',
            recipient,
            date: dayjs().format('YYYY-MM-DD'),
            status: targetStatus,
            purchaseOrderId: linkedPoId || null,
            syncPurchaseOrder: syncToPo,
            notes: formData.syarat_bayar || 'Dibuat melalui Surat Pesanan.',
            payload: formData,
            templateId: activeTemplateId || null,
          }),
        },
      )
      try {
        sessionStorage.removeItem('luma_unsaved_surat_pesanan')
      } catch {
        // Ignore storage error
      }
      setSelectedDocId(saved.id)
      setCurrentStatus(saved.status || targetStatus)
      if (saved.purchaseOrderId) {
        setLinkedPoId(saved.purchaseOrderId)
      }
      if (saved.templateId) {
        setActiveTemplateId(saved.templateId)
      }
      setSearchParams(
        saved.templateId ? { id: saved.id, templateId: saved.templateId } : { id: saved.id },
      )
      await loadData()
      closeNotification()
      await showSuccess(
        targetStatus === 'Draft' ? 'Draft tersimpan' : 'Surat Pesanan tersimpan',
        syncToPo
          ? `Surat Pesanan ${saved.number} tersimpan (${saved.status || targetStatus}) dan disinkronkan ke daftar Purchase Order (/po).`
          : `Surat Pesanan ${saved.number} berhasil tersimpan ke database.`,
      )
    } catch (error) {
      closeNotification()
      await showError('Gagal menyimpan Surat Pesanan', error instanceof Error ? error.message : 'Periksa koneksi backend.')
    } finally {
      setSaving(false)
    }
  }

  const handleDownloadFilledDocx = async (template: UploadedTemplateRecord) => {
    const itemsText = formData.items
      .map(
        (it, idx) =>
          `${idx + 1}. ${it.nama || '-'} - ${it.jumlah} ${it.satuan} @ Rp ${Number(it.harga || 0).toLocaleString('id-ID')}`,
      )
      .join('\n')
    const recipient = formData.vendor_perusahaan.trim() || formData.vendor_nama.trim()

    await downloadFilledDocxTemplate(template, formData.nomor_surat, {
      nomor_surat: formData.nomor_surat,
      nama_penerima: recipient,
      perusahaan_penerima: formData.vendor_perusahaan,
      alamat_penerima: formData.vendor_alamat,
      tanggal_surat: formData.tempat_tanggal,
      perihal: formData.perihal,
      lampiran: '-',
      pembuka: formData.pembuka,
      penutup: formData.penutup,
      nama_pengirim: formData.pemesan_nama,
      perusahaan_pengirim: formData.pemesan_perusahaan,
      syarat_bayar: formData.syarat_bayar,
      tgl_kirim: formData.tgl_kirim,
      alamat_kirim: formData.alamat_kirim,
      items: itemsText,
    })
  }

  const handleDeleteDocument = async () => {
    if (!selectedDocId) return
    if (!(await showConfirm('Hapus dokumen Surat Pesanan?', 'Dokumen surat akan dihapus dari database.', 'Ya, hapus'))) return
    showLoading('Menghapus dokumen...')
    try {
      await billingRequest(`/letter-documents/${selectedDocId}`, { method: 'DELETE' })
      setSelectedDocId('')
      setLinkedPoId('')
      setSearchParams({})
      setFormData(createEmptyFormData())
      await loadData()
      closeNotification()
      await showSuccess('Dokumen berhasil dihapus')
    } catch (error) {
      closeNotification()
      await showError('Gagal menghapus dokumen', error instanceof Error ? error.message : 'Periksa hak akses atau koneksi backend.')
    }
  }

  const handleCancel = () => {
    navigate('/quotation')
  }

  const handleBackToTemplates = () => {
    navigate('/quotation?openTemplates=1')
  }

  const handleDownload = () => {
    pdfMake.createPdf(generatePdfDefinition(formData)).download('surat-pesanan.pdf')
  }

  const handlePrint = () => {
    pdfMake.createPdf(generatePdfDefinition(formData)).print()
  }

  const handleOpen = () => {
    pdfMake.createPdf(generatePdfDefinition(formData)).open()
  }

  return (
    <div className="scrollbar flex h-full w-full gap-24 overflow-auto pb-32 tablet:h-auto tablet:flex-col tablet:overflow-visible phones:h-auto phones:flex-col phones:overflow-visible">
      {/* Kolom Form */}
      <div className="scrollbar flex h-full w-1/2 tablet:w-full tablet:h-auto tablet:overflow-visible flex-col gap-24 overflow-auto phones:h-auto phones:w-full phones:overflow-visible">
        {/* Header Aksi Atas */}
        <div className="flex flex-wrap items-center justify-between gap-12 rounded-2xl border border-[#E2E8F0] bg-[#FFFFFF] p-20 shadow-sm">
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
              <div className="flex flex-wrap items-center gap-8">
                <h1 className="text-[2.4rem] font-semibold leading-[1.3] text-[#000000]">Surat Pesanan (PO)</h1>
                <span
                  data-doc-category-badge="SURAT_PESANAN"
                  className={`inline-flex items-center rounded-md px-10 py-4 text-[1.2rem] font-semibold leading-[1.3] ${getDocumentCategoryStyle('SURAT_PESANAN').badgeClass}`}
                >
                  Surat Pesanan
                </span>
                <span
                  data-status-badge={currentStatus}
                  className={`inline-flex items-center rounded-full px-10 py-4 text-[1.2rem] font-semibold leading-[1.3] ${getSemanticStatusClass(currentStatus)}`}
                >
                  {currentStatus}
                </span>
              </div>
              <p className="mt-4 text-[1.35rem] leading-[1.5] text-[#000000]">
                Langkah 2: Isi rincian pesanan, ketentuan pengiriman, simpan sebagai Draft atau PO resmi.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-10">
            <button
              type="button"
              id="btn-back-to-templates"
              onClick={() => handleBackToTemplates()}
              className="inline-flex min-h-[4rem] items-center gap-6 rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] px-16 py-8 text-[1.3rem] font-medium leading-[1.3] text-[#000000] transition-colors hover:bg-[#F1F5F9]"
            >
              <span>Pilih Template</span>
            </button>
            <button
              type="button"
              onClick={() => setShowMobilePreview(!showMobilePreview)}
              className="btn-action-preview hidden items-center gap-6 rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] px-12 py-8 text-[1.3rem] font-semibold text-[#000000] transition-colors hover:bg-[#F8FAFC] phones:inline-flex"
            >
              <Eye size={15} />
              <span>{showMobilePreview ? 'Tutup Pratinjau' : 'Pratinjau Surat'}</span>
            </button>
            <DocumentActions onOpen={handleOpen} onPrint={handlePrint} onDownload={handleDownload} />
          </div>
        </div>

        {/* Banner Template Kustom Aktif */}
        {activeTemplateId && (
          <ActiveTemplateBanner
            templateId={activeTemplateId}
            onDownloadFilledDocx={handleDownloadFilledDocx}
          />
        )}

        {/* Bar Pilihan & Sinkronisasi */}
        <div className="flex flex-col gap-12 rounded-2xl border border-[#E2E8F0] bg-[#FFFFFF] p-16 shadow-sm">
          <div className="flex flex-wrap items-center gap-10">
            <select
              aria-label="Pilih Surat Pesanan tersimpan"
              value={selectedDocId}
              onChange={(e) => {
                const id = e.target.value
                setSelectedDocId(id)
                if (!id) {
                  setLinkedPoId('')
                  setSearchParams(urlTemplateId ? { templateId: urlTemplateId } : {})
                  setFormData(createEmptyFormData())
                  setCurrentStatus('Draft')
                  setActiveTemplateId(urlTemplateId || null)
                  return
                }
                const doc = savedDocs.find((item) => item.id === id)
                if (doc?.payload) {
                  setSearchParams(doc.templateId ? { id, templateId: doc.templateId } : { id })
                  setCurrentStatus(doc.status || 'Draft')
                  setLinkedPoId(doc.purchaseOrderId || '')
                  setActiveTemplateId(doc.templateId || null)
                  setFormData({ ...createEmptyFormData(), ...doc.payload })
                }
              }}
              className="min-w-[22rem] flex-1 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-12 py-10 text-[1.4rem] text-[#000000] focus:border-[#0000FF] focus:bg-[#FFFFFF] focus:outline-none"
            >
              <option value="">— Dokumen Surat Pesanan Baru —</option>
              {savedDocs.map((doc) => (
                <option key={doc.id} value={doc.id}>
                  {doc.number} — {doc.recipient} ({doc.status || 'Draft'})
                </option>
              ))}
            </select>

            <select
              aria-label="Muat dari Purchase Order (/po)"
              value={linkedPoId}
              onChange={(e) => handleSelectPO(e.target.value)}
              className="min-w-[22rem] flex-1 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-12 py-10 text-[1.4rem] text-[#000000] focus:border-[#0000FF] focus:bg-[#FFFFFF] focus:outline-none"
            >
              <option value="">— Hubungkan / Muat dari PO (/po) —</option>
              {purchaseOrders.map((po) => (
                <option key={po.id} value={po.id}>
                  {po.poNumber} — {po.recipient}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-10 border-t border-[#E2E8F0] pt-10">
            <label className="flex cursor-pointer items-center gap-8 text-[1.4rem] leading-[1.4] text-[#000000]">
              <input
                type="checkbox"
                checked={syncToPo}
                onChange={(e) => setSyncToPo(e.target.checked)}
                className="h-16 w-16 shrink-0 accent-[#2563EB]"
              />
              <span>Sinkronkan ke daftar Purchase Order (/po) saat disimpan</span>
            </label>

            <div className="flex flex-wrap items-center gap-8">
              <button
                type="button"
                onClick={() => {
                  try {
                    sessionStorage.removeItem('luma_unsaved_surat_pesanan')
                  } catch {
                    // Ignore
                  }
                  setSelectedDocId('')
                  setLinkedPoId('')
                  setSearchParams(urlTemplateId ? { templateId: urlTemplateId } : {})
                  setFormData(createEmptyFormData())
                  setCurrentStatus('Draft')
                  setActiveTemplateId(urlTemplateId || null)
                }}
                className="inline-flex min-h-[3.8rem] items-center gap-6 rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] px-12 py-8 text-[1.4rem] font-medium text-[#000000] transition-colors hover:bg-[#F1F5F9]"
              >
                <FilePlus2 size={16} />
                Buat Baru
              </button>

              {/* Tombol Simpan sebagai Draft */}
              <button
                type="button"
                id="btn-save-draft"
                disabled={saving}
                onClick={() => void handleSaveDocument('Draft')}
                className="inline-flex min-h-[4rem] items-center gap-6 rounded-xl border border-[#E2E8F0] bg-[#F1F5F9] px-16 py-8 text-[1.4rem] font-semibold leading-[1.3] text-[#000000] transition-colors hover:bg-[#E2E8F0] disabled:opacity-60"
              >
                <Save size={16} />
                <span>Simpan sebagai Draft</span>
              </button>

              {/* Tombol Simpan Surat */}
              <button
                type="button"
                id="btn-save-document"
                disabled={saving}
                onClick={() => void handleSaveDocument('Disimpan')}
                className="inline-flex min-h-[4rem] items-center gap-6 rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] px-16 py-8 text-[1.4rem] font-semibold leading-[1.3] text-[#0000FF] shadow-sm transition-colors hover:bg-[#F8FAFC] disabled:opacity-60"
              >
                <CheckCircle2 size={16} />
                <span>Simpan Surat</span>
              </button>

              {selectedDocId && (
                <button
                  type="button"
                  onClick={() => void handleDeleteDocument()}
                  className="btn-action-delete inline-flex min-h-[4rem] items-center gap-6 rounded-xl border border-[#B91C1C] bg-[#B91C1C] px-14 py-8 text-[1.35rem] font-semibold text-white shadow-sm transition-colors hover:bg-[#991B1B]"
                >
                  <Trash2 size={15} className="text-white" />
                  <span>Hapus</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Input Form Fields */}
        <div className="flex flex-col gap-20 rounded-2xl border border-[#E2E8F0] bg-[#FFFFFF] p-24 shadow-sm">
          <h2 className="text-[2rem] font-semibold leading-[1.3] text-[#000000]">Kop Surat / Identitas Pemesan</h2>
          <label className="flex flex-col gap-6 text-[1.4rem] leading-[1.4] text-[#000000]">
            <span>Upload Logo Perusahaan:</span>
            <input type="file" accept="image/*" onChange={handleImageUpload} className="min-h-[4.2rem] rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] px-12 py-8 text-[1.35rem] text-[#000000]" />
          </label>
          <FormInput name="header1" value={formData.header1} onChange={handleChange} placeholder="Nama Perusahaan Pemesan" />
          <FormInput name="header2" value={formData.header2} onChange={handleChange} placeholder="Sub Header / Divisi" />
          <FormInput name="header3" value={formData.header3} onChange={handleChange} placeholder="Alamat & Kontak Pemesan" />

          <h2 className="mt-8 text-[2rem] font-semibold leading-[1.3] text-[#000000]">Informasi Surat Pesanan</h2>
          <div className="grid grid-cols-2 gap-12 phones:grid-cols-1">
            <FormInput name="nomor_surat" value={formData.nomor_surat} onChange={handleChange} placeholder="Nomor PO (contoh: PO-2026-001) *" />
            <FormInput name="tempat_tanggal" value={formData.tempat_tanggal} onChange={handleChange} placeholder="Tempat, Tanggal *" />
            <FormInput name="ref_penawaran" value={formData.ref_penawaran} onChange={handleChange} placeholder="Referensi No. Penawaran" />
            <FormInput name="perihal" value={formData.perihal} onChange={handleChange} placeholder="Perihal" />
          </div>

          <h2 className="mt-8 text-[2rem] font-semibold leading-[1.3] text-[#000000]">Penerima Pesanan (Vendor/Supplier)</h2>
          <FormInput name="vendor_nama" value={formData.vendor_nama} onChange={handleChange} placeholder="Nama Kontak Rekanan" />
          <FormInput name="vendor_perusahaan" value={formData.vendor_perusahaan} onChange={handleChange} placeholder="Nama Perusahaan Rekanan *" />
          <FormInput name="vendor_alamat" value={formData.vendor_alamat} onChange={handleChange} placeholder="Alamat Rekanan" />
          <FormInput name="vendor_kontak" value={formData.vendor_kontak} onChange={handleChange} placeholder="No. Telepon Rekanan" />

          <h2 className="mt-8 text-[2rem] font-semibold leading-[1.3] text-[#000000]">Isi Pesanan</h2>
          <FormTextArea name="pembuka" value={formData.pembuka} onChange={handleChange} placeholder="Kalimat Pembuka" rows={3} />

          <h2 className="mt-8 text-[2rem] font-semibold leading-[1.3] text-[#000000]">Daftar Barang yang Dipesan</h2>
          <div className="flex items-center justify-between gap-12">
            <label className="flex cursor-pointer items-center gap-8 text-[1.4rem] leading-[1.4]">
              <input
                type="checkbox"
                checked={formData.kenaPpn}
                onChange={(e) => setFormData({ ...formData, kenaPpn: e.target.checked })}
                className="h-16 w-16 shrink-0 accent-[#2563EB]"
              />
              <span className="font-medium text-[#000000]">Kenakan PPN 11%</span>
            </label>
            <button
              type="button"
              onClick={addItem}
              className="inline-flex min-h-[3.8rem] items-center gap-6 rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] px-14 py-8 text-[1.35rem] font-medium leading-[1.4] text-[#000000] transition-colors hover:bg-[#F1F5F9]"
            >
              <Plus size={14} /> Tambah Item
            </button>
          </div>

          {formData.items.map((item, idx) => (
            <div key={idx} className="flex flex-col gap-10 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-16">
              <div className="flex items-center justify-between">
                <span className="text-[1.4rem] font-semibold leading-[1.4] text-[#000000]">Item #{idx + 1}</span>
                {formData.items.length > 1 && (
                  <button
                    type="button"
                    aria-label={`Hapus item ${idx + 1}`}
                    title={`Hapus item ${idx + 1}`}
                    onClick={() => void removeItem(idx)}
                    className={ACTION_BUTTON_CLASSES.delete}
                  >
                    <Trash2 size={14} />
                    <span>Hapus</span>
                  </button>
                )}
              </div>
              <div className="grid grid-cols-4 gap-10">
                <div className="col-span-2 phones:col-span-4">
                  <FormInput
                    name={`item_nama_${idx}`}
                    value={item.nama}
                    onChange={(e) => handleItemChange(idx, 'nama', e.target.value)}
                    placeholder="Nama Barang & Spesifikasi"
                  />
                </div>
                <div className="phones:col-span-2">
                  <FormInput
                    name={`item_jumlah_${idx}`}
                    type="number"
                    value={item.jumlah}
                    onChange={(e) => handleItemChange(idx, 'jumlah', Number(e.target.value))}
                    placeholder="Qty"
                  />
                </div>
                <div className="phones:col-span-2">
                  <FormInput
                    name={`item_satuan_${idx}`}
                    value={item.satuan}
                    onChange={(e) => handleItemChange(idx, 'satuan', e.target.value)}
                    placeholder="Satuan (Pcs/Unit)"
                  />
                </div>
                <div className="col-span-4">
                  <FormInput
                    name={`item_harga_${idx}`}
                    type="number"
                    value={item.harga}
                    onChange={(e) => handleItemChange(idx, 'harga', Number(e.target.value))}
                    placeholder="Harga Satuan (Rp)"
                  />
                </div>
              </div>
            </div>
          ))}

          <h2 className="mt-8 text-[2rem] font-semibold text-[#000000]">Ketentuan Pengiriman & Pembayaran</h2>
          <FormInput name="alamat_kirim" value={formData.alamat_kirim} onChange={handleChange} placeholder="Alamat Pengiriman" />
          <FormInput name="tgl_kirim" value={formData.tgl_kirim} onChange={handleChange} placeholder="Jadwal / Batas Pengiriman" />
          <FormInput name="syarat_bayar" value={formData.syarat_bayar} onChange={handleChange} placeholder="Syarat Pembayaran" />

          <FormTextArea name="penutup" value={formData.penutup} onChange={handleChange} placeholder="Kalimat Penutup" rows={3} />

          <h2 className="mt-8 text-[2rem] font-semibold text-[#000000]">Penandatangan Pemesan</h2>
          <div className="grid grid-cols-2 gap-12 phones:grid-cols-1">
            <FormInput name="pemesan_perusahaan" value={formData.pemesan_perusahaan} onChange={handleChange} placeholder="Nama Perusahaan" />
            <FormInput name="pemesan_nama" value={formData.pemesan_nama} onChange={handleChange} placeholder="Nama Penandatangan" />
          </div>
        </div>
      </div>

      {/* Kolom Pratinjau PDF */}
      <div
        className={`scrollbar flex h-full w-1/2 tablet:w-full tablet:h-auto tablet:overflow-visible flex-col gap-16 overflow-auto phones:w-full ${
          showMobilePreview ? 'phones:flex' : 'phones:hidden'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-10">
          <div className="flex flex-wrap items-center gap-10">
            <h2 className="text-[1.8rem] font-semibold text-[#000000]">Pratinjau Surat (PDF)</h2>
            <span
              data-preview-doc-badge="SURAT_PESANAN"
              className={`inline-flex items-center rounded-md px-10 py-3 text-[1.15rem] font-semibold leading-[1.3] ${getDocumentCategoryStyle('SURAT_PESANAN').badgeClass}`}
            >
              Surat Pesanan
            </span>
          </div>
          <span className="text-[1.25rem] text-[#000000]">Hasil mencerminkan isian formulir secara langsung</span>
        </div>
        <div className="h-[95rem] tablet:h-[75rem] w-full rounded-2xl border border-[#E2E8F0] bg-[#F1F5F9] p-8 shadow-inner">
          <PDFPreview pdfUrl={pdfUrl} />
        </div>
      </div>
    </div>
  )
}
