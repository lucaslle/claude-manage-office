import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { CSS2DRenderer } from "three/addons/renderers/CSS2DRenderer.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { buildWorld } from "./world.js";
import { createCharacters, loadCharacterModels } from "./characters.js";
import { createRenderPipeline } from "./postfx.js";
import { createUi } from "./ui.js";
import { fetchLiveState, subscribeLive } from "./live.js";
import { CHARACTERS } from "./data.js";
import { currentBrand, initTheme, isDarkTheme } from "./theme.js";
import { scenePalette } from "./brands.js";
import { createBrandMenu } from "./brand-menu.js";
import { createUsagePanel } from "./usage.js";
import { createConnectorsPanel } from "./connectors.js";
import { createHud } from "./hud.js";
import { createSessionModal } from "./session-modal.js";
import { createEffects } from "./effects.js";
import { createScorePanel, createScoreTracker } from "./score.js";

const SLOW_FRAME_SECONDS = 0.03;
const SLOW_FRAME_WINDOW = 120;
const HOME_DIRECTION = new THREE.Vector3(20.5, 27, 29.5).normalize();
const HOME_TARGET = new THREE.Vector3(0, 0.5, 0);
const FIT_WIDTH_FACTOR = 90;
const MIN_HOME_DISTANCE = 54;
const MAX_HOME_DISTANCE = 128;

const HEMISPHERE_INTENSITY = 0.45;
const SUN_INTENSITY = 1.9;

const stage = document.getElementById("stage");

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
stage.append(renderer.domElement);

const labelRenderer = new CSS2DRenderer();
labelRenderer.domElement.className = "stage__labels";
stage.append(labelRenderer.domElement);

const scene = new THREE.Scene();
let world = null;
let lights = null;
const applyScenePalette = () => {
  const palette = scenePalette(currentBrand(), isDarkTheme());
  scene.background = new THREE.Color(palette.background);
  world?.applyPalette(palette);
  if (lights) {
    lights.hemisphere.intensity = HEMISPHERE_INTENSITY * palette.light;
    lights.sun.intensity = SUN_INTENSITY * palette.light;
  }
};
const theme = initTheme({ toggleButton: document.getElementById("theme-toggle"), onChange: applyScenePalette });
createBrandMenu({ button: document.getElementById("brand-button"), menu: document.getElementById("brand-menu"), onSelect: theme.setBrand });
applyScenePalette();
const environmentGenerator = new THREE.PMREMGenerator(renderer);
scene.environment = environmentGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.4;

const camera = new THREE.PerspectiveCamera(30, 1, 0.5, 400);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.enablePan = false;
controls.minDistance = 12;
controls.maxDistance = 170;
controls.minPolarAngle = 0.45;
controls.maxPolarAngle = 1.25;
controls.minAzimuthAngle = 0.05;
controls.maxAzimuthAngle = Math.PI / 2 - 0.05;

let cameraMovedByUser = false;
controls.addEventListener("start", () => {
  cameraMovedByUser = true;
});

const applyHomeView = () => {
  const distance = Math.min(MAX_HOME_DISTANCE, Math.max(MIN_HOME_DISTANCE, FIT_WIDTH_FACTOR / camera.aspect));
  camera.position.copy(HOME_DIRECTION).multiplyScalar(distance);
  controls.target.copy(HOME_TARGET);
  controls.update();
};

const hemisphere = new THREE.HemisphereLight(0xffffff, 0x9aa4b2, HEMISPHERE_INTENSITY);
scene.add(hemisphere);
const sun = new THREE.DirectionalLight(0xfff4e5, SUN_INTENSITY);
sun.position.set(-16, 36, 24);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -26;
sun.shadow.camera.right = 26;
sun.shadow.camera.top = 26;
sun.shadow.camera.bottom = -26;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 110;
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.03;
scene.add(sun);
lights = { hemisphere, sun };
applyScenePalette();

const pipeline = createRenderPipeline({ renderer, scene, camera, container: stage });

const resize = () => {
  const width = stage.clientWidth;
  const height = stage.clientHeight;
  if (width === 0 || height === 0) return;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  pipeline.resize();
  labelRenderer.setSize(width, height);
  if (!cameraMovedByUser) applyHomeView();
};
new ResizeObserver(resize).observe(stage);
resize();

