/*
 * Componente "vis-bus": ciclo de bus CPU ⇄ memoria (libro, 6.3.8 y figura 52), paso a paso.
 *   Lectura  (move 0x82, W1):  1) CPU pone 0x82 en el bus de direcciones  2) activa RD
 *                              3) la memoria pone 0x0003 en el bus de datos  4) la CPU lo carga en W1
 *   Escritura (move W1, 0x84): 1) CPU pone 0x84 en el bus de direcciones  2) pone 0x000A (W1) en el de datos
 *                              3) activa WR  4) la memoria guarda 0x000A en 0x84
 *
 * Uso: <div class="mpi-mount" data-componente="vis-bus"
 *           data-config='{"lectura":{"dir":"0x82","dato":"0x0003"},"escritura":{"dir":"0x84","dato":"0x000A"}}'></div>
 *
 * Claves de data-config (todas opcionales; por defecto, los valores del libro):
 *   lectura    {dir, dato, reg}  dirección leída, dato que entrega la memoria y registro destino (defecto W1)
 *   escritura  {dir, dato, reg}  dirección escrita, dato que pone la CPU y registro origen (defecto W1)
 *   memoria    {"0x80": 7, …}    otras celdas que se dibujan en la memoria (defecto: las del ejemplo
 *                                6.3.6 si las direcciones son 0x80/0x82/0x84)
 *   modo       "lectura" (defecto) o "escritura"
 */
window.MPI = window.MPI || {};
MPI.componentes = MPI.componentes || {};

