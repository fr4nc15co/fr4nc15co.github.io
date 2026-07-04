// UI de las pruebas: multiple choice, desplegables y rellenar huecos.
// Sustituye a las pantallas testScreens/* del original con una interfaz HTML moderna.
// La corrección es la misma que en el juego original: hay que acertar TODAS
// las preguntas para superar la prueba.

import { sfx } from "./sfx.js";

const TEST_TITLES = {
  "1_programminginc": "Programación en C",
  "2_puertosEntrada": "Puertos de entrada/salida",
  "3_timers": "Temporizadores",
  "4_timersLab": "Laboratorio · Timers",
  "5_interrupciones": "Interrupciones",
  "6_interrupcionesLab": "Laboratorio · Interrupciones",
  "7_UART": "UART · Comunicación serie",
  "8_oc": "Output Compare",
  "9_examenLab": "Examen de laboratorio",
  "10_I2C": "Bus I2C",
  "11_AD": "Conversión analógico-digital",
  "12_MaqEstados": "Máquinas de estados",
  "13_ExFinal": "Examen final",
  "14_proyectoFinal": "Proyecto final · Diseño del sistema",
};

const TYPE_LABELS = { MC: "Tipo test", DD: "Elige la opción", FG: "Rellena los huecos" };

export class Quiz {
  constructor() {
    this.el = {
      root: document.getElementById("quiz"),
      tag: document.getElementById("quiz-tag"),
      title: document.getElementById("quiz-title"),
      progressLabel: document.getElementById("quiz-progress-label"),
      progressFill: document.getElementById("quiz-progress-fill"),
      question: document.getElementById("quiz-question"),
      answers: document.getElementById("quiz-answers"),
      prev: document.getElementById("quiz-prev"),
      next: document.getElementById("quiz-next"),
      dots: document.getElementById("quiz-dots"),
      quit: document.getElementById("quiz-quit"),
    };
    this.el.prev.addEventListener("click", () => this.go(-1));
    this.el.next.addEventListener("click", () => this.nextOrFinish());
    this.el.quit.addEventListener("click", () => this.abandon());
    document.addEventListener("keydown", (e) => this.onKey(e));
  }

  get active() { return !this.el.root.classList.contains("hidden"); }

  start(test, questions, onFinish, onAbandon) {
    this.test = test;
    this.questions = questions;
    this.onFinish = onFinish;
    this.onAbandon = onAbandon;
    this.index = 0;
    // respuestas del usuario: MC -> letra; DD/FG -> array de strings por hueco
    this.answers = questions.map(q =>
      q.type === "MC" ? null : new Array(q.blanks).fill(""));
    this.el.tag.textContent = `Prueba ${test.num} · ${TYPE_LABELS[test.type]}`;
    this.el.title.textContent = TEST_TITLES[test.file] || test.file;
    this.el.root.classList.remove("hidden");
    this.renderQuestion();
  }

  close() { this.el.root.classList.add("hidden"); }

  abandon() {
    this.close();
    if (this.onAbandon) this.onAbandon();
  }

  go(delta) {
    const next = this.index + delta;
    if (next < 0 || next >= this.questions.length) return;
    this.index = next;
    this.renderQuestion();
  }

  nextOrFinish() {
    if (this.index + 1 === this.questions.length) this.finish();
    else this.go(1);
  }

  finish() {
    // se pasa también el enunciado para que la pantalla de suspenso pueda
    // recordar al alumno qué preguntas falló (sin desvelar la solución)
    const results = this.questions.map((q, i) => ({
      ok: this.isCorrect(q, this.answers[i]),
      type: q.type,
      question: q.question,
    }));
    const passed = results.every(r => r.ok);
    this.close();
    this.onFinish(passed, results);
  }

  isCorrect(q, answer) {
    if (q.type === "MC") return answer !== null && answer === q.correct;
    if (q.type === "DD") return q.answers.every((a, i) => norm(answer[i]) === norm(a));
    return q.answers.every((a, i) => norm(answer[i]) === norm(a)); // FG
  }

  // ---------- render ----------

  renderQuestion() {
    const q = this.questions[this.index];
    const n = this.questions.length;

    this.el.progressLabel.textContent = `${this.index + 1} / ${n}`;
    this.el.progressFill.style.width = `${((this.index + 1) / n) * 100}%`;
    this.el.prev.disabled = this.index === 0;
    this.el.next.textContent = this.index + 1 === n ? "Terminar prueba ✓" : "Siguiente →";

    this.renderDots();

    if (q.type === "MC") {
      this.el.question.innerHTML = formatText(q.question);
      this.renderMC(q);
    } else {
      this.el.question.innerHTML = "";
      this.renderGaps(q);
    }
  }

  renderDots() {
    this.el.dots.innerHTML = "";
    this.questions.forEach((q, i) => {
      const d = document.createElement("div");
      d.className = "dot";
      if (this.hasAnswer(i)) d.classList.add("answered");
      if (i === this.index) d.classList.add("current");
      this.el.dots.appendChild(d);
    });
  }

  hasAnswer(i) {
    const q = this.questions[i];
    const a = this.answers[i];
    if (q.type === "MC") return a !== null;
    return a.every(v => v !== "");
  }

