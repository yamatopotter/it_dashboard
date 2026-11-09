# Hardening de produção (checklist)

Aplicado no gateway novo antes de ir para produção, na ordem em que foi feito. Use como lista de verificação para qualquer Mikrotik que entre na rede.

## Conteúdo
- Contas e acesso
- Serviços
- Firewall (entrada, forward, output)
- Relógio e DNS
- Identidade e inventário
- Firmware, arquivos e logs
- Vizinhança e L2
- Itens que ficam abertos de propósito

## Contas e acesso

- Crie a conta de operação do projeto (ex.: `evora`, grupo `full`, como no gateway atual) além do `admin`.
- **Senhas padrão do projeto são provisórias**: marque como pendência a rotação (a API não mostra senha, mas elas aparecem em histórico/docs).
- Remova ou documente contas sem uso; contas de terceiros (ex.: `assistec` no antigo) só existem se houver necessidade.
- Tokens e segredos de integração ficam **só** no script `cfg-webhook`.

## Serviços

- Ligados: `winbox` e `api`, **restritos** a LAN, redes dos sites e túneis (`available-from`): LAN do site, LANs dos outros sites, sub-rede dos túneis, redes de parceiros.
- Desligados: `ftp`, `ssh` (ou restrito), `telnet`, `www`, `www-ssl`, `api-ssl`, `reverse-proxy`.
- Desabilitar: bandwidth-server, UPnP, SOCKS, proxy, IPv6 (se não usado).

## Firewall

**input** (ordem): drop DNS UDP/TCP 53 vindo da WAN → accept `established,related,untracked` da WAN → accept UDP do WG (cada porta) → accept ICMP limitado (`limit=10,20:packet`) → drop do restante da WAN.
**forward:** fasttrack (excluindo VPN de parceiro e `dstnat`) → accept established → drop invalid → drop `new` da WAN sem `dstnat`.
**output:** o par de regras do netwatch (ver `failover-dual-wan.md`).
**NAT:** accept para VPN (ida e volta) antes do masquerade da LAN; **sem port-forward** (RTSP e outros só se realmente necessários e documentados).
Use interface lists `WAN` (física + PPPoE de cada link) e `LAN`.

## Relógio e DNS

- **NTP:** servidores brasileiros e globais (ex.: `a.st1.ntp.br`, `time.cloudflare.com`, `pool.ntp.org`); fuso `America/Sao_Paulo`.
- **Acerte o relógio primeiro** (pelo PC) se estiver muito errado: com horas de diferença, o NTP pode ficar em `waiting`; depois da correção manual e troca dos servidores, sincronizou em ~1 min. Um IP de NTP fixo pode não responder; prefira nomes.
- `ip/cloud update-time=no` quando há NTP.
- DNS: resolvers públicos + dinâmicos; `allow-remote-requests` para a LAN, **bloqueado na WAN**; entradas estáticas para serviços internos.

## Identidade e inventário

- `identity` padronizada: `<SITE>-<MODELO>-GATEWAY` / `SW-<SITE>-<MODELO>`.
- Nome dos WireGuards e rotas: `WG-<SITE>`, `ROTA | site <NOME>`, comentários em regras.
- Anote placa, versão, MACs e papel na documentação do site.

## Firmware, arquivos e logs

- RouterOS e firmware da placa na mesma versão estável (ex.: 7.24.5); reinicie se precisar.
- Remova arquivos antigos do flash (guarde cópia fora): `*.backup`, CAs, `.rsc` de migração.
- Logs: 5000 linhas em memória; disco para `critical,error,warning` e `script` (5×2000 linhas). Sem syslog remoto por enquanto.

## Vizinhança e L2

- `ip/neighbor/discovery-settings` e `tool/mac-server` (`mac-winbox`) só na lista `LAN`.
- Sem MAC-server na WAN.

## Itens que ficam abertos de propósito

- Rotação de senhas do `admin`/`evora`.
- DoH no DNS.
- Syslog remoto/destino de alertas independente do painel.
- Reboot diário só se não colidir com a janela do teste (05:00–06:00).

## Requisito: acesso de gestão a partir de todas as LANs

- **Regra do projeto (definida em 03/11/2026):** todo equipamento deve ser gerenciável a partir das três LANs (Itaguaí 192.168.0.0/22, Botafogo 10.0.0.0/24, Barra 172.16.1.0/24), pelos túneis WireGuard. APs gerenciados por controlador (UniFi, Omada, CAPsMAN) são acessados pelo controlador.
- **Lista padrão de origens** para `winbox`, `api` e `ssh` (se ligado) em todo Mikrotik: `192.168.0.0/22,10.0.0.0/24,172.16.1.0/24,10.255.255.0/29`, mais as redes do Assistec onde já constam (`10.10.11.0/24`, `10.227.1.0/24`). Nunca abrir à internet.
- **Ao restringir um serviço (`available-from`) ou criar regra de entrada, use sempre essa lista**, nunca só a LAN local. Foi assim que o CRS328 do Itaguaí ficou inalcançável das outras LANs.
- **Equipamentos sem gateway padrão** respondem só dentro da própria LAN (caso do switch Intelbras da Barra): confira o gateway ao adicionar qualquer switch ou AP.
- **Switches SwOS** (CSS326) nascem em 192.168.88.1: dê IP de gerência distinto na LAN do site, gateway e origens permitidas das três LANs.
- **Como testar:** ping a partir do IP da LAN do roteador de cada site (`/ping address=X src-address=<IP-LAN>`) e conexão TCP às portas de gestão a partir de um PC; lembre que porta "aberta" não prova acesso (o RouterOS aceita a conexão e derruba a sessão fora de `available-from`).
