# Baseline da Fase 2A — 28/08/2026

Status: **baseline aprovado; primeira melhoria de rastreabilidade implementada e aguardando publicação/verificação real**.

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
- A validação ao vivo da referência e da telemetria fica pendente até trocar a chave Gemini de produção por uma conta com crédito e fazer um novo deploy.

## Próximas tarefas da Fase 2A

1. Versionar o corpus e testar invalidação após alteração documental.
2. Medir a rastreabilidade completa das referências — arquivo, trecho e página/seção.
3. Comparar modelos com o mesmo conjunto de perguntas, incluindo correção, latência, estabilidade e custo.
4. Avaliar cache seguro somente depois de existir `corpus_version` confiável.
5. Repetir a bateria após cada alteração e manter o baseline como comparação.
