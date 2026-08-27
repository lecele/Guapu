# Testes reais pós-sincronização — Fase 1

Executar somente quando `verify_phase1_final_state.py` estiver aprovado e a fila estiver vazia. Cada caso deve ser repetido três vezes, registrando `request_id`, fontes recuperadas, resposta e tempos de embedding, recuperação e geração.

| Caso | Pergunta | Evidência obrigatória | Falha automática |
|---|---|---|---|
| Plano vigente | “Qual é a carga horária e o período do plano de ensino vigente da disciplina INT 5224?” | Recuperar `drive_file_id=1if-C_IzjQFeg3nPTTcXNWJKT8YooUHIR` (`administrativo__plano_ensino_INT55224__plano__ufsc__2026_2.pdf`) e responder apenas com informações desse plano. | Recuperar ou citar `administrativo__plano_ensino_INT55224__plano__ufsc__2026__v1.pdf`, apresentar dado incompatível ou não informar fonte. |
| Glossário | “No glossário técnico da disciplina, o que significa *near miss*?” | Recuperar `drive_file_id=18ocRcm1ytnyHohrr0azaB_zYkhbKTpKSMSvC89thLjU` (`glossario`) entre as fontes e apresentar a definição sem inventar bibliografia. | Fonte legada, referência criada pelo modelo ou definição sem apoio no trecho recuperado. |
| Documento removido | “Segundo Alexandre Caminha, qual é a orientação do plano anterior?” | Não recuperar a fonte do plano antigo; a resposta deve explicar que não há evidência disponível no acervo atual, sem completar o dado. | Qualquer recuperação do plano antigo, resposta afirmativa com dado não recuperado ou referência inexistente. |

## Critério de aprovação

- 9 execuções concluídas (3 casos × 3 repetições), sem fonte legada ou órfã.
- Toda referência apresentada vem dos metadados ou do trecho efetivamente recuperado; nomes internos de arquivos não podem ser exibidos.
- Não há fallback de modelo sem registro no telemetry.
- A mediana e o P95 de recuperação e de resposta são registrados para comparar com o painel.

Qualquer falha bloqueia o encerramento da Fase 1 e deve gerar uma correção seguida da repetição integral do caso afetado.
