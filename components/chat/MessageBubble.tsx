'use client';

// components/chat/MessageBubble.tsx — Balões com suporte a opções de menu clicáveis

import { useMemo, useEffect, useRef, useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { ChevronRight, MousePointerClick, Star } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Message } from '@/types/chat';
import { GuapuMark } from '@/components/icons/GuapuMark';

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
      className={`guapu-chat-row ${isUser ? 'is-user' : 'is-assistant'}`}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: Math.min(index * 0.04, 0.2), ease: [0.16, 1, 0.3, 1] }}
    >
      {!isUser && <GuapuMark size={28} className="guapu-message-avatar" />}

      {/* Conteúdo */}
      <div className="guapu-bubble-stack">
        <span className="guapu-message-author">
          {isUser ? 'Você' : 'Tutor'}
        </span>

        {isUser ? <UserBubble content={message.content} /> : (
          <AgentBubble
            content={message.content}
            sessionId={sessionId}
          />
        )}

        <span className="guapu-message-time">
          {message.timestamp.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
    </motion.div>
  );
}

// ── Balões ───────────────────────────────────────────────────────────────────

function UserBubble({ content }: { content: string }) {
  return (
    <div className="guapu-user-bubble">
      <p>{content}</p>
    </div>
  );
}

// Labels exatos que devem ser renderizados como botões interativos (menu principal)
// Qualquer outro item de lista (conteúdo, referências, exemplos) renderiza como <li> normal
const MENU_BUTTON_RE = /^(resumo de conteúdo|resumo|quiz da disciplina|quiz|simulado de prova|simulado|informações da disciplina|informações|encerrar sessão|encerrar|aprofundar|aprofundar este tema|aprofundar mais|escolher outro tema|outro tema|voltar ao menu principal|voltar ao menu|menu principal|continuar o simulado|continuar simulado|continuar o quiz|continuar quiz|fazer outra pergunta|outra pergunta|repetir a pergunta)$/i;

function AgentBubble({ content, sessionId }: {
  content: string;
  sessionId?: string;
}) {
  // Garante que opções A), B), C), D) e Referências fiquem em linhas separadas
  const formattedContent = useMemo(() => {
    let text = content;

    // Alguns modelos ocasionalmente devolvem as quatro alternativas na mesma
    // linha. Quando o conjunto A-D está presente, normalizamos a apresentação
    // no cliente para que cada alternativa fique legível em sua própria linha.
    const optionLabels = [...text.matchAll(/(?:^|\s)(?:\*\*)?([A-D])\)(?:\*\*)?(?=\s)/gm)]
      .map((match) => match[1]);
    if (['A', 'B', 'C', 'D'].every((label) => optionLabels.includes(label))) {
      text = text.replace(
        /(^|\s)(?:\*\*)?([A-D])\)(?:\*\*)?(?=\s)/gm,
        (_match, prefix: string, label: string) => `${prefix.includes('\n') ? prefix : '\n\n'}**${label})**`,
      );
    }

    if (/refer[êe]ncias:/i.test(text)) {
      text = text.replace(/(?:\*\*Refer[êe]ncias:?\*\*|Refer[êe]ncias:?)\s*(?:•|-|\*)?\s*/i, '**Referências:**\n\n- ');
      text = text.replace(/(\n- [^\n]+)\s+(?:•|-|\*)\s*(Refer[êe]ncia:)/gi, '$1\n- $2');
    }
    return text;
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
          <li className="guapu-list-item" {...props}>
            {children}
          </li>
        );
      }

      // Itens informativos como "Ou qualquer outra dúvida..." não viram botões
      if (label.toLowerCase().startsWith('ou ')) {
        return (
          <li className="guapu-option-note">
            {children}
          </li>
        );
      }

      return (
        <li className="list-none !pl-0 !ml-0">
          <button
            type="button"
            onClick={() => dispatchOptionClick(label)}
            className="guapu-option-button"
          >
            <MousePointerClick size={16} strokeWidth={1.8} aria-hidden="true" />
            <span>
              {children}
            </span>
            <ChevronRight size={14} strokeWidth={1.8} aria-hidden="true" />
          </button>
        </li>
      );
    },
    // Renderiza links como texto simples — referências não devem ser links clicáveis
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    a: ({ children }: any) => (
      <span className="guapu-inline-link">{children}</span>
    ),
    // Lista ordenada e não ordenada com bullet points limpos
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ol: ({ children, ...props }: any) => {
      return <ol className="guapu-list is-ordered" {...props}>{children}</ol>;
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ul: ({ children, ...props }: any) => {
      return <ul className="guapu-list" {...props}>{children}</ul>;
    },
  }), []);

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
    <div className="guapu-agent-bubble">
      <div className="guapu-markdown prose prose-sm">
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
          {formattedContent}
        </ReactMarkdown>
      </div>

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
    <div className="guapu-feedback">
      <span>
        {submitted ? 'Obrigado pela sua avaliação! ⭐' : 'Avalie a resposta:'}
      </span>
      <div>
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
              className="guapu-star-button"
              title={`${star} estrela${star > 1 ? 's' : ''} (${star === 1 ? 'ruim' : star === 5 ? 'excelente' : ''})`}
            >
              <Star size={18} strokeWidth={1.8} fill={active ? 'currentColor' : 'none'} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
