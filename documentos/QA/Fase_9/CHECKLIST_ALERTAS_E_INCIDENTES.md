# Fase 9 — Alertas e incidentes

Este documento define os critérios objetivos para monitorar o Guapu em produção. A VPS já possui Prometheus, Grafana e Uptime Kuma, mas a verificação de 29/08/2026 não encontrou monitor do Guapu cadastrado no Uptime Kuma nem alvo do Guapu no Prometheus. Também não há cliente local de envio de e-mail instalado. Portanto, os critérios abaixo ainda não estão gerando alertas para o Guapu.

## Alertas críticos

| Condição | Ação imediata |
|---|---|
| `/api/health` não responde 200 ou informa Supabase desconectado | interromper liberação e investigar app, rede e Supabase |
| `guapu-app` ou `guapu-panel` não está saudável | verificar logs e fazer rollback somente se houver evidência de regressão |
| worker ou timer inativo | verificar jobs pendentes e journal antes de reiniciar |
| job `failed`, timeout repetido ou fila parada | congelar novas tentativas, preservar logs e investigar a causa |
| chunks `staging` ou órfãos acima de zero | bloquear aprovação do RAG e reconciliar manifesto antes de novas ingestões |
| resposta com referência que não existe no manifesto/trecho recuperado | bloquear o caso, registrar request ID e corrigir a rastreabilidade |
| erro Gemini 429/RESOURCE_EXHAUSTED ou indisponibilidade de todos os modelos | interromper ingestão e avisar sobre quota/modelo; não repetir em loop |
| checksum de backup divergente | considerar o backup inválido e não apagar nem restaurar dados |

## Alertas de atenção

- latência P95 do chat acima de 15 s por duas medições consecutivas;
- latência P95 acima de 30 s ou fallback acima de 5% na janela de 15 minutos;
- aumento de respostas sem contexto em perguntas que exigem RAG;
- disco da VPS acima de 80% (atenção) ou 90% (crítico);
- backup externo com mais de 24 horas (atenção) ou 48 horas (crítico);
- divergência entre inventário do Drive, manifesto e vetores ativos;
- aumento de respostas com `NO_RELEVANT_CONTEXT`, `RETRIEVAL_FAILED` ou erro de geração.

## Procedimento de incidente

1. Registrar data/hora, domínio, request ID, job ID, commit e mensagem do erro sem incluir chaves.
2. Preservar os logs e o estado do manifesto, jobs e chunks antes de qualquer correção.
3. Não reprocessar arquivos ou reiniciar o worker por tentativa; confirmar se há timeout, quota ou operação presa.
4. Reproduzir com uma pergunta controlada e comparar fontes, referências e latência.
5. Aplicar a menor correção possível, repetir a bateria completa e só então liberar o fluxo.
6. Registrar causa, impacto, correção, teste de regressão e decisão de rollback.

## Comandos de triagem

```bash
curl -fsS https://guapu.agentesnasaude.com.br/api/health
systemctl is-active guapu-drive-sync-worker.service
systemctl is-active guapu-drive-sync-queue.timer
docker ps --format '{{.Names}} {{.Status}}'
docker exec agentes-saude-nginx nginx -t
journalctl -u guapu-drive-sync-worker.service --since '30 minutes ago' --no-pager
df -h /opt/guapu
```

## Verificador local

O verificador `deploy/ops/guapu-healthcheck.sh` gera um snapshot a cada cinco minutos, cobrindo app, painel, Nginx, worker, fila e disco. Os indicadores foram integrados ao `obs-node-exporter` e há regras do Guapu carregadas no Prometheus. Ele ainda não envia notificações por conta própria; os estados ficam registrados para integração com o canal escolhido.

## Critério de encerramento

Para fechar esta parte da Fase 9, é necessário escolher um canal de alerta, configurar o verificador nesse canal e executar um teste controlado de cada alerta sem expor segredos. O ensaio de restauração isolado local já foi concluído; não há necessidade de tocar no Supabase de produção para esse teste.
