import { doc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { db } from "../firebase-init.js?v=1";

// Widget de supervision reseau (Peplink ou wifi generique selon detection cote
// telephone), declenche par !regis (moderateurs uniquement, filtre cote bot
// Botsty78) ou par le bouton de regis.posty78.fr. Hors systeme de scenes expres
// (meme principe que censure.js) : doit pouvoir s'afficher par-dessus n'importe
// quelle scene active, pendant EXACTEMENT 15s, puis disparaitre tout seul -
// meme si le telephone scanne encore (son propre scan dure 20s cote APK, mais
// la duree d'affichage widget est volontairement fixee a 15s, non negociable).
//
// Les vraies donnees (Mbps par ligne) sont scrapees en direct par l'APK
// PostyMonitor sur le telephone de stream, qui les pousse dans
// state/peplink_result des qu'un declenchement est detecte - ce widget se
// contente d'ecouter ce document en direct, aucun appel reseau de sa part.
const VISIBLE_DURATION_MS = 15000;

// Sequence de demonstration (bouton "Démo" de regis.posty78.fr) : rejoue les
// memes scenarios que regis.posty78.fr/demo, directement sur le vrai widget
// OBS, sans jamais toucher au telephone ni a state/peplink_result.
const DEMO_STEP_MS = 3600;
const DEMO_SCENARIOS = [
  { lines: [] },
  {
    lines: [
      { carrier: "Bouygues", mbps: null, color: "red" },
      { carrier: "Orange", mbps: null, color: "red" },
      { carrier: "SFR", mbps: null, color: "red" },
      { carrier: "Free", mbps: null, color: "red" },
    ],
  },
  {
    lines: [
      { carrier: "Bouygues", mbps: 1.2, color: "orange" },
      { carrier: "Orange", mbps: 0.4, color: "orange" },
      { carrier: "SFR", mbps: 2.8, color: "red" },
      { carrier: "Free", mbps: null, color: "red" },
    ],
  },
  {
    lines: [
      { carrier: "Bouygues", mbps: 6.2, color: "green" },
      { carrier: "Orange", mbps: 4.8, color: "green" },
      { carrier: "SFR", mbps: 9.1, color: "orange" },
      { carrier: "Free", mbps: 3.5, color: "green" },
    ],
  },
  {
    lines: [
      { carrier: "Bouygues", mbps: 6.2, color: "green" },
      { carrier: "Orange", mbps: 4.8, color: "green" },
      { carrier: "SFR", mbps: 9.1, color: "green" },
      { carrier: "Free", mbps: 3.5, color: "green" },
      { carrier: "Données mobile (Free)", mbps: 4.4, color: "orange" },
    ],
  },
  {
    lines: [
      { carrier: "Bouygues", mbps: 6.2, color: "green" },
      { carrier: "Orange", mbps: 4.8, color: "green" },
      { carrier: "SFR", mbps: 9.1, color: "green" },
      { carrier: "Free", mbps: 3.5, color: "green" },
      { carrier: "Données mobile (Free)", mbps: 8.9, color: "green" },
      { carrier: "Starlink", mbps: 92.3, color: "green" },
    ],
  },
  {
    lines: [{ carrier: "Erreur: login Peplink injoignable", mbps: null, color: "red" }],
  },
];

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
  let lastDemoTriggeredAt = null;
  let hideTimer = null;
  let demoInterval = null;
  let isDemoActive = false;

  onSnapshot(
    doc(db, "state", "peplink"),
    (snap) => {
      const data = snap.data();

      const demoTriggeredAt = data?.demoTriggeredAt?.toMillis?.() ?? null;
      if (demoTriggeredAt && demoTriggeredAt !== lastDemoTriggeredAt) {
        lastDemoTriggeredAt = demoTriggeredAt;
        playDemo();
        return;
      }

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
      if (isDemoActive) return; // la demo ne doit jamais etre ecrasee par un vrai resultat
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
    isDemoActive = false;
    clearInterval(demoInterval);
    el.classList.add("is-visible");
    render([]);
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => el.classList.remove("is-visible"), VISIBLE_DURATION_MS);
  }

  function playDemo() {
    isDemoActive = true;
    clearTimeout(hideTimer);
    clearInterval(demoInterval);
    el.classList.add("is-visible");

    let step = 0;
    render(DEMO_SCENARIOS[step].lines);
    demoInterval = setInterval(() => {
      step++;
      if (step >= DEMO_SCENARIOS.length) {
        clearInterval(demoInterval);
        el.classList.remove("is-visible");
        isDemoActive = false;
        return;
      }
      render(DEMO_SCENARIOS[step].lines);
    }, DEMO_STEP_MS);
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
