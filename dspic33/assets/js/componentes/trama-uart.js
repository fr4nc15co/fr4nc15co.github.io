/*
 * Componente "trama-uart": cronograma de la línea U1TX para un dato
 * (tema UART, cap. 14 del libro; datasheet 19.0, U1MODE: PDSEL y STSEL).
 *
 * Uso:
 *   <div class="mpi-mount" data-componente="trama-uart"
 *        data-config='{"dato":"0x2A","baudios":38400,"pdsel":0,"stsel":0}'></div>
 *
 * Claves de data-config (todas opcionales):
 *   dato     "0x2A" (hex), 42 / "42" (decimal) o "*" / "'*'" (carácter ASCII). Defecto 0x2A.
 *   baudios  defecto 38400 (la del libro).
 *   pdsel    0 = 8N (libro), 1 = 8 bits paridad par, 2 = 8 bits paridad impar, 3 = 9 bits sin paridad.
 *   stsel    0 = 1 bit de stop (libro), 1 = 2 bits de stop.
 *
 * Trama: reposo a 1, start a 0, datos LSB primero (b0 … b7, o b8 en 9 bits),
 * paridad (si la hay), stop(s) a 1. Cada bit dura 1/baudios.
 * Ejemplo: '*' = 0x2A = 0010 1010 → b0..b7 = 0,1,0,1,0,1,0,0; 8N1 = 10 bits →
 * 10 / 38 400 = 260,4 µs.
 */
window.MPI = window.MPI || {};
MPI.componentes = MPI.componentes || {};

