import { parseSiteUrls } from './site-urls.js';

/**
 * POST /api/send-email  (contact, rappel, candidature) — envoi via Brevo.
 * Utilisé par le Worker Cloudflare (worker/index.js) ET par Vercel (api/send-email.js, simple adaptateur).
 *
 * Principe : chaque formulaire est décrit UNE fois dans FORMS ci-dessous (champs, libellés, limites).
 * Le serveur n'accepte QUE ces champs, les nettoie, les valide, puis les envoie TOUS par e-mail :
 * un champ ajouté dans FORMS apparaît automatiquement dans les e-mails.
 *
 * Sécurité : JSON uniquement, taille limitée, champs en liste blanche, types vérifiés, caractères de contrôle
 * supprimés, HTML échappé, consentement obligatoire, honeypot, limite par adresse e-mail destinataire,
 * erreurs internes jamais renvoyées au visiteur. (Origine et débit : contrôlés dans worker/index.js.)
 */

const BREVO_ENDPOINT = 'https://api.brevo.com/v3/smtp/email';
const MAX_BODY_CHARS = 50_000;
const BRAND = {
  rose: '#9f1239', roseDark: '#881337', gold: '#f59e0b', ink: '#1f2937',
  muted: '#64748b', light: '#fff1f2', cream: '#fff7ed', border: '#ffe4e6'
};

/* ============================================================
   FORMULAIRES : liste complète des champs (ordre = ordre dans l'e-mail)
   key      : nom du champ envoyé par public/js/main.js
   label    : libellé affiché dans l'e-mail
   max/min  : longueurs (texte coupé au-delà de max)
   required : obligatoire ; kind : 'email' | 'phone' ; multiline : conserve les retours à la ligne
   fallback : valeur si le champ facultatif est vide
   ============================================================ */
const FORMS = {
  contact: {
    consent: true,
    companyTitle: 'Nouveau message de contact',
    fields: [
      { key: 'name', label: 'Nom complet', max: 100, min: 2, required: true },
      { key: 'email', label: 'E-mail', max: 160, required: true, kind: 'email' },
      { key: 'phone', label: 'Téléphone / WhatsApp', max: 40, required: true, kind: 'phone' },
      { key: 'subject', label: 'Sujet', max: 160, min: 3, required: true },
      { key: 'message', label: 'Message', max: 4000, min: 10, required: true, multiline: true }
    ]
  },
  candidature: {
    consent: true,
    companyTitle: 'Nouvelle candidature',
    fields: [
      { key: 'fullName', label: 'Nom complet', max: 120, min: 2, required: true },
      { key: 'country', label: 'Pays de résidence', max: 120, required: true },
      { key: 'currentLevel', label: 'Niveau d’études', max: 200, required: true },
      { key: 'bacSeries', label: 'Série du bac et mention', max: 200, required: true },
      { key: 'studyDomain', label: 'Filière souhaitée', max: 200, required: true },
      { key: 'targetCity', label: 'Ville souhaitée', max: 120, required: true },
      { key: 'targetUniversity', label: 'Université ciblée', max: 200, fallback: 'Recommandation Wicka' },
      { key: 'selectedPack', label: 'Formule choisie', max: 200, required: true },
      { key: 'airportTransfer', label: 'Navette aéroport', max: 200, required: true },
      { key: 'notes', label: 'Précisions / questions', max: 4000, multiline: true },
      { key: 'whatsapp', label: 'WhatsApp', max: 40, required: true, kind: 'phone' },
      { key: 'email', label: 'E-mail', max: 160, required: true, kind: 'email' }
    ]
  },
  callback: {
    consent: false,
    companyTitle: 'Nouvelle demande de rappel',
    fields: [
      { key: 'name', label: 'Nom', max: 100, fallback: 'Non renseigné' },
      { key: 'phone', label: 'Numéro WhatsApp / téléphone', max: 40, required: true, kind: 'phone' }
    ]
  }
};

/* ============================================================
   Utilitaires de sécurité
   ============================================================ */
class ClientError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

// Caractères de contrôle + caractères Unicode de réorientation du texte (usurpation d'affichage)
const UNSAFE_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u202A-\u202E\u2066-\u2069]/g;

