const express = require('express')
const multer = require('multer')
const crypto = require('crypto')
const fs = require('fs/promises')
const path = require('path')
const { Prisma } = require('../generated/prisma')

const router = express.Router()
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
})
const UPLOAD_DIR = path.join(__dirname, '..', 'uploads')
const MAX_CENTS = 10n ** 18n - 1n

class HttpError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

function fail(status, message) {
  throw new HttpError(status, message)
}

function sendError(res, error) {
  if (error instanceof HttpError) return res.status(error.status).json({ error: error.message })
  if (error?.code === 'P2002') return res.status(409).json({ error: 'Nomor dokumen atau referensi sudah digunakan.' })
  if (error?.code === 'P2003') return res.status(409).json({ error: 'Relasi dokumen tidak valid atau masih digunakan.' })
  if (error?.code === 'P2025') return res.status(404).json({ error: 'Dokumen tidak ditemukan.' })
  if (error?.code === 'P2023') return res.status(400).json({ error: 'ID dokumen tidak valid.' })
  console.error('Billing API request failed:', error?.code || error?.name || 'unknown error')
  return res.status(500).json({ error: 'Terjadi kesalahan server. Silakan coba kembali.' })
}

function text(value, label, maxLength = 500) {
  if (typeof value !== 'string') fail(400, `${label} wajib diisi.`)
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > maxLength) fail(400, `${label} wajib diisi dan maksimal ${maxLength} karakter.`)
  return trimmed
}

function optionalText(value, maxLength = 2000) {
  if (value == null || value === '') return null
  if (typeof value !== 'string' || value.trim().length > maxLength) fail(400, 'Teks keterangan tidak valid.')
  return value.trim() || null
}

function docNumber(value, label) {
  return text(value, label, 100).toUpperCase()
}

function dateValue(value, label) {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) fail(400, `${label} wajib diisi dengan tanggal yang valid.`)
  const result = new Date(`${value}T00:00:00.000Z`)
  if (!Number.isFinite(result.getTime()) || result.toISOString().slice(0, 10) !== value) fail(400, `${label} tidak valid.`)
  return result
}

function optionalDate(value, label) {
  if (value == null || value === '') return null
  return dateValue(value, label)
}

function parseCents(value, label = 'Nominal') {
  const input = typeof value === 'number' && Number.isFinite(value) ? value.toFixed(2) : String(value ?? '').trim()
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(input)) fail(400, `${label} harus berupa angka positif dengan maksimal dua desimal.`)
  const [whole, fraction = ''] = input.split('.')
  const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'))
  if (cents > MAX_CENTS) fail(400, `${label} melebihi batas nominal yang didukung.`)
  return cents
}

function formatCents(cents) {
  const absolute = cents < 0n ? -cents : cents
  const formatted = `${absolute / 100n}.${String(absolute % 100n).padStart(2, '0')}`
  return cents < 0n ? `-${formatted}` : formatted
}

function decimalCents(value) {
  return parseCents(value.toFixed(2))
}

function quantityMilli(value) {
  const input = String(value ?? '').trim()
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,3})?$/.test(input)) fail(400, 'Jumlah item harus lebih dari nol dan maksimal tiga desimal.')
  const [whole, fraction = ''] = input.split('.')
  const result = BigInt(whole) * 1000n + BigInt(fraction.padEnd(3, '0'))
  if (result <= 0n || result > 10n ** 15n) fail(400, 'Jumlah item berada di luar batas yang didukung.')
  return result
}

function formatQuantity(milli) {
  const whole = milli / 1000n
  const fraction = String(milli % 1000n).padStart(3, '0').replace(/0+$/, '')
  return fraction ? `${whole}.${fraction}` : String(whole)
}

function rateHundredths(value) {
  const input = String(value ?? '0').trim()
  if (!/^(?:0|[1-9]\d{0,2})(?:\.\d{1,2})?$/.test(input)) fail(400, 'Tarif pajak harus antara 0 dan 999,99 persen.')
  const [whole, fraction = ''] = input.split('.')
  const rate = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'))
  if (rate > 99999n) fail(400, 'Tarif pajak melebihi batas yang didukung.')
  return rate
}

