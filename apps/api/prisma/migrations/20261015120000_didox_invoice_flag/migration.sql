-- CreateTable
CREATE TABLE "didox_invoice_flag" (
    "id" UUID NOT NULL,
    "contract_id" UUID NOT NULL,
    "month" CHAR(7) NOT NULL,
    "state" VARCHAR(12) NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "message" VARCHAR(1000) NOT NULL,
    "didox_document_id" VARCHAR(100),
    "candidate_ids" TEXT[],
    "run_id" VARCHAR(100),
    "created_by_install" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ(3),

    CONSTRAINT "didox_invoice_flag_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "didox_invoice_flag_month_idx" ON "didox_invoice_flag"("month");

-- CreateIndex
CREATE UNIQUE INDEX "didox_invoice_flag_unresolved_key" ON "didox_invoice_flag"("contract_id", "month", "state") WHERE (resolved_at IS NULL);

-- AddForeignKey
ALTER TABLE "didox_invoice_flag" ADD CONSTRAINT "didox_invoice_flag_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- M13 §4.1: month is "yyyy-mm"; a flag is either "needs a person's check" or "skipped this month" by the accountant.
ALTER TABLE "didox_invoice_flag" ADD CONSTRAINT "didox_invoice_flag_month_format" CHECK ("month" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');
ALTER TABLE "didox_invoice_flag" ADD CONSTRAINT "didox_invoice_flag_state_known" CHECK ("state" IN ('needs_check', 'skipped'));
