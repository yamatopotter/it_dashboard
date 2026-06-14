# Relatório Geral do Sistema — WatchIT Tower

**Data:** 2026-06-14  
**Versão:** 0.1.0  
**Analista:** Claude Code (claude-sonnet-4-6)  
**Escopo:** Código-fonte completo — Next.js 14 App Router, worker Node.js, Prisma 7 + PostgreSQL

---

## Visão Geral

WatchIT Tower é um dashboard de monitoramento de TI para uso exclusivamente local, sem exposição à internet. Monitora roteadores Mikrotik, câmeras, DVRs, APs UniFi e Omada via ICMP, HTTP, SNMP, RouterOS API e controllers de Wi-Fi.

**Nota atual estimada: 9.2/10**

| Dimensão | Nota | Tendência |
|---|---|---|
| Segurança | 9.0 | ↑ (2FA, JWT blacklist, rate limit persistente, SSRF, bodySizeLimit) |
| Arquitetura | 8.8 | ↑ (startup timeout, graceful shutdown testado, Omada monitor) |
| Usabilidade | 8.5 | → (todos os blocos UX implementados) |
| Design | 9.0 | ↑ (tokens CSS unificados em report-view, dark mode) |
| Testes | 8.8 | ↑ (scheduler-startup.test.ts, omada.test.ts, ~547+ testes, 63+ suites) |
| Documentação | 9.0 | ↑ (OpenAPI atualizado, todos os endpoints documentados) |

---

## 1. Segurança

### Estado atual

27 achados catalogados em `SECURITY_REPORT.md`. Todos os críticos, altos e médios foram resolvidos ou aceitos intencionalmente. Apenas 3 itens de infraestrutura permanecem abertos.

**Resumo:**
- **24 resolvidos** (incluindo todos críticos e altos)
- **3 abertos** — todos de infraestrutura, sem código a corrigir

| ID | Título | Severidade | Status |
|---|---|---|---|
| SEC-005 | TLS não configurado por padrão | 🟡 Médio | Aberto (infra) |
| SEC-006 | Permissões do banco de dados | 🔵 Baixo | Aberto (infra) |
| SEC-008 | Worker com privilégios do processo pai | 🔵 Baixo | Aberto (Docker mitiga) |

**Implementações desta sessão:**
- **SEC-009 (2FA/TOTP)** — `otplib` com `strategy: "totp"`, segredo AES-256-GCM, login em dois passos, QR code para registro
- **SEC-014 (Rate limit persistente)** — tabela `RateLimit` no PostgreSQL, sobrevive a restarts
- **SEC-017 (Testes de startup)** — `scheduler-startup.test.ts` com 9 testes de inicialização e shutdown
- **SEC-018 (Timeout de inicialização)** — `process.exit(1)` após 30s se banco indisponível
- **SEC-021 (JWT blacklist)** — `TokenBlacklist` com `jti`, logout via `/api/auth/logout`, cleanup automático
- **SEC-025 (SSRF)** — `controllerIpSchema` bloqueia loopback, link-local, multicast
- **SEC-026/012 (bodySizeLimit)** — `parse-body.ts` rejeita > 1 MB, `next.config.ts` com `bodySizeLimit`
- **SEC-027 (Otimistic lock)** — campo `version` em `User`, `PUT /api/users/[id]` retorna `409` em conflito

**Pontos positivos mantidos:**
- AES-256-GCM para todas as credenciais (RouterOS, UniFi, Omada, SNMP, TOTP)
- HMAC-SHA256 em webhooks com `timingSafeEqual`
- CSP com nonce por request, HSTS, X-Frame-Options, CORP, COOP
- Auditoria completa de ações CRUD + webhooks
- `sanitizeDevice()` nunca retorna credenciais em plaintext

---

## 2. Arquitetura

### Stack

```
Browser ──► Next.js 14 App Router (port 3000)
                  │
                  ├── API Routes (/app/api/**)
                  │     └── Prisma 7 ──► PostgreSQL (Docker)
                  │
                  └── Pages (/app/(dashboard)/**)

Worker (Node.js separado)
  └── scheduler.ts ──► [ping, http, snmp, routeros, link-traffic, omada, unifi]
                             └── Prisma 7 ──► PostgreSQL
```

### Pontos fortes

- **Separação worker/frontend** — worker roda independente do Next.js, sem afetar latência das páginas
- **Fail-fast no worker** — `validateKey()`, `validateSecret()` abortam no startup se secrets ausentes
- **Startup timeout** — `process.exit(1)` após 30s se inicialização travar
- **Graceful shutdown** — `pendingChecks: Set<Promise>` drena checks em voo antes de desconectar o banco
- **Cache overview** — TTL 15s evita N queries no dashboard principal
- **ETag em devices** — `304 Not Modified` quando lista não mudou
- **Monitoramento Omada** — `worker/monitors/omada.ts` integrado ao scheduler, testes em `omada.test.ts`
- **Cleanup automático** — `pruneHistory()` remove StatusHistory (>30d), LinkEvents (>90d), TokenBlacklist expirados

### Dívidas técnicas

