# Gate de liberação do Guapu — 28/08/2026

Este documento é o controle de evidências para a liberação. Uma fase só pode avançar quando tiver implementação, teste automatizado quando aplicável, teste real no ambiente de destino e evidência reproduzível. Build ou deploy, isoladamente, não aprovam uma fase.

## Situação atual

| Fase | Situação | Evidência atual | Bloqueio para avançar |
|---|---|---|---|
| 0. Contenção e ambiente seguro | Aprovada operacionalmente | Segredos fora do repositório, deploy identificado e rotas protegidas | Manter rollback disponível |
| 1. Reconciliação Drive ↔ RAG | Aprovada | 119 arquivos vivos, 119 ativos, 57.796 chunks, zero staging/órfãos; verificador estrito e bateria real 9/9 aprovados | Nenhum técnico conhecido |
| 2. Recuperação e desempenho | Aprovada tecnicamente | Busca semântica e híbrida com fontes corretas dentro de 3 s; cache versionado com teste de mudança/restauração do corpus; bateria real de produção aprovada | Manter a validação end-to-end no Drive como evidência complementar da Fase 2A |
| 2A. Qualidade e velocidade | Em execução | 9/9 no deploy `dpl_Bfq3kAP3rVgZpTxtUGkQKwXC5Rhh`; refinamento por modalidade no deploy `dpl_2kGWgbKXwgieGd4YHhVqqUfjcwWH`; cache com corpus versionado ativo; 5 hits em 9 turnos, versão presente em 9/9, 6/6 respostas com evidência rastreáveis | Provar invalidação após alteração documental e repetir a bateria |
| 3. Referências verificadas | Parcial | Referências geradas a partir dos chunks e teste live com 6/6 evidências rastreáveis | Amostra formal completa e aprovação específica da fase |
| 4. Prompts e fluxos | Parcial | 31 testes locais de fluxo, sessão, prompts e referências aprovados | Homologação completa dos fluxos do cliente em produção |
| 5. Interface | Parcial | Build e deploy aprovados; ajustes responsivos aplicados | QA visual formal em tamanhos móveis e desktop, sem rolagem ou corte |
| 6. Painel e avaliação | Parcial | `/api/admin/stats` autenticada em HTTP 200; métricas reais e modelo efetivo exibidos | Confirmar cobertura/qualidade em amostra operacional e critérios visuais finais |
| 7. Homologação e liberação | Bloqueada | Ainda não há aceite final do cliente na versão atual | Requer fases 2A–6 aprovadas e roteiro de aceite executado |
| 8. Runtime VPS/DNS | Preparada, não aprovada | Container, healthcheck e serviço VPS preparados em homologação | Comparar VPS/Vercel com o mesmo corpus, testar rollback e só depois alterar DNS |

## Evidências reais mais recentes

- Produção: `https://guapu.vercel.app`.
- Deploy atual do código: `dpl_2kGWgbKXwgieGd4YHhVqqUfjcwWH`, estado `Ready`.
- Health check: `healthy`.
- Bateria crítica atual: 9/9 aprovados em três repetições por cenário.
- Modelo efetivo nas seis respostas com contexto: `gemini-3.5-flash-lite`.
- Cada uma das seis respostas com contexto possui `drive_file_id`, `content_hash` e `chunk_index`.
- As três consultas ao documento antigo retornaram `NO_RELEVANT_CONTEXT` e não geraram resposta fundamentada em fonte genérica.
- Lint, build e 31 testes automatizados locais: aprovados.
- Cache de recuperação: somente chunks, chave com `corpus_version`, TTL e limite de memória; 9 versões de corpus registradas e 5 cache hits na bateria pós-deploy.
- Inventário ao vivo: 119 arquivos no Drive, 119 manifestos ativos e nenhum ID faltante ou excedente.

## Regra de liberação

O cliente só deve receber a versão para teste controlado depois que os itens marcados como parcial forem validados conforme seus critérios e a Fase 8 tiver comparação real com a VPS. Até lá, a Vercel permanece como ambiente publicado e rollback; não alterar DNS nem declarar o projeto encerrado.
