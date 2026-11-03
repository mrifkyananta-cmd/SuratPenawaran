
import { useEffect, useRef, useState } from 'react'
import type { QuotationData } from './quotationShared'

type QuotationPreviewData = QuotationData & {
  signatureImage?: string
  stampImage?: string
}

/** Jeda sebentar setelah perubahan isian sebelum pratinjau dibuat ulang. */
const REFRESH_DELAY_MS = 600

/** Mengubah setiap halaman PDF menjadi gambar untuk ditampilkan di pratinjau. */
async function renderPages(
  pdf: Blob,
  targetWidth: number,
): Promise<string[]> {
  const [pdfjs, worker] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.js?url'),
  ])

  pdfjs.GlobalWorkerOptions.workerSrc = worker.default

  const pdfDocument = await pdfjs.getDocument({
    data: new Uint8Array(await pdf.arrayBuffer()),
  }).promise

  try {
    const pixelRatio = Math.min(
      2,
      Math.max(1, window.devicePixelRatio || 1),
    )

    const images: string[] = []

    for (
      let number = 1;
      number <= pdfDocument.numPages;
      number++
    ) {
      const page = await pdfDocument.getPage(number)
      const base = page.getViewport({ scale: 1 })

      const viewport = page.getViewport({
        scale: (targetWidth * pixelRatio) / base.width,
      })

      const canvas = document.createElement('canvas')
      canvas.width = Math.floor(viewport.width)
      canvas.height = Math.floor(viewport.height)

      const context = canvas.getContext('2d')

      if (!context) {
        throw new Error(
          'Pratinjau tidak dapat digambar di browser ini.',
        )
      }

      await page.render({
        canvasContext: context,
        viewport,
      }).promise

      images.push(canvas.toDataURL('image/png'))
    }

    return images
  } finally {
    void pdfDocument.destroy()
  }
}

/**
 * Pratinjau menggunakan PDF yang sama dengan file unduhan.
 * Perubahan data, tanda tangan, dan stempel akan membuat PDF baru.
 */
export default function QuotationPreview({
  data,
}: {
  data: QuotationPreviewData
}) {
  const containerRef = useRef<HTMLDivElement>(null)

  const [pages, setPages] = useState<string[]>([])
  const [pdfUrl, setPdfUrl] = useState('')
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    let newPdfUrl = ''

    const timer = window.setTimeout(async () => {
      setBusy(true)

      try {
        const { createQuotationPdf } = await import('./exportPdf')

        // Sertakan kedua gambar ketika membuat PDF untuk pratinjau.
        const pdfData: QuotationDataPreviewInput = {
          ...data,
          signatureImage: data.signatureImage,
          stampImage: data.stampImage,
        }

        const blob = await createQuotationPdf(pdfData)

        if (cancelled) return

        const images = await renderPages(
          blob,
          containerRef.current?.clientWidth || 520,
        )

        if (cancelled) return

        newPdfUrl = URL.createObjectURL(blob)

        setPages(images)
        setPdfUrl((previous) => {
          if (previous) URL.revokeObjectURL(previous)
          return newPdfUrl
        })

        setError('')
      } catch (cause) {
        if (!cancelled) {
          setError(
            cause instanceof Error
              ? cause.message
              : 'Pratinjau gagal dibuat.',
          )
        }
      } finally {
        if (!cancelled) {
          setBusy(false)
        }
      }
    }, REFRESH_DELAY_MS)

    return () => {
      cancelled = true
      window.clearTimeout(timer)

      if (newPdfUrl) {
        URL.revokeObjectURL(newPdfUrl)
      }
    }
  }, [data])

  useEffect(() => {
    return () => {
      if (pdfUrl) {
        URL.revokeObjectURL(pdfUrl)
      }
    }
  }, [pdfUrl])

  return (
    <div
      className="flex min-w-0 flex-col gap-8"
      ref={containerRef}
    >
      <p className="text-[#000000]">
        {busy
          ? 'Memperbarui pratinjau...'
          : 'Pratinjau otomatis diperbarui saat isian, tanda tangan, atau stempel berubah.'}

        {pdfUrl && (
          <>
            {' '}
            <a
              href={pdfUrl}
              target="_blank"
              rel="noreferrer"
              className="font-medium text-[#0000FF] underline hover:text-[#0000FF]"
            >
              Buka PDF di tab baru
            </a>
          </>
        )}
      </p>

      {error && (
        <p role="alert" className="text-[#000000]">
          {error}
        </p>
      )}

      <div
        aria-label="Pratinjau surat penawaran"
        className="scrollbar flex max-h-[80vh] flex-col gap-12 overflow-auto rounded-xl border border-[#E2E8F0] bg-[#F1F5F9] p-8"
      >
        {pages.length === 0 && !error && (
          <p className="p-16 text-[#000000]">
            Menyiapkan pratinjau...
          </p>
        )}

        {pages.map((source, index) => (
          <img
            key={`${index}-${source.length}`}
            src={source}
            alt={`Halaman ${index + 1} dari ${pages.length}`}
            className="w-full bg-[#FFFFFF] shadow-sm"
          />
        ))}
      </div>
    </div>
  )
}

type QuotationDataPreviewInput = QuotationData & {
  signatureImage?: string
  stampImage?: string
}