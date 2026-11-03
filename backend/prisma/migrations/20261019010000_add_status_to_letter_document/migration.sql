-- AlterTable
ALTER TABLE "LetterDocument" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'Draft';
