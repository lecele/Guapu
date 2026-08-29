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

O primeiro exportador usava `OFFSET` e recebeu `57014 / statement timeout` na faixa 65.500–65.999. A paginação foi corrigida para cursor/ID; a segunda exportação terminou sem repetir o erro. O arquivo parcial foi descartado automaticamente.

## Pendências que impedem o encerramento

- O backup ainda está somente na VPS. Falta copiar para armazenamento externo independente e conferir o checksum após a cópia.
- A VPS não possui `pg_dump`, e a rota PostgreSQL direta do Supabase não está disponível por IPv4. A restauração transacional do banco ainda precisa ser validada por um caminho oficial do Supabase (backup gerenciado/PITR ou pooler compatível) ou em ambiente isolado.
- Ainda não foi feito restore em produção, corretamente; não será feito restore destrutivo como teste.
- É necessário exportar e guardar também os manifestos/fila necessários para reconstruir a operação, além do corpus.
- É necessário definir alerta operacional para quota Gemini/embeddings, timeout do Supabase, falha do worker, fila parada e divergência Drive–manifesto.

## Critério de encerramento

A Fase 9 só pode ser marcada como concluída quando houver cópia externa verificável, procedimento de recuperação documentado e um ensaio de restauração não destrutivo/isolado com evidência de contagem, checksum e integridade. Até lá, a operação permanece aprovada para observação, mas não declarada como plenamente recuperável.
