# Evidências de otimização de referências e latência — 2026-08-29

## Fonte de aceitação

Os critérios usados nesta rodada permanecem subordinados aos documentos do cliente em `documentos/Ajustes 27_08_26`, especialmente os três prompts operacionais e `Impacto_Redesign_Interface_Prompt_v1.3.0_27Ago2026.docx`.

## Correções publicadas

- A resposta administrativa sem confirmação no plano passou a usar exatamente: `Consultar o plano de ensino na página da disciplina no Moodle.`
- A detecção de ausência foi corrigida para reconhecer frases com caracteres acentuados, como `não há registro`.
- O modelo padrão operacional foi alinhado ao modelo mais estável nas medições da VPS: `gemini-2.5-flash-lite`; os fallbacks permanecem controlados.
- A filtragem de referências continua baseada no conteúdo recuperado e na pertinência textual à pergunta, sem usar nome de arquivo como bibliografia.

## Testes locais

- `npm run test:flow`: 46/46 aprovados.
- `npm run lint`: aprovado.
- `npm run build`: aprovado.

## Testes públicos pós-publicação

- Health: HTTP 200, aplicação saudável e Supabase conectado.
- Informações, pergunta `quais são as aulas no dia 16/09`, com modalidade Informações: fallback exato, `sources_found=5`, sem referências e sem jargão interno; tempo do servidor observado: 4,632 s.
- Pergunta `Cuidados pré-operatórios`: `sources_found=5`, sem ocorrência de Cuidados Paliativos, com referência pertinente `Fase Pré-operatória`; tempo do servidor observado: 8,077 s.
- Pergunta sobre a qualidade da água nas etapas da limpeza, repetida três vezes: 5 fontes em cada execução, sem repetição espúria de `enxágue`, sem referência paliativa; tempos observados: 7,999 s, 6,990 s e 4,715 s.

## Pendência de otimização

A latência clínica melhorou ao priorizar o modelo Flash Lite validado, mas ainda varia conforme a disponibilidade do provedor e o custo de geração. A próxima etapa deve medir P50/P95 em uma janela maior e somente então avaliar cache ou redução adicional de chamadas, sem alterar as regras de pertinência, rastreabilidade e bloqueio definidas pelo cliente.

## Correção visual posterior

- A área rolável da conversa recebeu `scroll-padding-top` e as respostas do tutor receberam `scroll-margin-top`, impedindo que o cabeçalho cubra o avatar ou a primeira linha da resposta.
- A correção foi validada na interface publicada em viewport de desktop e em viewport móvel de 390 × 844 px.
- Health pós-publicação: aplicação `running healthy`, HTTP 200 e Supabase conectado.

## Medição de disponibilidade do provedor e ajuste de fallback

- O teste direto na VPS, com prompt mínimo e sem exibir a chave, mediu `gemini-2.5-flash-lite` em 0,59 s, `gemini-2.5-flash` em 0,69 s e `gemini-3.1-flash-lite` em 1,97 s.
- Na mesma janela, `gemini-3.5-flash-lite` e `gemini-3.5-flash` excederam o limite de 12 s. O log do app confirmou 503/UNAVAILABLE nos modelos 3.5.
- O padrão do app foi alinhado a `gemini-2.5-flash-lite`, seguido por `gemini-2.5-flash`, `gemini-3.1-flash-lite` e os modelos 3.5 como fallback.
- Após a publicação: fallback administrativo exato em 4,0 s; pré-operatório em 7,4 s com 5 fontes, sem paliativos e com referência; água/limpeza em 7,5 s com 5 fontes, sem repetição de enxágue, sem paliativos e sem jargão interno.
- O circuito de resfriamento de 60 s impede repetir imediatamente modelos que falharam por 503, 429 ou timeout.

## Correção estrutural do fallback de referências

- A pergunta real `Controle de infecção no perioperatório` foi auditada no Supabase. Os cinco chunks recuperados tinham `drive_file_id`, página, índice e hash, mas nenhum `reference_title`; por isso a versão anterior exibiu indevidamente o fallback apesar de haver material consultado.
- A ficha catalográfica de Brunner foi conferida no próprio conteúdo indexado (p. 6): título, responsáveis, 12ª edição/reimpressão de 2014 e Guanabara Koogan. A folha inicial de SOBECC foi conferida no próprio conteúdo OCR (p. 1): título, 6ª edição e 2013.
- Foi implementado um catálogo bibliográfico verificável por `drive_file_id`, com migração SQL `031_add_rag_document_reference_catalog.sql`, bootstrap versionado para atualização segura do app e propagação dos metadados na ingestão futura. A estrutura e as seis identidades iniciais da 031 foram aplicadas diretamente no Supabase; a atualização em massa dos chunks legados foi separada para não manter uma transação pesada em produção.
- A montagem das referências agora aceita identidade catalogada verificada mesmo quando o chunk clínico não contém a capa, inclui página real do chunk e deduplica várias páginas do mesmo documento. Nome de arquivo, extensão e caminho continuam proibidos.

