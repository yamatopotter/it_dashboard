#!/usr/bin/env python3
"""
TUI de migração Mikrotik: CRS328-24P-4S+ (produção) -> RB5009UG+S+IN (novo).

Fluxo (o MK de produção é acessado SOMENTE em leitura: o cliente só aceita '/print'):
  1. Lê a configuração completa do MK atual (inclui segredos: PPPoE, WireGuard, L2TP).
  2. Lê o inventário do MK novo.
  3. Define o layout de portas (WANs, uplink para o switch, LAN direta).
  4. Analisa a viabilidade e gera o plano.
  5. FASE 1 (não disruptiva): grava no MK novo tudo que não conflita com a rede
     em produção. Itens que conflitariam (PPPoE, DHCP, WireGuard, netwatch, IP final)
     entram DESABILITADOS.
  6. FASE 2 (cutover): script executado dentro do MK novo que ativa tudo, assume o
     IP final e clona MACs. Roda no equipamento, então sobrevive à perda da sessão.

Credenciais (.env na raiz ou variáveis de ambiente):
    MIKROTIK_OLD_HOST/_PORT/_USER/_PASSWORD/_USE_SSL   (produção; cai para MIKROTIK_*)
    MIKROTIK_NEW_HOST/_PORT/_USER/_PASSWORD/_USE_SSL   (equipamento novo)

Uso:
    python scripts/mikrotik_migrate.py                       # TUI
    python scripts/mikrotik_migrate.py --headless            # lê tudo, relatório + .rsc
    python scripts/mikrotik_migrate.py --phase1 --yes <IP>   # grava fase 1 no MK novo
    python scripts/mikrotik_migrate.py --verify              # confere o MK novo contra o plano
    python scripts/mikrotik_migrate.py --cutover --yes <IP>  # fase 2

Saídas (snapshot COM SEGREDOS, relatório, .rsc, logs) ficam em .mikrotik-migration/,
ignorado pelo git. Apenas biblioteca padrão do Python 3.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable

sys.path.insert(0, str(Path(__file__).resolve().parent))
from mikrotik_validate import RouterOSAPI, RouterOSError, load_env_file, parse_bool  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
ENV_PATH = ROOT / ".env"
OUT_DIR = ROOT / ".mikrotik-migration"

# ────────────────────────────────────────────────────────────────
# Hardware conhecido
# ────────────────────────────────────────────────────────────────

BOARDS: dict[str, dict[str, Any]] = {
    "CRS328-24P-4S+": {
        "ports": [f"ether{i}" for i in range(1, 25)] + [f"sfp-sfpplus{i}" for i in range(1, 5)],
        "poe_out": True,
    },
    "RB5009UG+S+": {
        "ports": [f"ether{i}" for i in range(1, 9)] + ["sfp-sfpplus1"],
        "poe_out": False,
    },
}


def board_profile(board_name: str) -> dict[str, Any] | None:
    name = (board_name or "").upper()
    if "CRS328" in name:
        return BOARDS["CRS328-24P-4S+"]
    if "RB5009" in name:
        profile = dict(BOARDS["RB5009UG+S+"])
        profile["poe_out"] = "UPR" in name
        return profile
    return None


def port_base(name: str) -> str:
    """'ether1-7LINK' -> 'ether1' (portas renomeadas no CRS)."""
    m = re.match(r"(ether\d+|sfp-sfpplus\d+)", name)
    return m.group(1) if m else name


# ────────────────────────────────────────────────────────────────
# Cliente somente-leitura
# ────────────────────────────────────────────────────────────────

class ReadOnlyAPI:
    """Envolve RouterOSAPI e recusa qualquer comando que não seja '/print'."""

    def __init__(self, api: RouterOSAPI):
        self._api = api

    def talk(self, words: list[str]) -> list[dict[str, str]]:
        if not words or not words[0].endswith("/print"):
            raise RouterOSError(f"Bloqueado (somente-leitura): {words[:1]}")
        return self._api.talk(words)


# ────────────────────────────────────────────────────────────────
# Seções migráveis
# ────────────────────────────────────────────────────────────────

@dataclass
class Section:
    path: str
    label: str
    mode: str = "add"  # add | set | set_find
    iface_fields: tuple[str, ...] = ()
    find_key: str = ""  # set_find: campo que identifica a linha existente
    drop: tuple[str, ...] = ()
    skip_names: tuple[str, ...] = ()
    keep: tuple[str, ...] = ()  # set/set_find: allowlist de campos
    secrets: bool = False  # mantém campos secretos (senhas/chaves) no snapshot
    start_disabled: bool = False  # fase 1 cria desabilitado; fase 2 habilita
    enable_key: str = "name"  # campo usado para localizar o item na fase 2
    phase: int = 1
    builtin_set: bool = False  # linhas default=true viram 'set' em vez de 'add'


GLOBAL_DROP = {
    "dynamic", "invalid", "inactive", "running", "slave", "bytes", "packets", "hw",
    "actual-mtu", "actual-interface", "status", "expires-after", "last-seen",
    "active-address", "active-mac-address", "active-server", "active-client-id",
    "active-agent-circuit-id", "active-agent-remote-id", "host-name", "network",
    "builtin", "default", "dhcp", "ecmp", "active", "immediate-gw", "hw-offloaded",
    "current-tagged", "current-untagged", "current-gateway", "nextid", "copy-from",
    "total", "used", "available", "freq-drift", "age", "radius", "class-id", "l2mtu",
    "dst-nat", "src-nat",
}

SECRET_KEYS = {"password", "private-key", "preshared-key", "secret", "ipsec-secret",
               "authentication-password", "encryption-password", "wpa-pre-shared-key", "passphrase"}

FW_IFACES = ("in-interface", "out-interface", "in-bridge-port", "out-bridge-port")

SECTIONS: list[Section] = [
    Section("/system/clock", "Fuso horário", "set", keep=("time-zone-name", "time-zone-autodetect")),
    Section("/system/ntp/client", "Cliente NTP", "set", keep=("enabled", "mode", "servers")),
    Section("/ip/cloud", "DDNS MikroTik Cloud", "set", keep=("ddns-enabled", "ddns-update-interval", "update-time")),
    Section("/tool/e-mail", "E-mail (SMTP)", "set", secrets=True,
            keep=("server", "port", "from", "user", "password", "tls", "vrf")),
    Section("/interface/list", "Listas de interface", skip_names=("all", "none", "dynamic", "static")),
    Section("/interface/bridge", "Bridges", drop=("mac-address",)),
    Section("/interface/bridge/port", "Portas da bridge (layout novo)"),
    Section("/interface/wireguard", "WireGuard: interfaces", secrets=True, start_disabled=True,
            drop=("public-key",)),
    Section("/interface/wireguard/peers", "WireGuard: peers", secrets=True,
            drop=("current-endpoint-address", "current-endpoint-port", "last-handshake", "rx", "tx", "responder")),
    Section("/interface/pppoe-client", "PPPoE client", iface_fields=("interface",), secrets=True,
            start_disabled=True),
    Section("/interface/list/member", "Membros das listas", iface_fields=("interface",)),
    Section("/ip/pool", "Pools"),
    Section("/ppp/profile", "Perfis PPP", find_key="name", builtin_set=True),
    Section("/ip/address", "Endereços IP", iface_fields=("interface",)),
    Section("/ip/dhcp-server", "Servidores DHCP", iface_fields=("interface",), start_disabled=True),
    Section("/ip/dhcp-server/network", "Redes DHCP"),
    Section("/ip/dhcp-server/lease", "Leases DHCP estáticos"),
    Section("/ip/dhcp-client", "Clientes DHCP", iface_fields=("interface",), start_disabled=True,
            enable_key="interface"),
    Section("/ip/dns", "DNS", "set", drop=("dynamic-servers", "cache-used")),
    Section("/ip/dns/static", "DNS estático"),
    Section("/ip/route", "Rotas estáticas", iface_fields=("gateway",),
            drop=("local-address", "static", "connect", "vrf-interface")),
    Section("/ip/firewall/address-list", "Firewall: address-lists"),
    Section("/ip/firewall/filter", "Firewall: filter", iface_fields=FW_IFACES),
    Section("/ip/firewall/nat", "Firewall: NAT", iface_fields=FW_IFACES),
    Section("/ip/firewall/mangle", "Firewall: mangle", iface_fields=FW_IFACES),
    Section("/ip/firewall/raw", "Firewall: raw", iface_fields=FW_IFACES),
    Section("/ip/service", "Serviços de gerência", "set_find", find_key="name",
            keep=("address", "port", "disabled", "certificate", "tls-version", "max-sessions")),
    Section("/snmp", "SNMP", "set", keep=("enabled", "contact", "location", "trap-version", "trap-community")),
    Section("/ppp/secret", "PPP secrets (L2TP)", secrets=True,
            drop=("last-logged-out", "last-caller-id", "last-disconnect-reason", "caller-id")),
    Section("/interface/l2tp-server/server", "Servidor L2TP", "set", secrets=True,
            keep=("enabled", "max-mtu", "max-mru", "mrru", "authentication", "keepalive-timeout",
                  "max-sessions", "default-profile", "use-ipsec", "ipsec-secret", "one-session-per-host")),
    Section("/system/script", "Scripts", drop=("owner", "last-started", "run-count")),
    Section("/system/scheduler", "Schedulers", start_disabled=True,
            drop=("next-run", "run-count", "owner")),
    Section("/tool/netwatch", "Netwatch", start_disabled=True, enable_key="comment",
            drop=("since", "done-tests", "failed-tests", "last-up", "last-down")),
    Section("/system/identity", "Identidade", "set", phase=2),
]

# não migrados automaticamente: por decisão, por segredo irrecuperável ou por serem específicos do CRS
MANUAL_PATHS: list[tuple[str, str, str]] = [
    ("/user", "Usuários", "NÃO criados (decisão do operador); a API não lê senhas — crie no MK novo"),
    ("/snmp/community", "Comunidades SNMP", "recrie manualmente"),
    ("/interface/ethernet/switch/rule", "Regras do switch chip CRS", "específicas do chip do CRS; sem equivalente direto"),
    ("/interface/ethernet/switch/port-isolation", "Port isolation", "específico do switch chip do CRS"),
    ("/interface/ethernet/switch/l3hw-settings", "L3 HW offload", "RB5009 roteia em CPU/fastpath"),
    ("/ip/ipsec/peer", "IPsec peers", "recrie manualmente"),
    ("/routing/ospf/instance", "OSPF", "recrie manualmente"),
    ("/routing/bgp/connection", "BGP", "recrie manualmente"),
    ("/queue/simple", "Queues simples", "recrie manualmente"),
    ("/queue/tree", "Queue tree", "recrie manualmente"),
    ("/certificate", "Certificados", "importe/recrie manualmente (verifique se os serviços usam algum)"),
    ("/interface/eoip", "Túneis EoIP", "recrie manualmente"),
    ("/interface/gre", "Túneis GRE", "recrie manualmente"),
]

# ────────────────────────────────────────────────────────────────
# Snapshot
# ────────────────────────────────────────────────────────────────


@dataclass
class Snapshot:
    host: str = ""
    meta: dict[str, str] = field(default_factory=dict)
    interfaces: list[dict[str, str]] = field(default_factory=list)
    poe: list[dict[str, str]] = field(default_factory=list)
    sections: dict[str, list[dict[str, str]] | None] = field(default_factory=dict)
    manual: dict[str, int] = field(default_factory=dict)

    @property
    def board(self) -> str:
        return self.meta.get("board-name", "")

    @property
    def version(self) -> str:
        return self.meta.get("version", "")

    @property
    def major(self) -> int | None:
        m = re.match(r"(\d+)\.", self.version)
        return int(m.group(1)) if m else None

    def physical_ports(self) -> list[str]:
        ports = [i["name"] for i in self.interfaces if i.get("type") == "ether" and "name" in i]
        if ports:
            return ports
        profile = board_profile(self.board)
        return list(profile["ports"]) if profile else []

    def mac(self, name: str) -> str:
        return next((i.get("mac-address", "") for i in self.interfaces if i.get("name") == name), "")

    def to_json(self) -> str:
        return json.dumps(self.__dict__, ensure_ascii=False, indent=2)

    @staticmethod
    def from_json(text: str) -> "Snapshot":
        data = json.loads(text)
        snap = Snapshot()
        for k, v in data.items():
            setattr(snap, k, v)
        return snap


def redact(row: dict[str, str]) -> dict[str, str]:
    return {k: ("***" if k in SECRET_KEYS else v) for k, v in row.items()}


def collect(api: Any, host: str, progress: Callable[[str], None] = lambda _m: None) -> Snapshot:
    snap = Snapshot(host=host)

    def safe(path: str) -> list[dict[str, str]] | None:
        try:
            return api.talk([f"{path}/print"])
        except RouterOSError:
            return None

    progress("Recurso do sistema")
    res = safe("/system/resource") or [{}]
    ident = safe("/system/identity") or [{}]
    snap.meta = {
        "board-name": res[0].get("board-name", ""),
        "version": res[0].get("version", ""),
        "architecture": res[0].get("architecture-name", ""),
        "identity": ident[0].get("name", ""),
        "uptime": res[0].get("uptime", ""),
    }
    progress("Interfaces")
    snap.interfaces = safe("/interface") or []
    snap.poe = safe("/interface/ethernet/poe") or []
    for sec in SECTIONS:
        progress(sec.label)
        rows = safe(sec.path)
        if rows is None:
            snap.sections[sec.path] = None
        else:
            snap.sections[sec.path] = rows if sec.secrets else [redact(r) for r in rows]
    for path, label, _why in MANUAL_PATHS:
        progress(f"Verificando {label}")
        rows = safe(path)
        if rows:
            snap.manual[path] = len(rows)
    return snap


# ────────────────────────────────────────────────────────────────
# Layout de portas
# ────────────────────────────────────────────────────────────────

@dataclass
class Layout:
    bridge: str = ""
    wan: dict[str, str] = field(default_factory=dict)  # nome padrão no MK novo -> nome final
    uplink: str = "ether3"
    lan: list[str] = field(default_factory=list)
    mgmt_address: str = ""  # IP temporário do MK novo, removido no cutover
    mgmt_iface: str = ""  # interface (nome padrão) que carrega o IP temporário
    mgmt_dynamic: bool = False  # IP veio de DHCP client (remover o client, não o endereço)


def new_ports(new: Snapshot | None) -> list[str]:
    if new and new.interfaces:
        return [port_base(p) for p in new.physical_ports()]  # portas já renomeadas voltam ao nome de fábrica
    return list(BOARDS["RB5009UG+S+"]["ports"])


def default_layout(old: Snapshot, new: Snapshot | None, uplink: str = "ether3", mgmt_host: str = "") -> Layout:
    ports = new_ports(new)
    wan_names: set[str] = set()
    for m in old.sections.get("/interface/list/member") or []:
        if m.get("list") == "WAN":
            wan_names.add(m.get("interface", ""))
    for c in old.sections.get("/interface/pppoe-client") or []:
        wan_names.add(c.get("interface", ""))
    wan: dict[str, str] = {}
    for n in sorted(wan_names & set(old.physical_ports())):
        if port_base(n) in ports:
            wan[port_base(n)] = n
    counts: dict[str, int] = {}
    for p in old.sections.get("/interface/bridge/port") or []:
        counts[p.get("bridge", "")] = counts.get(p.get("bridge", ""), 0) + 1
    bridges = [b.get("name", "") for b in old.sections.get("/interface/bridge") or []]
    bridge = max(counts, key=counts.get) if counts else (bridges[0] if bridges else "bridge1")
    lan = [p for p in ports if p.startswith("ether") and p not in wan and p != uplink]
    mgmt = iface = ""
    dyn = False
    if new and mgmt_host:
        for a in new.sections.get("/ip/address") or []:
            if a.get("address", "").startswith(mgmt_host + "/"):
                mgmt, iface, dyn = a["address"], port_base(a.get("interface", "")), a.get("dynamic") == "true"
    return Layout(bridge=bridge, wan=wan, uplink=uplink, lan=lan, mgmt_address=mgmt,
                  mgmt_iface=iface, mgmt_dynamic=dyn)


def ports_in_use(snap: Snapshot) -> list[str]:
    refs: set[str] = set()
    ports = set(snap.physical_ports())
    for sec in SECTIONS:
        for row in snap.sections.get(sec.path) or []:
            if row.get("dynamic") == "true":
                continue
            for f in sec.iface_fields:
                for tok in row.get(f, "").split(","):
                    if tok.strip() in ports:
                        refs.add(tok.strip())
    for row in snap.sections.get("/interface/bridge/port") or []:
        if row.get("interface") in ports and row.get("dynamic") != "true":
            refs.add(row["interface"])
    used: list[str] = []
    for i in snap.interfaces:
        if i.get("type") != "ether" or i.get("disabled") == "true":
            continue
        if i.get("running") == "true" or i["name"] in refs:
            used.append(i["name"])
    return used


# ────────────────────────────────────────────────────────────────
# Geração de comandos
# ────────────────────────────────────────────────────────────────

@dataclass
class Cmd:
    path: str
    action: str  # add | set | set_find | remove_find
    attrs: dict[str, str]
    find: tuple[str, str] | None = None
    section: str = ""
    phase: int = 1
    pre: bool = False  # fase 2: executa antes das demais
    last: bool = False  # fase 2: executa por último (pode derrubar a sessão)
    find2: tuple[str, str] | None = None  # condição extra (AND) para localizar a linha


@dataclass
class Plan:
    cmds: list[Cmd] = field(default_factory=list)
    skipped: list[str] = field(default_factory=list)
    counts: dict[str, int] = field(default_factory=dict)


def _map_value(value: str, mapping: dict[str, str], old_ports: set[str]) -> tuple[str | None, str | None]:
    out: list[str] = []
    for tok in (t.strip() for t in value.split(",")):
        if not tok:
            continue
        if tok in old_ports:
            if tok not in mapping:
                return None, tok
            out.append(mapping[tok])
        else:
            out.append(tok)
    return ",".join(out), None


def build_plan(snap: Snapshot, layout: Layout, new: Snapshot | None = None) -> Plan:
    plan = Plan()
    mapping = {final: final for final in layout.wan.values()}  # WANs mantêm o nome antigo (renomeadas)
    old_ports = set(snap.physical_ports())

    for default, final in layout.wan.items():
        plan.cmds.append(Cmd("/interface/ethernet", "set_find", {"name": final},
                             ("default-name", default), "/interface/ethernet"))

    for sec in SECTIONS:
        rows = snap.sections.get(sec.path)
        if rows is None and sec.path != "/interface/bridge/port":
            continue
        if sec.path == "/interface/bridge/port":
            for p in [layout.uplink] + layout.lan:
                attrs = {"bridge": layout.bridge, "interface": p}
                if p == layout.uplink:
                    attrs["comment"] = "Uplink CSS326"
                plan.cmds.append(Cmd(sec.path, "add", attrs, section=sec.path))
            continue
        if sec.path == "/ip/pool":
            rows = sorted(rows or [], key=lambda r: bool(r.get("next-pool")))
        for row in rows or []:
            if row.get("dynamic") == "true" or row.get("builtin") == "true":
                continue
            if sec.skip_names and row.get("name") in sec.skip_names:
                continue
            mode, find_key = sec.mode, sec.find_key
            if sec.builtin_set and row.get("default") == "true":
                mode, find_key = "set_find", "name"

            attrs = {k: v for k, v in row.items()
                     if not k.startswith(".") and k not in GLOBAL_DROP and k not in sec.drop and v != ""}
            if sec.keep:
                attrs = {k: v for k, v in attrs.items() if k in sec.keep or (find_key and k == find_key)}
            if not sec.secrets:
                attrs = {k: v for k, v in attrs.items() if v != "***"}

            label = row.get("comment") or row.get("name") or row.get("interface") or row.get("address") \
                or row.get("dst-address") or "?"
            unmapped: str | None = None
            for f in sec.iface_fields:
                if f in attrs:
                    new_val, bad = _map_value(attrs[f], mapping, old_ports)
                    if bad:
                        unmapped = bad
                        break
                    attrs[f] = new_val or ""
            if unmapped:
                plan.skipped.append(f"{sec.path} [{label}]: interface '{unmapped}' sem destino no MK novo")
                continue
            if mode == "add" and not attrs:
                continue

            phase = sec.phase
            final_step = False
            if sec.path == "/ip/address" and attrs.get("interface") == layout.bridge:
                phase, final_step = 2, True  # IP final da LAN só entra no passo final do cutover
                attrs.pop("vrf", None)

            if sec.start_disabled:
                orig_disabled = row.get("disabled") == "true"
                key = sec.enable_key
                if not orig_disabled and not row.get(key):
                    plan.skipped.append(f"{sec.path} [{label}]: sem '{key}' para localizar na fase 2")
                    continue
                attrs["disabled"] = "yes"
                if not orig_disabled:
                    plan.cmds.append(Cmd(sec.path, "set_find", {"disabled": "no"},
                                         (key, row[key]), sec.path, phase=2))

            if mode == "set":
                if attrs:
                    plan.cmds.append(Cmd(sec.path, "set", attrs, section=sec.path, phase=phase))
            elif mode == "set_find":
                key_val = attrs.pop(find_key, None)
                if key_val is None or not attrs:
                    continue
                plan.cmds.append(Cmd(sec.path, "set_find", attrs, (find_key, key_val), sec.path, phase=phase))
            else:
                plan.cmds.append(Cmd(sec.path, "add", attrs, section=sec.path, phase=phase, last=final_step))

    # --- fase 2: identidade de rede (MACs e remoção do IP temporário) ---
    bridge_mac = snap.mac(layout.bridge)
    if bridge_mac:
        plan.cmds.append(Cmd("/interface/bridge", "set_find", {"auto-mac": "no", "admin-mac": bridge_mac},
                             ("name", layout.bridge), "/interface/bridge", phase=2, pre=True))
    for default, final in layout.wan.items():
        mac = snap.mac(final)
        if mac:
            on_mgmt = default == layout.mgmt_iface  # mexer no MAC desta porta pode derrubar a sessão
            plan.cmds.append(Cmd("/interface/ethernet", "set_find", {"mac-address": mac},
                                 ("name", final), "/interface/ethernet", phase=2,
                                 pre=not on_mgmt, last=on_mgmt))
    if layout.mgmt_address:
        if layout.mgmt_dynamic:
            iface = layout.wan.get(layout.mgmt_iface, layout.mgmt_iface)
            plan.cmds.append(Cmd("/ip/dhcp-client", "remove_find", {}, ("interface", iface),
                                 "/ip/dhcp-client", phase=2, last=True))
        else:
            plan.cmds.append(Cmd("/ip/address", "remove_find", {}, ("address", layout.mgmt_address),
                                 "/ip/address", phase=2, last=True))

    # --- limpeza dos padrões de fábrica do MK novo (listas de interface) ---
    if new:
        desired = {(c.attrs.get("list"), c.attrs.get("interface")) for c in plan.cmds
                   if c.path == "/interface/list/member" and c.action == "add"}
        for m in new.sections.get("/interface/list/member") or []:
            if m.get("dynamic") == "true":
                continue
            iface = layout.wan.get(m.get("interface", ""), m.get("interface", ""))
            if (m.get("list"), iface) not in desired:
                plan.cmds.append(Cmd("/interface/list/member", "remove_find", {}, ("list", m.get("list", "")),
                                     "/interface/list/member (limpeza)", find2=("interface", iface)))
        for d in new.sections.get("/ip/dhcp-client") or []:
            pass  # o client de gerência é removido no cutover; os demais não são tocados

    for c in plan.cmds:
        key = f"{c.section}|{c.phase}"
        plan.counts[key] = plan.counts.get(key, 0) + 1
    return plan


def ordered(plan: Plan, phase: int) -> list[Cmd]:
    cmds = [c for c in plan.cmds if c.phase == phase]
    if phase == 1:
        return cmds
    return [c for c in cmds if c.pre] + [c for c in cmds if not c.pre and not c.last] + [c for c in cmds if c.last]


# ── renderização .rsc ──

def rsc_quote(value: str) -> str:
    if value and re.fullmatch(r"[A-Za-z0-9_.:/,+\-@*!=<>%]+", value):
        return value
    escaped = value.replace("\\", "\\\\").replace('"', '\\"').replace("$", "\\$").replace("?", "\\?")
    escaped = "".join(ch if ch.isascii() else "".join(f"\\{b:02X}" for b in ch.encode("utf-8")) for ch in escaped)
    return f'"{escaped}"'


def rsc_value(v: str) -> str:
    return {"true": "yes", "false": "no"}.get(v) or rsc_quote(v)  # .rsc/scripts não aceitam true/false


def render_cmd(cmd: Cmd, mask: bool = False) -> str:
    args = " ".join(f"{k}={'***' if mask and k in SECRET_KEYS else rsc_value(v)}" for k, v in cmd.attrs.items())
    if cmd.action == "add":
        return f"{cmd.path} add {args}"
    if cmd.action == "set":
        return f"{cmd.path} set {args}"
    assert cmd.find
    cond = f"{cmd.find[0]}={rsc_quote(cmd.find[1])}"
    if cmd.find2:
        cond += f" {cmd.find2[0]}={rsc_quote(cmd.find2[1])}"
    sel = f"[find {cond}]"
    if cmd.action == "remove_find":
        return f"{cmd.path} remove {sel}"
    return f"{cmd.path} set {sel} {args}"


def render_rsc(plan: Plan, snap: Snapshot, layout: Layout) -> str:
    lines = [
        f"# Gerado por scripts/mikrotik_migrate.py em {time.strftime('%Y-%m-%d %H:%M:%S')}",
        f"# Origem: {snap.board} RouterOS {snap.version} ({snap.meta.get('identity', '?')})",
        "# ATENÇÃO: contém SEGREDOS (PPPoE, WireGuard, L2TP). Não compartilhe nem commite.",
        f"# Layout: WAN {layout.wan} | uplink {layout.uplink} | LAN direta {','.join(layout.lan)} | bridge {layout.bridge}",
    ]
    for phase, title in ((1, "FASE 1 — preparação (não disruptiva)"), (2, "FASE 2 — cutover (rodar no equipamento novo)")):
        lines.append(f"\n########## {title} ##########")
        last = ""
        for c in ordered(plan, phase):
            if c.section != last:
                lines.append(f"\n# --- {c.section} ---")
                last = c.section
            lines.append(render_cmd(c))
    if plan.skipped:
        lines.append("\n# --- ITENS NÃO MIGRADOS (resolva manualmente) ---")
        lines += [f"# {s}" for s in plan.skipped]
    if snap.manual:
        lines.append("\n# --- MANUAL ---")
        for path, label, why in MANUAL_PATHS:
            if path in snap.manual:
                lines.append(f"# {label} ({snap.manual[path]} item(ns)): {why}")
    return "\n".join(lines) + "\n"


# ────────────────────────────────────────────────────────────────
# Análise de viabilidade
# ────────────────────────────────────────────────────────────────

@dataclass
class Finding:
    level: str  # BLOCKER | WARN | INFO | OK
    message: str


def analyze(old: Snapshot, new: Snapshot | None, layout: Layout) -> list[Finding]:
    out: list[Finding] = []
    add = lambda lvl, msg: out.append(Finding(lvl, msg))  # noqa: E731

    ports = new_ports(new)
    profile = board_profile(new.board) if new else BOARDS["RB5009UG+S+"]
    add("INFO", f"Origem: {old.board or '?'} — RouterOS {old.version or '?'} — identity '{old.meta.get('identity', '?')}'")
    add("INFO", f"Destino: {new.board if new else 'RB5009UG+S+IN (assumido)'}"
                + (f" — RouterOS {new.version}" if new else " (sem conexão)"))
    if old.major and new and new.major and old.major != new.major:
        add("WARN", f"RouterOS v{old.major} -> v{new.major}: revise a sintaxe no .rsc")

    used = ports_in_use(old)
    wan_old = set(layout.wan.values())
    missing_wan = [n for n in used if n in wan_old and port_base(n) not in layout.wan]
    if not layout.wan:
        add("BLOCKER", "Nenhuma WAN identificada (lista WAN / pppoe-client) — defina o layout")
    for default in layout.wan:
        if default not in ports:
            add("BLOCKER", f"WAN {default} não existe no MK novo")
    if missing_wan:
        add("BLOCKER", f"WAN(s) sem porta no MK novo: {', '.join(missing_wan)}")
    if layout.uplink not in ports:
        add("BLOCKER", f"Uplink {layout.uplink} não existe no MK novo")
    all_new = list(layout.wan) + [layout.uplink] + layout.lan
    dups = sorted({p for p in all_new if all_new.count(p) > 1})
    if dups:
        add("BLOCKER", f"Portas usadas em mais de um papel: {', '.join(dups)}")
    if not layout.mgmt_address:
        add("WARN", "IP temporário de gerência do MK novo não identificado — ele não será removido no cutover")

    lan_used = [p for p in used if p not in wan_old]
    add("INFO", f"{len(lan_used)} portas LAN em uso no CRS serão atendidas pelo switch via uplink {layout.uplink} "
                f"+ {len(layout.lan)} portas diretas ({', '.join(layout.lan)}). Reconecte os cabos conforme o novo layout.")

    poe_on = [p["name"] for p in old.poe if p.get("poe-out") in ("auto-on", "forced-on")]
    if poe_on and not (profile and profile["poe_out"]):
        add("WARN", f"PoE-out ativo em {len(poe_on)} porta(s) do CRS; o RB5009UG+S+IN não tem PoE. "
                    "Confirmado pelo operador: alimentação por injetores/switch PoE à parte.")

    if any(b.get("vlan-filtering") == "true" for b in old.sections.get("/interface/bridge") or []):
        add("WARN", "Bridge com vlan-filtering no CRS; este plano não migra VLANs de bridge — revise.")
    if old.sections.get("/interface/bridge/vlan"):
        add("WARN", "Há VLANs de bridge no CRS que NÃO foram migradas.")

    add("INFO", "Segredos copiados do CRS: senha PPPoE, chaves privadas WireGuard, senhas L2TP/IPsec, SMTP.")
    add("INFO", "As WANs são renomeadas no MK novo (ex.: ether1 -> ether1-7LINK) para scripts/netwatch/firewall funcionarem sem alteração.")
    add("INFO", "No cutover: MACs das WANs e da bridge são clonados do CRS (evita vínculo por MAC no provedor e ARP velho na LAN).")
    add("WARN", "O MK novo terá outro nome DDNS (/ip/cloud). Peers que usem o DDNS do CRS só reconectam porque este lado inicia o handshake (keepalive).")

    for path, label, why in MANUAL_PATHS:
        if path in old.manual:
            add("WARN", f"{label}: {old.manual[path]} item(ns) — {why}")

    if new:
        dirty = {s.label: len([r for r in new.sections.get(s.path) or [] if r.get("dynamic") != "true"])
                 for s in SECTIONS
                 if s.path in ("/interface/bridge", "/interface/wireguard", "/interface/pppoe-client",
                               "/ip/firewall/filter", "/ip/firewall/nat", "/ip/dhcp-server", "/ip/route")}
        dirty = {k: v for k, v in dirty.items() if v}
        if dirty:
            add("WARN", "MK novo não está limpo: " + ", ".join(f"{k}: {v}" for k, v in dirty.items()))
    unavailable = [s.label for s in SECTIONS if old.sections.get(s.path) is None]
    if unavailable:
        add("INFO", "Seções não lidas/inexistentes no CRS: " + ", ".join(unavailable))
    return out


# ────────────────────────────────────────────────────────────────
# Aplicação no MK novo
# ────────────────────────────────────────────────────────────────

ALREADY = ("already have", "already exists", "entry already")
UNKNOWN_PARAM = re.compile(r"unknown parameter (\S+)")
FW_KEYS = ("chain", "action", "comment", "in-interface", "out-interface", "dst-address", "src-address",
           "protocol", "dst-port", "connection-state", "to-addresses", "to-ports")


def _words(attrs: dict[str, str]) -> list[str]:
    return [f"={k}={v}" for k, v in attrs.items()]


def talk_dropping_unknown(api: Any, head: list[str], attrs: dict[str, str]) -> list[str]:
    """Envia o comando; remove parâmetros que o RouterOS do destino não conhece e devolve a lista descartada."""
    attrs = dict(attrs)
    dropped: list[str] = []
    for _ in range(25):
        try:
            api.talk(head + _words(attrs))
            return dropped
        except RouterOSError as e:
            m = UNKNOWN_PARAM.search(str(e))
            if m and m.group(1) in attrs:
                dropped.append(m.group(1))
                del attrs[m.group(1)]
                continue
            raise
    raise RouterOSError("parâmetros demais não suportados")


def _skeleton(text: str) -> str:
    return re.sub(r"[^A-Za-z0-9]", "", text)


def find_existing(api: Any, c: Cmd) -> dict[str, str] | None:
    """Linha equivalente já presente no destino (a busca ignora valores não-ASCII)."""
    keys = VERIFY_KEYS.get(c.path)
    if not keys:
        return None
    query = [f"?{k}={c.attrs[k]}" for k in keys if c.attrs.get(k) and c.attrs[k].isascii()]
    if not query:
        return None
    rows = api.talk([f"{c.path}/print"] + query + ["=.proplist=.id,comment"])
    skipped = any(c.attrs.get(k) and not c.attrs[k].isascii() for k in keys)
    if skipped or not c.attrs.get("comment", "").isascii():
        want = _skeleton(c.attrs.get("comment", ""))
        rows = [r for r in rows if _skeleton(r.get("comment", "")) == want]
    return rows[0] if rows else None


def apply_cmds(api: Any, cmds: list[Cmd], log: Callable[[str, str], None]) -> dict[str, int]:
    """log(status, texto) com status OK | JA | ERRO."""
    stats = {"OK": 0, "JA": 0, "ERRO": 0, "DESC": 0}
    for c in cmds:
        label = render_cmd(c, mask=True)
        try:
            dropped: list[str] = []
            if c.action == "add":
                row = find_existing(api, c)
                if row is not None:
                    want = c.attrs.get("comment")
                    stats["JA"] += 1
                    if want is not None and row.get("comment", "") != want:
                        api.talk([f"{c.path}/set", f"=.id={row['.id']}", f"=comment={want}"])
                        log("JA", label + "  (comentário corrigido)")
                    else:
                        log("JA", label)
                    continue
                dropped = talk_dropping_unknown(api, [f"{c.path}/add"], c.attrs)
            elif c.action == "set":
                dropped = talk_dropping_unknown(api, [f"{c.path}/set"], c.attrs)
            else:
                assert c.find
                query = [f"?{c.find[0]}={c.find[1]}"] + ([f"?{c.find2[0]}={c.find2[1]}"] if c.find2 else [])
                found = api.talk([f"{c.path}/print"] + query + ["=.proplist=.id"])
                if not found:
                    if c.action == "remove_find":
                        stats["JA"] += 1
                        log("JA", label + "  (já ausente)")
                        continue
                    raise RouterOSError(f"linha {c.find[0]}={c.find[1]} não existe no MK novo")
                if c.action == "remove_find":
                    api.talk([f"{c.path}/remove", f"=.id={found[0]['.id']}"])
                else:
                    dropped = talk_dropping_unknown(api, [f"{c.path}/set", f"=.id={found[0]['.id']}"], c.attrs)
            stats["OK"] += 1
            if dropped:
                stats["DESC"] += 1
                log("OK", f"{label}  [parâmetros não suportados no destino, descartados: {', '.join(dropped)}]")
            else:
                log("OK", label)
        except RouterOSError as e:
            if c.action == "add" and any(a in str(e).lower() for a in ALREADY):
                stats["JA"] += 1
                log("JA", label)
            else:
                stats["ERRO"] += 1
                log("ERRO", f"{label}  ->  {e}")
    return stats


CUTOVER_SCRIPT = "cutover-migracao"


def cutover_source(cmds: list[Cmd]) -> str:
    lines = ['/log warning message="[MIGRACAO] cutover iniciado"']
    for c in cmds:
        lines.append(f':do {{ {render_cmd(c)} }} on-error={{ /log warning message="[MIGRACAO] falhou: {c.path}" }}')
    lines.append('/log warning message="[MIGRACAO] cutover concluido"')
    return "\n".join(lines)


def run_cutover(api: RouterOSAPI, cmds: list[Cmd]) -> None:
    """Instala e executa o script dentro do MK novo; sobrevive à queda da sessão."""
    old = api.talk(["/system/script/print", f"?name={CUTOVER_SCRIPT}", "=.proplist=.id"])
    for r in old:
        api.talk(["/system/script/remove", f"=.id={r['.id']}"])
    api.talk(["/system/script/add", f"=name={CUTOVER_SCRIPT}", f"=source={cutover_source(cmds)}",
              "=policy=read,write,policy,test,sensitive"])
    try:
        api.talk(["/system/script/run", f"=number={CUTOVER_SCRIPT}"])
    except (RouterOSError, OSError):
        pass  # esperado: o script remove o IP pelo qual esta sessão chegou


# ── verificação (MK novo x plano) ──

VERIFY_KEYS: dict[str, tuple[str, ...]] = {
    "/interface/bridge": ("name",), "/interface/bridge/port": ("interface",), "/interface/list": ("name",),
    "/interface/list/member": ("list", "interface"), "/interface/wireguard": ("name",),
    "/interface/wireguard/peers": ("public-key",), "/interface/pppoe-client": ("name",),
    "/ppp/profile": ("name",), "/ip/pool": ("name",), "/ip/address": ("address",),
    "/ip/dhcp-server": ("name",), "/ip/dhcp-server/network": ("address",),
    "/ip/dhcp-server/lease": ("address",), "/ip/dhcp-client": ("interface",),
    "/ip/dns/static": ("name", "address"), "/ip/route": ("dst-address", "gateway"),
    "/ip/firewall/filter": FW_KEYS, "/ip/firewall/nat": FW_KEYS,
    "/ip/firewall/mangle": FW_KEYS, "/ip/firewall/raw": FW_KEYS,
    "/ip/firewall/address-list": ("list", "address"), "/ppp/secret": ("name",),
    "/system/script": ("name",), "/system/scheduler": ("name",), "/tool/netwatch": ("host",),
}


def _norm(v: str) -> str:
    return {"yes": "true", "no": "false"}.get(v, v)


def verify(plan: Plan, new: Snapshot, phase: int = 1) -> list[str]:
    """Lista o que o plano esperava mas não está no MK novo."""
    problems: list[str] = []
    for c in plan.cmds:
        if c.phase != phase or c.action != "add":
            continue
        keys = VERIFY_KEYS.get(c.path)
        rows = new.sections.get(c.path)
        if not keys:
            continue
        if rows is None:
            problems.append(f"{c.path}: seção ilegível no MK novo")
            continue
        want = {k: _norm(c.attrs.get(k, "")) for k in keys}
        if not any(all(_norm(r.get(k, "")) == v for k, v in want.items()) for r in rows):
            problems.append(f"{c.path}: ausente {want}")
    return problems


# ────────────────────────────────────────────────────────────────
# Conexão
# ────────────────────────────────────────────────────────────────

def load_conn(prefix: str, env: dict[str, str]) -> dict[str, Any] | None:
    def get(name: str) -> str | None:
        v = env.get(f"MIKROTIK_{prefix}_{name}")
        if v is None and prefix == "OLD":
            v = env.get(f"MIKROTIK_{name}")
        return v or None

    host, user, pw = get("HOST"), get("USER"), get("PASSWORD")
    if not (host and user and pw):
        return None
    use_ssl = parse_bool(get("USE_SSL"))
    return {"host": host, "user": user, "password": pw, "use_ssl": use_ssl,
            "port": int(get("PORT") or (8729 if use_ssl else 8728))}


def open_api(conn: dict[str, Any]) -> RouterOSAPI:
    api = RouterOSAPI(conn["host"], conn["port"], conn["user"], conn["password"], conn["use_ssl"], timeout=15.0)
    api.connect()
    return api


def save(name: str, text: str) -> Path:
    OUT_DIR.mkdir(exist_ok=True)
    path = OUT_DIR / name
    path.write_text(text, encoding="utf-8")
    return path


# ────────────────────────────────────────────────────────────────
# TUI (somente stdlib)
# ────────────────────────────────────────────────────────────────

C = {"r": "\x1b[0m", "b": "\x1b[1m", "d": "\x1b[2m", "red": "\x1b[31m", "grn": "\x1b[32m",
     "yel": "\x1b[33m", "cyn": "\x1b[36m", "inv": "\x1b[7m"}
ANSI = re.compile(r"\x1b\[[0-9;]*m")


def _enable_vt() -> None:
    if os.name == "nt":
        os.system("")


def getkey() -> str:
    if os.name == "nt":
        import msvcrt
        ch = msvcrt.getwch()
        if ch in ("\x00", "\xe0"):
            return {"H": "up", "P": "down", "I": "pgup", "Q": "pgdn"}.get(msvcrt.getwch(), "")
        if ch == "\r":
            return "enter"
        if ch == "\x1b":
            return "esc"
        if ch == "\x03":
            raise KeyboardInterrupt
        return ch
    import termios
    import tty
    fd = sys.stdin.fileno()
    saved = termios.tcgetattr(fd)
    try:
        tty.setraw(fd)
        ch = sys.stdin.read(1)
        if ch == "\x1b":
            if sys.stdin.read(1) == "[":
                return {"A": "up", "B": "down", "5": "pgup", "6": "pgdn"}.get(sys.stdin.read(1), "")
            return "esc"
        if ch in ("\r", "\n"):
            return "enter"
        if ch == "\x03":
            raise KeyboardInterrupt
        return ch
    finally:
        termios.tcsetattr(fd, termios.TCSADRAIN, saved)


def clear() -> None:
    sys.stdout.write("\x1b[2J\x1b[H")


def menu(title: str, options: list[str], header: list[str] | None = None, start: int = 0) -> int | None:
    idx = start
    while True:
        clear()
        print(f"{C['b']}{C['cyn']}{title}{C['r']}\n")
        for line in header or []:
            print(line)
        if header:
            print()
        for i, opt in enumerate(options):
            print(f"  {C['inv']} {opt} {C['r']}" if i == idx else f"   {opt}")
        print(f"\n{C['d']}↑/↓ navega · Enter seleciona · Esc/q volta{C['r']}")
        k = getkey()
        if k == "up":
            idx = (idx - 1) % len(options)
        elif k == "down":
            idx = (idx + 1) % len(options)
        elif k == "enter":
            return idx
        elif k in ("esc", "q"):
            return None


def ask(label: str, default: str = "") -> str:
    val = input(f"{label}{f' [{default}]' if default else ''}: ").strip()
    return val or default


def pause(msg: str = "Enter para continuar…") -> None:
    input(f"\n{C['d']}{msg}{C['r']}")


def paginate(lines: list[str], title: str) -> None:
    import shutil
    page = max(5, shutil.get_terminal_size((100, 30)).lines - 6)
    pos = 0
    while True:
        clear()
        print(f"{C['b']}{C['cyn']}{title}{C['r']}  {C['d']}({pos + 1}-{min(pos + page, len(lines))}/{len(lines)}){C['r']}\n")
        print("\n".join(lines[pos:pos + page]))
        print(f"\n{C['d']}↑/↓ rola · PgUp/PgDn página · Esc/q volta{C['r']}")
        k = getkey()
        if k == "down":
            pos = min(max(0, len(lines) - page), pos + 1)
        elif k == "up":
            pos = max(0, pos - 1)
        elif k == "pgdn":
            pos = min(max(0, len(lines) - page), pos + page)
        elif k == "pgup":
            pos = max(0, pos - page)
        elif k in ("esc", "q"):
            return


LEVEL_FMT = {"BLOCKER": f"{C['red']}{C['b']}BLOQUEIO{C['r']}", "WARN": f"{C['yel']}AVISO   {C['r']}",
             "INFO": f"{C['cyn']}INFO    {C['r']}", "OK": f"{C['grn']}OK      {C['r']}"}


def format_findings(findings: list[Finding]) -> list[str]:
    order = {"BLOCKER": 0, "WARN": 1, "OK": 2, "INFO": 3}
    return [f"{LEVEL_FMT[f.level]} {f.message}" for f in sorted(findings, key=lambda f: order[f.level])]


@dataclass
class State:
    env: dict[str, str]
    old: Snapshot | None = None
    new: Snapshot | None = None
    layout: Layout | None = None
    uplink: str = "ether3"


def read_device(state: State, prefix: str) -> Snapshot | None:
    conn = load_conn(prefix, state.env)
    if not conn:
        print(f"{C['red']}Credenciais ausentes: defina MIKROTIK_{prefix}_HOST/_USER/_PASSWORD no .env{C['r']}")
        return None
    print(f"Conectando em {conn['host']}:{conn['port']} …")
    try:
        api = open_api(conn)
    except (RouterOSError, OSError) as e:
        print(f"{C['red']}Falha: {e}{C['r']}")
        if prefix == "OLD":
            print("Se o CRS328 estiver rodando SwOS, ele não tem API — exporte a config manualmente.")
        return None
    try:
        snap = collect(ReadOnlyAPI(api), conn["host"], lambda m: print(f"  lendo {m}…"))
    finally:
        api.close()
    save(f"snapshot-{prefix.lower()}.json", snap.to_json())
    return snap


def ensure_layout(state: State) -> Layout | None:
    if not state.old:
        return None
    if state.layout is None:
        conn = load_conn("NEW", state.env)
        state.layout = default_layout(state.old, state.new, state.uplink, conn["host"] if conn else "")
    return state.layout


def need_old(state: State) -> bool:
    if state.old:
        return True
    print("Leia o MK atual primeiro.")
    pause()
    return False


def screen_layout(state: State) -> None:
    if not need_old(state):
        return
    lay = ensure_layout(state)
    assert lay
    ports = new_ports(state.new)
    sel = 0
    while True:
        rows = [f"Uplink para o switch: {lay.uplink}",
                f"Portas LAN diretas:    {', '.join(lay.lan) or '(nenhuma)'}",
                "« Voltar"]
        header = [f"WAN (fixas):  " + ", ".join(f"{d} -> {f}" for d, f in lay.wan.items()),
                  f"Bridge: {lay.bridge}   ·   IP temporário a remover no cutover: {lay.mgmt_address or '(não identificado)'}"]
        i = menu("Layout de portas do MK novo", rows, header, sel)
        if i is None or i == 2:
            return
        sel = i
        free = [p for p in ports if p.startswith("ether") and p not in lay.wan]
        if i == 0:
            j = menu("Porta de uplink", free)
            if j is not None:
                lay.uplink = free[j]
                lay.lan = [p for p in free if p != lay.uplink]
        else:
            cand = [p for p in free if p != lay.uplink]
            while True:
                opts = [f"[{'x' if p in lay.lan else ' '}] {p}" for p in cand] + ["« OK"]
                j = menu("Portas LAN diretas (Enter alterna)", opts)
                if j is None or j == len(cand):
                    break
                p = cand[j]
                lay.lan.remove(p) if p in lay.lan else lay.lan.append(p)
            lay.lan = [p for p in cand if p in lay.lan]


def screen_report(state: State) -> None:
    if not need_old(state):
        return
    lay = ensure_layout(state)
    assert lay and state.old
    findings = analyze(state.old, state.new, lay)
    plan = build_plan(state.old, lay, state.new)
    lines = format_findings(findings) + ["", f"{C['b']}Itens a migrar (fase 1 / fase 2):{C['r']}"]
    for sec in SECTIONS:
        n1, n2 = plan.counts.get(f"{sec.path}|1", 0), plan.counts.get(f"{sec.path}|2", 0)
        if n1 or n2:
            lines.append(f"  {sec.label:<42} {n1:>4} / {n2}")
    if plan.skipped:
        lines += ["", f"{C['yel']}Não migrados ({len(plan.skipped)}):{C['r']}"] + [f"  {s}" for s in plan.skipped]
    save("relatorio.txt", ANSI.sub("", "\n".join(lines)))
    paginate(lines, "Relatório de viabilidade")


def screen_generate(state: State) -> None:
    if not need_old(state):
        return
    lay = ensure_layout(state)
    assert lay and state.old
    plan = build_plan(state.old, lay, state.new)
    path = save("migracao.rsc", render_rsc(plan, state.old, lay))
    print(f"{C['grn']}Gerado: {path}{C['r']}  ({len(plan.cmds)} comandos, {len(plan.skipped)} não migrados)")
    pause()


def confirm_host(conn: dict[str, Any], what: str, yes: str | None = None) -> bool:
    print(f"{what} em {conn['host']}.")
    typed = yes if yes is not None else ask(f"Digite o IP do MK novo ({conn['host']}) para confirmar")
    if typed != conn["host"]:
        print("Cancelado.")
        return False
    return True


def run_phase1(state: State, yes: str | None = None) -> int:
    if not state.old:
        return 2
    conn = load_conn("NEW", state.env)
    lay = ensure_layout(state)
    if not conn or not lay:
        print("Defina MIKROTIK_NEW_* no .env")
        return 2
    findings = analyze(state.old, state.new, lay)
    if any(f.level == "BLOCKER" for f in findings):
        print("\n".join(format_findings([f for f in findings if f.level == "BLOCKER"])))
        return 1
    plan = build_plan(state.old, lay, state.new)
    cmds = ordered(plan, 1)
    if not confirm_host(conn, f"{len(cmds)} comando(s) da FASE 1 serão enviados", yes):
        return 1
    api = open_api(conn)
    try:
        backup = f"pre-migracao-{time.strftime('%Y%m%d-%H%M%S')}"
        api.talk(["/system/backup/save", f"=name={backup}"])
        print(f"{C['grn']}Backup salvo no MK novo: {backup}.backup{C['r']}")
        log_lines: list[str] = []

        def log(status: str, msg: str) -> None:
            log_lines.append(f"{status:<4} {msg}")
            col = {"OK": C["grn"], "JA": C["cyn"], "ERRO": C["red"]}[status]
            print(f"{col}{status:<4}{C['r']} {msg}")

        stats = apply_cmds(api, cmds, log)
        save("fase1.log", "\n".join(log_lines))
    finally:
        api.close()
    print(f"\nFase 1: {stats['OK']} ok, {stats['JA']} já existiam, {stats['ERRO']} com erro. Log: {OUT_DIR / 'fase1.log'}")
    return 1 if stats["ERRO"] else 0


def run_verify(state: State) -> int:
    if not state.old:
        return 2
    state.new = read_device(state, "NEW") or state.new
    lay = ensure_layout(state)
    if not state.new or not lay:
        return 2
    plan = build_plan(state.old, lay, state.new)
    problems = verify(plan, state.new, 1)
    if problems:
        print(f"{C['red']}{len(problems)} divergência(s):{C['r']}")
        print("\n".join(f"  {p}" for p in problems[:80]))
        return 1
    print(f"{C['grn']}MK novo confere com o plano da fase 1 ({len([c for c in plan.cmds if c.phase == 1])} comandos).{C['r']}")
    return 0


def run_cutover_cmd(state: State, yes: str | None = None) -> int:
    if not state.old:
        return 2
    conn = load_conn("NEW", state.env)
    lay = ensure_layout(state)
    if not conn or not lay:
        return 2
    if not lay.mgmt_address:
        print(f"{C['red']}IP temporário do MK novo não identificado; abortando para não deixar o cliente DHCP da WAN.{C['r']}")
        return 2
    cmds = ordered(build_plan(state.old, lay, state.new), 2)
    main_cmds = [c for c in cmds if not c.last]
    final_cmds = [c for c in cmds if c.last]
    print(f"{C['yel']}Etapa A ({len(main_cmds)} comandos, por API) ativa PPPoE/DHCP/WireGuard/netwatch.\n"
          f"Etapa B ({len(final_cmds)} comandos, script no equipamento) assume {lay.bridge} com o IP final, clona o MAC da "
          f"WAN de gerência e remove {lay.mgmt_address}; a sessão cai aqui.{C['r']}")
    if not confirm_host(conn, "Cutover será executado", yes):
        return 1
    api = open_api(conn)
    try:
        def log(status: str, msg: str) -> None:
            col = {"OK": C["grn"], "JA": C["cyn"], "ERRO": C["red"]}[status]
            print(f"{col}{status:<4}{C['r']} {msg}"[:230])

        stats = apply_cmds(api, main_cmds, log)
        if stats["ERRO"]:
            print(f"{C['red']}Etapa A teve {stats['ERRO']} erro(s); etapa B NÃO executada.{C['r']}")
            return 1
        run_cutover(api, final_cmds)
    finally:
        api.close()
    print("Etapa B enviada. O MK novo agora responde no IP final da LAN; troque os cabos e rode --verify-final.")
    return 0


def tui(state: State) -> int:
    _enable_vt()
    sel = 0
    while True:
        def tag(s: Snapshot | None) -> str:
            return f"{C['grn']}{s.board} v{s.version} ({s.host}){C['r']}" if s else f"{C['d']}não lido{C['r']}"
        header = [f"MK atual (produção): {tag(state.old)}", f"MK novo:             {tag(state.new)}"]
        i = menu("WatchIT Tower — Migração Mikrotik (CRS328 -> RB5009)", [
            "1. Ler MK atual (somente leitura, inclui segredos)",
            "2. Ler MK novo",
            "3. Layout de portas",
            "4. Relatório de viabilidade",
            "5. Gerar script .rsc (fases 1 e 2)",
            "6. FASE 1 — preparar MK novo (não disruptiva)",
            "7. Verificar MK novo contra o plano",
            "8. FASE 2 — cutover (ativa tudo e assume o IP final)",
            "9. Carregar snapshot salvo do MK atual",
            "Sair",
        ], header, sel)
        if i is None or i == 9:
            return 0
        sel = i
        clear()
        if i == 0:
            state.old = read_device(state, "OLD") or state.old
            state.layout = None
            pause()
        elif i == 1:
            state.new = read_device(state, "NEW") or state.new
            state.layout = None
            pause()
        elif i == 2:
            screen_layout(state)
        elif i == 3:
            screen_report(state)
        elif i == 4:
            screen_generate(state)
        elif i == 5:
            if need_old(state):
                run_phase1(state)
                pause()
        elif i == 6:
            if need_old(state):
                run_verify(state)
                pause()
        elif i == 7:
            if need_old(state):
                run_cutover_cmd(state)
                pause()
        elif i == 8:
            p = OUT_DIR / "snapshot-old.json"
            if p.is_file():
                state.old = Snapshot.from_json(p.read_text(encoding="utf-8"))
                state.layout = None
                print(f"Carregado {p}")
            else:
                print(f"{p} não existe.")
            pause()


def headless(state: State, args: argparse.Namespace) -> int:
    if args.load_old:
        state.old = Snapshot.from_json(Path(args.load_old).read_text(encoding="utf-8"))
    elif args.phase1 or args.cutover or args.verify:
        p = OUT_DIR / "snapshot-old.json"
        if not p.is_file():
            print("Rode --headless antes (precisa do snapshot do MK atual).")
            return 2
        state.old = Snapshot.from_json(p.read_text(encoding="utf-8"))
    else:
        state.old = read_device(state, "OLD")
    if not state.old:
        return 2
    if not (args.phase1 or args.cutover or args.verify) and load_conn("NEW", state.env):
        state.new = read_device(state, "NEW")
    elif args.phase1 or args.verify or args.cutover:
        state.new = read_device(state, "NEW")
    state.uplink = args.uplink
    ensure_layout(state)
    if args.verify:
        return run_verify(state)
    if args.phase1:
        return run_phase1(state, args.yes)
    if args.cutover:
        return run_cutover_cmd(state, args.yes)
    lay = state.layout
    assert lay
    findings = analyze(state.old, state.new, lay)
    plan = build_plan(state.old, lay, state.new)
    print("\n".join(format_findings(findings)))
    path = save("migracao.rsc", render_rsc(plan, state.old, lay))
    print(f"\n{len(plan.cmds)} comandos em {path}; {len(plan.skipped)} não migrados.")
    for s in plan.skipped:
        print(f"  não migrado: {s}")
    return 1 if any(f.level == "BLOCKER" for f in findings) else 0


def main() -> int:
    ap = argparse.ArgumentParser(description="Migração CRS328-24P-4S+ -> RB5009UG+S+IN")
    ap.add_argument("--env", default=str(ENV_PATH))
    ap.add_argument("--headless", action="store_true", help="sem TUI: relatório e .rsc")
    ap.add_argument("--load-old", help="usa snapshot JSON do MK atual em vez de conectar")
    ap.add_argument("--uplink", default="ether3", help="porta do RB5009 ligada ao switch (padrão ether3)")
    ap.add_argument("--phase1", action="store_true", help="grava a fase 1 no MK novo")
    ap.add_argument("--verify", action="store_true", help="confere o MK novo contra o plano")
    ap.add_argument("--cutover", action="store_true", help="executa a fase 2 no MK novo")
    ap.add_argument("--yes", help="IP do MK novo, para confirmar escrita sem prompt")
    args = ap.parse_args()
    for stream in (sys.stdout, sys.stderr):
        stream.reconfigure(encoding="utf-8")
    state = State(env={**load_env_file(Path(args.env)), **os.environ})
    if args.headless or args.phase1 or args.verify or args.cutover or not sys.stdin.isatty():
        return headless(state, args)
    try:
        return tui(state)
    except KeyboardInterrupt:
        return 130


if __name__ == "__main__":
    sys.exit(main())
