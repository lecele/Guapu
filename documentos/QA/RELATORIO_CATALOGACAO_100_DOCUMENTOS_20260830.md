# Relatório de catalogação bibliográfica — documentos pendentes

**Data:** 30/08/2026  
**Escopo:** inventário ativo do Drive e chunks das páginas 1–5 consultados diretamente na VPS. A primeira coleta foi somente leitura; depois, por autorização do responsável, foram promovidos lotes conservadores no catálogo de runtime/JSON, sem alterar banco, chunks, embeddings, manifesto, worker ou sincronização Drive.

## Resultado

- Manifesto ativo: 119 documentos.
- Identidades verificadas no catálogo do runtime no início desta rodada: 19.
- Identidades verificadas encontradas na tabela persistente: 18.
- Fila de catalogação analisada: 100 documentos.
- Resultado seguro da extração: 25 candidatos de título para revisão, 75 sem pista bibliográfica confiável e 0 novas identidades promovidas automaticamente.
- Estado após os lotes controlados de 30/08/2026: **68/119 documentos catalogados no runtime e no `reference_catalog.json`; 51 documentos ainda pendentes**.

A divergência entre os catálogos é de um documento: o ID `1wfGN61loXz7AcLSqxsqWZ1S639SBcymR` está no catálogo do runtime, mas não apareceu como verificado na tabela persistente nesta coleta. Esta auditoria não alterou a base.

## Critério aplicado

- Referência aprovada exige evidência textual do próprio documento; nome de arquivo, caminho e extensão não foram usados como fonte bibliográfica.
- O extrator descartou frases do corpo, palavras-chave, DOI isolado, créditos editoriais e OCR corrompido.
- Nenhum campo foi promovido sem confirmação humana literal; por isso os candidatos são `partial`, não `verified`.
- `unresolved` indica ausência de pista bibliográfica suficientemente segura nas páginas amostradas ou OCR inadequado.

## Próxima revisão

- Prioridade 1: confirmar os 25 candidatos de título diretamente nas páginas indicadas e completar autor/órgão, ano, edição e editora quando constarem no documento.
- Prioridade 2: aplicar OCR ou revisar manualmente os 75 documentos sem título confiável.
- Somente após a confirmação, promover uma entrada ao catálogo persistente e propagar seus metadados aos chunks do mesmo `drive_file_id`.

## Atualização controlada — lote 1 pós-auditoria

Após a correção crítica de referências em 30/08/2026, foi executada uma promoção conservadora no catálogo do runtime e no `reference_catalog.json`, usando apenas campos confirmados literalmente nos chunks consultados.

- Catálogo runtime após o lote: **42/119 documentos**.
- Novas identidades promovidas neste lote: **22**.
- Pendentes após o lote: **77 documentos**.
- Itens deixados fora mesmo estando em `partial`: candidatos sem ficha suficiente ou com evidência fraca para formar uma referência segura, como tabelas/aulas sem identificação bibliográfica completa e documentos cujo título/publisher/ano não apareceram com clareza na amostragem.
- Banco, chunks, embeddings, manifesto, worker e sincronização Drive: **não alterados**.

Validação do lote:

- `npm run test:flow`: 54/54 testes passaram.
- `npm run build`: passou localmente.
- Build Docker na VPS: passou.
- `GET /api/health`: saudável, Supabase conectado.
- Worker `guapu-drive-sync-worker.service`: ativo.
- `drive_sync_jobs`: 0 jobs `queued`, `running` ou `failed`.

Smoke tests reais no app publicado:

| Cenário | Request ID | Resultado |
| --- | --- | --- |
| Cuidados de enfermagem em pré-operatório/checklist | `95fe1dd4-84e8-4dbf-8016-f8581b222f1d` | Referência catalogada da Revista Inova Saúde, sem `.pdf`, sem `Fonte:`, sem `trecho`, cabeçalho `**Referências**`; 12.587 ms na telemetria. |
| Biofilme em feridas complexas | `bb1acb1b-2665-425e-8f8a-52586b9eb99f` | Referência catalogada da Revista Rede de Cuidados em Saúde e Guia de Cuidados em Feridas, sem `.pdf`, sem `Fonte:`, sem `trecho`, cabeçalho `**Referências**`; 5.549 ms na telemetria. |

## Atualização controlada — lote 2 e roteamento de fontes

Foi executado um segundo lote conservador, focado em documentos com identificação bibliográfica visível na amostragem e em temas que apareceram nos testes reais.

## Atualização controlada — lote 3 de validação cruzada

Foi validado um lote adicional de 18 candidatos contra o conteúdo real dos chunks ativos. Três foram mantidos pendentes por falta de confirmação textual suficiente do título e dois por falta de evidência de autoria. Os demais 13 foram promovidos.

- Catálogo runtime e `reference_catalog.json`: **85/119 documentos**.
- Novas identidades promovidas neste lote: **13**.
- Pendentes explícitos após este lote: **27 documentos**.
- Os 72 registros anteriores permaneceram inalterados; backup do JSON anterior: `scratch/backups/reference_catalog.before-13-20260830.json`.
- Nenhum embedding, conteúdo, índice, worker, manifesto ou sincronização Drive foi alterado.
- `npm run test:flow`: **55/55**; `npm run build`: passou localmente.

Os 27 pendentes não foram incluídos no catálogo e continuam exigindo evidência bibliográfica real antes de qualquer promoção.

## Propagação persistente — validação final

- Catálogo `public.rag_document_catalog` antes da operação: **72** registros verificados.
- Operação administrativa idempotente: **13** registros comprovados inseridos/atualizados via API protegida da VPS, sem exposição de credenciais.
- Catálogo persistente após a operação: **85** registros verificados.
- Propagação confirmada em **547/547 chunks** dos 13 documentos novos, com `reference_key` igual ao `drive_file_id`, `reference_source = catalog` e `reference_verified = true`.
- Os 27 IDs pendentes permanecem ausentes do catálogo persistente.
- Backup remoto: `/opt/guapu-app/backups/20260830-catalog-85/supabase-rag_document_catalog.before.json`.
- `GET /api/health`: saudável, Supabase conectado; worker e timer ativos.
- Conteúdo, embeddings, índices, status de ingestão e manifesto não foram alterados.

## Revisão dos documentos pendentes — consolidação

