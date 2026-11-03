import { GLYPH, type GlyphKey } from "@/lib/tui-format";

const COLOR: Record<GlyphKey, string> = { ok: "ok", warn: "warn", crit: "crit", ack: "dim", unk: "dim", sup: "dim", maint: "dim", info: "info" };

/** Estado por glifo + cor (● ▲ ✖ ░ ◌), com texto acessível. */
export function StateGlyph({ state, label }: { state: GlyphKey; label?: string }) {
  return (
    <span className={COLOR[state]} role="img" aria-label={label ?? state} title={label}>
      {GLYPH[state]}
    </span>
  );
}
