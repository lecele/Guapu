# Verificação da Fase 5 — interface nova

**Data:** 29/08/2026  
**Ambiente:** `https://guapu.agentesnasaude.com.br` na VPS  
**Status técnico:** **APROVADA**; a homologação final do cliente permanece na Fase 7.

## Tamanhos testados

| Viewport | Resultado | Evidência observada |
|---|---|---|
| 1366×768 | aprovado | tela inicial completa, sem rolagem da página, corte ou overflow horizontal |
| 1280×720 | aprovado | tela inicial completa, campo de chat e rodapé dentro da viewport |
| 390×844 | aprovado | quatro ações acessíveis, sem overflow horizontal; rolagem interna chega ao último card acima do compositor |
| 412×915 | aprovado | quatro ações acessíveis, sem overflow horizontal; rolagem interna chega ao último card sem sobreposição |

## Critérios conferidos

- Cabeçalho, marca Guapu, título, texto introdutório e nota de transparência visíveis.
- Divisor “escolha uma opção” separado do Hero.
- Quatro cartões em grid 2×2 no desktop e uma coluna no celular.
- Campo de conversa, limpar conversa, enviar, legenda institucional e marca d’água Agentes na Saúde presentes.
- Logo/rodapé posicionados sem corte no desktop.
- No celular, o conteúdo usa rolagem vertical interna porque os quatro cartões não cabem simultaneamente na altura disponível; o compositor não encobre o último cartão quando o usuário chega ao fim.
- Documento e viewport sem overflow horizontal.
- Tema claro/escuro disponível pelo controle do cabeçalho.

## Resultado

Build e lint já aprovados. O QA visual real nos quatro tamanhos passou sem necessidade de alteração de código. A interface está aprovada tecnicamente para a Fase 6; o aceite final do cliente continua sendo controlado pela Fase 7.
