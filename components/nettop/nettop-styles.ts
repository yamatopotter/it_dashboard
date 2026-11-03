// CSS específico do NetTop (classes do protótipo docs/redesign/nettop.html), escopado em .nt.
export const NETTOP_CSS = `
.tui.nt .g-net { grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr); }
.tui.nt .wan-site { padding: 4px 0 6px; border-bottom: 1px dashed var(--line); }
.tui.nt .wan-site:last-of-type { border-bottom: 0; }
.tui.nt .wan-site.bad { border-left: 2px solid var(--crit); padding-left: 6px; }
.tui.nt .wan { grid-template-columns: 9ch 2ch 12ch minmax(6ch, 1fr) 6ch; }
.tui.nt .wan .sname { color: var(--fg); font-weight: 600; }
.tui.nt .wan-note { color: var(--dim); padding: 0 6px 0 calc(9ch + 16px); font-size: 12px; }
.tui.nt .unit2 { grid-template-columns: 4ch 12ch 7ch 9ch 8ch; cursor: default; }
.tui.nt .unit2:hover { background: none; }
.tui.nt .traffic-head { display: flex; flex-wrap: wrap; gap: 4px 18px; align-items: baseline; margin-bottom: 6px; }
.tui.nt .traffic-head .linkname { color: var(--fg); font-weight: 600; }
.tui.nt .tstats { display: flex; flex-wrap: wrap; gap: 4px 20px; margin-top: 6px; }
.tui.nt .ap { grid-template-columns: minmax(10ch, 1.4fr) 4ch 4ch 6ch minmax(8ch, 1fr) 7ch; cursor: default; }
.tui.nt .wifi { grid-template-columns: minmax(10ch, 1.4fr) 8ch 4ch 4ch 6ch minmax(8ch, 1fr) 7ch 8ch; cursor: default; }
.tui.nt .host { grid-template-columns: 2ch 5ch 4ch minmax(10ch, 1.2fr) minmax(10ch, 1fr) 10ch; cursor: default; }
.tui.nt .evrow { grid-template-columns: 6ch 2ch minmax(0, 1fr); cursor: default; }
.tui.nt .logrow { grid-template-columns: 6ch 2ch minmax(0, 1fr); cursor: default; }
.tui.nt .tree { margin: 0; white-space: pre; line-height: 1.6; }
.tui.nt .sla-row { display: grid; grid-template-columns: 15ch minmax(0, 1fr) 24ch; gap: 4px 12px; align-items: center; padding: 3px 0; }
.tui.nt .cells { display: grid; gap: 2px; }
.tui.nt .cells span { height: 14px; border-radius: 2px; background: var(--ok); }
.tui.nt .cells .c-part { background: var(--warn); }
.tui.nt .cells .c-down { background: var(--crit); }
.tui.nt .cells .c-nd { background: repeating-linear-gradient(135deg, var(--faint) 0 2px, transparent 2px 5px); }
.tui.nt .cells .c-fut { background: transparent; box-shadow: inset 0 0 0 1px var(--line); }
.tui.nt .cells .c-today { outline: 1px solid var(--accent); outline-offset: 1px; }
.tui.nt .sla-days { display: grid; gap: 2px; color: var(--dim); font-size: 10px; }
.tui.nt .sla-days span { text-align: center; overflow: hidden; }
.tui.nt .sla-legend { display: flex; flex-wrap: wrap; gap: 4px 16px; color: var(--dim); font-size: 12px; margin-top: 8px; }
.tui.nt .legend-sw { display: inline-block; width: 10px; height: 10px; border-radius: 2px; vertical-align: middle; margin-right: 4px; }
.tui.nt .hosts-filter { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: 8px; }
.tui.nt .hosts-filter input { font: inherit; color: var(--fg); background: var(--bg); border: 1px solid var(--line-hi, var(--line)); border-radius: 3px; padding: 2px 8px; min-width: 0; width: 22ch; }
.tui.nt .tbl-scroll { overflow-x: auto; }
.tui.nt .tbl-scroll .rows { min-width: 560px; }
.tui.nt .empty { border: 1px dashed var(--line); border-radius: 4px; padding: 14px 10px; color: var(--dim); text-align: center; }
.tui.nt .link-btn { background: none; border: 0; padding: 0; cursor: pointer; color: var(--dim); text-decoration: underline; }
@media (max-width: 800px) { .tui.nt .g-net { grid-template-columns: minmax(0, 1fr); } }
@media (max-width: 600px) {
  .tui.nt .wan { grid-template-columns: 4ch 2ch minmax(0, 1fr) 5ch; }
  .tui.nt .wan-note { padding-left: 6px; }
  .tui.nt .sla-row { grid-template-columns: 1fr auto; }
  .tui.nt .sla-row .cells, .tui.nt .sla-row .sla-days { grid-column: 1 / -1; }
}
`;
