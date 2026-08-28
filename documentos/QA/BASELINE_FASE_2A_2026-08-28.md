# Baseline da Fase 2A — 28/08/2026

Status: **rastreabilidade, seleção do modelo, proteção de latência, busca híbrida e cache seguro publicados e verificados; falta apenas repetir o ciclo end-to-end no Drive com o cache já ativo**.

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
- A repetição completa no deploy atual passou em 9/9. P50: 3,39 s; P95: 8,40 s; máximo: 8,83 s. As 6 respostas com contexto usaram `gemini-3.5-flash-lite`, todas as referências tinham `drive_file_id`, `content_hash` e `chunk_index`, e os 3 pedidos sobre o plano antigo retornaram `NO_RELEVANT_CONTEXT` sem geração.
- A primeira versão da busca híbrida foi corrigida e testada diretamente no Supabase real com três perguntas. Ela preservou as fontes esperadas, mas a latência variou de 0,25 s a 5,26 s, acima do orçamento de 3 s em pergunta ampla da Biblioteca. A busca semântica equivalente ficou entre 0,23 s e 1,04 s; essa versão inicial não foi ativada.
- A otimização adicional limitou os candidatos lexicais e eliminou a ordenação cara. O benchmark real passou em correção e orçamento: semântica entre 0,26–1,60 s e híbrida entre 0,12–1,99 s, com as fontes esperadas nos três cenários. A flag `RAG_HYBRID_ENABLED=true` foi ativada na produção com fallback semântico automático.
- Após essa ativação, a bateria crítica de produção passou em 9/9: seis respostas com evidência usaram `gemini-3.5-flash-lite`, todas as referências ficaram rastreáveis, e os três pedidos sobre o plano antigo foram bloqueados. P50: 4,50 s; P95: 8,41 s; máximo: 8,49 s. Health HTTP 200 e nove chamadas sem erro nos logs da Vercel.
- O mesmo código foi republicado a partir do commit `e9322c4` no deploy `dpl_YJ84sBgz5NQL2MUBpSZDkBRhqLu2`. O smoke test pós-publicação passou em 3/3 e o health check retornou HTTP 200; os logs posteriores não registraram timeout.
- O cache de recuperação foi implementado no commit `5854700` e publicado no deploy `dpl_Bfq3kAP3rVgZpTxtUGkQKwXC5Rhh`. Ele armazena somente os chunks recuperados, nunca a resposta gerada, com limite de 128 entradas e TTL de 5 minutos. A chave inclui versão do corpus, pergunta normalizada, modalidade, limiar e filtro de fonte.
- A flag `RAG_RETRIEVAL_CACHE_ENABLED=true` foi ativada somente depois de lint, 31 testes de fluxo, build e smoke test pré-cache aprovados. A leitura de `get_rag_corpus_version()` usa timeout dedicado de 800 ms; se falhar, o caminho continua sem cache.
- Na bateria real pós-ativação, o health check retornou HTTP 200 e 9/9 cenários passaram. A telemetria dos 9 turnos registrou versão de corpus em 9/9, 5 cache hits, 6 respostas com rastreabilidade documental e nenhuma quebra de fonte ou fallback.
- Nessa mesma bateria pós-cache, as latências totais ficaram entre 790 ms e 8.901 ms; P50 de 7.505 ms e P95 de 8.159 ms. O cache reduz a recuperação, enquanto a geração do modelo continua sendo a maior parcela do tempo nos casos com resposta fundamentada.
- A leitura repetida da versão do corpus retornou o mesmo hash nas duas consultas, com 119 itens ativos no manifesto. Ainda não foi feita uma alteração controlada no Drive para provar a troca do hash e a invalidação; esse é o único teste pendente antes de considerar a Fase 2A aprovada.
- O refinamento que separa a chave por modalidade foi publicado no commit `246be64`, deploy `dpl_2kGWgbKXwgieGd4YHhVqqUfjcwWH`. O smoke test exato desse deploy passou em 3/3, com latências de 1.872–8.575 ms, e o health check retornou HTTP 200.
- O ensaio controlado no manifesto, sem criar chunks e com limpeza garantida, passou: a versão mudou ao adicionar uma entrada ativa, mudou novamente ao retirar essa entrada, voltou ao hash original após a exclusão e os 119 ativos foram restaurados.
- O benchmark real final da recuperação passou em correção e orçamento de 3 s para os três casos, tanto na busca semântica quanto na híbrida: todas as fontes esperadas foram encontradas; a semântica ficou entre 606 ms e 1.980 ms e a híbrida entre 260 ms e 306 ms.

## Próximas tarefas da Fase 2A

1. Executar alteração controlada de um documento de teste no Drive, aguardar a reconciliação com o cache já ativo, confirmar nova `corpus_version`, ausência dos chunks antigos e nova resposta baseada no arquivo atualizado; restaurar o estado aprovado ao final.
2. Repetir a bateria após o teste de invalidação e manter este baseline como comparação.
3. Aprovar a Fase 2A somente se a atualização/remoção não servir conteúdo antigo e os critérios de latência e fundamentação continuarem passando.
