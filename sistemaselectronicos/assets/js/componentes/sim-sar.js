/*
 * Componente "sim-sar": el algoritmo de aproximaciones sucesivas (SAR) ciclo
 * a ciclo. Eliges Vin y el número de bits; el conversor prueba un bit cada
 * ciclo (del más al menos significativo), el DAC genera V_DAC = Vref·D/2^N y
 * el comparador decide si el bit se queda a 1 o se pone a 0. Reproduce el
 * ejemplo de 4 bits del tema (Vin ≈ 11/16·Vref → 1011).
 *
 * Uso: <div class="mpi-mount" data-componente="sim-sar" data-config='{}'></div>
 */
window.MPI = window.MPI || {};
MPI.componentes = MPI.componentes || {};

(function () {
  var VREF = 3.3;

  function fmtV(v) {
    return v >= 1 ? v.toFixed(3).replace('.', ',') + ' V'
                  : (v * 1000).toFixed(0) + ' mV';
  }
  function binN(d, n) {
    var s = (d >>> 0).toString(2);
    while (s.length < n) s = '0' + s;
    return s;
  }

  // Precalcula la secuencia de ciclos de la búsqueda binaria.
  function pasosSAR(vin, n) {
    var pasos = [], D = 0, niveles = 1 << n;
    for (var bit = n - 1; bit >= 0; bit--) {
      var trial = D | (1 << bit);
      var vdac = VREF * trial / niveles;
      var keep = vdac <= vin;          // si V_DAC < Vin, falta tension -> el bit se queda a 1
      if (keep) D = trial;
      pasos.push({ bit: bit, trial: trial, vdac: vdac, keep: keep, D: D });
    }
    return { pasos: pasos, D: D };
  }

  MPI.componentes['sim-sar'] = function (el, cfg) {
    var N = 4;
    var vin = 0.70 * VREF;   // ~11/16 Vref -> da 1011 en 4 bits, como el ejemplo
    var i = 0, seq = null;

    el.classList.add('mpi-sar');
    el.innerHTML =
      '<div class="mpi-sim-cab">El algoritmo SAR, ciclo a ciclo</div>' +
      '<div class="sar-controles">' +
        '<label>Bits <select class="sar-n"><option value="4" selected>4 (como el ejemplo)</option><option value="10">10 (el del PIC32)</option></select></label>' +
        '<label class="sar-vinlab">V<sub>in</sub> = <strong class="sar-vinval"></strong>' +
          '<input type="range" class="sar-vin" min="0" max="3300" step="10" value="2310"></label>' +
      '</div>' +
      '<div class="sar-cuerpo">' +
        '<div class="sar-escala">' +
          '<svg viewBox="0 0 120 260" class="sar-svg" aria-label="Comparación de V_DAC con Vin">' +
            '<rect x="40" y="10" width="26" height="240" fill="var(--bg-3)" stroke="var(--borde)"/>' +
            '<line class="sar-lvin" x1="30" y1="0" x2="76" y2="0" stroke="var(--acento)" stroke-width="2.5"/>' +
            '<text class="sar-tvin" x="80" y="0" font-size="10" fill="var(--acento)">Vin</text>' +
            '<line class="sar-lvdac" x1="34" y1="0" x2="72" y2="0" stroke="var(--naranja)" stroke-width="2.5" stroke-dasharray="4 3"/>' +
            '<text class="sar-tvdac" x="80" y="0" font-size="10" fill="var(--naranja)">V_DAC</text>' +
            '<text x="20" y="14" font-size="9" fill="var(--txt-tenue)" text-anchor="end">Vref</text>' +
            '<text x="20" y="250" font-size="9" fill="var(--txt-tenue)" text-anchor="end">0</text>' +
          '</svg>' +
        '</div>' +
        '<div class="sar-panel">' +
          '<div class="sar-codebox"></div>' +
          '<div class="sar-msg nota"></div>' +
          '<div class="sar-botones">' +
            '<button type="button" class="sar-paso">Siguiente ciclo ▶</button>' +
            '<button type="button" class="sar-auto">Auto ⏩</button>' +
            '<button type="button" class="sar-reset">Reiniciar ↺</button>' +
          '</div>' +
          '<table class="cb-tabla sar-tabla"><tbody></tbody></table>' +
        '</div>' +
      '</div>';

    var selN = el.querySelector('.sar-n');
    var slVin = el.querySelector('.sar-vin');
    var lvin = el.querySelector('.sar-lvin'), tvin = el.querySelector('.sar-tvin');
    var lvdac = el.querySelector('.sar-lvdac'), tvdac = el.querySelector('.sar-tvdac');
    var timer = null;

    function y(v) { return 250 - (v / VREF) * 240; }   // tensión -> coordenada SVG

    function reinicia() {
      if (timer) { clearInterval(timer); timer = null; }
      seq = pasosSAR(vin, N);
      i = 0;
      pintar();
    }

    function pintar() {
      el.querySelector('.sar-vinval').innerHTML = fmtV(vin);
      var yv = y(vin);
      lvin.setAttribute('y1', yv); lvin.setAttribute('y2', yv);
      tvin.setAttribute('y', yv - 3 < 12 ? yv + 12 : yv - 3);

      // código actual: bits decididos + bit en prueba + bits pendientes
      var hechos = i;                       // ciclos ya resueltos
      var enPrueba = (i < N) ? seq.pasos[i] : null;
      var Dvis = (i === 0) ? 0 : seq.pasos[i - 1].D;
      var codeTrial = enPrueba ? enPrueba.trial : (seq.pasos[N - 1].D);
      var b = binN(codeTrial, N), code = '';
      for (var k = 0; k < N; k++) {
        var pos = N - 1 - k;                 // peso del bit en esta posición
        var cls = 'sar-cbit';
        if (enPrueba && pos === enPrueba.bit) cls += ' sar-prueba';
        else if (pos > (enPrueba ? enPrueba.bit : -1)) cls += ' sar-fijo';
        else cls += ' sar-pend';
        code += '<span class="' + cls + '">' + b.charAt(k) + '</span>';
      }
      el.querySelector('.sar-codebox').innerHTML =
        '<span class="sar-codetit">Código en prueba:</span> ' + code;

      // V_DAC del ciclo actual
      if (enPrueba) {
        var yd = y(enPrueba.vdac);
        lvdac.style.display = ''; tvdac.style.display = '';
        lvdac.setAttribute('y1', yd); lvdac.setAttribute('y2', yd);
        tvdac.setAttribute('y', yd + 4);
        el.querySelector('.sar-msg').innerHTML =
          'Ciclo ' + (i + 1) + '/' + N + ': se prueba el bit ' + enPrueba.bit +
          '. V<sub>DAC</sub> = Vref·' + enPrueba.trial + '/' + (1 << N) + ' = <strong>' +
          fmtV(enPrueba.vdac) + '</strong>. Pulsa «Siguiente ciclo» para comparar con V<sub>in</sub>.';
      } else if (i >= N) {
        lvdac.style.display = 'none'; tvdac.style.display = 'none';
        var vrec = seq.D * VREF / (1 << N);
        el.querySelector('.sar-msg').innerHTML =
          '✔ Conversión terminada en ' + N + ' ciclos. Resultado: <strong>D = ' +
          binN(seq.D, N) + '</strong> (' + seq.D + '), que representa ' + fmtV(vrec) + '.';
      }

      // tabla de ciclos ya resueltos
      var tb = el.querySelector('.sar-tabla tbody'), filas = '';
      if (hechos > 0) {
        filas = '<tr><th>Ciclo</th><th>Código</th><th>V<sub>DAC</sub></th><th>Decisión</th></tr>';
        for (var c = 0; c < hechos; c++) {
          var p = seq.pasos[c];
          filas += '<tr><td>' + (c + 1) + '</td><td class="sar-mono">' + binN(p.trial, N) +
            '</td><td>' + fmtV(p.vdac) + '</td><td class="' + (p.keep ? 'sar-keep' : 'sar-clr') + '">' +
            (p.keep ? 'V_DAC &lt; Vin → bit a 1' : 'V_DAC &gt; Vin → bit a 0') + '</td></tr>';
        }
      }
      tb.innerHTML = filas;

      el.querySelector('.sar-paso').disabled = (i >= N);
      el.querySelector('.sar-auto').disabled = (i >= N);
    }

    function avanza() {
      if (i >= N) { if (timer) { clearInterval(timer); timer = null; } return; }
      i++;
      pintar();
    }

    el.querySelector('.sar-paso').addEventListener('click', avanza);
    el.querySelector('.sar-reset').addEventListener('click', reinicia);
    el.querySelector('.sar-auto').addEventListener('click', function () {
      if (timer) { clearInterval(timer); timer = null; return; }
      if (i >= N) reinicia();
      timer = setInterval(avanza, 900);
    });
    selN.addEventListener('change', function () { N = parseInt(selN.value, 10); reinicia(); });
    slVin.addEventListener('input', function () { vin = parseInt(slVin.value, 10) / 1000; reinicia(); });

    reinicia();
  };
})();
