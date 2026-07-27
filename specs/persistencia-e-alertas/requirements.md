# Requisitos: Monitoramento de Gravação NVR + Alertas

## Contexto

O NVD (NVR Intelbras/Dahua) precisa ser monitorado pelo próprio WatchIT
Tower, como qualquer outro dispositivo — não por um script Python separado
agendado por cron. Isso cobre: canais gravando/parados/com gap, saúde de
disco/espaço, e um vínculo com as câmeras IP já cadastradas (monitoradas
por ping) para cruzar os dois sinais na mesma tela.

## Requisitos

R1. O NVD deve poder ser cadastrado como um `Device` comum do WatchIT Tower
(reaproveitando `DeviceType.DVR`, já existente), com credenciais
criptografadas (mesmo padrão AES-256-GCM já usado para RouterOS/UniFi/Omada).

R2. O worker deve validar periodicamente os canais de gravação de cada
device `DVR` com o monitor habilitado, persistindo cada problema
encontrado (`no_recordings`, `gap`, `not_recording_now`, `unreachable`)
com timestamp, device e canal.

R3. A cadência dessa validação é própria e ajustável por device (padrão:
1x/dia) — independente do `checkInterval` normal usado por ping/http/snmp/
routeros no mesmo device. Deve poder ser reduzida (mais frequente) ou
aumentada (menos frequente) se o NVD não aguentar a carga das consultas.

R4. Quando um canal estiver `not_recording_now` ou `no_recordings`, o
sistema deve enviar um e-mail de alerta.

R5. O sistema NÃO deve reenviar alerta do mesmo canal+problema se já foi
alertado nas últimas 2 horas (evitar spam de e-mail).

R6. Quando um canal que estava com problema voltar a gravar normalmente, o
sistema deve fechar o histórico (sem alertar sobre a resolução).

R7. O envio de e-mail deve usar um cliente SMTP genérico (qualquer
provedor, com SSL ou TLS), configurável pelo admin na página `/system` —
não é um script isolado com credencial fixa de um provedor específico; é a
primeira capacidade de e-mail do WatchIT Tower e deve poder ser
reconfigurada sem redeploy.

R8. O NVD deve reportar saúde de disco/espaço de armazenamento (uso %,
estado), monitorado junto com os canais.

R9. Uma câmera IP já cadastrada como `Device` (`type = CAMERA`, com ping
habilitado) deve poder se vincular a um canal específico de um NVD, para
que a tela de detalhe do NVD mostre o status de ping da câmera ao lado do
status de gravação daquele canal.

## Fora de escopo (por enquanto)

- Os scripts em `scripts/nvd/` (`recording_validator.py`,
  `intelbras_nvr_client.py`) continuam existindo só como ferramenta manual
  de diagnóstico/validação de campos da API contra um NVD real — não fazem
  parte do pipeline automatizado do worker.
