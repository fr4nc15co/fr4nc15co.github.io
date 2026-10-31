/*
 * Componente "calc-tiempos-adc": tiempos del conversor A/D del dsPIC33FJ32MC202
 * (libro, cap. 16; datasheet 20.0 y tabla 24-46).
 *
 * Uso: <div class="mpi-mount" data-componente="calc-tiempos-adc"
 *           data-config='{"fcy":40000000,"adcs":5,"samc":1,"pines":1}'></div>
 *
 * Claves de data-config (todas opcionales):
 *   fcy   : 40000000 (por defecto) o 39613750 (valor exacto). Solo esos dos.
 *   adcs  : 0..63 (por defecto 5).  TAD = TCY·(ADCS+1).
 *   samc  : 0..31 (por defecto 1).  Muestreo = SAMC·TAD.
 *   pines : 1..6 (por defecto 1).   Barrido = pines·(SAMC+12)·TAD.
 *   ksps  : velocidad inicial del modo inverso (por defecto 500).
 *
 * Calcula TCY, TAD, avisa si TAD < 76 ns (datasheet, tabla 24-46, AD50, modo de
 * 10 bits), tiempo por conversión (SAMC + 12)·TAD, velocidad en ksps, tiempo de
 * barrido y AD1CON3 = (SAMC << 8) | ADCS. Modo inverso: velocidad deseada →
 * TAD = 1/(v·(SAMC+12)) → ADCS = TAD/TCY − 1, con los dos enteros vecinos.
 * Libro: ADCS = 5 → TAD = 150 ns → 13 TAD = 1,95 µs → 512,8 ksps.
 */
window.MPI = window.MPI || {};
MPI.componentes = MPI.componentes || {};

