// app/api/health/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const maxDuration = 10;

const SUPABASE_HEALTH_TIMEOUT_MS = 6_000;

async function fetchSupabaseWithTimeout(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SUPABASE_HEALTH_TIMEOUT_MS);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

export async function GET() {
  const timestamp = new Date().toISOString();
  try {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_KEY;
    if (!url || !key) {
      return NextResponse.json({ status: 'unhealthy', supabase: 'not_configured', timestamp }, { status: 503 });
    }
    const supabase = createClient(
      url,
      key,
      { global: { fetch: fetchSupabaseWithTimeout } },
    );

    // Quick ping to Supabase
    const { error } = await supabase
      .from('documents')
      .select('id')
      .limit(1);

    if (error) {
      return NextResponse.json({ status: 'unhealthy', supabase: 'error', timestamp }, { status: 503 });
    }

    return NextResponse.json({ status: 'healthy', supabase: 'connected', timestamp });
  } catch {
    return NextResponse.json({ status: 'unhealthy', supabase: 'unknown', timestamp }, { status: 503 });
  }
}
