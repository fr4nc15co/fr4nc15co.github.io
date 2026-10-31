/*
 * Componente "visor-mapa-memoria": mapas de la memoria de datos y de la
 * memoria de programa del dsPIC33FJ32MC202 (datasheet 4.0, Figuras 4-1 y 4-3;
 * libro, Figuras 56 y 62).
 *
 *  - Dos mapas verticales (direcciones altas arriba, como en el libro) a escala
 *    logarítmica con altura mínima, para que la RAM de 2 KB no quede diminuta.
 *    Clic o foco en una zona → panel con sus límites (de byte y de word), su
 *    tamaño y qué contiene (W0-W15, SFR con los registros del curso, RAM y
 *    stack, vectores, FLASH, zonas no implementadas).
 *  - Buscador «¿Qué hay en la dirección…?» (hex) para datos o programa.
 *  - Vista little endian (por bytes / por words) del ejemplo del data-config,
 *    con el valor editable.
 *  - Vista de la memoria de programa: una instrucción de 24 bits por dirección
 *    par (ejemplo del libro en 0x100-0x106), el PC avanzando de 2 en 2 y el
 *    byte «fantasma» de cada instrucción.
 *
 * Uso en el contenido:
 *   <div class="mpi-mount" data-componente="visor-mapa-memoria" data-config='{
 *     "datos": [{"ini":"0x0000","fin":"0x001F","nombre":"W0-W15"}, …],
 *     "programa": [{"ini":"0x000000","fin":"0x0001FF","nombre":"Vectores de interrupción"}, …],
 *     "ejemploLittleEndian": {"dir":"0x0800","valor":"0x1234"}}'></div>
 *
 * data-config (todas opcionales; si faltan se usan los valores del datasheet):
 *   datos:     zonas de la memoria de datos {ini, fin, nombre}; ini y fin son el
 *              primer y el último BYTE (hex "0x…" o número). Lo que no cubran
 *              hasta 0xFFFF se muestra como «No implementada».
 *   programa:  zonas de la memoria de programa {ini, fin, nombre}; lo que no
 *              cubran hasta 0x7FFFFF se muestra como «No implementada» y se
 *              añade el espacio de configuración (0x800000-0xFFFFFF).
 *   ejemploLittleEndian: {dir, valor}: word de ejemplo (dir par).
 *   instrucciones: [{dir, codigo, asm}] ejemplo de la vista de programa
 *              (por defecto, el programa de 7.3 del libro en 0x100-0x106).
 *   zona:      nombre (o parte del nombre) de la zona seleccionada al cargar
 *              (por defecto, la zona que contiene ejemploLittleEndian.dir).
 *
 * Teclado: Tab recorre las zonas; con una zona enfocada, ↑/↓ suben o bajan
 * por el mapa e Inicio/Fin van a la zona más alta o más baja.
 */
window.MPI = window.MPI || {};
MPI.componentes = MPI.componentes || {};

