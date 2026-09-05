import {
  collection, doc, getDocs, getDoc, setDoc, updateDoc, onSnapshot,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";
import { db, storage } from "../../js/firebase-init.js?v=1";
import * as clock from "../../js/elements/clock.js?v=1";
import * as battery from "../../js/elements/battery.js?v=1";
import * as money from "../../js/elements/money.js?v=1";
import * as stars from "../../js/elements/stars.js?v=1";
import * as weapon from "../../js/elements/weapon.js?v=1";
import * as minimap from "../../js/elements/minimap.js?v=1";
import * as iframe from "../../js/elements/iframe.js?v=2";
import * as watermark from "../../js/elements/watermark.js?v=2";
import * as weather from "../../js/elements/weather.js?v=1";
import * as jauge from "../../js/elements/jauge.js?v=6";
import * as roue from "../../js/elements/roue.js?v=1";
import * as compteur from "../../js/elements/compteur.js?v=1";
import * as defis from "../../js/elements/defis.js?v=1";
import * as dons from "../../js/elements/dons.js?v=1";
import * as subgoal from "../../js/elements/subgoal.js?v=1";
import * as giveaway from "../../js/elements/giveaway.js?v=1";
import * as sondage from "../../js/elements/sondage.js?v=1";

const ELEMENT_MODULES = {
  clock, battery, money, stars, weapon, minimap, iframe, watermark, weather, jauge,
  roue, compteur, defis, dons, subgoal, giveaway, sondage,
};
const TYPE_LABELS = {
  clock: "Horloge (+ barres)",
  battery: "Batterie / Temp",
  money: "Argent",
  stars: "Étoiles",
  weapon: "Arme",
  minimap: "Mini map",
  iframe: "Widget externe (URL)",
  watermark: "Filigrane (PNG)",
  weather: "Météo (ville + temp)",
  jauge: "Jauge (vitesse + essence)",
  roue: "Roue",
  compteur: "Compteur",
  defis: "Vote Défis",
  dons: "Barre de don Restos du Cœur",
  subgoal: "Barre de subgoal",
  giveaway: "Vote Giveaway",
  sondage: "Sondage",
};
const MULTI_INSTANCE_TYPES = new Set(["iframe", "battery"]);
// Types avec une vraie largeur/hauteur configurable (donc "recadrables", au sens
// OBS du terme) plutot qu'un simple zoom uniforme via l'echelle.
const CROPPABLE_TYPES = new Set([
  "iframe", "watermark", "roue", "compteur", "defis", "dons", "subgoal", "giveaway", "sondage",
]);
// Widgets externes "natifs" (URL fixee en dur) - ont un bouton Demo comme le
// type iframe generique, mais bascule un simple booleen elConfig.demo au lieu
// de modifier une URL stockee (il n'y en a pas ici, elle est dans le code).
const PROXY_NATIVE_TYPES = new Set(["roue", "compteur", "defis", "dons", "subgoal", "giveaway", "sondage"]);

const DEFAULT_ELEMENTS = [
  { id: "clock", type: "clock", x: 1750, y: 30, scale: 1, visible: true },
  { id: "battery", type: "battery", x: 1440, y: 40, scale: 1, visible: true, device: "tracking" },
  { id: "stars", type: "stars", x: 1630, y: 110, scale: 1, visible: true },
  { id: "money", type: "money", x: 1630, y: 165, scale: 1, visible: true },
  { id: "weapon", type: "weapon", x: 1720, y: 860, scale: 1, visible: true },
  { id: "minimap", type: "minimap", x: 40, y: 720, scale: 1, visible: true },
  { id: "weather", type: "weather", x: 90, y: 860, scale: 1, visible: true },
  { id: "watermark", type: "watermark", x: 830, y: 20, scale: 1, visible: true },
  { id: "jauge", type: "jauge", x: 1440, y: 780, scale: 1, visible: true },
];

const stage = document.getElementById("canvas-stage");
const stageWrapper = document.getElementById("canvas-stage-wrapper");
const canvasWrap = document.getElementById("canvas-wrap");
const sceneSelect = document.getElementById("scene-select");
const elementList = document.getElementById("element-list");
const addTypeSelect = document.getElementById("add-element-type");
const activeBadge = document.getElementById("active-scene-badge");

let currentSceneId = null;
let currentElements = [];
let activeSceneId = null;
let stageScale = 1;
let mountedNodes = {}; // id -> { wrapper, node, type }
let latestGtaState = {};
let selectedElementId = null;
let dragReorderEnabled = false;

export async function initEditor() {
  await loadSceneList();

  populateAddTypeSelect();
  window.addEventListener("resize", updateStageScale);
  updateStageScale();

  document.getElementById("btn-new-scene").addEventListener("click", onCreateScene);
  document.getElementById("btn-activate-scene").addEventListener("click", onActivateScene);
  document.getElementById("btn-add-element").addEventListener("click", onAddElement);
  sceneSelect.addEventListener("change", () => selectScene(sceneSelect.value));

  const btnToggleReorder = document.getElementById("btn-toggle-reorder");
  btnToggleReorder.addEventListener("click", () => {
    dragReorderEnabled = !dragReorderEnabled;
    btnToggleReorder.textContent = dragReorderEnabled
      ? "Désactiver le glisser-déposer"
      : "Activer le glisser-déposer (ordre d'affichage)";
    btnToggleReorder.classList.toggle("is-active", dragReorderEnabled);
    renderElementList();
  });

  onSnapshot(doc(db, "settings", "active"), (snap) => {
    activeSceneId = snap.data()?.activeSceneId || null;
    updateActiveBadge();
  });

  onSnapshot(doc(db, "state", "gta"), (snap) => {
    latestGtaState = snap.data() || {};
    applyGtaStateToMounted();
  });

  const firstId = sceneSelect.value;
  if (firstId) selectScene(firstId);
}


async function loadSceneList() {
  const snap = await getDocs(collection(db, "scenes"));
  sceneSelect.innerHTML = "";
  snap.forEach((docSnap) => {
    const opt = document.createElement("option");
    opt.value = docSnap.id;
    opt.textContent = docSnap.data().name || docSnap.id;
    sceneSelect.appendChild(opt);
  });
}

function populateAddTypeSelect() {
  addTypeSelect.innerHTML = "";
  for (const [type, label] of Object.entries(TYPE_LABELS)) {
    const opt = document.createElement("option");
    opt.value = type;
    opt.textContent = label;
    addTypeSelect.appendChild(opt);
  }
}

function selectScene(sceneId) {
  currentSceneId = sceneId;
  sceneSelect.value = sceneId;
  getDoc(doc(db, "scenes", sceneId)).then((snap) => {
    currentElements = snap.data()?.elements || [];
    renderCanvas();
    renderElementList();
    updateActiveBadge();
  });
}

function updateActiveBadge() {
  activeBadge.textContent = activeSceneId && activeSceneId === currentSceneId ? "● EN DIRECT" : "";
}

async function onCreateScene() {
  const name = prompt("Nom de la nouvelle scène :");
  if (!name) return;
  const diacritics = new RegExp("[̀-ͯ]", "g");
  const id = name.toLowerCase().normalize("NFD").replace(diacritics, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || `scene-${Date.now()}`;

  await setDoc(doc(db, "scenes", id), { name, elements: [] });
  await loadSceneList();
  selectScene(id);
}

async function onActivateScene() {
  if (!currentSceneId) return;
  await setDoc(doc(db, "settings", "active"), { activeSceneId: currentSceneId }, { merge: true });
}

function onAddElement() {
  const type = addTypeSelect.value;
  const allowMulti = MULTI_INSTANCE_TYPES.has(type);

  if (!allowMulti && currentElements.some((el) => el.type === type)) {
    alert("Cet élément est déjà présent dans la scène.");
    return;
  }

  const defaults = DEFAULT_ELEMENTS.find((el) => el.type === type) || { x: 100, y: 100, scale: 1 };
  const id = allowMulti ? `${type}-${Date.now()}` : type;
  const newEl = { id, type, x: defaults.x, y: defaults.y, scale: 1, visible: true };
  if (type === "iframe") {
    newEl.url = "";
    newEl.w = 400;
    newEl.h = 300;
  }
  if (type === "battery") {
    const usedDevices = currentElements.filter((e) => e.type === "battery").map((e) => e.device);
    newEl.device = usedDevices.includes("tracking") ? "stream" : "tracking";
  }

  currentElements.push(newEl);
  persistElements();
  renderCanvas();
  renderElementList();
}

function removeElement(id) {
  currentElements = currentElements.filter((el) => el.id !== id);
  persistElements();
  renderCanvas();
  renderElementList();
}

function toggleVisible(id) {
  const el = currentElements.find((e) => e.id === id);
  if (!el) return;
  el.visible = el.visible === false ? true : false;
  persistElements();
  renderCanvas();
  renderElementList();
}

function toggleLocked(id) {
  const el = currentElements.find((e) => e.id === id);
  if (!el) return;
  el.locked = !el.locked;
  persistElements();
  renderCanvas();
  renderElementList();
}

// Reordonne currentElements (l'ordre du tableau = l'ordre d'empilement a
// l'affichage, le dernier element etant dessine par-dessus les autres) et
// persiste - active uniquement quand le glisser-deposer est active (bouton
// en haut de la liste), pour eviter les reordonnancements accidentels.
function moveElement(fromId, toId) {
  if (fromId === toId) return;
  const fromIndex = currentElements.findIndex((e) => e.id === fromId);
  const toIndex = currentElements.findIndex((e) => e.id === toId);
  if (fromIndex === -1 || toIndex === -1) return;
  const [moved] = currentElements.splice(fromIndex, 1);
  currentElements.splice(toIndex, 0, moved);
  persistElements();
  renderCanvas();
  renderElementList();
}

function setElementPosition(id, x, y) {
  const el = currentElements.find((e) => e.id === id);
  if (!el) return;
  el.x = Math.round(x);
  el.y = Math.round(y);
}

function setElementScale(id, scale) {
  const el = currentElements.find((e) => e.id === id);
  if (!el) return;
  el.scale = Math.max(0.2, Math.min(4, scale));
}

const WIDGET_PROXY_PREFIX = "https://europe-west1-posty78-overlay.cloudfunctions.net/widgetProxy?url=";

// Bascule ?demo=1 pour prévisualiser un widget sans attendre un vrai événement.
// Sur une URL passée par le proxy anti-X-Frame-Options, demo doit rester un paramètre
// de PREMIER niveau sur l'URL du proxy (pas caché dans l'URL cible encodée) : le proxy
// le réinjecte lui-même côté serveur via history.replaceState pour que location.search
// corresponde à ce que le widget attend une fois embarqué.
function toggleDemoParam(fullUrl) {
  let u;
  try {
    u = new URL(fullUrl);
  } catch {
    return fullUrl;
  }
  if (u.searchParams.has("demo")) u.searchParams.delete("demo");
  else u.searchParams.set("demo", "1");
  return u.toString();
}

function isDemoEnabled(fullUrl) {
  try {
    return new URL(fullUrl || "").searchParams.has("demo");
  } catch {
    return false;
  }
}

async function persistElements() {
  if (!currentSceneId) return;
  await updateDoc(doc(db, "scenes", currentSceneId), { elements: currentElements });
}

function updateStageScale() {
  const availW = canvasWrap.clientWidth - 40;
  const availH = canvasWrap.clientHeight - 40;
  stageScale = Math.max(0.1, Math.min(availW / 1920, availH / 1080));
  stage.style.transform = `scale(${stageScale})`;
  stageWrapper.style.width = `${1920 * stageScale}px`;
  stageWrapper.style.height = `${1080 * stageScale}px`;
}

function renderCanvas() {
  stage.innerHTML = "";
  mountedNodes = {};

  for (const elConfig of currentElements) {
    const module = ELEMENT_MODULES[elConfig.type];
    if (!module) continue;

    const wrapper = document.createElement("div");
    wrapper.className = "editor-el";
    wrapper.dataset.id = elConfig.id;

    const label = document.createElement("div");
    label.className = "editor-el__label";
    label.textContent = elConfig.label || TYPE_LABELS[elConfig.type] || elConfig.type;
    wrapper.appendChild(label);

    const node = module.create(elConfig);
    node.style.pointerEvents = "none";
    wrapper.appendChild(node);

    const handle = document.createElement("div");
    handle.className = "editor-el__resize-handle editor-el__resize-handle--br";
    wrapper.appendChild(handle);

    wrapper.style.left = `${elConfig.x}px`;
    wrapper.style.top = `${elConfig.y}px`;
    wrapper.style.transform = `scale(${elConfig.scale ?? 1})`;
    wrapper.dataset.visible = elConfig.visible !== false ? "true" : "false";
    wrapper.classList.toggle("editor-el--selected", elConfig.id === selectedElementId);
    wrapper.classList.toggle("editor-el--locked", elConfig.locked === true);

    // Verrouille (cadenas) : ni deplacement ni redimensionnement, et les
    // poignees/contour pointille sont masques en CSS (.editor-el--locked).
    if (!elConfig.locked) {
      wrapper.addEventListener("pointerdown", () => selectElement(elConfig.id, { rerenderList: true }));
      wireDrag(wrapper, elConfig.id);
      wireResize(wrapper, handle, elConfig.id, "br");

      // 2eme poignee (coin oppose) uniquement pour les types recadrables : permet
      // de recadrer depuis le coin le plus pratique sans avoir a viser toujours
      // le meme, ni a se souvenir de la combinaison Alt.
      if (CROPPABLE_TYPES.has(elConfig.type)) {
        const handleTL = document.createElement("div");
        handleTL.className = "editor-el__resize-handle editor-el__resize-handle--tl";
        wrapper.appendChild(handleTL);
        wireResize(wrapper, handleTL, elConfig.id, "tl");
      }
    }

    stage.appendChild(wrapper);
    mountedNodes[elConfig.id] = { wrapper, node, type: elConfig.type };
  }

  applyGtaStateToMounted();
}

// Selectionner un element l'amene au premier plan (dernier enfant = dessine par-dessus
// les autres) et l'entoure d'un contour bleu - indispensable des que deux widgets
// externes se superposent : sans ca, impossible de cliquer/deplacer celui du dessous,
// il faut d'abord le faire passer devant depuis la liste ou en cliquant dessus.
function selectElement(id, { rerenderList = false } = {}) {
  selectedElementId = id;
  const mounted = mountedNodes[id];
  if (mounted) {
    stage.appendChild(mounted.wrapper); // le remonte au-dessus de tous les autres
  }
  for (const [elId, { wrapper }] of Object.entries(mountedNodes)) {
    wrapper.classList.toggle("editor-el--selected", elId === id);
  }
  if (rerenderList) renderElementList();
}

function applyGtaStateToMounted() {
  for (const { node, type } of Object.values(mountedNodes)) {
    const module = ELEMENT_MODULES[type];
    if (module.update) module.update(node, latestGtaState);
  }
}

function wireDrag(wrapper, id) {
  let dragging = false;
  let startClientX = 0;
  let startClientY = 0;
  let startX = 0;
  let startY = 0;

  wrapper.addEventListener("pointerdown", (e) => {
    dragging = true;
    wrapper.setPointerCapture(e.pointerId);
    startClientX = e.clientX;
    startClientY = e.clientY;
    const el = currentElements.find((c) => c.id === id);
    startX = el.x;
    startY = el.y;
  });

  wrapper.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const dx = (e.clientX - startClientX) / stageScale;
    const dy = (e.clientY - startClientY) / stageScale;
    const newX = startX + dx;
    const newY = startY + dy;
    wrapper.style.left = `${newX}px`;
    wrapper.style.top = `${newY}px`;
    setElementPosition(id, newX, newY);
  });

  wrapper.addEventListener("pointerup", () => {
    if (!dragging) return;
    dragging = false;
    persistElements();
    renderElementList();
  });
}

