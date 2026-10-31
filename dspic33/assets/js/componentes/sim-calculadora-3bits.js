/*
 * Componente "sim-calculadora-3bits": ejercicio 4 de 3.3 (resuelto en el libro).
 * Siete interruptores en RB0..RB6 (RB0-RB2 operando 1, RB3-RB5 operando 2,
 * RB6 = 1 suma / 0 resta) y cuatro LEDs en RA0..RA3 con pull-up (activos a
 * nivel bajo). Muestra, paso a paso, los valores intermedios del código del
 * libro: máscaras, desplazamientos, resultado y PORTA = ~(Resultado & 0xF).
 *
 * Uso: <div class="mpi-mount" data-componente="sim-calculadora-3bits"
 *        data-config='{"trisb":"0x007F","trisa":"0x0000","portb":"0x0000",
 *          "mascaras":{"operando1":"0x07","operando2":"0x38","operacion":"0x40"},
 *          "ledsActivosBajo":true}'></div>
 *
 * Claves de data-config (todas opcionales):
 *   trisb, trisa     : valores de TRISB y TRISA del código (por defecto 0x007F y 0x0000).
 *   portb            : estado inicial de PORTB (interruptores; por defecto 0x0000).
 *   mascaras         : {operando1, operando2, operacion} (por defecto 0x07, 0x38, 0x40);
 *                      el desplazamiento se deduce del bit más bajo de cada máscara.
 *   ledsActivosBajo  : true (por defecto) → PORTA = ~(Resultado & 0xF);
 *                      false → PORTA = Resultado & 0xF.
 *   ad1pcfgl         : "0xFFFF" (por defecto, RB0-RB3 digitales) o "0x0000".
 */
window.MPI = window.MPI || {};
MPI.componentes = MPI.componentes || {};

