# Malha WireGuard entre sites

## Conteúdo
1. Desenho da malha
2. Clonar a identidade de um gateway
3. Endpoint por DDNS
4. allowed-address e rotas
5. Túnel com parceiro externo (ex.: Assistec)
6. Diagnóstico e riscos

## 1. Desenho

Malha de 3 sites com sub-rede de túnel própria (`10.255.255.0/29`): cada site tem um endereço fixo (Itaguaí .1, Barra .2, Botafogo .3), mesma porta UDP (62555) e um peer para cada um dos outros. Cada LAN é roteada pelo peer correspondente.

- Interface `WG-<SITE>` por site, peers nomeados `WG-<OUTRO>` (nomenclatura consistente facilita script e auditoria).
- `persistent-keepalive` 25 s nos peers da malha (10 s no parceiro externo) para manter NAT/conntrack.
- Porta UDP do túnel liberada na entrada das **duas** WANs (ver `hardening-checklist.md`).
- Rotas por site com comentário `ROTA | site <NOME>` (destino = LAN do site, gateway = IP do túnel do peer).

## 2. Clonar a identidade de um gateway

Para trocar o equipamento sem reconfigurar os outros sites, o novo usa **a mesma chave privada, porta e endereço do túnel**. Os outros sites já têm essa chave pública como peer e não precisam de mudança.

- Copie a chave privada do dump (nunca imprima) e confira que a **chave pública resultante é idêntica**.
- **Só um dos dois equipamentos pode estar online.** Resete/desligue o antigo antes de ligar o novo.
- Sempre rode `last-handshake` nos peers dos outros sites depois da troca (esperado < 2 min).
- Para parceiros externos o ideal é chave nova: foi o que se fez com a Assistec (par de chaves próprio; o parceiro reconfigura o lado dele).

## 3. Endpoint por DDNS (e por quê)

- Endpoint como **IP fixo** quebra quando o IP muda; DDNS do equipamento antigo morre quando ele é resetado (o nome `…sn.mynetname.net` passou a resolver para outro IP).
- Ative `/ip/cloud ddns-enabled=yes update-time=no` no gateway novo, leia `dns-name` e aponte os peers dos outros sites para esse nome (`endpoint-address=<nome>`, porta 62555). O DDNS acompanha o IP da WAN que estiver em uso na hora, inclusive na troca para o secundário.
- Mesmo com endpoint desatualizado, o túnel se recupera quando **o gateway** inicia o contato (os peers aprendem o endpoint por roaming). O risco real é um peer reiniciar antes disso.
- **Limites:** a atualização do DDNS não é instantânea após a troca de link. E para o túnel subir pela WAN secundária, o roteador/modem desse provedor precisa **encaminhar a porta UDP** para o gateway (não dá para verificar daqui).
- Cuidado ao definir `endpoint-address` em outro site: use `/interface/wireguard/peers/set`; o handshake continua se o endereço atual for o mesmo.

## 4. allowed-address e rotas

- Em cada peer: LAN do outro site **+** `/32` do endereço do túnel dele. Ex.: `172.16.1.0/24,10.255.255.2/32`.
- Ao alterar a máscara da LAN de um site, atualize o `allowed-address` **de todos os outros peers** que a anunciam e a rota `ROTA | site <NOME>` (ex.: `192.168.0.0/24` ↔ `/22`).
- NAT: acrescente regras `srcnat accept` entre a LAN e os destinos de VPN (ex.: `10.227.1.0/24`) **antes** do masquerade.
- Fasttrack exclui o tráfego da VPN de parceiro.

## 5. Parceiro externo (Assistec)

- Interface própria (`WG-ASSISTEC`, porta 36336), endereço na sub-rede deles, peer com `allowed-address` = rede do túnel + **nossa LAN** + a LAN deles.
- A LAN do nosso lado só é anunciada na máscara que o parceiro configurou. Se a LAN mudar (/24→/22), o parceiro precisa ajustar o lado dele **e** nós o nosso; aqui o `allowed-address` do peer deles foi mantido em `/24` até confirmarem e depois passou para `/22`.
- Conectividade: ping para o host remoto pode falhar mesmo com túnel de pé (ICMP bloqueado); valide pelo handshake e por uma conexão real.

## 6. Diagnóstico e riscos

- `last-handshake` por peer (deve ser de segundos a poucos minutos com keepalive), `current-endpoint-address` e ping entre LANs (`/ping` por API a partir dos sites).
- Handshake que não completa nos primeiros 5 s após boot é normal; veja o log `wireguard,info` (retries).
- Riscos: dois equipamentos com a mesma chave online; endpoint por IP obsoleto; porta não liberada na WAN secundária; `allowed-address` com máscara velha após mudança de LAN.
