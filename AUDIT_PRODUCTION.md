# Audit production — Wicka Assistance

**Date :** 15 octobre 2026  
**Dépôt audité :** `poodasamuelpro/wicka-assistance`  
**Commit analysé :** `9abdde4` (`main`)  
**Périmètre :** HTML, CSS, JavaScript navigateur, Worker Cloudflare, API Brevo, configuration de déploiement, formulaires, SEO, sécurité, conformité et vérifications locales.

## Verdict exécutif

Le projet est un site statique bien structuré, sans erreur de syntaxe JavaScript détectée, et le `wrangler deploy --dry-run` passe. En revanche, il ne doit pas être publié tel quel :

- **BLOQUANT — Worker :** le traitement de réécriture HTML/JSON-LD est incorrect et dépend d’un comportement non conforme de `HTMLRewriter`.
- **BLOQUANT — Formulaires :** l’endpoint Brevo est public, sans limitation de débit, anti-bot, quota ni observabilité ; il peut être abusé pour envoyer du spam et dégrader la réputation du domaine.
- **ÉLEVÉ — SEO/déploiement :** les fichiers `.html` redirigent vers des URLs propres, alors que le sitemap, les liens canoniques générés et plusieurs liens internes utilisent encore les URLs `.html`.
- **ÉLEVÉ — XSS DOM :** plusieurs valeurs sont injectées par `innerHTML` sans échappement, notamment la recherche FAQ et les données conservées dans `sessionStorage`.
- **ÉLEVÉ — conformité/contenu commercial :** le site affiche des affirmations potentiellement trompeuses ou non vérifiables (« admission garantie », « 98 % de visa obtenu », « 100 % avec Wicka », délai de rappel de 30 minutes) alors que les CGV indiquent l’absence de garantie.
- **MOYEN — qualité livraison :** aucune suite de tests, aucun lockfile/package manifest, aucun pipeline CI, aucun contrôle HTML/accessibilité, aucune stratégie d’erreur ou de monitoring formalisée.

## Vérifications exécutées

| Vérification | Résultat |
|---|---|
| `node --check` sur `worker/index.js`, `server/send-email.js`, `api/send-email.js`, `js/main.js`, `js/data.js` | OK |
| `npx wrangler deploy --dry-run` | OK — 99 fichiers lus, assets détectés |
| Rendu local via `wrangler dev` | Pages servies ; les `.html` redirigent vers les URLs propres |
| Requête API invalide sans secrets | Réponse JSON contrôlée, mais configuration manquante révélée en clair |
| Vérification SRI Font Awesome | **Échec sur `contact.html`** |
| Scan des secrets committés dans l’historique | Aucun secret Brevo trouvé dans l’historique inspecté |
| Dépendances et tests automatisés | Absents |

## Constats détaillés

### 1. [BLOQUANT] Réécriture JSON-LD du Worker incorrecte

**Fichier :** `worker/index.js:41-48`

Le code utilise :

```js
.on('script[type="application/ld+json"]', {
  text: (text) => text.replace(text.text.replaceAll("__PUBLIC_SITE_URL__", origin), true)
})
```

Le callback `text` reçoit un objet chunk de `HTMLRewriter`, pas une chaîne. La modification doit se faire sur `text.text` (en tenant compte des chunks et de `lastInTextNode`), par exemple avec `text.text = text.text.replace(...)`. La forme actuelle est fragile et peut casser le rendu de la page contenant le JSON-LD, ou ne pas remplacer le placeholder selon le runtime.

**Impact :** pages potentiellement servies avec erreur Worker ou données structurées invalides ; SEO et disponibilité affectés.

**Correction recommandée :** implémenter un handler textuel correct, tester le rendu de `/` avec le JSON-LD, puis ajouter un test de non-présence de `__PUBLIC_SITE_URL__` dans la réponse finale.

### 2. [BLOQUANT] Endpoint e-mail publiquement abus-able

**Fichiers :** `worker/index.js:56-59`, `server/send-email.js:44-52,100-119`, `api/send-email.js:44-52,100-118`

`POST /api/send-email` accepte des requêtes anonymes et appelle Brevo directement. Il n’y a :

- aucun rate limit par IP, pays ou empreinte ;
- aucun CAPTCHA ou honeypot ;
- aucun quota quotidien ;
- aucune protection anti-rejeu ;
- aucune validation de l’origine/du `Host` côté Worker ;
- aucun timeout applicatif autour de `fetch` vers Brevo ;
- aucune file, déduplication ou idempotence ;
- aucun monitoring d’échecs, de volume ou de quota Brevo.

