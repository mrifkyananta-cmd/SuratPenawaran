import type pdfMake from 'pdfmake/build/pdfmake'

type PdfDocDefinition = Parameters<typeof pdfMake.createPdf>[0]

export interface PesananBarangItem {
  nama: string
  jumlah: number
  satuan: string
  harga: number
}

export interface SuratPesananFormData {
  logo: string
  header1: string
  header2: string
  header3: string
  nomor_surat: string
  perihal: string
  ref_penawaran: string
  tempat_tanggal: string
  vendor_nama: string
  vendor_perusahaan: string
  vendor_alamat: string
  vendor_kontak: string
  pembuka: string
  items: PesananBarangItem[]
  kenaPpn: boolean
  alamat_kirim: string
  tgl_kirim: string
  syarat_bayar: string
  penutup: string
  pemesan_perusahaan: string
  pemesan_nama: string
}

export function generatePdfDefinition(data: SuratPesananFormData): PdfDocDefinition {
  const rupiah = (num: number) =>
    new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0,
    }).format(num || 0)

  const subtotal = (data.items || []).reduce(
    (sum, item) => sum + (Number(item.jumlah) || 0) * (Number(item.harga) || 0),
    0,
  )
  const ppn = data.kenaPpn ? subtotal * 0.11 : 0
  const grandTotal = subtotal + ppn

  return {
    content: [
      {
        columns: data.logo
          ? [
              {
                image: data.logo,
                width: 70,
                height: 70,
              },
              [
                { text: (data.header1 || 'PT LUMA').toUpperCase(), style: 'header' },
                { text: (data.header2 || '').toUpperCase(), style: 'subheader' },
                { text: data.header3 || '', style: 'small' },
              ],
            ]
          : [
              {
                width: '*',
                alignment: 'center',
                stack: [
                  { text: (data.header1 || 'PT LUMA').toUpperCase(), style: 'header' },
                  { text: (data.header2 || '').toUpperCase(), style: 'subheader' },
                  { text: data.header3 || '', style: 'small' },
                ],
              },
            ],
        columnGap: 10,
        margin: [0, 0, 0, 5],
      },
      {
        canvas: [
          {
            type: 'line',
            x1: 0,
            y1: 0,
            x2: 515,
            y2: 0,
            lineWidth: 1.5,
          },
        ],
        margin: [0, 0, 0, 15],
      },
      {
        columns: [
          {
            width: '*',
            text: [
              { text: 'Nomor PO    : ', bold: true },
              `${data.nomor_surat || '-'}\n`,
              { text: 'Perihal        : ', bold: true },
              `${data.perihal || '-'}\n`,
              { text: 'Ref. Penawaran : ', bold: true },
              `${data.ref_penawaran || '-'}\n`,
            ],
          },
          {
            width: 'auto',
            alignment: 'right',
            text: `${data.tempat_tanggal || '-'}`,
          },
        ],
        margin: [0, 0, 0, 15],
      },
      {
        text: [
          'Kepada Yth. Rekanan / Vendor:\n',
          { text: `${data.vendor_nama || data.vendor_perusahaan || '-'}\n`, bold: true },
          `${data.vendor_perusahaan ? data.vendor_perusahaan + '\n' : ''}`,
          `${data.vendor_alamat || ''}\n`,
          `${data.vendor_kontak ? 'Kontak: ' + data.vendor_kontak + '\n' : ''}\n`,
        ],
        margin: [0, 0, 0, 5],
      },
      {
        text:
          data.pembuka ||
          'Dengan hormat,\nMerujuk pada kesepakatan dan penawaran harga yang telah diberikan, bersama ini kami menerbitkan Surat Pesanan (Purchase Order) untuk pengadaan barang berikut:',
        margin: [0, 0, 0, 10],
      },
      {
        table: {
          headerRows: 1,
          widths: [20, '*', 40, 45, 80, 85],
          body: [
            [
              { text: 'No', style: 'tableHeader', alignment: 'center' },
              { text: 'Deskripsi Barang', style: 'tableHeader' },
              { text: 'Qty', style: 'tableHeader', alignment: 'center' },
              { text: 'Satuan', style: 'tableHeader', alignment: 'center' },
              { text: 'Harga Satuan', style: 'tableHeader', alignment: 'right' },
              { text: 'Total', style: 'tableHeader', alignment: 'right' },
            ],
            ...(data.items || []).map((item, idx) => {
              const totalItem = (Number(item.jumlah) || 0) * (Number(item.harga) || 0)
              return [
                { text: String(idx + 1), alignment: 'center' as const },
                item.nama || '-',
                { text: String(item.jumlah || 1), alignment: 'center' as const },
                { text: item.satuan || 'Pcs', alignment: 'center' as const },
                { text: rupiah(item.harga), alignment: 'right' as const },
                { text: rupiah(totalItem), alignment: 'right' as const },
              ]
            }),
            [
              { text: 'Subtotal', colSpan: 5, bold: true, alignment: 'right' },
              {},
              {},
              {},
              {},
              { text: rupiah(subtotal), bold: true, alignment: 'right' },
            ],
            ...(data.kenaPpn
              ? [
                  [
                    { text: 'PPN 11%', colSpan: 5, bold: true, alignment: 'right' as const },
                    {},
                    {},
                    {},
                    {},
                    { text: rupiah(ppn), bold: true, alignment: 'right' as const },
                  ],
                ]
              : []),
            [
              { text: 'Grand Total', colSpan: 5, bold: true, alignment: 'right', fillColor: '#f1f5f9' },
              {},
              {},
              {},
              {},
              { text: rupiah(grandTotal), bold: true, alignment: 'right', fillColor: '#f1f5f9' },
            ],
          ],
        },
        layout: {
          fillColor: (rowIndex: number) => (rowIndex === 0 ? '#f8fafc' : null),
        },
        margin: [0, 0, 0, 15],
      },
      {
        text: [
          { text: 'Ketentuan Pengiriman & Pembayaran:\n', bold: true },
          `1. Alamat Pengiriman : ${data.alamat_kirim || '-'}\n`,
          `2. Tanggal Pengiriman : ${data.tgl_kirim || 'Sesuai kesepakatan'}\n`,
          `3. Cara Pembayaran    : ${data.syarat_bayar || 'Transfer bank setelah invoice diterima'}\n\n`,
        ],
        margin: [0, 0, 0, 5],
      },
      {
        text:
          data.penutup ||
          'Demikian surat pesanan ini kami buat untuk dapat diproses secepatnya. Atas kerja samanya kami ucapkan terima kasih.',
        margin: [0, 0, 0, 20],
      },
      {
        columns: [
          {
            width: '*',
            alignment: 'center',
            text: `Dikonfirmasi oleh Vendor,\n\n\n\n\n(${data.vendor_nama || 'Nama Rekanan'})`,
          },
          {
            width: '*',
            alignment: 'center',
            text: `Pemesan,\n${data.pemesan_perusahaan || 'PT Luma'}\n\n\n\n\n(${data.pemesan_nama || 'Nama Penandatangan'})`,
          },
        ],
      },
    ],
    styles: {
      header: {
        fontSize: 14,
        bold: true,
        alignment: 'center',
        lineHeight: 1.2,
      },
      subheader: {
        fontSize: 11,
        bold: true,
        alignment: 'center',
        lineHeight: 1.2,
      },
      small: {
        fontSize: 9,
        alignment: 'center',
        lineHeight: 1.1,
      },
      tableHeader: {
        bold: true,
        fontSize: 9,
        color: '#0f172a',
      },
    },
    defaultStyle: {
      fontSize: 10,
      lineHeight: 1.3,
    },
  }
}
