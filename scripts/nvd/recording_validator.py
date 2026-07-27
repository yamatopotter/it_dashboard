"""
recording_validator.py

FERRAMENTA MANUAL DE DIAGNÓSTICO — não faz parte do pipeline automatizado.

A validação de gravação em produção roda dentro do WatchIT Tower
(worker/monitors/nvr.ts + worker/scheduler.ts), com o NVD cadastrado como
Device (type=DVR). Este script continua existindo só para testar/validar
manualmente os nomes de campo da API Dahua/Intelbras contra um equipamento
real antes de confiar neles no monitor TS — útil porque esses nomes variam
por firmware (NVD 33xx vs iNVD 91xx). Ver specs/persistencia-e-alertas/.

Uso standalone (teste manual):
    python recording_validator.py --config nvrs.yaml
"""

import argparse
import logging
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import List, Optional

import yaml

from intelbras_nvr_client import IntelbrasNVRClient

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("recording_validator")


@dataclass
class ChannelIssue:
    channel: int
    channel_name: str
    issue_type: str          # "no_recordings" | "gap" | "not_recording_now" | "unreachable"
    detail: str
    gap_minutes: Optional[float] = None
    period_start: Optional[datetime] = None
    period_end: Optional[datetime] = None


@dataclass
class NVRReport:
    site: str
    nvr_name: str
    host: str
    checked_at: datetime
    channels_ok: int = 0
    channels_total: int = 0
    issues: List[ChannelIssue] = field(default_factory=list)

    @property
    def healthy(self) -> bool:
        return len(self.issues) == 0


def check_channel(client: IntelbrasNVRClient, channel: int, channel_name: str,
                   hours: int, max_gap_minutes: int) -> List[ChannelIssue]:
    issues: List[ChannelIssue] = []
    end = datetime.now()
    start = end - timedelta(hours=hours)

    try:
        segments = client.find_media_files(channel, start, end)
    except Exception as exc:  # rede, auth, canal offline, etc.
        return [ChannelIssue(
            channel=channel, channel_name=channel_name,
            issue_type="unreachable",
            detail=f"Falha ao consultar canal: {exc}",
        )]

    if not segments:
        issues.append(ChannelIssue(
            channel=channel, channel_name=channel_name,
            issue_type="no_recordings",
            detail=f"Nenhuma gravação encontrada nas últimas {hours}h",
            period_start=start, period_end=end,
        ))
        return issues

    # gap antes do primeiro segmento
    lead_gap = (segments[0][0] - start).total_seconds() / 60
    if lead_gap > max_gap_minutes:
        issues.append(ChannelIssue(
            channel=channel, channel_name=channel_name, issue_type="gap",
            detail=f"Sem gravação por {lead_gap:.0f} min no início da janela",
            gap_minutes=lead_gap, period_start=start, period_end=segments[0][0],
        ))

    # gaps entre segmentos
    for (_, seg_end), (next_start, _) in zip(segments, segments[1:]):
        gap_minutes = (next_start - seg_end).total_seconds() / 60
        if gap_minutes > max_gap_minutes:
            issues.append(ChannelIssue(
                channel=channel, channel_name=channel_name, issue_type="gap",
                detail=f"Gap de {gap_minutes:.0f} min entre gravações",
                gap_minutes=gap_minutes, period_start=seg_end, period_end=next_start,
            ))

    # câmera não está gravando agora
    trailing_minutes = (end - segments[-1][1]).total_seconds() / 60
    if trailing_minutes > max_gap_minutes:
        issues.append(ChannelIssue(
            channel=channel, channel_name=channel_name, issue_type="not_recording_now",
            detail=f"Sem gravação há {trailing_minutes:.0f} min (parece parada)",
            gap_minutes=trailing_minutes, period_start=segments[-1][1], period_end=end,
        ))

    return issues


def validate_nvr(site: str, nvr_name: str, host: str, username: str, password: str,
                  port: int = 80, hours: int = 24, max_gap_minutes: int = 5,
                  channels: Optional[List[int]] = None) -> NVRReport:
    report = NVRReport(site=site, nvr_name=nvr_name, host=host, checked_at=datetime.now())
    client = IntelbrasNVRClient(host=host, username=username, password=password, port=port)

    try:
        channel_titles = client.get_channel_titles()
    except Exception as exc:
        logger.error("Não foi possível conectar em %s (%s): %s", nvr_name, host, exc)
        report.issues.append(ChannelIssue(
            channel=-1, channel_name="(nvr)", issue_type="unreachable",
            detail=f"NVR inacessível: {exc}",
        ))
        return report

    target_channels = channels or sorted(channel_titles.keys())
    report.channels_total = len(target_channels)

    for ch in target_channels:
        ch_name = channel_titles.get(ch, f"Canal {ch + 1}")
        ch_issues = check_channel(client, ch, ch_name, hours, max_gap_minutes)
        if ch_issues:
            report.issues.extend(ch_issues)
        else:
            report.channels_ok += 1

    return report


def run_validation(nvr_configs: List[dict], hours: int = 24,
                    max_gap_minutes: int = 5) -> List[NVRReport]:
    """nvr_configs: lista de dicts no formato do nvrs.example.yaml"""
    reports = []
    for cfg in nvr_configs:
        logger.info("Validando %s (%s)...", cfg["nvr_name"], cfg["site"])
        report = validate_nvr(
            site=cfg["site"], nvr_name=cfg["nvr_name"], host=cfg["host"],
            username=cfg["username"], password=cfg["password"],
            port=cfg.get("port", 80), hours=hours, max_gap_minutes=max_gap_minutes,
            channels=cfg.get("channels"),
        )
        reports.append(report)
        status = "OK" if report.healthy else f"{len(report.issues)} problema(s)"
        logger.info("  -> %s/%s canais OK | %s", report.channels_ok, report.channels_total, status)
    return reports


def format_report_text(reports: List[NVRReport]) -> str:
    lines = []
    for r in reports:
        lines.append(f"\n=== {r.site} - {r.nvr_name} ({r.host}) ===")
        lines.append(f"Canais OK: {r.channels_ok}/{r.channels_total}")
        for issue in r.issues:
            lines.append(f"  [{issue.issue_type}] Canal {issue.channel} ({issue.channel_name}): {issue.detail}")
    return "\n".join(lines)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Valida gravação dos NVDs Intelbras")
    parser.add_argument("--config", required=True, help="Caminho do YAML com os NVDs")
    parser.add_argument("--hours", type=int, default=24)
    parser.add_argument("--max-gap-minutes", type=int, default=5)
    args = parser.parse_args()

    with open(args.config, "r", encoding="utf-8") as f:
        cfg = yaml.safe_load(f)

    reports = run_validation(cfg["nvrs"], hours=args.hours, max_gap_minutes=args.max_gap_minutes)
    print(format_report_text(reports))
