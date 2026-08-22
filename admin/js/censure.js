import { doc, onSnapshot, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";
import { db, storage } from "../../js/firebase-init.js?v=1";

const censureRef = doc(db, "state", "censure");

const preview   = document.getElementById("censure-preview");
const form      = document.getElementById("censure-upload-form");
const fileInput = document.getElementById("censure-file");
const warningEl = document.getElementById("censure-upload-warning");
const statusEl  = document.getElementById("censure-status");
const btnShow   = document.getElementById("btn-censure-show");
const btnHide   = document.getElementById("btn-censure-hide");

export function initCensure() {
  // Ecoute en direct : un modo peut declencher !censureon/!censureoff pendant
  // que ce panel est ouvert, l'etat affiche doit rester exact.
  onSnapshot(censureRef, (snap) => {
    const data = snap.data() || {};

    if (data.imageUrl) {
      preview.src = data.imageUrl;
      preview.style.display = "";
    } else {
      preview.style.display = "none";
    }

    statusEl.textContent = data.visible ? "🔴 Actuellement AFFICHÉ sur OBS" : "⚪ Actuellement masqué";
    statusEl.className = data.visible ? "hint danger" : "hint";
  });

  form.addEventListener("submit", onSubmit);
  btnShow.addEventListener("click", () => setVisible(true));
  btnHide.addEventListener("click", () => setVisible(false));
}

async function onSubmit(e) {
  e.preventDefault();
  warningEl.textContent = "";

  const file = fileInput.files[0];
  if (!file) return;

  // Ici on veut l'INVERSE du contrôle sur les armes : une image pas totalement
  // opaque laisserait deviner la scène en dessous, ce qui rate l'objectif d'un
  // masque de censure.
  const hasAlpha = await checkHasTransparency(file);
  if (hasAlpha) {
    warningEl.textContent =
      "Attention : cette image a des zones transparentes — la scène risque de rester partiellement visible en dessous (upload effectué quand même).";
  }

  const storageRef = ref(storage, `censure/mask.png`);
  await uploadBytes(storageRef, file);
  const imageUrl = await getDownloadURL(storageRef);

  await setDoc(censureRef, { imageUrl, uploadedAt: serverTimestamp() }, { merge: true });
  form.reset();
}

async function setVisible(visible) {
  await setDoc(censureRef, { visible, updatedAt: serverTimestamp() }, { merge: true });
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
