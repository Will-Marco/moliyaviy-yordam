-- SRS FR-8.4: a draft mark says who made it — the accountant by hand, or the app after saving it in Didox.
ALTER TABLE "invoice_drafts" ADD COLUMN "source" VARCHAR(10) NOT NULL DEFAULT 'manual';
ALTER TABLE "invoice_drafts" ADD CONSTRAINT "invoice_drafts_source_known" CHECK ("source" IN ('manual', 'didox'));
