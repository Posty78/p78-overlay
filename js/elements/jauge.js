import { ref, onValue } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import { doc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { mapsDb, mapsRtdb } from "../firebase-init.js?v=1";

// Reproduction du bloc compteur Peugeot 206 : UN seul cadran (fond noir,
// aiguilles/chiffres rouge-orange) avec la jauge essence intégrée en petit
// cadran secondaire en bas a gauche, exactement comme le combine
// compte-tours+essence d'origine - sauf que l'echelle principale affiche des
// km/h a la place des tr/min, seule difference demandee.
const CX = 200, CY = 195, R = 178;
const SPEED_MIN = 0, SPEED_MAX = 200, SPEED_ANGLE_MIN = -120, SPEED_ANGLE_MAX = 120;
const SPEED_MAJOR_STEP = 20, SPEED_MINOR_STEP = 10;

// Petit cadran essence imbrique dans le quart bas-gauche du cadran principal
// (meme disposition que sur le vrai combine), pivot et rayon propres.
const FUEL_CX = 108, FUEL_CY = 280, FUEL_R = 58;
const FUEL_ANGLE_MIN = -55, FUEL_ANGLE_MAX = 55;

function polarPoint(cx, cy, r, angleDeg) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: cx + r * Math.sin(rad), y: cy - r * Math.cos(rad) };
}

function valueToAngle(value, min, max, angleMin, angleMax) {
  const clamped = Math.max(min, Math.min(max, value));
  return angleMin + ((clamped - min) / (max - min)) * (angleMax - angleMin);
}

function buildTicks({ cx, cy, r, angleMin, angleMax, min, max, majorStep, minorStep, labels, fontSize }) {
  let svg = "";
  const majorLen = r * 0.13, minorLen = r * 0.07;

  if (minorStep) {
    for (let v = min; v <= max; v += minorStep) {
      const a = valueToAngle(v, min, max, angleMin, angleMax);
      const outer = polarPoint(cx, cy, r, a);
      const inner = polarPoint(cx, cy, r - minorLen, a);
      svg += `<line x1="${inner.x.toFixed(1)}" y1="${inner.y.toFixed(1)}" x2="${outer.x.toFixed(1)}" y2="${outer.y.toFixed(1)}" class="hud-jauge__tick hud-jauge__tick--minor"/>`;
    }
  }

  const majorValues = labels ? labels.map((l) => l.value) : (() => {
    const vals = [];
    for (let v = min; v <= max; v += majorStep) vals.push(v);
    return vals;
  })();

  for (const v of majorValues) {
    const a = valueToAngle(v, min, max, angleMin, angleMax);
    const outer = polarPoint(cx, cy, r, a);
    const inner = polarPoint(cx, cy, r - majorLen, a);
    svg += `<line x1="${inner.x.toFixed(1)}" y1="${inner.y.toFixed(1)}" x2="${outer.x.toFixed(1)}" y2="${outer.y.toFixed(1)}" class="hud-jauge__tick hud-jauge__tick--major"/>`;

    const labelPos = polarPoint(cx, cy, r - majorLen - (fontSize || 15), a);
    const text = labels ? labels.find((l) => l.value === v).text : String(v);
    svg += `<text x="${labelPos.x.toFixed(1)}" y="${labelPos.y.toFixed(1)}" class="hud-jauge__label" style="font-size:${fontSize || 17}px">${text}</text>`;
  }

  return svg;
}

function buildNeedle(id, cx, cy, len, tailLen, width) {
  const w = width || 3.5;
  return `
    <g id="${id}" class="hud-jauge__needle-group">
      <polygon points="${cx - w},${cy} ${cx - 1},${cy - len} ${cx + 1},${cy - len} ${cx + w},${cy}" class="hud-jauge__needle"/>
      <polygon points="${cx - w * 0.8},${cy} ${cx},${cy + tailLen} ${cx + w * 0.8},${cy}" class="hud-jauge__needle"/>
    </g>
  `;
}

// Icone pompe a essence simplifiee, posee pres du "E" du petit cadran.
const PUMP_ICON = `
  <g transform="translate(${FUEL_CX - 34}, ${FUEL_CY + 4})" class="hud-jauge__pump">
    <rect x="0" y="-10" width="14" height="18" rx="1.5"/>
    <path d="M14,-4 h5 a3,3 0 0 1 3,3 v10 a2.5,2.5 0 0 1 -5,0 v-6 h-3" fill="none" stroke-width="2"/>
  </g>
`;

