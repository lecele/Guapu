import type { GenerationMode } from './session-flow';

export interface RetrievedSource {
  source: string;
  content?: string;
}

const REFERENCE_HEADING = /(?:^|\n)\s*(?:\*\*)?refer[êe]ncias:?\*{0,2}\s*/i;
const CONTINUATION = /\n\s*\n(?=(?:\*{0,2})?(?:deseja|gostaria de|por favor|qual tema|quest[aã]o))/i;

function needsReferences(mode: GenerationMode): boolean {
  return ['resumo', 'resumo_aprofundar', 'resumo_reformular', 'info', 'livre'].includes(mode);
}

function referenceFromContent(content?: string): string {
  const text = (content || '').replace(/\s+/g, ' ').trim();
  if (!text) return 'Informação não disponível no artigo, consultar o Plano de Ensino ou docentes.';

  const bibliographic = text.match(/\b([A-ZÀ-Ý][A-Za-zÀ-ÿ'’.-]+(?:\s+(?:[A-ZÀ-Ý][A-Za-zÀ-ÿ'’.-]+|de|da|do|dos|das)){0,5})\s*\(?((?:19|20)\d{2})\)?\.\s*([^.!?]{12,160})(?:\.|$)/);
  const page = text.match(/\b(?:p\.?|p[aá]gina(?:s)?)\s*(\d+(?:\s*(?:-|–|a)\s*\d+)?)/i);

  const parts = [
    bibliographic?.[1]?.trim(),
    bibliographic?.[2] ? `(${bibliographic[2]})` : undefined,
    bibliographic?.[3] ? `${bibliographic[3].replace(/^(?:cap[ií]tulo|t[ií]tulo)\s*[:.-]?\s*/i, '').trim()}.` : undefined,
    page?.[1] ? `p. ${page[1]}.` : undefined,
  ].filter(Boolean);

  return parts.length >= 2
    ? parts.join(' ').replace(/\s+\./g, '.')
    : 'Informação não disponível no artigo, consultar o Plano de Ensino ou docentes.';
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

  const sources = [...new Set(docs.map((doc) => referenceFromContent(doc.content)))].slice(0, 5);
  const lines = sources.length > 0
    ? sources.map((source) => `- ${source}`)
    : ['- Informação não disponível no artigo, consultar o Plano de Ensino ou docentes.'];

  return `${withoutModelReferences}\n\n**Referências:**\n${lines.join('\n')}`.trim();
}
