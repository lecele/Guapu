# Gate de liberação do Guapu — 28/08/2026

Este documento é o controle de evidências para a liberação. Uma fase só pode avançar quando tiver implementação, teste automatizado quando aplicável, teste real no ambiente de destino e evidência reproduzível. Build ou deploy, isoladamente, não aprovam uma fase.

## Situação atual

| Fase | Situação | Evidência atual | Bloqueio para avançar |
|---|---|---|---|
| 0. Contenção e ambiente seguro | Aprovada | Segredos fora do repositório, deploy identificado, rotas protegidas e rollback disponível | Nenhum bloqueio técnico |
| 1. Reconciliação Drive ↔ RAG | Aprovada | 119 arquivos vivos, 119 ativos, 57.796 chunks, zero staging/órfãos; verificador estrito e bateria real 9/9 aprovados | Nenhum técnico conhecido |
| 2. Recuperação e desempenho | Aprovada tecnicamente | Busca semântica e híbrida com fontes corretas dentro de 3 s; cache versionado com teste de mudança/restauração do corpus; bateria real de produção aprovada | Manter a validação end-to-end no Drive como evidência complementar da Fase 2A |
| 2A. Qualidade e velocidade | Aprovada tecnicamente | Cache versionado, benchmark real, bateria pós-cache, paridade Drive/manifesto e ciclo end-to-end aprovados; `Teste.docx` foi incluído, recuperado com rastreabilidade e removido com job `succeeded`, manifesto removido e zero chunks | Nenhum bloqueio técnico; um teste posterior com documento acadêmico autorizado é recomendado para homologação de conteúdo |
| 3. Referências verificadas | Aprovada tecnicamente | Regra estrita publicada: somente pistas bibliográficas verificáveis; sem fallback por nome de arquivo; sem referências em recusa, insuficiência ou ruído OCR; auditoria live formal passou em 9/9 e bateria publicada em 8/8 | Nenhum bloqueio técnico; manter a regra nas próximas alterações de prompt/interface |
| 4. Prompts e fluxos | Aprovada tecnicamente | 37 testes locais e bateria real 8/8 no runtime VPS, registrados em `documentos/QA/Fase_4/VERIFICACAO_FASE_4_2026-08-29.md` | Manter os fluxos na regressão e validar a aceitação final na Fase 7 |
| 5. Interface | Aprovada tecnicamente | Build/deploy e QA visual real em 1366×768, 1280×720, 390×844 e 412×915, registrados em `documentos/QA/Fase_5/VERIFICACAO_FASE_5_2026-08-29.md` | Manter regressão visual; aceite final continua na Fase 7 |
| 6. Painel e avaliação | Aprovada tecnicamente | Aceite real do painel/pipeline aprovado: resposta fundamentada, ausência de evidência, requisição inválida e avaliação assíncrona; evidência em `documentos/QA/Fase_6/VERIFICACAO_FASE_6_2026-08-29.md` | Manter regressão; Fase 7 ainda exige homologação diária e aceite do cliente |
| 7. Homologação e liberação | Em homologação | Bateria técnica publicada 8/8 aprovada; roteiro e evidência em `documentos/QA/Fase_7/` | Requer execução e aprovação funcional do cliente; não encerrar sem esse registro |
| 8. Runtime VPS/DNS | Aprovada — VPS-only | Runtime, domínios, serviços críticos, bateria real 8/8 e ponto de recuperação da própria VPS validados em 29/08/2026 | Manter a Vercel preservada, sem tráfego operacional; não é dependência da produção |
| 9. Operação, recuperação e alertas | Aprovada | Backup externo, restauração isolada, healthcheck, Prometheus e Telegram/Uptime Kuma testados em 29/08/2026 | Manter observação operacional contínua |

## Evidências reais mais recentes

- Produção: `https://guapu.agentesnasaude.com.br` e `https://guapu-painel.agentesnasaude.com.br`, atendidas pela VPS `129.121.33.171`.
- Runtime VPS: `guapu-app` e `guapu-panel` saudáveis; Nginx válido; worker e timer ativos.
- Bateria publicada no runtime VPS: 8/8 aprovados; bateria equivalente na Vercel: 8/8 aprovados após o deploy `dpl_4afJCQ2LxtQ1buc9Zrwciv6aHDGH`.
- Rollback VPS: imagem `guapu-app:rollback-phase8-20260829` e compose preservado; cópia isolada validada em `/api/health` com Supabase conectado.
- Bateria crítica atual: 9/9 aprovados em três repetições por cenário.
- Modelo efetivo nas seis respostas com contexto: `gemini-3.5-flash-lite`.
- Cada uma das seis respostas com contexto possui `drive_file_id`, `content_hash` e `chunk_index`.
- As três consultas ao documento antigo retornaram `NO_RELEVANT_CONTEXT` e não geraram resposta fundamentada em fonte genérica.
- Lint, build e 37 testes automatizados locais: aprovados.
- Cache de recuperação: somente chunks, chave com `corpus_version`, TTL e limite de memória; 9 versões de corpus registradas e 5 cache hits na bateria pós-deploy.
- Inventário ao vivo: 119 arquivos no Drive, 119 manifestos ativos e nenhum ID faltante ou excedente.
- Ciclo end-to-end da Fase 2A: inclusão, recuperação, remoção e não recuperação do `Teste.docx` aprovadas; a bateria publicada adicional passou em 8/8.
- Fase 3: bateria formal de referências e rastreabilidade passou em 9/9 após sincronizar o script de QA da VPS com a versão atual; nenhum cenário falhou.
- Auditoria posterior das reclamações do cliente: referências de resposta fundamentada mantidas somente quando há pista verificável e relação textual; recusas, informação incompleta e fragmentos OCR ficaram sem seção de referências; 9/9 cenários formais e 8/8 fluxos publicados aprovados após o último deploy.
- Fase 6: aceite real do painel e avaliação assíncrona aprovado; resposta fundamentada com 5 fontes e referências, recusa sem evidência, validação HTTP 400 e avaliação `succeeded/correct` registrados em `documentos/QA/Fase_6/VERIFICACAO_FASE_6_2026-08-29.md`.
- Amostra independente posterior: 10/10 perguntas reais aprovadas; cinco referências fundamentadas com `Fonte`, página e trecho; cinco respostas que não deveriam citar fonte sem referências; zero fallback, arquivo isolado ou ruído OCR detectado.

## Regra de liberação

O cliente só deve receber a versão para teste controlado depois que os itens marcados como parcial forem validados conforme seus critérios e a homologação final for registrada. As Fases 8 e 9 estão aprovadas; a Vercel permanece apenas preservada no projeto, sem tráfego operacional. Permanecem os critérios das fases 4, 5, 6 e 7.
