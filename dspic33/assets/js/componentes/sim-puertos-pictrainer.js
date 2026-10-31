/*
 * Componente "sim-puertos-pictrainer": el puerto B del dsPIC33FJ32MC202 sobre
 * la tarjeta PicTrainer.
 *
 * Pestaña 1 «Puerto y tarjeta»: se escriben TRISB y el valor escrito en PORTB
 * (en hex o bit a bit) y se ven los cuatro LEDs (activos a nivel bajo), el
 * pulsador SW2 de RB2 (pull-up: suelto = 1, pulsado = 0) y lo que devuelve una
 * lectura de PORTB. Una casilla simula AD1PCFGL: sin ella RB0-RB3 (AN2-AN5)
 * son analógicos y se leen como 0.
 *
 * Pestaña 2 «Lectura-modificación-escritura»: ejecuta ciclo a ciclo
 * PORTB |= 0x1000; PORTB |= 0x2000; y sus dos soluciones (asm("nop"); y
 * variable intermedia), mostrando que el pin tarda un ciclo en cambiar.
 *
 * Hardware (esquemático de la PicTrainer, figura 126 del libro):
 *   D6 = RB15, D7 = RB14, D8 = RB13, D9 = RB12 (activos a nivel bajo, JP3);
 *   SW2 = RB2 con pull-up de 10 kΩ (pulsado = 0, JP1); RV1 en RB3/AN5 (JP2);
 *   U1TX = RB4, U1RX = RB5; RB0/RB1 = PGED1/PGEC1 del conector P4.
 *
 * Uso: <div class="mpi-mount" data-componente="sim-puertos-pictrainer"
 *           data-config='{"trisb":"0xEFFF","portb":"0xEFFF"}'></div>
 *
 * Claves de data-config (todas opcionales):
 *   trisb     : valor inicial de TRISB (por defecto "0xEFFF", ejemplo 3.2.3).
 *   portb     : valor inicial escrito en PORTB (por defecto "0xEFFF").
 *   ad1pcfgl  : "0xFFFF" (por defecto: pines digitales) o "0x0000" (analógicos).
 *   pulsado   : true para empezar con SW2 pulsado (por defecto false).
 *   pestana   : "rmw" para abrir directamente la pestaña de lectura-modificación-escritura.
 *   rmw       : false para ocultar la pestaña de lectura-modificación-escritura.
 */
window.MPI = window.MPI || {};
MPI.componentes = MPI.componentes || {};

