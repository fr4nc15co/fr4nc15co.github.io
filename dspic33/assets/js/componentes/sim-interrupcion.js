/*
 * Componente "sim-interrupcion": atención a interrupciones del dsPIC33FJ32MC202
 * (tema Interrupciones, secciones 9.2 y 9.3).
 *
 * Dos modos (data-config):
 *
 *  a) {"modo":"pasos","fuente":"T1","prioridad":4,"ipl":0}
 *     Los 8 pasos de atención de una interrupción, uno a uno (Paso / Atrás /
 *     Reiniciar / Reproducir): CPU (PC, SR con IPL, W15), Stack (las dos words
 *     apiladas: PC<15:0> y SRL:IPL3:PC<22:16>), IVT (entrada real de la fuente,
 *     tabla 7-1: dirección = 0x000004 + 2 · n.º de vector) y periférico
 *     (flag IFSx, enable IECx, prioridad IPCx). Programa principal ficticio con
 *     la línea en curso y la ISR (borra el flag, tarea, RETFIE). Casilla
 *     «olvidar borrar el flag»: tras RETFIE la petición sigue activa y la CPU
 *     vuelve a entrar sin fin (datasheet 7.5.2).
 *
 *  b) {"modo":"prioridades","fuentes":[{"nombre":"T1","prioridad":4},
 *      {"nombre":"U1RX","prioridad":4},{"nombre":"AD1","prioridad":1}],"ipl":0}
 *     Línea de tiempo: el alumno lanza peticiones, cambia prioridades (0-7,
 *     0 = deshabilitada) y NSTDIS. Regla: una petición interrumpe si su
 *     prioridad es MAYOR que el IPL actual; empate entre pendientes → número
 *     de vector menor (prioridad natural, tabla 7-1). Cada fuente admite
 *     "duracion" (ciclos que dura su ISR en el diagrama; 5 por defecto, 6 AD1).
 *
 * Datos verificados en el datasheet (7.0 Interrupt Controller, tabla 7-1;
 * 4.4.1 Software Stack: W15 crece hacia direcciones altas y, en una excepción,
 * se apila el PC con el SRL concatenado; 7.5.2: RETFIE desapila PC, SRL e IPL).
 * Direcciones del programa (0x000226…, ISR en 0x000300) y W15 = 0x0850 son
 * ilustrativas.
 */
window.MPI = window.MPI || {};
MPI.componentes = MPI.componentes || {};

