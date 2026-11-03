import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import pdfMake from 'pdfmake/build/pdfmake'
import * as pdfFonts from 'pdfmake/build/vfs_fonts'
import DocumentActions from '@/components/common/documentAction'
import FormInput from '@/components/ui/formInput'
import FormTextArea from '@/components/ui/formTextArea'
import PDFPreview from '@/components/common/pdfPreview'
import { generatePdfDefinition, type PermintaanBarangFormData } from './generatePDFDefenition'
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
  payload: PermintaanBarangFormData
  templateId?: string | null
  updatedAt: string
}

function createEmptyFormData(): PermintaanBarangFormData {
  return {
    logo: '',
    header1: 'PT Luma',
    header2: 'Divisi Operasional & Pengadaan',
    header3: '',
    nomor_surat: '',
    lampiran: '-',
    perihal: 'Permintaan Pengadaan Barang',
    tempat_tanggal: `Jakarta, ${dayjs().locale('id').format('DD MMMM YYYY')}`,
    tujuan_nama: '',
    tujuan_jabatan: 'Bagian Pengadaan / Procurement',
    tujuan_perusahaan: 'PT Luma',
    tujuan_alamat: '',
    pembuka:
      'Dengan hormat,\nSehubungan dengan kebutuhan operasional kerja di divisi kami, bersama ini kami mengajukan permintaan pengadaan barang dengan rincian sebagai berikut:',
    items: [{ nama: '', jumlah: 1, satuan: 'Pcs', keterangan: '' }],
    penutup:
      'Demikian surat permintaan barang ini kami sampaikan. Atas perhatian dan kerjasamanya, kami ucapkan terima kasih.',
    mengetahui_jabatan: 'Mengetahui,\nKepala Divisi',
    mengetahui_nama: '',
    pemohon_jabatan: 'Pemohon,\nStaf Operasional',
    pemohon_nama: '',
  }
}

