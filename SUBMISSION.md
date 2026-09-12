# Ventanilla — hackathon submission

## Project Name
Ventanilla

Tagline: An agent that stands at the counter with you — in Marangatú, in your own language.

## Project Description

Ventanilla puts an agent inside Marangatú, the Paraguayan tax portal, while you are stuck in it.

Marangatú (marangatu.set.gov.py) is where every business in Paraguay is born — you register a RUC there before you can invoice a single guaraní. The registration form asks for your Dígito Verificador, your Naturaleza jurídica, your código CIIU, the Obligación you are inscribing, your Timbrado. Every one of those means something precise to the tax administration and nothing at all to the person trying to open a shop. Paraguay is officially bilingual and a very large share of the population speaks Guaraní first; the portal is Spanish-only. So people pay a gestor they may not be able to afford, or they stay informal. That is what a confusing form actually costs.

A chatbot in another tab cannot close this gap, for a reason that is architectural rather than rhetorical. You cannot ask what "Naturaleza jurídica" means without already knowing enough to type it — not knowing what the screen says IS the problem, and the question you would have to ask is the question you cannot form. Marangatú is also behind a login: no crawler reaches it, no public API exposes it, no assistant can see the screen in front of you. Ventanilla is a bookmarklet, so it runs inside your own authenticated session, and it does not wait to be asked.

Click it and the agent harvests the live DOM — every label, every required, every pattern, every option in every dropdown — then opens a panel in a shadow root beside the form. For each field it answers three questions in whatever language you ask for, Guaraní included: what it means in ordinary words, which physical document the answer is printed on, and what goes wrong if you get it wrong. Clicking an explanation scrolls the real input into view and flashes it, so the answer and the box it refers to move together. Where it can infer a value from what you told it about yourself, it offers a draft you press to insert. It never submits anything; you press every button.

Privacy here is structural, not promised, and on a tax portal that is the difference between usable and unthinkable. Only labels and structure leave the machine: the model is told {label: "Nº de Cédula de Identidad Civil", required: true, filled: false} and never your cédula — not redacted, not masked, never read. Controls of type password and hidden are refused outright, so the portal's own Clave de acceso is invisible to the agent by construction. The API key never enters the portal's origin either — a bookmarklet runs inside that origin, so a key shipped there is a key handed to that site. It lives on a 127.0.0.1 Node server instead.

Technical execution: zero runtime dependencies — Node 20's node:http, ES modules, Shadow DOM for hostile-CSS isolation, node:test. Model calls go to any OpenAI-compatible chat-completions endpoint (Gemini 2.0 Flash by default, OpenRouter and Groq drop-in) using JSON response_format, with a degrade path for when the model answers in prose and a filter that drops explanations pointing at fields which do not exist. Label resolution and redaction are pure functions over plain objects, covered by 12 passing tests, so the privacy rule is proven without a browser. Ships with a practice replica of the RUC registration form, banner-labelled as unofficial, so the demo runs without anyone logging into a real tax account.

## Products & Tools Used

Checkboxes: AI Tinkerers, Ambiguous AI (+ OpenRouter only if actually used).

Other Products:
Google Gemini (gemini-2.0-flash, via its OpenAI-compatible endpoint); Node.js 20 built-ins only — node:http, node:test, no runtime dependencies; Claude Code for development.

## Team Contributions — Cecilia Benitez Montiel (Lead)

Sole builder — designed and implemented the whole project. Built the DOM harvester (src/harvest.js) and its privacy model: pure, testable label-selection and redaction functions that emit only whether a field is filled, plus a hard refusal on password and hidden inputs, covered by a 12-case node:test suite. Built the injected agent (src/inject.js): shadow-root panel, scroll-and-flash linking of explanations to the real controls, and native-setter fill-back with synthetic input/change events so host-page framework validation runs on inserted drafts. Built the local Node server (server/index.mjs): the bookmarklet bundler that makes one file serve as both an ES module and a classic script, the API-key custody boundary on 127.0.0.1, the system prompt, and the tolerant JSON parse that drops hallucinated field refs. Wrote the install page and the Formulario 120 (IVA) practice replica styled after Marangatú. Model calls go to Google Gemini 2.0 Flash through its OpenAI-compatible chat-completions API, with OpenRouter and Groq as drop-in alternatives.

## Project Video (optional)

2 min: install page → bookmarklet on the Modelo 037 demo → panel explains NIF and Epígrafe IAE in español → click a card, watch the field highlight → press a draft button.
