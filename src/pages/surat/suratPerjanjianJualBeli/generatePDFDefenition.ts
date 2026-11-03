import type pdfMake from 'pdfmake/build/pdfmake'

type PdfDocDefinition = Parameters<typeof pdfMake.createPdf>[0]

export interface PerjanjianJualBeliFormData {
  title: string
  nomor_surat: string
  hari: string
  tanggal: string
  tempat: string
  penjual_nama: string
  penjual_nik: string
  penjual_pekerjaan: string
  penjual_alamat: string
  penjual_telepon: string
  pembeli_nama: string
  pembeli_nik: string
  pembeli_pekerjaan: string
  pembeli_alamat: string
  pembeli_telepon: string
  pasal1_objek: string
  pasal1_spesifikasi: string
  pasal2_harga: string
  pasal2_pembayaran: string
  pasal3_penyerahan: string
  pasal4_sengketa: string
  saksi1_nama: string
  saksi2_nama: string
}

export function generatePdfDefinition(data: PerjanjianJualBeliFormData): PdfDocDefinition {
  return {
    content: [
      {
        text: (data.title || 'SURAT PERJANJIAN JUAL BELI').toUpperCase(),
        style: 'header',
        alignment: 'center',
        margin: [0, 0, 0, 5],
      },
      {
        text: `Nomor: ${data.nomor_surat || '-'}`,
        alignment: 'center',
        style: 'subheader',
        margin: [0, 0, 0, 15],
      },
      {
        canvas: [
          {
            type: 'line',
            x1: 0,
            y1: 0,
            x2: 515,
            y2: 0,
            lineWidth: 1,
          },
        ],
        margin: [0, 0, 0, 15],
      },
      {
        text: `Pada hari ini, ${data.hari || '-'}, tanggal ${data.tanggal || '-'}, bertempat di ${data.tempat || 'Jakarta'}, kami yang bertanda tangan di bawah ini:`,
        margin: [0, 0, 0, 10],
      },
      {
        table: {
          widths: [110, 10, '*'],
          body: [
            [{ text: '1. Nama Lengkap', bold: true }, ':', data.penjual_nama || '-'],
            [{ text: '   NIK / No. KTP', bold: true }, ':', data.penjual_nik || '-'],
            [{ text: '   Pekerjaan / Jabatan', bold: true }, ':', data.penjual_pekerjaan || '-'],
            [{ text: '   Alamat', bold: true }, ':', data.penjual_alamat || '-'],
            [{ text: '   Nomor Telepon', bold: true }, ':', data.penjual_telepon || '-'],
          ],
        },
        layout: 'noBorders',
        margin: [0, 0, 0, 5],
      },
      {
        text: 'Selanjutnya disebut sebagai PIHAK PERTAMA (PENJUAL).\n\n',
        italics: true,
        margin: [0, 0, 0, 5],
      },
      {
        table: {
          widths: [110, 10, '*'],
          body: [
            [{ text: '2. Nama Lengkap', bold: true }, ':', data.pembeli_nama || '-'],
            [{ text: '   NIK / No. KTP', bold: true }, ':', data.pembeli_nik || '-'],
            [{ text: '   Pekerjaan / Jabatan', bold: true }, ':', data.pembeli_pekerjaan || '-'],
            [{ text: '   Alamat', bold: true }, ':', data.pembeli_alamat || '-'],
            [{ text: '   Nomor Telepon', bold: true }, ':', data.pembeli_telepon || '-'],
          ],
        },
        layout: 'noBorders',
        margin: [0, 0, 0, 5],
      },
      {
        text: 'Selanjutnya disebut sebagai PIHAK KEDUA (PEMBELI).\n\n',
        italics: true,
        margin: [0, 0, 0, 5],
      },
      {
        text: 'Kedua belah pihak telah sepakat untuk mengikatkan diri dalam Surat Perjanjian Jual Beli dengan ketentuan dan syarat-syarat sebagaimana tercantum dalam pasal-pasal berikut:',
        margin: [0, 0, 0, 10],
      },
      {
        text: 'Pasal 1\nOBJEK JUAL BELI',
        style: 'pasalHeader',
      },
      {
        text: `PIHAK PERTAMA menyatakan menjual kepada PIHAK KEDUA, dan PIHAK KEDUA menyatakan membeli dari PIHAK PERTAMA berupa:\n${data.pasal1_objek || 'Barang/jasa sesuai kesepakatan'}.\nKondisi dan spesifikasi barang: ${data.pasal1_spesifikasi || 'Lengkap dan berfungsi normal.'}`,
        margin: [0, 0, 0, 10],
      },
      {
        text: 'Pasal 2\nHARGA DAN CARA PEMBAYARAN',
        style: 'pasalHeader',
      },
      {
        text: `1. Harga objek jual beli yang disepakati oleh kedua belah pihak adalah sebesar ${data.pasal2_harga || '-'}.\n2. Tata cara pembayaran yang disepakati adalah: ${data.pasal2_pembayaran || 'Sesuai kesepakatan tertulis para pihak'}.`,
        margin: [0, 0, 0, 10],
      },
      {
        text: 'Pasal 3\nPENYERAHAN BARANG & HAK MILIK',
        style: 'pasalHeader',
      },
      {
        text:
          data.pasal3_penyerahan ||
          '1. Penyerahan objek jual beli beserta dokumen terkait dilakukan sesuai jadwal yang disepakati.\n2. Sejak serah terima barang dan pelunasan pembayaran, seluruh hak milik serta tanggung jawab beralih kepada PIHAK KEDUA.',
        margin: [0, 0, 0, 10],
      },
      {
        text: 'Pasal 4\nPENYELESAIAN PERSELISIHAN',
        style: 'pasalHeader',
      },
      {
        text:
          data.pasal4_sengketa ||
          'Apabila di kemudian hari timbul perselisihan yang berkaitan dengan pelaksanaan perjanjian ini, maka kedua belah pihak sepakat untuk menyelesaikannya secara musyawarah untuk mufakat. Apabila musyawarah tidak tercapai, perselisihan akan diselesaikan melalui jalur hukum di Pengadilan Negeri setempat.',
        margin: [0, 0, 0, 15],
      },
      {
        text: 'Demikian surat perjanjian jual beli ini dibuat dengan penuh kesadaran dan tanpa paksaan dari pihak manapun, dibuat dalam rangkap 2 (dua) yang masing-masing memiliki kekuatan hukum yang sama.',
        margin: [0, 0, 0, 20],
      },
      {
        columns: [
          {
            width: '*',
            alignment: 'center',
            text: `PIHAK PERTAMA (PENJUAL)\n(Meterai Rp 10.000)\n\n\n\n\n(${data.penjual_nama || 'Nama Penjual'})`,
          },
          {
            width: '*',
            alignment: 'center',
            text: `PIHAK KEDUA (PEMBELI)\n\n\n\n\n\n(${data.pembeli_nama || 'Nama Pembeli'})`,
          },
        ],
        margin: [0, 0, 0, 20],
      },
      {
        text: 'Saksi-Saksi:\n\n',
        alignment: 'center',
        bold: true,
      },
      {
        columns: [
          {
            width: '*',
            alignment: 'center',
            text: `Saksi I:\n\n\n\n(${data.saksi1_nama || 'Nama Saksi 1'})`,
          },
          {
            width: '*',
            alignment: 'center',
            text: `Saksi II:\n\n\n\n(${data.saksi2_nama || 'Nama Saksi 2'})`,
          },
        ],
      },
    ],
    styles: {
      header: {
        fontSize: 14,
        bold: true,
      },
      subheader: {
        fontSize: 10,
        color: '#475569',
      },
      pasalHeader: {
        fontSize: 10,
        bold: true,
        alignment: 'center',
        margin: [0, 4, 0, 4],
      },
    },
    defaultStyle: {
      fontSize: 9.5,
      lineHeight: 1.25,
    },
  }
}
