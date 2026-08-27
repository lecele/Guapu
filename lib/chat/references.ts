import type { GenerationMode } from './session-flow';

export interface RetrievedSource {
  source: string;
  content?: string;
  metadata?: Record<string, unknown>;
}

const REFERENCE_HEADING = /(?:^|\n)\s*(?:\*\*)?refer[êe]ncias:?\*{0,2}\s*/i;
const CONTINUATION = /\n\s*\n(?=(?:\*{0,2})?(?:deseja|gostaria de|por favor|qual tema|quest[aã]o))/i;

function needsReferences(mode: GenerationMode): boolean {
  return ['resumo', 'resumo_aprofundar', 'resumo_reformular', 'info', 'livre'].includes(mode);
}

function referenceFromContent(content?: string, metadata?: Record<string, unknown>): string {
  const storedTitle = typeof metadata?.reference_title === 'string' ? metadata.reference_title.trim() : '';
  const storedAuthor = typeof metadata?.reference_author === 'string' ? metadata.reference_author.trim() : '';
  const storedYear = typeof metadata?.reference_year === 'string' ? metadata.reference_year.trim() : '';
  const storedSection = typeof metadata?.reference_section === 'string' ? metadata.reference_section.trim() : '';
  if (storedTitle) {
    return [storedAuthor, storedYear ? `(${storedYear})` : '', `${storedTitle}${storedSection ? ` (${storedSection})` : ''}.`]
      .filter(Boolean).join(' ');
  }
  const text = (content || '').replace(/\s+/g, ' ').trim();
  if (!text) return 'Informação não disponível no artigo, consultar o Plano de Ensino ou docentes.';

  const bibliographic = text.match(/\b([A-ZÀ-Ý][A-Za-zÀ-ÿ'’.-]+(?:\s+(?:[A-ZÀ-Ý][A-Za-zÀ-ÿ'’.-]+|de|da|do|dos|das)){0,5})\s*\(?((?:19|20)\d{2})\)?\.\s*([^.!?]{12,160})(?:\.|$)/);
  const page = text.match(/\b(?:p\.?|p[aá]gina(?:s)?)\s*(\d+(?:\s*(?:-|–|a)\s*\d+)?)/i);
  const chapter = text.match(/\b(?:cap[ií]tulo|cap\.)\s*(\d+)?\s*[-—–:.]?\s*([^.!?]{8,140})/i);

  const parts = [
    bibliographic?.[1]?.trim(),
    bibliographic?.[2] ? `(${bibliographic[2]})` : undefined,
    bibliographic?.[3] ? `${bibliographic[3].replace(/^(?:cap[ií]tulo|t[ií]tulo)\s*[:.-]?\s*/i, '').trim()}.` : undefined,
    page?.[1] ? `p. ${page[1]}.` : undefined,
  ].filter(Boolean);

  if (parts.length >= 2) {
    return parts.join(' ').replace(/\s+\./g, '.');
  }

  // Camada 2: uma seção ou capítulo identificado no próprio trecho ainda é
  // uma referência útil. Nunca recorremos ao nome do arquivo.
  if (chapter?.[2]) {
    const number = chapter[1] ? ` (Cap. ${chapter[1]})` : '';
    return `${chapter[2].trim().replace(/[.:;]+$/, '')}${number}.`;
  }

  // Alguns PDFs extraem título e autores em linhas separadas. Quando a linha
  // seguinte parece uma autoria, a linha anterior é uma pista bibliográfica
  // válida de camada 2 — sem consultar ou exibir o nome do arquivo.
  const lines = (content || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (let index = 0; index < lines.length - 1; index += 1) {
    const candidate = lines[index].replace(/^\[P[aá]g\.\s*\d+\]\s*/i, '').trim();
    const authorLine = lines[index + 1];
    const looksLikeAuthor = /^[A-ZÀ-Ý][A-Za-zÀ-ÿ'’.-]+(?:\s+[A-ZÀ-Ý]{1,4}[A-Za-zÀ-ÿ'’.-]*)*(?:\s*,\s*|\s+e\s+|\s+[A-ZÀ-Ý][A-Za-zÀ-ÿ'’.-]+){1,}/.test(authorLine);
    if (candidate.length >= 12 && candidate.length <= 180 && looksLikeAuthor) {
      return `${candidate.replace(/[.:;]+$/, '')}.`;
    }
  }

  return 'Informação não disponível no artigo, consultar o Plano de Ensino ou docentes.';
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
  enabled = true,
): string {
  const withoutModelReferences = removeModelReferences(text);
  if (!enabled) return withoutModelReferences;
  if (!needsReferences(mode)) return withoutModelReferences;

  const fallback = 'Informação não disponível no artigo, consultar o Plano de Ensino ou docentes.';
  const extracted = [...new Set(docs.map((doc) => referenceFromContent(doc.content, doc.metadata)))];
  // A camada 3 só é permitida quando nenhum dos trechos trouxe pista útil.
  // Nunca misture uma referência identificada com uma linha de fallback.
  const sources = extracted.some((source) => source !== fallback)
    ? extracted.filter((source) => source !== fallback).slice(0, 5)
    : extracted.slice(0, 1);
  const lines = sources.length > 0
    ? sources.map((source) => `- ${source}`)
    : [`- ${fallback}`];

  return `${withoutModelReferences}\n\n**Referências:**\n${lines.join('\n')}`.trim();
}
