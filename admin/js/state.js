import {
  doc, onSnapshot, setDoc, increment,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { db } from "../../js/firebase-init.js?v=1";

const STARS_MAX = 6;
const stateRef = doc(db, "state", "gta");

const moneyDisplay = document.getElementById("state-money-display");
const starsDisplay = document.getElementById("state-stars-display");
const moneySetInput = document.getElementById("money-set-input");

let latest = { money: 0, stars: 0 };

export function initState() {
  onSnapshot(stateRef, (snap) => {
    latest = snap.data() || { money: 0, stars: 0 };
    moneyDisplay.textContent = `$${latest.money ?? 0}`;
    starsDisplay.textContent = String(latest.stars ?? 0);
  });

  document.querySelectorAll("[data-money-delta]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const delta = Number(btn.dataset.moneyDelta);
      setDoc(stateRef, { money: increment(delta) }, { merge: true });
    });
  });

  document.getElementById("btn-money-set").addEventListener("click", () => {
    const value = Number(moneySetInput.value);
    if (Number.isNaN(value)) return;
    setDoc(stateRef, { money: value }, { merge: true });
    moneySetInput.value = "";
  });

  document.getElementById("btn-stars-plus").addEventListener("click", () => {
    const next = Math.max(0, Math.min(STARS_MAX, (latest.stars ?? 0) + 1));
    setDoc(stateRef, { stars: next }, { merge: true });
  });

  document.getElementById("btn-stars-minus").addEventListener("click", () => {
    const next = Math.max(0, Math.min(STARS_MAX, (latest.stars ?? 0) - 1));
    setDoc(stateRef, { stars: next }, { merge: true });
  });

  document.getElementById("btn-stars-zero").addEventListener("click", () => {
    setDoc(stateRef, { stars: 0 }, { merge: true });
  });
}
