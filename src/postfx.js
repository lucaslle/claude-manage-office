import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { GTAOPass } from "three/addons/postprocessing/GTAOPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

const TiltShiftShader = {
  uniforms: {
    tDiffuse: { value: null },
    focus: { value: 0.5 },
    band: { value: 0.3 },
    amount: { value: 1.8 },
    resolution: { value: new THREE.Vector2(1, 1) },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float focus;
    uniform float band;
    uniform float amount;
    uniform vec2 resolution;
    varying vec2 vUv;
    void main() {
      float blurFactor = smoothstep(band, band + 0.28, abs(vUv.y - focus));
      vec2 texel = amount * blurFactor / resolution;
      vec4 sum = texture2D(tDiffuse, vUv) * 0.25;
      for (int i = 0; i < 8; i++) {
        float angle = float(i) * 0.7853982;
        vec2 offset = vec2(cos(angle), sin(angle)) * texel * 2.0;
        sum += texture2D(tDiffuse, vUv + offset) * 0.09375;
      }
      gl_FragColor = sum;
    }
  `,
};

const QUALITY_LEVELS = {
  low: { pixelRatio: 1, ao: false, bloom: false, tiltShift: false },
  medium: { pixelRatio: 1.25, ao: true, bloom: false, tiltShift: true },
  high: { pixelRatio: 2, ao: true, bloom: true, tiltShift: true },
};

const DEFAULT_QUALITY = "low";

export const createRenderPipeline = ({ renderer, scene, camera, container }) => {
  let width = container.clientWidth;
  let height = container.clientHeight;
  const composer = new EffectComposer(renderer);
  const renderPass = new RenderPass(scene, camera);
  const aoPass = new GTAOPass(scene, camera, width, height);
  aoPass.updateGtaoMaterial({ radius: 0.7, distanceExponent: 1.4, thickness: 1.2, scale: 1.1, samples: 12, distanceFallOff: 1 });
  aoPass.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 5, radiusExponent: 1, rings: 2, samples: 12 });
  aoPass.blendIntensity = 0.85;
  const bloomPass = new UnrealBloomPass(new THREE.Vector2(width, height), 0.18, 0.6, 0.92);
  const tiltShiftPass = new ShaderPass(TiltShiftShader);
  const outputPass = new OutputPass();
  composer.addPass(renderPass);
  composer.addPass(aoPass);
  composer.addPass(bloomPass);
  composer.addPass(tiltShiftPass);
  composer.addPass(outputPass);

  let levelName = DEFAULT_QUALITY;

  const resize = () => {
    width = container.clientWidth;
    height = container.clientHeight;
    if (width === 0 || height === 0) return;
    const pixelRatio = QUALITY_LEVELS[levelName].pixelRatio;
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(width, height);
    composer.setPixelRatio(pixelRatio);
    composer.setSize(width, height);
    tiltShiftPass.uniforms.resolution.value.set(width * pixelRatio, height * pixelRatio);
  };

  const setQuality = (name) => {
    levelName = name;
    const level = QUALITY_LEVELS[name];
    aoPass.enabled = level.ao;
    bloomPass.enabled = level.bloom;
    tiltShiftPass.enabled = level.tiltShift;
    resize();
  };

  const render = () => {
    if (levelName === "low") renderer.render(scene, camera);
    else composer.render();
  };

  setQuality(DEFAULT_QUALITY);

  return { render, resize, setQuality, getQuality: () => levelName };
};
