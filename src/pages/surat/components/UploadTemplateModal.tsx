import React, { useState, useRef } from 'react'
import { X, Upload, FileText, CheckCircle2, AlertCircle } from 'lucide-react'
import { apiUrl } from '@/utils/billingApi'
import { closeNotification, showError, showLoading, showSuccess } from '@/utils/notifications'
import { getDocumentCategoryStyle } from '@/utils/semanticTokens'

export interface UploadedTemplateRecord {
  id: string
  name: string
  letterType: string
  description?: string | null
  originalFilename: string
  storedFilename: string
  fileFormat: string
  fileSize: number
  mimeType: string
  isActive: boolean
  createdBy?: string | null
  createdAt: string
  updatedAt: string
}

interface UploadTemplateModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: (newTemplate: UploadedTemplateRecord) => void
}

const LETTER_TYPE_OPTIONS = [
  { value: 'SURAT_PENAWARAN', label: 'Surat Penawaran' },
  { value: 'SURAT_PERMINTAAN_BARANG', label: 'Surat Permintaan Barang' },
  { value: 'SURAT_PESANAN', label: 'Surat Pesanan' },
  { value: 'SURAT_PERJANJIAN_JUAL_BELI', label: 'Surat Perjanjian Jual Beli' },
]

export default function UploadTemplateModal({ isOpen, onClose, onSuccess }: UploadTemplateModalProps) {
  const [name, setName] = useState('')
  const [letterType, setLetterType] = useState('SURAT_PENAWARAN')
  const [description, setDescription] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)

  if (!isOpen) return null

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setErrorMessage(null)
    const file = e.target.files?.[0]
    if (!file) return

    const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase()
    if (!['.docx', '.xlsx', '.pdf'].includes(ext)) {
      setErrorMessage(`Format file "${ext}" tidak didukung. Harap pilih file .docx, .xlsx, atau .pdf.`)
      setSelectedFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }

    if (file.size > 10 * 1024 * 1024) {
      setErrorMessage('Ukuran file melebihi batas maksimal 10 MB.')
      setSelectedFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }

    setSelectedFile(file)
    // Otomatis isi nama template jika masih kosong
    if (!name.trim()) {
      const baseName = file.name.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ')
      setName(baseName.charAt(0).toUpperCase() + baseName.slice(1))
    }
  }

  const handleRemoveFile = () => {
    setSelectedFile(null)
    setErrorMessage(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMessage(null)

    if (!selectedFile) {
      setErrorMessage('Silakan pilih file template (.docx, .xlsx, atau .pdf).')
      return
    }

    if (!name.trim()) {
      setErrorMessage('Nama template wajib diisi.')
      return
    }

    if (!letterType) {
      setErrorMessage('Jenis surat wajib dipilih.')
      return
    }

    setSubmitting(true)
    showLoading('Mengunggah & menyimpan template surat...')

    try {
      const formData = new FormData()
      formData.append('name', name.trim())
      formData.append('letterType', letterType)
      if (description.trim()) {
        formData.append('description', description.trim())
      }
      formData.append('file', selectedFile)

      const response = await fetch(apiUrl('/letter-templates'), {
        method: 'POST',
        body: formData,
      })

      const data = await response.json().catch(() => null)
      closeNotification()

      if (!response.ok) {
        throw new Error(data?.error || 'Gagal menyimpan template surat ke database.')
      }

      await showSuccess(
        'Template Berhasil Disimpan',
        `Template "${data.name}" telah tersimpan ke kategori ${
          LETTER_TYPE_OPTIONS.find((t) => t.value === data.letterType)?.label || data.letterType
        }.`,
      )

      // Reset form
      setName('')
      setDescription('')
      setSelectedFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''

      onSuccess(data)
      onClose()
    } catch (error) {
      closeNotification()
      const msg = error instanceof Error ? error.message : 'Terjadi kesalahan server saat menyimpan template.'
      setErrorMessage(msg)
      await showError('Gagal Menyimpan Template', msg)
    } finally {
      setSubmitting(false)
    }
  }

  const getFormatBadge = (filename: string) => {
    const ext = filename.substring(filename.lastIndexOf('.')).toLowerCase()
    const neutralColor = 'bg-transparent text-[#000000]'
    if (ext === '.docx') return { label: 'DOCX', color: neutralColor }
    if (ext === '.xlsx') return { label: 'XLSX', color: neutralColor }
    return { label: 'PDF', color: neutralColor }
  }

  return (
    <div
      id="modal-upload-template"
      role="dialog"
      aria-modal="true"
      aria-labelledby="upload-template-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-16"
    >
      <div className="flex max-h-[90vh] w-full max-w-[64rem] flex-col overflow-hidden rounded-2xl border border-[#E2E8F0] bg-[#FFFFFF] shadow-xl">
        {/* Header Modal */}
        <div className="flex items-center justify-between border-b border-[#E2E8F0] px-24 py-16">
          <div className="flex items-center gap-12">
            <span className="flex h-[2.4rem] w-[2.4rem] shrink-0 items-center justify-center text-[#0000FF]">
              <Upload size={20} />
            </span>
            <div>
              <h2 id="upload-template-title" className="text-[1.9rem] font-semibold leading-[1.35] text-[#000000]">
                Tambah Template Surat Baru
              </h2>
              <p className="mt-4 text-[1.35rem] font-normal leading-[1.5] text-[#000000]">
                Unggah template resmi dari komputer dan tentukan kategorinya.
              </p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Tutup modal unggah template"
            onClick={onClose}
            className="rounded-xl p-8 text-[#000000] transition-colors hover:bg-[#F8FAFC] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0000FF]"
          >
            <X size={20} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="scrollbar flex flex-1 flex-col gap-16 overflow-y-auto p-24">
          {errorMessage && (
            <div className="flex items-start gap-10 rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] p-12 text-[1.3rem] leading-[1.5] text-[#000000]">
              <AlertCircle size={18} className="mt-2 shrink-0 text-[#000000]" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Nama Template */}
          <div className="flex flex-col gap-8">
            <label htmlFor="input-template-name" className="text-[1.35rem] font-semibold leading-[1.4] text-[#000000]">
              Nama Template <span className="text-[#000000]">*</span>
            </label>
            <input
              id="input-template-name"
              type="text"
              placeholder="Contoh: Template Resmi Permintaan Pengadaan 2026"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-[4.2rem] w-full rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] px-16 py-8 text-[1.35rem] leading-[1.4] text-[#000000] placeholder-[#000000] transition-colors focus:border-[#0000FF] focus:outline-none focus:ring-2 focus:ring-[#E2E8F0]"
            />
          </div>

          {/* Jenis Surat */}
          <div className="flex flex-col gap-8">
            <div className="flex flex-wrap items-center justify-between gap-8">
              <label htmlFor="select-letter-type" className="text-[1.35rem] font-semibold leading-[1.4] text-[#000000]">
                Jenis / Kategori Surat <span className="text-[#000000]">*</span>
              </label>
              <span
                data-doc-category-badge={letterType}
                className={`inline-flex items-center text-[1.2rem] font-semibold leading-[1.3] ${getDocumentCategoryStyle(letterType).badgeClass}`}
              >
                {getDocumentCategoryStyle(letterType).label}
              </span>
            </div>
            <select
              id="select-letter-type"
              value={letterType}
              onChange={(e) => setLetterType(e.target.value)}
              className="h-[4.2rem] w-full rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] px-16 py-8 text-[1.35rem] leading-[1.4] text-[#000000] transition-colors focus:border-[#0000FF] focus:outline-none focus:ring-2 focus:ring-[#E2E8F0]"
            >
              {LETTER_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Deskripsi */}
          <div className="flex flex-col gap-8">
            <label htmlFor="input-template-description" className="text-[1.35rem] font-semibold leading-[1.4] text-[#000000]">
              Deskripsi <span className="text-[1.2rem] font-normal text-[#000000]">(Opsional)</span>
            </label>
            <textarea
              id="input-template-description"
              rows={2}
              placeholder="Catatan mengenai penggunaan template atau format lampiran..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full resize-none rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] px-16 py-10 text-[1.35rem] leading-[1.5] text-[#000000] placeholder-[#000000] transition-colors focus:border-[#0000FF] focus:outline-none focus:ring-2 focus:ring-[#E2E8F0]"
            />
          </div>

          {/* Upload File Template */}
          <div className="flex flex-col gap-8">
            <label className="text-[1.35rem] font-semibold leading-[1.4] text-[#000000]">
              File Template <span className="text-[#000000]">*</span>
            </label>

            {/* Native Hidden File Input */}
            <input
              ref={fileInputRef}
              type="file"
              id="input-file-template"
              accept=".docx,.xlsx,.pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/pdf"
              onChange={handleFileChange}
              className="hidden"
            />

            {!selectedFile ? (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="flex cursor-pointer flex-col items-center justify-center gap-12 rounded-xl border border-dashed border-[#E2E8F0] bg-[#F8FAFC] p-24 text-center transition-colors hover:border-[#0000FF]"
              >
                <div className="flex h-[2.4rem] w-[2.4rem] items-center justify-center text-[#0000FF]">
                  <Upload size={20} />
                </div>
                <div className="flex flex-col gap-6">
                  <div className="flex items-center justify-center gap-6">
                    <button
                      type="button"
                      id="btn-choose-file"
                      onClick={(e) => {
                        e.stopPropagation()
                        fileInputRef.current?.click()
                      }}
                      className="inline-flex min-h-[3.8rem] items-center gap-8 rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] px-16 py-8 text-[1.35rem] font-semibold leading-[1.3] text-[#0000FF] transition-colors hover:bg-[#F8FAFC]"
                    >
                      <Upload size={15} className="text-[#0000FF]" />
                      <span>Choose File</span>
                    </button>
                  </div>
                  <p className="mt-4 text-[1.25rem] leading-[1.5] text-[#000000]">
                    Format didukung: <strong>.docx</strong> (Word), <strong>.xlsx</strong> (Excel), atau <strong>.pdf</strong> (Maks. 10 MB)
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-10 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-16">
                <div className="flex items-start justify-between gap-12">
                  <div className="flex min-w-0 items-center gap-12">
                    <span className="flex h-[2.4rem] w-[2.4rem] shrink-0 items-center justify-center text-[#0000FF]">
                      <FileText size={20} />
                    </span>
                    <div className="flex min-w-0 flex-col">
                      <div className="flex flex-wrap items-center gap-8">
                        <span className="truncate text-[1.4rem] font-semibold leading-[1.4] text-[#000000]" title={selectedFile.name}>
                          {selectedFile.name}
                        </span>
                        <span
                          className={`inline-flex items-center text-[1.15rem] font-semibold uppercase leading-[1.3] ${
                            getFormatBadge(selectedFile.name).color
                          }`}
                        >
                          {getFormatBadge(selectedFile.name).label}
                        </span>
                      </div>
                      <span className="mt-4 text-[1.2rem] leading-[1.4] text-[#000000]">
                        {(selectedFile.size / 1024).toFixed(1)} KB
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleRemoveFile}
                    className="shrink-0 rounded-lg p-6 text-[#000000] transition-colors hover:bg-[#FFFFFF]"
                    title="Ganti file"
                  >
                    <X size={16} />
                  </button>
                </div>

                <div className="flex items-center gap-8 border-t border-[#E2E8F0] pt-8 text-[1.2rem] leading-[1.5] text-[#000000]">
                  <CheckCircle2 size={14} className="shrink-0 text-[#008000]" />
                  <span>
                    {selectedFile.name.endsWith('.docx')
                      ? 'Format DOCX valid: Mendukung pemetaan placeholder dinamis ({{nomor_surat}}, {{nama_penerima}}, dll.).'
                      : selectedFile.name.endsWith('.xlsx')
                        ? 'Format XLSX valid: Kompatibel dengan model spreadsheet.'
                        : 'Format PDF valid: Disimpan sebagai dokumen referensi resmi.'}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Footer Buttons */}
          <div className="mt-8 flex items-center justify-end gap-12 border-t border-[#E2E8F0] pt-16">
            <button
              type="button"
              disabled={submitting}
              onClick={onClose}
              className="min-h-[4.2rem] rounded-xl border border-[#B91C1C] bg-[#B91C1C] px-20 py-8 text-[1.35rem] font-semibold leading-[1.3] text-white shadow-sm transition-colors hover:bg-[#991B1B] disabled:opacity-50"
            >
              Batal
            </button>
            <button
              type="submit"
              id="btn-submit-upload-template"
              disabled={submitting}
              className="inline-flex min-h-[4.2rem] items-center gap-8 rounded-xl border border-[#0000FF] bg-[#0000FF] px-24 py-8 text-[1.35rem] font-semibold leading-[1.3] text-white shadow-sm transition-colors hover:bg-[#0000D0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0000FF] disabled:opacity-50"
            >
              <Upload size={16} className="text-white" />
              <span>{submitting ? 'Menyimpan...' : 'Simpan Template'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