function computeItems(rawItems) {
  if (!Array.isArray(rawItems) || rawItems.length === 0 || rawItems.length > 500) fail(400, 'Invoice harus memiliki minimal satu item dan maksimal 500 item.')
  let subtotalCents = 0n
  let taxCents = 0n
  const items = rawItems.map((item, index) => {
    const description = text(item?.description, `Nama item ${index + 1}`, 500)
    const quantity = quantityMilli(item?.quantity)
    const unit = text(item?.unit || 'pcs', `Satuan item ${index + 1}`, 50)
    const unitPrice = parseCents(item?.unitPrice, `Harga item ${index + 1}`)
    const discount = parseCents(item?.discount ?? '0', `Diskon item ${index + 1}`)
    const taxRate = rateHundredths(item?.taxRate ?? '0')
    const gross = (quantity * unitPrice + 500n) / 1000n
    if (discount > gross) fail(400, `Diskon item ${index + 1} tidak boleh melebihi nilai item.`)
    const subtotal = gross - discount
    const tax = (subtotal * taxRate + 5000n) / 10000n
    const total = subtotal + tax
    subtotalCents += subtotal
    taxCents += tax
    return {
      sourceItemId: typeof item?.sourceItemId === 'string' ? item.sourceItemId : null,
      description,
      quantity: new Prisma.Decimal(formatQuantity(quantity)),
      unit,
      unitPrice: new Prisma.Decimal(formatCents(unitPrice)),
      discount: new Prisma.Decimal(formatCents(discount)),
      taxRate: new Prisma.Decimal((Number(taxRate) / 100).toFixed(2)),
      subtotal: new Prisma.Decimal(formatCents(subtotal)),
      taxAmount: new Prisma.Decimal(formatCents(tax)),
      total: new Prisma.Decimal(formatCents(total)),
    }
  })
  const totalCents = subtotalCents + taxCents
  if (totalCents <= 0n) fail(400, 'Total invoice harus lebih dari nol.')
  if (totalCents > MAX_CENTS) fail(400, 'Total invoice melebihi batas nominal yang didukung.')
  return { items, subtotalCents, taxCents, totalCents }
}

function quoteItems(quotation) {
  return quotation.items.map((item) => ({
    sourceItemId: item.id,
    description: item.description,
    quantity: String(item.quantity),
    unit: item.unit,
    unitPrice: Number(item.unitPrice).toFixed(2),
    discount: Number(item.discount || 0).toFixed(2),
    taxRate: Number(item.taxRate || 0).toFixed(2),
  }))
}

async function resolveInvoiceSource(tx, body) {
  let purchaseOrder = null
  let quotation = null
  if (body.purchaseOrderId) {
    purchaseOrder = await tx.purchaseOrder.findUnique({
      where: { id: body.purchaseOrderId },
      include: { quotation: { include: { items: true } } },
    })
    if (!purchaseOrder || purchaseOrder.status === 'CANCELLED') fail(400, 'Purchase Order tidak ditemukan atau sudah dibatalkan.')
    quotation = purchaseOrder.quotation
    if (body.quotationId && body.quotationId !== purchaseOrder.quotationId) fail(400, 'Quotation tidak sesuai dengan Purchase Order yang dipilih.')
  } else if (body.quotationId) {
    quotation = await tx.quotation.findUnique({ where: { id: body.quotationId }, include: { items: true } })
    if (!quotation) fail(400, 'Quotation tidak ditemukan.')
  }
  return { purchaseOrder, quotation }
}

function invoiceCreateData(body, sources) {
  const number = docNumber(body.number, 'Nomor invoice')
  const customerName = text(body.customerName || sources.purchaseOrder?.recipient || sources.quotation?.recipient, 'Nama pelanggan', 250)
  const dueDate = dateValue(body.dueDate, 'Tanggal jatuh tempo')
  const issueDate = optionalDate(body.issueDate, 'Tanggal invoice')
  const itemSource = Array.isArray(body.items) && body.items.length ? body.items : sources.quotation ? quoteItems(sources.quotation) : []
  const computed = computeItems(itemSource)
  return {
    number,
    customerName,
    issueDate,
    dueDate,
    status: 'DRAFT',
    subtotal: new Prisma.Decimal(formatCents(computed.subtotalCents)),
    taxAmount: new Prisma.Decimal(formatCents(computed.taxCents)),
    total: new Prisma.Decimal(formatCents(computed.totalCents)),
    notes: optionalText(body.notes),
    purchaseOrderId: sources.purchaseOrder?.id ?? null,
    quotationId: sources.quotation?.id ?? null,
    items: computed.items,
  }
}

function verifiedCents(payments) {
  return payments.reduce((sum, payment) => payment.status === 'VERIFIED' ? sum + decimalCents(payment.amount) : sum, 0n)
}

