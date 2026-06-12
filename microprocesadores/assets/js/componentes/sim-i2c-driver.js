/*
 * Componente "sim-i2c-driver": el patrón de examen «leer un registro de un
 * sensor» con la API del driver I2C (§8.6). Eliges la dirección del esclavo y
 * el registro, y si el esclavo responde o no. Recorres las llamadas del driver
 * paso a paso, viendo el byte que viaja por el bus, el ACK devuelto y la línea
 * de C resaltada — incluida la ruta de error (NACK → Stop → return).
 * Coherente con el ejemplo del VCNL4010 (dir 0x13).
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
    var addr = 0x13, reg = 0x81, presente = true;
    var pasos = [], i = -1, timer = null;

    el.classList.add('mpi-i2c-driver');
    el.innerHTML =
      '<div class="mpi-sim-cab">Leer un registro de un sensor I²C (patrón de examen)</div>' +
      '<div class="id-controles">' +
        '<label>Dirección del esclavo <input type="number" class="id-addr" min="0" max="127" value="19"> <span class="id-hex"></span></label>' +
        '<label>Registro <input type="number" class="id-reg" min="0" max="255" value="129"> <span class="id-hexr"></span></label>' +
        '<label class="id-pres"><input type="checkbox" class="id-presente" checked> El sensor está conectado y responde</label>' +
      '</div>' +
      '<div class="id-cuerpo">' +
        '<pre class="id-codigo"><code class="lang-c"></code></pre>' +
        '<div class="id-bus">' +
          '<div class="id-bustit">Bus I²C</div>' +
          '<div class="id-log"></div>' +
          '<div class="id-result"></div>' +
        '</div>' +
      '</div>' +
      '<div class="id-msg nota"></div>' +
      '<div class="id-botones">' +
        '<button type="button" class="id-paso">Siguiente llamada ▶</button>' +
        '<button type="button" class="id-auto">Auto ⏩</button>' +
        '<button type="button" class="id-reset">Reiniciar ↺</button>' +
      '</div>';

    var inAddr = el.querySelector('.id-addr');
    var inReg = el.querySelector('.id-reg');
    var chk = el.querySelector('.id-presente');

    function datoMock(r) { return (r * 7 + 0x11) & 0xFF; }   // byte leído, determinista

    function construir() {
      var wB = (addr << 1) & 0xFF, rB = ((addr << 1) | 1) & 0xFF, dato = datoMock(reg);
      pasos = [];
      pasos.push({ linea: 1, call: 'I2C1GeneraStart();',
        bus: 'S', tipo: 'ctrl', ok: true,
        desc: 'Condición de <strong>start</strong>: el maestro toma el bus.' });
      pasos.push({ linea: 2, call: 'I2C1EscribeByte(0x13 << 1);',
        bus: 'W ' + hex2(wB), tipo: 'tx', ack: presente ? 0 : 1, ok: presente,
        desc: 'Envía la dirección con <strong>R/W = 0</strong> (escritura): ' + hex2(wB) +
          ' = (' + hex2(addr) + ' &lt;&lt; 1). ' +
          (presente ? 'El esclavo responde <strong>ACK = 0</strong> → seguimos.'
                    : '<strong>NACK = 1</strong>: nadie en esa dirección. Se aborta: Stop + return.') });
      if (presente) {
        pasos.push({ linea: 3, call: 'I2C1EscribeByte(0x81);',
          bus: hex2(reg), tipo: 'tx', ack: 0, ok: true,
          desc: 'Envía la <strong>dirección del registro interno</strong> a leer (' + hex2(reg) + '). ACK = 0.' });
        pasos.push({ linea: 4, call: 'I2C1GeneraReStart();',
          bus: 'RS', tipo: 'ctrl', ok: true,
          desc: '<strong>Repeated start</strong>: cambia el sentido a lectura <em>sin soltar el bus</em>, para que ningún otro maestro se cuele.' });
        pasos.push({ linea: 5, call: 'I2C1EscribeByte(0x13 << 1 | 1);',
          bus: 'R ' + hex2(rB), tipo: 'tx', ack: 0, ok: true,
          desc: 'Reenvía la dirección, ahora con <strong>R/W = 1</strong> (lectura): ' + hex2(rB) +
            ' = (' + hex2(addr) + ' &lt;&lt; 1) | 1. ACK = 0.' });
        pasos.push({ linea: 6, call: 'dato = I2C1LeeByte(1);',
          bus: '← ' + hex2(dato), tipo: 'rx', ok: true, dato: dato,
          desc: 'El esclavo envía el byte (' + hex2(dato) + ') y el maestro responde <strong>NACK (1)</strong> por ser el último.' });
        pasos.push({ linea: 7, call: 'I2C1GeneraStop();',
          bus: 'P', tipo: 'ctrl', ok: true,
          desc: '<strong>Stop</strong>: libera el bus. <strong>✔ Lectura completa: dato = ' + hex2(dato) + '.</strong>' });
      } else {
        pasos.push({ linea: 8, call: 'I2C1GeneraStop();  // abortar',
          bus: 'P', tipo: 'ctrl', ok: true,
          desc: '<strong>Stop</strong> para dejar el bus limpio, y <code>return -1</code>: el main se entera del fallo por el valor devuelto.' });
      }
    }

    function codigo() {
      // líneas con número para resaltar (linea: n del paso actual)
      var lineas = [
        '<span data-l="1">I2C1GeneraStart();</span>',
        '<span data-l="2">if (I2C1EscribeByte(' + hex2(addr) + ' &lt;&lt; 1) != 0) {</span>',
        '<span data-l="8">    I2C1GeneraStop(); return -1;   // NACK: abortar</span>',
        '}',
        '<span data-l="3">if (I2C1EscribeByte(' + hex2(reg) + ') != 0) { I2C1GeneraStop(); return -1; }</span>',
        '<span data-l="4">I2C1GeneraReStart();</span>',
        '<span data-l="5">if (I2C1EscribeByte(' + hex2(addr) + ' &lt;&lt; 1 | 1) != 0) { I2C1GeneraStop(); return -1; }</span>',
        '<span data-l="6">dato = I2C1LeeByte(1);            // unico byte -> NACK</span>',
        '<span data-l="7">I2C1GeneraStop();</span>'
      ];
      return lineas.join('\n');
    }

    function pintar() {
      el.querySelector('.id-hex').textContent = hex2(addr);
      el.querySelector('.id-hexr').textContent = hex2(reg);
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
        var ackTxt = (p.ack !== undefined) ? ' <small>ACK ' + p.ack + '</small>' : '';
        log += '<span class="' + cls + (k === i ? ' id-activo' : '') + '">' + p.bus + ackTxt + '</span>';
      }
      el.querySelector('.id-log').innerHTML = log || '<span class="id-vacio">—</span>';

      var last = (i >= 0) ? pasos[i] : null;
      el.querySelector('.id-result').innerHTML =
        (last && last.tipo === 'rx') ? 'dato leído = <strong>' + hex2(last.dato) + '</strong>' : '';

      el.querySelector('.id-msg').innerHTML = (i < 0)
        ? 'Pulsa «Siguiente llamada» para ejecutar el driver paso a paso. Cada <code>I2C1EscribeByte</code> devuelve el ACK: 0 = OK, 1 = NACK (se aborta).'
        : 'Paso ' + (i + 1) + '/' + pasos.length + ' — <code>' + pasos[i].call + '</code><br>' + pasos[i].desc;

      el.querySelector('.id-paso').disabled = (i >= pasos.length - 1);
      el.querySelector('.id-auto').disabled = (i >= pasos.length - 1);
    }

    function reinicia() { if (timer) { clearInterval(timer); timer = null; } construir(); i = -1; pintar(); }
    function avanza() { if (i < pasos.length - 1) { i++; pintar(); } else if (timer) { clearInterval(timer); timer = null; } }

    inAddr.addEventListener('input', function () { addr = Math.max(0, Math.min(127, parseInt(inAddr.value, 10) || 0)); reinicia(); });
    inReg.addEventListener('input', function () { reg = Math.max(0, Math.min(255, parseInt(inReg.value, 10) || 0)); reinicia(); });
    chk.addEventListener('change', function () { presente = chk.checked; reinicia(); });
    el.querySelector('.id-paso').addEventListener('click', avanza);
    el.querySelector('.id-reset').addEventListener('click', reinicia);
    el.querySelector('.id-auto').addEventListener('click', function () {
      if (timer) { clearInterval(timer); timer = null; return; }
      if (i >= pasos.length - 1) reinicia();
      timer = setInterval(avanza, 1100);
    });

    reinicia();
  };
})();
