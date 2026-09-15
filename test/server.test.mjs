import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer, request as httpRequest } from 'node:http';
import { createServer as createNetServer } from 'node:net';
import { test } from 'node:test';

const HERMES_MODEL = 'nousresearch/hermes-3-llama-3.1-70b';
const VISION_MODEL = 'google/gemini-2.5-flash';
const PROJECT_ROOT = new URL('..', import.meta.url);

test('server defaults to OpenRouter and Hermes', async (t) => {
  const app = await startApp(t, { OPENROUTER_API_KEY: 'test-key' });
  const response = await fetch(`${app.url}/api/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    ok: true,
    configured: true,
    provider: 'openrouter',
    model: HERMES_MODEL,
  });
});

test('POST /api/explain calls OpenRouter with sanitized fields and parses its reply', async (t) => {
  let request;
  const upstream = await startFakeOpenRouter(t, async (req, res) => {
    request = {
      method: req.method,
      url: req.url,
      headers: req.headers,
      body: JSON.parse(await readStream(req)),
    };
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        summary: 'Complete el formulario tributario.',
        fields: [
          { ref: 'vt-0', meaning: 'Su identificador tributario.', source: 'Su constancia de RUC.', risk: 'El trámite será rechazado.' },
          { ref: 'invented', meaning: 'Should be discarded.' },
        ],
      }) } }],
    }));
  });
  const app = await startApp(t, {
    OPENROUTER_API_KEY: 'openrouter-secret',
    OPENROUTER_BASE_URL: `${upstream.url}/api/v1/`,
    OPENROUTER_APP_URL: 'https://ventanilla.example',
    ALLOWED_ORIGINS: 'https://allowed.example',
  });

  const response = await fetch(`${app.url}/api/explain`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://allowed.example' },
    body: JSON.stringify({
      title: 'Alta de RUC',
      language: 'español',
      fields: [{
        ref: 'vt-0',
        label: 'RUC',
        required: true,
        value: '80012345-6',
        values: ['another secret'],
        defaultValue: 'default secret',
        textContent: 'typed secret',
      }],
    }),
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('access-control-allow-origin'), 'https://allowed.example');
  assert.deepEqual(await response.json(), {
    summary: 'Complete el formulario tributario.',
    fields: [{
      ref: 'vt-0',
      meaning: 'Su identificador tributario.',
      source: 'Su constancia de RUC.',
      risk: 'El trámite será rechazado.',
    }],
  });
  assert.equal(request.method, 'POST');
  assert.equal(request.url, '/api/v1/chat/completions');
  assert.equal(request.headers.authorization, 'Bearer openrouter-secret');
  assert.equal(request.headers['x-openrouter-title'], 'Ventanilla');
  assert.equal(request.headers['http-referer'], 'https://ventanilla.example');
  assert.equal(request.body.model, HERMES_MODEL);
  assert.equal(request.body.response_format.type, 'json_object');
  assert.deepEqual(request.body.messages.map(({ role }) => role), ['system', 'user']);
  assert.match(request.body.messages[1].content, /"ref": "vt-0"/);
  assert.match(request.body.messages[1].content, /"label": "RUC"/);
  for (const secret of ['80012345-6', 'another secret', 'default secret', 'typed secret']) {
    assert.doesNotMatch(request.body.messages[1].content, new RegExp(secret));
  }
});

test('POST /api/screenshot sends only an explicitly supplied image to the vision model', async (t) => {
  let request;
  const upstream = await startFakeOpenRouter(t, async (req, res) => {
    request = JSON.parse(await readStream(req));
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({
      summary: 'La página solicita una fecha.',
      observations: [{ label: 'Fecha de inicio', explanation: 'Indica cuándo comienza la actividad.', next_step: 'Consultá tu constancia.' }],
    }) } }] }));
  });
  const app = await startApp(t, {
    OPENROUTER_API_KEY: 'vision-key',
    OPENROUTER_BASE_URL: `${upstream.url}/v1`,
    ALLOWED_ORIGINS: 'https://allowed.example',
  });
  const image = `data:image/jpeg;base64,${Buffer.from('sample image bytes').toString('base64')}`;
  const response = await fetch(`${app.url}/api/screenshot`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://allowed.example' },
    body: JSON.stringify({ image, title: 'Formulario', language: 'español' }),
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('access-control-allow-origin'), 'https://allowed.example');
  assert.deepEqual(await response.json(), {
    summary: 'La página solicita una fecha.',
    observations: [{ label: 'Fecha de inicio', explanation: 'Indica cuándo comienza la actividad.', next_step: 'Consultá tu constancia.' }],
  });
  assert.equal(request.model, VISION_MODEL);
  assert.equal(request.messages[0].role, 'system');
  assert.match(request.messages[0].content, /Do not quote personal values/);
  assert.deepEqual(request.messages[1].content[1], { type: 'image_url', image_url: { url: image } });
  assert.match(request.messages[1].content[0].text, /Answer in: español/);
});

test('POST /api/screenshot rejects unsupported and oversized images', async (t) => {
  const app = await startApp(t, { OPENROUTER_API_KEY: 'test-key' });
  const unsupported = await fetch(`${app.url}/api/screenshot`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ image: 'data:image/svg+xml;base64,PHN2Zz4=' }),
  });
  assert.equal(unsupported.status, 400);
  const tooLarge = await fetch(`${app.url}/api/screenshot`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ image: `data:image/png;base64,${'A'.repeat(3_100_000)}` }),
  });
  assert.equal(tooLarge.status, 413);
});

test('browser origins are restricted to the configured allowlist and local app', async (t) => {
  const app = await startApp(t, {
    OPENROUTER_API_KEY: 'test-key',
    ALLOWED_ORIGINS: 'https://one.example, https://two.example',
  });
  const denied = await fetch(`${app.url}/api/explain`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://denied.example' },
    body: JSON.stringify({ fields: [{ ref: 'vt-0' }] }),
  });
  assert.equal(denied.status, 403);
  assert.equal(denied.headers.get('access-control-allow-origin'), null);

  const preflight = await fetch(`${app.url}/api/explain`, {
    method: 'OPTIONS',
    headers: { origin: 'https://two.example' },
  });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), 'https://two.example');

  const localPreflight = await fetch(`${app.url}/api/explain`, {
    method: 'OPTIONS',
    headers: { origin: app.url },
  });
  assert.equal(localPreflight.status, 204);
  assert.equal(localPreflight.headers.get('access-control-allow-origin'), app.url);

  const remappedLocalPreflight = await requestWithHost(`${app.url}/api/explain`, {
    origin: 'http://localhost:19090',
    host: 'localhost:19090',
  });
  assert.equal(remappedLocalPreflight.statusCode, 204);
  assert.equal(
    remappedLocalPreflight.headers['access-control-allow-origin'],
    'http://localhost:19090',
  );
});

test('legacy VENTANILLA variables remain supported as fallbacks', async (t) => {
  let request;
  const upstream = await startFakeOpenRouter(t, async (req, res) => {
    request = {
      url: req.url,
      authorization: req.headers.authorization,
      body: JSON.parse(await readStream(req)),
    };
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({
      choices: [{ message: { content: '{"summary":"Legacy configuration works.","fields":[]}' } }],
    }));
  });
  const app = await startApp(t, {
    VENTANILLA_API_KEY: 'legacy-key',
    VENTANILLA_MODEL: 'legacy/hermes',
    VENTANILLA_BASE_URL: `${upstream.url}/legacy/v1`,
  });
  const response = await fetch(`${app.url}/api/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    ok: true,
    configured: true,
    provider: 'openai-compatible',
    model: 'legacy/hermes',
  });

  const explain = await fetch(`${app.url}/api/explain`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ fields: [{ ref: 'vt-0', label: 'RUC' }] }),
  });
  assert.equal(explain.status, 200);
  assert.deepEqual(await explain.json(), { summary: 'Legacy configuration works.', fields: [] });
  assert.equal(request.url, '/legacy/v1/chat/completions');
  assert.equal(request.authorization, 'Bearer legacy-key');
  assert.equal(request.body.model, 'legacy/hermes');
});