Un attaquant peut donc automatiser des candidatures/contact/rappels et provoquer du spam, une consommation de quota, des blocages Brevo ou une mauvaise réputation d’expédition.

**Correction minimale avant production :** rate limiting Cloudflare (au minimum par IP et route), honeypot côté formulaire, délai minimal entre soumissions, validation stricte des valeurs énumérées, journalisation sans données personnelles et alerte sur les erreurs/volumes. Pour un niveau supérieur : Turnstile ou autre anti-bot, KV/Durable Object pour l’anti-rejeu et file asynchrone.

### 3. [ÉLEVÉ] Réponse d’erreur trop bavarde en production

**Fichiers :** `server/send-email.js:23-27,112-118`, `api/send-email.js:23-27,112-115`

Les erreurs retournées au navigateur peuvent contenir la configuration manquante (`BREVO_API_KEY`, etc.) ou des messages internes. C’est utile en développement, mais cela divulgue la configuration de déploiement en production.

**Correction :** journaliser le détail côté serveur avec un identifiant de corrélation et retourner un message générique au client. Réserver le détail aux environnements non production.

### 4. [ÉLEVÉ] Incohérence entre URLs propres, liens `.html` et sitemap

**Preuve locale :**

- `/contact.html` répond `307` vers `/contact` ;
- `/universites.html` répond `307` vers `/universites` ;
- `/candidature.html` répond `307` vers `/candidature` ;
- `/merci.html` répond `307` vers `/merci` ;
- `sitemap()` dans `worker/index.js:3-12` publie encore les chemins `.html` ;
- `llms()` dans `worker/index.js:33-35` publie encore les chemins `.html` ;
- `rewriteHtml()` calcule le canonical depuis le chemin réellement reçu (`worker/index.js:39`).

**Impact :** chaîne de redirection inutile, signaux SEO contradictoires, risques de canonical incohérent et expérience moins propre pour les crawlers.

**Correction :** choisir un seul format canonique. Recommandation : URLs propres `/`, `/contact`, `/candidature`, etc. Puis aligner `PAGES`, `sitemap.xml`, `llms.txt`, liens internes, redirections et canoniques sur ce format.

### 5. [ÉLEVÉ] XSS DOM dans la recherche FAQ

**Fichier :** `js/main.js:729-741`

La valeur saisie par l’utilisateur est réinjectée sans échappement dans `innerHTML` :

```js
<p>Aucune réponse trouvée pour "${filter}" ...</p>
```

Une recherche contenant du HTML ou du JavaScript peut donc créer du contenu DOM non sûr.

**Correction :** utiliser `textContent` pour la partie dynamique, construire les nœuds avec DOM APIs, ou appliquer une fonction d’échappement dédiée. Éviter de mettre des entrées utilisateur dans `innerHTML`.

### 6. [ÉLEVÉ] XSS possible dans le résumé de candidature

**Fichier :** `js/main.js:682-697`

`showSubmissionSuccessModal(data)` injecte directement `data.fullName`, `data.country`, `data.whatsapp`, `data.studyDomain`, `data.targetUniversity`, `data.selectedPack` et `data.airportTransfer` dans `innerHTML`. Ces données sont saisies par l’utilisateur et sont également conservées dans `sessionStorage` (`js/main.js:672`). Même si la fonction semble actuellement peu ou pas appelée dans le parcours principal, le code est vulnérable dès qu’elle est utilisée.

**Correction :** remplacer ces insertions par `textContent` sur des éléments déjà présents, ou échapper systématiquement toutes les valeurs avant insertion.

### 7. [ÉLEVÉ] XSS et confiance excessive dans les données dynamiques

**Fichiers :** `js/main.js:256-307,729-756,796-821,850-860`

Plusieurs blocs utilisent `innerHTML` avec des données provenant de `js/data.js`. Aujourd’hui ces données sont statiques et versionnées, mais une modification future via CMS/API rendrait immédiatement le risque exploitable. Les zones concernées incluent noms d’universités, tags, programmes, FAQ, témoignages, avatars et notifications.

**Correction :** préférer des nœuds DOM et `textContent`; pour les URLs, valider le protocole et l’origine autorisée ; ajouter un lint/règle interdisant `innerHTML` sans échappement.

### 8. [ÉLEVÉ] SRI cassé sur la page Contact

