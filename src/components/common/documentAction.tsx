import { Download, ExternalLink, Printer } from 'lucide-react'
import { showError, showSuccess } from '@/utils/notifications'

export default function DocumentActions({
  onOpen,
  onPrint,
  onDownload,
}: {
  onOpen: () => void
  onPrint: () => void
  onDownload: () => void | Promise<void>
}) {
  const handleDownload = async () => {
    try {
      await onDownload()
      await showSuccess('File PDF berhasil dibuat')
    } catch {
      await showError('Gagal membuat PDF', 'Periksa kembali data dokumen dan coba lagi.')
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-8">
      <button
        type="button"
        onClick={onOpen}
        title="Buka pratinjau PDF di tab baru"
        className="btn-action-preview inline-flex min-h-[4rem] items-center gap-8 rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] px-14 py-10 text-[1.35rem] font-semibold leading-[1.4] text-[#000000] transition-colors hover:bg-[#F8FAFC]"
      >
        <ExternalLink size={15} className="shrink-0" />
        <span>Open</span>
      </button>
      <button
        type="button"
        onClick={onPrint}
        title="Cetak dokumen PDF"
        className="inline-flex min-h-[4rem] items-center gap-8 rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] px-14 py-10 text-[1.35rem] font-semibold leading-[1.4] text-[#000000] transition-colors hover:bg-[#F8FAFC] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0000FF]"
      >
        <Printer size={15} className="shrink-0 text-[#000000]" />
        <span>Print</span>
      </button>
      <button
        type="button"
        onClick={() => void handleDownload()}
        title="Unduh dokumen PDF"
        className="btn-action-download inline-flex min-h-[4rem] items-center gap-8 rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] px-14 py-10 text-[1.35rem] font-semibold leading-[1.4] text-[#008000] transition-colors hover:bg-[#F8FAFC]"
      >
        <Download size={15} className="shrink-0" />
        <span>Download</span>
      </button>
    </div>
  )
}
