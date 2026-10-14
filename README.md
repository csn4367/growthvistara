# Growth Vistara website

Static front end (`public/`) plus a small, dependency-free Node server (`server.js`) that serves the site and receives enquiries at `POST /api/enquiry`.

## Run locally
```bash
cp .env.example .env     # optional for local testing
node server.js           # needs Node 18+; open http://localhost:3000
```
Without email settings the site runs in **development mode**: enquiries are validated and saved to `data/enquiries.jsonl`, no email is sent, and the success message says so. If the API is unreachable (for example, the HTML opened as a plain file), the modal shows an error and keeps the visitor's input. Nothing is silently discarded.

## Enquiry pipeline (server side)
1. Size limit (20 KB), JSON or form-encoded body.
2. Honeypot field and minimum fill time (spam), per-IP rate limit (default 5 per 10 min).
3. Full server-side validation of every field, including the 13-service allow-list and required consent.
4. Duplicate detection (same email + service + requirements within 24 h returns success without storing twice).
5. Store: appended to `data/enquiries.jsonl` (id, timestamp, all fields, services, requirements, consent status and time). Optionally also POSTed to `CRM_WEBHOOK_URL` (CRM, Zapier/Make, Google Sheets script, database API). Success is returned only after storage succeeds.
6. Notify: email to `NOTIFY_EMAIL` through Resend (`RESEND_API_KEY`, `FROM_EMAIL`). If email fails the enquiry is still stored and the failure is logged with the enquiry id.

All keys live in environment variables. Nothing secret is in browser code.

## Deploy
- **Any Node host** (Render, Railway, Fly.io, a VPS): set `NODE_ENV=production` and the variables from `.env.example`, start command `node server.js`. Mount a persistent disk at `DATA_DIR`, or set `CRM_WEBHOOK_URL` so leads live outside the container. Behind a proxy, set `TRUST_PROXY=1`. Serve over HTTPS.
- **Static host + separate API** (Netlify, Vercel, S3): upload `public/`, host `server.js` elsewhere, set `data-endpoint` on `#enquiry-form` in `index.html` to the API URL and `ALLOWED_ORIGIN` on the server to the site URL.

## Privacy and retention approach
Collect only the form fields, record consent, use the data to answer the enquiry, restrict access to staff and the providers you configure, and delete enquiries after your chosen retention period (suggested: 24 months after last contact). Fill the placeholders in `public/privacy.html` and have it reviewed. To delete the local store: remove the lines from `data/enquiries.jsonl`.

## Structure
`public/index.html` page · `css/styles.css` brand tokens and layout · `js/main.js` menu, modal (native `<dialog>`: focus trap, Esc, backdrop click, scroll lock), validation, submit, scroll effects · `assets/` logo variants, favicon (GV monogram), OG image.
Services are plain HTML cards (`.card`) with `data-service`; add or edit a service by copying a card and its `<option>` in the modal (and the `SERVICES` list in `server.js`). Budget and timeline options are in the modal markup.

## Notes
- The navigation uses the GV monogram with typed wordmark because only the stacked logo was supplied. Supply the approved horizontal logo and swap it in.
- Fonts load from Google Fonts. For stricter privacy or speed, self-host Sora and Manrope.
- Motion: hero entrance, scroll-linked arrow, problem-to-order chips, connected-lines system, process reveal. All are disabled under `prefers-reduced-motion`, and without JS the page renders in its final, aligned state.