(function () {
  // ---------- Tabla 7-1 (fuentes usadas en el curso) ----------
  var FUENTES = {
    INT0: { vec: 8, irq: 0, isr: '_INT0Interrupt', flag: 'INT0IF', en: 'INT0IE', ip: 'INT0IP',
      nombre: 'Interrupción externa 0', evento: 'llega un flanco al pin INT0',
      decl: 'unsigned int pulsos = 0;', tarea: 'pulsos++;', ini: ['INTCON2 = 0x0000;', 'INT0 por flanco de subida'] },
    T1: { vec: 11, irq: 3, isr: '_T1Interrupt', flag: 'T1IF', en: 'T1IE', ip: 'T1IP',
      nombre: 'Timer 1', evento: 'TMR1 llega a PR1',
      decl: 'unsigned int ticks = 0;', tarea: 'ticks++;', ini: ['T1CON = 0x8030;', 'arranca el Timer 1'] },
    T2: { vec: 15, irq: 7, isr: '_T2Interrupt', flag: 'T2IF', en: 'T2IE', ip: 'T2IP',
      nombre: 'Timer 2', evento: 'TMR2 llega a PR2',
      decl: 'unsigned int ticks2 = 0;', tarea: 'ticks2++;', ini: ['T2CON = 0x8030;', 'arranca el Timer 2'] },
    T3: { vec: 16, irq: 8, isr: '_T3Interrupt', flag: 'T3IF', en: 'T3IE', ip: 'T3IP',
      nombre: 'Timer 3', evento: 'TMR3 llega a PR3',
      decl: 'unsigned int ticks3 = 0;', tarea: 'ticks3++;', ini: ['T3CON = 0x8030;', 'arranca el Timer 3'] },
    U1RX: { vec: 19, irq: 11, isr: '_U1RXInterrupt', flag: 'U1RXIF', en: 'U1RXIE', ip: 'U1RXIP',
      nombre: 'UART1, recepción', evento: 'llega un carácter por U1RX',
      decl: 'char dato;', tarea: 'dato = U1RXREG;', ini: ['U1MODE = 0x8000;', 'UART en marcha (resto de la config.)'] },
    U1TX: { vec: 20, irq: 12, isr: '_U1TXInterrupt', flag: 'U1TXIF', en: 'U1TXIE', ip: 'U1TXIP',
      nombre: 'UART1, transmisión', evento: 'queda sitio en el buffer de transmisión',
      decl: 'char dato = \'A\';', tarea: 'U1TXREG = dato;', ini: ['U1MODE = 0x8000;', 'UART en marcha (resto de la config.)'] },
    AD1: { vec: 21, irq: 13, isr: '_ADC1Interrupt', flag: 'AD1IF', en: 'AD1IE', ip: 'AD1IP',
      nombre: 'Convertidor A/D', evento: 'termina una conversión',
      decl: 'unsigned int valor;', tarea: 'valor = ADC1BUF0;', ini: ['AD1CON1 = 0x80E4;', 'A/D en marcha (resto de la config.)'] },
    QEI: { vec: 66, irq: 58, isr: '_QEIInterrupt', flag: 'QEIIF', en: 'QEIIE', ip: 'QEIIP',
      nombre: 'Encoder (QEI)', evento: 'el contador de posición coincide con MAXCNT',
      decl: 'int vueltas = 0;', tarea: 'vueltas++;', ini: ['QEICON = 0x0700;', 'QEI en marcha (resto de la config.)'] }
  };
  var ALIAS = { ADC1: 'AD1', ADC: 'AD1', TIMER1: 'T1', UART1RX: 'U1RX' };
  var IVT_FILAS = ['INT0', 'T1', 'T2', 'U1RX', 'AD1'];
  var COLORES = ['var(--acento)', 'var(--acento-2)', 'var(--morado)', 'var(--naranja)', 'var(--amarillo)', 'var(--azul-cl)'];

  function clave(n) {
    var k = String(n || '').toUpperCase().replace(/\s+/g, '');
    if (ALIAS[k]) k = ALIAS[k];
    return FUENTES[k] ? k : null;
  }
  function info(k) {
    var f = FUENTES[k];
    return {
      k: k, vec: f.vec, irq: f.irq, isr: f.isr, flag: f.flag, en: f.en, ip: f.ip, nombre: f.nombre,
      evento: f.evento, decl: f.decl, tarea: f.tarea, ini: f.ini,
      ifs: 'IFS' + (f.irq >> 4), iec: 'IEC' + (f.irq >> 4), bit: f.irq & 15,
      ipc: 'IPC' + (f.irq >> 2), sh: 4 * (f.irq & 3), ivt: 4 + 2 * f.vec
    };
  }
  function hex(v, n) {
    var s = (v >>> 0).toString(16).toUpperCase();
    while (s.length < n) s = '0' + s;
    return '0x' + s;
  }
  function bin(v, n) {
    var s = (v >>> 0).toString(2);
    while (s.length < n) s = '0' + s;
    return s;
  }
  function lc(cod, com) {
    while (cod.length < 39) cod += ' ';
    return cod + '// ' + com;
  }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function c(s) { return '<code>' + esc(s) + '</code>'; }
  function entero(v, def, min, max) {
    var n = Number(v);
    if (!isFinite(n) || Math.floor(n) !== n || n < min || n > max) return def;
    return n;
  }
  function reducido() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }
  var uid = 0;
  function nuevoId(p) { uid++; return p + '-' + uid + '-' + Math.random().toString(36).slice(2, 6); }

  // Código resaltado con una línea por <span> (y columna de direcciones).
  function pintarCodigo(pre, lineas) {
    pre.innerHTML = '<code class="lang-c"></code>';
    var code = pre.firstChild;
    code.textContent = lineas.map(function (l) { return l.t; }).join('\n');
    if (MPI.resaltarTodo) MPI.resaltarTodo(pre);
    var partes = code.innerHTML.split('\n');
    var conDir = lineas.some(function (l) { return l.dir != null; });
    code.innerHTML = partes.map(function (h, i) {
      var d = lineas[i].dir;
      return '<span class="sint-ln">' +
        (conDir ? '<span class="sint-dir" aria-hidden="true">' + (d != null ? hex(d, 6) : '') + '</span>' : '') +
        (h || ' ') + '</span>';
    }).join('');
    return code.children;
  }

  // =====================================================================
  //  MODO a) PASOS
  // =====================================================================
  function modoPasos(el, cfg) {
    var k = clave(cfg.fuente) || 'T1';
    var F = info(k);
    var prio = entero(cfg.prioridad, 4, 0, 7);
    var iplMain = entero(cfg.ipl, 0, 0, 7);
    var olvidar = false;
    var SP0 = 0x0850;               // W15 ilustrativo
    var A = { ini: 0x000214, x: 0x000226, y: 0x000228, z: 0x00022A, bra: 0x00022C, isr: 0x000300 };
    var idLive = nuevoId('sint-exp');

    var opcP = '', opcI = '';
    for (var i = 0; i <= 7; i++) {
      opcP += '<option value="' + i + '"' + (i === prio ? ' selected' : '') + '>' + i + (i === 0 ? ' (deshabilitada)' : '') + '</option>';
      opcI += '<option value="' + i + '"' + (i === iplMain ? ' selected' : '') + '>' + i + '</option>';
    }
    var chips = '';
    for (i = 1; i <= 8; i++) chips += '<li data-p="' + i + '">' + i + '</li>';

    el.classList.add('mpi-sim-interrupcion', 'sint-pasos');
    el.innerHTML =
      '<div class="mpi-sim-cab">Atención a una interrupción, paso a paso <span class="sint-cab-sub">' + esc(F.nombre) + ' · vector ' + F.vec + '</span></div>' +
      '<div class="sint-cfg">' +
        '<label>Prioridad ' + c(F.ip) + ' <select class="sint-sel-p">' + opcP + '</select></label>' +
        '<label>IPL del <code>main</code> <select class="sint-sel-i">' + opcI + '</select></label>' +
        '<label class="sint-chk"><input type="checkbox" class="sint-olvidar"> olvidar borrar el flag en la ISR</label>' +
      '</div>' +
      '<div class="sint-ctl" role="group" aria-label="Control del paso a paso">' +
        '<button type="button" class="sint-reini">⏮ Reiniciar</button>' +
        '<button type="button" class="sint-atras">◀ Atrás</button>' +
        '<button type="button" class="sint-paso">Paso ▶</button>' +
        '<button type="button" class="sint-play" aria-pressed="false">▶ Reproducir</button>' +
        '<span class="sint-cont" aria-hidden="true"></span>' +
      '</div>' +
      '<ol class="sint-chips" aria-hidden="true">' + chips + '<li data-p="0">fin</li></ol>' +
      '<div class="sint-exp" id="' + idLive + '" aria-live="polite" aria-atomic="true"></div>' +
      '<div class="sint-aviso" hidden></div>' +
      '<div class="sint-esq">' +
        '<section class="sint-caja sint-cpu" aria-label="CPU">' +
          '<h4>CPU</h4>' +
          '<div class="sint-reg" data-k="pc"><span>PC</span><b class="sint-v-pc"></b></div>' +
          '<div class="sint-reg" data-k="sr"><span>SR</span><b class="sint-v-sr"></b></div>' +
          '<div class="sint-srbits" aria-hidden="true"></div>' +
          '<div class="sint-reg" data-k="w15"><span>W15</span><b class="sint-v-w15"></b></div>' +
          '<div class="sint-ejec"></div>' +
        '</section>' +
        '<section class="sint-caja sint-pila" aria-label="Stack en RAM">' +
          '<h4>Stack <small>(RAM, crece hacia arriba)</small></h4>' +
          '<div class="sint-pila-filas"></div>' +
        '</section>' +
        '<section class="sint-caja sint-ivt" aria-label="Tabla de vectores">' +
          '<h4>IVT <small>(memoria de programa)</small></h4>' +
          '<div class="sint-ivt-filas"></div>' +
          '<div class="sint-inttreg"></div>' +
        '</section>' +
        '<section class="sint-caja sint-per" aria-label="Periférico">' +
          '<h4>' + esc(F.nombre) + '</h4>' +
          '<div class="sint-per-filas"></div>' +
          '<div class="sint-irq"><span class="sint-irq-luz" aria-hidden="true"></span><span class="sint-irq-t"></span></div>' +
        '</section>' +
      '</div>' +
      '<div class="sint-codigos">' +
        '<div><div class="sint-cod-tit">Programa principal</div><pre class="sint-cod-main"></pre></div>' +
        '<div><div class="sint-cod-tit">ISR</div><pre class="sint-cod-isr"></pre></div>' +
      '</div>' +
      '<p class="sint-nota">Direcciones de programa y valor inicial de W15 ilustrativos; para simplificar, cada línea del <code>while</code> se trata como una sola instrucción. La dirección del vector sí es la real (tabla 7-1 del datasheet: 0x000004 + 2 · n.º de vector).</p>';

    var q = function (s) { return el.querySelector(s); };
    var selP = q('.sint-sel-p'), selI = q('.sint-sel-i'), chk = q('.sint-olvidar');
    var bReini = q('.sint-reini'), bAtras = q('.sint-atras'), bPaso = q('.sint-paso'), bPlay = q('.sint-play');
    var exp = q('.sint-exp'), aviso = q('.sint-aviso'), cont = q('.sint-cont');

    var LM, LI, lnMain, lnIsr;      // índices y nodos de líneas
    var estados, ciclo, idx = 0, jugando = false, temporizador = null;

    function construirCodigo() {
      var mask = (~(7 << F.sh)) & 0xFFFF, val = prio << F.sh;
      var main = [
        { t: 'int x = 0, y = 0, z = 0;' },
        { t: lc(F.decl, 'la usa la ISR') },
        { t: '' },
        { t: 'int main(void)' },
        { t: '{' }
      ];
      LM = {};
      LM.ipc = main.length;
      // Estilo del curso: primero el campo a 0 con &= ~MASCARA y después |= valor.
      main.push({ t: lc('    ' + F.ipc + ' &= ~' + hex(~mask & 0xFFFF, 4) + ';', '1) campo ' + F.ip + ' a 0'), dir: A.ini });
      LM.ipc2 = null;
      if (val) {
        LM.ipc2 = main.length;
        main.push({ t: lc('    ' + F.ipc + ' |= ' + prio + ' << ' + F.sh + ';', '2) ' + F.ip + ' = ' + prio + ' (' + hex(val, 4) + ')'), dir: A.ini + 4 });
      }
      LM.ifs = main.length;
      main.push({ t: lc('    ' + F.ifs + 'bits.' + F.flag + ' = 0;', 'borra el flag'), dir: A.ini + 6 });
      LM.iec = main.length;
      main.push({ t: lc('    ' + F.iec + 'bits.' + F.en + ' = 1;', 'habilita la interrupción'), dir: A.ini + 8 });
      LM.per = main.length;
      main.push({ t: lc('    ' + F.ini[0], F.ini[1]), dir: A.ini + 10 });
      if (iplMain > 0) {
        LM.sr = main.length;
        main.push({ t: lc('    SRbits.IPL = ' + iplMain + ';', 'el main corre con IPL = ' + iplMain), dir: A.ini + 14 });
      }
      main.push({ t: '    while (1) {' });
      LM.x = main.length; main.push({ t: '        x++;', dir: A.x });
      LM.y = main.length; main.push({ t: '        y = x + 3;', dir: A.y });
      LM.z = main.length; main.push({ t: '        z = y * 2;', dir: A.z });
      LM.bra = main.length; main.push({ t: '    }', dir: A.bra });
      main.push({ t: '}' });

      var isr = [];
      LI = {};
      LI.cab = 0;
      isr.push({ t: 'void __attribute__((interrupt, no_auto_psv)) ' + F.isr + '(void)' });
      isr.push({ t: '{' });
      LI.flag = isr.length;
      isr.push(olvidar
        ? { t: lc('    // ' + F.ifs + 'bits.' + F.flag + ' = 0;', '← ¡olvidado!'), dir: null }
        : { t: lc('    ' + F.ifs + 'bits.' + F.flag + ' = 0;', '1.º: borra el flag'), dir: A.isr });
      LI.tarea = isr.length;
      isr.push({ t: lc('    ' + F.tarea, 'tarea corta'), dir: olvidar ? A.isr : A.isr + 2 });
      LI.ret = isr.length;
      isr.push({ t: lc('}', 'RETFIE'), dir: olvidar ? A.isr + 2 : A.isr + 4 });
      lnMain = pintarCodigo(q('.sint-cod-main'), main);
      lnIsr = pintarCodigo(q('.sint-cod-isr'), isr);
    }

    // ---------- secuencia de estados ----------
    function generar() {
      estados = [];
      var interrumpe = prio > iplMain;
      var srl = (iplMain << 5) & 0xFF;
      var w2 = (srl << 8);                     // SRL:IPL3(0):PC<22:16>(0x00)
      var s = { paso: 1, pc: A.ini + 10, ipl: iplMain, w15: SP0, pila: null, pilaViva: false, flag: 0, irq: false,
        ivt: false, enIsr: false, lm: [], lmSig: -1, li: [], liSig: -1, entradas: 0, tarea: 0 };
      function add(paso, tit, txt, mod) {
        var n = {};
        for (var p in s) n[p] = s[p];
        n.lm = []; n.li = []; n.lmSig = -1; n.liSig = -1;
        for (p in mod) n[p] = mod[p];
        n.paso = paso; n.tit = tit; n.txt = txt;
        estados.push(n);
        s = n;
      }
      var flagTxt = c(F.ifs + 'bits.' + F.flag);
      add(1, 'La CPU inicializa el periférico',
        'El <code>main</code> fija la prioridad (' + F.ip + ' = ' + prio + ' en ' + F.ipc + '&lt;' + (F.sh + 2) + ':' + F.sh + '&gt;), ' +
        'borra el flag ' + F.flag + ' y habilita la interrupción con ' + F.en + ' = 1. Después pone en marcha el periférico.' +
        (prio === 0 ? ' <b>Ojo: prioridad 0 equivale a interrupción deshabilitada.</b>' : ''),
        { lm: [LM.ipc].concat(LM.ipc2 != null ? [LM.ipc2] : []).concat([LM.ifs, LM.iec, LM.per]).concat(LM.sr != null ? [LM.sr] : []), pc: LM.sr != null ? A.ini + 14 : A.ini + 10 });
      add(2, 'El main se ejecuta con IPL = ' + iplMain,
        'La CPU ejecuta el bucle del <code>main</code>. El campo IPL del SR (bits 7-5) vale ' + iplMain +
        (iplMain === 0 ? ', la prioridad más baja: cualquier fuente habilitada con prioridad 1-7 puede interrumpirlo.'
          : ': solo pueden interrumpirlo fuentes con prioridad ' + (iplMain + 1) + '-7.'),
        { lm: [LM.x], pc: A.x });
      add(3, 'El periférico pide interrupción (IRQ)',
        F.nombre + ': ' + esc(F.evento) + '. El periférico pone ' + F.flag + ' = 1 (bit ' + F.bit + ' de ' + F.ifs + ')' +
        (prio > 0 ? ' y, como ' + F.en + ' = 1, la petición llega a la CPU por la línea IRQ.' : ', pero con prioridad 0 la petición no llega a la CPU.') +
        ' En ese instante la CPU está ejecutando ' + c('y = x + 3;') + '.',
        { flag: 1, irq: prio > 0, lm: [LM.y], pc: A.y });
      if (!interrumpe) {
        add(4, 'No interrumpe: queda pendiente',
          'La CPU termina ' + c('y = x + 3;') + ', pero la petición no cumple la regla: ' +
          (prio === 0 ? 'la prioridad 0 deshabilita la fuente.' : 'su prioridad (' + prio + ') no es <b>mayor</b> que el IPL del SR (' + iplMain + ').') +
          ' La petición no se pierde: ' + F.flag + ' sigue a 1 (pendiente) y se atendería si el IPL bajase por debajo de ' + Math.max(prio, 1) + '.',
          { lmSig: LM.z, pc: A.z });
        add(0, 'El main sigue sin interrupción',
          'La CPU ejecuta ' + c('z = y * 2;') + ' y continúa con el bucle. El Stack y el PC no cambian; ' + F.flag + ' = 1 espera.',
          { lm: [LM.z], pc: A.z });
        ciclo = null;
        return;
      }
      add(4, 'Termina la instrucción en curso',
        'Una instrucción nunca se corta a medias: la CPU acaba ' + c('y = x + 3;') + '. El PC ya apunta a la siguiente, ' +
        c('z = y * 2;') + ' (' + hex(A.z, 6) + '), que todavía <b>no</b> se ejecuta: será la dirección de retorno.',
        { lmSig: LM.z, pc: A.z });
      function txtApila(n) {
        return (n > 1 ? 'el' : 'El') + ' hardware apila dos words donde apunta W15 (que crece hacia direcciones altas): ' +
          '[' + hex(SP0, 4) + '] ← PC&lt;15:0&gt; = ' + hex(A.z & 0xFFFF, 4) + ' y [' + hex(SP0 + 2, 4) + '] ← SRL:IPL3:PC&lt;22:16&gt; = ' + hex(w2, 4) +
          ' (el byte bajo del SR, ' + hex(srl, 2) + ', con el IPL y los flags N, OV, Z y C). W15 pasa de ' + hex(SP0, 4) + ' a ' + hex(SP0 + 4, 4) + '.' +
          (n > 1 ? ' Es la <b>entrada n.º ' + n + '</b> en la ISR y el <code>main</code> sigue sin avanzar.' : '');
      }
      add(5, 'Guarda PC y SR en el Stack', txtApila(1),
        { pila: [A.z & 0xFFFF, w2], pilaViva: true, w15: SP0 + 4, lmSig: LM.z, entradas: 1 });
      function txtRecon() {
        return 'El controlador busca peticiones con flag = 1 y enable = 1 y elige la de mayor prioridad: ' + F.k + ' (IP = ' + prio +
          ' &gt; IPL = ' + iplMain + '). Su vector es el n.º ' + F.vec + ' (IRQ ' + F.irq + '), así que está en la dirección 0x000004 + 2 · ' + F.vec +
          ' = <b>' + hex(F.ivt, 6) + '</b> de la IVT. (INTTREG: VECNUM = ' + (F.vec - 8) + ', ILR = ' + prio + '.)';
      }
      add(6, 'Ciclo de reconocimiento de interrupción', txtRecon(), { ivt: true, lmSig: LM.z });
      function txtSalta() {
        return 'La CPU carga en el PC el contenido del vector, <b>' + hex(A.isr, 6) + '</b> (la dirección de ' + c(F.isr) +
          ', que puso el compilador gracias al nombre fijo de la función), y escribe la prioridad en el IPL: SR = ' +
          hex(prio << 5, 4) + ' (IPL = ' + prio + ').' + (prio < 7 ? ' Ahora solo podría interrumpir una fuente de prioridad ' + (prio + 1) + '-7.' : ' Con IPL = 7 no puede interrumpir ninguna fuente de usuario.');
      }
      add(7, 'Salta a la ISR', txtSalta(),
        { pc: A.isr, ipl: prio, enIsr: true, ivt: true, li: [LI.cab], liSig: olvidar ? LI.tarea : LI.flag });
      function txtFlag() {
        return olvidar
          ? 'La ISR <b>no</b> borra el flag (línea olvidada): ' + F.flag + ' sigue a 1 y la petición sigue activa. Mientras el IPL valga ' + prio + ' no hace nada… pero espera.'
          : flagTxt + ' = 0 es lo primero que hace la ISR: el periférico deja de pedir. Si no se borra, la petición seguiría activa tras salir.';
      }
      add(7, olvidar ? 'ISR: el flag NO se borra' : 'ISR: borra el flag', txtFlag(),
        olvidar ? { li: [LI.flag], liSig: LI.tarea, pc: A.isr } : { flag: 0, irq: false, li: [LI.flag], pc: A.isr });
      add(7, 'ISR: hace su tarea',
        c(F.tarea) + ' — la tarea de una ISR debe ser corta y sin bucles de espera.',
        { li: [LI.tarea], pc: olvidar ? A.isr : A.isr + 2, tarea: s.tarea + 1 });
      function txtRetfie() {
        return 'Al final de la ISR el compilador pone <code>RETFIE</code>: desapila el SRL (con el IPL anterior) y el PC. W15 vuelve a ' + hex(SP0, 4) +
          ', IPL = ' + iplMain + ' y PC = ' + hex(A.z, 6) + '.' +
          (olvidar ? ' <b>Pero ' + F.flag + ' sigue a 1</b>: la petición vuelve a cumplir IP (' + prio + ') &gt; IPL (' + iplMain + ').' : '');
      }
      add(8, 'RETFIE: vuelta al punto interrumpido', txtRetfie(),
        { pc: A.z, ipl: iplMain, w15: SP0, pilaViva: false, enIsr: false, ivt: false, li: [LI.ret], lmSig: LM.z });
      if (!olvidar) {
        add(0, 'El main continúa en la instrucción siguiente',
          'La CPU ejecuta ' + c('z = y * 2;') + ', justo la que seguía a la interrumpida. El <code>main</code> no nota nada salvo el tiempo invertido; el IPL vuelve a ser ' + iplMain + '.',
          { lm: [LM.z], pc: A.z });
        ciclo = null;
        return;
      }
      // Bucle sin fin: se generan bajo demanda.
      ciclo = function () {
        var n = s.entradas + 1;
        add(5, 'Vuelve a entrar (entrada ' + n + ')',
          'Tras <code>RETFIE</code> la petición sigue activa, así que la CPU <b>no ejecuta ninguna instrucción del <code>main</code></b>: ' + txtApila(n),
          { pila: [A.z & 0xFFFF, w2], pilaViva: true, w15: SP0 + 4, lmSig: LM.z, entradas: n });
        add(6, 'Reconocimiento (otra vez)', txtRecon(), { ivt: true, lmSig: LM.z });
        add(7, 'Salta a la ISR (otra vez)', txtSalta(), { pc: A.isr, ipl: prio, enIsr: true, ivt: true, li: [LI.cab], liSig: LI.tarea });
        add(7, 'ISR: el flag sigue sin borrarse', txtFlag(), { li: [LI.flag], liSig: LI.tarea, pc: A.isr });
        add(7, 'ISR: repite la tarea', c(F.tarea) + ' se ejecuta por ' + n + '.ª vez para un único evento del periférico.',
          { li: [LI.tarea], pc: A.isr, tarea: s.tarea + 1 });
        add(8, 'RETFIE… y vuelta a empezar', txtRetfie(),
          { pc: A.z, ipl: iplMain, w15: SP0, pilaViva: false, enIsr: false, ivt: false, li: [LI.ret], lmSig: LM.z });
      };
    }
    function estado(i) {
      while (i >= estados.length && ciclo) ciclo();
      return estados[Math.min(i, estados.length - 1)];
    }

    // ---------- pintado ----------
    var cache = {};
    function set(nodo, clv, txt, html) {
      if (cache[clv] === txt) return;
      cache[clv] = txt;
      if (html) nodo.innerHTML = txt; else nodo.textContent = txt;
    }
    function cambio(nodo, on) { nodo.classList.toggle('sint-cambia', !!on); }

    function pintar() {
      var e = estado(idx), ant = idx > 0 ? estado(idx - 1) : e;
      var fin = !ciclo && idx >= estados.length - 1;
      var sr = (e.ipl << 5) & 0xFFFF;

      set(exp, 'exp', '<b class="sint-exp-tit">' + (e.paso ? 'Paso ' + e.paso + ' · ' : '') + esc(e.tit) + '</b><p>' + e.txt + '</p>', true);
      set(cont, 'cont', (ciclo ? 'estado ' + (idx + 1) : 'estado ' + (idx + 1) + ' de ' + estados.length));
      var lis = el.querySelectorAll('.sint-chips li');
      for (var i = 0; i < lis.length; i++) lis[i].classList.toggle('sint-chip-on', +lis[i].getAttribute('data-p') === e.paso);

      var vPc = q('.sint-v-pc'), vSr = q('.sint-v-sr'), vW = q('.sint-v-w15');
      set(vPc, 'pc', hex(e.pc, 6));
      set(vSr, 'sr', hex(sr, 4) + '  (IPL = ' + e.ipl + ')');
      set(vW, 'w15', hex(e.w15, 4));
      cambio(vPc.parentNode, idx > 0 && e.pc !== ant.pc);
      cambio(vSr.parentNode, idx > 0 && e.ipl !== ant.ipl);
      cambio(vW.parentNode, idx > 0 && e.w15 !== ant.w15);
      var nb = ['IPL2', 'IPL1', 'IPL0', 'RA', 'N', 'OV', 'Z', 'C'], bh = '';
      for (i = 0; i < 8; i++) {
        var b = 7 - i, v = (sr >> b) & 1;
        bh += '<span class="sint-b' + (b >= 5 ? ' sint-b-ipl' : '') + (v ? ' sint-b-1' : '') + '"><i>' + nb[i] + '</i>' + v + '</span>';
      }
      set(q('.sint-srbits'), 'srb', bh, true);
      set(q('.sint-ejec'), 'ejec', e.enIsr ? 'Ejecutando: <code>' + F.isr + '</code>' : 'Ejecutando: <code>main</code>', true);

      // Stack
      var filas = '';
      [SP0 + 6, SP0 + 4, SP0 + 2, SP0].forEach(function (dir) {
        var txt = '—', det = '', cls = 'sint-pf';
        if (e.pila && (dir === SP0 || dir === SP0 + 2)) {
          txt = hex(dir === SP0 ? e.pila[0] : e.pila[1], 4);
          det = dir === SP0 ? 'PC&lt;15:0&gt;' : 'SRL:IPL3:PC&lt;22:16&gt;';
          cls += e.pilaViva ? ' sint-pf-ocupada' : ' sint-pf-libre';
          if (!e.pilaViva) det += ' (libre)';
        }
        var w = dir === e.w15;
        filas += '<div class="' + cls + (w ? ' sint-pf-w15' : '') + '"><span class="sint-pf-dir">' + hex(dir, 4) + '</span>' +
          '<b>' + txt + '</b><span class="sint-pf-det">' + det + (w ? '<em>← W15</em>' : '') + '</span></div>';
      });
      set(q('.sint-pila-filas'), 'pila', filas, true);
      cambio(q('.sint-pila'), idx > 0 && (e.pilaViva !== ant.pilaViva || e.entradas !== ant.entradas));

      // IVT
      var lista = IVT_FILAS.slice();
      if (lista.indexOf(F.k) < 0) lista.push(F.k);
      lista.sort(function (a, b2) { return FUENTES[a].vec - FUENTES[b2].vec; });
      var ih = '';
      lista.forEach(function (kk) {
        var g = info(kk), sel = kk === F.k;
        ih += '<div class="sint-iv' + (sel ? ' sint-iv-sel' : '') + (sel && e.ivt ? ' sint-iv-on' : '') + '">' +
          '<span class="sint-iv-dir">' + hex(g.ivt, 6) + '</span>' +
          '<span class="sint-iv-n">' + kk + ' · v' + g.vec + '</span>' +
          '<b>' + (sel ? '→ ' + hex(A.isr, 6) : '<span class="sint-iv-otro">→ ' + g.isr + '</span>') + '</b></div>';
      });
      set(q('.sint-ivt-filas'), 'ivt', ih, true);
      set(q('.sint-inttreg'), 'itt', e.ivt ? 'INTTREG: VECNUM = ' + (F.vec - 8) + ', ILR = ' + prio : 'IVT: 0x000004-0x0000FE · AIVT: 0x000104-0x0001FE');

      // Periférico
      var ifsV = e.flag ? (1 << F.bit) : 0, iecV = 1 << F.bit, ipcV = ((0x4444 & ~(7 << F.sh)) | (prio << F.sh)) & 0xFFFF;
      var ph =
        '<div class="sint-pr' + (e.flag ? ' sint-pr-on' : '') + '"><span>' + F.ifs + '&lt;' + F.bit + '&gt; ' + F.flag + '</span><b>' + e.flag + '</b><small>' + F.ifs + ' = ' + hex(ifsV, 4) + '</small></div>' +
        '<div class="sint-pr"><span>' + F.iec + '&lt;' + F.bit + '&gt; ' + F.en + '</span><b>1</b><small>' + F.iec + ' = ' + hex(iecV, 4) + '</small></div>' +
        '<div class="sint-pr"><span>' + F.ipc + '&lt;' + (F.sh + 2) + ':' + F.sh + '&gt; ' + F.ip + '</span><b>' + prio + '</b><small>' + F.ipc + ' = ' + hex(ipcV, 4) + '</small></div>';
      set(q('.sint-per-filas'), 'per', ph, true);
      cambio(q('.sint-per-filas').firstChild, idx > 0 && e.flag !== ant.flag);
      q('.sint-irq').classList.toggle('sint-irq-on', e.irq);
      set(q('.sint-irq-t'), 'irq', e.irq ? 'IRQ → CPU: activa' : (e.flag ? 'IRQ: ' + F.flag + ' = 1 sin atender' : 'IRQ: inactiva'));

      // Código
      for (i = 0; i < lnMain.length; i++) {
        lnMain[i].classList.toggle('sint-activa', e.lm.indexOf(i) >= 0);
        lnMain[i].classList.toggle('sint-sig', e.lmSig === i);
      }
      for (i = 0; i < lnIsr.length; i++) {
        lnIsr[i].classList.toggle('sint-activa', e.li.indexOf(i) >= 0);
        lnIsr[i].classList.toggle('sint-sig', e.liSig === i);
        lnIsr[i].classList.toggle('sint-olvido', olvidar && i === LI.flag);
      }

      // Aviso del bucle
      if (olvidar && e.entradas >= 2) {
        aviso.hidden = false;
        set(aviso, 'av', '<b>⚠ Bucle sin fin.</b> La ISR ha entrado <b>' + e.entradas + '</b> veces por un solo evento y ' +
          c(F.tarea) + ' se ha ejecutado ' + e.tarea + ' veces; ' + c('z = y * 2;') + ' no llega a ejecutarse nunca: el programa parece colgado. ' +
          'Solución: borrar ' + F.flag + ' al principio de la ISR (datasheet 7.5.2).', true);
      } else aviso.hidden = true;

      bAtras.disabled = idx === 0;
      bPaso.disabled = fin;
      if (fin && jugando) parar();
    }

    // ---------- control ----------
    function parar() {
      jugando = false;
      if (temporizador) { clearTimeout(temporizador); temporizador = null; }
      bPlay.textContent = '▶ Reproducir';
      bPlay.setAttribute('aria-pressed', 'false');
    }
    function tic() {
      temporizador = null;
      if (!document.body.contains(el)) { parar(); return; }
      if (!jugando) return;
      if (!ciclo && idx >= estados.length - 1) { parar(); return; }
      idx++;
      pintar();
      if (jugando) temporizador = setTimeout(tic, 1700);
    }
    function reconstruir() {
      parar();
      construirCodigo();
      generar();
      idx = 0;
      cache = {};
      pintar();
    }
    bPaso.addEventListener('click', function () { parar(); if (ciclo || idx < estados.length - 1) { idx++; pintar(); } });
    bAtras.addEventListener('click', function () { parar(); if (idx > 0) { idx--; pintar(); } });
    bReini.addEventListener('click', function () { parar(); idx = 0; pintar(); });
    bPlay.addEventListener('click', function () {
      if (jugando) { parar(); return; }
      if (!ciclo && idx >= estados.length - 1) idx = 0;
      jugando = true;
      bPlay.textContent = '⏸ Pausa';
      bPlay.setAttribute('aria-pressed', 'true');
      pintar();
      temporizador = setTimeout(tic, 900);
    });
    selP.addEventListener('change', function () { prio = +selP.value; reconstruir(); });
    selI.addEventListener('change', function () { iplMain = +selI.value; reconstruir(); });
    chk.addEventListener('change', function () { olvidar = chk.checked; reconstruir(); });
    el.addEventListener('keydown', function (ev) {
      if (ev.target && /^(SELECT|INPUT)$/.test(ev.target.tagName)) return;
      if (ev.key === 'ArrowRight') { ev.preventDefault(); bPaso.click(); }
      else if (ev.key === 'ArrowLeft') { ev.preventDefault(); bAtras.click(); }
    });

    reconstruir();
  }

  // =====================================================================
  //  MODO b) PRIORIDADES
  // =====================================================================
  var ESCENARIOS = [
    { id: 'misma', tit: 'T1 llega durante la ISR de U1RX (misma prioridad)', prios: { T1: 4, U1RX: 4, AD1: 1 },
      pet: [{ t: 2, f: 'U1RX' }, { t: 4, f: 'T1' }],
      exp: 'U1RX entra en t = 2 (IPL = 4). T1 pide en t = 4 con prioridad 4, que <b>no es mayor</b> que el IPL 4: queda pendiente con su flag a 1 y se atiende al terminar U1RX, cuando RETFIE devuelve el IPL a 0. Misma prioridad nunca interrumpe.' },
    { id: 'ad1t1', tit: 'AD1 (1) durante T1 (4)', prios: { T1: 4, U1RX: 4, AD1: 1 },
      pet: [{ t: 2, f: 'T1' }, { t: 4, f: 'AD1' }],
      exp: 'T1 entra en t = 2 (IPL = 4). AD1 pide en t = 4 con prioridad 1 &lt; 4: espera pendiente y se atiende cuando T1 termina.' },
    { id: 't1ad1', tit: 'T1 (4) durante AD1 (1)', prios: { T1: 4, U1RX: 4, AD1: 1 },
      pet: [{ t: 2, f: 'AD1' }, { t: 4, f: 'T1' }],
      exp: 'AD1 entra en t = 2 (IPL = 1). T1 pide en t = 4 con prioridad 4 &gt; 1: <b>anida</b>. Se apilan PC y SR de la ISR de AD1, se ejecuta la de T1 y RETFIE vuelve a la de AD1, que termina y vuelve al main. Activa NSTDIS y repite para ver cómo T1 espera.' },
    { id: 'vez', tit: 'T1 y U1RX a la vez', prios: { T1: 4, U1RX: 4, AD1: 1 },
      pet: [{ t: 2, f: 'T1' }, { t: 2, f: 'U1RX' }],
      exp: 'Las dos piden en t = 2 con prioridad 4. Desempata la <b>prioridad natural</b>: gana el número de vector menor, T1 (vector 11) frente a U1RX (vector 19). U1RX espera a que T1 termine.' }
  ];

  function modoPrioridades(el, cfg) {
    var lista = Array.isArray(cfg.fuentes) && cfg.fuentes.length ? cfg.fuentes
      : [{ nombre: 'T1', prioridad: 4 }, { nombre: 'U1RX', prioridad: 4 }, { nombre: 'AD1', prioridad: 1 }];
    var fuentes = [], vistos = {};
    lista.forEach(function (x) {
      var kk = clave(x && x.nombre);
      if (!kk || vistos[kk] || fuentes.length >= 6) return;
      vistos[kk] = 1;
      var g = info(kk);
      g.prio = entero(x.prioridad, 4, 0, 7);
      g.prio0 = g.prio;
      g.dur = entero(x.duracion, kk === 'AD1' ? 6 : 5, 1, 20);
      g.color = COLORES[fuentes.length];
      g.fn = g.flag;
      g.flag = 0;
      fuentes.push(g);
    });
    if (!fuentes.length) {
      ['T1', 'U1RX', 'AD1'].forEach(function (kk, j) {
        var g = info(kk); g.prio = g.prio0 = [4, 4, 1][j]; g.dur = kk === 'AD1' ? 6 : 5; g.color = COLORES[j]; g.fn = g.flag; g.flag = 0; fuentes.push(g);
      });
    }
    var porK = {};
    fuentes.forEach(function (f) { porK[f.k] = f; });
    var iplMain0 = entero(cfg.ipl, 0, 0, 7), iplMain = iplMain0;
    var nstdis = false;
    var VEN = 32, TW = 14, ML = 52, MT = 8, RH = 22, MR = 8;
    var VBW = ML + VEN * TW + MR, VBH = MT + 8 * RH + 24;

    var filas = '';
    fuentes.forEach(function (f, j) {
      var opc = '';
      for (var p = 0; p <= 7; p++) opc += '<option value="' + p + '"' + (p === f.prio ? ' selected' : '') + '>' + p + (p === 0 ? ' (off)' : '') + '</option>';
      filas += '<div class="sint-f" data-j="' + j + '">' +
        '<span class="sint-f-nom"><span class="sint-sw" style="background:' + f.color + '" aria-hidden="true"></span><b>' + f.k + '</b><small>vector ' + f.vec + '</small></span>' +
        '<label>' + f.ip + ' <select data-j="' + j + '" aria-label="Prioridad de ' + f.k + '">' + opc + '</select></label>' +
        '<button type="button" class="sint-pedir" data-j="' + j + '">Pedir ' + f.k + '</button>' +
        '<span class="sint-f-est" data-j="' + j + '">—</span></div>';
    });
    var esc_html = '';
    ESCENARIOS.forEach(function (e) {
      var ok = e.pet.every(function (p) { return porK[p.f]; });
      if (ok) esc_html += '<button type="button" class="sint-esc" data-id="' + e.id + '">' + esc(e.tit) + '</button>';
    });
    var opcI = '';
    for (var p = 0; p <= 6; p++) opcI += '<option value="' + p + '"' + (p === iplMain ? ' selected' : '') + '>' + p + '</option>';

    var idLog = nuevoId('sint-log');
    el.classList.add('mpi-sim-interrupcion', 'sint-prio');
    el.innerHTML =
      '<div class="mpi-sim-cab">Prioridades y anidamiento <span class="sint-cab-sub">línea de tiempo</span></div>' +
      '<p class="sint-sub">Una petición interrumpe solo si su prioridad es <b>mayor</b> que el IPL del SR. Empate entre pendientes: gana el número de vector menor. Pulsa varios «Pedir» con la simulación en pausa para que lleguen a la vez.</p>' +
      (esc_html ? '<div class="sint-escs" role="group" aria-label="Escenarios"><span class="sint-escs-t">Escenarios:</span>' + esc_html + '</div>' : '') +
      '<div class="sint-esc-exp" hidden></div>' +
      '<div class="sint-fuentes">' + filas + '</div>' +
      '<div class="sint-glob">' +
        '<label class="sint-chk"><input type="checkbox" class="sint-nst"> NSTDIS = 1 <small>(INTCON1&lt;15&gt;: anidamiento deshabilitado)</small></label>' +
        '<label>IPL del <code>main</code> <select class="sint-ipl-main">' + opcI + '</select></label>' +
      '</div>' +
      '<div class="sint-ctl" role="group" aria-label="Control del tiempo">' +
        '<button type="button" class="sint-play" aria-pressed="false">▶ Reproducir</button>' +
        '<button type="button" class="sint-avz">Avanzar 1 ciclo</button>' +
        '<button type="button" class="sint-reini">Reiniciar</button>' +
      '</div>' +
      '<div class="sint-estado" aria-live="polite"></div>' +
      '<div class="sint-graf-scroll"><svg class="sint-graf" viewBox="0 0 ' + VBW + ' ' + VBH + '" role="img" aria-labelledby="' + idLog + '-t"><title id="' + idLog + '-t">Diagrama temporal de niveles de prioridad</title><g class="sint-g"></g></svg></div>' +
      '<div class="sint-leyenda" aria-hidden="true">' +
        fuentes.map(function (f) { return '<span><i class="sint-lg-bar" style="background:' + f.color + '"></i>ISR ' + f.k + '</span>'; }).join('') +
        '<span><i class="sint-lg-bar sint-lg-main"></i>main</span>' +
        '<span><i class="sint-lg-susp"></i>ISR interrumpida</span>' +
        '<span><i class="sint-lg-ipl"></i>IPL del SR</span>' +
        '<span><i class="sint-lg-pet">▼</i>petición</span>' +
        '<span><i class="sint-lg-esp"></i>pendiente</span>' +
      '</div>' +
      '<div class="sint-log-tit" id="' + idLog + '">Registro de eventos</div>' +
      '<ol class="sint-log" aria-labelledby="' + idLog + '"></ol>' +
      '<p class="sint-nota">Cada ciclo del diagrama es una unidad de tiempo arbitraria; la latencia fija de entrada y salida no se dibuja. Con NSTDIS = 1 el manual de la familia indica que la CPU sube el IPL a 7 mientras atiende cualquier interrupción, por eso la línea del IPL salta a 7.</p>';

    var q = function (s) { return el.querySelector(s); };
    var gEl = q('.sint-g'), estEl = q('.sint-estado'), logEl = q('.sint-log'), escExp = q('.sint-esc-exp');
    var bPlay = q('.sint-play'), chkN = q('.sint-nst'), selIM = q('.sint-ipl-main');

    var t, pila, hist, pets, esperas, logs, programa, jugando = false, temporizador = null, ocioso = 0;

    function reiniciar() {
      t = 0; pila = []; hist = []; pets = []; esperas = []; logs = []; programa = []; ocioso = 0;
      fuentes.forEach(function (f) { f.flag = 0; f.motivo = null; });
      logEl.innerHTML = '';
    }
    function iplActual() {
      if (!pila.length) return iplMain;
      return nstdis ? 7 : pila[pila.length - 1].nivel;
    }
    function log(tt, html) {
      logs.push({ t: tt, h: html });
      var li = document.createElement('li');
      li.innerHTML = '<span class="sint-log-t">t = ' + tt + '</span> ' + html;
      logEl.appendChild(li);
      while (logEl.children.length > 80) logEl.removeChild(logEl.firstChild);
      logEl.scrollTop = logEl.scrollHeight;
    }
    function pedir(f) {
      if (f.flag) { log(t, f.k + ' vuelve a pedir, pero ' + f.fn + ' ya estaba a 1: el flag no acumula peticiones.'); return; }
      f.flag = 1; f.motivo = null;
      pets.push({ t: t, f: f, nivel: f.prio });
      esperas.push({ f: f, desde: t, hasta: null, nivel: f.prio });
      log(t, '<b>' + f.k + '</b> pide interrupción (' + f.fn + ' = 1).');
      ocioso = 0;
    }

    function motivo(f, ganadora) {
      if (f.prio === 0) return f.k + ' tiene prioridad 0 (deshabilitada): su flag queda a 1 sin atender.';
      if (ganadora && ganadora.prio === f.prio) return f.k + ' queda pendiente: empate a prioridad ' + f.prio + ' con ' + ganadora.k + ', gana ' + ganadora.k + ' por prioridad natural (vector ' + ganadora.vec + ' &lt; ' + f.vec + ').';
      if (nstdis && pila.length) return f.k + ' queda pendiente: NSTDIS = 1 impide que una ISR sea interrumpida.';
      var ipl = iplActual();
      var top = pila.length ? pila[pila.length - 1] : null;
      return f.k + ' queda pendiente: su prioridad (' + f.prio + ') no es mayor que el IPL (' + ipl + ')' +
        (top && top.f !== f && top.nivel === f.prio ? '; misma prioridad que ' + top.f.k + ' → no interrumpe.' : top && top.f === f ? '; se atenderá cuando termine su propia ISR.' : '.');
    }
    function arbitrar() {
      var ipl = iplActual();
      var cand = fuentes.filter(function (f) { return f.flag; });
      if (!cand.length) return;
      var eleg = cand.filter(function (f) { return f.prio > 0 && f.prio > ipl && !(nstdis && pila.length); });
      var g = null;
      if (eleg.length) {
        eleg.sort(function (a, b) { return (b.prio - a.prio) || (a.vec - b.vec); });
        g = eleg[0];
        g.flag = 0; g.motivo = null;
        var desde = null;
        esperas.forEach(function (e) { if (e.f === g && e.hasta == null) { e.hasta = t; desde = e.desde; } });
        var prev = pila.length ? pila[pila.length - 1] : null;
        pila.push({ f: g, nivel: g.prio, restante: g.dur, inicio: t });
        var nIpl = nstdis ? 7 : g.prio;
        if (prev) log(t, '<b>' + g.k + '</b> (IP ' + g.prio + ') <b>interrumpe</b> a la ISR de ' + prev.f.k + ' (IPL ' + ipl + '): anidamiento. Se apilan PC y SR; IPL = ' + nIpl + '.');
        else log(t, 'Se atiende <b>' + g.k + '</b>: IP ' + g.prio + ' &gt; IPL ' + ipl + ' → apila PC y SR, salta a ' + c(g.isr) + ' (vector ' + g.vec + ', ' + hex(g.ivt, 6) + '); IPL = ' + nIpl + (nstdis ? ' (NSTDIS = 1)' : '') + '.' +
          (desde != null && desde < t ? ' Estaba pendiente desde t = ' + desde + '.' : ''));
        if (prev && desde != null && desde < t) log(t, '(' + g.k + ' estaba pendiente desde t = ' + desde + '.)');
        eleg.slice(1).forEach(function (f) { if (f.prio === g.prio) { log(t, motivo(f, g)); f.motivo = motivo(f, null); } });
      }
      fuentes.forEach(function (f) {
        if (!f.flag) return;
        var m = motivo(f, null);
        if (m !== f.motivo) { f.motivo = m; log(t, m); }
      });
    }
    function avanzar() {
      programa.forEach(function (p) { if (p.t === t && porK[p.f]) pedir(porK[p.f]); });
      arbitrar();
      var top = pila.length ? pila[pila.length - 1] : null;
      hist.push({ t: t, run: top ? { f: top.f, nivel: top.nivel } : null,
        susp: pila.slice(0, -1).map(function (x) { return { f: x.f, nivel: x.nivel }; }), ipl: iplActual() });
      if (top) {
        top.restante--;
        if (top.restante === 0) {
          pila.pop();
          var vuelta = pila.length ? 'a la ISR de ' + pila[pila.length - 1].f.k : 'al main';
          log(t + 1, '<code>RETFIE</code> de ' + top.f.k + ': desapila PC y SR, vuelve ' + vuelta + ', IPL = ' + iplActual() + '.');
        }
      }
      t++;
      var activo = pila.length || fuentes.some(function (f) { return f.flag && f.prio > 0; }) || programa.some(function (p) { return p.t >= t; });
      ocioso = activo ? 0 : ocioso + 1;
    }

    // ---------- dibujo ----------
    function X(tt, ini) { return ML + (tt - ini) * TW; }
    function Yfila(n) { return MT + (7 - n) * RH; }
    function rect(x, y, w, h, est, extra) {
      return '<rect x="' + x.toFixed(1) + '" y="' + y + '" width="' + Math.max(0, w).toFixed(1) + '" height="' + h + '" style="' + est + '"' + (extra || '') + '/>';
    }
    function dibujar() {
      var ini = t <= VEN - 4 ? 0 : t - (VEN - 4);
      var fin = ini + VEN;
      var s = '';
      for (var n = 7; n >= 0; n--) {
        var y = Yfila(n);
        s += '<rect x="' + ML + '" y="' + y + '" width="' + (VEN * TW) + '" height="' + RH + '" class="sint-g-fila' + (n % 2 ? '' : ' sint-g-fila2') + '"/>';
        s += '<text x="' + (ML - 6) + '" y="' + (y + RH / 2 + 4) + '" text-anchor="end" class="sint-g-txt">' + (n === 0 ? '0 main' : n) + '</text>';
      }
      for (var tt = ini; tt <= fin; tt++) {
        if (tt % 5 === 0) {
          s += '<line x1="' + X(tt, ini) + '" x2="' + X(tt, ini) + '" y1="' + MT + '" y2="' + (MT + 8 * RH) + '" class="sint-g-grid"/>';
          s += '<text x="' + X(tt, ini) + '" y="' + (MT + 8 * RH + 15) + '" text-anchor="middle" class="sint-g-txt">' + tt + '</text>';
        }
      }
      // Tramos (fusionando ciclos consecutivos iguales)
      var tramos = [];
      function tramo(clv, tt2, datos) {
        for (var i = tramos.length - 1; i >= 0; i--) {
          if (tramos[i].clv === clv && tramos[i].fin === tt2) { tramos[i].fin = tt2 + 1; return; }
        }
        tramos.push({ clv: clv, ini: tt2, fin: tt2 + 1, d: datos });
      }
      hist.forEach(function (h) {
        if (h.t + 1 < ini || h.t > fin) return;
        if (h.run) tramo('r' + h.run.f.k + h.run.nivel, h.t, { tipo: 'run', f: h.run.f, nivel: h.run.nivel });
        else tramo('main', h.t, { tipo: 'main', nivel: 0 });
        h.susp.forEach(function (x) { tramo('s' + x.f.k + x.nivel, h.t, { tipo: 'susp', f: x.f, nivel: x.nivel }); });
      });
      tramos.forEach(function (tr) {
        var a = Math.max(tr.ini, ini), b = Math.min(tr.fin, fin);
        if (b <= a) return;
        var y = Yfila(tr.d.nivel);
        if (tr.d.tipo === 'main') s += rect(X(a, ini), y + 6, (b - a) * TW, 12, 'fill:var(--txt-tenue);opacity:.55');
        else if (tr.d.tipo === 'run') s += rect(X(a, ini), y + 6, (b - a) * TW, 12, 'fill:' + tr.d.f.color);
        else s += rect(X(a, ini) + .75, y + 6.75, (b - a) * TW - 1.5, 10.5, 'fill:none;stroke:' + tr.d.f.color + ';stroke-width:1.5;stroke-dasharray:3 2');
      });
      // Etiquetas de ISR en tramos largos
      tramos.forEach(function (tr) {
        if (tr.d.tipo !== 'run') return;
        var a = Math.max(tr.ini, ini), b = Math.min(tr.fin, fin);
        if ((b - a) * TW < 30) return;
        s += '<text x="' + (X(a, ini) + 3) + '" y="' + (Yfila(tr.d.nivel) + 16) + '" class="sint-g-etq">' + tr.d.f.k + '</text>';
      });
      // Esperas
      esperas.forEach(function (e) {
        var hasta = e.hasta == null ? t : e.hasta;
        var a = Math.max(e.desde, ini), b = Math.min(hasta, fin);
        if (b <= a) return;
        var y = Yfila(e.nivel) + RH / 2;
        s += '<line x1="' + X(a, ini) + '" x2="' + X(b, ini) + '" y1="' + y + '" y2="' + y + '" style="stroke:' + e.f.color + ';stroke-width:2;stroke-dasharray:1.5 3"/>';
      });
      // Peticiones
      pets.forEach(function (p) {
        if (p.t < ini || p.t > fin) return;
        var x = X(p.t, ini), y = Yfila(p.nivel) + 1;
        s += '<path d="M' + (x - 4) + ' ' + y + 'h8l-4 5z" style="fill:' + p.f.color + '"/>';
      });
      // IPL
      var pts = [];
      hist.forEach(function (h) {
        if (h.t + 1 < ini || h.t > fin) return;
        var a = Math.max(h.t, ini), b = Math.min(h.t + 1, fin), y = Yfila(h.ipl) + 2.5;
        pts.push(X(a, ini) + ',' + y, X(b, ini) + ',' + y);
      });
      if (pts.length) s += '<polyline points="' + pts.join(' ') + '" class="sint-g-ipl"/>';
      // Cursor
      if (t >= ini && t <= fin) s += '<line x1="' + X(t, ini) + '" x2="' + X(t, ini) + '" y1="' + (MT - 4) + '" y2="' + (MT + 8 * RH) + '" class="sint-g-cursor"/>';
      gEl.innerHTML = s;

      // Estado textual
      var ipl = iplActual();
      var top = pila.length ? pila[pila.length - 1] : null;
      var cad = ['main'].concat(pila.map(function (x) { return 'ISR ' + x.f.k; })).join(' → ');
      var pend = fuentes.filter(function (f) { return f.flag; }).map(function (f) { return f.k; });
      estEl.innerHTML = '<span>t = <b>' + t + '</b></span>' +
        '<span>IPL (SR&lt;7:5&gt;) = <b>' + ipl + '</b></span>' +
        '<span>Ejecuta: <b>' + (top ? top.f.isr : 'main') + '</b></span>' +
        '<span>Contextos: <b>' + cad + '</b></span>' +
        '<span>Pendientes: <b>' + (pend.length ? pend.join(', ') : 'ninguna') + '</b></span>' +
        (!jugando && pend.length ? '<span class="sint-pista">En pausa: las peticiones esperan en t = ' + t + '. Pulsa «Reproducir» o «Avanzar 1 ciclo».</span>' : '');
      fuentes.forEach(function (f, j) {
        var e = el.querySelector('.sint-f-est[data-j="' + j + '"]');
        var txt = '—', cls = '';
        if (top && top.f === f) { txt = 'en ejecución'; cls = 'sint-e-run'; }
        else if (pila.some(function (x) { return x.f === f; })) { txt = 'interrumpida'; cls = 'sint-e-susp'; }
        if (f.flag) { txt = (txt === '—' ? '' : txt + ' · ') + (f.prio === 0 ? 'flag a 1, deshabilitada' : 'pendiente'); cls = cls || 'sint-e-pend'; }
        e.textContent = txt;
        e.className = 'sint-f-est ' + cls;
      });
    }

    // ---------- reloj ----------
    function parar() {
      jugando = false;
      if (temporizador) { clearTimeout(temporizador); temporizador = null; }
      bPlay.textContent = '▶ Reproducir';
      bPlay.setAttribute('aria-pressed', 'false');
    }
    function tic() {
      temporizador = null;
      if (!document.body.contains(el)) { parar(); return; }
      if (!jugando) return;
      avanzar();
      dibujar();
      if (ocioso >= 6) { parar(); return; }
      temporizador = setTimeout(tic, 450);
    }
    function reproducir() {
      if (jugando) return;
      jugando = true;
      bPlay.textContent = '⏸ Pausa';
      bPlay.setAttribute('aria-pressed', 'true');
      temporizador = setTimeout(tic, 250);
    }
    bPlay.addEventListener('click', function () {
      if (jugando) parar(); else { ocioso = 0; reproducir(); }
      dibujar();
    });
    q('.sint-avz').addEventListener('click', function () { parar(); avanzar(); dibujar(); });
    q('.sint-reini').addEventListener('click', function () {
      parar(); reiniciar(); escExp.hidden = true;
      var bs = el.querySelectorAll('.sint-esc');
      for (var i = 0; i < bs.length; i++) bs[i].removeAttribute('aria-current');
      dibujar();
    });
    el.addEventListener('click', function (ev) {
      var b = ev.target.closest ? ev.target.closest('button') : null;
      if (!b || !el.contains(b)) return;
      if (b.classList.contains('sint-pedir')) {
        var f = fuentes[+b.getAttribute('data-j')];
        pedir(f);
        dibujar();
      } else if (b.classList.contains('sint-esc')) {
        cargarEscenario(b.getAttribute('data-id'), b);
      }
    });
    el.addEventListener('change', function (ev) {
      var s = ev.target;
      if (s.matches && s.matches('.sint-f select')) {
        var f = fuentes[+s.getAttribute('data-j')];
        f.prio = +s.value;
        f.motivo = null;
        log(t, f.ip + ' = ' + f.prio + (f.prio === 0 ? ' (deshabilitada)' : '') + '.');
        dibujar();
      }
    });
    chkN.addEventListener('change', function () {
      nstdis = chkN.checked;
      log(t, 'NSTDIS = ' + (nstdis ? 1 : 0) + (nstdis ? ': ninguna ISR podrá ser interrumpida.' : ': anidamiento habilitado.'));
      dibujar();
    });
    selIM.addEventListener('change', function () {
      iplMain = +selIM.value;
      log(t, 'IPL del main = ' + iplMain + '.');
      dibujar();
    });

    function cargarEscenario(id, boton) {
      var e = ESCENARIOS.filter(function (x) { return x.id === id; })[0];
      if (!e) return;
      parar();
      reiniciar();
      fuentes.forEach(function (f) {
        if (e.prios[f.k] != null) f.prio = e.prios[f.k];
        var s = el.querySelector('.sint-f select[data-j="' + fuentes.indexOf(f) + '"]');
        if (s) s.value = String(f.prio);
      });
      programa = e.pet.slice();
      var bs = el.querySelectorAll('.sint-esc');
      for (var i = 0; i < bs.length; i++) {
        if (bs[i] === boton) bs[i].setAttribute('aria-current', 'true'); else bs[i].removeAttribute('aria-current');
      }
      escExp.hidden = false;
      escExp.innerHTML = '<b>' + esc(e.tit) + (nstdis ? ' · con NSTDIS = 1' : '') + '.</b> ' + e.exp;
      log(0, 'Escenario: ' + esc(e.tit) + '.');
      if (reducido()) {
        var tope = 0;
        while (ocioso < 3 && tope++ < 200) avanzar();
        dibujar();
      } else {
        dibujar();
        reproducir();
      }
    }

    reiniciar();
    dibujar();
  }

  MPI.componentes['sim-interrupcion'] = function (el, cfg) {
    cfg = cfg || {};
    if (cfg.modo === 'prioridades') modoPrioridades(el, cfg);
    else modoPasos(el, cfg);
  };
})();
