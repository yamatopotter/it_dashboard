// CSS das telas padronizadas (links, incidentes, visão geral, celulares, computadores), escopado em .tui.lnk.
// Fica fora de app/globals.css de propósito (dono: outro agente); reaproveita só os tokens do bloco .tui.
export const LNK_CSS = `
.tui.lnk { padding-bottom: 12px; }
.tui.lnk .lnk-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 16px; padding-block: 10px; color: var(--dim); }
.tui.lnk .lnk-head h1 { margin: 0; font: inherit; font-weight: 700; color: var(--accent); letter-spacing: .02em; }
.tui.lnk .lnk-head .back { color: var(--dim); text-decoration: none; }
.tui.lnk .lnk-head .back:hover { color: var(--fg); text-decoration: underline; }
.tui.lnk .stack { display: flex; flex-direction: column; gap: 18px; padding-block: 14px; }
.tui.lnk .cols2 { display: grid; gap: 18px 14px; grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr); }
.tui.lnk .cols3 { display: grid; gap: 14px; grid-template-columns: repeat(3, minmax(0, 1fr)); }
.tui.lnk .toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 14px; }
.tui.lnk .toolbar .spacer { flex: 1; }
.tui.lnk .search { font: inherit; background: var(--bg); color: var(--fg); border: 1px solid var(--line-hi); border-radius: 3px; padding: 1px 6px; min-width: 22ch; }
.tui.lnk .search::placeholder { color: var(--dim); }
.tui.lnk .tblwrap { overflow-x: auto; max-width: 100%; }
.tui.lnk .tbl { width: 100%; border-collapse: collapse; }
.tui.lnk .tbl th { text-align: left; color: var(--dim); font-weight: 400; font-size: 11px; letter-spacing: .05em; text-transform: uppercase; padding: 2px 8px; border-bottom: 1px solid var(--line); white-space: nowrap; }
.tui.lnk .tbl th.r, .tui.lnk .tbl td.r { text-align: right; }
.tui.lnk .tbl td { padding: 4px 8px; vertical-align: middle; border-bottom: 1px dashed var(--line); }
.tui.lnk .tbl tbody tr { cursor: pointer; }
.tui.lnk .tbl tbody tr:hover { background: var(--sel); }
.tui.lnk .tbl tbody tr.sel { background: var(--sel); }
.tui.lnk .tbl tbody tr.sel td:first-child { box-shadow: inset 2px 0 0 var(--accent); }
.tui.lnk .tbl tbody tr.off td:not(.keep) { color: var(--dim); }
.tui.lnk .tbl .nm { font-weight: 600; }
.tui.lnk .tbl .sm { display: block; color: var(--dim); font-size: 11px; }
.tui.lnk .tbl .acts { white-space: nowrap; text-align: right; }
.tui.lnk .tbl a.btn { text-decoration: none; display: inline-block; }
.tui.lnk .btn.danger { color: var(--crit); border-color: color-mix(in srgb, var(--crit) 50%, var(--line)); }
.tui.lnk .btn.primary { border-color: var(--accent); color: var(--accent); }
.tui.lnk .btn[disabled] { opacity: .5; cursor: not-allowed; }
.tui.lnk .bw { display: inline-flex; flex-direction: column; align-items: flex-end; gap: 1px; }
.tui.lnk .bw .v { font-weight: 600; }
.tui.lnk .bw .of { color: var(--dim); font-size: 11px; }
.tui.lnk .form { display: grid; gap: 10px 14px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
.tui.lnk .form .full { grid-column: 1 / -1; }
.tui.lnk .fld { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.tui.lnk .fld label { color: var(--dim); font-size: 12px; }
.tui.lnk .fld input, .tui.lnk .fld select, .tui.lnk .fld textarea { font: inherit; background: var(--bg); color: var(--fg); border: 1px solid var(--line-hi); border-radius: 3px; padding: 3px 6px; width: 100%; min-width: 0; }
.tui.lnk .fld input[aria-invalid="true"], .tui.lnk .fld select[aria-invalid="true"], .tui.lnk .fld textarea[aria-invalid="true"] { border-color: var(--crit); }
.tui.lnk .fld .err { color: var(--crit); font-size: 12px; }
.tui.lnk .fld .hint { color: var(--dim); font-size: 12px; }
.tui.lnk .note { padding: 4px 6px; color: var(--dim); }
.tui.lnk .note .ok-n { color: var(--ok); }
.tui.lnk .note.crit-n { color: var(--crit); }
.tui.lnk .stat { display: flex; flex-direction: column; gap: 2px; }
.tui.lnk .stat b { font-size: 22px; line-height: 1.1; font-weight: 700; }
.tui.lnk .stat span { color: var(--dim); font-size: 12px; }
.tui.lnk .tlist { display: flex; flex-direction: column; }
.tui.lnk .tl { display: grid; grid-template-columns: 7ch 2ch minmax(0, 1fr) auto; gap: 8px; padding: 3px 6px; align-items: baseline; border-left: 2px solid transparent; cursor: pointer; }
.tui.lnk .tl:hover, .tui.lnk .tl.sel { background: var(--sel); }
.tui.lnk .tl.sel { border-left-color: var(--accent); }
.tui.lnk .tl.plain { cursor: default; }
.tui.lnk .tl.plain:hover { background: none; }
.tui.lnk .tl > * { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tui.lnk .dayh { color: var(--dim); padding: 6px 6px 2px; }
.tui.lnk .dayh::first-letter { text-transform: uppercase; }
.tui.lnk .segs { display: flex; gap: 1px; }
.tui.lnk .segs i { flex: 1; height: 14px; border-radius: 1px; background: var(--ok); }
.tui.lnk .segs i.crit { background: var(--crit); }
.tui.lnk .segs i.warn { background: var(--warn); }
.tui.lnk .segs i.empty { background: color-mix(in srgb, var(--faint) 40%, transparent); }
.tui.lnk .chartbox { height: 180px; }
.tui.lnk .code { background: var(--bg); border: 1px solid var(--line); border-radius: 3px; padding: 1px 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; flex: 1; }
.tui.lnk .urlrow { display: flex; gap: 8px; align-items: center; padding: 2px 0; }
.tui.lnk .drawer { padding: 0 14px 14px; min-height: 100%; }
@media (max-width: 900px) {
  .tui.lnk .cols2 { grid-template-columns: 1fr; }
  .tui.lnk .hide-md { display: none; }
}
@media (max-width: 600px) {
  .tui.lnk .form { grid-template-columns: 1fr; }
  .tui.lnk .cols3 { grid-template-columns: 1fr; }
  .tui.lnk .tl { grid-template-columns: 6ch 2ch minmax(0, 1fr); }
  .tui.lnk .tl .tl-end { grid-column: 3; }
  .tui.lnk .search { min-width: 0; width: 100%; }
}
`;
