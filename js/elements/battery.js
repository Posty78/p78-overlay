import { ref, onValue } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import { mapsRtdb } from "../firebase-init.js";
import { DEVICE_RTDB_PATHS } from "../config.js";

export function create(elConfig) {
  const el = document.createElement("div");
  el.className = "hud-battery";
  el.innerHTML = `
    <span class="hud-battery__item" data-role="battery">--%</span>
    <span class="hud-battery__item" data-role="temp">--°C</span>
  `;

  const device = elConfig?.device || "tracking";
  const path = DEVICE_RTDB_PATHS[device] || DEVICE_RTDB_PATHS.tracking;

  const dbRef = ref(mapsRtdb, path);
  onValue(dbRef, (snapshot) => {
    const data = snapshot.val();
    if (!data) return;

    const batteryEl = el.querySelector('[data-role="battery"]');
    const tempEl = el.querySelector('[data-role="temp"]');

    if (typeof data.percentage === "number") {
      const chargingIcon = data.charging ? "⚡" : "🔋";
      batteryEl.textContent = `${chargingIcon} ${Math.round(data.percentage)}%`;
      batteryEl.classList.toggle("is-low", data.percentage <= 20 && !data.charging);
    }
    if (typeof data.temperature === "number") {
      tempEl.textContent = `🌡 ${Math.round(data.temperature)}°C`;
    }
  }, (err) => console.warn(`[battery:${device}] lecture RTDB impossible:`, err.message));

  return el;
}
