/*
 * Componente "conv-unidades-scl": conversor de unidades para escribir estímulos SCL del
 * simulador de MPLAB X sin decimales (libro, cap. 22: 22.2.1, 22.2.4, 22.3.2 y 22.3.5).
 *
 * Uso:
 *   <div class="mpi-mount" data-componente="conv-unidades-scl" data-config='{"fcy":40000000}'></div>
 *
 * Claves de data-config (todas opcionales):
 *   fcy : 40000000 (por defecto; el simulador debe estar a 40 MHz, 22.2.4) o 39613750.
 *
 * Bloques:
 *   - Tensión: V ↔ mV → «AN5 <= 3300 mv;» (el simulador no admite 3,3 V).
 *   - Tiempo ↔ ciclos de instrucción (ic) a FCY, y el mismo tiempo en todas las unidades
 *     de SCL (ps, ns, us, ms, sec, min, hr) marcando cuáles dan decimales; elige la mayor
 *     unidad entera → «wait for 100000 ic;» y «wait for 2500 us;».
 *   - Frecuencia (hz, khz, mhz) sin decimales y su periodo en ic.
 *   - Comprobador de una línea SCL con los errores frecuentes del libro (22.3.5): faltan
 *     unidades, decimales, unidad aplicada a un paréntesis, mezcla de unidades, falta «;»
 *     o «then». Heurístico: no es un compilador de SCL.
 * Aritmética exacta con BigInt (sin errores de coma flotante).
 * Libro: 3,3 V → 3300 mv; 1 ms = 40 000 ic; 5000 ic = 125 µs; 2,5 ms = 100 000 ic = 2500 us.
 */
window.MPI = window.MPI || {};
MPI.componentes = MPI.componentes || {};

