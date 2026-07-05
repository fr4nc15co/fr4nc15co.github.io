// Mundo del juego: mapa, jugador, NPCs, cámara y colisiones.
// Réplica de GameScreen/GameUpdater/Player del original libGDX:
// movimiento por casillas (1/6 s por casilla), cámara de 24x16 casillas
// centrada en el jugador y eje Y hacia arriba.

import { loadImage } from "./data.js";
import { sfx } from "./sfx.js";

const TILE = 16;          // px por casilla en el mapa original
const SCALE = 2;          // factor de dibujo en el canvas (768x512 = 24x16 casillas)
const VIEW_W = 24 * TILE; // 384
const VIEW_H = 16 * TILE; // 256
const MOVE_TIME = 1 / 6;   // segundos por casilla, como en el original
const RUN_TIME = 1 / 12;   // corriendo (tecla Q / botón 🏃): el doble de rápido

// Teletransportes (escaleras/puertas) copiados de GameUpdater.java. Eje Y hacia arriba.
// Exportados para que el minimapa marque las escaleras.
export const TELEPORTS = [
  { xMin: 16, xMax: 19, y: 41, tx: 96,  ty: 6 },
  { xMin: 95, xMax: 97, y: 1,  tx: 18,  ty: 46 },
  { xMin: 43, xMax: 46, y: 56, tx: 112, ty: 83 },
  { xMin: 110, xMax: 114, y: 84, tx: 45, ty: 62 },
];

const DIRS = {
  derecha:   { dx: 1,  dy: 0 },
  izquierda: { dx: -1, dy: 0 },
  espaldas:  { dx: 0,  dy: 1 },  // mirando hacia arriba (de espaldas a cámara)
  frente:    { dx: 0,  dy: -1 }, // mirando hacia abajo (de frente a cámara)
};

export class World {
  constructor(canvas, collisions, npcs) {
    this.ctx = canvas.getContext("2d");
    this.ctx.imageSmoothingEnabled = false;
    this.collisions = collisions;
    this.npcs = npcs;
    this.sprites = new Map(); // src -> Image
    this.keys = new Set();
    this.player = null;
    this.compassTarget = null; // NPC de la siguiente prueba (flecha de orientación)
    this.time = 0;             // reloj para la animación de la flecha
    this.regions = this.computeRegions();
    // región de origen y destino de cada teletransporte, para enrutar la brújula
    this.tpEdges = TELEPORTS.map(t => ({
      tp: t,
      from: this.regionAt(Math.round((t.xMin + t.xMax) / 2), t.y),
      to: this.regionAt(t.tx, t.ty),
    }));
  }

