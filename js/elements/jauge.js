import { ref, onValue } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import { doc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { mapsDb, mapsRtdb } from "../firebase-init.js?v=1";

// Jauge essence en cadran analogique (0-100%, 11 graduations par pas de 10) a
// gauche + vitesse en gros affichage numerique pur a droite (pas de cadran ni
// d'aiguille pour la vitesse : plus lisible d'un coup d'oeil que d'interpreter
// une aiguille, cf. demande explicite).
const FUEL_CX = 130, FUEL_CY = 210, FUEL_R = 110;
const FUEL_ANGLE_MIN = -100, FUEL_ANGLE_MAX = 100;
// 10 traits exactement sur 0-100% (pas 11) -> 9 intervalles egaux, premier et
// dernier trait tombent pile sur 0 (E) et 100 (F). Le "½" (50%) ne tombe sur
// aucun de ces 10 traits, il est ajoute a part (buildStandaloneLabel).
const FUEL_STEP = 100 / 9;

const DIGITAL_CX = 420, DIGITAL_CY = 210;
const DIGITAL_W = 260, DIGITAL_H = 200;

function polarPoint(cx, cy, r, angleDeg) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: cx + r * Math.sin(rad), y: cy - r * Math.cos(rad) };
}

function valueToAngle(value, min, max, angleMin, angleMax) {
  const clamped = Math.max(min, Math.min(max, value));
  return angleMin + ((clamped - min) / (max - min)) * (angleMax - angleMin);
}

// labels est optionnel : si fourni, seuls les traits qui tombent (a peu pres,
// tolerance pour les arrondis flottants) sur une valeur de la liste reçoivent
// un texte - les autres restent des traits nus. Sans labels, chaque trait
// affiche sa valeur (comportement generique).
function buildTicks({ cx, cy, r, angleMin, angleMax, min, max, step, labels, fontSize, tickClass }) {
  let svg = "";
  const majorLen = r * 0.14;
  const cls = tickClass || "hud-jauge__tick";

  for (let v = min; v <= max + 0.001; v += step) {
    const a = valueToAngle(v, min, max, angleMin, angleMax);
    const outer = polarPoint(cx, cy, r, a);
    const inner = polarPoint(cx, cy, r - majorLen, a);
    svg += `<line x1="${inner.x.toFixed(1)}" y1="${inner.y.toFixed(1)}" x2="${outer.x.toFixed(1)}" y2="${outer.y.toFixed(1)}" class="${cls}"/>`;

    const match = labels ? labels.find((l) => Math.abs(l.value - v) < 0.5) : { text: String(Math.round(v)) };
    if (match) {
      const labelPos = polarPoint(cx, cy, r - majorLen - (fontSize || 15), a);
      svg += `<text x="${labelPos.x.toFixed(1)}" y="${labelPos.y.toFixed(1)}" class="hud-jauge__label" style="font-size:${fontSize || 17}px">${match.text}</text>`;
    }
  }

  return svg;
}

// Repere autonome (pas lie a un trait genere par buildTicks) - utilise pour
// le "½" quand le pas choisi ne tombe pas exactement sur cette valeur.
function buildStandaloneLabel({ cx, cy, r, angleMin, angleMax, min, max, value, text, fontSize }) {
  const a = valueToAngle(value, min, max, angleMin, angleMax);
  const majorLen = r * 0.14;
  const pos = polarPoint(cx, cy, r - majorLen - (fontSize || 15), a);
  return `<text x="${pos.x.toFixed(1)}" y="${pos.y.toFixed(1)}" class="hud-jauge__label" style="font-size:${fontSize || 17}px">${text}</text>`;
}

function buildNeedle(id, cx, cy, len, tailLen, width, cls) {
  const w = width || 3.5;
  return `
    <g id="${id}" class="${cls || "hud-jauge__needle-group"}">
      <polygon points="${cx - w},${cy} ${cx - 1},${cy - len} ${cx + 1},${cy - len} ${cx + w},${cy}"/>
      <polygon points="${cx - w * 0.8},${cy} ${cx},${cy + tailLen} ${cx + w * 0.8},${cy}"/>
    </g>
  `;
}

const DEFAULT_W = 580, DEFAULT_H = 420;

// Recadrable comme les autres widgets (poignees haut-gauche/bas-droite + Alt-glisser) :
// le SVG garde sa taille intrinseque fixe (voir .hud-jauge__svg plus bas, en px pas en %),
// c'est le conteneur qui se redimensionne avec overflow:hidden - agrandir/reduire ce
// conteneur revele/masque une partie du cadran au lieu de le mettre a l'echelle.
export function applyConfig(el, elConfig) {
  el.style.width = `${elConfig?.w ?? DEFAULT_W}px`;
  el.style.height = `${elConfig?.h ?? DEFAULT_H}px`;
}

