/*
 * Componente "sim-fsm-dspic": las tres máquinas de estados resueltas del tema 13
 * («Sistemas digitales complejos»), con diagrama de estados (estado actual resaltado y
 * última transición animada), entradas y salidas manipulables, el código C con la rama
 * activa resaltada, controles Paso / Ejecutar / Pausa / Reiniciar y un panel que explica cada
 * transición.
 *
 * Uso (data-config fijo, una máquina por montaje; puede haber varios montajes en la página):
 *   <div class="mpi-mount" data-componente="sim-fsm-dspic" data-config='{"maquina":"calculadora"}'></div>
 *   <div class="mpi-mount" data-componente="sim-fsm-dspic" data-config='{"maquina":"espantador"}'></div>
 *   <div class="mpi-mount" data-componente="sim-fsm-dspic" data-config='{"maquina":"espantapajaros"}'></div>
 *
 * Clave de data-config: "maquina" = "calculadora" (19.5.1) | "espantador" (19.6.2) | "espantapajaros" (19.6.3).
 *
 * Las tres máquinas simulan directamente el enunciado, sin casilla de modo.
 */
window.MPI = window.MPI || {};
MPI.componentes = MPI.componentes || {};

(function () {
  var NBSP = ' ';
  var uid = 0;

  // ---------------------------------------------------------------- formato español
  function agrupar(n) {
    var s = String(Math.abs(n));
    if (s.length >= 5) s = s.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
    return (n < 0 ? '−' : '') + s;
  }
  function fijo(x, nd) {
    var s = Math.abs(x).toFixed(nd);
    var neg = x < 0 && +s !== 0;
    var p = s.split('.');
    return (neg ? '−' : '') + agrupar(+p[0]) + (p[1] ? ',' + p[1] : '');
  }
  function fx(x, nd) {
    var s = fijo(x, nd);
    if (s.indexOf(',') >= 0) s = s.replace(/0+$/, '').replace(/,$/, '');
    return s;
  }
  function ent(n) { return (n < 0 ? '−' : '') + Math.abs(n); }
  function bin(v, n) { var s = ''; for (var i = n - 1; i >= 0; i--) s += (v >> i) & 1; return s; }
  function hex4(v) { var s = (v & 0xFFFF).toString(16).toUpperCase(); while (s.length < 4) s = '0' + s; return '0x' + s; }
  function grados(a) { a = Math.round(a); return (a > 0 ? '+' : a < 0 ? '−' : '') + Math.abs(a) + '°'; }
  function ahora() { return (window.performance && performance.now) ? performance.now() : Date.now(); }
  function seg(ms, nd) { return fijo(ms / 1000, nd == null ? 2 : nd) + NBSP + 's'; }

  // ---------------------------------------------------------------- código con líneas direccionables
  // filas: "clave1,clave2|texto". Devuelve un objeto para marcar líneas por clave.
  function codigo(pre, filas) {
    var claves = [], textos = [];
    filas.forEach(function (f) { var i = f.indexOf('|'); claves.push(f.slice(0, i)); textos.push(f.slice(i + 1)); });
    pre.innerHTML = '<code class="lang-c"></code>';
    var code = pre.firstChild;
    code.textContent = textos.join('\n');
    if (MPI.resaltarTodo) MPI.resaltarTodo(pre);
    var partes = code.innerHTML.split('\n');
    code.innerHTML = partes.map(function (l) { return '<span class="sfd-ln">' + (l || ' ') + '</span>'; }).join('');
    var lineas = Array.prototype.slice.call(code.children);
    var mapa = {};
    claves.forEach(function (k, i) {
      if (!k) return;
      k.split(',').forEach(function (kk) { (mapa[kk] = mapa[kk] || []).push(lineas[i]); });
    });
    var foco = null;
    function cada(keys, fn) { (keys || []).forEach(function (k) { (mapa[k] || []).forEach(fn); }); }
    return {
      // clases: { act: [...], tr: [...], dif: [...] }
      marcar: function (clases) {
        lineas.forEach(function (l) { l.classList.remove('sfd-act', 'sfd-tr', 'sfd-dif'); });
        Object.keys(clases).forEach(function (c) { cada(clases[c], function (l) { l.classList.add('sfd-' + c); }); });
      },
      enfocar: function (k) {
        var l = (mapa[k] || [])[0];
        if (!l || k === foco) return;
        foco = k;
        var top = l.offsetTop, h = pre.clientHeight;
        if (!h) return;
        if (top < pre.scrollTop + 8 || top > pre.scrollTop + h - 36) pre.scrollTop = Math.max(0, top - h / 3);
      }
    };
  }

  // ---------------------------------------------------------------- diagrama de estados (SVG)
  function diagrama(cont, id, def) {
    var h = '<svg viewBox="' + def.vb + '" class="sfd-svg" role="img" aria-labelledby="' + id + '-dt">' +
      '<title id="' + id + '-dt">' + def.titulo + '</title><defs>' +
      '<marker id="' + id + '-m" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" class="sfd-flecha"/></marker>' +
      '<marker id="' + id + '-mu" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" class="sfd-flecha sfd-flecha-u"/></marker>' +
      '</defs>';
    (def.extra || []).forEach(function (t) { h += t; });
    def.aristas.forEach(function (a) {
      h += '<g class="sfd-ar' + (a.cls ? ' ' + a.cls : '') + '" data-ar="' + a.k + '"><path d="' + a.d + '" class="sfd-ar-l" marker-end="url(#' + id + '-m)"/>';
      (a.txt || []).forEach(function (t, i) {
        h += '<text x="' + a.lx + '" y="' + (a.ly + i * 11) + '" class="sfd-ar-t" text-anchor="' + (a.an || 'middle') + '">' + t + '</text>';
      });
      h += '</g>';
    });
    var nodos = {};
    def.nodos.forEach(function (n) {
      nodos[n.k] = n;
      h += '<g class="sfd-nodo" data-n="' + n.k + '">';
      if (n.rect) h += '<rect x="' + (n.x - n.w / 2) + '" y="' + (n.y - n.h / 2) + '" width="' + n.w + '" height="' + n.h + '" rx="9" class="sfd-nodo-f"/>';
      else h += '<ellipse cx="' + n.x + '" cy="' + n.y + '" rx="' + (n.w / 2) + '" ry="' + (n.h / 2) + '" class="sfd-nodo-f"/>';
      h += '<text x="' + n.x + '" y="' + (n.t2 ? n.y - 2 : n.y + 4) + '" class="sfd-nodo-t">' + n.t1 + '</text>';
      if (n.t2) h += '<text x="' + n.x + '" y="' + (n.y + 11) + '" class="sfd-nodo-t2">' + n.t2 + '</text>';
      h += '</g>';
    });
    h += '<g class="sfd-fichas"></g></svg>';
    cont.innerHTML = h;
    var svg = cont.firstChild;
    var fichas = svg.querySelector('.sfd-fichas');
    var ultFichas = '';
    return {
      activos: function (keys) {
        var gs = svg.querySelectorAll('.sfd-nodo');
        for (var i = 0; i < gs.length; i++) gs[i].classList.toggle('sfd-nodo-on', keys.indexOf(gs[i].getAttribute('data-n')) >= 0);
      },
      // lista: [{n: clave de nodo, txt, c: clase}]
      fichas: function (lista) {
        var grupos = {}, html = '';
        lista.forEach(function (f) { (grupos[f.n] = grupos[f.n] || []).push(f); });
        Object.keys(grupos).forEach(function (k) {
          var n = nodos[k], g = grupos[k];
          if (!n) return;
          var y = n.fy != null ? n.fy : n.y - n.h / 2 - 1;
          g.forEach(function (f, j) {
            var x = n.x + (j - (g.length - 1) / 2) * 17;
            html += '<g class="sfd-ficha ' + f.c + '"><circle cx="' + x + '" cy="' + y + '" r="7.5"/><text x="' + x + '" y="' + (y + 3.3) + '">' + f.txt + '</text></g>';
          });
        });
        if (html !== ultFichas) { fichas.innerHTML = html; ultFichas = html; }
      },
      transicion: function (k) {
        var prev = svg.querySelectorAll('.sfd-ar-u');
        for (var i = 0; i < prev.length; i++) {
          prev[i].classList.remove('sfd-ar-u');
          prev[i].querySelector('path').setAttribute('marker-end', 'url(#' + id + '-m)');
        }
        var g = svg.querySelector('[data-ar="' + k + '"]');
        if (!g) return;
        void g.getBoundingClientRect();
        g.classList.add('sfd-ar-u');
        g.querySelector('path').setAttribute('marker-end', 'url(#' + id + '-mu)');
      }
    };
  }

  // ---------------------------------------------------------------- servo visto desde arriba (mini)
  function dial() {
    var cx = 60, cy = 62, R = 30, h = '<svg viewBox="0 0 120 100" class="sfd-dial" aria-hidden="true">' +
      '<rect x="4" y="4" width="112" height="92" rx="9" class="sfd-dial-c"/>';
    [-90, -45, 0, 45, 90].forEach(function (a) {
      var r = a * Math.PI / 180;
      h += '<line x1="' + (cx + (R + 3) * Math.sin(r)).toFixed(1) + '" y1="' + (cy - (R + 3) * Math.cos(r)).toFixed(1) +
        '" x2="' + (cx + (R + 9) * Math.sin(r)).toFixed(1) + '" y2="' + (cy - (R + 9) * Math.cos(r)).toFixed(1) + '" class="sfd-dial-m"/>';
    });
    h += '<circle cx="' + cx + '" cy="' + cy + '" r="' + R + '" class="sfd-dial-d"/>' +
      '<g class="sfd-dial-b" style="transform-origin:' + cx + 'px ' + cy + 'px"><path d="M' + (cx - 6) + ',' + cy + ' L' + (cx - 3.5) + ',' + (cy - R + 5) +
      ' Q' + cx + ',' + (cy - R - 2) + ' ' + (cx + 3.5) + ',' + (cy - R + 5) + ' L' + (cx + 6) + ',' + cy + ' Z" class="sfd-dial-p"/></g>' +
      '<circle cx="' + cx + '" cy="' + cy + '" r="6" class="sfd-dial-e"/>' +
      '<text x="' + cx + '" y="' + (cy + 22) + '" class="sfd-dial-t"></text></svg>';
    return h;
  }
  function girar(caja, ang, txt) {
    var g = caja.querySelector('.sfd-dial-b');
    if (g) g.style.transform = 'rotate(' + ang.toFixed(1) + 'deg)';
    var t = caja.querySelector('.sfd-dial-t');
    if (t && t.textContent !== txt) t.textContent = txt;
  }

  // ---------------------------------------------------------------- marco común y bucle de animación
  function opciones(lista, sel) {
    return lista.map(function (o) {
      return '<option value="' + o[0] + '"' + (String(o[0]) === String(sel) ? ' selected' : '') + '>' + o[1] + '</option>';
    }).join('');
  }

  function marco(el, def) {
    var id = 'sfd' + (++uid);
    var reducido = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    el.classList.add('mpi-sim-fsm-dspic');
    el.innerHTML =
      '<div class="mpi-sim-cab">' + def.titulo + ' <span class="sfd-sub">' + def.sub + '</span></div>' +
      '<p class="sfd-intro">' + def.intro + '</p>' +
      '<div class="sfd-barra">' +
        '<div class="sfd-botones" role="group" aria-label="Control de la simulación">' +
          '<button type="button" class="sfd-b-paso" aria-describedby="' + id + '-pt">⏭ Paso</button>' +
          '<button type="button" class="sfd-b-run">▶ Ejecutar</button>' +
          '<button type="button" class="sfd-b-pausa" disabled>⏸ Pausa</button>' +
          '<button type="button" class="sfd-b-reset">↺ Reiniciar</button>' +
        '</div>' +
        '<label class="sfd-sel">Velocidad <select class="sfd-s-vel">' + opciones(def.vels, def.velDef) + '</select></label>' +
        (def.pasos ? '<label class="sfd-sel">Tamaño del paso <select class="sfd-s-paso">' + opciones(def.pasos, def.pasos[0][0]) + '</select></label>' : '') +
        (def.seguir ? '<label class="sfd-sel">' + def.seguir + ' <select class="sfd-s-seg"></select></label>' : '') +
      '</div>' +
      '<p class="sfd-paso-txt" id="' + id + '-pt">' + def.pasoTxt + '</p>' +
      '<div class="sfd-cuerpo">' +
        '<figure class="sfd-fig"><div class="sfd-diag-svg"></div><figcaption>' + def.figcap + '</figcaption></figure>' +
        '<div class="sfd-io"></div>' +
      '</div>' +
      '<div class="sfd-extra"></div>' +
      '<section class="sfd-panel" aria-labelledby="' + id + '-pn">' +
        '<h4 id="' + id + '-pn">Qué ha pasado</h4>' +
        '<div class="sfd-expl" aria-live="polite"></div>' +
        '<ol class="sfd-log" aria-label="Últimas transiciones, la más reciente arriba"></ol>' +
      '</section>' +
      '<details class="sfd-cod" open><summary>' + def.codTit + '</summary>' +
        '<pre class="sfd-pre" tabindex="0" aria-label="' + def.codTit.replace(/<[^>]+>/g, '') + '"></pre>' +
      '</details>';

    function q(s) { return el.querySelector(s); }
    var bPaso = q('.sfd-b-paso'), bRun = q('.sfd-b-run'), bPausa = q('.sfd-b-pausa'), bReset = q('.sfd-b-reset');
    var sVel = q('.sfd-s-vel'), sPaso = q('.sfd-s-paso'), sSeg = q('.sfd-s-seg');
    var expl = q('.sfd-expl'), log = q('.sfd-log');
    var api = null, corriendo = false, ultimo = null, raf = 0, ultExpl = 0, explPend = null, explAct = '';

    function botones() {
      bRun.disabled = corriendo;
      bPausa.disabled = !corriendo;
      expl.setAttribute('aria-live', corriendo ? 'off' : 'polite');
    }
    function frame(ts) {
      raf = 0;
      if (!el.isConnected) { corriendo = false; botones(); return; }   // el tema cambió: se detiene
      if (!corriendo) return;
      var dt = ultimo == null ? 0 : Math.min(100, Math.max(0, ts - ultimo));
      ultimo = ts;
      api.avanzar(dt);
      api.pintar();
      if (explPend != null && ahora() - ultExpl >= 300) ctx.explicar(explPend);
      if (corriendo) raf = requestAnimationFrame(frame);
    }
    function ejecutar() {
      if (corriendo || !el.isConnected) return;
      corriendo = true; ultimo = null; botones();
      raf = requestAnimationFrame(frame);
    }
    function pausar() {
      corriendo = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0; explPend = null;
      botones();
      if (api) api.pintar();
    }

    var ctx = {
      id: id, el: el, q: q, reducido: reducido,
      cod: codigo(q('.sfd-pre'), def.codigo),
      vel: function () { return +sVel.value; },
      tamPaso: function () { return sPaso ? sPaso.value : ''; },
      seguir: function () { return sSeg ? +sSeg.value : 0; },
      opcionesSeguir: function (lista, sel) { if (sSeg) sSeg.innerHTML = opciones(lista, sel); },
      corriendo: function () { return corriendo; },
      diagrama: function (d) { ctx.diag = diagrama(q('.sfd-diag-svg'), id, d); return ctx.diag; },
      explicar: function (html) {
        if (corriendo && ahora() - ultExpl < 300) { explPend = html; return; }
        ultExpl = ahora(); explPend = null;
        if (html !== explAct) { expl.innerHTML = html; explAct = html; }
      },
      registrar: function (t, html, cls) {
        var li = document.createElement('li');
        if (cls) li.className = cls;
        li.innerHTML = (t ? '<span class="sfd-log-t">' + t + '</span> ' : '') + html;
        log.insertBefore(li, log.firstChild);
        while (log.children.length > 12) log.removeChild(log.lastChild);
      },
      limpiarLog: function () { log.innerHTML = ''; },
      ejecutar: ejecutar, pausar: pausar,
      conectar: function (a) {
        api = a;
        bPaso.addEventListener('click', function () { if (corriendo) pausar(); api.paso(); api.pintar(); });
        bRun.addEventListener('click', ejecutar);
        bPausa.addEventListener('click', pausar);
        bReset.addEventListener('click', function () { pausar(); api.reiniciar(); api.pintar(); });
        if (sSeg) sSeg.addEventListener('change', function () { api.pintar(); });
        api.modo(true);
        api.pintar();
        botones();
      }
    };
    return ctx;
  }

  // ======================================================================================
  // 1) CALCULADORA (19.5.1)
  // ======================================================================================
  var CALC_COD = [
    '|#include "config.h"',
    '|',
    '|int actual;',
    '|',
    'pf|int pulsado()',
    '|{',
    'p1|    int anterior = actual;',
    'p2|    actual = PORTB & 0x10;',
    'p3|    if (anterior != actual && anterior == 0)',
    'p4|        return 1;',
    'p5|    return 0;',
    '|}',
    '|',
    '|int main(void)',
    '|{',
    '|    int estado = 0;',
    '|    int Operando1 = 0;',
    '|    int Operando2 = 0;',
    '|    int Resultado = 0;',
    '|    InicializarReloj();     // F_CY = 40 MHz',
    '|    AD1PCFGL = 0xFFFF;      // todos los pines en digital',
    'ini|    TRISB = 0x1F;',
    'ini|    TRISA = 0;',
    'w|    while (1) {',
    'e0|        if (estado == 0) {',
    'e0a|            Operando1 = PORTB & 7;',
    'e0b|            if (pulsado()) estado = 1;',
    'e1|        } else if (estado == 1) {   /* Lee el segundo operador */',
    'e1a|            Operando2 = PORTB & 7;',
    'e1b|            if (pulsado()) estado = 2;',
    'e2|        } else if (estado == 2) {   /* Lee la operación */',
    'e2r|            if (PORTB & 8) Resultado = Operando1 + Operando2;',
    'e2s|            else Resultado = Operando1 - Operando2;',
    'e2b|            if (pulsado()) estado = 3;',
    'e3|        } else if (estado == 3) {',
    'e3a|            PORTA = ~Resultado;',
    'e3b|            estado = 0;',
    '|        }',
    '|    }',
    '|    return 0;',
    '|}'
  ];

  var CALC = {
    def: {
      titulo: 'Calculadora de 3 bits como máquina de estados',
      sub: 'ejercicio 19.5.1',
      intro: 'Interruptores en RB0-RB2 (dato de 3 bits sin signo), RB3 (operación) y RB4 (validación por flanco 0 → 1). ' +
        'Cuatro LEDs con pull-up en RA0-RA3, activos a nivel bajo: <code>PORTA = ~Resultado</code> (4 bits; la resta negativa sale en complemento a 2).',
      vels: [[1, '1 vuelta/s'], [3, '3 vueltas/s'], [10, '10 vueltas/s']], velDef: 3,
      pasoTxt: 'Cada <b>Paso</b> ejecuta una vuelta del <code>while (1)</code> (en el micro son millones por segundo). Cambia los interruptores entre pasos.',
      figcap: 'Diagrama de estados (variable <code>estado</code>)',
      codTit: 'Código (19.5.1) con la rama activa',
      codigo: CALC_COD
    },
    diag: function () {
      return {
        vb: '0 0 400 262', titulo: 'Diagrama de estados de la calculadora: 0 lee operando 1, 1 lee operando 2, 2 lee operación, 3 muestra el resultado',
        nodos: [
          { k: '0', x: 85, y: 66, w: 136, h: 46, rect: true, t1: '0 · lee operando 1', t2: 'Operando1 = PORTB &amp; 7' },
          { k: '1', x: 315, y: 66, w: 136, h: 46, rect: true, t1: '1 · lee operando 2', t2: 'Operando2 = PORTB &amp; 7' },
          { k: '2', x: 315, y: 194, w: 136, h: 46, rect: true, t1: '2 · lee operación', t2: 'RB3: 1 suma · 0 resta' },
          { k: '3', x: 85, y: 194, w: 136, h: 46, rect: true, t1: '3 · muestra', t2: 'PORTA = ~Resultado' }
        ],
        aristas: [
          { k: '0-1', d: 'M153,66 L245,66', lx: 199, ly: 58, txt: ['flanco ↑ RB4'] },
          { k: '1-2', d: 'M315,89 L315,169', lx: 322, ly: 126, an: 'start', txt: ['flanco', '↑ RB4'] },
          { k: '2-3', d: 'M247,194 L155,194', lx: 201, ly: 186, txt: ['flanco ↑ RB4'] },
          { k: '3-0', d: 'M85,171 L85,91', lx: 78, ly: 126, an: 'end', txt: ['siempre', '(1 vuelta)'] },
          { k: '0-0', d: 'M64,43 C54,10 116,10 106,43', lx: 85, ly: 12, txt: ['sin flanco'], cls: 'sfd-ar-bucle' },
          { k: '1-1', d: 'M294,43 C284,10 346,10 336,43', lx: 315, ly: 12, txt: ['sin flanco'], cls: 'sfd-ar-bucle' },
          { k: '2-2', d: 'M294,217 C284,250 346,250 336,217', lx: 315, ly: 259, txt: ['sin flanco'], cls: 'sfd-ar-bucle' }
        ]
      };
    },
    crear: function (ctx) {
      var ROL = ['dato b0', 'dato b1', 'dato b2', 'operación', 'validar'];
      var sw = [0, 0, 0, 0, 0];
      var estado, op1, op2, res, actual, porta, primera, iter, soltar, guion, ultOp, ultTxt, ultL, ultT, ultD;
      var io = ctx.q('.sfd-io');
      io.innerHTML =
        '<div class="sfd-bloque"><h4>Entradas · PORTB</h4>' +
          '<div class="sfd-sw" role="group" aria-label="Interruptores de PORTB">' +
          [4, 3, 2, 1, 0].map(function (b) {
            return '<button type="button" class="sfd-int" data-b="' + b + '" aria-pressed="false">' +
              '<span class="sfd-int-n">RB' + b + '</span><span class="sfd-int-pal" aria-hidden="true"></span>' +
              '<span class="sfd-int-v">0</span><span class="sfd-int-r">' + ROL[b] + '</span></button>';
          }).join('') + '</div>' +
          '<div class="sfd-fila-b"><button type="button" class="sfd-pulso">⇧ Pulso en RB4</button>' +
          '<button type="button" class="sfd-demo">Demo: 2 − 5 = −3</button></div>' +
          '<p class="sfd-lect sfd-lect-e"></p></div>' +
        '<div class="sfd-bloque"><h4>Salidas · LEDs (activos a nivel bajo)</h4>' +
          '<div class="sfd-leds">' + [3, 2, 1, 0].map(function (b) {
            return '<span class="sfd-led-c"><span class="sfd-led" data-led="' + b + '"></span><span class="sfd-led-n">RA' + b + '</span></span>';
          }).join('') + '</div><p class="sfd-lect sfd-lect-s"></p></div>' +
        '<div class="sfd-bloque"><h4>Variables</h4><dl class="sfd-vars"></dl></div>';

      var bInts = io.querySelectorAll('.sfd-int');
      io.querySelector('.sfd-sw').addEventListener('click', function (e) {
        var b = e.target.closest ? e.target.closest('.sfd-int') : null;
        if (!b) return;
        var k = +b.getAttribute('data-b');
        sw[k] = sw[k] ? 0 : 1;
        if (k === 4) soltar = false;
        guion = null;
        pintar();
      });
      io.querySelector('.sfd-pulso').addEventListener('click', function () {
        sw[4] = 1; soltar = true; guion = null;
        ctx.explicar('RB4 = 1: la próxima vuelta del <code>while (1)</code> llamará a <code>pulsado()</code> y verá el flanco 0 → 1 (si el estado lo lee). Después RB4 vuelve a 0 sola. Pulsa <b>Paso</b>.');
        pintar(true);
      });
      io.querySelector('.sfd-demo').addEventListener('click', function () {
        ctx.pausar();
        reiniciar();
        function v(d, rb4) { return [d & 1, (d >> 1) & 1, (d >> 2) & 1, 0, rb4]; }
        guion = [v(2, 0), v(2, 1), v(5, 0), v(5, 1), v(5, 0), v(5, 1), v(5, 0)];
        ctx.registrar('', 'Demo: dato 2 y validar, dato 5 y validar, RB3 = 0 (resta) y validar; luego el estado 3 escribe PORTA.');
        ctx.ejecutar();
      });

      function portb() { return sw[0] | (sw[1] << 1) | (sw[2] << 2) | (sw[3] << 3) | (sw[4] << 4); }
      function esResta(rb3) { return rb3 === 0; }
      function pulsado(pb, L) {
        var anterior = actual;
        if (primera) anterior = pb & 0x10;
        primera = false;
        actual = pb & 0x10;
        L.push('pf', 'p1', 'p2', 'p3');
        var r = anterior !== actual && anterior === 0;
        L.push(r ? 'p4' : 'p5');
        return { r: r, ant: anterior };
      }
      function txtPuls(p) {
        if (p.r) return '<code>pulsado()</code> → 1: flanco 0 → 1 en RB4 (anterior = 0, actual = 0x10)';
        return '<code>pulsado()</code> → 0 (RB4 = ' + (actual ? 1 : 0) + (p.ant && actual ? ', ya estaba a 1' : '') + '): sin flanco';
      }
      function resTxt(r) {
        var b = r & 15, c2 = b >= 8 ? b - 16 : b;
        return bin(b, 4) + ' = ' + b + ' sin signo' + (c2 < 0 ? ' = ' + ent(c2) + ' en C2' : '');
      }

      function paso() {
        if (guion && guion.length) { sw = guion.shift().slice(); soltar = false; }
        iter++;
        var pb = portb(), L = ['w'], T = [], D = [], e = estado, p, txt = '', tr = null;
        if (e === 0) {
          op1 = pb & 7; L.push('e0', 'e0a', 'e0b');
          p = pulsado(pb, L);
          txt = 'Estado 0: <code>Operando1 = PORTB &amp; 7</code> = ' + bin(op1, 3) + ' = ' + op1 + '. ' + txtPuls(p);
          if (p.r) { estado = 1; tr = '0-1'; T.push('e0b'); txt += ' → <b>estado 1</b>: Operando1 = ' + op1 + ' queda fijado.'; }
          else txt += ', sigue en el estado 0.';
        } else if (e === 1) {
          op2 = pb & 7; L.push('e1', 'e1a', 'e1b');
          p = pulsado(pb, L);
          txt = 'Estado 1: <code>Operando2 = PORTB &amp; 7</code> = ' + bin(op2, 3) + ' = ' + op2 + '. ' + txtPuls(p);
          if (p.r) { estado = 2; tr = '1-2'; T.push('e1b'); txt += ' → <b>estado 2</b>: Operando2 = ' + op2 + ' queda fijado.'; }
          else txt += ', sigue en el estado 1.';
        } else if (e === 2) {
          var rb3 = (pb & 8) ? 1 : 0, resta = esResta(rb3);
          res = resta ? op1 - op2 : op1 + op2; ultOp = resta ? '−' : '+';
          L.push('e2', 'e2r');
          if (resta) L.push('e2s');
          L.push('e2b');
          p = pulsado(pb, L);
          txt = 'Estado 2: RB3 = ' + rb3 + ' → <b>' + (resta ? 'resta' : 'suma') +
            '</b>: Resultado = ' + op1 + ' ' + ultOp + ' ' + op2 + ' = <b>' + ent(res) + '</b>. ' + txtPuls(p);
          if (p.r) { estado = 3; tr = '2-3'; T.push('e2b'); txt += ' → <b>estado 3</b>.'; }
          else txt += ', sigue en el estado 2 (el resultado se recalcula en cada vuelta).';
        } else {
          porta = (~res) & 0xFFFF; estado = 0; tr = '3-0';
          L.push('e3', 'e3a', 'e3b'); T.push('e3a', 'e3b');
          txt = 'Estado 3: <code>PORTA = ~Resultado</code> = ~(' + ent(res) + ') = ' + hex4(porta) + ' → RA3-RA0 = ' + bin(porta & 15, 4) +
            '. Luce cada LED cuyo bit vale 0: se lee <b>' + resTxt(res) + '</b>. <code>estado = 0</code> sin esperar a nada.';
        }
        if (soltar) { sw[4] = 0; soltar = false; }
        ultL = L; ultT = T; ultD = D; ultTxt = 'Vuelta ' + iter + '. ' + txt;
        if (tr) {
          ctx.diag.transicion(tr);
          ctx.registrar('vuelta ' + iter, 'Estado ' + e + ' → ' + estado + '. ' + txt);
        }
        if (guion && !guion.length) {
          guion = null;
          if (ctx.corriendo()) ctx.pausar();
          ctx.registrar('', 'Fin de la demo: 2 − 5 = −3 → PORTA = ' + hex4((~(-3)) & 0xFFFF) + ' → lucen RA3, RA2 y RA0 (1101).', 'sfd-log-ok');
        }
      }

      var acc = 0;
      function avanzar(dt) {
        acc += dt * ctx.vel() / 1000;
        var n = Math.floor(acc);
        if (n > 0) { acc -= n; for (var i = 0; i < Math.min(n, 5); i++) paso(); }
      }

      function reiniciar() {
        estado = 0; op1 = 0; op2 = 0; res = 0; actual = 0; porta = null; primera = true; iter = 0;
        soltar = false; guion = null; ultOp = null; ultL = []; ultT = []; ultD = []; acc = 0;
        sw = [0, 0, 0, 0, 0];
        ultTxt = 'Programa recién arrancado: <code>estado = 0</code>, <code>actual = 0</code>; PORTA aún no se ha escrito. Pon un dato en RB2-RB0 y valida con un flanco 0 → 1 en RB4.';
        ctx.limpiarLog();
        if (ctx.diag) ctx.diag.transicion('');
      }
      function modo(inicial) {
        ctx.diagrama(CALC.diag());
        if (inicial) reiniciar();
      }

      function pintar(sinExpl) {
        var pb = portb();
        for (var i = 0; i < bInts.length; i++) {
          var b = +bInts[i].getAttribute('data-b');
          bInts[i].setAttribute('aria-pressed', String(!!sw[b]));
          bInts[i].querySelector('.sfd-int-v').textContent = sw[b];
          bInts[i].setAttribute('aria-label', 'RB' + b + ' (' + ROL[b] + ') = ' + sw[b]);
        }
        var rb3 = sw[3];
        io.querySelector('.sfd-lect-e').innerHTML = 'PORTB = ' + hex4(pb) + ' · dato = RB2 RB1 RB0 = ' + bin(pb & 7, 3) + ' = ' + (pb & 7) +
          ' · RB3 = ' + rb3 + ' → ' + (esResta(rb3) ? 'resta' : 'suma');
        var leds = io.querySelectorAll('.sfd-led');
        for (var j = 0; j < leds.length; j++) {
          var k = +leds[j].getAttribute('data-led');
          var on = porta == null ? null : !((porta >> k) & 1);
          leds[j].className = 'sfd-led' + (on == null ? ' sfd-led-x' : on ? ' sfd-led-on' : '');
          leds[j].setAttribute('aria-label', 'LED RA' + k + ': ' + (on == null ? 'desconocido' : on ? 'encendido' : 'apagado'));
          leds[j].setAttribute('role', 'img');
          leds[j].textContent = on == null ? '?' : '';
        }
        io.querySelector('.sfd-lect-s').innerHTML = porta == null ? 'PORTA no se ha escrito todavía (estado 3): LEDs desconocidos.' :
          'PORTA = ' + hex4(porta) + ' → RA3-RA0 = ' + bin(porta & 15, 4) + '; LEDs encendidos (1 = luce): <b>' + resTxt((~porta) & 15) + '</b>';
        io.querySelector('.sfd-vars').innerHTML =
          '<dt>estado</dt><dd>' + estado + '</dd><dt>Operando1</dt><dd>' + op1 + ' (' + bin(op1, 3) + ')</dd>' +
          '<dt>Operando2</dt><dd>' + op2 + ' (' + bin(op2, 3) + ')</dd>' +
          '<dt>Resultado</dt><dd>' + ent(res) + ' (' + bin(res & 15, 4) + ')</dd>' +
          '<dt>actual</dt><dd>' + (actual ? '0x10' : '0') + '</dd><dt>vueltas</dt><dd>' + iter + '</dd>';
        ctx.diag.activos([String(estado)]);
        ctx.cod.marcar({ act: ultL, tr: ultT, dif: ultD });
        ctx.cod.enfocar('e' + estado);
        if (!sinExpl) ctx.explicar(ultTxt);
      }

      return { paso: paso, avanzar: avanzar, reiniciar: reiniciar, modo: modo, pintar: function () { pintar(); } };
    }
  };

  // ======================================================================================
  // 2) ESPANTADOR (19.6.2)
  // ======================================================================================
  var SEQ = [
    { dc: 3, lim: 0, a: 0 },
    { dc: 5, lim: 1000, a: 90 }, { dc: 1, lim: 1000, a: -90 }, { dc: 3, lim: 1000, a: 0 },
    { dc: 4, lim: 500, a: 45 }, { dc: 2, lim: 500, a: -45 }, { dc: 3, lim: 500, a: 0 }
  ];
  var ESP_COD = (function () {
    var c = [
      '|#include "config.h"',
      '|',
      '|void inicializa_driver_espantador(void);',
      '|void actua_servo(int servo);',
      '|void para_servo(int servo);',
      '|',
      '|// este es un ejemplo de main que usa el driver. No hay que completar.',
      '|int main(void)',
      '|{',
      '|    InicializarReloj();     // F_CY = 40 MHz',
      '|    AD1PCFGL = 0xFFFF;      // todos los pines en digital',
      '|    inicializa_driver_espantador();',
      '|    while (1) {',
      '|        actua_servo(1);',
      '|        para_servo(1);',
      '|    }',
      '|    return 0;',
      '|}',
      '|//---------------- DRIVER del espantador',
      '|// aquí van las variables globales del driver',
      '|static volatile int estado[3];      // servo n -> estado[n - 1]',
      '|static volatile int cont[3];',
      '|static int DC[3];',
      '|static int tick = 0;',
      '|',
      '|// función que inicializa el driver',
      '|void inicializa_driver_espantador(void)',
      '|{',
      '|    int servo;',
      'ini|    TRISB &= ~0x000E;          // RB1-RB3 como salidas (servos 1-3)',
      'ini|    T1CON = 0x8000;',
      'ini|    PR1 = 20000;',
      '|    TMR1 = 0;',
      '|    IFS0bits.T1IF = 0;',
      '|    IEC0bits.T1IE = 1;',
      '|    for (servo = 0; servo < 3; servo++) {',
      '|        estado[servo] = 0;',
      '|    }',
      '|}',
      '|',
      '|// int servo: indica el servo que debe ser actuado (1, 2 o 3)',
      '|// activa el servo',
      'a0|void actua_servo(int servo)',
      '|{',
      'a1|    estado[servo - 1] = 1;',
      'a2|    cont[servo - 1] = 0;',
      '|}',
      '|',
      '|// int servo: indica el servo que debe ser parado (1, 2 o 3)',
      '|// desactiva el servo',
      's0|void para_servo(int servo)',
      '|{',
      's1|    estado[servo - 1] = 0;',
      '|}',
      '|',
      '|// gestiona cada uno de los servos y la secuencia de funcionamiento',
      'isr|void __attribute__((interrupt, no_auto_psv)) _T1Interrupt(void)',
      '|{',
      '|    int servo;',
      '|    unsigned int salida;',
      'flag|    IFS0bits.T1IF = 0;',
      'tk|    tick++;',
      'rst|    if (tick >= 40) tick = 0;    // 40 · 0,5 ms = 20 ms (50 Hz)',
      'rd|    salida = PORTB;',
      'for|    for (servo = 0; servo < 3; servo++) {',
      'cnt|        cont[servo]++;',
      'b0|        if (estado[servo] == 0) {          // reposo',
      'd0|            DC[servo] = 3;'
    ];
    for (var e = 1; e <= 6; e++) {
      c.push('b' + e + '|        } else if (estado[servo] == ' + e + ') {',
        'd' + e + '|            DC[servo] = ' + SEQ[e].dc + ';',
        'c' + e + '|            if (cont[servo] > ' + SEQ[e].lim + ') {',
        't' + e + '|                estado[servo] = ' + (e === 6 ? 1 : e + 1) + ';',
        't' + e + '|                cont[servo] = 0;',
        '|            }');
    }
    c.push('|        }',
      'on|        if (tick < DC[servo]) salida |= (1 << (servo + 1));',
      'off|        else salida &= ~(1 << (servo + 1));',
      '|    }',
      'wr|    PORTB = salida;',
      '|}');
    return c;
  })();

  var ESP = {
    def: {
      titulo: 'Espantador: tres servos con PWM por software',
      sub: 'problema 19.6.2',
      intro: 'Timer 1 con <code>T1CON = 0x8000</code> y <code>PR1 = 20000</code>: una interrupción (tick) cada 20 000 / 40 MHz = 0,5 ms; 40 ticks = 20 ms (50 Hz). ' +
        'Cada servo tiene su propia máquina de estados; <code>DC</code> = 1…5 ticks a 1 ↔ 0,5…2,5 ms ↔ −90°, −45°, 0°, +45°, +90°. ' +
        'Secuencia: +90° 0,5 s · −90° 0,5 s · 0° 0,5 s · +45° 0,25 s · −45° 0,25 s · 0° 0,25 s y vuelta a empezar.',
      vels: [[1, '×1 (tiempo real)'], [0.25, '×1/4'], [0.05, '×1/20'], [0.0025, '×1/400 (1 tick = 0,2 s)']], velDef: 0.25,
      pasos: [['tick', '1 tick (0,5 ms)'], ['periodo', 'hasta fin de periodo (20 ms)'], ['tr', 'hasta la próxima transición']],
      seguir: 'Seguir en el código',
      pasoTxt: 'Cada tick es una ejecución de <code>_T1Interrupt</code>. Los botones del driver llaman a <code>actua_servo(n)</code> y <code>para_servo(n)</code>, con n = 1, 2 o 3.',
      figcap: 'Máquina de estados de cada servo; las fichas numeradas marcan en qué estado está cada uno',
      codTit: 'Código (19.6.2) con la rama activa del servo seguido',
      codigo: ESP_COD
    },
    diag: function () {
      var n = function (k, x, y, t1, t2, fy, w) { return { k: k, x: x, y: y, w: w || 68, h: 46, t1: t1, t2: t2, fy: fy }; };
      return {
        vb: '0 0 420 262', titulo: 'Máquina de estados de un servo: reposo y los seis pasos de la secuencia',
        extra: ['<text x="275" y="124" class="sfd-ar-t sfd-centro">0,5 s = cont &gt; 1000</text>',
          '<text x="275" y="137" class="sfd-ar-t sfd-centro">0,25 s = cont &gt; 500</text>',
          '<text x="275" y="150" class="sfd-ar-t sfd-centro">(1 tick = 0,5 ms)</text>'],
        nodos: [
          n('R', 52, 130, '0 · reposo', 'DC = 3 · 0°', null, 84),
          n('1', 215, 40, '1 · +90°', 'DC = 5'), n('2', 335, 40, '2 · −90°', 'DC = 1'),
          n('3', 385, 130, '3 · 0°', 'DC = 3'), n('4', 335, 220, '4 · +45°', 'DC = 4', 245),
          n('5', 215, 220, '5 · −45°', 'DC = 2', 245), n('6', 165, 130, '6 · 0°', 'DC = 3')
        ],
        aristas: [
          { k: '1-2', d: 'M249,40 L299,40', lx: 274, ly: 32, txt: ['0,5 s'] },
          { k: '2-3', d: 'M356,58 L372,108', lx: 373, ly: 78, an: 'start', txt: ['0,5 s'] },
          { k: '3-4', d: 'M372,152 L356,199', lx: 373, ly: 184, an: 'start', txt: ['0,5 s'] },
          { k: '4-5', d: 'M301,220 L251,220', lx: 276, ly: 212, txt: ['0,25 s'] },
          { k: '5-6', d: 'M200,199 L178,152', lx: 180, ly: 184, an: 'end', txt: ['0,25 s'] },
          { k: '6-1', d: 'M178,109 L200,62', lx: 180, ly: 80, an: 'end', txt: ['0,25 s'] },
          { k: 'R-1', d: 'M78,112 Q118,44 179,38', lx: 102, ly: 58, an: 'end', txt: ['actua_servo'] },
          { k: 'para', d: 'M188,238 Q100,252 62,154', lx: 120, ly: 258, txt: ['para_servo (desde 1-6)'] }
        ]
      };
    },
    crear: function (ctx) {
      var COL = ['sfd-f0', 'sfd-f1', 'sfd-f2', 'sfd-f3'];   // por pin: RB0 (sin servo), RB1-RB3 (servos 1-3)
      var est, cont, DC, tick, ticks, nivel, buf, prev, anchoT, ang, objetivo, senal, accT, ultIsr, trs, ultTrReal, ultAcc;

      var io = ctx.q('.sfd-io');
      io.innerHTML =
        '<div class="sfd-bloque"><h4>Driver</h4><div class="sfd-drv" role="group" aria-label="Llamadas al driver">' +
          [1, 2, 3].map(function (n) {
            return '<div class="sfd-drv-f"><span class="sfd-drv-n ' + COL[n] + '">Servo ' + n + '</span>' +
              '<button type="button" data-act="' + n + '">actua_servo(' + n + ')</button>' +
              '<button type="button" data-para="' + n + '">para_servo(' + n + ')</button></div>';
          }).join('') +
          '<div class="sfd-drv-todos"><button type="button" data-todos="1">Actuar los tres</button>' +
          '<button type="button" data-escalon="1">Actuar desfasados (0 / 0,25 / 0,5 s)</button></div></div></div>' +
        '<div class="sfd-bloque"><h4>Variables del driver</h4><p class="sfd-lect sfd-reloj"></p>' +
          '<div class="sfd-tabla-w"><table class="sfd-tabla"><thead><tr><th scope="col">índice</th><th scope="col">estado</th><th scope="col">cont</th><th scope="col">DC</th><th scope="col">pin</th></tr></thead><tbody></tbody></table></div></div>';
      var ex = ctx.q('.sfd-extra');
      ex.innerHTML =
        '<div class="sfd-servos">' + [1, 2, 3].map(function (s) {
          return '<figure class="sfd-servo" data-s="' + s + '">' + dial() + '<figcaption><b class="' + COL[s] + '">Servo ' + s + ' · RB' + s + '</b><span class="sfd-servo-e"></span></figcaption></figure>';
        }).join('') + '</div>' +
        '<figure class="sfd-fig sfd-osc"><div class="sfd-osc-svg"></div><figcaption>Salidas RB0-RB3 durante un periodo de 20 ms (40 ticks); la línea vertical es el tick actual</figcaption></figure>';

      // pendientes de «actuar desfasados»: [{tick objetivo, n}]
      var programados = [];
      io.querySelector('.sfd-drv').addEventListener('click', function (e) {
        var b = e.target.closest ? e.target.closest('button') : null;
        if (!b) return;
        if (b.hasAttribute('data-act')) actua(+b.getAttribute('data-act'));
        else if (b.hasAttribute('data-para')) para(+b.getAttribute('data-para'));
        else if (b.hasAttribute('data-todos')) { actua(1); actua(2); actua(3); }
        else if (b.hasAttribute('data-escalon')) {
          actua(1);
          programados = [{ t: ticks + 500, n: 2 }, { t: ticks + 1000, n: 3 }];
          ctx.registrar(tiempo(), 'Se programan <code>actua_servo(2)</code> dentro de 0,25 s y <code>actua_servo(3)</code> dentro de 0,5 s: cada servo va por su paso, independiente de los demás.');
        }
        pintar();
      });

      function tiempo() { return 't = ' + fijo(ticks * 0.5 / 1000, 4) + NBSP + 's'; }
      function pinDe(i) { return i + 1; }
      function nomMaq(i) { return 'servo ' + (i + 1); }
      function nomEst(e) { return e === 0 ? 'reposo' : e + ' (' + grados(SEQ[e].a) + ')'; }

      function transicion(i, de, a, por) {
        trs.push({ i: i, de: de, a: a });
        var k = por === 'para' ? 'para' : (de === 0 && a === 1 ? 'R-1' : de + '-' + a);
        if (por === 'actua' && de !== 0) k = 'restart';
        ctx.diag.transicion(k);
        if (i === ctx.seguir()) ultTrReal = { t: ahora(), de: de, a: a, por: por };
        var por2 = por === 'actua' ? '<code>actua_servo</code>' : por === 'para' ? '<code>para_servo</code>' :
          'cont = ' + (SEQ[de].lim + 1) + ' &gt; ' + SEQ[de].lim + ' (' + seg((SEQ[de].lim + 1) * 0.5, 4) + ')';
        ctx.registrar(tiempo(), '<b class="' + COL[pinDe(i)] + '">' + nomMaq(i) + '</b>: estado ' + nomEst(de) + ' → ' + nomEst(a) + ' por ' + por2 +
          '; DC = ' + SEQ[a].dc + ' → pulso de ' + fx(SEQ[a].dc * 0.5, 1) + NBSP + 'ms en RB' + pinDe(i) + '.');
      }
      function indice(n) { return n - 1; }
      function actua(n) {
        var i = indice(n);
        ultAcc = { t: ahora(), k: ['a0', 'a1', 'a2'] };
        var de = est[i];
        est[i] = 1; cont[i] = 0;
        transicion(i, de, 1, 'actua');
      }
      function para(n) {
        var i = indice(n);
        ultAcc = { t: ahora(), k: ['s0', 's1'] };
        var de = est[i];
        if (de === 0) { ctx.registrar(tiempo(), nomMaq(i) + ' ya estaba en reposo.'); return; }
        est[i] = 0;
        transicion(i, de, 0, 'para');
      }

      function isr() {
        var f = ctx.seguir();
        ticks++;
        for (var p = 0; p < programados.length; p++) if (programados[p].t === ticks) actua(programados[p].n);
        programados = programados.filter(function (x) { return x.t > ticks; });
        tick++;
        if (tick >= 40) tick = 0;
        var t = tick;
        for (var i = 0; i < 3; i++) {
          cont[i]++;
          var e = est[i], tr = false;
          DC[i] = SEQ[e].dc;
          if (e > 0 && cont[i] > SEQ[e].lim) {
            var a = e === 6 ? 1 : e + 1;
            est[i] = a; cont[i] = 0; tr = true;
            transicion(i, e, a, 'cont');
          }
          nivel[pinDe(i)] = t < DC[i] ? 1 : 0;
          if (i === f) ultIsr = { e: e, tr: tr, on: t < DC[i], t: t, dc: DC[i] };
        }
        nivel[0] = 0;   // pin que nadie escribe
        for (var q = 0; q < 4; q++) buf[q][t] = nivel[q];
        if (t === 0) {
          for (var r = 0; r < 4; r++) {
            var s = 0;
            for (var k = 0; k < 40; k++) s += buf[r][k];
            anchoT[r] = s;
            prev[r] = buf[r].slice();
          }
          for (var sv = 1; sv <= 3; sv++) {
            var w = anchoT[sv];
            senal[sv] = w === 0 ? 'sin' : w === 40 ? 'cont' : 'ok';
            if (w > 0 && w < 40) objetivo[sv] = Math.max(-90, Math.min(90, (w * 0.5 - 1.5) * 90));
          }
        }
        for (var m = 1; m <= 3; m++) {
          if (senal[m] !== 'ok') continue;
          var d = objetivo[m] - ang[m];
          ang[m] += Math.max(-0.3, Math.min(0.3, d));   // 600°/s: 0,3° por tick
        }
      }

      function paso() {
        var modo = ctx.tamPaso(), n0 = trs.length;
        if (modo === 'tick') isr();
        else if (modo === 'periodo') { do { isr(); } while (tick !== 0); }
        else {
          var max = 6000, k = 0;
          while (trs.length === n0 && k < max) { isr(); k++; }
          if (trs.length === n0) ctx.registrar(tiempo(), 'Ningún servo cambia de estado en 3 s: están en reposo. Pulsa <code>actua_servo</code>.');
        }
      }
      function avanzar(dt) {
        accT += dt * ctx.vel();
        var n = Math.floor(accT / 0.5);
        if (n > 400) { n = 400; accT = 0; } else accT -= n * 0.5;
        for (var i = 0; i < n; i++) isr();
      }
      function reiniciar() {
        est = [0, 0, 0]; cont = [0, 0, 0]; DC = [3, 3, 3]; tick = 0; ticks = 0; accT = 0;
        nivel = [0, 0, 0, 0]; buf = []; prev = []; anchoT = [null, null, null, null];
        for (var p = 0; p < 4; p++) { buf.push(new Array(40).fill(0)); prev.push(new Array(40).fill(0)); }
        ang = [0, 0, 0, 0]; objetivo = [0, 0, 0, 0]; senal = ['sin', 'sin', 'sin', 'sin'];
        ultIsr = null; trs = []; ultTrReal = null; ultAcc = null; programados = [];
        ctx.limpiarLog();
        if (ctx.diag) ctx.diag.transicion('');
      }
      function modo(inicial) {
        ctx.diagrama(ESP.diag());
        ctx.opcionesSeguir([[0, 'servo 1 (RB1)'], [1, 'servo 2 (RB2)'], [2, 'servo 3 (RB3)']], 0);
        reiniciar();
      }

      // ---------- dibujo del osciloscopio ----------
      var X0 = 80, X1 = 392, DX = (X1 - X0) / 40;
      (function osc() {
        var h = '<svg viewBox="0 0 400 156" class="sfd-svg sfd-osc-s" role="img" aria-label="Señales PWM de RB0 a RB3 durante un periodo de 20 ms">';
        for (var t = 0; t <= 40; t += 5) {
          var x = X0 + t * DX;
          h += '<line x1="' + x + '" y1="14" x2="' + x + '" y2="136" class="sfd-rej' + (t % 10 ? '' : ' sfd-rej-f') + '"/>';
          if (t % 10 === 0) h += '<text x="' + x + '" y="148" class="sfd-eje-t">' + (t / 2) + '</text>';
        }
        h += '<rect x="' + (X0 + DX) + '" y="10" width="' + (4 * DX) + '" height="4" class="sfd-banda"/>' +
          '<text x="' + (X0 + 5 * DX + 4) + '" y="14" class="sfd-banda-t">0,5-2,5 ms (DC = 1-5)</text>';
        for (var p = 0; p < 4; p++) {
          var y = 18 + p * 30;
          h += '<text x="4" y="' + (y + 11) + '" class="sfd-osc-n"></text><text x="4" y="' + (y + 23) + '" class="sfd-osc-w"></text>' +
            '<path class="sfd-onda sfd-onda-' + p + '" d=""/>';
        }
        h += '<text x="4" y="148" class="sfd-osc-w">t (ms)</text><line class="sfd-cursor" x1="0" y1="14" x2="0" y2="138"/></svg>';
        ctx.q('.sfd-osc-svg').innerHTML = h;
      })();
      var ondas = [0, 1, 2, 3].map(function (p) { return ctx.q('.sfd-onda-' + p); });
      var nOsc = ctx.q('.sfd-osc-svg').querySelectorAll('.sfd-osc-n');
      var wOsc = ctx.q('.sfd-osc-svg').querySelectorAll('.sfd-osc-w');
      var cursor = ctx.q('.sfd-cursor');
      var servos = ctx.q('.sfd-servos').querySelectorAll('.sfd-servo');

      function pintar() {
        var f = ctx.seguir();
        // osciloscopio
        for (var p = 0; p < 4; p++) {
          var yh = 21 + p * 30, yl = 39 + p * 30, d = '', last = null;
          for (var t = 0; t < 40; t++) {
            var v = t < tick ? buf[p][t] : prev[p][t], y = v ? yh : yl, x = X0 + t * DX;
            d += (t === 0 ? 'M' + x + ',' + y : (v !== last ? ' L' + x + ',' + (last ? yh : yl) + ' L' + x + ',' + y : '')); last = v;
          }
          d += ' L' + X1 + ',' + (last ? yh : yl);
          ondas[p].setAttribute('d', d);
          var servoP = p >= 1 ? 'servo ' + p : 'sin servo';
          var maq = p >= 1 ? '' : 'nadie';
          nOsc[p].textContent = 'RB' + p + ' ' + servoP;
          ondas[p].setAttribute('class', 'sfd-onda sfd-onda-' + p + ' ' + COL[p] + (maq === 'nadie' ? ' sfd-onda-off' : ''));
          var w = anchoT[p];
          wOsc[p].textContent = maq === 'nadie' ? 'no se escribe' : (w == null ? '—' : w === 0 ? 'sin pulso' : fx(w * 0.5, 1) + NBSP + 'ms') + (maq ? ' · ' + maq : '');
        }
        cursor.setAttribute('x1', X0 + tick * DX); cursor.setAttribute('x2', X0 + tick * DX);
        // servos
        for (var s = 1; s <= 3; s++) {
          var caja = servos[s - 1], i = s - 1;
          girar(caja, ang[s], grados(ang[s]));
          var et = senal[s] === 'sin' ? (anchoT[s] == null ? 'esperando el primer periodo' : 'sin pulsos: sin par') :
            senal[s] === 'cont' ? 'señal fija a 1: no válida' : 'pulso ' + fx(anchoT[s] * 0.5, 1) + NBSP + 'ms → ' + grados(objetivo[s]);
          var txt = 'estado ' + est[i] + ' · ' + et;
          var sp = caja.querySelector('.sfd-servo-e');
          if (sp.textContent !== txt) sp.textContent = txt;
          caja.classList.toggle('sfd-servo-mal', senal[s] !== 'ok' && anchoT[s] != null);
        }
        // tabla
        var filas = '';
        for (var j = 0; j < 3; j++) {
          var pin = pinDe(j);
          filas += '<tr' + (j === f ? ' class="sfd-fila-seg"' : '') + '><th scope="row" class="' + COL[pin] + '">servo ' + (j + 1) + '</th><td>' + nomEst(est[j]) +
            '</td><td>' + cont[j] + (est[j] ? ' / ' + SEQ[est[j]].lim : '') + '</td><td>' + DC[j] + '</td><td>RB' + pin + ' = ' + nivel[pin] + '</td></tr>';
        }
        var tb = io.querySelector('.sfd-tabla tbody');
        if (tb.innerHTML !== filas) tb.innerHTML = filas;
        io.querySelector('.sfd-reloj').innerHTML = tiempo() + ' · ' + agrupar(ticks) + ' interrupciones · tick = ' + tick + ' de 0..39';
        // diagrama
        var fichas = [], act = [];
        for (var m = 0; m < 3; m++) {
          var nn = est[m] === 0 ? 'R' : String(est[m]);
          fichas.push({ n: nn, txt: String(m + 1), c: COL[pinDe(m)] + (m === f ? ' sfd-ficha-seg' : '') });
          act.push(nn);
        }
        ctx.diag.fichas(fichas);
        ctx.diag.activos(act);
        // código
        var L = [], T = [], now = ahora();
        if (ultIsr) {
          L = ['isr', 'flag', 'tk', 'rst', 'rd', 'for', 'cnt', 'b' + ultIsr.e, 'd' + ultIsr.e];
          if (ultIsr.e > 0) L.push('c' + ultIsr.e);
          if (ultIsr.tr) { L.push('t' + ultIsr.e); T.push('t' + ultIsr.e); }
          L.push(ultIsr.on ? 'on' : 'off', 'wr');
        }
        if (ultTrReal && now - ultTrReal.t < 700 && ultTrReal.por === 'cont') T.push('c' + ultTrReal.de, 't' + ultTrReal.de);
        if (ultAcc && now - ultAcc.t < 900) T = T.concat(ultAcc.k);
        ctx.cod.marcar({ act: L, tr: T });
        ctx.cod.enfocar(ultIsr ? 'b' + ultIsr.e : 'isr');
        // explicación
        var x;
        if (!ultIsr) x = 'Driver inicializado: los tres servos en reposo (<code>estado = 0</code>, DC = 3 → 1,5 ms → 0°). Pulsa <code>actua_servo(n)</code> y luego <b>Paso</b> o <b>Ejecutar</b>.';
        else {
          var e2 = est[f];
          x = tiempo() + ' · último tick = ' + ultIsr.t + '. <b>' + nomMaq(f) + '</b>: ' +
            (ultIsr.tr ? 'acaba de pasar del estado ' + nomEst(ultIsr.e) + ' al ' + nomEst(e2) + '. ' : 'estado ' + nomEst(e2) + ', cont = ' + cont[f] + (e2 ? ' (cambia cuando cont &gt; ' + SEQ[e2].lim + ')' : '') + '. ') +
            'DC = ' + ultIsr.dc + (ultIsr.tr ? ' (el del estado anterior: el código asigna DC antes de comprobar cont)' : '') + ' → <code>tick &lt; DC</code> = (' + ultIsr.t + ' &lt; ' + ultIsr.dc + ') → RB' + pinDe(f) + ' = ' + (ultIsr.on ? 1 : 0) + '.';
        }
        ctx.explicar(x);
      }

      return { paso: paso, avanzar: avanzar, reiniciar: reiniciar, modo: modo, pintar: pintar };
    }
  };

  // ======================================================================================
  // 3) ESPANTAPÁJAROS (19.6.3)
  // ======================================================================================
  var EPJ_COD = [
    '|#include "config.h"',
    '|#include "detectores.h"                 // get_medida() e inicializa_driver_detectores() (15.4.1)',
    '|void inicializa_driver_espantador(void);    // driver del espantador (19.6.2)',
    '|void actua_servo(int servo);',
    '|void para_servo(int servo);',
    '|',
    '|#define DEC_ACTUA     50                // 50 · 0,1 s = 5 s',
    '|#define DEC_BLOQUEO  100                // 100 · 0,1 s = 10 s',
    '|',
    '|volatile unsigned int decimas = 0;      // reloj del sistema: +1 cada 0,1 s',
    '|',
    '|int servo_asoc1[3] = {1, 2, 3};',
    '|int servo_asoc2[3] = {3, 1, 2};',
    '|int bloqueado[3];                       // máquina de cada detector: 0 reposo, 1 bloqueado',
    '|unsigned int t_det[3];                  // instante de su última actuación',
    '|int activo[3];                          // máquina de cada espantador: 0 parado, 1 actuando',
    '|unsigned int t_esp[3];                  // instante en que se (re)arrancó',
    '|',
    'arr0|void arranca_espantador(int n, unsigned int ahora)     // n = 1, 2 o 3',
    '|{',
    'arr1|    actua_servo(n);                     // (re)empieza la secuencia desde el paso 1',
    'arr2|    activo[n - 1] = 1;',
    'arr3|    t_esp[n - 1] = ahora;',
    '|}',
    '|',
    '|int main(void)',
    '|{',
    '|    int det, esp, flanco;',
    '|    unsigned int ahora;',
    '|',
    '|    InicializarReloj();',
    '|    AD1PCFGL = 0xFFFF;',
    '|    inicializa_driver_detectores();',
    '|    inicializa_driver_espantador();',
    '|    T2CON = 0x8030;                     // pre-escalado 1:256 (6,4 µs)',
    '|    PR2 = 15625;                        // 15 625 · 6,4 µs = 0,1 s',
    '|    TMR2 = 0;',
    '|    IFS0bits.T2IF = 0;',
    '|    IEC0bits.T2IE = 1;',
    'w|    while (1) {',
    'rd|        ahora = decimas;                // 16 bits: se lee en una sola instrucción',
    'fdet|        for (det = 0; det < 3; det++) {',
    'g|            flanco = get_medida(det + 1);   // siempre: el driver guarda el valor anterior',
    'bc|            if (bloqueado[det] && ahora - t_det[det] >= DEC_BLOQUEO)',
    'bc|                bloqueado[det] = 0;',
    'fl|            if (!bloqueado[det] && flanco) {',
    'fl1|                bloqueado[det] = 1;',
    'fl2|                t_det[det] = ahora;',
    'fl3|                arranca_espantador(servo_asoc1[det], ahora);',
    'fl4|                arranca_espantador(servo_asoc2[det], ahora);',
    '|            }',
    '|        }',
    'fesp|        for (esp = 0; esp < 3; esp++) {',
    'ec|            if (activo[esp] && ahora - t_esp[esp] >= DEC_ACTUA) {',
    'ep|                para_servo(esp + 1);',
    'ep|                activo[esp] = 0;',
    '|            }',
    '|        }',
    '|    }',
    '|}',
    '|',
    'isr|void __attribute__((interrupt, no_auto_psv)) _T2Interrupt(void)',
    '|{',
    'isr|    IFS0bits.T2IF = 0;',
    'isr|    decimas++;',
    '|}'
  ];
  var ASOC1 = [1, 2, 3], ASOC2 = [3, 1, 2];
  var SECUENCIA = [[500, 90], [500, -90], [500, 0], [250, 45], [250, -45], [250, 0]];   // ms, grados
  var CRONO = [{ d: 0, t1: 5000, t2: 6000 }, { d: 1, t1: 7000, t2: 8000 }, { d: 0, t1: 13000, t2: 16000 }];

  var EPJ = {
    def: {
      titulo: 'Espantapájaros: tres detectores, tres máquinas de estados',
      sub: 'problema 19.6.3',
      intro: 'Detectores por flanco de subida (15.4.1) y espantadores de 19.6.2. Detector 1 → espantadores 1 y 3; detector 2 → 2 y 1; detector 3 → 3 y 2. ' +
        'Cada detector tiene su máquina: reposo, bloqueado mientras actúa (5 s) y bloqueado en espera (hasta 10 s desde el inicio; los flancos no cuentan). ' +
        'Cada espantador se para 5 s después de su última activación. El reloj del sistema (<code>decimas</code>) avanza cada 0,1 s con el Timer 2. ' +
        'Cronograma supuesto: detector 1 a 1 de 5 a 6 s y de 13 a 16 s; detector 2, de 7 a 8 s.',
      vels: [[1, '×1 (tiempo real)'], [2, '×2'], [5, '×5']], velDef: 2,
      seguir: 'Seguir en el código',
      pasoTxt: 'Cada <b>Paso</b> avanza hasta el siguiente suceso (flanco o cambio de estado), como mucho 0,5 s. Los botones de detector generan un pulso de 1 s.',
      figcap: 'Máquina de estados de cada detector; las fichas M1-M3 marcan el estado de cada máquina',
      codTit: 'Código (19.6.3) con la rama activa de la máquina seguida',
      codigo: EPJ_COD
    },
    diag: function () {
      return {
        vb: '0 0 420 268', titulo: 'Máquina de estados de un detector: 0 reposo, 1 actuando, 2 espera',
        nodos: [
          { k: '0', x: 75, y: 130, w: 122, h: 50, t1: '0 · reposo', t2: 'espera un flanco' },
          { k: '1', x: 300, y: 70, w: 130, h: 50, t1: '1 · actuando', t2: 'durante 5 s' },
          { k: '2', x: 300, y: 192, w: 130, h: 50, t1: '2 · espera', t2: 'hasta 10 s', fy: 222 }
        ],
        aristas: [
          { k: '0-1', d: 'M112,111 Q170,62 233,66', lx: 156, ly: 56, txt: ['flanco ↑ detector', 'actua_servo × 2'] },
          { k: '1-2', d: 'M300,95 L300,165', lx: 308, ly: 128, an: 'start', txt: ['5 s'] },
          { k: '2-0', d: 'M236,202 Q140,216 98,156', lx: 140, ly: 226, txt: ['10 s desde el inicio'] },
          { k: '1-1', d: 'M282,46 C272,8 328,8 318,46', lx: 268, ly: 20, an: 'end', txt: ['flanco ignorado'], cls: 'sfd-ar-bucle' },
          { k: '2-2', d: 'M282,216 C272,252 328,252 318,216', lx: 300, ly: 264, txt: ['flanco ignorado'], cls: 'sfd-ar-bucle' }
        ]
      };
    },
    crear: function (ctx) {
      var COLM = ['sfd-f1', 'sfd-f2', 'sfd-f3'];
      var t, det, pulsos, M, sv, accT, evento, crono, hist, marcas, subida, ultPara, ultTr, fin;

      var io = ctx.q('.sfd-io');
      io.innerHTML =
        '<div class="sfd-bloque"><h4>Detectores (flanco de subida)</h4><div class="sfd-dets" role="group" aria-label="Detectores">' +
          [0, 1, 2].map(function (d) {
            return '<button type="button" class="sfd-det" data-d="' + d + '"><span class="sfd-det-led" aria-hidden="true"></span>' +
              '<span>Detector ' + (d + 1) + ' · RB' + d + '</span><small>→ espantadores ' + ASOC1[d] + ' y ' + ASOC2[d] + '</small></button>';
          }).join('') + '</div>' +
          '<div class="sfd-fila-b"><button type="button" class="sfd-crono">▶ Cronograma del enunciado</button></div>' +
          '<p class="sfd-lect sfd-reloj"></p></div>' +
        '<div class="sfd-bloque"><h4>Máquinas</h4><div class="sfd-tabla-w"><table class="sfd-tabla"><thead><tr><th scope="col">máquina</th><th scope="col">estado</th><th scope="col">tiempo</th><th scope="col">detector</th></tr></thead><tbody></tbody></table></div></div>';
      var ex = ctx.q('.sfd-extra');
      ex.innerHTML =
        '<figure class="sfd-fig sfd-tl"><div class="sfd-tl-svg"></div><figcaption>Línea de tiempo (ventana de 20 s): detectores, estado de cada máquina y espantadores en marcha</figcaption></figure>' +
        '<div class="sfd-servos sfd-suave">' + [1, 2, 3].map(function (s) {
          return '<figure class="sfd-servo" data-s="' + s + '">' + dial() + '<figcaption><b>Espantador ' + s + '</b><span class="sfd-servo-e"></span></figcaption></figure>';
        }).join('') + '</div>';
      var servos = ex.querySelectorAll('.sfd-servo');

      io.querySelector('.sfd-dets').addEventListener('click', function (e) {
        var b = e.target.closest ? e.target.closest('.sfd-det') : null;
        if (!b) return;
        var d = +b.getAttribute('data-d');
        pulsos.push({ d: d, t1: t + 10, t2: t + 1010 });
        ctx.registrar(tsTxt(t + 10), 'Pulso de 1 s en el detector ' + (d + 1) + ' (RB' + d + ').');
        if (!ctx.corriendo()) { paso(); pintar(); }
      });
      io.querySelector('.sfd-crono').addEventListener('click', function () {
        ctx.pausar();
        reiniciar();
        crono = true;
        pulsos = CRONO.map(function (x) { return { d: x.d, t1: x.t1, t2: x.t2 }; });
        ctx.registrar('t = 0 s', 'Cronograma del enunciado: detector 1 en t = 5 s, detector 2 en t = 7 s, detector 1 en t = 13 s (a 1 hasta 16 s). Se para en t = 20 s.');
        ctx.ejecutar();
      });
      function tsTxt(ms) { return 't = ' + fijo(ms / 1000, 2) + NBSP + 's'; }
      function nivelDe(d, tt) {
        for (var i = 0; i < pulsos.length; i++) if (pulsos[i].d === d && pulsos[i].t1 <= tt && tt < pulsos[i].t2) return 1;
        return 0;
      }
      function marcar(tt, fila, txt, cls) { marcas.push({ t: tt, f: fila, txt: txt, c: cls }); }
      function histPush(arr, v) { if (!arr.length || arr[arr.length - 1][1] !== v) arr.push([t, v]); }

      function trans(s, de, a, txt, cls) {
        M[s].est = a;
        histPush(hist.m[s], a);
        evento = true;
        var k = de + '-' + a;
        ctx.diag.transicion(k);
        if (s === ctx.seguir()) ultTr = { t: ahora(), k: k };
        ctx.registrar(tsTxt(t), '<b class="' + COLM[s] + '">M' + (s + 1) + '</b>: ' + (de === a ? '' : 'estado ' + de + ' → ' + a + '. ') + txt, cls);
      }
      function actua(n) {
        var x = sv[n - 1];
        if (x.on) x.segs[x.segs.length - 1][1] = t;
        x.segs.push([t, null]);
        var re = x.on;
        x.on = true; x.t0 = t; x.fin = t + 5000;
        histPush(hist.s[n - 1], 1);
        if (re) marcar(t, 6 + n - 1, '↺', 'sfd-tl-re');
        return re;
      }
      function paraS(n) {
        var x = sv[n - 1];
        x.on = false; x.segs[x.segs.length - 1][1] = t;
        histPush(hist.s[n - 1], 0);
        evento = true;
        ultPara = ahora();
        ctx.registrar(tsTxt(t), '<code>para_servo(' + n + ')</code>: el espantador ' + n + ' lleva 5 s desde su última activación (t = ' + fijo(x.t0 / 1000, 2) + ' s).');
      }
      function activar(s) {
        var r1 = actua(ASOC1[s]), r2 = actua(ASOC2[s]);
        var txt = '<code>actua_servo(' + ASOC1[s] + ')</code>' + (r1 ? ' (reinicia su secuencia)' : '') + ' y <code>actua_servo(' + ASOC2[s] + ')</code>' + (r2 ? ' (reinicia su secuencia)' : '') + '.';
        return txt;
      }

      function maquina(s) {
        var m = M[s];
        if (m.est === 1 && t - m.t0 >= 5000) trans(s, 1, 2, '5 s actuando → espera hasta t = ' + fijo((m.t0 + 10000) / 1000, 2) + ' s (los flancos del detector ' + (s + 1) + ' no cuentan).');
        if (m.est === 2 && t - m.t0 >= 10000) trans(s, 2, 0, '10 s desde el inicio de la actuación → reposo.' + (det[s] ? ' El detector ' + (s + 1) + ' sigue a 1, pero no hay flanco: <b>no se actúa</b>.' : ''));
        if (subida[s]) {
          if (m.est === 0) {
            m.t0 = t;
            trans(s, 0, 1, 'flanco en el detector ' + (s + 1) + ' → ' + activar(s) + ' Actúa 5 s; no atiende al detector hasta t = ' + fijo((t + 10000) / 1000, 2) + ' s.');
          } else {
            marcar(t, s, '×', 'sfd-tl-ign');
            trans(s, m.est, m.est, 'flanco en el detector ' + (s + 1) + ' <b>ignorado</b>: la máquina está en el estado ' + m.est + ' hasta t = ' + fijo((m.t0 + 10000) / 1000, 2) + ' s.', 'sfd-log-ign');
          }
        }
      }
      function sub() {
        t += 10;
        for (var d = 0; d < 3; d++) {
          var nv = nivelDe(d, t);
          subida[d] = nv === 1 && det[d] === 0;
          if (nv !== det[d]) { det[d] = nv; histPush(hist.d[d], nv); evento = true; }
        }
        for (var s = 0; s < 3; s++) maquina(s);
        for (var n = 1; n <= 3; n++) if (sv[n - 1].on && t >= sv[n - 1].fin) paraS(n);
        if (crono && t >= 20000 && !fin) { fin = true; resumen(); ctx.pausar(); }
      }
      function resumen() {
        var partes = sv.map(function (x, i) {
          return 'espantador ' + (i + 1) + ': ' + (x.segs.length ? x.segs.map(function (g) {
            return fx(g[0] / 1000, 2) + '-' + (g[1] == null ? 'sigue' : fx(g[1] / 1000, 2) + ' s');
          }).join(', ') : 'no actúa');
        });
        ctx.registrar('t = 20 s', '<b>Resumen:</b> ' + partes.join('; ') + '. Coincide con el enunciado: el 3 de 5 a 10 s; el 1 de 5 a 7 s y otra vez de 7 a 12 s; el 2 de 7 a 12 s; el flanco de 13 s se ignora y en 15 s el nivel alto no cuenta.', 'sfd-log-ok');
      }

      function paso() {
        evento = false;
        var lim = t + 500;
        do { sub(); } while (!evento && t < lim && !(crono && fin));
      }
      function avanzar(dt) {
        accT += dt * ctx.vel();
        var n = Math.floor(accT / 10);
        if (n > 300) { n = 300; accT = 0; } else accT -= n * 10;
        for (var i = 0; i < n && ctx.corriendo(); i++) sub();
      }
      function reiniciar() {
        t = 0; det = [0, 0, 0]; pulsos = []; accT = 0; crono = false; fin = false; subida = [false, false, false];
        M = [0, 1, 2].map(function () { return { est: 0, t0: 0 }; });
        sv = [0, 1, 2].map(function () { return { on: false, t0: 0, fin: 0, segs: [] }; });
        hist = { d: [[[0, 0]], [[0, 0]], [[0, 0]]], m: [[[0, 0]], [[0, 0]], [[0, 0]]], s: [[[0, 0]], [[0, 0]], [[0, 0]]] };
        marcas = []; ultPara = -1e9; ultTr = null;
        ctx.limpiarLog();
        if (ctx.diag) ctx.diag.transicion('');
      }
      function modo(inicial) {
        ctx.diagrama(EPJ.diag());
        if (inicial) ctx.opcionesSeguir([[0, 'máquina 1 (detector 1)'], [1, 'máquina 2 (detector 2)'], [2, 'máquina 3 (detector 3)']], 0);
        reiniciar();
      }

      // ---------- línea de tiempo ----------
      var TX0 = 66, TX1 = 412, VENT = 20000;
      var FILAS = [];
      [0, 1, 2].forEach(function (d) { FILAS.push({ y: 32 + d * 22, n: 'det ' + (d + 1) }); });
      [0, 1, 2].forEach(function (d) { FILAS.push({ y: 104 + d * 22, n: 'M' + (d + 1) }); });
      [0, 1, 2].forEach(function (d) { FILAS.push({ y: 176 + d * 22, n: 'esp. ' + (d + 1) }); });
      ctx.q('.sfd-tl-svg').innerHTML = '<svg viewBox="0 0 420 262" class="sfd-svg sfd-tl-s" role="img" aria-label="Cronograma de detectores, máquinas y espantadores"><g class="sfd-tl-fijo">' +
        FILAS.map(function (f, i) {
          return '<text x="4" y="' + (f.y + 14) + '" class="sfd-tl-n' + (i >= 3 && i < 6 ? ' ' + COLM[i - 3] : '') + '">' + f.n + '</text>' +
            '<line x1="' + TX0 + '" y1="' + (f.y + 20) + '" x2="' + TX1 + '" y2="' + (f.y + 20) + '" class="sfd-tl-base"/>';
        }).join('') + '</g><g class="sfd-tl-din"></g></svg>';
      var tlDin = ctx.q('.sfd-tl-din');
      function xDe(ms, w0) { return TX0 + (ms - w0) / VENT * (TX1 - TX0); }
      function segmentos(arr, w0, w1) {   // [[a, b, v]] recortados a la ventana
        var r = [];
        for (var i = 0; i < arr.length; i++) {
          var a = arr[i][0], b = i + 1 < arr.length ? arr[i + 1][0] : t, v = arr[i][1];
          if (b <= w0 || a >= w1) continue;
          r.push([Math.max(a, w0), Math.min(b, w1), v]);
        }
        return r;
      }
      function pintarTL() {
        var w0 = Math.max(0, t - VENT), w1 = w0 + VENT, h = '';
        for (var s = w0 - (w0 % 1000); s <= w1; s += 1000) {
          if (s < w0) continue;
          var x = xDe(s, w0).toFixed(1);
          h += '<line x1="' + x + '" y1="28" x2="' + x + '" y2="244" class="sfd-rej' + (s % 5000 ? '' : ' sfd-rej-f') + '"/>';
          if (s % 5000 === 0) h += '<text x="' + x + '" y="256" class="sfd-eje-t"' + (s + 5000 > w1 ? ' text-anchor="end"' : '') + '>' + (s / 1000) + (s + 5000 > w1 ? NBSP + 's' : '') + '</text>';
        }
        if (crono) {
          [[5000, 'det1', 10], [7000, 'det2', 21], [13000, 'det1: ignorado', 10], [15000, '15 s: alto, sin flanco', 21]].forEach(function (a) {
            if (a[0] < w0 || a[0] > w1) return;
            var x = xDe(a[0], w0).toFixed(1);
            h += '<line x1="' + x + '" y1="' + (a[2] + 3) + '" x2="' + x + '" y2="244" class="sfd-tl-ev"/><text x="' + x + '" y="' + a[2] + '" class="sfd-tl-evt">' + a[1] + '</text>';
          });
        }
        for (var d = 0; d < 3; d++) {
          var yb = FILAS[d].y + 18, ya = FILAS[d].y + 4, pts = '';
          segmentos(hist.d[d], w0, w1).forEach(function (g) {
            var y = g[2] ? ya : yb;
            pts += xDe(g[0], w0).toFixed(1) + ',' + y + ' ' + xDe(g[1], w0).toFixed(1) + ',' + y + ' ';
          });
          h += '<polyline points="' + pts + '" class="sfd-tl-det"/>';
        }
        for (var m = 0; m < 3; m++) {
          var yy = FILAS[3 + m].y + 3;
          segmentos(hist.m[m], w0, w1).forEach(function (g) {
            if (!g[2]) return;
            var xa = xDe(g[0], w0), xb = xDe(g[1], w0);
            h += '<rect x="' + xa.toFixed(1) + '" y="' + yy + '" width="' + Math.max(0.5, xb - xa).toFixed(1) + '" height="16" class="sfd-tl-e' + g[2] + '"/>';
            if (xb - xa > 26) h += '<text x="' + ((xa + xb) / 2).toFixed(1) + '" y="' + (yy + 12) + '" class="sfd-tl-et">' + (g[2] === 1 ? 'actúa' : 'espera') + '</text>';
          });
        }
        for (var n = 0; n < 3; n++) {
          var ys = FILAS[6 + n].y + 5;
          segmentos(hist.s[n], w0, w1).forEach(function (g) {
            if (!g[2]) return;
            var xa = xDe(g[0], w0), xb = xDe(g[1], w0);
            h += '<rect x="' + xa.toFixed(1) + '" y="' + ys + '" width="' + Math.max(0.5, xb - xa).toFixed(1) + '" height="12" rx="2" class="sfd-tl-s"/>';
          });
        }
        marcas.forEach(function (k) {
          if (k.t < w0 || k.t > w1) return;
          h += '<text x="' + xDe(k.t, w0).toFixed(1) + '" y="' + (FILAS[k.f].y + 2) + '" class="sfd-tl-m ' + k.c + '">' + k.txt + '</text>';
        });
        var xc = xDe(t, w0).toFixed(1);
        h += '<line x1="' + xc + '" y1="26" x2="' + xc + '" y2="246" class="sfd-cursor"/>';
        tlDin.innerHTML = h;
      }

      function angulo(x) {
        if (!x.on) return 0;
        var r = (t - x.t0) % 2250, acc2 = 0;
        for (var i = 0; i < SECUENCIA.length; i++) { acc2 += SECUENCIA[i][0]; if (r < acc2) return SECUENCIA[i][1]; }
        return 0;
      }

      function pintar() {
        var f = ctx.seguir();
        pintarTL();
        var bds = io.querySelectorAll('.sfd-det');
        for (var d = 0; d < 3; d++) {
          bds[d].classList.toggle('sfd-det-on', !!det[d]);
          bds[d].setAttribute('aria-label', 'Detector ' + (d + 1) + ' en RB' + d + ', señal = ' + det[d] + '. Genera un pulso de 1 s; actúa los espantadores ' + ASOC1[d] + ' y ' + ASOC2[d]);
        }
        io.querySelector('.sfd-reloj').innerHTML = tsTxt(t) + ' · tiempos exactos del enunciado';
        var filas = '';
        for (var s = 0; s < 3; s++) {
          var m = M[s], tt = m.est ? fijo((t - m.t0) / 1000, 1) + ' s' : '—';
          filas += '<tr' + (s === f ? ' class="sfd-fila-seg"' : '') + '><th scope="row" class="' + COLM[s] + '">M' + (s + 1) + '</th><td>' + ['0 reposo', '1 actuando', '2 espera'][m.est] +
            '</td><td>' + tt + '</td><td>det = ' + det[s] + '</td></tr>';
        }
        var tb = io.querySelector('.sfd-tabla tbody');
        if (tb.innerHTML !== filas) tb.innerHTML = filas;
        for (var n = 0; n < 3; n++) {
          var x = sv[n], a = angulo(x);
          girar(servos[n], a, grados(a));
          var txt = x.on ? 'actuando desde t = ' + fijo(x.t0 / 1000, 2) + ' s (para en ' + fijo(x.fin / 1000, 2) + ' s)' : 'parado (0°)';
          var sp = servos[n].querySelector('.sfd-servo-e');
          if (sp.textContent !== txt) sp.textContent = txt;
          servos[n].classList.toggle('sfd-servo-on', x.on);
        }
        ctx.diag.fichas(M.map(function (mm, i) { return { n: String(mm.est), txt: String(i + 1), c: COLM[i] + (i === f ? ' sfd-ficha-seg' : '') }; }));
        ctx.diag.activos(M.map(function (mm) { return String(mm.est); }));
        // código
        var e = M[f].est, L = ['w', 'rd', 'fdet', 'g', 'bc', 'fesp', 'ec'], T = [], now = ahora();
        if (ultTr && now - ultTr.t < 900) {
          var map = { '0-1': ['fl', 'fl1', 'fl2', 'fl3', 'fl4'], '1-2': [], '2-0': [], '1-1': [], '2-2': [] };
          T = map[ultTr.k] || [];
        }
        if (now - ultPara < 900) T = T.concat(['ep']);
        ctx.cod.marcar({ act: L, tr: T });
        ctx.cod.enfocar(e === 0 ? 'g' : 'bc');
        var x2 = 'Máquina ' + (f + 1) + ' (detector ' + (f + 1) + ' → espantadores ' + ASOC1[f] + ' y ' + ASOC2[f] + '): <b>estado ' + e + '</b>' +
          (e === 0 ? ', espera un flanco de subida.' : e === 1 ? ', actuando desde t = ' + fijo(M[f].t0 / 1000, 2) + ' s (5 s).' :
            ', espera hasta t = ' + fijo((M[f].t0 + 10000) / 1000, 2) + ' s.');
        if (t === 0) x2 = 'Sistema en reposo en t = 0 s. Pulsa un detector o «Cronograma del enunciado».';
        ctx.explicar(tsTxt(t) + ' · ' + x2);
      }

      return { paso: paso, avanzar: avanzar, reiniciar: reiniciar, modo: modo, pintar: pintar };
    }
  };

  var MAQUINAS = { calculadora: CALC, espantador: ESP, espantapajaros: EPJ };

  MPI.componentes['sim-fsm-dspic'] = function (el, cfg) {
    cfg = cfg || {};
    var nom = String(cfg.maquina || 'calculadora').toLowerCase();
    if (nom.normalize) nom = nom.normalize('NFD').replace(/[̀-ͯ]/g, '');
    var M = MAQUINAS[nom];
    if (!M) {
      el.classList.add('mpi-sim-fsm-dspic');
      el.innerHTML = '<div class="mpi-sim-cab">Máquina de estados</div><p class="sfd-intro">data-config: «maquina» debe ser "calculadora", "espantador" o "espantapajaros".</p>';
      return;
    }
    var ctx = marco(el, M.def);
    ctx.conectar(M.crear(ctx));
  };
})();
