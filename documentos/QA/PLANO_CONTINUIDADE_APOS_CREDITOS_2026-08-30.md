# Plano de continuidade do Guapu após esgotamento de créditos

Atualizado em 30/08/2026. Este arquivo é o ponto de retomada. Não contém tokens, senhas ou URLs privadas.

## Estado confirmado antes da pausa

- App em produção na VPS: `https://guapu.agentesnasaude.com.br`.
- `/api/health`: HTTP 200, `status=healthy`, Supabase conectado.
- Worker `guapu-drive-sync-worker.service`: ativo e habilitado.
- Supabase: 57.796 documentos ativos, todos com `metadata.drive_file_id`; 119 manifestos; 112 jobs `succeeded`; zero documentos em staging.
- Foram removidas somente cópias legadas duplicadas de quatro documentos atuais do Drive: 24.398 chunks.
- Backup restaurável da remoção: `_migration-backups/guapu-phase1-20260830/legacy-duplicates-all4.documents.jsonl.gz`.
- Medição direta mais recente do banco: aproximadamente 402 MB, abaixo do limite Free de 500 MB. A tela de uso do Supabase pode atualizar com atraso.
- Não remover os documentos restantes sem nova prova de duplicidade e backup validado.

## Dois trabalhos grandes em andamento

1. **Catalogação bibliográfica** — tarefa Codex `01a053b1-0249-77c0-899a-dbf00cffe28c`.
   Está no lote 3, revisando candidatos do catálogo proposto de 100 documentos. Uma consulta JSON lenta afetou o health check; validar a correção antes de publicar qualquer alteração.

2. **Otimização do índice do RAG** — tarefa Codex `01a053cb-c077-7fe2-8fc3-a0382caa6ecc`.
   Está reconstruindo o índice vetorial com meia precisão e parâmetro HNSW reduzido. Ainda faltam validar tamanho, qualidade, latência e referências antes de aceitar.

Não iniciar tarefas equivalentes enquanto essas duas estiverem ativas. Primeiro consultar o estado delas e o diff/commit atual.

## Ordem segura quando houver créditos novamente

### 1. Retomar sem duplicar

- Consultar as duas tarefas acima e deixar concluir o turno em andamento.
- Conferir `git status`, diff e commits antes de editar ou fazer deploy.
- Se alguma tarefa estiver pausada, continuar a mesma tarefa; não criar outra para o mesmo objetivo.

### 2. Fechar a catalogação bibliográfica

- Auditar os 100 candidatos contra os chunks reais, página/trecho e nome do arquivo no Drive.
- Promover automaticamente somente evidência bibliográfica forte; manter casos parciais/duvidosos pendentes.
- Verificar que o catálogo é consumido pelo gerador de referências e que não há fallback genérico indevido.
- Testar pelo menos: plano de ensino vigente, um livro com autor/ano, um documento sem dados suficientes e uma pergunta administrativa.
- Registrar resultado em `RELATORIO_CATALOGACAO_100_DOCUMENTOS_20260830.md` sem inventar dados.

### 3. Aceitar ou rejeitar a otimização do índice

- Comparar antes/depois: tamanho do banco, `EXPLAIN`, P50/P95 de latência, taxa de respostas com fonte correta e qualidade dos mesmos casos de teste.
- Confirmar que a busca híbrida continua encontrando os documentos atuais e que o reordenamento preserva a precisão.
- Não remover índice antigo nem converter coluna definitivamente sem plano de rollback, teste de recuperação e evidência de ganho real.
- Se a reconstrução falhar por espaço, parar novas tentativas de `VACUUM FULL` e não repetir operação que exija cópia integral sem espaço.

### 4. Teste de aceite do RAG e das referências

- Executar perguntas novas em temas distintos, em pequena amostra.
- Confirmar que cada resposta pertinente traz referências agrupadas, sem `Referências:` repetido em cada linha e sem “informação não disponível” quando há pista identificável.
- Validar cada referência contra `source`, título catalogado, página e trecho do chunk realmente recuperado.
- Testar bloqueio de documento removido, fallback quando não há evidência, avaliação da resposta, registro no painel e latência.
- Repetir a pergunta administrativa do plano de ensino e conferir vigência, carga horária e referência correspondente.

### 5. Verificar operação e publicação

- Validar app, painel, Nginx, worker, fila, Supabase e sincronização incremental do Drive.
- Confirmar que adicionar um arquivo pequeno cria chunks e que retirar o arquivo remove sua participação no RAG, sem apagar documentos não relacionados.
- Conferir logs sem timeout, quota, staging, órfãos ou erros de referência.
- Fazer deploy na VPS somente após os testes locais/SQL passarem; Vercel permanece apenas preservada, fora do fluxo de produção.
- Revalidar `/api/health`, uma pergunta real, referências, painel e serviço do worker após o deploy.

## Critérios para considerar concluído

- Banco dentro do limite confirmado no painel e por medição direta.
- Índice otimizado aceito somente com ganho comprovado e qualidade não inferior.
- Catálogo bibliográfico publicado somente para entradas respaldadas.
- Todas as respostas de aceite têm referências reais e pertinentes.
- Testes de inclusão/remoção no Drive, fallback, avaliação, painel e P50/P95 registrados.
- Backup e rollback identificados; nenhum segredo exposto; nenhuma exclusão adicional sem autorização e prova.

## Proibições na retomada

- Não usar reset de créditos sem autorização explícita.
- Não apagar os documentos restantes apenas para reduzir quota.
- Não reprocessar toda a pasta do Drive sem necessidade.
- Não publicar como “concluído” teste que não tenha evidência real.
- Não alterar regras dos documentos do cliente para mascarar falhas de referência.
