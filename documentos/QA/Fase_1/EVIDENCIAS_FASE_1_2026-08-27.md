# Evidências da Fase 1 — 27/08/2026

Status: **EM EXECUÇÃO — NÃO APROVADA**

Este registro contém somente resultados observados em produção. A Fase 1 permanece bloqueada enquanto houver reconciliação pendente, documento ativo sem rastreabilidade ou teste obrigatório incompleto.

## 1. Plano de ensino antigo e vigente

- Fonte antiga removida: `administrativo__plano_ensino_INT55224__plano__ufsc__2026__v1.pdf`.
- Backup verificado antes da remoção: 93 chunks, SHA-256 das linhas `b18982801dbc46d467f661b4a2cc99fc4ff47467c1c357e80f7c98cc6cdac9f5`.
- Resultado no banco em 27/08/2026: zero chunks da fonte antiga e zero ocorrência de “Alexandre Caminha”.
- Fonte vigente: `administrativo__plano_ensino_INT55224__plano__ufsc__2026_2.pdf`.
- Resultado no banco: 64 chunks ativos e rastreáveis pelo Drive.
- Teste publicado, request `7edc8682-d7ef-4f0e-b0e2-0ec31dd64412`: cinco de cinco trechos vieram exclusivamente do plano vigente; modelo `gemini-3.5-flash`; sem fallback; total interno 16,338 s; nenhuma referência não verificada exibida.
- Teste concorrente após quarentena, request `27082700-0000-4000-8000-000000000022`: cinco fontes do plano vigente; nenhum chunk legado; resposta com os professores atuais e sem “Alexandre”; total 15,136 s.

## 2. Correções da automação Drive → RAG

- O timer anterior não possuía próxima execução e o worker havia reiniciado 71 vezes por OOM.
- O planejador foi corrigido para usar `OnUnitInactiveSec=10min`.
- O timer executou com sucesso e continuou agendando a próxima execução.
- Foi adicionada renovação de lease e limite de tentativas para impedir jobs eternamente presos em `running`.
- A extração de livros grandes passou a ocorrer em subprocessos descartáveis de dez páginas.
- Memória observada antes da correção: aproximadamente 2,65–3,0 GB e morte do processo.
- Memória observada depois da correção: processo principal entre aproximadamente 253–284 MB; total do serviço entre aproximadamente 364–526 MB; `NRestarts=0` durante o ensaio.
- Novos chunks entram como `staging` e só se tornam pesquisáveis após ativação atômica do arquivo completo.
- A conclusão de job agora limpa `last_error` e `worker_id`, evitando falso erro no painel.

## 3. Biblioteca — inclusão real de arquivo controlado

- Documento controlado: `QA_PHASE1_BIBLIOTECA_SYNC_20260827`.
- Drive ID usado no ensaio: `1LUFPlDLiEdopNVMgt4hfH12qPaIKfGayJx0XWO-a2bQ`.
- Caminho detectado: `ROOT/enfermagem_perioperatoria/biblioteca/QA_PHASE1_BIBLIOTECA_SYNC_20260827`.
- Fluxo `new`: concluído com sucesso, seis páginas, 18 chunks, manifesto ativo, zero staging após conclusão.
- O teste percorreu Drive, planejador, fila, worker, manifesto, vetores, recuperação e resposta publicada.

## 4. Biblioteca — atualização e falha controlada

- Fluxo `changed` detectado após inserir marcador exclusivo no mesmo Drive ID.
- Primeira atualização: 18 chunks gravados e um chunk obsoleto removido.
- Antes da busca híbrida, o teste expôs uma falha real: o identificador exato não entrou no top 5 da busca exclusivamente vetorial.
- Foi implantada busca híbrida semântica + textual.
- Request `27082600-0000-4000-8000-000000000015`: o documento controlado passou a ser a fonte número 1 e o app explicou corretamente o marcador.
- O marcador foi substituído integralmente por `QA-ATUALIZADO-GUAPU-FASE1-VERDE`.
- Foi provocada uma falha controlada antes da ativação atômica.
- Durante a falha: job `failed`; manifesto `error`; marcador antigo permaneceu ativo; marcador novo ficou em staging e não apareceu nos resultados.
- Reprocessamento normal: job `succeeded`; manifesto ativo; 18 chunks ativos; zero staging; marcador antigo zero; marcador novo uma ocorrência.
- Request `27082700-0000-4000-8000-000000000015`: nova versão recuperada como fonte número 1; resposta correta; sem marcador antigo; modelo principal sem fallback; total interno 27,342 s.

