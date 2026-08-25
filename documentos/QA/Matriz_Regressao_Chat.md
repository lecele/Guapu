# Matriz de regressão do chat

Esta matriz será a fonte de verdade para aprovação de fluxo e qualidade. Cada caso deve conter a sequência completa, o estado esperado, a modalidade, os critérios de contexto RAG e o resultado observado.

## Campos obrigatórios por caso

| Campo | Descrição |
|---|---|
| ID | Identificador estável, por exemplo `FLOW-001`. |
| Origem | Conversa real do cliente ou caso sintético. |
| Pré-condição | Estado e tema da sessão antes da mensagem. |
| Entrada | Uma ou mais mensagens do estudante. |
| Estado esperado | Estado após a transição. |
| Modalidade esperada | Livre, resumo, quiz, informações ou encerramento. |
| Critério RAG | Documento esperado, quantidade mínima de chunks ou ausência explícita de contexto. |
| Critério de qualidade | O que a resposta precisa conter ou não pode conter. |
| Resultado atual | Aprovado, falhou ou pendente de avaliação. |
| Evidência | ID da sessão e horário, sem dados pessoais. |

## Casos mínimos antes de integrar prompts

| ID | Cenário | Resultado esperado |
|---|---|---|
| FLOW-001 | Escolher resumo sem tema | Solicita o tema e entra em `RESUMO_AGUARDANDO_TEMA`. |
| FLOW-002 | Pedir resumo já com tema | Gera resumo sem perguntar o tema novamente. |
| FLOW-003 | Após resumo, pedir “aprofundar” | Mantém o tema e aprofunda o conteúdo. |
| FLOW-004 | Após resumo, pedir “seja mais conciso” | Reformula de forma breve; não aprofunda nem troca de estado. |
| FLOW-005 | Após resumo, escolher outro tema | Limpa o tema e solicita um novo tema. |
| FLOW-006 | Iniciar quiz com tema na mesma mensagem | Inicia a questão 1 sem perguntar o tema novamente. |
| FLOW-007 | Responder `A` durante quiz | Avalia a tentativa da questão atual; não interpreta como comando. |
| FLOW-008 | Responder pergunta livre durante resumo | Responde no contexto da modalidade ou pede esclarecimento. |
| FLOW-009 | Pergunta sobre calendário | Consulta fontes de disciplina; não inventa datas. |
| FLOW-010 | Pergunta sem base documental | Declara ausência de contexto, sem inventar conteúdo. |
| FLOW-011 | Encerrar sessão | Confirma encerramento e finaliza o estado. |
| FLOW-012 | Reiniciar/reabrir sessão no meio de um quiz | Restaura estado persistido ou informa reinício de forma coerente. |
| RAG-001 | Pergunta clínica conhecida | Recupera chunks pertinentes e salva fontes/similaridades. |
| RAG-002 | Pergunta fora do escopo | Recusa ou redireciona sem alegar uma fonte inexistente. |
| OPS-001 | Falha de modelo/timeout | Retorna erro técnico claro, registra falha e não duplica mensagens. |

## Como incorporar os 31 testes do cliente

1. Exportar a sequência completa de cada sessão.
2. Anonimizar identificadores e conteúdo pessoal, se existir.
3. Classificar a causa primária: fluxo, RAG, geração, infraestrutura, sincronização ou interface.
4. Atribuir um ID permanente a cada caso.
5. Registrar a resposta atual como baseline.
6. Reexecutar a matriz após cada fase e comparar o resultado.

Nenhum caso será considerado “aprovado” apenas por uma resposta parecer boa. Ele precisa cumprir fluxo, fonte/contexto, conteúdo e persistência esperados.

