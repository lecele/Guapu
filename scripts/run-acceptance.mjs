import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

const baseUrl = (process.env.GUAPU_ACCEPTANCE_URL || 'https://guapu.agentesnasaude.com.br').replace(/\/$/, '');
const cases = JSON.parse(await readFile(new URL('../qa/acceptance-cases.json', import.meta.url), 'utf8'));

async function send(sessionId, message) {
  const startedAt = Date.now();
  const response = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId, request_id: randomUUID(), message }),
  });
  const body = await response.json();
  return { status: response.status, elapsedMs: Date.now() - startedAt, ...body };
}

function validate(result, expected) {
  const answer = String(result.answer || '');
  const failures = [];
  if (result.status !== 200) failures.push(`HTTP ${result.status}`);
  for (const text of expected.includes || []) if (!answer.toLowerCase().includes(text.toLowerCase())) failures.push(`não contém "${text}"`);
  for (const text of expected.excludes || []) if (answer.toLowerCase().includes(text.toLowerCase())) failures.push(`contém "${text}"`);
  if (Number(result.sources_found || 0) < Number(expected.sourcesMin || 0)) failures.push(`fontes ${result.sources_found || 0} < ${expected.sourcesMin}`);
  if (result.elapsedMs > expected.maxLatencyMs) failures.push(`latência ${result.elapsedMs}ms > ${expected.maxLatencyMs}ms`);
  return failures;
}

const results = [];
for (const testCase of cases) {
  const sessionId = `acceptance-${testCase.id.toLowerCase()}-${randomUUID()}`;
  let finalResult;
  try {
    for (const message of testCase.messages) finalResult = await send(sessionId, message);
    const failures = validate(finalResult, testCase.expect);
    results.push({ id: testCase.id, passed: failures.length === 0, failures, elapsedMs: finalResult.elapsedMs, sources: finalResult.sources_found || 0 });
  } catch (error) {
    results.push({ id: testCase.id, passed: false, failures: [String(error)], elapsedMs: 0, sources: 0 });
  }
}

const passed = results.filter((result) => result.passed).length;
console.log(JSON.stringify({ baseUrl, passed, failed: results.length - passed, total: results.length, results }, null, 2));
if (passed !== results.length) process.exitCode = 1;
