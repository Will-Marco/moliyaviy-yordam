-- SRS FR-7.4: a draft is recorded only for a month with positive interest; month is "yyyy-mm".
ALTER TABLE "invoice_drafts" ADD CONSTRAINT "invoice_drafts_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "invoice_drafts" ADD CONSTRAINT "invoice_drafts_month_format" CHECK ("month" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');
