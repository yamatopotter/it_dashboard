-- AlterTable
ALTER TABLE "SystemConfig" ADD COLUMN "zohoEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "zohoClientId" TEXT,
ADD COLUMN "zohoClientSecretEnc" TEXT,
ADD COLUMN "zohoAccountsUrl" TEXT NOT NULL DEFAULT 'https://accounts.zoho.com';
