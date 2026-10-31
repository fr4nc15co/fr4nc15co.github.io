/*
 * Componente "vis-flags": cálculo binario columna a columna de ADD / SUB / CP
 * (8 o 16 bits) y flags C, Z, OV, N y DC del registro SR del dsPIC.
 *
 * Uso en el contenido:
 *   <div class="mpi-mount" data-componente="vis-flags"
 *        data-config='{"a":"0x82","b":"0x10","op":"SUB","ancho":8}'></div>
 *
 * Claves de data-config (todas opcionales):
 *   a, b      operandos (hex "0x.." o número decimal). Por defecto 0x82 y 0x10.
 *   op        "ADD", "SUB" o "CP". Por defecto "SUB".
 *   ancho     8 (instrucción .B) o 16 (word). Por defecto 8.
 *   ejemplos  false para ocultar los botones de ejemplos del libro.
 *
 * Semántica (datasheet §3 registro SR y §22; libro 7.4.4.1, 8.5.1, 8.5.2):
 *   ADD: C = acarreo que sale del bit más alto; DC = acarreo del bit 3 (.B) o 7 (word).
 *   SUB/CP: C = 1 cuando NO hay préstamo (C funciona como «borrow negado»); DC igual.
 *   OV: el resultado con signo no cabe (cambio de signo imposible).
 *   N: bit más alto del resultado. Z: resultado 0. CP no guarda el resultado.
 */
window.MPI = window.MPI || {};
MPI.componentes = MPI.componentes || {};