function derivedInvoice(invoice, payments = invoice.payments || []) {
  const total = decimalCents(invoice.total)
  const paid = verifiedCents(payments)
  const balance = total - paid
  let status = invoice.status
  if (invoice.status === 'ISSUED') {
    if (balance < 0n) status = 'REVIEW_REQUIRED'
    else if (balance === 0n) status = 'PAID'
    else if (invoice.dueDate.toISOString().slice(0, 10) < new Date().toISOString().slice(0, 10)) status = 'OVERDUE'
    else if (paid > 0n) status = 'PARTIALLY_PAID'
  }
  const { payments: ignoredPayments, ...base } = invoice
  void ignoredPayments
  return {
    ...base,
    status,
    paidAmount: formatCents(paid),
    balance: formatCents(balance),
    overpayment: formatCents(balance < 0n ? -balance : 0n),
  }
}

const invoiceInclude = {
  items: { orderBy: { id: 'asc' } },
  purchaseOrder: { select: { id: true, poNumber: true, status: true, quotationId: true } },
  quotation: { select: { id: true, number: true, recipient: true } },
  payments: { select: { amount: true, status: true } },
  statusHistory: { orderBy: { createdAt: 'asc' } },
}

async function serializable(prisma, action) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(action, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
    } catch (error) {
      if (error?.code !== 'P2034' && error?.meta?.code !== '40001') throw error
      if (attempt === 2) fail(409, 'Transaksi berbenturan dengan pembayaran lain. Muat ulang data dan coba kembali.')
    }
  }
}

function secureTokenMatches(provided) {
  const configured = process.env.PAYMENT_VERIFICATION_TOKEN
  if (!configured) return false
  const left = Buffer.from(String(provided || ''))
  const right = Buffer.from(configured)
  return left.length === right.length && crypto.timingSafeEqual(left, right)
}

function requireVerifier(req) {
  if (req.user && req.user.role !== 'ADMIN') {
    fail(403, 'Akses ditolak: hanya administrator yang berwenang memverifikasi atau membatalkan pembayaran terverifikasi.')
  }
  if (!process.env.PAYMENT_VERIFICATION_TOKEN) fail(503, 'Verifikasi pembayaran belum dikonfigurasi oleh administrator.')
  if (!secureTokenMatches(req.get('x-payment-verification-token'))) fail(403, 'Kode verifikasi tidak valid.')
}

function validFile(file) {
  if (!file || !file.buffer?.length) fail(400, 'File bukti wajib dipilih.')
  const bytes = file.buffer
  const mime = file.mimetype
  const signatures = {
    'application/pdf': bytes.subarray(0, 5).toString() === '%PDF-',
    'image/png': bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
    'image/jpeg': bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
    'image/webp': bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP',
  }
  if (!signatures[mime]) fail(400, 'Isi file tidak sesuai. Gunakan PDF, PNG, JPG, atau WEBP yang valid.')
}

async function saveAttachment(file, ownerId, model, foreignKey) {
  validFile(file)
  const extensions = { 'application/pdf': '.pdf', 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp' }
  const filename = `${crypto.randomUUID()}${extensions[file.mimetype]}`
  await fs.mkdir(UPLOAD_DIR, { recursive: true })
  const filePath = path.join(UPLOAD_DIR, filename)
  await fs.writeFile(filePath, file.buffer, { flag: 'wx' })
  try {
    return await model.create({
      data: {
        [foreignKey]: ownerId,
        name: path.basename(file.originalname || 'lampiran').slice(0, 250),
        filename,
        mimeType: file.mimetype,
        size: file.size,
        url: `/uploads/${filename}`,
      },
    })
  } catch (error) {
    await fs.unlink(filePath).catch(() => {})
    throw error
  }
}

async function deleteAttachment(record, model) {
  await model.delete({ where: { id: record.id } })
  await fs.unlink(path.join(UPLOAD_DIR, path.basename(record.filename))).catch((error) => {
    if (error.code !== 'ENOENT') console.error('Attachment file cleanup failed:', error.code || error.name)
  })
}

function asyncRoute(handler) {
  return (req, res) => Promise.resolve(handler(req, res)).catch((error) => sendError(res, error))
}

router.get('/purchase-orders', asyncRoute(async (req, res) => {
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : ''
  const status = typeof req.query.status === 'string' ? req.query.status : ''
  const rows = await req.prisma.purchaseOrder.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(search ? { OR: [
        { poNumber: { contains: search, mode: 'insensitive' } },
        { recipient: { contains: search, mode: 'insensitive' } },
        { quotation: { number: { contains: search, mode: 'insensitive' } } },
      ] } : {}),
    },
    include: { quotation: { select: { id: true, number: true, recipient: true } }, attachments: { orderBy: { uploadedAt: 'desc' } }, _count: { select: { invoices: true } } },
    orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
  })
  res.json(rows)
}))

