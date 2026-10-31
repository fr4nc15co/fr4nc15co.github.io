/*
 * Componente "vis-rs232": una trama serie 8N1 vista en el micro (TTL/CMOS) y en la línea RS232
 * (libro, 17.7 y figuras 107-109).
 *
 *   8N1: bit de start (0), 8 bits de dato empezando por b0 (LSB), sin paridad, 1 bit de stop (1).
 *   Micro (dsPIC33FJ32MC202, 3,3 V): reposo = 1 = 3,3 V; 0 = 0 V.
 *   Línea RS232 (lógica invertida): 1 = −15 V (reposo), 0 = +15 V; válidos de ±3 V a ±15 V.
 *   Entre ambos, el MAX233 (invierte y cambia el nivel). DB9: 2 = RxD, 3 = TxD, 5 = GND.
 *   Ejemplo: '*' = 0x2A = 0010 1010 → b0..b7 = 0,1,0,1,0,1,0,0.
 *
 * Uso: <div class="mpi-mount" data-componente="vis-rs232" data-config='{"dato":"0x2A","baudios":9600}'></div>
 *
 * Claves de data-config (opcionales):
 *   dato     byte a enviar: "0x2A", 42, "0b00101010" o un carácter ("*"). Defecto 0x2A.
 *   baudios  velocidad en bits/s (defecto 9600; el selector ofrece 2400-115 200)
 */
window.MPI = window.MPI || {};
MPI.componentes = MPI.componentes || {};

