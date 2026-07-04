// Punto de entrada: máquina de estados del juego (título -> selección -> mundo
// -> diálogo -> prueba -> resultado -> victoria/derrota), guardado en
// localStorage y música. Réplica web de gameApp/Game.java.

import { loadTests, loadQuestions, loadPeople, loadCollisions } from "./data.js";
import { World, TELEPORTS } from "./world.js";
import { Quiz, formatText, escapeHTML } from "./quiz.js";
import { sfx, setSfxVolume } from "./sfx.js";
import { track } from "./analytics.js";

const SAVE_KEY = "gamif.micros.save";
// El volumen va en su propia clave: la partida se borra al ganar/reiniciar y
// el volumen es una preferencia del dispositivo, no progreso del juego.
const VOLUME_KEY = "gamif.micros.volume";
const START = { x: 13, y: 70, direction: "frente" };
const TOTAL_TESTS = 14;

// Versión visible en Ajustes. Mantener en sincronía con CACHE_VERSION de sw.js:
// al publicar se sube una y otra (v4 → v5 → …) para que se note el despliegue.
const APP_VERSION = "v6";

// Medallero: una medalla por prueba, con el concepto del tema como nombre. El
// arte pixel-art (componente hardware por prueba) está en
// assets/medals/prueba{n}.png, generado por tools/make_medals.py. No hay estado
// nuevo: las medallas ganadas son las pruebas 1..nextTest-1, así que se
// reinician con el progreso al perder.
const MEDALS = [
  "Experto en C", "Puertos", "Temporizadores", "Prescaler", "Interrupciones",
  "Prioridades", "UART", "PWM", "Remapeo", "I2C", "Conversión A/D",
  "Máq. de estados", "PIC32", "Proyecto final",
];

// Pantalla táctil: puntero "gordo" o soporte touch. `?touch` fuerza los
// controles en escritorio para poder probarlos.
const IS_TOUCH = matchMedia("(pointer: coarse)").matches
  || "ontouchstart" in window
  || new URLSearchParams(location.search).has("touch");

const $ = (id) => document.getElementById(id);

const state = {
  mode: "loading",   // loading | title | select | world | dialog | quiz | overlay
  name: "",
  gender: "chico",
  lives: 3,
  nextTest: 1,
};

let tests, npcs, world, quiz, music;
let dialogCtl = null; // controlador del diálogo activo

// ---------- arranque ----------

async function boot() {
  const [t, people, collisions] = await Promise.all([loadTests(), loadPeople(), loadCollisions()]);
  tests = t;
  npcs = people;
  world = new World($("game-canvas"), collisions, npcs);
  quiz = new Quiz();

  // AAC/.m4a: iOS Safari no soporta Ogg Vorbis (la música quedaba muda en iPhone).
  music = new Audio("assets/music/song.m4a");
  music.loop = true;
  applyVolume(loadVolume());

  wireTitle();
  wireSelect();
  wireSettings();
  wireMap();
  wireMedals();
  wireDialogKeys();
  wireTouchControls();

  $("app-version").textContent = APP_VERSION;
  $("loading").classList.add("hidden");
  showTitle();
  registerServiceWorker();
}

function showTitle() {
  state.mode = "title";
  const saved = loadSave();
  $("btn-continue").classList.toggle("hidden", !saved);
  $("btn-reset").classList.toggle("hidden", !saved);
  $("btn-new").classList.toggle("hidden", !!saved);
  $("screen-title").classList.remove("hidden");
}

function wireTitle() {
  $("btn-new").addEventListener("click", () => {
    startMusic();
    $("screen-title").classList.add("hidden");
    $("screen-select").classList.remove("hidden");
    state.mode = "select";
    $("sel-name").focus();
  });
  $("btn-continue").addEventListener("click", () => {
    startMusic();
    const s = loadSave();
    Object.assign(state, s);
    track("game_start", { mode: "continue", test_number: state.nextTest });
    $("screen-title").classList.add("hidden");
    enterWorld(s.x, s.y, s.direction);
  });
  $("btn-reset").addEventListener("click", () => {
    localStorage.removeItem(SAVE_KEY);
    showTitle();
  });
}

