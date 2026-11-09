-- Chamado automático por e-mail quando um link fica offline por muito tempo
ALTER TABLE "Link" ADD COLUMN "ticketOpenedAt" TIMESTAMP(3);
ALTER TABLE "SystemConfig" ADD COLUMN "ticketEmailTo" TEXT;
ALTER TABLE "SystemConfig" ADD COLUMN "ticketAfterMinutes" INTEGER NOT NULL DEFAULT 30;
