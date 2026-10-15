# Wicka Assistance — Études Supérieures au Maroc 🎓

Site vitrine (landing page) pour **Wicka Assistance**, cabinet d'accompagnement des étudiants internationaux (Afrique de l'Ouest & Centrale, diaspora) vers les **meilleures universités privées du Maroc** : admissions, visa, carte consulaire, navette aéroport VIP et carte de séjour.

Interface statique HTML/CSS/JavaScript, avec une fonction serverless minimale pour envoyer les formulaires via Brevo, sans base de données. L’interface seule peut être hébergée sur GitHub Pages ; les formulaires nécessitent un hébergeur serverless comme Vercel.

---

## ✨ Fonctionnalités

- **Hero** avec statistiques animées (compteurs) et preuve sociale.
- **Espace Parents** — les 6 grands atouts du Maroc.
- **Tarifs par pays** (8 pays) avec devise locale, moyens de paiement et **prix promotionnels barrés (−50 %)**.
- **Explorateur d'universités** — 15 grandes écoles/universités privées reconnues, avec **photo de la ville**, filtres par filière et par ville, et recherche instantanée.
- **Simulateur de budget** de vie étudiante par ville (MAD / FCFA / EUR / USD) avec photo de la ville.
- **Parcours en 5 étapes** (dont carte consulaire → ambassade et carte de séjour).
- **Packs & formules** avec prix promo (Diagnostic, Admission, VIP & Navette).
- **Formulaire de candidature multi-étapes** avec récap et redirection WhatsApp.
- **FAQ** filtrable, **témoignages** vérifiés.
- **Appels à l'action** multiples : bannières CTA, **compte à rebours de promo**, compteur de places, **barre CTA fixe mobile**, bouton WhatsApp flottant.

---

## 📁 Structure du projet

```
wicka-assistance/
├── index.html            # Accueil (hero, espace parents, parcours, à propos, avis, FAQ)
├── universites.html      # Universités privées (explorateur + réussites)
├── tarifs.html           # Tarifs par pays, simulateur de budget & packs
├── candidature.html      # Formulaire de candidature multi-étapes
├── merci.html            # Page de remerciement après envoi du formulaire
├── css/
│   ├── style.css         # Styles principaux (charte rubis)
│   └── responsive.css    # Adaptations mobile / tablette
├── js/
│   ├── data.js           # Données (universités, tarifs, packs, FAQ, avis)
│   └── main.js           # Logique interactive
├── assets/
│   ├── images/           # Photos hero, équipe, avatars témoignages
│   └── uni/              # Photos des villes (fiches universités & simulateur)
├── api/send-email.js     # Fonction serverless Brevo, sans base de données
├── .env.example          # Variables Brevo à configurer sur l’hébergeur
├── vercel.json           # Configuration de la fonction serverless
├── server.ps1            # Serveur local de test (Windows PowerShell) — interface uniquement
└── README.md
```

---

## 🚀 Lancer en local

**Option 1 — le plus simple :** double-cliquer sur `index.html` (s'ouvre dans le navigateur).

**Option 2 — avec un petit serveur local (Windows) :**

```bash
powershell -ExecutionPolicy Bypass -File server.ps1
```

Le site s'ouvre sur `http://localhost:5500/`.

> `server.ps1` sert uniquement à tester en local. Il n'est **pas** nécessaire pour l'hébergement en ligne.

---

## 🌍 Mettre le site en ligne (GitHub Pages)

Voir le guide détaillé pas à pas dans **[GUIDE-GITHUB.md](GUIDE-GITHUB.md)**.

En résumé : pousser le dossier sur un dépôt GitHub, puis **Settings → Pages → Branch: `main` / `root` → Save**. Le site sera accessible sur `https://<votre-utilisateur>.github.io/<nom-du-depot>/`.

---

## 🔧 Personnalisation rapide

| Pour changer… | Fichier | Où |
|---|---|---|
| Les **prix** (promo & barrés) | `js/data.js` | objet `countryPricings` et tableau `packs` |
| Les prix affichés dans les cartes | `index.html` | section `#packs` (`.pack-price` / `.pack-price-old`) |
| Le **numéro WhatsApp** | rechercher `212789095498` | `index.html`, `js/data.js`, `js/main.js` |
| La **date de fin de promo** | `index.html` | `id="promoCountdown"` → `data-deadline` |
| Le **nombre de places** | `index.html` | `id="promoPlaces"` |
| Les **universités** | `js/data.js` | tableau `universities` |

---

## 🖼️ Crédits images

Les photos des villes (`assets/uni/`) proviennent d'**[Unsplash](https://unsplash.com)** — licence gratuite pour usage commercial, **sans attribution obligatoire**.

---

© 2026 Wicka Assistance. Tous droits réservés.


## Configuration Brevo

Les formulaires n’utilisent aucune base de données. La fonction `api/send-email.js` envoie deux e-mails via Brevo pour chaque formulaire : une notification à l’adresse de la société et une confirmation à l’utilisateur.

Sur Vercel, configurer les variables présentes dans `.env.example` : `BREVO_API_KEY`, `BREVO_FROM_EMAIL`, `BREVO_FROM_NAME`, `BREVO_COMPANY_EMAIL`, `PUBLIC_SITE_URL` et `BREVO_LOGO_URL`. L’adresse expéditrice doit être vérifiée dans Brevo. `BREVO_LOGO_URL` doit pointer vers le logo public du site, par exemple `https://votre-domaine.com/assets/images/logo.png`, afin que Brevo puisse l’afficher dans les emails. Ne jamais mettre la clé API dans HTML ou JavaScript côté navigateur.

Le formulaire de contact et la candidature nécessitent donc un déploiement Vercel ou un autre hébergeur compatible avec les fonctions serverless. GitHub Pages peut servir les pages, mais ne peut pas exécuter `api/send-email.js`.
