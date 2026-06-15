/*
 * Componente "trama-uart": visualizador de la trama serie asíncrona de la
 * Raspberry Pi 4. Eliges el formato (datos + paridad), los bits de stop y los
 * baudios, y ves la trama dibujada, cuántos bits ocupa y cuánto dura cada bit
 * y la trama completa. En pyserial el formato por defecto es 8N1 a 115200.
 *
 * Uso: <div class="mpi-mount" data-componente="trama-uart" data-config='{}'></div>
 */
window.MPI = window.MPI || {};
MPI.componentes = MPI.componentes || {};

(function () {
  var FORMATOS = [
    { id: '8N', datos: 8, paridad: null,    txt: '8 datos, sin paridad (8N — por defecto)' },
    { id: '8E', datos: 8, paridad: 'par',   txt: '8 datos, paridad par (8E)' },
    { id: '8O', datos: 8, paridad: 'impar', txt: '8 datos, paridad impar (8O)' },
    { id: '7E', datos: 7, paridad: 'par',   txt: '7 datos, paridad par (7E)' }
  ];
  var BAUDIOS = [1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200];

  function fmtTiempo(seg) {
    if (seg >= 1e-3) return (seg * 1e3).toFixed(2).replace('.', ',') + ' ms';
    return (seg * 1e6).toFixed(1).replace('.', ',') + ' µs';
  }

  MPI.componentes['trama-uart'] = function (el, cfg) {
    el.classList.add('mpi-trama');
    el.innerHTML =
      '<div class="mpi-sim-cab">Anatomía de la trama serie asíncrona</div>' +
      '<div class="tr-controles">' +
        '<label>Datos y paridad <select class="tr-fmt"></select></label>' +
        '<label>Bits de stop <select class="tr-stop"><option value="1" selected>1</option><option value="2">2</option></select></label>' +
        '<label>Baudios <select class="tr-baud"></select></label>' +
      '</div>' +
      '<div class="tr-linea"></div>' +
      '<div class="tr-info"></div>';

    var selFmt = el.querySelector('.tr-fmt');
    var selStop = el.querySelector('.tr-stop');
    var selBaud = el.querySelector('.tr-baud');
    FORMATOS.forEach(function (f, i) {
      var o = document.createElement('option');
      o.value = i; o.textContent = f.txt;
      selFmt.appendChild(o);
    });
    BAUDIOS.forEach(function (b) {
      var o = document.createElement('option');
      o.value = b; o.textContent = b;
      if (b === 115200) o.selected = true;
      selBaud.appendChild(o);
    });

    function pintar() {
      var f = FORMATOS[parseInt(selFmt.value, 10)];
      var stops = parseInt(selStop.value, 10);
      var baud = parseInt(selBaud.value, 10);

      var bits = [{ cls: 'reposo', txt: '1', tit: 'Línea en reposo (nivel alto)' },
                  { cls: 'start', txt: 'S', tit: 'Bit de start (siempre 0): su flanco de bajada sincroniza al receptor' }];
      for (var i = 0; i < f.datos; i++) {
        bits.push({ cls: 'dato', txt: 'D' + i, tit: 'Bit de datos ' + i + ' (primero el menos significativo)' });
      }
      if (f.paridad) bits.push({ cls: 'paridad', txt: 'P', tit: 'Bit de paridad ' + f.paridad });
      for (var s = 0; s < stops; s++) bits.push({ cls: 'stop', txt: 'T', tit: 'Bit de stop (siempre 1)' });
      bits.push({ cls: 'reposo', txt: '1', tit: 'Línea en reposo hasta la siguiente trama' });

      var linea = el.querySelector('.tr-linea');
      linea.innerHTML = bits.map(function (b) {
        return '<span class="tr-bit tr-' + b.cls + '" title="' + b.tit + '">' + b.txt + '</span>';
      }).join('');

      var nBits = 1 + f.datos + (f.paridad ? 1 : 0) + stops;   // sin contar reposo
      var tBit = 1 / baud, tTrama = nBits / baud;
      var nombre = f.datos + (f.paridad ? (f.paridad === 'par' ? 'E' : 'O') : 'N') + stops;
      var eficiencia = Math.round(100 * f.datos / nBits);

      el.querySelector('.tr-info').innerHTML =
        '<p>Formato <strong>' + nombre + '</strong>: la trama ocupa <strong>' + nBits + ' bits</strong> ' +
        '(1 start + ' + f.datos + ' datos' + (f.paridad ? ' + 1 paridad' : '') + ' + ' + stops + ' stop).</p>' +
        '<p>La señal UART es binaria, así que <strong>1 baudio = 1 bit/s</strong>: a ' + baud +
        ' baudios cada bit dura <strong>1/' + baud + ' s = ' + fmtTiempo(tBit) + '</strong> ' +
        'y la trama completa <strong>' + fmtTiempo(tTrama) + '</strong>.</p>' +
        '<p>De cada ' + nBits + ' bits transmitidos solo ' + f.datos + ' son datos útiles: eficiencia ' +
        '<strong>' + eficiencia + '&nbsp;%</strong> (máximo ' + Math.floor(baud / nBits) + ' caracteres/s).</p>' +
        '<p class="tr-py"><code class="lang-python">Serial("/dev/serial0", ' + baud + ')' +
        (f.id === '8N' && stops === 1 ? '   # 8N1, el formato por defecto' : '') + '</code></p>';

      if (MPI.resaltarTodo) MPI.resaltarTodo(el);
    }

    selFmt.addEventListener('change', pintar);
    selStop.addEventListener('change', pintar);
    selBaud.addEventListener('change', pintar);
    pintar();
  };
})();
