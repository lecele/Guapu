# Plano enxuto de testes — Drive → RAG → app → painel

**Data:** 30/08/2026  
**Escopo:** Fase 9, com foco nas referências exigidas pelo cliente e na operação publicada.

## Objetivo

Comprovar, com evidências reais e baixo consumo, que os arquivos ativos do Drive estão no RAG, que uma resposta fundamentada cita o documento correto, que documentos removidos/sem contexto não continuam sendo usados e que o app registra latência, fontes e avaliação no painel.

## Estratégia de custo

1. **Inventário completo sem chamadas ao modelo:** comparar o manifesto com os arquivos ativos, jobs, chunks ativos, staging, órfãos e catálogo de referências.
2. **Cobertura semântica controlada:** uma pergunta curta por documento representativo de cada classe (plano vigente, glossário DOCX, manual, livros clínicos, feridas, SOBECC, nutrição e documento removido). Expandir somente quando houver falha.
3. **Bateria publicada:** no máximo 30 respostas reais por rodada, repetindo os cenários críticos para medir P50/P95; consultas SQL e validações de metadados não consomem tokens.
4. **Teste negativo:** pergunta fora do acervo e pergunta sobre documento antigo/removido devem recusar com clareza e sem referência inventada.

## Matriz mínima

Cada caso deve registrar: pergunta, intenção, arquivo esperado, `drive_file_id`, página esperada, referência obrigatória, resposta observada, latência, `request_id`, fontes recuperadas, fallback, avaliação e presença no painel.

### Casos críticos

| Caso | Resultado esperado |
|---|---|
| Plano INT 5224 vigente | Resposta determinística com 216h, 2026-2 e referência do plano vigente, p. 1 |
| Glossário DOCX | Definição coerente e referência do Glossário Técnico |
| Pós-operatório | Fontes clínicas catalogadas, páginas reais e sem fallback administrativo |
| Manual do Tutor | Resposta sobre o método socrático com referência do Manual Técnico |
| Nutrição | Resposta fundamentada no livro de avaliação nutricional |
| Feridas 2018/2022 | Fonte correspondente ao documento perguntado |
| SOBECC | Etapas de limpeza/enxágue sem repetição artificial e com página real |
| Plano anterior/removido | Recusa explícita, sem referências e sem uso de documento antigo |
| Fora do acervo | Recusa explícita, sem fonte fabricada |

## Critérios de aprovação

- Manifesto e inventário operacional alinhados; todos os arquivos esperados ativos.
- Jobs sem pendência/falha; zero chunks staging e zero órfãos.
- Toda resposta fundamentada traz referência real correspondente ao documento e à página recuperada; não usar apenas nome de arquivo.
- Documento antigo, removido ou fora do acervo não gera referência nem resposta inventada.
- Casos principais persistem `request_id`, fontes, latência e avaliação; o painel consegue consultar o histórico.
- Registrar P50/P95, máximo, taxa de erro, timeout e fallback da bateria publicada.
- Nenhuma correção é considerada concluída apenas por teste unitário: repetir ao menos um cenário no domínio publicado.

## Critério de parada

Parar a rodada diante de timeout repetido, quota, resposta sem referência, referência de outro documento, divergência de inventário, staging/órfão ou falha de persistência. Corrigir a causa, repetir o caso afetado e somente então retomar.

## Relatório

O relatório deve separar: aprovado, falhou e pendente; anexar IDs de requisição e métricas; indicar a cobertura do catálogo de referências. A cobertura estrutural de todos os arquivos não equivale à prova semântica individual de todos eles. A garantia integral de referências exige catálogo/metadados verificados para cada arquivo ativo ou uma política equivalente comprovada por teste.
