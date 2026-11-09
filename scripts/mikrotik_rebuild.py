#!/usr/bin/env python3
"""
Reset completo do RB5009 e reconstrução mínima a partir do snapshot do CRS.

Fluxo (--execute):
  1. backup do estado atual (salvo no equipamento e baixado por FTP)
  2. envia por FTP um bootstrap .rsc (portas, listas WAN/LAN, bridge, IP, DHCP)
  3. /system reset-configuration no-defaults keep-users run-after-reset=<bootstrap>
  4. aguarda a API voltar e aplica o restante por API (PPPoE, scripts, schedulers,
     rotas, DNS, NAT de saída, cloud, netwatch, e-mail)

Uso:
    python scripts/mikrotik_rebuild.py --dry-run
    python scripts/mikrotik_rebuild.py --execute --host 192.168.0.1 --yes 192.168.0.1

Lê .mikrotik-migration/snapshot-old.json (CRS, com segredos). O CRS não é acessado.
"""

from __future__ import annotations

import argparse
import ftplib
import io
import os
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from mikrotik_migrate import (  # noqa: E402
    Cmd, Layout, OUT_DIR, ENV_PATH, SECTIONS, Snapshot, apply_cmds, build_plan, default_layout, load_conn,
    open_api, render_cmd, save,
)
from mikrotik_validate import RouterOSError, load_env_file  # noqa: E402

BRIDGE = "BRIDGE-Evora"
LAN_ADDRESS = "192.168.0.1/22"
LAN_NETWORK = "192.168.0.0/22"
POOL = "DHCP_PRINCIPAL"
POOL_RANGE = "192.168.0.2-192.168.1.254"
DHCP_SERVER = "dhcp1"
NEW_PORTS = [f"ether{i}" for i in range(1, 9)] + ["sfp-sfpplus1"]
ENABLE_KEY = {s.path: s.enable_key for s in SECTIONS if s.start_disabled}


def _c(path: str, action: str, attrs: dict[str, str], find: tuple[str, str] | None = None) -> Cmd:
    return Cmd(path, action, attrs, find, section=path)


def build_bootstrap(wan: dict[str, str]) -> list[Cmd]:
    """Só o necessário para a conectividade voltar após o reset."""
    lan_ports = [p for p in NEW_PORTS if p not in wan]
    cmds = [_c("/interface/ethernet", "set_find", {"name": final}, ("default-name", default))
            for default, final in wan.items()]
    cmds += [_c("/interface/list", "add", {"name": "WAN"}), _c("/interface/list", "add", {"name": "LAN"})]
    cmds += [_c("/interface/list/member", "add", {"list": "WAN", "interface": final}) for final in wan.values()]
    cmds += [_c("/interface/list/member", "add", {"list": "LAN", "interface": p}) for p in lan_ports]
    cmds.append(_c("/interface/bridge", "add", {"name": BRIDGE}))
    cmds += [_c("/interface/bridge/port", "add", {"bridge": BRIDGE, "interface": p}) for p in lan_ports]
    cmds += [
        _c("/ip/address", "add", {"address": LAN_ADDRESS, "interface": BRIDGE}),
        _c("/ip/pool", "add", {"name": POOL, "ranges": POOL_RANGE}),
        _c("/ip/dhcp-server", "add", {"name": DHCP_SERVER, "interface": BRIDGE, "address-pool": POOL,
                                       "lease-time": "2h", "disabled": "no"}),
        _c("/ip/dhcp-server/network", "add", {"address": LAN_NETWORK, "gateway": "192.168.0.1",
                                               "dns-server": "192.168.0.1"}),
    ]
    return cmds


def build_rest(old: Snapshot, wan: dict[str, str]) -> list[Cmd]:
    """Itens copiados do CRS, na ordem de dependência."""
    layout = default_layout(old, None, "ether3")
    layout.wan = dict(wan)
    plan = build_plan(old, layout)
    enables = {(c.path, c.find[1]) for c in plan.cmds if c.phase == 2 and c.attrs == {"disabled": "no"} and c.find}

    def take(path: str) -> list[Cmd]:
        out = []
        for c in plan.cmds:
            if c.path != path or c.phase != 1:
                continue
            attrs = dict(c.attrs)
            key = ENABLE_KEY.get(path)
            if key and attrs.get("disabled") == "yes" and (path, attrs.get(key, "")) in enables:
                del attrs["disabled"]  # no CRS estava habilitado
            out.append(Cmd(c.path, c.action, attrs, c.find, c.section))
        return out

    cmds: list[Cmd] = []
    cmds += take("/system/clock")
    cmds += take("/interface/pppoe-client")
    cmds += [_c("/interface/list/member", "add", {"list": "WAN", "interface": "pppoe-7Link"})]
    cmds += [c for c in take("/ip/address") if c.attrs.get("interface") in wan.values()]
    cmds += take("/ip/route")
    cmds += take("/ip/dns") + take("/ip/dns/static")
    cmds += [c for c in take("/ip/firewall/nat") if c.attrs.get("chain") == "srcnat"]
    cmds.append(_c("/ip/cloud", "set", {"ddns-enabled": "yes", "ddns-update-interval": "10m"}))
    cmds += take("/system/script") + take("/system/scheduler")
    cmds += take("/tool/netwatch")
    cmds += take("/tool/e-mail")
    return cmds


