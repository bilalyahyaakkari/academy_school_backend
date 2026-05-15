-- Convert "Uniform"."size" from the UniformSize enum to a free-form VARCHAR(20).
-- Existing enum values (S, M, L, XL) cast cleanly to text, so no data loss.

-- AlterTable: cast in-place so existing rows are preserved.
ALTER TABLE "Uniform"
  ALTER COLUMN "size" TYPE VARCHAR(20) USING ("size"::text);

ALTER TABLE "Uniform"
  ALTER COLUMN "orderedAt" SET DEFAULT CURRENT_TIMESTAMP;

-- DropEnum: now safe because no column references it.
DROP TYPE "UniformSize";
