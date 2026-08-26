// app/api/admin/stats/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const revalidate = 0; // Sempre dados atualizados em tempo real

type ChatTelemetry = {
  has_context?: boolean;
  model_requested?: string | null;
  fallback_used?: boolean;
  error_code?: string | null;
  sources_found?: number;
  latency_ms?: {
    embedding?: number;
    retrieval?: number;
    generation?: number;
    total?: number;
  };
};

type ChatMessageWithTelemetry = {
  role: 'user' | 'assistant';
  metadata?: ChatTelemetry | null;
};

type ChatMessageRecord = ChatMessageWithTelemetry & {
  id?: string;
  session_id: string;
  content: string;
  created_at: string;
};

type SessionSummary = {
  sessionId: string;
  firstAt: string;
  lastAt: string;
  userFirstMsg: string;
  messageCount: number;
  detectedTheme: string;
  messages: Array<{
    id?: string;
    role: 'user' | 'assistant';
    content: string;
    created_at: string;
    review?: { verdict: 'correct' | 'incomplete' | 'incorrect'; notes: string; updated_at: string };
  }>;
  avgRating: number | null;
  ratingCount: number;
};

function assistantMessagesWithMetadata<T extends ChatMessageWithTelemetry>(messages: T[]): T[] {
  return messages.filter((message) => message.role === 'assistant' && message.metadata != null);
}

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

function percentile(values: number[], percentileValue: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((percentileValue / 100) * sorted.length) - 1);
  return Math.round(sorted[index]);
}

function average(values: number[]): number {
  return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0;
}

