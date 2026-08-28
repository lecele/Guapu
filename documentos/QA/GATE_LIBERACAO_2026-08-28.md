# Gate de liberação do Guapu — 28/08/2026

Este documento é o controle de evidências para a liberação. Uma fase só pode avançar quando tiver implementação, teste automatizado quando aplicável, teste real no ambiente de destino e evidência reproduzível. Build ou deploy, isoladamente, não aprovam uma fase.

## Situação atual

| Fase | Situação | Evidência atual | Bloqueio para avançar |
|---|---|---|---|
| 0. Contenção e ambiente seguro | Aprovada operacionalmente | Segredos fora do repositório, deploy identificado e rotas protegidas | Manter rollback disponível |
| 1. Reconciliação Drive ↔ RAG | Aprovada | 119 arquivos vivos, 119 ativos, 57.796 chunks, zero staging/órfãos; verificador estrito e bateria real 9/9 aprovados | Nenhum técnico conhecido |
| 2. Recuperação e desempenho | Aprovada tecnicamente | Busca semântica e híbrida com fontes corretas dentro de 3 s; cache versionado com teste de mudança/restauração do corpus; bateria real de produção aprovada | Manter a validação end-to-end no Drive como evidência complementar da Fase 2A |
| 2A. Qualidade e velocidade | Aprovada tecnicamente | Cache versionado, benchmark real, bateria pós-cache, paridade Drive/manifesto e ciclo end-to-end aprovados; `Teste.docx` foi incluído, recuperado com rastreabilidade e removido com job `succeeded`, manifesto removido e zero chunks | Nenhum bloqueio técnico; um teste posterior com documento acadêmico autorizado é recomendado para homologação de conteúdo |
| 3. Referências verificadas | Aprovada tecnicamente | Regra estrita publicada: somente pistas bibliográficas verificáveis; sem fallback por nome de arquivo; sem referências em recusa, insuficiência ou ruído OCR; auditoria live formal passou em 9/9 e bateria publicada em 8/8 | Nenhum bloqueio técnico; manter a regra nas próximas alterações de prompt/interface |
| 4. Prompts e fluxos | Parcial | 37 testes locais de fluxo, sessão, prompts e referências aprovados | Homologação completa dos fluxos do cliente em produção |
| 5. Interface | Parcial | Build e deploy aprovados; ajustes responsivos aplicados | QA visual formal em tamanhos móveis e desktop, sem rolagem ou corte |
| 6. Painel e avaliação | Parcial | `/api/admin/stats` autenticada em HTTP 200; métricas reais e modelo efetivo exibidos | Confirmar cobertura/qualidade em amostra operacional e critérios visuais finais |
| 7. Homologação e liberação | Bloqueada | Ainda não há aceite final do cliente na versão atual | Requer fases 2A–6 aprovadas e roteiro de aceite executado |
| 8. Runtime VPS/DNS | Preparada, não aprovada | Container, healthcheck e serviço VPS preparados em homologação | Comparar VPS/Vercel com o mesmo corpus, testar rollback e só depois alterar DNS |

## Evidências reais mais recentes

- Produção: `https://guapu.vercel.app`.
- Deploy atual do código: `dpl_67AjEcYPVMjzQvuL9yprx3iHYStS`, estado `Ready`.
- Health check: `healthy`.
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
- Amostra independente posterior: 10/10 perguntas reais aprovadas; cinco referências fundamentadas com `Fonte`, página e trecho; cinco respostas que não deveriam citar fonte sem referências; zero fallback, arquivo isolado ou ruído OCR detectado.

## Regra de liberação

O cliente só deve receber a versão para teste controlado depois que os itens marcados como parcial forem validados conforme seus critérios e a Fase 8 tiver comparação real com a VPS. A Fase 2A não é mais um bloqueio técnico; permanecem pendentes as fases 3–8. Até a comparação de runtime, a Vercel permanece como ambiente publicado e rollback; não alterar DNS nem declarar o projeto encerrado.
