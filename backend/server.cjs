const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '.env') })
const express = require('express')
const cors = require('cors')
const multer = require('multer')
const fs = require('fs')
const crypto = require('crypto')
const { PrismaClient } = require('./generated/prisma')
const { createBillingRouter } = require('./modules/billing.cjs')
const { createAuthRouter, requireAuth, requireRole, validateProductionAuthConfig } = require('./modules/auth.cjs')
const { createLettersRouter } = require('./modules/letters.cjs')
const { createLetterTemplatesRouter } = require('./modules/letterTemplates.cjs')

const app = express()
const prisma = new PrismaClient()
const PORT = Number(process.env.PORT || 3001)
const QUOTATION_STATUSES = ['Draft', 'Sent', 'Follow Up', 'Approved', 'Rejected', 'Revised']
const configuredOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)
const allowedOrigins = configuredOrigins.length
  ? configuredOrigins
  : ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:4173', 'http://127.0.0.1:4173', 'http://localhost:3000', 'http://127.0.0.1:3000']
if (process.env.NODE_ENV === 'production' && configuredOrigins.length === 0) {
  throw new Error('CORS_ORIGINS must be configured with the deployed frontend origin in production.')
}
if (process.env.NODE_ENV === 'production') {
  validateProductionAuthConfig()
}

const UPLOAD_DIR = path.join(__dirname, 'uploads')
fs.mkdirSync(UPLOAD_DIR, { recursive: true })

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true)
    return callback(null, false)
  },
  credentials: true,
}))
app.use(express.json({ limit: '25mb' }))
app.use(express.urlencoded({ extended: true, limit: '25mb' }))

