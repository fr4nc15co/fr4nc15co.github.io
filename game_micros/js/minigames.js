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

// Catálogo de minijuegos. `hub` = dónde salen ("bar" = recreativa, "taller" =
// banco de trabajo). `unlockAt` = medallas necesarias (0 = siempre libre).
// `scoreLabel` = etiqueta de puntuación en la pantalla de resultado.
const GAMES = [
  { kind: "zipi",          hub: "bar",    icon: "🔢", name: "Binario → Hex", unlockAt: 0, scoreLabel: "Aciertos",
    desc: "Convierte binarios a hexadecimal a contrarreloj." },
  { kind: "zape",          hub: "bar",    icon: "💡", name: "Caza el bit",   unlockAt: 1, scoreLabel: "LEDs acertados",
    desc: "Repite la secuencia de LEDs (Simon)." },
  { kind: "equilibrista",  hub: "bar",    icon: "⚖️", name: "Equilibrista",  unlockAt: 2, scoreLabel: "Segundos",
    desc: "Mantén el LED dentro de la pista con ← →." },
  { kind: "francotirador", hub: "bar",    icon: "🎯", name: "Francotirador", unlockAt: 4, scoreLabel: "Dianas",
    desc: "Dispara cuando el cursor pase por la diana." },
  { kind: "gato",          hub: "bar",    icon: "🐱", name: "Gato y ratón",  unlockAt: 6, scoreLabel: "Segundos",
    desc: "Escapa del perseguidor por el anillo de LEDs." },
  { kind: "rosco",         hub: "bar",    icon: "🔤", name: "El Rosco",      unlockAt: 8, scoreLabel: "Aciertos",
    desc: "Pasapalabra de la asignatura: define un término por cada letra, a contrarreloj." },
  { kind: "clasifica",     hub: "taller", icon: "🧩", name: "Clasifica el componente", unlockAt: 0, scoreLabel: "Puntos",
    desc: "Manda cada componente a su tipo de E/S o a si necesita bus (UART/I2C/SPI)." },
  { kind: "periferico",    hub: "taller", icon: "🧠", name: "¿Con qué lo hago?", unlockAt: 12, scoreLabel: "Puntos",
    desc: "Elige el periférico correcto para cada necesidad. Repaso antes del examen final." },
  { kind: "disena",        hub: "taller", icon: "🛠️", name: "Diseña el sistema", unlockAt: 5, scoreLabel: "Niveles",
    desc: "Reparte periféricos a pines y timers respetando el datasheet (proyecto final)." },
];

// Pines curados y VERIFICADOS del PIC32MX230F064D (referencia de la asignatura):
//  oc  = canal OC que ese pin puede sacar por remapeo (TABLE 11-2): grupo RPA0→OC1,
//        RPA1→OC2, RPA3→OC3, RPA2→OC4/OC5.
//  an  = canal analógico (AN0/AN1 = RA0/RA1; AN2..AN5 = RB0..RB3). null = no analógico.
const PINS = {
  RA0:  { oc: "OC1",  an: "AN0"  },
  RA1:  { oc: "OC2",  an: "AN1"  },
  RB0:  { oc: "OC3",  an: "AN2"  },
  RB1:  { oc: "OC2",  an: "AN3"  },
  RB2:  { oc: "OC45", an: "AN4"  },
  RB3:  { oc: "OC1",  an: "AN5"  },
  RB4:  { oc: "OC1",  an: null   },
  RB7:  { oc: "OC1",  an: null   },
  RB10: { oc: "OC3",  an: null   },
  RB11: { oc: "OC2",  an: null   },
  RB13: { oc: "OC45", an: null   },
  RB14: { oc: "OC3",  an: null   },
  RB15: { oc: "OC1",  an: null   },
  RC7:  { oc: "OC1",  an: null   },
  RC8:  { oc: "OC2",  an: null   },
  RC9:  { oc: "OC3",  an: null   },
};
// canal OC → grupo de remapeo (un grupo = un canal, salvo OC45 que ofrece OC4 y OC5)
const OC_GROUP = { OC1: "G1", OC2: "G2", OC3: "G3", OC45: "G4" };
const GROUP_CAP = { G1: 1, G2: 1, G3: 1, G4: 2 }; // canales OC disponibles por grupo

