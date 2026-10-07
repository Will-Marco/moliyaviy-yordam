-- CreateTable
CREATE TABLE "invoice_drafts" (
    "id" UUID NOT NULL,
    "contract_id" UUID NOT NULL,
    "month" CHAR(7) NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "didox_document_id" VARCHAR(100),
    "drafted_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "invoice_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "invoice_drafts_month_idx" ON "invoice_drafts"("month");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_drafts_contract_id_month_key" ON "invoice_drafts"("contract_id", "month");

-- AddForeignKey
ALTER TABLE "invoice_drafts" ADD CONSTRAINT "invoice_drafts_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
