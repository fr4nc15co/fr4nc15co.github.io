/*
 * Componente "sim-motor": simulador del motor del ejemplo 10.7.
 * La misma interacción que el programa: cada pulsación de RB5 sube el factor
 * de servicio un 10 % (y tras el 100 % vuelve a 0). Se ve el OC1RS calculado
 * exactamente como en el ejemplo (división entera de 249·duty/100), el pulso
 * dentro del periodo de 50 µs y un motor que gira más o menos rápido.
 *
 * Uso: <div class="mpi-mount" data-componente="sim-motor" data-config='{}'></div>
 */
window.MPI = window.MPI || {};
MPI.componentes = MPI.componentes || {};

(function () {
  var PERIODO = 249;   // PR2 para 20 kHz con PBCLK = 5 MHz

  MPI.componentes['sim-motor'] = function (el, cfg) {
    var duty = 0;      // factor de servicio en %

    el.classList.add('mpi-motor');
    el.innerHTML =
      '<div class="mpi-sim-cab">Simulador del motor (OC1 en RC7 · PWM de 20 kHz · PR2 = 249)</div>' +
      '<div class="sm-cuerpo">' +
        '<div class="sm-col">' +
          '<button type="button" class="sm-pulsador">🔘 Pulsación de RB5<small>+10 % de factor de servicio</small></button>' +
          '<table class="cb-tabla">' +
            '<tr><td>Factor de servicio</td><td class="sm-duty"></td></tr>' +
            '<tr><td>OC1RS = 249·duty/100 (trunca)</td><td class="sm-ocrs"></td></tr>' +
            '<tr><td>Tiempo a nivel alto</td><td class="sm-ton"></td></tr>' +
          '</table>' +
        '</div>' +
        '<div class="sm-col sm-centro">' +
          '<svg class="sm-motorsvg" viewBox="0 0 120 120" aria-label="Motor girando">' +
            '<circle cx="60" cy="60" r="52" fill="var(--bg-3)" stroke="var(--borde)" stroke-width="3"/>' +
            '<g class="sm-rotor">' +
              '<path d="M60 60 L60 14 A46 46 0 0 1 88 24 Z" fill="var(--acento)" opacity=".85"/>' +
              '<path d="M60 60 L100 83 A46 46 0 0 1 72 104 Z" fill="var(--acento)" opacity=".85"/>' +
              '<path d="M60 60 L20 83 A46 46 0 0 1 16 50 Z" fill="var(--acento)" opacity=".85"/>' +
              '<circle cx="60" cy="60" r="10" fill="var(--txt-2)"/>' +
            '</g>' +
          '</svg>' +
          '<div class="sm-estado"></div>' +
        '</div>' +
      '</div>' +
      '<div class="sv-onda"><div class="sv-pulso"></div><span class="sv-onda-t">periodo: 50 µs (20 kHz)</span></div>' +
      '<pre class="sm-codigo"><code class="lang-c"></code></pre>';

    var rotor = el.querySelector('.sm-rotor');

    function pintar() {
      var ocrs = Math.floor(PERIODO * duty / 100);    // división entera, como en C
      var ton = ocrs * 0.2;                            // µs (cuentas de 200 ns)

      el.querySelector('.sm-duty').textContent = duty + ' %';
      el.querySelector('.sm-ocrs').textContent = ocrs;
      el.querySelector('.sm-ton').textContent = ton.toFixed(1).replace('.', ',') + ' µs';
      el.querySelector('.sv-pulso').style.width = duty + '%';

      if (duty === 0) {
        rotor.style.animation = 'none';
      } else {
        rotor.style.animation = 'sm-gira ' + (4 / (duty / 10)) + 's linear infinite';
      }
      el.querySelector('.sm-estado').innerHTML = duty === 0
        ? 'Motor <strong>parado</strong> — y sin apagar nada: basta <code>OC1RS = 0</code>'
        : 'Motor girando al <strong>' + duty + ' %</strong> de su velocidad';

      el.querySelector('.sm-codigo code').textContent =
        'factor_servicio = ' + duty + ';\n' +
        'OC1RS = PERIODO * factor_servicio / 100;   // = ' + ocrs +
        (duty > 0 ? '  (24,9 -> 24 a 10 %: trunca)' : '  (motor parado)') + '\n' +
        '// OC1R no se toca: el modulo lo recarga solo al final de cada periodo';
      if (MPI.resaltarTodo) MPI.resaltarTodo(el);
    }

    el.querySelector('.sm-pulsador').addEventListener('click', function () {
      duty += 10;
      if (duty > 100) duty = 0;   // como el programa: tras el 100 % se vuelve a 0
      pintar();
    });
    pintar();
  };
})();
