const express = require('express')
const { Prisma } = require('../generated/prisma')

const VALID_LETTER_TYPES = [
  'SURAT_PERMINTAAN_BARANG',
  'SURAT_PESANAN',
  'SURAT_PERJANJIAN_JUAL_BELI',
]

function sanitizeText(value, fallback = '', maxLength = 500) {
  if (typeof value !== 'string') return fallback
  return value.trim().slice(0, maxLength)
}

function parseIsoDateOrToday(value) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    const d = new Date(`${value.trim()}T00:00:00.000Z`)
    if (Number.isFinite(d.getTime())) return d
  }
  return new Date()
}

function computeSuratPesananAmount(payload) {
  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.items)) return null
  const subtotal = payload.items.reduce((sum, item) => {
    const qty = Math.max(0, Number(item?.jumlah || 0))
    const price = Math.max(0, Number(item?.harga || 0))
    return sum + qty * price
  }, 0)
  const total = payload.kenaPpn ? subtotal * 1.11 : subtotal
  if (!Number.isFinite(total) || total <= 0) return null
  return new Prisma.Decimal(total.toFixed(2))
}

function createLettersRouter() {
  const router = express.Router()

  router.get('/dashboard/summary', async (req, res) => {
    try {
      const today = new Date().toISOString().slice(0, 10)
      const [quotations, purchaseOrders, invoices, payments, letterCount] = await Promise.all([
        req.prisma.quotation.findMany({
          select: { status: true, followUpStatus: true, followUpDate: true },
        }),
        req.prisma.purchaseOrder.findMany({
          select: { status: true },
        }),
        req.prisma.invoice.findMany({
          select: {
            status: true,
            dueDate: true,
            total: true,
            payments: { select: { amount: true, status: true } },
          },
        }),
        req.prisma.payment.findMany({
          select: { status: true },
        }),
        req.prisma.letterDocument.count(),
      ])

      const quoteStats = {
        total: quotations.length,
        draft: quotations.filter((q) => q.status === 'Draft').length,
        sent: quotations.filter((q) => q.status === 'Sent').length,
        approved: quotations.filter((q) => q.status === 'Approved').length,
        followUp: quotations.filter(
          (q) =>
            q.status === 'Follow Up' ||
            q.followUpStatus === 'Jatuh tempo' ||
            Boolean(q.followUpDate && q.followUpDate < today && q.followUpStatus !== 'Selesai'),
        ).length,
      }
      quoteStats.followUpNeeded = quoteStats.followUp

      const poStats = {
        total: purchaseOrders.length,
        active: purchaseOrders.filter((p) => p.status === 'RECEIVED').length,
        completed: purchaseOrders.filter((p) => p.status === 'COMPLETED').length,
        cancelled: purchaseOrders.filter((p) => p.status === 'CANCELLED').length,
      }

      const invoiceStats = {
        total: invoices.length,
        draft: 0,
        issued: 0,
        partiallyPaid: 0,
        paid: 0,
        overdue: 0,
        cancelled: 0,
        reviewRequired: 0,
      }

      for (const inv of invoices) {
        if (inv.status === 'DRAFT') {
          invoiceStats.draft += 1
          continue
        }
        if (inv.status === 'CANCELLED') {
          invoiceStats.cancelled += 1
          continue
        }
        const totalNum = Number(inv.total || 0)
        const paidNum = (inv.payments || []).reduce(
          (sum, p) => (p.status === 'VERIFIED' ? sum + Number(p.amount || 0) : sum),
          0,
        )
        const balance = Number((totalNum - paidNum).toFixed(2))
        if (balance < 0) invoiceStats.reviewRequired += 1
        else if (balance === 0 && totalNum > 0) invoiceStats.paid += 1
        else if (inv.dueDate && inv.dueDate.toISOString().slice(0, 10) < today) invoiceStats.overdue += 1
        else if (paidNum > 0) invoiceStats.partiallyPaid += 1
        else invoiceStats.issued += 1
      }

      const pendingCount = payments.filter((p) => p.status === 'PENDING').length
      const paymentStats = {
        total: payments.length,
        pending: pendingCount,
        pendingVerification: pendingCount,
        verified: payments.filter((p) => p.status === 'VERIFIED').length,
        reviewRequired: payments.filter((p) => p.status === 'REVIEW_REQUIRED').length,
        cancelled: payments.filter((p) => p.status === 'CANCELLED').length,
      }

      res.json({
        quotations: quoteStats,
        purchaseOrders: poStats,
        invoices: invoiceStats,
        payments: paymentStats,
        letterDocuments: { total: letterCount },
      })
    } catch (error) {
      console.error('Dashboard summary error:', error?.code || error?.name || 'unknown')
      res.status(500).json({ error: 'Gagal memuat ringkasan dashboard.' })
    }
  })

  router.get('/letter-documents', async (req, res) => {
    try {
      const type = typeof req.query.type === 'string' ? req.query.type.trim() : ''
      if (type && !VALID_LETTER_TYPES.includes(type)) {
        return res.status(400).json({ error: 'Jenis surat tidak valid.' })
      }
      const rows = await req.prisma.letterDocument.findMany({
        where: type ? { type } : undefined,
        include: {
          purchaseOrder: {
            select: { id: true, poNumber: true, recipient: true, status: true, quotationId: true, amount: true },
          },
        },
        orderBy: { updatedAt: 'desc' },
      })
      res.json(rows.map((row) => ({ ...row, recipient: row.partyName })))
    } catch (error) {
      console.error('List letter-documents error:', error?.code || error?.name || 'unknown')
      res.status(500).json({ error: 'Gagal memuat daftar dokumen surat.' })
    }
  })

  router.get('/letter-documents/unified', async (req, res) => {
    try {
      const typeFilter = typeof req.query.type === 'string' ? req.query.type.trim() : ''
      const search = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : ''
      const statusFilter = typeof req.query.status === 'string' ? req.query.status.trim() : ''

      const [letterDocs, quotations] = await Promise.all([
        req.prisma.letterDocument.findMany({
          include: {
            purchaseOrder: {
              select: { id: true, poNumber: true, recipient: true, status: true, quotationId: true, amount: true },
            },
            template: {
              select: { id: true, name: true, fileFormat: true, originalFilename: true },
            },
          },
          orderBy: { updatedAt: 'desc' },
        }),
        req.prisma.quotation.findMany({
          orderBy: { updatedAt: 'desc' },
          include: {
            items: true,
            attachments: true,
            purchaseOrders: { select: { id: true, poNumber: true, status: true } },
            template: { select: { id: true, name: true, fileFormat: true, originalFilename: true } },
          },
        }),
      ])

      const TYPE_NAMES = {
        SURAT_PENAWARAN: 'Surat Penawaran',
        SURAT_PERMINTAAN_BARANG: 'Surat Permintaan Barang',
        SURAT_PESANAN: 'Surat Pesanan',
        SURAT_PERJANJIAN_JUAL_BELI: 'Surat Perjanjian Jual Beli',
      }

      const unifiedLetters = [
        ...quotations.map((q) => ({
          id: q.id,
          source: 'quotation',
          type: 'SURAT_PENAWARAN',
          typeName: TYPE_NAMES.SURAT_PENAWARAN,
          templateSlug: 'surat-penawaran',
          number: q.number,
          title: q.title || 'Surat Penawaran Harga',
          recipient: q.recipient,
          date: q.date,
          status: q.status || 'Draft',
          createdAt: q.createdAt,
          updatedAt: q.updatedAt,
          details: {
            senderCompany: q.senderCompany,
            itemCount: q.items ? q.items.length : 0,
            templateId: q.templateId,
            template: q.template,
            purchaseOrders: q.purchaseOrders,
            quotationType: q.type,
            followUpDate: q.followUpDate,
            followUpStatus: q.followUpStatus,
          },
          supportedFormats: ['pdf', 'xlsx', 'docx'],
          route: `/quotation/surat-penawaran?id=${q.id}${q.templateId ? `&templateId=${q.templateId}` : ''}`,
        })),
        ...letterDocs.map((doc) => ({
          id: doc.id,
          source: 'letterDocument',
          type: doc.type,
          typeName: TYPE_NAMES[doc.type] || doc.type,
          templateSlug:
            doc.type === 'SURAT_PERMINTAAN_BARANG'
              ? 'surat-permintaan-barang'
              : doc.type === 'SURAT_PESANAN'
                ? 'surat-pesanan'
                : 'surat-perjanjian-jual-beli',
          number: doc.number,
          title: doc.title,
          recipient: doc.partyName,
          date: doc.date,
          status: doc.status || 'Draft',
          createdAt: doc.createdAt,
          updatedAt: doc.updatedAt,
          details: {
            purchaseOrderId: doc.purchaseOrderId,
            purchaseOrder: doc.purchaseOrder,
            templateId: doc.templateId,
            template: doc.template,
          },
          supportedFormats: doc.template?.fileFormat === 'docx' ? ['pdf', 'docx'] : doc.template?.fileFormat === 'xlsx' ? ['pdf', 'xlsx'] : ['pdf'],
          route: `/quotation/${
            doc.type === 'SURAT_PERMINTAAN_BARANG'
              ? 'surat-permintaan-barang'
              : doc.type === 'SURAT_PESANAN'
                ? 'surat-pesanan'
                : 'surat-perjanjian-jual-beli'
          }?id=${doc.id}${doc.templateId ? `&templateId=${doc.templateId}` : ''}`,
        })),
      ]

      unifiedLetters.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())

      let filtered = unifiedLetters
      if (typeFilter) {
        filtered = filtered.filter((item) => item.type === typeFilter)
      }
      if (statusFilter) {
        filtered = filtered.filter((item) => item.status.toLowerCase() === statusFilter.toLowerCase())
      }
      if (search) {
        filtered = filtered.filter(
          (item) =>
            item.number.toLowerCase().includes(search) ||
            item.recipient.toLowerCase().includes(search) ||
            item.title.toLowerCase().includes(search) ||
            item.typeName.toLowerCase().includes(search),
        )
      }

      res.json(filtered)
    } catch (error) {
      console.error('List unified letters error:', error?.code || error?.name || 'unknown')
      res.status(500).json({ error: 'Gagal memuat daftar seluruh surat.' })
    }
  })

  router.get('/letter-documents/:id', async (req, res) => {
    try {
      const row = await req.prisma.letterDocument.findUnique({
        where: { id: req.params.id },
        include: {
          purchaseOrder: {
            select: { id: true, poNumber: true, recipient: true, status: true, quotationId: true, amount: true },
          },
          template: {
            select: { id: true, name: true, fileFormat: true, originalFilename: true },
          },
        },
      })
      if (!row) return res.status(404).json({ error: 'Dokumen surat tidak ditemukan.' })
      res.json({ ...row, recipient: row.partyName })
    } catch (error) {
      console.error('Get letter-document error:', error?.code || error?.name || 'unknown')
      res.status(500).json({ error: 'Gagal memuat dokumen surat.' })
    }
  })

  async function upsertLetterDocument(req, res, existingId = null) {
    try {
      const body = req.body || {}
      const type = sanitizeText(body.type, '', 60)
      if (!VALID_LETTER_TYPES.includes(type)) {
        return res.status(400).json({ error: 'Jenis dokumen surat tidak valid.' })
      }
      const number = sanitizeText(body.number, '', 100)
      const title = sanitizeText(body.title, '', 250)
      const partyName = sanitizeText(body.partyName || body.recipient, '', 250)
      const date = sanitizeText(body.date, new Date().toISOString().slice(0, 10), 60)
      if (!number || !title || !partyName) {
        return res.status(400).json({ error: 'Nomor surat, perihal/judul, dan nama pihak tujuan wajib diisi.' })
      }
      if (!body.payload || typeof body.payload !== 'object' || Array.isArray(body.payload)) {
        return res.status(400).json({ error: 'Data isi surat (payload) tidak valid.' })
      }

      const syncPO = Boolean(body.syncPurchaseOrder) && type === 'SURAT_PESANAN'
      const requestedPoId = typeof body.purchaseOrderId === 'string' && body.purchaseOrderId.trim() ? body.purchaseOrderId.trim() : null

      const status = sanitizeText(body.status, 'Draft', 50) || 'Draft'

      const saved = await req.prisma.$transaction(async (tx) => {
        let linkedPoId = requestedPoId

        if (syncPO) {
          const poNumber = number.toUpperCase()
          const poDate = parseIsoDateOrToday(body.poDate || date)
          const amount = computeSuratPesananAmount(body.payload)
          const quotationId =
            typeof body.quotationId === 'string' && body.quotationId.trim() ? body.quotationId.trim() : null

          if (linkedPoId) {
            const existingPo = await tx.purchaseOrder.findUnique({ where: { id: linkedPoId } })
            if (existingPo && existingPo.status !== 'CANCELLED') {
              await tx.purchaseOrder.update({
                where: { id: linkedPoId },
                data: {
                  poNumber,
                  recipient: partyName,
                  date: poDate,
                  amount,
                  ...(quotationId ? { quotationId } : {}),
                  notes: title,
                },
              })
            }
          } else {
            const byNumber = await tx.purchaseOrder.findUnique({ where: { poNumber } })
            if (byNumber) {
              linkedPoId = byNumber.id
              if (byNumber.status !== 'CANCELLED') {
                await tx.purchaseOrder.update({
                  where: { id: byNumber.id },
                  data: {
                    recipient: partyName,
                    date: poDate,
                    amount,
                    ...(quotationId ? { quotationId } : {}),
                    notes: title,
                  },
                })
              }
            } else {
              const createdPo = await tx.purchaseOrder.create({
                data: {
                  poNumber,
                  date: poDate,
                  receivedAt: poDate,
                  recipient: partyName,
                  amount,
                  quotationId,
                  status: 'RECEIVED',
                  source: 'SURAT_PESANAN',
                  notes: title,
                },
              })
              linkedPoId = createdPo.id
            }
          }
        }

        const templateId = typeof body.templateId === 'string' && body.templateId.trim() ? body.templateId.trim() : null

        const data = {
          type,
          number,
          title,
          partyName,
          date,
          status,
          payload: body.payload,
          purchaseOrderId: linkedPoId,
          ...(templateId !== undefined ? { templateId } : {}),
        }

        if (existingId) {
          return tx.letterDocument.update({
            where: { id: existingId },
            data,
            include: {
              purchaseOrder: {
                select: { id: true, poNumber: true, recipient: true, status: true, quotationId: true, amount: true },
              },
              template: {
                select: { id: true, name: true, fileFormat: true, originalFilename: true },
              },
            },
          })
        }

        return tx.letterDocument.create({
          data,
          include: {
            purchaseOrder: {
              select: { id: true, poNumber: true, recipient: true, status: true, quotationId: true, amount: true },
            },
            template: {
              select: { id: true, name: true, fileFormat: true, originalFilename: true },
            },
          },
        })
      })

      return res.status(existingId ? 200 : 201).json({ ...saved, recipient: saved.partyName })
    } catch (error) {
      if (error?.code === 'P2025') {
        return res.status(404).json({ error: 'Dokumen surat tidak ditemukan.' })
      }
      if (error?.code === 'P2002') {
        return res.status(409).json({ error: 'Nomor PO pada Surat Pesanan sudah digunakan oleh PO lain.' })
      }
      console.error('Save letter-document error:', error?.code || error?.name || 'unknown')
      return res.status(500).json({ error: 'Gagal menyimpan dokumen surat.' })
    }
  }

  router.post('/letter-documents', (req, res) => upsertLetterDocument(req, res, null))
  router.put('/letter-documents/:id', (req, res) => upsertLetterDocument(req, res, req.params.id))

  router.delete('/letter-documents/:id', async (req, res) => {
    try {
      if (req.user && req.user.role !== 'ADMIN') {
        return res.status(403).json({ error: 'Akses ditolak: hanya administrator yang dapat menghapus dokumen surat.' })
      }
      await req.prisma.letterDocument.delete({ where: { id: req.params.id } })
      return res.status(204).end()
    } catch (error) {
      if (error?.code === 'P2025') {
        return res.status(404).json({ error: 'Dokumen surat tidak ditemukan.' })
      }
      return res.status(500).json({ error: 'Gagal menghapus dokumen surat.' })
    }
  })

  return router
}

module.exports = { createLettersRouter }
