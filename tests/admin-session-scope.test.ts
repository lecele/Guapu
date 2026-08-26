import test from 'node:test';
import assert from 'node:assert/strict';

import { isSyntheticSession } from '../lib/admin/session-scope.ts';

test('exclui sessões automáticas das métricas administrativas', () => {
  assert.equal(isSyntheticSession('acceptance-flow-001-abc'), true);
  assert.equal(isSyntheticSession('semantic-probe-abc'), true);
  assert.equal(isSyntheticSession('course-plan-check-abc'), true);
  assert.equal(isSyntheticSession('course-plan-final-abc'), true);
  assert.equal(isSyntheticSession('test-e2e-session-abc'), true);
  assert.equal(isSyntheticSession('audit_session_abc'), true);
  assert.equal(isSyntheticSession('real_test_answer-abc'), true);
  assert.equal(isSyntheticSession('session-monitor-check-abc'), true);
});

test('preserva sessões de alunos', () => {
  assert.equal(isSyntheticSession('student-session-abc'), false);
  assert.equal(isSyntheticSession('session-enf-001'), false);
});
