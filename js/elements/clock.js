export function create() {
  const el = document.createElement("div");
  el.className = "hud-clock";
  tick(el);
  setInterval(() => tick(el), 1000);
  return el;
}

function tick(el) {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  el.textContent = `${hh}:${mm}`;
}