Os 26 documentos que permaneciam pendentes foram reavaliados usando as evidências dos chunks já existentes. Três identidades tinham sido promovidas durante a revisão anterior (`1jqs...`, `1wHI...` e `1xGY...`); nesta consolidação, duas novas foram confirmadas e propagadas. Os demais **24 documentos** continuam pendentes por OCR incompleto, ausência de autoria/identificação editorial ou evidência insuficiente.

- Catálogo atual: **88/119** documentos verificados.
- Novas promoções desta revisão: `1wHIhi2Yw7B-NCR3oN3tfBnlZ9I9f2fHu` e `1xGY_SapE2TSc_PpEB3OM8FENw0tKP_v7`.
- Evidência: citações e dados editoriais confirmados no conteúdo integral dos chunks.
- Propagação: **527/527 chunks** atualizados pelos metadados do catálogo.
- Nenhum dos 24 pendentes foi promovido por nome de arquivo ou inferência.

## Auditoria direta dos 24 arquivos originais do Drive

Os 24 arquivos que ainda não estavam no catálogo foram baixados temporariamente pela conta de serviço da VPS e examinados em modo somente leitura, incluindo páginas iniciais e finais. Resultado: **24/24 acessíveis, 0 erros de download**. A análise confirmou que a lista anterior baseada apenas no OCR dos chunks era conservadora demais.

Há evidência bibliográfica clara no original, sujeita apenas à normalização e validação final dos campos, nos seguintes IDs: `1-5n8...` (consenso Wounds International, 2012), `11yYT...` (artigo REMICI, 2023), `12F853...` (cuidados pré-operatórios, Revista de Medicina da UFC, 2019), `1ajbz...` (dor pós-operatória, Revista de Enfermagem UFPE, 2018), `1CIiq...` (perioperative care of the obese patient, BJS), `1EPC...` (dor pós-operatória ortopédica, Acervo Saúde), `1K2z...` (acute pain, Pain Medicine, 2010), `1PqMF...` (intervenções não farmacológicas, Rev. enferm. UFPE, 2021), `1Sll...` (visita pré-operatória, Acervo Saúde), `1UcXu...` (manejo da dor na SRPA, BrJP, 2025), `1uFP...` (Cancer pain relief, OMS, 1996), `1v5c...` (RDC Anvisa nº 15/2012) e `1XoSi...` (vídeo educativo em cirurgia robótica, artigo científico).

Foram mantidos para revisão manual/normalização, sem promoção automática: materiais didáticos da UFSC/SOBECC sem editora/ano claramente bibliográficos (`14dVM...`, `1a0Y...`), capítulos ou livros cujo título/autoria precisa ser delimitado no original (`1GPn...`, `1Y0...`, `1yqw...`, `1uLO...`), tabelas/apostilas sem ficha (`1Tm4...`) e arquivos cujo OCR mostra conteúdo clínico mas não uma identidade editorial segura (`1_VSuj...`, `1uC-...`). Os 24 continuam fora do catálogo até a confirmação campo a campo; os 2 promovidos nesta rodada anterior permanecem válidos.

Relatório bruto da leitura original: `/opt/guapu-app/backups/20260830-catalog-88/original-drive-audit-24.json`.

## Lote 4 — validação de posicionamento cirúrgico

- Documento promovido: `1jqsGK86i2AcDj9ATPyU13kcsRLkmCNJn`.
- Identidade confirmada no chunk da página 1: título, cinco autores, ano 2016, periódico `Revista Latino-Americana de Enfermagem` e identificação `e2704`.
- Catálogo persistente: **86/119** verificados.
- Propagação: **43/43 chunks** com metadados do catálogo.
- Teste publicado de posicionamento cirúrgico: resposta HTTP 200, 5 fontes, cabeçalho `**Referências**` sem dois-pontos, sem nome de arquivo e sem erro técnico; request `014e495a-3923-4e19-ba14-17df307a30d0`, 17.419 ms.
- Observação: este teste recuperou outras fontes pertinentes e não exibiu o artigo recém-promovido; isso não invalida a catalogação, mas indica que a validação específica da recuperação desse artigo deve ser feita em uma pergunta mais direcionada.

- Catálogo runtime após o lote: **57/119 documentos**.
- Novas identidades promovidas neste lote: **15**.
- Pendentes após o lote: **62 documentos**.
- Banco, chunks, embeddings, manifesto, worker e sincronização Drive: **não alterados**.
- Incidente detectado durante o aceite: algumas perguntas amplas passaram a retornar timeout ou fontes fracas após o lote 2 (`RETRIEVAL_FAILED`/`AbortError` em testes intermediários). A causa prática foi o caminho vetorial ser tentado antes da leitura exata quando já havia fonte conhecida/roteada.
- Correção aplicada: em `app/api/chat/route.ts`, a leitura exata da fonte agora é tentada antes do RPC vetorial quando há fonte explícita/roteada; os chunks dessa fonte são ranqueados localmente pelos termos da pergunta; foram adicionados roteamentos conservadores para NANDA, anestesia e controle de infecção perioperatória.
- Backups: `scratch/backups/route.before-retrieval-timeout-fallback-20260830.ts.bak`, `/opt/guapu-app/backups/20260830-retrieval-fallback/` e `/opt/guapu-app/backups/20260830-topic-routing/`.

Validação do lote 2 e da correção:

- `npm run test:flow`: 54/54 testes passaram.
- `npm run build`: passou localmente.
- Build Docker na VPS: passou.
- `GET /api/health`: saudável, Supabase conectado.
- Logs dos últimos 10 minutos após deploy: sem `RETRIEVAL_FAILED`, `AbortError` ou `502`.
- `guapu-app` e `guapu-panel`: containers saudáveis.

Smoke tests reais no app publicado:

| Cenário | Request ID | Resultado |
| --- | --- | --- |
| Controle de infecção no perioperatório | `7898ea52-a331-4d73-b49b-60a103464419` | 5 fontes; referência do artigo `O papel do enfermeiro na prevenção de infecção no sítio cirúrgico`, p. 2; sem `.pdf`, sem `[Fonte:]`, sem `trecho`, cabeçalho `**Referências**`; 4.989 ms. |
| Plano vigente INT 5224 | `d61596f6-1cb5-4c24-a9dc-8f343e384516` | 5 fontes; referência do Plano de Ensino 2026-2 p. 1; sem ruído de arquivo; 2.675 ms. |
| Diagnósticos de enfermagem da NANDA | `44b7c987-8b22-4ed9-9afc-4ab96e8997c8` | 5 fontes; referência `NANDA International, Inc (2021-2023). Diagnósticos de Enfermagem... 12ª ed. Thieme. p. 59`; sem ruído de arquivo; 3.771 ms. |
| Cuidados de enfermagem relacionados à anestesia | `51e6eb52-2afa-4342-b24b-18bb24e5630c` | 5 fontes; referência `Papel da Enfermagem perioperatória na anestesia: panorama nacional`, Revista da Escola de Enfermagem da USP, p. 2; sem ruído de arquivo; 4.734 ms. |

