import { db } from "../lib/db";
import { sendEmail } from "../lib/email";
import { log } from "../lib/logger";
import type { ChannelIssue } from "./monitors/nvr";

// Só estes dois tipos disparam e-mail (R4 do requirements.md) — "gap" é só
// histórico e "unreachable" fica registrado sem alertar.
const ALERT_TYPES = new Set(["not_recording_now", "no_recordings"]);
const ALERT_COOLDOWN_HOURS = 2;

export function wasRecentlyAlerted(alertedAt: Date | null, hours = ALERT_COOLDOWN_HOURS): boolean {
  if (!alertedAt) return false;
  return Date.now() - alertedAt.getTime() < hours * 60 * 60 * 1000;
}

async function upsertOngoingIssue(
  deviceId: string,
  issue: ChannelIssue
): Promise<{ id: string; alertedAt: Date | null }> {
  const existing = await db.nvrChannelIssue.findFirst({
    where: { deviceId, channel: issue.channel, issueType: issue.issueType, resolvedAt: null },
  });

  if (existing) {
    const updated = await db.nvrChannelIssue.update({
      where: { id: existing.id },
      data: { detail: issue.detail, gapMinutes: issue.gapMinutes, periodEnd: issue.periodEnd, lastSeenAt: new Date() },
    });
    return { id: updated.id, alertedAt: updated.alertedAt };
  }

  const created = await db.nvrChannelIssue.create({
    data: {
      deviceId,
      channel: issue.channel,
      channelName: issue.channelName,
      issueType: issue.issueType,
      detail: issue.detail,
      gapMinutes: issue.gapMinutes,
      periodStart: issue.periodStart,
      periodEnd: issue.periodEnd,
    },
  });
  return { id: created.id, alertedAt: created.alertedAt };
}

// Persiste as issues de um ciclo de validação, dispara e-mail (com dedup de
// 2h) para not_recording_now/no_recordings, e fecha (resolvedAt) qualquer
// linha aberta cujo canal+tipo não apareceu neste run — o NVD é validado por
// completo a cada ciclo, então "não apareceu" significa "voltou ao normal".
export async function processChannelIssues(
  deviceId: string,
  deviceName: string,
  issues: ChannelIssue[]
): Promise<void> {
  const foundKeys = new Set<string>();

  for (const issue of issues) {
    if (issue.issueType === "gap") {
      // Evento pontual — só é relatado depois que a gravação já retomou,
      // então já nasce resolvido (ver design.md sobre o índice único parcial).
      await db.nvrChannelIssue.create({
        data: {
          deviceId,
          channel: issue.channel,
          channelName: issue.channelName,
          issueType: issue.issueType,
          detail: issue.detail,
          gapMinutes: issue.gapMinutes,
          periodStart: issue.periodStart,
          periodEnd: issue.periodEnd,
          resolvedAt: new Date(),
        },
      });
      continue;
    }

    foundKeys.add(`${issue.channel}:${issue.issueType}`);
    const { id, alertedAt } = await upsertOngoingIssue(deviceId, issue);

    if (ALERT_TYPES.has(issue.issueType) && !wasRecentlyAlerted(alertedAt)) {
      try {
        await sendEmail({
          subject: `[WatchIT Tower] ${deviceName} — canal ${issue.channel} (${issue.channelName})`,
          text: `${issue.issueType}: ${issue.detail}`,
        });
        await db.nvrChannelIssue.update({ where: { id }, data: { alertedAt: new Date() } });
      } catch (err) {
        log("error", "[NVR] falha ao enviar e-mail de alerta", {
          device: deviceName,
          channel: issue.channel,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  const openIssues = await db.nvrChannelIssue.findMany({ where: { deviceId, resolvedAt: null } });
  const toClose = openIssues.filter((row) => !foundKeys.has(`${row.channel}:${row.issueType}`));
  if (toClose.length > 0) {
    await db.nvrChannelIssue.updateMany({
      where: { id: { in: toClose.map((r) => r.id) } },
      data: { resolvedAt: new Date() },
    });
  }
}
