/*
 * Componente "pinout-dspic": encapsulado SPDIP de 28 pines del
 * dsPIC33FJ32MC202 con cada pin clicable. Al elegir un pin se muestra su
 * nombre completo (datasheet, Pin Diagrams y Tabla 1-1), qué significa cada
 * función, su tipo y para qué se usa en la tarjeta PicTrainer del laboratorio.
 * Los botones de filtro resaltan grupos de pines (puertos, analógicos,
 * remapeables, PWM, alimentación y pines usados en la PicTrainer).
 *
 * Uso en el contenido:
 *   <div class="mpi-mount" data-componente="pinout-dspic"
 *        data-config='{"resaltar":"pictrainer"}'></div>
 *
 * data-config (todas opcionales):
 *   resaltar: "pictrainer" | "porta" | "portb" | "analogicos" | "rp" | "pwm"
 *             | "alimentacion" | "ninguno"   (por defecto "ninguno")
 *   pin:      número de pin (1-28) seleccionado al cargar (por defecto ninguno)
 *
 * Teclado: Tab recorre los pines en orden 1→28; con un pin enfocado,
 * ↑/↓ se mueven por la columna física, ←/→ saltan al pin de enfrente,
 * Inicio/Fin van a los pines 1 y 28.
 */
window.MPI = window.MPI || {};
MPI.componentes = MPI.componentes || {};

