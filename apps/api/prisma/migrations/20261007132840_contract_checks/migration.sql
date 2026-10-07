-- Defence in depth for SRS FR-2.2 / CR-5: the API validates these too.
ALTER TABLE "contracts"
  ADD CONSTRAINT "contracts_parties_differ" CHECK ("lender_id" <> "borrower_id"),
  ADD CONSTRAINT "contracts_dates_order" CHECK ("end_date" > "start_date"),
  ADD CONSTRAINT "contracts_limit_positive" CHECK ("limit_amount" > 0);

ALTER TABLE "rate_changes"
  ADD CONSTRAINT "rate_changes_rate_range" CHECK ("rate_percent" > 0 AND "rate_percent" <= 100);
