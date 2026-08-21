import { initAuth } from "./auth.js";
import { initEditor } from "./editor.js";
import { initWeapons } from "./weapons.js";
import { initReset } from "./reset.js";

let started = false;

initAuth(() => {
  if (started) return;
  started = true;
  initEditor();
  initWeapons();
  initReset();
});