// Niveles del puzzle. Cada requisito necesita un pin (y timer si es OC). `byTimer`
// en un ADC significa muestreo disparado por Timer3 a `adcFreq` (T3 queda casado).
const DISENA_LEVELS = [
  {
    title: "Riego inteligente",
    adcFreq: 1000, // el ADC muestrea a 1 kHz por Timer3
    reqs: [
      { id: "servo", name: "Servo de la válvula · PWM 50 Hz", need: "OC", freq: 50 },
      { id: "hum",   name: "Sensor de humedad · ADC por timer", need: "ADC", byTimer: true },
      { id: "oled",  name: "Pantalla OLED · I2C", need: "I2C" },
      { id: "led",   name: "LED de estado", need: "GPIO" },
    ],
    pool: ["RA0", "RB3", "RC7", "RB0", "RB2", "RB13", "RB15"],
  },
  {
    title: "Dos ventiladores iguales",
    reqs: [
      { id: "v1",  name: "Ventilador 1 · PWM 20 kHz", need: "OC", freq: 20000 },
      { id: "v2",  name: "Ventilador 2 · PWM 20 kHz", need: "OC", freq: 20000 },
      { id: "pot", name: "Potenciómetro · ADC por sondeo", need: "ADC", byTimer: false },
    ],
    pool: ["RC7", "RB13", "RB10", "RB0", "RB1", "RB15"],
  },
  {
    title: "Dos PWM distintas",
    reqs: [
      { id: "a", name: "PWM A · 1 kHz", need: "OC", freq: 1000 },
      { id: "b", name: "PWM B · 2 kHz", need: "OC", freq: 2000 },
      { id: "z", name: "Zumbador on/off", need: "GPIO" },
    ],
    pool: ["RC7", "RB10", "RB13", "RB15", "RC9"],
  },
];

// "¿Con qué lo hago?": necesidad → periférico correcto (ok) vs distractor plausible
// (no). Solo pares con respuesta inequívoca; el distractor es de otra categoría
// (nada de dos comunicaciones, ni OC-vs-Timer para PWM).
const TASKS = [
  { task: "Leer un potenciómetro", ok: "ADC", no: "GPIO digital" },
  { task: "Leer un LM35 (temperatura)", ok: "ADC", no: "Timer" },
  { task: "Encender / apagar un LED", ok: "GPIO (LAT)", no: "OC (PWM)" },
  { task: "Regular el brillo de un LED", ok: "OC (PWM)", no: "GPIO" },
  { task: "Generar un tono en un zumbador pasivo", ok: "OC (PWM)", no: "GPIO" },
  { task: "Interrupción periódica cada 1 s", ok: "Timer", no: "ADC" },
  { task: "Medir cuánto tarda el usuario en pulsar", ok: "Timer", no: "UART" },
  { task: "Antirrebote temporizado de un botón", ok: "Timer", no: "ADC" },
  { task: "Detectar una pulsación al instante (sin sondeo)", ok: "Interrupción externa (INT)", no: "ADC" },
  { task: "Enviar mensajes al PC por consola", ok: "UART", no: "GPIO" },
];