/** Texte propre : seules les chaînes/nombres sont acceptées (jamais d'objet), coupé à `max`. */
function clean(value, max, multiline = false) {
  let s = typeof value === 'string' ? value : typeof value === 'number' ? String(value) : '';
  s = s.normalize('NFC').replace(/\r\n?/g, '\n').replace(UNSAFE_CHARS, '');
  s = multiline ? s.replace(/\n{3,}/g, '\n\n') : s.replace(/\n+/g, ' ');
  return s.trim().slice(0, max);
}
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}
function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value) && value.length <= 160;
}
function validPhone(value) {
  const digits = value.replace(/\D/g, '');
  return /^[+\d\s().-]+$/.test(value) && digits.length >= 8 && digits.length <= 15;
}
function cleanPage(value) {
  const page = clean(value, 120);
  return /^\/[A-Za-z0-9\-_/.#]*$/.test(page) ? page : '';
}

// Limite par adresse e-mail destinataire (évite d'utiliser le formulaire pour inonder la boîte de quelqu'un).
// Mémoire par instance : filet de sécurité, la limite par IP est dans worker/index.js.
const recipientHits = new Map();
const RECIPIENT_MAX = 3;
const RECIPIENT_WINDOW_MS = 10 * 60_000;
function allowRecipient(email) {
  const now = Date.now();
  const key = email.toLowerCase();
  if (recipientHits.size > 5000) {
    for (const [k, v] of recipientHits) if (now - v.startedAt >= RECIPIENT_WINDOW_MS) recipientHits.delete(k);
  }
  const current = recipientHits.get(key);
  if (!current || now - current.startedAt >= RECIPIENT_WINDOW_MS) {
    recipientHits.set(key, { startedAt: now, count: 1 });
    return true;
  }
  current.count += 1;
  return current.count <= RECIPIENT_MAX;
}

/* ============================================================
   Validation : ne garde que les champs du formulaire, tous nettoyés et vérifiés
   ============================================================ */
function parseForm(type, body) {
  const form = FORMS[type];
  if (!Object.prototype.hasOwnProperty.call(FORMS, type) || !form) throw new ClientError('Type de formulaire inconnu.');
  if (form.consent && body.consent !== 'accepted') throw new ClientError('Le consentement est obligatoire.');

  const data = {};
  for (const field of form.fields) {
    const value = clean(body[field.key], field.max, field.multiline);
    if (!value && field.required) throw new ClientError(`Le champ « ${field.label} » est obligatoire.`);
    if (value && field.min && value.length < field.min) throw new ClientError(`Le champ « ${field.label} » est trop court.`);
    if (value && field.kind === 'email' && !validEmail(value)) throw new ClientError('Adresse e-mail invalide.');
    if (value && field.kind === 'phone' && !validPhone(value)) throw new ClientError('Numéro de téléphone invalide.');
    data[field.key] = value || field.fallback || '';
  }
  return { form, data };
}

/* ============================================================
   Configuration Brevo
   ============================================================ */
/**
 * `origin` = adresse du site réellement visitée (.com ou workers.dev), donc toujours une URL qui fonctionne.
 * PUBLIC_SITE_URL peut contenir plusieurs adresses : on ne l'utilise jamais telle quelle pour fabriquer un lien.
 */
function config(env, origin) {
  const required = ['BREVO_API_KEY', 'BREVO_FROM_EMAIL', 'BREVO_COMPANY_EMAIL'];
  const missing = required.filter((key) => !env[key]);
  if (missing.length) throw new Error(`Configuration Brevo manquante: ${missing.join(', ')}`);
  const fromEmail = clean(env.BREVO_FROM_EMAIL, 160);
  const companyEmail = clean(env.BREVO_COMPANY_EMAIL, 160);
  if (!validEmail(fromEmail) || !validEmail(companyEmail)) {
    throw new Error('Configuration Brevo invalide: vérifiez les adresses e-mail.');
  }
  const base = clean(origin, 300).replace(/\/+$/, '');
  const configuredLogo = clean(env.BREVO_LOGO_URL, 500);
  const siteUrls = parseSiteUrls(env.PUBLIC_SITE_URL);
  // Logo hébergé ailleurs que sur le site (CDN...) : utilisé tel quel.
  // Logo hébergé sur l'un des domaines du site : reconstruit sur l'adresse qui fonctionne.
  const logoIsExternal = configuredLogo !== '' && !siteUrls.some((u) => configuredLogo.startsWith(u));
  return {
    apiKey: env.BREVO_API_KEY,
    fromEmail,
    fromName: clean(env.BREVO_FROM_NAME, 80) || 'Wicka Assistance',
    companyEmail,
    logoUrl: logoIsExternal ? configuredLogo : base ? `${base}/assets/images/logo.png` : configuredLogo
  };
}

/* ============================================================
   Construction des e-mails (TOUS les champs du formulaire)
   ============================================================ */
function emailLayout(title, content, cfg) {
  const logo = cfg.logoUrl
    ? `<img src="${escapeHtml(cfg.logoUrl)}" alt="Wicka Assistance" style="display:block;width:120px;height:98px;max-width:100%;margin:0 auto 22px;object-fit:contain;">`
    : `<div style="font-size:24px;font-weight:800;letter-spacing:.08em;color:${BRAND.rose};margin-bottom:22px;">WICKA<span style="color:${BRAND.gold};">.</span></div>`;
  return `<!doctype html><html lang="fr"><body style="margin:0;background:${BRAND.light};font-family:Arial,Helvetica,sans-serif;color:${BRAND.ink};"><div style="padding:28px 12px;"><div style="max-width:650px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 8px 30px rgba(136,19,55,.10);"><div style="height:6px;background:linear-gradient(90deg,${BRAND.rose},${BRAND.gold});"></div><div style="padding:34px 30px 28px;text-align:center;">${logo}<h1 style="margin:0;color:${BRAND.roseDark};font-size:23px;line-height:1.3;">${escapeHtml(title)}</h1></div><div style="padding:0 30px 30px;font-size:15px;line-height:1.7;">${content}</div><div style="padding:18px 30px;background:${BRAND.cream};border-top:1px solid ${BRAND.border};text-align:center;color:${BRAND.muted};font-size:12px;">Wicka Assistance · Études et accompagnement au Maroc<br><a href="mailto:${escapeHtml(cfg.companyEmail)}" style="color:${BRAND.rose};">${escapeHtml(cfg.companyEmail)}</a></div></div></div></body></html>`;
}
function rowsHtml(rows) {
  return rows
    .map(({ label, value, multiline }) => {
      const style = multiline ? ' style="white-space:pre-wrap;"' : '';
      return `<p style="margin:0 0 8px;"><strong style="color:${BRAND.roseDark};">${escapeHtml(label)} :</strong> <span${style}>${escapeHtml(value || 'Non renseigné')}</span></p>`;
    })
    .join('');
}
function rowsText(rows) {
  return rows.map(({ label, value }) => `${label} : ${value || 'Non renseigné'}`).join('\n');
}
function dateFr() {
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'full', timeStyle: 'short', timeZone: 'Africa/Casablanca' }).format(new Date());
}

