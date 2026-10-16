import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { CSS2DRenderer } from "three/addons/renderers/CSS2DRenderer.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { buildWorld } from "./world.js";
import { loadStyle } from "./styles/index.js";
import { disposeObject } from "./textures.js";
import { buildCharacterModel, characterFor } from "./character-models.js";
import { createCharacters, loadCharacterModels } from "./characters.js";
import { createRenderPipeline } from "./postfx.js";
import { createUi } from "./ui.js";
import { fetchLiveState, subscribeLive } from "./live.js";
import { CHARACTERS } from "./data.js";
import { currentBrand, initTheme, isDarkTheme } from "./theme.js";
import { scenePalette } from "./brands.js";
import { createBrandMenu } from "./brand-menu.js";
import { createLibraryView } from "./library.js";
import { formatAge } from "./format.js";
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
const styleIdOf = () => currentBrand().style ?? "office";
let builtStyleId = null;
let mounting = Promise.resolve();
let lastOverflow = {};
let slamHandler = null;
let crowdRef = null;

// Changer de thème d'entreprise peut changer tout le décor : on reconstruit alors le bâtiment, sans toucher aux personnages.
const mountWorld = async () => {
  const styleId = styleIdOf();
  if (styleId === builtStyleId) return;
  const next = await buildWorld(scene, await loadStyle(styleId));
  if (world) {
    world.world.traverse((node) => {
      if (node.isCSS2DObject) node.element.remove();
    });
    scene.remove(world.world);
    disposeObject(world.world);
  }
  world = next;
  builtStyleId = styleId;
  if (slamHandler) world.exitDoor.onSlam(slamHandler);
  world.setRoomOverflow(lastOverflow);
  crowdRef?.setRobotModel(buildCharacterModel(characterFor(styleId)));
  applyScenePalette();
};

const syncWorldStyle = () => {
  mounting = mounting.then(mountWorld).catch((error) => console.error("Impossible de construire le décor", error));
  return mounting;
};

const handleThemeChange = () => {
  applyScenePalette();
  syncWorldStyle();
};

const theme = initTheme({ toggleButton: document.getElementById("theme-toggle"), onChange: handleThemeChange });
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
sun.target.position.set(0, 0, 0);
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
scene.add(sun.target);
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

const [models] = await Promise.all([loadCharacterModels(characterFor(styleIdOf())), syncWorldStyle()]);
const COMPACT_DUST = 18;
// La porte d'entrée change quand le décor est reconstruit : les personnages passent par ce relais, qui vise toujours la porte actuelle.
const exitDoor = {
  get x() {
    return world.exitDoor.x;
  },
  get z() {
    return world.exitDoor.z;
  },
  open: () => world.exitDoor.open(),
  slam: () => world.exitDoor.slam(),
};
const crowd = createCharacters({
  scene,
  models,
  exitDoor,
  onCompacted: (key) => {
    const position = crowd.positionOf(key);
    if (!position) return;
    effects.burst({ x: position.x, y: position.y * 0.5, z: position.z }, COMPACT_DUST, "dust");
    effects.gain({ x: position.x, y: position.y + 0.9, z: position.z }, "Compacté !", "compact");
  },
});
crowdRef = crowd;
const usagePanel = createUsagePanel({ body: document.getElementById("usage-body"), meta: document.getElementById("usage-meta") });
const connectorsPanel = createConnectorsPanel({
  body: document.getElementById("connectors-body"),
  selector: document.getElementById("connectors-selector"),
  chooseButton: document.getElementById("connectors-choose"),
});
const hud = createHud(document.getElementById("hud"), {
  onPick: (key) => {
    ui.select(key);
    const state = crowd.describe(key);
    if (state) sessionModal.open({ spec: state.spec, room: state.target ?? state.room });
  },
});
const effects = createEffects(scene);
slamHandler = () => {
  const door = world.exitDoor;
  effects.shake(0.3);
  effects.gain({ x: door.x, y: 2.7, z: door.z }, "BAM !", "slam");
  effects.burst({ x: door.x, y: 1.2, z: door.z }, 30, "dust");
};
world.exitDoor.onSlam(slamHandler);
const shakeOffset = new THREE.Vector3();
const scorePanel = createScorePanel({ body: document.getElementById("score-body"), meta: document.getElementById("score-meta") });
const scoreTracker = createScoreTracker({
  panel: scorePanel,
  toasts: document.getElementById("toasts"),
  crowd,
  effects,
  log: (message) => ui.log(message),
});
const ui = createUi({ crowd, demoSpecs: CHARACTERS, onOverflow: (overflow) => {
    lastOverflow = overflow;
    world.setRoomOverflow(overflow);
  }, usagePanel, connectorsPanel, hud, scoreTracker });

const sessionModal = createSessionModal({ isLive: ui.isLive });

const officeView = document.getElementById("office-view");
const libraryRoot = document.getElementById("library");
const officeButton = document.getElementById("view-office");
const libraryButton = document.getElementById("view-library");
const libraryCount = document.getElementById("library-count");
const libraryView = createLibraryView({
  root: libraryRoot,
  onCount: (count) => {
    libraryCount.textContent = String(count);
    libraryCount.hidden = false;
  },
  onOpenEntry: (entry) =>
    sessionModal.open({
      spec: {
        kind: "robot",
        sessionId: entry.id,
        title: entry.title,
        action: `${entry.project}${entry.branch ? ` · ${entry.branch}` : ""} · ${formatAge(Math.max(0, Date.now() - entry.updatedAt))}`,
        why: "",
        mr: entry.branch || "Aucune",
        url: "",
      },
      room: null,
    }),
});

const showView = (view) => {
  const library = view === "library";
  officeView.hidden = library;
  libraryRoot.hidden = !library;
  officeButton.setAttribute("aria-pressed", String(!library));
  libraryButton.setAttribute("aria-pressed", String(library));
  if (library) libraryView.show();
  else libraryView.hide();
  const hash = library ? "#discussions" : "";
  if (location.hash !== hash) history.replaceState(null, "", `${location.pathname}${location.search}${hash}`);
};
officeButton.addEventListener("click", () => showView("office"));
libraryButton.addEventListener("click", () => showView("library"));
window.addEventListener("hashchange", () => showView(location.hash === "#discussions" ? "library" : "office"));
libraryView.preload();
if (location.hash === "#discussions") showView("library");

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
