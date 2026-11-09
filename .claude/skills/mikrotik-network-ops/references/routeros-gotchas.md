# Peculiaridades da API e do RouterOS 7.24

Lista de armadilhas encontradas ao automatizar por API. Cada item traz o sintoma e o que fazer.

## Conteúdo
- API e leitura
- Escrita e comandos
- Firewall, interfaces e rotas
- Scripts e agendamentos
- Rede local (Windows) ao operar

## API e leitura

- **Campos têm nomes por versão.** Em 7.24 os serviços usam `available-from` (não `address`). Em dúvida, imprima a linha inteira antes de escrever.
- **`/ip/service` traz entradas dinâmicas** (conexões API ativas, `ntp`, `btest`, `discover`) com o mesmo nome (`api` aparece duas vezes). Filtre `dynamic != "true"` antes de montar um dicionário por nome, ou o `set` vai cair numa entrada dinâmica e falhar com `this is configured elsewhere`.
- **Booleans e vazios:** a API devolve `"true"`/`"false"` como texto e omite campos vazios/sem valor. Use `.get()`.
- **Dependência de nome com espaço:** interfaces como `ether24-DVR 32 Canais` funcionam, mas scripts novos devem evitar espaços.
- **`print` sem filtro pode ser enorme** (log, leases): filtre no cliente ou use `.proplist`.
- Menus que podem não existir (`/caps-man/*` com pacote `wifi`, `/system/ups`, `/interface/ethernet/poe` em RB sem PoE-out) levantam erro: trate como "não aplicável".
- **`/interface/wifi/capsman/remote-cap`** é o caminho dos CAPs; `/interface/wifi/remote-cap` não existe.

## Escrita e comandos

- Use `=numbers=<nome ou .id>` para `set` com vários alvos; `=.id=*X` para um alvo.
- Para **limpar** um campo use `/…/unset` com `=value-name=<campo>`; passar vazio em `set` nem sempre apaga.
- `/file/add name=x contents=...` aceita conteúdo multilinha; leia de volta para conferir.
- **Idempotência:** antes de `add`, procure o objeto por nome/comentário; evita duplicar regras de firewall e agendamentos.
- `/system/reboot` e `/system/reset-configuration` derrubam a conexão; trate a exceção e reconecte com espera.
- **Trocar reservas DHCP de IP entre si** gera `already have static lease with this IP address`. Faça em duas passadas (ou remova leases dinâmicos que ocupam o IP e tente de novo).
- Mudar o endereço de uma lease estática não derruba o cliente na hora; ele migra quando renovar.

## Firewall, interfaces e rotas

- **Regra que cita uma interface PPPoE** (`out-interface=pppoe-X`) fica `invalid` ("pppoe-X not ready") enquanto a sessão está caída. Para o OUTPUT do netwatch use um par: `accept` com a interface PPPoE + `drop` genérico por destino. O drop vale sempre; o accept valida quando a sessão sobe.
- **Netwatch e rotas /32:** fixe o alvo do ping no link certo com uma rota `/32` + regra de OUTPUT que impede vazamento pelo outro link; senão a queda fica mascarada.
- **Fasttrack:** exclua tráfego de VPN/site-a-site (ex.: Assistec) e conexões com `dstnat`; em caso de lentidão em aplicações específicas, desabilitar a regra de fasttrack é o primeiro teste.
- **Interface lists:** crie `LAN` e `WAN` e use nas regras; o PPPoE e a física do mesmo link devem estar na `WAN`.
- **Distância e `check-gateway=ping`:** use rotas padrão com distâncias 1/2 por comentário (`WAN-<PRIMARIA>`, `WAN-<SECUNDARIA>`) para os scripts encontrarem por `comment`.
- `ip/cloud` com `update-time=yes` muda o relógio; desligue se há NTP.
- **WAN com `dhcp-client`:** antes de um `drop` geral na entrada da WAN, aceite `udp src-port=67 dst-port=68` ou a renovação do lease falha e a WAN cai horas depois. Aceite também o WireGuard (UDP da malha) e ICMP com `limit`.
- **WAN atrás de CPE em DMZ recebe lixo da internet.** Em Botafogo a 7LINK entrava com ~37 Mbps / 3.900 pps de UDP de ~200 origens para o IP do roteador (antes o RouterOS respondia ICMP a cada um). O `drop` em silêncio na `input` resolve para o roteador (CPU 23–30% no CRS326), mas o link continua saturado: a correção é no CPE (tirar a DMZ e encaminhar só a porta do WireGuard) ou com o provedor. Meça com `/interface/monitor-traffic` e amostre com uma regra `log` temporária com `limit`, removendo-a em seguida.

## Scripts e agendamentos

