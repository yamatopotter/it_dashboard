# Validação pós-mudança e pós-reboot

## Conteúdo
1. Checklist pós-reboot do gateway
2. Checklist por mudança
3. Como reportar (inclusive o que não foi testado)

## 1. Checklist pós-reboot do gateway

Reinicie o equipamento uma vez após a configuração e confira (todos por API, somente leitura):

- **Equipamento:** `identity`, versão, relógio, `ntp client status=synchronized`.
- **WAN:** `pppoe-client running`, IP; rotas padrão (`WAN-<PRI>` ativa distância 1, `WAN-<SEC>` reserva); netwatch dos dois links `up`.
- **LAN:** IP da bridge e máscara; `dhcp-server/network`, pool, contagem de reservas (esperado = total) e leases `bound`.
- **NAT/firewall:** regras `srcnat` com a máscara certa; fasttrack ativo; regras de input/forward na ordem esperada.
- **WG:** interfaces `running`, `last-handshake` por peer, ping para os outros sites e para um host da LAN deles (ex.: um AP).
- **CAPsMAN:** `remote-cap` (quantos APs), interfaces `cap-wifiN` configuradas e `disabled=false`, `registration-table` > 0.
- **Agendamentos:** schedulers esperados (teste diário, watchdog, startup).
- **Serviços:** só `winbox` e `api` com `available-from` correto.
- **Logs:** `/log` desde o boot; procure `error`/`critical`. Quedas e retornos `[FAILOVER]` no boot e e-mails que falham por timeout logo após o boot são normais; falha de webhook é problema de destino (painel), não do equipamento.
- **Conectividade:** ping 8.8.8.8, e para os sites e hosts internos.

## 2. Checklist por mudança

| Mudança | Verificar depois |
|---|---|
| IP/máscara da bridge | acesso por IP novo; DHCP; NAT; serviços; switches; WG de outros sites |
| Reservas DHCP | contagem e IP por MAC; dispositivos (ping) |
| Firewall/NAT | tráfego LAN → internet; VPN |
| WG endpoint/allowed-address | `last-handshake` e ping entre LANs nos **dois** lados |
| Scripts/schedulers | `:parse`; execução curta; watchdog em estado normal |
| CAPsMAN | `remote-cap`, `cap-wifiN`, clientes |
| Reset de switch | IP responde; portas na bridge; PoE; serviços restritos |
| NTP/relógio | `status` e hora comparada ao PC |

## 3. Como reportar

- Separe claramente: **validado**, **não testado** e **riscos conhecidos**. Um percentual de "sucesso" só tem sentido com essa separação; os caminhos de falha pesam mais.
- Itens que historicamente ficam sem teste real: queda do primário, secundário assumindo/voltando, WG pela WAN secundária, primeira execução do teste diário (aguardar o e-mail do dia seguinte), watchdog com teste interrompido, dispositivos que guardam IP.
- Para cada item aberto, diga **o que falta** e **quem pode fazer** (você no equipamento, o usuário no local, o provedor).
- Não simule quedas de link em produção sem autorização explícita do usuário.
