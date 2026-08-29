import https from 'node:https';
import { randomUUID } from 'node:crypto';

const appHost = process.env.GUAPU_APP_HOST || 'guapu.agentesnasaude.com.br';
const panelHost = process.env.GUAPU_PANEL_HOST || 'guapu-painel.agentesnasaude.com.br';
const vpsAddress = '129.121.33.171';
const panelUser = process.env.GUAPU_PANEL_USER;
const panelPassword = process.env.GUAPU_PANEL_PASSWORD;

if (!panelUser || !panelPassword) {
  throw new Error('Defina GUAPU_PANEL_USER e GUAPU_PANEL_PASSWORD para executar o teste.');
}

function requestJson(host, path, options = {}) {
  return new Promise((resolve, reject) => {
    const body = options.body ? JSON.stringify(options.body) : undefined;
    const headers = {
      host,
      ...(body ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) } : {}),
      ...(options.authorization ? { authorization: options.authorization } : {}),
    };
    const request = https.request({
      hostname: vpsAddress,
      port: 443,
      servername: host,
      path,
      method: options.method || 'GET',
      headers,
    }, (response) => {
      let payload = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { payload += chunk; });
      response.on('end', () => {
        try {
          resolve({ status: response.statusCode || 0, body: JSON.parse(payload) });
        } catch {
          reject(new Error(`${host}${path} retornou ${response.statusCode}: ${payload.slice(0, 160)}`));
        }
      });
    });
    request.on('error', reject);
    if (body) request.write(body);
    request.end();
  });
}

async function chat(message) {
  const sessionId = `phase6-check-${randomUUID()}`;
  const requestId = randomUUID();
  const startedAt = Date.now();
  const response = await requestJson(appHost, '/api/chat', {
    method: 'POST',
    body: { session_id: sessionId, request_id: requestId, message },
  });
  return {
    sessionId,
    requestId,
    status: response.status,
    elapsedMs: Date.now() - startedAt,
    sources: Number(response.body.sources_found || 0),
    answer: String(response.body.answer || ''),
  };
}

const authorization = `Basic ${Buffer.from(`${panelUser}:${panelPassword}`).toString('base64')}`;
const grounded = await chat('Quais são os principais cuidados de enfermagem no pós-operatório imediato?');
const noEvidence = await chat('Qual é a receita de bolo preferida do professor da disciplina INT 5224?');
const invalidRequest = await requestJson(appHost, '/api/chat', {
  method: 'POST',
  body: { session_id: `phase6-invalid-${randomUUID()}`, message: 17 },
});
let evaluation = null;

for (let attempt = 0; attempt < 20; attempt += 1) {
  const statsResponse = await requestJson(panelHost, '/api/admin/stats', { authorization });
  if (statsResponse.status !== 200) throw new Error(`Painel retornou HTTP ${statsResponse.status}.`);
  const session = (statsResponse.body.sessions || []).find((item) => item.sessionId === grounded.sessionId);
  const message = (session?.messages || []).find((item) => item.request_id === grounded.requestId);
  if (message?.evaluation) {
    evaluation = {
      status: message.evaluation.status,
      verdict: message.evaluation.verdict,
      score: message.evaluation.score,
      sourceCount: message.evaluation.source_count,
    };
    if (evaluation.status === 'succeeded' || evaluation.status === 'failed') break;
  }
  await new Promise((resolve) => setTimeout(resolve, 3000));
}

const result = {
  grounded: {
    status: grounded.status,
    elapsedMs: grounded.elapsedMs,
    sources: grounded.sources,
    hasReferences: /Referências:/i.test(grounded.answer),
  },
  noEvidence: {
    status: noEvidence.status,
    elapsedMs: noEvidence.elapsedMs,
    sources: noEvidence.sources,
    transparent: /(não encontrei|não há base|não dispon|não posso|não tenho|fora do escopo)/i.test(noEvidence.answer),
  },
  invalidRequest: {
    status: invalidRequest.status,
    errorCode: invalidRequest.body.error_code,
  },
  asyncEvaluation: evaluation,
};
console.log(JSON.stringify(result));

const passed = grounded.status === 200
  && grounded.sources > 0
  && /Referências:/i.test(grounded.answer)
  && noEvidence.status === 200
  && /(não encontrei|não há base|não dispon|não posso|não tenho|fora do escopo)/i.test(noEvidence.answer)
  && invalidRequest.status === 400
  && invalidRequest.body.error_code === 'INVALID_REQUEST'
  && evaluation?.status === 'succeeded';
if (!passed) process.exitCode = 1;
