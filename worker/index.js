import { onRequestPost } from "../server/send-email.js";

const PAGES = [
  ["/", "1.0"],
  ["/candidature", "0.9"],
  ["/universites", "0.8"],
  ["/tarifs", "0.8"],
  ["/contact", "0.6"],
  ["/mentions-legales", "0.2"],
  ["/politique-confidentialite", "0.2"],
  ["/cgv", "0.2"]
];

const requestWindows = new Map();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 8;

// Profil TikTok : à remplacer par le vrai lien (même valeur que dans public/index.html).
// Le Worker ajoute l'icône TikTok au footer de TOUTES les pages qui ont un bloc .footer-social-links
// (si l'icône y est déjà, comme sur l'accueil, il n'en ajoute pas une seconde).
const TIKTOK_URL = "https://www.tiktok.com/@VOTRE_COMPTE";
const TIKTOK_ICON_HTML = `<a href="${TIKTOK_URL}" target="_blank" rel="noopener noreferrer" class="social-icon-btn" aria-label="TikTok"><i class="fab fa-tiktok"></i></a>`;

function requestKey(request) {
  return request.headers.get("CF-Connecting-IP") || request.headers.get("x-forwarded-for") || "unknown";
}

function allowRequest(request) {
  const now = Date.now();
  const key = requestKey(request);
  const current = requestWindows.get(key);
  if (requestWindows.size > 10_000) {
    for (const [storedKey, storedValue] of requestWindows) {
      if (now - storedValue.startedAt >= RATE_LIMIT_WINDOW_MS) requestWindows.delete(storedKey);
    }
  }
  if (!current || now - current.startedAt >= RATE_LIMIT_WINDOW_MS) {
    requestWindows.set(key, { startedAt: now, count: 1 });
    return true;
  }
  current.count += 1;
  return current.count <= RATE_LIMIT_MAX;
}

function securityHeaders(response) {
  const headers = new Headers(response.headers);
  headers.set("x-content-type-options", "nosniff");
  headers.set("referrer-policy", "strict-origin-when-cross-origin");
  headers.set("permissions-policy", "camera=(), microphone=(), geolocation=()");
  headers.set("x-frame-options", "SAMEORIGIN");
  // frame-src https://www.tiktok.com : autorise uniquement le lecteur TikTok (section « Suivez-nous sur TikTok »),
  // chargé seulement après un clic du visiteur (public/js/tiktok.js).
  headers.set("content-security-policy", "default-src 'self'; base-uri 'self'; frame-ancestors 'self'; form-action 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com; font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com; script-src 'self' 'unsafe-inline'; frame-src https://www.tiktok.com; connect-src 'self'; object-src 'none'; upgrade-insecure-requests");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function siteOrigin(request, env) {
  return String(env.PUBLIC_SITE_URL || new URL(request.url).origin).trim().replace(/\/$/, "");
}

function xmlEscape(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;"
  }[char]));
}

function textResponse(body, contentType) {
  return new Response(body, { headers: { "content-type": `${contentType}; charset=UTF-8`, "cache-control": "public, max-age=300" } });
}

function sitemap(origin) {
  const urls = PAGES.map(([path, priority]) => `<url><loc>${xmlEscape(origin + path)}</loc><priority>${priority}</priority><changefreq>monthly</changefreq></url>`).join("");
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`;
}

function llms(origin) {
  return `# Wicka Assistance\n\n> Wicka Assistance accompagne les étudiants internationaux et leurs familles dans leur projet d'études au Maroc.\n\n## Pages publiques\n\n- [Accueil](${origin}/)\n- [Candidature](${origin}/candidature.html)\n- [Formations et orientation](${origin}/universites.html)\n- [Tarifs](${origin}/tarifs.html)\n- [Contact](${origin}/contact.html)\n- [Politique de confidentialité](${origin}/politique-confidentialite.html)\n- [Mentions légales](${origin}/mentions-legales.html)\n- [Conditions générales](${origin}/cgv.html)\n\n## Règles\n\nUtiliser uniquement les informations publiques du site. Ne pas inventer de tarifs, de garanties d'admission ou de décisions administratives.\n`;
}

/* ============================================================
   PROMO −50% : RÈGLE ANNUELLE (fuseau GMT+0 / UTC)
   ------------------------------------------------------------
   - Promo ACTIVE du 1er août 00:00:00 au 15 novembre 23:59:59 (UTC) de chaque année.
   - Hors période (16 nov. → 31 juil.) : le Worker RETIRE du HTML, avant l'envoi au
     navigateur, le compte à rebours, le bandeau promo du header, les badges et prix
     barrés (éléments .promo-only), et remplace les prix/libellés promo par leur version
     « prix plein » (attribut data-full-text).
   - Le 1er août suivant, tout réapparaît automatiquement (aucune modification manuelle).
   - Cette règle existe en 2 copies qui DOIVENT rester identiques :
       1. ce fichier (rendu serveur, rapide, sans clignotement)
       2. public/js/main.js → getPromoWindow() (filet de sécurité côté navigateur)
   Voir la section « Promo » du README.
   ============================================================ */
