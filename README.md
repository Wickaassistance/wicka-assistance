

## Déploiement Cloudflare Worker

Cette version utilise **Cloudflare Workers**, et non Cloudflare Pages. Le fichier `worker/index.js` sert les fichiers HTML/CSS/JavaScript/images via le binding `ASSETS` et traite `POST /api/send-email` avec Brevo. La configuration `wrangler.jsonc` regroupe le Worker et les assets dans un seul déploiement.

Depuis le tableau de bord Cloudflare, ouvrir **Workers & Pages → Create application → Workers → Import from Git** et connecter le dépôt GitHub `poodasamuelpro/wicka-assistance`, branche `main`. Alternativement, depuis un terminal connecté à Cloudflare, utiliser `npx wrangler deploy` à la racine du projet.

Avant le déploiement, ajouter les secrets et variables Worker suivants dans **Settings → Variables and Secrets** ou avec `npx wrangler secret put NOM_DU_SECRET` : `BREVO_API_KEY`, `BREVO_FROM_EMAIL`, `BREVO_FROM_NAME`, `BREVO_COMPANY_EMAIL`, `PUBLIC_SITE_URL` comme variable publique, et `BREVO_LOGO_URL` comme variable publique. La clé API Brevo doit rester un secret et l’adresse expéditrice doit être vérifiée dans Brevo.

Après déploiement, vérifier l’adresse du Worker puis tester un formulaire réel. L’endpoint utilisé par le navigateur est `POST /api/send-email`. Connecter ensuite le domaine dans **Custom Domains**. Les URLs canoniques, Open Graph, `sitemap.xml`, `robots.txt` et `llms.txt` sont générées à partir de `PUBLIC_SITE_URL`; il suffit de modifier cette variable dans Cloudflare.