export function create(elConfig) {
  const el = document.createElement("div");
  el.className = "hud-jauge";
  el.style.overflow = "hidden";
  applyConfig(el, elConfig);
  el.innerHTML = `
    <svg viewBox="0 0 580 420" class="hud-jauge__svg">
      <defs>
        <radialGradient id="jauge-face" cx="50%" cy="42%" r="70%">
          <stop offset="0%" stop-color="#232324"/>
          <stop offset="70%" stop-color="#141415"/>
          <stop offset="100%" stop-color="#050505"/>
        </radialGradient>
        <radialGradient id="jauge-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#ff5a1f" stop-opacity="0.5"/>
          <stop offset="100%" stop-color="#ff5a1f" stop-opacity="0"/>
        </radialGradient>
      </defs>

      <!-- Jauge essence (gauche, cadran analogique) -->
      <circle cx="${FUEL_CX}" cy="${FUEL_CY}" r="${FUEL_R + 16}" fill="url(#jauge-glow)"/>
      <circle cx="${FUEL_CX}" cy="${FUEL_CY}" r="${FUEL_R + 8}" class="hud-jauge__bezel"/>
      <circle cx="${FUEL_CX}" cy="${FUEL_CY}" r="${FUEL_R}" fill="url(#jauge-face)"/>
      ${buildTicks({ cx: FUEL_CX, cy: FUEL_CY, r: FUEL_R, angleMin: FUEL_ANGLE_MIN, angleMax: FUEL_ANGLE_MAX, min: 0, max: 100, step: FUEL_STEP, fontSize: 14, tickClass: "hud-jauge__tick--fuel", labels: [{ value: 0, text: "R" }, { value: 100, text: "F" }] })}
      ${buildStandaloneLabel({ cx: FUEL_CX, cy: FUEL_CY, r: FUEL_R, angleMin: FUEL_ANGLE_MIN, angleMax: FUEL_ANGLE_MAX, min: 0, max: 100, value: 50, text: "½", fontSize: 14 })}
      <text x="${FUEL_CX}" y="${FUEL_CY + 55}" id="jauge-fuel-digital" class="hud-jauge__unit hud-jauge__unit--fuel-value">0%</text>
      ${buildNeedle("jauge-needle-fuel", FUEL_CX, FUEL_CY, FUEL_R - 26, 14, 3, "hud-jauge__needle-group hud-jauge__needle-group--fuel")}
      <circle cx="${FUEL_CX}" cy="${FUEL_CY}" r="7" class="hud-jauge__cap hud-jauge__cap--fuel"/>

      <!-- Vitesse (droite, digital pur, aucun cadran/aiguille) -->
      <rect x="${DIGITAL_CX - DIGITAL_W / 2}" y="${DIGITAL_CY - DIGITAL_H / 2}" width="${DIGITAL_W}" height="${DIGITAL_H}" rx="16" class="hud-jauge__digital-panel"/>
      <text x="${DIGITAL_CX}" y="${DIGITAL_CY - 10}" id="jauge-speed-digital" class="hud-jauge__digital">0</text>
      <text x="${DIGITAL_CX}" y="${DIGITAL_CY + 55}" class="hud-jauge__unit hud-jauge__unit--digital">km/h</text>
    </svg>
    <style>
      .hud-jauge__svg { width: 580px; height: 420px; overflow: visible; filter: drop-shadow(0 0 12px rgba(255,90,31,0.35)); }
      .hud-jauge__bezel { fill: #050505; stroke: #2b2b2b; stroke-width: 3px; }
      .hud-jauge__digital-panel { fill: #050505; stroke: #ff5a1f; stroke-width: 3px; }
      .hud-jauge__tick { stroke: #ff5a1f; stroke-width: 2.5px; }
      .hud-jauge__tick--fuel { stroke: #e8e8e8; stroke-width: 2.5px; }
      .hud-jauge__label {
        font-family: "Rajdhani", sans-serif; font-weight: 700;
        fill: #ff8a3d; text-anchor: middle; dominant-baseline: middle;
      }
      .hud-jauge__digital {
        font-family: "Rajdhani", "Courier New", monospace; font-weight: 700; font-size: 100px;
        fill: #ff8a3d; text-anchor: middle; dominant-baseline: middle;
        filter: drop-shadow(0 0 10px rgba(255,138,61,0.9));
      }
      .hud-jauge__unit {
        font-family: "Rajdhani", sans-serif; font-weight: 600; font-size: 15px;
        fill: #ff8a3d; text-anchor: middle; opacity: 0.85;
      }
      .hud-jauge__unit--digital { font-size: 22px; letter-spacing: 2px; }
      .hud-jauge__unit--fuel-value { font-size: 22px; font-weight: 700; opacity: 1; }
      .hud-jauge__needle-group--fuel polygon { fill: #f2f2f2; stroke: #8a8a8a; stroke-width: 0.6px; }
      .hud-jauge__needle-group--fuel { filter: drop-shadow(0 0 4px rgba(255,255,255,0.8)); }
      .hud-jauge__cap--fuel { fill: #050505; stroke: #d8d8d8; stroke-width: 1.5px; }
    </style>
  `;

  const needleFuel = el.querySelector("#jauge-needle-fuel");
  const digitalSpeed = el.querySelector("#jauge-speed-digital");
  const digitalFuel = el.querySelector("#jauge-fuel-digital");

  onValue(
    ref(mapsRtdb, "vehicle_status"),
    (snapshot) => {
      const data = snapshot.val();
      if (!data || typeof data.speedKmh !== "number") return;
      digitalSpeed.textContent = Math.round(data.speedKmh);
    },
    (err) => console.warn("[jauge] lecture vitesse impossible:", err.message)
  );

  onSnapshot(
    doc(mapsDb, "project", "status"),
    (snap) => {
      const data = snap.data();
      if (!data || typeof data.fuelPercent !== "number") return;
      const angle = valueToAngle(data.fuelPercent, 0, 100, FUEL_ANGLE_MIN, FUEL_ANGLE_MAX);
      needleFuel.setAttribute("transform", `rotate(${angle.toFixed(1)} ${FUEL_CX} ${FUEL_CY})`);
      digitalFuel.textContent = `${Math.round(data.fuelPercent)}%`;
    },
    (err) => console.warn("[jauge] lecture essence impossible:", err.message)
  );

  return el;
}
