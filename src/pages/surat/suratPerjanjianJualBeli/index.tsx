import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import pdfMake from 'pdfmake/build/pdfmake'
import * as pdfFonts from 'pdfmake/build/vfs_fonts'
import DocumentActions from '@/components/common/documentAction'
import FormInput from '@/components/ui/formInput'
import FormTextArea from '@/components/ui/formTextArea'
import PDFPreview from '@/components/common/pdfPreview'
import { generatePdfDefinition, type PerjanjianJualBeliFormData } from './generatePDFDefenition'
import dayjs from 'dayjs'
import 'dayjs/locale/id'
import { ArrowLeft, CheckCircle2, Eye, FilePlus2, LayoutTemplate, Save, Trash2 } from 'lucide-react'
import { closeNotification, showConfirm, showError, showLoading, showSuccess, showWarning } from '@/utils/notifications'
import { billingRequest } from '@/utils/billingApi'
import { getDocumentCategoryStyle, getSemanticStatusClass } from '@/utils/semanticTokens'
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
  payload: PerjanjianJualBeliFormData
  templateId?: string | null
  updatedAt: string
}

function createEmptyFormData(): PerjanjianJualBeliFormData {
  return {
    title: 'SURAT PERJANJIAN JUAL BELI',
    nomor_surat: '',
    hari: dayjs().locale('id').format('dddd'),
    tanggal: dayjs().locale('id').format('DD MMMM YYYY'),
    tempat: 'Jakarta',
    penjual_nama: '',
    penjual_nik: '',
    penjual_pekerjaan: '',
    penjual_alamat: '',
    penjual_telepon: '',
    pembeli_nama: '',
    pembeli_nik: '',
    pembeli_pekerjaan: '',
    pembeli_alamat: '',
    pembeli_telepon: '',
    pasal1_objek: '',
    pasal1_spesifikasi: '',
    pasal2_harga: '',
    pasal2_pembayaran: '',
    pasal3_penyerahan:
      '1. Penyerahan objek jual beli beserta dokumen terkait dilakukan sesuai kesepakatan setelah pembayaran diterima.\n2. Sejak serah terima, hak milik dan tanggung jawab atas barang beralih kepada PIHAK KEDUA.',
    pasal4_sengketa:
      'Apabila terjadi perselisihan terkait perjanjian ini, kedua belah pihak sepakat menyelesaikan secara musyawarah untuk mufakat. Apabila musyawarah tidak tercapai, perselisihan diselesaikan melalui Pengadilan Negeri setempat.',
    saksi1_nama: '',
    saksi2_nama: '',
  }
}

const DRAFT_STORAGE_KEY = 'luma_unsaved_surat_perjanjian_jual_beli'

