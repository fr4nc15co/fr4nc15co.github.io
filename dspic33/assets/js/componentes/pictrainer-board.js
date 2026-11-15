/*
 * Componente "pictrainer-board": dibujo a escala (SVG, en mm) de la tarjeta de
 * laboratorio PicTrainer v3.0 con cada bloque clicable. Al elegir un elemento
 * se muestra qué es, a qué pin del dsPIC33FJ32MC202 va (RBx y pin físico), su
 * nivel activo, su puente y qué pasa si se quita, las posiciones de los
 * selectores K1/K2, los pines de los conectores y un fragmento de C.
 * Los puentes JP1-JP3 y el selector K2 se pueden poner/quitar (o mover) desde
 * el panel; el dibujo y los textos cambian con ellos. Debajo, una tabla con
 * los 28 pines del micro, su uso en la tarjeta y los pines libres.
 *
 * Fuente: anexo C del libro (figuras 123-126: diagrama de bloques, USB,
 * alimentación y microcontrolador), hechos verificados de ficha-asignatura.json
 * y lo leído en el esquema (resistencias, condensadores, pines de P4-P8, K1, K2).
 *
 * La geometría (posiciones y siluetas de los componentes) es la del simulador
 * hermano `interactive_lab` (src/placas/dspic33/tarjeta/svg.ts): cotas medidas
 * sobre las fotos de la PCB del Libro SED v10.0 (figuras 5 y 6), en milímetros,
 * con el USB a la izquierda. La orientación del zócalo del micro (muesca abajo,
 * pin 1 en la columna izquierda) la confirmó el profesor; no viene del esquema.
 *
 * Uso en el contenido:
 *   <div class="mpi-mount" data-componente="pictrainer-board"
 *        data-config='{"resaltar":"todo"}'></div>
 *
 * data-config (todas opcionales):
 *   resaltar: "todo" (por defecto) | un filtro: "entradas", "salidas",
 *             "alimentacion", "programacion", "comunicacion", "puentes"
 *             | el nombre de un elemento para seleccionarlo al cargar:
 *             "USB", "J2", "U2" (MC7805), "U3" (3,3 V), "D4", "D5", "K1", "U5"
 *             (dsPIC), "SW1", "SW2", "JP1", "RV1", "JP2", "D6"…"D9", "JP3",
 *             "K2", "P4", "P5", "P6", "P7", "P8" (no distingue mayúsculas).
 *   tabla:    false para ocultar la tabla resumen de pines (por defecto se ve).
 *
 * Teclado: Tab recorre los elementos del dibujo; Intro o Espacio lo
 * seleccionan; con un elemento enfocado, las flechas pasan al siguiente o al
 * anterior e Inicio/Fin van al primero y al último.
 */
window.MPI = window.MPI || {};
MPI.componentes = MPI.componentes || {};

