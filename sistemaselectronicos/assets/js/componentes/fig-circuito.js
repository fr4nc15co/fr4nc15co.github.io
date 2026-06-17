/*
 * Componente "fig-circuito": dibujos esquemáticos (SVG) de los conceptos básicos
 * de teoría de circuitos. Estáticos, sin interacción. Se elige la figura con
 * data-config: {"fig":"ohm"|"serie"|"paralelo"|"kcl"|"kvl"|"caidas"|"divisor-v"|"divisor-l"}.
 *
 * Uso: <div class="mpi-mount" data-componente="fig-circuito" data-config='{"fig":"ohm"}'></div>
 */
window.MPI = window.MPI || {};
MPI.componentes = MPI.componentes || {};

(function () {
  // marcador de flecha (id único por figura para no colisionar entre SVGs)
  function flecha(id) {
    return '<defs><marker id="' + id + '" markerWidth="9" markerHeight="9" refX="7.5" refY="4.5" orient="auto">' +
      '<path d="M0 0 L9 4.5 L0 9 Z" fill="var(--txt-2)"/></marker></defs>';
  }
  // resistencia como caja con etiqueta
  function res(x, y, w, h, etq) {
    return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="2.5" ' +
      'fill="var(--bg-3)" stroke="var(--acento)" stroke-width="1.6"/>' +
      '<text x="' + (x + w / 2) + '" y="' + (y + h / 2 + 4) + '" font-size="12" fill="var(--acento)" text-anchor="middle">' + etq + '</text>';
  }
  function dot(x, y) { return '<circle cx="' + x + '" cy="' + y + '" r="3.5" fill="var(--azul-cl)"/>'; }
  function W(x1, y1, x2, y2) { return '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '" stroke="var(--txt-2)" stroke-width="1.6"/>'; }
  function T(x, y, s, opts) {
    opts = opts || {};
    return '<text x="' + x + '" y="' + y + '" font-size="' + (opts.size || 11) + '" fill="' + (opts.fill || 'var(--txt)') +
      '" text-anchor="' + (opts.anchor || 'middle') + '"' + (opts.style ? ' font-style="italic"' : '') + '>' + s + '</text>';
  }
  function resV(x, y, h, etq, lx) {   // resistencia vertical centrada en x, de y a y+h
    return '<rect x="' + (x - 7) + '" y="' + y + '" width="14" height="' + h + '" rx="2.5" fill="var(--bg-3)" stroke="var(--acento)" stroke-width="1.6"/>' +
      '<text x="' + (lx || (x + 16)) + '" y="' + (y + h / 2 + 4) + '" font-size="12" fill="var(--acento)" text-anchor="middle">' + etq + '</text>';
  }
  function gnd(x, y) {
    return W(x, y, x, y + 8) +
      '<line x1="' + (x - 9) + '" y1="' + (y + 8) + '" x2="' + (x + 9) + '" y2="' + (y + 8) + '" stroke="var(--txt-tenue)" stroke-width="1.6"/>' +
      '<line x1="' + (x - 5) + '" y1="' + (y + 12) + '" x2="' + (x + 5) + '" y2="' + (y + 12) + '" stroke="var(--txt-tenue)" stroke-width="1.4"/>' +
      '<line x1="' + (x - 2) + '" y1="' + (y + 15) + '" x2="' + (x + 2) + '" y2="' + (y + 15) + '" stroke="var(--txt-tenue)" stroke-width="1.2"/>';
  }
  function vcc(x, y, w) {  // raíl Vcc horizontal de x a x+w en altura y
    return W(x, y, x + w, y) + '<text x="' + x + '" y="' + (y - 5) + '" font-size="10" fill="var(--amarillo)" text-anchor="start">V<tspan baseline-shift="sub" font-size="7">cc</tspan></text>';
  }
  function pulsador(x, y1, y2) {  // pulsador abierto vertical entre (x,y1) y (x,y2)
    return '<circle cx="' + x + '" cy="' + y1 + '" r="2.6" fill="var(--txt-2)"/>' +
      '<circle cx="' + x + '" cy="' + y2 + '" r="2.6" fill="var(--txt-2)"/>' +
      '<line x1="' + x + '" y1="' + y1 + '" x2="' + (x + 15) + '" y2="' + (y1 + (y2 - y1) * 0.5) + '" stroke="var(--txt-2)" stroke-width="1.6"/>' +
      '<text x="' + (x + 20) + '" y="' + ((y1 + y2) / 2 + 3) + '" font-size="9.5" fill="var(--txt-tenue)" text-anchor="start">pulsador</text>';
  }

  // --- formatos numéricos para los simuladores interactivos de Kirchhoff ---
  function fmtmA(mA) {
    var v = Math.round(mA * 10) / 10;
    return (v % 1 === 0 ? String(v) : v.toFixed(1)).replace('.', ',') + ' mA';
  }
  function fmtVolt(v) {
    var r = Math.round(v * 10) / 10;
    return (r % 1 === 0 ? String(r) : r.toFixed(1)).replace('.', ',') + ' V';
  }
  function fmtRohm(ohm) {
    if (ohm >= 1000) {
      var k = Math.round(ohm / 100) / 10;
      return (k % 1 === 0 ? String(k) : k.toFixed(1)).replace('.', ',') + ' kΩ';
    }
    return String(ohm) + ' Ω';
  }

  // --- esquemas de las configuraciones de AO (mismos dibujos que el simulador
  //     sim-opamp, aquí en versión estática para acompañar al texto del tema) ---
  var AOC = 'stroke="var(--azul-cl)" stroke-width="1.5" fill="none"';
  var AOL = 'font-size="9" fill="var(--txt-tenue)"';
  function aoEsquema(inn, label) {
    return '<svg viewBox="0 0 240 150" class="fc-svg" aria-label="' + label + '">' +
      '<polygon points="120,40 120,110 190,75" fill="var(--bg-3)" stroke="var(--borde)" stroke-width="1.5"/>' +
      '<text x="128" y="68" font-size="11" fill="var(--txt-2)">−</text>' +
      '<text x="128" y="92" font-size="11" fill="var(--txt-2)">+</text>' +
      '<line x1="190" y1="75" x2="222" y2="75" stroke="var(--acento)" stroke-width="1.5"/>' +
      '<text x="214" y="68" font-size="10" fill="var(--acento)">Vₒ</text>' +
      inn + '</svg>';
  }

  var FIGS = {
    // --- Ley de Ohm: una rama con su corriente y su caída de tensión ---
    ohm: {
      cap: 'Ley de Ohm: la corriente <em>I</em> va del nodo a (mayor potencial) al b a través de <em>R</em>, y la caída es <em>V</em> = <em>I</em>·<em>R</em>.',
      svg: '<svg viewBox="0 0 300 130" class="fc-svg" aria-label="Ley de Ohm">' + flecha('fa-ohm') +
        '<line x1="80" y1="42" x2="200" y2="42" stroke="var(--acento-2)" stroke-width="1.6" marker-end="url(#fa-ohm)"/>' +
        T(140, 34, 'I', { fill: 'var(--acento-2)', style: 1 }) +
        W(40, 70, 100, 70) + res(100, 61, 60, 18, 'R') + W(160, 70, 250, 70) +
        dot(40, 70) + dot(250, 70) +
        T(40, 90, 'a', { style: 1 }) + T(250, 90, 'b', { style: 1 }) +
        T(150, 118, 'V = V<tspan baseline-shift="sub" font-size="8">a</tspan> − V<tspan baseline-shift="sub" font-size="8">b</tspan> = I · R', { fill: 'var(--txt-2)' }) +
        '</svg>'
    },
    // --- Dos resistencias en serie ---
    serie: {
      cap: 'En <strong>serie</strong> circula la <em>misma corriente</em> por las dos; las resistencias se suman.',
      svg: '<svg viewBox="0 0 360 110" class="fc-svg" aria-label="Resistencias en serie">' + flecha('fa-ser') +
        '<line x1="60" y1="32" x2="300" y2="32" stroke="var(--acento-2)" stroke-width="1.6" marker-end="url(#fa-ser)"/>' +
        T(180, 24, 'I (común)', { fill: 'var(--acento-2)', style: 1 }) +
        W(30, 60, 70, 60) + res(70, 51, 60, 18, 'R₁') + W(130, 60, 200, 60) + dot(165, 60) +
        res(200, 51, 60, 18, 'R₂') + W(260, 60, 320, 60) +
        dot(30, 60) + dot(320, 60) + T(30, 80, 'A', { style: 1 }) + T(320, 80, 'B', { style: 1 }) +
        T(180, 100, 'R_eq = R₁ + R₂', { fill: 'var(--txt-2)' }) +
        '</svg>'
    },
    // --- Dos resistencias en paralelo ---
    paralelo: {
      cap: 'En <strong>paralelo</strong> cae la <em>misma tensión</em> en las dos; se combinan con el producto partido por la suma.',
      svg: '<svg viewBox="0 0 320 175" class="fc-svg" aria-label="Resistencias en paralelo">' +
        // nodos A y B
        dot(40, 90) + dot(280, 90) + T(28, 94, 'A', { style: 1, anchor: 'end' }) + T(292, 94, 'B', { style: 1, anchor: 'start' }) +
        // tramos comunes
        W(40, 90, 90, 90) + W(230, 90, 280, 90) +
        // rama superior
        W(90, 90, 90, 50) + W(90, 50, 120, 50) + res(120, 41, 60, 18, 'R₁') + W(180, 50, 230, 50) + W(230, 50, 230, 90) +
        // rama inferior
        W(90, 90, 90, 130) + W(90, 130, 120, 130) + res(120, 121, 60, 18, 'R₂') + W(180, 130, 230, 130) + W(230, 130, 230, 90) +
        T(160, 162, 'R_eq = R₁·R₂ / (R₁ + R₂)', { fill: 'var(--txt-2)' }) +
        '</svg>'
    },
    // --- 1.ª ley de Kirchhoff (corrientes en un nodo) — INTERACTIVA ---
    kcl: {
      cap: '<strong>1.ª ley (corrientes):</strong> lo que entra en un nodo sale por las demás ramas. I₁ = I₂ + I₃.',
      init: function (el) {
        var i2 = 1.5, i3 = 1.0;
        el.classList.add('mpi-kirchhoff');
        el.innerHTML =
          '<div class="mpi-sim-cab">Ley de corrientes de Kirchhoff (LKC) — 1.ª ley</div>' +
          '<div class="kk-cuerpo">' +
            '<div class="kk-esquema">' +
              '<svg viewBox="0 0 340 200" class="fc-svg" aria-label="LKC interactiva">' +
                '<defs>' +
                  '<marker id="kk-a1" markerWidth="9" markerHeight="9" refX="7.5" refY="4.5" orient="auto">' +
                    '<path d="M0 0 L9 4.5 L0 9 Z" fill="var(--acento)"/></marker>' +
                  '<marker id="kk-a2" markerWidth="9" markerHeight="9" refX="7.5" refY="4.5" orient="auto">' +
                    '<path d="M0 0 L9 4.5 L0 9 Z" fill="var(--acento-2)"/></marker>' +
                '</defs>' +
                '<line class="kk-ln1" x1="20" y1="100" x2="148" y2="100" stroke="var(--acento)" stroke-width="2.5" marker-end="url(#kk-a1)"/>' +
                '<text x="84" y="88" font-size="12" fill="var(--acento)" text-anchor="middle" font-style="italic">I₁</text>' +
                '<text class="kk-vi1" x="84" y="116" font-size="10" fill="var(--acento)" text-anchor="middle"></text>' +
                '<circle cx="160" cy="100" r="8" fill="var(--azul-cl)"/>' +
                '<text x="160" y="124" font-size="10" fill="var(--txt-tenue)" text-anchor="middle">nodo</text>' +
                '<line class="kk-ln2" x1="168" y1="93" x2="313" y2="32" stroke="var(--acento-2)" stroke-width="2" marker-end="url(#kk-a2)"/>' +
                '<text x="266" y="28" font-size="12" fill="var(--acento-2)" text-anchor="start" font-style="italic">I₂</text>' +
                '<text class="kk-vi2" x="266" y="44" font-size="10" fill="var(--acento-2)" text-anchor="start"></text>' +
                '<line class="kk-ln3" x1="168" y1="107" x2="313" y2="168" stroke="var(--acento-2)" stroke-width="2" marker-end="url(#kk-a2)"/>' +
                '<text x="266" y="160" font-size="12" fill="var(--acento-2)" text-anchor="start" font-style="italic">I₃</text>' +
                '<text class="kk-vi3" x="266" y="178" font-size="10" fill="var(--acento-2)" text-anchor="start"></text>' +
              '</svg>' +
            '</div>' +
            '<div class="kk-panel">' +
              '<p class="kk-hint">Ajusta I₂ e I₃; la LKC calcula I₁&nbsp;=&nbsp;I₂&nbsp;+&nbsp;I₃:</p>' +
              '<div class="kk-ctrl">' +
                '<label class="kk-lab">I<sub>2</sub> = <strong class="kk-i2-lab"></strong></label>' +
                '<input type="range" class="kk-sl2" min="0" max="5" step="0.1" value="1.5">' +
              '</div>' +
              '<div class="kk-ctrl">' +
                '<label class="kk-lab">I<sub>3</sub> = <strong class="kk-i3-lab"></strong></label>' +
                '<input type="range" class="kk-sl3" min="0" max="5" step="0.1" value="1">' +
              '</div>' +
              '<div class="kk-resultado">' +
                '<span class="kk-res-tit">I<sub>1</sub> = I<sub>2</sub> + I<sub>3</sub></span>' +
                '<strong class="kk-i1-out"></strong>' +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div class="kk-balance"></div>' +
          '<p class="fc-cap"><strong>1.ª ley (corrientes):</strong> lo que entra en un nodo sale por las demás ramas. Ajusta I₂ e I₃ y comprueba que I₁ se recalcula al instante.</p>';

        function swKcl(v) { return (1.5 + 3 * Math.min(v, 5) / 5).toFixed(2); }

        function pintarKcl() {
          var i1 = i2 + i3;
          el.querySelector('.kk-ln1').setAttribute('stroke-width', swKcl(i1));
          el.querySelector('.kk-ln2').setAttribute('stroke-width', swKcl(i2));
          el.querySelector('.kk-ln3').setAttribute('stroke-width', swKcl(i3));
          el.querySelector('.kk-vi1').textContent = fmtmA(i1);
          el.querySelector('.kk-vi2').textContent = fmtmA(i2);
          el.querySelector('.kk-vi3').textContent = fmtmA(i3);
          el.querySelector('.kk-i2-lab').textContent = fmtmA(i2);
          el.querySelector('.kk-i3-lab').textContent = fmtmA(i3);
          el.querySelector('.kk-i1-out').textContent = fmtmA(i1);
          el.querySelector('.kk-balance').innerHTML =
            '<span class="kk-eq">Σ I en el nodo = 0 →</span>' +
            '<span class="kk-eqnum">I<sub>1</sub> = I<sub>2</sub> + I<sub>3</sub>' +
            ' = ' + fmtmA(i2) + ' + ' + fmtmA(i3) +
            ' = <strong>' + fmtmA(i1) + '</strong></span>';
        }

        el.querySelector('.kk-sl2').addEventListener('input', function () { i2 = parseFloat(this.value); pintarKcl(); });
        el.querySelector('.kk-sl3').addEventListener('input', function () { i3 = parseFloat(this.value); pintarKcl(); });
        pintarKcl();
      }
    },
    // --- 2.ª ley de Kirchhoff (tensiones en una malla) — INTERACTIVA ---
    kvl: {
      cap: '<strong>2.ª ley (tensiones):</strong> al recorrer una malla, las caídas suman lo que da la fuente. VS = V₁ + V₂.',
      init: function (el) {
        var vs = 9, r1 = 3000, r2 = 1500;
        el.classList.add('mpi-kirchhoff');
        el.innerHTML =
          '<div class="mpi-sim-cab">Ley de tensiones de Kirchhoff (LKV) — 2.ª ley</div>' +
          '<div class="kk-cuerpo">' +
            '<div class="kk-esquema">' +
              '<svg viewBox="0 0 340 215" class="fc-svg" aria-label="LKV interactiva">' +
                // Fuente Vs en el lado izquierdo (x=70)
                W(70, 65, 70, 106) +
                '<line x1="56" y1="106" x2="84" y2="106" stroke="var(--txt)" stroke-width="3"/>' +
                '<line x1="62" y1="118" x2="78" y2="118" stroke="var(--txt)" stroke-width="1.6"/>' +
                W(70, 118, 70, 182) +
                T(44, 104, '+', { fill: 'var(--txt-2)', size: 12, anchor: 'end' }) +
                T(44, 122, '−', { fill: 'var(--txt-2)', size: 12, anchor: 'end' }) +
                '<text x="14" y="110" font-size="12" fill="var(--amarillo)" text-anchor="start" font-style="italic">V<tspan dy="3" font-size="8">S</tspan></text>' +
                '<text class="kk-vvs" x="14" y="126" font-size="10" fill="var(--amarillo)" text-anchor="start"></text>' +
                // R1 arriba (y=65)
                W(70, 65, 110, 65) +
                res(110, 55, 90, 20, 'R₁') +
                W(200, 65, 265, 65) +
                '<text x="155" y="44" font-size="12" fill="var(--acento)" text-anchor="middle" font-style="italic">V₁</text>' +
                '<text class="kk-vv1" x="155" y="32" font-size="10" fill="var(--acento)" text-anchor="middle"></text>' +
                // R2 derecha (x=265)
                W(265, 65, 265, 97) +
                '<rect x="258" y="97" width="14" height="50" rx="2.5" fill="var(--bg-3)" stroke="var(--acento-2)" stroke-width="1.6"/>' +
                '<text x="265" y="126" font-size="11" fill="var(--acento-2)" text-anchor="middle">R₂</text>' +
                W(265, 147, 265, 182) +
                '<text x="288" y="113" font-size="12" fill="var(--acento-2)" text-anchor="start" font-style="italic">V₂</text>' +
                '<text class="kk-vv2" x="288" y="129" font-size="10" fill="var(--acento-2)" text-anchor="start"></text>' +
                // Cable inferior y nodos
                W(265, 182, 70, 182) +
                dot(70, 65) + dot(265, 65) + dot(265, 182) + dot(70, 182) +
                // Sentido de la malla y corriente
                T(167, 130, '↻', { fill: 'var(--txt-tenue)', size: 18 }) +
                '<text class="kk-vi" x="167" y="150" font-size="10" fill="var(--azul-cl)" text-anchor="middle"></text>' +
              '</svg>' +
            '</div>' +
            '<div class="kk-panel">' +
              '<p class="kk-hint">Ajusta V<sub>S</sub>, R₁ y R₂; la LKV garantiza V<sub>S</sub>&nbsp;=&nbsp;V₁&nbsp;+&nbsp;V₂:</p>' +
              '<div class="kk-ctrl">' +
                '<label class="kk-lab">V<sub>S</sub> = <strong class="kk-vs-lab"></strong></label>' +
                '<input type="range" class="kk-sl-vs" min="1" max="12" step="0.5" value="9">' +
              '</div>' +
              '<div class="kk-ctrl">' +
                '<label class="kk-lab"><span class="kk-c1">R₁</span> = <strong class="kk-r1-lab"></strong></label>' +
                '<input type="range" class="kk-sl-r1" min="100" max="10000" step="100" value="3000">' +
              '</div>' +
              '<div class="kk-ctrl">' +
                '<label class="kk-lab"><span class="kk-c2">R₂</span> = <strong class="kk-r2-lab"></strong></label>' +
                '<input type="range" class="kk-sl-r2" min="100" max="10000" step="100" value="1500">' +
              '</div>' +
              '<div class="kk-resultados-kvl">' +
                '<div class="kk-res kk-res-v1"><span class="kk-res-tit">V₁</span><strong class="kk-v1-out"></strong></div>' +
                '<div class="kk-res kk-res-v2"><span class="kk-res-tit">V₂</span><strong class="kk-v2-out"></strong></div>' +
                '<div class="kk-res kk-res-i"><span class="kk-res-tit">I malla</span><strong class="kk-i-out"></strong></div>' +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div class="kk-balance"></div>' +
          '<p class="fc-cap"><strong>2.ª ley (tensiones):</strong> al recorrer la malla, las caídas en R₁ y R₂ suman exactamente lo que da la fuente. Ajusta los valores y comprueba que V<sub>S</sub>&nbsp;=&nbsp;V₁&nbsp;+&nbsp;V₂ siempre se cumple.</p>';

        function pintarKvl() {
          var i = vs / (r1 + r2);
          var v1 = i * r1, v2 = i * r2;
          el.querySelector('.kk-vvs').textContent = fmtVolt(vs);
          el.querySelector('.kk-vv1').textContent = fmtVolt(v1);
          el.querySelector('.kk-vv2').textContent = fmtVolt(v2);
          el.querySelector('.kk-vi').textContent = 'I = ' + fmtmA(i * 1000);
          el.querySelector('.kk-vs-lab').textContent = fmtVolt(vs);
          el.querySelector('.kk-r1-lab').textContent = fmtRohm(r1);
          el.querySelector('.kk-r2-lab').textContent = fmtRohm(r2);
          el.querySelector('.kk-v1-out').textContent = fmtVolt(v1);
          el.querySelector('.kk-v2-out').textContent = fmtVolt(v2);
          el.querySelector('.kk-i-out').textContent = fmtmA(i * 1000);
          el.querySelector('.kk-balance').innerHTML =
            '<span class="kk-eq">Σ V en malla = 0 →</span>' +
            '<span class="kk-eqnum">V<sub>S</sub> = V₁ + V₂' +
            ' = ' + fmtVolt(v1) + ' + ' + fmtVolt(v2) +
            ' = <strong>' + fmtVolt(vs) + '</strong></span>';
        }

        el.querySelector('.kk-sl-vs').addEventListener('input', function () { vs = parseFloat(this.value); pintarKvl(); });
        el.querySelector('.kk-sl-r1').addEventListener('input', function () { r1 = parseInt(this.value, 10); pintarKvl(); });
        el.querySelector('.kk-sl-r2').addEventListener('input', function () { r2 = parseInt(this.value, 10); pintarKvl(); });
        pintarKvl();
      }
    },
    // --- Tensión de un punto como suma de tensiones parciales (caídas) desde la referencia ---
    caidas: {
      cap: 'Para conocer la tensión de un punto, <strong>asumimos primero un sentido para la corriente</strong> &mdash;normalmente hacia el punto que creamos a <em>menor</em> potencial (aquí, los 0&nbsp;V)&mdash; y vamos sumando las <strong>tensiones parciales</strong> (las caídas) desde la referencia. Cada flecha de tensión va del &minus; al + (al revés que la corriente), así que <em>V<sub>B</sub></em> = <em>V</em>₁ + <em>V</em>₂.',
      svg: '<svg viewBox="0 0 420 152" class="fc-svg" aria-label="Tensión como suma de tensiones parciales">' +
        '<defs>' +
        '<marker id="cai-rec" markerWidth="9" markerHeight="9" refX="7.5" refY="4.5" orient="auto"><path d="M0 0 L9 4.5 L0 9 Z" fill="var(--acento-2)"/></marker>' +
        '<marker id="cai-v" markerWidth="8" markerHeight="8" refX="6.5" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8 Z" fill="var(--acento)"/></marker>' +
        '<marker id="cai-i" markerWidth="9" markerHeight="9" refX="7.5" refY="4.5" orient="auto"><path d="M0 0 L9 4.5 L0 9 Z" fill="var(--azul-cl)"/></marker>' +
        '</defs>' +
        // recorrido: acumulamos las tensiones parciales de la referencia hacia B
        '<line x1="60" y1="26" x2="360" y2="26" stroke="var(--acento-2)" stroke-width="1.4" marker-end="url(#cai-rec)"/>' +
        T(210, 18, 'recorrido: vamos sumando las tensiones parciales', { fill: 'var(--acento-2)', size: 10, style: 1 }) +
        // tensiones parciales: cada flecha va del − al + (mayor potencial)
        T(100, 48, 'V₁', { fill: 'var(--acento)', style: 1 }) + T(220, 48, 'V₂', { fill: 'var(--acento)', style: 1 }) +
        '<line x1="74" y1="58" x2="126" y2="58" stroke="var(--acento)" stroke-width="1.6" marker-end="url(#cai-v)"/>' +
        '<line x1="194" y1="58" x2="246" y2="58" stroke="var(--acento)" stroke-width="1.6" marker-end="url(#cai-v)"/>' +
        // circuito
        W(40, 80, 70, 80) + res(70, 71, 60, 18, 'R₁') + W(130, 80, 190, 80) + res(190, 71, 60, 18, 'R₂') + W(250, 80, 300, 80) +
        // referencia (masa, 0 V)
        dot(40, 80) + gnd(40, 80) + T(40, 112, '0 V', { fill: 'var(--txt-tenue)', size: 10 }) +
        // nodos intermedios y tensión de B
        dot(160, 80) + '<line x1="160" y1="80" x2="160" y2="124" stroke="var(--borde)" stroke-width="1" stroke-dasharray="3 3"/>' + T(160, 136, 'V₁', { fill: 'var(--txt-2)' }) +
        dot(300, 80) + T(300, 66, 'B', { style: 1 }) + '<line x1="300" y1="80" x2="300" y2="124" stroke="var(--borde)" stroke-width="1" stroke-dasharray="3 3"/>' + T(300, 136, 'V<tspan baseline-shift="sub" font-size="8">B</tspan> = V₁ + V₂', { fill: 'var(--acento)' }) +
        // corriente supuesta: hacia el punto de menor potencial (0 V)
        '<line x1="288" y1="102" x2="78" y2="102" stroke="var(--azul-cl)" stroke-width="1.6" marker-end="url(#cai-i)"/>' +
        T(184, 98, 'I (supuesta, hacia el menor potencial)', { fill: 'var(--azul-cl)', size: 9, style: 1 }) +
        '</svg>'
    },
    // --- Divisor de tensión: el MISMO circuito dibujado de dos formas ---
    'divisor-v': {
      cap: 'El divisor dibujado en <strong>vertical</strong> (alimentación arriba, masa abajo): <em>R</em>₁ y <em>R</em>₂ en serie y la salida <em>V<sub>o</sub></em> tomada en el nodo intermedio. Con <em>V<sub>in</sub></em>=5&nbsp;V, 3&nbsp;kΩ y 2&nbsp;kΩ &#8594; <em>V<sub>o</sub></em>=2&nbsp;V.',
      svg: '<svg viewBox="0 0 240 206" class="fc-svg" aria-label="Divisor de tensión dibujado en vertical">' + flecha('fa-dv') +
        dot(80, 32) + W(80, 32, 80, 50) +
        T(80, 24, 'V<tspan baseline-shift="sub" font-size="8">in</tspan> = 5 V', { fill: 'var(--amarillo)' }) +
        resV(80, 50, 46, 'R₁ = 3 kΩ', 128) +
        W(80, 96, 80, 128) + dot(80, 112) +
        '<line x1="80" y1="112" x2="158" y2="112" stroke="var(--acento)" stroke-width="1.4" marker-end="url(#fa-dv)"/>' +
        T(162, 108, 'V<tspan baseline-shift="sub" font-size="8">o</tspan> = 2 V', { fill: 'var(--acento)', anchor: 'start' }) +
        resV(80, 128, 46, 'R₂ = 2 kΩ', 128) +
        W(80, 174, 80, 188) + gnd(80, 188) + T(98, 200, '0 V', { fill: 'var(--txt-tenue)', size: 9, anchor: 'start' }) +
        '</svg>'
    },
    'divisor-l': {
      cap: 'El <strong>mismo</strong> divisor dibujado <strong>en «L» (tumbado)</strong>: es <strong>el mismo circuito</strong> y la misma cuenta (5&nbsp;V&#8594;2&nbsp;V). Da igual la forma del dibujo; lo importante es <strong>identificar</strong> las dos resistencias en serie y la salida en su unión.',
      svg: '<svg viewBox="0 0 285 150" class="fc-svg" aria-label="Divisor de tensión dibujado en L">' + flecha('fa-dl') +
        dot(36, 50) + T(40, 30, 'V<tspan baseline-shift="sub" font-size="8">in</tspan> = 5 V', { fill: 'var(--amarillo)' }) +
        W(36, 50, 52, 50) + res(52, 41, 76, 18, 'R₁ = 3 kΩ') + W(128, 50, 172, 50) +
        dot(172, 50) +
        '<line x1="172" y1="50" x2="212" y2="50" stroke="var(--acento)" stroke-width="1.4" marker-end="url(#fa-dl)"/>' +
        T(216, 54, 'V<tspan baseline-shift="sub" font-size="8">o</tspan> = 2 V', { fill: 'var(--acento)', anchor: 'start' }) +
        W(172, 50, 172, 62) + resV(172, 62, 46, 'R₂ = 2 kΩ', 205) +
        W(172, 108, 172, 122) + gnd(172, 122) +
        '</svg>'
    },

    // ===== Componentes (Tema 3) =====
    pullup: {
      cap: '<strong>Pull-up:</strong> la resistencia lleva el pin a V<sub>cc</sub>. En reposo se lee <strong>1</strong>; al pulsar (cierra a masa) se lee <strong>0</strong>.',
      svg: '<svg viewBox="0 0 250 178" class="fc-svg" aria-label="Pulsador con resistencia de pull-up">' +
        vcc(40, 22, 80) + W(95, 22, 95, 44) + resV(95, 44, 30, 'R') + W(95, 74, 95, 96) +
        dot(95, 96) + W(95, 96, 168, 96) + T(172, 99, '→ GPIO', { anchor: 'start', fill: 'var(--azul-cl)' }) +
        T(172, 112, 'reposo: 1', { anchor: 'start', size: 9, fill: 'var(--txt-tenue)' }) +
        W(95, 96, 95, 118) + pulsador(95, 118, 144) + W(95, 144, 95, 152) + gnd(95, 152) +
        '</svg>'
    },
    pulldown: {
      cap: '<strong>Pull-down:</strong> la resistencia lleva el pin a masa. En reposo se lee <strong>0</strong>; al pulsar (cierra a V<sub>cc</sub>) se lee <strong>1</strong>.',
      svg: '<svg viewBox="0 0 250 178" class="fc-svg" aria-label="Pulsador con resistencia de pull-down">' +
        vcc(40, 22, 80) + W(95, 22, 95, 36) + pulsador(95, 36, 62) + W(95, 62, 95, 96) +
        dot(95, 96) + W(95, 96, 168, 96) + T(172, 99, '→ GPIO', { anchor: 'start', fill: 'var(--azul-cl)' }) +
        T(172, 112, 'reposo: 0', { anchor: 'start', size: 9, fill: 'var(--txt-tenue)' }) +
        W(95, 96, 95, 118) + resV(95, 118, 30, 'R') + W(95, 148, 95, 152) + gnd(95, 152) +
        '</svg>'
    },
    'led-serie': {
      cap: 'El <strong>LED</strong> nunca va solo: una <strong>resistencia limitadora</strong> en serie fija la corriente, <em>R</em> = (V<sub>cc</sub> − V<sub>LED</sub>) / I<sub>LED</sub>.',
      svg: '<svg viewBox="0 0 250 110" class="fc-svg" aria-label="LED con resistencia limitadora">' +
        dot(24, 55) + T(24, 46, 'GPIO', { fill: 'var(--azul-cl)', size: 10 }) + W(24, 55, 64, 55) +
        res(64, 46, 46, 18, 'R') + W(110, 55, 138, 55) +
        '<polygon points="138,45 138,65 156,55" fill="var(--bg-3)" stroke="var(--acento)" stroke-width="1.6"/>' +
        '<line x1="156" y1="45" x2="156" y2="65" stroke="var(--acento)" stroke-width="2"/>' +
        '<line x1="150" y1="42" x2="160" y2="30" stroke="var(--amarillo)" stroke-width="1.4"/>' +
        '<line x1="157" y1="44" x2="167" y2="32" stroke="var(--amarillo)" stroke-width="1.4"/>' +
        T(147, 84, 'LED', { size: 10, fill: 'var(--acento)' }) +
        W(156, 55, 200, 55) + gnd(200, 55) +
        '</svg>'
    },
    transistor: {
      cap: 'El <strong>transistor NPN como interruptor</strong>: una corriente pequeña por la base (vía R<sub>B</sub>) deja pasar mucha más por el colector hacia la carga. Satura cuando i<sub>B</sub> &gt; i<sub>C</sub>/β.',
      svg: '<svg viewBox="0 0 250 188" class="fc-svg" aria-label="Transistor NPN como interruptor">' + flecha('fa-npn') +
        vcc(70, 20, 110) + W(175, 20, 175, 40) +
        '<rect x="160" y="40" width="30" height="22" rx="2.5" fill="var(--bg-3)" stroke="var(--acento)" stroke-width="1.6"/>' +
        T(196, 54, 'carga', { anchor: 'start', size: 10 }) + W(175, 62, 175, 82) + dot(175, 82) +
        '<line x1="150" y1="86" x2="150" y2="116" stroke="var(--txt)" stroke-width="2.5"/>' +
        W(120, 101, 150, 101) + W(150, 92, 175, 82) +
        '<line x1="150" y1="110" x2="174" y2="124" stroke="var(--txt)" stroke-width="1.6" marker-end="url(#fa-npn)"/>' +
        T(180, 80, 'C', { anchor: 'start', size: 9, fill: 'var(--txt-tenue)' }) +
        T(112, 98, 'B', { anchor: 'end', size: 9, fill: 'var(--txt-tenue)' }) +
        T(180, 130, 'E', { anchor: 'start', size: 9, fill: 'var(--txt-tenue)' }) +
        dot(20, 101) + T(20, 92, 'GPIO', { fill: 'var(--azul-cl)', size: 10 }) + W(20, 101, 40, 101) +
        res(40, 92, 44, 18, 'R_B') + W(84, 101, 120, 101) +
        W(174, 124, 174, 152) + gnd(174, 152) +
        '</svg>'
    },
    rele: {
      cap: 'El <strong>relé</strong> aísla galvánicamente el control de la potencia (220&nbsp;V). El <strong>diodo en antiparalelo</strong> con la bobina es imprescindible: descarga la corriente al apagar y evita la sobretensión que destruiría el transistor.',
      svg: '<svg viewBox="0 0 300 195" class="fc-svg" aria-label="Relé con transistor y diodo de protección">' + flecha('fa-rel') +
        vcc(60, 22, 120) +
        W(165, 22, 165, 42) + '<rect x="158" y="42" width="14" height="32" rx="2.5" fill="var(--bg-3)" stroke="var(--acento)" stroke-width="1.6"/>' +
        T(178, 60, 'bobina', { anchor: 'start', size: 9, fill: 'var(--acento)' }) + W(165, 74, 165, 92) + dot(165, 92) +
        W(165, 92, 120, 92) + W(120, 92, 120, 64) +
        '<polygon points="111,64 129,64 120,50" fill="var(--bg-3)" stroke="var(--naranja)" stroke-width="1.5"/>' +
        '<line x1="111" y1="48" x2="129" y2="48" stroke="var(--naranja)" stroke-width="2"/>' +
        W(120, 48, 120, 22) + T(104, 58, 'D', { anchor: 'end', size: 10, fill: 'var(--naranja)' }) +
        '<line x1="150" y1="98" x2="150" y2="128" stroke="var(--txt)" stroke-width="2.5"/>' +
        W(120, 113, 150, 113) + W(150, 104, 165, 92) +
        '<line x1="150" y1="122" x2="172" y2="136" stroke="var(--txt)" stroke-width="1.6" marker-end="url(#fa-rel)"/>' +
        dot(20, 113) + T(20, 104, 'GPIO', { fill: 'var(--azul-cl)', size: 10 }) + W(20, 113, 40, 113) +
        res(40, 104, 44, 18, 'R_B') + W(84, 113, 120, 113) +
        W(172, 136, 172, 160) + gnd(172, 160) +
        '<rect x="220" y="66" width="66" height="40" rx="4" fill="var(--bg-3)" stroke="var(--borde)" stroke-width="1.5"/>' +
        T(253, 82, 'contactos', { size: 9 }) + T(253, 96, '→ 220 V', { size: 9, fill: 'var(--rojo)' }) +
        '<line x1="172" y1="58" x2="220" y2="78" stroke="var(--txt-tenue)" stroke-width="1.2" stroke-dasharray="4 3"/>' +
        T(196, 50, 'acople', { size: 8, fill: 'var(--txt-tenue)' }) +
        '</svg>'
    },

    // ===== Condensadores y bobinas (Tema 4) =====
    condensador: {
      cap: 'El <strong>condensador</strong> almacena <strong>tensión</strong> (carga en sus placas) y se opone a los cambios bruscos de tensión: <em>i</em> = <em>C</em>·d<em>v</em>/d<em>t</em>.',
      svg: '<svg viewBox="0 0 230 100" class="fc-svg" aria-label="Condensador">' +
        dot(24, 52) + W(24, 52, 100, 52) +
        '<line x1="100" y1="34" x2="100" y2="70" stroke="var(--acento)" stroke-width="2.5"/>' +
        '<line x1="114" y1="34" x2="114" y2="70" stroke="var(--acento)" stroke-width="2.5"/>' +
        W(114, 52, 190, 52) + dot(190, 52) +
        T(107, 26, 'C', { fill: 'var(--acento)' }) +
        T(70, 46, '+', { size: 13, fill: 'var(--txt-2)' }) + T(150, 46, '−', { size: 13, fill: 'var(--txt-2)' }) +
        '</svg>'
    },
    bobina: {
      cap: 'La <strong>bobina</strong> almacena <strong>corriente</strong> (campo magnético) y se opone a los cambios bruscos de corriente: <em>v</em> = <em>L</em>·d<em>i</em>/d<em>t</em>.',
      svg: '<svg viewBox="0 0 230 95" class="fc-svg" aria-label="Bobina">' +
        dot(24, 55) + W(24, 55, 75, 55) +
        '<path d="M75 55 a11 11 0 0 1 22 0 a11 11 0 0 1 22 0 a11 11 0 0 1 22 0 a11 11 0 0 1 22 0" fill="none" stroke="var(--acento)" stroke-width="2"/>' +
        W(163, 55, 200, 55) + dot(200, 55) +
        T(118, 30, 'L', { fill: 'var(--acento)' }) +
        '</svg>'
    },
    impedancia: {
      cap: 'Con la <strong>frecuencia</strong>: la resistencia no cambia, la <strong>Z del condensador baja</strong> (en continua es circuito abierto) y la <strong>Z de la bobina sube</strong> (en continua, un simple cable).',
      svg: '<svg viewBox="0 0 260 160" class="fc-svg" aria-label="Impedancia frente a la frecuencia">' +
        W(34, 18, 34, 132) + W(34, 132, 246, 132) +
        T(252, 130, 'f', { anchor: 'start', style: 1, fill: 'var(--txt-tenue)' }) + T(30, 16, 'Z', { anchor: 'end', style: 1, fill: 'var(--txt-tenue)' }) +
        '<line x1="34" y1="78" x2="246" y2="78" stroke="var(--amarillo)" stroke-width="2"/>' + T(244, 72, 'Z_R = R', { anchor: 'end', size: 10, fill: 'var(--amarillo)' }) +
        '<polyline points="40,26 75,52 120,82 175,108 244,122" fill="none" stroke="var(--acento)" stroke-width="2"/>' + T(58, 34, 'Z_C', { size: 10, fill: 'var(--acento)' }) +
        '<polyline points="40,124 95,104 145,78 195,50 244,28" fill="none" stroke="var(--acento-2)" stroke-width="2"/>' + T(232, 42, 'Z_L', { size: 10, fill: 'var(--acento-2)' }) +
        '</svg>'
    },
    // --- Filtro RC paso bajo: R en serie, C a masa, salida en C ---
    'filtro-paso-bajo': {
      cap: 'Filtro <strong>RC paso bajo</strong>: la <em>R</em> va en serie y el condensador <strong>a masa</strong>; la salida se toma en <em>C</em>. En <strong>baja frecuencia</strong> <em>C</em> es circuito abierto y <em>v<sub>out</sub></em>&#8776;<em>v<sub>in</sub></em> (pasa); en <strong>alta</strong>, <em>C</em> es cortocircuito y <em>v<sub>out</sub></em>&#8594;0 (se atenúa).',
      svg: '<svg viewBox="0 0 320 150" class="fc-svg" aria-label="Filtro RC paso bajo">' +
        dot(40, 40) + W(40, 40, 80, 40) + res(80, 31, 58, 18, 'R') + W(138, 40, 280, 40) +
        dot(200, 40) + W(200, 40, 200, 64) +
        '<line x1="186" y1="64" x2="214" y2="64" stroke="var(--acento)" stroke-width="2.5"/>' +
        '<line x1="186" y1="72" x2="214" y2="72" stroke="var(--acento)" stroke-width="2.5"/>' +
        W(200, 72, 200, 118) + T(222, 73, 'C', { anchor: 'start', fill: 'var(--acento)' }) +
        dot(280, 40) + W(40, 118, 280, 118) + dot(40, 118) + dot(280, 118) + gnd(160, 118) +
        T(34, 44, 'v<tspan baseline-shift="sub" font-size="8">in</tspan>', { anchor: 'end', fill: 'var(--amarillo)', style: 1 }) +
        T(286, 44, 'v<tspan baseline-shift="sub" font-size="8">out</tspan>', { anchor: 'start', fill: 'var(--acento-2)', style: 1 }) +
        '</svg>'
    },
    // --- Filtro RC paso alto: C en serie, R a masa, salida en R ---
    'filtro-paso-alto': {
      cap: 'Filtro <strong>RC paso alto</strong>: el condensador va en serie y la <em>R</em> <strong>a masa</strong>; la salida se toma en <em>R</em>. En <strong>baja frecuencia</strong> <em>C</em> bloquea y <em>v<sub>out</sub></em>&#8594;0; en <strong>alta</strong>, <em>C</em> es un cable y <em>v<sub>out</sub></em>&#8776;<em>v<sub>in</sub></em> (pasa).',
      svg: '<svg viewBox="0 0 320 150" class="fc-svg" aria-label="Filtro RC paso alto">' +
        dot(40, 40) + W(40, 40, 86, 40) +
        '<line x1="86" y1="30" x2="86" y2="50" stroke="var(--acento)" stroke-width="2.5"/>' +
        '<line x1="96" y1="30" x2="96" y2="50" stroke="var(--acento)" stroke-width="2.5"/>' +
        T(91, 24, 'C', { fill: 'var(--acento)' }) + W(96, 40, 280, 40) +
        dot(186, 40) + W(186, 40, 186, 56) + resV(186, 56, 46, 'R') + W(186, 102, 186, 118) +
        dot(280, 40) + W(40, 118, 280, 118) + dot(40, 118) + dot(280, 118) + gnd(110, 118) +
        T(34, 44, 'v<tspan baseline-shift="sub" font-size="8">in</tspan>', { anchor: 'end', fill: 'var(--amarillo)', style: 1 }) +
        T(286, 44, 'v<tspan baseline-shift="sub" font-size="8">out</tspan>', { anchor: 'start', fill: 'var(--acento-2)', style: 1 }) +
        '</svg>'
    },

    // ===== Teoremas (Tema 7) =====
    thevenin: {
      cap: '<strong>Teorema de Thévenin:</strong> cualquier red lineal vista desde dos terminales equivale a una fuente <em>V<sub>th</sub></em> en <strong>serie</strong> con una resistencia <em>R<sub>th</sub></em>.',
      svg: '<svg viewBox="0 0 320 140" class="fc-svg" aria-label="Equivalente de Thévenin">' +
        '<rect x="20" y="38" width="86" height="64" rx="4" fill="var(--bg-3)" stroke="var(--borde)" stroke-width="1.5"/>' +
        T(63, 68, 'Red', { size: 11 }) + T(63, 84, 'lineal', { size: 11 }) +
        W(106, 52, 126, 52) + dot(126, 52) + T(132, 50, 'A', { anchor: 'start', style: 1 }) +
        W(106, 88, 126, 88) + dot(126, 88) + T(132, 92, 'B', { anchor: 'start', style: 1 }) +
        T(156, 76, '≡', { size: 20, fill: 'var(--txt-2)' }) +
        W(196, 52, 222, 52) + res(222, 43, 34, 18, 'R_th') + W(256, 52, 286, 52) + dot(286, 52) + T(292, 50, 'A', { anchor: 'start', style: 1 }) +
        W(196, 52, 196, 64) + '<line x1="184" y1="64" x2="208" y2="64" stroke="var(--txt)" stroke-width="2.5"/>' +
        '<line x1="189" y1="72" x2="203" y2="72" stroke="var(--txt)" stroke-width="1.6"/>' + W(196, 72, 196, 88) +
        T(180, 70, 'V_th', { anchor: 'end', size: 10, fill: 'var(--amarillo)' }) +
        W(196, 88, 286, 88) + dot(286, 88) + T(292, 92, 'B', { anchor: 'start', style: 1 }) +
        '</svg>'
    },
    norton: {
      cap: '<strong>Teorema de Norton:</strong> la misma red equivale a una fuente de corriente <em>I<sub>N</sub></em> en <strong>paralelo</strong> con una resistencia <em>R<sub>N</sub></em> (= <em>R<sub>th</sub></em>).',
      svg: '<svg viewBox="0 0 320 150" class="fc-svg" aria-label="Equivalente de Norton">' + flecha('fa-nor') +
        '<rect x="20" y="42" width="86" height="64" rx="4" fill="var(--bg-3)" stroke="var(--borde)" stroke-width="1.5"/>' +
        T(63, 72, 'Red', { size: 11 }) + T(63, 88, 'lineal', { size: 11 }) +
        W(106, 56, 126, 56) + dot(126, 56) + T(132, 54, 'A', { anchor: 'start', style: 1 }) +
        W(106, 92, 126, 92) + dot(126, 92) + T(132, 96, 'B', { anchor: 'start', style: 1 }) +
        T(156, 78, '≡', { size: 20, fill: 'var(--txt-2)' }) +
        W(196, 44, 286, 44) + W(196, 104, 286, 104) +
        W(286, 44, 286, 56) + dot(286, 56) + T(292, 54, 'A', { anchor: 'start', style: 1 }) +
        W(286, 104, 286, 92) + dot(286, 92) + T(292, 96, 'B', { anchor: 'start', style: 1 }) +
        '<circle cx="210" cy="74" r="15" fill="none" stroke="var(--amarillo)" stroke-width="1.6"/>' +
        '<line x1="210" y1="86" x2="210" y2="62" stroke="var(--amarillo)" stroke-width="1.6" marker-end="url(#fa-nor)"/>' +
        W(210, 44, 210, 59) + W(210, 89, 210, 104) + T(210, 128, 'I_N', { size: 10, fill: 'var(--amarillo)' }) +
        W(258, 44, 258, 59) + resV(258, 59, 30, 'R_N') + W(258, 89, 258, 104) +
        '</svg>'
    },

    // ===== Amplificadores operacionales (Tema 8) =====
    aoideal: {
      cap: '<strong>AO ideal:</strong> no entra corriente por las entradas (i<sub>+</sub> = i<sub>−</sub> = 0) y, con realimentación negativa, las dos entradas quedan a la misma tensión (v<sub>+</sub> = v<sub>−</sub>, «cortocircuito virtual»).',
      svg: '<svg viewBox="0 0 240 150" class="fc-svg" aria-label="Amplificador operacional ideal">' +
        '<polygon points="70,35 70,115 150,75" fill="var(--bg-3)" stroke="var(--borde)" stroke-width="1.6"/>' +
        W(30, 55, 70, 55) + W(30, 95, 70, 95) +
        T(80, 60, '−', { size: 13, fill: 'var(--txt-2)' }) + T(80, 100, '+', { size: 13, fill: 'var(--txt-2)' }) +
        T(28, 51, 'v−', { size: 10, anchor: 'end', fill: 'var(--txt-2)' }) + T(28, 99, 'v+', { size: 10, anchor: 'end', fill: 'var(--txt-2)' }) +
        W(150, 75, 200, 75) + dot(200, 75) + T(206, 78, 'Vₒ', { anchor: 'start', fill: 'var(--acento)' }) +
        T(48, 42, 'i−=0', { size: 9, fill: 'var(--naranja)' }) + T(48, 92, 'i+=0', { size: 9, fill: 'var(--naranja)' }) +
        T(120, 140, 'v+ = v−  («cortocircuito virtual»)', { size: 10, fill: 'var(--azul-cl)' }) +
        '</svg>'
    },
    aotransfer: {
      cap: 'En <strong>lazo abierto</strong> el AO satura: la salida salta a +V<sub>cc</sub> o −V<sub>ee</sub> según el signo de (v<sub>+</sub> − v<sub>−</sub>). La zona lineal es una franja minúscula en torno a 0.',
      svg: '<svg viewBox="0 0 240 170" class="fc-svg" aria-label="Característica de transferencia del AO">' +
        W(30, 20, 30, 150) + W(20, 85, 220, 85) +
        T(216, 80, 'v+ − v−', { anchor: 'end', size: 9, fill: 'var(--txt-tenue)' }) + T(38, 26, 'Vₒ', { anchor: 'start', size: 9, fill: 'var(--txt-tenue)' }) +
        '<line x1="30" y1="32" x2="200" y2="32" stroke="var(--borde)" stroke-width="1" stroke-dasharray="3 3"/>' +
        '<line x1="30" y1="140" x2="118" y2="140" stroke="var(--borde)" stroke-width="1" stroke-dasharray="3 3"/>' +
        '<polyline points="40,140 118,140 126,32 200,32" fill="none" stroke="var(--acento)" stroke-width="2.2"/>' +
        T(214, 30, '+V_cc', { anchor: 'end', size: 9, fill: 'var(--acento)' }) + T(72, 154, '−V_ee', { size: 9, fill: 'var(--naranja)' }) +
        '</svg>'
    },
    // --- Configuración no inversora ---
    aonoinv: {
      cap: '<strong>No inversor:</strong> la señal entra por v<sub>+</sub>; la realimentación va por <em>R2</em> de la salida a v<sub>−</sub> y <em>R1</em> de v<sub>−</sub> a masa. Ganancia <em>A<sub>v</sub></em> = 1 + R2/R1 (siempre ≥ 1) y resistencia de entrada infinita.',
      svg: aoEsquema(
        '<line x1="60" y1="95" x2="120" y2="95" ' + AOC + '/>' +
        '<text x="58" y="90" ' + AOL + '>V_in (v+)</text>' +
        '<line x1="120" y1="55" x2="30" y2="55" ' + AOC + '/>' +
        '<line x1="30" y1="55" x2="30" y2="120" ' + AOC + '/>' +
        '<rect x="23" y="80" width="14" height="28" fill="none" stroke="var(--naranja)" stroke-width="1.5"/>' +
        '<text x="42" y="98" ' + AOL + '>R1</text>' +
        '<line x1="30" y1="120" x2="30" y2="132" ' + AOC + '/>' +
        '<line x1="22" y1="132" x2="38" y2="132" stroke="var(--txt-tenue)" stroke-width="1.5"/>' +
        '<line x1="80" y1="55" x2="80" y2="27" ' + AOC + '/>' +
        '<line x1="80" y1="27" x2="95" y2="27" ' + AOC + '/>' +
        '<rect x="95" y="20" width="30" height="14" fill="none" stroke="var(--naranja)" stroke-width="1.5"/>' +
        '<text x="98" y="16" ' + AOL + '>R2</text>' +
        '<line x1="125" y1="27" x2="200" y2="27" ' + AOC + '/>' +
        '<line x1="200" y1="27" x2="200" y2="75" ' + AOC + '/>',
        'Amplificador no inversor')
    },
    // --- Buffer (seguidor de tensión) ---
    aobuffer: {
      cap: '<strong>Buffer (seguidor):</strong> caso particular del no inversor con <em>R2</em> = 0 y <em>R1</em> = ∞; la salida se realimenta directamente a v<sub>−</sub>. <em>A<sub>v</sub></em> = 1; sirve para <strong>adaptar impedancias</strong> (entrada ∞, salida 0).',
      svg: aoEsquema(
        '<line x1="8" y1="95" x2="120" y2="95" ' + AOC + '/>' +
        '<text x="8" y="90" ' + AOL + '>V_in (v+)</text>' +
        '<line x1="120" y1="55" x2="100" y2="55" ' + AOC + '/>' +
        '<line x1="100" y1="55" x2="100" y2="20" ' + AOC + '/>' +
        '<line x1="100" y1="20" x2="200" y2="20" ' + AOC + '/>' +
        '<line x1="200" y1="20" x2="200" y2="75" ' + AOC + '/>' +
        '<text x="150" y="15" text-anchor="middle" ' + AOL + '>realimentación directa</text>',
        'Buffer seguidor de tensión')
    },
    // --- Configuración inversora ---
    aoinv: {
      cap: '<strong>Inversor:</strong> la señal entra por v<sub>−</sub> a través de <em>R1</em>, con v<sub>+</sub> a masa (v<sub>−</sub> queda a 0&nbsp;V, «tierra virtual»). Ganancia <em>A<sub>v</sub></em> = −R2/R1 (invierte el signo); resistencia de entrada finita = <em>R1</em>.',
      svg: aoEsquema(
        '<line x1="8" y1="55" x2="40" y2="55" ' + AOC + '/>' +
        '<text x="8" y="50" ' + AOL + '>V_in</text>' +
        '<rect x="40" y="48" width="30" height="14" fill="none" stroke="var(--naranja)" stroke-width="1.5"/>' +
        '<text x="44" y="44" ' + AOL + '>R1</text>' +
        '<line x1="70" y1="55" x2="120" y2="55" ' + AOC + '/>' +
        '<line x1="90" y1="55" x2="90" y2="25" ' + AOC + '/>' +
        '<line x1="90" y1="25" x2="115" y2="25" ' + AOC + '/>' +
        '<rect x="115" y="18" width="30" height="14" fill="none" stroke="var(--naranja)" stroke-width="1.5"/>' +
        '<text x="118" y="14" ' + AOL + '>R2</text>' +
        '<line x1="145" y1="25" x2="200" y2="25" ' + AOC + '/>' +
        '<line x1="200" y1="25" x2="200" y2="75" ' + AOC + '/>' +
        '<line x1="120" y1="95" x2="100" y2="95" ' + AOC + '/>' +
        '<line x1="100" y1="95" x2="100" y2="118" ' + AOC + '/>' +
        '<line x1="92" y1="118" x2="108" y2="118" stroke="var(--txt-tenue)" stroke-width="1.5"/>',
        'Amplificador inversor')
    },
    // --- Sumador inversor ---
    aosumador: {
      cap: '<strong>Sumador inversor:</strong> cada entrada aporta su corriente por su propia resistencia a la <strong>tierra virtual</strong>; todas se suman en <em>R<sub>f</sub></em>. Con todas las R iguales, V<sub>o</sub> = −(v<sub>1</sub> + v<sub>2</sub>).',
      svg: aoEsquema(
        '<line x1="8" y1="48" x2="38" y2="48" ' + AOC + '/>' +
        '<text x="8" y="43" ' + AOL + '>v1</text>' +
        '<rect x="38" y="41" width="24" height="12" fill="none" stroke="var(--naranja)" stroke-width="1.5"/>' +
        '<line x1="62" y1="48" x2="90" y2="48" ' + AOC + '/>' +
        '<line x1="8" y1="68" x2="38" y2="68" ' + AOC + '/>' +
        '<text x="8" y="63" ' + AOL + '>v2</text>' +
        '<rect x="38" y="61" width="24" height="12" fill="none" stroke="var(--naranja)" stroke-width="1.5"/>' +
        '<line x1="62" y1="68" x2="90" y2="68" ' + AOC + '/>' +
        '<line x1="90" y1="48" x2="90" y2="68" ' + AOC + '/>' +
        '<line x1="90" y1="55" x2="120" y2="55" ' + AOC + '/>' +
        '<line x1="90" y1="55" x2="90" y2="28" ' + AOC + '/>' +
        '<line x1="90" y1="28" x2="115" y2="28" ' + AOC + '/>' +
        '<rect x="115" y="21" width="30" height="14" fill="none" stroke="var(--naranja)" stroke-width="1.5"/>' +
        '<text x="118" y="17" ' + AOL + '>Rf</text>' +
        '<line x1="145" y1="28" x2="200" y2="28" ' + AOC + '/>' +
        '<line x1="200" y1="28" x2="200" y2="75" ' + AOC + '/>' +
        '<line x1="120" y1="95" x2="104" y2="95" ' + AOC + '/>' +
        '<line x1="104" y1="95" x2="104" y2="115" ' + AOC + '/>' +
        '<line x1="96" y1="115" x2="112" y2="115" stroke="var(--txt-tenue)" stroke-width="1.5"/>',
        'Sumador inversor')
    },
    // --- Amplificador diferencial ---
    aodif: {
      cap: '<strong>Diferencial:</strong> amplifica la <em>resta</em> de las entradas. Eligiendo <em>R3</em> = <em>R1</em> y <em>R4</em> = <em>R2</em>, la salida es V<sub>o</sub> = (R2/R1)·(v<sub>2</sub> − v<sub>1</sub>).',
      svg: aoEsquema(
        '<line x1="8" y1="55" x2="40" y2="55" ' + AOC + '/>' +
        '<text x="8" y="50" ' + AOL + '>v1</text>' +
        '<rect x="40" y="48" width="26" height="12" fill="none" stroke="var(--naranja)" stroke-width="1.5"/>' +
        '<text x="44" y="45" ' + AOL + '>R1</text>' +
        '<line x1="66" y1="55" x2="120" y2="55" ' + AOC + '/>' +
        '<line x1="88" y1="55" x2="88" y2="26" ' + AOC + '/>' +
        '<line x1="88" y1="26" x2="113" y2="26" ' + AOC + '/>' +
        '<rect x="113" y="19" width="28" height="12" fill="none" stroke="var(--naranja)" stroke-width="1.5"/>' +
        '<text x="116" y="16" ' + AOL + '>R2</text>' +
        '<line x1="141" y1="26" x2="200" y2="26" ' + AOC + '/>' +
        '<line x1="200" y1="26" x2="200" y2="75" ' + AOC + '/>' +
        '<line x1="8" y1="95" x2="40" y2="95" ' + AOC + '/>' +
        '<text x="8" y="90" ' + AOL + '>v2</text>' +
        '<rect x="40" y="89" width="26" height="12" fill="none" stroke="var(--naranja)" stroke-width="1.5"/>' +
        '<text x="44" y="112" ' + AOL + '>R3=R1</text>' +
        '<line x1="66" y1="95" x2="120" y2="95" ' + AOC + '/>' +
        '<line x1="90" y1="95" x2="90" y2="110" ' + AOC + '/>' +
        '<rect x="83" y="110" width="14" height="22" fill="none" stroke="var(--naranja)" stroke-width="1.5"/>' +
        '<text x="100" y="127" ' + AOL + '>R4=R2</text>' +
        '<line x1="90" y1="132" x2="90" y2="140" ' + AOC + '/>' +
        '<line x1="82" y1="140" x2="98" y2="140" stroke="var(--txt-tenue)" stroke-width="1.5"/>',
        'Amplificador diferencial')
    }
  };

  MPI.componentes['fig-circuito'] = function (el, cfg) {
    var nombre = (cfg && cfg.fig) || 'ohm';
    var f = FIGS[nombre] || FIGS.ohm;
    el.classList.add('mpi-fig-circuito');
    if (f.init) {
      f.init(el);
    } else {
      el.innerHTML = f.svg + '<p class="fc-cap">' + f.cap + '</p>';
    }
  };
})();
