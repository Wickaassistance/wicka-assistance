# Wicka Assistance — Études Supérieures au Maroc 🎓

Site vitrine (landing page) pour **Wicka Assistance**, cabinet d'accompagnement des étudiants internationaux (Afrique de l'Ouest & Centrale, diaspora) vers les **meilleures universités privées du Maroc** : admissions, visa, carte consulaire, navette aéroport VIP et carte de séjour.

Site **100 % statique** (HTML / CSS / JavaScript), sans dépendance serveur → hébergeable gratuitement sur **GitHub Pages**.

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
├── server.ps1            # Serveur local de test (Windows PowerShell) — non requis en ligne
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
| Le **numéro WhatsApp** | rechercher `212771674815` | `index.html`, `js/data.js`, `js/main.js` |
| La **date de fin de promo** | `index.html` | `id="promoCountdown"` → `data-deadline` |
| Le **nombre de places** | `index.html` | `id="promoPlaces"` |
| Les **universités** | `js/data.js` | tableau `universities` |

---

## 🖼️ Crédits images

Les photos des villes (`assets/uni/`) proviennent d'**[Unsplash](https://unsplash.com)** — licence gratuite pour usage commercial, **sans attribution obligatoire**.

---

© 2026 Wicka Assistance. Tous droits réservés.
