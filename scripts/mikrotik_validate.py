#!/usr/bin/env python3
"""
Valida a configuração interna de um roteador Mikrotik via RouterOS API.

Conecta diretamente no equipamento (não depende do banco do WatchIT Tower)
e confere boas práticas de configuração: interfaces sem link, endereços IP
duplicados/sobrepostos, ausência de NAT, firewall permissivo demais,
serviços de gerência inseguros expostos, NTP/DNS mal configurados, etc.

Credenciais são lidas do arquivo .env na raiz do projeto (ou de variáveis
de ambiente já exportadas, que têm prioridade), usando:

    MIKROTIK_HOST=192.168.1.1
    MIKROTIK_PORT=8728
    MIKROTIK_USER=admin
    MIKROTIK_PASSWORD=troque-isto
    MIKROTIK_USE_SSL=false        # opcional — true usa API-SSL (porta 8729)

Uso:
    python scripts/mikrotik_validate.py
    python scripts/mikrotik_validate.py --host 10.0.0.1 --user admin --password ***
    python scripts/mikrotik_validate.py --json

Requer apenas a biblioteca padrão do Python 3 (nenhuma dependência externa).
"""

from __future__ import annotations

import argparse
import json
import os
import socket
import ssl
import sys
from dataclasses import dataclass, field
from ipaddress import ip_interface, ip_network
from pathlib import Path
from typing import Any

ENV_PATH = Path(__file__).resolve().parent.parent / ".env"


# ────────────────────────────────────────────────────────────────
# .env loader (sem dependência de python-dotenv)
# ────────────────────────────────────────────────────────────────