function wireSelect() {
  for (const card of document.querySelectorAll(".gender-card")) {
    card.addEventListener("click", () => {
      document.querySelectorAll(".gender-card").forEach(c => c.classList.remove("selected"));
      card.classList.add("selected");
      state.gender = card.dataset.gender;
    });
  }
  $("btn-start").addEventListener("click", startNewGame);
  $("sel-clave").addEventListener("keydown", e => { if (e.key === "Enter") startNewGame(); });
  $("sel-name").addEventListener("keydown", e => { if (e.key === "Enter") startNewGame(); });
}

function startNewGame() {
  const name = $("sel-name").value.trim();
  const clave = $("sel-clave").value.trim().toUpperCase();
  const error = $("sel-error");
  if (!name) {
    error.textContent = "Escribe un nombre para tu personaje.";
    error.classList.remove("hidden");
    return;
  }
  let nextTest = 1;
  if (clave) {
    const match = [...tests.values()].find(t => t.key === clave);
    if (!match) {
      error.textContent = "Esa clave no corresponde a ninguna prueba.";
      error.classList.remove("hidden");
      return;
    }
    nextTest = match.num;
  }
  error.classList.add("hidden");
  state.name = name;
  state.lives = 3;
  state.nextTest = nextTest;
  track("game_start", { mode: clave ? "checkpoint" : "new", test_number: nextTest });
  saveGame(START.x, START.y, START.direction);
  $("screen-select").classList.add("hidden");
  showInstructions(nextTest);
}

// Pantalla de instrucciones antes de la aventura: misión (a quién buscar) y
// cómo instalar la PWA para jugar sin conexión. Solo en partida nueva.
function showInstructions(nextTest) {
  const npc = npcs.find(n => n.test === nextTest);
  $("instr-goal").textContent = nextTest === 1
    ? `${state.name}, ve a buscar a Bruno al laboratorio 1: está atascado con el tema de programación en C y necesita tu ayuda.`
    : `${state.name}, retomas la aventura en la prueba ${nextTest}: ve a buscar a ${npc.name}, que te está esperando.`;
  $("screen-instructions").classList.remove("hidden");
}

$("btn-instructions-go").addEventListener("click", () => {
  $("screen-instructions").classList.add("hidden");
  enterWorld(START.x, START.y, START.direction);
});

// ---------- mundo ----------

async function enterWorld(x, y, direction) {
  $("loading").classList.remove("hidden");
  await world.loadSprites(state.gender);
  $("loading").classList.add("hidden");
  world.spawnPlayer(x, y, direction);
  $("hud").classList.remove("hidden");
  updateHUD();
  state.mode = "world";
  requestAnimationFrame(loop);
}

let lastTime = 0;
function loop(time) {
  const dt = Math.min((time - lastTime) / 1000, 0.05);
  lastTime = time;

  if (["world", "dialog", "overlay", "quiz"].includes(state.mode)) {
    const npc = world.update(dt, state.mode === "world");
    world.render();
    if (npc) openDialog(npc);
    if (dialogCtl) dialogCtl.tick();
    // en diálogo también se ocultan: el diálogo táctil es fijo y trae botones
    $("touch-controls").classList.toggle("hidden", !IS_TOUCH || state.mode !== "world");
    requestAnimationFrame(loop);
  }
}

function updateHUD() {
  $("hud-lives").src = `assets/lives/${Math.max(state.lives, 1)}lives.png`;
  $("hud-lives").style.visibility = state.lives > 0 ? "visible" : "hidden";
  $("hud-test").textContent = `Prueba ${state.nextTest}/${TOTAL_TESTS}`;
  // brújula hacia el NPC de la prueba actual (tras la 14 no hay objetivo)
  world.setCompassTarget(npcs.find(n => n.test === state.nextTest));
}

