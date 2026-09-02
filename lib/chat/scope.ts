import type { GenerationMode } from './session-flow';

/**
 * Escopo da disciplina — Prompt 01, seção 3.0 (v1.5.0).
 *
 * O escopo vem da ementa do Plano de Ensino, nunca da base de conhecimento.
 * O acervo indexado contém livros de referência que cobrem enfermagem muito
 * além desta disciplina; a existência de material sobre um tema não o coloca
 * no escopo.
 *
 * Instrução no prompt não bastou: em teste real (02/09/2026) o modelo
 * respondeu integralmente a uma pergunta sobre pediatria porque a busca
 * trouxe trechos plausíveis — o erro que a seção 3.0 descreve textualmente.
 * A checagem passou para o código, antes da recuperação, o que também
 * elimina o custo de busca e geração de um pedido que será redirecionado
 * (nota técnica da v1.5.0).
 */

export const OUT_OF_SCOPE_RESPONSE =
  'Isso foge ao escopo desta disciplina (O cuidado no processo de viver humano II - a condição cirúrgica), '
  + 'que trata do cuidado de enfermagem ao adulto e ao idoso no período perioperatório. '
  + 'Posso ajudar com temas como cuidados pré, trans e pós-operatórios, segurança do paciente cirúrgico, '
  + 'feridas e estomias, entre outros do Plano de Ensino. '
  + 'Deseja voltar ao menu principal ou perguntar algo dentro desses temas?';

/**
 * Deliberadamente curta e conservadora. Só entram aqui campos que a ementa
 * exclui de forma inequívoca — a disciplina é sobre o adulto e o idoso no
 * perioperatório. Recusar uma pergunta legítima é pior que deixar passar
 * uma fora do escopo, porque o estudante perde acesso a conteúdo que a
 * disciplina realmente cobre.
 *
 * Fora daqui de propósito: "saúde mental" e "psiquiátrico". Um paciente
 * cirúrgico pode ter demanda de saúde mental no perioperatório, e essa
 * pergunta é legítima. Casos assim continuam a cargo do prompt.
 */
const OUT_OF_SCOPE_TOPICS: Array<{ label: string; pattern: RegExp }> = [
  { label: 'pediatria', pattern: /\b(?:pediatri\w*|neonat\w*|puericultura|lactente|lactentes|recem[- ]nascidos?|bebes?|criancas?)\b/ },
  { label: 'obstetricia', pattern: /\b(?:obstetri\w*|gestante|gestantes|gravidas?|gravidez|gestacao|puerperi\w*|pre[- ]?natal|parturiente)\b/ },
  { label: 'atencao primaria', pattern: /\b(?:atencao primaria|atencao basica|estrategia saude da familia|unidade basica de saude)\b/ },
];

/**
 * Se o estudante nomeia explicitamente o público da disciplina, a menção ao
 * termo fora de escopo tende a ser comparativa ("difere do adulto...") e não
 * o assunto do pedido. Nesse caso não redirecionamos.
 */
const DISCIPLINE_AUDIENCE = /\b(?:adultos?|idosos?|idosas?)\b/;

function normalize(value: string): string {
  return value
    .toLocaleLowerCase('pt-BR')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

/** A checagem só vale onde o assistente geraria conteúdo educacional. */
function generatesEducationalContent(mode: GenerationMode | null | undefined): boolean {
  return mode === 'livre'
    || mode === 'resumo'
    || mode === 'resumo_aprofundar'
    || mode === 'simulado_tema';
}

export function resolveOutOfScopeTopic(
  question: string,
  mode: GenerationMode | null | undefined,
): string | null {
  if (!generatesEducationalContent(mode)) return null;
  const text = normalize(question || '');
  // Comandos curtos de navegação nunca passam por aqui (v1.4.0): eles são
  // resolvidos antes, no caminho de resposta rápida, e ainda assim uma
  // frase curta demais não carrega tema identificável.
  if (text.trim().split(/\s+/).filter(Boolean).length < 2) return null;
  if (DISCIPLINE_AUDIENCE.test(text)) return null;
  const match = OUT_OF_SCOPE_TOPICS.find((topic) => topic.pattern.test(text));
  return match ? match.label : null;
}

export function isOutOfDisciplineScope(
  question: string,
  mode: GenerationMode | null | undefined,
): boolean {
  return resolveOutOfScopeTopic(question, mode) !== null;
}
