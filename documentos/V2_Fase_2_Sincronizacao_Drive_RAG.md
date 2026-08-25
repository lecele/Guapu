# Gapu V2 — Fase 2: sincronização Google Drive → RAG

Data: 25 de agosto de 2026

## Resultado da implementação

A automação foi convertida de uma ingestão simples para uma reconciliação persistente:

- percorre todas as páginas e subpastas da pasta compartilhada no Drive;
- identifica arquivos novos, alterados, inalterados e removidos;
- não recalcula embeddings de arquivos inalterados;
- atualiza os chunks de um arquivo alterado e só remove os chunks obsoletos depois da gravação da nova versão;
- remove do RAG os chunks de arquivos que deixaram de existir no Drive;
- registra versão, checksum, caminho, quantidade de chunks, último sucesso e último erro no manifesto;
- em caso de falha parcial, mantém o conteúdo anterior e tenta limpar os chunks novos incompletos;
- executa automaticamente a cada hora pelo GitHub Actions e também permite execução manual.

A leitura real de validação encontrou 119 documentos: 118 PDFs e 1 Google Doc. Não foram encontrados nomes duplicados.

## Migrações obrigatórias antes de ativar

Aplicar, nesta ordem:

1. `db/migrations/004_add_persistent_chat_state.sql`;
2. `db/migrations/005_add_drive_sync_manifest.sql`.

Depois, validar:

```powershell
python scripts/manage_schema.py --check
```

A ativação não deve ser feita antes da migração 005. Sem o manifesto, a rotina é interrompida e não deve alterar documentos.

## Segredos do GitHub Actions

Cadastrar em `lecele/Gapu` → Settings → Secrets and variables → Actions:

- `GOOGLE_API_KEY`
- `GOOGLE_SERVICE_ACCOUNT_JSON`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `DRIVE_FOLDER_ID`

A pasta do Drive precisa estar compartilhada, com permissão de leitura, com o e-mail `client_email` da Service Account. Nenhum desses valores deve ser salvo no código ou em variável `NEXT_PUBLIC_*`.

## Primeira execução

A base atual possui aproximadamente 36 mil chunks antigos sem `drive_file_id`. Por isso, a primeira execução é uma migração completa: ela recalcula os vetores usando `gemini-embedding-2` com 768 dimensões, grava a proveniência e remove cópias legadas quando o nome do arquivo é único na pasta.

Para não estourar o tempo do GitHub Actions, cada execução processa no máximo 10 arquivos novos ou alterados. Os demais ficam como `deferred` e são retomados automaticamente na hora seguinte. O manifesto é salvo ao concluir cada arquivo, então uma execução posterior não recalcula os arquivos já finalizados.

Se existirem dois arquivos do Drive com o mesmo nome, a limpeza legada desse nome é intencionalmente ignorada para evitar uma exclusão ambígua. Esses casos devem ser revisados manualmente depois da primeira execução.

Antes da primeira execução real, recomenda-se gerar um backup do Supabase. As execuções seguintes processarão apenas diferenças e terão custo muito menor.

## Agendamento

Workflow: `.github/workflows/sync-drive-rag.yml`

- automático: uma vez por hora;
- manual: botão **Run workflow** no GitHub Actions;
- concorrência: somente uma sincronização por vez;
- falha por segredo ausente: ocorre antes da instalação e da ingestão, com mensagem explícita.

## Estado do deploy e domínios

A conta Vercel autenticada ainda não possui domínios personalizados cadastrados. Serão criados dois projetos com os aliases padrão:

- `gapu.vercel.app` para o chatbot;
- `gapu-painel.vercel.app` para o painel administrativo.

A disponibilidade exata dos dois nomes será confirmada na etapa de deploy.
