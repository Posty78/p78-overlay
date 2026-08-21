export function create(elConfig) {
  const el = document.createElement("div");
  el.className = "hud-iframe";
  applyConfig(el, elConfig);
  return el;
}

export function applyConfig(el, elConfig) {
  const w = elConfig?.w ?? 400;
  const h = elConfig?.h ?? 300;
  el.style.width = `${w}px`;
  el.style.height = `${h}px`;

  const url = elConfig?.url || "";
  if (el.dataset.currentUrl === url) return;
  el.dataset.currentUrl = url;

  el.innerHTML = "";
  if (!url) return;

  const iframe = document.createElement("iframe");
  iframe.src = url;
  iframe.style.width = "100%";
  iframe.style.height = "100%";
  iframe.style.border = "none";
  iframe.setAttribute("allowtransparency", "true");
  el.appendChild(iframe);
}
