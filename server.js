/* Growth Vistara: zero-dependency Node server (Node 18+).
 * Serves /public and handles POST /api/enquiry.
 * Config via environment variables (see .env.example). Secrets never reach the browser. */
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');

// ---- minimal .env loader ----
try {
  fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split(/\r?\n/).forEach(l => {
    const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  });
} catch (_) {}

const env = process.env;
const PORT = +env.PORT || 3000;
const PROD = env.NODE_ENV === 'production';
const DATA_DIR = path.resolve(env.DATA_DIR || path.join(__dirname, 'data'));
const MAX_BODY = 20 * 1024;
const RATE_MAX = +env.RATE_LIMIT_MAX || 5, RATE_WINDOW = (+env.RATE_LIMIT_WINDOW_MIN || 10) * 60e3;
const ALLOWED_ORIGIN = env.ALLOWED_ORIGIN || '';           // e.g. https://growthvistara.com (empty = same-origin only)
const emailReady = !!(env.RESEND_API_KEY && env.NOTIFY_EMAIL && env.FROM_EMAIL);
const SERVICES = ['Logo & Branding','Graphic Design','Animation','Explainer Video','Website Design & Development','SEO','SEM','SMM','Paid Campaigns','Lead Generation','Bulk SMS Service','Email Marketing','WhatsApp Marketing'];

const hits = new Map(), seen = new Map();
const clean = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);

function validate(b) {
  const e = {}, d = {
    name: clean(b.name, 120), email: clean(b.email, 200).toLowerCase(), company: clean(b.company, 160),
    phone: clean(b.phone, 30), service: clean(b.service, 80), requirements: String(b.requirements || '').replace(/\r/g, '').trim().slice(0, 3000),
    website: clean(b.website, 200), budget: clean(b.budget, 60), timeline: clean(b.timeline, 40),
    contactMethod: ['Email','Phone','WhatsApp'].includes(b.contactMethod) ? b.contactMethod : 'Email',
    extraServices: (Array.isArray(b.extraServices) ? b.extraServices : []).map(s => clean(s, 80)).filter(s => SERVICES.includes(s)),
    consent: b.consent === true || b.consent === 'yes'
  };
  if (d.name.length < 2) e.name = 'Enter your full name.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.email)) e.email = 'Enter a valid business email.';
  if (!d.company) e.company = 'Enter your company or brand name.';
  if (d.phone && !/^\+?[0-9 ()\-]{6,24}$/.test(d.phone)) e.phone = 'Enter a valid phone number.';
  if (!SERVICES.includes(d.service)) e.service = 'Choose a valid service.';
  if (d.requirements.length < 10) e.requirements = 'Tell us a little more (at least 10 characters).';
  if (d.website && !/^(https?:\/\/)?[^\s.]+\.[^\s]{2,}$/.test(d.website)) e.website = 'Enter a valid website address.';
  if (!d.consent) e.consent = 'Please confirm so we can respond to your enquiry.';
  return { e, d };
}

function send(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}

async function notify(rec) {
  if (!emailReady) return { sent: false };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
  const rows = [['Name',rec.name],['Email',rec.email],['Company',rec.company],['Phone',rec.phone],['Service',[rec.service].concat(rec.extraServices).join(', ')],['Budget',rec.budget],['Timeline',rec.timeline],['Website',rec.website],['Contact via',rec.contactMethod],['Requirements',rec.requirements]];
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST', headers: { Authorization: 'Bearer ' + env.RESEND_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env.FROM_EMAIL, to: env.NOTIFY_EMAIL.split(',').map(s => s.trim()), reply_to: rec.email,
      subject: `New enquiry: ${rec.service} (${rec.company})`,
      html: '<table cellpadding="6">' + rows.map(([k,v]) => `<tr><td><b>${k}</b></td><td>${esc(v || '-').replace(/\n/g,'<br>')}</td></tr>`).join('') + '</table>' })
  });
  if (!r.ok) throw new Error('email provider ' + r.status);
  return { sent: true };
}

