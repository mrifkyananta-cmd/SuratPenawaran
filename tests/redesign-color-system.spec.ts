import { test, expect, Page } from '@playwright/test'
import path from 'node:path'

const ARTIFACT_DIR = 'C:/Users/User/.gemini/antigravity-cli/brain/6395b781-6963-4a32-9ee4-a0c7b1dfbaa3'

// Hanya tiga warna solid yang diperbolehkan untuk tulisan (font) dan ikon
const BLUE = 'rgb(0, 0, 255)' // #0000FF
const GREEN = 'rgb(0, 128, 0)' // #008000
const BLACK = 'rgb(0, 0, 0)' // #000000
const TRANSPARENT = 'rgba(0, 0, 0, 0)'
const WHITE = 'rgb(255, 255, 255)'

const EXPECTED_CATEGORY_TEXT: Record<string, string> = {
  SURAT_PENAWARAN: BLUE,
  SURAT_PERMINTAAN_BARANG: GREEN,
  SURAT_PESANAN: BLACK,
  SURAT_PERJANJIAN_JUAL_BELI: BLUE,
}

const RED_DEEP = 'rgb(185, 28, 28)'

const EXPECTED_ACTION_TEXT = {
  preview: BLACK,
  edit: BLUE,
  download: GREEN,
  delete: WHITE,
}

async function loginAdmin(page: Page) {
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

/**
 * Mengumpulkan warna font/ikon UI yang berada di luar palet 3 warna.
 * Area dokumen surat (iframe PDF / kertas pratinjau dokumen) dikecualikan karena
 * merupakan isi dokumen hasil ekspor, bukan UI aplikasi.
 */
async function collectOffPaletteColors(page: Page) {
  return page.evaluate(() => {
    const allowed = new Set(['rgb(0, 0, 255)', 'rgb(0, 128, 0)', 'rgb(0, 0, 0)'])
    const offenders: string[] = []
    const els = Array.from(document.querySelectorAll<HTMLElement | SVGElement>('body *'))
    for (const el of els) {
      if (el.closest('iframe, [data-document-paper], .swal2-container, [aria-hidden="true"] svg')) continue
      // Allow white text on buttons with solid filled backgrounds (e.g. Create New #0000FF, Export Excel #15803D, Hapus/Batal #B91C1C, Swal confirm #0000FF)
      if (el.closest('button.bg-\\[\\#0000FF\\], button.bg-\\[\\#15803D\\], button.bg-\\[\\#B91C1C\\], .btn-action-delete, .app-swal-confirm, .app-swal-confirm-danger, .app-swal-cancel, #btn-create-new-quotation')) continue
      // Allow search inputs and search icons styled in faded black (#475569 / #64748B)
      if (el.matches('input[placeholder*="Cari"], input[placeholder*="cari"]') || el.closest('label:has(input[placeholder*="Cari"]), label:has(input[placeholder*="cari"]), div:has(input[placeholder*="Cari"]) > svg')) continue
      const rect = el.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) continue
      const style = getComputedStyle(el)
      if (style.visibility === 'hidden' || style.opacity === '0') continue
      const isSvg = el.tagName.toLowerCase() === 'svg'
      const hasOwnText = Array.from(el.childNodes).some(
        (n) => n.nodeType === Node.TEXT_NODE && (n.textContent || '').trim().length > 0,
      )
      if (!isSvg && !hasOwnText) continue
      const color = style.color
      if (!allowed.has(color)) {
        const label = (el.textContent || el.getAttribute('class') || '').trim().slice(0, 40)
        offenders.push(`${el.tagName.toLowerCase()} ${color} "${label}"`)
      }
    }
    return offenders
  })
}

async function assertPalette(page: Page, pageName: string) {
  const offenders = await collectOffPaletteColors(page)
  if (offenders.length) console.log(`[${pageName}] warna di luar palet:\n  ${offenders.slice(0, 25).join('\n  ')}`)
  expect.soft(offenders, `${pageName}: semua font & ikon harus #0000FF / #008000 / #000000`).toEqual([])
}

async function assertNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  )
  expect(overflow).toBe(false)
}

