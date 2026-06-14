-- Performance indexes for frequently filtered/joined columns

-- Device.type: filtered by GET /api/devices?type= and force-check by type
CREATE INDEX "Device_type_idx" ON "Device"("type");

-- Link.mikrotikDeviceId: FK joined on every pollLinks() cycle (every 60s) and on device delete cascade
CREATE INDEX "Link_mikrotikDeviceId_idx" ON "Link"("mikrotikDeviceId");

-- AuditLog.ipAddress: security investigations filter audit trail by source IP
CREATE INDEX "AuditLog_ipAddress_timestamp_idx" ON "AuditLog"("ipAddress", "timestamp");
