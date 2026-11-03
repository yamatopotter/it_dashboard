// CSS das telas de dispositivos/rede (lista, detalhe, formulários, Mikrotik/UniFi/Omada), escopado em .tui.
// Classes prefixadas com "d-" para não colidir com as de TOWER/NetTop. Injetado por <DevStyles/>.
export const DEV_CSS = `
.tui .d-page { max-width: 1500px; margin: 0 auto; }
.tui .d-head { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 14px; padding-block: 10px; border-bottom: 1px solid var(--line); margin-bottom: 14px; }
.tui .d-head h1 { margin: 0; font: inherit; font-size: 15px; font-weight: 700; color: var(--accent); letter-spacing: .02em; }
.tui .d-head h1::before { content: "▌"; margin-right: 6px; color: var(--accent-2); }
.tui .d-head .d-sub { color: var(--dim); }
.tui .d-head .d-back { color: var(--dim); text-decoration: none; border: 1px solid var(--line); border-radius: 3px; padding: 0 7px; }
.tui .d-head .d-back:hover { color: var(--fg); background: var(--sel); }
.tui .d-head .d-live { color: var(--dim); font-size: 12px; white-space: nowrap; }
.tui .d-head .d-acts { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.tui a.btn, .tui button.btn { display: inline-flex; align-items: center; gap: 4px; text-decoration: none; line-height: 1.5; }
.tui .btn.pri { border-color: var(--accent); color: var(--accent); font-weight: 600; }
.tui .btn.pri:hover { background: var(--accent); color: var(--bg); }
.tui .btn.danger { border-color: var(--crit); color: var(--crit); }
.tui .btn.danger:hover { background: var(--crit); color: var(--bg); }
.tui .btn:disabled, .tui .btn[aria-disabled="true"] { opacity: .5; cursor: not-allowed; }
.tui .d-stack { display: flex; flex-direction: column; gap: 18px; padding-bottom: 12px; }
.tui .d-cols { display: grid; gap: 18px 14px; grid-template-columns: repeat(auto-fit, minmax(min(100%, 340px), 1fr)); }
.tui .d-filters { display: flex; flex-wrap: wrap; gap: 6px 14px; align-items: center; margin-bottom: 14px; }
.tui .d-filters .grp { display: inline-flex; flex-wrap: wrap; gap: 4px; align-items: center; }
.tui .d-filters .grp > .lbl { color: var(--dim); font-size: 12px; margin-right: 2px; }
.tui .d-search { display: inline-flex; align-items: center; gap: 6px; border: 1px solid var(--line-hi); border-radius: 3px; padding: 1px 8px; background: var(--bg); }
.tui .d-search input { border: 0; background: transparent; color: var(--fg); font: inherit; min-width: 22ch; outline: none; padding: 1px 0; }
.tui .d-search:focus-within { outline: 2px solid var(--info); outline-offset: 1px; }
.tui .d-wrap { overflow-x: auto; }
.tui table.d-tbl { width: 100%; border-collapse: collapse; }
.tui .d-tbl th { text-align: left; font-weight: 400; color: var(--dim); font-size: 11px; letter-spacing: .05em; text-transform: uppercase; padding: 2px 10px 4px 6px; white-space: nowrap; border-bottom: 1px solid var(--line); }
.tui .d-tbl th button { background: none; border: 0; padding: 0; cursor: pointer; color: inherit; text-transform: inherit; letter-spacing: inherit; font-size: inherit; }
.tui .d-tbl th button:hover, .tui .d-tbl th[aria-sort="ascending"] button, .tui .d-tbl th[aria-sort="descending"] button { color: var(--fg); }
.tui .d-tbl td { padding: 3px 10px 3px 6px; white-space: nowrap; max-width: 28ch; overflow: hidden; text-overflow: ellipsis; border-left: 2px solid transparent; }
.tui .d-tbl tbody tr { cursor: pointer; }
.tui .d-tbl tbody tr:hover { background: var(--sel); }
.tui .d-tbl tbody tr.sel { background: var(--sel); }
.tui .d-tbl tbody tr.sel td:first-child { border-left-color: var(--accent); }
.tui .d-tbl tbody tr.muted { color: var(--dim); }
.tui .d-tbl.static tbody tr { cursor: default; }
.tui .d-tbl.static tbody tr:hover { background: none; }
.tui .d-tbl.static td.wrap { white-space: normal; }
.tui .d-note { border-left: 2px solid var(--box, var(--warn)); padding: 4px 10px; }
.tui .d-note.crit { --box: var(--crit); }
.tui .d-toggle { background: none; border: 0; padding: 0; cursor: pointer; color: var(--fg); font: inherit; font-weight: 600; text-align: left; width: 100%; }
.tui .d-tbl td.r, .tui .d-tbl th.r { text-align: right; }
.tui .d-tbl td.name { color: var(--fg); font-weight: 600; max-width: 34ch; }
.tui .d-tbl a { color: inherit; }
.tui .d-cards { display: grid; gap: 14px 12px; grid-template-columns: repeat(auto-fill, minmax(min(100%, 250px), 1fr)); padding-top: 6px; }
.tui .d-card { display: block; color: inherit; text-decoration: none; cursor: pointer; }
.tui .d-card .box { height: 100%; transition: border-color .15s; }
.tui .d-card:hover .box, .tui .d-card.sel .box, .tui .d-card:focus-visible .box { border-color: var(--box, var(--info)); }
.tui .d-card .big { font-size: 20px; font-weight: 700; line-height: 1.1; }
.tui .d-line { display: flex; align-items: center; gap: 8px; min-width: 0; }
.tui .d-line > .k { color: var(--dim); width: 6ch; flex: none; font-size: 12px; }
.tui .d-line > .v { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tui .d-tag { border: 1px solid var(--line-hi); border-radius: 3px; padding: 0 5px; font-size: 11px; color: var(--dim); white-space: nowrap; }
.tui .d-tiles { display: grid; gap: 10px; grid-template-columns: repeat(auto-fit, minmax(min(100%, 110px), 1fr)); }
.tui .d-tile { border: 1px solid var(--line); border-radius: 4px; padding: 6px 8px; }
.tui .d-tile .k { color: var(--dim); font-size: 11px; text-transform: uppercase; letter-spacing: .05em; }
.tui .d-tile .v { font-size: 18px; font-weight: 700; line-height: 1.3; }
.tui .d-tile .u { color: var(--dim); font-size: 12px; font-weight: 400; margin-left: 2px; }
.tui .d-segs { display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; gap: 2px; }
.tui .d-segs i { display: block; height: 14px; border-radius: 2px; background: var(--ok); }
.tui .d-segs i.degraded { background: var(--warn); }
.tui .d-segs i.offline { background: var(--crit); }
.tui .d-segs i.empty { background: transparent; box-shadow: inset 0 0 0 1px var(--line); }
.tui .d-empty { padding: 28px 8px; text-align: center; color: var(--dim); }
.tui .d-empty .ttl { color: var(--fg); }
.tui .d-err { border: 1px solid var(--crit); border-radius: 4px; color: var(--crit); padding: 8px 10px; display: flex; gap: 10px; align-items: center; justify-content: space-between; flex-wrap: wrap; }
.tui .d-skel { height: 1.3em; margin: 5px 0; border-radius: 2px; background: repeating-linear-gradient(90deg, var(--faint) 0 6px, transparent 6px 10px); opacity: .5; animation: d-pulse 1.4s ease-in-out infinite; }
@keyframes d-pulse { 50% { opacity: .2; } }
@media (prefers-reduced-motion: reduce) { .tui .d-skel { animation: none; } }
.tui .d-form { display: grid; gap: 12px 16px; grid-template-columns: repeat(auto-fit, minmax(min(100%, 240px), 1fr)); }
.tui .d-form .full { grid-column: 1 / -1; }
.tui .d-field { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.tui .d-field > label, .tui .d-field > .lbl { color: var(--dim); font-size: 12px; }
.tui .d-field .hint { color: var(--dim); font-size: 11px; }
.tui .d-field .err, .tui .d-err-txt { color: var(--crit); font-size: 12px; }
.tui .d-in, .tui .d-field input:not([type=checkbox]):not([type=radio]), .tui .d-field select, .tui .d-field textarea { font: inherit; background: var(--bg); color: var(--fg); border: 1px solid var(--line-hi); border-radius: 3px; padding: 3px 8px; min-width: 0; width: 100%; }
.tui .d-field textarea { resize: vertical; }
.tui .d-field input:disabled, .tui .d-field select:disabled { opacity: .55; }
.tui .d-field input[aria-invalid="true"] { border-color: var(--crit); }
.tui .d-check { display: flex; gap: 8px; align-items: flex-start; }
.tui .d-drawer { display: flex; flex-direction: column; gap: 16px; min-height: 100%; padding-top: 12px; }
.tui .d-drawer .foot { position: sticky; bottom: 0; background: var(--bg); border-top: 1px solid var(--line); padding-block: 8px; margin-top: auto; display: flex; gap: 8px; flex-wrap: wrap; }
.tui .d-seg { display: inline-flex; border: 1px solid var(--line); border-radius: 3px; overflow: hidden; }
.tui .d-seg button { background: none; border: 0; padding: 0 8px; cursor: pointer; color: var(--dim); font-size: 12px; }
.tui .d-seg button[aria-pressed="true"] { background: var(--sel); color: var(--fg); box-shadow: inset 0 -2px 0 var(--accent); }
@media (max-width: 700px) { .tui .d-search input { min-width: 14ch; } .tui .d-tbl td { max-width: 18ch; } }
`;
