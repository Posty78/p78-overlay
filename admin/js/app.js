import { initAuth } from "./auth.js?v=1";
import { initEditor } from "./editor.js?v=1";
import { initWeapons } from "./weapons.js?v=1";
import { initReset } from "./reset.js?v=1";
import { initState } from "./state.js?v=1";
import { initCensure } from "./censure.js?v=1";
import { initWidgets } from "./widgets.js?v=1";

let started = false;

initAuth(() => {
  if (started) return;
  started = true;
  initEditor();
  initWeapons();
  initReset();
  initState();
  initCensure();
  initWidgets();
});
