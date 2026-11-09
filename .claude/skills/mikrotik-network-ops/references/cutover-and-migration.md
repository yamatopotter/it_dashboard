# Troca de equipamento (cutover) e migração

## Conteúdo
1. Princípios
2. Plano de portas
3. Sequência de cutover
4. Rollback
5. Riscos comuns e como mitigar
6. Exemplo real: CRS328 → RB5009 (Itaguaí)

## 1. Princípios

- **Prepare tudo offline** no equipamento novo (hardening, DHCP, firewall, scripts, WG clonado), valide na bancada e só então troque.
- **Dump + snapshot antes de mexer** no antigo (ver `access-and-recovery.md`).
- **Defina o que acontece com o antigo** antes de começar: resetar para virar switch (CRS) ou desligar. A chave WG e o IP não podem existir nos dois ao mesmo tempo.
- **O cutover cabe em uma janela com alguém no local**: depende de cabos (WAN, PoE) e do reset do antigo (que corta o acesso remoto).
- Comunique impacto sem jargão: o que cai, por quanto tempo, quem é afetado.

## 2. Plano de portas

- Mapeie as WANs para portas físicas e a LAN para o restante, considerando **PoE-in**: o RB5009 só aceita PoE na ether1; no Itaguaí ele foi alimentado por uma porta PoE do switch antigo (CRS328-24P) → ether1 ficou na LAN e as WANs foram para ether7 (PPPoE) e ether8 (secundário).
- Portas LAN em uma bridge única com o switch; confirme `portas na bridge == portas`.
- Atualize nomes (`ether7-WAN-7LINK`, `ether8-WAN-RJNET`) e as interfaces list `WAN`/`LAN`.

## 3. Sequência de cutover

1. Equipamento novo pronto e validado (inclusive `:parse` dos scripts e checagem de segredos).
2. Fixe IP/identidade final no novo (somente leitura no antigo ainda).
3. **Resete o antigo** (ou desligue) e deixe-o como switch (`access-and-recovery.md`).
4. Ligue o novo, mova os cabos das WANs, conecte o novo ao switch.
5. Confirme: PPPoE conectado, rotas, DHCP respondendo, handshakes WG, APs reentrando no CAPsMAN.
6. Reinicie o novo uma vez para validar persistência (ver `validation-checklist.md`).
7. Atualize os outros sites (endpoints por DDNS, rotas e allowed-address se a LAN mudou).

## 4. Rollback

- Dump do antigo + `before_*.json` das mudanças em lote.
- Reservas e NAT são reversíveis por script (voltar os `.id` anteriores).
- Voltar o antigo por reset exige restaurar de um `.backup`/dump: **sem `.backup`, a recuperação é manual** a partir do JSON (contas e senhas de usuário precisam ser recriadas).
- Mantenha o antigo fisicamente disponível até a validação final.

## 5. Riscos comuns

| Risco | Mitigação |
|---|---|
| Chave WG duplicada online | Resetar/desligar o antigo primeiro |
| Clientes com lease da faixa antiga perdem internet | Manter a mesma máscara (/22) ou criar rede de transição + NAT |
| Aplicações com IP fixo (NVD/DVR, impressoras, WatchIT) | Levantar antes; manter reservas nos IPs antigos |
| Port-forward (RTSP) esquecido | Inventariar `dstnat` do antigo e decidir caso a caso |
| WG pela WAN secundária não sobe | Confirmar encaminhamento de porta no modem/roteador do provedor |
| DDNS morto do antigo | Habilitar DDNS no novo e trocar endpoints |
| APs sem configuração | Garantir configs do CAPsMAN antes de os APs entrarem; ajustar por rádio |
| Teste diário colide com reboot | Janela 05:00–06:00 livre |
| Painel de monitoramento fora do ar | E-mail/syslog como alerta independente |
| Flash cheio no switch | Limpar e não guardar backups no equipamento |

## 6. Exemplo real: CRS328 → RB5009 (Itaguaí)

- O CRS328 ficou como switch inteligente e alimenta o RB5009 por PoE.
- WireGuard clonado (mesma chave/porta/endereço); endpoints dos peers de Botafogo e Barra migraram do DDNS do antigo → IP → DDNS do novo.
- DHCP: 80 reservas; primeiro reorganizadas por categoria em /24, depois **revertidas** para o /22 original por MAC; NAT e serviços ajustados.
- Failover/teste diário padronizados (05:00–06:00) em Itaguaí e Botafogo; Barra pendente.
- Rotas de site em Botafogo/Barra já estavam em `192.168.0.0/22`; nada a ajustar quando se voltou ao /22.
- Tudo documentado em `.mikrotik-migration/relatorios/mikrotik-itaguai-rb5009.md` (pasta ignorada pelo git) (gerado do estado real; revisar quando a LAN mudar).