const [builtWorld, models] = await Promise.all([buildWorld(scene), loadCharacterModels()]);
world = builtWorld;
applyScenePalette();
const COMPACT_DUST = 18;
const crowd = createCharacters({
  scene,
  models,
  exitDoor: world.exitDoor,
  onCompacted: (key) => {
    const position = crowd.positionOf(key);
    if (!position) return;
    effects.burst({ x: position.x, y: position.y * 0.5, z: position.z }, COMPACT_DUST, "dust");
    effects.gain({ x: position.x, y: position.y + 0.9, z: position.z }, "Compacté !", "compact");
  },
});
const usagePanel = createUsagePanel({ body: document.getElementById("usage-body"), meta: document.getElementById("usage-meta") });
const connectorsPanel = createConnectorsPanel({
  body: document.getElementById("connectors-body"),
  selector: document.getElementById("connectors-selector"),
  chooseButton: document.getElementById("connectors-choose"),
});
const hud = createHud(document.getElementById("hud"));
const effects = createEffects(scene);
world.exitDoor.onSlam(() => {
  const door = world.exitDoor;
  effects.shake(0.3);
  effects.gain({ x: door.x, y: 2.7, z: door.z }, "BAM !", "slam");
  effects.burst({ x: door.x, y: 1.2, z: door.z }, 30, "dust");
});
const shakeOffset = new THREE.Vector3();
const scorePanel = createScorePanel({ body: document.getElementById("score-body"), meta: document.getElementById("score-meta") });
const scoreTracker = createScoreTracker({
  panel: scorePanel,
  toasts: document.getElementById("toasts"),
  crowd,
  effects,
  log: (message) => ui.log(message),
});
const ui = createUi({ crowd, demoSpecs: CHARACTERS, onOverflow: world.setRoomOverflow, usagePanel, connectorsPanel, hud, scoreTracker });

const sessionModal = createSessionModal({ isLive: ui.isLive });

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const pickKey = (event) => {
  const bounds = renderer.domElement.getBoundingClientRect();
  pointer.set(((event.clientX - bounds.left) / bounds.width) * 2 - 1, -((event.clientY - bounds.top) / bounds.height) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(crowd.getPickables(), false);
  const visibleHit = hits.find((hit) => {
    let node = hit.object;
    while (node) {
      if (!node.visible) return false;
      node = node.parent;
    }
    return true;
  });
  return visibleHit ? visibleHit.object.userData.key : null;
};

let pressX = 0;
let pressY = 0;
renderer.domElement.addEventListener("pointerdown", (event) => {
  pressX = event.clientX;
  pressY = event.clientY;
});
renderer.domElement.addEventListener("pointerup", (event) => {
  if (Math.abs(event.clientX - pressX) + Math.abs(event.clientY - pressY) > 6) return;
  const key = pickKey(event);
  if (!key) return;
  ui.select(key);
  const state = crowd.describe(key);
  if (state) sessionModal.open({ spec: state.spec, room: state.target ?? state.room });
});
let hoverPending = false;
renderer.domElement.addEventListener("pointermove", (event) => {
  if (hoverPending) return;
  hoverPending = true;
  requestAnimationFrame(() => {
    renderer.domElement.style.cursor = pickKey(event) ? "pointer" : "grab";
    hoverPending = false;
  });
});

document.getElementById("reset-camera").addEventListener("click", () => {
  cameraMovedByUser = false;
  applyHomeView();
});

const qualitySelect = document.getElementById("quality");
qualitySelect.addEventListener("change", () => pipeline.setQuality(qualitySelect.value));

const clock = new THREE.Clock();
let slowFrames = 0;
let sampledFrames = 0;

const adaptQuality = (delta) => {
  sampledFrames += 1;
  if (delta > SLOW_FRAME_SECONDS) slowFrames += 1;
  if (sampledFrames < SLOW_FRAME_WINDOW) return;
  const level = pipeline.getQuality();
  if (slowFrames / sampledFrames > 0.6 && level !== "low") {
    const lower = level === "high" ? "medium" : "low";
    pipeline.setQuality(lower);
    qualitySelect.value = lower;
    ui.log(`Qualité réduite (${lower === "low" ? "légère" : "équilibrée"}) pour garder la fluidité.`);
  }
  slowFrames = 0;
  sampledFrames = 0;
};

const animate = () => {
  const delta = Math.min(clock.getDelta(), 0.05);
  const elapsed = clock.elapsedTime;
  crowd.update(delta, elapsed, ui.refreshPanel);
  effects.update(delta);
  world.update(elapsed, delta);
  controls.update();
  effects.shakeOffset(shakeOffset);
  camera.position.add(shakeOffset);
  if (stage.clientWidth > 0 && stage.clientHeight > 0) {
    pipeline.render();
    labelRenderer.render(scene, camera);
  }
  camera.position.sub(shakeOffset);
  adaptQuality(delta);
  requestAnimationFrame(animate);
};

animate();

const initialState = await fetchLiveState();
if (initialState) {
  ui.enterLiveMode(initialState);
  subscribeLive({ onState: ui.applyLiveState, onLost: ui.markLiveLost });
} else {
  ui.enterDemoMode();
}
