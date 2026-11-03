import { Topbar } from "@/components/topbar";
import { Panel, type PanelColor } from "@/components/tui/panel";
import { TuiPage } from "@/components/tui/page";

type ChangeType = "feat" | "fix" | "security" | "refactor" | "perf";

interface Change {
  type: ChangeType;
  text: string;
}

interface Release {
  version: string;
  date: string;
  label?: string;
  latest?: boolean;
  changes: Change[];
}

const RELEASES: Release[] = [
  {
    version: "0.7.0",
    date: "3 Nov 2026",
    label: "Redesign: tela de operação, avisos no Zoho Cliq e relatório mensal",
    latest: true,
    changes: [
      { type: "perf", text: "Monitoramento mais leve e rápido: Mikrotik, Omada e UniFi reaproveitam a conexão em vez de reconectar a cada checagem, e os APs do mesmo controlador compartilham uma única consulta; o tráfego dos links deixou de esperar 1 s por leitura" },
      { type: "refactor", text: "Interface inteira padronizada no estilo TOWER: menu lateral, cabeçalhos, painéis, tabelas densas, formulários, botões e cores de estado iguais em todas as telas, em tema claro e escuro, com menu recolhível no celular" },
      { type: "feat", text: "Nova tela TOWER/1 em /tower — fila de problemas no topo (gravidade e idade), links com tráfego, unidades com o estado de cada equipamento e eventos recentes, tudo com atalhos de teclado e aviso quando os dados congelam" },
      { type: "feat", text: "Reconhecer (ack) e silenciar agora valem também para links e dispositivos — OPERADOR ou ADMIN reconhece com uma nota, ou silencia por 1 h, 4 h ou 12 h (até 24 h) para manutenção programada; o ack some sozinho quando o link volta" },
      { type: "feat", text: "Equipamentos que pararam de responder por causa de um link ou gateway caído aparecem agrupados sob o problema principal, em vez de gerar uma enxurrada de alertas" },
      { type: "feat", text: "Avisos no Zoho Cliq — abertura, reaviso único, recuperação, oscilação (flapping) e worker parado, com botão para abrir o item no WatchIT; configuração e mensagem de teste em Configurações › Sistema (ADMIN)" },
      { type: "feat", text: "Regras anti-ruído nos avisos: atenção só avisa após 15 min, itens silenciados ou reconhecidos não avisam, avisos de oscilação têm intervalo mínimo e cada episódio é avisado uma única vez" },
      { type: "feat", text: "Relatório mensal de disponibilidade por link e por unidade, com meta de SLA configurável (padrão do sistema) e escolha do mês — o relatório por dispositivo continua disponível" },
      { type: "feat", text: "Interfaces alternativas escolhíveis em Configurações › Sistema › Aparência (padrão do sistema e permissão de troca) e no Perfil (preferência de cada usuário)" },
      { type: "feat", text: "Campo Unidade (Barra, Botafogo, Itaguaí) em dispositivos e links; equipamentos sem unidade aparecem no grupo '?' até serem revisados" },
      { type: "refactor", text: "Telefonia, Computadores e NVR/câmeras viraram módulos opcionais, desligados por padrão — ligue em Configurações › Sistema (ADMIN); desligado, o módulo some do menu, das contagens e para de sincronizar, sem apagar dados" },
      { type: "refactor", text: "Menu lateral enxuto — Manual, Changelog e Segurança saíram da navegação (continuam acessíveis pelo endereço)" },
      { type: "refactor", text: "Todas as interfaces leem um único snapshot (GET /api/tower), com cache curto e ETag para economizar tráfego no polling" },
      { type: "security", text: "A URL do webhook do Zoho Cliq é criptografada no banco (AES-256-GCM), nunca volta nas respostas da API nem aparece na auditoria, e só aceita https para domínios do Zoho (proteção contra SSRF)" },
      { type: "security", text: "Ações de ack e silêncio exigem papel OPERADOR ou ADMIN e são registradas na auditoria; configurações de módulos, aparência e Cliq exigem ADMIN; /api/tower exige sessão" },
      { type: "security", text: "Envios ao Cliq ficam registrados na auditoria (usuário 'cliq') com sucesso ou erro" },
      { type: "refactor", text: "O aviso por webhook genérico de cada dispositivo e a variável WORKER_STALE_WEBHOOK_URL foram substituídos pelo Zoho Cliq; o campo de webhook no formulário do dispositivo não dispara mais alertas" },
    ],
  },
  {
    version: "0.6.0",
    date: "20 Aug 2026",
    label: "Inventário de computadores via Datto RMM",
    latest: false,
    changes: [
      { type: "feat", text: "Nova página Computadores — inventário de estações de trabalho e servidores sincronizado automaticamente do Datto RMM, com status online/offline e data da última vez visto" },
      { type: "feat", text: "Alertas abertos do Datto RMM (antivírus, disco cheio, etc.) aparecem diretamente na máquina afetada, com selo de prioridade (Crítico, Alto, Moderado, Baixo)" },
      { type: "feat", text: "Configuração da integração Datto RMM em Sistema (ADMIN) — plataforma/região, API Key e Secret Key (criptografados), intervalo de sincronização e botão 'Sincronizar agora'" },
      { type: "feat", text: "Filtros por status (Online/Offline) e por presença de alertas na página Computadores; badge de máquinas offline na barra lateral" },
    ],
  },
  {
    version: "0.5.1",
    date: "20 Aug 2026",
    label: "Tela de configuração da integração Miradore",
    latest: false,
    changes: [
      { type: "feat", text: "Configuração da integração Miradore agora disponível na tela Sistema (ADMIN) — site name, API key (criptografada) e intervalo de sincronização podem ser cadastrados pela interface, sem precisar de acesso direto à API" },
      { type: "feat", text: "Botão 'Sincronizar agora' na tela Sistema para forçar a sincronização Miradore sob demanda, com exibição de horário e erro da última sincronização" },
    ],
  },
  {
    version: "0.5.0",
    date: "18 Aug 2026",
    label: "Login corporativo via Zoho OAuth",
    latest: false,
    changes: [
      { type: "security", text: "Autenticação corporativa via Zoho SSO — usuários podem fazer login com conta Zoho, reduzindo a necessidade de gerenciar senhas locais para contas corporativas" },
      { type: "feat", text: "Allowlist de e-mails — ADMIN pré-cadastra o e-mail do usuário e seu nível de acesso; login Zoho é rejeitado se o e-mail não estiver pré-autorizado" },
      { type: "feat", text: "Configuração do Zoho em Sistema (ADMIN) — Client ID, Client Secret (criptografado) e data center são armazenados no banco, sem depender de .env ou redeploy" },
      { type: "feat", text: "Botão 'Entrar com Zoho' aparece automaticamente na tela de login quando a integração está habilitada; desaparece quando desabilitada sem precisar reiniciar" },
      { type: "feat", text: "Gestão de usuários suporta dois tipos — Local (usuário/senha) e Zoho (e-mail), com UI clara na tela de criação e badges na tabela para diferenciar" },
      { type: "feat", text: "2FA (TOTP) desabilitado para contas Zoho — login corporativo já vem autenticado e não precisa de segundo fator local" },
      { type: "fix", text: "Corrigida migração do banco de dados que deixava o login local (usuário/senha) fora do ar após a atualização — colunas do Zoho OAuth não haviam sido aplicadas por completo na tabela de usuários" },
    ],
  },
  {
    version: "0.4.0",
    date: "18 Aug 2026",
    label: "Inventário de celulares com sincronização Miradore",
    latest: false,
    changes: [
      { type: "feat", text: "Inventário completo de celulares corporativos — cadastre número, proprietário, departamento, operadora, modelo, IMEI, valor da fatura e datas de contrato/fidelidade" },
      { type: "feat", text: "Sincronização automática com Miradore MDM — status técnico dos aparelhos (bateria, última conexão, S.O., compliance) é atualizado periodicamente via API sem sobrescrever os dados manuais" },
      { type: "feat", text: "Filtros por status (Ativo/Suspenso/Cancelado) e por fidelidade vencendo nos próximos 30 dias — badge de alerta na sidebar para fidelidades próximas de expirar" },
      { type: "feat", text: "Configuração da integração Miradore em Sistema (ADMIN) — site name e API key (criptografada) armazenadas, com controle de intervalo de sincronização" },
      { type: "feat", text: "Botão 'Sincronizar agora' para forçar a sincronização sob demanda, útil para testar a configuração ou atualizar dados imediatamente" },
    ],
  },
  {
    version: "0.3.0",
    date: "27 Jul 2026",
    label: "Monitoramento de gravação NVR e alertas por e-mail",
    latest: false,
    changes: [
      { type: "feat", text: "NVDs (gravadores de câmera Intelbras/Dahua) agora podem ser cadastrados como dispositivo e monitorados automaticamente: canais gravando, parados, com falha ou inacessíveis" },
      { type: "feat", text: "E-mail de alerta (SMTP) quando um canal para de gravar — configurável em Sistema, com qualquer provedor (SSL ou TLS), sem repetir o aviso antes de 2 horas" },
      { type: "feat", text: "Saúde de disco/armazenamento do NVD exibida na página de detalhe do dispositivo" },
      { type: "feat", text: "Câmeras IP já cadastradas podem ser vinculadas a um canal do NVD, mostrando o status de ping ao lado do status de gravação do canal" },
      { type: "feat", text: "A verificação de gravação roda numa cadência própria e ajustável (padrão 1x/dia), independente do intervalo normal de monitoramento do dispositivo" },
    ],
  },
  {
    version: "0.2.5",
    date: "1 Jul 2026",
    label: "Setup zero-intervenção e imagem Docker menor",
    latest: false,
    changes: [
      { type: "feat", text: "Setup wizard gera automaticamente os segredos de criptografia (NEXTAUTH_SECRET, ENCRYPTION_KEY e WEBHOOK_SECRET) — não é mais necessário criar o .env manualmente antes da primeira execução" },
      { type: "fix", text: "Setup lock (setup.lock) sobrevive a reinícios de container — volume persistente /app/data no docker-compose.prod.yml evita que o wizard se repita desnecessariamente" },
      { type: "fix", text: "Container de produção inicia o servidor correto (npm run start em vez de npm run dev:all com hot-reload)" },
      { type: "fix", text: "Separadores entre seções de protocolos no formulário de dispositivo agora somem junto com a seção — não ficam mais visíveis quando o tipo selecionado não tem aquela seção" },
      { type: "feat", text: "Intervalo de monitoramento global — modal na tela de dispositivos permite ajustar o tempo de polling de todos os dispositivos (ou de um tipo específico) em lote, sem editar um a um" },
      { type: "fix", text: "URL de webhook copiada nos detalhes do link agora inclui o token de autenticação (?token=…) — chamadas externas (Zabbix, NetWatch, scripts) paravam com erro 401" },
      { type: "fix", text: "Toast de confirmação ao copiar URL de webhook na tela de links e na página de detalhes do link" },
      { type: "perf", text: "Imagem Docker de 677 MB → 332 MB (-51%) — stage de prod-deps elimina devDependencies e COPY --chown evita camada duplicada do chown" },
      { type: "feat", text: "Script de auditoria de configuração Mikrotik (scripts/mikrotik_validate.py) — verifica firewall, NAT, DHCP, serviços de gerência expostos e NTP/DNS direto no roteador, sem depender do banco" },
    ],
  },
  {
    version: "0.2.4",
    date: "18 Jun 2026",
    label: "OIDs SNMP personalizáveis",
    latest: false,
    changes: [
      { type: "feat", text: "OIDs SNMP agora são configuráveis por dispositivo — os valores padrão (CPU, Memória, Uptime) vêm pré-preenchidos, mas podem ser editados, desabilitados ou substituídos por OIDs proprietários do fabricante" },
      { type: "feat", text: "Suporte a métricas de razão (numerador/denominador) e escalonamento por divisor — permite exibir qualquer OID como porcentagem ou unidade adequada" },
      { type: "feat", text: "Métricas customizadas aparecem como tiles no drawer do dispositivo, ao lado dos gráficos de CPU e Memória" },
    ],
  },
  {
    version: "0.2.3",
    date: "17 Jun 2026",
    label: "Sinal Wi-Fi por cliente",
    latest: false,
    changes: [
      { type: "feat", text: "Câmeras e outros clientes Wi-Fi exibem RSSI, SNR, SSID e AP conectado no drawer — basta cadastrar o MAC Address do dispositivo; o sistema localiza automaticamente nos dados de qualquer AP Omada ou UniFi monitorado" },
      { type: "feat", text: "Cards de dispositivos com MAC cadastrado exibem indicador Wi-Fi para sinalizar que o monitoramento de sinal está ativo" },
    ],
  },
  {
    version: "0.2.2",
    date: "17 Jun 2026",
    label: "Reconhecimento de offline",
    latest: false,
    changes: [
      { type: "feat", text: "Dispositivos offline podem ser marcados como 'Offline reconhecido' por OPERADOR ou ADMIN — a badge muda para cinza e o motivo pode ser registrado; o reconhecimento é removido automaticamente quando o dispositivo volta online" },
    ],
  },
  {
    version: "0.2.1",
    date: "14 Jun 2026",
    label: "Hardening de segurança e estabilidade",
    latest: false,
    changes: [
      { type: "feat", text: "Ordenação de dispositivos por tipo, nome, IP, status, ping ou local — seletor visível em todos os modos de visualização (tabela, cards, compacto) com preferência salva entre sessões" },
      { type: "refactor", text: "Favicon do app atualizado para o farol da marca (WatchIT Tower) na aba do navegador, substituindo o ícone padrão" },
      { type: "fix", text: "Status online/offline de APs Omada e UniFi agora reflete o estado real reportado pelo controlador — APs desligados deixam de aparecer como online (falso positivo) e APs ativos via API key deixam de aparecer como offline (falso negativo)" },
      { type: "security", text: "Política de segurança de conteúdo (CSP) com nonce voltou a funcionar — o nonce por requisição agora é propagado ao Next.js e ao tema, sem bloquear scripts legítimos da página" },
      { type: "fix", text: "Criação em massa de APs Omada não falha mais com erro 500 — as credenciais (Client ID/Secret) agora são criptografadas e gravadas corretamente, como na criação individual" },
      { type: "fix", text: "APs Omada criados em massa agora leem a API automaticamente — o worker resolve o ID do site a partir do nome (ou do único site do controlador) e salva, sem precisar configurar o site manualmente" },
      { type: "feat", text: "Cadastro em massa de APs Omada: após testar a conexão, o site passa a ser escolhido numa lista (selecionado automaticamente quando há só um), e não é mais possível cadastrar um AP Omada sem selecionar o site" },
      { type: "fix", text: "Salvar um dispositivo sem webhook de alerta não falha mais (campo vazio era rejeitado como URL inválida)" },
      { type: "fix", text: "Editar um dispositivo apagava as credenciais (RouterOS/Omada) quando não eram redigitadas — o formulário enviava em branco e o backend zerava; agora campos de credencial em branco são preservados na edição" },
      { type: "fix", text: "Mikrotik às vezes não exibia uptime/CPU/memória (o /system/resource voltava vazio na primeira tentativa em links remotos) — agora há retry e, se ainda faltar, um aviso explicando a provável causa (permissão da API)" },
      { type: "feat", text: "IP do dispositivo exibido nos incidentes e na linha do tempo do painel — facilita o acompanhamento" },
      { type: "fix", text: "Painel deixava de atualizar o status dos dispositivos (mostrava só os primeiros checados como online e o restante offline, KPIs de instáveis e clientes Wi-Fi zerados) — o cache da lista (ETag) ignorava mudanças de status e servia um snapshot congelado" },
      { type: "security", text: "Autorização por papel reforçada — VIEWER não obtém mais tokens de webhook nem dispara verificações de rede/tráfego ao vivo (apenas OPERADOR+)" },
      { type: "security", text: "Trocar a senha de um usuário invalida imediatamente todas as sessões antigas dele" },
      { type: "security", text: "Community SNMP nunca mais é retornada nas respostas da API — exposta apenas como indicador 'configurado'" },
      { type: "security", text: "Rate limiter de login agora é atômico — fecha brecha de concorrência que permitia exceder o limite de tentativas" },
      { type: "security", text: "Validação de chaves de criptografia/webhook no startup do servidor (falha rápida em vez de erro críptico na primeira requisição)" },
      { type: "security", text: "Mensagens de erro internas do banco não vazam mais ao cliente; IP de auditoria só confia em proxy reverso quando configurado (TRUST_PROXY)" },
      { type: "fix", text: "Worker mais resiliente — timeout por verificação evita travamento, e alertas de queda nunca disparam em duplicidade" },
      { type: "fix", text: "Páginas mostram erro com opção de recarregar em vez de ficar presas carregando; novas telas de erro evitam tela branca" },
      { type: "fix", text: "Trocar o período nos gráficos não embaralha mais os dados (corridas de requisição canceladas corretamente)" },
      { type: "fix", text: "Cadastro valida formato de IP; filtros de data inválidos retornam erro claro; formulários impedem envio duplicado" },
      { type: "perf", text: "Índices de banco em tipo de dispositivo, links Mikrotik e auditoria por IP; exportações e listas de eventos com limite de memória" },
      { type: "perf", text: "Detecção de incidentes, timeline e relatórios processados no banco (transições e agregações) — escalam para janelas longas e frotas grandes sem carregar todo o histórico na memória" },
      { type: "perf", text: "Índice por data no histórico de status e eventos de link — painel, saúde do sistema e limpeza deixam de varrer a tabela inteira (consultas por período ~centenas de vezes mais rápidas em bases grandes)" },
      { type: "perf", text: "Sparklines do painel buscam só os últimos pontos por dispositivo no banco; reconcile do worker agrupa dispositivos alterados numa única consulta" },
      { type: "refactor", text: "Ícone do farol redesenhado (lanterna, feixes de luz, torre estriada e porta em arco) e unificado entre login e sidebar" },
      { type: "fix", text: "Acessibilidade: cards e linhas clicáveis navegáveis por teclado, estados ARIA (pressed/expanded/sort) em filtros, seções e tabelas, e rótulo no botão Voltar" },
      { type: "fix", text: "Busca de dispositivos por IP encontra trechos no meio do endereço (ex: '168.1'), não apenas o início" },
      { type: "feat", text: "Badges da sidebar (dispositivos offline, links online) atualizam ao vivo a cada 30s, sem precisar recarregar a página" },
      { type: "security", text: "Criação em massa de dispositivos passa a criptografar a community SNMP em repouso, como os demais cadastros" },
      { type: "refactor", text: "Qualidade interna: helpers de formatação e componentes de drawer deduplicados; cobertura de testes ampliada para 2FA, logout e autorização por papel (586 testes); dependências atualizadas" },
    ],
  },
  {
    version: "0.2.0",
    date: "14 Jun 2026",
    label: "Segurança e acessibilidade",
    latest: false,
    changes: [
      { type: "security", text: "Autenticação em dois fatores (TOTP/2FA) — ativação via QR code, compatível com Google Authenticator e Authy" },
      { type: "security", text: "Gerenciamento de 2FA por usuário na página de administração — admins podem ativar/desativar para qualquer conta" },
      { type: "security", text: "session.user.id agora exposto corretamente pelo callback de sessão do NextAuth" },
      { type: "feat", text: "Página /profile — cada usuário gerencia seu próprio 2FA e visualiza informações da conta" },
      { type: "feat", text: "Manual do usuário integrado (/manual) — documentação completa da plataforma em 10 seções" },
      { type: "feat", text: "Manual do desenvolvedor (/dev-manual) — arquitetura, padrões e guias internos, restrito a administradores" },
      { type: "refactor", text: "Rodapé da sidebar vira link para /profile; nome e role do usuário clicáveis" },
      { type: "refactor", text: "Coluna 2FA na tabela de usuários com badge de status Ativo/Inativo" },
      { type: "feat", text: "Manual de testes integrado (/test-manual) — 12 seções cobrindo estratégia, Jest config, todas as suítes (API, worker, componentes, segurança, integração) e padrões de mock; restrito a administradores" },
      { type: "fix", text: "Contraste WCAG AA (rounds 1–3) — muted-foreground, primary, success, destructive e warning (#8c5500) corrigidos; versão da sidebar sem opacity; regiões roláveis com tabIndex para teclado" },
      { type: "fix", text: "Acessibilidade: aria-labels em botões ícone-apenas, aria-hidden em ícones decorativos, landmarks únicos" },
      { type: "fix", text: "Migrações alert_fields e rate_limit_table aplicadas ao banco de dados" },
    ],
  },
  {
    version: "0.1.0",
    date: "13 Jun 2026",
    label: "Release inicial",
    latest: false,
    changes: [
      { type: "security", text: "Auditoria de segurança completa — 24 achados documentados (SEC-001 a SEC-024), todos os críticos e altos resolvidos" },
      { type: "security", text: "SEC-019: criação em massa de dispositivos restringida ao perfil OPERADOR" },
      { type: "security", text: "SEC-020: exportação CSV protegida contra injeção de fórmula (Excel/LibreOffice)" },
      { type: "security", text: "SEC-023: rotas de teste Omada/UniFi bloqueadas para VIEWER (prevenção de SSRF)" },
      { type: "feat", text: "Integração Omada Northbound API — autenticação OAuth2, clientes por AP, painel dedicado" },
      { type: "feat", text: "Integração UniFi Controller — clientes por AP, painel dedicado" },
      { type: "feat", text: "Clientes DHCP do RouterOS exibidos no detalhe do dispositivo" },
      { type: "feat", text: "Painéis dedicados por tipo de dispositivo (Mikrotik, Omada, UniFi)" },
      { type: "feat", text: "Sistema de auditoria de alterações — log completo com filtros, paginação e exportação CSV" },
      { type: "feat", text: "Controle de usuários com roles ADMIN / OPERADOR / VIEWER" },
      { type: "feat", text: "Página de sistema: métricas do banco e controle de retenção de logs" },
      { type: "feat", text: "Relatórios por dispositivo: downtime, ping, CPU/memória e exportação CSV" },
      { type: "feat", text: "KPI 'Clientes Wi-Fi' unifica contagem de APs UniFi e Omada" },
      { type: "feat", text: "Versão e build number no rodapé da sidebar (via git rev-list)" },
      { type: "refactor", text: "Rebrand: aplicação renomeada para WatchIT Tower com ícone de farol" },
      { type: "refactor", text: "Redesign completo da interface — tokens, sidebar, topbar, cards e tabelas (Fases 1–7)" },
      { type: "refactor", text: "Página de login reformulada com branding, recursos e campo de senha com toggle" },
      { type: "fix", text: "Cálculo de downtime corrigido — não inflava períodos sem histórico suficiente" },
      { type: "fix", text: "Filtro OMADA_AP adicionado na visão geral e na página de dispositivos" },
      { type: "fix", text: "Polling do detalhe do dispositivo atualiza gráficos automaticamente" },
      { type: "fix", text: "Cache HTTP desabilitado nas rotas monitoradas — dados sempre frescos" },
      { type: "fix", text: "Strings do RouterOS sanitizadas antes de gravar no PostgreSQL" },
      { type: "fix", text: "Horários padronizados para America/Sao_Paulo em toda a interface" },
    ],
  },
];