router.get('/purchase-orders/:id', asyncRoute(async (req, res) => {
  const row = await req.prisma.purchaseOrder.findUnique({
    where: { id: req.params.id },
    include: { quotation: { include: { items: true } }, attachments: { orderBy: { uploadedAt: 'desc' } }, invoices: { select: { id: true, number: true, status: true, total: true } } },
  })
  if (!row) fail(404, 'Purchase Order tidak ditemukan.')
  res.json(row)
}))

router.post('/purchase-orders', asyncRoute(async (req, res) => {
  const body = req.body || {}
  const poNumber = docNumber(body.poNumber, 'Nomor PO')
  const date = dateValue(body.date, 'Tanggal PO')
  const receivedAt = optionalDate(body.receivedAt, 'Tanggal diterima') || new Date()
  const amount = body.amount == null || body.amount === '' ? null : new Prisma.Decimal(formatCents(parseCents(body.amount, 'Nilai PO')))
  const recipient = text(body.recipient, 'Nama customer', 250)
  const quotationId = body.quotationId || null
  const created = await req.prisma.$transaction(async (tx) => {
    let quotation = null
    if (quotationId) {
      quotation = await tx.quotation.findUnique({ where: { id: quotationId }, select: { id: true } })
      if (!quotation) fail(400, 'Quotation yang dipilih tidak ditemukan.')
    }
    return tx.purchaseOrder.create({ data: {
      poNumber, date, receivedAt, recipient, amount, quotationId,
      status: 'RECEIVED', source: 'MANUAL', notes: optionalText(body.notes),
    }, include: { quotation: { select: { id: true, number: true, recipient: true } }, attachments: true } })
  })
  res.status(201).json(created)
}))

router.post('/purchase-orders/import-legacy', asyncRoute(async (req, res) => {
  const entries = Array.isArray(req.body?.records) ? req.body.records : []
  if (entries.length > 500) fail(400, 'Maksimal 500 catatan Quick In per proses impor.')
  const results = []
  for (const record of entries) {
    try {
      const legacyLocalId = text(String(record?.id || ''), 'ID Quick In', 100)
      const poNumber = docNumber(record?.poNumber, 'Nomor PO')
      const existingLegacy = await req.prisma.purchaseOrder.findUnique({ where: { legacyLocalId } })
      if (existingLegacy) { results.push({ legacyLocalId, result: 'already-imported' }); continue }
      const existingNumber = await req.prisma.purchaseOrder.findUnique({ where: { poNumber }, select: { id: true } })
      if (existingNumber) { results.push({ legacyLocalId, result: 'duplicate-number' }); continue }
      const date = dateValue(record?.date, 'Tanggal PO')
      const linkedQuote = typeof record?.quotationId === 'string'
        ? await req.prisma.quotation.findUnique({ where: { id: record.quotationId }, select: { id: true, recipient: true } })
        : null
      const recipient = typeof record?.recipient === 'string' && record.recipient.trim()
        ? record.recipient.trim().slice(0, 250)
        : linkedQuote?.recipient || 'Customer belum tercatat'
      await req.prisma.purchaseOrder.create({ data: {
        poNumber,
        date,
        receivedAt: date,
        recipient,
        quotationId: linkedQuote?.id || null,
        status: 'RECEIVED',
        source: 'LEGACY_QUICK_IN',
        legacyLocalId,
        notes: optionalText(record?.notes) || 'Diimpor dari Quick In perangkat.',
      } })
      results.push({ legacyLocalId, result: 'imported', quotationLinked: Boolean(linkedQuote) })
    } catch (error) {
      results.push({ legacyLocalId: String(record?.id || ''), result: 'invalid', reason: error instanceof HttpError ? error.message : 'Catatan tidak valid.' })
    }
  }
  res.json({ imported: results.filter((item) => item.result === 'imported').length, results })
}))

router.patch('/purchase-orders/:id', asyncRoute(async (req, res) => {
  const body = req.body || {}
  const result = await req.prisma.$transaction(async (tx) => {
    const existing = await tx.purchaseOrder.findUnique({ where: { id: req.params.id }, include: { invoices: true } })
    if (!existing) fail(404, 'Purchase Order tidak ditemukan.')
    if (existing.status === 'CANCELLED') fail(409, 'Purchase Order yang dibatalkan tidak dapat diubah.')
    if (existing.invoices.some((invoice) => invoice.status !== 'CANCELLED')) fail(409, 'Purchase Order yang sudah memiliki invoice aktif tidak dapat diubah.')
    const quotationId = body.quotationId === undefined ? existing.quotationId : (body.quotationId || null)
    if (quotationId && !await tx.quotation.findUnique({ where: { id: quotationId }, select: { id: true } })) fail(400, 'Quotation yang dipilih tidak ditemukan.')
    const amount = body.amount === undefined ? existing.amount : (body.amount == null || body.amount === '' ? null : new Prisma.Decimal(formatCents(parseCents(body.amount, 'Nilai PO'))))
    return tx.purchaseOrder.update({ where: { id: existing.id }, data: {
      poNumber: docNumber(body.poNumber, 'Nomor PO'),
      date: dateValue(body.date, 'Tanggal PO'),
      receivedAt: optionalDate(body.receivedAt, 'Tanggal diterima') || existing.receivedAt,
      recipient: text(body.recipient, 'Nama customer', 250),
      amount,
      notes: body.notes === undefined ? existing.notes : optionalText(body.notes),
      quotationId,
    }, include: { quotation: { select: { id: true, number: true, recipient: true } }, attachments: true } })
  })
  res.json(result)
}))