(function () {
  var NBSP = ' ';
  var LISTA = [2400, 4800, 9600, 19200, 38400, 57600, 115200];
  var PDSEL_TXT = ['00 — 8 bits, sin paridad (8N)', '01 — 8 bits, paridad par (8E)', '10 — 8 bits, paridad impar (8O)', '11 — 9 bits, sin paridad (9N)'];
  var PDSEL_COM = ['8 bits de datos, sin paridad', '8 bits de datos, paridad par', '8 bits de datos, paridad impar', '9 bits de datos, sin paridad'];
  var MS_POR_BIT = 420;   // duración en pantalla de cada bit en la animación
  var IZQ = 46, WB = 54, WIDLE = 40, X0 = IZQ + WIDLE;   // geometría del SVG

  function agrupar(entero) {
    var s = String(entero);
    if (s.length >= 5) s = s.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
    return s;
  }
  function fijo(x, nd) {
    var p = Math.abs(x).toFixed(nd).split('.');
    return agrupar(p[0]) + (p[1] ? ',' + p[1] : '');
  }
  function fmtUs(us) {
    if (us >= 1000) return fijo(us / 1000, 2) + NBSP + 'ms';
    return fijo(us, us < 100 ? 2 : 1) + NBSP + 'µs';
  }
  function hex(v, n) {
    var s = (v >>> 0).toString(16).toUpperCase();
    while (s.length < n) s = '0' + s;
    return '0x' + s;
  }
  function bin(v, n) {
    var s = (v >>> 0).toString(2);
    while (s.length < n) s = '0' + s;
    var out = '';
    for (var i = 0; i < s.length; i++) {
      if (i && (s.length - i) % 4 === 0) out += ' ';
      out += s.charAt(i);
    }
    return out;
  }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function asciiTxt(v) {
    if (v >= 32 && v < 127) return "'" + String.fromCharCode(v) + "'";
    var nombres = { 0: 'NUL', 7: 'BEL', 8: 'BS', 9: 'TAB', 10: 'LF', 13: 'CR', 27: 'ESC', 127: 'DEL' };
    if (nombres[v]) return nombres[v];
    return v < 32 ? 'control' : '—';
  }

  // Interpreta el dato: hex (0x2A, 2Ah), decimal (42), carácter (* o '*').
  function leerDato(txt, max) {
    if (typeof txt === 'number') return (txt >= 0 && txt <= max && txt % 1 === 0) ? txt : null;
    var s = String(txt == null ? '' : txt);
    var m = s.match(/^\s*'(.)'\s*$/) || s.match(/^\s*"(.)"\s*$/);
    if (m) { var c = m[1].charCodeAt(0); return c <= 255 && c <= max ? c : null; }
    var t = s.trim();
    var v = null;
    if (/^0x[0-9a-f]{1,3}$/i.test(t)) v = parseInt(t.slice(2), 16);
    else if (/^[0-9a-f]{1,3}h$/i.test(t)) v = parseInt(t.slice(0, -1), 16);
    else if (/^\d{1,3}$/.test(t)) v = parseInt(t, 10);     // decimal (un dígito suelto también: '5' entre comillas es el carácter)
    else if (s.length === 1) v = s.charCodeAt(0);          // un solo carácter (incluido el espacio)
    if (v == null || isNaN(v) || v < 0 || v > max) return null;
    return v;
  }

  var ID = 0;

  MPI.componentes['trama-uart'] = function (el, cfg) {
    cfg = cfg || {};
    var uid = 'tu' + (++ID);
    var pdsel = (cfg.pdsel >= 0 && cfg.pdsel <= 3) ? (cfg.pdsel | 0) : 0;
    var stsel = Number(cfg.stsel) === 1 ? 1 : 0;
    var baud = Number(cfg.baudios) > 0 ? Math.round(Number(cfg.baudios)) : 38400;
    var dato = leerDato(cfg.dato != null ? cfg.dato : '0x2A', pdsel === 3 ? 511 : 255);
    if (dato == null) dato = 0x2A;
    var datoTxt = typeof cfg.dato === 'string' && cfg.dato ? cfg.dato : hex(dato, 2);
    var reducido = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    var lista = LISTA.slice();
    if (lista.indexOf(baud) < 0) { lista.push(baud); lista.sort(function (a, b) { return a - b; }); }
    var opcB = lista.map(function (b) { return '<option value="' + b + '"' + (b === baud ? ' selected' : '') + '>' + agrupar(b) + '</option>'; }).join('');
    var opcP = PDSEL_TXT.map(function (t, i) { return '<option value="' + i + '"' + (i === pdsel ? ' selected' : '') + '>' + t + '</option>'; }).join('');

    el.classList.add('mpi-trama-uart');
    el.innerHTML =
      '<div class="mpi-sim-cab">Trama de la UART en la línea U1TX <span class="tu-cab-sub">cronograma</span></div>' +
      '<div class="tu-form">' +
        '<label for="' + uid + '-d">Dato <input id="' + uid + '-d" class="tu-dato" type="text" spellcheck="false" autocomplete="off" ' +
          'aria-describedby="' + uid + '-ay ' + uid + '-err" value="' + esc(datoTxt) + '"></label>' +
        '<label>Baudios <select class="tu-baud" aria-label="Velocidad en baudios">' + opcB + '</select></label>' +
        '<label>PDSEL <select class="tu-pdsel" aria-label="PDSEL: bits de datos y paridad">' + opcP + '</select></label>' +
        '<label>STSEL <select class="tu-stsel" aria-label="STSEL: bits de stop">' +
          '<option value="0"' + (stsel === 0 ? ' selected' : '') + '>0 — 1 stop</option>' +
          '<option value="1"' + (stsel === 1 ? ' selected' : '') + '>1 — 2 stop</option></select></label>' +
      '</div>' +
      '<p class="tu-ayuda" id="' + uid + '-ay">Hex (0x2A), decimal (42) o un carácter (* o \'5\').</p>' +
      '<p class="tu-err" id="' + uid + '-err" role="alert"></p>' +
      '<div class="tu-dato-info"></div>' +
      '<div class="tu-ctl">' +
        '<button type="button" class="tu-enviar">▶ Enviar trama</button>' +
        '<button type="button" class="tu-paso">Bit a bit ⏭</button>' +
        '<button type="button" class="tu-reini">Reiniciar</button>' +
        '<span class="tu-linea" aria-hidden="true">U1TX = <b>1</b></span>' +
      '</div>' +
      '<div class="tu-svg-wrap" tabindex="0" role="region" aria-label="Cronograma de la trama"><svg class="tu-svg" xmlns="http://www.w3.org/2000/svg" role="img"></svg></div>' +
      '<p class="tu-estado" aria-live="polite"></p>' +
      '<div class="tu-orden" aria-label="Bits en el orden en que salen por la línea"></div>' +
      '<div class="tu-resumen"></div>' +
      '<pre class="tu-codigo"></pre>';

    var q = function (s) { return el.querySelector(s); };
    var inD = q('.tu-dato'), selB = q('.tu-baud'), selP = q('.tu-pdsel'), selS = q('.tu-stsel');
    var errP = q('.tu-err'), info = q('.tu-dato-info'), svg = q('.tu-svg'), estado = q('.tu-estado');
    var orden = q('.tu-orden'), resumen = q('.tu-resumen'), pre = q('.tu-codigo');
    var btnEnv = q('.tu-enviar'), btnPaso = q('.tu-paso'), btnReini = q('.tu-reini'), linea = q('.tu-linea b');

    var bits = [];      // [{tipo, etq, v}]
    var pos = -1;       // bit en la línea (-1 = reposo antes; bits.length = reposo después)
    var anim = null;    // {t0, raf/timeout}

    function construirTrama() {
      var nd = pdsel === 3 ? 9 : 8;
      bits = [{ tipo: 'start', etq: 'Start', v: 0 }];
      var unos = 0;
      for (var i = 0; i < nd; i++) {
        var b = (dato >> i) & 1;
        unos += b;
        bits.push({ tipo: 'dato', etq: 'b' + i, v: b });
      }
      if (pdsel === 1) bits.push({ tipo: 'par', etq: 'P', v: unos % 2, nota: 'par' });
      if (pdsel === 2) bits.push({ tipo: 'par', etq: 'P', v: 1 - (unos % 2), nota: 'impar' });
      bits.push({ tipo: 'stop', etq: stsel ? 'Stop1' : 'Stop', v: 1 });
      if (stsel) bits.push({ tipo: 'stop', etq: 'Stop2', v: 1 });
      return unos;
    }

    function tBit() { return 1e6 / baud; }   // µs

    function dibujarSVG() {
      var N = bits.length;
      var izq = IZQ, wb = WB, wIdle = WIDLE;
      var W = izq + wIdle + N * wb + wIdle + 10;
      var H = 176;
      var yAlto = 58, yBajo = 100, yEtq = 30, yVal = 122, yEje = 146;
      svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
      svg.style.minWidth = Math.round(W * 0.78) + 'px';
      var x0 = izq + wIdle;
      var h = '';
      // Fondos por campo
      for (var i = 0; i < N; i++) {
        var b = bits[i];
        var x = x0 + i * wb;
        h += '<rect class="tu-celda tu-c-' + b.tipo + (i === pos ? ' tu-actual' : '') + (i < pos ? ' tu-enviado' : '') +
          '" x="' + x + '" y="12" width="' + wb + '" height="' + (yVal + 8 - 12) + '" />';
        h += '<text class="tu-etq tu-t-' + b.tipo + '" x="' + (x + wb / 2) + '" y="' + yEtq + '">' + b.etq + '</text>';
        if (b.tipo === 'par') h += '<text class="tu-etq-sub" x="' + (x + wb / 2) + '" y="' + (yEtq + 12) + '">' + b.nota + '</text>';
        h += '<text class="tu-val" x="' + (x + wb / 2) + '" y="' + yVal + '">' + b.v + '</text>';
      }
      // Etiquetas de eje Y
      h += '<text class="tu-y" x="' + (izq - 6) + '" y="' + (yAlto + 4) + '">1</text>';
      h += '<text class="tu-y" x="' + (izq - 6) + '" y="' + (yBajo + 4) + '">0</text>';
      h += '<text class="tu-y tu-y-nom" x="4" y="' + ((yAlto + yBajo) / 2 + 4) + '">TX</text>';
      // Forma de onda
      var pts = [];
      var yPrev = yAlto;
      pts.push(izq + 4 + ',' + yAlto);
      for (i = 0; i < N; i++) {
        var y = bits[i].v ? yAlto : yBajo;
        var xi = x0 + i * wb;
        if (y !== yPrev) pts.push(xi + ',' + yPrev);
        pts.push(xi + ',' + y);
        yPrev = y;
      }
      var xFin = x0 + N * wb;
      if (yPrev !== yAlto) { pts.push(xFin + ',' + yPrev); pts.push(xFin + ',' + yAlto); }
      pts.push((xFin + wIdle) + ',' + yAlto);
      h += '<polyline class="tu-onda" points="' + pts.join(' ') + '" />';
      // Reposo
      h += '<text class="tu-reposo" x="' + (izq + wIdle / 2 + 2) + '" y="' + (yAlto - 8) + '">reposo</text>';
      h += '<text class="tu-reposo" x="' + (xFin + wIdle / 2) + '" y="' + (yAlto - 8) + '">reposo</text>';
      // Eje de tiempo
      h += '<line class="tu-eje" x1="' + x0 + '" y1="' + yEje + '" x2="' + xFin + '" y2="' + yEje + '" />';
      var tb = tBit();
      for (i = 0; i <= N; i++) {
        var xt = x0 + i * wb;
        h += '<line class="tu-eje" x1="' + xt + '" y1="' + (yEje - 4) + '" x2="' + xt + '" y2="' + (yEje + 4) + '" />';
        var us = i * tb;
        var etq = us >= 10000 ? fijo(us / 1000, 2) : fijo(us, 1);
        h += '<text class="tu-tick' + (i === N ? ' tu-tick-fin' : '') + '" x="' + xt + '" y="' + (yEje + 17) + '">' + etq + '</text>';
      }
      h += '<text class="tu-unidad" x="' + (izq - 4) + '" y="' + (yEje + 17) + '">' + (N * tb >= 10000 ? 'ms' : 'µs') + '</text>';
      // Cursor de la animación
      if (pos >= 0 && pos < N) {
        h += '<line class="tu-cursor" x1="' + (x0 + (pos + 1) * wb) + '" y1="10" x2="' + (x0 + (pos + 1) * wb) + '" y2="' + (yEje) + '" />';
      }
      svg.innerHTML = h;
      var desc = bits.map(function (b) { return b.etq + ' = ' + b.v; }).join(', ');
      svg.setAttribute('aria-label', 'Línea TX: reposo a 1, luego ' + desc + ', y vuelta al reposo. Cada bit dura ' + fmtUs(tb) + '.');
    }

    function pintarEstado() {
      var N = bits.length;
      var tb = tBit();
      var v = (pos >= 0 && pos < N) ? bits[pos].v : 1;
      linea.textContent = String(v);
      linea.parentNode.classList.toggle('tu-linea-0', v === 0);
      if (pos < 0) estado.textContent = 'Línea en reposo (1). Pulsa «Enviar trama» o «Bit a bit».';
      else if (pos >= N) estado.textContent = 'Trama completa: ' + N + ' bits en ' + fmtUs(N * tb) + '. La línea vuelve al reposo (1).';
      else {
        var b = bits[pos];
        var que = b.tipo === 'start' ? 'bit de start' : b.tipo === 'dato' ? 'dato ' + b.etq : b.tipo === 'par' ? 'bit de paridad (' + b.nota + ')' : 'bit de stop';
        estado.textContent = 'Bit ' + (pos + 1) + ' de ' + N + ': ' + que + ' = ' + b.v + ', de t = ' + fijo(pos * tb, 1) + ' a ' + fijo((pos + 1) * tb, 1) + ' µs.';
      }
      var chips = el.querySelectorAll('.tu-chip');
      for (var i = 0; i < chips.length; i++) {
        chips[i].classList.toggle('tu-chip-act', i === pos);
        chips[i].classList.toggle('tu-chip-env', i < pos);
      }
      btnPaso.disabled = pos >= N;
    }

    function pintar() {
      var unos = construirTrama();
      var nd = pdsel === 3 ? 9 : 8;
      var N = bits.length;
      var tb = tBit();
      info.innerHTML =
        '<span><b>' + hex(dato, nd === 9 ? 3 : 2) + '</b></span>' +
        '<span>= ' + dato + '</span>' +
        '<span>= <b class="tu-bin">' + bin(dato, nd) + '</b><sub>2</sub></span>' +
        (dato < 256 ? '<span>= ' + esc(asciiTxt(dato)) + ' (ASCII)</span>' : '<span class="tu-tenue">(9.º bit = 1)</span>') +
        '<span class="tu-tenue">· ' + unos + ' unos en los datos</span>';

      var h = '<span class="tu-orden-tit">Orden en la línea:</span>';
      bits.forEach(function (b) {
        h += '<span class="tu-chip tu-k-' + b.tipo + '" title="' + b.etq + '"><small>' + b.etq + '</small>' + b.v + '</span>';
      });
      orden.innerHTML = h;

      var formato = (pdsel === 3 ? '9' : '8') + (pdsel === 1 ? 'E' : pdsel === 2 ? 'O' : 'N') + (stsel ? '2' : '1');
      var parTxt = '';
      if (pdsel === 1) parTxt = '<li>Paridad par: P = ' + bits[nd + 1].v + ' para que el total de unos (datos + P) sea par (' + (unos + bits[nd + 1].v) + ').</li>';
      if (pdsel === 2) parTxt = '<li>Paridad impar: P = ' + bits[nd + 1].v + ' para que el total de unos (datos + P) sea impar (' + (unos + bits[nd + 1].v) + ').</li>';
      resumen.innerHTML =
        '<ul>' +
          '<li>Formato <b>' + formato + '</b>: 1 start + ' + nd + ' datos' + (pdsel === 1 || pdsel === 2 ? ' + 1 paridad' : '') + ' + ' + (stsel ? 2 : 1) + ' stop = <b>' + N + ' bits</b>.</li>' +
          '<li>Un bit dura 1 / ' + agrupar(baud) + ' = <b>' + fmtUs(tb) + '</b>; la trama, ' + N + ' / ' + agrupar(baud) + ' = <b>' + fmtUs(N * tb) + '</b>.</li>' +
          '<li>Como mucho ' + (baud % N ? fijo(baud / N, 1) : agrupar(baud / N)) + ' caracteres por segundo (' + Math.round(nd / N * 100) + ' % de bits útiles).</li>' +
          '<li>Los datos salen <b>LSB primero</b>: b0 es el primer bit tras el start.</li>' +
          parTxt +
        '</ul>';

      var cod = 'U1MODEbits.PDSEL = ' + pdsel + ';   // ' + PDSEL_COM[pdsel] + '\n' +
        'U1MODEbits.STSEL = ' + stsel + ';   // ' + (stsel ? '2 bits de stop' : '1 bit de stop') + '\n' +
        'U1TXREG = ' + hex(dato, nd === 9 ? 3 : 2) + ';' + (dato >= 32 && dato < 127 && dato !== 39 && dato !== 92 ? "      // '" + String.fromCharCode(dato) + "'" : '');
      pre.innerHTML = '<code class="lang-c"></code>';
      pre.firstChild.textContent = cod;
      if (MPI.resaltarTodo) MPI.resaltarTodo(pre);

      dibujarSVG();
      pintarEstado();
    }

    // ---------- Animación ----------
    function parar() {
      if (anim) {
        if (anim.raf) cancelAnimationFrame(anim.raf);
        if (anim.to) clearTimeout(anim.to);
      }
      anim = null;
      btnEnv.textContent = '▶ Enviar trama';
      btnEnv.setAttribute('aria-pressed', 'false');
    }
    function vivo() { return document.body.contains(el); }
    function irA(p) {
      pos = p;
      dibujarSVG(); pintarEstado();
      if (anim) anim.tBit = performance.now();
    }

    // Envío animado: un bit cada MS_POR_BIT ms. Con movimiento reducido solo
    // hay saltos discretos de bit en bit (sin desplazamiento continuo del cursor).
    function enviar() {
      if (anim) { parar(); return; }
      if (pos >= bits.length || pos < 0) pos = -1;
      btnEnv.textContent = '⏸ Parar';
      btnEnv.setAttribute('aria-pressed', 'true');
      anim = {};
      var N = bits.length;
      function paso() {
        if (!anim) return;
        if (!vivo() || pos >= N) { parar(); return; }
        irA(pos + 1);
        if (pos >= N) { parar(); return; }
        anim.to = setTimeout(paso, MS_POR_BIT);
      }
      function cursor() {
        if (!anim) return;
        if (!vivo()) { parar(); return; }
        var cur = svg.querySelector('.tu-cursor');
        if (cur && anim.tBit != null) {
          var f = Math.min(1, (performance.now() - anim.tBit) / MS_POR_BIT);
          var x = X0 + (pos + f) * WB;
          cur.setAttribute('x1', x); cur.setAttribute('x2', x);
        }
        anim.raf = requestAnimationFrame(cursor);
      }
      paso();
      if (anim && !reducido) anim.raf = requestAnimationFrame(cursor);
    }

    function invalidar() { parar(); pos = -1; }

    // ---------- Eventos ----------
    function leerInput() {
      var v = leerDato(inD.value, pdsel === 3 ? 511 : 255);
      if (v == null) {
        errP.textContent = pdsel === 3
          ? 'Dato no válido: de 0 a 511 (0x000 a 0x1FF) con 9 bits, o un carácter.'
          : 'Dato no válido: de 0 a 255 (0x00 a 0xFF), o un carácter ASCII.';
        inD.setAttribute('aria-invalid', 'true');
        return;
      }
      errP.textContent = '';
      inD.removeAttribute('aria-invalid');
      dato = v;
      invalidar();
      pintar();
    }
    inD.addEventListener('input', leerInput);
    selB.addEventListener('change', function () { baud = parseInt(selB.value, 10); invalidar(); pintar(); });
    selP.addEventListener('change', function () {
      pdsel = +selP.value;
      if (pdsel !== 3 && dato > 255) { dato &= 0xFF; inD.value = hex(dato, 2); }
      leerInput();
      invalidar(); pintar();
    });
    selS.addEventListener('change', function () { stsel = +selS.value; invalidar(); pintar(); });
    btnEnv.addEventListener('click', enviar);
    btnPaso.addEventListener('click', function () {
      parar();
      if (pos < bits.length) irA(pos + 1);
    });
    btnReini.addEventListener('click', function () { parar(); irA(-1); });

    btnEnv.setAttribute('aria-pressed', 'false');
    pintar();
  };
})();
