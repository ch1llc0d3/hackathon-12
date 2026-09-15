# Ventanilla

Ventanilla helps people understand Paraguayan DNIT / Marangatú tax forms in
Spanish, Guaraní, or jopara. It explains fields and can suggest drafts for you
to review.

## Run with Docker

```bash
cp .env.example .env
# Add your key to OPENROUTER_API_KEY in .env
docker compose up --build
```

Open <http://localhost:8787>, drag the **Ventanilla** bookmarklet to your
bookmarks bar, then open Marangatú and click it.

The agent service runs in Docker. It holds the OpenRouter key, prepares
requests, and routes them to Hermes 3 (`nousresearch/hermes-3-llama-3.1-70b`)
for form help and Gemini 2.5 Flash (`google/gemini-2.5-flash`) for screenshots.
Model inference happens remotely through OpenRouter. Docker publishes the
service only on `127.0.0.1`.

The bookmarklet adds a temporary browser panel. It does not change the
government site's source or server. Use **Leer esta página** for form-field
guidance, or opt in to screen sharing and press **Entender una captura**. To
fill a field, review a suggested draft and press **Poner**. Ventanilla never
submits the form.

## Privacy

- Form help sends labels and constraints, never entered values. Password and
  hidden fields are excluded.
- A screenshot is sent to OpenRouter only after you approve sharing. It may
  show private details; cover them first. The Docker service does not save it.
- Docker reads the key from your local `.env`; the browser panel never gets it.

Screenshot sharing can explain visible content. For drafts linked to form
fields, use **Leer esta página** and share only the context you choose.

## Settings and development

- Set `OPENROUTER_MODEL` to change the form-help model.
- Set `OPENROUTER_VISION_MODEL` to change the screenshot model.
- `ALLOWED_ORIGINS` defaults to `https://marangatu.set.gov.py`. Add the exact
  origin before using the bookmarklet on another site. Localhost is allowed.
- Older `VENTANILLA_API_KEY`, `VENTANILLA_MODEL`, and
  `VENTANILLA_BASE_URL` settings remain supported.

For development only, `npm start` runs the service outside Docker. The practice
form at `/demo/marangatu.html` is an unofficial RUC-registration simulation,
not a DNIT form.

Run tests with `npm test`; run the container smoke test with
`npm run test:docker`.

## Limits

Strict content-security policies can block bookmarklets or requests to
localhost. Ventanilla reads one page at a time and does not provide legal or tax
advice. Its field-label detection may miss poorly labeled forms.

## Licence

MIT.