(function () {
  var FCY_APROX = 40000000;
  var FCY_EXACTO = 39613750;
  var TAD_MIN = 76e-9;          // datasheet, tabla 24-46, AD50 (10 bits)
  var TSAMP_MIN_TAD = 2;        // datasheet, tabla 24-46, AD57 (10 bits)
  var NCONV = 12;               // tCONV = 12 TAD (AD55, 10 bits)
  var NBSP = ' ';

  function agrupar(entero) {
    var s = String(entero);
    if (s.length >= 5) s = s.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
    return s;
  }
  function sig(x, n) {
    if (!isFinite(x)) return '—';
    if (x === 0) return '0';
    var d = Math.max(0, n - 1 - Math.floor(Math.log(Math.abs(x)) / Math.LN10));
    var s = Math.abs(x).toFixed(Math.min(d, 12));
    if (s.indexOf('.') >= 0) s = s.replace(/0+$/, '').replace(/\.$/, '');
    var p = s.split('.');
    return (x < 0 ? '−' : '') + agrupar(p[0]) + (p[1] ? ',' + p[1] : '');
  }
  function fmtT(s, n) {
    n = n || 4;
    var a = Math.abs(s);
    if (a >= 1e-3) return sig(s * 1e3, n) + NBSP + 'ms';
    if (a >= 1e-6) return sig(s * 1e6, n) + NBSP + 'µs';
    return sig(s * 1e9, n) + NBSP + 'ns';
  }
  function fmtRate(f) {
    if (f >= 1e6) return sig(f / 1e6, 4) + NBSP + 'Msps';
    if (f >= 1e3) return sig(f / 1e3, 4) + NBSP + 'ksps';
    return sig(f, 4) + NBSP + 'sps';
  }
  function hex4(v) {
    var s = ((v >>> 0) & 0xFFFF).toString(16).toUpperCase();
    while (s.length < 4) s = '0' + s;
    return '0x' + s;
  }
  function binN(v, n) {
    var s = '';
    for (var b = n - 1; b >= 0; b--) { s += (v >> b) & 1; if (b % 4 === 0 && b) s += ' '; }
    return s;
  }
  function normFcy(v) {
    v = Number(v);
    return Math.abs(v - FCY_EXACTO) < 1000 ? FCY_EXACTO : FCY_APROX;
  }
  function entero(x, min, max, def) {
    x = Number(x);
    if (!isFinite(x)) return def;
    return Math.max(min, Math.min(max, Math.round(x)));
  }

  var ID = 0;

  MPI.componentes['calc-tiempos-adc'] = function (el, cfg) {
    cfg = cfg || {};
    var uid = 'cta' + (++ID);
    var fcy = normFcy(cfg.fcy != null ? cfg.fcy : FCY_APROX);
    var adcs = entero(cfg.adcs, 0, 63, 5);
    var samc = entero(cfg.samc, 0, 31, 1);
    var pines = entero(cfg.pines, 1, 6, 1);
    var kspsIni = Number(cfg.ksps) > 0 ? Number(cfg.ksps) : 500;

    function deslizador(clase, etiqueta, min, max, valor, ayuda) {
      return '<div class="cta-campo">' +
        '<label for="' + uid + '-' + clase + '">' + etiqueta + '</label>' +
        '<div class="cta-slider-fila">' +
          '<input id="' + uid + '-' + clase + '" class="cta-' + clase + '" type="range" min="' + min + '" max="' + max + '" step="1" value="' + valor + '"' +
            (ayuda ? ' aria-describedby="' + uid + '-' + clase + '-a"' : '') + '>' +
          '<output class="cta-out" for="' + uid + '-' + clase + '"></output>' +
        '</div>' +
        (ayuda ? '<div class="cta-ayuda" id="' + uid + '-' + clase + '-a">' + ayuda + '</div>' : '') +
      '</div>';
    }

    el.classList.add('mpi-calc-tiempos-adc');
    el.innerHTML =
      '<div class="mpi-sim-cab">Tiempos del conversor A/D · T<sub>AD</sub>, muestreo y velocidad <span class="cta-cab-sub">calculadora</span></div>' +
      '<div class="cta-form">' +
        '<div class="cta-campo"><label for="' + uid + '-fcy">F<sub>CY</sub></label>' +
          '<select id="' + uid + '-fcy" class="cta-fcy">' +
            '<option value="' + FCY_APROX + '"' + (fcy === FCY_APROX ? ' selected' : '') + '>40' + NBSP + '000' + NBSP + '000 Hz (aproximado)</option>' +
            '<option value="' + FCY_EXACTO + '"' + (fcy === FCY_EXACTO ? ' selected' : '') + '>39' + NBSP + '613' + NBSP + '750 Hz (exacto)</option>' +
          '</select></div>' +
        deslizador('adcs', 'ADCS (AD1CON3&lt;7:0&gt;)', 0, 63, adcs, 'T<sub>AD</sub> = T<sub>CY</sub>·(ADCS+1); de 64 a 255 son valores reservados.') +
        deslizador('samc', 'SAMC (AD1CON3&lt;12:8&gt;)', 0, 31, samc, 'Muestreo automático de SAMC·T<sub>AD</sub> (con SSRC = 111).') +
        deslizador('pines', 'Pines escaneados', 1, 6, pines, 'AN0-AN5 del dsPIC33FJ32MC202.') +
        '<div class="cta-botones"><button type="button" class="cta-btn cta-libro">Valores del libro: ADCS = 5, SAMC = 1</button></div>' +
      '</div>' +
      '<div class="cta-scroll"><table class="cta-tabla"><tbody></tbody></table></div>' +
      '<div class="cta-avisos" aria-live="polite"></div>' +
      '<div class="cta-reg" aria-label="AD1CON3 bit a bit"></div>' +
      '<div class="cta-inv">' +
        '<div class="cta-sub">Modo inverso: de la velocidad deseada a ADCS</div>' +
        '<div class="cta-inv-form">' +
          '<label for="' + uid + '-ksps">Velocidad deseada</label>' +
          '<input id="' + uid + '-ksps" class="cta-ksps" type="text" inputmode="decimal" spellcheck="false" autocomplete="off" ' +
            'aria-describedby="' + uid + '-kerr" value="' + sig(kspsIni, 6) + '"> <span class="cta-uni">ksps</span>' +
          '<button type="button" class="cta-btn cta-k" data-k="500">500 ksps (libro)</button>' +
          '<button type="button" class="cta-btn cta-k" data-k="100">100 ksps (ejercicio 16.5.1)</button>' +
        '</div>' +
        '<p class="cta-err" id="' + uid + '-kerr" role="alert"></p>' +
        '<p class="cta-inv-calc"></p>' +
        '<div class="cta-scroll"><table class="cta-inv-tabla"><thead><tr>' +
          '<th scope="col">ADCS</th><th scope="col">T<sub>AD</sub></th><th scope="col">(SAMC+12)·T<sub>AD</sub></th>' +
          '<th scope="col">Velocidad real</th><th scope="col">Frente a la pedida</th><th scope="col">¿Válido?</th><th scope="col"><span class="cta-sr">Acción</span></th>' +
        '</tr></thead><tbody></tbody></table></div>' +
        '<p class="cta-nota">Redondear ADCS hacia abajo da un T<sub>AD</sub> algo más corto (convierte un poco más rápido de lo pedido); hacia arriba, ' +
          'algo más lento. El libro elige ADCS = 5 para 500 ksps. Si escaneas n pines y quieres esa velocidad <em>en cada pin</em>, pide n veces más.</p>' +
      '</div>';

    var q = function (s) { return el.querySelector(s); };
    var selFcy = q('.cta-fcy'), inA = q('.cta-adcs'), inS = q('.cta-samc'), inP = q('.cta-pines');
    var tbody = q('.cta-tabla tbody'), avisos = q('.cta-avisos'), regEl = q('.cta-reg');
    var inK = q('.cta-ksps'), errK = q('.cta-err'), invCalc = q('.cta-inv-calc'), invBody = q('.cta-inv-tabla tbody');
    var ksps = kspsIni;

    function calcular() {
      var tcy = 1 / fcy;
      var tad = tcy * (adcs + 1);
      var nT = samc + NCONV;
      var tConv = nT * tad;
      var rate = 1 / tConv;
      var tBarr = pines * tConv;
      var con3 = (samc << 8) | adcs;
      var fcyTxt = agrupar(fcy) + NBSP + 'Hz';

      inA.parentNode.querySelector('output').textContent = String(adcs);
      inS.parentNode.querySelector('output').textContent = String(samc);
      inP.parentNode.querySelector('output').textContent = String(pines);
      inA.setAttribute('aria-valuetext', 'ADCS ' + adcs + ', TAD ' + fmtT(tad).replace(NBSP, ' '));
      inS.setAttribute('aria-valuetext', 'SAMC ' + samc + ' TAD');
      inP.setAttribute('aria-valuetext', pines + (pines === 1 ? ' pin' : ' pines'));

      var malTad = tad < TAD_MIN - 1e-15;
      var f = '';
      f += '<tr><th scope="row">T<sub>CY</sub></th><td><b>' + fmtT(tcy) + '</b> <span class="cta-calc">= 1 / ' + fcyTxt + '</span></td></tr>';
      f += '<tr' + (malTad ? ' class="cta-mal"' : '') + '><th scope="row">T<sub>AD</sub></th><td><b>' + fmtT(tad, 5) + '</b> <span class="cta-calc">= T<sub>CY</sub> · (ADCS + 1) = ' +
        fmtT(tcy) + ' · ' + (adcs + 1) + '</span>' + (malTad ? ' <span class="cta-etq-mal">&lt; 76 ns</span>' : '') + '</td></tr>';
      f += '<tr><th scope="row">Muestreo</th><td><b>' + fmtT(samc * tad, 5) + '</b> <span class="cta-calc">= SAMC · T<sub>AD</sub> = ' + samc + ' T<sub>AD</sub></span></td></tr>';
      f += '<tr><th scope="row">Conversión</th><td><b>' + fmtT(NCONV * tad, 5) + '</b> <span class="cta-calc">= 12 T<sub>AD</sub> (10 bits + 2)</span></td></tr>';
      f += '<tr><th scope="row">Tiempo por conversión</th><td><b>' + fmtT(tConv, 5) + '</b> <span class="cta-calc">= (SAMC + 12) · T<sub>AD</sub> = ' + nT + ' T<sub>AD</sub> = ' +
        sig(tConv / tcy, 5) + ' T<sub>CY</sub></span></td></tr>';
      f += '<tr><th scope="row">Velocidad</th><td><b>' + fmtRate(rate) + '</b> <span class="cta-calc">= 1 / ' + fmtT(tConv, 5) + '</span></td></tr>';
      f += '<tr><th scope="row">Barrido de ' + pines + (pines === 1 ? ' pin' : ' pines') + '</th><td><b>' + fmtT(tBarr, 5) + '</b> <span class="cta-calc">= ' + pines + ' · ' + fmtT(tConv, 5) +
        (pines > 1 ? '; cada pin se refresca a ' + fmtRate(1 / tBarr) : '') + '</span></td></tr>';
      f += '<tr><th scope="row">AD1CON3</th><td><b>' + hex4(con3) + '</b> <span class="cta-calc">= (SAMC &lt;&lt; 8) | ADCS = (' + samc + ' &lt;&lt; 8) | ' + adcs + '</span></td></tr>';
      tbody.innerHTML = f;

      var av = '';
      if (malTad) {
        var aMin = Math.ceil(TAD_MIN / tcy - 1 - 1e-9);
        av += '<p class="cta-aviso cta-aviso-mal"><strong>T<sub>AD</sub> demasiado corto.</strong> El datasheet (tabla 24-46, AD50, modo de 10 bits) exige T<sub>AD</sub> ≥ 76 ns; ' +
          'con este F<sub>CY</sub> hace falta ADCS ≥ ' + aMin + ' (T<sub>AD</sub> = ' + fmtT(tcy * (aMin + 1), 5) + ').</p>';
      }
      if (samc === 0) {
        av += '<p class="cta-aviso cta-aviso-mal"><strong>SAMC = 0:</strong> no queda tiempo para cargar el condensador del muestreador.</p>';
      } else if (samc < TSAMP_MIN_TAD) {
        av += '<p class="cta-aviso"><strong>⚠ A verificar.</strong> El libro usa SAMC = 1 (1 T<sub>AD</sub> de muestreo); el datasheet (tabla 24-46, AD57) ' +
          'indica un tiempo de muestreo mínimo T<sub>SAMP</sub> = 2 T<sub>AD</sub> en modo de 10 bits.</p>';
      }
      if (rate > 1.1e6 && !malTad) {
        av += '<p class="cta-aviso">Más de 1,1 Msps: por encima del máximo del datasheet (AD56) para el modo de 10 bits.</p>';
      }
      avisos.innerHTML = av;

      regEl.innerHTML = '<div class="cta-reg-tit">AD1CON3 = <b>' + hex4(con3) + '</b></div>' +
        '<div class="cta-reg-campos">' +
          '<span class="cta-rc cta-rc-x"><i>bit 15</i><span>ADRC</span><code>0</code></span>' +
          '<span class="cta-rc cta-rc-x"><i>14-13</i><span>—</span><code>00</code></span>' +
          '<span class="cta-rc cta-rc-s"><i>12-8</i><span>SAMC</span><code>' + binN(samc, 5) + '</code></span>' +
          '<span class="cta-rc cta-rc-a"><i>7-0</i><span>ADCS</span><code>' + binN(adcs, 8) + '</code></span>' +
        '</div>';

      calcularInverso();
    }

    function calcularInverso() {
      var tcy = 1 / fcy;
      var nT = samc + NCONV;
      var v = ksps * 1e3;
      var tadReq = 1 / (v * nT);
      var aEx = tadReq / tcy - 1;
      invCalc.innerHTML = 'T<sub>AD</sub> = 1 / (v · (SAMC + 12)) = 1 / (' + sig(ksps, 6) + ' ksps · ' + nT + ') = <b>' + fmtT(tadReq, 5) + '</b> → ' +
        'ADCS = T<sub>AD</sub> / T<sub>CY</sub> − 1 = ' + fmtT(tadReq, 5) + ' / ' + fmtT(tcy) + ' − 1 = <b>' + sig(aEx, 4) + '</b>';
      var cands = [];
      var lo = Math.floor(aEx + 1e-9), hi = Math.ceil(aEx - 1e-9);
      cands.push(lo);
      if (hi !== lo) cands.push(hi);
      var filas = '';
      cands.forEach(function (a) {
        var tad = tcy * (a + 1);
        var rate = 1 / (nT * tad);
        var dif = (rate - v) / v * 100;
        var motivo = '';
        if (a < 0) motivo = 'no: ADCS &lt; 0';
        else if (a > 63) motivo = 'no: ADCS &gt; 63';
        else if (tad < TAD_MIN - 1e-15) motivo = 'no: T<sub>AD</sub> &lt; 76 ns';
        var ok = !motivo;
        var difTxt = Math.abs(dif) < 1e-9 ? 'exacta' : ((dif > 0 ? '+' : '') + sig(dif, 3) + NBSP + '%' + (dif > 0 ? ' (más rápida)' : ' (más lenta)'));
        filas += '<tr class="' + (ok ? '' : 'cta-nocabe') + (a === adcs && ok ? ' cta-actual' : '') + '">' +
          '<td>' + a + '</td>' +
          '<td>' + (a >= 0 ? fmtT(tad, 5) : '—') + '</td>' +
          '<td>' + (a >= 0 ? fmtT(nT * tad, 5) : '—') + '</td>' +
          '<td>' + (a >= 0 ? '<b>' + fmtRate(rate) + '</b>' : '—') + '</td>' +
          '<td>' + (a >= 0 ? difTxt : '—') + '</td>' +
          '<td>' + (ok ? '<span class="cta-si">sí</span>' : '<span class="cta-no">' + motivo + '</span>') + '</td>' +
          '<td>' + (ok ? '<button type="button" class="cta-btn cta-usar" data-a="' + a + '">Usar</button>' : '') + '</td></tr>';
      });
      invBody.innerHTML = filas;
    }

    function leerK() {
      var s = String(inK.value).replace(/[\s  ]/g, '').replace(',', '.');
      var x = parseFloat(s);
      if (!/^\d*\.?\d+$/.test(s) || !(x > 0)) {
        errK.textContent = 'Escribe una velocidad positiva en ksps (p. ej. 500 o 100).';
        inK.setAttribute('aria-invalid', 'true');
        return;
      }
      errK.textContent = '';
      inK.removeAttribute('aria-invalid');
      ksps = x;
      calcularInverso();
    }

    selFcy.addEventListener('change', function () { fcy = normFcy(selFcy.value); calcular(); });
    inA.addEventListener('input', function () { adcs = +inA.value; calcular(); });
    inS.addEventListener('input', function () { samc = +inS.value; calcular(); });
    inP.addEventListener('input', function () { pines = +inP.value; calcular(); });
    inK.addEventListener('input', leerK);
    q('.cta-libro').addEventListener('click', function () {
      adcs = 5; samc = 1; inA.value = '5'; inS.value = '1'; calcular();
    });
    el.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('.cta-k, .cta-usar') : null;
      if (!b || !el.contains(b)) return;
      if (b.classList.contains('cta-k')) {
        inK.value = b.getAttribute('data-k');
        leerK();
      } else {
        adcs = +b.getAttribute('data-a');
        inA.value = String(adcs);
        calcular();
        inA.focus();
      }
    });

    calcular();
  };
})();
