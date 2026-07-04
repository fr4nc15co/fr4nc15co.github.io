// Carga y normalización de los datos del juego (tests, preguntas y NPCs).
// Los JSON provienen del juego libGDX original, ya saneados a JSON estricto.

async function loadJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`No se pudo cargar ${url} (${res.status})`);
  return res.json();
}

/** Lista de pruebas: [{num, type, file, key}] indexable por número de prueba. */
export async function loadTests() {
  const raw = await loadJSON("assets/questions/tests.json");
  const tests = new Map();
  for (const t of raw) {
    tests.set(t.TestNum, { num: t.TestNum, type: t.TestType, file: t.FileName, key: t.Key });
  }
  return tests;
}

/** Preguntas de una prueba, normalizadas según su tipo (MC, DD o FG). */
export async function loadQuestions(test) {
  const raw = await loadJSON(`assets/questions/${test.file}.json`);

  if (test.type === "MC") {
    return raw.map(q => {
      const options = [];
      for (let i = 1; i <= 4; i++) {
        const text = q[`OPCION ${i}`];
        if (text !== undefined && String(text).trim() !== "") {
          options.push(splitLetter(String(text)));
        }
      }
      return {
        type: "MC",
        question: String(q.PREGUNTA),
        options,                                   // [{letter, text}]
        correct: String(q.CORRECTA).trim().charAt(0).toLowerCase(),
      };
    });
  }

  if (test.type === "DD") {
    return raw.map(q => {
      const nOptions = Number(q.OPCIONES);
      const nBlanks = Number(q.HUECOS);
      const options = [];
      for (let i = 0; i < nOptions; i++) {
        const key = `OPCION ${String.fromCharCode(65 + i)}`; // OPCION A, B, C...
        if (q[key] !== undefined) options.push(String(q[key]));
      }
      const answers = [];
      for (let i = 1; i <= nBlanks; i++) answers.push(String(q[`ENTRADA ${i}`]));
      return { type: "DD", question: String(q.PREGUNTA), options, answers, blanks: nBlanks };
    });
  }

  // FG: rellenar huecos escribiendo
  return raw.map(q => {
    const nBlanks = Number(q.HUECOS);
    const answers = [];
    for (let i = 1; i <= nBlanks; i++) answers.push(String(q[`RESPUESTA ${i}`]));
    return { type: "FG", question: String(q.PREGUNTA), answers, blanks: nBlanks };
  });
}

/** Separa el prefijo de letra de una opción MC: "a. texto" -> {letter:"a", text:"texto"}. */
function splitLetter(text) {
  const m = text.match(/^\s*([a-dA-D])[.)]\s*(.*)$/s);
  if (m) return { letter: m[1].toLowerCase(), text: m[2] };
  return { letter: "", text };
}

/**
 * NPCs del mapa. Los de prueba salen de people.json; los secundarios estaban
 * definidos en código en el original (ReadPeople.java) y se replican aquí.
 * Coordenadas en casillas, con el eje Y hacia arriba como en libGDX.
 */
export async function loadPeople() {
  const raw = await loadJSON("assets/data/people.json");
  const npcs = raw.map(p => ({
    test: p.Prueba,
    name: p.Nombre,
    x: p["Coordenada X"],
    y: p["Coordenada Y"],
    dialog: cleanDialog(p["Personaje de la prueba"]),
    restDialog: p["El resto de personajes"],
    sprite: `assets/people/npc/prueba${p.Prueba}.png`,
    portrait: `assets/people/retratos/prueba${p.Prueba}.png`,
  }));

  const extra = [
    { name: "Zipi", x: 91, y: 19, dialog: "¿Un reto rápido mientras te pongo el café?\nTe enseño un número en binario y me lo cantas en hexadecimal.\nA ver cuántos aciertas en 20 segundos." },
    { name: "Zape", x: 91, y: 15, dialog: "¿Jugamos a la memoria?\nTe marco una secuencia de LEDs y la repites; cada ronda uno más.\n¿Hasta dónde llegas?" },
    { name: "Pau",  x: 89, y: 7,  dialog: "Yo soy de ICADE, ¡no sé de micros! Busca a otro." },
  ];
  for (const e of extra) {
    npcs.push({
      test: null,
      name: e.name,
      x: e.x, y: e.y,
      dialog: e.dialog,
      restDialog: null,
      sprite: `assets/people/npc/${e.name}.png`,
      portrait: `assets/people/retratos/${e.name}.png`,
    });
  }

  // Recreativa del bar: objeto interactivo (no persona) que abre el menú de
  // minijuegos. `arcade: true` hace que main.js abra el menú en vez de un diálogo.
  npcs.push({
    test: null,
    name: "Recreativa",
    arcade: true,
    x: 87, y: 10, // a la izquierda según entras al bar, cerca de Pau (89,7)
    dialog: null,
    restDialog: null,
    sprite: "assets/people/npc/arcade.png",
    portrait: null,
  });

  // Banco de trabajo del taller: menú de minijuegos de clasificar componentes.
  // `taller: true` hace que main.js abra su menú (openTaller) en vez de un diálogo.
  npcs.push({
    test: null,
    name: "Banco de trabajo",
    taller: true,
    x: 50, y: 53,
    dialog: null,
    restDialog: null,
    sprite: "assets/people/npc/taller.png",
    portrait: null,
  });

  return npcs;
}

/** Quita del diálogo las líneas "ENTER para..." / "ESC para...": la UI ya muestra botones. */
function cleanDialog(text) {
  return String(text)
    .split("\n")
    .filter(l => !/^\s*(ENTER|ESC)\s+para/i.test(l))
    .join("\n")
    .trim();
}

/** Rejilla de colisiones extraída de la capa "Colisiones" del TMX original. */
export async function loadCollisions() {
  const data = await loadJSON("assets/map/collisions.json");
  return {
    width: data.width,
    height: data.height,
    // (x, y) en coordenadas de mundo (Y hacia arriba). Fuera del mapa se bloquea.
    blocked(x, y) {
      if (x < 0 || y < 0 || x >= data.width || y >= data.height) return true;
      return data.rows[data.height - 1 - y][x] === "1";
    },
  };
}

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`No se pudo cargar la imagen ${src}`));
    img.src = src;
  });
}
