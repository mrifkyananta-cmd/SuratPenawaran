-- CreateTable
CREATE TABLE IF NOT EXISTS "LetterTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "letterType" TEXT NOT NULL,
    "description" TEXT,
    "originalFilename" TEXT NOT NULL,
    "storedFilename" TEXT NOT NULL,
    "fileFormat" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LetterTemplate_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "LetterDocument" ADD COLUMN IF NOT EXISTS "templateId" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "LetterTemplate_letterType_isActive_idx" ON "LetterTemplate"("letterType", "isActive");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "LetterDocument_templateId_idx" ON "LetterDocument"("templateId");

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'LetterDocument_templateId_fkey'
    ) THEN
        ALTER TABLE "LetterDocument" ADD CONSTRAINT "LetterDocument_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "LetterTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;
