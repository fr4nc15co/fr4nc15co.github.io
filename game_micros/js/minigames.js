// Minijuegos de los NPCs secundarios del bar (Zipi y Zape). Overlays de arcade
// independientes del progreso: pican al alumno con conceptos de la asignatura y
// guardan su récord en localStorage (aparte de la partida, como el volumen). No
// dan vidas —fiel a la regla del original de que solo Fran cura— sino puntuación.
//
// - Zipi "Binario → Hex": sale un binario (0..0xFFFF) y tecleas el hexadecimal.
//   Puntúa cuántos aciertas en 20 s.
// - Zape "Caza el bit": Simon de 4 LEDs sin final; la secuencia crece un LED por
//   ronda y puntúa cuántos LEDs llegas a acertar (presiones correctas acumuladas).

import { sfx } from "./sfx.js";

const recordKey = (kind) => `gamif.micros.${kind}`;
const ZIPI_DURATION = 20000; // ms
const TOTAL_TESTS = 14;      // total de medallas (igual que en main.js)

// Catálogo del menú de la recreativa del bar (main.js llama a openMenu(medallas)).
// `unlockAt` = medallas necesarias para desbloquear (Hex y Simon siempre libres).
// `scoreLabel` = etiqueta de puntuación en la pantalla de resultado.
const GAMES = [
  { kind: "zipi",          icon: "🔢", name: "Binario → Hex", unlockAt: 0, scoreLabel: "Aciertos",
    desc: "Convierte binarios a hexadecimal a contrarreloj." },
  { kind: "zape",          icon: "💡", name: "Caza el bit",   unlockAt: 1, scoreLabel: "LEDs acertados",
    desc: "Repite la secuencia de LEDs (Simon)." },
  { kind: "equilibrista",  icon: "⚖️", name: "Equilibrista",  unlockAt: 2, scoreLabel: "Segundos",
    desc: "Mantén el LED dentro de la pista con ← →." },
  { kind: "francotirador", icon: "🎯", name: "Francotirador", unlockAt: 4, scoreLabel: "Dianas",
    desc: "Dispara cuando el cursor pase por la diana." },
  { kind: "gato",          icon: "🐱", name: "Gato y ratón",  unlockAt: 6, scoreLabel: "Segundos",
    desc: "Escapa del perseguidor por el anillo de LEDs." },
  { kind: "reflejo",       icon: "⚡", name: "Reflejo fatal", unlockAt: 8, scoreLabel: "Puntos",
    desc: "Pulsa en cuanto el LED se ponga verde." },
];

const gameMeta = (kind) => GAMES.find(g => g.kind === kind);

export class Minigames {
  constructor({ onClose, touch }) {
    this.onClose = onClose || (() => {});
    this.touch = !!touch;
    this.root = document.getElementById("screen-minigame");
    this.body = document.getElementById("mg-body");
    this.keyHandler = null; // el juego activo atiende sus propias teclas
    this.cleanup = null;    // para de timers/rAF del juego activo
    this.active = null;     // 'zipi' | 'zape' | 'menu' | null
    this.menuMode = false;  // lanzado desde la recreativa: al salir se vuelve al menú
    document.getElementById("mg-close").addEventListener("click", () => this.close());
    document.addEventListener("keydown", (e) => this.onKey(e));
  }

  start(kind, { menu = false } = {}) {
    this.active = kind;
    this.menuMode = menu;
    this.root.classList.remove("hidden");
    ({
      zipi: () => this.startZipi(),
      zape: () => this.startZape(),
      equilibrista: () => this.startEquilibrista(),
      francotirador: () => this.startFrancotirador(),
      gato: () => this.startGato(),
      reflejo: () => this.startReflejo(),
    })[kind]();
  }

