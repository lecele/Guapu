import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ACTIVE_PLAN_PROFESSORS,
  buildActivePlanProfessorResponse,
} from '../lib/chat/course-catalog.ts';

test('catálogo do plano vigente contém os sete professores completos', () => {
  const answer = buildActivePlanProfessorResponse();

  assert.equal(ACTIVE_PLAN_PROFESSORS.length, 7);
  for (const professor of ACTIVE_PLAN_PROFESSORS) assert.match(answer, new RegExp(professor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.equal((answer.match(/^-/gm) ?? []).length, 8);
  assert.match(answer, /^\*\*Referências\*\*$/m);
  assert.doesNotMatch(answer, /^\*\*Referências:\*\*$/m);
});
