require('dotenv').config()
const assert = require('node:assert/strict')
const { spawn } = require('node:child_process')
const { once } = require('node:events')
const fs = require('node:fs/promises')
const path = require('node:path')
const net = require('node:net')
const { PrismaClient } = require('../generated/prisma')

let prisma
let testDatabaseUrl
const token = 'integration-test-only-token'
const adminUser = 'admin_it'
const adminPassword = 'AdminItPassword#2026'
const staffUser = 'staff_it'
const staffPassword = 'StaffItPassword#2026'
const authSecret = 'integration-test-auth-secret-32chars-minimum!!'
const nonce = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`
const ids = { quote: null, purchaseOrders: [], invoices: [], payments: [], letterDocs: [] }
let server
let baseUrl
let adminAuthToken = ''
let staffAuthToken = ''

async function getPort() {
  const probe = net.createServer()
  probe.listen(0, '127.0.0.1')
  await once(probe, 'listening')
  const address = probe.address()
  const port = address.port
  await new Promise((resolve, reject) => probe.close((error) => error ? reject(error) : resolve()))
  return port
}

async function request(route, { method = 'GET', body, headers = {}, authToken = adminAuthToken } = {}) {
  const authHeader = authToken ? { Authorization: `Bearer ${authToken}` } : {}
  const response = await fetch(`${baseUrl}${route}`, {
    method,
    headers: body instanceof FormData
      ? { ...authHeader, ...headers }
      : body
        ? { 'content-type': 'application/json', ...authHeader, ...headers }
        : { ...authHeader, ...headers },
    body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
  })
  const content = response.status === 204 ? null : await response.json().catch(() => null)
  return { status: response.status, body: content }
}

function ok(result, status = 200) {
  assert.equal(result.status, status, JSON.stringify(result.body))
  return result.body
}

async function waitForServer(targetUrl = baseUrl) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`${targetUrl}/api/health`)
      if (response.ok) return
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error('Backend test server did not start.')
}

async function cleanDatabase() {
  if (ids.letterDocs.length) {
    await prisma.letterDocument.deleteMany({ where: { id: { in: ids.letterDocs } } })
  }
  if (ids.payments.length) {
    const attachments = await prisma.paymentAttachment.findMany({ where: { paymentId: { in: ids.payments } } })
    await prisma.paymentAttachment.deleteMany({ where: { paymentId: { in: ids.payments } } })
    await Promise.all(attachments.map((item) => fs.unlink(path.join(__dirname, '..', 'uploads', item.filename)).catch(() => {})))
    await prisma.payment.deleteMany({ where: { id: { in: ids.payments } } })
  }
  if (ids.invoices.length) await prisma.invoice.deleteMany({ where: { id: { in: ids.invoices } } })
  if (ids.purchaseOrders.length) {
    const attachments = await prisma.purchaseOrderAttachment.findMany({ where: { purchaseOrderId: { in: ids.purchaseOrders } } })
    await prisma.purchaseOrderAttachment.deleteMany({ where: { purchaseOrderId: { in: ids.purchaseOrders } } })
    await Promise.all(attachments.map((item) => fs.unlink(path.join(__dirname, '..', 'uploads', item.filename)).catch(() => {})))
    await prisma.purchaseOrder.deleteMany({ where: { id: { in: ids.purchaseOrders } } })
  }
  if (ids.quote) await prisma.quotation.deleteMany({ where: { id: ids.quote } })
}

async function main() {
  testDatabaseUrl = process.env.BILLING_TEST_DATABASE_URL
  if (!testDatabaseUrl) throw new Error('Set BILLING_TEST_DATABASE_URL ke database PostgreSQL disposable khusus test (nama database harus berakhiran _test).')
  let parsedTestUrl
  try { parsedTestUrl = new URL(testDatabaseUrl) } catch { throw new Error('BILLING_TEST_DATABASE_URL bukan URL PostgreSQL yang valid.') }
  const testDatabaseName = parsedTestUrl.pathname.replace(/^\//, '').split('?')[0]
  if (!testDatabaseName.endsWith('_test')) throw new Error('Integration test ditolak: nama database harus berakhiran _test.')
  const configuredUrl = process.env.DATABASE_URL
  if (configuredUrl) {
    try {
      const configured = new URL(configuredUrl)
      if (configured.host === parsedTestUrl.host && configured.pathname === parsedTestUrl.pathname) {
        throw new Error('Integration test ditolak karena URL database test sama dengan DATABASE_URL aplikasi.')
      }
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Integration test ditolak')) throw error
    }
  }
  prisma = new PrismaClient({ datasourceUrl: testDatabaseUrl })
  const identity = await prisma.$queryRawUnsafe('SELECT current_database() AS database')
  assert.equal(identity[0].database, testDatabaseName, 'Connected database does not match BILLING_TEST_DATABASE_URL.')
  const port = await getPort()
  baseUrl = `http://127.0.0.1:${port}`
  server = spawn(process.execPath, ['server.cjs'], {
    cwd: path.join(__dirname, '..'),
    env: {
      ...process.env,
      NODE_ENV: 'test',
      DATABASE_URL: testDatabaseUrl,
      PORT: String(port),
      PAYMENT_VERIFICATION_TOKEN: token,
      AUTH_SECRET: authSecret,
      AUTH_ADMIN_USERNAME: adminUser,
      AUTH_ADMIN_PASSWORD: adminPassword,
      AUTH_STAFF_USERNAME: staffUser,
      AUTH_STAFF_PASSWORD: staffPassword,
    },
    stdio: 'ignore',
  })
  await waitForServer()

  const health = await (await fetch(`${baseUrl}/api/health`)).json()
  assert.equal(health.paymentVerificationConfigured, true)
  assert.equal(health.authRequired, true)

  // P0.A: Unauthenticated requests to transaction endpoints must be rejected with 401
  assert.equal((await request('/api/quotations', { authToken: '' })).status, 401)
  assert.equal((await request('/api/purchase-orders', { authToken: '' })).status, 401)
  assert.equal((await request('/api/invoices', { authToken: '' })).status, 401)
  assert.equal((await request('/api/payments', { authToken: '' })).status, 401)
  assert.equal((await request('/api/letter-documents', { authToken: '' })).status, 401)
  assert.equal((await request('/api/dashboard/summary', { authToken: '' })).status, 401)

  // Login with invalid credentials must fail with 401
  assert.equal((await request('/api/auth/login', { method: 'POST', authToken: '', body: { username: adminUser, password: 'wrong' } })).status, 401)

  // Login as ADMIN and STAFF
  const adminLogin = ok(await request('/api/auth/login', { method: 'POST', authToken: '', body: { username: adminUser, password: adminPassword } }))
  assert.equal(adminLogin.user.role, 'ADMIN')
  adminAuthToken = adminLogin.token

  const staffLogin = ok(await request('/api/auth/login', { method: 'POST', authToken: '', body: { username: staffUser, password: staffPassword } }))
  assert.equal(staffLogin.user.role, 'STAFF')
  staffAuthToken = staffLogin.token

  const meAdmin = ok(await request('/api/auth/me', { authToken: adminAuthToken }))
  assert.equal(meAdmin.user.role, 'ADMIN')

  // P0.C: Production mode startup validation and execution
  const prodPort = await getPort()
  const prodUrl = `http://127.0.0.1:${prodPort}`
  const badProdServer = spawn(process.execPath, ['server.cjs'], {
    cwd: path.join(__dirname, '..'),
    env: {
      ...process.env,
      NODE_ENV: 'production',
      DATABASE_URL: testDatabaseUrl,
      PORT: String(prodPort),
      CORS_ORIGINS: '',
      AUTH_SECRET: '',
    },
    stdio: 'ignore',
  })
  const [badProdExitCode] = await once(badProdServer, 'exit')
  assert.notEqual(badProdExitCode, 0, 'Production startup without required env vars must fail.')

  const goodProdServer = spawn(process.execPath, ['server.cjs'], {
    cwd: path.join(__dirname, '..'),
    env: {
      ...process.env,
      NODE_ENV: 'production',
      DATABASE_URL: testDatabaseUrl,
      PORT: String(prodPort),
      CORS_ORIGINS: 'http://localhost:3000,http://127.0.0.1:3000',
      PAYMENT_VERIFICATION_TOKEN: token,
      AUTH_SECRET: authSecret,
      AUTH_ADMIN_USERNAME: adminUser,
      AUTH_ADMIN_PASSWORD: adminPassword,
      AUTH_STAFF_USERNAME: staffUser,
      AUTH_STAFF_PASSWORD: staffPassword,
    },
    stdio: 'ignore',
  })
  try {
    await waitForServer(prodUrl)
    const prodHealth = await (await fetch(`${prodUrl}/api/health`)).json()
    assert.equal(prodHealth.status, 'ok')
  } finally {
    goodProdServer.kill('SIGINT')
    await Promise.race([once(goodProdServer, 'exit'), new Promise((resolve) => setTimeout(resolve, 1000))])
  }

  const quotePayload = {
    number: `QT-IT-${nonce}`, recipient: 'Customer Integration', address: 'Jalan Test', city: 'Jakarta', date: new Date().toISOString().slice(0, 10),
    validityDays: '30', senderCompany: 'PT Luma Test', introduction: 'Intro Test', signer: 'Budi Santoso', position: 'Direktur', email: 'test@luma.id', phone: '081111',
    taxEnabled: true, taxMode: 'manual', taxRate: 10, taxManualAmount: 0, type: 'Barang', status: 'Approved', title: 'Item snapshot test',
    followUpDate: new Date().toISOString().slice(0, 10), followUpStatus: 'Terjadwal', followUpNotes: 'Follow up test note',
    items: [
      { description: 'Barang Snapshot', quantity: 2, unit: 'pcs', unitPrice: 5000, discount: 0, taxRate: 10 },
    ],
  }
  const invalidQuotation = await request('/api/quotations', { method: 'POST', body: { ...quotePayload, number: `QT-BAD-${nonce}`, date: '2026-02-30' } })
  assert.equal(invalidQuotation.status, 400, 'Invalid calendar dates must be rejected by the API.')
  const quote = ok(await request('/api/quotations', { method: 'POST', body: quotePayload }), 201)
  ids.quote = quote.id
  assert.equal(quote.items.length, 1)
  assert.equal(quote.followUpStatus, 'Terjadwal')
  assert.equal(quote.followUpNotes, 'Follow up test note')
  assert.equal((await request('/api/quotations', { method: 'POST', body: quotePayload })).status, 409, 'Duplicate quotation number must be rejected.')

  const statusChanged = ok(await request(`/api/quotations/${quote.id}/status`, { method: 'PATCH', body: { status: 'Follow Up' } }))
  assert.equal(statusChanged.status, 'Follow Up')
  assert.equal((await request(`/api/quotations/${quote.id}/status`, { method: 'PATCH', body: { status: 'InvalidStatus' } })).status, 400)
  ok(await request(`/api/quotations/${quote.id}/status`, { method: 'PATCH', body: { status: 'Approved' } }))

  const fakePng = new Blob([Buffer.from('not-a-valid-png-header')], { type: 'image/png' })
  const badQuoteForm = new FormData(); badQuoteForm.append('file', fakePng, 'spoofed.png')
  assert.equal((await request(`/api/quotations/${quote.id}/attachments`, { method: 'POST', body: badQuoteForm })).status, 400, 'Invalid file signature must be rejected on quotation attachment.')

  const validPdf = new Blob([Buffer.from('%PDF-1.4\n%test\n')], { type: 'application/pdf' })
  const goodQuoteForm = new FormData(); goodQuoteForm.append('file', validPdf, 'penawaran.pdf')
  const quoteAttachment = ok(await request(`/api/quotations/${quote.id}/attachments`, { method: 'POST', body: goodQuoteForm }), 201)

  // P0.B: Unauthenticated download of /uploads/:filename must return 401; authenticated download returns 200
  const unauthUploadRes = await fetch(`${baseUrl}${quoteAttachment.url}`)
  assert.equal(unauthUploadRes.status, 401, 'Unauthenticated access to /uploads must be blocked with 401.')
  const traversalRes = await fetch(`${baseUrl}/uploads/..%2Fserver.cjs?token=${encodeURIComponent(adminAuthToken)}`)
  assert.equal([400, 404].includes(traversalRes.status), true, 'Path traversal on /uploads must be blocked.')

  const uploadResponse = await fetch(`${baseUrl}${quoteAttachment.url}?token=${encodeURIComponent(adminAuthToken)}`)
  assert.equal(uploadResponse.status, 200)
  assert.equal(uploadResponse.headers.get('x-content-type-options'), 'nosniff')
  assert.equal(uploadResponse.headers.get('content-security-policy'), 'sandbox')
  assert.match(uploadResponse.headers.get('content-disposition') || '', /^attachment/)
  assert.equal((await request(`/api/quotations/${quote.id}/attachments/${quoteAttachment.id}`, { method: 'DELETE' })).status, 204)

  const tempQuote = ok(await request('/api/quotations', { method: 'POST', body: { ...quotePayload, number: `QT-DEL-${nonce}` } }), 201)
  // STAFF cannot delete quotation (RBAC 403)
  assert.equal((await request(`/api/quotations/${tempQuote.id}`, { method: 'DELETE', authToken: staffAuthToken })).status, 403)
  assert.equal((await request(`/api/quotations/${tempQuote.id}`, { method: 'DELETE', authToken: adminAuthToken })).status, 204)
  assert.equal((await request(`/api/quotations/${tempQuote.id}`)).status, 404)

  const po = ok(await request('/api/purchase-orders', { method: 'POST', body: {
    poNumber: `PO-IT-${nonce}`, date: quotePayload.date, receivedAt: quotePayload.date, recipient: quote.recipient, quotationId: quote.id, amount: '11000.00', notes: 'test PO',
  } }), 201)
  ids.purchaseOrders.push(po.id)
  assert.equal(po.quotationId, quote.id)
  assert.equal((await request(`/api/quotations/${quote.id}`, { method: 'DELETE' })).status, 409, 'Quotation with active PO must not be deletable.')
  assert.equal((await request('/api/purchase-orders', { method: 'POST', body: { poNumber: po.poNumber, date: quotePayload.date, receivedAt: quotePayload.date, recipient: quote.recipient } })).status, 409)
  const editedPo = ok(await request(`/api/purchase-orders/${po.id}`, { method: 'PATCH', body: { poNumber: `PO-EDIT-${nonce}`, date: quotePayload.date, recipient: quote.recipient } }), 200)
  assert.equal(editedPo.quotationId, quote.id, 'PATCH PO without quotationId must preserve existing quotationId.')

  // LetterDocument persistence & Surat Pesanan -> PurchaseOrder sync
  const spbDoc = ok(await request('/api/letter-documents', {
    method: 'POST',
    body: {
      type: 'SURAT_PERMINTAAN_BARANG',
      number: `SPB-IT-${nonce}`,
      title: 'Permintaan Barang IT',
      recipient: 'Divisi Pengadaan',
      date: quotePayload.date,
      payload: { nomor_surat: `SPB-IT-${nonce}`, tujuan_nama: 'Divisi Pengadaan', items: [{ nama: 'SSD 1TB', jumlah: 2, satuan: 'Unit', keterangan: 'Server' }] },
    },
  }), 201)
  ids.letterDocs.push(spbDoc.id)
  assert.equal(spbDoc.number, `SPB-IT-${nonce}`)

  const spDoc = ok(await request('/api/letter-documents', {
    method: 'POST',
    body: {
      type: 'SURAT_PESANAN',
      number: `PO-SURAT-${nonce}`,
      title: 'Surat Pesanan Sync Test',
      recipient: 'PT Vendor Sync',
      date: quotePayload.date,
      syncPurchaseOrder: true,
      payload: {
        nomor_surat: `PO-SURAT-${nonce}`,
        vendor_perusahaan: 'PT Vendor Sync',
        kenaPpn: true,
        items: [{ nama: 'Switch Gigabit', jumlah: 2, satuan: 'Unit', harga: 1000000 }],
      },
    },
  }), 201)
  ids.letterDocs.push(spDoc.id)
  assert.ok(spDoc.purchaseOrderId, 'Saving SURAT_PESANAN with syncPurchaseOrder: true must create a linked PurchaseOrder.')
  assert.equal(spDoc.status, 'Draft', 'Default status for letter document must be Draft.')
  ids.purchaseOrders.push(spDoc.purchaseOrderId)

  // Verify GET /letter-documents/unified includes both quotations and letter documents
  const unified = ok(await request('/api/letter-documents/unified'))
  assert.ok(Array.isArray(unified), 'Unified letters should return an array.')
  assert.ok(unified.some((item) => item.number === quotePayload.number && item.type === 'SURAT_PENAWARAN'), 'Unified letters must include quotation.')
  assert.ok(unified.some((item) => item.number === `SPB-IT-${nonce}` && item.type === 'SURAT_PERMINTAAN_BARANG'), 'Unified letters must include letter documents.')

  const summary = ok(await request('/api/dashboard/summary'))
  assert.equal(typeof summary.quotations.total, 'number')
  assert.equal(typeof summary.purchaseOrders.active, 'number')
  assert.equal(typeof summary.invoices.total, 'number')
  assert.equal(typeof summary.payments.pendingVerification, 'number')

  const legacyId = `quick-in-it-${nonce}`
  const legacyBody = { records: [
    { id: legacyId, poNumber: `PO-LEGACY-${nonce}`, date: quotePayload.date, quotationId: quote.id, recipient: quote.recipient, notes: 'import test' },
    { id: `invalid-${nonce}`, poNumber: ' ', date: 'not-a-date' },
  ] }
  const imported = ok(await request('/api/purchase-orders/import-legacy', { method: 'POST', body: legacyBody }))
  assert.equal(imported.imported, 1)
  const importedAgain = ok(await request('/api/purchase-orders/import-legacy', { method: 'POST', body: legacyBody }))
  assert.equal(importedAgain.results[0].result, 'already-imported')
  assert.equal(importedAgain.results[1].result, 'invalid')
  const legacyPO = await prisma.purchaseOrder.findUnique({ where: { legacyLocalId: legacyId } })
  ids.purchaseOrders.push(legacyPO.id)

  const badPoForm = new FormData(); badPoForm.append('file', fakePng, 'spoofed.png')
  assert.equal((await request(`/api/purchase-orders/${po.id}/attachments`, { method: 'POST', body: badPoForm })).status, 400, 'Invalid file signature must be rejected on PO attachment.')

  const pdf = validPdf
  const poForm = new FormData(); poForm.append('file', pdf, 'purchase-order.pdf')
  const poAttachment = ok(await request(`/api/purchase-orders/${po.id}/attachments`, { method: 'POST', body: poForm }), 201)
  assert.equal((await request(`/api/purchase-orders/${po.id}/attachments/${poAttachment.id}`, { method: 'DELETE' })).status, 204)

  const invoice = ok(await request('/api/invoices', { method: 'POST', body: {
    number: `INV-IT-${nonce}`, customerName: quote.recipient, dueDate: quotePayload.date,
    purchaseOrderId: po.id, quotationId: quote.id, notes: 'snapshot test',
  } }), 201)
  ids.invoices.push(invoice.id)
  assert.equal(invoice.status, 'DRAFT')
  assert.equal(invoice.items[0].description, 'Barang Snapshot')
  assert.equal(invoice.total, '11000')
  assert.equal((await request(`/api/purchase-orders/${po.id}`, { method: 'PATCH', body: { poNumber: `PO-AFTER-INV-${nonce}`, date: quotePayload.date, recipient: quote.recipient } })).status, 409)

  const duplicateInvoice = await request('/api/invoices', { method: 'POST', body: {
    number: invoice.number, customerName: quote.recipient, dueDate: quotePayload.date, purchaseOrderId: po.id,
  } })
  assert.equal(duplicateInvoice.status, 409)

  const changedQuote = { ...quotePayload, title: 'Quotation changed', items: [{ description: 'Ubah setelah invoice', quantity: 1, unit: 'pcs', unitPrice: 99000, discount: 0, taxRate: 0 }] }
  ok(await request(`/api/quotations/${quote.id}`, { method: 'PUT', body: changedQuote }))
  const snapshotAfterQuoteEdit = ok(await request(`/api/invoices/${invoice.id}`))
  assert.equal(snapshotAfterQuoteEdit.items[0].description, 'Barang Snapshot')
  assert.equal(snapshotAfterQuoteEdit.items[0].unitPrice, '5000')

  const issued = ok(await request(`/api/invoices/${invoice.id}/issue`, { method: 'PATCH', body: {} }))
  assert.equal(issued.status, 'ISSUED')

  const pending = ok(await request('/api/payments', { method: 'POST', body: {
    invoiceId: invoice.id, amount: '5000', paymentDate: quotePayload.date, method: 'Transfer Bank', reference: `TRX-${nonce}`, notes: 'partial test',
  } }), 201)
  ids.payments.push(pending.id)
  assert.equal(pending.status, 'PENDING')
  let invoiceAfterPending = ok(await request(`/api/invoices/${invoice.id}`))
  assert.equal(invoiceAfterPending.paidAmount, '0.00')
  assert.equal(invoiceAfterPending.balance, '11000.00')

  const proofForm = new FormData(); proofForm.append('file', pdf, 'proof.pdf')
  const proof = ok(await request(`/api/payments/${pending.id}/attachments`, { method: 'POST', body: proofForm }), 201)
  assert.equal((await request(`/api/payments/${pending.id}/attachments/${proof.id}`, { method: 'DELETE' })).status, 204)
  assert.equal((await request(`/api/payments/${pending.id}/verify`, { method: 'PATCH', body: {} })).status, 403)
  assert.equal((await request(`/api/payments/${pending.id}/verify`, { method: 'PATCH', headers: { 'x-payment-verification-token': 'wrong-token' }, body: {} })).status, 403)
  // STAFF role must not be able to verify payment even if they know the verification token
  assert.equal((await request(`/api/payments/${pending.id}/verify`, { method: 'PATCH', authToken: staffAuthToken, headers: { 'x-payment-verification-token': token }, body: {} })).status, 403)

  const unconfiguredPort = await getPort()
  const unconfiguredUrl = `http://127.0.0.1:${unconfiguredPort}`
  const unconfiguredServer = spawn(process.execPath, ['server.cjs'], {
    cwd: path.join(__dirname, '..'),
    env: {
      ...process.env,
      NODE_ENV: 'test',
      DATABASE_URL: testDatabaseUrl,
      PORT: String(unconfiguredPort),
      PAYMENT_VERIFICATION_TOKEN: '',
      AUTH_SECRET: authSecret,
      AUTH_ADMIN_USERNAME: adminUser,
      AUTH_ADMIN_PASSWORD: adminPassword,
    },
    stdio: 'ignore',
  })
  try {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      try {
        const res = await fetch(`${unconfiguredUrl}/api/health`)
        if (res.ok) {
          const body = await res.json()
          assert.equal(body.paymentVerificationConfigured, false)
          break
        }
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 200))
    }
    const unconfVerify = await fetch(`${unconfiguredUrl}/api/payments/${pending.id}/verify`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        Authorization: `Bearer ${adminAuthToken}`,
        'x-payment-verification-token': token,
      },
      body: '{}',
    })
    assert.equal(unconfVerify.status, 503, 'Verification must return 503 when PAYMENT_VERIFICATION_TOKEN is not configured.')
  } finally {
    unconfiguredServer.kill('SIGINT')
    await Promise.race([once(unconfiguredServer, 'exit'), new Promise((resolve) => setTimeout(resolve, 1000))])
  }

  ok(await request(`/api/payments/${pending.id}/verify`, { method: 'PATCH', headers: { 'x-payment-verification-token': token }, body: {} }))
  invoiceAfterPending = ok(await request(`/api/invoices/${invoice.id}`))
  assert.equal(invoiceAfterPending.paidAmount, '5000.00')
  assert.equal(invoiceAfterPending.balance, '6000.00')
  assert.equal(invoiceAfterPending.status, 'PARTIALLY_PAID')

  const cancelledVerified = ok(await request(`/api/payments/${pending.id}/cancel`, { method: 'PATCH', headers: { 'x-payment-verification-token': token }, body: { reason: 'Correction test' } }))
  assert.equal(cancelledVerified.status, 'CANCELLED')
  invoiceAfterPending = ok(await request(`/api/invoices/${invoice.id}`))
  assert.equal(invoiceAfterPending.paidAmount, '0.00')
  assert.equal(invoiceAfterPending.balance, '11000.00')

  const overpayment = await request('/api/payments', { method: 'POST', body: {
    invoiceId: invoice.id, amount: '11000.01', paymentDate: quotePayload.date, method: 'Transfer Bank',
  } })
  assert.equal(overpayment.status, 409)
  const overpaymentCase = ok(await request('/api/payments/overpayment-case', { method: 'POST', headers: { 'x-payment-verification-token': token }, body: {
    invoiceId: invoice.id, amount: '11000.01', paymentDate: quotePayload.date, method: 'Transfer Bank', reason: 'Test case review',
  } }), 201)
  ids.payments.push(overpaymentCase.id)
  assert.equal(overpaymentCase.status, 'REVIEW_REQUIRED')
  assert.equal((await request(`/api/payments/${overpaymentCase.id}/verify`, { method: 'PATCH', headers: { 'x-payment-verification-token': token }, body: {} })).status, 409)
  invoiceAfterPending = ok(await request(`/api/invoices/${invoice.id}`))
  assert.equal(invoiceAfterPending.paidAmount, '0.00')
  assert.equal(invoiceAfterPending.balance, '11000.00')
  ok(await request(`/api/payments/${overpaymentCase.id}/cancel`, { method: 'PATCH', headers: { 'x-payment-verification-token': token }, body: { reason: 'Review case test cleanup' } }))

  const concurrentOne = ok(await request('/api/payments', { method: 'POST', body: { invoiceId: invoice.id, amount: '7000', paymentDate: quotePayload.date, method: 'Transfer Bank' } }), 201)
  const concurrentTwo = ok(await request('/api/payments', { method: 'POST', body: { invoiceId: invoice.id, amount: '7000', paymentDate: quotePayload.date, method: 'Transfer Bank' } }), 201)
  ids.payments.push(concurrentOne.id, concurrentTwo.id)
  const concurrencyResults = await Promise.all([
    request(`/api/payments/${concurrentOne.id}/verify`, { method: 'PATCH', headers: { 'x-payment-verification-token': token }, body: {} }),
    request(`/api/payments/${concurrentTwo.id}/verify`, { method: 'PATCH', headers: { 'x-payment-verification-token': token }, body: {} }),
  ])
  assert.equal(concurrencyResults.filter((result) => result.status === 200).length, 1)
  assert.equal(concurrencyResults.filter((result) => result.status === 409).length, 1)
  const currentPayments = ok(await request(`/api/payments?search=${encodeURIComponent(invoice.number)}`))
  const verified = currentPayments.find((item) => item.status === 'VERIFIED')
  const pendingAfterRace = currentPayments.find((item) => item.status === 'PENDING')
  assert.ok(verified)
  assert.ok(pendingAfterRace)
  ok(await request(`/api/payments/${verified.id}/cancel`, { method: 'PATCH', headers: { 'x-payment-verification-token': token }, body: { reason: 'Race cleanup' } }))
  ok(await request(`/api/payments/${pendingAfterRace.id}/cancel`, { method: 'PATCH', headers: { 'x-payment-verification-token': token }, body: { reason: 'Race cleanup' } }))
  const paymentDetail = ok(await request(`/api/payments/${pending.id}`))
  assert.equal(paymentDetail.history.length, 3)

  const fullPayment = ok(await request('/api/payments', { method: 'POST', body: { invoiceId: invoice.id, amount: '11000', paymentDate: quotePayload.date, method: 'Transfer Bank' } }), 201)
  ids.payments.push(fullPayment.id)
  ok(await request(`/api/payments/${fullPayment.id}/verify`, { method: 'PATCH', headers: { 'x-payment-verification-token': token }, body: {} }))
  const paidInvoice = ok(await request(`/api/invoices/${invoice.id}`))
  assert.equal(paidInvoice.status, 'PAID')
  assert.equal(paidInvoice.balance, '0.00')
  assert.equal((await request(`/api/invoices/${invoice.id}/cancel`, { method: 'PATCH', body: { reason: 'Must retain verified payment history.' } })).status, 409)
  ok(await request(`/api/payments/${fullPayment.id}/cancel`, { method: 'PATCH', headers: { 'x-payment-verification-token': token }, body: { reason: 'Paid state test cleanup' } }))

  const cancelledInvoice = ok(await request(`/api/invoices/${invoice.id}/cancel`, { method: 'PATCH', body: { reason: 'Integration test cleanup' } }))
  assert.equal(cancelledInvoice.status, 'CANCELLED')
  const cancelledPO = ok(await request(`/api/purchase-orders/${po.id}/cancel`, { method: 'PATCH', body: { reason: 'Integration test cleanup' } }))
  assert.equal(cancelledPO.status, 'CANCELLED')

  const persisted = ok(await request(`/api/invoices/${invoice.id}`))
  assert.equal(persisted.items[0].description, 'Barang Snapshot')

  const listAfterReload = ok(await request('/api/purchase-orders'))
  assert.ok(listAfterReload.some((item) => item.id === po.id))
  const invoiceListAfterReload = ok(await request(`/api/invoices?search=${encodeURIComponent(invoice.number)}`))
  assert.ok(invoiceListAfterReload.some((item) => item.id === invoice.id))
  const paymentListAfterReload = ok(await request(`/api/payments?search=${encodeURIComponent(invoice.number)}`))
  assert.ok(paymentListAfterReload.some((item) => item.id === fullPayment.id))

  // Surat Penawaran -> Simpan ke Quotation: large Base64 signature/stamp + numeric validityDays + partial PUT update preserving management fields
  const largePngBase64 = `data:image/png;base64,${'A'.repeat(2 * 1024 * 1024)}`
  const spCreated = ok(await request('/api/quotations', {
    method: 'POST',
    body: {
      recipient: 'PT Surat Penawaran Sync',
      address: 'Jl. Gatot Subroto No. 88',
      city: 'Jakarta Selatan 12950',
      date: '2026-10-18',
      number: `QT-SP-SYNC-${nonce}`,
      validityDays: 30,
      senderCompany: 'PT Sinergi Karunia Sejahtera',
      introduction: 'Berikut penawaran resmi kami.',
      signer: 'Budi Santoso',
      position: 'Direktur',
      email: 'budi@sinergi.co.id',
      phone: '08123456789',
      taxEnabled: true,
      taxMode: 'percent',
      taxRate: 11,
      taxManualAmount: 0,
      signatureImage: largePngBase64,
      stampImage: largePngBase64,
      status: 'Approved',
      type: 'Jasa',
      title: 'Kontrak Jasa Pemeliharaan',
      notes: 'Catatan internal manajemen quotation',
      followUpDate: '2026-10-25',
      followUpStatus: 'Terjadwal',
      followUpNotes: 'Hubungi bagian pengadaan',
      items: [{ description: 'Jasa Konsultasi', quantity: 2, unit: 'paket', unitPrice: 5000000, discount: 0, taxRate: 11 }],
    },
  }), 201)
  assert.equal(spCreated.validUntil, '2026-11-17')
  assert.equal(spCreated.status, 'Approved')
  assert.equal(spCreated.type, 'Jasa')

  // Simulate saving from Surat Penawaran (which does not send status, type, title, notes, followUp*)
  const spUpdated = ok(await request(`/api/quotations/${spCreated.id}`, {
    method: 'PUT',
    body: {
      recipient: 'PT Surat Penawaran Sync Updated',
      address: 'Jl. Gatot Subroto No. 99',
      city: 'Jakarta Selatan 12950',
      date: '2026-10-18',
      number: `QT-SP-SYNC-${nonce}`,
      validityDays: '45',
      senderCompany: 'PT Sinergi Karunia Sejahtera',
      introduction: 'Paragraf pembuka diperbarui.',
      signer: 'Budi Santoso',
      position: 'Direktur Utama',
      email: 'budi@sinergi.co.id',
      phone: '08123456789',
      taxEnabled: true,
      taxMode: 'percent',
      taxRate: 11,
      taxManualAmount: 0,
      signatureImage: largePngBase64,
      stampImage: largePngBase64,
      items: [{ description: 'Jasa Konsultasi Lanjutan', quantity: 3, unit: 'paket', unitPrice: 5000000, discount: 0, taxRate: 11 }],
    },
  }))
  assert.equal(spUpdated.recipient, 'PT Surat Penawaran Sync Updated')
  assert.equal(spUpdated.status, 'Approved')
  assert.equal(spUpdated.type, 'Jasa')
  assert.equal(spUpdated.title, 'Kontrak Jasa Pemeliharaan')
  assert.equal(spUpdated.notes, 'Catatan internal manajemen quotation')
  assert.equal(spUpdated.followUpDate, '2026-10-25')
  assert.equal(spUpdated.followUpStatus, 'Terjadwal')
  assert.equal(spUpdated.followUpNotes, 'Hubungi bagian pengadaan')
  assert.equal((await request(`/api/quotations/${spCreated.id}`, { method: 'DELETE', authToken: adminAuthToken })).status, 204)

  console.log('Billing integration passed: Auth + RBAC, protected /uploads, production startup validation, LetterDocument + PO sync, SuratPenawaran -> Quotation sync & field preservation, dashboard summary, PO + legacy import, invoice snapshot, payments, verification, cancellation, overpayment guard, concurrency, and persistence.')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
}).finally(async () => {
  if (server && server.exitCode === null) {
    server.kill('SIGINT')
    await Promise.race([once(server, 'exit'), new Promise((resolve) => setTimeout(resolve, 1500))])
  }
  if (prisma) {
    await cleanDatabase().catch((error) => { console.error('Test cleanup failed:', error.message); process.exitCode = 1 })
    await prisma.$disconnect()
  }
})
