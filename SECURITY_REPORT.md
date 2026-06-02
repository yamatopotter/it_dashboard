# Relatório de Segurança — IT Dashboard

**Data da análise:** 2026-06-02  
**Versão do sistema:** 0.1.0  
**Analista:** Análise automatizada via Claude Code  
**Escopo:** Código-fonte completo — Next.js (frontend/API), worker de monitoramento, banco de dados SQLite

---

## Sumário Executivo

O IT Dashboard é uma aplicação interna para monitoramento de equipamentos de rede. Por ser voltado para uso local e não ser exposto à internet, o risco geral é **moderado**, mas existem vulnerabilidades que devem ser endereçadas antes de qualquer exposição externa ou em ambientes com múltiplos usuários.

| Severidade | Quantidade | Status |
|-----------|-----------|--------|
| 🔴 Crítico  | 1 | Aberto |
| 🟠 Alto     | 2 | Aberto |
| 🟡 Médio    | 3 | Aberto |
| 🔵 Baixo    | 3 | Aberto |
| ℹ️ Info     | 3 | Aberto |
| **Total**  | **12** | |

---

## Achados Detalhados

---

### SEC-001 — Secret JWT com fallback hardcoded
**Severidade:** 🔴 CRÍTICO  
**Categoria:** Autenticação  
**Arquivo:** `lib/auth.ts:20`

```typescript
secret: process.env.NEXTAUTH_SECRET ?? "dev-secret",
```

**Descrição:**  
Se a variável de ambiente `NEXTAUTH_SECRET` não estiver definida, o sistema usa `"dev-secret"` como chave de assinatura dos tokens JWT. Este valor é público (está no repositório), o que permite que qualquer pessoa forje tokens de sessão válidos sem conhecer a senha de nenhum usuário.

**Impacto:** Controle total do sistema sem autenticação válida.

**Mitigação:**
```typescript
// lib/auth.ts
const secret = process.env.NEXTAUTH_SECRET;
if (!secret) throw new Error("NEXTAUTH_SECRET não está definido. Configure a variável de ambiente.");
```
Adicionar ao `.env.example`:
```
NEXTAUTH_SECRET=gere-um-valor-com-openssl-rand-base64-32
```

---

### SEC-002 — Credenciais RouterOS armazenadas em texto plano
**Severidade:** 🟠 ALTO  
**Categoria:** Proteção de dados  
**Arquivo:** `prisma/schema.prisma` (campos `routerosUser`, `routerosPass`)

**Descrição:**  
Senhas de acesso aos equipamentos Mikrotik e community strings SNMP são gravadas sem criptografia no banco SQLite. Qualquer processo ou usuário com acesso ao arquivo `prisma/dev.db` pode ler todas as credenciais de rede.

**Impacto:** Comprometimento de todos os equipamentos monitorados.

**Mitigação:**
1. Criptografar campos antes de gravar no banco usando AES-256-GCM
2. Usar `NEXTAUTH_SECRET` como chave de derivação para criptografia
3. Descriptografar somente no worker no momento do uso

```typescript
// lib/crypto.ts
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

const KEY = scryptSync(process.env.NEXTAUTH_SECRET!, "salt", 32);

export function encrypt(text: string): string { /* ... */ }
export function decrypt(ciphertext: string): string { /* ... */ }
```

---

### SEC-003 — Sem rate limiting no login
**Severidade:** 🟠 ALTO  
**Categoria:** Controle de acesso  
**Arquivo:** `app/api/auth/[...nextauth]/route.ts`

**Descrição:**  
O endpoint de autenticação não possui limitação de taxa. Ataques de força bruta são triviais — um script pode testar milhares de senhas por minuto sem qualquer impedimento.

**Impacto:** Comprometimento do painel por força bruta de senha.

