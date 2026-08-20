-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "AuthProvider" AS ENUM ('LOCAL', 'ZOHO');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "password" DROP NOT NULL;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "email" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "authProvider" "AuthProvider" NOT NULL DEFAULT 'LOCAL';

-- CreateIndex
DO $$ BEGIN
    CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
EXCEPTION
    WHEN duplicate_table THEN null;
END $$;