// Componentes para "Clasifica el componente". `cat` = cubo correcto. Los chips
// I2C/SPI con nombre críptico llevan entre paréntesis qué son.
const COMPONENTS = [
  // Entrada digital (on/off)
  { name: "Pulsador", cat: "digital-in", icon: "🔘" },
  { name: "Interruptor", cat: "digital-in", icon: "🎚️" },
  { name: "Final de carrera", cat: "digital-in", icon: "⬜" },
  { name: "Sensor PIR (movimiento)", cat: "digital-in", icon: "🚶" },
  { name: "Sensor IR de obstáculo", cat: "digital-in", icon: "🚧" },
  { name: "Encoder incremental", cat: "digital-in", icon: "🎡" },
  { name: "Sensor Hall digital", cat: "digital-in", icon: "🧲" },
  // Entrada analógica
  { name: "Potenciómetro", cat: "analog-in", icon: "🎚️" },
  { name: "LDR (fotorresistencia)", cat: "analog-in", icon: "🔆" },
  { name: "NTC / termistor", cat: "analog-in", icon: "🌡️" },
  { name: "LM35 (sensor de temperatura)", cat: "analog-in", icon: "🌡️" },
  { name: "Micrófono", cat: "analog-in", icon: "🎤" },
  { name: "FSR (sensor de fuerza)", cat: "analog-in", icon: "✋" },
  { name: "Sensor de gas MQ", cat: "analog-in", icon: "💨" },
  // Salida digital (on/off)
  { name: "LED", cat: "digital-out", icon: "💡" },
  { name: "Relé", cat: "digital-out", icon: "🔀" },
  { name: "Zumbador activo", cat: "digital-out", icon: "🔔" },
  { name: "Electroválvula", cat: "digital-out", icon: "🚰" },
  // Salida PWM / analógica
  { name: "Servomotor", cat: "pwm", icon: "⚙️" },
  { name: "Motor DC (velocidad)", cat: "pwm", icon: "🌀" },
  { name: "LED regulable (brillo)", cat: "pwm", icon: "🔆" },
  { name: "Zumbador pasivo (tono)", cat: "pwm", icon: "🎵" },
  // Comunicación (sin distinguir protocolo)
  { name: "Módulo Bluetooth HC-05", cat: "comm", icon: "📶" },
  { name: "Módulo GPS", cat: "comm", icon: "🛰️" },
  { name: "SSD1306 (pantalla OLED)", cat: "comm", icon: "🖥️" },
  { name: "DS3231 (reloj RTC)", cat: "comm", icon: "⏰" },
  { name: "BME280 (sensor ambiental)", cat: "comm", icon: "🌦️" },
  { name: "MPU6050 (acelerómetro)", cat: "comm", icon: "📐" },
  { name: "24LC256 (memoria EEPROM)", cat: "comm", icon: "💾" },
  { name: "PCF8574 (expansor de E/S)", cat: "comm", icon: "🔧" },
  { name: "Tarjeta SD", cat: "comm", icon: "💳" },
  { name: "nRF24L01 (radio 2,4 GHz)", cat: "comm", icon: "📡" },
  { name: "MAX7219 (matriz de LEDs)", cat: "comm", icon: "🔢" },
];

