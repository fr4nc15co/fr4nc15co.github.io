/*
 * Componente "sim-rele": el relé electromecánico accionado desde un pin, interactivo.
 * Es el circuito del ejemplo 3.8 del tema: relé Kemet EC2-3 (bobina 3,3 V / 64,3 Ω,
 * contactos 0,6 A · 250 V) gobernado por un PN2222A (β = 100) a través de R_B,
 * y conmutando una carga de 220 V (3 bombillas de 4,5 W).
 *
 * La cadena de etapas: pin → I_B → transistor → I_bobina → relé → contactos → carga 220 V.
 *   - El transistor se modela como en 3.5 (corte / lineal / saturación; V_BE = 0,7 V, V_CE(sat) = 0,2 V).
 *   - El relé conmuta si la bobina recibe ≥ 75 % de su tensión nominal (valor típico).
 *   - Sin diodo en antiparalelo, al cortar la corriente la bobina genera v = L·di/dt:
 *     un pico muy por encima de los 40 V (V_CEO) del PN2222A y el transistor se destruye.
 *
 * Uso: <div class="mpi-mount" data-componente="sim-rele" data-config='{}'></div>
 */
window.MPI = window.MPI || {};
MPI.componentes = MPI.componentes || {};

(function () {
  var VCC = 3.3, RBOB = 64.3, BETA = 100, VBE = 0.7, VCESAT = 0.2, VGPIO = 3.3;
  var VACT = 0.75 * VCC;                       // tensión mínima de bobina para que el relé cierre
  var VRED = 220, IMAX = 0.6;                  // red y corriente máxima de los contactos (A)
  var ICSAT = (VCC - VCESAT) / RBOB * 1000;    // mA (≈ 48,2)
  var RB_VALS = [100, 220, 330, 470, 680, 820, 1000, 1500, 2200, 3300, 4700, 10000, 22000, 47000];
  var RB0 = 8;                                 // 2,2 kΩ (el del ejemplo 3.8)
  var CARGAS = [
    { nombre: '3 bombillas de 4,5 W (ejemplo 3.8)', etq: '3 × 4,5 W', n: 3, P: 13.5, tipo: 'bombilla' },
    { nombre: '1 bombilla de 4,5 W', etq: '1 × 4,5 W', n: 1, P: 4.5, tipo: 'bombilla' },
    { nombre: 'Estufa de 1000 W (¡demasiado para este relé!)', etq: 'estufa 1000 W', n: 1, P: 1000, tipo: 'estufa' }
  ];
  var seq = 0;

  function f(x, d) { return x.toFixed(d).replace('.', ','); }
  function fmA(mA) { return mA < 0.005 ? '0 mA' : f(mA, mA < 10 ? 2 : 1) + ' mA'; }
  function fR(o) { if (o < 1000) return o + ' Ω'; var k = o / 1000; return (k % 1 === 0 ? k : f(k, 1)) + ' kΩ'; }
  function fV(v) { return f(v, v < 10 ? 2 : 1) + ' V'; }
  function fI(A) { return A < 1 ? fmA(A * 1000) : f(A, 2) + ' A'; }

  function W(x1, y1, x2, y2) { return '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '" stroke="var(--txt-2)" stroke-width="1.6"/>'; }
  function dot(x, y, c) { return '<circle cx="' + x + '" cy="' + y + '" r="3.5" fill="' + (c || 'var(--azul-cl)') + '"/>'; }
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

  // ---- modelo de la cadena completa ----
  function modelo(s) {
    var m = { vpin: s.gpio ? VGPIO : 0, rb: RB_VALS[s.rb], ib: 0, ic: 0, vce: VCC, zona: 'corte' };
    if (m.vpin > VBE) {
      m.ib = (m.vpin - VBE) / m.rb * 1000;
      var iclin = BETA * m.ib;
      if (iclin < ICSAT) { m.zona = 'lineal'; m.ic = iclin; m.vce = VCC - m.ic * RBOB / 1000; }
      else { m.zona = 'sat'; m.ic = ICSAT; m.vce = VCESAT; }
    }
    if (s.quemado) { m.zona = 'quemado'; m.ic = 0; m.vce = VCC; }
    m.vbob = m.ic * RBOB / 1000;
    m.activado = m.vbob >= VACT;
    m.cerrado = s.contacto === 'NO' ? m.activado : !m.activado;
    var c = CARGAS[s.carga];
    m.carga = c;
    m.icarga = m.cerrado ? c.P / VRED : 0;                   // A
    m.pcarga = m.cerrado ? c.P : 0;
    m.sobrecarga = m.icarga > IMAX;
    return m;
  }

  var ZONA = {
    corte: { txt: 'CORTE', sw: 'interruptor abierto', col: 'var(--acento-2)' },
    lineal: { txt: 'ZONA LINEAL', sw: 'resistencia variable', col: 'var(--naranja)' },
    sat: { txt: 'SATURADO', sw: 'interruptor cerrado', col: 'var(--acento)' },
    quemado: { txt: 'DESTRUIDO', sw: 'sin transistor', col: 'var(--rojo)' }
  };

  // ---- dibujo ----
  var PIVOTE = { x: 300, y: 200 }, LARGO = 70;
  function punta(cerrado) {
    if (cerrado) return { x: PIVOTE.x, y: PIVOTE.y - LARGO };
    var a = 25 * Math.PI / 180;
    return { x: PIVOTE.x + LARGO * Math.sin(a), y: PIVOTE.y - LARGO * Math.cos(a) };
  }

  function svgCircuito(id) {
    return '<svg viewBox="0 0 580 290" class="rle-svg" aria-label="Pin, transistor, relé y carga de 220 V">' +
      '<defs><marker id="' + id + '-fl" markerWidth="9" markerHeight="9" refX="7.5" refY="4.5" orient="auto"><path d="M0 0 L9 4.5 L0 9 Z" fill="var(--txt)"/></marker></defs>' +
      // dominios y aislamiento galvánico
      T(10, 12, 'CONTROL · 3,3 V', { anchor: 'start', fill: 'var(--azul-cl)', bold: 1 }) +
      T(312, 12, 'POTENCIA · 220 V', { anchor: 'start', fill: 'var(--rojo)', bold: 1 }) +
      '<line x1="300" y1="20" x2="300" y2="272" stroke="var(--borde)" stroke-width="1.6" stroke-dasharray="6 4"/>' +
      T(300, 284, 'aislamiento galvánico', { size: 9, fill: 'var(--txt-tenue)' }) +

      // ===== lado de control =====
      W(140, 34, 190, 34) + T(140, 27, 'V<tspan baseline-shift="sub" font-size="7">cc</tspan> = 3,3 V', { anchor: 'start', fill: 'var(--amarillo)' }) +
      W(190, 34, 190, 60) +
      '<rect x="183" y="60" width="14" height="40" rx="2.5" fill="var(--bg-3)" stroke="var(--acento)" stroke-width="1.6"/>' +
      T(204, 56, 'bobina 64,3 Ω', { anchor: 'start', size: 9, fill: 'var(--acento)' }) +
      W(190, 100, 190, 138) +
      // diodo en antiparalelo (cátodo arriba, a Vcc)
      '<g class="rle-diodo">' +
        W(140, 34, 140, 66) +
        '<line x1="131" y1="66" x2="149" y2="66" stroke="var(--naranja)" stroke-width="2"/>' +
        '<polygon points="131,96 149,96 140,70" fill="var(--bg-3)" stroke="var(--naranja)" stroke-width="1.5"/>' +
        W(140, 96, 140, 118) + W(140, 118, 190, 118) + dot(190, 118, 'var(--naranja)') +
        T(124, 86, 'D', { anchor: 'end', fill: 'var(--naranja)', bold: 1 }) +
      '</g>' +
      '<g class="rle-sin-diodo">' +
        '<rect x="106" y="56" width="68" height="50" rx="5" fill="none" stroke="var(--rojo)" stroke-width="1.2" stroke-dasharray="4 3"/>' +
        T(140, 84, 'sin', { fill: 'var(--rojo)', size: 10, bold: 1 }) + T(140, 96, 'diodo', { fill: 'var(--rojo)', size: 10, bold: 1 }) +
      '</g>' +
      // transistor
      '<line x1="174" y1="140" x2="174" y2="172" stroke="var(--txt)" stroke-width="2.5"/>' +
      W(190, 138, 174, 149) +
      '<line x1="174" y1="163" x2="189" y2="174" stroke="var(--txt)" stroke-width="1.6" marker-end="url(#' + id + '-fl)"/>' +
      W(190, 174, 190, 210) + gnd(190, 210) +
      T(204, 196, 'PN2222A', { anchor: 'start', size: 9, fill: 'var(--txt-tenue)' }) +
      // base
      dot(24, 156) + T(24, 146, 'GPIO', { fill: 'var(--azul-cl)' }) + T(24, 172, '', { cls: 'rle-t-pin', fill: 'var(--azul-cl)', bold: 1 }) +
      W(24, 156, 46, 156) +
      '<rect x="46" y="147" width="50" height="18" rx="2.5" fill="var(--bg-3)" stroke="var(--acento)" stroke-width="1.6"/>' +
      T(71, 160, 'R<tspan baseline-shift="sub" font-size="7">B</tspan>', { size: 11, fill: 'var(--acento)' }) +
      T(71, 180, '', { cls: 'rle-t-rb', size: 9, fill: 'var(--txt-2)' }) +
      W(96, 156, 174, 156) +
      // corrientes animadas del lado de control
      '<path class="rle-flujo rle-fl-ib" d="M24 156 L46 156" stroke="var(--azul-cl)"/>' +
      '<path class="rle-flujo rle-fl-ib" d="M96 156 L174 156" stroke="var(--azul-cl)"/>' +
      '<path class="rle-flujo rle-fl-bob" d="M190 34 L190 60" stroke="var(--amarillo)"/>' +
      '<path class="rle-flujo rle-fl-bob" d="M190 100 L190 138" stroke="var(--amarillo)"/>' +
      '<path class="rle-flujo rle-fl-bob" d="M190 174 L190 210" stroke="var(--amarillo)"/>' +
      '<path class="rle-flujo rle-fl-dio" d="M190 100 L190 118 L140 118 L140 96 L140 66 L140 34 L190 34 L190 60" stroke="var(--naranja)"/>' +
      // lecturas
      T(135, 150, '', { cls: 'rle-t-ib', fill: 'var(--azul-cl)', bold: 1, size: 9 }) +
      T(204, 112, '', { cls: 'rle-t-vb', anchor: 'start', fill: 'var(--amarillo)', bold: 1, size: 9.5 }) +
      T(204, 126, '', { cls: 'rle-t-ic', anchor: 'start', fill: 'var(--amarillo)', bold: 1, size: 9.5 }) +
      T(204, 184, '', { cls: 'rle-t-est', anchor: 'start', size: 10, bold: 1 }) +
      // transistor destruido
      '<g class="rle-x"><line x1="164" y1="138" x2="200" y2="178" stroke="var(--rojo)" stroke-width="3.5"/><line x1="200" y1="138" x2="164" y2="178" stroke="var(--rojo)" stroke-width="3.5"/></g>' +

      // ===== acople magnético =====
      '<polyline class="rle-acople" points="197,80 312,80 346,152" fill="none" stroke="var(--amarillo)" stroke-width="1.6" stroke-dasharray="5 4" marker-end="url(#' + id + '-fl)"/>' +
      T(204, 94, 'campo magnético', { anchor: 'start', size: 8, fill: 'var(--txt-tenue)' }) +

      // ===== lado de potencia (desplazado 50 px a la derecha) =====
      '<g transform="translate(50,0)">' +
      '<circle cx="470" cy="150" r="16" fill="var(--bg-3)" stroke="var(--rojo)" stroke-width="1.6"/>' +
      T(470, 156, '~', { size: 18, fill: 'var(--rojo)' }) + T(490, 154, '220 V', { anchor: 'start', fill: 'var(--rojo)', bold: 1 }) +
      W(470, 134, 470, 60) + W(470, 60, 430, 60) +
      '<rect x="330" y="36" width="100" height="48" rx="5" fill="var(--bg-3)" stroke="var(--borde)" stroke-width="1.5"/>' +
      '<g class="rle-carga-icos"></g>' +
      T(380, 98, '', { cls: 'rle-t-cetq', size: 9, fill: 'var(--txt-2)' }) +
      W(330, 60, 300, 60) + W(300, 60, 300, 130) +
      // contactos
      dot(300, 130, 'var(--txt-2)') + dot(PIVOTE.x, PIVOTE.y, 'var(--txt-2)') +
      '<line class="rle-palanca" x1="' + PIVOTE.x + '" y1="' + PIVOTE.y + '" x2="' + PIVOTE.x + '" y2="130" stroke-width="3" stroke-linecap="round"/>' +
      T(318, 124, '', { cls: 'rle-t-cont', anchor: 'start', size: 9, fill: 'var(--txt-2)' }) +
      W(300, 200, 300, 250) + W(300, 250, 470, 250) + W(470, 250, 470, 166) +
      '<path class="rle-flujo rle-ac rle-fl-ac" d="M470 134 L470 60 L430 60" stroke="var(--rojo)"/>' +
      '<path class="rle-flujo rle-ac rle-fl-ac" d="M330 60 L300 60 L300 250 L470 250 L470 166" stroke="var(--rojo)"/>' +
      T(380, 112, '', { cls: 'rle-t-ica', fill: 'var(--rojo)', bold: 1, size: 10 }) +
      '</g></svg>';
  }

  function iconosCarga(c, on) {
    var s = '', i, cx;
    if (c.tipo === 'estufa') {
      s += '<polyline points="340,60 352,44 364,76 376,44 388,76 400,44 412,76 420,60" fill="none" stroke="' + (on ? 'var(--rojo)' : 'var(--naranja)') + '" stroke-width="2.4" stroke-linejoin="round"' + '/>';
      return s;
    }
    var xs = c.n === 1 ? [380] : [355, 380, 405];
    for (i = 0; i < xs.length; i++) {
      cx = xs[i];
      s += '<circle cx="' + cx + '" cy="60" r="15" fill="#ffd75e" opacity="' + (on ? 0.6 : 0) + '"/>' +
        '<circle cx="' + cx + '" cy="60" r="10" fill="var(--bg-3)" stroke="var(--acento)" stroke-width="1.5"/>' +
        '<line x1="' + (cx - 7) + '" y1="53" x2="' + (cx + 7) + '" y2="67" stroke="var(--acento)" stroke-width="1.3"/>' +
        '<line x1="' + (cx + 7) + '" y1="53" x2="' + (cx - 7) + '" y2="67" stroke="var(--acento)" stroke-width="1.3"/>';
    }
    return s;
  }

  MPI.componentes['sim-rele'] = function (el) {
    seq++;
    var id = 'rle' + seq;
    el.classList.add('mpi-sim-rle');
    var st = { gpio: 1, rb: RB0, diodo: true, contacto: 'NO', carga: 0, quemado: false };
    var transitorio = null;           // temporizador del reciclado de corriente por el diodo

    var opcionesCarga = CARGAS.map(function (c, i) { return '<option value="' + i + '">' + c.nombre + '</option>'; }).join('');
    el.innerHTML =
      '<div class="mpi-sim-cab">Pruébalo: del pin de 3,3 V a los 220 V</div>' +
      '<div class="rle-svgbox">' + svgCircuito(id) + '</div>' +
      '<div class="rle-cadena"></div>' +
      '<div class="rle-ctrl">' +
        '<div class="rle-fila"><span class="rle-lbl">Pin GPIO</span>' +
          '<button type="button" class="rle-btn" data-g="0">0<small>0 V</small></button>' +
          '<button type="button" class="rle-btn" data-g="1">1<small>3,3 V</small></button></div>' +
        '<label class="rle-fila" for="' + id + '-r"><span class="rle-lbl">R<sub>B</sub></span><input type="range" id="' + id + '-r" min="0" max="' + (RB_VALS.length - 1) + '" step="1" value="' + RB0 + '"><output></output></label>' +
        '<label class="rle-fila"><input type="checkbox" class="rle-chk" checked> <span>Diodo de protección en antiparalelo con la bobina</span></label>' +
        '<div class="rle-fila"><span class="rle-lbl">Contacto</span>' +
          '<label><input type="radio" name="' + id + '-c" value="NO" checked> Normalmente abierto (NO)</label>' +
          '<label><input type="radio" name="' + id + '-c" value="NC"> Normalmente cerrado (NC)</label></div>' +
        '<label class="rle-fila" for="' + id + '-l"><span class="rle-lbl">Carga</span><select id="' + id + '-l">' + opcionesCarga + '</select></label>' +
        '<button type="button" class="rle-reparar">Cambiar el transistor</button>' +
      '</div>' +
      '<div class="rle-msg nota"></div>';

    function q(s) { return el.querySelector(s); }
    function qa(s) { return el.querySelectorAll(s); }
    function setT(sel, txt, fill) { var n = q(sel); n.textContent = txt; if (fill) n.setAttribute('fill', fill); }
    function flujo(sel, activo, v, ref) {
      qa(sel).forEach(function (p) {
        p.style.display = activo ? '' : 'none';
        p.style.animationDuration = (0.3 + 1.1 * (1 - Math.min(1, v / ref))).toFixed(2) + 's';
      });
    }

    function pintar() {
      var m = modelo(st), z = ZONA[m.zona];
      var reciclando = transitorio !== null;

      qa('.rle-btn').forEach(function (b) { b.classList.toggle('rle-on', (+b.dataset.g) === st.gpio); });
      q('.rle-ctrl output').textContent = fR(m.rb);
      q('.rle-reparar').style.display = st.quemado ? 'inline-block' : 'none';

      // diodo
      q('.rle-diodo').style.opacity = st.diodo ? 1 : 0.1;
      q('.rle-sin-diodo').style.display = st.diodo ? 'none' : '';
      q('.rle-x').style.display = st.quemado ? '' : 'none';

      // textos del circuito
      setT('.rle-t-pin', fV(m.vpin));
      setT('.rle-t-rb', fR(m.rb));
      setT('.rle-t-ib', m.ib > 0.005 ? 'I_B = ' + fmA(m.ib) : '');
      setT('.rle-t-est', z.txt, z.col);
      if (st.quemado) {
        setT('.rle-t-vb', '');
        setT('.rle-t-ic', '⚠ V_CE ≫ 40 V', 'var(--rojo)');
      } else if (reciclando) {
        setT('.rle-t-vb', 'V_CE ≈ ' + f(VCC + 0.7, 1) + ' V', 'var(--naranja)');
        setT('.rle-t-ic', 'I recirc. por D', 'var(--naranja)');
      } else {
        setT('.rle-t-vb', 'V_bob = ' + fV(m.vbob), 'var(--amarillo)');
        setT('.rle-t-ic', 'I_bob = ' + fmA(m.ic), 'var(--amarillo)');
      }
      flujo('.rle-fl-ib', m.ib > 0.005 && !st.quemado, m.ib, 1.5);
      flujo('.rle-fl-bob', m.ic > 0.05, m.ic, ICSAT);
      flujo('.rle-fl-dio', reciclando && st.diodo, 1, 1);

      // acople + contactos
      q('.rle-acople').style.opacity = m.activado ? 1 : 0.18;
      var p = punta(m.cerrado), pal = q('.rle-palanca');
      pal.setAttribute('x2', p.x.toFixed(1)); pal.setAttribute('y2', p.y.toFixed(1));
      pal.setAttribute('stroke', m.cerrado ? (m.sobrecarga ? 'var(--naranja)' : 'var(--rojo)') : 'var(--txt-2)');
      setT('.rle-t-cont', 'contacto ' + st.contacto + (m.cerrado ? ' · cerrado' : ' · abierto'), m.cerrado ? 'var(--rojo)' : 'var(--txt-2)');
      flujo('.rle-fl-ac', m.cerrado, 1, 1);

      // carga
      q('.rle-carga-icos').innerHTML = iconosCarga(m.carga, m.cerrado);
      setT('.rle-t-cetq', m.carga.etq + ' · 220 V');
      setT('.rle-t-ica', m.cerrado ? 'I = ' + fI(m.icarga) : 'I = 0', m.sobrecarga ? 'var(--naranja)' : 'var(--rojo)');

      // cadena de etapas
      var ok = '<span class="rle-ok">✔</span>', ko = '<span class="rle-ko">✖</span>';
      var estadoRele = st.quemado ? 'sin corriente' : (m.activado ? 'ACTIVADO' : 'en reposo');
      q('.rle-cadena').innerHTML =
        etapa('① Pin → base', [
          'V<sub>pin</sub> = ' + fV(m.vpin),
          'I<sub>B</sub> = ' + fmA(m.ib),
          'R<sub>B</sub> = ' + fR(m.rb)
        ], '') + flecha() +
        etapa('② Transistor', [
          '<b style="color:' + z.col + '">' + z.txt + '</b>',
          'V<sub>CE</sub> = ' + fV(m.vce),
          'I<sub>C</sub> = ' + fmA(m.ic)
        ], m.zona === 'sat' ? 'rle-et-on' : '') + flecha() +
        etapa('③ Bobina del relé', [
          'I<sub>bob</sub> = ' + fmA(m.ic) + ' <small>(máx. ' + fmA(ICSAT) + ')</small>',
          'V<sub>bob</sub> = ' + fV(m.vbob) + ' ' + (m.activado ? ok : ko),
          'cierra con ≥ 2,5 V → <b>' + estadoRele + '</b>'
        ], m.activado ? 'rle-et-on' : '') + flecha() +
        etapa('④ Contactos → carga', [
          'contacto ' + st.contacto + ': <b>' + (m.cerrado ? 'cerrado' : 'abierto') + '</b>',
          'I = ' + (m.cerrado ? fI(m.icarga) : '0') + ' <small>(máx. ' + fI(IMAX) + ')</small> ' + (m.cerrado ? (m.sobrecarga ? ko : ok) : ''),
          'P = ' + (m.cerrado ? f(m.pcarga, m.pcarga < 100 ? 1 : 0) : '0') + ' W a 220 V'
        ], m.cerrado ? (m.sobrecarga ? 'rle-et-mal' : 'rle-et-on') : '');

      // explicación
      var msg;
      if (st.quemado) {
        msg = '<strong>✖ Transistor destruido.</strong> Con el pin a 1 la bobina tenía corriente (' + fmA(ICSAT) + '). Al ponerlo a 0 el transistor corta de golpe y la bobina, que no admite saltos bruscos de corriente, genera <em>v</em> = <em>L</em>·d<em>i</em>/d<em>t</em>: un pico de <strong>decenas o cientos de voltios</strong> en el colector, muy por encima de los 40 V (V<sub>CEO</sub>) que aguanta el PN2222A. Pulsa «Cambiar el transistor», marca el diodo y repite: verás que ahora no pasa nada.';
      } else if (reciclando) {
        msg = '<strong>Pin a 0: la bobina se descarga por el diodo.</strong> El transistor ha cortado, pero la bobina sigue empujando su corriente (' + fmA(ICSAT) + '): el diodo en antiparalelo le ofrece un camino y la tensión en el colector se queda en V<sub>cc</sub> + 0,7 V ≈ 4 V. Sin diodo, este pico destruiría el transistor.';
      } else if (m.vpin === 0) {
        msg = '<strong>Pin a 0.</strong> I<sub>B</sub> = 0 → transistor en corte → la bobina no recibe corriente → relé en reposo → ' + (m.cerrado ? 'como el contacto es NC, <strong>está cerrado y la carga recibe los 220 V</strong>' : 'contacto NO <strong>abierto</strong>: la carga no tiene tensión (0 A)') + '. El circuito de 220 V no comparte ningún cable con el del pin: ese es el aislamiento galvánico.';
      } else if (m.zona === 'sat' && m.activado) {
        msg = '<strong>Pin a 1 → relé activado.</strong> I<sub>B</sub> = (3,3 − 0,7)/' + fR(m.rb) + ' = ' + fmA(m.ib) + ' satura al transistor, que deja pasar I<sub>C</sub> = ' + fmA(m.ic) + ' por la bobina (≈ 3,1 V ≥ ' + '2,5 V' + '). El relé conmuta' + (st.contacto === 'NO' ? ' y <strong>cierra el contacto</strong>' : ' y <strong>abre el contacto NC</strong>') + ': ' +
          (m.cerrado ? 'la carga recibe 220 V y consume <strong>' + fI(m.icarga) + '</strong> (P/V = ' + f(m.carga.P, m.carga.P < 100 ? 1 : 0) + '/220)' + (m.sobrecarga ? '. <strong>⚠ Supera los ' + fI(IMAX) + ' que aguantan los contactos</strong>: se sobrecalentarían o se soldarían. Hace falta otro relé (o un contactor) para esta carga.' : ', por debajo de los ' + fI(IMAX) + ' del relé ' + '✔' + '.') : 'la carga se queda sin tensión.');
      } else {
        msg = '<strong>El relé no conmuta.</strong> Con R<sub>B</sub> = ' + fR(m.rb) + ' entran I<sub>B</sub> = ' + fmA(m.ib) + ' y el transistor ' + (m.zona === 'lineal' ? 'trabaja en <strong>zona lineal</strong> (I<sub>C</sub> = β·I<sub>B</sub> = ' + fmA(m.ic) + ')' : 'no conduce') + ': la bobina solo recibe ' + fV(m.vbob) + ', menos de los ' + '2,5 V' + ' necesarios. Baja R<sub>B</sub> hasta saturar el transistor (I<sub>B</sub> ≥ I<sub>C</sub>/β = ' + fmA(ICSAT / BETA) + ').';
      }
      q('.rle-msg').innerHTML = msg;
    }

    function etapa(tit, lineas, cls) {
      return '<div class="rle-etapa ' + cls + '"><div class="rle-et-tit">' + tit + '</div>' +
        lineas.map(function (l) { return '<div>' + l + '</div>'; }).join('') + '</div>';
    }
    function flecha() { return '<div class="rle-flecha" aria-hidden="true">→</div>'; }

    function cambiaGpio(v) {
      if (v === st.gpio) return;
      var m0 = modelo(st);
      var teniaCorriente = m0.ic > 0.05 && !st.quemado;
      st.gpio = v;
      if (transitorio) { clearTimeout(transitorio); transitorio = null; }
      if (v === 0 && teniaCorriente) {
        if (st.diodo) {
          transitorio = setTimeout(function () { transitorio = null; pintar(); }, 1600);
        } else {
          st.quemado = true;
        }
      }
      pintar();
    }

    qa('.rle-btn').forEach(function (b) { b.addEventListener('click', function () { cambiaGpio(+b.dataset.g); }); });
    q('#' + id + '-r').addEventListener('input', function () { st.rb = +this.value; pintar(); });
    q('.rle-chk').addEventListener('change', function () { st.diodo = this.checked; if (!st.diodo && transitorio) { clearTimeout(transitorio); transitorio = null; } pintar(); });
    qa('input[name="' + id + '-c"]').forEach(function (r) { r.addEventListener('change', function () { st.contacto = this.value; pintar(); }); });
    q('#' + id + '-l').addEventListener('change', function () { st.carga = +this.value; pintar(); });
    q('.rle-reparar').addEventListener('click', function () { st.quemado = false; pintar(); });
    pintar();
  };
})();
