/*
 * Componente "calc-u1brg": generador de baudios de la UART1 del dsPIC33FJ32MC202
 * (tema UART, cap. 14 del libro; datasheet 19.0).
 *
 * Uso:
 *   <div class="mpi-mount" data-componente="calc-u1brg"
 *        data-config='{"fcy":39613750,"baudios":38400}'></div>
 *
 * Claves de data-config (todas opcionales):
 *   fcy      39613750 (exacto, por defecto) o 40000000 (aproximado). Solo esos dos.
 *   baudios  velocidad deseada (defecto 38400, la del libro).
 *   brgh     0 (defecto, como el libro: 16 relojes por bit) o 1 (4 relojes por bit).
 *
 * Cálculos:
 *   - Código del libro (división entera de C): U1BRG = (FCY/BAUDRATE)/16 - 1
 *     (con BRGH = 1 el divisor es 4).
 *   - Con redondeo: U1BRG = round(FCY / (16·baudios) - 1).
 *   - Baudios reales = FCY / (16·(U1BRG + 1)); error = (reales − deseados)/deseados.
 *   - Tiempo de un byte 8N1 = 10 bits / baudios.
 * Ejemplo del libro: FCY = 39 613 750 Hz y 38 400 baudios →
 *   39613750/38400 = 1031 (entero), /16 = 64, −1 → U1BRG = 63;
 *   reales 38 685,3 baudios (+0,74 %); 260,4 µs por byte.
 */
window.MPI = window.MPI || {};
MPI.componentes = MPI.componentes || {};