  // Etiqueta cada casilla transitable con su componente conexa (flood fill).
  // Las "plantas" del mapa son islas separadas que solo unen los teletransportes.
  computeRegions() {
    const { width: W, height: H } = this.collisions;
    const regions = new Int16Array(W * H).fill(-1);
    let next = 0;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (this.collisions.blocked(x, y) || regions[y * W + x] !== -1) continue;
        const stack = [[x, y]];
        regions[y * W + x] = next;
        while (stack.length) {
          const [cx, cy] = stack.pop();
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = cx + dx, ny = cy + dy;
            if (!this.collisions.blocked(nx, ny) && regions[ny * W + nx] === -1) {
              regions[ny * W + nx] = next;
              stack.push([nx, ny]);
            }
          }
        }
        next++;
      }
    }
    return regions;
  }

  /** Región de una casilla; si está bloqueada (p. ej. un NPC sobre mobiliario),
   *  vale la de una vecina, que es desde donde se llega hasta ella. */
  regionAt(x, y) {
    const { width: W, height: H } = this.collisions;
    const at = (px, py) =>
      px < 0 || py < 0 || px >= W || py >= H ? -1 : this.regions[py * W + px];
    const own = at(x, y);
    if (own !== -1) return own;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const r = at(x + dx, y + dy);
      if (r !== -1) return r;
    }
    return -1;
  }

  /** Punto al que apunta la brújula: el NPC objetivo si está en la región del
   *  jugador, o la entrada del primer teletransporte de la ruta hacia él. */
  compassAim() {
    const n = this.compassTarget;
    if (!n) return null;
    const px = Math.round(this.player.x), py = Math.round(this.player.y);
    const from = this.regionAt(px, py);
    const to = this.regionAt(n.x, n.y);
    if (from === -1 || to === -1 || from === to) return { x: n.x, y: n.y, final: true };

    // BFS sobre el grafo de regiones unidas por teletransportes
    const prev = new Map([[from, null]]);
    const queue = [from];
    while (queue.length) {
      const r = queue.shift();
      for (const e of this.tpEdges) {
        if (e.from === r && !prev.has(e.to)) {
          prev.set(e.to, { region: r, tp: e.tp });
          queue.push(e.to);
        }
      }
    }
    if (!prev.has(to)) return { x: n.x, y: n.y, final: true }; // sin ruta: línea recta

    // primer salto de la ruta: el teletransporte que sale de la región del jugador
    let step = prev.get(to);
    while (step.region !== from) step = prev.get(step.region);
    const t = step.tp;
    return { x: Math.min(Math.max(px, t.xMin), t.xMax), y: t.y, final: false };
  }

  /** Fija el NPC al que apunta la brújula (null para ocultarla). */
  setCompassTarget(npc) {
    this.compassTarget = npc || null;
  }

  async loadSprites(gender) {
    const jobs = [["map", loadImage("assets/map/icaiMap.png")]];
    const frames = ["frente", "espaldas", "derecha", "izquierda"];
    for (const f of frames) {
      jobs.push([f, loadImage(`assets/people/${gender}/${f}.png`)]);
      jobs.push([`andar_${f}_1`, loadImage(`assets/people/${gender}/andar_${f}_1.png`)]);
      jobs.push([`andar_${f}_2`, loadImage(`assets/people/${gender}/andar_${f}_2.png`)]);
    }
    for (const npc of this.npcs) jobs.push([npc.sprite, loadImage(npc.sprite)]);
    const loaded = await Promise.all(jobs.map(async ([k, p]) => [k, await p]));
    for (const [k, img] of loaded) this.sprites.set(k, img);
    this.mapImg = this.sprites.get("map");
  }

  spawnPlayer(x, y, direction) {
    this.player = {
      x, y,                 // posición en casillas (float durante el movimiento)
      targetX: x, targetY: y,
      direction: direction || "frente",
      moving: false,
      elapsed: 0,
      moveTime: MOVE_TIME, // duración de la casilla actual (menor al correr)
    };
  }

  /** Avanza la simulación. Devuelve el NPC con el que se interactúa (tecla E) o null. */
  update(dt, inputEnabled) {
    this.time += dt;
    const p = this.player;

    if (!p.moving && inputEnabled) {
      const dir = this.heldDirection();
      if (dir) {
        const { dx, dy } = DIRS[dir];
        p.direction = dir;
        const nx = Math.round(p.x) + dx;
        const ny = Math.round(p.y) + dy;
        if (!this.isBlocked(nx, ny)) {
          p.targetX = nx;
          p.targetY = ny;
          p.moving = true;
          p.elapsed = 0;
          p.moveTime = this.keys.has("KeyQ") ? RUN_TIME : MOVE_TIME;
          sfx.step();
        }
      }
    }

    if (p.moving) {
      p.elapsed += dt;
      const alpha = Math.min(p.elapsed / p.moveTime, 1);
      // misma interpolación que el original: lerp desde la posición actual
      p.x = p.x + (p.targetX - p.x) * alpha;
      p.y = p.y + (p.targetY - p.y) * alpha;
      if (alpha >= 1) {
        p.x = p.targetX;
        p.y = p.targetY;
        p.moving = false;
        p.elapsed = 0;
        this.checkTeleport();
      }
    }

    if (inputEnabled && this.keys.has("KeyE")) {
      this.keys.delete("KeyE"); // interacción de un solo disparo
      return this.facingNPC();
    }
    return null;
  }

  heldDirection() {
    if (this.keys.has("KeyW") || this.keys.has("ArrowUp")) return "espaldas";
    if (this.keys.has("KeyS") || this.keys.has("ArrowDown")) return "frente";
    if (this.keys.has("KeyD") || this.keys.has("ArrowRight")) return "derecha";
    if (this.keys.has("KeyA") || this.keys.has("ArrowLeft")) return "izquierda";
    return null;
  }

  isBlocked(x, y) {
    if (this.collisions.blocked(x, y)) return true;
    return this.npcs.some(n => n.x === x && n.y === y);
  }

  checkTeleport() {
    const p = this.player;
    for (const t of TELEPORTS) {
      if (p.y === t.y && p.x >= t.xMin && p.x <= t.xMax) {
        p.x = p.targetX = t.tx;
        p.y = p.targetY = t.ty;
        return;
      }
    }
  }

  facingNPC() {
    const p = this.player;
    const { dx, dy } = DIRS[p.direction];
    const x = Math.round(p.x) + dx;
    const y = Math.round(p.y) + dy;
    return this.npcs.find(n => n.x === x && n.y === y) || null;
  }

  playerFrame() {
    const p = this.player;
    if (!p.moving) return p.direction;
    const alpha = p.elapsed / p.moveTime;
    if (alpha < 1 / 3) return `andar_${p.direction}_1`;
    if (alpha < 2 / 3) return p.direction;
    return `andar_${p.direction}_2`;
  }

  render() {
    const { ctx, mapImg, player: p } = this;
    const H = this.collisions.height;

    // centro de cámara = centro del jugador, en píxeles de la imagen del mapa
    const camX = p.x * TILE + TILE / 2 - VIEW_W / 2;
    const camY = (H - 1 - p.y) * TILE + TILE / 2 - VIEW_H / 2;

    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, VIEW_W * SCALE, VIEW_H * SCALE);
    ctx.drawImage(mapImg,
      camX, camY, VIEW_W, VIEW_H,
      0, 0, VIEW_W * SCALE, VIEW_H * SCALE);

    // personajes ordenados de arriba a abajo de la pantalla
    const entities = [
      ...this.npcs.map(n => ({ img: this.sprites.get(n.sprite), x: n.x, y: n.y })),
      { img: this.sprites.get(this.playerFrame()), x: p.x, y: p.y },
    ].sort((a, b) => b.y - a.y);

    for (const e of entities) {
      const sx = (e.x * TILE - camX) * SCALE;
      const sy = ((H - 1 - e.y) * TILE - camY) * SCALE;
      if (sx > -TILE * SCALE && sx < VIEW_W * SCALE && sy > -TILE * SCALE && sy < VIEW_H * SCALE) {
        ctx.drawImage(e.img, sx, sy, TILE * SCALE, TILE * SCALE);
      }
    }

    this.renderCompass(camX, camY, H);
  }

  // Flecha hacia la siguiente prueba: apunta al NPC objetivo o, si está en otra
  // región (planta/edificio), a la escalera o puerta que lleva hacia él.
  renderCompass(camX, camY, H) {
    const aim = this.compassAim();
    if (!aim) return;
    const { ctx } = this;
    const W = VIEW_W * SCALE, HGT = VIEW_H * SCALE;
    const tx = (aim.x * TILE + TILE / 2 - camX) * SCALE;
    const ty = ((H - 1 - aim.y) * TILE + TILE / 2 - camY) * SCALE;
    const onScreen = tx >= 0 && tx <= W && ty >= 0 && ty <= HGT;

    // el propio NPC ya se ve en pantalla: no hace falta flecha
    if (aim.final && onScreen) return;

    // la cámara centra al jugador, así que el origen es el centro del canvas
    const cx = W / 2, cy = HGT / 2;
    const dx = tx - cx, dy = ty - cy;
    if (dx === 0 && dy === 0) return;
    const margin = 26;
    // recortada al borde; si el waypoint (escalera) está a la vista, posada sobre él
    const t = Math.min(
      1,
      dx !== 0 ? (W / 2 - margin) / Math.abs(dx) : Infinity,
      dy !== 0 ? (HGT / 2 - margin) / Math.abs(dy) : Infinity,
    );
    const pulse = 1 + 0.15 * Math.sin(this.time * 6);

    ctx.save();
    ctx.translate(cx + dx * t, cy + dy * t);
    ctx.rotate(Math.atan2(dy, dx));
    ctx.scale(pulse, pulse);
    ctx.beginPath();
    ctx.moveTo(14, 0);
    ctx.lineTo(-9, -9);
    ctx.lineTo(-4, 0);
    ctx.lineTo(-9, 9);
    ctx.closePath();
    ctx.fillStyle = "#ffcb05";
    ctx.strokeStyle = "#2a2a00";
    ctx.lineWidth = 2;
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}