(function () {

  var NBSP = ' ';

  // ---------------------------------------------------------------------
  // Utilidades
  // ---------------------------------------------------------------------
  function hex(n, d) {
    var s = n.toString(16).toUpperCase();
    while (s.length < d) s = '0' + s;
    return '0x' + s;
  }
  function hd(n) { return hex(n, 4); }      // dirección de datos
  function hp(n) { return hex(n, 6); }      // dirección de programa
  function parseHex(v) {
    if (typeof v === 'number') return isFinite(v) && v >= 0 ? Math.floor(v) : NaN;
    if (typeof v !== 'string') return NaN;
    var s = v.replace(/\s+/g, '').replace(/^0x/i, '').replace(/h$/i, '');
    if (!/^[0-9a-f]{1,8}$/i.test(s)) return NaN;
    return parseInt(s, 16);
  }
  function miles(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP); }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function coma(x) { return String(x).replace('.', ','); }
  function tamBytes(b) {
    if (b >= 1048576) {
      var m = b / 1048576;
      return (m === Math.floor(m) ? '' : '≈' + NBSP) + coma(Math.round(m * 10) / 10) + NBSP + 'MB';
    }
    if (b >= 1024) {
      var k = b / 1024;
      return (k === Math.floor(k) ? '' : '≈' + NBSP) + coma(Math.round(k * 10) / 10) + NBSP + 'KB';
    }
    return b + NBSP + 'bytes';
  }
  function tamInstr(n) {
    if (n >= 1048576) {
      var m = n / 1048576;
      return (m === Math.floor(m) ? '' : '≈' + NBSP) + coma(Math.round(m * 10) / 10) + NBSP + 'M' + NBSP + 'instr.';
    }
    return miles(n) + NBSP + 'instr.';
  }

  // ---------------------------------------------------------------------
  // Valores por defecto (datasheet Figuras 4-1 y 4-3; spec 7.4)
  // ---------------------------------------------------------------------
  var DEF_DATOS = [
    { ini: 0x0000, fin: 0x001F, nombre: 'W0-W15' },
    { ini: 0x0020, fin: 0x07FF, nombre: 'SFR' },
    { ini: 0x0800, fin: 0x0FFF, nombre: 'RAM de usuario (2 KB)' }
  ];
  var DEF_PROG = [
    { ini: 0x000000, fin: 0x0001FF, nombre: 'Vectores de interrupción' },
    { ini: 0x000200, fin: 0x0057FF, nombre: 'FLASH de usuario' }
  ];
  var DEF_LE = { dir: 0x0800, valor: 0x1234 };
  // Programa de la sección 7.3 del libro (Figura 54): c = a + b.
  var DEF_INSTR = [
    { dir: 0x100, codigo: 0x804001, asm: 'MOV 0x800, W1', que: 'W1 ← (0x800)' },
    { dir: 0x102, codigo: 0x804012, asm: 'MOV 0x802, W2', que: 'W2 ← (0x802)' },
    { dir: 0x104, codigo: 0x408182, asm: 'ADD W1, W2, W3', que: 'W3 ← W1 + W2' },
    { dir: 0x106, codigo: 0x884023, asm: 'MOV W3, 0x804', que: '(0x804) ← W3' }
  ];
  var MAX_D = 0xFFFF, MAX_P_USR = 0x7FFFFF, MAX_P = 0xFFFFFF;

  // ---------------------------------------------------------------------
  // Registros conocidos (datasheet, tablas 4-1 a 4-24). d = dirección del
  // word; c = registro que se usa en el curso (se muestra destacado).
  // ---------------------------------------------------------------------
  var REG = [];
  function R(d, n, g, t, c) { REG.push({ d: d, n: n, g: g, t: t, c: !!c }); }
  (function () {
    var i;
    for (i = 0; i < 16; i++) {
      R(i * 2, 'W' + i, 'W',
        'Registro de trabajo W' + i + ' (WREG' + i + ' en la tabla 4-1), de 16 bits.' +
        (i === 0 ? ' También es el WREG de las instrucciones de registro de fichero.' : '') +
        (i === 15 ? ' Es el <strong>stack pointer (SP)</strong>: apunta al primer word libre del stack; tras el reset vale 0x0800.' : ''),
        true);
    }
    R(0x0020, 'SPLIM', 'Núcleo', 'Stack Pointer Limit: cota superior del stack. No se inicializa en el reset y su bit 0 es siempre 0 (las operaciones de pila son de word).', true);
    R(0x002E, 'PCL', 'Núcleo', 'Program Counter, parte baja (bits 15-0 del PC).', true);
    R(0x0030, 'PCH', 'Núcleo', 'Program Counter, parte alta (bits 22-16 del PC).');
    R(0x0032, 'TBLPAG', 'Núcleo', 'Página de la memoria de programa para las instrucciones TBLRD/TBLWT.');
    R(0x0034, 'PSVPAG', 'Núcleo', 'Página de la ventana PSV (memoria de programa vista desde 0x8000-0xFFFF de datos).');
    R(0x0036, 'RCOUNT', 'Núcleo', 'Contador de repeticiones de la instrucción REPEAT.');
    R(0x0042, 'SR', 'Núcleo', 'Status Register: flags C (bit 0), Z (bit 1), OV (bit 2), N (bit 3), RA (bit 4), IPL&lt;2:0&gt; (bits 7-5) y DC (bit 8).', true);
    R(0x0044, 'CORCON', 'Núcleo', 'Control del núcleo: IPL3, PSV y configuración del motor DSP.');
    R(0x0060, 'CNEN1', 'Change notification', 'Habilita la interrupción por cambio de nivel de los pines CN0-CN15.');
    R(0x0062, 'CNEN2', 'Change notification', 'Habilita la interrupción por cambio de nivel de los pines CN16-CN31.');
    R(0x0068, 'CNPU1', 'Change notification', 'Habilita el pull-up débil de los pines CN0-CN15.');
    R(0x006A, 'CNPU2', 'Change notification', 'Habilita el pull-up débil de los pines CN16-CN31.');
    R(0x0080, 'INTCON1', 'Interrupciones', 'Control de interrupciones 1: NSTDIS (anidamiento) y flags de las trampas (error de dirección, de pila, del oscilador…).');
    R(0x0082, 'INTCON2', 'Interrupciones', 'Control de interrupciones 2: ALTIVT (usar la tabla alternativa de vectores) y flanco de INT0-INT2.');
    R(0x0084, 'IFS0', 'Interrupciones', 'Flags de interrupción 0: INT0IF (bit 0), IC1IF, OC1IF, T1IF (bit 3), IC2IF, OC2IF, T2IF, T3IF, SPI1EIF, SPI1IF, U1RXIF, U1TXIF y AD1IF (bit 13).', true);
    R(0x0086, 'IFS1', 'Interrupciones', 'Flags de interrupción 1 (INT1IF, CNIF, INT2IF…).');
    R(0x0094, 'IEC0', 'Interrupciones', 'Habilitación de interrupciones 0: mismos bits que IFS0 (T1IE en el bit 3…).', true);
    R(0x0096, 'IEC1', 'Interrupciones', 'Habilitación de interrupciones 1.');
    R(0x00A4, 'IPC0', 'Interrupciones', 'Prioridades: T1IP (bits 14-12), OC1IP, IC1IP e INT0IP (bits 2-0). Tras el reset, 0x4444 (prioridad 4).', true);
    R(0x00A6, 'IPC1', 'Interrupciones', 'Prioridades: T2IP, OC2IP e IC2IP.');
    R(0x00A8, 'IPC2', 'Interrupciones', 'Prioridades: U1RXIP, SPI1IP, SPI1EIP y T3IP.');
    R(0x00AA, 'IPC3', 'Interrupciones', 'Prioridades: AD1IP y U1TXIP.');
    R(0x0100, 'TMR1', 'Timers', 'Contador del Timer 1.', true);
    R(0x0102, 'PR1', 'Timers', 'Periodo del Timer 1 (tras el reset, 0xFFFF).', true);
    R(0x0104, 'T1CON', 'Timers', 'Control del Timer 1: TON (bit 15), TGATE, TCKPS&lt;1:0&gt; (pre-escalado, bits 5-4), TSYNC y TCS.', true);
    R(0x0106, 'TMR2', 'Timers', 'Contador del Timer 2.');
    R(0x0108, 'TMR3HLD', 'Timers', 'Copia de TMR3 para leer el timer de 32 bits (Timer 2 + Timer 3).');
    R(0x010A, 'TMR3', 'Timers', 'Contador del Timer 3.');
    R(0x010C, 'PR2', 'Timers', 'Periodo del Timer 2.');
    R(0x010E, 'PR3', 'Timers', 'Periodo del Timer 3.');
    R(0x0110, 'T2CON', 'Timers', 'Control del Timer 2 (con T32 se encadena con el Timer 3).');
    R(0x0112, 'T3CON', 'Timers', 'Control del Timer 3.');
    R(0x0140, 'IC1BUF', 'Captura y comparación', 'Valor capturado por la Input Capture 1.');
    R(0x0142, 'IC1CON', 'Captura y comparación', 'Control de la Input Capture 1.');
    R(0x0144, 'IC2BUF', 'Captura y comparación', 'Valor capturado por la Input Capture 2.');
    R(0x0146, 'IC2CON', 'Captura y comparación', 'Control de la Input Capture 2.');
    R(0x0180, 'OC1RS', 'Captura y comparación', 'Output Compare 1: registro secundario (ciclo de trabajo en modo PWM).');
    R(0x0182, 'OC1R', 'Captura y comparación', 'Output Compare 1: registro principal de comparación.');
    R(0x0184, 'OC1CON', 'Captura y comparación', 'Control de la Output Compare 1.');
    R(0x0186, 'OC2RS', 'Captura y comparación', 'Output Compare 2: registro secundario.');
    R(0x0188, 'OC2R', 'Captura y comparación', 'Output Compare 2: registro principal de comparación.');
    R(0x018A, 'OC2CON', 'Captura y comparación', 'Control de la Output Compare 2.');
    R(0x01C0, 'P1TCON', 'PWM1', 'Control de la base de tiempos del PWM1 de control de motores.');
    R(0x01C2, 'P1TMR', 'PWM1', 'Contador de la base de tiempos del PWM1.');
    R(0x01C4, 'P1TPER', 'PWM1', 'Periodo del PWM1.');
    R(0x01C8, 'PWM1CON1', 'PWM1', 'Habilitación de los pines PWM1H/L (PENxH, PENxL) y modo complementario o independiente.');
    R(0x01D6, 'P1DC1', 'PWM1', 'Ciclo de trabajo del par 1 del PWM1.');
    R(0x01D8, 'P1DC2', 'PWM1', 'Ciclo de trabajo del par 2 del PWM1.');
    R(0x01DA, 'P1DC3', 'PWM1', 'Ciclo de trabajo del par 3 del PWM1.');
    R(0x0206, 'I2C1CON', 'I2C1', 'Control del módulo I2C1.');
    R(0x0220, 'U1MODE', 'UART1', 'Modo de la UART1: UARTEN (bit 15), BRGH, PDSEL&lt;1:0&gt; (datos y paridad) y STSEL (bits de stop).', true);
    R(0x0222, 'U1STA', 'UART1', 'Estado y control de la UART1: UTXEN, UTXBF (buffer de transmisión lleno), TRMT, OERR, URXDA (dato recibido)…', true);
    R(0x0224, 'U1TXREG', 'UART1', 'Dato que se va a transmitir por la UART1.', true);
    R(0x0226, 'U1RXREG', 'UART1', 'Dato recibido por la UART1.', true);
    R(0x0228, 'U1BRG', 'UART1', 'Generador de baudios de la UART1: fija la velocidad de transmisión.', true);
    R(0x0240, 'SPI1STAT', 'SPI1', 'Estado y control del SPI1.');
    R(0x0242, 'SPI1CON1', 'SPI1', 'Control 1 del SPI1.');
    R(0x0248, 'SPI1BUF', 'SPI1', 'Buffer de datos del SPI1.');
    R(0x02C0, 'TRISA', 'Puertos', 'Dirección de los pines del puerto A: 1 = entrada, 0 = salida (tras el reset, 0x001F: todo entradas).');
    R(0x02C2, 'PORTA', 'Puertos', 'Lectura del nivel de los pines del puerto A.');
    R(0x02C4, 'LATA', 'Puertos', 'Latch de salida del puerto A.');
    R(0x02C6, 'ODCA', 'Puertos', 'Salidas del puerto A en drenador abierto.');
    R(0x02C8, 'TRISB', 'Puertos', 'Dirección de los pines del puerto B: 1 = entrada, 0 = salida (tras el reset, 0xFFFF: todo entradas).', true);
    R(0x02CA, 'PORTB', 'Puertos', 'Lectura del nivel de los pines del puerto B (y escritura de su latch).', true);
    R(0x02CC, 'LATB', 'Puertos', 'Latch de salida del puerto B.', true);
    R(0x02CE, 'ODCB', 'Puertos', 'Salidas del puerto B en drenador abierto.');
    for (i = 0; i < 16; i++) {
      R(0x0300 + 2 * i, 'ADC1BUF' + i.toString(16).toUpperCase(), 'Convertidor A/D',
        'Buffer de resultados ' + i + ' del convertidor A/D.', i === 0);
    }
    R(0x0320, 'AD1CON1', 'Convertidor A/D', 'Control 1 del A/D: ADON (bit 15), FORM&lt;1:0&gt;, SSRC&lt;2:0&gt;, ASAM, SAMP y DONE.', true);
    R(0x0322, 'AD1CON2', 'Convertidor A/D', 'Control 2 del A/D: referencias, barrido de canales y número de conversiones por interrupción.');
    R(0x0324, 'AD1CON3', 'Convertidor A/D', 'Control 3 del A/D: reloj de conversión (ADCS) y tiempo de muestreo (SAMC).');
    R(0x0326, 'AD1CHS123', 'Convertidor A/D', 'Selección de entradas de los canales CH1-CH3 del A/D.');
    R(0x0328, 'AD1CHS0', 'Convertidor A/D', 'Selección de la entrada del canal CH0 (CH0SA&lt;4:0&gt;: qué ANx se convierte).', true);
    R(0x032C, 'AD1PCFGL', 'Convertidor A/D', 'Configuración analógica/digital de los pines ANx: PCFGx = 0 analógico (tras el reset, 0x0000), 1 digital.', true);
    R(0x0330, 'AD1CSSL', 'Convertidor A/D', 'Selección de las entradas que se recorren en el modo de barrido.');
    R(0x0680, 'RPINR0', 'Remapeo de pines (PPS)', 'INT1R&lt;4:0&gt;: pin RPx del que llega la interrupción externa INT1.');
    R(0x06A4, 'RPINR18', 'Remapeo de pines (PPS)', 'U1RXR&lt;4:0&gt; (bits 4-0): pin RPx del que llega U1RX (RP5 en la PicTrainer); U1CTSR en los bits 12-8.', true);
    for (i = 0; i < 8; i++) {
      R(0x06C0 + 2 * i, 'RPOR' + i, 'Remapeo de pines (PPS)',
        'RP' + (2 * i + 1) + 'R (bits 12-8) y RP' + (2 * i) + 'R (bits 4-0): función de salida que se saca por los pines RP' + (2 * i + 1) + ' y RP' + (2 * i) + '.' +
        (i === 2 ? ' En la PicTrainer, U1TX se saca por RP4.' : ''), i === 2);
    }
    R(0x0740, 'RCON', 'Sistema y reloj', 'Causa del último reset (POR, BOR, EXTR, SWR, WDTO, TRAPR…).');
    R(0x0742, 'OSCCON', 'Sistema y reloj', 'Control del oscilador: COSC (oscilador actual), NOSC (nuevo), OSWEN (pedir el cambio).', true);
    R(0x0744, 'CLKDIV', 'Sistema y reloj', 'Divisores del reloj: FRCDIV, PLLPOST (N2) y PLLPRE (N1).', true);
    R(0x0746, 'PLLFBD', 'Sistema y reloj', 'Divisor de realimentación del PLL (M).', true);
    R(0x0748, 'OSCTUN', 'Sistema y reloj', 'Ajuste fino de la frecuencia del oscilador FRC.');
    R(0x0760, 'NVMCON', 'Sistema y reloj', 'Control de las escrituras y borrados de la FLASH.');
  })();
  var GRUPOS = ['Núcleo', 'Change notification', 'Interrupciones', 'Timers', 'Captura y comparación', 'PWM1',
    'I2C1', 'UART1', 'SPI1', 'Puertos', 'Convertidor A/D', 'Remapeo de pines (PPS)', 'Sistema y reloj'];

  function regEn(a) {
    for (var i = 0; i < REG.length; i++) if (a === REG[i].d || a === REG[i].d + 1) return REG[i];
    return null;
  }

  // ---------------------------------------------------------------------
  // Zonas
  // ---------------------------------------------------------------------
  function tipoZona(nombre, mapa) {
    var n = String(nombre).toLowerCase();
    if (/no implementad|unimplemented/.test(n)) return 'noimpl';
    if (mapa === 'd') {
      if (/w0|wreg|trabajo/.test(n)) return 'wreg';
      if (/sfr|registro|special/.test(n)) return 'sfr';
      if (/ram/.test(n)) return 'ram';
    } else {
      if (/vector/.test(n)) return 'vectores';
      if (/config/.test(n)) return 'config';
      if (/flash|usuario|program/.test(n)) return 'flash';
    }
    return 'otra';
  }

  function normalizar(lista, def, mapa) {
    var max = mapa === 'd' ? MAX_D : MAX_P_USR;
    var zs = [];
    if (Object.prototype.toString.call(lista) === '[object Array]') {
      lista.forEach(function (z) {
        if (!z) return;
        var ini = parseHex(z.ini), fin = parseHex(z.fin);
        if (isNaN(ini) || isNaN(fin) || fin < ini || fin > max) return;
        zs.push({ ini: ini, fin: fin, nombre: z.nombre ? String(z.nombre) : 'Zona ' + (mapa === 'd' ? hd(ini) : hp(ini)) });
      });
    }
    if (!zs.length) zs = def.map(function (z) { return { ini: z.ini, fin: z.fin, nombre: z.nombre }; });
    zs.sort(function (a, b) { return a.ini - b.ini; });
    var out = [], cur = 0;
    zs.forEach(function (z) {
      if (z.ini < cur) return;                       // solapada: se descarta
      if (z.ini > cur) out.push({ ini: cur, fin: z.ini - 1, nombre: 'Hueco (sin zona en el data-config)', auto: true, tipo: 'otra' });
      z.tipo = tipoZona(z.nombre, mapa);
      out.push(z);
      cur = z.fin + 1;
    });
    if (cur <= max) out.push({ ini: cur, fin: max, nombre: 'No implementada', auto: true, tipo: 'noimpl' });
    if (mapa === 'p') out.push({ ini: MAX_P_USR + 1, fin: MAX_P, nombre: 'Espacio de configuración', auto: true, tipo: 'config' });
    return out;
  }

  // Alturas: proporcionales al logaritmo del tamaño, con mínimo.
  function alturas(zs, total, minimo) {
    var w = zs.map(function (z) { return Math.log(z.fin - z.ini + 1) / Math.LN2 + 1; });
    var fijos = zs.map(function () { return false; });
    var h = [];
    for (var pasada = 0; pasada < 3; pasada++) {
      var resto = total, suma = 0;
      zs.forEach(function (z, i) { if (fijos[i]) resto -= minimo; else suma += w[i]; });
      var cambio = false;
      zs.forEach(function (z, i) {
        h[i] = fijos[i] ? minimo : resto * w[i] / suma;
        if (!fijos[i] && h[i] < minimo) { fijos[i] = true; cambio = true; }
      });
      if (!cambio) break;
    }
    return h.map(function (x) { return Math.round(x); });
  }

  function tamCorto(z, mapa) {
    var n = z.fin - z.ini + 1;
    if (mapa === 'd') return tamBytes(n);
    if (z.tipo === 'config') return tamBytes(n).replace('bytes', 'dir.').replace('MB', 'M' + NBSP + 'dir.');
    return tamInstr(Math.floor(n / 2));
  }

  // ---------------------------------------------------------------------
  // Componente
  // ---------------------------------------------------------------------
  MPI.componentes['visor-mapa-memoria'] = function (el, cfg) {
    cfg = cfg || {};
    var uid = 'vm' + Math.random().toString(36).slice(2, 8);
    var Z = { d: normalizar(cfg.datos, DEF_DATOS, 'd'), p: normalizar(cfg.programa, DEF_PROG, 'p') };

    // Ejemplo little endian
    var le = cfg.ejemploLittleEndian || {};
    var leDir = parseHex(le.dir), leVal = parseHex(le.valor), leAviso = '';
    if (isNaN(leDir) || leDir > MAX_D - 3) leDir = DEF_LE.dir;
    if (leDir % 2) { leAviso = 'La dirección del data-config (' + hd(leDir) + ') es impar: un word debe estar alineado en una dirección par, así que se usa ' + hd(leDir - 1) + '. '; leDir -= 1; }
    if (isNaN(leVal) || leVal > 0xFFFF) leVal = DEF_LE.valor;
    var leModo = 'bytes';

    // Ejemplo de instrucciones
    var INS = [];
    if (Object.prototype.toString.call(cfg.instrucciones) === '[object Array]') {
      cfg.instrucciones.forEach(function (x) {
        if (!x) return;
        var d = parseHex(x.dir), c = parseHex(x.codigo);
        if (isNaN(d) || isNaN(c) || d % 2 || d > MAX_P_USR || c > 0xFFFFFF) return;
        INS.push({ dir: d, codigo: c, asm: x.asm ? String(x.asm) : '', que: x.que ? String(x.que) : '' });
      });
    }
    if (!INS.length) INS = DEF_INSTR;
    var pcIdx = 0, progModo = 'words';

    // Selección inicial
    var sel = { m: 'd', i: 0 }, selReg = null;
    (function () {
      var buscado = cfg.zona ? String(cfg.zona).toLowerCase() : '';
      var hecho = false;
      if (buscado) {
        ['d', 'p'].forEach(function (m) {
          Z[m].forEach(function (z, i) { if (!hecho && z.nombre.toLowerCase().indexOf(buscado) !== -1) { sel = { m: m, i: i }; hecho = true; } });
        });
      }
      if (!hecho) Z.d.forEach(function (z, i) { if (!hecho && leDir >= z.ini && leDir <= z.fin) { sel = { m: 'd', i: i }; hecho = true; } });
    })();

    // ----- Esqueleto -----
    function mapaHTML(m) {
      var zs = Z[m];
      var h = alturas(zs, 400, 46);
      var html = '<div class="vm-mapa vm-mapa-' + m + '">' +
        '<div class="vm-mapa-cab"><span class="vm-mapa-tit">' + (m === 'd' ? 'Memoria de datos' : 'Memoria de programa') + '</span>' +
        '<span class="vm-mapa-sub">' + (m === 'd' ? 'bytes · words de 16 bits' : 'instrucciones de 24 bits') + '</span></div>' +
        '<div class="vm-columna" role="group" aria-label="' + (m === 'd' ? 'Zonas de la memoria de datos' : 'Zonas de la memoria de programa') + ', de la dirección más alta a la más baja">';
      for (var i = zs.length - 1; i >= 0; i--) {
        var z = zs[i];
        var f = m === 'd' ? hd : hp;
        var bajo = h[i] < 62;
        html += '<button type="button" class="vm-zona vm-t-' + z.tipo + (bajo ? ' vm-baja' : '') + '" data-m="' + m + '" data-i="' + i + '"' +
          ' style="flex:0 0 ' + h[i] + 'px" title="' + esc(z.nombre) + '" aria-pressed="false" aria-controls="' + uid + '-panel"' +
          ' aria-label="' + esc(z.nombre) + ': de ' + f(z.ini) + ' a ' + f(z.fin) + ', ' + esc(tamCorto(z, m)).replace(/ /g, ' ') + '">' +
          '<span class="vm-dirs" aria-hidden="true"><span>' + f(z.fin) + '</span><span>' + f(z.ini) + '</span></span>' +
          '<span class="vm-bloque" aria-hidden="true"><span class="vm-znom">' + esc(z.nombre) + '</span>' +
          '<span class="vm-ztam">' + tamCorto(z, m) + '</span>' +
          (z.tipo === 'ram' && !bajo ? '<span class="vm-stack-marca">↑ stack desde 0x0800</span>' : '') +
          '</span></button>';
      }
      html += '</div></div>';
      return html;
    }

    // Nota de escala calculada con los datos reales.
    function notaEscala() {
      var partes = [];
      var ram = null, flash = null;
      Z.d.forEach(function (z) { if (z.tipo === 'ram' && !ram) ram = z; });
      Z.p.forEach(function (z) { if (z.tipo === 'flash' && !flash) flash = z; });
      if (ram) partes.push('la RAM ocuparía ' + coma(Math.round((ram.fin - ram.ini + 1) / (MAX_D + 1) * 1000) / 10) + NBSP + '% del mapa de datos');
      if (flash) partes.push('la FLASH, ' + coma(Math.round((flash.fin - flash.ini + 1) / (MAX_P_USR + 1) * 10000) / 100) + NBSP + '% del espacio de usuario de programa');
      return 'Escala no lineal: la altura de cada zona crece con el logaritmo de su tamaño (con un mínimo para que se pueda pulsar).' +
        (partes.length ? ' A escala real, ' + partes.join(' y ') + '.' : '');
    }

    var html =
      '<div class="mpi-sim-cab">Mapas de memoria del dsPIC33FJ32MC202</div>' +
      '<p class="vm-ayuda">Pulsa una zona (o recórrelas con Tab y las flechas ↑/↓) para ver sus límites, su tamaño y qué contiene. Las direcciones altas están arriba, como en el libro.</p>' +
      '<div class="vm-cuerpo">' +
        '<div class="vm-izq"><div class="vm-mapas">' + mapaHTML('d') + mapaHTML('p') + '</div>' +
        '<p class="vm-escala">' + notaEscala() + '</p></div>' +
        '<div class="vm-panel" id="' + uid + '-panel" aria-live="polite"></div>' +
      '</div>' +

      // Buscador
      '<form class="vm-sec vm-busca" novalidate>' +
        '<label class="vm-sec-tit" for="' + uid + '-q">¿Qué hay en la dirección…?</label>' +
        '<div class="vm-busca-fila">' +
          '<input id="' + uid + '-q" class="vm-input" type="text" autocomplete="off" spellcheck="false" autocapitalize="characters" placeholder="p. ej. 0x02C8" aria-describedby="' + uid + '-qayuda">' +
          '<div class="vm-seg" role="group" aria-label="Memoria en la que buscar">' +
            '<button type="button" class="vm-segb" data-bm="d" aria-pressed="true">Datos</button>' +
            '<button type="button" class="vm-segb" data-bm="p" aria-pressed="false">Programa</button>' +
          '</div>' +
          '<button type="submit" class="vm-btn vm-btn-pri">Buscar</button>' +
        '</div>' +
        '<p class="vm-mini" id="' + uid + '-qayuda">En hexadecimal, con o sin 0x. Prueba: ' +
          '<button type="button" class="vm-ej" data-q="0x02C8" data-bm="d">0x02C8</button> ' +
          '<button type="button" class="vm-ej" data-q="0x02C9" data-bm="d">0x02C9</button> ' +
          '<button type="button" class="vm-ej" data-q="0x001E" data-bm="d">0x001E</button> ' +
          '<button type="button" class="vm-ej" data-q="0x0801" data-bm="d">0x0801</button> ' +
          '<button type="button" class="vm-ej" data-q="0x2000" data-bm="d">0x2000</button> ' +
          '<button type="button" class="vm-ej" data-q="0x000000" data-bm="p">0x000000 (programa)</button> ' +
          '<button type="button" class="vm-ej" data-q="0x000201" data-bm="p">0x000201 (programa)</button>' +
        '</p>' +
        '<div class="vm-res" aria-live="polite"></div>' +
      '</form>' +

      // Little endian
      '<div class="vm-sec vm-le">' +
        '<div class="vm-sec-tit">Little endian: un word de 16 bits en dos bytes</div>' +
        '<div class="vm-le-ctrl">' +
          '<label class="vm-mini" for="' + uid + '-le">Word en ' + hd(leDir) + '</label>' +
          '<input id="' + uid + '-le" class="vm-input vm-input-corto" type="text" autocomplete="off" spellcheck="false" value="' + hd(leVal) + '" aria-describedby="' + uid + '-leexp">' +
          '<div class="vm-seg" role="group" aria-label="Ver la memoria de datos">' +
            '<button type="button" class="vm-segb" data-lm="bytes" aria-pressed="true">Por bytes</button>' +
            '<button type="button" class="vm-segb" data-lm="words" aria-pressed="false">Por words</button>' +
          '</div>' +
        '</div>' +
        '<div class="vm-le-cuerpo"><div class="vm-tabla-wrap"><table class="vm-tabla vm-le-tabla"></table></div>' +
        '<div class="vm-le-exp" id="' + uid + '-leexp" aria-live="polite"></div></div>' +
      '</div>' +

      // Programa
      '<div class="vm-sec vm-prog">' +
        '<div class="vm-sec-tit">Memoria de programa: una instrucción de 24 bits en cada dirección par</div>' +
        '<div class="vm-le-ctrl">' +
          '<button type="button" class="vm-btn vm-btn-pri vm-pc-mas">Ejecutar: PC + 2</button>' +
          '<button type="button" class="vm-btn vm-pc-reset">Reiniciar</button>' +
          '<span class="vm-pc" aria-live="polite"></span>' +
          '<div class="vm-seg" role="group" aria-label="Ver la memoria de programa">' +
            '<button type="button" class="vm-segb" data-pm="words" aria-pressed="true">Por instrucciones</button>' +
            '<button type="button" class="vm-segb" data-pm="bytes" aria-pressed="false">Por bytes (Figura 60)</button>' +
          '</div>' +
        '</div>' +
        '<div class="vm-tabla-wrap"><table class="vm-tabla vm-prog-tabla"></table></div>' +
        '<div class="vm-prog-exp"></div>' +
      '</div>';

    el.classList.add('mpi-visor-mapa-memoria');
    el.innerHTML = html;

    var panel = el.querySelector('.vm-panel');
    var zonasBtn = Array.prototype.slice.call(el.querySelectorAll('.vm-zona'));
    function btnZona(m, i) {
      for (var k = 0; k < zonasBtn.length; k++) {
        if (zonasBtn[k].getAttribute('data-m') === m && +zonasBtn[k].getAttribute('data-i') === i) return zonasBtn[k];
      }
      return null;
    }

    // ----- Panel de zona -----
    function filaDL(dt, dd) { return '<dt>' + dt + '</dt><dd>' + dd + '</dd>'; }

    function chipReg(r) {
      return '<button type="button" class="vm-chip' + (selReg === r ? ' vm-chip-on' : '') + '" data-reg="' + r.d + '" aria-pressed="' + (selReg === r ? 'true' : 'false') + '">' +
        '<span class="vm-chip-n">' + r.n + '</span><span class="vm-chip-d">' + hd(r.d) + '</span></button>';
    }
    function detalleReg() {
      if (!selReg) return '';
      return '<div class="vm-regdet"><span class="vm-regdet-n">' + selReg.n + '</span> <code>' + hd(selReg.d) + '</code> ' +
        '<span class="vm-mini">(byte bajo en ' + hd(selReg.d) + ', byte alto en ' + hd(selReg.d + 1) + ')</span>' +
        '<p>' + selReg.t + '</p></div>';
    }

    function descZona(z, m) {
      var h = '';
      var f = m === 'd' ? hd : hp;
      switch (z.tipo) {
        case 'wreg':
          h += '<p>Los <strong>16 registros de trabajo</strong> W0-W15, de 16 bits, están al principio de la memoria de datos: cada uno ocupa 2 bytes (byte bajo en la dirección par), W0 en 0x0000, W1 en 0x0002… y W15 en 0x001E (datasheet, tabla 4-1). Por eso un WR también se puede leer como una posición de memoria.</p>' +
            '<p><strong>W15 es el stack pointer (SP)</strong>: apunta al primer word libre del stack y tras el reset vale 0x0800.</p>' +
            '<div class="vm-wgrid" role="group" aria-label="Registros W0 a W15">';
          REG.forEach(function (r) {
            if (r.g === 'W' && r.d >= z.ini && r.d <= z.fin) {
              h += '<button type="button" class="vm-wcel' + (selReg === r ? ' vm-chip-on' : '') + (r.n === 'W15' ? ' vm-w15' : '') + '" data-reg="' + r.d + '" aria-pressed="' + (selReg === r ? 'true' : 'false') + '">' +
                '<span class="vm-chip-n">' + r.n + (r.n === 'W15' ? ' = SP' : '') + '</span><span class="vm-chip-d">' + hd(r.d) + '</span></button>';
            }
          });
          h += '</div>' + detalleReg() +
            '<p class="vm-nota">El libro sitúa los WRs en «las direcciones 0 a 0x20»; según la tabla 4-1 ocupan los bytes 0x0000-0x001F y 0x0020 ya es SPLIM.</p>';
          break;
        case 'sfr':
          var curso = [], resto = {};
          REG.forEach(function (r) {
            if (r.g === 'W' || r.d < z.ini || r.d > z.fin) return;
            if (r.c) curso.push(r);
            (resto[r.g] = resto[r.g] || []).push(r);
          });
          h += '<p><strong>Special Function Registers</strong>: los registros de control y estado del núcleo (SPLIM, PC, SR…) y de los periféricos (puertos, timers, UART, A/D…), agrupados por módulo. Escribiendo en ellos se configura el micro y leyéndolos se conoce su estado. Muchas direcciones de esta zona están sin usar y se leen como 0 (datasheet 4.2.3).</p>';
          if (curso.length) {
            h += '<p class="vm-sub">Registros que se usan en el curso (pulsa uno):</p><div class="vm-chips">';
            curso.forEach(function (r) { h += chipReg(r); });
            h += '</div>' + detalleReg();
            h += '<details class="vm-todos"><summary>Todos los registros que conoce el visor</summary>';
            GRUPOS.forEach(function (g) {
              if (!resto[g]) return;
              h += '<p class="vm-sub">' + g + '</p><div class="vm-chips">';
              resto[g].forEach(function (r) { h += chipReg(r); });
              h += '</div>';
            });
            h += '</details>';
          }
          if (z.ini > 0) h += '<p class="vm-nota">Para el datasheet la zona SFR son los primeros 2 KB (0x0000-0x07FF), con los WRs incluidos; el visor separa W0-W15 para verlos mejor.</p>';
          break;
        case 'ram':
          h += '<p><strong>' + tamBytes(z.fin - z.ini + 1) + ' de RAM</strong> para los datos de los programas (variables, arrays y estructuras de C…) y para el <strong>stack</strong>. Es lo único que este micro implementa por encima de los registros: el resto del espacio de 64 KB se lee como 0.</p>' +
            '<div class="vm-caja"><span class="vm-caja-tit">El stack (datasheet 4.4.1)</span>' +
            '<ul>' +
              '<li>Ocupa la RAM <strong>desde 0x0800 hacia arriba, hasta SPLIM</strong> (crece hacia direcciones altas). Tras el reset W15 = 0x0800.</li>' +
              '<li><strong>W15 (SP)</strong> apunta al primer word libre: meter un dato es <code>[W15++]</code> (escribe y suma 2) y sacarlo, <code>[--W15]</code> (resta 2 y lee).</li>' +
              '<li>Si W15 baja de 0x0800 o pasa de <strong>SPLIM</strong> (0x0020) salta la trampa de error de pila. Ej.: SPLIM = 0x0FFE para que salte al pasar de 0x1000.</li>' +
              '<li>Guarda el PC en las llamadas (CALL, 2 words), el PC y el SR en las interrupciones, y los WRs que salvan las subrutinas.</li>' +
            '</ul></div>' +
            '<p class="vm-nota">Internamente se divide en X RAM (0x0800-0x0BFF) e Y RAM (0x0C00-0x0FFF) para las instrucciones DSP (MAC); para el resto de instrucciones es un único bloque (Figura 4-3).</p>';
          break;
        case 'vectores':
          h += '<p>Direcciones reservadas para los <strong>vectores</strong> (datasheet 4.1.2 y Figura 4-1):</p>' +
            '<dl class="vm-lista">' +
              filaDL('0x000000', 'Instrucción <code>GOTO</code> del vector de reset: al arrancar, el PC vale 0 y salta al inicio real del programa.') +
              filaDL('0x000002', 'Dirección de destino de ese GOTO (inicio del código).') +
              filaDL('0x000004-0x0000FE', 'Tabla de vectores de interrupción (IVT): la dirección de la rutina (ISR) de cada fuente de interrupción y trampa.') +
              filaDL('0x000100-0x000102', 'Reservado.') +
              filaDL('0x000104-0x0001FE', 'Tabla alternativa de vectores (AIVT), que se usa si INTCON2.ALTIVT = 1.') +
            '</dl><p>Los vectores se estudian en el tema de interrupciones.</p>';
          break;
        case 'flash':
          var nz = Math.floor((z.fin - z.ini + 1) / 2), nt = Math.floor((z.fin + 1) / 2);
          h += '<p><strong>FLASH</strong> (no volátil) donde se graba el programa: cada dirección par guarda una <strong>instrucción de 24 bits</strong> (3 bytes) y las direcciones avanzan de 2 en 2 (vista de abajo).</p>' +
            '<p>En esta zona caben <strong>' + miles(nz) + ' instrucciones</strong>' +
            (z.ini > 0 ? '; contando los vectores, de 0x000000 a ' + hp(z.fin - (z.fin % 2 ? 1 : 0)) + ' son ' + miles(nt) + ' (el datasheet dice «11264 instructions»)' : '') +
            '. Con 3 bytes por instrucción, ' + miles(nt) + ' × 3 = ' + miles(nt * 3) + ' bytes, que Microchip anuncia como 32 KB de FLASH.</p>' +
            '<p class="vm-nota">La Figura 62 del libro rotula «FLASH 32KW»; lo correcto es unos 11 K words de instrucción (32 KB).</p>';
          break;
        case 'noimpl':
          if (m === 'd') {
            h += '<p>El dsPIC genera direcciones de datos de <strong>16 bits</strong> (64 KB), pero este micro solo implementa los registros y 2 KB de RAM. <strong>Si una dirección apunta aquí, se lee 0</strong> (datasheet 4.2).</p>' +
              '<p class="vm-nota">La mitad alta (0x8000-0xFFFF) puede usarse como ventana a la memoria de programa (PSV, Program Space Visibility), fuera del objetivo del curso.</p>';
          } else {
            h += '<p>El PC tiene <strong>23 bits</strong> (el bit 0 siempre es 0) y podría direccionar 4 M instrucciones, de 0x000000 a 0x7FFFFE, pero este micro solo tiene FLASH hasta 0x0057FE. <strong>El resto se lee como 0</strong> (Figura 4-1, «Unimplemented»).</p>';
          }
          break;
        case 'config':
          h += '<p>Por encima de 0x7FFFFF está el <strong>espacio de configuración</strong>, al que el PC no llega: solo se accede con TBLRD/TBLWT (TBLPAG&lt;7&gt; = 1).</p>' +
            '<dl class="vm-lista">' +
              filaDL('0xF80000-0xF80017', 'Registros de configuración del dispositivo (los bits de configuración que fijan el oscilador, el watchdog…).') +
              filaDL('0xFF0000-0xFFFFFE', 'DEVID: identificación del dispositivo.') +
              filaDL('resto', 'Reservado.') +
            '</dl>';
          break;
        default:
          h += '<p>Zona definida en el data-config' + (z.auto ? ' (hueco entre dos zonas, sin descripción)' : '') + '.</p>';
      }
      return h;
    }

    function pintarPanel() {
      var m = sel.m, z = Z[m][sel.i];
      var n = z.fin - z.ini + 1;
      var h = '<div class="vm-p-cab"><span class="vm-p-nom">' + esc(z.nombre) + '</span>' +
        '<span class="vm-tag vm-tag-' + m + '">' + (m === 'd' ? 'Memoria de datos' : 'Memoria de programa') + '</span></div><dl class="vm-dl">';
      if (m === 'd') {
        var w0 = z.ini + (z.ini % 2), w1 = z.fin - ((z.fin % 2) ? 1 : 0);
        h += filaDL('Bytes', '<code>' + hd(z.ini) + '</code> a <code>' + hd(z.fin) + '</code>') +
          filaDL('Words', '<code>' + hd(w0) + '</code> a <code>' + hd(w1) + '</code> <span class="vm-mini">(direcciones pares)</span>') +
          filaDL('Tamaño', miles(n) + ' bytes = ' + miles(Math.floor(n / 2)) + ' words' + (n >= 1024 ? ' (' + tamBytes(n) + ')' : ''));
      } else if (z.tipo === 'config') {
        h += filaDL('Direcciones', '<code>' + hp(z.ini) + '</code> a <code>' + hp(z.fin) + '</code>') +
          filaDL('Tamaño', miles(n) + ' direcciones (' + hex(n, 1) + ')');
      } else {
        var i0 = z.ini + (z.ini % 2), i1 = z.fin - ((z.fin % 2) ? 1 : 0);
        var ni = Math.floor(n / 2);
        h += filaDL('Direcciones', '<code>' + hp(z.ini) + '</code> a <code>' + hp(z.fin) + '</code>') +
          filaDL('Instrucciones', 'primera en <code>' + hp(i0) + '</code>, última en <code>' + hp(i1) + '</code> <span class="vm-mini">(direcciones pares)</span>') +
          filaDL('Tamaño', miles(ni) + ' instrucciones (words de 24 bits) = ' + miles(ni * 3) + ' bytes; ocupan ' + miles(n) + ' direcciones (' + hex(n, 1) + ')');
      }
      h += '</dl>' + descZona(z, m);
      panel.innerHTML = h;
    }

    function marcarZonas() {
      zonasBtn.forEach(function (b) {
        var on = b.getAttribute('data-m') === sel.m && +b.getAttribute('data-i') === sel.i;
        b.classList.toggle('vm-sel', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
    }

    function seleccionar(m, i, reg) {
      var cambia = sel.m !== m || sel.i !== i || selReg !== reg;
      sel = { m: m, i: i };
      selReg = reg || null;
      marcarZonas();
      if (cambia || !panel.innerHTML) pintarPanel();
    }

    el.querySelector('.vm-mapas').addEventListener('click', function (e) {
      var b = e.target.closest('.vm-zona');
      if (!b) return;
      var m = b.getAttribute('data-m'), i = +b.getAttribute('data-i');
      seleccionar(m, i, (sel.m === m && sel.i === i) ? selReg : null);
    });
    el.querySelector('.vm-mapas').addEventListener('focusin', function (e) {
      var b = e.target.closest('.vm-zona');
      if (!b) return;
      var m = b.getAttribute('data-m'), i = +b.getAttribute('data-i');
      if (sel.m !== m || sel.i !== i) seleccionar(m, i, null);
    });
    el.querySelector('.vm-mapas').addEventListener('keydown', function (e) {
      var b = e.target.closest('.vm-zona');
      if (!b) return;
      var m = b.getAttribute('data-m'), i = +b.getAttribute('data-i'), n = Z[m].length, d;
      switch (e.key) {
        case 'ArrowUp': d = Math.min(n - 1, i + 1); break;
        case 'ArrowDown': d = Math.max(0, i - 1); break;
        case 'Home': d = n - 1; break;
        case 'End': d = 0; break;
        default: return;
      }
      e.preventDefault();
      var t = btnZona(m, d);
      if (t) t.focus();
      seleccionar(m, d, null);
    });
    panel.addEventListener('click', function (e) {
      var c = e.target.closest('[data-reg]');
      if (!c) return;
      var d = +c.getAttribute('data-reg'), r = regEn(d);
      selReg = (selReg === r) ? null : r;
      pintarPanel();
      var nuevo = panel.querySelector('[data-reg="' + d + '"]');
      if (nuevo) nuevo.focus();
    });

    // ----- Buscador -----
    var form = el.querySelector('.vm-busca');
    var q = el.querySelector('#' + uid + '-q');
    var res = el.querySelector('.vm-res');
    var bm = 'd';
    function pintarBm() {
      Array.prototype.forEach.call(form.querySelectorAll('.vm-seg .vm-segb'), function (b) {
        b.setAttribute('aria-pressed', b.getAttribute('data-bm') === bm ? 'true' : 'false');
      });
      q.placeholder = bm === 'd' ? 'p. ej. 0x02C8' : 'p. ej. 0x000200';
    }
    function zonaDe(m, a) {
      for (var i = 0; i < Z[m].length; i++) if (a >= Z[m][i].ini && a <= Z[m][i].fin) return i;
      return -1;
    }
    function buscar() {
      var txt = q.value.trim();
      if (!txt) { res.innerHTML = '<p class="vm-err">Escribe una dirección en hexadecimal (p. ej. 0x02C8 o 2C8).</p>'; return; }
      var a = parseHex(txt), extra = '';
      if (isNaN(a)) { res.innerHTML = '<p class="vm-err">«' + esc(txt) + '» no es un número hexadecimal válido: usa las cifras 0-9 y A-F, con o sin 0x.</p>'; return; }
      if (bm === 'd' && a > MAX_D) {
        if (a > MAX_P) { res.innerHTML = '<p class="vm-err">' + hex(a, 1) + ' no cabe ni en las direcciones de datos (16 bits, hasta 0xFFFF) ni en las de programa (24 bits).</p>'; return; }
        bm = 'p'; pintarBm();
        extra = '<p class="vm-mini">No cabe en 16 bits (las direcciones de datos llegan hasta 0xFFFF): se busca en la memoria de programa.</p>';
      }
      if (bm === 'p' && a > MAX_P) { res.innerHTML = '<p class="vm-err">' + hex(a, 1) + ' se sale del espacio de programa (24 bits, hasta 0xFFFFFF).</p>'; return; }
      var i = zonaDe(bm, a);
      if (i < 0) return;
      var z = Z[bm][i], h = '';
      var f = bm === 'd' ? hd : hp;
      q.value = f(a);
      h += '<p><strong>' + f(a) + '</strong> está en la zona <strong>' + esc(z.nombre) + '</strong> (' + f(z.ini) + '-' + f(z.fin) + ') de la memoria de ' + (bm === 'd' ? 'datos' : 'programa') + '.</p>';
      var reg = null;
      if (bm === 'd') {
        reg = (z.tipo === 'noimpl') ? null : regEn(a);
        if (reg) {
          h += '<p>Es ' + (a % 2 ? 'el <strong>byte alto</strong> (bits 15-8)' : 'el <strong>byte bajo</strong> (bits 7-0)') + ' del registro <code>' + reg.n + '</code> (word ' + hd(reg.d) + '). ' + reg.t + '</p>';
        } else if (z.tipo === 'sfr') {
          h += '<p>No es ninguno de los registros que conoce el visor: puede ser otro SFR del datasheet (tablas 4-1 y siguientes) o una dirección sin usar, que se lee 0.</p>';
        } else if (z.tipo === 'ram') {
          h += '<p>Es el byte ' + miles(a - z.ini) + ' de la RAM (contando desde 0), ' + (a % 2 ? 'byte alto' : 'byte bajo') + ' del word ' + hd(a - (a % 2)) + '. Aquí van las variables de los programas y el stack, que empieza en 0x0800 y crece hacia arriba.</p>';
        } else if (z.tipo === 'noimpl') {
          h += '<p>No hay memoria: al leerla se obtiene 0' + (a >= 0x8000 ? ' (es la mitad alta, EA&lt;15&gt; = 1, que puede servir de ventana PSV a la memoria de programa)' : '') + '.</p>';
        }
        if (a % 2 && z.tipo !== 'noimpl') h += '<p class="vm-mini">Al ser impar solo se accede a ella por bytes (MOV.B); un acceso de word a una dirección impar provoca una trampa de error de dirección.</p>';
      } else {
        if (a % 2) {
          h += '<p>Es una dirección <strong>impar</strong>: corresponde a la palabra alta de la instrucción en ' + hp(a - 1) + ' (sus bits 23-16 y el byte fantasma, que se lee 0). El PC nunca vale una dirección impar.</p>';
        }
        if (a < 0x200 && z.tipo === 'vectores') {
          var w = a - (a % 2);
          h += '<p>' + (w === 0 ? 'Es la instrucción GOTO del vector de reset.' :
            w === 2 ? 'Es la dirección de destino del GOTO del vector de reset (inicio del código).' :
            w < 0x100 ? 'Está en la tabla de vectores de interrupción (IVT).' :
            w < 0x104 ? 'Es una posición reservada.' :
            'Está en la tabla alternativa de vectores (AIVT), que se usa si INTCON2.ALTIVT = 1.') + '</p>';
        } else if (z.tipo === 'flash') {
          h += '<p>' + (a % 2 ? 'Pertenece a' : 'Es') + ' la instrucción número ' + miles(Math.floor((a - z.ini) / 2)) + ' de la zona (contando desde 0); ocupa 3 bytes, pero la siguiente está en ' + hp(a - (a % 2) + 2) + '.</p>';
        } else if (z.tipo === 'noimpl') {
          h += '<p>No hay FLASH en esta dirección: se lee como 0.</p>';
        } else if (z.tipo === 'config') {
          h += '<p>' + (a >= 0xF80000 && a <= 0xF80017 ? 'Registros de configuración del dispositivo.' : a >= 0xFF0000 ? 'DEVID (identificación del dispositivo).' : 'Zona reservada.') + ' Solo se accede con TBLRD/TBLWT, no con el PC.</p>';
        }
        INS.forEach(function (x) {
          if (x.dir === a - (a % 2)) h += '<p class="vm-mini">En el ejemplo del libro, en ' + hp(x.dir) + ' está ' + hex(x.codigo, 6) + (x.asm ? ' = <code>' + esc(x.asm) + '</code>' : '') + '.</p>';
        });
      }
      res.innerHTML = extra + h;
      seleccionar(bm, i, reg);
    }
    form.addEventListener('submit', function (e) { e.preventDefault(); buscar(); });
    form.addEventListener('click', function (e) {
      var b = e.target.closest('[data-bm]');
      if (!b) return;
      bm = b.getAttribute('data-bm');
      pintarBm();
      if (b.classList.contains('vm-ej')) { q.value = b.getAttribute('data-q'); buscar(); }
    });

    // ----- Little endian -----
    var leTabla = el.querySelector('.vm-le-tabla');
    var leExp = el.querySelector('.vm-le-exp');
    var leInput = el.querySelector('#' + uid + '-le');
    function b2(n) { return hex(n, 2); }
    function pintarLE(error) {
      var lo = leVal & 0xFF, hi = (leVal >> 8) & 0xFF;
      var t = '';
      if (leModo === 'bytes') {
        t = '<caption class="vm-oculto">Memoria de datos por bytes</caption><thead><tr><th scope="col">Dirección</th><th scope="col">Byte</th><th scope="col">Qué es</th></tr></thead><tbody>' +
          '<tr><th scope="row">' + hd(leDir) + '</th><td><span class="vm-lo">' + b2(lo) + '</span></td><td>byte bajo (bits 7-0), dirección par</td></tr>' +
          '<tr><th scope="row">' + hd(leDir + 1) + '</th><td><span class="vm-hi">' + b2(hi) + '</span></td><td>byte alto (bits 15-8), dirección impar</td></tr>' +
          '<tr class="vm-tenue"><th scope="row">' + hd(leDir + 2) + '</th><td>0x00</td><td>siguiente word</td></tr>' +
          '<tr class="vm-tenue"><th scope="row">' + hd(leDir + 3) + '</th><td>0x00</td><td></td></tr></tbody>';
      } else {
        t = '<caption class="vm-oculto">Memoria de datos por words</caption><thead><tr><th scope="col">Dirección</th><th scope="col">Word</th><th scope="col">Qué es</th></tr></thead><tbody>' +
          '<tr><th scope="row">' + hd(leDir) + '</th><td>0x<span class="vm-hi">' + hex(hi, 2).slice(2) + '</span><span class="vm-lo">' + hex(lo, 2).slice(2) + '</span></td><td>el word se lee entero en su dirección par</td></tr>' +
          '<tr class="vm-tenue"><th scope="row">' + hd(leDir + 2) + '</th><td>0x0000</td><td>siguiente word (+2)</td></tr></tbody>';
      }
      leTabla.innerHTML = t;
      var exp = '';
      if (error) exp += '<p class="vm-err">' + error + '</p>';
      exp += '<p>' + leAviso + 'El word <strong>' + hd(leVal) + '</strong> en ' + hd(leDir) + ' guarda su <span class="vm-lo">byte bajo ' + b2(lo) + '</span> en la dirección par ' + hd(leDir) +
        ' y su <span class="vm-hi">byte alto ' + b2(hi) + '</span> en la impar ' + hd(leDir + 1) + ': es la regla <strong>little endian</strong> (el extremo pequeño, primero).</p>' +
        '<pre class="vm-pre"><code>MOV   ' + hd(leDir) + ', W0   ; W0 = ' + hd(leVal) + '\nMOV.B ' + hd(leDir + 1) + ', W0   ; byte bajo de W0 = ' + b2(hi) + '</code></pre>' +
        '<p class="vm-mini">Por words, las direcciones van de 2 en 2 y el word está alineado en la dirección par; por bytes, cada byte tiene su propia dirección.</p>';
      leExp.innerHTML = exp;
      Array.prototype.forEach.call(el.querySelectorAll('[data-lm]'), function (b) {
        b.setAttribute('aria-pressed', b.getAttribute('data-lm') === leModo ? 'true' : 'false');
      });
    }
    function leerLE() {
      var v = parseHex(leInput.value.trim());
      if (isNaN(v) || v > 0xFFFF) {
        leInput.setAttribute('aria-invalid', 'true');
        pintarLE('Escribe un valor hexadecimal de 16 bits, de 0x0000 a 0xFFFF (se mantiene ' + hd(leVal) + ').');
        return;
      }
      leInput.removeAttribute('aria-invalid');
      leVal = v;
      leInput.value = hd(v);
      pintarLE();
    }
    leInput.addEventListener('input', function () {
      var v = parseHex(leInput.value.trim());
      if (!isNaN(v) && v <= 0xFFFF) { leInput.removeAttribute('aria-invalid'); leVal = v; pintarLE(); }
    });
    leInput.addEventListener('change', leerLE);
    leInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); leerLE(); } });
    el.querySelector('.vm-le').addEventListener('click', function (e) {
      var b = e.target.closest('[data-lm]');
      if (!b) return;
      leModo = b.getAttribute('data-lm');
      pintarLE();
    });

    // ----- Memoria de programa -----
    var pTabla = el.querySelector('.vm-prog-tabla');
    var pExp = el.querySelector('.vm-prog-exp');
    var pcOut = el.querySelector('.vm-pc');
    var btnMas = el.querySelector('.vm-pc-mas');
    function pcValor() { return pcIdx < INS.length ? INS[pcIdx].dir : INS[INS.length - 1].dir + 2; }
    function pintarProg() {
      var t = '';
      if (progModo === 'words') {
        t = '<caption class="vm-oculto">Memoria de programa por instrucciones</caption><thead><tr>' +
          '<th scope="col">Dirección</th>' +
          '<th scope="col" class="vm-th-b"><abbr title="Byte fantasma: no implementado, se lee 0"><span class="vm-largo">Fantasma</span><span class="vm-corto">Fant.</span></abbr><span>31-24</span></th>' +
          '<th scope="col" class="vm-th-b">Bits<span>23-16</span></th>' +
          '<th scope="col" class="vm-th-b">Bits<span>15-8</span></th>' +
          '<th scope="col" class="vm-th-b">Bits<span>7-0</span></th>' +
          '<th scope="col"><span class="vm-largo">Ensamblador</span><span class="vm-corto">Asm</span></th></tr></thead><tbody>';
        INS.forEach(function (x, k) {
          var c = x.codigo;
          t += '<tr class="' + (k === pcIdx ? 'vm-pc-fila' : '') + '">' +
            '<th scope="row"><span class="vm-dir">' + hp(x.dir) + '</span><span class="vm-marcas">' + (k > 0 ? ' <span class="vm-mas2">+2</span>' : '') + (k === pcIdx ? ' <span class="vm-pc-tag">PC</span>' : '') + '</span></th>' +
            '<td class="vm-fant">00</td>' +
            '<td class="vm-b vm-b2">' + hex((c >> 16) & 0xFF, 2).slice(2) + '</td>' +
            '<td class="vm-b vm-b1">' + hex((c >> 8) & 0xFF, 2).slice(2) + '</td>' +
            '<td class="vm-b vm-b0">' + hex(c & 0xFF, 2).slice(2) + '</td>' +
            '<td><code>' + esc(x.asm) + '</code>' + (x.que ? '<span class="vm-que">' + esc(x.que) + '</span>' : '') + '</td></tr>';
        });
        t += '</tbody>';
      } else {
        t = '<caption class="vm-oculto">Memoria de programa por bytes</caption><thead><tr><th scope="col">Dirección</th><th scope="col">Byte</th><th scope="col">Instrucción</th></tr></thead><tbody>';
        INS.forEach(function (x, k) {
          var c = x.codigo, cls = k === pcIdx ? ' class="vm-pc-fila"' : '';
          var nom = '<code>' + esc(x.asm) + '</code> (' + hex(c, 6) + ')';
          t += '<tr' + cls + '><th scope="row">' + hp(x.dir) + '</th><td class="vm-b vm-b0">' + hex(c & 0xFF, 2) + '</td><td>' + nom + ', bits 7-0</td></tr>' +
            '<tr' + cls + '><th scope="row">' + hp(x.dir + 1) + '</th><td class="vm-b vm-b1">' + hex((c >> 8) & 0xFF, 2) + '</td><td>bits 15-8</td></tr>' +
            '<tr' + cls + '><th scope="row" class="vm-sindir">(sin dirección)</th><td class="vm-b vm-b2">' + hex((c >> 16) & 0xFF, 2) + '</td><td>bits 23-16</td></tr>';
        });
        t += '</tbody>';
      }
      pTabla.innerHTML = t;
      var pc = pcValor();
      pcOut.innerHTML = 'PC = <strong>' + hp(pc) + '</strong>';
      btnMas.disabled = pcIdx >= INS.length;
      var exp = '';
      if (pcIdx < INS.length) {
        var x = INS[pcIdx], c = x.codigo;
        exp += '<p>La instrucción en <strong>' + hp(x.dir) + '</strong> es ' + hex(c, 6) + (x.asm ? ' (<code>' + esc(x.asm) + '</code>)' : '') + ': ocupa 3 bytes (' +
          b2((c >> 16) & 0xFF) + ', ' + b2((c >> 8) & 0xFF) + ' y ' + b2(c & 0xFF) + '), pero la siguiente está en <strong>' + hp(x.dir + 2) + '</strong>: el PC avanza <strong>2</strong>, no 3.</p>';
      } else {
        exp += '<p>Fin del ejemplo: tras la última instrucción (' + hp(INS[INS.length - 1].dir) + ') el PC vale <strong>' + hp(pc) + '</strong> (+2). ' + INS.length + ' instrucciones ocupan ' + (INS.length * 3) + ' bytes, aunque las direcciones solo avanzan ' + (INS.length * 2) + '.</p>';
      }
      if (progModo === 'words') {
        exp += '<p class="vm-mini">Cada dirección par guarda la palabra baja de la instrucción (bits 15-0) y la impar siguiente, la alta: bits 23-16 más un <strong>byte fantasma</strong> (bits 31-24) que no existe y se lee 0 (datasheet 4.1.1, Figura 4-2). Así la memoria de programa se puede ver desde la de datos, que también avanza de 2 en 2.</p>';
      } else {
        exp += '<p class="vm-mini">Vista por bytes del libro (Figura 60): desde la memoria de datos solo se ven los dos bytes bajos de cada instrucción; el byte alto (bits 23-16) no tiene dirección propia de byte y solo es accesible con instrucciones especiales.</p>';
      }
      var flash = null;
      Z.p.forEach(function (z) { if (z.tipo === 'flash' && !flash) flash = z; });
      if (flash && INS[0].dir < flash.ini) {
        exp += '<p class="vm-nota">Las direcciones son las del ejemplo del libro. En un programa real el código va en la FLASH de usuario, desde ' + hp(flash.ini) + ': 0x000100-0x0001FF es la tabla alternativa de vectores.</p>';
      }
      pExp.innerHTML = exp;
      Array.prototype.forEach.call(el.querySelectorAll('[data-pm]'), function (b) {
        b.setAttribute('aria-pressed', b.getAttribute('data-pm') === progModo ? 'true' : 'false');
      });
    }
    btnMas.addEventListener('click', function () {
      if (pcIdx < INS.length) pcIdx++;
      pintarProg();
      if (btnMas.disabled) el.querySelector('.vm-pc-reset').focus();
    });
    el.querySelector('.vm-pc-reset').addEventListener('click', function () { pcIdx = 0; pintarProg(); });
    el.querySelector('.vm-prog').addEventListener('click', function (e) {
      var b = e.target.closest('[data-pm]');
      if (!b) return;
      progModo = b.getAttribute('data-pm');
      pintarProg();
    });

    marcarZonas();
    pintarPanel();
    pintarBm();
    pintarLE();
    pintarProg();
  };
})();