(function () {
  var FCY_APROX = 40000000;
  var FCY_EXACTO = 39613750;
  var NBSP = ' ';
  var HAY_BIGINT = typeof BigInt === 'function';
  var B = HAY_BIGINT ? BigInt : null;

  // Unidades de tiempo de SCL en ps (de mayor a menor).
  var UT = [['hr', '3600000000000000'], ['min', '60000000000000'], ['sec', '1000000000000'],
            ['ms', '1000000000'], ['us', '1000000'], ['ns', '1000'], ['ps', '1']];
  var UF = [['mhz', '1000000'], ['khz', '1000'], ['hz', '1']];
  var NOMBRE_U = { hr: 'hr', min: 'min', sec: 'sec', ms: 'ms', us: 'us (µs)', ns: 'ns', ps: 'ps', ic: 'ic (ciclos)' };
  var CAT = { ps: 'time', ns: 'time', us: 'time', ms: 'time', sec: 'time', min: 'time', hr: 'time', ic: 'cycle', mv: 'tensión', hz: 'frequency', khz: 'frequency', mhz: 'frequency' };
  var UNID_RE = '(?:ps|ns|us|ms|sec|min|hr|ic|mv|hz|khz|mhz)';

  // ---------- Utilidades BigInt ----------
  function pot10(n) { var r = B(1); for (var i = 0; i < n; i++) r *= B(10); return r; }
  // "3,3" → {m: 33n, d: 1}; null si no es un número decimal no negativo.
  function leerDec(txt) {
    var s = String(txt).replace(/[\s  ]/g, '');
    if (!/^\d+([.,]\d+)?$/.test(s) && !/^[.,]\d+$/.test(s)) return null;
    s = s.replace(',', '.');
    var p = s.split('.');
    var dec = p[1] || '';
    if ((p[0] + dec).length > 30) return null;
    return { m: B((p[0] || '0') + dec), d: dec.length };
  }
  function agrupar(str) {
    var neg = str.charAt(0) === '-';
    if (neg) str = str.slice(1);
    if (str.length >= 5) str = str.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
    return (neg ? '−' : '') + str;
  }
  // Racional num/den (BigInt ≥ 0) → texto español con hasta nd decimales; exacto o «≈».
  function fmtRat(num, den, nd) {
    nd = nd == null ? 3 : nd;
    var exacto = num % den === B(0);
    var f = pot10(nd);
    var r = (num * f * B(2) + den) / (B(2) * den);       // redondeo a nd decimales
    var ent = (r / f).toString(), dec = (r % f).toString();
    while (dec.length < nd) dec = '0' + dec;
    dec = dec.replace(/0+$/, '');
    // entero: num/den es entero; aprox: el texto con nd decimales no es exacto.
    return { txt: agrupar(ent) + (dec ? ',' + dec : ''), entero: exacto, aprox: (num * f) % den !== B(0) };
  }
  function redondear(num, den) { return (num * B(2) + den) / (B(2) * den); }
  function plano(bi) { return bi.toString(); }    // sin separadores: para el código SCL
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function normFcy(v) {
    v = Number(v);
    return Math.abs(v - FCY_EXACTO) < 1000 ? FCY_EXACTO : FCY_APROX;
  }

  // Tiempo «m·10^-d unidad» → ps exactos (racional num/den).
  function aPs(dec, unidad) {
    for (var i = 0; i < UT.length; i++) if (UT[i][0] === unidad) return { num: dec.m * B(UT[i][1]), den: pot10(dec.d) };
    return null;
  }
  // ps enteros → mejor unidad (la mayor que da un entero).
  function mejorUnidad(ps) {
    for (var i = 0; i < UT.length; i++) {
      var f = B(UT[i][1]);
      if (ps % f === B(0)) return { v: ps / f, u: UT[i][0] };
    }
    return { v: ps, u: 'ps' };
  }

  var ID = 0;

  MPI.componentes['conv-unidades-scl'] = function (el, cfg) {
    cfg = cfg || {};
    var uid = 'cus' + (++ID);
    var fcy = normFcy(cfg.fcy != null ? cfg.fcy : FCY_APROX);

    el.classList.add('mpi-conv-unidades-scl');
    if (!HAY_BIGINT) {
      el.innerHTML = '<div class="mpi-sim-cab">Unidades para SCL</div><p class="cus-aviso cus-mal">Este navegador es demasiado antiguo (no tiene BigInt) para el conversor.</p>';
      return;
    }

    function selU(clase, id, lista, def, etiqueta) {
      var h = '<select id="' + id + '" class="' + clase + '" aria-label="' + etiqueta + '">';
      lista.forEach(function (u) { h += '<option value="' + u[0] + '"' + (u[0] === def ? ' selected' : '') + '>' + u[1] + '</option>'; });
      return h + '</select>';
    }
    function bloqueCodigo(clase) {
      return '<div class="cus-cod"><pre class="cus-pre ' + clase + '"><code></code></pre>' +
        '<button type="button" class="cus-btn cus-copiar" data-de="' + clase + '">Copiar</button></div>';
    }
    var opT = [['ps', 'ps'], ['ns', 'ns'], ['us', 'us (µs)'], ['ms', 'ms'], ['sec', 'sec'], ['min', 'min'], ['hr', 'hr'], ['ic', 'ic (ciclos)']];
    var opPin = [];
    for (var a = 0; a <= 5; a++) opPin.push(['AN' + a, 'AN' + a]);

    el.innerHTML =
      '<div class="mpi-sim-cab">Unidades para estímulos SCL · sin decimales <span class="cus-cab-sub">conversor</span></div>' +
      '<div class="cus-top"><label for="' + uid + '-fcy">Frecuencia del simulador (F<sub>CY</sub>)</label> ' +
        '<select id="' + uid + '-fcy" class="cus-fcy">' +
          '<option value="' + FCY_APROX + '"' + (fcy === FCY_APROX ? ' selected' : '') + '>40' + NBSP + '000' + NBSP + '000 Hz (libro, 22.2.4)</option>' +
          '<option value="' + FCY_EXACTO + '"' + (fcy === FCY_EXACTO ? ' selected' : '') + '>39' + NBSP + '613' + NBSP + '750 Hz (exacto)</option>' +
        '</select> <span class="cus-tcy"></span></div>' +
      '<div class="cus-rejilla">' +
        // Tensión
        '<section class="cus-caja" aria-labelledby="' + uid + '-hv">' +
          '<h4 class="cus-tit" id="' + uid + '-hv">Tensión en un pin analógico</h4>' +
          '<div class="cus-form">' +
            '<label for="' + uid + '-v">Valor</label>' +
            '<input id="' + uid + '-v" class="cus-in cus-v" type="text" inputmode="decimal" spellcheck="false" autocomplete="off" value="3,3" aria-describedby="' + uid + '-ve">' +
            selU('cus-vu', uid + '-vu', [['V', 'V'], ['mV', 'mV']], 'V', 'Unidad de la tensión') +
            '<label for="' + uid + '-pin">Pin</label>' + selU('cus-pin', uid + '-pin', opPin, 'AN5', 'Pin analógico') +
          '</div>' +
          '<p class="cus-err" id="' + uid + '-ve" role="alert"></p>' +
          '<div class="cus-res cus-res-v" aria-live="polite"></div>' + bloqueCodigo('cus-cod-v') +
        '</section>' +
        // Tiempo
        '<section class="cus-caja" aria-labelledby="' + uid + '-ht">' +
          '<h4 class="cus-tit" id="' + uid + '-ht">Tiempo ↔ ciclos de instrucción</h4>' +
          '<div class="cus-form">' +
            '<label for="' + uid + '-t">Valor</label>' +
            '<input id="' + uid + '-t" class="cus-in cus-t" type="text" inputmode="decimal" spellcheck="false" autocomplete="off" value="2,5" aria-describedby="' + uid + '-te">' +
            selU('cus-tu', uid + '-tu', opT, 'ms', 'Unidad del tiempo') +
          '</div>' +
          '<div class="cus-ejs"><button type="button" class="cus-btn cus-ej" data-t="1" data-u="ms">1 ms</button>' +
            '<button type="button" class="cus-btn cus-ej" data-t="5000" data-u="ic">5000 ic</button>' +
            '<button type="button" class="cus-btn cus-ej" data-t="2,5" data-u="ms">2,5 ms</button>' +
            '<button type="button" class="cus-btn cus-ej" data-t="20" data-u="ms">20 ms (servo)</button></div>' +
          '<p class="cus-err" id="' + uid + '-te" role="alert"></p>' +
          '<div class="cus-res cus-res-t" aria-live="polite"></div>' +
          '<div class="cus-scroll"><table class="cus-tabla"><caption class="cus-sr">El mismo tiempo en cada unidad de SCL</caption>' +
            '<thead><tr><th scope="col">Unidad</th><th scope="col">Valor</th><th scope="col">¿Vale en SCL?</th></tr></thead><tbody></tbody></table></div>' +
          bloqueCodigo('cus-cod-t') +
        '</section>' +
        // Frecuencia
        '<section class="cus-caja" aria-labelledby="' + uid + '-hf">' +
          '<h4 class="cus-tit" id="' + uid + '-hf">Frecuencia</h4>' +
          '<div class="cus-form">' +
            '<label for="' + uid + '-f">Valor</label>' +
            '<input id="' + uid + '-f" class="cus-in cus-f" type="text" inputmode="decimal" spellcheck="false" autocomplete="off" value="1,5" aria-describedby="' + uid + '-fe">' +
            selU('cus-fu', uid + '-fu', [['hz', 'hz'], ['khz', 'khz'], ['mhz', 'mhz']], 'khz', 'Unidad de la frecuencia') +
          '</div>' +
          '<p class="cus-err" id="' + uid + '-fe" role="alert"></p>' +
          '<div class="cus-res cus-res-f" aria-live="polite"></div>' + bloqueCodigo('cus-cod-f') +
        '</section>' +
        // Comprobador
        '<section class="cus-caja" aria-labelledby="' + uid + '-hl">' +
          '<h4 class="cus-tit" id="' + uid + '-hl">Comprobar una línea SCL (errores frecuentes, 22.3.5)</h4>' +
          '<label class="cus-sr" for="' + uid + '-l">Línea SCL</label>' +
          '<input id="' + uid + '-l" class="cus-in cus-l" type="text" spellcheck="false" autocomplete="off" value="if dc > (3990 + 10) ic then">' +
          '<div class="cus-ejs cus-ejs-l">' +
            '<button type="button" class="cus-btn cus-ejl">if dc &gt; 4000 then</button>' +
            '<button type="button" class="cus-btn cus-ejl">if dc &gt; 4000 ic then</button>' +
            '<button type="button" class="cus-btn cus-ejl">if dc &gt; (3990 + 10) ic then</button>' +
            '<button type="button" class="cus-btn cus-ejl">if dc &gt; (4000 ic + 10 ic) then</button>' +
            '<button type="button" class="cus-btn cus-ejl">wait for 2.5 ms;</button>' +
            '<button type="button" class="cus-btn cus-ejl">AN5 &lt;= 3,3 v;</button>' +
            '<button type="button" class="cus-btn cus-ejl">wait for 10 ic</button>' +
            '<button type="button" class="cus-btn cus-ejl">wait for 1 ms + 50 us;</button>' +
          '</div>' +
          '<div class="cus-diag" aria-live="polite"></div>' +
        '</section>' +
      '</div>' +
      '<p class="cus-nota">Reglas del libro (22.3.2 y 22.3.5): no hay decimales (ve a una unidad menor), las unidades se escriben siempre ' +
        '(<code>4000 ic</code>, no <code>4000</code>), no se mezclan tipos ni unidades en una operación y cada sentencia acaba en <code>;</code>. ' +
        'El tipo <code>time</code> es un entero de 64 bits en picosegundos; <code>cycle</code> cuenta ciclos de instrucción (<code>ic</code>); ' +
        '<code>frequency</code> va de 0 a 10<sup>9</sup> Hz.</p>';

    var q = function (s) { return el.querySelector(s); };
    var selFcy = q('.cus-fcy');

    function ponerCodigo(clase, texto) { q('.' + clase + ' code').textContent = texto; }
    function error(inp, idErr, msg) {
      var e = q('#' + idErr);
      e.textContent = msg || '';
      if (msg) inp.setAttribute('aria-invalid', 'true'); else inp.removeAttribute('aria-invalid');
    }

    // ---------- Tensión ----------
    function calcV() {
      var inp = q('.cus-v'), u = q('.cus-vu').value, pin = q('.cus-pin').value, res = q('.cus-res-v');
      var d = leerDec(inp.value);
      if (!d) { error(inp, uid + '-ve', 'Escribe una tensión no negativa (p. ej. 3,3).'); res.innerHTML = ''; ponerCodigo('cus-cod-v', ''); return; }
      error(inp, uid + '-ve', '');
      var num = d.m * (u === 'V' ? B(1000) : B(1)), den = pot10(d.d);
      var mv = redondear(num, den), r = fmtRat(num, den, 3);
      var h = '<div class="cus-kv"><span>' + esc(inp.value) + ' ' + u + ' =</span> <b>' + (r.aprox ? '≈ ' : '') + r.txt + ' mV</b></div>';
      if (!r.entero) h += '<p class="cus-aviso">Aún quedan decimales en mV: SCL no los admite y no hay una unidad menor; se redondea a <b>' + agrupar(plano(mv)) + ' mv</b>.</p>';
      if (u === 'V' && d.d > 0) h += '<p class="cus-ok">✓ El simulador no admite decimales: no se escribe ' + esc(inp.value) + ' V sino ' + agrupar(plano(mv)) + ' mv.</p>';
      if (mv > B(3300)) h += '<p class="cus-aviso">Más de 3300 mV: por encima de la alimentación de 3,3 V del dsPIC (y del fondo de escala del A/D con V<sub>REF</sub> = AV<sub>DD</sub>).</p>';
      res.innerHTML = h;
      ponerCodigo('cus-cod-v', pin + ' <= ' + plano(mv) + ' mv;');
    }

    // ---------- Tiempo ----------
    function calcT() {
      var inp = q('.cus-t'), u = q('.cus-tu').value, res = q('.cus-res-t'), tb = q('.cus-tabla tbody');
      var d = leerDec(inp.value);
      var limpiar = function () { res.innerHTML = ''; tb.innerHTML = ''; ponerCodigo('cus-cod-t', ''); };
      if (!d || d.m === B(0)) { error(inp, uid + '-te', 'Escribe un tiempo positivo (p. ej. 2,5).'); limpiar(); return; }
      if (u === 'ic' && d.d > 0) { error(inp, uid + '-te', 'Los ciclos de instrucción (ic) son enteros: no admiten decimales.'); limpiar(); return; }
      error(inp, uid + '-te', '');
      var F = B(String(fcy)), T12 = pot10(12);
      var ps, psExacto = true, icNum, icDen, h = '';
      if (u === 'ic') {
        icNum = d.m; icDen = B(1);
        var pn = d.m * T12;                         // ps = ic · 10^12 / FCY
        psExacto = pn % F === B(0);
        ps = redondear(pn, F);
      } else {
        var r = aPs(d, u);
        psExacto = r.num % r.den === B(0);
        ps = redondear(r.num, r.den);
        icNum = r.num * F; icDen = r.den * T12;     // ic = ps · FCY / 10^12
      }
      var ic = fmtRat(icNum, icDen, 3);
      var icEnt = redondear(icNum, icDen);
      var tcyTxt = fmtRat(T12, F, 3).txt;           // TCY en ps
      if (u === 'ic') {
        h += '<div class="cus-kv"><span>' + agrupar(plano(d.m)) + ' ic · T<sub>CY</sub> =</span> <b>' + (fmtRat(d.m * T12, F * B(1000000), 3).aprox ? '≈ ' : '') + fmtRat(d.m * T12, F * B(1000000), 3).txt + ' µs</b>' +
          ' <span class="cus-tenue">(T<sub>CY</sub> = 1 / F<sub>CY</sub> = ' + tcyTxt + ' ps)</span></div>';
      } else {
        h += '<div class="cus-kv"><span>' + esc(inp.value) + ' ' + u + ' · F<sub>CY</sub> =</span> <b>' + (ic.aprox ? '≈ ' : '') + ic.txt + ' ic</b></div>';
        if (!ic.entero) h += '<p class="cus-aviso">No es un número entero de ciclos: en SCL hay que redondear a <b>' + agrupar(plano(icEnt)) + ' ic</b>' +
          (fcy === FCY_EXACTO ? ' (con 40 MHz las cuentas salen enteras; el libro pide poner el simulador a 40 MHz).' : '.') + '</p>';
      }
      if (!psExacto) h += '<p class="cus-aviso">El tiempo exacto no es un número entero de picosegundos (la unidad mínima del tipo <code>time</code>): se redondea a ' + agrupar(plano(ps)) + ' ps.</p>';
      if (ps > B('9223372036854775807')) h += '<p class="cus-aviso cus-mal">Excede el tipo <code>time</code> (entero de 64 bits en ps, unas 2562 horas).</p>';
      if (ps === B(0)) h += '<p class="cus-aviso cus-mal">Menos de medio picosegundo: no representable.</p>';

      // Tabla de unidades
      var mejor = mejorUnidad(ps), filas = '';
      UT.forEach(function (x) {
        var f = B(x[1]), ent = ps % f === B(0), v = fmtRat(ps, f, 6);
        filas += '<tr class="' + (x[0] === mejor.u ? 'cus-mejor' : (ent ? '' : 'cus-nodec')) + '"><th scope="row">' + x[0] + '</th>' +
          '<td>' + (v.aprox ? '≈ ' : '') + v.txt + ' ' + x[0] + '</td>' +
          '<td>' + (ent ? (x[0] === mejor.u ? '<span class="cus-si">sí (recomendada)</span>' : '<span class="cus-si">sí</span>') : '<span class="cus-no">no: decimales</span>') + '</td></tr>';
      });
      tb.innerHTML = filas;
      h += '<div class="cus-kv"><span>Unidad recomendada</span> <b>' + agrupar(plano(mejor.v)) + ' ' + mejor.u + '</b></div>';
      res.innerHTML = h;
      ponerCodigo('cus-cod-t', 'wait for ' + plano(icEnt) + ' ic;' + (!ic.entero ? '        // redondeado' : '') + '\n' +
        'wait for ' + plano(mejor.v) + ' ' + mejor.u + ';' + (psExacto ? '' : '        // redondeado'));
    }

    // ---------- Frecuencia ----------
    function calcF() {
      var inp = q('.cus-f'), u = q('.cus-fu').value, res = q('.cus-res-f');
      var d = leerDec(inp.value);
      if (!d || d.m === B(0)) { error(inp, uid + '-fe', 'Escribe una frecuencia positiva (p. ej. 1,5).'); res.innerHTML = ''; ponerCodigo('cus-cod-f', ''); return; }
      error(inp, uid + '-fe', '');
      var fac = u === 'mhz' ? B(1000000) : (u === 'khz' ? B(1000) : B(1));
      var num = d.m * fac, den = pot10(d.d);
      var hz = redondear(num, den), exacta = num % den === B(0);
      var h = '<div class="cus-kv"><span>' + esc(inp.value) + ' ' + u + ' =</span> <b>' + (fmtRat(num, den, 3).aprox ? '≈ ' : '') + fmtRat(num, den, 3).txt + ' Hz</b></div>';
      if (!exacta) h += '<p class="cus-aviso">El tipo <code>frequency</code> va en hercios enteros: se redondea a ' + agrupar(plano(hz)) + ' hz.</p>';
      if (hz > B(1000000000)) h += '<p class="cus-aviso cus-mal">Fuera de rango: <code>frequency</code> va de 0 a 10<sup>9</sup> Hz.</p>';
      var mejor = { v: hz, u: 'hz' };
      for (var i = 0; i < UF.length; i++) { var f = B(UF[i][1]); if (hz > B(0) && hz % f === B(0)) { mejor = { v: hz / f, u: UF[i][0] }; break; } }
      var F = B(String(fcy));
      if (hz > B(0)) {
        var per = fmtRat(F, hz, 3), perUs = fmtRat(B(1000000), hz, 3);
        h += '<div class="cus-kv"><span>Periodo' + (exacta ? '' : ' (de ' + agrupar(plano(hz)) + ' hz)') + '</span> <b>' + (perUs.aprox ? '≈ ' : '') + perUs.txt + ' µs</b> <span class="cus-tenue">' + (per.aprox ? '≈ ' : '= ') + per.txt + ' ic a F<sub>CY</sub></span></div>';
        if (!per.entero) h += '<p class="cus-tenue cus-p">El periodo no es un número entero de ciclos: un estímulo de reloj generado con <code>wait for … ic</code> tendrá una frecuencia ligeramente distinta.</p>';
      }
      h += '<div class="cus-kv"><span>Sin decimales</span> <b>' + agrupar(plano(mejor.v)) + ' ' + mejor.u + '</b></div>';
      res.innerHTML = h;
      ponerCodigo('cus-cod-f', 'variable f : frequency;     -- en la zona de declaración del process\n' +
        'f := ' + plano(mejor.v) + ' ' + mejor.u + ';');
    }

    // ---------- Comprobador ----------
    // Convierte «número unidad» con decimales a una unidad menor entera. Devuelve texto o null.
    function sinDecimales(numTxt, unidad) {
      var d = leerDec(numTxt); if (!d) return null;
      unidad = unidad.toLowerCase();
      if (unidad === 'v' || unidad === 'mv') {
        var n = d.m * (unidad === 'v' ? B(1000) : B(1)), den = pot10(d.d);
        return plano(redondear(n, den)) + ' mv';
      }
      if (unidad === 'µs' || unidad === 's') unidad = unidad === 's' ? 'sec' : 'us';
      if (CAT[unidad] === 'time') {
        var r = aPs(d, unidad);
        var m = mejorUnidad(redondear(r.num, r.den));
        return plano(m.v) + ' ' + m.u;
      }
      if (CAT[unidad] === 'frequency') {
        var fac = unidad === 'mhz' ? B(1000000) : (unidad === 'khz' ? B(1000) : B(1));
        var hz = redondear(d.m * fac, pot10(d.d));
        for (var i = 0; i < UF.length; i++) { var f = B(UF[i][1]); if (hz > B(0) && hz % f === B(0)) return plano(hz / f) + ' ' + UF[i][0]; }
        return plano(hz) + ' hz';
      }
      if (unidad === 'ic') return plano(redondear(d.m, pot10(d.d))) + ' ic';
      return null;
    }

    function comprobar() {
      var linea = q('.cus-l').value;
      var diag = q('.cus-diag');
      // Quita comentarios y cadenas para analizar.
      var s = linea.replace(/"[^"]*"/g, '""').replace(/(\/\/|--).*$/, '').replace(/\s+$/, '');
      var msgs = [];      // {nivel: 'error'|'aviso', txt}
      var fix = linea.replace(/(\/\/|--).*$/, '').replace(/\s+$/, '');
      if (!s.trim()) { diag.innerHTML = '<p class="cus-tenue">Escribe una línea de SCL.</p>'; return; }
      var esCond = /^\s*(if|elsif|wait\s+until|exit\s+when|while)\b/i.test(s);

      // 1) Unidades mal escritas
      if (/\d\s*µs\b|\dµs/.test(s)) { msgs.push({ n: 'error', t: 'SCL escribe los microsegundos como <code>us</code>, no <code>µs</code>.' }); fix = fix.replace(/(\d)\s*µs/g, '$1 us'); }
      if (/\d\s*s\b/.test(s)) { msgs.push({ n: 'error', t: 'Los segundos se escriben <code>sec</code>.' }); fix = fix.replace(/(\d)\s*s\b/g, '$1 sec'); }
      if (/\d\s*[vV]\b/.test(s)) { msgs.push({ n: 'error', t: 'Las tensiones van en milivoltios: <code>mv</code> (el libro: <code>AN0 &lt;= 3500 mv;</code>).' }); }

      // 2) Decimales
      var reDec = /(\d+[.,]\d+)\s*([a-zA-Zµ]+)?/g, m, hayDec = false;
      while ((m = reDec.exec(s))) {
        hayDec = true;
        var sug = m[2] ? sinDecimales(m[1], m[2]) : null;
        msgs.push({ n: 'error', t: 'Decimales en <code>' + esc(m[0].trim()) + '</code>: SCL no los admite' + (m[1].indexOf(',') >= 0 ? ' (y la coma no es separador decimal)' : '') +
          '. ' + (sug ? 'Usa una unidad menor: <code>' + sug + '</code>.' : 'Ve a una unidad menor.') });
      }
      if (hayDec) {
        fix = fix.replace(/(\d+[.,]\d+)\s*(µs|[a-zA-Z]+)?/g, function (all, n, uu) {
          var r2 = uu ? sinDecimales(n, uu) : null; return r2 ? r2 : all;
        });
      } else {
        fix = fix.replace(/(\d)\s*[vV]\b/g, function (all, dgt) { return dgt + '000 mv'; });
      }

      // 3) Unidad aplicada a un paréntesis: (3990 + 10) ic
      var rePar = new RegExp('\\(([^()]*)\\)\\s*(' + UNID_RE + ')\\b', 'gi');
      while ((m = rePar.exec(s))) {
        var dentro = m[1];
        if (/\d/.test(dentro) && !new RegExp('\\d\\s*' + UNID_RE + '\\b', 'i').test(dentro)) {
          var uu2 = m[2].toLowerCase();
          var dist = '(' + dentro.replace(/(\d+)(?!\s*[\d.,])/g, '$1 ' + uu2) + ')';
          msgs.push({ n: 'error', t: 'La unidad no se aplica a un paréntesis: <code>' + esc(m[0]) + '</code> es un error; pon la unidad en cada término: <code>' + esc(dist) + '</code>.' });
          fix = fix.replace(m[0], dist);
        }
      }

      // 4) Mezcla de tipos / unidades
      var reU = new RegExp('\\d\\s*(' + UNID_RE + ')\\b', 'gi'), usadas = {}, cats = {};
      var sFix = fix;
      while ((m = reU.exec(sFix))) { var uu3 = m[1].toLowerCase(); usadas[uu3] = 1; cats[CAT[uu3]] = 1; }
      var lu = Object.keys(usadas), lc = Object.keys(cats);
      if (lc.length > 1) msgs.push({ n: 'error', t: 'Mezcla de tipos (' + lc.join(' y ') + '): en SCL las variables son de un tipo y no se mezclan en una operación.' });
      else if (lu.length > 1) msgs.push({ n: 'error', t: 'Mezcla de unidades (' + lu.join(', ') + '): el libro pide no mezclarlas; pásalo todo a la menor (' + menor(lu) + ').' });

      // 5) Faltan unidades
      if (/^\s*wait\s+(on\s+\S+\s+)?for\s+\d+(?!\s*[\d.,])(?!\s*(?:[a-zA-Zµ]))/i.test(s)) {
        msgs.push({ n: 'error', t: '<code>wait for</code> necesita unidades: <code>ic</code>, <code>ns</code>, <code>us</code>, <code>ms</code>…' });
      }
      var mAn = /^\s*(AN\d+)\s*<=\s*(\d+(?:[.,]\d+)?)\s*([a-zA-Z]+)?\s*;?\s*$/i.exec(s);
      if (mAn && !esCond && !mAn[3]) { msgs.push({ n: 'error', t: 'Falta la unidad: <code>' + esc(mAn[1]) + ' &lt;= ' + mAn[2] + ' mv;</code>' }); fix = fix.replace(/(<=\s*\d+)(\s*;?)$/, '$1 mv$2'); }
      if (esCond) {
        var reCmp = new RegExp('([A-Za-z_][\\w.]*)\\s*(==|>=|<=|/=|!=|>|<|=)\\s*(\\d+)(?![\\d.,])(?!\\s*' + UNID_RE + '\\b)', 'g');
        while ((m = reCmp.exec(s))) {
          if (/^[A-Z0-9_.]+$/.test(m[1])) continue;      // registro o pin (PORTA, RB1, PC…): entero sin unidad
          if (/^(then|loop)$/i.test(m[1])) continue;
          msgs.push({ n: 'error', t: 'Faltan unidades en <code>' + esc(m[0]) + '</code> (22.3.5 b): si <code>' + esc(m[1]) + '</code> es <code>cycle</code>, escribe <code>' + esc(m[1]) + ' ' + m[2] + ' ' + m[3] + ' ic</code>; si es <code>time</code>, con su unidad (<code>us</code>, <code>ms</code>…).' });
        }
      }

      // 6) ; y then
      var t = s.trim();
      if (/^(if|elsif)\b/i.test(t) && !/\bthen$/i.test(t)) { msgs.push({ n: 'error', t: 'Falta <code>then</code> al final del <code>if</code>.' }); fix = fix.replace(/;?\s*$/, ' then'); }
      else if (!/^(if|elsif|else|loop|begin|process|testbench|configuration|while|end\s+(if|loop))\b/i.test(t) && !/\b(then|loop|is|begin)$/i.test(t) && !/;$/.test(t)) {
        msgs.push({ n: 'error', t: 'Falta el <code>;</code> al final de la sentencia (22.3.5 c).' }); fix = fix + ';';
      }
      if (/^end\s+(if|loop)$/i.test(t)) { msgs.push({ n: 'error', t: 'Falta el <code>;</code> tras <code>' + esc(t) + '</code>.' }); fix = fix + ';'; }

      var h = '';
      if (!msgs.length) {
        h = '<p class="cus-ok">✓ Ninguno de los errores frecuentes del libro (unidades, decimales, mezcla, <code>;</code>, <code>then</code>).</p>';
      } else {
        h = '<ul class="cus-msgs">';
        msgs.forEach(function (x) { h += '<li class="cus-' + x.n + '"><span class="cus-sr">' + (x.n === 'error' ? 'Error: ' : 'Aviso: ') + '</span>' + x.t + '</li>'; });
        h += '</ul>';
        if (fix.trim() !== linea.replace(/(\/\/|--).*$/, '').trim()) h += '<div class="cus-kv"><span>Propuesta</span> <code class="cus-fix">' + esc(fix.trim()) + '</code></div>';
      }
      h += '<p class="cus-tenue cus-p">Comprobación heurística de una sola línea: no sustituye al compilador de SCL de MPLAB X (que indica la línea del primer error; recuerda que las líneas en blanco desplazan esa numeración).</p>';
      diag.innerHTML = h;
    }
    function menor(lu) {
      var orden = ['ps', 'ns', 'us', 'ms', 'sec', 'min', 'hr', 'hz', 'khz', 'mhz'];
      for (var i = 0; i < orden.length; i++) if (lu.indexOf(orden[i]) >= 0) return orden[i];
      return lu[0];
    }

    function pintarTcy() {
      q('.cus-tcy').innerHTML = 'T<sub>CY</sub> = 1 / F<sub>CY</sub> = ' + fmtRat(pot10(12), B(String(fcy)), 3).txt + NBSP + 'ps';
    }
    function todo() { pintarTcy(); calcV(); calcT(); calcF(); comprobar(); }

    selFcy.addEventListener('change', function () { fcy = normFcy(selFcy.value); pintarTcy(); calcT(); calcF(); });
    el.addEventListener('input', function (e) {
      var c = e.target.classList;
      if (c.contains('cus-v')) calcV();
      else if (c.contains('cus-t')) calcT();
      else if (c.contains('cus-f')) calcF();
      else if (c.contains('cus-l')) comprobar();
    });
    el.addEventListener('change', function (e) {
      var c = e.target.classList;
      if (c.contains('cus-vu') || c.contains('cus-pin')) calcV();
      else if (c.contains('cus-tu')) calcT();
      else if (c.contains('cus-fu')) calcF();
    });
    el.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('button') : null;
      if (!b || !el.contains(b)) return;
      if (b.classList.contains('cus-ej')) {
        q('.cus-t').value = b.getAttribute('data-t'); q('.cus-tu').value = b.getAttribute('data-u'); calcT();
      } else if (b.classList.contains('cus-ejl')) {
        q('.cus-l').value = b.textContent; comprobar();
      } else if (b.classList.contains('cus-copiar')) {
        var txt = q('.' + b.getAttribute('data-de') + ' code').textContent;
        var ok = function () { b.textContent = 'Copiado'; setTimeout(function () { b.textContent = 'Copiar'; }, 1200); };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(ok, function () { b.textContent = 'No se pudo'; });
        else b.textContent = 'Selecciona y copia';
      }
    });

    todo();
  };
})();
