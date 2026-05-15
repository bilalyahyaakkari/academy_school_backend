-- Drop enrollmentDate from Student
ALTER TABLE "Student" DROP COLUMN "enrollmentDate";

-- CreateEnum
CREATE TYPE "UniformSize" AS ENUM ('S', 'M', 'L', 'XL');

-- CreateTable
CREATE TABLE "Uniform" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "size" "UniformSize" NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "isPaid" BOOLEAN NOT NULL DEFAULT false,
    "paidAt" DATE,
    "orderedAt" DATE NOT NULL DEFAULT CURRENT_DATE,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Uniform_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Uniform_studentId_idx" ON "Uniform"("studentId");

-- CreateIndex
CREATE INDEX "Uniform_isPaid_idx" ON "Uniform"("isPaid");

-- AddForeignKey
ALTER TABLE "Uniform" ADD CONSTRAINT "Uniform_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