(function () {
  var uid = 0;
  var OPS = ['ADD', 'SUB', 'CP'];
  var EJEMPLOS = [
    { a: 0x82, b: 0x10, op: 'SUB', ancho: 8, txt: 'SUB.B 0x82 − 0x10' },
    { a: 0xF4, b: 0x10, op: 'ADD', ancho: 8, txt: 'ADD.B 0xF4 + 0x10' },
    { a: 0x6500, b: 0x6500, op: 'ADD', ancho: 16, txt: 'ADD 0x6500 + 0x6500' },
    { a: 0xCA00, b: 0x6500, op: 'ADD', ancho: 16, txt: 'ADD 0xCA00 + 0x6500' },
    { a: 0x8000, b: 0x8000, op: 'ADD', ancho: 16, txt: 'ADD 0x8000 + 0x8000' }
  ];

  function hx(v, n) {
    var d = n === 8 ? 2 : 4;
    var s = (v >>> 0).toString(16).toUpperCase();
    while (s.length < d) s = '0' + s;
    return '0x' + s;
  }
  function binStr(v, n) {
    var s = '';
    for (var b = n - 1; b >= 0; b--) { s += (v >> b) & 1; if (b % 4 === 0 && b) s += ' '; }
    return s;
  }
  function conSigno(v, n) { var m = 1 << (n - 1); return (v & m) ? v - (1 << n) : v; }
  function leerValor(t) {
    if (typeof t === 'number' && isFinite(t)) return Math.round(t);
    t = String(t == null ? '' : t).trim();
    if (/^0x[0-9a-f]{1,4}$/i.test(t)) return parseInt(t.slice(2), 16);
    if (/^[0-9a-f]{1,4}$/i.test(t) && /[a-f]/i.test(t)) return parseInt(t, 16);
    if (/^-?\d{1,6}$/.test(t)) return parseInt(t, 10);
    return null;
  }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  // Cálculo completo. Devuelve resultado, acarreos/préstamos por columna y flags.
  // k[i] = acarreo (ADD) o préstamo (SUB/CP) que ENTRA en la columna i; k[n] = el que sale del MSB.
  function calcular(a, b, op, n) {
    var mask = (1 << n) - 1, msb = 1 << (n - 1);
    a &= mask; b &= mask;
    var k = [0], r = 0, i;
    var suma = op === 'ADD';
    for (i = 0; i < n; i++) {
      var ai = (a >> i) & 1, bi = (b >> i) & 1, ki = k[i];
      var ri = ai ^ bi ^ ki;
      r |= ri << i;
      if (suma) k[i + 1] = (ai & bi) | (ai & ki) | (bi & ki);
      else k[i + 1] = ((1 - ai) & bi) | ((1 - (ai ^ bi)) & ki);
    }
    var bitDC = n === 8 ? 4 : 8;           // acarreo que sale del bit 3 (byte) o del bit 7 (word)
    var C = suma ? k[n] : 1 - k[n];
    var DC = suma ? k[bitDC] : 1 - k[bitDC];
    var OV = suma ? (((a ^ r) & (b ^ r) & msb) ? 1 : 0) : (((a ^ b) & (a ^ r) & msb) ? 1 : 0);
    var N = (r & msb) ? 1 : 0;
    var Z = r === 0 ? 1 : 0;
    var sr = (N << 3) | (OV << 2) | (Z << 1) | C;
    return { a: a, b: b, r: r, k: k, C: C, DC: DC, OV: OV, N: N, Z: Z, sr: sr, srDC: sr | (DC << 8), bitDC: bitDC };
  }

  MPI.componentes['vis-flags'] = function (el, cfg) {
    cfg = cfg || {};
    var id = 'vf' + (++uid);
    var ancho0 = +cfg.ancho === 16 ? 16 : 8;
    var a0 = leerValor(cfg.a), b0 = leerValor(cfg.b);
    var st = {
      n: ancho0,
      a: (a0 === null ? 0x82 : a0) & ((1 << ancho0) - 1),
      b: (b0 === null ? 0x10 : b0) & ((1 << ancho0) - 1),
      op: OPS.indexOf(String(cfg.op || '').toUpperCase()) >= 0 ? String(cfg.op).toUpperCase() : 'SUB'
    };
    var conEjemplos = cfg.ejemplos !== false;

    el.classList.add('mpi-vis-flags');
    el.innerHTML =
      '<div class="mpi-sim-cab">Flags del SR <span class="vf-sub">ADD · SUB · CP en 8 o 16 bits</span></div>' +
      (conEjemplos ? '<div class="vf-ejemplos"><span class="vf-lbl">Ejemplos del libro:</span>' +
        EJEMPLOS.map(function (e, i) { return '<button type="button" class="vf-ej" data-ej="' + i + '">' + esc(e.txt) + '</button>'; }).join('') +
        '</div>' : '') +
      '<div class="vf-ctrl">' +
        '<div class="vf-grupo"><span class="vf-lbl" id="' + id + '-opl">Operación</span>' +
          '<div class="vf-seg" role="group" aria-labelledby="' + id + '-opl">' +
            OPS.map(function (o) { return '<button type="button" class="vf-op" data-op="' + o + '" aria-pressed="false">' + o + '</button>'; }).join('') +
          '</div></div>' +
        '<div class="vf-grupo"><span class="vf-lbl" id="' + id + '-anl">Tamaño</span>' +
          '<div class="vf-seg" role="group" aria-labelledby="' + id + '-anl">' +
            '<button type="button" class="vf-an" data-n="8" aria-pressed="false">.B · 8 bits</button>' +
            '<button type="button" class="vf-an" data-n="16" aria-pressed="false">word · 16 bits</button>' +
          '</div></div>' +
      '</div>' +
      '<div class="vf-operando">' +
        '<div class="vf-op-cab"><label for="' + id + '-a">Operando A <span class="vf-reg">(W0)</span></label>' +
          '<input id="' + id + '-a" class="vf-hex vf-in-a" type="text" spellcheck="false" autocomplete="off" maxlength="7">' +
          '<span class="vf-dec vf-dec-a"></span></div>' +
        '<div class="vf-bits vf-bits-a" role="group" aria-label="Bits del operando A (pulsa para cambiar)"></div>' +
      '</div>' +
      '<div class="vf-operando">' +
        '<div class="vf-op-cab"><label for="' + id + '-b">Operando B <span class="vf-reg">(W1)</span></label>' +
          '<input id="' + id + '-b" class="vf-hex vf-in-b" type="text" spellcheck="false" autocomplete="off" maxlength="7">' +
          '<span class="vf-dec vf-dec-b"></span></div>' +
        '<div class="vf-bits vf-bits-b" role="group" aria-label="Bits del operando B (pulsa para cambiar)"></div>' +
      '</div>' +
      '<div class="vf-asm"></div>' +
      '<div class="vf-col-wrap" tabindex="0" role="region" aria-label="Cálculo columna a columna"><table class="vf-col"></table></div>' +
      '<p class="vf-col-nota"></p>' +
      '<div class="vf-res" aria-live="polite"></div>' +
      '<div class="vf-interp-wrap"><table class="vf-interp"></table></div>' +
      '<div class="vf-flags" aria-live="polite"></div>' +
      '<div class="vf-sr"></div>';

    function $(s) { return el.querySelector(s); }
    var inA = $('.vf-in-a'), inB = $('.vf-in-b');

    function filaBits(cont, v, n) {
      var h = '';
      for (var by = (n / 8) - 1; by >= 0; by--) {
        h += '<div class="vf-byte">';
        for (var ni = 1; ni >= 0; ni--) {
          h += '<div class="vf-nib">';
          for (var q = 3; q >= 0; q--) {
            var b = by * 8 + ni * 4 + q;
            var on = (v >> b) & 1;
            h += '<button type="button" class="vf-bit' + (on ? ' vf-on' : '') + (b === n - 1 ? ' vf-msb' : '') + '" data-bit="' + b + '" aria-pressed="' + (on ? 'true' : 'false') + '" aria-label="Bit ' + b + ' = ' + on + '">' +
              '<span class="vf-bn" aria-hidden="true">' + b + '</span><span class="vf-bv">' + on + '</span></button>';
          }
          h += '</div>';
        }
        h += '</div>';
      }
      cont.innerHTML = h;
    }

    function signoTxt(v, n) { return (v >> (n - 1)) & 1 ? 'negativo' : 'positivo'; }

    function pintar() {
      var n = st.n, mask = (1 << n) - 1, op = st.op;
      var R = calcular(st.a, st.b, op, n);
      var sufijo = n === 8 ? '.B' : '';
      var simb = op === 'ADD' ? '+' : '−';
      var bAlto = n - 1;

      // Controles
      var bs = el.querySelectorAll('.vf-op');
      for (var i = 0; i < bs.length; i++) bs[i].setAttribute('aria-pressed', bs[i].getAttribute('data-op') === op ? 'true' : 'false');
      bs = el.querySelectorAll('.vf-an');
      for (i = 0; i < bs.length; i++) bs[i].setAttribute('aria-pressed', +bs[i].getAttribute('data-n') === n ? 'true' : 'false');
      if (document.activeElement !== inA) { inA.value = hx(st.a, n); inA.removeAttribute('aria-invalid'); }
      if (document.activeElement !== inB) { inB.value = hx(st.b, n); inB.removeAttribute('aria-invalid'); }
      $('.vf-dec-a').textContent = '= ' + st.a + ' sin signo · ' + conSigno(st.a, n) + ' con signo';
      $('.vf-dec-b').textContent = '= ' + st.b + ' sin signo · ' + conSigno(st.b, n) + ' con signo';
      filaBits($('.vf-bits-a'), st.a, n);
      filaBits($('.vf-bits-b'), st.b, n);

      // Instrucción
      var asm = op === 'CP'
        ? 'CP' + sufijo + '  W0, W1        ; SR como W0 - W1 (no guarda el resultado)'
        : op + sufijo + ' W0, W1, W2    ; W2 = W0 ' + (op === 'ADD' ? '+' : '-') + ' W1';
      $('.vf-asm').innerHTML = '<pre><code class="lang-asm">' + esc(asm) + '</code></pre>';

      // Tabla columna a columna
      var kNom = op === 'ADD' ? 'Acarreos' : 'Préstamos';
      var h = '<caption class="vf-oculto">Cálculo de A ' + simb + ' B bit a bit</caption><thead><tr><th scope="col"><span class="vf-oculto">Fila</span></th>' +
        '<th scope="col" class="vf-c-sal" title="sale del bit ' + bAlto + '">' + (op === 'ADD' ? 'C' : 'pr.') + '</th>';
      for (i = n - 1; i >= 0; i--) {
        h += '<th scope="col" class="' + (i === bAlto ? 'vf-c-msb' : '') + (i % 4 === 0 && i ? ' vf-c-nib' : '') + '">' + i + '</th>';
      }
      h += '</tr></thead><tbody>';
      // fila de acarreos/préstamos: sobre la columna i va k[i] (lo que entra en la columna i)
      h += '<tr class="vf-f-k"><th scope="row">' + kNom + '</th><td class="vf-c-sal' + (R.k[n] ? ' vf-k1' : '') + '">' + R.k[n] + '</td>';
      for (i = n - 1; i >= 0; i--) {
        var kk = R.k[i];
        h += '<td class="' + (kk ? 'vf-k1' : 'vf-k0') + (i % 4 === 0 && i ? ' vf-c-nib' : '') + (i === R.bitDC ? ' vf-c-dc' : '') + '"' + (i === R.bitDC ? ' title="sale del bit ' + (R.bitDC - 1) + ' (DC)"' : '') + '>' + (i === 0 ? '' : kk) + '</td>';
      }
      h += '</tr>';
      function filaNum(nombre, v, cls) {
        var s = '<tr class="' + cls + '"><th scope="row">' + nombre + '</th><td class="vf-c-sal"></td>';
        for (var j = n - 1; j >= 0; j--) s += '<td class="' + (j === bAlto ? 'vf-c-msb' : '') + (j % 4 === 0 && j ? ' vf-c-nib' : '') + '">' + ((v >> j) & 1) + '</td>';
        return s + '</tr>';
      }
      h += filaNum('A', R.a, 'vf-f-a');
      h += filaNum(simb + ' B', R.b, 'vf-f-b');
      h += filaNum(op === 'CP' ? '= (no se guarda)' : '= R', R.r, 'vf-f-r');
      h += '</tbody>';
      $('.vf-col').innerHTML = h;
      $('.vf-col-nota').innerHTML = op === 'ADD'
        ? 'Cada columna suma A + B + el acarreo que llega desde la derecha. La columna <strong>C</strong> es el acarreo que sale del bit ' + bAlto + '. La casilla con borde discontinuo (sobre el bit ' + R.bitDC + ') es el acarreo que sale del bit ' + (R.bitDC - 1) + ': <strong>DC</strong>.'
        : 'En cada columna se calcula A − B − (el préstamo anotado encima). Si no alcanza, la columna pide prestado a la de su izquierda: aparece un 1 encima de esa columna, que tendrá que restarlo. La columna <strong>pr.</strong> es el préstamo que sale del bit ' + bAlto + ': en el dsPIC <strong>C = 1 − préstamo</strong>. La casilla con borde discontinuo (sobre el bit ' + R.bitDC + ') es el préstamo que el bit ' + R.bitDC + ' da al bit ' + (R.bitDC - 1) + ' (DC = 1 − ese préstamo).';

      // Resultado
      $('.vf-res').innerHTML =
        '<div class="vf-res-fila"><span class="vf-lbl">' + (op === 'CP' ? 'Resultado de la resta (CP no lo guarda)' : 'Resultado W2') + '</span>' +
        '<span class="vf-res-hex">' + hx(R.r, n) + '</span><span class="vf-res-bin">' + binStr(R.r, n) + '</span></div>' +
        (n === 8 && op !== 'CP' ? '<p class="vf-nota">Con <code>.B</code> solo se escribe el byte bajo de W2; su byte alto no cambia.</p>' : '');

      // Interpretaciones
      var aU = R.a, bU = R.b, rU = R.r, aS = conSigno(R.a, n), bS = conSigno(R.b, n), rS = conSigno(R.r, n);
      var verdU = op === 'ADD' ? aU + bU : aU - bU;
      var verdS = op === 'ADD' ? aS + bS : aS - bS;
      var maxU = mask, minS = -(1 << (n - 1)), maxS = (1 << (n - 1)) - 1;
      var okU = verdU >= 0 && verdU <= maxU, okS = verdS >= minS && verdS <= maxS;
      function par(v) { return v < 0 ? '(' + v + ')' : String(v); }
      $('.vf-interp').innerHTML =
        '<caption>Interpretación de los mismos bits</caption>' +
        '<thead><tr><th scope="col"></th><th scope="col">Hex</th><th scope="col">Sin signo <span>0 … ' + maxU + '</span></th><th scope="col">Con signo (C2) <span>' + minS + ' … ' + maxS + '</span></th></tr></thead><tbody>' +
        '<tr><th scope="row">A</th><td>' + hx(aU, n) + '</td><td>' + aU + '</td><td>' + aS + '</td></tr>' +
        '<tr><th scope="row">B</th><td>' + hx(bU, n) + '</td><td>' + bU + '</td><td>' + bS + '</td></tr>' +
        '<tr><th scope="row">Cuenta exacta</th><td></td><td>' + aU + ' ' + simb + ' ' + bU + ' = ' + verdU + '</td><td>' + aS + ' ' + simb + ' ' + par(bS) + ' = ' + verdS + '</td></tr>' +
        '<tr class="vf-i-r"><th scope="row">Resultado en ' + n + ' bits</th><td>' + hx(rU, n) + '</td>' +
          '<td class="' + (okU ? 'vf-ok' : 'vf-mal') + '">' + rU + (okU ? ' ✓ correcto' : ' ✗ no cabe (' + (op === 'ADD' ? 'C = 1' : 'C = 0, hubo préstamo') + ')') + '</td>' +
          '<td class="' + (okS ? 'vf-ok' : 'vf-mal') + '">' + rS + (okS ? ' ✓ correcto' : ' ✗ no cabe (OV = 1)') + '</td></tr>' +
        '</tbody>';

      // Flags con explicación
      var exC, exZ, exOV, exN, exDC;
      if (op === 'ADD') {
        exC = R.C
          ? 'Sale un acarreo del bit ' + bAlto + ': sin signo ' + aU + ' + ' + bU + ' = ' + verdU + ' &gt; ' + maxU + ', no cabe en ' + n + ' bits.'
          : 'No sale acarreo del bit ' + bAlto + ': sin signo ' + aU + ' + ' + bU + ' = ' + verdU + ' cabe en ' + n + ' bits.';
      } else {
        exC = R.C
          ? 'No hay préstamo: sin signo A ≥ B (' + aU + ' ≥ ' + bU + '). En el dsPIC, en la resta C = 1 significa «no hubo préstamo».'
          : 'Hay préstamo: sin signo A &lt; B (' + aU + ' &lt; ' + bU + '), el resultado sin signo sería negativo. C = 0 significa «hubo préstamo».';
      }
      exZ = R.Z ? 'El resultado es 0x' + (n === 8 ? '00' : '0000') + (op === 'CP' ? ': A y B son iguales.' : '.') : 'El resultado no es cero' + (op === 'CP' ? ': A ≠ B.' : '.');
      exN = 'Bit ' + bAlto + ' del resultado = ' + R.N + (R.N ? ': leído con signo, el resultado es negativo.' : ': leído con signo, el resultado no es negativo.');
      var sA = signoTxt(R.a, n), sB = signoTxt(R.b, n), sR = signoTxt(R.r, n);
      if (op === 'ADD') {
        if (sA !== sB) exOV = 'A es ' + sA + ' y B es ' + sB + ': sumar dos números de distinto signo nunca desborda.';
        else if (R.OV) exOV = 'A y B son ' + sA + 's y el resultado sale ' + sR + ': cambio de signo imposible. Con signo, ' + aS + ' + ' + par(bS) + ' = ' + verdS + ' no cabe en ' + minS + ' … ' + maxS + '.';
        else exOV = 'A y B son ' + sA + 's y el resultado también: con signo ' + verdS + ' cabe en ' + n + ' bits.';
      } else {
        if (sA === sB) exOV = 'A y B tienen el mismo signo: restarlos nunca desborda.';
        else if (R.OV) exOV = 'A es ' + sA + ' y B ' + sB + ': A − B es como sumar dos ' + sA + 's, y el resultado sale ' + sR + ' (cambio de signo imposible). Con signo, ' + aS + ' − ' + par(bS) + ' = ' + verdS + ' no cabe en ' + minS + ' … ' + maxS + '.';
        else exOV = 'A es ' + sA + ' y B ' + sB + ', pero el resultado conserva el signo de A: ' + verdS + ' cabe en ' + n + ' bits.';
      }
      var bDC = R.bitDC - 1;
      exDC = op === 'ADD'
        ? (R.DC ? 'Sale acarreo del bit ' + bDC + ' al ' + R.bitDC + '.' : 'No sale acarreo del bit ' + bDC + ' al ' + R.bitDC + '.') + ' Se usa para aritmética BCD; el libro no lo muestra.'
        : (R.DC ? 'No hay préstamo del bit ' + R.bitDC + ' al ' + bDC + ' (DC = 1).' : 'Hay préstamo del bit ' + R.bitDC + ' al ' + bDC + ' (DC = 0).') + ' Igual que C, en la resta es un «préstamo negado». El libro no lo muestra.';

      function tarjeta(nom, v, bit, ex, extra) {
        return '<div class="vf-flag' + (v ? ' vf-flag-1' : '') + (extra ? ' vf-flag-dc' : '') + '">' +
          '<div class="vf-flag-cab"><span class="vf-flag-nom">' + nom + '</span><span class="vf-flag-bit">SR&lt;' + bit + '&gt;</span><span class="vf-flag-v" aria-label="' + nom + ' vale ' + v + '">' + v + '</span></div>' +
          '<p>' + ex + '</p></div>';
      }
      $('.vf-flags').innerHTML =
        tarjeta('C', R.C, 0, exC) + tarjeta('Z', R.Z, 1, exZ) + tarjeta('OV', R.OV, 2, exOV) + tarjeta('N', R.N, 3, exN) + tarjeta('DC', R.DC, 8, exDC, true);

      var flagsOn = [];
      if (R.N) flagsOn.push('N'); if (R.OV) flagsOn.push('OV'); if (R.Z) flagsOn.push('Z'); if (R.C) flagsOn.push('C');
      $('.vf-sr').innerHTML =
        '<div class="vf-sr-fila"><span class="vf-lbl">SR (bits N OV Z C)</span>' +
          '<span class="vf-sr-bits">' + R.N + ' ' + R.OV + ' ' + R.Z + ' ' + R.C + '</span>' +
          '<span class="vf-sr-hex">SR = 0x' + ('000' + R.sr.toString(16).toUpperCase()).slice(-4) + '</span>' +
          '<span class="vf-sr-on">' + (flagsOn.length ? '(' + flagsOn.join(', ') + ')' : '(ningún flag)') + '</span></div>' +
        '<p class="vf-nota">Así lo escribe el libro (bits 3…0). ' + (R.DC
          ? 'Contando también DC (bit 8), el SR real valdría <strong>0x' + ('000' + R.srDC.toString(16).toUpperCase()).slice(-4) + '</strong> (suponiendo a 0 los demás bits: IPL, RA…).'
          : 'DC (bit 8) vale 0, así que el valor no cambia al contarlo.') + '</p>';
    }

    // ---- Eventos ----
    el.addEventListener('click', function (e) {
      var t = e.target.closest('button');
      if (!t || !el.contains(t)) return;
      var mask = (1 << st.n) - 1;
      if (t.classList.contains('vf-op')) { st.op = t.getAttribute('data-op'); pintar(); return; }
      if (t.classList.contains('vf-an')) {
        st.n = +t.getAttribute('data-n');
        st.a &= (1 << st.n) - 1; st.b &= (1 << st.n) - 1;
        pintar(); return;
      }
      if (t.classList.contains('vf-ej')) {
        var ej = EJEMPLOS[+t.getAttribute('data-ej')];
        st.a = ej.a; st.b = ej.b; st.op = ej.op; st.n = ej.ancho;
        pintar(); return;
      }
      if (t.classList.contains('vf-bit')) {
        var b = +t.getAttribute('data-bit');
        var cual = t.closest('.vf-bits-a') ? 'a' : 'b';
        st[cual] = (st[cual] ^ (1 << b)) & mask;
        pintar();
        var nuevo = el.querySelector('.vf-bits-' + cual + ' .vf-bit[data-bit="' + b + '"]');
        if (nuevo) nuevo.focus();
      }
    });
    function enlazar(inp, clave) {
      inp.addEventListener('input', function () {
        var v = leerValor(inp.value);
        var mask = (1 << st.n) - 1;
        var minS = -(1 << (st.n - 1));
        if (v === null || v > mask || v < minS) { inp.setAttribute('aria-invalid', 'true'); return; }
        inp.removeAttribute('aria-invalid');
        st[clave] = v & mask; pintar();
      });
      function normal() { inp.value = hx(st[clave], st.n); inp.removeAttribute('aria-invalid'); }
      inp.addEventListener('change', normal);
      inp.addEventListener('blur', normal);
    }
    enlazar(inA, 'a'); enlazar(inB, 'b');
    inA.setAttribute('aria-describedby', id + '-ayuda');
    inB.setAttribute('aria-describedby', id + '-ayuda');
    $('.vf-ctrl').insertAdjacentHTML('afterend', '<p class="vf-nota" id="' + id + '-ayuda">Escribe en hex (<code>0x82</code>) o en decimal (<code>-126</code>), o pulsa los bits.</p>');

    pintar();
  };

  MPI.componentes['vis-flags']._calcular = calcular;
})();
