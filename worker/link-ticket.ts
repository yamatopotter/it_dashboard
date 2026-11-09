// Abre um chamado (e-mail) quando um link fica offline por mais de ticketAfterMinutes.
// O aviso instantâneo no Cliq é independente (lib/notify.ts); aqui só o chamado, uma vez por episódio.
import { db } from "../lib/db";
import { sendEmail } from "../lib/email";
import { log } from "../lib/logger";

const DEFAULT_AFTER_MINUTES = 30;

function fmt(d: Date): string {
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

async function audit(linkId: string, name: string, ok: boolean, error?: string): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        action: "CREATE",
        entity: "LinkTicket",
        entityId: linkId,
        entityName: name,
        username: "ticket",
        details: { ok, ...(error ? { error } : {}) },
      },
    });
  } catch (err) {
    log("error", "[Chamado] falha ao registrar auditoria", { error: err instanceof Error ? err.message : String(err) });
  }
}

export async function checkLinkTickets(): Promise<void> {
  try {
    const cfg = await db.systemConfig.findUnique({ where: { id: 1 } });
    const to = cfg?.ticketEmailTo?.trim();
    if (!cfg || !to) return;
    if (!cfg.smtpEnabled || !cfg.smtpHost || !cfg.smtpUser) return;

    // Episódio encerrado: libera um novo chamado para a próxima queda.
    await db.link.updateMany({ where: { isOnline: true, ticketOpenedAt: { not: null } }, data: { ticketOpenedAt: null } });

    const minutes = cfg.ticketAfterMinutes ?? DEFAULT_AFTER_MINUTES;
    const now = new Date();
    const links = await db.link.findMany({
      where: {
        isOnline: false,
        ticketOpenedAt: null,
        offlineAcknowledgedAt: null,
        lastEventAt: { lte: new Date(now.getTime() - minutes * 60_000) },
        OR: [{ maintenanceUntil: null }, { maintenanceUntil: { lte: now } }],
      },
    });

    for (const link of links) {
      if (!link.lastEventAt) continue;
      // Reivindicação atômica: só um ciclo/processo abre o chamado.
      const claim = await db.link.updateMany({
        where: { id: link.id, ticketOpenedAt: null },
        data: { ticketOpenedAt: new Date() },
      });
      if (claim.count !== 1) continue;

      const offlineMin = Math.floor((now.getTime() - link.lastEventAt.getTime()) / 60_000);
      const appUrl = process.env.APP_URL;
      const lines = [
        `O link ${link.name} está fora há ${offlineMin} min.`,
        "",
        `Local: ${link.location ?? link.site ?? "não informado"}`,
        `Fora desde: ${fmt(link.lastEventAt)}`,
        ...(appUrl ? ["", `Detalhes: ${appUrl.replace(/\/$/, "")}/links/${link.id}`] : []),
        "",
        "Chamado aberto automaticamente pelo WatchIT Tower.",
      ];
      try {
        await sendEmail({ subject: `[WatchIT] Link ${link.name} fora há ${offlineMin} min`, text: lines.join("\n"), to });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await db.link.updateMany({ where: { id: link.id }, data: { ticketOpenedAt: null } });
        log("error", "[Chamado] falha ao enviar o e-mail do chamado", { link: link.name, error: msg });
        await audit(link.id, link.name, false, msg);
        continue;
      }
      log("info", "[Chamado] chamado aberto por e-mail", { link: link.name, offlineMin });
      await audit(link.id, link.name, true);
    }
  } catch (err) {
    log("error", "[Chamado] checkLinkTickets falhou", { error: err instanceof Error ? err.message : String(err) });
  }
}
