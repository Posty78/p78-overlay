import { doc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { db } from "./firebase-init.js";
import * as clock from "./elements/clock.js";
import * as battery from "./elements/battery.js";
import * as money from "./elements/money.js";
import * as stars from "./elements/stars.js";
import * as weapon from "./elements/weapon.js";
import * as minimap from "./elements/minimap.js";
import * as iframe from "./elements/iframe.js";

const ELEMENTS = { clock, battery, money, stars, weapon, minimap, iframe };

const stage = document.getElementById("stage");
let mountedNodes = {}; // elementId -> { node, type }
let latestGtaState = {};
let currentSceneId = null;
let unsubScene = null;

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