function buildEmails(type, form, data, page, cfg) {
  const fieldRows = form.fields.map((f) => ({ label: f.label, value: data[f.key], multiline: Boolean(f.multiline) }));
  const received = dateFr();
  const metaRows = [{ label: 'Reçu le', value: received }, { label: 'Page d’origine', value: page || 'Non renseignée' }];
  if (form.consent) metaRows.push({ label: 'Consentement (politique de confidentialité)', value: `Accepté (case cochée) le ${received}` });

  const companyRows = [...fieldRows, ...metaRows];
  const companySubject =
    type === 'contact' ? `[Contact] ${data.subject}` : type === 'candidature' ? `[Candidature] ${data.fullName}` : '[Rappel demandé] Nouvelle demande';
  const companyIntro =
    type === 'callback' ? '<p>Un visiteur souhaite être rappelé par un conseiller Wicka Assistance.</p>' : '';
  const companyOutro =
    type === 'callback' ? '<p>Merci de contacter ce numéro dans le délai annoncé.</p>' : '';

  const company = {
    to: cfg.companyEmail,
    subject: companySubject,
    html: emailLayout(form.companyTitle, `${companyIntro}${rowsHtml(companyRows)}${companyOutro}`, cfg),
    text: `${form.companyTitle}\n\n${rowsText(companyRows)}`,
    replyTo: data.email || undefined
  };

  if (type === 'callback') return { company, user: null };

  const name = type === 'contact' ? data.name : data.fullName;
  const separator = `<hr style="border:0;border-top:1px solid ${BRAND.border};margin:24px 0;">`;
  const disclaimer =
    type === 'candidature'
      ? `<p style="padding:14px 16px;background:${BRAND.light};border-left:4px solid ${BRAND.rose};">Cette confirmation ne constitue pas une garantie d’admission. La décision appartient à l’établissement et, lorsqu’un examen est demandé, au résultat de l’étudiant.</p>`
      : '';
  const intro =
    type === 'contact'
      ? 'Nous avons bien reçu votre message. Notre équipe Wicka Assistance reviendra vers vous dès que possible.'
      : 'Nous confirmons la bonne réception de votre candidature par Wicka Assistance.';
  const userTitle = type === 'contact' ? 'Merci pour votre message' : 'Candidature reçue';
  const userSubject =
    type === 'contact' ? 'Votre message a bien été reçu — Wicka Assistance' : 'Votre candidature a bien été reçue — Wicka Assistance';

  const user = {
    to: data.email,
    subject: userSubject,
    html: emailLayout(
      userTitle,
      `<p>Bonjour ${escapeHtml(name)},</p><p>${intro}</p>${disclaimer}${separator}${rowsHtml(fieldRows)}<p>Merci,<br><strong>Wicka Assistance</strong></p>`,
      cfg
    ),
    text: `Bonjour ${name},\n\n${intro}\n\n${rowsText(fieldRows)}\n\nMerci,\nWicka Assistance`
  };
  return { company, user };
}

