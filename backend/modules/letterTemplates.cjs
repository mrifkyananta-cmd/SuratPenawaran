const express = require('express')
const multer = require('multer')
const crypto = require('crypto')
const fs = require('fs/promises')
const path = require('path')

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads')

const ALLOWED_LETTER_TYPES = [
  'SURAT_PENAWARAN',
  'SURAT_PERMINTAAN_BARANG',
  'SURAT_PESANAN',
  'SURAT_PERJANJIAN_JUAL_BELI',
]

const ALLOWED_EXTENSIONS = {
  '.docx': {
    format: 'docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    validate(buf) {
      // ZIP magic bytes PK\x03\x04
      return buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4B && buf[2] === 0x03 && buf[3] === 0x04
    },
  },
  '.xlsx': {
    format: 'xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    validate(buf) {
      // ZIP magic bytes PK\x03\x04
      return buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4B && buf[2] === 0x03 && buf[3] === 0x04
    },
  },
  '.pdf': {
    format: 'pdf',
    mimeType: 'application/pdf',
    validate(buf) {
      // %PDF magic bytes
      return buf.length >= 4 && buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46
    },
  },
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 }, // max 10MB
})

function sanitizeFilename(originalName) {
  const base = path.basename(originalName || 'template')
  return base.replace(/[^a-zA-Z0-9._-]/g, '_')
}

