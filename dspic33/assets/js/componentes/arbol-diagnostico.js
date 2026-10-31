/*
 * Componente "arbol-diagnostico": asistente de diagnóstico paso a paso de la
 * tarjeta (PicTrainer v3.0 o tarjeta del proyecto) siguiendo la depuración
 * hardware del libro (18.4.1 L293D, 18.4.2 tarjeta del proyecto, 18.4.3 sensor
 * de ultrasonidos, 18.5 depuración con hardware) y lo que se sabe del esquema de
 * la PicTrainer (anexo C).
 *
 * Uso:
 *   <div class="mpi-mount" data-componente="arbol-diagnostico"
 *        data-config='{"arbol":"tarjeta"}'></div>
 *
 * Claves de data-config:
 *   arbol   "tarjeta" (único árbol disponible; es el valor por defecto).
 *
 * Estructura de un árbol: nodos «pregunta» (q) con opciones que llevan a otro nodo
 * y nodos «diagnóstico» (d) con la causa, las comprobaciones concretas (qué medir y
 * dónde) y dónde se explica en la web; desde un diagnóstico se pasa a la siguiente
 * comprobación («Sigue sin funcionar») o se termina («Resuelto»).
 */
window.MPI = window.MPI || {};
MPI.componentes = MPI.componentes || {};

