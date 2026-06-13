/*
 * Componente "sim-servo": simulador del servo del tema de PWM.
 * Mueve el ángulo y ve el ancho del pulso, el valor de OC1RS, el duty y el
 * pulso dibujado a escala dentro del periodo de 20 ms. Coincide con el
 * ejemplo 10.8: OC1 en RB15, Timer2 con prescaler 1:2 (tick de 0,4 µs),
 * PR2 = 49999; -90º -> 1 ms (2500 cuentas), +90º -> 2 ms (5000 cuentas).
 *
 * Uso: <div class="mpi-mount" data-componente="sim-servo" data-config='{}'></div>
 */
window.MPI = window.MPI || {};
MPI.componentes = MPI.componentes || {};

(function () {
  function num(x, dec) { return x.toFixed(dec).replace('.', ','); }

  MPI.componentes['sim-servo'] = function (el, cfg) {
    el.classList.add('mpi-servo');
    el.innerHTML =
      '<div class="mpi-sim-cab">Simulador del servo (OC1 en RB15 · Timer2 1:2 · PR2 = 49999)</div>' +
      '<div class="sv-cuerpo">' +
        '<div class="sv-izq">' +
          '<svg class="sv-gauge" viewBox="0 0 220 130" aria-label="Posición del servo">' +
            '<path d="M20 115 A90 90 0 0 1 200 115" fill="none" stroke="var(--borde)" stroke-width="10"/>' +
            '<text x="14" y="112" font-size="11" fill="var(--txt-tenue)" text-anchor="middle">−90°</text>' +
            '<text x="110" y="16" font-size="11" fill="var(--txt-tenue)" text-anchor="middle">0°</text>' +
            '<text x="206" y="112" font-size="11" fill="var(--txt-tenue)" text-anchor="middle">+90°</text>' +
            '<line class="sv-aguja" x1="110" y1="115" x2="110" y2="35" stroke="var(--acento)" stroke-width="4" stroke-linecap="round"/>' +
            '<circle cx="110" cy="115" r="7" fill="var(--acento)"/>' +
          '</svg>' +
          '<label class="sv-slider">Ángulo: <strong class="sv-ang">0°</strong> <small>(pasos de 10°, como el ejemplo)</small>' +
            '<input type="range" min="-90" max="90" step="10" value="0">' +
          '</label>' +
        '</div>' +
        '<div class="sv-der">' +
          '<table class="cb-tabla">' +
            '<tr><td>Pulsaciones desde −90° (n)</td><td class="sv-n"></td></tr>' +
            '<tr><td>OC1RS = 2500 + n·139</td><td class="sv-oc1rs"></td></tr>' +
            '<tr><td>Ancho del pulso</td><td class="sv-ancho"></td></tr>' +
            '<tr><td>Factor de servicio</td><td class="sv-duty"></td></tr>' +
          '</table>' +
          '<div class="sv-onda"><div class="sv-pulso"></div><span class="sv-onda-t">periodo: 20 ms (PR2 = 49999)</span></div>' +
          '<pre class="sv-codigo"><code class="lang-c"></code></pre>' +
        '</div>' +
      '</div>';

    var slider = el.querySelector('input[type="range"]');

    function pintar() {
      var ang = parseInt(slider.value, 10);
      var n = (ang + 90) / 10;                        // pulsaciones de 10 grados desde -90
      var oc1rs = 2500 + n * 139;                     // exactamente como el programa (INC_10_GRADOS)
      var ancho_ms = oc1rs / 2500;                    // tick de 0,4 us -> 2500 cuentas/ms
      var duty = ancho_ms / 20 * 100;

      el.querySelector('.sv-ang').textContent = (ang > 0 ? '+' : '') + ang + '°';
      el.querySelector('.sv-n').textContent = n;
      el.querySelector('.sv-ancho').textContent = num(ancho_ms, 3) + ' ms';
      el.querySelector('.sv-oc1rs').textContent = oc1rs;
      el.querySelector('.sv-duty').textContent = num(duty, 1) + ' %';

      // aguja: -90º apunta a la izquierda, +90º a la derecha
      el.querySelector('.sv-aguja').setAttribute('transform', 'rotate(' + ang + ' 110 115)');

      // pulso a escala dentro de los 20 ms (5..10 % del ancho)
      el.querySelector('.sv-pulso').style.width = (ancho_ms / 20 * 100) + '%';

      var cod = el.querySelector('.sv-codigo code');
      cod.textContent =
        'OC1RS = 2500 + ' + n + ' * INC_10_GRADOS;   // = ' + oc1rs + ' -> ' +
        (ang > 0 ? '+' : '') + ang + ' grados (' + num(ancho_ms, 3) + ' ms)\n' +
        '// (el cambio se aplica al EMPEZAR el siguiente periodo: doble carga)' +
        (ang === 90 ? '\n// Ojo: salen 5002 y no 5000: es el redondeo acumulado de 138,9 -> 139.\n// Al servo le da igual (0,8 us de mas).' : '');
      if (MPI.resaltarTodo) MPI.resaltarTodo(el);
    }

    slider.addEventListener('input', pintar);
    pintar();
  };
})();
