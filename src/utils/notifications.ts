import Swal, { type SweetAlertIcon } from 'sweetalert2'
import 'sweetalert2/dist/sweetalert2.min.css'

const baseOptions = {
  buttonsStyling: false,
  customClass: {
    popup: 'app-swal-popup',
    title: 'app-swal-title',
    htmlContainer: 'app-swal-content',
    confirmButton: 'app-swal-confirm',
    cancelButton: 'app-swal-cancel',
    denyButton: 'app-swal-deny',
  },
}

function showMessage(icon: SweetAlertIcon, title: string, text?: string) {
  return Swal.fire({ ...baseOptions, icon, title, text, confirmButtonText: 'Mengerti' })
}

export const showSuccess = (title: string, text?: string) => showMessage('success', title, text)
export const showError = (title: string, text?: string) => showMessage('error', title, text)
export const showWarning = (title: string, text?: string) => showMessage('warning', title, text)
export const showInfo = (title: string, text?: string) => showMessage('info', title, text)

export async function showConfirm(
  title: string,
  text: string,
  confirmButtonText = 'Ya, lanjutkan',
) {
  const isDestructive = /hapus|batalkan/i.test(`${title} ${confirmButtonText}`)
  const result = await Swal.fire({
    ...baseOptions,
    customClass: {
      ...baseOptions.customClass,
      confirmButton: isDestructive ? 'app-swal-confirm-danger' : 'app-swal-confirm',
    },
    icon: 'warning',
    title,
    text,
    showCancelButton: true,
    confirmButtonText,
    cancelButtonText: 'Batal',
    reverseButtons: true,
    focusCancel: true,
  })
  return result.isConfirmed
}

export async function showTextInput(title: string, label: string) {
  const result = await Swal.fire({
    ...baseOptions,
    title,
    input: 'text',
    inputLabel: label,
    inputPlaceholder: 'Masukkan nomor',
    inputAttributes: { maxlength: '100', autocapitalize: 'off' },
    showCancelButton: true,
    confirmButtonText: 'Simpan',
    cancelButtonText: 'Batal',
    reverseButtons: true,
    inputValidator: (value) => (!value.trim() ? 'Nomor wajib diisi.' : undefined),
  })
  return result.isConfirmed ? String(result.value).trim() : null
}

export async function showPasswordInput(title: string, label: string) {
  const result = await Swal.fire({
    ...baseOptions,
    title,
    input: 'password',
    inputLabel: label,
    inputPlaceholder: 'Masukkan kode verifikasi',
    inputAttributes: { maxlength: '256', autocomplete: 'current-password' },
    showCancelButton: true,
    confirmButtonText: 'Verifikasi',
    cancelButtonText: 'Batal',
    reverseButtons: true,
    focusCancel: true,
    inputValidator: (value) => (!value.trim() ? 'Kode verifikasi wajib diisi.' : undefined),
  })
  return result.isConfirmed ? String(result.value) : null
}

export function showLoading(title: string) {
  return Swal.fire({
    ...baseOptions,
    title,
    allowOutsideClick: false,
    allowEscapeKey: false,
    didOpen: () => Swal.showLoading(),
  })
}

export function closeNotification() {
  Swal.close()
}
