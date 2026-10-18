import { onRequestPost } from '../server/send-email.js';
import { pickSiteOrigin } from '../server/site-urls.js';

/**
 * Adaptateur Vercel : toute la logique (champs, validation, sécurité, e-mails) est dans
 * server/send-email.js, partagée avec Cloudflare. Ce fichier ne fait que convertir la requête Vercel
 * (Node) en requête Web standard, puis renvoyer la réponse.
 */

/** Origine réelle de la requête (Vercel) : domaine visité, donc toujours une URL qui fonctionne. */
function requestOrigin(req) {
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  const proto = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
  return host ? `${proto}://${host}` : '';
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée.' });

  const visited = requestOrigin(req);
  const origin = pickSiteOrigin(process.env.PUBLIC_SITE_URL, visited);

  // Origine : uniquement le site lui-même (.com, www, workers.dev, domaine Vercel visité)
  const originHeader = req.headers.origin;
  if (originHeader && originHeader !== origin && originHeader !== visited) {
    return res.status(403).json({ error: 'Origine non autorisée.' });
  }

  let raw = '';
  if (typeof req.body === 'string') raw = req.body;
  else if (Buffer.isBuffer(req.body)) raw = req.body.toString('utf8');
  else raw = JSON.stringify(req.body ?? {});

  const request = new Request(`${visited || 'https://localhost'}/api/send-email`, {
    method: 'POST',
    headers: { 'content-type': String(req.headers['content-type'] || '') },
    body: raw
  });

  const response = await onRequestPost({ request, env: process.env, origin });
  const payload = await response.json().catch(() => ({ error: 'Le service est temporairement indisponible.' }));
  const retryAfter = response.headers.get('retry-after');
  if (retryAfter) res.setHeader('retry-after', retryAfter);
  return res.status(response.status).json(payload);
}
