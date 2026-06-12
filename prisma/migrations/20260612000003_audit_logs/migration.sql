CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'LOGIN_FAILED', 'CLEANUP');

CREATE TABLE "AuditLog" (
    "id"         TEXT NOT NULL,
    "timestamp"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId"     TEXT,
    "username"   TEXT,
    "action"     "AuditAction" NOT NULL,
    "entity"     TEXT NOT NULL,
    "entityId"   TEXT,
    "entityName" TEXT,
    "details"    JSONB,
    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AuditLog_timestamp_idx"        ON "AuditLog"("timestamp");
CREATE INDEX "AuditLog_entity_timestamp_idx" ON "AuditLog"("entity", "timestamp");
CREATE INDEX "AuditLog_userId_timestamp_idx" ON "AuditLog"("userId", "timestamp");
