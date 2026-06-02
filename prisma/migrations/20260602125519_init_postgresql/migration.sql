-- CreateEnum
CREATE TYPE "DeviceType" AS ENUM ('MIKROTIK', 'DVR', 'CAMERA', 'OTHER');

-- CreateEnum
CREATE TYPE "NoteSeverity" AS ENUM ('INFO', 'WARNING', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "NoteCategory" AS ENUM ('SECURITY', 'OPERATIONAL', 'GENERAL');

-- CreateEnum
CREATE TYPE "NoteStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED');

-- CreateTable
CREATE TABLE "Device" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "type" "DeviceType" NOT NULL,
    "location" TEXT,
    "notes" TEXT,
    "pingEnabled" BOOLEAN NOT NULL DEFAULT true,
    "httpEnabled" BOOLEAN NOT NULL DEFAULT false,
    "httpPort" INTEGER,
    "httpPath" TEXT NOT NULL DEFAULT '/',
    "snmpEnabled" BOOLEAN NOT NULL DEFAULT false,
    "snmpCommunity" TEXT NOT NULL DEFAULT 'public',
    "snmpPort" INTEGER NOT NULL DEFAULT 161,
    "routerosEnabled" BOOLEAN NOT NULL DEFAULT false,
    "routerosUser" TEXT,
    "routerosPass" TEXT,
    "routerosPort" INTEGER NOT NULL DEFAULT 8728,
    "checkInterval" INTEGER NOT NULL DEFAULT 60,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeviceStatus" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "pingMs" INTEGER,
    "httpOk" BOOLEAN,
    "uptime" BIGINT,
    "cpuLoad" DOUBLE PRECISION,
    "memoryUsed" DOUBLE PRECISION,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeviceStatus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StatusHistory" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL,
    "pingMs" INTEGER,
    "cpuLoad" DOUBLE PRECISION,
    "memoryUsed" DOUBLE PRECISION,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Note" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "severity" "NoteSeverity" NOT NULL DEFAULT 'INFO',
    "category" "NoteCategory" NOT NULL DEFAULT 'GENERAL',
    "status" "NoteStatus" NOT NULL DEFAULT 'OPEN',
    "deviceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "Note_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DeviceStatus_deviceId_key" ON "DeviceStatus"("deviceId");

-- CreateIndex
CREATE INDEX "StatusHistory_deviceId_timestamp_idx" ON "StatusHistory"("deviceId", "timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- AddForeignKey
ALTER TABLE "DeviceStatus" ADD CONSTRAINT "DeviceStatus_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StatusHistory" ADD CONSTRAINT "StatusHistory_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE SET NULL ON UPDATE CASCADE;
