import { FUNCTIONS_BASE_URL } from "../../js/config.js?v=1";
import { getIdToken } from "./auth.js?v=1";

export function initReset() {
  document.getElementById("btn-reset").addEventListener("click", onReset);
}

async function onReset() {
  const confirmed = confirm(
    "Remettre à zéro argent, étoiles et arme ? " +
    "À utiliser uniquement avant le vrai départ du 1er septembre (tests en roulant)."
  );
  if (!confirmed) return;

  const token = await getIdToken();
  try {
    const res = await fetch(`${FUNCTIONS_BASE_URL}/resetState`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(await res.text());
    alert("Reset effectué.");
  } catch (err) {
    alert(`Echec du reset : ${err.message}`);
  }
}