// ---------- diálogos ----------

function openDialog(npc) {
  state.mode = "dialog";
  sfx.blip();
  let text, canTest = false;

  if (npc.test === null) {
    text = npc.dialog;
  } else if (npc.test === state.nextTest) {
    text = npc.dialog;
    canTest = true;
  } else {
    // no es tu prueba: te orienta hacia la siguiente (y Fran te cura)
    const guide = npcs.find(n => n.test === state.nextTest);
    const goHint = guide ? `Ahora ve a por ${guide.name}.` : "Sigue explorando el ICAI.";
    if (npc.name === "Fran" && state.lives < 3) {
      state.lives = 3;
      updateHUD();
      saveGame();
      // Fran restaura las vidas: confirma la curación en vez de la pista genérica.
      text = `Tranquilo, para eso están las tutorías. Repasamos tus dudas y…\n¡vidas restauradas! ${goHint}`;
    } else {
      text = guide ? guide.restDialog : "Sigue explorando el ICAI.";
    }
  }

  $("dialog-portrait").src = npc.portrait;
  $("dialog-name").textContent = npc.name;
  $("dialog-text").textContent = "";
  const actions = $("dialog-actions");
  const kbd = (k) => IS_TOUCH ? "" : ` <kbd>${k}</kbd>`;
  actions.innerHTML = canTest
    ? `<button id="dlg-no" class="btn btn-small">Ahora no${kbd("Esc")}</button>
       <button id="dlg-yes" class="btn btn-primary btn-small">Hacer la prueba${kbd("Enter")}</button>`
    : `<button id="dlg-no" class="btn btn-small">Cerrar${kbd("Esc")}</button>`;
  $("dlg-no").addEventListener("click", closeDialog);
  if (canTest) $("dlg-yes").addEventListener("click", acceptDialog);
  $("dialog").classList.remove("hidden");

  // efecto máquina de escribir, como el original (una letra por fotograma)
  let shown = 0;
  dialogCtl = {
    npc, canTest,
    done: false,
    tick() {
      if (this.done) return;
      shown = Math.min(shown + 1, text.length);
      $("dialog-text").textContent = text.slice(0, shown);
      if (shown === text.length) this.done = true;
    },
    skip() {
      shown = text.length;
      $("dialog-text").textContent = text;
      this.done = true;
    },
  };
}

function closeDialog() {
  $("dialog").classList.add("hidden");
  dialogCtl = null;
  state.mode = "world";
}

/** Lanza la prueba del NPC del diálogo activo (botón "Hacer la prueba" / Enter). */
function acceptDialog() {
  if (!dialogCtl || !dialogCtl.canTest) return;
  const npc = dialogCtl.npc;
  closeDialog();
  startTest(npc.test);
}

/** Avance tipo "botón A": completa el texto, y si ya está completo acepta o cierra. */
function advanceDialog() {
  if (!dialogCtl) return;
  sfx.blip();
  if (!dialogCtl.done) dialogCtl.skip();
  else if (dialogCtl.canTest) acceptDialog();
  else closeDialog();
}

function wireDialogKeys() {
  document.addEventListener("keydown", (e) => {
    // minimapa: M lo abre en el mundo; M o Esc lo cierran
    if (!$("screen-map").classList.contains("hidden")) {
      if (e.code === "KeyM" || e.key === "Escape") closeMap();
      return;
    }
    if (state.mode === "world" && e.code === "KeyM") {
      openMap();
      return;
    }

    // medallero: B lo abre en el mundo; B o Esc lo cierran
    if (!$("screen-medals").classList.contains("hidden")) {
      if (e.code === "KeyB" || e.key === "Escape") closeMedals();
      return;
    }
    if (state.mode === "world" && e.code === "KeyB") {
      openMedals();
      return;
    }

    // teclado del mundo
    if (["world", "dialog"].includes(state.mode)) {
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) {
        e.preventDefault();
      }
      world.keys.add(e.code);
    }

    if (state.mode === "dialog" && dialogCtl) {
      if (e.key === "Escape") {
        closeDialog();
      } else if (e.key === "Enter") {
        if (!dialogCtl.done) dialogCtl.skip();
        else acceptDialog();
      }
    }
  });
  document.addEventListener("keyup", (e) => world.keys.delete(e.code));

  // en táctil, tocar la caja de diálogo completa el texto (fuera de los botones)
  $("dialog").addEventListener("click", (e) => {
    if (e.target.closest("button")) return;
    if (dialogCtl && !dialogCtl.done) dialogCtl.skip();
  });
}