def load_env_file(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not path.is_file():
        return values
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        values[key] = value
    return values


# ────────────────────────────────────────────────────────────────
# Cliente RouterOS API (protocolo binário, implementação pura stdlib)
# ────────────────────────────────────────────────────────────────

class RouterOSError(RuntimeError):
    pass


class RouterOSAPI:
    def __init__(self, host: str, port: int, username: str, password: str,
                 use_ssl: bool = False, timeout: float = 8.0):
        self.host = host
        self.port = port
        self.username = username
        self.password = password
        self.use_ssl = use_ssl
        self.timeout = timeout
        self.sock: socket.socket | ssl.SSLSocket | None = None

    def connect(self) -> None:
        raw = socket.create_connection((self.host, self.port), timeout=self.timeout)
        if self.use_ssl:
            ctx = ssl.create_default_context()
            ctx.check_hostname = False
            ctx.verify_mode = ssl.CERT_NONE
            self.sock = ctx.wrap_socket(raw)
        else:
            self.sock = raw
        try:
            self.talk(["/login", f"=name={self.username}", f"=password={self.password}"])
        except RouterOSError as err:
            self.close()
            raise RouterOSError(f"Falha de autenticação: {err}") from err

    def close(self) -> None:
        if self.sock is not None:
            try:
                self.sock.close()
            except OSError:
                pass
            self.sock = None

    def __enter__(self) -> "RouterOSAPI":
        self.connect()
        return self

    def __exit__(self, *_exc: object) -> None:
        self.close()

    # -- protocolo de comprimento (length encoding) --------------------

    def _recv_exact(self, n: int) -> bytes:
        assert self.sock is not None
        buf = bytearray()
        while len(buf) < n:
            chunk = self.sock.recv(n - len(buf))
            if not chunk:
                raise RouterOSError("Conexão encerrada pelo Mikrotik inesperadamente")
            buf.extend(chunk)
        return bytes(buf)

    def _read_length(self) -> int:
        c1 = self._recv_exact(1)[0]
        if c1 & 0x80 == 0x00:
            return c1
        if c1 & 0xC0 == 0x80:
            c2 = self._recv_exact(1)[0]
            return ((c1 & 0x3F) << 8) | c2
        if c1 & 0xE0 == 0xC0:
            c2, c3 = self._recv_exact(2)
            return ((c1 & 0x1F) << 16) | (c2 << 8) | c3
        if c1 & 0xF0 == 0xE0:
            c2, c3, c4 = self._recv_exact(3)
            return ((c1 & 0x0F) << 24) | (c2 << 16) | (c3 << 8) | c4
        if c1 & 0xF8 == 0xF0:
            c2, c3, c4, c5 = self._recv_exact(4)
            return (c2 << 24) | (c3 << 16) | (c4 << 8) | c5
        raise RouterOSError(f"Byte de comprimento inválido: {c1:#x}")

    @staticmethod
    def _encode_length(length: int) -> bytes:
        if length < 0x80:
            return bytes([length])
        if length < 0x4000:
            length |= 0x8000
            return length.to_bytes(2, "big")
        if length < 0x200000:
            length |= 0xC00000
            return length.to_bytes(3, "big")
        if length < 0x10000000:
            length |= 0xE0000000
            return length.to_bytes(4, "big")
        return b"\xF0" + length.to_bytes(4, "big")

    def _write_word(self, word: str) -> None:
        assert self.sock is not None
        data = word.encode("utf-8")
        self.sock.sendall(self._encode_length(len(data)) + data)

    def _write_sentence(self, words: list[str]) -> None:
        for word in words:
            self._write_word(word)
        self.sock.sendall(self._encode_length(0))  # type: ignore[union-attr]

    def _read_word(self) -> str | None:
        length = self._read_length()
        if length == 0:
            return None
        raw = self._recv_exact(length)
        try:
            return raw.decode("utf-8")
        except UnicodeDecodeError:
            return raw.decode("cp1252", errors="replace")  # RouterOS antigo guarda comentários em latin-1

    def _read_sentence(self) -> list[str]:
        words: list[str] = []
        while True:
            word = self._read_word()
            if word is None:
                return words
            words.append(word)

    def talk(self, words: list[str]) -> list[dict[str, str]]:
        """Envia uma sentença e coleta todas as respostas até !done."""
        self._write_sentence(words)
        results: list[dict[str, str]] = []
        trap: str | None = None
        while True:
            sentence = self._read_sentence()
            if not sentence:
                continue
            reply, *rest = sentence
            attrs: dict[str, str] = {}
            for w in rest:
                if w.startswith("="):
                    k, _, v = w[1:].partition("=")
                    attrs[k] = v
            if reply == "!re":
                results.append(attrs)
            elif reply == "!done":
                if trap is not None:
                    raise RouterOSError(trap)
                return results
            elif reply == "!trap":
                # não levanta já: o !done final ainda está a caminho e precisa ser consumido,
                # senão a próxima chamada lê a resposta deslocada
                trap = attrs.get("message", " ".join(rest))
            elif reply == "!fatal":
                raise RouterOSError("Fatal: " + " ".join(rest))


# ────────────────────────────────────────────────────────────────
# Findings
# ────────────────────────────────────────────────────────────────

@dataclass
class Finding:
    level: str  # "OK" | "INFO" | "WARN"
    category: str
    message: str


@dataclass
class Report:
    findings: list[Finding] = field(default_factory=list)

    def add(self, level: str, category: str, message: str) -> None:
        self.findings.append(Finding(level, category, message))

    def ok(self, category: str, message: str) -> None:
        self.add("OK", category, message)

    def info(self, category: str, message: str) -> None:
        self.add("INFO", category, message)

    def warn(self, category: str, message: str) -> None:
        self.add("WARN", category, message)


def run_check(report: Report, category: str, fn) -> None:
    """Executa um checador isolando falhas (comando não suportado nesta versão etc.)."""
    try:
        fn(report)
    except RouterOSError as err:
        report.info(category, f"Não foi possível validar ({err})")


# ────────────────────────────────────────────────────────────────
# Validações
# ────────────────────────────────────────────────────────────────

def check_identity(api: RouterOSAPI, report: Report) -> None:
    identity = api.talk(["/system/identity/print"])
    name = identity[0].get("name", "?") if identity else "?"
    report.info("Identidade", f"system identity = '{name}'")


def check_resource(api: RouterOSAPI, report: Report) -> None:
    res = api.talk(["/system/resource/print"])
    if not res:
        return
    r = res[0]
    report.info(
        "Sistema",
        f"RouterOS {r.get('version', '?')} — board {r.get('board-name', '?')} — "
        f"uptime {r.get('uptime', '?')}",
    )
    cpu = r.get("cpu-load")
    if cpu is not None and cpu.isdigit() and int(cpu) > 80:
        report.warn("Sistema", f"CPU load alta: {cpu}%")


def check_interfaces(api: RouterOSAPI, report: Report) -> None:
    ifaces = api.talk(["/interface/print"])
    for iface in ifaces:
        name = iface.get("name", "?")
        if iface.get("disabled") == "true":
            continue
        if iface.get("running") == "false":
            report.warn("Interfaces", f"'{name}' está habilitada mas sem link (running=no)")
    report.info("Interfaces", f"{len(ifaces)} interface(s) encontrada(s)")


def check_ip_addresses(api: RouterOSAPI, report: Report) -> None:
    addrs = api.talk(["/ip/address/print"])
    parsed: list[tuple[str, Any]] = []
    for a in addrs:
        if a.get("disabled") == "true":
            continue
        cidr = a.get("address")
        iface = a.get("interface", "?")
        if not cidr:
            continue
        try:
            net = ip_interface(cidr).network
        except ValueError:
            report.warn("Endereços IP", f"Endereço inválido '{cidr}' em '{iface}'")
            continue
        parsed.append((iface, net))

    for i in range(len(parsed)):
        iface_a, net_a = parsed[i]
        for j in range(i + 1, len(parsed)):
            iface_b, net_b = parsed[j]
            if iface_a == iface_b:
                continue
            if net_a.overlaps(net_b):
                report.warn(
                    "Endereços IP",
                    f"Sub-redes sobrepostas: '{iface_a}' ({net_a}) e '{iface_b}' ({net_b})",
                )
    report.info("Endereços IP", f"{len(parsed)} endereço(s) ativo(s) verificado(s)")


def check_dhcp(api: RouterOSAPI, report: Report) -> None:
    servers = api.talk(["/ip/dhcp-server/print"])
    if not servers:
        report.info("DHCP", "Nenhum servidor DHCP configurado")
        return
    for s in servers:
        name = s.get("name", "?")
        if s.get("disabled") == "true":
            report.info("DHCP", f"Servidor '{name}' está desabilitado")
            continue
        lease_time = s.get("lease-time", "")
        if lease_time.endswith("s") and lease_time[:-1].isdigit() and int(lease_time[:-1]) < 300:
            report.warn("DHCP", f"Servidor '{name}' com lease-time muito curto ({lease_time})")
        report.ok("DHCP", f"Servidor '{name}' ativo na interface '{s.get('interface', '?')}'")


def check_nat(api: RouterOSAPI, report: Report) -> None:
    rules = api.talk(["/ip/firewall/nat/print"])
    masquerade = [
        r for r in rules
        if r.get("chain") == "srcnat" and r.get("action") == "masquerade" and r.get("disabled") != "true"
    ]
    if not masquerade:
        report.warn(
            "NAT",
            "Nenhuma regra ativa de masquerade em 'srcnat' — hosts da rede interna podem "
            "não conseguir sair para a internet",
        )
    else:
        report.ok("NAT", f"{len(masquerade)} regra(s) de masquerade ativa(s)")


def check_firewall_filter(api: RouterOSAPI, report: Report) -> None:
    rules = api.talk(["/ip/firewall/filter/print"])
    input_rules = [r for r in rules if r.get("chain") == "input" and r.get("disabled") != "true"]

    if not input_rules:
        report.warn(
            "Firewall",
            "Chain 'input' sem regras — política implícita é aceitar todo tráfego "
            "destinado ao próprio roteador",
        )
        return

    has_drop_or_reject = any(r.get("action") in ("drop", "reject") for r in input_rules)
    if not has_drop_or_reject:
        report.warn(
            "Firewall",
            "Chain 'input' não possui nenhuma regra de drop/reject — "
            "considere bloquear acesso não autorizado ao roteador",
        )
    else:
        report.ok("Firewall", f"Chain 'input' com {len(input_rules)} regra(s), incluindo drop/reject")


def check_services(api: RouterOSAPI, report: Report) -> None:
    services = api.talk(["/ip/service/print"])
    insecure_protocols = {"telnet", "ftp"}
    for svc in services:
        if svc.get("disabled") == "true":
            continue
        name = svc.get("name", "?")
        if name in insecure_protocols:
            report.warn("Serviços", f"Serviço inseguro '{name}' está habilitado — recomenda-se desabilitar")
        elif name in ("www", "api") and not svc.get("address"):
            report.warn(
                "Serviços",
                f"Serviço '{name}' habilitado sem restrição de IP de origem (address vazio)",
            )
        elif name in ("www-ssl", "api-ssl", "ssh"):
            report.ok("Serviços", f"Serviço '{name}' habilitado")


def check_ntp(api: RouterOSAPI, report: Report) -> None:
    ntp = api.talk(["/system/ntp/client/print"])
    if not ntp:
        return
    if ntp[0].get("enabled") == "false":
        report.warn("NTP", "Cliente NTP desabilitado — risco de drift de relógio (logs, certificados)")
    else:
        report.ok("NTP", "Cliente NTP habilitado")


def check_dns(api: RouterOSAPI, report: Report) -> None:
    dns = api.talk(["/ip/dns/print"])
    if not dns:
        return
    d = dns[0]
    if d.get("allow-remote-requests") == "true":
        report.warn(
            "DNS",
            "allow-remote-requests=yes — o roteador pode atuar como resolver DNS aberto "
            "(risco de abuso para amplificação de DDoS)",
        )
    if not d.get("servers"):
        report.info("DNS", "Nenhum servidor DNS upstream configurado")


def check_users(api: RouterOSAPI, report: Report) -> None:
    users = api.talk(["/user/print"])
    for u in users:
        name = u.get("name", "?")
        if name == "admin" and u.get("disabled") != "true":
            report.info(
                "Usuários",
                "Usuário padrão 'admin' está ativo — considere renomeá-lo ou "
                "desabilitá-lo após criar outro usuário administrativo",
            )
    report.info("Usuários", f"{len(users)} usuário(s) cadastrado(s)")


CHECKS: list[tuple[str, Any]] = [
    ("Identidade", check_identity),
    ("Sistema", check_resource),
    ("Interfaces", check_interfaces),
    ("Endereços IP", check_ip_addresses),
    ("DHCP", check_dhcp),
    ("NAT", check_nat),
    ("Firewall", check_firewall_filter),
    ("Serviços", check_services),
    ("NTP", check_ntp),
    ("DNS", check_dns),
    ("Usuários", check_users),
]


# ────────────────────────────────────────────────────────────────
# CLI
# ────────────────────────────────────────────────────────────────

def parse_bool(value: str | None, default: bool = False) -> bool:
    if value is None:
        return default
    return value.strip().lower() in ("1", "true", "yes", "on")


def build_config(args: argparse.Namespace) -> dict[str, Any]:
    env = {**load_env_file(Path(args.env)), **os.environ}

    host = args.host or env.get("MIKROTIK_HOST")
    port = args.port or int(env.get("MIKROTIK_PORT", "0") or 0) or None
    user = args.user or env.get("MIKROTIK_USER")
    password = args.password or env.get("MIKROTIK_PASSWORD")
    use_ssl = args.ssl or parse_bool(env.get("MIKROTIK_USE_SSL"))

    if not host or not user or not password:
        missing = [
            n for n, v in
            (("MIKROTIK_HOST", host), ("MIKROTIK_USER", user), ("MIKROTIK_PASSWORD", password))
            if not v
        ]
        raise SystemExit(
            "Faltam credenciais do Mikrotik: " + ", ".join(missing) + ".\n"
            f"Defina no arquivo {args.env} ou passe via --host/--user/--password.\n"
            "Exemplo de .env:\n"
            "  MIKROTIK_HOST=192.168.1.1\n"
            "  MIKROTIK_PORT=8728\n"
            "  MIKROTIK_USER=admin\n"
            "  MIKROTIK_PASSWORD=troque-isto"
        )

    return {
        "host": host,
        "port": port or (8729 if use_ssl else 8728),
        "user": user,
        "password": password,
        "use_ssl": use_ssl,
        "timeout": args.timeout,
    }


def print_report(report: Report, host: str) -> None:
    order = {"WARN": 0, "INFO": 1, "OK": 2}
    print(f"\nValidação de configuração — Mikrotik {host}\n" + "-" * 50)
    for level in ("WARN", "OK", "INFO"):
        items = [f for f in report.findings if f.level == level]
        if not items:
            continue
        label = {"WARN": "⚠ AVISOS", "OK": "✓ OK", "INFO": "ℹ INFO"}[level]
        print(f"\n{label}")
        for f in items:
            print(f"  [{f.category}] {f.message}")

    warns = sum(1 for f in report.findings if f.level == "WARN")
    print("\n" + "-" * 50)
    print(f"Total: {len(report.findings)} verificações — {warns} aviso(s)\n")


def main() -> int:
    parser = argparse.ArgumentParser(description="Valida configuração de um Mikrotik via RouterOS API")
    parser.add_argument("--env", default=str(ENV_PATH), help="Caminho do arquivo .env (padrão: raiz do projeto)")
    parser.add_argument("--host", help="IP/host do Mikrotik (sobrepõe MIKROTIK_HOST)")
    parser.add_argument("--port", type=int, help="Porta da API (sobrepõe MIKROTIK_PORT)")
    parser.add_argument("--user", help="Usuário da API (sobrepõe MIKROTIK_USER)")
    parser.add_argument("--password", help="Senha da API (sobrepõe MIKROTIK_PASSWORD)")
    parser.add_argument("--ssl", action="store_true", help="Usa API-SSL (porta 8729 por padrão)")
    parser.add_argument("--timeout", type=float, default=8.0, help="Timeout de conexão em segundos")
    parser.add_argument("--json", action="store_true", help="Imprime o relatório em JSON")
    args = parser.parse_args()

    config = build_config(args)

    report = Report()
    try:
        with RouterOSAPI(
            host=config["host"],
            port=config["port"],
            username=config["user"],
            password=config["password"],
            use_ssl=config["use_ssl"],
            timeout=config["timeout"],
        ) as api:
            for category, fn in CHECKS:
                run_check(report, category, lambda r, fn=fn: fn(api, r))
    except (RouterOSError, OSError) as err:
        print(f"Erro ao conectar no Mikrotik {config['host']}:{config['port']}: {err}", file=sys.stderr)
        return 2

    if args.json:
        print(json.dumps([f.__dict__ for f in report.findings], ensure_ascii=False, indent=2))
    else:
        print_report(report, config["host"])

    return 1 if any(f.level == "WARN" for f in report.findings) else 0


if __name__ == "__main__":
    sys.exit(main())
