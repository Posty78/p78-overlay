export function create() {
  const el = document.createElement("div");
  el.className = "hud-money";
  el.textContent = "$0";
  return el;
}

export function update(el, state) {
  const amount = typeof state?.money === "number" ? state.money : 0;
  const negative = amount < 0;
  const formatted = Math.abs(amount).toLocaleString("fr-FR");
  el.textContent = negative ? `-$${formatted}` : `$${formatted}`;
  el.classList.toggle("is-negative", negative);
}
