/**
 * Diagnostico Omada - analisa configuracao Wi-Fi para problemas de ping/latencia
 * ATENCAO: remover credenciais antes de commitar este arquivo.
 *
 * Uso: npx tsx scripts/omada-diagnostic.ts
 */

import https from "node:https";

// Config — preencha antes de rodar (não commitar com valores reais)
const HOST = "192.168.0.1";    // IP do controller Omada
const PORT = 443;
const OID  = "YOUR_OMADA_CID"; // omadacId (hash na URL do controller)
const CRED = {
  clientId:     "YOUR_CLIENT_ID",
  clientSecret: "YOUR_CLIENT_SECRET",
};
const SITE_NAME = "Default";   // nome do site Omada
const LOCAL_NAME = "Local";    // label para o relatorio

// HTTP helper - mesmo padrao do worker/monitors/omada.ts
function rawRequest(
  host: string,
  port: number,
  path: string,
  method: "GET" | "POST",
  body: unknown | null,
  headers: Record<string, string>,
): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const bodyStr = body != null ? JSON.stringify(body) : undefined;
    const allHeaders: Record<string, string> = { Accept: "application/json", ...headers };
    if (bodyStr) {
      allHeaders["Content-Type"] = "application/json";
      allHeaders["Content-Length"] = String(Buffer.byteLength(bodyStr));
    }
    const req = https.request(
      { hostname: host, port, path, method, headers: allHeaders, rejectUnauthorized: false },
      (res) => {
        let raw = "";
        res.on("data", (c: string) => { raw += c; });
        res.on("end", () => {
          try { resolve({ status: res.statusCode ?? 0, body: JSON.parse(raw) }); }
          catch { resolve({ status: res.statusCode ?? 0, body: null }); }
        });
      },
    );
    req.on("error", reject);
    req.setTimeout(10_000, () => req.destroy(new Error("Timeout")));
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

// Omada API
let accessToken = "";

function omadaGet(path: string): Promise<{ status: number; body: any }> {
  return rawRequest(HOST, PORT, path, "GET", null, {
    Authorization: `AccessToken=${accessToken}`,
  });
}

async function omadaApi(path: string): Promise<any> {
  const r = await omadaGet(path);
  if (r.body?.errorCode !== 0) {
    throw new Error(`API [${path}]: errorCode=${r.body?.errorCode} - ${r.body?.msg ?? r.status}`);
  }
  return r.body.result;
}

async function omadaPaged(path: string, pageSize = 200): Promise<any[]> {
  const sep = path.includes("?") ? "&" : "?";
  const all: any[] = [];
  let page = 1;
  for (;;) {
    const result = await omadaApi(`${path}${sep}page=${page}&pageSize=${pageSize}`);
    const items: any[] = result?.data ?? (Array.isArray(result) ? result : []);
    all.push(...items);
    if (items.length < pageSize) break;
    page++;
  }
  return all;
}

async function authenticate(): Promise<void> {
  // Mesmo formato exato do worker/monitors/omada.ts:
  // grant_type na query string, credenciais no body JSON
  const r = await rawRequest(
    HOST, PORT,
    "/openapi/authorize/token?grant_type=client_credentials",
    "POST",
    { omadacId: OID, client_id: CRED.clientId, client_secret: CRED.clientSecret },
    {},
  );
  const b = r.body as any;
  if (r.status !== 200 || b?.errorCode !== 0 || !b?.result?.accessToken) {
    const code = b?.errorCode ?? r.status;
    if (code === -44106 || code === -44116)
      throw new Error("client_id ou client_secret invalidos (verifique se o cliente API esta ativo no controller)");
    throw new Error(`Autenticacao falhou (codigo ${code}): ${b?.msg ?? "sem mensagem"}\n${JSON.stringify(b, null, 2)}`);
  }
  accessToken = b.result.accessToken;
}

// Helpers de apresentacao
const RADIO_BAND: Record<number, string> = { 0: "2.4 GHz", 1: "5 GHz", 2: "6 GHz" };
const CHAN_WIDTH: Record<number, string> = {
  0: "20 MHz", 1: "40 MHz", 2: "80 MHz", 3: "160 MHz", 4: "80+80 MHz",
};

interface Finding {
  sev: "ALTO" | "MEDIO" | "INFO";
  msg: string;
}
const findings: Finding[] = [];
const find = (sev: Finding["sev"], msg: string) => findings.push({ sev, msg });

function sec(title: string) {
  console.log("\n" + "-".repeat(70));
  console.log(`  ${title}`);
  console.log("-".repeat(70));
}

