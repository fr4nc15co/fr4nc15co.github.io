/*
 * Componente "calc-reloj": calculadora del reloj del dsPIC33FJ32MC202
 * (datasheet, sección 8.0 Oscillator Configuration, Ecuaciones 8-1 y 8-2).
 *
 *   FOSC = FIN · M / (N1 · N2)        FCY = FOSC / 2        TCY = 1 / FCY
 *   N1 = PLLPRE + 2   (2…33)    entrada del VCO  FIN/N1 en 0,8-8 MHz
 *   M  = PLLDIV + 2   (2…513)   salida del VCO   FVCO   en 100-200 MHz
 *   N2 = 2, 4 u 8 (PLLPOST = 00, 01, 11)        FOSC   en 12,5-80 MHz
 *
 * Uso en el contenido:
 *   <div class="mpi-mount" data-componente="calc-reloj"
 *        data-config='{"frc":7370000,"fcy":39613750}'></div>
 *
 * data-config (todas opcionales):
 *   frc:   frecuencia del FRC en Hz (por defecto 7 370 000)
 *   fcy:   FCY exacto del curso en Hz (por defecto 39 613 750)
 *   aprox: FCY aproximado con el que se hacen los cálculos (por defecto 40 000 000)
 *   n1, m, n2: valores iniciales (por defecto la configuración del curso 2, 43, 2)
 */
window.MPI = window.MPI || {};
MPI.componentes = MPI.componentes || {};

