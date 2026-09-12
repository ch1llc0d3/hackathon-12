// inject.js — the agent's body on the page.
//
// Runs inside whatever origin the person is stuck on, so it assumes nothing:
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
  .go {
    width: 100%; margin-top: 10px; padding: 9px; border: 0; border-radius: 6px;
    background: #1f3a5f; color: #fff; font: inherit; font-weight: 600; cursor: pointer;
  }
  .go:disabled { opacity: .5; cursor: default; }
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
    <input id="about" placeholder="monotributista, tengo un almacén en San Lorenzo" />
    <p class="hint"></p>
    <button class="go">Leer esta página</button>
  </div>
  <div class="body"><p class="note"></p></div>
  <footer></footer>
</div>`;

const $ = (sel) => root.querySelector(sel);
const body = $('.body');
const go = $('.go');

const fields = harvest(document);

$('header p').textContent = `${fields.length} campo${fields.length === 1 ? '' : 's'} en esta página`;
$('.hint').textContent = 'Solo se envían las etiquetas del formulario. Nunca lo que escribís.';
$('.note').textContent = fields.length
  ? 'Apretá el botón y repasamos el formulario juntos.'
  : 'No encuentro campos de formulario en esta página.';
$('footer').textContent = 'No se envía nada. Vos apretás cada botón.';
$('header button').onclick = () => host.remove();
if (!fields.length) go.disabled = true;

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
    body.innerHTML = '';
    const box = document.createElement('div');
    box.className = 'err';
    box.textContent = String(err.message || err);
    const hint = document.createElement('p');
    hint.className = 'note';
    hint.textContent = '¿Está corriendo el servidor de Ventanilla? npm start';
    body.append(box, hint);
  } finally {
    go.disabled = false;
    go.textContent = 'Leer de nuevo';
  }
};

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
