/*
 * Componente "tabla-bra": simula «CP Wa, Wb» (a − b sin guardar el resultado),
 * muestra los flags y evalúa TODAS las condiciones de BRA del dsPIC.
 *
 * Uso en el contenido:
 *   <div class="mpi-mount" data-componente="tabla-bra" data-config='{"a":"0xFFFF","b":"0x0064"}'></div>
 *
 * Claves de data-config (todas opcionales):
 *   a, b    operandos de CP (hex "0x...." o decimal, también negativo). Por defecto 0xFFFF y 0x0064.
 *   ancho   16 (defecto, CP) u 8 (CP.B).
 *
 * Expresiones de salto: datasheet tabla 22-2 (nombres de las condiciones) y registro SR
 * (C = 1 si hay acarreo; en la resta C/DC funcionan como préstamo negado, §ALU). Las
 * expresiones lógicas son las del dsPIC30F/33F Programmer's Reference Manual (DS70157):
 *   GTU = C·¬Z  GEU = C  LTU = ¬C  LEU = ¬C + Z
 *   GT = ¬Z·¬(N⊕OV)  GE = ¬(N⊕OV)  LT = N⊕OV  LE = Z + (N⊕OV)
 * El libro (8.8.1) da GTU = ¬C·¬Z, LTU = C, GEU = ¬C, LEU = C + Z (trata C como préstamo):
 * se muestra como «⚠ A verificar» con comparación para los valores actuales.
 */
window.MPI = window.MPI || {};
MPI.componentes = MPI.componentes || {};