(function () {
  var uid = 0;

  function hx(v, n) {
    var s = (v >>> 0).toString(16).toUpperCase();
    while (s.length < (n || 4)) s = '0' + s;
    return '0x' + s;
  }
  function hdir(a) { return hx(a, a > 0xFF ? 4 : 2); }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function num(v, def) {
    if (typeof v === 'number' && isFinite(v)) return Math.round(v);
    if (typeof v === 'string') {
      var t = v.trim();
      if (/^0x[0-9a-f]+$/i.test(t)) return parseInt(t, 16);
      if (/^-?\d+$/.test(t)) return parseInt(t, 10);
    }
    return def;
  }
  function reg(v, def) {
    var m = String(v == null ? '' : v).trim().match(/^W?(\d{1,2})$/i);
    return m && +m[1] < 16 ? 'W' + (+m[1]) : def;
  }

  // Pasos de cada ciclo. Estado tras el paso k: qué buses están activos.
  function ciclos(L, E) {
    return {
      lectura: {
        titulo: 'Ciclo de lectura',
        instr: 'move ' + hdir(L.dir) + ', ' + L.reg,
        intro: 'La CPU va a ejecutar <code>move ' + hdir(L.dir) + ', ' + L.reg + '</code>: necesita <strong>leer</strong> el dato de la dirección <code>' + hdir(L.dir) + '</code>. Los buses están en reposo. Pulsa <strong>Paso</strong>.',
        pasos: [
          { quien: 'CPU', bus: 'dir', valor: hdir(L.dir),
            txt: 'La CPU pone la dirección <code>' + hdir(L.dir) + '</code> en el <span class="vbus-t-dir">bus de direcciones</span>. Todos los bloques la ven; la memoria selecciona la celda ' + hdir(L.dir) + '.' },
          { quien: 'CPU', bus: 'rd', valor: 'RD',
            txt: 'La CPU activa la línea <span class="vbus-t-ctrl">RD</span> (<em>read</em>) del <span class="vbus-t-ctrl">bus de control</span>: la operación es una <strong>lectura</strong>.' },
          { quien: 'Memoria', bus: 'dat', valor: hx(L.dato),
            txt: 'La memoria pone en el <span class="vbus-t-dat">bus de datos</span> el contenido de la celda ' + hdir(L.dir) + ': <code>' + hx(L.dato) + '</code> (' + L.dato + '). El dato viaja de la memoria a la CPU.' },
          { quien: 'CPU', bus: 'reg', valor: L.reg + ' = ' + hx(L.dato),
            txt: 'La CPU recoge el dato del bus de datos y lo guarda en el registro <strong>' + L.reg + ' = ' + hx(L.dato) + '</strong>. Fin del ciclo de lectura: la CPU desactiva RD y libera los buses.' }
        ]
      },
      escritura: {
        titulo: 'Ciclo de escritura',
        instr: 'move ' + E.reg + ', ' + hdir(E.dir),
        intro: 'La CPU va a ejecutar <code>move ' + E.reg + ', ' + hdir(E.dir) + '</code>: debe <strong>escribir</strong> el contenido de ' + E.reg + ' (<code>' + hx(E.dato) + '</code>) en la dirección <code>' + hdir(E.dir) + '</code>. Pulsa <strong>Paso</strong>.',
        pasos: [
          { quien: 'CPU', bus: 'dir', valor: hdir(E.dir),
            txt: 'La CPU pone la dirección <code>' + hdir(E.dir) + '</code> en el <span class="vbus-t-dir">bus de direcciones</span>; la memoria selecciona esa celda.' },
          { quien: 'CPU', bus: 'dat', valor: hx(E.dato),
            txt: 'En una escritura es la <strong>CPU</strong> quien suministra también el dato: pone el contenido de ' + E.reg + ', <code>' + hx(E.dato) + '</code>, en el <span class="vbus-t-dat">bus de datos</span>. El dato viaja de la CPU a la memoria.' },
          { quien: 'CPU', bus: 'wr', valor: 'WR',
            txt: 'La CPU activa la línea <span class="vbus-t-ctrl">WR</span> (<em>write</em>) del <span class="vbus-t-ctrl">bus de control</span>: la operación es una <strong>escritura</strong>.' },
          { quien: 'Memoria', bus: 'mem', valor: '(' + hdir(E.dir) + ') = ' + hx(E.dato),
            txt: 'La memoria guarda el dato del bus en la celda: <strong>(' + hdir(E.dir) + ') = ' + hx(E.dato) + '</strong> (' + E.dato + '). Fin del ciclo de escritura: la CPU desactiva WR y libera los buses.' }
        ]
      }
    };
  }

  MPI.componentes['vis-bus'] = function (el, cfg) {
    cfg = cfg || {};
    var id = 'vbus' + (++uid);
    var cl = cfg.lectura || {}, ce = cfg.escritura || {};
    var L = { dir: num(cl.dir, 0x82) & 0xFFFF, dato: num(cl.dato, 3) & 0xFFFF, reg: reg(cl.reg, 'W1') };
    var E = { dir: num(ce.dir, 0x84) & 0xFFFF, dato: num(ce.dato, 0x000A) & 0xFFFF, reg: reg(ce.reg, 'W1') };
    var C = ciclos(L, E);

    // Celdas de memoria dibujadas.
    var memBase = {};
    var src = cfg.memoria && typeof cfg.memoria === 'object' ? cfg.memoria : null;
    var libro = [0x80, 0x82, 0x84];
    if (!src && libro.indexOf(L.dir) >= 0 && libro.indexOf(E.dir) >= 0) src = { '0x80': 7, '0x82': 3, '0x84': 0 };
    if (src) Object.keys(src).forEach(function (k) { var a = num(k, null), v = num(src[k], null); if (a != null && v != null) memBase[a & 0xFFFF] = v & 0xFFFF; });
    memBase[L.dir] = L.dato;
    if (!Object.prototype.hasOwnProperty.call(memBase, E.dir) || E.dir === L.dir) memBase[E.dir] = E.dir === L.dir ? L.dato : 0;
    var dirsMem = Object.keys(memBase).map(Number).sort(function (a, b) { return a - b; });
    // Como mucho 5 celdas: se priorizan las dos que usa el ciclo.
    if (dirsMem.length > 5) dirsMem = dirsMem.filter(function (a) { return a === L.dir || a === E.dir; }).concat(dirsMem.filter(function (a) { return a !== L.dir && a !== E.dir; })).slice(0, 5).sort(function (a, b) { return a - b; });

    var modo = cfg.modo === 'escritura' ? 'escritura' : 'lectura';
    var paso = 0;

    el.classList.add('mpi-vis-bus');
    el.innerHTML =
      '<div class="mpi-sim-cab">Buses: ciclo de lectura y de escritura <span class="vbus-sub">CPU ⇄ memoria · bus de direcciones, de datos y de control</span></div>' +
      '<div class="vbus-modos" role="group" aria-label="Tipo de ciclo">' +
        '<button type="button" data-modo="lectura" aria-pressed="false">Lectura (RD)</button>' +
        '<button type="button" data-modo="escritura" aria-pressed="false">Escritura (WR)</button>' +
      '</div>' +
      '<div class="vbus-controles">' +
        '<button type="button" class="vbus-paso">Paso ▶</button>' +
        '<button type="button" class="vbus-atras">◀ Atrás</button>' +
        '<button type="button" class="vbus-reset">Reiniciar</button>' +
        '<span class="vbus-contador"></span>' +
      '</div>' +
      '<div class="vbus-expl" aria-live="polite"></div>' +
      '<div class="vbus-cuerpo">' +
        '<figure class="vbus-fig"><div class="vbus-diag"></div><figcaption class="vbus-cap">Bloques y buses</figcaption></figure>' +
        '<figure class="vbus-fig"><div class="vbus-crono"></div><figcaption class="vbus-cap">Temporización (cronograma por pasos)</figcaption></figure>' +
      '</div>' +
      '<div class="vbus-tabla-wrap"><table class="vbus-tabla"><caption class="vbus-oculto">Pasos del ciclo</caption><thead><tr><th scope="col">Paso</th><th scope="col">Quién</th><th scope="col">Bus</th><th scope="col">Valor</th></tr></thead><tbody></tbody></table></div>';

    function $(s) { return el.querySelector(s); }

    // Estado de las señales tras el paso k.
    function senales(m, k) {
      if (m === 'lectura') return { dir: k >= 1 ? 1 : 0, rd: k >= 2 ? 2 : 0, wr: 0, dat: k >= 3 ? 3 : 0, datIzq: true, reg: k >= 4, mem: false };
      return { dir: k >= 1 ? 1 : 0, dat: k >= 2 ? 2 : 0, wr: k >= 3 ? 3 : 0, rd: 0, datIzq: false, reg: false, mem: k >= 4 };
    }

    function diagrama() {
      var s = senales(modo, paso);
      var W = 340, H = 210, xc = 74, xm = 248;
      var datoBus = modo === 'lectura' ? L : E;
      function nuevo(k) { return k && k === paso ? ' vbus-nuevo' : ''; }
      var h = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="vbus-svg" role="img" aria-label="CPU y memoria unidas por los buses de direcciones, datos y control">' +
        '<defs>' + ['dir', 'dat', 'ctrl'].map(function (k) {
          return '<marker id="' + id + '-mk-' + k + '" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0,0 L10,5 L0,10 z" class="vbus-mk-' + k + '"/></marker>';
        }).join('') + '</defs>';
      // CPU
      var regVal = modo === 'lectura' ? (s.reg ? hx(L.dato) : hx(0)) : hx(E.dato);
      var regNom = modo === 'lectura' ? L.reg : E.reg;
      h += '<rect x="4" y="14" width="' + (xc - 4) + '" height="' + (H - 24) + '" rx="7" class="vbus-caja"/>' +
        '<text x="' + ((xc + 4) / 2) + '" y="34" class="vbus-caja-t">CPU</text>' +
        '<text x="' + ((xc + 4) / 2) + '" y="116" class="vbus-reg-n">' + regNom + '</text>' +
        '<text x="' + ((xc + 4) / 2) + '" y="128" class="vbus-reg-r">' + (modo === 'lectura' ? 'destino' : 'origen') + '</text>' +
        '<rect x="12" y="134" width="' + (xc - 20) + '" height="20" rx="4" class="vbus-celda' + (s.reg ? ' vbus-celda-on vbus-nuevo' : '') + (modo === 'escritura' && s.dat ? ' vbus-celda-sel' : '') + '"/>' +
        '<text x="' + ((xc + 4) / 2) + '" y="148" class="vbus-celda-t">' + regVal + '</text>';
      // Memoria
      h += '<rect x="' + xm + '" y="14" width="' + (W - 4 - xm) + '" height="' + (H - 24) + '" rx="7" class="vbus-caja"/>' +
        '<text x="' + ((xm + W - 4) / 2) + '" y="34" class="vbus-caja-t">Memoria</text>';
      var y0 = 50, dy = Math.min(26, Math.floor(130 / Math.max(dirsMem.length, 1)));
      dirsMem.forEach(function (a, i) {
        var y = y0 + i * dy;
        var sel = s.dir && a === datoBus.dir;
        var v = memBase[a];
        if (modo === 'escritura' && a === E.dir && s.mem) v = E.dato;
        var on = (modo === 'escritura' && a === E.dir && s.mem);
        h += '<text x="' + (xm + 6) + '" y="' + (y + 14) + '" class="vbus-mem-d' + (sel ? ' vbus-mem-d-sel' : '') + '">' + hdir(a) + '</text>' +
          '<rect x="' + (xm + 36) + '" y="' + y + '" width="' + (W - 4 - xm - 42) + '" height="20" rx="3" class="vbus-celda' + (sel ? ' vbus-celda-sel' : '') + (on ? ' vbus-celda-on vbus-nuevo' : '') + (sel && paso === 1 ? ' vbus-nuevo' : '') + '"/>' +
          '<text x="' + (xm + 36 + (W - 4 - xm - 42) / 2) + '" y="' + (y + 14) + '" class="vbus-celda-t">' + hx(v).slice(2) + '</text>';
      });
      // Buses
      var buses = [
        { k: 'dir', y: 66, nom: 'Bus de direcciones', on: s.dir, val: hdir(datoBus.dir), izq: false, cls: 'dir' },
        { k: 'dat', y: 108, nom: 'Bus de datos', on: s.dat, val: hx(datoBus.dato), izq: s.datIzq, cls: 'dat' },
        { k: 'rd', y: 152, nom: 'Control: RD', on: s.rd, val: 'RD', izq: false, cls: 'ctrl' },
        { k: 'wr', y: 186, nom: 'Control: WR', on: s.wr, val: 'WR', izq: false, cls: 'ctrl' }
      ];
      buses.forEach(function (b) {
        var xa = b.izq ? xm : xc, xb = b.izq ? xc + 2 : xm - 2;
        h += '<text x="' + (xc + 6) + '" y="' + (b.y - 11) + '" class="vbus-bus-n' + (b.on ? ' vbus-bus-n-on' : '') + '">' + b.nom + '</text>' +
          '<line x1="' + xa + '" y1="' + b.y + '" x2="' + xb + '" y2="' + b.y + '" class="vbus-ln vbus-ln-' + b.cls + (b.on ? ' vbus-ln-on' + nuevo(b.on) : '') + '"' +
          (b.on ? ' marker-end="url(#' + id + '-mk-' + b.cls + ')"' : '') + '/>';
        if (b.on) {
          var cx = (xc + xm) / 2 + 30, w = b.val.length * 7.2 + 14;
          h += '<g class="vbus-pill vbus-pill-' + b.cls + nuevo(b.on) + '"><rect x="' + (cx - w / 2) + '" y="' + (b.y - 8) + '" width="' + w + '" height="16" rx="8"/>' +
            '<text x="' + cx + '" y="' + (b.y + 4) + '">' + b.val + '</text></g>';
        }
      });
      $('.vbus-diag').innerHTML = h + '</svg>';
    }

    function cronograma() {
      var s4 = senales(modo, 4);
      var W = 340, H = 136, x0 = 76, col = (W - x0 - 6) / 4;
      var filas = [
        { nom: 'Dirección', tipo: 'bus', ini: s4.dir, val: hdir((modo === 'lectura' ? L : E).dir), cls: 'dir' },
        { nom: 'RD', tipo: 'lin', ini: s4.rd, cls: 'ctrl' },
        { nom: 'WR', tipo: 'lin', ini: s4.wr, cls: 'ctrl' },
        { nom: 'Datos', tipo: 'bus', ini: s4.dat, val: hx((modo === 'lectura' ? L : E).dato), cls: 'dat' }
      ];
      var h = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="vbus-svg" role="img" aria-label="Cronograma de las señales del ciclo">';
      // Columna del paso actual
      if (paso > 0) h += '<rect x="' + (x0 + (paso - 1) * col) + '" y="2" width="' + col + '" height="' + (H - 20) + '" class="vbus-cur"/>';
      for (var k = 0; k <= 4; k++) h += '<line x1="' + (x0 + k * col) + '" y1="2" x2="' + (x0 + k * col) + '" y2="' + (H - 18) + '" class="vbus-rej"/>';
      for (k = 1; k <= 4; k++) h += '<text x="' + (x0 + (k - 0.5) * col) + '" y="' + (H - 5) + '" class="vbus-paso-n' + (k === paso ? ' vbus-paso-n-on' : '') + '">' + k + '</text>';
      var xFin = x0 + paso * col;  // se dibuja hasta el paso actual
      filas.forEach(function (f, i) {
        var y = 18 + i * 28;
        h += '<text x="4" y="' + (y + 4) + '" class="vbus-crono-n vbus-c-' + f.cls + '">' + f.nom + '</text>';
        if (paso === 0) { h += '<line x1="' + x0 + '" y1="' + y + '" x2="' + (W - 6) + '" y2="' + y + '" class="vbus-pend"/>'; return; }
        var xa = f.ini ? x0 + (f.ini - 1) * col : null;
        if (f.tipo === 'lin') {
          var yb = y + 8, ya = y - 8;
          if (!f.ini || f.ini > paso) h += '<polyline points="' + x0 + ',' + yb + ' ' + xFin + ',' + yb + '" class="vbus-w vbus-w-off"/>';
          else h += '<polyline points="' + x0 + ',' + yb + ' ' + xa + ',' + yb + ' ' + xa + ',' + ya + ' ' + xFin + ',' + ya + '" class="vbus-w vbus-w-' + f.cls + '"/>' +
            '<text x="' + (xa + 4) + '" y="' + (ya + 12) + '" class="vbus-w-t">activa</text>';
        } else {
          if (!f.ini || f.ini > paso) h += '<line x1="' + x0 + '" y1="' + y + '" x2="' + xFin + '" y2="' + y + '" class="vbus-w vbus-w-z"/>';
          else {
            if (xa > x0) h += '<line x1="' + x0 + '" y1="' + y + '" x2="' + xa + '" y2="' + y + '" class="vbus-w vbus-w-z"/>';
            h += '<polygon points="' + xa + ',' + y + ' ' + (xa + 5) + ',' + (y - 9) + ' ' + xFin + ',' + (y - 9) + ' ' + xFin + ',' + (y + 9) + ' ' + (xa + 5) + ',' + (y + 9) + '" class="vbus-banda vbus-banda-' + f.cls + '"/>' +
              '<text x="' + ((xa + 5 + xFin) / 2) + '" y="' + (y + 4) + '" class="vbus-banda-t vbus-c-' + f.cls + '">' + f.val + '</text>';
          }
        }
        if (xFin < W - 6) h += '<line x1="' + xFin + '" y1="' + y + '" x2="' + (W - 6) + '" y2="' + y + '" class="vbus-pend"/>';
      });
      $('.vbus-crono').innerHTML = h + '</svg>';
    }

    function pintar() {
      var c = C[modo];
      var mb = el.querySelectorAll('[data-modo]');
      for (var i = 0; i < mb.length; i++) mb[i].setAttribute('aria-pressed', mb[i].getAttribute('data-modo') === modo ? 'true' : 'false');
      $('.vbus-paso').disabled = paso >= c.pasos.length;
      $('.vbus-atras').disabled = paso === 0;
      $('.vbus-contador').textContent = c.titulo + ' · paso ' + paso + ' de ' + c.pasos.length;
      $('.vbus-expl').innerHTML = paso === 0 ? c.intro : '<strong>Paso ' + paso + '.</strong> ' + c.pasos[paso - 1].txt;
      var nomBus = { dir: 'Direcciones', dat: 'Datos', rd: 'Control: RD', wr: 'Control: WR', reg: 'Registro', mem: 'Memoria' };
      $('.vbus-tabla tbody').innerHTML = c.pasos.map(function (p, k) {
        var cls = k + 1 === paso ? 'vbus-fila-on' : (k + 1 < paso ? 'vbus-fila-hecha' : '');
        return '<tr class="' + cls + '"><td>' + (k + 1) + '</td><td>' + p.quien + '</td><td>' + nomBus[p.bus] + '</td><td class="vbus-tv">' + esc(p.valor) + '</td></tr>';
      }).join('');
      diagrama();
      cronograma();
    }

    el.addEventListener('click', function (e) {
      var t = e.target.closest('button');
      if (!t || !el.contains(t) || t.disabled) return;
      if (t.hasAttribute('data-modo')) { modo = t.getAttribute('data-modo'); paso = 0; }
      else if (t.classList.contains('vbus-paso')) paso = Math.min(paso + 1, C[modo].pasos.length);
      else if (t.classList.contains('vbus-atras')) paso = Math.max(paso - 1, 0);
      else if (t.classList.contains('vbus-reset')) paso = 0;
      else return;
      pintar();
      if (t.disabled) { var r = $('.vbus-reset'); if (r) r.focus(); }
    });

    pintar();
  };
})();
