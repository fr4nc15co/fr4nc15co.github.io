/*
 * Componente "fig-circuito": dibujos esquemáticos (SVG) de los conceptos básicos
 * de teoría de circuitos. Estáticos, sin interacción. Se elige la figura con
 * data-config: {"fig":"ohm"|"serie"|"paralelo"|"kcl"|"kvl"|"caidas"}.
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
    // --- 1.ª ley de Kirchhoff (corrientes en un nodo) ---
    kcl: {
      cap: '<strong>1.ª ley (corrientes):</strong> lo que entra en un nodo sale por las demás ramas. <em>I</em>₁ = <em>I</em>₂ + <em>I</em>₃.',
      svg: '<svg viewBox="0 0 280 170" class="fc-svg" aria-label="Ley de corrientes de Kirchhoff">' + flecha('fa-kcl') +
        // entra I1
        '<line x1="30" y1="85" x2="125" y2="85" stroke="var(--acento)" stroke-width="1.8" marker-end="url(#fa-kcl)"/>' +
        T(70, 76, 'I₁', { fill: 'var(--acento)', style: 1 }) +
        // salen I2 (arriba) e I3 (abajo)
        '<line x1="140" y1="80" x2="235" y2="35" stroke="var(--acento-2)" stroke-width="1.8" marker-end="url(#fa-kcl)"/>' +
        T(215, 30, 'I₂', { fill: 'var(--acento-2)', style: 1 }) +
        '<line x1="140" y1="90" x2="235" y2="135" stroke="var(--acento-2)" stroke-width="1.8" marker-end="url(#fa-kcl)"/>' +
        T(215, 152, 'I₃', { fill: 'var(--acento-2)', style: 1 }) +
        '<circle cx="135" cy="85" r="6" fill="var(--azul-cl)"/>' + T(135, 110, 'nodo', { fill: 'var(--txt-tenue)', size: 10 }) +
        '</svg>'
    },
    // --- 2.ª ley de Kirchhoff (tensiones en una malla) ---
    kvl: {
      cap: '<strong>2.ª ley (tensiones):</strong> al recorrer una malla, las caídas suman lo que da la fuente. <em>V</em><tspan>S</tspan> = <em>V</em>₁ + <em>V</em>₂.',
      svg: '<svg viewBox="0 0 300 195" class="fc-svg" aria-label="Ley de tensiones de Kirchhoff">' +
        // malla rectangular (con huecos donde van la fuente, R1 y R2)
        W(60, 45, 120, 45) + W(180, 45, 240, 45) + W(240, 45, 240, 72) + W(240, 132, 240, 160) +
        W(240, 160, 60, 160) + W(60, 160, 60, 88) + W(60, 112, 60, 45) +
        // fuente Vs en el lado izquierdo (batería)
        '<line x1="46" y1="88" x2="74" y2="88" stroke="var(--txt)" stroke-width="3"/>' +
        '<line x1="52" y1="112" x2="68" y2="112" stroke="var(--txt)" stroke-width="1.6"/>' +
        T(26, 96, 'V', { fill: 'var(--amarillo)', style: 1, anchor: 'start' }) + T(36, 100, 'S', { fill: 'var(--amarillo)', size: 8, anchor: 'start' }) +
        T(48, 80, '+', { fill: 'var(--txt-2)', size: 12 }) + T(48, 128, '−', { fill: 'var(--txt-2)', size: 12 }) +
        // R1 arriba (horizontal)
        res(120, 36, 60, 18, 'R₁') + T(150, 28, 'V₁', { fill: 'var(--acento)', style: 1 }) +
        // R2 derecha (vertical)
        '<rect x="231" y="72" width="18" height="60" rx="2.5" fill="var(--bg-3)" stroke="var(--acento)" stroke-width="1.6"/>' +
        T(262, 106, 'R₂', { fill: 'var(--acento)', anchor: 'start' }) + T(262, 122, 'V₂', { fill: 'var(--acento)', style: 1, anchor: 'start' }) +
        // sentido de recorrido de la malla
        T(150, 107, '↻', { fill: 'var(--txt-tenue)', size: 18 }) +
        '</svg>'
    },
    // --- Tensión de un punto como suma de caídas desde la referencia ---
    caidas: {
      cap: 'La tensión de <em>B</em> es la <strong>suma de las caídas</strong> desde la referencia (0&nbsp;V): se va acumulando nodo a nodo.',
      svg: '<svg viewBox="0 0 420 150" class="fc-svg" aria-label="Tensión como suma de caídas">' + flecha('fa-cai') +
        '<line x1="60" y1="40" x2="360" y2="40" stroke="var(--acento-2)" stroke-width="1.4" marker-end="url(#fa-cai)"/>' +
        T(210, 32, 'recorrido (sumando caídas)', { fill: 'var(--acento-2)', size: 10, style: 1 }) +
        W(40, 80, 70, 80) + res(70, 71, 60, 18, 'R₁') + W(130, 80, 190, 80) + res(190, 71, 60, 18, 'R₂') + W(250, 80, 300, 80) +
        // masa
        dot(40, 80) + W(34, 96, 46, 96) + W(37, 101, 43, 101) + T(40, 120, '0 V', { fill: 'var(--txt-tenue)', size: 10 }) +
        // nodos intermedios
        dot(160, 80) + T(160, 118, 'V₁', { fill: 'var(--txt-2)' }) +
        '<line x1="160" y1="80" x2="160" y2="108" stroke="var(--borde)" stroke-width="1" stroke-dasharray="3 3"/>' +
        dot(300, 80) + T(300, 70, 'B', { style: 1 }) + T(300, 120, 'V_B = V₁ + V₂', { fill: 'var(--acento)' }) +
        '<line x1="300" y1="80" x2="300" y2="108" stroke="var(--borde)" stroke-width="1" stroke-dasharray="3 3"/>' +
        // etiquetas de caída por resistencia
        T(100, 64, 'V₁', { fill: 'var(--acento)', style: 1 }) + T(220, 64, 'V₂', { fill: 'var(--acento)', style: 1 }) +
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
    }
  };

  MPI.componentes['fig-circuito'] = function (el, cfg) {
    var nombre = (cfg && cfg.fig) || 'ohm';
    var f = FIGS[nombre] || FIGS.ohm;
    el.classList.add('mpi-fig-circuito');
    el.innerHTML = f.svg + '<p class="fc-cap">' + f.cap + '</p>';
  };
})();
