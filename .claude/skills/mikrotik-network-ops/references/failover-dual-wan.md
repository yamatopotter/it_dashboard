# Dual-WAN, failover, teste diário e alertas

## Conteúdo
1. Desenho
2. Peças no equipamento
3. Modelos de script (adaptar!)
4. Teste diário do link secundário + watchdog
5. Alertas (e-mail e webhook)
6. Padronizar em todos os sites
7. O que validar

## 1. Desenho

Cada gateway tem um link **primário** e um **secundário** (ex.: 7Link PPPoE primário, RJNet secundário em Itaguaí; 7Link/Vivo em Botafogo; TIM na Barra, com visitantes por política na TIM).

- Duas rotas padrão com comentário fixo (`WAN-<PRI>`, `WAN-<SEC>`), distância 1 e 2, `check-gateway=ping`.
- Um **netwatch por link**, com alvo externo estável (um IP de provedor, não 8.8.8.8 compartilhado) e `up-script`/`down-script`. Intervalo 20 s, timeout 5 s.
- Cada alvo tem rota **/32 no próprio link** + regra de OUTPUT que impede o ping de sair pelo outro link (ver `routeros-gotchas.md`).
- Os scripts `*-down`/`*-up` **confirmam** a queda (5 pings espaçados) antes de agir, para ignorar oscilações, e depois habilitam/desabilitam a rota, avisam por e-mail e notificam o painel.
- As rotas WAN ficam **desabilitadas até o netwatch confirmar o link**; `*-up` habilita, `*-down` desabilita.

## 2. Peças no equipamento

| Peça | Observação |
|---|---|
| Rotas `WAN-*` | comentário fixo, distâncias 1/2 |
| `/tool/netwatch` | um por link, com `up-script`/`down-script` apontando para os scripts |
| Rotas `/32` + OUTPUT | `drop` para `out-interface=!<link>`; no PPPoE, par accept+drop |
| `/system/script` | `<pri>-down`, `<pri>-up`, `<sec>-down`, `<sec>-up`, `cfg-webhook`, `test-backup-priority`, `test-backup-restore` |
| `/system/scheduler` | teste diário 05:00, watchdog 06:00 e no boot, reboot diário (se houver) fora da janela |
| `/tool/e-mail` | SMTP com TLS; remetente/destinatários definidos na própria skill de cada site |

## 3. Modelos de script (adaptar!)

> São modelos de projeto, não cópias literais do equipamento. Substitua `<…>`, rode `:parse` no equipamento e teste com uma cópia curta antes de agendar. Nunca coloque tokens no script — só no `cfg-webhook`.

**`cfg-webhook`** (único lugar com segredos):
```
:global WHBASE "http://<servidor-monitoramento>:<porta>/api/links"
:global WHID1 "<id-link-primario>"
:global WHTOK1 "<token-hmac-link-primario>"
:global WHID2 "<id-link-secundario>"
:global WHTOK2 "<token-hmac-link-secundario>"
```

**`<pri>-down`** (confirma queda do link primário):
```
/system script run cfg-webhook
:global WHBASE
:global WHID1
:global WHTOK1
:local ok 0
:for i from=1 to=5 do={
  :if ([/ping address=<ALVO_PRI> interface=<IFACE_PRI> count=1] = 1) do={ :set ok ($ok+1) }
  :delay 3s
}
:if ($ok <= 1) do={
  /ip route set [find comment="WAN-<PRI>"] disabled=yes
  /log warning message="[FAILOVER] Link <PRI> (primario) caiu - confirmado $ok/5"
  :local sent false
  :for t from=1 to=3 do={
    :if (!$sent) do={
      :do { /tool e-mail send to="<destino>" subject="[ALERTA] <SITE> - Link <PRI> (primario) caiu" body="Link <PRI> caiu. Trafego em <SEC>." ; :set sent true } on-error={ /log warning message="[FAILOVER] Tentativa $t de enviar e-mail <PRI> DOWN falhou"; :delay 10s }
    }
  }
  :do { /tool fetch url=($WHBASE . "/" . $WHID1 . "/down?token=" . $WHTOK1) keep-result=no } on-error={ /log error message="[FAILOVER] Falha ao notificar monitoramento (<PRI> down)" }
} else={
  /log info message="[FAILOVER] Oscilacao no <PRI> ignorada ($ok/5 respostas, sem alerta)"
}
```
`<pri>-up` é o espelho: `:if ($ok >= 4)` → `disabled=no`, log "voltou - confirmado $ok/5", e-mail "[RECUPERADO]", webhook `/up`. Os scripts do link secundário seguem o mesmo molde com a rota `WAN-<SEC>`.

Pontos que importam (aprendidos na prática):
- Notificar o painel **não pode bloquear** a ação de rota; faça a rota primeiro.
- O primeiro e-mail logo após boot pode dar `timeout`; a retentativa resolve.
- Mensagens de log com prefixo `[FAILOVER]` permitem filtrar e conferir pós-reboot.

## 4. Teste diário do link secundário + watchdog

**Objetivo:** provar todos os dias que o secundário realmente carrega tráfego, fora do expediente.