/* ============================================================
   Envoi Brevo
   ============================================================ */
async function sendBrevo({ to, subject, html, text, replyTo }, cfg) {
  const payload = {
    sender: { name: cfg.fromName, email: cfg.fromEmail },
    to: [{ email: to }],
    subject: clean(subject, 200),
    htmlContent: html,
    textContent: text
  };
  if (replyTo && validEmail(replyTo)) payload.replyTo = { email: replyTo };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  let response;
  try {
    response = await fetch(BREVO_ENDPOINT, {
      method: 'POST',
      headers: { accept: 'application/json', 'api-key': cfg.apiKey, 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) {
    const detail = await response.text();
    console.error('[brevo] API error', response.status, detail.slice(0, 500));
    throw new Error('Le service e-mail est temporairement indisponible.');
  }
}

/* ============================================================
   Handler
   ============================================================ */
export async function onRequestPost(context) {
  try {
    const { request } = context;

    // 1. Format : JSON uniquement (bloque les envois de formulaires « classiques » venant d'autres sites)
    const contentType = (request.headers.get('content-type') || '').toLowerCase();
    if (!contentType.includes('application/json')) throw new ClientError('Format de requête invalide.', 415);

    // 2. Taille limitée (en-tête annoncé puis taille réellement reçue)
    if (Number(request.headers.get('content-length') || 0) > MAX_BODY_CHARS) throw new ClientError('Requête trop volumineuse.', 413);
    const raw = await request.text();
    if (raw.length > MAX_BODY_CHARS) throw new ClientError('Requête trop volumineuse.', 413);

    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      throw new ClientError('Requête invalide.');
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ClientError('Requête invalide.');

    // 3. Honeypot : champ invisible rempli uniquement par les robots -> on répond « ok » sans rien envoyer
    if (body.website) return Response.json({ ok: true });

    // 4. Validation de TOUS les champs du formulaire (liste blanche)
    const type = clean(body.type, 20);
    const { form, data } = parseForm(type, body);
    const email = data.email || '';
    if (email && !allowRecipient(email)) {
      throw new ClientError('Trop de demandes pour cette adresse e-mail. Réessayez dans quelques minutes.', 429);
    }

    // 5. Envoi : e-mail à l'entreprise (obligatoire), puis confirmation au visiteur (facultative)
    const origin = context.origin || new URL(request.url).origin;
    const cfg = config(context.env || {}, origin);
    const { company, user } = buildEmails(type, form, data, cleanPage(body.page), cfg);

    await sendBrevo(company, cfg);
    if (user) {
      try {
        await sendBrevo(user, cfg);
      } catch (error) {
        // La demande est bien reçue : on ne fait pas échouer le formulaire (le visiteur la renverrait en double).
        console.warn('[send-email] confirmation visiteur non envoyée:', error instanceof Error ? error.message : error);
      }
    }
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof ClientError) {
      const headers = error.status === 429 ? { 'retry-after': '600' } : undefined;
      return Response.json({ error: error.message }, { status: error.status, headers });
    }
    console.error('[send-email]', error instanceof Error ? error.message : error);
    return Response.json({ error: 'Le service est temporairement indisponible.' }, { status: 502 });
  }
}
