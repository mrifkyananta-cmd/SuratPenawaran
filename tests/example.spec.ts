import { test, expect } from '@playwright/test'
import path from 'node:path'

const ARTIFACT_DIR = 'C:/Users/User/.gemini/antigravity-cli/brain/3814658f-0ce4-4ee4-81cd-df59ae1bdb5d'

test.describe('Verifikasi Perbaikan QA & Keamanan Luma (End-to-End)', () => {
  test('1. Autentikasi Login, Dashboard Operasional, Quotation Follow Up & Pajak, Sinkronisasi Surat Penawaran, Surat Sub-Pages & PO Sync, Alur Invoice-Pembayaran, serta RBAC', async ({ page, request }) => {
    test.setTimeout(90000)
    const stamp = Date.now().toString().slice(-6)
    const quoteNumber = `QT-E2E-${stamp}`
    const poFromSuratNumber = `PO-SP-${stamp}`
    const spbNumber = `SPB-${stamp}`
    const spjbNumber = `SPJB-${stamp}`
    const invNumber = `INV-E2E-${stamp}`

    // 1. Pastikan API tanpa autentikasi ditolak dengan 401
    const unauthApi = await request.get('http://localhost:3001/api/quotations')
    expect(unauthApi.status()).toBe(401)

    // 2. Buka halaman utama -> tampil form Login
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Masuk ke Luma' })).toBeVisible()
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'fix-01-login-page.png'), fullPage: true })

    // Login dengan akun ADMIN
    await page.getByLabel('Username').fill('admin')
    await page.getByLabel('Password').fill('AdminLuma#2026')
    await page.getByRole('button', { name: 'Masuk' }).click()
    await expect(page.getByRole('dialog')).toContainText('Berhasil masuk')
    await page.getByRole('button', { name: 'Mengerti' }).click()

    // 3. Verifikasi Dashboard menampilkan metrik operasional real-time
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
    await expect(page.getByText('Total Quotation')).toBeVisible()
    await expect(page.getByText('PO Aktif')).toBeVisible()
    await expect(page.getByText('Status Invoice')).toBeVisible()
    await expect(page.getByText('Menunggu Verifikasi Bayar')).toBeVisible()
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'fix-02-dashboard-metrics.png'), fullPage: true })

    // 4. Buka halaman Quotation dan buat Quotation baru lengkap dengan Follow Up, Pajak Item, dan Penandatangan
    await page.goto('/quotation')
    await expect(page.locator('p', { hasText: 'Quotation' }).first()).toBeVisible()
    await page.getByRole('button', { name: 'Create New' }).click()

    const dialog = page.locator('.fixed.inset-0').first()
    await dialog.locator('input').first().fill(quoteNumber)
    await dialog.getByLabel('Nama Penerima / Customer').fill('PT Nusantara Verifikasi')
    await dialog.getByLabel('Status Tindak Lanjut').selectOption('Terjadwal')
    await dialog.getByLabel('Tanggal Tindak Lanjut').fill('2026-10-25')
    await dialog.getByLabel('Catatan Tindak Lanjut').fill('Follow up presentasi teknis minggu depan')
    await dialog.getByLabel('Nama Penandatangan').fill('Rendra Pratama')
    await dialog.getByLabel('Jabatan Penandatangan').fill('Direktur Komersial')
    await dialog.getByPlaceholder('Nama barang/jasa').fill('Server Rack Enterprise')
    await dialog.getByLabel('Jumlah item 1').fill('2')
    await dialog.getByLabel('Harga satuan item 1').fill('10000000')
    await dialog.getByLabel('Pajak item 1').fill('11')

    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'fix-03-quotation-complete-form.png'), fullPage: true })
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByRole('dialog')).toContainText('Quotation berhasil dibuat')
    await page.getByRole('button', { name: 'Mengerti' }).click()

    // Pastikan tampil di tabel dengan jadwal follow up
    await expect(page.getByRole('button', { name: quoteNumber, exact: true })).toBeVisible()
    await expect(page.locator('tr', { hasText: quoteNumber })).toContainText('Terjadwal')

    // 5. Buka Surat Penawaran dari Quotation & uji tombol "Simpan ke Quotation"
    const row = page.locator('tr', { hasText: quoteNumber })
    await row.getByRole('button', { name: `Buat Surat Penawaran ${quoteNumber}` }).click()
    await expect(page.getByRole('heading', { name: 'Surat Penawaran' })).toBeVisible()
    await expect(page.getByLabel('Nama penandatangan')).toHaveValue('Rendra Pratama')
    await page.getByLabel('Kota dan kode pos').fill('Jakarta Selatan 12190')
    await page.getByRole('button', { name: 'Simpan ke Quotation' }).click()
    await expect(page.getByRole('dialog')).toContainText('Quotation berhasil diperbarui')
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'fix-04-surat-penawaran-sync.png'), fullPage: true })
    await page.getByRole('button', { name: 'Mengerti' }).click()

    // 6. Verifikasi halaman /surat tidak lagi menampilkan daftar ganda dan sub-halaman bersih dari data dummy
    await page.goto('/surat')
    await expect(page.getByRole('heading', { name: 'Daftar Surat' })).toBeVisible()
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'fix-05-daftar-surat-clean.png'), fullPage: true })

    // 6a. Surat Permintaan Barang
    await page.goto('/surat/surat-permintaan-barang')
    await expect(page.getByRole('heading', { name: 'Surat Permintaan Barang' })).toBeVisible()
    await expect(page.locator('input[name="header1"]')).toHaveValue('PT Luma')
    await page.locator('input[name="nomor_surat"]').fill(spbNumber)
    await page.locator('input[name="tujuan_nama"]').fill('Kepala Logistik')
    await page.locator('input[name="item_nama_0"]').fill('Router Mikrotik CCR')
    await page.getByRole('button', { name: /Simpan (Dokumen|Surat)/ }).click()
    await expect(page.getByRole('dialog')).toContainText('Dokumen tersimpan')
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'fix-06-surat-permintaan-barang-saved.png'), fullPage: true })
    await page.getByRole('button', { name: 'Mengerti' }).click()

    // 6b. Surat Pesanan (PO) + Sinkronisasi ke modul /po
    await page.goto('/surat/surat-pesanan')
    await expect(page.getByRole('heading', { name: 'Surat Pesanan (PO)' })).toBeVisible()
    await expect(page.locator('input[name="header1"]')).toHaveValue('PT Luma')
    await page.locator('input[name="nomor_surat"]').fill(poFromSuratNumber)
    await page.locator('input[name="vendor_perusahaan"]').fill('PT Mitra Jaringan Nusantara')
    await page.locator('input[name="item_nama_0"]').fill('Firewall Appliance')
    await page.locator('input[name="item_jumlah_0"]').fill('1')
    await page.locator('input[name="item_harga_0"]').fill('15000000')
    await page.getByRole('button', { name: /Simpan (Dokumen|Surat)/ }).click()
    await expect(page.getByRole('dialog')).toContainText('disinkronkan ke daftar Purchase Order (/po)')
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'fix-07-surat-pesanan-po-sync.png'), fullPage: true })
    await page.getByRole('button', { name: 'Mengerti' }).click()

    // 6c. Surat Perjanjian Jual Beli
    await page.goto('/surat/surat-perjanjian-jual-beli')
    await expect(page.getByRole('heading', { name: 'Surat Perjanjian Jual Beli' })).toBeVisible()
    await expect(page.locator('input[name="penjual_nama"]')).toHaveValue('')
    await page.locator('input[name="nomor_surat"]').fill(spjbNumber)
    await page.locator('input[name="penjual_nama"]').fill('PT Luma')
    await page.locator('input[name="pembeli_nama"]').fill('PT Nusantara Verifikasi')
    await page.locator('textarea[name="pasal1_objek"]').fill('1 Paket Infrastruktur Server Rack Enterprise')
    await page.getByRole('button', { name: /Simpan (Dokumen|Surat)/ }).click()
    await expect(page.getByRole('dialog')).toContainText('Dokumen tersimpan')
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'fix-08-spjb-saved.png'), fullPage: true })
    await page.getByRole('button', { name: 'Mengerti' }).click()

    // 7. Buka halaman /po -> pastikan PO dari Surat Pesanan muncul, lalu klik Detail -> Buat Invoice (modal langsung terbuka otomatis!)
    await page.goto('/po')
    await expect(page.getByRole('heading', { name: 'Purchase Order' })).toBeVisible()
    await expect(page.locator('tr', { hasText: poFromSuratNumber })).toBeVisible()
    await page.locator('tr', { hasText: poFromSuratNumber }).getByRole('button', { name: 'Detail' }).click()
    await page.getByRole('button', { name: 'Buat Invoice' }).click()

    // Pastikan modal "Buat Invoice" terbuka otomatis dengan PO terpilih
    await expect(page.getByRole('heading', { name: 'Buat Invoice' })).toBeVisible()
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'fix-09-invoice-auto-modal-from-po.png'), fullPage: true })

    const invForm = page.locator('form')
    await invForm.locator('input').first().fill(invNumber)
    await invForm.getByLabel('Barang / Jasa').first().fill('Firewall Appliance')
    await invForm.getByLabel('Harga Satuan').first().fill('15000000')
    await invForm.getByRole('button', { name: 'Simpan Draft' }).click()
    await expect(page.getByRole('dialog')).toContainText('Draft invoice berhasil dibuat')
    await page.getByRole('button', { name: 'Mengerti' }).click()

    // Terbitkan Invoice
    await page.getByRole('button', { name: 'Terbitkan' }).click()
    await page.getByRole('button', { name: 'Ya, terbitkan' }).click()
    await expect(page.getByRole('dialog')).toContainText('Invoice berhasil diterbitkan')
    await page.getByRole('button', { name: 'Mengerti' }).click()

    // Catat Pembayaran dari Detail Invoice
    await page.getByRole('button', { name: 'Catat Pembayaran' }).click()
    await expect(page.getByRole('heading', { name: 'Catat Pembayaran' })).toBeVisible()
    await page.getByRole('button', { name: 'Simpan Pending' }).click()
    await expect(page.getByRole('dialog')).toContainText('Pembayaran Pending berhasil dicatat')
    await page.getByRole('button', { name: 'Mengerti' }).click()

    // 8. Uji RBAC: Keluar dari ADMIN, masuk sebagai STAFF, pastikan STAFF ditolak saat mencoba verifikasi pembayaran
    await page.getByRole('button', { name: 'Keluar' }).click()
    await page.getByRole('button', { name: 'Ya, keluar' }).click()
    await expect(page.getByRole('dialog')).toContainText('Berhasil keluar')
    await page.getByRole('button', { name: 'Mengerti' }).click()
    await expect(page.getByRole('heading', { name: 'Masuk ke Luma' })).toBeVisible()

    await page.getByLabel('Username').fill('staff')
    await page.getByLabel('Password').fill('StaffLuma#2026')
    await page.getByRole('button', { name: 'Masuk' }).click()
    await expect(page.getByRole('dialog')).toContainText('Berhasil masuk')
    await page.getByRole('button', { name: 'Mengerti' }).click()
    await expect(page.getByText('STAFF', { exact: true })).toBeVisible()

    await page.goto('/bukti-bayar')
    const payRow = page.locator('tr', { hasText: invNumber }).first()
    await payRow.getByRole('button', { name: 'Detail' }).click()
    await expect(page.getByRole('heading', { name: 'Detail Pembayaran' })).toBeVisible()
    await page.getByRole('button', { name: 'Verifikasi' }).click()
    await page.getByRole('button', { name: 'Ya, verifikasi' }).click()
    await page.getByPlaceholder('Masukkan kode verifikasi').fill('VERIF-2026-ADMIN')
    await page.locator('.app-swal-confirm').click()
    await expect(page.getByRole('dialog')).toContainText('Akses ditolak')
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'fix-10-staff-rbac-blocked.png'), fullPage: true })
    await page.getByRole('button', { name: 'Mengerti' }).click()
  })

  test('2. Halaman transaksi menampilkan keadaan kosong dan mode baca-saja saat koneksi backend gagal', async ({ page }) => {
    await page.route('**/api/**', (route) => route.abort('connectionrefused'))

    await page.goto('/quotation')
    await expect(page.getByRole('dialog')).toContainText('Backend tidak dapat dihubungi')
    await page.getByRole('button', { name: 'Mengerti' }).click()
    await expect(page.getByRole('status')).toContainText('baca-saja')
  })
})
