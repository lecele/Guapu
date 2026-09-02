import type { GenerationMode } from './session-flow';

export interface RetrievedSource {
  source: string;
  content?: string;
  similarity?: number;
  metadata?: Record<string, unknown>;
}

// Um cabecalho de secao e uma linha cujo unico conteudo e a palavra
// "Referencias" (com ou sem asteriscos/dois-pontos) ou que abre imediatamente
// uma lista. Uma frase em prosa que apenas comeca com essa palavra — por
// exemplo "Referencias bibliograficas basicas estao no Moodle", presente no
// proprio Plano de Ensino — NAO e um cabecalho e nao pode truncar a resposta.
const REFERENCE_HEADING_CANDIDATE = /(?:^|\n)([ \t]*(?:\*{1,2})?[ \t]*refer[êe]ncias\b[ \t]*(:?)[ \t]*(?:\*{1,2})?[ \t]*)([^\n]*)/gi;
const REFERENCE_LIST_START = /^(?:[-•*–—]|\d+[.)])\s*/;
const CONTINUATION = /\n\s*\n(?=(?:\*{0,2})?(?:deseja|gostaria de|por favor|qual tema|quest[aã]o))/i;
// Pergunta de encerramento que a aplicacao (ou o modelo) coloca ao final. O
// cliente especifica a ordem conteudo -> **Referencias** -> pergunta, entao ela
// e destacada antes de anexar a secao e recolocada depois.
// O modelo nem sempre coloca a pergunta de encerramento em linha própria:
// em produção (02/09/2026) ela veio emendada ao fim do último parágrafo, e a
// seção de Referências acabou depois dela. Reconhecemos as duas formas — a
// linha própria e a última frase do texto.
const CLOSING_QUESTION = /(?:(?:^|\n)[ \t]*|(?<=[.!?])[ \t]+)((?:\*{0,2})(?:deseja|gostaria)\b[^\n?]*\?[ \t]*(?:\*{0,2}))[ \t]*$/i;

/**
 * Termos do mecanismo interno de recuperação nunca devem aparecer para o
 * estudante, mesmo quando o modelo ignora a instrução correspondente.
 */
export function sanitizeStudentFacingText(text: string): string {
  return text
    .replace(/\s*\((?:materiais consultados|fontes consultadas)\s*\d*\)/gi, '')
    .replace(/\s*\[(?:materiais consultados|fontes consultadas)\s*\d*\]/gi, '')
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

  // Não usar `\b` ao fim de termos acentuados (como "há"): em JavaScript
  // o limite de palavra não considera caracteres Unicode acentuados como
  // `\w`, fazendo a detecção falhar justamente no texto mais comum do modelo.
  const absence = /(?:^|\s)(?:n[aã]o\s+const(?:a|am)|n[aã]o\s+h[aá]|n[aã]o\s+existe(?:m)?|n[aã]o\s+foi\s+encontrad[ao]s?|n[aã]o\s+localiz(?:ei|amos)|n[aã]o\s+encontr(?:ei|amos)|n[aã]o\s+est[aá]\s+dispon[ií]vel|n[aã]o\s+foi\s+poss[ií]vel\s+(?:confirmar|localizar|identificar)|sem\s+registro)(?=\s|[.,;:!?)]|$)/i.test(answer);
  const guidance = /\b(?:Moodle|plano de ensino|consult(?:e|ar)|confirmar|comunicado|docente)/i.test(answer);
  return absence && guidance;
}

// O cliente pede dedupe por documento e uma lista enxuta. Com 5 trechos
// recuperados, publicar 5 obras transformava a seção em uma bibliografia do
// acervo em vez da evidência da resposta.
const MAX_REFERENCES = 3;

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
  // A v1.5.0 criou a mensagem "fora do escopo da disciplina" (Prompt 01, 3.2),
  // que nao usa nenhuma das expressoes da recusa por guardrail. Recusa, fora de
  // escopo e conteudo insuficiente nunca podem levar secao de Referencias.
  return /(?:^|\s)(?:n[aã]o posso responder|n[aã]o encontrei.*(?:materiais|conte[uú]do|informa[cç][aã]o)|fora do escopo|foge ao escopo|n[aã]o (?:consta|constam|faz parte|fazem parte|pertence|pertencem)\s+(?:d[oa]s?\s+)?(?:plano de ensino|escopo|ementa|conte[uú]do program[aá]tico|disciplina)|informa[cç][aã]o n[aã]o dispon[ií]vel no artigo|n[aã]o (?:est[aá]|foi) detalhad[ao]|n[aã]o h[aá] informa[cç][aã]o suficiente)/i.test(normalized)
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
  // Vocabulario onipresente no acervo desta disciplina: compartilhar uma
  // destas palavras com a pergunta nao e evidencia de que a obra foi usada.
  'cirurgia', 'cirurgias', 'hospital', 'hospitalar', 'hospitalares', 'saude',
  'livro', 'livros', 'apostila', 'tratado', 'manual', 'edicao', 'volume',
  'revista', 'journal',
]);