def bootstrap_rsc(cmds: list[Cmd]) -> str:
    lines = ['/log warning message="[REBUILD] bootstrap iniciado"']
    for c in cmds:
        lines.append(f':do {{ {render_cmd(c)} }} on-error={{ /log error message="[REBUILD] falhou: {c.path}" }}')
    lines.append('/log warning message="[REBUILD] bootstrap concluido"')
    return "\n".join(lines) + "\n"


def ftp_connect(conn: dict) -> ftplib.FTP:
    ftp = ftplib.FTP()
    ftp.connect(conn["host"], 21, timeout=20)
    ftp.login(conn["user"], conn["password"])
    return ftp


def wait_for_api(conn: dict, timeout: int = 300):
    deadline = time.time() + timeout
    time.sleep(25)
    while time.time() < deadline:
        try:
            return open_api(conn)
        except (RouterOSError, OSError):
            time.sleep(5)
    return None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--host", help="IP atual do RB5009 (padrão: MIKROTIK_NEW_HOST)")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--execute", action="store_true")
    ap.add_argument("--yes", help="repita o IP do RB5009 para confirmar o reset")
    args = ap.parse_args()
    for stream in (sys.stdout, sys.stderr):
        stream.reconfigure(encoding="utf-8")

    env = {**load_env_file(ENV_PATH), **os.environ}
    conn = load_conn("NEW", env)
    if not conn:
        print("Defina MIKROTIK_NEW_* no .env")
        return 2
    if args.host:
        conn["host"] = args.host
    old = Snapshot.from_json((OUT_DIR / "snapshot-old.json").read_text(encoding="utf-8"))
    wan = default_layout(old, None, "ether3").wan
    boot, rest = build_bootstrap(wan), build_rest(old, wan)

    save("rebuild-bootstrap.rsc", bootstrap_rsc(boot))
    print(f"WAN: {wan}\nLAN: {[p for p in NEW_PORTS if p not in wan]}")
    print(f"\n== bootstrap ({len(boot)} comandos, roda no equipamento após o reset)")
    for c in boot:
        print("  ", render_cmd(c, mask=True))
    print(f"\n== restante via API ({len(rest)} comandos)")
    for c in rest:
        print("  ", render_cmd(c, mask=True)[:200].replace("\n", " "))
    if not args.execute:
        return 0
    if args.yes != conn["host"]:
        print(f"\nPara executar, passe --yes {conn['host']}")
        return 1

    api = open_api(conn)
    stamp = time.strftime("%Y%m%d-%H%M%S")
    api.talk(["/system/backup/save", f"=name=pre-reset-{stamp}"])
    api.close()
    ftp = ftp_connect(conn)
    buf = io.BytesIO()
    ftp.retrbinary(f"RETR pre-reset-{stamp}.backup", buf.write)
    (OUT_DIR / f"pre-reset-{stamp}.backup").write_bytes(buf.getvalue())
    ftp.storbinary("STOR rebuild-bootstrap.rsc", io.BytesIO((OUT_DIR / "rebuild-bootstrap.rsc").read_bytes()))
    ftp.quit()
    print(f"\nBackup baixado ({len(buf.getvalue())} bytes) e bootstrap enviado. Executando reset…")

    api = open_api(conn)
    try:
        api.talk(["/system/reset-configuration", "=no-defaults=yes", "=skip-backup=yes", "=keep-users=yes",
                  "=run-after-reset=rebuild-bootstrap.rsc"])
    except (RouterOSError, OSError):
        pass
    api = wait_for_api(conn)
    if api is None:
        print("API não voltou em 5 min; verifique o equipamento (Winbox por MAC).")
        return 3
    print("API de volta. Aplicando o restante…")
    logs: list[str] = []

    def log(status: str, msg: str) -> None:
        logs.append(f"{status:<4} {msg}")
        if status != "OK":
            print(f"{status:<4} {msg}"[:240])

    stats = apply_cmds(api, rest, log)
    save("rebuild.log", "\n".join(logs))
    api.close()
    print(f"\nRestante: {stats['OK']} ok, {stats['JA']} já existiam, {stats['ERRO']} erros, "
          f"{stats['DESC']} com parâmetros descartados.")
    return 1 if stats["ERRO"] else 0


if __name__ == "__main__":
    sys.exit(main())