test.describe('Penyederhanaan Warna Font dan Ikon LETRIFKY (Biru, Hijau, Hitam)', () => {
  test('Kategori, tombol aksi, status, dan seluruh menu memakai 3 warna font/ikon tanpa badge berwarna', async ({
    page,
  }) => {
    test.setTimeout(240000)
    await page.setViewportSize({ width: 1440, height: 900 })
    await loginAdmin(page)

    // 0. Token warna terpusat di :root
    const rootTokens = await page.evaluate(() => {
      const style = getComputedStyle(document.documentElement)
      const get = (n: string) => style.getPropertyValue(n).trim().toLowerCase()
      return {
        blue: get('--color-font-blue'),
        green: get('--color-font-green'),
        black: get('--color-font-black'),
        offer: get('--color-document-offer-text'),
        request: get('--color-document-request-text'),
        order: get('--color-document-order-text'),
        agreement: get('--color-document-agreement-text'),
        preview: get('--color-action-preview-text'),
        edit: get('--color-action-edit-text'),
        download: get('--color-action-download-text'),
        delete: get('--color-action-delete-text'),
      }
    })
    expect(rootTokens).toEqual({
      blue: '#0000ff',
      green: '#008000',
      black: '#000000',
      offer: '#0000ff',
      request: '#008000',
      order: '#000000',
      agreement: '#0000ff',
      preview: '#000000',
      edit: '#0000ff',
      download: '#008000',
      delete: '#000000',
    })

    // 1. Home
    await page.waitForTimeout(500)
    for (const [code, color] of Object.entries(EXPECTED_CATEGORY_TEXT)) {
      const homeCat = page.locator(`[data-doc-category-badge="${code}"]`).first()
      await expect(homeCat).toBeVisible()
      await expect(homeCat).toHaveCSS('color', color)
      await expect(homeCat).toHaveCSS('background-color', TRANSPARENT)
    }
    await assertPalette(page, 'Home')
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'after3-01-home.png'), fullPage: true })

    // 2. Quotation
    await page.goto('/quotation')
    await expect(page.getByRole('heading', { name: 'Quotation', level: 1 })).toBeVisible()
    await page.waitForTimeout(600)

    // Verifikasi tombol Create New: kotak biru (#0000FF) dan font putih
    const createNewBtn = page.locator('#btn-create-new-quotation')
    await expect(createNewBtn).toBeVisible()
    await expect(createNewBtn).toHaveCSS('background-color', BLUE)
    await expect(createNewBtn).toHaveCSS('color', WHITE)

    // Verifikasi fitur search: warna font hitam agak pudar (#64748B)
    const quotationSearchInput = page.locator('input[placeholder*="Cari nomor dokumen"]')
    await expect(quotationSearchInput).toBeVisible()
    await expect(quotationSearchInput).toHaveCSS('color', 'rgb(100, 116, 139)')

    // Verifikasi tombol Export Excel: kotak hijau pekat solid (#15803D) tanpa gradient dan font putih
    const exportExcelBtn = page.getByRole('button', { name: /Export Excel/i })
    await expect(exportExcelBtn).toBeVisible()
    await expect(exportExcelBtn).toHaveCSS('background-color', 'rgb(21, 128, 61)') // #15803D
    await expect(exportExcelBtn).toHaveCSS('color', WHITE)

    // Verifikasi pill Semua Kategori: saat aktif memiliki kotak biru (#0000FF) dan font putih
    const allCategoryPill = page.locator('[data-quotation-category-pill="ALL"]')
    await expect(allCategoryPill).toBeVisible()
    await expect(allCategoryPill).toHaveCSS('background-color', BLUE)
    await expect(allCategoryPill).toHaveCSS('color', WHITE)

    // Verifikasi masing-masing filter kategori: saat diklik berubah menjadi kotak biru (#0000FF) dengan font putih
    for (const code of Object.keys(EXPECTED_CATEGORY_TEXT)) {
      const pill = page.locator(`[data-quotation-category-pill="${code}"]`)
      await expect(pill).toBeVisible()
      await pill.click()
      await expect(pill).toHaveCSS('background-color', BLUE)
      await expect(pill).toHaveCSS('color', WHITE)
    }
    await allCategoryPill.click()

    const tableRows = page.locator('tbody tr')
    const firstRowText = await tableRows.first().textContent()
    if (!firstRowText || firstRowText.includes('Tidak ada dokumen')) {
      await page.goto('/quotation/surat-permintaan-barang?mode=new')
      await page.locator('input[name="nomor_surat"]').fill('099/SPB/TEST/2026')
      await page.locator('input[name="tujuan_nama"]').fill('Divisi Operasional')
      await page.locator('#btn-save-draft').click()
      await expect(page.getByRole('dialog')).toBeVisible()
      await page.getByRole('button', { name: 'Mengerti' }).click()
      await page.goto('/quotation')
      await page.waitForTimeout(600)
    }

    // Badge kategori di tabel: hanya warna font, tanpa background
    const tableBadges = page.locator('tbody [data-doc-category-badge]')
    const badgeCount = await tableBadges.count()
    for (let i = 0; i < Math.min(badgeCount, 10); i++) {
      const badge = tableBadges.nth(i)
      const code = (await badge.getAttribute('data-doc-category-badge')) || 'SURAT_PENAWARAN'
      await expect(badge).toHaveCSS('color', EXPECTED_CATEGORY_TEXT[code] ?? BLUE)
      await expect(badge).toHaveCSS('background-color', TRANSPARENT)
    }

    // Fitur di row aksi tetap lengkap (Preview, Edit, Unduh, Detail, Hapus)
    const firstRow = page.locator('tbody tr').first()
    const previewBtn = firstRow.getByRole('button', { name: /^Pratinjau /i })
    const editBtn = firstRow.getByRole('button', { name: /^Edit /i })
    const downloadBtn = firstRow.getByRole('button', { name: /^Unduh /i })
    const deleteBtn = firstRow.getByRole('button', { name: /^Hapus /i })
    for (const btn of [previewBtn, editBtn, downloadBtn, deleteBtn]) await expect(btn).toBeVisible()

    await expect(previewBtn).toHaveCSS('color', EXPECTED_ACTION_TEXT.preview)
    await expect(editBtn).toHaveCSS('color', EXPECTED_ACTION_TEXT.edit)
    await expect(downloadBtn).toHaveCSS('color', EXPECTED_ACTION_TEXT.download)
    await expect(deleteBtn).toHaveCSS('color', EXPECTED_ACTION_TEXT.delete)
    await expect(deleteBtn.locator('svg')).toBeVisible()
    await expect(previewBtn.locator('svg')).toHaveCSS('color', EXPECTED_ACTION_TEXT.preview)
    await expect(editBtn.locator('svg')).toHaveCSS('color', EXPECTED_ACTION_TEXT.edit)
    await expect(downloadBtn.locator('svg')).toHaveCSS('color', EXPECTED_ACTION_TEXT.download)
    for (const btn of [previewBtn, editBtn, downloadBtn]) {
      await expect(btn).toHaveCSS('background-color', WHITE)
    }
    await expect(deleteBtn).toHaveCSS('background-color', RED_DEEP)

    // Tombol aksi tidak keluar dari kolom tabel
    const actionsFit = await firstRow.evaluate((row) => {
      const cells = Array.from(row.querySelectorAll('td'))
      return cells.every((td) => {
        const tdRect = td.getBoundingClientRect()
        return Array.from(td.querySelectorAll('button')).every((b) => {
          const r = b.getBoundingClientRect()
          return r.left >= tdRect.left - 1 && r.right <= tdRect.right + 1
        })
      })
    })
    expect(actionsFit).toBe(true)

    // Konfirmasi hapus tetap ada (SweetAlert2) dengan tombol merah pekat bertulisan putih
    await deleteBtn.click()
    const confirmDialog = page.getByRole('dialog')
    await expect(confirmDialog).toBeVisible()
    const confirmDeleteBtn = confirmDialog.getByRole('button', { name: /Ya, hapus/i })
    await expect(confirmDeleteBtn).toBeVisible()
    await expect(confirmDeleteBtn).toHaveCSS('color', WHITE)
    await expect(confirmDeleteBtn).toHaveCSS('background-color', RED_DEEP)
    const cancelConfirmBtn = confirmDialog.getByRole('button', { name: 'Batal' })
    await expect(cancelConfirmBtn).toBeVisible()
    await expect(cancelConfirmBtn).toHaveCSS('color', WHITE)
    await expect(cancelConfirmBtn).toHaveCSS('background-color', RED_DEEP)
    await cancelConfirmBtn.click()
    await expect(confirmDialog).toBeHidden()

    await assertPalette(page, 'Quotation')
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'after3-02-quotation.png'), fullPage: true })

    // 3. Katalog Template
    await page.locator('#btn-create-new-quotation').click()
    const templateModal = page.locator('#modal-pilih-template')
    await expect(templateModal).toBeVisible()
    await page.waitForTimeout(400)

    for (const [code, color] of Object.entries(EXPECTED_CATEGORY_TEXT)) {
      const badge = templateModal.locator(`[data-template-card] [data-doc-category-badge="${code}"]`).first()
      await expect(badge).toBeVisible()
      await expect(badge).toHaveCSS('color', color)
      await expect(badge).toHaveCSS('background-color', TRANSPARENT)
    }
    for (const code of Object.keys(EXPECTED_CATEGORY_TEXT)) {
      const tab = templateModal.locator(`[data-category-filter="${code}"]`)
      await tab.click()
      await expect(tab).toHaveCSS('color', WHITE)
      await expect(tab).toHaveCSS('background-color', BLUE)
    }
    await templateModal.locator('[data-category-filter="ALL"]').click()
    await page.waitForTimeout(300)
    const btnTambahTemplate = templateModal.locator('#btn-tambah-template')
    await expect(btnTambahTemplate).toHaveCSS('background-color', BLUE)
    await expect(btnTambahTemplate).toHaveCSS('color', WHITE)
    const btnGunakanTemplate = templateModal.locator('[id^="btn-use-template-"]').first()
    await expect(btnGunakanTemplate).toHaveCSS('background-color', BLUE)
    await expect(btnGunakanTemplate).toHaveCSS('color', WHITE)
    await assertPalette(page, 'Katalog Template')
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'after3-03-template-catalog-modal.png') })

    // 4. Upload Template
    await btnTambahTemplate.click()
    const uploadModal = page.locator('#modal-upload-template')
    await expect(uploadModal).toBeVisible()
    await page.waitForTimeout(300)
    const uploadBadge = uploadModal.locator('[data-doc-category-badge="SURAT_PENAWARAN"]')
    await expect(uploadBadge).toHaveCSS('color', BLUE)
    await expect(uploadBadge).toHaveCSS('background-color', TRANSPARENT)
    const btnSimpanTemplate = uploadModal.locator('#btn-submit-upload-template')
    await expect(btnSimpanTemplate).toHaveCSS('background-color', BLUE)
    await expect(btnSimpanTemplate).toHaveCSS('color', WHITE)
    const btnBatalUpload = uploadModal.getByRole('button', { name: 'Batal' })
    await expect(btnBatalUpload).toHaveCSS('background-color', RED_DEEP)
    await expect(btnBatalUpload).toHaveCSS('color', WHITE)
    await assertPalette(page, 'Upload Template')
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'after3-04-upload-template-modal.png') })
    await uploadModal.getByLabel('Tutup modal unggah template').click()
    await templateModal.getByLabel('Tutup modal pemilihan template').click()

    // 5-8. Formulir & preview tiap kategori surat
    const forms: Array<{ slug: string; heading: string; code: string; shot: string }> = [
      { slug: 'surat-penawaran', heading: 'Surat Penawaran', code: 'SURAT_PENAWARAN', shot: 'after3-05-form-surat-penawaran.png' },
      { slug: 'surat-permintaan-barang', heading: 'Surat Permintaan Barang', code: 'SURAT_PERMINTAAN_BARANG', shot: 'after3-06-form-surat-permintaan-barang.png' },
      { slug: 'surat-pesanan', heading: 'Surat Pesanan (PO)', code: 'SURAT_PESANAN', shot: 'after3-07-form-surat-pesanan.png' },
      { slug: 'surat-perjanjian-jual-beli', heading: 'Surat Perjanjian Jual Beli', code: 'SURAT_PERJANJIAN_JUAL_BELI', shot: 'after3-08-form-surat-perjanjian-jual-beli.png' },
    ]
    for (const f of forms) {
      await page.goto(`/quotation/${f.slug}`)
      await expect(page.getByRole('heading', { name: f.heading })).toBeVisible()
      await page.waitForTimeout(700)
      for (const sel of [`[data-doc-category-badge="${f.code}"]`, `[data-preview-doc-badge="${f.code}"]`]) {
        const el = page.locator(sel).first()
        await expect(el).toHaveCSS('color', EXPECTED_CATEGORY_TEXT[f.code])
        await expect(el).toHaveCSS('background-color', TRANSPARENT)
      }
      await assertPalette(page, f.heading)
      await assertNoHorizontalOverflow(page)
      await page.screenshot({ path: path.join(ARTIFACT_DIR, f.shot), fullPage: true })
    }

    // 9-11. PO, Invoice, Bukti Bayar
    const menus: Array<{ url: string; heading: string; btnName: RegExp; shot: string }> = [
      { url: '/po', heading: 'Purchase Order', btnName: /PO In \/ Quick In/i, shot: 'after3-09-po.png' },
      { url: '/invoice', heading: 'Invoice', btnName: /Buat Invoice/i, shot: 'after3-10-invoice.png' },
      { url: '/bukti-bayar', heading: 'Bukti Bayar', btnName: /Catat Pembayaran/i, shot: 'after3-11-bukti-bayar.png' },
    ]
    for (const m of menus) {
      await page.goto(m.url)
      await expect(page.getByRole('heading', { name: m.heading, level: 1 })).toBeVisible()
      await page.waitForTimeout(500)

      // Verifikasi tombol aksi utama pada menu: kotak biru (#0000FF) dan font putih
      const primaryBtn = page.getByRole('button', { name: m.btnName })
      await expect(primaryBtn).toBeVisible()
      await expect(primaryBtn).toHaveCSS('background-color', BLUE)
      await expect(primaryBtn).toHaveCSS('color', WHITE)

      if (m.url === '/invoice') {
        await primaryBtn.click()
        await page.waitForTimeout(300)
        const btnTambahItem = page.getByRole('button', { name: /Tambah Item/i })
        await expect(btnTambahItem).toHaveCSS('background-color', BLUE)
        await expect(btnTambahItem).toHaveCSS('color', WHITE)
        const btnSimpanDraft = page.getByRole('button', { name: /Simpan Draft/i })
        await expect(btnSimpanDraft).toHaveCSS('background-color', BLUE)
        await expect(btnSimpanDraft).toHaveCSS('color', WHITE)
        await page.getByRole('button', { name: 'Batal' }).click()
        await page.waitForTimeout(200)
      } else if (m.url === '/bukti-bayar') {
        await primaryBtn.click()
        await page.waitForTimeout(300)
        const btnSimpanPending = page.getByRole('button', { name: /Simpan Pending/i })
        await expect(btnSimpanPending).toHaveCSS('background-color', BLUE)
        await expect(btnSimpanPending).toHaveCSS('color', WHITE)
        await page.getByRole('button', { name: 'Batal' }).click()
        await page.waitForTimeout(200)

        // Detail Bukti Bayar
        const firstDetailBtn = page.getByRole('button', { name: /Detail/i }).first()
        if (await firstDetailBtn.isVisible().catch(() => false)) {
          await firstDetailBtn.click()
          await page.waitForTimeout(300)
          const tambahFileLabel = page.locator('label:has-text("Tambah file")')
          if (await tambahFileLabel.isVisible().catch(() => false)) {
            await expect(tambahFileLabel).toHaveCSS('background-color', BLUE)
            await expect(tambahFileLabel).toHaveCSS('color', WHITE)
          }
          const verifikasiBtn = page.getByRole('button', { name: /Verifikasi/i })
          if (await verifikasiBtn.isVisible().catch(() => false)) {
            await expect(verifikasiBtn).toHaveCSS('background-color', BLUE)
            await expect(verifikasiBtn).toHaveCSS('color', WHITE)

            // Test SweetAlert "Ya, verifikasi" button
            await verifikasiBtn.click()
            const swalConfirm = page.getByRole('dialog')
            await expect(swalConfirm).toBeVisible()
            const yaVerifBtn = swalConfirm.getByRole('button', { name: /Ya, verifikasi/i })
            await expect(yaVerifBtn).toBeVisible()
            await expect(yaVerifBtn).toHaveCSS('background-color', BLUE)
            await expect(yaVerifBtn).toHaveCSS('color', WHITE)

            // Advance to password input dialog
            await yaVerifBtn.click()
            const swalPassword = page.getByRole('dialog')
            await expect(swalPassword).toBeVisible()
            const verifCodeBtn = swalPassword.getByRole('button', { name: 'Verifikasi', exact: true })
            await expect(verifCodeBtn).toBeVisible()
            await expect(verifCodeBtn).toHaveCSS('background-color', BLUE)
            await expect(verifCodeBtn).toHaveCSS('color', WHITE)
            await swalPassword.getByRole('button', { name: 'Batal' }).click()
            await expect(swalPassword).toBeHidden()
          }
          await page.getByRole('button', { name: 'Tutup', exact: true }).click()
          await page.waitForTimeout(200)
        }
      }

      await assertPalette(page, m.heading)
      await assertNoHorizontalOverflow(page)
      await page.screenshot({ path: path.join(ARTIFACT_DIR, m.shot), fullPage: true })
    }

    // 12. Mobile: tidak ada overflow horizontal
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/quotation')
    await expect(page.getByRole('heading', { name: 'Quotation', level: 1 })).toBeVisible()
    await page.waitForTimeout(400)
    await assertNoHorizontalOverflow(page)
  })
})
