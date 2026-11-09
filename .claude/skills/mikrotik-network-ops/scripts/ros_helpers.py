"""Helpers para operar Mikrotik por API reutilizando o cliente do repositório.

Uso (a partir da raiz do repo):

    import sys; sys.path.insert(0, ".claude/skills/mikrotik-network-ops/scripts")
    from ros_helpers import connect_prefix, connect_site, connect_linklocal, identity, \
        snapshot, find_refs, services, ping, masked

Todas as leituras são somente-leitura. Nada aqui imprime senhas: use `masked()` ao
mostrar linhas de configuração. Os segredos vêm do `.env` do repositório.
"""
from __future__ import annotations

import importlib.util
import json
import socket
import sys
from pathlib import Path
from typing import Any, Iterable

REPO = Path(__file__).resolve().parents[4]
_spec = importlib.util.spec_from_file_location("mkv", REPO / "scripts" / "mikrotik_validate.py")
mkv = importlib.util.module_from_spec(_spec)
sys.modules["mkv"] = mkv
_spec.loader.exec_module(mkv)

ENV: dict[str, str] = mkv.load_env_file(REPO / ".env")
SECRET_HINTS = ("passw", "private-key", "preshared", "secret", "passphrase", "token")

# Menus mais úteis para um retrato de segurança/rede (somente leitura).
DEFAULT_MENUS = [
    "/system/identity", "/system/resource", "/interface/bridge", "/interface/bridge/port",
    "/interface/list", "/interface/list/member", "/ip/address", "/ip/route", "/ip/pool",
    "/ip/dhcp-server", "/ip/dhcp-server/network", "/ip/dhcp-server/lease",
    "/ip/firewall/filter", "/ip/firewall/nat", "/ip/firewall/mangle", "/ip/firewall/address-list",
    "/ip/service", "/ip/dns", "/ip/cloud", "/system/ntp/client", "/system/clock",
    "/interface/wireguard", "/interface/wireguard/peers", "/tool/netwatch",
    "/system/script", "/system/scheduler", "/user", "/interface/wifi/capsman",
    "/interface/wifi/configuration", "/interface/wifi/provisioning", "/interface/wifi",
]


def masked(row: dict[str, str]) -> dict[str, str]:
    """Linha sem o `.id` e com valores sensíveis trocados por ***."""
    return {k: ("***" if any(h in k.lower() for h in SECRET_HINTS) else v)
            for k, v in row.items() if k != ".id"}


def connect_prefix(prefix: str, timeout: float = 10.0):
    """Conecta usando MIKROTIK_<PREFIX>_HOST/_PORT/_USER/_PASSWORD (prefix='NEW', 'OLD' ou '')."""
    p = f"MIKROTIK_{prefix}_" if prefix else "MIKROTIK_"
    api = mkv.RouterOSAPI(ENV[p + "HOST"], int(ENV.get(p + "PORT") or 8728),
                          ENV[p + "USER"], ENV[p + "PASSWORD"],
                          use_ssl=(ENV.get(p + "USE_SSL", "").lower() in ("1", "true", "yes")),
                          timeout=timeout)
    api.connect()
    return api


def connect_site(host: str, timeout: float = 10.0):
    """Conecta a um host listado em MK_ARRAY (mesmo índice em MK_USER/MK_PASSWORD)."""
    hosts = ENV["MK_ARRAY"].split(",")
    i = hosts.index(host)
    api = mkv.RouterOSAPI(host, 8728, ENV["MK_USER"].split(",")[i],
                          ENV["MK_PASSWORD"].split(",")[i], timeout=timeout)
    api.connect()
    return api


def link_local_from_mac(mac: str, ifindex: int) -> str:
    """fe80::<EUI-64 do MAC>%<ifindex> (para equipamento recém-resetado, sem IP)."""
    b = bytearray(int(x, 16) for x in mac.replace("-", ":").split(":"))
    b[0] ^= 0x02
    eui = bytes(b[:3]) + b"\xff\xfe" + bytes(b[3:])
    groups = [f"{eui[i] << 8 | eui[i + 1]:x}" for i in range(0, 8, 2)]
    return "fe80::" + ":".join(groups) + f"%{ifindex}"


def connect_linklocal(mac: str, ifindex: int, user: str, password: str, timeout: float = 8.0):
    """API via IPv6 link-local. ifindex vem de Get-NetAdapter (Windows)."""
    api = mkv.RouterOSAPI(link_local_from_mac(mac, ifindex), 8728, user, password, timeout=timeout)
    api.connect()
    return api


def identity(api) -> dict[str, str]:
    """Nome, placa, versão e uptime — confirme isto ANTES de qualquer mudança."""
    res = api.talk(["/system/resource/print"])[0]
    return {"identity": api.talk(["/system/identity/print"])[0]["name"],
            "board": res.get("board-name", ""), "version": res.get("version", ""),
            "uptime": res.get("uptime", "")}


def services(api) -> list[dict[str, str]]:
    """/ip/service sem as entradas dinâmicas (conexões ativas), que duplicam o nome."""
    return [r for r in api.talk(["/ip/service/print"]) if r.get("dynamic") != "true"]


def ping(api, address: str, count: int = 3) -> int:
    """Pacotes recebidos de `count`, executando o ping NO equipamento."""
    r = api.talk(["/ping", f"=address={address}", f"=count={count}"])
    return int(r[-1].get("received", "0"))


def snapshot(api, path: str | Path, menus: Iterable[str] = DEFAULT_MENUS, keep_secrets: bool = False) -> dict[str, Any]:
    """Grava um JSON {_meta, menus, errors} só com leituras.

    keep_secrets=False mascara chaves/senhas (bom para planejamento). Use True apenas para um
    dump de recuperação e guarde em pasta ignorada pelo git (.mikrotik-migration/).
    """
    out: dict[str, Any] = {"_meta": identity(api), "menus": {}, "errors": {}}
    for m in menus:
        try:
            rows = api.talk([m + "/print"])
            out["menus"][m] = rows if keep_secrets else [masked(r) | {".id": r.get(".id", "")} for r in rows]
        except Exception as exc:  # menu inexistente na placa/pacote
            out["errors"][m] = str(exc)[:120]
    Path(path).write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    return out


def find_refs(api, needle: str, menus: Iterable[str] = DEFAULT_MENUS) -> list[tuple[str, str, dict[str, str]]]:
    """Procura um texto (ex.: '192.168.0.0/24') em todos os campos dos menus.

    Útil antes de mudar máscara/IP: acha NAT, serviços, rotas, peers e scripts que citam o valor.
    """
    hits = []
    for m in menus:
        try:
            rows = api.talk([m + "/print"])
        except Exception:
            continue
        for r in rows:
            found = {k: v for k, v in r.items() if needle in v and not any(h in k.lower() for h in SECRET_HINTS)}
            if found:
                hits.append((m, r.get("name") or r.get("comment") or "", {k: v[:120] for k, v in found.items()}))
    return hits


def wait_for_api(connect, timeout: int = 240, first_wait: int = 25):
    """Espera o equipamento voltar depois de reboot. `connect` é um callable sem argumentos."""
    import time
    t0 = time.time()
    time.sleep(first_wait)
    while time.time() - t0 < timeout:
        try:
            return connect()
        except Exception:  # durante o boot a API pode falhar de várias formas (recusa, reset, login, timeout)
            time.sleep(5)
    raise TimeoutError("equipamento não voltou a responder")


if __name__ == "__main__":
    print("ros_helpers carregado; ENV com", len(ENV), "chaves (valores não exibidos)")
    print(link_local_from_mac("CC:2D:E0:9F:A1:9C", 23))
