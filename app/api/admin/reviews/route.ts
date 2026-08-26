import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

const verdicts = new Set(['correct', 'incomplete', 'incorrect']);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isAuthorized(request: NextRequest): boolean {
  const expectedUser = process.env.ADMIN_DASHBOARD_USER;
  const expectedPassword = process.env.ADMIN_DASHBOARD_PASSWORD;
  if (!expectedUser || !expectedPassword) return process.env.NODE_ENV !== 'production';

  const header = request.headers.get('authorization');
  if (!header?.startsWith('Basic ')) return false;
  try {
    const [user, password] = atob(header.slice(6)).split(':');
    return user === expectedUser && password === expectedPassword;
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Acesso administrativo não autorizado' }, { status: 401 });
  }

  try {
    const body = await request.json() as { message_id?: unknown; session_id?: unknown; verdict?: unknown; notes?: unknown };
    const messageId = typeof body.message_id === 'string' ? body.message_id : '';
    const sessionId = typeof body.session_id === 'string' ? body.session_id.trim() : '';
    const verdict = typeof body.verdict === 'string' ? body.verdict : '';
    const notes = typeof body.notes === 'string' ? body.notes.trim().slice(0, 4_000) : '';

    if (!uuidPattern.test(messageId) || !sessionId || !verdicts.has(verdict)) {
      return NextResponse.json({ error: 'Dados de revisão inválidos' }, { status: 400 });
    }

    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_KEY;
    if (!url || !key) return NextResponse.json({ error: 'Banco não configurado' }, { status: 503 });

    const supabase = createClient(url, key);
    const { data: message, error: messageError } = await supabase
      .from('chat_messages')
      .select('id, session_id, role')
      .eq('id', messageId)
      .maybeSingle();

    if (messageError || !message || message.role !== 'assistant' || String(message.session_id) !== sessionId) {
      return NextResponse.json({ error: 'Resposta do assistente não encontrada' }, { status: 404 });
    }

    const { error } = await supabase.from('admin_response_reviews').upsert(
      { message_id: messageId, session_id: sessionId, verdict, notes, reviewer: 'lecele', updated_at: new Date().toISOString() },
      { onConflict: 'message_id' },
    );
    if (error) {
      console.error('[admin/reviews] persistence error:', error.message);
      return NextResponse.json({ error: 'Não foi possível salvar a revisão' }, { status: 500 });
    }

    return NextResponse.json({ success: true, message_id: messageId, verdict, notes });
  } catch {
    return NextResponse.json({ error: 'Requisição de revisão inválida' }, { status: 400 });
  }
}
