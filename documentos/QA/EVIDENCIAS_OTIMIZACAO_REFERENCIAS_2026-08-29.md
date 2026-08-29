# Evidências de otimização de referências e latência — 2026-08-29

## Fonte de aceitação

Os critérios usados nesta rodada permanecem subordinados aos documentos do cliente em `documentos/Ajustes 27_08_26`, especialmente os três prompts operacionais e `Impacto_Redesign_Interface_Prompt_v1.3.0_27Ago2026.docx`.

## Correções publicadas

- A resposta administrativa sem confirmação no plano passou a usar exatamente: `Consultar o plano de ensino na página da disciplina no Moodle.`
- A detecção de ausência foi corrigida para reconhecer frases com caracteres acentuados, como `não há registro`.
- O modelo padrão foi alinhado ao modelo validado nos testes do projeto: `gemini-3.5-flash-lite`; os fallbacks permanecem controlados.
- A filtragem de referências continua baseada no conteúdo recuperado e na pertinência textual à pergunta, sem usar nome de arquivo como bibliografia.

## Testes locais

- `npm run test:flow`: 43/43 aprovados.
- `npm run lint`: aprovado.
- `npm run build`: aprovado.

## Testes públicos pós-publicação

- Health: HTTP 200, aplicação saudável e Supabase conectado.
- Informações, pergunta `quais são as aulas no dia 16/09`, com modalidade Informações: fallback exato, `sources_found=5`, sem referências e sem jargão interno; tempo do servidor observado: 4,632 s.
- Pergunta `Cuidados pré-operatórios`: `sources_found=5`, sem ocorrência de Cuidados Paliativos, com referência pertinente `Fase Pré-operatória`; tempo do servidor observado: 8,077 s.
- Pergunta sobre a qualidade da água nas etapas da limpeza, repetida três vezes: 5 fontes em cada execução, sem repetição espúria de `enxágue`, sem referência paliativa; tempos observados: 7,999 s, 6,990 s e 4,715 s.

## Pendência de otimização

A latência clínica melhorou ao priorizar o modelo Flash Lite validado, mas ainda varia conforme a disponibilidade do provedor e o custo de geração. A próxima etapa deve medir P50/P95 em uma janela maior e somente então avaliar cache ou redução adicional de chamadas, sem alterar as regras de pertinência, rastreabilidade e bloqueio definidas pelo cliente.

## Correção visual posterior

- A área rolável da conversa recebeu `scroll-padding-top` e as respostas do tutor receberam `scroll-margin-top`, impedindo que o cabeçalho cubra o avatar ou a primeira linha da resposta.
- A correção foi validada na interface publicada em viewport de desktop e em viewport móvel de 390 × 844 px.
- Health pós-publicação: aplicação `running healthy`, HTTP 200 e Supabase conectado.
