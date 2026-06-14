import { readFileSync } from "fs";
import { join } from "path";
import { SecurityClient } from "./security-client";

export const dynamic = "force-static";

export type Status = "RESOLVIDO" | "ABERTO" | "ACEITO";
export type SeverityLevel = "CRÍTICO" | "ALTO" | "MÉDIO" | "BAIXO" | "INFO";

export interface Finding {
  id: string;
  title: string;
  severityLevel: SeverityLevel;
  severityEmoji: string;
  category: string;
  status: Status;
  resolvedIn?: string;
}

const SEVERITY_EMOJI_MAP: Record<string, SeverityLevel> = {
  "🔴": "CRÍTICO",
  "🟠": "ALTO",
  "🟡": "MÉDIO",
  "🔵": "BAIXO",
  "ℹ️": "INFO",
};

function parseFindings(md: string): Finding[] {
  const blocks = md.split(/(?=^### SEC-)/m).slice(1);
  return blocks.flatMap((block) => {
    const idTitle = block.match(/^### (SEC-\d+) — (.+)/m);
    if (!idTitle) return [];

    const id = idTitle[1];
    const title = idTitle[2].trim();

    const sevLine = block.match(/\*\*Severidade:\*\* (.+?) — (.+)/m);
    if (!sevLine) return [];

    const sevRaw = sevLine[1].trim();
    const statusRaw = sevLine[2].trim();

    const severityEmoji = sevRaw.match(/^(\S+)/)?.[1] ?? "ℹ️";
    const severityLevel: SeverityLevel = SEVERITY_EMOJI_MAP[severityEmoji] ?? "INFO";

    const status: Status = statusRaw.includes("RESOLVIDO")
      ? "RESOLVIDO"
      : statusRaw.includes("ACEITO")
      ? "ACEITO"
      : "ABERTO";

    const category = block.match(/\*\*Categoria:\*\* (.+)/m)?.[1]?.trim() ?? "";
    const resolvedIn = block.match(/\*\*Resolvido em:\*\* (.+)/m)?.[1]?.trim();

    return [{ id, title, severityLevel, severityEmoji, category, status, resolvedIn }];
  });
}

export default function SecurityPage() {
  const md = readFileSync(join(process.cwd(), "SECURITY_REPORT.md"), "utf-8");
  const findings = parseFindings(md);
  const lastUpdated = md.match(/\*\*Última atualização:\*\* (.+)/)?.[1]?.trim();

  return <SecurityClient findings={findings} lastUpdated={lastUpdated} />;
}
