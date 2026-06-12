/*
 * Componente "calc-baudios": calculadora del generador de baudios de la UART.
 * Para los baudios deseados calcula U1BRG con BRGH = 0 (÷16) y BRGH = 1 (÷4),
 * la velocidad real y el error, y decide qué BRGH usar con la regla del curso:
 * BRGH = 0 si su error es < 2 %; si no, BRGH = 1.
 *
 * Uso: <div class="mpi-mount" data-componente="calc-baudios" data-config='{}'></div>
 */
window.MPI = window.MPI || {};
MPI.componentes = MPI.componentes || {};

(function () {
  var PBCLK = 5000000;

  function num(x, dec) { return x.toFixed(dec).replace('.', ','); }

  function calcula(baud, div) {
    var exacto = PBCLK / (div * baud) - 1;
    var brg = Math.round(exacto);
    if (brg < 0) brg = 0;
    var real = PBCLK / (div * (brg + 1));
    var err = (real - baud) / baud * 100;
    return { exacto: exacto, brg: brg, real: real, err: err };
  }

  MPI.componentes['calc-baudios'] = function (el, cfg) {
    el.classList.add('mpi-calc-baud');
    el.innerHTML =
      '<div class="mpi-sim-cab">Calculadora del generador de baudios (PBCLK = 5 MHz)</div>' +
      '<div class="cb-controles"><label>Baudios deseados ' +
        '<select class="cb-baud"><option selected>9600</option><option>19200</option>' +
        '<option>115200</option></select></label></div>' +
      '<div class="cb-tarjetas"></div>' +
      '<div class="cb-veredicto"></div>' +
      '<pre class="cb-codigo"><code class="lang-c"></code></pre>';

    var sel = el.querySelector('.cb-baud');

    function pintar() {
      var baud = parseInt(sel.value, 10);
      var m0 = calcula(baud, 16);   // BRGH = 0
      var m1 = calcula(baud, 4);    // BRGH = 1

      function tarjeta(titulo, div, m, elegido) {
        return '<div class="cb-tarjeta' + (elegido ? ' cb-elegida' : '') + '">' +
          '<h4>' + titulo + ' <small>(divide entre ' + div + ')</small></h4>' +
          '<table class="cb-tabla">' +
          '<tr><td>U1BRG exacto</td><td>' + num(m.exacto, 2) + '</td></tr>' +
          '<tr><td>U1BRG (redondeado)</td><td><strong>' + m.brg + '</strong></td></tr>' +
          '<tr><td>Baudios reales</td><td>' + num(m.real, 1) + '</td></tr>' +
          '<tr><td>Error</td><td class="' + (Math.abs(m.err) < 2 ? 'cb-ok' : 'cb-mal') + '">' +
            (m.err >= 0 ? '+' : '') + num(m.err, 2) + ' %</td></tr>' +
          '</table>' + (elegido ? '<div class="cb-sello">elegido</div>' : '') + '</div>';
      }

      var usaBRGH0 = Math.abs(m0.err) < 2;
      var elegido = usaBRGH0 ? m0 : m1;
      var brgh = usaBRGH0 ? 0 : 1;

      el.querySelector('.cb-tarjetas').innerHTML =
        tarjeta('BRGH = 0', 16, m0, usaBRGH0) + tarjeta('BRGH = 1', 4, m1, !usaBRGH0);

      var veredicto;
      if (usaBRGH0 && Math.abs(m1.err) < 2) {
        var menor = Math.abs(m1.err) < Math.abs(m0.err) ? 1 : 0;
        veredicto = 'Los <strong>dos</strong> modos bajan del 2 % (BRGH = 0: ' +
          num(Math.abs(m0.err), 2) + ' %, BRGH = 1: ' + num(Math.abs(m1.err), 2) +
          ' %), así que aquí hay una <strong>decisión de diseño</strong>: preferir el modo de ' +
          'menor velocidad (BRGH = 0, el estándar) o el de menor error (aquí BRGH = ' + menor +
          '). En el curso, mientras BRGH = 0 cumpla, se usa BRGH = 0.';
      } else if (usaBRGH0) {
        veredicto = 'El error con BRGH = 0 es <strong>' + num(Math.abs(m0.err), 2) +
          ' % &lt; 2 %</strong> → se usa <strong>BRGH = 0</strong> (la regla del curso: solo se pasa a BRGH = 1 cuando hace falta).';
      } else if (Math.abs(m1.err) < 2) {
        veredicto = 'Con BRGH = 0 el error sería ' + num(Math.abs(m0.err), 2) +
          ' % ≥ 2 % (la trama se desincroniza antes del bit de stop) → se usa <strong>BRGH = 1</strong>, que divide menos y afina más: error ' +
          num(Math.abs(m1.err), 2) + ' %.';
      } else {
        veredicto = '¡Ojo! Ningún modo baja del 2 % (BRGH = 0: ' + num(Math.abs(m0.err), 2) +
          ' %, BRGH = 1: ' + num(Math.abs(m1.err), 2) + ' %). Esta velocidad no es fiable con PBCLK = 5 MHz.';
      }
      el.querySelector('.cb-veredicto').innerHTML = '<div class="nota">' + veredicto + '</div>';

      var cod = el.querySelector('.cb-codigo code');
      cod.textContent =
        'U1MODEbits.BRGH = ' + brgh + ';   // divisor ' + (brgh ? '4' : '16') + '\n' +
        'U1BRG = ' + elegido.brg + ';            // ' + num(elegido.real, 1) +
        ' baudios reales (error ' + (elegido.err >= 0 ? '+' : '') + num(elegido.err, 2) + ' %)';
      if (MPI.resaltarTodo) MPI.resaltarTodo(el);
    }

    sel.addEventListener('change', pintar);
    pintar();
  };
})();
