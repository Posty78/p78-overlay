import { doc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { db } from "../firebase-init.js";

// Masque de censure plein écran, piloté par !censureon / !censureoff dans le
// chat (modérateur uniquement, filtré côté bot Botsty78). Volontairement HORS
// du système de scènes classique (pas de x/y/scale, pas lié à une scène en
// particulier) : il doit pouvoir masquer N'IMPORTE QUELLE scène active, donc
// il vit en dehors de #stage et reste toujours monté, au-dessus de tout.
export function mountCensure() {
  const el = document.createElement("div");
  el.id = "censure-mask";
  el.className = "censure-mask";

  const img = document.createElement("img");
  el.appendChild(img);
  document.body.appendChild(el);

  onSnapshot(
    doc(db, "state", "censure"),
    (snap) => {
      const data = snap.data();
      const visible = !!data?.visible;
      if (data?.imageUrl) img.src = data.imageUrl;
      el.classList.toggle("is-visible", visible && !!data?.imageUrl);
    },
    (err) => console.warn("[censure] lecture impossible :", err.message)
  );
}
