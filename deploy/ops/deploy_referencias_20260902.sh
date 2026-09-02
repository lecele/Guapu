#!/usr/bin/env bash
# Deploy das correções de referências — 02/09/2026
#
# Executar NA VPS, depois que os arquivos alterados já tiverem sido copiados
# para /opt/guapu-app. Segue o padrão das publicações anteriores: backup antes,
# build, subida e healthcheck, sem tocar em worker, fila, Supabase ou Nginx
# além do reload necessário.
#
#   ssh agentesnasa-vps 'bash -s' < deploy/ops/deploy_referencias_20260902.sh
#
# Rollback: os arquivos originais ficam em $BACKUP_DIR; restaure e repita o
# build. A imagem anterior continua disponível como guapu-app:rollback-*.

set -euo pipefail

APP_DIR=/opt/guapu-app
COMPOSE="$APP_DIR/docker-compose.guapu.yml"
STAMP=20260902-referencias
BACKUP_DIR="$APP_DIR/backups/$STAMP"

FILES=(
  "lib/chat/references.ts"
  "lib/chat/document-catalog.ts"
  "lib/chat/prompts/core.ts"
  "lib/chat/prompts/flow.ts"
  "lib/chat/prompts/modes.ts"
  "app/api/chat/route.ts"
)

say() { printf '\n\033[1m== %s\033[0m\n' "$*"; }

say "1/5  Backup dos arquivos que serão substituídos"
sudo mkdir -p "$BACKUP_DIR"
for file in "${FILES[@]}"; do
  if [ -f "$APP_DIR/$file" ]; then
    sudo install -D "$APP_DIR/$file" "$BACKUP_DIR/$file"
    echo "  guardado: $file"
  else
    echo "  AVISO: $file não existe no destino; será criado"
  fi
done
sudo cp "$COMPOSE" "$BACKUP_DIR/docker-compose.guapu.yml"
echo "Backup em $BACKUP_DIR"

say "2/5  Conferência do compose"
sudo docker compose -f "$COMPOSE" config > /dev/null
echo "compose válido"

say "3/5  Build da imagem"
sudo docker compose -f "$COMPOSE" build

say "4/5  Subindo os containers"
sudo docker compose -f "$COMPOSE" up -d

say "5/5  Healthcheck"
for attempt in $(seq 1 20); do
  status=$(sudo docker inspect --format '{{.State.Health.Status}}' guapu-app 2>/dev/null || echo unknown)
  echo "  tentativa $attempt: guapu-app=$status"
  [ "$status" = "healthy" ] && break
  sleep 6
done

if [ "${status:-unknown}" != "healthy" ]; then
  echo "FALHA: guapu-app não ficou healthy. Últimas linhas do log:" >&2
  sudo docker logs --tail 40 guapu-app >&2
  echo "Restaure de $BACKUP_DIR e rode o build novamente." >&2
  exit 1
fi

curl -fsS http://127.0.0.1:3212/api/health && echo
sudo docker exec agentes-saude-nginx nginx -t
sudo docker exec agentes-saude-nginx nginx -s reload
curl -fsS https://guapu.agentesnasaude.com.br/api/health && echo

say "Deploy concluído. Backup do estado anterior: $BACKUP_DIR"
