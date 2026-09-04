import { ref, onValue } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import { doc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { mapsDb, mapsRtdb } from "../firebase-init.js?v=1";

// Deux cadrans distincts cote a cote : jauge essence a gauche (aiguille/graduations
// blanches, pompe + "1/2" en haut - modele du petit cadran essence separe, pas le
// combine tr/min+essence), compteur vitesse a droite (repris tel quel, deja valide).
const FUEL_CX = 140, FUEL_CY = 205, FUEL_R = 105;
const FUEL_ANGLE_MIN = -100, FUEL_ANGLE_MAX = 100;
const FUEL_MINOR_STEP = 100 / 7;

// Marge calculee sur les halos (glow) inclus, pas juste les cercles de face :
// halo essence jusqu'a FUEL_CX+FUEL_R+16=261, halo vitesse a partir de
// SPEED_CX-SPEED_R-20 -> avec SPEED_CX=490 ca demarre a 292, ~30px d'ecart net.
const SPEED_CX = 490, SPEED_CY = 205, SPEED_R = 178;
const SPEED_MIN = 0, SPEED_MAX = 200, SPEED_ANGLE_MIN = -120, SPEED_ANGLE_MAX = 120;
const SPEED_MAJOR_STEP = 20, SPEED_MINOR_STEP = 10;

function polarPoint(cx, cy, r, angleDeg) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: cx + r * Math.sin(rad), y: cy - r * Math.cos(rad) };
}

function valueToAngle(value, min, max, angleMin, angleMax) {
  const clamped = Math.max(min, Math.min(max, value));
  return angleMin + ((clamped - min) / (max - min)) * (angleMax - angleMin);
}

