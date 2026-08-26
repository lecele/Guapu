import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const maxDuration = 20;

type HealthStatus = 'healthy' | 'warning' | 'critical';

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== 'production';
  return request.headers.get('authorization') === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  // O mesmo repositório é publicado para o app e para o painel. Apenas o
  // painel executa o cron; no app a chamada diária termina com sucesso sem
  // gerar registros duplicados nem alertas desnecessários.
  if (process.env.ENABLE_MONITOR_CRON !== 'true') {
    return NextResponse.json({ status: 'disabled' });
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_KEY;
  if (!url || !key) {
    return NextResponse.json({ status: 'critical', error: 'Supabase não configurado' }, { status: 503 });
  }

  const supabase = createClient(url, key);
  const checks: Array<{ component: 'supabase' | 'drive_sync' | 'quality_worker'; status: HealthStatus; detail: Record<string, unknown> }> = [];

  const { count: documentCount, error: documentsError } = await supabase
    .from('documents')
    .select('id', { count: 'exact', head: true });
  checks.push({
    component: 'supabase',
    status: documentsError ? 'critical' : 'healthy',
    detail: documentsError ? { error: documentsError.message.slice(0, 180) } : { indexed_documents: documentCount ?? 0 },
  });

  const { count: failedSyncs, error: syncError } = await supabase
    .from('drive_sync_jobs')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'failed');
  checks.push({
    component: 'drive_sync',
    status: syncError ? 'critical' : (failedSyncs ?? 0) > 0 ? 'warning' : 'healthy',
    detail: syncError ? { error: syncError.message.slice(0, 180) } : { failed_jobs: failedSyncs ?? 0 },
  });

  const { count: failedEvaluations, error: qualityError } = await supabase
    .from('response_quality_evaluations')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'failed');
  checks.push({
    component: 'quality_worker',
    status: qualityError ? 'critical' : (failedEvaluations ?? 0) > 0 ? 'warning' : 'healthy',
    detail: qualityError ? { error: qualityError.message.slice(0, 180) } : { failed_evaluations: failedEvaluations ?? 0 },
  });

  const { error: recordError } = await supabase.from('system_health_checks').insert(
    checks.map((check) => ({ component: check.component, status: check.status, detail: check.detail })),
  );

  const status: HealthStatus = checks.some((check) => check.status === 'critical')
    ? 'critical'
    : checks.some((check) => check.status === 'warning')
      ? 'warning'
      : 'healthy';

  return NextResponse.json(
    { status, checks, persisted: !recordError, timestamp: new Date().toISOString() },
    { status: status === 'critical' ? 503 : 200 },
  );
}
