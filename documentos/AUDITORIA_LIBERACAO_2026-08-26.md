# Auditoria de liberação — Guapu

Data da coleta: 26 de agosto de 2026, 16:03 (America/Sao_Paulo).

## Decisão

**Aprovado para teste controlado do cliente.** O fluxo, o RAG, a sincronização e o monitoramento estão operacionais. A aprovação não equivale a validação clínica/acadêmica definitiva: os prompts finais do cliente e uma amostra maior de respostas ainda devem ser homologados antes de uma liberação ampla.

## Evidências em produção

| Indicador | Resultado |
| --- | ---: |
| Fontes indexadas | 182 |
| Trechos vetorizados | 48.023 |
| Conversas reais monitoradas | 222 |
| Mensagens reais monitoradas | 1.134 |
| Respostas instrumentadas | 567 |
| Latência RAG P50 | 4,72 s |
| Latência RAG P95 | 29,12 s |
| Falhas de recuperação | 0 |
| Falhas de modelo | 0 |
| Uso de fallback | 0 |
| Respostas com contexto recuperado | 74% |
| Avaliações automáticas concluídas | 14 de 14 elegíveis |
| Conformes às evidências recuperadas | 11 |
| Sem evidência suficiente | 3 |
| Incompletas/incorretas | 0 / 0 |
| Falhas da sincronização do Drive | 0 |
| Jobs concluídos do Drive | 105 |
| Monitoramento técnico | saudável, sem alertas |

## Conclusões técnicas

- O chat gera o embedding da pergunta com `gemini-embedding-2`, recupera até cinco trechos no pgvector/Supabase e registra fontes, similaridade, latência e modelo em cada turno.
- A resposta recebe referências somente dos documentos efetivamente recuperados; o modelo não decide sozinho quais documentos citar.
- O modelo de geração é configurável por `GEMINI_CHAT_MODEL` (padrão de código `gemini-3.5-flash`). Não houve fallback ou falha de modelo na amostra instrumentada.
- A avaliação automática roda de forma assíncrona usando os mesmos trechos do RAG; portanto não adiciona tempo à resposta do estudante.
- A sincronização Google Drive → VPS → Supabase foi validada anteriormente para inclusão, alteração e remoção de arquivos.
- O painel administra conversas reais, qualidade, latência, fontes e saúde operacional; sessões sintéticas de aceitação não entram nas métricas de alunos.

## Limites e condição para liberação ampla

1. A taxa de 79% de conformidade é uma medida automática de aderência às evidências, não uma certificação clínica. Os três casos sem evidência suficiente devem orientar novos testes e possível melhoria da base documental.
2. A amostra de 14 avaliações ainda é pequena. Para uma decisão acadêmica final, recomenda-se revisar pelo menos 30–50 perguntas representativas aprovadas pela docência.
3. A P95 de 29,12 s é aceitável para perguntas complexas com RAG, mas não é uma resposta instantânea. O P50 de 4,72 s representa a experiência mais comum.
4. Há três jobs de Drive em execução no momento da coleta e nenhum falho. Se permanecerem em execução por mais de uma hora, devem ser investigados na VPS antes de nova carga documental.
5. Os três prompts atualizados do cliente ainda não foram recebidos; sua integração deve passar novamente pela mesma bateria de aceitação.

## Checklist antes do convite ao cliente

- [x] Interface desktop e mobile publicada.
- [x] Painel protegido e com métricas reais.
- [x] Monitoramento assíncrono de Supabase, Drive e avaliador.
- [x] Build, lint, testes de fluxo e testes de sincronização aprovados.
- [x] Domínios técnicos publicados: `guapu.vercel.app` e `guapu-painel.vercel.app`.
- [ ] Receber e homologar os prompts finais do cliente.
- [ ] Definir a amostra oficial de perguntas para aceite acadêmico.
- [ ] Configurar os domínios definitivos `guapu.agentesnasaude.com.br` e `painel.guapu.agentesnasaude.com.br`, quando o DNS estiver disponível.
