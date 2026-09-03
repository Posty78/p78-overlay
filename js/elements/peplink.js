import { doc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { db } from "../firebase-init.js?v=1";

// Widget de supervision reseau (Peplink ou wifi generique selon detection cote
// telephone), declenche par !regis (moderateurs uniquement, filtre cote bot
// Botsty78) ou par le bouton de regis.posty78.fr. Hors systeme de scenes expres
// (meme principe que censure.js) : doit pouvoir s'afficher par-dessus n'importe
// quelle scene active, pendant 15s, puis disparaitre tout seul.
//
// Les vraies donnees (Mbps par ligne) sont scrapees en direct par l'APK
// PostyMonitor sur le telephone de stream, qui les pousse dans
// state/peplink_result des qu'un declenchement est detecte - ce widget se
// contente d'ecouter ce document en direct, aucun appel reseau de sa part.
// Le telephone scanne activement pendant 20s (SCAN_DURATION_MS cote APK) :
// on reste visible un peu plus longtemps pour ne jamais disparaitre avant
// la fin du scan.
const VISIBLE_DURATION_MS = 22000;

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
    (err) => console.warn("[peplink] lecture declenchement impossible :", err.message)
  );

  onSnapshot(
    doc(db, "state", "peplink_result"),
    (snap) => {
      const data = snap.data();
      if (!data) return;
      // N'affiche que les resultats posterieurs au dernier declenchement, pour
      // ne jamais montrer un ancien resultat perime pendant le court instant ou
      // le telephone n'a pas encore repondu au nouveau declenchement.
      const updatedAt = data.updatedAt?.toMillis?.() ?? 0;
      if (lastTriggeredAt && updatedAt < lastTriggeredAt) return;
      render(data.lines);
    },
    (err) => console.warn("[peplink] lecture resultat impossible :", err.message)
  );

  function show() {
    el.classList.add("is-visible");
    render([]);
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => el.classList.remove("is-visible"), VISIBLE_DURATION_MS);
  }

  function render(lines) {
    const container = el.querySelector('[data-role="lines"]');
    if (!lines || !lines.length) {
      container.innerHTML = `<div class="hud-peplink__empty">En attente du téléphone…</div>`;
      return;
    }
    container.innerHTML = lines
      .map(
        (l) => `
        <div class="hud-peplink__line">
          <span class="hud-peplink__dot hud-peplink__dot--${l.color}"></span>
          <span class="hud-peplink__info">
            <span class="hud-peplink__carrier">${l.carrier}</span>
            ${typeof l.mbps === "number" ? `<span class="hud-peplink__mbps">${l.mbps.toFixed(1)} Mbps</span>` : ""}
          </span>
        </div>`
      )
      .join("");
  }
}
