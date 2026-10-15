# Wicka Assistance

Site vitrine et formulaires d’accompagnement pour les étudiants internationaux souhaitant étudier au Maroc.

## Déploiement Cloudflare Worker

Cette version utilise **Cloudflare Workers**, et non Cloudflare Pages. Le fichier `worker/index.js` sert les fichiers HTML/CSS/JavaScript/images via le binding `ASSETS` et traite `POST /api/send-email` avec Brevo. La configuration `wrangler.jsonc` regroupe le Worker et les assets dans un seul déploiement.

Depuis le tableau de bord Cloudflare, ouvrir **Workers & Pages → Create application → Workers → Import from Git** et connecter le dépôt GitHub `poodasamuelpro/wicka-assistance`, branche `main`. Alternativement, depuis un terminal connecté à Cloudflare :

```bash
npx wrangler deploy
```

## Variables et secrets

Avant le déploiement, ajouter les secrets et variables Worker dans **Settings → Variables and Secrets** ou avec `npx wrangler secret put NOM_DU_SECRET` :

| Variable | Type | Usage |
|---|---|---|
| `BREVO_API_KEY` | Secret | Authentification API Brevo |
| `BREVO_FROM_EMAIL` | Variable | Adresse expéditrice vérifiée |
| `BREVO_FROM_NAME` | Variable | Nom affiché par l’expéditeur |
| `BREVO_COMPANY_EMAIL` | Variable | Adresse de réception de l’entreprise (`wickaassistance@gmail.com`) |
| `PUBLIC_SITE_URL` | Variable publique | Domaine canonique public, sans slash final |
| `BREVO_LOGO_URL` | Variable publique | URL absolue du logo affiché dans les e-mails |

La clé API Brevo doit rester un secret et l’adresse expéditrice doit être vérifiée dans Brevo. Le fichier `.env.example` contient les valeurs et le format attendus.

## Logo officiel

Le logo officiel est stocké dans le dossier public suivant :

```text
assets/images/logo.png
```

Sa route publique canonique est :

```text
/assets/images/logo.png
```

Cette même route doit être conservée partout : ne pas créer une seconde copie ou une autre URL pour le logo.

Le logo est utilisé dans :

- le header principal et le menu mobile des pages concernées ;
- les footers des pages principales ;
- la page de confirmation ;
- le favicon et l’Apple Touch Icon ;
- le champ `Organization.logo` des données structurées SEO ;
- les e-mails Brevo via `BREVO_LOGO_URL`.

Pour Brevo, `BREVO_LOGO_URL` doit être une URL absolue accessible publiquement, par exemple :

```text
https://votre-domaine.com/assets/images/logo.png
```

Si `BREVO_LOGO_URL` n’est pas renseignée, le Worker utilise automatiquement :

```text
${PUBLIC_SITE_URL}/assets/images/logo.png
```

Les images Open Graph utilisent séparément `assets/images/og-share.jpg`, car ce visuel horizontal est adapté aux aperçus sociaux. Le logo reste la référence de marque dans le JSON-LD et les icônes du site.

## Vérifications après déploiement

Après déploiement, remplacer `votre-domaine.com` par le domaine réel et vérifier :

```bash
curl -I https://votre-domaine.com/assets/images/logo.png
curl -I https://votre-domaine.com/
```

Le logo doit répondre en `200` avec un type MIME `image/png`. Vérifier également les routes propres et l’API :

- `GET /`
- `GET /candidature`
- `GET /universites`
- `GET /tarifs`
- `GET /contact`
- `GET /mentions-legales`
- `GET /politique-confidentialite`
- `GET /cgv`
- `GET /merci`
- `POST /api/send-email`

Tester ensuite un formulaire réel après avoir confirmé que les variables Brevo sont présentes. L’endpoint utilisé par le navigateur est `POST /api/send-email`.

Connecter enfin le domaine dans **Custom Domains**. Les URLs canoniques, Open Graph, `sitemap.xml`, `robots.txt` et `llms.txt` sont générées à partir de `PUBLIC_SITE_URL` ; il suffit de modifier cette variable dans Cloudflare si le domaine définitif change.

## Documentation d’audit

Le second audit dédié au logo et à son affichage est disponible dans [`AUDIT_LOGO_SECOND_PASS.md`](./AUDIT_LOGO_SECOND_PASS.md). Il documente les routes testées, l’intégration SEO, les emplacements du site et la simulation d’un e-mail Brevo sans envoi réel.
