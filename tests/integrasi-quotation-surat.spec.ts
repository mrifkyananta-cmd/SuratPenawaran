import { test, expect } from '@playwright/test'
import path from 'node:path'

const ARTIFACT_DIR = 'C:/Users/User/.gemini/antigravity-cli/brain/1a63533a-8462-40c8-8ef7-b50de49d768c'
const FIXTURES_DIR = path.resolve('tests/fixtures')

async function loginAdmin(page: any) {
  await page.goto('/')
  const loginHeading = page.getByRole('heading', { name: 'Masuk ke Luma' })
  await expect(loginHeading).toBeVisible({ timeout: 15000 })
  await page.getByLabel('Username').fill('admin')
  await page.getByLabel('Password').fill('AdminLuma#2026')
  await page.getByRole('button', { name: 'Masuk' }).click()
  await expect(page.getByRole('dialog')).toContainText('Berhasil masuk', { timeout: 10000 })
  await page.getByRole('button', { name: 'Mengerti' }).click()
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 10000 })
}

test.describe('Integrasi Menu Surat ke Menu Quotation — LUMA E2E', () => {
  test('Alur Lengkap 16 Poin: Navigasi, Create New -> Pilih Template -> Formulir -> Preview -> Simpan -> Unduh, Upload Template, Route Redirect, dan Relasi PO/Invoice/Bukti Bayar', async ({
    page,
  }) => {
    test.setTimeout(240000)
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))

    const nonce = Date.now().toString().slice(-6)
    const numPenawaran = `QT-E2E-${nonce}`
    const numSpb = `SPB-E2E-${nonce}`
    const numSp = `PO-E2E-${nonce}`
    const numSpjb = `SPJB-E2E-${nonce}`
    const customTemplateName = `Template Kustom SPB ${nonce}`

    await page.setViewportSize({ width: 1440, height: 900 })
    await loginAdmin(page)

    // 14. Pastikan menu Surat sudah tidak muncul di sidebar (Navigasi utama: Home, Quotation, PO, Invoice, Bukti Bayar)
    const sidebarLinks = page.locator('aside a, nav a')
    await expect(page.getByRole('link', { name: 'Home' }).first()).toBeVisible()
    await expect(page.getByRole('link', { name: 'Quotation' }).first()).toBeVisible()
    await expect(page.getByRole('link', { name: 'PO', exact: true }).first()).toBeVisible()
    await expect(page.getByRole('link', { name: 'Invoice' }).first()).toBeVisible()
    await expect(page.getByRole('link', { name: 'Bukti Bayar' }).first()).toBeVisible()
    await expect(sidebarLinks.filter({ hasText: /^Surat$/ })).toHaveCount(0)

    // 1. Buka menu Quotation
    await page.getByRole('link', { name: 'Quotation' }).first().click()
    await expect(page).toHaveURL(/\/quotation$/)
    await expect(page.getByRole('heading', { name: 'Quotation', level: 1 })).toBeVisible()

    // Pastikan katalog template tidak ditampilkan secara permanen di halaman utama Quotation
    await expect(page.locator('#modal-pilih-template')).toHaveCount(0)

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'after-01-quotation-unified-page.png'),
      fullPage: true,
    })

    // 2 & 3. Klik Create New dan pastikan katalog template muncul
    const btnCreateNew = page.locator('#btn-create-new-quotation')
    await expect(btnCreateNew).toBeVisible()
    await btnCreateNew.click()

    const templateModal = page.locator('#modal-pilih-template')
    await expect(templateModal).toBeVisible()
    await expect(templateModal.getByRole('heading', { name: 'Pilih Template Surat' })).toBeVisible()

    // Pastikan ke-4 kategori tersedia di tahap Pilih Template
    await expect(templateModal.getByRole('button', { name: /Surat Penawaran/i }).first()).toBeVisible()
    await expect(templateModal.getByRole('button', { name: /Surat Permintaan Barang/i }).first()).toBeVisible()
    await expect(templateModal.getByRole('button', { name: /Surat Pesanan/i }).first()).toBeVisible()
    await expect(templateModal.getByRole('button', { name: /Surat Perjanjian Jual Beli/i }).first()).toBeVisible()

    // Pastikan tombol + Tambah Template tersedia di modal Pemilihan Template
    const btnTambahTemplate = templateModal.locator('#btn-tambah-template')
    await expect(btnTambahTemplate).toBeVisible()

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'after-02-quotation-create-new-template-modal.png'),
    })

    // 11, 12, 13. Unggah template baru menggunakan Choose File, pastikan muncul pada kategori yang benar, dan tetap tersedia setelah refresh
    await btnTambahTemplate.click()
    const uploadModal = page.locator('#modal-upload-template')
    await expect(uploadModal).toBeVisible()
    await expect(uploadModal.locator('#btn-choose-file')).toBeVisible()

    await page.locator('#input-template-name').fill(customTemplateName)
    await page.locator('#select-letter-type').selectOption('SURAT_PERMINTAAN_BARANG')
    await page.locator('#input-template-description').fill('Template kustom uji integrasi Quotation')
    await page.locator('#input-file-template').setInputFiles(path.join(FIXTURES_DIR, 'template-spb.docx'))

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'after-03-quotation-upload-template-modal.png'),
    })

    await page.locator('#btn-submit-upload-template').click()
    await expect(page.locator('.swal2-modal')).toContainText('Template Berhasil Disimpan', { timeout: 10000 })
    await page.locator('.swal2-confirm').click()

    // Setelah simpan template, modal Pilih Template terbuka kembali pada kategori SURAT_PERMINTAAN_BARANG
    await expect(templateModal).toBeVisible()
    await expect(templateModal.getByRole('heading', { name: customTemplateName }).first()).toBeVisible()

    // Pastikan tidak muncul pada kategori yang berbeda (mis. Surat Pesanan)
    await templateModal.getByRole('button', { name: /Surat Pesanan/i }).first().click()
    await expect(templateModal.getByRole('heading', { name: customTemplateName })).toHaveCount(0)

    // 13. Refresh halaman dan pastikan template tetap tersedia
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Quotation', level: 1 })).toBeVisible()
    await page.locator('#btn-create-new-quotation').click()
    await expect(templateModal).toBeVisible()
    await templateModal.getByRole('button', { name: /Surat Permintaan Barang/i }).first().click()
    await expect(templateModal.getByRole('heading', { name: customTemplateName }).first()).toBeVisible()

    // 4, 5, 6, 7. Pilih masing-masing template bawaan, pastikan form sesuai, isi formulir, periksa preview, simpan, dan uji kembali ke pemilihan template tanpa kehilangan draft
    await templateModal.getByRole('button', { name: /Semua Kategori/i }).first().click()

    // --- TEMPLATE 1: SURAT PENAWARAN ---
    await templateModal.getByRole('heading', { name: 'Surat Penawaran', exact: true }).first().click()
    await templateModal.locator('#btn-use-template-tpl-surat-penawaran').click()
    await expect(page).toHaveURL(/\/quotation\/surat-penawaran/)
    await expect(page.getByRole('heading', { name: 'Surat Penawaran' })).toBeVisible()

    await page.getByLabel('Nomor penawaran *').fill(numPenawaran)
    await page.getByLabel('Nama atau perusahaan tujuan *').fill('PT Mitra Integrasi Nusantara')
    await page.getByLabel('Alamat tujuan').fill('Jl. Jend. Sudirman Kav. 52, Jakarta')

    // Uji kembali ke pemilihan template tanpa kehilangan data yang belum disimpan
    await page.locator('#btn-back-to-templates').click()
    await expect(page).toHaveURL(/\/quotation/)
    await expect(templateModal).toBeVisible()
    await templateModal.locator('#btn-use-template-tpl-surat-penawaran').click()
    await expect(page.getByLabel('Nomor penawaran *')).toHaveValue(numPenawaran)
    await expect(page.getByLabel('Nama atau perusahaan tujuan *')).toHaveValue('PT Mitra Integrasi Nusantara')

    // Pastikan live preview muncul di form Surat Penawaran
    await expect(page.getByAltText(/Halaman 1 dari/i)).toBeVisible({ timeout: 10000 })

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'after-04-form-surat-penawaran-preview.png'),
    })

    // Simpan Surat Penawaran
    await page.locator('#btn-save-document').click()
    await expect(page.locator('.swal2-modal')).toContainText(/tersimpan/i, { timeout: 10000 })
    await page.locator('.swal2-confirm').click()

    // --- TEMPLATE 2: SURAT PERMINTAAN BARANG ---
    await page.locator('#btn-back-to-templates').click()
    await expect(templateModal).toBeVisible()
    await templateModal.getByRole('heading', { name: 'Surat Permintaan Barang', exact: true }).first().click()
    await templateModal.locator('#btn-use-template-tpl-surat-permintaan-barang').click()
    await expect(page).toHaveURL(/\/quotation\/surat-permintaan-barang/)
    await expect(page.getByRole('heading', { name: 'Surat Permintaan Barang' })).toBeVisible()

    await page.locator('input[name="nomor_surat"]').fill(numSpb)
    await page.locator('input[name="tujuan_nama"]').fill('Divisi Pengadaan TI')
    await page.locator('input[name="tujuan_perusahaan"]').fill('PT Luma')
    await expect(page.locator('iframe[title="PDF Preview"]')).toBeVisible({ timeout: 10000 })

    await page.locator('#btn-save-document').click()
    await expect(page.locator('.swal2-modal')).toContainText(/tersimpan/i, { timeout: 10000 })
    await page.locator('.swal2-confirm').click()

    // --- TEMPLATE 3: SURAT PESANAN ---
    await page.locator('#btn-back-to-templates').click()
    await expect(templateModal).toBeVisible()
    await templateModal.getByRole('heading', { name: 'Surat Pesanan', exact: true }).first().click()
    await templateModal.locator('#btn-use-template-tpl-surat-pesanan').click()
    await expect(page).toHaveURL(/\/quotation\/surat-pesanan/)
    await expect(page.getByRole('heading', { name: 'Surat Pesanan (PO)' })).toBeVisible()

    await page.locator('input[name="nomor_surat"]').fill(numSp)
    await page.locator('input[name="vendor_perusahaan"]').fill('PT Vendor Hardware Utama')
    await expect(page.locator('iframe[title="PDF Preview"]')).toBeVisible({ timeout: 10000 })

    await page.locator('#btn-save-document').click()
    await expect(page.locator('.swal2-modal')).toContainText(/tersimpan/i, { timeout: 10000 })
    await page.locator('.swal2-confirm').click()

    // --- TEMPLATE 4: SURAT PERJANJIAN JUAL BELI ---
    await page.locator('#btn-back-to-templates').click()
    await expect(templateModal).toBeVisible()
    await templateModal.getByRole('heading', { name: 'Surat Perjanjian Jual Beli', exact: true }).first().click()
    await templateModal.locator('#btn-use-template-tpl-surat-perjanjian-jual-beli').click()
    await expect(page).toHaveURL(/\/quotation\/surat-perjanjian-jual-beli/)
    await expect(page.getByRole('heading', { name: 'Surat Perjanjian Jual Beli' })).toBeVisible()

    await page.locator('input[name="nomor_surat"]').fill(numSpjb)
    await page.locator('input[name="penjual_nama"]').fill('Budi Hartono')
    await page.locator('input[name="pembeli_nama"]').fill('PT Pembeli Makmur Jaya')
    await page.locator('textarea[name="pasal1_objek"]').fill('1 Unit Server Rack Enterprise')
    await expect(page.locator('iframe[title="PDF Preview"]')).toBeVisible({ timeout: 10000 })

    await page.locator('#btn-save-document').click()
    await expect(page.locator('.swal2-modal')).toContainText(/tersimpan/i, { timeout: 10000 })
    await page.locator('.swal2-confirm').click()

    // 8. Kembali ke halaman Quotation dan pastikan ke-4 dokumen muncul pada daftar Quotation
    await page.getByRole('link', { name: 'Quotation' }).first().click()
    await expect(page).toHaveURL(/\/quotation$/)
    await expect(page.getByText(numPenawaran)).toBeVisible()
    await expect(page.getByText(numSpb)).toBeVisible()
    await expect(page.getByText(numSp)).toBeVisible()
    await expect(page.getByText(numSpjb)).toBeVisible()

    // Uji Filter jenis surat
    const filterJenis = page.getByLabel('Filter jenis surat')
    await filterJenis.selectOption('SURAT_PERMINTAAN_BARANG')
    await expect(page.getByText(numSpb)).toBeVisible()
    await expect(page.getByText(numPenawaran)).not.toBeVisible()
    await filterJenis.selectOption('ALL')

    // 9 & 10. Buka kembali dokumen yang tersimpan, uji preview, edit, dan unduh
    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: `Unduh ${numPenawaran}` }).click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toContain('.pdf')
    await expect(page.locator('.swal2-modal')).toContainText('Dokumen berhasil diunduh', { timeout: 10000 })
    await page.locator('.swal2-confirm').click()

    // Uji tombol Edit dari tabel Quotation -> membuka kembali dokumen tersimpan
    await page.getByRole('button', { name: `Edit ${numSpb}` }).click()
    await expect(page).toHaveURL(/\/quotation\/surat-permintaan-barang\?id=/)
    await expect(page.locator('input[name="nomor_surat"]')).toHaveValue(numSpb)
    await page.locator('input[name="tujuan_nama"]').fill('Divisi Pengadaan TI (Updated)')
    await page.locator('#btn-save-document').click()
    await expect(page.locator('.swal2-modal')).toContainText(/tersimpan/i, { timeout: 10000 })
    await page.locator('.swal2-confirm').click()

    // 15. Pastikan route lama (/surat dan /surat/surat-penawaran) tidak menghasilkan error dan diarahkan ke Quotation
    await page.goto('/surat')
    await expect(page).toHaveURL(/\/quotation$/)
    await expect(page.getByRole('heading', { name: 'Quotation', level: 1 })).toBeVisible()

    await page.goto('/surat/surat-pesanan')
    await expect(page).toHaveURL(/\/quotation\/surat-pesanan/)
    await expect(page.getByRole('heading', { name: 'Surat Pesanan (PO)' })).toBeVisible()

    // 16. Pastikan alur Quotation -> PO -> Invoice -> Bukti Bayar tetap berfungsi
    await page.getByRole('link', { name: 'PO', exact: true }).first().click()
    await expect(page).toHaveURL(/\/po$/)
    await expect(page.getByRole('heading', { name: 'Purchase Order' })).toBeVisible()
    // Surat Pesanan yang disinkronkan ke PO harus terlihat di daftar PO
    await expect(page.getByText(numSp)).toBeVisible()

    await page.getByRole('link', { name: 'Invoice' }).first().click()
    await expect(page).toHaveURL(/\/invoice$/)
    await expect(page.getByRole('heading', { name: 'Invoice' })).toBeVisible()

    await page.getByRole('link', { name: 'Bukti Bayar' }).first().click()
    await expect(page).toHaveURL(/\/bukti-bayar$/)
    await expect(page.getByRole('heading', { name: 'Bukti Bayar' })).toBeVisible()

    // Uji Responsivitas pada 3 ukuran layar: Desktop 1440x900, Laptop 1280x720, Mobile 390x844
    await page.goto('/quotation')
    await expect(page.getByRole('heading', { name: 'Quotation', level: 1 })).toBeVisible()

    await page.setViewportSize({ width: 1440, height: 900 })
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'after-05-viewport-desktop-1440x900.png'),
      fullPage: true,
    })

    await page.setViewportSize({ width: 1280, height: 720 })
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'after-06-viewport-laptop-1280x720.png'),
      fullPage: true,
    })

    await page.setViewportSize({ width: 390, height: 844 })
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'after-07-viewport-mobile-390x844.png'),
      fullPage: true,
    })

    // Cleanup data uji E2E agar tidak mengotori database produksi
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.locator('#btn-create-new-quotation').click()
    await expect(templateModal).toBeVisible()
    const deleteTplBtn = templateModal.locator('button[id^="btn-delete-template-"]').first()
    if (await deleteTplBtn.isVisible()) {
      await deleteTplBtn.click()
      await expect(page.locator('.swal2-modal')).toBeVisible()
      await page.locator('.swal2-confirm').click()
      await expect(page.locator('.swal2-modal')).toContainText('Template berhasil dihapus', { timeout: 10000 })
      await page.locator('.swal2-confirm').click()
    }
    await templateModal.getByRole('button', { name: 'Tutup modal pemilihan template' }).click()

    for (const docNum of [numPenawaran, numSpb, numSp, numSpjb]) {
      const delBtn = page.getByRole('button', { name: `Hapus ${docNum}` })
      if (await delBtn.isVisible()) {
        await delBtn.click()
        await expect(page.locator('.swal2-modal')).toBeVisible()
        await page.locator('.swal2-confirm').click()
        await expect(page.locator('.swal2-modal')).toContainText('berhasil dihapus', { timeout: 10000 })
        await page.locator('.swal2-confirm').click()
      }
    }

    expect(errors).toEqual([])
  })
})
