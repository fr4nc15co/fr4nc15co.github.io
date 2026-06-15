/*
 * Componente "sim-spi": cronograma del bus SPI con los cuatro modos CPOL/CPHA.
 * Eliges CPOL (nivel del reloj en reposo), CPHA (flanco de muestreo) y un byte,
 * y ves SCLK y MOSI alineados, con un marcador en cada instante de muestreo.
 * El MCP3008 (y casi todo) usa el modo 0 (CPOL = 0, CPHA = 0).
 *
 * Uso: <div class="mpi-mount" data-componente="sim-spi" data-config='{}'></div>
 */
window.MPI = window.MPI || {};
MPI.componentes = MPI.componentes || {};

(function () {
  var X0 = 40, W = 36, N = 8;
  var CLK_HI = 30, CLK_LO = 62, MO_HI = 104, MO_LO = 136;

  function bits8(v) {
    var s = (v >>> 0).toString(2);
    while (s.length < 8) s = '0' + s;
    return s;
  }

  MPI.componentes['sim-spi'] = function (el, cfg) {
    var cpol = 0, cpha = 0, data = 0xB4;

    el.classList.add('mpi-spi');
    el.innerHTML =
      '<div class="mpi-sim-cab">El bus SPI y los modos CPOL/CPHA</div>' +
      '<div class="spi-controles">' +
        '<label>CPOL <select class="spi-cpol"><option value="0" selected>0 · reloj en reposo a 0</option><option value="1">1 · reloj en reposo a 1</option></select></label>' +
        '<label>CPHA <select class="spi-cpha"><option value="0" selected>0 · muestrea en el 1.er flanco</option><option value="1">1 · muestrea en el 2.º flanco</option></select></label>' +
        '<label>Byte (MOSI) <input type="number" class="spi-data" min="0" max="255" value="180"></label>' +
      '</div>' +
      '<svg viewBox="0 0 360 170" class="spi-svg" aria-label="Cronograma SPI"></svg>' +
      '<div class="spi-info nota"></div>';

    var svg = el.querySelector('.spi-svg');
    var inData = el.querySelector('.spi-data');
    var selCpol = el.querySelector('.spi-cpol');
    var selCpha = el.querySelector('.spi-cpha');

    function pintar() {
      var b = bits8(data);                       // MSB primero (D7..D0)
      var idle = cpol;                            // nivel en reposo
      function clkY(v) { return v ? CLK_HI : CLK_LO; }
      function moY(bit) { return bit === '1' ? MO_HI : MO_LO; }

      // --- SCLK: flanco de subida/bajada al principio (leading) y a mitad (trailing) ---
      var p = ['M', X0, clkY(idle)];
      for (var i = 0; i < N; i++) {
        var xs = X0 + i * W, xm = xs + W / 2, xe = xs + W;
        p.push('L', xs, clkY(1 - idle), 'L', xm, clkY(1 - idle), 'L', xm, clkY(idle), 'L', xe, clkY(idle));
      }
      var clk = '<path d="' + p.join(' ') + '" fill="none" stroke="var(--acento-2)" stroke-width="2"/>';

      // --- MOSI: cada bit ocupa un periodo, MSB primero ---
      var m = ['M', X0, moY(b.charAt(0))];
      for (var j = 0; j < N; j++) {
        var mxe = X0 + (j + 1) * W;
        m.push('L', mxe, moY(b.charAt(j)));
        if (j < N - 1) m.push('L', mxe, moY(b.charAt(j + 1)));
      }
      var mosi = '<path d="' + m.join(' ') + '" fill="none" stroke="var(--acento)" stroke-width="2"/>';

      // --- marcadores de muestreo: 1.er flanco (xs) si CPHA=0, 2.º (xm) si CPHA=1 ---
      var marks = '', etiq = '';
      for (var k = 0; k < N; k++) {
        var sx = X0 + k * W + (cpha === 0 ? 1 : W / 2);
        marks += '<line x1="' + sx + '" y1="20" x2="' + sx + '" y2="148" stroke="var(--amarillo)" stroke-width="1" stroke-dasharray="3 3"/>' +
                 '<circle cx="' + sx + '" cy="' + moY(b.charAt(k)) + '" r="3.5" fill="var(--amarillo)"/>';
        etiq += '<text x="' + (X0 + k * W + W / 2) + '" y="162" font-size="9" fill="var(--txt-tenue)" text-anchor="middle">D' + (7 - k) + '</text>';
      }

      svg.innerHTML =
        '<text x="6" y="' + ((CLK_HI + CLK_LO) / 2 + 3) + '" font-size="10" fill="var(--acento-2)">SCLK</text>' +
        '<text x="6" y="' + ((MO_HI + MO_LO) / 2 + 3) + '" font-size="10" fill="var(--acento)">MOSI</text>' +
        marks + clk + mosi + etiq;

      var modo = cpol * 2 + cpha;
      el.querySelector('.spi-info').innerHTML =
        '<p><strong>Modo ' + modo + '</strong> (CPOL = ' + cpol + ', CPHA = ' + cpha + '). ' +
        'CPOL fija el nivel del reloj en reposo (<strong>' + idle + '</strong>); CPHA elige en qué flanco se muestrea: ' +
        (cpha === 0 ? 'el <strong>primero</strong> de cada periodo' : 'el <strong>segundo</strong> de cada periodo') +
        ' (líneas amarillas). El maestro pone cada bit en MOSI en el flanco contrario.</p>' +
        '<p>Byte enviado por MOSI: <strong>' + b + '</strong> (0x' + ('0' + data.toString(16).toUpperCase()).slice(-2) + ', MSB primero).' +
        (modo === 0 ? ' Es el modo del <strong>MCP3008</strong>.' : '') + '</p>';
    }

    inData.addEventListener('input', function () { data = Math.max(0, Math.min(255, parseInt(inData.value, 10) || 0)); pintar(); });
    selCpol.addEventListener('change', function () { cpol = parseInt(selCpol.value, 10); pintar(); });
    selCpha.addEventListener('change', function () { cpha = parseInt(selCpha.value, 10); pintar(); });
    pintar();
  };
})();
