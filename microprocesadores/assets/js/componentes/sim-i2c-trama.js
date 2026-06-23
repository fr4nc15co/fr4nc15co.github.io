/*
 * Componente "sim-i2c-trama": anatomía completa de una transferencia I2C (protocolo, §8.4).
 * Eliges dirección, R/W, cuántos bytes de datos y recorres la transferencia completa segmento
 * a segmento: start, dirección+R/W, ACK esclavo, byte1, ACK/NACK, byte2, ACK/NACK... stop.
 * El color indica quién controla SDA en cada tramo (maestro o esclavo).
 *
 * Uso: <div class="mpi-mount" data-componente="sim-i2c-trama" data-config='{}'></div>
 */
window.MPI = window.MPI || {};
MPI.componentes = MPI.componentes || {};

(function () {
  function bits(v, n) {
    var s = (v >>> 0).toString(2);
    while (s.length < n) s = '0' + s;
    return s;
  }
  function hex2(v) {
    var s = v.toString(16).toUpperCase();
    return '0x' + (s.length < 2 ? '0' + s : s);
  }

  MPI.componentes['sim-i2c-trama'] = function (el, cfg) {
    var addr = 0x13, rw = 0, nBytes = 1;
    var paso = -1, segs = [], timer = null;

    el.classList.add('mpi-i2c-trama');
    el.innerHTML =
      '<div class="mpi-sim-cab">Anatomía de una transferencia I²C (con múltiples bytes)</div>' +
      '<div class="it-controles">' +
        '<label>Dirección (7 bits) <input type="number" class="it-addr" min="0" max="127" value="19"></label>' +
        '<label>Sentido <select class="it-rw"><option value="0" selected>Escritura (R/W = 0)</option><option value="1">Lectura (R/W = 1)</option></select></label>' +
        '<label>Bytes de datos <input type="number" class="it-nbytes" min="1" max="4" value="1"></label>' +
      '</div>' +
      '<div class="it-leyenda">' +
        '<span><i class="it-sw it-m"></i> lo controla el <strong>maestro</strong></span>' +
        '<span><i class="it-sw it-s"></i> lo controla el <strong>esclavo</strong></span>' +
      '</div>' +
      '<div class="it-tira"></div>' +
      '<div class="it-msg nota"></div>' +
      '<div class="it-botones">' +
        '<button type="button" class="it-paso">Siguiente ▶</button>' +
        '<button type="button" class="it-auto">Auto ⏩</button>' +
        '<button type="button" class="it-reset">Reiniciar ↺</button>' +
      '</div>';

    var inAddr = el.querySelector('.it-addr');
    var selRw = el.querySelector('.it-rw');
    var inNBytes = el.querySelector('.it-nbytes');

    function dataMock(idx) { return (addr + idx * 7 + 0x11) & 0xFF; }

    function construir() {
      var aB = bits(addr, 7);
      var lee = (rw === 1);
      segs = [];

      // Start
      segs.push({ cls: 'it-ctrl it-m', celdas: ['S'],
        desc: '<strong>Start (S)</strong>: el maestro hace bajar SDA con SCL en alto. Despierta a todos los esclavos.' });

      if (lee) {
        // En lectura: primero escribir dirección del registro
        // Dirección + R/W = 0 (ESCRITURA)
        var dirCeldas0 = [];
        for (var i = 0; i < 7; i++) dirCeldas0.push({ t: aB.charAt(i), sub: 'A' + (6 - i), who: 'm' });
        dirCeldas0.push({ t: '0', sub: 'R/W', who: 'm', destacado: true });
        segs.push({ grupo: dirCeldas0,
          desc: '<strong>Dirección + R/W = 0</strong> (escritura): maestro envía ' + hex2(addr) + ' y declara que va a <strong>escribir</strong>. Byte del bus: ' +
            hex2(addr << 1) + '.' });

        // ACK del esclavo
        segs.push({ cls: 'it-ack it-s', celdas: ['A'],
          desc: '<strong>ACK esclavo</strong>: esclavo confirma presencia y se prepara para recibir la dirección del registro.' });

        // Byte de registro (dirección interna)
        var regByte = dataMock(0);
        var rB = bits(regByte, 8);
        var rCeldas = [];
        for (var j = 0; j < 8; j++) rCeldas.push({ t: rB.charAt(j), sub: 'D' + (7 - j), who: 'm' });
        segs.push({ grupo: rCeldas,
          desc: '<strong>Maestro envía dirección del registro interno</strong> (' + hex2(regByte) + ') que se quiere leer.' });

        // ACK del esclavo al registro
        segs.push({ cls: 'it-ack it-s', celdas: ['A'],
          desc: '<strong>ACK esclavo</strong>: esclavo confirma que entendió cuál es el registro a leer.' });

        // Repeated START
        segs.push({ cls: 'it-ctrl it-m', celdas: ['RS'],
          desc: '<strong>Repeated START (RS)</strong>: <em>sin soltar el bus</em>, el maestro invierte el sentido de la comunicación. Evita que otro maestro se cuele.' });

        // Dirección + R/W = 1 (LECTURA)
        var dirCeldas1 = [];
        for (var i = 0; i < 7; i++) dirCeldas1.push({ t: aB.charAt(i), sub: 'A' + (6 - i), who: 'm' });
        dirCeldas1.push({ t: '1', sub: 'R/W', who: 'm', destacado: true });
        segs.push({ grupo: dirCeldas1,
          desc: '<strong>Dirección + R/W = 1</strong> (lectura): maestro reenvía ' + hex2(addr) + ' y ahora declara que va a <strong>leer</strong>. Byte del bus: ' +
            hex2((addr << 1) | 1) + '.' });

        // ACK del esclavo a la dirección de lectura
        segs.push({ cls: 'it-ack it-s', celdas: ['A'],
          desc: '<strong>ACK esclavo</strong>: esclavo confirma y se prepara para enviar el contenido del registro solicitado.' });

        // Bytes de lectura
        for (var b = 0; b < nBytes; b++) {
          var dato = dataMock(b);
          var dB = bits(dato, 8);
          var esUltimo = (b === nBytes - 1);

          var dCeldas = [];
          for (var j = 0; j < 8; j++) dCeldas.push({ t: dB.charAt(j), sub: 'D' + (7 - j), who: 's' });
          segs.push({ grupo: dCeldas,
            desc: '<strong>Esclavo envía</strong> byte ' + (b + 1) + '/' + nBytes + ' (' + hex2(dato) + ') con bits MSB primero.' });

          var isNack = esUltimo;
          segs.push({ cls: 'it-ack it-m', celdas: [isNack ? 'NA' : 'A'],
            desc: '<strong>' + (isNack ? 'NACK' : 'ACK') + ' del maestro</strong>: ' +
              (isNack ? 'NACK (1) = «este es el último byte, no quiero más».' : 'ACK (0) = «envía más bytes».') });
        }
      } else {
        // En escritura: solo enviar dirección + datos
        // Dirección + R/W = 0 (ESCRITURA)
        var dirCeldas = [];
        for (var i = 0; i < 7; i++) dirCeldas.push({ t: aB.charAt(i), sub: 'A' + (6 - i), who: 'm' });
        dirCeldas.push({ t: '0', sub: 'R/W', who: 'm', destacado: true });
        segs.push({ grupo: dirCeldas,
          desc: '<strong>Dirección + R/W = 0</strong> (escritura): maestro envía ' + hex2(addr) + '. Byte del bus: ' +
            hex2(addr << 1) + '.' });

        // ACK del esclavo
        segs.push({ cls: 'it-ack it-s', celdas: ['A'],
          desc: '<strong>ACK esclavo</strong>: esclavo confirma presencia.' });

        // Bytes de escritura
        for (var b = 0; b < nBytes; b++) {
          var dato = dataMock(b);
          var dB = bits(dato, 8);

          var dCeldas = [];
          for (var j = 0; j < 8; j++) dCeldas.push({ t: dB.charAt(j), sub: 'D' + (7 - j), who: 'm' });
          segs.push({ grupo: dCeldas,
            desc: '<strong>Maestro envía</strong> byte ' + (b + 1) + '/' + nBytes + ' (' + hex2(dato) + ') con bits MSB primero.' });

          segs.push({ cls: 'it-ack it-s', celdas: ['A'],
            desc: '<strong>ACK esclavo</strong>: esclavo confirma recepción del byte ' + (b + 1) + '.' });
        }
      }

      // Stop
      segs.push({ cls: 'it-ctrl it-m', celdas: ['P'],
        desc: '<strong>Stop (P)</strong>: el maestro hace subir SDA con SCL en alto. Libera el bus.' });
    }

    function pintar() {
      var html = '';
      segs.forEach(function (s, si) {
        var act = (si === paso) ? ' it-activo' : '';
        var hecho = (si < paso) ? ' it-hecho' : '';
        if (s.grupo) {
          s.grupo.forEach(function (c) {
            html += '<span class="it-celda it-' + c.who + act + hecho + (c.destacado ? ' it-destac' : '') +
              '"><b>' + c.t + '</b><small>' + c.sub + '</small></span>';
          });
        } else {
          html += '<span class="it-celda ' + s.cls + act + hecho + '"><b>' + s.celdas[0] + '</b></span>';
        }
      });
      el.querySelector('.it-tira').innerHTML = html;
      el.querySelector('.it-msg').innerHTML = (paso < 0)
        ? 'Transferencia completa. Pulsa «Siguiente» para recorrer segmento a segmento. SDA solo cambia con SCL en bajo.'
        : segs[paso].desc + (paso === segs.length - 1 ? ' <strong>✔ Transferencia terminada.</strong>' : '');
      el.querySelector('.it-paso').disabled = (paso >= segs.length - 1);
      el.querySelector('.it-auto').disabled = (paso >= segs.length - 1);
    }

    function reinicia() { if (timer) { clearInterval(timer); timer = null; } construir(); paso = -1; pintar(); }
    function avanza() { if (paso < segs.length - 1) { paso++; pintar(); } else if (timer) { clearInterval(timer); timer = null; } }

    inAddr.addEventListener('input', function () { addr = Math.max(0, Math.min(127, parseInt(inAddr.value, 10) || 0)); reinicia(); });
    inNBytes.addEventListener('input', function () { nBytes = Math.max(1, Math.min(4, parseInt(inNBytes.value, 10) || 1)); reinicia(); });
    selRw.addEventListener('change', function () { rw = parseInt(selRw.value, 10); reinicia(); });
    el.querySelector('.it-paso').addEventListener('click', avanza);
    el.querySelector('.it-reset').addEventListener('click', reinicia);
    el.querySelector('.it-auto').addEventListener('click', function () {
      if (timer) { clearInterval(timer); timer = null; return; }
      if (paso >= segs.length - 1) reinicia();
      timer = setInterval(avanza, 1000);
    });

    reinicia();
  };
})();
