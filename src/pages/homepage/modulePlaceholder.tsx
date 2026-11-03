import { ArrowLeft, CircleHelp } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'

type ModuleInfo = {
  title: string
  description: string
  action?: { label: string; to: string }
}

const modules: Record<string, ModuleInfo> = {
  po: {
    title: 'Purchase Order',
    description: 'Catat PO melalui PO In / Quick In di Quotation. Catatan saat ini tersimpan di perangkat ini.',
    action: { label: 'Buka Quotation', to: '/quotation' },
  },
  invoice: {
    title: 'Invoice',
    description: 'Modul pencatatan dan pengelolaan invoice belum tersedia.',
  },
  'bukti-bayar': {
    title: 'Bukti Bayar',
    description: 'Modul pencatatan bukti pembayaran yang terhubung ke invoice belum tersedia.',
  },
}

export default function ModulePlaceholder() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const moduleName = pathname.split('/').pop() ?? ''
  const module = modules[moduleName] ?? {
    title: 'Modul',
    description: 'Modul ini belum tersedia.',
  }
  const action = module.action

  return (
    <section aria-labelledby="module-placeholder-title" className="mx-auto flex min-h-[32rem] max-w-[72rem] flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white p-32 text-center">
      <span className="mb-16 flex h-[5.6rem] w-[5.6rem] items-center justify-center rounded-full bg-[#FFFFFF] text-app-info">
        <CircleHelp aria-hidden="true" size={24} />
      </span>
      <h1 id="module-placeholder-title" className="text-[2.8rem] font-semibold text-[#000000]">{module.title}</h1>
      <p className="mt-8 max-w-[52rem] text-[1.6rem] leading-relaxed text-[#000000]">{module.description}</p>
      {action && (
        <button
          onClick={() => navigate(action.to)}
          className="mt-20 inline-flex min-h-[4.2rem] items-center gap-8 rounded-xl border border-[#E2E8F0] bg-[#FFFFFF] px-16 py-10 text-[1.6rem] font-semibold text-[#0000FF] hover:bg-[#F8FAFC] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-primary focus-visible:ring-offset-2"
        >
          <ArrowLeft aria-hidden="true" size={16} />
          {action.label}
        </button>
      )}
    </section>
  )
}
