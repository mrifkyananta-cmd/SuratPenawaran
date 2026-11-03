import { useEffect, useState } from 'react'
import { LogOut, UserRound } from 'lucide-react'
import { getAuthSession, logoutRequest, subscribeAuthSession, type AuthSession } from '@/utils/billingApi'
import { showConfirm, showSuccess } from '@/utils/notifications'

export default function UserProfile() {
  const [session, setSession] = useState<AuthSession | null>(() => getAuthSession())

  useEffect(() => {
    return subscribeAuthSession(setSession)
  }, [])

  const handleLogout = async () => {
    if (!(await showConfirm('Keluar dari sesi?', 'Anda perlu login kembali untuk mengakses transaksi.', 'Ya, keluar'))) {
      return
    }
    await logoutRequest()
    await showSuccess('Berhasil keluar', 'Sesi Anda telah diakhiri.')
  }

  return (
    <div className="flex shrink-0 items-center gap-10 rounded-full border border-[#E2E8F0] bg-[#F8FAFC] px-14 py-8" aria-label="Profil pengguna">
      <span className="flex h-[2.4rem] w-[2.4rem] items-center justify-center text-[#0000FF]">
        <UserRound aria-hidden="true" size={16} />
      </span>
      {session?.user ? (
        <>
          <div className="flex items-center gap-8 text-[1.4rem]">
            <span className="max-w-[18rem] truncate font-semibold leading-[1.4] text-[#000000]" title={session.user.username}>{session.user.username}</span>
            <span className="text-[1.15rem] font-semibold uppercase leading-[1.35] tracking-wide text-[#000000]">
              {session.user.role}
            </span>
          </div>
          <button
            type="button"
            onClick={() => void handleLogout()}
            title="Keluar"
            aria-label="Keluar"
            className="inline-flex items-center gap-6 rounded-full border border-[#E2E8F0] bg-[#FFFFFF] px-12 py-6 text-[1.3rem] font-medium leading-[1.35] text-[#000000] transition-colors hover:bg-[#F8FAFC] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0000FF]"
          >
            <LogOut size={14} />
            <span className="phones:hidden">Keluar</span>
          </button>
        </>
      ) : (
        <span className="pr-4 text-[1.3rem] leading-[1.4] text-[#000000]">Mode Offline / Tamu</span>
      )}
    </div>
  )
}
