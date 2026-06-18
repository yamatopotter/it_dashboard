-- AlterTable Device: add custom SNMP OID configuration
ALTER TABLE "Device" ADD COLUMN "snmpCustomOids" JSONB;

-- AlterTable DeviceStatus: add SNMP query results store
ALTER TABLE "DeviceStatus" ADD COLUMN "snmpData" JSONB;