function createLetterTemplatesRouter() {
  const router = express.Router()

  // 1. GET /letter-templates - Ambil daftar template
  router.get('/letter-templates', async (req, res) => {
    try {
      const { letterType, includeInactive } = req.query
      const where = {}

      if (letterType && ALLOWED_LETTER_TYPES.includes(String(letterType))) {
        where.letterType = String(letterType)
      }

      if (includeInactive !== 'true') {
        where.isActive = true
      }

      const templates = await req.prisma.letterTemplate.findMany({
        where,
        orderBy: { createdAt: 'desc' },
      })

      return res.json(templates)
    } catch (error) {
      console.error('Failed to list letter templates:', error)
      return res.status(500).json({ error: 'Gagal memuat daftar template surat.' })
    }
  })

  // 2. GET /letter-templates/:id - Ambil detail template
  router.get('/letter-templates/:id', async (req, res) => {
    try {
      const template = await req.prisma.letterTemplate.findUnique({
        where: { id: req.params.id },
      })

      if (!template) {
        return res.status(404).json({ error: 'Template surat tidak ditemukan.' })
      }

      return res.json(template)
    } catch (error) {
      console.error('Failed to get letter template:', error)
      return res.status(500).json({ error: 'Gagal mengambil data template.' })
    }
  })

  // 3. GET /letter-templates/:id/download - Unduh file template
  router.get('/letter-templates/:id/download', async (req, res) => {
    try {
      const template = await req.prisma.letterTemplate.findUnique({
        where: { id: req.params.id },
      })

      if (!template) {
        return res.status(404).json({ error: 'Template surat tidak ditemukan.' })
      }

      const safeName = path.basename(template.storedFilename)
      const resolvedDir = path.resolve(UPLOAD_DIR)
      const resolvedPath = path.resolve(UPLOAD_DIR, safeName)

      if (!resolvedPath.startsWith(resolvedDir + path.sep)) {
        return res.status(400).json({ error: 'Akses path tidak diizinkan.' })
      }

      await fs.access(resolvedPath)

      const downloadName = sanitizeFilename(template.originalFilename || `${template.name}.${template.fileFormat}`)
      res.setHeader('X-Content-Type-Options', 'nosniff')
      res.setHeader('Content-Security-Policy', 'sandbox')
      res.setHeader('Cache-Control', 'private, no-store')
      res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`)
      if (template.mimeType) res.type(template.mimeType)

      return res.sendFile(resolvedPath)
    } catch (error) {
      if (error?.code === 'ENOENT') {
        return res.status(404).json({ error: 'File template fisik tidak ditemukan di penyimpanan server.' })
      }
      console.error('Download template error:', error)
      return res.status(500).json({ error: 'Gagal mengunduh file template.' })
    }
  })

  // 4. POST /letter-templates - Upload & simpan template baru
  router.post('/letter-templates', upload.single('file'), async (req, res) => {
    let savedFilePath = null
    try {
      const { name, letterType, description } = req.body

      // Validasi nama template
      if (!name || typeof name !== 'string' || name.trim().length < 3 || name.trim().length > 100) {
        return res.status(400).json({ error: 'Nama template wajib diisi (minimal 3 dan maksimal 100 karakter).' })
      }

      // Validasi jenis surat
      if (!letterType || !ALLOWED_LETTER_TYPES.includes(String(letterType).trim())) {
        return res.status(400).json({
          error: 'Jenis surat wajib dipilih dari kategori resmi: Surat Penawaran, Surat Permintaan Barang, Surat Pesanan, atau Surat Perjanjian Jual Beli.',
        })
      }

      // Validasi file
      const file = req.file
      if (!file || !file.buffer || file.buffer.length === 0) {
        return res.status(400).json({ error: 'File template wajib dipilih melalui Choose File.' })
      }

      if (file.buffer.length < 16) {
        return res.status(400).json({ error: 'File template kosong atau rusak.' })
      }

      // Cek ekstensi file
      const originalExt = path.extname(file.originalname || '').toLowerCase()
      const extConfig = ALLOWED_EXTENSIONS[originalExt]

      if (!extConfig) {
        return res.status(400).json({
          error: `Format file "${originalExt}" tidak didukung. Harap upload template berekstensi .docx, .xlsx, atau .pdf.`,
        })
      }

      // Validasi konten / magic bytes
      if (!extConfig.validate(file.buffer)) {
        return res.status(400).json({
          error: `Isi file tidak sesuai dengan format ${originalExt.toUpperCase()} yang valid atau file terkorupsi.`,
        })
      }

      // Buat nama file server unik yang aman
      const uniqueFilename = `${crypto.randomUUID()}${originalExt}`
      savedFilePath = path.join(UPLOAD_DIR, uniqueFilename)

      // Tulis file ke storage
      await fs.writeFile(savedFilePath, file.buffer)

      // Simpan metadata ke database
      const created = await req.prisma.letterTemplate.create({
        data: {
          name: name.trim(),
          letterType: String(letterType).trim(),
          description: typeof description === 'string' && description.trim() ? description.trim().slice(0, 500) : null,
          originalFilename: sanitizeFilename(file.originalname),
          storedFilename: uniqueFilename,
          fileFormat: extConfig.format,
          fileSize: file.buffer.length,
          mimeType: extConfig.mimeType,
          isActive: true,
          createdBy: req.user?.username || 'admin',
        },
      })

      return res.status(201).json(created)
    } catch (error) {
      // Hapus file fisik jika terjadi kesalahan database agar tidak ada file yatim
      if (savedFilePath) {
        await fs.unlink(savedFilePath).catch(() => {})
      }
      console.error('Save letter template error:', error)
      return res.status(500).json({ error: 'Gagal menyimpan template surat ke database.' })
    }
  })

  // 5. PUT /letter-templates/:id - Update nama/deskripsi/status template
  router.put('/letter-templates/:id', async (req, res) => {
    try {
      const { name, description, isActive } = req.body
      const existing = await req.prisma.letterTemplate.findUnique({
        where: { id: req.params.id },
      })

      if (!existing) {
        return res.status(404).json({ error: 'Template surat tidak ditemukan.' })
      }

      const data = {}
      if (typeof name === 'string' && name.trim().length >= 3) {
        data.name = name.trim().slice(0, 100)
      }
      if (typeof description === 'string') {
        data.description = description.trim().slice(0, 500) || null
      }
      if (typeof isActive === 'boolean') {
        data.isActive = isActive
      }

      const updated = await req.prisma.letterTemplate.update({
        where: { id: req.params.id },
        data,
      })

      return res.json(updated)
    } catch (error) {
      console.error('Update letter template error:', error)
      return res.status(500).json({ error: 'Gagal memperbarui data template.' })
    }
  })

  // 6. DELETE /letter-templates/:id - Hapus atau nonaktifkan template
  router.delete('/letter-templates/:id', async (req, res) => {
    try {
      const existing = await req.prisma.letterTemplate.findUnique({
        where: { id: req.params.id },
        include: {
          _count: {
            select: { letterDocuments: true, quotations: true },
          },
        },
      })

      if (!existing) {
        return res.status(404).json({ error: 'Template surat tidak ditemukan.' })
      }

      // Jika template sudah pernah digunakan untuk membuat surat, lakukan soft-delete
      if (existing._count.letterDocuments > 0 || existing._count.quotations > 0) {
        await req.prisma.letterTemplate.update({
          where: { id: req.params.id },
          data: { isActive: false },
        })
        return res.json({
          message: 'Template dinonaktifkan (diarsipkan) karena telah digunakan oleh dokumen surat tersimpan.',
          softDeleted: true,
        })
      }

      // Jika belum pernah digunakan, hapus metadata dan file fisik
      await req.prisma.letterTemplate.delete({
        where: { id: req.params.id },
      })

      const filePath = path.join(UPLOAD_DIR, existing.storedFilename)
      await fs.unlink(filePath).catch(() => {})

      return res.json({
        message: 'Template berhasil dihapus secara permanen.',
        deleted: true,
      })
    } catch (error) {
      console.error('Delete letter template error:', error)
      return res.status(500).json({ error: 'Gagal menghapus template surat.' })
    }
  })

  return router
}

module.exports = { createLetterTemplatesRouter, ALLOWED_LETTER_TYPES }
