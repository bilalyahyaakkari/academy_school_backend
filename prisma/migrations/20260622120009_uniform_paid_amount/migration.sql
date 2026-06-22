-- Add cumulative paid amount to uniforms (for partial-payment support).
ALTER TABLE "Uniform" ADD COLUMN "paidAmount" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- Backfill: rows that were already fully paid should have paidAmount = price
-- so the new field is consistent with the legacy isPaid flag.
UPDATE "Uniform" SET "paidAmount" = "price" WHERE "isPaid" = true;
