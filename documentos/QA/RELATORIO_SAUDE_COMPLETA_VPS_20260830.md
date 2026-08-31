# Auditoria geral de saúde da VPS — 30/08/2026

## Estado do host

- Host: `vps-15084263.vpsbr-15084263.vpshostgator.com.br`.
- Uptime: 17 dias; load average `0.21 / 0.22 / 0.16`.
- Memória: 3,8 GiB total, 2,0 GiB usada, 1,5 GiB disponível; swap com 1,8 GiB usada.
- Disco: 99 GB total, 46 GB usado, 49 GB livre, 49%.
- Nginx do container: configuração válida (`nginx -t` aprovado).

## Stacks e containers

As cinco stacks Docker estão em execução: `agente-backend`, `agentes-frontend`, `guapu-app`, `hermes-organizator` e `observability`. Os 12 containers estão ativos.

- Guapu app: `healthy`, porta local 3212.
- Guapu painel: `healthy`, porta local 3213.
- Agentes Saúde API: `healthy`, porta local 8000.
- Uptime Kuma, Grafana, Prometheus, cAdvisor e Node Exporter ativos.
- Hermes Organizator, Elle staging e demais frontends/APIs ativos.
- Nginx ativo nas portas 80/443.

## Teste dos domínios publicados

Retornaram HTTP 200: `agentesnasaude.com.br`, `brida`, `interativa`, `sana`, `medcron`, `painel.interativa`, `vital`, `controle.vital`, `painel.vital` e `guapu.agentesnasaude.com.br`. O `guapu-painel` retornou HTTP 401, comportamento esperado para painel protegido.

## Incidentes encontrados

1. `guapu-drive-sync-queue.service` está falho. O log mostra timeout SQL `57014` na RPC `get_rag_drive_file_states`. O timer continua ativo e tenta executar novamente. Isso afeta a rotina de planejamento/sincronização do Drive, não o app web já publicado.
2. O `nginx -t` no host falha por uma referência antiga a `/etc/letsencrypt/live/api.agentesnasaude.com.br/fullchain.pem` inexistente. O Nginx dentro do container que atende os domínios está válido e os sites públicos testados responderam. É uma pendência de configuração do host, não uma indisponibilidade atual do container Nginx.
3. `cloud-init.service` e `update-notifier-download.service` aparecem falhos, sem relação observada com os containers publicados; devem ser revisados separadamente.

## Limpeza realizada

O cache de build Docker reclaimable foi limpo anteriormente, liberando 37,3 GB sem reiniciar containers. Imagens de rollback, volumes de observabilidade, backups e diretórios de projeto foram preservados.

## Conclusão

A VPS está operacional e os sites publicados estão respondendo. A saúde não deve ser marcada como 100% concluída enquanto o timeout do worker de fila Drive e a configuração antiga de certificado do Nginx do host não forem tratados. Nenhum desses pontos exige apagar dados; a correção deve começar por diagnóstico da RPC/índices e revisão controlada do arquivo de configuração/certificado correspondente.

## Correções aplicadas

- O worker `/opt/guapu/rag/ingestion.py` passou a usar fallback paginado e ordenado por `id` quando a RPC de estados excede o timeout. Backup anterior preservado em `/opt/guapu/backups/20260830-queue-timeout-fix/ingestion.py.before`. Execução controlada concluída com `changed=0`, `new=0`, `queued=0`, `unchanged=119`.
- O arquivo antigo `medcron_api` foi retirado apenas de `sites-enabled` e movido para `/etc/nginx/sites-disabled/medcron_api.disabled-20260830`; o original foi preservado em `/root/maintenance-backups/20260830/medcron_api.enabled.before`. O arquivo de `sites-available` permanece intacto. O `nginx -t` do host passou.
- `python3-debian` foi reinstalado, corrigindo o `update-notifier-download.service`, que executou com `status=0/SUCCESS`.
- A configuração `growpart` do cloud-init foi corrigida de modo inválido `on` para `off`, com backup em `/root/maintenance-backups/20260830/99-installer.cfg.before`. O cache de user-data também foi corrigido e `cloud-init schema --system` passou. O cloud-init não foi reexecutado para evitar alterações de rede/boot; o estado histórico foi limpo.

## Aceite após as correções

Não há unidades systemd em estado `failed`; o timer da fila e os dois workers estão ativos. Os containers do Guapu, API, Nginx e observabilidade continuam ativos, com Guapu app/painel e API saudáveis. O endpoint publicado do Guapu retornou `status=healthy` e `supabase=connected` após as correções.
