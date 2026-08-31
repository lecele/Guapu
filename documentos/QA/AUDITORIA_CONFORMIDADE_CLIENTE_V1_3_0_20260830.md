# Auditoria documental independente de conformidade — Guapu v1.3.0

**Data:** 30/08/2026  
**Escopo:** árvore de trabalho local em `C:\Users\llece\Documents\DEV\Agentes_na_Saude\Guapu`  
**Natureza:** auditoria documental e estática, com execução exclusiva de testes locais já existentes.  
**Resultado:** **NÃO LIBERAR sem ressalvas**.

## 1. Escopo e método

Foram lidos integralmente os quatro normativos indicados pelo solicitante:

1. `documentos/Ajustes 27_08_26/Impacto_Redesign_Interface_Prompt_v1.3.0_27Ago2026.docx`;
2. `documentos/Ajustes 27_08_26/01_core_identidade_etica_guardrails_3.md`;
3. `documentos/Ajustes 27_08_26/02_orquestracao_estado_adaptacao_3.md`;
4. `documentos/Ajustes 27_08_26/03_geracao_por_modalidade_3.md`.

Também foram cruzados os três relatórios de QA solicitados, o código atual relevante e os testes locais de fluxo, estado, prompts, referências, escopo administrativo e contrato de ativação do RAG.

Não houve acesso a VPS, banco, Google Drive, serviços externos ou aplicação publicada. Evidências remotas presentes nos relatórios anteriores foram tratadas como **evidência documental herdada**, sem revalidação independente. Ausência de evidência foi classificada como `não_testado`. A árvore já continha alterações não commitadas; esta auditoria avaliou o estado local encontrado, sem atribuir autoria e sem alterá-lo.

Nenhum segredo, valor de variável de ambiente, credencial ou conteúdo de arquivo sensível foi reproduzido.

## 2. Resultado quantitativo

A matriz atômica contém **53 requisitos**:

| Status | Quantidade |
| --- | ---: |
| atendido | 24 |
| parcial | 12 |
| não_atendido | 11 |
| não_testado | 6 |

Os testes locais de Node passaram em **54/54**. As duas funções do teste Python do contrato de status ativo do RAG também passaram por execução direta. Esses resultados demonstram conformidade apenas dos contratos cobertos; não substituem testes de navegador, integração com banco, recuperação real ou validação clínica.

## 3. Bloqueadores de liberação

### P0 — críticos

1. **Guardrails de saúde e integridade acadêmica não têm barreira determinística nem cobertura suficiente.** O runtime orienta o modelo a recusar, mas usa o texto normativo apenas “como base”, não garante a recusa exata e realiza recuperação antes da decisão. Há evidência documental de um caso de diagnóstico aprovado, mas não há prova local para prescrição, conduta individual, resposta de prova, conteúdo discriminatório/ilegal ou temas sensíveis fora da disciplina.
2. **A implementação viola a regra literal de referências restritas ao conteúdo dos trechos da chamada.** `lib/chat/references.ts` aceita metadados de catálogo verificado mesmo quando título, autoria, ano e editora não aparecem no chunk recuperado. Isso é intencional e testado, porém contradiz o Prompt 01 §4.2.
3. **Fatos administrativos são hardcoded.** `app/api/chat/route.ts` contém carga horária e período fixos para o plano 2026-2. A presença de chunks do plano é verificada, mas os valores retornados não são extraídos dos trechos atuais. Uma troca de plano pode produzir dado obsoleto com aparência de resposta fundamentada.

### P1 — altos

1. **Garantia bibliográfica global incompleta:** o código atual contém 20 identidades catalogadas para um universo documental reportado de 119; 99 permanecem sem curadoria equivalente.
2. **Contrato do Quiz incompleto:** o normativo aceita letra ou texto exato da alternativa; o estado local aceita somente `A`, `B`, `C` ou `D`.
3. **Pergunta livre durante modalidade ativa não segue o normativo:** durante Quiz, texto livre é tratado como resposta inválida, sem responder e retomar a questão; após Resumo, a conversa pode migrar para Livre sem retomada do fluxo.
4. **Validação universal não existe:** só o Quiz possui resposta inválida determinística. Entradas inesperadas em outros estados podem virar Pergunta Livre ou tema.
5. **Persistência/adaptação de nível ausente:** `NIVEL_ESTUDANTE` não integra `SessionState`, persistência, telemetria ou testes.
6. **Contradição de estado:** o normativo manda zerar `TEMA_ATUAL` ao concluir uma modalidade, mas também exige permitir “Aprofundar” imediatamente; o código preserva o tema para viabilizar o aprofundamento.
7. **Sem bateria visual formal desktop/mobile:** há CSS responsivo e controles acessíveis, mas nenhum screenshot, teste de viewport ou validação visual foi produzido nesta execução.
8. **Aderência fonte–resposta e latência permanecem parciais:** os relatórios documentam casos aprovados e incidentes corrigidos, mas também P95 de 16,24 s, máximo de 31,879 s e cobertura não universal.

### P2 — médios/documentais

1. Os relatórios de 30/08 apresentam números incompatíveis para catálogo: 12/119, 19/119 e 20/119. O estado local atual contém 20 entradas; a cronologia das medições deve ser explicitada em um único relatório canônico.
2. O próprio relatório anterior classifica responsividade/interface como parcial e, simultaneamente, recomenda bateria visual ainda não executada.
3. Comentários de `MessageBubble.tsx` descrevem estrelas em categorias diferentes da condição efetivamente implementada. A condição de código está alinhada ao requisito; o comentário deve ser corrigido para não induzir manutenção incorreta.