  // Menú de la recreativa: lista los minijuegos; los que superan tu nº de
  // medallas salen bloqueados. `medals` = medallas conseguidas (main.js lo pasa).
  openMenu(medals = 0) {
    this.teardown();
    this.active = "menu";
    this.menuMode = true;
    this.root.classList.remove("hidden");
    this.body.innerHTML = `
      <div class="mg-head">
        <div class="mg-title">🕹️ Recreativa del bar</div>
        <div class="mg-record">🏅 ${medals}/${TOTAL_TESTS}</div>
      </div>
      <div class="mg-menu">
        ${GAMES.map(g => {
          const locked = medals < g.unlockAt;
          return `
          <button class="mg-menu-item${locked ? " locked" : ""}" data-kind="${g.kind}"${locked ? " disabled" : ""}>
            <span class="mg-menu-icon">${locked ? "🔒" : g.icon}</span>
            <span class="mg-menu-info">
              <span class="mg-menu-name">${g.name}</span>
              <span class="mg-menu-desc">${locked ? `Consigue ${g.unlockAt} medallas para desbloquear.` : g.desc}</span>
            </span>
            <span class="mg-menu-record">${locked ? `🏅 ${g.unlockAt}` : `🏆 ${this.record(g.kind)}`}</span>
          </button>`;
        }).join("")}
      </div>
      <div class="mg-hint">Los minijuegos se desbloquean con tus medallas 🏅</div>`;
    for (const btn of this.body.querySelectorAll(".mg-menu-item:not(.locked)")) {
      btn.addEventListener("click", () => this.start(btn.dataset.kind, { menu: true }));
    }
  }

  close() {
    if (!this.active) return;
    this.teardown();
    this.active = null;
    this.menuMode = false;
    this.body.innerHTML = "";
    this.root.classList.add("hidden");
    this.onClose();
  }

  onKey(e) {
    if (!this.active) return;
    if (e.key === "Escape") { this.close(); return; }
    if (this.keyHandler) this.keyHandler(e);
  }

  teardown() {
    if (this.cleanup) { this.cleanup(); this.cleanup = null; }
    this.keyHandler = null;
    this.body.classList.remove("mg-flash-ok", "mg-flash-bad");
  }

  /** Medallas necesarias para desbloquear un minijuego (0 = siempre libre). */
  unlockAt(kind) {
    const g = gameMeta(kind);
    return g ? g.unlockAt : 0;
  }

  /** Próximo minijuego que se desbloqueará con más medallas (o null si ya están todos). */
  nextLocked(medals) {
    return GAMES
      .filter(g => medals < g.unlockAt)
      .sort((a, b) => a.unlockAt - b.unlockAt)[0] || null;
  }

  record(kind) {
    const v = Number(localStorage.getItem(recordKey(kind)));
    return Number.isFinite(v) && v > 0 ? v : 0;
  }

  /** Guarda el récord si mejora el anterior; devuelve true si es nuevo récord. */
  saveRecord(kind, value) {
    if (value > this.record(kind)) {
      localStorage.setItem(recordKey(kind), String(value));
      return true;
    }
    return false;
  }

  // ---------- pantalla de resultado (común) ----------

  showResult(kind, score, scoreLabel) {
    this.teardown();
    const isRecord = this.saveRecord(kind, score);
    if (isRecord && score > 0) sfx.win(); else sfx.blip();
    const best = this.record(kind);
    this.body.innerHTML = `
      <div class="mg-result">
        <div class="mg-result-icon">${isRecord && score > 0 ? "🏆" : "🎮"}</div>
        <div class="mg-result-score">${scoreLabel}: <b>${score}</b></div>
        <div class="mg-result-record">
          ${isRecord && score > 0 ? "¡Nuevo récord!" : `Tu récord: ${best}`}
        </div>
        <div class="mg-result-btns">
          <button id="mg-again" class="btn btn-primary">Jugar otra vez</button>
          <button id="mg-exit" class="btn">${this.menuMode ? "Menú" : "Salir"}</button>
        </div>
      </div>`;
    const menu = this.menuMode; // start() lo reescribe; capturar antes
    document.getElementById("mg-again").addEventListener("click", () => this.start(kind, { menu }));
    document.getElementById("mg-exit").addEventListener("click", () =>
      menu ? this.openMenu() : this.close());
  }

