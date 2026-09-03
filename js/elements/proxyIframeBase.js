// Base partagee pour les widgets externes "natifs" (URL fixee en dur dans le
// code, pas modifiable depuis l'editeur) : Roue, Compteur, Vote Defis, Barre
// de don... Contrairement au type generique "iframe" (URL editable, stockee
// dans Firestore), ces widgets-la survivent a une reinitialisation accidentelle
// de la scene - il suffit de les rajouter depuis la liste, sans avoir a
// retrouver/ressaisir une URL.
const WATCHDOG_INTERVAL_MS = 30 * 60 * 1000;

export function makeProxyIframe(fixedUrl, defaultW = 400, defaultH = 300) {
  function create(elConfig) {
    const el = document.createElement("div");
    el.className = "hud-iframe";
    applyConfig(el, elConfig);
    return el;
  }

  function applyConfig(el, elConfig) {
    const w = elConfig?.w ?? defaultW;
    const h = elConfig?.h ?? defaultH;
    el.style.width = `${w}px`;
    el.style.height = `${h}px`;

    // demo=1 doit rester un parametre de PREMIER niveau sur l'URL du proxy
    // (pas cache dans l'URL cible encodee) - le proxy le reinjecte lui-meme
    // cote serveur via history.replaceState.
    const url = elConfig?.demo ? `${fixedUrl}${fixedUrl.includes("?") ? "&" : "?"}demo=1` : fixedUrl;

    if (el.dataset.currentUrl === url) return;
    el.dataset.currentUrl = url;

    if (el._watchdogTimer) {
      clearInterval(el._watchdogTimer);
      el._watchdogTimer = null;
    }

    el.innerHTML = "";
    const iframe = document.createElement("iframe");
    iframe.src = url;
    iframe.style.width = "100%";
    iframe.style.height = "100%";
    iframe.style.border = "none";
    iframe.setAttribute("allowtransparency", "true");
    iframe.setAttribute("allow", "autoplay");
    el.appendChild(iframe);

    el._watchdogTimer = setInterval(() => {
      const current = el.querySelector("iframe");
      if (current) current.src = url;
    }, WATCHDOG_INTERVAL_MS);
  }

  return { create, applyConfig };
}
