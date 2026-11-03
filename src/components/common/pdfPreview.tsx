import { FileText } from 'lucide-react'

export default function PDFPreview({ pdfUrl }: { pdfUrl?: string | null }) {
  return (
    <div className="scrollbar flex h-full min-h-[50rem] flex-col overflow-auto rounded-2xl border border-[#E2E8F0] bg-[#FFFFFF] p-12">
      {pdfUrl ? (
        <iframe
          title="PDF Preview"
          src={pdfUrl}
          className="h-[100rem] w-full rounded-xl border border-[#E2E8F0] phones:h-[60rem]"
        />
      ) : (
        <div className="flex h-full min-h-[40rem] flex-col items-center justify-center gap-12 rounded-xl border border-dashed border-[#E2E8F0] bg-[#F8FAFC] p-24 text-center">
          <div className="flex h-16 w-16 items-center justify-center text-[#0000FF]">
            <FileText size={28} />
          </div>
          <div>
            <p className="text-[1.5rem] font-semibold text-[#000000]">Pratinjau Dokumen PDF</p>
            <p className="mt-4 text-[1.3rem] text-[#000000]">Menyiapkan dan merender tampilan dokumen PDF...</p>
          </div>
        </div>
      )}
    </div>
  )
}
