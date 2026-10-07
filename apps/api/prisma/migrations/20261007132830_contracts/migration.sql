-- CreateTable
CREATE TABLE "contracts" (
    "id" UUID NOT NULL,
    "number" VARCHAR(50) NOT NULL,
    "signed_on" DATE NOT NULL,
    "lender_id" UUID NOT NULL,
    "borrower_id" UUID NOT NULL,
    "limit_amount" DECIMAL(18,2) NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_changes" (
    "id" UUID NOT NULL,
    "contract_id" UUID NOT NULL,
    "rate_percent" DECIMAL(7,4) NOT NULL,
    "changed_on" DATE NOT NULL,
    "effective_from" DATE NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rate_changes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "contracts_borrower_id_idx" ON "contracts"("borrower_id");

-- CreateIndex
CREATE UNIQUE INDEX "contracts_lender_id_borrower_id_number_key" ON "contracts"("lender_id", "borrower_id", "number");

-- CreateIndex
CREATE INDEX "rate_changes_contract_id_effective_from_idx" ON "rate_changes"("contract_id", "effective_from");

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_lender_id_fkey" FOREIGN KEY ("lender_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_borrower_id_fkey" FOREIGN KEY ("borrower_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rate_changes" ADD CONSTRAINT "rate_changes_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
