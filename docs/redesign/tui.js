/* WatchIT · protótipos — dados de exemplo e utilitários compartilhados.
   Todos os números são fictícios e servem só para mostrar o comportamento da tela. */
(function () {
  "use strict";

  // Série determinística (sem Math.random) para sparklines estáveis entre recargas.
  function series(seed, n, base, amp) {
    const out = [];
    for (let i = 0; i < n; i++) {
      const v = base + amp * (0.55 * Math.sin((i + seed) / 3.1) + 0.3 * Math.sin((i * seed) / 7.7) + 0.15 * Math.cos(i / 1.7 + seed));
      out.push(Math.max(0, Math.round(v)));
    }
    return out;
  }

  const SITES = [
    { id: "BAR", name: "Barra", gw: "MK-BARRA" },
    { id: "BOT", name: "Botafogo", gw: "MK-BOTAFOGO" },
    { id: "ITA", name: "Itaguaí", gw: "RB5009" },
  ];

  const LINKS = [
    { id: "bar-claro", site: "BAR", name: "Claro", cap: 300, down: 279, up: 41, state: "up", role: "active", lat: 9, loss: 0, hist: series(2, 48, 220, 70), iface: "ether1", circuit: "#771204", phone: "0800-xxx-1010", sla: 99.94 },
    { id: "bar-vivo", site: "BAR", name: "Vivo", cap: 200, down: 62, up: 12, state: "up", role: "standby", lat: 14, loss: 0, hist: series(5, 48, 55, 25), iface: "ether2", circuit: "#550931", phone: "0800-xxx-2020", sla: 99.81 },
    { id: "bot-algar", site: "BOT", name: "Algar", cap: 500, down: 225, up: 60, state: "up", role: "active", lat: 6, loss: 0, hist: series(9, 48, 210, 80), iface: "ether1", circuit: "#AL-30551", phone: "0800-xxx-3030", sla: 99.97 },
    { id: "bot-oi", site: "BOT", name: "Oi", cap: 200, down: 24, up: 5, state: "up", role: "standby", lat: 18, loss: 0.2, hist: series(4, 48, 20, 10), iface: "ether2", circuit: "#OI-88410", phone: "0800-xxx-4040", sla: 99.42 },
    { id: "ita-vivo", site: "ITA", name: "Vivo", cap: 500, down: 0, up: 0, state: "down", downFor: 862, role: "active", lat: null, loss: 100, hist: series(7, 42, 260, 90).concat([0, 0, 0, 0, 0, 0]), iface: "ether1", circuit: "#123456", phone: "0800-xxx-5050", sla: 98.72, lastDown: "29/10 03:12 (4m)", drops7d: 2 },
    { id: "ita-tim", site: "ITA", name: "Tim", cap: 300, down: 198, up: 33, state: "up", role: "failover", lat: 11, loss: 0, hist: series(3, 42, 30, 12).concat([150, 170, 185, 190, 196, 198]), iface: "ether2", circuit: "#TIM-2210", phone: "0800-xxx-6060", sla: 99.90 },
  ];

  // Contagem por unidade: total, offline, suprimidos (atrás do link caído).
  const COUNTS = {
    BAR: { dev: [48, 0, 0], ap: [5, 5], cam: [32, 32], pc: [38, 40], cli: 87, sw: [4, 4] },
    BOT: { dev: [37, 1, 0], ap: [10, 11], cam: [30, 32], pc: [51, 55], cli: 142, sw: [3, 3] },
    ITA: { dev: [29, 0, 12], ap: [6, 6], cam: [24, 24], pc: [22, 24], cli: 64, sw: [2, 2] },
  };

  const PROBLEMS = [
    { id: "p1", sev: "crit", kind: "LINK", site: "ITA", name: "Vivo 500M", what: "DOWN", age: 862, why: "webhook · failover → Tim ok", children: 12, ref: "ita-vivo" },
    { id: "p2", sev: "crit", kind: "DISP", site: "BOT", name: "NVR-02", what: "offline", age: 190, why: "ping ×3 (limite de alerta)", ref: "nvr-02" },
    { id: "p3", sev: "warn", kind: "LINK", site: "BAR", name: "Claro 300M", what: "uso 93%", age: 400, why: "acima de 90% há 6 min", pct: 93, ref: "bar-claro" },
    { id: "p4", sev: "ack", kind: "DISP", site: "BOT", name: "AP-Recepção", what: "offline", age: 6000, why: 'matheus: "troca de cabo" · até 18:00', ref: "ap-recepcao" },
  ];

  const DEPENDENTS = ["SW-ITA-ESTOQ", "SW-ITA-EXPED", "AP-ITA-01", "AP-ITA-02", "AP-ITA-03", "CAM-ITA-01", "CAM-ITA-02", "CAM-ITA-03", "IMP-ITA-RH", "IMP-ITA-FISCAL", "RELOGIO-PONTO", "NVR-ITA"];

  const EVENTS = [
    { t: "14:31", sev: "crit", text: "BOT NVR-02 offline (3 falhas)" },
    { t: "14:18", sev: "info", text: "ITA rota padrão → Tim (failover em 41s)" },
    { t: "14:17", sev: "crit", text: "ITA Vivo DOWN (webhook)" },
    { t: "14:09", sev: "warn", text: "BOT AP-Recepção offline" },
    { t: "13:02", sev: "ok", text: "BOT CRS voltou após 4 min" },
    { t: "12:47", sev: "warn", text: "BAR Claro acima de 90% por 5 min" },
    { t: "05:00", sev: "ok", text: "ITA teste diário de failover ok" },
  ];

  const DEVICES = [
    { id: "rb5009", site: "ITA", name: "RB5009", type: "mikrotik", ip: "192.168.0.1", st: "ok", ping: 1, cpu: 22 },
    { id: "sw-ita-core", site: "ITA", name: "SW-ITA-CORE", type: "switch", ip: "192.168.0.2", st: "ok", ping: 1 },
    { id: "css326-a", site: "ITA", name: "CSS326-ITA-A", type: "switch", ip: "192.168.0.3", st: "unk", ping: null, note: "SwOS sem SNMP" },
    { id: "sw-ita-estoq", site: "ITA", name: "SW-ITA-ESTOQ", type: "switch", ip: "192.168.0.12", st: "sup", ping: null },
    { id: "nvr-ita", site: "ITA", name: "NVR-ITA", type: "nvr", ip: "192.168.0.40", st: "sup", ping: null },
    { id: "mk-barra", site: "BAR", name: "MK-BARRA", type: "mikrotik", ip: "172.16.1.1", st: "ok", ping: 1, cpu: 9 },
    { id: "cloudkey", site: "BAR", name: "UniFi CloudKey", type: "unifi", ip: "172.16.1.200", st: "ok", ping: 2 },
    { id: "nvr-bar", site: "BAR", name: "NVR-BAR-01", type: "nvr", ip: "172.16.1.40", st: "ok", ping: 2 },
    { id: "mk-bot", site: "BOT", name: "MK-BOTAFOGO", type: "mikrotik", ip: "10.0.0.1", st: "ok", ping: 1, cpu: 31 },
    { id: "oc200", site: "BOT", name: "Omada OC200", type: "omada", ip: "10.0.0.19", st: "ok", ping: 2 },
    { id: "nvr-02", site: "BOT", name: "NVR-02", type: "nvr", ip: "10.0.0.42", st: "crit", ping: null },
    { id: "ap-recepcao", site: "BOT", name: "AP-Recepção", type: "omada", ip: "10.0.0.61", st: "ack", ping: null },
  ];

  const APS = [
    { name: "EAP225-Sala2", site: "BOT", cli: null, ch: "--", util: null, sig: null, st: "crit", off: "42m" },
    { name: "EAP225-Recep", site: "BOT", cli: 38, ch: "6/2G", util: 84, sig: -71, st: "warn" },
    { name: "U6-Lite-Coz", site: "BAR", cli: 22, ch: "36/5G", util: 52, sig: -63, st: "ok" },
    { name: "U6-Pro-Sala", site: "BAR", cli: 31, ch: "44/5G", util: 41, sig: -58, st: "ok" },
    { name: "EAP225-Estoque", site: "ITA", cli: 12, ch: "11/2G", util: 33, sig: -66, st: "ok" },
  ];

  const PEOPLE = [
    { q: "ana", kind: "PC", name: "PC-FIN-07", owner: "Ana Souza", src: "Datto", site: "BAR", st: "ok", via: "AP-2ºAND → SW-2 porta 7", seen: "agora" },
    { q: "ana", kind: "CEL", name: "Galaxy A54", owner: "Ana Souza", src: "Miradore", site: "BAR", st: "ok", via: "Wi-Fi BAR-CORP", seen: "há 3 min" },
    { q: "nvr", kind: "DISP", name: "NVR-02", owner: "", src: "ping", site: "BOT", st: "crit", via: "SW-2 porta 12", seen: "há 3 min" },
    { q: "fin", kind: "PC", name: "PC-FIN-03", owner: "Carlos Lima", src: "Datto", site: "BAR", st: "ack", via: "—", seen: "há 2 dias" },
  ];

  // ── formatação ──
  function age(s) {
    s = Math.max(0, Math.floor(s));
    if (s < 3600) return Math.floor(s / 60) + "m" + String(s % 60).padStart(2, "0") + "s";
    if (s < 86400) return Math.floor(s / 3600) + "h" + String(Math.floor((s % 3600) / 60)).padStart(2, "0") + "m";
    return Math.floor(s / 86400) + "d " + Math.floor((s % 86400) / 3600) + "h";
  }
  function pct(l) { return l.state === "down" ? 0 : Math.round((l.down / l.cap) * 100); }
  function level(p) { return p >= 90 ? "crit" : p >= 70 ? "warn" : "ok"; }
  function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

  const GLYPH = { ok: "●", warn: "▲", crit: "✖", ack: "░", unk: "◌", sup: "◌", info: "·" };

  function bar(p, opts) {
    opts = opts || {};
    if (opts.down) return '<span class="bar down" role="meter" aria-label="link fora" aria-valuenow="0"></span>';
    const cls = p >= 90 ? " c" : p >= 70 ? " w" : "";
    return '<span class="bar' + cls + '" style="--p:' + Math.min(100, p) + '" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + p + '"><i></i></span>';
  }

  function spark(vals, color, h) {
    h = h || 34;
    const w = 200, max = Math.max(1, ...vals), n = vals.length;
    const pts = vals.map((v, i) => [(i / (n - 1)) * w, h - 2 - (v / max) * (h - 4)]);
    const line = pts.map((p) => p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" ");
    const last = pts[pts.length - 1];
    return '<svg class="spark" viewBox="0 0 ' + w + " " + h + '" preserveAspectRatio="none" style="height:' + h + 'px" aria-hidden="true">' +
      '<line class="grid-l" x1="0" x2="' + w + '" y1="' + h / 2 + '" y2="' + h / 2 + '" />' +
      '<polygon class="area" fill="' + color + '" points="0,' + h + " " + line + " " + w + "," + h + '" />' +
      '<polyline fill="none" stroke="' + color + '" stroke-width="1.5" vector-effect="non-scaling-stroke" points="' + line + '" />' +
      '<circle cx="' + last[0] + '" cy="' + last[1] + '" r="2.5" fill="' + color + '" /></svg>';
  }

  function dots(site) {
    const c = COUNTS[site].dev, out = [];
    for (let i = 0; i < c[0]; i++) {
      let cls = "";
      if (i >= c[0] - c[2]) cls = "sup";
      else if (i >= c[0] - c[2] - c[1]) cls = "off";
      out.push('<i class="' + cls + '"></i>');
    }
    return '<span class="dots" aria-label="' + (c[0] - c[1] - c[2]) + " de " + c[0] + ' online">' + out.join("") + "</span>";
  }

  // ── relógio simulado (03/11/2026 14:32:07, avança em tempo real) ──
  const t0 = performance.now();
  const BASE = 14 * 3600 + 32 * 60 + 7;
  function elapsed() { return Math.floor((performance.now() - t0) / 1000); }
  function clock() {
    const s = (BASE + elapsed()) % 86400;
    return "ter 03/11 " + [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map((x) => String(x).padStart(2, "0")).join(":");
  }

  // Tráfego oscila levemente para dar sensação de tela ao vivo.
  function jitter() {
    LINKS.forEach((l, i) => {
      if (l.state === "down") return;
      const d = Math.round(l.down * (1 + Math.sin(elapsed() / 2 + i) * 0.03));
      l.down = Math.min(l.cap, Math.max(1, d));
      l.hist.push(l.down); l.hist.shift();
    });
  }

  // ── toast ──
  let toastTimer;
  function toast(msg) {
    let el = document.getElementById("wt-toast");
    if (!el) { el = document.createElement("div"); el.id = "wt-toast"; el.className = "toast"; el.setAttribute("role", "status"); document.body.appendChild(el); }
    el.textContent = msg; el.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
  }

  // ── atalhos (ignorados dentro de campos de texto) ──
  function keys(map) {
    document.addEventListener("keydown", (e) => {
      const tag = (e.target.tagName || "").toLowerCase();
      const typing = tag === "input" || tag === "textarea" || e.target.isContentEditable;
      if (e.key === "Escape" && map.Escape) { map.Escape(e); return; }
      if (typing) return;
      if (e.altKey || e.metaKey) return;
      const k = (e.ctrlKey ? "Ctrl+" : "") + (e.key.length === 1 ? e.key.toLowerCase() : e.key);
      if (map[k]) { e.preventDefault(); map[k](e); }
    });
  }

  // ── ajuda (tecla ?) ──
  function help(rows) {
    let ov = document.getElementById("wt-help");
    if (ov) { ov.remove(); return; }
    ov = document.createElement("div");
    ov.id = "wt-help"; ov.className = "overlay";
    ov.innerHTML = '<section class="box" role="dialog" aria-label="Atalhos"><h2 class="box-t">atalhos</h2><div class="help">' +
      rows.map((r) => "<kbd>" + esc(r[0]) + "</kbd><span>" + esc(r[1]) + "</span>").join("") +
      '</div><p class="dim">Tudo também funciona com clique. <kbd>?</kbd> ou <kbd>Esc</kbd> fecha.</p></section>';
    ov.addEventListener("click", (e) => { if (e.target === ov) ov.remove(); });
    document.body.appendChild(ov);
  }
  function closeHelp() { const ov = document.getElementById("wt-help"); if (ov) { ov.remove(); return true; } return false; }

  // ── navegação entre as 5 propostas ──
  const PAGES = [
    ["./", "1 · TOWER/1"],
    ["plantao.html", "2 · Plantão"],
    ["wtop.html", "3 · wtop"],
    ["triagem.html", "4 · Triagem"],
    ["nettop.html", "5 · NetTop"],
    ["fluxo.html", "Fluxo do sistema"],
  ];
  function nav(current) {
    const el = document.getElementById("proto-nav");
    if (!el) return;
    el.innerHTML = "<b>WatchIT · propostas</b>" +
      PAGES.map((p, i) => '<a href="' + p[0] + '"' + (i + 1 === current ? ' aria-current="page"' : "") + ">" + p[1] + "</a>").join("") +
      '<span class="note">dados fictícios · <kbd>?</kbd> atalhos</span>';
  }

  window.WT = {
    SITES, LINKS, COUNTS, PROBLEMS, DEPENDENTS, EVENTS, DEVICES, APS, PEOPLE, GLYPH,
    age, pct, level, esc, bar, spark, dots, clock, elapsed, jitter, toast, keys, help, closeHelp, nav, series,
  };
})();
