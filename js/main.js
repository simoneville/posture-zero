import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildFigure, applyJointAngle } from './rig.js';
import { buildControlPanel, resetAll, resetRanges, applyState, generateSummaryText } from './ui.js';

const viewport = document.getElementById('viewport');
const panel = document.getElementById('control-panel');
const heightInput = document.getElementById('height-input');
const resetBtn = document.getElementById('reset-btn');
const resetRangesBtn = document.getElementById('reset-ranges-btn');
const saveBtn = document.getElementById('save-btn');
const exportBtn = document.getElementById('export-btn');
const importInput = document.getElementById('import-input');
const savedSelect = document.getElementById('saved-select');
const loadBtn = document.getElementById('load-btn');
const deleteBtn = document.getElementById('delete-btn');
const summaryBox = document.getElementById('summary-box');

const state = {}; // fullId -> current pose angle (deg)
const ranges = {}; // fullId -> {min, max} this individual's measured extrema
let rig = null;
let rows = null;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xdfe6ec);
scene.fog = new THREE.Fog(0xdfe6ec, 6, 16);

const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
viewport.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.maxPolarAngle = Math.PI * 0.5;
controls.minDistance = 0.8;
controls.maxDistance = 8;

const hemi = new THREE.HemisphereLight(0xffffff, 0x555560, 0.9);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 1.4);
sun.position.set(2.5, 4, 2);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -2;
sun.shadow.camera.right = 2;
sun.shadow.camera.top = 2;
sun.shadow.camera.bottom = -2;
scene.add(sun);

const groundGeo = new THREE.CircleGeometry(6, 48);
const groundMat = new THREE.MeshStandardMaterial({ color: 0xc9d2d8, roughness: 1 });
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);
const grid = new THREE.GridHelper(6, 24, 0x9aa7ae, 0xb8c2c8);
scene.add(grid);

function frameCamera(heightMeters) {
  camera.position.set(0, heightMeters * 0.62, heightMeters * 2.1);
  controls.target.set(0, heightMeters * 0.55, 0);
  controls.update();
}

function rebuildFigure(heightMeters) {
  if (rig) scene.remove(rig.root);
  rig = buildFigure(heightMeters);
  scene.add(rig.root);
  for (const [fullId, entry] of Object.entries(rig.joints)) {
    applyJointAngle(entry, state[fullId] ?? 0);
  }
}

function onJointChange(fullId, degrees) {
  const entry = rig.joints[fullId];
  if (entry) applyJointAngle(entry, degrees);
  summaryBox.value = generateSummaryText(state, Number(heightInput.value));
}

function currentHeightMeters() {
  return Math.max(50, Math.min(230, Number(heightInput.value) || 170)) / 100;
}

rebuildFigure(currentHeightMeters());
frameCamera(currentHeightMeters());
rows = buildControlPanel(panel, state, ranges, rig, onJointChange);
summaryBox.value = generateSummaryText(state, Number(heightInput.value));

heightInput.addEventListener('change', () => {
  const h = currentHeightMeters();
  rebuildFigure(h);
  frameCamera(h);
});

resetBtn.addEventListener('click', () => resetAll(state, rows, onJointChange));
resetRangesBtn.addEventListener('click', () => {
  if (!confirm('Reset every joint’s min/max back to the standard neutral-zero ranges? This discards this person’s custom measurements.')) return;
  resetRanges(ranges, rows, state, onJointChange);
});

function resizeRenderer() {
  const w = viewport.clientWidth;
  const h = viewport.clientHeight;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resizeRenderer).observe(viewport);
resizeRenderer();

(function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
})();

// ---- Persistence: save / load / export / import ----
const STORAGE_KEY = 'postureZero.savedPositions';

function loadSavedPositions() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

function refreshSavedSelect() {
  const saved = loadSavedPositions();
  savedSelect.innerHTML = '';
  const names = Object.keys(saved);
  if (names.length === 0) {
    const opt = el_option('', 'No saved positions');
    savedSelect.append(opt);
    savedSelect.disabled = true;
    loadBtn.disabled = true;
    deleteBtn.disabled = true;
    return;
  }
  savedSelect.disabled = false;
  loadBtn.disabled = false;
  deleteBtn.disabled = false;
  for (const name of names) savedSelect.append(el_option(name, name));
}

function el_option(value, text) {
  const o = document.createElement('option');
  o.value = value;
  o.textContent = text;
  return o;
}

saveBtn.addEventListener('click', () => {
  const name = prompt('Name this position (e.g. "Best corrected – 2026-09-16"):');
  if (!name) return;
  const saved = loadSavedPositions();
  saved[name] = { heightCm: Number(heightInput.value), angles: { ...state }, ranges: JSON.parse(JSON.stringify(ranges)) };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
  refreshSavedSelect();
  savedSelect.value = name;
});

loadBtn.addEventListener('click', () => {
  const saved = loadSavedPositions();
  const entry = saved[savedSelect.value];
  if (!entry) return;
  heightInput.value = entry.heightCm;
  rebuildFigure(currentHeightMeters());
  frameCamera(currentHeightMeters());
  if (entry.ranges) Object.assign(ranges, entry.ranges);
  Object.assign(state, entry.angles);
  applyState(state, rows, onJointChange, ranges);
});

deleteBtn.addEventListener('click', () => {
  const saved = loadSavedPositions();
  delete saved[savedSelect.value];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
  refreshSavedSelect();
});

exportBtn.addEventListener('click', () => {
  const payload = {
    heightCm: Number(heightInput.value),
    angles: { ...state },
    ranges: JSON.parse(JSON.stringify(ranges)),
    summary: generateSummaryText(state, Number(heightInput.value)),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `posture-position-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

importInput.addEventListener('change', async () => {
  const file = importInput.files[0];
  if (!file) return;
  try {
    const payload = JSON.parse(await file.text());
    if (payload.heightCm) heightInput.value = payload.heightCm;
    rebuildFigure(currentHeightMeters());
    frameCamera(currentHeightMeters());
    if (payload.ranges) Object.assign(ranges, payload.ranges);
    if (payload.angles) {
      Object.assign(state, payload.angles);
      applyState(state, rows, onJointChange, ranges);
    }
  } catch (e) {
    alert('Could not read that file: ' + e.message);
  } finally {
    importInput.value = '';
  }
});

refreshSavedSelect();