export function create() {
  const el = document.createElement("div");
  el.className = "hud-jauge";
  el.innerHTML = `
    <svg viewBox="0 0 400 380" class="hud-jauge__svg">
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

      <circle cx="${CX}" cy="${CY}" r="${R + 20}" fill="url(#jauge-glow)"/>

      <circle cx="${CX}" cy="${CY}" r="${R + 10}" class="hud-jauge__bezel"/>
      <circle cx="${CX}" cy="${CY}" r="${R}" fill="url(#jauge-face)"/>

      ${buildTicks({ cx: CX, cy: CY, r: R, angleMin: SPEED_ANGLE_MIN, angleMax: SPEED_ANGLE_MAX, min: SPEED_MIN, max: SPEED_MAX, majorStep: SPEED_MAJOR_STEP, minorStep: SPEED_MINOR_STEP })}
      <text x="${CX}" y="${CY + 60}" class="hud-jauge__unit">km/h</text>

      <!-- Petit cadran essence imbrique, meme disposition que le vrai combine -->
      <circle cx="${FUEL_CX}" cy="${FUEL_CY}" r="${FUEL_R}" class="hud-jauge__fuel-bg"/>
      ${buildTicks({ cx: FUEL_CX, cy: FUEL_CY, r: FUEL_R, angleMin: FUEL_ANGLE_MIN, angleMax: FUEL_ANGLE_MAX, min: 0, max: 100, fontSize: 12, labels: [{ value: 0, text: "E" }, { value: 50, text: "½" }, { value: 100, text: "F" }] })}
      ${PUMP_ICON}
      ${buildNeedle("jauge-needle-fuel", FUEL_CX, FUEL_CY, FUEL_R - 16, 8, 2)}
      <circle cx="${FUEL_CX}" cy="${FUEL_CY}" r="4" class="hud-jauge__cap"/>

      ${buildNeedle("jauge-needle-speed", CX, CY, R - 46, 20, 4)}
      <circle cx="${CX}" cy="${CY}" r="9" class="hud-jauge__cap"/>
    </svg>
    <style>
      .hud-jauge__svg { width: 400px; height: 380px; overflow: visible; filter: drop-shadow(0 0 12px rgba(255,90,31,0.4)); }
      .hud-jauge__bezel { fill: #050505; stroke: #2b2b2b; stroke-width: 3px; }
      .hud-jauge__fuel-bg { fill: #0c0c0d; stroke: #ff5a1f; stroke-width: 1px; opacity: 0.9; }
      .hud-jauge__tick { stroke: #ff5a1f; }
      .hud-jauge__tick--major { stroke-width: 2.5px; }
      .hud-jauge__tick--minor { stroke-width: 1.2px; opacity: 0.65; }
      .hud-jauge__label {
        font-family: "Rajdhani", sans-serif; font-weight: 700;
        fill: #ff8a3d; text-anchor: middle; dominant-baseline: middle;
      }
      .hud-jauge__unit {
        font-family: "Rajdhani", sans-serif; font-weight: 600; font-size: 15px;
        fill: #ff8a3d; text-anchor: middle; opacity: 0.85;
      }
      .hud-jauge__needle { fill: #ff3b1f; stroke: #7a1200; stroke-width: 0.6px; }
      .hud-jauge__needle-group { filter: drop-shadow(0 0 5px rgba(255,59,31,0.95)); transition: transform 0.25s ease-out; }
      .hud-jauge__cap { fill: #050505; stroke: #ff5a1f; stroke-width: 1.5px; }
      .hud-jauge__pump { fill: none; stroke: #ff8a3d; stroke-width: 1.5px; opacity: 0.9; }
      .hud-jauge__pump rect { fill: #0c0c0d; }
    </style>
  `;

  const needleSpeed = el.querySelector("#jauge-needle-speed");
  const needleFuel = el.querySelector("#jauge-needle-fuel");

  onValue(
    ref(mapsRtdb, "vehicle_status"),
    (snapshot) => {
      const data = snapshot.val();
      if (!data || typeof data.speedKmh !== "number") return;
      const angle = valueToAngle(data.speedKmh, SPEED_MIN, SPEED_MAX, SPEED_ANGLE_MIN, SPEED_ANGLE_MAX);
      needleSpeed.setAttribute("transform", `rotate(${angle.toFixed(1)} ${CX} ${CY})`);
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
    },
    (err) => console.warn("[jauge] lecture essence impossible:", err.message)
  );

  return el;
}