router.patch('/purchase-orders/:id/cancel', asyncRoute(async (req, res) => {
  const reason = text(req.body?.reason, 'Alasan pembatalan', 500)
  const result = await req.prisma.$transaction(async (tx) => {
    const po = await tx.purchaseOrder.findUnique({ where: { id: req.params.id }, include: { invoices: true } })
    if (!po) fail(404, 'Purchase Order tidak ditemukan.')
    if (po.invoices.some((invoice) => invoice.status !== 'CANCELLED')) fail(409, 'Batalkan invoice terkait sebelum membatalkan Purchase Order.')
    if (po.status === 'CANCELLED') fail(409, 'Purchase Order sudah dibatalkan.')
    return tx.purchaseOrder.update({ where: { id: po.id }, data: { status: 'CANCELLED', notes: [po.notes, `Pembatalan: ${reason}`].filter(Boolean).join('\n') } })
  })
  res.json(result)
}))

router.post('/purchase-orders/:id/attachments', upload.single('file'), asyncRoute(async (req, res) => {
  const purchaseOrder = await req.prisma.purchaseOrder.findUnique({ where: { id: req.params.id }, include: { invoices: { select: { status: true } } } })
  if (!purchaseOrder) fail(404, 'Purchase Order tidak ditemukan.')
  if (purchaseOrder.status === 'CANCELLED') fail(409, 'Lampiran tidak dapat ditambahkan ke PO yang dibatalkan.')
  if (purchaseOrder.invoices.some((invoice) => invoice.status !== 'CANCELLED')) fail(409, 'PO dengan invoice aktif tidak dapat diubah.')
  const attachment = await saveAttachment(req.file, req.params.id, req.prisma.purchaseOrderAttachment, 'purchaseOrderId')
  res.status(201).json(attachment)
}))

router.delete('/purchase-orders/:id/attachments/:attachmentId', asyncRoute(async (req, res) => {
  const purchaseOrder = await req.prisma.purchaseOrder.findUnique({ where: { id: req.params.id }, include: { invoices: { select: { status: true } } } })
  if (!purchaseOrder) fail(404, 'Purchase Order tidak ditemukan.')
  if (purchaseOrder.invoices.some((invoice) => invoice.status !== 'CANCELLED')) fail(409, 'Lampiran PO dengan invoice aktif dipertahankan sebagai riwayat.')
  const record = await req.prisma.purchaseOrderAttachment.findFirst({ where: { id: req.params.attachmentId, purchaseOrderId: req.params.id } })
  if (!record) fail(404, 'Lampiran PO tidak ditemukan.')
  await deleteAttachment(record, req.prisma.purchaseOrderAttachment)
  res.status(204).end()
}))

router.get('/invoices', asyncRoute(async (req, res) => {
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : ''
  const from = optionalDate(req.query.from, 'Tanggal awal')
  const to = optionalDate(req.query.to, 'Tanggal akhir')
  if (from && to && from > to) fail(400, 'Rentang tanggal tidak valid.')
  const rows = await req.prisma.invoice.findMany({
    where: {
      ...(search ? { OR: [
        { number: { contains: search, mode: 'insensitive' } },
        { customerName: { contains: search, mode: 'insensitive' } },
        { purchaseOrder: { poNumber: { contains: search, mode: 'insensitive' } } },
        { quotation: { number: { contains: search, mode: 'insensitive' } } },
      ] } : {}),
      ...(from || to ? { issueDate: { ...(from ? { gte: from } : {}), ...(to ? { lte: new Date(`${to.toISOString().slice(0, 10)}T23:59:59.999Z`) } : {}) } } : {}),
    },
    include: invoiceInclude,
    orderBy: [{ createdAt: 'desc' }],
  })
  const status = typeof req.query.status === 'string' ? req.query.status : ''
  const result = rows.map((row) => derivedInvoice(row)).filter((row) => !status || row.status === status)
  res.json(result)
}))

