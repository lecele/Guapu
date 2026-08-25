import { FileText } from 'lucide-react';

interface SourceBadgesProps {
  sourcesFound: number;
  hasContext: boolean;
}

/**
 * Renderiza os badges de rastreabilidade acadêmica.
 * Focado 100% no estudante de enfermagem, omitindo dados técnicos (ex: milissegundos).
 */
export function SourceBadges({ sourcesFound, hasContext }: SourceBadgesProps) {
  if (!hasContext || sourcesFound < 1) return null;

  return (
    <div className="guapu-source-badge" aria-label={`Resposta baseada em ${sourcesFound} trechos dos materiais`}>
      <FileText size={14} strokeWidth={1.8} aria-hidden="true" />
      <span>{sourcesFound} {sourcesFound === 1 ? 'trecho consultado' : 'trechos consultados'}</span>
    </div>
  );
}
