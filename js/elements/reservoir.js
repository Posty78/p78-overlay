import { doc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { mapsDb } from "../firebase-init.js?v=1";

// Jauge essence seule (widget separe de "jauge.js", qui ne contient plus que
// le compteur vitesse) : cadran analogique 0-100%, 10 graduations par pas de
// 100/9 (R et F tombent pile sur le premier/dernier trait), aiguille blanche,
// pourcentage affiche en chiffres a cote du symbole %.
const FUEL_CX = 140, FUEL_CY = 140, FUEL_R = 110;
const FUEL_ANGLE_MIN = -100, FUEL_ANGLE_MAX = 100;
const FUEL_STEP = 100 / 9;
const DEFAULT_W = 280, DEFAULT_H = 280;

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
// un texte - les autres restent des traits nus.
function buildTicks({ cx, cy, r, angleMin, angleMax, min, max, step, labels, fontSize, tickClass }) {
  let svg = "";
  const majorLen = r * 0.14;
  const cls = tickClass || "hud-reservoir__tick";

  for (let v = min; v <= max + 0.001; v += step) {
    const a = valueToAngle(v, min, max, angleMin, angleMax);
    const outer = polarPoint(cx, cy, r, a);
    const inner = polarPoint(cx, cy, r - majorLen, a);
    svg += `<line x1="${inner.x.toFixed(1)}" y1="${inner.y.toFixed(1)}" x2="${outer.x.toFixed(1)}" y2="${outer.y.toFixed(1)}" class="${cls}"/>`;

    const match = labels ? labels.find((l) => Math.abs(l.value - v) < 0.5) : { text: String(Math.round(v)) };
    if (match) {
      const labelPos = polarPoint(cx, cy, r - majorLen - (fontSize || 15), a);
      svg += `<text x="${labelPos.x.toFixed(1)}" y="${labelPos.y.toFixed(1)}" class="hud-reservoir__label" style="font-size:${fontSize || 17}px">${match.text}</text>`;
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
  return `<text x="${pos.x.toFixed(1)}" y="${pos.y.toFixed(1)}" class="hud-reservoir__label" style="font-size:${fontSize || 17}px">${text}</text>`;
}

// initialAngle : orientation avant toute donnee reelle recue (evite qu'un SVG
// "non tourne" pointe par coincidence sur une valeur qui n'est pas 0).
function buildNeedle(id, cx, cy, len, tailLen, width, initialAngle) {
  const transform = initialAngle ? ` transform="rotate(${initialAngle} ${cx} ${cy})"` : "";
  return `
    <g id="${id}" class="hud-reservoir__needle-group"${transform}>
      <polygon points="${cx - width},${cy} ${cx - 1},${cy - len} ${cx + 1},${cy - len} ${cx + width},${cy}"/>
      <polygon points="${cx - width * 0.8},${cy} ${cx},${cy + tailLen} ${cx + width * 0.8},${cy}"/>
    </g>
  `;
}

// Recadrable comme les autres widgets : le SVG garde sa taille intrinseque
// fixe, c'est le conteneur (overflow:hidden) qui se redimensionne.
export function applyConfig(el, elConfig) {
  el.style.width = `${elConfig?.w ?? DEFAULT_W}px`;
  el.style.height = `${elConfig?.h ?? DEFAULT_H}px`;
}

export function create(elConfig) {
  const el = document.createElement("div");
  el.className = "hud-reservoir";
  el.style.overflow = "hidden";
  applyConfig(el, elConfig);
  el.innerHTML = `
    <svg viewBox="0 0 280 280" class="hud-reservoir__svg">
      <defs>
        <radialGradient id="reservoir-face" cx="50%" cy="42%" r="70%">
          <stop offset="0%" stop-color="#232324"/>
          <stop offset="70%" stop-color="#141415"/>
          <stop offset="100%" stop-color="#050505"/>
        </radialGradient>
        <radialGradient id="reservoir-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#ff5a1f" stop-opacity="0.5"/>
          <stop offset="100%" stop-color="#ff5a1f" stop-opacity="0"/>
        </radialGradient>
      </defs>

      <circle cx="${FUEL_CX}" cy="${FUEL_CY}" r="${FUEL_R + 16}" fill="url(#reservoir-glow)"/>
      <circle cx="${FUEL_CX}" cy="${FUEL_CY}" r="${FUEL_R + 8}" class="hud-reservoir__bezel"/>
      <circle cx="${FUEL_CX}" cy="${FUEL_CY}" r="${FUEL_R}" fill="url(#reservoir-face)"/>
      ${buildTicks({ cx: FUEL_CX, cy: FUEL_CY, r: FUEL_R, angleMin: FUEL_ANGLE_MIN, angleMax: FUEL_ANGLE_MAX, min: 0, max: 100, step: FUEL_STEP, fontSize: 14, labels: [{ value: 0, text: "R" }, { value: 100, text: "F" }] })}
      ${buildStandaloneLabel({ cx: FUEL_CX, cy: FUEL_CY, r: FUEL_R, angleMin: FUEL_ANGLE_MIN, angleMax: FUEL_ANGLE_MAX, min: 0, max: 100, value: 50, text: "½", fontSize: 14 })}
      <text x="${FUEL_CX}" y="${FUEL_CY + 55}" id="reservoir-digital" class="hud-reservoir__unit hud-reservoir__unit--value">0%</text>
      ${buildNeedle("reservoir-needle", FUEL_CX, FUEL_CY, FUEL_R - 26, 14, 3, FUEL_ANGLE_MIN)}
      <circle cx="${FUEL_CX}" cy="${FUEL_CY}" r="7" class="hud-reservoir__cap"/>
    </svg>
    <style>
      .hud-reservoir__svg { width: 280px; height: 280px; overflow: visible; filter: drop-shadow(0 0 12px rgba(255,90,31,0.35)); }
      .hud-reservoir__bezel { fill: #050505; stroke: #2b2b2b; stroke-width: 3px; }
      .hud-reservoir__tick { stroke: #e8e8e8; stroke-width: 2.5px; }
      .hud-reservoir__label {
        font-family: "Rajdhani", sans-serif; font-weight: 700;
        fill: #ff8a3d; text-anchor: middle; dominant-baseline: middle;
      }
      .hud-reservoir__unit {
        font-family: "Rajdhani", sans-serif; font-weight: 600; font-size: 15px;
        fill: #ff8a3d; text-anchor: middle; opacity: 0.85;
      }
      .hud-reservoir__unit--value { font-size: 22px; font-weight: 700; opacity: 1; }
      .hud-reservoir__needle-group polygon { fill: #f2f2f2; stroke: #8a8a8a; stroke-width: 0.6px; }
      .hud-reservoir__needle-group { filter: drop-shadow(0 0 4px rgba(255,255,255,0.8)); transition: transform 0.25s ease-out; }
      .hud-reservoir__cap { fill: #050505; stroke: #d8d8d8; stroke-width: 1.5px; }
    </style>
  `;

  const needle = el.querySelector("#reservoir-needle");
  const digital = el.querySelector("#reservoir-digital");

  onSnapshot(
    doc(mapsDb, "project", "status"),
    (snap) => {
      const data = snap.data();
      if (!data || typeof data.fuelPercent !== "number") return;
      const angle = valueToAngle(data.fuelPercent, 0, 100, FUEL_ANGLE_MIN, FUEL_ANGLE_MAX);
      needle.setAttribute("transform", `rotate(${angle.toFixed(1)} ${FUEL_CX} ${FUEL_CY})`);
      digital.textContent = `${Math.round(data.fuelPercent)}%`;
    },
    (err) => console.warn("[reservoir] lecture essence impossible:", err.message)
  );

  return el;
}