## 5. Biblioteca — remoção e não reaparecimento

- A cópia controlada foi removida permanentemente do Drive; o glossário original do cliente não foi alterado.
- Fluxo `removed`: concluído; 18 chunks removidos; manifesto removido; zero chunks pelo Drive ID e zero chunks pela fonte.
- Foram executados três ciclos adicionais do planejador, todos com resultado `success`.
- Após os três ciclos: job continua `succeeded/removed`, manifesto zero, chunks zero e o documento não reapareceu.
- Request `27082700-0000-4000-8000-000000000016`: resposta não atribuiu significado ao marcador removido e nenhuma fonte de QA apareceu na recuperação.

## 6. Documento real da Biblioteca

- Pergunta: definição de *near miss* segundo o glossário técnico.
- Request `27082700-0000-4000-8000-000000000017`: `glossario` em primeiro lugar; resposta correta.
- Repetição concorrente após a quarentena, request `27082700-0000-4000-8000-000000000023`: cinco fontes, `glossario` em primeiro lugar, nenhum chunk legado, resposta correta; total interno 15,312 s.

## 7. Quarentena dos documentos legados

- Todos os documentos sem `drive_file_id` passaram a ser logicamente não pesquisáveis.
- Registros físicos foram preservados para comparação, backup e eventual restauração.
- Estado imediatamente após a quarentena: 18.686 chunks pesquisáveis; 29.244 chunks legados em quarentena lógica; 2.600 chunks temporários em staging do processamento de livros grandes.
- O plano antigo possui zero chunks pesquisáveis.
- O plano vigente possui 64 chunks pesquisáveis.
- A primeira consulta concorrente estourou o timeout do banco; o erro foi observado e não ocultado.
- Foram criados índices parciais de vetor, texto e fonte somente sobre documentos ativos.
- Repetição do mesmo teste concorrente: plano vigente e glossário responderam corretamente, cinco fontes cada e zero documento legado recuperado.

## 8. Testes automatizados e deploy

- Python: 19 testes aprovados antes da última ampliação; teste específico da fila: 3 aprovados após limpeza de erro de job.
- Fluxo web: 26 testes aprovados.
- ESLint: aprovado.
- Build Next.js de produção: aprovado.
- Deploy Vercel da busca híbrida: `dpl_5GSKvtCFJ5w3dJhoF6uVeKPCAGP9`, estado `READY`.

## 9. Pendências que mantêm a Fase 1 aberta

- Concluir sem erro a indexação controlada dos três livros grandes que antes causavam OOM.
- Confirmar ativação atômica, manifesto e limpeza das duplicatas legadas correspondentes.
- Fechar a matriz de substituição de todas as fontes novas, antigas, duplicadas e fora de escopo.
- Comparar o inventário final Drive × manifesto × Supabase arquivo por arquivo.
- Confirmar que não existe fonte ativa órfã.
- Executar as perguntas críticas três vezes após a última sincronização definitiva.
- Confirmar ao menos três execuções automáticas pós-estabilização pelo timer, além dos ciclos manuais já aprovados.

Nenhuma dessas pendências será tratada como aprovada apenas porque o deploy terminou.

## 10. Reconciliação direta Drive × manifesto × RAG — 13:09

- Inventário vivo exportado diretamente do Google Drive: **119 arquivos**, incluindo raiz, Biblioteca e subpastas.
- Manifesto: **118 registros**; não há manifesto ativo para arquivo que não exista no Drive.
- Matriz reproduzível gerada em `MATRIZ_RECONCILIACAO_DRIVE_RAG_2026-08-27.csv` e resumo em `RESUMO_MATRIZ_RECONCILIACAO_2026-08-27.md`.
- Resultado atual da matriz: **111 fontes ativas e rastreáveis**, **6 arquivos vivos sem vetores** e **69 fontes legadas em quarentena que exigem comparação documental antes de exclusão física**.
- Não há vetor ativo associado a arquivo ausente do Drive; portanto, não foi autorizada nem executada exclusão física adicional.
- Foi identificada e corrigida uma falha do planejador: um manifesto com status `active` podia ocultar a inexistência de vetores com o mesmo `drive_file_id`.
- A correção adiciona uma consulta de integridade e força reindexação automática desses casos; a migração correspondente foi aplicada e validada contra a base existente.
- O worker permanecia processando o livro de cuidados críticos no momento do registro, com lotes concluídos continuamente e `NRestarts=0`. A ativação da nova versão do worker está condicionada à conclusão segura desse job.

