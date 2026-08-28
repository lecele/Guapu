# Baseline da Fase 2A — 28/08/2026

Status: **rastreabilidade, seleção do modelo, proteção de latência e painel operacional publicados e verificados; cache seguro permanece pendente**.

## Medição real

- Endpoint: `https://guapu.vercel.app/api/chat`.
- Corpus: 119 arquivos ativos e 57.796 chunks ativos.
- Amostra: 30 requisições reais, 10 por cenário, com concorrência moderada de 5 workers.
- Erros HTTP: 0.
- P50 total percebido: 6.343 ms.
- P95 total percebido: 10.470 ms.
- Mínimo: 1.329 ms.
- Máximo: 12.834 ms.

## Correção documental

- Plano vigente: 10/10 respostas recuperaram `administrativo__plano_ensino_INT55224__plano__ufsc__2026_2.pdf`, sem o plano antigo.
- Biblioteca/glossário: 10/10 respostas recuperaram a fonte equivalente ao conteúdo `glossario` (`glossario.docx`).
- Falta de evidência: 10/10 respostas acionaram `NO_RELEVANT_CONTEXT`, fallback seguro e zero fontes recuperadas.

## Resultado

O baseline atende à meta provisória do plano: P50 abaixo de 8 s, P95 abaixo de 15 s e taxa de erro abaixo de 1%. As respostas críticas permaneceram fundamentadas durante a carga moderada.

## Melhoria implementada nesta etapa

- O contexto entregue ao modelo passa a identificar, quando disponível, arquivo, página e número do trecho recuperado.
- A telemetria de cada resposta passa a guardar `drive_file_id`, `content_hash`, página, trecho e seção de cada chunk recuperado.
- As referências exibidas ao estudante passam a trazer a origem exata do chunk gerenciado pelo Drive, com página/trecho quando esses metadados existem.
- Chunks sem vínculo comprovado com o Drive não ganham uma origem artificial na resposta.
- A melhoria foi coberta por teste de referência e não altera a quantidade de chamadas ao Gemini.

## Publicação e bloqueio da validação ao vivo

- Build local, lint e 31 testes automatizados passaram antes da publicação.
- A versão foi publicada na Vercel e está `Ready`, com os aliases de produção preservados.
- A primeira consulta real pós-publicação foi registrada com `EMBEDDING_FAILED` porque a chave `GOOGLE_API_KEY` de produção recebeu `429 RESOURCE_EXHAUSTED` (créditos pré-pagos esgotados). Isso é uma indisponibilidade da conta Gemini, não uma falha do código de rastreabilidade.
- A chave de produção foi substituída pela chave paga disponível em `Tutor/.env.simulacao`, sem expor o segredo, e um novo deploy foi concluído com status `Ready`.
- A validação ao vivo pós-troca confirmou resposta fundamentada e rastreável. A bateria crítica repetida passou em 3/3: plano vigente, glossário e bloqueio de plano antigo. Latências da repetição: 8,5 s, 9,2 s e 1,8 s; o único fallback foi o cenário sem evidência, conforme esperado.
- Em uma bateria anterior, o modelo primário recebeu 503 temporário por alta demanda e o fallback respondeu corretamente em 23,9 s. A ocorrência foi registrada como instabilidade transitória do provedor, não como erro de fonte/RAG; a repetição posterior não reproduziu o 503.
- Comparação controlada de geração com o mesmo contexto: `gemini-3.5-flash-lite` respondeu corretamente em aproximadamente 0,9 s; `gemini-3.1-flash-lite` respondeu corretamente em aproximadamente 5,1 s; `gemini-3.5-flash` sofreu indisponibilidade temporária; `gemini-3.6-flash` não respeitou o formato curto do teste. A ordem de produção foi ajustada para priorizar `gemini-3.5-flash-lite`, com fallback para `gemini-3.1-flash-lite` e depois `gemini-3.5-flash`.
- Após a configuração, a bateria real no deploy de produção passou em 3/3: plano vigente e glossário usaram `gemini-3.5-flash-lite` sem fallback, em 4,4 s e 7,2 s; o bloqueio de plano antigo retornou `NO_RELEVANT_CONTEXT` em 2,0 s.
- A repetição prevista de 3 vezes por cenário passou em 9/9. As 6 respostas com evidência usaram o modelo principal sem fallback; os 3 casos de plano antigo foram bloqueados antes da geração. P50 total: 7,38 s; P95: 8,73 s; mínimo: 0,90 s; máximo: 8,73 s.
- A migração `024_add_rag_corpus_version.sql` cria uma versão determinística do manifesto ativo para auditoria e futura invalidação de cache. A consulta dessa versão foi mantida fora do caminho crítico do aluno após uma medição serverless mostrar que uma chamada REST adicional pode ficar pendurada; o cache permanece desligado até existir timeout/telemetria próprios.
- Para proteger o tempo de resposta, as chamadas Supabase do app e do health têm timeout explícito de 6 s e a busca vetorial usa no máximo duas tentativas. Em instabilidade externa, a resposta cai em fallback controlado em vez de aguardar o limite de 120 s.
- Após o deploy `dpl_HYvbAWkPyjzRNwJjEX4bwSSWAUiu`, a bateria real de fumaça passou em 3/3: plano vigente com fonte atual (9,45 s), glossário com fontes recuperadas (8,30 s) e bloqueio do plano antigo (2,15 s, `NO_RELEVANT_CONTEXT`). Os logs posteriores registraram as três chamadas e o health check sem novo timeout; o timeout de 120 s registrado antes do deploy permanece apenas como evidência do problema corrigido.
- O endpoint administrativo foi validado com autenticação e passou a exibir o modelo efetivamente usado e a taxa de fallback a partir da telemetria real, mantendo as sessões de regressão fora dos indicadores operacionais. Na leitura atual: 162 turnos instrumentados, P50 de 7,78 s, P95 de 27,34 s e fallback em 22% do histórico, com predominância histórica do modelo `gemini-3.5-flash`; as chamadas novas de homologação já usam `gemini-3.5-flash-lite`.

## Próximas tarefas da Fase 2A

1. Versionar o corpus e testar invalidação após alteração documental.
2. Medir a rastreabilidade completa das referências — arquivo, trecho e página/seção.
3. Comparar modelos com o mesmo conjunto de perguntas, incluindo correção, latência, estabilidade e custo.
4. Avaliar cache seguro somente depois de existir `corpus_version` confiável.
5. Repetir a bateria após cada alteração e manter o baseline como comparação.
