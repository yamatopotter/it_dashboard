"use client";
import { Panel } from "@/components/tui/panel";

export type HelpRow = [keys: string, text: string];

/** Janela de ajuda (tecla ?): lista de atalhos; clique fora fecha. */
export function HelpOverlay({ rows, onClose }: { rows: HelpRow[]; onClose: () => void }) {
  return (
    <div
      className="overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div role="dialog" aria-modal="true" aria-label="Atalhos" style={{ width: "min(560px, 100%)" }}>
        <Panel title="atalhos" color="accent">
          <div className="help">
            {rows.map(([k, t]) => (
              <div key={k} style={{ display: "contents" }}>
                <kbd>{k}</kbd>
                <span>{t}</span>
              </div>
            ))}
          </div>
          <p className="dim">
            Tudo também funciona com clique. <kbd>?</kbd> ou <kbd>Esc</kbd> fecha.{" "}
            <button type="button" className="btn" onClick={onClose}>
              fechar
            </button>
          </p>
        </Panel>
      </div>
    </div>
  );
}
