import { useEffect, useState, type FormEvent } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { ChevronFirst, ChevronLast, LockKeyhole } from 'lucide-react'
import { useLoading } from '@/hooks/useLoading'
import { DialogLoading } from '@/components/feedback/dialogComponents'
import { ErrorBoundary } from '../pages/errorPage/errorBoundary'
import ErrorPage from '@/pages/errorPage'
import {
  apiUrl,
  getAuthSession,
  loginRequest,
  setAuthSession,
  subscribeAuthSession,
  type AuthSession,
} from '@/utils/billingApi'
import { closeNotification, showError, showLoading, showSuccess } from '@/utils/notifications'
import Header from './components/header'
import Navigation from './components/navigation'

export default function MainLayout() {
  const { isLoading, setIsLoading } = useLoading()
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [isMobileOpen, setIsMobileOpen] = useState(false)
  const [session, setSession] = useState<AuthSession | null>(() => getAuthSession())
  const [authChecking, setAuthChecking] = useState(true)
  const [backendReachable, setBackendReachable] = useState(true)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const location = useLocation()

  useEffect(() => {
    return subscribeAuthSession(setSession)
  }, [])

  useEffect(() => {
    let active = true
    const verify = async () => {
      try {
        const healthRes = await fetch(apiUrl('/health'))
        if (!healthRes.ok) throw new Error('Backend health failed')
        if (!active) return
        setBackendReachable(true)

        const current = getAuthSession()
        if (!current) {
          setAuthChecking(false)
          return
        }
        const meRes = await fetch(apiUrl('/auth/me'))
        if (!active) return
        if (!meRes.ok) {
          setAuthSession(null)
        }
      } catch {
        if (active) setBackendReachable(false)
      } finally {
        if (active) setAuthChecking(false)
      }
    }
    void verify()
    return () => {
      active = false
    }
  }, [])

  const handleLogin = async (event: FormEvent) => {
    event.preventDefault()
    if (!username.trim() || !password) {
      await showError('Data belum lengkap', 'Masukkan username dan password Anda.')
      return
    }
    setSubmitting(true)
    showLoading('Memverifikasi kredensial...')
    try {
      const loggedIn = await loginRequest(username.trim(), password)
      closeNotification()
      setPassword('')
      await showSuccess('Berhasil masuk', `Selamat datang, ${loggedIn.user.username} (${loggedIn.user.role}).`)
    } catch (error) {
      closeNotification()
      await showError('Gagal masuk', error instanceof Error ? error.message : 'Periksa username dan password Anda.')
    } finally {
      setSubmitting(false)
    }
  }

  if (authChecking) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-[#F8FAFC] font-jakarta text-[1.6rem] text-[#000000]">
        Memeriksa sesi pengguna…
      </div>
    )
  }

  if (backendReachable && !session) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-[#F8FAFC] p-16 font-jakarta text-[#000000]">
        <form
          onSubmit={handleLogin}
          aria-label="Formulir login"
          className="w-full max-w-[44rem] rounded-2xl border border-[#E2E8F0] bg-[#FFFFFF] p-24 shadow-sm"
        >
          <div className="mb-20 flex items-center gap-12">
            <span className="flex h-[3.2rem] w-[3.2rem] shrink-0 items-center justify-center text-[#0000FF]">
              <LockKeyhole size={22} />
            </span>
            <div>
              <h1 className="text-[2.4rem] font-semibold text-[#000000]">Masuk ke Luma</h1>
              <p className="text-[1.4rem] text-[#000000]">Gunakan akun Administrator atau Staff untuk mengakses sistem.</p>
            </div>
          </div>

          <div className="space-y-14">
            <label className="block">
              <span className="mb-6 block text-[1.4rem] font-medium text-[#000000]">Username</span>
              <input
                required
                autoComplete="username"
                placeholder="Masukkan username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-14 py-10 text-[1.5rem] text-[#000000] placeholder:text-[#000000] focus:border-[#0000FF] focus:bg-[#FFFFFF] focus:outline-none focus:ring-2 focus:ring-[#E2E8F0]"
              />
            </label>

            <label className="block">
              <span className="mb-6 block text-[1.4rem] font-medium text-[#000000]">Password</span>
              <input
                required
                type="password"
                autoComplete="current-password"
                placeholder="Masukkan password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-14 py-10 text-[1.5rem] text-[#000000] placeholder:text-[#000000] focus:border-[#0000FF] focus:bg-[#FFFFFF] focus:outline-none focus:ring-2 focus:ring-[#E2E8F0]"
              />
            </label>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="mt-20 inline-flex min-h-[4.4rem] w-full items-center justify-center rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] px-16 py-10 text-[1.6rem] font-semibold text-[#0000FF] transition-colors hover:bg-[#F8FAFC] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0000FF] disabled:opacity-60"
          >
            {submitting ? 'Memproses...' : 'Masuk'}
          </button>
        </form>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen w-full flex-col bg-[#F8FAFC] text-left font-jakarta text-[1.4rem] leading-[1.5] text-[#000000]">
      <Header onMenuClick={() => setIsMobileOpen(true)} />
      <div className="flex min-h-0 flex-1">
        <aside
          aria-label="Sidebar navigasi"
          className={`hidden shrink-0 flex-col border-r border-[#E2E8F0] bg-[#FFFFFF] px-12 py-20 transition-[width] duration-200 desktop:flex ${isCollapsed ? 'w-[8rem]' : 'w-[24rem]'}`}
        >
          <div className="mb-16 flex items-center justify-between px-8">
            {!isCollapsed && <span className="text-[1.25rem] font-semibold uppercase tracking-[0.12em] text-[#000000]">Menu</span>}
            <button
              aria-label={isCollapsed ? 'Perluas sidebar' : 'Perkecil sidebar'}
              onClick={() => setIsCollapsed((value) => !value)}
              className="ml-auto inline-flex h-[3.6rem] w-[3.6rem] items-center justify-center rounded-lg text-[#000000] transition-colors hover:bg-[#F1F5F9] hover:text-[#0000FF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0000FF]"
            >
              {isCollapsed ? <ChevronLast size={16} /> : <ChevronFirst size={16} />}
            </button>
          </div>
          <Navigation collapsed={isCollapsed} />
        </aside>

        {isMobileOpen && (
          <div className="fixed inset-0 z-40 desktop:hidden">
            <button
              aria-label="Tutup menu navigasi"
              className="absolute inset-0 bg-slate-900/40"
              onClick={() => setIsMobileOpen(false)}
            />
            <aside aria-label="Sidebar navigasi" className="absolute bottom-0 left-0 top-[6.8rem] w-[min(30rem,85vw)] overflow-y-auto border-r border-[#E2E8F0] bg-[#FFFFFF] p-16 shadow-lg">
              <div className="mb-16 px-8 text-[1.25rem] font-semibold uppercase tracking-[0.12em] text-[#000000]">Menu</div>
              <Navigation onNavigate={() => setIsMobileOpen(false)} />
            </aside>
          </div>
        )}

        <main className="min-w-0 flex-1 overflow-x-hidden px-24 py-24 phones:px-12 phones:py-16">
          <ErrorBoundary fallback={<ErrorPage />}>
            <Outlet key={`${location.pathname}-${session?.user?.username || 'guest'}`} />
          </ErrorBoundary>
        </main>
      </div>
      <DialogLoading isOpen={isLoading} setIsOpen={setIsLoading} />
    </div>
  )
}
