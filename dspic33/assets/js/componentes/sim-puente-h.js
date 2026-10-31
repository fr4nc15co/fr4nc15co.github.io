/*
 * Componente "sim-puente-h": puente en H con PWM y driver L293D (libro, 17.5.2.2, 17.5.2.3,
 * figuras 101, 102 y 103).
 *
 *   Q1 (superior izquierdo) y Q4 (inferior derecho) reciben la PWM; Q2 (inferior izquierdo) y
 *   Q3 (superior derecho), la PWM invertida. Cada transistor lleva su diodo en antiparalelo.
 *   Tensión media en el motor: Vm · (2·DC − 1)   (50 % → 0 V parado; 100 % → +Vm; 0 % → −Vm).
 *   Por dónde va la corriente en cada instante:
 *     PWM = 1, i > 0 → Q1 → motor → Q4       (la fuente entrega energía)
 *     PWM = 1, i < 0 → D4 → motor → D1       (recirculación / freno: vuelve energía a la fuente)
 *     PWM = 0, i > 0 → D2 → motor → D3       (recirculación: la corriente baja)
 *     PWM = 0, i < 0 → Q3 → motor → Q2
 *   Cableado del L293D como en la figura 103: pata 7 (2A) ← PWM1H1 (RB14, pin 25) → salida 6 (borne + del
 *   motor, nodo izquierdo); pata 2 (1A) ← PWM1L1 (RB15, pin 26) → salida 3 (borne −, nodo derecho).
 *   El DC del simulador es el de PWM1H (PDC1): 100 % → +Vm.
 *   La corriente es un modelo cualitativo normalizado (no amperios): media según la velocidad del
 *   motor y rizado triangular proporcional a DC·(1−DC)/f. La animación va a cámara lenta.
 *
 * Uso: <div class="mpi-mount" data-componente="sim-puente-h" data-config='{"dc":50,"vmotor":9,"pwmHz":20000}'></div>
 *
 * Claves de data-config (opcionales):
 *   dc       ciclo de trabajo inicial en % (0-100, defecto 50)
 *   vmotor   tensión de motor en V, pata 8 del L293D (4,5-36, defecto 9; el libro: 9-12 V)
 *   pwmHz    frecuencia de la PWM en Hz (100-100 000, defecto 20 000; el libro recomienda ≈ 20 kHz)
 *   enable   false para empezar con enable = 0 (motor libre)
 *   fcy      40000000 (defecto) o 39613750, para PTPER/PDC1 de la ampliación
 */
window.MPI = window.MPI || {};
MPI.componentes = MPI.componentes || {};

