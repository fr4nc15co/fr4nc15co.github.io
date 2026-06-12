/*
 * Contenido del tema "Temporizadores" (cap. 4 del libro + transparencias).
 * Reconstruido desde la referencia técnica verificada del PIC32MX230F064D
 * (NO transcrito del Markdown de Docling). Código C reensamblado a multilínea
 * y verificado; fórmulas en MathML nativo.
 */
window.MPI = window.MPI || {};
MPI.contenidoTemas = MPI.contenidoTemas || {};
MPI.ejercicios = MPI.ejercicios || {};

MPI.ejercicios['timers-driver'] = {
  titulo: 'LED de estado + sensor de ultrasonidos',
  enunciado: 'Diseña los temporizadores de un sistema que debe hacer dos cosas a la vez: ' +
    '(a) <strong>parpadear un LED de estado cada 500 ms</strong> y ' +
    '(b) <strong>medir la duración del pulso ECHO</strong> de un sensor de ultrasonidos HC-SR04, ' +
    'que mantiene su salida a 1 durante un tiempo proporcional a la distancia. PBCLK = 5 MHz.',
  contexto: '<ul><li>Actuador: LED de estado en <code class="reg">RA0</code> (salida).</li>' +
    '<li>Sensor: señal <code class="reg">ECHO</code> del HC-SR04 conectada a un pin de entrada de reloj <code class="reg">TxCK</code>.</li></ul>',
  preguntas: [
    {
      texto: '1) ¿Qué modo de temporizador usarías para el parpadeo periódico de 500 ms?',
      opciones: ['Temporizador normal, reloj interno (TCS=0, TGATE=0)', 'Contador de eventos (TCS=1)', 'Gated (TGATE=1)'],
      correcta: 0,
      explicacion: 'Un parpadeo es una base de tiempos periódica con el reloj interno. En 16 bits, 500 ms necesita prescaler: con 1:64, PR ≈ 39062; con 1:256, PR ≈ 9765.'
    },
    {
      texto: '2) ¿Y para medir cuánto tiempo está a 1 la señal ECHO?',
      opciones: ['Temporizador normal interno', 'Contador de eventos (TCS=1)', 'Gated (TCS=0, TGATE=1)'],
      correcta: 2,
      explicacion: 'Medir el ancho de un pulso de un pin es justo el modo gated: TCS=0 (reloj interno), TGATE=1; el pin ECHO en TxCK actúa de enable y el timer cuenta mientras ECHO=1. Al flanco de bajada se activa TxIF y se lee TMRx.'
    },
    {
      texto: '3) ¿Por qué NO sirve el contador de eventos (TCS=1) para medir el ancho del eco?',
      opciones: ['Porque contaría flancos del pin, no el tiempo; el ancho se mide contando el reloj interno mientras el pin está a 1', 'Porque TxCK no se puede remapear', 'Porque eso solo lo puede hacer el ADC'],
      correcta: 0,
      explicacion: 'Con TCS=1 el pin ES el reloj: contarías pulsos, no duración. La duración se obtiene contando el reloj interno mientras el pin está a 1, que es exactamente el modo gated.'
    },
    {
      texto: '4) ¿Puede un único temporizador encargarse de las dos tareas a la vez?',
      opciones: ['No: hacen falta dos timers (uno normal para el LED y otro en gated para el eco)', 'Sí, alternando TCS por software en cada vuelta', 'Sí, activando el modo 32 bits'],
      correcta: 0,
      explicacion: 'Son dos funciones concurrentes con configuraciones incompatibles (distinto TGATE/TCS). Se usan dos temporizadores: p.ej. Timer2 normal para el LED y Timer3 en gated para el eco.'
    }
  ]
};

