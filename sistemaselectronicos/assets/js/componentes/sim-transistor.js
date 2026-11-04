/*
 * Componente "sim-transistor": el transistor NPN como interruptor, interactivo.
 * Es el circuito del ejemplo 3.6 del tema: bombilla de 12 V / 2 W (R = 72 Ω)
 * accionada desde un pin de la Raspberry Pi (3,3 V) a través de R_B con un PN2222A.
 *
 * Modelo (el mismo que se usa en clase):
 *   - V_pin ≤ V_BE (0,7 V)           → CORTE:      I_B = 0, I_C = 0, V_CE = V_cc.
 *   - I_C = β·I_B < I_C,sat           → ZONA LINEAL: V_CE = V_cc − I_C·R_carga.
 *   - β·I_B ≥ I_C,sat                 → SATURACIÓN:  V_CE = V_CE(sat) = 0,2 V
 *                                        e I_C = (V_cc − V_CE(sat))/R_carga (la fija la carga, no β).
 * El usuario mueve V_pin, R_B y β y ve el circuito animado, las magnitudes y el
 * punto de trabajo sobre la recta de carga I_C–V_CE.
 *
 * Uso: <div class="mpi-mount" data-componente="sim-transistor" data-config='{}'></div>
 */
window.MPI = window.MPI || {};
MPI.componentes = MPI.componentes || {};

