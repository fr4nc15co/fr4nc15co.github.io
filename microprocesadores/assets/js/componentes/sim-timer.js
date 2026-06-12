/*
 * Componente "sim-timer": calculadora/simulador del temporizador del PIC32MX.
 *
 * Dado un tiempo (o frecuencia) objetivo, elige el prescaler mínimo válido,
 * calcula PRx, el valor de TxCON, el tiempo realmente conseguido y el error,
 * y genera el código C de inicialización. Soporta Timer1 (tipo A) y Timers
 * 2–5 (tipo B), incluido el modo 32 bits.
 *
 * Fórmula:  PRx = round(T · PBCLK / divisor) − 1     (PR_max = 65535 o 2^32−1)
 * PBCLK por defecto = 5 MHz.
 *
 * Casos de referencia verificados con la asignatura:
 *   15 ms, tipo A  -> prescaler 1:8,  PR1 = 9374,      T1CON = 0x8010
 *   5 s,   tipo B (32 bits) -> 1:1,   PR2 = 24999999,  T2CON = 0x8008
 *   2.5 s, tipo B  -> 1:256, PR3 = 48827, T3CON = 0x8070
 */
window.MPI = window.MPI || {};
MPI.componentes = MPI.componentes || {};

(function () {
  var TIPOS = {
    A: {
      etiqueta: 'Timer1 (tipo A)', n: '1',
      prescalers: [{ div: 1, tckps: 0 }, { div: 8, tckps: 1 }, { div: 64, tckps: 2 }, { div: 256, tckps: 3 }],
      puede32: false
    },
    B: {
      etiqueta: 'Timer2–5 (tipo B)', n: '2',
      prescalers: [{ div: 1, tckps: 0 }, { div: 2, tckps: 1 }, { div: 4, tckps: 2 }, { div: 8, tckps: 3 },
        { div: 16, tckps: 4 }, { div: 32, tckps: 5 }, { div: 64, tckps: 6 }, { div: 256, tckps: 7 }],
      puede32: true
    }
  };

  function hex4(v) {
    var s = (v >>> 0).toString(16).toUpperCase();
    while (s.length < 4) s = '0' + s;
    return '0x' + s;
  }

  function fmtTiempo(seg) {
    if (seg >= 1) return redondea(seg, 6) + ' s';
    if (seg >= 1e-3) return redondea(seg * 1e3, 6) + ' ms';
    return redondea(seg * 1e6, 4) + ' µs';
  }
  function redondea(x, d) { var f = Math.pow(10, d); return Math.round(x * f) / f; }

  // Calcula PR y prescaler para un tiempo objetivo (en segundos).
  function calcular(segObjetivo, tipo, modo32, pbclk) {
    var maxPR = modo32 ? 4294967295 : 65535;
    for (var i = 0; i < tipo.prescalers.length; i++) {
      var p = tipo.prescalers[i];
      var cuenta = segObjetivo * pbclk / p.div;       // = PR + 1
      var PR = Math.round(cuenta) - 1;
      if (PR < 0) PR = 0;
      if (PR <= maxPR) {
        var real = (PR + 1) * p.div / pbclk;
        var errPct = segObjetivo > 0 ? (real - segObjetivo) / segObjetivo * 100 : 0;
        return { ok: true, div: p.div, tckps: p.tckps, PR: PR, real: real, errPct: errPct, maxPR: maxPR };
      }
    }
    return { ok: false, maxPR: maxPR };
  }

  function codigoC(tipo, modo32, r) {
    var n = tipo.n;
    var txcon = 0x8000 | (r.tckps << 4) | (modo32 ? (1 << 3) : 0);
    var L = [];
    if (modo32) {
      // En 32 bits hay que activar T32 antes de escribir TMR/PR.
      var par = '2', impar = '3';
      L.push('T' + par + 'CON = 0;            // Parar el temporizador par');
      L.push('T' + impar + 'CON = 0;            // y el impar');
      L.push('T' + par + 'CON = 0x0008;       // Modo 32 bits (T32=1) antes de escribir TMR/PR');
      L.push('TMR' + par + ' = 0;             // Cuenta a 0 (32 bits vía TMR' + par + ')');
      L.push('IFS0bits.T' + impar + 'IF = 0;     // El flag lo genera el timer impar');
      L.push('PR' + par + '  = ' + r.PR + ';      // Periodo (32 bits vía PR' + par + ')');
      L.push('T' + par + 'CON = ' + hex4(txcon) + ';     // ON, prescaler 1:' + r.div + ', 32 bits, reloj interno');
      L.push('while (IFS0bits.T' + impar + 'IF == 0) ;  // Esperar fin de cuenta');
    } else {
      L.push('T' + n + 'CON = 0;            // Parar el Timer ' + n);
      L.push('TMR' + n + ' = 0;             // Cuenta a 0');
      L.push('IFS0bits.T' + n + 'IF = 0;     // Borrar flag de fin de cuenta');
      L.push('PR' + n + '  = ' + r.PR + ';' + relleno(r.PR) + '// Periodo calculado');
      L.push('T' + n + 'CON = ' + hex4(txcon) + ';     // ON, prescaler 1:' + r.div + ', reloj interno');
      L.push('while (IFS0bits.T' + n + 'IF == 0) ;  // Esperar fin de cuenta');
    }
    return { code: L.join('\n'), txcon: txcon };
  }
  function relleno(pr) { var s = '' + pr; var r = '       '.slice(Math.min(s.length, 6)); return r + ' '; }

  MPI.componentes['sim-timer'] = function (el, config) {
    el.classList.add('mpi-sim-timer');
    el.innerHTML =
      '<div class="st-form">' +
        '<div class="st-fila">' +
          '<label>Temporizador:' +
            '<select class="st-tipo"><option value="A">Timer1 (tipo A)</option><option value="B" selected>Timer2–5 (tipo B)</option></select>' +
          '</label>' +
          '<label class="st-32"><input type="checkbox" class="st-modo32"> 32 bits</label>' +
        '</div>' +
        '<div class="st-fila">' +
          '<label>Objetivo:' +
            '<select class="st-magnitud"><option value="t">Tiempo</option><option value="f">Frecuencia</option></select>' +
          '</label>' +
          '<input type="number" class="st-valor" value="15" step="any" min="0">' +
          '<select class="st-unidad"><option value="0.001">ms</option><option value="1">s</option><option value="0.000001">µs</option><option value="hz">Hz</option></select>' +
        '</div>' +
        '<div class="st-fila"><label>PBCLK: <input type="number" class="st-pbclk" value="5"> MHz</label></div>' +
      '</div>' +
      '<div class="st-resultado"></div>' +
      '<pre class="st-codigo"><code class="lang-c"></code></pre>';

    var selTipo = el.querySelector('.st-tipo');
    var chk32 = el.querySelector('.st-modo32');
    var lbl32 = el.querySelector('.st-32');
    var selMag = el.querySelector('.st-magnitud');
    var inpVal = el.querySelector('.st-valor');
    var selUni = el.querySelector('.st-unidad');
    var inpPb = el.querySelector('.st-pbclk');
    var divRes = el.querySelector('.st-resultado');
    var codeEl = el.querySelector('.st-codigo code');

    function sincronizarUnidades() {
      var esFreq = selMag.value === 'f';
      // Mostrar Hz si frecuencia; tiempo en caso contrario.
      [].forEach.call(selUni.options, function (o) {
        var esHz = o.value === 'hz';
        o.hidden = esFreq ? !esHz : esHz;
      });
      if (esFreq) selUni.value = 'hz';
      else if (selUni.value === 'hz') selUni.value = '0.001';
      lbl32.style.display = selTipo.value === 'B' ? '' : 'none';
      if (selTipo.value === 'A') chk32.checked = false;
    }

    function recomputar() {
      var tipo = TIPOS[selTipo.value];
      var modo32 = tipo.puede32 && chk32.checked;
      var pbclk = (parseFloat(inpPb.value) || 5) * 1e6;
      var val = parseFloat(inpVal.value);
      if (isNaN(val) || val <= 0) { divRes.innerHTML = '<p class="mpi-error">Introduce un valor positivo.</p>'; codeEl.textContent = ''; return; }

      var seg;
      if (selMag.value === 'f') seg = 1 / val;            // frecuencia -> periodo
      else seg = val * parseFloat(selUni.value);          // tiempo -> segundos

      var r = calcular(seg, tipo, modo32, pbclk);
      if (!r.ok) {
        var sugerencia = tipo.puede32 && !modo32
          ? 'Activa el modo <b>32 bits</b> o encadena varias cuentas.'
          : 'Encadena varias cuentas (un contador en software) o usa un periodo menor.';
        divRes.innerHTML = '<p class="mpi-error">Fuera de rango: ni con prescaler 1:256 cabe en PR (máx ' + r.maxPR + '). ' + sugerencia + '</p>';
        codeEl.textContent = '';
        codeEl.removeAttribute('data-resaltado');
        return;
      }

      var c = codigoC(tipo, modo32, r);
      var avisoErr = Math.abs(r.errPct) > 0.01
        ? '<span class="st-aviso">≠ exacto: ' + (r.errPct > 0 ? '+' : '') + redondea(r.errPct, 4) + ' %</span>'
        : '<span class="st-exacto">exacto</span>';

      divRes.innerHTML =
        '<table class="st-tabla">' +
          fila('Prescaler', '1:' + r.div + '  (TCKPS = ' + r.tckps + ')') +
          fila('PR' + (modo32 ? '2 (32 bits)' : tipo.n), '<b>' + r.PR + '</b>' + (r.PR > 65535 ? ' <span class="st-aviso">(necesita 32 bits)</span>' : '')) +
          fila((modo32 ? 'T2CON' : 'T' + tipo.n + 'CON'), '<b>' + hex4(c.txcon) + '</b>') +
          fila('Tiempo conseguido', fmtTiempo(r.real) + ' ' + avisoErr) +
          fila('Frecuencia', redondea(1 / r.real, 4) + ' Hz') +
        '</table>';

      codeEl.textContent = c.code;
      codeEl.removeAttribute('data-resaltado');
      if (MPI.resaltarTodo) MPI.resaltarTodo(el);
    }

    function fila(k, v) { return '<tr><th>' + k + '</th><td>' + v + '</td></tr>'; }

    [selTipo, chk32, selMag, selUni].forEach(function (n) { n.addEventListener('change', function () { sincronizarUnidades(); recomputar(); }); });
    [inpVal, inpPb].forEach(function (n) { n.addEventListener('input', recomputar); });

    sincronizarUnidades();
    recomputar();
  };
})();