(function () {
  var uid = 0;
  var EJEMPLOS = [
    { a: 0xFFFF, b: 0x0064, txt: '−1 vs 100 (libro)' },
    { a: 0x0064, b: 0xFFFF, txt: '100 vs −1' },
    { a: 0x0005, b: 0x0005, txt: '5 vs 5' },
    { a: 0x8000, b: 0x0001, txt: '−32768 vs 1 (OV)' },
    { a: 0x0002, b: 0x000A, txt: '2 vs 10' }
  ];

  function hx(v, n) {
    var s = (v >>> 0).toString(16).toUpperCase();
    var d = n === 8 ? 2 : 4;
    while (s.length < d) s = '0' + s;
    return '0x' + s;
  }
  function conSigno(v, n) { return (v & (1 << (n - 1))) ? v - (1 << n) : v; }
  function leerValor(t) {
    if (typeof t === 'number' && isFinite(t)) return Math.round(t);
    t = String(t == null ? '' : t).trim();
    if (/^0x[0-9a-f]{1,4}$/i.test(t)) return parseInt(t.slice(2), 16);
    if (/^-?\d{1,6}$/.test(t)) return parseInt(t, 10);
    return null;
  }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  // CP a, b = a − b sin guardar. Flags con la semántica del dsPIC (C = 1 si NO hay préstamo).
  function cp(a, b, n) {
    var mask = (1 << n) - 1, msb = 1 << (n - 1);
    a &= mask; b &= mask;
    var r = (a - b) & mask;
    return {
      a: a, b: b, r: r,
      C: a >= b ? 1 : 0,
      Z: r === 0 ? 1 : 0,
      N: (r & msb) ? 1 : 0,
      OV: ((a ^ b) & (a ^ r) & msb) ? 1 : 0
    };
  }

  // Condiciones de BRA. f = flags; u/s = operandos sin / con signo.
  // expr: texto de la expresión; ev: valor; eva: expresión con los valores sustituidos.
  function no(x) { return 1 - x; }
  var CONDS = [
    { c: 'Z', ex: 'Z', ev: function (f) { return f.Z; }, sus: function (f) { return 'Z = ' + f.Z; }, lee: 'a == b', cmp: function (u, s) { return [u.a + ' == ' + u.b, u.a === u.b]; }, tipo: 'igualdad' },
    { c: 'NZ', ex: '¬Z', ev: function (f) { return no(f.Z); }, sus: function (f) { return '¬' + f.Z; }, lee: 'a != b', cmp: function (u, s) { return [u.a + ' != ' + u.b, u.a !== u.b]; }, tipo: 'igualdad' },
    { c: 'C', ex: 'C', ev: function (f) { return f.C; }, sus: function (f) { return 'C = ' + f.C; }, lee: 'a >= b sin signo (no hubo préstamo)', cmp: function (u) { return [u.a + ' >= ' + u.b, u.a >= u.b]; }, tipo: 'flag' },
    { c: 'NC', ex: '¬C', ev: function (f) { return no(f.C); }, sus: function (f) { return '¬' + f.C; }, lee: 'a < b sin signo (hubo préstamo)', cmp: function (u) { return [u.a + ' < ' + u.b, u.a < u.b]; }, tipo: 'flag' },
    { c: 'N', ex: 'N', ev: function (f) { return f.N; }, sus: function (f) { return 'N = ' + f.N; }, lee: 'el bit de signo de a − b es 1 (no equivale a a < b si hay OV)', cmp: null, tipo: 'flag' },
    { c: 'NN', ex: '¬N', ev: function (f) { return no(f.N); }, sus: function (f) { return '¬' + f.N; }, lee: 'el bit de signo de a − b es 0', cmp: null, tipo: 'flag' },
    { c: 'OV', ex: 'OV', ev: function (f) { return f.OV; }, sus: function (f) { return 'OV = ' + f.OV; }, lee: 'a − b con signo no cabe (desbordamiento)', cmp: function (u, s, n) { var d = s.a - s.b; return [s.a + ' − ' + par(s.b) + ' = ' + d + ' fuera de rango', d < -(1 << (n - 1)) || d > (1 << (n - 1)) - 1]; }, tipo: 'flag' },
    { c: 'NOV', ex: '¬OV', ev: function (f) { return no(f.OV); }, sus: function (f) { return '¬' + f.OV; }, lee: 'a − b con signo cabe', cmp: function (u, s, n) { var d = s.a - s.b; return [s.a + ' − ' + par(s.b) + ' = ' + d + ' cabe', d >= -(1 << (n - 1)) && d <= (1 << (n - 1)) - 1]; }, tipo: 'flag' },
    { c: 'GTU', ex: 'C ∧ ¬Z', ev: function (f) { return f.C & no(f.Z); }, sus: function (f) { return f.C + ' ∧ ¬' + f.Z; }, lee: 'a > b sin signo', cmp: function (u) { return [u.a + ' > ' + u.b, u.a > u.b]; }, tipo: 'sin' },
    { c: 'GEU', ex: 'C', ev: function (f) { return f.C; }, sus: function (f) { return 'C = ' + f.C; }, lee: 'a >= b sin signo', cmp: function (u) { return [u.a + ' >= ' + u.b, u.a >= u.b]; }, tipo: 'sin' },
    { c: 'LTU', ex: '¬C', ev: function (f) { return no(f.C); }, sus: function (f) { return '¬' + f.C; }, lee: 'a < b sin signo', cmp: function (u) { return [u.a + ' < ' + u.b, u.a < u.b]; }, tipo: 'sin' },
    { c: 'LEU', ex: '¬C ∨ Z', ev: function (f) { return no(f.C) | f.Z; }, sus: function (f) { return '¬' + f.C + ' ∨ ' + f.Z; }, lee: 'a <= b sin signo', cmp: function (u) { return [u.a + ' <= ' + u.b, u.a <= u.b]; }, tipo: 'sin' },
    { c: 'GT', ex: '¬Z ∧ ¬(N ⊕ OV)', ev: function (f) { return no(f.Z) & no(f.N ^ f.OV); }, sus: function (f) { return '¬' + f.Z + ' ∧ ¬(' + f.N + ' ⊕ ' + f.OV + ')'; }, lee: 'a > b con signo', cmp: function (u, s) { return [s.a + ' > ' + s.b, s.a > s.b]; }, tipo: 'con' },
    { c: 'GE', ex: '¬(N ⊕ OV)', ev: function (f) { return no(f.N ^ f.OV); }, sus: function (f) { return '¬(' + f.N + ' ⊕ ' + f.OV + ')'; }, lee: 'a >= b con signo', cmp: function (u, s) { return [s.a + ' >= ' + s.b, s.a >= s.b]; }, tipo: 'con' },
    { c: 'LT', ex: 'N ⊕ OV', ev: function (f) { return f.N ^ f.OV; }, sus: function (f) { return f.N + ' ⊕ ' + f.OV; }, lee: 'a < b con signo', cmp: function (u, s) { return [s.a + ' < ' + s.b, s.a < s.b]; }, tipo: 'con' },
    { c: 'LE', ex: 'Z ∨ (N ⊕ OV)', ev: function (f) { return f.Z | (f.N ^ f.OV); }, sus: function (f) { return f.Z + ' ∨ (' + f.N + ' ⊕ ' + f.OV + ')'; }, lee: 'a <= b con signo', cmp: function (u, s) { return [s.a + ' <= ' + s.b, s.a <= s.b]; }, tipo: 'con' }
  ];
  // Tabla del libro (8.8.1) para las condiciones sin signo: trata C como préstamo.
  var LIBRO = {
    GTU: { ex: '¬C ∧ ¬Z', ev: function (f) { return no(f.C) & no(f.Z); } },
    LTU: { ex: 'C', ev: function (f) { return f.C; } },
    GEU: { ex: '¬C', ev: function (f) { return no(f.C); } },
    LEU: { ex: 'C ∨ Z', ev: function (f) { return f.C | f.Z; } }
  };
  function par(v) { return v < 0 ? '(' + v + ')' : String(v); }

  MPI.componentes['tabla-bra'] = function (el, cfg) {
    cfg = cfg || {};
    var id = 'tb' + (++uid);
    var n0 = +cfg.ancho === 8 ? 8 : 16;
    var a0 = leerValor(cfg.a), b0 = leerValor(cfg.b);
    var st = {
      n: n0,
      a: (a0 === null ? 0xFFFF : a0) & ((1 << n0) - 1),
      b: (b0 === null ? 0x0064 : b0) & ((1 << n0) - 1),
      libro: false
    };

    el.classList.add('mpi-tabla-bra');
    el.innerHTML =
      '<div class="mpi-sim-cab">CP y BRA <span class="tb-sub">qué condiciones saltan tras comparar</span></div>' +
      '<div class="tb-ejemplos"><span class="tb-lbl">Ejemplos:</span>' +
        EJEMPLOS.map(function (e, i) { return '<button type="button" class="tb-ej" data-ej="' + i + '">' + esc(e.txt) + '</button>'; }).join('') +
      '</div>' +
      '<div class="tb-form">' +
        '<div class="tb-campo"><label for="' + id + '-a">a <span class="tb-reg">(W0)</span></label>' +
          '<input id="' + id + '-a" class="tb-hex tb-in-a" type="text" spellcheck="false" autocomplete="off" maxlength="7" aria-describedby="' + id + '-ayuda">' +
          '<span class="tb-dec tb-dec-a"></span></div>' +
        '<div class="tb-campo"><label for="' + id + '-b">b <span class="tb-reg">(W1)</span></label>' +
          '<input id="' + id + '-b" class="tb-hex tb-in-b" type="text" spellcheck="false" autocomplete="off" maxlength="7" aria-describedby="' + id + '-ayuda">' +
          '<span class="tb-dec tb-dec-b"></span></div>' +
        '<div class="tb-campo"><span class="tb-lbl" id="' + id + '-anl">Tamaño</span>' +
          '<span class="tb-seg" role="group" aria-labelledby="' + id + '-anl">' +
            '<button type="button" class="tb-an" data-n="16" aria-pressed="false">CP (16 bits)</button>' +
            '<button type="button" class="tb-an" data-n="8" aria-pressed="false">CP.B (8 bits)</button>' +
          '</span></div>' +
      '</div>' +
      '<p class="tb-nota" id="' + id + '-ayuda">Escribe en hex (<code>0xFFFF</code>) o en decimal (<code>-1</code>, <code>100</code>).</p>' +
      '<div class="tb-asm"></div>' +
      '<div class="tb-flags" aria-live="polite"></div>' +
      '<div class="tb-wrap" tabindex="0" role="region" aria-label="Condiciones de BRA"><table class="tb-tabla"></table></div>' +
      '<p class="tb-nota">Expresiones: el datasheet (tabla 22-2) solo nombra cada condición («Branch if unsigned greater than»…); las fórmulas son las del manual de referencia del programador de Microchip (DS70157), coherentes con el registro SR: tras una resta, C = 1 significa que <strong>no</strong> hubo préstamo. ⊕ = XOR: N ⊕ OV es el signo verdadero de a − b (N corregido por el desbordamiento) y vale 1 exactamente cuando a &lt; b con signo.</p>' +
      '<div class="tb-aviso" role="note">' +
        '<p><strong>⚠ A verificar · tabla del libro (8.8.1).</strong> El libro da para las comparaciones sin signo <code>GTU = ¬C ∧ ¬Z</code>, <code>LTU = C</code>, <code>GEU = ¬C</code> y <code>LEU = C ∨ Z</code>, como si C fuera un <em>préstamo</em> (C = 1 cuando a &lt; b). Pero en el dsPIC, tras SUB o CP, C = 1 cuando <strong>no</strong> hay préstamo (lo dice el propio libro en 8.5.2 y el registro SR del datasheet), así que las expresiones correctas son <code>GTU = C ∧ ¬Z</code>, <code>LTU = ¬C</code>, <code>GEU = C</code> y <code>LEU = ¬C ∨ Z</code> (las de la tabla de arriba). Los nombres con signo del libro (GTS, LTS, GES, LES) en el ensamblador son GT, LT, GE y LE.</p>' +
        '<button type="button" class="tb-libro" aria-expanded="false" aria-controls="' + id + '-libro">Comparar con la tabla del libro para estos valores</button>' +
        '<div class="tb-libro-cont" id="' + id + '-libro" hidden></div>' +
      '</div>';

    function $(s) { return el.querySelector(s); }
    var inA = $('.tb-in-a'), inB = $('.tb-in-b');

    function pintar() {
      var n = st.n, f = cp(st.a, st.b, n);
      var u = { a: f.a, b: f.b }, s = { a: conSigno(f.a, n), b: conSigno(f.b, n) };
      var suf = n === 8 ? '.B' : '';

      var bs = el.querySelectorAll('.tb-an');
      for (var i = 0; i < bs.length; i++) bs[i].setAttribute('aria-pressed', +bs[i].getAttribute('data-n') === n ? 'true' : 'false');
      if (document.activeElement !== inA) { inA.value = hx(f.a, n); inA.removeAttribute('aria-invalid'); }
      if (document.activeElement !== inB) { inB.value = hx(f.b, n); inB.removeAttribute('aria-invalid'); }
      $('.tb-dec-a').textContent = u.a + ' sin signo · ' + s.a + ' con signo';
      $('.tb-dec-b').textContent = u.b + ' sin signo · ' + s.b + ' con signo';

      var asm =
        'MOV  #' + hx(f.a, 16) + ', W0\n' +
        'MOV  #' + hx(f.b, 16) + ', W1\n' +
        'CP' + suf + (suf ? '' : '  ') + ' W0, W1        ; SR como W0 - W1 = ' + hx(f.r, n) + ' (no se guarda)\n' +
        'BRA  GTU, mayor    ; salta si W0 > W1 sin signo';
      $('.tb-asm').innerHTML = '<pre><code class="lang-asm">' + esc(asm) + '</code></pre>';

      $('.tb-flags').innerHTML =
        '<span class="tb-lbl">a − b = ' + hx(f.r, n) + ' →</span>' +
        ['C', 'Z', 'OV', 'N'].map(function (k) {
          return '<span class="tb-flag' + (f[k] ? ' tb-flag-1' : '') + '"><span class="tb-flag-n">' + k + '</span> = ' + f[k] + '</span>';
        }).join('') +
        '<span class="tb-flag-ex">' + (f.C ? 'C = 1: no hubo préstamo (a ≥ b sin signo)' : 'C = 0: hubo préstamo (a &lt; b sin signo)') + '</span>';

      var grupos = { igualdad: 'Igualdad', flag: 'Un solo flag', sin: 'Sin signo (unsigned)', con: 'Con signo (complemento a 2)' };
      var h = '<caption class="tb-oculto">Condiciones de BRA tras CP ' + hx(f.a, n) + ', ' + hx(f.b, n) + '</caption>' +
        '<thead><tr><th scope="col">BRA</th><th scope="col">¿Salta?</th><th scope="col">Expresión</th><th scope="col">Con estos flags</th><th scope="col">Lectura en C</th><th scope="col">Comprobación</th></tr></thead><tbody>';
      var grupo = '';
      CONDS.forEach(function (c) {
        if (c.tipo !== grupo) { grupo = c.tipo; h += '<tr class="tb-grupo"><th colspan="6" scope="colgroup">' + grupos[grupo] + '</th></tr>'; }
        var v = c.ev(f);
        var comp = c.cmp ? c.cmp(u, s, n) : null;
        h += '<tr class="' + (v ? 'tb-si' : 'tb-no') + '">' +
          '<th scope="row"><code>' + c.c + '</code></th>' +
          '<td class="tb-salta">' + (v ? '<span class="tb-si-txt">salta</span>' : '<span class="tb-no-txt">no salta</span>') + '</td>' +
          '<td class="tb-ex">' + c.ex + '</td>' +
          '<td class="tb-sus">' + c.sus(f) + (/^[A-Z]+ = \d$/.test(c.sus(f)) ? '' : ' = ' + v) + '</td>' +
          '<td class="tb-lee">' + esc(c.lee).replace(/^(a [^ ]+ b)/, '<code>$1</code>') + '</td>' +
          '<td class="tb-comp">' + (comp ? esc(comp[0]) + ' → ' + (comp[1] ? 'cierto' : 'falso') : '—') + '</td>' +
          '</tr>';
      });
      h += '</tbody>';
      $('.tb-tabla').innerHTML = h;

      // Comparación libro vs datasheet
      var cont = $('.tb-libro-cont');
      if (st.libro) {
        var hh = '<div class="tb-wrap"><table class="tb-comp-tabla"><caption>Para a = ' + u.a + ', b = ' + u.b + ' (sin signo) · C = ' + f.C + ', Z = ' + f.Z + '</caption>' +
          '<thead><tr><th scope="col">BRA</th><th scope="col">Libro</th><th scope="col">Datasheet / PRM</th><th scope="col">Lo que debe pasar</th></tr></thead><tbody>';
        ['GTU', 'GEU', 'LTU', 'LEU'].forEach(function (k) {
          var c = CONDS.filter(function (x) { return x.c === k; })[0];
          var vl = LIBRO[k].ev(f), vd = c.ev(f), comp = c.cmp(u, s, n), ok = comp[1] ? 1 : 0;
          hh += '<tr><th scope="row"><code>' + k + '</code></th>' +
            '<td class="' + (vl === ok ? 'tb-bien' : 'tb-mal') + '">' + LIBRO[k].ex + ' = ' + vl + ' → ' + (vl ? 'salta' : 'no salta') + (vl === ok ? ' ✓' : ' ✗') + '</td>' +
            '<td class="' + (vd === ok ? 'tb-bien' : 'tb-mal') + '">' + c.ex + ' = ' + vd + ' → ' + (vd ? 'salta' : 'no salta') + (vd === ok ? ' ✓' : ' ✗') + '</td>' +
            '<td>' + esc(comp[0]) + ' → ' + (ok ? 'debe saltar' : 'no debe saltar') + '</td></tr>';
        });
        hh += '</tbody></table></div>';
        hh += f.Z
          ? '<p class="tb-nota">Con a = b (Z = 1, C = 1) las dos versiones discrepan en GEU y LTU.</p>'
          : '<p class="tb-nota">Con a ≠ b, las cuatro expresiones del libro dan justo lo contrario que las del datasheet: tras CP, C = 1 significa a ≥ b sin signo, no a &lt; b.</p>';
        cont.innerHTML = hh;
      }
      cont.hidden = !st.libro;
      $('.tb-libro').setAttribute('aria-expanded', st.libro ? 'true' : 'false');
      $('.tb-libro').textContent = st.libro ? 'Ocultar la comparación' : 'Comparar con la tabla del libro para estos valores';
    }

    el.addEventListener('click', function (e) {
      var t = e.target.closest('button');
      if (!t || !el.contains(t)) return;
      if (t.classList.contains('tb-ej')) {
        var ej = EJEMPLOS[+t.getAttribute('data-ej')];
        st.n = 16; st.a = ej.a; st.b = ej.b; pintar(); return;
      }
      if (t.classList.contains('tb-an')) {
        st.n = +t.getAttribute('data-n');
        st.a &= (1 << st.n) - 1; st.b &= (1 << st.n) - 1;
        pintar(); return;
      }
      if (t.classList.contains('tb-libro')) { st.libro = !st.libro; pintar(); }
    });
    function enlazar(inp, clave) {
      inp.addEventListener('input', function () {
        var v = leerValor(inp.value), mask = (1 << st.n) - 1;
        if (v === null || v > mask || v < -(1 << (st.n - 1))) { inp.setAttribute('aria-invalid', 'true'); return; }
        inp.removeAttribute('aria-invalid');
        st[clave] = v & mask; pintar();
      });
      function normal() { inp.value = hx(st[clave], st.n); inp.removeAttribute('aria-invalid'); }
      inp.addEventListener('change', normal);
      inp.addEventListener('blur', normal);
    }
    enlazar(inA, 'a'); enlazar(inB, 'b');
    pintar();
  };

  MPI.componentes['tabla-bra']._cp = cp;
  MPI.componentes['tabla-bra']._conds = CONDS;
  MPI.componentes['tabla-bra']._libro = LIBRO;
})();
