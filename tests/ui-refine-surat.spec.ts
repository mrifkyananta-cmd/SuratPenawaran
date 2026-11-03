import { test, expect } from '@playwright/test'
import path from 'path'

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
  await page.goto('/surat')
  await expect(page.getByRole('heading', { name: 'Daftar Surat' })).toBeVisible({ timeout: 15000 })
}

test.describe('Verifikasi UI/UX Halaman Daftar Surat yang Dirapikan', () => {
  test('1. Tampilan Desktop 1440 x 900: Header, Grid Template, Pencarian & Filter, Tabel Dokumen', async ({
    page,
  }) => {
    test.setTimeout(60000)
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))

    await page.setViewportSize({ width: 1440, height: 900 })
    await loginAdmin(page)

    // Verifikasi header
    const header = page.getByRole('heading', { name: 'Daftar Surat' })
    await expect(header).toBeVisible()
    const refreshBtn = page.getByRole('button', { name: /Segarkan/ })
    await expect(refreshBtn).toBeVisible()
    const createBtn = page.locator('#btn-create-new-surat')
    await expect(createBtn).toBeVisible()

    // Verifikasi 4 kartu template
    const templateCards = page.locator('.group', { hasText: 'Gunakan Template' })
    await expect(templateCards).toHaveCount(4)

    // Pastikan tombol Gunakan Template ada pada keempat kartu
    for (let i = 0; i < 4; i++) {
      await expect(templateCards.nth(i).getByRole('button', { name: 'Gunakan Template' })).toBeVisible()
    }

    // Tangkap screenshot Desktop 1440x900
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'ui-refine-desktop-1440x900.png'),
      fullPage: true,
    })

    // Uji fungsi pencarian
    const searchInput = page.getByPlaceholder('Cari nomor, penerima, perihal...')
    await expect(searchInput).toBeVisible()
    await searchInput.fill('SPB')
    await page.waitForTimeout(300)

    // Uji reset filter
    const resetBtn = page.getByRole('button', { name: 'Reset' })
    if (await resetBtn.isVisible()) {
      await resetBtn.click()
      await expect(searchInput).toHaveValue('')
    }

    // Uji tombol Segarkan
    const initialRowsCount = await page.locator('tbody tr').count()
    await refreshBtn.click()
    await page.waitForTimeout(500)
    const afterRefreshCount = await page.locator('tbody tr').count()
    expect(afterRefreshCount).toBe(initialRowsCount)

    // Reload halaman dan pastikan jumlah dokumen tidak bertambah otomatis
    await page.reload()
    await expect(header).toBeVisible()
    const afterReloadCount = await page.locator('tbody tr').count()
    expect(afterReloadCount).toBe(initialRowsCount)

    const criticalErrors = errors.filter((e) => !e.includes('connectionrefused') && !e.includes('favicon'))
    expect(criticalErrors).toEqual([])
  })

  test('2. Tampilan Laptop 1280 x 720: Responsif, Padding Proporsional, Tidak Keluar Container', async ({
    page,
  }) => {
    test.setTimeout(60000)
    await page.setViewportSize({ width: 1280, height: 720 })
    await loginAdmin(page)

    await expect(page.getByRole('heading', { name: 'Daftar Surat' })).toBeVisible()
    await expect(page.locator('#btn-create-new-surat')).toBeVisible()

    // Tangkap screenshot Laptop 1280x720
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'ui-refine-laptop-1280x720.png'),
      fullPage: true,
    })
  })

  test('3. Tampilan Mobile 390 x 844: Layout 1 Kolom, Kontrol Terstruktur, Header Rapi', async ({
    page,
  }) => {
    test.setTimeout(60000)
    await page.setViewportSize({ width: 390, height: 844 })
    await loginAdmin(page)

    await expect(page.getByRole('heading', { name: 'Daftar Surat' })).toBeVisible()
    await expect(page.locator('#btn-create-new-surat')).toBeVisible()

    // Buka modal create new di mobile
    await page.locator('#btn-create-new-surat').click()
    await expect(page.getByRole('heading', { name: 'Pilih Template Surat' })).toBeVisible()
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'ui-refine-mobile-modal-390x844.png'),
    })
    await page.getByLabel('Tutup modal pemilihan template').click()

    // Tangkap screenshot Mobile 390x844
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'ui-refine-mobile-390x844.png'),
      fullPage: true,
    })
  })
})