(function () {
  var VCC = 12, RC = 72, VBE = 0.7, VCESAT = 0.2, VGPIO = 3.3;
  var RB_VALS = [100, 220, 330, 470, 680, 820, 1000, 1500, 2200, 3300, 4700, 10000, 22000, 47000];
  var RB0 = 5, BETA0 = 100;          // valores del ejemplo 3.6: 820 Ω y β = 100
  var ICSAT = (VCC - VCESAT) / RC * 1000;   // mA (≈ 163,9)
  var seq = 0;

  function f(x, d) { return x.toFixed(d).replace('.', ','); }
  function fmA(mA) { return mA < 0.005 ? '0 mA' : f(mA, mA < 10 ? 2 : 1) + ' mA'; }
  function fR(o) { if (o < 1000) return o + ' Ω'; var k = o / 1000; return (k % 1 === 0 ? k : f(k, 1)) + ' kΩ'; }
  function fV(v) { return f(v, v < 10 ? 2 : 1) + ' V'; }
  function fW(w) { return w < 0.005 ? '0 W' : f(w, 2) + ' W'; }

  function W(x1, y1, x2, y2) { return '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '" stroke="var(--txt-2)" stroke-width="1.6"/>'; }
  function dot(x, y) { return '<circle cx="' + x + '" cy="' + y + '" r="3.5" fill="var(--azul-cl)"/>'; }
  function T(x, y, s, o) {
    o = o || {};
    return '<text x="' + x + '" y="' + y + '" font-size="' + (o.size || 10) + '" fill="' + (o.fill || 'var(--txt)') +
      '" text-anchor="' + (o.anchor || 'middle') + '"' + (o.cls ? ' class="' + o.cls + '"' : '') +
      (o.bold ? ' font-weight="700"' : '') + '>' + s + '</text>';
  }
  function gnd(x, y) {
    return W(x, y, x, y + 8) +
      '<line x1="' + (x - 9) + '" y1="' + (y + 8) + '" x2="' + (x + 9) + '" y2="' + (y + 8) + '" stroke="var(--txt-tenue)" stroke-width="1.6"/>' +
      '<line x1="' + (x - 5) + '" y1="' + (y + 12) + '" x2="' + (x + 5) + '" y2="' + (y + 12) + '" stroke="var(--txt-tenue)" stroke-width="1.4"/>' +
      '<line x1="' + (x - 2) + '" y1="' + (y + 15) + '" x2="' + (x + 2) + '" y2="' + (y + 15) + '" stroke="var(--txt-tenue)" stroke-width="1.2"/>';
  }

  // ---- modelo ----
  function modelo(vpin, rb, beta) {
    var m = { vpin: vpin, ib: 0, ic: 0, vbe: Math.min(vpin, VBE), vce: VCC, zona: 'corte', ibmin: ICSAT / beta };
    if (vpin > VBE) {
      m.vbe = VBE;
      m.ib = (vpin - VBE) / rb * 1000;                    // mA
      var iclin = beta * m.ib;
      if (iclin < ICSAT) { m.zona = 'lineal'; m.ic = iclin; m.vce = VCC - m.ic * RC / 1000; }
      else { m.zona = 'sat'; m.ic = ICSAT; m.vce = VCESAT; }
    }
    m.pbomb = m.ic / 1000 * (VCC - m.vce);               // W en la bombilla
    m.ptr = m.vce * m.ic / 1000;                         // W disipados en el transistor
    m.k = m.ibmin > 0 ? m.ib / m.ibmin : 0;
    return m;
  }

  var ZONA = {
    corte: { cls: 'trn-corte', txt: 'CORTE', sw: 'interruptor ABIERTO', col: 'var(--acento-2)' },
    lineal: { cls: 'trn-lineal', txt: 'ZONA LINEAL', sw: 'resistencia variable', col: 'var(--naranja)' },
    sat: { cls: 'trn-sat', txt: 'SATURACIÓN', sw: 'interruptor CERRADO', col: 'var(--acento)' }
  };

  // ---- dibujo ----
  // gráfica I_C–V_CE con la recta de carga
  var GX0 = 46, GX1 = 286, GY0 = 14, GY1 = 150;
  function gx(v) { return GX0 + v / VCC * (GX1 - GX0); }
  function gy(i) { return GY1 - i / 180 * (GY1 - GY0); }

  function svgCircuito() {
    return '<svg viewBox="0 0 350 270" class="trn-svg" aria-label="Circuito: transistor NPN que acciona una bombilla de 12 V">' +
      '<defs><marker id="trn-fl-' + seq + '" markerWidth="9" markerHeight="9" refX="7.5" refY="4.5" orient="auto"><path d="M0 0 L9 4.5 L0 9 Z" fill="var(--txt)"/></marker></defs>' +
      // alimentación
      W(196, 24, 244, 24) + T(196, 16, 'V<tspan baseline-shift="sub" font-size="7">cc</tspan> = 12 V', { anchor: 'start', fill: 'var(--amarillo)' }) +
      W(220, 24, 220, 54) +
      // bombilla (halo + cuerpo)
      '<circle class="trn-halo" cx="220" cy="70" r="30" fill="#ffd75e" opacity="0"/>' +
      '<circle cx="220" cy="70" r="16" fill="var(--bg-3)" stroke="var(--acento)" stroke-width="1.6"/>' +
      '<line x1="208.7" y1="58.7" x2="231.3" y2="81.3" stroke="var(--acento)" stroke-width="1.5"/>' +
      '<line x1="231.3" y1="58.7" x2="208.7" y2="81.3" stroke="var(--acento)" stroke-width="1.5"/>' +
      T(252, 66, 'bombilla', { anchor: 'start', size: 9, fill: 'var(--acento)' }) + T(252, 78, '12 V · 2 W', { anchor: 'start', size: 9, fill: 'var(--txt-tenue)' }) +
      W(220, 86, 220, 168) +
      // transistor
      '<line x1="204" y1="170" x2="204" y2="210" stroke="var(--txt)" stroke-width="2.5"/>' +
      W(220, 168, 204, 181) +
      '<line x1="204" y1="199" x2="219" y2="210" stroke="var(--txt)" stroke-width="1.6" marker-end="url(#trn-fl-' + seq + ')"/>' +
      W(220, 210, 220, 246) + gnd(220, 246) +
      T(226, 178, 'C', { anchor: 'start', size: 9, fill: 'var(--txt-tenue)' }) +
      T(196, 186, 'B', { anchor: 'end', size: 9, fill: 'var(--txt-tenue)' }) +
      T(226, 216, 'E', { anchor: 'start', size: 9, fill: 'var(--txt-tenue)' }) +
      // base: GPIO — R_B — base
      dot(20, 190) + T(20, 174, 'GPIO', { fill: 'var(--azul-cl)' }) + T(20, 208, '', { cls: 'trn-t-pin', fill: 'var(--azul-cl)', bold: 1 }) +
      W(20, 190, 46, 190) +
      '<rect x="46" y="181" width="56" height="18" rx="2.5" fill="var(--bg-3)" stroke="var(--acento)" stroke-width="1.6"/>' +
      T(74, 194, 'R<tspan baseline-shift="sub" font-size="7">B</tspan>', { size: 11, fill: 'var(--acento)' }) +
      T(74, 214, '', { cls: 'trn-t-rb', size: 9, fill: 'var(--txt-2)' }) +
      W(102, 190, 204, 190) +
      // corrientes animadas (conducen cuando hay corriente)
      '<path class="trn-flujo trn-fl-ic" d="M220 24 L220 54" stroke="var(--amarillo)"/>' +
      '<path class="trn-flujo trn-fl-ic" d="M220 86 L220 168" stroke="var(--amarillo)"/>' +
      '<path class="trn-flujo trn-fl-ic" d="M220 210 L220 246" stroke="var(--amarillo)"/>' +
      '<path class="trn-flujo trn-fl-ib" d="M20 190 L46 190" stroke="var(--azul-cl)"/>' +
      '<path class="trn-flujo trn-fl-ib" d="M102 190 L204 190" stroke="var(--azul-cl)"/>' +
      // lecturas
      T(238, 116, '', { cls: 'trn-t-ic', anchor: 'start', fill: 'var(--amarillo)', bold: 1 }) +
      T(238, 130, '', { cls: 'trn-t-vce', anchor: 'start', fill: 'var(--azul-cl)', bold: 1 }) +
      T(142, 183, '', { cls: 'trn-t-ib', fill: 'var(--azul-cl)', bold: 1 }) +
      T(238, 196, '', { cls: 'trn-t-est', anchor: 'start', size: 11, bold: 1 }) +
      T(238, 209, '', { cls: 'trn-t-sw', anchor: 'start', size: 9, fill: 'var(--txt-2)' }) +
      '</svg>';
  }

  function svgGrafica() {
    var s = '<svg viewBox="0 0 300 190" class="trn-graf" aria-label="Punto de trabajo sobre la recta de carga I_C frente a V_CE">';
    // rejilla y ejes
    [0, 4, 8, 12].forEach(function (v) {
      s += '<line x1="' + gx(v) + '" y1="' + GY0 + '" x2="' + gx(v) + '" y2="' + GY1 + '" stroke="var(--borde-2)" stroke-width="1"/>' +
        T(gx(v), GY1 + 13, String(v), { size: 9, fill: 'var(--txt-tenue)' });
    });
    [0, 60, 120, 180].forEach(function (i) {
      s += '<line x1="' + GX0 + '" y1="' + gy(i) + '" x2="' + GX1 + '" y2="' + gy(i) + '" stroke="var(--borde-2)" stroke-width="1"/>' +
        T(GX0 - 5, gy(i) + 3, String(i), { size: 9, fill: 'var(--txt-tenue)', anchor: 'end' });
    });
    s += '<line x1="' + GX0 + '" y1="' + GY1 + '" x2="' + GX1 + '" y2="' + GY1 + '" stroke="var(--txt-2)" stroke-width="1.4"/>' +
      '<line x1="' + GX0 + '" y1="' + GY0 + '" x2="' + GX0 + '" y2="' + GY1 + '" stroke="var(--txt-2)" stroke-width="1.4"/>' +
      T((GX0 + GX1) / 2, 185, 'V<tspan baseline-shift="sub" font-size="7">CE</tspan> (V)', { size: 10, fill: 'var(--txt-2)' }) +
      '<text x="11" y="' + ((GY0 + GY1) / 2) + '" font-size="10" fill="var(--txt-2)" text-anchor="middle" transform="rotate(-90 11 ' + ((GY0 + GY1) / 2) + ')">I<tspan baseline-shift="sub" font-size="7">C</tspan> (mA)</text>';
    // recta de carga: de (V_CE = 0, I_C = V_cc/R) a (V_CE = V_cc, I_C = 0)
    s += '<line x1="' + gx(0) + '" y1="' + gy(VCC / RC * 1000) + '" x2="' + gx(VCC) + '" y2="' + gy(0) + '" stroke="var(--acento-2)" stroke-width="2"/>' +
      T(gx(0) + 14, gy(VCC / RC * 1000) - 4, 'SATURACIÓN', { anchor: 'start', size: 9, fill: 'var(--acento)', bold: 1 }) +
      T(gx(VCC) - 2, gy(0) - 6, 'CORTE', { anchor: 'end', size: 9, fill: 'var(--acento-2)', bold: 1 }) +
      T(gx(6) + 38, gy(80) - 12, 'zona lineal', { anchor: 'start', size: 9, fill: 'var(--naranja)' }) +
      T(gx(6) + 38, gy(80) + 0, 'recta de carga', { anchor: 'start', size: 8, fill: 'var(--txt-tenue)' }) +
      // guías del punto de trabajo + punto
      '<line class="trn-g-v" x1="0" y1="0" x2="0" y2="0" stroke="var(--txt-tenue)" stroke-dasharray="3 3"/>' +
      '<line class="trn-g-i" x1="0" y1="0" x2="0" y2="0" stroke="var(--txt-tenue)" stroke-dasharray="3 3"/>' +
      '<circle class="trn-pto" r="6.5" cx="0" cy="0" fill="var(--acento)" stroke="var(--bg)" stroke-width="2"/>' +
      '</svg>';
    return s;
  }

  MPI.componentes['sim-transistor'] = function (el) {
    seq++;
    var id = 'trn' + seq;
    el.classList.add('mpi-sim-trn');
    el.innerHTML =
      '<div class="mpi-sim-cab">Pruébalo: ¿cuándo corta y cuándo satura el transistor?</div>' +
      '<div class="trn-cuerpo">' +
        '<div class="trn-col trn-col-circ">' + svgCircuito() + '</div>' +
        '<div class="trn-col trn-col-ctrl">' +
          '<div class="trn-badge"></div>' +
          '<div class="trn-btns">' +
            '<button type="button" class="trn-btn" data-v="0">GPIO = 0<small>0 V</small></button>' +
            '<button type="button" class="trn-btn" data-v="3.3">GPIO = 1<small>3,3 V</small></button>' +
          '</div>' +
          '<label class="trn-fila" for="' + id + '-v"><span>V<sub>pin</sub></span><input type="range" id="' + id + '-v" min="0" max="3.3" step="0.05" value="3.3"><output></output></label>' +
          '<label class="trn-fila" for="' + id + '-r"><span>R<sub>B</sub></span><input type="range" id="' + id + '-r" min="0" max="' + (RB_VALS.length - 1) + '" step="1" value="' + RB0 + '"><output></output></label>' +
          '<label class="trn-fila" for="' + id + '-b"><span>β (h<sub>FE</sub>)</span><input type="range" id="' + id + '-b" min="20" max="300" step="10" value="' + BETA0 + '"><output></output></label>' +
          '<button type="button" class="trn-reset">Volver al ejemplo 3.6 (R<sub>B</sub> = 820 Ω, β = 100, pin a 3,3 V)</button>' +
        '</div>' +
      '</div>' +
      '<div class="trn-cuerpo">' +
        '<div class="trn-col trn-col-graf">' + svgGrafica() + '</div>' +
        '<div class="trn-col"><div class="trn-datos"></div></div>' +
      '</div>' +
      '<div class="trn-msg nota"></div>';

    var sV = el.querySelector('#' + id + '-v'), sR = el.querySelector('#' + id + '-r'), sB = el.querySelector('#' + id + '-b');
    var btns = el.querySelectorAll('.trn-btn');

    function q(s) { return el.querySelector(s); }
    function setT(sel, txt, fill) { var n = q(sel); n.textContent = txt; if (fill) n.setAttribute('fill', fill); }
    function flujo(sel, activo, mA, ref) {
      el.querySelectorAll(sel).forEach(function (p) {
        p.style.display = activo ? '' : 'none';
        p.style.animationDuration = (0.3 + 1.1 * (1 - Math.min(1, mA / ref))).toFixed(2) + 's';
      });
    }

    function pintar() {
      var vpin = parseFloat(sV.value), rb = RB_VALS[+sR.value], beta = +sB.value;
      var m = modelo(vpin, rb, beta), z = ZONA[m.zona];

      el.querySelectorAll('.trn-fila output')[0].textContent = fV(vpin);
      el.querySelectorAll('.trn-fila output')[1].textContent = fR(rb);
      el.querySelectorAll('.trn-fila output')[2].textContent = String(beta);
      btns.forEach(function (b) { b.classList.toggle('trn-on', Math.abs(parseFloat(b.dataset.v) - vpin) < 0.001); });

      // circuito
      var br = Math.sqrt(Math.min(1, m.pbomb / 2));
      q('.trn-halo').setAttribute('opacity', (br * 0.75).toFixed(2));
      setT('.trn-t-pin', fV(vpin));
      setT('.trn-t-rb', fR(rb));
      setT('.trn-t-ib', 'I_B = ' + fmA(m.ib));
      setT('.trn-t-ic', 'I_C = ' + fmA(m.ic));
      setT('.trn-t-vce', 'V_CE = ' + fV(m.vce));
      setT('.trn-t-est', z.txt, z.col);
      setT('.trn-t-sw', z.sw);
      flujo('.trn-fl-ic', m.ic > 0.05, m.ic, ICSAT);
      flujo('.trn-fl-ib', m.ib > 0.005, m.ib, 3.5);

      // gráfica
      var X = gx(m.vce), Y = gy(m.ic), p = q('.trn-pto');
      p.setAttribute('cx', X); p.setAttribute('cy', Y); p.setAttribute('fill', z.col);
      var gv = q('.trn-g-v'), gi = q('.trn-g-i');
      gv.setAttribute('x1', X); gv.setAttribute('x2', X); gv.setAttribute('y1', Y); gv.setAttribute('y2', GY1);
      gi.setAttribute('x1', GX0); gi.setAttribute('x2', X); gi.setAttribute('y1', Y); gi.setAttribute('y2', Y);
      gv.setAttribute('stroke', z.col); gi.setAttribute('stroke', z.col);

      // estado
      var bd = q('.trn-badge');
      bd.className = 'trn-badge ' + z.cls;
      bd.innerHTML = '<strong>' + z.txt + '</strong> · ' + z.sw;

      // datos
      var ok = m.zona === 'sat';
      q('.trn-datos').innerHTML =
        dato('I<sub>B</sub>', fmA(m.ib)) +
        dato('I<sub>B,mín</sub> = I<sub>C,sat</sub>/β', fmA(m.ibmin)) +
        dato('k = I<sub>B</sub>/I<sub>B,mín</sub>', m.ib > 0 ? f(m.k, 1) : '—', ok ? 'trn-ok' : '') +
        dato('I<sub>C</sub>', fmA(m.ic)) +
        dato('V<sub>BE</sub>', fV(m.vbe)) +
        dato('V<sub>CE</sub>', fV(m.vce)) +
        dato('P bombilla', fW(m.pbomb) + ' <small>(de 2 W)</small>') +
        dato('P transistor = V<sub>CE</sub>·I<sub>C</sub>', fW(m.ptr), m.ptr > 0.3 ? 'trn-aviso' : '');

      // explicación
      var msg;
      if (m.zona === 'corte') {
        msg = '<strong>Corte.</strong> V<sub>pin</sub> = ' + fV(vpin) + ' no supera los 0,7 V de V<sub>BE</sub>: no entra corriente por la base (I<sub>B</sub> = 0) y, por tanto, <strong>I<sub>C</sub> = 0</strong>. El transistor es un <strong>interruptor abierto</strong>: toda la tensión cae en él (V<sub>CE</sub> = V<sub>cc</sub> = 12 V) y la bombilla no luce.';
      } else if (m.zona === 'lineal') {
        msg = '<strong>Zona lineal.</strong> I<sub>C</sub> = β·I<sub>B</sub> = ' + beta + ' · ' + fmA(m.ib) + ' = <strong>' + fmA(m.ic) + '</strong>, menos de los ' + fmA(ICSAT) + ' que pide la bombilla: el transistor <em>no</em> está saturado, se queda con V<sub>CE</sub> = ' + fV(m.vce) + ' y <strong>disipa ' + fW(m.ptr) + '</strong>' + (m.ptr > 0.3 ? ' (¡se calienta!)' : '') + '. La bombilla luce a medias. Como interruptor no nos vale: hay que subir I<sub>B</sub> (más V<sub>pin</sub> o menos R<sub>B</sub>) hasta superar I<sub>B,mín</sub> = ' + fmA(m.ibmin) + '.';
      } else {
        msg = '<strong>Saturación.</strong> I<sub>B</sub> = ' + fmA(m.ib) + ' supera I<sub>B,mín</sub> = I<sub>C</sub>/β = ' + fmA(m.ibmin) + ' (k = ' + f(m.k, 1) + '). Ahora I<sub>C</sub> ya <strong>no es β·I<sub>B</sub></strong>: la fija la carga, I<sub>C</sub> = (V<sub>cc</sub> − V<sub>CE(sat)</sub>)/R = ' + fmA(m.ic) + '. El transistor es un <strong>interruptor cerrado</strong> (V<sub>CE</sub> ≈ 0,2 V), casi no disipa (' + fW(m.ptr) + ') y la bombilla luce al máximo.';
      }
      msg += ' <small class="trn-nota">Modelo ideal: V<sub>BE</sub> = 0,7 V si conduce, V<sub>CE(sat)</sub> = 0,2 V.</small>';
      q('.trn-msg').innerHTML = msg;
    }

    function dato(etq, val, cls) {
      return '<div class="trn-dato' + (cls ? ' ' + cls : '') + '"><span>' + etq + '</span><b>' + val + '</b></div>';
    }

    btns.forEach(function (b) {
      b.addEventListener('click', function () { sV.value = b.dataset.v; pintar(); });
    });
    [sV, sR, sB].forEach(function (s) { s.addEventListener('input', pintar); });
    q('.trn-reset').addEventListener('click', function () { sV.value = 3.3; sR.value = RB0; sB.value = BETA0; pintar(); });
    pintar();
  };
})();
