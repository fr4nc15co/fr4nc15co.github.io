/*
 * Componente "sim-motor": regulación por PWM de una carga (motor/LED) en la Pi 4.
 * Misma idea que el ejemplo de las transparencias con PWMoutputdevice: cada pulsación sube
 * el factor de servicio un 10 % (y tras el 100 % vuelve a 0). Se ve el .value que
 * se escribiría (duty/100), el tiempo a nivel alto dentro del periodo y una carga
 * que gira/luce más o menos según el ciclo de trabajo.
 *   mi_motor = PWMoutputdevice(20, frequency=200)   # PWM por software, 200 Hz → T = 5 ms
 *   mi_motor.value = valor/100             # valor de 0 a 100 en pasos de 10
 * (Para un motor de verdad se usa un driver y se elige f ≥ 20 kHz, fuera del
 * rango audible; aquí mantenemos los 200 Hz del ejemplo del LED.)
 *
 * Uso: <div class="mpi-mount" data-componente="sim-motor" data-config='{}'></div>
 */
window.MPI = window.MPI || {};
MPI.componentes = MPI.componentes || {};

(function () {
  function num(x, dec) { return x.toFixed(dec).replace('.', ','); }

  var FREC = 200;                 // Hz, como el ejemplo PWMLED(20, frequency=200)
  var PERIODO_MS = 1000 / FREC;   // 5 ms

  MPI.componentes['sim-motor'] = function (el, cfg) {
    var duty = 0;      // factor de servicio en %

    el.classList.add('mpi-motor');
    el.innerHTML =
      '<div class="mpi-sim-cab">Regulación por PWM (PWMoutputdevice · GPIO20 · 200 Hz · T = 5 ms)</div>' +
      '<div class="sm-cuerpo">' +
        '<div class="sm-col">' +
          '<button type="button" class="sm-pulsador">🔘 Subir factor de servicio<small>+10 % (tras el 100 % vuelve a 0)</small></button>' +
          '<table class="cb-tabla">' +
            '<tr><td>Factor de servicio</td><td class="sm-duty"></td></tr>' +
            '<tr><td>mi_motor.value = duty/100</td><td class="sm-value"></td></tr>' +
            '<tr><td>Tiempo a nivel alto (value·T)</td><td class="sm-ton"></td></tr>' +
          '</table>' +
        '</div>' +
        '<div class="sm-col sm-centro">' +
          '<svg class="sm-motorsvg" viewBox="0 0 120 120" aria-label="Carga regulada por PWM">' +
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
      '<div class="sv-onda"><div class="sv-pulso"></div><span class="sv-onda-t">periodo: 5 ms (200 Hz)</span></div>' +
      '<pre class="sm-codigo"><code class="lang-python"></code></pre>';

    var rotor = el.querySelector('.sm-rotor');

    function pintar() {
      var value = duty / 100;                 // .value en [0, 1]
      var ton = value * PERIODO_MS;           // ms a nivel alto

      el.querySelector('.sm-duty').textContent = duty + ' %';
      el.querySelector('.sm-value').textContent = num(value, 2);
      el.querySelector('.sm-ton').textContent = num(ton, 2) + ' ms';
      el.querySelector('.sv-pulso').style.width = duty + '%';

      if (duty === 0) {
        rotor.style.animation = 'none';
      } else {
        rotor.style.animation = 'sm-gira ' + (4 / (duty / 10)) + 's linear infinite';
      }
      el.querySelector('.sm-estado').innerHTML = duty === 0
        ? 'Carga <strong>parada</strong> — basta <code>mi_motor.value = 0</code>'
        : 'Girando/luciendo al <strong>' + duty + ' %</strong>';

      el.querySelector('.sm-codigo code').textContent =
        'mi_motor.value = ' + num(value, 2) + '       # duty ' + duty + ' %, ' +
        't_on = ' + num(ton, 2) + ' ms' + (duty === 0 ? '  (carga parada)' : '');
      el.querySelector('.sm-codigo code').removeAttribute('data-resaltado');
      if (MPI.resaltarTodo) MPI.resaltarTodo(el);
    }

    el.querySelector('.sm-pulsador').addEventListener('click', function () {
      duty += 10;
      if (duty > 100) duty = 0;   // como el ejemplo: tras el 100 % se vuelve a 0
      pintar();
    });
    pintar();
  };
})();
