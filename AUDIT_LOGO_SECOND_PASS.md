# Deuxième audit — logo officiel Wicka Assistance

**Date :** 15 octobre 2026  
**Commit audité :** `b34d77b` puis correction e-mail du second passage  
**Dépôt :** `poodasamuelpro/wicka-assistance`

## Verdict

**Conforme après correction.** La route existante `/assets/images/logo.png` est utilisée partout où le logo doit apparaître. Aucun nouveau chemin concurrent n’a été créé.

## Contrôles effectués

| Contrôle | Résultat |
|---|---:|
| Fichier présent dans `assets/images/logo.png` | OK |
| Format PNG avec canal alpha/transparence | OK |
| Dimensions du fichier | `1242 × 1005 px` |
| Route publique `/assets/images/logo.png` | HTTP 200 |
| Type MIME de la route | `image/png` |
| Fichier servi identique au fichier Git | OK |
| Dry-run Wrangler | OK |
| Syntaxe `worker/index.js` | OK |
| Syntaxe `server/send-email.js` | OK |
| Syntaxe `api/send-email.js` | OK |
| Syntaxe `js/main.js` | OK |
| Références relatives manquantes dans les pages HTML | 0 |

## Routes publiques testées

Toutes les routes propres configurées ont répondu en HTTP 200 :

- `/`
- `/candidature`
- `/universites`
- `/tarifs`
- `/contact`
- `/mentions-legales`
- `/politique-confidentialite`
- `/cgv`
- `/merci`

## Emplacements vérifiés

### Site web

- Header principal : logo officiel affiché.
- Drawer mobile : logo officiel affiché.
- Footer des pages principales : logo officiel affiché.
- Page de remerciement : logo officiel affiché.
- Favicon sur les 9 pages HTML : présent.
- Apple touch icon sur les 9 pages HTML : présent.
- Aucun ancien bloc `brand-crest` ne subsiste dans les logos de page.

### SEO

- Le JSON-LD `Organization.logo` de la page d’accueil pointe vers :

  `__PUBLIC_SITE_URL__/assets/images/logo.png`

- Le favicon et l’Apple touch icon utilisent :

  `/assets/images/logo.png`

- Les images Open Graph restent volontairement sur `og-share.jpg`, qui est un visuel large adapté au partage social ; le logo est bien référencé dans les données structurées de marque.

### E-mails

Un envoi Brevo simulé a été exécuté sans contacter Brevo :

- URL générée : `https://example.com/assets/images/logo.png` lorsque `PUBLIC_SITE_URL=https://example.com` ;
- attribut `alt="Wicka Assistance"` présent ;
- dimensions explicites ajoutées : `width:120px;height:98px` ;
- aucun e-mail réel n’a été envoyé.

Les deux implémentations e-mail utilisent la même route :

- `server/send-email.js` ;
- `api/send-email.js`.

## Observation de périmètre

Les pages légales (`cgv.html`, `contact.html`, `mentions-legales.html` et politique de confidentialité) ne possèdent pas toutes un header/footer de marque dans leur structure historique. Elles disposent néanmoins du favicon/logo SEO global. Les pages qui ont déjà un header/footer affichent bien le logo officiel à ces emplacements.

## Conclusion

Le logo est correctement placé dans le dossier public correspondant, servi par la route déjà configurée, référencé dans le site, le SEO et les e-mails, et validé par des tests de routes réelles sur le Worker local.
