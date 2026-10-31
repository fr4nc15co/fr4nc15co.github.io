/*
 * Componente "sim-asm-dspic": simulador paso a paso de ensamblador dsPIC33F
 * (tema de ensamblador, cap. 8 del libro). Usa el motor MPI.dspic de
 * dspic-cpu.js, que debe cargarse ANTES que este archivo.
 *
 * data-config (todas las claves salvo "codigo" son opcionales):
 *   {"titulo":"ADD.B #0x10, W1", "codigo":"ADD.B #0x10, W1",
 *    "regs":{"W1":"0x78F4"}, "sr":"0x0000", "mem":{"0x0804":"0xA557"},
 *    "pc":"0x0100", "w15":"0x0800", "splim":"0x0FFE",
 *    "esperado":{"W1":"0x7804","sr":"0x0001","0x0804":"0xF240",
 *                "mem":{"0x0804":"0xF240"}}}
 *   - mem: words en direcciones de datos (little endian).
 *   - esperado: registros (W0-W15, WREG, PC, SPLIM), sr (se comparan C, Z,
 *     OV y N: el libro no muestra DC), flags sueltos (C, Z, OV, N, DC) y
 *     direcciones de datos, en el primer nivel o dentro de "mem".
 *   - Para colocar código en una dirección concreta: "0x0302: MOV #0x54, W0".
 */
window.MPI = window.MPI || {};
MPI.componentes = MPI.componentes || {};

