import { Box, Inbox, ShoppingCart, Handshake, LucideIcon } from 'lucide-react'
import { DOCUMENT_CATEGORY_TOKENS, getDocumentCategoryStyle } from '@/utils/semanticTokens'

export interface LetterTemplate {
  id: string
  type: string
  name: string
  slug: string
  shortDesc: string
  longDesc: string
  icon: LucideIcon
  colorClass: string
  badgeBg: string
  supportedFormats: Array<'pdf' | 'xlsx' | 'docx'>
  previewSample: {
    title: string
    parties: string
    keyPoints: string[]
  }
}

export const LETTER_TEMPLATES: LetterTemplate[] = [
  {
    id: 'tpl-surat-penawaran',
    type: 'SURAT_PENAWARAN',
    name: 'Surat Penawaran',
    slug: 'surat-penawaran',
    shortDesc: 'Menawarkan harga barang atau jasa secara resmi dan profesional kepada calon klien.',
    longDesc:
      'Template resmi surat penawaran harga (Quotation) lengkap dengan rincian produk, kuantitas, harga satuan, kalkulasi PPN otomatis atau manual, masa berlaku, serta integrasi ekspor multi-format (PDF, Excel, dan Word).',
    icon: Box,
    colorClass: DOCUMENT_CATEGORY_TOKENS.SURAT_PENAWARAN.iconBoxClass,
    badgeBg: DOCUMENT_CATEGORY_TOKENS.SURAT_PENAWARAN.badgeClass,
    supportedFormats: ['pdf', 'xlsx', 'docx'],
    previewSample: {
      title: 'Penawaran Pengadaan Perangkat & Jasa TI',
      parties: 'Dari: PT Sinergi Karunia Sejahtera | Kepada: PT Pelanggan Utama',
      keyPoints: [
        'Daftar item produk & kuantitas terstruktur',
        'Kalkulasi PPN 11% / manual otomatis',
        'Tanda tangan & stempel perusahaan digital',
        'Ekspor PDF, Excel (.xlsx), dan Word (.docx)',
      ],
    },
  },
  {
    id: 'tpl-surat-permintaan-barang',
    type: 'SURAT_PERMINTAAN_BARANG',
    name: 'Surat Permintaan Barang',
    slug: 'surat-permintaan-barang',
    shortDesc: 'Pengajuan kebutuhan barang operasional internal ke bagian procurement atau vendor.',
    longDesc:
      'Template formal untuk mengajukan permohonan pengadaan barang atau perlengkapan kantor dengan rincian spesifikasi, satuan kuantitas, keperluan, serta kolom persetujuan kepala divisi dan staf pemohon.',
    icon: Inbox,
    colorClass: DOCUMENT_CATEGORY_TOKENS.SURAT_PERMINTAAN_BARANG.iconBoxClass,
    badgeBg: DOCUMENT_CATEGORY_TOKENS.SURAT_PERMINTAAN_BARANG.badgeClass,
    supportedFormats: ['pdf'],
    previewSample: {
      title: 'Permintaan Pengadaan Perlengkapan Operasional',
      parties: 'Pemohon: Divisi Operasional | Tujuan: Bagian Pengadaan / Procurement',
      keyPoints: [
        'Kop surat resmi perusahaan & upload logo',
        'Tabel barang dengan kuantitas, satuan, dan keterangan',
        'Tanda tangan berjenjang (Mengetahui & Pemohon)',
        'Unduh langsung dokumen format PDF standar arsip',
      ],
    },
  },
  {
    id: 'tpl-surat-pesanan',
    type: 'SURAT_PESANAN',
    name: 'Surat Pesanan',
    slug: 'surat-pesanan',
    shortDesc: 'Surat pemesanan resmi (PO) untuk rekanan/vendor dengan ketentuan kirim dan bayar.',
    longDesc:
      'Template Purchase Order resmi lengkap dengan nomor referensi penawaran, daftar item, harga, tarif PPN 11%, alamat & jadwal pengiriman, syarat termin pembayaran, dan sinkronisasi opsional ke modul Purchase Order (/po).',
    icon: ShoppingCart,
    colorClass: DOCUMENT_CATEGORY_TOKENS.SURAT_PESANAN.iconBoxClass,
    badgeBg: DOCUMENT_CATEGORY_TOKENS.SURAT_PESANAN.badgeClass,
    supportedFormats: ['pdf'],
    previewSample: {
      title: 'Surat Pesanan Barang (Purchase Order)',
      parties: 'Pemesan: PT Luma | Rekanan: PT Rekanan Solusi Mandiri',
      keyPoints: [
        'Referensi silang nomor penawaran & nomor PO',
        'Kalkulasi subtotal & PPN 11% otomatis',
        'Ketentuan alamat kirim & termin pembayaran (TOP)',
        'Sinkronisasi dua arah ke modul Purchase Order',
      ],
    },
  },
  {
    id: 'tpl-surat-perjanjian-jual-beli',
    type: 'SURAT_PERJANJIAN_JUAL_BELI',
    name: 'Surat Perjanjian Jual Beli',
    slug: 'surat-perjanjian-jual-beli',
    shortDesc: 'Kontrak legal kesepakatan jual beli barang/aset antara pihak pertama dan kedua.',
    longDesc:
      'Template perjanjian jual beli berkekuatan hukum yang memuat data identitas kedua pihak (NIK, alamat, pekerjaan), pasal objek transaksi, pasal harga & termin pembayaran, klausul penyerahan hak milik, dan pasal penyelesaian sengketa serta saksi-saksi.',
    icon: Handshake,
    colorClass: DOCUMENT_CATEGORY_TOKENS.SURAT_PERJANJIAN_JUAL_BELI.iconBoxClass,
    badgeBg: DOCUMENT_CATEGORY_TOKENS.SURAT_PERJANJIAN_JUAL_BELI.badgeClass,
    supportedFormats: ['pdf'],
    previewSample: {
      title: 'Surat Perjanjian Jual Beli Aset/Barang',
      parties: 'Pihak I (Penjual) & Pihak II (Pembeli)',
      keyPoints: [
        'Identitas lengkap kedua belah pihak & NIK',
        'Pasal 1-4: Objek, Harga, Penyerahan & Sengketa',
        'Tanda tangan para pihak bermaterai & saksi-saksi',
        'Dokumen PDF resmi siap cetak dan tanda tangan',
      ],
    },
  },
]

export function getSlugFromType(type: string): string {
  switch (type) {
    case 'SURAT_PENAWARAN':
      return 'surat-penawaran'
    case 'SURAT_PERMINTAAN_BARANG':
      return 'surat-permintaan-barang'
    case 'SURAT_PESANAN':
      return 'surat-pesanan'
    case 'SURAT_PERJANJIAN_JUAL_BELI':
      return 'surat-perjanjian-jual-beli'
    default:
      return 'surat-penawaran'
  }
}

export function getTemplateMetaForType(type: string) {
  const base = LETTER_TEMPLATES.find((t) => t.type === type)
  if (base) {
    return {
      icon: base.icon,
      colorClass: base.colorClass,
      badgeBg: base.badgeBg,
      slug: base.slug,
      name: base.name,
      typeName: base.name,
    }
  }
  const fallbackToken = getDocumentCategoryStyle(type)
  return {
    icon: Box,
    colorClass: fallbackToken.iconBoxClass,
    badgeBg: fallbackToken.badgeClass,
    slug: 'surat-penawaran',
    name: fallbackToken.label,
    typeName: fallbackToken.label,
  }
}
