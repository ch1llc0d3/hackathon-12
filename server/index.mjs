// The local half of Ventanilla.
//
// Two jobs, and it is worth being clear about why they are both here:
//   1. Serve the injectable agent to whatever page the person is stuck on.
//   2. Hold the API key. The bookmarklet runs inside a government website's
//      origin; a key shipped to that context is a key handed to that site.
//      So the key lives here, on the person's own machine, and never moves.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname } from 'node:path';
import { parseAgentReply, stripValues } from '../src/reply.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = process.env.PORT || 8787;

await loadDotEnv();

const BASE_URL = process.env.VENTANILLA_BASE_URL || '';
const MODEL = process.env.VENTANILLA_MODEL || '';
const API_KEY = process.env.VENTANILLA_API_KEY || '';

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

const SYSTEM_PROMPT = `You are Ventanilla, standing beside someone at the counter of a Paraguayan government website — Marangatú, the DNIT, the Registro Único del Contribuyente.

They are looking at a form they do not understand. You can see the form's STRUCTURE — the label of each field, whether it is required, its format constraints — but you deliberately CANNOT see anything they have typed. Never ask about or refer to values you were not given.

Answer in the language they ask for. If they ask for guaraní or jopara, write in it properly — these forms exist only in Spanish, and that is exactly the gap you are here to close. Keep Spanish for the official term itself (RUC, timbrado, IRE SIMPLE) because that is what is printed on the page and on their documents, then explain it in their language.

For every field, answer three questions:
  what it means, in words someone outside the tax system would use — never repeat the official term back as its own explanation
  where the value comes from — the physical document it is printed on. In Paraguay that is usually the cédula de identidad, a factura, a patente municipal, or a previous declaración jurada.
  what goes wrong if they get it wrong — a multa, a rejected solicitud, the wrong régimen

Be short. Two sentences per field at most. No preamble, no reassurance.

Context you may rely on: the dígito verificador is the single digit after the dash in a RUC, calculated from the cédula. RESIMPLE is the simplest régimen, for very small businesses. IRE SIMPLE sits above it. The timbrado is the authorisation number for issuing facturas, and somebody registering for the first time will not have one.

If you can draft a value with confidence from what they told you about themselves, put it in "draft". If you cannot, omit "draft" entirely. Never invent a cédula number, a RUC, a dígito verificador, a timbrado or a date — those are printed on a document you cannot see, and a plausible-looking wrong one is worse than a blank.

Reply with JSON only:
{"summary":"one sentence, in their language: what this page is actually asking them to do",
 "fields":[{"ref":"vt-0","meaning":"...","source":"...","risk":"...","draft":"optional"}]}`;

const server = createServer(async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return end(res, 204, '');

  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname === '/api/explain' && req.method === 'POST') return explain(req, res);
  if (url.pathname === '/api/health') {
    return json(res, 200, { ok: true, configured: Boolean(API_KEY), model: MODEL });
  }
  if (url.pathname === '/inject.js') return serveAgent(res);

  const path = url.pathname === '/' ? '/install.html' : url.pathname;
  return serveStatic(res, path);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`\n  Ventanilla is at the counter.\n`);
  console.log(`  Install page   http://localhost:${PORT}/`);
  console.log(`  Demo form      http://localhost:${PORT}/demo/marangatu.html`);
  console.log(API_KEY
    ? `  Model          ${MODEL || '(model not set)'}\n`
    : `  No key yet     copy .env.example to .env and add one\n`);
});

/**
 * The agent is served as one classic script so a bookmarklet can inject it
 * into any page. harvest.js is authored as an ES module for the test suite;
 * stripping the export keywords is what lets a single file be both.
 */
async function serveAgent(res) {
  const [harvest, inject] = await Promise.all([
    readFile(join(ROOT, 'src/harvest.js'), 'utf8'),
    readFile(join(ROOT, 'src/inject.js'), 'utf8'),
  ]);
  const bundle = `(function(){\n${harvest.replace(/^export /gm, '')}\n${inject}\n})();`;
  res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' });
  res.end(bundle);
}

async function explain(req, res) {
  if (!API_KEY) {
    return json(res, 503, { error: 'No API key. Copy .env.example to .env and add one.' });
  }
  let body;
  try {
    body = JSON.parse(await readBody(req));
  } catch {
    return json(res, 400, { error: 'Malformed request.' });
  }

  const { fields = [], title = '', language = 'guaraní', about = '' } = body;
  if (!Array.isArray(fields) || fields.length === 0) {
    return json(res, 400, { error: 'No fields to explain.' });
  }

  // Belt and braces: the harvester already refuses to read typed values, but
  // this is the last gate before anything leaves the machine, so check again.
  const outbound = fields.map(stripValues);

  const user = [
    `Page title: ${title}`,
    `Answer in: ${language}`,
    about ? `What the person told me about themselves: ${about}` : '',
    `Fields:\n${JSON.stringify(outbound, null, 1)}`,
  ].filter(Boolean).join('\n\n');

  try {
    const upstream = await fetch(`${BASE_URL.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: user }],
        response_format: { type: 'json_object' },
        temperature: 0.2,
      }),
    });

    if (!upstream.ok) {
      const detail = (await upstream.text()).slice(0, 300);
      return json(res, 502, { error: `The model provider said ${upstream.status}.`, detail });
    }

    const data = await upstream.json();
    const raw = data?.choices?.[0]?.message?.content ?? '';
    return json(res, 200, parseAgentReply(raw, outbound));
  } catch (err) {
    return json(res, 502, { error: 'Could not reach the model provider.', detail: String(err) });
  }
}



async function loadDotEnv() {
  try {
    const text = await readFile(join(ROOT, '.env'), 'utf8');
    for (const line of text.split('\n')) {
      const match = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2].replace(/^["']|["']$/g, '');
      }
    }
  } catch { /* no .env is fine; /api/health will say so */ }
}

async function serveStatic(res, path) {
  if (path.includes('..')) return end(res, 400, 'no');
  try {
    const file = await readFile(join(ROOT, 'public', path));
    res.writeHead(200, { 'content-type': TYPES[extname(path)] || 'application/octet-stream' });
    res.end(file);
  } catch {
    end(res, 404, 'Not found');
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 1e6) reject(new Error('too large'));
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

// The agent runs inside other people's origins, so it needs to be able to
// call back here from anywhere. Nothing here is authenticated because nothing
// here is reachable from outside the machine — the listener is on 127.0.0.1.
function cors(res) {
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-headers', 'content-type');
  res.setHeader('access-control-allow-methods', 'POST, GET, OPTIONS');
}
const json = (res, code, obj) => {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
};
const end = (res, code, text) => { res.writeHead(code); res.end(text); };
