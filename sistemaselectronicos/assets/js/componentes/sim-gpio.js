/*
 * Componente "sim-gpio": juega con un pin digital de la Raspberry Pi 4 + iMAT HAT.
 *  - modo "led":      un interruptor escribe 0/1 en un pin GPIO y el LED se
 *                     enciende o no según el montaje. En la iMAT HAT los 8 LEDs
 *                     (GPIO20-GPIO27) están en pull-down -> activos a nivel ALTO.
 *  - modo "pulsador": mantén pulsado el botón y observa el NIVEL ELÉCTRICO que
 *                     se lee en el pin según el montaje. En la iMAT HAT los 4
 *                     pulsadores (GPIO7/16/17/19) están en pull-up -> activos a
 *                     nivel BAJO (reposo 1, pulsado 0).
 *
 * El código mostrado usa RPi.GPIO, que lee/escribe el nivel del pin tal cual.
 * Para el pulsador se aclara que gpiozero (boton.value) abstrae el montaje y
 * devuelve 1 si está pulsado y 0 si no, sea cual sea la resistencia.
 *
 * Uso: <div class="mpi-mount" data-componente="sim-gpio" data-config='{"modo":"led"}'></div>
 */
window.MPI = window.MPI || {};
MPI.componentes = MPI.componentes || {};

