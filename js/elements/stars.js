const STAR_POINTS = "20,2 25,15 39,15 28,23 32,37 20,29 8,37 12,23 1,15 15,15";
const MAX_STARS = 6;

export function create() {
  const el = document.createElement("div");
  el.className = "hud-stars";
  for (let i = 0; i < MAX_STARS; i++) {
    el.appendChild(makeStar());
  }
  return el;
}

function makeStar() {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 40 40");
  const poly = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
  poly.setAttribute("points", STAR_POINTS);
  poly.setAttribute("class", "hud-star--off");
  svg.appendChild(poly);
  return svg;
}

export function update(el, state) {
  const count = Math.max(0, Math.min(MAX_STARS, state?.stars ?? 0));
  const stars = el.querySelectorAll("polygon");
  stars.forEach((poly, i) => {
    poly.setAttribute("class", i < count ? "hud-star--on" : "hud-star--off");
  });
}
