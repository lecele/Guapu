'use client';

// app/admin/page.tsx — Painel Administrativo & Dashboard Analytics (Inspirado no InterAtiva)
// Tutor de Enfermagem INT 5224 — UFSC

import { useState, useEffect, useMemo } from 'react';
import Image from 'next/image';
import Link from 'next/link';

interface SessionMessage {
  id?: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
  evaluation?: {
    status: 'queued' | 'running' | 'succeeded' | 'failed';
    score?: number | null;
    verdict?: 'correct' | 'incomplete' | 'incorrect' | 'unverifiable' | null;
    grounding_score?: number | null;
    completeness_score?: number | null;
    relevance_score?: number | null;
    rationale?: string | null;
    source_count?: number | null;
    updated_at: string;
  };
  learnerRating?: number;
}

interface SessionData {
  sessionId: string;
  firstAt: string;
  lastAt: string;
  userFirstMsg: string;
  messageCount: number;
  detectedTheme: string;
  mode: 'livre' | 'resumo' | 'quiz' | 'info' | null;
  messages: SessionMessage[];
  avgRating?: number | null;
  ratingCount?: number;
}

interface StatsData {
  summary: {
    totalConversations: number;
    totalMessages: number;
    uniqueUsers: number;
    avgResponseTimeMs: number;
    ragAccuracyRate: number;
    quizAccuracyRate: number;
    guardRailHits: number;
    totalRagDocs: number;
    totalRagChunks: number;
    bibliotecaChunks: number;
    bibliotecaPercent: number;
    avgFeedbackRating?: number;
    totalFeedbacks?: number;
    satisfactionRate?: number;
  };
  telemetry: {
    instrumentedResponses: number;
    pipelineTurns: number;
    latencySamples: number;
    p50ResponseTimeMs: number;
    p95ResponseTimeMs: number;
    avgEmbeddingTimeMs: number;
    avgRetrievalTimeMs: number;
    avgGenerationTimeMs: number;
    fallbackTurns: number;
    noContextTurns: number;
    retrievalFailures: number;
    modelFailures: number;
  };
  qualityEvaluation: {
    total: number;
    queued: number;
    running: number;
    failed: number;
    completed: number;
    correct: number;
    incomplete: number;
    incorrect: number;
    unverifiable: number;
    correctRate: number;
    eligibleTurns: number;
    evaluatedEligibleTurns: number;
    coverageRate: number;
  };
  syncHealth: {
    queued: number;
    running: number;
    succeeded: number;
    failed: number;
    lastError: string | null;
    lastSuccessAt: string | null;
    oldestRunningAt: string | null;
  };
  monitoring?: {
    status: 'healthy' | 'warning' | 'critical' | 'unknown';
    lastCheckAt: string | null;
    alerts: Array<{ component: string; status: 'warning' | 'critical'; detail: Record<string, unknown> }>;
  };
  feedbackStats?: {
    avgRating: number;
    totalFeedbacks: number;
    ratingCounts: Record<number, number>;
    satisfactionRate: number;
  };
  modeCounts: {
    resumo: number;
    quiz: number;
    info: number;
    livre: number;
  };
  topicCounts: Record<string, number>;
  quizStats: {
    correct: number;
    firstAttemptRetries: number;
    secondAttemptResolved: number;
  };
  timeline: Array<{ date: string; count: number }>;
  ragDocuments?: Array<{ source: string; chunkCount: number; category?: string }>;
  sessions: SessionData[];
  timestamp: string;
}

