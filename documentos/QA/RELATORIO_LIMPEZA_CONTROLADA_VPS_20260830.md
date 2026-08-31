# Limpeza controlada da VPS — 30/08/2026

## Escopo

Inventário e limpeza segura do host da VPS que executa o Guapu. A operação não reiniciou containers, não alterou banco, não removeu imagens de rollback e não apagou diretórios de projeto sem confirmação.

## Evidência antes da limpeza

- Filesystem `/dev/sda2`: 99 GB totais, 79 GB usados, 16 GB livres, 84%.
- `guapu-app`: ativo e `healthy`.
- Cache de build Docker: 38,98 GB, dos quais 37,3 GB reclaimable.
- Volumes Docker reclaimable: aproximadamente 1,0 GB, sem vínculo com containers ativos.
- `/opt/guapu-app`: aproximadamente 16 MB.
- `/opt/guapu`: aproximadamente 1,1 GB; mantido porque contém o checkout/worker e artefatos operacionais.
- `/opt/guapu-app.backup-20260828-1715`: aproximadamente 13 MB; mantido como recuperação.

## Ação executada

Foi executado somente `docker builder prune --all --force`, limitado ao cache de build não utilizado. Essa ação não remove containers, imagens, volumes ou dados persistentes.

## Evidência depois da limpeza

- Filesystem `/dev/sda2`: 99 GB totais, 46 GB usados, 49 GB livres, 49%.
- Cache de build Docker: 1,674 GB, sem espaço reclaimable.
- Todos os 12 containers permaneceram ativos.
- `guapu-app`: ativo e `healthy` antes e depois da limpeza.
- Endpoint publicado `/api/health`: `status=healthy`, `supabase=connected`.

## Itens preservados

- Imagem `guapu-app:rollback-phase8-20260829`, para rollback.
- Volumes de observabilidade do Uptime Kuma, Grafana e Prometheus.
- Três volumes Docker anônimos sem vínculo, somando aproximadamente 1 GB; não removidos por poderem conter dados de recuperação.
- `/opt/guapu` e o backup `/opt/guapu-app.backup-20260828-1715`.
- Logs de containers e journal; ocupação observada não justificou a remoção imediata.

## Próximo passo recomendado

Revisar manualmente os três volumes anônimos e o diretório `/opt/guapu` em janela de manutenção. Só remover após confirmar que não são necessários para rollback, workers, observabilidade ou recuperação. Com 49% de uso, não há urgência operacional para correr esse risco.
