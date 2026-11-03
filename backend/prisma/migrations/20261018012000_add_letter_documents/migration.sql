-- CreateTable
CREATE TABLE "LetterDocument" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "partyName" TEXT NOT NULL DEFAULT '',
    "date" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "purchaseOrderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LetterDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LetterDocument_type_updatedAt_idx" ON "LetterDocument"("type", "updatedAt");

-- CreateIndex
CREATE INDEX "LetterDocument_purchaseOrderId_idx" ON "LetterDocument"("purchaseOrderId");

-- AddForeignKey
ALTER TABLE "LetterDocument" ADD CONSTRAINT "LetterDocument_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
