-- AlterTable: add optional MAC address field to Device for Wi-Fi client signal lookup
ALTER TABLE "Device" ADD COLUMN "macAddress" TEXT;
