# DHCP e desenho da LAN

## Conteúdo
1. Faixas por categoria (proposta que foi analisada)
2. Reservas por MAC e remapeamento
3. Mudar a máscara (/22 ↔ /24): checklist
4. Clientes e aplicações que guardam IP
5. Lições da decisão /24 → /22

## 1. Faixas por categoria

Proposta analisada para o Itaguaí (/24): importantes 0.2–0.10 (roteadores, ponto, servidores, NVDs, DVRs), câmeras 0.11–0.100 (o usuário escreveu 0.10–0.100: **sobreposição**, corrigir), impressoras 0.101–0.120, APs 0.121–0.140, pool dinâmico 0.141–0.254. Cabia (80 reservas), mas exigia **mover IPs** (câmeras 1.N → 0.N+10) e portanto reconfigurar NVD/DVR, filas de impressão e inventários.

Regras que valem para qualquer site:
- Defina categorias com faixas **sem sobreposição** e deixe o pool dinâmico fora das reservas.
- Reserve um IP fixo para gerência de cada switch/AP/roteador dentro da faixa "importantes" e documente (`192.168.0.8` foi usado para o switch).
- Reservas **por MAC** (`/ip/dhcp-server/lease`), com comentário da categoria/local.
- Verifique antes: quantas reservas existem, quantos MACs aparecem nas duas listas (antigo × novo), conflitos de IP.

## 2. Reservas por MAC e remapeamento

- A fonte da verdade é o MAC. Para devolver as reservas aos IPs antigos: leia as leases estáticas do dump (`mac-address` → `address`) e aplique no equipamento novo por MAC.
- **Duas passadas:** trocar IPs entre reservas gera `already have static lease with this IP address`. Aplique, colete as que falharam e repita (os conflitos desaparecem depois que as outras migraram). Antes, remova leases **dinâmicas** que ocupam o IP desejado.
- Confirme no final: `reservas com IP esperado == total` e conte leases dinâmicos.
- Guarde o estado anterior (JSON) para reverter.

## 3. Mudar a máscara (/22 ↔ /24): checklist

Atualize tudo junto, senão partes da rede ficam sem internet ou sem alcance:
1. `ip address` da bridge (ex.: 192.168.0.1/22).
2. `dhcp-server network` (endereço, gateway, DNS).
3. `ip pool` (faixa dinâmica).
4. **Todas** as regras `srcnat` (accept para VPN e masquerade) — esquecê-las deixa quem está fora da faixa antiga sem internet.
5. `available-from` de `winbox`, `api` e `ssh` (e dos switches).
6. IP/máscara do switch de gerência.
7. `allowed-address` dos peers WG que anunciam a LAN e rotas `ROTA | site <NOME>` nos **outros** sites.
8. Parceiro externo (ajusta o lado dele).
9. Documentação e inventários.

Ordem segura: bridge → network → pool → NAT → serviços → reservas → switch. Quem administra pelo mesmo segmento mantém acesso (a máscara maior só amplia).

## 4. Clientes e aplicações que guardam IP

- Clientes com lease do /22 antigo (1.x–3.x) **perdem a internet** quando a LAN passa a /24 sem rede de transição, até renovar (≈ lease/2; leases de 2 h). Uma rede de transição + NAT do antigo /22 ou voltar ao /22 evita isso.
- Aplicações que fixam IP: canais de NVD/DVR, filas de impressão no ERP/PCs, inventário do WatchIT, regras de firewall de terceiros, relógio de ponto. Mudar IP exige revisar todos.
- APs que ficaram com IP antigo continuam funcionando no CAPsMAN (L2) mesmo antes de renovar.

## 5. Lições da decisão /24 → /22

- A mudança para /24 foi feita sem listar os consumidores de IP; o usuário voltou atrás e a reversão foi simples **porque havia dump e snapshot**.
- Vantagem do /22 aqui: nenhuma aplicação precisa mudar de IP; custo: pool grande e broadcast maior (aceitável para ~140 dispositivos).
- Recomendação para novos sites: decidir máscara e faixas **antes** do cutover, levantar quem usa IP fixo e só então mudar.
