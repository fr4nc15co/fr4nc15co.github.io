/*
 * Componente "sim-servo": simulador del servo del tema de PWM (Raspberry Pi 4).
 * Mueve el ángulo y ve el ancho del pulso, el valor .value (-1..1), el factor de
 * servicio y el pulso dibujado a escala dentro del periodo de 20 ms.
 * Coincide con el ejemplo de las transparencias:
 *   servo = AngularServo(14, min_angle=0, max_angle=120)   # min 1 ms, max 2 ms
 *   servo.angle = angulo      # angulo de 0 a 120 en pasos de 20
 * gpiozero genera el PWM de 50 Hz (T = 20 ms) por software (RPi.GPIO por defecto);
 * con PiGPIOFactory se hace con temporizadores HW y desaparece el tembleque.
 *
 * Uso: <div class="mpi-mount" data-componente="sim-servo" data-config='{}'></div>
 */
window.MPI = window.MPI || {};
MPI.componentes = MPI.componentes || {};

(function () {
  function num(x, dec) { return x.toFixed(dec).replace('.', ','); }

  var ANG_MIN = 0, ANG_MAX = 120;     // AngularServo(14, min_angle=0, max_angle=120)
  var PULSO_MIN = 1, PULSO_MAX = 2;   // ms, anchos por defecto (min/max_pulse_width)
  var PERIODO = 20;                   // ms (frame_width por defecto, 50 Hz)

  MPI.componentes['sim-servo'] = function (el, cfg) {
    el.classList.add('mpi-servo');
    el.innerHTML =
      '<div class="mpi-sim-cab">Simulador del servo (AngularServo · GPIO14 · 0–120° · T = 20 ms)</div>' +
      '<div class="sv-cuerpo">' +
        '<div class="sv-izq">' +
          '<svg class="sv-gauge" viewBox="0 0 220 130" aria-label="Posición del servo">' +
            '<path d="M20 115 A90 90 0 0 1 200 115" fill="none" stroke="var(--borde)" stroke-width="10"/>' +
            '<text x="14" y="112" font-size="11" fill="var(--txt-tenue)" text-anchor="middle">0°</text>' +
            '<text x="110" y="16" font-size="11" fill="var(--txt-tenue)" text-anchor="middle">60°</text>' +
            '<text x="206" y="112" font-size="11" fill="var(--txt-tenue)" text-anchor="middle">120°</text>' +
            '<line class="sv-aguja" x1="110" y1="115" x2="110" y2="35" stroke="var(--acento)" stroke-width="4" stroke-linecap="round"/>' +
            '<circle cx="110" cy="115" r="7" fill="var(--acento)"/>' +
          '</svg>' +
          '<label class="sv-slider">Ángulo: <strong class="sv-ang">0°</strong> <small>(pasos de 20°, como el ejemplo)</small>' +
            '<input type="range" min="0" max="120" step="20" value="0">' +
          '</label>' +
        '</div>' +
        '<div class="sv-der">' +
          '<table class="cb-tabla">' +
            '<tr><td>servo.angle</td><td class="sv-ang2"></td></tr>' +
            '<tr><td>servo.value = 2·ángulo/120 − 1</td><td class="sv-value"></td></tr>' +
            '<tr><td>Ancho del pulso (1 ms + value·0,5 ms)</td><td class="sv-ancho"></td></tr>' +
            '<tr><td>Factor de servicio (ancho / 20 ms)</td><td class="sv-duty"></td></tr>' +
          '</table>' +
          '<div class="sv-onda"><div class="sv-pulso"></div><span class="sv-onda-t">periodo: 20 ms (50 Hz)</span></div>' +
          '<pre class="sv-codigo"><code class="lang-python"></code></pre>' +
        '</div>' +
      '</div>';

    var slider = el.querySelector('input[type="range"]');

    function pintar() {
      var ang = parseInt(slider.value, 10);
      var frac = (ang - ANG_MIN) / (ANG_MAX - ANG_MIN);     // 0..1 dentro del recorrido
      var value = 2 * frac - 1;                              // .value en [-1, 1]
      var ancho_ms = PULSO_MIN + frac * (PULSO_MAX - PULSO_MIN);
      var duty = ancho_ms / PERIODO * 100;

      el.querySelector('.sv-ang').textContent = ang + '°';
      el.querySelector('.sv-ang2').textContent = ang + '°';
      el.querySelector('.sv-value').textContent = num(value, 2);
      el.querySelector('.sv-ancho').textContent = num(ancho_ms, 3) + ' ms';
      el.querySelector('.sv-duty').textContent = num(duty, 1) + ' %';

      // aguja: 0° apunta a la izquierda, 60° arriba, 120° a la derecha
      el.querySelector('.sv-aguja').setAttribute('transform', 'rotate(' + (frac * 180 - 90) + ' 110 115)');
      el.querySelector('.sv-pulso').style.width = duty + '%';

      var cod = el.querySelector('.sv-codigo code');
      cod.textContent =
        'servo.angle = ' + ang + '          # value = ' + num(value, 2) +
        ' → ancho ' + num(ancho_ms, 3) + ' ms (duty ' + num(duty, 1) + ' %)';
      cod.removeAttribute('data-resaltado');
      if (MPI.resaltarTodo) MPI.resaltarTodo(el);
    }

    slider.addEventListener('input', pintar);
    pintar();
  };
})();