router.get('/invoices/:id', asyncRoute(async (req, res) => {
  const invoice = await req.prisma.invoice.findUnique({ where: { id: req.params.id }, include: invoiceInclude })
  if (!invoice) fail(404, 'Invoice tidak ditemukan.')
  res.json(derivedInvoice(invoice))
}))

router.post('/invoices', asyncRoute(async (req, res) => {
  const invoice = await req.prisma.$transaction(async (tx) => {
    const sources = await resolveInvoiceSource(tx, req.body || {})
    const data = invoiceCreateData(req.body || {}, sources)
    const { items, ...invoiceData } = data
    return tx.invoice.create({
      data: {
        ...invoiceData,
        items: { create: items },
        statusHistory: { create: { fromStatus: null, toStatus: 'DRAFT', note: 'Invoice dibuat.' } },
      },
      include: invoiceInclude,
    })
  })
  res.status(201).json(derivedInvoice(invoice))
}))

router.put('/invoices/:id', asyncRoute(async (req, res) => {
  const invoice = await req.prisma.$transaction(async (tx) => {
    const existing = await tx.invoice.findUnique({ where: { id: req.params.id }, include: { payments: true } })
    if (!existing) fail(404, 'Invoice tidak ditemukan.')
    if (existing.status !== 'DRAFT') fail(409, 'Invoice yang sudah diterbitkan tidak dapat diedit. Buat invoice revisi untuk perubahan.')
    if (existing.payments.length) fail(409, 'Invoice dengan riwayat pembayaran tidak dapat diedit.')
    const sources = await resolveInvoiceSource(tx, req.body || {})
    const data = invoiceCreateData(req.body || {}, sources)
    const { items, ...invoiceData } = data
    return tx.invoice.update({ where: { id: existing.id }, data: {
      ...invoiceData,
      items: { deleteMany: {}, create: items },
      statusHistory: { create: { fromStatus: 'DRAFT', toStatus: 'DRAFT', note: 'Draft invoice diperbarui.' } },
    }, include: invoiceInclude })
  })
  res.json(derivedInvoice(invoice))
}))

router.patch('/invoices/:id/issue', asyncRoute(async (req, res) => {
  const invoice = await req.prisma.$transaction(async (tx) => {
    const existing = await tx.invoice.findUnique({ where: { id: req.params.id }, include: { items: true } })
    if (!existing) fail(404, 'Invoice tidak ditemukan.')
    if (existing.status !== 'DRAFT') fail(409, 'Hanya invoice Draft yang dapat diterbitkan.')
    if (existing.items.length === 0 || decimalCents(existing.total) <= 0n) fail(400, 'Invoice harus memiliki item dan total yang valid.')
    return tx.invoice.update({ where: { id: existing.id }, data: {
      status: 'ISSUED', issueDate: existing.issueDate || new Date(),
      statusHistory: { create: { fromStatus: 'DRAFT', toStatus: 'ISSUED', note: 'Invoice diterbitkan.' } },
    }, include: invoiceInclude })
  })
  res.json(derivedInvoice(invoice))
}))

router.patch('/invoices/:id/cancel', asyncRoute(async (req, res) => {
  const reason = text(req.body?.reason, 'Alasan pembatalan', 500)
  const invoice = await req.prisma.$transaction(async (tx) => {
    const existing = await tx.invoice.findUnique({ where: { id: req.params.id }, include: { payments: true } })
    if (!existing) fail(404, 'Invoice tidak ditemukan.')
    if (existing.status === 'CANCELLED') fail(409, 'Invoice sudah dibatalkan.')
    if (existing.payments.some((payment) => payment.status !== 'CANCELLED')) fail(409, 'Batalkan seluruh pembayaran sebelum membatalkan invoice.')
    return tx.invoice.update({ where: { id: existing.id }, data: {
      status: 'CANCELLED',
      statusHistory: { create: { fromStatus: existing.status, toStatus: 'CANCELLED', note: reason } },
    }, include: invoiceInclude })
  })
  res.json(derivedInvoice(invoice))
}))

