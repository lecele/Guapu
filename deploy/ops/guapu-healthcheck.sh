#!/usr/bin/env bash
set -u

STATE_DIR="${GUAPU_HEALTH_STATE_DIR:-/var/lib/guapu-health}"
mkdir -p "$STATE_DIR"

app_status=0
panel_status=0
nginx_status=0
worker_status=0
timer_status=0
disk_used=0

if curl -fsS --max-time 10 https://guapu.agentesnasaude.com.br/api/health >/dev/null 2>&1; then
  app_status=1
fi

panel_http="$(curl -k -sS --max-time 10 -o /dev/null -w '%{http_code}' https://guapu-painel.agentesnasaude.com.br/ 2>/dev/null || true)"
if [ "$panel_http" = "401" ]; then
  panel_status=1
fi

if docker exec agentes-saude-nginx nginx -t >/dev/null 2>&1; then
  nginx_status=1
fi

if systemctl is-active --quiet guapu-drive-sync-worker.service; then
  worker_status=1
fi

if systemctl is-active --quiet guapu-drive-sync-queue.timer; then
  timer_status=1
fi

disk_used="$(df -P / | awk 'NR==2 {gsub(/%/, "", $5); print $5}')"
[ -n "$disk_used" ] || disk_used=0

overall=1
if [ "$app_status" -ne 1 ] || [ "$panel_status" -ne 1 ] || [ "$nginx_status" -ne 1 ] || [ "$worker_status" -ne 1 ] || [ "$timer_status" -ne 1 ]; then
  overall=0
fi

now="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
tmp="$STATE_DIR/guapu.prom.tmp"
{
  echo "# TYPE guapu_health_status gauge"
  echo "guapu_health_status $overall"
  echo "# TYPE guapu_app_up gauge"
  echo "guapu_app_up $app_status"
  echo "# TYPE guapu_panel_auth_up gauge"
  echo "guapu_panel_auth_up $panel_status"
  echo "# TYPE guapu_nginx_config_valid gauge"
  echo "guapu_nginx_config_valid $nginx_status"
  echo "# TYPE guapu_drive_worker_active gauge"
  echo "guapu_drive_worker_active $worker_status"
  echo "# TYPE guapu_drive_queue_timer_active gauge"
  echo "guapu_drive_queue_timer_active $timer_status"
  echo "# TYPE guapu_root_disk_used_percent gauge"
  echo "guapu_root_disk_used_percent $disk_used"
  echo "# TYPE guapu_healthcheck_timestamp_seconds gauge"
  echo "guapu_healthcheck_timestamp_seconds $(date +%s)"
} > "$tmp"
mv "$tmp" "$STATE_DIR/guapu.prom"

printf '{"timestamp":"%s","healthy":%s,"app":%s,"panel_auth":%s,"nginx_config":%s,"worker":%s,"queue_timer":%s,"root_disk_used_percent":%s,"panel_http_status":"%s"}\n' \
  "$now" "$overall" "$app_status" "$panel_status" "$nginx_status" "$worker_status" "$timer_status" "$disk_used" "$panel_http" \
  > "$STATE_DIR/last.json"

chmod 0644 "$STATE_DIR/guapu.prom" "$STATE_DIR/last.json"
exit "$((1-overall))"