- **Janela fixa: 05:00–06:00** em todos os sites. Antes era semanal às 14:00 / 06:00 e levava mais de 70 min; o teste travava com o secundário como primário. Hoje: 50 verificações com passo de 1 min (~50 min).
- **Scheduler** `TEST-BACKUP-PRIORITY-DAILY` às 05:00.
- **Script `test-backup-priority`:**
  1. Aborta sem alterar nada se as rotas `WAN-<PRI>`/`WAN-<SEC>` não forem encontradas (ou estiverem duplicadas).
  2. Inverte as distâncias (secundário=1, primário=2).
  3. Monitora o netwatch do secundário por 50 minutos (`:for`/`:delay 1m`); se não conseguir ler o netwatch, segue sem abortar.
  4. Restaura (primário=1, secundário=2) e **confere** que voltou.
  5. Envia e-mail com o resultado; se não houve queda, notifica o painel.
- **Watchdog `test-backup-restore`:** agendado às **06:00** e no **startup**. Se encontrar a prioridade invertida fora do teste, restaura (primário=1, secundário=2) e avisa por e-mail. É isso que resolve o problema "teste interrompido deixa o secundário como primário" (queda de energia, reboot, erro no script).
- **Nunca** agende `reboot` entre 05:00 e 06:00 (um `REBOOT-DIARIO` às 05:30 colidiria com o teste; foi mantido **desabilitado**).
- Validação na instalação: `:parse` nos dois scripts, rodar uma versão curta (poucas checagens) e rodar o watchdog em estado normal (deve não fazer nada).

## 5. Alertas

- **E-mail (independente do painel):** SMTP com STARTTLS (ex.: porta 587), 3 tentativas. É o alerta que sobrevive ao painel desligado — quando o WatchIT estava fora do ar, todas as notificações HTTP falharam e só o e-mail alertava.
- **Webhook para o painel:** `GET /api/links/<id>/up|down?token=<HMAC-SHA256(WEBHOOK_SECRET, linkId)>`. Eventos ficam em `LinkEvent` e na auditoria. Se o painel for repensado, troque o destino em um lugar só (`cfg-webhook`).
- Alternativas para evitar dependência de um servidor: syslog remoto, SNMP traps, ou um coletor sempre ligado. Decisão pendente no projeto.

## 6. Padronizar em todos os sites

Ao conectar um novo site, replique: rotas com comentários padronizados, netwatch + /32 + OUTPUT, os quatro scripts de link, `cfg-webhook`, teste diário + watchdog, e-mail. Aplicado: Botafogo e Itaguaí (novo). Pendente: Barra (que também tem política para visitantes via TIM — o teste não pode virar o tráfego dos visitantes; confira o desenho antes).

## 7. O que validar

- Após reboot: link primário ativo, `check-gateway`, netwatch "up", logs `[FAILOVER]` coerentes (queda e retorno do boot são normais).
- E-mail chega; webhook chega (se o painel está no ar).
- **Costuma ficar sem teste real:** queda física do primário, secundário assumindo e voltando, e o túnel WireGuard subindo pela WAN secundária (depende de o modem do secundário encaminhar a porta UDP do túnel). Registre como risco aberto se não foi feito.

## Lição: teste de link que deixa a prioridade invertida (Barra, 02/11/2026)

- Um teste que inverte a prioridade e depois chama `/tool e-mail send` **sem `on-error`** morre no primeiro erro de DNS (a troca de rota derruba a sessão DoH/DNS) e nunca restaura a rota. O gateway fica dias no link de reserva sem alerta.
- Padrão correto (usado em Itaguaí, Botafogo e Barra): `:delay 15s` após a troca, envio de e-mail em `:while` com `:do { } on-error={ }` (3 tentativas), validação de que as distâncias voltaram, e um **watchdog** (`test-backup-restore`) às 06:00 e no boot que força a prioridade correta.
- Teste diário, não semanal: a janela 05:00–06:00 é fora do expediente; semanal em horário comercial (ex.: 08:00) expõe a unidade.
- Atenção a sites com `dst-nat` pelo IP de um link: durante o teste as respostas saem pelo outro link (caminho assimétrico).

## Retorno simétrico de serviços públicos (dst-nat) e detecção de degradação (Barra, 03/11/2026)

- **Problema:** serviços publicados por um link (ex.: redirecionamento no IP da WIPI) respondem pelo link que estiver como rota padrão. Com a prioridade invertida (teste diário ou queda do primário), a resposta sai pelo outro link com o IP de origem do primeiro e o provedor descarta. Quando o primário cai de verdade, o serviço fica fora do ar (aceito pelo usuário); o que não pode acontecer é o teste diário derrubá-lo.
- **Correção (mesmo padrão do `track-TIM` dos visitantes):** tabela `/routing/table add name=via-<LINK> fib`; rota padrão nessa tabela pelo gateway do link; mangle `prerouting` marcando `new-connection-mark=from-<LINK>` nas conexões **novas que entram pela interface do link**; mangle `prerouting` com `connection-mark=from-<LINK> in-interface=<LAN do servidor>` fazendo `mark-routing new-routing-mark=via-<LINK> passthrough=no`. Não interfere no tráfego iniciado pela LAN (hairpin continua igual).
- **Como validar sem estar fora do site:** de outro roteador, `/tool fetch url=http://<IP-publico-do-link>:<porta>/ output=user`. Com caminho funcionando a resposta vem em ~1 s (mesmo que seja erro HTTP, como "Status 400"); sem caminho dá "timeout connecting" em ~10 s. Faça a medição antes, durante a inversão do teste e depois.
- **Detector de degradação:** `link-quality-template.rsc` (alerta por e-mail, não troca rota). 10 pings por link a cada 5 min; alerta na 2ª ocorrência de perda ≥ 3/10 ou latência média > 150 ms; aviso de normalização; ignora queda total (isso é do netwatch). Latência medida com `:timestamp` ao redor de cada `/ping count=1` (ver `routeros-gotchas.md`).
