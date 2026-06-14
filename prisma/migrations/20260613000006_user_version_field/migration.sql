-- SEC-027: Add version field to User for optimistic locking
ALTER TABLE "User" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
