export type DocumentCategoryCode =
  | 'SURAT_PENAWARAN'
  | 'SURAT_PERMINTAAN_BARANG'
  | 'SURAT_PESANAN'
  | 'SURAT_PERJANJIAN_JUAL_BELI'

export interface DocumentCategoryToken {
  code: DocumentCategoryCode
  label: string
  textHex: '#0000FF' | '#008000' | '#000000'
  /** Text/font color class for category labels in tables, catalog, headers, previews, and modals (no colored background) */
  badgeClass: string
  /** Icon color class for template cards and previews (no colored box) */
  iconBoxClass: string
  /** Filter tab class when active */
  activeFilterClass: string
  /** Filter tab class when inactive */
  inactiveFilterClass: string
}

/**
 * Hanya 3 warna solid yang diperbolehkan untuk tulisan (font) dan ikon:
 * - Biru: #0000FF
 * - Hijau: #008000
 * - Hitam: #000000
 *
 * Penerapan kategori surat:
 * - Surat Penawaran: font biru (#0000FF)
 * - Surat Permintaan Barang: font hijau (#008000)
 * - Surat Pesanan: font hitam (#000000)
 * - Surat Perjanjian Jual Beli: font biru (#0000FF)
 */
export const DOCUMENT_CATEGORY_TOKENS: Record<
  DocumentCategoryCode,
  DocumentCategoryToken
> = {
  SURAT_PENAWARAN: {
    code: 'SURAT_PENAWARAN',
    label: 'Surat Penawaran',
    textHex: '#0000FF',
    badgeClass: 'badge-doc-offer bg-transparent text-[#0000FF] font-semibold',
    iconBoxClass: 'bg-transparent text-[#0000FF]',
    activeFilterClass:
      'border-[#0000FF] bg-[#FFFFFF] text-[#0000FF] font-semibold',
    inactiveFilterClass:
      'border-[#E2E8F0] bg-[#FFFFFF] text-[#0000FF] font-normal hover:bg-[#F8FAFC]',
  },
  SURAT_PERMINTAAN_BARANG: {
    code: 'SURAT_PERMINTAAN_BARANG',
    label: 'Surat Permintaan Barang',
    textHex: '#008000',
    badgeClass: 'badge-doc-request bg-transparent text-[#008000] font-semibold',
    iconBoxClass: 'bg-transparent text-[#008000]',
    activeFilterClass:
      'border-[#008000] bg-[#FFFFFF] text-[#008000] font-semibold',
    inactiveFilterClass:
      'border-[#E2E8F0] bg-[#FFFFFF] text-[#008000] font-normal hover:bg-[#F8FAFC]',
  },
  SURAT_PESANAN: {
    code: 'SURAT_PESANAN',
    label: 'Surat Pesanan',
    textHex: '#000000',
    badgeClass: 'badge-doc-order bg-transparent text-[#000000] font-semibold',
    iconBoxClass: 'bg-transparent text-[#000000]',
    activeFilterClass:
      'border-[#000000] bg-[#FFFFFF] text-[#000000] font-semibold',
    inactiveFilterClass:
      'border-[#E2E8F0] bg-[#FFFFFF] text-[#000000] font-normal hover:bg-[#F8FAFC]',
  },
  SURAT_PERJANJIAN_JUAL_BELI: {
    code: 'SURAT_PERJANJIAN_JUAL_BELI',
    label: 'Surat Perjanjian Jual Beli',
    textHex: '#0000FF',
    badgeClass:
      'badge-doc-agreement bg-transparent text-[#0000FF] font-semibold',
    iconBoxClass: 'bg-transparent text-[#0000FF]',
    activeFilterClass:
      'border-[#0000FF] bg-[#FFFFFF] text-[#0000FF] font-semibold',
    inactiveFilterClass:
      'border-[#E2E8F0] bg-[#FFFFFF] text-[#0000FF] font-normal hover:bg-[#F8FAFC]',
  },
}