(function () {

  // ---------------------------------------------------------------------
  // Datos de los 28 pines (nombres tal cual el diagrama de pines del
  // datasheet para 28-PIN SPDIP; coinciden con la tabla de 2.3.1 del spec).
  //   t5v:   pin tolerante a 5 V (sombreado en el diagrama del datasheet).
  //   placa: uso en la PicTrainer (ficha-asignatura.json, anexo C).
  //   pt:    etiqueta corta del periférico de la PicTrainer (si lo hay).
  //   nota:  aviso «a verificar» heredado del spec.
  // ---------------------------------------------------------------------
  var PINES = [
    { n: 1, nombre: 'MCLR', t5v: true, pt: 'SW1',
      placa: '<strong>Reset</strong>: pulsador SW1 (con R11 = 10 kΩ y C12, a través de R13 = 470 Ω) y conector de programación P4. Al pulsar SW1 el pin pasa a 0 y el micro se reinicia.' },
    { n: 2, nombre: 'AN0/VREF+/CN2/RA0', placa: 'Libre (accesible en el conector de expansión P5-P8).' },
    { n: 3, nombre: 'AN1/VREF-/CN3/RA1', placa: 'Libre (accesible en el conector de expansión P5-P8).' },
    { n: 4, nombre: 'PGED1/AN2/C2IN-/RP0/CN4/RB0', pt: 'PGD',
      placa: 'Línea <strong>PGD</strong> (datos) del conector de programación P4: la PicTrainer programa y depura por el canal 1. También llega al conector de expansión P6.' },
    { n: 5, nombre: 'PGEC1/AN3/C2IN+/RP1/CN5/RB1', pt: 'PGC',
      placa: 'Línea <strong>PGC</strong> (reloj) del conector de programación P4: la PicTrainer programa y depura por el canal 1. También llega al conector de expansión P6.' },
    { n: 6, nombre: 'AN4/RP2/CN6/RB2', pt: 'SW2',
      placa: '<strong>Pulsador SW2</strong>: pull-up de 10 kΩ a 3,3 V y a masa al pulsar (puente JP1) → en reposo se lee 1 y <strong>pulsado = 0</strong>.' },
    { n: 7, nombre: 'AN5/RP3/CN7/RB3', pt: 'RV1',
      placa: '<strong>Potenciómetro RV1</strong> (10 kΩ entre 3,3 V y masa): su cursor llega a AN5 a través del puente JP2.' },
    { n: 8, nombre: 'VSS', placa: 'Masa.' },
    { n: 9, nombre: 'OSC1/CLKI/CN30/RA2', placa: 'Libre (en el curso no se usa oscilador externo: se usa el FRC interno); accesible en el conector de expansión P5-P8.' },
    { n: 10, nombre: 'OSC2/CLKO/CN29/RA3', placa: 'Libre (en el curso no se usa oscilador externo: se usa el FRC interno); accesible en el conector de expansión P5-P8.' },
    { n: 11, nombre: 'SOSCI/RP4/CN1/RB4', pt: 'TX',
      placa: '<strong>U1TX</strong>: transmisión de la UART1, asignada por software a RP4. Va a la vez al USB (FT230XS) y al conector Arduino (P8-2): no pasa por el selector K2.' },
    { n: 12, nombre: 'SOSCO/T1CK/CN0/RA4', placa: 'Libre (accesible en el conector de expansión P5-P8).' },
    { n: 13, nombre: 'VDD', placa: '+3,3 V (regulador de la tarjeta; el LED D5 indica que hay 3,3 V).' },
    { n: 14, nombre: 'PGED3/ASDA1/RP5/CN27/RB5', t5v: true, pt: 'RX',
      placa: '<strong>U1RX</strong>: recepción de la UART1, asignada por software a RP5. Llega del USB (1-2) o del conector Arduino P8-1 (2-3) según el selector K2.' },
    { n: 15, nombre: 'PGEC3/ASCL1/RP6/CN24/RB6', t5v: true, placa: 'Libre (accesible en el conector de expansión P5-P8).' },
    { n: 16, nombre: 'INT0/RP7/CN23/RB7', t5v: true, placa: 'Libre (accesible en el conector de expansión P5-P8).',
      nota: 'En la lista de pines del libro este pin aparece como «RE7»; el datasheet lo nombra INT0/RP7/CN23/RB7 (el dsPIC33FJ32MC202 no tiene puerto E).' },
    { n: 17, nombre: 'TCK/PWM2H1/SCL1/RP8/CN22/RB8', t5v: true, placa: 'Libre (accesible en el conector de expansión P5-P8).' },
    { n: 18, nombre: 'TDO/PWM2L1/SDA1/RP9/CN21/RB9', t5v: true, placa: 'Libre (accesible en el conector de expansión P5-P8).' },
    { n: 19, nombre: 'VSS', placa: 'Masa.' },
    { n: 20, nombre: 'VCAP', placa: 'Condensador <strong>C16</strong> (10 µF, cerámico X7R) a masa, que permite funcionar al regulador interno que alimenta el núcleo.',
      nota: 'El libro describe el pin 20 como «alimentación del micro a 3,3 V»; el datasheet (Tabla 1-1) lo define como VCAP, la conexión del condensador de filtro de la lógica del núcleo (regulador interno), no como una entrada de alimentación. El anexo C del libro lo confirma (condensador C16).' },
    { n: 21, nombre: 'PGED2/TDI/PWM1H3/RP10/CN16/RB10', t5v: true, placa: 'Libre (accesible en el conector de expansión P5-P8).' },
    { n: 22, nombre: 'PGEC2/TMS/PWM1L3/RP11/CN15/RB11', t5v: true, placa: 'Libre (accesible en el conector de expansión P5-P8).' },
    { n: 23, nombre: 'PWM1H2/RP12/CN14/RB12', pt: 'D9', placa: '<strong>LED D9</strong>: en serie con 270 Ω hacia +3,3 V a través de JP3 → <strong>activo a nivel bajo</strong> (0 = encendido). Ojo: el orden es inverso, D9 = RB12 … D6 = RB15.' },
    { n: 24, nombre: 'PWM1L2/RP13/CN13/RB13', pt: 'D8', placa: '<strong>LED D8</strong>: en serie con 270 Ω hacia +3,3 V a través de JP3 → <strong>activo a nivel bajo</strong> (0 = encendido).' },
    { n: 25, nombre: 'PWM1H1/RP14/CN12/RB14', pt: 'D7', placa: '<strong>LED D7</strong>: en serie con 270 Ω hacia +3,3 V a través de JP3 → <strong>activo a nivel bajo</strong> (0 = encendido).' },
    { n: 26, nombre: 'PWM1L1/RP15/CN11/RB15', pt: 'D6', placa: '<strong>LED D6</strong>: en serie con 270 Ω hacia +3,3 V a través de JP3 → <strong>activo a nivel bajo</strong> (0 = encendido). Ojo: el orden es inverso, D6 = RB15 … D9 = RB12.' },
    { n: 27, nombre: 'AVSS', placa: 'Masa analógica.' },
    { n: 28, nombre: 'AVDD', placa: '+3,3 V.' }
  ];


  var NOTA_PWM = 'El libro llama «salida PWM invertida» a las PWMxH y «salida PWM» a las PWMxL; el datasheet las llama <em>High</em> y <em>Low output</em> de cada par complementario.';

  // Explicación de cada función que aparece en los nombres.
  function explicar(f) {
    var m;
    if (f === 'MCLR') return 'Master Clear: entrada de <strong>reset activa a nivel bajo</strong>. Con un 0 el micro se reinicia; también interviene al programarlo.';
    if (f === 'VDD') return 'Alimentación positiva (3,3 V) de la lógica de periféricos y de los pines de E/S.';
    if (f === 'VSS') return 'Masa (referencia) de la lógica y de los pines de E/S.';
    if (f === 'AVDD') return 'Alimentación positiva de los módulos analógicos (convertidor A/D). Debe estar siempre conectado.';
    if (f === 'AVSS') return 'Masa de referencia de los módulos analógicos.';
    if (f === 'VCAP') return 'Conexión del condensador de filtro de la lógica del núcleo (CPU), alimentada por un regulador interno.';
    if ((m = /^AN(\d+)$/.exec(f))) return 'Entrada analógica ' + m[1] + ' del convertidor A/D (de 0 a 3,3 V). Bit PCFG' + m[1] + ' de AD1PCFGL: 0 = analógica (valor tras reset), 1 = digital.';
    if (f === 'VREF+') return 'Referencia de tensión externa alta del convertidor A/D (opcional).';
    if (f === 'VREF-') return 'Referencia de tensión externa baja del convertidor A/D (opcional).';
    if ((m = /^CN(\d+)$/.exec(f))) return 'Change notification ' + m[1] + ': puede generar una interrupción cuando cambia el nivel del pin y activar una resistencia de pull-up débil interna.';
    if ((m = /^R([AB])(\d+)$/.exec(f))) return 'E/S digital: bit ' + m[2] + ' del puerto ' + m[1] + ' (se configura con TRIS' + m[1] + ' y se lee/escribe con PORT' + m[1] + ').';
    if ((m = /^RP(\d+)$/.exec(f))) return 'Pin remapeable ' + m[1] + ' (Peripheral Pin Select): por software se le asigna una función como la UART, el SPI, capturas o comparaciones.';
    if ((m = /^PGE([DC])(\d)$/.exec(f))) return (m[1] === 'D' ? 'Datos' : 'Reloj') + ' del canal ' + m[2] + ' de programación y depuración (ICSP).';
    if (f === 'C2IN-' || f === 'C2IN+') return 'Entrada ' + (f.slice(-1) === '-' ? 'inversora (−)' : 'no inversora (+)') + ' de comparador que figura en el diagrama de pines; el datasheet de este micro no describe el módulo y el curso no la usa.';
    if (f === 'OSC1') return 'Entrada del cristal o resonador del oscilador primario (externo).';
    if (f === 'CLKI') return 'Entrada de reloj externo (va siempre con OSC1).';
    if (f === 'OSC2') return 'Salida hacia el cristal o resonador del oscilador primario (externo).';
    if (f === 'CLKO') return 'Salida de reloj en los modos RC y EC (va siempre con OSC2).';
    if (f === 'SOSCI') return 'Entrada del cristal de 32,768 kHz del oscilador secundario de bajo consumo.';
    if (f === 'SOSCO') return 'Salida hacia el cristal de 32,768 kHz del oscilador secundario.';
    if (f === 'T1CK') return 'Entrada de reloj externo del Timer 1.';
    if ((m = /^INT(\d)$/.exec(f))) return 'Interrupción externa ' + m[1] + '.';
    if (f === 'SCL1') return 'Reloj del bus I2C (módulo I2C1).';
    if (f === 'SDA1') return 'Datos del bus I2C (módulo I2C1).';
    if (f === 'ASCL1') return 'Reloj alternativo del bus I2C1.';
    if (f === 'ASDA1') return 'Datos alternativos del bus I2C1.';
    if ((m = /^PWM(\d)([HL])(\d)$/.exec(f))) return 'Salida ' + (m[2] === 'H' ? '<em>High</em> («PWM invertida» en el libro)' : '<em>Low</em> («salida PWM» en el libro)') + ' del par ' + m[3] + ' del módulo PWM' + m[1] + ' de control de motores.';
    if (f === 'TCK') return 'JTAG: reloj de test (no se usa en el curso).';
    if (f === 'TDI') return 'JTAG: entrada de datos de test (no se usa en el curso).';
    if (f === 'TDO') return 'JTAG: salida de datos de test (no se usa en el curso).';
    if (f === 'TMS') return 'JTAG: selección de modo de test (no se usa en el curso).';
    return '';
  }

  var TIPOS = {
    digital: 'E/S digital', analogico: 'Analógico', alimentacion: 'Alimentación',
    oscilador: 'Oscilador', programacion: 'Programación', reset: 'Reset',
    pwm: 'PWM', comunicacion: 'Comunicación (I2C)', jtag: 'JTAG'
  };

  var FILTROS = [
    { id: 'porta', txt: 'Puerto A',
      desc: '<strong>Puerto A</strong>: 5 pines, RA0-RA4 (registros TRISA y PORTA).' },
    { id: 'portb', txt: 'Puerto B',
      desc: '<strong>Puerto B</strong>: 16 pines, RB0-RB15 (TRISB y PORTB). En este micro todos los RBx son además remapeables (RPx).' },
    { id: 'analogicos', txt: 'Analógicos (ANx)',
      desc: '<strong>Entradas analógicas AN0-AN5</strong> (6 canales del A/D, de 0 a 3,3 V): AN0-AN1 en RA0-RA1 y AN2-AN5 en RB0-RB3. Tras un reset son analógicas (AD1PCFGL = 0x0000).' },
    { id: 'rp', txt: 'Remapeables (RPx)',
      desc: '<strong>Pines remapeables RP0-RP15</strong> (Peripheral Pin Select): la UART, el SPI, las capturas… se asignan por software. La PicTrainer saca U1TX por RP4 y U1RX por RP5.' },
    { id: 'pwm', txt: 'PWM',
      desc: '<strong>Salidas PWM</strong> de control de motores: PWM1 tiene 3 pares H/L (RB10-RB15) y PWM2 un par (RB8-RB9). Ojo: los LEDs de la PicTrainer comparten pines con PWM1.' },
    { id: 'alimentacion', txt: 'Alimentación',
      desc: '<strong>Alimentación</strong>: VDD (13) y VSS (8 y 19) para la lógica y la E/S; AVDD (28) y AVSS (27) para el A/D; VCAP (20), condensador de filtro del núcleo.' },
    { id: 'pictrainer', txt: 'Usados en la PicTrainer',
      desc: '<strong>Pines con periférico en la PicTrainer</strong>: MCLR/SW1 (1), PGD/PGC del conector de programación P4 (4-5, RB0-RB1), pulsador SW2 (6, RB2), potenciómetro RV1 (7, AN5), U1TX (11, RB4/RP4), U1RX (14, RB5/RP5) y LEDs activos a nivel bajo en orden inverso: D9 = RB12 (23), D8 = RB13 (24), D7 = RB14 (25), D6 = RB15 (26).' }
  ];

  // Completa los datos derivados de cada pin a partir de su nombre.
  PINES.forEach(function (p) {
    var f = p.nombre.split('/');
    p.funcs = f;
    var tiene = function (re) { for (var i = 0; i < f.length; i++) if (re.test(f[i])) return f[i]; return null; };
    p.puerto = tiene(/^R[AB]\d+$/);
    p.an = tiene(/^AN\d+$/);
    p.rpx = tiene(/^RP\d+$/);
    p.pwmx = tiene(/^PWM\d[HL]\d$/);
    p.tipos = [];
    if (p.puerto) p.tipos.push('digital');
    if (p.an) p.tipos.push('analogico');
    if (/^(VDD|VSS|AVDD|AVSS|VCAP)$/.test(p.nombre)) p.tipos.push('alimentacion');
    if (tiene(/^(OSC1|OSC2|SOSCI|SOSCO)$/)) p.tipos.push('oscilador');
    if (p.nombre === 'MCLR') p.tipos.push('reset');
    if (tiene(/^PGE[DC]\d$/) || p.nombre === 'MCLR') p.tipos.push('programacion');
    if (p.pwmx) p.tipos.push('pwm');
    if (tiene(/^A?S(CL|DA)1$/)) p.tipos.push('comunicacion');
    if (tiene(/^(TCK|TDI|TDO|TMS)$/)) p.tipos.push('jtag');
    p.grupos = {
      porta: /^RA/.test(p.puerto || ''),
      portb: /^RB/.test(p.puerto || ''),
      analogicos: !!p.an,
      rp: !!p.rpx,
      pwm: !!p.pwmx,
      alimentacion: p.tipos.indexOf('alimentacion') !== -1,
      pictrainer: !!p.pt
    };
    if (p.pwmx && !p.nota) p.nota = NOTA_PWM;
    else if (p.pwmx) p.nota += ' ' + NOTA_PWM;
  });

  // Etiqueta corta que se ve en el chip (cambia con el filtro activo).
  function etiqueta(p, filtro) {
    if (filtro === 'analogicos' && p.an) return p.an;
    if (filtro === 'rp' && p.rpx) return p.rpx;
    if (filtro === 'pwm' && p.pwmx) return p.pwmx;
    return p.puerto || p.nombre;
  }

  MPI.componentes['pinout-dspic'] = function (el, cfg) {
    cfg = cfg || {};
    var filtro = cfg.resaltar || 'ninguno';
    var ids = FILTROS.map(function (f) { return f.id; });
    if (ids.indexOf(filtro) === -1) filtro = 'ninguno';
    var sel = parseInt(cfg.pin, 10);
    if (!(sel >= 1 && sel <= 28)) sel = 0;

    var uid = 'pd' + Math.random().toString(36).slice(2, 8);

    el.classList.add('mpi-pinout-dspic');
    var html =
      '<div class="mpi-sim-cab">Patillaje del dsPIC33FJ32MC202 (SPDIP de 28 pines)</div>' +
      '<p class="pd-ayuda">Pulsa un pin (o recórrelos con Tab y las flechas) para ver sus funciones. Los filtros resaltan grupos de pines.</p>' +
      '<div class="pd-filtros" role="group" aria-label="Resaltar un grupo de pines">';
    FILTROS.forEach(function (f) {
      html += '<button type="button" class="pd-filtro" data-filtro="' + f.id + '" aria-pressed="false">' + f.txt + '</button>';
    });
    html += '</div>' +
      '<p class="pd-filtro-desc" aria-live="polite"></p>' +
      '<div class="pd-cuerpo">' +
        '<div class="pd-chip" role="group" aria-label="Pines del encapsulado, del 1 al 28">' +
          '<div class="pd-encap" aria-hidden="true"><span class="pd-muesca"></span><span class="pd-punto"></span>' +
          '<span class="pd-rotulo">dsPIC33FJ32MC202</span></div>';
    PINES.forEach(function (p) {
      var izq = p.n <= 14;
      var fila = izq ? p.n : 29 - p.n;
      html += '<button type="button" class="pd-pin ' + (izq ? 'pd-izq' : 'pd-der') + '" data-pin="' + p.n + '"' +
        ' style="grid-row:' + fila + '" aria-pressed="false" aria-controls="' + uid + '-panel"' +
        ' aria-label="Pin ' + p.n + ': ' + p.nombre + '" title="' + p.n + ' · ' + p.nombre + '">' +
        '<span class="pd-num">' + p.n + '</span>' +
        '<span class="pd-lbl"></span>' +
        (p.pt ? '<span class="pd-pt">' + p.pt + '</span>' : '') +
        '</button>';
    });
    html += '</div>' +
        '<div class="pd-panel" id="' + uid + '-panel" aria-live="polite"></div>' +
      '</div>';
    el.innerHTML = html;

    var chip = el.querySelector('.pd-chip');
    var botones = {};
    Array.prototype.forEach.call(el.querySelectorAll('.pd-pin'), function (b) {
      botones[b.getAttribute('data-pin')] = b;
    });
    var panel = el.querySelector('.pd-panel');
    var descF = el.querySelector('.pd-filtro-desc');

    function pintarPanel() {
      if (!sel) {
        panel.innerHTML = '<p class="pd-vacio">Elige un pin del chip para ver aquí su nombre completo, qué hace cada una de sus funciones y para qué se usa en la PicTrainer.</p>';
        return;
      }
      var p = PINES[sel - 1];
      var h = '<div class="pd-p-cab"><span class="pd-p-num">Pin ' + p.n + '</span>' +
        '<code class="pd-p-nombre">' + p.nombre + '</code></div><div class="pd-tags">';
      p.tipos.forEach(function (t) { h += '<span class="pd-tag pd-tag-' + t + '">' + TIPOS[t] + '</span>'; });
      if (p.t5v) h += '<span class="pd-tag pd-tag-5v" title="Sombreado en el diagrama de pines del datasheet">Tolerante a 5 V</span>';
      h += '</div><dl class="pd-funcs">';
      p.funcs.forEach(function (f) {
        h += '<dt>' + f + '</dt><dd>' + explicar(f) + '</dd>';
      });
      h += '</dl>';
      if (p.an && p.puerto) {
        h += '<p class="pd-extra">Tras un reset este pin es <strong>analógico</strong> (AD1PCFGL = 0x0000): para usarlo como ' +
          p.puerto + ' digital hay que poner PCFG' + p.an.slice(2) + ' = 1; si no, al leerlo como digital siempre da 0.</p>';
      }
      h += '<div class="pd-placa"><span class="pd-placa-tit">En la PicTrainer</span>' + p.placa + '</div>';
      if (p.nota) h += '<p class="pd-nota"><strong>⚠ A verificar.</strong> ' + p.nota + '</p>';
      panel.innerHTML = h;
    }

    function pintar() {
      chip.classList.toggle('pd-filtrando', filtro !== 'ninguno');
      chip.classList.toggle('pd-modo-pt', filtro === 'pictrainer');
      PINES.forEach(function (p) {
        var b = botones[p.n];
        var on = filtro !== 'ninguno' && p.grupos[filtro];
        b.classList.toggle('pd-on', !!on);
        b.classList.toggle('pd-sel', p.n === sel);
        b.setAttribute('aria-pressed', p.n === sel ? 'true' : 'false');
        b.querySelector('.pd-lbl').textContent = etiqueta(p, filtro);
      });
      Array.prototype.forEach.call(el.querySelectorAll('.pd-filtro'), function (fb) {
        fb.setAttribute('aria-pressed', fb.getAttribute('data-filtro') === filtro ? 'true' : 'false');
      });
      var fd = null;
      FILTROS.forEach(function (f) { if (f.id === filtro) fd = f; });
      descF.innerHTML = fd ? fd.desc : 'Sin filtro: el chip muestra el bit de puerto (RAx/RBx) o la función de cada pin.';
      pintarPanel();
    }

    el.querySelector('.pd-filtros').addEventListener('click', function (e) {
      var fb = e.target.closest('.pd-filtro');
      if (!fb) return;
      var id = fb.getAttribute('data-filtro');
      filtro = (filtro === id) ? 'ninguno' : id;
      pintar();
    });

    chip.addEventListener('click', function (e) {
      var b = e.target.closest('.pd-pin');
      if (!b) return;
      sel = parseInt(b.getAttribute('data-pin'), 10);
      pintar();
    });

    // Navegación con flechas siguiendo la geometría del encapsulado.
    chip.addEventListener('keydown', function (e) {
      var b = e.target.closest('.pd-pin');
      if (!b) return;
      var n = parseInt(b.getAttribute('data-pin'), 10);
      var izq = n <= 14, dest = null;
      switch (e.key) {
        case 'ArrowDown': dest = izq ? n + 1 : n - 1; break;
        case 'ArrowUp': dest = izq ? n - 1 : n + 1; break;
        case 'ArrowLeft': case 'ArrowRight': dest = 29 - n; break;
        case 'Home': dest = 1; break;
        case 'End': dest = 28; break;
        default: return;
      }
      if (dest < 1 || dest > 28 || (izq && e.key === 'ArrowDown' && n === 14) ||
          (!izq && e.key === 'ArrowDown' && n === 15) || (izq && e.key === 'ArrowUp' && n === 1) ||
          (!izq && e.key === 'ArrowUp' && n === 28)) { e.preventDefault(); return; }
      e.preventDefault();
      sel = dest;
      pintar();
      botones[dest].focus();
    });

    pintar();
  };
})();
