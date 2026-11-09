# CAPsMAN e Wi-Fi (pacote `wifi`, RouterOS 7)

## Conteúdo
1. Modelo mental
2. Objetos de configuração
3. Verificação do estado
4. Problema: provisionamento não aplica
5. Rede extra (ex.: "Sempre Slim") e APs dedicados
6. Migração do controlador

## 1. Modelo mental

O controlador (gateway ou outro RouterOS 7 com pacote `wifi`) gerencia os APs (CAPs, ex.: cAP ac `RBcAPGi-5acD2nD`). Cada AP tem 2 rádios (2.4 GHz e 5 GHz) e cada rádio vira uma interface `cap-wifiN` no controlador. A descoberta e a gestão funcionam em **L2** (o AP não precisa ter IP válido na faixa nova para entrar). O tráfego pode ser processado no próprio AP (`traffic-processing=on-cap`) com a bridge do AP.

Nota: a nomenclatura é do pacote **wifi** (`/interface/wifi/...`), não `/caps-man/...` do legado.

## 2. Objetos de configuração

- `/interface/wifi/security` — perfis (WPA2/WPA3-PSK, encriptação). **Senhas ficam aqui**; nunca imprimir.
- `/interface/wifi/channel` — banda, frequências, largura (ex.: `5ghz-ac` 20/40/80, `2ghz-n` 20/40-Ce).
- `/interface/wifi/datapath` — bridge, isolamento de clientes, `on-cap`.
- `/interface/wifi/configuration` — SSID, modo `ap`, país (`Brazil`), instalação (`indoor`), referencia security/channel/datapath.
- `/interface/wifi/provisioning` — regras: `supported-bands` + `action` (`create-dynamic-enabled`) + `master-configuration` (+ `slave-configurations` para SSIDs adicionais).
- `/interface/wifi/capsman` — `enabled=yes`; `upgrade-policy` (`none` ou `require-same-version`); certificado do controlador gerado de novo na reconstrução.

Referência dos nomes do site: `evora-5ghz` (SSID corporativo) e `evora-2ghz` (SSID 2.4 GHz). Em outro site, defina nomes próprios.

## 3. Verificação do estado

- `/interface/wifi/capsman/remote-cap/print` — APs conectados (`state=Ok`, versão, `connected-time`).
- `/interface/wifi/print` — interfaces `cap-wifiN`: `configuration` preenchida, `disabled=false`, `.about` mostra "operated by CAP …".
- `/interface/wifi/radio/print` — bandas e capacidades por rádio (use `bands` para identificar 2.4 × 5 GHz).
- `/interface/wifi/registration-table/print` — clientes (esperado > 0 após configurar).
- `running=false` aparece nas interfaces `on-cap` mesmo funcionando; o critério confiável é `registration-table` e a visibilidade do SSID.

## 4. Problema: provisionamento não aplica

Sintoma observado: APs conectados (`remote-cap` Ok), mas as 16 interfaces `cap-wifiN` estavam **desabilitadas e sem configuração**, e `remote-cap provision` não alterava nada. Remover as interfaces apenas as recriava vazias.

Contorno que funcionou (replica o estado do controlador antigo):
1. Para cada interface, descubra a banda pelo rádio (`radio/print`, campo `bands`).
2. `/interface/wifi/set numbers=<cap-wifiN> configuration=<cfg-5ghz|cfg-2ghz> disabled=no`.
3. Confirme `registration-table` e `configuration.ssid`.

Pendência aberta: descobrir por que o provisionamento automático não roda (regra idêntica funcionava no antigo). Enquanto isso, um AP novo/trocado precisa do ajuste manual.

## 5. Rede extra e APs dedicados

No antigo havia um SSID temporário (`Sempre Slim`, perfil `evora-temp`) como slave no 5 GHz de todos os APs e como único SSID do AP "SEMPRE SLIM 2". Isso **não foi migrado** de propósito; a decisão foi usar a rede padrão da empresa também no AP "Sempre Slim". Se for recriar um SSID extra: crie security + configuration com `master-interface` por rádio (interfaces `*-slim`) e inclua em `slave-configurations` da regra de provisionamento. As senhas estão no dump.

## 6. Migração do controlador

- Os APs reconectam sozinhos quando o novo controlador responde na mesma L2; o certificado é novo e o CAP não tinha `lock-to-caps-man`.
- Garanta que a configuração (security, channel, datapath, configuration) existe **antes** de os APs entrarem, para evitar o estado "vazio" de interfaces desabilitadas.
- `datapath.bridge` precisa existir no controlador novo com o mesmo nome (`BRIDGE-<SITE>`).
- Atualizações de firmware dos APs: `upgrade-policy` do controlador; mantenha as versões iguais.
- APs aparecem como vizinhos com IP da faixa antiga (192.168.1.x) até renovar o DHCP; o CAPsMAN não depende disso.
