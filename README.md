# Ventanilla

**An agent that stands at the counter with you.**

*Ventanilla* is the counter window you queue at — the one where somebody on the
other side of the glass tells you which box to tick. This puts that person on
the page.

Click a bookmark on any official form — a tax declaration, a residency renewal,
a benefits application — and an agent appears beside it. It reads the form you
are looking at, explains each field in words a person outside the system would
use, in your language, and tells you **which document the answer is printed on**.

```
┌─ sede.agenciatributaria.gob.es ─────────┬────────────────────────────┐
│                                         │  Ventanilla                │
│  Nº de identificación fiscal (NIF/NIE)* │  9 fields on this page     │
│  [_______________]                      │                            │
│                                         │  Esta página te da de alta │
│  Epígrafe IAE *                         │  como autónoma.            │
│  [____]                                 │                            │
│                                         │  ┌──────────────────────┐  │
│  Régimen de tributación del IVA *       │  │ Epígrafe IAE · oblig.│  │
│  [ Seleccione          ▾]               │  │ El código de cuatro  │  │
│                                         │  │ cifras de tu oficio. │  │
│                                         │  │ Lo encuentras en: la │  │
│                                         │  │ tabla del IAE.       │  │
│                                         │  │ [ Poner: 5051 ]      │  │
│                                         │  └──────────────────────┘  │
└─────────────────────────────────────────┴────────────────────────────┘
```

## Why it has to be on the page

You cannot ask a chatbot what `Régimen de tributación` means without already
knowing enough to type it. Not knowing what it says **is the problem**. The
question you would have to ask is the question you cannot form.

So the agent does not wait to be asked. It reads the DOM in front of you —
every label, every `required`, every `pattern="[0-9]{5}"`, every option in
every dropdown — and starts talking about the form you are actually stuck on.
Take it off the page and there is nothing left: no form, no fields, no
constraints, no *this* box. The environment is not a delivery channel here. It
is the whole input.

## It never sees what you type

This matters more here than almost anywhere else, because the forms worth
helping with are the ones full of identification numbers, addresses and bank
details.

**Only labels and structure leave your machine.** The model is told
`{label: "Nº de identificación fiscal", required: true, pattern: "[A-Z0-9]{9}", filled: false}`
— never your NIE. Not redacted, not masked: never read in the first place.
`redactValue()` in `src/harvest.js` reports *whether* a field is filled and
nothing else, and `stripValues()` in the server checks again on the way out.
Both are covered by tests that assert a known secret cannot be found in the
payload.

Beyond that:

- **`type="password"` and `type="hidden"` are never harvested at all.**
- **Nothing is ever submitted.** The agent fills a box; a human presses the button.
- **The API key stays on your machine.** The agent runs inside a government
  site's origin — a key shipped into that context is a key handed to that site.
  So it lives in the local server and never crosses into the browser.
- **No account, no telemetry, no server of ours.** It talks to your model
  provider and to nobody else.

## Run it

```bash
cp .env.example .env        # add a key — Gemini's free tier is enough
npm start
```

Open <http://localhost:8787>, drag the **Ventanilla** bookmarklet to your
bookmarks bar, then open a form and click it.

No form handy? There is a practice one at `/demo/tramite.html` — a faithful
rebuild of the Spanish *Modelo 037*, the form you file to register as
self-employed. It includes a hidden CSRF input and a password field, both of
which the agent must refuse to look at.

Any OpenAI-compatible provider works — Gemini, OpenRouter, Groq, or anything
else that speaks `/chat/completions`. Set three variables and go.

## How it is built

| File | Purpose |
|---|---|
| `src/harvest.js` | Page → form map. The label resolver and the privacy rule. |
| `src/inject.js` | The panel on the page: shadow DOM, fill-back, highlighting. |
| `server/index.mjs` | Local server. Holds the key, bundles the agent, calls the model. |
| `public/install.html` | The bookmarklet, and a health check for the server. |
| `public/demo/tramite.html` | Modelo 037, rebuilt to practise on. |
| `test/harvest.test.mjs` | 12 tests, `node --test`, zero dependencies. |

Three decisions worth explaining:

**Label resolution is the hard part, so it is the tested part.** A field's
visible label is `<label for>` sometimes, `aria-label` sometimes, a wrapping
`<label>` sometimes, and a bare text node sitting next to the input often —
government forms are old HTML. `pickLabel()` walks that chain in order of
trustworthiness and reports *which rung it landed on*, so a guess is never
mistaken for a certainty. All of it is pure functions over plain objects,
which is why the suite needs no browser and no test framework.

**The panel lives in a shadow root.** It is injected into pages whose CSS it
has never met. A shadow boundary is the only way to be sure the host page
cannot restyle the agent, or the agent the host page.

**Fill-back dispatches real events.** Assigning `.value` is invisible to React,
Vue and Angular, which track the native setter. `fill()` calls that setter
directly and then fires the `input` and `change` events a keystroke would have
fired — so the site's own validation runs on the draft, in front of you, before
you touch anything.

**The model is not trusted to be right.** It never invents an identification
number, a date or a reference code — those are printed on a document it cannot
see, and a plausible-looking wrong one is worse than a blank. If it replies in
prose where JSON was asked for, `parseAgentReply()` degrades to showing the
prose rather than throwing. Explanations pointing at fields that do not exist
are dropped before they can render as a card aimed at nothing.

## Limits, honestly

- **Strict CSP blocks bookmarklets.** A site with a tight `script-src` will
  refuse the injection, and a tight `connect-src` will refuse the call to
  localhost even though `http://localhost` is exempt from mixed-content
  blocking. A browser extension would not have this problem; a bookmarklet
  ships today without a store review. The practice form exists so this limit
  never stands between you and seeing it work.
- **It reads one page at a time.** Multi-step wizards are re-read per step.
- **It explains fields; it does not give legal or tax advice.** Which box to
  tick when the answer changes what you owe is a question for a person.
- **Label resolution is best-effort.** `labelSource` records how confident it
  is, but a form built entirely from unlabelled `<div>`s will defeat it.

## Licence

MIT.