const MIN_CROP_SIZE = 40;

function applyCropLive(id, el, newW, newH, newX, newY, wrapper) {
  el.w = newW;
  el.h = newH;
  if (newX !== undefined) {
    el.x = newX;
    el.y = newY;
    wrapper.style.left = `${newX}px`;
    wrapper.style.top = `${newY}px`;
  }
  const mounted = mountedNodes[id];
  const module = ELEMENT_MODULES[el.type];
  if (mounted && module.applyConfig) module.applyConfig(mounted.node, el);
}

// corner "br" (poignee historique, bas-droite) : glisser seul = zoom (ancre en
// haut-gauche), Alt+glisser = recadre depuis ce coin, pour les types
// "recadrables" (widget externe, filigrane) uniquement.
// corner "tl" (2eme poignee, haut-gauche) : dediee au recadrage depuis l'autre
// coin, ancre au coin bas-droit oppose - pas besoin d'Alt, elle ne sert qu'a ca.
function wireResize(wrapper, handle, id, corner = "br") {
  let resizing = false;
  let cropMode = false;
  let startClientX = 0;
  let startClientY = 0;
  let startScale = 1;
  let startW = 0;
  let startH = 0;
  let startX = 0;
  let startY = 0;

  handle.addEventListener("pointerdown", (e) => {
    e.stopPropagation();
    resizing = true;
    cropMode = corner === "tl" || e.altKey;
    handle.setPointerCapture(e.pointerId);
    startClientX = e.clientX;
    startClientY = e.clientY;
    const el = currentElements.find((c) => c.id === id);
    startScale = el.scale ?? 1;
    startW = el.w ?? (el.type === "watermark" ? 260 : 400);
    startH = el.h ?? (el.type === "watermark" ? 100 : 300);
    startX = el.x;
    startY = el.y;
  });

  handle.addEventListener("pointermove", (e) => {
    if (!resizing) return;
    e.stopPropagation();
    const dx = (e.clientX - startClientX) / stageScale;
    const dy = (e.clientY - startClientY) / stageScale;
    const el = currentElements.find((c) => c.id === id);

    if (cropMode && el && CROPPABLE_TYPES.has(el.type)) {
      if (corner === "tl") {
        // Le coin bas-droit (x+w, y+h) doit rester fixe : on deplace x/y ET on
        // reduit w/h du meme montant, en clampant pour ne pas passer sous la
        // taille minimale tout en gardant ce coin oppose parfaitement ancre.
        let newW = startW - dx;
        let effectiveDx = dx;
        if (newW < MIN_CROP_SIZE) { newW = MIN_CROP_SIZE; effectiveDx = startW - MIN_CROP_SIZE; }
        let newH = startH - dy;
        let effectiveDy = dy;
        if (newH < MIN_CROP_SIZE) { newH = MIN_CROP_SIZE; effectiveDy = startH - MIN_CROP_SIZE; }
        applyCropLive(id, el, Math.round(newW), Math.round(newH), Math.round(startX + effectiveDx), Math.round(startY + effectiveDy), wrapper);
      } else {
        const newW = Math.max(MIN_CROP_SIZE, Math.round(startW + dx));
        const newH = Math.max(MIN_CROP_SIZE, Math.round(startH + dy));
        applyCropLive(id, el, newW, newH, undefined, undefined, wrapper);
      }
      return;
    }

    const delta = (dx + dy) / 2 / 150;
    const newScale = Math.max(0.2, Math.min(4, startScale + delta));
    wrapper.style.transform = `scale(${newScale})`;
    setElementScale(id, newScale);
  });

  handle.addEventListener("pointerup", (e) => {
    if (!resizing) return;
    e.stopPropagation();
    resizing = false;
    persistElements();
    renderElementList();
  });
}

