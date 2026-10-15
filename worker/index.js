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
  headers.set("content-security-policy", "default-src 'self'; base-uri 'self'; frame-ancestors 'self'; form-action 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com; font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com; script-src 'self' 'unsafe-inline'; connect-src 'self'; object-src 'none'; upgrade-insecure-requests");
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

function rewriteHtml(response, origin, request) {
  const pageUrl = new URL(request.url);
  const cleanPath = pageUrl.pathname.replace(/\.html$/, "") || "/";
  const canonical = `${origin}${cleanPath === "/index" ? "/" : cleanPath}`;
  const image = `${origin}/assets/images/og-share.jpg`;
  return new HTMLRewriter()
    .on('link[rel="canonical"]', { element: (el) => el.setAttribute("href", canonical) })
    .on('meta[property="og:url"]', { element: (el) => el.setAttribute("content", canonical) })
    .on('meta[property="og:image"]', { element: (el) => el.setAttribute("content", image) })
    .on('meta[property="og:image:secure_url"]', { element: (el) => el.setAttribute("content", image) })
    .on('meta[name="twitter:image"]', { element: (el) => el.setAttribute("content", image) })
    .on('script[type="application/ld+json"]', { text: (chunk) => {
      chunk.text = chunk.text.replaceAll("__PUBLIC_SITE_URL__", origin);
    } })
    .transform(response);
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
