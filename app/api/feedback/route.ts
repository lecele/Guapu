// app/api/feedback/route.ts — Registro de Feedback por Estrelas (Likert 1-5)
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { session_id?: unknown; rating?: unknown };
    const rating = Number(body.rating);
    const sessionId = typeof body.session_id === 'string' && body.session_id.trim()
      ? body.session_id.trim().slice(0, 128)
      : 'anonymous';

    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return NextResponse.json({ error: 'Nota inválida (1-5)' }, { status: 400 });
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json({ error: 'Serviço de avaliações não configurado' }, { status: 503 });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const { error } = await supabase.from('feedback_ratings').insert([
      { session_id: sessionId, rating },
    ]);
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
