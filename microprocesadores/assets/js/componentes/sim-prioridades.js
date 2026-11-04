/*
 * Componente "sim-prioridades": prioridades y anidamiento en el controlador
 * de interrupciones del PIC32MX230F064D (tema Interrupciones, sección 6.3).
 *
 * Línea de tiempo: el alumno lanza peticiones de varias fuentes, cambia su
 * prioridad IPCxbits.xxIP (0-7, 0 = deshabilitada) y su subprioridad
 * IPCxbits.xxIS (0-3), y observa cuándo anida una interrupción y cuándo
 * queda pendiente. Reglas (datasheet, tabla 7-1 y sección 6.3 del tema):
 *
 *   1) Una petición interrumpe solo si su RIPL (prioridad solicitada) es
 *      ESTRICTAMENTE MAYOR que el IPL al que está ejecutando la CPU en ese
 *      instante (el main siempre corre a IPL = 0).
 *   2) Entre varias pendientes con la CPU libre para atender, gana primero
 *      la de mayor prioridad (IP); empate de IP → gana la de mayor
 *      subprioridad (IS); empate de IP e IS → orden natural, IRQ ascendente
 *      (IRQ menor = prioridad mayor).
 *   3) El anidamiento es automático: no existe ningún bit que lo deshabilite
 *      (a diferencia de otras familias Microchip con NSTDIS); basta con que
 *      RIPL > IPL en curso, sea el main o una ISR.
 *
 * Cada fuente admite "duracion" (ciclos que dura su ISR en el diagrama; 5
 * por defecto, 6 para AD1, como en el ejemplo de barrido del tema 9).
 *
 * Uso:
 *   <div class="mpi-mount" data-componente="sim-prioridades" data-config='
 *     {"fuentes":[{"nombre":"T1","prioridad":2,"subprioridad":0},
 *                 {"nombre":"T2","prioridad":2,"subprioridad":0},
 *                 {"nombre":"AD1","prioridad":1,"subprioridad":0}]}'></div>
 */
window.MPI = window.MPI || {};
MPI.componentes = MPI.componentes || {};