## Casos que exigem revisão manual

- `1qm9DPpaum7YUlIiYiD8cjibHvnHSHvY6` — páginas amostradas: 1, 2, 3, 4, 5.
- `14JMPrRcdyR0xl1N90XQ5tOLfARHnmgOW` — páginas amostradas: 1, 2, 3, 4, 5.
- `1gBvFE2DRjXYHLP-Qspksx7t3GiBEfyjI` — páginas amostradas: 1, 2, 3, 4, 5.
- `1nibYV0oDN8fWL_sVezweYwDXVQ4-7J-p` — páginas amostradas: 1, 2, 3, 4, 5.
- `1nS-uUqHc6djf4-sf_oCg89yeyX7U1Vqh` — páginas amostradas: 1, 2, 3, 4, 5.
- `1lyRAPNXfNubucSWp6tbrE_fjNCFh3fTd` — páginas amostradas: 1, 2, 3, 4, 5.
- `1rPHkdjmqyCHJYZZBJuYbFpTkSXo1gItE` — páginas amostradas: 1, 2, 3, 4, 5.
- `1uLOguHlm-IuiJ7nqv-j7m1u7bKPTm3cx` — páginas amostradas: 4, 5.
- `1uC-_-TFRVx4pPW90wwfm0nS8CzkzdcMY` — páginas amostradas: 1, 2, 3, 4, 5.
- `18vXR395kiMezxuA4TcaQQJUmwOUsq8Bb` — páginas amostradas: 1, 2, 3, 4, 5.
- `15cHzlZGfKjdm_Ml92ZMUUPQBSK-VoCzX` — páginas amostradas: 1, 2, 3, 4, 5.
- `1yqwQggFm8jU0UjF-FqHRp9ga3TKYfxhc` — páginas amostradas: 1, 3, 5.
- `1LlsbycBZNCPGzO4vAndxTBUKLVLsiZa7` — páginas amostradas: 1, 2, 3, 4, 5.
- `1P43NFM7XoK2UXMhagEztOGYD8_r9OKZM` — páginas amostradas: 1, 2, 3, 4, 5.
- `133kL-UwvYfUO3tFNwnfryDUY_RmpK5gH` — páginas amostradas: 1, 2, 3, 4, 5.
- `1asX74LMu-mPVLx0kJ9HqoX_R2LgPIctF` — páginas amostradas: 1, 2, 3, 4, 5.
- `1rZB8ydMuHYnWCe_r-NQEn5XT_Ynh3M6w` — páginas amostradas: 1, 2, 3, 4, 5.
- `143CGBAnOovTJzVyaoxGVsz1ipFVRYbHo` — páginas amostradas: 1, 2, 3, 4, 5.
- `1Zs9Egj29vROqQ5Jc_drE6Jr5-0_ai4j6` — páginas amostradas: 1, 2, 3, 4, 5.
- `1OhZNLuFYSKQFvrT7E2q8OSEkKd9YIByq` — páginas amostradas: 1, 2, 3, 4, 5.
- `1CIiqKR9iSXmJhaK_EiIc_zNjJCEBWEWB` — páginas amostradas: 1, 2, 3, 4, 5.
- `1YZBXloGp4a2-hYLNDvlzZe-RwqQ_82bG` — páginas amostradas: 1, 2, 3, 4, 5.
- `1oRkNX9x71DIl6EunfzmAPyGiXsbUUyW7` — páginas amostradas: 1, 2, 3, 4, 5.
- `1RCyHau7fNnNhRka-atSPhppmAuW6JeRH` — páginas amostradas: 1, 2, 3, 4, 5.
- `1FCdYFq79-qL4t0wgmmrOmaOnU_p9vDwv` — páginas amostradas: 1, 2, 3, 4, 5.
- `1WZJNFwRSIvqsTzE3YlPo-kT9rBzfQKOO` — páginas amostradas: 1, 2, 3, 4, 5.
- `17qpoGMDN4iu6_dGZl1L620eCwxOeypvr` — páginas amostradas: 1, 2, 3, 4, 5.
- `1ymUqtCBbHKAKBUqyuAgCrN4zfdps7LfE` — páginas amostradas: 1, 2, 3, 4, 5.
- `1-xhx4ifwQCUbz_keirJIz6UQSQ8a5sUE` — páginas amostradas: 1, 2, 3, 4, 5.
- `1a0YMt3q7p70f5iFaX_qQJ1RHouEvalYA` — páginas amostradas: 3, 4, 5.
- `1_VSuj-wh7VOliXi2M_7idLkb1jEAk5Yn` — páginas amostradas: 2, 3, 4, 5.
- `1XoSi4a7hJA7A9GdWxQxGucwCv3WLhv1f` — páginas amostradas: 1, 2, 3, 4, 5.
- `1SllmrhJX8SuZi5i6kFikDqBCtngSFhzh` — páginas amostradas: 1, 2, 3, 4, 5.
- `14dVMPLHlYsu5YP1GrC0_aFlMQWqy8Z8N` — páginas amostradas: 1, 2, 3, 4, 5.
- `11yYTHeY94hOPFBZaB2Zlt2Wiw2qxVuX4` — páginas amostradas: 1, 2, 3, 4, 5.
- `12F8539ZNtvLtx5nGmPOtUPJ6clbVvNJU` — páginas amostradas: 1, 2, 3, 4, 5.
- `1ajbzLqRKBfhN6X2Dz1yIJyWVc1JQ2Hw8` — páginas amostradas: 1, 2, 3, 4, 5.
- `1uFP54kMLDB4hpJ22P-eb-Y3IrhQ3vyz2` — páginas amostradas: 1, 2, 3, 4, 5.
- `1K2z5fV3W0HpnI8qlic6VSDEf0zS86jLv` — páginas amostradas: 1, 2, 3, 4, 5.
- `1nAb093keQj_Yhc0ggBrbFitGFblbrudE` — páginas amostradas: 1, 2, 3, 4, 5.
- `1EPCBDJS70QMGgzsxG7WNHoP0GaN4feCD` — páginas amostradas: 1, 2, 3, 4, 5.
- `1PqMF2K_ijUIrkhqDL-28KPJSA5dwinzY` — páginas amostradas: 1, 2, 3, 4, 5.
- `1UcXuZBX8B_e2GvymQHqisVur3Fryddx7` — páginas amostradas: 1, 2, 3, 4, 5.
- `1O0YOHXXn1t4mA03TX_G37T27QPd4icHc` — páginas amostradas: 1, 2, 3, 4, 5.
- `14FpkEkVZ8rQQQ6bS9Sw3m1bfWXykFSQR` — páginas amostradas: 1, 2, 3, 4, 5.
- `1ldnVPOO96XZstBvujx0cRJAqO9lDyHKE` — páginas amostradas: 1, 2, 3, 4, 5.
- `1OMQVMDvrNhaDt46uOzTIf8vELVNQuJFz` — páginas amostradas: 1, 2, 3.
- `1BF7mv42fMWtWbl-RFEM2kMqC7u_JvfXl` — páginas amostradas: 1, 2, 3, 4, 5.
- `1-5n8Jt_rfg7VBwL0pA_Fn0tV--9Xywop` — páginas amostradas: 1, 2, 3, 4, 5.
- `1yNf2wjEd6Kh_6ws3A_aNhtCBF_rQ-Dy7` — páginas amostradas: 1, 2, 3, 4, 5.
- `16GLTKTwbrmzK0Ss_EvupoyQQEm6kYSpG` — páginas amostradas: 1, 2, 3, 4, 5.
- `1TiWjB4dsk0mmiuDFZ1raAmjjSnWGQtVG` — páginas amostradas: 1, 2, 3, 4, 5.
- `1wHIhi2Yw7B-NCR3oN3tfBnlZ9I9f2fHu` — páginas amostradas: 1, 2, 3, 4, 5.
- `1EP6smNAfD1mGvxlFI60zdWYI0AUiBzbS` — páginas amostradas: 1, 2, 3, 4, 5.
- `1GPn09XtMV0-zVQvV9jAeZUSBGS5oX_NT` — páginas amostradas: 1, 2, 3, 4, 5.
- `1CPPdhEiV2JsIGCOXovYj7RwLn35BnUB6` — páginas amostradas: 1, 2, 3, 4, 5.
- `1LXQQMOjsvUHa8NdTKk0RXwbQBjAg8lD7` — páginas amostradas: 1, 2, 3, 4, 5.
- `1R0Pzaanq3GvepGiV9SLU7-La9BmGoui1` — páginas amostradas: 1, 2, 3, 4, 5.
- `1v5cEFXfyIsZqYz7mVijoZm3seGx69pC3` — páginas amostradas: 1, 2, 3, 4, 5.
- `1jqsGK86i2AcDj9ATPyU13kcsRLkmCNJn` — páginas amostradas: 1, 2, 3, 4, 5.
- `1Y0kgBCwjfPSAN9WAsXB2nCoM8oJM-mFJ` — páginas amostradas: 1, 2, 3, 4, 5.
- `1Dfa11eSLLIDE5S6eZPY8_qP3fG7WZQTx` — páginas amostradas: 1, 2, 3, 4, 5.
- `1sC_kwbQ0Rl_EzmUhpNd5qkiMZ6nRs1h8` — páginas amostradas: 1, 2, 3, 4, 5.
- `1OgGmU5houhT6ONseSFeh-wlP4nPAIcZK` — páginas amostradas: 1, 2, 3, 4, 5.
- `1w-iSjXWRXHywRGMLm4cNmXOHvlqChck7` — páginas amostradas: 1, 2, 3, 4, 5.
- `1xGY_SapE2TSc_PpEB3OM8FENw0tKP_v7` — páginas amostradas: 1, 2, 3, 4, 5.
- `16-T64RbQAsry8m955vpW2yxo4jakrbIu` — páginas amostradas: 1, 2, 3, 4, 5.
- `1-y2_9a53d0ArQgLc4_PtZ22yBECV3rzN` — páginas amostradas: 1, 2, 3, 4, 5.
- `12iLd6ulHIxM8yw9h501KqZt5OYyXVbtT` — páginas amostradas: 1, 2, 3, 4, 5.
- `1nAnS9Lgf5Ywwv43xtoq369StrZQaTTIU` — páginas amostradas: 1, 2, 3, 4, 5.
- `1a42jr8rEqtm-Z_4JJcUAQ1iXayt-nQrT` — páginas amostradas: 1, 2, 3, 4, 5.
- `1tlLGjy3H7HybRDJfw7UqUxbmA2SrcVdQ` — páginas amostradas: 1, 2, 3, 4, 5.
- `1DlFt-yq4yEtwCfTbQ1tbesx4SBIaFFMt` — páginas amostradas: 1, 2, 3, 4, 5.
- `12E3zeZALF2fXu7Axkq-bPbqqGi8PpkLa` — páginas amostradas: 1, 2, 3, 4, 5.
- `1s_GOMN45mxvxZwbH00bL71gcHRr9V8eD` — páginas amostradas: 1, 2, 3, 4, 5.

