# Verificação da Fase 6 — painel e avaliação de qualidade auditáveis

**Data:** 29/08/2026  
**Ambiente:** runtime publicado na VPS (`guapu.agentesnasaude.com.br` e `guapu-painel.agentesnasaude.com.br`)  
**Status técnico:** **APROVADA**; a homologação final do cliente permanece na Fase 7.

## Testes executados

- Lint: **aprovado**.
- Suíte local de sessão, referências e escopo administrativo: **37/37 aprovados**.
- Healthcheck do app na VPS: **HTTP 200**, Supabase conectado.
- Healthcheck do painel na VPS: **HTTP 200** com autenticação válida; sem autenticação, **HTTP 401**, comportamento esperado.
- Aceite real do painel e do pipeline: **todos os critérios aprovados**.

## Aceite real

| Caso | Resultado observado |
|---|---|
| Resposta fundamentada | HTTP 200, 5 fontes recuperadas e seção `Referências:` presente |
| Resposta sem evidência | HTTP 200, resposta transparente sem afirmar informação não sustentada |
| Requisição inválida | HTTP 400 com `error_code=INVALID_REQUEST` |
| Avaliação assíncrona | `succeeded`, veredicto `correct`, nota 100 e 5 fontes |

Na execução final, a resposta fundamentada levou 42,5 s e a resposta sem evidência 4,8 s. A avaliação ocorreu depois da resposta, preservando o caminho percebido pelo aluno. O worker de qualidade permaneceu ativo e concluiu o registro assíncrono.

## Rastreabilidade conferida

- O painel lê métricas do endpoint autenticado `/api/admin/stats`.
- As respostas e avaliações são persistidas com sessão, `request_id`, fontes e telemetria.
- O código mantém a separação entre respostas do aluno e sessões técnicas automáticas.
- O painel exibe latência, modelo, fallback, falhas de recuperação, ausência de contexto e estado da avaliação a partir dos registros reais.
- A exportação dos números exibidos permanece coberta pela implementação do painel e pelos testes locais.

## Incidente transitório observado

Durante uma rodada intermediária, o provedor Gemini retornou `504 DEADLINE_EXCEEDED` ao worker de qualidade. O worker permaneceu ativo, repetiu a tentativa e concluiu a avaliação com sucesso. A execução final do aceite passou com avaliação `succeeded`; o evento fica registrado como risco operacional de quota/latência do provedor, sem reprovar a fase.

## Critério de saída

Os critérios técnicos da Fase 6 foram atendidos: números e estados são obtidos de dados reais, respostas podem ser investigadas por `request_id`, fontes e tempos, e a avaliação assíncrona não bloqueia a resposta do aluno. A Fase 6 está aprovada tecnicamente. A próxima etapa é a Fase 7, que exige homologação diária e aceite explícito do cliente.
