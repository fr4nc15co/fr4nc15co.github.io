/*
 * Componente "calc-mascaras": calculadora de máscaras de 16 bits (int del XC16).
 *
 * Uso en el contenido:
 *   <div class="mpi-mount" data-componente="calc-mascaras"
 *        data-config='{"valor":"0xFA45","ejemplos":[{"op":"&","m":"0x000F"},{"op":">>","n":4}]}'></div>
 *
 * Claves de data-config (todas opcionales):
 *   valor     operando A inicial (hex "0x...." o número). Por defecto 0xFA45.
 *   mascara   máscara B inicial. Por defecto 0x000F.
 *   op        operador inicial: "&", "|", "^", "~", "<<", ">>". Por defecto "&".
 *   n         desplazamientos iniciales (0..15). Por defecto 4.
 *   signo     true = A se declara int (con signo); false = unsigned int (defecto).
 *   ejemplos  [{op, m | n, valor?, signo?}] botones que cargan un ejemplo.
 *   copiar    {a, b, origen, destino} valores iniciales del modo «Copiar un bit»
 *             (por defecto a = 0x5550, b = 0x1234, origen = 2, destino = 2).
 *   modo      "operar" (defecto) o "copiar".
 */
window.MPI = window.MPI || {};
MPI.componentes = MPI.componentes || {};

