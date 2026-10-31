/*
 * Componente "cola-circular": las dos colas circulares del driver uart.c de la
 * Práctica 7 (recepción y transmisión) y el camino hardware de la UART1 del
 * dsPIC33FJ32MC202 (FIFO de 4 niveles de U1TXREG, registro de desplazamiento y
 * línea U1TX).
 *
 * Uso:
 *   <div class="mpi-mount" data-componente="cola-circular"
 *        data-config='{"tam":8,"real":200,"modo":"uart"}'></div>
 *
 * Claves de data-config (todas opcionales):
 *   tam      posiciones dibujadas de cada cola (defecto 8; de 4 a 32). Hasta 16 se
 *            dibujan en anillo; se puede cambiar a fila.
 *   real     tamaño real del driver (TAM_REC_UART = TAM_TR_UART = 200). Solo texto.
 *   modo     "uart" (defecto: las dos colas), "rx" (solo recepción) o "tx" (solo transmisión).
 *   baudios  velocidad para el tiempo de cada byte en la línea (defecto 38400).
 *
 * Modelo (driver de la Práctica 7):
 *   - ui_icabeza_*: dónde escribe quien pone; ui_icola_*: dónde lee quien saca.
 *     Ambos índices vuelven a 0 al llegar a TAM. Cola vacía ⇔ cabeza == cola.
 *   - Ninguna función comprueba si la cola está llena: con TAM−1 datos pendientes,
 *     el siguiente Poner… hace cabeza == cola y la cola PARECE VACÍA (se pierden
 *     TAM datos); los siguientes sobrescriben datos no leídos.
 *   - U1STA: UTXISEL1 = 1 y UTXISEL0 = 0 (modo 10 del datasheet): U1TXIF se activa
 *     cuando un carácter pasa de U1TXREG al registro de desplazamiento y el buffer
 *     de transmisión queda vacío. La ISR de TX escribe un solo byte por interrupción.
 *   - Transmite() pone U1TXIF = 1 para provocar la primera interrupción. Si la ISR
 *     escribe en U1TXREG con el FIFO lleno (UTXBF = 1), el byte se pierde.
 */
window.MPI = window.MPI || {};
MPI.componentes = MPI.componentes || {};

