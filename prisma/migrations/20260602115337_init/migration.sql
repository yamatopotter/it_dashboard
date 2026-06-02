-- CreateTable
CREATE TABLE "Device" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "type" TEXT NOT NULL,
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "DeviceStatus" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "deviceId" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "pingMs" INTEGER,
    "httpOk" BOOLEAN,
    "uptime" BIGINT,
    "cpuLoad" REAL,
    "memoryUsed" REAL,
    "checkedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DeviceStatus_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StatusHistory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "deviceId" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL,
    "pingMs" INTEGER,
    "cpuLoad" REAL,
    "memoryUsed" REAL,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StatusHistory_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "DeviceStatus_deviceId_key" ON "DeviceStatus"("deviceId");

-- CreateIndex
CREATE INDEX "StatusHistory_deviceId_timestamp_idx" ON "StatusHistory"("deviceId", "timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