export function getDocumentCategoryStyle(
  typeOrLabel?: string | null,
): DocumentCategoryToken {
  const normalized = (typeOrLabel || '').trim().toUpperCase()
  if (
    normalized === 'SURAT_PERMINTAAN_BARANG' ||
    normalized === 'SURAT PERMINTAAN BARANG'
  ) {
    return DOCUMENT_CATEGORY_TOKENS.SURAT_PERMINTAAN_BARANG
  }
  if (normalized === 'SURAT_PESANAN' || normalized === 'SURAT PESANAN') {
    return DOCUMENT_CATEGORY_TOKENS.SURAT_PESANAN
  }
  if (
    normalized === 'SURAT_PERJANJIAN_JUAL_BELI' ||
    normalized === 'SURAT PERJANJIAN JUAL BELI'
  ) {
    return DOCUMENT_CATEGORY_TOKENS.SURAT_PERJANJIAN_JUAL_BELI
  }
  return DOCUMENT_CATEGORY_TOKENS.SURAT_PENAWARAN
}

/**
 * Tombol Aksi (Tanpa background warna, hanya warna tulisan & ikon):
 * - Tombol Preview: teks dan ikon hitam (#000000)
 * - Tombol Edit: teks dan ikon biru (#0000FF)
 * - Tombol Unduh: teks dan ikon hijau (#008000)
 * - Tombol Hapus: teks dan ikon hitam (#000000)
 */
export const ACTION_BUTTON_CLASSES = {
  preview:
    'btn-action-preview inline-flex items-center justify-center gap-5 whitespace-nowrap rounded-lg border border-[#E2E8F0] bg-[#FFFFFF] px-10 py-6 text-[1.25rem] font-medium text-[#000000] hover:bg-[#F8FAFC] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#000000]',
  edit:
    'btn-action-edit inline-flex items-center justify-center gap-5 whitespace-nowrap rounded-lg border border-[#E2E8F0] bg-[#FFFFFF] px-10 py-6 text-[1.25rem] font-medium text-[#0000FF] hover:bg-[#F8FAFC] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0000FF]',
  download:
    'btn-action-download inline-flex items-center justify-center gap-5 whitespace-nowrap rounded-lg border border-[#E2E8F0] bg-[#FFFFFF] px-10 py-6 text-[1.25rem] font-medium text-[#008000] hover:bg-[#F8FAFC] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#008000]',
  delete:
    'btn-action-delete inline-flex items-center justify-center gap-5 whitespace-nowrap rounded-lg border border-[#B91C1C] bg-[#B91C1C] px-10 py-6 text-[1.25rem] font-semibold text-white shadow-sm hover:bg-[#991B1B] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B91C1C]',
  deleteIconOnly:
    'btn-action-delete inline-flex items-center justify-center whitespace-nowrap rounded-lg border border-[#B91C1C] bg-[#B91C1C] px-8 py-6 text-[1.25rem] font-semibold text-white shadow-sm hover:bg-[#991B1B] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B91C1C]',
} as const

/**
 * Warna Status (Tanpa background warna, hanya menggunakan 3 warna solid #0000FF, #008000, #000000)
 */
export const SEMANTIC_STATUS_CLASSES = {
  saved: 'bg-transparent text-[#008000] font-semibold',
  draft: 'bg-transparent text-[#000000] font-medium',
  pending: 'bg-transparent text-[#0000FF] font-semibold',
  approved: 'bg-transparent text-[#008000] font-semibold',
  sent: 'bg-transparent text-[#0000FF] font-semibold',
  rejected: 'bg-transparent text-[#000000] font-semibold',
  verified: 'bg-transparent text-[#008000] font-semibold',
  cancelled: 'bg-transparent text-[#000000] font-medium',
} as const

export function getSemanticStatusClass(status?: string | null): string {
  const s = (status || '').trim().toLowerCase()
  switch (s) {
    case 'disimpan':
    case 'saved':
      return SEMANTIC_STATUS_CLASSES.saved
    case 'verified':
    case 'paid':
    case 'selesai':
    case 'diterima':
    case 'approved':
      return SEMANTIC_STATUS_CLASSES.verified
    case 'sent':
    case 'issued':
    case 'terjadwal':
    case 'revised':
      return SEMANTIC_STATUS_CLASSES.sent
    case 'pending':
    case 'follow up':
    case 'menunggu verifikasi':
    case 'partial':
      return SEMANTIC_STATUS_CLASSES.pending
    case 'rejected':
    case 'overdue':
    case 'jatuh tempo':
      return SEMANTIC_STATUS_CLASSES.rejected
    case 'cancelled':
    case 'dibatalkan':
      return SEMANTIC_STATUS_CLASSES.cancelled
    case 'draft':
    default:
      return SEMANTIC_STATUS_CLASSES.draft
  }
}