(function () {
  var NBSP = ' ';
  var FIFO = 4;
  var MS_POR_BIT = 220;       // duración en pantalla de un bit (velocidad ×1)

  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function hex2(v) { var s = (v & 0xFF).toString(16).toUpperCase(); return '0x' + (s.length < 2 ? '0' + s : s); }
  function car(v) { return (v >= 33 && v < 127) ? String.fromCharCode(v) : hex2(v); }
  function carC(v) {
    if (v === 39) return "'\\''";
    if (v === 92) return "'\\\\'";
    return (v >= 32 && v < 127) ? "'" + String.fromCharCode(v) + "'" : hex2(v);
  }
  function fijo(x, nd) {
    var p = Math.abs(x).toFixed(nd).split('.');
    var e = p[0];
    if (e.length >= 5) e = e.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
    return e + (p[1] ? ',' + p[1] : '');
  }
  function leerCar(txt) {
    var s = String(txt);
    var m = s.match(/^\s*'(.)'\s*$/);
    if (m) return m[1].charCodeAt(0) <= 255 ? m[1].charCodeAt(0) : null;
    var t = s.trim();
    if (/^0x[0-9a-f]{1,2}$/i.test(t)) return parseInt(t.slice(2), 16);
    if (s.length === 1 && s.charCodeAt(0) <= 255) return s.charCodeAt(0);
    return null;
  }
  function siguienteLetra(v, base) {
    if (v >= base && v < base + 25) return v + 1;
    if (v === base + 25) return base;
    return v;
  }

  // ---------------- Código del driver (uart.c, Práctica 7) ----------------
  var COD = {
    rxIsr: ['void __attribute__((interrupt, no_auto_psv)) _U1RXInterrupt(void)', '{',
      '    IFS0bits.U1RXIF = 0; // Borrar la bandera de la interrupción',
      '    PonerEnColaRecepcionUART(U1RXREG);', '}'],
    ponerRx: ['void PonerEnColaRecepcionUART(unsigned char uc_caracter)', '{',
      '    uc_cola_recepcion[ui_icabeza_rec] = uc_caracter;',
      '    ui_icabeza_rec++;',
      '    if (ui_icabeza_rec == TAM_REC_UART)',
      '        ui_icabeza_rec = 0;', '}'],
    mainRx: ['// main (Práctica 7)',
      'if (HayAlgoRecibido()) {',
      '    mensaje = SacarDeColaRecepcionUART();',
      '    ...', '}'],
    hay: ['int HayAlgoRecibido(void)', '{',
      '    return (ui_icola_rec != ui_icabeza_rec);', '}'],
    sacarRx: ['unsigned char SacarDeColaRecepcionUART()', '{',
      '    unsigned char uc_caracter;',
      '    uc_caracter = uc_cola_recepcion[ui_icola_rec];',
      '    ui_icola_rec++;',
      '    if (ui_icola_rec == TAM_REC_UART)',
      '        ui_icola_rec = 0;',
      '    return uc_caracter;', '}'],
    ponerTx: ['void PonerEnColaTransmisionUART(unsigned char uc_caracter)', '{',
      '    uc_cola_transmision[ui_icabeza_tr] = uc_caracter;',
      '    ui_icabeza_tr++;',
      '    if (ui_icabeza_tr == TAM_TR_UART)',
      '        ui_icabeza_tr = 0;', '}'],
    transmite: ['void Transmite(void)', '{',
      '    IFS0bits.U1TXIF = 1;  // Borrar la bandera de la interrupción', '}'],
    txIsr: ['void __attribute__((interrupt, no_auto_psv)) _U1TXInterrupt(void)', '{',
      '    IFS0bits.U1TXIF = 0;  // Borrar la bandera de la interrupción',
      '    if (ui_icola_tr != ui_icabeza_tr)',
      '        U1TXREG = SacarDeColaTransmisionUART();', '}'],
    sacarTx: ['unsigned char SacarDeColaTransmisionUART(void)', '{',
      '    unsigned char uc_caracter;',
      '    uc_caracter = uc_cola_transmision[ui_icola_tr];',
      '    ui_icola_tr++;',
      '    if (ui_icola_tr == TAM_TR_UART)',
      '        ui_icola_tr = 0;',
      '    return uc_caracter;', '}']
  };

  // ---------------- Cola circular (modelo) ----------------
  function Cola(tam) {
    this.tam = tam;
    this.v = [];
    for (var i = 0; i < tam; i++) this.v.push(null);
    this.cab = 0; this.col = 0;
    this.puestos = 0; this.sacados = 0;
    this.ultEsc = -1; this.ultLei = -1;
  }
  Cola.prototype.n = function () { return (this.cab - this.col + this.tam) % this.tam; };
  Cola.prototype.perdidos = function () { return this.puestos - this.sacados - this.n(); };
  Cola.prototype.pendiente = function (i) { return ((i - this.col + this.tam) % this.tam) < this.n(); };
  // Ejecuta Poner…: devuelve {pos, vuelta, alcanzo (cabeza == cola tras escribir)}
  Cola.prototype.poner = function (x) {
    var pos = this.cab;
    var llenaAntes = this.n() === this.tam - 1;
    this.v[pos] = x;
    this.cab++;
    var vuelta = false;
    if (this.cab === this.tam) { this.cab = 0; vuelta = true; }
    this.puestos++;
    this.ultEsc = pos; this.ultLei = -1;
    return { pos: pos, vuelta: vuelta, alcanzo: llenaAntes };
  };
  Cola.prototype.sacar = function () {
    var pos = this.col;
    var x = this.v[pos];
    this.col++;
    var vuelta = false;
    if (this.col === this.tam) { this.col = 0; vuelta = true; }
    this.sacados++;
    this.ultLei = pos; this.ultEsc = -1;
    return { pos: pos, x: x, vuelta: vuelta };
  };

  var ID = 0;

  MPI.componentes['cola-circular'] = function (el, cfg) {
    cfg = cfg || {};
    var uid = 'cc' + (++ID);
    var tam = Math.round(Number(cfg.tam));
    if (!(tam >= 4 && tam <= 32)) tam = 8;
    var real = Math.round(Number(cfg.real)) > 0 ? Math.round(Number(cfg.real)) : 200;
    var modo = (cfg.modo === 'rx' || cfg.modo === 'tx') ? cfg.modo : 'uart';
    var baud = Number(cfg.baudios) > 0 ? Number(cfg.baudios) : 38400;
    var tBit = 1e6 / baud;                 // µs
    var reducido = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var vista = tam <= 16 ? 'anillo' : 'fila';
    var conRx = modo !== 'tx', conTx = modo !== 'rx';

    // ---------- estado ----------
    var rx, tx, txif, fifo, tsr, tSim, rxCar, txCar, log, perdFifo, codigo, explic;
    function reiniciarEstado() {
      rx = new Cola(tam); tx = new Cola(tam);
      txif = 0; fifo = []; tsr = null; tSim = 0; perdFifo = 0;
      rxCar = 65; txCar = 97;   // 'A' y 'a'
      log = [];
      codigo = null;
      explic = 'Pulsa los botones para ejecutar las funciones del driver. Las colas empiezan vacías: cabeza = cola = 0.';
    }
    reiniciarEstado();

    // ---------- HTML ----------
    function panel(tipo) {
      var esRx = tipo === 'rx';
      var t = esRx ? 'Cola de recepción' : 'Cola de transmisión';
      var nombre = esRx ? 'uc_cola_recepcion' : 'uc_cola_transmision';
      var h = '<section class="ccu-panel ccu-panel-' + tipo + '" aria-label="' + t + '">' +
        '<h4 class="ccu-panel-tit">' + t + ' <code>' + nombre + '[' + tam + ']</code></h4>' +
        '<div class="ccu-dibujo ccu-dibujo-' + tipo + '"></div>' +
        '<div class="ccu-indices ccu-indices-' + tipo + '"></div>' +
        '<div class="ccu-botones">';
      if (esRx) {
        h += '<div class="ccu-bot-fila"><button type="button" class="ccu-b-llega">Llega un byte (ISR RX → PonerEnColaRecepcionUART)</button>' +
          '<label class="ccu-car">byte <input type="text" class="ccu-in-rx" maxlength="4" spellcheck="false" autocomplete="off" aria-label="Byte que llega por U1RX" value="A"></label></div>' +
          '<div class="ccu-bot-fila"><button type="button" class="ccu-b-sacar">main: SacarDeColaRecepcionUART()</button></div>';
      } else {
        h += '<div class="ccu-bot-fila"><button type="button" class="ccu-b-poner">main: PonerEnColaTransmisionUART(c)</button>' +
          '<label class="ccu-car">c <input type="text" class="ccu-in-tx" maxlength="4" spellcheck="false" autocomplete="off" aria-label="Carácter c que se pone en la cola de transmisión" value="a"></label></div>' +
          '<div class="ccu-bot-fila"><button type="button" class="ccu-b-transmite">Transmite() → U1TXIF = 1</button></div>';
      }
      h += '</div><div class="ccu-aviso ccu-aviso-' + tipo + '" role="status"></div>';
      if (!esRx) {
        h += '<div class="ccu-hw" aria-label="Hardware de transmisión">' +
          '<div class="ccu-hw-tit">Hardware: U1TXREG (FIFO de ' + FIFO + ') → registro de desplazamiento → U1TX</div>' +
          '<div class="ccu-hw-cadena">' +
            '<div class="ccu-hw-bloque"><span class="ccu-hw-nom">U1TXREG · FIFO</span><div class="ccu-fifo"></div></div>' +
            '<span class="ccu-flecha" aria-hidden="true">→</span>' +
            '<div class="ccu-hw-bloque ccu-hw-tsr"><span class="ccu-hw-nom">U1TSR (desplazamiento)</span><div class="ccu-tsr"></div></div>' +
            '<span class="ccu-flecha" aria-hidden="true">→</span>' +
            '<div class="ccu-hw-bloque ccu-hw-linea"><span class="ccu-hw-nom">U1TX (RB4)</span><div class="ccu-linea"></div></div>' +
          '</div>' +
          '<div class="ccu-flags"></div>' +
          '<div class="ccu-anim-ctl">' +
            '<button type="button" class="ccu-b-play" aria-pressed="false"></button>' +
            '<button type="button" class="ccu-b-sig">Siguiente evento ⏭</button>' +
            '<label>Velocidad <select class="ccu-vel" aria-label="Velocidad de la animación">' +
              '<option value="0.5">×0,5</option><option value="1" selected>×1</option><option value="2">×2</option><option value="4">×4</option></select></label>' +
            '<span class="ccu-reloj"></span>' +
          '</div>' +
        '</div>';
      } else {
        h += '<p class="ccu-hw-rx">Hardware: U1RX (RB5) → U1RSR → U1RXREG (FIFO de ' + FIFO + ') → U1RXIF = 1 → <code>_U1RXInterrupt</code>. ' +
          'Con URXISEL = 0 la interrupción salta con cada byte y la ISR lo lee enseguida, así que el FIFO de recepción apenas se usa.</p>';
      }
      return h + '</section>';
    }

    el.classList.add('mpi-cola-circular');
    el.innerHTML =
      '<div class="mpi-sim-cab">Colas circulares del driver uart.c <span class="ccu-cab-sub">Práctica 7 · simulador</span></div>' +
      '<p class="ccu-intro">Se dibujan ' + tam + ' posiciones para que se vea el rebose; en <code>uart.h</code> el driver real usa ' +
        '<code>TAM_REC_UART = TAM_TR_UART = ' + real + '</code>. <span class="ccu-ley ccu-ley-cab">cabeza</span> = dónde escribe quien pone · ' +
        '<span class="ccu-ley ccu-ley-col">cola</span> = dónde lee quien saca.</p>' +
      '<div class="ccu-ctl-sup">' +
        '<div class="ccu-vista" role="group" aria-label="Forma de dibujar las colas">' +
          '<button type="button" class="ccu-b-vista" data-v="anillo" aria-pressed="false">Anillo</button>' +
          '<button type="button" class="ccu-b-vista" data-v="fila" aria-pressed="false">Fila</button>' +
        '</div>' +
        '<button type="button" class="ccu-b-reini">Reiniciar todo</button>' +
      '</div>' +
      '<div class="ccu-paneles ccu-modo-' + modo + '">' + (conRx ? panel('rx') : '') + (conTx ? panel('tx') : '') + '</div>' +
      '<div class="ccu-expl" aria-live="polite"></div>' +
      '<div class="ccu-cod-wrap"><div class="ccu-cod-tit"></div><div class="ccu-codigo"></div></div>' +
      '<details class="ccu-log-wrap"><summary>Registro de eventos</summary><ol class="ccu-log"></ol></details>';

    var q = function (s) { return el.querySelector(s); };
    var expl = q('.ccu-expl'), codTit = q('.ccu-cod-tit'), codCaja = q('.ccu-codigo'), logEl = q('.ccu-log');
    var inRx = q('.ccu-in-rx'), inTx = q('.ccu-in-tx');
    var btnPlay = q('.ccu-b-play'), btnSig = q('.ccu-b-sig'), selVel = q('.ccu-vel'), relojEl = q('.ccu-reloj');

    // ---------- registro y código ----------
    function anotar(txt) {
      log.push('t = ' + fijo(tSim, 1) + ' µs · ' + txt);
      if (log.length > 60) log.shift();
    }
    // bloques: [{f: 'rxIsr', ej: [lineas ejecutadas], clave: [lineas clave]}]
    function fijarCodigo(titulo, bloques, defs) {
      codigo = { titulo: titulo, bloques: bloques, defs: defs || [] };
    }
    function pintarCodigo() {
      if (!codigo) {
        codTit.textContent = 'Código C del driver: aparecerá aquí la función que ejecutes.';
        codCaja.innerHTML = '';
        return;
      }
      codTit.innerHTML = 'Código ejecutado: <b>' + esc(codigo.titulo) + '</b>';
      var h = '<pre class="ccu-pre">';
      var n = 0;
      function linea(txt, cls) {
        n++;
        h += '<span class="ccu-ln' + (cls ? ' ' + cls : '') + '"><span class="ccu-ln-num" aria-hidden="true">' + n + '</span>' +
          '<code class="lang-c">' + (txt ? esc(txt) : ' ') + '</code>' +
          (cls && cls.indexOf('ccu-ln-clave') >= 0 ? '<span class="ccu-oculto"> (línea relevante)</span>' : '') + '</span>';
      }
      codigo.defs.forEach(function (d) { linea(d, 'ccu-ln-def'); });
      if (codigo.defs.length) linea('', '');
      codigo.bloques.forEach(function (b, k) {
        if (k) linea('', '');
        COD[b.f].forEach(function (txt, i) {
          var cls = '';
          if (b.ej && b.ej.indexOf(i) >= 0) cls = 'ccu-ln-ej';
          if (b.clave && b.clave.indexOf(i) >= 0) cls = 'ccu-ln-ej ccu-ln-clave';
          if (b.no && b.no.indexOf(i) >= 0) cls = 'ccu-ln-no';
          linea(txt, cls);
        });
      });
      codCaja.innerHTML = h + '</pre>';
      if (MPI.resaltarTodo) MPI.resaltarTodo(codCaja);
    }
    var DEF_RX = ['#define TAM_REC_UART ' + tam + '   // en uart.h vale ' + real];
    var DEF_TX = ['#define TAM_TR_UART ' + tam + '    // en uart.h vale ' + real];

    // ---------- acciones del driver ----------
    function llegaByte() {
      var x = leerCar(inRx.value);
      if (x == null) { inRx.setAttribute('aria-invalid', 'true'); explic = 'Escribe un carácter (A) o un byte en hex (0x41).'; pintar(); return; }
      inRx.removeAttribute('aria-invalid');
      var n0 = rx.n();
      var r = rx.poner(x);
      anotar('llega ' + carC(x) + ' por U1RX → U1RXIF = 1 → _U1RXInterrupt: uc_cola_recepcion[' + r.pos + '] = ' + carC(x));
      var claves = [2, 3];
      if (r.vuelta) claves.push(4, 5);
      fijarCodigo('_U1RXInterrupt() → PonerEnColaRecepcionUART(' + carC(x) + ')', [
        { f: 'rxIsr', ej: [0, 1, 2, 3, 4], clave: [3] },
        { f: 'ponerRx', ej: [0, 1, 4, 6], clave: claves, no: r.vuelta ? [] : [5] }
      ], DEF_RX);
      explic = 'Llega ' + carC(x) + ' (' + hex2(x) + '): la UART lo deja en U1RXREG y pone U1RXIF = 1. La ISR borra el flag, lee U1RXREG y lo escribe en ' +
        '<code>uc_cola_recepcion[' + r.pos + ']</code> (la posición de <code>ui_icabeza_rec</code>); después la cabeza avanza a ' + rx.cab + '.';
      if (r.vuelta) explic += ' <b>Rebose del índice:</b> ui_icabeza_rec llegó a TAM_REC_UART = ' + tam + ' y vuelve a 0.';
      if (r.alcanzo) explic += ' <b class="ccu-mal">La cola tenía ' + n0 + ' datos (llena): ahora cabeza == cola y HayAlgoRecibido() devuelve 0. El driver no lo comprueba: los ' + tam + ' datos pendientes se han perdido.</b>';
      rxCar = siguienteLetra(x, 65);
      if (x >= 65 && x <= 90) inRx.value = String.fromCharCode(rxCar);
      pintar();
    }

    function sacarRx() {
      var hay = rx.n() !== 0;
      if (!hay) {
        anotar('main: HayAlgoRecibido() = 0 → no se llama a SacarDeColaRecepcionUART()');
        fijarCodigo('main → HayAlgoRecibido() = 0', [
          { f: 'mainRx', ej: [1], clave: [1], no: [2, 3] },
          { f: 'hay', ej: [0, 1, 3], clave: [2] }
        ], DEF_RX);
        explic = 'HayAlgoRecibido() compara <code>ui_icola_rec != ui_icabeza_rec</code>: ' + rx.col + ' != ' + rx.cab + ' es falso → devuelve 0 y el main no saca nada.' +
          (rx.perdidos() > 0 ? ' <span class="ccu-mal">Ojo: hay datos que llegaron y nunca se leerán (perdidos por rebose de la cola).</span>' : '');
        pintar();
        return;
      }
      var r = rx.sacar();
      anotar('main: SacarDeColaRecepcionUART() devuelve ' + carC(r.x) + ' (uc_cola_recepcion[' + r.pos + '])');
      var claves = [3, 4];
      if (r.vuelta) claves.push(5, 6);
      fijarCodigo('main → HayAlgoRecibido() = 1 → SacarDeColaRecepcionUART()', [
        { f: 'mainRx', ej: [1, 2, 3], clave: [2] },
        { f: 'hay', ej: [0, 1, 2, 3] },
        { f: 'sacarRx', ej: [0, 1, 2, 3, 4, 5, 7, 8], clave: claves, no: r.vuelta ? [] : [6] }
      ], DEF_RX);
      explic = 'HayAlgoRecibido() devuelve 1 (cola ' + r.pos + ' != cabeza ' + rx.cab + ' antes de leer). SacarDeColaRecepcionUART() lee <code>uc_cola_recepcion[' + r.pos +
        ']</code> = ' + carC(r.x) + ' y la cola avanza a ' + rx.col + '. El dato no se borra del vector: simplemente queda fuera de la zona pendiente.';
      if (r.vuelta) explic += ' <b>Rebose del índice:</b> ui_icola_rec llegó a ' + tam + ' y vuelve a 0.';
      if (rx.n() === 0) explic += ' Ahora cola == cabeza: no queda nada pendiente.';
      pintar();
    }

    function ponerTx() {
      var x = leerCar(inTx.value);
      if (x == null) { inTx.setAttribute('aria-invalid', 'true'); explic = 'Escribe un carácter (a) o un byte en hex (0x61).'; pintar(); return; }
      inTx.removeAttribute('aria-invalid');
      var n0 = tx.n();
      var r = tx.poner(x);
      anotar('main: PonerEnColaTransmisionUART(' + carC(x) + ') → uc_cola_transmision[' + r.pos + ']');
      var claves = [2, 3];
      if (r.vuelta) claves.push(4, 5);
      fijarCodigo('main → PonerEnColaTransmisionUART(' + carC(x) + ')', [
        { f: 'ponerTx', ej: [0, 1, 4, 6], clave: claves, no: r.vuelta ? [] : [5] }
      ], DEF_TX);
      explic = 'El main escribe ' + carC(x) + ' en <code>uc_cola_transmision[' + r.pos + ']</code> (posición de <code>ui_icabeza_tr</code>) y la cabeza avanza a ' + tx.cab + '. ' +
        (tsr || fifo.length ? 'La transmisión está en marcha: la próxima interrupción de TX lo recogerá.' : 'Todavía no sale nada: hay que llamar a Transmite() para provocar la primera interrupción.');
      if (r.vuelta) explic += ' <b>Rebose del índice:</b> ui_icabeza_tr llegó a ' + tam + ' y vuelve a 0.';
      if (r.alcanzo) explic += ' <b class="ccu-mal">La cola tenía ' + n0 + ' datos (llena): ahora cabeza == cola y la ISR de TX cree que está vacía. El driver no lo comprueba: se pierden ' + tam + ' caracteres.</b>';
      txCar = siguienteLetra(x, 97);
      if (x >= 97 && x <= 122) inTx.value = String.fromCharCode(txCar);
      pintar();
    }

    // ISR de transmisión (la ejecuta el hardware o Transmite()).
    function isrTx(motivo) {
      txif = 0;
      var info = { motivo: motivo };
      if (tx.n() !== 0) {
        var r = tx.sacar();
        info.r = r;
        if (fifo.length < FIFO) {
          fifo.push(r.x);
          anotar('_U1TXInterrupt (' + motivo + '): U1TXREG = ' + carC(r.x) + ' (uc_cola_transmision[' + r.pos + ']) → FIFO con ' + fifo.length + ' byte(s)');
        } else {
          perdFifo++;
          info.perdido = true;
          anotar('_U1TXInterrupt (' + motivo + '): U1TXREG = ' + carC(r.x) + ' con el FIFO lleno (UTXBF = 1) → byte perdido');
        }
      } else {
        anotar('_U1TXInterrupt (' + motivo + '): cola == cabeza → no escribe nada');
      }
      return info;
    }
    function codigoIsr(info, previo) {
      var bloques = previo ? previo.slice() : [];
      if (info.r) {
        var claves = [3, 4];
        if (info.r.vuelta) claves.push(5, 6);
        bloques.push({ f: 'txIsr', ej: [0, 1, 2, 3, 4, 5], clave: [4] });
        bloques.push({ f: 'sacarTx', ej: [0, 1, 2, 3, 4, 5, 7, 8], clave: claves, no: info.r.vuelta ? [] : [6] });
      } else {
        bloques.push({ f: 'txIsr', ej: [0, 1, 2, 3, 5], clave: [3], no: [4] });
      }
      return bloques;
    }
    function explicIsr(info) {
      if (!info.r) return 'La ISR de TX borra U1TXIF y compara <code>ui_icola_tr != ui_icabeza_tr</code>: son iguales (' + tx.col + '), la cola está vacía y no escribe en U1TXREG. ' +
        (fifo.length ? 'Lo que ya está en el FIFO sigue saliendo; cuando se vacíe volverá a saltar la interrupción.' : 'Ya no habrá más interrupciones de TX hasta el próximo Transmite().');
      var s = 'La ISR de TX borra U1TXIF, saca ' + carC(info.r.x) + ' de <code>uc_cola_transmision[' + info.r.pos + ']</code> (cola → ' + tx.col + ') y lo escribe en U1TXREG.';
      if (info.r.vuelta) s += ' <b>Rebose del índice:</b> ui_icola_tr llegó a ' + tam + ' y vuelve a 0.';
      if (info.perdido) s += ' <b class="ccu-mal">El FIFO ya tenía ' + FIFO + ' bytes (UTXBF = 1): el byte escrito se pierde. El driver no mira UTXBF.</b>';
      else if (fifo.length >= 2) s += ' Ahora esperan ' + fifo.length + ' bytes en el FIFO: cada Transmite() llamado mientras sale un byte fuerza otra interrupción y adelanta otro byte de la cola al FIFO' +
        (fifo.length === FIFO ? ' (ya está lleno: UTXBF = 1; el siguiente se perdería).' : '.');
      return s;
    }

    // Hardware: si el desplazamiento está libre y hay algo en el FIFO, lo pasa al
    // registro de desplazamiento. Modo UTXISEL = 10: si el FIFO queda vacío, U1TXIF = 1
    // y se ejecuta la ISR, que puede volver a cargar el FIFO.
    function hardwareTx(bloques, textos) {
      var guard = 0;
      while (!tsr && fifo.length && guard++ < 10) {
        var b = fifo.shift();
        tsr = { x: b, t0: tSim };
        anotar('U1TXREG → U1TSR: empieza a salir ' + carC(b) + ' por U1TX (' + fijo(10 * tBit, 1) + ' µs)');
        textos.push(carC(b) + ' pasa del FIFO al registro de desplazamiento y empieza a salir por U1TX.');
        if (fifo.length === 0) {
          txif = 1;
          anotar('FIFO vacío → U1TXIF = 1 (UTXISEL = 10)');
          var info = isrTx('FIFO vacío');
          bloques = codigoIsr(info, bloques);
          textos.push('El FIFO se queda vacío → U1TXIF = 1 (UTXISEL1 = 1). ' + explicIsr(info));
        }
      }
      return bloques;
    }

    function transmite() {
      txif = 1;
      anotar('main: Transmite() → U1TXIF = 1');
      var info = isrTx('Transmite()');
      var bloques = codigoIsr(info, [{ f: 'transmite', ej: [0, 1, 3], clave: [2] }]);
      var textos = ['Transmite() pone U1TXIF = 1 (el comentario del libro dice «Borrar», pero lo pone a 1 para forzar la interrupción). ' + explicIsr(info)];
      bloques = hardwareTx(bloques, textos);
      fijarCodigo('Transmite() → _U1TXInterrupt()' + (bloques.length > 3 ? ' (y otra vez al vaciarse el FIFO)' : ''), bloques, DEF_TX);
      explic = textos.join(' ');
      pintar();
      arrancar();
    }

    // Termina el byte que está saliendo.
    function finTsr() {
      if (!tsr) return;
      tSim = tsr.t0 + 10 * tBit;
      anotar(carC(tsr.x) + ' ya ha salido (stop enviado)');
      var textos = [carC(tsr.x) + ' termina de salir por U1TX (10 bits en ' + fijo(10 * tBit, 1) + ' µs).'];
      tsr = null;
      var antes = codigo;
      var bloques = hardwareTx([], textos);
      if (bloques.length) fijarCodigo('_U1TXInterrupt() (la llama el hardware)', bloques, DEF_TX);
      else codigo = antes;
      if (!tsr && !fifo.length) textos.push('Registro de desplazamiento y FIFO vacíos: TRMT = 1, la línea queda en reposo (1).' +
        (tx.n() ? ' Quedan datos en la cola, pero ya no hay interrupción que los saque: hace falta otro Transmite().' : ''));
      explic = textos.join(' ');
    }

    // ---------- animación del tiempo ----------
    var pausado = reducido, corriendo = false, ultimo = null, vel = 1;
    function escala() { return tBit / MS_POR_BIT * vel; }   // µs del micro por ms de pantalla
    function vivo() { return document.body.contains(el); }
    function frame(ts) {
      if (!vivo()) { corriendo = false; return; }
      if (pausado || !tsr) { corriendo = false; ultimo = null; pintarHw(); return; }
      if (ultimo == null) ultimo = ts;
      var dt = Math.min(100, Math.max(0, ts - ultimo));
      ultimo = ts;
      var tFin = tsr.t0 + 10 * tBit;
      tSim += dt * escala();
      if (tSim >= tFin) { finTsr(); pintar(); }
      else pintarHw();
      requestAnimationFrame(frame);
    }
    function arrancar() {
      if (corriendo || pausado || !tsr) return;
      corriendo = true; ultimo = null;
      requestAnimationFrame(frame);
    }

    // ---------- dibujo ----------
    // Anillo: celdas en círculo, índice por dentro y punteros (flechas) por fuera.
    function anilloSVG(c, tipo) {
      var W = 420, cx = 210, cy = 210, R = 100;
      var lado = Math.min(40, 2 * Math.PI * R / tam * 0.74);
      var mk = uid + '-' + tipo;
      var h = '<svg class="ccu-svg" viewBox="0 0 ' + W + ' ' + W + '" role="img" aria-label="' + ariaCola(c, tipo) + '">' +
        '<defs>' +
          '<marker id="' + mk + '-ac" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0,0 L10,5 L0,10 z" class="ccu-mk-cab"/></marker>' +
          '<marker id="' + mk + '-am" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0,0 L10,5 L0,10 z" class="ccu-mk-col"/></marker>' +
        '</defs>' +
        '<circle class="ccu-guia" cx="' + cx + '" cy="' + cy + '" r="' + R + '"/>';
      function ang(i) { return (-90 + i * 360 / tam) * Math.PI / 180; }
      function px(r, a) { return (cx + r * Math.cos(a)).toFixed(1); }
      function py(r, a) { return (cy + r * Math.sin(a)).toFixed(1); }
      var fCar = Math.max(12, Math.min(17, lado * 0.45));
      for (var i = 0; i < tam; i++) {
        var a = ang(i);
        var x = cx + R * Math.cos(a), y = cy + R * Math.sin(a);
        var cls = c.pendiente(i) ? 'ccu-pend' : (c.v[i] != null ? 'ccu-viejo' : 'ccu-vacio');
        if (i === c.ultEsc) cls += ' ccu-nuevo';
        if (i === c.ultLei) cls += ' ccu-leido';
        h += '<rect class="ccu-celda ' + cls + '" x="' + (x - lado / 2).toFixed(1) + '" y="' + (y - lado / 2).toFixed(1) + '" width="' + lado.toFixed(1) + '" height="' + lado.toFixed(1) + '" rx="6"/>';
        h += '<text class="ccu-celda-txt ' + cls + '" x="' + x.toFixed(1) + '" y="' + (y + fCar * 0.36).toFixed(1) + '" style="font-size:' + fCar.toFixed(1) + 'px">' +
          (c.v[i] == null ? '·' : esc(car(c.v[i]))) + '</text>';
        var ri = R - lado / 2 - 10;
        h += '<text class="ccu-idx" x="' + px(ri, a) + '" y="' + (cy + ri * Math.sin(a) + 4).toFixed(1) + '">' + i + '</text>';
      }
      // Punteros por fuera del anillo
      var mismo = c.cab === c.col;
      var desf = mismo ? Math.min(0.2, Math.PI / tam * 0.5) : 0;
      function flecha(idx, d, clase, marca, etq, extra) {
        var a = ang(idx) + d;
        var r2 = R + lado / 2 + 3, r1 = r2 + 26 + extra;
        var co = Math.cos(a), si = Math.sin(a);
        var anc = co > 0.35 ? 'start' : (co < -0.35 ? 'end' : 'middle');
        var rt = r1 + (anc === 'middle' ? 4 : 3);
        var yt = cy + rt * si + (anc === 'middle' ? (si < 0 ? -3 : 12) : 4);
        return '<line class="' + clase + '" x1="' + px(r1, a) + '" y1="' + py(r1, a) + '" x2="' + px(r2, a) + '" y2="' + py(r2, a) + '" marker-end="url(#' + marca + ')"/>' +
          '<text class="' + clase + '-txt" text-anchor="' + anc + '" x="' + px(rt, a) + '" y="' + yt.toFixed(1) + '">' + etq + '</text>';
      }
      h += flecha(c.col, desf, 'ccu-p-col', mk + '-am', 'cola', mismo ? 16 : 0);
      h += flecha(c.cab, -desf, 'ccu-p-cab', mk + '-ac', 'cabeza', 0);
      // Centro
      var n = c.n();
      h += '<text class="ccu-centro" x="' + cx + '" y="' + (cy - 3) + '">' + n + ' pendiente' + (n === 1 ? '' : 's') + '</text>';
      h += '<text class="ccu-centro-sub" x="' + cx + '" y="' + (cy + 15) + '">' + (n === 0 ? 'cabeza == cola' : 'máx. ' + (tam - 1)) + '</text>';
      return h + '</svg>';
    }
    function filaHTML(c, tipo) {
      var h = '<div class="ccu-fila-wrap" tabindex="0" role="region" aria-label="' + ariaCola(c, tipo) + '"><div class="ccu-fila">';
      for (var i = 0; i < c.tam; i++) {
        var cls = c.pendiente(i) ? 'ccu-pend' : (c.v[i] != null ? 'ccu-viejo' : 'ccu-vacio');
        if (i === c.ultEsc) cls += ' ccu-nuevo';
        if (i === c.ultLei) cls += ' ccu-leido';
        h += '<div class="ccu-f-col"><span class="ccu-f-idx">' + i + '</span>' +
          '<span class="ccu-f-celda ' + cls + '">' + (c.v[i] == null ? '·' : esc(car(c.v[i]))) + '</span>' +
          '<span class="ccu-f-marcas">' +
            (i === c.cab ? '<span class="ccu-f-cab">▲ cabeza</span>' : '') +
            (i === c.col ? '<span class="ccu-f-col-m">▲ cola</span>' : '') +
          '</span></div>';
      }
      return h + '</div></div>';
    }
    function ariaCola(c, tipo) {
      var cont = [];
      for (var i = 0; i < c.n(); i++) cont.push(car(c.v[(c.col + i) % c.tam]));
      return (tipo === 'rx' ? 'Cola de recepción' : 'Cola de transmisión') + ' de ' + c.tam + ' posiciones: cabeza = ' + c.cab +
        ', cola = ' + c.col + ', ' + c.n() + ' pendientes' + (cont.length ? ': ' + cont.join(' ') : '') + '.';
    }

    function pintarCola(c, tipo) {
      var dib = q('.ccu-dibujo-' + tipo);
      dib.innerHTML = vista === 'anillo' ? anilloSVG(c, tipo) : filaHTML(c, tipo);
      dib.classList.toggle('ccu-es-fila', vista !== 'anillo');
      var sfx = tipo === 'rx' ? 'rec' : 'tr';
      var h = '<span><code>ui_icabeza_' + sfx + '</code> = <b class="ccu-v-cab">' + c.cab + '</b></span>' +
        '<span><code>ui_icola_' + sfx + '</code> = <b class="ccu-v-col">' + c.col + '</b></span>';
      if (tipo === 'rx') h += '<span><code>HayAlgoRecibido()</code> = <b class="' + (c.n() ? 'ccu-v-si' : 'ccu-v-no') + '">' + (c.n() ? 1 : 0) + '</b></span>';
      else h += '<span>pendientes = <b>' + c.n() + '</b></span>';
      q('.ccu-indices-' + tipo).innerHTML = h;
      var av = q('.ccu-aviso-' + tipo);
      var msg = '', cls = '';
      var p = c.perdidos();
      if (p > 0) {
        msg = '⚠ Se han perdido ' + p + ' dato' + (p === 1 ? '' : 's') + ' por rebose: el driver del libro no comprueba si la cola está llena, ' +
          'así que la cabeza alcanzó a la cola y la cola pareció vacía (o se sobrescribieron datos sin leer).';
        cls = 'ccu-aviso-mal';
      } else if (c.n() === tam - 1) {
        msg = 'Cola llena: ' + (tam - 1) + ' datos pendientes en ' + tam + ' posiciones (una se queda libre para distinguir llena de vacía). ' +
          'El driver no lo comprueba: el siguiente ' + (tipo === 'rx' ? 'PonerEnColaRecepcionUART' : 'PonerEnColaTransmisionUART') + ' hará cabeza == cola y la cola parecerá vacía.';
        cls = 'ccu-aviso-ojo';
      }
      av.textContent = msg;
      av.className = 'ccu-aviso ccu-aviso-' + tipo + (cls ? ' ' + cls : '');
    }

    function pintarHw() {
      if (!conTx) return;
      var h = '';
      for (var i = 0; i < FIFO; i++) {
        h += '<span class="ccu-fifo-c' + (i < fifo.length ? ' ccu-lleno' : '') + '">' + (i < fifo.length ? esc(car(fifo[i])) : '') + '</span>';
      }
      q('.ccu-fifo').innerHTML = h;
      var tsrEl = q('.ccu-tsr'), linEl = q('.ccu-linea');
      var nivel = 1, bitTxt = 'reposo';
      if (tsr) {
        var k = Math.min(9, Math.floor((tSim - tsr.t0) / tBit + 1e-9));
        var trama = [0];
        for (var b = 0; b < 8; b++) trama.push((tsr.x >> b) & 1);
        trama.push(1);
        var etq = ['Start', 'b0', 'b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'b7', 'Stop'];
        var t = '<span class="ccu-tsr-car">' + esc(carC(tsr.x)) + '</span><span class="ccu-tsr-bits">';
        for (b = 0; b < 10; b++) {
          t += '<span class="ccu-bit' + (b < k ? ' ccu-bit-ido' : b === k ? ' ccu-bit-act' : '') + '" title="' + etq[b] + '">' + trama[b] + '</span>';
        }
        tsrEl.innerHTML = t + '</span>';
        nivel = trama[k];
        bitTxt = etq[k];
      } else {
        tsrEl.innerHTML = '<span class="ccu-tenue">vacío</span>';
      }
      linEl.innerHTML = '<span class="ccu-nivel ccu-nivel-' + nivel + '">' + nivel + '</span><span class="ccu-tenue">' + bitTxt + '</span>';
      var utxbf = fifo.length >= FIFO ? 1 : 0, trmt = (!tsr && !fifo.length) ? 1 : 0;
      q('.ccu-flags').innerHTML =
        '<span>U1TXIF = <b class="' + (txif ? 'ccu-on' : '') + '">' + txif + '</b></span>' +
        '<span>UTXBF = <b class="' + (utxbf ? 'ccu-on' : '') + '">' + utxbf + '</b></span>' +
        '<span>TRMT = <b>' + trmt + '</b></span>' +
        (perdFifo ? '<span class="ccu-mal">bytes perdidos en U1TXREG: ' + perdFifo + '</span>' : '');
      relojEl.textContent = 't = ' + fijo(tSim, 1) + ' µs · 1 byte = ' + fijo(10 * tBit, 1) + ' µs a ' + fijo(baud, 0) + ' baudios';
      btnSig.disabled = !tsr;
      btnPlay.textContent = pausado ? '▶ Reproducir' : '⏸ Pausa';
      btnPlay.setAttribute('aria-pressed', String(!pausado));
      btnPlay.setAttribute('aria-label', pausado ? 'Reanudar el paso del tiempo' : 'Pausar el paso del tiempo');
    }

    function pintar() {
      if (conRx) pintarCola(rx, 'rx');
      if (conTx) pintarCola(tx, 'tx');
      pintarHw();
      expl.innerHTML = explic;
      pintarCodigo();
      logEl.innerHTML = log.slice().reverse().map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') || '<li class="ccu-tenue">Sin eventos todavía.</li>';
      var bv = el.querySelectorAll('.ccu-b-vista');
      for (var i = 0; i < bv.length; i++) bv[i].setAttribute('aria-pressed', String(bv[i].getAttribute('data-v') === vista));
    }

    // ---------- eventos ----------
    el.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('button') : null;
      if (!b || !el.contains(b)) return;
      if (b.classList.contains('ccu-b-llega')) llegaByte();
      else if (b.classList.contains('ccu-b-sacar')) sacarRx();
      else if (b.classList.contains('ccu-b-poner')) ponerTx();
      else if (b.classList.contains('ccu-b-transmite')) transmite();
      else if (b.classList.contains('ccu-b-vista')) { vista = b.getAttribute('data-v'); pintar(); }
      else if (b.classList.contains('ccu-b-reini')) {
        reiniciarEstado();
        if (inRx) { inRx.value = 'A'; inRx.removeAttribute('aria-invalid'); }
        if (inTx) { inTx.value = 'a'; inTx.removeAttribute('aria-invalid'); }
        pintar();
      } else if (b.classList.contains('ccu-b-play')) {
        pausado = !pausado;
        pintarHw();
        arrancar();
      } else if (b.classList.contains('ccu-b-sig')) {
        if (tsr) { finTsr(); pintar(); arrancar(); }
      }
    });
    function enter(inp, fn) {
      if (inp) inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); fn(); } });
    }
    enter(inRx, llegaByte);
    enter(inTx, ponerTx);
    if (selVel) selVel.addEventListener('change', function () { vel = parseFloat(selVel.value) || 1; });

    pintar();
  };
})();
