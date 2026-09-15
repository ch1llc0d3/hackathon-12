// inject.js — the browser-side bridge and panel for the Docker-hosted agent.
//
// Only this temporary browser adapter runs inside the site's origin; prompts,
// API key and model requests stay in the Docker-hosted service. It does not
// change the site's source/server, but can write a field after user approval.
// It assumes nothing:
// the host page's CSS is hostile (hence a shadow root), the host page's
// framework owns its inputs (hence real events on fill-back), and the host
// page may vanish under us at any moment.

const ORIGIN = 'http://localhost:8787';
const PANEL_ID = 'ventanilla-panel';

if (document.getElementById(PANEL_ID)) {
  document.getElementById(PANEL_ID).remove();
}

const host = document.createElement('div');
host.id = PANEL_ID;
host.style.cssText = 'position:fixed;top:0;right:0;width:380px;height:100vh;z-index:2147483647;';
document.body.appendChild(host);
const root = host.attachShadow({ mode: 'open' });

root.innerHTML = `
<style>
  :host, * { box-sizing: border-box; }
  .panel {
    height: 100vh; display: flex; flex-direction: column;
    font: 15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif;
    background: #fbfaf8; color: #1c1a17;
    border-left: 1px solid #ddd7cc; box-shadow: -8px 0 32px rgba(0,0,0,.10);
  }
  header { padding: 14px 16px; background: #1f3a5f; color: #fff; flex: none; }
  header h1 { margin: 0; font-size: 15px; font-weight: 650; letter-spacing: .01em; }
  header p  { margin: 3px 0 0; font-size: 12px; opacity: .72; }
  header button {
    position: absolute; top: 12px; right: 12px; background: none; border: 0;
    color: #fff; font-size: 19px; cursor: pointer; opacity: .7; line-height: 1;
  }
  .body { flex: 1; overflow-y: auto; padding: 14px; }
  .setup { padding: 14px; border-bottom: 1px solid #e6e0d5; background: #fff; flex: none; }
  .setup label { display: block; font-size: 12px; font-weight: 600; margin-bottom: 4px; }
  .setup input {
    width: 100%; padding: 7px 9px; border: 1px solid #ccc4b6; border-radius: 6px;
    font: inherit; font-size: 13px; background: #fff; color: inherit;
  }
  .setup .hint { font-size: 11px; color: #6d6459; margin: 5px 0 0; }
  .consent { display: flex !important; gap: 7px; align-items: flex-start; margin-top: 10px !important; font-weight: 400 !important; }
  .consent input { width: auto; margin: 3px 0 0; flex: none; }
  .consent span { font-size: 11px; line-height: 1.4; color: #6d332d; }
  .go {
    width: 100%; margin-top: 10px; padding: 9px; border: 0; border-radius: 6px;
    background: #1f3a5f; color: #fff; font: inherit; font-weight: 600; cursor: pointer;
  }
  .go:disabled { opacity: .5; cursor: default; }
  .screenshot { background: #4c5d48; }
  .summary {
    background: #fff5d6; border: 1px solid #e8d79a; border-radius: 8px;
    padding: 11px 13px; font-size: 14px; margin-bottom: 12px;
  }
  .card {
    background: #fff; border: 1px solid #e6e0d5; border-left: 3px solid #1f3a5f;
    border-radius: 7px; padding: 11px 13px; margin-bottom: 9px; cursor: pointer;
  }
  .card:hover { border-left-color: #c9822b; }
  .card h2 { margin: 0 0 6px; font-size: 13.5px; font-weight: 650; }
  .card .req { color: #b33; font-weight: 400; }
  .card p { margin: 0 0 5px; font-size: 13px; }
  .card .src { color: #5a6b4f; }
  .card .risk { color: #8a5a2b; }
  .card .fill {
    margin-top: 7px; padding: 5px 11px; border: 1px solid #1f3a5f; border-radius: 5px;
    background: #fff; color: #1f3a5f; font: inherit; font-size: 12.5px;
    font-weight: 600; cursor: pointer;
  }
  .card .fill:hover { background: #1f3a5f; color: #fff; }
  .note { font-size: 12px; color: #6d6459; padding: 2px 2px 10px; }
  .err { background: #fdecea; border: 1px solid #f0b4ae; border-radius: 7px; padding: 11px; font-size: 13px; }
  footer {
    flex: none; padding: 9px 14px; font-size: 11px; color: #6d6459;
    border-top: 1px solid #e6e0d5; background: #f4f1ea;
  }
</style>
<div class="panel">
  <header>
    <button title="close">&times;</button>
    <h1>Ventanilla</h1>
    <p></p>
  </header>
  <div class="setup">
    <label for="lang">Explain this to me in &mdash; español · guaraní · jopara</label>
    <input id="lang" value="español" />
    <label for="about" style="margin-top:9px">Anything about you that helps (optional)</label>
    <input id="about" placeholder="tengo un pequeño comercio en San Lorenzo" />
    <p class="hint"></p>
    <button class="go">Leer esta página</button>
    <label class="consent"><input class="share-screen" type="checkbox" />
      <span>Entiendo que la captura completa se enviará a OpenRouter. Cerrá o tapá datos privados antes de compartir.</span>
    </label>
    <button class="go screenshot" disabled>Entender una captura…</button>
  </div>
  <div class="body"><p class="note"></p></div>
  <footer></footer>
</div>`;

