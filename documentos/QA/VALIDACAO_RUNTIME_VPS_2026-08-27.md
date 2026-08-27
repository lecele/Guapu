# Validação do runtime Guapu na VPS — 27/08/2026

## Escopo

Preparação do aplicativo Guapu em container isolado na VPS, sem alteração de DNS e sem retirada da Vercel. O worker Drive → RAG existente permaneceu separado e ativo.

## Alterações preparadas

- Runtime Next.js standalone em `Dockerfile`.
- Serviço web isolado em `/opt/guapu-app`, porta local `127.0.0.1:3212`.
- Painel separado, condicionado a `/etc/guapu/panel.env`, porta local `127.0.0.1:3213`.
- Healthcheck do container em `/api/health`.
- Limites de memória/CPU, filesystem somente leitura, `tmpfs` e remoção de capabilities.
- Serviço `guapu-app.service` habilitado para iniciar o compose após reboot.
- Segredos mantidos fora do repositório, em arquivos protegidos da VPS.

## Testes realizados

| Verificação | Resultado |
|---|---|
| `npm run lint` | aprovado |
| `npm run test:flow` | 27 aprovados, 0 falhas |
| `npm run build` local | aprovado |
| `npm ci` no container | aprovado após sincronizar o lockfile |
| build Docker na VPS | aprovado |
| página `/` na VPS | HTTP 200 |
| `/api/health` na VPS | saudável; Supabase conectado |
| healthcheck Docker | `healthy` |
| `/admin` sem credenciais | HTTP 401; acesso bloqueado |
| `/admin` com credencial protegida | HTTP 200 |
| `/api/admin/stats` autenticada | HTTP 200; painel consegue ler métricas |
| `npm ci` compatível com o workflow | aprovado em dry-run com npm 10 e no build Docker com Node 22 |

## Estado e limites

Os containers principal e painel estão rodando apenas em loopback para homologação. Nenhum domínio público, DNS, Nginx ou tráfego da Vercel foi alterado. As credenciais do painel foram mantidas em arquivo protegido separado e não foram exibidas nos logs.

O build inicial revelou e corrigiu uma inconsistência real do `package-lock.json`: o `npm ci` do Node 22 exigia `@emnapi/core` e `@emnapi/runtime` na raiz do lockfile. A correção foi aplicada e o build passou.

O workflow web também foi alinhado ao runtime validado: Node 22 LTS e `npm ci`, evitando que o CI instale versões diferentes das registradas no lockfile. Essa alteração ainda precisa ser publicada no repositório para que os próximos pushes usem a correção.

Durante a continuação da Fase 1 foi observado um `statement timeout` no job do livro grande, já na segunda tentativa. Foi preparada a migração `db/migrations/019_index_drive_file_id.sql` para criar o índice de localização por `drive_file_id` de forma concorrente. Ela não foi aplicada durante o processamento, para não aumentar a carga no Supabase no meio da ingestão.

## Próxima validação

Executar a bateria real de qualidade, fontes, latência e regressão da Fase 1/2A no container da VPS. Só depois comparar VPS e Vercel e decidir o cutover de `guapu.agentesnasaude.com.br` e `guapu-painel.agentesnasaude.com.br`.
