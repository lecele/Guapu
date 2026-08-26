const SYNTHETIC_SESSION_PREFIXES = [
  'acceptance-',
  'semantic-probe-',
  'course-plan-check-',
  'course-plan-final-',
];

export function isSyntheticSession(sessionId: string | null | undefined): boolean {
  if (!sessionId) return false;
  return SYNTHETIC_SESSION_PREFIXES.some((prefix) => sessionId.startsWith(prefix));
}