(function () {
  'use strict';

  var ID = 0;
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

  // Referencias a los temas de la web: [slug, apartado].
  var R = {
    intro: ['introduccion-dspic', '§2.3 Manejo (pines y tarjeta PicTrainer, config.h, InicializarReloj)'],
    puertos: ['puertos-paralelo', '§3.2 Puertos paralelo (TRIS, AD1PCFGL, lectura-modificación-escritura)'],
    timers: ['timers', '§5.3-5.8 (generar tiempos con el Timer 1)'],
    uartPines: ['uart', '§14.2 Puertos asociados (U1TX = RB4, U1RX = RB5, selector K2, remapeo)'],
    uartIni: ['uart', '§14.4.1 Inicialización (U1MODE, U1STA)'],
    uartBrg: ['uart', '§14.3.5 U1BRG (baudios)'],
    uartPc: ['uart', '§14.4.4 Transmisión de datos (el PC: puerto COM, drivers FTDI)'],
    adc: ['conversor-ad', '§16.3 Registros del módulo A/D (AD1PCFGL)'],
    energia: ['organizacion-sistema-digital', '§17.4 Gestión de energía (7805, K1, D4/D5)'],
    motor: ['organizacion-sistema-digital', '§17.5.2 Motor DC (puente en H y L293D)'],
    prog: ['organizacion-sistema-digital', '§17.6 Programación del micro (conector P4, MCLR, PGD/PGC)'],
    pulsoSw: ['sistemas-digitales-complejos', '§19.2 Sistemas muestreados (medir un ancho de pulso)'],
    pwm: ['pwm', 'Módulo PWM (señal PWM en los pines)'],
    dep183: ['depuracion-simulador', '§18.3 Depuración software (breakpoints, Watches, Step Into/Over)'],
    dep184: ['depuracion-simulador', '§18.4 Depuración hardware'],
    dep185: ['depuracion-simulador', '§18.5 Depuración software con hardware involucrado'],
    scl: ['depuracion-simulador', '§22.3 Lenguaje SCL (probar el código en el simulador)'],
    lab: ['laboratorio-pictrainer', 'Tarjeta PicTrainer v3.0 y entorno']
  };

  var ARBOLES = {
    tarjeta: {
      titulo: 'Diagnóstico de la tarjeta',
      sub: 'PicTrainer v3.0 o tarjeta del proyecto · libro 18.4',
      intro: 'Responde a lo que observas. El orden es el del libro: primero la alimentación, después la programación, luego el programa y por último cada periférico. Cada comprobación dice qué medir y dónde. Si el problema persiste, consulta al profesor (libro 18.1).',
      inicio: 'fuente',
      atajos: [['fuente', 'Alimentación'], ['prog', 'Programación'], ['release', 'Programa'], ['u_k2', 'UART'], ['m_en', 'L293D'], ['s_trig', 'SRF04']],
      nodos: {
        // ---------------------------------------------------------------- alimentación
        fuente: {
          tipo: 'q', corto: 'LEDs de la fuente',
          texto: '¿Lucen los LEDs de la fuente, D4 (5 V) y D5 (3,3 V)?',
          ayuda: 'Conecta la tarjeta (USB o jack J2) sin nada enchufado a los conectores de expansión. D4 indica que hay 5 V; D5, que hay 3,3 V, la tensión con la que funciona el micro.',
          opciones: [['Sí, los dos', 'prog', 'si'], ['Solo D4 (5 V)', 'd_33'], ['No, ninguno', 'f_origen', 'no']]
        },
        f_origen: {
          tipo: 'q', corto: 'Origen de la alimentación',
          texto: '¿De dónde toma la tarjeta la alimentación?',
          ayuda: 'La PicTrainer obtiene 5 V del USB o del jack J2 (a través del regulador MC7805). El puente K1 elige la fuente (2-3 USB, 1-2 fuente externa o baterías) o se deja la selección automática (Q1, U4, R7-R10).',
          opciones: [['Del USB', 'f_usb'], ['Del jack J2 (alimentador)', 'f_j2']]
        },
        f_usb: {
          tipo: 'd', corto: 'Alimentación por USB',
          titulo: 'No llegan los 5 V del USB',
          causa: 'Sin los 5 V del USB no se enciende nada: ni D4 ni D5.',
          pasos: [
            'Prueba otro cable USB y otro puerto del PC (mejor uno del propio ordenador que uno de un hub sin alimentación).',
            'Puente <b>K1</b> en la posición <b>2-3 (USB)</b>, o la selección automática si tu tarjeta la usa. Con K1 en 1-2 la tarjeta espera la fuente externa.',
            'Mide con el polímetro, en continua, entre los pines de 5 V y GND de los conectores de expansión (compatibles Arduino): deben verse unos 5 V.',
            'Si hay 5 V y D4 no luce, el fallo es del LED: sigue con la siguiente comprobación.'
          ],
          refs: ['energia', 'intro', 'lab'], libro: '18.4.2', siguiente: 'f_led'
        },
        f_j2: {
          tipo: 'd', corto: 'Jack J2 y MC7805',
          titulo: 'Fuente externa: jack J2 y regulador MC7805',
          causa: 'El jack J2 alimenta, a través del diodo D3, al regulador MC7805, que da los 5 V. El 7805 necesita <b>más de 7 V</b> a la entrada; el anexo C recomienda entre 7,5 V y 9 V (por encima de 9 V se calienta en exceso).',
          pasos: [
            'Puente <b>K1</b> en <b>1-2 (fuente externa o baterías)</b>, o la selección automática.',
            'Mide la tensión del alimentador y después la de la <b>entrada del 7805</b> respecto de GND: debe ser mayor de 7 V (libro 18.4.2).',
            'Si el alimentador da tensión pero no llega al 7805, revisa la polaridad del conector: con la polaridad invertida el diodo D3 no conduce.',
            'Mide la <b>salida del 7805</b>: 5 V. Si no los hay, desconecta cualquier carga de la salida y vuelve a medir (libro 18.4.2).',
            'Condensadores de entrada y salida del 7805: en la PicTrainer son cerámicos (0,33 µF y 100 nF, sin polaridad). En tu tarjeta, si son electrolíticos, comprueba su <b>polaridad</b> y que su tensión nominal corresponde a la de entrada y a la de salida respectivamente.',
            'Si todo lo anterior está bien y sin carga sigue sin haber 5 V, cambia el 7805 y prueba sin carga.'
          ],
          refs: ['energia', 'dep184'], libro: '18.4.2', siguiente: 'f_led'
        },
        f_led: {
          tipo: 'd', corto: 'LED de la fuente',
          titulo: 'LED de la fuente al revés o fundido',
          causa: 'Los LED tienen polaridad, como cualquier diodo. Si nunca ha lucido, puede estar montado al revés (libro 18.4.2).',
          pasos: [
            'Comprueba la orientación: el cátodo (la marca de la cápsula o la patilla corta) va hacia el lado de menor tensión.',
            'Mide con el osciloscopio o el polímetro que llega tensión al LED (respecto de GND).',
            'Si hay tensión y no luce, cambia el LED, pero pruébalo antes de soldarlo en la tarjeta (con una fuente y una resistencia en serie).'
          ],
          refs: ['dep184', 'energia'], libro: '18.4.2', siguiente: 'f_corto'
        },
        f_corto: {
          tipo: 'd', corto: 'Cortocircuito o fusible',
          titulo: 'Cortocircuito en la alimentación o fusible abierto',
          causa: 'En las fuentes se suele poner un LED a la salida y un fusible a la entrada (libro 17.4.1). Un cortocircuito entre la alimentación y masa hace saltar la protección y no llega tensión.',
          pasos: [
            'Desconecta de la tarjeta todo lo que cuelgue de la fuente (cables de los conectores de expansión, motor, sensores) y vuelve a probar (libro 18.4.2).',
            'Con la tarjeta <b>sin alimentar</b>, mide continuidad entre 5 V y GND y entre 3,3 V y GND: no debe haber continuidad (un valor de casi 0 Ω es un cortocircuito: busca estaño entre pistas o un componente al revés).',
            'Si tu fuente lleva fusible, comprueba con el polímetro que tiene continuidad; si está abierto, busca primero el cortocircuito y después cámbialo.',
            'Por USB, el propio puerto del PC limita la corriente y puede desconectarse si hay un cortocircuito.'
          ],
          refs: ['energia', 'dep184'], libro: '17.4.1 y 18.4.2', siguiente: 'profesor'
        },
        d_33: {
          tipo: 'd', corto: '5 V sí, 3,3 V no',
          titulo: 'Hay 5 V pero no 3,3 V',
          causa: 'El dsPIC33FJ32MC202 funciona entre 3,0 V y 3,6 V. La PicTrainer obtiene los 3,3 V a partir de los 5 V con un segundo regulador, y D5 indica que esa tensión está presente.',
          pasos: [
            'Mide la tensión entre el pin 13 (VDD) y el pin 8 (VSS) del micro, y entre los pines 2 (+3,3 V) y 3 (GND) del conector P4: deben verse unos 3,3 V.',
            'Si no hay 3,3 V, desconecta todo lo que cuelgue de los 3,3 V y busca un cortocircuito con la tarjeta sin alimentar (continuidad entre 3,3 V y GND).',
            'Comprueba que el micro está bien orientado en el zócalo (muesca del pin 1): al revés puede cortocircuitar la alimentación y calentarse.',
            'El pin 20 (VCAP) lleva su condensador de 10 µF a masa y no debe conectarse a VDD.',
            'Si hay 3,3 V y D5 no luce, el fallo es del LED D5 (al revés o fundido).'
          ],
          refs: ['energia', 'intro', 'prog'], libro: '18.4.2', siguiente: 'profesor'
        },
        // ---------------------------------------------------------------- programación
        prog: {
          tipo: 'q', corto: '¿Se programa?',
          texto: '¿Se programa el micro? (MPLAB X lo graba y lo verifica sin errores)',
          ayuda: 'Programa el proyecto y mira la ventana Output de MPLAB X: debe terminar sin errores de conexión ni de verificación.',
          opciones: [['Sí', 'release', 'si'], ['No', 'p_p4', 'no']]
        },
        p_p4: {
          tipo: 'd', corto: 'Conector P4',
          titulo: 'Conector de programación P4',
          causa: 'P4 es una tira de 6 pines: 1 = MCLR (reset), 2 = +3,3 V, 3 = GND, 4 = PGD, 5 = PGC, 6 = sin conectar. Con el programador conectado al revés o desplazado un pin no hay comunicación.',
          pasos: [
            'Comprueba que la marca de pin 1 del programador (la flecha o el triángulo) coincide con el pin 1 (MCLR) de P4.',
            'Con la tarjeta sin alimentar, mide continuidad: pin 1 de P4 → pin 1 del micro (MCLR); pin 4 → pin 4 del micro (RB0 = PGED1); pin 5 → pin 5 del micro (RB1 = PGEC1); pin 3 → GND.',
            'En tu tarjeta, asegúrate de que hay continuidad perfecta (0 Ω) en las pistas: una conexión mal hecha puede provocar una caída de tensión (libro 18.4.2).'
          ],
          refs: ['prog', 'intro'], libro: '18.4.2', siguiente: 'p_alim'
        },
        p_alim: {
          tipo: 'd', corto: 'Alimentación al programar',
          titulo: 'Alimentación durante la programación',
          causa: 'El micro tiene que estar alimentado mientras se programa.',
          pasos: [
            'Programa con la tarjeta alimentada: D4 y D5 encendidos durante toda la programación.',
            'Mide 3,3 V entre los pines 2 (+3,3 V) y 3 (GND) de P4 mientras MPLAB X programa.',
            'Si MPLAB X indica que no detecta la tensión de la tarjeta (target), vuelve primero a las comprobaciones de alimentación.'
          ],
          refs: ['prog', 'energia'], libro: '18.4.2', siguiente: 'p_mclr'
        },
        p_mclr: {
          tipo: 'd', corto: 'Reset (MCLR)',
          titulo: 'Reset (MCLR) y su resistencia de pull-up',
          causa: 'MCLR es activo a nivel bajo: necesita una resistencia de pull-up a VDD para estar a 1 salvo cuando el programador reinicia el micro. La PicTrainer usa R11 = 10 kΩ, R13 = 470 Ω en serie, C12 = 100 nF y el pulsador SW1.',
          pasos: [
            'Con la tarjeta alimentada y sin pulsar SW1, mide la tensión del pin 1 (MCLR) respecto de GND: debe estar a unos 3,3 V.',
            'Si está a 0 V: SW1 pulsado o en cortocircuito, falta la pull-up o C12 está en cortocircuito.',
            'Valor de la pull-up: entre 4,7 kΩ y 10 kΩ (libro 18.4.2; el datasheet recomienda como mucho 10 kΩ y una resistencia serie de como mucho 470 Ω).'
          ],
          refs: ['prog', 'intro'], libro: '18.4.2', siguiente: 'p_pgd'
        },
        p_pgd: {
          tipo: 'd', corto: 'PGD/PGC libres',
          titulo: 'Nada conectado a PGD/PGC (RB0 y RB1)',
          causa: 'La PicTrainer programa por el canal 1: PGED1 = RB0 (pin 4) y PGEC1 = RB1 (pin 5). Cualquier cosa conectada a esos pines puede impedir la programación (libro 18.4.2: «nada conectado a los pines de programación»).',
          pasos: [
            'Desconecta lo que tengas en RB0 y RB1 (conectores de expansión, sensores, LEDs) y vuelve a programar.',
            'No pongas resistencias de pull-up ni condensadores en PGC/PGD (lo desaconseja el datasheet).',
            'En tu tarjeta: el canal elegido en los bits de configuración (ICS, registro FICD) debe ser aquel al que van PGD y PGC.'
          ],
          refs: ['prog'], libro: '18.4.2', siguiente: 'p_zocalo'
        },
        p_zocalo: {
          tipo: 'd', corto: 'Micro en el zócalo',
          titulo: 'Micro bien colocado en el zócalo y prueba cruzada',
          causa: 'Un micro girado, sin asentar o con una patilla doblada no se programa ni funciona.',
          pasos: [
            'La muesca del micro (marca del pin 1) debe coincidir con la del zócalo y con la serigrafía de la tarjeta.',
            'Comprueba que ninguna patilla queda doblada por debajo o fuera del zócalo y que el micro entra hasta el fondo.',
            'Prueba cruzada del libro: programa el micro en la tarjeta del laboratorio, en modo <b>Release</b>, con un programa que solo encienda un LED, y ponlo en tu tarjeta. Si funciona, el micro está bien y el problema está en el circuito de programación de tu tarjeta.'
          ],
          refs: ['prog', 'dep184'], libro: '18.4.2', siguiente: 'profesor'
        },
        // ---------------------------------------------------------------- programa
        release: {
          tipo: 'q', corto: '¿Funciona en Release?',
          texto: '¿Funciona el programa grabado en modo Release?',
          ayuda: 'Grabado sin depurador (Make and Program Device) y tras pulsar el reset SW1, ¿hace lo que debe?',
          opciones: [['Sí', 'perif', 'si'], ['No', 'r_min', 'no']]
        },
        r_min: {
          tipo: 'q', corto: 'Programa mínimo',
          texto: '¿Enciende un LED un programa mínimo que solo hace eso?',
          ayuda: 'Libro 18.4.2 («El micro no funciona»): haz un programa muy simple que solo encienda un LED (en la PicTrainer, D6-D9 en RB15-RB12) y grábalo en Release.',
          opciones: [['Sí, el LED se enciende', 'r_analog', 'si'], ['No', 'r_reloj', 'no']]
        },
        r_reloj: {
          tipo: 'd', corto: 'Reloj y config.h',
          titulo: 'Arranque: InicializarReloj() y config.h',
          causa: 'Los programas del laboratorio empiezan configurando el reloj (FRC de 7,37 MHz con PLL → FCY = 39 613 750 Hz, unos 40 MHz) y usan los bits de configuración del config.h del laboratorio.',
          pasos: [
            'Comprueba que el proyecto incluye el config.h del laboratorio y que main llama a <code>InicializarReloj()</code> antes que a nada.',
            'Sin el PLL el micro funciona, pero unas 10 veces más lento (FRC sin PLL: FCY = 7,37 MHz / 2 ≈ 3,7 MHz): los retardos y los baudios salen mal.',
            'Haz que el programa conmute un LED con un retardo conocido y mide el periodo con el osciloscopio en el pin: si sale unas 10 veces más largo, el reloj no está bien configurado.'
          ],
          refs: ['intro', 'timers'], siguiente: 'r_leds'
        },
        r_leds: {
          tipo: 'd', corto: 'LEDs, TRIS y JP3',
          titulo: 'LEDs activos a nivel bajo, TRIS y puente JP3',
          causa: 'D6-D9 están en RB15-RB12 (D6 = RB15 … D9 = RB12), cada uno con 270 Ω hacia +3,3 V a través de JP3: se encienden con un <b>0</b> en el pin.',
          pasos: [
            'Puente <b>JP3</b> puesto: sin él los LEDs no reciben alimentación.',
            'TRISB con los bits 12-15 a 0 (salidas); por ejemplo <code>TRISB = 0x0FFF;</code>.',
            'Para encender D6 se escribe un 0: <code>PORTBbits.RB15 = 0;</code>.',
            'Mide en el pin del LED (D6 = pin 26): con un 0 lógico, unos 0 V y el LED encendido; con un 1, unos 3,3 V y el LED apagado.'
          ],
          refs: ['intro', 'puertos'], siguiente: 'p_zocalo'
        },
        r_analog: {
          tipo: 'd', corto: 'AD1PCFGL',
          titulo: 'Pines analógicos: AD1PCFGL',
          causa: 'Tras el reset, los pines con función ANx (RA0, RA1 y RB0-RB3) son analógicos (AD1PCFGL = 0x0000) y, mientras lo sean, se leen siempre como 0 en PORTx.',
          pasos: [
            'La plantilla de main del laboratorio empieza con <code>AD1PCFGL = 0xFFFF;</code> (todos digitales). Si usas el conversor A/D, deja como analógica solo la entrada que necesites (por ejemplo AN5 = RB3, el potenciómetro RV1).',
            'Síntoma típico: el pulsador SW2 (RB2 = AN4) parece pulsado siempre, porque se lee 0.',
            'Comprueba en el depurador (Watches) el valor de AD1PCFGL y de PORTB.'
          ],
          refs: ['puertos', 'adc'], siguiente: 'r_tris'
        },
        r_tris: {
          tipo: 'd', corto: 'TRIS',
          titulo: 'Dirección de los pines: TRIS',
          causa: 'Un bit de TRISx a 1 hace el pin entrada y a 0, salida. Un pin de salida configurado como entrada no saca nada; uno de entrada configurado como salida no lee.',
          pasos: [
            'Salidas a 0 (LEDs RB12-RB15); entradas a 1 (pulsador RB2, U1RX en RB5).',
            'Comprueba TRISA y TRISB en Watches después de la inicialización: una asignación posterior de todo el registro puede deshacer otra anterior.'
          ],
          refs: ['puertos'], siguiente: 'r_puls'
        },
        r_puls: {
          tipo: 'd', corto: 'Pulsador SW2',
          titulo: 'Pulsador SW2: pulsado = 0 y puente JP1',
          causa: 'SW2 está en RB2 con una pull-up de 10 kΩ y va a masa al pulsar a través de JP1: sin pulsar se lee 1 y pulsado se lee <b>0</b>.',
          pasos: [
            'Puente <b>JP1</b> puesto.',
            'Mide en el pin 6 (RB2): unos 3,3 V sin pulsar y 0 V pulsado.',
            'En el código, «pulsado» es <code>PORTBbits.RB2 == 0</code>.',
            'Recuerda AD1PCFGL: RB2 es también AN4.'
          ],
          refs: ['intro', 'puertos'], siguiente: 'r_rmw'
        },
        r_rmw: {
          tipo: 'd', corto: 'Regla RMW',
          titulo: 'Lectura-modificación-escritura (RMW)',
          causa: '<code>PORTB |= …</code>, <code>&amp;= …</code> o <code>^= …</code> leen el nivel de los pines, no lo último que se escribió. Dos modificaciones seguidas del mismo puerto pueden perder la primera.',
          pasos: [
            'Busca dos operaciones RMW seguidas sobre el mismo PORTx (por ejemplo <code>PORTB |= 0x1000; PORTB |= 0x2000;</code>).',
            'Solución preferida: lee el puerto una vez en una variable, haz los cambios en ella y escribe el puerto una sola vez. También vale dejar pasar un ciclo entre las dos (<code>asm("nop");</code>).',
            'Síntoma: un LED que debería cambiar justo después de otro se queda como estaba.'
          ],
          refs: ['puertos'], siguiente: 'r_depurar'
        },
        r_depurar: {
          tipo: 'd', corto: 'Depurar el programa',
          titulo: 'Depura el programa: breakpoints, Watches y paso a paso',
          causa: 'Si el hardware responde al programa mínimo, el fallo está en el programa.',
          pasos: [
            'Pon un breakpoint dentro del bucle while y ejecuta con Debug Project; mira las variables y los registros en Watches y Variables.',
            'Avanza con Step Into (F7, entra en las funciones) o Step Over (F8, sin entrar).',
            'El micro tiene muy pocos breakpoints hardware (el libro dice dos y, más adelante, uno: ⚠ a verificar): quita uno antes de poner otro.',
            'Si hay hardware en tiempo real (sensores, motor, servo, A/D), pon el breakpoint después de la medida, no durante ella (libro 18.5).',
            'Sin la tarjeta, puedes probar el código en el simulador con un fichero SCL.'
          ],
          refs: ['dep183', 'dep185', 'scl'], libro: '18.3 y 18.5', siguiente: 'profesor'
        },
        // ---------------------------------------------------------------- periféricos
        perif: {
          tipo: 'q', corto: 'Periférico',
          texto: '¿Qué parte falla ahora?',
          ayuda: 'El micro se programa y el programa básico funciona. Elige el periférico que da problemas.',
          opciones: [['La UART (comunicación con el PC)', 'u_k2'], ['El motor (L293D)', 'm_en'], ['El sensor de ultrasonidos (SRF04)', 's_trig'], ['Nada: todo funciona', 'ok', 'si']]
        },
        u_k2: {
          tipo: 'd', corto: 'Selector K2',
          titulo: 'UART: selector K2 y señal en los pines',
          causa: 'U1TX = RB4 (pin 11) y U1RX = RB5 (pin 14) van al selector K2: en 1-2, al chip FT230XS (USB del PC); en 2-3, al conector Arduino.',
          pasos: [
            'Para hablar con el PC por el USB, <b>K2 en 1-2</b>.',
            'Mide con el osciloscopio en RB4 (pin 11) mientras el micro transmite: en reposo la línea está a 1 y cada carácter empieza con un bit de start a 0.',
            'Si no se ve nada en RB4, el problema está en el micro (remapeo o inicialización): sigue con la siguiente comprobación.'
          ],
          refs: ['uartPines', 'intro'], siguiente: 'u_remap'
        },
        u_remap: {
          tipo: 'd', corto: 'Remapeo',
          titulo: 'UART: remapeo de pines e inicialización',
          causa: 'Los pines RPn son remapeables: hay que llevar U1RX a RP5 y U1TX a RP4 antes de usar la UART.',
          pasos: [
            '<code>RPINR18bits.U1RXR = 5;</code> (U1RX lee de RP5 = RB5) y <code>RPOR2bits.RP4R = 3;</code> (U1TX sale por RP4 = RB4), entre el desbloqueo <code>__builtin_write_OSCCONL(OSCCON &amp; ~0x40)</code> y el bloqueo <code>__builtin_write_OSCCONL(OSCCON | 0x40)</code>.',
            'Después, U1MODE con UARTEN = 1 y U1STA con UTXEN = 1 (UTXEN solo tiene efecto con UARTEN = 1).',
            'Comprueba en Watches U1MODE, U1STA y los registros de remapeo tras la inicialización.'
          ],
          refs: ['uartPines', 'uartIni'], siguiente: 'u_baud'
        },
        u_baud: {
          tipo: 'd', corto: 'Baudios',
          titulo: 'UART: velocidad (baudios) y formato',
          causa: 'Los dos extremos tienen que usar la misma configuración: 38 400 baudios, 8 bits, sin paridad y 1 bit de stop (8N1).',
          pasos: [
            '<code>U1BRG = (FCY/BAUDRATE)/16 − 1</code> con BRGH = 0: con FCY = 39 613 750 Hz y 38 400 baudios sale U1BRG = 63.',
            'Si FCY no es la que crees (por ejemplo, falta <code>InicializarReloj()</code>), los baudios salen mal y se reciben caracteres extraños.',
            'Mide en el osciloscopio la duración de un bit en RB4: 1/38 400 ≈ 26 µs.'
          ],
          refs: ['uartBrg', 'intro'], siguiente: 'u_com'
        },
        u_com: {
          tipo: 'd', corto: 'Puerto COM',
          titulo: 'UART: puerto COM y drivers FTDI',
          causa: 'En el PC, el driver VCP de FTDI hace que la tarjeta aparezca como un puerto serie más (COMx).',
          pasos: [
            'Administrador de dispositivos (<code>devmgmt.msc</code>) → «Puertos (COM y LPT)»: debe aparecer «USB Serial Port (COMx)». Si no aparece, instala los drivers VCP de FTDI.',
            'Abre ese COMx en el terminal (CoolTerm o comDebug) o en tu programa C++ (CSerial) con la misma configuración que el micro. Solo un programa puede tener abierto el puerto a la vez.',
            'El cable USB debe ir a la tarjeta con K2 en 1-2.'
          ],
          refs: ['uartPc'], siguiente: 'profesor'
        },
        m_en: {
          tipo: 'd', corto: 'Enable del L293D',
          titulo: 'L293D: señal de enable',
          causa: 'Antes de cambiar el chip hay que descartar un fallo software (libro 18.4.1).',
          pasos: [
            'Mide en los pines de enable del L293D (pin 1 para el puente de las salidas 1-2, pin 9 para el de las salidas 3-4): deben estar a nivel alto cuando el motor tiene que moverse.',
            'Si el enable lo da el micro, comprueba que ese pin es salida (TRIS) y digital (AD1PCFGL).'
          ],
          refs: ['motor', 'dep184'], libro: '18.4.1', siguiente: 'm_pwm'
        },
        m_pwm: {
          tipo: 'd', corto: 'PWM en los pines',
          titulo: 'L293D: señal PWM en los pines del chip',
          causa: 'Si la señal que llega al chip no es la esperada, el problema es de software (libro 18.4.1 y 18.5.2).',
          pasos: [
            'Desconecta el puente en H del micro y mira la señal en el osciloscopio hasta que tenga la forma del PWM deseado (frecuencia y factor de servicio).',
            'Mídela también en las entradas del L293D (pines 2 y 7 para el motor de las salidas 1-2).',
            'Si la señal es perfecta y el motor no se mueve, el problema es de hardware: no hay que tocar el software.'
          ],
          refs: ['pwm', 'motor', 'dep185'], libro: '18.4.1 y 18.5.2', siguiente: 'm_alim'
        },
        m_alim: {
          tipo: 'd', corto: 'Alimentación del motor',
          titulo: 'L293D: alimentación del chip y del motor',
          causa: 'El L293D tiene dos alimentaciones: la de la lógica y la del motor.',
          pasos: [
            'Mide la de la lógica en el pin 16 (VCC1, 5 V) y la del motor en el pin 8 (VCC2), respecto de GND (pines 4, 5, 12 y 13).',
            'Masa común entre la fuente del motor, el L293D y el micro.',
            'Corriente máxima: 1 A con un motor y 0,5 A por motor con dos.',
            'Con el motor conectado, mide la tensión en las salidas (pines 3 y 6).'
          ],
          refs: ['motor'], siguiente: 'm_chip'
        },
        m_chip: {
          tipo: 'd', corto: 'Cambiar el L293D',
          titulo: 'Cambiar el L293D',
          causa: 'Si el enable, el PWM y las alimentaciones son correctos, el chip puede estar dañado.',
          pasos: ['Cambia el chip por uno nuevo y comprueba si el motor empieza a funcionar (libro 18.4.1).'],
          refs: ['dep184'], libro: '18.4.1', siguiente: 'profesor'
        },
        s_trig: {
          tipo: 'd', corto: 'Trigger',
          titulo: 'Sensor de ultrasonidos: pulso de trigger de 100 µs cada 30 ms',
          causa: 'Primero hay que comprobar que el micro genera bien el disparo del sensor (libro 18.4.3).',
          pasos: [
            'Haz un programa que genere por un pin del micro un pulso de <b>100 µs cada 30 ms</b> (con un timer).',
            'Ejecútalo y comprueba con el osciloscopio que la señal es correcta.',
            'Conecta esa señal al TRIGGER del sensor.'
          ],
          refs: ['timers', 'dep184'], libro: '18.4.3', siguiente: 's_alim'
        },
        s_alim: {
          tipo: 'd', corto: 'Alimentación del sensor',
          titulo: 'Sensor de ultrasonidos: alimentación y masa común',
          causa: 'El sensor necesita su alimentación y la misma referencia (GND) que el micro.',
          pasos: [
            'Alimenta el sensor y mide la tensión entre su VCC y su GND.',
            'Asegúrate de que la masa del sensor y la del micro son la misma (libro 18.4.3).'
          ],
          refs: ['dep184'], libro: '18.4.3', siguiente: 's_eco'
        },
        s_eco: {
          tipo: 'd', corto: 'Eco',
          titulo: 'Sensor de ultrasonidos: señal de eco',
          causa: 'Con el trigger y la alimentación bien, el sensor responde con un pulso en ECHO cuyo ancho depende de la distancia.',
          pasos: [
            'Con el programa en marcha, mira en el osciloscopio la señal ECHO: debe ser un pulso de ancho variable según la distancia medida.',
            'Acerca y aleja la mano: el ancho del pulso debe cambiar.',
            'Antes de conectar ECHO al micro, ten en cuenta que el micro funciona a 3,3 V: comprueba en el datasheet si el pin que vas a usar tolera 5 V o adapta el nivel (⚠ a verificar con el sensor y el pin que uses).'
          ],
          refs: ['dep184'], libro: '18.4.3', siguiente: 's_soft'
        },
        s_soft: {
          tipo: 'd', corto: 'Medida en el programa',
          titulo: 'Sensor de ultrasonidos: medir el eco en el programa',
          causa: 'Si el eco se ve en el osciloscopio, el sensor funciona y falta procesar el ancho del pulso en el micro.',
          pasos: [
            'Conecta ECHO a una entrada del micro (TRIS a 1 y pin digital en AD1PCFGL).',
            'Pon un breakpoint justo después de detectar el flanco de subida: si no se para, el fallo está en la condición (libro 18.5.1).',
            'Después, un breakpoint justo tras el flanco de bajada: la medida ya está hecha y se puede seguir línea a línea con Watches.',
            'Para probar sin el sensor, simula el eco con un fichero SCL en el simulador.'
          ],
          refs: ['dep185', 'pulsoSw', 'scl'], libro: '18.5.1', siguiente: 'profesor'
        },
        // ---------------------------------------------------------------- finales
        ok: {
          tipo: 'f', corto: 'Todo funciona', exito: true,
          titulo: 'Todo funciona',
          texto: 'La alimentación, la programación, el programa y los periféricos responden. Si aparece un fallo nuevo, vuelve a empezar desde el principio: la mayoría de los problemas se encuentran siguiendo este orden.'
        },
        resuelto: {
          tipo: 'f', corto: 'Resuelto', exito: true,
          titulo: 'Problema resuelto',
          texto: 'Apunta qué era: es muy probable que vuelva a pasar (a ti o a un compañero). Si quieres seguir comprobando el resto de la tarjeta, empieza de nuevo.'
        },
        profesor: {
          tipo: 'f', corto: 'Consultar al profesor',
          titulo: 'Consulta al profesor',
          texto: 'Has hecho las comprobaciones del libro y el problema persiste. Llévale al profesor la lista de lo que ya has comprobado (abajo) y las medidas que has tomado (libro 18.1).'
        }
      }
    }
  };

  MPI.componentes['arbol-diagnostico'] = function (el, cfg) {
    cfg = cfg || {};
    var uid = 'adg' + (++ID);
    var arbol = ARBOLES[cfg.arbol] || ARBOLES.tarjeta;
    var aviso = cfg.arbol && !ARBOLES[cfg.arbol] ? '<p class="adg-aviso">No existe el árbol «' + esc(cfg.arbol) + '»: se muestra el de la tarjeta.</p>' : '';
    el.classList.add('mpi-arbol-diagnostico');

    el.innerHTML =
      '<div class="mpi-sim-cab"><span>' + esc(arbol.titulo) + '</span><span class="adg-cab-sub">' + esc(arbol.sub) + '</span></div>' + aviso +
      '<p class="adg-intro">' + arbol.intro + '</p>' +
      '<nav class="adg-atajos" aria-label="Ir directamente a un bloque"><span class="adg-atajos-tit">Ir a:</span></nav>' +
      '<nav class="adg-migas" aria-label="Respuestas dadas"></nav>' +
      '<section class="adg-tarjeta" aria-live="polite" aria-atomic="true"></section>' +
      '<div class="adg-nav">' +
        '<button type="button" class="adg-b-volver">← Volver</button>' +
        '<button type="button" class="adg-b-inicio">Empezar de nuevo</button>' +
      '</div>';

    var atajos = el.querySelector('.adg-atajos'), migas = el.querySelector('.adg-migas'), tarjeta = el.querySelector('.adg-tarjeta');
    var bVolver = el.querySelector('.adg-b-volver'), bInicio = el.querySelector('.adg-b-inicio');
    arbol.atajos.forEach(function (a) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'adg-atajo'; b.textContent = a[1]; b.setAttribute('data-ir', a[0]);
      atajos.appendChild(b);
    });

    // historial: [{id, resp}] con los nodos ya respondidos; actual: id del nodo que se ve
    var historial = [], actual = arbol.inicio;

    function tema(slug) {
      var t = (MPI.temas || []).filter(function (x) { return x.slug === slug; })[0];
      return t || null;
    }
    function refsHTML(lista) {
      if (!lista || !lista.length) return '';
      return '<div class="adg-refs"><span class="adg-refs-tit">Dónde se explica:</span><ul>' + lista.map(function (k) {
        var r = R[k], t = tema(r[0]);
        var nombre = t ? 'Tema ' + t.num + ' · ' + t.titulo : r[0];
        return '<li><a href="#/tema/' + r[0] + '">' + esc(nombre) + '</a>' + (t && !t.disponible ? ' <span class="adg-pronto">(pronto)</span>' : '') +
          ' <span class="adg-ref-ap">' + esc(r[1]) + '</span></li>';
      }).join('') + '</ul></div>';
    }

    function pintar(foco) {
      var n = arbol.nodos[actual];
      // Migas de pan
      if (!historial.length) migas.innerHTML = '';
      else {
        migas.innerHTML = '<ol>' + historial.map(function (h, i) {
          var nn = arbol.nodos[h.id];
          return '<li><button type="button" class="adg-miga" data-i="' + i + '" title="Volver a esta pregunta">' + esc(nn.corto) +
            (h.resp ? ': <b>' + esc(h.resp) + '</b>' : '') + '</button></li>';
        }).join('') + '<li aria-current="step"><span class="adg-miga-act">' + esc(n.corto) + '</span></li></ol>';
      }
      var h = '';
      var paso = historial.length + 1;
      if (n.tipo === 'q') {
        h += '<p class="adg-num">Paso ' + paso + ' · pregunta</p>' +
          '<h4 class="adg-tit" tabindex="-1">' + esc(n.texto) + '</h4>' +
          (n.ayuda ? '<p class="adg-ayuda">' + n.ayuda + '</p>' : '') +
          '<div class="adg-ops" role="group" aria-label="Respuestas">' + n.opciones.map(function (o, i) {
            return '<button type="button" class="adg-op' + (o[2] ? ' adg-op-' + o[2] : '') + '" data-op="' + i + '">' + esc(o[0]) + '</button>';
          }).join('') + '</div>';
      } else if (n.tipo === 'd') {
        h += '<p class="adg-num">Paso ' + paso + ' · comprobación' + (n.libro ? ' <span class="adg-libro">libro ' + esc(n.libro) + '</span>' : '') + '</p>' +
          '<h4 class="adg-tit" tabindex="-1">' + esc(n.titulo) + '</h4>' +
          '<p class="adg-causa">' + n.causa + '</p>' +
          '<p class="adg-sub">Qué comprobar y dónde</p>' +
          '<ol class="adg-pasos">' + n.pasos.map(function (p) { return '<li>' + p + '</li>'; }).join('') + '</ol>' +
          refsHTML(n.refs) +
          '<p class="adg-preg">¿Se ha resuelto?</p>' +
          '<div class="adg-ops" role="group" aria-label="Resultado de la comprobación">' +
            '<button type="button" class="adg-op adg-op-si" data-res="1">Sí, resuelto</button>' +
            '<button type="button" class="adg-op adg-op-no" data-res="0">' + (n.siguiente === 'profesor' ? 'No, sigue igual' : 'No, sigue igual → siguiente comprobación') + '</button>' +
          '</div>';
      } else {
        h += '<p class="adg-num">' + (n.exito ? 'Fin' : 'Fin del recorrido') + '</p>' +
          '<h4 class="adg-tit adg-fin-' + (n.exito ? 'ok' : 'prof') + '" tabindex="-1">' + (n.exito ? '✔ ' : '') + esc(n.titulo) + '</h4>' +
          '<p class="adg-causa">' + n.texto + '</p>';
        var hechas = historial.filter(function (x) { return arbol.nodos[x.id].tipo === 'd'; });
        if (hechas.length) {
          h += '<p class="adg-sub">Comprobaciones hechas</p><ul class="adg-hechas">' + hechas.map(function (x) {
            var nn = arbol.nodos[x.id];
            return '<li>' + esc(nn.titulo) + (nn.libro ? ' <span class="adg-libro">libro ' + esc(nn.libro) + '</span>' : '') + '</li>';
          }).join('') + '</ul>';
        }
      }
      tarjeta.innerHTML = h;
      tarjeta.className = 'adg-tarjeta adg-t-' + n.tipo;
      bVolver.disabled = !historial.length;
      bInicio.disabled = !historial.length && actual === arbol.inicio;
      if (foco) { var t = tarjeta.querySelector('.adg-tit'); if (t) t.focus(); }
    }

    function ir(id, resp) {
      if (!arbol.nodos[id]) return;
      historial.push({ id: actual, resp: resp });
      actual = id;
      pintar(true);
    }

    tarjeta.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      var n = arbol.nodos[actual];
      if (b.hasAttribute('data-op')) {
        var o = n.opciones[Number(b.getAttribute('data-op'))];
        ir(o[1], o[0]);
      } else if (b.hasAttribute('data-res')) {
        if (b.getAttribute('data-res') === '1') ir('resuelto', 'resuelto');
        else ir(n.siguiente || 'profesor', 'sigue igual');
      }
    });
    migas.addEventListener('click', function (e) {
      var b = e.target.closest('.adg-miga');
      if (!b) return;
      var i = Number(b.getAttribute('data-i'));
      actual = historial[i].id;
      historial = historial.slice(0, i);
      pintar(true);
    });
    atajos.addEventListener('click', function (e) {
      var b = e.target.closest('.adg-atajo');
      if (!b) return;
      historial = []; actual = b.getAttribute('data-ir');
      pintar(true);
    });
    bVolver.addEventListener('click', function () {
      if (!historial.length) return;
      actual = historial.pop().id;
      pintar(true);
    });
    bInicio.addEventListener('click', function () {
      historial = []; actual = arbol.inicio;
      pintar(true);
    });

    pintar(false);
  };

  MPI.componentes['arbol-diagnostico'].arboles = ARBOLES;
})();
