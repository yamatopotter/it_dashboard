/**
 * Seeds the database with initial security findings from SECURITY_REPORT.md.
 * Run once after first setup: npx tsx scripts/seed-security-notes.ts
 */
import "dotenv/config";
import { db } from "../lib/db";

const securityNotes = [
  {
    title: "Secret JWT com fallback hardcoded",
    content:
      `O secret JWT em lib/auth.ts usa "dev-secret" como valor padrão quando NEXTAUTH_SECRET não está definido no ambiente. ` +
      `Se o arquivo .env não existir em produção, tokens JWT serão assinados com um valor público e bem-conhecido, ` +
      `permitindo que qualquer atacante forge tokens de sessão válidos.\n\n` +
      `Mitigação: Definir NEXTAUTH_SECRET como obrigatório no startup. Adicionar validação que lança erro se a variável estiver ausente.`,
    severity: "CRITICAL" as const,
    category: "SECURITY" as const,
    status: "OPEN" as const,
  },
  {
    title: "Credenciais RouterOS e SNMP armazenadas em texto plano",
    content:
      `Os campos routerosUser, routerosPass e snmpCommunity são armazenados sem criptografia no banco SQLite. ` +
      `Qualquer pessoa com acesso ao arquivo prisma/dev.db consegue ler as senhas de todos os equipamentos Mikrotik ` +
      `e as community strings SNMP.\n\n` +
      `Mitigação: Criptografar campos sensíveis com AES-256 antes de gravar no banco (ex: usando a lib 'crypto' do Node ` +
      `com uma chave derivada de NEXTAUTH_SECRET). Descriptografar somente no worker antes de usar.`,
    severity: "HIGH" as const,
    category: "SECURITY" as const,
    status: "OPEN" as const,
  },
  {
    title: "Ausência de rate limiting no endpoint de login",
    content:
      `O endpoint /api/auth/[...nextauth] não possui limitação de taxa de requisições. ` +
      `Um atacante pode fazer ataques de força bruta contra o painel sem qualquer impedimento técnico. ` +
      `Combinado com senhas fracas, o painel pode ser comprometido rapidamente.\n\n` +
      `Mitigação: Implementar rate limiting com 'next-rate-limit' ou middleware customizado. ` +
      `Bloquear IPs após 5 tentativas falhas em 5 minutos. Registrar tentativas falhas em log.`,
    severity: "HIGH" as const,
    category: "SECURITY" as const,
    status: "OPEN" as const,
  },
  {
    title: "Ausência de headers de segurança HTTP",
    content:
      `A aplicação não define headers de segurança como Content-Security-Policy (CSP), ` +
      `X-Frame-Options, X-Content-Type-Options, Strict-Transport-Security (HSTS) e Permissions-Policy. ` +
      `Isso aumenta a superfície de ataque para XSS, clickjacking e sniffing de MIME type.\n\n` +
      `Mitigação: Adicionar headers de segurança no next.config.ts usando a propriedade 'headers'. ` +
      `Implementar CSP restritivo que permita apenas fontes confiáveis.`,
    severity: "WARNING" as const,
    category: "SECURITY" as const,
    status: "OPEN" as const,
  },
  {
    title: "Tráfego em texto plano (sem HTTPS)",
    content:
      `O dashboard roda por padrão em HTTP sem TLS. Credenciais de login e dados de monitoramento ` +
      `são transmitidos sem criptografia. Qualquer dispositivo na rede local pode capturar as credenciais ` +
      `via ARP spoofing ou monitoramento passivo de rede.\n\n` +
      `Mitigação: Configurar TLS com certificado autoassinado usando reverse proxy (nginx/Caddy) ` +
      `ou configurar HTTPS diretamente no Next.js. Forçar redirecionamento HTTP → HTTPS.`,
    severity: "WARNING" as const,
    category: "SECURITY" as const,
    status: "OPEN" as const,
  },
  {
    title: "Permissões do arquivo SQLite não estão restritas",
    content:
      `O arquivo prisma/dev.db tem permissões padrão do sistema operacional. ` +
      `Em sistemas com múltiplos usuários, outros usuários locais podem ler o banco de dados ` +
      `e obter acesso a senhas de equipamentos, hashes de senha do painel e histórico de monitoramento.\n\n` +
      `Mitigação: Aplicar permissões 600 no arquivo de banco: chmod 600 prisma/dev.db. ` +
      `Garantir que o processo Next.js rode com usuário dedicado com acesso mínimo.`,
    severity: "WARNING" as const,
    category: "SECURITY" as const,
    status: "OPEN" as const,
  },
  {
    title: "Sem log de auditoria para ações administrativas",
    content:
      `Não há registro de quem criou, editou ou removeu dispositivos. ` +
      `Em caso de incidente de segurança, é impossível determinar quais alterações foram feitas, ` +
      `quando foram feitas e se foram autorizadas.\n\n` +
      `Mitigação: Adicionar tabela AuditLog no schema Prisma. Registrar ações (CREATE/UPDATE/DELETE) ` +
      `em todos os endpoints de API com timestamp, usuário e payload de mudança.`,
    severity: "WARNING" as const,
    category: "OPERATIONAL" as const,
    status: "OPEN" as const,
  },
  {
    title: "Sem limite de tamanho para requisições de API",
    content:
      `Os endpoints de API não definem limite máximo de tamanho para o corpo da requisição. ` +
      `Um atacante autenticado poderia enviar payloads enormes causando degradação de performance ` +
      `ou consumo excessivo de memória.\n\n` +
      `Mitigação: Configurar bodyParser limit no next.config.ts. ` +
      `Adicionar validação de tamanho máximo nos schemas Zod (ex: max length em campos de texto).`,
    severity: "INFO" as const,
    category: "SECURITY" as const,
    status: "OPEN" as const,
  },
  {
    title: "Worker de monitoramento roda com privilégios completos do processo",
    content:
      `O worker em worker/index.ts executa com os mesmos privilégios do usuário que iniciou o processo. ` +
      `O monitor ICMP (ping) usa o pacote 'ping' que pode executar comandos do sistema. ` +
      `Se explorado, o escopo do dano é o do usuário do processo.\n\n` +
      `Mitigação: Executar o worker com usuário de serviço dedicado sem privilégios de root. ` +
      `Validar os endereços IP antes de passá-los para os monitores.`,
    severity: "INFO" as const,
    category: "SECURITY" as const,
    status: "OPEN" as const,
  },
  {
    title: "Autenticação de fator único",
    content:
      `O painel usa apenas usuário e senha para autenticação, sem suporte a segundo fator (2FA/TOTP). ` +
      `Se as credenciais forem comprometidas (ex: via phishing ou reutilização de senha), ` +
      `o atacante terá acesso total ao painel.\n\n` +
      `Mitigação: Implementar TOTP (ex: usando 'speakeasy' ou 'otplib') como segundo fator opcional. ` +
      `Mostrar QR code no primeiro login para configuração do autenticador.`,
    severity: "INFO" as const,
    category: "SECURITY" as const,
    status: "OPEN" as const,
  },
  {
    title: "Validação de IP sem verificação de formato",
    content:
      `O campo 'ip' em Device aceita qualquer string não vazia. ` +
      `Não há validação de que o valor é um IP válido (IPv4/IPv6) ou hostname. ` +
      `Isso pode causar erros silenciosos no worker e dificulta a detecção de cadastros incorretos.\n\n` +
      `Mitigação: Adicionar validação z.string().ip() ou regex de IPv4/IPv6/hostname no schema Zod ` +
      `do endpoint POST /api/devices.`,
    severity: "INFO" as const,
    category: "OPERATIONAL" as const,
    status: "OPEN" as const,
  },
  {
    title: "Sem timeout de sessão configurado",
    content:
      `O token JWT não tem tempo de expiração explícito configurado além do padrão do NextAuth. ` +
      `Sessões inativas permanecem válidas indefinidamente, aumentando o risco se um token for comprometido.\n\n` +
      `Mitigação: Configurar session.maxAge em lib/auth.ts (ex: 8 horas para turno de trabalho). ` +
      `Implementar renovação automática de token para sessões ativas.`,
    severity: "INFO" as const,
    category: "SECURITY" as const,
    status: "OPEN" as const,
  },
];

async function main() {
  console.log("🔍 Verificando notas de segurança existentes...");
  const existing = await db.note.count({ where: { category: "SECURITY" } });

  if (existing > 0) {
    console.log(`⚠️  Já existem ${existing} nota(s) de segurança. Abortando para evitar duplicatas.`);
    console.log("   Use --force para reimportar (apaga as existentes antes).");
    process.exit(0);
  }

  console.log(`📋 Criando ${securityNotes.length} notas de segurança...`);

  for (const note of securityNotes) {
    await db.note.create({ data: note });
    console.log(`  ✓ ${note.severity.padEnd(8)} ${note.title}`);
  }

  console.log("\n✅ Notas de segurança criadas com sucesso!");
  console.log("   Acesse /notes no dashboard para visualizá-las.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect?.());
