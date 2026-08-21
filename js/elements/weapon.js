const FIST_SVG = `
<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <g fill="#ffffff" stroke="#000000" stroke-width="4" stroke-linejoin="round">
    <path d="M30 42 v-8 a8 8 0 0 1 16 0 v6 a8 8 0 0 1 16 0 v3 a8 8 0 0 1 16 0 v9
             a8 8 0 0 1 8 8 v14 a20 20 0 0 1 -20 20 h-18 a20 20 0 0 1 -18 -12
             l-10 -18 a7 7 0 0 1 12 -7 l6 9 v-24 a8 8 0 0 1 8 -8 z"/>
  </g>
</svg>`;

export function create() {
  const el = document.createElement("div");
  el.className = "hud-weapon";
  el.innerHTML = FIST_SVG;
  el.dataset.currentUrl = "";
  return el;
}

export function update(el, state) {
  const url = state?.weaponImageUrl || null;

  if (!url) {
    if (el.dataset.currentUrl !== "") {
      el.dataset.currentUrl = "";
      el.innerHTML = FIST_SVG;
    }
    return;
  }

  if (el.dataset.currentUrl === url) return;
  el.dataset.currentUrl = url;
  el.innerHTML = "";
  const img = document.createElement("img");
  img.src = url;
  img.alt = "";
  el.appendChild(img);
}
