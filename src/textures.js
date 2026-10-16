import * as THREE from "three";

// Textures dessinées à la volée, sans fichier image.
// Les textures « pixel » (16 x 16, filtrage au plus proche) donnent l'aspect cubique de Minecraft ;
// les autres (sol, mur) sont lissées. userData.uvUnit dit combien de mètres couvre une répétition :
// quand il est défini, applyBoxUv étire les UV d'une boîte pour garder partout la même densité de pixels.

const PIXEL_SIZE = 16;

const clamp = (value) => Math.max(0, Math.min(255, Math.round(value)));
const tone = (rgb, delta) => [clamp(rgb[0] + delta), clamp(rgb[1] + delta), clamp(rgb[2] + delta)];
const mix = (first, second, ratio) => first.map((channel, index) => clamp(channel + (second[index] - channel) * ratio));

const hash2 = (first, second) => {
  let state = (first * 374761393 + second * 668265263) >>> 0;
  state = ((state ^ (state >>> 13)) * 1274126177) >>> 0;
  return ((state ^ (state >>> 16)) >>> 0) / 4294967296;
};

const seeded = (seed) => {
  let state = seed >>> 0 || 1;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
};

const GLYPHS = {
  T: ["111", "010", "010", "010"],
  N: ["101", "111", "111", "101"],
};

const BOOK_COLORS = [[168, 52, 52], [58, 98, 168], [60, 140, 78], [196, 160, 62], [120, 70, 150], [210, 210, 200]];

const PIXEL_PAINTERS = {
  planks: (x, y, random) => {
    const row = y >> 2;
    if ((y & 3) === 3) return [96, 72, 42];
    if (x === ((row * 7 + 2) & 15)) return [112, 84, 50];
    return tone(row % 2 ? [174, 138, 86] : [188, 150, 96], (random() - 0.5) * 16);
  },
  stone: (x, y, random) => tone([127, 127, 127], (random() - 0.5) * 26),
  stoneBrick: (x, y, random) => {
    const row = y >> 3;
    if ((y & 7) === 7) return [86, 86, 86];
    if (x === ((row * 8) & 15)) return [98, 98, 98];
    return tone([128, 128, 128], (random() - 0.5) * 14 + (row ? 4 : -3));
  },
  cobble: (x, y, random) => {
    const row = y >> 2;
    const shift = (row & 1) * 2;
    const cell = (x + shift) >> 2;
    if ((y & 3) === 3 || ((x + shift) & 3) === 3) return [78, 78, 78];
    return tone([128, 128, 128], (hash2(cell, row) - 0.5) * 52 + (random() - 0.5) * 8);
  },
  grass: (x, y, random) => {
    const noise = random();
    return noise < 0.18 ? [72, 138, 48] : tone([96, 164, 64], (noise - 0.5) * 22);
  },
  dirt: (x, y, random) => {
    const noise = random();
    return noise < 0.09 ? [98, 68, 46] : tone([134, 96, 66], (noise - 0.5) * 26);
  },
  leaves: (x, y, random) => {
    const noise = random();
    return noise < 0.42 ? [34, 104, 34] : tone([64, 150, 54], (noise - 0.5) * 24);
  },
  quartz: (x, y, random) => (x === 0 || y === 0 ? [214, 208, 198] : tone([238, 232, 224], (random() - 0.5) * 6)),
  wool: (x, y, random) => tone([236, 236, 236], (random() - 0.5) * 12),
  deepslate: (x, y, random) => tone([60, 60, 68], (random() - 0.5) * 18 + ((y >> 2) & 1 ? 4 : -2)),
  iron: (x, y, random) => (x === 0 || y === 0 || x === 15 || y === 15 ? [170, 170, 172] : tone([220, 220, 222], (random() - 0.5) * 10)),
  netherrack: (x, y, random) => {
    const noise = random();
    if (noise < 0.1) return [76, 26, 30];
    if (noise > 0.88) return [156, 72, 62];
    return tone([114, 46, 46], (noise - 0.5) * 24);
  },
  sand: (x, y, random) => tone([222, 208, 158], (random() - 0.5) * 16),
  log: (x, y, random) => (x % 4 === 0 ? [84, 62, 36] : tone([114, 90, 56], (random() - 0.5) * 18)),
  emerald: (x, y) => {
    if (x === 0 || y === 0 || x === 15 || y === 15) return [26, 138, 64];
    return (x + y) % 9 === 0 ? [140, 255, 180] : tone([48, 206, 110], ((x * 3 + y * 5) % 7) - 3);
  },
  glowstone: (x, y, random) => {
    const noise = random();
    return noise > 0.7 ? [255, 232, 150] : tone([238, 190, 92], (noise - 0.5) * 40);
  },
  tnt: (x, y, random) => {
    if (y < 4 || y >= 12) return tone([204, 50, 40], (random() - 0.5) * 10);
    const column = x - 1;
    const glyph = column >= 0 && column < 15 ? [GLYPHS.T, GLYPHS.N, GLYPHS.T][Math.floor(column / 5)] : null;
    const inLetter = glyph && column % 5 < 3 && y >= 6 && y < 10 && glyph[y - 6][column % 5] === "1";
    return inLetter ? [40, 36, 34] : tone([226, 220, 208], (random() - 0.5) * 8);
  },
  creeper: (x, y, random) => {
    const eye = y >= 4 && y < 8 && ((x >= 3 && x < 7) || (x >= 9 && x < 13));
    const mouth = (y >= 8 && y < 12 && x >= 6 && x < 10) || (y >= 10 && y < 14 && x >= 5 && x < 11 && !(y >= 12 && x >= 7 && x < 9));
    if (eye || mouth) return [24, 40, 22];
    return tone([84, 176, 70], (random() - 0.5) * 36);
  },
  bookshelf: (x, y, random) => {
    if (y < 2 || y >= 14 || (y >= 7 && y < 9)) return tone([176, 140, 88], (random() - 0.5) * 12);
    const book = BOOK_COLORS[Math.floor(hash2(x >> 1, y >> 3) * BOOK_COLORS.length)];
    return tone(book, (random() - 0.5) * 16 - (x & 1 ? 12 : 0));
  },
};

