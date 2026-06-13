CREATE TABLE IF NOT EXISTS "RateLimit" (
  "ip"      TEXT NOT NULL,
  "count"   INTEGER NOT NULL DEFAULT 1,
  "resetAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RateLimit_pkey" PRIMARY KEY ("ip")
);

CREATE INDEX IF NOT EXISTS "RateLimit_resetAt_idx" ON "RateLimit"("resetAt");
