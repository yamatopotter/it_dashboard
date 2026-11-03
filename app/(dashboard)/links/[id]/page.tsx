"use client";

import { useEffect, useState, use, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Panel } from "@/components/tui/panel";
import { Spark } from "@/components/tui/spark";
import { StateGlyph } from "@/components/tui/state-glyph";
import { LnkShell } from "@/components/tui/lnk-shell";
import { LnkChips, LnkError, LnkLoading } from "@/components/tui/lnk-parts";
import type { HelpRow } from "@/components/tui/help-overlay";
import type { KeyHint } from "@/components/tui/key-hints";
import { useHotkeys, type HotkeyMap } from "@/hooks/use-hotkeys";
import { useLiveTraffic, LIVE_INTERVAL_MS } from "@/hooks/use-live-traffic";
import { formatBps, formatDuration, fmtTime, fmtDateTime } from "@/lib/format";

interface LinkEvent {
  id: string;
  linkId: string;
  type: "UP" | "DOWN";
  timestamp: string;
}

interface LinkData {
  id: string;
  name: string;
  description: string | null;
  location: string | null;
  isOnline: boolean;
  lastEventAt: string | null;
  createdAt: string;
  downloadBps: number | null;
  uploadBps: number | null;
  latencyMs: number | null;
  mikrotikInterface: string | null;
  webhookToken?: string;
}

interface EventsResponse {
  link: LinkData;
  events: LinkEvent[];
  lastBefore: LinkEvent | null;
  since: string;
}

type Window = 6 | 24 | 72 | 168;

const SLOTS = 72;

/** Estado (online/offline) de cada fatia do período, para a linha do tempo em blocos. */
function buildSlots(events: LinkEvent[], lastBefore: LinkEvent | null, sinceMs: number, currentStatus: boolean) {
  const now = Date.now();
  const step = (now - sinceMs) / SLOTS;
  let state = lastBefore ? lastBefore.type === "UP" : currentStatus;
  let idx = 0;
  const times = events.map((e) => new Date(e.timestamp).getTime());
  return Array.from({ length: SLOTS }, (_, i) => {
    const start = sinceMs + i * step;
    const end = start + step;
    let hadDown = false;
    let ups = false;
    while (idx < events.length && times[idx] < end) {
      if (events[idx].type === "DOWN") hadDown = true;
      else ups = true;
      state = events[idx].type === "UP";
      idx++;
    }
    const cls = !state ? "crit" : hadDown && ups ? "warn" : "";
    const label = cls === "crit" ? "offline" : cls === "warn" ? "instável" : "online";
    return { cls, title: `${fmtDateTime(start)}: ${label}` };
  });
}

function calcUptime(events: LinkEvent[], lastBefore: LinkEvent | null, sinceMs: number, currentStatus: boolean) {
  const now = Date.now();
  let state = lastBefore ? lastBefore.type === "UP" : currentStatus;
  let upTime = 0;
  let prev = sinceMs;

  for (const ev of events) {
    const ts = new Date(ev.timestamp).getTime();
    if (state) upTime += ts - prev;
    prev = ts;
    state = ev.type === "UP";
  }
  if (state) upTime += now - prev;

  const total = now - sinceMs;
  return total > 0 ? (upTime / total) * 100 : 100;
}

function calcOutages(events: LinkEvent[]) {
  return events.filter((e) => e.type === "DOWN").length;
}

function calcTotalDowntime(events: LinkEvent[], lastBefore: LinkEvent | null, sinceMs: number, currentStatus: boolean) {
  const now = Date.now();
  let state = lastBefore ? lastBefore.type === "UP" : currentStatus;
  let downTime = 0;
  let prev = sinceMs;

  for (const ev of events) {
    const ts = new Date(ev.timestamp).getTime();
    if (!state) downTime += ts - prev;
    prev = ts;
    state = ev.type === "UP";
  }
  if (!state) downTime += now - prev;

  return downTime;
}

async function copyText(text: string) {
  if (navigator.clipboard) {
    await navigator.clipboard.writeText(text);
  } else {
    // Fallback para HTTP/contextos sem Clipboard API
    const el = document.createElement("textarea");
    el.value = text;
    el.style.cssText = "position:fixed;opacity:0;pointer-events:none";
    document.body.appendChild(el);
    el.select();
    document.execCommand("copy");
    document.body.removeChild(el);
  }
}

const WINDOWS: { label: string; value: Window }[] = [
  { label: "6h", value: 6 },
  { label: "24h", value: 24 },
  { label: "3d", value: 72 },
  { label: "7d", value: 168 },
];

const HELP: HelpRow[] = [
  ["1 2 3 4", "período: 6h / 24h / 3d / 7d"],
  ["l", "iniciar/parar tráfego em tempo real"],
  ["d u", "copiar URL do webhook DOWN / UP"],
  ["b", "voltar para a lista de links"],
  ["esc", "fechar ajuda"],
];

