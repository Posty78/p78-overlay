const DIGITS = 8;

export function create() {
  const el = document.createElement("div");
  el.className = "hud-money";
  el.textContent = "$" + "0".repeat(DIGITS);
  return el;
}

export function update(el, state) {
  const amount = typeof state?.money === "number" ? state.money : 0;
  const negative = amount < 0;
  const padded = String(Math.abs(amount)).padStart(DIGITS, "0");
  el.textContent = negative ? `-$${padded}` : `$${padded}`;
  el.classList.toggle("is-negative", negative);
}
