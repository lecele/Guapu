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

function isSourceOnlyReference(reference: string): boolean {
  return /\([^\n]+\.(?:pdf|docx?)\)$/i.test(reference);
}

function isInsufficientOrRefusal(text: string): boolean {
  const normalized = text.replace(/\s+/g, ' ');
  return /(?:^|\s)(?:n[aã]o posso responder|n[aã]o encontrei.*(?:materiais|conte[uú]do|informa[cç][aã]o)|fora do escopo|informa[cç][aã]o n[aã]o dispon[ií]vel no artigo|n[aã]o (?:est[aá]|foi) detalhad[ao]|n[aã]o h[aá] informa[cç][aã]o suficiente)/i.test(normalized)
    || /(?:f[oó]rmula|informa[cç][aã]o).{0,120}(?:n[aã]o|sem).{0,120}(?:detalhad|dispon[ií]vel|encontrad)/i.test(normalized)
    || /n[aã]o (?:apresentam?|trazem?|cont[eê]m|possuem?).{0,120}(?:f[oó]rmula|tabela|dado|informa[cç][aã]o)/i.test(normalized)
    || /n[aã]o [eé] poss[ií]vel deduzir|dados? recuperados n[aã]o trazem/i.test(normalized);
}

const REFERENCE_STOPWORDS = new Set([
  'a', 'as', 'ao', 'aos', 'com', 'da', 'das', 'de', 'do', 'dos', 'e', 'em',
  'essa', 'esse', 'esta', 'este', 'na', 'nas', 'no', 'nos', 'o', 'os', 'para',
  'por', 'que', 'se', 'sem', 'sua', 'suas', 'um', 'uma', 'umas', 'uns', 'sobre',
]);

function hasMeaningfulOverlap(answer: string, reference: string): boolean {
  const words = (value: string) => new Set(
    value.toLocaleLowerCase('pt-BR')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .match(/[a-z]{4,}/g) ?? [],
  );
  const answerWords = words(answer);
  const referenceWords = [...words(reference)].filter((word) => !REFERENCE_STOPWORDS.has(word));
  return referenceWords.some((word) => answerWords.has(word));
}

function traceLocation(source?: string, metadata?: Record<string, unknown>): string {
  const sourceLabel = source?.trim();
  const driveFileId = typeof metadata?.drive_file_id === 'string' ? metadata.drive_file_id.trim() : '';
  // Só exibimos a trilha de arquivo quando o chunk está vinculado ao Drive.
  // Isso evita transformar um rótulo legado/desconhecido em uma referência
  // aparentemente oficial.
  if (!driveFileId) return '';
  const page = Number(metadata?.page_number);
  const chunk = Number(metadata?.chunk_index);
  const section = typeof metadata?.reference_section === 'string'
    ? metadata.reference_section.trim()
    : '';
  const location = [
    sourceLabel ? `Fonte: ${sourceLabel}` : null,
    Number.isFinite(page) && page > 0 ? `p. ${page}` : null,
    Number.isFinite(chunk) && chunk >= 0 ? `trecho ${chunk + 1}` : null,
    section ? section : null,
  ].filter(Boolean);
  return location.length > 0 ? ` [${location.join('; ')}]` : '';
}

