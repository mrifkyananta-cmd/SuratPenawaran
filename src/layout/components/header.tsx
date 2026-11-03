import { useNavigate } from 'react-router-dom'
import UserProfile from './userProfil'
import { usePathname } from '@/hooks/usePathname'
import { ChevronLeft, Menu } from 'lucide-react'

export default function Header({ onMenuClick }: { onMenuClick: () => void }) {
  const navigate = useNavigate()
  const { splittedPath } = usePathname()

  return (
    <header className="flex min-h-[6.8rem] w-full items-center justify-between gap-16 border-b border-[#E2E8F0] bg-[#FFFFFF] px-20 py-10 phones:px-12">
      <div className="flex min-w-0 items-center gap-12">
        <button
          aria-label="Buka menu navigasi"
          onClick={onMenuClick}
          className="inline-flex h-[4rem] w-[4rem] shrink-0 items-center justify-center rounded-xl text-[#000000] transition-colors hover:bg-[#F1F5F9] hover:text-[#0000FF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0000FF] desktop:hidden"
        >
          <Menu size={20} />
        </button>
        <button
          onClick={() => navigate(splittedPath?.length >= 3 ? '/quotation' : '/')}
          className="group flex min-w-0 items-center gap-10 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0000FF]"
        >
          {splittedPath?.length >= 3 ? (
            <>
              <ChevronLeft size={18} className="shrink-0 text-[#000000] group-hover:text-[#0000FF]" />
              <span className="truncate text-[1.8rem] font-semibold text-[#000000]">Kembali</span>
            </>
          ) : (
            <>
              <img src="/favicon/logo.png" alt="" className="h-[3.8rem] w-[3.8rem] shrink-0 object-contain" />
              <span className="truncate text-[2rem] font-semibold uppercase tracking-[0.1em] text-[#000000]">Luma</span>
            </>
          )}
        </button>
      </div>
      <UserProfile />
    </header>
  )
}