function buildTicks({ cx, cy, r, angleMin, angleMax, min, max, majorStep, minorStep, labels, fontSize, tickClass }) {
  let svg = "";
  const majorLen = r * 0.14, minorLen = r * 0.075;
  const cls = tickClass || "hud-jauge__tick";

  if (minorStep) {
    for (let v = min; v <= max; v += minorStep) {
      const a = valueToAngle(v, min, max, angleMin, angleMax);
      const outer = polarPoint(cx, cy, r, a);
      const inner = polarPoint(cx, cy, r - minorLen, a);
      svg += `<line x1="${inner.x.toFixed(1)}" y1="${inner.y.toFixed(1)}" x2="${outer.x.toFixed(1)}" y2="${outer.y.toFixed(1)}" class="${cls} ${cls}--minor"/>`;
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
    svg += `<line x1="${inner.x.toFixed(1)}" y1="${inner.y.toFixed(1)}" x2="${outer.x.toFixed(1)}" y2="${outer.y.toFixed(1)}" class="${cls} ${cls}--major"/>`;

    if (labels) {
      const labelPos = polarPoint(cx, cy, r - majorLen - (fontSize || 15), a);
      const text = labels.find((l) => l.value === v).text;
      svg += `<text x="${labelPos.x.toFixed(1)}" y="${labelPos.y.toFixed(1)}" class="hud-jauge__label" style="font-size:${fontSize || 17}px">${text}</text>`;
    }
  }

  return svg;
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

// Icone pompe a essence, tout pres du bord du cadran (comme sur la photo de
// reference) - volontairement petite et collee au bezel pour ne jamais
// chevaucher le repere "½" en dessous (voir marge verifiee dans le calcul de
// buildTicks : le label est a une distance min de r - majorLen - fontSize du
// centre, l'icone doit rester au-dela de ce rayon).
const PUMP_ICON = `
  <g transform="translate(${FUEL_CX - 5.5}, ${FUEL_CY - FUEL_R + 6})" class="hud-jauge__pump">
    <rect x="0" y="0" width="11" height="12" rx="1.2"/>
    <path d="M11,4 h4 a2.4,2.4 0 0 1 2.4,2.4 v6.6 a1.8,1.8 0 0 1 -3.6,0 v-3.6 h-2.8" fill="none" stroke-width="1.4"/>
  </g>
`;

export function create() {
  const el = document.createElement("div");
  el.className = "hud-jauge";
  el.innerHTML = `
    <svg viewBox="0 0 710 420" class="hud-jauge__svg">
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

      <!-- Cadran essence (gauche) -->
      <circle cx="${FUEL_CX}" cy="${FUEL_CY}" r="${FUEL_R + 16}" fill="url(#jauge-glow)"/>
      <circle cx="${FUEL_CX}" cy="${FUEL_CY}" r="${FUEL_R + 8}" class="hud-jauge__bezel"/>
      <circle cx="${FUEL_CX}" cy="${FUEL_CY}" r="${FUEL_R}" fill="url(#jauge-face)"/>
      ${buildTicks({ cx: FUEL_CX, cy: FUEL_CY, r: FUEL_R, angleMin: FUEL_ANGLE_MIN, angleMax: FUEL_ANGLE_MAX, min: 0, max: 100, minorStep: FUEL_MINOR_STEP, fontSize: 15, tickClass: "hud-jauge__tick--fuel", labels: [{ value: 0, text: "E" }, { value: 50, text: "½" }, { value: 100, text: "F" }] })}
      ${PUMP_ICON}
      ${buildNeedle("jauge-needle-fuel", FUEL_CX, FUEL_CY, FUEL_R - 22, 14, 3, "hud-jauge__needle-group hud-jauge__needle-group--fuel")}
      <circle cx="${FUEL_CX}" cy="${FUEL_CY}" r="7" class="hud-jauge__cap hud-jauge__cap--fuel"/>

      <!-- Compteur vitesse (droite) -->
      <circle cx="${SPEED_CX}" cy="${SPEED_CY}" r="${SPEED_R + 20}" fill="url(#jauge-glow)"/>
      <circle cx="${SPEED_CX}" cy="${SPEED_CY}" r="${SPEED_R + 10}" class="hud-jauge__bezel"/>
      <circle cx="${SPEED_CX}" cy="${SPEED_CY}" r="${SPEED_R}" fill="url(#jauge-face)"/>
      ${buildTicks({ cx: SPEED_CX, cy: SPEED_CY, r: SPEED_R, angleMin: SPEED_ANGLE_MIN, angleMax: SPEED_ANGLE_MAX, min: SPEED_MIN, max: SPEED_MAX, majorStep: SPEED_MAJOR_STEP, minorStep: SPEED_MINOR_STEP })}
      <text x="${SPEED_CX}" y="${SPEED_CY + 60}" class="hud-jauge__unit">km/h</text>
      ${buildNeedle("jauge-needle-speed", SPEED_CX, SPEED_CY, SPEED_R - 46, 20, 4)}
      <circle cx="${SPEED_CX}" cy="${SPEED_CY}" r="9" class="hud-jauge__cap"/>
    </svg>
    <style>
      .hud-jauge__svg { width: 710px; height: 420px; overflow: visible; filter: drop-shadow(0 0 12px rgba(255,90,31,0.35)); }
      .hud-jauge__bezel { fill: #050505; stroke: #2b2b2b; stroke-width: 3px; }
      .hud-jauge__tick { stroke: #ff5a1f; }
      .hud-jauge__tick--major { stroke-width: 2.5px; }
      .hud-jauge__tick--minor { stroke-width: 1.2px; opacity: 0.65; }
      .hud-jauge__tick--fuel { stroke: #e8e8e8; }
      .hud-jauge__tick--fuel.hud-jauge__tick--major { stroke-width: 2.5px; }
      .hud-jauge__tick--fuel.hud-jauge__tick--minor { stroke-width: 1.3px; opacity: 0.7; }
      .hud-jauge__label {
        font-family: "Rajdhani", sans-serif; font-weight: 700;
        fill: #ff8a3d; text-anchor: middle; dominant-baseline: middle;
      }
      .hud-jauge__unit {
        font-family: "Rajdhani", sans-serif; font-weight: 600; font-size: 15px;
        fill: #ff8a3d; text-anchor: middle; opacity: 0.85;
      }
      .hud-jauge__needle-group polygon { fill: #ff3b1f; stroke: #7a1200; stroke-width: 0.6px; }
      .hud-jauge__needle-group { filter: drop-shadow(0 0 5px rgba(255,59,31,0.95)); transition: transform 0.25s ease-out; }
      .hud-jauge__needle-group--fuel polygon { fill: #f2f2f2; stroke: #8a8a8a; stroke-width: 0.6px; }
      .hud-jauge__needle-group--fuel { filter: drop-shadow(0 0 4px rgba(255,255,255,0.8)); }
      .hud-jauge__cap { fill: #050505; stroke: #ff5a1f; stroke-width: 1.5px; }
      .hud-jauge__cap--fuel { stroke: #d8d8d8; }
      .hud-jauge__pump { fill: #0c0c0d; stroke: #e8e8e8; stroke-width: 1.5px; opacity: 0.9; }
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
      needleSpeed.setAttribute("transform", `rotate(${angle.toFixed(1)} ${SPEED_CX} ${SPEED_CY})`);
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
