import { collection, doc, getDocs, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";
import { db, storage } from "../../js/firebase-init.js";

const weaponList = document.getElementById("weapon-list");
const form = document.getElementById("weapon-upload-form");
const commandInput = document.getElementById("weapon-command");
const fileInput = document.getElementById("weapon-file");
const warningEl = document.getElementById("weapon-upload-warning");

export async function initWeapons() {
  await refreshWeaponList();
  form.addEventListener("submit", onSubmit);
}

async function refreshWeaponList() {
  weaponList.innerHTML = "";
  const snap = await getDocs(collection(db, "weapons"));
  snap.forEach((docSnap) => {
    const data = docSnap.data();
    const row = document.createElement("div");
    row.className = "weapon-row";

    const img = document.createElement("img");
    img.src = data.imageUrl;
    row.appendChild(img);

    const cmd = document.createElement("div");
    cmd.className = "weapon-row__cmd";
    cmd.textContent = `!${docSnap.id}`;
    row.appendChild(cmd);

    weaponList.appendChild(row);
  });
}

async function onSubmit(e) {
  e.preventDefault();
  warningEl.textContent = "";

  const command = commandInput.value.trim().toLowerCase().replace(/^!/, "");
  const file = fileInput.files[0];
  if (!command || !file) return;

  const dims = await getImageDimensions(file);
  if (dims.width !== dims.height) {
    warningEl.textContent = `Image non carrée (${dims.width}x${dims.height}) — format carré obligatoire, upload annulé.`;
    return;
  }

  const hasAlpha = await checkHasTransparency(file);
  if (!hasAlpha) {
    warningEl.textContent = "Attention : aucune transparence détectée sur cette image (upload effectué quand même).";
  }

  const storageRef = ref(storage, `weapons/${command}.png`);
  await uploadBytes(storageRef, file);
  const imageUrl = await getDownloadURL(storageRef);

  await setDoc(doc(db, "weapons", command), { imageUrl, uploadedAt: serverTimestamp() });

  form.reset();
  await refreshWeaponList();
}

function getImageDimensions(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

function checkHasTransparency(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);
      const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
      for (let i = 3; i < data.length; i += 4) {
        if (data[i] < 255) { resolve(true); return; }
      }
      resolve(false);
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}