// "El Rosco": una definición por letra del abecedario (27, con la Ñ). `contains`
// = la respuesta contiene esa letra (no empieza por ella). `accept` = sinónimos
// que también se dan por buenos. La corrección ignora mayúsculas, acentos y
// espacios sobrantes.
const ROSCO = [
  { letter: "A", answer: "ADC", def: "Periférico que convierte una tensión continua en un número." },
  { letter: "B", answer: "BIT", def: "Unidad mínima de información: vale 0 o 1." },
  { letter: "C", answer: "CONDENSADOR", def: "Componente que almacena carga; sirve para filtrar y desacoplar.", accept: ["capacitor"] },
  { letter: "D", answer: "DIGITAL", def: "Señal que solo toma dos valores, 0 o 1." },
  { letter: "E", answer: "EEPROM", def: "Memoria no volátil que conserva datos sin alimentación." },
  { letter: "F", answer: "FLANCO", def: "Instante en que una señal pasa de 0 a 1 o de 1 a 0.", accept: ["flanco de subida", "flanco de bajada"] },
  { letter: "G", answer: "GPIO", def: "Pines de propósito general configurables como entrada o salida." },
  { letter: "H", answer: "HEXADECIMAL", def: "Sistema de numeración en base 16 (0-9 y A-F).", accept: ["hex"] },
  { letter: "I", answer: "INTERRUPCION", def: "Evento que detiene el flujo del programa para atender algo urgente.", accept: ["interrupt", "irq"] },
  { letter: "J", answer: "JUMPER", def: "Puente que une dos pines para configurar una placa.", accept: ["puente"] },
  { letter: "K", answer: "KILO", def: "Prefijo que multiplica por mil; 1 ___ohmio = 1000 ohmios." },
  { letter: "L", answer: "LED", def: "Diodo que emite luz al pasar corriente." },
  { letter: "M", answer: "MICROCONTROLADOR", def: "Chip que integra CPU, memoria y periféricos.", accept: ["micro", "mcu"] },
  { letter: "N", answer: "NOT", def: "Puerta lógica que invierte su entrada.", accept: ["inversor", "puerta not"] },
  { letter: "Ñ", contains: true, answer: "SEÑAL", def: "Magnitud que transporta información; puede ser analógica o digital." },
  { letter: "O", answer: "OC", def: "(siglas) Módulo que genera señales PWM comparando el conteo de un timer con un valor." },
  { letter: "P", answer: "PRESCALER", def: "(en inglés) Divisor que ralentiza el reloj de un timer antes de contar.", accept: ["preescalado", "predivisor"] },
  { letter: "Q", contains: true, answer: "ARQUITECTURA", def: "Disposición interna de una CPU (Harvard, Von Neumann…)." },
  { letter: "R", answer: "RESISTENCIA", def: "Componente que limita el paso de corriente, medido en ohmios.", accept: ["resistor"] },
  { letter: "S", answer: "SPI", def: "Bus serie síncrono con líneas MOSI, MISO, SCK y SS." },
  { letter: "T", answer: "TIMER", def: "Periférico que cuenta pulsos de reloj para medir tiempo o generar eventos.", accept: ["temporizador"] },
  { letter: "U", answer: "UART", def: "Comunicación serie asíncrona (TX/RX), sin señal de reloj." },
  { letter: "V", answer: "VOLTAJE", def: "Diferencia de potencial eléctrico, medida en voltios.", accept: ["tension", "voltios"] },
  { letter: "W", contains: true, answer: "HARDWARE", def: "Parte física y tangible de un sistema (chips, placas…)." },
  { letter: "X", contains: true, answer: "MULTIPLEXOR", def: "Circuito que selecciona una de varias entradas hacia la salida.", accept: ["mux", "multiplexer"] },
  { letter: "Y", answer: "Y", def: "Puerta lógica cuya salida es 1 solo si todas sus entradas valen 1.", accept: ["and", "puerta y", "puerta and"] },
  { letter: "Z", contains: true, answer: "PIEZOELECTRICO", def: "Elemento que vibra y emite sonido al aplicarle una tensión.", accept: ["piezo", "zumbador", "buzzer"] },
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
    this.menuMode = false;  // lanzado desde un hub: al salir se vuelve a su menú
    this.menuHub = "bar";   // hub del menú actual (bar/taller) para volver al correcto
    this.menuMedals = 0;    // medallas con las que se abrió el menú
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
      rosco: () => this.startRosco(),
      clasifica: () => this.startClasifica(),
      periferico: () => this.startPeriferico(),
      disena: () => this.startDisena(),
    })[kind]();
  }

  // Menú de un hub ("bar" = recreativa, "taller" = banco de trabajo): lista sus
  // minijuegos; los que superan tu nº de medallas salen bloqueados.
  openMenu(medals = 0, hub = "bar") {
    this.teardown();
    this.active = "menu";
    this.menuMode = true;
    this.menuHub = hub;
    this.menuMedals = medals;
    this.root.classList.remove("hidden");
    const title = hub === "taller" ? "🛠️ Banco de trabajo" : "🕹️ Recreativa del bar";
    const list = GAMES.filter(g => (g.hub || "bar") === hub)
      .sort((a, b) => a.unlockAt - b.unlockAt); // ordenados por medallas necesarias
    this.body.innerHTML = `
      <div class="mg-head">
        <div class="mg-title">${title}</div>
        <div class="mg-record">🏅 ${medals}/${TOTAL_TESTS}</div>
      </div>
      <div class="mg-menu">
        ${list.map(g => {
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

  /** Minijuegos desbloqueados/total por hub: { bar:{unlocked,total}, taller:{...} }. */
  hubProgress(medals) {
    const byHub = {};
    for (const g of GAMES) {
      const h = g.hub || "bar";
      (byHub[h] = byHub[h] || { unlocked: 0, total: 0 }).total++;
      if (medals >= g.unlockAt) byHub[h].unlocked++;
    }
    return byHub;
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
      menu ? this.openMenu(this.menuMedals, this.menuHub) : this.close());
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

  // ---------- El Rosco: pasapalabra de la asignatura, contrarreloj ----------
  startRosco() {
    this.teardown();
    const DURATION = 120000; // ms
    let score = 0, idx = 0, finished = false;
    const startAt = performance.now();
    // estado por letra: "pending" (sin contestar) | "pass" (pasapalabra) | "ok" | "bad"
    const status = ROSCO.map(() => "pending");

    this.body.innerHTML = `
      <div class="mg-head">
        <div class="mg-title">🔤 El Rosco</div>
        <div class="mg-record">Récord: ${this.record("rosco")}</div>
      </div>
      <div class="mg-timebar"><div class="mg-timefill" id="mg-ro-time"></div></div>
      <div class="mg-score">Aciertos: <b id="mg-ro-score">0</b> / ${ROSCO.length}</div>
      <div class="mg-rosco-ring" id="mg-ro-ring"></div>
      <div class="mg-rosco-clue">
        <div class="mg-rosco-lead" id="mg-ro-lead"></div>
        <div class="mg-rosco-def" id="mg-ro-def"></div>
      </div>
      <div class="mg-rosco-input">
        <input id="mg-ro-in" type="text" autocomplete="off" autocapitalize="off"
               autocorrect="off" spellcheck="false" placeholder="Respuesta…" />
        <button class="mg-key mg-key-ok" id="mg-ro-ok" title="Responder">✓</button>
        <button class="mg-key mg-key-wide" id="mg-ro-pass" title="Pasapalabra">↻</button>
      </div>
      <div class="mg-hint">Enter responde · ${this.touch ? "↻ = " : "Tab = "}pasapalabra</div>`;

    const ring = document.getElementById("mg-ro-ring");
    const leadEl = document.getElementById("mg-ro-lead");
    const defEl = document.getElementById("mg-ro-def");
    const scoreEl = document.getElementById("mg-ro-score");
    const timeEl = document.getElementById("mg-ro-time");
    const input = document.getElementById("mg-ro-in");

    // letras dispuestas en anillo (el rosco), como en el concurso
    const cells = ROSCO.map((e, i) => {
      const d = document.createElement("div");
      d.className = "mg-rl";
      d.textContent = e.letter;
      const ang = (i / ROSCO.length) * 2 * Math.PI - Math.PI / 2;
      d.style.left = `calc(50% + ${Math.cos(ang) * 46}%)`;
      d.style.top = `calc(50% + ${Math.sin(ang) * 46}%)`;
      ring.appendChild(d);
      return d;
    });

    const drawRing = () => cells.forEach((d, i) => {
      d.className = "mg-rl " + status[i] + (i === idx ? " cur" : "");
    });

    // normaliza para comparar: minúsculas, sin acentos, sin espacios de más
    const norm = (s) => (s || "").toLowerCase().trim()
      .normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ");

    // siguiente letra por resolver (pending o pass), en orden circular; -1 si no queda
    const nextIndex = (from) => {
      for (let k = 1; k <= ROSCO.length; k++) {
        const j = (from + k) % ROSCO.length;
        if (status[j] === "pending" || status[j] === "pass") return j;
      }
      return -1;
    };

    const showClue = () => {
      const e = ROSCO[idx];
      leadEl.textContent = e.contains ? `Contiene la ${e.letter}` : `Empieza por ${e.letter}`;
      defEl.textContent = e.def;
      input.value = "";
      drawRing();
      input.focus();
    };

    const flash = (ok) => {
      this.body.classList.remove("mg-flash-ok", "mg-flash-bad");
      void this.body.offsetWidth;
      this.body.classList.add(ok ? "mg-flash-ok" : "mg-flash-bad");
    };

    const finish = () => {
      if (finished) return;
      finished = true;
      this.showResult("rosco", score, "Aciertos");
    };

    const advance = () => {
      const j = nextIndex(idx);
      if (j === -1) { finish(); return; } // rosco completo
      idx = j;
      showClue();
    };

    const submit = () => {
      if (finished) return;
      const guess = norm(input.value);
      if (!guess) return;
      const e = ROSCO[idx];
      const ok = [e.answer, ...(e.accept || [])].some(a => norm(a) === guess);
      status[idx] = ok ? "ok" : "bad";
      if (ok) { score++; scoreEl.textContent = score; sfx.blip(); }
      else { sfx.fail(); }
      flash(ok);
      advance();
    };

    const pass = () => {
      if (finished) return;
      status[idx] = "pass";
      sfx.step();
      // si solo quedan pasapalabras, nextIndex vuelve a ellas (se puede reintentar)
      advance();
    };

    document.getElementById("mg-ro-ok").addEventListener("click", submit);
    document.getElementById("mg-ro-pass").addEventListener("click", () => { pass(); input.focus(); });
    // el input recibe las letras de forma nativa; solo interceptamos Enter y Tab
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); submit(); }
      else if (e.key === "Tab") { e.preventDefault(); pass(); }
    });

    let raf = 0;
    const tick = (now) => {
      const remaining = Math.max(0, DURATION - (now - startAt));
      timeEl.style.width = `${(remaining / DURATION) * 100}%`;
      if (remaining <= 0) { finish(); return; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    this.cleanup = () => cancelAnimationFrame(raf);
    showClue();
  }

  // ---------- Clasifica el componente: manda cada componente a su tipo (taller) ----------
  startClasifica() {
    this.teardown();
    const DURATION = 30000; // ms
    let score = 0, current = null, raf = 0;
    const startAt = performance.now();

    const BINS = [
      { key: "digital-in",  icon: "🔘", label: "Entrada digital" },
      { key: "analog-in",   icon: "📈", label: "Entrada analógica" },
      { key: "digital-out", icon: "💡", label: "Salida digital" },
      { key: "pwm",         icon: "🎛️", label: "Salida PWM" },
      { key: "comm",        icon: "🔌", label: "Necesita UART, I2C o SPI" },
    ];

    this.body.innerHTML = `
      <div class="mg-head">
        <div class="mg-title">🧩 Clasifica el componente</div>
        <div class="mg-record">Récord: ${this.record("clasifica")}</div>
      </div>
      <div class="mg-timebar"><div class="mg-timefill" id="mg-cl-time"></div></div>
      <div class="mg-score">Puntos: <b id="mg-cl-score">0</b></div>
      <div class="mg-comp" id="mg-cl-comp"></div>
      <div class="mg-bins">
        ${BINS.map((b, i) => `
          <button class="mg-bin" data-key="${b.key}">
            <span class="mg-bin-k">${i + 1}</span>
            <span class="mg-bin-ic">${b.icon}</span>
            <span>${b.label}</span>
          </button>`).join("")}
      </div>
      <div class="mg-hint">${this.touch ? "Toca el tipo correcto" : "Teclas 1-5"} · fallar resta 2 puntos</div>`;

    const compEl = document.getElementById("mg-cl-comp");
    const scoreEl = document.getElementById("mg-cl-score");
    const timeEl = document.getElementById("mg-cl-time");
    const binEl = {};
    for (const b of BINS) binEl[b.key] = this.body.querySelector(`.mg-bin[data-key="${b.key}"]`);

    const timeouts = [];
    const flash = (key, cls) => {
      const el = binEl[key];
      if (!el) return;
      el.classList.add(cls);
      timeouts.push(setTimeout(() => el.classList.remove(cls), 300));
    };

    const next = () => {
      current = COMPONENTS[Math.floor(Math.random() * COMPONENTS.length)];
      compEl.innerHTML = `<span class="mg-comp-ic">${current.icon}</span><span class="mg-comp-name">${current.name}</span>`;
    };

    const choose = (key) => {
      if (!current) return;
      if (key === current.cat) {
        score += 1;
        sfx.blip();
        flash(key, "bin-ok");
      } else {
        score = Math.max(0, score - 2); // fallar resta 2 puntos
        sfx.fail();
        flash(key, "bin-bad");
        flash(current.cat, "bin-ok"); // resalta el cubo correcto
      }
      scoreEl.textContent = score;
      next();
    };

    for (const b of BINS) binEl[b.key].addEventListener("click", () => choose(b.key));
    this.keyHandler = (e) => {
      if (/^[1-5]$/.test(e.key)) { e.preventDefault(); choose(BINS[Number(e.key) - 1].key); }
    };

    const tick = (now) => {
      const remaining = Math.max(0, DURATION - (now - startAt));
      timeEl.style.width = `${(remaining / DURATION) * 100}%`;
      if (remaining <= 0) { this.showResult("clasifica", score, "Puntos"); return; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    this.cleanup = () => { cancelAnimationFrame(raf); for (const id of timeouts) clearTimeout(id); };
    next();
  }

  // ---------- ¿Con qué lo hago?: elige el periférico para cada necesidad (taller) ----------
  startPeriferico() {
    this.teardown();
    const DURATION = 30000; // ms
    let score = 0, current = null, options = [], raf = 0;
    const startAt = performance.now();
    const timeouts = [];

    this.body.innerHTML = `
      <div class="mg-head">
        <div class="mg-title">🧠 ¿Con qué lo hago?</div>
        <div class="mg-record">Récord: ${this.record("periferico")}</div>
      </div>
      <div class="mg-timebar"><div class="mg-timefill" id="mg-pe-time"></div></div>
      <div class="mg-score">Puntos: <b id="mg-pe-score">0</b></div>
      <div class="mg-comp" id="mg-pe-task"></div>
      <div class="mg-ab" id="mg-pe-ab"></div>
      <div class="mg-hint">${this.touch ? "Toca el periférico correcto" : "Teclas 1 / 2 (o ← →)"} · fallar resta 2 puntos</div>`;

    const taskEl = document.getElementById("mg-pe-task");
    const scoreEl = document.getElementById("mg-pe-score");
    const timeEl = document.getElementById("mg-pe-time");
    const abEl = document.getElementById("mg-pe-ab");

    const render = () => {
      taskEl.innerHTML = `<span class="mg-comp-name">${current.task}</span>`;
      abEl.innerHTML = options.map((o, i) =>
        `<button class="mg-ab-btn" data-i="${i}"><span class="mg-ab-k">${i + 1}</span><span>${o}</span></button>`).join("");
      [...abEl.querySelectorAll(".mg-ab-btn")].forEach(btn =>
        btn.addEventListener("click", () => choose(Number(btn.dataset.i))));
    };

    const next = () => {
      current = TASKS[Math.floor(Math.random() * TASKS.length)];
      options = Math.random() < 0.5 ? [current.ok, current.no] : [current.no, current.ok];
      render();
    };

    const choose = (i) => {
      if (!current) return;
      const btns = abEl.querySelectorAll(".mg-ab-btn");
      const ok = options[i] === current.ok;
      if (ok) {
        score += 1;
        sfx.blip();
        btns[i].classList.add("ok");
      } else {
        score = Math.max(0, score - 2); // fallar resta 2 puntos
        sfx.fail();
        btns[i].classList.add("bad");
        const okIdx = options.indexOf(current.ok);
        if (btns[okIdx]) btns[okIdx].classList.add("ok"); // resalta el correcto
      }
      scoreEl.textContent = score;
      // congela un instante para ver el color y pasa a la siguiente
      const frozen = current; current = null;
      timeouts.push(setTimeout(() => { if (frozen) next(); }, 260));
    };

    this.keyHandler = (e) => {
      if (e.key === "1" || e.key === "ArrowLeft") { e.preventDefault(); choose(0); }
      else if (e.key === "2" || e.key === "ArrowRight") { e.preventDefault(); choose(1); }
    };

    const tick = (now) => {
      const remaining = Math.max(0, DURATION - (now - startAt));
      timeEl.style.width = `${(remaining / DURATION) * 100}%`;
      if (remaining <= 0) { this.showResult("periferico", score, "Puntos"); return; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    this.cleanup = () => { cancelAnimationFrame(raf); for (const id of timeouts) clearTimeout(id); };
    next();
  }

  // ---------- Diseña el sistema: reparte pines y timers (taller, proyecto final) ----------
  startDisena() {
    this.teardown();
    let solved = 0, lives = 3, level = null;
    const timeouts = [];

    // Valida un reparto por REGLAS (no plantilla). Devuelve {ok, reason}.
    const validate = (lvl, get) => {
      const pins = {};                 // pin → reqId (un uso por pin)
      const timerFreq = { T2: new Set(), T3: new Set() };
      if (lvl.adcFreq) timerFreq.T3.add(lvl.adcFreq); // ADC por timer ocupa T3
      const ocGroups = { G1: 0, G2: 0, G3: 0, G4: 0 };

      for (const r of lvl.reqs) {
        if (r.need === "I2C") continue; // I2C no se remapea: sin decisión de pin
        const a = get(r.id);
        if (!a.pin) return { ok: false, reason: `Falta asignar un pin a «${r.name}».` };
        if (pins[a.pin]) return { ok: false, reason: `El pin ${a.pin} está usado dos veces (una función por pin).` };
        pins[a.pin] = r.id;
        const p = PINS[a.pin];

        if (r.need === "ADC") {
          if (!p.an) return { ok: false, reason: `${a.pin} no es analógico: el ADC necesita un pin ANx.` };
        } else if (r.need === "OC") {
          if (!p.oc) return { ok: false, reason: `${a.pin} no puede sacar una salida OC (mira la tabla de remapeo).` };
          ocGroups[OC_GROUP[p.oc]]++;
          const t = a.timer || "T2";
          timerFreq[t].add(r.freq);
        }
        // GPIO: cualquier pin vale
      }
      // canales OC por grupo (un grupo = un canal; OC4/5 = dos)
      for (const g in ocGroups) {
        if (ocGroups[g] > GROUP_CAP[g])
          return { ok: false, reason: `Demasiados OC en el mismo grupo de remapeo (${g}): no hay tantos canales.` };
      }
      // cada timer, un único periodo
      for (const t of ["T2", "T3"]) {
        if (timerFreq[t].size > 1)
          return { ok: false, reason: `${t} no puede tener dos periodos a la vez (agrupa por frecuencia o usa el otro timer).` };
      }
      return { ok: true, reason: "¡Diseño válido!" };
    };

    const render = () => {
      const pinOpts = (sel) =>
        `<option value="">—</option>` +
        level.pool.map(p => `<option value="${p}"${p === sel ? " selected" : ""}>${p}${PINS[p].an ? " ·" + PINS[p].an : ""}</option>`).join("");
      const rows = level.reqs.map(r => {
        if (r.need === "I2C")
          return `<div class="mg-des-row"><span class="mg-des-name">${r.name}</span>
            <span class="mg-des-fixed">pines fijos (no se remapea)</span></div>`;
        const tmr = r.need === "OC"
          ? `<select class="mg-des-t" data-r="${r.id}"><option value="T2">T2</option><option value="T3">T3</option></select>` : "";
        return `<div class="mg-des-row">
          <span class="mg-des-name">${r.name}</span>
          <select class="mg-des-p" data-r="${r.id}">${pinOpts("")}</select>${tmr}</div>`;
      }).join("");
      this.body.innerHTML = `
        <div class="mg-head">
          <div class="mg-title">🛠️ Diseña el sistema</div>
          <div class="mg-record">Récord: ${this.record("disena")}</div>
        </div>
        <div class="mg-score">Nivel: <b>${level.title}</b> · Resueltos: <b id="mg-de-s">${solved}</b> · ${"❤".repeat(lives) || "—"}</div>
        <div class="mg-des">${rows}</div>
        <button id="mg-de-check" class="btn btn-primary btn-small">Comprobar</button>
        <div class="mg-hint" id="mg-de-msg">Asigna cada periférico a un pin legal (y su timer). El ADC va por Timer3.</div>`;
      document.getElementById("mg-de-check").addEventListener("click", check);
    };

    const getAssign = (id) => ({
      pin: (this.body.querySelector(`.mg-des-p[data-r="${id}"]`) || {}).value || "",
      timer: (this.body.querySelector(`.mg-des-t[data-r="${id}"]`) || {}).value || "T2",
    });

    const nextLevel = () => {
      const others = DISENA_LEVELS.filter(l => l !== level);
      level = others[Math.floor(Math.random() * others.length)] || DISENA_LEVELS[0];
      render();
    };

    const check = () => {
      const res = validate(level, getAssign);
      const msg = document.getElementById("mg-de-msg");
      if (res.ok) {
        solved++;
        sfx.pass();
        msg.textContent = "✓ " + res.reason;
        this.body.classList.add("mg-flash-ok");
        timeouts.push(setTimeout(nextLevel, 900));
      } else {
        lives--;
        sfx.fail();
        this.body.classList.remove("mg-flash-bad"); void this.body.offsetWidth;
        this.body.classList.add("mg-flash-bad");
        msg.textContent = "✗ " + res.reason;
        if (lives <= 0) { timeouts.push(setTimeout(() => this.showResult("disena", solved, "Niveles"), 700)); return; }
        // refresca el marcador de vidas
        const sc = this.body.querySelector(".mg-score");
        if (sc) sc.innerHTML = `Nivel: <b>${level.title}</b> · Resueltos: <b id="mg-de-s">${solved}</b> · ${"❤".repeat(lives) || "—"}`;
      }
    };

    this.keyHandler = (e) => { if (e.key === "Enter") { e.preventDefault(); check(); } };
    this.cleanup = () => { for (const id of timeouts) clearTimeout(id); };
    level = DISENA_LEVELS[Math.floor(Math.random() * DISENA_LEVELS.length)];
    render();
  }
}
