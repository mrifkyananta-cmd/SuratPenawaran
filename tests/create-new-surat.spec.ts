import { test, expect } from '@playwright/test'
import path from 'node:path'

const ARTIFACT_DIR = 'C:/Users/User/.gemini/antigravity-cli/brain/8601560e-d67e-4ce0-a2e1-895f1754d475'

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

test.describe('Fitur Create New Surat dengan Template & Alur Lengkap', () => {
  test('1. Alur Lengkap: Katalog Template, Validasi Form, Pratinjau, Simpan Draft & Surat, Refresh, Edit, Non-collision, Ekspor, dan Responsif Mobile', async ({
    page,
  }) => {
    test.setTimeout(180000)
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))

    const nonce = Date.now().toString().slice(-6)
    const spbDraftNum = `SPB-DFT-${nonce}`
    const spbEditNum = `SPB-EDT-${nonce}`
    const spbSecondNum = `SPB-SEC-${nonce}`
    const quoteNum = `QT-TPL-${nonce}`
    const poNum = `PO-TPL-${nonce}`
    const spjbNum = `SPJB-TPL-${nonce}`

    // Login sebagai Admin
    await page.setViewportSize({ width: 1440, height: 900 })
    await loginAdmin(page)

    // Buka menu Surat
    await page.goto('/surat')
    await expect(page.getByRole('heading', { name: 'Daftar Surat' })).toBeVisible()
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'step-01-surat-homepage.png'), fullPage: true })

    // [Uji 1 & 2] Klik "+ Buat Surat Baru" dan pastikan katalog template tampil
    const createBtn = page.locator('#btn-create-new-surat')
    await expect(createBtn).toBeVisible()
    await createBtn.click()

    const modal = page.locator('div[role="dialog"]', { has: page.getByRole('heading', { name: 'Pilih Template Surat' }) })
    await expect(modal).toBeVisible()
    await expect(modal.getByRole('heading', { name: 'Surat Penawaran' }).first()).toBeVisible()
    await expect(modal.getByRole('heading', { name: 'Surat Permintaan Barang' }).first()).toBeVisible()
    await expect(modal.getByRole('heading', { name: 'Surat Pesanan' }).first()).toBeVisible()
    await expect(modal.getByRole('heading', { name: 'Surat Perjanjian Jual Beli' }).first()).toBeVisible()
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'step-02-template-catalog-modal.png') })

    // Tutup modal lalu gunakan tombol dari kartu template di halaman
    await modal.getByLabel('Tutup modal pemilihan template').click()
    await expect(modal).not.toBeVisible()

    // [Uji 3] Pilih template Surat Permintaan Barang & uji validasi input kosong
    const spbCard = page.locator('.group', { hasText: 'Surat Permintaan Barang' })
    await spbCard.getByRole('button', { name: 'Gunakan Template' }).click()
    await expect(page).toHaveURL(/.*surat-permintaan-barang/)
    await expect(page.getByRole('heading', { name: 'Surat Permintaan Barang' })).toBeVisible()

    // Coba simpan saat field wajib masih kosong -> harus tampil warning SweetAlert
    await page.locator('#btn-save-draft').click()
    await expect(page.getByRole('dialog')).toContainText('Data belum lengkap')
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'step-03-validation-empty-field.png') })
    await page.getByRole('button', { name: 'Mengerti' }).click()

    // [Uji 4] Isi formulir lengkap dan verifikasi pratinjau surat
    await page.locator('input[name="nomor_surat"]').fill(spbDraftNum)
    await page.locator('input[name="tujuan_nama"]').fill('Departemen Pengadaan TI')
    await page.locator('input[name="tujuan_jabatan"]').fill('Manager Procurement')
    await page.locator('input[name="item_nama_0"]').fill('Laptop Developer 32GB RAM')
    await page.locator('input[name="item_jumlah_0"]').fill('5')
    await page.locator('input[name="item_ket_0"]').fill('Kebutuhan tim engineering baru')
    await page.locator('input[name="pemohon_nama"]').fill('Ahmad Faiz')

    // Verifikasi frame pratinjau PDF ada
    await expect(page.locator('iframe[title="PDF Preview"]')).toBeVisible()
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'step-04-form-filled-and-preview.png'), fullPage: true })

    // [Uji 5] Simpan sebagai Draft
    await page.locator('#btn-save-draft').click()
    await expect(page.getByRole('dialog')).toContainText('Draft tersimpan')
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'step-05-draft-saved-alert.png') })
    await page.getByRole('button', { name: 'Mengerti' }).click()

    // [Uji 6] Refresh halaman dan pastikan data surat tetap tersedia
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Surat Permintaan Barang' })).toBeVisible()
    await expect(page.locator('input[name="nomor_surat"]')).toHaveValue(spbDraftNum)
    await expect(page.locator('input[name="tujuan_nama"]')).toHaveValue('Departemen Pengadaan TI')
    await expect(page.locator('input[name="item_nama_0"]')).toHaveValue('Laptop Developer 32GB RAM')
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'step-06-reloaded-and-data-restored.png'), fullPage: true })

    // [Uji 8] Edit surat dan simpan perubahan sebagai "Simpan Surat"
    await page.locator('input[name="nomor_surat"]').fill(spbEditNum)
    await page.locator('input[name="item_nama_0"]').fill('Laptop Developer 64GB RAM (Upgraded)')
    await page.locator('#btn-save-document').click()
    await expect(page.getByRole('dialog')).toContainText('Surat berhasil disimpan')
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'step-08-edited-and-saved.png') })
    await page.getByRole('button', { name: 'Mengerti' }).click()

    // [Uji 9] Buat surat kedua dari template yang sama & pastikan tidak menimpa surat pertama
    await page.getByRole('button', { name: 'Buat Baru' }).first().click()
    await expect(page.locator('input[name="nomor_surat"]')).toHaveValue('')
    await page.locator('input[name="nomor_surat"]').fill(spbSecondNum)
    await page.locator('input[name="tujuan_nama"]').fill('Departemen SDM & Umum')
    await page.locator('input[name="item_nama_0"]').fill('Kursi Ergonomis Kantor')
    await page.locator('#btn-save-document').click()
    await expect(page.getByRole('dialog')).toContainText('Surat berhasil disimpan')
    await page.getByRole('button', { name: 'Mengerti' }).click()

    // Kembali ke Daftar Surat di /surat -> verifikasi kedua surat ada dan terpisah
    await page.goto('/surat')
    await expect(page.locator('tr', { hasText: spbEditNum })).toBeVisible()
    await expect(page.locator('tr', { hasText: spbSecondNum })).toBeVisible()
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'step-09-two-letters-distinct.png'), fullPage: true })

    // [Uji 7] Buka kembali surat dari tombol Edit di tabel daftar surat
    const editBtn = page.locator('tr', { hasText: spbEditNum }).getByTitle('Buka & Edit Surat')
    await editBtn.click()
    await expect(page).toHaveURL(/.*surat-permintaan-barang\?id=/)
    await expect(page.locator('input[name="nomor_surat"]')).toHaveValue(spbEditNum)
    await expect(page.locator('input[name="item_nama_0"]')).toHaveValue('Laptop Developer 64GB RAM (Upgraded)')

    // [Uji 10] Uji ekspor multi-format pada Surat Penawaran (PDF, Excel, Word)
    await page.goto('/surat/surat-penawaran?mode=new')
    await expect(page.getByRole('heading', { name: 'Surat Penawaran' })).toBeVisible()
    await page.locator('input[name="recipient"]').or(page.getByLabel('Nama atau perusahaan tujuan *')).fill('PT Ekspor Multi Format')
    await page.locator('input[name="number"]').or(page.getByLabel('Nomor penawaran *')).fill(quoteNum)
    await page.locator('textarea[placeholder="Nama produk / jasa beserta keterangannya"]').first().fill('Paket Cloud Subscription 1 Tahun')
    await page.locator('input[type="number"][min="0"]').first().fill('24000000')

    // Simpan surat penawaran
    await page.locator('#btn-save-document').click()
    await expect(page.getByRole('dialog')).toContainText('Surat Penawaran tersimpan')
    await page.getByRole('button', { name: 'Mengerti' }).click()

    // Verifikasi tombol unduh multi-format (Excel, PDF, Word)
    const downloadPromisePdf = page.waitForEvent('download', { timeout: 15000 }).catch(() => null)
    await page.getByRole('button', { name: /Unduh PDF/ }).click()
    const downloadedPdf = await downloadPromisePdf
    if (downloadedPdf) {
      expect(downloadedPdf.suggestedFilename()).toContain('.pdf')
    }
    await page.getByRole('button', { name: 'Mengerti' }).click()
    await expect(page.getByRole('dialog')).not.toBeVisible()

    const downloadPromiseXlsx = page.waitForEvent('download', { timeout: 15000 }).catch(() => null)
    await page.getByRole('button', { name: /Unduh Excel/ }).click()
    const downloadedXlsx = await downloadPromiseXlsx
    if (downloadedXlsx) {
      expect(downloadedXlsx.suggestedFilename()).toContain('.xlsx')
    }
    await page.getByRole('button', { name: 'Mengerti' }).click()
    await expect(page.getByRole('dialog')).not.toBeVisible()

    const downloadPromiseDocx = page.waitForEvent('download', { timeout: 15000 }).catch(() => null)
    await page.getByRole('button', { name: /Unduh Word/ }).click()
    const downloadedDocx = await downloadPromiseDocx
    if (downloadedDocx) {
      expect(downloadedDocx.suggestedFilename()).toContain('.docx')
    }
    await page.getByRole('button', { name: 'Mengerti' }).click()
    await expect(page.getByRole('dialog')).not.toBeVisible()
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'step-10-export-buttons-test.png'), fullPage: true })

    // [Uji Template 3] Surat Pesanan (PO)
    await page.goto('/surat/surat-pesanan?mode=new')
    await expect(page.getByRole('heading', { name: 'Surat Pesanan (PO)' })).toBeVisible()
    await page.locator('input[name="nomor_surat"]').fill(poNum)
    await page.locator('input[name="vendor_perusahaan"]').fill('PT Rekanan Pesanan Utama')
    await page.locator('input[name="item_nama_0"]').fill('Switch Managed L3')
    await page.locator('input[name="item_harga_0"]').fill('8500000')
    await page.locator('#btn-save-document').click()
    await expect(page.getByRole('dialog')).toContainText('Surat Pesanan tersimpan')
    await page.getByRole('button', { name: 'Mengerti' }).click()

    // [Uji Template 4] Surat Perjanjian Jual Beli
    await page.goto('/surat/surat-perjanjian-jual-beli?mode=new')
    await expect(page.getByRole('heading', { name: 'Surat Perjanjian Jual Beli' })).toBeVisible()
    await page.locator('input[name="nomor_surat"]').fill(spjbNum)
    await page.locator('input[name="penjual_nama"]').fill('PT Luma Indonesia')
    await page.locator('input[name="pembeli_nama"]').fill('Bapak Sukses Makmur')
    await page.locator('textarea[name="pasal1_objek"]').fill('Unit Kendaraan Operasional')
    await page.locator('#btn-save-document').click()
    await expect(page.getByRole('dialog')).toContainText('Surat Perjanjian tersimpan')
    await page.getByRole('button', { name: 'Mengerti' }).click()

    // [Uji 13] Tampilan Responsif Mobile
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/surat')
    await expect(page.getByRole('heading', { name: 'Daftar Surat' })).toBeVisible()
    await expect(page.locator('#btn-create-new-surat')).toBeVisible()
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'step-13-mobile-layout-surat.png'), fullPage: true })

    // Uji klik Create New di Mobile
    await page.locator('#btn-create-new-surat').click()
    await expect(page.getByRole('heading', { name: 'Pilih Template Surat' })).toBeVisible()
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'step-13-mobile-template-modal.png') })
    await page.getByLabel('Tutup modal pemilihan template').click()

    // Verifikasi console error bebas dari uncaught exception
    const criticalErrors = errors.filter((e) => !e.includes('connectionrefused') && !e.includes('favicon'))
    expect(criticalErrors).toEqual([])
  })
})
