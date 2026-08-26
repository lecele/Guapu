const SYNTHETIC_SESSION_PREFIXES = [
  'acceptance-',
  'semantic-probe-',
  'course-plan-check-',
  'course-plan-final-',
  // Testes de aceitação, auditorias e sondas anteriores ao marcador estruturado.
  // Eles permanecem no banco para rastreabilidade, mas não representam alunos.
  'test-',
  'test_',
  'audit-',
  'audit_',
  'real_test_',
  'session-monitor-',
  'info-session-',
];

export function isSyntheticSession(sessionId: string | null | undefined): boolean {
  if (!sessionId) return false;
  return SYNTHETIC_SESSION_PREFIXES.some((prefix) => sessionId.startsWith(prefix));
}
