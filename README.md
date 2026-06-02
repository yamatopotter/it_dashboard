# IT Dashboard

Dashboard local para monitoramento de equipamentos de TI — Mikrotiks, DVRs, câmeras e outros dispositivos de rede. Roda 100% na rede interna, sem dependências de nuvem.

## Stack

| Camada | Tecnologia |
|---|---|
| Frontend + API | Next.js 16 (App Router) |
| UI | shadcn/ui v4 (Base UI) + Tailwind CSS v4 |
| Banco de dados | PostgreSQL 16 via Docker |
| ORM | Prisma 7 |
| Autenticação | NextAuth.js v5 (JWT, sem sessão no banco) |
| Worker de monitoramento | Node.js separado (`worker/`) via `tsx` |
| Testes | Jest 30 + Testing Library |

## Pré-requisitos

- Node.js 20+
- Docker e Docker Compose
- `npm`

---

## Desenvolvimento

### 1. Configurar variáveis de ambiente

Crie um arquivo `.env` na raiz (ou copie o exemplo abaixo):

```env
# Banco de dados PostgreSQL
DATABASE_URL="postgresql://it_dashboard:it_dashboard@localhost:5432/it_dashboard"

# NextAuth — gerar secret seguro: openssl rand -base64 32
NEXTAUTH_SECRET="change-me-in-production"
NEXTAUTH_URL="http://localhost:3000"
```

### 2. Subir o banco de dados

```bash
docker compose up -d
```

Isso inicia um container PostgreSQL 16 na porta `5432`. Os dados são persistidos no volume Docker `postgres_data`.

### 3. Aplicar migrations e criar tabelas

```bash
npm run db:migrate
```

### 4. Criar o usuário administrador

```bash
npm run create-user
```

O script pedirá nome de usuário e senha interativamente.

### 5. Rodar o projeto

```bash
# Next.js + worker de monitoramento em paralelo (recomendado)
npm run dev:all

# Apenas o Next.js
npm run dev

# Apenas o worker de monitoramento
npm run worker
```

Acesse [http://localhost:3000](http://localhost:3000) e faça login.

### Opcional: Popular notas de segurança iniciais

```bash
npm run seed:security
```

Cria 12 findings de segurança pré-definidos na aba **Notas & Segurança**.

---

## Produção

### 1. Configurar variáveis de ambiente

Em produção, configure as variáveis de ambiente no servidor (não use o `.env` com valores de desenvolvimento):

```env
DATABASE_URL="postgresql://usuario:senha@host:5432/it_dashboard"
NEXTAUTH_SECRET="<string aleatória segura — openssl rand -base64 32>"
NEXTAUTH_URL="http://<ip-ou-hostname-do-servidor>:3000"
```

### 2. Subir o banco de dados

```bash
docker compose up -d
npm run db:migrate
```

### 3. Build da aplicação

```bash
npm run build
```

### 4. Criar usuário administrador

```bash
npm run create-user
```

### 5. Iniciar em produção

```bash
# Next.js (build) + worker em paralelo
npm run start:all
```

Para manter o processo rodando após fechar o terminal, use um process manager como `pm2`:

```bash
npm install -g pm2
pm2 start "npm run start:all" --name it_dashboard
pm2 save
pm2 startup   # configura para iniciar com o sistema
```

---

## Protocolos de monitoramento

| Protocolo | Dispositivos | O que monitora |
|---|---|---|
| **ICMP Ping** | Todos | Latência (ms), online/offline |
| **HTTP** | DVRs, câmeras, qualquer dispositivo web | Status HTTP da interface |
| **SNMP v2c** | Switches, roteadores genéricos | CPU%, memória%, uptime |
| **RouterOS API** | Mikrotiks | CPU%, memória%, uptime, interfaces |

Cada dispositivo pode ter um ou mais protocolos habilitados simultaneamente. O worker executa todos em paralelo (`Promise.allSettled`) a cada `checkInterval` segundos (padrão: 60s).

---

## Banco de dados

### Comandos úteis

```bash
npm run db:migrate       # Aplicar migrations pendentes
npm run db:studio        # Abrir Prisma Studio (GUI) em http://localhost:5555
npm run db:generate      # Regenerar cliente Prisma após editar schema.prisma
```

### Backup

```bash
docker exec it_dashboard_db pg_dump -U it_dashboard it_dashboard > backup_$(date +%Y%m%d).sql
```

### Restaurar backup

```bash
docker exec -i it_dashboard_db psql -U it_dashboard it_dashboard < backup.sql
```

---

## Testes

```bash
npm test                  # Todos os testes (85 testes)
npm run test:watch        # Modo watch
npm run test:coverage     # Com relatório de cobertura
```

Os testes cobrem:

- **`__tests__/lib/`** — utilitários de formatação
- **`__tests__/api/`** — rotas de API (devices, status, notes)
- **`__tests__/worker/`** — monitores ping, HTTP, SNMP, RouterOS
- **`__tests__/components/`** — componentes React
- **`__tests__/security/`** — enforcement de autenticação em todas as rotas

---

## Estrutura do projeto

```
app/
  (auth)/login/           # Página de login (pública)
  (dashboard)/            # Área protegida
    page.tsx              # Overview — grid com todos os dispositivos
    devices/              # Lista, detalhes, criar, editar dispositivos
    notes/                # Notas de segurança e acompanhamento de issues
  api/
    auth/[...nextauth]/   # Handler NextAuth
    devices/              # CRUD de dispositivos
    status/[deviceId]/    # Histórico de status (query: ?hours=24)
    notes/                # CRUD de notas

worker/
  index.ts                # Entry point
  scheduler.ts            # Agenda setInterval por dispositivo
  monitors/               # ping, http, snmp, routeros

lib/
  db.ts                   # Singleton do Prisma client
  auth.ts                 # Configuração do NextAuth
  format.ts               # formatUptime, formatResponseTime, formatPercent

components/
  device-card.tsx         # Card de status no overview
  device-form.tsx         # Formulário compartilhado criar/editar
  metrics-chart.tsx       # Gráfico Recharts de métricas
  sidebar.tsx             # Navegação lateral

prisma/
  schema.prisma           # Schema do banco
  migrations/             # Histórico de migrations PostgreSQL

scripts/
  create-user.ts          # Criar/atualizar usuário admin
  seed-security-notes.ts  # Popular findings de segurança iniciais
```

---

## Segurança

O projeto inclui um relatório de segurança completo em [SECURITY_REPORT.md](SECURITY_REPORT.md) com 12 findings identificados e ações de mitigação. As mais críticas:

- **NEXTAUTH_SECRET** deve ser uma string aleatória longa em produção (`openssl rand -base64 32`)
- Credenciais RouterOS/SNMP ficam na base de dados — garanta que o acesso ao PostgreSQL seja restrito
- Considere adicionar rate limiting na rota `/api/auth/callback/credentials` para mitigar força bruta

---

## Adicionar um novo protocolo de monitoramento

1. Crie `worker/monitors/seuprotocolo.ts` retornando uma interface tipada
2. Importe e chame em `worker/scheduler.ts` dentro de `runChecks()` via `Promise.allSettled`
3. Mapeie o resultado para o upsert em `DeviceStatus` e insert em `StatusHistory`
4. Adicione campos de enable/config em `prisma/schema.prisma`, rode `npm run db:migrate && npm run db:generate`
5. Exponha os campos no formulário em `components/device-form.tsx`
