/*
 * Componente "sim-i2c-trama": anatomía de un mensaje I2C (protocolo, §8.4).
 * Eliges dirección (7 bits), sentido R/W y un byte de datos, y recorres el
 * mensaje segmento a segmento: start, dirección+R/W, ACK del esclavo, byte de
 * datos, ACK, stop. El color indica quién controla SDA en cada tramo
 * (maestro o esclavo) — la clave de quién manda el ACK y los datos.
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
    var addr = 0x13, rw = 0, data = 0x3C;
    var paso = -1, segs = [], timer = null;

    el.classList.add('mpi-i2c-trama');
    el.innerHTML =
      '<div class="mpi-sim-cab">Anatomía de un mensaje I²C</div>' +
      '<div class="it-controles">' +
        '<label>Dirección (7 bits) <input type="number" class="it-addr" min="0" max="127" value="19"></label>' +
        '<label>Sentido <select class="it-rw"><option value="0" selected>Escritura (R/W = 0)</option><option value="1">Lectura (R/W = 1)</option></select></label>' +
        '<label>Byte de datos <input type="number" class="it-data" min="0" max="255" value="60"></label>' +
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
    var inData = el.querySelector('.it-data');

    function construir() {
      var aB = bits(addr, 7), dB = bits(data, 8);
      var lee = (rw === 1);
      segs = [];
      // 0: start
      segs.push({ cls: 'it-ctrl it-m', celdas: ['S'],
        desc: '<strong>Start</strong>: el maestro hace bajar SDA con SCL en alto. Es la única vez que SDA cambia con el reloj en alto (junto al stop). Despierta a todos los esclavos.' });
      // 1: dirección 7 bits + R/W
      var dirCeldas = [];
      for (var i = 0; i < 7; i++) dirCeldas.push({ t: aB.charAt(i), sub: 'A' + (6 - i), who: 'm' });
      dirCeldas.push({ t: String(rw), sub: 'R/W', who: 'm', destacado: true });
      segs.push({ grupo: dirCeldas,
        desc: '<strong>Dirección + R/W</strong>: el maestro envía los 7 bits de la dirección (' +
          hex2(addr) + ') empezando por el MSB, y un bit R/W = ' + rw + ' (' +
          (lee ? 'lectura' : 'escritura') + '). El byte que viaja por el bus es ' +
          hex2((addr << 1) | rw) + ' = (dir &lt;&lt; 1)' + (lee ? ' | 1' : '') + '.' });
      // 2: ACK del esclavo
      segs.push({ cls: 'it-ack it-s', celdas: ['A'],
        desc: '<strong>ACK del esclavo</strong>: el maestro suelta SDA y el esclavo direccionado la baja a <strong>0</strong> para confirmar. Si nadie responde (NACK = 1), no hay ese esclavo en el bus.' });
      // 3: byte de datos (maestro si escribe, esclavo si lee)
      var dCeldas = [];
      for (var j = 0; j < 8; j++) dCeldas.push({ t: dB.charAt(j), sub: 'D' + (7 - j), who: lee ? 's' : 'm' });
      segs.push({ grupo: dCeldas,
        desc: lee
          ? '<strong>Byte de datos</strong>: ahora es el <strong>esclavo</strong> quien pone los 8 bits en SDA; el maestro sigue generando el reloj. (' + hex2(data) + ')'
          : '<strong>Byte de datos</strong>: el maestro envía el byte ' + hex2(data) + ' (MSB primero).' });
      // 4: ACK (quien recibe)
      segs.push({ cls: 'it-ack ' + (lee ? 'it-m' : 'it-s'), celdas: [lee ? 'NA' : 'A'],
        desc: lee
          ? '<strong>ACK del maestro</strong>: como es el maestro quien recibe, es él quien responde. En el <em>último</em> byte manda un <strong>NACK (1)</strong> para decir «no quiero más».'
          : '<strong>ACK del esclavo</strong>: el esclavo confirma el byte recibido con un 0. Si quedaran más bytes, se repetiría dato→ACK.' });
      // 5: stop
      segs.push({ cls: 'it-ctrl it-m', celdas: ['P'],
        desc: '<strong>Stop</strong>: el maestro hace subir SDA con SCL en alto y libera el bus. Otro maestro ya puede usarlo.' });
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
        ? 'Mensaje completo en el bus. Pulsa «Siguiente» para recorrerlo segmento a segmento. SDA solo cambia con SCL en bajo; los receptores muestrean SDA con SCL en alto.'
        : segs[paso].desc + (paso === segs.length - 1 ? ' <strong>✔ Mensaje terminado.</strong>' : '');
      el.querySelector('.it-paso').disabled = (paso >= segs.length - 1);
      el.querySelector('.it-auto').disabled = (paso >= segs.length - 1);
    }

    function reinicia() { if (timer) { clearInterval(timer); timer = null; } construir(); paso = -1; pintar(); }
    function avanza() { if (paso < segs.length - 1) { paso++; pintar(); } else if (timer) { clearInterval(timer); timer = null; } }

    inAddr.addEventListener('input', function () { addr = Math.max(0, Math.min(127, parseInt(inAddr.value, 10) || 0)); reinicia(); });
    inData.addEventListener('input', function () { data = Math.max(0, Math.min(255, parseInt(inData.value, 10) || 0)); reinicia(); });
    selRw.addEventListener('change', function () { rw = parseInt(selRw.value, 10); reinicia(); });
    el.querySelector('.it-paso').addEventListener('click', avanza);
    el.querySelector('.it-reset').addEventListener('click', reinicia);
    el.querySelector('.it-auto').addEventListener('click', function () {
      if (timer) { clearInterval(timer); timer = null; return; }
      if (paso >= segs.length - 1) reinicia();
      timer = setInterval(avanza, 1100);
    });

    reinicia();
  };
})();
