# Runtime do Guapu na VPS

Este runtime é preparado para homologação. O serviço `guapu-drive-sync-worker` permanece separado em `/opt/guapu`; o app web usa `/opt/guapu-app` e a porta local `3212`; o painel, quando as credenciais forem configuradas, usa a porta local `3213`.

## Princípios

- Google Drive é a fonte dos documentos.
- Supabase continua como banco do RAG, vetores, fila e telemetria.
- A VPS executa o app, o worker e a fila.
- A Vercel permanece disponível como rollback até a aprovação da Fase 8.
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

O domínio público só pode ser alterado após comparar VPS e Vercel usando o mesmo commit, corpus, prompts, perguntas críticas, referências e bateria de latência. Em caso de falha, o rollback é feito removendo a rota da VPS do DNS/proxy e mantendo a Vercel ativa.