## Artefato detalhado

O JSON associado preserva, por documento, os campos confirmados (vazios nesta rodada por critério conservador), candidato de título separado, páginas de evidência, trecho de apoio e limitações. Ele é uma fila de revisão; não deve ser usado diretamente pelo app até a aprovação dos dados.

Arquivo: `CATALOGO_BIBLIOGRAFICO_PROPOSTO_20260830.json`.

## Atualização controlada — lote 3 e validação publicada

O lote 3 foi concluído no catálogo local/runtime com promoção somente de identidades sustentadas pelo conteúdo dos chunks consultados. O catálogo atual contém **68/119 documentos**; **51 permanecem pendentes** para revisão documental individual. Não houve alteração no Supabase, chunks, embeddings, manifesto, worker ou sincronização do Drive.

Foram executados testes curtos no endpoint publicado após a publicação do lote e dos roteamentos de fonte:

| Cenário | Request ID | Evidência | Resultado |
| --- | --- | --- | --- |
| Diretrizes OMS para prevenção de infecção do sítio cirúrgico | `d7b4c8c2-95e1-4d8b-92f5-6e4c943aea7f` | `sources_found=5`, contexto presente, referência OMS 2018, p. 51; 4.667 ms HTTP; cabeçalho sem dois-pontos e sem ruído de arquivo | Aprovado |
| Alta hospitalar | `65469f70-e411-4b5e-b92a-3b1e6603d6ff` | `sources_found=5`, referência de Neide da Silva Knihs, p. 1; 8.698 ms HTTP; sem `Fonte:`, `.pdf` ou `trecho` | Aprovado |
| Preparo de medicamentos injetáveis | `c566e913-5d00-4903-a654-2051a04a9f84` | `sources_found=5`, referência Ebserh 2019, p. 11; 12.483 ms HTTP; sem `Fonte:`, `.pdf` ou `trecho` | Aprovado |
| Fios e padrões de sutura | `c77833bb-3157-4919-8fcd-8fcf030d13d4` | `sources_found=2`, referência de Keyla Cristiane do Nascimento (2020-1), p. 3; 26.894 ms HTTP; sem dois-pontos e sem ruído de arquivo | Aprovado |

