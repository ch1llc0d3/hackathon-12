# Ventanilla — hackathon submission

## Project Name
Ventanilla

Tagline: An agent that stands at the counter with you — in Marangatú, in your own language.

## Project Description

Ventanilla puts an agent inside Marangatú, the Paraguayan tax portal, while you are stuck in it.

Marangatú (marangatu.set.gov.py) is where every business in Paraguay is born — you register a RUC there before you can invoice a single guaraní. The registration form asks for your Dígito Verificador, your Naturaleza jurídica, your código CIIU, the Obligación you are inscribing, your Timbrado. Every one of those means something precise to the tax administration and nothing at all to the person trying to open a shop. Paraguay is officially bilingual and a very large share of the population speaks Guaraní first; the portal is Spanish-only. So people pay a gestor they may not be able to afford, or they stay informal. That is what a confusing form actually costs.

A chatbot in another tab cannot close this gap, for a reason that is architectural rather than rhetorical. You cannot ask what "Naturaleza jurídica" means without already knowing enough to type it — not knowing what the screen says IS the problem, and the question you would have to ask is the question you cannot form. Marangatú is also behind a login: no crawler reaches it, no public API exposes it, no assistant can see the screen in front of you. Ventanilla's agent service runs in Docker on the user's machine. The user opens Marangatú normally and can opt to share a screenshot; a small temporary browser bridge displays the container's guidance beside the page and can fill a user-approved draft, without changing the government site's source or server.

Click the bookmarklet and a temporary bridge reads visible form structure and opens a panel in a shadow root; alternatively, choose a screen capture and ask the Docker-hosted agent to explain what is visible. The container does the prompt construction and model routing. For each field, the guidance explains what it means in ordinary words, which physical document the answer may come from, and what to watch out for. A field-linked draft can be offered from context the user chose to provide; the user reviews and presses the fill button. Ventanilla never submits anything.

Privacy here is structural, not promised, and on a tax portal that is the difference between usable and unthinkable. In normal form-reading mode only labels and structure leave the machine: the Docker-hosted agent service is told {label: "Nº de Cédula de Identidad Civil", required: true, filled: false} and never your cédula — not redacted, not masked, never read. Controls of type password and hidden are refused outright. A separate screenshot mode requires opt-in and browser capture permission; the selected image is sent from the Docker-hosted service to OpenRouter's vision model, so the user is warned to cover private details first. The container does not save screenshots. The API key never enters the portal's origin or the browser-side bridge.

Technical execution: zero runtime dependencies — Node 20's node:http, ES modules, Shadow DOM for hostile-CSS isolation, node:test. Hermes 3 via OpenRouter handles form help; Gemini 2.5 Flash via OpenRouter handles user-approved screenshots. Both use JSON chat completions. Label resolution and redaction are pure functions over plain objects, with integration coverage for image routing, origin checks, and request limits. Ships with a practice replica of the RUC registration form, banner-labelled as unofficial, so the demo runs without anyone logging into a real tax account.

## Products & Tools Used

Checkboxes: AI Tinkerers, Ambiguous AI (+ OpenRouter only if actually used).

Other Products:
OpenRouter (Hermes 3 for form explanations; Gemini 2.5 Flash for opt-in screenshot understanding); Node.js 20 built-ins only — node:http, node:test, no runtime dependencies.

## Team Contributions — Cecilia Benitez Montiel (Lead)

Sole builder — designed and implemented the whole project. Built the DOM harvester (src/harvest.js) and its privacy model: pure, testable label-selection and redaction functions that emit only whether a field is filled, plus a hard refusal on password and hidden inputs. Built the browser-side bridge and panel (src/inject.js): shadow DOM, screen-share consent, screenshot capture, screenshot explanation rendering, field highlighting, and fill-back. Built the Docker-hosted agent service (server/index.mjs), which holds the OpenRouter API key, sanitizes requests, builds prompts, and routes text and image requests to their configured models. Added integration tests for sanitization, screenshot limits, and model routing.

## Project Video (optional)

2 min: install page → bookmarklet on the unofficial Marangatú / RUC practice demo → panel explains the cédula, CIIU and tax obligations in Guaraní or Spanish → click a card, watch the field highlight → press a draft button.