## 11. Correção da automação e prova de reindexação — 13:13

- A função `get_rag_drive_file_states` foi aplicada no Supabase e validada: reconheceu **18.686 chunks ativos** e **620 chunks em staging**, preservando a semântica dos registros antigos que não possuem `rag_status` explícito.
- O planejador passou a comparar o Drive, o manifesto e os chunks ativos. Arquivo com manifesto `active`, mas sem vetores rastreáveis, agora recebe ação `changed` automaticamente.
- Testes unitários: **9 aprovados** para planejamento e fila, incluindo o caso de manifesto ativo sem vetores.
- O planejador executado na VPS após a correção encontrou **6 `changed` + 1 `new`**, **0 `removed`** e **112 `unchanged`**. Os sete jobs correspondem aos arquivos reais pendentes listados no Drive.
- A rotina de gravação foi testada na VPS com timeout controlado: primeira tentativa falhou, segunda concluiu com sucesso (`RETRY_TEST_PASSED calls=2`).
- O livro de cuidados críticos tinha chegado à tentativa final sob a versão anterior, com timeout no lote 373. O serviço foi parado de forma controlada; o job foi reaberto com tentativas zeradas e o worker reiniciado com a nova versão. Os chunks parciais permaneceram em `staging` e não ficaram pesquisáveis.
- Backup dos arquivos anteriores da VPS: `/opt/guapu/.phase1-backups/phase1-integrity-20260827-1307/`.

## 12. Verificação posterior e saneamento do estado da fila

- Nova leitura confirmou: **103 jobs concluídos**, **1 em execução** e **6 aguardando**; o worker permaneceu ativo com `NRestarts=0`.
- O job do livro de cuidados críticos avançou continuamente na nova execução, sem novo timeout registrado até a consulta.
- Foram encontrados dois jobs antigos com status `succeeded`, mas com mensagens de erro históricas ainda gravadas. Os erros residuais foram limpos para que o painel não classifique jobs concluídos como falhos. As ocorrências originais permanecem registradas nas seções anteriores deste documento.
- Os seis jobs pendentes continuam preservados na fila; nenhum foi marcado como concluído artificialmente.

## 13. Timeout real tratado pelo worker novo — 13:31

- Durante a reindexação do livro de cuidados críticos, o lote 166 recebeu o erro real do Supabase `57014 / statement timeout`.
- O worker registrou duas tentativas de repetição e concluiu o mesmo lote com sucesso; em seguida avançou normalmente para o lote 170.
- O serviço permaneceu ativo com `NRestarts=0`. Esta é a primeira prova em carga real de que a proteção contra timeout funciona sem marcar o documento inteiro como falho.

## 14. Auditoria de equivalência de conteúdo dos legados — 13:39

- Foi criado e executado o comparador somente leitura `scripts/audit_legacy_source_candidates.py`.
- O relatório `CANDIDATOS_LEGADO_POR_CONTEUDO_2026-08-27.csv` comparou **52 pares** cujo nome canônico coincide entre uma fonte legada e uma fonte ativa rastreável do Drive.
- Resultado: **43 identidades prováveis** por similaridade lexical (mediana 0,9788), **5 versões relacionadas** que permanecem bloqueadas para exclusão e **4 pares sem equivalência de conteúdo**, que não podem ser removidos.
- A análise é independente dos limites de chunk e, portanto, não confunde uma simples mudança de particionamento com diferença de documento.
- Nenhum chunk foi excluído por essa análise. A exclusão física continuará dependente de backup, vínculo com arquivo vivo no Drive e confirmação final após o término da fila.

## 15. Monitoramento e ambiente de produção — 13:40