Os quatro testes retornaram `has_context=true`, `has_refs=true`, `refs_colon=false`, `file_noise=false` e sem falha técnica. A latência do caso de sutura foi alta e entra na pendência de medição P50/P95; isso não altera o resultado funcional das referências.

## Triagem controlada — próximo lote

Foi feita uma nova comparação entre os 100 candidatos do artefato de revisão e o catálogo atual. Os **52 IDs que ainda não estão no catálogo** foram mantidos pendentes. Somente um deles aparece como `partial`, mas a pista disponível é uma tabela de analgésicos (cabeçalhos de colunas), sem título bibliográfico, autoria, órgão ou publicação confirmados; por isso **0 novas identidades foram promovidas** nesta triagem. Os demais permanecem `unresolved` ou sem evidência suficiente. Não houve alteração no banco, chunks, embeddings, manifesto, worker ou sincronização Drive.

Após a triagem, o ID `15cHzlZGfKjdm_Ml92ZMUUPQBSK-VoCzX` foi revisado diretamente no trecho de ficha catalográfica e promovido com título, organizador, edição, cidade/editora e ano confirmados. O catálogo passou a **68/119**, restando **51 pendentes**.

O lote 4 foi publicado na VPS após backup em `/opt/guapu-app/backups/20260830-catalog-batch4-15cHz/`. O build Docker concluiu com sucesso, o container `guapu-app` ficou `healthy` e `GET /api/health` confirmou `status=healthy` e `supabase=connected` em 30/08/2026. Nenhum dado, chunk, embedding, índice, worker ou migração foi alterado.

## Frente 4 — propagação para chunks: bloqueio confirmado

Foi realizado o preflight do ID `15cHzlZGfKjdm_Ml92ZMUUPQBSK-VoCzX`: existem **1.341 chunks** no inventário publicado, todos com o mesmo `drive_file_id` e sem `rag_status` explícito (ausência tratada pelo app como ativo). O backup dos metadados de preflight foi salvo em `/opt/guapu-app/backups/20260830-catalog-propagation-15cHz/metadata.preflight.all.json`, SHA-256 `9f958c404e1cbcb743467ed1dd7b70820872d8ca9450a354172f23d282e1995e`.

O bloqueio é que `GET /rest/v1/rag_document_catalog` retornou **0 registros** para esse ID, enquanto os chunks não possuem `reference_title` nem `reference_key`. Portanto, a migração/trigger de sincronização do catálogo para `public.documents` não está aplicada para esta entrada. A operação foi interrompida sem alterar chunks, conteúdo, embeddings, índices ou banco. A próxima ação segura é aplicar a entrada no catálogo persistente e a migração de sincronização por procedimento SQL aprovado; depois, validar cobertura dos 1.341 chunks e ausência de staging/órfãos. Nenhum SQL foi executado nesta frente.
## Atualização controlada — lote 5 de catalogação

Foram revisados até dez pendentes; quatro identidades foram confirmadas diretamente nos chunks e promovidas somente no catálogo local/runtime:

- `1FCdYFq79-qL4t0wgmmrOmaOnU_p9vDwv` — *A atuação da Angiologia e da Cirurgia Vascular na pandemia de COVID-19*, autores e registro `Rev Col Bras Cir, 47, e20202595` explícitos na primeira página.
- `1WZJNFwRSIvqsTzE3YlPo-kT9rBzfQKOO` — *Complicações no pós-operatório tardio em pacientes cirúrgicos: revisão integrativa*, autores, 2020 e `Rev Bras Enferm, 73(5), e20190290` explícitos na citação do artigo.
- `17qpoGMDN4iu6_dGZl1L620eCwxOeypvr` — *Comunicação e orientação na transição do cuidado domiciliar em pacientes pós alta*, autores, 2022 e `Research, Society and Development, 11(8), e55611831341` explícitos.
- `1ymUqtCBbHKAKBUqyuAgCrN4zfdps7LfE` — *Papel do enfermeiro na integridade emocional e física dos pacientes no pós cirúrgico: um estudo de revisão de literatura*, autores, 2022 e `Research, Society and Development, 11(10), e143111031884` explícitos.

Os seis demais documentos avaliados no lote foram mantidos pendentes por OCR incompleto ou ausência de título/autoria/publicação suficientemente confirmados. O catálogo local passou a **72/119**, com **47 pendentes**. A propagação para chunks continua deliberadamente separada e não foi executada. Testes locais: **55/55 aprovados**; `git diff --check` sem erros.

## Frente 4 completa — preflight e bloqueio de aplicação no Supabase

Foi executado preflight somente leitura para preparar a propagação dos 72 documentos catalogados. O endpoint do Supabase retornou **18 registros `verified`** em `rag_document_catalog`, enquanto o catálogo local contém 72; portanto, os 54 registros adicionais ainda precisam ser inseridos no catálogo persistente. O inventário REST retornou **57.796 chunks**; a amostra de 1.000 registros não apresentou `rag_status=staging` nem ausência de `drive_file_id`. O disco da VPS apresentou 16 GB livres de 99 GB (84% usado).

Backup do preflight: `/opt/guapu-app/backups/20260830-front4-preflight/catalog.before.json` e `document-metadata.sample.json`, com checksums registrados nos arquivos de cabeçalho/execução. Nenhum chunk foi escrito.

A propagação foi interrompida porque depende de ação SQL no Supabase: inserir/upsertar os 72 registros confirmados em `public.rag_document_catalog` e aplicar/verificar `db/migrations/040_sync_catalog_reference_metadata_to_chunks.sql`, que cria o trigger idempotente e faz o backfill somente dos metadados bibliográficos. A migração deve ser aplicada pelo SQL Editor do projeto Supabase ou por conexão PostgreSQL autorizada; o executor SQL não está disponível nesta sessão. Não é seguro substituir isso por PATCH REST em milhares de chunks. Os 47 pendentes permanecem fora do catálogo e não serão propagados.

