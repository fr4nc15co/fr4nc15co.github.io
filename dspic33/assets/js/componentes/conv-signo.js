/*
 * Componente "conv-signo": un mismo patrón de n bits leído sin signo y con signo
 * (complemento a 2), con el cálculo del negativo paso a paso (libro 7.3.3).
 *
 * Uso en el contenido:
 *   <div class="mpi-mount" data-componente="conv-signo" data-config='{"valor":"0xFFFE","bits":16}'></div>
 *
 * Claves de data-config (todas opcionales):
 *   valor   patrón inicial en hex ("0xFFFE") o número decimal (-23, "−23", 200). Por defecto 0xFFFE.
 *           Un decimal negativo se codifica en complemento a 2 con «bits» bits.
 *   bits    número de bits, de 2 a 16 (el selector rápido ofrece 8 y 16). Por defecto 16.
 *
 * Regla al cambiar el número de bits: si lo último que se escribió fue un decimal, se vuelve a
 * codificar ese número (−23 → 0xE9 en 8 bits, 1101001 en 7, no cabe en 5); si fue un patrón
 * (hex o bits), se conservan sus n bits bajos.
 */
window.MPI = window.MPI || {};
MPI.componentes = MPI.componentes || {};

(function () {
  var uid = 0;
  var EJEMPLOS = [
    { dec: null, x: 0xFFFE, n: 16, txt: '0xFFFE (16 bits)' },
    { dec: -23, n: 8, txt: '−23 en 8 bits' },
    { dec: -23, n: 7, txt: '−23 en 7 bits' },
    { dec: -23, n: 5, txt: '−23 en 5 bits' },
    { dec: null, x: 0x80, n: 8, txt: '0x80 (8 bits)' }
  ];

  function pot(n) { return Math.pow(2, n); }
  function hx(v, n) {
    var d = Math.ceil(n / 4);
    var s = (v >>> 0).toString(16).toUpperCase();
    while (s.length < d) s = '0' + s;
    return '0x' + s;
  }
  // Binario agrupado de 4 en 4 desde la derecha.
  function bin(v, n) {
    var s = '';
    for (var b = n - 1; b >= 0; b--) { s += (v >> b) & 1; if (b % 4 === 0 && b) s += ' '; }
    return s;
  }
  function conSigno(x, n) { return x >= pot(n - 1) ? x - pot(n) : x; }
  function leerDec(t) {
    t = String(t == null ? '' : t).trim().replace(/[−–]/g, '-');
    if (!/^[-+]?\d{1,6}$/.test(t)) return null;
    return parseInt(t, 10);
  }
  function leerHex(t) {
    t = String(t == null ? '' : t).trim().replace(/^0x/i, '');
    if (!/^[0-9a-f]{1,4}$/i.test(t)) return null;
    return parseInt(t, 16);
  }
  function bitsMinimos(v) {
    // menor n con −2^(n−1) ≤ v ≤ 2^(n−1) − 1
    for (var n = 1; n <= 32; n++) if (v >= -pot(n - 1) && v <= pot(n - 1) - 1) return n;
    return 32;
  }
  // Codifica un decimal en n bits. Devuelve {x} o {error}.
  function codificar(v, n) {
    var minS = -pot(n - 1), maxU = pot(n) - 1;
    if (v < minS) return { error: v + ' no cabe en ' + n + ' bits con signo: el rango es ' + minS + ' … ' + (pot(n - 1) - 1) + '. Hacen falta al menos ' + bitsMinimos(v) + ' bits.' };
    if (v > maxU) return { error: v + ' no cabe en ' + n + ' bits: el máximo sin signo es ' + maxU + '.' };
    return { x: v < 0 ? pot(n) + v : v };
  }

  MPI.componentes['conv-signo'] = function (el, cfg) {
    cfg = cfg || {};
    var id = 'cs' + (++uid);
    var n0 = parseInt(cfg.bits, 10);
    if (isNaN(n0)) n0 = 16;
    n0 = Math.max(2, Math.min(16, n0));
    var st = { n: n0, x: 0xFFFE & (pot(n0) - 1), dec: null, error: '' };
    if (cfg.valor != null) {
      var sv = String(cfg.valor).trim();
      if (/^0x/i.test(sv)) { var hv = leerHex(sv); if (hv !== null) st.x = hv & (pot(n0) - 1); }
      else { var dv = typeof cfg.valor === 'number' ? Math.round(cfg.valor) : leerDec(sv); if (dv !== null) { st.dec = dv; aplicarDec(); } }
    }

    function aplicarDec() {
      var r = codificar(st.dec, st.n);
      if (r.error) { st.error = r.error; st.x &= pot(st.n) - 1; } else { st.error = ''; st.x = r.x; }
    }

    el.classList.add('mpi-conv-signo');
    el.innerHTML =
      '<div class="mpi-sim-cab">Con signo y sin signo <span class="cs-sub">complemento a 2 en n bits</span></div>' +
      '<div class="cs-ejemplos"><span class="cs-lbl">Ejemplos:</span>' +
        EJEMPLOS.map(function (e, i) { return '<button type="button" class="cs-ej" data-ej="' + i + '">' + e.txt + '</button>'; }).join('') +
      '</div>' +
      '<div class="cs-form">' +
        '<div class="cs-campo"><span class="cs-lbl" id="' + id + '-nl">Bits</span>' +
          '<span class="cs-seg" role="group" aria-labelledby="' + id + '-nl">' +
            '<button type="button" class="cs-n" data-n="8" aria-pressed="false">8</button>' +
            '<button type="button" class="cs-n" data-n="16" aria-pressed="false">16</button>' +
          '</span>' +
          '<label class="cs-otro">otro: <input class="cs-in-n" type="number" min="2" max="16" step="1" aria-label="Número de bits (2 a 16)"></label></div>' +
        '<div class="cs-campo"><label for="' + id + '-h">Hex</label>' +
          '<input id="' + id + '-h" class="cs-txt cs-in-h" type="text" spellcheck="false" autocomplete="off" maxlength="6"></div>' +
        '<div class="cs-campo"><label for="' + id + '-d">Decimal</label>' +
          '<input id="' + id + '-d" class="cs-txt cs-in-d" type="text" inputmode="numeric" spellcheck="false" autocomplete="off" maxlength="7" aria-describedby="' + id + '-dn"></div>' +
      '</div>' +
      '<p class="cs-nota" id="' + id + '-dn">En «Decimal» puedes escribir un negativo (<code>-23</code>): se codifica en complemento a 2 con los bits elegidos.</p>' +
      '<p class="cs-error" role="alert" hidden></p>' +
      '<div class="cs-cuerpo">' +
        '<div class="cs-bits-wrap"><div class="cs-bits" role="group" aria-label="Bits del patrón (pulsa para cambiar)"></div></div>' +
        '<div class="cs-interp" aria-live="polite"></div>' +
        '<div class="cs-pasos"></div>' +
      '</div>';

    function $(s) { return el.querySelector(s); }
    var inH = $('.cs-in-h'), inD = $('.cs-in-d'), inN = $('.cs-in-n');

    function pintar() {
      var n = st.n, x = st.x, i;
      var bs = el.querySelectorAll('.cs-n');
      for (i = 0; i < bs.length; i++) bs[i].setAttribute('aria-pressed', +bs[i].getAttribute('data-n') === n ? 'true' : 'false');
      if (document.activeElement !== inN) inN.value = n;
      var err = $('.cs-error');
      err.hidden = !st.error;
      err.textContent = st.error ? '⚠ ' + st.error : '';
      $('.cs-cuerpo').hidden = !!st.error;
      if (document.activeElement !== inH) { inH.value = hx(x, n); inH.removeAttribute('aria-invalid'); }
      if (document.activeElement !== inD) { inD.value = st.dec !== null ? String(st.dec) : String(conSigno(x, n)); inD.removeAttribute('aria-invalid'); }
      inD.setAttribute('aria-invalid', st.error ? 'true' : 'false');

      // Bits con sus pesos (agrupados de 4 en 4 desde la derecha)
      var h = '', grupo = '';
      for (var b = n - 1; b >= 0; b--) {
        var on = (x >> b) & 1, msb = b === n - 1;
        grupo += '<button type="button" class="cs-bit' + (on ? ' cs-on' : '') + (msb ? ' cs-msb' : '') + '" data-bit="' + b + '" aria-pressed="' + (on ? 'true' : 'false') + '" aria-label="Bit ' + b + (msb ? ' (signo)' : '') + ' = ' + on + '">' +
          '<span class="cs-bn" aria-hidden="true">' + b + '</span><span class="cs-bv">' + on + '</span>' +
          '<span class="cs-peso" aria-hidden="true">' + (msb ? '<span class="cs-pu">+' + pot(b) + '</span><span class="cs-ps">−' + pot(b) + '</span>' : pot(b)) + '</span></button>';
        if (b % 4 === 0) { h += '<div class="cs-nib">' + grupo + '</div>'; grupo = ''; }
      }
      $('.cs-bits').innerHTML = h;

      // Interpretaciones
      var u = x, s = conSigno(x, n), neg = x >= pot(n - 1);
      var sumaU = [], b2;
      for (b2 = n - 1; b2 >= 0; b2--) if ((x >> b2) & 1) sumaU.push(pot(b2));
      var sumaTxt = sumaU.length ? sumaU.join(' + ') : '0';
      var sumaS = neg ? '−' + pot(n - 1) + (sumaU.length > 1 ? ' + ' + sumaU.slice(1).join(' + ') : '') : sumaTxt;
      $('.cs-interp').innerHTML =
        '<div class="cs-tarjeta"><div class="cs-t-cab">Sin signo <span>(unsigned)</span></div>' +
          '<div class="cs-t-val">' + u + '</div>' +
          '<p>' + (sumaU.length > 6 ? 'Suma de los pesos de los bits a 1' : sumaTxt + ' = ' + u) + '</p>' +
          '<p class="cs-rango">Rango en ' + n + ' bits: 0 … ' + (pot(n) - 1) + ' (2<sup>' + n + '</sup> − 1)</p></div>' +
        '<div class="cs-tarjeta"><div class="cs-t-cab">Con signo <span>(complemento a 2)</span></div>' +
          '<div class="cs-t-val">' + s + '</div>' +
          '<p>' + (neg
            ? 'Bit ' + (n - 1) + ' = 1 → negativo: ' + (sumaU.length > 6 ? 'el bit de signo pesa −' + pot(n - 1) + ' = ' + s : sumaS + ' = ' + s) + '. También: ' + u + ' − 2<sup>' + n + '</sup> = ' + u + ' − ' + pot(n) + ' = ' + s + '.'
            : 'Bit ' + (n - 1) + ' = 0 → positivo (o cero): vale lo mismo que sin signo.') + '</p>' +
          '<p class="cs-rango">Rango en ' + n + ' bits: −' + pot(n - 1) + ' … ' + (pot(n - 1) - 1) + ' (−2<sup>' + (n - 1) + '</sup> … 2<sup>' + (n - 1) + '</sup> − 1)</p></div>';

      // Pasos del negativo
      var p = '', mascara = pot(n) - 1;
      function fila(etq, v, extra) {
        return '<tr><th scope="row">' + etq + '</th><td class="cs-p-bin">' + bin(v, n) + '</td><td class="cs-p-hex">' + hx(v, n) + '</td><td class="cs-p-dec">' + (extra || '') + '</td></tr>';
      }
      if (st.dec !== null && st.dec < 0 && !st.error) {
        var m = -st.dec, inv = (~m) & mascara, r = (inv + 1) & mascara;
        p += '<h4 class="cs-p-tit">Cómo se codifica ' + st.dec + ' en ' + n + ' bits</h4>' +
          '<div class="cs-p-wrap"><table class="cs-p-tabla"><tbody>' +
          fila('1. Magnitud ' + m, m, '= ' + m) +
          fila('2. Invertir los bits', inv, '') +
          fila('3. Sumar 1', r, '= ' + r + ' sin signo = ' + st.dec + ' con signo') +
          '</tbody></table></div>' +
          '<p class="cs-p-alt">O directamente: 2<sup>' + n + '</sup> − ' + m + ' = ' + pot(n) + ' − ' + m + ' = ' + (pot(n) - m) + ' = <code>' + hx(pot(n) - m, n) + '</code> = ' + bin(pot(n) - m, n) + '.</p>';
      } else if (neg) {
        var inv2 = (~x) & mascara, mag = (inv2 + 1) & mascara;
        p += '<h4 class="cs-p-tit">¿Qué negativo es ' + hx(x, n) + '? (invertir y sumar 1 da su magnitud)</h4>' +
          '<div class="cs-p-wrap"><table class="cs-p-tabla"><tbody>' +
          fila('Patrón', x, '') +
          fila('1. Invertir los bits', inv2, '') +
          fila('2. Sumar 1', mag, x === pot(n - 1) ? '= ' + pot(n - 1) + ' (no cabe como positivo)' : '= ' + mag + ' → el patrón es −' + mag) +
          '</tbody></table></div>' +
          '<p class="cs-p-alt">O con la fórmula del libro: −x = 2<sup>' + n + '</sup> − x → ' + pot(n) + ' − ' + u + ' = ' + (pot(n) - u) + ', así que ' + hx(x, n) + ' representa −' + (pot(n) - u) + ' (o ' + u + ' sin signo).</p>' +
          (x === pot(n - 1) ? '<p class="cs-p-alt">Caso especial: ' + hx(x, n) + ' = −' + pot(n - 1) + ' es el más negativo; su opuesto, +' + pot(n - 1) + ', no cabe en ' + n + ' bits con signo y el complemento vuelve a dar el mismo patrón.</p>' : '');
      } else if (x === 0) {
        p += '<h4 class="cs-p-tit">El cero</h4><p class="cs-p-alt">Invertir 0 da todo unos y al sumar 1 se desborda a 0 otra vez: −0 = 0. Con n bits hay un negativo más que positivos (−' + pot(n - 1) + ' … ' + (pot(n - 1) - 1) + ').</p>';
      } else {
        var inv3 = (~x) & mascara, op = (inv3 + 1) & mascara;
        p += '<h4 class="cs-p-tit">Su opuesto: cómo se escribe −' + x + ' en ' + n + ' bits</h4>' +
          '<div class="cs-p-wrap"><table class="cs-p-tabla"><tbody>' +
          fila('Patrón (' + x + ')', x, '') +
          fila('1. Invertir los bits', inv3, '') +
          fila('2. Sumar 1', op, '= ' + op + ' sin signo = −' + x + ' con signo') +
          '</tbody></table></div>' +
          '<p class="cs-p-alt">O: 2<sup>' + n + '</sup> − ' + x + ' = ' + pot(n) + ' − ' + x + ' = ' + (pot(n) - x) + '. Comprobación (definición del libro): ' + hx(x, n) + ' + ' + hx(op, n) + ' = ' + hx(pot(n), n + 1) + ', que en ' + n + ' bits es 0.</p>';
      }
      $('.cs-pasos').innerHTML = p;
    }

    el.addEventListener('click', function (e) {
      var t = e.target.closest('button');
      if (!t || !el.contains(t)) return;
      if (t.classList.contains('cs-n')) { cambiarN(+t.getAttribute('data-n')); return; }
      if (t.classList.contains('cs-ej')) {
        var ej = EJEMPLOS[+t.getAttribute('data-ej')];
        st.n = ej.n;
        if (ej.dec !== null) { st.dec = ej.dec; aplicarDec(); }
        else { st.dec = null; st.error = ''; st.x = ej.x; }
        pintar(); return;
      }
      if (t.classList.contains('cs-bit')) {
        var b = +t.getAttribute('data-bit');
        st.x = (st.x ^ (1 << b)) & (pot(st.n) - 1);
        st.dec = null; st.error = '';
        pintar();
        var nb = el.querySelector('.cs-bit[data-bit="' + b + '"]');
        if (nb) nb.focus();
      }
    });
    function cambiarN(n) {
      n = Math.max(2, Math.min(16, n));
      st.n = n;
      if (st.dec !== null) aplicarDec();
      else st.x &= pot(n) - 1;
      pintar();
    }
    inN.addEventListener('input', function () {
      var n = parseInt(inN.value, 10);
      if (isNaN(n) || n < 2 || n > 16) return;
      cambiarN(n);
    });
    inN.addEventListener('change', function () { inN.value = st.n; });
    inH.addEventListener('input', function () {
      var v = leerHex(inH.value);
      if (v === null || v > pot(st.n) - 1) { inH.setAttribute('aria-invalid', 'true'); return; }
      inH.removeAttribute('aria-invalid');
      st.x = v; st.dec = null; st.error = ''; pintar();
    });
    inD.addEventListener('input', function () {
      var v = leerDec(inD.value);
      if (v === null) return;
      st.dec = v; aplicarDec(); pintar();
    });
    function normalH() { inH.value = hx(st.x, st.n); inH.removeAttribute('aria-invalid'); }
    inH.addEventListener('blur', normalH);
    inH.addEventListener('change', normalH);

    pintar();
  };

  MPI.componentes['conv-signo']._codificar = codificar;
  MPI.componentes['conv-signo']._conSigno = conSigno;
})();
