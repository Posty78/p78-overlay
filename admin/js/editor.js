import {
  collection, doc, getDocs, getDoc, setDoc, updateDoc, onSnapshot,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";
import { db, storage } from "../../js/firebase-init.js";
import * as clock from "../../js/elements/clock.js";
import * as battery from "../../js/elements/battery.js";
import * as money from "../../js/elements/money.js";
import * as stars from "../../js/elements/stars.js";
import * as weapon from "../../js/elements/weapon.js";
import * as minimap from "../../js/elements/minimap.js";
import * as iframe from "../../js/elements/iframe.js";
import * as watermark from "../../js/elements/watermark.js";

const ELEMENT_MODULES = { clock, battery, money, stars, weapon, minimap, iframe, watermark };
const TYPE_LABELS = {
  clock: "Horloge (+ barres)",
  battery: "Batterie / Temp",
  money: "Argent",
  stars: "Étoiles",
  weapon: "Arme",
  minimap: "Mini map",
  iframe: "Widget externe (URL)",
  watermark: "Filigrane (PNG)",
};
const MULTI_INSTANCE_TYPES = new Set(["iframe", "battery"]);

const DEFAULT_ELEMENTS = [
  { id: "clock", type: "clock", x: 1750, y: 30, scale: 1, visible: true },
  { id: "battery", type: "battery", x: 1440, y: 40, scale: 1, visible: true, device: "tracking" },
  { id: "stars", type: "stars", x: 1630, y: 110, scale: 1, visible: true },
  { id: "money", type: "money", x: 1630, y: 165, scale: 1, visible: true },
  { id: "weapon", type: "weapon", x: 1720, y: 860, scale: 1, visible: true },
  { id: "minimap", type: "minimap", x: 40, y: 720, scale: 1, visible: true },
  { id: "watermark", type: "watermark", x: 830, y: 20, scale: 1, visible: true },
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

export async function initEditor() {
  await ensureSeedData();
  await loadSceneList();

  populateAddTypeSelect();
  window.addEventListener("resize", updateStageScale);
  updateStageScale();

  document.getElementById("btn-new-scene").addEventListener("click", onCreateScene);
  document.getElementById("btn-activate-scene").addEventListener("click", onActivateScene);
  document.getElementById("btn-add-element").addEventListener("click", onAddElement);
  sceneSelect.addEventListener("change", () => selectScene(sceneSelect.value));

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

async function ensureSeedData() {
  const scenesSnap = await getDocs(collection(db, "scenes"));
  if (!scenesSnap.empty) return;

  await setDoc(doc(db, "scenes", "gta"), { name: "GTA", elements: DEFAULT_ELEMENTS });
  await setDoc(doc(db, "settings", "active"), { activeSceneId: "gta" });
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
    label.textContent = TYPE_LABELS[elConfig.type] || elConfig.type;
    wrapper.appendChild(label);

    const node = module.create(elConfig);
    node.style.pointerEvents = "none";
    wrapper.appendChild(node);

    const handle = document.createElement("div");
    handle.className = "editor-el__resize-handle";
    wrapper.appendChild(handle);

    wrapper.style.left = `${elConfig.x}px`;
    wrapper.style.top = `${elConfig.y}px`;
    wrapper.style.transform = `scale(${elConfig.scale ?? 1})`;
    wrapper.dataset.visible = elConfig.visible !== false ? "true" : "false";

    wireDrag(wrapper, elConfig.id);
    wireResize(wrapper, handle, elConfig.id);
    stage.appendChild(wrapper);
    mountedNodes[elConfig.id] = { wrapper, node, type: elConfig.type };
  }

  applyGtaStateToMounted();
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

function wireResize(wrapper, handle, id) {
  let resizing = false;
  let startClientX = 0;
  let startClientY = 0;
  let startScale = 1;

  handle.addEventListener("pointerdown", (e) => {
    e.stopPropagation();
    resizing = true;
    handle.setPointerCapture(e.pointerId);
    startClientX = e.clientX;
    startClientY = e.clientY;
    const el = currentElements.find((c) => c.id === id);
    startScale = el.scale ?? 1;
  });

  handle.addEventListener("pointermove", (e) => {
    if (!resizing) return;
    e.stopPropagation();
    const dx = (e.clientX - startClientX) / stageScale;
    const dy = (e.clientY - startClientY) / stageScale;
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

function renderElementList() {
  elementList.innerHTML = "";
  for (const el of currentElements) {
    const row = document.createElement("div");
    row.className = "element-row";

    const name = document.createElement("div");
    name.className = "element-row__name";
    name.textContent = TYPE_LABELS[el.type] || el.type;
    row.appendChild(name);

    const coords = document.createElement("div");
    coords.className = "element-row__coords";
    const xInput = document.createElement("input");
    xInput.type = "number";
    xInput.value = el.x;
    xInput.addEventListener("change", () => {
      setElementPosition(el.id, Number(xInput.value), el.y);
      persistElements();
      renderCanvas();
    });
    const yInput = document.createElement("input");
    yInput.type = "number";
    yInput.value = el.y;
    yInput.addEventListener("change", () => {
      setElementPosition(el.id, el.x, Number(yInput.value));
      persistElements();
      renderCanvas();
    });
    coords.appendChild(document.createTextNode("x:"));
    coords.appendChild(xInput);
    coords.appendChild(document.createTextNode("y:"));
    coords.appendChild(yInput);
    row.appendChild(coords);

    const scaleWrap = document.createElement("div");
    scaleWrap.className = "element-row__coords";
    const scaleInput = document.createElement("input");
    scaleInput.type = "number";
    scaleInput.min = "0.2";
    scaleInput.max = "4";
    scaleInput.step = "0.1";
    scaleInput.value = el.scale ?? 1;
    scaleInput.addEventListener("change", () => {
      setElementScale(el.id, Number(scaleInput.value));
      persistElements();
      renderCanvas();
    });
    scaleWrap.appendChild(document.createTextNode("taille:"));
    scaleWrap.appendChild(scaleInput);
    row.appendChild(scaleWrap);

    if (el.type === "iframe") {
      const urlInput = document.createElement("input");
      urlInput.type = "text";
      urlInput.placeholder = "https://...";
      urlInput.value = el.url || "";
      urlInput.style.width = "100%";
      urlInput.addEventListener("change", () => {
        el.url = urlInput.value.trim();
        persistElements();
        renderCanvas();
      });
      row.appendChild(urlInput);

      const sizeWrap = document.createElement("div");
      sizeWrap.className = "element-row__coords";
      const wInput = document.createElement("input");
      wInput.type = "number";
      wInput.value = el.w ?? 400;
      wInput.addEventListener("change", () => {
        el.w = Number(wInput.value);
        persistElements();
        renderCanvas();
      });
      const hInput = document.createElement("input");
      hInput.type = "number";
      hInput.value = el.h ?? 300;
      hInput.addEventListener("change", () => {
        el.h = Number(hInput.value);
        persistElements();
        renderCanvas();
      });
      sizeWrap.appendChild(document.createTextNode("largeur:"));
      sizeWrap.appendChild(wInput);
      sizeWrap.appendChild(document.createTextNode("hauteur:"));
      sizeWrap.appendChild(hInput);
      row.appendChild(sizeWrap);
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
      row.appendChild(deviceSelect);
    }

    if (el.type === "watermark") {
      const fileInput = document.createElement("input");
      fileInput.type = "file";
      fileInput.accept = "image/png";
      row.appendChild(fileInput);

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
      row.appendChild(btnUpload);

      if (el.url) {
        const preview = document.createElement("img");
        preview.src = el.url;
        preview.style.height = "32px";
        preview.style.background = "#000";
        preview.style.borderRadius = "4px";
        row.appendChild(preview);
      }
    }

    const btnVisible = document.createElement("button");
    btnVisible.textContent = el.visible === false ? "Afficher" : "Masquer";
    btnVisible.addEventListener("click", () => toggleVisible(el.id));
    row.appendChild(btnVisible);

    const btnDelete = document.createElement("button");
    btnDelete.textContent = "Suppr.";
    btnDelete.addEventListener("click", () => {
      if (confirm(`Retirer "${name.textContent}" de la scène ?`)) removeElement(el.id);
    });
    row.appendChild(btnDelete);

    elementList.appendChild(row);
  }
}
