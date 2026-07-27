"""
intelbras_nvr_client.py

Client de baixo nível para a API HTTP CGI dos NVDs/iNVDs Intelbras
(equipamentos rebrand Dahua, "API Intelbras" documentada em
HTTP_API_V3_xx_Intelbras.pdf - solicite ao suporte/chatbot Intelbras
se precisar validar nomes de campo exatos para o seu firmware).

Referência de implementação: github.com/wiltonsr/PyIntelbras (testado
em iNVD 9116 PE FT, API 2.84). Este client reimplementa apenas o
subconjunto necessário para validação de gravação, sem dependência
externa além de `requests`.

IMPORTANTE: antes de integrar no WatchIT Tower, valide os nomes de
campo contra UM NVD real de cada linha (NVD 33xx vs iNVD 91xx podem
variar levemente de firmware). Use curl/Postman nos endpoints abaixo
para conferir o formato de resposta antes de confiar no parser.
"""

import re
from datetime import datetime
from typing import Dict, List, Optional, Tuple

import requests
from requests.auth import HTTPDigestAuth


class IntelbrasNVRClient:
    def __init__(self, host: str, username: str, password: str,
                 port: int = 80, timeout: int = 10, use_https: bool = False):
        scheme = "https" if use_https else "http"
        self.base_url = f"{scheme}://{host}:{port}"
        self.auth = HTTPDigestAuth(username, password)
        self.timeout = timeout
        self.session = requests.Session()

    def _get(self, path: str, params: Optional[dict] = None) -> str:
        resp = self.session.get(
            f"{self.base_url}{path}", params=params,
            auth=self.auth, timeout=self.timeout,
        )
        resp.raise_for_status()
        return resp.text

    @staticmethod
    def _parse_kv(text: str) -> Dict[str, str]:
        """Parser genérico do formato `chave=valor` (uma por linha) que
        a API Dahua/Intelbras usa na maioria dos endpoints CGI."""
        result = {}
        for line in text.strip().splitlines():
            if "=" in line:
                k, v = line.split("=", 1)
                result[k.strip()] = v.strip()
        return result

    # ------------------------------------------------------------------
    # Descoberta de canais
    # ------------------------------------------------------------------
    def get_channel_titles(self) -> Dict[int, str]:
        """Retorna {indice_do_canal: nome_do_canal}."""
        text = self._get("/cgi-bin/configManager.cgi",
                          {"action": "getConfig", "name": "ChannelTitle"})
        data = self._parse_kv(text)
        channels: Dict[int, str] = {}
        for k, v in data.items():
            m = re.match(r"table\.ChannelTitle\[(\d+)\]\.Name", k)
            if m:
                channels[int(m.group(1))] = v.strip('"')
        return channels

    def get_device_info(self) -> Dict[str, str]:
        text = self._get("/cgi-bin/magicBox.cgi", {"action": "getDeviceType"})
        return self._parse_kv(text)

    # ------------------------------------------------------------------
    # Busca de gravações (mediaFileFind) - usado tanto para status atual
    # quanto para varredura de gaps nas últimas N horas
    # ------------------------------------------------------------------
    def find_media_files(self, channel: int, start: datetime, end: datetime,
                          file_type: str = "dav") -> List[Tuple[datetime, datetime]]:
        """Retorna lista de segmentos gravados (StartTime, EndTime) do
        canal, ordenados, dentro da janela [start, end]."""
        fmt = "%Y-%m-%d %H:%M:%S"

        # 1. cria objeto de busca
        text = self._get("/cgi-bin/mediaFileFind.cgi", {"action": "factory.create"})
        data = self._parse_kv(text)
        object_id = data.get("result")
        if not object_id:
            raise RuntimeError(f"Falha ao criar objeto mediaFileFind: {text!r}")

        try:
            self._get("/cgi-bin/mediaFileFind.cgi", {
                "action": "findFile",
                "object": object_id,
                "condition.Channel": channel,
                "condition.StartTime": start.strftime(fmt),
                "condition.EndTime": end.strftime(fmt),
                "condition.Types[0]": file_type,
            })

            files: List[Tuple[datetime, datetime]] = []
            while True:
                text = self._get("/cgi-bin/mediaFileFind.cgi", {
                    "action": "findNextFile",
                    "object": object_id,
                    "count": 100,
                })
                data = self._parse_kv(text)
                found = int(data.get("found", "0") or 0)
                if found == 0:
                    break
                for i in range(found):
                    st = data.get(f"items[{i}].StartTime")
                    et = data.get(f"items[{i}].EndTime")
                    if st and et:
                        files.append((
                            datetime.strptime(st, fmt),
                            datetime.strptime(et, fmt),
                        ))
                if found < 100:
                    break
            return sorted(files)
        finally:
            # sempre libera o objeto no NVD, mesmo se algo falhar acima
            try:
                self._get("/cgi-bin/mediaFileFind.cgi",
                          {"action": "destroy", "object": object_id})
            except requests.RequestException:
                pass

    def is_recording_now(self, channel: int, lookback_seconds: int = 90) -> bool:
        """Verifica se existe um segmento de gravação cobrindo o instante
        atual (checa uma pequena janela retroativa, já que o segmento
        'aberto' só é fechado no HD periodicamente)."""
        from datetime import timedelta
        now = datetime.now()
        window_start = now - timedelta(seconds=lookback_seconds)
        segments = self.find_media_files(channel, window_start, now)
        if not segments:
            return False
        last_end = max(et for _, et in segments)
        return (now - last_end).total_seconds() <= lookback_seconds
