// server/site-urls.js
// PUBLIC_SITE_URL accepte 1 à 3 adresses séparées par une virgule (ou ; | espace).
// Ex : "https://wickaassistance.com,https://wickaassistance.wickaassistance.workers.dev"
// Utilisé par le Worker (worker/index.js), l'API e-mail (server/send-email.js, api/send-email.js)
// et le cron Brevo (server/brevo-keepalive.js).

/**
 * Transforme "https://a.com, https://b.workers.dev" en ["https://a.com", "https://b.workers.dev"].
 * Ajoute https:// si absent, retire le chemin et le slash final, supprime les doublons, 3 adresses max.
 */
export function parseSiteUrls(raw) {
  const out = [];
  for (const part of String(raw ?? '').split(/[\s,;|]+/)) {
    const value = part.trim();
    if (!value) continue;
    try {
      const origin = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`).origin;
      if (!out.includes(origin)) out.push(origin);
    } catch {
      // adresse invalide : ignorée
    }
  }
  return out.slice(0, 3);
}

const stripWww = (host) => host.replace(/^www\./i, '');

/**
 * Origine publique à utiliser pour une requête :
 * - si le domaine visité fait partie de PUBLIC_SITE_URL -> cette adresse (.com ou workers.dev)
 * - sinon (variable vide, localhost, autre domaine...) -> l'origine de la requête, donc toujours une URL qui fonctionne.
 */
export function pickSiteOrigin(raw, requestOrigin) {
  if (!requestOrigin) return parseSiteUrls(raw)[0] || '';
  const host = new URL(requestOrigin).host;
  const match = parseSiteUrls(raw).find((origin) => stripWww(new URL(origin).host) === stripWww(host));
  return match ?? requestOrigin;
}

/** Idem pour un objet Request (Cloudflare Workers). */
export function siteOriginFor(request, raw) {
  return pickSiteOrigin(raw, new URL(request.url).origin);
}
