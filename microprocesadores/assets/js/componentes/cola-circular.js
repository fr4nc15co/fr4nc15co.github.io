/*
 * Componente "cola-circular": animación paso a paso de un buffer circular.
 * Botones para escribir y leer; se ven los índices de entrada (in) y salida
 * (out), el número de elementos y, sobre todo, el momento en que los índices
 * "dan la vuelta" con el módulo: (i + 1) % TAM.
 *
 * Uso: <div class="mpi-mount" data-componente="cola-circular" data-config='{"tam":8}'></div>
 */
window.MPI = window.MPI || {};
MPI.componentes = MPI.componentes || {};

(function () {
  MPI.componentes['cola-circular'] = function (el, cfg) {
    var TAM = (cfg && cfg.tam) || 8;
    var buf, idxIn, idxOut, n, letra;

    function reinicia() {
      buf = new Array(TAM).fill(null);
      idxIn = 0; idxOut = 0; n = 0; letra = 65;  // 'A'
    }
    reinicia();

    el.classList.add('mpi-cola');
    el.innerHTML =
      '<div class="mpi-sim-cab">Cola circular de ' + TAM + ' posiciones — pruébala</div>' +
      '<div class="cc-celdas"></div>' +
      '<div class="cc-botones">' +
        '<button type="button" class="cc-poner">Escribir (ISR de recepción)</button>' +
        '<button type="button" class="cc-sacar">Leer (getsUART desde el main)</button>' +
        '<button type="button" class="cc-reset">Reiniciar</button>' +
      '</div>' +
      '<div class="cc-estado"></div>' +
      '<div class="cc-log nota"></div>';

    var celdas = el.querySelector('.cc-celdas');
    var log = el.querySelector('.cc-log');
    var estado = el.querySelector('.cc-estado');

    function pintar() {
      var html = '';
      for (var i = 0; i < TAM; i++) {
        html += '<div class="cc-col">' +
          '<div class="cc-idx">' + i + '</div>' +
          '<div class="cc-celda' + (buf[i] != null ? ' cc-llena' : '') + '">' + (buf[i] != null ? buf[i] : '') + '</div>' +
          '<div class="cc-marcas">' +
            (i === idxIn ? '<span class="cc-in">in&nbsp;▲</span>' : '') +
            (i === idxOut ? '<span class="cc-out">out&nbsp;▲</span>' : '') +
          '</div></div>';
      }
      celdas.innerHTML = html;
      estado.innerHTML = 'in = <strong>' + idxIn + '</strong> · out = <strong>' + idxOut +
        '</strong> · elementos = <strong>' + n + '</strong> de ' + TAM +
        (n === 0 ? ' — <em>cola vacía</em>' : (n === TAM ? ' — <em>¡cola llena!</em>' : ''));
    }

    el.querySelector('.cc-poner').addEventListener('click', function () {
      if (n === TAM) {
        log.innerHTML = '❌ <strong>Cola llena</strong> (elementos = TAM): el dato nuevo se descarta — en la UART real esto es un <em>overrun</em>. Hay que leer (vaciar) antes de poder escribir.';
        return;
      }
      var d = String.fromCharCode(letra);
      letra = letra >= 90 ? 65 : letra + 1;
      var ant = idxIn;
      buf[idxIn] = d;
      idxIn = (idxIn + 1) % TAM;
      n++;
      log.innerHTML = 'Escrito <strong>«' + d + '»</strong> en <code>cola[' + ant + ']</code>; ' +
        'in pasa de ' + ant + ' a <strong>' + idxIn + '</strong> con <code>in = (in + 1) % ' + TAM + '</code>' +
        (idxIn === 0 ? ' — <strong>¡ha dado la vuelta!</strong> (' + ant + ' + 1 = ' + TAM + ', y ' + TAM + ' % ' + TAM + ' = 0)' : '') + '.';
      pintar();
    });

    el.querySelector('.cc-sacar').addEventListener('click', function () {
      if (n === 0) {
        log.innerHTML = '❌ <strong>Cola vacía</strong> (elementos = 0): no hay nada que leer. La función del main debe comprobarlo antes (o devolver un código de «sin datos»).';
        return;
      }
      var ant = idxOut;
      var d = buf[idxOut];
      buf[idxOut] = null;
      idxOut = (idxOut + 1) % TAM;
      n--;
      log.innerHTML = 'Leído <strong>«' + d + '»</strong> de <code>cola[' + ant + ']</code>; ' +
        'out pasa de ' + ant + ' a <strong>' + idxOut + '</strong> con <code>out = (out + 1) % ' + TAM + '</code>' +
        (idxOut === 0 ? ' — <strong>¡ha dado la vuelta!</strong>' : '') +
        '. Fíjate: los datos salen en el mismo orden en que entraron (FIFO).';
      pintar();
    });

    el.querySelector('.cc-reset').addEventListener('click', function () {
      reinicia();
      log.innerHTML = 'Cola reiniciada. Escribe unas cuantas letras, lee algunas y sigue escribiendo hasta ver a los índices <strong>dar la vuelta</strong>: eso es lo «circular».';
      pintar();
    });

    log.innerHTML = 'La cola es un vector normal de ' + TAM + ' posiciones; lo «circular» está en los índices: ' +
      'al avanzar usan <code>% ' + TAM + '</code>, así que después de la posición ' + (TAM - 1) + ' viene la 0. ' +
      'Escribe la ISR (productor) y lee el main (consumidor).';
    pintar();
  };
})();