(function () {
  var FCY_APROX = 40000000;
  var FCY_EXACTO = 39613750;
  var LISTA = [2400, 4800, 9600, 19200, 38400, 57600, 115200];
  var NBSP = ' ';
  var LIMITE_ERR = 2;   // % tolerable (verde ≤ 2 %, rojo si no)

  // ---------- Formato español ----------
  function agrupar(entero) {
    var s = String(entero);
    var neg = s.charAt(0) === '-';
    if (neg) s = s.slice(1);
    if (s.length >= 5) s = s.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
    return (neg ? '−' : '') + s;
  }
  // x con exactamente nd decimales (coma decimal).
  function fijo(x, nd) {
    var s = Math.abs(x).toFixed(nd);
    var p = s.split('.');
    return (x < 0 && Number(s) !== 0 ? '−' : '') + agrupar(p[0]) + (p[1] ? ',' + p[1] : '');
  }
  function pct(x) {
    var r = Math.round(x * 100) / 100;
    if (r === 0) return '0,00' + NBSP + '%';
    return (r > 0 ? '+' : '−') + fijo(Math.abs(r), 2) + NBSP + '%';
  }
  function fmtT(s) {
    var a = Math.abs(s);
    if (a >= 1) return fijo(s, 3) + NBSP + 's';
    if (a >= 1e-3) return fijo(s * 1e3, 3) + NBSP + 'ms';
    return fijo(s * 1e6, 1) + NBSP + 'µs';
  }

  function normFcy(v) {
    v = Number(v);
    if (Math.abs(v - FCY_APROX) < 1000) return FCY_APROX;
    return FCY_EXACTO;
  }
  function leerBaud(txt) {
    var s = String(txt).replace(/[\s  ._]/g, '');
    if (!/^\d+$/.test(s)) return null;
    var v = parseInt(s, 10);
    if (!(v >= 1 && v <= 10000000)) return null;
    return v;
  }

  // Cálculo completo para una velocidad.
  function calcular(fcy, baud, brgh) {
    var div = brgh ? 4 : 16;
    var cociente = Math.floor(fcy / baud);          // FCY/BAUDRATE en C (entero)
    var trasDiv = Math.floor(cociente / div);       // ( … )/16
    var brgInt = trasDiv - 1;                       // − 1
    var exacto = fcy / (div * baud) - 1;
    var brgRed = Math.round(exacto);
    function real(brg) { return (brg >= 0 && brg <= 65535) ? fcy / (div * (brg + 1)) : NaN; }
    var rInt = real(brgInt), rRed = real(brgRed);
    return {
      div: div, cociente: cociente, trasDiv: trasDiv, exacto: exacto,
      brgInt: brgInt, rInt: rInt, eInt: (rInt - baud) / baud * 100,
      brgRed: brgRed, rRed: rRed, eRed: (rRed - baud) / baud * 100,
      okInt: brgInt >= 0 && brgInt <= 65535, okRed: brgRed >= 0 && brgRed <= 65535,
      tByte: 10 / baud
    };
  }

  function marcaErr(e, ok) {
    if (!ok || !isFinite(e)) return '<span class="cub-err-no">—</span>';
    var bien = Math.abs(e) <= LIMITE_ERR;
    return '<span class="' + (bien ? 'cub-err-ok' : 'cub-err-no') + '">' + pct(e) +
      '<span class="cub-oculto">' + (bien ? ' (aceptable, ≤ 2 %)' : ' (excesivo, > 2 %)') + '</span></span>';
  }

  function pintarCodigo(pre, texto) {
    pre.innerHTML = '<code class="lang-c"></code>';
    pre.firstChild.textContent = texto;
    if (MPI.resaltarTodo) MPI.resaltarTodo(pre);
  }

  var ID = 0;

  MPI.componentes['calc-u1brg'] = function (el, cfg) {
    cfg = cfg || {};
    var uid = 'cub' + (++ID);
    var fcy = normFcy(cfg.fcy != null ? cfg.fcy : FCY_EXACTO);
    var baud = leerBaud(cfg.baudios != null ? cfg.baudios : 38400) || 38400;
    var brgh = Number(cfg.brgh) === 1 ? 1 : 0;

    var opcB = '';
    LISTA.forEach(function (b) {
      opcB += '<option value="' + b + '"' + (b === baud ? ' selected' : '') + '>' + agrupar(b) + '</option>';
    });
    opcB += '<option value="otra"' + (LISTA.indexOf(baud) < 0 ? ' selected' : '') + '>otra…</option>';

    el.classList.add('mpi-calc-u1brg');
    el.innerHTML =
      '<div class="mpi-sim-cab">U1BRG · generador de baudios de la UART1 <span class="cub-cab-sub">calculadora</span></div>' +
      '<div class="cub-form">' +
        '<label><span>F<sub>CY</sub></span> <select class="cub-fcy" aria-label="Frecuencia de instrucción FCY">' +
          '<option value="' + FCY_EXACTO + '"' + (fcy === FCY_EXACTO ? ' selected' : '') + '>39' + NBSP + '613' + NBSP + '750 Hz (exacto)</option>' +
          '<option value="' + FCY_APROX + '"' + (fcy === FCY_APROX ? ' selected' : '') + '>40' + NBSP + '000' + NBSP + '000 Hz (aproximado)</option>' +
        '</select></label>' +
        '<label>Baudios <select class="cub-bsel" aria-label="Velocidad en baudios (lista)">' + opcB + '</select></label>' +
        '<label for="' + uid + '-b">otra <input id="' + uid + '-b" class="cub-bin" type="text" inputmode="numeric" spellcheck="false" autocomplete="off" ' +
          'aria-describedby="' + uid + '-err" aria-label="Velocidad en baudios (valor libre)" value="' + baud + '"></label>' +
        '<label>BRGH <select class="cub-brgh" aria-label="Bit BRGH de U1MODE">' +
          '<option value="0"' + (brgh === 0 ? ' selected' : '') + '>0 — 16 relojes/bit (libro)</option>' +
          '<option value="1"' + (brgh === 1 ? ' selected' : '') + '>1 — 4 relojes/bit (datasheet)</option>' +
        '</select></label>' +
      '</div>' +
      '<p class="cub-err" id="' + uid + '-err" role="alert"></p>' +
      '<p class="cub-formula" aria-live="polite"></p>' +
      '<div class="cub-res"></div>' +
      '<pre class="cub-codigo"></pre>' +
      '<p class="cub-nota"></p>' +
      '<div class="cub-scroll" tabindex="0" role="region" aria-label="Tabla comparativa de velocidades">' +
        '<table class="cub-tabla"><caption></caption><thead><tr>' +
          '<th scope="col" rowspan="2">Baudios</th>' +
          '<th scope="colgroup" colspan="3">Código del libro (entero)</th>' +
          '<th scope="colgroup" colspan="3">Con redondeo</th>' +
          '<th scope="col" rowspan="2">Byte 8N1</th>' +
        '</tr><tr>' +
          '<th scope="col">U1BRG</th><th scope="col">Reales</th><th scope="col">Error</th>' +
          '<th scope="col">U1BRG</th><th scope="col">Reales</th><th scope="col">Error</th>' +
        '</tr></thead><tbody></tbody></table>' +
      '</div>';

    var q = function (s) { return el.querySelector(s); };
    var selF = q('.cub-fcy'), selB = q('.cub-bsel'), inB = q('.cub-bin'), selH = q('.cub-brgh');
    var errP = q('.cub-err'), formP = q('.cub-formula'), res = q('.cub-res'), pre = q('.cub-codigo');
    var nota = q('.cub-nota'), tbody = q('.cub-tabla tbody'), cap = q('.cub-tabla caption');

    function pintar() {
      var r = calcular(fcy, baud, brgh);
      var D = r.div;
      var fcyTxt = agrupar(fcy);
      formP.innerHTML = 'U1BRG = F<sub>CY</sub> / (' + D + ' · baudios) − 1 &nbsp;·&nbsp; baudios reales = F<sub>CY</sub> / (' + D + ' · (U1BRG + 1))';

      var h = '';
      // Código del libro, paso a paso
      h += '<div class="cub-bloque">' +
        '<div class="cub-bloque-tit">Código del libro: <code>(FCY/BAUDRATE)/' + D + ' - 1</code> <span class="cub-tenue">(divisiones enteras de C)</span></div>';
      if (r.okInt) {
        h += '<ol class="cub-pasos">' +
          '<li><code>FCY/BAUDRATE</code> = ' + fcyTxt + ' / ' + agrupar(baud) + ' = ' + fijo(fcy / baud, 3) + ' → <b>' + agrupar(r.cociente) + '</b></li>' +
          '<li><code>/' + D + '</code> = ' + agrupar(r.cociente) + ' / ' + D + ' = ' + fijo(r.cociente / D, 3) + ' → <b>' + agrupar(r.trasDiv) + '</b></li>' +
          '<li><code>- 1</code> → <b class="cub-grande">U1BRG = ' + agrupar(r.brgInt) + '</b></li>' +
        '</ol>' +
        '<div class="cub-kv"><span>Baudios reales</span><b>' + fijo(r.rInt, 1) + '</b>' +
          '<span class="cub-tenue">= ' + fcyTxt + ' / (' + D + ' · ' + agrupar(r.brgInt + 1) + ')</span></div>' +
        '<div class="cub-kv"><span>Error</span>' + marcaErr(r.eInt, true) + '</div>';
      } else {
        h += '<p class="cub-aviso">' + (r.brgInt < 0
          ? 'U1BRG saldría negativo (' + agrupar(r.brgInt) + '): esa velocidad es demasiado alta para F<sub>CY</sub> con BRGH = ' + brgh + '.'
          : 'U1BRG = ' + agrupar(r.brgInt) + ' no cabe en 16 bits (máx. 65' + NBSP + '535): velocidad demasiado baja.') + '</p>';
      }
      h += '</div>';

      // Con redondeo
      h += '<div class="cub-bloque">' +
        '<div class="cub-bloque-tit">Con redondeo: <code>F<sub>CY</sub>/(' + D + '·baudios) − 1</code></div>';
      if (r.okRed) {
        h += '<ol class="cub-pasos">' +
          '<li>' + fcyTxt + ' / (' + D + ' · ' + agrupar(baud) + ') − 1 = ' + fijo(r.exacto, 3) + '</li>' +
          '<li>redondeado → <b class="cub-grande">U1BRG = ' + agrupar(r.brgRed) + '</b>' +
            (r.brgRed !== r.brgInt && r.okInt ? ' <span class="cub-dif">(distinto del código)</span>' : '') + '</li>' +
        '</ol>' +
        '<div class="cub-kv"><span>Baudios reales</span><b>' + fijo(r.rRed, 1) + '</b>' +
          '<span class="cub-tenue">= ' + fcyTxt + ' / (' + D + ' · ' + agrupar(r.brgRed + 1) + ')</span></div>' +
        '<div class="cub-kv"><span>Error</span>' + marcaErr(r.eRed, true) + '</div>';
      } else {
        h += '<p class="cub-aviso">No hay valor válido de U1BRG (0 a 65' + NBSP + '535) para esa velocidad.</p>';
      }
      h += '</div>';

      // Tiempo de un byte
      h += '<div class="cub-bloque cub-byte">' +
        '<div class="cub-bloque-tit">Tiempo de un byte 8N1</div>' +
        '<div class="cub-kv"><span>10 bits / baudios</span><b>' + fmtT(r.tByte) + '</b>' +
          '<span class="cub-tenue">= 10 / ' + agrupar(baud) + ' (start + 8 datos + stop)</span></div>' +
        (r.okInt ? '<div class="cub-kv cub-tenue"><span>con los baudios reales</span><span>' + fmtT(10 / r.rInt) + '</span></div>' : '') +
      '</div>';
      res.innerHTML = h;

      // Código C
      var brg = r.okInt ? r.brgInt : null;
      var cod = '#define FCY ' + fcy + '      // Hz\n' +
        '#define BAUDRATE ' + baud + '   // baudios (bps)\n' +
        (brgh ? 'U1MODEbits.BRGH = 1;            // 4 relojes por bit (alta velocidad)\n'
              : '// BRGH = 0 tras el reset: 16 relojes por bit (el libro no lo toca)\n') +
        'U1BRG = (FCY/BAUDRATE)/' + D + ' - 1;   // = ' + (brg != null ? brg : 'fuera de rango') + '\n' +
        (r.okRed ? 'U1BRG = ' + r.brgRed + ';' + new Array(Math.max(2, 26 - String(r.brgRed).length)).join(' ') +
          '// valor ya calculado (con redondeo)' : '');
      pintarCodigo(pre, cod);

      nota.innerHTML = brgh
        ? 'BRGH = 1 es una ampliación del datasheet (U1MODE bit 3: «4 clocks per bit period»). El libro trabaja siempre con BRGH = 0 (divisor 16). El error se marca en verde si es ≤ 2' + NBSP + '%.'
        : 'El libro usa BRGH = 0 (valor tras el reset: 16 relojes por bit). Las divisiones enteras del código truncan, por eso a veces el redondeo da un U1BRG con menos error. El error se marca en verde si es ≤ 2' + NBSP + '%.';

      // Tabla comparativa
      var lista = LISTA.slice();
      if (lista.indexOf(baud) < 0) { lista.push(baud); lista.sort(function (a, b) { return a - b; }); }
      cap.textContent = 'Todas las velocidades con FCY = ' + fcyTxt + ' Hz y BRGH = ' + brgh;
      var filas = '';
      lista.forEach(function (b) {
        var x = calcular(fcy, b, brgh);
        filas += '<tr' + (b === baud ? ' class="cub-sel" aria-current="true"' : '') + '>' +
          '<th scope="row">' + agrupar(b) + '</th>' +
          '<td>' + (x.okInt ? agrupar(x.brgInt) : '—') + '</td>' +
          '<td>' + (x.okInt ? fijo(x.rInt, 1) : '—') + '</td>' +
          '<td>' + marcaErr(x.eInt, x.okInt) + '</td>' +
          '<td>' + (x.okRed ? agrupar(x.brgRed) + (x.okInt && x.brgRed !== x.brgInt ? ' <span class="cub-dif" title="Distinto del código">≠</span>' : '') : '—') + '</td>' +
          '<td>' + (x.okRed ? fijo(x.rRed, 1) : '—') + '</td>' +
          '<td>' + marcaErr(x.eRed, x.okRed) + '</td>' +
          '<td>' + fmtT(x.tByte) + '</td></tr>';
      });
      tbody.innerHTML = filas;
    }

    function leerInput() {
      var v = leerBaud(inB.value);
      if (v == null) {
        errP.textContent = 'Escribe una velocidad entera entre 1 y 10' + NBSP + '000' + NBSP + '000 baudios.';
        inB.setAttribute('aria-invalid', 'true');
        return;
      }
      errP.textContent = '';
      inB.removeAttribute('aria-invalid');
      baud = v;
      selB.value = LISTA.indexOf(v) >= 0 ? String(v) : 'otra';
      pintar();
    }

    selF.addEventListener('change', function () { fcy = normFcy(selF.value); pintar(); });
    selH.addEventListener('change', function () { brgh = selH.value === '1' ? 1 : 0; pintar(); });
    selB.addEventListener('change', function () {
      if (selB.value === 'otra') { inB.focus(); inB.select(); return; }
      baud = parseInt(selB.value, 10);
      inB.value = baud;
      errP.textContent = ''; inB.removeAttribute('aria-invalid');
      pintar();
    });
    inB.addEventListener('input', leerInput);

    pintar();
  };
})();
