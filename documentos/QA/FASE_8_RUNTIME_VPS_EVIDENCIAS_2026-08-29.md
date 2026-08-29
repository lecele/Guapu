# Evidências da Fase 8 — Runtime VPS-only — 29/08/2026

Status: **APROVADA — produção na VPS**

## Decisão operacional

O Guapu passa a operar exclusivamente na VPS. Os domínios `guapu.agentesnasaude.com.br` e `guapu-painel.agentesnasaude.com.br` apontam para a VPS. A Vercel permanece preservada no projeto, sem tráfego operacional, para consulta histórica; ela não participa do funcionamento normal do app, do painel, da fila ou do RAG.

## Validações realizadas

- App público na VPS: HTTP 200.
- Painel público na VPS: HTTP 401 sem autenticação, comportamento esperado.
- `guapu-app` e `guapu-panel`: containers saudáveis.
- Nginx efetivo: configuração válida.
- Worker `guapu-drive-sync-worker.service`: ativo.
- Timer `guapu-drive-sync-queue.timer`: ativo.
- VPS: bateria real publicada aprovada em 8/8.
- Vercel: bateria real publicada aprovada em 8/8 após republicar o mesmo código homologado; o `FLOW-002` voltou a recuperar cinco fontes e o pico transitório do `FLOW-009` não se repetiu.
- Imagem ativa da VPS: `guapu-app:homologacao`, digest `sha256:e558e5e1df4eea1c1dcaa3a1d7758a6444a4b37934d53f7ed9871105eece56e5`.
- Ponto de rollback da VPS criado como `guapu-app:rollback-phase8-20260829`, com compose preservado em `/opt/guapu-app/docker-compose.guapu.yml.rollback-phase8-20260829`.
- Cópia isolada da imagem de rollback iniciada em porta separada e validada em `/api/health` com Supabase conectado; o container temporário foi removido sem alterar produção.

## Critério de encerramento

A Fase 8 está encerrada no escopo VPS-only: runtime, domínios, serviços críticos, RAG, latência de aceite e ponto de recuperação foram validados. A Vercel não deve ser excluída neste momento, mas também não é dependência da produção.

O aceite final do cliente e o fechamento da preparação operacional continuam controlados pelas fases 7 e 9, respectivamente.