app.get('/uploads/:filename', requireAuth({ allowQueryToken: true }), async (req, res) => {
  try {
    const rawName = String(req.params.filename || '')
    const safeName = path.basename(rawName)
    if (!safeName || safeName !== rawName || !/^[a-zA-Z0-9._-]+$/.test(safeName)) {
      return res.status(400).json({ error: 'Nama file tidak valid.' })
    }
    const resolvedDir = path.resolve(UPLOAD_DIR)
    const resolvedPath = path.resolve(UPLOAD_DIR, safeName)
    if (!resolvedPath.startsWith(resolvedDir + path.sep)) {
      return res.status(400).json({ error: 'Akses file di luar direktori tidak diizinkan.' })
    }

    const [qAtt, poAtt, payAtt, asset, letterTpl] = await Promise.all([
      prisma.quotationAttachment.findFirst({ where: { filename: safeName } }),
      prisma.purchaseOrderAttachment.findFirst({ where: { filename: safeName } }),
      prisma.paymentAttachment.findFirst({ where: { filename: safeName } }),
      prisma.asset.findFirst({ where: { filename: safeName } }),
      prisma.letterTemplate.findFirst({ where: { storedFilename: safeName } }),
    ])
    const record =
      qAtt ||
      poAtt ||
      payAtt ||
      asset ||
      (letterTpl ? { name: letterTpl.originalFilename, mimeType: letterTpl.mimeType } : null)
    if (!record) {
      return res.status(404).json({ error: 'File lampiran tidak ditemukan.' })
    }

    await fs.promises.access(resolvedPath, fs.constants.R_OK)
    const downloadName = path.basename(record.name || safeName).replace(/["\r\n]/g, '_')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Content-Security-Policy', 'sandbox')
    res.setHeader('Cache-Control', 'private, no-store')
    res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`)
    if (record.mimeType) res.type(record.mimeType)
    return res.sendFile(resolvedPath)
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return res.status(404).json({ error: 'File tidak ditemukan di penyimpanan.' })
    }
    return sendServerError(res, error)
  }
})

app.use('/uploads', (_req, res) => {
  return res.status(400).json({ error: 'Path file tidak valid.' })
})

function reqType(value) {
  return ['signature', 'stamp'].includes(value) ? value : null
}

function normalizeStatus(value, fallback = 'Draft') {
  return QUOTATION_STATUSES.includes(value) ? value : fallback
}

function normalizeType(value, fallback = 'Barang & Jasa') {
  const validTypes = ['Barang', 'Jasa', 'Barang & Jasa']
  return validTypes.includes(value) ? value : fallback
}

function safeString(value, fallback = '') {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (typeof value !== 'string') return fallback
  return value
}

function validDateOnly(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

function computeValidUntil(dateStr, validityDaysStr) {
  if (!validDateOnly(dateStr)) return null
  const days = Number.parseInt(String(validityDaysStr || '30'), 10)
  if (!Number.isFinite(days) || days < 0 || days > 36500) return null
  const base = new Date(`${dateStr}T00:00:00.000Z`)
  base.setUTCDate(base.getUTCDate() + days)
  return base.toISOString().slice(0, 10)
}

function sendServerError(res, error) {
  if (error?.status === 400) return res.status(400).json({ error: error.message })
  if (error?.status === 413 || error?.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Ukuran data dokumen atau gambar tanda tangan/stempel terlalu besar.' })
  }
  if (error?.code === 'P2002') return res.status(409).json({ error: 'Nomor quotation sudah digunakan.' })
  if (error?.code === 'P2025') return res.status(404).json({ error: 'Dokumen tidak ditemukan.' })
  if (error?.code === 'P2023') return res.status(400).json({ error: 'ID dokumen tidak valid.' })
  console.error('API request failed:', error?.code || error?.name || 'unknown error')
  return res.status(500).json({ error: 'Terjadi kesalahan server. Silakan coba kembali.' })
}

function badRequest(message) {
  const error = new Error(message)
  error.status = 400
  throw error
}

function isUniqueConstraintViolation(error) {
  return Boolean(error && typeof error === 'object' && error.code === 'P2002')
}

function buildItemPayload(item, index) {
  const quantity = Number(item?.quantity)
  const unitPrice = Number(item?.unitPrice)
  const discount = Number(item?.discount ?? 0)
  const taxRate = Number(item?.taxRate ?? 0)
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 1000000) badRequest(`Jumlah item ${index + 1} harus bilangan bulat positif.`)
  if (![unitPrice, discount, taxRate].every(Number.isFinite) || unitPrice < 0 || discount < 0 || taxRate < 0 || taxRate > 1000) badRequest(`Harga, diskon, atau pajak item ${index + 1} tidak valid.`)
  const subtotalBase = quantity * unitPrice - discount
  if (!Number.isFinite(subtotalBase) || discount > quantity * unitPrice) badRequest(`Diskon item ${index + 1} tidak boleh melebihi nilai item.`)
  const subtotal = subtotalBase + Math.max(0, subtotalBase * (taxRate / 100))

  return {
    description: safeString(item?.description, `Item ${index + 1}`).trim() || `Item ${index + 1}`,
    quantity,
    unit: safeString(item?.unit, 'pcs').trim() || 'pcs',
    unitPrice,
    discount,
    taxRate,
    subtotal,
  }
}

function buildQuotationPayload(body, existing = null) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) badRequest('Isi quotation tidak valid.')
  const items = Array.isArray(body?.items) ? body.items : []
  if (items.length > 500) badRequest('Quotation maksimal memiliki 500 item.')
  const number = safeString(body?.number ?? existing?.number, '').trim()
  const recipient = safeString(body?.recipient ?? existing?.recipient, '').trim()
  const date = safeString(body?.date ?? existing?.date, '').trim()
  if (!number || number.length > 100) badRequest('Nomor quotation wajib diisi (maksimal 100 karakter).')
  if (!recipient || recipient.length > 250) badRequest('Nama penerima wajib diisi (maksimal 250 karakter).')
  if (!validDateOnly(date)) {
    badRequest('Tanggal quotation harus berupa tanggal kalender yang valid (YYYY-MM-DD).')
  }
  if (body.status != null && !QUOTATION_STATUSES.includes(body.status)) badRequest('Status quotation tidak valid.')
  if (body.type != null && !['Barang', 'Jasa', 'Barang & Jasa'].includes(body.type)) badRequest('Jenis quotation tidak valid.')
  const taxRate = Number(body.taxRate ?? existing?.taxRate ?? 0)
  const taxManualAmount = Number(body.taxManualAmount ?? existing?.taxManualAmount ?? 0)
  if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 1000 || !Number.isFinite(taxManualAmount) || taxManualAmount < 0) {
    badRequest('Nilai pajak quotation tidak valid.')
  }
  for (const [key, label] of [['validUntil', 'Tanggal berlaku'], ['followUpDate', 'Tanggal tindak lanjut']]) {
    const value = body[key]
    if (value != null && value !== '' && !validDateOnly(value)) {
      badRequest(`${label} tidak valid.`)
    }
  }

  const validityDays = safeString(body?.validityDays ?? existing?.validityDays, '30').trim() || '30'
  const explicitValidUntil = body?.validUntil !== undefined ? (safeString(body.validUntil, '').trim() || null) : undefined
  const computedValidUntil = computeValidUntil(date, validityDays)
  const validUntil =
    explicitValidUntil !== undefined
      ? (explicitValidUntil || computedValidUntil)
      : (existing?.validUntil || computedValidUntil)

  return {
    recipient,
    address: body?.address !== undefined ? safeString(body.address, '').trim() : (existing?.address ?? ''),
    city: body?.city !== undefined ? safeString(body.city, '').trim() : (existing?.city ?? ''),
    date,
    number,
    validityDays,
    senderCompany: body?.senderCompany !== undefined ? (safeString(body.senderCompany, 'PT Luma').trim() || 'PT Luma') : (existing?.senderCompany || 'PT Luma'),
    introduction: body?.introduction !== undefined ? safeString(body.introduction, '').trim() : (existing?.introduction ?? ''),
    signer: body?.signer !== undefined ? safeString(body.signer, '').trim() : (existing?.signer ?? ''),
    position: body?.position !== undefined ? safeString(body.position, '').trim() : (existing?.position ?? ''),
    email: body?.email !== undefined ? safeString(body.email, '').trim() : (existing?.email ?? ''),
    phone: body?.phone !== undefined ? safeString(body.phone, '').trim() : (existing?.phone ?? ''),
    taxEnabled: body?.taxEnabled !== undefined ? Boolean(body.taxEnabled) : Boolean(existing?.taxEnabled ?? true),
    taxMode: body?.taxMode !== undefined ? (safeString(body.taxMode, 'manual').trim() || 'manual') : (existing?.taxMode || 'manual'),
    taxRate,
    taxManualAmount,
    signatureImage: body?.signatureImage !== undefined ? (safeString(body.signatureImage, '').trim() || null) : (existing?.signatureImage ?? null),
    stampImage: body?.stampImage !== undefined ? (safeString(body.stampImage, '').trim() || null) : (existing?.stampImage ?? null),
    type: body?.type !== undefined ? normalizeType(body.type) : (existing?.type || 'Barang & Jasa'),
    status: body?.status !== undefined ? normalizeStatus(body.status) : (existing?.status || 'Draft'),
    title: body?.title !== undefined ? (safeString(body.title, '').trim() || null) : (existing?.title ?? null),
    validUntil,
    notes: body?.notes !== undefined ? (safeString(body.notes, '').trim() || null) : (existing?.notes ?? null),
    followUpDate: body?.followUpDate !== undefined ? (safeString(body.followUpDate, '').trim() || null) : (existing?.followUpDate ?? null),
    followUpStatus: body?.followUpStatus !== undefined ? (safeString(body.followUpStatus, 'Belum dijadwalkan').trim() || 'Belum dijadwalkan') : (existing?.followUpStatus || 'Belum dijadwalkan'),
    followUpNotes: body?.followUpNotes !== undefined ? (safeString(body.followUpNotes, '').trim() || null) : (existing?.followUpNotes ?? null),
    templateId:
      body?.templateId !== undefined
        ? (typeof body.templateId === 'string' && body.templateId.trim() ? body.templateId.trim() : null)
        : (existing?.templateId ?? null),
    items: items.map(buildItemPayload),
  }
}

const assetStorage = multer.memoryStorage()

const quoteUpload = multer({
  storage: assetStorage,
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    const allowed = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
    if (!allowed.includes(file.mimetype)) {
      const error = new Error('File tidak didukung. Gunakan PDF, DOCX, XLSX, PNG, JPG, atau WEBP.')
      error.status = 400
      callback(error)
      return
    }
    callback(null, true)
  },
})

const assetUpload = multer({
  storage: assetStorage,
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    const allowed = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf']
    if (!allowed.includes(file.mimetype)) {
      const error = new Error('File harus PNG, JPG, WEBP, atau PDF')
      error.status = 400
      callback(error)
      return
    }
    callback(null, true)
  },
})

const uploadExtensions = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
}

function uploadSignatureIsValid(file) {
  const bytes = file?.buffer
  if (!bytes?.length) return false
  switch (file.mimetype) {
    case 'image/png': return bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    case 'image/jpeg': return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
    case 'image/webp': return bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP'
    case 'application/pdf': return bytes.subarray(0, 5).toString() === '%PDF-'
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': return bytes.subarray(0, 2).toString() === 'PK'
    default: return false
  }
}

async function persistUpload(file) {
  if (!uploadSignatureIsValid(file)) badRequest('Isi file tidak sesuai dengan tipe yang diizinkan.')
  const filename = `${crypto.randomUUID()}${uploadExtensions[file.mimetype]}`
  await fs.promises.mkdir(UPLOAD_DIR, { recursive: true })
  const filePath = path.join(UPLOAD_DIR, filename)
  await fs.promises.writeFile(filePath, file.buffer, { flag: 'wx' })
  return { filename, filePath }
}

const quotationInclude = {
  items: true,
  attachments: true,
  purchaseOrders: { select: { id: true, poNumber: true, status: true } },
  template: { select: { id: true, name: true, fileFormat: true, originalFilename: true } },
}

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    authRequired: true,
    paymentVerificationConfigured: Boolean(process.env.PAYMENT_VERIFICATION_TOKEN),
  })
})

app.use('/api/auth', createAuthRouter())
app.use('/api', requireAuth())

app.get('/api/quotations', async (_req, res) => {
  try {
    const quotations = await prisma.quotation.findMany({
      include: quotationInclude,
      orderBy: { createdAt: 'desc' },
    })

    res.json(quotations)
  } catch (error) {
    sendServerError(res, error)
  }
})

app.get('/api/quotations/:id', async (req, res) => {
  try {
    const quotation = await prisma.quotation.findUnique({
      where: { id: req.params.id },
      include: quotationInclude,
    })

    if (!quotation) {
      return res.status(404).json({ error: 'Quotation tidak ditemukan' })
    }

    res.json(quotation)
  } catch (error) {
    sendServerError(res, error)
  }
})

app.post('/api/quotations', async (req, res) => {
  try {
    const payload = buildQuotationPayload(req.body)

    if (!payload.number) {
      return res.status(400).json({ error: 'Nomor quotation wajib diisi' })
    }

    const quotation = await prisma.quotation.create({
      data: {
        ...payload,
        items: {
          create: payload.items,
        },
      },
      include: quotationInclude,
    })

    res.status(201).json(quotation)
  } catch (error) {
    if (isUniqueConstraintViolation(error)) {
      return res.status(409).json({ error: 'Nomor quotation sudah digunakan.' })
    }
    sendServerError(res, error)
  }
})

app.put('/api/quotations/:id', async (req, res) => {
  try {
    const existing = await prisma.quotation.findUnique({
      where: { id: req.params.id },
    })
    if (!existing) {
      return res.status(404).json({ error: 'Quotation tidak ditemukan.' })
    }

    const payload = buildQuotationPayload(req.body, existing)

    const quotation = await prisma.quotation.update({
      where: { id: req.params.id },
      data: {
        ...payload,
        items: {
          deleteMany: {},
          create: payload.items,
        },
      },
      include: quotationInclude,
    })

    res.json(quotation)
  } catch (error) {
    if (isUniqueConstraintViolation(error)) {
      return res.status(409).json({ error: 'Nomor quotation sudah digunakan.' })
    }
    sendServerError(res, error)
  }
})

app.patch('/api/quotations/:id/status', async (req, res) => {
  const { status } = req.body ?? {}
  if (!QUOTATION_STATUSES.includes(status)) {
    return res.status(400).json({ error: 'Status transaksi tidak valid.' })
  }

  try {
    const quotation = await prisma.quotation.update({
      where: { id: req.params.id },
      data: { status },
      select: { id: true, number: true, status: true, updatedAt: true },
    })
    res.json(quotation)
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'P2025') {
      return res.status(404).json({ error: 'Quotation tidak ditemukan.' })
    }
    sendServerError(res, error)
  }
})

app.delete('/api/quotations/:id', requireRole('ADMIN'), async (req, res) => {
  try {
    const existing = await prisma.quotation.findUnique({
      where: { id: req.params.id },
      include: {
        attachments: true,
        purchaseOrders: { select: { id: true, status: true } },
        invoices: { select: { id: true, status: true } },
      },
    })
    if (!existing) {
      return res.status(404).json({ error: 'Quotation tidak ditemukan' })
    }
    if (existing.purchaseOrders.some((po) => po.status !== 'CANCELLED') || existing.invoices.some((inv) => inv.status !== 'CANCELLED')) {
      return res.status(409).json({ error: 'Quotation yang sudah memiliki PO atau Invoice aktif tidak dapat dihapus.' })
    }

    await prisma.quotation.delete({
      where: { id: req.params.id },
    })

    await Promise.all(
      existing.attachments.map((att) =>
        fs.promises.unlink(path.join(UPLOAD_DIR, path.basename(att.filename))).catch((cleanupError) => {
          if (cleanupError.code !== 'ENOENT') console.error('Quotation attachment cleanup failed:', cleanupError.code || cleanupError.name)
        }),
      ),
    )

    res.status(204).end()
  } catch (error) {
    sendServerError(res, error)
  }
})

app.post('/api/quotations/:id/attachments', quoteUpload.single('file'), async (req, res) => {
  let savedFile
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'File lampiran wajib dipilih' })
    }

    const quotation = await prisma.quotation.findUnique({ where: { id: req.params.id } })
    if (!quotation) {
      return res.status(404).json({ error: 'Quotation tidak ditemukan' })
    }

    savedFile = await persistUpload(req.file)
    const attachment = await prisma.quotationAttachment.create({
      data: {
        quotationId: req.params.id,
        name: path.basename(req.file.originalname || 'lampiran').slice(0, 250),
        filename: savedFile.filename,
        mimeType: req.file.mimetype,
        size: req.file.size,
        url: `/uploads/${savedFile.filename}`,
      },
    })

    res.status(201).json(attachment)
  } catch (error) {
    if (savedFile) await fs.promises.unlink(savedFile.filePath).catch(() => {})
    sendServerError(res, error)
  }
})

app.get('/api/quotations/:id/attachments', async (req, res) => {
  try {
    const attachments = await prisma.quotationAttachment.findMany({
      where: { quotationId: req.params.id },
      orderBy: { uploadedAt: 'desc' },
    })

    res.json(attachments)
  } catch (error) {
    sendServerError(res, error)
  }
})

app.delete('/api/quotations/:id/attachments/:attachmentId', async (req, res) => {
  try {
    const attachment = await prisma.quotationAttachment.findFirst({
      where: { id: req.params.attachmentId, quotationId: req.params.id },
    })

    if (!attachment) {
      return res.status(404).json({ error: 'Lampiran tidak ditemukan' })
    }

    const filePath = path.join(UPLOAD_DIR, path.basename(attachment.filename))
    await prisma.quotationAttachment.delete({
      where: { id: req.params.attachmentId },
    })
    await fs.promises.unlink(filePath).catch((cleanupError) => {
      if (cleanupError.code !== 'ENOENT') console.error('Attachment file cleanup failed:', cleanupError.code || cleanupError.name)
    })

    res.status(204).end()
  } catch (error) {
    sendServerError(res, error)
  }
})

app.get('/api/assets', async (req, res) => {
  try {
    const type = reqType(req.query.type)
    const assets = await prisma.asset.findMany({
      where: type ? { type } : undefined,
      orderBy: { createdAt: 'desc' },
    })

    res.json(assets)
  } catch (error) {
    sendServerError(res, error)
  }
})

app.post('/api/assets', assetUpload.single('file'), async (req, res) => {
  let savedFile
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'File gambar wajib dipilih' })
    }

    const type = reqType(req.body.type)
    if (!type) return res.status(400).json({ error: 'Jenis asset tidak valid' })

    savedFile = await persistUpload(req.file)

    const asset = {
      id: crypto.randomUUID(),
      name: req.file.originalname,
      type,
      filename: savedFile.filename,
      url: `/uploads/${savedFile.filename}`,
    }

    const saved = await prisma.asset.create({ data: asset })
    res.status(201).json(saved)
  } catch (error) {
    if (savedFile) await fs.promises.unlink(savedFile.filePath).catch(() => {})
    sendServerError(res, error)
  }
})

app.delete('/api/assets/:id', requireRole('ADMIN'), async (req, res) => {
  try {
    const asset = await prisma.asset.findUnique({ where: { id: req.params.id } })
    if (!asset) {
      return res.status(404).json({ error: 'Aset tidak ditemukan' })
    }

    await prisma.asset.delete({ where: { id: req.params.id } })
    const filePath = path.join(UPLOAD_DIR, path.basename(asset.filename))
    await fs.promises.unlink(filePath).catch((cleanupError) => {
      if (cleanupError.code !== 'ENOENT') console.error('Asset file cleanup failed:', cleanupError.code || cleanupError.name)
    })
    res.status(204).end()
  } catch (error) {
    sendServerError(res, error)
  }
})

app.use('/api', (req, _res, next) => {
  req.prisma = prisma
  next()
}, createLettersRouter(), createLetterTemplatesRouter(), createBillingRouter())

app.use((error, _req, res, _next) => {
  if (error instanceof multer.MulterError) {
    return res.status(400).json({ error: error.code === 'LIMIT_FILE_SIZE' ? 'Ukuran file maksimal 10 MB.' : 'File tidak dapat diproses.' })
  }
  if (error?.status === 413 || error?.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Ukuran data dokumen atau gambar tanda tangan/stempel terlalu besar.' })
  }
  if (error?.status === 400) {
    return res.status(400).json({
      error: error.type === 'entity.parse.failed' ? 'Format data JSON tidak valid.' : error.message,
    })
  }
  console.error('Request failed:', error?.code || error?.name || 'unknown error')
  return res.status(500).json({ error: 'Terjadi kesalahan server. Silakan coba kembali.' })
})

app.listen(PORT, (error) => {
  if (error) {
    if (error.code === 'EADDRINUSE') {
      console.error(`Gagal menjalankan backend: Port ${PORT} sedang digunakan oleh proses lain. Hentikan proses yang menggunakan port ${PORT} terlebih dahulu.`)
    } else {
      console.error('Gagal menjalankan backend:', error.message || error)
    }
    process.exit(1)
  }
  console.log(`Backend berjalan di http://localhost:${PORT}`)
  console.log(`Health check: http://localhost:${PORT}/api/health`)
})

process.on('SIGINT', async () => {
  await prisma.$disconnect()
  process.exit(0)
})