// ── COMPONENTE DE SPARKLINE DINÂMICO INTERATIVO EM SVG ────────────────────────
// Mantidos apenas para a futura aba histórica; o painel principal não usa estimativas visuais.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function DynamicSparkline({
  data = [4, 6, 8, 5, 12, 9, 15],
  color = '#38bdf8',
  id = 'spark1'
}: {
  data?: number[];
  color?: string;
  id?: string;
}) {
  const points = useMemo(() => {
    const dataset = data && data.length >= 2 ? data : [2, 5, 8, 6, 12, 14, 18];
    const min = Math.min(...dataset);
    const max = Math.max(...dataset);
    const range = Math.max(max - min, 1);

    const width = 100;
    const height = 28;
    const paddingTop = 4;
    const paddingBottom = 4;

    return dataset.map((val, idx) => {
      const x = (idx / (dataset.length - 1)) * width;
      const normalized = (val - min) / range;
      const y = height - paddingBottom - normalized * (height - paddingTop - paddingBottom);
      return { x, y, val };
    });
  }, [data]);

  let pathD = `M ${points[0].x},${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const curr = points[i];
    const next = points[i + 1];
    const cp1x = curr.x + (next.x - curr.x) / 2;
    const cp1y = curr.y;
    const cp2x = curr.x + (next.x - curr.x) / 2;
    const cp2y = next.y;
    pathD += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${next.x},${next.y}`;
  }

  const areaD = `${pathD} L 100,28 L 0,28 Z`;

  return (
    <svg className="w-full h-9 overflow-visible" viewBox="0 0 100 30" preserveAspectRatio="none">
      <defs>
        <linearGradient id={`sparkGrad-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.45" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaD} fill={`url(#sparkGrad-${id})`} />
      <path d={pathD} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

// ── COMPONENTE DE GRÁFICO DE LINHA DINÂMICO INTERATIVO COM TOOLTIP NO HOVER ─────
function ActivityChart({
  timeline = [],
  timeRange = '7d',
}: {
  timeline: Array<{ date: string; count: number }>;
  timeRange: '7d' | '30d' | '90d';
}) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const dataset = useMemo(() => {
    const map = new Map<string, number>();
    if (timeline && Array.isArray(timeline)) {
      timeline.forEach((item) => {
        map.set(item.date, item.count);
      });
    }

    const now = new Date();
    const result: Array<{ isoDate: string; dateLabel: string; count: number }> = [];
    const daysCount = timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : 90;

    for (let i = daysCount - 1; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const isoDate = d.toISOString().substring(0, 10);
      const dayStr = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
      const count = map.get(isoDate) ?? 0;
      result.push({ isoDate, dateLabel: dayStr, count });
    }

    return result;
  }, [timeline, timeRange]);

  const maxVal = Math.max(...dataset.map((d) => d.count), 25);
  const ySteps = [
    Math.round(maxVal),
    Math.round(maxVal * 0.8),
    Math.round(maxVal * 0.6),
    Math.round(maxVal * 0.4),
    Math.round(maxVal * 0.2),
    0,
  ];

  const width = 600;
  const height = 180;
  const paddingX = 35;
  const paddingTop = 20;
  const paddingBottom = 30;

  const coords = dataset.map((d, i) => {
    const x = paddingX + (i / Math.max(dataset.length - 1, 1)) * (width - 2 * paddingX);
    const y =
      height -
      paddingBottom -
      (d.count / (maxVal || 1)) * (height - paddingTop - paddingBottom);
    return { x, y, count: d.count, dateLabel: d.dateLabel, isoDate: d.isoDate };
  });

  let pathD = `M ${coords[0].x},${coords[0].y}`;
  for (let i = 0; i < coords.length - 1; i++) {
    const curr = coords[i];
    const next = coords[i + 1];
    const cp1x = curr.x + (next.x - curr.x) / 2;
    const cp1y = curr.y;
    const cp2x = curr.x + (next.x - curr.x) / 2;
    const cp2y = next.y;
    pathD += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${next.x},${next.y}`;
  }

  const areaD = `${pathD} L ${coords[coords.length - 1].x},${height - paddingBottom} L ${coords[0].x},${height - paddingBottom} Z`;

  return (
    <div className="w-full relative flex flex-col select-none">
      <div className="flex w-full h-56 relative pt-2">
        {/* Escala do Eixo Y (Números na Esquerda) */}
        <div className="w-8 shrink-0 flex flex-col justify-between text-[10px] font-mono text-slate-500 pb-7 pr-1 text-right">
          {ySteps.map((val, idx) => (
            <span key={idx}>{val}</span>
          ))}
        </div>

        {/* Container do Gráfico SVG */}
        <div className="flex-1 h-full relative">
          <svg
            className="w-full h-full overflow-visible"
            viewBox={`0 0 ${width} ${height}`}
            preserveAspectRatio="none"
          >
            <defs>
              <linearGradient id="activityGradDynamic" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#1573C2" stopOpacity="0.4" />
                <stop offset="100%" stopColor="#1573C2" stopOpacity="0.02" />
              </linearGradient>
            </defs>

            {/* Linhas de Grade Horizontais */}
            {ySteps.map((_, idx) => {
              const lineY =
                paddingTop + (idx / (ySteps.length - 1)) * (height - paddingTop - paddingBottom);
              return (
                <line
                  key={idx}
                  x1="0"
                  y1={lineY}
                  x2={width}
                  y2={lineY}
                  stroke="rgba(255,255,255,0.06)"
                  strokeDasharray="4 4"
                />
              );
            })}

            {/* Preenchimento de Área com Gradiente */}
            <path d={areaD} fill="url(#activityGradDynamic)" />

            {/* Linha Curva Principal */}
            <path d={pathD} fill="none" stroke="#38bdf8" strokeWidth="3" strokeLinecap="round" />

            {/* Pontos Interativos em TODAS as Datas */}
            {coords.map((pt, idx) => {
              const isHovered = hoveredIdx === idx;
              return (
                <g
                  key={idx}
                  className="cursor-pointer transition-all"
                  onMouseEnter={() => setHoveredIdx(idx)}
                  onMouseLeave={() => setHoveredIdx(null)}
                >
                  {/* Área invisível maior para facilitar o hover */}
                  <circle cx={pt.x} cy={pt.y} r="12" fill="transparent" />

                  {/* Anel de brilho ao passar o mouse */}
                  {isHovered && (
                    <circle cx={pt.x} cy={pt.y} r="8" fill="rgba(56,189,248,0.25)" stroke="#38bdf8" strokeWidth="1.5" />
                  )}

                  {/* Círculo do ponto de dados */}
                  <circle
                    cx={pt.x}
                    cy={pt.y}
                    r={isHovered ? '5' : '3'}
                    fill={isHovered ? '#ffffff' : '#38bdf8'}
                    stroke={isHovered ? '#1573C2' : '#0b203c'}
                    strokeWidth={isHovered ? '2.5' : '1.5'}
                  />
                </g>
              );
            })}
          </svg>

          {/* Card Flutuante de Tooltip no Hover (Igual ao InterAtiva!) */}
          {hoveredIdx !== null && coords[hoveredIdx] && (
            <div
              className="absolute z-30 bg-[#04142b]/95 border border-[#38bdf8]/50 rounded-xl px-3 py-2 shadow-2xl backdrop-blur-md pointer-events-none transition-all transform -translate-x-1/2 -translate-y-full"
              style={{
                left: `${(coords[hoveredIdx].x / width) * 100}%`,
                top: `${(coords[hoveredIdx].y / height) * 100 - 12}px`,
              }}
            >
              <div className="text-[11px] font-bold text-white border-b border-blue-900/60 pb-1 mb-1 font-mono">
                {coords[hoveredIdx].dateLabel}
              </div>
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-cyan-300">
                <span className="w-2.5 h-2.5 bg-[#38bdf8] rounded-xs inline-block" />
                {coords[hoveredIdx].count} {coords[hoveredIdx].count === 1 ? 'interação' : 'interações'}
              </div>
            </div>
          )}

          {/* Eixo X com Rótulos de Datas */}
          <div className="flex justify-between text-[10px] text-slate-400 mt-1 font-mono px-2 select-none">
            {coords
              .filter((_, idx) => {
                const step = timeRange === '7d' ? 1 : timeRange === '30d' ? 4 : 10;
                return idx % step === 0 || idx === coords.length - 1;
              })
              .map((pt, idx) => (
                <span key={idx} className="truncate">
                  {pt.dateLabel}
                </span>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── COMPONENTE DE GRÁFICO DE PICO DE USO POR HORA (24 HORAS INTERATIVO) ───────
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function PeakHourChart({ hourlyData = [] }: { hourlyData: number[] }) {
  const [hoveredHour, setHoveredHour] = useState<number | null>(null);

  const hours = useMemo(() => {
    if (hourlyData && hourlyData.length === 24 && hourlyData.some(v => v > 0)) {
      return hourlyData;
    }
    return new Array(24).fill(0);
  }, [hourlyData]);

  const maxVal = Math.max(...hours, 15);
  const ySteps = [Math.round(maxVal), Math.round(maxVal * 0.66), Math.round(maxVal * 0.33), 0];

  const width = 500;
  const height = 140;
  const paddingTop = 15;
  const paddingBottom = 25;
  const paddingLeft = 30;

  const barWidth = (width - paddingLeft) / 24;

  return (
    <div className="w-full relative flex flex-col select-none">
      <div className="flex w-full h-44 relative pt-1">
        {/* Escala Y (Números na Esquerda) */}
        <div className="w-7 shrink-0 flex flex-col justify-between text-[10px] font-mono text-slate-500 pb-6 text-right pr-1">
          {ySteps.map((val, idx) => (
            <span key={idx}>{val}</span>
          ))}
        </div>

        {/* Canvas do Gráfico de Barras */}
        <div className="flex-1 h-full relative">
          <svg className="w-full h-full overflow-visible" viewBox={`0 0 ${width - paddingLeft} ${height}`} preserveAspectRatio="none">
            {/* Grid horizontal */}
            {ySteps.map((_, idx) => {
              const lineY = paddingTop + (idx / (ySteps.length - 1)) * (height - paddingTop - paddingBottom);
              return (
                <line key={idx} x1="0" y1={lineY} x2={width - paddingLeft} y2={lineY} stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
              );
            })}

            {/* 24 Barras Horárias */}
            {hours.map((val, h) => {
              const barH = (val / maxVal) * (height - paddingTop - paddingBottom);
              const x = h * barWidth + barWidth * 0.15;
              const w = barWidth * 0.7;
              const y = height - paddingBottom - barH;
              const isHovered = hoveredHour === h;

              return (
                <g
                  key={h}
                  className="cursor-pointer transition-all"
                  onMouseEnter={() => setHoveredHour(h)}
                  onMouseLeave={() => setHoveredHour(null)}
                >
                  {/* Hit box invisível */}
                  <rect x={x} y={paddingTop} width={w} height={height - paddingTop - paddingBottom} fill="transparent" />

                  {/* Rect Bar */}
                  <rect
                    x={x}
                    y={Math.min(y, height - paddingBottom - 3)}
                    width={w}
                    height={Math.max(barH, 3)}
                    rx="3"
                    fill={isHovered ? 'url(#barGradHover)' : val > 0 ? '#1573C2' : 'rgba(255,255,255,0.06)'}
                    stroke={isHovered ? '#38bdf8' : 'none'}
                    strokeWidth={isHovered ? '1.5' : '0'}
                    className="transition-all duration-200"
                  />
                </g>
              );
            })}

            <defs>
              <linearGradient id="barGradHover" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#38bdf8" />
                <stop offset="100%" stopColor="#1573C2" />
              </linearGradient>
            </defs>
          </svg>

          {/* Floating Tooltip no Hover do Horário */}
          {hoveredHour !== null && (
            <div
              className="absolute z-30 bg-[#04142b]/95 border border-[#38bdf8]/50 rounded-xl px-3 py-2 shadow-2xl backdrop-blur-md pointer-events-none transition-all transform -translate-x-1/2 -translate-y-full"
              style={{
                left: `${((hoveredHour * barWidth + barWidth / 2) / (width - paddingLeft)) * 100}%`,
                top: `${height - paddingBottom - (hours[hoveredHour] / maxVal) * (height - paddingTop - paddingBottom) - 10}px`,
              }}
            >
              <div className="text-[11px] font-bold text-white border-b border-blue-900/60 pb-1 mb-1 font-mono">
                {String(hoveredHour).padStart(2, '0')}h
              </div>
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-cyan-300">
                <span className="w-2.5 h-2.5 bg-[#38bdf8] rounded-xs inline-block" />
                {hours[hoveredHour]} {hours[hoveredHour] === 1 ? 'msg' : 'msgs'}
              </div>
            </div>
          )}

          {/* Rótulos do Eixo X (0h, 6h, 12h, 18h) */}
          <div className="flex justify-between text-[10px] text-slate-500 font-mono mt-1 px-1">
            <span>0h</span>
            <span>6h</span>
            <span>12h</span>
            <span>18h</span>
            <span>23h</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── COMPONENTE DE GRÁFICO DE DONUT INTERATIVO (ROSCA DE CATEGORIAS EM SVG) ───────
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function DonutChart({
  resumo = 4,
  quiz = 3,
  info = 1,
  livre = 2,
}: {
  resumo: number;
  quiz: number;
  info: number;
  livre: number;
}) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const categories = useMemo(
    () => [
      { title: 'Resumo de Conteúdo', count: resumo, color: '#1573C2' },
      { title: 'Quiz da Disciplina', count: quiz, color: '#34d399' },
      { title: 'Informações da Disciplina', count: info, color: '#fbbf24' },
      { title: 'Perguntas Livres', count: livre, color: '#c084fc' },
    ],
    [resumo, quiz, info, livre]
  );

  const total = Math.max(categories.reduce((acc, cat) => acc + cat.count, 0), 1);
  const r = 40;
  const c = 2 * Math.PI * r;

  let currentOffset = 0;
  const segments = categories.map((cat, idx) => {
    const strokeDash = (cat.count / total) * c;
    const strokeOffset = currentOffset;
    currentOffset -= strokeDash;

    return {
      ...cat,
      strokeDash,
      strokeOffset,
      index: idx,
    };
  });

  return (
    <div className="flex flex-col items-center gap-3 select-none">
      <div className="relative w-44 h-44 flex items-center justify-center">
        <svg className="w-full h-full transform -rotate-90 overflow-visible" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r={r} fill="none" stroke="#071b36" strokeWidth="12" />

          {segments.map((seg) => {
            const isHovered = hoveredIndex === seg.index;
            return (
              <circle
                key={seg.index}
                cx="50"
                cy="50"
                r={r}
                fill="none"
                stroke={seg.color}
                strokeWidth={isHovered ? 16 : 12}
                strokeDasharray={`${seg.strokeDash} ${c - seg.strokeDash}`}
                strokeDashoffset={seg.strokeOffset}
                className="transition-all duration-300 cursor-pointer"
                onMouseEnter={() => setHoveredIndex(seg.index)}
                onMouseLeave={() => setHoveredIndex(null)}
              />
            );
          })}
        </svg>

        {/* Centro do Donut */}
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center select-none pointer-events-none">
          <span className="text-2xl font-black text-white tracking-tight">{total}</span>
          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Consultas</span>
        </div>

        {/* Floating Tooltip no Hover das Categorias */}
        {hoveredIndex !== null && segments[hoveredIndex] && (
          <div className="absolute z-30 bg-[#04142b]/95 border border-[#38bdf8]/50 rounded-xl px-3 py-2 shadow-2xl backdrop-blur-md pointer-events-none transition-all transform -translate-x-1/2 -translate-y-1/2 left-1/2 top-1/2">
            <div className="text-[11px] font-bold text-white border-b border-blue-900/60 pb-1 mb-1 font-mono">
              {segments[hoveredIndex].title}
            </div>
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-cyan-300">
              <span className="w-2.5 h-2.5 rounded-xs inline-block" style={{ backgroundColor: segments[hoveredIndex].color }} />
              {segments[hoveredIndex].count} {segments[hoveredIndex].count === 1 ? 'consulta' : 'consultas'}
            </div>
          </div>
        )}
      </div>

      {/* Legenda Colorida Interativa */}
      <div className="w-full space-y-2 text-xs">
        {categories.map((cat, idx) => {
          const isHovered = hoveredIndex === idx;
          return (
            <div
              key={idx}
              className={`flex items-center justify-between p-1.5 rounded-lg transition-all cursor-pointer ${
                isHovered ? 'bg-blue-950/80 border border-blue-800' : 'hover:bg-blue-950/40'
              }`}
              onMouseEnter={() => setHoveredIndex(idx)}
              onMouseLeave={() => setHoveredIndex(null)}
            >
              <span className="flex items-center gap-2 text-slate-300 font-medium">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
                {cat.title}
              </span>
              <span className="font-bold text-white">{cat.count}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── COMPONENTE DE GAUGE RING (ANEL DE PRECISÃO EM SVG) ────────────────────────
function GaugeRing({ percent = 96 }: { percent?: number }) {
  const r = 44;
  const c = 2 * Math.PI * r;
  const pct = Math.min(100, Math.max(0, percent));
  const offset = c - (pct / 100) * c;

  return (
    <div className="relative w-36 h-36 flex items-center justify-center">
      <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="9" />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke="url(#gaugeGradient)"
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          className="transition-all duration-1000 ease-out"
        />
        <defs>
          <linearGradient id="gaugeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#1573C2" />
            <stop offset="100%" stopColor="#38bdf8" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-2xl font-extrabold text-white">{pct}%</span>
        <span className="text-[9px] font-bold text-emerald-400 uppercase tracking-wider">Aderência</span>
      </div>
    </div>
  );
}
// ── COMPONENTE QUADRO DE AVALIAÇÕES DE SATISFAÇÃO (LIKERT 1-5 ESTRELAS) ────────
function FeedbackDashboardWidget({
  avgRating = 0,
  totalFeedbacks = 0,
  satisfactionRate = 0,
  ratingCounts = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 }
}: {
  avgRating?: number;
  totalFeedbacks?: number;
  satisfactionRate?: number;
  ratingCounts?: Record<number, number>;
}) {
  const total = totalFeedbacks || 0;

  return (
    <div className="bg-[#0b203c] border border-blue-900/40 p-5 rounded-2xl shadow-lg flex flex-col justify-between group hover:border-amber-500/40 transition-all">
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-sm font-bold text-white flex items-center gap-1.5">
              <span className="material-symbols-outlined text-amber-400 text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                star
              </span>
              Avaliação de Satisfação
            </h2>
            <p className="text-[11px] text-slate-400">Feedback Likert dos estudantes</p>
          </div>
          <span className="text-[11px] font-bold text-amber-400 bg-amber-950/60 border border-amber-500/30 px-2 py-0.5 rounded-full">
            {totalFeedbacks === 0 ? 'Sem avaliações' : `${satisfactionRate}% Aprovação`}
          </span>
        </div>

        {/* Resumo da Nota Média */}
        <div className="flex items-center gap-3 bg-[#040e1f] p-3 rounded-xl border border-blue-900/40 mb-1">
          <div className="flex flex-col items-center justify-center shrink-0">
            <span className="text-2xl font-black text-amber-400 tracking-tight">
              {totalFeedbacks === 0 ? '0.0' : avgRating.toFixed(1)}
            </span>
            <div className="flex text-amber-400 text-[12px]">
              {[1, 2, 3, 4, 5].map((star) => (
                <span
                  key={star}
                  className="material-symbols-outlined"
                  style={{ fontVariationSettings: totalFeedbacks > 0 && star <= Math.round(avgRating) ? "'FILL' 1" : "'FILL' 0" }}
                >
                  star
                </span>
              ))}
            </div>
            <span className="text-[9px] text-slate-400 mt-0.5">{totalFeedbacks} {totalFeedbacks === 1 ? 'avaliação' : 'avaliações'}</span>
          </div>

          {/* Barras por Estrela */}
          <div className="flex-1 space-y-1 border-l border-blue-900/50 pl-3">
            {[5, 4, 3, 2, 1].map((star) => {
              const count = (ratingCounts as Record<number, number>)[star] || 0;
              const pct = total > 0 ? Math.round((count / total) * 100) : 0;
              return (
                <div key={star} className="flex items-center gap-1.5 text-[10px]">
                  <span className="w-4 font-bold text-slate-300 text-right">{star}★</span>
                  <div className="flex-1 h-1.5 rounded-full bg-blue-950 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        star >= 4 ? 'bg-amber-400' : star === 3 ? 'bg-blue-400' : 'bg-slate-500'
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="w-7 text-[9px] font-semibold text-slate-400 text-right">{pct}%</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── PÁGINA PRINCIPAL DO PAINEL ADMIN ──────────────────────────────────────────
export default function AdminDashboardPage() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'conversas' | 'sistema'>('dashboard');
  const [stats, setStats] = useState<StatsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d'>('7d');

  // Filtros da aba de conversas
  const [searchTerm, setSearchTerm] = useState('');
  const [modeFilter, setModeFilter] = useState<string>('all');

  // Modal de Dossiê da Conversa
  const [selectedSession, setSelectedSession] = useState<SessionData | null>(null);

  // Busca dados de métricas do backend
  const fetchStats = async () => {
    setIsRefreshing(true);
    try {
      const res = await fetch('/api/admin/stats');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setStats(data);
      setError(null);
    } catch (err) {
      console.error('[admin] fetch stats error:', err);
      setError('Não foi possível carregar as métricas em tempo real.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };


  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void fetchStats();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, []);

  // Conversas filtradas (Ordenadas por mais recentes primeiro)
  const filteredSessions = useMemo(() => {
    if (!stats?.sessions) return [];
    return stats.sessions
      .filter((s) => {
        const matchSearch =
          s.sessionId.toLowerCase().includes(searchTerm.toLowerCase()) ||
          s.userFirstMsg.toLowerCase().includes(searchTerm.toLowerCase()) ||
          s.detectedTheme.toLowerCase().includes(searchTerm.toLowerCase());

        if (modeFilter === 'all') return matchSearch;
        return matchSearch && s.mode === modeFilter;
      })
      .sort((a, b) => new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime());
  }, [stats, searchTerm, modeFilter]);

  const qualityTotal = Math.max(stats?.qualityEvaluation.completed ?? 0, 1);
  const qualitySegments = [
    { label: 'Conformes às evidências', value: stats?.qualityEvaluation.correct ?? 0, color: '#34d399', track: 'bg-emerald-400', text: 'text-emerald-300' },
    { label: 'Sem evidência suficiente', value: stats?.qualityEvaluation.unverifiable ?? 0, color: '#fbbf24', track: 'bg-amber-400', text: 'text-amber-300' },
    { label: 'Incompletas', value: stats?.qualityEvaluation.incomplete ?? 0, color: '#fb923c', track: 'bg-orange-400', text: 'text-orange-300' },
    { label: 'Incorretas', value: stats?.qualityEvaluation.incorrect ?? 0, color: '#fb7185', track: 'bg-rose-400', text: 'text-rose-300' },
  ];
  const qualityRate = stats?.qualityEvaluation.correctRate ?? 0;
  const technicalFailures = (stats?.telemetry.retrievalFailures ?? 0) + (stats?.telemetry.modelFailures ?? 0);

  const [isExporting, setIsExporting] = useState(false);

  // Exportar dados em Planilha Excel Profissional (.XLSX Estilizado)
  const exportExcel = async () => {
    if (!stats?.sessions) return;
    setIsExporting(true);
    try {
      const ExcelJS = (await import('exceljs')).default;
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'Guapu INT 5224';
      workbook.created = new Date();

      // ── ABA 1: INDICADORES & MÉTRICAS EXECUTIVAS ───────────────────────────
      const summarySheet = workbook.addWorksheet('📊 Indicadores & Métricas', {
        views: [{ showGridLines: true }]
      });

      // Banner Principal
      summarySheet.mergeCells('A1:D1');
      const sumTitle = summarySheet.getCell('A1');
      sumTitle.value = 'TUTOR DE ENFERMAGEM INT 5224 — PAINEL EXECUTIVO DE INDICADORES';
      sumTitle.font = { name: 'Calibri', size: 13, bold: true, color: { argb: 'FFFFFFFF' } };
      sumTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF020B18' } };
      sumTitle.alignment = { horizontal: 'center', vertical: 'middle' };
      summarySheet.getRow(1).height = 34;

      summarySheet.mergeCells('A2:D2');
      const sumSub = summarySheet.getCell('A2');
      sumSub.value = `Relatório gerado em ${new Date().toLocaleString('pt-BR')}  |  Disciplina INT 5224 (UFSC)`;
      sumSub.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF38BDF8' } };
      sumSub.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B203C' } };
      sumSub.alignment = { horizontal: 'center', vertical: 'middle' };
      summarySheet.getRow(2).height = 20;

      // Seção de KPIs Globais
      summarySheet.getCell('A4').value = '1. INDICADORES CONFIÁVEIS DE QUALIDADE E OPERAÇÃO';
      summarySheet.getCell('A4').font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF1573C2' } };

      const kpiData = [
        ['Indicador / Métrica', 'Valor', 'Unidade / Referência'],
        ['Total de Sessões / Conversas', stats.summary.totalConversations, 'Sessões registradas'],
        ['Total de Mensagens Trocadas', stats.summary.totalMessages, 'Interações no chat'],
        ['Tempo RAG P50 / P95', `${(stats.telemetry.p50ResponseTimeMs / 1000).toFixed(2)}s / ${(stats.telemetry.p95ResponseTimeMs / 1000).toFixed(2)}s`, `${stats.telemetry.latencySamples} respostas instrumentadas`],
        ['Contexto RAG recuperado', `${stats.summary.ragAccuracyRate}%`, `${stats.telemetry.pipelineTurns} consultas; não é uma medida de precisão`],
        ['Falhas técnicas', (stats.telemetry.retrievalFailures + stats.telemetry.modelFailures), `Busca: ${stats.telemetry.retrievalFailures}; modelo: ${stats.telemetry.modelFailures}`],
        ['Respostas sem contexto', stats.telemetry.noContextTurns, 'Pode representar questão fora da base; investigar no dossiê'],
        ['Avaliação automática — conformes', `${stats.qualityEvaluation.correct}/${stats.qualityEvaluation.completed}`, `${stats.qualityEvaluation.correctRate}% das respostas avaliadas`],
        ['Avaliação automática — sem evidência suficiente', stats.qualityEvaluation.unverifiable, 'Não classificada como erro'],
        ['Cobertura da avaliação automática', `${stats.qualityEvaluation.evaluatedEligibleTurns}/${stats.qualityEvaluation.eligibleTurns}`, `${stats.qualityEvaluation.coverageRate}% das respostas RAG elegíveis`],
        ['Média de Avaliação dos Estudantes', `${(stats.summary.avgFeedbackRating || 0) === 0 ? '0.0' : stats.summary.avgFeedbackRating} / 5.0 ⭐`, `${stats.summary.totalFeedbacks || 0} avaliações coletadas`],
        ['Taxa de Aprovação dos Estudantes', `${stats.summary.satisfactionRate || 0}%`, 'Avaliações 4★ e 5★'],
        ['Fontes RAG indexadas', stats.summary.totalRagDocs, 'Inventário atual da base vetorial'],
        ['Trechos RAG vetorizados', stats.summary.totalRagChunks.toLocaleString('pt-BR'), 'Inventário atual da base vetorial'],
        ['Sincronização Google Drive', `${stats.syncHealth.running} processando · ${stats.syncHealth.failed} falhas`, stats.syncHealth.lastSuccessAt ? `Última concluída: ${new Date(stats.syncHealth.lastSuccessAt).toLocaleString('pt-BR')}` : 'Sem conclusão registrada']
      ];

      kpiData.forEach((rowVals, idx) => {
        const row = summarySheet.getRow(5 + idx);
        row.values = rowVals;
        row.height = 20;
        const isHead = idx === 0;
        row.eachCell((cell, col) => {
          cell.font = { name: 'Calibri', size: 10, bold: isHead, color: { argb: isHead ? 'FFFFFFFF' : 'FF1E293B' } };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isHead ? 'FF1573C2' : (idx % 2 === 0 ? 'FFF4F8FC' : 'FFFFFFFF') } };
          cell.alignment = { horizontal: col === 1 ? 'left' : 'center', vertical: 'middle' };
          cell.border = { top: { style: 'thin', color: { argb: 'FFE2E8F0' } }, left: { style: 'thin', color: { argb: 'FFE2E8F0' } }, bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } }, right: { style: 'thin', color: { argb: 'FFE2E8F0' } } };
        });
      });

      summarySheet.getColumn(1).width = 42;
      summarySheet.getColumn(2).width = 24;
      summarySheet.getColumn(3).width = 38;
      summarySheet.getColumn(4).width = 15;

      // ── ABA 2: REGISTRO DETALHADO DE CONVERSAS ─────────────────────────────
      const worksheet = workbook.addWorksheet('💬 Registro de Conversas', {
        views: [{ showGridLines: true }]
      });

      // 1. Cabeçalho / Banner Principal do Relatório
      worksheet.mergeCells('A1:H1');
      const titleCell = worksheet.getCell('A1');
      titleCell.value = 'TUTOR DE ENFERMAGEM INT 5224 — REGISTRO COMPLETO DE CONVERSAS';
      titleCell.font = { name: 'Calibri', size: 13, bold: true, color: { argb: 'FFFFFFFF' } };
      titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF020B18' } };
      titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
      worksheet.getRow(1).height = 36;

      // 2. Subtítulo com métricas da exportação
      worksheet.mergeCells('A2:H2');
      const subTitleCell = worksheet.getCell('A2');
      subTitleCell.value = `Exportado em ${new Date().toLocaleString('pt-BR')}  |  Sessões: ${stats.summary.totalConversations}  |  Mensagens: ${stats.summary.totalMessages}  |  Contexto RAG recuperado: ${stats.summary.ragAccuracyRate}%`;
      subTitleCell.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF38BDF8' } };
      subTitleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B203C' } };
      subTitleCell.alignment = { horizontal: 'center', vertical: 'middle' };
      worksheet.getRow(2).height = 22;

      // Linha 3 vazia
      worksheet.getRow(3).height = 8;

      // 3. Cabeçalho da Tabela
      const headers = ['#', 'ID da Sessão', 'Data / Hora Início', 'Última Atividade', 'Interações', 'Tema Principal', 'Média Avaliação ⭐', 'Primeira Mensagem do Estudante'];
      const headerRow = worksheet.getRow(4);
      headerRow.values = headers;
      headerRow.height = 26;

      headerRow.eachCell((cell) => {
        cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1573C2' } };
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        cell.border = {
          top: { style: 'medium', color: { argb: 'FF020B18' } },
          left: { style: 'thin', color: { argb: 'FF104E85' } },
          bottom: { style: 'medium', color: { argb: 'FF020B18' } },
          right: { style: 'thin', color: { argb: 'FF104E85' } },
        };
      });

      // 4. Preenchimento dos Dados com Linhas Zebradas e Bordas
      const sortedSessions = [...stats.sessions].sort((a, b) => new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime());

      sortedSessions.forEach((s, index) => {
        const rowIndex = 5 + index;
        const row = worksheet.getRow(rowIndex);
        const isEven = index % 2 === 0;

        row.values = [
          `#${String(index + 1).padStart(2, '0')}`,
          s.sessionId,
          new Date(s.firstAt).toLocaleString('pt-BR'),
          new Date(s.lastAt).toLocaleString('pt-BR'),
          s.messageCount,
          s.detectedTheme,
          s.avgRating ? `${s.avgRating.toFixed(1)} ⭐` : '—',
          s.userFirstMsg || 'Menu Inicial'
        ];
        row.height = 22;

        row.eachCell((cell, colNumber) => {
          cell.font = { name: 'Calibri', size: 10, color: { argb: 'FF1E293B' } };
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: isEven ? 'FFF4F8FC' : 'FFFFFFFF' }
          };

          // Alinhamento
          if (colNumber === 1 || colNumber === 5) {
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
          } else if (colNumber === 2) {
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
            cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF1573C2' } };
          } else if (colNumber === 7) {
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
            cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: s.avgRating ? 'FFD97706' : 'FF64748B' } };
          } else if (colNumber === 3 || colNumber === 4 || colNumber === 6) {
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
          } else {
            cell.alignment = { horizontal: 'left', vertical: 'middle' };
          }

          cell.border = {
            top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          };
        });
      });

      // 5. Largura Personalizada das Colunas
      worksheet.getColumn(1).width = 8;   // #
      worksheet.getColumn(2).width = 24;  // ID Sessão
      worksheet.getColumn(3).width = 22;  // Data Início
      worksheet.getColumn(4).width = 22;  // Última Atividade
      worksheet.getColumn(5).width = 14;  // Interações
      worksheet.getColumn(6).width = 24;  // Tema
      worksheet.getColumn(7).width = 18;  // Média Avaliação
      worksheet.getColumn(8).width = 55;  // Primeira Mensagem

      // 6. Gerar Buffer e Fazer Download do arquivo .xlsx
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `tutor_enfermagem_metricas_${new Date().toISOString().substring(0, 10)}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error('Erro ao exportar Excel:', err);
    } finally {
      setIsExporting(false);
    }
  };

  // Imprimir / Salvar Dossiê em PDF
  const downloadSessionDossier = (session: SessionData) => {
    let content = `============================================================\n`;
    content += `DOSSIÊ DE ATENDIMENTO — TUTOR INT 5224 (ENFERMAGEM UFSC)\n`;
    content += `============================================================\n`;
    content += `ID Sessão: ${session.sessionId}\n`;
    content += `Data Início: ${new Date(session.firstAt).toLocaleString('pt-BR')}\n`;
    content += `Última Atividade: ${new Date(session.lastAt).toLocaleString('pt-BR')}\n`;
    content += `Tema Detectado: ${session.detectedTheme}\n`;
    content += `Total Interações: ${session.messageCount}\n`;
    content += `============================================================\n\n`;

    session.messages.forEach((m, i) => {
      content += `[#${i + 1}] ${m.role === 'user' ? 'ESTUDANTE' : 'TUTOR DE ENFERMAGEM'} (${new Date(m.created_at || Date.now()).toLocaleTimeString('pt-BR')}):\n`;
      content += `${m.content}\n`;
      content += `------------------------------------------------------------\n\n`;
    });

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `dossie_sessao_${session.sessionId.substring(0, 8)}.txt`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex h-screen w-full bg-[#040e1f] text-slate-100 font-sans overflow-hidden">
      {/* ── SIDEBAR ───────────────────────────────────────────────────────────── */}
      <aside className="w-72 shrink-0 bg-[#020b18] border-r border-blue-900/40 flex flex-col p-4 gap-6 select-none z-20">
        {/* Logo Branding (Significativamente Ampliada) */}
        <div className="flex items-center gap-4 pb-4 border-b border-blue-900/40 pt-1">
          <div className="w-20 h-20 shrink-0 flex items-center justify-center">
            <Image src="/guapu-icon-192.png" alt="Guapu" width={192} height={192} className="w-full h-full object-contain tutor-logo-premium drop-shadow-2xl scale-105" />
          </div>
          <div className="flex flex-col">
            <strong className="text-lg font-black text-white tracking-wide leading-tight">Guapu Analytics</strong>
          </div>
        </div>

        {/* Menu Principal */}
        <nav className="flex flex-col gap-1.5 flex-1">
          <span className="text-[10px] font-bold tracking-widest text-slate-500 uppercase px-3 mb-1">Principal</span>

          <button
            onClick={() => setActiveTab('dashboard')}
            className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
              activeTab === 'dashboard'
                ? 'bg-[#1573C2] text-white shadow-[0_0_20px_rgba(21,115,194,0.45)]'
                : 'text-slate-400 hover:text-white hover:bg-blue-950/40'
            }`}
          >
            <span className="material-symbols-outlined text-[18px]">dashboard</span>
            Dashboard
          </button>

          <button
            onClick={() => setActiveTab('conversas')}
            className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all justify-between ${
              activeTab === 'conversas'
                ? 'bg-[#1573C2] text-white shadow-[0_0_20px_rgba(21,115,194,0.45)]'
                : 'text-slate-400 hover:text-white hover:bg-blue-950/40'
            }`}
          >
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-[18px]">forum</span>
              Conversas
            </div>
            {stats && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">
                {stats.summary.totalConversations}
              </span>
            )}
          </button>

          <span className="text-[10px] font-bold tracking-widest text-slate-500 uppercase px-3 mt-4 mb-1">Sistema</span>

          <button
            onClick={() => setActiveTab('sistema')}
            className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
              activeTab === 'sistema'
                ? 'bg-[#1573C2] text-white shadow-[0_0_20px_rgba(21,115,194,0.45)]'
                : 'text-slate-400 hover:text-white hover:bg-blue-950/40'
            }`}
          >
            <span className="material-symbols-outlined text-[18px]">dns</span>
            Status & Telemetria
          </button>
        </nav>

        {/* Rodapé da Sidebar */}
        <div className="pt-3 border-t border-blue-900/40 flex flex-col gap-2">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-950/30 border border-emerald-500/30 text-emerald-400 text-[11px] font-medium">
            <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
            Sistema operacional
          </div>
          <Link
            href="/"
            className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-xs font-semibold bg-white/10 hover:bg-white/20 text-white transition-all active:scale-95"
          >
            <span className="material-symbols-outlined text-[16px]">arrow_back</span>
            Voltar ao Guapu
          </Link>
        </div>
      </aside>

      {/* ── MAIN CONTENT AREA ─────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-[#040e1f]">
        {/* Top Header */}
        <header className="h-16 shrink-0 border-b border-blue-900/40 bg-[#020b18]/90 backdrop-blur-md px-6 flex items-center justify-between z-10">
          <div>
            <h1 className="text-base font-bold text-white tracking-wide">Painel Guapu</h1>
            <p className="text-[11px] text-slate-400">Visão geral · Atualizado agora</p>
          </div>

          <div className="flex items-center gap-3">
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center gap-1.5 shadow-[0_0_12px_rgba(52,211,153,0.2)]">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              Ao vivo
            </span>

            <button
              onClick={fetchStats}
              disabled={isRefreshing}
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold bg-blue-950/60 hover:bg-blue-900/60 border border-blue-700/40 text-blue-200 transition-all cursor-pointer disabled:opacity-50"
            >
              <span className={`material-symbols-outlined text-[16px] ${isRefreshing ? 'animate-spin' : ''}`}>
                refresh
              </span>
              Atualizar
            </button>

            <button
              onClick={exportExcel}
              disabled={isExporting}
              className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-[#1573C2] hover:bg-[#0d4a87] text-white shadow-lg transition-all cursor-pointer active:scale-95 disabled:opacity-50"
            >
              <span className={`material-symbols-outlined text-[16px] ${isExporting ? 'animate-spin' : ''}`}>
                {isExporting ? 'sync' : 'download'}
              </span>
              {isExporting ? 'Gerando Excel...' : 'Exportar Excel'}
            </button>
          </div>
        </header>

        {/* Scrollable Body */}
        <main className="flex-1 overflow-y-auto p-6 scroll-smooth">
          {error && (
            <div className="mb-6 p-4 rounded-xl bg-red-950/30 border border-red-800/50 text-red-300 text-xs flex items-center justify-between">
              <span>{error}</span>
              <button onClick={fetchStats} className="font-bold underline cursor-pointer">Tentar Novamente</button>
            </div>
          )}

          {/* ── TAB 1: MONITORAMENTO OPERACIONAL ───────────────────────────── */}
          {activeTab === 'dashboard' && (
            <div className="flex flex-col gap-6">
              <section className={`flex flex-col gap-2 rounded-2xl border p-4 sm:flex-row sm:items-center sm:justify-between ${
                stats?.monitoring?.status === 'critical'
                  ? 'border-red-500/40 bg-red-950/30'
                  : stats?.monitoring?.status === 'warning'
                    ? 'border-amber-500/40 bg-amber-950/20'
                    : 'border-emerald-500/30 bg-emerald-950/15'
              }`}>
                <div className="flex items-center gap-3">
                  <span className={`material-symbols-outlined ${stats?.monitoring?.status === 'critical' ? 'text-red-300' : stats?.monitoring?.status === 'warning' ? 'text-amber-300' : 'text-emerald-300'}`}>
                    {stats?.monitoring?.status === 'critical' ? 'error' : stats?.monitoring?.status === 'warning' ? 'warning' : 'monitor_heart'}
                  </span>
                  <div>
                    <p className="text-xs font-bold text-white">Monitoramento automático</p>
                    <p className="text-[11px] text-slate-400">
                      {stats?.monitoring?.status === 'unknown'
                        ? 'Aguardando a primeira verificação diária.'
                        : stats?.monitoring?.alerts?.length
                          ? `${stats.monitoring.alerts.length} alerta(s) técnico(s) requerem atenção.`
                          : 'Supabase, sincronização do Drive e worker de qualidade sem alertas.'}
                    </p>
                  </div>
                </div>
                <span className="text-[10px] text-slate-500">{stats?.monitoring?.lastCheckAt ? `Última verificação: ${new Date(stats.monitoring.lastCheckAt).toLocaleString('pt-BR')}` : 'Sem e-mails automáticos'}</span>
              </section>
              <section className="rounded-2xl border border-cyan-900/50 bg-[#071a31] p-5 shadow-lg">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-base font-bold text-white">Qualidade das respostas</h2>
                    <p className="text-xs text-slate-400">Avaliação automática assíncrona, comparando resposta, trechos recuperados e referências do RAG.</p>
                  </div>
                  <span className="w-fit rounded-full border border-cyan-700/50 bg-cyan-950/60 px-3 py-1 text-[11px] font-bold text-cyan-200">
                    {stats?.qualityEvaluation.evaluatedEligibleTurns ?? 0}/{stats?.qualityEvaluation.eligibleTurns ?? 0} respostas elegíveis avaliadas
                  </span>
                </div>

                <div className="mt-5 grid gap-5 lg:grid-cols-[230px_minmax(0,1fr)]">
                  <div className="rounded-2xl border border-emerald-500/20 bg-[#040e1f] p-5">
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Aderência às evidências</p>
                    <div className="mt-4 flex items-end gap-2">
                      <p className="text-5xl font-black tracking-tight text-white">{isLoading ? '…' : `${qualityRate}%`}</p>
                      <span className="mb-1 rounded-full bg-emerald-500/10 px-2 py-1 text-[10px] font-bold text-emerald-300">conforme</span>
                    </div>
                    <div className="mt-5 h-2 overflow-hidden rounded-full bg-slate-800">
                      <div className="h-full rounded-full bg-emerald-400 transition-all duration-700" style={{ width: `${qualityRate}%` }} />
                    </div>
                    <p className="mt-3 text-[11px] leading-relaxed text-slate-400">{stats?.qualityEvaluation.correct ?? 0} de {stats?.qualityEvaluation.completed ?? 0} respostas avaliadas aderem aos trechos recuperados.</p>
                  </div>

                  <div className="rounded-2xl border border-blue-900/40 bg-[#040e1f] p-5">
                    <div className="mb-4 flex items-center justify-between">
                      <p className="text-xs font-semibold text-slate-200">Distribuição das avaliações</p>
                      <span className="text-[11px] text-slate-500">base: {stats?.qualityEvaluation.completed ?? 0} respostas</span>
                    </div>
                    <div className="space-y-4">
                      {qualitySegments.map((segment) => {
                        const percent = Math.round((segment.value / qualityTotal) * 100);
                        return (
                          <div key={segment.label}>
                            <div className="mb-1.5 flex items-center justify-between gap-4">
                              <span className="text-[12px] text-slate-300">{segment.label}</span>
                              <span className={`text-sm font-black tabular-nums ${segment.text}`}>{isLoading ? '…' : segment.value}<small className="ml-1 text-[10px] font-semibold text-slate-500">{percent}%</small></span>
                            </div>
                            <div className="h-1.5 overflow-hidden rounded-full bg-slate-800">
                              <div className={`h-full rounded-full ${segment.track} transition-all duration-700`} style={{ width: `${percent}%` }} />
                            </div>
                          </div>
                        );
                      })}
                      <div className="flex items-center justify-between border-t border-blue-900/40 pt-3 text-[11px]">
                        <span className="text-slate-400">Em avaliação</span>
                        <span className="font-bold text-slate-200">{(stats?.qualityEvaluation.queued ?? 0) + (stats?.qualityEvaluation.running ?? 0)}</span>
                      </div>
                    </div>
                  </div>
                </div>
                <p className="mt-3 text-[11px] text-slate-500">“Conforme” indica aderência às evidências recuperadas; não substitui validação clínica ou acadêmica formal.</p>
              </section>

              <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div className="relative flex min-h-44 flex-col justify-between overflow-hidden rounded-2xl border border-violet-500/25 bg-gradient-to-br from-[#10264a] to-[#0b203c] p-5 shadow-lg transition hover:border-violet-400/60">
                  <div className="flex items-center justify-between"><span className="flex h-10 w-10 items-center justify-center rounded-xl border border-violet-400/30 bg-violet-500/10 text-violet-200"><span className="material-symbols-outlined text-[22px]">timer</span></span><span className="rounded-full border border-violet-400/20 bg-violet-500/10 px-2 py-1 text-[10px] font-bold text-violet-200">P50</span></div>
                  <div><p className="text-3xl font-black tracking-tight text-white">{isLoading ? '…' : `${((stats?.telemetry.p50ResponseTimeMs ?? 0) / 1000).toFixed(1)}s`}</p><p className="text-xs font-semibold text-slate-300">Tempo de resposta RAG</p><p className="mt-1 text-[11px] text-slate-400">P95: {((stats?.telemetry.p95ResponseTimeMs ?? 0) / 1000).toFixed(1)}s · {stats?.telemetry.latencySamples ?? 0} amostras</p></div>
                  <div className="absolute inset-x-0 bottom-0 h-1 bg-violet-400/70" />
                </div>
                <div className="relative flex min-h-44 flex-col justify-between overflow-hidden rounded-2xl border border-emerald-500/25 bg-gradient-to-br from-[#0b2c37] to-[#0b203c] p-5 shadow-lg transition hover:border-emerald-400/60">
                  <div className="flex items-center justify-between"><span className="flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-400/30 bg-emerald-500/10 text-emerald-200"><span className="material-symbols-outlined text-[22px]">database</span></span><span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-2 py-1 text-[10px] font-bold text-emerald-200">cobertura</span></div>
                  <div><p className="text-3xl font-black tracking-tight text-white">{isLoading ? '…' : `${stats?.summary.ragAccuracyRate ?? 0}%`}</p><p className="text-xs font-semibold text-slate-300">Contexto recuperado</p><p className="mt-1 text-[11px] text-slate-400">{stats?.telemetry.pipelineTurns ?? 0} consultas instrumentadas</p></div>
                  <div className="absolute inset-x-0 bottom-0 h-1 bg-emerald-400/70" />
                </div>
                <div className="relative flex min-h-44 flex-col justify-between overflow-hidden rounded-2xl border border-rose-500/25 bg-gradient-to-br from-[#2e203a] to-[#0b203c] p-5 shadow-lg transition hover:border-rose-400/60">
                  <div className="flex items-center justify-between"><span className={`flex h-10 w-10 items-center justify-center rounded-xl border ${technicalFailures === 0 ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200' : 'border-rose-400/30 bg-rose-500/10 text-rose-200'}`}><span className="material-symbols-outlined text-[22px]">monitor_heart</span></span><span className={`rounded-full border px-2 py-1 text-[10px] font-bold ${technicalFailures === 0 ? 'border-emerald-400/20 bg-emerald-500/10 text-emerald-200' : 'border-rose-400/20 bg-rose-500/10 text-rose-200'}`}>{technicalFailures === 0 ? 'normal' : 'atenção'}</span></div>
                  <div><p className="text-3xl font-black tracking-tight text-white">{isLoading ? '…' : technicalFailures}</p><p className="text-xs font-semibold text-slate-300">Falhas técnicas</p><p className="mt-1 text-[11px] text-slate-400">Busca: {stats?.telemetry.retrievalFailures ?? 0} · Modelo: {stats?.telemetry.modelFailures ?? 0} · Sem contexto: {stats?.telemetry.noContextTurns ?? 0}</p></div>
                  <div className={`absolute inset-x-0 bottom-0 h-1 ${technicalFailures === 0 ? 'bg-emerald-400/70' : 'bg-rose-400/70'}`} />
                </div>
                <div className="relative flex min-h-44 flex-col justify-between overflow-hidden rounded-2xl border border-amber-500/25 bg-gradient-to-br from-[#342b1d] to-[#0b203c] p-5 shadow-lg transition hover:border-amber-400/60">
                  <div className="flex items-center justify-between"><span className="flex h-10 w-10 items-center justify-center rounded-xl border border-amber-400/30 bg-amber-500/10 text-amber-200"><span className="material-symbols-outlined text-[22px]">grade</span></span><span className="rounded-full border border-amber-400/20 bg-amber-500/10 px-2 py-1 text-[10px] font-bold text-amber-200">satisfação</span></div>
                  <div><p className="text-3xl font-black tracking-tight text-white">{isLoading ? '…' : `${stats?.summary.avgFeedbackRating ?? 0}/5`}</p><p className="text-xs font-semibold text-slate-300">Avaliação dos estudantes</p><p className="mt-1 text-[11px] text-slate-400">{stats?.summary.totalFeedbacks ?? 0} avaliações · {stats?.summary.satisfactionRate ?? 0}% com 4–5 estrelas</p></div>
                  <div className="absolute inset-x-0 bottom-0 h-1 bg-amber-400/70" />
                </div>
              </section>

              <section className="grid grid-cols-1 gap-6 xl:grid-cols-3">
                <div className="xl:col-span-2 rounded-2xl border border-blue-900/40 bg-[#0b203c] p-5 shadow-lg">
                  <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h2 className="text-sm font-bold text-white">Atividade registrada</h2>
                      <p className="text-[11px] text-slate-400">Mensagens de sessões válidas por dia.</p>
                    </div>
                    <div className="flex w-fit rounded-xl border border-blue-900/50 bg-[#040e1f] p-1">
                      {(['7d', '30d', '90d'] as const).map((range) => (
                        <button
                          key={range}
                          onClick={() => setTimeRange(range)}
                          className={`rounded-lg px-3 py-1 text-[11px] font-bold transition ${timeRange === range ? 'bg-[#1573C2] text-white shadow' : 'text-slate-400 hover:text-white'}`}
                        >
                          {range}
                        </button>
                      ))}
                    </div>
                  </div>
                  <ActivityChart timeline={stats?.timeline ?? []} timeRange={timeRange} />
                </div>

                <div className="rounded-2xl border border-blue-900/40 bg-[#0b203c] p-5 shadow-lg">
                  <h2 className="text-sm font-bold text-white">Aderência ao RAG</h2>
                  <p className="mt-1 text-[11px] text-slate-400">Respostas conformes entre as avaliadas automaticamente.</p>
                  <div className="mt-2 flex justify-center"><GaugeRing percent={stats?.qualityEvaluation.correctRate ?? 0} /></div>
                  <div className="rounded-xl border border-blue-900/40 bg-[#040e1f] px-3 py-2 text-center text-[11px] text-slate-400">
                    <b className="text-emerald-300">{stats?.qualityEvaluation.correct ?? 0}</b> conformes · <b className="text-amber-300">{stats?.qualityEvaluation.unverifiable ?? 0}</b> sem evidência suficiente
                  </div>
                </div>
              </section>

              <section className="grid grid-cols-1 gap-6 xl:grid-cols-3">
                <div className="rounded-2xl border border-blue-900/40 bg-[#0b203c] p-5 shadow-lg xl:col-span-2">
                  <h2 className="text-sm font-bold text-white">Fluxo monitorado da resposta</h2>
                  <p className="mt-1 text-[11px] text-slate-400">Cada etapa representa telemetria real; a avaliação ocorre depois de a resposta chegar ao estudante.</p>
                  <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-4">
                    {[
                      ['chat', 'Pergunta', `${stats?.summary.totalMessages ?? 0} mensagens`, 'text-cyan-300'],
                      ['search', 'Recuperação RAG', `${stats?.telemetry.pipelineTurns ?? 0} consultas`, 'text-emerald-300'],
                      ['smart_toy', 'Resposta', `${stats?.telemetry.latencySamples ?? 0} tempos medidos`, 'text-purple-300'],
                      ['verified', 'Avaliação', `${stats?.qualityEvaluation.completed ?? 0} concluídas`, 'text-amber-300'],
                    ].map(([icon, title, detail, color], index) => (
                      <div key={title} className="relative rounded-xl border border-blue-900/40 bg-[#040e1f] p-3 text-center">
                        {index < 3 && <span className="absolute -right-3 top-1/2 z-10 hidden -translate-y-1/2 text-blue-400 sm:block">→</span>}
                        <span className={`material-symbols-outlined text-2xl ${color}`}>{icon}</span>
                        <p className="mt-2 text-xs font-bold text-white">{title}</p>
                        <p className="mt-1 text-[10px] text-slate-400">{detail}</p>
                      </div>
                    ))}
                  </div>
                </div>
                <FeedbackDashboardWidget
                  avgRating={stats?.summary.avgFeedbackRating || 0}
                  totalFeedbacks={stats?.summary.totalFeedbacks || 0}
                  satisfactionRate={stats?.summary.satisfactionRate || 0}
                  ratingCounts={stats?.feedbackStats?.ratingCounts || { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 }}
                />
              </section>

              <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                <div className="rounded-2xl border border-blue-900/40 bg-[#0b203c] p-5">
                  <h2 className="text-sm font-bold text-white">Saúde do RAG e da sincronização</h2>
                  <p className="mt-1 text-[11px] text-slate-400">Inventário da base e atualização vinda do Google Drive.</p>
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div className="rounded-xl bg-[#040e1f] p-3"><p className="text-xl font-black text-white">{(stats?.summary.totalRagDocs ?? 0).toLocaleString('pt-BR')}</p><p className="text-[11px] text-slate-400">fontes indexadas</p></div>
                    <div className="rounded-xl bg-[#040e1f] p-3"><p className="text-xl font-black text-white">{(stats?.summary.totalRagChunks ?? 0).toLocaleString('pt-BR')}</p><p className="text-[11px] text-slate-400">trechos vetorizados</p></div>
                    <div className="rounded-xl bg-[#040e1f] p-3"><p className="text-xl font-black text-emerald-300">{stats?.syncHealth.failed ?? 0}</p><p className="text-[11px] text-slate-400">falhas de sincronização</p></div>
                    <div className="rounded-xl bg-[#040e1f] p-3"><p className="text-xl font-black text-cyan-300">{stats?.syncHealth.running ?? 0}</p><p className="text-[11px] text-slate-400">documentos processando</p></div>
                  </div>
                  <p className="mt-3 text-[11px] text-slate-500">Última sincronização concluída: {stats?.syncHealth.lastSuccessAt ? new Date(stats.syncHealth.lastSuccessAt).toLocaleString('pt-BR') : 'sem registro'}</p>
                </div>

                <div className="rounded-2xl border border-blue-900/40 bg-[#0b203c] p-5">
                  <h2 className="text-sm font-bold text-white">Uso real do app</h2>
                  <p className="mt-1 text-[11px] text-slate-400">Sessões e mensagens, excluindo identificadores conhecidos de testes internos.</p>
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div className="rounded-xl bg-[#040e1f] p-3"><p className="text-xl font-black text-white">{stats?.summary.totalConversations ?? 0}</p><p className="text-[11px] text-slate-400">sessões registradas</p></div>
                    <div className="rounded-xl bg-[#040e1f] p-3"><p className="text-xl font-black text-white">{stats?.summary.totalMessages ?? 0}</p><p className="text-[11px] text-slate-400">mensagens trocadas</p></div>
                  </div>
                  <p className="mt-4 text-[11px] text-slate-500">Não exibimos “usuários únicos”: o app não autentica estudantes, portanto uma sessão não equivale a uma pessoa.</p>
                  <button onClick={() => setActiveTab('conversas')} className="mt-4 rounded-lg bg-[#1573C2] px-3 py-2 text-xs font-semibold text-white">Abrir dossiês de conversas</button>
                </div>
              </section>
            </div>
          )}

          {/* ── TAB 2: REGISTRO DE CONVERSAS ─────────────────────────────────── */}
          {activeTab === 'conversas' && (
            <div className="flex flex-col gap-4">
              {/* Barra de Busca e Filtros */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-[#0b203c] p-4 rounded-2xl border border-blue-900/40">
                <div className="relative w-full sm:w-80">
                  <span className="material-symbols-outlined absolute left-3 top-2.5 text-slate-400 text-[18px]">
                    search
                  </span>
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Buscar por ID, mensagem ou tema..."
                    className="w-full bg-[#040e1f] border border-blue-900/60 rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#1573C2]"
                  />
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <span className="text-[11px] font-semibold text-blue-300 bg-blue-950 px-2.5 py-1.5 rounded-xl border border-blue-800 flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px]">sort</span>
                    Mais Recentes Primeiro
                  </span>
                  <select
                    value={modeFilter}
                    onChange={(e) => setModeFilter(e.target.value)}
                    className="bg-[#040e1f] border border-blue-900/60 rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                  >
                    <option value="all">Todos os Modos</option>
                    <option value="resumo">Resumos</option>
                    <option value="quiz">Quizes / Simulados</option>
                    <option value="info">Informações</option>
                  </select>
                </div>
              </div>

              {/* Tabela de Conversas */}
              <div className="bg-[#0b203c] border border-blue-900/40 rounded-2xl overflow-hidden shadow-lg">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#040e1f] text-slate-400 uppercase font-semibold border-b border-blue-900/40">
                      <tr>
                        <th className="py-3.5 px-4 w-16">#</th>
                        <th className="py-3.5 px-4">Estudante / Sessão</th>
                        <th className="py-3.5 px-4">Primeira Mensagem</th>
                        <th className="py-3.5 px-4">Tema Detectado</th>
                        <th className="py-3.5 px-4">Última Atividade</th>
                        <th className="py-3.5 px-4 text-center">Interações</th>
                        <th className="py-3.5 px-4 text-center">Média Avaliação</th>
                        <th className="py-3.5 px-4 text-right">Ação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-blue-900/30 text-slate-200">
                      {filteredSessions.length > 0 ? (
                        filteredSessions.map((session, index) => (
                          <tr key={session.sessionId} className="hover:bg-blue-950/30 transition-colors">
                            <td className="py-3.5 px-4 font-mono font-bold text-base text-white">
                              #{String(index + 1).padStart(2, '0')}
                            </td>
                            <td className="py-3.5 px-4 font-mono text-xs font-semibold text-blue-400">
                              {session.sessionId}
                            </td>
                            <td className="py-3.5 px-4 max-w-xs truncate font-medium text-slate-300">
                              {session.userFirstMsg || 'Menu Inicial'}
                            </td>
                            <td className="py-3.5 px-4">
                              <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-blue-950 border border-blue-800 text-blue-300">
                                {session.detectedTheme}
                              </span>
                            </td>
                            <td className="py-3.5 px-4 text-slate-400">
                              {new Date(session.lastAt).toLocaleString('pt-BR')}
                            </td>
                            <td className="py-3.5 px-4 text-center font-bold text-white">
                              {session.messageCount}
                            </td>
                            <td className="py-3.5 px-4 text-center font-bold">
                              {session.avgRating ? (
                                <span className="inline-flex items-center gap-1 text-amber-400 font-bold bg-amber-950/60 border border-amber-500/40 px-2.5 py-0.5 rounded-full text-xs">
                                  <span className="material-symbols-outlined text-[13px]" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                                  {session.avgRating.toFixed(1)}
                                </span>
                              ) : (
                                <span className="text-slate-500 italic text-[11px]">—</span>
                              )}
                            </td>
                            <td className="py-3.5 px-4 text-right">
                              <button
                                onClick={() => setSelectedSession(session)}
                                className="px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-[#1573C2] hover:bg-[#0d4a87] text-white transition-all cursor-pointer active:scale-95 shadow"
                              >
                                Ver Dossiê
                              </button>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={8} className="py-8 text-center text-slate-500 italic">
                            Nenhuma conversa encontrada com os filtros selecionados.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ── TAB 3: SISTEMA & TELEMETRIA ───────────────────────────────────── */}
          {activeTab === 'sistema' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-[#0b203c] border border-blue-900/40 p-5 rounded-2xl flex flex-col gap-4">
                <h2 className="text-sm font-bold text-white">Status dos Componentes</h2>
                <div className="space-y-3 text-xs">
                  <div className="flex items-center justify-between p-3 rounded-xl bg-[#040e1f] border border-blue-900/40">
                    <span className="font-semibold text-slate-200">Supabase pgvector Database</span>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                      {stats ? `🟢 ${stats.summary.totalRagChunks.toLocaleString('pt-BR')} chunks lidos` : 'Aguardando leitura'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-xl bg-[#040e1f] border border-blue-900/40">
                    <span className="font-semibold text-slate-200">Pipeline Gemini / RAG</span>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                      {stats ? `${stats.telemetry.pipelineTurns} turnos instrumentados` : 'Sem amostra'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-xl bg-[#040e1f] border border-blue-900/40">
                    <span className="font-semibold text-slate-200">Tempo de resposta P50 / P95</span>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                      {stats ? `${(stats.telemetry.p50ResponseTimeMs / 1000).toFixed(2)}s / ${(stats.telemetry.p95ResponseTimeMs / 1000).toFixed(2)}s` : 'Sem amostra'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-xl bg-[#040e1f] border border-blue-900/40">
                    <span className="font-semibold text-slate-200">Sincronização Google Drive</span>
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                      (stats?.syncHealth.failed ?? 0) > 0
                        ? 'bg-red-500/20 text-red-300 border-red-500/30'
                        : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                    }`}>
                      {stats ? `${stats.syncHealth.running} processando · ${stats.syncHealth.queued} na fila · ${stats.syncHealth.failed} falhas` : 'Aguardando leitura'}
                    </span>
                  </div>
                </div>
                {stats?.syncHealth.lastError && (
                  <p className="rounded-lg border border-red-500/30 bg-red-500/10 p-2 text-[10px] text-red-200">
                    Última falha de sincronização: {stats.syncHealth.lastError}
                  </p>
                )}
                <p className="text-[10px] text-slate-500">
                  Disponibilidade e uptime exigem monitor externo; este painel mostra apenas o que foi observado nas respostas registradas.
                </p>
                <div className="grid grid-cols-4 gap-2 text-center text-[10px]">
                  <div className="rounded-lg bg-emerald-500/10 p-2 text-emerald-300">{stats?.qualityEvaluation.correct ?? 0}<br />corretas</div>
                  <div className="rounded-lg bg-amber-500/10 p-2 text-amber-300">{stats?.qualityEvaluation.incomplete ?? 0}<br />incompletas</div>
                  <div className="rounded-lg bg-red-500/10 p-2 text-red-300">{stats?.qualityEvaluation.incorrect ?? 0}<br />incorretas</div>
                  <div className="rounded-lg bg-slate-500/10 p-2 text-slate-300">{(stats?.qualityEvaluation.queued ?? 0) + (stats?.qualityEvaluation.running ?? 0)}<br />na fila</div>
                </div>
              </div>

              <div className="bg-[#0b203c] border border-blue-900/40 p-5 rounded-2xl flex flex-col gap-4 md:col-span-2">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-blue-900/50 pb-3">
                  <div>
                    <h2 className="text-sm font-bold text-white flex items-center gap-2">
                      <span className="material-symbols-outlined text-blue-400 text-[20px]">menu_book</span>
                      Inventário da Base RAG & Biblioteca de Livros
                    </h2>
                    <p className="text-[11px] text-slate-400">
                      Inventário real da base vetorial. A presença do documento não substitui a validação de relevância em cada consulta.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-1 rounded-xl text-[10px] font-bold bg-blue-950 border border-blue-800 text-blue-300">
                      📚 {stats?.summary.totalRagDocs ?? 0} Fontes
                    </span>
                    <span className="px-2.5 py-1 rounded-xl text-[10px] font-bold bg-emerald-950 border border-emerald-800 text-emerald-300">
                      ⚡ {(stats?.summary.totalRagChunks ?? 0).toLocaleString('pt-BR')} Chunks
                    </span>
                    <span className="px-2.5 py-1 rounded-xl text-[10px] font-bold bg-amber-950 border border-amber-800 text-amber-300">
                      📖 {stats?.summary.bibliotecaPercent ?? 0}% Pasta Biblioteca
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs mb-2">
                  <div className="p-3 bg-[#040e1f] rounded-xl border border-blue-900/40">
                    <span className="text-[10px] text-slate-400 font-semibold block">Total de Chunks Indexados</span>
                    <span className="text-lg font-black text-white">{(stats?.summary.totalRagChunks ?? 0).toLocaleString('pt-BR')}</span>
                    <span className="text-[10px] text-emerald-400 block mt-0.5">Vetorizados com gemini-embedding-2</span>
                  </div>
                  <div className="p-3 bg-[#040e1f] rounded-xl border border-blue-900/40">
                    <span className="text-[10px] text-slate-400 font-semibold block">Volume da Pasta Biblioteca</span>
                    <span className="text-lg font-black text-amber-400">{stats?.summary.bibliotecaChunks ?? 0} chunks</span>
                    <span className="text-[10px] text-slate-400 block mt-0.5">{stats?.summary.bibliotecaPercent ?? 0}% da amostra consultada</span>
                  </div>
                  <div className="p-3 bg-[#040e1f] rounded-xl border border-blue-900/40">
                    <span className="text-[10px] text-slate-400 font-semibold block">Status de Consulta RAG</span>
                    <span className="text-lg font-black text-emerald-400">{stats?.telemetry.retrievalFailures ?? 0} falhas</span>
                    <span className="text-[10px] text-slate-400 block mt-0.5">em {stats?.telemetry.pipelineTurns ?? 0} consultas instrumentadas</span>
                  </div>
                </div>

                <div className="overflow-x-auto max-h-72 border border-blue-900/40 rounded-xl">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#040e1f] text-slate-400 uppercase font-semibold text-[10px] sticky top-0 border-b border-blue-900/40">
                      <tr>
                        <th className="py-2.5 px-3">Documento / Livro de Referência</th>
                        <th className="py-2.5 px-3">Categoria</th>
                        <th className="py-2.5 px-3 text-right">Volume (Chunks)</th>
                        <th className="py-2.5 px-3 text-center">Status no RAG</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-blue-900/30 text-slate-300 text-[11px]">
                      {(stats?.ragDocuments || []).map((doc, i) => (
                        <tr key={i} className="hover:bg-blue-950/40 transition-colors">
                          <td className="py-2 px-3 font-medium text-white max-w-xs truncate">
                            {doc.source}
                          </td>
                          <td className="py-2 px-3">
                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                              (doc.category || '').includes('Biblioteca')
                                ? 'bg-amber-950/80 border border-amber-800 text-amber-300'
                                : 'bg-blue-950 border border-blue-800 text-blue-300'
                            }`}>
                              {doc.category || 'Material RAG'}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-right font-mono font-bold text-slate-200">
                            {doc.chunkCount.toLocaleString('pt-BR')}
                          </td>
                          <td className="py-2 px-3 text-center">
                            <span className="text-emerald-400 font-bold text-[10px]">🟢 Indexado</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* ── MODAL DOSSIÊ COMPLETO DA CONVERSA ─────────────────────────────────── */}
      {selectedSession && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-[#0b203c] border border-blue-700/50 rounded-2xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            {/* Header do Modal */}
            <div className="p-4 bg-[#040e1f] border-b border-blue-900/60 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-white">
                  Dossiê da Sessão #{selectedSession.sessionId.substring(0, 8)}
                </h3>
                <p className="text-[11px] text-slate-400 flex items-center gap-2 flex-wrap mt-0.5">
                  <span>Tema: <span className="text-blue-400 font-semibold">{selectedSession.detectedTheme}</span> · Total de {selectedSession.messageCount} interações</span>
                  {selectedSession.avgRating ? (
                    <span className="inline-flex items-center gap-1 text-amber-400 font-bold bg-amber-950/80 border border-amber-500/40 px-2 py-0.5 rounded-full text-[10px]">
                      <span className="material-symbols-outlined text-[12px]" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                      Avaliação: {selectedSession.avgRating.toFixed(1)}
                    </span>
                  ) : (
                    <span className="text-slate-500 italic text-[10px]">· Sem avaliação</span>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => downloadSessionDossier(selectedSession)}
                  className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[16px]">download</span>
                  Baixar Dossiê (.TXT)
                </button>
                <button
                  onClick={() => setSelectedSession(null)}
                  className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-blue-900/40 transition-colors cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[20px]">close</span>
                </button>
              </div>
            </div>

            {/* Mensagens do Dossiê */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
              {selectedSession.messages.map((m, idx) => (
                <div
                  key={idx}
                  className={`p-3.5 rounded-xl border ${
                    m.role === 'user'
                      ? 'bg-[#1573C2]/15 border-[#1573C2]/40 text-blue-100 ml-6'
                      : 'bg-[#040e1f] border-blue-900/60 text-slate-200 mr-6'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5 pb-1 border-b border-white/10 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    <span>{m.role === 'user' ? '👤 Estudante' : '🩺 Guapu'}</span>
                    <span>{m.created_at ? new Date(m.created_at).toLocaleTimeString('pt-BR') : '—'}</span>
                  </div>
                  <p className="whitespace-pre-wrap leading-relaxed">{m.content}</p>
                  {m.role === 'assistant' && (
                    <div className="mt-3 pt-3 border-t border-cyan-500/20 text-[10px]">
                      <span className="font-bold uppercase tracking-wide text-cyan-300">Avaliação automática RAG</span>
                      {!m.evaluation && <p className="mt-1 text-slate-500">Sem avaliação: resposta legada ou ainda não instrumentada.</p>}
                      {m.evaluation?.status === 'queued' || m.evaluation?.status === 'running' ? (
                        <p className="mt-1 text-amber-300">Avaliação em processamento, sem interferir no atendimento do aluno.</p>
                      ) : m.evaluation?.status === 'failed' ? (
                        <p className="mt-1 text-red-300">A avaliação automática não foi concluída após as tentativas previstas.</p>
                      ) : m.evaluation?.status === 'succeeded' ? (
                        <div className="mt-2 space-y-1 text-slate-300">
                          <p><strong>Nota:</strong> {m.evaluation.score}/100 · <strong>Classificação:</strong> {m.evaluation.verdict === 'correct' ? 'correta' : m.evaluation.verdict === 'incomplete' ? 'incompleta' : m.evaluation.verdict === 'incorrect' ? 'incorreta' : 'não verificável'}</p>
                          <p>Fontes analisadas: {m.evaluation.source_count ?? 0} · Aderência: {m.evaluation.grounding_score ?? 0}/100 · Cobertura: {m.evaluation.completeness_score ?? 0}/100</p>
                          {m.evaluation.rationale && <p className="text-slate-400">{m.evaluation.rationale}</p>}
                        </div>
                      ) : null}
                      {m.learnerRating && (
                        <p className="mt-2 text-amber-300"><strong>Avaliação do estudante:</strong> {m.learnerRating}/5 ★</p>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Rodapé do Modal */}
            <div className="p-3 bg-[#040e1f] border-t border-blue-900/60 flex justify-end">
              <button
                onClick={() => setSelectedSession(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-700 hover:bg-slate-600 text-white cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
