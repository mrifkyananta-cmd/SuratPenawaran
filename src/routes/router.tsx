import { createBrowserRouter, Navigate, useLocation, useParams } from 'react-router-dom'
import {
  HomePage,
  MainLayout,
  NotFoundPage,
  QuotationPage,
  PurchaseOrderPage,
  InvoicePage,
  PaymentPage,
} from './loadables'
import SuratPenawaran from '@/pages/surat/suratPenawaran'
import SuratPermintaanBarang from '@/pages/surat/suratPermintaanBarang'
import SuratPesanan from '@/pages/surat/suratPesanan'
import SuratPerjanjianJualBeli from '@/pages/surat/suratPerjanjianJualBeli'

const VALID_SURAT_SLUGS = new Set([
  'surat-penawaran',
  'surat-permintaan-barang',
  'surat-pesanan',
  'surat-perjanjian-jual-beli',
])

function LegacySuratRedirect() {
  const location = useLocation()
  const { slug } = useParams<{ slug?: string }>()
  if (slug && VALID_SURAT_SLUGS.has(slug)) {
    return <Navigate to={`/quotation/${slug}${location.search}`} state={location.state} replace />
  }
  return <Navigate to={`/quotation${location.search}`} state={location.state} replace />
}

export const router = createBrowserRouter([
  {
    path: '/',
    element: <MainLayout />,
    children: [
      {
        path: '',
        element: <HomePage />,
      },
      {
        path: 'quotation',
        element: <QuotationPage />,
      },
      {
        path: 'quotation/surat-penawaran',
        element: <SuratPenawaran />,
      },
      {
        path: 'quotation/surat-permintaan-barang',
        element: <SuratPermintaanBarang />,
      },
      {
        path: 'quotation/surat-pesanan',
        element: <SuratPesanan />,
      },
      {
        path: 'quotation/surat-perjanjian-jual-beli',
        element: <SuratPerjanjianJualBeli />,
      },
      { path: 'po', element: <PurchaseOrderPage /> },
      { path: 'invoice', element: <InvoicePage /> },
      { path: 'bukti-bayar', element: <PaymentPage /> },
      {
        path: 'surat',
        element: <LegacySuratRedirect />,
      },
      {
        path: 'surat/:slug',
        element: <LegacySuratRedirect />,
      },
      {
        path: 'surat/*',
        element: <LegacySuratRedirect />,
      },
      {
        path: '*',
        element: <NotFoundPage />,
      },
    ],
  },
  {
    path: '*',
    element: <NotFoundPage />,
  },
])
