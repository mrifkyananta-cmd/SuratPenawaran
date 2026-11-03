const express = require('express')
const crypto = require('crypto')

const COOKIE_NAME = 'luma_session'
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000 // 12 hours

function sha256(value) {
  return crypto.createHash('sha256').update(String(value || ''), 'utf8').digest()
}

function safeEqual(a, b) {
  return crypto.timingSafeEqual(sha256(a), sha256(b))
}

function getAuthSecret() {
  const configured = (process.env.AUTH_SECRET || '').trim()
  if (process.env.NODE_ENV === 'production') {
    if (configured.length < 16) {
      throw new Error('AUTH_SECRET wajib dikonfigurasi (minimal 16 karakter) pada mode production.')
    }
    return configured
  }
  return configured || 'dev-only-luma-auth-secret-do-not-use-in-prod'
}

function getConfiguredUsers() {
  const adminUser = (process.env.AUTH_ADMIN_USERNAME || '').trim()
  const adminPass = process.env.AUTH_ADMIN_PASSWORD || ''
  const staffUser = (process.env.AUTH_STAFF_USERNAME || '').trim()
  const staffPass = process.env.AUTH_STAFF_PASSWORD || ''

  if (process.env.NODE_ENV === 'production') {
    if (!adminUser || adminPass.length < 8) {
      throw new Error('AUTH_ADMIN_USERNAME dan AUTH_ADMIN_PASSWORD (minimal 8 karakter) wajib dikonfigurasi pada mode production.')
    }
    if (!process.env.PAYMENT_VERIFICATION_TOKEN || process.env.PAYMENT_VERIFICATION_TOKEN.trim().length < 8) {
      throw new Error('PAYMENT_VERIFICATION_TOKEN (minimal 8 karakter) wajib dikonfigurasi pada mode production.')
    }
  }

  const users = []
  if (adminUser && adminPass) {
    users.push({ username: adminUser, password: adminPass, role: 'ADMIN' })
  }
  if (staffUser && staffPass && staffUser.toLowerCase() !== adminUser.toLowerCase()) {
    users.push({ username: staffUser, password: staffPass, role: 'STAFF' })
  }
  return users
}

function validateProductionAuthConfig() {
  getAuthSecret()
  getConfiguredUsers()
}

function signToken(user) {
  const secret = getAuthSecret()
  const payload = Buffer.from(
    JSON.stringify({
      sub: user.username,
      role: user.role,
      exp: Date.now() + TOKEN_TTL_MS,
    }),
    'utf8',
  ).toString('base64url')
  const signature = crypto.createHmac('sha256', secret).update(payload).digest('base64url')
  return `${payload}.${signature}`
}

function verifyToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null
  const [payloadB64, sigB64] = token.split('.')
  if (!payloadB64 || !sigB64) return null
  const secret = getAuthSecret()
  const expectedSig = crypto.createHmac('sha256', secret).update(payloadB64).digest('base64url')
  if (!safeEqual(sigB64, expectedSig)) return null
  try {
    const parsed = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'))
    if (!parsed || typeof parsed.sub !== 'string' || !['ADMIN', 'STAFF'].includes(parsed.role)) return null
    if (typeof parsed.exp !== 'number' || parsed.exp < Date.now()) return null
    return { username: parsed.sub, role: parsed.role }
  } catch {
    return null
  }
}

function parseCookies(cookieHeader) {
  const out = {}
  if (!cookieHeader || typeof cookieHeader !== 'string') return out
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=')
    if (idx > 0) {
      const key = part.slice(0, idx).trim()
      const val = part.slice(idx + 1).trim()
      out[key] = decodeURIComponent(val)
    }
  }
  return out
}

function extractToken(req, allowQueryToken = false) {
  const authHeader = req.get('authorization') || ''
  if (/^Bearer\s+/i.test(authHeader)) {
    return authHeader.replace(/^Bearer\s+/i, '').trim()
  }
  const cookies = parseCookies(req.get('cookie'))
  if (cookies[COOKIE_NAME]) return cookies[COOKIE_NAME]
  if (allowQueryToken && typeof req.query?.token === 'string' && req.query.token.trim()) {
    return req.query.token.trim()
  }
  return null
}

function requireAuth(options = {}) {
  const { allowQueryToken = false } = options
  return (req, res, next) => {
    const token = extractToken(req, allowQueryToken)
    const user = verifyToken(token)
    if (!user) {
      return res.status(401).json({ error: 'Autentikasi diperlukan. Silakan login terlebih dahulu.' })
    }
    req.user = user
    return next()
  }
}

function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Autentikasi diperlukan. Silakan login terlebih dahulu.' })
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: `Akses ditolak: tindakan ini memerlukan hak akses ${allowedRoles.join(' atau ')}.`,
      })
    }
    return next()
  }
}

function createAuthRouter() {
  const router = express.Router()

  router.post('/login', (req, res) => {
    const username = typeof req.body?.username === 'string' ? req.body.username.trim() : ''
    const password = typeof req.body?.password === 'string' ? req.body.password : ''
    if (!username || !password) {
      return res.status(400).json({ error: 'Username dan password wajib diisi.' })
    }
    const users = getConfiguredUsers()
    if (!users.length) {
      return res.status(503).json({ error: 'Akun autentikasi belum dikonfigurasi pada backend (AUTH_ADMIN_USERNAME / AUTH_ADMIN_PASSWORD).' })
    }
    const matched = users.find(
      (candidate) => safeEqual(candidate.username.toLowerCase(), username.toLowerCase()) && safeEqual(candidate.password, password),
    )
    if (!matched) {
      return res.status(401).json({ error: 'Username atau password tidak valid.' })
    }
    const token = signToken(matched)
    const isSecure = process.env.NODE_ENV === 'production'
    res.setHeader(
      'Set-Cookie',
      `${COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; Path=/; Max-Age=${Math.floor(TOKEN_TTL_MS / 1000)}; SameSite=Lax${isSecure ? '; Secure' : ''}`,
    )
    return res.json({
      user: { username: matched.username, role: matched.role },
      token,
    })
  })

  router.post('/logout', (_req, res) => {
    res.setHeader('Set-Cookie', `${COOKIE_NAME}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`)
    return res.status(204).end()
  })

  router.get('/me', (req, res) => {
    const token = extractToken(req, false)
    const user = verifyToken(token)
    if (!user) {
      return res.status(401).json({ authenticated: false, user: null })
    }
    return res.json({ authenticated: true, user })
  })

  return router
}

module.exports = {
  createAuthRouter,
  requireAuth,
  requireRole,
  signToken,
  verifyToken,
  validateProductionAuthConfig,
}