(function () {
  var NBSP = ' ';
  var FCY_APROX = 40000000, FCY_EXACTO = 39613750;
  var PRESC_PWM = [1, 4, 16, 64];
  var uid = 0;

  function agrupar(n) {
    var s = String(Math.abs(n));
    if (s.length >= 5) s = s.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
    return (n < 0 ? '−' : '') + s;
  }
  function fx(x, nd) {
    var t = Math.abs(x).toFixed(nd);
    if (t.indexOf('.') >= 0) t = t.replace(/0+$/, '').replace(/\.$/, '');
    var p = t.split('.');
    var cero = /^0(\.0*)?$/.test(Math.abs(x).toFixed(nd));
    return (x < 0 && !cero ? '−' : '') + agrupar(+p[0]) + (p[1] ? ',' + p[1] : '');
  }
  function conSigno(x, nd) { var s = fx(x, nd); return (x > 0 && s !== '0' ? '+' : '') + s; }
  function fmtF(f) { return f >= 1000 ? fx(f / 1000, 2) + NBSP + 'kHz' : fx(f, 1) + NBSP + 'Hz'; }
  function fmtT(s) {
    if (s >= 1e-3) return fx(s * 1e3, 3) + NBSP + 'ms';
    return fx(s * 1e6, 2) + NBSP + 'µs';
  }
  function hex4(v) { var s = (v >>> 0).toString(16).toUpperCase(); while (s.length < 4) s = '0' + s; return '0x' + s; }
  function numero(v, def, lo, hi) {
    var x = typeof v === 'string' ? parseFloat(v.replace(',', '.')) : Number(v);
    if (!isFinite(x)) return def;
    return Math.min(hi, Math.max(lo, x));
  }

  // Geometría del puente (viewBox 0 0 360 300)
  var G = { yV: 36, yM: 156, yG: 276, xQi: 76, xDi: 120, xQd: 284, xDd: 240, xc: 180, rM: 24 };
  var CAMINOS = {
    Q14: [[180, 36], [76, 36], [76, 156], [284, 156], [284, 276], [180, 276]],
    D41: [[180, 276], [240, 276], [240, 156], [120, 156], [120, 36], [180, 36]],
    D23: [[180, 276], [120, 276], [120, 156], [240, 156], [240, 36], [180, 36]],
    Q32: [[180, 36], [284, 36], [284, 156], [76, 156], [76, 276], [180, 276]]
  };
  var CONDUCEN = { Q14: ['Q1', 'Q4'], D41: ['D4', 'D1'], D23: ['D2', 'D3'], Q32: ['Q3', 'Q2'] };

  MPI.componentes['sim-puente-h'] = function (el, cfg) {
    cfg = cfg || {};
    var id = 'phz' + (++uid);
    var dc = Math.round(numero(cfg.dc, 50, 0, 100));
    var vm = Math.round(numero(cfg.vmotor, 9, 4.5, 36) * 2) / 2;
    var f = Math.round(numero(cfg.pwmHz, 20000, 100, 100000));
    var enable = cfg.enable !== false && cfg.enable !== 0;
    var fcy = Math.abs(Number(cfg.fcy) - FCY_EXACTO) < 1000 ? FCY_EXACTO : FCY_APROX;
    var reducido = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

    var frecs = [1000, 5000, 20000, 40000];
    if (frecs.indexOf(f) < 0) { frecs.push(f); frecs.sort(function (a, b) { return a - b; }); }
    var optF = frecs.map(function (x) {
      return '<option value="' + x + '"' + (x === f ? ' selected' : '') + '>' + fmtF(x) + (x === 20000 ? ' (recomendada)' : '') + '</option>';
    }).join('');

    el.classList.add('mpi-sim-puente-h');
    el.innerHTML =
      '<div class="mpi-sim-cab">Puente en H con PWM y L293D <span class="phz-sub">tensión media = V<sub>m</sub>·(2·DC − 1)</span></div>' +
      '<div class="phz-ctl">' +
        '<div class="phz-des"><label for="' + id + '-dc">Ciclo de trabajo (DC)</label>' +
          '<input type="range" id="' + id + '-dc" class="phz-in-dc" min="0" max="100" step="1" value="' + dc + '">' +
          '<output for="' + id + '-dc" class="phz-out-dc"></output></div>' +
        '<div class="phz-des"><label for="' + id + '-vm">V<sub>motor</sub> (pata 8)</label>' +
          '<input type="range" id="' + id + '-vm" class="phz-in-vm" min="4.5" max="36" step="0.5" value="' + vm + '">' +
          '<output for="' + id + '-vm" class="phz-out-vm"></output></div>' +
        '<div class="phz-fila">' +
          '<label>Frecuencia PWM <select class="phz-f">' + optF + '</select></label>' +
          '<label class="phz-chk"><input type="checkbox" class="phz-en"' + (enable ? '' : ' checked') + '> Enable (pata 1) = 0 · motor libre</label>' +
        '</div>' +
      '</div>' +
      '<div class="phz-panel" aria-live="polite"></div>' +
      '<div class="phz-cuerpo">' +
        '<figure class="phz-fig"><div class="phz-puente"></div>' +
          '<p class="phz-fase"></p>' +
          '<figcaption>Puente en H: Q1 y Q4 reciben la PWM; Q2 y Q3, la PWM invertida</figcaption></figure>' +
        '<figure class="phz-fig"><div class="phz-ondas"></div>' +
          '<div class="phz-leyenda"><span class="phz-ley-q">corriente por transistores</span><span class="phz-ley-d">corriente por diodos</span></div>' +
          '<figcaption>Dos periodos de la PWM (cámara lenta)</figcaption></figure>' +
      '</div>' +
      '<div class="phz-anim">' +
        '<button type="button" class="phz-pausa" aria-pressed="false"></button>' +
        '<button type="button" class="phz-paso">Siguiente semiperiodo ▶</button>' +
        '<div class="phz-des phz-des-t"><label for="' + id + '-t">Instante t</label>' +
          '<input type="range" id="' + id + '-t" class="phz-in-t" min="0" max="1000" step="1" value="0">' +
          '<output for="' + id + '-t" class="phz-out-t"></output></div>' +
        '<label>Un periodo en pantalla <select class="phz-vel"><option value="1.5">1,5 s</option><option value="3" selected>3 s</option><option value="6">6 s</option></select></label>' +
      '</div>' +
      '<p class="phz-nota-anim"></p>' +
      '<section class="phz-l293" aria-labelledby="' + id + '-l293">' +
        '<h4 id="' + id + '-l293">L293D: doble puente en H (figura 103)</h4>' +
        '<div class="phz-l293-cuerpo">' +
          '<div class="phz-chip"></div>' +
          '<ul class="phz-l293-notas">' +
            '<li><b>Corriente máxima</b>: <select class="phz-nmot" aria-label="Motores conectados"><option value="1">1 motor</option><option value="2">2 motores</option></select> <span class="phz-imax"></span></li>' +
            '<li><b>Pata 8</b>: tensión del motor (baterías, 9-12 V). <b>Pata 16</b>: alimentación de la lógica del chip. <b>Patas 4, 5, 12 y 13</b>: masa.</li>' +
            '<li><b>Patas 1 y 9</b>: enable de cada puente. Con enable = 0 las salidas quedan en alta impedancia.</li>' +
            '<li><b>Patas 2 y 7</b>: señal de control invertida y directa del motor 1 → como en la figura 103, la 2 va a <code>PWM1L</code> (RB15, pin 26) y la 7 a <code>PWM1H</code> (RB14, pin 25). La 2 manda en la salida 3 y la 7 en la 6. Con un solo motor no se usan 9, 10, 11, 14 y 15.</li>' +
            '<li><b>PWM ≈ 20 kHz</b>: inaudible y con poco rizado de corriente. DC 0 % = máxima velocidad en sentido −, 50 % = parado, 100 % = máxima en sentido +.</li>' +
            '<li>Los cuatro diodos del puente están dentro del chip (la «D» de L293D).</li>' +
            '<li class="phz-ojo">La figura 103 está dibujada para el dsPIC30F3010, pero los pines 25 y 26 son también PWM1H1 y PWM1L1 en el dsPIC33FJ32MC202. Intercambiar las patas 2 y 7 solo invierte el sentido de giro. En la PicTrainer, RB14 y RB15 son también los LEDs D7 y D6.</li>' +
          '</ul>' +
        '</div>' +
      '</section>' +
      '<section class="phz-amp" aria-labelledby="' + id + '-amp">' +
        '<h4 id="' + id + '-amp">Ampliación: módulo PWM del dsPIC</h4>' +
        '<label class="phz-fcy">F<sub>CY</sub> <select aria-label="Frecuencia de instrucción FCY">' +
          '<option value="' + FCY_APROX + '"' + (fcy === FCY_APROX ? ' selected' : '') + '>40' + NBSP + '000' + NBSP + '000 Hz (aproximado)</option>' +
          '<option value="' + FCY_EXACTO + '"' + (fcy === FCY_EXACTO ? ' selected' : '') + '>39' + NBSP + '613' + NBSP + '750 Hz (exacto)</option>' +
        '</select></label>' +
        '<div class="phz-amp-tabla"></div>' +
      '</section>';

    function $(s) { return el.querySelector(s); }
    var inDc = $('.phz-in-dc'), inVm = $('.phz-in-vm'), selF = $('.phz-f'), chkEn = $('.phz-en');
    var inT = $('.phz-in-t'), outT = $('.phz-out-t'), btnPausa = $('.phz-pausa'), btnPaso = $('.phz-paso'), selVel = $('.phz-vel');
    var selNmot = $('.phz-nmot'), selFcy = $('.phz-fcy select');

    // ---------- estado de la simulación ----------
    var t = 0.25;            // tiempo en periodos de PWM, en [0, 2)
    var w = enable ? (2 * dc / 100 - 1) : 0;   // velocidad normalizada (−1…1), arranca en régimen
    var giro = 0;            // ángulo de la flecha de giro (grados)
    var pausado = reducido, corriendo = false, ultimo = null, visible = true;
    var segPeriodo = 3;
    var TAU = 3, TAU_LIBRE = 6;   // constantes de tiempo mecánicas en pantalla (s): también ralentizadas
    var claveOndas = '', claveEstado = '';

    function vNorm() { return enable ? 2 * dc / 100 - 1 : 0; }
    function rizado() {
      var D = dc / 100;
      return Math.min(1.6, 0.35 * 4 * D * (1 - D) * (20000 / f));
    }
    function iMedia() {
      if (!enable) return 0;
      var v = vNorm();
      return Math.max(-1, Math.min(1, 1.2 * (v - w) + 0.25 * w));
    }
    // corriente en la fase phi ∈ [0,1) del periodo
    function iEn(phi) {
      if (!enable) return 0;
      var D = dc / 100, Ia = iMedia(), d = rizado();
      if (D >= 1) return Ia;
      if (D <= 0) return Ia;
      if (phi < D) return Ia - d / 2 + d * (phi / D);
      return Ia + d / 2 - d * ((phi - D) / (1 - D));
    }
    function pwmEn(phi) { return dc >= 100 ? 1 : (dc <= 0 ? 0 : (phi < dc / 100 ? 1 : 0)); }
    function camino(pwm, i) {
      if (!enable || Math.abs(i) < 0.004) return null;
      if (pwm) return i > 0 ? 'Q14' : 'D41';
      return i > 0 ? 'D23' : 'Q32';
    }

    // ---------- dibujo estático del puente ----------
    function transistor(nom, xb, yc, s, yTop, yBot) {
      // s = −1: base a la izquierda (pata izquierda); s = +1: base a la derecha
      var xbar = xb + s * 12, xt = xbar + s * 8, anc = s < 0 ? 'end' : 'start';
      var h = '<g class="phz-q" data-q="' + nom + '">' +
        '<circle cx="' + (xb + s * 6) + '" cy="' + yc + '" r="16" class="phz-q-env"/>' +
        '<line x1="' + xb + '" y1="' + yTop + '" x2="' + xb + '" y2="' + (yc - 14) + '" class="phz-hilo"/>' +
        '<line x1="' + xbar + '" y1="' + (yc - 5) + '" x2="' + xb + '" y2="' + (yc - 14) + '" class="phz-hilo"/>' +
        '<line x1="' + xbar + '" y1="' + (yc + 5) + '" x2="' + xb + '" y2="' + (yc + 14) + '" class="phz-hilo" marker-end="url(#' + id + '-npn)"/>' +
        '<line x1="' + xb + '" y1="' + (yc + 14) + '" x2="' + xb + '" y2="' + yBot + '" class="phz-hilo"/>' +
        '<line x1="' + xbar + '" y1="' + (yc - 11) + '" x2="' + xbar + '" y2="' + (yc + 11) + '" class="phz-base"/>' +
        '</g>' +
        '<g class="phz-g" data-g="' + nom + '">' +
        '<line x1="' + xbar + '" y1="' + yc + '" x2="' + (xbar + s * 26) + '" y2="' + yc + '" class="phz-g-l"/>' +
        '<text x="' + xt + '" y="' + (yc - 5) + '" text-anchor="' + anc + '" class="phz-q-t">' + nom + '</text>' +
        '<text x="' + xt + '" y="' + (yc + 14) + '" text-anchor="' + anc + '" class="phz-g-t"></text>' +
        '</g>';
      return h;
    }
    function diodo(nom, xd, yc, yTop, yBot, s) {
      return '<g class="phz-d" data-d="' + nom + '">' +
        '<line x1="' + xd + '" y1="' + yTop + '" x2="' + xd + '" y2="' + (yc - 7) + '" class="phz-hilo"/>' +
        '<line x1="' + xd + '" y1="' + (yc + 7) + '" x2="' + xd + '" y2="' + yBot + '" class="phz-hilo"/>' +
        '<path d="M' + (xd - 8) + ',' + (yc + 7) + ' L' + (xd + 8) + ',' + (yc + 7) + ' L' + xd + ',' + (yc - 6) + ' Z" class="phz-d-tri"/>' +
        '<line x1="' + (xd - 8) + '" y1="' + (yc - 7) + '" x2="' + (xd + 8) + '" y2="' + (yc - 7) + '" class="phz-d-bar"/>' +
        '<text x="' + (xd + s * 12) + '" y="' + (yc + 4) + '" class="phz-d-t' + (s < 0 ? ' phz-d-t-i' : '') + '">' + nom + '</text>' +
        '</g>';
    }
    (function puente() {
      var h = '<svg viewBox="0 0 360 300" class="phz-svg" role="img" aria-label="Puente en H de cuatro transistores con sus diodos y el motor en el centro">' +
        '<defs><marker id="' + id + '-npn" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0,1 L10,5 L0,9 z" class="phz-mk"/></marker>' +
        '<marker id="' + id + '-fg" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0,0 L10,5 L0,10 z" class="phz-mk-g"/></marker></defs>';
      // raíles
      h += '<line x1="' + G.xQi + '" y1="' + G.yV + '" x2="' + G.xQd + '" y2="' + G.yV + '" class="phz-hilo"/>' +
        '<line x1="' + G.xQi + '" y1="' + G.yG + '" x2="' + G.xQd + '" y2="' + G.yG + '" class="phz-hilo"/>' +
        '<line x1="180" y1="16" x2="180" y2="' + G.yV + '" class="phz-hilo"/><circle cx="180" cy="14" r="3" class="phz-term"/>' +
        '<text x="188" y="18" class="phz-vm-t"></text>' +
        '<line x1="180" y1="' + G.yG + '" x2="180" y2="288" class="phz-hilo"/>' +
        '<line x1="168" y1="288" x2="192" y2="288" class="phz-hilo"/><line x1="173" y1="292" x2="187" y2="292" class="phz-hilo"/><line x1="177" y1="296" x2="183" y2="296" class="phz-hilo"/>' +
        '<text x="196" y="292" class="phz-nodo-t">GND</text>';
      // nodos centrales y cables al motor
      h += '<line x1="' + G.xQi + '" y1="' + G.yM + '" x2="' + (G.xc - G.rM) + '" y2="' + G.yM + '" class="phz-hilo"/>' +
        '<line x1="' + (G.xc + G.rM) + '" y1="' + G.yM + '" x2="' + G.xQd + '" y2="' + G.yM + '" class="phz-hilo"/>' +
        '<circle cx="' + G.xDi + '" cy="' + G.yM + '" r="2.5" class="phz-punto"/><circle cx="' + G.xDd + '" cy="' + G.yM + '" r="2.5" class="phz-punto"/>' +
        '<text x="98" y="150" class="phz-nodo-t">pata 6</text><text x="262" y="150" class="phz-nodo-t">pata 3</text>' +
        '<text x="98" y="170" class="phz-nodo-v phz-v-izq"></text><text x="262" y="170" class="phz-nodo-v phz-v-der"></text>';
      // camino de la corriente (debajo de los componentes)
      h += '<polyline class="phz-i" points=""/><g class="phz-i-fl"></g>';
      // transistores y diodos
      h += transistor('Q1', G.xQi, 96, -1, G.yV, G.yM) + transistor('Q2', G.xQi, 216, -1, G.yM, G.yG) +
        transistor('Q3', G.xQd, 96, 1, G.yV, G.yM) + transistor('Q4', G.xQd, 216, 1, G.yM, G.yG);
      h += diodo('D1', G.xDi, 96, G.yV, G.yM, 1) + diodo('D2', G.xDi, 216, G.yM, G.yG, 1) +
        diodo('D3', G.xDd, 96, G.yV, G.yM, -1) + diodo('D4', G.xDd, 216, G.yM, G.yG, -1);
      // motor
      h += '<circle cx="' + G.xc + '" cy="' + G.yM + '" r="' + G.rM + '" class="phz-motor"/>' +
        '<text x="' + G.xc + '" y="' + (G.yM + 6) + '" class="phz-motor-t">M</text>' +
        '<text x="' + (G.xc - G.rM - 4) + '" y="' + (G.yM - 8) + '" class="phz-pol">+</text><text x="' + (G.xc + G.rM + 4) + '" y="' + (G.yM - 8) + '" class="phz-pol">−</text>' +
        '<g class="phz-rot" transform="translate(' + G.xc + ',' + G.yM + ')"><g class="phz-rot-g">' +
          '<path d="M-29,-14 A32,32 0 0 1 22,-23" class="phz-giro" marker-end="url(#' + id + '-fg)"/>' +
          '<path d="M29,14 A32,32 0 0 1 -22,23" class="phz-giro" marker-end="url(#' + id + '-fg)"/>' +
        '</g></g>' +
        '<text x="' + G.xc + '" y="' + (G.yM - 40) + '" class="phz-vel-t"></text>' +
        '<text x="' + G.xc + '" y="' + (G.yM + 42) + '" class="phz-freno-t"></text>';
      $('.phz-puente').innerHTML = h + '</svg>';
    })();
    var svgP = $('.phz-puente svg');
    var polI = svgP.querySelector('.phz-i'), rotG = svgP.querySelector('.phz-rot-g'), rot = svgP.querySelector('.phz-rot');
    var velT = svgP.querySelector('.phz-vel-t'), frenoT = svgP.querySelector('.phz-freno-t'), flechasI = svgP.querySelector('.phz-i-fl'), vIzqT = svgP.querySelector('.phz-v-izq'), vDerT = svgP.querySelector('.phz-v-der');
    var faseP = $('.phz-fase');

    // ---------- chip L293D ----------
    function chip() {
      var izq = [
        [1, 'EN1,2', 'enable = ' + (enable ? '1' : '0')], [2, '1A', 'PWM1L · RB15 (26)'], [3, '1Y', '→ motor −'], [4, 'GND', 'masa'],
        [5, 'GND', 'masa'], [6, '2Y', '→ motor +'], [7, '2A', 'PWM1H · RB14 (25)'], [8, 'VCC2', 'V motor = ' + fx(vm, 1) + NBSP + 'V']
      ];
      var der = [
        [16, 'VCC1', 'lógica 5 V'], [15, '4A', 'motor 2'], [14, '4Y', 'motor 2'], [13, 'GND', 'masa'],
        [12, 'GND', 'masa'], [11, '3Y', 'motor 2'], [10, '3A', 'motor 2'], [9, 'EN3,4', 'motor 2']
      ];
      var xb = 124, wb = 110, y0 = 20, dy = 22;
      var h = '<svg viewBox="0 0 368 206" class="phz-svg phz-chip-svg" role="img" aria-label="Patillaje del L293D y conexiones del motor 1">';
      h += '<rect x="' + xb + '" y="' + (y0 - 12) + '" width="' + wb + '" height="' + (8 * dy + 6) + '" rx="4" class="phz-chip-c"/>' +
        '<path d="M' + (xb + wb / 2 - 9) + ',' + (y0 - 12) + ' A9,9 0 0 0 ' + (xb + wb / 2 + 9) + ',' + (y0 - 12) + '" class="phz-chip-m"/>' +
        '<text x="' + (xb + wb / 2) + '" y="' + (y0 + 3.5 * dy + 4) + '" class="phz-chip-n">L293D</text>';
      izq.forEach(function (p, k) {
        var y = y0 + k * dy, m1 = p[0] <= 8;
        h += '<g class="phz-pin" data-pin="' + p[0] + '"><rect x="' + (xb - 12) + '" y="' + (y - 6) + '" width="12" height="12" class="phz-pin-r"/>' +
          '<text x="' + (xb - 6) + '" y="' + (y + 3.5) + '" class="phz-pin-n">' + p[0] + '</text>' +
          '<text x="' + (xb + 4) + '" y="' + (y + 3.5) + '" class="phz-pin-f">' + p[1] + '</text>' +
          '<text x="' + (xb - 17) + '" y="' + (y + 3.5) + '" class="phz-pin-x' + (m1 ? ' phz-pin-x-m1' : '') + '">' + p[2] + '</text>' +
          '<text x="' + (xb + 44) + '" y="' + (y + 3.5) + '" class="phz-pin-v"></text></g>';
      });
      der.forEach(function (p, k) {
        var y = y0 + k * dy, m2 = /motor 2/.test(p[2]);
        h += '<g class="phz-pin' + (m2 ? ' phz-pin-m2' : '') + '" data-pin="' + p[0] + '"><rect x="' + (xb + wb) + '" y="' + (y - 6) + '" width="12" height="12" class="phz-pin-r"/>' +
          '<text x="' + (xb + wb + 6) + '" y="' + (y + 3.5) + '" class="phz-pin-n">' + p[0] + '</text>' +
          '<text x="' + (xb + wb - 4) + '" y="' + (y + 3.5) + '" class="phz-pin-f phz-pin-f-d">' + p[1] + '</text>' +
          '<text x="' + (xb + wb + 17) + '" y="' + (y + 3.5) + '" class="phz-pin-x phz-pin-x-d">' + p[2] + '</text></g>';
      });
      $('.phz-chip').innerHTML = h + '</svg>';
    }

    // ---------- formas de onda ----------
    var X0 = 82, X1 = 352, P = (X1 - X0) / 2;
    var RY = { h1: 14, h0: 32, l1: 50, l0: 68, vc: 116, va: 24, ic: 192, is: 30 };
    function ondas() {
      var D = dc / 100, Ia = iMedia(), d = rizado(), v = vNorm();
      var h = '<svg viewBox="0 0 360 248" class="phz-svg" role="img" aria-label="Formas de onda: PWM en las patas 2 y 7, tensión en el motor y corriente">';
      h += '<text x="4" y="' + (RY.h0 - 4) + '" class="phz-on-n">7 · PWM1H</text>' +
        '<text x="4" y="' + (RY.l0 - 4) + '" class="phz-on-n">2 · PWM1L</text>' +
        '<text x="4" y="' + (RY.vc + 4) + '" class="phz-on-n">V₆ − V₃</text>' +
        '<text x="4" y="' + (RY.ic + 4) + '" class="phz-on-n">i motor</text>';
      for (var k = 0; k <= 2; k++) h += '<line x1="' + (X0 + k * P) + '" y1="6" x2="' + (X0 + k * P) + '" y2="232" class="phz-rej"/>';
      function digital(hi, lo, inv) {
        var pts = [];
        for (var k = 0; k < 2; k++) {
          var xs = X0 + k * P, xa = xs + D * P;
          var a = inv ? lo : hi, b = inv ? hi : lo;
          if (D >= 1) pts.push([xs, a], [xs + P, a]);
          else if (D <= 0) pts.push([xs, b], [xs + P, b]);
          else pts.push([xs, a], [xa, a], [xa, b], [xs + P, b]);
        }
        return '<polyline points="' + pts.map(function (p) { return p[0].toFixed(1) + ',' + p[1]; }).join(' ') + '" class="phz-on-d"/>';
      }
      h += digital(RY.h1, RY.h0, false) + digital(RY.l1, RY.l0, true);
      // tensión en el motor
      h += '<line x1="' + X0 + '" y1="' + RY.vc + '" x2="' + X1 + '" y2="' + RY.vc + '" class="phz-cero"/>' +
        '<text x="' + (X0 - 4) + '" y="' + (RY.vc - RY.va + 4) + '" class="phz-on-y">+' + fx(vm, 1) + '</text>' +
        '<text x="' + (X0 - 4) + '" y="' + (RY.vc + RY.va + 4) + '" class="phz-on-y">−' + fx(vm, 1) + '</text>';
      if (!enable) {
        h += '<line x1="' + X0 + '" y1="' + RY.vc + '" x2="' + X1 + '" y2="' + RY.vc + '" class="phz-on-z"/>' +
          '<text x="' + ((X0 + X1) / 2) + '" y="' + (RY.vc - 6) + '" class="phz-on-zt">salidas en alta impedancia</text>';
      } else {
        h += digital(RY.vc - RY.va, RY.vc + RY.va, false).replace('phz-on-d', 'phz-on-v');
        var ym = RY.vc - v * RY.va;
        h += '<line x1="' + X0 + '" y1="' + ym.toFixed(1) + '" x2="' + X1 + '" y2="' + ym.toFixed(1) + '" class="phz-on-m"/>' +
          '<text x="' + (X1 - 2) + '" y="' + (ym - 4).toFixed(1) + '" class="phz-on-mt">media ' + conSigno(vm * v, 2) + NBSP + 'V</text>';
      }
      // corriente
      h += '<line x1="' + X0 + '" y1="' + RY.ic + '" x2="' + X1 + '" y2="' + RY.ic + '" class="phz-cero"/>' +
        '<text x="' + (X0 - 4) + '" y="' + (RY.ic + 4) + '" class="phz-on-y">0</text>';
      function yi(i) { return RY.ic - Math.max(-1.25, Math.min(1.25, i)) * RY.is; }
      function tramo(xa, ia, xb, ib, pwm) {
        // parte un tramo lineal en el cruce por cero y lo colorea según el camino
        var out = '';
        var trozos = [[xa, ia, xb, ib]];
        if (ia * ib < 0) { var xz = xa + (xb - xa) * (ia / (ia - ib)); trozos = [[xa, ia, xz, 0], [xz, 0, xb, ib]]; }
        trozos.forEach(function (s) {
          var im = (s[1] + s[3]) / 2, c = camino(pwm, im);
          var cls = !c ? 'phz-on-i0' : (c.charAt(0) === 'Q' ? 'phz-on-iq' : 'phz-on-id');
          out += '<line x1="' + s[0].toFixed(1) + '" y1="' + yi(s[1]).toFixed(1) + '" x2="' + s[2].toFixed(1) + '" y2="' + yi(s[3]).toFixed(1) + '" class="' + cls + '"/>';
        });
        return out;
      }
      for (k = 0; k < 2; k++) {
        var xs = X0 + k * P;
        if (!enable) { h += '<line x1="' + xs + '" y1="' + RY.ic + '" x2="' + (xs + P) + '" y2="' + RY.ic + '" class="phz-on-i0"/>'; continue; }
        if (D >= 1 || D <= 0) { h += tramo(xs, Ia, xs + P, Ia, D >= 1 ? 1 : 0); continue; }
        var xa = xs + D * P;
        h += tramo(xs, Ia - d / 2, xa, Ia + d / 2, 1) + tramo(xa, Ia + d / 2, xs + P, Ia - d / 2, 0);
      }
      h += '<text x="' + X0 + '" y="245" class="phz-on-ax">0</text><text x="' + (X0 + P) + '" y="245" class="phz-on-ax">T = ' + fmtT(1 / f) + '</text><text x="' + X1 + '" y="245" class="phz-on-ax phz-on-ax-d">2T</text>';
      h += '<line class="phz-cursor" x1="' + X0 + '" y1="6" x2="' + X0 + '" y2="232"/>';
      $('.phz-ondas').innerHTML = h + '</svg>';
    }

    // ---------- panel de resultados (aria-live: solo cambia con los controles) ----------
    function panel() {
      var D = dc / 100, v = 2 * D - 1, vmed = vm * v;
      $('.phz-out-dc').textContent = dc + NBSP + '%';
      $('.phz-out-vm').textContent = fx(vm, 1) + NBSP + 'V';
      inDc.setAttribute('aria-valuetext', dc + ' %');
      inVm.setAttribute('aria-valuetext', fx(vm, 1) + ' V');
      var h;
      if (!enable) {
        h = '<div class="phz-res"><span>Enable <b>0</b></span><span>Tensión aplicada <b>ninguna</b> (salidas en alta impedancia)</span></div>' +
          '<p class="phz-txt">Con enable = 0 ningún transistor conduce, aunque las patas 2 y 7 sigan recibiendo la PWM: el motor queda <strong>libre</strong> y se va parando por rozamiento. ' +
          '(La poca corriente que tuviera la bobina se extingue en microsegundos a través de los diodos.)</p>';
      } else {
        var sentido = Math.abs(v) < 1e-9 ? 'parado' : (v > 0 ? '+ (horario en el dibujo)' : '− (antihorario)');
        h = '<div class="phz-res"><span>Tensión media <b>' + conSigno(vmed, 2) + NBSP + 'V</b></span>' +
          '<span>Sentido <b>' + sentido + '</b></span>' +
          '<span>Velocidad relativa <b>' + fx(Math.abs(v) * 100, 0) + NBSP + '%</b> de la máxima</span></div>' +
          '<p class="phz-formula">V<sub>media</sub> = V<sub>m</sub>·(2·DC − 1) = ' + fx(vm, 1) + ' · (2 · ' + fx(D, 2) + ' − 1) = ' + conSigno(vmed, 2) + NBSP + 'V</p>';
        if (dc === 50) h += '<p class="phz-txt">Con DC = 50 % la tensión media es 0: el motor está parado aunque los transistores conmutan continuamente (la corriente oscila alrededor de 0 y alterna transistores y diodos).</p>';
        if (f < 20000) h += '<p class="phz-txt phz-txt-av">A ' + fmtF(f) + ' la PWM es audible (pitido) y el rizado de corriente es mayor: por eso se recomiendan unos 20 kHz.</p>';
      }
      if (vm < 9 || vm > 12) h += '<p class="phz-txt phz-txt-av">El libro alimenta el motor con 9-12 V (baterías); el L293D admite en la pata 8 de 4,5 a 36 V.</p>';
      $('.phz-panel').innerHTML = h;
    }

    function ampliacion() {
      var k = 0;
      while (k < 3 && fcy / (f * PRESC_PWM[k]) > 32767) k++;
      var presc = PRESC_PWM[k], ex = fcy / (f * presc), ptper = Math.round(ex);
      var cabe = ex <= 32767;
      var pdc = Math.round(2 * ptper * dc / 100);
      $('.phz-amp-tabla').innerHTML = cabe ? '<table><tbody>' +
        '<tr><th scope="row">Pre-escalado</th><td><b>1:' + presc + '</b> → <code>PTCON = ' + hex4(0x8000 | (k << 2)) + '</code></td></tr>' +
        '<tr><th scope="row">PTPER</th><td><code>PTPER = ' + agrupar(ptper) + '</code> <small>= F<sub>CY</sub> / (f · presc) = ' + agrupar(fcy) + ' / (' + agrupar(f) + ' · ' + presc + ')' + (Math.abs(ex - ptper) > 1e-6 ? ' = ' + fx(ex, 2) : '') + '</small></td></tr>' +
        '<tr><th scope="row">PDC1</th><td><code>PDC1 = ' + agrupar(pdc) + '</code> <small>= 2 · PTPER · DC = 2 · ' + agrupar(ptper) + ' · ' + fx(dc / 100, 2) + ' (PDC1 = PTPER da el 50 %)</small></td></tr>' +
        '<tr><th scope="row">PWMCON1</th><td><code>PWMCON1 = 0x0011</code> <small>par 1 complementario (PWM1L = PWM1H invertida), PEN1H = PEN1L = 1</small></td></tr>' +
        '</tbody></table><p class="phz-amp-nota">Fórmulas del driver del libro (cap. 20). El DC del simulador es el de PWM1H (pata 7); en modo complementario el módulo genera él mismo la PWM invertida, PWM1L, para la pata 2.</p>'
        : '<p class="phz-amp-nota">A ' + fmtF(f) + ' no cabe en 15 bits ni con 1:64.</p>';
    }

    // ---------- estado instantáneo (cada fotograma) ----------
    function estado() {
      var phi = t - Math.floor(t);
      var pwm = pwmEn(phi), i = iEn(phi), c = camino(pwm, i);
      var frena = enable && Math.abs(w) > 0.05 && iMedia() * w < -0.02;
      var clave = [pwm, c, enable, vm, dc, frena].join('|');
      if (clave !== claveEstado) {
        claveEstado = clave;
        var on = c ? CONDUCEN[c] : [];
        ['Q1', 'Q2', 'Q3', 'Q4'].forEach(function (q) {
          var mandado = enable && ((q === 'Q1' || q === 'Q4') ? pwm === 1 : pwm === 0);
          var gq = svgP.querySelector('[data-q="' + q + '"]'), gg = svgP.querySelector('[data-g="' + q + '"]');
          gq.classList.toggle('phz-conduce', on.indexOf(q) >= 0);
          gq.classList.toggle('phz-mandado', mandado);
          gg.classList.toggle('phz-g-on', (q === 'Q1' || q === 'Q4') ? pwm === 1 : pwm === 0);
          gg.querySelector('.phz-g-t').textContent = ((q === 'Q1' || q === 'Q4') ? 'PWM' : 'PWM̄') + ' = ' + ((q === 'Q1' || q === 'Q4') ? pwm : 1 - pwm);
        });
        ['D1', 'D2', 'D3', 'D4'].forEach(function (dn) {
          svgP.querySelector('[data-d="' + dn + '"]').classList.toggle('phz-conduce', on.indexOf(dn) >= 0);
        });
        if (c) {
          var pts = CAMINOS[c], tipo = c.charAt(0) === 'Q' ? 'phz-i-q' : 'phz-i-d', fl = '';
          polI.setAttribute('points', pts.map(function (p) { return p.join(','); }).join(' '));
          polI.setAttribute('class', 'phz-i phz-i-on ' + tipo);
          // flechas de sentido en el centro de cada tramo largo
          for (var k = 0; k + 1 < pts.length; k++) {
            var ax = pts[k][0], ay = pts[k][1], bx = pts[k + 1][0], by = pts[k + 1][1];
            var L = Math.sqrt((bx - ax) * (bx - ax) + (by - ay) * (by - ay));
            if (L < 50) continue;
            var ux = (bx - ax) / L, uy = (by - ay) / L, my = (ay + by) / 2;
            // en el tramo del motor, una flecha en cada cable (entre el diodo y el motor)
            var xs = (Math.abs(by - ay) < 1 && Math.abs(my - G.yM) < 1) ? [138, 222] : [(ax + bx) / 2];
            xs.forEach(function (mx) {
              fl += '<path d="M' + (mx + 6 * ux).toFixed(1) + ',' + (my + 6 * uy).toFixed(1) +
                ' L' + (mx - 5 * ux - 5 * uy).toFixed(1) + ',' + (my - 5 * uy + 5 * ux).toFixed(1) +
                ' L' + (mx - 5 * ux + 5 * uy).toFixed(1) + ',' + (my - 5 * uy - 5 * ux).toFixed(1) + ' Z"/>';
            });
          }
          flechasI.setAttribute('class', 'phz-i-fl ' + tipo);
          flechasI.innerHTML = fl;
        } else {
          polI.setAttribute('points', '');
          polI.setAttribute('class', 'phz-i');
          flechasI.innerHTML = '';
        }
        // nodo izquierdo = pata 6 (2Y, sigue a la pata 7 = PWM1H); nodo derecho = pata 3 (1Y, sigue a la pata 2 = PWM1L)
        var v6 = enable ? (pwm ? vm : 0) : null, v3 = enable ? (pwm ? 0 : vm) : null;
        vIzqT.textContent = v6 == null ? 'Z' : fx(v6, 1) + NBSP + 'V';
        vDerT.textContent = v3 == null ? 'Z' : fx(v3, 1) + NBSP + 'V';
        svgP.querySelector('.phz-vm-t').textContent = '+V' + 'm = ' + fx(vm, 1) + NBSP + 'V';
        // chip: niveles de las patas 2, 7, 3 y 6
        var niveles = {
          1: [enable ? '1' : '0', enable], 7: [String(pwm), pwm === 1], 2: [String(1 - pwm), pwm === 0],
          3: [v3 == null ? 'Z' : fx(v3, 1) + NBSP + 'V', !!v3], 6: [v6 == null ? 'Z' : fx(v6, 1) + NBSP + 'V', !!v6]
        };
        Object.keys(niveles).forEach(function (n) {
          var g = el.querySelector('.phz-chip [data-pin="' + n + '"]');
          if (!g) return;
          g.querySelector('.phz-pin-v').textContent = niveles[n][0];
          g.classList.toggle('phz-pin-alto', niveles[n][1]);
        });
        // texto de la fase (no es aria-live: cambia muy a menudo)
        var txt;
        if (!enable) txt = 'Enable = 0: Q1-Q4 apagados, ningún camino de corriente. El motor gira libre.';
        else {
          var mand = pwm ? 'Q1 y Q4' : 'Q2 y Q3';
          var ini = '<b>PWM = ' + pwm + '</b> → ' + mand + ' mandados a ON. ';
          if (!c) txt = ini + 'Corriente ≈ 0 en este instante.';
          else if (c === 'Q14') txt = ini + '<span class="phz-c-q">i &gt; 0: +V<sub>m</sub> → Q1 → motor → Q4 → masa.</span> La fuente entrega energía.';
          else if (c === 'Q32') txt = ini + '<span class="phz-c-q">i &lt; 0: +V<sub>m</sub> → Q3 → motor → Q2 → masa.</span> La fuente entrega energía.';
          else if (c === 'D23') txt = ini + '<span class="phz-c-d">Pero i &gt; 0 sigue en el mismo sentido (bobina): masa → D2 → motor → D3 → +V<sub>m</sub>.</span> Recirculación por diodos: la energía vuelve a la batería y la corriente baja.';
          else txt = ini + '<span class="phz-c-d">Pero i &lt; 0 sigue en el mismo sentido (bobina): masa → D4 → motor → D1 → +V<sub>m</sub>.</span> Recirculación por diodos: la energía vuelve a la batería.';
        }
        if (frena) txt += ' <span class="phz-c-f">Frenando: el motor aún gira en sentido ' + (w > 0 ? '+' : '−') + ' pero la corriente media va al revés; hace de generador (figura 102, «' + (w > 0 ? '+' : '−') + ' freno»).</span>';
        faseP.innerHTML = txt;
      }
      // cursor y tiempo
      var cur = el.querySelector('.phz-cursor');
      var xc = X0 + t * P;
      if (cur) { cur.setAttribute('x1', xc.toFixed(1)); cur.setAttribute('x2', xc.toFixed(1)); }
      var tUs = t / f;
      inT.value = String(Math.round(t * 500));
      outT.textContent = fmtT(tUs);
      inT.setAttribute('aria-valuetext', fmtT(tUs) + ', PWM = ' + pwm);
      // giro y velocidad
      var dir = w < 0 ? -1 : 1;
      rotG.setAttribute('transform', 'rotate(' + giro.toFixed(1) + ') scale(' + dir + ',1)');
      rot.style.opacity = Math.abs(w) < 0.01 ? '0.25' : '1';
      var modo = frena ? 'freno' : '';
      velT.textContent = 'velocidad ' + (Math.abs(w) < 0.005 ? '0' : conSigno(w * 100, 0)) + NBSP + '%';
      frenoT.textContent = modo ? 'frenando (generador)' : '';
    }

    function redibujarOndas(forzar) {
      var clave = [dc, vm, f, enable, Math.round(iMedia() * 100)].join('|');
      if (!forzar && clave === claveOndas) return;
      claveOndas = clave;
      ondas();
    }

    function todo() {
      panel();
      chip();
      ampliacion();
      claveEstado = '';
      redibujarOndas(true);
      estado();
    }

    // ---------- animación ----------
    function frame(ts) {
      if (!document.body.contains(el)) { corriendo = false; return; }
      if (pausado || !visible) { corriendo = false; ultimo = null; return; }
      if (ultimo == null) ultimo = ts;
      var dt = Math.min(0.1, Math.max(0, (ts - ultimo) / 1000));
      ultimo = ts;
      t += dt / segPeriodo;
      t -= 2 * Math.floor(t / 2);
      var v = vNorm();
      w += enable ? (v - w) * Math.min(1, dt / TAU) : -w * Math.min(1, dt / TAU_LIBRE);
      if (Math.abs(w) < 1e-4) w = 0;
      giro = (giro + w * 300 * dt) % 360;
      redibujarOndas(false);
      estado();
      requestAnimationFrame(frame);
    }
    function arrancar() {
      if (corriendo || pausado || !visible) return;
      corriendo = true; ultimo = null;
      requestAnimationFrame(frame);
    }
    function pintarPausa() {
      btnPausa.textContent = pausado ? '▶ Animar' : '⏸ Pausa';
      btnPausa.setAttribute('aria-pressed', String(pausado));
      $('.phz-nota-anim').textContent = (pausado ? 'Animación en pausa: mueve el instante t o pulsa «Siguiente semiperiodo». ' : '') +
        'Cámara lenta: un periodo de ' + fmtT(1 / f) + ' dura ' + fx(segPeriodo, 1) + ' s en pantalla; la velocidad del motor también va ralentizada, aunque mucho menos que la PWM' +
        (pausado ? ' (en pausa se muestra directamente el régimen permanente).' : '. Baja el DC de golpe con el motor girando para ver el freno: la corriente media se invierte y circula por los diodos.');
    }
    function regimen() { if (pausado || !corriendo) { w = vNorm(); } }

    inDc.addEventListener('input', function () { dc = +inDc.value; regimen(); todo(); });
    inVm.addEventListener('input', function () { vm = +inVm.value; todo(); });
    selF.addEventListener('change', function () { f = +selF.value; todo(); pintarPausa(); });
    chkEn.addEventListener('change', function () { enable = !chkEn.checked; regimen(); todo(); });
    selVel.addEventListener('change', function () { segPeriodo = +selVel.value; pintarPausa(); });
    selFcy.addEventListener('change', function () { fcy = +selFcy.value; ampliacion(); });
    selNmot.addEventListener('change', function () { pintarImax(); });
    inT.addEventListener('input', function () { t = +inT.value / 500; if (t >= 2) t = 1.999; estado(); });
    btnPausa.addEventListener('click', function () {
      pausado = !pausado;
      if (pausado) { w = vNorm(); todo(); }
      pintarPausa();
      arrancar();
    });
    btnPaso.addEventListener('click', function () {
      // salta al centro del siguiente semiperiodo
      var D = dc / 100, cand = [];
      for (var k = 0; k < 3; k++) {
        if (D <= 0 || D >= 1) { cand.push(k + 0.25, k + 0.75); continue; }
        cand.push(k + D / 2, k + D + (1 - D) / 2);
      }
      cand.sort(function (a, b) { return a - b; });
      var sig = null;
      for (var j = 0; j < cand.length; j++) if (cand[j] > t + 1e-6) { sig = cand[j]; break; }
      t = sig == null ? 0 : sig;
      t -= 2 * Math.floor(t / 2);
      estado();
    });
    function pintarImax() {
      $('.phz-imax').textContent = selNmot.value === '2' ? '0,5 A por motor (dos motores)' : '1 A hacia el motor (un solo motor)';
    }

    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (ents) {
        visible = ents[ents.length - 1].isIntersecting;
        if (!document.body.contains(el)) { io.disconnect(); return; }
        arrancar();
      });
      io.observe(el);
    }

    pintarImax();
    pintarPausa();
    todo();
    arrancar();
  };
})();
