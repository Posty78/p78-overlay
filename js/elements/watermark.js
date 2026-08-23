export function create(elConfig) {
  const el = document.createElement("div");
  el.className = "hud-watermark";
  applyConfig(el, elConfig);
  return el;
}

export function applyConfig(el, elConfig) {
  el.style.width = `${elConfig?.w ?? 260}px`;
  el.style.height = `${elConfig?.h ?? 100}px`;

  const url = elConfig?.url || "";
  if (el.dataset.currentUrl === url) return;
  el.dataset.currentUrl = url;

  el.innerHTML = "";
  if (!url) return;

  const img = document.createElement("img");
  img.src = url;
  img.alt = "";
  el.appendChild(img);
}
