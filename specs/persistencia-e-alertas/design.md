# Design: Monitoramento de Gravação NVR + Alertas (integrado ao WatchIT Tower)

## Visão geral

O NVD vira um `Device` (`type = DVR`) monitorado pelo `worker/` Node como
qualquer outro protocolo, com um monitor novo (`worker/monitors/nvr.ts`)
rodando numa cadência própria e ajustável (diferente do `checkInterval`
normal do device). O e-mail é uma capacidade nova e genérica do sistema
(`SystemConfig`), não atrelada a um provedor específico. Câmeras já
cadastradas podem se vincular a um canal do NVD.

## Schema (Prisma)

**`SystemConfig`** — bloco de e-mail (SSL ou TLS, qualquer provedor):
```prisma
smtpEnabled      Boolean @default(false)
smtpHost         String?
smtpPort         Int     @default(587)
smtpSecure       Boolean @default(false) // true = TLS implícito (465), false = STARTTLS (587)
smtpUser         String?
smtpPasswordEnc  String? // AES-256-GCM, mesmo padrão de lib/crypto.ts
smtpFrom         String?
alertEmailTo     String? // destinatário(s), separado por vírgula
```

**`Device`** — dois blocos independentes:
```prisma
// monitor NVR (type = DVR)
nvrEnabled              Boolean @default(false)
nvrUserEnc              String?
nvrPassEnc              String?
nvrPort                 Int     @default(80)
nvrUseHttps             Boolean @default(false)
nvrMaxGapMinutes        Int     @default(5)
nvrHoursWindow          Int     @default(24)
nvrCheckIntervalMinutes Int     @default(1440) // 1x/dia; ajustável se sobrecarregar o NVD

// vínculo canal↔câmera (type = CAMERA), self-relation
parentNvrId      String?
parentNvrChannel Int?
parentNvr        Device?  @relation("DeviceNvrChannel", fields: [parentNvrId], references: [id], onDelete: SetNull)
nvrChannels      Device[] @relation("DeviceNvrChannel")
@@index([parentNvrId])
```

**`DeviceStatus`** — saúde de disco/espaço (mesmo padrão de `unifiData`/`unifiError`):
```prisma
nvrDiskData  Json?
nvrDiskError String?
```

**Novo model `NvrChannelIssue`**:
```prisma
model NvrChannelIssue {
  id          String    @id @default(cuid())
  deviceId    String
  device      Device    @relation(fields: [deviceId], references: [id], onDelete: Cascade)
  channel     Int
  channelName String
  issueType   String    // "no_recordings" | "gap" | "not_recording_now" | "unreachable"
  detail      String
  gapMinutes  Float?
  periodStart DateTime?
  periodEnd   DateTime?
  detectedAt  DateTime  @default(now())
  lastSeenAt  DateTime  @default(now())
  resolvedAt  DateTime?
  alertedAt   DateTime?
  createdAt   DateTime  @default(now())

  @@index([deviceId, channel, detectedAt])
}
```
Índice único parcial, adicionado manualmente na migration (Prisma não
representa índice parcial):
```sql
CREATE UNIQUE INDEX ux_nvr_channel_issues_open
    ON "NvrChannelIssue" ("deviceId", "channel", "issueType")
    WHERE "resolvedAt" IS NULL;
```
Por quê: `gap` nasce com `resolvedAt` já preenchido (evento pontual — só é
relatado depois que a gravação já retomou), enquanto
`no_recordings`/`not_recording_now`/`unreachable` são upsertados como
estado em aberto. Assim múltiplos gaps do mesmo canal no mesmo ciclo não
colidem com o índice, e ainda garantimos no máximo uma linha aberta por
canal+tipo em andamento.

## Fluxo de execução (`runNvrChecks(device)` em `worker/scheduler.ts`)

1. Resolve credenciais (`resolveNvrCredentials(device)`).
2. `validateRecording()` (porta TS de `check_channel`/`validate_nvr` do
   `recording_validator.py`) → lista de issues por canal.
3. `checkDiskHealth()` → grava em `DeviceStatus.nvrDiskData`/`nvrDiskError`.
4. Para cada issue:
   - `gap` → `INSERT` simples com `resolvedAt = now()`.
   - `no_recordings`/`not_recording_now`/`unreachable` → `UPSERT` por
     `(deviceId, channel, issueType)` no índice parcial, `RETURNING id,
     alertedAt`.
5. Para `issueType` em `("not_recording_now", "no_recordings")`: se
   `alertedAt` for nulo ou tiver mais de 2h, chama `sendEmail()`
   (`lib/email.ts`) e atualiza `alertedAt = now()`.
6. Fecha histórico: para o device, qualquer linha aberta cujo
   `(channel, issueType)` não apareceu neste run → `resolvedAt = now()`.
7. Tudo isolado em try/catch por device — falha num NVD não afeta os
   outros nem o resto do worker.

## Cadência

Cada device `DVR` com `nvrEnabled` ganha um **segundo** `setInterval` em
`scheduleDevice()` (tamanho `nvrCheckIntervalMinutes * 60_000`),
independente do `checkInterval` normal (que continua rodando ping/http/snmp/
routeros na cadência de sempre). Precedente parcial: `pollLinks()` já roda
num loop próprio fora do `checkInterval`, mas com intervalo fixo global;
aqui o intervalo é configurável por device.

## E-mail (`lib/email.ts`)

`sendEmail({ to, subject, text })` usa `nodemailer` (primeira dependência
de e-mail do projeto), lendo host/porta/secure/usuário/senha (decriptada
via `resolveSmtpPassword()`) de `SystemConfig`. Se `smtpEnabled = false` ou
faltar host/usuário, loga aviso e não lança (feature opcional). Falha real
de envio propaga para o chamador não marcar `alertedAt` — tenta de novo no
próximo ciclo.

## Vínculo câmera → canal

Mesma ideia de `Link.mikrotikDeviceId`/`mikrotikInterface`, mas Device→Device
(self-relation `DeviceNvrChannel`): uma câmera (`type = CAMERA`) grava
`parentNvrId` + `parentNvrChannel`. A tela de detalhe do NVD junta
`NvrChannelIssue` (canal) com o `DeviceStatus.isOnline` da câmera vinculada
(se existir) — é só uma junção de exibição, não altera a lógica de
alerta/dedup do canal.

## Ferramenta manual (`scripts/nvd/`)

`recording_validator.py`/`intelbras_nvr_client.py` continuam existindo,
mas só como CLI de diagnóstico — úteis para validar nomes de campo da API
Dahua/Intelbras contra um NVD real antes de confiar no monitor TS (o
próprio client já alertava sobre variação entre firmwares). Não fazem
parte do pipeline automatizado.
