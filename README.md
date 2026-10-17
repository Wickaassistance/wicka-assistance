# Wicka Assistance

Site vitrine et formulaires d’accompagnement pour les étudiants internationaux souhaitant étudier au Maroc.

## Déploiement Cloudflare Worker

Cette version utilise **Cloudflare Workers**, et non Cloudflare Pages. Le fichier `worker/index.js` sert les fichiers HTML/CSS/JavaScript/images via le binding `ASSETS` et traite `POST /api/send-email` avec Brevo. La configuration `wrangler.jsonc` regroupe le Worker et les assets dans un seul déploiement.

Depuis le tableau de bord Cloudflare, ouvrir **Workers & Pages → Create application → Workers → Import from Git** et connecter le dépôt GitHub `poodasamuelpro/wicka-assistance`, branche `main`. Alternativement, depuis un terminal connecté à Cloudflare :

```bash
npx wrangler deploy
```

## Promo −50 % et compte à rebours (règle annuelle automatique)

**Fuseau : GMT+0 (UTC).** Aucune modification manuelle n’est nécessaire d’une année à l’autre.

| Période (UTC)                          | État de la promo                                                                               |
| -------------------------------------- | ---------------------------------------------------------------------------------------------- |
| 1er août 00:00:00 → 15 nov. 23:59:59   | **Active** : compte à rebours, bandeau du header, badges, prix barrés, libellés « Promo −50 % » |
| 16 novembre → 31 juillet               | **Masquée** : rien de promotionnel n’est affiché, les prix pleins apparaissent                  |

Le 1er août suivant, tout réapparaît automatiquement, avec une échéance au 15 novembre de l’année en cours. L’année de rentrée affichée (ex. `2026-2027`) passe à l’année suivante après le 15 novembre.

### Comment ça marche (2 couches)

1. **Worker (`worker/index.js`) — rendu serveur, sans clignotement.** La fonction `promoState()` calcule l’état à chaque requête. Avec `HTMLRewriter`, le Worker modifie le HTML avant de l’envoyer :
   - hors période : retire les éléments `.promo-only` et le bandeau promo `.top-notice-bar .notice-left`, remplace le contenu des éléments `data-full-text` par leur valeur « prix plein », change le libellé de la barre mobile en « Postuler maintenant » et affiche les prix pleins par pays ;
   - pendant la période : met à jour le texte du bandeau (rentrée) et fournit l’échéance au compte à rebours (`data-promo-deadline`) ;
   - dans tous les cas : met à jour les éléments `[data-rentree]`.
   Les pages HTML sont servies avec `cache-control: public, max-age=0, must-revalidate` car leur contenu dépend de la date.
2. **Navigateur (`public/js/main.js`) — filet de sécurité.** `getPromoWindow()` applique la même règle : décompte à la seconde, retrait des éléments promo à l’échéance si la page reste ouverte, bascule vers les prix pleins (`showFullTexts()`), mise à jour de la rentrée (`applyRentree()`) et prix par pays selon la période.

> `promoState()` (Worker) et `getPromoWindow()` (`main.js`) doivent rester **identiques**. La date de fin ne s’écrit jamais dans un fichier HTML.

### Convention pour les pages HTML

- Tout élément promotionnel : `class="promo-only"` (ruban, badge, prix barré, pourcentage, compte à rebours…).
- Tout prix ou texte promo qui doit changer hors période : `data-full-text="valeur hors promo"` (le contenu affiché est la version promo).
- Année de rentrée : `<span data-rentree>2026-2027</span>`.
- Le bandeau du header et la barre CTA mobile sont gérés automatiquement sur **toutes** les pages (sélecteurs `.top-notice-bar .notice-left` et `.mobile-sticky-cta .msc-primary`) : aucune classe à ajouter.
- Compte à rebours : pas d’attribut de date dans le HTML (`#promoCountdown` reçoit `data-promo-deadline` du Worker, ou `main.js` calcule l’échéance).

### Test de la règle

Dans `worker/index.js` (`promoState`) et `public/js/main.js` (`getPromoWindow`, `getRentree`), passer temporairement une date factice, par exemple `new Date("2026-11-16T00:00:00Z")` : tout le promo doit disparaître et les prix pleins s’afficher ; avec `2026-08-01T00:00:00Z`, tout doit revenir. Remettre ensuite le code normal. En local : `npx wrangler dev`.

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

Vérifier aussi la promo : pendant la période (1er août → 15 novembre), le compte à rebours décompte sur `/`, le ruban et les prix barrés s’affichent sur `/tarifs` ; hors période, ils sont absents et les prix pleins (590, 1 990 et 3 890 DH) s’affichent.

Tester ensuite un formulaire réel après avoir confirmé que les variables Brevo sont présentes. L’endpoint utilisé par le navigateur est `POST /api/send-email`.

Connecter enfin le domaine dans **Custom Domains**. Les URLs canoniques, Open Graph, `sitemap.xml`, `robots.txt` et `llms.txt` sont générées à partir de `PUBLIC_SITE_URL` ; il suffit de modifier cette variable dans Cloudflare si le domaine définitif change.

## Documentation d’audit

Le second audit dédié au logo et à son affichage est disponible dans [`AUDIT_LOGO_SECOND_PASS.md`](./AUDIT_LOGO_SECOND_PASS.md). Il documente les routes testées, l’intégration SEO, les emplacements du site et la simulation d’un e-mail Brevo sans envoi réel.