// ---------- controles táctiles ----------

function wireTouchControls() {
  if (!IS_TOUCH) return;

  // Cruceta: se gestiona a nivel de contenedor para que el pulgar pueda
  // deslizarse de una dirección a otra sin levantar el dedo.
  const dpad = $("touch-dpad");
  const active = new Map(); // pointerId -> código de dirección pulsado

  const codeAt = (e) => {
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const btn = el && el.closest("[data-code]");
    return btn ? btn.dataset.code : null;
  };
  const setDir = (pointerId, code) => {
    const prev = active.get(pointerId);
    if (prev === code) return;
    if (prev) {
      world.keys.delete(prev);
      dpad.querySelector(`[data-code="${prev}"]`).classList.remove("pressed");
    }
    if (code) {
      world.keys.add(code);
      dpad.querySelector(`[data-code="${code}"]`).classList.add("pressed");
    }
    active.set(pointerId, code);
  };

  dpad.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    dpad.setPointerCapture(e.pointerId);
    setDir(e.pointerId, codeAt(e));
  });
  dpad.addEventListener("pointermove", (e) => {
    if (active.has(e.pointerId)) setDir(e.pointerId, codeAt(e));
  });
  for (const ev of ["pointerup", "pointercancel"]) {
    dpad.addEventListener(ev, (e) => {
      setDir(e.pointerId, null);
      active.delete(e.pointerId);
    });
  }

  // Botón de acción: hablar en el mundo, avanzar/aceptar en el diálogo.
  $("touch-action").addEventListener("pointerdown", (e) => {
    e.preventDefault();
    if (state.mode === "world") world.keys.add("KeyE");
    else if (state.mode === "dialog") advanceDialog();
  });

  $("touch-controls").addEventListener("contextmenu", (e) => e.preventDefault());

  // adapta los textos de ayuda pensados para teclado
  document.querySelector("#screen-select .help-keys").textContent =
    "Muévete con la cruceta y habla con el botón 💬";
  document.querySelector("#screen-settings .help-keys").textContent =
    "Cruceta — moverse · 💬 — hablar / aceptar";
}

// ---------- pruebas ----------

async function startTest(testNumber) {
  if (testNumber !== state.nextTest) return;
  track("test_start", { test_number: testNumber });
  saveGame();
  const test = tests.get(testNumber);
  const questions = await loadQuestions(test);
  state.mode = "quiz";
  quiz.start(test, questions, (passed, results) => endTest(passed, results), abandonTest);
}

function abandonTest() {
  track("test_abandoned", { test_number: state.nextTest });
  state.mode = "world";
}

function endTest(passed, results) {
  track(passed ? "test_passed" : "test_failed", { test_number: state.nextTest });
  if (passed) {
    state.nextTest += 1;
  } else {
    state.lives -= 1;
  }
  updateHUD();
  saveGame();

  if (state.lives <= 0) {
    // game over: se reinicia el progreso, como en el original
    sfx.gameover();
    track("game_over");
    state.lives = 3;
    state.nextTest = 1;
    saveGame(START.x, START.y, START.direction);
    world.spawnPlayer(START.x, START.y, START.direction);
    updateHUD();
    showOverlay("screen-gameover");
    return;
  }
  if (state.nextTest > TOTAL_TESTS) {
    sfx.win();
    track("victory");
    localStorage.removeItem(SAVE_KEY);
    showOverlay("screen-win");
    return;
  }
  if (passed) sfx.pass(); else sfx.fail();
  showEndTest(passed, results);
}