**Fichier :** `contact.html:30`

L’empreinte déclarée ne correspond pas au fichier Font Awesome réellement servi par le CDN. La valeur contient `...w9cQ2QQ...`, alors que l’empreinte vérifiée est celle utilisée par les autres pages : `...w9c2QQ...`.

**Impact :** le navigateur peut bloquer la feuille Font Awesome sur la page Contact ; les icônes sont alors absentes ou dégradées.

**Correction :** remplacer l’empreinte par la valeur vérifiée et ajouter un contrôle SRI automatique en CI.

### 9. [ÉLEVÉ] Risque juridique et réputationnel sur les promesses commerciales

**Fichiers :** `index.html`, `tarifs.html`, `universites.html`, `candidature.html`, `js/data.js`

Le site affiche notamment :

- « Admissions Garanties » ;
- « Admission garantie » ;
- « 98% de visa obtenu » ;
- « 98% avec Wicka » et « 100% avec Wicka » pour des établissements ;
- « sous 30 minutes » ;
- « Carte de séjour jusqu’à l’obtention » ;
- témoignages marqués « authentique certifié ».

Les `cgv.html` indiquent pourtant qu’aucune admission n’est garantie. Sans preuves documentées, méthodologie, période, population et autorisation des établissements, ces messages peuvent constituer une publicité trompeuse ou créer une responsabilité commerciale.

**Correction :** auditer chaque affirmation, conserver les preuves, reformuler en promesses vérifiables et cohérentes avec les CGV. Ne jamais présenter un taux comme un fait sans source et période. Obtenir l’autorisation pour logos, partenariats, témoignages et formulations institutionnelles.

### 10. [ÉLEVÉ] Collecte de données personnelles sans consentement homogène

**Fichiers :** `contact.html:75`, `candidature.html:193-386`, `server/send-email.js:54-90`

Le formulaire de contact possède un consentement explicite. Le formulaire de candidature collecte identité, pays, niveau, projet, WhatsApp et e-mail, mais ne présente pas de case de consentement équivalente. Les données sont envoyées à Brevo et stockées temporairement dans `sessionStorage` (`js/main.js:672`).

**Risques :** base légale et information insuffisantes, conservation non maîtrisée, absence de politique détaillée sur les sous-traitants/transferts, absence de durée précise et absence de mécanisme de retrait simple.

**Correction :** faire valider le parcours par un conseil juridique compétent pour les pays ciblés, ajouter un consentement distinct et non pré-coché pour la candidature, documenter Brevo comme sous-traitant, préciser durée, droits, transfert et responsable de traitement, et éviter de conserver des données sensibles dans le navigateur.

### 11. [MOYEN] Absence totale de tests, CI et garde-fous de livraison

Le dépôt ne contient ni `package.json`, ni lockfile, ni tests, ni configuration CI. Les seuls contrôles disponibles sont manuels : syntaxe Node et dry-run Wrangler.

**Risques :** régression silencieuse des formulaires, HTML cassé, SRI invalide, URLs SEO divergentes, erreurs mobile/accessibilité non détectées.

**Correction recommandée :** ajouter un manifest minimal et un lockfile, puis une CI qui exécute : syntaxe JS, validation HTML, liens internes, tests unitaires de l’API, test Worker local, contrôle SRI, scan secret, audit de dépendances et vérification des réponses HTTP/SEO.

### 12. [MOYEN] Deux implémentations e-mail divergentes

**Fichiers :** `api/send-email.js` et `server/send-email.js`

La logique est dupliquée pour Vercel et Cloudflare. Elle peut diverger à chaque correction. Le README annonce Cloudflare comme cible principale, mais `api/`, `server/` et `vercel.json` restent présents.

**Correction :** choisir une cible de production unique. Si Vercel doit rester supporté, extraire un module partagé et ajouter des tests communs. Sinon documenter clairement les fichiers legacy et les retirer du chemin de déploiement.

### 13. [MOYEN] Gestion réseau Brevo incomplète

**Fichiers :** `server/send-email.js:44-52`, `api/send-email.js:44-52`

`fetch` n’a ni `AbortController`, ni timeout explicite, ni stratégie de retry contrôlée. Pour `contact` et `candidature`, l’envoi est séquentiel : le premier e-mail peut réussir puis le second échouer, ce qui donne un état partiel et invite l’utilisateur à renvoyer une demande duplicative.