## Pacote SQL preparado — aguardando aplicação autorizada

Foi gerado o pacote `documentos/QA/SUPABASE_CATALOGO_72_E_PROPAGACAO.sql` a partir de `reference_catalog.json`. Ele contém somente as 72 entradas `reference_verified=true`, em oito lotes idempotentes (10/10/10/10/10/10/10/2), com `ON CONFLICT (drive_file_id) DO UPDATE`. O arquivo não altera `content`, embeddings, índices, status dos chunks ou os 47 documentos pendentes. A validação estrutural local confirmou 9 `BEGIN` e 9 `COMMIT`, sem transação aberta.

Ordem segura de aplicação no SQL Editor do projeto Supabase:

1. Aplicar `db/migrations/040_sync_catalog_reference_metadata_to_chunks.sql` para criar/verificar o trigger e fazer o backfill dos registros já verificados.
2. Aplicar `documentos/QA/SUPABASE_CATALOGO_72_E_PROPAGACAO.sql` para inserir/atualizar os 72 registros confirmados em lotes pequenos.
3. Executar as consultas de aceite registradas na frente 4: contar 72 registros `verified`, verificar cobertura dos chunks por `drive_file_id`, confirmar ausência de `staging`/órfãos e comparar que `content` e embeddings não foram alterados.

Até que os dois arquivos sejam executados por uma conexão Supabase autorizada, a frente 4 permanece pendente e nenhuma alteração de produção deve ser considerada concluída. O pacote foi apenas preparado e validado localmente; não foi aplicado nesta sessão.

## Atualização controlada — revisão direta do lote 6 (10 originais do Drive)

Foram comparados diretamente com o PDF original do Drive e promovidos somente metadados bibliográficos identificáveis: `1-5n8Jt_rfg7VBwL0pA_Fn0tV--9Xywop`, `11yYTHeY94hOPFBZaB2Zlt2Wiw2qxVuX4`, `12F8539ZNtvLtx5nGmPOtUPJ6clbVvNJU`, `1ajbzLqRKBfhN6X2Dz1yIJyWVc1JQ2Hw8`, `1CIiqKR9iSXmJhaK_EiIc_zNjJCEBWEWB`, `1K2z5fV3W0HpnI8qlic6VSDEf0zS86jLv`, `1UcXuZBX8B_e2GvymQHqisVur3Fryddx7`, `1uFP54kMLDB4hpJ22P-eb-Y3IrhQ3vyz2`, `1v5cEFXfyIsZqYz7mVijoZm3seGx69pC3` e `1XoSi4a7hJA7A9GdWxQxGucwCv3WLhv1f`. O catálogo local/runtime passou de **88 para 98/119**, restando **21 pendentes**; campos ausentes no original permaneceram nulos.

O lote foi publicado no catálogo persistente via REST idempotente (`201`, 10 linhas). A validação encontrou **723 chunks** associados: todos têm `reference_source=catalog`, `reference_verified=true` e `reference_key` igual ao `drive_file_id`; `bad_chunks=0`. Nenhum conteúdo, embedding, índice, worker ou ingestão foi alterado. `npm run test:flow`: **55/55**; build concluído; container `healthy`; `/api/health`: `status=healthy`, `supabase=connected`.

## Atualização controlada — revisão final dos 14 do recorte original

Os 14 arquivos foram rechecados diretamente. Oito tinham identidade bibliográfica suficiente e foram promovidos: `14dVM...` material UFSC com três professoras identificadas; `1EPC...` artigo de dor ortopédica com seis autores e periódico; `1nAb...` artigo de dor fantasma com periódico/ano; `1O0Y...` artigo de dor musculoesquelética com seis autores e Revista Brasileira de Ortopedia; `1Pq...` artigo UFPE com cinco autores, DOI, ano e número; `1Sll...` artigo Acervo Saúde com autores e ano; `1Y0...` livro com ficha catalográfica completa; `1yqw...` livro com título, organizadores, editora e ano explícitos.

Os seis restantes permanecem pendentes e não foram preenchidos por inferência: `1_VSuj...` apostila de sinais de agravo sem autoria/instituição; `1a0Y...` apostila de recuperação segura sem autoria/edição; `1GPn...` capítulo sem identificação completa da obra; `1Tm4...` tabela de medicamentos sem fonte editorial; `1uC...` resumão sem ficha editorial; `1uLO...` livro de cardiologia com direção/editorial extensa, mas sem ficha bibliográfica completa no trecho original auditado.

O catálogo passou de **98 para 106/119**, restando **13 pendentes no conjunto geral**. O Supabase retornou `201` para 8 registros, total de **106 verificados**. A validação do lote encontrou **1.000 chunks** no limite seguro da consulta, todos válidos (`bad_chunks=0`), distribuídos individualmente em 15, 42, 26, 53, 38, 28, 31 e 767 chunks. Health: `healthy`, Supabase conectado. Nenhum conteúdo, embedding, índice, worker ou ingestão foi alterado.

## Auditoria individual final dos 6 pendentes do recorte original

Foi feita leitura integral dos seis PDFs originais do Drive, com extração de todas as páginas e inspeção visual da capa do livro de cardiologia:

| ID | Resultado | Evidência no original | Decisão |
| --- | --- | --- | --- |
| `1_VSuj...` | Sem identidade bibliográfica | Apostila de sinais de agravo na SRPA; não há autores, instituição, editora, ISBN/ISSN ou seção de referências. | Permanece pendente. |
| `1a0Y...` | Sem identidade bibliográfica | Apostila de recuperação anestésica segura; conteúdo instrucional sem autoria/edição/editora e sem seção de referências. | Permanece pendente. |
| `1GPn...` | Confirmado | Capítulo “Recursos humanos no Centro Cirúrgico”; ficha CIP confirma *Diretrizes de práticas em enfermagem cirúrgica e processamento de produtos para a saúde — SOBECC*, 7. ed., 2017, Manole/SOBECC, ISBN 978-85-204-5596-8. | Catalogado localmente; propagação persistente bloqueada por timeout. |
| `1Tm4...` | Referências existem, identidade própria não confirmada | Seção `REFERÊNCIAS` lista ANVISA/CBM, Trissel, bulas e formulários; porém o PDF é uma tabela de medicamentos elaborada por professoras e não traz título editorial/ficha segura da própria obra. | Não catalogar como livro; manter pendente e preservar as referências internas. |
| `1uC...` | Sem identidade bibliográfica | *SIC Resumão revalida — clínica cirúrgica 2*; PDF extenso sem ISBN, editora, autores ou seção de referências identificável. | Permanece pendente. |
| `1uLO...` | Confirmado | Capa mostra *Cardiologia Prática Clínica*; ficha interna confirma cinco editores, 1. ed., 2012, ISBN 978-85-99409-02-2 e SOCERJ. | Catalogado localmente; propagação persistente bloqueada por timeout. |

