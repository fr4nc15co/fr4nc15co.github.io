// Efectos de sonido chiptune generados con Web Audio (osciladores): sin
// ficheros de audio ni dependencias. El AudioContext se crea perezosamente en
// el primer sonido, que siempre llega tras un gesto del usuario (tecla/clic),
// así el navegador no lo bloquea.

let ctx = null;
let master = null;
let volume = 0.1; // mismo rango que el slider de música (0..1)
let broken = false; // sin Web Audio: los efectos se ignoran en silencio

function ensureCtx() {
  if (broken) return null;
  try {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = masterGain(volume);
      master.connect(ctx.destination);
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  } catch {
    broken = true;
    return null;
  }
}

// Los beeps de oscilador suenan flojos comparados con música masterizada al
// mismo volumen; se compensa para que el slider gobierne ambos por igual.
function masterGain(v) {
  return Math.min(1, v * 2.5);
}

export function setSfxVolume(v) {
  volume = v;
  if (master) master.gain.value = masterGain(v);
}

/** Una nota: freq en Hz, dur en segundos, `at` retrasa el inicio (para arpegios). */
function tone(freq, dur, { type = "square", at = 0, gain = 0.2, slide = 0 } = {}) {
  const c = ensureCtx();
  if (!c || volume === 0) return;
  try {
    const t0 = c.currentTime + at;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(freq + slide, 30), t0 + dur);
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(g).connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  } catch { /* un beep fallido nunca debe romper el juego */ }
}

export const sfx = {
  /** Paso sobre una casilla: tic corto y grave. */
  step() { tone(150, 0.045, { type: "triangle", gain: 0.3, slide: -60 }); },
  /** Avanzar diálogo / elegir respuesta. */
  blip() { tone(880, 0.06, { gain: 0.15 }); },
  /** Prueba superada: arpegio ascendente. */
  pass() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.14, { at: i * 0.09 })); },
  /** Prueba suspendida (se pierde una vida). */
  fail() {
    tone(330, 0.16, { gain: 0.22 });
    tone(233, 0.3, { at: 0.15, gain: 0.22, slide: -60 });
  },
  /** Sin vidas: bajada larga. */
  gameover() { [392, 330, 262, 196].forEach((f, i) => tone(f, 0.22, { at: i * 0.17 })); },
  /** Victoria final: fanfarria. */
  win() { [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, 0.16, { at: i * 0.11 })); },
};
