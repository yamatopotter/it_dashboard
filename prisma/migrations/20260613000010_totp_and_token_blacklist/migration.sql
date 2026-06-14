-- SEC-009: TOTP fields on User
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "totpSecret" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "totpEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "passwordChangedAt" TIMESTAMP(3);

-- SEC-021: TokenBlacklist for immediate JWT invalidation
CREATE TABLE IF NOT EXISTS "TokenBlacklist" (
  "jti" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TokenBlacklist_pkey" PRIMARY KEY ("jti")
);
CREATE INDEX IF NOT EXISTS "TokenBlacklist_expiresAt_idx" ON "TokenBlacklist"("expiresAt");