MPI.contenidoTemas['temporizadores'] = {
  titulo: 'Temporizadores',
  html: `
<header class="tema-cab">
  <span class="tema-num">Tema 4</span>
  <h1>Temporizadores</h1>
  <p class="tema-lead">Los temporizadores son, tras los puertos de E/S, el periférico más usado: sirven para generar retardos, ondas periódicas o medir tiempos. El PIC32MX230F064D tiene <strong>cinco temporizadores de 16 bits</strong>.</p>
</header>

<section>
  <h2>4.1 El hardware de los temporizadores</h2>
  <p class="nota"><strong>Antes de nada, Pic32Ini.h:</strong> en el laboratorio todos los programas incluyen <code>"Pic32Ini.h"</code> (disponible en Moodle), que configura los relojes de la placa a <strong>SYSCLK = 40&nbsp;MHz</strong> y <strong>PBCLK = 5&nbsp;MHz</strong>. Todos los ejemplos del tema asumen esos relojes.</p>
  <p>De los cinco temporizadores, el <strong>Timer&nbsp;1 es de tipo A</strong> y los <strong>Timers 2 a 5 son de tipo B</strong>. Las diferencias clave:</p>
  <ul>
    <li><strong>Tipo A (Timer 1):</strong> puede conectarse a un oscilador externo de cuarzo (típicamente 32.768&nbsp;kHz). Su prescaler divide por <strong>1, 8, 64 o 256</strong>.</li>
    <li><strong>Tipo B (Timers 2–5):</strong> pueden <em>encadenarse</em> de dos en dos para formar un temporizador de <strong>32 bits</strong>. Su prescaler divide por <strong>1, 2, 4, 8, 16, 32, 64 o 256</strong>.</li>
  </ul>

  <h3>El temporizador 1 (tipo A)</h3>
  <p>Se controla con tres registros: <code class="reg">TMR1</code> (cuenta actual), <code class="reg">PR1</code> (periodo deseado) y <code class="reg">T1CON</code> (configuración). El reloj que incrementa <code class="reg">TMR1</code> proviene de <strong>PBCLK</strong> (5&nbsp;MHz, con <code class="reg">TCS</code>=0) o del pin externo <strong>T1CK</strong> (<code class="reg">TCS</code>=1). El bit <code class="reg">ON</code> deja pasar el reloj; el prescaler lo divide; cuando <code class="reg">TMR1</code> alcanza <code class="reg">PR1</code> se reinicia a 0 y se activa el flag <code class="reg">T1IF</code>.</p>
  <p class="nota">Con prescaler 1:1 el periodo de cuenta es 200&nbsp;ns, así que el tiempo máximo medible es 65536·200&nbsp;ns ≈ <strong>13,11&nbsp;ms</strong>. Con prescaler 1:256 sube a ≈ <strong>3,355&nbsp;s</strong>. <em>Regla:</em> usa el prescaler más pequeño que permita medir el tiempo necesario (mayor resolución).</p>
  <table class="tabla-datos">
    <thead><tr><th>TCKPS (tipo A)</th><th>Divisor</th><th>Tiempo por cuenta</th><th>Tiempo máximo</th></tr></thead>
    <tbody>
      <tr><td>0</td><td>1:1</td><td>200 ns</td><td>13,107 ms</td></tr>
      <tr><td>1</td><td>1:8</td><td>1,6 µs</td><td>104,9 ms</td></tr>
      <tr><td>2</td><td>1:64</td><td>12,8 µs</td><td>838,8 ms</td></tr>
      <tr><td>3</td><td>1:256</td><td>51,2 µs</td><td>3,355 s</td></tr>
    </tbody>
  </table>

  <p>Explora los campos de <code class="reg">T1CON</code> (haz clic en los bits o escribe un valor hex):</p>
  <div class="mpi-mount" data-componente="visor-bits" data-config='{"registro":"T1CON","valor":"0x8010"}'></div>

  <h3>Modos de funcionamiento</h3>
  <p>El mismo temporizador hace tres cosas distintas según los bits <code class="reg">TCS</code> y <code class="reg">TGATE</code>. Conviene no confundirlos:</p>
  <table class="tabla-datos tabla-modos">
    <thead><tr><th>Modo</th><th>TCS</th><th>TGATE</th><th>¿Qué cuenta?</th><th>¿Para qué sirve?</th></tr></thead>
    <tbody>
      <tr><td><strong>Normal con reloj interno</strong><br><small>(temporizador)</small></td><td>0</td><td>0</td><td>Reloj interno PBCLK</td><td>Generar retardos y señales/interrupciones periódicas contando hasta <code class="reg">PRx</code>. <em>Es el uso habitual.</em></td></tr>
      <tr><td><strong>Normal con reloj externo</strong><br><small>(contador de eventos)</small></td><td>1</td><td>0</td><td>Flancos del pin <code class="reg">TxCK</code></td><td>Contar pulsos externos (el pin <strong>es</strong> el reloj). Ej.: contar 7 pulsaciones.</td></tr>
      <tr><td><strong>Gated (medir ancho)</strong></td><td>0</td><td>1</td><td>Reloj interno, <em>solo mientras</em> <code class="reg">TxCK</code> = 1</td><td>Medir cuánto tiempo está a 1 una señal del pin <code class="reg">TxCK</code>.</td></tr>
    </tbody>
  </table>
  <p class="nota"><strong>Cuidado con el modo gated:</strong> el reloj sigue siendo el <em>interno</em>, por eso <code class="reg">TCS</code> debe ser <strong>0</strong>. El pin <code class="reg">TxCK</code> no aporta reloj — actúa como <em>enable</em> que deja contar mientras está a 1. Al llegar el flanco de bajada en <code class="reg">TxCK</code> se activa <code class="reg">TxIF</code>; el programa lee entonces <code class="reg">TMRx</code> (el ancho del pulso) y lo pone a 0 para la siguiente medida. No lo confundas con el <em>contador de eventos</em>, donde <code class="reg">TCS</code> = 1 y el pin sí es el reloj.</p>

  <h3>Configurar el modo gated: el prescaler manda</h3>
  <p>En gated <strong>no se configura <code class="reg">PRx</code></strong>: no se espera ningún «fin de cuenta», sino que se lee <code class="reg">TMRx</code> al acabar el pulso (tras el Reset, <code class="reg">PRx</code> ya vale 0xFFFF, el máximo). Lo que sí se elige con cuidado es el prescaler <code class="reg">TCKPS</code>, porque <strong>fija cuánto tiempo vale cada cuenta de <code class="reg">TMRx</code></strong>: t<sub>cuenta</sub> = divisor / f<sub>PBCLK</sub>. La medida final es <em>tiempo&nbsp;=&nbsp;TMRx&nbsp;·&nbsp;t<sub>cuenta</sub></em>.</p>
  <p>Y una comprobación obligatoria: el pulso más largo que se quiera medir debe caber en el contador, es decir, debe implicar <strong>TMRx &lt; 65535</strong> con el TCKPS elegido. Con PBCLK = 5&nbsp;MHz:</p>
  <table class="tabla-datos">
    <thead><tr><th>TCKPS (tipo B)</th><th>Divisor</th><th>Tiempo por cuenta</th><th>Tiempo máximo medible</th></tr></thead>
    <tbody>
      <tr><td>0</td><td>1:1</td><td>0,2 µs</td><td>13,1 ms</td></tr>
      <tr><td>1</td><td>1:2</td><td>0,4 µs</td><td>26,2 ms</td></tr>
      <tr><td>2</td><td>1:4</td><td>0,8 µs</td><td>52,4 ms</td></tr>
      <tr><td>3</td><td>1:8</td><td>1,6 µs</td><td>104,9 ms</td></tr>
      <tr><td>4</td><td>1:16</td><td>3,2 µs</td><td>209,7 ms</td></tr>
      <tr><td>5</td><td>1:32</td><td>6,4 µs</td><td>419,4 ms</td></tr>
      <tr><td>6</td><td>1:64</td><td>12,8 µs</td><td>838,9 ms</td></tr>
      <tr><td>7</td><td>1:256</td><td>51,2 µs</td><td>3,36 s</td></tr>
    </tbody>
  </table>
  <p class="nota"><strong>Regla:</strong> elige el TCKPS más pequeño cuyo tiempo máximo supere el pulso más largo esperado: garantizas TMRx &lt; 65535 con la máxima resolución. Ejemplo (el resuelto en las transparencias): el eco del HC-SR04 a 4&nbsp;m dura <strong>23,53&nbsp;ms</strong>; con 1:1 la cuenta sería 117&nbsp;647 &gt; 65535 (no cabe) y con <strong>1:2</strong> salen 58&nbsp;823 cuentas ✓ (resolución 0,4&nbsp;µs). En el Timer&nbsp;1 (tipo A) las opciones son solo 1, 8, 64 y 256.</p>
  <p>La solución de las transparencias, completa (ECHO del HC-SR04 en RB1, Timer&nbsp;3):</p>
  <pre><code class="lang-c">#include &lt;xc.h&gt;
#include "Pic32Ini.h"

void inicializaT3Gated(void) {
    SYSKEY = 0xAA996655;        // Desbloquear el remapeo (PPS, ver 4.3)
    SYSKEY = 0x556699AA;
    T3CKR  = 2;                 // T3CK &lt;- RB1 (el pin del ECHO)
    SYSKEY = 0x1CA11CA1;

    T3CON = 0;                  // Apagar
    TMR3  = 0;                  // Cuenta a 0
    IFS0CLR = 1 &lt;&lt; 14;          // Borrar T3IF (version atomica)
    // Sin PR3: en gated no hay "fin de cuenta" que configurar
    T3CON = 0x8090;             // ON | TGATE=1 | TCKPS=1 (1:2) | TCS=0
}

// En el bucle, tras disparar el ultrasonido:
while ((IFS0 &amp; (1 &lt;&lt; 14)) == 0);   // Espera al flanco de bajada del ECHO
distancia_cm = TMR3 * 0.0068;      // 0,4 us/cuenta -&gt; 0,0068 cm/cuenta
TMR3 = 0;                          // Lista para la siguiente medida
IFS0CLR = 1 &lt;&lt; 14;</code></pre>
  <p class="nota">Dos detalles de la solución: <code class="reg">IFS0CLR = 1 &lt;&lt; 14;</code> es la versión <em>atómica</em> de borrar el flag (los registros CLR/SET/INV del tema&nbsp;3), y el remapeo del pin del ECHO se explica en la sección 4.3.</p>

  <h3>Los temporizadores 2 a 5 (tipo B)</h3>
  <p>Funcionan igual que el Timer&nbsp;1, con dos diferencias: la entrada externa es un único pin <code class="reg">TxCK</code> (sin circuitería de cuarzo) y el prescaler tiene 8 opciones (campo <code class="reg">TCKPS</code> de 3 bits: divisor = 2<sup>TCKPS</sup>, salvo 7 → 256). Solo el <strong>Timer&nbsp;3</strong> puede además disparar una conversión del ADC (lo usaremos en el Tema&nbsp;9). Los flags de fin de cuenta están en <code class="reg">IFS0</code>: T2IF (bit 9), T3IF (bit 14), T4IF (bit 19), T5IF (bit 24).</p>
  <div class="mpi-mount" data-componente="visor-bits" data-config='{"registro":"T2CON","valor":"0x8030"}'></div>

  <h3>Los temporizadores de 32 bits</h3>
  <p>Se forman uniendo un timer de tipo B <strong>par</strong> (maestro) con el <strong>impar</strong> siguiente (esclavo): el 2 con el 3, o el 4 con el 5. Para activarlo se pone a 1 el bit <code class="reg">T32</code> (bit 3) del <em>maestro</em>. Puntos a recordar:</p>
  <ul>
    <li>El modo lo fijan los bits del timer <strong>par</strong>; los del impar se ignoran.</li>
    <li>El <strong>flag de fin de cuenta lo genera el timer impar</strong> (p.ej. T3IF para el par 2+3).</li>
    <li>Se accede a la cuenta y al periodo de 32 bits a través de <code class="reg">TMR2</code> y <code class="reg">PR2</code> (una vez activado T32).</li>
    <li>Para hacerse una idea: con divisor 1:256, el máximo de 16 bits son 3,355&nbsp;s… y el de <strong>32 bits, ≈&nbsp;6,97&nbsp;años</strong>. Cualquier tiempo razonable cabe.</li>
  </ul>
</section>

<section>
  <h2>4.2 Uso: cálculo del periodo</h2>
  <p>Antes de programar nada, se calcula el divisor (prescaler) y el valor del registro de periodo. La fórmula general es:</p>
  <math xmlns="http://www.w3.org/1998/Math/MathML" display="block" class="formula">
    <mrow>
      <msub><mi>PR</mi><mi>x</mi></msub><mo>=</mo>
      <mfrac>
        <mrow><mi>T</mi><mo>·</mo><msub><mi>f</mi><mtext>PBCLK</mtext></msub></mrow>
        <mtext>divisor</mtext>
      </mfrac>
      <mo>−</mo><mn>1</mn>
    </mrow>
  </math>
  <p class="nota">El −1 es porque la cuenta empieza en 0. Y <code class="reg">PR</code> debe caber en 16 bits (≤ 65535) o en 32 bits (≤ 4&nbsp;294&nbsp;967&nbsp;295) si el timer está encadenado. En las transparencias la misma fórmula aparece como <strong>PR = Tiempo · F<sub>CY</sub> · Preescalado − 1</strong>, con el preescalado escrito como fracción (1/8, 1/256…): es la misma cuenta.</p>

  <h3>La receta, paso a paso</h3>
  <p><strong>Antes de programar</strong> (en papel): elegir el divisor mínimo que haga PR ≤ 65535 y calcular PR. <strong>En el código</strong>, siempre en este orden:</p>
  <ol>
    <li>Apagar el timer: <code>TxCON = 0;</code></li>
    <li>Borrar la cuenta: <code>TMRx = 0;</code></li>
    <li>Borrar el flag de fin de cuenta: <code>IFS0bits.TxIF = 0;</code></li>
    <li>Cargar el periodo: <code>PRx = valor;</code></li>
    <li>Configurar y encender en un único write: <code>TxCON = 0x8000 | (TCKPS &lt;&lt; 4);</code></li>
  </ol>
  <p>Esperar después el fin de cuenta leyendo el flag en un bucle (<code>while (IFS0bits.TxIF == 0);</code>) es trabajar por <strong>polling</strong>: simple, pero <strong>bloquea</strong> el resto del programa mientras espera. En el Tema&nbsp;6 veremos la alternativa, las interrupciones.</p>

  <h3>Calculadora / simulador</h3>
  <p>Introduce un tiempo (o frecuencia) y obtén el prescaler, <code class="reg">PRx</code>, el valor de <code class="reg">TxCON</code> y el código C:</p>
  <div class="mpi-mount" data-componente="sim-timer"></div>

  <h3>Ejemplo 1 — retardo de 15&nbsp;ms (Timer 1)</h3>
  <p>Con divisor 1:1 saldría PR = 0,015·5·10⁶ − 1 = 74999, <strong>fuera de rango</strong>. Con divisor 1:8: PR1 = 0,015·5·10⁶/8 − 1 = <strong>9374</strong>, que ya cabe.</p>
  <pre><code class="lang-c">#include &lt;xc.h&gt;
#include "Pic32Ini.h"     // Relojes de la placa: SYSCLK 40 MHz, PBCLK 5 MHz

int main(void) {
    // ... configuración previa ...
    T1CON = 0;            // Parar el Timer 1
    TMR1  = 0;            // Cuenta a 0
    IFS0bits.T1IF = 0;    // Borrar el flag de fin de cuenta
    PR1   = 9374;         // Periodo de 15 ms con prescaler 1:8
    T1CON = 0x8010;       // ON, prescaler 1:8 (TCKPS=1), reloj interno
    while (IFS0bits.T1IF == 0) ;   // Esperar el fin de cuenta (polling)
    T1CON = 0;            // Si no se usa mas, se apaga: buena practica
    // ...
}</code></pre>

  <h3>Ejemplo 2 — retardo largo de 5&nbsp;s (Timer 2+3 a 32 bits)</h3>
  <p>Con un solo timer de 16 bits el máximo es 3,355&nbsp;s. Encadenando 2+3 a 32 bits y divisor 1:1: PR2 = 5·5·10⁶ − 1 = <strong>24&nbsp;999&nbsp;999</strong>.</p>
  <pre><code class="lang-c">int main(void) {
    T2CON = 0;            // Parar Timer 2
    T3CON = 0;            // y Timer 3
    T2CON = 0x0008;       // Modo 32 bits (T32=1) ANTES de escribir TMR/PR
    TMR2  = 0;            // Cuenta a 0 (32 bits vía TMR2)
    IFS0bits.T3IF = 0;    // El flag de fin lo genera el timer impar (Timer 3)
    PR2   = 24999999;     // Periodo de 5 s con prescaler 1:1
    T2CON = 0x8008;       // ON, 1:1, 32 bits, reloj interno
    while (IFS0bits.T3IF == 0) ;   // Esperar el fin de cuenta
}</code></pre>

  <h3>Ejemplo 3 — retardo largo con un solo timer de 16 bits (ampliación)</h3>
  <p>Si no hay dos timers libres, se genera un retardo más corto que divida al deseado y se repite. Para 10&nbsp;s: 4 cuentas de 2,5&nbsp;s. A 2,5&nbsp;s con divisor 1:256, PR = 2,5·5·10⁶/256 − 1 ≈ <strong>48827</strong>.</p>
  <pre><code class="lang-c">int main(void) {
    int n;
    T3CON = 0;            // Parar Timer 3
    TMR3  = 0;            // Cuenta a 0
    IFS0bits.T3IF = 0;    // Borrar flag
    PR3   = 48827;        // 2,5 s con prescaler 1:256
    T3CON = 0x8070;       // ON, prescaler 1:256, reloj interno
    for (n = 0; n &lt; 4; n++) {       // 4 × 2,5 s = 10 s
        while (IFS0bits.T3IF == 0) ;
        IFS0bits.T3IF = 0;           // ¡imprescindible borrar el flag cada vuelta!
    }
}</code></pre>
</section>

<section>
  <h2>4.3 Mapeo de pines: reloj externo y SYSKEY</h2>
  <p>Salvo <strong>T1CK</strong> (fijo al pin 34 por la circuitería del cuarzo), las entradas de reloj externo <code class="reg">TxCK</code> son <em>remapeables</em>: un multiplexor las conecta a uno de varios pines reconfigurables. El registro de control se llama como la señal más una <strong>R</strong> (p.ej. <code class="reg">T3CKR</code>). Escribir en estos registros está protegido y exige la <strong>secuencia SYSKEY</strong>:</p>
  <ol class="pasos">
    <li><code class="reg">SYSKEY = 0xAA996655;</code></li>
    <li><code class="reg">SYSKEY = 0x556699AA;</code> &nbsp;→ desbloqueado</li>
    <li>Escribir el/los registros <code class="reg">RPxR</code> / <code class="reg">xxxR</code></li>
    <li><code class="reg">SYSKEY = 0x1CA11CA1;</code> &nbsp;→ bloqueado de nuevo</li>
  </ol>
  <p>El remapeo funciona en los dos sentidos. Para las <strong>entradas</strong> (como TxCK) se escribe el registro de la <em>señal</em>: <code class="reg">T3CKR = 1;</code> hace que T3CK escuche en RB5. Para las <strong>salidas</strong> se escribe el registro del <em>pin</em>, llamado <code class="reg">RPnR</code>: por ejemplo, <code class="reg">RPB7R = 1;</code> saca U1TX (la transmisión de la UART) por RB7. Las salidas las usaremos en los temas de la UART y del PWM.</p>

  <h3>Explorador de remapeo (PPS)</h3>
  <p>Elige la entrada de reloj de un timer y el pin al que conectarla, y observa el valor de <code class="reg">TxCKR</code> y la secuencia SYSKEY paso a paso:</p>
  <div class="mpi-mount" data-componente="pps-remap" data-config='{"señal":"T3CK"}'></div>

  <h3>Ejemplo — contar pulsaciones con T3CK en RB5</h3>
  <p>Este es el <strong>modo contador de eventos</strong> (<code class="reg">TCS</code>=1): el pin es el reloj. Conmutar un LED (RC0, activo a nivel bajo) cada 7 pulsaciones de un botón en RB5, usándolo como reloj externo del Timer&nbsp;3 — así nos ahorramos antirrebotes y conteo por software. (No es el modo <em>gated</em>, que mantendría <code class="reg">TCS</code>=0.)</p>
  <pre><code class="lang-c">#include &lt;xc.h&gt;
#include "Pic32Ini.h"
#define PIN_PULSADOR 5     // RB5
#define PIN_LED      0     // RC0, activo a nivel bajo

int main(void) {
    ANSELB &amp;= ~(1 &lt;&lt; PIN_PULSADOR);
    ANSELC &amp;= ~(1 &lt;&lt; PIN_LED);
    LATA = 0; LATB = 0;
    LATC = 1 &lt;&lt; PIN_LED;            // LED apagado (activo a 0)
    TRISA = 0; TRISB = 1 &lt;&lt; PIN_PULSADOR; TRISC = 0;

    SYSKEY = 0xAA996655;           // Desbloquear PPS
    SYSKEY = 0x556699AA;
    T3CKR  = 1;                    // Entrada de reloj de Timer 3 -> RB5
    SYSKEY = 0x1CA11CA1;           // Bloquear PPS

    T3CON = 0; TMR3 = 0; IFS0bits.T3IF = 0;
    PR3   = 6;                     // 7 flancos (la cuenta empieza en 0)
    T3CON = 0x8002;                // ON, prescaler 1:1, reloj EXTERNO (TCS=1)

    while (1) {
        while (IFS0bits.T3IF == 0) ;
        IFS0bits.T3IF = 0;
        LATC ^= 1 &lt;&lt; PIN_LED;       // Conmuta el LED cada 7 pulsaciones
    }
}</code></pre>
</section>

<section>
  <h2>4.4 Para practicar: los ejercicios de las transparencias</h2>
  <p>Los enunciados con los que se trabaja este tema en clase. Resuélvelos con la receta de 4.2 (y comprueba tus números con la calculadora):</p>
  <ul>
    <li><strong>Retardo de 15&nbsp;ms con el Timer&nbsp;2</strong> usando el divisor mínimo posible (recuerda: el tipo B tiene más opciones de prescaler que el Timer&nbsp;1).</li>
    <li><strong>LED parpadeando a 2&nbsp;Hz en RC0</strong> (pin 25, comparte AN6): primero con el Timer&nbsp;1 y después con el Timer&nbsp;2. El cambio fundamental es el preescalado: el Timer&nbsp;1 solo tiene 1, 8, 64 y 256.</li>
    <li><strong>LED que conmuta con cada pulsación en RB5</strong>: versión por software (detector de flanco, tema&nbsp;3) y versión con el Timer&nbsp;3 como contador de eventos — compárala con el ejemplo de 4.3.</li>
    <li><strong>Función <code>int Retardo(uint16_t retardo_ms)</code></strong> (la de la práctica): calcula sola el divisor para que la cuenta quepa en 16 bits, configura el timer, espera por polling, <strong>lo apaga antes de salir</strong> y devuelve 0 si todo fue bien o 1 si el retardo pedido es demasiado grande.</li>
    <li><strong>El servo de la práctica</strong>: generar su pulso de 1–2&nbsp;ms cada 20&nbsp;ms con un timer por polling y resolución de 9° (50&nbsp;µs por paso). Inténtalo antes de mirar la solución de aquí abajo.</li>
  </ul>

  <h3>La solución del servo (mazo de transparencias del servo)</h3>
  <p>El pulso se genera por <strong>polling</strong> con el Timer&nbsp;2 marcando ticks de 50&nbsp;µs (justo la resolución de 9°): el pin está a 1 durante los primeros <code>20 + grados/9</code> ticks (1&nbsp;ms más 50&nbsp;µs por cada 9°) y el periodo se cierra a los 400 ticks (400 · 50&nbsp;µs = 20&nbsp;ms):</p>
  <pre><code class="lang-c">#include &lt;xc.h&gt;
#include "Pic32Ini.h"

#define PIN_SERVO 0               // RC0 (pin 25, comparte AN6)

void ini_servo(void) {
    ANSELC &amp;= ~(1 &lt;&lt; PIN_SERVO); // RC0 como digital
    LATC   &amp;= ~(1 &lt;&lt; PIN_SERVO); // Salida a 0
    TRISC  &amp;= ~(1 &lt;&lt; PIN_SERVO); // RC0 como salida

    T2CON = 0;                    // Apagar
    TMR2  = 0;                    // Cuenta a 0
    IFS0bits.T2IF = 0;            // Borrar el flag
    PR2   = 249;                  // Tick de 50 us: 50e-6 * 5e6 - 1 = 249
    T2CON = 0x8000;               // ON, prescaler 1:1, reloj interno
}

// Llamar continuamente desde el bucle: genera el pulso por polling
void Posicionservo(int grados) {            // grados: 0..180
    static int ticks = 0;

    while (IFS0bits.T2IF == 0);             // Espera un tick de 50 us
    IFS0bits.T2IF = 0;

    if (ticks &lt; 20 + grados / 9) {          // 1 ms (20 ticks) + 1 tick por cada 9 grados
        LATCSET = 1 &lt;&lt; PIN_SERVO;
    } else {
        LATCCLR = 1 &lt;&lt; PIN_SERVO;
    }
    ticks++;
    if (ticks &gt;= 400) {                     // 400 ticks de 50 us = 20 ms de periodo
        ticks = 0;
    }
}</code></pre>
  <p class="nota">Si comparas con el mazo verás allí <code>PR2 = 250</code>: es una <strong>errata</strong>. La fórmula del tema da PR2 = 50&nbsp;µs · 5&nbsp;MHz − 1 = <strong>249</strong>.</p>
  <p class="nota">En Moodle hay además dos exámenes resueltos que exprimen este tema: el <em>semáforo para peatones</em> (marzo 2023) y el <em>dispositivo médico dúplex</em> (marzo 2024).</p>
</section>

<section>
  <h2>4.5 Ejercicio de diseño de drivers</h2>
  <p>Pon a prueba la elección de modo y configuración ante un problema con un sensor y un actuador:</p>
  <div class="mpi-mount" data-componente="ejercicio-driver" data-config='{"ref":"timers-driver"}'></div>
</section>

<section class="tema-cierre">
  <h2>Resumen</h2>
  <ul>
    <li>PBCLK = 5&nbsp;MHz; periodo base 200&nbsp;ns.</li>
    <li><strong>PRx = T·f<sub>PBCLK</sub>/divisor − 1</strong>; elige el divisor mínimo que haga PR ≤ 65535.</li>
    <li>Encender siempre en un único write: <code class="reg">TxCON = 0x8000 | (TCKPS &lt;&lt; 4)</code>. Y al terminar un retardo puntual, <strong>apagar el timer</strong> (<code>TxCON = 0;</code>).</li>
    <li>Para tiempos &gt; 3,355&nbsp;s: timer de 32 bits (bit T32) o varias cuentas encadenadas.</li>
    <li><strong>Normal con reloj interno</strong> (TCS=0, TGATE=0): el timer cuenta el reloj interno hasta lo que le pongamos en <code class="reg">PRx</code> → retardos y periodos. Es lo habitual.</li>
    <li><strong>Modo gated</strong> (TCS=0, TGATE=1): mide el tiempo que está a 1 una señal conectada al pin <code class="reg">TxCK</code> (mide anchos de pulso). Sin configurar <code class="reg">PRx</code>: se elige <code class="reg">TCKPS</code> de modo que el pulso más largo dé TMRx &lt; 65535, y se lee <code class="reg">TMRx</code>.</li>
    <li><strong>Normal con reloj externo / contador de eventos</strong> (TCS=1): el pin <code class="reg">TxCK</code> es el reloj; cuenta flancos externos. Remapeo con SYSKEY + <code class="reg">TxCKR</code>.</li>
    <li>Para ampliar: Microchip <em>Section 14. Timers</em> (DS61105) y <em>Peripheral Pin Select</em> (DS60001120).</li>
  </ul>
</section>
`
};
