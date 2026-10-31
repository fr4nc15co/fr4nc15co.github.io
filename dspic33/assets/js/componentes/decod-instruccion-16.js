/*
 * Componente "decod-instruccion-16": codificador / decodificador de las instrucciones
 * de 16 bits del micro HIPOTÉTICO del capítulo 6 (no es el dsPIC).
 *
 *   código (bits 15-12) 1 → add Wx, Wy    : 11-8 sin uso, 7-4 Wx (origen), 3-0 Wy (destino)
 *                       2 → move mem, Wx  : 11-4 mem, 3-0 Wx (destino)
 *                       3 → move Wx, mem  : 11-8 Wx (origen), 7-0 mem
 *   Comprobación: 0x1001 = add W0, W1 · 0x2100 = move 0x10, W0 · 0x2800 = move 0x80, W0
 *                 0x2821 = move 0x82, W1 · 0x3184 = move W1, 0x84 · move 0x84, W2 = 0x2842
 *
 * Uso: <div class="mpi-mount" data-componente="decod-instruccion-16"
 *           data-config='{"ejemplos":["0x1001","0x2100"],"formatos":[{"op":1,"asm":"add Wx, Wy",
 *                         "campos":"15-12 op, 11-8 sin uso, 7-4 Wx (origen), 3-0 Wy (destino)"}]}'></div>
 *
 * Claves de data-config (todas opcionales):
 *   formatos  [{op, asm, campos}]  formatos de instrucción; «campos» es texto «hi-lo nombre, …»
 *             (op = código, «sin uso», Wx/Wy = registro con «(origen)»/«(destino)», mem = dirección).
 *             Si falta o un formato no cubre los 16 bits sin solaparse, se usan los tres del libro.
 *   ejemplos  ["0x1001", …]  botones de ejemplo (defecto: los cinco del libro)
 *   inicial   valor inicial (defecto: el primer ejemplo)
 *   modo      "decodificar" (defecto) o "codificar"
 */
window.MPI = window.MPI || {};
MPI.componentes = MPI.componentes || {};

