import { test, expect } from '@playwright/test'
import path from 'node:path'

const ARTIFACT_DIR = 'C:/Users/User/.gemini/antigravity-cli/brain/8601560e-d67e-4ce0-a2e1-895f1754d475'
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

test.describe('Fitur Upload Template Surat Baru via Choose File', () => {
  test('Alur Lengkap: Pisahkan Tombol, Form Upload, Validasi, Kategori, Persistensi, Penggunaan, DOCX Fill, dan Hapus', async ({
    page,
  }) => {
    test.setTimeout(180000)
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))

    const nonce = Date.now().toString().slice(-6)
    const templateSpbName = `Template SPB Procurement ${nonce}`
    const templateQuoteName = `Template Penawaran Mitra ${nonce}`

    await page.setViewportSize({ width: 1440, height: 900 })
    await loginAdmin(page)

    // 1. Buka Halaman Surat
    await page.goto('/surat')
    await expect(page.getByRole('heading', { name: 'Daftar Surat' })).toBeVisible({ timeout: 10000 })

    // Verifikasi kedua tombol berbeda di header
    const btnTambahTemplate = page.locator('#btn-tambah-template')
    const btnBuatSurat = page.locator('#btn-create-new-surat')
    await expect(btnTambahTemplate).toBeVisible()
    await expect(btnBuatSurat).toBeVisible()
    await expect(btnTambahTemplate).toContainText('Tambah Template')
    await expect(btnBuatSurat).toContainText('Buat Surat dari Template')

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'step-01-surat-header-two-buttons.png'),
      fullPage: true,
    })

    // 2. Buka Form Tambah Template Baru
    await btnTambahTemplate.click()
    const uploadModal = page.locator('#modal-upload-template')
    await expect(uploadModal).toBeVisible()
    await expect(uploadModal.getByRole('heading', { name: 'Tambah Template Surat Baru' })).toBeVisible()

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'step-02-modal-upload-template-empty.png'),
    })

    // 3. Uji Validasi: Submit tanpa file
    const submitUploadBtn = page.locator('#btn-submit-upload-template')
    await submitUploadBtn.click()
    await expect(uploadModal).toContainText('Silakan pilih file template')

    // 4. Uji Validasi Format Tidak Didukung (.txt)
    const fileInput = page.locator('#input-file-template')
    await fileInput.setInputFiles(path.join(FIXTURES_DIR, 'template-invalid.txt'))
    await expect(uploadModal).toContainText('Format file ".txt" tidak didukung')

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'step-03-validation-invalid-file.png'),
    })

    // 5. Unggah Template DOCX Valid (Surat Permintaan Barang)
    await page.locator('#input-template-name').fill(templateSpbName)
    await page.locator('#select-letter-type').selectOption('SURAT_PERMINTAAN_BARANG')
    await page
      .locator('#input-template-description')
      .fill('Format baku permintaan pengadaan barang divisi operasional')
    await fileInput.setInputFiles(path.join(FIXTURES_DIR, 'template-spb.docx'))

    // Pastikan info file terpilih muncul
    await expect(uploadModal).toContainText('template-spb.docx')
    await expect(uploadModal).toContainText('DOCX')

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'step-04-form-upload-filled.png'),
    })

    await submitUploadBtn.click()

    // Verifikasi SweetAlert2 Success
    const swalModal = page.locator('.swal2-modal')
    await expect(swalModal).toBeVisible({ timeout: 10000 })
    await expect(swalModal).toContainText('Template Berhasil Disimpan')
    await page.locator('.swal2-confirm').click()

    // 6. Verifikasi Tampil di Tab Kategori yang Tepat
    // Template SPB harus ada di 'Semua Kategori'
    await expect(page.getByRole('heading', { name: templateSpbName })).toBeVisible()

    // Klik Tab 'Surat Permintaan Barang' -> harus terlihat
    await page.getByRole('button', { name: /Surat Permintaan Barang/i }).first().click()
    await expect(page.getByRole('heading', { name: templateSpbName })).toBeVisible()

    // Klik Tab 'Surat Pesanan' -> template SPB TIDAK boleh muncul
    await page.getByRole('button', { name: /Surat Pesanan/i }).first().click()
    await expect(page.getByRole('heading', { name: templateSpbName })).not.toBeVisible()

    // Klik Tab 'Surat Penawaran' -> template SPB TIDAK boleh muncul
    await page.getByRole('button', { name: /Surat Penawaran/i }).first().click()
    await expect(page.getByRole('heading', { name: templateSpbName })).not.toBeVisible()

    // 7. Unggah Template Kedua: Surat Penawaran (PDF)
    await btnTambahTemplate.click()
    await expect(uploadModal).toBeVisible()
    await page.locator('#input-template-name').fill(templateQuoteName)
    await page.locator('#select-letter-type').selectOption('SURAT_PENAWARAN')
    await page
      .locator('#input-template-description')
      .fill('Template acuan surat penawaran harga kerjasama')
    await fileInput.setInputFiles(path.join(FIXTURES_DIR, 'template-penawaran.pdf'))
    await submitUploadBtn.click()
    await expect(swalModal).toBeVisible({ timeout: 10000 })
    await page.locator('.swal2-confirm').click()

    // Verifikasi Template Penawaran muncul di tab Surat Penawaran
    await page.getByRole('button', { name: /Surat Penawaran/i }).first().click()
    await expect(page.getByRole('heading', { name: templateQuoteName })).toBeVisible()

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'step-05-templates-categorized.png'),
      fullPage: true,
    })

    // 8. Uji Persistensi: Reload halaman & verifikasi template tetap ada
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Daftar Surat' })).toBeVisible()
    await expect(page.getByRole('heading', { name: templateSpbName })).toBeVisible()
    await expect(page.getByRole('heading', { name: templateQuoteName })).toBeVisible()

    // 9. Uji Tombol "Buat Surat dari Template" (Modal Katalog)
    await btnBuatSurat.click()
    const catalogModal = page.locator('div[role="dialog"]', {
      has: page.getByRole('heading', { name: 'Pilih Template Surat' }),
    })
    await expect(catalogModal).toBeVisible()
    // Verifikasi template kustom muncul di katalog
    await expect(catalogModal.getByRole('heading', { name: templateSpbName })).toBeVisible()
    await expect(catalogModal.getByRole('heading', { name: templateQuoteName })).toBeVisible()

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'step-06-template-catalog-with-custom.png'),
    })

    // Tutup modal katalog
    await catalogModal.getByLabel('Tutup modal pemilihan template').click()
    await expect(catalogModal).not.toBeVisible()

    // 10. Uji "Gunakan Template" pada Template Kustom SPB
    const cardSpb = page.locator('.group', { has: page.getByRole('heading', { name: templateSpbName }) })
    await expect(cardSpb).toBeVisible()
    await cardSpb.getByRole('button', { name: /Gunakan/i }).click()

    // Form Surat Permintaan Barang terbuka dengan banner template aktif
    await expect(page).toHaveURL(/surat-permintaan-barang.*templateId=/)
    await expect(page.getByRole('heading', { name: 'Surat Permintaan Barang' })).toBeVisible()
    await expect(page.getByText('Template Kustom Aktif')).toBeVisible()
    await expect(page.getByText(templateSpbName)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Unduh Template Asli' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Unduh Terisi (.DOCX)' })).toBeVisible()

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'step-07-form-with-active-template-banner.png'),
      fullPage: true,
    })

    // 11. Isi Form & Uji Unduh DOCX Terisi Dinamis
    const spbNomor = `SPB-TPL-${nonce}`
    await page.locator('input[name="nomor_surat"]').fill(spbNomor)
    await page.locator('input[name="tujuan_nama"]').fill('PT Mitra Maju Makmur')
    await page.locator('input[name="tujuan_perusahaan"]').fill('PT Mitra Maju Makmur')
    await page.locator('input[name="perihal"]').fill('Permintaan Laptop Operasional')
    await page.locator('input[name="pemohon_nama"]').fill('Budi Santoso')

    // Unduh Terisi (.DOCX)
    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Unduh Terisi (.DOCX)' }).click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toContain('.docx')

    // Tutup dialog sukses unduh docx
    await expect(swalModal).toBeVisible({ timeout: 10000 })
    await expect(swalModal).toContainText('Dokumen Word Terisi Berhasil Diunduh')
    await page.locator('.swal2-confirm').click()

    // 12. Simpan Dokumen dengan Template Kustom
    await page.locator('#btn-save-document').click()
    await expect(swalModal).toBeVisible({ timeout: 10000 })
    await expect(swalModal).toContainText('Surat berhasil disimpan')
    await page.locator('.swal2-confirm').click()

    // 13. Kembali ke Daftar Surat & Hapus Template Kustom
    await page.goto('/surat')
    await expect(page.getByRole('heading', { name: 'Daftar Surat' })).toBeVisible()

    // Verifikasi surat tersimpan muncul di tabel dokumen
    await expect(page.getByText(spbNomor)).toBeVisible()

    // Uji Hapus Template Kustom Quote
    const cardQuote = page.locator('.group', { has: page.getByRole('heading', { name: templateQuoteName }) })
    await expect(cardQuote).toBeVisible()
    await cardQuote.locator('button[title="Hapus template kustom"]').click()

    // Konfirmasi dialog SweetAlert2
    await expect(swalModal).toBeVisible()
    await expect(swalModal).toContainText('Hapus Template?')
    await page.locator('.swal2-confirm').click()

    // Verifikasi alert sukses hapus
    await expect(swalModal).toContainText('Template berhasil dihapus')
    await page.locator('.swal2-confirm').click()

    // Template quote hilang dari daftar
    await expect(page.getByRole('heading', { name: templateQuoteName })).not.toBeVisible()

    // 14. Uji Responsif Mobile (390x844)
    await page.setViewportSize({ width: 390, height: 844 })
    await page.waitForTimeout(500)
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'step-08-mobile-surat-with-custom-templates.png'),
      fullPage: true,
    })

    // Buka Modal Upload pada Mobile
    await page.locator('#btn-tambah-template').click()
    await expect(uploadModal).toBeVisible()
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'step-09-mobile-upload-template-modal.png'),
    })
    await uploadModal.getByLabel('Tutup modal unggah template').click()
    await expect(uploadModal).not.toBeVisible()

    expect(errors).toEqual([])
  })
})
