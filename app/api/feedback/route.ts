// app/api/feedback/route.ts — Registro de Feedback por Estrelas (Likert 1-5)
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { session_id?: unknown; request_id?: unknown; rating?: unknown };
    const rating = Number(body.rating);
    const sessionId = typeof body.session_id === 'string' && body.session_id.trim()
      ? body.session_id.trim().slice(0, 128)
      : 'anonymous';
    const requestId = typeof body.request_id === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.request_id)
      ? body.request_id
      : null;

    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return NextResponse.json({ error: 'Nota inválida (1-5)' }, { status: 400 });
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json({ error: 'Serviço de avaliações não configurado' }, { status: 503 });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const record = { session_id: sessionId, request_id: requestId, rating };
    const { error } = requestId
      ? await supabase.from('feedback_ratings').upsert(record, { onConflict: 'session_id,request_id' })
      : await supabase.from('feedback_ratings').insert([record]);
    if (error) {
      console.error('[feedback] persistence error:', error.message);
      return NextResponse.json({ error: 'Não foi possível salvar sua avaliação' }, { status: 500 });
    }

    return NextResponse.json({ success: true, rating });
  } catch (err) {
    console.error('[feedback error]', err);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