function meaningfulOverlapCount(answer: string, reference: string): number {
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
      answerWord.length >= 6 &&
      word.length >= 6 &&
      answerWord.slice(0, 5) === word.slice(0, 5)
    )
  )));
  return matches.filter((word) => word.length >= 6).length;
}

function hasMeaningfulOverlap(answer: string, reference: string): boolean {
  return meaningfulOverlapCount(answer, reference) > 0;
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

/**
 * Índices remissivos e quadros OCR podem conter vários títulos iniciados por
 * maiúscula. Eles não são identidade bibliográfica nem evidência da resposta
 * e não devem virar referências só porque o híbrido os ranqueou alto.
 */
function isLikelyStructuredNoise(content?: string): boolean {
  const lines = (content || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 3) return false;
  const text = lines.join(' ');
  const numericTailLines = lines.filter((line) => /\s\d{1,4}(?:\s*[,;]\s*\d{1,4})*\s*$/.test(line)).length;
  const shortLines = lines.filter((line) => line.split(/\s+/).length <= 8).length;
  const looksLikeIndex = numericTailLines >= 4 && shortLines / lines.length >= 0.55;
  const looksLikeTable = /\b(?:classifica[cç][aã]o|descri[cç][aã]o|dura[cç][aã]o do ato|tipo de cirurgia)\b/i.test(text)
    && lines.filter((line) => /\d/.test(line)).length >= 2;
  return looksLikeIndex || looksLikeTable;
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

function isVerifiedCatalogReference(metadata?: Record<string, unknown>): boolean {
  return metadata?.reference_source === 'catalog'
    && metadata?.reference_verified === true
    && typeof metadata.reference_title === 'string'
    && metadata.reference_title.trim().length > 0;
}

function documentIdentity(doc: RetrievedSource): string {
  const driveFileId = typeof doc.metadata?.drive_file_id === 'string'
    ? doc.metadata.drive_file_id.trim()
    : '';
  if (driveFileId) return `drive:${driveFileId}`;
  return `source:${normalizeReferenceText(doc.source)}`;
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
  // O catálogo é uma identidade bibliográfica curada e vinculada ao
  // drive_file_id. Ela foi conferida no documento e, por isso, continua
  // válida mesmo quando o chunk clínico não repete a folha de rosto.
  // Identidades catalogadas foram conferidas antes de serem gravadas. Notas
  // técnicas oficiais podem ter títulos longos e ainda assim são referências
  // bibliográficas válidas; não reaplicar o heurístico de título aqui.
  if (isVerifiedCatalogReference(metadata) && storedTitle.length > 0) {
    // Citação ABNT curada: usada literalmente, sem remontagem. É o que garante
    // "sempre a mesma estrutura, em qualquer modalidade, independentemente do
    // modelo em uso" (Prompt 01, seção 4, item 8).
    const abnt = typeof metadata?.reference_abnt === 'string' ? metadata.reference_abnt.trim() : '';
    if (abnt) {
      const abntPage = Number(metadata?.page_number);
      const withPeriod = abnt.replace(/\s*$/, '').replace(/([^.])$/, '$1.');
      return Number.isFinite(abntPage) && abntPage > 0 ? `${withPeriod} p. ${abntPage}.` : withPeriod;
    }
    const edition = typeof metadata?.reference_edition === 'string' ? metadata.reference_edition.trim() : '';
    const publisher = typeof metadata?.reference_publisher === 'string' ? metadata.reference_publisher.trim() : '';
    const page = Number(metadata?.page_number);
    const period = (value: string) => value.replace(/[.]+$/, '') + '.';
    const titleAlreadyContainsYear = Boolean(
      storedYear && new RegExp(`(?:^|\\D)${storedYear.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}(?:$|\\D)`).test(storedTitle),
    );
    const author = storedAuthor && storedYear
      ? `${storedAuthor.replace(/[.]+$/, '')} (${storedYear}).`
      : storedAuthor
        ? period(storedAuthor)
        : '';
    const yearAfterTitle = !storedAuthor && storedYear && !titleAlreadyContainsYear
      ? `(${storedYear}).`
      : '';
    return [
      author,
      period(storedTitle),
      yearAfterTitle,
      edition ? period(edition) : '',
      publisher ? period(publisher) : '',
      Number.isFinite(page) && page > 0 ? `p. ${page}.` : '',
    ].filter(Boolean).join(' ').replace(/\s+\./g, '.');
  }
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

/**
 * Localiza um cabeçalho de seção de referências escrito pelo modelo. Só conta
 * como cabeçalho a linha cujo restante está vazio, abre uma lista ou usa
 * dois-pontos. Uma frase de prosa iniciada por "Referências" é preservada —
 * antes, ela apagava silenciosamente todo o texto seguinte da resposta.
 */
function findModelReferenceHeading(text: string): { index: number; length: number } | null {
  let found: { index: number; length: number } | null = null;
  for (const match of text.matchAll(REFERENCE_HEADING_CANDIDATE)) {
    if (match.index === undefined) continue;
    const [full, headPart, colon, rest] = match;
    const trimmedRest = (rest || '').trim();
    const isHeading = Boolean(colon) || trimmedRest === '' || REFERENCE_LIST_START.test(trimmedRest);
    if (!isHeading) continue;
    // A última ocorrência é a seção final; ocorrências anteriores costumam ser
    // citações do próprio material.
    found = { index: match.index + (full.startsWith('\n') ? 1 : 0), length: headPart.length };
  }
  return found;
}

function removeModelReferences(text: string): string {
  const heading = findModelReferenceHeading(text);
  if (!heading) return text.trim();

  const before = text.slice(0, heading.index).trimEnd();
  const after = text.slice(heading.index + heading.length);
  const continuation = after.match(CONTINUATION);
  const tail = continuation?.index === undefined ? '' : after.slice(continuation.index).trim();
  return [before, tail].filter(Boolean).join('\n\n');
}

/**
 * Marcadores de citação herdados da fonte (regra 9 do cliente). Listas com mais
 * de um elemento são sempre notas de rodapé. Um colchete com um único número é
 * ambíguo: `[2]` depois de uma palavra é nota de rodapé, mas `de [0] a [10]` é
 * um intervalo numérico do próprio conteúdo clínico e não pode ser apagado.
 */
const CITATION_LIST = /\[\s*\d+(?:\s*(?:[.,;:]\s*|\s+)(?:\d+(?:\.\d+)*|p\.?\s*\d+))+\s*\]/gi;
const SINGLE_MARKER = /\[\s*\d{1,3}\s*\]/g;
const NUMERIC_RANGE_LEAD = /(?:^|[^\p{L}])(?:de|desde|entre|at[eé]|entre|a|e|ou|em|com|por|nos|nas|no|na)\s*$/iu;

function stripInheritedCitationMarkers(text: string): string {
  return text
    .replace(CITATION_LIST, '')
    .replace(SINGLE_MARKER, (marker, offset: number, whole: string) => {
      const before = whole.slice(0, offset);
      const after = whole.slice(offset + marker.length);
      // "de [0] a [10]", "entre [2] e [4]": valores, não citações.
      if (NUMERIC_RANGE_LEAD.test(before)) return marker;
      if (/^\s*(?:a|at[eé]|e|ou|-|–|—)\s*\[\s*\d/.test(after)) return marker;
      // Uma nota de rodapé se apoia no texto que a precede.
      if (!/[\p{L}\p{N}"'”’)\]]\s?$/u.test(before)) return marker;
      return '';
    });
}

/**
 * Separa a pergunta de encerramento do corpo da resposta para que a seção
 * `**Referências**` fique antes dela, conforme os Exemplos A e H do Prompt 03.
 */
function splitClosingQuestion(text: string): { body: string; closing: string } {
  const match = text.match(CLOSING_QUESTION);
  if (!match || match.index === undefined) return { body: text, closing: '' };
  return {
    body: text.slice(0, match.index).trimEnd(),
    closing: match[1].trim(),
  };
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
  const withoutModelReferences = sanitizeStudentFacingText(
    stripInheritedCitationMarkers(removeModelReferences(text))
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
      source: doc.source,
      content: doc.content || '',
      structuredNoise: isLikelyStructuredNoise(doc.content),
      documentQuestionMatch: meaningfulOverlapCount(relevanceText, doc.content || '') > 0,
      similarity: Number(doc.similarity ?? 0),
      key: isVerifiedCatalogReference(doc.metadata)
        ? String(doc.metadata?.reference_key || doc.metadata?.drive_file_id || reference)
        : normalizeReferenceText(reference),
      catalog: isVerifiedCatalogReference(doc.metadata),
    };
  });
  // Um catálogo verificado só pode ser promovido automaticamente quando toda
  // a recuperação pertence ao mesmo documento. Se a busca misturar fontes,
  // a referência precisa ter relação textual com a pergunta/resposta; isso
  // impede que um livro apenas parecido seja citado em uma resposta baseada
  // no plano administrativo.
  const singleDocumentScope = new Set(docs.map(documentIdentity)).size === 1;
  const sourceScopeMarker = '__SOURCE_SCOPE__';
  const sourceScopeStart = relevanceText.indexOf(sourceScopeMarker);
  const explicitSourceScope = sourceScopeStart >= 0
    ? relevanceText.slice(sourceScopeStart + sourceScopeMarker.length).replace(/__$/u, '')
    : '';
  // O banco compara a fonte sem diferenciar maiúsculas (migrações 023/041).
  // Comparar de forma sensível a caixa aqui zeraria as referências em silêncio.
  const scopedExtracted = explicitSourceScope
    ? extracted.filter((item) => (
      item.source.toLocaleLowerCase('pt-BR') === explicitSourceScope.toLocaleLowerCase('pt-BR')
    ))
    : extracted;
  // A camada 3 só é permitida quando nenhum dos trechos trouxe pista
  // bibliográfica melhor. Nunca misture uma referência identificada com
  // rótulos de arquivo ou uma linha de fallback.
  const identified = scopedExtracted.filter((item) => item.reference && !isSourceOnlyReference(item.reference) && !item.structuredNoise);

  // Evidência de uso: quantas pistas distintivas do trecho reaparecem na
  // resposta efetivamente gerada. Uma obra recuperada por aproximação, que o
  // texto final não usou, tem pontuação muito abaixo da obra que sustentou a
  // explicação. O limiar é relativo ao melhor trecho da própria recuperação;
  // quando nenhum trecho pontua (resposta muito curta, sem sinal), o portão é
  // neutro e a decisão volta para os critérios textuais abaixo.
  const scored = identified.map((item) => ({
    ...item,
    useScore: meaningfulOverlapCount(withoutModelReferences, item.content),
  }));
  const bestUseScore = scored.reduce((best, item) => Math.max(best, item.useScore), 0);
  const useThreshold = bestUseScore > 0 ? Math.max(1, Math.ceil(bestUseScore * 0.5)) : 0;

  const relevant = scored.filter((item) => {
    const explicitSourceMatch = Boolean(explicitSourceScope)
      && item.source.toLocaleLowerCase('pt-BR') === explicitSourceScope.toLocaleLowerCase('pt-BR');
    const usedInAnswer = item.useScore >= useThreshold || singleDocumentScope || explicitSourceMatch;
    if (!usedInAnswer) return false;
    const questionMatch = hasMeaningfulOverlap(relevanceText, item.reference);
    // Identidade catalogada foi conferida no documento: basta comprovar que o
    // trecho ou o título pertencem ao assunto tratado nesta chamada.
    if (item.catalog) {
      return singleDocumentScope || explicitSourceMatch || item.documentQuestionMatch || questionMatch;
    }
    // Referência derivada por heurística do próprio trecho: continua exigindo
    // relação textual explícita com a pergunta ou com a resposta.
    const answerMatchCount = meaningfulOverlapCount(withoutModelReferences, item.reference);
    return questionMatch || answerMatchCount >= 2;
  });

  const { body, closing } = splitClosingQuestion(withoutModelReferences);

  if (relevant.length === 0) {
    // O fallback é uma referência válida quando houve uso efetivo dos
    // materiais, mas nenhum trecho trouxe título, capítulo, autoria ou outro
    // identificador bibliográfico verificável. Ele não deve aparecer em
    // recusa, conteúdo insuficiente, quiz ou Informações da disciplina.
    if (allowsReferenceFallback(mode) && docs.some((doc) => Boolean(doc.content?.trim()))) {
      return [
        body,
        '**Referências**\n- Informação não disponível no artigo, consultar o Plano de Ensino ou docentes.',
        closing,
      ].filter(Boolean).join('\n\n').trim();
    }
    return withoutModelReferences;
  }

  // A ordem de exibição segue a força da recuperação, não a ordem em que o
  // banco devolveu as linhas. O corte curto evita a lista longa de obras
  // apenas tangenciais relatada pelo cliente.
  const ranked = [...relevant]
    .map((item, index) => ({ item, index }))
    .sort((a, b) => (b.item.similarity - a.item.similarity) || (a.index - b.index))
    .map(({ item }) => item);
  const sources = ranked.filter((item, index, all) => (
    all.findIndex((candidate) => candidate.key === item.key) === index
  )).slice(0, MAX_REFERENCES);
  const lines = sources.map((item) => `- ${item.reference}`);

  return [
    body,
    `**Referências**\n${lines.join('\n')}`,
    closing,
  ].filter(Boolean).join('\n\n').trim();
}