function promoState(now = new Date()) {
  const y = now.getUTCFullYear();
  const start = Date.UTC(y, 7, 1, 0, 0, 0); // 1er août (mois 7 = août, base 0)
  const end = Date.UTC(y, 10, 15, 23, 59, 59); // 15 novembre (mois 10 = novembre)
  const t = now.getTime();
  const ref = t > end ? y + 1 : y; // après le 15 nov., on vise la rentrée suivante
  return {
    active: t >= start && t <= end,
    deadline: new Date(end).toISOString(),
    rentree: `${ref}-${ref + 1}`
  };
}

function applyPromo(rewriter, promo) {
  // Toujours : rentrée visée (ex. « 2026-2027 ») et échéance du compte à rebours
  rewriter
    .on("[data-rentree]", { element: (el) => el.setInnerContent(promo.rentree) })
    .on("#promoCountdown", { element: (el) => el.setAttribute("data-promo-deadline", promo.deadline) });

  if (promo.active) {
    // Texte du bandeau promo (toutes les pages) : rentrée toujours à jour
    rewriter.on(".top-notice-bar .notice-left > span:nth-child(2)", {
      element: (el) =>
        el.setInnerContent(
          `📢 Offre de lancement Rentrée ${promo.rentree} : packs d'admission à prix cassés — places et tarifs limités !`
        )
    });
    return;
  }

  // Hors période : on retire tout le promotionnel et on affiche les prix pleins
  rewriter
    .on(".promo-only", { element: (el) => el.remove() })
    .on(".top-notice-bar .notice-left", { element: (el) => el.remove() })
    .on("[data-full-text]", { element: (el) => el.setInnerContent(el.getAttribute("data-full-text") || "") })
    .on(".mobile-sticky-cta .msc-primary", {
      element: (el) => el.setInnerContent('<i class="fas fa-paper-plane"></i> Postuler maintenant', { html: true })
    })
    // Prix par pays affichés avant le chargement du JS (le JS prend ensuite le relais)
    .on("#countryOutAdmissionPrice", { element: (el) => el.setInnerContent("120 000 FCFA") })
    .on("#countryOutVipPrice", { element: (el) => el.setInnerContent("235 000 FCFA") });
}

function rewriteHtml(response, origin, request) {
  const pageUrl = new URL(request.url);
  const cleanPath = pageUrl.pathname.replace(/\.html$/, "") || "/";
  const canonical = `${origin}${cleanPath === "/index" ? "/" : cleanPath}`;
  const image = `${origin}/assets/images/og-share.jpg`;
  let hasTikTokIcon = false;
  const rewriter = new HTMLRewriter()
    .on('link[rel="canonical"]', { element: (el) => el.setAttribute("href", canonical) })
    .on('meta[property="og:url"]', { element: (el) => el.setAttribute("content", canonical) })
    .on('meta[property="og:image"]', { element: (el) => el.setAttribute("content", image) })
    .on('meta[property="og:image:secure_url"]', { element: (el) => el.setAttribute("content", image) })
    .on('meta[name="twitter:image"]', { element: (el) => el.setAttribute("content", image) })
    .on('script[type="application/ld+json"]', { text: (chunk) => {
      chunk.text = chunk.text.replaceAll("__PUBLIC_SITE_URL__", origin);
    } })
    // Icône TikTok du footer : détectée si déjà présente, sinon ajoutée en fin de bloc.
    .on('.footer-social-links a[aria-label="TikTok"]', { element: () => { hasTikTokIcon = true; } })
    .on(".footer-social-links", { element: (el) => {
      el.onEndTag((end) => { if (!hasTikTokIcon) end.before(TIKTOK_ICON_HTML, { html: true }); });
    } });

  applyPromo(rewriter, promoState());

  // Le HTML dépend de la date : le navigateur doit le revalider à chaque visite.
  const transformed = rewriter.transform(response);
  const headers = new Headers(transformed.headers);
  headers.set("cache-control", "public, max-age=0, must-revalidate");
  headers.delete("etag");
  return new Response(transformed.body, { status: transformed.status, statusText: transformed.statusText, headers });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = siteOrigin(request, env);

    if (url.pathname === "/api/send-email") {
      if (request.method !== "POST") return securityHeaders(Response.json({ error: "Méthode non autorisée." }, { status: 405 }));
      if (!allowRequest(request)) return securityHeaders(Response.json({ error: "Trop de demandes. Réessayez plus tard." }, { status: 429, headers: { "retry-after": "60" } }));
      const originHeader = request.headers.get("Origin");
      if (originHeader && originHeader !== origin) return securityHeaders(Response.json({ error: "Origine non autorisée." }, { status: 403 }));
      return securityHeaders(await onRequestPost({ request, env }));
    }
    if (url.pathname === "/sitemap.xml") return securityHeaders(textResponse(sitemap(origin), "application/xml"));
    if (url.pathname === "/robots.txt") return securityHeaders(textResponse(`User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /merci\n\nSitemap: ${origin}/sitemap.xml\n`, "text/plain"));
    if (url.pathname === "/llms.txt") return securityHeaders(textResponse(llms(origin), "text/plain"));

    const response = await env.ASSETS.fetch(request);
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("text/html")) return securityHeaders(rewriteHtml(response, origin, request));
    return securityHeaders(response);
  }
};