const $ = (sel) => root.querySelector(sel);
const body = $('.body');
const go = $('.go');
const screenshotGo = $('.screenshot');
const consent = $('.share-screen');

const fields = harvest(document);

$('header p').textContent = `${fields.length} campo${fields.length === 1 ? '' : 's'} en esta página`;
$('.hint').textContent = 'Leer página envía etiquetas y estructura, nunca lo que escribís.';
$('.note').textContent = fields.length
  ? 'Apretá el botón y repasamos el formulario juntos.'
  : 'No encuentro campos de formulario en esta página.';
$('footer').textContent = 'Nada se envía hasta que vos apretás un botón.';
$('header button').onclick = () => host.remove();
if (!fields.length) go.disabled = true;
consent.onchange = () => { screenshotGo.disabled = !consent.checked; };

screenshotGo.onclick = async () => {
  if (!consent.checked) return;
  screenshotGo.disabled = true;
  screenshotGo.textContent = 'Esperando permiso…';
  body.innerHTML = '<p class="note">Elegí qué pantalla o pestaña compartir en el diálogo del navegador.</p>';
  try {
    const image = await captureScreenshot();
    screenshotGo.textContent = 'Analizando captura…';
    body.innerHTML = '<p class="note">Enviando la captura aprobada al modelo visual…</p>';
    const res = await fetch(`${ORIGIN}/api/screenshot`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ image, title: document.title, language: $('#lang').value.trim() || 'español' }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || data.error || `Error ${res.status}`);
    renderScreenshot(data);
  } catch (err) {
    showError(err);
  } finally {
    screenshotGo.disabled = !consent.checked;
    screenshotGo.textContent = 'Entender una captura…';
  }
};

go.onclick = async () => {
  go.disabled = true;
  go.textContent = 'Leyendo…';
  body.innerHTML = '<p class="note">Mirando el formulario…</p>';

  try {
    const res = await fetch(`${ORIGIN}/api/explain`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        fields,
        title: document.title,
        language: $('#lang').value.trim() || 'guaraní',
        about: $('#about').value.trim(),
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || data.error || `Error ${res.status}`);
    render(data);
  } catch (err) {
    showError(err);
  } finally {
    go.disabled = false;
    go.textContent = 'Leer de nuevo';
  }
};

async function captureScreenshot() {
  if (!navigator.mediaDevices?.getDisplayMedia) {
    throw new Error('Este navegador no permite compartir la pantalla desde aquí. Probá con Chrome, Edge o Firefox actualizado.');
  }
  const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 1 }, audio: false });
  try {
    const video = document.createElement('video');
    video.srcObject = stream;
    await video.play();
    await new Promise((resolve) => {
      if (video.readyState >= 2) resolve();
      else video.addEventListener('loadeddata', resolve, { once: true });
    });
    const scale = Math.min(1, 1600 / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.78);
  } finally {
    stream.getTracks().forEach((track) => track.stop());
  }
}

