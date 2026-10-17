/**
 * Wicka Assistance - Section TikTok
 * La vidéo n'est chargée qu'au clic sur ▶ (aucun script ni traceur TikTok au chargement).
 * Le lien du bouton reste un vrai lien vers TikTok : clic droit, Ctrl+clic ou JS désactivé
 * ouvrent simplement la vidéo sur TikTok.
 * Nécessite : frame-src https://www.tiktok.com dans la CSP (worker/index.js).
 */
document.addEventListener('DOMContentLoaded', () => {
  const link = document.querySelector('[data-tiktok-play]');
  if (!link) return;

  const match = (link.getAttribute('href') || '').match(/\/video\/(\d+)/);
  if (!match) return; // lien court (vm.tiktok.com) ou invalide : on laisse le lien ouvrir TikTok

  const videoId = match[1];

  link.addEventListener('click', (event) => {
    // Laisse le comportement normal pour Ctrl/Cmd/Maj + clic et clic molette
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button === 1) return;
    event.preventDefault();

    const card = link.closest('.tiktok-card');
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
