/*
 * Componente "sim-i2c-driver": transferencias I2C (lectura/escritura de registros).
 * Configura dirección, bytes a escribir, bytes a leer, y simula el flujo del bus
 * mostrando Start, dirección+R/W, bytes, ACK/NACK y Stop. Recorre paso a paso
 * viendo qué byte viaja, quién genera el ACK y la línea C resaltada.
 *
 * Uso: <div class="mpi-mount" data-componente="sim-i2c-driver" data-config='{}'></div>
 */
window.MPI = window.MPI || {};
MPI.componentes = MPI.componentes || {};

(function () {
  function hex2(v) {
    var s = (v & 0xFF).toString(16).toUpperCase();
    return '0x' + (s.length < 2 ? '0' + s : s);
  }

  MPI.componentes['sim-i2c-driver'] = function (el, cfg) {
    var addr = 0x13, regAddr = 0x81, nWrite = 1, nRead = 1, presente = true;
    var pasos = [], i = -1, timer = null;

    el.classList.add('mpi-i2c-driver');
    el.innerHTML =
      '<div class="mpi-sim-cab">Transferencia I²C: escribir y leer registros</div>' +
      '<div class="id-controles">' +
        '<label>Dirección esclavo <input type="number" class="id-addr" min="0" max="127" value="19"> <span class="id-hex"></span></label>' +
        '<label>Bytes a escribir <input type="number" class="id-nwrite" min="1" max="4" value="1"> (dirección + registros)</label>' +
        '<label>Bytes a leer <input type="number" class="id-nread" min="1" max="4" value="1"></label>' +
        '<label class="id-pres"><input type="checkbox" class="id-presente" checked> Esclavo conectado y responde</label>' +
      '</div>' +
      '<div class="id-cuerpo">' +
        '<pre class="id-codigo"><code class="lang-c"></code></pre>' +
        '<div class="id-bus">' +
          '<div class="id-bustit">Bus I²C (secuencia de bytes)</div>' +
          '<div class="id-log"></div>' +
          '<div class="id-result"></div>' +
        '</div>' +
      '</div>' +
      '<div class="id-msg nota"></div>' +
      '<div class="id-botones">' +
        '<button type="button" class="id-paso">Siguiente ▶</button>' +
        '<button type="button" class="id-auto">Auto ⏩</button>' +
        '<button type="button" class="id-reset">Reiniciar ↺</button>' +
      '</div>';

    var inAddr = el.querySelector('.id-addr');
    var inNWrite = el.querySelector('.id-nwrite');
    var inNRead = el.querySelector('.id-nread');
    var chk = el.querySelector('.id-presente');

    function datoMock(idx) { return (regAddr + idx * 7 + 0x11) & 0xFF; }

    function construir() {
      var wB = (addr << 1) & 0xFF, rB = ((addr << 1) | 1) & 0xFF;
      pasos = [];

      pasos.push({ linea: 1, call: 'I2C1GeneraStart();',
        bus: 'S', tipo: 'ctrl', ok: true,
        desc: 'Condición de <strong>START</strong>: el maestro toma el bus.' });

      pasos.push({ linea: 2, call: 'I2C1EscribeByte(' + hex2(addr) + ' &lt;&lt; 1);',
        bus: 'W ' + hex2(wB), tipo: 'tx', ack: presente ? 0 : 1, ok: presente,
        desc: 'Dirección + R/W = 0 (escritura): ' + hex2(wB) + '. ' +
          (presente ? 'Esclavo responde ACK=0.' : 'NACK=1: no hay esclavo. Abortamos.') });

      if (!presente) {
        pasos.push({ linea: 9, call: 'I2C1GeneraStop();  // error',
          bus: 'P', tipo: 'ctrl', ok: false,
          desc: 'Stop. El main retorna con error.' });
      } else {
        // Bytes de escritura (registro + datos)
        for (var w = 0; w < nWrite; w++) {
          var dato = datoMock(w);
          pasos.push({ linea: 3 + w, call: 'I2C1EscribeByte(' + hex2(dato) + ');',
            bus: hex2(dato), tipo: 'tx', ack: 0, ok: true,
            desc: (w === 0 ? 'Dirección del registro interno' : 'Byte de datos ' + w) +
              ' (' + hex2(dato) + '). ACK=0.' });
        }

        // Si leemos algo, repeated start
        if (nRead > 0) {
          pasos.push({ linea: 4 + nWrite, call: 'I2C1GeneraReStart();',
            bus: 'RS', tipo: 'ctrl', ok: true,
            desc: '<strong>Repeated START</strong>: cambia a lectura sin soltar el bus.' });

          pasos.push({ linea: 5 + nWrite, call: 'I2C1EscribeByte(' + hex2(addr) + ' &lt;&lt; 1 | 1);',
            bus: 'R ' + hex2(rB), tipo: 'tx', ack: 0, ok: true,
            desc: 'Dirección + R/W = 1 (lectura): ' + hex2(rB) + '. ACK=0.' });

          // Bytes de lectura
          for (var r = 0; r < nRead; r++) {
            var leido = datoMock(r);
            var esUltimo = (r === nRead - 1);
            pasos.push({ linea: 6 + nWrite + r, call: 'dato' + (r > 0 ? '[' + r + ']' : '') + ' = I2C1LeeByte(' + (esUltimo ? 1 : 0) + ');',
              bus: '← ' + hex2(leido), tipo: 'rx', ack: esUltimo ? 1 : 0, ok: true, dato: leido,
              desc: 'Byte ' + (r + 1) + '/' + nRead + ' (' + hex2(leido) + '). Maestro responde ' +
                (esUltimo ? '<strong>NACK=1</strong> (último).' : 'ACK=0 (hay más).') });
          }
        }

        pasos.push({ linea: 7 + nWrite + nRead, call: 'I2C1GeneraStop();',
          bus: 'P', tipo: 'ctrl', ok: true,
          desc: '<strong>STOP</strong>: libera el bus. ' +
            (nRead > 0 ? '<strong>✔ Lectura completa.</strong>' : '') });
      }
    }

    function codigo() {
      var lineas = [
        '<span data-l="1">I2C1GeneraStart();</span>',
        '<span data-l="2">if (I2C1EscribeByte(' + hex2(addr) + ' &lt;&lt; 1) != 0) {</span>',
        '<span data-l="9">    I2C1GeneraStop(); return -1;</span>',
        '}'
      ];
      for (var w = 0; w < nWrite; w++) {
        var dato = datoMock(w);
        lineas.push('<span data-l="' + (3 + w) + '">if (I2C1EscribeByte(' + hex2(dato) + ') != 0) { I2C1GeneraStop(); return -1; }</span>');
      }
      if (nRead > 0) {
        lineas.push('<span data-l="' + (4 + nWrite) + '">I2C1GeneraReStart();</span>');
        lineas.push('<span data-l="' + (5 + nWrite) + '">if (I2C1EscribeByte(' + hex2(addr) + ' &lt;&lt; 1 | 1) != 0) { I2C1GeneraStop(); return -1; }</span>');
        for (var r = 0; r < nRead; r++) {
          var esUltimo = (r === nRead - 1);
          lineas.push('<span data-l="' + (6 + nWrite + r) + '">dato' + (r > 0 ? '[' + r + ']' : '') + ' = I2C1LeeByte(' + (esUltimo ? 1 : 0) + ');' +
            (esUltimo ? '  // último → NACK' : '') + '</span>');
        }
      }
      lineas.push('<span data-l="' + (7 + nWrite + nRead) + '">I2C1GeneraStop();</span>');
      return lineas.join('\n');
    }

    function pintar() {
      el.querySelector('.id-hex').textContent = hex2(addr);
      var cod = el.querySelector('.id-codigo code');
      cod.innerHTML = codigo();
      var curL = (i >= 0 && i < pasos.length) ? pasos[i].linea : -1;
      cod.querySelectorAll('span[data-l]').forEach(function (sp) {
        sp.classList.toggle('id-curl', parseInt(sp.getAttribute('data-l'), 10) === curL);
      });

      var log = '';
      for (var k = 0; k <= i && k < pasos.length; k++) {
        var p = pasos[k];
        var cls = 'id-pill id-' + p.tipo + (p.ok ? '' : ' id-fail');
        var ackTxt = (p.ack !== undefined) ? ' <small>' + (p.tipo === 'rx' ? 'respuesta ' : 'ACK ') + p.ack + '</small>' : '';
        log += '<span class="' + cls + (k === i ? ' id-activo' : '') + '">' + p.bus + ackTxt + '</span>';
      }
      el.querySelector('.id-log').innerHTML = log || '<span class="id-vacio">—</span>';

      var last = (i >= 0) ? pasos[i] : null;
      var datosLeidos = [];
      for (var d = 0; d < pasos.length; d++) {
        if (pasos[d].tipo === 'rx' && d <= i) datosLeidos.push(hex2(pasos[d].dato));
      }
      el.querySelector('.id-result').innerHTML = datosLeidos.length > 0
        ? 'Leído: <strong>' + datosLeidos.join(', ') + '</strong>'
        : '';

      el.querySelector('.id-msg').innerHTML = (i < 0)
        ? 'Pulsa «Siguiente» para ejecutar paso a paso. En escritura, esclavo responde ACK=0. En lectura, maestro responde ACK=0 (más bytes) o NACK=1 (último).'
        : 'Paso ' + (i + 1) + '/' + pasos.length + ' — <code>' + pasos[i].call + '</code><br>' + pasos[i].desc;

      el.querySelector('.id-paso').disabled = (i >= pasos.length - 1);
      el.querySelector('.id-auto').disabled = (i >= pasos.length - 1);
    }

    function reinicia() { if (timer) { clearInterval(timer); timer = null; } construir(); i = -1; pintar(); }
    function avanza() { if (i < pasos.length - 1) { i++; pintar(); } else if (timer) { clearInterval(timer); timer = null; } }

    inAddr.addEventListener('input', function () { addr = Math.max(0, Math.min(127, parseInt(inAddr.value, 10) || 0)); reinicia(); });
    inNWrite.addEventListener('input', function () { nWrite = Math.max(1, Math.min(4, parseInt(inNWrite.value, 10) || 1)); reinicia(); });
    inNRead.addEventListener('input', function () { nRead = Math.max(1, Math.min(4, parseInt(inNRead.value, 10) || 1)); reinicia(); });
    chk.addEventListener('change', function () { presente = chk.checked; reinicia(); });
    el.querySelector('.id-paso').addEventListener('click', avanza);
    el.querySelector('.id-reset').addEventListener('click', reinicia);
    el.querySelector('.id-auto').addEventListener('click', function () {
      if (timer) { clearInterval(timer); timer = null; return; }
      if (i >= pasos.length - 1) reinicia();
      timer = setInterval(avanza, 900);
    });

    reinicia();
  };
})();