async function startApp(t, overrides = {}) {
  const port = await getAvailablePort();
  const child = spawn(process.execPath, ['server/index.mjs'], {
    cwd: PROJECT_ROOT,
    env: {
      ...process.env,
      HOST: '127.0.0.1',
      PORT: String(port),
      OPENROUTER_API_KEY: '',
      OPENROUTER_MODEL: '',
      OPENROUTER_VISION_MODEL: '',
      OPENROUTER_BASE_URL: '',
      OPENROUTER_APP_URL: '',
      VENTANILLA_API_KEY: '',
      VENTANILLA_MODEL: '',
      VENTANILLA_BASE_URL: '',
      ALLOWED_ORIGINS: '',
      ...overrides,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  t.after(() => stopChild(child));
  await waitForServer(child, port);
  return { url: `http://127.0.0.1:${port}` };
}

async function startFakeOpenRouter(t, handler) {
  const server = createServer((req, res) => {
    Promise.resolve(handler(req, res)).catch((error) => {
      res.writeHead(500, { 'content-type': 'text/plain' });
      res.end(String(error));
    });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });
  return { url: `http://127.0.0.1:${port}` };
}

async function getAvailablePort() {
  const server = createNetServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function waitForServer(child, port) {
  const timeout = setTimeout(() => child.kill(), 5000);
  try {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      if (child.exitCode !== null) {
        const stderr = await readStream(child.stderr);
        throw new Error(`server exited early: ${stderr}`);
      }
      try {
        const response = await fetch(`http://127.0.0.1:${port}/api/health`);
        if (response.ok) return;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    }
    throw new Error('server did not become ready');
  } finally {
    clearTimeout(timeout);
  }
}

async function stopChild(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, 'exit');
  child.kill();
  await exited;
}

async function readStream(stream) {
  let text = '';
  stream.setEncoding('utf8');
  stream.on('data', (chunk) => { text += chunk; });
  if (!stream.readableEnded) await once(stream, 'end');
  return text;
}

function requestWithHost(url, headers) {
  return new Promise((resolve, reject) => {
    const request = httpRequest(url, { method: 'OPTIONS', headers }, resolve);
    request.on('error', reject);
    request.end();
  });
}
