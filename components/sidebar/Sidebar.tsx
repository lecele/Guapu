'use client';

// components/sidebar/Sidebar.tsx — Sidebar estilo InterAtiva, azul médico

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  onNewSession: () => void;
  toggleTheme?: () => void;
  darkMode?: boolean;
}

const TOPICS = [
  { label: 'Preparo Pré-operatório',       query: 'Quais os cuidados de enfermagem no preparo pré-operatório?' },
  { label: 'Posicionamento Cirúrgico',     query: 'Explique os principais posicionamentos cirúrgicos e riscos.' },
  { label: 'Centro Cirúrgico (CC)',        query: 'Como funciona a estrutura e rotina do centro cirúrgico?' },
  { label: 'Recuperação Anestésica (SRPA)', query: 'Quais os cuidados de enfermagem na sala de recuperação anestésica?' },
  { label: 'Cuidados Pós-operatórios',     query: 'Quais as principais complicações no pós-operatório e como prevenir?' },
  { label: 'Assepsia e Antissepsia',       query: 'Explique os princípios de assepsia e antissepsia no CC.' },
  { label: 'Infecção Hospitalar',          query: 'Quais os protocolos de prevenção de infecção hospitalar?' },
  { label: 'Estomias',                     query: 'Quais os cuidados de enfermagem com pacientes estomizados?' },
  { label: 'Nutrição Perioperatória',      query: 'Quais as recomendações de nutrição no perioperatório?' },
  { label: 'Cirurgia Segura',              query: 'O que é o protocolo de cirurgia segura da OMS?' },
];

export function Sidebar({ isOpen, onClose, onNewSession, toggleTheme, darkMode }: SidebarProps) {
  const fire = (query: string) => {
    window.dispatchEvent(new CustomEvent('suggestion-click', { detail: query }));
    onClose();
  };

  return (
    <aside
      className={`
        fixed md:static top-0 left-0
        w-[85vw] max-w-[320px] md:w-[19rem]
        m-0 md:my-6 md:ml-6 md:mr-1
        h-full md:h-[calc(100vh-3rem)]
        rounded-none md:rounded-[2rem]
        backdrop-blur-xl
        tutor-gradient-border
        z-50
        transform transition-all duration-300 ease-in-out
        ${isOpen ? 'translate-x-0' : '-translate-x-[110%]'} md:translate-x-0
        flex flex-col
        shadow-[0_15px_30px_rgba(0,0,0,0.15)] dark:shadow-[0_15px_30px_rgba(0,0,0,0.5)]
        overflow-hidden
      `}
      style={{ 
        paddingTop: 'env(safe-area-inset-top)',
        '--tutor-border-bg': darkMode ? '#06101e' : '#eaf3fc'
      } as React.CSSProperties}
    >
      {/* Botão fechar (mobile) */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 md:hidden text-white hover:text-white transition-colors z-50 bg-[#1060a5] dark:bg-[#0a2040] p-1.5 rounded-full border border-white/20 shadow-sm shrink-0 cursor-pointer"
      >
        <span className="material-symbols-outlined text-[18px]">close</span>
      </button>

      {/* Header - Centralizado */}
      <div className="w-full flex items-center justify-center gap-2 px-6 pt-12 pb-2 md:pt-8 md:pb-1 shrink-0">
        <span className="material-symbols-outlined text-[16px] text-[#1573C2] dark:text-blue-300 opacity-90">school</span>
        <h2 className="text-[#1573C2] dark:text-blue-100 text-[11px] font-bold tracking-[0.15em] uppercase opacity-100 drop-shadow-sm">
          Tópicos de Estudo
        </h2>
      </div>

      {/* Lista de tópicos */}
      <div className="w-full flex-1 overflow-y-auto flex flex-col justify-start px-4 py-2 gap-2 md:gap-3">
        {TOPICS.map((topic) => (
          <button
            key={topic.label}
            onClick={() => fire(topic.query)}
            className="
              w-full text-center text-[13px] font-semibold
              text-white
              tutor-gradient-border
              rounded-full px-4 py-2 md:py-2.5
              shadow-sm transition-all duration-200
              hover:shadow-md hover:-translate-y-[0.5px]
              active:scale-[0.98]
              cursor-pointer
              [--tutor-border-bg:#1573C2]
              hover:[--tutor-border-bg:#0d4a87]
            "
          >
            {topic.label}
          </button>
        ))}
      </div>

      {/* Ações Móveis na base do Sidebar - Apenas visível em mobile */}
      {toggleTheme && (
        <div 
          className="md:hidden w-full flex flex-col gap-2 p-4 bg-[#d0e4f7] dark:bg-[#040c16] border-t border-blue-300/40 dark:border-blue-900/30 shrink-0"
          style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
        >
          <button
            onClick={() => { onNewSession(); onClose(); }}
            className="w-full py-2.5 px-4 rounded-xl font-bold text-sm bg-[#1573C2] hover:bg-[#0d4a87] text-white flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">cleaning_services</span>
            Nova Conversa
          </button>
          
          <button
            onClick={toggleTheme}
            className="w-full py-2.5 px-4 rounded-xl font-bold text-sm bg-white/40 dark:bg-white/5 hover:bg-white/50 border border-blue-400/20 text-[#0d4a87] dark:text-blue-200 flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">
              {darkMode ? 'light_mode' : 'dark_mode'}
            </span>
            {darkMode ? 'Modo Claro' : 'Modo Escuro'}
          </button>
        </div>
      )}
    </aside>
  );
}
