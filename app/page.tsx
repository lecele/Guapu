'use client';

import { useEffect, useRef, type ComponentType } from 'react';
import Image from 'next/image';
import {
  BookOpen,
  CircleHelp,
  Info,
  LogOut,
  Moon,
  Sun,
  type LucideProps,
} from 'lucide-react';
import { useChat } from '@/hooks/useChat';
import { GuapuMark } from '@/components/icons/GuapuMark';
import { MessageInput } from '@/components/chat/MessageInput';
import { MessageBubble } from '@/components/chat/MessageBubble';
import { TypingIndicator } from '@/components/chat/TypingIndicator';
import type { ChatActionMode } from '@/types/chat';

type ActionTone = 'verde' | 'azul' | 'dourado' | 'neutro';

interface WelcomeAction {
  label: string;
  message: string;
  activeMode: ChatActionMode;
  description: string;
  tone: ActionTone;
  icon: ComponentType<LucideProps>;
}

const WELCOME_ACTIONS: WelcomeAction[] = [
  {
    label: 'Resumo de conteúdo',
    message: 'Resumo de conteúdo',
    activeMode: 'resumo',
    description: 'Revise os temas da disciplina com explicações e exemplos clínicos',
    tone: 'verde',
    icon: BookOpen,
  },
  {
    label: 'Quiz da disciplina',
    message: 'Quiz da disciplina',
    activeMode: 'quiz',
    description: 'Pratique com questões de múltipla escolha e feedback imediato',
    tone: 'azul',
    icon: CircleHelp,
  },
  {
    label: 'Informações da disciplina',
    message: 'Informações da disciplina',
    activeMode: 'info',
    description: 'Consulte o conteúdo programático, calendário e critérios de avaliação',
    tone: 'dourado',
    icon: Info,
  },
  {
    label: 'Encerrar sessão',
    message: 'Encerrar sessão',
    activeMode: 'encerrar',
    description: 'Encerre a sessão atual',
    tone: 'neutro',
    icon: LogOut,
  },
];

