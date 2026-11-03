"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Panel } from "@/components/tui/panel";
import { Bar } from "@/components/tui/bar";
import { StateGlyph } from "@/components/tui/state-glyph";
import { LNK_CSS } from "@/components/tui/lnk-styles";
import { formatBps, formatDuration, fmtDateTime, fmtDate } from "@/lib/format";

type SegState = "online" | "offline" | "degraded" | "empty";

const SEG_CLASS: Record<SegState, string> = { online: "", offline: "crit", degraded: "warn", empty: "empty" };
const SEG_LABEL: Record<SegState, string> = { online: "online", offline: "offline", degraded: "instável", empty: "sem dados" };

interface LinkEvent {
  id: string; linkId: string; type: "UP" | "DOWN"; timestamp: string;
}
interface LinkData {
  id: string; name: string; description: string | null;
  location: string | null; isOnline: boolean;
  lastEventAt: string | null; createdAt: string;
  downloadBps: number | null; uploadBps: number | null; latencyMs: number | null;
  contractedDownloadBps?: number | null; contractedUploadBps?: number | null;
  mikrotikInterface: string | null;
}

interface EventsResponse {
  link: LinkData; events: LinkEvent[]; lastBefore: LinkEvent | null; since: string;
}

// ─── Uptime from events ──────────────────────────────────────────────────────

function calcUptimePct(events: LinkEvent[], lastBefore: LinkEvent | null, sinceMs: number, currentStatus: boolean, now: number) {
  let state = lastBefore ? lastBefore.type === "UP" : currentStatus;
  let up = 0, prev = sinceMs;
  for (const ev of events) {
    const t = new Date(ev.timestamp).getTime();
    if (state) up += t - prev;
    prev = t; state = ev.type === "UP";
  }
  if (state) up += now - prev;
  const total = now - sinceMs;
  return total > 0 ? (up / total) * 100 : 100;
}

function buildSegments(events: LinkEvent[], lastBefore: LinkEvent | null, sinceMs: number, currentStatus: boolean, now: number): SegState[] {
  return Array.from({ length: 48 }, (_, i) => {
    const segEnd = now - i * 1_800_000;
    const segStart = segEnd - 1_800_000;
    if (segStart < sinceMs) return "empty";
    const inSeg = events.filter((e) => {
      const t = new Date(e.timestamp).getTime();
      return t >= segStart && t < segEnd;
    });
    if (inSeg.length === 0) {
      const before = [lastBefore, ...events].filter(Boolean)
        .filter((e) => new Date(e!.timestamp).getTime() < segStart) as LinkEvent[];
      if (before.length === 0) return currentStatus ? "online" : "offline";
      return before[before.length - 1].type === "UP" ? "online" : "offline";
    }
    const hasDown = inSeg.some((e) => e.type === "DOWN");
    if (!hasDown) return "online";
    return inSeg[inSeg.length - 1].type === "UP" ? "degraded" : "offline";
  }).reverse();
}

function calcOutages(events: LinkEvent[]) {
  return events.filter((e) => e.type === "DOWN").length;
}

function pctOf(current: number | null, contracted: number | null | undefined) {
  return current != null && contracted && contracted > 0 ? Math.min((current / contracted) * 100, 100) : null;
}

// ─── Drawer ───────────────────────────────────────────────────────────────────

interface Props { linkId: string | null; onClose: () => void; }