(function () {
  var NBSP = ' ';
  var uid = 0;
  var BAUDS = [2400, 4800, 9600, 19200, 38400, 57600, 115200];
  var CTRL = { 0: 'NUL', 7: 'BEL', 8: 'BS', 9: 'TAB', 10: 'LF', 13: 'CR', 27: 'ESC', 32: 'espacio', 127: 'DEL' };

  function agrupar(n) {
    var s = String(Math.abs(n));
    if (s.length >= 5) s = s.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
    return (n < 0 ? '−' : '') + s;
  }
  function sig(x, n) {
    if (x === 0) return '0';
    var d = Math.max(0, n - 1 - Math.floor(Math.log(Math.abs(x)) / Math.LN10));
    var s = Math.abs(x).toFixed(Math.min(d, 10));
    if (s.indexOf('.') >= 0) s = s.replace(/0+$/, '').replace(/\.$/, '');
    var p = s.split('.');
    return (x < 0 ? '−' : '') + agrupar(+p[0]) + (p[1] ? ',' + p[1] : '');
  }
  function fmtT(s) {
    if (s >= 1e-3) return sig(s * 1e3, 4) + NBSP + 'ms';
    return sig(s * 1e6, 5) + NBSP + 'µs';
  }
  function hex2(v) { var s = v.toString(16).toUpperCase(); return '0x' + (s.length < 2 ? '0' : '') + s; }
  function bin8(v) { var s = v.toString(2); while (s.length < 8) s = '0' + s; return s.slice(0, 4) + NBSP + s.slice(4); }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function caracter(v) {
    if (CTRL[v]) return CTRL[v];
    if (v > 32 && v < 127) return '\'' + String.fromCharCode(v) + '\'';
    return v < 32 ? 'carácter de control' : 'fuera de ASCII (' + v + ')';
  }

  // Lee el dato: 0x.., 0b.., decimal 0-255 o un único carácter.
  function leerDato(x) {
    if (typeof x === 'number') return x >= 0 && x <= 255 && x === Math.floor(x) ? x : null;
    var s = String(x == null ? '' : x);
    var t = s.trim();
    if (/^0x[0-9a-f]{1,2}$/i.test(t)) return parseInt(t.slice(2), 16);
    if (/^0b[01]{1,8}$/i.test(t)) return parseInt(t.slice(2), 2);
    if (/^\d{1,3}$/.test(t)) { var n = parseInt(t, 10); return n <= 255 ? n : null; }
    var m = /^'(.)'$/.exec(t) || /^"(.)"$/.exec(t);
    if (m) t = m[1];
    else if (s.length === 1) t = s;
    if (t.length === 1 && t.charCodeAt(0) <= 255) return t.charCodeAt(0);
    return null;
  }

  MPI.componentes['vis-rs232'] = function (el, cfg) {
    cfg = cfg || {};
    var id = 'rs2' + (++uid);
    var dato = leerDato(cfg.dato != null ? cfg.dato : '0x2A');
    if (dato == null) dato = 0x2A;
    var baud = Math.round(Number(cfg.baudios));
    if (!(baud >= 50 && baud <= 1000000)) baud = 9600;
    var bauds = BAUDS.slice();
    if (bauds.indexOf(baud) < 0) { bauds.push(baud); bauds.sort(function (a, b) { return a - b; }); }
    var hembra = false;

    el.classList.add('mpi-vis-rs232');
    el.innerHTML =
      '<div class="mpi-sim-cab">RS232: la misma trama 8N1 en el micro y en la línea <span class="rs2-sub">MAX233 · conector DB9</span></div>' +
      '<div class="rs2-ctl">' +
        '<label for="' + id + '-d">Dato</label>' +
        '<input id="' + id + '-d" class="rs2-dato" type="text" spellcheck="false" autocomplete="off" aria-describedby="' + id + '-err ' + id + '-ay" value="' + esc(hex2(dato)) + '">' +
        '<label>Velocidad <select class="rs2-baud">' + bauds.map(function (b) {
          return '<option value="' + b + '"' + (b === baud ? ' selected' : '') + '>' + agrupar(b) + ' baudios</option>';
        }).join('') + '</select></label>' +
        '<div class="rs2-rapidos" role="group" aria-label="Ejemplos">' +
          '<button type="button" data-v="42">\'*\' 0x2A</button><button type="button" data-v="65">\'A\' 0x41</button>' +
          '<button type="button" data-v="85">\'U\' 0x55</button><button type="button" data-v="13">CR 0x0D</button>' +
        '</div>' +
      '</div>' +
      '<p class="rs2-ayuda" id="' + id + '-ay">En hexadecimal (0x2A), decimal (42), binario (0b00101010) o un carácter (*).</p>' +
      '<p class="rs2-err" id="' + id + '-err" role="alert"></p>' +
      '<div class="rs2-bits" role="group" aria-label="Bits del dato: pulsa para cambiarlos">' +
        '<span class="rs2-bits-t">Bits del dato (pulsa para cambiarlos):</span><span class="rs2-bits-b"></span>' +
      '</div>' +
      '<div class="rs2-panel" aria-live="polite"></div>' +
      '<figure class="rs2-fig"><div class="rs2-tramas"></div><figcaption>Arriba, la salida U1TX del micro; abajo, la línea RS232 tras el MAX233 (misma trama, lógica invertida)</figcaption></figure>' +
      '<div class="rs2-bajo">' +
        '<figure class="rs2-fig rs2-fig-db9"><div class="rs2-db9"></div>' +
          '<button type="button" class="rs2-mh" aria-pressed="false">Ver conector hembra</button>' +
          '<figcaption class="rs2-db9-cap"></figcaption></figure>' +
        '<div class="rs2-tabla-w"><table class="rs2-tabla"><caption>Patas del DB9 que se usan (lado del PC)</caption>' +
          '<thead><tr><th scope="col">Pata</th><th scope="col">Señal</th><th scope="col">Conexión</th></tr></thead><tbody>' +
          '<tr class="rs2-f-rx"><td>2</td><td>RxD (entrada del PC)</td><td>← T1OUT (pata 5) del MAX233 ← T1IN (pata 2) ← U1TX del dsPIC</td></tr>' +
          '<tr class="rs2-f-tx"><td>3</td><td>TxD (salida del PC)</td><td>→ R1IN (pata 4) del MAX233 → R1OUT (pata 3) → U1RX del dsPIC</td></tr>' +
          '<tr class="rs2-f-gnd"><td>5</td><td>GND</td><td>masa común del micro, el MAX233 y el PC</td></tr>' +
          '</tbody></table>' +
          '<p class="rs2-nota">Las líneas se cruzan: lo que transmite el micro (TX) es lo que recibe el PC (RxD), y viceversa. Con el dsPIC33FJ32MC202 U1TX y U1RX se asignan a pines RPx por software.</p>' +
        '</div>' +
      '</div>' +
      '<div class="rs2-notas">' +
        '<p><b>En la PicTrainer no hay niveles RS232:</b> no lleva MAX233 ni DB9. El FT230XS convierte la UART (U1TX = RP4, pin 11; U1RX = RP5, pin 14) a USB y el PC ve un puerto COM virtual. La trama que viaja del micro al FT230XS es la de arriba, a 0 V / 3,3 V.</p>' +
        '<p><b>Niveles:</b> el libro habla de 0-5 V en el micro, pero el dsPIC33FJ32MC202 trabaja a 3,3 V. El MAX233 es de 5 V: acepta 3,3 V como «1» en su entrada, pero su salida hacia el micro da 5 V, así que debe llegar a un pin tolerante a 5 V (RB5/RP5 lo es) o usarse un conversor de 3,3 V (familia MAX3232). En la línea basta con estar entre ±3 V y ±15 V; los conversores reales suelen dar unos ±8 V.</p>' +
      '</div>';

    function $(s) { return el.querySelector(s); }
    var inD = $('.rs2-dato'), selB = $('.rs2-baud'), err = $('.rs2-err');

    // ---------- tramas ----------
    var X0 = 70, X1 = 374, NS = 12, SW = (X1 - X0) / NS;
    function slots() {
      var s = [{ n: '', v: 1, idle: true }, { n: 'start', v: 0 }];
      for (var k = 0; k < 8; k++) s.push({ n: 'b' + k, v: (dato >> k) & 1, dato: true });
      s.push({ n: 'stop', v: 1 }, { n: '', v: 1, idle: true });
      return s;
    }
    function tramas() {
      var s = slots(), tb = 1 / baud;
      var yT1 = 52, yT0 = 88;                 // TTL: 3,3 V y 0 V
      var yR0 = 236, k4 = 3.6;                // RS232: 0 V y px por voltio
      function yR(v) { return yR0 - v * k4; }
      var h = '<svg viewBox="0 0 380 372" class="rs2-svg" role="img" aria-label="Trama 8N1 de ' + hex2(dato) + ': start, bits ' +
        s.slice(2, 10).map(function (x) { return x.v; }).join(', ') + ' (de b0 a b7) y stop, en niveles TTL y RS232">';
      // fondos de los bits de dato y del start/stop
      s.forEach(function (x, k) {
        var xa = X0 + k * SW;
        var cls = x.idle ? 'rs2-s-idle' : (x.dato ? 'rs2-s-dato' : 'rs2-s-ctl');
        h += '<rect x="' + xa.toFixed(1) + '" y="22" width="' + SW.toFixed(1) + '" height="' + (yT0 - 14) + '" class="' + cls + '"/>' +
          '<rect x="' + xa.toFixed(1) + '" y="' + (yR(15) - 8) + '" width="' + SW.toFixed(1) + '" height="' + (30 * k4 + 16) + '" class="' + cls + '"/>';
        h += '<text x="' + (xa + SW / 2).toFixed(1) + '" y="16" class="rs2-s-n">' + (x.idle ? '' : x.n) + '</text>' +
          '<text x="' + (xa + SW / 2).toFixed(1) + '" y="36" class="rs2-s-v' + (x.v ? ' rs2-s-v1' : '') + '">' + x.v + '</text>';
      });
      // rejilla de bits
      for (var k = 1; k < NS; k++) {
        var xg = (X0 + k * SW).toFixed(1);
        h += '<line x1="' + xg + '" y1="22" x2="' + xg + '" y2="' + (yT0 + 4) + '" class="rs2-rej"/>' +
          '<line x1="' + xg + '" y1="' + (yR(15) - 8) + '" x2="' + xg + '" y2="' + (yR(-15) + 8) + '" class="rs2-rej"/>';
      }
      // --- TTL ---
      h += '<text x="4" y="' + (yT1 + 3) + '" class="rs2-ax">3,3 V = 1</text><text x="4" y="' + (yT0 + 3) + '" class="rs2-ax">0 V = 0</text>' +
        '<line x1="' + X0 + '" y1="' + yT0 + '" x2="' + X1 + '" y2="' + yT0 + '" class="rs2-base"/>';
      h += '<polyline points="' + onda(s, function (v) { return v ? yT1 : yT0; }) + '" class="rs2-onda-ttl"/>';
      h += '<text x="' + X0 + '" y="' + (yT0 + 14) + '" class="rs2-tit">dsPIC · U1TX (TTL/CMOS, 0 V / 3,3 V)</text>';
      // --- MAX233 ---
      var yb = 130, xm = 230, xa = xm - 58;
      h += '<line x1="' + xa + '" y1="' + (yT0 + 20) + '" x2="' + xa + '" y2="' + (yb - 15) + '" class="rs2-flecha" marker-end="url(#' + id + '-fl)"/>' +
        '<rect x="' + (xm - 80) + '" y="' + (yb - 15) + '" width="160" height="32" rx="5" class="rs2-max"/>' +
        '<path d="M' + (xa - 8) + ',' + (yb - 9) + ' L' + (xa + 8) + ',' + (yb - 9) + ' L' + xa + ',' + (yb + 5) + ' Z" class="rs2-inv"/>' +
        '<circle cx="' + xa + '" cy="' + (yb + 8.5) + '" r="3" class="rs2-inv"/>' +
        '<text x="' + (xm - 38) + '" y="' + (yb - 1) + '" class="rs2-max-t">MAX233</text>' +
        '<text x="' + (xm - 38) + '" y="' + (yb + 11) + '" class="rs2-max-s">T1IN (2) → T1OUT (5)</text>' +
        '<line x1="' + xa + '" y1="' + (yb + 17) + '" x2="' + xa + '" y2="' + (yR(15) - 12) + '" class="rs2-flecha" marker-end="url(#' + id + '-fl)"/>' +
        '<text x="' + (xm - 88) + '" y="' + (yb - 2) + '" class="rs2-max-n">invierte y</text><text x="' + (xm - 88) + '" y="' + (yb + 10) + '" class="rs2-max-n">cambia el nivel</text>';
      // --- RS232 ---
      h += '<rect x="' + X0 + '" y="' + yR(3) + '" width="' + (X1 - X0) + '" height="' + (6 * k4) + '" class="rs2-banda"/>' +
        '<rect x="' + X0 + '" y="' + yR(15) + '" width="' + (X1 - X0) + '" height="' + (12 * k4) + '" class="rs2-valida rs2-valida-0"/>' +
        '<rect x="' + X0 + '" y="' + yR(-3) + '" width="' + (X1 - X0) + '" height="' + (12 * k4) + '" class="rs2-valida rs2-valida-1"/>';
      [[15, '+15 V = 0'], [3, '+3 V'], [0, 'indefinido'], [-3, '−3 V'], [-15, '−15 V = 1']].forEach(function (p) {
        h += '<text x="4" y="' + (yR(p[0]) + 3) + '" class="rs2-ax' + (Math.abs(p[0]) === 3 ? ' rs2-ax-t' : '') + (p[0] === 0 ? ' rs2-ax-z' : '') + '">' + p[1] + '</text>' +
          '<line x1="' + (X0 - 3) + '" y1="' + yR(p[0]) + '" x2="' + X0 + '" y2="' + yR(p[0]) + '" class="rs2-base"/>';
      });
      h += '<line x1="' + X0 + '" y1="' + yR(0) + '" x2="' + X1 + '" y2="' + yR(0) + '" class="rs2-cero"/>';
      h += '<polyline points="' + onda(s, function (v) { return v ? yR(-15) : yR(15); }) + '" class="rs2-onda-232"/>';
      h += '<text x="' + X0 + '" y="' + (yR(-15) + 20) + '" class="rs2-tit">Línea RS232 · DB9 pata 2, RxD del PC (1 = −15 V, 0 = +15 V)</text>';
      // --- cotas de tiempo ---
      var xs = X0 + SW, xe = X0 + 11 * SW, yc1 = yR(-15) + 36, yc2 = yc1 + 26;
      var xb0 = X0 + 2 * SW;
      h += '<line x1="' + xb0.toFixed(1) + '" y1="' + yc1 + '" x2="' + (xb0 + SW).toFixed(1) + '" y2="' + yc1 + '" class="rs2-cota" marker-start="url(#' + id + '-cl)" marker-end="url(#' + id + '-cr)"/>' +
        '<text x="' + (xb0 + SW + 4).toFixed(1) + '" y="' + (yc1 + 3) + '" class="rs2-cota-t rs2-cota-t-i">T<tspan baseline-shift="sub" font-size="7">bit</tspan> = 1/' + agrupar(baud) + ' = ' + fmtT(tb) + '</text>' +
        '<line x1="' + xs.toFixed(1) + '" y1="' + yc2 + '" x2="' + xe.toFixed(1) + '" y2="' + yc2 + '" class="rs2-cota" marker-start="url(#' + id + '-cl)" marker-end="url(#' + id + '-cr)"/>' +
        '<text x="' + ((xs + xe) / 2).toFixed(1) + '" y="' + (yc2 - 4) + '" class="rs2-cota-t">trama de 10 bits = ' + fmtT(10 * tb) + '</text>';
      h += '<defs><marker id="' + id + '-fl" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0 L10,5 L0,10 z" class="rs2-mk"/></marker>' +
        '<marker id="' + id + '-cr" viewBox="0 0 8 8" refX="7.5" refY="4" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0 L8,4 L0,8 z" class="rs2-mk-c"/></marker>' +
        '<marker id="' + id + '-cl" viewBox="0 0 8 8" refX="0.5" refY="4" markerWidth="6" markerHeight="6" orient="auto"><path d="M8,0 L0,4 L8,8 z" class="rs2-mk-c"/></marker></defs>';
      $('.rs2-tramas').innerHTML = h + '</svg>';
    }
    function onda(s, y) {
      var pts = [], prev = null;
      s.forEach(function (x, k) {
        var xa = X0 + k * SW, yy = y(x.v);
        if (prev !== null && prev !== yy) pts.push(xa.toFixed(1) + ',' + prev);
        pts.push(xa.toFixed(1) + ',' + yy);
        prev = yy;
      });
      pts.push(X1.toFixed(1) + ',' + prev);
      return pts.join(' ');
    }

    // ---------- DB9 ----------
    function db9() {
      var h = '<svg viewBox="0 0 230 128" class="rs2-svg rs2-db9-svg" role="img" aria-label="Conector DB9 ' + (hembra ? 'hembra' : 'macho') + ' visto de frente; resaltadas las patas 2 (RxD), 3 (TxD) y 5 (GND)">';
      h += '<path d="M14,30 Q14,22 22,22 L208,22 Q216,22 215,30 L199,96 Q197,104 189,104 L41,104 Q33,104 31,96 Z" class="rs2-db9-c"/>';
      var funcion = { 2: ['RxD', 'rx'], 3: ['TxD', 'tx'], 5: ['GND', 'gnd'] };
      function pin(n, x, y) {
        var f = funcion[n];
        var out = '<circle cx="' + x + '" cy="' + y + '" r="9" class="rs2-pin ' + (hembra ? 'rs2-pin-h' : 'rs2-pin-m') + (f ? ' rs2-pin-' + f[1] : '') + '"/>' +
          '<text x="' + x + '" y="' + (y + 3.5) + '" class="rs2-pin-n' + (f ? ' rs2-pin-n-on' : '') + '">' + n + '</text>';
        if (f) out += '<text x="' + x + '" y="' + (y < 60 ? 14 : 122) + '" class="rs2-pin-f rs2-pin-f-' + f[1] + '">' + f[0] + '</text>';
        return out;
      }
      for (var i = 0; i < 5; i++) {
        var n = hembra ? 5 - i : i + 1;
        h += pin(n, 45 + i * 35, 46);
      }
      for (i = 0; i < 4; i++) {
        var m = hembra ? 9 - i : i + 6;
        h += pin(m, 62.5 + i * 35, 80);
      }
      $('.rs2-db9').innerHTML = h + '</svg>';
      $('.rs2-db9-cap').textContent = hembra ? 'DB9 hembra, vista frontal: el orden se invierte (5…1 arriba, 9…6 abajo)' : 'DB9 macho (el del PC), vista frontal: 1…5 arriba, 6…9 abajo';
      var b = $('.rs2-mh');
      b.textContent = hembra ? 'Ver conector macho' : 'Ver conector hembra';
      b.setAttribute('aria-pressed', String(hembra));
    }

    // ---------- panel ----------
    function panel() {
      var tb = 1 / baud;
      var bits = [];
      for (var k = 0; k < 8; k++) bits.push((dato >> k) & 1);
      $('.rs2-panel').innerHTML =
        '<div class="rs2-res"><span>Dato <b>' + hex2(dato) + '</b> = <b>' + dato + '</b> = <b>' + esc(caracter(dato)) + '</b> = <b>' + bin8(dato) + '</b><sub>2</sub></span></div>' +
        '<p class="rs2-orden">Se envía primero b0 (LSB): b0…b7 = <b>' + bits.join(', ') + '</b>. Trama completa: 0 (start) · ' + bits.join(' ') + ' · 1 (stop).</p>' +
        '<p class="rs2-orden">A ' + agrupar(baud) + ' baudios: T<sub>bit</sub> = ' + fmtT(tb) + ', trama de 10 bits = ' + fmtT(10 * tb) + ' → como mucho ' + sig(baud / 10, 5) + ' caracteres por segundo.</p>';
      var bb = '';
      for (k = 7; k >= 0; k--) {
        var v = (dato >> k) & 1;
        bb += '<button type="button" data-b="' + k + '" aria-pressed="' + (v ? 'true' : 'false') + '" aria-label="b' + k + ' = ' + v + '">b' + k + '<span>' + v + '</span></button>';
      }
      $('.rs2-bits-b').innerHTML = bb;
      var rs = el.querySelectorAll('.rs2-rapidos button');
      for (var i = 0; i < rs.length; i++) rs[i].setAttribute('aria-pressed', String(+rs[i].getAttribute('data-v') === dato));
    }

    function pintar(desdeInput) {
      if (!desdeInput) { inD.value = hex2(dato); inD.removeAttribute('aria-invalid'); err.textContent = ''; }
      panel();
      tramas();
    }

    inD.addEventListener('input', function () {
      var v = leerDato(inD.value);
      if (v == null) {
        inD.setAttribute('aria-invalid', 'true');
        err.textContent = inD.value.trim() === '' ? '' : 'Dato no válido: escribe un byte (0-255), p. ej. 0x2A, 42, 0b00101010 o *.';
        return;
      }
      inD.removeAttribute('aria-invalid');
      err.textContent = '';
      dato = v;
      pintar(true);
    });
    inD.addEventListener('change', function () { if (leerDato(inD.value) != null) pintar(false); });
    selB.addEventListener('change', function () { baud = +selB.value; pintar(true); });
    el.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b || !el.contains(b)) return;
      if (b.hasAttribute('data-b')) {
        var k = +b.getAttribute('data-b');
        dato ^= (1 << k);
        pintar(false);
        var nb = el.querySelector('.rs2-bits-b [data-b="' + k + '"]');
        if (nb) nb.focus();
      } else if (b.hasAttribute('data-v')) {
        dato = +b.getAttribute('data-v');
        pintar(false);
      } else if (b.classList.contains('rs2-mh')) {
        hembra = !hembra;
        db9();
      }
    });

    db9();
    pintar(false);
  };
})();
