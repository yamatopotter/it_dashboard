-- AlterTable
ALTER TABLE "SystemConfig" ADD COLUMN "moduleTelephony" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "moduleComputers" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "moduleNvr" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "defaultUi" TEXT NOT NULL DEFAULT 'tower',
ADD COLUMN "allowUserUi" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "cliqEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "cliqWebhookUrlEnc" TEXT,
ADD COLUMN "cliqChannel" TEXT,
ADD COLUMN "cliqRenotifyMinutes" INTEGER NOT NULL DEFAULT 15,
ADD COLUMN "cliqLastTestAt" TIMESTAMP(3),
ADD COLUMN "cliqLastError" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN "uiPreference" TEXT;

-- AlterTable
ALTER TABLE "Device" ADD COLUMN "site" TEXT,
ADD COLUMN "cliqNotifiedAt" TIMESTAMP(3),
ADD COLUMN "cliqRenotifiedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Link" ADD COLUMN "site" TEXT,
ADD COLUMN "maintenanceUntil" TIMESTAMP(3),
ADD COLUMN "offlineAcknowledgedAt" TIMESTAMP(3),
ADD COLUMN "offlineAcknowledgedBy" TEXT,
ADD COLUMN "offlineAcknowledgedNote" TEXT,
ADD COLUMN "cliqNotifiedAt" TIMESTAMP(3),
ADD COLUMN "cliqRenotifiedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Device_site_idx" ON "Device"("site");

-- CreateIndex
CREATE INDEX "Link_site_idx" ON "Link"("site");