**Correction :** timeout court, idempotency key, journal d’état ou file asynchrone ; définir un comportement explicite si l’e-mail utilisateur échoue après l’e-mail entreprise.

### 14. [MOYEN] En-têtes de sécurité absents

Le Worker ne pose pas de CSP, HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` ni protection de framing. La page dépend de Google Fonts, Cloudflare CDN Font Awesome et WhatsApp, donc une CSP doit être conçue avec soin mais reste possible.

**Correction :** ajouter les en-têtes au niveau Worker/CDN, activer HSTS uniquement après validation HTTPS complète, et documenter les domaines autorisés.

### 15. [MOYEN] Liens sociaux placeholders et `target=_blank`

De nombreux liens Facebook/Instagram/LinkedIn sont `href="#"`, donc non fonctionnels. Les liens externes avec `target="_blank"` n’ont pas systématiquement `rel="noopener noreferrer"`.

**Correction :** mettre les vrais profils ou retirer les boutons ; ajouter `rel="noopener noreferrer"` aux liens externes ouverts dans un nouvel onglet.

### 16. [FAIBLE/MOYEN] Accessibilité et UX

Points relevés :

- certains champs du formulaire candidature ont un `label` visuel mais pas toujours de structure/attribut exploitable de manière homogène ;
- le bouton mobile indique seulement « Ouvrir le menu » et ne met pas à jour `aria-expanded` ;
- la fermeture de modales ne gère pas complètement le focus, le retour de focus et le piège clavier ;
- les boutons de sélection universitaire utilisent des handlers inline (`onclick`) ;
- les toasts utilisent `innerHTML` et ne sont pas tous annoncés avec une région ARIA dédiée ;
- les notifications de preuve sociale automatiques peuvent être trompeuses si elles ne correspondent pas à des événements réels.

## Points positifs

- séparation claire entre données, logique navigateur, Worker et logique e-mail ;
- échappement HTML déjà présent dans les e-mails Brevo ;
- validation serveur des e-mails, téléphones, longueurs et champs obligatoires ;
- secrets Brevo documentés dans `.env.example` sans valeur réelle committée ;
- intégrité SRI utilisée pour Font Awesome sur toutes les pages, malgré l’erreur sur Contact ;
- présence des pages légales, `robots.txt`, sitemap et `llms.txt` ;
- syntaxe JavaScript valide et configuration Wrangler lisible.

## Plan de correction avant mise en ligne

### P0 — avant toute publication

1. Corriger et tester la réécriture `HTMLRewriter` du JSON-LD.
2. Ajouter rate limiting + anti-bot/honeypot sur `/api/send-email`.
3. Corriger le XSS FAQ et le résumé de candidature ; supprimer les `innerHTML` non nécessaires.
4. Décider le format URL canonique et aligner Worker, sitemap, `llms.txt`, liens et redirects.
5. Corriger le SRI de `contact.html`.
6. Retirer ou reformuler toutes les garanties/taux/délais non prouvés.
7. Ajouter le consentement et l’information nécessaires au formulaire candidature.
8. Faire tourner des tests avec les vrais secrets dans un environnement de staging, jamais dans le dépôt.

### P1 — avant lancement public sérieux

1. Ajouter CI : JS, HTML, liens, SRI, secrets, tests API et smoke tests Worker.
2. Ajouter timeout, idempotence et gestion des envois partiels Brevo.
3. Ajouter en-têtes de sécurité et CSP.
4. Mettre en place logs, alertes, suivi des volumes et monitoring des erreurs.
5. Unifier ou supprimer la duplication Vercel/Cloudflare.
6. Auditer les droits sur images, logos, témoignages et allégations universitaires.

### P2 — amélioration continue

1. Améliorer accessibilité clavier/focus/ARIA.
2. Remplacer les handlers inline par des listeners JavaScript.
3. Remplacer les placeholders sociaux par des liens vérifiés.
4. Optimiser les images et ajouter formats modernes si nécessaire.
5. Ajouter une vraie stratégie de gestion de contenu et de validation des données.

## Conclusion

**Statut recommandé : NOT READY FOR PRODUCTION.** Le site peut servir de base de staging ou de préproduction, mais la mise en ligne publique doit attendre au minimum les corrections P0. La priorité absolue est de sécuriser l’endpoint e-mail et de corriger la réécriture Worker/XSS ; la priorité métier est de retirer les promesses non démontrées et de rendre les messages légaux et commerciaux cohérents.