const TYPE_ORDER: ChangeType[] = ["security", "feat", "refactor", "fix", "perf"];

const TYPE_META: Record<ChangeType, { label: string; glyph: string; color: PanelColor; cls: string }> = {
  security: { label: "Segurança", glyph: "✖", color: "crit", cls: "tui-crit" },
  feat: { label: "Novas funcionalidades", glyph: "+", color: "accent2", cls: "tui-info" },
  refactor: { label: "Melhorias", glyph: "~", color: "info", cls: "tui-dim" },
  fix: { label: "Correções", glyph: "●", color: "ok", cls: "tui-ok" },
  perf: { label: "Performance", glyph: "▲", color: "warn", cls: "tui-warn" },
};

function groupByType(changes: Change[]): [ChangeType, Change[]][] {
  const map = new Map<ChangeType, Change[]>();
  for (const c of changes) {
    if (!map.has(c.type)) map.set(c.type, []);
    map.get(c.type)!.push(c);
  }
  return TYPE_ORDER.filter((t) => map.has(t)).map((t) => [t, map.get(t)!]);
}

export default function ChangelogPage() {
  return (
    <>
      <Topbar title="Changelog" subtitle="Histórico de versões e alterações do sistema" />

      <TuiPage narrow>
        <div className="tui-stack">
          {RELEASES.map((release) => (
            <Panel
              key={release.version}
              title={`v${release.version}`}
              sub={`${release.date}${release.latest ? " · atual" : ""}`}
              color={release.latest ? "accent2" : "dim"}
            >
              {release.label && <p style={{ margin: "0 0 12px", fontWeight: 600 }}>{release.label}</p>}
              {groupByType(release.changes).map(([type, items]) => {
                const meta = TYPE_META[type];
                return (
                  <section key={type} style={{ marginBottom: 16 }}>
                    <h3 className={meta.cls} style={{ margin: "0 0 6px", fontSize: 12, letterSpacing: ".06em", textTransform: "uppercase" }}>
                      <span aria-hidden="true">{meta.glyph} </span>
                      {meta.label} <span className="tui-dim">({items.length})</span>
                    </h3>
                    <ul className="tui-prose" style={{ margin: 0, paddingLeft: "2ch", listStyle: "none" }}>
                      {items.map((change, i) => (
                        <li key={i} style={{ marginBottom: 4, textIndent: "-2ch", paddingLeft: "2ch" }}>
                          <span className="tui-faint" aria-hidden="true">· </span>
                          {change.text}
                        </li>
                      ))}
                    </ul>
                  </section>
                );
              })}
            </Panel>
          ))}
        </div>
      </TuiPage>
    </>
  );
}
