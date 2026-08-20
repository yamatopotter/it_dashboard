-- AlterTable
ALTER TABLE "SystemConfig" ADD COLUMN "dattoEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "dattoPlatform" TEXT,
ADD COLUMN "dattoApiKeyEnc" TEXT,
ADD COLUMN "dattoSecretKeyEnc" TEXT,
ADD COLUMN "dattoSyncEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "dattoSyncIntervalMinutes" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN "dattoLastSyncAt" TIMESTAMP(3),
ADD COLUMN "dattoLastSyncError" TEXT;

-- CreateTable
CREATE TABLE "Computer" (
    "id" TEXT NOT NULL,
    "dattoDeviceUid" TEXT NOT NULL,
    "hostname" TEXT NOT NULL,
    "siteName" TEXT,
    "deviceType" TEXT,
    "operatingSystem" TEXT,
    "intIpAddress" TEXT,
    "extIpAddress" TEXT,
    "lastLoggedInUser" TEXT,
    "online" BOOLEAN NOT NULL DEFAULT false,
    "lastSeenAt" TIMESTAMP(3),
    "lastRebootAt" TIMESTAMP(3),
    "lastAuditAt" TIMESTAMP(3),
    "deletedInDatto" BOOLEAN NOT NULL DEFAULT false,
    "openAlerts" JSONB,
    "openAlertsCount" INTEGER NOT NULL DEFAULT 0,
    "highestAlertPriority" TEXT,
    "syncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Computer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Computer_dattoDeviceUid_key" ON "Computer"("dattoDeviceUid");

-- CreateIndex
CREATE INDEX "Computer_online_idx" ON "Computer"("online");

-- CreateIndex
CREATE INDEX "Computer_siteName_idx" ON "Computer"("siteName");