- Foi ativado um monitor automático da Fase 1 a cada 10 minutos. Ele apenas informa conclusão, falha, fila parada, reinício ou esgotamento de tentativas; não altera dados, não reinicia serviços e não avança de fase.
- A configuração persistente do worker recebeu `APP_ENV=production`. O processo em execução foi preservado; a nova configuração será assumida somente no próximo reinício controlado após a conclusão do job atual.
- A credencial de serviço do Supabase foi confirmada presente antes da alteração. Uma nova execução de verificação já se identificou como `production`.

## 16. Verificador objetivo de encerramento — 13:43

- Foi criado e executado o verificador somente leitura `scripts/verify_phase1_final_state.py`, usando a mesma função `rag_document_is_active` publicada no Supabase.
- A função instalada e a busca híbrida foram auditadas diretamente no banco: **0** chunks sem `drive_file_id` são pesquisáveis e **29.244** estão em quarentena lógica.
- O diagnóstico parcial confirma **119** arquivos no Drive, **112** já com vetores ativos, **0** vetores ativos órfãos e **0** chunks legados ativos.
- A execução deliberadamente não foi aprovada: sete arquivos ainda não têm vetores ativos porque um está em staging e seis aguardam na fila. O verificador falhará em modo estrito até esses bloqueios desaparecerem.

## 17. Automação periódica do Drive — 13:44

- O timer `guapu-drive-sync-queue.timer` está `active/waiting`, com nova execução agendada para 13:52.
- A última execução automática terminou com `Result=success` e `ExecMainStatus=0`.
- Ela leu **119** arquivos do Drive e reenfileirou corretamente os sete pendentes (`6 changed + 1 new`), sem criar remoções indevidas.

## 18. Backup anterior à limpeza de duplicatas — 13:47

- Foi criado o backup somente leitura das **43** fontes legadas classificadas como identidade provável: **3.406 chunks**.
- Artefato comprimido: `C:\Users\llece\Documents\DEV\Agentes_na_Saude\_migration-backups\guapu-phase1-20260827\legacy-identity-probable.documents.jsonl.gz`.
- Manifesto com as fontes, contagens e hash verificável: `BACKUP_LEGADOS_IDENTIDADE_PROVAVEL_2026-08-27.json`.
- Hash das linhas exportadas: `b947a0171db93ed15420b36e49d3f3fdad0d4e5fdfb61db744643026affe92df`.
- A operação foi explicitamente `backup_only`; nenhum chunk foi alterado ou excluído.

## 19. Trava de exclusão física — 13:49

- Foi preparado `scripts/remove_backed_up_legacy_candidates.py` para a limpeza posterior das duplicatas comprovadas.
- A rotina exige simultaneamente: relatório final da Fase 1 aprovado, lista de candidatos idêntica ao backup, hash explícito do backup e contagem atual igual à contagem preservada.
- O teste foi executado com a Fase 1 ainda pendente e a exclusão foi corretamente bloqueada antes de qualquer operação de escrita.
- A remoção não será executada enquanto houver job, staging, divergência Drive × RAG ou falha no verificador estrito.

## 20. Auditoria de metadados das referências — 13:58

- Das 112 fontes ativas, somente 10 possuíam título bibliográfico estruturado antes da auditoria; por isso algumas respostas podiam chegar ao fallback de referência.
- A rotina de retropreenchimento foi corrigida para ordenar os chunks por página, evitando procurar capa/ficha no meio do PDF.
- Foi adicionada uma análise de títulos de capa, mas a revisão identificou propostas que eram cabeçalhos, DOI ou ficha catalográfica. Por segurança, essa heurística foi bloqueada para gravação automática.
- Resultado da simulação atual: **9** fontes com extração explícita elegível para gravação e **70** propostas de capa mantidas apenas para auditoria. Nenhum metadado foi gravado nesta etapa.
- Testes da extração: **4 aprovados**, incluindo rejeição de créditos editoriais e prevenção contra títulos inferidos.

## 21. Executor dos testes reais de liberação — 14:12

- Foi preparado `scripts/run_phase1_rag_release_tests.py`, ainda não executado porque a fila da Fase 1 permanece ativa.
- O executor envia as três perguntas críticas ao endpoint publicado, cria sessões técnicas isoladas e cruza cada resposta com o telemetry persistido no Supabase.
- Ele falha automaticamente em caso de erro técnico, fallback, ausência da fonte obrigatória ou recuperação do plano antigo.
- O relatório final incluirá `request_id`, fontes recuperadas, resposta e latências de embedding, recuperação e geração para as nove repetições.
