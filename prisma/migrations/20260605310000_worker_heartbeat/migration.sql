CREATE TABLE "WorkerHeartbeat" (
  "id"     INTEGER NOT NULL DEFAULT 1,
  "seenAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "WorkerHeartbeat_pkey" PRIMARY KEY ("id")
);