(function () {
  var LEDS = [            // de izquierda a derecha, como los bits (MSB primero)
    { bit: 15, nom: 'D6' },
    { bit: 14, nom: 'D7' },
    { bit: 13, nom: 'D8' },
    { bit: 12, nom: 'D9' }
  ];
  var NOM_LED = { 15: 'D6', 14: 'D7', 13: 'D8', 12: 'D9' };
  var PIN_FISICO = [4, 5, 6, 7, 11, 14, 15, 16, 17, 18, 21, 22, 23, 24, 25, 26];

  function hex4(v) {
    var s = ((v >>> 0) & 0xFFFF).toString(16).toUpperCase();
    while (s.length < 4) s = '0' + s;
    return '0x' + s;
  }
  function bin16(v) {
    var s = '';
    for (var b = 15; b >= 0; b--) { s += (v >> b) & 1; if (b % 4 === 0 && b) s += ' '; }
    return s;
  }
  function parseHex(txt, porDefecto) {
    if (typeof txt === 'number') return txt & 0xFFFF;
    if (txt == null) return porDefecto;
    var s = String(txt).trim().replace(/^0x/i, '');
    if (!/^[0-9a-f]{1,4}$/i.test(s)) return null;
    return parseInt(s, 16) & 0xFFFF;
  }
  function listaBits(bits) {
    return bits.map(function (b) { return 'RB' + b; }).join(', ');
  }

  var contador = 0;

  MPI.componentes['sim-puertos-pictrainer'] = function (el, cfg) {
    cfg = cfg || {};
    var uid = 'spp' + (++contador);
    var trisb = parseHex(cfg.trisb, 0xEFFF); if (trisb === null) trisb = 0xEFFF;
    var escrito = parseHex(cfg.portb, 0xEFFF); if (escrito === null) escrito = 0xEFFF;
    var ad1 = parseHex(cfg.ad1pcfgl, 0xFFFF); if (ad1 === null) ad1 = 0xFFFF;
    var pulsado = cfg.pulsado === true;
    var bloqueado = false;
    var ultimaLectura = null;   // {valor, pulsado}
    var conRmw = cfg.rmw !== false;

    // ---------------- Modelo del puerto ----------------
    function esAnalogico(b) {           // RB0..RB3 = AN2..AN5 → bits 2..5 de AD1PCFGL
      return b <= 3 && !((ad1 >> (b + 2)) & 1);
    }
    function esSalida(b) { return !((trisb >> b) & 1); }
    function nivelPin(b) {              // 1, 0 o null (flotante / sin conectar)
      if (esSalida(b)) return (escrito >> b) & 1;
      if (b === 2) return pulsado ? 0 : 1;
      return null;
    }
    function bitLeido(b) {
      if (esAnalogico(b)) return 0;
      if (esSalida(b)) return (escrito >> b) & 1;
      if (b === 2) return pulsado ? 0 : 1;
      return 0;                         // entrada sin conectar: 0 en el simulador
    }
    function leer() {
      var v = 0;
      for (var b = 0; b < 16; b++) v |= bitLeido(b) << b;
      return v;
    }
    function ledEncendido(b) { return esSalida(b) && !((escrito >> b) & 1); }

    // ---------------- Maquetación ----------------
    function bloqueByte(hi) {
      var h = '<div class="spp-byte" role="group" aria-label="Bits ' + hi + ' a ' + (hi - 7) + '">' +
        '<span class="spp-et">bit</span>';
      var b;
      for (b = hi; b > hi - 8; b--) h += '<span class="spp-bn">' + b + '</span>';
      h += '<span class="spp-et">TRISB</span>';
      for (b = hi; b > hi - 8; b--) h += '<button type="button" class="spp-t spp-tris" data-bit="' + b + '"></button>';
      h += '<span class="spp-et">PORTB<br><small>escrito</small></span>';
      for (b = hi; b > hi - 8; b--) h += '<button type="button" class="spp-t spp-port" data-bit="' + b + '"></button>';
      h += '<span class="spp-et">pin</span>';
      for (b = hi; b > hi - 8; b--) h += '<span class="spp-pin" data-bit="' + b + '"></span>';
      h += '<span class="spp-et">leído</span>';
      for (b = hi; b > hi - 8; b--) h += '<span class="spp-lee" data-bit="' + b + '"></span>';
      return h + '</div>';
    }

    var htmlLeds = '';
    LEDS.forEach(function (l) {
      htmlLeds += '<div class="spp-led" data-bit="' + l.bit + '">' +
        '<div class="spp-led-luz" aria-hidden="true"></div>' +
        '<div class="spp-led-nom">' + l.nom + '</div><div class="spp-led-rb">RB' + l.bit + '</div>' +
        '<div class="spp-led-est"></div></div>';
    });

    var panelPuerto =
      '<div class="spp-panel" id="' + uid + '-p1" role="tabpanel" aria-labelledby="' + uid + '-t1">' +
        '<div class="spp-controles">' +
          '<label>TRISB <input class="spp-hex spp-in-tris" type="text" spellcheck="false" autocomplete="off" aria-label="TRISB en hexadecimal"></label>' +
          '<label>Valor escrito en PORTB <input class="spp-hex spp-in-port" type="text" spellcheck="false" autocomplete="off" aria-label="Valor escrito en PORTB en hexadecimal"></label>' +
          '<label class="spp-chk"><input type="checkbox" class="spp-ad1"> <code>AD1PCFGL = 0xFFFF</code> (pines digitales)</label>' +
        '</div>' +
        '<div class="spp-libro"><span>Ejemplo del libro (3.2.3):</span>' +
          '<button type="button" class="spp-btn" data-esc="1">① SW2 suelto</button>' +
          '<button type="button" class="spp-btn" data-esc="2">② SW2 pulsado</button>' +
          '<button type="button" class="spp-btn" data-esc="3">③ Escribir 0x1000</button>' +
        '</div>' +
        '<div class="spp-bits">' + bloqueByte(15) + bloqueByte(7) + '</div>' +
        '<p class="spp-leyenda">TRISB: 1 = entrada (E), 0 = salida (S). Pin: nivel eléctrico (· = sin conectar, A = analógico). Pulsa sobre un bit para cambiarlo.</p>' +
        '<div class="spp-tarjeta">' +
          '<div class="spp-tarjeta-tit">PicTrainer</div>' +
          '<div class="spp-hw">' +
            '<div class="spp-leds" role="group" aria-label="LEDs D6 a D9">' + htmlLeds + '</div>' +
            '<div class="spp-sw">' +
              '<button type="button" class="spp-boton" aria-pressed="false" aria-label="Pulsador SW2 en RB2 (mantén pulsado)">SW2<small>RB2 · mantén</small></button>' +
              '<label class="spp-chk spp-bloq"><input type="checkbox" class="spp-bloquear"> dejar pulsado</label>' +
              '<div class="spp-sw-est"></div>' +
            '</div>' +
          '</div>' +
          '<p class="spp-nota">RV1 (RB3/AN5) y la UART (RB4, RB5) no se simulan: como el resto de entradas sin conectar, se leen como 0.</p>' +
        '</div>' +
        '<div class="spp-lectura">' +
          '<button type="button" class="spp-btn spp-leer">Leer PORTB</button>' +
          '<div class="spp-vivo"></div>' +
        '</div>' +
        '<div class="spp-res" aria-live="polite"></div>' +
        '<pre class="spp-codigo"></pre>' +
      '</div>';

    var panelRmw = conRmw ? (
      '<div class="spp-panel" id="' + uid + '-p2" role="tabpanel" aria-labelledby="' + uid + '-t2" hidden>' +
        '<p class="spp-intro">Partimos de <code>TRISB = 0x0FFF</code> (LEDs como salidas) y <code>PORTB = 0x0000</code>: los cuatro LEDs encendidos. ' +
          'Queremos <strong>apagar D9 (RB12) y D8 (RB13)</strong>. Escribir en PORTB tarda un ciclo en llegar al pin, y <code>PORTB |= …</code> <em>lee los pines</em> antes de escribir. ' +
          'Para simplificar, las entradas (bits 0-11) se leen como 0 y cada línea de C es una instrucción de un ciclo.</p>' +
        '<div class="spp-variantes" role="radiogroup" aria-label="Variante del código">' +
          '<label><input type="radio" name="' + uid + '-v" value="0" checked> Sin protección</label>' +
          '<label><input type="radio" name="' + uid + '-v" value="1"> Solución 1: <code>asm("nop");</code></label>' +
          '<label><input type="radio" name="' + uid + '-v" value="2"> Solución 2: variable intermedia</label>' +
        '</div>' +
        '<div class="spp-rmw-cuerpo">' +
          '<pre class="spp-rmw-codigo"></pre>' +
          '<div class="spp-rmw-estado">' +
            '<div class="spp-rmw-regs"></div>' +
            '<div class="spp-leds spp-leds-mini">' +
              '<div class="spp-led" data-rbit="13"><div class="spp-led-luz"></div><div class="spp-led-nom">D8</div><div class="spp-led-rb">RB13</div></div>' +
              '<div class="spp-led" data-rbit="12"><div class="spp-led-luz"></div><div class="spp-led-nom">D9</div><div class="spp-led-rb">RB12</div></div>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="spp-pasos">' +
          '<button type="button" class="spp-btn spp-r-ini">⟲ Reiniciar</button>' +
          '<button type="button" class="spp-btn spp-r-ant">◀ Ciclo anterior</button>' +
          '<button type="button" class="spp-btn spp-r-sig">Ciclo siguiente ▶</button>' +
          '<button type="button" class="spp-btn spp-r-fin">Ver todo</button>' +
        '</div>' +
        '<div class="spp-tabla-wrap"><table class="spp-tabla"><thead><tr>' +
          '<th>Ciclo</th><th>Instrucción</th><th>Lee (pines)</th><th>Escribe PORTB</th><th title="Nivel de los pines RB13 y RB12 al final del ciclo">Pines RB13 RB12</th>' +
        '</tr></thead><tbody></tbody></table></div>' +
        '<p class="spp-rmw-com" aria-live="polite"></p>' +
        '<p class="spp-rmw-veredicto"></p>' +
      '</div>') : '';

    el.classList.add('mpi-sim-puertos-pictrainer');
    el.innerHTML =
      '<div class="mpi-sim-cab">Puerto B en la tarjeta PicTrainer</div>' +
      (conRmw
        ? '<div class="spp-tabs" role="tablist">' +
            '<button type="button" role="tab" id="' + uid + '-t1" aria-controls="' + uid + '-p1" aria-selected="true" class="spp-tab">Puerto y tarjeta</button>' +
            '<button type="button" role="tab" id="' + uid + '-t2" aria-controls="' + uid + '-p2" aria-selected="false" tabindex="-1" class="spp-tab">Lectura-modificación-escritura</button>' +
          '</div>'
        : '') +
      panelPuerto + panelRmw;

    var inTris = el.querySelector('.spp-in-tris');
    var inPort = el.querySelector('.spp-in-port');
    var chkAd1 = el.querySelector('.spp-ad1');
    var boton = el.querySelector('.spp-boton');
    var chkBloq = el.querySelector('.spp-bloquear');
    var res = el.querySelector('.spp-res');

    function q(sel, b) { return el.querySelector(sel + '[data-bit="' + b + '"]'); }

    function explicarLectura(v) {
      var salidas = [], entradasSC = [], analog = [];
      var lineas = [];
      for (var b = 15; b >= 0; b--) {
        if (esAnalogico(b)) { analog.push(b); continue; }
        if (esSalida(b)) salidas.push(b);
        else if (b !== 2) entradasSC.push(b);
      }
      if (salidas.length) {
        lineas.push('<li><strong>Salidas</strong> (' + listaBits(salidas) + '): devuelven lo escrito en PORTB' +
          (salidas.indexOf(12) !== -1 ? ' (RB12 = ' + ((escrito >> 12) & 1) + ': LED D9 ' + (ledEncendido(12) ? 'encendido' : 'apagado') + ')' : '') + '.</li>');
      }
      if (!esAnalogico(2)) {
        if (esSalida(2)) lineas.push('<li><strong>RB2</strong> es salida: el pulsador no se lee' + (pulsado ? ' y al pulsarlo cortocircuita la salida a masa (¡conflicto!)' : '') + '.</li>');
        else lineas.push('<li><strong>RB2</strong> (entrada, SW2 ' + (pulsado ? 'pulsado' : 'suelto') + '): ' + (pulsado ? '0 (pin a masa)' : '1 (la resistencia de pull-up lo lleva a 3,3 V)') + '.</li>');
      }
      if (analog.length) {
        lineas.push('<li><strong>' + listaBits(analog) + '</strong>: analógicos (AN' + analog.map(function (b) { return b + 2; }).join(', AN') +
          ') porque no se ha escrito <code>AD1PCFGL = 0xFFFF</code>: se leen siempre como 0' + (analog.indexOf(2) !== -1 && !esSalida(2) ? ', así que el pulsador no se detecta' : '') + '.</li>');
      }
      if (entradasSC.length) {
        lineas.push('<li><strong>Entradas sin conectar</strong> (' + listaBits(entradasSC) + '): 0 en este simulador, como en el ejemplo del libro' +
          (entradasSC.some(function (b) { return b >= 12; }) ? '. Un LED cuyo pin es entrada queda apagado y su lectura no está definida' : '') + '.</li>');
      }
      var extra = '';
      if (trisb === 0xEFFF && (escrito & 0x1000) && !pulsado && !esAnalogico(2) && v === 0x1004) {
        extra = '<p class="spp-expl">El libro obtiene <strong>0x1000</strong> tras escribir 0x1000 porque en ese momento el interruptor seguía a masa (paso ②). ' +
          'Con SW2 suelto el bit 2 vale 1 y se lee <strong>0x1004</strong>: el bit 12 devuelve lo escrito (1, LED apagado) y el bit 2 el pulsador.</p>';
      }
      return '<ul>' + lineas.join('') + '</ul>' + extra;
    }

    function pintarCodigo() {
      var lineas = [];
      lineas.push(ad1 === 0xFFFF ? 'AD1PCFGL = 0xFFFF;   /* RB0-RB3 (AN2-AN5) digitales */'
                                 : '/* AD1PCFGL sin escribir (' + hex4(ad1) + '): RB0-RB3 analógicos */');
      lineas.push('TRISB = ' + hex4(trisb) + ';');
      lineas.push('PORTB = ' + hex4(escrito) + ';');
      lineas.push(ultimaLectura
        ? 'x = PORTB;           /* x = ' + hex4(ultimaLectura.valor) + ' (SW2 ' + (ultimaLectura.pulsado ? 'pulsado' : 'suelto') + ') */'
        : 'x = PORTB;           /* pulsa «Leer PORTB» */');
      var pre = el.querySelector('.spp-codigo');
      pre.innerHTML = '<code class="lang-c"></code>';
      pre.firstChild.textContent = lineas.join('\n');
      if (MPI.resaltarTodo) MPI.resaltarTodo(pre);
    }

    function pintar() {
      inTris.value = hex4(trisb);
      inPort.value = hex4(escrito);
      chkAd1.checked = ad1 === 0xFFFF;
      for (var b = 0; b < 16; b++) {
        var t = q('.spp-tris', b), p = q('.spp-port', b), pin = q('.spp-pin', b), le = q('.spp-lee', b);
        var tb = (trisb >> b) & 1, pb = (escrito >> b) & 1;
        t.textContent = tb ? '1·E' : '0·S';
        t.classList.toggle('spp-uno', !!tb);
        t.setAttribute('aria-pressed', tb ? 'true' : 'false');
        t.setAttribute('aria-label', 'TRISB bit ' + b + ' = ' + tb + (tb ? ', entrada' : ', salida'));
        p.textContent = pb;
        p.classList.toggle('spp-uno', !!pb);
        p.classList.toggle('spp-inactivo', !!tb);
        p.setAttribute('aria-pressed', pb ? 'true' : 'false');
        p.setAttribute('aria-label', 'PORTB escrito bit ' + b + ' = ' + pb + (tb ? ' (pin de entrada: no tiene efecto en el pin)' : ''));
        p.title = tb ? 'RB' + b + ' es entrada: lo escrito se guarda pero no sale al pin' : 'RB' + b + ' es salida';
        var n = nivelPin(b);
        pin.textContent = esAnalogico(b) && !esSalida(b) ? 'A' : (n === null ? '·' : n);
        pin.className = 'spp-pin' + (n === 1 ? ' spp-uno' : '') + (esSalida(b) ? ' spp-sal' : '');
        pin.title = 'Pin ' + PIN_FISICO[b] + ' (RB' + b + ')';
        var lb = bitLeido(b);
        le.textContent = lb;
        le.className = 'spp-lee' + (lb ? ' spp-uno' : '');
      }
      LEDS.forEach(function (l) {
        var d = el.querySelector('.spp-panel .spp-led[data-bit="' + l.bit + '"]');
        var on = ledEncendido(l.bit);
        d.classList.toggle('spp-on', on);
        d.querySelector('.spp-led-est').textContent = esSalida(l.bit) ? (on ? 'encendido' : 'apagado') : 'entrada';
        d.setAttribute('aria-label', 'LED ' + l.nom + ' en RB' + l.bit + ': ' + (on ? 'encendido' : 'apagado'));
      });
      boton.classList.toggle('spp-apretado', pulsado);
      boton.setAttribute('aria-pressed', pulsado ? 'true' : 'false');
      el.querySelector('.spp-sw-est').innerHTML = 'SW2 <strong>' + (pulsado ? 'pulsado' : 'suelto') + '</strong>: pin RB2 = ' + (pulsado ? '0 V' : '3,3 V');
      var v = leer();
      el.querySelector('.spp-vivo').innerHTML = 'Una lectura ahora daría <code>' + hex4(v) + '</code> <small>(' + bin16(v) + ')</small>';
      if (ultimaLectura && ultimaLectura.valor !== v) res.classList.add('spp-viejo');
      else res.classList.remove('spp-viejo');
      pintarCodigo();
    }

    function hacerLectura() {
      var v = leer();
      ultimaLectura = { valor: v, pulsado: pulsado };
      res.classList.remove('spp-viejo');
      res.innerHTML = '<div class="spp-res-val"><code>x = PORTB;</code> → <strong>' + hex4(v) + '</strong> <small>' + bin16(v) + '</small></div>' +
        explicarLectura(v);
      pintarCodigo();
    }

    // ---------- Eventos pestaña 1 ----------
    el.querySelector('.spp-bits').addEventListener('click', function (e) {
      var t = e.target.closest('.spp-t');
      if (!t) return;
      var b = parseInt(t.getAttribute('data-bit'), 10);
      if (t.classList.contains('spp-tris')) trisb ^= (1 << b);
      else escrito ^= (1 << b);
      pintar();
    });
    function enlazarHex(input, setter) {
      input.addEventListener('change', function () {
        var v = parseHex(input.value, null);
        if (v !== null) setter(v);
        pintar();
      });
      input.addEventListener('keydown', function (e) { if (e.key === 'Enter') input.blur(); });
    }
    enlazarHex(inTris, function (v) { trisb = v; });
    enlazarHex(inPort, function (v) { escrito = v; });
    chkAd1.addEventListener('change', function () { ad1 = chkAd1.checked ? 0xFFFF : 0x0000; pintar(); });

    function pulsar(e) { if (e) e.preventDefault(); if (!pulsado) { pulsado = true; pintar(); } }
    function soltar() { if (pulsado && !bloqueado) { pulsado = false; pintar(); } }
    boton.addEventListener('pointerdown', function (e) {
      if (bloqueado) return;
      pulsar(e);
      try { boton.setPointerCapture(e.pointerId); } catch (err) { /* sin captura */ }
    });
    boton.addEventListener('pointerup', soltar);
    boton.addEventListener('pointercancel', soltar);
    boton.addEventListener('lostpointercapture', soltar);
    boton.addEventListener('keydown', function (e) {
      if ((e.key === ' ' || e.key === 'Enter') && !bloqueado) pulsar(e);
    });
    boton.addEventListener('keyup', function (e) { if (e.key === ' ' || e.key === 'Enter') soltar(); });
    boton.addEventListener('blur', soltar);
    boton.addEventListener('click', function (e) { e.preventDefault(); });
    chkBloq.addEventListener('change', function () {
      bloqueado = chkBloq.checked;
      pulsado = bloqueado;
      pintar();
    });
    el.querySelector('.spp-leer').addEventListener('click', hacerLectura);

    el.querySelector('.spp-libro').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-esc]');
      if (!btn) return;
      var n = btn.getAttribute('data-esc');
      trisb = 0xEFFF; ad1 = 0xFFFF;
      if (n === '1') { escrito = 0xEFFF; pulsado = false; }
      else if (n === '2') { escrito = 0xEFFF; pulsado = true; }
      else { escrito = 0x1000; pulsado = true; }
      bloqueado = pulsado; chkBloq.checked = bloqueado;
      pintar();
      hacerLectura();
    });

    pintar();

    // ---------------- Pestaña 2: lectura-modificación-escritura ----------------
    if (!conRmw) return;

    var VARIANTES = [
      { codigo: ['PORTB |= 0x1000;    /* apaga D9 (RB12) */', 'PORTB |= 0x2000;    /* apaga D8 (RB13) */'],
        ops: [{ t: 'rmw', m: 0x1000 }, { t: 'rmw', m: 0x2000 }] },
      { codigo: ['PORTB |= 0x1000;    /* apaga D9 (RB12) */', 'asm("nop");         /* deja pasar un ciclo */', 'PORTB |= 0x2000;    /* apaga D8 (RB13) */'],
        ops: [{ t: 'rmw', m: 0x1000 }, { t: 'nop' }, { t: 'rmw', m: 0x2000 }] },
      { codigo: ['unsigned int s = PORTB;', 's |= 0x1000;', 's |= 0x2000;', 'PORTB = s;          /* una sola escritura */'],
        ops: [{ t: 'leer' }, { t: 'or', m: 0x1000 }, { t: 'or', m: 0x2000 }, { t: 'escribir' }] }
    ];

    function bits1312(v) { return ((v >> 13) & 1) + ' ' + ((v >> 12) & 1); }

    // Modelo: la instrucción del ciclo k lee los pines tal como estaban al final
    // del ciclo k-1 y escribe PORTB al final del ciclo k; el pin alcanza el
    // valor escrito al final del ciclo k+1 (tarda un ciclo).
    function simular(v) {
      var ops = v.ops, reg = [0], pinFin = [0], s = null, filas = [];
      var k = 0;
      while (true) {
        k++;
        var op = ops[k - 1];
        if (!op && pinFin[k - 1] === reg[k - 1]) break;
        var leidos = pinFin[k - 1];           // lo que ve una lectura en el ciclo k
        var r = reg[k - 1], lee = '—', esc = '—', com;
        if (!op) {
          com = 'Ya no hay más instrucciones del ejemplo: el pin alcanza el valor escrito en el ciclo ' + (k - 1) + '.';
        } else if (op.t === 'rmw') {
          var nuevo = leidos | op.m;
          lee = hex4(leidos);
          esc = hex4(nuevo);
          com = 'Lee los pines: ' + hex4(leidos) + '. Calcula ' + hex4(leidos) + ' | ' + hex4(op.m) + ' = ' + hex4(nuevo) + ' y lo escribe en PORTB.';
          var perdidos = r & ~nuevo & 0xF000;
          if (perdidos) {
            var bs = [];
            for (var b = 12; b < 16; b++) if ((perdidos >> b) & 1) bs.push(b);
            com += ' ¡La lectura vio el valor antiguo del pin ' + listaBits(bs) + ' (aún no se había actualizado) y lo vuelve a escribir a 0: se pierde el cambio anterior!';
          }
          r = nuevo;
        } else if (op.t === 'nop') {
          com = 'No hace nada: deja pasar un ciclo para que el pin RB12 se actualice.';
        } else if (op.t === 'leer') {
          s = leidos;
          lee = hex4(leidos);
          com = 'Lee PORTB una sola vez y lo guarda en la variable: s = ' + hex4(s) + '.';
        } else if (op.t === 'or') {
          var antes = s;
          s = s | op.m;
          com = 'Trabaja solo con la variable (no toca el puerto): s = ' + hex4(antes) + ' | ' + hex4(op.m) + ' = ' + hex4(s) + '.';
        } else if (op.t === 'escribir') {
          r = s;
          esc = hex4(s);
          com = 'Una sola escritura en PORTB con los dos bits ya a 1: ' + hex4(s) + '.';
        }
        reg.push(r);
        pinFin.push(reg[k - 1]);              // el pin sigue a PORTB con un ciclo de retraso
        if (pinFin[k] !== pinFin[k - 1]) com += ' Durante este ciclo los pines pasan a ' + hex4(pinFin[k]) + ' (escritura del ciclo ' + (k - 1) + ').';
        filas.push({ ciclo: k, linea: op ? k - 1 : -1, instr: op ? v.codigo[k - 1].split('/*')[0].trim() : '(siguiente instrucción)',
          lee: lee, esc: esc, reg: r, pin: pinFin[k], s: s, com: com });
        if (k > 12) break;
      }
      return filas;
    }

    var variante = 0, paso = 0, filas = simular(VARIANTES[0]);
    var preR = el.querySelector('.spp-rmw-codigo');
    var tbody = el.querySelector('.spp-tabla tbody');

    function pintarCodigoRmw() {
      var v = VARIANTES[variante];
      var h = '';
      v.codigo.forEach(function (_, i) { h += '<code class="lang-c spp-l" data-l="' + i + '"></code>'; });
      preR.innerHTML = h;
      var cs = preR.querySelectorAll('code');
      for (var i = 0; i < cs.length; i++) cs[i].textContent = v.codigo[i];
      if (MPI.resaltarTodo) MPI.resaltarTodo(preR);
    }

    function pintarRmw() {
      var actual = paso > 0 ? filas[paso - 1] : null;
      var cs = preR.querySelectorAll('.spp-l');
      for (var i = 0; i < cs.length; i++) cs[i].classList.toggle('spp-l-act', !!actual && actual.linea === i);
      var h = '';
      for (var j = 0; j < paso; j++) {
        var f = filas[j];
        h += '<tr' + (j === paso - 1 ? ' class="spp-fila-act"' : '') + '>' +
          '<td>' + f.ciclo + '</td><td><code>' + f.instr.replace(/</g, '&lt;') + '</code></td>' +
          '<td>' + f.lee + '</td><td>' + f.esc + '</td><td class="spp-mono">' + bits1312(f.pin) + '</td></tr>';
      }
      if (!paso) h = '<tr><td colspan="5" class="spp-vacio">Pulsa «Ciclo siguiente» para ejecutar la primera instrucción.</td></tr>';
      tbody.innerHTML = h;
      var reg = actual ? actual.reg : 0, pin = actual ? actual.pin : 0;
      var sTxt = variante === 2 ? '<div>s = <code>' + (actual && actual.s !== null ? hex4(actual.s) : '¿?') + '</code></div>' : '';
      el.querySelector('.spp-rmw-regs').innerHTML =
        '<div>Ciclo: <strong>' + (actual ? actual.ciclo : 0) + '</strong></div>' +
        '<div>PORTB escrito: <code>' + hex4(reg) + '</code></div>' +
        '<div>Pines RB13 RB12: <code>' + bits1312(pin) + '</code></div>' + sTxt;
      [12, 13].forEach(function (b) {
        var d = el.querySelector('.spp-led[data-rbit="' + b + '"]');
        var on = !((pin >> b) & 1);
        d.classList.toggle('spp-on', on);
        d.setAttribute('aria-label', 'LED ' + NOM_LED[b] + ' (RB' + b + '): ' + (on ? 'encendido' : 'apagado'));
      });
      el.querySelector('.spp-rmw-com').textContent = actual ? actual.com : '';
      var ver = el.querySelector('.spp-rmw-veredicto');
      if (paso === filas.length) {
        var ok = (pin & 0x3000) === 0x3000;
        ver.className = 'spp-rmw-veredicto ' + (ok ? 'spp-ok' : 'spp-mal');
        ver.innerHTML = ok
          ? '✔ Final: RB13 = RB12 = 1 → D8 y D9 apagados, como se quería.'
          : '✘ Final: RB12 = 0 → D9 sigue encendido. La segunda instrucción leyó RB12 antes de que el pin cambiara y lo volvió a escribir a 0: se ha perdido el cambio de la primera.';
      } else { ver.className = 'spp-rmw-veredicto'; ver.textContent = ''; }
      el.querySelector('.spp-r-ant').disabled = paso === 0;
      el.querySelector('.spp-r-sig').disabled = paso === filas.length;
      el.querySelector('.spp-r-fin').disabled = paso === filas.length;
    }

    el.querySelector('.spp-variantes').addEventListener('change', function (e) {
      if (!e.target.value) return;
      variante = parseInt(e.target.value, 10);
      filas = simular(VARIANTES[variante]);
      paso = 0;
      pintarCodigoRmw();
      pintarRmw();
    });
    el.querySelector('.spp-r-ini').addEventListener('click', function () { paso = 0; pintarRmw(); });
    el.querySelector('.spp-r-ant').addEventListener('click', function () { if (paso > 0) paso--; pintarRmw(); });
    el.querySelector('.spp-r-sig').addEventListener('click', function () { if (paso < filas.length) paso++; pintarRmw(); });
    el.querySelector('.spp-r-fin').addEventListener('click', function () { paso = filas.length; pintarRmw(); });

    pintarCodigoRmw();
    pintarRmw();

    // ---------- Pestañas (accesibles con flechas) ----------
    var tabs = el.querySelectorAll('.spp-tab');
    function activar(i, foco) {
      for (var k = 0; k < tabs.length; k++) {
        var sel = k === i;
        tabs[k].setAttribute('aria-selected', sel ? 'true' : 'false');
        tabs[k].tabIndex = sel ? 0 : -1;
        el.querySelector('#' + tabs[k].getAttribute('aria-controls')).hidden = !sel;
      }
      if (foco) tabs[i].focus();
    }
    for (var k = 0; k < tabs.length; k++) {
      (function (i) {
        tabs[i].addEventListener('click', function () { activar(i, false); });
        tabs[i].addEventListener('keydown', function (e) {
          if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
            e.preventDefault();
            activar((i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length, true);
          }
        });
      })(k);
    }
    if (cfg.pestana === 'rmw') activar(1, false);
  };
})();
