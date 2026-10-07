-- CreateEnum
CREATE TYPE "operation_type" AS ENUM ('DISBURSEMENT', 'PRINCIPAL_REPAYMENT', 'INTEREST_PAYMENT');

-- CreateTable
CREATE TABLE "operations" (
    "id" UUID NOT NULL,
    "contract_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "type" "operation_type" NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "note" VARCHAR(500),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "operations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "operations_contract_id_date_idx" ON "operations"("contract_id", "date");

-- AddForeignKey
ALTER TABLE "operations" ADD CONSTRAINT "operations_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
