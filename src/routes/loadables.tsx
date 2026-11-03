import LoadingFallbackPage from '@/pages/loadingPage'
import loadable from '@loadable/component'

export const MainLayout = loadable(() => import('@/layout'))

export const HomePage = loadable(() => import('@/pages/homepage'), {
  fallback: <LoadingFallbackPage />,
})

export const QuotationPage = loadable(() => import('@/pages/quotation'))
export const PurchaseOrderPage = loadable(() => import('@/pages/po'))
export const InvoicePage = loadable(() => import('@/pages/invoice'))
export const PaymentPage = loadable(() => import('@/pages/buktiBayar'))
export const NotFoundPage = loadable(() => import('@/pages/notFoundPage'))