  // ---------- Zipi: binario → hexadecimal, contrarreloj ----------

  startZipi() {
    this.teardown();
    let score = 0;
    let value = 0;
    let buffer = "";
    const startAt = performance.now();

    this.body.innerHTML = `
      <div class="mg-head">
        <div class="mg-title">🔢 Binario → Hex</div>
        <div class="mg-record">Récord: ${this.record("zipi")}</div>
      </div>
      <div class="mg-timebar"><div class="mg-timefill" id="mg-time"></div></div>
      <div class="mg-score">Aciertos: <b id="mg-zipi-score">0</b></div>
      <div class="mg-prompt">
        <div class="mg-bin" id="mg-bin"></div>
        <div class="mg-arrow">= <span id="mg-hex" class="mg-hex">_</span><sub>hex</sub></div>
      </div>
      <div class="mg-keypad" id="mg-keypad"></div>
      <div class="mg-hint">${this.touch ? "Pulsa las teclas y ✓" : "Teclea el hexadecimal y pulsa Enter"}</div>`;

    const bin = document.getElementById("mg-bin");
    const hex = document.getElementById("mg-hex");
    const scoreEl = document.getElementById("mg-zipi-score");
    const timeEl = document.getElementById("mg-time");

    const render = () => { hex.textContent = buffer || "_"; };

    const newNumber = () => {
      // dígitos hex 1..4 → dificultad variada; el dígito más alto nunca es 0
      const nibbles = 1 + Math.floor(Math.random() * 4);
      const min = nibbles === 1 ? 0 : Math.pow(16, nibbles - 1);
      const max = Math.pow(16, nibbles) - 1;
      value = min + Math.floor(Math.random() * (max - min + 1));
      const bits = value.toString(2).padStart(nibbles * 4, "0");
      bin.textContent = bits.replace(/(.{4})(?=.)/g, "$1 "); // agrupa por nibble
      buffer = "";
      render();
    };

    const flash = (ok) => {
      this.body.classList.remove("mg-flash-ok", "mg-flash-bad");
      // reinicia la animación forzando reflow
      void this.body.offsetWidth;
      this.body.classList.add(ok ? "mg-flash-ok" : "mg-flash-bad");
    };

    const submit = () => {
      if (!buffer) return;
      if (parseInt(buffer, 16) === value) {
        score++;
        scoreEl.textContent = score;
        sfx.blip();
        flash(true);
      } else {
        sfx.fail();
        flash(false);
      }
      newNumber();
    };

    const press = (ch) => {
      if (buffer.length >= 4) return;
      buffer += ch.toUpperCase();
      render();
      sfx.step();
    };
    const del = () => { buffer = buffer.slice(0, -1); render(); };

    // teclado hex en pantalla (sirve en escritorio con ratón y en táctil)
    const keys = ["0","1","2","3","4","5","6","7","8","9","A","B","C","D","E","F"];
    const pad = document.getElementById("mg-keypad");
    for (const k of keys) {
      const b = document.createElement("button");
      b.className = "mg-key";
      b.textContent = k;
      b.addEventListener("click", () => press(k));
      pad.appendChild(b);
    }
    const bDel = document.createElement("button");
    bDel.className = "mg-key mg-key-wide";
    bDel.textContent = "⌫";
    bDel.addEventListener("click", del);
    pad.appendChild(bDel);
    const bOk = document.createElement("button");
    bOk.className = "mg-key mg-key-wide mg-key-ok";
    bOk.textContent = "✓";
    bOk.addEventListener("click", submit);
    pad.appendChild(bOk);

    this.keyHandler = (e) => {
      if (/^[0-9a-fA-F]$/.test(e.key)) { e.preventDefault(); press(e.key); }
      else if (e.key === "Backspace") { e.preventDefault(); del(); }
      else if (e.key === "Enter") { e.preventDefault(); submit(); }
    };

    let raf = 0;
    const tick = (now) => {
      const remaining = Math.max(0, ZIPI_DURATION - (now - startAt));
      timeEl.style.width = `${(remaining / ZIPI_DURATION) * 100}%`;
      if (remaining <= 0) { this.showResult("zipi", score, "Aciertos"); return; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    this.cleanup = () => cancelAnimationFrame(raf);
    newNumber();
  }

  // ---------- Zape: Simon de 4 LEDs, sin final ----------

  startZape() {
    this.teardown();
    const sequence = [];
    let score = 0;      // presiones correctas acumuladas = "LEDs acertados"
    let inputPos = 0;
    let accepting = false;
    const timeouts = [];
    const after = (ms, fn) => { const id = setTimeout(fn, ms); timeouts.push(id); return id; };

    this.body.innerHTML = `
      <div class="mg-head">
        <div class="mg-title">💡 Caza el bit</div>
        <div class="mg-record">Récord: ${this.record("zape")}</div>
      </div>
      <div class="mg-score">LEDs acertados: <b id="mg-zape-score">0</b></div>
      <div class="mg-status" id="mg-status">Observa la secuencia…</div>
      <div class="mg-pads" id="mg-pads">
        ${[0,1,2,3].map(i => `<button class="mg-pad mg-pad-${i}" data-i="${i}"></button>`).join("")}
      </div>
      <div class="mg-hint">${this.touch ? "Toca los LEDs en el mismo orden" : "Repite con el ratón o las teclas 1-4"}</div>`;

    const scoreEl = document.getElementById("mg-zape-score");
    const statusEl = document.getElementById("mg-status");
    const pads = [...document.querySelectorAll(".mg-pad")];

    const lightPad = (i, ms = 300) => {
      pads[i].classList.add("lit");
      sfx.led(i);
      after(ms, () => pads[i].classList.remove("lit"));
    };

    const playSequence = () => {
      accepting = false;
      statusEl.textContent = "Observa la secuencia…";
      const speed = Math.max(280, 640 - (sequence.length - 1) * 30);
      sequence.forEach((i, k) => {
        after(k * speed + 400, () => lightPad(i, speed * 0.55));
      });
      after(sequence.length * speed + 400, () => {
        accepting = true;
        inputPos = 0;
        statusEl.textContent = "¡Tu turno! Repite la secuencia";
      });
    };

    const nextRound = () => {
      sequence.push(Math.floor(Math.random() * 4));
      playSequence();
    };

    const pressPad = (i) => {
      if (!accepting) return;
      lightPad(i, 220);
      if (i === sequence[inputPos]) {
        score++;
        inputPos++;
        scoreEl.textContent = score;
        if (inputPos === sequence.length) {
          accepting = false;
          statusEl.textContent = "¡Bien! Va la siguiente…";
          after(700, nextRound);
        }
      } else {
        accepting = false;
        sfx.fail();
        this.body.classList.add("mg-flash-bad");
        after(500, () => this.showResult("zape", score, "LEDs acertados"));
      }
    };

    for (const p of pads) p.addEventListener("click", () => pressPad(Number(p.dataset.i)));
    this.keyHandler = (e) => {
      if (/^[1-4]$/.test(e.key)) { e.preventDefault(); pressPad(Number(e.key) - 1); }
    };

    this.cleanup = () => { for (const id of timeouts) clearTimeout(id); };
    after(600, nextRound);
  }

  // ---------- Equilibrista: mantén el LED en la pista (ExamenA "Equilibrador") ----------
  startEquilibrista() {
    this.teardown();
    const N = 7, CENTER = 3;
    let pos = CENTER, alive = true, raf = 0;
    const startAt = performance.now();
    const timeouts = [];
    const after = (ms, fn) => { const id = setTimeout(fn, ms); timeouts.push(id); return id; };

    this.body.innerHTML = `
      <div class="mg-head">
        <div class="mg-title">⚖️ Equilibrista</div>
        <div class="mg-record">Récord: ${this.record("equilibrista")} s</div>
      </div>
      <div class="mg-score">Tiempo: <b id="mg-eq-t">0.0</b> s</div>
      <div class="mg-status">Contrarresta las sacudidas y no te salgas</div>
      <div class="mg-strip" id="mg-strip"></div>
      <div class="mg-strip-btns">
        <button class="mg-key mg-key-wide" id="mg-eq-l">◀</button>
        <button class="mg-key mg-key-wide" id="mg-eq-r">▶</button>
      </div>
      <div class="mg-hint">${this.touch ? "Usa ◀ ▶" : "Teclas ← → (o A/D)"}</div>`;

    const strip = document.getElementById("mg-strip");
    const leds = [];
    for (let i = 0; i < N; i++) {
      const d = document.createElement("div");
      d.className = "mg-led" + (i === CENTER ? " center" : "");
      strip.appendChild(d);
      leds.push(d);
    }
    const tEl = document.getElementById("mg-eq-t");
    const draw = () => leds.forEach((d, i) => d.classList.toggle("on", i === pos));
    draw();

    const end = () => {
      if (!alive) return;
      alive = false;
      sfx.fail();
      this.body.classList.add("mg-flash-bad");
      const secs = Math.floor((performance.now() - startAt) / 1000);
      after(500, () => this.showResult("equilibrista", secs, "Segundos"));
    };

    const move = (dir) => {
      if (!alive) return;
      pos += dir;
      if (pos < 0 || pos > N - 1) { end(); return; }
      draw();
      sfx.step();
    };

    const kick = () => {
      if (!alive) return;
      const el = (performance.now() - startAt) / 1000;
      const mag = el > 25 && Math.random() < 0.35 ? 2 : 1;
      pos += (Math.random() < 0.5 ? -1 : 1) * mag;
      if (pos < 0 || pos > N - 1) { end(); return; }
      draw();
      after(Math.max(360, 1100 - el * 28), kick);
    };

    const tick = () => {
      if (!alive) return;
      tEl.textContent = ((performance.now() - startAt) / 1000).toFixed(1);
      raf = requestAnimationFrame(tick);
    };

    document.getElementById("mg-eq-l").addEventListener("click", () => move(-1));
    document.getElementById("mg-eq-r").addEventListener("click", () => move(1));
    this.keyHandler = (e) => {
      if (e.key === "ArrowLeft" || e.key.toLowerCase() === "a") { e.preventDefault(); move(-1); }
      else if (e.key === "ArrowRight" || e.key.toLowerCase() === "d") { e.preventDefault(); move(1); }
    };

    this.cleanup = () => { cancelAnimationFrame(raf); for (const id of timeouts) clearTimeout(id); };
    raf = requestAnimationFrame(tick);
    after(1100, kick);
  }

  // ---------- Francotirador: dispara al pasar por la diana (ExamenB "Disparo al LED") ----------
  startFrancotirador() {
    this.teardown();
    const N = 7;
    let target = 0, cursor = 0, dir = 1, bullets = 3, score = 0, alive = true, stepMs = 260;
    const timeouts = [];
    const after = (ms, fn) => { const id = setTimeout(fn, ms); timeouts.push(id); return id; };

    this.body.innerHTML = `
      <div class="mg-head">
        <div class="mg-title">🎯 Francotirador</div>
        <div class="mg-record">Récord: ${this.record("francotirador")}</div>
      </div>
      <div class="mg-score">Dianas: <b id="mg-fr-s">0</b> · Balas: <b id="mg-fr-b">🔴🔴🔴</b></div>
      <div class="mg-status">Dispara cuando el cursor esté en la diana dorada</div>
      <div class="mg-strip" id="mg-strip"></div>
      <div class="mg-strip-btns">
        <button class="mg-key mg-key-wide mg-key-ok" id="mg-fr-fire">🔫 Disparar</button>
      </div>
      <div class="mg-hint">${this.touch ? "Pulsa 🔫 Disparar" : "Espacio o Enter para disparar"}</div>`;

    const strip = document.getElementById("mg-strip");
    const leds = [];
    for (let i = 0; i < N; i++) { const d = document.createElement("div"); d.className = "mg-led"; strip.appendChild(d); leds.push(d); }
    const sEl = document.getElementById("mg-fr-s");
    const bEl = document.getElementById("mg-fr-b");

    const draw = () => leds.forEach((d, i) => {
      d.className = "mg-led";
      if (i === target) d.classList.add("target");
      if (i === cursor) d.classList.add(i === target ? "aligned" : "cursor");
    });
    const newTarget = () => { do { target = Math.floor(Math.random() * N); } while (target === cursor); };
    newTarget(); draw();

    const step = () => {
      if (!alive) return;
      cursor += dir;
      if (cursor >= N - 1) { cursor = N - 1; dir = -1; }
      else if (cursor <= 0) { cursor = 0; dir = 1; }
      draw();
      after(stepMs, step);
    };

    const end = () => {
      if (!alive) return;
      alive = false;
      sfx.fail();
      this.body.classList.add("mg-flash-bad");
      after(500, () => this.showResult("francotirador", score, "Dianas"));
    };

    const fire = () => {
      if (!alive) return;
      if (cursor === target) {
        score++; sEl.textContent = score;
        sfx.blip();
        stepMs = Math.max(90, stepMs - 12);
        newTarget();
      } else {
        bullets--;
        bEl.textContent = bullets > 0 ? "🔴".repeat(bullets) : "—";
        sfx.fail();
        if (bullets <= 0) { end(); return; }
      }
      draw();
    };

    document.getElementById("mg-fr-fire").addEventListener("click", fire);
    this.keyHandler = (e) => {
      if (e.key === " " || e.code === "Space" || e.key === "Enter") { e.preventDefault(); fire(); }
    };

    this.cleanup = () => { for (const id of timeouts) clearTimeout(id); };
    after(stepMs, step);
  }

  // ---------- Gato y ratón: escapa por el anillo (ExamenB "Persecución de LEDs") ----------
  startGato() {
    this.teardown();
    const N = 8;
    let player = 0, chaser = N / 2, alive = true, chaseMs = 850, raf = 0;
    const startAt = performance.now();
    const timeouts = [];
    const after = (ms, fn) => { const id = setTimeout(fn, ms); timeouts.push(id); return id; };

    this.body.innerHTML = `
      <div class="mg-head">
        <div class="mg-title">🐱 Gato y ratón</div>
        <div class="mg-record">Récord: ${this.record("gato")} s</div>
      </div>
      <div class="mg-score">Tiempo: <b id="mg-ga-t">0.0</b> s</div>
      <div class="mg-status">Avanza para huir del 🔴 (¡y no lo alcances por detrás!)</div>
      <div class="mg-ring" id="mg-ring"></div>
      <div class="mg-strip-btns">
        <button class="mg-key mg-key-wide mg-key-ok" id="mg-ga-go">Avanzar ▶</button>
      </div>
      <div class="mg-hint">${this.touch ? "Pulsa Avanzar" : "Espacio / Enter / → para avanzar"}</div>`;

    const ring = document.getElementById("mg-ring");
    const leds = [];
    for (let i = 0; i < N; i++) {
      const d = document.createElement("div");
      d.className = "mg-led ring";
      const ang = (i / N) * 2 * Math.PI - Math.PI / 2;
      d.style.left = `calc(50% + ${Math.cos(ang) * 68}px)`;
      d.style.top = `calc(50% + ${Math.sin(ang) * 68}px)`;
      ring.appendChild(d);
      leds.push(d);
    }
    const tEl = document.getElementById("mg-ga-t");
    const draw = () => leds.forEach((d, i) => {
      d.className = "mg-led ring";
      if (i === player) d.classList.add("player");
      if (i === chaser) d.classList.add("chaser");
    });
    draw();

    const end = () => {
      if (!alive) return;
      alive = false;
      sfx.fail();
      this.body.classList.add("mg-flash-bad");
      const secs = Math.floor((performance.now() - startAt) / 1000);
      after(500, () => this.showResult("gato", secs, "Segundos"));
    };

    const advance = () => {
      if (!alive) return;
      player = (player + 1) % N;
      draw();
      sfx.step();
      if (player === chaser) end();
    };

    const chase = () => {
      if (!alive) return;
      chaser = (chaser + 1) % N;
      draw();
      if (chaser === player) { end(); return; }
      const el = (performance.now() - startAt) / 1000;
      chaseMs = Math.max(240, 850 - el * 24);
      after(chaseMs, chase);
    };

    const tick = () => {
      if (!alive) return;
      tEl.textContent = ((performance.now() - startAt) / 1000).toFixed(1);
      raf = requestAnimationFrame(tick);
    };

    document.getElementById("mg-ga-go").addEventListener("click", advance);
    this.keyHandler = (e) => {
      if (e.key === " " || e.code === "Space" || e.key === "Enter" || e.key === "ArrowRight") { e.preventDefault(); advance(); }
    };

    this.cleanup = () => { cancelAnimationFrame(raf); for (const id of timeouts) clearTimeout(id); };
    raf = requestAnimationFrame(tick);
    after(chaseMs, chase);
  }

  // ---------- Reflejo fatal: pulsa al ponerse verde (ExamenA2 "Reflejos") ----------
  startReflejo() {
    this.teardown();
    let points = 0, alive = true, phase = "idle", greenAt = 0;
    const timeouts = [];
    const after = (ms, fn) => { const id = setTimeout(fn, ms); timeouts.push(id); return id; };

    this.body.innerHTML = `
      <div class="mg-head">
        <div class="mg-title">⚡ Reflejo fatal</div>
        <div class="mg-record">Récord: ${this.record("reflejo")}</div>
      </div>
      <div class="mg-score">Puntos: <b id="mg-re-p">0</b></div>
      <button class="mg-bigpad wait" id="mg-re-pad"></button>
      <div class="mg-status" id="mg-re-s">Espera al verde…</div>
      <div class="mg-hint">${this.touch ? "Toca el LED al ponerse verde" : "Espacio / Enter al ponerse verde"}</div>`;

    const pad = document.getElementById("mg-re-pad");
    const pEl = document.getElementById("mg-re-p");
    const sEl = document.getElementById("mg-re-s");

    const end = (msg) => {
      if (!alive) return;
      alive = false;
      sfx.fail();
      this.body.classList.add("mg-flash-bad");
      sEl.textContent = msg;
      after(600, () => this.showResult("reflejo", points, "Puntos"));
    };

    const roundStart = () => {
      if (!alive) return;
      phase = "wait";
      pad.className = "mg-bigpad wait";
      sEl.textContent = "Espera al verde…";
      after(1000 + Math.random() * 2800, () => {
        if (!alive || phase !== "wait") return;
        phase = "go";
        pad.className = "mg-bigpad go";
        greenAt = performance.now();
        sEl.textContent = "¡YA!";
        after(1000, () => { if (alive && phase === "go") end("Demasiado lento"); });
      });
    };

    const press = () => {
      if (!alive) return;
      if (phase === "wait") { end("¡Salida en falso!"); return; }
      if (phase !== "go") return;
      const ms = performance.now() - greenAt;
      const pts = Math.max(1, Math.round((1000 - ms) / 10));
      points += pts;
      pEl.textContent = points;
      phase = "between";
      pad.className = "mg-bigpad";
      sEl.textContent = `${Math.round(ms)} ms  (+${pts})`;
      sfx.blip();
      after(800, roundStart);
    };

    pad.addEventListener("click", press);
    this.keyHandler = (e) => {
      if (e.key === " " || e.code === "Space" || e.key === "Enter") { e.preventDefault(); press(); }
    };

    this.cleanup = () => { for (const id of timeouts) clearTimeout(id); };
    after(700, roundStart);
  }
}
