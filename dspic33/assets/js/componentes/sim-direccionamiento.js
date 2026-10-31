/*
 * Componente "sim-direccionamiento": banco de pruebas de los modos de direccionamiento
 * del dsPIC con MOV (libro 7.3.2; datasheet 4.5). Muestra W0, W1 y la memoria byte a
 * byte (little endian: byte bajo en la dirección par) antes y después de cada instrucción,
 * la dirección efectiva (EA) y cómo se mueve el puntero (±2 en word, ±1 en .B).
 *
 * Uso en el contenido:
 *   <div class="mpi-mount" data-componente="sim-direccionamiento"
 *        data-config='{"w0":"0x0800","w1":"0x1234","mem":{"0x07FE":"0x0000","0x0800":"0xA557","0x0802":"0x0000"}}'></div>
 *
 * Claves de data-config (todas opcionales):
 *   w0, w1   valores iniciales (hex). Por defecto 0x0800 y 0x1234.
 *   mem      {dirección par: word} contenido inicial de memoria (el resto vale 0x00).
 *            Por defecto {"0x07FE":"0x0000","0x0800":"0xA557","0x0802":"0x0000"}.
 *   desde    primera dirección mostrada (par). Por defecto W0 − 4 (0x07FC); se muestran 12 bytes.
 *
 * Las instrucciones se acumulan (el estado se conserva entre pulsaciones) hasta «Reiniciar estado».
 */
window.MPI = window.MPI || {};
MPI.componentes = MPI.componentes || {};

