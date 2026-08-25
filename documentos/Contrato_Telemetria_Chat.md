# Contrato de telemetria do chat

Este contrato define os dados mínimos que cada turno do chat precisa registrar antes de o painel voltar a exibir indicadores de RAG, qualidade ou desempenho.

## Princípios

- Registrar eventos técnicos, não o contexto integral enviado ao modelo.
- Não gravar chaves, prompts completos, vetores, dados pessoais ou conteúdo sensível fora do necessário para auditoria pedagógica.
- Um turno é composto por uma mensagem do estudante e uma resposta do assistente.
- O painel deve calcular métricas a partir desses eventos; não deve usar números fixos.

## Dados da sessão

Armazenar por `session_id`:

```json
{
  "state": "RESUMO_CONCLUIDO",
  "mode": "resumo",
  "current_topic": "hemostasia",
  "flow_version": "v1",
  "updated_at": "ISO-8601"
}
```

`state`, `mode` e `current_topic` são dados do código. Não devem ser inferidos novamente apenas a partir da última resposta textual.

## Metadados da resposta do assistente

Armazenar em `chat_messages.metadata` ou em uma tabela de eventos associada:

```json
{
  "request_id": "uuid",
  "flow_version": "v1",
  "prompt_version": "v1.0.0",
  "mode": "resumo",
  "state_before": "RESUMO_AGUARDANDO_TEMA",
  "state_after": "RESUMO_CONCLUIDO",
  "model_requested": "gemini-...",
  "model_used": "gemini-...",
  "fallback_used": false,
  "fallback_reason": null,
  "has_context": true,
  "sources_found": 3,
  "retrieval": [
    {
      "document_id": "uuid",
      "source": "nome-do-arquivo.pdf",
      "rank": 1,
      "similarity": 0.82
    }
  ],
  "latency_ms": {
    "embedding": 0,
    "retrieval": 0,
    "generation": 0,
    "total": 0
  },
  "error_code": null
}
```

## Códigos de erro mínimos

| Código | Significado |
|---|---|
| `INVALID_REQUEST` | Mensagem inválida ou vazia. |
| `EMBEDDING_FAILED` | Não foi possível gerar embedding. |
| `RETRIEVAL_FAILED` | Falha na consulta ao Supabase/pgvector. |
| `NO_RELEVANT_CONTEXT` | Busca funcionou, mas não encontrou contexto suficiente. |
| `MODEL_FAILED` | Todos os modelos de geração falharam. |
| `PERSISTENCE_FAILED` | A resposta foi gerada, mas não foi salva. |
| `FLOW_CONFLICT` | Entrada incompatível com o estado atual. |

## Métricas que poderão ser exibidas no painel

Somente depois de registrar os eventos acima:

- taxa de respostas com contexto;
- distribuição de similaridade e quantidade de fontes;
- latência real por etapa e por modelo;
- taxa de fallback por causa;
- falhas de persistência;
- transições de fluxo inválidas;
- satisfação por resposta/modalidade, quando houver feedback;
- desempenho em casos da matriz de regressão.

“Precisão do RAG” só poderá ser exibida se vier de uma avaliação humana ou de uma matriz de respostas esperadas com critério definido. A contagem de chunks não mede qualidade.

