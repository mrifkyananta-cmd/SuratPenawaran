import { test, Page } from '@playwright/test'
import path from 'node:path'

const SCREENSHOTS_DIR = 'C:/Users/User/.gemini/antigravity-cli/brain/6283689a-f5b3-4a73-bb47-5eaf91474dcb/screenshots'

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'laptop', width: 1280, height: 720 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'mobile', width: 390, height: 844 },
]

async function loginIfNeeded(page: Page) {
  await page.goto('/')
  const loginHeading = page.getByRole('heading', { name: 'Masuk ke Luma' })
  if (await loginHeading.isVisible({ timeout: 3000 }).catch(() => false)) {
    await page.getByLabel('Username').fill('admin')
    await page.getByLabel('Password').fill('AdminLuma#2026')
    await page.getByRole('button', { name: 'Masuk' }).click()
    const confirmBtn = page.getByRole('button', { name: 'Mengerti' })
    if (await confirmBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await confirmBtn.click()
    }
  }
}

async function checkPageOverflow(page: Page) {
  return await page.evaluate(() => {
    const docEl = document.documentElement
    const body = document.body
    const hasDocOverflow = docEl.scrollWidth > window.innerWidth
    const hasBodyOverflow = body.scrollWidth > window.innerWidth

    // Find overflowing elements
    const elements = Array.from(document.querySelectorAll('*'))
    const overflowing: string[] = []

    for (const el of elements) {
      const rect = el.getBoundingClientRect()
      // Skip hidden or non-rendered elements
      if (rect.width === 0 || rect.height === 0) continue
      // If element right edge extends past viewport significantly (allow 1px rounding)
      if (rect.right > window.innerWidth + 1) {
        const tagName = el.tagName.toLowerCase()
        const className = (el.className || '').toString().slice(0, 50)
        overflowing.push(`${tagName}.${className}: right=${Math.round(rect.right)} vs innerWidth=${window.innerWidth}`)
      }
    }

    return {
      windowWidth: window.innerWidth,
      docScrollWidth: docEl.scrollWidth,
      bodyScrollWidth: body.scrollWidth,
      hasOverflow: hasDocOverflow || hasBodyOverflow,
      overflowingCount: overflowing.length,
      sampleOverflowing: overflowing.slice(0, 5),
    }
  })
}

test.describe('Comprehensive UI & Typography Audit', () => {
  test.setTimeout(240000)

  for (const vp of VIEWPORTS) {
    test(`Audit all pages at viewport ${vp.name} (${vp.width}x${vp.height})`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height })
      const consoleErrors: string[] = []
      page.on('console', (msg) => {
        if (msg.type() === 'error') consoleErrors.push(msg.text())
      })

      // 1. Login page (if logged out or fresh)
      await page.goto('/')
      await page.waitForLoadState('networkidle')
      await loginIfNeeded(page)

      const pagesToTest = [
        { name: '01-dashboard', path: '/' },
        { name: '02-quotation', path: '/quotation' },
        { name: '03-po', path: '/po' },
        { name: '04-invoice', path: '/invoice' },
        { name: '05-bukti-bayar', path: '/bukti-bayar' },
        { name: '06-surat-catalog', path: '/surat' },
        { name: '07-surat-penawaran', path: '/surat/surat-penawaran' },
        { name: '08-surat-permintaan-barang', path: '/surat/surat-permintaan-barang' },
        { name: '09-surat-pesanan', path: '/surat/surat-pesanan' },
        { name: '10-surat-perjanjian-jual-beli', path: '/surat/surat-perjanjian-jual-beli' },
      ]

      const auditResults: Record<string, any> = {}

      for (const p of pagesToTest) {
        await page.goto(p.path)
        await page.waitForLoadState('networkidle')
        await page.waitForTimeout(500)

        const overflow = await checkPageOverflow(page)
        auditResults[p.name] = { overflow }

        await page.screenshot({
          path: path.join(SCREENSHOTS_DIR, `before-${vp.name}-${p.name}.png`),
          fullPage: true,
        })
      }

      // Modals & Interactive States
      // Modal 1: Create New Surat Modal on /surat
      await page.goto('/surat')
      await page.waitForLoadState('networkidle')
      const btnCreateSurat = page.locator('#btn-create-new-surat')
      if (await btnCreateSurat.isVisible().catch(() => false)) {
        await btnCreateSurat.click()
        await page.waitForTimeout(300)
        await page.screenshot({
          path: path.join(SCREENSHOTS_DIR, `before-${vp.name}-modal-create-surat.png`),
          fullPage: true,
        })
        const closeBtn = page.getByRole('button', { name: 'Tutup' }).or(page.locator('button:has(svg.lucide-x)'))
        if (await closeBtn.first().isVisible().catch(() => false)) {
          await closeBtn.first().click()
        }
      }

      // Modal 2: Upload Template Modal on /surat
      const btnUploadTemplate = page.locator('#btn-tambah-template')
      if (await btnUploadTemplate.isVisible().catch(() => false)) {
        await btnUploadTemplate.click()
        await page.waitForTimeout(300)
        await page.screenshot({
          path: path.join(SCREENSHOTS_DIR, `before-${vp.name}-modal-upload-template.png`),
          fullPage: true,
        })
        const closeBtn = page.getByRole('button', { name: 'Batal' }).or(page.locator('button:has(svg.lucide-x)'))
        if (await closeBtn.first().isVisible().catch(() => false)) {
          await closeBtn.first().click()
        }
      }

      // Modal 3: Quotation Create Modal
      await page.goto('/quotation')
      await page.waitForLoadState('networkidle')
      const btnCreateQuote = page.getByRole('button', { name: 'Create New' })
      if (await btnCreateQuote.isVisible().catch(() => false)) {
        await btnCreateQuote.click()
        await page.waitForTimeout(300)
        await page.screenshot({
          path: path.join(SCREENSHOTS_DIR, `before-${vp.name}-modal-create-quotation.png`),
          fullPage: true,
        })
        const closeBtn = page.locator('button:has(svg.lucide-x)')
        if (await closeBtn.first().isVisible().catch(() => false)) {
          await closeBtn.first().click()
        }
      }

      // Mobile Menu Navigation on mobile / tablet
      if (vp.width < 1280) {
        const menuBtn = page.getByLabel('Buka menu navigasi')
        if (await menuBtn.isVisible().catch(() => false)) {
          await menuBtn.click()
          await page.waitForTimeout(300)
          await page.screenshot({
            path: path.join(SCREENSHOTS_DIR, `before-${vp.name}-mobile-nav.png`),
            fullPage: true,
          })
          const closeNav = page.getByLabel('Tutup menu navigasi')
          if (await closeNav.isVisible().catch(() => false)) {
            await closeNav.click()
          }
        }
      }

      console.log(`[AUDIT RESULT ${vp.name}]:`, JSON.stringify(auditResults, null, 2))
    })
  }
})
