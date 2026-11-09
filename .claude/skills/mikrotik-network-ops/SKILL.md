---
name: mikrotik-network-ops
description: Operação, migração, hardening e validação de roteadores/switches Mikrotik (RouterOS 7) via API — gateway com dual-WAN e failover (PPPoE + link secundário, netwatch, teste diário com watchdog), malha WireGuard entre sites, DHCP/LAN (/22↔/24, reservas por MAC), CAPsMAN/Wi-Fi (pacote wifi), switch inteligente (CRS), reset e recuperação, cutover entre equipamentos. Use SEMPRE que a tarefa envolver Mikrotik, RouterOS, CRS/RB/cAP, Winbox, WireGuard entre filiais, failover de link, DHCP do site, CAPsMAN, "resetar/migrar/configurar o mk", dump ou backup de roteador, ou conectar um novo dispositivo/site à rede — mesmo que o usuário não diga "Mikrotik" explicitamente (ex.: "o link caiu", "troca do gateway do Itaguaí", "valida a rede da filial").
---

# Operação de redes Mikrotik (RouterOS 7)

Conhecimento acumulado na migração do gateway do Itaguaí (CRS328 → RB5009), nos ajustes de Botafogo e Barra e na malha WireGuard entre eles. Os exemplos citam esses sites, mas as regras valem para qualquer Mikrotik novo que entrar na rede: trate nomes, IPs e portas de exemplo como parâmetros, nunca como verdade.

## Regras de operação (leia antes de qualquer comando)

Estas regras existem porque cada uma foi aprendida na prática. O custo de errar é derrubar a internet, o Wi-Fi ou a ponte entre sites de uma empresa inteira.

1. **Confirme qual equipamento você está tocando antes de mudar qualquer coisa.** Leia `identity`, `board-name`, MAC e, se houver, a chave pública do WireGuard. O mesmo IP (192.168.0.1) já apareceu em dois equipamentos diferentes, e depois em uma rede inteira diferente (o PC estava em outro local). Se a identidade não bate, pare.
2. **Faça um dump/snapshot antes de resetar, trocar ou reorganizar.** Salve em JSON (só leituras) e guarde fora do git — o arquivo contém chaves privadas e senhas. Ver `references/access-and-recovery.md`. Guarde também o estado "antes" de cada mudança em lote (leases, NAT, serviços) para poder voltar.
3. **Nunca resete nem desligue um gateway ativo sem ter o substituto pronto e o plano de troca de cabos combinado.** Resetar derruba internet, DHCP e túneis; o acesso remoto pelo túnel também some.
4. **Uma chave WireGuard só pode estar online em um equipamento.** Ao clonar a identidade de um gateway para outro, o antigo precisa estar desligado/resetado antes de o novo subir.
5. **Nunca imprima nem grave em documentação senhas, chaves privadas, tokens ou passphrases.** Mascare na saída (`***`) e deixe os segredos só nos lugares que já os guardam (ex.: um script `cfg-webhook`, o `.env`, o dump fora do git).
6. **Prefira mudanças reversíveis e incrementais; verifique depois de cada uma.** Leia de volta o que gravou (a API aceita e ignora campos errados com frequência).
7. **Valide a sintaxe dos scripts RouterOS no próprio equipamento antes de agendar** (`:error "VALIDADO"` na 1ª linha de uma cópia; `:parse` não serve, ele não acusa erro — ver `references/routeros-gotchas.md`). Um erro de sintaxe num script de failover só aparece na hora da queda. Scripts criados pela API precisam de `policy=read,write,test,sensitive` explícita.
8. **Uma coisa por vez, no horário certo.** Mudanças que podem cortar o acesso (IP da bridge, máscara, serviços, firewall de entrada) são feitas por último, com o caminho de volta garantido (outro IP, MAC-Winbox, link-local IPv6).
9. **Registre o que NÃO foi testado.** Falhas de link, teste diário e túnel pela WAN secundária costumam ficar sem validação real; diga isso claramente em vez de declarar "pronto".
10. **Fluxo do repositório (CLAUDE.md):** uma branch por pedido, esperar a validação do usuário antes de commitar, atualizar changelog/relatórios depois do merge.

## Fluxo padrão de uma tarefa

1. **Identificar** o equipamento e o papel dele (gateway, switch, AP/CAP, site remoto). `references/access-and-recovery.md`
2. **Ler o estado** (somente leitura) e comparar com o desejado: rede, DHCP, firewall/NAT, rotas, WG, serviços, usuários, scripts/schedulers.
3. **Snapshot/dump** do que vai mudar.
4. **Planejar** a ordem (primeiro o que não corta acesso; por último o que corta) e dizer ao usuário o impacto, em linguagem direta.
5. **Aplicar** em passos pequenos, lendo de volta.
6. **Validar** com a checklist de `references/validation-checklist.md` (inclui o que testar após reboot).
7. **Documentar** o estado real (gerado do equipamento, sem segredos) e listar pendências/riscos. **Toda documentação e todo relatório gerado localmente vai em `.mikrotik-migration/relatorios/`** (pasta ignorada pelo git); nunca em `docs/` nem em outra pasta rastreada.