## 4. Achados por domínio

### 4.1 Identidade e interface

O cabeçalho atual exibe `Guapu` e a tag `Tutor de Enfermagem` lado a lado. A bolha do assistente usa somente `GuapuMark`, sem rótulo textual de autor. O Hero Card é estático e contém a copy normativa. Os quatro Action Cards são elementos `<button>` com os rótulos corretos e enviam `active_mode` com mensagem vazia ao backend.

A autoapresentação solicitada pelo estudante, entretanto, não está implementada com os cinco elementos obrigatórios do Prompt 01 §1. O prompt runtime reduz a identidade a nome, disciplina e UFSC, sem exigir explicitamente propósito pedagógico e vedação a respostas prontas em toda apresentação.

### 4.2 Guardrails

A distinção entre recusa e conteúdo insuficiente está implementada no fallback e no pós-processamento. Mensagens de insuficiência não recebem referências, e jargão interno é sanitizado. A recusa exata, contudo, não é uma resposta determinística do servidor; depende do modelo. Não há testes locais para a maior parte dos cinco critérios normativos.

### 4.3 Referências

Há boa cobertura unitária para cabeçalho `**Referências**` sem dois-pontos, remoção de referências inventadas pelo modelo, ausência de nome de arquivo/extensão, camadas 1–3, deduplicação, eliminação de marcadores numéricos e supressão em Quiz/recusa/insuficiência.

O desvio principal é arquitetural: o catálogo verificado amplia a referência além do texto efetivamente recuperado na chamada. Se o cliente mantiver a regra literal, essa estratégia deve ser removida ou o normativo deve ser formalmente alterado para permitir metadados bibliográficos verificados vinculados ao `drive_file_id`.

### 4.4 Fluxos e modalidades

Menu, retorno, encerramento, Action Cards, tema inline, troca de modalidade, novo Quiz e esquecimento ao iniciar nova modalidade têm implementação e testes locais. Permanecem falhas na validação universal, texto exato da alternativa, pergunta livre durante modalidade ativa, limpeza do tema ao concluir e feedback do Quiz obrigatoriamente em tópicos.

O Resumo possui instrução de 250–400 palavras, quatro blocos e encerramento em frase corrida. O frontend impede chips quando `response_kind === 'summary'`. Não houve teste de saída real para comprovar extensão e completude.

### 4.5 RAG e catálogo

Os relatórios anteriores documentam 119 documentos ativos, 57.796 chunks gerenciados, ausência de staging/órfãos e baterias temáticas aprovadas após correções. Como esta execução não acessou banco, Drive ou VPS, esses números não foram revalidados.

O estado local tem contrato de documentos ativos e teste correspondente, além de 20 entradas no catálogo runtime. A cobertura bibliográfica continua parcial e a resposta administrativa determinística hardcoded conflita com a exigência de usar somente o contexto recuperado.

### 4.6 Avaliações e telemetria

As estrelas são exibidas por `response_kind` apenas em `free`, `quiz_question` e `summary`, e são vinculadas a `session_id`/`request_id`. A API persiste avaliação 1–5 e a rota de chat registra estado, tema, questão, modelo, fallback, fontes, páginas, chunks e latências, além de enfileirar avaliação automática para turnos com contexto.

A telemetria registra documentos recuperados, mas não distingue quais fontes foram efetivamente usadas no texto ou emitidas em `**Referências**`. Assim, `has_context=true` não comprova grounding nem uso efetivo.

### 4.7 Desktop e mobile

O CSS contém breakpoints para até 920 px, até 620 px e notebooks de baixa altura, além de layout de Action Cards em uma coluna no mobile e suporte a `prefers-reduced-motion`. Sem renderização ou teste de navegador, a conformidade visual permanece parcial ou `não_testado` conforme o requisito.

## 5. Contradições registradas

1. Prompt 02 §0 declara `MODALIDADE_ATIVA` sem valor `ENCERRAR`, mas §0.2 exige Encerrar por Action Card; o código adiciona `encerrar`.
2. Prompt 03 declara entrada `MODALIDADE`, mas a nota v1.3.0 usa `MODALIDADE_ATIVA`.
3. Prompt 02 §5 exige zerar o tema ao concluir, enquanto as regras de “Aprofundar” dependem do tema recém-concluído.
4. Prompt 01 §4.1 diz que referências aparecem sempre que houve uso de RAG; Prompt 03 e os testes proíbem referências no Quiz.
5. Prompt 01 §4.2 restringe referências ao texto dos trechos; o runtime usa catálogo externo ao chunk atual.
6. O relatório de testes menciona 12/119 no resumo e 19/119 na seção de catálogo; o relatório de catalogação registra 19; a auditoria posterior e o código atual registram 20.

## 6. Conclusão

O Guapu v1.3.0 possui implementação consistente para identidade visual principal, Hero Card, Action Cards estruturados, menu, parte relevante da máquina de estados, referências formatadas, avaliações e telemetria. A suíte local existente está verde.

Ainda assim, a liberação sem ressalvas não é recomendada. Os bloqueadores centrais são: segurança dependente do modelo e pouco testada, divergência entre referência por chunk e catálogo, fatos administrativos hardcoded, cobertura bibliográfica incompleta, falhas de fluxo do Quiz/Pergunta Livre e ausência de validação visual desktop/mobile.

A decisão de liberação deve exigir, no mínimo, resolução dos P0, definição formal das contradições normativas e execução dos testes de aceite indicados na matriz `MATRIZ_REQUISITOS_CLIENTE_V1_3_0_20260830.json`.
