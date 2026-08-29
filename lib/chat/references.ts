import type { GenerationMode } from './session-flow';

export interface RetrievedSource {
  source: string;
  content?: string;
  metadata?: Record<string, unknown>;
}

const REFERENCE_HEADING = /(?:^|\n)\s*(?:\*\*)?refer[êe]ncias:?\*{0,2}\s*/i;
const CONTINUATION = /\n\s*\n(?=(?:\*{0,2})?(?:deseja|gostaria de|por favor|qual tema|quest[aã]o))/i;

/**
 * Termos do mecanismo interno de recuperação nunca devem aparecer para o
 * estudante, mesmo quando o modelo ignora a instrução correspondente.
 */
export function sanitizeStudentFacingText(text: string): string {
  return text
    .replace(/\b(?:materiais|documentos)\s+RAG\b/gi, 'materiais da disciplina')
    .replace(/\bbase\s+RAG\b/gi, 'materiais da disciplina')
    .replace(/\bcontexto\s+RAG\b/gi, 'materiais da disciplina disponíveis')
    .replace(/\bcontexto\s+recuperado\b/gi, 'materiais da disciplina disponíveis')
    .replace(/\btrechos?\s+RAG\b/gi, 'materiais consultados')
    .replace(/\btrechos?\s+recuperados?\b/gi, 'materiais consultados')
    .replace(/\bchunks?\b/gi, 'materiais consultados')
    .replace(/\bretrieval\b/gi, 'busca nos materiais')
    .replace(/\bRAG\b/gi, 'materiais da disciplina')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

/**
 * Informações administrativas sem confirmação no plano não devem ser
 * apresentadas como uma resposta longa gerada pelo modelo. Esse detector é
 * deliberadamente restrito ao modo Informações e exige linguagem explícita
 * de ausência, para não cortar explicações clínicas legítimas.
 */
export function isLikelyInfoInsufficient(question: string, answer: string): boolean {
  const asksAdministrativeFact = /\b(?:aula|aulas|atividade|atividades|dia|data|cronograma|hor[aá]rio|hor[aá]rios|professor|professores|docente|docentes|avalia[cç][aã]o|nota|notas|peso|pesos|frequ[eê]ncia|trabalho|trabalhos|plano|conte[uú]do program[aá]tico)\b/i.test(question);
  if (!asksAdministrativeFact) return false;

  const absence = /\b(?:n[aã]o\s+const(?:a|am)|n[aã]o\s+h[aá]|n[aã]o\s+existe(?:m)?|n[aã]o\s+foi\s+encontrad[ao]s?|n[aã]o\s+localiz(?:ei|amos)|n[aã]o\s+encontr(?:ei|amos)|n[aã]o\s+est[aá]\s+dispon[ií]vel|n[aã]o\s+foi\s+poss[ií]vel\s+(?:confirmar|localizar|identificar)|sem\s+registro)\b/i.test(answer);
  const guidance = /\b(?:Moodle|plano de ensino|consult(?:e|ar)|confirmar|comunicado|docente)/i.test(answer);
  return absence && guidance;
}

function needsReferences(mode: GenerationMode): boolean {
  return ['resumo', 'resumo_aprofundar', 'resumo_reformular', 'info', 'livre'].includes(mode);
}

function allowsReferenceFallback(mode: GenerationMode): boolean {
  return ['resumo', 'resumo_aprofundar', 'resumo_reformular', 'livre'].includes(mode);
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
  'cuidado', 'cuidados', 'enfermagem', 'paciente', 'pacientes', 'procedimento',
  'procedimentos', 'cirurgico', 'cirurgicos', 'cirurgica', 'cirurgicas',
  'material', 'materiais', 'conteudo', 'disciplina', 'fase',
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
  const matches = referenceWords.filter((word) => [...answerWords].some((answerWord) => (
    answerWord === word || (
      answerWord.length >= 8 &&
      word.length >= 8 &&
      answerWord.slice(0, 8) === word.slice(0, 8)
    )
  )));
  return matches.some((word) => word.length >= 7) || matches.length >= 2;
}

function normalizeReferenceText(value: string): string {
  return value
    .toLocaleLowerCase('pt-BR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function isRepeatedTokenNoise(value: string): boolean {
  const tokens = normalizeReferenceText(value).split(/\s+/).filter(Boolean);
  if (tokens.length < 3) return false;
  const unique = new Set(tokens);
  return unique.size <= 2 && tokens.length / unique.size >= 2;
}

function isLikelyTitle(value: string): boolean {
  const candidate = value.replace(/[*_#]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (candidate.length < 8 || candidate.length > 180) return false;
  if (isRepeatedTokenNoise(candidate)) return false;
  if (/^\d+(?:\s+\d+)+/.test(candidate)) return false;
  if (/;/.test(candidate)) return false;
  if (/\b(?:refer[eê]ncias|sum[aá]rio|[íi]ndice)\b/i.test(candidate)) return false;
  if (/\b(?:conforme|portanto|poder[aã]o|deve|devem|quando|durante|atrav[eé]s|consiste|compreende)\b/i.test(candidate)) return false;
  if (/[.!?]$/.test(candidate)) return false;
  return /^[A-ZÀ-Ý]/.test(candidate);
}

function isTableLabel(value: string): boolean {
  return new Set([
    'critico', 'semicritico', 'nao critico', 'pre limpeza', 'limpeza', 'enxague',
  ]).has(normalizeReferenceText(value));
}

function hasNearbyTableNoise(lines: string[], index: number): boolean {
  const window = lines.slice(Math.max(0, index - 3), index + 4);
  const repeatedRows = window.filter((line) => isRepeatedTokenNoise(line)).length;
  const tableMarkers = window.filter((line) => /\|/.test(line) || /\bquadro\b/i.test(line)).length;
  return repeatedRows > 0 || tableMarkers > 0;
}

function hasTableStructure(lines: string[]): boolean {
  const hasTableMarker = lines.some((line) => /\bquadro\b/i.test(line) || /\|/.test(line));
  const repeatedRows = lines.filter((line) => isRepeatedTokenNoise(line)).length;
  return hasTableMarker && repeatedRows > 0;
}

function appearsInContent(content: string, value: string): boolean {
  const needle = normalizeReferenceText(value);
  if (!needle) return false;
  return normalizeReferenceText(content).includes(needle);
}

function isLikelyAuthorLine(value: string): boolean {
  const line = value.replace(/\s+/g, ' ').trim();
  if (!line || line.length > 120 || /[;:!?]/.test(line) || /\d/.test(line)) return false;
  const groups = line.split(/,\s*/);
  return groups.every((group) => {
    const tokens = group.split(/\s+/).filter(Boolean);
    if (tokens.length === 0 || tokens.length > 6) return false;
    return tokens.every((token, index) => {
      if (index > 0 && /^(?:de|da|do|das|dos|e)$/i.test(token)) return true;
      return index === 0
        ? /^[A-ZÀ-Ý][A-Za-zÀ-ÿ'’.-]+$/.test(token)
        : /^[A-ZÀ-Ý]{1,3}\.?$/.test(token);
    });
  });
}

function referenceFromContent(
  content?: string,
  metadata?: Record<string, unknown>,
): string {
  const storedTitle = typeof metadata?.reference_title === 'string' ? metadata.reference_title.trim() : '';
  const storedAuthor = typeof metadata?.reference_author === 'string' ? metadata.reference_author.trim() : '';
  const storedYear = typeof metadata?.reference_year === 'string' ? metadata.reference_year.trim() : '';
  const storedSection = typeof metadata?.reference_section === 'string' ? metadata.reference_section.trim() : '';
  const rawContent = content || '';
  if (storedTitle && appearsInContent(rawContent, storedTitle) && isLikelyTitle(storedTitle)) {
    const author = storedAuthor && appearsInContent(rawContent, storedAuthor) ? storedAuthor : '';
    const year = storedYear && appearsInContent(rawContent, storedYear) ? `(${storedYear})` : '';
    const section = storedSection && appearsInContent(rawContent, storedSection) ? ` (${storedSection})` : '';
    return [author, year, `${storedTitle}${section}.`]
      .filter(Boolean).join(' ');
  }
  const text = rawContent.replace(/\s+/g, ' ').trim();
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
    if (isLikelyTitle(chapterTitle)) {
      const number = chapter[1] ? ` (Cap. ${chapter[1]})` : '';
      return `${chapterTitle}${number}.`;
    }
  }

  // Alguns PDFs extraem título e autores em linhas separadas. Quando a linha
  // seguinte parece uma autoria, a linha anterior é uma pista bibliográfica
  // válida de camada 2 — sem consultar ou exibir o nome do arquivo.
  const lines = rawContent.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const tableContent = hasTableStructure(lines);

  // Cabeçalhos podem aparecer sozinhos no início do chunk, sem autor na linha
  // seguinte. Aceitamos apenas uma linha curta e identificável; rótulos
  // isolados de tabelas são descartados mesmo que comecem em maiúscula.
  for (let index = 0; index < lines.length; index += 1) {
    const candidate = lines[index].replace(/^\[P[aá]g\.\s*\d+\]\s*/i, '').trim();
    if (!isLikelyTitle(candidate)) continue;
    const next = lines[index + 1];
    const explicitHeading = /^(?:cap[ií]tulo|cap\.|se[cç][aã]o|unidade|m[oó]dulo|fase|parte)\b/i.test(candidate);
    if (tableContent && !explicitHeading) continue;
    const wrapsHeading = next
      && /\b(?:de|da|do|das|dos|em|no|na)\s*$/i.test(candidate)
      && isLikelyTitle(next)
      && !isTableLabel(next)
      && !hasNearbyTableNoise(lines, index);
    if (wrapsHeading) return `${candidate} ${next}`.replace(/[.:;]+$/, '') + '.';
    if (explicitHeading) {
      return `${candidate.replace(/[.:;]+$/, '')}.`;
    }
  }

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
    const startsLikeTitle = isLikelyTitle(candidate);
    const looksLikeAuthor = isLikelyAuthorLine(authorLine);
    if (
      candidate.length >= 12 &&
      candidate.length <= 180 &&
      startsLikeTitle &&
      !(tableContent && !/^(?:cap[ií]tulo|cap\.|se[cç][aã]o|unidade|m[oó]dulo|fase|parte)\b/i.test(candidate)) &&
      !(isTableLabel(normalizedCandidate) && hasNearbyTableNoise(lines, index)) &&
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
  relevanceText = text,
): string {
  const withoutModelReferences = sanitizeStudentFacingText(removeModelReferences(text)
    .replace(/\[\s*\d+(?:\s*,\s*\d+)*\s*\]/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n[ \t]+\n/g, '\n\n')
    .trim());
  if (!enabled) return withoutModelReferences;
  if (!needsReferences(mode)) return withoutModelReferences;
  // Uma recusa ou fallback de conteúdo insuficiente não deve carregar
  // referências de trechos que só foram recuperados por aproximação.
  if (isInsufficientOrRefusal(text)) return withoutModelReferences;

  const extracted = docs.map((doc) => {
    const reference = referenceFromContent(doc.content, doc.metadata);
    return {
      reference,
    };
  });
  // A camada 3 só é permitida quando nenhum dos trechos trouxe pista
  // bibliográfica melhor. Nunca misture uma referência identificada com
  // rótulos de arquivo ou uma linha de fallback.
  const identified = extracted.filter((item) => item.reference && !isSourceOnlyReference(item.reference));
  const relevant = identified.filter((item) => hasMeaningfulOverlap(
    `${relevanceText}\n${withoutModelReferences}`,
    item.reference,
  ));
  if (relevant.length === 0) {
    // O fallback é uma referência válida quando houve uso efetivo dos
    // materiais, mas nenhum trecho trouxe título, capítulo, autoria ou outro
    // identificador bibliográfico verificável. Ele não deve aparecer em
    // recusa, conteúdo insuficiente, quiz ou Informações da disciplina.
    if (allowsReferenceFallback(mode) && docs.some((doc) => Boolean(doc.content?.trim()))) {
      return `${withoutModelReferences}\n\n**Referências:**\n- Informação não disponível no artigo, consultar o Plano de Ensino ou docentes.`.trim();
    }
    return withoutModelReferences;
  }
  const sources = [...new Map(relevant.map((item) => [normalizeReferenceText(item.reference), item])).values()].slice(0, 5);
  const lines = sources.map((item) => `- ${item.reference}`);

  return `${withoutModelReferences}\n\n**Referências:**\n${lines.join('\n')}`.trim();
}