## Como acessar o equipamento

- **API binária (porta 8728)** com o cliente em Python puro do repositório: `scripts/mikrotik_validate.py` (classe `RouterOSAPI`, `talk([...])`). O helper `scripts/ros_helpers.py` desta skill embrulha conexão por prefixo do `.env`, snapshot, busca de referências e impressão mascarada.
- **Credenciais:** variáveis do `.env`, no padrão `MIKROTIK_<PREFIXO>_HOST/_PORT/_USER/_PASSWORD/_USE_SSL`, ou listas `MK_ARRAY`/`MK_USER`/`MK_PASSWORD` (mesmo índice = mesmo equipamento). Nunca copie valores para a resposta.
- **Equipamento sem IP** (recém-resetado): a API também responde por IPv6 link-local (`fe80::<mac-eui64>%<ifindex>`) na mesma LAN. Descoberta: `/ip/neighbor` de um vizinho já configurado mostra o MAC, a placa e o link-local.
- **Sites remotos** (Botafogo 10.0.0.1, Barra 172.16.1.1) são alcançados pelos túneis; se o túnel cair, perde-se o acesso — avise antes de mexer em WG/rotas.

## Onde está cada assunto (leia só o que precisar)

| Assunto | Arquivo |
|---|---|
| Acesso, dump, reset, `run-after-reset`, switch inteligente, link-local | `references/access-and-recovery.md` |
| Peculiaridades da API/RouterOS 7.24 que quebraram scripts | `references/routeros-gotchas.md` |
| Dual-WAN, netwatch, teste diário de link, watchdog, alertas, webhooks | `references/failover-dual-wan.md` |
| Malha WireGuard, clonar identidade, DDNS, endpoints, allowed-address | `references/wireguard-mesh.md` |
| DHCP por categoria, reservas por MAC, mudar /24↔/22, clientes antigos | `references/dhcp-lan-design.md` |
| CAPsMAN (pacote wifi), provisionamento, rádios, SSIDs | `references/capsman-wifi.md` |
| Hardening de produção (checklist) | `references/hardening-checklist.md` |
| Troca de equipamento (cutover), ordem, rollback, riscos | `references/cutover-and-migration.md` |
| Validação pós-mudança/pós-reboot e o que costuma ficar sem teste | `references/validation-checklist.md` |
| Placas, portas, PoE, limites de flash | `references/hardware-notes.md` |

## Armadilhas mais caras (resumo)

- Regra de firewall que cita interface PPPoE fica **inválida** com a sessão caída → use par accept+drop por IP.
- Globais do RouterOS **somem no reboot**; scripts que dependem delas precisam recriá-las (rodar o script de configuração no início de cada script).
- Ao mudar a máscara da LAN (/24↔/22), atualize **juntos**: endereço da bridge, rede do DHCP, pool, NAT (todas as regras), `available-from` dos serviços, allowed-address do WG, rotas dos outros sites e o IP/máscara do switch.
- Reservas DHCP trocando de IP entre si dão "already have static lease": aplique em duas passadas.
- `/ip/service` aparece duplicado (entrada dinâmica de conexão API): filtre `dynamic != true`.
- `provision` do CAPsMAN pode não fazer nada com interfaces `cap-wifiN` já criadas: configure por rádio.
- Teste diário de failover: janela fixa fora do expediente (05:00–06:00), watchdog que restaura a prioridade, e **nenhum reboot agendado dentro da janela**.
- Flash de 16 MB (CRS326/328) enche fácil: não guarde backups/CAs lá; flash cheio quebra a gravação da config.
- WatchIT/webhook desligado não pode ser a única forma de alerta: mantenha e-mail (ou syslog) independente.

## Ferramentas relacionadas no repositório

- `scripts/mikrotik_validate.py` — cliente API + auditoria de boas práticas (identidade, serviços, usuários, NTP, DNS, firewall).
- `scripts/mikrotik_migrate.py` — coleta somente-leitura do equipamento antigo, plano de migração e cutover assistido.
- `scripts/mikrotik_rebuild.py` — reconstrução do equipamento novo (bootstrap `.rsc` + resto por API).
- `scripts/test_mikrotik_migrate.py` — testes do planejador.
- `.mikrotik-migration/relatorios/mikrotik-itaguai-rb5009.md` (pasta ignorada pelo git) — exemplo de documentação gerada do estado real do equipamento.
- `.mikrotik-migration/` — dumps e snapshots (ignorado pelo git; contém segredos).
