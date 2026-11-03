# LUMA backend

## Setup

1. Copy `.env.example` to `.env` and set the project's PostgreSQL `DATABASE_URL`.
2. Set `PAYMENT_VERIFICATION_TOKEN` to a long random secret. Payment verification and reversal of a verified payment are disabled until this secret is configured.
3. Run `npm install` to generate the Prisma client, then `npm run dev`.
4. Set `CORS_ORIGINS` to the exact frontend origin(s), comma separated. Production must use the deployed app origin.

Apply reviewed migrations with `npm exec -- prisma migrate deploy` from this directory. Do not use `migrate reset` on a database with application data.

## Integration tests

Integration tests only run when `BILLING_TEST_DATABASE_URL` points to a separately provisioned disposable PostgreSQL database whose database name ends in `_test`. The runner rejects a missing URL, a non-`_test` database, or a URL matching `DATABASE_URL`. Apply the project migrations to that test database with `npm exec -- prisma migrate deploy` from this directory before running `npm test`. Tests create and clean up records only in that dedicated database.

On Windows PowerShell, set the test URL in the current terminal without committing it: `$env:BILLING_TEST_DATABASE_URL = 'postgresql://USER:PASSWORD@127.0.0.1:5432/surat_penawaran_test?schema=public'`. Keep the credential out of command history where possible and never put it in frontend `VITE_` variables.

## Payment verification limitation

The application currently has no user accounts, roles, or identity provider. All quotation, PO, invoice, payment, and attachment API routes are therefore unauthenticated; CORS is not authentication. The backend now refuses to start with `NODE_ENV=production` until authentication and role-based authorization protect every API and private file route. Local development still serves uploaded files without user authorization and must use sample data only. The shared server-side payment token is not a per-user authorization system. Payment history cannot identify an authenticated verifier.
