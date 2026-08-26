import type { GenerationMode } from './session-flow';

export interface RetrievedSource {
  source: string;
}

const REFERENCE_HEADING = /(?:^|\n)\s*(?:\*\*)?refer[êe]ncias:?\*{0,2}\s*/i;
const CONTINUATION = /\n\s*\n(?=(?:\*{0,2})?(?:deseja|gostaria de|por favor|qual tema|quest[aã]o))/i;

function needsReferences(mode: GenerationMode): boolean {
  return ['resumo', 'resumo_aprofundar', 'resumo_reformular', 'info', 'livre'].includes(mode);
}

function sourceLabel(source: string): string {
  const decoded = decodeURIComponent(source)
    .replace(/\.(?:pdf|docx?|txt)$/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return decoded || 'Documento recuperado da base de conhecimento';
}

function removeModelReferences(text: string): string {
  const heading = text.match(REFERENCE_HEADING);
  if (!heading || heading.index === undefined) return text.trim();

  const before = text.slice(0, heading.index).trimEnd();
  const after = text.slice(heading.index + heading[0].length);
  const continuation = after.match(CONTINUATION);
  const tail = continuation?.index === undefined ? '' : after.slice(continuation.index).trim();
  return [before, tail].filter(Boolean).join('\n\n');
}

/**
 * Referências são montadas pela aplicação a partir dos mesmos documentos que
 * alimentaram o RAG. O modelo não escolhe nem inventa fontes.
 */
export function finalizeReferences(
  text: string,
  docs: RetrievedSource[],
  mode: GenerationMode,
): string {
  const withoutModelReferences = removeModelReferences(text);
  if (!needsReferences(mode)) return withoutModelReferences;

  const sources = [...new Set(docs.map((doc) => sourceLabel(doc.source)))].slice(0, 5);
  const lines = sources.length > 0
    ? sources.map((source) => `- Referência: ${source}`)
    : ['- Referência: Informação não disponível no artigo, consultar o Plano de Ensino ou docentes.'];

  return `${withoutModelReferences}\n\n**Referências:**\n${lines.join('\n')}`.trim();
}