(function () {
  var NS = 'http://www.w3.org/2000/svg';

  // ==================================================================
  // Dibujo a escala de la PicTrainer v3.0 (en mm), adaptado de
  // interactive_lab (tarjeta/svg.ts). USB a la izquierda, P7/P8 arriba,
  // P5/P6 abajo. Las funciones no dependen de clases CSS: el color va
  // en el propio SVG, como en una foto de la placa.
  // ------------------------------------------------------------------
  var PT3 = { ancho: 74.75, alto: 54.7 };
  var PASO = 2.54;
  var DX = -3.8;
  var Y_ARRIBA = 1.9;
  var Y_ABAJO = Y_ARRIBA + 48.26;

  var CABECERAS_PT3 = {
    P8: { x1: 66.04 + DX, y: Y_ARRIBA, dx: -PASO, n: 8 },
    P7: { x1: 44.2 + DX, y: Y_ARRIBA, dx: -PASO, n: 10 },
    P5: { x1: 27.94 + DX, y: Y_ABAJO, dx: PASO, n: 8 },
    P6: { x1: 50.8 + DX, y: Y_ABAJO, dx: PASO, n: 6 }
  };
  var P4_PT3 = { x: 72.6, y1: 44.8, dy: -PASO, n: 6 };
  var PUNTOS_PRUEBA_PT3 = { P1: { x: 72.3, y: 25.4 }, P2: { x: 17.3, y: 49.2 }, P3: { x: 72.3, y: 18.7 } };
  var LEDS_PT3 = { D6: 24.8, D7: 29.1, D8: 33.4, D9: 37.7 };
  var X_LED_PT3 = 3.8, X_LED_ALIMENTACION_PT3 = 66.8;
  var PULSADORES_PT3 = { SW2: { x: 4.2, y: 2.6 }, SW1: { x: 68.9, y: 51.7 } };
  var RV1_PT3 = { x: 68.6, y: 8.4 };
  // Zócalo DIP-28: pin 1 en xIzq, fila de abajo (junto a la muesca); sube
  // hasta el 14 (arriba); el 15 sigue en xDer (arriba) y baja hasta el 28.
  var U5_PT3 = { xIzq: 50.54, xDer: 58.16, yPin1: 44.6 };

  var SERIGRAFIA = '#f2f2ea', LED_VERDE = '#4cc46a', LED_NARANJA = '#ef9a3a';
  var FUENTE_SVG = 'font-family="Arial,Helvetica,sans-serif"';
  function f(n) { return (Math.round(n * 100) / 100).toString(); }

  function dtxt(x, y, t, tam, opciones) {
    opciones = opciones || {};
    return '<text x="' + f(x) + '" y="' + f(y) + '" font-size="' + tam + '" ' + FUENTE_SVG +
      ' font-weight="' + (opciones.peso || 'normal') + '" fill="' + (opciones.color || SERIGRAFIA) + '"' +
      ' text-anchor="' + (opciones.ancla || 'middle') + '" dominant-baseline="central"' +
      (opciones.rot ? ' transform="rotate(' + opciones.rot + ' ' + f(x) + ' ' + f(y) + ')"' : '') + '>' + t + '</text>';
  }
  function marco(x, y, w, h) {
    return '<rect x="' + f(x - w / 2) + '" y="' + f(y - h / 2) + '" width="' + f(w) + '" height="' + f(h) +
      '" fill="none" stroke="' + SERIGRAFIA + '" stroke-width="0.12" opacity="0.8"/>';
  }
  function dosTerminales(x, y, tipo, opciones) {
    opciones = opciones || {};
    var w = 3.2, h = 1.6;
    var cuerpo = tipo === 'r' ? '#1d1d1d' : tipo === 'c' ? '#c9a27a' : '#f4f1e8';
    var partes = [
      '<rect x="' + f(-w / 2 - 0.35) + '" y="' + f(-h / 2 - 0.1) + '" width="' + f(w + 0.7) + '" height="' + f(h + 0.2) + '" rx="0.15" fill="#c9cdd2"/>',
      '<rect x="' + f(-w / 2 + 0.45) + '" y="' + f(-h / 2) + '" width="' + f(w - 0.9) + '" height="' + f(h) + '" fill="' + cuerpo + '"/>'
    ];
    if (tipo === 'led') partes.push('<rect x="-0.55" y="-0.45" width="1.1" height="0.9" rx="0.15" fill="' + (opciones.color || LED_VERDE) + '"/>');
    return marco(x, y, opciones.vertical ? 2.6 : 4.6, opciones.vertical ? 4.6 : 2.6) +
      '<g transform="translate(' + f(x) + ' ' + f(y) + ')' + (opciones.vertical ? ' rotate(90)' : '') + '">' + partes.join('') + '</g>';
  }
  function ledSMD(x, y, color) {
    color = color || LED_VERDE;
    return marco(x, y, 4.6, 2.6) + '<g transform="translate(' + f(x) + ' ' + f(y) + ')">' +
      '<rect x="-1.95" y="-0.9" width="3.9" height="1.8" rx="0.15" fill="#c9cdd2"/><rect x="-1.15" y="-0.8" width="2.3" height="1.6" fill="#f4f1e8"/>' +
      '<rect x="-0.55" y="-0.45" width="1.1" height="0.9" rx="0.15" fill="' + color + '"/></g>';
  }
  function tiraHembra(x0, y, n, dx) {
    var xs = [], i;
    for (i = 0; i < n; i++) xs.push(x0 + i * dx);
    var huecos = xs.map(function (x) {
      return '<rect x="' + f(x - 0.55) + '" y="' + f(y - 0.55) + '" width="1.1" height="1.1" fill="#050505" stroke="#3a3a3a" stroke-width="0.12"/>';
    }).join('');
    var xmin = Math.min.apply(null, xs);
    return '<rect x="' + f(xmin - PASO / 2) + '" y="' + f(y - 1.27) + '" width="' + f(n * PASO) + '" height="2.54" rx="0.15" fill="#1c1c1c" stroke="#000" stroke-width="0.1"/>' + huecos;
  }
  function tiraMacho(x0, y, n) {
    var xs = [], i;
    for (i = 0; i < n; i++) xs.push(x0 + i * PASO);
    return '<rect x="' + f(x0 - 1.27) + '" y="' + f(y - 1.27) + '" width="' + f(n * PASO) + '" height="2.54" fill="#151515"/>' +
      xs.map(function (x) { return '<rect x="' + f(x - 0.32) + '" y="' + f(y - 0.32) + '" width="0.64" height="0.64" fill="#d9b85a"/>'; }).join('');
  }
  function tapaJumper(vertical, color) {
    color = color || '#2a64c8';
    return vertical
      ? '<rect x="-1.25" y="-2.6" width="2.5" height="5.2" rx="0.35" fill="' + color + '" stroke="#000" stroke-width="0.15"/><rect x="-0.5" y="-2.1" width="1" height="0.7" fill="#000" opacity="0.5"/>'
      : '<rect x="-2.6" y="-1.25" width="5.2" height="2.5" rx="0.35" fill="' + color + '" stroke="#000" stroke-width="0.15"/><rect x="-0.35" y="-0.5" width="0.7" height="1" fill="#000" opacity="0.5"/>';
  }
  function pulsador(x, y) {
    return '<g transform="translate(' + f(x) + ' ' + f(y) + ')">' +
      [-3.4, 3.4].map(function (dx) { return '<rect x="' + f(dx - 0.4) + '" y="-2.6" width="0.8" height="5.2" fill="#b9bdc2"/>'; }).join('') +
      '<rect x="-3.1" y="-3.1" width="6.2" height="6.2" rx="0.3" fill="#2a2a2a" stroke="#9aa0a6" stroke-width="0.25"/>' +
      '<rect x="-3.1" y="-3.1" width="6.2" height="1.3" fill="#b9bdc2"/>' +
      '<circle cx="0" cy="0.4" r="1.75" fill="#111" stroke="#000" stroke-width="0.15"/></g>';
  }
  function puntoPrueba(x, y, color) {
    return '<circle cx="' + f(x) + '" cy="' + f(y) + '" r="1.25" fill="' + color + '" stroke="#3a1010" stroke-width="0.15"/>' +
      '<path d="M' + f(x - 0.8) + ' ' + f(y) + ' a0.8 0.8 0 0 1 1.6 0" fill="none" stroke="#d8d8d8" stroke-width="0.35"/>';
  }
  function taladro(x, y) {
    return '<circle cx="' + f(x) + '" cy="' + f(y) + '" r="1.75" fill="#5b6b4a" opacity="0.35"/><circle cx="' + f(x) + '" cy="' + f(y) + '" r="1.45" fill="#1a1a14"/>';
  }
  function soic(x, y, pares, vertical) {
    var paso = 1.27, patas = [], i, d;
    for (i = 0; i < pares; i++) {
      d = (i - (pares - 1) / 2) * paso;
      patas.push('<rect x="-3" y="' + f(d - 0.22) + '" width="1.05" height="0.44" fill="#c9cdd2"/>');
      patas.push('<rect x="1.95" y="' + f(d - 0.22) + '" width="1.05" height="0.44" fill="#c9cdd2"/>');
    }
    var alto = pares * paso + 0.3;
    return '<g transform="translate(' + f(x) + ' ' + f(y) + ')' + (vertical ? ' rotate(90)' : '') + '">' + patas.join('') +
      '<rect x="-1.95" y="' + f(-alto / 2) + '" width="3.9" height="' + f(alto) + '" fill="#1a1a1a"/><circle cx="-1.2" cy="' + f(-alto / 2 + 0.7) + '" r="0.3" fill="#333"/></g>';
  }
  function ssop16(x, y) {
    var patas = [], i, d;
    for (i = 0; i < 8; i++) {
      d = -2.275 + i * 0.65;
      patas.push('<rect x="' + f(d - 0.15) + '" y="-3.1" width="0.3" height="0.9" fill="#c9cdd2"/>');
      patas.push('<rect x="' + f(d - 0.15) + '" y="2.2" width="0.3" height="0.9" fill="#c9cdd2"/>');
    }
    return '<g transform="translate(' + f(x) + ' ' + f(y) + ')">' + patas.join('') +
      '<rect x="-2.5" y="-2.2" width="5" height="4.4" fill="#1a1a1a"/><circle cx="-1.8" cy="1.5" r="0.3" fill="#333"/>' +
      dtxt(0, -0.3, 'FT230X', 0.75, { color: '#9a9a9a' }) + '</g>';
  }
  function sot23(x, y) {
    return '<g transform="translate(' + f(x) + ' ' + f(y) + ')">' +
      '<rect x="-1.2" y="-1.6" width="0.45" height="0.8" fill="#c9cdd2"/><rect x="0.75" y="-1.6" width="0.45" height="0.8" fill="#c9cdd2"/><rect x="-0.22" y="0.8" width="0.45" height="0.8" fill="#c9cdd2"/>' +
      '<rect x="-1.45" y="-0.9" width="2.9" height="1.7" fill="#1a1a1a"/></g>';
  }
  function zocaloDip28() {
    var xIzq = U5_PT3.xIzq, xDer = U5_PT3.xDer, yPin1 = U5_PT3.yPin1;
    var yArriba = yPin1 - 13 * PASO, cx = (xIzq + xDer) / 2;
    var contactos = '', y, i;
    for (i = 0; i < 14; i++) {
      y = yPin1 - i * PASO;
      [xIzq, xDer].forEach(function (x) {
        contactos += '<circle cx="' + f(x) + '" cy="' + f(y) + '" r="0.75" fill="#c9cdd2"/><circle cx="' + f(x) + '" cy="' + f(y) + '" r="0.35" fill="#6d7278"/>';
      });
    }
    return '<rect x="' + f(xIzq - 1.6) + '" y="' + f(yArriba - 2) + '" width="' + f(xDer - xIzq + 3.2) + '" height="' + f(yPin1 - yArriba + 4) + '" rx="0.3" fill="#151515"/>' + contactos +
      '<rect x="' + f(xIzq + 0.6) + '" y="' + f(yArriba - 1.6) + '" width="' + f(xDer - xIzq - 1.2) + '" height="' + f(yPin1 - yArriba + 3.2) + '" rx="0.3" fill="#222"/>' +
      '<path d="M' + f(cx - 1.1) + ' ' + f(yPin1 + 1.6) + ' a1.1 1.1 0 0 1 2.2 0" fill="#111"/>' +
      dtxt(cx, (yPin1 + yArriba) / 2, 'DSPIC33FJ32MC202', 1.05, { rot: -90, color: '#9a9a9a', peso: '700' });
  }
  function potenciometro(x, y) {
    return '<g transform="translate(' + f(x) + ' ' + f(y) + ')">' +
      '<rect x="-4.75" y="-5.2" width="9.5" height="10.4" rx="0.5" fill="#2557b8" stroke="#163a80" stroke-width="0.2"/>' +
      '<circle cx="0.2" cy="-0.4" r="3.9" fill="#3d77e0" stroke="#1d4596" stroke-width="0.25"/><circle cx="0.2" cy="-0.4" r="3.1" fill="#4a86ee"/>' +
      '<path d="M0.2 -3.4 L0.2 2.4 M-0.6 -2.4 L0.2 -3.4 L1 -2.4" stroke="#1d3f80" stroke-width="0.55" fill="none"/></g>';
  }
  function usbB() {
    return '<rect x="-7.9" y="7.8" width="17" height="13.2" rx="0.6" fill="#cdd1d6" stroke="#7d828a" stroke-width="0.25"/>' +
      '<rect x="-7.9" y="9.6" width="12" height="9.6" fill="#e7e9ec" stroke="#9aa0a6" stroke-width="0.15"/>' +
      '<rect x="1.5" y="10.6" width="1.6" height="1.6" fill="#7d828a"/><rect x="1.5" y="16.6" width="1.6" height="1.6" fill="#7d828a"/><rect x="5.8" y="13.4" width="1.2" height="2.4" fill="#7d828a"/>';
  }
  function jackDC() {
    return '<rect x="-5.3" y="40.3" width="15.9" height="9.6" rx="0.4" fill="#151515" stroke="#000" stroke-width="0.2"/>' +
      '<rect x="-5.3" y="41.6" width="3" height="7" fill="#222"/><circle cx="-3.6" cy="45.1" r="1.8" fill="#0a0a0a"/><rect x="8.6" y="43.4" width="2.6" height="3.4" fill="#c9cdd2"/>';
  }
  function dpak(x, y, marca) {
    return '<g transform="translate(' + f(x) + ' ' + f(y) + ')">' +
      '<rect x="-3.3" y="-5.4" width="6.6" height="2.4" fill="#c9cdd2"/><rect x="-3.3" y="-3.6" width="6.6" height="7" rx="0.3" fill="#2b2b2b"/>' +
      [-2.3, 2.3].map(function (dx) { return '<rect x="' + f(dx - 0.4) + '" y="3.4" width="0.8" height="2" fill="#c9cdd2"/>'; }).join('') +
      dtxt(0, -0.8, marca, 0.95, { color: '#c8c8c8' }) + '</g>';
  }

  /** Posición física (mm) del pin n (1-28) del zócalo DIP-28. */
  function pinXY(n) {
    if (n <= 14) return { x: U5_PT3.xIzq, y: U5_PT3.yPin1 - (n - 1) * PASO };
    var yArriba = U5_PT3.yPin1 - 13 * PASO;
    return { x: U5_PT3.xDer, y: yArriba + (n - 15) * PASO };
  }

  var CATS = [
    { id: 'todo', txt: 'Todo' },
    { id: 'entradas', txt: 'Entradas' },
    { id: 'salidas', txt: 'Salidas' },
    { id: 'alimentacion', txt: 'Alimentación' },
    { id: 'programacion', txt: 'Programación' },
    { id: 'comunicacion', txt: 'Comunicación' },
    { id: 'puentes', txt: 'Puentes' }
  ];
  var DESC_CAT = {
    todo: 'Todos los bloques de la tarjeta. Pulsa uno (o recórrelos con Tab) para ver sus detalles.',
    entradas: '<strong>Entradas</strong>: reset SW1 (MCLR), pulsador SW2 (RB2), potenciómetro RV1 (AN5) con sus puentes, y el conector P6 (A0-A5 de Arduino).',
    salidas: '<strong>Salidas</strong>: LEDs D6-D9 en RB15-RB12 (activos a nivel bajo), su puente JP3 y el conector P7, por el que salen también RB12-RB15.',
    alimentacion: '<strong>Alimentación</strong>: USB, jack J2 + MC7805 (5 V), regulador de 3,3 V, selección K1/automática, LEDs D4 (5 V) y D5 (3,3 V) y el conector P5.',
    programacion: '<strong>Programación</strong>: conector P4 (MCLR, PGD = RB0, PGC = RB1) y el reset SW1.',
    comunicacion: '<strong>Comunicación</strong>: USB-serie FT230XS, selector K2 de la UART, P8 (pines 0-1 = RX/TX de Arduino) y P7 (SDA/SCL del I2C).',
    puentes: '<strong>Puentes</strong>: JP1 (SW2), JP2 (RV1), JP3 (LEDs), selector K2 (destino de la UART) y K1 (alimentación manual; la tarjeta del laboratorio usa la selección automática).'
  };

  // ------------------------------------------------------------------
  // Tablas de pines de los conectores (pin del conector, señal, pin del
  // micro, equivalente Arduino). Leídas del esquema (figura 126).
  // ------------------------------------------------------------------
  var CON = {
    P4: { cab: ['P4', 'Señal', 'Pin del micro'], filas: [
      ['1', 'MCLR (Reset)', '1'], ['2', '+3,3 V', '—'], ['3', 'GND', '—'],
      ['4', 'PGD = PGED1/RB0', '4'], ['5', 'PGC = PGEC1/RB1', '5'], ['6', 'sin conectar', '—']] },
    P5: { cab: ['P5', 'Señal', 'Arduino'], filas: [
      ['1', 'sin conectar', '—'], ['2', '+5 V', 'IOREF'], ['3', 'Reset_n (no va al MCLR)', 'RESET'],
      ['4', '+3,3 V', '3.3V'], ['5', '+5 V', '5V'], ['6', 'GND', 'GND'], ['7', 'GND', 'GND'], ['8', 'Vin', 'Vin']] },
    P6: { cab: ['P6', 'Señal (pin del micro)', 'Arduino'], filas: [
      ['1', 'RA0/AN0 (2)', 'A0'], ['2', 'RA1/AN1 (3)', 'A1'], ['3', 'RB0/AN2 = PGD (4)', 'A2'],
      ['4', 'RB1/AN3 = PGC (5)', 'A3'], ['5', 'RB2/AN4 (6) · SW2 por JP1', 'A4'], ['6', 'RB3/AN5 (7) · RV1 por JP2', 'A5']] },
    P7: { cab: ['P7', 'Señal (pin del micro)', 'Arduino'], filas: [
      ['1', 'RA3 (10)', '8'], ['2', 'RA4 (12)', '9'], ['3', 'RB12 (23) · LED D9', '10'],
      ['4', 'RB13 (24) · LED D8', '11'], ['5', 'RB14 (25) · LED D7', '12'], ['6', 'RB15 (26) · LED D6', '13'],
      ['7', 'GND', 'GND'], ['8', 'sin conectar', 'AREF'], ['9', 'RB9/SDA1 (18)', 'SDA'], ['10', 'RB8/SCL1 (17)', 'SCL']] },
    P8: { cab: ['P8', 'Señal (pin del micro)', 'Arduino'], filas: [
      ['1', 'U1ARX → K2-3 (llega a RB5 si K2 = 2-3)', '0 (RX)'], ['2', 'U1TX = RB4 (11)', '1 (TX)'],
      ['3', 'RA2 (9)', '2'], ['4', 'RB6 (15)', '3'], ['5', 'RB7 (16)', '4'], ['6', 'RB9/SDA1 (18)', '5'],
      ['7', 'RB10 (21)', '6'], ['8', 'RB11 (22)', '7']] }
  };

  var COD_REMAPEO =
    '/* Desbloquea el remapeo (IOLOCK = 0) */\n' +
    '__builtin_write_OSCCONL(OSCCON & ~0x40);\n' +
    'RPINR18bits.U1RXR = 5;  // U1RX en RP5 (pin 14)\n' +
    'RPOR2bits.RP4R = 3;     // U1TX en RP4 (pin 11)\n' +
    '/* Bloquea el remapeo */\n' +
    '__builtin_write_OSCCONL(OSCCON | 0x40);';

  function codLed(nom, rb, mask) {
    return 'TRISB = 0x0FFF;  // LEDs como salidas\n\n' +
      '/* Encender ' + nom + ' (RB' + rb + ' = 0) */\n' +
      'PORTB &= ~' + mask + ';\n\n' +
      '/* Apagar ' + nom + ' (RB' + rb + ' = 1), más tarde */\n' +
      'PORTB |= ' + mask + ';';
  }

  function led(id, rb, pinF, res, pwm) {
    return {
      id: id, tit: 'LED ' + id + ' (rojo)', cats: ['salidas'], pines: [pinF],
      ancla: [X_LED_PT3, LEDS_PT3[id]], rel: ['JP3', 'P7'],
      que: 'Uno de los cuatro LEDs rojos de usuario. Lo enciende el programa escribiendo en <code>PORTB</code>.',
      pin: '<strong>RB' + rb + '</strong> (pin físico <strong>' + pinF + '</strong>; también ' + pwm + '/RP' + rb + '). Sale además por P7.',
      nivel: function (st) {
        return 'Ánodo a +3,3 V (a través de JP3 y ' + res + ' = 270 Ω) y cátodo al pin → <strong>activo a nivel bajo</strong>: ' +
          '<strong>RB' + rb + ' = 0 enciende</strong>, 1 apaga. Con el pin como entrada (TRISB a 1) queda apagado.' +
          (st.JP3 ? '' : ' <em>Ahora JP3 está quitado: no luce aunque el pin esté a 0.</em>');
      },
      puente: '<strong>JP3</strong> (común a los cuatro LEDs): si se quita, ningún LED luce y RB12-RB15 quedan libres.',
      comp: res + ' = 270 Ω en serie.',
      codigo: codLed(id, rb, '0x' + (1 << rb).toString(16).toUpperCase())
    };
  }

  // ------------------------------------------------------------------
  // Elementos de la tarjeta (en orden de tabulación).
  // ------------------------------------------------------------------
  var ELEMS = [
    { id: 'USB', tit: 'Conector USB (J1) y conversor FT230XS (U1)', cats: ['comunicacion', 'alimentacion'],
      pines: [11, 14], ancla: [12, 11], rel: ['K2'],
      que: 'Conector USB J1 y chip <strong>FT230XS</strong> (U1), un conversor de USB a puerto serie asíncrono: el PC lo ve como un puerto COM (driver FTDI) y por él se comunica con la <strong>UART1</strong> del micro. El USB también puede alimentar la tarjeta (5 V de VBUS, señal USB_Power).',
      pin: 'Salida TXD del FT230XS (USB_Txd) → K2-1 → con K2 en 1-2 llega a <strong>U1RX = RB5</strong> (RP5, pin <strong>14</strong>). Entrada RXD del FT230XS (USB_Rxd) ← <strong>U1TX = RB4</strong> (RP4, pin <strong>11</strong>), siempre conectada.',
      nivel: 'Línea serie: en reposo a 1. El FT230XS se alimenta a 5 V (VCC), pero su VCCIO está unido a su salida 3V3OUT: TXD y RXD trabajan a 3,3 V.',
      comp: 'Ferrita L1 (600 Ω a 100 MHz) en VBUS; R1 = R2 = 27 Ω y C3 = C5 = 47 pF en D−/D+; LEDs naranjas D1 y D2 (con R3 = R4 = 270 Ω) en CBUS1/CBUS2, que parpadean al recibir y transmitir.',
      codigo: COD_REMAPEO },

    { id: 'K2', tit: 'Selector K2 de la UART', cats: ['comunicacion', 'puentes'], pines: [14], ancla: [54.5, 6.6],
      rel: ['USB', 'P8'], selector: 'K2',
      que: 'Puente de 3 pines que decide de dónde <strong>recibe</strong> la UART1 del micro: del USB (FT230XS) o del conector de expansión compatible Arduino (p. ej. un módulo Bluetooth o Wi-Fi).',
      pin: 'El pin central (K2-2) es <strong>U1RX = RB5</strong> (RP5, pin <strong>14</strong>). K2-1 = TXD del FT230XS; K2-3 = pin 1 de P8 (pin 0, RX, de Arduino).',
      posiciones: function (st) {
        return '<strong>1-2: USB</strong> (FT230XS) · <strong>2-3: conector Arduino</strong> (P8-1). Ahora: <strong>' +
          (st.K2 === '12' ? '1-2 → U1RX recibe del PC por USB.' : '2-3 → U1RX recibe del pin 0 (RX) de P8; lo que envíe el PC no llega al micro.') + '</strong>' +
          ' En ambas posiciones <strong>U1TX (RB4) va a la vez</strong> al FT230XS y a P8-2: K2 solo conmuta la recepción.';
      },
      codigo: COD_REMAPEO,
      nota: 'La Práctica 2 dice «configurar el jumper K2 para alimentación USB», pero según el anexo C K2 selecciona el destino de la UART y la alimentación se elige con K1 (o automáticamente).' },

    { id: 'P4', tit: 'Conector de programación P4', cats: ['programacion'], pines: [1, 4, 5], ancla: [72.6, 38],
      rel: ['SW1', 'P6'], con: 'P4',
      que: 'Conector de 6 pines (ICSP) por el que MPLAB X graba el programa en la FLASH y depura. Usa el canal 1 de programación (PGED1/PGEC1). En el esquema está rotulado «Conector JTAG», pero lleva las señales ICSP, no las JTAG.',
      pin: '<strong>MCLR</strong> (pin 1), <strong>PGD = RB0</strong> (pin 4) y <strong>PGC = RB1</strong> (pin 5), además de 3,3 V y GND.',
      nivel: 'MCLR activo a nivel bajo: el programador lo baja para reiniciar el micro al grabar.',
      extra: 'Mientras se programa o depura, RB0 y RB1 están ocupados: no los uses para otra cosa (también salen por P6-3 y P6-4). La etiqueta «P4» está serigrafiada junto al pin 1. El programador se conecta por la cara inferior: P4 se suelda «al revés», con la tira de seis pines accesible por debajo (Práctica 1).' },

    { id: 'J2', tit: 'Jack de alimentación J2', cats: ['alimentacion'], pines: [], ancla: null, rel: ['U2', 'K1'],
      que: 'Entrada para una fuente externa de continua. No necesita estar regulada, pero debe dar <strong>más de 7 V</strong> (se recomienda entre 7,5 y 9 V): el MC7805 la baja a 5 V.',
      pin: 'No va a ningún pin del micro.',
      comp: 'Diodo D3 en serie (protege si se invierte la polaridad) y C7 = 0,33 µF cerámico a la entrada del MC7805. La entrada <strong>Vin</strong> del conector P5 (pin 8) se une a este nudo, detrás de D3: por ella también se puede alimentar la tarjeta (p. ej. con baterías).',
      extra: 'Con más de 9 V el MC7805 disipa I·(Vin − 5 V) y se calienta en exceso, además de desperdiciar energía.' },

    { id: 'U2', tit: 'Regulador MC7805 (U2)', cats: ['alimentacion'], pines: [], ancla: null, rel: ['J2', 'U3'],
      que: 'Regulador lineal que obtiene <strong>5 V</strong> de la fuente externa (jack J2 o Vin de P5).',
      pin: 'No va a ningún pin del micro: alimenta la línea de 5 V (y de ella el regulador de 3,3 V).',
      comp: 'C8 = 100 nF a la salida. El esquema pide un relleno de cobre de 3 × 3 cm en el PCB para disipar el calor.',
      extra: 'Disipa una potencia igual a la corriente que consume la placa por (Vin − 5 V): por eso no conviene alimentar con más de 9 V.' },

    { id: 'U3', tit: 'Regulador de 3,3 V (U3, MCP1700)', cats: ['alimentacion'], pines: [13, 28], ancla: [37.9, 41.3], rel: ['D5'],
      que: 'Regulador de baja caída (LDO) que obtiene de los 5 V la tensión de <strong>3,3 V</strong> con la que funcionan el micro, los LEDs D6-D9, el pulsador SW2 y el potenciómetro RV1.',
      pin: 'Alimenta <strong>VDD</strong> (pin 13) y <strong>AVDD</strong> (pin 28); masa en VSS (8, 19) y AVSS (27).',
      comp: 'C9 = C10 = 1 µF cerámicos X7R. Puntos de prueba para el osciloscopio y el polímetro: P1 (3,3 V), P2 (GND) y P3 (5 V).' },

    { id: 'D4', tit: 'LED D4 · «+5 V OK»', cats: ['alimentacion'], pines: [], ancla: null, rel: ['D5'],
      que: 'LED verde que indica que hay <strong>5 V</strong> en la tarjeta.',
      pin: 'No lo controla el micro: está entre +5 V y masa.',
      nivel: 'Encendido siempre que la tarjeta está alimentada (por USB, J2 o Vin).',
      comp: 'R5 = 560 Ω en serie.' },

    { id: 'D5', tit: 'LED D5 · «+3,3 V OK»', cats: ['alimentacion'], pines: [], ancla: null, rel: ['D4', 'U3'],
      que: 'LED verde que indica que el regulador genera los <strong>3,3 V</strong> del micro.',
      pin: 'No lo controla el micro: está entre +3,3 V y masa.',
      nivel: 'Encendido si hay 3,3 V. Si D4 luce y D5 no, falla el regulador de 3,3 V (o hay un cortocircuito en esa línea).',
      comp: 'R6 = 270 Ω en serie.' },

    { id: 'K1', tit: 'Selección de alimentación: K1 (manual) o Q1/U4 (automática)', cats: ['alimentacion', 'puentes'],
      pines: [], ancla: null, rel: ['USB', 'J2'],
      que: 'Elige de dónde salen los 5 V. Hay dos montajes alternativos: <strong>manual</strong>, soldando el puente K1, o <strong>automático</strong>, soldando el transistor P-MOS Q1, el comparador U4 y las resistencias R7-R10. La tarjeta del laboratorio usa el <strong>automático</strong> (es muy frecuente olvidarse de poner K1 en su sitio): no hay que mover nada.',
      pin: 'No va a ningún pin del micro.',
      posiciones: '<strong>K1 en 2-3</strong>: alimentación desde el USB. <strong>K1 en 1-2</strong>: desde la fuente externa (J2) o baterías (Vin de P5), a través del MC7805.',
      extra: '<strong>Modo automático</strong>: el comparador U4A (LM2903) compara Vin/2 (divisor R8 = R9 = 24 kΩ) con 3,3 V. Con fuente externa (Vin por encima de unos 6,6 V) su salida, con R10 = 15 kΩ a 5 V, corta el P-MOS Q1 y desconecta USB_Power; sin ella, Q1 conduce y la tarjeta se alimenta del USB. R7 (0 Ω) une la salida del MC7805 con la línea de 5 V.',
      nota: 'La Práctica 2 habla de «configurar el jumper K2 para alimentación USB»; según el anexo C, la alimentación se elige con K1 (o automáticamente) y K2 es el selector de la UART.' },

    { id: 'U5', tit: 'Zócalo del dsPIC33FJ32MC202 (U5)', cats: [], pines: [8, 13, 19, 20, 27, 28], ancla: null,
      que: 'Microcontrolador de 16 bits y 28 pines montado en un zócalo DIP. La <strong>muesca</strong> (abajo) marca el lado del pin 1: pin 1 en la columna izquierda, fila de abajo, subiendo hasta el 14 arriba; el 15 sigue en la columna derecha, arriba, y baja hasta el 28, justo al otro lado de la muesca.',
      pin: 'Alimentación: <strong>VDD</strong> (13) y <strong>AVDD</strong> (28) a 3,3 V; <strong>VSS</strong> (8, 19) y <strong>AVSS</strong> (27) a masa; <strong>VCAP</strong> (20) con C16 = 10 µF cerámico X7R, que permite funcionar al regulador interno del núcleo.',
      comp: 'Desacoplo C14 = C15 = 100 nF cerámicos X7R junto a las patillas de alimentación. Para funcionar solo necesita 3,3 V, el circuito de reset (SW1, R11, C12) y C16; el reloj es el oscilador FRC interno.',
      extra: 'Comprobación antes de montar el micro (Práctica 1): con la tarjeta alimentada, en el zócalo los pines 1, 13 y 28 deben dar 3,3 V y los pines 8, 19 y 27, 0 V.',
      codigo: 'int main(void)\n{\n    InicializarReloj();  // FCY ≈ 40 MHz\n    AD1PCFGL = 0xFFFF;   // AN0-AN5 digitales\n    PORTB = 0xEFFF;      // D9 (RB12) encendido\n    TRISB = 0x0FFF;      // RB12-RB15 salidas\n    while (1) {\n    }\n}',
      nota: 'El anexo C habla de encapsulado «DIP»; el datasheet lo llama SPDIP (28 pines), el único de sus encapsulados que usa zócalo de inserción.' },

    { id: 'SW1', tit: 'Pulsador de reset SW1', cats: ['entradas', 'programacion'], pines: [1], ancla: [68.9, 51.7], rel: ['P4', 'U5'],
      que: 'Pulsador que reinicia el microcontrolador: al soltarlo el programa vuelve a empezar desde el principio.',
      pin: '<strong>MCLR</strong> (pin físico <strong>1</strong>), a través de R13 = 470 Ω. El programador actúa sobre el mismo pin por P4-1.',
      nivel: '<strong>MCLR es activo a nivel bajo</strong>: R11 = 10 kΩ lo mantiene a 3,3 V (funcionamiento normal); al pulsar SW1 pasa a 0 y el micro queda en reset. C12 = 100 nF filtra los rebotes.',
      extra: 'El reset del conector de expansión (P5-3, «Reset_n») <strong>no</strong> está conectado al MCLR: según una nota del esquema, la tarjeta ShieldComm tiene un supervisor de reset con salida push-pull que podría dar problemas al pulsar este reset o interferir con el programador.' },

    { id: 'D6', tit: '', cats: [], pines: [] }, // se sustituyen abajo
    { id: 'D7', tit: '', cats: [], pines: [] },
    { id: 'D8', tit: '', cats: [], pines: [] },
    { id: 'D9', tit: '', cats: [], pines: [] },

    { id: 'JP3', tit: 'Puente JP3 · «Habilita los LEDs»', cats: ['puentes', 'salidas'], pines: [23, 24, 25, 26], ancla: [12.6, 34.6],
      rel: ['D6', 'D7', 'D8', 'D9', 'P7'], jumper: 'JP3',
      que: 'Une +3,3 V con las cuatro resistencias de 270 Ω (R14-R17) de los LEDs D6-D9.',
      pin: '<strong>RB15</strong> (26) = D6, <strong>RB14</strong> (25) = D7, <strong>RB13</strong> (24) = D8, <strong>RB12</strong> (23) = D9.',
      puesto: 'Los LEDs funcionan: un 0 en RB12-RB15 enciende el LED correspondiente (activos a nivel bajo).',
      quitado: 'Los LEDs se quedan sin alimentación y no lucen aunque el pin esté a 0: <strong>RB12-RB15 quedan libres</strong>, por ejemplo para sacar las salidas PWM1 (PWM1H2/L2/H1/L1) por los pines 3-6 de <strong>P7</strong> hacia un L293D (puente H).' },

    { id: 'SW2', tit: 'Pulsador SW2', cats: ['entradas'], pines: [6], ancla: [4.2, 2.6], rel: ['JP1'],
      que: 'Pulsador de usuario: el programa lee su estado en el puerto B.',
      pin: '<strong>RB2</strong> (pin físico <strong>6</strong>; también AN4/RP2/CN6), a través de JP1. Sale además por P6-5.',
      nivel: function (st) {
        return 'Pull-up R12 = 10 kΩ a 3,3 V y a masa al pulsar: suelto = 1, <strong>PULSADO = 0</strong>. C13 = 100 nF filtra los rebotes. ' +
          'Ojo: tras el reset RB2 es analógico (AN4) y se lee siempre 0 (parecería siempre pulsado) hasta escribir <code>AD1PCFGL = 0xFFFF</code>.' +
          (st.JP1 ? '' : ' <em>Ahora JP1 está quitado: el pulsador no llega a RB2.</em>');
      },
      puente: '<strong>JP1</strong>: si se quita, SW2 se desconecta de RB2 y el pin queda libre.',
      codigo: 'AD1PCFGL = 0xFFFF;  // RB2 (AN4) digital\nTRISB |= 0x0004;    // RB2 entrada\n\nif ((PORTB & 0x0004) == 0) {\n    /* SW2 pulsado */\n}' },

    { id: 'JP1', tit: 'Puente JP1 (pulsador SW2)', cats: ['puentes', 'entradas'], pines: [6], ancla: [61.7, 31.0], rel: ['SW2'], jumper: 'JP1',
      que: 'Une el pulsador SW2 (con su pull-up R12 y su condensador C13) con RB2.',
      pin: '<strong>RB2</strong> (pin físico <strong>6</strong>).',
      puesto: 'SW2 conectado a RB2: se lee 1 con el pulsador suelto y 0 pulsado.',
      quitado: 'SW2 desconectado: <strong>RB2 queda libre</strong> (sale por P6-5, A4 de Arduino) para otro uso, como entrada analógica AN4 o E/S digital. Ojo: sin nada conectado, RB2 como entrada queda al aire y su lectura es indefinida.' },

    { id: 'RV1', tit: 'Potenciómetro RV1', cats: ['entradas'], pines: [7], ancla: [68.6, 8.4], rel: ['JP2'],
      que: 'Potenciómetro de 10 kΩ (Bourns 3386F-1-103TLF) entre 3,3 V y masa: su cursor da una tensión entre 0 y 3,3 V para practicar con el conversor A/D.',
      pin: '<strong>AN5 = RB3</strong> (pin físico <strong>7</strong>), a través de JP2. Sale además por P6-6.',
      nivel: function (st) {
        return 'Señal <strong>analógica</strong>: el conversor de 10 bits da de 0 (0 V) a 1023 (3,3 V). El pin debe ser analógico (bit 5 de AD1PCFGL a 0) y entrada.' +
          (st.JP2 ? '' : ' <em>Ahora JP2 está quitado: el cursor no llega a AN5.</em>');
      },
      puente: '<strong>JP2</strong>: si se quita, el potenciómetro se desconecta de AN5/RB3.',
      codigo: '/* AN5 analógico: AD1PCFGL = 0xFFDF */\ninit_ad(0x20);\n\n/* 0 (0 V) ... 1023 (3,3 V) */\nint pot = get_ad(5);' },

    { id: 'JP2', tit: 'Puente JP2 (potenciómetro RV1)', cats: ['puentes', 'entradas'], pines: [7], ancla: [66.2, 1.9], rel: ['RV1'], jumper: 'JP2',
      que: 'Une el cursor del potenciómetro RV1 con AN5/RB3.',
      pin: '<strong>AN5 = RB3</strong> (pin físico <strong>7</strong>).',
      puesto: 'El cursor de RV1 llega a AN5: <code>get_ad(5)</code> lee la posición del potenciómetro.',
      quitado: 'RV1 desconectado: <strong>RB3/AN5 queda libre</strong> (sale por P6-6, A5 de Arduino), por ejemplo para medir otra tensión analógica externa o usarlo como E/S digital.' },

    { id: 'P5', tit: 'Conector de expansión P5 (alimentación)', cats: ['alimentacion'], pines: [], ancla: null, con: 'P5', rel: ['J2', 'SW1'],
      que: 'Bloque de alimentación del conector compatible Arduino (8 pines). Por <strong>Vin</strong> (pin 8) se puede alimentar la tarjeta con baterías; entra por el mismo nudo que el jack J2, antes del MC7805.',
      pin: 'Ningún pin de E/S del micro. El pin 3 (Reset_n) no está conectado al MCLR.',
      extra: 'El pin 2 (posición IOREF de Arduino) está unido a +5 V según el esquema.' },

    { id: 'P6', tit: 'Conector de expansión P6 (A0-A5)', cats: ['entradas'], pines: [2, 3, 4, 5, 6, 7], ancla: null, con: 'P6', rel: ['P4', 'JP1', 'JP2'],
      que: 'Bloque de entradas analógicas del conector compatible Arduino (6 pines): las seis entradas AN0-AN5 del conversor A/D.',
      pin: 'RA0, RA1 y RB0-RB3 (pines 2-7). Comparte RB0/RB1 con la programación (P4) y RB2/RB3 con SW2/RV1 (quita JP1/JP2 para usarlos).' },

    { id: 'P7', tit: 'Conector de expansión P7 (8-13, SDA, SCL)', cats: ['salidas', 'comunicacion'], pines: [10, 12, 23, 24, 25, 26, 18, 17],
      ancla: null, con: 'P7', rel: ['JP3'],
      que: 'Bloque de 10 pines del conector compatible Arduino. RB12-RB15 están en los pines 3-6 (donde Arduino tiene el SPI) y el I2C (SDA1/SCL1) en los pines 9 y 10, como en Arduino.',
      pin: 'RA3, RA4, RB12-RB15, RB9 y RB8 (pines 10, 12, 23-26, 18 y 17).',
      extra: 'RB12-RB15 son también los LEDs D9-D6 y las salidas PWM1: para sacar PWM por P7 (p. ej. hacia un L293D) hay que <strong>quitar JP3</strong>. La capacidad PWM es la del Arduino Uno salvo en el pin 9 de Arduino (P7-2, RA4).' },

    { id: 'P8', tit: 'Conector de expansión P8 (0-7)', cats: ['comunicacion'], pines: [14, 11, 9, 15, 16, 18, 21, 22],
      ancla: null, con: 'P8', rel: ['K2'],
      que: 'Bloque de 8 pines del conector compatible Arduino. Los dos pines de la UART están en las posiciones 0 (RX) y 1 (TX), como en Arduino.',
      pin: 'U1RX (pin 14, solo con K2 en 2-3), U1TX = RB4 (11), RA2 (9), RB6 (15), RB7 (16), RB9 (18), RB10 (21) y RB11 (22).',
      extra: 'U1TX (RB4) llega siempre a P8-2, aunque K2 esté en 1-2. Para que el micro reciba por P8-1 hay que poner K2 en 2-3.',
      codigo: COD_REMAPEO }
  ];

  // Sustituye los marcadores de los LEDs.
  var DATOS_LED = {
    D6: led('D6', 15, 26, 'R14', 'PWM1L1'),
    D7: led('D7', 14, 25, 'R15', 'PWM1H1'),
    D8: led('D8', 13, 24, 'R16', 'PWM1L2'),
    D9: led('D9', 12, 23, 'R17', 'PWM1H2')
  };
  ELEMS = ELEMS.map(function (e) { return DATOS_LED[e.id] || e; });
  var POR_ID = {};
  ELEMS.forEach(function (e) { POR_ID[e.id] = e; });

  // Cables (conexión de cada pin de un conector a su pin del micro).
  var CABLES_CON = {
    P6: [[1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7]],
    P7: [[1, 10], [2, 12], [3, 23], [4, 24], [5, 25], [6, 26], [9, 18], [10, 17]],
    P8: [[1, 14], [2, 11], [3, 9], [4, 15], [5, 16], [6, 18], [7, 21], [8, 22]]
  };

  // ------------------------------------------------------------------
  // Tabla resumen de los 28 pines.  estado: libre | puente | prog | uart | alim | reset
  // ------------------------------------------------------------------
  var TABLA = [
    [1, 'MCLR', 'Reset: SW1 (R11, C12, R13) y P4-1', '— (P5-3 no conectado)', 'reset'],
    [2, 'RA0/AN0', '—', 'P6-1 (A0)', 'libre'],
    [3, 'RA1/AN1', '—', 'P6-2 (A1)', 'libre'],
    [4, 'RB0/AN2/PGED1', 'PGD del conector P4', 'P6-3 (A2)', 'prog'],
    [5, 'RB1/AN3/PGEC1', 'PGC del conector P4', 'P6-4 (A3)', 'prog'],
    [6, 'RB2/AN4', 'Pulsador SW2 (JP1), pulsado = 0', 'P6-5 (A4)', 'puente'],
    [7, 'RB3/AN5', 'Potenciómetro RV1 (JP2)', 'P6-6 (A5)', 'puente'],
    [8, 'VSS', 'Masa', '—', 'alim'],
    [9, 'RA2', '—', 'P8-3 (2)', 'libre'],
    [10, 'RA3', '—', 'P7-1 (8)', 'libre'],
    [11, 'RB4/RP4', 'U1TX → FT230XS', 'P8-2 (1, TX)', 'uart'],
    [12, 'RA4', '—', 'P7-2 (9)', 'libre'],
    [13, 'VDD', '+3,3 V', '—', 'alim'],
    [14, 'RB5/RP5', 'U1RX ← K2 (1-2 FT230XS, 2-3 P8-1)', 'P8-1 (0, RX) con K2 en 2-3', 'uart'],
    [15, 'RB6', '—', 'P8-4 (3)', 'libre'],
    [16, 'RB7', '—', 'P8-5 (4)', 'libre'],
    [17, 'RB8/SCL1', '—', 'P7-10 (SCL)', 'libre'],
    [18, 'RB9/SDA1', '—', 'P7-9 (SDA) y P8-6 (5)', 'libre'],
    [19, 'VSS', 'Masa', '—', 'alim'],
    [20, 'VCAP', 'C16 = 10 µF a masa', '—', 'alim'],
    [21, 'RB10', '—', 'P8-7 (6)', 'libre'],
    [22, 'RB11', '—', 'P8-8 (7)', 'libre'],
    [23, 'RB12', 'LED D9 (JP3), activo a nivel bajo', 'P7-3 (10)', 'puente'],
    [24, 'RB13', 'LED D8 (JP3), activo a nivel bajo', 'P7-4 (11)', 'puente'],
    [25, 'RB14', 'LED D7 (JP3), activo a nivel bajo', 'P7-5 (12)', 'puente'],
    [26, 'RB15', 'LED D6 (JP3), activo a nivel bajo', 'P7-6 (13)', 'puente'],
    [27, 'AVSS', 'Masa analógica', '—', 'alim'],
    [28, 'AVDD', '+3,3 V', '—', 'alim']
  ];
  var ESTADO_TXT = { libre: 'Libre', puente: 'Libre quitando puente', prog: 'Programación', uart: 'UART', alim: 'Alimentación', reset: 'Reset' };

  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  // ------------------------------------------------------------------
  // Dibujo
  // ------------------------------------------------------------------
  function conectorP4Dibujo() {
    var ys = [], i;
    for (i = 0; i < P4_PT3.n; i++) ys.push(P4_PT3.y1 + i * P4_PT3.dy);
    var ymin = Math.min.apply(null, ys), ymax = Math.max.apply(null, ys);
    var h = '<rect x="' + f(P4_PT3.x - 1.35) + '" y="' + f(ymin - 1.35) + '" width="2.7" height="' + f(ymax - ymin + 2.7) + '" fill="none" stroke="' + SERIGRAFIA + '" stroke-width="0.12"/>';
    ys.forEach(function (y, i) {
      h += (i === 0 ? '<rect x="' + f(P4_PT3.x - 0.8) + '" y="' + f(y - 0.8) + '" width="1.6" height="1.6" fill="#d9b85a"/>' : '<circle cx="' + f(P4_PT3.x) + '" cy="' + f(y) + '" r="0.8" fill="#d9b85a"/>') +
        '<circle cx="' + f(P4_PT3.x) + '" cy="' + f(y) + '" r="0.42" fill="#14140f"/>';
    });
    return h;
  }

  function conectorHembraDibujo(id) {
    var c = CABECERAS_PT3[id];
    return tiraHembra(c.x1, c.y, c.n, c.dx);
  }
  function conectorHembraHit(id, margen) {
    var c = CABECERAS_PT3[id];
    var xs = [], i;
    for (i = 0; i < c.n; i++) xs.push(c.x1 + i * c.dx);
    var xmin = Math.min.apply(null, xs), xmax = Math.max.apply(null, xs);
    return [xmin - margen, c.y - margen, xmax - xmin + margen * 2, margen * 2 + 2.6];
  }

  function dibujoElemento(e) {
    var d = '', hit;
    var t = function (x, y, txt, cls, anchor) {
      return '<text class="' + (cls || 'ptb-t') + '" x="' + f(x) + '" y="' + f(y) + '"' + (anchor ? ' text-anchor="' + anchor + '"' : ' text-anchor="middle"') + '>' + txt + '</text>';
    };
    switch (e.id) {
      case 'USB':
        hit = [-9, -2, 46, 25];
        d = usbB() + dtxt(9.6, 9.3, 'J1', 1.05, { rot: -90 }) +
          ssop16(24.6, 11.4) +
          dosTerminales(11.8, 6.8, 'c') + dosTerminales(23.4, 5.6, 'c') + dosTerminales(30.6, 7.8, 'c') +
          dosTerminales(15.5, 9.6, 'r', { codigo: '270' }) + dosTerminales(15.5, 12.6, 'r', { codigo: '270' }) +
          dosTerminales(10.0, 19.3, 'r') + dosTerminales(14.6, 16.6, 'c') +
          dosTerminales(19.4, 17.6, 'c') + dosTerminales(24.4, 18.4, 'c') +
          dosTerminales(30.0, 12.8, 'led') + dosTerminales(34.9, 12.8, 'r', { codigo: '271' }) +
          dosTerminales(30.0, 17.6, 'led') + dosTerminales(34.9, 17.6, 'r', { codigo: '271' }) +
          t(1.2, 23.8, 'USB', 'ptb-t') + t(24.6, 17.3, 'U1 · FT230XS', 'ptb-tx');
        break;
      case 'K2':
        hit = [52.3, 4.8, 9, 3.6];
        d = tiraMacho(54.5, 6.6, 3) +
          '<g class="ptb-cap-k2" transform="translate(55.77 6.6)"></g>' +
          t(51.3, 4.0, 'K2', 'ptb-t', 'end');
        break;
      case 'P4':
        hit = [68.5, 26, 9, 22];
        d = conectorP4Dibujo() + t(72.6, 29.0, 'P4', 'ptb-t');
        break;
      case 'J2':
        hit = [-7, 38, 19, 14];
        d = jackDC() + dosTerminales(17.3, 43.4, 'r') + dosTerminales(16.7, 46.6, 'c') + t(9.6, 52.6, 'J2', 'ptb-t');
        break;
      case 'U2':
        hit = [17, 29, 18, 23];
        d = dpak(23.0, 38.4, 'MC7805') + dosTerminales(21.8, 46.6, 'c') + t(19.0, 31.6, 'U2', 'ptb-t');
        break;
      case 'U3':
        hit = [32, 36, 13, 13];
        d = sot23(37.9, 41.3) + dosTerminales(34.3, 45.2, 'c') + dosTerminales(40.3, 45.2, 'c') + t(41.5, 39.9, 'U3', 'ptb-t', 'start');
        break;
      case 'D4':
        hit = [61, 10, 14, 10];
        d = ledSMD(X_LED_ALIMENTACION_PT3, 15.2, LED_NARANJA) + dosTerminales(66.8, 18.4, 'r') + t(62.6, 15.2, 'D4', 'ptb-t', 'end');
        break;
      case 'D5':
        hit = [61, 17, 14, 11];
        d = ledSMD(X_LED_ALIMENTACION_PT3, 22.0, LED_NARANJA) + dosTerminales(66.8, 25.2, 'r') + t(62.6, 22.0, 'D5', 'ptb-t', 'end');
        break;
      case 'K1':
        hit = [12, 18, 32, 15];
        d = sot23(16.7, 24.8) +
          '<rect x="17.5" y="21.6" width="7.7" height="2.6" fill="none" stroke="' + SERIGRAFIA + '" stroke-width="0.12"/>' +
          [18.8, 21.4, 23.9].map(function (x) { return '<circle cx="' + x + '" cy="22.9" r="0.85" fill="#d9b85a"/><circle cx="' + x + '" cy="22.9" r="0.45" fill="#14140f"/>'; }).join('') +
          dosTerminales(22.6, 28.4, 'r', { codigo: '153' }) +
          dosTerminales(30.3, 24.6, 'r', { vertical: true, codigo: '243' }) +
          dosTerminales(30.3, 30.4, 'r', { vertical: true, codigo: '243' }) +
          soic(35.4, 27.6, 4, true) +
          dosTerminales(36.6, 22.4, 'r', { codigo: '153' }) +
          dosTerminales(41.4, 22.4, 'c') +
          t(26.3, 19.6, 'K1', 'ptb-t', 'start') + t(26.3, 32.8, 'auto: Q1 · U4', 'ptb-tx', 'start');
        break;
      case 'U5':
        hit = [43, 8, 26, 42];
        var pU5 = '';
        (function () {
          var n;
          for (n = 1; n <= 28; n++) {
            var q = pinXY(n);
            pU5 += '<circle class="ptb-dpin" data-pin="' + n + '" cx="' + f(q.x) + '" cy="' + f(q.y) + '" r="0.9"/>';
          }
        })();
        d = zocaloDip28() +
          dosTerminales(61.2, 10.2, 'c', { vertical: true }) +
          dosTerminales(47.0, 25.4, 'c', { vertical: true }) +
          dosTerminales(47.0, 38.4, 'c', { vertical: true }) +
          pU5 + t(63.8, 20, 'U5', 'ptb-t', 'start');
        break;
      case 'SW1':
        hit = [58, 36, 16, 20];
        d = '<g class="ptb-atenua">' + pulsador(PULSADORES_PT3.SW1.x, PULSADORES_PT3.SW1.y) + '</g>' +
          dosTerminales(61.6, 39.4, 'c', { vertical: true }) +
          dosTerminales(64.4, 42.6, 'r', { vertical: true, codigo: '471' }) +
          dosTerminales(67.6, 42.6, 'r', { vertical: true, codigo: '103' }) +
          t(60.5, 46.0, 'SW1 · reset', 'ptb-tx', 'end');
        break;
      case 'D6': case 'D7': case 'D8': case 'D9':
        var yLed = LEDS_PT3[e.id];
        hit = [-3, yLed - 5, 15, 10];
        d = '<g class="ptb-atenua">' + ledSMD(X_LED_PT3, yLed) + '</g>' + dosTerminales(9.3, yLed, 'r', { codigo: '271' }) + t(X_LED_PT3, yLed + 5, e.id, 'ptb-t');
        break;
      case 'JP3':
        hit = [8, 30, 10, 10];
        d = '<g class="ptb-cap" data-jp="JP3" transform="translate(12.6 34.6)">' + tapaJumper(true) + '</g>' + t(12.6, 40.4, 'JP3', 'ptb-t');
        break;
      case 'SW2':
        hit = [-2, -2.5, 13, 12.5];
        d = '<g class="ptb-atenua">' + pulsador(PULSADORES_PT3.SW2.x, PULSADORES_PT3.SW2.y) + '</g>' + t(4.2, 8.7, 'SW2', 'ptb-t');
        break;
      case 'JP1':
        hit = [57, 26, 11, 11];
        d = '<g class="ptb-cap" data-jp="JP1" transform="translate(61.7 31.0)">' + tapaJumper(false) + '</g>' +
          dosTerminales(64.3, 27.6, 'r', { vertical: true, codigo: '103' }) + dosTerminales(65.4, 34.4, 'c') + t(61.7, 38.8, 'JP1', 'ptb-t');
        break;
      case 'RV1':
        hit = [63, 2, 12, 14];
        d = '<g class="ptb-atenua">' + potenciometro(RV1_PT3.x, RV1_PT3.y) + '</g>' + t(RV1_PT3.x, RV1_PT3.y + 7.2, 'RV1', 'ptb-t');
        break;
      case 'JP2':
        hit = [64, -1.5, 8, 7];
        d = '<g class="ptb-cap" data-jp="JP2" transform="translate(66.2 1.9)">' + tapaJumper(false) + '</g>' + t(71.2, 1.9, 'JP2', 'ptb-t', 'start');
        break;
      case 'P5':
        hit = conectorHembraHit('P5', 2);
        d = conectorHembraDibujo('P5') + t(CABECERAS_PT3.P5.x1 + 8.9, CABECERAS_PT3.P5.y - 3.4, 'P5', 'ptb-t') + t(CABECERAS_PT3.P5.x1 + 8.9, CABECERAS_PT3.P5.y - 1.3, 'alimentación', 'ptb-tx');
        break;
      case 'P6':
        hit = conectorHembraHit('P6', 2);
        d = conectorHembraDibujo('P6') + t(CABECERAS_PT3.P6.x1 + 6.3, CABECERAS_PT3.P6.y - 3.4, 'P6', 'ptb-t') + t(CABECERAS_PT3.P6.x1 + 6.3, CABECERAS_PT3.P6.y - 1.3, 'Arduino A0-A5', 'ptb-tx');
        break;
      case 'P7':
        hit = conectorHembraHit('P7', 1);
        d = conectorHembraDibujo('P7') + t(CABECERAS_PT3.P7.x1 - 11.4, CABECERAS_PT3.P7.y + 4.4, 'P7', 'ptb-t') + t(CABECERAS_PT3.P7.x1 - 11.4, CABECERAS_PT3.P7.y + 6.3, 'Arduino 8-13 · SDA · SCL', 'ptb-tx');
        break;
      case 'P8':
        hit = conectorHembraHit('P8', 1);
        d = conectorHembraDibujo('P8') + t(CABECERAS_PT3.P8.x1 - 8.9, CABECERAS_PT3.P8.y + 4.4, 'P8', 'ptb-t') + t(CABECERAS_PT3.P8.x1 - 8.9, CABECERAS_PT3.P8.y + 6.3, 'Arduino 0-7', 'ptb-tx');
        break;
    }
    return '<g class="ptb-el" data-id="' + e.id + '" tabindex="0" role="button" aria-pressed="false">' +
      '<rect class="ptb-hit" x="' + f(hit[0]) + '" y="' + f(hit[1]) + '" width="' + f(hit[2]) + '" height="' + f(hit[3]) + '" rx="0.8"/>' + d + '</g>';
  }

  function svgTarjeta() {
    var s = '<svg class="ptb-svg" viewBox="-10 -6 92 68" role="group" aria-label="Dibujo a escala de la tarjeta PicTrainer v3.0">' +
      '<path d="M0 1 Q0 0 1 0 H' + f(PT3.ancho - 2.7) + ' L' + f(PT3.ancho) + ' 2.7 V' + f(PT3.alto - 1) + ' Q' + f(PT3.ancho) + ' ' + f(PT3.alto) + ' ' + f(PT3.ancho - 1) + ' ' + f(PT3.alto) + ' H1 Q0 ' + f(PT3.alto) + ' 0 ' + f(PT3.alto - 1) + ' Z" fill="#1e6a35" stroke="#0e3b1c" stroke-width="0.3"/>' +
      taladro(14.3, 2.6) + taladro(63.5, 17.9) + taladro(63.7, 45.8) + taladro(12.5, 50.4) +
      puntoPrueba(PUNTOS_PRUEBA_PT3.P3.x, PUNTOS_PRUEBA_PT3.P3.y, '#b8262a') +
      puntoPrueba(PUNTOS_PRUEBA_PT3.P1.x, PUNTOS_PRUEBA_PT3.P1.y, '#b8262a') +
      puntoPrueba(PUNTOS_PRUEBA_PT3.P2.x, PUNTOS_PRUEBA_PT3.P2.y, '#151515') +
      dtxt(35.4, 35.6, 'PicTrainer V3', 1.9, { peso: '700' }) + dtxt(35.4, 38.1, '(c) ICAIdeac', 1.7, { peso: '700' }) +
      '<g class="ptb-cables" aria-hidden="true"></g>';
    ELEMS.forEach(function (e) { s += dibujoElemento(e); });
    s += '<g class="ptb-numpines" aria-hidden="true">';
    for (var n = 1; n <= 28; n++) {
      var q = pinXY(n), izq = n <= 14;
      s += '<text class="ptb-npin" data-pin="' + n + '" x="' + f(izq ? q.x - 2.1 : q.x + 2.1) + '" y="' + f(q.y) + '" text-anchor="' + (izq ? 'end' : 'start') + '">' + n + '</text>';
    }
    return s + '</g></svg>';
  }

  // ------------------------------------------------------------------
  // Componente
  // ------------------------------------------------------------------
  var contador = 0;

  MPI.componentes['pictrainer-board'] = function (el, cfg) {
    cfg = cfg || {};
    var uid = 'ptb' + (++contador);
    var filtro = 'todo', sel = null;
    var st = { JP1: true, JP2: true, JP3: true, K2: '12' };
    var K2_X = { '12': 55.77, '23': 58.31 };

    var r = String(cfg.resaltar == null ? 'todo' : cfg.resaltar);
    CATS.forEach(function (c) { if (c.id === r.toLowerCase()) filtro = c.id; });
    if (r.toLowerCase() === 'alimentación') filtro = 'alimentacion';
    if (r.toLowerCase() === 'programación') filtro = 'programacion';
    if (r.toLowerCase() === 'comunicación') filtro = 'comunicacion';
    ELEMS.forEach(function (e) { if (e.id.toLowerCase() === r.toLowerCase()) sel = e.id; });
    if (!sel && /^(mc7805)$/i.test(r)) sel = 'U2';
    if (!sel && /^(dspic|zocalo|zócalo)$/i.test(r)) sel = 'U5';

    el.classList.add('mpi-pictrainer-board');
    var html =
      '<div class="mpi-sim-cab">Tarjeta PicTrainer v3.0</div>' +
      '<p class="ptb-ayuda">Pulsa un bloque de la tarjeta (o recórrelos con Tab y las flechas) para ver qué es, a qué pin del dsPIC va y cómo se usa en C. Los filtros resaltan grupos.</p>' +
      '<div class="ptb-filtros" role="group" aria-label="Resaltar un grupo de elementos">';
    CATS.forEach(function (c) {
      html += '<button type="button" class="ptb-filtro" data-filtro="' + c.id + '" aria-pressed="false">' + c.txt + '</button>';
    });
    html += '</div><p class="ptb-filtro-desc" aria-live="polite"></p>' +
      '<div class="ptb-cuerpo">' +
        '<div class="ptb-dibujo">' + svgTarjeta() + '</div>' +
        '<div class="ptb-panel" id="' + uid + '-panel" aria-live="polite"></div>' +
      '</div>' +
      '<p class="ptb-aviso"><strong>Orden de los LEDs.</strong> El texto del anexo C dice que los LEDs «D6-D9» están conectados a «RB12 a RB15», pero el esquema de la tarjeta (figura 126) los conecta en <strong>orden inverso</strong>: D6 = RB15, D7 = RB14, D8 = RB13, D9 = RB12. Aquí se usa el orden del esquema.</p>';
    if (cfg.tabla !== false) {
      html += '<details class="ptb-tabla-det" open><summary>Los 28 pines del micro en la tarjeta</summary>' +
        '<p class="ptb-libres"><strong>Libres</strong> (sin nada en la tarjeta, todos en los conectores de expansión): RA0-RA4, RB6-RB11 (11 pines). ' +
        '<strong>Se liberan quitando un puente</strong>: RB2 (JP1), RB3 (JP2), RB12-RB15 (JP3). <strong>Ocupados</strong>: RB0/RB1 por la programación (P4) y RB4/RB5 por la UART. ' +
        'Entre paréntesis, el pin equivalente de Arduino.</p>' +
        '<div class="ptb-tabla-wrap"><table class="ptb-tabla"><thead><tr><th scope="col">Pin</th><th scope="col">Señal</th><th scope="col">En la PicTrainer</th><th scope="col">Expansión</th><th scope="col">Estado</th></tr></thead><tbody>';
      TABLA.forEach(function (f) {
        html += '<tr class="ptb-f-' + f[4] + '"><td>' + f[0] + '</td><td><code>' + f[1] + '</code></td><td>' + f[2] + '</td><td>' + f[3] + '</td>' +
          '<td><span class="ptb-est ptb-est-' + f[4] + '">' + ESTADO_TXT[f[4]] + '</span></td></tr>';
      });
      html += '</tbody></table></div></details>';
    }
    el.innerHTML = html;

    var svg = el.querySelector('.ptb-svg');
    var gCables = el.querySelector('.ptb-cables');
    var panel = el.querySelector('.ptb-panel');
    var descF = el.querySelector('.ptb-filtro-desc');
    var grupos = {};
    Array.prototype.forEach.call(el.querySelectorAll('.ptb-el'), function (g) {
      var e = POR_ID[g.getAttribute('data-id')];
      grupos[e.id] = g;
      g.setAttribute('aria-controls', uid + '-panel');
      g.setAttribute('aria-label', e.tit);
      var tt = document.createElementNS(NS, 'title');
      tt.textContent = e.tit;
      g.insertBefore(tt, g.firstChild);
    });
    var k2cap = svg.querySelector('.ptb-cap-k2');
    if (k2cap) k2cap.innerHTML = tapaJumper(false, '#d4202a');

    function cuadroConector(c) {
      var t = CON[c];
      var h = '<div class="ptb-ct-wrap"><table class="ptb-ct"><thead><tr>';
      t.cab.forEach(function (x) { h += '<th scope="col">' + x + '</th>'; });
      h += '</tr></thead><tbody>';
      t.filas.forEach(function (f) { h += '<tr><td>' + f[0] + '</td><td>' + f[1] + '</td><td>' + f[2] + '</td></tr>'; });
      return h + '</tbody></table></div>';
    }
    function val(v) { return typeof v === 'function' ? v(st) : v; }

    function pintarPanel() {
      if (!sel) {
        panel.innerHTML = '<p class="ptb-vacio">Elige un bloque del dibujo para ver aquí qué es, a qué pin del micro va, su nivel activo, su puente y un fragmento de C para usarlo.</p>';
        return;
      }
      var e = POR_ID[sel];
      var h = '<div class="ptb-p-cab"><span class="ptb-p-id">' + e.id + '</span><span class="ptb-p-tit">' + e.tit + '</span></div>';
      if (e.cats.length) {
        h += '<div class="ptb-tags">';
        e.cats.forEach(function (c) { CATS.forEach(function (k) { if (k.id === c) h += '<span class="ptb-tag ptb-tag-' + c + '">' + k.txt + '</span>'; }); });
        h += '</div>';
      }
      h += '<dl class="ptb-dl"><dt>Qué es</dt><dd>' + e.que + '</dd>';
      if (e.pin) h += '<dt>Pin del micro</dt><dd>' + e.pin + '</dd>';
      if (e.nivel) h += '<dt>Nivel activo</dt><dd>' + val(e.nivel) + '</dd>';
      if (e.puente) h += '<dt>Puente</dt><dd>' + e.puente + '</dd>';
      if (e.posiciones) h += '<dt>Posiciones</dt><dd>' + val(e.posiciones) + '</dd>';
      if (e.comp) h += '<dt>En el esquema</dt><dd>' + e.comp + '</dd>';
      h += '</dl>';
      if (e.jumper) {
        var on = st[e.jumper];
        h += '<div class="ptb-ctl" role="group" aria-label="Estado del puente ' + e.jumper + '">' +
          '<span class="ptb-ctl-tit">Prueba:</span>' +
          '<button type="button" class="ptb-op" data-jp="' + e.jumper + '" data-v="1" aria-pressed="' + on + '">Puesto</button>' +
          '<button type="button" class="ptb-op" data-jp="' + e.jumper + '" data-v="0" aria-pressed="' + !on + '">Quitado</button></div>' +
          '<p class="ptb-efecto"><strong>' + (on ? 'Puesto' : 'Quitado') + ':</strong> ' + (on ? e.puesto : e.quitado) + '</p>' +
          '<p class="ptb-efecto ptb-efecto-2"><strong>' + (on ? 'Si se quita' : 'Si se pone') + ':</strong> ' + (on ? e.quitado : e.puesto) + '</p>';
      }
      if (e.selector === 'K2') {
        h += '<div class="ptb-ctl" role="group" aria-label="Posición de K2">' +
          '<span class="ptb-ctl-tit">Prueba:</span>' +
          '<button type="button" class="ptb-op" data-k2="12" aria-pressed="' + (st.K2 === '12') + '">1-2 · USB</button>' +
          '<button type="button" class="ptb-op" data-k2="23" aria-pressed="' + (st.K2 === '23') + '">2-3 · Arduino</button></div>';
      }
      if (e.con) h += cuadroConector(e.con);
      if (e.extra) h += '<p class="ptb-extra">' + e.extra + '</p>';
      if (e.codigo) h += '<div class="ptb-cod-tit">En C</div><pre class="ptb-pre"><code class="lang-c">' + esc(e.codigo) + '</code></pre>';
      if (e.nota) h += '<p class="ptb-nota"><strong>Nota.</strong> ' + e.nota + '</p>';
      if (e.rel && e.rel.length) {
        h += '<div class="ptb-rel"><span>Relacionado:</span>';
        e.rel.forEach(function (id) { h += '<button type="button" class="ptb-ir" data-ir="' + id + '">' + id + '</button>'; });
        h += '</div>';
      }
      panel.innerHTML = h;
      if (MPI.resaltarTodo) MPI.resaltarTodo(panel);
    }

    function pinesDe(e) { return e.pines; }

    function pintarCables() {
      var h = '';
      if (sel) {
        var e = POR_ID[sel];
        var pares = [];
        if (CABLES_CON[e.id]) {
          var cc = CABECERAS_PT3[e.id];
          CABLES_CON[e.id].forEach(function (c) {
            pares.push([cc.x1 + (c[0] - 1) * cc.dx, cc.y, c[1]]);
          });
        } else if (e.ancla) {
          e.pines.forEach(function (n) { pares.push([e.ancla[0], e.ancla[1], n]); });
        }
        pares.forEach(function (c) {
          var q = pinXY(c[2]);
          h += '<path class="ptb-cable" d="M' + f(c[0]) + ' ' + f(c[1]) + 'L' + f(q.x) + ' ' + f(q.y) + '"/>';
        });
      }
      gCables.innerHTML = h;  // innerHTML en SVG funciona en los navegadores actuales
    }

    function pintar() {
      var activos = {};
      var pinesF = {}, pinesS = {};
      ELEMS.forEach(function (e) {
        var on = filtro !== 'todo' && e.cats.indexOf(filtro) !== -1;
        activos[e.id] = on;
        if (on) pinesDe(e).forEach(function (n) { pinesF[n] = 1; });
      });
      if (sel) pinesDe(POR_ID[sel]).forEach(function (n) { pinesS[n] = 1; });
      svg.classList.toggle('ptb-filtrando', filtro !== 'todo');
      ELEMS.forEach(function (e) {
        var g = grupos[e.id];
        g.classList.toggle('ptb-on', activos[e.id]);
        g.classList.toggle('ptb-sel', e.id === sel);
        g.setAttribute('aria-pressed', e.id === sel ? 'true' : 'false');
      });
      // Estado de puentes y selector
      ['JP1', 'JP2', 'JP3'].forEach(function (j) {
        var cap = svg.querySelector('.ptb-cap[data-jp="' + j + '"]');
        if (cap) cap.classList.toggle('ptb-oculto', !st[j]);
      });
      if (k2cap) k2cap.setAttribute('transform', 'translate(' + K2_X[st.K2] + ' 6.6)');
      ['D6', 'D7', 'D8', 'D9'].forEach(function (d) { grupos[d].classList.toggle('ptb-sinpuente', !st.JP3); });
      grupos.SW2.classList.toggle('ptb-sinpuente', !st.JP1);
      grupos.RV1.classList.toggle('ptb-sinpuente', !st.JP2);
      Array.prototype.forEach.call(svg.querySelectorAll('.ptb-dpin'), function (r) {
        var n = r.getAttribute('data-pin');
        r.classList.toggle('ptb-pin-s', !!pinesS[n]);
        r.classList.toggle('ptb-pin-f', !pinesS[n] && !!pinesF[n]);
      });
      Array.prototype.forEach.call(svg.querySelectorAll('.ptb-npin'), function (t) {
        var n = t.getAttribute('data-pin');
        t.classList.toggle('ptb-visible', !!pinesS[n] || !!pinesF[n]);
        t.classList.toggle('ptb-npin-s', !!pinesS[n]);
      });
      Array.prototype.forEach.call(el.querySelectorAll('.ptb-filtro'), function (b) {
        b.setAttribute('aria-pressed', b.getAttribute('data-filtro') === filtro ? 'true' : 'false');
      });
      descF.innerHTML = DESC_CAT[filtro];
      pintarCables();
      pintarPanel();
    }

    function elegir(id, enfocar) {
      sel = id;
      pintar();
      if (enfocar && grupos[id]) grupos[id].focus();
    }

    el.querySelector('.ptb-filtros').addEventListener('click', function (ev) {
      var b = ev.target.closest('.ptb-filtro');
      if (!b) return;
      var id = b.getAttribute('data-filtro');
      filtro = (filtro === id) ? 'todo' : id;
      pintar();
    });

    svg.addEventListener('click', function (ev) {
      var g = ev.target.closest('.ptb-el');
      if (!g) return;
      elegir(g.getAttribute('data-id'), false);
    });

    var orden = ELEMS.map(function (e) { return e.id; });
    svg.addEventListener('keydown', function (ev) {
      var g = ev.target.closest('.ptb-el');
      if (!g) return;
      var id = g.getAttribute('data-id'), i = orden.indexOf(id), dest = null;
      switch (ev.key) {
        case 'Enter': case ' ': case 'Spacebar':
          ev.preventDefault(); elegir(id, true); return;
        case 'ArrowRight': case 'ArrowDown': dest = orden[(i + 1) % orden.length]; break;
        case 'ArrowLeft': case 'ArrowUp': dest = orden[(i - 1 + orden.length) % orden.length]; break;
        case 'Home': dest = orden[0]; break;
        case 'End': dest = orden[orden.length - 1]; break;
        default: return;
      }
      ev.preventDefault();
      grupos[dest].focus();
    });

    panel.addEventListener('click', function (ev) {
      var b = ev.target.closest('button');
      if (!b) return;
      var foco = null;
      if (b.hasAttribute('data-jp')) {
        st[b.getAttribute('data-jp')] = b.getAttribute('data-v') === '1';
        foco = '[data-jp="' + b.getAttribute('data-jp') + '"][data-v="' + b.getAttribute('data-v') + '"]';
      } else if (b.hasAttribute('data-k2')) {
        st.K2 = b.getAttribute('data-k2');
        foco = '[data-k2="' + st.K2 + '"]';
      } else if (b.hasAttribute('data-ir')) {
        elegir(b.getAttribute('data-ir'), true);
        return;
      } else return;
      pintar();
      var nb = panel.querySelector(foco);
      if (nb) nb.focus();
    });

    pintar();
  };
})();
