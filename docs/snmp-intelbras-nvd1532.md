# SNMP no Intelbras NVD 1532 — Diagnóstico e Limitações

## Contexto

Ao configurar o monitoramento SNMP para um NVR **Intelbras NVD 1532** (worker
`worker/monitors/snmp.ts`), os campos de CPU e Memória nunca retornavam
valores, mesmo com os OIDs padrão do sistema (`lib/snmp-defaults.ts`)
configurados corretamente e a community string certa.

Este documento registra a investigação feita diretamente no dispositivo em
produção e a conclusão: **é uma limitação do firmware do NVR, não um bug do
sistema.**

## Como foi diagnosticado

Testes feitos com `snmpget`/`snmpwalk` a partir do container do worker (mesma
rede/community usada pelo sistema):

```bash
# 1. Confirma que SNMP básico responde (MIB-2, universal)
snmpget -v 2c -c public <IP_DO_NVR> 1.3.6.1.2.1.1.1.0
# → SNMPv2-MIB::sysDescr.0 = STRING: NVD 1532   ✅ funciona

# 2. Uptime (também MIB-2 padrão)
snmpget -v 2c -c public <IP_DO_NVR> 1.3.6.1.2.1.1.3.0
# → DISMAN-EVENT-MIB::sysUpTimeInstance = Timeticks: ...   ✅ funciona

# 3. CPU via HOST-RESOURCES-MIB (OID padrão do sistema)
snmpget -v 2c -c public <IP_DO_NVR> 1.3.6.1.2.1.25.3.3.1.2.1
# → No Such Object available on this agent at this OID   ❌ não implementado

# 4. Memória via HOST-RESOURCES-MIB (OID padrão do sistema)
snmpget -v 2c -c public <IP_DO_NVR> 1.3.6.1.2.1.25.2.3.1.6.65536 1.3.6.1.2.1.25.2.3.1.5.65536
# → No Such Object available on this agent at this OID   ❌ não implementado
```

Um `snmpwalk` completo (`snmpwalk -v 2c -c public <IP_DO_NVR> 1.3.6.1.2.1`)
revelou, via `sysORID`/`sysORDescr`, que esse NVR usa uma **MIB proprietária
customizada** sob o enterprise OID **`1.3.6.1.4.1.1004849`** — não é o
enterprise number genérico da Intelbras (`7597`) documentado em
`lib/snmp-defaults.ts`. O firmware parece ser de uma plataforma OEM
(white-label), com nomes de tabela como `RegularStreamInfoTable`,
`MDStreamInfoTable`, `PhysicalVolumeInfoTable`, etc.

Fazendo o walk dessa árvore específica:

```bash
snmpwalk -v 2c -c public <IP_DO_NVR> 1.3.6.1.4.1.1004849.2.1   # info de sistema
snmpwalk -v 2c -c public <IP_DO_NVR> 1.3.6.1.4.1.1004849.2.10  # storage/canais
```

## O que o NVR realmente expõe via SNMP

| OID | Conteúdo | Tipo de dado |
|---|---|---|
| `1.3.6.1.2.1.1.3.0` | Uptime | ✅ Métrica de monitoramento — **funciona** |
| `1.3.6.1.4.1.1004849.2.1.1.1.0` | Versão de firmware | Informativo (string), não é métrica |
| `1.3.6.1.4.1.1004849.2.1.1.2.0` | Versão de hardware | Informativo |
| `1.3.6.1.4.1.1004849.2.1.2.4.0` | Número de série | Informativo |
| `1.3.6.1.4.1.1004849.2.1.2.6.0` | Modelo (ex: "NVD 1532") | Informativo |
| `1.3.6.1.4.1.1004849.2.1.2.7.0` | Tipo de dispositivo ("NVR") | Informativo |
| `1.3.6.1.4.1.1004849.2.10.2.2.1.2.*` | IP de cada canal/câmera | Inventário, não é métrica de saúde |
| `1.3.6.1.4.1.1004849.2.10.2.2.1.3.*` | Status de conexão por canal ("Connected"/"Empty") | Inventário de canal, não CPU/RAM |
| `1.3.6.1.4.1.1004849.2.10.2.2.1.4.*` | Nome de cada canal | Inventário |

**Não existe nenhum OID de CPU ou uso de memória** nesse firmware — nem no
padrão `HOST-RESOURCES-MIB` (`1.3.6.1.2.1.25.*`), nem na árvore proprietária.
A branch que sugeria isso pelo nome (`sysORDescr.9 = "oidMemoryInfo"`,
correspondente a `1.3.6.1.4.1.1004849.2.1.9`) não responde — o `snmpwalk` trava
em timeout ao tentar alcançá-la, indicando que a entrada no `sysORTable`
existe só como declaração de capacidade, sem implementação real por trás.

## Recomendação para este e outros NVRs do mesmo modelo/OEM

Para dispositivos desse tipo, configurar o **OID customizado** do dispositivo
(campo `snmpCustomOids` em `Device`, editável na aba SNMP do formulário) com
**apenas o Uptime habilitado**, desabilitando os campos de CPU e Memória.
Isso evita que a UI mostre esses campos permanentemente vazios/`N/A`, o que
pode ser confundido com uma falha de monitoramento.

```json
[
  {
    "key": "uptime",
    "label": "Uptime",
    "oid": "1.3.6.1.2.1.1.3.0",
    "divisor": 100,
    "unit": "s",
    "enabled": true
  },
  {
    "key": "cpu",
    "label": "CPU",
    "oid": "1.3.6.1.2.1.25.3.3.1.2.1",
    "unit": "%",
    "enabled": false
  },
  {
    "key": "memory",
    "label": "Memória",
    "oid": "1.3.6.1.2.1.25.2.3.1.6.65536",
    "oidTotal": "1.3.6.1.2.1.25.2.3.1.5.65536",
    "unit": "%",
    "enabled": false
  }
]
```

O monitoramento de disponibilidade/gravação desse NVR continua funcionando
normalmente por outros meios já existentes no sistema — ping (`pingEnabled`)
e o monitor de gravação NVR (`nvrEnabled`, ver `worker/monitors/`) —, que não
dependem de SNMP.

## Ferramentas úteis para diagnosticar outros dispositivos SNMP

```bash
# Entrar no container do worker (onde o net-snmp roda em produção)
docker exec -it <container_do_worker> sh

# Instalar as ferramentas de linha de comando (Alpine)
apk add --no-cache net-snmp-tools

# Testar conectividade básica — se não responder, é rede/community/firewall
snmpget -v 2c -c <community> <IP> 1.3.6.1.2.1.1.1.0

# Descobrir o enterprise OID real do dispositivo via sysORID/sysORDescr
snmpwalk -v 2c -c <community> <IP> 1.3.6.1.2.1.1

# Depois de identificar o enterprise number (ex: 1.3.6.1.4.1.<N>), explorar:
snmpwalk -v 2c -c <community> <IP> 1.3.6.1.4.1.<N>
```

> Nota: em alguns ambientes o `net-snmp` recusa rodar com
> `Unable to open log: Permission denied` quando o usuário do container não
> tem permissão de escrita em log. Use a flag `-Ln` (log para "none") ou rode
> o comando como root (`docker exec -u root ...`).