- **Globais não sobrevivem ao reboot.** O padrão que funcionou: um script `cfg-webhook` define as globais (URLs/tokens) e **cada script de link começa com `/system script run cfg-webhook`** seguido de `:global X` para as variáveis. Um scheduler `startup` extra é redundante, mas inofensivo.
- **`:parse` NÃO acusa erro de sintaxe** (no 7.23/7.25 aprovou `:put )(`): não use como validador. Valide assim: crie um script temporário com `:error "VALIDADO"` na **primeira linha** seguido do código candidato e rode com `/system/script/run =number=<nome>` (a API usa `number`, não `numbers`). O RouterOS compila o script inteiro antes de executar: se voltar `VALIDADO`, a sintaxe está ok; `syntax error (line..)` ou `expected closing brace` indica o problema. Faça sempre um controle negativo (código quebrado de propósito deve ser rejeitado) e remova os temporários.
- **Scripts criados pela API saem com `policy=""`** (sem permissão alguma): informe `=policy=read,write,test,sensitive` ao criar, senão o scheduler não consegue rodar rota/e-mail/fetch. `/system/script/set` só do `source` preserva a policy existente.
- **`/tool fetch` iniciado pelo roteador sai com o IP do túnel** quando o destino está atrás de um WireGuard (ex.: 10.255.255.3), e o servidor remoto pode não aceitar essa origem (ping passa, TCP dá `timeout connecting`). Fixe `src-address=<IP da LAN>` no `fetch`. Em Botafogo isso fez o WatchIT ficar sem receber os eventos de link por tempo indeterminado, enquanto os e-mails saíam normalmente.
- Política dos scripts de failover: `read,write,test,sensitive` (precisam de `fetch`, e-mail, rotas e ping).
- `:delay` bloqueia o script (os testes de 50 min rodam em script único com `:delay`); não chame no mesmo scheduler algo que precise terminar rápido.
- `/tool fetch ... keep-result=no` para chamadas de webhook; envolva em `:do {…} on-error={…}` e logue falha.
- **E-mail:** `/tool/e-mail` com servidor/porta/TLS configurados; faça 3 tentativas com `:delay` entre elas (o primeiro envio logo após boot pode dar timeout).
- **Regra de log com vários tópicos exige todos na mesma mensagem.** `topics=critical,error,warning` → disk **nunca casa** (nenhuma mensagem tem os três) e o disco só recebe o que outra regra pega. Crie **uma regra por tópico**: `critical`, `error`, `warning` e `script`, todas com `action=disk`. Valide gerando um evento `critical` inofensivo (login de teste com usuário inexistente) e lendo o `/file` (`contents` vem inline em arquivo pequeno).
- **Dimensione o log em disco pelo tamanho médio medido (~90–170 B por linha, 1.000 linhas ≈ 100–170 KB)**: switches/gateways de 16 MB (CRS326/328) com `disk-lines-per-file=500` × `disk-file-count=2` (teto ~120 KB); RB5009 (1 GB) 1.000 × 3. Não grave `info` em disco: login/logout das integrações (`system,info,account`) são 70–90% do volume. Falha de login repetida de um integrador (ex.: WatchIT com credencial velha) enche esse log: corrija a origem.

## Rede local (Windows) ao operar

- O PC pode ter duas interfaces na mesma L2 (Ethernet e Wi-Fi) vendo o mesmo IP; escolha o alvo por MAC.
- `ipconfig /renew` pode imprimir erro e ainda assim renovar; confirme com `Get-NetIPAddress`.
- Scripts Python grandes por `bash -c`/heredoc quebram com aspas; escreva em arquivo (Write) e rode. `python -I` não importa módulos locais.
- Em PowerShell 5.1 não existe `&&`; use `;` com checagem de `$?`.

## `/ping` em script: valor de retorno só existe fora da API

- `:if ([/ping address=X count=1] = 1)` funciona em scripts disparados pelo **netwatch ou pelo agendador**, mas retorna **nil** quando o script é executado por `/system/script/run` via API (inclusive `as-value`). Para testar um script que usa o resultado do ping, dispare-o por um agendador de uso único (`/system/scheduler add start-time=<agora+6s> interval=0s on-event="/system script run X"`) e leia o `/log`.
- `/tool flood-ping` é bloqueado pelo device-mode ("not allowed by device-mode"): não use em scripts. Para latência, meça com `:timestamp` antes e depois de cada ping e use `:tonsec` (÷1.000.000 = ms).
- Funções em script (`:local f do={...}`) recebem os parâmetros pelos nomes passados na chamada (`[$f h="x" i="y"]`) e **não enxergam variáveis locais de fora**: passe tudo como parâmetro ou use globais.
- `:set nome` sem valor dá erro de sintaxe: para apagar uma global use `/system/script/environment/remove`.
- O `/log` repete a linha de cada mensagem quando há duas ações de log para o mesmo tópico (memória e disco); ao filtrar logs de teste, procure por `startswith("[TAG]")` para não pegar o eco do código do script na linha "new script added".
- Cuidado ao consultar e-mails enviados: o `/log` mostra `sent <assunto>`; falha aparece como `Error sending e-mail`.