(function () {
  'use strict';

  var ID = 0;
  var LIMITE = 10000;
  var FLAGS = ['C', 'Z', 'OV', 'N', 'DC'];
  var NOMBRE_FLAG = { C: 'acarreo / sin préstamo', Z: 'cero', OV: 'desbordamiento con signo', N: 'negativo', DC: 'acarreo de dígito' };

  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function hex(v, n) { return MPI.dspic.hex(v, n); }
  function sgn16(v) { return v & 0x8000 ? v - 0x10000 : v; }
  function dec(n) { return n < 0 ? '−' + (-n) : String(n); }
  function bin16(v) {
    var s = (v >>> 0).toString(2);
    while (s.length < 16) s = '0' + s;
    return s.replace(/(\d{4})(?=\d)/g, '$1 ');
  }

  // ---- resaltado sencillo de una línea de ensamblador ----
  var CONDS_TXT = /^(C|NC|Z|NZ|N|NN|OV|NOV|GT|GE|LT|LE|GTU|GEU|LTU|LEU|GTS|GES|LTS|LES)$/i;
  function resaltar(t) {
    var com = '', ic = t.indexOf(';');
    if (ic >= 0) { com = t.slice(ic); t = t.slice(0, ic); }
    var re = /(\s+)|((?:0x[0-9A-Fa-f]+|\d+)\s*:)|([A-Za-z_$][\w.$]*\s*:)|(#[^,\s\]]+)|(\[[^\]]*\]?)|(\bW(?:1[0-5]|[0-9])\b|\bWREG\b)|(\b0x[0-9A-Fa-f]+\b|\b0b[01]+\b|\b\d+\b)|([A-Za-z_.][\w.]*)|([\s\S])/g;
    var m, h = '', vistoMn = false;
    while ((m = re.exec(t))) {
      if (m[1]) h += m[1];
      else if (m[2]) h += '<span class="sad-t-dirp">' + esc(m[2]) + '</span>';
      else if (m[3] && !vistoMn) h += '<span class="sad-t-eti">' + esc(m[3]) + '</span>';
      else if (m[3]) h += esc(m[3]);
      else if (m[4]) h += '<span class="sad-t-lit">' + esc(m[4]) + '</span>';
      else if (m[5]) h += '<span class="sad-t-reg">' + esc(m[5]) + '</span>';
      else if (m[6]) h += '<span class="sad-t-reg">' + esc(m[6]) + '</span>';
      else if (m[7]) h += '<span class="sad-t-num">' + esc(m[7]) + '</span>';
      else if (m[8]) {
        if (!vistoMn) { vistoMn = true; h += '<span class="sad-t-mn">' + esc(m[8]) + '</span>'; }
        else if (CONDS_TXT.test(m[8])) h += '<span class="sad-t-cond">' + esc(m[8]) + '</span>';
        else h += '<span class="sad-t-sym">' + esc(m[8]) + '</span>';
      } else h += esc(m[0]);
    }
    if (com) h += '<span class="sad-t-com">' + esc(com) + '</span>';
    return h;
  }

  MPI.componentes['sim-asm-dspic'] = function (el, cfg) {
    cfg = cfg || {};
    el.classList.add('mpi-sim-asm-dspic');
    if (!MPI.dspic) {
      el.innerHTML = '<div class="mpi-sim-cab">Simulador de ensamblador</div><p class="sad-aviso">Falta el motor <code>dspic-cpu.js</code> (debe cargarse antes que <code>sim-asm-dspic.js</code>).</p>';
      return;
    }
    var D = MPI.dspic;
    var uid = 'sad' + (++ID);
    var codigoEj = String(cfg.codigo || 'NOP');
    var origen = cfg.pc != null ? D.leerNum(cfg.pc) : undefined;
    if (isNaN(origen)) origen = undefined;
    var w15ini = cfg.w15 != null ? D.leerNum(cfg.w15) : (cfg.regs && cfg.regs.W15 != null ? D.leerNum(cfg.regs.W15) : 0x0800);
    if (isNaN(w15ini)) w15ini = 0x0800;
    var esperado = cfg.esperado && typeof cfg.esperado === 'object' ? cfg.esperado : null;
    var hayEsperado = esperado && Object.keys(esperado).length > 0;
    // cfg.fuente: 'libro' (por defecto) o 'propio' (caso de prueba que no es del libro).
    var delLibro = cfg.fuente !== 'propio';
    var REF = delLibro ? 'el libro' : 'los valores esperados';
    var REF_DE = delLibro ? 'del libro' : 'esperados';

    // Direcciones de datos que interesa ver siempre.
    var dirsFijas = [];
    function addDirs(obj) {
      if (!obj) return;
      Object.keys(obj).forEach(function (k) {
        if (k === 'mem' && typeof obj.mem === 'object') { addDirs(obj.mem); return; }
        if (/^0x[0-9a-f]+$|^\d+$/i.test(k)) { var a = D.leerNum(k); if (!isNaN(a) && a >= 0x22) dirsFijas.push(a & 0xFFFE); }
      });
    }
    addDirs(cfg.mem); addDirs(esperado);

    var titulo = cfg.titulo || 'Simulador de ensamblador';
    el.innerHTML =
      '<div class="mpi-sim-cab"><span class="sad-tit">' + esc(titulo) + '</span><span class="sad-cab-sub">simulador dsPIC33F paso a paso</span></div>' +
      '<div class="sad-barra" role="toolbar" aria-label="Controles del simulador">' +
        '<button type="button" class="sad-b-paso" aria-keyshortcuts="ArrowRight">Paso ▸</button>' +
        '<button type="button" class="sad-b-todo">Ejecutar todo</button>' +
        '<button type="button" class="sad-b-atras" aria-keyshortcuts="ArrowLeft">◂ Atrás</button>' +
        '<button type="button" class="sad-b-reini">Reiniciar</button>' +
        '<span class="sad-estado" aria-live="polite"></span>' +
      '</div>' +
      '<div class="sad-cuerpo">' +
        '<div class="sad-col">' +
          '<section class="sad-panel" aria-labelledby="' + uid + '-tprog">' +
            '<h4 class="sad-h" id="' + uid + '-tprog">Programa <span class="sad-h-sub">dirección de programa · ▶ siguiente instrucción</span></h4>' +
            '<div class="sad-listado" tabindex="0" role="region" aria-label="Listado del programa (flechas: paso adelante y atrás)"></div>' +
            '<div class="sad-errores" role="alert"></div>' +
            '<details class="sad-editor">' +
              '<summary>Editar el programa</summary>' +
              '<label class="sad-lbl" for="' + uid + '-ta">Código en ensamblador (se ensambla al escribir; una instrucción por línea, <code>;</code> comentario, <code>etiqueta:</code>, <code>0x0302: MOV …</code> para fijar la dirección)</label>' +
              '<textarea id="' + uid + '-ta" class="sad-ta" spellcheck="false" autocapitalize="off" autocomplete="off" rows="8"></textarea>' +
              '<div class="sad-ed-pie"><button type="button" class="sad-b-rest">Restaurar ejemplo</button></div>' +
            '</details>' +
          '</section>' +
          '<section class="sad-panel sad-expl" aria-live="polite" aria-label="Explicación de la última instrucción"></section>' +
        '</div>' +
        '<div class="sad-col">' +
          '<section class="sad-panel" aria-labelledby="' + uid + '-treg">' +
            '<h4 class="sad-h" id="' + uid + '-treg">Registros <span class="sad-h-sub">hex · decimal sin signo · con signo (si es distinto)</span></h4>' +
            '<ul class="sad-regs"></ul>' +
          '</section>' +
          '<section class="sad-panel" aria-labelledby="' + uid + '-tsr">' +
            '<h4 class="sad-h" id="' + uid + '-tsr">Registro de estado SR</h4>' +
            '<div class="sad-sr"></div>' +
            '<ul class="sad-flags"></ul>' +
          '</section>' +
          '<section class="sad-panel" aria-labelledby="' + uid + '-tmem">' +
            '<h4 class="sad-h" id="' + uid + '-tmem">Memoria de datos <span class="sad-h-sub">word a word, little endian</span></h4>' +
            '<div class="sad-mem"></div>' +
          '</section>' +
        '</div>' +
      '</div>' +
      (hayEsperado ? '<section class="sad-check" aria-live="polite" aria-label="Comprobación con ' + REF + '"></section>' : '') +
      '<p class="sad-pie">Teclado: con el foco en el simulador, <kbd>→</kbd> paso y <kbd>←</kbd> atrás. «Ejecutar todo» para como mucho tras 10' + ' ' + '000 pasos.</p>';

    var q = function (s) { return el.querySelector(s); };
    var bPaso = q('.sad-b-paso'), bTodo = q('.sad-b-todo'), bAtras = q('.sad-b-atras'), bReini = q('.sad-b-reini');
    var spEstado = q('.sad-estado'), listado = q('.sad-listado'), divErr = q('.sad-errores');
    var editor = q('.sad-editor'), ta = q('.sad-ta'), bRest = q('.sad-b-rest');
    var secExpl = q('.sad-expl'), ulRegs = q('.sad-regs'), divSR = q('.sad-sr'), ulFlags = q('.sad-flags');
    var divMem = q('.sad-mem'), secCheck = q('.sad-check');

    ta.value = codigoEj;
    var cpu = D.crear({ regs: cfg.regs, sr: cfg.sr, mem: cfg.mem, pc: cfg.pc, w15: cfg.w15, splim: cfg.splim });
    var asm = null, prog = null, aviso = '', temporizador = null;

    function ensamblar() {
      temporizador = null;
      asm = D.ensamblar(ta.value, origen);
      prog = asm.errores.length ? null : asm;
      if (prog) cpu.cargar(prog);
      aviso = '';
      pintar();
    }
    function pendiente() { if (temporizador) { clearTimeout(temporizador); ensamblar(); } }

    // ---------------------------------------------------------- pintado
    function pintar() {
      var est = cpu.estado();
      var fin = prog ? est.fin : null;
      var ult = prog ? est.ultimo : null;
      var cambiosW = {};
      if (ult && ult.cambios) ult.cambios.forEach(function (c) { cambiosW[c.nombre] = c; });

      // Botones y estado.
      var parado = !prog || (fin && fin.tipo !== 'bucle');
      bPaso.disabled = !!parado;
      bTodo.disabled = !prog || !!fin;
      bAtras.disabled = !prog || !est.puedeAtras;
      bReini.disabled = !prog;
      var txtEstado;
      if (!prog) txtEstado = 'Hay errores de ensamblado';
      else {
        txtEstado = 'Paso ' + est.pasos + ' · PC = ' + hex(est.PC, 4);
        if (fin) txtEstado += fin.tipo === 'error' ? ' · detenido por un error' : (fin.tipo === 'bucle' ? ' · en bucle infinito' : ' · fin del programa');
      }
      spEstado.textContent = txtEstado;

      pintarListado(est, fin, ult);
      pintarErrores();
      pintarExpl(est, fin, ult);
      pintarRegs(est, cambiosW);
      pintarSR(est, ult);
      pintarMem(est, ult);
      pintarCheck(fin);
    }

    function pintarListado(est, fin, ult) {
      var lin = asm ? asm.lineas : [];
      var lActual = ult && ult.ins ? ult.ins.linea : -1;
      var sig = prog && (!fin || fin.tipo === 'bucle') ? prog.porDir[est.PC] : null;
      var lSig = sig && sig.linea ? sig.linea : -1;
      var h = '';
      lin.forEach(function (L) {
        var cl = 'sad-l';
        if (L.num === lActual) cl += ' sad-l-actual';
        if (L.num === lSig) cl += ' sad-l-sig';
        if (L.error) cl += ' sad-l-err';
        var marca = L.num === lSig ? '▶' : (L.error ? '!' : '');
        var dir = L.dir != null ? hex(L.dir, 4) : '';
        h += '<div class="' + cl + '" data-l="' + L.num + '"' + (L.num === lSig ? ' aria-current="step"' : '') + '>' +
          '<span class="sad-l-marca" aria-hidden="true">' + marca + '</span>' +
          '<span class="sad-l-num" aria-hidden="true">' + L.num + '</span>' +
          '<span class="sad-l-dir">' + dir + '</span>' +
          '<code class="sad-l-cod">' + (L.texto.trim() ? resaltar(L.texto) : ' ') + '</code>' +
          (L.num === lSig ? '<span class="sad-sr-only"> (siguiente instrucción)</span>' : '') +
          (L.num === lActual ? '<span class="sad-sr-only"> (recién ejecutada)</span>' : '') +
        '</div>';
      });
      listado.innerHTML = h;
      var obj = listado.querySelector('.sad-l-sig') || listado.querySelector('.sad-l-actual');
      if (obj) {
        var top = obj.offsetTop, alto = obj.offsetHeight;
        if (top < listado.scrollTop + 4) listado.scrollTop = Math.max(0, top - 24);
        else if (top + alto > listado.scrollTop + listado.clientHeight - 4) listado.scrollTop = top + alto - listado.clientHeight + 24;
      }
    }

    function pintarErrores() {
      if (!asm || !asm.errores.length) { divErr.innerHTML = ''; divErr.hidden = true; return; }
      divErr.hidden = false;
      divErr.innerHTML = '<p class="sad-err-tit">No se puede ensamblar (' + asm.errores.length + (asm.errores.length === 1 ? ' error' : ' errores') + '):</p><ul>' +
        asm.errores.map(function (e) {
          return '<li>' + (e.linea ? '<b>Línea ' + e.linea + ':</b> ' : '') + esc(e.msg) + '</li>';
        }).join('') + '</ul>';
    }

    function fmtCambio(c) {
      var ancho = 4;
      var mot = c.motivo ? ' <span class="sad-ex-mot">(' + esc(c.motivo) + ')</span>' : '';
      return '<li><b>' + esc(c.nombre) + '</b>: ' + hex(c.antes, ancho) + ' → <b class="sad-ex-nuevo">' + hex(c.despues, ancho) + '</b>' + mot + '</li>';
    }

    function pintarExpl(est, fin, ult) {
      var h = '';
      if (!prog) {
        h = '<p class="sad-ex-ini">Corrige los errores de ensamblado para poder ejecutar el programa.</p>';
      } else if (!ult) {
        var ins0 = prog.porDir[est.PC];
        h = '<p class="sad-ex-ini">Estado inicial. Pulsa <b>Paso</b> para ejecutar la primera instrucción' +
          (ins0 && ins0.texto ? ': <code>' + esc(hex(ins0.dir, 4) + '  ' + ins0.texto) + '</code>' : '') + '.</p>';
      } else {
        var ins = ult.ins;
        h += '<p class="sad-ex-ins"><span class="sad-ex-dir">' + hex(ult.dir, 4) + '</span> <code>' + resaltar(ins.texto) + '</code>' +
          (ult.veces > 1 ? ' <span class="sad-ex-veces">× ' + ult.veces + '</span>' : '') + '</p>';
        if (ult.error) h += '<p class="sad-ex-err">⚠ ' + esc(ult.error) + ' La instrucción no se ha ejecutado; usa «Atrás» o «Reiniciar».</p>';
        if (ult.op) h += '<p class="sad-ex-op">' + esc(ult.op) + '</p>';
        if (ult.bin) h += '<pre class="sad-ex-bin" aria-label="Operación en binario">' + esc(ult.bin.join('\n')) + '</pre>';
        if (ult.salto) h += '<p class="sad-ex-salto">' + esc(ult.salto) + '</p>';
        if (ult.cambios && ult.cambios.length) h += '<ul class="sad-ex-cambios">' + ult.cambios.map(fmtCambio).join('') + '</ul>';
        else if (!ult.error) h += '<p class="sad-ex-tenue">No cambia ningún registro ni la memoria (solo el PC).</p>';
        (ult.notas || []).forEach(function (n) { h += '<p class="sad-ex-nota">' + esc(n) + '</p>'; });
      }
      if (fin && fin.tipo !== 'error') h += '<p class="sad-ex-fin">' + esc(fin.msg) + '</p>';
      if (aviso) h += '<p class="sad-ex-err">' + esc(aviso) + '</p>';
      secExpl.innerHTML = h;
    }

    function pintarRegs(est, cambiosW) {
      var h = '';
      for (var i = 0; i < 16; i++) {
        var v = est.W[i], s = sgn16(v), c = cambiosW['W' + i];
        var nom = 'W' + i + (i === 15 ? ' · SP' : '');
        var decTxt = String(v) + (s !== v ? ' · ' + dec(s) : '');
        var tit = 'W' + i + ' = ' + hex(v, 4) + ' = ' + v + ' sin signo = ' + dec(s) + ' con signo · binario ' + bin16(v) +
          (c ? ' · antes ' + hex(c.antes, 4) : '');
        h += '<li class="sad-reg' + (c ? ' sad-cambio' : '') + '" title="' + esc(tit) + '">' +
          '<span class="sad-reg-n">' + nom + '</span>' +
          '<span class="sad-reg-h">' + hex(v, 4) + '</span>' +
          '<span class="sad-reg-d">' + decTxt + '</span>' +
          (c ? '<span class="sad-sr-only"> (ha cambiado, antes ' + hex(c.antes, 4) + ')</span>' : '') +
        '</li>';
      }
      ulRegs.innerHTML = h;
    }

    function pintarSR(est, ult) {
      var sr = est.SR, antes = ult && ult.srAntes != null ? ult.srAntes : sr;
      var bits = [
        { n: 'DC', b: 8 }, { n: 'IPL2', b: 7 }, { n: 'IPL1', b: 6 }, { n: 'IPL0', b: 5 },
        { n: 'RA', b: 4 }, { n: 'N', b: 3 }, { n: 'OV', b: 2 }, { n: 'Z', b: 1 }, { n: 'C', b: 0 }
      ];
      var h = '<div class="sad-sr-cab"><span>SR = <b>' + hex(sr, 4) + '</b></span><span>PC = <b>' + hex(est.PC, 4) + '</b></span>' +
        (est.SPLIM != null ? '<span>SPLIM = <b>' + hex(est.SPLIM, 4) + '</b></span>' : '') + '</div>';
      h += '<div class="sad-bits" role="group" aria-label="Bits del SR">';
      bits.forEach(function (x) {
        var v = (sr >> x.b) & 1, va = (antes >> x.b) & 1;
        var cl = 'sad-bit' + (v ? ' sad-bit-1' : '') + (v !== va ? ' sad-cambio' : '') + (/^IPL|RA/.test(x.n) ? ' sad-bit-sec' : '');
        h += '<span class="' + cl + '" title="bit ' + x.b + '"><span class="sad-bit-n">' + x.n + '</span><span class="sad-bit-v">' + v + '</span></span>';
      });
      h += '</div><p class="sad-sr-nota">Bits 15-9 (OA, OB, SA, SB, OAB, SAB, DA) son del motor DSP y no se simulan.</p>';
      divSR.innerHTML = h;

      var fh = '';
      FLAGS.forEach(function (f) {
        var bit = D.BITS_FLAG[f], v = (sr & bit) ? 1 : 0, va = (antes & bit) ? 1 : 0;
        var txt;
        if (!ult) txt = 'valor inicial.';
        else if (ult.error) txt = 'sin cambios (la instrucción no se ha ejecutado).';
        else if (ult.flags && ult.flags[f]) txt = ult.flags[f].replace(/^[A-Z]{1,2} = \d: /, '').replace(/^[A-Z]{1,2}: /, '');
        else txt = 'sin cambios: ' + ult.ins.mnem + ' no modifica ' + f + '.';
        var cambia = ult && v !== va;
        fh += '<li class="' + (cambia ? 'sad-cambio' : (ult && ult.flags && ult.flags[f] ? 'sad-afectado' : '')) + '">' +
          '<b class="sad-fl-n" title="' + NOMBRE_FLAG[f] + '">' + f + ' = ' + v + '</b>' +
          (cambia ? ' <span class="sad-fl-antes">(antes ' + va + ')</span>' : '') +
          ' <span class="sad-fl-t">' + esc(txt) + '</span></li>';
      });
      ulFlags.innerHTML = fh;
    }

    function pintarMem(est, ult) {
      var set = {}, lista = [];
      function add(a) { a &= 0xFFFE; if (a < 0x22) return; if (!set[a]) { set[a] = 1; lista.push(a); } }
      dirsFijas.forEach(add);
      if (prog) {
        est.usadas.forEach(add);
        // Destino de los punteros usados en modo indirecto.
        var regsInd = {};
        prog.instrucciones.forEach(function (ins) {
          ins.ops.forEach(function (o) { if (o.t === 'ind') { regsInd[o.n] = 1; if (o.nb != null) regsInd[o.nb] = 0; } });
        });
        Object.keys(regsInd).forEach(function (n) { if (regsInd[n] && est.W[n] >= 0x0800) add(est.W[n]); });
        var usaPila = est.pilaUsada || prog.instrucciones.some(function (ins) { return /^(PUSH|POP|CALL|RCALL|RETURN)$/.test(ins.mnem); });
        if (usaPila) { add(w15ini); add(est.W[15]); }
      }
      lista.sort(function (a, b) { return a - b; });
      // Rellenar huecos pequeños para que se lea como un bloque.
      var filas = [];
      lista.forEach(function (a, i) {
        if (i > 0) { var prev = filas[filas.length - 1]; if (a - prev <= 6) for (var x = prev + 2; x < a; x += 2) filas.push(x); }
        filas.push(a);
      });
      if (filas.length > 64) filas = filas.slice(0, 64);
      if (!filas.length) { divMem.innerHTML = '<p class="sad-ex-tenue">Este programa no usa la memoria de datos.</p>'; return; }
      var bytesC = (ult && ult.bytesCambiados) || {};
      var punteros = {};
      if (prog) {
        prog.instrucciones.forEach(function (ins) {
          ins.ops.forEach(function (o) { if (o.t === 'ind' && o.modo !== 'idx') { var a = est.W[o.n] & 0xFFFE; (punteros[a] = punteros[a] || {})['W' + o.n] = 1; } });
        });
      }
      var sp = est.W[15], usaP = prog && (est.pilaUsada || filas.indexOf(sp) >= 0 && sp !== w15ini);
      var h = '<div class="sad-mem-wrap" tabindex="0" role="region" aria-label="Memoria de datos"><table class="sad-mem-t"><thead><tr>' +
        '<th scope="col">Dirección</th><th scope="col">Word</th><th scope="col">Byte bajo <span class="sad-m-dir">(dir)</span></th><th scope="col">Byte alto <span class="sad-m-dir">(dir+1)</span></th><th scope="col"><span class="sad-sr-only">Marcas</span></th>' +
        '</tr></thead><tbody>';
      filas.forEach(function (a) {
        var lo = cpu.leerByte(a), hi = cpu.leerByte(a + 1), w = lo | (hi << 8);
        var cLo = bytesC[a], cHi = bytesC[a + 1];
        var marcas = [];
        if (usaP && a === sp) marcas.push('<span class="sad-m-sp">◀ W15 (cima de la pila)</span>');
        if (punteros[a]) Object.keys(punteros[a]).forEach(function (r) { if (r !== 'W15' || a !== sp) marcas.push('<span class="sad-m-ptr">◀ ' + r + '</span>'); });
        var enPila = usaP && a >= w15ini && a < sp;
        h += '<tr class="' + ((cLo || cHi) ? 'sad-cambio' : '') + (enPila ? ' sad-pila' : '') + '">' +
          '<th scope="row">' + hex(a, 4) + '</th>' +
          '<td class="sad-m-w">' + hex(w, 4) + '</td>' +
          '<td class="' + (cLo ? 'sad-m-c' : '') + '" title="byte en ' + hex(a, 4) + '">' + hex(lo, 2) + '</td>' +
          '<td class="' + (cHi ? 'sad-m-c' : '') + '" title="byte en ' + hex(a + 1, 4) + '">' + hex(hi, 2) + '</td>' +
          '<td class="sad-m-marcas">' + (enPila ? '<span class="sad-m-pila">pila</span>' : '') + marcas.join(' ') + '</td></tr>';
      });
      h += '</tbody></table></div>';
      divMem.innerHTML = h;
    }

    function pintarCheck(fin) {
      if (!secCheck) return;
      var h = '<h4 class="sad-h">Comprobación con ' + REF + '</h4>';
      if (!prog) h += '<p class="sad-ex-tenue">Sin programa ensamblado.</p>';
      else if (!fin) h += '<p class="sad-ex-tenue">Ejecuta el programa hasta el final («Ejecutar todo») para compararlo con los valores ' + REF_DE + '.</p>';
      else if (fin.tipo === 'error') h += '<p class="sad-ex-err">El programa se ha detenido por un error; no se puede comparar con ' + REF + '.</p>';
      else {
        var res = D.comprobar(cpu, esperado);
        var todos = res.every(function (r) { return r.ok; });
        h += '<ul class="sad-ck">' + res.map(function (r) {
          return '<li class="' + (r.ok ? 'sad-ck-ok' : 'sad-ck-ko') + '"><span aria-hidden="true">' + (r.ok ? '✔' : '✘') + '</span> ' +
            '<span class="sad-sr-only">' + (r.ok ? 'Correcto: ' : 'Diferencia: ') + '</span>' + esc(r.texto) +
            (r.nota ? '<span class="sad-ck-info">ℹ ' + esc(r.nota) + '</span>' : '') + '</li>';
        }).join('') + '</ul>';
        h += '<p class="' + (todos ? 'sad-ck-res-ok' : 'sad-ck-res-ko') + '">' + (todos ? '✔ El simulador coincide con ' + REF + '.' : '✘ Hay diferencias con ' + REF + '.') + '</p>';
        if (ta.value.trim() !== codigoEj.trim()) h += '<p class="sad-ex-tenue">Has modificado el programa del ejemplo: los valores ' + REF_DE + ' pueden no aplicar.</p>';
      }
      secCheck.innerHTML = h;
    }

    // ---------------------------------------------------------- acciones
    function paso() {
      pendiente();
      if (bPaso.disabled) return;
      aviso = '';
      cpu.paso();
      pintar();
    }
    function todo() {
      pendiente();
      if (bTodo.disabled) return;
      var r = cpu.ejecutar(LIMITE);
      aviso = r.limite ? 'Se ha parado tras ' + LIMITE.toLocaleString('es-ES') + ' pasos sin terminar: probablemente el programa tiene un bucle infinito.' : '';
      pintar();
    }
    function atras() {
      pendiente();
      if (bAtras.disabled) return;
      aviso = '';
      cpu.atras();
      pintar();
    }
    function reiniciar() {
      pendiente();
      if (!prog) return;
      aviso = '';
      cpu.reiniciar();
      pintar();
    }

    bPaso.addEventListener('click', paso);
    bTodo.addEventListener('click', todo);
    bAtras.addEventListener('click', atras);
    bReini.addEventListener('click', reiniciar);
    bRest.addEventListener('click', function () { ta.value = codigoEj; if (temporizador) clearTimeout(temporizador); ensamblar(); ta.focus(); });
    ta.addEventListener('input', function () {
      if (temporizador) clearTimeout(temporizador);
      temporizador = setTimeout(ensamblar, 350);
    });
    el.addEventListener('keydown', function (e) {
      var t = e.target, tag = t && t.tagName;
      if (tag === 'TEXTAREA' || tag === 'INPUT' || tag === 'SELECT' || e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); paso(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); atras(); }
    });

    ensamblar();
    if (asm && asm.errores.length) editor.open = true;
  };
})();