(function () {
  var uid = 0;
  var NBYTES = 12;

  function hx(v, d) {
    var s = (v >>> 0).toString(16).toUpperCase();
    while (s.length < (d || 4)) s = '0' + s;
    return '0x' + s;
  }
  function leerHex(t, def) {
    if (typeof t === 'number' && isFinite(t)) return t & 0xFFFF;
    t = String(t == null ? '' : t).trim().replace(/^0x/i, '');
    if (!/^[0-9a-f]{1,4}$/i.test(t)) return def;
    return parseInt(t, 16);
  }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  // Casos del libro. 'b' = .B; fijoB = el libro solo lo da en .B.
  var CASOS = [
    { k: 'reg', modo: 'Directo a registro', asm: function (b) { return b ? 'MOV.B W1, W0' : 'MOV W1, W0'; } },
    { k: 'inm', modo: 'Inmediato', asm: function (b) { return b ? 'MOV.B #5, W0' : 'MOV #5, W0'; } },
    { k: 'sin', modo: 'Sin # (¡directo a memoria!)', asm: function (b) { return b ? 'MOV.B 5, WREG' : 'MOV 5, W0'; } },
    { k: 'inm0', modo: 'Inmediato al byte bajo', fijoB: true, asm: function () { return 'MOV.B #0, W0'; } },
    { k: 'dir', modo: 'Directo desde memoria', asm: function (b) { return b ? 'MOV.B 0x800, WREG' : 'MOV 0x800, W1'; } },
    { k: 'ind', modo: 'Indirecto', asm: function (b) { return b ? 'MOV.B [W0], W1' : 'MOV [W0], W1'; } },
    { k: 'predec', modo: 'Indirecto con pre-decremento', asm: function (b) { return b ? 'MOV.B W1, [--W0]' : 'MOV W1, [--W0]'; } },
    { k: 'postinc', modo: 'Indirecto con post-incremento', asm: function (b) { return b ? 'MOV.B W1, [W0++]' : 'MOV W1, [W0++]'; } },
    { k: 'postdec', modo: 'Indirecto con post-decremento', asm: function (b) { return b ? 'MOV.B W1, [W0--]' : 'MOV W1, [W0--]'; } },
    { k: 'preinc', modo: 'Indirecto con pre-incremento', asm: function (b) { return b ? 'MOV.B W1, [++W0]' : 'MOV W1, [++W0]'; } }
  ];

  // Ejecuta un caso sobre el estado s = {w0, w1, mem}. Devuelve la explicación.
  function ejecutar(s, k, byte) {
    var tam = byte ? 1 : 2, pasos = [], ea = null, trap = false, noEjec = false;
    var w0a = s.w0;
    function rd(a) { return s.mem[a] || 0; }
    function leer(a) { return byte ? rd(a) : rd(a) | (rd(a + 1) << 8); }
    function escribir(a, v) {
      s.mem[a] = v & 0xFF;
      if (!byte) s.mem[a + 1] = (v >> 8) & 0xFF;
    }
    function bajoEn(reg, v) { return (reg & 0xFF00) | (v & 0xFF); }
    function txtBytes(a, v) {
      return byte
        ? 'byte ' + hx(a) + ' = ' + hx(v & 0xFF, 2)
        : 'byte ' + hx(a) + ' = ' + hx(v & 0xFF, 2) + ' (bajo) y byte ' + hx(a + 1) + ' = ' + hx((v >> 8) & 0xFF, 2) + ' (alto): little endian';
    }
    function alinear(a) {
      if (!byte && (a & 1)) {
        trap = true;
        pasos.push('<span class="sd-mal">⚠ EA = ' + hx(a) + ' es impar y el acceso es a word: no está permitido (datasheet 4.2, los words van en dirección par) y salta la trampa de error de dirección. El simulador no hace la transferencia.</span>');
        return false;
      }
      return true;
    }
    function escribirInd(a) {
      ea = a;
      pasos.push('Dirección efectiva EA = W0 = <strong>' + hx(a) + '</strong>.');
      if (alinear(a)) {
        var v = byte ? s.w1 & 0xFF : s.w1;
        escribir(a, v);
        pasos.push('Escritura: (' + hx(a) + ') ← ' + (byte ? 'byte bajo de W1 = ' + hx(v, 2) : 'W1 = ' + hx(v)) + ' → ' + txtBytes(a, v) + '.');
      }
    }
    var paso = byte ? '1' : '2';
    switch (k) {
      case 'reg':
        if (byte) { s.w0 = bajoEn(s.w0, s.w1); pasos.push('W0 ← byte bajo de W1 (' + hx(s.w1 & 0xFF, 2) + '). El byte alto de W0 no cambia: W0 = <strong>' + hx(s.w0) + '</strong>.'); }
        else { s.w0 = s.w1; pasos.push('Directo a registro en los dos operandos: W0 ← W1 = <strong>' + hx(s.w0) + '</strong> (16 bits). No se toca la memoria.'); }
        break;
      case 'inm':
        if (byte) { s.w0 = bajoEn(s.w0, 5); pasos.push('Inmediato (#): el número 5 va al byte bajo de W0; el alto se conserva: W0 = <strong>' + hx(s.w0) + '</strong>.'); }
        else { s.w0 = 5; pasos.push('Inmediato (#): W0 ← el número 5 → W0 = <strong>0x0005</strong>. No se lee memoria.'); }
        break;
      case 'sin':
        noEjec = true;
        pasos.push('Sin <code>#</code>, el 5 no es un número sino una <strong>dirección</strong>: direccionamiento directo a memoria, ' + (byte ? 'WREG (W0) ← byte de la posición 5' : 'W0 ← contenido de la posición 5') + ', no el número 5.');
        pasos.push('La zona 0x0000–0x07FF es de registros especiales (SFR): ahí están mapeados los propios W (W0 en 0x0000, W1 en 0x0002, W2 en 0x0004…), así que la posición 5 es el byte alto de W2.');
        if (!byte) pasos.push('Además 5 es impar y un acceso a word tiene que ir a una dirección par (datasheet 4.2): no es un acceso válido.');
        pasos.push('El simulador no la ejecuta (W2 no aparece aquí). Para cargar el número 5: <code>MOV #5, W0</code>.');
        break;
      case 'inm0':
        s.w0 = bajoEn(s.w0, 0);
        pasos.push('.B con inmediato: el byte bajo de W0 pasa a 0x00 y el byte alto se conserva: W0 = ' + hx(w0a) + ' → <strong>' + hx(s.w0) + '</strong>.');
        break;
      case 'dir':
        ea = 0x0800;
        if (byte) {
          s.w0 = bajoEn(s.w0, rd(0x0800));
          pasos.push('Directo a memoria (dirección de 16 bits, sin #). En .B el destino solo puede ser WREG (W0).');
          pasos.push('Lectura: byte (' + hx(0x0800) + ') = ' + hx(rd(0x0800), 2) + ' → byte bajo de W0; el alto se conserva: W0 = <strong>' + hx(s.w0) + '</strong>.');
        } else {
          s.w1 = leer(0x0800);
          pasos.push('Directo a memoria (dirección de 16 bits, sin #): EA = 0x0800.');
          pasos.push('Lectura de un word: byte 0x0800 = ' + hx(rd(0x0800), 2) + ' (bajo), byte 0x0801 = ' + hx(rd(0x0801), 2) + ' (alto) → W1 = <strong>' + hx(s.w1) + '</strong>.');
        }
        break;
      case 'ind':
        ea = s.w0;
        pasos.push('Indirecto: los corchetes indican «contenido de la dirección que hay en W0». EA = W0 = <strong>' + hx(ea) + '</strong>. W0 no cambia.');
        if (alinear(ea)) {
          var v = leer(ea);
          if (byte) { s.w1 = bajoEn(s.w1, v); pasos.push('Lectura: byte (' + hx(ea) + ') = ' + hx(v, 2) + ' → byte bajo de W1; el alto se conserva: W1 = <strong>' + hx(s.w1) + '</strong>.'); }
          else { s.w1 = v; pasos.push('Lectura de un word: bytes ' + hx(ea) + ' (bajo) y ' + hx(ea + 1) + ' (alto) → W1 = <strong>' + hx(s.w1) + '</strong>.'); }
        }
        break;
      case 'predec':
        s.w0 = (s.w0 - tam) & 0xFFFF;
        pasos.push('<strong>Primero</strong> el pre-decremento: W0 ← W0 − ' + paso + ' = ' + hx(w0a) + ' − ' + paso + ' = <strong>' + hx(s.w0) + '</strong> (' + (byte ? '.B: de 1 en 1' : 'word: de 2 en 2') + ').');
        escribirInd(s.w0);
        break;
      case 'preinc':
        s.w0 = (s.w0 + tam) & 0xFFFF;
        pasos.push('<strong>Primero</strong> el pre-incremento: W0 ← W0 + ' + paso + ' = ' + hx(w0a) + ' + ' + paso + ' = <strong>' + hx(s.w0) + '</strong> (' + (byte ? '.B: de 1 en 1' : 'word: de 2 en 2') + ').');
        escribirInd(s.w0);
        break;
      case 'postinc':
        escribirInd(s.w0);
        s.w0 = (s.w0 + tam) & 0xFFFF;
        pasos.push('<strong>Después</strong> el post-incremento: W0 ← W0 + ' + paso + ' = ' + hx(w0a) + ' + ' + paso + ' = <strong>' + hx(s.w0) + '</strong> (' + (byte ? '.B: de 1 en 1' : 'word: de 2 en 2') + '). Queda apuntando al ' + (byte ? 'byte' : 'word') + ' siguiente.');
        break;
      case 'postdec':
        escribirInd(s.w0);
        s.w0 = (s.w0 - tam) & 0xFFFF;
        pasos.push('<strong>Después</strong> el post-decremento: W0 ← W0 − ' + paso + ' = ' + hx(w0a) + ' − ' + paso + ' = <strong>' + hx(s.w0) + '</strong> (' + (byte ? '.B: de 1 en 1' : 'word: de 2 en 2') + '). Queda apuntando al ' + (byte ? 'byte' : 'word') + ' anterior.');
        break;
    }
    return { pasos: pasos, ea: ea, tam: tam, trap: trap, noEjec: noEjec };
  }

  MPI.componentes['sim-direccionamiento'] = function (el, cfg) {
    cfg = cfg || {};
    var id = 'sd' + (++uid);
    var memCfg = cfg.mem && typeof cfg.mem === 'object' ? cfg.mem : { '0x07FE': '0x0000', '0x0800': '0xA557', '0x0802': '0x0000' };
    var ini = { w0: leerHex(cfg.w0, 0x0800), w1: leerHex(cfg.w1, 0x1234), mem: {} };
    Object.keys(memCfg).forEach(function (k) {
      var a = leerHex(k, null), v = leerHex(memCfg[k], 0);
      if (a === null) return;
      ini.mem[a] = v & 0xFF; ini.mem[a + 1] = (v >> 8) & 0xFF;
    });
    var desde = leerHex(cfg.desde, null);
    if (desde === null) desde = ((ini.w0 & 0xFFFE) - 4) & 0xFFFF;
    desde &= 0xFFFE;

    function copia(s) { var m = {}; for (var k in s.mem) m[k] = s.mem[k]; return { w0: s.w0, w1: s.w1, mem: m }; }
    var st = copia(ini), antes = null, ult = null, byteMode = false, historial = [];

    el.classList.add('mpi-sim-direccionamiento');
    el.innerHTML =
      '<div class="mpi-sim-cab">Modos de direccionamiento con MOV <span class="sd-sub">memoria byte a byte, little endian</span></div>' +
      '<div class="sd-barra">' +
        '<span class="sd-lbl" id="' + id + '-tl">Tamaño del operando</span>' +
        '<span class="sd-seg" role="group" aria-labelledby="' + id + '-tl">' +
          '<button type="button" class="sd-tam" data-b="0" aria-pressed="true">Word (16 bits)</button>' +
          '<button type="button" class="sd-tam" data-b="1" aria-pressed="false">Byte (.B)</button>' +
        '</span>' +
        '<button type="button" class="sd-reset">Reiniciar estado</button>' +
      '</div>' +
      '<div class="sd-casos" role="group" aria-label="Instrucciones a ejecutar"></div>' +
      '<div class="sd-cuerpo">' +
        '<div class="sd-izq">' +
          '<div class="sd-expl" aria-live="polite"></div>' +
          '<table class="sd-regs"><caption>Registros</caption><thead><tr><th scope="col"></th><th scope="col">Antes</th><th scope="col">Después</th></tr></thead><tbody></tbody></table>' +
          '<div class="sd-hist"></div>' +
        '</div>' +
        '<div class="sd-der">' +
          '<div class="sd-mem-wrap" tabindex="0" role="region" aria-label="Memoria de datos byte a byte"><table class="sd-mem"></table></div>' +
          '<p class="sd-nota">Cada fila es un byte. Un word ocupa dos bytes: el <strong>bajo</strong> en la dirección par y el <strong>alto</strong> en la siguiente (little endian); la columna Word los junta (alto:bajo).</p>' +
        '</div>' +
      '</div>';

    function $(s) { return el.querySelector(s); }

    function pintarCasos() {
      $('.sd-casos').innerHTML = CASOS.map(function (c, i) {
        var b = c.fijoB || byteMode;
        return '<button type="button" class="sd-caso' + (ult && ult.i === i ? ' sd-caso-act' : '') + '" data-i="' + i + '">' +
          '<code>' + esc(c.asm(b)) + '</code><span>' + c.modo + '</span></button>';
      }).join('');
      var ts = el.querySelectorAll('.sd-tam');
      for (var k = 0; k < ts.length; k++) ts[k].setAttribute('aria-pressed', (ts[k].getAttribute('data-b') === '1') === byteMode ? 'true' : 'false');
    }

    function pintar() {
      pintarCasos();
      var A = antes || st;
      // Explicación
      var ex = $('.sd-expl');
      if (!ult) {
        ex.innerHTML = '<p class="sd-tenue">Pulsa una instrucción. Las instrucciones se encadenan sobre el estado actual; «Reiniciar estado» vuelve a W0 = ' + hx(ini.w0) + ', W1 = ' + hx(ini.w1) + '.</p>';
      } else {
        ex.innerHTML = '<div class="sd-expl-cab"><code>' + esc(ult.asm) + '</code><span>' + ult.modo + '</span></div>' +
          '<ol class="sd-pasos">' + ult.r.pasos.map(function (p) { return '<li>' + p + '</li>'; }).join('') + '</ol>';
      }
      // Registros
      $('.sd-regs tbody').innerHTML = ['w0', 'w1'].map(function (r) {
        var cambia = A[r] !== st[r];
        return '<tr' + (cambia ? ' class="sd-cambia"' : '') + '><th scope="row">' + r.toUpperCase() + '</th><td>' + hx(A[r]) + '</td><td>' + hx(st[r]) + (cambia ? ' <span class="sd-flecha" aria-label="cambia">◀</span>' : '') + '</td></tr>';
      }).join('');
      // Memoria
      var eaIni = ult && ult.r.ea !== null && !ult.r.trap ? ult.r.ea : null;
      var eaFin = eaIni !== null ? eaIni + ult.r.tam - 1 : null;
      var h = '<caption class="sd-oculto">Memoria de ' + hx(desde) + ' a ' + hx(desde + NBYTES - 1) + '</caption>' +
        '<thead><tr><th scope="col">Dirección <span>y punteros</span></th><th scope="col">Antes</th><th scope="col">Después</th><th scope="col">Word</th></tr></thead><tbody>';
      for (var a = desde; a < desde + NBYTES; a++) {
        var va = A.mem[a] || 0, vd = st.mem[a] || 0;
        var esEA = eaIni !== null && a >= eaIni && a <= eaFin;
        var marcas = [];
        if (ult && A.w0 === a && A.w0 !== st.w0) marcas.push('<span class="sd-m sd-m-antes">W0 antes</span>');
        if (st.w0 === a) marcas.push('<span class="sd-m sd-m-w0">◀ W0' + (ult && A.w0 !== st.w0 ? ' después' : '') + '</span>');
        if (esEA && a === eaIni) marcas.push('<span class="sd-m sd-m-ea">EA</span>');
        var cls = (a % 2 === 0 ? 'sd-par' : 'sd-impar') + (esEA ? ' sd-ea' : '');
        h += '<tr class="' + cls + '"><th scope="row">' + hx(a) + (marcas.length ? '<span class="sd-marcas">' + marcas.join('') + '</span>' : '') + '</th>' +
          '<td class="sd-b">' + hx(va, 2) + '</td>' +
          '<td class="sd-b' + (va !== vd ? ' sd-cambio' : '') + '">' + hx(vd, 2) + '</td>';
        if (a % 2 === 0) {
          var w = vd | ((st.mem[a + 1] || 0) << 8);
          h += '<td class="sd-w" rowspan="2">' + hx(w) + '</td>';
        }
        h += '</tr>';
      }
      h += '</tbody>';
      $('.sd-mem').innerHTML = h;
      var fuera = [];
      if (st.w0 < desde || st.w0 >= desde + NBYTES) fuera.push('W0 = ' + hx(st.w0) + ' apunta fuera de la ventana mostrada.');
      if (eaIni !== null && (eaIni < desde || eaIni >= desde + NBYTES)) fuera.push('La EA ' + hx(eaIni) + ' queda fuera de la ventana mostrada.');
      var nota = $('.sd-fuera');
      if (!nota) { $('.sd-mem-wrap').insertAdjacentHTML('afterend', '<p class="sd-fuera" hidden></p>'); nota = $('.sd-fuera'); }
      nota.hidden = !fuera.length;
      nota.textContent = fuera.join(' ');
      // Historial
      $('.sd-hist').innerHTML = historial.length
        ? '<div class="sd-hist-tit">Ejecutado desde el último reinicio</div><pre><code class="lang-asm">' + esc(historial.join('\n')) + '</code></pre>'
        : '';
    }

    el.addEventListener('click', function (e) {
      var t = e.target.closest('button');
      if (!t || !el.contains(t)) return;
      if (t.classList.contains('sd-tam')) { byteMode = t.getAttribute('data-b') === '1'; pintar(); return; }
      if (t.classList.contains('sd-reset')) { st = copia(ini); antes = null; ult = null; historial = []; pintar(); return; }
      if (t.classList.contains('sd-caso')) {
        var i = +t.getAttribute('data-i'), c = CASOS[i], b = !!(c.fijoB || byteMode);
        antes = copia(st);
        var r = ejecutar(st, c.k, b);
        var asm = c.asm(b);
        ult = { i: i, asm: asm, modo: c.modo, r: r };
        var com = r.noEjec ? '   ; (no ejecutada: sin # es una dirección)' : r.trap ? '   ; ⚠ trap: word en dirección impar' : '';
        historial.push(asm + com);
        if (historial.length > 12) historial.shift();
        pintar();
        var nb = el.querySelector('.sd-caso[data-i="' + i + '"]');
        if (nb) nb.focus();
      }
    });

    pintar();
  };

  MPI.componentes['sim-direccionamiento']._ejecutar = ejecutar;
})();
