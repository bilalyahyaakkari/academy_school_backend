-- AlterTable
ALTER TABLE "Uniform" ADD COLUMN     "isReceived" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "receivedAt" DATE;

-- CreateIndex
CREATE INDEX "Uniform_isReceived_idx" ON "Uniform"("isReceived");
