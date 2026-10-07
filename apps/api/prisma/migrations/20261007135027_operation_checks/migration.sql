-- SRS FR-3.1: amounts are positive; the type says the direction.
ALTER TABLE "operations" ADD CONSTRAINT "operations_amount_positive" CHECK ("amount" > 0);
