-- AlterTable: add offline acknowledgement fields to Device
ALTER TABLE "Device"
  ADD COLUMN "offlineAcknowledgedAt"   TIMESTAMP(3),
  ADD COLUMN "offlineAcknowledgedBy"   TEXT,
  ADD COLUMN "offlineAcknowledgedNote" TEXT;
