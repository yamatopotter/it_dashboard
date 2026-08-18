-- CreateEnum
CREATE TYPE "PhoneStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'CANCELED');

-- AlterTable
ALTER TABLE "Device" ALTER COLUMN "unifiTlsVerify" SET DEFAULT true;

-- AlterTable
ALTER TABLE "SystemConfig" ADD COLUMN     "miradoreApiKeyEnc" TEXT,
ADD COLUMN     "miradoreLastSyncAt" TIMESTAMP(3),
ADD COLUMN     "miradoreLastSyncError" TEXT,
ADD COLUMN     "miradoreSiteName" TEXT,
ADD COLUMN     "miradoreSyncEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "miradoreSyncIntervalMinutes" INTEGER NOT NULL DEFAULT 60,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateTable
CREATE TABLE "Phone" (
    "id" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "department" TEXT,
    "carrier" TEXT,
    "model" TEXT,
    "imei" TEXT,
    "status" "PhoneStatus" NOT NULL DEFAULT 'ACTIVE',
    "invoiceAmountCents" INTEGER,
    "contractStartDate" TIMESTAMP(3),
    "loyaltyEndDate" TIMESTAMP(3),
    "notes" TEXT,
    "miradoreDeviceId" TEXT,
    "miradoreLastSeenAt" TIMESTAMP(3),
    "miradoreBatteryLevel" INTEGER,
    "miradoreOsVersion" TEXT,
    "miradoreManufacturer" TEXT,
    "miradoreComplianceOk" BOOLEAN,
    "miradoreSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Phone_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Phone_phoneNumber_key" ON "Phone"("phoneNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Phone_miradoreDeviceId_key" ON "Phone"("miradoreDeviceId");

-- CreateIndex
CREATE INDEX "Phone_loyaltyEndDate_idx" ON "Phone"("loyaltyEndDate");
