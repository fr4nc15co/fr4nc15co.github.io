/*
 * Componente "sim-adc-sensor": el A/D en acción, con un sensor de luz, ANTES
 * de entrar en registros y tiempos. Mueve la luz ambiente -> una LDR montada
 * en divisor de tensión (en un pin analógico libre, p. ej. AN0/RA0) da una
 * tensión Vin -> el conversor A/D interno del dsPIC (10 bits, Vref = 3,3 V)
 * la convierte en un código D. Se ve la cadena completa, los 10 bits y el
 * error de cuantización. Mismas fórmulas que el resto del tema (11.1):
 *   D = round(Vin / Vref · 1023),  q ≈ Vref / 1023 ≈ 3,23 mV,  Vrec = D·q.
 *
 * Adaptado del componente "sim-adc-sensor" de la web de Sistemas Electrónicos
 * (mismo patrón visual: luz -> sensor -> A/D), pero con el conversor interno
 * del dsPIC33FJ32MC202 (get_ad) en vez de un MCP3008 externo por SPI/Python.
 *
 * Uso: <div class="mpi-mount" data-componente="sim-adc-sensor" data-config='{}'></div>
 */
window.MPI = window.MPI || {};
MPI.componentes = MPI.componentes || {};

(function () {
  var VREF = 3.3, MAXN = 1023;
  var Q = VREF / MAXN;   // escalón ≈ 3,23 mV (igual que el resto de 11.1)

  function fmtV(v) {
    return v >= 1 ? v.toFixed(3).replace('.', ',') + ' V'
                  : (v * 1000).toFixed(1).replace('.', ',') + ' mV';
  }
  function bin10(d) {
    var s = (d >>> 0).toString(2);
    while (s.length < 10) s = '0' + s;
    return s;
  }
  function hex(d) {
    var s = d.toString(16).toUpperCase();
    while (s.length < 3) s = '0' + s;
    return '0x' + s;
  }

  MPI.componentes['sim-adc-sensor'] = function (el, cfg) {
    el.classList.add('mpi-adc-sensor');
    el.innerHTML =
      '<div class="mpi-sim-cab">El A/D en acción: un sensor de luz (V<sub>ref</sub> = 3,3 V · 10 bits)</div>' +
      '<div class="as-escena">' +
        '<div class="as-fuente">' +
          '<svg viewBox="0 0 90 90" class="as-sol" aria-hidden="true">' +
            '<g class="as-rayos" stroke="var(--amarillo)" stroke-width="3" stroke-linecap="round">' +
              '<line x1="45" y1="6"  x2="45" y2="18"/><line x1="45" y1="72" x2="45" y2="84"/>' +
              '<line x1="6"  y1="45" x2="18" y2="45"/><line x1="72" y1="45" x2="84" y2="45"/>' +
              '<line x1="17" y1="17" x2="26" y2="26"/><line x1="64" y1="64" x2="73" y2="73"/>' +
              '<line x1="17" y1="73" x2="26" y2="64"/><line x1="64" y1="26" x2="73" y2="17"/>' +
            '</g>' +
            '<circle class="as-disco" cx="45" cy="45" r="16" fill="var(--amarillo)"/>' +
          '</svg>' +
          '<label class="as-slider">Luz ambiente: <strong class="as-luz">50 %</strong>' +
            '<input type="range" min="0" max="100" value="50"></label>' +
          '<small class="as-pie">LDR + resistencia fija, en divisor sobre AN0 (RA0, libre en la PicTrainer)</small>' +
        '</div>' +
        '<div class="as-flecha">→<small>el sensor da una<br>tensión analógica</small></div>' +
        '<div class="as-analog">' +
          '<div class="as-gauge"><div class="as-nivel"></div></div>' +
          '<div class="as-vin">V<sub>in</sub> (AN0) = <strong>—</strong></div>' +
        '</div>' +
        '<div class="as-flecha">→<small>el A/D la convierte<br>en un número</small></div>' +
        '<div class="as-digital">' +
          '<div class="as-chip">A/D del dsPIC</div>' +
          '<div class="as-bits"></div>' +
          '<div class="as-num"></div>' +
        '</div>' +
      '</div>' +
      '<div class="as-detalle"></div>' +
      '<pre class="as-codigo"><code class="lang-c"></code></pre>';

    var slider = el.querySelector('input[type=range]');

    function pintar() {
      var luz = parseInt(slider.value, 10);
      var vin = luz / 100 * VREF;
      var D = Math.min(MAXN, Math.round(vin / VREF * MAXN));
      var vrec = D * Q;
      var err = (vin - vrec) * 1000;   // mV

      el.querySelector('.as-luz').textContent = luz + ' %';
      el.querySelector('.as-disco').style.opacity = (0.25 + 0.75 * luz / 100).toFixed(2);
      el.querySelector('.as-rayos').style.opacity = (0.15 + 0.85 * luz / 100).toFixed(2);
      el.querySelector('.as-nivel').style.transform = 'scaleY(' + (vin / VREF).toFixed(4) + ')';
      el.querySelector('.as-vin').innerHTML = 'V<sub>in</sub> (AN0) = <strong>' + fmtV(vin) + '</strong>';

      var b = bin10(D), bits = '';
      for (var i = 0; i < 10; i++) {
        var on = b.charAt(i) === '1';
        bits += '<span class="as-bit' + (on ? ' as-on' : '') + '" title="bit ' + (9 - i) + '">' + b.charAt(i) + '</span>';
      }
      el.querySelector('.as-bits').innerHTML = bits;
      el.querySelector('.as-num').innerHTML =
        'D = <strong>' + D + '</strong> <small>(' + hex(D) + ')</small>';

      el.querySelector('.as-detalle').innerHTML =
        'El A/D reparte el rango 0–3,3 V en <strong>1023 escalones</strong> de q ≈ <strong>3,23 mV</strong> cada uno. ' +
        'Con V<sub>in</sub> = ' + fmtV(vin) + ' el código más cercano es <strong>D = round(V<sub>in</sub>/V<sub>ref</sub> · 1023) = ' + D +
        '</strong>, que representa ' + fmtV(vrec) + ': se pierde un <strong>error de cuantización</strong> de ' +
        (err >= 0 ? '+' : '') + err.toFixed(2).replace('.', ',') + ' mV (siempre menor que medio escalón, ≈ 1,6 mV). ' +
        'Mueve la luz despacio: D solo cambia <em>a saltos</em> de uno en uno — eso es cuantizar. Con ese número ya se puede decidir algo en C, ' +
        'por ejemplo encender un LED cuando D cae por debajo de un umbral (ha oscurecido).';

      var cod = el.querySelector('.as-codigo code');
      cod.textContent =
        'init_ad(0x01);            // deja AN0 (RA0) como único canal analógico\n' +
        '\n' +
        'int D = get_ad(0);        // código de 10 bits (0 ... 1023) -> ' + D + '\n' +
        'if (D < 200) {            // poco código = poca tensión = ha oscurecido\n' +
        '    /* encender un LED, por ejemplo */\n' +
        '}';
      cod.removeAttribute('data-resaltado');
      if (MPI.resaltarTodo) MPI.resaltarTodo(el);
    }

    slider.addEventListener('input', pintar);
    pintar();
  };
})();
