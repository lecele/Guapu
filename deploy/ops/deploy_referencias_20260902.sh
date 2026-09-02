#!/usr/bin/env bash
# Deploy das correções de referências do Guapu — 02/09/2026
#
# Executar NA VPS. Os arquivos novos devem estar em /tmp/guapu-deploy-20260902/,
# com a mesma estrutura de diretórios do repositório.
#
#   ssh ... 'bash -s' < deploy/ops/deploy_referencias_20260902.sh
#
# Só mexe no Guapu. Não toca em agentes-frontend, hermes, agentes-saude-api,
# no stack de observabilidade, no worker /opt/guapu, em portas ou no firewall.
#
# Rollback: os arquivos anteriores ficam em $BACKUP_DIR e a imagem anterior é
# marcada como guapu-app:rollback-20260902 antes do build.

set -euo pipefail

APP_DIR=/opt/guapu-app
COMPOSE="$APP_DIR/docker-compose.guapu.yml"
STAGING=/tmp/guapu-deploy-20260902
BACKUP_DIR="$APP_DIR/backups/20260902-referencias"

FILES=(
  "lib/chat/references.ts"
  "lib/chat/document-catalog.ts"
  "lib/chat/prompts/core.ts"
  "lib/chat/prompts/flow.ts"
  "lib/chat/prompts/modes.ts"
  "app/api/chat/route.ts"
  ".dockerignore"
)

say() { printf '\n== %s\n' "$*"; }
fail() { printf '\nFALHOU: %s\n' "$*" >&2; exit 1; }

say "0/7  Conferindo os arquivos recebidos"
for file in "${FILES[@]}"; do
  [ -f "$STAGING/$file" ] || fail "arquivo ausente no staging: $file"
  printf '  ok  %s (%s bytes)\n' "$file" "$(stat -c%s "$STAGING/$file")"
done
grep -q 'MAX_REFERENCES' "$STAGING/lib/chat/references.ts" \
  || fail "references.ts recebido não contém a correção esperada"
echo "  marcador da versão nova confirmado"

say "1/7  Backup dos arquivos atuais"
# Idempotente de propósito. Na primeira execução (02/09, build falhou) os
# arquivos novos já foram publicados; refazer o backup agora gravaria a versão
# nova por cima e destruiria o ponto de retorno.
if sudo -n test -d "$BACKUP_DIR" && [ -n "$(sudo -n ls -A "$BACKUP_DIR" 2>/dev/null)" ]; then
  echo "  backup anterior preservado em $BACKUP_DIR"
  echo "  (não será sobrescrito — é o ponto de retorno da versão em produção)"
else
  sudo -n mkdir -p "$BACKUP_DIR"
  for file in "${FILES[@]}"; do
    if [ -f "$APP_DIR/$file" ]; then
      sudo -n install -D "$APP_DIR/$file" "$BACKUP_DIR/$file"
      echo "  guardado: $file"
    else
      echo "  AVISO: $file não existia no destino"
    fi
  done
  sudo -n cp "$COMPOSE" "$BACKUP_DIR/docker-compose.guapu.yml"
  echo "  backup em $BACKUP_DIR"
fi

say "2/7  Marcando a imagem atual para rollback"
if sudo -n docker image inspect guapu-app:rollback-20260902 > /dev/null 2>&1; then
  echo "  guapu-app:rollback-20260902 já existe; mantida como está"
elif sudo -n docker image inspect guapu-app:homologacao > /dev/null 2>&1; then
  sudo -n docker tag guapu-app:homologacao guapu-app:rollback-20260902
  echo "  guapu-app:rollback-20260902 criada"
else
  echo "  AVISO: imagem guapu-app:homologacao não encontrada"
fi

say "3/7  Publicando os arquivos"
for file in "${FILES[@]}"; do
  sudo -n install -D -m 0664 "$STAGING/$file" "$APP_DIR/$file"
  echo "  publicado: $file"
done

say "4/7  Validando o compose e o contexto do build"
# Foi exatamente isto que derrubou a primeira tentativa: os backups ficam dentro
# de /opt/guapu-app e entravam no "COPY ." do Dockerfile; o TypeScript
# verificava cópias de arquivos fora do lugar e o build falhava.
grep -qE '^\*\*/backups$|^backups$' "$APP_DIR/.dockerignore" \
  || fail ".dockerignore no servidor não exclui backups/ — o build falharia de novo"
echo "  backups fora do contexto do build: ok"
sudo -n docker compose -f "$COMPOSE" config > /dev/null
echo "  compose válido"

say "5/7  Build da imagem (pode levar alguns minutos)"
sudo -n docker compose -f "$COMPOSE" build

say "6/7  Subindo os containers"
sudo -n docker compose -f "$COMPOSE" up -d

say "7/7  Verificação de saúde"
status=unknown
for attempt in $(seq 1 25); do
  status=$(sudo -n docker inspect --format '{{.State.Health.Status}}' guapu-app 2>/dev/null || echo unknown)
  echo "  tentativa $attempt: guapu-app=$status"
  [ "$status" = "healthy" ] && break
  sleep 6
done

if [ "$status" != "healthy" ]; then
  echo "" >&2
  echo "O container não ficou saudável. Últimas linhas do log:" >&2
  sudo -n docker logs --tail 40 guapu-app >&2
  echo "" >&2
  echo "PARA REVERTER:" >&2
  echo "  sudo cp -r $BACKUP_DIR/lib $BACKUP_DIR/app $APP_DIR/" >&2
  echo "  sudo docker compose -f $COMPOSE build && sudo docker compose -f $COMPOSE up -d" >&2
  fail "healthcheck do guapu-app"
fi

echo ""
echo "Saúde local:"
curl -fsS http://127.0.0.1:3212/api/health || fail "healthcheck local"
echo ""

echo "Recarregando o Nginx (só depois do teste de configuração):"
sudo -n docker exec agentes-saude-nginx nginx -t
sudo -n docker exec agentes-saude-nginx nginx -s reload
echo "  nginx recarregado"

echo ""
echo "Saúde pública:"
curl -fsS https://guapu.agentesnasaude.com.br/api/health || fail "healthcheck público"
echo ""

echo "Confirmação da versão publicada:"
grep -c 'MAX_REFERENCES' "$APP_DIR/lib/chat/references.ts"

say "DEPLOY CONCLUÍDO"
echo "Backup do estado anterior: $BACKUP_DIR"
echo "Imagem de rollback: guapu-app:rollback-20260902"
