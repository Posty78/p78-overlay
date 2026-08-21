export function create() {
  const el = document.createElement("div");
  el.className = "hud-weapon";
  return el;
}

export function update(el, state) {
  const url = state?.weaponImageUrl || null;
  if (!url) {
    el.innerHTML = "";
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