## Testes reais após a correção estrutural

- Build/redeploy na VPS: container `guapu-app` voltou `running healthy`; `/api/health` confirmou `healthy` e Supabase conectado.
- Pergunta pública real `Controle de infecção no perioperatório`: `sources_found=5`, `response_kind=free`, `processing_time_ms=8032`, seção `**Referências:**` presente, fallback ausente e nome técnico de arquivo ausente. Referência retornada: `Lillian Sholtis Brunner; Doris Smith Suddarth; Suzanne C. Smeltzer (ed.) (2014). Brunner & Suddarth: Tratado de enfermagem médico-cirúrgica. 12ª ed. [reimpr.]. Rio de Janeiro: Guanabara Koogan. p. 2313.`
- Um segundo teste direcionado a limpeza/enxágue apresentou falha transitória de geração do modelo e foi tratado como incidente de disponibilidade, não como sucesso de referência; a resposta técnica não publicou referências, conforme a regra do cliente para falha sem resposta clínica. O código não foi alterado para mascarar essa falha.
- Testes locais finais: `npm run test:flow` 45/45, `npm run lint` aprovado, `npm run build` aprovado e testes Python de ingestão/metadados 8/8.

## Catálogo inicial — histórico superado pela revalidação final abaixo

- A primeira auditoria somente leitura encontrou 6 documentos e 39.128 chunks; a reauditoria posterior identificou mais dois documentos ativos menores, conforme registrado na seção final.
- As seis identidades abaixo foram conferidas nas primeiras páginas indexadas e passaram a ser resolvidas por `drive_file_id`, sem derivação do nome do arquivo, antes da inclusão dos dois consensos adicionais:
  - Cuidados críticos de enfermagem: abordagem holística — título confirmado na folha inicial; autor e ano não foram preenchidos porque o OCR não os confirmou com segurança.
  - Manual Técnico de Arquitetura, Engenharia e Operação: Tutor de Enfermagem — título confirmado na p. 1.
  - Glossário Técnico — título confirmado na p. 1.
  - Nutrition Assessment: Clinical and Research Applications — Nancy Munoz e Melissa Bernstein, 2019, Jones & Bartlett Learning, conferidos nas p. 4–5.
  - Práticas Recomendadas SOBECC — 6ª edição, 2013, conferidos na p. 1.
  - Brunner & Suddarth: Tratado de enfermagem médico-cirúrgica — ficha catalográfica conferida na p. 6.
- O catálogo inicial foi ampliado no bootstrap do app, no catálogo JSON do ingestador e na migração SQL 031. A estrutura/seed da 031 está aplicada diretamente no banco; a aplicação publicada também resolve as referências no momento da recuperação.

## Revalidação final de referências e escopo — 2026-08-29

