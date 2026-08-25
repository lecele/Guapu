# Gapu V2 — resultados da Fase 1

Data: 25 de agosto de 2026

## Implementado

- Repositório V2 independente e baseline publicado no GitHub.
- Máquina de estados explícita para menu, resumo, quiz, informações e encerramento.
- Correção do comando “seja mais conciso”, sem confundi-lo com aprofundamento.
- Quiz com três questões, duas tentativas e progressão correta até o encerramento.
- `request_id` reutilizado nos retries do frontend para idempotência após a migração.
- Telemetria preparada com modelo, fallback, fontes, similaridade e latência por etapa.
- SDK legado do Google substituído por `@google/genai`.
- Prompts separados em núcleo/segurança, fluxo/estado e modos de resposta.
- Conteúdo de informações da disciplina deixou de ser fixo no código e passou a depender do RAG.

## Escolha do modelo

Benchmark curto feito com a chave real do projeto:

| Modelo | Latência observada |
|---|---:|
| Gemini 3.6 Flash | 26,3 s |
| Gemini 3.5 Flash | 3,2 s |
| Gemini 3.1 Flash-Lite | 1,7 s |
| Gemini 3.5 Flash-Lite | 5,2 s |

Decisão atual: `gemini-3.5-flash` como modelo principal. Ele mantém a família Flash completa com latência muito menor neste projeto. O modelo é configurável por `GEMINI_CHAT_MODEL`, sem mudança de código.

O embedding permanece `gemini-embedding-2`, dimensão 768, para ser matematicamente compatível com os vetores existentes. Trocar o modelo de embedding sem reindexar todos os documentos invalidaria a similaridade.

## Testes reais

- Resumos consultaram 5 chunks e retornaram explicação e referências.
- Reformulação concisa reduziu uma resposta de 2.804 para 1.644 caracteres sem aprofundar.
- Quiz real percorreu Questões 1, 2 e 3, incluindo duas segundas tentativas, e concluiu corretamente.
- Após a escolha do modelo, turnos do quiz ficaram entre aproximadamente 3,5 e 7 segundos.
- Testes automatizados: 14 aprovados.

## Estado persistente no Supabase

A migração `004_add_persistent_chat_state.sql` foi aplicada no projeto **Tutor Enfermagem** em 25 de agosto de 2026.

Validação executada no banco:

- tabela `chat_session_state`: criada;
- coluna `chat_messages.metadata`: criada;
- coluna `chat_messages.request_id`: criada;
- índice de idempotência por sessão, requisição e papel: criado.

Ainda é necessário adicionar `SUPABASE_SERVICE_ROLE_KEY` como segredo server-side na Vercel antes do deploy da V2 e executar o teste final de idempotência no ambiente publicado.

Nunca expor `SUPABASE_SERVICE_ROLE_KEY` em variável `NEXT_PUBLIC_*`.

## Domínios do deploy

- Chatbot: `gapu.vercel.app`
- Painel administrativo: `gapu-painel.vercel.app`

Os dois endereços serão projetos separados na Vercel. A disponibilidade dos nomes será confirmada no momento do deploy.
