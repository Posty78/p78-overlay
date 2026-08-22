import { doc, onSnapshot, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { db } from "../../js/firebase-init.js";

const widgetsRef = doc(db, "state", "widgets");

const mapsStatusEl    = document.getElementById("maps-status");
const overlayStatusEl = document.getElementById("overlay-status");

export function initWidgets() {
  onSnapshot(widgetsRef, (snap) => {
    const data = snap.data() || {};
    mapsStatusEl.textContent = data.mapsHidden ? "🔴 Mini map + météo MASQUÉES" : "⚪ Mini map + météo visibles";
    mapsStatusEl.className = data.mapsHidden ? "hint danger" : "hint";
    overlayStatusEl.textContent = data.allHidden ? "🔴 TOUT l'overlay MASQUÉ" : "⚪ Overlay visible";
    overlayStatusEl.className = data.allHidden ? "hint danger" : "hint";
  });

  document.getElementById("btn-maps-hide").addEventListener("click", () => setFlag("mapsHidden", true));
  document.getElementById("btn-maps-show").addEventListener("click", () => setFlag("mapsHidden", false));
  document.getElementById("btn-overlay-hide").addEventListener("click", () => setFlag("allHidden", true));
  document.getElementById("btn-overlay-show").addEventListener("click", () => setFlag("allHidden", false));
}

function setFlag(field, value) {
  return setDoc(widgetsRef, { [field]: value, updatedAt: serverTimestamp() }, { merge: true });
}
