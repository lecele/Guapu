# Relatório de manutenções e validações do Guapu

**Período principal:** 30 e 31/08/2026, com revalidação em 01/09/2026  
**Ambiente publicado:** https://guapu.agentesnasaude.com.br/  
**Objetivo:** registrar as correções, a catalogação bibliográfica, os modelos avaliados e as evidências disponíveis para auditoria no Claude Code.

## 1. Contexto da manutenção

O trabalho foi orientado pelo documento do cliente `Impacto_Redesign_Interface_Prompt_v1.3.0_27Ago2026.docx` e pelos três prompts em `documentos/Ajustes 27_08_26`. As prioridades foram: respostas fundamentadas apenas no RAG, referências bibliográficas reais, proteção contra extrapolação, respostas administrativas completas, consistência entre dispositivos, telemetria e estabilidade operacional.

Não foram expostos segredos neste relatório. As correções descritas não fizeram reingestão, não alteraram embeddings, conteúdo textual ou índices e não modificaram o worker de sincronização.

## 2. Catalogação bibliográfica

- Foi criado e ampliado um catálogo bibliográfico associado aos `drive_file_id` dos documentos.
- As entradas foram promovidas somente quando havia evidência no PDF/chunk original: título, autores, ano, editora/periódico, edição, DOI/ISSN, página ou seção identificável.
- Documentos sem ficha bibliográfica confiável não receberam autores, datas ou editoras inventados.
- Os quatro materiais sem identidade editorial completa foram mantidos como identidades parciais, usando apenas títulos/seções comprovados no conteúdo.
- A evidência local/runtime registra **119/119 documentos com entrada de catálogo**, sendo quatro com `reference_confidence=partial`.
- A propagação foi feita em operações idempotentes e lotes pequenos, sem alterar `content`, embeddings ou índices. O relatório de catalogação registra validação de **57.796 chunks**, `staging=0`, `catalog_without_chunks=0` e `outside_catalog=0` no fechamento da propagação.
- Há números históricos diferentes em relatórios anteriores, porque os relatórios foram atualizados por etapas. O Claude Code deve conferir o estado persistente atual do Supabase antes de declarar a cobertura definitiva; não usar os números históricos 85/88/106/108 isoladamente.

## 3. Correções funcionais realizadas

### Referências e grounding

- Corrigido o cabeçalho visual para `**Referências**`, sem dois-pontos.
- Removidos padrões expostos ao estudante como `.pdf`, `[Fonte:]`, “materiais consultados” e nomes técnicos de arquivo.
- As referências passaram a ser montadas deterministicamente a partir dos documentos recuperados e do catálogo verificado.
- O sistema não publica referência quando a resposta é recusa, fallback de ausência de informação ou questão de quiz.
- Criado roteamento conservador para temas que estavam recuperando fontes fracas, especialmente infecção do sítio cirúrgico, NANDA e anestesia/SRPA.
- A pergunta sobre controle de infecção passou a priorizar a fonte específica de prevenção de infecção do sítio cirúrgico, com página e referência bibliográfica coerentes.

### Respostas administrativas

- A pergunta sobre professores da INT 5224 passou a usar o plano vigente e consolidar os nomes completos.
- Foi corrigida a omissão de professores: o teste publicado confirmou os sete nomes do plano, em duas sessões independentes, com referência única na página 22.
- A resposta administrativa de carga horária/período foi protegida contra reconstrução de tabelas incompletas e valores não confirmados.

### Fluxos e guardrails

- Identidade do Guapu tornou-se determinística, sem geração clínica ou referência indevida.
- O pedido “Responda novamente de forma concisa” passou a ser reconhecido corretamente após um resumo.
- O fluxo de quiz foi validado para iniciar tema, trocar tema e não incluir referências.
- Pedidos de resposta pronta para prova e perguntas fora do escopo são recusados.
- Foi implementada adaptação de profundidade por nível estimado do estudante, usando o histórico da sessão: iniciante, intermediário ou avançado. O nível não substitui grounding, ética ou regras de referência.

### Interface e responsividade

