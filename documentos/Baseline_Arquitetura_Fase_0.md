# Baseline de arquitetura — Fase 0

Data da verificação: 25 de agosto de 2026.

## Decisão de arquitetura

O caminho ativo do chat é o backend serverless em Next.js:

```text
Navegador
  -> hooks/useChat.ts
  -> lib/api.ts
  -> /api/chat
  -> app/api/chat/route.ts
  -> Supabase + Google Gemini
```

Evidências:

- O cliente usa `NEXT_PUBLIC_API_URL=/api`.
- O `vercel.json` publica `app/api/chat/route.ts`.
- `https://tutor-de-enfermagem.vercel.app/api/health` respondeu `200` em 25/08/2026.

`main.py` e `rag/graph.py` formam um segundo backend FastAPI/LangGraph. Eles não são chamados pelo frontend na configuração atual. Até decisão posterior, devem ser tratados como implementação paralela/legada para chat, sem receber novas regras de fluxo ou prompts.

## Snapshot operacional inicial

- Saúde pública: Supabase conectado.
- Banco real: 1.272 mensagens, 252 identificadores de sessão e 16 avaliações.
- Das 252 sessões observadas, 126 usam UUID e 126 usam identificadores legados não UUID.
- Banco vetorial real: 36.004 chunks.
- Não interpretar os campos `ragAccuracyRate=96` e `avgResponseTimeMs=1450` como métricas reais: eles estão codificados na rota de estatísticas.

## Schema real confirmado

- A tabela `chat_sessions` não existe em produção.
- `chat_messages` contém apenas `id`, `session_id`, `role`, `content` e `created_at`.
- `chat_messages` não possui `metadata` nem `request_id`.
- `documents` contém `id`, `content`, `embedding`, `source`, `metadata` e `created_at`.
- Os 36.004 chunks possuem `metadata.content_hash`.
- Nenhum chunk possui `drive_file_id`, `page_number` ou `chunk_index`.
- A migração `003_add_chat_history.sql` não representa o schema publicado e não deve ser aplicada diretamente.

## Riscos confirmados no caminho ativo

1. O estado de sessão é um `Map` em memória dentro de `app/api/chat/route.ts`. Em serverless, esse estado pode desaparecer ou variar entre instâncias.
2. A modalidade é inferida pelo texto da última resposta do assistente. Isso pode transformar pedidos como “seja mais conciso” em aprofundamento.
3. O endpoint de chat grava somente `role` e `content`; não registra modelo, documentos recuperados, similaridade, latência por etapa ou estado.
4. A escrita das conversas captura falhas apenas com `console.warn`, permitindo que a resposta seja entregue mesmo sem auditoria persistida.
5. As migrações do repositório e o comportamento observado precisam ser confrontados com o schema real do Supabase antes de criar novas tabelas ou restrições.
6. O painel mistura dados reais com valores fixos e exemplos de fallback.

## Escopo da próxima fase

Antes de trocar prompts ou modelo de IA, implementar uma máquina de estados persistente no caminho Next.js e registrar metadados mínimos por turno.

O backend Python não será removido nesta fase. A decisão de mantê-lo, migrá-lo para ingestão ou aposentá-lo será tomada somente depois de o caminho Next.js estar estável e testado.

## Critérios de saída da Fase 0

- [x] Caminho ativo de produção confirmado.
- [x] Implementação paralela identificada.
- [x] Métricas não confiáveis sinalizadas.
- [x] Schema real do Supabase comparado com as migrações.
- [ ] Matriz de regressão criada a partir das 31 conversas reais.
- [x] Contrato de telemetria por turno definido.
