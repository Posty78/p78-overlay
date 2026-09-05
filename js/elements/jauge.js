import { ref, onValue } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import { mapsRtdb } from "../firebase-init.js?v=1";

// Compteur vitesse seul (la jauge essence est desormais un widget separe,
// "reservoir.js") : gros affichage numerique pur, aucun cadran/aiguille.
const DIGITAL_CX = 150, DIGITAL_CY = 115;
const DIGITAL_W = 300, DIGITAL_H = 230;
const DEFAULT_W = 300, DEFAULT_H = 230;

const DEMO_UP_MS = 4000, DEMO_HOLD_MS = 400, DEMO_DOWN_MS = 2000, DEMO_PAUSE_MS = 400;
const DEMO_MAX = 120;

// Boucle demo (0 -> 120 -> 0, en continu) : accel en ease-out (monte vite puis
// ralentit en approchant 120, comme un vrai moteur qui plafonne), decel en
// ease-in au retour. Purement visuelle, ne touche a aucune donnee reelle.
function startDemo(digitalSpeed) {
  let cancelled = false;
  let rafId = null;

  function accelerate(start) {
    const t = Math.min(1, (performance.now() - start) / DEMO_UP_MS);
    digitalSpeed.textContent = Math.round(DEMO_MAX * (1 - Math.pow(1 - t, 2)));
    if (cancelled) return;
    if (t < 1) rafId = requestAnimationFrame(() => accelerate(start));
    else setTimeout(() => { if (!cancelled) decelerate(performance.now()); }, DEMO_HOLD_MS);
  }

  function decelerate(start) {
    const t = Math.min(1, (performance.now() - start) / DEMO_DOWN_MS);
    digitalSpeed.textContent = Math.round(DEMO_MAX * (1 - t * t));
    if (cancelled) return;
    if (t < 1) rafId = requestAnimationFrame(() => decelerate(start));
    else setTimeout(() => { if (!cancelled) accelerate(performance.now()); }, DEMO_PAUSE_MS);
  }

  accelerate(performance.now());
  return () => { cancelled = true; if (rafId) cancelAnimationFrame(rafId); };
}

// Recadrable comme les autres widgets : le SVG garde sa taille intrinseque
// fixe, c'est le conteneur (overflow:hidden) qui se redimensionne.
export function applyConfig(el, elConfig) {
  el.style.width = `${elConfig?.w ?? DEFAULT_W}px`;
  el.style.height = `${elConfig?.h ?? DEFAULT_H}px`;

  const demo = elConfig?.demo === true;
  if (demo === (el.dataset.demo === "true")) return; // pas de changement, rien a refaire
  el.dataset.demo = demo ? "true" : "false";

  const digitalSpeed = el.querySelector("#jauge-speed-digital");
  if (!digitalSpeed) return;

  if (el._demoStop) { el._demoStop(); el._demoStop = null; }
  if (demo) {
    el._demoStop = startDemo(digitalSpeed);
  }
}

export function create(elConfig) {
  const el = document.createElement("div");
  el.className = "hud-jauge";
  el.style.overflow = "hidden";
  el.innerHTML = `
    <svg viewBox="0 0 300 230" class="hud-jauge__svg">
      <rect x="${DIGITAL_CX - DIGITAL_W / 2}" y="${DIGITAL_CY - DIGITAL_H / 2}" width="${DIGITAL_W}" height="${DIGITAL_H}" rx="16" class="hud-jauge__digital-panel"/>
      <text x="${DIGITAL_CX}" y="${DIGITAL_CY - 15}" id="jauge-speed-digital" class="hud-jauge__digital">0</text>
      <text x="${DIGITAL_CX}" y="${DIGITAL_CY + 65}" class="hud-jauge__unit hud-jauge__unit--digital">km/h</text>
    </svg>
    <style>
      .hud-jauge__svg { width: 300px; height: 230px; overflow: visible; filter: drop-shadow(0 0 12px rgba(255,90,31,0.35)); }
      .hud-jauge__digital-panel { fill: #050505; stroke: #ff5a1f; stroke-width: 3px; }
      .hud-jauge__digital {
        font-family: "Rajdhani", "Courier New", monospace; font-weight: 700; font-size: 135px;
        fill: #ff8a3d; text-anchor: middle; dominant-baseline: middle;
        filter: drop-shadow(0 0 10px rgba(255,138,61,0.9));
      }
      .hud-jauge__unit {
        font-family: "Rajdhani", sans-serif; font-weight: 600; font-size: 15px;
        fill: #ff8a3d; text-anchor: middle; opacity: 0.85;
      }
      .hud-jauge__unit--digital { font-size: 22px; letter-spacing: 2px; }
    </style>
  `;
  applyConfig(el, elConfig);

  const digitalSpeed = el.querySelector("#jauge-speed-digital");

  onValue(
    ref(mapsRtdb, "vehicle_status"),
    (snapshot) => {
      if (el.dataset.demo === "true") return; // demo active : ignore les vraies donnees
      const data = snapshot.val();
      if (!data || typeof data.speedKmh !== "number") return;
      digitalSpeed.textContent = Math.round(data.speedKmh);
    },
    (err) => console.warn("[jauge] lecture vitesse impossible:", err.message)
  );

  return el;
}
