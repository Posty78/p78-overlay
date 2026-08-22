import { ref, onValue } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import { mapsRtdb } from "../firebase-init.js";
import { DEVICE_RTDB_PATHS } from "../config.js";

// Paliers de couleur (indépendants de la charge en cours pour la batterie :
// le %% réel prime, la charge n'est signalée qu'en plus via un badge éclair).
const BATTERY_CRITICAL = 10;
const BATTERY_LOW = 20;
const BATTERY_GOOD = 50;

const TEMP_CRITICAL = 48; // proche du seuil où Android ralentit/éteint l'appli pour surchauffe
const TEMP_HIGH = 43;
const TEMP_WARM = 38;

function levelClass(value, warnAt, badAt, higherIsWorse) {
  const isBad = higherIsWorse ? value >= badAt : value <= badAt;
  const isWarn = higherIsWorse ? value >= warnAt : value <= warnAt;
  if (isBad) return "bad";
  if (isWarn) return "warn";
  return "good";
}

const BATTERY_ICON = `
  <svg class="hud-icon hud-icon--battery" viewBox="0 0 40 24" xmlns="http://www.w3.org/2000/svg">
    <rect class="hud-icon__body" x="1.5" y="1.5" width="33" height="21" rx="3.5"/>
    <rect class="hud-icon__nub" x="35.5" y="8" width="3" height="8" rx="1.2"/>
    <rect class="hud-battery__fill" x="4.5" y="4.5" width="27" height="15" rx="1.8"/>
    <path class="hud-battery__charge" style="display:none" d="M20.5 5 L12 14.5 H18 L15.5 21 L25 10 H19 Z"/>
  </svg>
`;

// Même gabarit (viewBox 40x24) et même construction que la batterie - corps +
// petit renflement à droite (le "bulbe" du thermomètre, qui fait écho au nub
// de la batterie) - pour que les deux icônes soient visuellement jumelles :
// allongées à l'horizontale, même taille. Contour et remplissage de chaque
// forme restent des paires géométriquement cohérentes (juste un inset
// constant), donc aucun risque de décalage comme sur l'ancienne version.
const TEMP_ICON = `
  <svg class="hud-icon hud-icon--temp" viewBox="0 0 40 24" xmlns="http://www.w3.org/2000/svg">
    <rect class="hud-icon__body" x="1.5" y="1.5" width="30" height="21" rx="10"/>
    <circle class="hud-icon__body" cx="35.5" cy="12" r="4.5"/>
    <rect class="hud-temp__fill" x="4.5" y="4.5" width="24" height="15" rx="7.5"/>
    <circle class="hud-temp__fill" cx="35.5" cy="12" r="2.8"/>
  </svg>
`;

export function create(elConfig) {
  const el = document.createElement("div");
  el.className = "hud-battery";
  el.innerHTML = `
    <span class="hud-battery__item" data-role="battery">
      ${BATTERY_ICON}
      <span data-role="battery-text">--%</span>
    </span>
    <span class="hud-battery__item" data-role="temp">
      ${TEMP_ICON}
      <span data-role="temp-text">--°C</span>
    </span>
  `;

  const device = elConfig?.device || "tracking";
  const path = DEVICE_RTDB_PATHS[device] || DEVICE_RTDB_PATHS.tracking;

  const batteryFill = el.querySelector(".hud-battery__fill");
  const chargeIcon = el.querySelector(".hud-battery__charge");
  const tempFillShapes = el.querySelectorAll(".hud-temp__fill");
  const batteryText = el.querySelector('[data-role="battery-text"]');
  const tempText = el.querySelector('[data-role="temp-text"]');
  const batteryItem = el.querySelector('[data-role="battery"]');
  const tempItem = el.querySelector('[data-role="temp"]');

  const dbRef = ref(mapsRtdb, path);
  onValue(dbRef, (snapshot) => {
    const data = snapshot.val();
    if (!data) return;

    if (typeof data.percentage === "number") {
      const pct = Math.max(0, Math.min(100, data.percentage));
      batteryText.textContent = `${Math.round(pct)}%`;
      batteryFill.setAttribute("width", Math.max(0, (pct / 100) * 27));

      const level = levelClass(pct, BATTERY_GOOD, BATTERY_LOW, false);
      batteryFill.setAttribute("class", `hud-battery__fill hud-battery__fill--${level}`);
      batteryItem.classList.toggle("is-critical", level === "bad" && pct <= BATTERY_CRITICAL);

      chargeIcon.style.display = data.charging ? "" : "none";
    }

    if (typeof data.temperature === "number") {
      const temp = data.temperature;
      tempText.textContent = `${Math.round(temp)}°C`;

      const level = levelClass(temp, TEMP_WARM, TEMP_HIGH, true);
      tempFillShapes.forEach((shape) =>
        shape.setAttribute("class", `hud-temp__fill hud-temp__fill--${level}`)
      );
      tempItem.classList.toggle("is-critical", temp >= TEMP_CRITICAL);
    }
  }, (err) => console.warn(`[battery:${device}] lecture RTDB impossible:`, err.message));

  return el;
}
