// La page overlay ne recharge jamais toute seule sur les 365 jours du stream
// (exprès, pour ne pas refacturer le chargement de Google Maps JS). Si un widget
// proxifié (subgoal, vote giveaway...) perd sa connexion temps réel - redémarrage
// côté source, coupure réseau - et n'a pas de reconnexion auto intégrée, rien ne
// le relancerait. Comme l'iframe est cross-origin, impossible de détecter une
// panne depuis ici (le navigateur bloque l'inspection entre origines différentes) :
// on se contente donc de rafraîchir l'iframe par prudence à intervalle régulier,
// sans jamais toucher au reste de la page.
const WATCHDOG_INTERVAL_MS = 30 * 60 * 1000;

export function create(elConfig) {
  const el = document.createElement("div");
  el.className = "hud-iframe";
  applyConfig(el, elConfig);
  return el;
}

export function applyConfig(el, elConfig) {
  const w = elConfig?.w ?? 400;
  const h = elConfig?.h ?? 300;
  el.style.width = `${w}px`;
  el.style.height = `${h}px`;

  const url = elConfig?.url || "";
  if (el.dataset.currentUrl === url) return;
  el.dataset.currentUrl = url;

  if (el._watchdogTimer) {
    clearInterval(el._watchdogTimer);
    el._watchdogTimer = null;
  }

  el.innerHTML = "";
  if (!url) return;

  const iframe = document.createElement("iframe");
  iframe.src = url;
  iframe.style.width = "100%";
  iframe.style.height = "100%";
  iframe.style.border = "none";
  iframe.setAttribute("allowtransparency", "true");
  el.appendChild(iframe);

  el._watchdogTimer = setInterval(() => {
    const current = el.querySelector("iframe");
    if (current) current.src = url;
  }, WATCHDOG_INTERVAL_MS);
}