/** Painel lateral do link no padrão TUI: estado, métricas de disponibilidade, tráfego com barras, disponibilidade 24h. */
export function LinkDetailDrawer({ linkId, onClose }: Props) {
  const [loaded, setLoaded] = useState<EventsResponse | null>(null);
  // Instante da última carga, para calcular janelas sem chamar Date.now() durante o render.
  const [nowMs, setNowMs] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async (id: string, signal?: AbortSignal) => {
    try {
      const res = await fetch(`/api/links/${id}/events?hours=720`, { signal });
      if (res.ok) {
        setLoaded(await res.json());
        setNowMs(Date.now());
      }
    } catch (err) {
      if (signal?.aborted || (err instanceof DOMException && err.name === "AbortError")) return;
    }
  }, []);

  useEffect(() => {
    if (!linkId) return;
    const controller = new AbortController();
    // Carga inicial do link aberto (sincroniza com a API); o setState ocorre após o await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchData(linkId, controller.signal);
    const t = setInterval(() => void fetchData(linkId, controller.signal), 30_000);
    return () => { clearInterval(t); controller.abort(); };
  }, [linkId, fetchData]);

  async function refresh() {
    if (!linkId) return;
    setRefreshing(true);
    await fetchData(linkId);
    setRefreshing(false);
  }

  // Dados de outro link (ou nenhum) contam como "carregando"
  const data = linkId && loaded?.link.id === linkId ? loaded : null;
  const loading = linkId !== null && (data === null || refreshing);
  const link = data?.link;
  const events = data?.events ?? [];
  const lastBefore = data?.lastBefore ?? null;
  const sinceMs = data ? new Date(data.since).getTime() : nowMs - 30 * 24 * 3_600_000;

  const uptime30d = link ? calcUptimePct(events, lastBefore, sinceMs, link.isOnline, nowMs) : null;
  const outages = calcOutages(events);

  const since24h = nowMs - 24 * 3_600_000;
  const events24h = events.filter((e) => new Date(e.timestamp).getTime() >= since24h);
  const uptime24h = link ? calcUptimePct(events24h, lastBefore, since24h, link.isOnline, nowMs) : null;

  let downMs = 0;
  {
    let state = lastBefore ? lastBefore.type === "UP" : (link?.isOnline ?? true);
    let prev = sinceMs;
    for (const ev of events) {
      const t = new Date(ev.timestamp).getTime();
      if (!state) downMs += t - prev;
      prev = t; state = ev.type === "UP";
    }
    if (!state) downMs += nowMs - prev;
  }

  const segments = link
    ? buildSegments(events24h, lastBefore, since24h, link.isOnline, nowMs)
    : Array(48).fill("empty" as SegState);
  const hasTraffic = link != null && (link.downloadBps != null || link.uploadBps != null);

  return (
    <Sheet open={linkId !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" showCloseButton={false}
        className="sm:max-w-[440px] w-full p-0 flex flex-col gap-0 overflow-y-auto">
        <div className="tui lnk drawer">
          <style>{LNK_CSS}</style>

          <header className="lnk-head" style={{ alignItems: "center" }}>
            {loading || !link ? (
              <span className="dim" role="status">◌ carregando link…</span>
            ) : (
              <>
                <StateGlyph state={link.isOnline ? "ok" : "crit"} label={link.isOnline ? "online" : "offline"} />
                <h1 style={{ color: "var(--fg)" }}>{link.name}</h1>
                <span className={link.isOnline ? "ok" : "crit"}>{link.isOnline ? "ONLINE" : "OFFLINE"}</span>
              </>
            )}
            <span className="spacer" />
            <button type="button" className="btn" onClick={onClose} aria-label="Fechar painel">
              <kbd>esc</kbd>fechar
            </button>
          </header>

          <div className="stack">
            <Panel title="disponibilidade" sub="30d / 24h" color={link && !link.isOnline ? "crit" : "ok"} hot={link ? !link.isOnline : false}>
              {loading || !link ? (
                <p className="note">◌ calculando…</p>
              ) : (
                <dl className="kv" style={{ gridTemplateColumns: "14ch 1fr" }}>
                  <dt>uptime 30d</dt><dd>{uptime30d != null ? `${uptime30d.toFixed(2)}%` : "—"}</dd>
                  <dt>uptime 24h</dt><dd>{uptime24h != null ? `${uptime24h.toFixed(2)}%` : "—"}</dd>
                  <dt>quedas 30d</dt><dd className={outages > 0 ? "warn" : undefined}>{outages}</dd>
                  <dt>tempo offline</dt><dd>{downMs > 0 ? formatDuration(downMs) : "0"}</dd>
                </dl>
              )}
              <div style={{ marginTop: 10 }}>
                <div className="dim" style={{ fontSize: 11 }}>últimas 24h, cada marca = 30 min</div>
                <div className="segs" role="img" aria-label={`Disponibilidade 24h: ${segments.filter((s) => s === "online").length} de 48 intervalos online`} style={{ marginTop: 4 }}>
                  {segments.map((s, i) => (
                    <i key={i} className={SEG_CLASS[s as SegState]} title={SEG_LABEL[s as SegState]} />
                  ))}
                </div>
              </div>
            </Panel>

            {!loading && link && (
              <Panel title="tráfego atual" sub={link.mikrotikInterface ?? undefined} color="info">
                {hasTraffic ? (
                  <dl className="kv" style={{ gridTemplateColumns: "8ch 1fr", alignItems: "center" }}>
                    <dt>↓ down</dt>
                    <dd>
                      <span className="ok">{formatBps(link.downloadBps)}</span>{" "}
                      {link.contractedDownloadBps ? <><Bar pct={pctOf(link.downloadBps, link.contractedDownloadBps)} width="9ch" label="uso do download contratado" /> <span className="dim">/ {formatBps(link.contractedDownloadBps)}</span></> : null}
                    </dd>
                    <dt>↑ up</dt>
                    <dd>
                      <span className="info">{formatBps(link.uploadBps)}</span>{" "}
                      {link.contractedUploadBps ? <><Bar pct={pctOf(link.uploadBps, link.contractedUploadBps)} width="9ch" label="uso do upload contratado" /> <span className="dim">/ {formatBps(link.contractedUploadBps)}</span></> : null}
                    </dd>
                    {link.latencyMs != null && (<><dt>latência</dt><dd>{link.latencyMs} ms</dd></>)}
                  </dl>
                ) : (
                  <p className="note">
                    <span className="warn">▲ tráfego não monitorado.</span> Associe um Mikrotik e uma interface a este link para habilitar Download/Upload via RouterOS.
                  </p>
                )}
              </Panel>
            )}

            {!loading && link && (
              <Panel title="informações" color="dim">
                <dl className="kv" style={{ gridTemplateColumns: "14ch 1fr" }}>
                  <dt>tipo</dt><dd>Link de internet</dd>
                  {link.description && (<><dt>descrição</dt><dd>{link.description}</dd></>)}
                  {link.location && (<><dt>local</dt><dd>{link.location}</dd></>)}
                  {link.lastEventAt && (<><dt>último evento</dt><dd>{fmtDateTime(link.lastEventAt, { dateStyle: "short", timeStyle: "short" })}</dd></>)}
                  <dt>cadastrado em</dt><dd>{fmtDate(link.createdAt)}</dd>
                </dl>
              </Panel>
            )}

            {link && (
              <div className="btns">
                <button type="button" className="btn primary" onClick={() => void refresh()} disabled={loading}>
                  {loading ? "atualizando…" : "testar agora"}
                </button>
                <Link href={`/links/${link.id}`} onClick={onClose} className="btn" style={{ textDecoration: "none" }}>
                  histórico completo
                </Link>
              </div>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