**Mitigação:**
```bash
npm install next-rate-limit
```
```typescript
// middleware.ts
import { rateLimit } from "next-rate-limit";

const limiter = rateLimit({
  interval: 5 * 60 * 1000, // 5 minutos
  uniqueTokenPerInterval: 500,
});

export async function middleware(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/api/auth/callback")) {
    try {
      await limiter.check(5, request.ip ?? "127.0.0.1"); // max 5 tentativas
    } catch {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }
  }
  // ... resto do middleware
}
```

---

### SEC-004 — Ausência de headers de segurança HTTP
**Severidade:** 🟡 MÉDIO  
**Categoria:** Configuração  
**Arquivo:** `next.config.ts`

**Descrição:**  
A aplicação não define headers de segurança padrão. Ausência de CSP aumenta risco de XSS; ausência de X-Frame-Options permite clickjacking; ausência de HSTS permite downgrade de HTTPS para HTTP.

**Mitigação:**
```typescript
// next.config.ts
const securityHeaders = [
  { key: "X-DNS-Prefetch-Control", value: "on" },
  { key: "X-XSS-Protection", value: "1; mode=block" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline';" },
];

export default {
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};
```

---

### SEC-005 — Tráfego sem criptografia (HTTP)
**Severidade:** 🟡 MÉDIO  
**Categoria:** Transporte seguro  

**Descrição:**  
O dashboard roda em HTTP. Credenciais digitadas no formulário de login são enviadas em texto plano na rede local. ARP spoofing ou monitoramento passivo de rede expõe senhas.

**Mitigação:**  
Usar nginx ou Caddy como reverse proxy com TLS:

```nginx
# /etc/nginx/sites-available/it-dashboard
server {
  listen 443 ssl;
  ssl_certificate /etc/ssl/certs/dashboard.crt;
  ssl_certificate_key /etc/ssl/private/dashboard.key;
  location / { proxy_pass http://localhost:3000; }
}
server {
  listen 80;
  return 301 https://$host$request_uri;
}
```

Ou com Caddy (automático):
```
dashboard.local {
  reverse_proxy localhost:3000
  tls internal
}
```

---

### SEC-006 — Permissões do arquivo SQLite
**Severidade:** 🔵 BAIXO  
**Categoria:** Proteção de dados  
**Arquivo:** `prisma/dev.db`

**Descrição:**  
O arquivo de banco de dados usa as permissões padrão do filesystem, permitindo leitura por outros usuários do sistema.

**Mitigação:**
```bash
chmod 600 prisma/dev.db
chown <service-user>:<service-user> prisma/dev.db
```
Adicionar ao script de inicialização do serviço.

---

### SEC-007 — Sem auditoria de ações administrativas
**Severidade:** 🔵 BAIXO  
**Categoria:** Rastreabilidade  

**Descrição:**  
Não há registro de quem criou, editou ou removeu dispositivos. Impossível investigar alterações não autorizadas.

**Mitigação:**  
Adicionar modelo `AuditLog` ao schema Prisma e registrar em todos os handlers de API:

```prisma
model AuditLog {
  id        String   @id @default(cuid())
  action    String   // CREATE | UPDATE | DELETE
  entity    String   // Device | Note
  entityId  String
  userId    String
  payload   String   // JSON
  createdAt DateTime @default(now())
}
```

---

### SEC-008 — Worker com privilégios completos
**Severidade:** 🔵 BAIXO  
**Categoria:** Princípio do menor privilégio  
**Arquivo:** `worker/monitors/ping.ts`

**Descrição:**  
O worker executa com os privilégios do usuário que iniciou o processo. O pacote `ping` executa binários do sistema (`/bin/ping`). Endereços IP não são validados antes de serem passados aos monitores.

**Mitigação:**
1. Executar o worker com usuário de serviço dedicado (`useradd -r -s /bin/false it-worker`)
2. Validar formato de IP antes de passar para monitores:
```typescript
const IP_REGEX = /^(\d{1,3}\.){3}\d{1,3}$|^([a-zA-Z0-9-]+\.)*[a-zA-Z0-9-]+$/;
if (!IP_REGEX.test(device.ip)) return;
```

---

