# Ventanilla — hackathon submission

## Project Name
Ventanilla

Tagline: An agent that stands at the counter with you — in Marangatú, in your own language.

## Project Description

Ventanilla puts an agent inside Marangatú, the Paraguayan tax portal, while you are stuck in it.

Marangatú (marangatu.set.gov.py) is where every taxpayer in Paraguay files IVA, registers a RUC and opens a company. It is written in a register almost nobody speaks: "dígito verificador", "declaración rectificativa", "IVA crédito fiscal del período", "saldo a favor del fisco". Paraguay is officially bilingual and a very large share of the population speaks Guaraní first, but the portal is Spanish-only. So people either pay a gestor they cannot always afford, or they stay informal. That is the cost of a confusing form.

A chatbot in another tab cannot help here, for a reason that is architectural rather than rhetorical: Marangatú is behind a login. No crawler reaches it, no public API exposes it, and no assistant can see the screen you are looking at. Ventanilla is a bookmarklet, so it runs inside your own authenticated session. The environment is not a backdrop to the agent; it is the only place the agent can exist.

Click the bookmark on any page of the portal and the agent harvests the live DOM — labels, required flags, patterns, maxlengths, select options, and which rung of the label chain each name came from — then opens a panel in a shadow root beside the form. For every field it answers three questions in the language you ask for, Guaraní included: what it actually means in ordinary words, which physical document or card the value is printed on, and what goes wrong if you get it wrong. Clicking an explanation scrolls the real input into view and flashes it, so the answer and the box it refers to move together. Where it can infer a value from what you told it about yourself, it offers a draft you press to insert — written through the native value setter and followed by real input and change events, so the portal's own validation runs on the draft. It never submits anything. You press every button.

Privacy is structural, not promised, and on a tax portal that is the difference between usable and unthinkable. The harvester reports only whether a field is filled, never with what; passwords and hidden inputs are refused outright; a second strip runs server-side as the last gate before anything leaves the machine, and unit tests assert both. Your RUC, your income and your saldo never reach the model. The API key never enters the portal's origin either — a bookmarklet runs inside that origin, so a key shipped there is a key handed to that site. It lives instead on a 127.0.0.1 Node server that also serves the agent bundle.

Technical execution: a zero-dependency Node 20 http server, ES modules, Shadow DOM for hostile-CSS isolation, and a provider-agnostic OpenAI-compatible chat-completions client (Gemini 2.0 Flash by default, OpenRouter and Groq drop-in) using JSON response_format with a degrade path for when the model answers in prose. The DOM harvester is split into pure, DOM-free functions covered by a node:test suite and a thin walker, so the judgement calls — label selection, redaction, constraint filtering — are testable without a browser. Shipped with a practice replica of Formulario 120 (Declaración Jurada del IVA), clearly banner-labelled as unofficial, so the demo runs without anyone logging into a real tax account.

## Products & Tools Used

Checkboxes: AI Tinkerers, Ambiguous AI (+ OpenRouter only if actually used).

Other Products:
Google Gemini (gemini-2.0-flash, via its OpenAI-compatible endpoint); Node.js 20 built-ins only — node:http, node:test, no runtime dependencies; Claude Code for development.

## Team Contributions — Cecilia Benitez Montiel (Lead)

Sole builder — designed and implemented the whole project. Built the DOM harvester (src/harvest.js) and its privacy model: pure, testable label-selection and redaction functions that emit only whether a field is filled, plus a hard refusal on password and hidden inputs, covered by a 12-case node:test suite. Built the injected agent (src/inject.js): shadow-root panel, scroll-and-flash linking of explanations to the real controls, and native-setter fill-back with synthetic input/change events so host-page framework validation runs on inserted drafts. Built the local Node server (server/index.mjs): the bookmarklet bundler that makes one file serve as both an ES module and a classic script, the API-key custody boundary on 127.0.0.1, the system prompt, and the tolerant JSON parse that drops hallucinated field refs. Wrote the install page and the Formulario 120 (IVA) practice replica styled after Marangatú. Model calls go to Google Gemini 2.0 Flash through its OpenAI-compatible chat-completions API, with OpenRouter and Groq as drop-in alternatives.

## Project Video (optional)

2 min: install page → bookmarklet on the Modelo 037 demo → panel explains NIF and Epígrafe IAE in español → click a card, watch the field highlight → press a draft button.