function showEndTest(passed, results) {
  const panel = $("endtest-panel");
  if (passed) {
    const nextKey = tests.get(state.nextTest).key;
    const earnedNum = state.nextTest - 1; // ya se incrementó nextTest en endTest
    const medalName = MEDALS[earnedNum - 1];
    panel.innerHTML = `
      <div class="center" style="display:flex;flex-direction:column;align-items:center;gap:14px;text-align:center">
        <div class="result-icon">🎉</div>
        <div class="result-title">¡Prueba superada!</div>
        <div class="earned-medal">
          <img src="assets/medals/prueba${earnedNum}.png" alt="Medalla ${escapeHTML(medalName)}">
          <div class="medal-name">🏅 ¡Medalla ${escapeHTML(medalName)}!</div>
        </div>
        <div class="result-sub">Busca a la siguiente persona por el mapa.<br>
        Apunta la clave de checkpoint para continuar otro día:</div>
        <div class="key-badge">${nextKey}</div>
        <button id="btn-endtest" class="btn btn-primary">Volver al mapa</button>
      </div>`;
  } else {
    const grid = results.map((r, i) =>
      `<div class="result-q ${r.ok ? "ok" : "bad"}" title="Pregunta ${i + 1}">${r.ok ? "✓" : "✗"}</div>`).join("");
    // enunciados de las falladas, sin la solución: al repetir hay que volver a pensarlas.
    // Como en el quiz, solo las MC pasan por formatText; DD/FG van en texto plano
    // (la heurística de código se dispara con los ";" de la prosa).
    const failHTML = (r) => r.type === "MC"
      ? formatText(r.question)
      : escapeHTML(String(r.question)).replace(/\n/g, "<br>");
    const fails = results.map((r, i) => ({ ...r, num: i + 1 })).filter(r => !r.ok);
    // A una vida: avisa de que puede recuperarlas buscando al NPC Fran por el
    // mapa (hablar con él cura las vidas) antes de arriesgar la última.
    const lifeWarning = state.lives === 1 ? `
        <div class="result-warn">
          ⚠️ ¡Te queda <b>una sola vida</b>! Si la pierdes, volverás a la prueba 1.<br>
          ¿Quieres recuperar vidas? Quizá debas buscar a <b>Fran</b> por el mapa y
          resolver tus dudas con él en una tutoría antes de reintentar.
        </div>` : "";
    const failList = fails.length === 0 ? "" : `
        <div class="result-fails">
          <div class="result-fails-head">Repasa antes de reintentar:</div>
          ${fails.map(r => `
          <div class="result-fail">
            <span class="result-fail-num">${r.num}</span>
            <div class="result-fail-text">${failHTML(r)}</div>
          </div>`).join("")}
        </div>`;
    panel.innerHTML = `
      <div class="center" style="display:flex;flex-direction:column;align-items:center;gap:14px;text-align:center">
        <div class="result-icon">💔</div>
        <div class="result-title">No has superado la prueba</div>
        <div class="result-sub">Pierdes una vida (te quedan ${state.lives}).
        Hay que acertar todas las preguntas.<br>Este es tu resultado:</div>
        <div class="result-grid">${grid}</div>${lifeWarning}${failList}
        <button id="btn-endtest" class="btn btn-primary">Volver al mapa</button>
      </div>`;
  }
  showOverlay("screen-endtest");
  $("btn-endtest").addEventListener("click", () => hideOverlay("screen-endtest"));
}

function showOverlay(id) {
  state.mode = "overlay";
  $(id).classList.remove("hidden");
}

function hideOverlay(id) {
  $(id).classList.add("hidden");
  state.mode = "world";
}

$("btn-gameover-continue").addEventListener("click", () => hideOverlay("screen-gameover"));
$("btn-win-restart").addEventListener("click", () => location.reload());