export default function HomePage() {
  const {
    messages,
    isLoading,
    error,
    session,
    messagesEndRef,
    sendMessage,
    startNewSession,
    clearError,
  } = useChat();
  useEffect(() => {
    const handler = (event: Event) => {
      sendMessage((event as CustomEvent<string>).detail);
    };
    window.addEventListener('suggestion-click', handler);
    return () => window.removeEventListener('suggestion-click', handler);
  }, [sendMessage]);

  const toggleTheme = () => {
    const next = !document.documentElement.classList.contains('dark');
    document.documentElement.classList.toggle('dark', next);
    localStorage.setItem('theme', next ? 'dark' : 'light');
  };

  const isEmpty = messages.length === 0;
  const mainContentRef = useRef<HTMLElement>(null);

  // Em navegadores móveis, a restauração automática de rolagem pode manter a
  // tela inicial no meio do conteúdo depois de voltar ou recarregar a página.
  // Sempre que não houver conversa, a apresentação começa pelo título.
  useEffect(() => {
    if (!isEmpty) return;
    const frame = window.requestAnimationFrame(() => {
      mainContentRef.current?.scrollTo({ top: 0, behavior: 'auto' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [isEmpty]);

  return (
    <div className="guapu-page">
      <main className="guapu-app">
        <BranchDecoration />

        <header className="guapu-header">
          <div className="guapu-brand">
            <GuapuMark size={38} />
            <div className="guapu-brand-copy">
              <span className="guapu-wordmark">Guapu</span>
              <span className="guapu-context-pill">Tutor de Enfermagem</span>
            </div>
          </div>
          <div className="guapu-header-actions">
            <button
              type="button"
              className="guapu-icon-button"
              onClick={toggleTheme}
              aria-label="Alternar tema claro ou escuro"
            >
              <Moon className="guapu-theme-icon is-moon" size={17} strokeWidth={1.8} />
              <Sun className="guapu-theme-icon is-sun" size={17} strokeWidth={1.8} />
            </button>
          </div>
        </header>

        <section
          ref={mainContentRef}
          className={`guapu-main-content ${isEmpty ? 'is-welcome' : 'is-conversation'}`}
          aria-label={isEmpty ? 'Início do assistente' : 'Histórico da conversa'}
        >
          {isEmpty ? (
            <WelcomeMenu onSelect={sendMessage} />
          ) : (
            <div className="guapu-message-list" aria-live="polite">
              {messages.map((message, index) => (
                <MessageBubble
                  key={message.id}
                  message={message}
                  index={index}
                  sessionId={session.id}
                />
              ))}
              {isLoading && <TypingIndicator />}
              <div ref={messagesEndRef} className="guapu-scroll-anchor" />
            </div>
          )}
        </section>

        {error && (
          <div className="guapu-error" role="alert">
            <p>{error}</p>
            <button type="button" onClick={clearError}>Fechar</button>
          </div>
        )}

        <footer className="guapu-footer">
          <MessageInput
            onSend={sendMessage}
            onNewSession={startNewSession}
            isLoading={isLoading}
          />
          <div className="guapu-footer-meta">
            <p className="guapu-caption">Guapu · Universidade Federal de Santa Catarina</p>
            <a
              className="guapu-brand-watermark"
              href="https://www.agentesnasaude.com.br/"
              target="_blank"
              rel="noreferrer"
              aria-label="Conheça a Agentes na Saúde (abre em uma nova aba)"
              title="Desenvolvido por Agentes na Saúde"
            >
              <Image src="/agentes-na-saude.png" alt="Agentes na Saúde" width={130} height={45} />
            </a>
          </div>
        </footer>
      </main>
    </div>
  );
}

function WelcomeMenu({ onSelect }: { onSelect: (message: string, activeMode: ChatActionMode) => void }) {
  return (
    <div className="guapu-welcome">
      <section className="guapu-hero">
        <div className="guapu-header-eyebrow"><span /> Assistente de IA · INT 5224</div>
        <h1>O cuidado no processo de viver humano II: a condição cirúrgica</h1>
        <p className="guapu-lead">
          Olá, eu sou o Guapu, o tutor inteligente da disciplina INT 5224, do curso de Graduação em Enfermagem da UFSC. Estarei aqui para facilitar sua jornada de aprendizagem sobre o cuidado de enfermagem ao paciente cirúrgico.
        </p>

        <div className="guapu-transparency-note">
          <Info size={18} strokeWidth={2} aria-hidden="true" />
          <p>
            <strong>Atenção:</strong> o uso do tutor inteligente não substitui o raciocínio clínico, a leitura dos conteúdos na íntegra ou a orientação docente.
          </p>
        </div>
      </section>

      <div className="guapu-divider" aria-hidden="true">
        <span />
        <p>escolha uma opção</p>
        <span />
      </div>

      <div className="guapu-action-grid">
        {WELCOME_ACTIONS.map(({ label, message, activeMode, description, tone, icon: Icon }) => (
          <button
            key={label}
            type="button"
            className={`guapu-action-card is-${tone}`}
            onClick={() => onSelect(message, activeMode)}
          >
            <span className="guapu-action-icon"><Icon size={20} strokeWidth={1.8} /></span>
            <span>
              <strong>{label}</strong>
              <small>{description}</small>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function BranchDecoration() {
  return (
    <svg className="guapu-branch" viewBox="0 0 200 200" fill="none" aria-hidden="true">
      <path d="M100 190 C100 140, 80 130, 90 90 C96 65, 100 40, 100 10" />
      <path d="M100 90 C80 80, 60 82, 48 60" />
      <path d="M100 60 C118 50, 130 52, 145 35" />
      <circle cx="48" cy="60" r="6" />
      <circle cx="145" cy="35" r="6" />
      <circle cx="100" cy="10" r="6" />
    </svg>
  );
}