(function () {
  var uid = 0;

  var FORMATOS_LIBRO = [
    { op: 1, asm: 'add Wx, Wy', campos: '15-12 op, 11-8 sin uso, 7-4 Wx (origen), 3-0 Wy (destino)' },
    { op: 2, asm: 'move mem, Wx', campos: '15-12 op, 11-4 mem, 3-0 Wx (destino)' },
    { op: 3, asm: 'move Wx, mem', campos: '15-12 op, 11-8 Wx (origen), 7-0 mem' }
  ];
  var EJEMPLOS_LIBRO = ['0x1001', '0x2100', '0x2800', '0x2821', '0x3184'];

  function hx(v, n) {
    var s = (v >>> 0).toString(16).toUpperCase();
    while (s.length < n) s = '0' + s;
    return '0x' + s;
  }
  function bin(v, n) {
    var s = (v >>> 0).toString(2);
    while (s.length < n) s = '0' + s;
    return s;
  }
  function binAgrupado(v) { return bin(v, 16).replace(/(\d{4})(?=\d)/g, '$1 '); }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function num(v, def) {
    if (typeof v === 'number' && isFinite(v)) return v;
    if (typeof v === 'string') {
      var t = v.trim();
      if (/^0x[0-9a-f]+$/i.test(t)) return parseInt(t, 16);
      if (/^\d+$/.test(t)) return parseInt(t, 10);
    }
    return def;
  }
  function parseHex(txt, max) {
    var t = String(txt).trim().replace(/\s+/g, '');
    if (!/^(0x)?[0-9a-f]+$/i.test(t)) return null;
    var v = parseInt(t.replace(/^0x/i, ''), 16);
    return (v >= 0 && v <= max) ? v : null;
  }

  // ---- Formatos: texto «hi-lo nombre, …» → campos ----
  function parseCampos(txt) {
    var campos = [];
    String(txt || '').split(',').forEach(function (p) {
      var m = p.trim().match(/^(\d+)\s*(?:-\s*(\d+))?\s+(.+)$/);
      if (!m) return;
      var hi = +m[1], lo = m[2] != null ? +m[2] : hi;
      if (lo > hi) { var t = hi; hi = lo; lo = t; }
      var nombre = m[3].trim(), tipo, token = null, rol = null;
      if (/^op\b|c[oó]digo/i.test(nombre)) tipo = 'op';
      else if (/sin uso|no se usa/i.test(nombre)) tipo = 'nu';
      else if (/mem/i.test(nombre)) { tipo = 'mem'; token = 'mem'; }
      else if (/^W/.test(nombre)) { tipo = 'reg'; token = nombre.match(/^(W[A-Za-z0-9]?)/)[1]; }
      else tipo = 'nu';
      if (/origen/i.test(nombre)) rol = 'origen';
      else if (/destino/i.test(nombre)) rol = 'destino';
      campos.push({ hi: hi, lo: lo, n: hi - lo + 1, nombre: nombre, tipo: tipo, token: token, rol: rol });
    });
    campos.sort(function (a, b) { return b.hi - a.hi; });
    return campos;
  }
  function formatoValido(f) {
    var ocup = 0;
    for (var i = 0; i < f.campos.length; i++) {
      var c = f.campos[i];
      if (c.hi > 15 || c.lo < 0) return false;
      var mask = ((1 << c.n) - 1) << c.lo;
      if (ocup & mask) return false;
      ocup |= mask;
    }
    var op = f.campos.filter(function (c) { return c.tipo === 'op'; })[0];
    return ocup === 0xFFFF && op && op.hi === 15 && op.lo === 12;
  }
  function prepararFormatos(lista) {
    var out = [], vistos = {};
    (Array.isArray(lista) && lista.length ? lista : FORMATOS_LIBRO).forEach(function (f) {
      var op = num(f.op, -1);
      if (op < 0 || op > 15 || vistos[op]) return;
      var def = FORMATOS_LIBRO.filter(function (d) { return d.op === op; })[0];
      var F = { op: op, asm: String(f.asm || (def && def.asm) || ''), campos: parseCampos(f.campos) };
      if (!formatoValido(F) && def) F = { op: op, asm: def.asm, campos: parseCampos(def.campos) };
      if (!formatoValido(F)) return;
      F.mnem = F.asm.trim().split(/\s+/)[0];
      vistos[op] = 1;
      out.push(F);
    });
    if (!out.length) return prepararFormatos(FORMATOS_LIBRO);
    return out;
  }

  // Clase de color de un campo (común con sim-fetch-execute).
  function claseCampo(c) {
    if (c.tipo === 'op') return 'di16-f-op';
    if (c.tipo === 'mem') return 'di16-f-mem';
    if (c.tipo === 'reg') return c.rol === 'origen' ? 'di16-f-ro' : 'di16-f-rd';
    return 'di16-f-nu';
  }
  function etiquetaCampo(c) {
    if (c.tipo === 'op') return 'código';
    if (c.tipo === 'nu') return c.nombre === 'desconocido' ? '¿operandos?' : 'sin uso';
    if (c.tipo === 'mem') return 'mem';
    return c.token + (c.rol ? ' · ' + c.rol : '');
  }
  function textoValor(c, v) {
    if (c.tipo === 'reg') return 'W' + v;
    if (c.tipo === 'mem') return hx(v, Math.ceil(c.n / 4));
    if (c.tipo === 'op' || c.nombre !== 'desconocido') return String(v);
    return hx(v, Math.ceil(c.n / 4));
  }

  function decodificar(word, formatos) {
    var op = (word >> 12) & 0xF;
    var F = formatos.filter(function (f) { return f.op === op; })[0];
    if (!F) {
      return {
        ok: false, op: op, F: null,
        campos: [
          { hi: 15, lo: 12, n: 4, nombre: 'op', tipo: 'op', v: op },
          { hi: 11, lo: 0, n: 12, nombre: 'desconocido', tipo: 'nu', v: word & 0xFFF }
        ]
      };
    }
    var campos = F.campos.map(function (c) {
      var o = {}; for (var k in c) o[k] = c[k];
      o.v = (word >> c.lo) & ((1 << c.n) - 1);
      return o;
    });
    var porToken = {};
    campos.forEach(function (c) { if (c.token) porToken[c.token] = c; });
    // Instrucción en ensamblador con los operandos coloreados.
    var toks = Object.keys(porToken);
    var asmTxt = F.asm, asmHtml = esc(F.asm);
    if (toks.length) {
      var re = new RegExp('\\b(' + toks.join('|') + ')\\b', 'g');
      asmTxt = F.asm.replace(re, function (t) { return textoValor(porToken[t], porToken[t].v); });
      asmHtml = esc(F.asm).replace(re, function (t) {
        var c = porToken[t];
        return '<span class="' + claseCampo(c) + '">' + textoValor(c, c.v) + '</span>';
      });
    }
    asmHtml = asmHtml.replace(/^(\S+)/, '<span class="di16-f-op">$1</span>');
    // Significado (transferencia u operación).
    var partes = F.asm.trim().split(/\s+/), mn = partes.shift().toLowerCase();
    var ops = partes.join(' ').split(',').map(function (s) { return s.trim(); });
    function opTxt(t) {
      var c = porToken[t];
      if (!c) return t;
      return c.tipo === 'mem' ? '(' + textoValor(c, c.v) + ')' : textoValor(c, c.v);
    }
    var sem = '';
    if (ops.length === 2) {
      var a = opTxt(ops[0]), b = opTxt(ops[1]);
      if (/^mov/.test(mn)) sem = b + ' ← ' + a;
      else if (/^add/.test(mn)) sem = b + ' ← ' + a + ' + ' + b;
      else if (/^sub/.test(mn)) sem = b + ' ← ' + b + ' − ' + a;
    }
    var nuNoCero = campos.some(function (c) { return c.tipo === 'nu' && c.v !== 0; });
    return { ok: true, op: op, F: F, campos: campos, asm: asmTxt, asmHtml: asmHtml, sem: sem, nuNoCero: nuNoCero };
  }

  function codificar(F, valores) {
    var w = (F.op & 0xF) << 12;
    F.campos.forEach(function (c) {
      if (c.tipo === 'op' || c.tipo === 'nu') return;
      w |= ((valores[c.token] || 0) & ((1 << c.n) - 1)) << c.lo;
    });
    return w & 0xFFFF;
  }

  MPI.componentes['decod-instruccion-16'] = function (el, cfg) {
    cfg = cfg || {};
    var id = 'di16-' + (++uid);
    var formatos = prepararFormatos(cfg.formatos);
    var ejemplos = (Array.isArray(cfg.ejemplos) && cfg.ejemplos.length ? cfg.ejemplos : EJEMPLOS_LIBRO)
      .map(function (e) { return parseHex(e, 0xFFFF); })
      .filter(function (v) { return v != null; });
    var word = parseHex(cfg.inicial != null ? String(cfg.inicial) : '', 0xFFFF);
    if (word == null) word = ejemplos.length ? ejemplos[0] : 0x1001;
    var modo = cfg.modo === 'codificar' ? 'codificar' : 'decodificar';
    var fmtSel = formatos[0];
    var valores = {};

    el.classList.add('mpi-decod-instruccion-16');
    el.innerHTML =
      '<div class="mpi-sim-cab">Codificación de instrucciones <span class="di16-sub">micro hipotético · instrucciones de 16 bits</span></div>' +
      '<div class="di16-modos" role="group" aria-label="Modo">' +
        '<button type="button" data-modo="decodificar" aria-pressed="false">Decodificar <span aria-hidden="true">(hex → instrucción)</span></button>' +
        '<button type="button" data-modo="codificar" aria-pressed="false">Codificar <span aria-hidden="true">(instrucción → hex)</span></button>' +
      '</div>' +
      '<div class="di16-panel di16-p-dec">' +
        '<label class="di16-lab" for="' + id + '-hex">Código máquina (hex)</label>' +
        '<div class="di16-fila">' +
          '<input id="' + id + '-hex" class="di16-hex" type="text" inputmode="text" autocomplete="off" spellcheck="false" maxlength="6" aria-describedby="' + id + '-err">' +
          '<span class="di16-ayuda">o pulsa los bits</span>' +
        '</div>' +
        '<div class="di16-err" id="' + id + '-err" aria-live="polite"></div>' +
      '</div>' +
      '<div class="di16-panel di16-p-cod">' +
        '<div class="di16-form">' +
          '<label class="di16-lab"><span>Instrucción</span><select class="di16-sel-op">' +
            formatos.map(function (f) { return '<option value="' + f.op + '">' + esc(f.asm) + '  (código ' + f.op + ')</option>'; }).join('') +
          '</select></label>' +
          '<div class="di16-operandos"></div>' +
        '</div>' +
        '<div class="di16-err di16-err-cod" aria-live="polite"></div>' +
      '</div>' +
      '<div class="di16-tira">' +
        '<div class="di16-bits" role="group" aria-label="Bits de la instrucción, del 15 al 0 (pulsa uno para cambiarlo)"></div>' +
        '<div class="di16-campos" aria-hidden="true"></div>' +
      '</div>' +
      '<div class="di16-res" aria-live="polite"></div>' +
      '<div class="di16-tabla-wrap"><table class="di16-tabla"><caption class="di16-oculto">Campos de la instrucción</caption>' +
        '<thead><tr><th scope="col">Bits</th><th scope="col">Campo</th><th scope="col">Binario</th><th scope="col">Valor</th></tr></thead><tbody></tbody></table></div>' +
      (ejemplos.length ? '<div class="di16-ejemplos" role="group" aria-label="Ejemplos del libro"><span class="di16-lab">Ejemplos:</span>' +
        ejemplos.map(function (v) { return '<button type="button" data-ej="' + v + '">' + hx(v, 4) + '</button>'; }).join('') + '</div>' : '') +
      '<p class="di16-nota">Código en los bits 15-12 (hasta 16 instrucciones); 4 bits por registro (W0…W15); 8 bits de dirección (0x00…0xFF). ' +
        'Cada instrucción ocupa 16 bits = dos celdas de 8 bits.</p>';

    function $(s) { return el.querySelector(s); }
    var inHex = $('.di16-hex');

    function pintarOperandos() {
      var h = '';
      fmtSel.campos.forEach(function (c) {
        if (c.tipo === 'reg') {
          var n = 1 << c.n, opts = '';
          for (var r = 0; r < n; r++) opts += '<option value="' + r + '">W' + r + '</option>';
          h += '<label class="di16-lab"><span><span class="di16-chip ' + claseCampo(c) + '"></span>' + esc(c.token) + (c.rol ? ' (' + c.rol + ')' : '') +
            '</span><select data-tok="' + esc(c.token) + '">' + opts + '</select></label>';
        } else if (c.tipo === 'mem') {
          h += '<label class="di16-lab"><span><span class="di16-chip ' + claseCampo(c) + '"></span>mem (' + hx(0, Math.ceil(c.n / 4)) + '…' + hx((1 << c.n) - 1, Math.ceil(c.n / 4)) +
            ')</span><input type="text" class="di16-mem" data-tok="mem" autocomplete="off" spellcheck="false" maxlength="6"></label>';
        }
      });
      $('.di16-operandos').innerHTML = h;
    }

    // Lleva el formulario de codificar al valor actual (si el código es conocido).
    function sincronizarForm() {
      var d = decodificar(word, formatos);
      if (!d.ok) return;
      if (d.F !== fmtSel) { fmtSel = d.F; pintarOperandos(); }
      $('.di16-sel-op').value = String(fmtSel.op);
      d.campos.forEach(function (c) {
        if (!c.token) return;
        valores[c.token] = c.v;
        var ctl = el.querySelector('.di16-operandos [data-tok="' + c.token + '"]');
        if (!ctl) return;
        if (c.tipo === 'mem') { ctl.value = hx(c.v, Math.ceil(c.n / 4)); ctl.removeAttribute('aria-invalid'); }
        else ctl.value = String(c.v);
      });
      $('.di16-err-cod').textContent = '';
    }

    function pintar(origen) {
      var d = decodificar(word, formatos);
      var mb = el.querySelectorAll('[data-modo]');
      for (var i = 0; i < mb.length; i++) mb[i].setAttribute('aria-pressed', mb[i].getAttribute('data-modo') === modo ? 'true' : 'false');
      $('.di16-p-dec').hidden = modo !== 'decodificar';
      $('.di16-p-cod').hidden = modo !== 'codificar';

      if (origen !== 'hex') { inHex.value = hx(word, 4); inHex.removeAttribute('aria-invalid'); $('#' + id + '-err').textContent = ''; }
      if (origen !== 'form') sincronizarForm();

      // Bits (15 → 0) coloreados por campo.
      var campoDe = [];
      d.campos.forEach(function (c) { for (var b = c.lo; b <= c.hi; b++) campoDe[b] = c; });
      var hb = '';
      for (var b = 15; b >= 0; b--) {
        var v = (word >> b) & 1, c = campoDe[b];
        hb += '<button type="button" class="di16-bit ' + claseCampo(c) + (v ? ' di16-uno' : '') + (b % 4 === 0 && b ? ' di16-nib' : '') +
          '" data-b="' + b + '" aria-pressed="' + (v ? 'true' : 'false') + '" aria-label="Bit ' + b + ' (' + esc(etiquetaCampo(c)) + ')">' +
          '<span class="di16-bn" aria-hidden="true">' + b + '</span><span class="di16-bv">' + v + '</span></button>';
      }
      $('.di16-bits').innerHTML = hb;
      $('.di16-campos').innerHTML = d.campos.map(function (c) {
        return '<div class="di16-campo ' + claseCampo(c) + '" style="grid-column: span ' + c.n + '">' +
          '<span class="di16-cn">' + esc(etiquetaCampo(c)) + '</span><span class="di16-cv">' + esc(textoValor(c, c.v)) + '</span></div>';
      }).join('');

      // Resultado.
      var hexCol = hx(word, 4).slice(2).split('').map(function (n, k) {
        return '<span class="' + (k === 0 ? 'di16-f-op' : '') + '">' + n + '</span>';
      }).join('');
      if (d.ok) {
        $('.di16-res').innerHTML =
          '<div class="di16-asm"><code>' + d.asmHtml + '</code></div>' +
          (d.sem ? '<div class="di16-sem">' + esc(d.sem) + '</div>' : '') +
          '<div class="di16-hb"><code>0x' + hexCol + '</code> = <code>' + binAgrupado(word) + '</code> · código ' + d.op + ' = <code>' + esc(d.F.asm) + '</code></div>' +
          (d.nuNoCero ? '<div class="di16-aviso">Los bits «sin uso» no valen 0: el micro los ignora, pero el ensamblador siempre los pone a 0.</div>' : '');
      } else {
        $('.di16-res').innerHTML =
          '<div class="di16-asm di16-desc"><code>¿?</code> Código de operación desconocido</div>' +
          '<div class="di16-hb"><code>0x' + hexCol + '</code> = <code>' + binAgrupado(word) + '</code></div>' +
          '<div class="di16-aviso">El código ' + d.op + ' (<code>' + bin(d.op, 4) + '</code>) no corresponde a ninguna instrucción de este micro: ' +
            'solo existen ' + formatos.map(function (f) { return f.op + ' = <code>' + esc(f.asm) + '</code>'; }).join(', ') +
            '. La CPU no sabría qué hacer con estos 12 bits.</div>';
      }

      // Tabla de campos.
      $('.di16-tabla tbody').innerHTML = d.campos.map(function (c) {
        var nom = c.tipo === 'op' ? 'Código de instrucción' : c.tipo === 'nu' ? (d.ok ? 'No se usan' : 'Operandos (formato desconocido)') :
          c.tipo === 'mem' ? 'Dirección de memoria (mem)' : 'Registro ' + (c.rol || '') + ' (' + c.token + ')';
        var val = c.tipo === 'op' ? c.v + (d.ok ? ' → ' + esc(d.F.mnem) : ' → desconocido') : esc(textoValor(c, c.v));
        return '<tr><td class="di16-tb">' + c.hi + (c.n > 1 ? '-' + c.lo : '') + '</td><td><span class="di16-chip ' + claseCampo(c) + '"></span>' + nom +
          '</td><td class="di16-tbin">' + bin(c.v, c.n).replace(/(\d{4})(?=\d)/g, '$1 ') + '</td><td class="di16-tval">' + val + '</td></tr>';
      }).join('');
    }

    el.addEventListener('click', function (e) {
      var t = e.target.closest('button');
      if (!t || !el.contains(t)) return;
      if (t.hasAttribute('data-modo')) { modo = t.getAttribute('data-modo'); pintar(); return; }
      if (t.hasAttribute('data-b')) {
        var b = +t.getAttribute('data-b');
        word = (word ^ (1 << b)) & 0xFFFF;
        pintar();
        var nb = el.querySelector('.di16-bit[data-b="' + b + '"]');
        if (nb) nb.focus();
        return;
      }
      if (t.hasAttribute('data-ej')) { word = +t.getAttribute('data-ej'); pintar(); }
    });

    inHex.addEventListener('input', function () {
      var v = parseHex(inHex.value, 0xFFFF);
      var err = $('#' + id + '-err');
      if (v == null) {
        inHex.setAttribute('aria-invalid', 'true');
        err.textContent = inHex.value.trim() === '' ? '' : 'Escribe un valor hexadecimal de 16 bits (0x0000…0xFFFF).';
        return;
      }
      inHex.removeAttribute('aria-invalid');
      err.textContent = '';
      word = v;
      pintar('hex');
    });
    inHex.addEventListener('change', function () {
      if (parseHex(inHex.value, 0xFFFF) != null) inHex.value = hx(word, 4);
    });

    $('.di16-sel-op').addEventListener('change', function () {
      var op = +this.value;
      fmtSel = formatos.filter(function (f) { return f.op === op; })[0] || formatos[0];
      pintarOperandos();
      fmtSel.campos.forEach(function (c) {
        if (!c.token) return;
        var ctl = el.querySelector('.di16-operandos [data-tok="' + c.token + '"]');
        var v = Math.min(valores[c.token] || 0, (1 << c.n) - 1);
        valores[c.token] = v;
        if (ctl) ctl.value = c.tipo === 'mem' ? hx(v, Math.ceil(c.n / 4)) : String(v);
      });
      word = codificar(fmtSel, valores);
      pintar('form');
    });
    function operandoCambiado(e) {
      var ctl = e.target;
      var tok = ctl.getAttribute && ctl.getAttribute('data-tok');
      if (!tok) return;
      var c = fmtSel.campos.filter(function (x) { return x.token === tok; })[0];
      if (!c) return;
      var err = $('.di16-err-cod');
      if (c.tipo === 'mem') {
        var v = parseHex(ctl.value, (1 << c.n) - 1);
        if (v == null) {
          ctl.setAttribute('aria-invalid', 'true');
          err.textContent = ctl.value.trim() === '' ? '' : 'La dirección debe caber en ' + c.n + ' bits: ' + hx(0, Math.ceil(c.n / 4)) + '…' + hx((1 << c.n) - 1, Math.ceil(c.n / 4)) + '.';
          return;
        }
        ctl.removeAttribute('aria-invalid');
        valores[tok] = v;
      } else {
        valores[tok] = +ctl.value;
      }
      err.textContent = '';
      word = codificar(fmtSel, valores);
      pintar('form');
    }
    $('.di16-operandos').addEventListener('input', operandoCambiado);
    $('.di16-operandos').addEventListener('change', function (e) {
      operandoCambiado(e);
      var ctl = e.target;
      if (ctl.classList && ctl.classList.contains('di16-mem') && !ctl.hasAttribute('aria-invalid')) {
        var c = fmtSel.campos.filter(function (x) { return x.tipo === 'mem'; })[0];
        ctl.value = hx(valores.mem || 0, Math.ceil(c.n / 4));
      }
    });

    pintarOperandos();
    pintar();
  };

  // Expuesto para pruebas.
  MPI.componentes['decod-instruccion-16']._decodificar = function (word, formatos) { return decodificar(word, prepararFormatos(formatos)); };
  MPI.componentes['decod-instruccion-16']._codificar = function (op, valores, formatos) {
    var F = prepararFormatos(formatos).filter(function (f) { return f.op === op; })[0];
    return F ? codificar(F, valores) : null;
  };
})();