// ---------- minimapa ----------

// Coloca un elemento sobre #map-frame en porcentaje: así los puntos escalan
// con la imagen sin recalcular nada al redimensionar.
function positionOnMap(el, x, y) {
  const { width: W, height: H } = world.collisions;
  el.style.left = `${((x + 0.5) / W) * 100}%`;
  el.style.top = `${((H - 1 - y + 0.5) / H) * 100}%`;
}

function wireMap() {
  $("hud-map").addEventListener("click", () => { if (state.mode === "world") openMap(); });
  $("screen-map").addEventListener("click", closeMap); // tocar/clicar en cualquier sitio cierra
  // marcas fijas de escaleras/puertas (los teletransportes del mundo)
  for (const t of TELEPORTS) {
    const s = document.createElement("span");
    s.className = "map-tp";
    s.textContent = "🪜";
    positionOnMap(s, (t.xMin + t.xMax) / 2, t.y);
    $("map-frame").appendChild(s);
  }
}

function openMap() {
  positionOnMap($("map-you"), Math.round(world.player.x), Math.round(world.player.y));
  const target = world.compassTarget;
  $("map-target").classList.toggle("hidden", !target);
  if (target) positionOnMap($("map-target"), target.x, target.y);
  $("map-legend").textContent = target
    ? `🔵 Tú · 🟡 ${target.name} (prueba ${target.test}) · 🪜 Escaleras`
    : "🔵 Tú · 🪜 Escaleras";
  showOverlay("screen-map");
}

function closeMap() { hideOverlay("screen-map"); }

// ---------- medallero ----------

function wireMedals() {
  $("hud-medals").addEventListener("click", () => { if (state.mode === "world") openMedals(); });
  $("screen-medals").addEventListener("click", closeMedals); // tocar/clicar cierra
}

function openMedals() {
  const earnedCount = Math.max(0, Math.min(state.nextTest - 1, TOTAL_TESTS));
  $("medals-grid").innerHTML = MEDALS.map((name, i) => {
    const n = i + 1;
    const earned = n <= earnedCount;
    return `<div class="medal ${earned ? "earned" : "locked"}">
        <div class="medal-wrap">
          <img src="assets/medals/prueba${n}.png" alt="Medalla ${escapeHTML(name)}">
          ${earned ? "" : '<span class="medal-lock">🔒</span>'}
        </div>
        <div class="medal-name">${escapeHTML(name)}</div>
      </div>`;
  }).join("");
  $("medals-count").textContent = `${earnedCount}/${TOTAL_TESTS} medallas`;
  showOverlay("screen-medals");
}

function closeMedals() { hideOverlay("screen-medals"); }

// ---------- configuración ----------

function wireSettings() {
  $("hud-gear").addEventListener("click", () => {
    if (state.mode !== "world") return;
    $("set-volume").value = Math.round(music.volume * 100);
    showOverlay("screen-settings");
  });
  $("set-volume").addEventListener("input", (e) => {
    const v = Number(e.target.value) / 100;
    applyVolume(v);
    localStorage.setItem(VOLUME_KEY, String(v));
  });
  $("btn-save").addEventListener("click", () => {
    saveGame();
    $("btn-save").textContent = "✅ Partida guardada";
    setTimeout(() => ($("btn-save").textContent = "💾 Guardar partida"), 1200);
  });
  // Borrar partida: segunda pulsación para confirmar; la primera caduca sola.
  const btnDelete = $("btn-delete-save");
  let deleteTimer = 0;
  btnDelete.addEventListener("click", () => {
    if (!btnDelete.classList.contains("confirm")) {
      btnDelete.classList.add("confirm");
      btnDelete.textContent = "⚠️ ¿Seguro? Pulsa otra vez";
      deleteTimer = setTimeout(() => {
        btnDelete.classList.remove("confirm");
        btnDelete.textContent = "🗑️ Borrar partida";
      }, 3000);
      return;
    }
    clearTimeout(deleteTimer);
    localStorage.removeItem(SAVE_KEY);
    saveDisabled = true; // que beforeunload no reescriba la partida recién borrada
    btnDelete.textContent = "🧹 Borrando…";
    clearOfflineCache().finally(() => location.reload());
  });
  $("btn-close-settings").addEventListener("click", () => hideOverlay("screen-settings"));
}

