import { useEffect, useState } from 'react'
import { FileText, Download, CheckCircle2, FileSpreadsheet, FileType } from 'lucide-react'
import { apiUrl, billingRequest } from '@/utils/billingApi'
import { closeNotification, showError, showLoading, showSuccess } from '@/utils/notifications'
import { ACTION_BUTTON_CLASSES, getDocumentCategoryStyle } from '@/utils/semanticTokens'
import type { UploadedTemplateRecord } from './UploadTemplateModal'

interface ActiveTemplateBannerProps {
  templateId?: string | null
  onDownloadFilledDocx?: (template: UploadedTemplateRecord) => Promise<void> | void
}

export default function ActiveTemplateBanner({
  templateId,
  onDownloadFilledDocx,
}: ActiveTemplateBannerProps) {
  const [template, setTemplate] = useState<UploadedTemplateRecord | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!templateId) {
      setTemplate(null)
      return
    }

    let isMounted = true
    setLoading(true)

    billingRequest<UploadedTemplateRecord>(`/letter-templates/${templateId}`)
      .then((data) => {
        if (isMounted) setTemplate(data)
      })
      .catch(() => {
        if (isMounted) setTemplate(null)
      })
      .finally(() => {
        if (isMounted) setLoading(false)
      })

    return () => {
      isMounted = false
    }
  }, [templateId])

  if (!templateId || (!template && !loading)) {
    return null
  }

  const handleDownloadOriginal = async () => {
    if (!template) return
    try {
      showLoading('Mengunduh file template asli...')
      const token = localStorage.getItem('token') || ''
      const headers: Record<string, string> = {}
      if (token) headers['Authorization'] = `Bearer ${token}`

      const res = await fetch(apiUrl(`/letter-templates/${template.id}/download`), {
        credentials: 'include',
        headers,
      })

      if (!res.ok) throw new Error('Gagal mengunduh file template')

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = template.originalFilename
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)

      closeNotification()
      await showSuccess('File template asli berhasil diunduh')
    } catch (err) {
      closeNotification()
      await showError(
        'Gagal Mengunduh',
        err instanceof Error ? err.message : 'Terjadi kendala saat mengunduh template.',
      )
    }
  }

  const formatExt = (template?.fileFormat || '').toLowerCase()
  const formatIcon =
    formatExt === 'xlsx' ? (
      <FileSpreadsheet size={16} className="text-[#008000]" />
    ) : formatExt === 'docx' ? (
      <FileText size={16} className="text-[#0000FF]" />
    ) : (
      <FileType size={16} className="text-[#000000]" />
    )

  const docStyle = getDocumentCategoryStyle(template?.letterType)

  return (
    <div className="flex flex-wrap items-center justify-between gap-12 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-16 py-12 text-[1.35rem] text-[#000000]">
      <div className="flex items-center gap-12">
        <div className="flex h-[2.4rem] w-[2.4rem] shrink-0 items-center justify-center">
          {formatIcon}
        </div>
        <div>
          <div className="flex flex-wrap items-center gap-8">
            <span className="font-semibold leading-[1.4] text-[#000000]">
              {template ? template.name : 'Memuat data template...'}
            </span>
            {template?.letterType && (
              <span
                className={`inline-flex items-center text-[1.15rem] font-semibold leading-[1.3] ${docStyle.badgeClass}`}
              >
                {docStyle.label}
              </span>
            )}
            <span className="inline-flex items-center text-[1.1rem] font-semibold uppercase leading-[1.3] text-[#000000]">
              {template?.fileFormat || 'FILE'}
            </span>
            <span className="inline-flex items-center gap-4 text-[1.2rem] font-semibold leading-[1.3] text-[#008000]">
              <CheckCircle2 size={13} className="text-[#008000]" />
              <span>Template Kustom Aktif</span>
            </span>
          </div>
          <p className="mt-4 text-[1.25rem] leading-[1.45] text-[#000000]">
            {template?.description || `File sumber: ${template?.originalFilename || '-'}`}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-8">
        <button
          type="button"
          onClick={() => void handleDownloadOriginal()}
          className={ACTION_BUTTON_CLASSES.download}
          title="Unduh file template asli yang diunggah"
        >
          <Download size={14} />
          <span>Unduh Template Asli</span>
        </button>

        {onDownloadFilledDocx && formatExt === 'docx' && (
          <button
            type="button"
            onClick={() => {
              if (template) void onDownloadFilledDocx(template)
            }}
            className="btn-action-download inline-flex items-center gap-6 rounded-lg border border-[#E2E8F0] bg-[#FFFFFF] px-12 py-6 text-[1.25rem] font-semibold text-[#008000] transition-colors hover:bg-[#F8FAFC]"
            title="Isi placeholder {{nomor_surat}}, {{nama_penerima}}, dll ke dalam dokumen Word"
          >
            <Download size={14} />
            <span>Unduh Terisi (.DOCX)</span>
          </button>
        )}
      </div>
    </div>
  )
}