- A busca passou a reconhecer o nome explícito da obra na mensagem original do estudante. Quando há uma obra cadastrada, a recuperação fica restrita à fonte exata; se a função filtrada do banco não retorna candidatos, o fallback vetorial aplica o mesmo filtro localmente. Perguntas genéricas continuam sem restrição artificial.
- A auditoria REST completa do inventário ativo encontrou 8 documentos e 39.128 chunks. Os dois documentos que ainda não tinham identidade catalogada foram conferidos pelos cabeçalhos: o consenso de incisão cirúrgica de Wounds International (2022) e o consenso de deiscência de ferida cirúrgica da World Union of Wound Healing Societies (2018). Ambos foram adicionados ao bootstrap do app, ao catálogo JSON e à migração SQL 032.
- O catálogo runtime e o catálogo SQL agora cobrem os 8 `drive_file_id` ativos. A migração 032 foi aplicada diretamente no banco. O backfill integral dos metadados físicos dos chunks legados não foi forçado: a tentativa foi cancelada após confirmar I/O elevado, sem alterar conteúdo ou vetores; o app usa o catálogo verificável por `drive_file_id`.
- Bateria real principal após o deploy: **5/5 aprovados** (Glossário, Manual Técnico, Cuidados críticos, Nutrição e SOBECC). Todos retornaram fonte compatível, referência bibliográfica catalogada e página real; em algumas execuções o modelo primário sofreu 503/timeout e o fallback controlado respondeu sem perder a referência.
- Testes reais direcionados dos dois documentos recém-catalogados: **2/2 aprovados**. Incisão cirúrgica retornou exclusivamente `ferida__consenso_ferida_cirurgica__guia__wounds_international__2022__v1` e `Rhidian Morgan-Jones (chair) et al. (2022)... p. 2`; deiscência retornou exclusivamente `ferida__consenso_deiscencia__guia__wounds_international__2018__v1` e `World Union of Wound Healing Societies (2018)... p. 10`.
- Não foi declarado um único lote de 7/7 porque a API apresentou 503/timeout durante a tentativa longa. A funcionalidade ficou aprovada em blocos independentes: 5/5 + 1/1 + 1/1. Falha de provedor não é convertida em sucesso; o app mantém fallback seguro e não publica referências quando não há resposta clínica.
- Validação pós-publicação: `guapu-app` e `guapu-panel` saudáveis, Supabase conectado, worker de Drive ativo e worker de qualidade ativo. O código local passou `npm run lint`, `npm run build`, `npm run test:flow` (46/46) e compilação dos scripts Python.

## Aplicação direta no Supabase e smoke test — 2026-08-30

- Conexão direta validada como usuário `postgres`; a 031 criou `public.rag_document_catalog` e inseriu 6 identidades verificadas. A 032 inseriu/atualizou as duas identidades Wounds International e propagou os metadados desses dois documentos.
- O catálogo SQL ficou com **8 registros `verified`**, correspondendo aos 8 documentos ativos do inventário. O backfill opcional dos chunks antigos ficou parcial (2.000 chunks do primeiro lote), pois a atualização integral reescreve JSONB junto com embeddings e excedeu o limite operacional; essa operação não é necessária para o resolver de referências catalogadas do app.
- Smoke test real no endpoint publicado, executado no VPS: HTTP 200, telemetria presente, `has_context=true`, fonte exclusiva do consenso de incisão, referência catalogada presente e página presente. Latência observada: 31.681 ms (31,7 s).

## Verificação final ao vivo — 2026-08-30

- Acesso Tailscale revalidado. O domínio público do app respondeu HTTP 200 em `/api/health`; o painel público respondeu HTTP 200 em `/api/health`.
- `guapu-app` e `guapu-panel` estão `running (healthy)`. O proxy Nginx está ativo no contêiner `agentes-saude-nginx`; o serviço Nginx do host aparecer inativo é esperado nesta arquitetura.
- `guapu-drive-sync-worker.service` está ativo, habilitado e sem reinicialização há quase dois dias. O `guapu-healthcheck.timer` está ativo e habilitado, com coleta a cada cinco minutos.
- Fila verificada via Supabase REST: 101 jobs `new`, 7 `changed` e 4 `removed`; todos em `succeeded`, sem `queued`, `running` ou `failed`.
- Bateria real atual publicada: **6/6 aprovados** (2× plano vigente, 2× glossário DOCX e 2× plano antigo bloqueado). O plano retornou exclusivamente a fonte do plano vigente; o glossário retornou `glossario.docx`; o plano antigo retornou `NO_RELEVANT_CONTEXT` com fallback controlado e sem referências indevidas.
- Latências totais da bateria: 0,890 s, 2,714 s, 2,922 s, 3,497 s, 3,616 s e 7,625 s; P50 observado de 2,922 s e P95 aproximado de 3,616 s. Essa é uma amostra curta de aceite, não substitui a janela operacional maior.
- O incidente anterior de 502 foi corrigido de forma durável com resolução dinâmica Docker no Nginx (`resolver 127.0.0.11`, backend por nome de serviço). Após a correção, app e painel voltaram a responder normalmente.

## Correção do plano vigente e teste real repetido — 2026-08-30

