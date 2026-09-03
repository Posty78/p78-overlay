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

    if (el.dataset.currentUrl === fixedUrl) return;
    el.dataset.currentUrl = fixedUrl;

    if (el._watchdogTimer) {
      clearInterval(el._watchdogTimer);
      el._watchdogTimer = null;
    }

    el.innerHTML = "";
    const iframe = document.createElement("iframe");
    iframe.src = fixedUrl;
    iframe.style.width = "100%";
    iframe.style.height = "100%";
    iframe.style.border = "none";
    iframe.setAttribute("allowtransparency", "true");
    iframe.setAttribute("allow", "autoplay");
    el.appendChild(iframe);

    el._watchdogTimer = setInterval(() => {
      const current = el.querySelector("iframe");
      if (current) current.src = fixedUrl;
    }, WATCHDOG_INTERVAL_MS);
  }

  return { create, applyConfig };
}
