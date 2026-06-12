/*
 * Componente "sim-adc-sensor": el AD en acción con un sensor de luz.
 * Mueve la luz ambiente → el sensor (LDR en divisor) genera una tensión
 * analógica Vin → el AD de 10 bits la convierte en un número D. Se ven la
 * cadena completa, los 10 bits, el escalón de cuantización (q ≈ 3,22 mV con
 * Vref = 3,3 V) y el error de la medida. Coherente con las fórmulas del tema:
 *   D = round(Vin / q),  q = Vref / 2^10,  Vrec = D·q.
 *
 * Uso: <div class="mpi-mount" data-componente="sim-adc-sensor" data-config='{}'></div>
 */
window.MPI = window.MPI || {};
MPI.componentes = MPI.componentes || {};

(function () {
  var VREF = 3.3, N = 10, NIV = 1 << N;   // 1024 niveles
  var Q = VREF / NIV;                       // escalón ≈ 3,22 mV

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
      '<div class="mpi-sim-cab">El AD en acción: un sensor de luz (Vref = 3,3 V · 10 bits)</div>' +
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
        '</div>' +
        '<div class="as-flecha">→<small>el sensor da una<br>tensión analógica</small></div>' +
        '<div class="as-analog">' +
          '<div class="as-gauge"><div class="as-nivel"></div></div>' +
          '<div class="as-vin">V<sub>in</sub> = <strong>—</strong></div>' +
        '</div>' +
        '<div class="as-flecha">→<small>el AD la convierte<br>en un número</small></div>' +
        '<div class="as-digital">' +
          '<div class="as-chip">AD 10 bits</div>' +
          '<div class="as-bits"></div>' +
          '<div class="as-num"></div>' +
        '</div>' +
      '</div>' +
      '<div class="as-detalle nota"></div>' +
      '<pre class="as-codigo"><code class="lang-c"></code></pre>';

    var slider = el.querySelector('input[type=range]');

    function pintar() {
      var luz = parseInt(slider.value, 10);
      var vin = luz / 100 * VREF;
      var D = Math.min(NIV - 1, Math.round(vin / Q));
      var vrec = D * Q;
      var err = (vin - vrec) * 1000;   // mV

      el.querySelector('.as-luz').textContent = luz + ' %';
      el.querySelector('.as-disco').style.opacity = (0.25 + 0.75 * luz / 100).toFixed(2);
      el.querySelector('.as-rayos').style.opacity = (0.15 + 0.85 * luz / 100).toFixed(2);
      el.querySelector('.as-nivel').style.height = (vin / VREF * 100) + '%';
      el.querySelector('.as-vin').innerHTML = 'V<sub>in</sub> = <strong>' + fmtV(vin) + '</strong>';

      var b = bin10(D), bits = '';
      for (var i = 0; i < 10; i++) {
        var on = b.charAt(i) === '1';
        bits += '<span class="as-bit' + (on ? ' as-on' : '') + '" title="bit ' + (9 - i) + '">' + b.charAt(i) + '</span>';
      }
      el.querySelector('.as-bits').innerHTML = bits;
      el.querySelector('.as-num').innerHTML =
        'D = <strong>' + D + '</strong> <small>(' + hex(D) + ')</small>';

      el.querySelector('.as-detalle').innerHTML =
        'El AD reparte el rango 0–3,3 V en <strong>1024 escalones</strong> de ' +
        'q = 3,3 V / 1024 ≈ <strong>3,22 mV</strong>. Con V<sub>in</sub> = ' + fmtV(vin) +
        ' el código más cercano es <strong>D = round(V<sub>in</sub> / q) = ' + D + '</strong>. ' +
        'Ese número representa la tensión ' + fmtV(vrec) + ', así que se pierde un ' +
        '<strong>error de cuantización</strong> de ' + (err >= 0 ? '+' : '') +
        err.toFixed(2).replace('.', ',') + ' mV (siempre &lt; q/2 ≈ 1,61 mV). ' +
        'Mueve la luz despacio: D solo cambia <em>a saltos</em> de uno en uno — eso es la cuantización.';

      el.querySelector('.as-codigo code').textContent =
        'uint16_t D = ADC1BUF0;            // = ' + D + '\n' +
        'float voltios = D * 3.3 / 1024;   // = ' + vrec.toFixed(3).replace('.', ',') + ' V\n' +
        'float lux = voltios * ESCALA;     // segun el sensor';
      if (MPI.resaltarTodo) MPI.resaltarTodo(el);
    }

    slider.addEventListener('input', pintar);
    pintar();
  };
})();