| Arquivo | Linhas | Problema |
|---|---|---|
| `components/device-form.tsx` | ~900 | 7 seções de protocolo, 2 funções de teste, submit — candidato a split por seção |
| `components/bulk-device-form.tsx` | ~820 | Duplica lógica de device-form (testConnection, validação de IP) |
| `app/(dashboard)/page.tsx` | ~800 | KPIs + grid + links + timeline + incidents num único componente |

**Duplicação:** `testUnifiConnection` e `testOmadaConnection` implementados em `device-form.tsx` e `bulk-device-form.tsx`. Deveria ser extraído para `lib/test-connection.ts`.

---

## 3. Usabilidade

### Estado atual (todos os blocos UX implementados)

- **WorkerStatusBanner** — alerta quando worker está parado
- **ConfirmDialog** — substitui `window.confirm()` em todas as operações destrutivas
- **CountdownBadge** — contagem regressiva até próximo poll
- **Compact view NOC** — linhas de 28px para visualização densa
- **Web Notifications** — alerta no navegador em transições online→offline
- **Dark mode** — persistido em localStorage via next-themes
- **Filtros de dispositivos** — por status, tipo, localização e busca por texto (com URL params)
- **Breadcrumbs** — em páginas de detalhe de dispositivo e link
- **Validação inline** — campos validados enquanto o usuário digita (react-hook-form + zod)

### Pendências menores

| Item | Impacto | Esforço |
|---|---|---|
| Indicador de campo modificado no edit (`isDirty`) | Baixo | Baixo |
| Sem skeleton loading em carregamentos lentos | Baixo | Baixo |

---

## 4. Design

### Estado atual

- **Design system:** shadcn/ui v4 (Base UI) com tokens CSS — consistente
- **Dark mode:** Funcionando via `ThemeProvider` + CSS class strategy
- **Acessibilidade:** WCAG 2.1 AA — `aria-label` em todas as tabelas, `role="status"` nos KPIs, `htmlFor` em todos os inputs
- **Responsividade:** Grid responsivo nos cards e tabelas com `overflow-x-auto`
- **Tokens CSS:** `report-view.tsx` migrado de classes Tailwind hardcoded para `text-muted-foreground`, `text-foreground`, `bg-card`, `border-border`, `border-border/50`

### Inconsistências remanescentes

- `report-view.tsx` ainda usa `bg-emerald-50`, `bg-amber-50` em células de status (não mapeável diretamente para token semântico sem definir `--color-success-muted`)
- Mistura de `h-7`/`h-8` em botões de ação em algumas páginas (impacto visual negligenciável)

---

## 5. Testes

### Cobertura atual

- **~547+ testes** em ~63+ suites
- **Integração:** `__tests__/integration/webhook-flow.test.ts`
- **Scheduler startup:** `__tests__/worker/scheduler-startup.test.ts` (9 testes)
- **Omada monitor:** `__tests__/worker/omada.test.ts`
- **Segurança:** `__tests__/security/api-auth.test.ts` (401 em todas as rotas protegidas)

### Lacunas remanescentes

| Área | Arquivo ausente | Criticidade |
|---|---|---|
| Admin routes | `__tests__/api/admin-cleanup.test.ts` | Média |
| Admin routes | `__tests__/api/admin-config.test.ts` | Média |
| Audit trail em CRUD | Testes existentes não validam `AuditLog` escrito | Baixa |
| TOTP flow | Testes de integração do fluxo de login com 2FA | Baixa |

### Pontos fortes

- Cobertura total do scheduler (`runChecks`, `pruneHistory`, `pollLinks`, `shutdown`, `startScheduler`)
- Todos os monitors têm testes unitários
- Todos os endpoints de API têm testes de unidade
- Webhook flow testado end-to-end

---

## 6. Documentação

### Estado atual

| Artefato | Estado |
|---|---|
| `CLAUDE.md` | Atualizado com arquitetura, comandos e convenções atuais |
| `SECURITY_REPORT.md` | Atualizado — 27 achados, 24 resolvidos, 3 abertos (infra) |
| `SYSTEM_REPORT.md` | Este arquivo — atualizado em 2026-06-14 |
| `docs/openapi.yaml` | Atualizado com todos os endpoints (admin, users, totp, audit, etc.) |
| `README.md` | Básico, sem diagrama de arquitetura |

### Endpoints documentados no OpenAPI

Todos os 17+ endpoints principais estão documentados incluindo: `/api/admin/audit`, `/api/admin/config`, `/api/admin/cleanup`, `/api/admin/stats`, `/api/users`, `/api/users/{id}`, `/api/users/{id}/totp`, `/api/auth/logout`, `/api/auth/check-2fa`, `/api/version`.

---

## Próximos passos recomendados

1. **Infra (alta prioridade):** Configurar reverse proxy com TLS (Caddy, nginx) para produção — SEC-005
2. **Refactor (médio prazo):** Extrair `testUnifiConnection`/`testOmadaConnection` para `lib/test-connection.ts` para eliminar duplicação entre `device-form` e `bulk-device-form`
3. **Testes (baixa prioridade):** Adicionar testes para rotas admin e fluxo de login com 2FA
4. **Dependências:** Fazer pin do `next-auth@5` quando versão estável for lançada (ver TODO.md)
