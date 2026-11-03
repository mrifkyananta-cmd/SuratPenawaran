import JSZip from 'jszip'
import { apiUrl } from '@/utils/billingApi'
import { closeNotification, showError, showLoading, showSuccess } from '@/utils/notifications'

export interface PlaceholderData {
  nomor_surat?: string
  nama_penerima?: string
  perusahaan_penerima?: string
  alamat_penerima?: string
  tanggal_surat?: string
  perihal?: string
  nama_pengirim?: string
  jabatan_pengirim?: string
  perusahaan_pengirim?: string
  pembuka?: string
  penutup?: string
  total?: string
  [key: string]: string | undefined
}

const escapeXml = (str: string) =>
  str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')

/**
 * Mengisi placeholder {{tag}} di dalam file DOCX menggunakan JSZip.
 */
export async function fillDocxTemplate(
  docxArrayBuffer: ArrayBuffer,
  placeholders: PlaceholderData,
): Promise<Blob> {
  const zip = await JSZip.loadAsync(docxArrayBuffer)
  const docFile = zip.file('word/document.xml')
  if (!docFile) {
    throw new Error('File DOCX tidak memiliki word/document.xml yang valid.')
  }

  const mapping: Record<string, string> = {}
  for (const [key, val] of Object.entries(placeholders)) {
    if (val != null) {
      mapping[key.toLowerCase()] = String(val)
      mapping[key.toUpperCase()] = String(val)
    }
  }

  const aliases: Array<[keyof PlaceholderData, string[]]> = [
    ['nomor_surat', ['number', 'nomor']],
    ['nama_penerima', ['recipient', 'penerima', 'party_name', 'tujuan_nama']],
    ['tanggal_surat', ['date', 'tanggal']],
    ['perihal', ['title', 'subject', 'judul']],
    ['perusahaan_penerima', ['company', 'perusahaan']],
    ['alamat_penerima', ['address', 'alamat']],
    ['nama_pengirim', ['signer', 'pengirim']],
    ['jabatan_pengirim', ['position', 'jabatan']],
  ]
  for (const [sourceKey, targetKeys] of aliases) {
    const val = placeholders[sourceKey]
    if (val) {
      for (const k of targetKeys) mapping[k] = val
    }
  }

  const replacePlaceholders = (xml: string) =>
    xml.replace(/\{\{\s*([a-zA-Z0-9_-]+)\s*\}\}/g, (match, tag) => {
      const keyLower = String(tag).toLowerCase()
      return keyLower in mapping ? escapeXml(mapping[keyLower]) : match
    })

  zip.file('word/document.xml', replacePlaceholders(await docFile.async('string')))

  const headerFooterFiles = Object.keys(zip.files).filter((fname) =>
    /^word\/(header\d*|footer\d*)\.xml$/.test(fname),
  )
  for (const hfName of headerFooterFiles) {
    const file = zip.file(hfName)
    if (file) {
      zip.file(hfName, replacePlaceholders(await file.async('string')))
    }
  }

  return zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  })
}

export async function downloadFilledDocxTemplate(
  template: { id: string; name: string },
  docNumber: string,
  placeholders: PlaceholderData,
): Promise<void> {
  try {
    showLoading('Mengisi template dokumen Word (.docx)...')
    const token = localStorage.getItem('token') || ''
    const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {}

    const res = await fetch(apiUrl(`/letter-templates/${template.id}/download`), {
      credentials: 'include',
      headers,
    })
    if (!res.ok) throw new Error('Gagal mengunduh file template')

    const arrayBuffer = await res.arrayBuffer()
    const filledBlob = await fillDocxTemplate(arrayBuffer, placeholders)

    const url = URL.createObjectURL(filledBlob)
    const a = document.createElement('a')
    a.href = url
    const safeFilename = (docNumber || template.name).replace(/[^a-zA-Z0-9_-]/g, '_')
    a.download = `${safeFilename}.docx`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)

    closeNotification()
    await showSuccess('Dokumen Word Terisi Berhasil Diunduh')
  } catch (err) {
    closeNotification()
    await showError(
      'Gagal Mengisi Template',
      err instanceof Error ? err.message : 'Terjadi kendala saat memproses DOCX',
    )
  }
}
