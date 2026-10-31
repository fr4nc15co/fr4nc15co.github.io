/*
 * Componente "sim-fetch-execute": ciclo de instrucción (fetch / execute) del micro
 * HIPOTÉTICO del capítulo 6 (instrucciones de 16 bits; no es el dsPIC).
 * Reproduce el ejemplo 6.3.6 y las figuras 46-50 del libro:
 *   0x0000 0x2800 move 0x80, W0   ; W0 <- (0x80)
 *   0x0002 0x2821 move 0x82, W1   ; W1 <- (0x82)
 *   0x0004 0x1001 add  W0, W1     ; W1 <- W0 + W1
 *   0x0006 0x3184 move W1, 0x84   ; (0x84) <- W1
 *   datos (0x80) = 7, (0x82) = 3, (0x84) = 0
 *   Traza: F1 IR=0x2800 PC=0x0002 · E1 W0=7 · F2 IR=0x2821 PC=0x0004 · E2 W1=3 ·
 *          F3 IR=0x1001 PC=0x0006 · E3 W1=0x000A · F4 IR=0x3184 PC=0x0008 · E4 (0x84)=0x000A
 *
 * Codificación (código en los bits 15-12):
 *   1 add Wx, Wy   : 7-4 Wx (origen), 3-0 Wy (destino)       Wy <- Wx + Wy
 *   2 move mem, Wx : 11-4 mem, 3-0 Wx (destino)              Wx <- (mem)
 *   3 move Wx, mem : 11-8 Wx (origen), 7-0 mem               (mem) <- Wx
 *
 * Uso: <div class="mpi-mount" data-componente="sim-fetch-execute"
 *           data-config='{"programa":[{"dir":"0x0000","asm":"move 0x80, W0","hex":"0x2800"}],
 *                         "datos":{"0x80":7},"incrementoPC":2}'></div>
 *
 * Claves de data-config (todas opcionales; por defecto, el ejemplo del libro):
 *   programa      [{dir, hex, asm}]  memoria de programa (asm opcional: si falta se decodifica hex)
 *   datos         {"0x80": 7, …}     memoria de datos inicial (palabras de 16 bits)
 *   incrementoPC  avance del PC en cada fetch (defecto 2: cada instrucción ocupa dos celdas de 8 bits)
 *   pcInicial     valor inicial del PC (defecto: dirección de la primera instrucción)
 *   intervalo     ms entre fases en «Ejecutar todo» (defecto 1100)
 */
window.MPI = window.MPI || {};
MPI.componentes = MPI.componentes || {};

