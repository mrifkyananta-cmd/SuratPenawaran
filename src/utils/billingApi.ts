const configuredApiOrigin = import.meta.env.VITE_API_BASE_URL?.trim()
const defaultApiOrigin = import.meta.env.DEV ? 'http://localhost:3001' : ''
export const API_ORIGIN = (configuredApiOrigin || defaultApiOrigin).replace(/\/+$/, '').replace(/\/api$/, '')
const API_BASE = `${API_ORIGIN}/api`

const AUTH_STORAGE_KEY = 'luma-auth-session'

export type AuthUser = {
  username: string
  role: 'ADMIN' | 'STAFF'
}

export type AuthSession = {
  user: AuthUser
  token: string
}

type AuthListener = (session: AuthSession | null) => void
const authListeners = new Set<AuthListener>()

export function getAuthSession(): AuthSession | null {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as AuthSession
    if (!parsed?.token || !parsed?.user?.username || !parsed?.user?.role) return null
    return parsed
  } catch {
    return null
  }
}

export function setAuthSession(session: AuthSession | null) {
  try {
    if (session) {
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session))
    } else {
      localStorage.removeItem(AUTH_STORAGE_KEY)
    }
  } catch {
    // Storage may be unavailable in restricted contexts
  }
  authListeners.forEach((listener) => listener(session))
}

export function subscribeAuthSession(listener: AuthListener) {
  authListeners.add(listener)
  return () => {
    authListeners.delete(listener)
  }
}

const nativeFetch = window.fetch.bind(window)
let fetchPatched = false

export function ensureApiFetchInterceptor() {
  if (fetchPatched) return
  fetchPatched = true
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    const isApiCall =
      (API_ORIGIN && urlStr.startsWith(`${API_ORIGIN}/api`)) ||
      urlStr.startsWith('/api/') ||
      urlStr === '/api'

    if (!isApiCall) {
      return nativeFetch(input, init)
    }

    const session = getAuthSession()
    const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined))
    if (session?.token && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${session.token}`)
    }

    const response = await nativeFetch(input, {
      ...init,
      headers,
      credentials: init?.credentials ?? 'include',
    })

    if (response.status === 401 && !urlStr.includes('/api/auth/login') && !urlStr.includes('/api/health')) {
      setAuthSession(null)
    }
    return response
  }
}

ensureApiFetchInterceptor()

export const apiUrl = (path: string) => `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`

export async function loginRequest(username: string, password: string): Promise<AuthSession> {
  const response = await nativeFetch(apiUrl('/auth/login'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ username, password }),
  })
  const body = (await response.json().catch(() => null)) as (AuthSession & { error?: string }) | null
  if (!response.ok || !body?.token || !body?.user) {
    throw new Error(body?.error || 'Login gagal. Periksa username dan password.')
  }
  const session: AuthSession = { user: body.user, token: body.token }
  setAuthSession(session)
  return session
}

export async function logoutRequest(): Promise<void> {
  try {
    const session = getAuthSession()
    await nativeFetch(apiUrl('/auth/logout'), {
      method: 'POST',
      headers: session?.token ? { Authorization: `Bearer ${session.token}` } : undefined,
      credentials: 'include',
    })
  } catch {
    // Clear local session even if backend is unreachable
  } finally {
    setAuthSession(null)
  }
}

export function fileUrl(value?: string | null) {
  if (!value) return ''
  const session = getAuthSession()
  const appendToken = (rawUrl: string) => {
    if (!session?.token || !rawUrl.includes('/uploads/')) return rawUrl
    const sep = rawUrl.includes('?') ? '&' : '?'
    return `${rawUrl}${sep}token=${encodeURIComponent(session.token)}`
  }
  if (!API_ORIGIN && value.startsWith('/')) return appendToken(value)
  try {
    const parsed = new URL(value, API_ORIGIN || window.location.origin)
    if (['localhost', '127.0.0.1', '::1'].includes(parsed.hostname)) {
      const target = `${API_ORIGIN}${parsed.pathname}${parsed.search}${parsed.hash}` || parsed.pathname
      return appendToken(target)
    }
    return appendToken(parsed.href)
  } catch {
    return appendToken(`${API_ORIGIN}/${value.replace(/^\/+/, '')}`)
  }
}

export async function billingRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  const session = getAuthSession()
  if (session?.token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${session.token}`)
  }
  if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  let response: Response
  try {
    response = await fetch(apiUrl(path), { ...init, headers, credentials: 'include' })
  } catch {
    throw new Error(`Backend tidak dapat dihubungi (${API_ORIGIN || 'origin aplikasi'}). Periksa VITE_API_BASE_URL, reverse proxy, dan koneksi backend.`)
  }
  if (response.status === 204) return undefined as T
  const result = await response.json().catch(() => null) as { error?: string } | T | null
  if (!response.ok) {
    const message = result && typeof result === 'object' && 'error' in result && typeof result.error === 'string'
      ? result.error
      : 'Permintaan tidak berhasil. Periksa koneksi backend lalu coba kembali.'
    throw new Error(message)
  }
  return result as T
}

export const formatIdr = (amount: string | number | null | undefined) => new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 2,
}).format(Number(amount || 0))

export const dateInputValue = (value?: string | null) => value
  ? /^\d{4}-\d{2}-\d{2}/.test(value)
    ? value.slice(0, 10)
    : Number.isNaN(new Date(value).getTime()) ? '' : new Date(value).toISOString().slice(0, 10)
  : ''

export const formatIdDate = (value?: string | null) => {
  if (!value) return '—'
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  const parsed = dateOnly
    ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]), 12)
    : new Date(value)
  return Number.isNaN(parsed.getTime())
    ? '—'
    : parsed.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
}

export const todayInputValue = () => {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}
