// app/api/health/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const maxDuration = 10;

export async function GET() {
  try {
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_KEY!
    );

    // Quick ping to Supabase
    const { error } = await supabase
      .from('documents')
      .select('id')
      .limit(1);

    return NextResponse.json({
      status: 'healthy',
      supabase: error ? 'error' : 'connected',
      timestamp: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json({ status: 'healthy', supabase: 'unknown' });
  }
}