export default function LinkDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [data, setData] = useState<EventsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [win, setWin] = useState<Window>(24);
  const [help, setHelp] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const live = useLiveTraffic(id);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/links/${id}/events?hours=${win}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => { setData(d); setUpdatedAt(new Date()); })
      .catch(() => setError("Não foi possível carregar o link."))
      .finally(() => setLoading(false));
  }, [id, win]);

  // Carrega ao montar e ao trocar o período; o setState de resultado ocorre após o fetch.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  const link = data?.link;
  // Só usado depois do fetch (cliente), sem divergência de hidratação.
  const origin = globalThis.window?.location.origin ?? "";

  async function copyWebhook(type: "down" | "up") {
    if (!link?.webhookToken) return;
    try {
      await copyText(`${origin}/api/links/${id}/${type}?token=${link.webhookToken}`);
      toast.success("URL copiada para a área de transferência");
    } catch {
      toast.error("Não foi possível copiar a URL");
    }
  }

  const keys: HotkeyMap = { "?": () => setHelp((h) => !h), Escape: () => setHelp(false) };
  if (!help) {
    Object.assign(keys, {
      "1": () => setWin(6), "2": () => setWin(24), "3": () => setWin(72), "4": () => setWin(168),
      l: () => { if (link?.mikrotikInterface) live.toggle(); },
      d: () => void copyWebhook("down"),
      u: () => void copyWebhook("up"),
      b: () => router.push("/links"),
    });
  }
  useHotkeys(keys);

  const hints: KeyHint[] = [
    { keys: ["1", "–", "4"], label: "período" },
    ...(link?.mikrotikInterface ? [{ keys: ["l"], label: "tempo real" }] : []),
    ...(link?.webhookToken ? [{ keys: ["d"], label: "copiar DOWN", hideSm: true }, { keys: ["u"], label: "copiar UP", hideSm: true }] : []),
    { keys: ["b"], label: "voltar" },
    { keys: ["?"], label: "ajuda" },
  ];
  const shellProps = { hints, help: HELP, helpOpen: help, onHelpClose: () => setHelp(false), back: { href: "/links", label: "links" } };

  if (loading && !data) {
    return (
      <LnkShell title="LINK" {...shellProps}>
        <LnkLoading what="link" />
      </LnkShell>
    );
  }

  if (!data?.link) {
    return (
      <LnkShell title="LINK" {...shellProps}>
        <LnkError message={error ?? "Link não encontrado."} onRetry={load} />
      </LnkShell>
    );
  }

  const { events, lastBefore, since } = data;
  const lk = data.link;
  const sinceMs = new Date(since).getTime();
  const slots = buildSlots(events, lastBefore, sinceMs, lk.isOnline);
  const uptimePct = calcUptime(events, lastBefore, sinceMs, lk.isOnline);
  const outages = calcOutages(events);
  const downtime = calcTotalDowntime(events, lastBefore, sinceMs, lk.isOnline);
  const winLabel = WINDOWS.find((w) => w.value === win)?.label;
  const lastSample = live.samples[live.samples.length - 1];

  return (
    <LnkShell
      title={lk.name}
      sub={
        <>
          <StateGlyph state={lk.isOnline ? "ok" : "crit"} label={lk.isOnline ? "online" : "offline"} />{" "}
          <span className={lk.isOnline ? "ok" : "crit"}>{lk.isOnline ? "ONLINE" : "OFFLINE"}</span>
          {lk.description ? <span className="dim"> · {lk.description}</span> : null}
        </>
      }
      updatedAt={updatedAt}
      {...shellProps}
    >
      {lk.webhookToken && (
        <Panel title="webhooks para o Mikrotik" sub="d / u copiam" color="info">
          {(["down", "up"] as const).map((type) => {
            const url = `${origin}/api/links/${id}/${type}?token=${lk.webhookToken}`;
            return (
              <div key={type} className="urlrow">
                <span className={type === "down" ? "crit" : "ok"} style={{ width: "5ch", fontWeight: 700 }}>{type.toUpperCase()}</span>
                <code className="code">{url}</code>
                <button type="button" className="btn" onClick={() => void copyWebhook(type)} aria-label={`Copiar URL do webhook ${type.toUpperCase()}`}>
                  copiar
                </button>
              </div>
            );
          })}
          <p className="note">
            Configure no Mikrotik via <code>/tool fetch</code> em scripts de detecção de queda de WAN.
          </p>
        </Panel>
      )}

      <div className="toolbar">
        <LnkChips<string>
          label="Período"
          value={String(win)}
          onChange={(v) => setWin(Number(v) as Window)}
          chips={WINDOWS.map((w, i) => ({ value: String(w.value), label: w.label, key: String(i + 1) }))}
        />
        {loading && <span className="dim">◌ atualizando…</span>}
      </div>

      <div className="cols3">
        <Panel title="uptime" sub={winLabel} color={uptimePct >= 99 ? "ok" : uptimePct >= 95 ? "warn" : "crit"}>
          <div className="stat"><b>{uptimePct.toFixed(1)}%</b><span>disponibilidade no período</span></div>
        </Panel>
        <Panel title="quedas" sub={winLabel} color={outages > 0 ? "warn" : "ok"}>
          <div className="stat"><b>{outages}</b><span>{outages === 1 ? "queda registrada" : "quedas registradas"}</span></div>
        </Panel>
        <Panel title="tempo offline" sub={winLabel} color={downtime > 0 ? "crit" : "ok"}>
          <div className="stat"><b>{downtime > 0 ? formatDuration(downtime) : "—"}</b><span>soma das quedas</span></div>
        </Panel>
      </div>

      <div className="cols2">
        <Panel title="tráfego atual" sub={lk.mikrotikInterface ?? undefined} color="info">
          {lk.downloadBps == null && lk.uploadBps == null ? (
            <p className="note">
              <span className="warn">▲ monitoramento de tráfego não configurado.</span> Associe um Mikrotik e uma interface a este link para coletar Download/Upload via RouterOS.
            </p>
          ) : (
            <dl className="kv" style={{ gridTemplateColumns: "10ch 1fr" }}>
              <dt>↓ download</dt><dd className="ok">{formatBps(lk.downloadBps)}</dd>
              <dt>↑ upload</dt><dd className="info">{formatBps(lk.uploadBps)}</dd>
              {lk.latencyMs != null && (<><dt>latência</dt><dd>{lk.latencyMs} ms</dd></>)}
              {lk.location && (<><dt>local</dt><dd>{lk.location}</dd></>)}
            </dl>
          )}
        </Panel>

        {lk.mikrotikInterface && (
          <Panel
            title="tráfego em tempo real"
            sub={live.active ? `a cada ${LIVE_INTERVAL_MS / 1000}s` : "parado"}
            color={live.active ? "accent" : "dim"}
            right={
              <button type="button" onClick={live.toggle} aria-label={live.active ? "Parar medição em tempo real" : "Iniciar medição em tempo real"}>
                <kbd>l</kbd> {live.measuring ? "medindo…" : live.active ? "parar" : "iniciar"}
              </button>
            }
          >
            {!live.active && live.samples.length === 0 && (
              <p className="note">
                Inicie para medir a interface <code>{lk.mikrotikInterface}</code> em tempo real, com nova leitura a cada {LIVE_INTERVAL_MS / 1000}s.
              </p>
            )}
            {live.error && <p className="note crit-n" role="alert">✖ {live.error}</p>}
            {lastSample && (
              <>
                <dl className="kv" style={{ gridTemplateColumns: "10ch 1fr" }}>
                  <dt>↓ download</dt><dd className="ok">{formatBps(lastSample.downloadBps)}</dd>
                  <dt>↑ upload</dt><dd className="info">{formatBps(lastSample.uploadBps)}</dd>
                  <dt>leitura</dt><dd className="dim">{fmtTime(lastSample.timestamp)}</dd>
                </dl>
                <div style={{ marginTop: 8 }}>
                  <Spark values={live.samples.map((s) => s.downloadBps)} color="var(--ok)" label="Download nas últimas leituras" />
                  <Spark values={live.samples.map((s) => s.uploadBps)} color="var(--info)" label="Upload nas últimas leituras" />
                </div>
              </>
            )}
          </Panel>
        )}
      </div>

      <Panel title="linha do tempo" sub={`últimas ${winLabel}`} color={outages > 0 ? "warn" : "ok"}>
        <div className="segs" role="img" aria-label={`Linha do tempo de ${winLabel}: ${outages} queda(s), uptime ${uptimePct.toFixed(1)}%`}>
          {slots.map((s, i) => <i key={i} className={s.cls} title={s.title} />)}
        </div>
        <p className="note">
          <span className="ok">■</span> online · <span className="warn">■</span> instável · <span className="crit">■</span> offline
        </p>
      </Panel>

      <Panel title="histórico de eventos" sub={`${events.length} no período`} color="info">
        {events.length === 0 ? (
          <p className="note">░ nenhum evento registrado neste período.</p>
        ) : (
          <div className="tblwrap">
            <table className="tbl" aria-label="Histórico de eventos do link">
              <thead>
                <tr>
                  <th scope="col">Data/Hora</th>
                  <th scope="col">Evento</th>
                  <th scope="col">Duração do estado anterior</th>
                </tr>
              </thead>
              <tbody>
                {[...events].reverse().map((ev, i, arr) => {
                  const prev = arr[i + 1];
                  const duration = prev ? new Date(ev.timestamp).getTime() - new Date(prev.timestamp).getTime() : null;
                  return (
                    <tr key={ev.id} style={{ cursor: "default" }}>
                      <td className="dim">{fmtDateTime(ev.timestamp)}</td>
                      <td>
                        <StateGlyph state={ev.type === "UP" ? "ok" : "crit"} label={ev.type === "UP" ? "voltou online" : "ficou offline"} />{" "}
                        <span className={ev.type === "UP" ? "ok" : "crit"}>{ev.type === "UP" ? "Voltou online" : "Ficou offline"}</span>
                      </td>
                      <td className="dim">{duration != null ? formatDuration(duration) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </LnkShell>
  );
}
