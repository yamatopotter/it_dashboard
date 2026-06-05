-- Add encrypted credential columns to Device table.
-- After running this migration, execute: npm run migrate:credentials
-- This will encrypt existing plaintext credentials and null the old columns.

ALTER TABLE "Device" ADD COLUMN "routerosUserEnc" TEXT;
ALTER TABLE "Device" ADD COLUMN "routerosPassEnc" TEXT;