(function () {

  var NBSP = ' ';

  // Número en formato español: coma decimal y espacios de millar (si > 4 cifras).
  function fmt(x, dec) {
    if (!isFinite(x)) return '—';
    var neg = x < 0;
    var s = Math.abs(x).toFixed(dec == null ? 0 : dec);
    var partes = s.split('.');
    var ent = partes[0];
    if (ent.length > 4) ent = ent.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
    return (neg ? '−' : '') + ent + (partes[1] ? ',' + partes[1] : '');
  }
  // Como fmt, pero quitando ceros decimales sobrantes.
  function fmtCorto(x, maxDec) {
    var s = fmt(x, maxDec);
    if (s.indexOf(',') !== -1) s = s.replace(/0+$/, '').replace(/,$/, '');
    return s;
  }
  function mhz(hz) { return fmtCorto(hz / 1e6, 6) + NBSP + 'MHz'; }
  function hzTxt(hz) { return fmtCorto(hz, 2) + NBSP + 'Hz'; }
  function bin(v, n) { var s = v.toString(2); while (s.length < n) s = '0' + s; return s; }
  function hex(v, n) { var s = v.toString(16).toUpperCase(); while (s.length < n) s = '0' + s; return '0x' + s; }

  function leerNum(txt) {
    var s = String(txt).trim().replace(/\s/g, '').replace(',', '.');
    if (!/^\d+(\.\d+)?$/.test(s)) return NaN;
    return parseFloat(s);
  }

  var POST = { 2: 0, 4: 1, 8: 3 };   // N2 -> PLLPOST (10 está reservado)

  MPI.componentes['calc-reloj'] = function (el, cfg) {
    cfg = cfg || {};
    var FRC = +cfg.frc > 0 ? +cfg.frc : 7370000;
    var FCY_LIBRO = +cfg.fcy > 0 ? +cfg.fcy : 39613750;
    var APROX = +cfg.aprox > 0 ? +cfg.aprox : 40000000;
    var CURSO = { n1: 2, m: 43, n2: 2 };
    var ini = {
      n1: cfg.n1 != null ? cfg.n1 : CURSO.n1,
      m: cfg.m != null ? cfg.m : CURSO.m,
      n2: cfg.n2 != null ? cfg.n2 : CURSO.n2
    };
    var uid = 'cr' + Math.random().toString(36).slice(2, 8);

    el.classList.add('mpi-calc-reloj');
    el.innerHTML =
      '<div class="mpi-sim-cab">Calculadora del reloj: FRC → PLL → FOSC → FCY</div>' +
      '<p class="cr-formula">F<sub>OSC</sub> = F<sub>IN</sub> · M / (N1 · N2) &nbsp;·&nbsp; F<sub>CY</sub> = F<sub>OSC</sub> / 2 &nbsp;·&nbsp; T<sub>CY</sub> = 1 / F<sub>CY</sub></p>' +
      '<div class="cr-form">' +
        '<div class="cr-campo">' +
          '<label for="' + uid + '-fin">F<sub>IN</sub> (MHz)</label>' +
          '<input id="' + uid + '-fin" class="cr-fin" type="text" inputmode="decimal" spellcheck="false" autocomplete="off" aria-describedby="' + uid + '-fin-h">' +
          '<small id="' + uid + '-fin-h">FRC nominal: ' + mhz(FRC) + '</small>' +
        '</div>' +
        '<div class="cr-campo">' +
          '<label for="' + uid + '-n1">N1 (prescaler)</label>' +
          '<input id="' + uid + '-n1" class="cr-n1" type="number" min="2" max="33" step="1" aria-describedby="' + uid + '-n1-h">' +
          '<small id="' + uid + '-n1-h">2…33 · PLLPRE = N1 − 2</small>' +
        '</div>' +
        '<div class="cr-campo cr-campo-m">' +
          '<label for="' + uid + '-m">M (multiplicador)</label>' +
          '<div class="cr-m-fila">' +
            '<input id="' + uid + '-m" class="cr-m" type="number" min="2" max="513" step="1" aria-describedby="' + uid + '-m-h">' +
            '<input class="cr-m-rango" type="range" min="2" max="513" step="1" aria-label="M (deslizador)" aria-describedby="' + uid + '-m-h">' +
          '</div>' +
          '<small id="' + uid + '-m-h">2…513 · PLLDIV = M − 2</small>' +
        '</div>' +
        '<div class="cr-campo cr-campo-n2">' +
          '<label for="' + uid + '-n2">N2 (postscaler)</label>' +
          '<select id="' + uid + '-n2" class="cr-n2" aria-describedby="' + uid + '-n2-h">' +
            '<option value="2">2 (PLLPOST = 00)</option>' +
            '<option value="4">4 (PLLPOST = 01)</option>' +
            '<option value="8">8 (PLLPOST = 11)</option>' +
          '</select>' +
          '<small id="' + uid + '-n2-h">PLLPOST = 10 está reservado</small>' +
        '</div>' +
      '</div>' +
      '<div class="cr-botones">' +
        '<button type="button" class="cr-curso">Configuración del curso</button>' +
        '<button type="button" class="cr-ds">Ejemplo del datasheet (cristal de 10 MHz)</button>' +
      '</div>' +
      '<p class="cr-error" role="alert"></p>' +
      '<div class="cr-cadena" aria-hidden="true"></div>' +
      '<div class="cr-resultados" aria-live="polite">' +
        '<table class="cr-tabla"><tbody></tbody></table>' +
        '<div class="cr-regs"></div>' +
        '<div class="cr-aprox"></div>' +
      '</div>';

    var inFin = el.querySelector('.cr-fin');
    var inN1 = el.querySelector('.cr-n1');
    var inM = el.querySelector('.cr-m');
    var inMr = el.querySelector('.cr-m-rango');
    var inN2 = el.querySelector('.cr-n2');
    var errorEl = el.querySelector('.cr-error');
    var cadena = el.querySelector('.cr-cadena');
    var tbody = el.querySelector('.cr-tabla tbody');
    var regs = el.querySelector('.cr-regs');
    var aprox = el.querySelector('.cr-aprox');

    function poner(fin, n1, m, n2) {
      inFin.value = fmtCorto(fin / 1e6, 6).replace(/ /g, '');
      inN1.value = n1;
      inM.value = m; inMr.value = m;
      inN2.value = String(POST[n2] != null ? n2 : 2);
      calcular();
    }

    function estado(ok) { return ok ? '<span class="cr-ok">✓ en rango</span>' : ''; }

    function calcular() {
      var finMHz = leerNum(inFin.value);
      var n1 = leerNum(inN1.value), m = leerNum(inM.value), n2 = parseInt(inN2.value, 10);
      var errs = [];
      var finOk = isFinite(finMHz) && finMHz > 0 && finMHz <= 40;
      var n1Ok = isFinite(n1) && n1 === Math.floor(n1) && n1 >= 2 && n1 <= 33;
      var mOk = isFinite(m) && m === Math.floor(m) && m >= 2 && m <= 513;
      if (!finOk) errs.push('F<sub>IN</sub> debe ser un número mayor que 0 y de como máximo 40 MHz (p. ej. 7,37).');
      if (!n1Ok) errs.push('N1 debe ser un entero entre 2 y 33.');
      if (!mOk) errs.push('M debe ser un entero entre 2 y 513.');
      inFin.setAttribute('aria-invalid', finOk ? 'false' : 'true');
      inN1.setAttribute('aria-invalid', n1Ok ? 'false' : 'true');
      inM.setAttribute('aria-invalid', mOk ? 'false' : 'true');
      if (mOk) inMr.value = m;
      errorEl.innerHTML = errs.join(' ');
      el.classList.toggle('cr-invalido', errs.length > 0);
      if (errs.length) {
        tbody.innerHTML = ''; regs.innerHTML = ''; aprox.innerHTML = ''; cadena.innerHTML = '';
        return;
      }

      var fin = Math.round(finMHz * 1e6);       // Hz enteros
      var fref = fin / n1;
      var fvco = fin * m / n1;
      var fosc = fin * m / (n1 * n2);
      var fcy = fosc / 2;
      var tcy = 1e9 / fcy;                       // ns
      var refOk = fref >= 0.8e6 && fref <= 8e6;
      var vcoOk = fvco >= 100e6 && fvco <= 200e6;
      var oscOk = fosc >= 12.5e6 && fosc <= 80e6;
      var esLibro = Math.abs(fcy - FCY_LIBRO) < 0.5;

      // Cadena visual FIN → ÷N1 → ×M → ÷N2 → ÷2
      function caja(tit, val, ok) {
        return '<div class="cr-caja' + (ok === false ? ' cr-caja-mal' : '') + '"><span class="cr-caja-tit">' + tit + '</span><span class="cr-caja-val">' + val + '</span></div>';
      }
      function op(t) { return '<div class="cr-op">' + t + '</div>'; }
      cadena.innerHTML =
        caja('F<sub>IN</sub>', mhz(fin)) + op('÷' + n1) +
        caja('Entrada VCO', mhz(fref), refOk) + op('×' + m) +
        caja('F<sub>VCO</sub>', mhz(fvco), vcoOk) + op('÷' + n2) +
        caja('F<sub>OSC</sub>', mhz(fosc), oscOk) + op('÷2') +
        caja('F<sub>CY</sub>', mhz(fcy), fcy <= 40e6);

      var filas = [
        ['Entrada del VCO (F<sub>IN</sub>/N1)', mhz(fref),
          refOk ? estado(true) : '<span class="cr-aviso">⚠ fuera de rango: debe estar entre 0,8 y 8 MHz</span>'],
        ['Salida del VCO (F<sub>VCO</sub>)', mhz(fvco),
          vcoOk ? estado(true) : '<span class="cr-aviso">⚠ fuera de rango: debe estar entre 100 y 200 MHz</span>'],
        ['F<sub>OSC</sub> = F<sub>VCO</sub>/N2', hzTxt(fosc) + ' <small>(' + mhz(fosc) + ')</small>',
          oscOk ? estado(true) : '<span class="cr-aviso">⚠ fuera de rango: debe estar entre 12,5 y 80 MHz</span>'],
        ['F<sub>CY</sub> = F<sub>OSC</sub>/2', '<b>' + hzTxt(fcy) + '</b>',
          fcy > 40e6 ? '<span class="cr-aviso">⚠ supera los 40 MHz máximos</span>'
            : (esLibro ? '<span class="cr-ok">✓ es el F<sub>CY</sub> exacto del curso</span>' : '')],
        ['T<sub>CY</sub> = 1/F<sub>CY</sub>', '≈ ' + fmt(tcy, 2) + NBSP + 'ns', ''],
        ['Velocidad', fmtCorto(fcy / 1e6, 4) + NBSP + 'MIPS', '<small>1 instrucción por ciclo T<sub>CY</sub></small>']
      ];
      tbody.innerHTML = filas.map(function (f) {
        return '<tr><th scope="row">' + f[0] + '</th><td>' + f[1] + '</td><td class="cr-est">' + f[2] + '</td></tr>';
      }).join('');

      var pllpre = n1 - 2, plldiv = m - 2, pllpost = POST[n2];
      regs.innerHTML =
        '<div class="cr-regs-tit">Valores de los bits de configuración</div>' +
        '<ul>' +
          '<li><code>PLLPRE</code> = N1 − 2 = <b>' + pllpre + '</b> <span class="cr-bin">(CLKDIV&lt;4:0&gt; = ' + bin(pllpre, 5) + ')</span></li>' +
          '<li><code>PLLDIV</code> = M − 2 = <b>' + plldiv + '</b> <span class="cr-bin">(PLLFBD&lt;8:0&gt; = ' + hex(plldiv, 3) + ')</span></li>' +
          '<li><code>PLLPOST</code> = <b>' + pllpost + '</b> <span class="cr-bin">(CLKDIV&lt;7:6&gt; = ' + bin(pllpost, 2) + ', N2 = ' + n2 + ')</span></li>' +
        '</ul>';

      // Comparación con la aproximación de 40 MHz usada en los cálculos.
      var dif = APROX - fcy;
      var errRel = dif / fcy * 100;
      var tReal = APROX / fcy;   // duración real de un retardo calculado para 1 s
      aprox.innerHTML =
        '<div class="cr-regs-tit">Frente a la aproximación de ' + mhz(APROX) + ' de los cálculos del curso</div>' +
        '<p>Diferencia: ' + fmt(APROX / 1e6, 0) + NBSP + 'MHz − F<sub>CY</sub> = <b>' + fmtCorto(dif, 2) + NBSP + 'Hz</b> → ' +
        'error relativo de la aproximación = <b>' + (errRel >= 0 ? '+' : '') + fmt(errRel, 3) + NBSP + '%</b> respecto al valor real.' +
        ' Con ' + mhz(APROX) + ' sale T<sub>CY</sub> = ' + fmtCorto(1e9 / APROX, 3) + NBSP + 'ns en lugar de ' + fmt(tcy, 2) + NBSP + 'ns.</p>' +
        '<p class="cr-nota">Consecuencia práctica: un retardo calculado para 1 s suponiendo ' + mhz(APROX) +
        ' dura en realidad ' + fmt(tReal, 4) + NBSP + 's con este F<sub>CY</sub>.</p>';
    }

    [inFin, inN1, inM].forEach(function (i) { i.addEventListener('input', calcular); });
    inN2.addEventListener('change', calcular);
    inMr.addEventListener('input', function () { inM.value = inMr.value; calcular(); });
    el.querySelector('.cr-curso').addEventListener('click', function () { poner(FRC, CURSO.n1, CURSO.m, CURSO.n2); });
    el.querySelector('.cr-ds').addEventListener('click', function () { poner(10000000, 2, 32, 2); });

    poner(FRC, ini.n1, ini.m, ini.n2);
  };
})();
