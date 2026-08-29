import { readFile } from 'node:fs/promises';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

type HealthSnapshot = {
  timestamp?: string;
  healthy?: number;
  app?: number;
  panel_auth?: number;
  nginx_config?: number;
  worker?: number;
  queue_timer?: number;
  root_disk_used_percent?: number;
  panel_http_status?: string;
};

const snapshotPath = process.env.GUAPU_HEALTH_SNAPSHOT_PATH ?? '/run/guapu-health/last.json';

function isFresh(timestamp: string | undefined): boolean {
  if (!timestamp) return false;
  const ageMs = Date.now() - new Date(timestamp).getTime();
  return Number.isFinite(ageMs) && ageMs >= -60_000 && ageMs <= 15 * 60_000;
}

export async function GET() {
  try {
    const snapshot = JSON.parse(await readFile(/* turbopackIgnore: true */ snapshotPath, 'utf8')) as HealthSnapshot;
    const fresh = isFresh(snapshot.timestamp);
    const healthy = fresh && snapshot.healthy === 1;

    return NextResponse.json({
      status: healthy ? 'healthy' : 'warning',
      fresh,
      checkedAt: snapshot.timestamp ?? null,
      diskUsedPercent: Number(snapshot.root_disk_used_percent ?? 0),
      components: [
        { key: 'app', label: 'App', healthy: snapshot.app === 1 },
        { key: 'panel', label: 'Painel', healthy: snapshot.panel_auth === 1 },
        { key: 'nginx', label: 'Nginx', healthy: snapshot.nginx_config === 1 },
        { key: 'worker', label: 'Worker', healthy: snapshot.worker === 1 },
        { key: 'queue', label: 'Fila', healthy: snapshot.queue_timer === 1 },
      ],
    });
  } catch {
    return NextResponse.json(
      { status: 'unknown', fresh: false, checkedAt: null, diskUsedPercent: null, components: [] },
      { status: 503 },
    );
  }
}