async function store(rec) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.appendFileSync(path.join(DATA_DIR, 'enquiries.jsonl'), JSON.stringify(rec) + '\n', { mode: 0o600 });   // local store
  if (env.CRM_WEBHOOK_URL) {                                                                                  // optional CRM / sheet / DB
    const r = await fetch(env.CRM_WEBHOOK_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(env.CRM_WEBHOOK_TOKEN ? { Authorization: 'Bearer ' + env.CRM_WEBHOOK_TOKEN } : {}) }, body: JSON.stringify(rec) });
    if (!r.ok) throw new Error('crm webhook ' + r.status);
  }
}

async function enquiry(req, res) {
  const ip = (env.TRUST_PROXY ? String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() : '') || req.socket.remoteAddress;
  const now = Date.now(), recent = (hits.get(ip) || []).filter(t => now - t < RATE_WINDOW);
  if (recent.length >= RATE_MAX) return send(res, 429, { ok: false, message: 'Too many enquiries. Please try again later.' });
  recent.push(now); hits.set(ip, recent);

  let raw = '', size = 0;
  for await (const c of req) { size += c.length; if (size > MAX_BODY) return send(res, 413, { ok: false, message: 'Request too large.' }); raw += c; }
  let b; try { b = (req.headers['content-type'] || '').includes('json') ? JSON.parse(raw) : Object.fromEntries(new URLSearchParams(raw)); } catch (_) { return send(res, 400, { ok: false, message: 'Invalid request.' }); }

  if (b.hp) return send(res, 200, { ok: true });                                   // honeypot: pretend success, store nothing
  if (+b.elapsed < 2500) return send(res, 400, { ok: false, message: 'Please take a moment to complete the form.' });
  const { e, d } = validate(b);
  if (Object.keys(e).length) return send(res, 422, { ok: false, errors: e });

  const key = crypto.createHash('sha256').update([d.email, d.service, d.requirements].join('|')).digest('hex');
  if (seen.has(key) && now - seen.get(key) < 24 * 3600e3) return send(res, 200, { ok: true, duplicate: true, dev: !PROD || !emailReady });
  const rec = { id: crypto.randomUUID(), receivedAt: new Date().toISOString(), ...d, consentAt: new Date().toISOString(), source: 'website' };
  try { await store(rec); } catch (err) { console.error('store failed:', err.message); return send(res, 500, { ok: false, message: 'Could not store enquiry.' }); }
  seen.set(key, now);
  try { await notify(rec); } catch (err) { console.error('notify failed (enquiry is stored, id ' + rec.id + '):', err.message); }
  send(res, 200, { ok: true, dev: !PROD || !emailReady });
}

const TYPES = { '.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.png':'image/png','.svg':'image/svg+xml','.ico':'image/x-icon','.txt':'text/plain','.webmanifest':'application/manifest+json' };
const PUB = path.join(__dirname, 'public');

http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin'); res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Content-Security-Policy', "default-src 'self'; style-src 'self' https://fonts.googleapis.com 'unsafe-inline'; font-src https://fonts.gstatic.com; img-src 'self' data:; script-src 'self'; form-action 'self'; frame-ancestors 'none'");
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/api/enquiry') {
    if (ALLOWED_ORIGIN && req.headers.origin === ALLOWED_ORIGIN) res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
    if (req.method === 'OPTIONS') { res.setHeader('Access-Control-Allow-Headers', 'Content-Type'); res.writeHead(204); return res.end(); }
    if (req.method !== 'POST') return send(res, 405, { ok: false });
    try { return await enquiry(req, res); } catch (err) { console.error(err); return send(res, 500, { ok: false, message: 'Server error.' }); }
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
  let p = decodeURIComponent(url.pathname); if (p.endsWith('/')) p += 'index.html';
  const file = path.normalize(path.join(PUB, p));
  if (!file.startsWith(PUB + path.sep)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': /\.(png|css|js)$/.test(file) ? 'public, max-age=3600' : 'no-cache' });
    res.end(buf);
  });
}).listen(PORT, () => console.log(`Growth Vistara running on http://localhost:${PORT}  [${PROD ? 'production' : 'development'}; email ${emailReady ? 'configured' : 'NOT configured'}]`));
