# Protótipos do redesign — WatchIT Tower

Esta pasta guarda os **protótipos HTML estáticos** que serviram de referência para o redesign (branch `feat/redesign-tower`). Não fazem parte do app: são páginas autônomas, sem build e sem backend, usadas para decidir layout, atalhos e comportamento antes de implementar.

## Como abrir

```bash
# opção 1: servir a pasta
npx serve docs/redesign

# opção 2: abrir direto no navegador
docs/redesign/index.html
```

Abrir o arquivo direto funciona; só as fontes (JetBrains Mono, via Google Fonts) dependem de internet. Os dados são **fictícios** (nomes, tempos e tráfego inventados), gerados em `tui.js`; nada é lido do sistema real.

## Índice

Todas as páginas compartilham `tui.css` (visual) e `tui.js` (dados fictícios, atalhos de teclado e a barra de navegação "Propostas" no topo, que liga uma página à outra).

| Página | O que mostra |
|---|---|
| `index.html` | 1 · **TOWER/1** — fila de problemas no topo, links, unidades, detalhe e eventos |
| `plantao.html` | 2 · **Plantão** — uma coluna por unidade e busca universal |
| `wtop.html` | 3 · **wtop** — painéis numerados no estilo btop, filtro por texto e paleta Ctrl+K |
| `triagem.html` | 4 · **Triagem** — alertas abertos com contexto e prévia de como o aviso chega no celular |
| `nettop.html` | 5 · **NetTop** — rede primeiro: failover, tráfego e Wi-Fi, com SLA do mês |
| `fluxo.html` | **Fluxo do sistema** — como o dado circula (worker, snapshot, interfaces, Cliq) e o roteiro F0-F5 |

## Decisão de escopo

- **Núcleo (ligado):** links, rede, Wi-Fi, relatório mensal de disponibilidade e auditoria.
- **Pausado (módulos opcionais, desligados por padrão):** Telefonia, Computadores e NVR/câmeras. O código e os dados permanecem; o módulo some do menu e das contagens e para de sincronizar até ser ligado em Configurações › Sistema.
- Manual, Changelog e Segurança saíram do menu lateral (continuam acessíveis pelo endereço).

## As interfaces

Todas leem o mesmo snapshot (`GET /api/tower`) e os mesmos painéis; muda só a composição.

| Chave | Interface | Estado no app |
|---|---|---|
| `tower` | TOWER/1, fila de exceções (padrão) | implementada em `/tower` |
| `plantao` | Plantão por unidade | em andamento |
| `nettop` | NetTop, rede primeiro | em andamento |
| `wtop` | wtop, btop literal | em andamento |

As alternativas são escolhíveis em Configurações › Sistema › Aparência (padrão do sistema e permissão de troca) e no Perfil (preferência de cada usuário). A Triagem permanece só como protótipo.

## Roteiro F0-F5 (status)

| Fase | Conteúdo | Status |
|---|---|---|
| F0 | Fechar a branch anterior (`feat/barra-hardening-failover`) | fora desta branch; conferir no repositório principal |
| F1 | Módulos opcionais e menu enxuto | concluída |
| F2 | Snapshot único, regra de problemas, ack/silêncio para links e dispositivos, TOWER/1 | concluída |
| F3 | Avisos no Zoho Cliq (anti-ruído, teste, auditoria, worker parado) | concluída |
| F4 | Escolha de interface; depois Plantão, NetTop e wtop | seletor (Aparência/Perfil) feito; Plantão, NetTop e wtop em andamento |
| F5 | Relatório mensal de disponibilidade e limpeza das páginas antigas | relatório mensal feito; limpeza das páginas antigas pendente (só após medir que ninguém as acessa) |

Detalhes técnicos: `SYSTEM_REPORT.md` (seção Redesign), `docs/openapi.yaml` (rotas novas) e `SECURITY_REPORT.md` (SEC-038 a SEC-040).