function rssiLabel(v: number): string {
  if (v >= -60) return "Excelente";
  if (v >= -70) return "Bom";
  if (v >= -80) return "Regular";
  return "Fraco";
}

function isAP(d: any): boolean {
  const t = String(d.type ?? d.deviceType ?? "").toUpperCase();
  return t === "AP" || t === "EAP" || t === "4";
}

// Main
async function main() {
  console.log("\n" + "=".repeat(70));
  console.log(`  DIAGNOSTICO OMADA - ${LOCAL_NAME} / ${SITE_NAME}`);
  console.log("=".repeat(70));

  // 1. Auth
  process.stdout.write("\n[1/5] Autenticando...                    ");
  await authenticate();
  console.log("OK");

  // 2. Localizar site
  process.stdout.write("[2/5] Localizando site...                ");
  const sites = await omadaPaged(`/openapi/v1/${OID}/sites`);
  const site = sites.find((s) => s.name?.toLowerCase() === SITE_NAME.toLowerCase())
    ?? (sites.length === 1 ? sites[0] : undefined);
  if (!site) {
    throw new Error(
      `Site "${SITE_NAME}" nao encontrado.\nSites disponiveis: ${sites.map((s) => s.name).join(", ")}`
    );
  }
  const siteId: string = site.siteId ?? site.id;
  console.log(`OK  (siteId: ${siteId}, nome: "${site.name}")`);

  // 3. Dispositivos / APs
  process.stdout.write("[3/5] Carregando dispositivos...         ");
  const devices = await omadaPaged(`/openapi/v1/${OID}/sites/${siteId}/devices`);
  const aps = devices.filter(isAP);
  if (aps.length === 0 && devices.length > 0) {
    // fallback: trata tudo como AP se nao conseguir filtrar
    aps.push(...devices);
  }
  console.log(`OK  (${devices.length} dispositivo(s), ${aps.length} AP(s))`);

  // 4. Clientes ativos
  process.stdout.write("[4/5] Carregando clientes Wi-Fi...       ");
  const clients = await omadaPaged(
    `/openapi/v1/${OID}/sites/${siteId}/clients?clientType=0`
  );
  console.log(`OK  (${clients.length} cliente(s))`);

  // 5. Config WLAN / SSID
  process.stdout.write("[5/5] Carregando configuracao WLAN...    ");
  const ssids: any[] = [];
  let wlanError = "";
  try {
    const wlans = await omadaPaged(`/openapi/v1/${OID}/sites/${siteId}/setting/wlans`);
    for (const wlan of wlans) {
      const wlanId = wlan.wlanId ?? wlan.id;
      const list = await omadaPaged(
        `/openapi/v1/${OID}/sites/${siteId}/setting/wlans/${wlanId}/ssids`
      );
      list.forEach((s) => ssids.push({ ...s, _wlanName: wlan.name }));
    }
    console.log(`OK  (${ssids.length} SSID(s))`);
  } catch (e) {
    wlanError = (e as Error).message;
    console.log(`PARCIAL (${wlanError})`);
  }

  // RELATORIO

  // ACCESS POINTS
  sec("ACCESS POINTS");
  if (aps.length === 0) {
    console.log("  Nenhum AP encontrado.");
    console.log(`  Tipos retornados: ${[...new Set(devices.map((d) => d.type ?? d.deviceType ?? "?"))].join(", ")}`);
  } else {
    for (const ap of aps) {
      const apClients = clients.filter(
        (c) => c.apMac === ap.mac || c.connectDeviceMac === ap.mac
      );
      console.log(`\n  > ${ap.name ?? ap.mac}  (${ap.mac ?? "sem MAC"})`);
      console.log(`    Modelo: ${ap.model ?? ap.modelName ?? "N/A"}  |  FW: ${ap.firmwareVersion ?? ap.version ?? "N/A"}`);
      console.log(`    Status: ${ap.status ?? "N/A"}  |  Clientes: ${apClients.length}`);

      const radios: any[] =
        ap.radioSetting ?? ap.radioSettings ?? ap.radios ?? [];

      if (radios.length === 0 && (ap.channel2g != null || ap.channel5g != null)) {
        if (ap.channel2g != null) {
          const w = CHAN_WIDTH[ap.channelWidth2g] ?? ap.channelWidth2g ?? "N/A";
          console.log(`    2.4 GHz: Ch ${ap.channel2g}  |  ${w}  |  TX ${ap.txPower2g ?? "auto"} dBm`);
          if ((ap.channelWidth2g ?? 0) >= 2)
            find("ALTO", `AP "${ap.name}" 2.4 GHz com canal ${w} - use 20 MHz para IoT/cameras`);
        }
        if (ap.channel5g != null) {
          const w = CHAN_WIDTH[ap.channelWidth5g] ?? ap.channelWidth5g ?? "N/A";
          console.log(`    5 GHz:   Ch ${ap.channel5g}  |  ${w}  |  TX ${ap.txPower5g ?? "auto"} dBm`);
        }
      } else {
        for (const r of radios) {
          const band = RADIO_BAND[r.radioId] ?? `Radio ${r.radioId}`;
          const width = CHAN_WIDTH[r.channelWidth ?? r.bandwidth] ?? (r.channelWidth ?? "N/A");
          const ch = r.channel ?? r.currentChannel ?? "auto";
          const tx = r.txPower ?? r.power ?? "auto";
          console.log(`    ${band}: Ch ${ch}  |  ${width}  |  TX ${tx} dBm`);
          if ((r.channelWidth ?? r.bandwidth ?? 0) >= 2 && r.radioId === 0)
            find("ALTO", `AP "${ap.name}" 2.4 GHz com ${width} - cameras/IoT precisam de 20 MHz`);
          if ((r.txPower ?? r.power ?? 0) > 24)
            find("MEDIO", `AP "${ap.name}" ${band} TX ${tx} dBm - potencia alta gera interferencia near-far`);
        }
      }
    }
  }

  // CLIENTES
  sec("CLIENTES WI-FI ATIVOS");
  if (clients.length === 0) {
    console.log("  Nenhum cliente ativo.");
  } else {
    const sorted = [...clients].sort(
      (a, b) => (a.rssi ?? a.signalLevel ?? a.signal ?? -100) - (b.rssi ?? b.signalLevel ?? b.signal ?? -100)
    );
    for (const c of sorted) {
      const rssi     = c.rssi ?? c.signalLevel ?? c.signal ?? null;
      const snr      = c.snr ?? null;
      const band     = c.radioId != null ? (RADIO_BAND[c.radioId] ?? `Radio ${c.radioId}`) : "N/A";
      const txRetry  = c.txRetryRate != null ? `${Number(c.txRetryRate).toFixed(1)}%` : "N/A";
      const rxRetry  = c.rxRetryRate != null ? `${Number(c.rxRetryRate).toFixed(1)}%` : "N/A";
      const txRateMb = c.txRate != null ? (c.txRate > 10000 ? (c.txRate / 1_000_000).toFixed(0) : c.txRate) : "N/A";
      const rxRateMb = c.rxRate != null ? (c.rxRate > 10000 ? (c.rxRate / 1_000_000).toFixed(0) : c.rxRate) : "N/A";

      console.log(`\n  > ${c.hostName ?? c.name ?? c.mac}  (${c.ip ?? "sem IP"})`);
      console.log(`    MAC: ${c.mac}  |  SSID: ${c.ssid ?? "N/A"}  |  AP: ${c.connectDeviceName ?? c.apMac ?? "N/A"}`);
      console.log(`    Banda: ${band}  |  Canal: ${c.channel ?? "N/A"}  |  Modo Wi-Fi: ${c.wifiMode != null ? `Wi-Fi ${c.wifiMode}` : "N/A"}`);
      console.log(`    RSSI: ${rssi ?? "N/A"} dBm${rssi != null ? ` (${rssiLabel(rssi)})` : ""}  |  SNR: ${snr ?? "N/A"} dB`);
      console.log(`    TX: ${txRateMb} Mbps  |  RX: ${rxRateMb} Mbps`);
      console.log(`    Retry TX: ${txRetry}  |  Retry RX: ${rxRetry}`);

      const goodSignal = rssi != null && rssi >= -65;
      const goodSnr    = snr  != null && snr  >= 20;
      const retryTx    = c.txRetryRate ?? 0;
      const retryRx    = c.rxRetryRate ?? 0;

      if (goodSignal && goodSnr && (retryTx > 10 || retryRx > 10)) {
        find("ALTO",
          `"${c.hostName ?? c.mac}": sinal bom (${rssi} dBm / SNR ${snr} dB) mas retry alto ` +
          `(TX ${txRetry} / RX ${rxRetry}) -> canal congestionado ou colisao`);
      }
      if (goodSignal && goodSnr && c.radioId === 0 && Number(txRateMb) < 24) {
        find("MEDIO",
          `"${c.hostName ?? c.mac}": sinal bom mas taxa baixa (${txRateMb} Mbps) -> ` +
          `modo legado 802.11b/g ou protecao CTS/RTS ativa`);
      }
      if (rssi != null && rssi < -75)
        find("MEDIO", `"${c.hostName ?? c.mac}": RSSI fraco (${rssi} dBm) - verificar posicionamento do AP`);
      if (snr != null && snr < 15)
        find("ALTO", `"${c.hostName ?? c.mac}": SNR muito baixo (${snr} dB) - forte interferencia no canal`);
    }
  }

  // SSID
  sec("CONFIGURACAO SSID / WLAN");
  if (ssids.length === 0) {
    if (wlanError) console.log(`  Nao foi possivel carregar: ${wlanError}`);
    else console.log("  Nenhum SSID retornado.");
  } else {
    for (const ssid of ssids) {
      const dtim   = ssid.dtimPeriod ?? ssid.dtim ?? null;
      const beacon = ssid.beaconInterval ?? 100;
      console.log(`\n  > "${ssid.name}"  (WLAN: ${ssid._wlanName ?? "N/A"})`);
      console.log(`    DTIM: ${dtim ?? "N/A"}  |  Beacon: ${beacon} ms` +
        (dtim ? `  -> intervalo max de sono: ${dtim * beacon} ms` : ""));
      console.log(`    Fast Roaming (802.11r): ${ssid.enable11r ?? ssid.fastRoaming ? "SIM" : "NAO"}`);
      console.log(`    Band Steering:          ${ssid.bandSteering ? "SIM" : "NAO"}`);
      console.log(`    Airtime Fairness:       ${ssid.airTimeOptimize ?? ssid.airtimeFairness ? "SIM" : "NAO"}`);
      console.log(`    Multicast Enhance:      ${ssid.multicastEnhance ? "SIM" : "NAO"}`);
      console.log(`    802.11b desabilitado:   ${ssid.disable11b != null ? (ssid.disable11b ? "SIM" : "NAO") : "N/A"}`);

      if (dtim != null) {
        if (dtim > 3)
          find("ALTO",
            `SSID "${ssid.name}": DTIM ${dtim} -> sono max ${dtim * beacon} ms - ` +
            `causa direta de ping alto em cameras/IoT; reduza para 1`);
        else if (dtim === 3)
          find("MEDIO", `SSID "${ssid.name}": DTIM 3 (${dtim * beacon} ms) - reduza para 1 para eliminar latencia de sono`);
      }
      if (ssid.airTimeOptimize ?? ssid.airtimeFairness)
        find("MEDIO",
          `SSID "${ssid.name}": Airtime Fairness ativo - penaliza clientes rapidos, ` +
          `aumenta latencia geral em ambientes com cameras HD`);
      if (ssid.bandSteering)
        find("INFO",
          `SSID "${ssid.name}": Band Steering ativo - cameras podem ser empurradas ao 5 GHz ` +
          `e perder sinal, causando reconexoes e picos de latencia`);
      if (ssid.disable11b === false)
        find("MEDIO",
          `SSID "${ssid.name}": modo 802.11b ativo - clientes legados ativam protecao CTS/RTS ` +
          `e aumentam latencia de todos os dispositivos`);
    }
  }

  // DIAGNOSTICO FINAL
  sec("DIAGNOSTICO - CAUSAS PROVAVEIS DO PING ALTO");

  const alto  = findings.filter((f) => f.sev === "ALTO");
  const medio = findings.filter((f) => f.sev === "MEDIO");
  const info  = findings.filter((f) => f.sev === "INFO");

  if (alto.length + medio.length + info.length === 0) {
    console.log("\n  Nenhum problema detectado nos parametros analisados.");
    console.log("  Investigar: interferencia externa, driver da camera, STP/RSTP em switches,");
    console.log("  QoS/shaping upstream, ou problema de ARP/DHCP.");
  } else {
    if (alto.length)  { console.log(""); alto.forEach((f)  => console.log(`  [ALTO]  ${f.msg}`)); }
    if (medio.length) { console.log(""); medio.forEach((f) => console.log(`  [MEDIO] ${f.msg}`)); }
    if (info.length)  { console.log(""); info.forEach((f)  => console.log(`  [INFO]  ${f.msg}`)); }
  }

  console.log("\n" + "=".repeat(70) + "\n");
}

main().catch((err) => {
  console.error("\n[ERRO FATAL]", err.message);
  process.exit(1);
});