- Corrigida a sobreposição/corte da parte superior das respostas sob o cabeçalho.
- Aplicadas contenções de largura e `min-width: 0` nos contêineres de mensagens e rodapé para reduzir overflow horizontal em telas móveis.
- O slogan “Agentes na Saúde” foi retirado conforme solicitado; permanece a identificação visual do Guapu.
- O monitoramento de infraestrutura foi separado da primeira página do cliente e colocado na área de Status & Telemetria.

## 4. Modelos avaliados

### OpenAI

- Modelo inicialmente utilizado: `gpt-4o-mini`.
- Teste direto na VPS: modelo acessível, HTTP 200 e resposta mínima em 1.934 ms.
- O timeout global de 8 s abortava algumas respostas RAG completas; foi ampliado para 20 s.
- Após a correção, um teste real do app respondeu em 8.754 ms, com contexto e referências, sem fallback.
- Comparação direta com o mesmo contexto:
  - `gpt-4o-mini`: 2.253 ms, resposta completa e contextualizada;
  - `gpt-4.1-mini`: 2.204 ms, resposta mais concisa;
  - `gpt-5-mini`: 8.607 ms, resposta mais densa, porém mais lenta;
  - `gpt-5-nano`: HTTP 200, mas conteúdo vazio no orçamento utilizado; não aprovado.

### Moonshot

- A chave e os modelos foram válidos em testes diretos.
- `kimi-k3` e `kimi-k2.6` ficaram lentos no prompt RAG completo e acionaram timeout/fallback.
- `kimi-k2.7-code-highspeed` respondeu em 15.182 ms no fluxo real, mas é um modelo orientado a código.
- Por decisão do responsável, o Moonshot foi removido do Guapu. O ambiente final não carrega variáveis `MOONSHOT_*`.

### Gemini

- Gemini permaneceu como fallback operacional após OpenAI.
- Foi utilizado em baterias anteriores e continua disponível para contingência.
- Não foi feita troca automática de modelo com base em uma única amostra.

## 5. Evidências de testes reais recentes

Em 01/09/2026, foram executadas três perguntas no app publicado:

| Cenário | Resultado | Tempo observado |
|---|---|---:|
| Professores da INT 5224 | Sete professores completos, 12 fontes e referência do plano | 8.688 ms |
| Prevenção de infecção do sítio cirúrgico | Resposta clínica contextualizada, 5 fontes | 7.109 ms |
| Capital da França | Recusa correta por estar fora do escopo | 3.679 ms |

No mesmo período, o app respondeu `healthy` com `supabase=connected`. App e painel permaneceram saudáveis, worker e timer ativos, Nginx válido e disco da VPS em aproximadamente 59%.

## 6. Commits principais

- `44c11a5` — identidade determinística;
- `c5c7084` — reconhecimento de pedido de concisão;
- `f2d2137` — adaptação ao nível do estudante;
- `a419a80` — aumento do timeout de geração;
- `ddd5565` — reserva de tokens de raciocínio para Moonshot;
- `c8489ff` — remoção do Moonshot da cadeia;
- `7a6780c` — comparação de modelos OpenAI;
- `59cd68f`, `3007660`, `90854fb` e `7a6780c` — documentação das validações e decisões.

Todos esses commits estão na branch `codex/client-interface` do GitHub.

## 7. Estado atual e pontos para auditoria

O app está operacional e as correções críticas observadas nas capturas do cliente foram tratadas. Para uma conclusão independente, o Claude Code deve:

1. confirmar no Supabase a contagem atual do catálogo e a cobertura dos chunks;
2. repetir as perguntas oficiais da segunda rodada do cliente com os prompts exatos;
3. comparar `model_used`, `fallback_used`, `fallback_reason`, fontes e latências por `request_id`;
4. medir P50/P95 em uma janela maior, pois os testes unitários e amostras curtas não comprovam estabilidade estatística;
5. fazer QA visual final em desktop e mobile;
6. verificar se as referências exibidas correspondem aos trechos consultados, sem considerar catálogo sozinho como prova de conteúdo.

Este documento descreve o que foi implementado e testado. Não é uma declaração de garantia universal: a confirmação final deve ser baseada nas consultas atuais do runtime e nas evidências reproduzíveis.