(function () {
  function parseHex(txt, porDefecto) {
    if (typeof txt === 'number') return txt & 0xFFFF;
    if (txt == null) return porDefecto;
    var s = String(txt).trim().replace(/^0x/i, '');
    if (!/^[0-9a-f]{1,4}$/i.test(s)) return porDefecto;
    return parseInt(s, 16) & 0xFFFF;
  }
  function hexN(v, n) {
    var s = ((v >>> 0) & 0xFFFF).toString(16).toUpperCase();
    while (s.length < n) s = '0' + s;
    return '0x' + s;
  }
  function hex4(v) { return hexN(v, 4); }
  function hexCod(v) { return hexN(v, v > 0xFF ? 4 : 2); }   // como en el listado del libro
  function binN(v, n) {
    var s = '';
    for (var b = n - 1; b >= 0; b--) { s += (v >> b) & 1; if (b % 4 === 0 && b) s += ' '; }
    return s;
  }
  function despl(m) { var k = 0; if (!m) return 0; while (!((m >> k) & 1)) k++; return k; }
  function anchoMascara(m) { var n = 0; m = m >> despl(m); while (m & 1) { n++; m >>= 1; } return n; }
  function esc(t) { return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function num(v) { return v < 0 ? '−' + (-v) : String(v); }
  function bitsDe(m) { var r = []; for (var b = 15; b >= 0; b--) if ((m >> b) & 1) r.push(b); return r; }

  var contador = 0;

  MPI.componentes['sim-calculadora-3bits'] = function (el, cfg) {
    cfg = cfg || {};
    var uid = 'sc3' + (++contador);
    var trisb = parseHex(cfg.trisb, 0x007F);
    var trisa = parseHex(cfg.trisa, 0x0000);
    var mcfg = cfg.mascaras || {};
    var M1 = parseHex(mcfg.operando1, 0x07) || 0x07;
    var M2 = parseHex(mcfg.operando2, 0x38) || 0x38;
    var M3 = parseHex(mcfg.operacion, 0x40) || 0x40;
    var S1 = despl(M1), S2 = despl(M2), S3 = despl(M3);
    var activoBajo = cfg.ledsActivosBajo !== false;
    var ad1 = parseHex(cfg.ad1pcfgl, 0xFFFF);
    var interruptores = parseHex(cfg.portb, 0x0000);   // nivel de los pines de entrada / lo escrito en las salidas
    var MTODOS = M1 | M2 | M3;

    // ---------------- Código del libro ----------------
    var CODIGO = [
      '#include "config.h"',
      '',
      'void main(void)',
      '{',
      '    int Operando1;',
      '    int Operando2;',
      '    int Operacion;',
      '    int Resultado;',
      '',
      '    InicializarReloj();     // F_CY = 40 MHz',
      '    AD1PCFGL = 0xFFFF;      // todos los pines en digital (RB0-RB3 y RA0-RA1 son ANx)',
      '',
      '    /* Configura entradas y salidas */',
      '    TRISB = ' + hexCod(trisb) + ';',
      '    TRISA = ' + hexCod(trisa) + ';',
      '',
      '    while (1) {',
      '        /* Lee los operandos y qué calculo debe hacer */',
      '        Operando1 = ' + (S1 ? '(PORTB & ' + hexCod(M1) + ') >> ' + S1 : 'PORTB & ' + hexCod(M1)) + ';',
      '        Operando2 = ' + (S2 ? '(PORTB & ' + hexCod(M2) + ') >> ' + S2 : 'PORTB & ' + hexCod(M2)) + ';',
      '        Operacion = ' + (S3 ? '(PORTB & ' + hexCod(M3) + ') >> ' + S3 : 'PORTB & ' + hexCod(M3)) + ';',
      '',
      '        /* Ejecuta el cálculo que corresponda */',
      '        if (Operacion != 0)',
      '            Resultado = Operando1 + Operando2;',
      '        else',
      '            Resultado = Operando1 - Operando2;',
      '',
      '        /* Muestra el resultado */',
      '        PORTA = ' + (activoBajo ? '~(Resultado & 0xF)' : 'Resultado & 0xF') + ';',
      '    }',
      '}'
    ];
    var L_OP1 = 13, L_OP2 = 14, L_OPN = 15, L_IF = 18, L_SUMA = 19, L_RESTA = 21, L_PORTA = 24;

    // ---------------- Maquetación ----------------
    function grupo(titulo, mascara, clase) {
      var h = '<div class="sc3-grupo ' + clase + '"><div class="sc3-grupo-tit">' + titulo + '</div><div class="sc3-sws">';
      bitsDe(mascara).forEach(function (b) {
        h += '<button type="button" class="sc3-sw" data-bit="' + b + '" aria-pressed="false">' +
          '<span class="sc3-sw-nom">RB' + b + '</span><span class="sc3-sw-pal" aria-hidden="true"></span><span class="sc3-sw-val"></span></button>';
      });
      return h + '</div><div class="sc3-grupo-val"></div></div>';
    }
    var htmlLeds = '';
    for (var b = 3; b >= 0; b--) {
      htmlLeds += '<div class="sc3-led" data-bit="' + b + '"><div class="sc3-led-luz" aria-hidden="true"></div>' +
        '<div class="sc3-led-nom">RA' + b + '</div><div class="sc3-led-bit"></div></div>';
    }
    var htmlCod = '';
    CODIGO.forEach(function (_, i) { htmlCod += '<code class="lang-c sc3-l" data-l="' + i + '"></code>'; });

    el.classList.add('mpi-sim-calculadora-3bits');
    el.innerHTML =
      '<div class="mpi-sim-cab">Calculadora de 3 bits (ejercicio 4 de 3.3)</div>' +
      '<div class="sc3-entradas" role="group" aria-label="Interruptores del puerto B">' +
        grupo('Operación', M3, 'sc3-g3') + grupo('Operando 2', M2, 'sc3-g2') + grupo('Operando 1', M1, 'sc3-g1') +
      '</div>' +
      '<div class="sc3-acciones">' +
        '<button type="button" class="sc3-btn sc3-ej">Ejemplo: 2 − 5</button>' +
        '<button type="button" class="sc3-btn sc3-azar">Al azar</button>' +
        '<label class="sc3-chk"><input type="checkbox" class="sc3-ad1"> <code>AD1PCFGL = 0xFFFF</code> <small>(no está en el código del libro)</small></label>' +
      '</div>' +
      '<div class="sc3-portb"></div>' +
      '<div class="sc3-salida">' +
        '<div class="sc3-leds" role="group" aria-label="LEDs de RA3 a RA0">' + htmlLeds + '</div>' +
        '<div class="sc3-interp" aria-live="polite"></div>' +
      '</div>' +
      '<div class="sc3-pasos">' +
        '<button type="button" class="sc3-btn sc3-p-ini">⟲ Desde el principio</button>' +
        '<button type="button" class="sc3-btn sc3-p-ant">◀ Paso anterior</button>' +
        '<button type="button" class="sc3-btn sc3-p-sig">Paso siguiente ▶</button>' +
        '<button type="button" class="sc3-btn sc3-p-fin">Ver todo</button>' +
      '</div>' +
      '<div class="sc3-cuerpo">' +
        '<div class="sc3-tabla-wrap"><table class="sc3-tabla"><thead><tr><th>Paso</th><th>Expresión</th><th>Hex</th><th>Binario</th></tr></thead><tbody></tbody></table></div>' +
        '<pre class="sc3-codigo">' + htmlCod + '</pre>' +
      '</div>';

    var cods = el.querySelectorAll('.sc3-l');
    for (var i = 0; i < cods.length; i++) cods[i].textContent = CODIGO[i] || ' ';
    if (MPI.resaltarTodo) MPI.resaltarTodo(el);

    var chkAd1 = el.querySelector('.sc3-ad1');
    var tbody = el.querySelector('.sc3-tabla tbody');
    var paso = -1;   // -1 = ver todo

    // ---------------- Modelo ----------------
    function esAnalogico(b) { return b <= 3 && !((ad1 >> (b + 2)) & 1); }
    function leerPORTB() {
      var v = 0;
      for (var b = 0; b < 16; b++) {
        if (esAnalogico(b)) continue;
        v |= ((interruptores >> b) & 1) << b;   // entradas: interruptor; salidas: lo escrito
      }
      return v;
    }

    function calcular() {
      var portb = leerPORTB();
      var a1 = portb & M1, op1 = a1 >> S1;
      var a2 = portb & M2, op2 = a2 >> S2;
      var a3 = portb & M3, opn = a3 >> S3;
      var suma = opn !== 0;
      var r = suma ? op1 + op2 : op1 - op2;
      var r16 = r & 0xFFFF;
      var r4 = r & 0xF;
      var porta = activoBajo ? (~r4 & 0xFFFF) : r4;
      return { portb: portb, a1: a1, op1: op1, a2: a2, op2: op2, a3: a3, opn: opn, suma: suma, r: r, r16: r16, r4: r4, porta: porta };
    }

    function filas(c) {
      var w1 = anchoMascara(M1), w2 = anchoMascara(M2);
      var f = [];
      f.push({ l: L_OP1, exp: 'PORTB', hex: hex4(c.portb), bin: binN(c.portb, 16),
        com: 'Lectura del puerto: cada interruptor da su bit; los bits que son salida devuelven lo escrito (' + hex4(interruptores & ~trisb & 0xFFFF) + ').' });
      f.push({ l: L_OP1, exp: 'PORTB & ' + hexCod(M1), hex: hexCod(c.a1), bin: binN(c.a1, 8), com: 'La máscara deja solo RB' + (S1 + w1 - 1) + '-RB' + S1 + '.' });
      f.push({ l: L_OP1, exp: 'Operando1', hex: hexCod(c.op1), bin: binN(c.op1, w1), val: c.op1, com: 'Operando 1 = ' + c.op1 + '.' });
      f.push({ l: L_OP2, exp: 'PORTB & ' + hexCod(M2), hex: hexCod(c.a2), bin: binN(c.a2, 8), com: 'La máscara deja solo RB' + (S2 + w2 - 1) + '-RB' + S2 + '.' });
      f.push({ l: L_OP2, exp: '(…) >> ' + S2 + ' → Operando2', hex: hexCod(c.op2), bin: binN(c.op2, w2), val: c.op2, com: 'Se desplaza ' + S2 + ' posiciones a la derecha para alinear el campo con el bit 0: Operando 2 = ' + c.op2 + '.' });
      f.push({ l: L_OPN, exp: '(PORTB & ' + hexCod(M3) + ') >> ' + S3 + ' → Operacion', hex: hexCod(c.opn), bin: String(c.opn), val: c.opn, com: 'RB' + S3 + ' = ' + c.opn + ' → ' + (c.suma ? 'suma' : 'resta') + '.' });
      f.push({ l: c.suma ? L_SUMA : L_RESTA, exp: 'Resultado = ' + c.op1 + (c.suma ? ' + ' : ' − ') + c.op2, hex: hex4(c.r16), bin: binN(c.r16, 16), val: c.r,
        com: 'Operacion ' + (c.suma ? '≠ 0: se suma' : '= 0: se resta') + '. Resultado = ' + num(c.r) +
          (c.r < 0 ? ' (en un int de 16 bits se guarda en complemento a 2: ' + hex4(c.r16) + ').' : '.') });
      f.push({ l: L_PORTA, exp: 'Resultado & 0xF', hex: hexN(c.r4, 1), bin: binN(c.r4, 4), val: c.r4,
        com: 'Se quedan los 4 bits bajos' + (c.r < 0 ? ': ' + num(c.r) + ' en complemento a 2 de 4 bits es 16 − ' + (-c.r) + ' = ' + c.r4 + ' = ' + hexN(c.r4, 1) + '.' : '.') });
      if (activoBajo) {
        f.push({ l: L_PORTA, exp: 'PORTA = ~(Resultado & 0xF)', hex: hex4(c.porta), bin: binN(c.porta, 16),
          com: '~ invierte los 16 bits para los LEDs activos a nivel bajo. En el micro solo existen RA0-RA4: RA4..RA0 = ' + binN(c.porta & 0x1F, 5).replace(' ', '') + '.' });
      } else {
        f.push({ l: L_PORTA, exp: 'PORTA = Resultado & 0xF', hex: hex4(c.porta), bin: binN(c.porta, 16), com: 'LEDs activos a nivel alto: se escribe el resultado tal cual.' });
      }
      return f;
    }

    function pintar() {
      var c = calcular();
      chkAd1.checked = ad1 === 0xFFFF;
      // Interruptores
      var sws = el.querySelectorAll('.sc3-sw');
      for (var k = 0; k < sws.length; k++) {
        var b = parseInt(sws[k].getAttribute('data-bit'), 10);
        var on = (interruptores >> b) & 1;
        var entrada = (trisb >> b) & 1;
        sws[k].classList.toggle('sc3-on', !!on);
        sws[k].setAttribute('aria-pressed', on ? 'true' : 'false');
        sws[k].setAttribute('aria-label', 'Interruptor RB' + b + ' = ' + on + (esAnalogico(b) ? ' (pin analógico: se lee 0)' : '') + (entrada ? '' : ' (RB' + b + ' es salida según TRISB)'));
        sws[k].querySelector('.sc3-sw-val').textContent = on;
        sws[k].classList.toggle('sc3-analog', esAnalogico(b));
        sws[k].title = esAnalogico(b) ? 'RB' + b + ' es analógico (AN' + (b + 2) + '): PORTB lo lee como 0' : '';
      }
      el.querySelector('.sc3-g1 .sc3-grupo-val').textContent = '= ' + c.op1;
      el.querySelector('.sc3-g2 .sc3-grupo-val').textContent = '= ' + c.op2;
      el.querySelector('.sc3-g3 .sc3-grupo-val').textContent = c.opn ? '1 = suma' : '0 = resta';
      var analog = [];
      for (var a = 0; a <= 3; a++) if (esAnalogico(a) && ((MTODOS >> a) & 1)) analog.push('RB' + a);
      el.querySelector('.sc3-portb').innerHTML = 'PORTB leído = <code>' + hex4(c.portb) + '</code>' +
        (analog.length ? ' <span class="sc3-aviso">⚠ Sin <code>AD1PCFGL = 0xFFFF</code>, ' + analog.join(', ') + ' (AN2-AN5) son analógicos y se leen como 0: la calculadora ve otros operandos.</span>' : '');
      // LEDs
      var res4 = '';
      for (var l = 3; l >= 0; l--) {
        var bitPA = (c.porta >> l) & 1;
        var salida = !((trisa >> l) & 1);
        var enc = salida && (activoBajo ? bitPA === 0 : bitPA === 1);
        var d = el.querySelector('.sc3-led[data-bit="' + l + '"]');
        d.classList.toggle('sc3-led-on', enc);
        d.querySelector('.sc3-led-bit').textContent = 'RA' + l + ' = ' + bitPA;
        d.setAttribute('aria-label', 'LED en RA' + l + ': ' + (enc ? 'encendido' : 'apagado'));
        res4 += enc ? '1' : '0';
      }
      var interp = 'LEDs encendidos = <code>' + res4 + '</code> → ' +
        (c.suma
          ? c.op1 + ' + ' + c.op2 + ' = <strong>' + c.r + '</strong>' + (c.r > 15 ? ' (no cabe en 4 bits)' : '')
          : c.op1 + ' − ' + c.op2 + ' = <strong>' + num(c.r) + '</strong>' +
            (c.r < 0 ? ': en complemento a 2 de 4 bits, ' + num(c.r) + ' → <code>' + hexN(c.r4, 1) + '</code> = ' + binN(c.r4, 4) + ' (sin signo se leería ' + c.r4 + ')' : ''));
      el.querySelector('.sc3-interp').innerHTML = interp +
        (activoBajo ? '<small>LEDs con pull-up (activos a nivel bajo): un 0 en RAx enciende el LED, por eso se escribe <code>~(Resultado &amp; 0xF)</code>.</small>' : '');
      // Pasos
      var fs = filas(c);
      var n = paso < 0 ? fs.length : paso;
      var h = '';
      for (var j = 0; j < n; j++) {
        var f = fs[j];
        h += '<tr' + (paso >= 0 && j === n - 1 ? ' class="sc3-fila-act"' : '') + '>' +
          '<td>' + (j + 1) + '</td><td><code>' + esc(f.exp) + '</code><div class="sc3-com">' + esc(f.com) + '</div></td>' +
          '<td class="sc3-mono">' + f.hex + '</td><td class="sc3-mono">' + f.bin + '</td></tr>';
      }
      if (!n) h = '<tr><td colspan="4" class="sc3-vacio">Pulsa «Paso siguiente» para ejecutar la primera línea.</td></tr>';
      tbody.innerHTML = h;
      var lin = paso > 0 ? fs[paso - 1].l : -1;
      for (var q = 0; q < cods.length; q++) cods[q].classList.toggle('sc3-l-act', q === lin);
      if (paso < 0) for (q = 0; q < cods.length; q++) cods[q].classList.toggle('sc3-l-act', false);
      el.querySelector('.sc3-p-ant').disabled = paso === 0;
      el.querySelector('.sc3-p-sig').disabled = paso >= fs.length;
      el.querySelector('.sc3-p-fin').disabled = paso < 0;
      el.__sc3Total = fs.length;
    }

    // ---------------- Eventos ----------------
    el.querySelector('.sc3-entradas').addEventListener('click', function (e) {
      var s = e.target.closest('.sc3-sw');
      if (!s) return;
      interruptores ^= 1 << parseInt(s.getAttribute('data-bit'), 10);
      pintar();
    });
    function poner(op1, op2, suma) {
      interruptores = (interruptores & ~MTODOS) | ((op1 << S1) & M1) | ((op2 << S2) & M2) | (suma ? M3 : 0);
      pintar();
    }
    el.querySelector('.sc3-ej').addEventListener('click', function () { poner(2, 5, false); });
    el.querySelector('.sc3-azar').addEventListener('click', function () {
      var max1 = M1 >> S1, max2 = M2 >> S2;
      poner(Math.floor(Math.random() * (max1 + 1)), Math.floor(Math.random() * (max2 + 1)), Math.random() < 0.5);
    });
    chkAd1.addEventListener('change', function () { ad1 = chkAd1.checked ? 0xFFFF : 0x0000; pintar(); });
    el.querySelector('.sc3-p-ini').addEventListener('click', function () { paso = 0; pintar(); });
    el.querySelector('.sc3-p-ant').addEventListener('click', function () {
      if (paso < 0) paso = el.__sc3Total;
      if (paso > 0) paso--;
      pintar();
    });
    el.querySelector('.sc3-p-sig').addEventListener('click', function () {
      if (paso < 0) paso = 1;
      else if (paso < el.__sc3Total) paso++;
      pintar();
    });
    el.querySelector('.sc3-p-fin').addEventListener('click', function () { paso = -1; pintar(); });

    pintar();
  };
})();
