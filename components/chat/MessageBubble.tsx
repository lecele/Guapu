'use client';

// components/chat/MessageBubble.tsx — Balões com suporte a opções de menu clicáveis

import { useMemo, useEffect, useRef, useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Message } from '@/types/chat';
import { SourceBadges } from './SourceBadges';

interface MessageBubbleProps {
  message: Message;
  index: number;
  sessionId?: string;
}

// ── Dispatch de seleção de opção ─────────────────────────────────────────────
function dispatchOptionClick(text: string) {
  window.dispatchEvent(new CustomEvent('suggestion-click', { detail: text }));
}

// ── Extrai texto puro de nós React (para capturar o texto dos li) ────────────
function extractText(node: ReactNode): string {
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(extractText).join('');
  if (node && typeof node === 'object' && 'props' in node) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return extractText((node as any).props?.children);
  }
  return '';
}

export function MessageBubble({ message, index, sessionId }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const bubbleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Se for resposta do tutor, rola a tela para o INÍCIO da mensagem
    if (!isUser && bubbleRef.current) {
      setTimeout(() => {
        bubbleRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 50);
    }
  }, [isUser]);

  return (
    <motion.div
      ref={bubbleRef}
      className={`flex items-end gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: Math.min(index * 0.04, 0.2), ease: [0.16, 1, 0.3, 1] }}
    >
      {/* Avatar */}
      <div className="flex-shrink-0">
        {isUser ? <UserAvatar /> : <AgentAvatar />}
      </div>

      {/* Conteúdo */}
      <div className={`flex w-full min-w-0 max-w-[94%] sm:max-w-[88%] flex-col ${isUser ? 'items-end' : 'items-start'}`}>
        <span className={`mb-1 text-[10px] font-semibold uppercase tracking-wider ${
          isUser ? 'text-[#1573C2] dark:text-blue-400' : 'text-slate-400 dark:text-slate-500'
        }`}>
          {isUser ? 'Você' : 'Tutor'}
        </span>

        {isUser ? <UserBubble content={message.content} /> : (
          <AgentBubble
            content={message.content}
            sourcesFound={message.sources_found}
            hasContext={message.has_context}
            sessionId={sessionId}
          />
        )}

        <span className="mt-1 text-[10px] text-slate-400">
          {message.timestamp.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
    </motion.div>
  );
}

// ── Avatares ─────────────────────────────────────────────────────────────────

function AgentAvatar() {
  return (
    <div className="relative flex-shrink-0">
      <div className="absolute inset-0 rounded-full bg-[#1573C2]/20 blur-md scale-125 animate-pulse" />
      <div className="relative flex h-9 w-9 items-center justify-center rounded-full border border-[#1573C2]/35 bg-white dark:bg-[#05111f] shadow-[0_0_15px_rgba(21,115,194,0.35)]">
        <span className="material-symbols-outlined text-[18px] text-[#1573C2] dark:text-blue-400">
          medical_services
        </span>
      </div>
    </div>
  );
}

function UserAvatar() {
  return (
    <div className="flex-shrink-0 flex h-9 w-9 items-center justify-center rounded-full bg-white dark:bg-[#0c1e35] border border-[#1573C2]/30 shadow-sm">
      <span className="material-symbols-outlined text-[18px] text-[#1573C2] dark:text-blue-400">
        person
      </span>
    </div>
  );
}

// ── Balões ───────────────────────────────────────────────────────────────────

function UserBubble({ content }: { content: string }) {
  return (
    <div className="rounded-2xl rounded-br-none bg-[#1573C2] px-4 py-3 text-[13.5px] leading-relaxed text-white shadow-[0_4px_20px_rgba(21,115,194,0.25)] max-w-full break-words [overflow-wrap:anywhere]">
      <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{content}</p>
    </div>
  );
}

// Labels exatos que devem ser renderizados como botões interativos (menu principal)
// Qualquer outro item de lista (conteúdo, referências, exemplos) renderiza como <li> normal
const MENU_BUTTON_RE = /^(resumo de conteúdo|resumo|quiz da disciplina|quiz|simulado de prova|simulado|informações da disciplina|informações|encerrar sessão|encerrar|aprofundar|aprofundar este tema|aprofundar mais|escolher outro tema|outro tema|voltar ao menu principal|voltar ao menu|menu principal|continuar o simulado|continuar simulado|continuar o quiz|continuar quiz|fazer outra pergunta|outra pergunta|repetir a pergunta)$/i;

function AgentBubble({ content, sourcesFound, hasContext, sessionId }: {
  content: string;
  sourcesFound?: number;
  hasContext?: boolean;
  sessionId?: string;
}) {
  // Garante que opções A), B), C), D) e Referências fiquem em linhas separadas
  const formattedContent = useMemo(() => {
    let text = content;
    text = text.replace(/(\*\*?[A-D]\)\*\*?.*?)\s+(\*\*?[B-D]\)\*\*?)/g, '$1\n\n$2');
    text = text.replace(/(\*\*?[A-D]\)\*\*?.*?)\s+(\*\*?[B-D]\)\*\*?)/g, '$1\n\n$2');
    text = text.replace(/(\*\*?[A-D]\)\*\*?.*?)\s+(\*\*?[B-D]\)\*\*?)/g, '$1\n\n$2');

    if (/refer[êe]ncias:/i.test(text)) {
      text = text.replace(/(?:\*\*Refer[êe]ncias:?\*\*|Refer[êe]ncias:?)\s*(?:•|-|\*)?\s*/i, '**Referências:**\n\n- ');
      text = text.replace(/(\n- [^\n]+)\s+(?:•|-|\*)\s*(Refer[êe]ncia:)/gi, '$1\n- $2');
    }
    return text;
  }, [content]);

  // Detecta se a mensagem contém opções interativas para o usuário escolher
  const isOptionMessage = useMemo(() => {
    const lower = content.toLowerCase();
    return (
      (lower.includes('resumo de conteúdo') && (lower.includes('simulado de prova') || lower.includes('quiz da disciplina'))) ||
      lower.includes('perguntar sobre:') ||
      lower.includes('pergunte sobre:') ||
      lower.includes('escolha uma das') ||
      lower.includes('sugestões de estudo:') ||
      lower.includes('sugestões de temas:') ||
      lower.includes('deseja aprofundar') ||
      lower.includes('deseja continuar') ||
      lower.includes('voltar ao menu principal') ||
      lower.includes('informações da disciplina') ||
      lower.includes('informações do curso')
    );
  }, [content]);

  // Componentes customizados do ReactMarkdown
  const markdownComponents = useMemo(() => ({
    // Renderiza itens de lista como botões quando são opções
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    li: ({ children, ...props }: any) => {
      const label = extractText(children).trim();
      if (!label) return <li {...props}>{children}</li>;

      // Renderiza como botão APENAS se for uma opção de menu conhecida
      if (!MENU_BUTTON_RE.test(label)) {
        return (
          <li className="leading-relaxed my-1 text-slate-600 dark:text-slate-300" {...props}>
            {children}
          </li>
        );
      }

      // Itens informativos como "Ou qualquer outra dúvida..." não viram botões
      if (label.toLowerCase().startsWith('ou ')) {
        return (
          <li className="list-none !pl-2 !ml-0 text-slate-400 dark:text-slate-500 text-xs italic mt-2">
            {children}
          </li>
        );
      }

      return (
        <li className="list-none !pl-0 !ml-0">
          <button
            type="button"
            onClick={() => dispatchOptionClick(label)}
            className="
              group flex items-center gap-3 w-full text-left
              rounded-xl px-4 py-2.5 my-1
              border border-[#1573C2]/25 dark:border-blue-400/20
              bg-blue-50/60 dark:bg-blue-950/20
              hover:bg-blue-100/90 dark:hover:bg-blue-900/30
              hover:border-[#1573C2]/45 dark:hover:border-blue-400/40
              focus:outline-none focus:ring-2 focus:ring-[#1573C2]/15
              transition-all duration-150 cursor-pointer
              shadow-sm hover:shadow-md active:scale-[0.98]
            "
          >
            <span className="
              material-symbols-outlined text-[16px]
              text-[#1573C2] dark:text-blue-400
              shrink-0
            " style={{ fontVariationSettings: "'FILL' 1" }}>
              touch_app
            </span>
            <span className="
              text-[13.5px] font-semibold
              text-[#1573C2] dark:text-blue-400
            ">
              {children}
            </span>
            <span className="
              material-symbols-outlined text-[14px] ml-auto
              text-[#1573C2]/40 dark:text-blue-400/40
              group-hover:translate-x-0.5 transition-transform
            ">
              chevron_right
            </span>
          </button>
        </li>
      );
    },
    // Renderiza links como texto simples — referências não devem ser links clicáveis
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    a: ({ children }: any) => (
      <span className="text-slate-700 dark:text-slate-200">{children}</span>
    ),
    // Lista ordenada e não ordenada com bullet points limpos
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ol: ({ children, ...props }: any) => {
      return <ol className="list-decimal pl-5 my-2 space-y-1" {...props}>{children}</ol>;
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ul: ({ children, ...props }: any) => {
      return <ul className="list-disc pl-5 my-2 space-y-1.5" {...props}>{children}</ul>;
    },
  }), [isOptionMessage]);

  // Condição para exibição do Feedback Likert (Estrelas):
  // Exibir APENAS no resultado do resumo, final do simulado e final das informações da disciplina
  const shouldShowFeedback = useMemo(() => {
    if (!content) return false;
    const lower = content.toLowerCase();

    // Bloqueia em erros, interrupções ou menus intermediários
    if (
      lower.includes('ocorreu uma interrupção') ||
      lower.includes('erro') ||
      lower.includes('qual tema você deseja') ||
      lower.includes('qual tema da disciplina você deseja') ||
      lower.includes('tente novamente! qual das alternativas') ||
      lower.includes('ola! sou o assistente de inteligência artificial educacional') ||
      lower.includes('este espaço foi pensado para facilitar')
    ) {
      return false;
    }

    // 1. Resumo de Conteúdo / Aprofundamento
    const isResumo =
      lower.includes('**explicação:**') ||
      lower.includes('**explicação aprofundada:**') ||
      lower.includes('**exemplo clínico:**') ||
      lower.includes('deseja aprofundar este tema') ||
      lower.includes('deseja aprofundar mais');

    // 2. Final do Simulado / Quiz (resolução da questão ou encerramento)
    const isSimuladoFinal =
      lower.includes('parabéns, você acertou') ||
      lower.includes('você acertou') ||
      lower.includes('a alternativa correta é a') ||
      lower.includes('deseja continuar o simulado') ||
      lower.includes('deseja fazer outro simulado');

    // 3. Informações da Disciplina (resposta final informativa)
    const isInfo =
      lower.includes('informações da disciplina') ||
      lower.includes('plano de ensino') ||
      lower.includes('deseja fazer outra pergunta sobre a disciplina') ||
      lower.includes('informações sobre o cronograma');

    return isResumo || isSimuladoFinal || isInfo;
  }, [content]);

  return (
    <div className="w-full max-w-full min-w-0 rounded-2xl rounded-bl-none border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0d1e35] px-4 sm:px-5 py-4 shadow-sm break-words overflow-x-hidden [overflow-wrap:anywhere]">
      <div className="
        prose prose-sm max-w-none w-full min-w-0
        break-words [overflow-wrap:anywhere]
        text-slate-700 dark:text-slate-200
        prose-headings:font-bold prose-headings:text-slate-800 dark:prose-headings:text-white
        prose-strong:text-[#1573C2] dark:prose-strong:text-blue-400 prose-strong:font-bold
        prose-code:rounded prose-code:bg-slate-100 dark:prose-code:bg-slate-800 prose-code:px-1.5 prose-code:py-0.5 prose-code:text-[#1573C2] dark:prose-code:text-blue-300 prose-code:text-[11px] prose-code:break-words
        prose-li:text-slate-600 dark:prose-li:text-slate-300 prose-li:break-words
        prose-p:leading-relaxed prose-p:text-[13.5px] prose-p:break-words
        prose-a:text-slate-700 dark:prose-a:text-slate-200 prose-a:no-underline prose-a:font-normal prose-a:cursor-text
        prose-blockquote:border-l-[#1573C2] prose-blockquote:bg-blue-50 dark:prose-blockquote:bg-blue-950/20 prose-blockquote:px-4 prose-blockquote:py-1 prose-blockquote:rounded-r-lg
      ">
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
          {formattedContent}
        </ReactMarkdown>
      </div>

      {sourcesFound !== undefined && hasContext !== undefined && (
        <SourceBadges sourcesFound={sourcesFound} hasContext={hasContext} />
      )}

      {/* Componente de Avaliação Likert (1 a 5 Estrelas) — Exibido apenas em Resumos, Final de Quiz e Informações */}
      {shouldShowFeedback && <StarFeedbackRating sessionId={sessionId} />}
    </div>
  );
}

// ── Avaliação por Estrelas (Likert 1-5) ──────────────────────────────────────
function StarFeedbackRating({ sessionId }: { sessionId?: string }) {
  const [rating, setRating] = useState<number | null>(null);
  const [hoverRating, setHoverRating] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const handleRate = async (stars: number) => {
    setRating(stars);
    setSubmitted(true);
    try {
      await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId || 'anonymous',
          rating: stars,
        }),
      });
    } catch (e) {
      console.warn('Feedback submit error:', e);
    }
  };

  return (
    <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between flex-wrap gap-2 text-xs">
      <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
        {submitted ? 'Obrigado pela sua avaliação! ⭐' : 'Avalie a resposta:'}
      </span>
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((star) => {
          const active = (hoverRating || rating || 0) >= star;
          return (
            <button
              key={star}
              type="button"
              disabled={submitted}
              onClick={() => handleRate(star)}
              onMouseEnter={() => !submitted && setHoverRating(star)}
              onMouseLeave={() => !submitted && setHoverRating(null)}
              className="p-0.5 text-amber-400 hover:scale-125 transition-transform disabled:cursor-default"
              title={`${star} estrela${star > 1 ? 's' : ''} (${star === 1 ? 'ruim' : star === 5 ? 'excelente' : ''})`}
            >
              <span
                className="material-symbols-outlined text-[18px]"
                style={{ fontVariationSettings: active ? "'FILL' 1" : "'FILL' 0" }}
              >
                star
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
