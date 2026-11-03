-- AlterTable
ALTER TABLE "Quotation" ADD COLUMN IF NOT EXISTS "templateId" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Quotation_templateId_idx" ON "Quotation"("templateId");

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'Quotation_templateId_fkey'
    ) THEN
        ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "LetterTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;