(function () {
  var OPS = ['&', '|', '^', '~', '<<', '>>'];
  var NOMBRE_OP = { '&': 'AND', '|': 'OR', '^': 'XOR', '~': 'NOT (complemento a uno)', '<<': 'desplazar a la izquierda', '>>': 'desplazar a la derecha' };
  var LEYENDA = {
    cons: 'se conserva', f0: 'forzado a 0', f1: 'forzado a 1', inv: 'invertido',
    mov: 'desplazado', e0: 'entra un 0', e1: 'entra un 1 (signo)'
  };
  var uid = 0;

  function h4(v) {
    var s = (v & 0xFFFF).toString(16).toUpperCase();
    while (s.length < 4) s = '0' + s;
    return '0x' + s;
  }
  function bin(v) {
    var s = '';
    for (var b = 15; b >= 0; b--) { s += (v >> b) & 1; if (b % 4 === 0 && b) s += ' '; }
    return s;
  }
  function conSigno(v) { v &= 0xFFFF; return (v & 0x8000) ? v - 0x10000 : v; }
  function leerHex(t) {
    t = String(t).trim().replace(/^0x/i, '');
    if (!/^[0-9a-f]{1,4}$/i.test(t)) return null;
    return parseInt(t, 16);
  }
  function leerCfg(v, def) {
    if (typeof v === 'number' && isFinite(v)) return v & 0xFFFF;
    if (typeof v === 'string') {
      if (/^\s*0x/i.test(v)) { var h = leerHex(v); return h === null ? def : h; }
      if (/^\s*-?\d+\s*$/.test(v)) return parseInt(v, 10) & 0xFFFF;
    }
    return def;
  }
  function leerN(v, def) {
    var n = parseInt(v, 10);
    if (isNaN(n)) return def;
    return Math.max(0, Math.min(15, n));
  }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  // Cálculo con aritmética de 16 bits. Devuelve el resultado y, para cada bit
  // del resultado, qué le ha pasado (clave de LEYENDA).
  function calcular(a, op, m, n, signo) {
    var r, cl = [], b;
    a &= 0xFFFF; m &= 0xFFFF;
    switch (op) {
      case '&': r = a & m; for (b = 0; b < 16; b++) cl[b] = ((m >> b) & 1) ? 'cons' : 'f0'; break;
      case '|': r = a | m; for (b = 0; b < 16; b++) cl[b] = ((m >> b) & 1) ? 'f1' : 'cons'; break;
      case '^': r = a ^ m; for (b = 0; b < 16; b++) cl[b] = ((m >> b) & 1) ? 'inv' : 'cons'; break;
      case '~': r = ~a; for (b = 0; b < 16; b++) cl[b] = 'inv'; break;
      case '<<': r = a << n; for (b = 0; b < 16; b++) cl[b] = b < n ? 'e0' : 'mov'; break;
      case '>>':
        var arit = signo && (a & 0x8000);
        r = arit ? (conSigno(a) >> n) : (a >>> n);
        for (b = 0; b < 16; b++) cl[b] = b > 15 - n ? (arit ? 'e1' : 'e0') : 'mov';
        break;
      default: r = a; for (b = 0; b < 16; b++) cl[b] = 'cons';
    }
    return { r: r & 0xFFFF, clases: cl };
  }

  // Modo «copiar un bit» (libro, 4.3.1): temp = b & mo; a &= ~md; a |= temp >> / << k.
  function copiarBit(a, b, o, d, signo) {
    var mo = (1 << o) & 0xFFFF, md = (1 << d) & 0xFFFF;
    var temp = b & mo;
    var a1 = a & (~md & 0xFFFF);
    var mov;
    if (o > d) mov = signo ? (conSigno(temp) >> (o - d)) : (temp >>> (o - d));
    else mov = temp << (d - o);
    mov &= 0xFFFF;
    var a2 = (a1 | mov) & 0xFFFF;
    // Con int, temp = 0x8000 es negativo y temp >> k mete unos: estropea a.
    var fallo = signo && o === 15 && o > d && (temp & 0x8000);
    return { mo: mo, md: md, temp: temp, nmd: ~md & 0xFFFF, a1: a1, mov: mov, a2: a2, fallo: !!fallo };
  }

  MPI.componentes['calc-mascaras'] = function (el, cfg) {
    cfg = cfg || {};
    var id = 'cm' + (++uid);
    var ejemplos = Array.isArray(cfg.ejemplos) ? cfg.ejemplos : [
      { op: '&', m: '0x000F' }, { op: '|', m: '0x000F' }, { op: '>>', n: 4 }, { op: '<<', n: 4 }
    ];
    var valorIni = leerCfg(cfg.valor, 0xFA45);
    var st = {
      modo: cfg.modo === 'copiar' ? 'copiar' : 'operar',
      a: valorIni,
      op: OPS.indexOf(cfg.op) >= 0 ? cfg.op : '&',
      m: leerCfg(cfg.mascara, 0x000F),
      n: leerN(cfg.n, 4),
      signo: cfg.signo === true,
      ca: leerCfg(cfg.copiar && cfg.copiar.a, 0x5550),
      cb: leerCfg(cfg.copiar && cfg.copiar.b, 0x1234),
      co: leerN(cfg.copiar && cfg.copiar.origen, 2),
      cd: leerN(cfg.copiar && cfg.copiar.destino, 2),
      csigno: !(cfg.copiar && cfg.copiar.signo === false)
    };

    function filaBits(clase, etiqueta) {
      // 16 botones, agrupados en 2 bytes x 2 nibbles (en móvil los bytes bajan de línea).
      var h = '<div class="cm-bits ' + clase + '" role="group" aria-label="' + etiqueta + '">';
      for (var by = 1; by >= 0; by--) {
        h += '<div class="cm-byte">';
        for (var ni = 1; ni >= 0; ni--) {
          h += '<div class="cm-nib">';
          for (var k = 3; k >= 0; k--) {
            var b = by * 8 + ni * 4 + k;
            h += '<button type="button" class="cm-bit" data-bit="' + b + '"><span class="cm-bn" aria-hidden="true">' + b + '</span><span class="cm-bv">0</span></button>';
          }
          h += '</div>';
        }
        h += '</div>';
      }
      return h + '</div>';
    }
    function filaRes(clase, etiqueta) {
      var h = '<div class="cm-bits cm-res ' + clase + '" role="img" aria-label="' + etiqueta + '">';
      for (var by = 1; by >= 0; by--) {
        h += '<div class="cm-byte">';
        for (var ni = 1; ni >= 0; ni--) {
          h += '<div class="cm-nib">';
          for (var k = 3; k >= 0; k--) {
            var b = by * 8 + ni * 4 + k;
            h += '<span class="cm-bit" data-bit="' + b + '"><span class="cm-bn">' + b + '</span><span class="cm-bv">0</span></span>';
          }
          h += '</div>';
        }
        h += '</div>';
      }
      return h + '</div>';
    }

    var botonesOp = OPS.map(function (o) {
      return '<button type="button" class="cm-op" data-op="' + esc(o) + '" aria-pressed="false" title="' + NOMBRE_OP[o] + '">' + esc(o) + '</button>';
    }).join('');
    var botonesEj = ejemplos.map(function (ej, i) {
      var va = leerCfg(ej.valor, valorIni);
      var txt = ej.op === '~' ? '~' + h4(va)
        : h4(va) + ' ' + ej.op + ' ' + ((ej.op === '<<' || ej.op === '>>') ? leerN(ej.n, 1) : h4(leerCfg(ej.m, 0)));
      return '<button type="button" class="cm-ej" data-ej="' + i + '">' + esc(txt) + '</button>';
    }).join('');
    var opsBits = '';
    for (var q = 15; q >= 0; q--) opsBits += '<option value="' + q + '">bit ' + q + '</option>';

    el.classList.add('mpi-calc-mascaras');
    el.innerHTML =
      '<div class="mpi-sim-cab">Calculadora de máscaras <span class="cm-sub">16 bits (int del XC16)</span></div>' +
      '<div class="cm-modos" role="group" aria-label="Modo">' +
        '<button type="button" class="cm-modo" data-modo="operar" aria-pressed="false">Operaciones bit a bit</button>' +
        '<button type="button" class="cm-modo" data-modo="copiar" aria-pressed="false">Copiar un bit</button>' +
      '</div>' +

      // ---------------- Modo operar ----------------
      '<div class="cm-panel cm-p-operar">' +
        (ejemplos.length ? '<div class="cm-ejemplos"><span class="cm-lbl">Ejemplos del libro:</span>' + botonesEj + '</div>' : '') +
        '<div class="cm-fila">' +
          '<div class="cm-fila-cab"><label for="' + id + '-a">Operando A</label>' +
            '<input id="' + id + '-a" class="cm-hex cm-in-a" type="text" spellcheck="false" autocomplete="off" inputmode="text" maxlength="6" aria-describedby="' + id + '-ad">' +
            '<span class="cm-dec" id="' + id + '-ad"></span></div>' +
          filaBits('cm-bits-a', 'Bits del operando A (pulsa para cambiar)') +
        '</div>' +
        '<div class="cm-fila cm-fila-op">' +
          '<span class="cm-lbl" id="' + id + '-opl">Operador</span>' +
          '<div class="cm-ops" role="group" aria-labelledby="' + id + '-opl">' + botonesOp + '</div>' +
          '<label class="cm-chk"><input type="checkbox" class="cm-signo"> <span>A es <code>int</code> con signo</span> <span class="cm-tipo"></span></label>' +
        '</div>' +
        '<div class="cm-fila cm-fila-m">' +
          '<div class="cm-fila-cab"><label for="' + id + '-m">Máscara B</label>' +
            '<input id="' + id + '-m" class="cm-hex cm-in-m" type="text" spellcheck="false" autocomplete="off" maxlength="6">' +
            '<span class="cm-dec cm-m-dec"></span></div>' +
          filaBits('cm-bits-m', 'Bits de la máscara B (pulsa para cambiar)') +
        '</div>' +
        '<div class="cm-fila cm-fila-n">' +
          '<div class="cm-fila-cab"><label for="' + id + '-n">Desplazamientos</label>' +
            '<input id="' + id + '-n" class="cm-in-n" type="number" min="0" max="15" step="1">' +
            '<span class="cm-dec">posiciones (0 a 15)</span></div>' +
        '</div>' +
        '<div class="cm-fila cm-fila-r">' +
          '<div class="cm-fila-cab"><span class="cm-lbl">Resultado</span> <button type="button" class="cm-usar">Resultado → A</button></div>' +
          filaRes('cm-bits-r', 'Bits del resultado') +
          '<div class="cm-leyenda" aria-hidden="true"></div>' +
          '<table class="cm-tabla" aria-live="polite"><tbody>' +
            '<tr><th scope="row">Hex</th><td class="cm-r-hex"></td></tr>' +
            '<tr><th scope="row">Binario</th><td class="cm-r-bin"></td></tr>' +
            '<tr><th scope="row">Decimal <span>unsigned int</span></th><td class="cm-r-u"></td></tr>' +
            '<tr><th scope="row">Decimal <span>int</span></th><td class="cm-r-s"></td></tr>' +
          '</tbody></table>' +
          '<p class="cm-expl"></p>' +
          '<div class="cm-codigo"></div>' +
        '</div>' +
      '</div>' +

      // ---------------- Modo copiar ----------------
      '<div class="cm-panel cm-p-copiar">' +
        '<p class="cm-nota">Haz que un bit de <code>a</code> sea igual a un bit de <code>b</code> sin modificar el resto de bits de <code>a</code> (AND para seleccionar, AND con <code>~</code> para borrar, OR para copiar).</p>' +
        '<div class="cm-copiar-form">' +
          '<label>a = <input class="cm-hex cm-in-ca" type="text" spellcheck="false" autocomplete="off" maxlength="6"></label>' +
          '<label>b = <input class="cm-hex cm-in-cb" type="text" spellcheck="false" autocomplete="off" maxlength="6"></label>' +
          '<label>Bit origen (de b) <select class="cm-in-co">' + opsBits + '</select></label>' +
          '<label>Bit destino (de a) <select class="cm-in-cd">' + opsBits + '</select></label>' +
          '<label class="cm-chk"><input type="checkbox" class="cm-csigno"> <span>Declarar como <code>int</code> (como el libro)</span></label>' +
        '</div>' +
        '<div class="cm-c-codigo"></div>' +
        '<div class="cm-c-wrap"><table class="cm-pasos" aria-live="polite"><thead><tr><th scope="col">Instrucción</th><th scope="col">Hex</th><th scope="col">Binario</th></tr></thead><tbody></tbody></table></div>' +
        '<p class="cm-c-aviso" hidden></p>' +
        '<p class="cm-nota">Si en lugar de <code>a</code> fuera <code>PORTB</code>, el <code>&amp;=</code> y el <code>|=</code> seguidos leen el puerto dos veces (riesgo de lectura-modificación-escritura): trabaja sobre una variable y escribe una sola vez (<code>PORTB = salida;</code>).</p>' +
      '</div>';

    function $(s) { return el.querySelector(s); }
    var inA = $('.cm-in-a'), inM = $('.cm-in-m'), inN = $('.cm-in-n'), chkS = $('.cm-signo');
    var inCA = $('.cm-in-ca'), inCB = $('.cm-in-cb'), selCO = $('.cm-in-co'), selCD = $('.cm-in-cd'), chkCS = $('.cm-csigno');

    function pintarBits(fila, v) {
      var bs = fila.querySelectorAll('.cm-bit');
      for (var i = 0; i < bs.length; i++) {
        var b = +bs[i].getAttribute('data-bit');
        var on = (v >> b) & 1;
        bs[i].querySelector('.cm-bv').textContent = on;
        bs[i].classList.toggle('cm-on', !!on);
        if (bs[i].tagName === 'BUTTON') {
          bs[i].setAttribute('aria-pressed', on ? 'true' : 'false');
          bs[i].setAttribute('aria-label', 'Bit ' + b + ' = ' + on);
        }
      }
    }

    function codigoC(texto) {
      return '<pre><code class="lang-c">' + esc(texto) + '</code></pre>';
    }
    function resaltar(cont) { if (MPI.resaltarTodo) MPI.resaltarTodo(cont); }

    function pintarOperar() {
      var unaria = st.op === '~', despl = st.op === '<<' || st.op === '>>';
      $('.cm-fila-m').hidden = unaria || despl;
      $('.cm-fila-n').hidden = !despl;
      var bOps = el.querySelectorAll('.cm-op');
      for (var i = 0; i < bOps.length; i++) bOps[i].setAttribute('aria-pressed', bOps[i].getAttribute('data-op') === st.op ? 'true' : 'false');
      if (document.activeElement !== inA) inA.value = h4(st.a);
      if (document.activeElement !== inM) inM.value = h4(st.m);
      if (document.activeElement !== inN) inN.value = st.n;
      inA.removeAttribute('aria-invalid'); inM.removeAttribute('aria-invalid');
      chkS.checked = st.signo;
      $('.cm-tipo').textContent = st.signo ? '(int)' : '(unsigned int)';
      $('#' + id + '-ad').textContent = '= ' + (st.signo ? conSigno(st.a) : st.a);
      $('.cm-m-dec').textContent = '= ' + st.m;
      pintarBits($('.cm-bits-a'), st.a);
      pintarBits($('.cm-bits-m'), st.m);

      var res = calcular(st.a, st.op, st.m, st.n, st.signo);
      var fila = $('.cm-bits-r');
      var celdas = fila.querySelectorAll('.cm-bit');
      var usadas = {};
      for (i = 0; i < celdas.length; i++) {
        var b = +celdas[i].getAttribute('data-bit');
        var on = (res.r >> b) & 1, c = res.clases[b];
        usadas[c] = 1;
        celdas[i].className = 'cm-bit cm-k-' + c + (on ? ' cm-on' : '');
        celdas[i].querySelector('.cm-bv').textContent = on;
        celdas[i].title = 'Bit ' + b + ': ' + LEYENDA[c];
      }
      var ley = '';
      ['cons', 'f0', 'f1', 'inv', 'mov', 'e0', 'e1'].forEach(function (k) {
        if (usadas[k]) ley += '<span class="cm-ley cm-k-' + k + '"><span class="cm-ley-c"></span>' + LEYENDA[k] + '</span>';
      });
      $('.cm-leyenda').innerHTML = ley;
      $('.cm-r-hex').textContent = h4(res.r);
      $('.cm-r-bin').textContent = bin(res.r);
      $('.cm-r-u').textContent = res.r;
      $('.cm-r-s').textContent = conSigno(res.r);
      fila.setAttribute('aria-label', 'Resultado ' + h4(res.r));

      // Explicación
      var ex = '';
      if (st.op === '&') ex = 'AND con máscara: donde B tiene un 1 el bit de A <strong>se ve</strong> (se conserva); donde B tiene un 0 el bit se <strong>fuerza a 0</strong>. Para poner a 0 unos bits de un registro se escribe <code>REG &amp;= ~MASCARA;</code>, con la máscara a 1 en los bits que se tocan.';
      else if (st.op === '|') ex = 'OR con máscara: donde B tiene un 1 el bit se <strong>fuerza a 1</strong>; donde B tiene un 0 el bit de A se conserva. En un registro: <code>REG |= valor;</code>, normalmente después de <code>REG &amp;= ~MASCARA;</code>.';
      else if (st.op === '^') ex = 'XOR con máscara: donde B tiene un 1 el bit de A se <strong>invierte</strong>; donde tiene un 0 se conserva.';
      else if (st.op === '~') ex = 'Complemento a uno: se invierten los 16 bits de A.';
      else if (st.op === '<<') ex = 'Desplazamiento a la izquierda ' + st.n + ' posiciones: entran ceros por la derecha y se pierden los ' + st.n + ' bits más altos de A' + (st.n ? ' (' + bin(st.a).replace(/ /g, '').slice(0, st.n) + ')' : '') + '. Equivale a multiplicar por 2<sup>' + st.n + '</sup> mientras no se pierdan unos.';
      else if (st.op === '>>') {
        var neg = st.a & 0x8000;
        if (st.signo && neg) ex = 'A es <code>int</code> con signo y <strong>negativo</strong> (bit 15 = 1): <code>&gt;&gt;</code> es aritmético y <strong>entran unos</strong> por la izquierda (conserva el signo).';
        else if (st.signo) ex = 'A es <code>int</code> con signo pero positivo (bit 15 = 0): entran ceros por la izquierda.';
        else ex = 'A es <code>unsigned int</code>: entran <strong>ceros</strong> por la izquierda' + (neg ? ' (márcala como <code>int</code> para ver el desplazamiento aritmético)' : '') + '.';
        ex += ' Se pierden los ' + st.n + ' bits más bajos' + (st.n ? ' (' + bin(st.a).replace(/ /g, '').slice(16 - st.n) + ')' : '') + '.';
      }
      $('.cm-expl').innerHTML = ex;

      var tipo = st.signo ? 'int' : 'unsigned int';
      var decA = st.signo ? conSigno(st.a) : st.a;
      var decR = st.signo ? conSigno(res.r) : res.r;
      var expr = st.op === '~' ? '~a' : despl ? 'a ' + st.op + ' ' + st.n : 'a ' + st.op + ' ' + h4(st.m);
      var linea1 = tipo + ' a = ' + h4(st.a) + ', r;';
      var linea2 = 'r = ' + expr + ';';
      var w = Math.max(linea1.length, linea2.length) + 3;
      function pad(s) { while (s.length < w) s += ' '; return s; }
      $('.cm-codigo').innerHTML = codigoC(pad(linea1) + '// a = ' + decA + '\n' + pad(linea2) + '// r = ' + h4(res.r) + ' = ' + decR);
      resaltar($('.cm-codigo'));
    }

    function pintarCopiar() {
      if (document.activeElement !== inCA) inCA.value = h4(st.ca);
      if (document.activeElement !== inCB) inCB.value = h4(st.cb);
      inCA.removeAttribute('aria-invalid'); inCB.removeAttribute('aria-invalid');
      selCO.value = String(st.co); selCD.value = String(st.cd);
      chkCS.checked = st.csigno;
      var o = st.co, d = st.cd, r = copiarBit(st.ca, st.cb, o, d, st.csigno);
      var tipo = st.csigno ? 'int' : 'unsigned int';
      var l3 = 'a |= temp' + (o > d ? ' >> ' + (o - d) : o < d ? ' << ' + (d - o) : '') + ';';
      var lineas = [
        [tipo + ' b = ' + h4(st.cb) + ', a = ' + h4(st.ca) + ', temp;', ''],
        ['temp = b & ' + h4(r.mo) + ';', '// selección bit ' + o],
        ['a &= ~' + h4(r.md) + ';', '// pone a cero bit ' + d],
        [l3, '// a.' + d + ' = temp.' + o]
      ];
      var w = 0;
      lineas.forEach(function (l) { if (l[1] && l[0].length > w) w = l[0].length; });
      var txt = lineas.map(function (l) {
        if (!l[1]) return l[0];
        var s = l[0]; while (s.length < w + 3) s += ' ';
        return s + l[1];
      }).join('\n');
      $('.cm-c-codigo').innerHTML = codigoC(txt);
      resaltar($('.cm-c-codigo'));

      function binMarca(v, bit) {
        var s = '';
        for (var b = 15; b >= 0; b--) {
          var c = (v >> b) & 1;
          s += b === bit ? '<mark>' + c + '</mark>' : c;
          if (b % 4 === 0 && b) s += ' ';
        }
        return s;
      }
      var filas = [
        ['b', st.cb, o],
        ['temp = b &amp; ' + h4(r.mo), r.temp, o],
        ['~' + h4(r.md), r.nmd, d],
        ['a &amp;= ~' + h4(r.md) + ' → a', r.a1, d]
      ];
      if (o !== d) filas.push(['temp ' + (o > d ? '&gt;&gt; ' + (o - d) : '&lt;&lt; ' + (d - o)), r.mov, d]);
      filas.push([esc(l3.replace(/;$/, '')) + ' → a', r.a2, d]);
      $('.cm-pasos tbody').innerHTML = filas.map(function (f, i) {
        return '<tr' + (i === filas.length - 1 ? ' class="cm-final"' : '') + '><td><code>' + f[0] + '</code></td><td class="cm-hexv">' + h4(f[1]) + '</td><td class="cm-binv">' + binMarca(f[1], f[2]) + '</td></tr>';
      }).join('');
      var av = $('.cm-c-aviso');
      if (r.fallo) {
        av.hidden = false;
        av.innerHTML = '⚠ Con <code>int</code>, <code>temp = 0x8000</code> es <strong>negativo</strong> y <code>temp &gt;&gt; ' + (o - d) + '</code> mete unos por la izquierda: el OR pone a 1 bits de <code>a</code> que no debía tocar. Declara <code>temp</code> como <code>unsigned int</code>.';
      } else { av.hidden = true; av.innerHTML = ''; }
    }

    function pintar() {
      var bm = el.querySelectorAll('.cm-modo');
      for (var i = 0; i < bm.length; i++) bm[i].setAttribute('aria-pressed', bm[i].getAttribute('data-modo') === st.modo ? 'true' : 'false');
      $('.cm-p-operar').hidden = st.modo !== 'operar';
      $('.cm-p-copiar').hidden = st.modo !== 'copiar';
      if (st.modo === 'operar') pintarOperar(); else pintarCopiar();
    }

    // ---- Eventos ----
    el.addEventListener('click', function (e) {
      var t = e.target.closest('button');
      if (!t || !el.contains(t)) return;
      if (t.classList.contains('cm-modo')) { st.modo = t.getAttribute('data-modo'); pintar(); return; }
      if (t.classList.contains('cm-op')) { st.op = t.getAttribute('data-op'); pintar(); return; }
      if (t.classList.contains('cm-usar')) { st.a = calcular(st.a, st.op, st.m, st.n, st.signo).r; pintar(); return; }
      if (t.classList.contains('cm-ej')) {
        var ej = ejemplos[+t.getAttribute('data-ej')] || {};
        st.a = leerCfg(ej.valor, valorIni);
        if (OPS.indexOf(ej.op) >= 0) st.op = ej.op;
        if (ej.m != null) st.m = leerCfg(ej.m, st.m);
        if (ej.n != null) st.n = leerN(ej.n, st.n);
        st.signo = ej.signo === true;
        pintar(); return;
      }
      if (t.classList.contains('cm-bit')) {
        var b = +t.getAttribute('data-bit');
        if (t.closest('.cm-bits-a')) st.a = (st.a ^ (1 << b)) & 0xFFFF;
        else if (t.closest('.cm-bits-m')) st.m = (st.m ^ (1 << b)) & 0xFFFF;
        pintar();
      }
    });

    function enlazarHex(inp, clave) {
      inp.addEventListener('input', function () {
        var v = leerHex(inp.value);
        if (v === null) { inp.setAttribute('aria-invalid', 'true'); return; }
        st[clave] = v; pintar();
      });
      inp.addEventListener('change', function () { inp.value = h4(st[clave]); inp.removeAttribute('aria-invalid'); });
      inp.addEventListener('blur', function () { inp.value = h4(st[clave]); inp.removeAttribute('aria-invalid'); });
    }
    enlazarHex(inA, 'a'); enlazarHex(inM, 'm'); enlazarHex(inCA, 'ca'); enlazarHex(inCB, 'cb');
    inN.addEventListener('input', function () {
      var n = parseInt(inN.value, 10);
      if (isNaN(n)) return;
      st.n = leerN(n, st.n); pintar();
    });
    inN.addEventListener('change', function () { inN.value = st.n; });
    chkS.addEventListener('change', function () { st.signo = chkS.checked; pintar(); });
    chkCS.addEventListener('change', function () { st.csigno = chkCS.checked; pintar(); });
    selCO.addEventListener('change', function () { st.co = +selCO.value; pintar(); });
    selCD.addEventListener('change', function () { st.cd = +selCD.value; pintar(); });

    pintar();
  };

  // Expuesto para pruebas.
  MPI.componentes['calc-mascaras']._calcular = calcular;
  MPI.componentes['calc-mascaras']._copiarBit = copiarBit;
})();
