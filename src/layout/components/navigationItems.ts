import { ClipboardList, FileText, Home, ReceiptText, WalletCards } from 'lucide-react'

export const navigationItems = [
  { label: 'Home', to: '/', icon: Home, end: true },
  { label: 'Quotation', to: '/quotation', icon: FileText },
  { label: 'PO', to: '/po', icon: ClipboardList },
  { label: 'Invoice', to: '/invoice', icon: ReceiptText },
  { label: 'Bukti Bayar', to: '/bukti-bayar', icon: WalletCards },
]
