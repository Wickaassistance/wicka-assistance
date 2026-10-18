/**
 * Wicka Assistance - Section TikTok
 *
 * 1) AFFICHAGE : tant que le lien de la carte (data-tiktok-play) ne contient pas de vidéo valide
 *    (…/video/123456…), rien n'est affiché à part le texte et les boutons : la colonne
 *    image/vidéo reste masquée. Dès qu'un lien vidéo valide est renseigné dans index.html,
 *    la colonne s'affiche automatiquement.
 *
 * 2) IMAGE : l'aperçu est assets/images/tiktok-preview.jpg. S'il est introuvable, il est retiré
 *    et la carte garde son fond dégradé rose avec le bouton ▶ (aucune image de secours).
 *
 * 3) VIDÉO : la vidéo n'est chargée qu'au clic sur ▶ (aucun script ni traceur TikTok au chargement).
 *    - Le clic lance le lecteur TikTok dans la page.
 *    - Ctrl/Cmd/Maj + clic : ouvre simplement TikTok dans un nouvel onglet.
 *
 * Nécessite : frame-src https://www.tiktok.com dans la CSP (worker/index.js).
 */
document.addEventListener('DOMContentLoaded', () => {
  const link = document.querySelector('[data-tiktok-play]');
  if (!link) return;

  /* ---------- 1) Pas de vidéo valide : la colonne reste masquée ---------- */
  const match = (link.getAttribute('href') || '').match(/\/video\/(\d+)/);
  if (!match) return;

  const videoId = match[1];
  const card = link.closest('.tiktok-card');
  const visual = link.closest('.tiktok-visual');
  const grid = link.closest('.tiktok-grid');

  // Vidéo valide : on affiche la colonne image/vidéo
  if (visual) visual.hidden = false;
  if (grid) grid.classList.remove('is-text-only');

  /* ---------- 2) Image : si l'aperçu est introuvable, on le retire (le fond rose reste) ---------- */
  const img = link.querySelector('img');
  if (img) {
    const hideImg = () => { img.style.display = 'none'; };
    img.addEventListener('error', hideImg);
    // L'erreur a pu se produire avant que le script soit prêt
    if (img.complete && img.naturalWidth === 0 && img.getAttribute('src')) hideImg();
  }

  /* ---------- 3) Vidéo : lecteur TikTok au clic ---------- */
  link.addEventListener('click', (event) => {
    // Laisse le comportement normal pour Ctrl/Cmd/Maj + clic et clic molette
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button === 1) return;
    event.preventDefault();
    if (!card) return;

    const iframe = document.createElement('iframe');
    iframe.src = `https://www.tiktok.com/player/v1/${videoId}?autoplay=1&rel=0&description=1`;
    iframe.title = 'Vidéo TikTok Wicka Assistance';
    iframe.allow = 'autoplay; fullscreen; encrypted-media';
    iframe.allowFullscreen = true;
    iframe.referrerPolicy = 'strict-origin-when-cross-origin';

    card.replaceChildren(iframe);
  });
});