export default function SuratPermintaanBarang() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const urlDocId = searchParams.get('id') || ''
  const urlTemplateId = searchParams.get('templateId') || ''

  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [formData, setFormData] = useState<PermintaanBarangFormData>(() => {
    if (!urlDocId) {
      try {
        const cached = sessionStorage.getItem('luma_unsaved_surat_permintaan_barang')
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
  const [selectedDocId, setSelectedDocId] = useState(urlDocId)
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(urlTemplateId || null)
  const [currentStatus, setCurrentStatus] = useState<string>('Draft')
  const [saving, setSaving] = useState(false)
  const [showMobilePreview, setShowMobilePreview] = useState(false)

  useEffect(() => {
    if (!urlDocId && !selectedDocId) {
      try {
        sessionStorage.setItem('luma_unsaved_surat_permintaan_barang', JSON.stringify(formData))
      } catch {
        // Ignore storage error
      }
    }
  }, [formData, urlDocId, selectedDocId])

  const loadSavedDocuments = useCallback(async () => {
    try {
      const docs = await billingRequest<StoredLetterDocument[]>('/letter-documents?type=SURAT_PERMINTAAN_BARANG')
      setSavedDocs(docs)
      return docs
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
      items: [...prev.items, { nama: '', jumlah: 1, satuan: 'Pcs', keterangan: '' }],
    }))
  }

  const removeItem = async (index: number) => {
    if (formData.items.length <= 1) return
    if (!(await showConfirm('Hapus barang dari permintaan?', 'Perubahan ini berlaku pada dokumen yang sedang disusun.', 'Ya, hapus'))) return
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

  const handleSaveDocument = async (targetStatus: 'Draft' | 'Disimpan' = 'Disimpan') => {
    if (!formData.nomor_surat.trim() || !formData.tujuan_nama.trim()) {
      await showWarning('Data belum lengkap', 'Nomor surat dan Nama Penerima (Tujuan) wajib diisi sebelum menyimpan.')
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
            type: 'SURAT_PERMINTAAN_BARANG',
            number: formData.nomor_surat.trim(),
            title: formData.perihal.trim() || 'Surat Permintaan Barang',
            recipient: formData.tujuan_nama.trim(),
            date: dayjs().format('YYYY-MM-DD'),
            status: targetStatus,
            payload: formData,
            templateId: activeTemplateId || null,
          }),
        },
      )
      try {
        sessionStorage.removeItem('luma_unsaved_surat_permintaan_barang')
      } catch {
        // Ignore storage error
      }
      setSelectedDocId(saved.id)
      setCurrentStatus(saved.status || targetStatus)
      if (saved.templateId) {
        setActiveTemplateId(saved.templateId)
      }
      setSearchParams(saved.templateId ? { id: saved.id, templateId: saved.templateId } : { id: saved.id })
      await loadSavedDocuments()
      closeNotification()
      await showSuccess(
        targetStatus === 'Draft' ? 'Draft tersimpan' : 'Surat berhasil disimpan',
        `Dokumen tersimpan: Surat Permintaan Barang ${saved.number} tersimpan di database dengan status ${saved.status || targetStatus}.`,
      )
    } catch (error) {
      closeNotification()
      await showError('Gagal menyimpan dokumen', error instanceof Error ? error.message : 'Periksa koneksi backend.')
    } finally {
      setSaving(false)
    }
  }

  const handleDownloadFilledDocx = async (template: UploadedTemplateRecord) => {
    const itemsText = formData.items
      .map(
        (it, idx) =>
          `${idx + 1}. ${it.nama || '-'} - ${it.jumlah} ${it.satuan}${it.keterangan ? ` (${it.keterangan})` : ''}`,
      )
      .join('\n')

    await downloadFilledDocxTemplate(template, formData.nomor_surat, {
      nomor_surat: formData.nomor_surat,
      nama_penerima: formData.tujuan_nama,
      perusahaan_penerima: formData.tujuan_perusahaan,
      alamat_penerima: formData.tujuan_alamat,
      tanggal_surat: formData.tempat_tanggal,
      perihal: formData.perihal,
      lampiran: formData.lampiran,
      pembuka: formData.pembuka,
      penutup: formData.penutup,
      nama_pengirim: formData.pemohon_nama,
      jabatan_pengirim: formData.pemohon_jabatan,
      mengetahui_nama: formData.mengetahui_nama,
      mengetahui_jabatan: formData.mengetahui_jabatan,
      items: itemsText,
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

  const handleCancel = () => {
    navigate('/quotation')
  }

  const handleBackToTemplates = () => {
    navigate('/quotation?openTemplates=1')
  }

  const handleDownload = () => {
    pdfMake.createPdf(generatePdfDefinition(formData)).download('surat-permintaan-barang.pdf')
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
                <h1 className="text-[2.4rem] font-semibold leading-[1.3] text-[#000000]">Surat Permintaan Barang</h1>
                <span
                  data-doc-category-badge="SURAT_PERMINTAAN_BARANG"
                  className={`inline-flex items-center rounded-md px-10 py-4 text-[1.2rem] font-semibold leading-[1.3] ${getDocumentCategoryStyle('SURAT_PERMINTAAN_BARANG').badgeClass}`}
                >
                  Surat Permintaan Barang
                </span>
                <span
                  data-status-badge={currentStatus}
                  className={`inline-flex items-center rounded-full px-10 py-4 text-[1.2rem] font-semibold leading-[1.3] ${getSemanticStatusClass(currentStatus)}`}
                >
                  {currentStatus}
                </span>
              </div>
              <p className="mt-4 text-[1.35rem] leading-[1.5] text-[#000000]">
                Langkah 2: Isi rincian barang, pratinjau hasil surat, lalu simpan sebagai Draft atau Surat resmi.
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

        {/* Bar Manajemen Dokumen & Tombol Simpan */}
        <div className="flex flex-col gap-12 rounded-2xl border border-[#E2E8F0] bg-[#FFFFFF] p-16 shadow-sm">
          <div className="flex flex-wrap items-center gap-10">
            <select
              aria-label="Pilih Surat Permintaan Barang tersimpan"
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
                try {
                  sessionStorage.removeItem('luma_unsaved_surat_permintaan_barang')
                } catch {
                  // Ignore
                }
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
            <div className="flex items-center gap-8">
              <span className="text-[1.3rem] text-[#000000]">
                {selectedDocId ? 'Dokumen tersimpan aktif' : 'Menyusun dokumen baru'}
              </span>
            </div>

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
          <h2 className="text-[2rem] font-semibold leading-[1.3] text-[#000000]">Kop Surat / Header</h2>
          <label className="flex flex-col gap-6 text-[1.4rem] leading-[1.4] text-[#000000]">
            <span>Upload Logo Perusahaan:</span>
            <input type="file" accept="image/*" onChange={handleImageUpload} className="min-h-[4.2rem] rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] px-12 py-8 text-[1.35rem] text-[#000000]" />
          </label>
          <FormInput name="header1" value={formData.header1} onChange={handleChange} placeholder="Nama Perusahaan / Organisasi" />
          <FormInput name="header2" value={formData.header2} onChange={handleChange} placeholder="Sub Header / Divisi" />
          <FormInput name="header3" value={formData.header3} onChange={handleChange} placeholder="Alamat & Kontak" />

          <h2 className="mt-8 text-[2rem] font-semibold leading-[1.3] text-[#000000]">Informasi Surat</h2>
          <div className="grid grid-cols-2 gap-12 phones:grid-cols-1">
            <FormInput name="nomor_surat" value={formData.nomor_surat} onChange={handleChange} placeholder="Nomor Surat (contoh: 001/SPB/LUMA/2026) *" />
            <FormInput name="tempat_tanggal" value={formData.tempat_tanggal} onChange={handleChange} placeholder="Tempat, Tanggal *" />
            <FormInput name="lampiran" value={formData.lampiran} onChange={handleChange} placeholder="Lampiran" />
            <FormInput name="perihal" value={formData.perihal} onChange={handleChange} placeholder="Perihal" />
          </div>

          <h2 className="mt-8 text-[2rem] font-semibold leading-[1.3] text-[#000000]">Tujuan Permintaan</h2>
          <FormInput name="tujuan_nama" value={formData.tujuan_nama} onChange={handleChange} placeholder="Nama Penerima (Kepada Yth.) *" />
          <FormInput name="tujuan_jabatan" value={formData.tujuan_jabatan} onChange={handleChange} placeholder="Jabatan" />
          <FormInput name="tujuan_perusahaan" value={formData.tujuan_perusahaan} onChange={handleChange} placeholder="Instansi / Perusahaan" />
          <FormInput name="tujuan_alamat" value={formData.tujuan_alamat} onChange={handleChange} placeholder="Alamat Tujuan" />

          <h2 className="mt-8 text-[2rem] font-semibold leading-[1.3] text-[#000000]">Isi Permintaan</h2>
          <FormTextArea name="pembuka" value={formData.pembuka} onChange={handleChange} placeholder="Kalimat Pembuka" rows={3} />

          <div className="flex items-center justify-between gap-12">
            <span className="text-[1.45rem] font-semibold leading-[1.4] text-[#000000]">Daftar Barang yang Diminta</span>
            <button
              type="button"
              onClick={addItem}
              className="inline-flex min-h-[3.8rem] items-center gap-6 rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] px-14 py-8 text-[1.35rem] font-medium leading-[1.4] text-[#000000] transition-colors hover:bg-[#F1F5F9]"
            >
              <Plus size={14} /> Tambah Barang
            </button>
          </div>

          {formData.items.map((item, idx) => (
            <div key={idx} className="flex flex-col gap-10 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-16">
              <div className="flex items-center justify-between">
                <span className="text-[1.4rem] font-semibold leading-[1.4] text-[#000000]">Barang #{idx + 1}</span>
                {formData.items.length > 1 && (
                  <button
                    type="button"
                    aria-label={`Hapus barang ${idx + 1}`}
                    title={`Hapus barang ${idx + 1}`}
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
                    placeholder="Nama Barang"
                  />
                </div>
                <div className="phones:col-span-2">
                  <FormInput
                    name={`item_jumlah_${idx}`}
                    type="number"
                    value={item.jumlah}
                    onChange={(e) => handleItemChange(idx, 'jumlah', Number(e.target.value))}
                    placeholder="Jumlah"
                  />
                </div>
                <div className="phones:col-span-2">
                  <FormInput
                    name={`item_satuan_${idx}`}
                    value={item.satuan}
                    onChange={(e) => handleItemChange(idx, 'satuan', e.target.value)}
                    placeholder="Satuan (Pcs/Rim)"
                  />
                </div>
                <div className="col-span-4">
                  <FormInput
                    name={`item_ket_${idx}`}
                    value={item.keterangan}
                    onChange={(e) => handleItemChange(idx, 'keterangan', e.target.value)}
                    placeholder="Keterangan / Keperluan"
                  />
                </div>
              </div>
            </div>
          ))}

          <FormTextArea name="penutup" value={formData.penutup} onChange={handleChange} placeholder="Kalimat Penutup" rows={3} />

          <h2 className="mt-8 text-[2rem] font-semibold text-[#000000]">Tanda Tangan</h2>
          <div className="grid grid-cols-2 gap-12 phones:grid-cols-1">
            <FormInput name="mengetahui_jabatan" value={formData.mengetahui_jabatan} onChange={handleChange} placeholder="Jabatan Mengetahui" />
            <FormInput name="pemohon_jabatan" value={formData.pemohon_jabatan} onChange={handleChange} placeholder="Jabatan Pemohon" />
            <FormInput name="mengetahui_nama" value={formData.mengetahui_nama} onChange={handleChange} placeholder="Nama Mengetahui" />
            <FormInput name="pemohon_nama" value={formData.pemohon_nama} onChange={handleChange} placeholder="Nama Pemohon" />
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
              data-preview-doc-badge="SURAT_PERMINTAAN_BARANG"
              className={`inline-flex items-center rounded-md px-10 py-3 text-[1.15rem] font-semibold leading-[1.3] ${getDocumentCategoryStyle('SURAT_PERMINTAAN_BARANG').badgeClass}`}
            >
              Surat Permintaan Barang
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
