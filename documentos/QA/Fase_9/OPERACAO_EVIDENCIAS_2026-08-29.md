# Fase 9 — Evidências operacionais

**Data:** 29/08/2026  
**Ambiente:** VPS de produção do Guapu  
**Status:** em andamento; a fase não está encerrada.

## O que foi confirmado

- App público: `https://guapu.agentesnasaude.com.br/api/health` respondeu `healthy` e `supabase: connected`.
- Painel público: responde, com autenticação Basic exigida.
- `guapu-app` e `guapu-panel`: containers saudáveis.
- Nginx: configuração validada com `nginx -t`.
- `guapu-drive-sync-worker.service`: ativo e habilitado.
- `guapu-drive-sync-queue.timer`: ativo e habilitado.
- Última bateria de aceite publicada: 8/8 casos aprovados.
- Backup do corpus: 87.040 registros exportados por PostgREST, com contagem e checksum conferidos.

## Backup verificável criado

- Arquivo na VPS: `/opt/guapu/backups/documents-20260829.ndjson.gz`
- Formato: NDJSON gzipado, incluindo `id`, conteúdo, embedding, fonte, metadados e data de criação.
- Tamanho: 394.578.190 bytes.
- Contagem: 87.040 registros.
- SHA-256 das linhas: `c9d899e958e9ffd150fc725e9578da09feb3389b5b52cb415ba6eac07ee9a444`.
- Validação: gzip íntegro, contagem conferida e checksum conferido sem erro.
- Método: exportação somente leitura pela API REST do Supabase, usando paginação por cursor de ID.

Também foram preservados snapshots operacionais, ambos gzipados e protegidos com permissão 600:

- `/opt/guapu/backups/drive_sync_manifest-20260829.json.gz`: 119 registros; SHA-256 das linhas `96b348ba415f8148a5dfdfaac302264f0b212d7baa5e35aaf25caf6d1ce01c3d`.
- `/opt/guapu/backups/drive_sync_jobs-20260829.json.gz`: 112 registros; SHA-256 das linhas `74195267c9575dd1a4b937c648e2e9edaa24adb38f4e5400898be355c7b2ef6d`.

O exportador genérico está em `scripts/backup_supabase_tables_rest.py` e limita-se às tabelas operacionais de manifesto e fila.

## Cópia externa confirmada

Os três arquivos foram copiados da VPS para o armazenamento local independente:

`C:\Users\llece\Documents\DEV\Agentes_na_Saude\_migration-backups\guapu-phase9-20260829\`

Os hashes SHA-256 dos arquivos comprimidos conferem entre a VPS e o computador local:

- `documents-20260829.ndjson.gz`: `506d26ab80c7670cda4df378eaad89843042a848df00a190da3909fba677350e`.
- `drive_sync_manifest-20260829.json.gz`: `dc801808b6fa4590620a4d70749a59ff3d443ac7520d8455e615aa9fde3be9ca`.
- `drive_sync_jobs-20260829.json.gz`: `5e200f656792d70a5ce0b663c9c6eb52f11a6356c92b782d6b37ade2f734ca3f`.

A cópia externa também foi descompactada e lida pelo verificador: 87.040 linhas do corpus, 119 do manifesto e 112 da fila, com os checksums de conteúdo correspondentes aos registrados na origem.

O ensaio local de carga de recuperação também passou: 87.040 IDs únicos, 87.040 vetores com 768 dimensões, 185 fontes distintas e checksum do conteúdo conferido. Esse ensaio valida a integridade do arquivo, mas não substitui a restauração em um banco isolado.

O primeiro exportador usava `OFFSET` e recebeu `57014 / statement timeout` na faixa 65.500–65.999. A paginação foi corrigida para cursor/ID; a segunda exportação terminou sem repetir o erro. O arquivo parcial foi descartado automaticamente.

## Pendências que impedem o encerramento

- A cópia externa do corpus, manifesto e fila foi concluída e conferida por SHA-256.
- A VPS não possui `pg_dump`, e a rota PostgreSQL direta do Supabase não está disponível por IPv4. A restauração transacional do banco ainda precisa ser validada por um caminho oficial do Supabase (backup gerenciado/PITR ou pooler compatível) ou em ambiente isolado.
- Ainda não foi feito restore em produção, corretamente; não será feito restore destrutivo como teste.
- Os snapshots de manifesto e fila foram exportados e guardados junto da cópia externa do corpus.
- É necessário definir alerta operacional para quota Gemini/embeddings, timeout do Supabase, falha do worker, fila parada e divergência Drive–manifesto.
- A stack Prometheus/Grafana/Uptime Kuma existe na VPS, mas ainda não possui monitor do Guapu nem canal de notificação configurado.

## Verificação periódica instalada

Foi preparado um verificador operacional idempotente em `deploy/ops/guapu-healthcheck.sh`, executado pelo par `guapu-healthcheck.service`/`guapu-healthcheck.timer` a cada cinco minutos. Ele registra, sem dados sensíveis:

- saúde do endpoint público e autenticação esperada do painel;
- validade da configuração do Nginx que efetivamente atende os domínios;
- estado do worker e do timer de sincronização;
- uso do disco raiz;
- snapshot JSON e métricas locais para integração posterior com Prometheus.

Essa checagem reduz o tempo de detecção, mas não substitui um canal de notificação: a configuração de e-mail/API e a integração visual no Prometheus/Grafana ainda dependem da credencial do provedor.

Em 29/08/2026, a checagem foi integrada ao `obs-node-exporter` e o Prometheus foi atualizado com regras do Guapu. A validação confirmou os indicadores `guapu_health_status=1`, `guapu_app_up=1`, `guapu_panel_auth_up=1`, `guapu_nginx_config_valid=1`, worker e timer ativos, disco em 70%, Prometheus pronto e regras carregadas. O alerta passa a existir no Prometheus; a entrega por e-mail ou outro canal ainda depende da credencial do provedor.

## Critério de encerramento

A Fase 9 só pode ser marcada como concluída quando houver cópia externa verificável, procedimento de recuperação documentado e um ensaio de restauração não destrutivo/isolado com evidência de contagem, checksum e integridade. Até lá, a operação permanece aprovada para observação, mas não declarada como plenamente recuperável.
