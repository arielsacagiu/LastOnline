-- AlterTable
ALTER TABLE "Contact" ADD COLUMN "currentLastSeen" TEXT;
ALTER TABLE "Contact" ADD COLUMN "currentStatus" TEXT;
ALTER TABLE "Contact" ADD COLUMN "lastCheckedAt" DATETIME;
