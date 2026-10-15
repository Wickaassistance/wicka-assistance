import { onRequestPost } from "../server/send-email.js";

const PAGES = [
  ["/", "1.0"],
  ["/candidature.html", "0.9"],
  ["/universites.html", "0.8"],
  ["/tarifs.html", "0.8"],
  ["/contact.html", "0.6"],
  ["/mentions-legales.html", "0.2"],
  ["/politique-confidentialite.html", "0.2"],
  ["/cgv.html", "0.2"]
];

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
  const canonical = `${origin}${pageUrl.pathname === "/index.html" ? "/" : pageUrl.pathname}`;
  const image = `${origin}/assets/images/og-share.jpg`;
  return new HTMLRewriter()
    .on('link[rel="canonical"]', { element: (el) => el.setAttribute("href", canonical) })
    .on('meta[property="og:url"]', { element: (el) => el.setAttribute("content", canonical) })
    .on('meta[property="og:image"]', { element: (el) => el.setAttribute("content", image) })
    .on('meta[property="og:image:secure_url"]', { element: (el) => el.setAttribute("content", image) })
    .on('meta[name="twitter:image"]', { element: (el) => el.setAttribute("content", image) })
    .on('script[type="application/ld+json"]', { text: (text) => text.replace(text.text.replaceAll("__PUBLIC_SITE_URL__", origin), true) })
    .transform(response);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = siteOrigin(request, env);

    if (url.pathname === "/api/send-email") {
      if (request.method !== "POST") return Response.json({ error: "Méthode non autorisée." }, { status: 405 });
      return onRequestPost({ request, env });
    }
    if (url.pathname === "/sitemap.xml") return textResponse(sitemap(origin), "application/xml");
    if (url.pathname === "/robots.txt") return textResponse(`User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /merci.html\n\nSitemap: ${origin}/sitemap.xml\n`, "text/plain");
    if (url.pathname === "/llms.txt") return textResponse(llms(origin), "text/plain");

    const response = await env.ASSETS.fetch(request);
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("text/html")) return rewriteHtml(response, origin, request);
    return response;
  }
};
