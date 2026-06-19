-- AlterTable
ALTER TABLE "Student" ADD COLUMN     "archived" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "archivedAt" TIMESTAMP(3);
