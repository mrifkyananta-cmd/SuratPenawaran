# React + TypeScript + Vite (Luma / Surat Penawaran)

## Menjalankan Luma dan membuat Surat Penawaran

Pasang Node.js dan npm, lalu jalankan di folder proyek:

```cmd
npm ci
npm run dev
```

Buka alamat lokal yang ditampilkan Vite (biasanya `http://localhost:3000/` atau `http://localhost:5173/`), masuk menggunakan akun yang telah dikonfigurasi di backend, lalu akses menu **Dashboard**, **Surat**, **Quotation**, **PO**, **Invoice**, atau **Bukti Bayar**.

**Cara pakai Surat Penawaran:** isi data penerima dan penawaran, isi **Tabel produk** (satu baris = satu produk; klik **Tambah baris** untuk produk berikutnya, baris kosong tidak ikut dicetak), lihat hasilnya langsung di panel **Pratinjau surat**, klik **Simpan ke Quotation** untuk menyinkronkan ke database PostgreSQL, atau unduh sebagai **Excel (.xlsx)**, **PDF**, atau **Word (.docx)**.

**Template = satu sumber kebenaran.** File `public/templates/surat-penawaran.xlsx` adalah acuan. Excel diisi langsung ke file itu (logo, format, rumus), sedangkan PDF, Word, dan pratinjau membaca teks tetapnya dari file yang sama.

**Jenis Surat Lainnya (`/surat`):**
- **Surat Permintaan Barang** (`/surat/surat-permintaan-barang`): Tersimpan di tabel `LetterDocument` (`/api/letter-documents?type=SURAT_PERMINTAAN_BARANG`) dan dapat dibuka ulang/diedit kapan saja.
- **Surat Pesanan (PO)** (`/surat/surat-pesanan`): Tersimpan di tabel `LetterDocument` (`SURAT_PESANAN`), dapat dimuat dari data `PurchaseOrder` (`/po`), dan dapat disinkronkan langsung ke daftar `PurchaseOrder` saat disimpan.
- **Surat Perjanjian Jual Beli** (`/surat/surat-perjanjian-jual-beli`): Tersimpan di tabel `LetterDocument` (`SURAT_PERJANJIAN_JUAL_BELI`).

---

## Konfigurasi Backend, Database, Keamanan, dan Pengujian

### 1. Instalasi Dependency & Prisma Client

Jalankan instalasi sesuai lockfile di root (frontend) dan folder `backend`:

```powershell
npm ci
npm --prefix backend ci
npm --prefix backend run prisma:generate
```

### 2. Konfigurasi Environment & Bootstrap Akun (Autentikasi / RBAC)

- **Frontend (`.env`)**: Salin `.env.example` ke `.env` dan sesuaikan `VITE_API_BASE_URL` (default pengembangan: `http://localhost:3001`). Untuk produksi, lihat `.env.production.example`.
- **Backend (`backend/.env`)**: Salin `backend/.env.example` ke `backend/.env` dan atur:
  - `DATABASE_URL`: URL koneksi PostgreSQL utama aplikasi.
  - `AUTH_SECRET`: Secret HMAC-SHA256 minimal 32 karakter untuk menandatangani token sesi autentikasi (`luma_session` HttpOnly cookie / Bearer token).
  - `AUTH_ADMIN_USERNAME` & `AUTH_ADMIN_PASSWORD`: Kredensial akun **Administrator (`ADMIN`)** (minimal panjang password 8 karakter). Role `ADMIN` memiliki akses penuh termasuk menghapus Quotation, menghapus dokumen surat/asset, serta memverifikasi dan membatalkan pembayaran terverifikasi.
  - `AUTH_STAFF_USERNAME` & `AUTH_STAFF_PASSWORD` (opsional): Kredensial akun **Staf Operasional (`STAFF`)**. Role `STAFF` dapat membuat dan memperbarui Quotation, PO, Invoice, Bukti Bayar (status `PENDING`), serta dokumen surat, tetapi tidak diizinkan menghapus Quotation atau memverifikasi pembayaran.
  - `PAYMENT_VERIFICATION_TOKEN`: Secret khusus otorisasi dua lapis saat `ADMIN` memverifikasi atau membatalkan pembayaran terverifikasi melalui dialog SweetAlert2 (tidak pernah diekspos ke frontend, log, atau respons API).
  - `CORS_ORIGINS`: Daftar origin frontend yang diizinkan (dipisahkan koma), wajib diisi saat `NODE_ENV=production`.
  - `BILLING_TEST_DATABASE_URL`: URL database PostgreSQL khusus pengujian yang namanya **wajib berakhiran `_test`** dan berbeda dari `DATABASE_URL`.

> **Catatan Mode Production (`NODE_ENV=production`):**
> Saat dijalankan dengan `NODE_ENV=production`, `backend/server.cjs` memvalidasi keberadaan dan kekuatan `CORS_ORIGINS`, `AUTH_SECRET` (>= 32 karakter), `AUTH_ADMIN_USERNAME`, `AUTH_ADMIN_PASSWORD` (>= 8 karakter, bukan password lemah), serta `PAYMENT_VERIFICATION_TOKEN`. Jika semuanya valid, server berjalan normal dalam mode production.

### 3. Proteksi File `/uploads`

Seluruh file di folder `backend/uploads` tidak lagi diekspos secara publik tanpa autentikasi:
- Permintaan ke `/uploads/:filename` wajib menyertakan sesi autentikasi yang valid (cookie `luma_session`, header `Authorization: Bearer`, atau query `?token=` dari sesi aktif).
- Backend memvalidasi nama file terhadap path traversal (`path.basename`), memeriksa keberadaan metadata file di database (`Asset`, `QuotationAttachment`, `PurchaseOrderAttachment`, atau `PaymentAttachment`), dan mengirimkan header keamanan `X-Content-Type-Options: nosniff`, `Content-Security-Policy: sandbox`, serta `Content-Disposition: attachment`.

### 4. Migrasi Database

Periksa status migrasi dan terapkan migrasi menggunakan `migrate deploy` (jangan gunakan `migrate reset` pada database yang berisi data):

```powershell
cd backend
npx prisma validate
npx prisma migrate status
npx prisma migrate deploy
```

### 5. Menjalankan Pengujian

- **Frontend Lint & Build**:
  ```powershell
  npm run lint
  npm run build
  ```
- **Backend Integration Test** (menggunakan database khusus `*_test`):
  ```powershell
  cd backend
  $env:DATABASE_URL = "postgresql://USER:PASSWORD@127.0.0.1:5432/surat_penawaran_test?schema=public"
  npx prisma migrate deploy
  $env:BILLING_TEST_DATABASE_URL = "postgresql://USER:PASSWORD@127.0.0.1:5432/surat_penawaran_test?schema=public"
  npm test
  ```
- **End-to-End (Playwright)**:
  ```powershell
  npx playwright test --project=chromium
  ```