// ---------- guardado ----------

let saveDisabled = false;

function saveGame(x, y, direction) {
  if (saveDisabled) return;
  const p = world.player;
  const data = {
    name: state.name,
    gender: state.gender,
    lives: state.lives,
    nextTest: state.nextTest,
    x: x ?? (p ? Math.round(p.x) : START.x),
    y: y ?? (p ? Math.round(p.y) : START.y),
    direction: direction ?? (p ? p.direction : START.direction),
  };
  localStorage.setItem(SAVE_KEY, JSON.stringify(data));
}

function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

window.addEventListener("beforeunload", () => {
  if (["world", "dialog", "overlay"].includes(state.mode)) saveGame();
});

// ---------- PWA (sin conexión) ----------

// El sw.js precachea el juego entero para jugar offline; ver comentario allí
// sobre subir CACHE_VERSION al publicar. En localhost la caché-primero
// serviría ficheros viejos al editar, así que solo se activa con `?pwa`
// (mismo patrón que `?touch`).
function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return; // http sin TLS o navegador viejo
  const isLocalhost = ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);
  if (isLocalhost && !new URLSearchParams(location.search).has("pwa")) return;
  navigator.serviceWorker.register("sw.js").catch(err =>
    console.warn("Sin modo offline (service worker no registrado):", err));
}

window.addEventListener("appinstalled", () => track("pwa_install"));

// Borra la caché offline y desregistra el service worker. Se usa desde
// "Borrar partida": al recargar, si hay conexión, se vuelve a instalar solo.
async function clearOfflineCache() {
  try {
    if (window.caches) {
      const keys = await caches.keys();
      await Promise.all(keys.filter(k => k.startsWith("gamif-micros-")).map(k => caches.delete(k)));
    }
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r => r.unregister()));
    }
  } catch (err) {
    console.warn("No se pudo borrar la caché offline:", err);
  }
}

function startMusic() {
  music.play().catch(() => { /* el navegador puede bloquearla hasta otro gesto */ });
}

function applyVolume(v) {
  music.volume = v;
  setSfxVolume(v);
}

function loadVolume() {
  const raw = localStorage.getItem(VOLUME_KEY);
  const v = raw === null ? NaN : Number(raw);
  return Number.isFinite(v) && v >= 0 && v <= 1 ? v : 0.1;
}

// Escala el escenario para que quepa en ventanas pequeñas. Se redimensiona el
// propio #stage (el canvas se estira por CSS) en vez de usar transform: así los
// overlays de quiz/pantallas pueden ser position:fixed a tamaño natural y
// seguir legibles en móvil.
function fitStage() {
  let s = Math.min((innerWidth - 20) / 768, (innerHeight - 20) / 512);
  if (s > 1) s = Math.floor(s * 2) / 2; // al agrandar, en pasos de 0,5 (×1,5, ×2, ×2,5…)
  const stage = document.getElementById("stage");
  stage.style.width = `${Math.round(768 * s)}px`;
  stage.style.height = `${Math.round(512 * s)}px`;
}
window.addEventListener("resize", fitStage);
if (IS_TOUCH) document.body.classList.add("touch"); // juego arriba, pulgares abajo
fitStage();

// gancho para depurar desde la consola del navegador
window.__gamif = {
  state,
  teleport: (x, y) => world.spawnPlayer(x, y, "frente"),
  pos: () => world.player && { x: world.player.x, y: world.player.y, direction: world.player.direction },
};

boot().catch(err => {
  console.error(err);
  $("loading").innerHTML = `<p style="color:#e3350d">Error cargando el juego: ${err.message}</p>`;
});
