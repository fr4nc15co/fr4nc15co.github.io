/*
 * Componente "sim-encoder": encoder incremental y módulo QEI del dsPIC33FJ32MC202
 * (libro, cap. 21, figuras 119-122; datasheet 16.0 Quadrature Encoder Interface).
 *
 *   Modelo de las señales (posición en cuartos de ciclo eléctrico, q):
 *     cuadrante q mod 4:  0 → A = 1, B = 0 · 1 → A = 1, B = 1 · 2 → A = 0, B = 1 · 3 → A = 0, B = 0
 *     Sentido positivo (horario en el dibujo): A adelanta 90° a B → UPDN = 1.
 *     Secuencia AB en sentido positivo: 01 → 00 → 10 → 11 → 01 (figura 119 del libro).
 *     INDX = 1 durante medio ciclo, los dos estados con B = 0 (AB = 00 y 10) que rodean el flanco de
 *     subida de A en el origen de la vuelta (q mod 4N = 4N − 1 y 0), en los dos sentidos (figura 119).
 *   Cuentas: x2 (QEIM<1> = 0) cuenta los dos flancos de A; x4 (QEIM<1> = 1), los de A y B.
 *   Reset (datasheet, QEIM<2:0>):
 *     100 / 110 (x2 / x4, índice) + POSRES = 1: en el flanco de A del índice POSCNT = 0 subiendo;
 *       bajando se carga MAXCNT (supuesto: el datasheet no dice qué carga en giro negativo).
 *     101 / 111 (x2 / x4, MAXCNT): subiendo de MAXCNT pasa a 0; bajando de 0 pasa a MAXCNT.
 *     100 + POSRES = 0: el índice no resetea; aquí POSCNT cuenta libre en 16 bits.
 *   En cada reset se pone QEIIF (IFS3<10>) y la ISR de la ampliación de 32 bits suma o resta una vuelta según
 *   UPDN (QEICON<11>): posición de 32 bits = vueltas · (MAXCNT + 1) + POSCNT.
 *   LEDs (figura 122): PORTB = POSCNT << 12 → RB12 (D9) = bit 0 … RB15 (D6) = bit 3, activos a nivel bajo.
 *   QEA/QEB/INDX son entradas remapeables: RPINR14 (QEA1R<4:0>, QEB1R<12:8>) y RPINR15 (INDX1R<4:0>).
 *
 * Uso: <div class="mpi-mount" data-componente="sim-encoder"
 *        data-config='{"ranuras":4000,"modo":"x2","reset":"indice","qeicon":"0x0404"}'></div>
 *
 * Claves de data-config (opcionales):
 *   ranuras  número de ranuras N (1-16 384; defecto 4000)
 *   modo     "x2" (defecto) o "x4"
 *   reset    "indice" (defecto, POSRES = 1), "maxcnt" o "libre" (índice sin reset, POSRES = 0)
 */
window.MPI = window.MPI || {};
MPI.componentes = MPI.componentes || {};

