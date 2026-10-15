import * as THREE from "three";
import { CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";

const PARTICLE_POOL = 200;
const PARTICLE_SECONDS = 1.5;
const FADE_SECONDS = 0.4;
const GRAVITY = 9.5;
const FLOOR_Y = 0.05;
const GAIN_SECONDS = 1.7;
const GAIN_RISE_SPEED = 0.9;
const SHAKE_SECONDS = 0.35;
const PALETTES = {
  confetti: [0x4d8ef0, 0xe58a2f, 0x39b085, 0xb06ad8, 0xd8627f, 0xf0c33a],
  dust: [0x9aa3b0, 0xb8bfc8, 0x7d8794, 0xcfd4db],
};

export const createEffects = (scene) => {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const geometry = new THREE.BoxGeometry(0.16, 0.16, 0.04);
  const materials = Object.fromEntries(Object.entries(PALETTES).map(([name, colors]) => [name, colors.map((color) => new THREE.MeshBasicMaterial({ color }))]));
  const particles = Array.from({ length: PARTICLE_POOL }, (_, index) => {
    const mesh = new THREE.Mesh(geometry, materials.confetti[index % materials.confetti.length]);
    mesh.visible = false;
    scene.add(mesh);
    return { mesh, life: 0, velocity: new THREE.Vector3(), spin: new THREE.Vector3() };
  });
  const gains = [];
  let shakeLeft = 0;
  let shakeStrength = 0;

  const burst = ({ x, y, z }, count = 40, palette = "confetti") => {
    if (reducedMotion) return;
    const palette_materials = materials[palette] ?? materials.confetti;
    let spawned = 0;
    particles.forEach((particle) => {
      if (spawned >= count || particle.life > 0) return;
      particle.mesh.material = palette_materials[spawned % palette_materials.length];
      spawned += 1;
      particle.life = PARTICLE_SECONDS;
      particle.mesh.visible = true;
      particle.mesh.position.set(x, y, z);
      particle.mesh.scale.setScalar(1);
      particle.mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.5 + Math.random() * 2.5;
      particle.velocity.set(Math.cos(angle) * speed, 4 + Math.random() * 4, Math.sin(angle) * speed);
      particle.spin.set(Math.random() * 8, Math.random() * 8, Math.random() * 8);
    });
  };

  const gain = ({ x, y, z }, text, tone = "") => {
    const anchor = document.createElement("div");
    const label = document.createElement("div");
    label.className = tone ? `gain gain--${tone}` : "gain";
    label.textContent = text;
    anchor.append(label);
    const object = new CSS2DObject(anchor);
    object.position.set(x, y, z);
    scene.add(object);
    gains.push({ object, life: GAIN_SECONDS });
  };

  const shake = (strength = 0.25) => {
    if (reducedMotion) return;
    shakeLeft = SHAKE_SECONDS;
    shakeStrength = strength;
  };

  const shakeOffset = (target) => {
    if (shakeLeft <= 0) {
      target.set(0, 0, 0);
      return;
    }
    const amplitude = shakeStrength * (shakeLeft / SHAKE_SECONDS);
    target.set((Math.random() - 0.5) * amplitude, (Math.random() - 0.5) * amplitude, (Math.random() - 0.5) * amplitude);
  };

  const updateParticle = (particle, delta) => {
    if (particle.life <= 0) return;
    particle.life -= delta;
    if (particle.life <= 0) {
      particle.mesh.visible = false;
      return;
    }
    particle.velocity.y -= GRAVITY * delta;
    particle.mesh.position.addScaledVector(particle.velocity, delta);
    particle.mesh.rotation.x += particle.spin.x * delta;
    particle.mesh.rotation.y += particle.spin.y * delta;
    particle.mesh.rotation.z += particle.spin.z * delta;
    if (particle.mesh.position.y < FLOOR_Y) {
      particle.mesh.position.y = FLOOR_Y;
      particle.velocity.y *= -0.3;
      particle.velocity.x *= 0.8;
      particle.velocity.z *= 0.8;
    }
    if (particle.life < FADE_SECONDS) particle.mesh.scale.setScalar(particle.life / FADE_SECONDS);
  };

  const update = (delta) => {
    if (shakeLeft > 0) shakeLeft -= delta;
    particles.forEach((particle) => updateParticle(particle, delta));
    for (let index = gains.length - 1; index >= 0; index -= 1) {
      const entry = gains[index];
      entry.life -= delta;
      entry.object.position.y += GAIN_RISE_SPEED * delta;
      if (entry.life > 0) continue;
      scene.remove(entry.object);
      entry.object.element.remove();
      gains.splice(index, 1);
    }
  };

  return { burst, gain, shake, shakeOffset, update };
};
