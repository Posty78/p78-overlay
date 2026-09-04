import { doc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { db } from "./firebase-init.js?v=1";
import * as clock from "./elements/clock.js?v=1";
import * as battery from "./elements/battery.js?v=1";
import * as money from "./elements/money.js?v=1";
import * as stars from "./elements/stars.js?v=1";
import * as weapon from "./elements/weapon.js?v=1";
import * as minimap from "./elements/minimap.js?v=1";
import * as iframe from "./elements/iframe.js?v=2";
import * as watermark from "./elements/watermark.js?v=2";
import * as weather from "./elements/weather.js?v=1";
import * as jauge from "./elements/jauge.js?v=4";
import * as roue from "./elements/roue.js?v=1";
import * as compteur from "./elements/compteur.js?v=1";
import * as defis from "./elements/defis.js?v=1";
import * as dons from "./elements/dons.js?v=1";
import * as subgoal from "./elements/subgoal.js?v=1";
import * as giveaway from "./elements/giveaway.js?v=1";
import * as sondage from "./elements/sondage.js?v=1";
import { mountCensure } from "./elements/censure.js?v=1";

const ELEMENTS = {
  clock, battery, money, stars, weapon, minimap, iframe, watermark, weather, jauge,
  roue, compteur, defis, dons, subgoal, giveaway, sondage,
};

// Hors systeme de scenes expres : doit pouvoir masquer n'importe quelle scene active.
mountCensure();

const stage = document.getElementById("stage");
let mountedNodes = {}; // elementId -> { node, type }
let latestGtaState = {};
let currentSceneId = null;
let unsubScene = null;

// Types masqués par !mapsoff (mini map + météo), independamment de leur
// visibilite propre configuree dans la scene.
const MAPS_WIDGET_TYPES = new Set(["minimap", "weather"]);
let mapsHidden = false;

onSnapshot(doc(db, "settings", "active"), (snap) => {
  const activeSceneId = snap.data()?.activeSceneId;
  if (!activeSceneId || activeSceneId === currentSceneId) return;
  currentSceneId = activeSceneId;
  watchScene(activeSceneId);
});

onSnapshot(doc(db, "state", "gta"), (snap) => {
  latestGtaState = snap.data() || {};
  applyGtaStateToMounted();
});

// !mapson/!mapsoff (mini map + météo) et !overlayon/!overlayoff (tout le
// stage) - volontairement independants l'un de l'autre : !overlayon ne leve
// que son propre masquage, jamais celui pose par !mapsoff (cf. discussion).
onSnapshot(doc(db, "state", "widgets"), (snap) => {
  const data = snap.data() || {};
  stage.style.display = data.allHidden ? "none" : "";
  mapsHidden = !!data.mapsHidden;
  applyMapsHiddenToMounted();
});

function watchScene(sceneId) {
  if (unsubScene) unsubScene();
  unsubScene = onSnapshot(doc(db, "scenes", sceneId), (snap) => {
    const sceneData = snap.data();
    if (!sceneData) return;
    renderScene(sceneData.elements || []);
  });
}

function renderScene(elements) {
  const seenIds = new Set();

  for (const elConfig of elements) {
    seenIds.add(elConfig.id);
    const module = ELEMENTS[elConfig.type];
    if (!module) continue;

    let mounted = mountedNodes[elConfig.id];
    if (!mounted) {
      const node = module.create(elConfig);
      node.classList.add("hud-el");
      stage.appendChild(node);
      mounted = { node, type: elConfig.type };
      mountedNodes[elConfig.id] = mounted;
    }

    if (module.applyConfig) module.applyConfig(mounted.node, elConfig);
    positionNode(mounted.node, elConfig);
  }

  // Retire les éléments qui ne sont plus dans la scène
  for (const id of Object.keys(mountedNodes)) {
    if (!seenIds.has(id)) {
      mountedNodes[id].node.remove();
      delete mountedNodes[id];
    }
  }

  applyGtaStateToMounted();
  applyMapsHiddenToMounted();
}

function positionNode(node, elConfig) {
  node.style.left = `${elConfig.x}px`;
  node.style.top = `${elConfig.y}px`;
  node.style.transform = `scale(${elConfig.scale ?? 1})`;
  node.dataset.visible = elConfig.visible !== false ? "true" : "false";
}

function applyGtaStateToMounted() {
  for (const { node, type } of Object.values(mountedNodes)) {
    const module = ELEMENTS[type];
    if (module.update) module.update(node, latestGtaState);
  }
}

function applyMapsHiddenToMounted() {
  for (const { node, type } of Object.values(mountedNodes)) {
    if (MAPS_WIDGET_TYPES.has(type)) {
      node.dataset.forceHidden = mapsHidden ? "true" : "false";
    }
  }
}