(function () {
  var NBSP = ' ';
  var NMAX = 16384;          // 4·N − 1 debe caber en MAXCNT (16 bits)
  var NDIB = 36;             // ranuras dibujadas como máximo
  var HIST = 20;             // flancos visibles en el cronograma
  var uid = 0;

  function agrupar(n) {
    var s = String(Math.abs(n));
    if (s.length >= 5) s = s.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
    return (n < 0 ? '−' : '') + s;
  }
  function hex4(v) { var s = ((v & 0xFFFF) >>> 0).toString(16).toUpperCase(); while (s.length < 4) s = '0' + s; return '0x' + s; }
  function bin(v, n) { var s = (v >>> 0).toString(2); while (s.length < n) s = '0' + s; return s; }
  function mod(a, n) { return ((a % n) + n) % n; }
  function pintarCodigo(pre, texto) {
    pre.innerHTML = '<code class="lang-c"></code>';
    pre.firstChild.textContent = texto;
    if (MPI.resaltarTodo) MPI.resaltarTodo(pre);
  }
  function pad(s, n) { s = String(s); while (s.length < n) s += ' '; return s; }

  // QEICON a partir de las opciones
  function qeiconDe(x4, reset) {
    var qeim = 4 | (x4 ? 2 : 0) | (reset === 'maxcnt' ? 1 : 0);
    var posres = reset === 'indice' ? 1 : 0;
    return (qeim << 8) | (posres << 2);
  }
  var TXT_QEIM = {
    0: 'QEI/timer apagado', 1: 'timer de 16 bits', 2: 'sin uso (apagado)', 3: 'sin uso (apagado)',
    4: 'QEI x2, reset por índice', 5: 'QEI x2, reset por MAXCNT', 6: 'QEI x4, reset por índice', 7: 'QEI x4, reset por MAXCNT'
  };
  // Campos de QEI1CON (datasheet, registro 16-1)
  var CAMPOS = [
    { b: [15], n: 'CNTERR', d: 'flag de error de cuenta (solo QEIM = 110 o 100)' },
    { b: [14], n: '—', d: 'no implementado' },
    { b: [13], n: 'QEISIDL', d: '1 = se para en modo Idle' },
    { b: [12], n: 'INDEX', d: 'estado del pin de índice (solo lectura)' },
    { b: [11], n: 'UPDN', d: 'sentido: 1 = +, 0 = − (solo lectura con QEIM = 1xx)' },
    { b: [10, 9, 8], n: 'QEIM', d: 'modo' },
    { b: [7], n: 'SWPAB', d: '1 = intercambia A y B' },
    { b: [6], n: 'PCDOUT', d: '1 = saca UPDN por un pin' },
    { b: [5], n: 'TQGATE', d: 'modo timer con puerta' },
    { b: [4, 3], n: 'TQCKPS', d: 'pre-escalado (solo modo timer)' },
    { b: [2], n: 'POSRES', d: '1 = el índice resetea POSCNT (QEIM = 100 o 110)' },
    { b: [1], n: 'TQCS', d: 'reloj del timer: 0 = TCY, 1 = pin QEA' },
    { b: [0], n: 'UPDN_SRC', d: 'origen del sentido en modo timer' }
  ];

  MPI.componentes['sim-encoder'] = function (el, cfg) {
    cfg = cfg || {};
    var id = 'sen' + (++uid);
    var reducido = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    var N = Math.max(1, Math.min(NMAX, Math.round(Number(cfg.ranuras) || 4000)));
    var x4 = String(cfg.modo).toLowerCase() === 'x4';
    var reset = cfg.reset === 'maxcnt' || cfg.reset === 'libre' ? cfg.reset : 'indice';

    // ---------- estado ----------
    var pos, poscnt, vueltas, nIrq, ultimoIrq, updn, hist;
    var girando = 0, velQ = 2, corriendo = false, ultimo = null, visible = true;

    function maxcnt() { return (x4 ? 4 : 2) * N - 1; }
    function senales(q) {
      var m = mod(q, 4);
      var r = mod(q, 4 * N);
      return { A: m <= 1 ? 1 : 0, B: (m === 1 || m === 2) ? 1 : 0, I: (r === 4 * N - 1 || r === 0) ? 1 : 0 };
    }
    function reiniciar() {
      pos = 0.5; poscnt = 0; vueltas = 0; nIrq = 0; ultimoIrq = ''; updn = 1;
      var s = senales(0);
      hist = [{ A: s.A, B: s.B, I: s.I, c: false, v: 0, irq: false, d: 1 }];
    }

    // Un flanco: el eje cruza la frontera entre los cuadrantes qa y qa + dir
    function flanco(qa, dir) {
      var qb = qa + dir;
      var frontera = dir > 0 ? qb : qa;          // cuadrante "alto" de la frontera
      var m = mod(frontera, 4);
      var esA = (m === 0 || m === 2);             // flanco de A (si no, de B)
      var cuenta = x4 || esA;
      var vuelta = mod(frontera, 4 * N) === 0;   // frontera de vuelta: flanco de A junto al índice
      var irq = false, mx = maxcnt();
      updn = dir > 0 ? 1 : 0;
      if (reset === 'indice' && vuelta) {
        poscnt = dir > 0 ? 0 : mx; irq = true;
      } else if (cuenta) {
        if (reset === 'maxcnt') {
          if (dir > 0) { if (poscnt === mx) { poscnt = 0; irq = true; } else poscnt = (poscnt + 1) & 0xFFFF; }
          else { if (poscnt === 0) { poscnt = mx; irq = true; } else poscnt = (poscnt - 1) & 0xFFFF; }
        } else {
          poscnt = (poscnt + dir) & 0xFFFF;
        }
      }
      if (irq) {
        nIrq++;
        vueltas += dir > 0 ? 1 : -1;
        ultimoIrq = (reset === 'indice' ? (dir > 0 ? 'Índice (subiendo: POSCNT = 0)' : 'Índice (bajando: POSCNT = MAXCNT, supuesto)') : (dir > 0 ? 'POSCNT pasa de MAXCNT a 0' : 'POSCNT pasa de 0 a MAXCNT')) +
          ' → QEIIF = 1 → _QEIInterrupt: UPDN = ' + updn + ', vueltas ' + (dir > 0 ? '+' : '−') + '1';
      }
      var s = senales(qb);
      hist.push({ A: s.A, B: s.B, I: s.I, c: cuenta || (reset === 'indice' && vuelta), v: poscnt, irq: irq, d: dir, esA: esA });
      if (hist.length > HIST + 1) hist.splice(0, hist.length - HIST - 1);
    }
    // Avanza la posición (en cuartos) procesando cada flanco en orden
    function mover(delta) {
      var destino = pos + delta;
      var qa = Math.floor(pos), qd = Math.floor(destino), n = 0;
      while (qa !== qd && n < 300000) {
        var dir = qd > qa ? 1 : -1;
        flanco(qa, dir);
        qa += dir; n++;
      }
      pos = qa === qd ? destino : qa + 0.5;
      return n;
    }
    function paso(dir) {
      // al centro del cuadrante siguiente
      var q = Math.floor(pos) + dir;
      mover(q + 0.5 - pos);
    }

    // ---------- HTML ----------
    el.classList.add('mpi-sim-encoder');
    el.innerHTML =
      '<div class="mpi-sim-cab">Encoder incremental y módulo QEI <span class="sen-sub">POSCNT cuenta los flancos de A y B</span></div>' +
      '<div class="sen-ctl">' +
        '<div class="sen-fila">' +
          '<label for="' + id + '-n">Ranuras N <input id="' + id + '-n" class="sen-n" type="number" min="1" max="' + NMAX + '" step="1" aria-describedby="' + id + '-nerr"></label>' +
          '<label>Resolución <select class="sen-modo" aria-label="Resolución"><option value="x2">x2 (flancos de A)</option><option value="x4">x4 (flancos de A y B)</option></select></label>' +
          '<label>Reset de POSCNT <select class="sen-reset" aria-label="Reset de POSCNT">' +
            '<option value="indice">por índice (POSRES = 1)</option><option value="maxcnt">por MAXCNT</option><option value="libre">índice sin reset (POSRES = 0)</option></select></label>' +
        '</div>' +
        '<p class="sen-err" id="' + id + '-nerr" role="alert"></p>' +
        '<div class="sen-fila sen-mov" role="group" aria-label="Mover el encoder">' +
          '<button type="button" class="sen-p-" aria-label="Retroceder un flanco">◀ 1 flanco</button>' +
          '<button type="button" class="sen-p+" aria-label="Avanzar un flanco">1 flanco ▶</button>' +
          '<button type="button" class="sen-g-" aria-pressed="false">◀◀ Girar −</button>' +
          '<button type="button" class="sen-g+" aria-pressed="false">Girar + ▶▶</button>' +
          '<label>Velocidad <select class="sen-vel" aria-label="Velocidad de giro"></select></label>' +
          '<button type="button" class="sen-ind">Ir al índice</button>' +
          '<button type="button" class="sen-rst">Reiniciar</button>' +
        '</div>' +
      '</div>' +
      '<div class="sen-cuerpo">' +
        '<figure class="sen-fig"><div class="sen-rueda"></div><p class="sen-nota-r"></p></figure>' +
        '<div class="sen-der">' +
          '<figure class="sen-fig"><div class="sen-tira"></div><figcaption>Ampliación bajo los sensores (ranuras reales; arrastra para girar)</figcaption></figure>' +
          '<div class="sen-estado"></div>' +
        '</div>' +
      '</div>' +
      '<figure class="sen-fig sen-fig-cr"><div class="sen-crono"></div><figcaption>Cronograma de los últimos ' + HIST + ' flancos (eje horizontal: flancos, no tiempo)</figcaption></figure>' +
      '<div class="sen-irq" aria-live="polite"></div>' +
      '<div class="sen-leds-caja"><div class="sen-leds"></div><p class="sen-leds-t"></p></div>' +
      '<section class="sen-reg" aria-labelledby="' + id + '-qt"><h4 id="' + id + '-qt">QEICON (= QEI1CON, 0x01E0)</h4><div class="sen-bits"></div><div class="sen-campos"></div></section>' +
      '<pre class="sen-codigo"></pre>';

    function $(s) { return el.querySelector(s); }
    var inN = $('.sen-n'), errN = $('.sen-err'), selModo = $('.sen-modo'), selReset = $('.sen-reset'), selVel = $('.sen-vel');
    var bMenos = el.querySelector('.sen-p-'), bMas = el.querySelector('.sen-p\\+'), gMenos = el.querySelector('.sen-g-'), gMas = el.querySelector('.sen-g\\+');
    var bInd = $('.sen-ind'), bRst = $('.sen-rst');
    var divRueda = $('.sen-rueda'), notaR = $('.sen-nota-r'), divTira = $('.sen-tira'), divEstado = $('.sen-estado');
    var divCrono = $('.sen-crono'), divIrq = $('.sen-irq'), divLeds = $('.sen-leds'), ledsT = $('.sen-leds-t');
    var divBits = $('.sen-bits'), divCampos = $('.sen-campos'), preCod = $('.sen-codigo');

    function opcionesVel() {
      var ops = [[2, '0,5 ciclos de A/s'], [8, '2 ciclos de A/s'], [32, '8 ciclos de A/s'], [4 * N / 5, '1 vuelta en 5 s'], [4 * N / 1.5, '1 vuelta en 1,5 s']];
      var actual = selVel.value;
      selVel.innerHTML = ops.map(function (o, i) { return '<option value="' + i + '" data-q="' + o[0] + '">' + o[1] + '</option>'; }).join('');
      selVel.value = actual || '1';
      velQ = +selVel.options[selVel.selectedIndex].getAttribute('data-q');
    }

    // ---------- rueda (SVG) ----------
    var CX = 110, CY = 112;
    function pt(r, a) { var t = 2 * Math.PI * a; return [(CX - r * Math.sin(t)).toFixed(2), (CY - r * Math.cos(t)).toFixed(2)]; }
    function sector(r1, r2, a0, a1) {
      // a en vueltas, sentido antihorario desde arriba (coordenada de la rueda)
      var p1 = pt(r2, a0), p2 = pt(r2, a1), p3 = pt(r1, a1), p4 = pt(r1, a0);
      var g = (a1 - a0) > 0.5 ? 1 : 0;
      return 'M' + p1 + ' A' + r2 + ',' + r2 + ' 0 ' + g + ' 0 ' + p2 + ' L' + p3 + ' A' + r1 + ',' + r1 + ' 0 ' + g + ' 1 ' + p4 + ' Z';
    }
    var gRueda = null, ledA = null, ledB = null, ledI = null;
    function pintarRueda() {
      var nd = Math.min(N, NDIB);
      var h = '<svg viewBox="0 0 220 226" class="sen-svg sen-rueda-svg" role="slider" tabindex="0" aria-valuemin="0" aria-valuemax="65535" ' +
        'aria-label="Rueda del encoder: arrastra o usa las flechas para girar un flanco (Re Pág / Av Pág: un ciclo)">';
      h += '<g class="sen-rg"><circle cx="' + CX + '" cy="' + CY + '" r="96" class="sen-disco"/>';
      for (var k = 0; k < nd; k++) {
        // hueco de la ranura: coordenada de la rueda [k, k + 0,5) / nd (en sentido antihorario)
        h += '<path d="' + sector(74, 92, (k) / nd, (k + 0.5) / nd) + '" class="sen-hueco"/>';
      }
      h += '<path d="' + sector(56, 66, 1 - 0.25 / nd, 1 + 0.25 / nd) + '" class="sen-hueco sen-hueco-i"/>';
      h += '<circle cx="' + CX + '" cy="' + CY + '" r="40" class="sen-cubo"/><circle cx="' + CX + '" cy="' + CY + '" r="7" class="sen-eje"/>' +
        '<line x1="' + CX + '" y1="' + (CY - 7) + '" x2="' + CX + '" y2="' + (CY - 38) + '" class="sen-marca"/></g>';
      // sensores (fijos, arriba)
      h += '<rect x="' + (CX - 7) + '" y="6" width="14" height="10" rx="2" class="sen-sensor"/>' +
        '<circle cx="' + CX + '" cy="11" r="3.5" class="sen-luz sen-luz-a"/>' +
        '<text x="' + (CX - 11) + '" y="14" class="sen-r-t" text-anchor="end">A</text>' +
        '<rect x="' + (CX + 9) + '" y="6" width="14" height="10" rx="2" class="sen-sensor"/>' +
        '<circle cx="' + (CX + 16) + '" cy="11" r="3.5" class="sen-luz sen-luz-b"/>' +
        '<text x="' + (CX + 27) + '" y="14" class="sen-r-t">B</text>' +
        '<rect x="' + (CX - 5) + '" y="' + (CY - 70) + '" width="10" height="9" rx="2" class="sen-sensor"/>' +
        '<circle cx="' + CX + '" cy="' + (CY - 65.5) + '" r="3" class="sen-luz sen-luz-i"/>' +
        '<text x="' + (CX + 8) + '" y="' + (CY - 62) + '" class="sen-r-t sen-r-ti">INDX</text>' +
        '<path d="M204.2,156 A104,104 0 0 1 162,202" class="sen-flecha" marker-end="url(#' + id + '-fl)"/>' +
        '<text x="196" y="200" class="sen-r-t">+</text>' +
        '<defs><marker id="' + id + '-fl" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0,0 L10,5 L0,10 z" class="sen-flecha-m"/></marker></defs>';
      divRueda.innerHTML = h + '</svg>';
      gRueda = divRueda.querySelector('.sen-rg');
      ledA = divRueda.querySelector('.sen-luz-a'); ledB = divRueda.querySelector('.sen-luz-b'); ledI = divRueda.querySelector('.sen-luz-i');
      notaR.innerHTML = N > NDIB
        ? 'Se dibujan ' + NDIB + ' de las ' + agrupar(N) + ' ranuras (rueda esquemática; gira con el ángulo real). La ampliación muestra las ranuras reales.'
        : 'Rueda de ' + N + ' ranura' + (N === 1 ? '' : 's') + ' a escala. Sentido + (A adelanta a B): horario.';
      activarArrastreRueda();
    }

    // ---------- tira ampliada ----------
    var TW = 360, TCX = 150, P = 56;   // P = píxeles por ranura
    function pintarTira() {
      var v = pos / 4;   // coordenada de la rueda bajo A, en ranuras
      var h = '<svg viewBox="0 0 ' + TW + ' 118" class="sen-svg" role="img" aria-label="Ampliación: ranuras bajo los sensores A, B e índice">';
      var y1 = 20, y2 = 58, yi1 = 72, yi2 = 90;
      h += '<rect x="0" y="' + y1 + '" width="' + TW + '" height="' + (y2 - y1) + '" class="sen-t-disco"/>' +
        '<rect x="0" y="' + yi1 + '" width="' + TW + '" height="' + (yi2 - yi1) + '" class="sen-t-disco"/>';
      var kmin = Math.floor(v - (TW - TCX) / P) - 1, kmax = Math.ceil(v + TCX / P) + 1;
      for (var k = kmin; k <= kmax; k++) {
        var xa = TCX - (k + 0.5 - v) * P, xb = TCX - (k - v) * P;
        h += '<rect x="' + xa.toFixed(1) + '" y="' + y1 + '" width="' + (P / 2) + '" height="' + (y2 - y1) + '" class="sen-hueco"/>';
        if (mod(k, N) === 0) {
          // ventana del índice: [k − 0,25, k + 0,25) en ranuras (medio ciclo, AB = 00 y 10)
          var xi = TCX - (k + 0.25 - v) * P;
          h += '<rect x="' + xi.toFixed(1) + '" y="' + yi1 + '" width="' + (P / 2) + '" height="' + (yi2 - yi1) + '" class="sen-hueco sen-hueco-i"/>' +
            '<text x="' + (xi + P / 4).toFixed(1) + '" y="' + (yi2 + 11) + '" class="sen-t-t" text-anchor="middle">vuelta ' + agrupar(Math.round(k / N)) + '</text>';
        }
        if (xb > -20 && xb < TW + 20 && N <= 9999) {
          h += '<text x="' + (xa + P / 4).toFixed(1) + '" y="' + (y2 - 4) + '" class="sen-t-k" text-anchor="middle">' + mod(k, N) + '</text>';
        }
      }
      var s = senales(Math.floor(pos));
      function sensor(x, y, nom, on, izq) {
        return '<line x1="' + x + '" y1="' + (y - 12) + '" x2="' + x + '" y2="' + (y + 40) + '" class="sen-haz' + (on ? ' sen-haz-on' : '') + '"/>' +
          '<circle cx="' + x + '" cy="' + (y - 12) + '" r="4" class="sen-luz' + (on ? ' sen-on' : '') + '"/>' +
          '<text x="' + (izq ? x - 7 : x + 7) + '" y="' + (y - 8) + '" class="sen-t-s" text-anchor="' + (izq ? 'end' : 'start') + '">' + nom + ' = ' + on + '</text>';
      }
      h += sensor(TCX, y1 - 2, 'A', s.A, true) + sensor(TCX + P / 4, y1 - 2, 'B', s.B, false);
      h += '<line x1="' + TCX + '" y1="' + (yi1 - 6) + '" x2="' + TCX + '" y2="' + (yi2 + 2) + '" class="sen-haz' + (s.I ? ' sen-haz-on' : '') + '"/>' +
        '<text x="' + (TCX - 6) + '" y="' + (yi1 + 13) + '" class="sen-t-s" text-anchor="end">INDX = ' + s.I + '</text>';
      divTira.innerHTML = h + '</svg>';
    }

    // ---------- cronograma ----------
    function pintarCrono() {
      var X0 = 46, X1 = 354, W = (X1 - X0) / HIST;
      var filas = { A: 14, B: 40, I: 66, U: 92 };   // y del nivel bajo
      var hA = 14;
      var h = '<svg viewBox="0 0 360 150" class="sen-svg" role="img" aria-label="' + textoCrono() + '">';
      h += '<text x="2" y="' + (filas.A - 3) + '" class="sen-c-n">QEA</text><text x="2" y="' + (filas.B - 3) + '" class="sen-c-n">QEB</text>' +
        '<text x="2" y="' + (filas.I - 3) + '" class="sen-c-n">INDX</text><text x="2" y="' + (filas.U - 3) + '" class="sen-c-n">UPDN</text>' +
        '<text x="2" y="' + 122 + '" class="sen-c-n">POSCNT</text>';
      var n = hist.length;
      var off = HIST + 1 - n;   // alinea a la derecha
      function traza(campo, yb, cls) {
        var pts = [];
        for (var i = 0; i < n; i++) {
          var x0 = X0 + (off + i - 1) * W, x1 = x0 + W;
          if (x0 < X0) x0 = X0;
          if (x1 <= X0) continue;
          var y = hist[i][campo] ? yb - hA : yb;
          pts.push([x0, y], [x1, y]);
        }
        return '<polyline points="' + pts.map(function (p) { return p[0].toFixed(1) + ',' + p[1]; }).join(' ') + '" class="' + cls + '"/>';
      }
      // UPDN como campo
      for (var i = 0; i < n; i++) hist[i].u = hist[i].d > 0 ? 1 : 0;
      for (var j = 1; j < n; j++) {
        var xe = X0 + (off + j - 1) * W;
        if (xe < X0) continue;
        var e = hist[j];
        if (e.c) h += '<line x1="' + xe.toFixed(1) + '" y1="2" x2="' + xe.toFixed(1) + '" y2="130" class="sen-c-cuenta"/>';
        if (e.irq) h += '<line x1="' + xe.toFixed(1) + '" y1="2" x2="' + xe.toFixed(1) + '" y2="140" class="sen-c-irq"/>' +
          '<text x="' + (xe > 320 ? xe - 2 : xe + 2).toFixed(1) + '" y="146" class="sen-c-irqt"' + (xe > 320 ? ' text-anchor="end"' : '') + '>QEIIF</text>';
      }
      h += traza('A', filas.A, 'sen-c-a') + traza('B', filas.B, 'sen-c-b') + traza('I', filas.I, 'sen-c-i') + traza('u', filas.U, 'sen-c-u');
      // bus POSCNT
      var yb0 = 108, yb1 = 128, seg = [];
      for (var k = 0; k < n; k++) {
        if (k === 0 || hist[k].v !== hist[k - 1].v || hist[k].c) seg.push({ i: k, v: hist[k].v });
      }
      seg.forEach(function (sg, q) {
        var xa = X0 + (off + sg.i - 1) * W, xb = q + 1 < seg.length ? X0 + (off + seg[q + 1].i - 1) * W : X1;
        if (xa < X0) xa = X0;
        if (xb <= xa) return;
        var c = Math.min(3, (xb - xa) / 2);
        h += '<path d="M' + xa.toFixed(1) + ',' + ((yb0 + yb1) / 2) + ' L' + (xa + c).toFixed(1) + ',' + yb0 + ' L' + (xb - c).toFixed(1) + ',' + yb0 + ' L' + xb.toFixed(1) + ',' + ((yb0 + yb1) / 2) +
          ' L' + (xb - c).toFixed(1) + ',' + yb1 + ' L' + (xa + c).toFixed(1) + ',' + yb1 + ' Z" class="sen-c-bus"/>';
        var txt = String(sg.v);
        if (xb - xa >= txt.length * 5.6 + 4) h += '<text x="' + ((xa + xb) / 2).toFixed(1) + '" y="' + (yb1 - 6) + '" class="sen-c-v" text-anchor="middle">' + txt + '</text>';
      });
      divCrono.innerHTML = h + '</svg>';
    }
    function textoCrono() {
      var e = hist[hist.length - 1];
      return 'Cronograma: ahora QEA = ' + e.A + ', QEB = ' + e.B + ', INDX = ' + e.I + ', UPDN = ' + updn + ', POSCNT = ' + poscnt + '.';
    }

    // ---------- estado, LEDs ----------
    var claveEstado = '';
    function pintarEstado() {
      var mx = maxcnt(), s = senales(Math.floor(pos));
      gRueda.setAttribute('transform', 'rotate(' + (mod(pos / (4 * N), 1) * 360).toFixed(3) + ' ' + CX + ' ' + CY + ')');
      var clave = [poscnt, updn, vueltas, nIrq, s.A, s.B, s.I, mx, reset].join(':');
      if (clave === claveEstado) return;
      claveEstado = clave;
      var p32 = vueltas * (mx + 1) + poscnt;
      var h = '<div class="sen-vals">' +
        '<div><span>POSCNT</span><b>' + agrupar(poscnt) + '</b> <code>' + hex4(poscnt) + '</code></div>' +
        '<div><span>UPDN</span><b>' + updn + '</b> ' + (updn ? '(+ · A adelanta)' : '(− · B adelanta)') + '</div>' +
        '<div><span>MAXCNT</span><b>' + agrupar(mx) + '</b> <code>' + hex4(mx) + '</code> = ' + (x4 ? 4 : 2) + '·N − 1</div>' +
        '<div><span>vueltas</span><b>' + agrupar(vueltas) + '</b> <small>(ISR, ' + nIrq + (nIrq === 1 ? ' interrupción' : ' interrupciones') + ')</small></div>' +
        (reset === 'libre'
          ? '<div class="sen-v32"><span>32 bits</span><small>Sin reset ni interrupción por índice no hay vueltas que contar: POSCNT da la vuelta en 16 bits.</small></div>'
          : '<div class="sen-v32"><span>32 bits</span><b>' + agrupar(p32) + '</b> <small>= ' + agrupar(vueltas) + ' · ' + agrupar(mx + 1) + ' + ' + agrupar(poscnt) + '</small></div>') +
        '</div>';
      divEstado.innerHTML = h;
      ledA.classList.toggle('sen-on', !!s.A); ledB.classList.toggle('sen-on', !!s.B); ledI.classList.toggle('sen-on', !!s.I);
      divRueda.firstChild.setAttribute('aria-valuenow', String(poscnt));
      divRueda.firstChild.setAttribute('aria-valuetext', 'POSCNT = ' + poscnt + ', A = ' + s.A + ', B = ' + s.B + ', índice = ' + s.I);
      // LEDs: PORTB = POSCNT << 12
      var portb = (poscnt << 12) & 0xFFFF;
      var l = '';
      [15, 14, 13, 12].forEach(function (rb) {
        var bit = (portb >> rb) & 1, nom = 'D' + (21 - rb);
        l += '<div class="sen-led-c' + (bit ? '' : ' sen-led-on') + '" aria-label="' + nom + ' (RB' + rb + ' = ' + bit + '): ' + (bit ? 'apagado' : 'encendido') + '">' +
          '<span class="sen-led" aria-hidden="true"></span><span class="sen-led-n">' + nom + '</span><span class="sen-led-p">RB' + rb + ' = ' + bit + '</span></div>';
      });
      divLeds.innerHTML = l;
      ledsT.innerHTML = '<code>PORTB = get_enc() &lt;&lt; 12;</code> → PORTB = <b>' + hex4(portb) + '</b>: los 4 bits bajos de POSCNT (' + bin(poscnt & 15, 4) + ') en RB15-RB12. Activos a nivel bajo: lucen los bits a 0.';
      divIrq.innerHTML = ultimoIrq ? '<p class="sen-irq-t"><b>Última interrupción:</b> ' + ultimoIrq + '</p>' : '';
    }

    // ---------- QEICON ----------
    function pintarRegistro() {
      var w = qeiconDe(x4, reset);
      var leido = w | (updn << 11) | (senales(Math.floor(pos)).I << 12);
      var celdas = '';
      for (var b = 15; b >= 0; b--) {
        var c = CAMPOS.filter(function (f) { return f.b.indexOf(b) >= 0; })[0];
        var bitW = (w >> b) & 1;
        var nom = c.n === 'QEIM' ? 'QEIM' + (b - 8) : (c.n === 'TQCKPS' ? 'TQCKPS' + (b - 3) : c.n);
        celdas += '<div class="sen-bit' + (bitW ? ' sen-bit-1' : '') + (c.n === '—' ? ' sen-bit-u' : '') + (c.n === 'QEIM' ? ' sen-bit-q' : '') + '">' +
          '<span class="sen-bit-n">' + b + '</span><span class="sen-bit-v">' + bitW + '</span><span class="sen-bit-t">' + nom + '</span></div>';
      }
      divBits.innerHTML = '<div class="sen-bits-g" role="img" aria-label="QEICON = ' + hex4(w) + ' en binario ' + bin(w, 16) + '">' + celdas + '</div>' +
        '<p class="sen-qval">Valor escrito: <b>' + hex4(w) + '</b> · leído ahora: <b>' + hex4(leido) + '</b> <small>(UPDN y INDEX son bits de estado)</small></p>';
      var qeim = (w >> 8) & 7;
      divCampos.innerHTML = '<ul class="sen-campos-l">' +
        '<li><code>QEIM&lt;2:0&gt; = ' + bin(qeim, 3) + '</code>: ' + TXT_QEIM[qeim] + ' (bit 10 = 1: módulo activo; bit 9: ' + (x4 ? '1 → x4' : '0 → x2') + '; bit 8: ' + (qeim & 1 ? '1 → reset por MAXCNT' : '0 → reset por índice') + ')</li>' +
        '<li><code>POSRES = ' + ((w >> 2) & 1) + '</code>: ' + ((w >> 2) & 1 ? 'el índice pone POSCNT a 0' : 'el índice no resetea POSCNT') + (qeim & 1 ? ' (no aplica con QEIM = 1x1)' : '') + '</li>' +
        '<li><code>SWPAB = 0</code>, <code>PCDOUT = 0</code>, <code>TQGATE = 0</code>, <code>TQCKPS = 00</code>, <code>TQCS = 0</code>, <code>UPDN_SRC = 0</code>: valores por defecto (los de timer no se usan en modo QEI).</li>' +
        '<li>Interrupción: <code>IFS3bits.QEIIF</code> (bit 10), <code>IEC3bits.QEIIE</code>, rutina <code>_QEIInterrupt</code>.</li>' +
        '</ul>';
    }

    // ---------- código ----------
    function pintarCod() {
      var w = qeiconDe(x4, reset), mx = maxcnt();
      var L = [];
      L.push('/* Remapeo de las entradas (pines de ejemplo: QEA = RP6, QEB = RP7, INDX = RP8) */');
      L.push('__builtin_write_OSCCONL(OSCCON & ~0x40);  // desbloquea el remapeo');
      L.push('RPINR14bits.QEA1R = 6;                    // RPINR14<4:0>');
      L.push('RPINR14bits.QEB1R = 7;                    // RPINR14<12:8>');
      L.push('RPINR15bits.INDX1R = 8;                   // RPINR15<4:0>');
      L.push('__builtin_write_OSCCONL(OSCCON | 0x40);   // bloquea');
      L.push('');
      L.push('/* Inicialización con las opciones elegidas (' + agrupar(N).replace(/ /g, '') + ' ranuras) */');
      L.push(pad('MAXCNT = ' + mx + ';', 26) + '// MAX1CNT = ' + (x4 ? 4 : 2) + '*n_ranuras - 1');
      L.push(pad('POSCNT = 0;', 26) + '// POS1CNT');
      L.push(pad('QEICON = ' + hex4(w) + ';', 26) + '// QEI1CON: ' + TXT_QEIM[(w >> 8) & 7] + (reset === 'indice' ? ', POSRES = 1' : ''));
      L.push('IFS3bits.QEIIF = 0;');
      L.push('IEC3bits.QEIIE = 1;');
      if (reset !== 'libre') {
        L.push('');
        L.push('/* Ampliación: cuenta de 32 bits con la interrupción del QEI */');
        L.push('volatile int vueltas = 0;');
        L.push('');
        L.push('void __attribute__((interrupt, no_auto_psv)) _QEIInterrupt(void)');
        L.push('{');
        L.push('    IFS3bits.QEIIF = 0;');
        L.push('    if (QEICON & 0x0800) vueltas++;      // UPDN = 1: sentido +');
        L.push('    else vueltas--;');
        L.push('}');
        L.push('');
        L.push('long get_enc32(void)');
        L.push('{');
        L.push('    long pos;');
        L.push('    IEC3bits.QEIIE = 0;                  // vueltas y POSCNT coherentes');
        L.push('    pos = (long)vueltas * ' + (mx + 1) + 'L + POSCNT;   // vueltas*(MAXCNT+1) + POSCNT');
        L.push('    IEC3bits.QEIIE = 1;');
        L.push('    return pos;');
        L.push('}');
      }
      pintarCodigo(preCod, L.join('\n'));
    }

    // ---------- refresco ----------
    var claveCrono = '';
    function refrescar(forzar) {
      pintarTira();
      pintarEstado();
      var k = hist.length + ':' + nIrq + ':' + poscnt + ':' + pos.toFixed(0) + ':' + x4 + reset;
      if (forzar || k !== claveCrono) { claveCrono = k; pintarCrono(); pintarRegistro(); }
    }
    function aplicarOpciones() {
      parar();
      claveEstado = '';
      reiniciar();
      opcionesVel();
      pintarRueda();
      pintarCod();
      refrescar(true);
    }

    // ---------- animación ----------
    function frame(ts) {
      if (!document.body.contains(el)) { corriendo = false; return; }
      if (!girando || !visible) { corriendo = false; ultimo = null; return; }
      if (ultimo == null) ultimo = ts;
      var dt = Math.min(0.1, Math.max(0, (ts - ultimo) / 1000));
      ultimo = ts;
      mover(girando * velQ * dt);
      refrescar(false);
      requestAnimationFrame(frame);
    }
    function arrancar() {
      if (corriendo || !girando || !visible) return;
      corriendo = true; ultimo = null;
      requestAnimationFrame(frame);
    }
    function pintarBotones() {
      gMas.setAttribute('aria-pressed', String(girando > 0));
      gMenos.setAttribute('aria-pressed', String(girando < 0));
      gMas.textContent = girando > 0 ? '⏸ Parar' : 'Girar + ▶▶';
      gMenos.textContent = girando < 0 ? '⏸ Parar' : '◀◀ Girar −';
    }
    function parar() { girando = 0; pintarBotones(); }

    // ---------- arrastre ----------
    function activarArrastreRueda() {
      var svg = divRueda.firstChild;
      var arr = null;
      function ang(e) {
        var r = svg.getBoundingClientRect();
        var esc = r.width / 220;
        var dx = e.clientX - (r.left + CX * esc), dy = e.clientY - (r.top + CY * esc);
        return Math.atan2(dx, -dy) / (2 * Math.PI);   // vueltas, horario desde arriba
      }
      svg.addEventListener('pointerdown', function (e) {
        parar();
        arr = { a: ang(e) };
        if (svg.setPointerCapture) svg.setPointerCapture(e.pointerId);
        e.preventDefault();
      });
      svg.addEventListener('pointermove', function (e) {
        if (!arr) return;
        var a = ang(e), d = a - arr.a;
        if (d > 0.5) d -= 1; else if (d < -0.5) d += 1;
        arr.a = a;
        if (d) { mover(d * 4 * N); refrescar(false); }
      });
      function fin() { arr = null; }
      svg.addEventListener('pointerup', fin);
      svg.addEventListener('pointercancel', fin);
      svg.addEventListener('keydown', function (e) {
        var d = 0;
        if (e.key === 'ArrowRight' || e.key === 'ArrowUp') d = 1;
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') d = -1;
        else if (e.key === 'PageUp') d = 4;
        else if (e.key === 'PageDown') d = -4;
        if (!d) return;
        e.preventDefault();
        parar();
        var s = d > 0 ? 1 : -1;
        for (var i = 0; i < Math.abs(d); i++) paso(s);
        refrescar(false);
      });
    }
    (function arrastreTira() {
      var arr = null;
      divTira.addEventListener('pointerdown', function (e) {
        parar();
        arr = { x: e.clientX };
        if (divTira.setPointerCapture) divTira.setPointerCapture(e.pointerId);
        e.preventDefault();
      });
      divTira.addEventListener('pointermove', function (e) {
        if (!arr) return;
        var r = divTira.getBoundingClientRect();
        var esc = TW / Math.max(1, r.width);
        var d = (e.clientX - arr.x) * esc;
        arr.x = e.clientX;
        if (d) { mover(4 * d / P); refrescar(false); }
      });
      function fin() { arr = null; }
      divTira.addEventListener('pointerup', fin);
      divTira.addEventListener('pointercancel', fin);
    })();

    // ---------- eventos ----------
    function leerN() {
      var v = Number(String(inN.value).replace(',', '.'));
      if (!isFinite(v) || v < 1 || v > NMAX || Math.round(v) !== v) {
        errN.textContent = 'Escribe un número entero de ranuras entre 1 y ' + agrupar(NMAX) + ' (4·N − 1 debe caber en los 16 bits de MAXCNT).';
        inN.setAttribute('aria-invalid', 'true');
        return;
      }
      errN.textContent = ''; inN.removeAttribute('aria-invalid');
      if (v === N) return;
      N = v;
      aplicarOpciones();
    }
    inN.addEventListener('change', leerN);
    inN.addEventListener('keydown', function (e) { if (e.key === 'Enter') leerN(); });
    selModo.addEventListener('change', function () { x4 = selModo.value === 'x4'; aplicarOpciones(); });
    selReset.addEventListener('change', function () { reset = selReset.value; aplicarOpciones(); });
    selVel.addEventListener('change', function () { velQ = +selVel.options[selVel.selectedIndex].getAttribute('data-q'); });
    bMas.addEventListener('click', function () { parar(); paso(1); refrescar(false); });
    bMenos.addEventListener('click', function () { parar(); paso(-1); refrescar(false); });
    gMas.addEventListener('click', function () { girando = girando > 0 ? 0 : 1; pintarBotones(); arrancar(); });
    gMenos.addEventListener('click', function () { girando = girando < 0 ? 0 : -1; pintarBotones(); arrancar(); });
    bInd.addEventListener('click', function () {
      // lleva el eje a 3 flancos antes del índice en el sentido actual
      var dir = updn ? 1 : -1, q = Math.floor(pos), Q = 4 * N, destino;
      if (dir > 0) { destino = (Math.floor(q / Q) + 1) * Q - 3; if (destino <= q) destino += Q; }
      else { destino = Math.floor(q / Q) * Q + 2; if (destino >= q) destino -= Q; }
      parar();
      mover(destino + 0.5 - pos);
      refrescar(true);
    });
    bRst.addEventListener('click', function () {
      parar(); reiniciar(); claveEstado = ''; refrescar(true);
    });
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (ents) {
        if (!document.body.contains(el)) { io.disconnect(); return; }
        visible = ents[ents.length - 1].isIntersecting;
        if (visible) arrancar();
      });
      io.observe(el);
    }
    if (reducido) el.classList.add('sen-reducido');

    // ---------- inicio ----------
    inN.value = String(N);
    selModo.value = x4 ? 'x4' : 'x2';
    selReset.value = reset;
    aplicarOpciones();
  };
})();
