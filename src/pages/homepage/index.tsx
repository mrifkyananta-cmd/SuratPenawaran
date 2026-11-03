import { useEffect, useState } from 'react'
import {
  AlertCircle,
  CheckCircle2,
  ClipboardList,
  Clock,
  FileText,
  ReceiptText,
  WalletCards,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { billingRequest } from '@/utils/billingApi'
import { DOCUMENT_CATEGORY_TOKENS, getSemanticStatusClass } from '@/utils/semanticTokens'
import { getSlugFromType } from '@/pages/surat/templatesData'

type DashboardSummary = {
  quotations: {
    total: number
    draft: number
    followUpNeeded: number
    approved: number
  }
  purchaseOrders: {
    total: number
    active: number
    completed: number
  }
  invoices: {
    total: number
    draft: number
    issued: number
    partiallyPaid: number
    paid: number
    overdue: number
  }
  payments: {
    total: number
    pendingVerification: number
    verified: number
  }
  letterDocuments: {
    total: number
  }
}

export default function HomePage() {
  const navigate = useNavigate()
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    billingRequest<DashboardSummary>('/dashboard/summary')
      .then((data) => {
        if (active) setSummary(data)
      })
      .catch(() => {
        if (active) setSummary(null)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  return (
    <div className="scrollbar flex h-full w-full min-w-0 flex-col gap-24 overflow-auto py-8">
      <div className="flex flex-wrap items-end justify-between gap-12">
        <div className="flex flex-col gap-6">
          <h1 className="text-[2.6rem] font-semibold text-[#000000]">Dashboard</h1>
          <p className="text-[1.4rem] text-[#000000]">Ringkasan operasional real-time penawaran, PO, invoice, serta pembayaran.</p>
        </div>
        {summary && (
          <span className="text-[1.35rem] text-[#000000]">
            Arsip Surat Tersimpan: <strong className="font-semibold text-[#0000FF]">{summary.letterDocuments.total}</strong> dokumen
          </span>
        )}
      </div>

      {/* Ringkasan Operasional Real-Time */}
      <section aria-label="Ringkasan Operasional" className="grid grid-cols-1 gap-16 sm:grid-cols-2 tablet:grid-cols-2 laptop:grid-cols-2 desktop:grid-cols-4">
        <div
          onClick={() => navigate('/quotation')}
          className="cursor-pointer rounded-2xl border border-[#E2E8F0] bg-[#FFFFFF] p-24 transition-colors hover:border-[#0000FF]"
        >
          <div className="flex items-center justify-between gap-8 text-[#000000]">
            <span className="text-[1.5rem] font-semibold leading-[1.4]">Total Quotation</span>
            <FileText size={18} className="shrink-0 text-[#0000FF]" />
          </div>
          <p className="mt-12 text-[2.8rem] font-semibold leading-[1.2] text-[#000000]">
            {loading ? '…' : (summary?.quotations.total ?? 0)}
          </p>
          <div className="mt-14 flex flex-wrap gap-12 text-[1.25rem]">
            <span className={`inline-flex items-center gap-6 font-semibold leading-[1.35] ${getSemanticStatusClass('Pending')}`}>
              <Clock size={13} className="shrink-0" />
              Perlu Follow Up: {summary?.quotations.followUpNeeded ?? 0}
            </span>
            <span className={`inline-flex items-center gap-6 font-normal leading-[1.35] ${getSemanticStatusClass('Draft')}`}>
              Draft: {summary?.quotations.draft ?? 0}
            </span>
          </div>
        </div>

        <div
          onClick={() => navigate('/po')}
          className="cursor-pointer rounded-2xl border border-[#E2E8F0] bg-[#FFFFFF] p-24 transition-colors hover:border-[#0000FF]"
        >
          <div className="flex items-center justify-between gap-8 text-[#000000]">
            <span className="text-[1.5rem] font-semibold leading-[1.4]">PO Aktif</span>
            <ClipboardList size={18} className="shrink-0 text-[#000000]" />
          </div>
          <p className="mt-12 text-[2.8rem] font-semibold leading-[1.2] text-[#000000]">
            {loading ? '…' : (summary?.purchaseOrders.active ?? 0)}
          </p>
          <div className="mt-14 flex flex-wrap gap-12 text-[1.25rem]">
            <span className={`inline-flex items-center gap-6 font-normal leading-[1.35] ${getSemanticStatusClass('Draft')}`}>
              Total PO: {summary?.purchaseOrders.total ?? 0}
            </span>
            <span className={`inline-flex items-center gap-6 font-semibold leading-[1.35] ${getSemanticStatusClass('Selesai')}`}>
              Selesai: {summary?.purchaseOrders.completed ?? 0}
            </span>
          </div>
        </div>

        <div
          onClick={() => navigate('/invoice')}
          className="cursor-pointer rounded-2xl border border-[#E2E8F0] bg-[#FFFFFF] p-24 transition-colors hover:border-[#0000FF]"
        >
          <div className="flex items-center justify-between gap-8 text-[#000000]">
            <span className="text-[1.5rem] font-semibold leading-[1.4]">Status Invoice</span>
            <ReceiptText size={18} className="shrink-0 text-[#0000FF]" />
          </div>
          <p className="mt-12 text-[2.8rem] font-semibold leading-[1.2] text-[#000000]">
            {loading ? '…' : (summary?.invoices.total ?? 0)}
          </p>
          <div className="mt-14 flex flex-wrap gap-10 text-[1.25rem]">
            <span className={`inline-flex items-center font-normal leading-[1.35] ${getSemanticStatusClass('Draft')}`}>Draft: {summary?.invoices.draft ?? 0}</span>
            <span className={`inline-flex items-center font-semibold leading-[1.35] ${getSemanticStatusClass('Issued')}`}>Issued: {summary?.invoices.issued ?? 0}</span>
            <span className={`inline-flex items-center font-semibold leading-[1.35] ${getSemanticStatusClass('Partial')}`}>Partial: {summary?.invoices.partiallyPaid ?? 0}</span>
            <span className={`inline-flex items-center font-semibold leading-[1.35] ${getSemanticStatusClass('Paid')}`}>Paid: {summary?.invoices.paid ?? 0}</span>
            {(summary?.invoices.overdue ?? 0) > 0 && (
              <span className={`inline-flex items-center font-semibold leading-[1.35] ${getSemanticStatusClass('Overdue')}`}>Overdue: {summary?.invoices.overdue ?? 0}</span>
            )}
          </div>
        </div>

        <div
          onClick={() => navigate('/bukti-bayar')}
          className="cursor-pointer rounded-2xl border border-[#E2E8F0] bg-[#FFFFFF] p-24 transition-colors hover:border-[#0000FF]"
        >
          <div className="flex items-center justify-between gap-8 text-[#000000]">
            <span className="text-[1.5rem] font-semibold leading-[1.4]">Menunggu Verifikasi Bayar</span>
            <WalletCards size={18} className="shrink-0 text-[#008000]" />
          </div>
          <p className="mt-12 text-[2.8rem] font-semibold leading-[1.2] text-[#000000]">
            {loading ? '…' : (summary?.payments.pendingVerification ?? 0)}
          </p>
          <div className="mt-14 flex flex-wrap gap-12 text-[1.25rem]">
            <span className={`inline-flex items-center gap-6 font-semibold leading-[1.35] ${getSemanticStatusClass('Verified')}`}>
              <CheckCircle2 size={13} className="shrink-0" />
              Terverifikasi: {summary?.payments.verified ?? 0}
            </span>
            {(summary?.payments.pendingVerification ?? 0) > 0 && (
              <span className={`inline-flex items-center gap-6 font-semibold leading-[1.35] ${getSemanticStatusClass('Pending')}`}>
                <AlertCircle size={13} className="shrink-0" />
                Perlu Verifikasi
              </span>
            )}
          </div>
        </div>
      </section>

      {/* Identifikasi Kategori Dokumen Surat */}
      <section aria-label="Kategori Dokumen Surat" className="rounded-2xl border border-[#E2E8F0] bg-[#FFFFFF] p-24">
        <div className="flex flex-wrap items-center justify-between gap-12">
          <div>
            <h2 className="text-[1.7rem] font-semibold leading-[1.35] text-[#000000]">
              Kategori Dokumen Surat Resmi
            </h2>
            <p className="mt-4 text-[1.35rem] leading-[1.45] text-[#000000]">
              Akses cepat pembuatan surat berdasarkan jenis dokumen administrasi perusahaan.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-16">
            {Object.values(DOCUMENT_CATEGORY_TOKENS).map((cat) => (
              <button
                key={cat.code}
                type="button"
                data-doc-category-badge={cat.code}
                onClick={() => navigate(`/quotation/${getSlugFromType(cat.code)}?mode=new`)}
                className={`inline-flex items-center text-[1.35rem] font-semibold leading-[1.35] transition-opacity hover:opacity-80 ${cat.badgeClass}`}
              >
                <span>{cat.label}</span>
              </button>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}