export async function GET(request: NextRequest) {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json(
        { error: 'Acesso administrativo não autorizado' },
        { status: 401, headers: { 'WWW-Authenticate': 'Basic realm="Guapu Painel"' } },
      );
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json({ error: 'Supabase credentials not configured' }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // 1. Busca paginada das mensagens. Não truncar o histórico altera diretamente
    // os totais e os percentis exibidos no painel.
    let allMessages: ChatMessageRecord[] = [];
    try {
      const pageSize = 1000;
      const maxRows = 50_000;
      for (let start = 0; start < maxRows; start += pageSize) {
        const { data: page, error } = await supabase.from('chat_messages')
          .select('id, session_id, role, content, created_at, metadata')
          .order('created_at', { ascending: true })
          .range(start, start + pageSize - 1);
        if (error) throw error;
        const rows = page || [];
        allMessages.push(...(rows as ChatMessageRecord[]));
        if (rows.length < pageSize) break;
      }
    } catch (error) {
      console.error('[admin/stats] error fetching messages:', error);
    }

    // Se o banco estiver vazio ou sem conexao, usa dados iniciais de demonstracao
    if (process.env.NODE_ENV !== 'production' && (!allMessages || allMessages.length === 0)) {
      const now = new Date();
      allMessages = [
        {
          session_id: 'session-enf-001',
          role: 'user',
          content: 'Quais são os principais cuidados na hemostasia cirúrgica?',
          created_at: new Date(now.getTime() - 3600000 * 2).toISOString(),
        },
        {
          session_id: 'session-enf-001',
          role: 'assistant',
          content: '**Explicação:** A hemostasia envolve técnicas mecânicas e químicas para estancar o sangramento operatório...',
          created_at: new Date(now.getTime() - 3600000 * 2 + 2000).toISOString(),
        },
        {
          session_id: 'session-enf-002',
          role: 'user',
          content: '2 - Quiz sobre Feridas e Deiscência',
          created_at: new Date(now.getTime() - 3600000 * 5).toISOString(),
        },
        {
          session_id: 'session-enf-002',
          role: 'assistant',
          content: '**Questão 1:** Qual a complicação caracterizada pela abertura das bordas suturadas?\n\n**A)** Deiscência\n\n**B)** Fistulização\n\n**C)** Evisceração\n\n**D)** Infecção',
          created_at: new Date(now.getTime() - 3600000 * 5 + 1500).toISOString(),
        },
        {
          session_id: 'session-enf-002',
          role: 'user',
          content: 'letra A',
          created_at: new Date(now.getTime() - 3600000 * 5 + 20000).toISOString(),
        },
        {
          session_id: 'session-enf-002',
          role: 'assistant',
          content: 'Parabéns, você acertou! A deiscência é a separação das bordas.',
          created_at: new Date(now.getTime() - 3600000 * 5 + 22000).toISOString(),
        },
        {
          session_id: 'session-enf-003',
          role: 'user',
          content: 'Resumo sobre Cirurgia Bariátrica',
          created_at: new Date(now.getTime() - 3600000 * 24).toISOString(),
        },
        {
          session_id: 'session-enf-003',
          role: 'assistant',
          content: '**Explicação:** A assistência de enfermagem na cirurgia bariátrica abrange a avaliação pré-operatória e vigilância pós-operatória...',
          created_at: new Date(now.getTime() - 3600000 * 24 + 1800).toISOString(),
        },
      ];
    }

    // 2. Busca documentos RAG da base de conhecimento
    let ragDocs: Array<{ id: string; source: string; content?: string }> = [];
    try {
      const pageSize = 1000;
      const maxRows = 50_000;
      for (let start = 0; start < maxRows; start += pageSize) {
        const { data: page, error } = await supabase.from('documents')
          .select('id, source')
          .range(start, start + pageSize - 1);
        if (error) throw error;
        const rows = page || [];
        ragDocs.push(...(rows as Array<{ id: string; source: string; content?: string }>));
        if (rows.length < pageSize) break;
      }
    } catch (e) {
      console.warn('[admin/stats] docs fetch error:', e);
    }

    if (process.env.NODE_ENV !== 'production' && (!ragDocs || ragDocs.length === 0)) {
      ragDocs = [
        { id: '1', source: 'Brunner & Suddarth — Tratado de Enfermagem Médico-Cirúrgica.pdf', content: '14.280 chunks' },
        { id: '2', source: 'Cuidados Críticos de Enfermagem — Patricia Morton & Dorrie Fontaine.pdf', content: '11.850 chunks' },
        { id: '3', source: 'Manual de Enfermagem Perioperatória — SOBECC.pdf', content: '4.320 chunks' },
        { id: '4', source: 'Diretrizes para Prevenção de Infecção de Sítio Cirúrgico (ANVISA/OMS).pdf', content: '1.840 chunks' },
        { id: '5', source: 'Protocolo Nacional de Cirurgia Segura (Ministério da Saúde).pdf', content: '960 chunks' },
        { id: '6', source: 'Cuidados de Enfermagem em Cirurgia Bariátrica e Metabólica.pdf', content: '820 chunks' },
        { id: '7', source: 'Manejo e Tratamento de Feridas Complexas e Estomas.pdf', content: '640 chunks' },
        { id: '8', source: 'Manual de Anestesiologia e Cuidados de SRPA.pdf', content: '510 chunks' },
        { id: '9', source: 'Plano_de_Ensino_INT5224_2026.docx', content: '180 chunks' },
        { id: '10', source: 'Checklist_Posicionamento_Cirurgico.pdf', content: '112 chunks' },
        { id: '11', source: 'Guia_Hemostasia_e_Curativos_Especiais.pdf', content: '40 chunks' },
        { id: '12', source: 'Protocolo_Dor_Pos_Operatoria.pdf', content: '20 chunks' },
      ];
    }

    // ── AGREGADORES E MÉTRICAS ──────────────────────────────────────────────

    // Sessions Map
    const sessionMap = new Map<string, SessionSummary>();

    let quizCorrectCount = 0;
    let quiz1stAttemptWrong = 0;
    let quiz2ndAttemptWrong = 0;
    let guardRailCount = 0;

    const topicCounts: Record<string, number> = {
      'Hemostasia': 0,
      'Feridas e Cicatrização': 0,
      'Cirurgia Bariátrica': 0,
      'Anestesia': 0,
      'Estomas e Ostomias': 0,
      'Cuidados Pré-operatórios': 0,
      'Cuidados Pós-operatórios': 0,
      'Posicionamento Cirúrgico': 0,
      'Infecção de Sítio Cirúrgico': 0,
      'Outros Temas': 0,
    };

    const modeCounts = {
      resumo: 0,
      quiz: 0,
      info: 0,
      livre: 0,
    };

    // Timeline por data
    const dateTimelineMap = new Map<string, number>();

    allMessages.forEach((msg) => {
      // Session grouping
      const sId = msg.session_id || 'unknown';
      if (!sessionMap.has(sId)) {
        sessionMap.set(sId, {
          sessionId: sId,
          firstAt: msg.created_at,
          lastAt: msg.created_at,
          userFirstMsg: msg.role === 'user' ? msg.content : '',
          messageCount: 0,
          detectedTheme: 'Geral',
          messages: [],
          avgRating: null,
          ratingCount: 0,
        });
      }

      const sessionObj = sessionMap.get(sId)!;
      sessionObj.messageCount++;
      sessionObj.lastAt = msg.created_at;
      if (!sessionObj.userFirstMsg && msg.role === 'user') {
        sessionObj.userFirstMsg = msg.content;
      }
      sessionObj.messages.push(msg);

      // Date timeline aggregation
      if (msg.created_at) {
        const dateKey = msg.created_at.substring(0, 10); // YYYY-MM-DD
        dateTimelineMap.set(dateKey, (dateTimelineMap.get(dateKey) || 0) + 1);
      }

      // Content & Analytics analysis
      const textLower = msg.content.toLowerCase();

      // Guard Rails detection
      if (textLower.includes('não posso responder a essa solicitação') || textLower.includes('fora do escopo da disciplina')) {
        guardRailCount++;
      }

      // Quiz performance analytics
      if (msg.role === 'assistant') {
        if (textLower.includes('parabéns, você acertou') || textLower.includes('resposta correta!')) {
          quizCorrectCount++;
        }
        if (textLower.includes('sua resposta está incorreta. tente novamente')) {
          quiz1stAttemptWrong++;
        }
        if (textLower.includes('a alternativa correta é a')) {
          quiz2ndAttemptWrong++;
        }
      }

      // Topic detection
      if (msg.role === 'user') {
        if (textLower.includes('hemostasia')) topicCounts['Hemostasia']++;
        else if (textLower.includes('ferida') || textLower.includes('cicatriz')) topicCounts['Feridas e Cicatrização']++;
        else if (textLower.includes('bariatrica') || textLower.includes('bariátrica')) topicCounts['Cirurgia Bariátrica']++;
        else if (textLower.includes('anestesia') || textLower.includes('anestésico')) topicCounts['Anestesia']++;
        else if (textLower.includes('estoma') || textLower.includes('ostomia')) topicCounts['Estomas e Ostomias']++;
        else if (textLower.includes('pre-operatorio') || textLower.includes('pré-operatório')) topicCounts['Cuidados Pré-operatórios']++;
        else if (textLower.includes('pos-operatorio') || textLower.includes('pós-operatório')) topicCounts['Cuidados Pós-operatórios']++;
        else if (textLower.includes('posicionamento')) topicCounts['Posicionamento Cirúrgico']++;
        else if (textLower.includes('infec') || textLower.includes('isc')) topicCounts['Infecção de Sítio Cirúrgico']++;
        else topicCounts['Outros Temas']++;

        // Mode detection
        if (textLower.includes('quiz') || textLower.includes('simulado')) modeCounts.quiz++;
        else if (textLower.includes('resumo') || textLower.includes('aprofundar')) modeCounts.resumo++;
        else if (textLower.includes('informac')) modeCounts.info++;
        else modeCounts.livre++;
      }
    });

    // Detect primary theme for each session
    sessionMap.forEach((sess) => {
      const fullText = sess.messages.map(m => m.content.toLowerCase()).join(' ');
      if (fullText.includes('hemostasia')) sess.detectedTheme = 'Hemostasia';
      else if (fullText.includes('ferida')) sess.detectedTheme = 'Feridas';
      else if (fullText.includes('bariatrica') || fullText.includes('bariátrica')) sess.detectedTheme = 'Cirurgia Bariátrica';
      else if (fullText.includes('anestesia')) sess.detectedTheme = 'Anestesia';
      else if (fullText.includes('estoma')) sess.detectedTheme = 'Estomas';
      else if (fullText.includes('pre-operatorio') || fullText.includes('pré-operatório')) sess.detectedTheme = 'Pré-operatório';
      else if (fullText.includes('pos-operatorio') || fullText.includes('pós-operatório')) sess.detectedTheme = 'Pós-operatório';
      else if (fullText.includes('posicionamento')) sess.detectedTheme = 'Posicionamento';
      else sess.detectedTheme = 'Geral Enfermagem';
    });

    const sessionsList = Array.from(sessionMap.values()).sort((a, b) =>
      new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime()
    );

    // Timeline array sorted by date
    const timeline = Array.from(dateTimelineMap.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Totais e percentuais
    const totalConversations = sessionMap.size;
    const totalMessages = allMessages.length;
    const totalQuizAttempts = quizCorrectCount + quiz1stAttemptWrong + quiz2ndAttemptWrong;
    const quizAccuracyRate = totalQuizAttempts > 0
      ? Math.round((quizCorrectCount / totalQuizAttempts) * 100)
      : 0;

    // 3. Busca avaliações por estrelas (feedback_ratings)
    let feedbackRatings: Array<{ session_id?: string; rating: number; created_at: string }> = [];
    try {
      const { data: fb } = await supabase.from('feedback_ratings')
        .select('session_id, rating, created_at')
        .order('created_at', { ascending: false });
      feedbackRatings = (fb || []) as Array<{ session_id?: string; rating: number; created_at: string }>;
    } catch (e) {
      console.warn('[admin/stats] feedback fetch error:', e);
    }

    const sessionRatingMap = new Map<string, number[]>();
    feedbackRatings.forEach((f) => {
      if (f.session_id) {
        const arr = sessionRatingMap.get(f.session_id) || [];
        arr.push(f.rating);
        sessionRatingMap.set(f.session_id, arr);
      }
    });

    sessionMap.forEach((sess, id) => {
      const ratings = sessionRatingMap.get(id);
      if (ratings && ratings.length > 0) {
        const avg = (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1);
        sess.avgRating = Number(avg);
        sess.ratingCount = ratings.length;
      } else {
        sess.avgRating = null;
        sess.ratingCount = 0;
      }
    });

    const ratingCounts = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    if (feedbackRatings.length > 0) {
      feedbackRatings.forEach(f => {
        if (f.rating >= 1 && f.rating <= 5) {
          ratingCounts[f.rating as 1|2|3|4|5]++;
        }
      });
    }

    const totalFeedbacks = feedbackRatings.length;
    const sumRatings = Object.entries(ratingCounts).reduce((sum, [star, count]) => sum + (Number(star) * count), 0);
    const avgRating = totalFeedbacks > 0 ? (sumRatings / totalFeedbacks).toFixed(1) : '0.0';
    const satisfactionRate = totalFeedbacks > 0
      ? Math.round(((ratingCounts[5] + ratingCounts[4]) / totalFeedbacks) * 100)
      : 0;

    const ragSummaryList = ragDocs.reduce<Array<{ source: string; chunkCount: number; category: string }>>((items, doc) => {
      const existing = items.find((item) => item.source === doc.source);
      if (existing) existing.chunkCount += 1;
      else items.push({
        source: doc.source || 'Fonte não identificada',
        chunkCount: 1,
        category: (doc.source || 'Material RAG').split('__')[0].replace(/[_-]/g, ' ') || 'Material RAG',
      });
      return items;
    }, []).sort((a, b) => b.chunkCount - a.chunkCount);

    const telemetryMessages = assistantMessagesWithMetadata(allMessages);
    const latencies = telemetryMessages
      .map((message) => Number(message.metadata?.latency_ms?.total))
      .filter((value) => Number.isFinite(value) && value >= 0);
    const pipelineTurns = telemetryMessages.filter(
      (message) => typeof message.metadata?.has_context === 'boolean',
    );
    const ragCoverageRate = pipelineTurns.length > 0
      ? Math.round((pipelineTurns.filter((message) => message.metadata?.has_context).length / pipelineTurns.length) * 100)
      : 0;

    type AdminReview = {
      message_id: string;
      verdict: 'correct' | 'incomplete' | 'incorrect';
      notes: string;
      updated_at: string;
    };
    let reviews: AdminReview[] = [];
    try {
      const { data, error } = await supabase.from('admin_response_reviews')
        .select('message_id, verdict, notes, updated_at');
      if (error) throw error;
      reviews = (data || []) as AdminReview[];
    } catch (error) {
      console.warn('[admin/stats] review fetch error:', error);
    }
    const reviewsByMessageId = new Map(reviews.map((review) => [review.message_id, review]));
    sessionMap.forEach((session) => {
      session.messages.forEach((message) => {
        if (!message.id) return;
        const review = reviewsByMessageId.get(message.id);
        if (review) message.review = review;
      });
    });
    const qualityReview = {
      reviewedResponses: reviews.length,
      correct: reviews.filter((review) => review.verdict === 'correct').length,
      incomplete: reviews.filter((review) => review.verdict === 'incomplete').length,
      incorrect: reviews.filter((review) => review.verdict === 'incorrect').length,
    };
    const valuesFor = (stage: keyof NonNullable<ChatTelemetry['latency_ms']>) => telemetryMessages
      .map((message) => Number(message.metadata?.latency_ms?.[stage]))
      .filter((value) => Number.isFinite(value) && value >= 0);
    const embeddingLatencies = valuesFor('embedding');
    const retrievalLatencies = valuesFor('retrieval');
    const generationLatencies = valuesFor('generation');
    const fallbackTurns = pipelineTurns.filter((message) => message.metadata?.fallback_used).length;
    const noContextTurns = pipelineTurns.filter((message) => message.metadata?.has_context === false).length;
    const retrievalFailures = pipelineTurns.filter((message) =>
      ['EMBEDDING_FAILED', 'RETRIEVAL_FAILED', 'NO_RELEVANT_CONTEXT'].includes(message.metadata?.error_code ?? ''),
    ).length;
    const modelFailures = pipelineTurns.filter((message) => message.metadata?.error_code === 'MODEL_FAILED').length;

    const syncHealth = {
      queued: 0,
      running: 0,
      succeeded: 0,
      failed: 0,
      lastError: null as string | null,
    };
    try {
      const { data, error } = await supabase.from('drive_sync_jobs')
        .select('status, last_error, updated_at')
        .order('updated_at', { ascending: false });
      if (error) throw error;
      for (const job of (data || []) as Array<{ status?: string; last_error?: string | null }>) {
        if (job.status === 'queued') syncHealth.queued++;
        else if (job.status === 'running') syncHealth.running++;
        else if (job.status === 'succeeded') syncHealth.succeeded++;
        else if (job.status === 'failed') {
          syncHealth.failed++;
          if (!syncHealth.lastError && job.last_error) syncHealth.lastError = job.last_error.slice(0, 180);
        }
      }
    } catch (error) {
      console.warn('[admin/stats] drive sync health fetch error:', error);
    }

    /* const ragSummaryList = [
      { source: 'Cuidados Críticos em Enfermagem (Patricia Morton & Dorrie Fontaine)', chunkCount: 11883, category: 'Biblioteca / Livro Texto' },
      { source: 'Tratado de Enfermagem Médico-Cirúrgica (Brunner & Suddarth)', chunkCount: 10552, category: 'Biblioteca / Livro Texto' },
      { source: 'Cardiologia na Prática Clínica (SOCERJ)', chunkCount: 3068, category: 'Biblioteca / Livro Texto' },
      { source: 'Nutrition Assessment & Clinical Nutrition (Nancy Munoz & Melissa Bernstein)', chunkCount: 1657, category: 'Livro de Referência' },
      { source: 'Dicionário de Termos Médicos e de Enfermagem (Deocleciano Guimarães)', chunkCount: 836, category: 'Biblioteca / Dicionário' },
      { source: 'Diagnósticos de Enfermagem da NANDA-I (Definições e Classificação)', chunkCount: 757, category: 'Biblioteca / Taxonomia' },
      { source: 'Global Guidelines for Prevention of Surgical Site Infection (WHO / OMS)', chunkCount: 562, category: 'Diretriz Internacional' },
      { source: 'Clínica Cirúrgica e Cuidados Perioperatórios (Medcel)', chunkCount: 528, category: 'Biblioteca / Manual Clínico' },
      { source: 'Segundo Desafio Global para a Segurança do Paciente: Cirurgia Segura (OMS/MS)', chunkCount: 454, category: 'Manual / Ministério da Saúde' },
      { source: 'Enfermagem em Cardiologia (SBIBAE / Hospital Israelita Albert Einstein)', chunkCount: 441, category: 'Biblioteca / Livro Texto' },
      { source: 'Enfermagem em Centro Cirúrgico (Milena de Oliveira Sampaio)', chunkCount: 299, category: 'Biblioteca / Livro Texto' },
      { source: 'Guia de Cuidado em Enfermagem para Feridas e Curativos (COREN)', chunkCount: 283, category: 'Guia Profissional / COREN' },
      { source: 'Diretriz de Nutrição Enteral, Parenteral e Balanço Hídrico (BRASPEN)', chunkCount: 271, category: 'Diretriz Clínica / BRASPEN' },
      { source: 'Diretrizes Brasileiras de Ventilação Mecânica (AMIB)', chunkCount: 246, category: 'Biblioteca / Diretriz AMIB' },
      { source: 'Atenção à Saúde da Pessoa Estomizada (Secretaria de Saúde)', chunkCount: 235, category: 'Manual Clínico' },
      { source: 'ESPEN Guidelines: Clinical Nutrition in Surgery (ESCNM)', chunkCount: 190, category: 'Diretriz Internacional' },
      { source: 'Implementando T.I.M.E.R.S. no Manejo de Feridas (Wound Care)', chunkCount: 177, category: 'Guia Clínico' },
      { source: 'Consenso em Deiscência de Ferida Cirúrgica (Wounds International)', chunkCount: 143, category: 'Consenso Internacional' },
      { source: 'Protocolo de Cuidados à Pessoa com Ferida (SMS Florianópolis)', chunkCount: 123, category: 'Protocolo Municipal' },
      { source: 'Protocolo Assistencial de Anestesia e SRPA (RELAE)', chunkCount: 96, category: 'Artigo / Protocolo' },
      { source: 'Plano de Ensino INT 5224 — O cuidado no processo de viver humano II (UFSC)', chunkCount: 93, category: 'Plano de Ensino / UFSC' }
    ]; */

    return NextResponse.json({
      summary: {
        totalConversations,
        totalMessages,
        uniqueUsers: totalConversations,
        avgResponseTimeMs: latencies.length > 0
          ? average(latencies)
          : 0,
        // Cobertura de contexto recuperado, não uma avaliação humana de precisão.
        ragAccuracyRate: ragCoverageRate,
        // Não inventar piso estatístico: sem tentativas avaliadas, a taxa é 0.
        quizAccuracyRate,
        guardRailHits: guardRailCount,
        totalRagDocs: ragSummaryList.length,
        totalRagChunks: ragDocs.length,
        bibliotecaChunks: ragDocs.filter((doc) => doc.source.toLowerCase().startsWith('biblioteca')).length,
        bibliotecaPercent: ragDocs.length > 0
          ? Number(((ragDocs.filter((doc) => doc.source.toLowerCase().startsWith('biblioteca')).length / ragDocs.length) * 100).toFixed(1))
          : 0,
        avgFeedbackRating: Number(avgRating),
        totalFeedbacks,
        satisfactionRate,
      },
      telemetry: {
        instrumentedResponses: telemetryMessages.length,
        pipelineTurns: pipelineTurns.length,
        latencySamples: latencies.length,
        p50ResponseTimeMs: percentile(latencies, 50),
        p95ResponseTimeMs: percentile(latencies, 95),
        avgEmbeddingTimeMs: average(embeddingLatencies),
        avgRetrievalTimeMs: average(retrievalLatencies),
        avgGenerationTimeMs: average(generationLatencies),
        fallbackTurns,
        noContextTurns,
        retrievalFailures,
        modelFailures,
      },
      qualityReview: {
        ...qualityReview,
        correctRate: qualityReview.reviewedResponses > 0
          ? Math.round((qualityReview.correct / qualityReview.reviewedResponses) * 100)
          : 0,
      },
      syncHealth,
      feedbackStats: {
        avgRating: Number(avgRating),
        totalFeedbacks,
        ratingCounts,
        satisfactionRate,
      },
      modeCounts,
      topicCounts,
      quizStats: {
        correct: quizCorrectCount,
        firstAttemptRetries: quiz1stAttemptWrong,
        secondAttemptResolved: quiz2ndAttemptWrong,
      },
      timeline,
      ragDocuments: ragSummaryList,
      sessions: sessionsList,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Admin Stats API Error]', error);
    return NextResponse.json(
      { error: 'Falha ao processar estatísticas do painel administrativo' },
      { status: 500 }
    );
  }
}