(function () {
  var uid = 0;

  var PROGRAMA_LIBRO = [
    { dir: '0x0000', asm: 'move 0x80, W0', hex: '0x2800' },
    { dir: '0x0002', asm: 'move 0x82, W1', hex: '0x2821' },
    { dir: '0x0004', asm: 'add W0, W1', hex: '0x1001' },
    { dir: '0x0006', asm: 'move W1, 0x84', hex: '0x3184' }
  ];
  var DATOS_LIBRO = { '0x80': 7, '0x82': 3, '0x84': 0 };

  function hx(v, n) {
    var s = (v >>> 0).toString(16).toUpperCase();
    while (s.length < (n || 4)) s = '0' + s;
    return '0x' + s;
  }
  function bin(v, n) {
    var s = (v >>> 0).toString(2);
    while (s.length < n) s = '0' + s;
    return s;
  }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function num(v, def) {
    if (typeof v === 'number' && isFinite(v)) return Math.round(v);
    if (typeof v === 'string') {
      var t = v.trim();
      if (/^0x[0-9a-f]+$/i.test(t)) return parseInt(t, 16);
      if (/^-?\d+$/.test(t)) return parseInt(t, 10);
    }
    return def;
  }

  // ---------------- Decodificación (misma que decod-instruccion-16) ----------------
  function decod(w) {
    var op = (w >> 12) & 0xF;
    var d = { op: op, w: w };
    if (op === 1) {
      d.tipo = 'alu'; d.rs = (w >> 4) & 0xF; d.rd = w & 0xF;
      d.asm = 'add W' + d.rs + ', W' + d.rd;
      d.asmHtml = '<span class="di16-f-op">add</span> <span class="di16-f-ro">W' + d.rs + '</span>, <span class="di16-f-rd">W' + d.rd + '</span>';
      d.sem = 'W' + d.rd + ' ← W' + d.rs + ' + W' + d.rd;
      d.formato = 'add Wx, Wy';
      d.campos = [
        { hi: 15, lo: 12, cls: 'di16-f-op', nom: 'código', val: '1' },
        { hi: 11, lo: 8, cls: 'di16-f-nu', nom: 'sin uso', val: '0' },
        { hi: 7, lo: 4, cls: 'di16-f-ro', nom: 'Wx', val: 'W' + d.rs },
        { hi: 3, lo: 0, cls: 'di16-f-rd', nom: 'Wy', val: 'W' + d.rd }
      ];
    } else if (op === 2) {
      d.tipo = 'lee'; d.mem = (w >> 4) & 0xFF; d.rd = w & 0xF;
      d.asm = 'move ' + hx(d.mem, 2) + ', W' + d.rd;
      d.asmHtml = '<span class="di16-f-op">move</span> <span class="di16-f-mem">' + hx(d.mem, 2) + '</span>, <span class="di16-f-rd">W' + d.rd + '</span>';
      d.sem = 'W' + d.rd + ' ← (' + hx(d.mem, 2) + ')';
      d.formato = 'move mem, Wx';
      d.campos = [
        { hi: 15, lo: 12, cls: 'di16-f-op', nom: 'código', val: '2' },
        { hi: 11, lo: 4, cls: 'di16-f-mem', nom: 'mem', val: hx(d.mem, 2) },
        { hi: 3, lo: 0, cls: 'di16-f-rd', nom: 'Wx', val: 'W' + d.rd }
      ];
    } else if (op === 3) {
      d.tipo = 'escribe'; d.rs = (w >> 8) & 0xF; d.mem = w & 0xFF;
      d.asm = 'move W' + d.rs + ', ' + hx(d.mem, 2);
      d.asmHtml = '<span class="di16-f-op">move</span> <span class="di16-f-ro">W' + d.rs + '</span>, <span class="di16-f-mem">' + hx(d.mem, 2) + '</span>';
      d.sem = '(' + hx(d.mem, 2) + ') ← W' + d.rs;
      d.formato = 'move Wx, mem';
      d.campos = [
        { hi: 15, lo: 12, cls: 'di16-f-op', nom: 'código', val: '3' },
        { hi: 11, lo: 8, cls: 'di16-f-ro', nom: 'Wx', val: 'W' + d.rs },
        { hi: 7, lo: 0, cls: 'di16-f-mem', nom: 'mem', val: hx(d.mem, 2) }
      ];
    } else {
      d.tipo = 'desconocida';
      d.asm = '¿código ' + op + '?';
      d.asmHtml = '<span class="sfe-error">código ' + op + ' desconocido</span>';
      d.sem = '';
      d.formato = '';
      d.campos = [
        { hi: 15, lo: 12, cls: 'di16-f-op', nom: 'código', val: String(op) },
        { hi: 11, lo: 0, cls: 'di16-f-nu', nom: '¿?', val: hx(w & 0xFFF, 3) }
      ];
    }
    return d;
  }

  // ---------------- Máquina ----------------
  function prepararPrograma(lista) {
    var prog = [], vistos = {};
    (Array.isArray(lista) && lista.length ? lista : PROGRAMA_LIBRO).forEach(function (p, i) {
      var w = num(p && p.hex, null);
      if (w == null || w < 0 || w > 0xFFFF) return;
      var dir = num(p.dir, null);
      if (dir == null) dir = prog.length ? prog[prog.length - 1].dir + 2 : 0;
      dir &= 0xFFFF;
      if (vistos[dir]) return;
      vistos[dir] = 1;
      prog.push({ dir: dir, hex: w, asm: (p.asm ? String(p.asm) : decod(w).asm) });
    });
    if (!prog.length) return prepararPrograma(PROGRAMA_LIBRO);
    prog.sort(function (a, b) { return a.dir - b.dir; });
    return prog;
  }
  function prepararDatos(obj) {
    var m = {};
    var src = (obj && typeof obj === 'object') ? obj : DATOS_LIBRO;
    Object.keys(src).forEach(function (k) {
      var a = num(k, null), v = num(src[k], null);
      if (a == null || v == null) return;
      m[a & 0xFFFF] = v & 0xFFFF;
    });
    return m;
  }

  function Maquina(cfg) {
    this.prog = prepararPrograma(cfg.programa);
    this.porDir = {};
    var self = this;
    this.prog.forEach(function (p) { self.porDir[p.dir] = p; });
    this.datos0 = prepararDatos(cfg.datos);
    var inc = num(cfg.incrementoPC, 2);
    this.inc = inc >= 1 && inc <= 8 ? inc : 2;
    var pc0 = num(cfg.pcInicial, null);
    this.pc0 = pc0 == null ? this.prog[0].dir : pc0 & 0xFFFF;
  }
  Maquina.prototype.nuevo = function () {
    var st = { pc: this.pc0, ir: null, dirIR: null, w: [], mem: {}, fase: 'fetch', instr: 0, halt: false, motivo: '' };
    for (var i = 0; i < 16; i++) st.w.push(0);
    for (var k in this.datos0) st.mem[k] = this.datos0[k];
    if (!this.porDir[st.pc]) { st.halt = true; st.motivo = 'El PC (' + hx(st.pc) + ') no apunta a ninguna instrucción.'; }
    return st;
  };
  // Ejecuta una fase y devuelve el evento que describe lo que ha pasado.
  Maquina.prototype.fase = function (st) {
    var ev, d, inc = this.inc;
    if (st.halt) return null;
    if (st.fase === 'fetch') {
      var ins = this.porDir[st.pc];
      var pcA = st.pc;
      st.ir = ins.hex;
      st.dirIR = pcA;
      st.pc = (st.pc + inc) & 0xFFFF;
      st.fase = 'execute';
      st.instr++;
      d = decod(st.ir);
      ev = {
        fase: 'fetch', n: st.instr, d: d, pcAntes: pcA, pc: st.pc, ir: st.ir,
        bus: { mem: 'prog', dir: pcA, dato: st.ir, ctrl: 'RD', sentido: 'lee' },
        cambia: { pc: 1, ir: 1, w: {}, mem: {} }, fila: pcA
      };
      ev.texto =
        '<strong>Fetch de la instrucción ' + st.instr + '</strong> (búsqueda)' +
        '<ol class="sfe-pasos">' +
          '<li>El <code>PC</code> contiene la dirección de la próxima instrucción, <code>' + hx(pcA) + '</code>: la CPU la pone en el <span class="sfe-t-dir">bus de direcciones</span> y activa <span class="sfe-t-ctrl">RD</span>.</li>' +
          '<li>La memoria de programa entrega por el <span class="sfe-t-dat">bus de datos</span> los 16 bits de las celdas ' + hx(pcA) + ' y ' + hx(pcA + 1) + ': <code>' + hx(st.ir) + '</code>.</li>' +
          '<li>La instrucción se carga en el registro de instrucción: <strong>IR = ' + hx(st.ir) + '</strong>.</li>' +
          '<li>El PC se incrementa en ' + inc + ': ' + hx(pcA) + ' + ' + inc + ' = <strong>PC = ' + hx(st.pc) + '</strong> (ya apunta a la siguiente).</li>' +
          '<li>Decodificación: ' + (d.tipo === 'desconocida'
            ? 'el código ' + d.op + ' (bits 15-12) <strong>no corresponde a ninguna instrucción</strong>.'
            : 'código ' + d.op + ' → <code>' + esc(d.formato) + '</code>; con los campos sale <code>' + d.asmHtml + '</code>, es decir, ' + esc(d.sem) + '.') + '</li>' +
        '</ol>';
      return ev;
    }
    // execute
    d = decod(st.ir);
    st.fase = 'fetch';
    ev = { fase: 'execute', n: st.instr, d: d, pc: st.pc, ir: st.ir, bus: null, alu: null, cambia: { w: {}, mem: {} }, fila: null };
    var pre = '<strong>Execute de la instrucción ' + st.instr + '</strong>: <code>' + d.asmHtml + '</code> — ';
    if (d.tipo === 'lee') {
      var existe = Object.prototype.hasOwnProperty.call(st.mem, d.mem);
      var v = existe ? st.mem[d.mem] : 0;
      if (!existe) st.mem[d.mem] = 0;
      st.w[d.rd] = v;
      ev.bus = { mem: 'datos', dir: d.mem, dato: v, ctrl: 'RD', sentido: 'lee' };
      ev.cambia.w[d.rd] = 1; ev.leido = d.mem;
      ev.texto = pre + 'transferencia de <em>memoria a procesador</em>. La CPU pone <code>' + hx(d.mem, 2) + '</code> en el <span class="sfe-t-dir">bus de direcciones</span> y activa <span class="sfe-t-ctrl">RD</span>; ' +
        'la memoria de datos entrega <code>' + hx(v) + '</code> por el <span class="sfe-t-dat">bus de datos</span> y la CPU lo guarda en W' + d.rd + ': ' +
        '<strong>W' + d.rd + ' ← (' + hx(d.mem, 2) + ') = ' + v + '</strong>.' + (existe ? '' : ' (Esa dirección no tenía dato inicial: se toma 0.)');
    } else if (d.tipo === 'alu') {
      var a = st.w[d.rs], b = st.w[d.rd], suma = a + b, r = suma & 0xFFFF;
      st.w[d.rd] = r;
      ev.alu = { rs: d.rs, rd: d.rd, a: a, b: b, r: r, acarreo: suma > 0xFFFF };
      ev.cambia.w[d.rd] = 1;
      ev.texto = pre + '<em>procesado de datos</em>. No hay acceso a memoria: la ALU suma W' + d.rs + ' + W' + d.rd + ' = ' + a + ' + ' + b + ' = ' + (r) +
        ' y deja el resultado en el registro destino: <strong>W' + d.rd + ' = ' + hx(r) + '</strong>.' + (ev.alu.acarreo ? ' El resultado no cabe en 16 bits: se pierde el acarreo.' : '');
    } else if (d.tipo === 'escribe') {
      var x = st.w[d.rs];
      st.mem[d.mem] = x;
      ev.bus = { mem: 'datos', dir: d.mem, dato: x, ctrl: 'WR', sentido: 'escribe' };
      ev.cambia.mem[d.mem] = 1;
      ev.texto = pre + 'transferencia de <em>procesador a memoria</em>. La CPU pone <code>' + hx(d.mem, 2) + '</code> en el <span class="sfe-t-dir">bus de direcciones</span>, ' +
        'el contenido de W' + d.rs + ' (<code>' + hx(x) + '</code>) en el <span class="sfe-t-dat">bus de datos</span> y activa <span class="sfe-t-ctrl">WR</span>: ' +
        '<strong>(' + hx(d.mem, 2) + ') ← W' + d.rs + ' = ' + hx(x) + '</strong> (' + x + ').';
    } else {
      st.halt = true;
      st.motivo = 'Código de operación desconocido (' + d.op + ') en IR = ' + hx(st.ir) + ': la CPU no sabe ejecutarlo y se detiene.';
      ev.texto = pre + '<span class="sfe-error">' + esc(st.motivo) + '</span>';
      return ev;
    }
    ev.texto += ' Mientras se ejecutaba, el PC ya valía ' + hx(st.pc) + ' (se incrementó en el fetch).';
    if (!this.porDir[st.pc]) {
      st.halt = true;
      st.motivo = 'El PC (' + hx(st.pc) + ') ya no apunta a ninguna instrucción del programa: fin (HALT).';
      ev.texto += '<br><strong>Fin del programa.</strong> ' + esc(st.motivo);
    }
    return ev;
  };
  // Estado tras n fases desde el reinicio.
  Maquina.prototype.tras = function (n) {
    var st = this.nuevo(), evs = [];
    for (var i = 0; i < n && !st.halt; i++) evs.push(this.fase(st));
    return { st: st, evs: evs };
  };
  Maquina.prototype.totalFases = function () {
    var st = this.nuevo(), n = 0;
    while (!st.halt && n < 400) { this.fase(st); n++; }
    return n;
  };

  // ---------------- Componente ----------------
  MPI.componentes['sim-fetch-execute'] = function (el, cfg) {
    cfg = cfg || {};
    var id = 'sfe' + (++uid);
    var M = new Maquina(cfg);
    var total = M.totalFases();
    var intervalo = num(cfg.intervalo, 1100);
    if (!(intervalo >= 200 && intervalo <= 10000)) intervalo = 1100;
    var n = 0, timer = null;

    // Registros a mostrar: W0, W1 y los que use el programa.
    var regs = { 0: 1, 1: 1 };
    var escritas = {};
    M.prog.forEach(function (p) {
      var d = decod(p.hex);
      if (d.rs != null) regs[d.rs] = 1;
      if (d.rd != null) regs[d.rd] = 1;
      if (d.tipo === 'escribe') escritas[d.mem] = 1;
    });
    var listaRegs = Object.keys(regs).map(Number).sort(function (a, b) { return a - b; });
    var listaEscritas = Object.keys(escritas).map(Number).sort(function (a, b) { return a - b; });
    var ultimaDir = M.prog[M.prog.length - 1].dir + M.inc;

    el.classList.add('mpi-sim-fetch-execute');
    el.innerHTML =
      '<div class="mpi-sim-cab">Ciclo de instrucción: fetch y execute <span class="sfe-sub">micro hipotético · instrucciones de 16 bits</span></div>' +
      '<div class="sfe-ciclo" aria-hidden="true">' +
        '<span class="sfe-et" data-et="start">START</span><span class="sfe-fl">→</span>' +
        '<span class="sfe-et" data-et="fetch">Fetch</span><span class="sfe-fl">→</span>' +
        '<span class="sfe-et" data-et="execute">Execute</span><span class="sfe-fl sfe-vuelta" title="vuelve a Fetch">↺</span><span class="sfe-fl">→</span>' +
        '<span class="sfe-et" data-et="halt">HALT</span>' +
      '</div>' +
      '<div class="sfe-controles" role="group" aria-label="Controles de ejecución">' +
        '<button type="button" class="sfe-b-fetch">Fetch</button>' +
        '<button type="button" class="sfe-b-exec">Execute</button>' +
        '<button type="button" class="sfe-b-paso">Paso ▶</button>' +
        '<button type="button" class="sfe-b-atras">◀ Atrás</button>' +
        '<button type="button" class="sfe-b-todo">Ejecutar todo</button>' +
        '<button type="button" class="sfe-b-reset">Reiniciar</button>' +
        '<span class="sfe-contador"></span>' +
      '</div>' +
      '<div class="sfe-expl" id="' + id + '-ex" aria-live="polite"></div>' +
      '<div class="sfe-bus" aria-hidden="true"></div>' +
      '<div class="sfe-cuerpo">' +
        '<section class="sfe-panel sfe-prog" aria-label="Memoria de programa"><h4 class="sfe-tit">Memoria de programa</h4><div class="sfe-prog-in"></div>' +
          '<p class="sfe-nota">Cada instrucción ocupa 16 bits = <strong>2 celdas</strong> de 8 bits; por eso el PC avanza de ' + M.inc + ' en ' + M.inc + '.</p></section>' +
        '<section class="sfe-panel sfe-cpu" aria-label="CPU"><h4 class="sfe-tit">CPU</h4><div class="sfe-cpu-in"></div></section>' +
        '<section class="sfe-panel sfe-datos" aria-label="Memoria de datos"><h4 class="sfe-tit">Memoria de datos</h4><div class="sfe-datos-in"></div></section>' +
      '</div>' +
      '<details class="sfe-traza" open><summary>Traza (como la tabla del libro)</summary><div class="sfe-traza-in" tabindex="0" role="region" aria-label="Traza de la ejecución"></div></details>';

    function $(s) { return el.querySelector(s); }

    function retardo(s) { return ' style="animation-delay:' + s + 's"'; }

    function pintarBus(ev) {
      var W = 340, H = 150, x1 = 66, x2 = 252;
      var b = ev && ev.bus;
      var memNom = b ? (b.mem === 'prog' ? 'programa' : 'datos') : (ev && ev.fase === 'fetch' ? 'programa' : 'datos');
      var lineas = [
        { y: 46, cls: 'dir', nom: 'Bus de direcciones', val: b ? (b.mem === 'prog' ? hx(b.dir) : hx(b.dir, 2)) : '', izq: false, t: 0 },
        { y: 84, cls: 'dat', nom: 'Bus de datos', val: b ? hx(b.dato) : '', izq: b && b.sentido === 'lee', t: b && b.sentido === 'lee' ? 0.35 : 0.2 },
        { y: 122, cls: 'ctrl', nom: 'Bus de control', val: b ? b.ctrl : '', izq: false, t: b && b.sentido === 'lee' ? 0.15 : 0.3 }
      ];
      var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="sfe-svg" role="img" aria-label="Buses">' +
        '<defs>' + ['dir', 'dat', 'ctrl'].map(function (c) {
          return '<marker id="' + id + '-mk-' + c + '" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0,0 L10,5 L0,10 z" class="sfe-mk-' + c + '"/></marker>';
        }).join('') + '</defs>' +
        '<rect x="4" y="14" width="' + (x1 - 4) + '" height="124" rx="6" class="sfe-caja sfe-caja-cpu' + (ev && ev.alu ? ' sfe-caja-on' : '') + '"/>' +
        '<text x="' + ((x1 + 4) / 2) + '" y="72" class="sfe-caja-t">CPU</text>' +
        (ev && ev.alu ? '<text x="' + ((x1 + 4) / 2) + '" y="90" class="sfe-caja-s">ALU</text>' : '') +
        '<rect x="' + x2 + '" y="14" width="' + (W - 4 - x2) + '" height="124" rx="6" class="sfe-caja' + (b ? ' sfe-caja-on' : '') + '"/>' +
        '<text x="' + ((x2 + W - 4) / 2) + '" y="66" class="sfe-caja-t">Memoria</text>' +
        '<text x="' + ((x2 + W - 4) / 2) + '" y="82" class="sfe-caja-s">de ' + memNom + '</text>';
      lineas.forEach(function (l) {
        var on = !!b;
        var xa = l.izq ? x2 : x1, xb = l.izq ? x1 + 2 : x2 - 2;
        s += '<text x="' + (x1 + 6) + '" y="' + (l.y - 11) + '" class="sfe-bus-n">' + l.nom + '</text>';
        s += '<line x1="' + xa + '" y1="' + l.y + '" x2="' + xb + '" y2="' + l.y + '" class="sfe-ln sfe-ln-' + l.cls + (on ? ' sfe-ln-on' : '') + '"' +
          (on ? ' marker-end="url(#' + id + '-mk-' + l.cls + ')"' + retardo(l.t) : '') + '/>';
        if (on) {
          var cx = (x1 + x2) / 2 + 26, w = l.val.length * 7.4 + 14;
          s += '<g class="sfe-pill sfe-pill-' + l.cls + '"' + retardo(l.t) + '><rect x="' + (cx - w / 2) + '" y="' + (l.y - 8) + '" width="' + w + '" height="16" rx="8"/>' +
            '<text x="' + cx + '" y="' + (l.y + 4) + '">' + esc(l.val) + '</text></g>';
        }
      });
      if (!b) {
        s += '<text x="' + ((x1 + x2) / 2) + '" y="' + (H - 4) + '" class="sfe-bus-reposo">' +
          (ev && ev.alu ? 'Sin acceso a memoria: opera la ALU dentro de la CPU' : 'Buses en reposo') + '</text>';
      }
      $('.sfe-bus').innerHTML = s + '</svg>';
    }

    function pintar() {
      var r = M.tras(n), st = r.st, ev = r.evs[r.evs.length - 1] || null;
      var corriendo = !!timer;

      // Ciclo START → Fetch → Execute → HALT
      var actual = st.halt ? 'halt' : (ev ? ev.fase : 'start');
      var ets = el.querySelectorAll('.sfe-et');
      for (var i = 0; i < ets.length; i++) {
        var e = ets[i].getAttribute('data-et');
        ets[i].classList.toggle('sfe-et-on', e === actual || (st.halt && ev && e === ev.fase));
        ets[i].classList.toggle('sfe-et-sig', !st.halt && e === st.fase);
      }

      // Botones
      $('.sfe-b-fetch').disabled = corriendo || st.halt || st.fase !== 'fetch';
      $('.sfe-b-exec').disabled = corriendo || st.halt || st.fase !== 'execute';
      $('.sfe-b-paso').disabled = corriendo || st.halt;
      $('.sfe-b-atras').disabled = corriendo || n === 0;
      $('.sfe-b-todo').disabled = !corriendo && st.halt;
      $('.sfe-b-todo').textContent = corriendo ? 'Detener' : 'Ejecutar todo';
      $('.sfe-b-todo').setAttribute('aria-pressed', corriendo ? 'true' : 'false');
      $('.sfe-contador').textContent = 'Fase ' + n + ' de ' + total + (st.halt ? ' · fin' : ' · siguiente: ' + (st.fase === 'fetch' ? 'Fetch' : 'Execute'));

      // Explicación
      $('.sfe-expl').innerHTML = ev ? ev.texto
        : 'Programa cargado en la memoria de programa a partir de <code>' + hx(M.prog[0].dir) + '</code>. Para ejecutarlo se pone <strong>PC = ' + hx(st.pc) + '</strong>. ' +
          (st.halt ? '<span class="sfe-error">' + esc(st.motivo) + '</span>' : 'Pulsa <strong>Fetch</strong> (o <strong>Paso</strong>) para buscar la primera instrucción.');

      // Memoria de programa
      var hp = '<div class="sfe-tabla-wrap"><table class="sfe-tabla"><thead><tr><th scope="col">Dir.</th><th scope="col">Celdas</th><th scope="col">Instrucción</th><th scope="col"><span class="sfe-oculto">PC</span></th></tr></thead><tbody>';
      var filas = M.prog.slice();
      if (!M.porDir[ultimaDir]) filas.push({ dir: ultimaDir, vacia: true });
      if (!M.porDir[st.pc] && st.pc !== ultimaDir) filas.push({ dir: st.pc, vacia: true });
      filas.forEach(function (p) {
        var esPC = p.dir === st.pc;
        var enIR = !p.vacia && st.dirIR === p.dir;
        var cls = (enIR ? 'sfe-en-ir' : '') + (ev && ev.fase === 'fetch' && ev.fila === p.dir ? ' sfe-leida' : '');
        hp += '<tr class="' + cls + '"><th scope="row">' + hx(p.dir) + '</th>';
        if (p.vacia) hp += '<td class="sfe-vacia" colspan="2">— (sin instrucción)</td>';
        else hp += '<td class="sfe-celdas"><span>' + hx(p.hex >> 8, 2).slice(2) + '</span><span>' + hx(p.hex & 0xFF, 2).slice(2) + '</span></td><td class="sfe-asm">' + esc(p.asm) + '</td>';
        hp += '<td class="sfe-marca">' + (esPC ? '<span class="sfe-pc-tag"><span aria-hidden="true">◀ </span>PC</span>' : '') + '</td></tr>';
      });
      $('.sfe-prog-in').innerHTML = hp + '</tbody></table></div>';

      // CPU
      var esFetch = ev && ev.fase === 'fetch', esExec = ev && ev.fase === 'execute';
      var d = st.ir != null ? decod(st.ir) : null;
      var hc = '<div class="sfe-regs">' +
        '<div class="sfe-reg' + (esFetch ? ' sfe-cambio' : '') + '"' + (esFetch ? retardo(1.05) : '') + '><span class="sfe-rn">PC</span><span class="sfe-rv">' + hx(st.pc) + '</span>' +
          (esFetch ? '<span class="sfe-rnota">+' + M.inc + '</span>' : '') + '</div>' +
        '<div class="sfe-reg' + (esFetch ? ' sfe-cambio' : '') + '"' + (esFetch ? retardo(0.7) : '') + '><span class="sfe-rn">IR</span><span class="sfe-rv">' +
          (st.ir == null ? '—' : '0x<span class="di16-f-op">' + hx(st.ir).charAt(2) + '</span>' + hx(st.ir).slice(3)) + '</span></div>' +
        '</div>';
      // Decodificador
      hc += '<div class="sfe-dec' + (esFetch ? ' sfe-cambio' : '') + '"' + (esFetch ? retardo(1.4) : '') + '><div class="sfe-dec-t">Decodificación del IR</div>';
      if (d) {
        hc += '<div class="sfe-dec-campos">' + d.campos.map(function (c) {
          return '<span class="sfe-campo ' + c.cls + '" style="flex-grow:' + (c.hi - c.lo + 1) + '"><span class="sfe-cb">' + bin((st.ir >> c.lo) & ((1 << (c.hi - c.lo + 1)) - 1), c.hi - c.lo + 1).replace(/(\d{4})(?=\d)/g, '$1 ') +
            '</span><span class="sfe-cn">' + esc(c.nom) + ' = ' + esc(c.val) + '</span></span>';
        }).join('') + '</div>' +
          '<div class="sfe-dec-asm"><code>' + d.asmHtml + '</code>' + (d.sem ? ' <span class="sfe-sem">' + esc(d.sem) + '</span>' : '') + '</div>';
      } else {
        hc += '<div class="sfe-tenue">IR vacío: todavía no se ha buscado ninguna instrucción.</div>';
      }
      hc += '</div>';
      // Registros de trabajo
      hc += '<div class="sfe-regs sfe-ws">';
      listaRegs.forEach(function (k) {
        var cambia = esExec && ev.cambia.w[k];
        var rol = d && esExec ? (d.rs === k ? ' sfe-usa' : '') : '';
        hc += '<div class="sfe-reg' + (cambia ? ' sfe-cambio' : '') + rol + '"' + (cambia ? retardo(ev.alu ? 0.35 : 0.7) : '') + '><span class="sfe-rn">W' + k + '</span><span class="sfe-rv">' + hx(st.w[k]) + '</span><span class="sfe-rnota">' + st.w[k] + '</span></div>';
      });
      hc += '</div>';
      // ALU
      var alu = esExec && ev.alu;
      hc += '<div class="sfe-alu' + (alu ? ' sfe-alu-on sfe-cambio' : '') + '"' + (alu ? retardo(0) : '') + '><span class="sfe-alu-t">ALU</span>' +
        (alu ? '<span class="sfe-alu-op">W' + alu.rs + ' + W' + alu.rd + ' = ' + hx(alu.a) + ' + ' + hx(alu.b) + ' = <strong>' + hx(alu.r) + '</strong> → W' + alu.rd + '</span>'
             : '<span class="sfe-tenue">en reposo</span>') + '</div>';
      $('.sfe-cpu-in').innerHTML = hc;

      // Memoria de datos
      var dirs = Object.keys(st.mem).map(Number).sort(function (a, b) { return a - b; });
      var hd = '<div class="sfe-tabla-wrap"><table class="sfe-tabla"><thead><tr><th scope="col">Dir.</th><th scope="col">Contenido</th><th scope="col">Decimal</th></tr></thead><tbody>';
      dirs.forEach(function (a) {
        var leido = esExec && ev.leido === a, escrito = esExec && ev.cambia.mem[a];
        hd += '<tr class="' + (leido ? 'sfe-leida' : '') + (escrito ? ' sfe-escrita' : '') + '"><th scope="row">' + hx(a) + '</th>' +
          '<td class="sfe-dato' + (escrito ? ' sfe-cambio' : '') + '"' + (escrito ? retardo(0.7) : '') + '>' + hx(st.mem[a]) + '</td><td class="sfe-dec-n">' + st.mem[a] + '</td></tr>';
      });
      $('.sfe-datos-in').innerHTML = hd + '</tbody></table></div>' +
        '<p class="sfe-nota">Datos de 16 bits: también 2 celdas cada uno (direcciones de 2 en 2).</p>';

      pintarBus(ev);
      pintarTraza(r);
    }

    function pintarTraza(r) {
      var st0 = M.nuevo();
      var cab = '<tr><th scope="col">Instr.</th><th scope="col">Fase</th><th scope="col">PC</th><th scope="col">IR</th>' +
        listaRegs.map(function (k) { return '<th scope="col">W' + k + '</th>'; }).join('') +
        listaEscritas.map(function (a) { return '<th scope="col">(' + hx(a, 2) + ')</th>'; }).join('') + '</tr>';
      function fila(instr, fase, st, ev) {
        var c = function (on, txt) { return '<td' + (on ? ' class="sfe-tz-cambio"' : '') + '>' + txt + '</td>'; };
        var h = '<tr><td>' + instr + '</td><td>' + fase + '</td>' +
          c(ev && ev.fase === 'fetch', hx(st.pc)) + c(ev && ev.fase === 'fetch', st.ir == null ? '—' : hx(st.ir));
        listaRegs.forEach(function (k) { h += c(ev && ev.cambia.w[k], hx(st.w[k])); });
        listaEscritas.forEach(function (a) { h += c(ev && ev.cambia.mem[a], st.mem[a] == null ? '—' : hx(st.mem[a])); });
        return h + '</tr>';
      }
      var cuerpo = fila('—', 'Inicio', st0, null);
      var st = M.nuevo();
      r.evs.forEach(function (ev) {
        M.fase(st);
        cuerpo += fila(ev.n, ev.fase === 'fetch' ? 'Fetch' : 'Execute', st, ev);
      });
      $('.sfe-traza-in').innerHTML = '<table class="sfe-tabla sfe-tz"><thead>' + cab + '</thead><tbody>' + cuerpo + '</tbody></table>';
    }

    function parar() { if (timer) { clearInterval(timer); timer = null; } }
    function avanzar() {
      if (!document.body.contains(el)) { parar(); return; }
      if (n < total) n++;
      if (n >= total) parar();
      pintar();
    }

    el.addEventListener('click', function (e) {
      var t = e.target.closest('button');
      if (!t || !el.contains(t) || t.disabled) return;
      var antes = n;
      if (t.classList.contains('sfe-b-fetch') || t.classList.contains('sfe-b-exec') || t.classList.contains('sfe-b-paso')) {
        if (n < total) n++;
      } else if (t.classList.contains('sfe-b-atras')) {
        if (n > 0) n--;
      } else if (t.classList.contains('sfe-b-reset')) {
        parar(); n = 0;
      } else if (t.classList.contains('sfe-b-todo')) {
        if (timer) { parar(); pintar(); return; }
        if (n >= total) return;
        timer = setInterval(avanzar, intervalo);
        avanzar();
        return;
      } else return;
      pintar();
      // Si el botón pulsado queda desactivado, el foco pasa al siguiente útil.
      if (t.disabled) {
        var sig = [n > antes ? (t.classList.contains('sfe-b-fetch') ? '.sfe-b-exec' : '.sfe-b-fetch') : '.sfe-b-paso', '.sfe-b-paso', '.sfe-b-reset']
          .map(function (s) { return $(s); }).filter(function (b) { return b && !b.disabled; })[0];
        if (sig) sig.focus();
      }
    });

    pintar();
  };

  // Expuesto para pruebas.
  MPI.componentes['sim-fetch-execute']._maquina = function (cfg) { return new Maquina(cfg || {}); };
  MPI.componentes['sim-fetch-execute']._decod = decod;
})();
