/**
 * Fatos administrativos estruturados do plano vigente.
 *
 * Esta lista foi conferida contra o conteúdo do plano INT 5224 2026-2
 * disponível no material local de homologação. O runtime só a utiliza
 * quando a recuperação confirma exclusivamente a fonte ativa do plano;
 * perguntas clínicas e outros documentos continuam no fluxo RAG normal.
 */
export const ACTIVE_PLAN_PROFESSORS = [
  'Ana Graziela Alvarez (Coordenadora)',
  'Lúcia Nazareth Amante',
  'Juliana Balbinot Reis Girondi',
  'Neide da Silva Knihs',
  'Luciara Fabiane Sebold',
  'Keyla Cristiane do Nascimento',
  'Vanessa Martinhago Borges Fernandes',
] as const;

export const ACTIVE_PLAN_PROFESSOR_REFERENCE =
  'Plano de Ensino 2026-2 — INT 5224: O cuidado no processo de viver humano II — a condição cirúrgica. Universidade Federal de Santa Catarina (UFSC). p. 22.';

export function buildActivePlanProfessorResponse(): string {
  return [
    'Os professores da disciplina INT 5224 — O cuidado no processo de viver humano II: a condição cirúrgica são:',
    '',
    ...ACTIVE_PLAN_PROFESSORS.map((professor) => `- ${professor}`),
    '',
    'Para mais informações detalhadas sobre a disciplina, consulte o plano de ensino completo disponível no Moodle.',
    '',
    '**Referências**',
    `- ${ACTIVE_PLAN_PROFESSOR_REFERENCE}`,
  ].join('\n');
}
