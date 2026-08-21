import { ref, onValue } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import { mapsRtdb } from "../firebase-init.js";
import { TRACKING_DEVICE_RTDB_PATH } from "../config.js";

export function create() {
  const el = document.createElement("div");
  el.className = "hud-battery";
  el.innerHTML = `
    <span class="hud-battery__item" data-role="battery">--%</span>
    <span class="hud-battery__item" data-role="temp">--°C</span>
  `;

  const path = ref(mapsRtdb, TRACKING_DEVICE_RTDB_PATH);
  onValue(path, (snapshot) => {
    const data = snapshot.val();
    if (!data) return;

    const batteryEl = el.querySelector('[data-role="battery"]');
    const tempEl = el.querySelector('[data-role="temp"]');

    if (typeof data.battery === "number") {
      batteryEl.textContent = `🔋 ${Math.round(data.battery)}%`;
      batteryEl.classList.toggle("is-low", data.battery <= 20);
    }
    if (typeof data.temperature === "number") {
      tempEl.textContent = `🌡 ${Math.round(data.temperature)}°C`;
    }
  }, (err) => console.warn("[battery] lecture RTDB impossible:", err.message));

  return el;
}