router.get('/payments', asyncRoute(async (req, res) => {
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : ''
  const status = typeof req.query.status === 'string' ? req.query.status : ''
  const from = optionalDate(req.query.from, 'Tanggal awal')
  const to = optionalDate(req.query.to, 'Tanggal akhir')
  if (from && to && from > to) fail(400, 'Rentang tanggal tidak valid.')
  const rows = await req.prisma.payment.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(from || to ? { paymentDate: { ...(from ? { gte: from } : {}), ...(to ? { lte: new Date(`${to.toISOString().slice(0, 10)}T23:59:59.999Z`) } : {}) } } : {}),
      ...(search ? { OR: [
        { reference: { contains: search, mode: 'insensitive' } },
        { invoice: { number: { contains: search, mode: 'insensitive' } } },
        { invoice: { customerName: { contains: search, mode: 'insensitive' } } },
      ] } : {}),
    },
    include: { invoice: { select: { id: true, number: true, customerName: true, total: true, status: true } }, attachments: { orderBy: { uploadedAt: 'desc' } } },
    orderBy: [{ paymentDate: 'desc' }, { createdAt: 'desc' }],
  })
  res.json(rows)
}))

router.get('/payments/:id', asyncRoute(async (req, res) => {
  const payment = await req.prisma.payment.findUnique({
    where: { id: req.params.id },
    include: {
      invoice: { include: invoiceInclude },
      attachments: { orderBy: { uploadedAt: 'desc' } },
      history: { orderBy: { createdAt: 'asc' } },
    },
  })
  if (!payment) fail(404, 'Pembayaran tidak ditemukan.')
  res.json({ ...payment, invoice: derivedInvoice(payment.invoice) })
}))

router.post('/payments', asyncRoute(async (req, res) => {
  const body = req.body || {}
  const invoiceId = text(body.invoiceId, 'Invoice', 100)
  const amountCents = parseCents(body.amount, 'Nominal pembayaran')
  if (amountCents <= 0n) fail(400, 'Nominal pembayaran harus lebih dari nol.')
  const payment = await serializable(req.prisma, async (tx) => {
    const invoice = await tx.invoice.findUnique({ where: { id: invoiceId }, include: { payments: { select: { amount: true, status: true } } } })
    if (!invoice || invoice.status === 'DRAFT' || invoice.status === 'CANCELLED') fail(400, 'Pilih invoice yang sudah diterbitkan dan belum dibatalkan.')
    const balance = decimalCents(invoice.total) - verifiedCents(invoice.payments)
    if (balance <= 0n) fail(409, 'Invoice tidak memiliki sisa tagihan untuk menerima pembayaran.')
    if (amountCents > balance) fail(409, `Nominal melebihi sisa tagihan ${formatCents(balance)}.`)
    return tx.payment.create({ data: {
      invoiceId,
      amount: new Prisma.Decimal(formatCents(amountCents)),
      paymentDate: dateValue(body.paymentDate, 'Tanggal pembayaran'),
      method: text(body.method, 'Metode pembayaran', 50),
      reference: optionalText(body.reference, 150),
      notes: optionalText(body.notes),
      status: 'PENDING',
      history: { create: { fromStatus: null, toStatus: 'PENDING', note: 'Pembayaran dicatat dan menunggu verifikasi.' } },
    }, include: { invoice: { select: { id: true, number: true, customerName: true, total: true, status: true } }, attachments: true, history: true } })
  })
  res.status(201).json(payment)
}))

router.post('/payments/overpayment-case', asyncRoute(async (req, res) => {
  requireVerifier(req)
  const body = req.body || {}
  const invoiceId = text(body.invoiceId, 'Invoice', 100)
  const amountCents = parseCents(body.amount, 'Nominal pembayaran')
  if (amountCents <= 0n) fail(400, 'Nominal pembayaran harus lebih dari nol.')
  const reason = text(body.reason, 'Alasan peninjauan', 500)
  const payment = await serializable(req.prisma, async (tx) => {
    const invoice = await tx.invoice.findUnique({ where: { id: invoiceId }, include: { payments: { select: { amount: true, status: true } } } })
    if (!invoice || invoice.status !== 'ISSUED') fail(400, 'Kasus pembayaran hanya dapat dicatat untuk invoice yang sudah diterbitkan.')
    const balance = decimalCents(invoice.total) - verifiedCents(invoice.payments)
    if (amountCents <= balance) fail(400, 'Nominal masih dalam saldo tersedia. Gunakan formulir Catat Pembayaran biasa.')
    return tx.payment.create({ data: {
      invoiceId,
      amount: new Prisma.Decimal(formatCents(amountCents)),
      paymentDate: dateValue(body.paymentDate, 'Tanggal pembayaran'),
      method: text(body.method, 'Metode pembayaran', 50),
      reference: optionalText(body.reference, 150),
      notes: optionalText(body.notes),
      status: 'REVIEW_REQUIRED',
      history: { create: { fromStatus: null, toStatus: 'REVIEW_REQUIRED', note: reason } },
    }, include: { invoice: { select: { id: true, number: true, customerName: true, total: true, status: true } }, attachments: true, history: true } })
  })
  res.status(201).json(payment)
}))