const openDetailIds = new Set();

function renderElementList() {
  elementList.innerHTML = "";
  for (const el of currentElements) {
    const displayName = el.label || TYPE_LABELS[el.type] || el.type;

    const row = document.createElement("div");
    row.className = "element-row" + (el.id === selectedElementId ? " element-row--selected" : "");

    if (dragReorderEnabled) {
      row.draggable = true;
      row.addEventListener("dragstart", (e) => {
        e.dataTransfer.setData("text/plain", el.id);
        e.dataTransfer.effectAllowed = "move";
      });
      row.addEventListener("dragover", (e) => {
        e.preventDefault();
        row.classList.add("element-row--drag-over");
      });
      row.addEventListener("dragleave", () => row.classList.remove("element-row--drag-over"));
      row.addEventListener("drop", (e) => {
        e.preventDefault();
        row.classList.remove("element-row--drag-over");
        const fromId = e.dataTransfer.getData("text/plain");
        moveElement(fromId, el.id);
      });
    }

    // --- Ligne principale : nom + visibilité + détails + suppr ---
    const header = document.createElement("div");
    header.className = "element-row__header";

    const name = document.createElement("div");
    name.className = "element-row__name";
    name.textContent = displayName;
    name.title = "Cliquer pour sélectionner et faire passer au premier plan sur le canvas";
    name.addEventListener("click", () => selectElement(el.id, { rerenderList: true }));
    header.appendChild(name);

    const btnVisible = document.createElement("button");
    btnVisible.className = "icon-btn " + (el.visible === false ? "icon-btn--off" : "icon-btn--on");
    btnVisible.title = el.visible === false ? "Afficher" : "Masquer";
    btnVisible.textContent = el.visible === false ? "◌" : "●";
    btnVisible.addEventListener("click", () => toggleVisible(el.id));
    header.appendChild(btnVisible);

    const btnLock = document.createElement("button");
    btnLock.className = "icon-btn " + (el.locked ? "icon-btn--locked" : "");
    btnLock.title = el.locked
      ? "Déverrouiller (réafficher les poignées de position/taille)"
      : "Verrouiller la position (masque les poignées sur le canvas)";
    btnLock.textContent = el.locked ? "🔒" : "🔓";
    btnLock.addEventListener("click", () => toggleLocked(el.id));
    header.appendChild(btnLock);

    const hasDetails = true; // taille + réglages spécifiques, toujours au moins la taille
    let btnToggle;
    if (hasDetails) {
      btnToggle = document.createElement("button");
      btnToggle.className = "icon-btn";
      btnToggle.title = "Détails";
      btnToggle.textContent = openDetailIds.has(el.id) ? "▾" : "▸";
      header.appendChild(btnToggle);
    }

    const btnDelete = document.createElement("button");
    btnDelete.className = "icon-btn icon-btn--danger";
    btnDelete.title = "Supprimer";
    btnDelete.textContent = "✕";
    btnDelete.addEventListener("click", () => {
      if (confirm(`Retirer "${displayName}" de la scène ?`)) removeElement(el.id);
    });
    header.appendChild(btnDelete);

    row.appendChild(header);

    // --- Détails repliables ---
    const details = document.createElement("div");
    details.className = "element-row__details";
    details.style.display = openDetailIds.has(el.id) ? "flex" : "none";

    if (MULTI_INSTANCE_TYPES.has(el.type)) {
      const labelInput = document.createElement("input");
      labelInput.type = "text";
      labelInput.placeholder = "nom affiché (ex: Vote Giveaway)";
      labelInput.value = el.label || "";
      labelInput.addEventListener("change", () => {
        el.label = labelInput.value.trim();
        persistElements();
        renderCanvas();
        renderElementList();
      });
      details.appendChild(labelInput);
    }

    // Position/taille/dimensions : plus de champs numeriques ici, tout se fait a la
    // souris sur le canvas (drag pour la position, poignees pour le redimensionnement) -
    // les valeurs restent lues/ecrites via setElementPosition/setElementScale/el.w/el.h,
    // seule l'UI de saisie manuelle a ete retiree.

    if (CROPPABLE_TYPES.has(el.type)) {
      const cropHint = document.createElement("div");
      cropHint.className = "hint";
      cropHint.textContent = "Astuce : glisse le rond bleu en bas à droite pour recadrer depuis ce coin, ou celui en haut à gauche pour recadrer depuis l'autre coin (comme OBS, sans zoomer le contenu).";
      details.appendChild(cropHint);
    }

    if (el.type === "iframe") {
      const urlInput = document.createElement("input");
      urlInput.type = "text";
      urlInput.placeholder = "https://...";
      urlInput.value = el.url || "";
      urlInput.addEventListener("change", () => {
        el.url = urlInput.value.trim();
        persistElements();
        renderCanvas();
      });
      details.appendChild(urlInput);

      if (el.demo !== false) {
        const btnDemo = document.createElement("button");
        btnDemo.textContent = isDemoEnabled(el.url) ? "Démo : ON" : "Démo : OFF";
        btnDemo.addEventListener("click", () => {
          el.url = toggleDemoParam(el.url || "");
          persistElements();
          renderCanvas();
          renderElementList();
        });
        details.appendChild(btnDemo);
      }
    }

    if (PROXY_NATIVE_TYPES.has(el.type)) {
      const btnDemo = document.createElement("button");
      btnDemo.textContent = el.demo ? "Démo : ON" : "Démo : OFF";
      btnDemo.addEventListener("click", () => {
        el.demo = !el.demo;
        persistElements();
        renderCanvas();
        renderElementList();
      });
      details.appendChild(btnDemo);
    }

    if (el.type === "battery") {
      const deviceSelect = document.createElement("select");
      for (const [value, labelText] of [["tracking", "Téléphone tracking"], ["stream", "Téléphone stream"]]) {
        const opt = document.createElement("option");
        opt.value = value;
        opt.textContent = labelText;
        if ((el.device || "tracking") === value) opt.selected = true;
        deviceSelect.appendChild(opt);
      }
      deviceSelect.addEventListener("change", () => {
        el.device = deviceSelect.value;
        persistElements();
        renderCanvas();
      });
      details.appendChild(deviceSelect);
    }

    if (el.type === "watermark") {
      const uploadRow = document.createElement("div");
      uploadRow.className = "detail-field";
      const fileInput = document.createElement("input");
      fileInput.type = "file";
      fileInput.accept = "image/png";
      uploadRow.appendChild(fileInput);

      const btnUpload = document.createElement("button");
      btnUpload.textContent = "Uploader";
      btnUpload.className = "primary";
      btnUpload.addEventListener("click", async () => {
        const file = fileInput.files[0];
        if (!file) return;
        const storageRef = ref(storage, "watermark/watermark.png");
        await uploadBytes(storageRef, file);
        const url = await getDownloadURL(storageRef);
        el.url = url;
        persistElements();
        renderCanvas();
        renderElementList();
      });
      uploadRow.appendChild(btnUpload);
      details.appendChild(uploadRow);

      if (el.url) {
        const preview = document.createElement("img");
        preview.src = el.url;
        preview.className = "detail-preview";
        details.appendChild(preview);
      }
    }

    row.appendChild(details);

    if (btnToggle) {
      btnToggle.addEventListener("click", () => {
        const isOpen = openDetailIds.has(el.id);
        if (isOpen) openDetailIds.delete(el.id);
        else openDetailIds.add(el.id);
        details.style.display = isOpen ? "none" : "flex";
        btnToggle.textContent = isOpen ? "▸" : "▾";
      });
    }

    elementList.appendChild(row);
  }
}