(function () {
  // ---------- Fuentes del curso (tabla 7-1 del datasheet) ----------
  var FUENTES = {
    INT0: { irq: 3, vec: 3, nombre: 'Interrupción externa 0', evento: 'llega un flanco al pin INT0', fn: 'INT0IF', en: 'INT0IE', ip: 'INT0IP', is: 'INT0IS' },
    T1: { irq: 4, vec: 4, nombre: 'Timer 1', evento: 'TMR1 llega a PR1', fn: 'T1IF', en: 'T1IE', ip: 'T1IP', is: 'T1IS' },
    T2: { irq: 9, vec: 8, nombre: 'Timer 2', evento: 'TMR2 llega a PR2', fn: 'T2IF', en: 'T2IE', ip: 'T2IP', is: 'T2IS' },
    T3: { irq: 14, vec: 12, nombre: 'Timer 3', evento: 'TMR3 llega a PR3', fn: 'T3IF', en: 'T3IE', ip: 'T3IP', is: 'T3IS' },
    AD1: { irq: 28, vec: 23, nombre: 'Convertidor A/D', evento: 'termina una conversión', fn: 'AD1IF', en: 'AD1IE', ip: 'AD1IP', is: 'AD1IS' }
  };
  var ALIAS = { ADC1: 'AD1', ADC: 'AD1', TIMER1: 'T1', TIMER2: 'T2', TIMER3: 'T3' };
  var COLORES = ['var(--acento)', 'var(--acento-2)', 'var(--morado)', 'var(--naranja)', 'var(--amarillo)', 'var(--azul-cl)'];

  function clave(n) {
    var k = String(n || '').toUpperCase().replace(/\s+/g, '');
    if (ALIAS[k]) k = ALIAS[k];
    return FUENTES[k] ? k : null;
  }
  function info(k) {
    var f = FUENTES[k];
    var pos = f.vec % 4;
    return {
      k: k, irq: f.irq, vec: f.vec, nombre: f.nombre, evento: f.evento,
      fn: f.fn, en: f.en, ip: f.ip, is: f.is,
      ifs: 'IFS' + (f.irq >> 5), iec: 'IEC' + (f.irq >> 5), bit: f.irq & 31,
      ipc: 'IPC' + (f.vec >> 2), shP: 8 * pos + 2, shS: 8 * pos
    };
  }
  function hex(v, n) {
    var s = (v >>> 0).toString(16).toUpperCase();
    while (s.length < n) s = '0' + s;
    return '0x' + s;
  }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function c(s) { return '<code>' + esc(s) + '</code>'; }
  function entero(v, def, min, max) {
    var n = Number(v);
    if (!isFinite(n) || Math.floor(n) !== n || n < min || n > max) return def;
    return n;
  }
  function reducido() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }
  var uid = 0;
  function nuevoId(p) { uid++; return p + '-' + uid + '-' + Math.random().toString(36).slice(2, 6); }

  // ---------- Escenarios guiados ----------
  var ESCENARIOS = [
    { id: 'misma', tit: 'T1 y T2 a la vez, misma prioridad', prios: { T1: { p: 2, s: 0 }, T2: { p: 2, s: 0 }, AD1: { p: 1, s: 0 } },
      pet: [{ t: 2, f: 'T2' }, { t: 2, f: 'T1' }],
      exp: 'Las dos piden en t = 2 con IP = 2 e IS = 0: empate total. Desempata el <b>orden natural</b>: gana el IRQ menor, T1 (IRQ 4) frente a T2 (IRQ 9). T2 espera pendiente a que T1 termine.' },
    { id: 'subprioridad', tit: 'Misma IP, distinta IS: gana la subprioridad', prios: { T1: { p: 2, s: 0 }, T2: { p: 2, s: 2 }, AD1: { p: 1, s: 0 } },
      pet: [{ t: 2, f: 'T2' }, { t: 2, f: 'T1' }],
      exp: 'Misma IP (2), pero T2 tiene IS = 2 y T1 tiene IS = 0: <b>gana T2 por subprioridad</b>, aunque su IRQ (9) sea mayor que el de T1 (4). El orden natural solo decide si también empata la subprioridad.' },
    { id: 'anidam', tit: 'T1 anida dentro de la ISR de AD1', prios: { T1: { p: 2, s: 0 }, T2: { p: 2, s: 0 }, AD1: { p: 1, s: 0 } },
      pet: [{ t: 2, f: 'AD1' }, { t: 5, f: 'T1' }],
      exp: 'AD1 entra en t = 2 (IPL pasa a 1). T1 pide en t = 5 con RIPL = 2 &gt; IPL (1): <b>anida</b>. Se interrumpe la ISR de AD1, se ejecuta la de T1 y, al terminar, se reanuda AD1 donde se quedó; solo entonces vuelve el main.' },
    { id: 'pendiente', tit: 'AD1 espera a que termine T1', prios: { T1: { p: 2, s: 0 }, T2: { p: 2, s: 0 }, AD1: { p: 1, s: 0 } },
      pet: [{ t: 2, f: 'T1' }, { t: 4, f: 'AD1' }],
      exp: 'T1 entra en t = 2 (IPL pasa a 2). AD1 pide en t = 4 con RIPL = 1, que <b>no es mayor</b> que el IPL (2): su flag queda a 1 y se atiende cuando T1 acaba y el IPL vuelve a 0.' }
  ];

  MPI.componentes['sim-prioridades'] = function (el, cfg) {
    cfg = cfg || {};
    var lista = Array.isArray(cfg.fuentes) && cfg.fuentes.length ? cfg.fuentes
      : [{ nombre: 'T1', prioridad: 2, subprioridad: 0 }, { nombre: 'T2', prioridad: 2, subprioridad: 0 }, { nombre: 'AD1', prioridad: 1, subprioridad: 0 }];
    var fuentes = [], vistos = {};
    lista.forEach(function (x) {
      var kk = clave(x && x.nombre);
      if (!kk || vistos[kk] || fuentes.length >= 6) return;
      vistos[kk] = 1;
      var g = info(kk);
      g.prio = entero(x.prioridad, 2, 0, 7);
      g.sub = entero(x.subprioridad, 0, 0, 3);
      g.dur = entero(x.duracion, kk === 'AD1' ? 6 : 5, 1, 20);
      g.color = COLORES[fuentes.length];
      g.flag = 0;
      fuentes.push(g);
    });
    var porK = {};
    fuentes.forEach(function (f) { porK[f.k] = f; });

    var VEN = 32, TW = 14, ML = 52, MT = 8, RH = 22, MR = 8;
    var VBW = ML + VEN * TW + MR, VBH = MT + 8 * RH + 24;

    var filas = '';
    fuentes.forEach(function (f, j) {
      var opcP = '', opcS = '';
      for (var p = 0; p <= 7; p++) opcP += '<option value="' + p + '"' + (p === f.prio ? ' selected' : '') + '>' + p + (p === 0 ? ' (off)' : '') + '</option>';
      for (var s = 0; s <= 3; s++) opcS += '<option value="' + s + '"' + (s === f.sub ? ' selected' : '') + '>' + s + '</option>';
      filas += '<div class="spr-f" data-j="' + j + '">' +
        '<span class="spr-f-nom"><span class="spr-sw" style="background:' + f.color + '" aria-hidden="true"></span><b>' + f.k + '</b><small>IRQ ' + f.irq + ' · vector ' + f.vec + '</small></span>' +
        '<label>' + f.ip + ' <select class="spr-sel-p" data-j="' + j + '" aria-label="Prioridad de ' + f.k + '">' + opcP + '</select></label>' +
        '<label>' + f.is + ' <select class="spr-sel-s" data-j="' + j + '" aria-label="Subprioridad de ' + f.k + '">' + opcS + '</select></label>' +
        '<button type="button" class="spr-pedir" data-j="' + j + '">Pedir ' + f.k + '</button>' +
        '<span class="spr-f-est" data-j="' + j + '">—</span></div>';
    });
    var esc_html = '';
    ESCENARIOS.forEach(function (e) {
      var ok = Object.keys(e.prios).every(function (kk) { return porK[kk]; }) && e.pet.every(function (p) { return porK[p.f]; });
      if (ok) esc_html += '<button type="button" class="spr-esc" data-id="' + e.id + '">' + esc(e.tit) + '</button>';
    });

    var idLog = nuevoId('spr-log');
    el.classList.add('mpi-sim-prioridades');
    el.innerHTML =
      '<div class="mpi-sim-cab">Prioridades y anidamiento <span class="spr-cab-sub">línea de tiempo</span></div>' +
      '<p class="spr-sub">Una petición interrumpe solo si su <b>RIPL</b> (prioridad solicitada) es <b>mayor</b> que el <b>IPL</b> al que corre la CPU (el <code>main</code> siempre va a IPL&nbsp;=&nbsp;0). Empate entre pendientes: gana primero la de mayor IP, luego la de mayor IS y, si también empata, la de IRQ menor. Pulsa varios «Pedir» con la simulación en pausa para que lleguen en el mismo ciclo.</p>' +
      (esc_html ? '<div class="spr-escs" role="group" aria-label="Escenarios"><span class="spr-escs-t">Escenarios:</span>' + esc_html + '</div>' : '') +
      '<div class="spr-esc-exp" hidden></div>' +
      '<div class="spr-fuentes">' + filas + '</div>' +
      '<div class="spr-ctl" role="group" aria-label="Control del tiempo">' +
        '<button type="button" class="spr-play" aria-pressed="false">▶ Reproducir</button>' +
        '<button type="button" class="spr-avz">Avanzar 1 ciclo</button>' +
        '<button type="button" class="spr-reini">Reiniciar</button>' +
      '</div>' +
      '<div class="spr-estado" aria-live="polite"></div>' +
      '<div class="spr-graf-scroll"><svg class="spr-graf" viewBox="0 0 ' + VBW + ' ' + VBH + '" role="img" aria-labelledby="' + idLog + '-t"><title id="' + idLog + '-t">Diagrama temporal de niveles de prioridad</title><g class="spr-g"></g></svg></div>' +
      '<div class="spr-leyenda" aria-hidden="true">' +
        fuentes.map(function (f) { return '<span><i class="spr-lg-bar" style="background:' + f.color + '"></i>ISR ' + f.k + '</span>'; }).join('') +
        '<span><i class="spr-lg-bar spr-lg-main"></i>main</span>' +
        '<span><i class="spr-lg-susp"></i>ISR interrumpida</span>' +
        '<span><i class="spr-lg-ipl"></i>IPL en curso</span>' +
        '<span><i class="spr-lg-pet">▼</i>petición</span>' +
        '<span><i class="spr-lg-esp"></i>pendiente</span>' +
      '</div>' +
      '<div class="spr-log-tit" id="' + idLog + '">Registro de eventos</div>' +
      '<ol class="spr-log" aria-labelledby="' + idLog + '"></ol>' +
      '<p class="spr-nota">Cada ciclo del diagrama es una unidad de tiempo arbitraria; la latencia fija de entrada y salida a la ISR no se dibuja. El anidamiento es automático: no hay ningún bit que lo deshabilite, basta con que RIPL &gt; IPL en curso, sea del <code>main</code> o de otra ISR.</p>';

    var q = function (s) { return el.querySelector(s); };
    var gEl = q('.spr-g'), estEl = q('.spr-estado'), logEl = q('.spr-log'), escExp = q('.spr-esc-exp');
    var bPlay = q('.spr-play');

    var t, pila, hist, pets, esperas, logs, programa, jugando = false, temporizador = null, ocioso = 0;

    function reiniciar() {
      t = 0; pila = []; hist = []; pets = []; esperas = []; logs = []; programa = []; ocioso = 0;
      fuentes.forEach(function (f) { f.flag = 0; f.motivo = null; });
      logEl.innerHTML = '';
    }
    function iplActual() {
      return pila.length ? pila[pila.length - 1].prio : 0;
    }
    function log(tt, html) {
      logs.push({ t: tt, h: html });
      var li = document.createElement('li');
      li.innerHTML = '<span class="spr-log-t">t = ' + tt + '</span> ' + html;
      logEl.appendChild(li);
      while (logEl.children.length > 80) logEl.removeChild(logEl.firstChild);
      logEl.scrollTop = logEl.scrollHeight;
    }
    function pedir(f) {
      if (f.flag) { log(t, f.k + ' vuelve a pedir, pero ' + f.fn + ' ya estaba a 1: el flag no acumula peticiones.'); return; }
      f.flag = 1; f.motivo = null;
      pets.push({ t: t, f: f, prio: f.prio });
      esperas.push({ f: f, desde: t, hasta: null, prio: f.prio });
      log(t, '<b>' + f.k + '</b> pide interrupción (' + f.fn + ' = 1); RIPL = ' + f.prio + ', IS = ' + f.sub + '.');
      ocioso = 0;
    }

    function motivo(f, ganadora) {
      if (f.prio === 0) return f.k + ' tiene IP = 0 (deshabilitada): su flag queda a 1 sin atender nunca.';
      if (ganadora && ganadora.prio === f.prio && ganadora.sub === f.sub) return f.k + ' queda pendiente: empate total (IP ' + f.prio + ', IS ' + f.sub + ') con ' + ganadora.k + ', gana ' + ganadora.k + ' por orden natural (IRQ ' + ganadora.irq + ' &lt; ' + f.irq + ').';
      if (ganadora && ganadora.prio === f.prio && ganadora.sub > f.sub) return f.k + ' queda pendiente: misma IP (' + f.prio + ') que ' + ganadora.k + ', pero su IS (' + f.sub + ') es menor que la de ' + ganadora.k + ' (' + ganadora.sub + ').';
      var ipl = iplActual();
      return f.k + ' queda pendiente: su RIPL (' + f.prio + ') no es mayor que el IPL en curso (' + ipl + ').';
    }
    function arbitrar() {
      var ipl = iplActual();
      var cand = fuentes.filter(function (f) { return f.flag; });
      if (!cand.length) return;
      var eleg = cand.filter(function (f) { return f.prio > 0 && f.prio > ipl; });
      var g = null;
      if (eleg.length) {
        eleg.sort(function (a, b) { return (b.prio - a.prio) || (b.sub - a.sub) || (a.irq - b.irq); });
        g = eleg[0];
        g.flag = 0; g.motivo = null;
        var desde = null;
        esperas.forEach(function (e) { if (e.f === g && e.hasta == null) { e.hasta = t; desde = e.desde; } });
        var prev = pila.length ? pila[pila.length - 1] : null;
        pila.push({ f: g, prio: g.prio, restante: g.dur, inicio: t });
        if (prev) log(t, '<b>' + g.k + '</b> (RIPL ' + g.prio + ') <b>interrumpe</b> a la ISR de ' + prev.f.k + ' (IPL ' + ipl + '): anidamiento. IPL pasa a ' + g.prio + '.');
        else log(t, 'Se atiende <b>' + g.k + '</b>: RIPL ' + g.prio + ' &gt; IPL ' + ipl + ' → salta al vector ' + g.vec + ' (Ebase + 0x200 + ' + g.vec + '·0x20); IPL pasa a ' + g.prio + '.' +
          (desde != null && desde < t ? ' Estaba pendiente desde t = ' + desde + '.' : ''));
      }
      fuentes.forEach(function (f) {
        if (!f.flag) return;
        var m = motivo(f, g);
        if (m !== f.motivo) { f.motivo = m; log(t, m); }
      });
    }
    function avanzar() {
      programa.forEach(function (p) { if (p.t === t && porK[p.f]) pedir(porK[p.f]); });
      arbitrar();
      var top = pila.length ? pila[pila.length - 1] : null;
      hist.push({ t: t, run: top ? { f: top.f, prio: top.prio } : null,
        susp: pila.slice(0, -1).map(function (x) { return { f: x.f, prio: x.prio }; }), ipl: iplActual() });
      if (top) {
        top.restante--;
        if (top.restante === 0) {
          pila.pop();
          var vuelta = pila.length ? 'a la ISR de ' + pila[pila.length - 1].f.k : 'al main';
          log(t + 1, '<code>' + top.f.k + '</code> termina: desapila el contexto, vuelve ' + vuelta + ', IPL = ' + iplActual() + '.');
        }
      }
      t++;
      var activo = pila.length || fuentes.some(function (f) { return f.flag && f.prio > 0; }) || programa.some(function (p) { return p.t >= t; });
      ocioso = activo ? 0 : ocioso + 1;
    }

    // ---------- dibujo ----------
    function X(tt, ini) { return ML + (tt - ini) * TW; }
    function Yfila(n) { return MT + (7 - n) * RH; }
    function rect(x, y, w, h, est, extra) {
      return '<rect x="' + x.toFixed(1) + '" y="' + y + '" width="' + Math.max(0, w).toFixed(1) + '" height="' + h + '" style="' + est + '"' + (extra || '') + '/>';
    }
    function dibujar() {
      var ini = t <= VEN - 4 ? 0 : t - (VEN - 4);
      var fin = ini + VEN;
      var s = '';
      for (var n = 7; n >= 0; n--) {
        var y = Yfila(n);
        s += '<rect x="' + ML + '" y="' + y + '" width="' + (VEN * TW) + '" height="' + RH + '" class="spr-g-fila' + (n % 2 ? '' : ' spr-g-fila2') + '"/>';
        s += '<text x="' + (ML - 6) + '" y="' + (y + RH / 2 + 4) + '" text-anchor="end" class="spr-g-txt">' + (n === 0 ? '0 main' : n) + '</text>';
      }
      for (var tt = ini; tt <= fin; tt++) {
        if (tt % 5 === 0) {
          s += '<line x1="' + X(tt, ini) + '" x2="' + X(tt, ini) + '" y1="' + MT + '" y2="' + (MT + 8 * RH) + '" class="spr-g-grid"/>';
          s += '<text x="' + X(tt, ini) + '" y="' + (MT + 8 * RH + 15) + '" text-anchor="middle" class="spr-g-txt">' + tt + '</text>';
        }
      }
      // Tramos (fusionando ciclos consecutivos iguales)
      var tramos = [];
      function tramo(clv, tt2, datos) {
        for (var i = tramos.length - 1; i >= 0; i--) {
          if (tramos[i].clv === clv && tramos[i].fin === tt2) { tramos[i].fin = tt2 + 1; return; }
        }
        tramos.push({ clv: clv, ini: tt2, fin: tt2 + 1, d: datos });
      }
      hist.forEach(function (h) {
        if (h.t + 1 < ini || h.t > fin) return;
        if (h.run) tramo('r' + h.run.f.k + h.run.prio, h.t, { tipo: 'run', f: h.run.f, prio: h.run.prio });
        else tramo('main', h.t, { tipo: 'main', prio: 0 });
        h.susp.forEach(function (x) { tramo('s' + x.f.k + x.prio, h.t, { tipo: 'susp', f: x.f, prio: x.prio }); });
      });
      tramos.forEach(function (tr) {
        var a = Math.max(tr.ini, ini), b = Math.min(tr.fin, fin);
        if (b <= a) return;
        var y = Yfila(tr.d.prio);
        if (tr.d.tipo === 'main') s += rect(X(a, ini), y + 6, (b - a) * TW, 12, 'fill:var(--txt-tenue);opacity:.55');
        else if (tr.d.tipo === 'run') s += rect(X(a, ini), y + 6, (b - a) * TW, 12, 'fill:' + tr.d.f.color);
        else s += rect(X(a, ini) + .75, y + 6.75, (b - a) * TW - 1.5, 10.5, 'fill:none;stroke:' + tr.d.f.color + ';stroke-width:1.5;stroke-dasharray:3 2');
      });
      // Etiquetas de ISR en tramos largos
      tramos.forEach(function (tr) {
        if (tr.d.tipo !== 'run') return;
        var a = Math.max(tr.ini, ini), b = Math.min(tr.fin, fin);
        if ((b - a) * TW < 30) return;
        s += '<text x="' + (X(a, ini) + 3) + '" y="' + (Yfila(tr.d.prio) + 16) + '" class="spr-g-etq">' + tr.d.f.k + '</text>';
      });
      // Esperas
      esperas.forEach(function (e) {
        var hasta = e.hasta == null ? t : e.hasta;
        var a = Math.max(e.desde, ini), b = Math.min(hasta, fin);
        if (b <= a) return;
        var y = Yfila(e.prio) + RH / 2;
        s += '<line x1="' + X(a, ini) + '" x2="' + X(b, ini) + '" y1="' + y + '" y2="' + y + '" style="stroke:' + e.f.color + ';stroke-width:2;stroke-dasharray:1.5 3"/>';
      });
      // Peticiones
      pets.forEach(function (p) {
        if (p.t < ini || p.t > fin) return;
        var x = X(p.t, ini), y = Yfila(p.prio) + 1;
        s += '<path d="M' + (x - 4) + ' ' + y + 'h8l-4 5z" style="fill:' + p.f.color + '"/>';
      });
      // IPL
      var pts = [];
      hist.forEach(function (h) {
        if (h.t + 1 < ini || h.t > fin) return;
        var a = Math.max(h.t, ini), b = Math.min(h.t + 1, fin), y = Yfila(h.ipl) + 2.5;
        pts.push(X(a, ini) + ',' + y, X(b, ini) + ',' + y);
      });
      if (pts.length) s += '<polyline points="' + pts.join(' ') + '" class="spr-g-ipl"/>';
      // Cursor
      if (t >= ini && t <= fin) s += '<line x1="' + X(t, ini) + '" x2="' + X(t, ini) + '" y1="' + (MT - 4) + '" y2="' + (MT + 8 * RH) + '" class="spr-g-cursor"/>';
      gEl.innerHTML = s;

      // Estado textual
      var ipl = iplActual();
      var top = pila.length ? pila[pila.length - 1] : null;
      var cad = ['main'].concat(pila.map(function (x) { return 'ISR ' + x.f.k; })).join(' → ');
      var pend = fuentes.filter(function (f) { return f.flag; }).map(function (f) { return f.k; });
      estEl.innerHTML = '<span>t = <b>' + t + '</b></span>' +
        '<span>IPL = <b>' + ipl + '</b></span>' +
        '<span>Ejecuta: <b>' + (top ? top.f.k : 'main') + '</b></span>' +
        '<span>Contextos: <b>' + cad + '</b></span>' +
        '<span>Pendientes: <b>' + (pend.length ? pend.join(', ') : 'ninguna') + '</b></span>' +
        (!jugando && pend.length ? '<span class="spr-pista">En pausa: las peticiones esperan en t = ' + t + '. Pulsa «Reproducir» o «Avanzar 1 ciclo».</span>' : '');
      fuentes.forEach(function (f, j) {
        var e = el.querySelector('.spr-f-est[data-j="' + j + '"]');
        var txt = '—', cls = '';
        if (top && top.f === f) { txt = 'en ejecución'; cls = 'spr-e-run'; }
        else if (pila.some(function (x) { return x.f === f; })) { txt = 'interrumpida'; cls = 'spr-e-susp'; }
        if (f.flag) { txt = (txt === '—' ? '' : txt + ' · ') + (f.prio === 0 ? 'flag a 1, deshabilitada' : 'pendiente'); cls = cls || 'spr-e-pend'; }
        e.textContent = txt;
        e.className = 'spr-f-est ' + cls;
      });
    }

    // ---------- reloj ----------
    function parar() {
      jugando = false;
      if (temporizador) { clearTimeout(temporizador); temporizador = null; }
      bPlay.textContent = '▶ Reproducir';
      bPlay.setAttribute('aria-pressed', 'false');
    }
    function tic() {
      temporizador = null;
      if (!document.body.contains(el)) { parar(); return; }
      if (!jugando) return;
      avanzar();
      dibujar();
      if (ocioso >= 6) { parar(); return; }
      temporizador = setTimeout(tic, 450);
    }
    function reproducir() {
      if (jugando) return;
      jugando = true;
      bPlay.textContent = '⏸ Pausa';
      bPlay.setAttribute('aria-pressed', 'true');
      temporizador = setTimeout(tic, 250);
    }
    bPlay.addEventListener('click', function () {
      if (jugando) parar(); else { ocioso = 0; reproducir(); }
      dibujar();
    });
    q('.spr-avz').addEventListener('click', function () { parar(); avanzar(); dibujar(); });
    q('.spr-reini').addEventListener('click', function () {
      parar(); reiniciar(); escExp.hidden = true;
      var bs = el.querySelectorAll('.spr-esc');
      for (var i = 0; i < bs.length; i++) bs[i].removeAttribute('aria-current');
      dibujar();
    });
    el.addEventListener('click', function (ev) {
      var b = ev.target.closest ? ev.target.closest('button') : null;
      if (!b || !el.contains(b)) return;
      if (b.classList.contains('spr-pedir')) {
        var f = fuentes[+b.getAttribute('data-j')];
        pedir(f);
        dibujar();
      } else if (b.classList.contains('spr-esc')) {
        cargarEscenario(b.getAttribute('data-id'), b);
      }
    });
    el.addEventListener('change', function (ev) {
      var s = ev.target;
      if (s.matches && s.matches('.spr-sel-p')) {
        var f = fuentes[+s.getAttribute('data-j')];
        f.prio = +s.value; f.motivo = null;
        log(t, f.ip + ' = ' + f.prio + (f.prio === 0 ? ' (deshabilitada)' : '') + '.');
        dibujar();
      } else if (s.matches && s.matches('.spr-sel-s')) {
        var f2 = fuentes[+s.getAttribute('data-j')];
        f2.sub = +s.value; f2.motivo = null;
        log(t, f2.is + ' = ' + f2.sub + '.');
        dibujar();
      }
    });

    function cargarEscenario(id, boton) {
      var e = ESCENARIOS.filter(function (x) { return x.id === id; })[0];
      if (!e) return;
      parar();
      reiniciar();
      fuentes.forEach(function (f, j) {
        if (e.prios[f.k]) { f.prio = e.prios[f.k].p; f.sub = e.prios[f.k].s; }
        var selP = el.querySelector('.spr-sel-p[data-j="' + j + '"]');
        var selS = el.querySelector('.spr-sel-s[data-j="' + j + '"]');
        if (selP) selP.value = String(f.prio);
        if (selS) selS.value = String(f.sub);
      });
      programa = e.pet.slice();
      var bs = el.querySelectorAll('.spr-esc');
      for (var i = 0; i < bs.length; i++) {
        if (bs[i] === boton) bs[i].setAttribute('aria-current', 'true'); else bs[i].removeAttribute('aria-current');
      }
      escExp.hidden = false;
      escExp.innerHTML = '<b>' + esc(e.tit) + '.</b> ' + e.exp;
      log(0, 'Escenario: ' + esc(e.tit) + '.');
      if (reducido()) {
        var tope = 0;
        while (ocioso < 3 && tope++ < 200) avanzar();
        dibujar();
      } else {
        dibujar();
        reproducir();
      }
    }

    reiniciar();
    dibujar();
  };
})();
