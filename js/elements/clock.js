export function create() {
  const el = document.createElement("div");
  el.className = "hud-clock-group";
  el.innerHTML = `
    <div class="hud-clock" data-role="time"></div>
    <div class="hud-healthbar__bar hud-healthbar__bar--white"></div>
    <div class="hud-healthbar__bar hud-healthbar__bar--red"></div>
  `;
  const timeEl = el.querySelector('[data-role="time"]');
  tick(timeEl);
  setInterval(() => tick(timeEl), 1000);
  return el;
}

function tick(el) {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  el.textContent = `${hh}:${mm}`;
}
