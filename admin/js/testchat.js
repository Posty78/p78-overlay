import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { db, auth } from "../../js/firebase-init.js?v=1";
import { FUNCTIONS_BASE_URL } from "../../js/config.js?v=1";

// Commandes fixes gerees directement par commandWebhook (voir functions/index.js).
// Les noms d'armes sont dynamiques (collection Firestore "weapons"), recuperes a part.
const STATIC_COMMANDS = [
  { cmd: "!argent +N / -N", desc: "modifie l'argent affiché" },
  { cmd: "!etoile +1 / -1 / N", desc: "modifie les étoiles (bornées 0-6)" },
  { cmd: "!censureon / !censureoff", desc: "affiche/masque le masque de censure" },
  { cmd: "!mapson / !mapsoff", desc: "affiche/masque mini map + météo + compteur + réservoir" },
  { cmd: "!overlayon / !overlayoff", desc: "affiche/masque tout l'overlay" },
  { cmd: "!regis", desc: "déclenche le scan réseau (widget Regis)" },
  { cmd: "!jauge N", desc: "fixe la jauge essence à N% (0-100)" },
  { cmd: "!essence N", desc: "ajoute N litres à la jauge essence" },
];

const log = document.getElementById("testchat-log");
const form = document.getElementById("testchat-form");
const input = document.getElementById("testchat-input");
const commandsEl = document.getElementById("testchat-commands");

function appendMessage(text, kind) {
  const row = document.createElement("div");
  row.className = `testchat-msg testchat-msg--${kind}`;
  row.textContent = text;
  log.appendChild(row);
  log.scrollTop = log.scrollHeight;
}

// command/args separes ici (pas une seule chaine brute) car c'est exactement
// le format que commandWebhook attend en JSON - simule le payload que Botsty78
// envoie reellement, pas juste ce que l'utilisateur tape dans le chat Kick.
function parseInput(raw) {
  const trimmed = raw.trim().replace(/^!/, "");
  const spaceIdx = trimmed.indexOf(" ");
  if (spaceIdx === -1) return { command: trimmed, args: undefined };
  return { command: trimmed.slice(0, spaceIdx), args: trimmed.slice(spaceIdx + 1).trim() };
}

async function sendCommand(raw) {
  appendMessage(`Toi : ${raw}`, "user");
  const { command, args } = parseInput(raw);
  if (!command) return;

  try {
    const token = await auth.currentUser.getIdToken();
    const res = await fetch(`${FUNCTIONS_BASE_URL}/commandWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
      body: JSON.stringify({ command, args }),
    });
    const data = await res.json();
    appendMessage(data.ok ? `Botsty78 : ✅ ${JSON.stringify(data)}` : `Botsty78 : ❌ ${data.error}`, data.ok ? "ok" : "error");
  } catch (err) {
    appendMessage(`Botsty78 : ❌ ${err.message}`, "error");
  }
}

async function loadCommandRecap() {
  const lines = STATIC_COMMANDS.map((c) => `${c.cmd} — ${c.desc}`);

  try {
    const snap = await getDocs(collection(db, "weapons"));
    const weaponCmds = [];
    snap.forEach((docSnap) => weaponCmds.push(`!${docSnap.id}`));
    if (weaponCmds.length) {
      lines.push(`Armes (change l'image) : ${weaponCmds.join(", ")}`);
    }
  } catch (err) {
    console.warn("[testchat] liste armes indisponible:", err.message);
  }

  commandsEl.innerHTML = `<strong>Commandes valides :</strong><br>${lines.join("<br>")}`;
}

export function initTestChat() {
  loadCommandRecap();
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const raw = input.value.trim();
    if (!raw) return;
    input.value = "";
    sendCommand(raw);
  });
}
