import { doc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { mapsDb } from "../firebase-init.js?v=1";
import { TRACKING_POSITION_DOC, FUNCTIONS_BASE_URL } from "../config.js?v=1";

const REFRESH_INTERVAL_MS = 10 * 60 * 1000; // 10 min : la météo change lentement, inutile d'appeler plus souvent

export function create() {
  const el = document.createElement("div");
  el.className = "hud-weather";
  el.innerHTML = `<span data-role="city">--</span><span data-role="temp">--°C</span>`;

  let latestPos = null;
  let hasFetchedOnce = false;

  const ref = doc(mapsDb, TRACKING_POSITION_DOC.collection, TRACKING_POSITION_DOC.document);
  onSnapshot(ref, (snapshot) => {
    const data = snapshot.data();
    if (data && typeof data.lat === "number" && typeof data.lng === "number") {
      latestPos = data;
      if (!hasFetchedOnce) {
        hasFetchedOnce = true;
        refresh();
      }
    }
  }, (err) => console.warn("[weather] lecture position impossible:", err.message));

  async function refresh() {
    if (!latestPos) return;
    try {
      const res = await fetch(`${FUNCTIONS_BASE_URL}/weatherProxy?lat=${latestPos.lat}&lng=${latestPos.lng}`);
      const data = await res.json();
      if (!data.ok) return;
      el.querySelector('[data-role="city"]').textContent = data.city || "--";
      el.querySelector('[data-role="temp"]').textContent =
        typeof data.tempC === "number" ? `${Math.round(data.tempC)}°C` : "--°C";
    } catch (err) {
      console.warn("[weather] appel weatherProxy impossible:", err.message);
    }
  }

  setInterval(refresh, REFRESH_INTERVAL_MS);

  return el;
}
