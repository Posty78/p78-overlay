import { doc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { db } from "../firebase-init.js?v=1";
import { FUNCTIONS_BASE_URL } from "../config.js?v=1";

// Widget de supervision reseau Peplink, declenche par !regis (moderateurs
// uniquement, filtre cote bot Botsty78). Hors systeme de scenes expres (meme
// principe que censure.js) : doit pouvoir s'afficher par-dessus n'importe
// quelle scene active, pendant 15s, puis disparaitre tout seul.
const VISIBLE_DURATION_MS = 15000;
// Le statut Peplink se rafraichit avec un delai de 1-2s apres declenchement
// (mecanisme "trigger + poll" de l'API InControl2) : un 2e appel un peu apres
// le premier laisse une chance d'obtenir des donnees plus fraiches que celles
// du tout premier appel.
const REFRESH_DELAYS_MS = [0, 3000];

export function mountPeplink() {
  const el = document.createElement("div");
  el.id = "peplink-widget";
  el.className = "hud-peplink";
  el.innerHTML = `
    <div class="hud-peplink__title">RÉSEAU</div>
    <div class="hud-peplink__lines" data-role="lines"></div>
  `;
  document.body.appendChild(el);

  let lastTriggeredAt = null;
  let hideTimer = null;

  onSnapshot(
    doc(db, "state", "peplink"),
    (snap) => {
      const data = snap.data();
      const triggeredAt = data?.triggeredAt?.toMillis?.() ?? null;
      if (!triggeredAt || triggeredAt === lastTriggeredAt) return;
      lastTriggeredAt = triggeredAt;
      show();
    },
    (err) => console.warn("[peplink] lecture impossible :", err.message)
  );

  function show() {
    el.classList.add("is-visible");
    REFRESH_DELAYS_MS.forEach((delay) => setTimeout(refresh, delay));
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => el.classList.remove("is-visible"), VISIBLE_DURATION_MS);
  }

  async function refresh() {
    try {
      const res = await fetch(`${FUNCTIONS_BASE_URL}/peplinkStatus`);
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "erreur inconnue");
      render(data.lines);
    } catch (err) {
      console.warn("[peplink] appel peplinkStatus impossible :", err.message);
    }
  }

  function render(lines) {
    const container = el.querySelector('[data-role="lines"]');
    if (!lines || !lines.length) {
      container.innerHTML = `<div class="hud-peplink__empty">Aucune ligne détectée</div>`;
      return;
    }
    container.innerHTML = lines
      .map(
        (l) => `
        <div class="hud-peplink__line">
          <span class="hud-peplink__dot hud-peplink__dot--${l.color}"></span>
          <span class="hud-peplink__carrier">${l.carrier}</span>
        </div>`
      )
      .join("");
  }
}
