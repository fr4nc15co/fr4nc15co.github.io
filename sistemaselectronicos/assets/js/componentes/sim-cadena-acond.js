/*
 * Componente "sim-cadena-acond": la cadena de acondicionamiento del sensor de
 * dureza del agua (tema de sensores resistivos), etapa a etapa.
 * Mueve la dureza D (0–20 °dH) y observa cómo la señal recorre las tres etapas:
 *   Sensor   R(D) = 1 kΩ + 50 Ω/°dH · D
 *   Etapa 1  fuente de corriente I = 1 mA →  v_a = I·R(D) = 1 V + 0,05·D
 *   Etapa 2  amplificador inversor ×2     →  v_b = −2·v_a
 *   Etapa 3  sumador (E_z = 2 V)          →  v_o = −(v_b + 2) = 0,1 V/°dH · D
 * Operacionales a ±5 V (se avisa si alguna etapa saturara).
 *
 * Uso: <div class="mpi-mount" data-componente="sim-cadena-acond" data-config='{}'></div>
 */
window.MPI = window.MPI || {};
MPI.componentes = MPI.componentes || {};

(function () {
  var VAL = 5;                 // ±5 V de alimentación (rieles)
  function num(x, d) { return x.toFixed(d).replace('.', ','); }

  // geometría del gráfico de transferencia
  var PX0 = 44, PX1 = 290, PY0 = 18, PY1 = 182, DMAX = 20;
  function gx(D) { return PX0 + (D / DMAX) * (PX1 - PX0); }
  function gy(v) { return (PY0 + PY1) / 2 - (v / VAL) * ((PY1 - PY0) / 2); }

  MPI.componentes['sim-cadena-acond'] = function (el, cfg) {
    el.classList.add('mpi-cadena');

    function R(D) { return 1000 + 50 * D; }     // Ω
    function va(D) { return R(D) / 1000; }       // V  (I = 1 mA)
    function vb(D) { return -2 * va(D); }        // V
    function vo(D) { return -(vb(D) + 2); }      // V  = 0,1·D

    // líneas fijas del gráfico (v_a, v_b, v_o frente a D)
    function linea(fn, color) {
      return '<line x1="' + gx(0) + '" y1="' + gy(fn(0)) + '" x2="' + gx(DMAX) + '" y2="' + gy(fn(DMAX)) +
        '" stroke="' + color + '" stroke-width="2"/>';
    }

    el.innerHTML =
      '<div class="mpi-sim-cab">Cadena de acondicionamiento · sensor de dureza del agua</div>' +
      '<label class="cad-slider">Dureza del agua: <strong class="cad-d"></strong>' +
        '<input type="range" min="0" max="20" step="1" value="10"></label>' +
      '<div class="cad-pipe">' +
        '<div class="cad-card"><div class="cad-card-t">Sensor</div><div class="cad-eq">R = 1k + 50·D</div><div class="cad-val cad-r"></div></div>' +
        '<span class="cad-flecha">→</span>' +
        '<div class="cad-card"><div class="cad-card-t">Etapa 1 · fuente 1 mA</div><div class="cad-eq">v<sub>a</sub> = I·R</div><div class="cad-val cad-va"></div><div class="cad-bar"><i class="cad-cero"></i><i class="cad-mk cad-mka"></i></div></div>' +
        '<span class="cad-flecha">→</span>' +
        '<div class="cad-card"><div class="cad-card-t">Etapa 2 · inversor ×2</div><div class="cad-eq">v<sub>b</sub> = −2·v<sub>a</sub></div><div class="cad-val cad-vb"></div><div class="cad-bar"><i class="cad-cero"></i><i class="cad-mk cad-mkb"></i></div></div>' +
        '<span class="cad-flecha">→</span>' +
        '<div class="cad-card cad-card-out"><div class="cad-card-t">Etapa 3 · sumador (E_z=2V)</div><div class="cad-eq">v<sub>o</sub> = −(v<sub>b</sub>+2)</div><div class="cad-val cad-vo"></div><div class="cad-bar"><i class="cad-cero"></i><i class="cad-mk cad-mko"></i></div></div>' +
      '</div>' +
      '<div class="cad-graf">' +
        '<svg viewBox="0 0 310 200" class="cad-svg" aria-label="Tensión en cada etapa frente a la dureza">' +
          '<line x1="' + PX0 + '" y1="' + PY0 + '" x2="' + PX0 + '" y2="' + PY1 + '" stroke="var(--borde)" stroke-width="1"/>' +
          '<line x1="' + PX0 + '" y1="' + gy(0) + '" x2="' + PX1 + '" y2="' + gy(0) + '" stroke="var(--borde)" stroke-width="1"/>' +
          '<text x="' + PX1 + '" y="' + (gy(0) + 13) + '" font-size="9" fill="var(--txt-tenue)" text-anchor="end">D [°dH]</text>' +
          '<text x="' + (PX0 - 6) + '" y="' + (PY0 + 8) + '" font-size="9" fill="var(--txt-tenue)" text-anchor="end">+5</text>' +
          '<text x="' + (PX0 - 6) + '" y="' + (PY1) + '" font-size="9" fill="var(--txt-tenue)" text-anchor="end">−5</text>' +
          linea(va, 'var(--acento)') + linea(vb, 'var(--naranja)') + linea(vo, 'var(--acento-2)') +
          '<circle class="cad-pa" r="3.5" fill="var(--acento)"/>' +
          '<circle class="cad-pb" r="3.5" fill="var(--naranja)"/>' +
          '<circle class="cad-po" r="4" fill="var(--acento-2)" stroke="var(--bg)" stroke-width="1"/>' +
        '</svg>' +
        '<div class="cad-leyenda">' +
          '<span><i style="background:var(--acento)"></i> v<sub>a</sub> (etapa 1)</span>' +
          '<span><i style="background:var(--naranja)"></i> v<sub>b</sub> (etapa 2)</span>' +
          '<span><i style="background:var(--acento-2)"></i> v<sub>o</sub> (salida)</span>' +
        '</div>' +
      '</div>' +
      '<div class="cad-msg nota"></div>';

    var slider = el.querySelector('input[type="range"]');

    function pintarBarra(sel, v) {
      var mk = el.querySelector(sel);
      var pct = Math.max(0, Math.min(100, (v + VAL) / (2 * VAL) * 100));
      mk.style.left = pct + '%';
      mk.classList.toggle('cad-sat', Math.abs(v) > VAL);
    }

    function pintar() {
      var D = parseInt(slider.value, 10);
      var r = R(D), a = va(D), b = vb(D), o = vo(D);
      el.querySelector('.cad-d').textContent = D + ' °dH';
      el.querySelector('.cad-r').textContent = num(r / 1000, 2) + ' kΩ';
      el.querySelector('.cad-va').innerHTML = 'v<sub>a</sub> = ' + num(a, 2) + ' V';
      el.querySelector('.cad-vb').innerHTML = 'v<sub>b</sub> = ' + num(b, 2) + ' V';
      el.querySelector('.cad-vo').innerHTML = 'v<sub>o</sub> = ' + num(o, 2) + ' V';
      pintarBarra('.cad-mka', a); pintarBarra('.cad-mkb', b); pintarBarra('.cad-mko', o);

      el.querySelector('.cad-pa').setAttribute('cx', gx(D)); el.querySelector('.cad-pa').setAttribute('cy', gy(a));
      el.querySelector('.cad-pb').setAttribute('cx', gx(D)); el.querySelector('.cad-pb').setAttribute('cy', gy(b));
      el.querySelector('.cad-po').setAttribute('cx', gx(D)); el.querySelector('.cad-po').setAttribute('cy', gy(o));

      var sat = Math.abs(a) > VAL || Math.abs(b) > VAL || Math.abs(o) > VAL;
      el.querySelector('.cad-msg').innerHTML = sat
        ? '⚠ Alguna etapa <strong>satura</strong> (supera ±5 V).'
        : 'Salida final <strong>v<sub>o</sub> = 0,1 V/°dH · D = ' + num(o, 2) + ' V</strong> (lineal, 0–2 V en todo el rango). Ninguna etapa satura: v<sub>a</sub>∈[1, 2] V, v<sub>b</sub>∈[−4, −2] V, dentro de los ±5 V.';
    }

    slider.addEventListener('input', pintar);
    pintar();
  };
})();
