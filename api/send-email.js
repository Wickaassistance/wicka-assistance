const BREVO_ENDPOINT = 'https://api.brevo.com/v3/smtp/email';

function text(value, max = 4000) {
  return String(value ?? '').trim().slice(0, max);
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
}

function validPhone(value) {
  const raw = text(value, 40);
  const digits = raw.replace(/\D/g, '');
  return /^[+\d\s().-]+$/.test(raw) && digits.length >= 8 && digits.length <= 15;
}

function escapeHtml(value) {
  return text(value).replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[char]));
}

function config() {
  const required = ['BREVO_API_KEY', 'BREVO_FROM_EMAIL', 'BREVO_COMPANY_EMAIL'];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length) throw new Error(`Configuration Brevo manquante: ${missing.join(', ')}`);
  return {
    apiKey: process.env.BREVO_API_KEY,
    fromEmail: process.env.BREVO_FROM_EMAIL,
    fromName: process.env.BREVO_FROM_NAME || 'Wicka Assistance',
    companyEmail: process.env.BREVO_COMPANY_EMAIL,
  };
}

async function sendBrevo({ to, subject, html, replyTo }) {
  const cfg = config();
  const payload = {
    sender: { name: cfg.fromName, email: cfg.fromEmail },
    to: [{ email: to }],
    subject,
    htmlContent: html,
  };
  if (replyTo && validEmail(replyTo)) payload.replyTo = { email: replyTo };
  const response = await fetch(BREVO_ENDPOINT, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'api-key': cfg.apiKey,
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const detail = await response.text();
    console.error('[brevo] API error', response.status, detail.slice(0, 500));
    throw new Error('Le service e-mail est temporairement indisponible.');
  }
}

function validateCommon(body) {
  const email = text(body.email, 160);
  const phone = text(body.phone || body.whatsapp, 40);
  if (!email || !validEmail(email)) throw new Error('Adresse e-mail invalide.');
  if (!phone || !validPhone(phone)) throw new Error('Numéro de téléphone invalide.');
  return { email, phone };
}

function contactEmails(body, cfg) {
  const { email, phone } = validateCommon(body);
  const name = text(body.name, 100);
  const subject = text(body.subject, 160);
  const message = text(body.message, 4000);
  if (name.length < 2 || subject.length < 3 || message.length < 10) {
    throw new Error('Les champs du contact sont incomplets.');
  }
  const details = `<p><strong>Nom :</strong> ${escapeHtml(name)}</p>
    <p><strong>E-mail :</strong> ${escapeHtml(email)}</p>
    <p><strong>Téléphone :</strong> ${escapeHtml(phone)}</p>
    <p><strong>Sujet :</strong> ${escapeHtml(subject)}</p>
    <p><strong>Message :</strong><br>${escapeHtml(message).replace(/\n/g, '<br>')}</p>`;
  return {
    company: { to: cfg.companyEmail, subject: `[Contact] ${subject}`, html: `<h2>Nouveau message de contact</h2>${details}`, replyTo: email },
    user: { to: email, subject: 'Nous avons bien reçu votre message — Wicka Assistance', html: `<p>Bonjour ${escapeHtml(name)},</p><p>Nous avons bien reçu votre message et vous répondrons sous 72 heures.</p><hr>${details}<p>Merci,<br>Wicka Assistance</p>` },
  };
}

function candidatureEmails(body, cfg) {
  const { email, phone } = validateCommon(body);
  const name = text(body.fullName, 120);
  if (name.length < 2) throw new Error('Nom complet invalide.');
  const labels = [
    ['Nom complet', name], ['Pays', body.country], ['WhatsApp', phone], ['E-mail', email],
    ['Niveau', body.currentLevel], ['Série du bac', body.bacSeries], ['Filière', body.studyDomain],
    ['Ville souhaitée', body.targetCity], ['Université souhaitée', body.targetUniversity],
    ['Formule', body.selectedPack], ['Navette', body.airportTransfer], ['Notes', body.notes],
  ];
  const details = labels.map(([label, value]) => `<p><strong>${label} :</strong> ${escapeHtml(value)}</p>`).join('');
  return {
    company: { to: cfg.companyEmail, subject: `[Candidature] ${name}`, html: `<h2>Nouvelle candidature</h2>${details}`, replyTo: email },
    user: { to: email, subject: 'Votre candidature a bien été reçue — Wicka Assistance', html: `<p>Bonjour ${escapeHtml(name)},</p><p>Nous confirmons la bonne réception de votre candidature.</p><p>Un conseiller vous répondra sous 72 heures. Cette confirmation ne constitue pas une garantie d’admission : la décision appartient à l’établissement et, lorsqu’un examen est demandé, à votre résultat.</p><hr>${details}<p>Merci,<br>Wicka Assistance</p>` },
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée.' });
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const cfg = config();
    const type = text(body.type, 20);
    const emails = type === 'contact' ? contactEmails(body, cfg) : type === 'candidature' ? candidatureEmails(body, cfg) : null;
    if (!emails) return res.status(400).json({ error: 'Type de formulaire inconnu.' });
    await sendBrevo(emails.company);
    await sendBrevo(emails.user);
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('[send-email]', error.message);
    const status = /Configuration|invalide|incomplets|inconnu/.test(error.message) ? 400 : 502;
    return res.status(status).json({ error: error.message || 'Erreur d’envoi.' });
  }
}