export default function SuratPerjanjianJualBeli() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const urlDocId = searchParams.get('id') || ''
  const urlTemplateId = searchParams.get('templateId') || ''

  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [formData, setFormData] = useState<PerjanjianJualBeliFormData>(() => {
    if (!urlDocId) {
      try {
        const raw = sessionStorage.getItem(DRAFT_STORAGE_KEY)
        if (raw) {
          const parsed = JSON.parse(raw)
          if (parsed && typeof parsed === 'object') {
            return { ...createEmptyFormData(), ...parsed }
          }
        }
      } catch {
        // ignore storage errors
      }
    }
    return createEmptyFormData()
  })
  const [savedDocs, setSavedDocs] = useState<StoredLetterDocument[]>([])
  const [selectedDocId, setSelectedDocId] = useState(urlDocId)
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(urlTemplateId || null)
  const [currentStatus, setCurrentStatus] = useState<string>('Draft')
  const [saving, setSaving] = useState(false)
  const [showMobilePreview, setShowMobilePreview] = useState(false)

  useEffect(() => {
    if (!selectedDocId) {
      try {
        sessionStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(formData))
      } catch {
        // ignore storage errors
      }
    }
  }, [formData, selectedDocId])

  const loadSavedDocuments = useCallback(async () => {
    try {
      const docs = await billingRequest<StoredLetterDocument[]>('/letter-documents?type=SURAT_PERJANJIAN_JUAL_BELI')
      setSavedDocs(docs || [])
      return docs || []
    } catch {
      return []
    }
  }, [])

  useEffect(() => {
    void loadSavedDocuments().then((docs) => {
      if (urlDocId) {
        const found = docs.find((d) => d.id === urlDocId)
        if (found?.payload) {
          setSelectedDocId(found.id)
          setCurrentStatus(found.status || 'Draft')
          if (found.templateId) {
            setActiveTemplateId(found.templateId)
          }
          setFormData({ ...createEmptyFormData(), ...found.payload })
        }
      } else if (urlTemplateId) {
        setActiveTemplateId(urlTemplateId)
      }
    })
  }, [loadSavedDocuments, urlDocId, urlTemplateId])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }))
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

  const handleSaveDocument = async (targetStatus: 'Draft' | 'Disimpan' = 'Disimpan') => {
    if (!formData.nomor_surat.trim() || !formData.pembeli_nama.trim()) {
      await showWarning('Data belum lengkap', 'Nomor Surat dan Nama Lengkap Pembeli wajib diisi sebelum menyimpan.')
      return
    }
    setSaving(true)
    showLoading(targetStatus === 'Draft' ? 'Menyimpan sebagai Draft...' : 'Menyimpan Surat...')
    try {
      const saved = await billingRequest<StoredLetterDocument>(
        selectedDocId ? `/letter-documents/${selectedDocId}` : '/letter-documents',
        {
          method: selectedDocId ? 'PUT' : 'POST',
          body: JSON.stringify({
            type: 'SURAT_PERJANJIAN_JUAL_BELI',
            number: formData.nomor_surat.trim(),
            title: formData.pasal1_objek.trim().slice(0, 120) || 'Surat Perjanjian Jual Beli',
            recipient: formData.pembeli_nama.trim(),
            date: dayjs().format('YYYY-MM-DD'),
            status: targetStatus,
            payload: formData,
            templateId: activeTemplateId || null,
          }),
        },
      )
      setSelectedDocId(saved.id)
      setCurrentStatus(saved.status || targetStatus)
      if (saved.templateId) {
        setActiveTemplateId(saved.templateId)
      }
      setSearchParams(
        saved.templateId ? { id: saved.id, templateId: saved.templateId } : { id: saved.id },
      )
      sessionStorage.removeItem(DRAFT_STORAGE_KEY)
      await loadSavedDocuments()
      closeNotification()
      await showSuccess(
        targetStatus === 'Draft' ? 'Draft tersimpan' : 'Surat Perjanjian tersimpan',
        `Dokumen tersimpan: Surat Perjanjian Jual Beli ${saved.number} tersimpan di database dengan status ${saved.status || targetStatus}.`,
      )
    } catch (error) {
      closeNotification()
      await showError('Gagal menyimpan dokumen', error instanceof Error ? error.message : 'Periksa koneksi backend.')
    } finally {
      setSaving(false)
    }
  }

  const handleDownloadFilledDocx = async (template: UploadedTemplateRecord) => {
    await downloadFilledDocxTemplate(template, formData.nomor_surat, {
      nomor_surat: formData.nomor_surat,
      nama_penerima: formData.pembeli_nama,
      alamat_penerima: formData.pembeli_alamat,
      tanggal_surat: formData.tanggal,
      perihal: formData.title,
      pembeli_nama: formData.pembeli_nama,
      pembeli_nik: formData.pembeli_nik,
      pembeli_pekerjaan: formData.pembeli_pekerjaan,
      pembeli_alamat: formData.pembeli_alamat,
      pembeli_telepon: formData.pembeli_telepon,
      penjual_nama: formData.penjual_nama,
      penjual_nik: formData.penjual_nik,
      penjual_pekerjaan: formData.penjual_pekerjaan,
      penjual_alamat: formData.penjual_alamat,
      penjual_telepon: formData.penjual_telepon,
      nama_pengirim: formData.penjual_nama,
      pasal1_objek: formData.pasal1_objek,
      pasal1_spesifikasi: formData.pasal1_spesifikasi,
      pasal2_harga: formData.pasal2_harga,
      pasal2_pembayaran: formData.pasal2_pembayaran,
    })
  }

  const handleDeleteDocument = async () => {
    if (!selectedDocId) return
    if (!(await showConfirm('Hapus dokumen tersimpan?', 'Dokumen ini akan dihapus dari database.', 'Ya, hapus'))) return
    showLoading('Menghapus dokumen...')
    try {
      await billingRequest(`/letter-documents/${selectedDocId}`, { method: 'DELETE' })
      setSelectedDocId('')
      setSearchParams({})
      setFormData(createEmptyFormData())
      await loadSavedDocuments()
      closeNotification()
      await showSuccess('Dokumen berhasil dihapus')
    } catch (error) {
      closeNotification()
      await showError('Gagal menghapus dokumen', error instanceof Error ? error.message : 'Periksa hak akses atau koneksi backend.')
    }
  }

  const handleCancel = async () => {
    navigate('/quotation')
  }

  const handleBackToTemplateSelection = () => {
    navigate('/quotation?openTemplates=1')
  }

  const handleDownload = () => {
    pdfMake.createPdf(generatePdfDefinition(formData)).download('surat-perjanjian-jual-beli.pdf')
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
              onClick={() => void handleCancel()}
              title="Kembali ke Menu Quotation"
              className="inline-flex h-[4rem] w-[4rem] shrink-0 items-center justify-center rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] text-[#000000] transition-colors hover:bg-[#F1F5F9] hover:text-[#000000]"
            >
              <ArrowLeft size={18} />
            </button>
            <div>
              <div className="flex flex-wrap items-center gap-8">
                <h1 className="text-[2.4rem] font-semibold leading-[1.3] text-[#000000]">Surat Perjanjian Jual Beli</h1>
                <span
                  data-doc-category-badge="SURAT_PERJANJIAN_JUAL_BELI"
                  className={`inline-flex items-center rounded-md px-10 py-4 text-[1.2rem] font-semibold leading-[1.3] ${getDocumentCategoryStyle('SURAT_PERJANJIAN_JUAL_BELI').badgeClass}`}
                >
                  Surat Perjanjian Jual Beli
                </span>
                <span
                  data-status-badge={currentStatus}
                  className={`inline-flex items-center rounded-full px-10 py-4 text-[1.2rem] font-semibold leading-[1.3] ${getSemanticStatusClass(currentStatus)}`}
                >
                  {currentStatus}
                </span>
              </div>
              <p className="mt-4 text-[1.35rem] leading-[1.5] text-[#000000]">
                Langkah 2: Isi pihak penjual & pembeli, pasal perjanjian, pratinjau hasil, lalu simpan.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-10">
            <button
              type="button"
              id="btn-back-to-templates"
              onClick={handleBackToTemplateSelection}
              className="inline-flex min-h-[4rem] items-center gap-6 rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] px-16 py-8 text-[1.3rem] font-medium leading-[1.3] text-[#000000] transition-colors hover:bg-[#F1F5F9]"
            >
              <LayoutTemplate size={15} />
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

        {/* Bar Manajemen Dokumen & Simpan */}
        <div className="flex flex-col gap-12 rounded-2xl border border-[#E2E8F0] bg-[#FFFFFF] p-16 shadow-sm">
          <div className="flex flex-wrap items-center gap-10">
            <select
              aria-label="Pilih Surat Perjanjian Jual Beli tersimpan"
              value={selectedDocId}
              onChange={(e) => {
                const id = e.target.value
                setSelectedDocId(id)
                if (!id) {
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
                  setActiveTemplateId(doc.templateId || null)
                  setFormData({ ...createEmptyFormData(), ...doc.payload })
                }
              }}
              className="min-w-[24rem] flex-1 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-12 py-10 text-[1.4rem] text-[#000000] focus:border-[#0000FF] focus:bg-[#FFFFFF] focus:outline-none"
            >
              <option value="">— Dokumen Baru (Belum Tersimpan) —</option>
              {savedDocs.map((doc) => (
                <option key={doc.id} value={doc.id}>
                  {doc.number} — {doc.recipient} ({doc.status || 'Draft'})
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => {
                sessionStorage.removeItem(DRAFT_STORAGE_KEY)
                setSelectedDocId('')
                setSearchParams(urlTemplateId ? { templateId: urlTemplateId } : {})
                setFormData(createEmptyFormData())
                setCurrentStatus('Draft')
                setActiveTemplateId(urlTemplateId || null)
              }}
              className="inline-flex min-h-[4rem] items-center gap-6 rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] px-12 py-8 text-[1.4rem] font-medium text-[#000000] transition-colors hover:bg-[#F1F5F9]"
            >
              <FilePlus2 size={16} />
              Buat Baru
            </button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-10 border-t border-[#E2E8F0] pt-10">
            <span className="text-[1.3rem] text-[#000000]">
              {selectedDocId ? 'Dokumen tersimpan aktif' : 'Menyusun dokumen baru'}
            </span>

            <div className="flex flex-wrap items-center gap-8">
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
          <h2 className="text-[2rem] font-semibold text-[#000000]">Informasi Perjanjian</h2>
          <div className="grid grid-cols-2 gap-12 phones:grid-cols-1">
            <FormInput name="nomor_surat" value={formData.nomor_surat} onChange={handleChange} placeholder="Nomor Surat (contoh: 001/SPJB/LUMA/2026) *" />
            <FormInput name="tempat" value={formData.tempat} onChange={handleChange} placeholder="Tempat Perjanjian *" />
            <FormInput name="hari" value={formData.hari} onChange={handleChange} placeholder="Hari" />
            <FormInput name="tanggal" value={formData.tanggal} onChange={handleChange} placeholder="Tanggal" />
          </div>

          <h2 className="mt-8 text-[2rem] font-semibold text-[#000000]">Pihak Pertama (Penjual)</h2>
          <FormInput name="penjual_nama" value={formData.penjual_nama} onChange={handleChange} placeholder="Nama Lengkap Penjual *" />
          <FormInput name="penjual_nik" value={formData.penjual_nik} onChange={handleChange} placeholder="NIK / No. KTP" />
          <FormInput name="penjual_pekerjaan" value={formData.penjual_pekerjaan} onChange={handleChange} placeholder="Pekerjaan / Jabatan" />
          <FormInput name="penjual_alamat" value={formData.penjual_alamat} onChange={handleChange} placeholder="Alamat Domisili" />
          <FormInput name="penjual_telepon" value={formData.penjual_telepon} onChange={handleChange} placeholder="Nomor Telepon / HP" />

          <h2 className="mt-8 text-[2rem] font-semibold text-[#000000]">Pihak Kedua (Pembeli)</h2>
          <FormInput name="pembeli_nama" value={formData.pembeli_nama} onChange={handleChange} placeholder="Nama Lengkap Pembeli *" />
          <FormInput name="pembeli_nik" value={formData.pembeli_nik} onChange={handleChange} placeholder="NIK / No. KTP" />
          <FormInput name="pembeli_pekerjaan" value={formData.pembeli_pekerjaan} onChange={handleChange} placeholder="Pekerjaan / Jabatan" />
          <FormInput name="pembeli_alamat" value={formData.pembeli_alamat} onChange={handleChange} placeholder="Alamat Domisili" />
          <FormInput name="pembeli_telepon" value={formData.pembeli_telepon} onChange={handleChange} placeholder="Nomor Telepon / HP" />

          <h2 className="mt-8 text-[2rem] font-semibold text-[#000000]">Pasal 1: Objek Jual Beli</h2>
          <FormTextArea name="pasal1_objek" value={formData.pasal1_objek} onChange={handleChange} placeholder="Objek Barang/Jasa yang Diperjualbelikan *" rows={3} />
          <FormTextArea name="pasal1_spesifikasi" value={formData.pasal1_spesifikasi} onChange={handleChange} placeholder="Kondisi & Kelengkapan" rows={2} />

          <h2 className="mt-8 text-[2rem] font-semibold text-[#000000]">Pasal 2: Harga & Pembayaran</h2>
          <FormInput name="pasal2_harga" value={formData.pasal2_harga} onChange={handleChange} placeholder="Harga Kesepakatan (Rp)" />
          <FormTextArea name="pasal2_pembayaran" value={formData.pasal2_pembayaran} onChange={handleChange} placeholder="Metode Pembayaran" rows={2} />

          <h2 className="mt-8 text-[2rem] font-semibold text-[#000000]">Pasal 3: Penyerahan & Hak Milik</h2>
          <FormTextArea name="pasal3_penyerahan" value={formData.pasal3_penyerahan} onChange={handleChange} placeholder="Ketentuan Penyerahan" rows={3} />

          <h2 className="mt-8 text-[2rem] font-semibold text-[#000000]">Pasal 4: Sengketa</h2>
          <FormTextArea name="pasal4_sengketa" value={formData.pasal4_sengketa} onChange={handleChange} placeholder="Ketentuan Sengketa" rows={3} />

          <h2 className="mt-8 text-[2rem] font-semibold text-[#000000]">Saksi-Saksi</h2>
          <div className="grid grid-cols-2 gap-12 phones:grid-cols-1">
            <FormInput name="saksi1_nama" value={formData.saksi1_nama} onChange={handleChange} placeholder="Nama Saksi I" />
            <FormInput name="saksi2_nama" value={formData.saksi2_nama} onChange={handleChange} placeholder="Nama Saksi II" />
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
              data-preview-doc-badge="SURAT_PERJANJIAN_JUAL_BELI"
              className={`inline-flex items-center rounded-md px-10 py-3 text-[1.15rem] font-semibold leading-[1.3] ${getDocumentCategoryStyle('SURAT_PERJANJIAN_JUAL_BELI').badgeClass}`}
            >
              Surat Perjanjian Jual Beli
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
