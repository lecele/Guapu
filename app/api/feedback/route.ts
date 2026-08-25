// app/api/feedback/route.ts — Registro de Feedback por Estrelas (Likert 1-5)
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const { session_id, rating } = await req.json();

    if (!rating || rating < 1 || rating > 5) {
      return NextResponse.json({ error: 'Nota inválida (1-5)' }, { status: 400 });
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_KEY;

    if (supabaseUrl && supabaseKey) {
      const supabase = createClient(supabaseUrl, supabaseKey);
      await (supabase.from('feedback_ratings') as any).insert([
        { session_id: session_id || 'anonymous', rating: Number(rating) }
      ]);
    }

    return NextResponse.json({ success: true, rating });
  } catch (err) {
    console.error('[feedback error]', err);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