  renderMC(q) {
    this.el.answers.innerHTML = "";
    for (const opt of q.options) {
      const btn = document.createElement("button");
      btn.className = "mc-option";
      if (this.answers[this.index] === opt.letter) btn.classList.add("selected");
      btn.innerHTML =
        `<span class="mc-letter">${opt.letter || "·"}</span><span>${formatInline(opt.text)}</span>`;
      btn.addEventListener("click", () => {
        sfx.blip();
        this.answers[this.index] = opt.letter;
        this.renderQuestion();
      });
      this.el.answers.appendChild(btn);
    }
  }

  /** DD y FG: la pregunta se muestra con los huecos integrados en el texto. */
  renderGaps(q) {
    const saved = this.answers[this.index];
    const container = this.el.answers;
    container.innerHTML = "";

    const textDiv = document.createElement("div");
    textDiv.className = "gap-text";

    // huecos marcados en el texto: "____(1)" (DD) o "____" a secas (FG)
    const marker = q.type === "DD" ? /_{2,}\s*\((\d+)\)/g : /_{2,}\s*(?:\((\d+)\))?/g;
    const parts = String(q.question).split(marker);
    // split con grupo: [texto, num?, texto, num?, ...]
    const found = (String(q.question).match(marker) || []).length;

    if (found === q.blanks) {
      let blankSeq = 0;
      for (let i = 0; i < parts.length; i++) {
        if (i % 2 === 0) {
          textDiv.appendChild(spanText(parts[i]));
        } else {
          const idx = parts[i] ? Number(parts[i]) - 1 : blankSeq;
          textDiv.appendChild(this.makeGapControl(q, idx, saved));
          blankSeq++;
        }
      }
      container.appendChild(textDiv);
    } else {
      // sin marcadores fiables: texto íntegro y controles numerados debajo
      textDiv.appendChild(spanText(String(q.question)));
      container.appendChild(textDiv);
      const list = document.createElement("div");
      list.style.marginTop = "12px";
      for (let i = 0; i < q.blanks; i++) {
        const row = document.createElement("div");
        row.style.margin = "6px 0";
        const num = document.createElement("span");
        num.className = "gap-number";
        num.textContent = i + 1;
        row.appendChild(num);
        row.appendChild(this.makeGapControl(q, i, saved));
        list.appendChild(row);
      }
      container.appendChild(list);
    }
  }

  makeGapControl(q, blankIndex, saved) {
    if (q.type === "DD") {
      const sel = document.createElement("select");
      sel.className = "gap-select";
      const empty = document.createElement("option");
      empty.value = "";
      empty.textContent = `— ${blankIndex + 1} —`;
      sel.appendChild(empty);
      for (const opt of q.options) {
        const o = document.createElement("option");
        o.value = opt;
        o.textContent = opt;
        sel.appendChild(o);
      }
      sel.value = saved[blankIndex] || "";
      if (sel.value) sel.classList.add("answered");
      sel.addEventListener("change", () => {
        saved[blankIndex] = sel.value;
        sel.classList.toggle("answered", sel.value !== "");
        this.renderDots();
      });
      return sel;
    }
    const input = document.createElement("input");
    input.type = "text";
    input.className = "gap-input";
    input.placeholder = `Hueco ${blankIndex + 1}`;
    input.autocomplete = "off";
    input.spellcheck = false;
    input.value = saved[blankIndex] || "";
    if (input.value) input.classList.add("answered");
    input.addEventListener("input", () => {
      saved[blankIndex] = input.value;
      input.classList.toggle("answered", input.value.trim() !== "");
      this.renderDots();
    });
    return input;
  }

  onKey(e) {
    if (!this.active) return;
    const q = this.questions[this.index];
    // mientras se escribe en un hueco solo se atiende Enter (avanzar)
    const typing = document.activeElement &&
      ["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement.tagName);

    if (e.key === "Enter") {
      e.preventDefault();
      this.nextOrFinish();
    } else if (q.type === "MC" && !typing) {
      const k = e.key.toLowerCase();
      const byLetter = q.options.find(o => o.letter === k);
      const byNumber = /^[1-9]$/.test(k) ? q.options[Number(k) - 1] : null;
      const opt = byLetter || byNumber;
      if (opt) {
        this.answers[this.index] = opt.letter;
        this.renderQuestion();
      }
    }
  }
}

// ---------- utilidades de formato ----------

/** Compara respuestas siendo tolerante con mayúsculas y espacios. */
function norm(s) {
  return String(s ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

export function escapeHTML(s) {
  return s.replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

const CODE_HINT = /[{};]|=>|::|\b(if|else|while|for|return|void|int|uint32_t)\b/;

/** Pregunta MC: los bloques con pinta de código C van en <pre>. */
export function formatText(text) {
  const t = String(text);
  const lines = t.split("\n");
  const html = [];
  let codeBuf = [];
  const flush = () => {
    if (codeBuf.length) {
      html.push(`<pre>${escapeHTML(codeBuf.join("\n"))}</pre>`);
      codeBuf = [];
    }
  };
  for (const line of lines) {
    if (CODE_HINT.test(line)) codeBuf.push(line);
    else { flush(); html.push(escapeHTML(line)); }
  }
  flush();
  return html.join("<br>").replace(/(<br>)+(<pre>)/g, "$2").replace(/(<\/pre>)(<br>)+/g, "$1");
}

/** Opciones MC: si la opción entera parece código, se muestra monoespaciada. */
function formatInline(text) {
  const t = String(text);
  if (CODE_HINT.test(t)) return `<pre>${escapeHTML(t)}</pre>`;
  return escapeHTML(t).replace(/\n/g, "<br>");
}

function spanText(text) {
  const s = document.createElement("span");
  s.textContent = text;
  return s;
}