Os dois registros confirmados foram adicionados ao catálogo local/runtime, elevando-o para **108/119**. A tentativa de inserção persistente no Supabase retornou `57014: canceling statement due to statement timeout`; a validação posterior confirmou `catalog_rows=0` para os dois e `catalog_verified_total=106`, portanto não houve commit parcial. Os chunks também não foram alterados. O app permaneceu `healthy` e conectado ao Supabase pelo catálogo local. A propagação desses dois registros exige execução controlada do trigger/backfill em janela ou SQL otimizado; não repetir automaticamente para evitar novas operações longas.

Resultado final da auditoria individual dos seis: três PDFs não têm identificação bibliográfica suficiente; um tem referências internas, mas não identidade própria segura; dois foram confirmados documentalmente. A obra SOBECC foi propagada individualmente com sucesso (68/68 chunks). A obra de cardiologia aguarda estratégia de propagação em lotes por exceder o timeout síncrono com 767 chunks.

## Aceite da propagação dos 7 confirmados na verificação dos 11 — 31/08/2026

Após nova autorização do Tailscale SSH, os sete registros confirmados foram propagados pelo pooler IPv4 do Supabase em operações idempotentes, com backup dos metadados existentes antes de cada documento:

- `1-y2...`: 86/86 chunks;
- `12iLd...`: 186/186 chunks em dois lotes;
- `1nAn...`: 55/55 chunks;
- `1a42...`: 42/42 chunks;
- `1tlL...`: 59/59 chunks;
- `1DlF...`: 56/56 chunks;
- `12E3...`: 43/43 chunks.

Validação direta pós-commit: **115 registros `verified` no catálogo**, **57.796 documentos/chunks**, **56.986 chunks propagados**, `catalog_without_chunks=0`, `outside_catalog=0`, `staging=0`, `missing_drive_file_id=0` e trigger `sync_catalog_reference_metadata_to_chunks` habilitado (`O`). O app respondeu `healthy` com `supabase=connected`; worker e timer permaneceram `active`. Não houve alteração de `content`, embeddings, índices ou reingestão. Os quatro pendentes continuam fora do catálogo, sem metadados inventados.

## Rechecagem individual dos 4 pendentes — leitura direta dos PDFs do Drive

Em nova execução somente leitura, cada PDF foi baixado novamente pelo serviço do Drive e analisado integralmente. Os sinais confirmaram o diagnóstico anterior:

- `1uC-...`: 12.221.295 bytes e 749.011 caracteres; o texto começa com “clínica cirúrgica 2 SIC Resumão revalida”, mas não há ficha, autores/editora/ISBN ou seção de referências própria. O marcador textual de “autores” ocorre em conteúdo clínico e não constitui identificação da obra.
- `1a0Y...`: 756.001 bytes e 4.819 caracteres; material de passos de recuperação anestésica segura, sem sinais de ISBN, ficha, autoria, editora ou referências bibliográficas próprias.
- `1_VS...`: 574.713 bytes e 6.845 caracteres; tabela de sinais de agravo na SRPA, sem sinais de ISBN, ficha, autoria, editora ou referências bibliográficas.
- `1Tm4...`: 530.601 bytes e 29.205 caracteres; possui uma seção explícita `REFERÊNCIAS` com nove fontes (ANVISA/CBM, Trissel, bula Zofran, Formulário Terapêutico Nacional e outras) e autoria didática das professoras Juliana Balbinot Reis Girondi e Keyla Nascimento, mas não apresenta identificação bibliográfica formal da própria tabela. As referências internas permanecem preservadas no conteúdo, sem serem convertidas em identidade da obra.

Conclusão da rechecagem: **nenhuma das quatro deve ser promovida como livro/artigo sem informação externa ou confirmação do cliente**. O catálogo permanece **115/119**, com quatro pendências justificadas.

## Execução autorizada e aceite da frente 4

Em 30/08/2026, os dois blocos foram executados no SQL Editor do projeto Supabase `Tutor Enfermagem`, com RLS habilitado. A execução foi idempotente e o Supabase concluiu o processamento do backfill. Validação REST somente leitura, com paginação estável por `id`, confirmou:

- catálogo persistente: **72/72** registros `verified`;
- `public.documents`: **57.796** registros;
- chunks com referência bibliográfica de catálogo: **48.686**;
- IDs de catálogo com chunks propagados: **72/72**;
- IDs propagados fora do catálogo: **0**;
- chunks em `rag_status=staging`: **0**;
- chunks sem `drive_file_id`: **0**.

O endpoint publicado `/api/health` retornou `status=healthy` e `supabase=connected`. Os testes locais permaneceram em **55/55 aprovados**. A frente 4 fica funcionalmente aceita para os documentos catalogados; os 47 documentos pendentes continuam corretamente sem metadados inventados e fora da propagação.

## Reconciliacao do incidente de estoma — 30/08/2026

Preflight somente leitura confirmou 72 entradas no catalogo publicado e 72 registros `verified` no catalogo persistente do Supabase. O registro de estoma esta alinhado: `1wfGN61loXz7AcLSqxsqWZ1S639SBcymR` — `Linha de Cuidados da Pessoa Estomizada`.

Teste real publicado sobre protecao da pele ao redor do estoma: request `1cd840ff-6e03-4145-8e06-1e2a895b89af`, HTTP 200, cinco fontes, contexto presente, referencia especifica com pagina `p. 84`, cabecalho `**Referencias**` sem dois-pontos e sem `.pdf`, `[Fonte:]` ou `trecho`. A telemetria persistiu o turno com `model_used=gemini-2.5-flash-lite`, sem fallback, latencia total de 13.204 ms (embedding 433 ms; retrieval 9.276 ms; geracao 3.296 ms). A avaliacao automatica ainda nao estava concluida no instante da consulta. Health posterior: `healthy`, Supabase conectado.

## Continuação — propagação em lotes do livro de cardiologia

