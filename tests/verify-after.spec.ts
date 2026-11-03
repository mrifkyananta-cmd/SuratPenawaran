import { test, expect, Page } from '@playwright/test'
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

    return {
      windowWidth: window.innerWidth,
      docScrollWidth: docEl.scrollWidth,
      bodyScrollWidth: body.scrollWidth,
      hasOverflow: hasDocOverflow || hasBodyOverflow,
    }
  })
}

test.describe('After-Fix UI Verification & Screenshot Capture', () => {
  test.setTimeout(240000)

  for (const vp of VIEWPORTS) {
    test(`Verify pages at viewport ${vp.name} (${vp.width}x${vp.height})`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height })

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

      for (const p of pagesToTest) {
        await page.goto(p.path)
        await page.waitForLoadState('networkidle')
        await page.waitForTimeout(600)

        const screenshotPath = path.join(SCREENSHOTS_DIR, `after-${vp.name}-${p.name}.png`)
        await page.screenshot({ path: screenshotPath, fullPage: true })

        const overflow = await checkPageOverflow(page)
        console.log(`[AFTER] [${vp.name}] ${p.name}: overflow=${overflow.hasOverflow} (window=${overflow.windowWidth}, docScroll=${overflow.docScrollWidth})`)
        expect(overflow.hasOverflow, `Page ${p.name} at viewport ${vp.name} should not have root horizontal overflow`).toBe(false)
      }
    })
  }
})
