import test from 'node:test';
import assert from 'node:assert/strict';

import { isSyntheticSession } from '../lib/admin/session-scope.ts';

test('exclui sessões automáticas das métricas administrativas', () => {
  assert.equal(isSyntheticSession('acceptance-flow-001-abc'), true);
  assert.equal(isSyntheticSession('semantic-probe-abc'), true);
  assert.equal(isSyntheticSession('course-plan-check-abc'), true);
  assert.equal(isSyntheticSession('course-plan-final-abc'), true);
});

test('preserva sessões de alunos', () => {
  assert.equal(isSyntheticSession('student-session-abc'), false);
  assert.equal(isSyntheticSession('session-enf-001'), false);
});