router.patch('/payments/:id/verify', asyncRoute(async (req, res) => {
  requireVerifier(req)
  const payment = await serializable(req.prisma, async (tx) => {
    const current = await tx.payment.findUnique({ where: { id: req.params.id }, include: { invoice: { include: { payments: true } } } })
    if (!current) fail(404, 'Pembayaran tidak ditemukan.')
    if (current.status !== 'PENDING') fail(409, 'Hanya pembayaran Pending yang dapat diverifikasi.')
    if (current.invoice.status !== 'ISSUED') fail(409, 'Invoice belum diterbitkan atau sudah dibatalkan.')
    const paid = verifiedCents(current.invoice.payments)
    const balance = decimalCents(current.invoice.total) - paid
    const amount = decimalCents(current.amount)
    if (amount > balance) fail(409, `Pembayaran tidak dapat diverifikasi karena melebihi sisa tagihan ${formatCents(balance)}. Periksa sebagai kasus pembayaran berlebih.`)
    return tx.payment.update({ where: { id: current.id }, data: {
      status: 'VERIFIED', verifiedAt: new Date(),
      history: { create: { fromStatus: 'PENDING', toStatus: 'VERIFIED', note: 'Pembayaran diverifikasi.' } },
    }, include: { invoice: { select: { id: true, number: true, customerName: true, total: true, status: true } }, attachments: true, history: true } })
  })
  res.json(payment)
}))

router.patch('/payments/:id/cancel', asyncRoute(async (req, res) => {
  const reason = text(req.body?.reason, 'Alasan pembatalan', 500)
  const current = await req.prisma.payment.findUnique({ where: { id: req.params.id }, select: { id: true, status: true } })
  if (!current) fail(404, 'Pembayaran tidak ditemukan.')
  if (current.status === 'CANCELLED') fail(409, 'Pembayaran sudah dibatalkan.')
  if (current.status === 'VERIFIED' || current.status === 'REVIEW_REQUIRED') requireVerifier(req)
  const payment = await serializable(req.prisma, async (tx) => {
    const latest = await tx.payment.findUnique({ where: { id: current.id } })
    if (!latest || latest.status !== current.status) fail(409, 'Status pembayaran berubah. Muat ulang data.')
    return tx.payment.update({ where: { id: latest.id }, data: {
      status: 'CANCELLED', cancelledAt: new Date(), cancellationReason: reason,
      history: { create: { fromStatus: latest.status, toStatus: 'CANCELLED', note: reason } },
    }, include: { invoice: { select: { id: true, number: true, customerName: true, total: true, status: true } }, attachments: true, history: true } })
  })
  res.json(payment)
}))

router.post('/payments/:id/attachments', upload.single('file'), asyncRoute(async (req, res) => {
  const payment = await req.prisma.payment.findUnique({ where: { id: req.params.id }, select: { id: true, status: true } })
  if (!payment) fail(404, 'Pembayaran tidak ditemukan.')
  if (payment.status === 'CANCELLED') fail(409, 'Lampiran tidak dapat ditambahkan ke pembayaran yang dibatalkan.')
  const attachment = await saveAttachment(req.file, req.params.id, req.prisma.paymentAttachment, 'paymentId')
  res.status(201).json(attachment)
}))

router.delete('/payments/:id/attachments/:attachmentId', asyncRoute(async (req, res) => {
  const payment = await req.prisma.payment.findUnique({ where: { id: req.params.id }, select: { status: true } })
  if (!payment) fail(404, 'Pembayaran tidak ditemukan.')
  if (payment.status !== 'PENDING') fail(409, 'Lampiran pembayaran yang sudah diproses tidak dapat dihapus demi menjaga riwayat.')
  const attachment = await req.prisma.paymentAttachment.findFirst({ where: { id: req.params.attachmentId, paymentId: req.params.id } })
  if (!attachment) fail(404, 'Lampiran pembayaran tidak ditemukan.')
  await deleteAttachment(attachment, req.prisma.paymentAttachment)
  res.status(204).end()
}))

router.use((error, _req, res, _next) => {
  if (error instanceof multer.MulterError) return res.status(400).json({ error: error.code === 'LIMIT_FILE_SIZE' ? 'Ukuran file maksimal 10 MB.' : 'File tidak dapat diproses.' })
  if (error instanceof HttpError) return res.status(error.status).json({ error: error.message })
  console.error('Billing upload failed:', error?.code || error?.name || 'unknown error')
  return res.status(500).json({ error: 'Upload tidak berhasil. Silakan coba kembali.' })
})

function createBillingRouter() {
  return router
}

module.exports = { createBillingRouter }