const pixelCache = new Map();

export const isPixelTexture = (name) => name in PIXEL_PAINTERS;

export const pixelTexture = (name) => {
  if (pixelCache.has(name)) return pixelCache.get(name);
  const paint = PIXEL_PAINTERS[name];
  const canvas = document.createElement("canvas");
  canvas.width = PIXEL_SIZE;
  canvas.height = PIXEL_SIZE;
  const context = canvas.getContext("2d");
  const image = context.createImageData(PIXEL_SIZE, PIXEL_SIZE);
  const random = seeded([...name].reduce((total, character) => total * 31 + character.charCodeAt(0), 7));
  for (let y = 0; y < PIXEL_SIZE; y += 1) {
    for (let x = 0; x < PIXEL_SIZE; x += 1) {
      const [red, green, blue] = paint(x, y, random);
      const index = (y * PIXEL_SIZE + x) * 4;
      image.data[index] = red;
      image.data[index + 1] = green;
      image.data[index + 2] = blue;
      image.data[index + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestMipmapLinearFilter;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  texture.userData.uvUnit = 1;
  pixelCache.set(name, texture);
  return texture;
};

// Grain gris, multiplié par la couleur du matériau : donne du « pixel » à n'importe quelle couleur.
export const grainTexture = (strength) => {
  const key = `grain:${strength}`;
  if (pixelCache.has(key)) return pixelCache.get(key);
  const canvas = document.createElement("canvas");
  canvas.width = PIXEL_SIZE;
  canvas.height = PIXEL_SIZE;
  const context = canvas.getContext("2d");
  const random = seeded(4242);
  for (let y = 0; y < PIXEL_SIZE; y += 1) {
    for (let x = 0; x < PIXEL_SIZE; x += 1) {
      const level = clamp(255 - random() * strength * 255);
      context.fillStyle = `rgb(${level},${level},${level})`;
      context.fillRect(x, y, 1, 1);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestMipmapLinearFilter;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.userData.uvUnit = 0.5;
  pixelCache.set(key, texture);
  return texture;
};

export const shadeColor = (hex, amount) => {
  const color = new THREE.Color(hex);
  color.offsetHSL(0, 0, amount);
  return `#${color.getHexString()}`;
};

const finishTexture = (canvas, { repeat = 2, unit = null } = {}) => {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  if (unit) texture.userData.uvUnit = unit;
  else texture.repeat.set(repeat, repeat);
  return texture;
};

const newCanvas = (size) => {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  return { canvas, context: canvas.getContext("2d"), size };
};

const SMOOTH_FLOORS = {
  wood: (context, size, baseColor) => {
    const plankCount = 10;
    const plankWidth = size / plankCount;
    for (let plank = 0; plank < plankCount; plank += 1) {
      context.fillStyle = shadeColor(baseColor, (Math.random() - 0.5) * 0.05);
      context.fillRect(plank * plankWidth, 0, plankWidth, size);
      context.fillStyle = "rgba(0,0,0,0.1)";
      context.fillRect(plank * plankWidth, 0, 1.5, size);
      context.fillRect(plank * plankWidth, Math.random() * size, plankWidth, 1.5);
    }
  },
  carpet: (context, size, baseColor) => {
    const tiles = 6;
    const tileSize = size / tiles;
    for (let row = 0; row < tiles; row += 1) {
      for (let column = 0; column < tiles; column += 1) {
        context.fillStyle = shadeColor(baseColor, (Math.random() - 0.5) * 0.03);
        context.fillRect(column * tileSize, row * tileSize, tileSize, tileSize);
      }
    }
    for (let dot = 0; dot < 5000; dot += 1) {
      context.fillStyle = `rgba(${Math.random() > 0.5 ? "255,255,255" : "0,0,0"},0.035)`;
      context.fillRect(Math.random() * size, Math.random() * size, 2, 2);
    }
    context.fillStyle = "rgba(20,30,50,0.1)";
    for (let line = 0; line < tiles; line += 1) {
      context.fillRect(line * tileSize, 0, 1.2, size);
      context.fillRect(0, line * tileSize, size, 1.2);
    }
  },
  concrete: (context, size) => {
    for (let patch = 0; patch < 260; patch += 1) {
      context.fillStyle = `rgba(${Math.random() > 0.5 ? "255,255,255" : "0,0,0"},${0.02 + Math.random() * 0.03})`;
      context.beginPath();
      context.arc(Math.random() * size, Math.random() * size, 14 + Math.random() * 46, 0, Math.PI * 2);
      context.fill();
    }
    context.fillStyle = "rgba(0,0,0,0.12)";
    context.fillRect(size / 2 - 0.75, 0, 1.5, size);
    context.fillRect(0, size / 2 - 0.75, size, 1.5);
  },
  tile: (context, size, baseColor) => {
    const tiles = 3;
    const tileSize = size / tiles;
    for (let row = 0; row < tiles; row += 1) {
      for (let column = 0; column < tiles; column += 1) {
        const gradient = context.createLinearGradient(column * tileSize, row * tileSize, (column + 1) * tileSize, (row + 1) * tileSize);
        gradient.addColorStop(0, shadeColor(baseColor, 0.012 + (Math.random() - 0.5) * 0.02));
        gradient.addColorStop(1, shadeColor(baseColor, -0.012 + (Math.random() - 0.5) * 0.02));
        context.fillStyle = gradient;
        context.fillRect(column * tileSize, row * tileSize, tileSize, tileSize);
      }
    }
    context.fillStyle = "rgba(30,40,60,0.16)";
    for (let line = 0; line < tiles; line += 1) {
      context.fillRect(line * tileSize - 1, 0, 2, size);
      context.fillRect(0, line * tileSize - 1, size, 2);
    }
  },
  // Damier de cuisine : la couleur de la pièce contre un crème.
  checker: (context, size, baseColor) => {
    const cells = 8;
    const cellSize = size / cells;
    for (let row = 0; row < cells; row += 1) {
      for (let column = 0; column < cells; column += 1) {
        context.fillStyle = (row + column) % 2 ? baseColor : "#f3efe6";
        context.fillRect(column * cellSize, row * cellSize, cellSize, cellSize);
      }
    }
    context.fillStyle = "rgba(0,0,0,0.12)";
    for (let line = 0; line <= cells; line += 1) {
      context.fillRect(line * cellSize - 0.5, 0, 1, size);
      context.fillRect(0, line * cellSize - 0.5, size, 1);
    }
  },
  // Carreaux de terre cuite : grands carreaux légèrement variés, joints sombres.
  quarry: (context, size, baseColor) => {
    const tiles = 4;
    const tileSize = size / tiles;
    for (let row = 0; row < tiles; row += 1) {
      for (let column = 0; column < tiles; column += 1) {
        context.fillStyle = shadeColor(baseColor, (Math.random() - 0.5) * 0.05);
        context.fillRect(column * tileSize, row * tileSize, tileSize, tileSize);
      }
    }
    context.fillStyle = "rgba(60,30,10,0.35)";
    for (let line = 0; line < tiles; line += 1) {
      context.fillRect(line * tileSize - 1.5, 0, 3, size);
      context.fillRect(0, line * tileSize - 1.5, size, 3);
    }
  },
  // Plaques de coque de vaisseau : grandes dalles, joints, rivets aux angles.
  hull: (context, size, baseColor) => {
    const plates = 2;
    const plateSize = size / plates;
    for (let row = 0; row < plates; row += 1) {
      for (let column = 0; column < plates; column += 1) {
        const gradient = context.createLinearGradient(column * plateSize, row * plateSize, (column + 1) * plateSize, (row + 1) * plateSize);
        gradient.addColorStop(0, shadeColor(baseColor, 0.03 + (Math.random() - 0.5) * 0.02));
        gradient.addColorStop(1, shadeColor(baseColor, -0.03 + (Math.random() - 0.5) * 0.02));
        context.fillStyle = gradient;
        context.fillRect(column * plateSize, row * plateSize, plateSize, plateSize);
        context.fillStyle = "rgba(10,16,28,0.55)";
        context.fillRect(column * plateSize, row * plateSize, plateSize, 3);
        context.fillRect(column * plateSize, row * plateSize, 3, plateSize);
        context.fillStyle = "rgba(255,255,255,0.14)";
        context.fillRect(column * plateSize + 3, row * plateSize + 3, plateSize - 3, 2);
        [[16, 16], [plateSize - 16, 16], [16, plateSize - 16], [plateSize - 16, plateSize - 16]].forEach(([rivetX, rivetY]) => {
          context.fillStyle = "rgba(10,16,28,0.5)";
          context.beginPath();
          context.arc(column * plateSize + rivetX, row * plateSize + rivetY, 5, 0, Math.PI * 2);
          context.fill();
          context.fillStyle = "rgba(255,255,255,0.3)";
          context.beginPath();
          context.arc(column * plateSize + rivetX - 1, row * plateSize + rivetY - 1, 2, 0, Math.PI * 2);
          context.fill();
        });
      }
    }
  },
  // Sol sombre quadrillé de lignes néon dans la couleur de la pièce.
  neon: (context, size, baseColor, accent) => {
    context.fillStyle = shadeColor(baseColor, 0);
    context.fillRect(0, 0, size, size);
    const cells = 4;
    const cellSize = size / cells;
    for (let row = 0; row < cells; row += 1) {
      for (let column = 0; column < cells; column += 1) {
        context.fillStyle = shadeColor(baseColor, (Math.random() - 0.5) * 0.025);
        context.fillRect(column * cellSize + 3, row * cellSize + 3, cellSize - 6, cellSize - 6);
      }
    }
    context.shadowColor = accent;
    context.shadowBlur = 14;
    context.fillStyle = accent;
    for (let line = 0; line < cells; line += 1) {
      context.fillRect(line * cellSize - 1.5, 0, 3, size);
      context.fillRect(0, line * cellSize - 1.5, size, 3);
    }
    context.shadowBlur = 0;
  },
  // Plaque de base LEGO : tenons ronds alignés, un par carré de 64 px.
  studs: (context, size, baseColor) => {
    context.fillStyle = baseColor;
    context.fillRect(0, 0, size, size);
    const studs = 4;
    const pitch = size / studs;
    for (let row = 0; row < studs; row += 1) {
      for (let column = 0; column < studs; column += 1) {
        const centerX = column * pitch + pitch / 2;
        const centerY = row * pitch + pitch / 2;
        context.fillStyle = "rgba(0,0,0,0.28)";
        context.beginPath();
        context.arc(centerX + 3, centerY + 4, pitch * 0.3, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = shadeColor(baseColor, 0.05);
        context.beginPath();
        context.arc(centerX, centerY, pitch * 0.3, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = "rgba(255,255,255,0.35)";
        context.beginPath();
        context.arc(centerX - pitch * 0.08, centerY - pitch * 0.08, pitch * 0.12, 0, Math.PI * 2);
        context.fill();
      }
    }
  },
};

const SMOOTH_UNITS = { hull: 4, studs: 1.6 };

export const makeFloorTexture = (baseColor, kind, accent = "#00e5ff") => {
  if (isPixelTexture(kind)) return pixelTexture(kind);
  const { canvas, context, size } = newCanvas(512);
  context.fillStyle = baseColor;
  context.fillRect(0, 0, size, size);
  (SMOOTH_FLOORS[kind] ?? SMOOTH_FLOORS.tile)(context, size, baseColor, accent);
  return finishTexture(canvas, SMOOTH_UNITS[kind] ? { unit: SMOOTH_UNITS[kind] } : { repeat: 2 });
};

const WALL_PAINTERS = {
  hull: SMOOTH_FLOORS.hull,
  studs: SMOOTH_FLOORS.studs,
  // Carrelage blanc de cuisine, façon « métro » : briques de 32 x 16 px, joints gris clair.
  subway: (context, size, baseColor) => {
    context.fillStyle = "#c9ced3";
    context.fillRect(0, 0, size, size);
    const rows = 16;
    const rowHeight = size / rows;
    const tileWidth = size / 8;
    for (let row = 0; row < rows; row += 1) {
      const offset = row % 2 ? tileWidth / 2 : 0;
      for (let column = -1; column < 8; column += 1) {
        context.fillStyle = shadeColor(baseColor, (Math.random() - 0.5) * 0.02);
        context.fillRect(column * tileWidth + offset + 1.5, row * rowHeight + 1.5, tileWidth - 3, rowHeight - 3);
      }
    }
  },
  // Panneaux sombres cernés d'un filet néon.
  panel: (context, size, baseColor, accent) => {
    context.fillStyle = baseColor;
    context.fillRect(0, 0, size, size);
    const panels = 2;
    const panelSize = size / panels;
    for (let row = 0; row < panels; row += 1) {
      for (let column = 0; column < panels; column += 1) {
        context.fillStyle = shadeColor(baseColor, 0.025 + (Math.random() - 0.5) * 0.02);
        context.fillRect(column * panelSize + 6, row * panelSize + 6, panelSize - 12, panelSize - 12);
      }
    }
    context.shadowColor = accent;
    context.shadowBlur = 8;
    context.fillStyle = accent;
    for (let line = 0; line < panels; line += 1) {
      context.fillRect(line * panelSize - 1, 0, 2, size);
      context.fillRect(0, line * panelSize - 1, size, 2);
    }
    context.shadowBlur = 0;
  },
  // Mur en briques LEGO : deux rangées décalées, un trait par brique.
  brick: (context, size, baseColor) => {
    context.fillStyle = baseColor;
    context.fillRect(0, 0, size, size);
    const rows = 4;
    const rowHeight = size / rows;
    const brickWidth = size / 2;
    for (let row = 0; row < rows; row += 1) {
      const offset = row % 2 ? brickWidth / 2 : 0;
      context.fillStyle = "rgba(0,0,0,0.28)";
      context.fillRect(0, row * rowHeight, size, 3);
      for (let column = -1; column < 3; column += 1) {
        context.fillRect(column * brickWidth + offset, row * rowHeight, 3, rowHeight);
      }
      context.fillStyle = "rgba(255,255,255,0.18)";
      context.fillRect(0, row * rowHeight + 3, size, 3);
    }
  },
};

const WALL_UNITS = { hull: 4, studs: 1.6, subway: 1.6, panel: 2, brick: 1.2 };

export const makeWallTexture = (kind, baseColor = "#ffffff", accent = "#ff2bd6") => {
  if (isPixelTexture(kind)) return pixelTexture(kind);
  const { canvas, context, size } = newCanvas(256);
  WALL_PAINTERS[kind](context, size, baseColor, accent);
  return finishTexture(canvas, { unit: WALL_UNITS[kind] ?? 2 });
};

export const applyBoxUv = (geometry, width, height, depth, unit) => {
  const uv = geometry.attributes.uv;
  const faces = [[depth, height], [depth, height], [width, depth], [width, depth], [width, height], [width, height]];
  faces.forEach(([across, up], face) => {
    for (let corner = 0; corner < 4; corner += 1) {
      const index = face * 4 + corner;
      uv.setXY(index, (uv.getX(index) * across) / unit, (uv.getY(index) * up) / unit);
    }
  });
  uv.needsUpdate = true;
};

export const boxGeometry = (width, height, depth, material) => {
  const geometry = new THREE.BoxGeometry(width, height, depth);
  const unit = material?.map?.userData?.uvUnit;
  if (unit) applyBoxUv(geometry, width, height, depth, unit);
  return geometry;
};

export const disposeObject = (root) => {
  root.traverse((node) => {
    if (!node.isMesh && !node.isPoints) return;
    node.geometry?.dispose();
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    materials.forEach((material) => material?.dispose());
  });
};