function renderScreenshot(data) {
  body.innerHTML = '';
  if (data.summary) {
    const summary = document.createElement('div');
    summary.className = 'summary';
    summary.textContent = data.summary;
    body.appendChild(summary);
  }
  for (const item of data.observations || []) {
    const card = document.createElement('div');
    card.className = 'card';
    if (item.label) {
      const heading = document.createElement('h2');
      heading.textContent = item.label;
      card.appendChild(heading);
    }
    if (item.explanation) card.appendChild(line('', item.explanation));
    if (item.next_step) card.appendChild(line('src', item.next_step));
    body.appendChild(card);
  }
  if (!data.summary && !(data.observations || []).length) body.appendChild(line('note', 'No pude identificar texto útil. Probá con una captura más nítida.'));
}

function showError(err) {
  body.innerHTML = '';
  const box = document.createElement('div');
  box.className = 'err';
  box.textContent = String(err.message || err);
  const hint = document.createElement('p');
  hint.className = 'note';
  hint.textContent = '¿Está corriendo Ventanilla? En Docker, revisá con docker compose ps.';
  body.append(box, hint);
}

function render(data) {
  body.innerHTML = '';
  const byRef = new Map(fields.map((f) => [f.ref, f]));

  if (data.summary) {
    const s = document.createElement('div');
    s.className = 'summary';
    s.textContent = data.summary;
    body.appendChild(s);
  }

  for (const item of data.fields || []) {
    const field = byRef.get(item.ref);
    if (!field) continue;
    const el = document.querySelector(`[data-ventanilla-ref="${item.ref}"]`);

    const card = document.createElement('div');
    card.className = 'card';
    card.appendChild(heading(field));
    if (item.meaning) card.appendChild(line('', item.meaning));
    if (item.source) card.appendChild(line('src', `Lo encuentras en: ${item.source}`));
    if (item.risk) card.appendChild(line('risk', item.risk));

    // Scrolling the real control into view is half the value of being on the
    // page at all: the explanation and the box it refers to move together.
    card.onclick = () => {
      if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      flash(el);
    };

    if (item.draft && el) card.appendChild(fillButton(el, item.draft));
    body.appendChild(card);
  }

  if (!(data.fields || []).length) {
    body.appendChild(line('note', data.degraded
      ? 'The model replied in prose instead of the format I asked for. Try again.'
      : 'No field explanations came back.'));
  }
}

function heading(field) {
  const h = document.createElement('h2');
  h.textContent = field.label;
  if (field.required) {
    const req = document.createElement('span');
    req.className = 'req';
    req.textContent = ' · obligatorio';
    h.appendChild(req);
  }
  return h;
}

function line(cls, text) {
  const p = document.createElement('p');
  if (cls) p.className = cls;
  p.textContent = text;
  return p;
}

function fillButton(el, draft) {
  const btn = document.createElement('button');
  btn.className = 'fill';
  btn.textContent = `Poner: ${draft}`;
  btn.onclick = (event) => {
    event.stopPropagation();
    fill(el, draft);
    btn.textContent = 'Puesto — revisalo';
  };
  return btn;
}

/**
 * Writing to .value is invisible to React, Vue and Angular, which track the
 * native setter. Call it directly, then fire the events a human keystroke
 * would have fired, so the host page's own validation runs on the draft.
 */
function fill(el, value) {
  const proto = el instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : el instanceof HTMLSelectElement
      ? HTMLSelectElement.prototype
      : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (setter) setter.call(el, value); else el.value = value;

  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  el.focus();
  flash(el);
}

function flash(el) {
  const previous = el.style.outline;
  el.style.outline = '3px solid #c9822b';
  setTimeout(() => { el.style.outline = previous; }, 1400);
}