- O chunk ativo da p. 1 do plano vigente foi conferido diretamente no Supabase: `drive_file_id` `1if-C_IzjQFeg3nPTTcXNWJKT8YooUHIR`, semestre `2026-2`, carga total de 216 h, 126 h teóricas, 90 h teórico-práticas (incluindo 18 h de extensão), com cargas semanais de 25 h teóricas e 30 h teórico-práticas.
- O catálogo bibliográfico foi corrigido para o schema real de `rag_document_catalog` e recebeu a identidade verificada do plano vigente; a migração versionada ficou em `db/migrations/033_add_active_plan_reference_catalog.sql`.
- A pergunta administrativa passou a usar uma resposta determinística baseada exclusivamente na tabela do plano quando os chunks recuperados pertencem ao documento vigente. Isso impede que o modelo altere números ou misture referências clínicas.
- A regra de referências passou a impedir que um item catalogado de outro documento seja citado quando a recuperação mistura fontes administrativas e clínicas.
- Testes locais finais: `npm run test:flow` **48/48**, `npm run lint` aprovado e `npm run build` aprovado.
- Deploy na VPS: `guapu-app` e `guapu-panel` reconstruídos e saudáveis; os dois endpoints `/api/health` retornaram `healthy` com Supabase conectado.
- Bateria real publicada com repetição: **6/6 aprovados**. As duas consultas ao plano retornaram os mesmos fatos (216/126/90, 18 h de extensão, 25/30 semanais, período 2026-2) e a referência exclusiva do `Plano de Ensino 2026-2`, p. 1. As duas consultas ao glossário DOCX mantiveram `Glossário Técnico, p. 1`; as duas consultas ao plano antigo retornaram `NO_RELEVANT_CONTEXT`, sem referências indevidas.
- O teste foi executado com a resposta real do domínio publicado e repetição 2 por cenário; não foi usado resultado simulado.

## Janela ampliada de latência — 2026-08-30

- Foram executadas **30 chamadas reais** no domínio publicado, sendo 10 para o plano vigente, 10 para o glossário DOCX e 10 para o plano antigo bloqueado.
- Resultado funcional: **30/30 aprovadas**, sem erros HTTP, sem falhas de telemetria e sem fontes indevidas. O plano vigente retornou exclusivamente o PDF administrativo correto; o glossário retornou `glossario.docx`; o plano antigo retornou `NO_RELEVANT_CONTEXT` em todas as 10 chamadas.
- Latência total registrada pelo telemetry: mínimo **408 ms**, mediana/P50 **897 ms**, P95 aproximado **3.256 ms** e máximo **3.499 ms**.
- O fallback ocorreu somente nas 10 consultas ao plano antigo, como fallback de conteúdo esperado; não houve fallback indevido nas 20 respostas fundamentadas.
- A medição amplia a evidência operacional da etapa de latência. A otimização adicional fica condicionada a uma janela contínua posterior, caso seja necessária, sem alterar as regras de referências e pertinência.

## Revalidação autônoma após a correção do pós-operatório — 2026-08-30

- Foi reproduzida uma falha de referência no cenário pós-operatório: havia resposta clínica, mas aparecia o fallback bibliográfico. A correção adicionou três identidades clínicas verificadas ao catálogo e passou a respeitar a obra explicitamente citada quando a recuperação traz ruído de outra fonte.
- Testes locais finais: `npm run test:flow` **50/50**, `npm run lint` aprovado e `npm run build` aprovado.
- Bateria por obra no domínio publicado: **7/7 aprovados** (Glossário, Manual Técnico, Cuidados Críticos, Incisão 2022, Deiscência 2018, Nutrição e SOBECC). Todos tiveram fonte correspondente, referência e página real.
- Nova janela crítica: **30/30 aprovados**, 10 plano vigente, 10 glossário e 10 plano antigo bloqueado. P50 **928 ms**, P95 **16.240 ms**, máximo **31.879 ms**. A cauda alta veio de trocas de modelo do provedor e permanece pendência de otimização, não falha de referência.
- Inventário vivo do Drive: 119 arquivos, 118 PDFs e 1 DOCX; manifesto 119/119; 57.796 chunks ativos gerenciados; zero staging, órfãos, jobs pendentes ou falhos.
- O verificador estrito passou usando o inventário vivo. Uma execução anterior com o JSON local antigo produziu divergência do glossário substituído; a investigação confirmou remoção do ID antigo e ingestão do DOCX novo, sem perda de cobertura.
- Painel autenticado: HTTP 200, monitoramento `healthy`, sem alertas; 112 jobs concluídos; 381 avaliações automáticas concluídas, zero na fila/em execução/falhas, cobertura 97% e conformidade 79%; feedback 4/5 em 8 avaliações, satisfação 75%.
- O catálogo bibliográfico curado contém 12 dos 119 documentos ativos. Os outros 107 seguem rastreáveis no RAG e podem ter referência extraída do conteúdo, mas não devem ser anunciados como identidades bibliográficas curadas até revisão documental individual.
