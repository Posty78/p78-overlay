export function create() {
  const el = document.createElement("div");
  el.className = "hud-healthbar";
  el.innerHTML = `
    <div class="hud-healthbar__bar hud-healthbar__bar--white"></div>
    <div class="hud-healthbar__bar hud-healthbar__bar--red"></div>
  `;
  return el;
}