(function () {

  // Re-resalta el bloque de código en cada actualización (resaltarTodo marca
  // data-resaltado y, si no lo quitamos, no volvería a colorear tras un cambio).
  function pintarCodigo(el, sel, texto) {
    var code = el.querySelector(sel);
    code.textContent = texto;
    code.removeAttribute('data-resaltado');
    if (MPI.resaltarTodo) MPI.resaltarTodo(el);
  }

  function montarLed(el) {
    var montaje = 'alto';   // iMAT HAT: LEDs en pull-down -> activos a nivel ALTO
    var pin = 1;            // valor lógico escrito en el GPIO (0/1)

    el.innerHTML =
      '<div class="mpi-sim-cab">Pruébalo: ¿cuándo luce el LED?</div>' +
      '<div class="sg-cuerpo">' +
        '<div class="sg-col">' +
          '<div class="sg-radios">' +
            '<label><input type="radio" name="sg-m-led" value="alto" checked> Activo a nivel ALTO (iMAT HAT)</label>' +
            '<label><input type="radio" name="sg-m-led" value="bajo"> Activo a nivel BAJO</label>' +
          '</div>' +
          '<button type="button" class="sg-interruptor" aria-label="Conmutar el valor del pin GPIO20">' +
            '<span class="sg-int-tit">GPIO20</span><span class="sg-int-val">1</span>' +
            '<span class="sg-int-pista">clic para conmutar</span>' +
          '</button>' +
        '</div>' +
        '<div class="sg-col sg-centro">' +
          '<div class="sg-led"><div class="sg-led-luz"></div></div>' +
          '<div class="sg-estado"></div>' +
        '</div>' +
      '</div>' +
      '<pre class="sg-codigo"><code class="lang-python"></code></pre>';

    function pintar() {
      var encendido = (montaje === 'alto') ? pin === 1 : pin === 0;
      el.querySelector('.sg-int-val').textContent = pin;
      el.querySelector('.sg-led-luz').classList.toggle('sg-on', encendido);
      el.querySelector('.sg-estado').innerHTML =
        '<code>GPIO20 = ' + pin + '</code> → LED <strong>' + (encendido ? 'ENCENDIDO' : 'apagado') + '</strong>' +
        '<br><small>' + (montaje === 'alto'
          ? 'activo a nivel alto: el ánodo va al pin, que entrega corriente; luce con 1'
          : 'activo a nivel bajo: el cátodo va al pin, que absorbe corriente; luce con 0') + '</small>' +
        '<br><small>con gpiozero: <code>LED(20' + (montaje === 'alto' ? '' : ', active_high=False') + ').' + (encendido ? 'on()' : 'off()') + '</code> (abstrae el nivel del pin)</small>';
      pintarCodigo(el, '.sg-codigo code',
        'import RPi.GPIO as GPIO\n' +
        'GPIO.setup(20, GPIO.OUT)\n' +
        'GPIO.output(20, GPIO.' + (pin === 1 ? 'HIGH' : 'LOW') + ')   # pin a ' + pin + ' → LED ' + (encendido ? 'ENCENDIDO' : 'apagado'));
    }

    el.querySelector('.sg-interruptor').addEventListener('click', function () {
      pin = 1 - pin; pintar();
    });
    el.querySelectorAll('input[name="sg-m-led"]').forEach(function (r) {
      r.addEventListener('change', function () { montaje = this.value; pintar(); });
    });
    pintar();
  }

  function montarPulsador(el) {
    var montaje = 'pullup';   // iMAT HAT: pulsadores en pull-up -> activos a nivel bajo
    var pulsado = false;

    el.innerHTML =
      '<div class="mpi-sim-cab">Pruébalo: ¿qué nivel se lee en el pin?</div>' +
      '<div class="sg-cuerpo">' +
        '<div class="sg-col">' +
          '<div class="sg-radios">' +
            '<label><input type="radio" name="sg-m-pul" value="pullup" checked> Pull-up (iMAT HAT · paro/RESET)</label>' +
            '<label><input type="radio" name="sg-m-pul" value="pulldown"> Pull-down (marcha)</label>' +
          '</div>' +
          '<button type="button" class="sg-boton">PULSA<small>(mantén apretado)</small></button>' +
        '</div>' +
        '<div class="sg-col sg-centro">' +
          '<div class="sg-lectura"><span class="sg-bit">1</span><small>GPIO16 (nivel del pin)</small></div>' +
          '<div class="sg-estado"></div>' +
        '</div>' +
      '</div>' +
      '<pre class="sg-codigo"><code class="lang-python"></code></pre>';

    function pintar() {
      var nivel = (montaje === 'pullup') ? (pulsado ? 0 : 1) : (pulsado ? 1 : 0);  // nivel eléctrico crudo
      var valueGz = pulsado ? 1 : 0;   // gpiozero: 1 si pulsado, 0 si no (abstrae el montaje)
      var bitEl = el.querySelector('.sg-bit');
      bitEl.textContent = nivel;
      bitEl.classList.toggle('sg-bit-uno', nivel === 1);
      el.querySelector('.sg-boton').classList.toggle('sg-apretado', pulsado);
      el.querySelector('.sg-estado').innerHTML =
        'Pulsador <strong>' + (pulsado ? 'APRETADO' : 'suelto') + '</strong> → en el pin hay un <code>' + nivel + '</code>' +
        '<br><small>' + (montaje === 'pullup'
          ? 'pull-up: reposo a 1, pulsado a 0 («activo a nivel bajo»)'
          : 'pull-down: reposo a 0, pulsado a 1 («activo a nivel alto»)') + '</small>' +
        '<br><small>con gpiozero: <code>boton.value = ' + valueGz + '</code> (siempre 1 si pulsado, 0 si no, sea cual sea el montaje)</small>';
      pintarCodigo(el, '.sg-codigo code',
        'import RPi.GPIO as GPIO\n' +
        'GPIO.setup(16, GPIO.IN, pull_up_down=GPIO.' + (montaje === 'pullup' ? 'PUD_UP' : 'PUD_DOWN') + ')\n' +
        'nivel = GPIO.input(16)   # nivel = ' + nivel + ' (' + (pulsado ? 'apretado' : 'suelto') + ')');
    }

    var btn = el.querySelector('.sg-boton');
    function aprieta(e) { e.preventDefault(); pulsado = true; pintar(); }
    function suelta() { if (pulsado) { pulsado = false; pintar(); } }
    btn.addEventListener('pointerdown', aprieta);
    btn.addEventListener('pointerup', suelta);
    btn.addEventListener('pointerleave', suelta);
    btn.addEventListener('keydown', function (e) { if (e.key === ' ' || e.key === 'Enter') aprieta(e); });
    btn.addEventListener('keyup', function (e) { if (e.key === ' ' || e.key === 'Enter') suelta(); });

    el.querySelectorAll('input[name="sg-m-pul"]').forEach(function (r) {
      r.addEventListener('change', function () { montaje = this.value; pintar(); });
    });
    pintar();
  }

  MPI.componentes['sim-gpio'] = function (el, cfg) {
    el.classList.add('mpi-sim-gpio');
    if (cfg && cfg.modo === 'pulsador') montarPulsador(el);
    else montarLed(el);
  };
})();
