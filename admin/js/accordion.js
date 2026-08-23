// Sections repliables de la sidebar (clic sur le titre) - purement visuel, aucune
// dependance a l'authentification/aux donnees, donc initialisable des le chargement
// de la page plutot que dans le callback post-login comme le reste de l'app.
export function initAccordion() {
  document.querySelectorAll("section.panel > h2").forEach((h2) => {
    h2.addEventListener("click", () => {
      h2.closest("section.panel").classList.toggle("is-collapsed");
    });
  });
}