### SEC-009 — Autenticação de fator único
**Severidade:** ℹ️ INFO  
**Categoria:** Autenticação  

**Descrição:**  
Apenas usuário e senha protegem o acesso ao painel.

**Mitigação:**  
Implementar TOTP como segundo fator opcional usando `otplib`:
```bash
npm install otplib qrcode
```

---

### SEC-010 — Validação de formato de IP ausente
**Severidade:** ℹ️ INFO  
**Categoria:** Validação de entrada  
**Arquivo:** `app/api/devices/route.ts:9`

**Descrição:**  
O campo `ip` aceita qualquer string não vazia, permitindo cadastro de IPs malformados.

**Mitigação:**
```typescript
// Adicionar ao deviceSchema
ip: z.string()
  .min(1)
  .refine(
    (v) => /^(\d{1,3}\.){3}\d{1,3}$/.test(v) || /^([a-zA-Z0-9-]+\.)+[a-zA-Z0-9-]+$/.test(v),
    { message: "IP ou hostname inválido" }
  ),
```

---

### SEC-011 — Sem timeout de sessão explícito
**Severidade:** ℹ️ INFO  
**Categoria:** Gerenciamento de sessão  
**Arquivo:** `lib/auth.ts`

**Descrição:**  
Tokens JWT usam o maxAge padrão do NextAuth. Sessões de usuários que saem do escritório sem fazer logout permanecem válidas.

**Mitigação:**
```typescript
// lib/auth.ts
session: {
  strategy: "jwt",
  maxAge: 8 * 60 * 60, // 8 horas
},
```

---

### SEC-012 — Sem limite de tamanho nas requisições
**Severidade:** ℹ️ INFO  
**Categoria:** DoS  
**Arquivo:** `app/api/devices/route.ts`

**Descrição:**  
Payloads de qualquer tamanho são aceitos nas rotas de API.

**Mitigação:**
```typescript
// next.config.ts
export default {
  experimental: {
    serverActions: { bodySizeLimit: "1mb" },
  },
};
```

---

## Plano de Mitigação Priorizado

| Prioridade | Item | Esforço | Risco se não corrigido |
|-----------|------|---------|----------------------|
| 1 | SEC-001: Validar NEXTAUTH_SECRET obrigatório | Baixo (5min) | Crítico — bypass de autenticação |
| 2 | SEC-003: Rate limiting no login | Médio (2h) | Alto — força bruta |
| 3 | SEC-002: Criptografar credenciais de equipamentos | Alto (1 dia) | Alto — exposição de infraestrutura |
| 4 | SEC-005: Configurar TLS/HTTPS | Médio (2h) | Médio — sniffing de rede |
| 5 | SEC-004: Adicionar security headers | Baixo (30min) | Médio — XSS/clickjacking |
| 6 | SEC-006: Permissões do arquivo SQLite | Baixo (5min) | Médio — leitura não autorizada |
| 7 | SEC-007: Auditoria de ações | Alto (1 dia) | Baixo — rastreabilidade |
| 8 | SEC-008: Validação de IP no worker | Baixo (30min) | Baixo — injection |
| 9 | SEC-011: Session maxAge | Baixo (5min) | Info — sessões longas |
| 10 | SEC-010: Validação de formato IP | Baixo (15min) | Info — dados inconsistentes |

---

## Rastreamento no Dashboard

Todos os achados desta análise foram importados como notas no sistema.  
Para importar: `npm run seed:security`  
Para visualizar: acesse `/notes` no dashboard e filtre por **Categoria: Segurança**.

---

## Observações de Contexto

Este dashboard é projetado para uso **exclusivamente na rede local interna**. O nível de risco é significativamente menor comparado a uma aplicação exposta à internet. No entanto:

- Ameaças internas (funcionários) existem
- Dispositivos de rede comprometidos podem atacar a rede interna
- Boas práticas de segurança reduzem a superfície de ataque mesmo em ambientes controlados

**Prioridade mínima recomendada:** corrigir SEC-001 (5 minutos de trabalho) antes de qualquer uso em produção.
