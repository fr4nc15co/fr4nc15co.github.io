/*
 * Componente "sim-gpio": juega con un pin digital.
 *  - modo "led":      un interruptor escribe 0/1 en el bit de LATC y el LED
 *                     se enciende o no según el montaje (activo a nivel
 *                     alto / activo a nivel bajo).
 *  - modo "pulsador": mantén pulsado el botón y observa qué se lee en PORTB
 *                     según el montaje (pull-up / pull-down).
 *
 * Uso: <div class="mpi-mount" data-componente="sim-gpio" data-config='{"modo":"led"}'></div>
 */
window.MPI = window.MPI || {};
MPI.componentes = MPI.componentes || {};

(function () {

  function montarLed(el) {
    var montaje = 'bajo';   // como los LEDs RC0-RC3 de la placa
    var lat = 1;            // valor del bit de LATC

    el.innerHTML =
      '<div class="mpi-sim-cab">Pruébalo: ¿cuándo luce el LED?</div>' +
      '<div class="sg-cuerpo">' +
        '<div class="sg-col">' +
          '<div class="sg-radios">' +
            '<label><input type="radio" name="sg-m-led" value="alto"> Activo a nivel ALTO</label>' +
            '<label><input type="radio" name="sg-m-led" value="bajo" checked> Activo a nivel BAJO (placa)</label>' +
          '</div>' +
          '<button type="button" class="sg-interruptor" aria-label="Conmutar el bit de LATC">' +
            '<span class="sg-int-tit">LATC0</span><span class="sg-int-val">1</span>' +
            '<span class="sg-int-pista">clic para conmutar</span>' +
          '</button>' +
        '</div>' +
        '<div class="sg-col sg-centro">' +
          '<div class="sg-led"><div class="sg-led-luz"></div></div>' +
          '<div class="sg-estado"></div>' +
        '</div>' +
      '</div>' +
      '<pre class="sg-codigo"><code class="lang-c"></code></pre>';

    function pintar() {
      var encendido = (montaje === 'alto') ? lat === 1 : lat === 0;
      el.querySelector('.sg-int-val').textContent = lat;
      el.querySelector('.sg-led-luz').classList.toggle('sg-on', encendido);
      el.querySelector('.sg-estado').innerHTML =
        '<code>LATC0 = ' + lat + '</code> → LED <strong>' + (encendido ? 'ENCENDIDO' : 'apagado') + '</strong>' +
        '<br><small>' + (montaje === 'alto'
          ? 'activo a nivel alto: el pin entrega la corriente, luce con 1'
          : 'activo a nivel bajo: el pin absorbe la corriente, luce con 0') + '</small>';
      el.querySelector('.sg-codigo code').textContent = (lat === 1
        ? 'LATC |= 1 << 0;      // pone a 1 el bit 0 -> ' + (encendido ? 'enciende' : 'apaga')
        : 'LATC &= ~(1 << 0);   // pone a 0 el bit 0 -> ' + (encendido ? 'enciende' : 'apaga'));
      if (MPI.resaltarTodo) MPI.resaltarTodo(el);
    }

    el.querySelector('.sg-interruptor').addEventListener('click', function () {
      lat = 1 - lat; pintar();
    });
    el.querySelectorAll('input[name="sg-m-led"]').forEach(function (r) {
      r.addEventListener('change', function () { montaje = this.value; pintar(); });
    });
    pintar();
  }

  function montarPulsador(el) {
    var montaje = 'pullup';   // pulsador "activo a nivel bajo", el habitual
    var pulsado = false;

    el.innerHTML =
      '<div class="mpi-sim-cab">Pruébalo: ¿qué se lee en el pin?</div>' +
      '<div class="sg-cuerpo">' +
        '<div class="sg-col">' +
          '<div class="sg-radios">' +
            '<label><input type="radio" name="sg-m-pul" value="pullup" checked> Pull-up (paro/RESET)</label>' +
            '<label><input type="radio" name="sg-m-pul" value="pulldown"> Pull-down (marcha)</label>' +
          '</div>' +
          '<button type="button" class="sg-boton">PULSA<small>(mantén apretado)</small></button>' +
        '</div>' +
        '<div class="sg-col sg-centro">' +
          '<div class="sg-lectura"><span class="sg-bit">1</span><small>PORTB, bit 5</small></div>' +
          '<div class="sg-estado"></div>' +
        '</div>' +
      '</div>' +
      '<pre class="sg-codigo"><code class="lang-c"></code></pre>';

    function pintar() {
      var lectura = (montaje === 'pullup') ? (pulsado ? 0 : 1) : (pulsado ? 1 : 0);
      var bitEl = el.querySelector('.sg-bit');
      bitEl.textContent = lectura;
      bitEl.classList.toggle('sg-bit-uno', lectura === 1);
      el.querySelector('.sg-boton').classList.toggle('sg-apretado', pulsado);
      el.querySelector('.sg-estado').innerHTML =
        'Pulsador <strong>' + (pulsado ? 'APRETADO' : 'suelto') + '</strong> → se lee <code>' + lectura + '</code>' +
        '<br><small>' + (montaje === 'pullup'
          ? 'pull-up: reposo a 1, pulsado a 0 («activo a nivel bajo»)'
          : 'pull-down: reposo a 0, pulsado a 1 («activo a nivel alto»)') + '</small>';
      el.querySelector('.sg-codigo code').textContent =
        'valor = (PORTB >> 5) & 1;   // valor = ' + lectura + ' (' + (pulsado ? 'apretado' : 'suelto') + ')';
      if (MPI.resaltarTodo) MPI.resaltarTodo(el);
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
