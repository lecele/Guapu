# Runtime do Guapu na VPS

Este é o runtime de produção do Guapu. O serviço `guapu-drive-sync-worker` permanece separado em `/opt/guapu`; o app web usa `/opt/guapu-app` e a porta local `3212`; o painel usa a porta local `3213`.

Os endereços públicos são `https://guapu.agentesnasaude.com.br` e `https://guapu-painel.agentesnasaude.com.br`. O Nginx faz a terminação TLS e encaminha cada host para o respectivo container; as portas dos containers ficam expostas somente em `127.0.0.1`.

## Princípios

- Google Drive é a fonte dos documentos.
- Supabase continua como banco do RAG, vetores, fila e telemetria.
- A VPS executa o app, o painel, o worker e a fila.
- O Google Drive é a origem dos documentos; o Supabase mantém fila, manifesto, vetores e telemetria.
- A Vercel não é o caminho de tráfego de produção. Pode ser preservada como rollback independente, sem participar da sincronização normal.
- Segredos ficam em `/etc/guapu/app.env`, com permissões restritas; não entram no repositório nem na imagem.
- As credenciais do painel ficam separadas em `/etc/guapu/panel.env`; sem elas, o painel permanece bloqueado com resposta 503.

## Validação mínima

```bash
docker compose -f /opt/guapu-app/docker-compose.guapu.yml config
systemctl status guapu-app.service
curl -fsS http://127.0.0.1:3212/api/health
docker inspect --format '{{.State.Health.Status}}' guapu-app
```

O painel só deve ser iniciado depois de preencher `/etc/guapu/panel.env` e validar a autenticação Basic; não reutilizar a senha temporária em produção pública.

O domínio público deve apontar para a VPS somente enquanto os healthchecks e a bateria de aceite estiverem aprovados. Em caso de falha, o rollback é feito removendo a rota da VPS do DNS/proxy e reativando a Vercel, sem apagar dados do Supabase.

## Checklist de operação

```bash
systemctl is-active guapu-drive-sync-worker.service
systemctl is-active guapu-drive-sync-queue.timer
docker compose -f /opt/guapu-app/docker-compose.guapu.yml ps
curl -fsS https://guapu.agentesnasaude.com.br/api/health
docker exec agentes-saude-nginx nginx -t
```

Após recriar os containers, recarregue o Nginx dentro do container para atualizar os upstreams:

```bash
docker exec agentes-saude-nginx nginx -t
docker exec agentes-saude-nginx nginx -s reload
```

Não reinicie o worker por rotina. Antes de uma nova tentativa, confira jobs `running`, `queued` e `failed`, chunks `staging` e os erros recentes do journal. Nunca marque uma sincronização como concluída sem validar chunks ativos e manifesto.
