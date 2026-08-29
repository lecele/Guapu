# Verificação da Fase 4 — prompts v1.3 e fluxos

**Data:** 29/08/2026  
**Ambiente real:** `https://guapu.agentesnasaude.com.br` na VPS  
**Commit de controle:** `88d286e`  
**Status técnico:** **APROVADA**; a homologação final do cliente permanece na Fase 7.

## Testes executados

- Suíte local de sessão, estados, prompts, referências e escopo administrativo: **37/37 aprovados**.
- Lint do projeto: **aprovado**.
- Bateria real publicada no runtime VPS: **8/8 aprovados**, sem erro HTTP e sem caso reprovado.
- Casos reais incluídos na bateria: resumo sem tema, resumo com tema, aprofundamento, troca de tema, quiz com tema, informações da disciplina, encerramento e pergunta clínica com recuperação de contexto.

## Resultados da bateria real

| Caso | Resultado | Latência | Fontes |
|---|---:|---:|---:|
| FLOW-001 — resumo sem tema | aprovado | 297 ms | 0 |
| FLOW-002 — resumo com tema | aprovado | 5.127 ms | 5 |
| FLOW-003 — aprofundar | aprovado | 9.951 ms | 5 |
| FLOW-005 — trocar tema | aprovado | 345 ms | 0 |
| FLOW-006 — quiz com tema | aprovado | 18.394 ms | 5 |
| FLOW-009 — informações da disciplina | aprovado | 37.766 ms | 5 |
| FLOW-011 — encerrar sessão | aprovado | 284 ms | 0 |
| RAG-001 — pergunta clínica | aprovado | 17.359 ms | 5 |

Os fluxos de menu, novo quiz, tentativas, troca de modalidade, encerramento, ausência de contexto e regras de referências também estão cobertos pelos 37 testes locais. Nenhuma alteração de código foi necessária nesta rodada.

## Critério de saída

A implementação e os testes técnicos da Fase 4 estão aprovados. A versão continua bloqueada para liberação definitiva até concluir as Fases 5 e 6 e obter o aceite final do cliente na Fase 7.
