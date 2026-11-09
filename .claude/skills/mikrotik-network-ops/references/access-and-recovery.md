# Acesso, dump, reset e recuperação

## Conteúdo
1. Identificar antes de tocar
2. Acessar por API (IP, link-local, MAC)
3. Dump completo para recuperação
4. Reset completo (`reset-configuration`)
5. Transformar um CRS em switch inteligente
6. Backups no equipamento e flash

## 1. Identificar antes de tocar

Leia sempre: `/system/identity`, `/system/resource` (`board-name`, `version`, `uptime`), `/interface/bridge` (MAC) e, se houver WG, a chave pública. Compare com o que o usuário descreveu. Casos reais:

- O gateway novo (bancada) e o antigo (produção) usavam **o mesmo IP 192.168.0.1**, em interfaces diferentes do PC (Ethernet × Wi-Fi). Distinguidos pelo MAC (`Get-NetNeighbor`) e pela placa.
- O PC mudou de rede e o `192.168.0.1` passou a ser outro roteador (outro MAC, gateway CGNAT 100.64.x). A API recusou a conexão — e foi isso que evitou mexer no equipamento errado.
- A identity de um equipamento voltou ao padrão (`CS-Evora`) após reboot diário porque a mudança era só em memória. Use placa + chave WG como segunda confirmação, não só o nome.

## 2. Acessar

- **IP normal:** `RouterOSAPI(host, 8728, user, pass)`; `use_ssl` só se `api-ssl` estiver ativo.
- **Pelo túnel:** o IP do WG do outro site (ex.: 10.255.255.1) funciona enquanto o túnel estiver de pé.
- **Sem IP / recém-resetado:** use o endereço link-local IPv6 na mesma LAN. Formato `fe80::ce2d:e0ff:fe9f:a19c%<ifindex>` (EUI-64 do MAC; no Windows o `%` é o `ifIndex` de `Get-NetAdapter`). `socket.create_connection` aceita o scope id. O MAC e o link-local aparecem em `/ip/neighbor` de qualquer Mikrotik na mesma L2. O login com a senha configurada funcionou direto; senha vazia (`admin` sem senha) é o padrão de um reset `no-defaults`.
- **MAC-Telnet/MAC-Winbox:** só pelo Winbox (não há cliente neste ambiente). Útil se nem link-local funcionar.
- Depois de configurar um IP no equipamento, mude para ele e reverifique antes de restringir serviços.

## 3. Dump completo para recuperação

Gere um JSON só de leituras com a estrutura `{_meta, menus, errors}`:

- `_meta`: data, IP de origem, identity, versão, placa.
- `menus`: um item por caminho (`/ip/dhcp-server/lease`, `/interface/wireguard`, `/interface/wifi/configuration`, `/system/script`...), ~140 menus lidos por `print`.
- `errors`: menus inexistentes na placa (ex.: `/caps-man/*` quando só há o pacote `wifi`; `/system/ups`).
- Grave um `.sha256` ao lado. Salve em pasta ignorada pelo git (`.mikrotik-migration/`).
- **Contém segredos** (chaves privadas WG, senhas de e-mail/Wi-Fi/PPP). Não compartilhe nem versione.
- **Limites:** a API não expõe a senha dos usuários do RouterOS → contas precisam ser recriadas. O dump não substitui um `.backup` binário; gere o `.backup` só se houver flash livre.
- O `scripts/mikrotik_migrate.py` já faz coleta somente-leitura com mascaramento (`SECRET_KEYS`) para planejamento; o dump de recuperação mantém os segredos de propósito.

## 4. Reset completo

Comando: `/system/reset-configuration no-defaults=yes skip-backup=yes run-after-reset=<arquivo.rsc>`.

- `no-defaults=yes` → equipamento volta sem IP, sem bridge, `admin` sem senha.
- `run-after-reset` aponta um `.rsc` no flash que roda uma vez após o reset. Crie o arquivo por API com `/file/add name=... contents=...` (conferir o conteúdo lido de volta), valide a sintaxe com um script temporário que faz `:parse [/file get x contents]` e só então resete.
- **Não confie que o script pós-reset rodou**: se o usuário resetar por Winbox/botão, o arquivo pode não executar e o equipamento volta com a **configuração padrão** do modelo (no CRS328: bridge `BRIDGE_LOCAL` com todas as portas, sem IP). Verifique o estado real depois.
- O script pós-reset deve ser curto e completo para operar offline: bridge + portas, IP de gerência, senha do admin, identity, NTP, serviços restritos, PoE, e remover o próprio arquivo no final.
- Reset reinicia o equipamento: PoE cai 1–2 min (APs, câmeras e até outro Mikrotik alimentado por ele reiniciam).

## 5. CRS como switch inteligente

Estado alvo (testado no CRS328-24P-4S+ RouterOS 7.24):
- Uma bridge (RSTP, sem VLAN filtering, `hw=yes`) com **todas** as portas (ether1–24 e sfp-sfpplus1–4). Confira `portas na bridge == portas ethernet`.
- Um IP de gerência na bridge (ex.: faixa "dispositivos importantes" do DHCP), gateway e DNS apontando para o roteador, **reserva DHCP/endereço fixo documentado** para não colidir.
- PoE `auto-on` em todas as portas (a API de PoE é `/interface/ethernet/poe`; passe todos os nomes em `numbers`).
- NTP + fuso `America/Sao_Paulo`; lista de interfaces `LAN` contendo a bridge; neighbor discovery e `mac-server`/`mac-winbox` só na `LAN`.
- Serviços: desabilitar telnet, ftp, www, www-ssl, api-ssl, reverse-proxy; `ssh`, `winbox`, `api` com `available-from` = LAN. Se a LAN for /22, o `available-from` e a máscara do IP do switch também precisam ser /22.
- Sem firewall nem NAT (não há roteamento no switch); identity padronizada (`SW-<SITE>-<MODELO>`).
- Senha do `admin` trocada; sem contas sobrando.

## 6. Backups e flash

- CRS326/CRS328 têm **16 MB de flash**; no Botafogo restavam ~756 KB. Backups, CAs e arquivos antigos quebram a gravação da config quando o flash enche. Guarde backups fora do equipamento.
- Remover arquivos do flash pode apagar o `log.0.txt` ativo (o RouterOS recria).
- Ao limpar, copie antes para uma pasta local (`mk_<modelo>_backups_<data>/`).
