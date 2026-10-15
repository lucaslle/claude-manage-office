import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/addons/utils/SkeletonUtils.js";
import { CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import { ROOM_SIZE, DOOR_ALONG, DOOR_ACROSS, SLOTS, SEATED_POSES, GATE_LOCAL, roomCenters } from "./layout.js";

const WALK_SPEED = 2.8;
const APPROACH_DISTANCE = 1.4;
const CELEBRATE_SECONDS = 1.5;
const VANISH_SECONDS = 0.6;
const SPAWN_SECONDS = 0.6;
const ROBOT_HEIGHT = 2.4;
const AGENT_HEIGHT_RATIO = 0.85;
const MR_HEIGHT = 2.3;

const ROBOT_CLIPS = {
  wave: "Wave",
  type: "Sitting",
  sleep: "Sitting",
  meet: "Sitting",
  stand: "Idle",
  queue: "Idle",
  ready: "Idle",
  work: "Idle",
  walk: "Walking",
};

const MR_CLIPS = {
  wave: "idle",
  stand: "idle",
  queue: "idle",
  ready: "agree",
  work: "idle",
  walk: "walk",
};

const ROBOT_EMOTES = ["Yes", "No", "ThumbsUp"];
const ROOM_BUBBLES = { acc: "!", fix: "×", arch: "z" };

const loadModel = (url) =>
  new Promise((resolve, reject) => {
    new GLTFLoader().load(url, resolve, undefined, reject);
  });

export const loadCharacterModels = async () => {
  const [robot, mr] = await Promise.all([loadModel("/models/RobotExpressive.glb"), loadModel("/models/Xbot.glb")]);
  return { robot, mr };
};

const wrapAngle = (angle) => {
  let wrapped = angle;
  while (wrapped > Math.PI) wrapped -= 2 * Math.PI;
  while (wrapped < -Math.PI) wrapped += 2 * Math.PI;
  return wrapped;
};

const gridIndex = (value) => Math.min(2, Math.max(0, Math.floor((value + 1.5 * ROOM_SIZE) / ROOM_SIZE)));

const buildRoute = (fromX, fromZ, toX, toZ) => {
  const points = [];
  let column = gridIndex(fromX);
  let row = gridIndex(fromZ);
  const targetColumn = gridIndex(toX);
  const targetRow = gridIndex(toZ);
  while (column !== targetColumn) {
    const step = targetColumn > column ? 1 : -1;
    const borderX = (column - 1) * ROOM_SIZE + (step * ROOM_SIZE) / 2;
    const doorZ = (row - 1) * ROOM_SIZE + DOOR_ALONG;
    points.push({ x: borderX - step * APPROACH_DISTANCE, z: doorZ }, { x: borderX, z: doorZ }, { x: borderX + step * APPROACH_DISTANCE, z: doorZ });
    column += step;
  }
  while (row !== targetRow) {
    const step = targetRow > row ? 1 : -1;
    const borderZ = (row - 1) * ROOM_SIZE + (step * ROOM_SIZE) / 2;
    const doorX = (column - 1) * ROOM_SIZE + DOOR_ACROSS;
    points.push({ x: doorX, z: borderZ - step * APPROACH_DISTANCE }, { x: doorX, z: borderZ }, { x: doorX, z: borderZ + step * APPROACH_DISTANCE });
    row += step;
  }
  points.push({ x: toX, z: toZ });
  return points;
};

const slotPosition = (roomId, slotIndex) => {
  const slot = SLOTS[roomId][slotIndex];
  return { x: roomCenters[roomId].x + slot.x, z: roomCenters[roomId].z + slot.z };
};

export const createCharacters = ({ scene, models }) => {
  const ghostMaterial = new THREE.MeshStandardMaterial({
    color: 0x86b0ff,
    emissive: 0x2450b0,
    emissiveIntensity: 0.7,
    roughness: 0.4,
    transparent: true,
    opacity: 0.58,
    depthWrite: false,
  });

  const characters = {};
  let order = [];
  let pickables = [];
  const occupancy = {};
  Object.keys(SLOTS).forEach((roomId) => {
    occupancy[roomId] = SLOTS[roomId].map(() => null);
  });

  const selectionRing = new THREE.Mesh(
    new THREE.RingGeometry(0.62, 0.8, 48),
    new THREE.MeshBasicMaterial({ color: 0x4d8ef0, side: THREE.DoubleSide, transparent: true, opacity: 0.95, depthTest: false }),
  );
  selectionRing.rotation.x = -Math.PI / 2;
  selectionRing.renderOrder = 5;
  selectionRing.visible = false;
  scene.add(selectionRing);
  let selectedKey = null;

  const buildCharacter = (spec) => {
    const isRobot = spec.kind === "robot";
    const source = isRobot ? models.robot : models.mr;
    const root = new THREE.Group();
    scene.add(root);
    const model = cloneSkinned(source.scene);
    root.add(model);
    root.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(model, true);
    const characterHeight = isRobot ? (spec.agent ? ROBOT_HEIGHT * AGENT_HEIGHT_RATIO : ROBOT_HEIGHT) : MR_HEIGHT;
    const scale = characterHeight / (bounds.max.y - bounds.min.y);
    model.scale.setScalar(scale);
    model.position.y = -bounds.min.y * scale;

    const ownedMaterials = [];
    model.traverse((node) => {
      if (!node.isMesh) return;
      node.userData.key = spec.key;
      pickables.push(node);
      if (isRobot) {
        node.castShadow = true;
        node.receiveShadow = true;
        const materialList = Array.isArray(node.material) ? node.material : [node.material];
        const tinted = materialList.map((material) => {
          const copy = material.clone();
          if (copy.name === "Main") copy.color.setHex(spec.tint);
          copy.metalness = Math.min(copy.metalness, 0.25);
          ownedMaterials.push(copy);
          return copy;
        });
        node.material = Array.isArray(node.material) ? tinted : tinted[0];
      } else {
        node.material = ghostMaterial;
        node.castShadow = false;
      }
    });

    const mixer = new THREE.AnimationMixer(model);
    const actions = {};
    source.animations.forEach((clip) => {
      actions[clip.name] = mixer.clipAction(clip);
    });

    const labelElement = document.createElement("div");
    labelElement.className = !isRobot ? "tag tag--mr" : spec.agent ? "tag tag--agent" : "tag";
    labelElement.textContent = spec.name;
    const labelObject = new CSS2DObject(labelElement);
    root.add(labelObject);

    const bubbleElement = document.createElement("div");
    const bubbleInner = document.createElement("div");
    bubbleInner.className = "bubble";
    bubbleElement.append(bubbleInner);
    const bubbleObject = new CSS2DObject(bubbleElement);
    bubbleObject.visible = false;
    root.add(bubbleObject);

    const character = {
      spec,
      root,
      mixer,
      actions,
      ownedMaterials,
      current: null,
      labelElement,
      labelObject,
      bubbleInner,
      bubbleObject,
      height: characterHeight,
      room: spec.room,
      slot: 0,
      pose: "stand",
      path: [],
      target: null,
      exiting: false,
      removeWhenGone: false,
      celebrate: 0,
      vanish: 0,
      spawn: 0,
      gone: false,
      note: "",
      moved: false,
      emoteLeft: 0,
      emoteTimer: 4 + Math.random() * 6,
    };
    characters[spec.key] = character;
    order.push(spec.key);
    return character;
  };

  const removeCharacter = (key) => {
    const character = characters[key];
    if (!character) return;
    character.root.remove(character.labelObject);
    character.root.remove(character.bubbleObject);
    scene.remove(character.root);
    character.mixer.stopAllAction();
    character.ownedMaterials.forEach((material) => material.dispose());
    pickables = pickables.filter((mesh) => mesh.userData.key !== key);
    order = order.filter((otherKey) => otherKey !== key);
    delete characters[key];
    if (selectedKey === key) selectedKey = null;
  };

  const baseClip = (character) => {
    if (character.spec.kind === "robot") {
      if (character.pose === "work" && character.room === "fix") return "Punch";
      return ROBOT_CLIPS[character.pose] ?? "Idle";
    }
    if (character.room === "fix" && character.pose === "work") return "sad_pose";
    return MR_CLIPS[character.pose] ?? "idle";
  };

  const playClip = (character, clipName, { once = false, timeScale = 1, fade = 0.3 } = {}) => {
    const next = character.actions[clipName];
    if (!next) return;
    if (character.current === next && !once) {
      next.setEffectiveTimeScale(timeScale);
      return;
    }
    next.reset();
    next.enabled = true;
    next.setEffectiveTimeScale(timeScale);
    next.setEffectiveWeight(1);
    next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Infinity);
    next.clampWhenFinished = once;
    next.play();
    if (character.current && character.current !== next) character.current.crossFadeTo(next, fade, false);
    character.current = next;
  };

  const refreshLabelHeight = (character) => {
    const seated = SEATED_POSES.has(character.pose);
    const labelY = (seated ? character.height * 0.72 : character.height) + 0.35;
    character.labelObject.position.set(0, labelY, 0);
    character.bubbleObject.position.set(0, labelY + 0.55, 0);
  };

  const setBubble = (character, symbol) => {
    const visible = Boolean(symbol) && !(symbol === "!" && character.spec.kind === "mr");
    character.bubbleObject.visible = visible;
    character.bubbleInner.textContent = visible ? symbol : "";
    character.bubbleInner.classList.toggle("bubble--sleep", symbol === "z");
  };

  const settle = (character, roomId, slotIndex) => {
    const slot = SLOTS[roomId][slotIndex];
    const position = slotPosition(roomId, slotIndex);
    character.room = roomId;
    character.slot = slotIndex;
    character.pose = slot.pose;
    character.root.position.set(position.x, 0, position.z);
    character.root.rotation.y = slot.ry;
    character.celebrate = 0;
    playClip(character, baseClip(character), { once: SEATED_POSES.has(character.pose), fade: 0.35 });
    refreshLabelHeight(character);
    setBubble(character, ROOM_BUBBLES[roomId]);
  };

  const freeSlot = (roomId) => occupancy[roomId].findIndex((occupant) => occupant === null);

  const releaseSlots = (character) => {
    const key = character.spec.key;
    if (occupancy[character.room]?.[character.slot] === key) occupancy[character.room][character.slot] = null;
    if (character.target && occupancy[character.target.room][character.target.slot] === key) occupancy[character.target.room][character.target.slot] = null;
    character.target = null;
  };

  const startWalking = (character) => {
    character.pose = "walk";
    setBubble(character, null);
    refreshLabelHeight(character);
    playClip(character, baseClip(character), { timeScale: 1.15, fade: 0.25 });
  };

  const moveTo = (key, roomId, note) => {
    const character = characters[key];
    if (!character) return { ok: false, reason: "Personnage inconnu." };
    if (character.gone) return { ok: false, reason: `${character.spec.name} est déjà parti.` };
    const slotIndex = freeSlot(roomId);
    if (slotIndex < 0) return { ok: false, reason: "La pièce est pleine." };
    releaseSlots(character);
    occupancy[roomId][slotIndex] = key;
    character.target = { room: roomId, slot: slotIndex };
    const destination = slotPosition(roomId, slotIndex);
    character.path = buildRoute(character.root.position.x, character.root.position.z, destination.x, destination.z);
    character.exiting = false;
    character.note = note ?? "";
    character.moved = true;
    startWalking(character);
    return { ok: true };
  };

  const exitThroughGate = (key, note, removeWhenGone = false) => {
    const character = characters[key];
    if (!character) return { ok: false, reason: "Personnage inconnu." };
    if (character.gone) return { ok: false, reason: `${character.spec.name} est déjà parti.` };
    releaseSlots(character);
    const gateX = roomCenters.mrg.x + GATE_LOCAL.x;
    const gateZ = roomCenters.mrg.z + GATE_LOCAL.z;
    character.path = [...buildRoute(character.root.position.x, character.root.position.z, gateX, gateZ + 1.2), { x: gateX, z: gateZ + 0.3 }];
    character.exiting = true;
    character.removeWhenGone = removeWhenGone;
    character.note = note ?? "";
    character.moved = true;
    startWalking(character);
    return { ok: true };
  };

  const beginVanish = (character) => {
    releaseSlots(character);
    character.path = [];
    character.removeWhenGone = true;
    character.vanish = VANISH_SECONDS;
    setBubble(character, null);
  };

  const arrive = (character, onChange) => {
    if (character.exiting) {
      character.celebrate = CELEBRATE_SECONDS;
      character.root.rotation.y = Math.PI;
      playClip(character, character.spec.kind === "robot" ? "Dance" : "agree", { fade: 0.2 });
      return;
    }
    settle(character, character.target.room, character.target.slot);
    character.target = null;
    onChange(character.spec.key);
  };

  const spawn = (spec, immediate) => {
    const slotIndex = freeSlot(spec.room);
    if (slotIndex < 0) return false;
    const character = buildCharacter(spec);
    occupancy[spec.room][slotIndex] = spec.key;
    settle(character, spec.room, slotIndex);
    if (!immediate) {
      character.spawn = SPAWN_SECONDS;
      character.root.scale.setScalar(0.001);
    }
    return true;
  };

  const sync = (specs, { mergedKeys = [], immediate = false } = {}) => {
    const wanted = new Map(specs.map((spec) => [spec.key, spec]));
    order.slice().forEach((key) => {
      const character = characters[key];
      if (wanted.has(key) || character.vanish > 0 || character.celebrate > 0) return;
      if (character.exiting) {
        character.removeWhenGone = true;
        return;
      }
      if (mergedKeys.includes(key)) exitThroughGate(key, "MR mergée : elle sort du bureau par le portique.", true);
      else beginVanish(character);
    });

    const overflow = {};
    const countOverflow = (roomId) => {
      overflow[roomId] = (overflow[roomId] ?? 0) + 1;
    };
    specs.forEach((spec) => {
      const existing = characters[spec.key];
      if (!existing) {
        if (!spawn(spec, immediate)) countOverflow(spec.room);
        return;
      }
      existing.spec = spec;
      existing.labelElement.textContent = spec.name;
      if (existing.exiting || existing.vanish > 0) return;
      const currentRoom = existing.target ? existing.target.room : existing.room;
      if (currentRoom !== spec.room && !moveTo(spec.key, spec.room, "").ok) countOverflow(spec.room);
    });
    return { overflow };
  };

  const clear = () => {
    order.slice().forEach(removeCharacter);
    Object.keys(occupancy).forEach((roomId) => {
      occupancy[roomId] = occupancy[roomId].map(() => null);
    });
    selectionRing.visible = false;
  };

  const setSelected = (key) => {
    selectedKey = key;
    order.forEach((otherKey) => {
      characters[otherKey].labelElement.classList.toggle("tag--selected", otherKey === key);
    });
  };

  const update = (delta, elapsed, onChange) => {
    order.slice().forEach((key) => {
      const character = characters[key];
      if (!character) return;
      if (character.gone) return;
      character.mixer.update(delta);

      if (character.spawn > 0) {
        character.spawn -= delta;
        character.root.scale.setScalar(Math.min(1, Math.max(0.001, 1 - character.spawn / SPAWN_SECONDS)));
      }

      if (character.vanish > 0) {
        character.vanish -= delta;
        character.root.scale.setScalar(Math.max(0.001, character.vanish / VANISH_SECONDS));
        if (character.vanish <= 0) {
          if (character.removeWhenGone) {
            removeCharacter(key);
          } else {
            character.root.visible = false;
            character.labelObject.visible = false;
            character.bubbleObject.visible = false;
            character.gone = true;
            character.exiting = false;
          }
          onChange(key);
        }
        return;
      }

      if (character.celebrate > 0) {
        character.celebrate -= delta;
        if (character.celebrate <= 0) character.vanish = VANISH_SECONDS;
        return;
      }

      if (character.path.length > 0) {
        const waypoint = character.path[0];
        const position = character.root.position;
        const dx = waypoint.x - position.x;
        const dz = waypoint.z - position.z;
        const distance = Math.hypot(dx, dz);
        const step = WALK_SPEED * delta;
        if (distance > 0.02) {
          const wanted = Math.atan2(dx, dz);
          character.root.rotation.y += wrapAngle(wanted - character.root.rotation.y) * Math.min(1, delta * 10);
        }
        if (distance <= step) {
          position.x = waypoint.x;
          position.z = waypoint.z;
          character.path.shift();
          if (character.path.length === 0) arrive(character, onChange);
        } else {
          position.x += (dx / distance) * step;
          position.z += (dz / distance) * step;
        }
        if (selectedKey === key) onChange(key);
        return;
      }

      if (character.emoteLeft > 0) {
        character.emoteLeft -= delta;
        if (character.emoteLeft <= 0) playClip(character, baseClip(character), { fade: 0.3 });
      } else if (character.spec.kind === "robot" && ["stand", "queue", "ready"].includes(character.pose)) {
        character.emoteTimer -= delta;
        if (character.emoteTimer <= 0) {
          const emote = character.pose === "ready" ? "ThumbsUp" : ROBOT_EMOTES[Math.floor(Math.random() * ROBOT_EMOTES.length)];
          const clip = character.actions[emote];
          playClip(character, emote, { once: true, fade: 0.25 });
          character.emoteLeft = clip ? clip.getClip().duration : 1.5;
          character.emoteTimer = 6 + Math.random() * 5;
        }
      }
    });

    const selected = selectedKey ? characters[selectedKey] : null;
    if (selected && !selected.gone) {
      selectionRing.visible = true;
      selectionRing.position.set(selected.root.position.x, 0.06, selected.root.position.z);
      selectionRing.scale.setScalar(1 + Math.sin(elapsed * 4) * 0.06);
    } else {
      selectionRing.visible = false;
    }
  };

  const describe = (key) => {
    const character = characters[key];
    if (!character) return null;
    return {
      spec: character.spec,
      room: character.room,
      target: character.target?.room ?? null,
      walking: character.path.length > 0 || character.celebrate > 0,
      gone: character.gone,
      exiting: character.exiting,
      note: character.note,
      moved: character.moved,
    };
  };

  const positionOf = (key) => {
    const character = characters[key];
    if (!character || character.gone) return null;
    return { x: character.root.position.x, y: character.height, z: character.root.position.z };
  };

  return {
    sync,
    clear,
    moveTo,
    exitThroughGate,
    update,
    setSelected,
    describe,
    positionOf,
    getPickables: () => pickables,
    keys: () => order.slice(),
  };
};
