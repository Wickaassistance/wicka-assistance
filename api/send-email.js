const BREVO_ENDPOINT = 'https://api.brevo.com/v3/smtp/email';
const BRAND = { rose: '#9f1239', roseDark: '#881337', gold: '#f59e0b', ink: '#1f2937', muted: '#64748b', light: '#fff1f2' };

function text(value, max = 4000) { return String(value ?? '').trim().slice(0, max); }
function validEmail(value) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value); }
function validPhone(value) {
  const raw = text(value, 40);
  const digits = raw.replace(/\D/g, '');
  return /^[+\d\s().-]+$/.test(raw) && digits.length >= 8 && digits.length <= 15;
}
function escapeHtml(value) {
  return text(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}
function config() {
  const required = ['BREVO_API_KEY', 'BREVO_FROM_EMAIL', 'BREVO_COMPANY_EMAIL'];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length) throw new Error(`Configuration Brevo manquante: ${missing.join(', ')}`);
  const siteUrl = (process.env.PUBLIC_SITE_URL || '').replace(/\/$/, '');
  return {
    apiKey: process.env.BREVO_API_KEY,
    fromEmail: process.env.BREVO_FROM_EMAIL,
    fromName: process.env.BREVO_FROM_NAME || 'Wicka Assistance',
    companyEmail: process.env.BREVO_COMPANY_EMAIL,
    logoUrl: process.env.BREVO_LOGO_URL || (siteUrl ? `${siteUrl}/assets/images/logo.png` : ''),
  };
}
function emailLayout(title, content, cfg) {
  const logo = cfg.logoUrl ? `<img src="${escapeHtml(cfg.logoUrl)}" alt="Wicka Assistance" style="display:block;max-width:220px;max-height:72px;margin:0 auto 22px;object-fit:contain;">` : `<div style="font-size:24px;font-weight:800;letter-spacing:.08em;color:${BRAND.rose};margin-bottom:22px;">WICKA<span style="color:${BRAND.gold};">.</span></div>`;
  return `<!doctype html><html lang="fr"><body style="margin:0;background:${BRAND.light};font-family:Arial,Helvetica,sans-serif;color:${BRAND.ink};"><div style="padding:28px 12px;"><div style="max-width:650px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 8px 30px rgba(136,19,55,.10);"><div style="height:6px;background:linear-gradient(90deg,${BRAND.rose},${BRAND.gold});"></div><div style="padding:34px 30px 28px;text-align:center;">${logo}<h1 style="margin:0;color:${BRAND.roseDark};font-size:23px;line-height:1.3;">${escapeHtml(title)}</h1></div><div style="padding:0 30px 30px;font-size:15px;line-height:1.7;">${content}</div><div style="padding:18px 30px;background:#fff7ed;border-top:1px solid #ffe4e6;text-align:center;color:${BRAND.muted};font-size:12px;">Wicka Assistance · Études et accompagnement au Maroc<br><a href="mailto:${escapeHtml(cfg.companyEmail)}" style="color:${BRAND.rose};">${escapeHtml(cfg.companyEmail)}</a></div></div></div></body></html>`;
}
async function sendBrevo({ to, subject, html, replyTo }) {
  const cfg = config();
  const payload = { sender: { name: cfg.fromName, email: cfg.fromEmail }, to: [{ email: to }], subject, htmlContent: html };
  if (replyTo && validEmail(replyTo)) payload.replyTo = { email: replyTo };
  const response = await fetch(BREVO_ENDPOINT, { method: 'POST', headers: { accept: 'application/json', 'api-key': cfg.apiKey, 'content-type': 'application/json' }, body: JSON.stringify(payload) });
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
  const name = text(body.name, 100), subject = text(body.subject, 160), message = text(body.message, 4000);
  if (name.length < 2 || subject.length < 3 || message.length < 10) throw new Error('Les champs du contact sont incomplets.');
  const details = `<p><strong>Nom :</strong> ${escapeHtml(name)}</p><p><strong>E-mail :</strong> ${escapeHtml(email)}</p><p><strong>Téléphone :</strong> ${escapeHtml(phone)}</p><p><strong>Sujet :</strong> ${escapeHtml(subject)}</p><p><strong>Message :</strong><br>${escapeHtml(message).replace(/\n/g, '<br>')}</p>`;
  return { company: { to: cfg.companyEmail, subject: `[Contact] ${subject}`, html: emailLayout('Nouveau message de contact', details, cfg), replyTo: email }, user: { to: email, subject: 'Votre message a bien été reçu — Wicka Assistance', html: emailLayout('Merci pour votre message', `<p>Bonjour ${escapeHtml(name)},</p><p>Nous avons bien reçu votre message. Notre équipe reviendra vers vous dès que possible.</p><hr style="border:0;border-top:1px solid #ffe4e6;margin:24px 0;">${details}<p>Merci,<br><strong>Wicka Assistance</strong></p>`, cfg) } };
}
function candidatureEmails(body, cfg) {
  const { email, phone } = validateCommon(body);
  const name = text(body.fullName, 120);
  if (name.length < 2) throw new Error('Nom complet invalide.');
  const labels = [['Nom complet', name], ['Pays', body.country], ['WhatsApp', phone], ['E-mail', email], ['Niveau', body.currentLevel], ['Série du bac', body.bacSeries], ['Filière', body.studyDomain], ['Ville souhaitée', body.targetCity], ['Université souhaitée', body.targetUniversity], ['Formule', body.selectedPack], ['Navette', body.airportTransfer], ['Notes', body.notes]];
  const details = labels.map(([label, value]) => `<p><strong>${label} :</strong> ${escapeHtml(value)}</p>`).join('');
  const disclaimer = `<p style="padding:14px 16px;background:${BRAND.light};border-left:4px solid ${BRAND.rose};">Cette confirmation ne constitue pas une garantie d’admission. La décision appartient à l’établissement et, lorsqu’un examen est demandé, au résultat de l’étudiant.</p>`;
  return { company: { to: cfg.companyEmail, subject: `[Candidature] ${name}`, html: emailLayout('Nouvelle candidature', details, cfg), replyTo: email }, user: { to: email, subject: 'Votre candidature a bien été reçue — Wicka Assistance', html: emailLayout('Candidature reçue', `<p>Bonjour ${escapeHtml(name)},</p><p>Nous confirmons la bonne réception de votre candidature.</p>${disclaimer}<hr style="border:0;border-top:1px solid #ffe4e6;margin:24px 0;">${details}<p>Merci,<br><strong>Wicka Assistance</strong></p>`, cfg) } };
}
function callbackEmail(body, cfg) {
  const phone = text(body.phone, 40);
  if (!phone || !validPhone(phone)) throw new Error('Numéro de téléphone invalide.');
  const name = text(body.name, 100) || 'Non renseigné';
  return { to: cfg.companyEmail, subject: `[Rappel demandé] ${phone}`, html: emailLayout('Nouvelle demande de rappel', `<p>Un visiteur demande à être rappelé.</p><p><strong>Nom :</strong> ${escapeHtml(name)}</p><p><strong>Numéro WhatsApp/téléphone :</strong> ${escapeHtml(phone)}</p><p>Le conseiller doit maintenant contacter ce numéro manuellement. Cette demande n’est pas enregistrée dans une base de données.</p>`, cfg) };
}
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée.' });
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const cfg = config();
    const type = text(body.type, 20);
    if (type === 'callback') { await sendBrevo(callbackEmail(body, cfg)); return res.status(200).json({ ok: true }); }
    const emails = type === 'contact' ? contactEmails(body, cfg) : type === 'candidature' ? candidatureEmails(body, cfg) : null;
    if (!emails) return res.status(400).json({ error: 'Type de formulaire inconnu.' });
    await sendBrevo(emails.company); await sendBrevo(emails.user);
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('[send-email]', error.message);
    const status = /Configuration|invalide|incomplets|inconnu/.test(error.message) ? 400 : 502;
    return res.status(status).json({ error: error.message || 'Erreur d’envoi.' });
  }
}
