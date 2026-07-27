-- AlterTable Device: monitor de gravação NVR (type = DVR) + vínculo canal/câmera (type = CAMERA)
ALTER TABLE "Device" ADD COLUMN "nvrEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Device" ADD COLUMN "nvrUserEnc" TEXT;
ALTER TABLE "Device" ADD COLUMN "nvrPassEnc" TEXT;
ALTER TABLE "Device" ADD COLUMN "nvrPort" INTEGER NOT NULL DEFAULT 80;
ALTER TABLE "Device" ADD COLUMN "nvrUseHttps" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Device" ADD COLUMN "nvrMaxGapMinutes" INTEGER NOT NULL DEFAULT 5;
ALTER TABLE "Device" ADD COLUMN "nvrHoursWindow" INTEGER NOT NULL DEFAULT 24;
ALTER TABLE "Device" ADD COLUMN "nvrCheckIntervalMinutes" INTEGER NOT NULL DEFAULT 1440;
ALTER TABLE "Device" ADD COLUMN "parentNvrId" TEXT;
ALTER TABLE "Device" ADD COLUMN "parentNvrChannel" INTEGER;

-- CreateIndex
CREATE INDEX "Device_parentNvrId_idx" ON "Device"("parentNvrId");

-- AddForeignKey (self-relation: câmera -> canal do DVR)
ALTER TABLE "Device" ADD CONSTRAINT "Device_parentNvrId_fkey" FOREIGN KEY ("parentNvrId") REFERENCES "Device"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable DeviceStatus: saúde de disco/espaço do NVD + contagem de canais
ALTER TABLE "DeviceStatus" ADD COLUMN "nvrDiskData" JSONB;
ALTER TABLE "DeviceStatus" ADD COLUMN "nvrDiskError" TEXT;
ALTER TABLE "DeviceStatus" ADD COLUMN "nvrChannelsOk" INTEGER;
ALTER TABLE "DeviceStatus" ADD COLUMN "nvrChannelsTotal" INTEGER;

-- AlterTable SystemConfig: e-mail SMTP genérico
ALTER TABLE "SystemConfig" ADD COLUMN "smtpEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SystemConfig" ADD COLUMN "smtpHost" TEXT;
ALTER TABLE "SystemConfig" ADD COLUMN "smtpPort" INTEGER NOT NULL DEFAULT 587;
ALTER TABLE "SystemConfig" ADD COLUMN "smtpSecure" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SystemConfig" ADD COLUMN "smtpUser" TEXT;
ALTER TABLE "SystemConfig" ADD COLUMN "smtpPasswordEnc" TEXT;
ALTER TABLE "SystemConfig" ADD COLUMN "smtpFrom" TEXT;
ALTER TABLE "SystemConfig" ADD COLUMN "alertEmailTo" TEXT;

-- CreateTable
CREATE TABLE "NvrChannelIssue" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "channel" INTEGER NOT NULL,
    "channelName" TEXT NOT NULL,
    "issueType" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "gapMinutes" DOUBLE PRECISION,
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "alertedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NvrChannelIssue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NvrChannelIssue_deviceId_channel_detectedAt_idx" ON "NvrChannelIssue"("deviceId", "channel", "detectedAt");

-- CreateIndex (parcial, não representável no schema.prisma — mantém no máximo
-- uma linha aberta por canal+tipo de problema em andamento; linhas "gap" nascem
-- com resolvedAt já preenchido, então nunca colidem aqui)
CREATE UNIQUE INDEX "ux_nvr_channel_issues_open" ON "NvrChannelIssue"("deviceId", "channel", "issueType") WHERE "resolvedAt" IS NULL;

-- AddForeignKey
ALTER TABLE "NvrChannelIssue" ADD CONSTRAINT "NvrChannelIssue_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;