O catálogo local/runtime permanece em **108/119**. O catálogo persistente está em **107/119**: a obra SOBECC foi inserida individualmente e propagada em 68/68 chunks; o livro `1uLO...` ainda aguarda aplicação do SQL em lotes de 100 chunks. A tentativa automática foi interrompida porque a VPS não possui rota IPv6 para o host PostgreSQL do Supabase; o POST anterior havia retornado `57014 statement timeout` e não deixou commit parcial.

Foi preparado `documentos/QA/SUPABASE_PROPAGACAO_1ULO_LOTES.sql`, idempotente, com backup recomendado, trigger desabilitado apenas durante a transação, atualização em lotes de 100 e reativação antes do commit. Nenhuma nova tentativa automática será feita até haver execução SQL autorizada/conectividade IPv4.

## Fechamento dos bloqueios 1 e 2 — propagação pelo pooler IPv4

O pooler `aws-1-sa-east-1.pooler.supabase.com` foi validado por IPv4 com `SELECT 1`. A obra `1uLOguHlm-IuiJ7nqv-j7m1u7bKPTm3cx` foi então processada em **48 lotes** (47×100 + 34), totalizando **4.734 chunks**; a contagem maior corrigiu a subestimação anterior causada pelo limite REST de 1.000 registros. A operação teve backup de metadados antes da transação, alterou somente metadata, reativou o trigger antes do commit e concluiu sem erro.

Validação direta pós-commit: **108 registros verificados no catálogo**, **4.734/4.734 chunks propagados**, `bad=0`, `staging=0`, trigger `O` (habilitado), app `healthy`, Supabase conectado, worker e timer ativos. Os bloqueios de conectividade IPv6 e atualização monolítica foram resolvidos sem downtime, reingestão, alteração de content, embeddings ou índices.

## Verificação individual dos 11 pendentes do inventário — 30/08/2026

A lista foi reconciliada contra os **119 itens do inventário original**, e não contra a fila histórica de candidatos (que continha duplicatas). A leitura dos sinais bibliográficos disponíveis nos originais/chunks confirmou **7 novas identidades** e manteve **4 pendentes**:

| ID | Resultado | Evidência bibliográfica observada | Decisão |
| --- | --- | --- | --- |
| `1-y2...` | Confirmado | *Diretriz ACERTO de intervenções nutricionais no perioperatório em cirurgia geral eletiva*; autores, Rev Col Bras Cir 2017;44(6):633–648 e DOI explícitos. | Promovido |
| `12iLd...` | Confirmado | *Promoting Perioperative Metabolic and Nutritional Care*; Chelsia Gillis e Francesco Carli; Anesthesiology 2015;123:1455–1472. | Promovido |
| `1nAn...` | Confirmado | *Boas práticas para segurança do paciente em centro cirúrgico: recomendações de enfermeiros*; autores, Rev Bras Enferm 2018 e DOI explícitos. | Promovido |
| `1a42...` | Confirmado | *Fatores que influenciam a adesão à lista de verificação de segurança cirúrgica*; autores, Rev. SOBECC 2021;26(4):212–219 e DOI explícitos. | Promovido |
| `1tlL...` | Confirmado | *A segurança do paciente cirúrgico na perspectiva da vigilância sanitária*; autores, Vigilância Sanitária em Debate 2014;2(2) e DOI explícitos. | Promovido |
| `1DlF...` | Confirmado | *Telessaúde: a experiência dos profissionais de saúde no setor suplementar*; três autores, Rev Esc Enferm USP 2023;57:e20220374 e DOI explícito. | Promovido |
| `12E3...` | Confirmado | *Teleconsulta de enfermagem ao paciente submetido à cirurgia geral: inovação tecnológica*; autores, Global Academic Nursing Journal 2022;3(2):e250 e DOI explícito. | Promovido |
| `1uC-...` | Sem identidade suficiente | Resumão de clínica cirúrgica; não foram observados ISBN, editora, autoria ou seção bibliográfica própria. | Pendente |
| `1a0Y...` | Sem identidade suficiente | Apostila de recuperação anestésica segura; sem autoria/edição/editora ou referências próprias identificáveis. | Pendente |
| `1_VS...` | Sem identidade suficiente | Apostila de sinais de agravo na SRPA; sem autoria, instituição, editora, ISBN/ISSN ou referências. | Pendente |
| `1Tm4...` | Referências internas, obra não identificada | Há referências a ANVISA/Trissel/bulas/formulários, mas o PDF é uma tabela didática e não identifica bibliograficamente a própria obra. | Pendente; referências internas preservadas |

Os sete registros foram adicionados ao catálogo local/runtime, elevando a cobertura de **108 para 115/119**; permanecem quatro documentos sem identidade bibliográfica comprovável. O backup/diff desta rodada é o próprio histórico local de alterações e os artefatos de auditoria em `scratch/original-drive-audit-24.json` e `scratch/catalogacao_raw_20260830.json`. `npm run test:flow` passou em **55/55** e o JSON foi validado estruturalmente. A propagação dos sete novos registros ao catálogo persistente/chunks ainda requer execução no Supabase; não foi feita nesta rodada por a sessão SSH ter solicitado nova autenticação Tailscale. Nenhum chunk, conteúdo, embedding, índice, worker ou ingestão foi alterado.

## Fechamento controlado dos quatro materiais restantes — 31/08/2026

Os quatro materiais foram cadastrados como **identidades parciais**, sem inventar autoria, ano, edição ou editora. Foram usados somente cabeçalhos/seções literalmente confirmados nos PDFs originais do Drive:

- `1uC-...`: `Clínica Cirúrgica 2 — SIC Resumão Revalida`;
- `1a0Y...`: `Passo 1 — Transporte seguro`;
- `1_VS...`: `Alterações respiratórias`;
- `1Tm4...`: `Analgésicos`.

O catálogo local/runtime passou a **119/119**, com `reference_confidence=partial` nesses quatro casos. Cada entrada foi propagada ao Supabase em transação idempotente e em lotes pequenos, após backup individual dos metadados em `/opt/guapu-app/backups/20260831-catalog-partial-4/`. Resultado da validação: `catalog_verified=119`, `documents_total=57796`, `propagated_chunks=57796`, `catalog_without_chunks=0`, `outside_catalog=0`, `staging=0`, `missing_drive_file_id=0`, trigger habilitado (`O`).

`npm run test:flow`: **56/56 aprovados**. O app público permaneceu saudável, com Supabase conectado; worker e timer permaneceram ativos. Não houve alteração de conteúdo, embeddings, índices, ingestão ou reprocessamento.
