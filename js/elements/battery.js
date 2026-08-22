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

// Vrai thermomètre classique couché à l'horizontale : tige fine (cercle rayon 4,
// centre 7,12) reliée à un bulbe (cercle rayon 8, centre 30,12) par deux vraies
// tangentes externes (calcul géométrique, pas une approximation à l'oeil) - un
// seul tracé continu pour le contour ET le remplissage, donc aucun risque de
// décalage entre les deux comme sur les versions précédentes.
const TEMP_SILHOUETTE =
  "M6.31,8.06 A4,4 0 0,0 6.31,15.94 L28.61,19.88 A8,8 0 1,0 28.61,4.12 Z";
const TEMP_ICON = `
  <svg class="hud-icon hud-icon--temp" viewBox="0 0 40 24" xmlns="http://www.w3.org/2000/svg">
    <path class="hud-temp__fill" d="${TEMP_SILHOUETTE}"/>
    <path class="hud-icon__body" fill="none" d="${TEMP_SILHOUETTE}"/>
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
  const tempFill = el.querySelector(".hud-temp__fill");
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
      tempFill.setAttribute("class", `hud-temp__fill hud-temp__fill--${level}`);
      tempItem.classList.toggle("is-critical", temp >= TEMP_CRITICAL);
    }
  }, (err) => console.warn(`[battery:${device}] lecture RTDB impossible:`, err.message));

  return el;
}