function referenceFromContent(
  content?: string,
  metadata?: Record<string, unknown>,
): string {
  const storedTitle = typeof metadata?.reference_title === 'string' ? metadata.reference_title.trim() : '';
  const storedAuthor = typeof metadata?.reference_author === 'string' ? metadata.reference_author.trim() : '';
  const storedYear = typeof metadata?.reference_year === 'string' ? metadata.reference_year.trim() : '';
  const storedSection = typeof metadata?.reference_section === 'string' ? metadata.reference_section.trim() : '';
  if (storedTitle) {
    return [storedAuthor, storedYear ? `(${storedYear})` : '', `${storedTitle}${storedSection ? ` (${storedSection})` : ''}.`]
      .filter(Boolean).join(' ');
  }
  const text = (content || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';

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
    const chapterTitle = chapter[2].trim().replace(/[.:;]+$/, '');
    const ocrNoise = /\b(?:refer[eê]ncias|sum[aá]rio|[íi]ndice)\b/i.test(chapterTitle) || /^\d/.test(chapterTitle);
    if (!ocrNoise) {
      const number = chapter[1] ? ` (Cap. ${chapter[1]})` : '';
      return `${chapterTitle}${number}.`;
    }
  }

  // Alguns PDFs extraem título e autores em linhas separadas. Quando a linha
  // seguinte parece uma autoria, a linha anterior é uma pista bibliográfica
  // válida de camada 2 — sem consultar ou exibir o nome do arquivo.
  const lines = (content || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (let index = 0; index < lines.length - 1; index += 1) {
    const candidate = lines[index].replace(/^\[P[aá]g\.\s*\d+\]\s*/i, '').trim();
    const authorLine = lines[index + 1];
    const normalizedCandidate = candidate.replace(/[.:;]+$/, '').trim();
    if (
      /^(?:nome do estudante|nome do aluno|matr[ií]cula)$/i.test(normalizedCandidate) ||
      /^\d+\s*[-.)]/.test(normalizedCandidate) ||
      authorLine.includes('@')
    ) continue;
    const administrativeHeading = /\b(?:professor|hor[aá]rio|local|cronograma|avalia[cç][aã]o|m[oó]dulo|semestre|carga hor[aá]ria)\b/i.test(normalizedCandidate);
    const sentenceFragment = /\b(?:conforme|portanto|poder[aã]o|deve|devem|quando|durante|atrav[eé]s|consiste|compreende)\b/i.test(normalizedCandidate);
    const startsLikeTitle = /^[A-ZÀ-Ý]/.test(candidate);
    const looksLikeAuthor =
      authorLine.length <= 120 &&
      !/[.!?]/.test(authorLine) &&
      (/,/.test(authorLine) || /\b[A-ZÀ-Ý]{1,3}\b/.test(authorLine));
    if (
      candidate.length >= 12 &&
      candidate.length <= 180 &&
      startsLikeTitle &&
      !administrativeHeading &&
      !sentenceFragment &&
      looksLikeAuthor
    ) {
      return `${candidate.replace(/[.:;]+$/, '')}.`;
    }
  }

  // O nome do arquivo identifica a origem técnica do chunk, mas não é uma
  // referência bibliográfica. Se o trecho não trouxe uma pista verificável,
  // não exibimos uma bibliografia que o estudante não possa conferir.
  return '';
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
  const withoutModelReferences = removeModelReferences(text)
    .replace(/\[\s*\d+(?:\s*,\s*\d+)*\s*\]/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n[ \t]+\n/g, '\n\n')
    .trim();
  if (!enabled) return withoutModelReferences;
  if (!needsReferences(mode)) return withoutModelReferences;
  // Uma recusa ou fallback de conteúdo insuficiente não deve carregar
  // referências de trechos que só foram recuperados por aproximação.
  if (isInsufficientOrRefusal(text)) return withoutModelReferences;

  const extracted = docs.map((doc) => {
    const reference = referenceFromContent(doc.content, doc.metadata);
    return {
      reference,
      traced: `${reference}${traceLocation(doc.source, doc.metadata)}`,
    };
  });
  // A camada 3 só é permitida quando nenhum dos trechos trouxe pista
  // bibliográfica melhor. Nunca misture uma referência identificada com
  // rótulos de arquivo ou uma linha de fallback.
  const identified = extracted.filter((item) => item.reference && !isSourceOnlyReference(item.reference));
  const relevant = mode === 'info'
    ? identified.filter((item) => hasMeaningfulOverlap(withoutModelReferences, item.reference))
    : identified;
  if (relevant.length === 0) return withoutModelReferences;
  const sources = [...new Map(relevant.map((item) => [item.traced, item])).values()].slice(0, 5);
  const lines = sources.map((item) => `- ${item.traced}`);

  return `${withoutModelReferences}\n\n**Referências:**\n${lines.join('\n')}`.trim();
}
