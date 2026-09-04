import { ref, onValue } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import { doc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { mapsDb, mapsRtdb } from "../firebase-init.js?v=1";

// Reproduction du bloc compteur Peugeot 206 phase 1 : cadran vitesse (0-200 km/h)
// + jauge essence (E-F), fond crème, aiguilles/rétroéclairage orange. Les deux
// aiguilles tournent autour de leur pivot via l'attribut SVG transform="rotate(angle cx cy)"
// (plus fiable que transform-origin en CSS sur du SVG).
const SPEED_CX = 150, SPEED_CY = 130, SPEED_R = 108;
const SPEED_MIN = 0, SPEED_MAX = 200, SPEED_ANGLE_MIN = -120, SPEED_ANGLE_MAX = 120;
const SPEED_MAJOR_STEP = 20, SPEED_MINOR_STEP = 10;

const FUEL_CX = 372, FUEL_CY = 150, FUEL_R = 66;
const FUEL_ANGLE_MIN = -60, FUEL_ANGLE_MAX = 60;

function polarPoint(cx, cy, r, angleDeg) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: cx + r * Math.sin(rad), y: cy - r * Math.cos(rad) };
}

function valueToAngle(value, min, max, angleMin, angleMax) {
  const clamped = Math.max(min, Math.min(max, value));
  return angleMin + ((clamped - min) / (max - min)) * (angleMax - angleMin);
}

function buildTicks({ cx, cy, r, angleMin, angleMax, min, max, majorStep, minorStep, labels }) {
  let svg = "";
  const majorLen = 14, minorLen = 7;

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

    const labelPos = polarPoint(cx, cy, r - majorLen - 16, a);
    const text = labels ? labels.find((l) => l.value === v).text : String(v);
    svg += `<text x="${labelPos.x.toFixed(1)}" y="${labelPos.y.toFixed(1)}" class="hud-jauge__label">${text}</text>`;
  }

  return svg;
}

function buildNeedle(id, cx, cy, len, tailLen) {
  return `
    <g id="${id}" class="hud-jauge__needle-group">
      <polygon points="${cx - 3.5},${cy} ${cx - 1},${cy - len} ${cx + 1},${cy - len} ${cx + 3.5},${cy}" class="hud-jauge__needle"/>
      <polygon points="${cx - 3},${cy} ${cx},${cy + tailLen} ${cx + 3},${cy}" class="hud-jauge__needle"/>
    </g>
  `;
}

export function create() {
  const el = document.createElement("div");
  el.className = "hud-jauge";
  el.innerHTML = `
    <svg viewBox="0 0 460 240" class="hud-jauge__svg">
      <defs>
        <radialGradient id="jauge-face" cx="50%" cy="45%" r="65%">
          <stop offset="0%" stop-color="#fbf3df"/>
          <stop offset="75%" stop-color="#ecdfbd"/>
          <stop offset="100%" stop-color="#d8c99e"/>
        </radialGradient>
        <radialGradient id="jauge-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#ff9900" stop-opacity="0.55"/>
          <stop offset="100%" stop-color="#ff9900" stop-opacity="0"/>
        </radialGradient>
      </defs>

      <circle cx="${SPEED_CX}" cy="${SPEED_CY}" r="${SPEED_R + 22}" fill="url(#jauge-glow)"/>
      <circle cx="${FUEL_CX}" cy="${FUEL_CY}" r="${FUEL_R + 18}" fill="url(#jauge-glow)"/>

      <circle cx="${SPEED_CX}" cy="${SPEED_CY}" r="${SPEED_R + 10}" class="hud-jauge__bezel"/>
      <circle cx="${SPEED_CX}" cy="${SPEED_CY}" r="${SPEED_R}" fill="url(#jauge-face)"/>
      ${buildTicks({ cx: SPEED_CX, cy: SPEED_CY, r: SPEED_R, angleMin: SPEED_ANGLE_MIN, angleMax: SPEED_ANGLE_MAX, min: SPEED_MIN, max: SPEED_MAX, majorStep: SPEED_MAJOR_STEP, minorStep: SPEED_MINOR_STEP })}
      <text x="${SPEED_CX}" y="${SPEED_CY + 46}" class="hud-jauge__unit">km/h</text>
      ${buildNeedle("jauge-needle-speed", SPEED_CX, SPEED_CY, SPEED_R - 30, 16)}
      <circle cx="${SPEED_CX}" cy="${SPEED_CY}" r="7" class="hud-jauge__cap"/>

      <circle cx="${FUEL_CX}" cy="${FUEL_CY}" r="${FUEL_R + 8}" class="hud-jauge__bezel"/>
      <circle cx="${FUEL_CX}" cy="${FUEL_CY}" r="${FUEL_R}" fill="url(#jauge-face)"/>
      ${buildTicks({ cx: FUEL_CX, cy: FUEL_CY, r: FUEL_R, angleMin: FUEL_ANGLE_MIN, angleMax: FUEL_ANGLE_MAX, min: 0, max: 100, labels: [{ value: 0, text: "E" }, { value: 50, text: "½" }, { value: 100, text: "F" }] })}
      <text x="${FUEL_CX}" y="${FUEL_CY + 34}" class="hud-jauge__unit hud-jauge__unit--small">⛽</text>
      ${buildNeedle("jauge-needle-fuel", FUEL_CX, FUEL_CY, FUEL_R - 22, 10)}
      <circle cx="${FUEL_CX}" cy="${FUEL_CY}" r="5" class="hud-jauge__cap"/>
    </svg>
    <style>
      .hud-jauge__svg { width: 460px; height: 240px; overflow: visible; filter: drop-shadow(0 0 10px rgba(255,140,0,0.35)); }
      .hud-jauge__bezel { fill: #16130f; stroke: #3a352a; stroke-width: 2px; }
      .hud-jauge__tick { stroke: #8a5a1f; }
      .hud-jauge__tick--major { stroke-width: 2.5px; }
      .hud-jauge__tick--minor { stroke-width: 1.2px; opacity: 0.7; }
      .hud-jauge__label {
        font-family: "Rajdhani", sans-serif; font-weight: 700; font-size: 15px;
        fill: #2a2115; text-anchor: middle; dominant-baseline: middle;
      }
      .hud-jauge__unit {
        font-family: "Rajdhani", sans-serif; font-weight: 600; font-size: 13px;
        fill: #6b4a1c; text-anchor: middle;
      }
      .hud-jauge__unit--small { font-size: 20px; }
      .hud-jauge__needle { fill: #ff8c00; stroke: #7a3d00; stroke-width: 0.6px; }
      .hud-jauge__needle-group { filter: drop-shadow(0 0 4px rgba(255,140,0,0.9)); transition: transform 0.25s ease-out; }
      .hud-jauge__cap { fill: #16130f; stroke: #ff8c00; stroke-width: 1px; }
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
