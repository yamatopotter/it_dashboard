# Notas de hardware

## Conteúdo
- Modelos já usados
- RB5009UG+S+
- CRS326 / CRS328
- cAP ac (APs)
- CSS326 (SwOS)
- PoE e energia

## Modelos já usados

| Papel | Modelo | Observações |
|---|---|---|
| Gateway Itaguaí (novo) | RB5009UG+S+ (RouterOS 7.24.5) | 8×GbE + SFP+; PoE-in só na ether1 |
| Switch Itaguaí | CRS328-24P-4S+ | 24×GbE PoE-out + 4 SFP+; flash 16 MB |
| Gateway Botafogo | CRS326 (identity `EXACTA-CRS326-GATEWAY`) | flash 16 MB quase cheio |
| Gateway Barra | RB5009 (`VERTICCE-RB5009-GATEWAY`) | visitantes isolados e roteados pela TIM |
| APs | cAP ac `RBcAPGi-5acD2nD` | IPQ4019, 2 rádios; no CAPsMAN `wifi` |
| Switch simples | CSS326-24G-2S+ (SwOS 2.10) | aparece nos vizinhos como 192.168.88.1; sem RouterOS |

## RB5009UG+S+

- **PoE-in somente na ether1** (não existe menu `/interface/ethernet/poe` de saída). Para alimentar por um switch PoE, ligue a ether1 ao switch.
- Plano usado: ether1–6 + SFP+ na LAN, ether7 = WAN PPPoE (7Link), ether8 = WAN secundária (RJNet).
- Roteamento forte, fasttrack disponível; mais folga de CPU/flash que o CRS.

## CRS326 / CRS328

- São **switches com RouterOS**: roteamento por software é fraco; fasttrack/hardware offload funciona só para L2.
- **Flash de 16 MB**: pouco espaço livre; evite backups locais, certificados e arquivos temporários.
- CRS328-24P-4S+: PoE-out `auto-on` por porta; reiniciar corta energia dos dispositivos PoE (APs, câmeras, outro Mikrotik).
- Config padrão após reset: bridge `BRIDGE_LOCAL` com todas as portas, sem IP; com `no-defaults` não há bridge nenhuma.

## cAP ac

- Estado do CAP mostra `AP 1A COZINHA@<MAC>` etc. como identidade; o nome da interface no controlador é `cap-wifiN`.
- Rádios: `2ghz-g/n` e `5ghz-a/n/ac`; país `Brazil`, instalação `indoor`.
- IPs antigos (192.168.1.x) permanecem até o DHCP renovar; não impedem o CAPsMAN.

## CSS326 (SwOS)

- Não responde à API do RouterOS; gerência por navegador (IP padrão 192.168.88.1). Se aparecer duplicado na rede (dois CSS no mesmo 192.168.88.1), é normal para SwOS sem IP configurado, mas gera conflito: atribua IPs distintos ou ignore.

## PoE e energia

- Quem alimenta quem importa: reiniciar um switch PoE reinicia APs, câmeras e outros Mikrotik alimentados por ele. Planeje janelas de reset/reboot.
- Verifique `poe-out=auto-on` após reset de um CRS PoE.

## Flash do CRS326 (Botafogo): apagar arquivo na raiz não libera flash

- Em 03/11/2026 o CRS326 tinha 0,78 MB livres de 16 MB. Apagar `*.backup` e `*.rsc` da raiz liberou **0 bytes**: esses arquivos ficam na RAM. Só `flash/…` conta como flash (liberou ~50 KB).
- O consumo real é dos pacotes: `routeros` (12 MB) + `wireless` (1,9 MB). Dezenas de pacotes opcionais aparecem desabilitados na lista (somam 41 MB, mais que o flash), então não são prova de que ocupam flash.
- Para ganhar espaço de verdade: desinstalar `wireless` (CRS326 não tem rádio) e os opcionais, o que exige reboot em janela combinada. Medir `free-hdd-space` antes e depois; não prometa um número.

## Atualizar SwOS (CSS326/CRS em modo SwOS) por terminal

Aprendido em 06/11/2026 nos 2 CSS326 do Itaguaí (2.10 → 2.18, config idêntica depois). Detalhes do que é o equipamento e do que falta nele ficam na memória do projeto.

- **Fluxo da própria interface web** (ler `engine.js`): `POST /pboot` com corpo `*` (`Content-Type: text/plain`) precisa devolver 200 → `POST /upgrade` multipart com o arquivo no campo `f` (a UI online usa o campo `blob`) → o campo `upgr` de `/sys.b` vira `0x01` (gravado, versão ainda antiga) → `POST /reboot` com corpo `*`. O navegador é quem baixa o firmware; o switch **não precisa de internet**.
- **Firmware:** `http://upgrade.mikrotik.com/swos2/<modelo>/LATEST` dá a versão e `.../swos-<modelo>-<versão sem build>.bin` o arquivo (CSS326: modelo `css326`, 71.888 bytes na 2.18). `CHANGELOG` no mesmo diretório. O caminho muda por modelo (`css326-24g-2s+` dá 404).
- **Auth:** HTTP **digest**, usuário `admin`, senha vazia no padrão de fábrica. `curl --digest -u admin: --compressed` (as respostas vêm em gzip; sem `--compressed` parece "binário").
- **Alcançar sem IP no PC:** num CRS vizinho, IP temporário `192.168.88.2/24` na bridge + ARP estático do `192.168.88.1` para o MAC alvo (resolve IP duplicado) + `/ip/socks` v4 ligado só durante o trabalho; `curl --socks4 <ip-do-crs>:1080`. Desligar o SOCKS e remover os temporários no fim. A permissão para ligar o SOCKS precisa ser dada explicitamente pelo usuário.
- **Faça backup antes** (`GET /backup.swb`); se vier vazio (0 bytes), salve as páginas `vlan/lacp/host/snmp/rstp/fwd/link/acl/sys/pwd.b` e **não siga** sem um registro. Depois compare só os campos de configuração (as páginas ganham campos novos na versão nova).
- **Reinício leva ~30 s.** O IP muda: o SwOS novo pegou DHCP (192.168.0.x) em vez de ficar em 192.168.88.1; procure o novo IP pelos vizinhos (`/ip/neighbor`) em vez de insistir no antigo. Em `grep` de `sys.b`, `mac:` também casa `rmac:` (use `[{,]mac:`).
