/*
 * Componente "sim-adc-dspic": conversor A/D del dsPIC33FJ32MC202 (tema 16 del libro).
 *
 * Dos modos (data-config):
 *
 *  a) Simple (por defecto), programa del potenciómetro de la Práctica 8:
 *     {"canal":5,"vref":3.3,"tension":1.65,"leds":true}
 *     Deslizador 0..VREF en ANx (por defecto AN5 = RB3, pin 7, cursor de RV1
 *     vía JP2) → código = round(V/VREF·1023) en decimal, hex y binario de
 *     10 bits → ADC1BUF0 (0x0300) → PORTB = (valor << 6) & 0xF000 → LEDs D6-D9
 *     en RB15-RB12, ACTIVOS A NIVEL BAJO (luce el LED cuyo bit vale 0).
 *     Traza de get_ad(5) línea a línea (orden del listado de la Práctica 8) con
 *     barra de tiempo: SAMC = 1 TAD de muestreo + 12 TAD de conversión
 *     (AD1CON3 = 0x0105 → TAD = 6·TCY = 150 ns con FCY = 40 MHz).
 *     Casilla «AD1PCFGL sin configurar» (valor de reset 0x0000).
 *
 *  b) Escaneo: {"modo":"escaneo","pines":"0x3F","vref":3.3}
 *     Seis deslizadores AN0-AN5, casillas de AD1CSSL; calcula AD1CSSL,
 *     AD1PCFGL = ~pines, n, AD1CON2 = 0x0400 | ((n−1) << 2) y anima el barrido
 *     en orden ascendente llenando ADC1BUF0, ADC1BUF1… (0x0300, 0x0302…);
 *     AD1IF salta tras n conversiones (SMPI = n−1).
 *
 * Datasheet 20.0: SMPI<3:0> = AD1CON2<5:2>, CSCNA = AD1CON2<10>,
 * SAMC<4:0> = AD1CON3<12:8>, ADCS<7:0> = AD1CON3<7:0>, TAD = TCY·(ADCS+1);
 * tabla 24-46: TAD ≥ 76 ns, tCONV = 12 TAD (modo de 10 bits).
 */
window.MPI = window.MPI || {};
MPI.componentes = MPI.componentes || {};

(function () {
  var NBSP = ' ';
  var FCY = 40000000, ADCS = 5, SAMC = 1, NCONV = 12;
  var TCY = 1 / FCY, TAD = TCY * (ADCS + 1);
  var NTAD = SAMC + NCONV;                    // 13 TAD por conversión
  var PINES = [
    { an: 0, port: 'RA0', pin: 2, placa: 'libre' },
    { an: 1, port: 'RA1', pin: 3, placa: 'libre' },
    { an: 2, port: 'RB0', pin: 4, placa: 'PGED1' },
    { an: 3, port: 'RB1', pin: 5, placa: 'PGEC1' },
    { an: 4, port: 'RB2', pin: 6, placa: 'SW2' },
    { an: 5, port: 'RB3', pin: 7, placa: 'RV1' }
  ];
  // PicTrainer: D6 = RB15 … D9 = RB12. Con << 6, el bit b del resultado va a RB(b+6).
  var LEDS = [
    { rb: 15, nom: 'D6', b: 9 }, { rb: 14, nom: 'D7', b: 8 },
    { rb: 13, nom: 'D8', b: 7 }, { rb: 12, nom: 'D9', b: 6 }
  ];

  // ---------- Formato español ----------
  function agrupar(entero) {
    var s = String(entero);
    if (s.length >= 5) s = s.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
    return s;
  }
  function sig(x, n) {
    if (!isFinite(x)) return '—';
    if (x === 0) return '0';
    var d = Math.max(0, n - 1 - Math.floor(Math.log(Math.abs(x)) / Math.LN10));
    var s = Math.abs(x).toFixed(Math.min(d, 12));
    if (s.indexOf('.') >= 0) s = s.replace(/0+$/, '').replace(/\.$/, '');
    var p = s.split('.');
    return (x < 0 ? '−' : '') + agrupar(p[0]) + (p[1] ? ',' + p[1] : '');
  }
  function volt(v) { return v.toFixed(2).replace('.', ',') + NBSP + 'V'; }
  function fmtT(s) {
    var a = Math.abs(s);
    if (a >= 1e-3) return sig(s * 1e3, 4) + NBSP + 'ms';
    if (a >= 1e-6) return sig(s * 1e6, 4) + NBSP + 'µs';
    return sig(s * 1e9, 4) + NBSP + 'ns';
  }
  function hexN(v, n) {
    var s = (v >>> 0).toString(16).toUpperCase();
    while (s.length < n) s = '0' + s;
    return '0x' + s;
  }
  function hex4(v) { return hexN(v & 0xFFFF, 4); }
  function bin10(v) {
    var s = '';
    for (var b = 9; b >= 0; b--) { s += (v >> b) & 1; if (b % 4 === 0 && b) s += ' '; }
    return s;
  }
  function codigo(v, vref) {
    var c = Math.round(v / vref * 1023);
    return Math.max(0, Math.min(1023, c));
  }
  function vivo(el) { return el.isConnected !== undefined ? el.isConnected : document.body.contains(el); }
  function sinMovimiento() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }
  function leerHex(x, porDefecto) {
    if (typeof x === 'number' && isFinite(x)) return x | 0;
    var s = String(x == null ? '' : x).trim();
    if (/^0x[0-9a-f]+$/i.test(s)) return parseInt(s.slice(2), 16);
    if (/^\d+$/.test(s)) return parseInt(s, 10);
    return porDefecto;
  }
  function popcount(v) { var n = 0; while (v) { n += v & 1; v >>= 1; } return n; }

  // Bloque de código con una línea por <span>, para poder resaltar la línea en curso.
  function pintarLineas(pre, lineas) {
    pre.innerHTML = '';
    lineas.forEach(function (txt, i) {
      var sp = document.createElement('span');
      sp.className = 'sadc-ln';
      sp.setAttribute('data-l', String(i));
      var c = document.createElement('code');
      c.className = 'lang-c';
      c.textContent = txt === '' ? ' ' : txt;
      sp.appendChild(c);
      pre.appendChild(sp);
    });
    if (MPI.resaltarTodo) MPI.resaltarTodo(pre);
  }
  function pintarCodigo(pre, texto) {
    pre.innerHTML = '<code class="lang-c"></code>';
    pre.firstChild.textContent = texto;
    if (MPI.resaltarTodo) MPI.resaltarTodo(pre);
  }

  var ID = 0;

  // =====================================================================
  //  MODO SIMPLE: potenciómetro → ADC1BUF0 → PORTB → LEDs
  // =====================================================================
  function modoSimple(el, cfg) {
    var uid = 'sadc' + (++ID);
    var canal = (cfg.canal >= 0 && cfg.canal <= 5) ? (cfg.canal | 0) : 5;
    var P = PINES[canal];
    var vref = Number(cfg.vref) > 0 ? Number(cfg.vref) : 3.3;
    var v = (cfg.tension != null && isFinite(Number(cfg.tension))) ? Number(cfg.tension) : vref / 2;
    v = Math.max(0, Math.min(vref, v));
    var conLeds = cfg.leds !== false;
    var mascara = 1 << canal;
    var esPot = canal === 5;
    var anTxt = 'AN' + canal;
    var origen = esPot ? 'cursor del potenciómetro RV1 (JP2)' : 'tensión aplicada al pin';

    var celdasBits = '';
    for (var b = 9; b >= 0; b--) {
      celdasBits += '<div class="sadc-bit' + (b >= 6 && conLeds ? ' sadc-bit-led' : '') + '" data-b="' + b + '">' +
        '<span class="sadc-bit-n">b' + b + '</span><span class="sadc-bit-v"></span></div>';
    }
    var htmlLeds = '';
    LEDS.forEach(function (l) {
      htmlLeds += '<div class="sadc-led" data-rb="' + l.rb + '">' +
        '<span class="sadc-led-ruta">b' + l.b + ' → RB' + l.rb + '</span>' +
        '<span class="sadc-led-luz" aria-hidden="true"></span>' +
        '<span class="sadc-led-nom">' + l.nom + '</span>' +
        '<span class="sadc-led-est"></span></div>';
    });
    var segs = '';
    for (var s = 0; s < SAMC; s++) segs += '<span class="sadc-seg sadc-seg-m">M</span>';
    for (s = 1; s <= NCONV; s++) segs += '<span class="sadc-seg sadc-seg-c">' + s + '</span>';

    var rapidos = [0, vref / 2, vref].map(function (x) {
      return '<button type="button" class="sadc-btn sadc-rapido" data-v="' + x + '">' + volt(x) + '</button>';
    }).join('');

    el.classList.add('mpi-sim-adc-dspic');
    el.innerHTML =
      '<div class="mpi-sim-cab">Conversor A/D · ' + anTxt + ' → ADC1BUF0' + (conLeds ? ' → LEDs' : '') +
        ' <span class="sadc-cab-sub">modo simple</span></div>' +
      '<div class="sadc-pot">' +
        '<label class="sadc-pot-lab" for="' + uid + '-v">Tensión en <b>' + anTxt + '</b> (' + P.port + ', pin ' + P.pin + '): ' + origen + '</label>' +
        '<div class="sadc-slider-fila">' +
          '<input id="' + uid + '-v" class="sadc-v" type="range" min="0" max="' + vref + '" step="0.01" value="' + v + '">' +
          '<output class="sadc-vout" for="' + uid + '-v"></output>' +
        '</div>' +
        '<div class="sadc-rapidos" role="group" aria-label="Tensiones de prueba">' + rapidos + '</div>' +
      '</div>' +
      '<div class="sadc-cadena">' +
        '<div class="sadc-caja sadc-c-cod"><div class="sadc-caja-tit">Resultado de 10 bits</div>' +
          '<div class="sadc-formula"></div><div class="sadc-tri"></div></div>' +
        '<div class="sadc-flecha" aria-hidden="true">→</div>' +
        '<div class="sadc-caja sadc-c-buf"><div class="sadc-caja-tit">ADC1BUF0 <small>(dirección 0x0300)</small></div>' +
          '<div class="sadc-big sadc-buf-v"></div><div class="sadc-peq">return ADC1BUF0;</div></div>' +
        (conLeds ?
        '<div class="sadc-flecha" aria-hidden="true">→</div>' +
        '<div class="sadc-caja sadc-c-pb"><div class="sadc-caja-tit">PORTB = (valor &lt;&lt; 6) &amp; 0xF000</div>' +
          '<div class="sadc-peq sadc-shift"></div><div class="sadc-big sadc-pb-v"></div></div>' : '') +
      '</div>' +
      '<div class="sadc-bits" role="group" aria-label="Bits del resultado"><div class="sadc-bits-fila">' + celdasBits + '</div>' +
        (conLeds ? '<p class="sadc-leyenda">Los bits b9…b6 (resaltados) son los que el desplazamiento &lt;&lt; 6 lleva a RB15…RB12; ' +
          'los seis bits bajos se pierden con la máscara 0xF000.</p>' : '') + '</div>' +
      (conLeds ?
      '<div class="sadc-tarjeta"><div class="sadc-tarjeta-tit">PicTrainer · LEDs activos a nivel bajo (luce si el bit vale 0)</div>' +
        '<div class="sadc-leds">' + htmlLeds + '</div></div>' : '') +
      '<div class="sadc-traza">' +
        '<div class="sadc-sub">Una llamada a <code>get_ad(' + canal + ')</code> paso a paso</div>' +
        '<div class="sadc-ctl">' +
          '<button type="button" class="sadc-btn sadc-run">▶ Ejecutar</button>' +
          '<button type="button" class="sadc-btn sadc-paso">Paso ›</button>' +
          '<button type="button" class="sadc-btn sadc-reini">Reiniciar</button>' +
        '</div>' +
        '<div class="sadc-traza-cuerpo">' +
          '<pre class="sadc-cod"></pre>' +
          '<div class="sadc-tiempo">' +
            '<div class="sadc-barra" role="img" aria-label="Barra de tiempo: ' + SAMC + ' TAD de muestreo y 12 TAD de conversión, ' +
              NTAD + ' TAD = ' + fmtT(NTAD * TAD) + ' en total."><div class="sadc-segs">' + segs + '</div>' +
              '<div class="sadc-prog"></div></div>' +
            '<div class="sadc-barra-et"><span><b class="sadc-m">■</b> muestreo: SAMC = ' + SAMC + ' TAD = ' + fmtT(SAMC * TAD) + '</span>' +
              '<span><b class="sadc-c">■</b> conversión: 12 TAD = ' + fmtT(NCONV * TAD) + '</span>' +
              '<span>total: ' + NTAD + ' TAD = ' + fmtT(NTAD * TAD) + ' (' + Math.round(NTAD * TAD / TCY) + ' TCY)</span></div>' +
            '<div class="sadc-regs-vivos">' +
              '<div>t = <b class="sadc-t"></b></div>' +
              '<div>SAMP = <b class="sadc-samp"></b></div>' +
              '<div>AD1IF = <b class="sadc-if"></b></div>' +
              '<div>SAR = <b class="sadc-sar"></b></div>' +
            '</div>' +
            '<p class="sadc-estado" aria-live="polite"></p>' +
          '</div>' +
        '</div>' +
        '<p class="sadc-nota">AD1CON3 = 0x0105 (SAMC = 1, ADCS = 5) con F<sub>CY</sub> = 40 MHz: T<sub>AD</sub> = 25 ns · 6 = 150 ns. ' +
          'Con SSRC = 111 el contador interno termina el muestreo y arranca la conversión sin que el programa toque SAMP. ' +
          'La animación va a cámara lenta: en el micro todo dura ' + fmtT(NTAD * TAD) + '.</p>' +
      '</div>' +
      '<div class="sadc-pcfg">' +
        '<label class="sadc-chk"><input type="checkbox" class="sadc-pcfg-chk"> <span><code>AD1PCFGL</code> sin configurar ' +
          '(falta <code>AD1PCFGL = ~canales;</code>: queda el valor de reset 0x0000)</span></label>' +
        '<div class="sadc-scroll"><table class="sadc-tabla sadc-pcfg-tabla"><thead><tr>' +
          '<th scope="col">Entrada</th><th scope="col">Pin</th><th scope="col">PCFG</th><th scope="col">Modo</th><th scope="col">Lectura digital de PORTx</th>' +
        '</tr></thead><tbody></tbody></table></div>' +
        '<p class="sadc-pcfg-txt"></p>' +
      '</div>' +
      '<details class="sadc-init"><summary>Inicialización del listado: <code>init_ad(' + hexN(mascara, 2) + ')</code></summary>' +
        '<pre class="sadc-init-cod"></pre><p class="sadc-nota sadc-init-nota"></p></details>';

    var q = function (x) { return el.querySelector(x); };
    var inV = q('.sadc-v'), outV = q('.sadc-vout');
    var formula = q('.sadc-formula'), tri = q('.sadc-tri'), bufV = q('.sadc-buf-v');
    var shift = q('.sadc-shift'), pbV = q('.sadc-pb-v');
    var cajaBuf = q('.sadc-c-buf'), cajaPb = q('.sadc-c-pb');
    var preCod = q('.sadc-cod'), prog = q('.sadc-prog');
    var vT = q('.sadc-t'), vSamp = q('.sadc-samp'), vIf = q('.sadc-if'), vSar = q('.sadc-sar'), estado = q('.sadc-estado');
    var btnRun = q('.sadc-run'), btnPaso = q('.sadc-paso'), btnReini = q('.sadc-reini');
    var chkPcfg = q('.sadc-pcfg-chk'), tbPcfg = q('.sadc-pcfg-tabla tbody'), txtPcfg = q('.sadc-pcfg-txt');

    var lineas = [
      'int get_ad(int canal) {          // canal = ' + canal,
      '    AD1CHS0 = canal;',
      '    AD1CON1bits.SAMP = 1;',
      '    IFS0bits.AD1IF = 0;',
      '    while (!IFS0bits.AD1IF);',
      '    return ADC1BUF0;',
      '}'
    ];
    if (conLeds) lineas.push('', '// en main():', 'while (1)', '    PORTB = (get_ad(' + canal + ') << 6) & 0xF000;');
    pintarLineas(preCod, lineas);
    var LINEA_FASE = [1, 2, 3, 4, 5, conLeds ? 10 : 5];

    pintarCodigo(q('.sadc-init-cod'),
      'void init_ad(int canales) {      // canales = ' + hexN(mascara, 2) + '\n' +
      '    TRISB |= canales & 0x3F >> 2;\n' +
      '    TRISA |= canales & 3;\n' +
      '    AD1PCFGL = ~canales;         // ' + hex4(~mascara) + '\n' +
      '    AD1CON3 = 0x105;             // SAMC = 1, ADCS = 5\n' +
      '    AD1CON2 = 0;\n' +
      '    AD1CON1 = 0x80E0;            // ADON = 1, SSRC = 111\n' +
      '}');
    var trisAntes = (mascara & (0x3F >> 2));
    q('.sadc-init-nota').innerHTML = '<strong>⚠ A verificar.</strong> En C, <code>&gt;&gt;</code> tiene más prioridad que <code>&amp;</code>: ' +
      '<code>canales &amp; 0x3F &gt;&gt; 2</code> es <code>canales &amp; 0x0F</code>, que con canales = ' + hexN(mascara, 2) + ' vale ' + hexN(trisAntes, 2) +
      (trisAntes ? '.' : ', así que esa línea no cambia TRISB. El programa funciona porque el <code>main</code> de la Práctica 8 ya deja RB3 como entrada (<code>TRISB = 0x0FFF</code>).') +
      ' Para poner como entradas RB0-RB3 según AN2-AN5 haría falta <code>TRISB |= (canales &amp; 0x3C) &gt;&gt; 2;</code>.';

    // ---------------- Cadena de valores ----------------
    function pintarCadena() {
      var c = codigo(v, vref);
      var pb = (c << 6) & 0xF000;
      outV.textContent = volt(v);
      inV.setAttribute('aria-valuetext', volt(v).replace(NBSP, ' ') + ', código ' + c);
      formula.innerHTML = 'round(' + volt(v) + ' / ' + volt(vref) + ' · 1023) = <b>' + c + '</b>';
      tri.innerHTML = '<div><span>dec</span> <b>' + c + '</b></div><div><span>hex</span> <b>' + hexN(c, 3) + '</b></div>' +
        '<div><span>bin</span> <b>' + bin10(c) + '</b></div>';
      bufV.textContent = hex4(c);
      if (conLeds) {
        shift.innerHTML = hex4(c) + ' &lt;&lt; 6 = ' + hex4(c << 6) + ' → &amp; 0xF000';
        pbV.textContent = hex4(pb);
      }
      var celdas = el.querySelectorAll('.sadc-bit');
      for (var i = 0; i < celdas.length; i++) {
        var bb = +celdas[i].getAttribute('data-b');
        var x = (c >> bb) & 1;
        celdas[i].querySelector('.sadc-bit-v').textContent = x;
        celdas[i].classList.toggle('sadc-uno', !!x);
      }
      if (conLeds) {
        LEDS.forEach(function (l) {
          var nodo = el.querySelector('.sadc-led[data-rb="' + l.rb + '"]');
          var bit = (pb >> l.rb) & 1;
          var on = bit === 0;
          nodo.classList.toggle('sadc-on', on);
          nodo.querySelector('.sadc-led-est').textContent = 'RB' + l.rb + ' = ' + bit + ' → ' + (on ? 'encendido' : 'apagado');
        });
      }
    }

    // ---------------- AD1PCFGL ----------------
    function pintarPcfg() {
      var sin = chkPcfg.checked;
      var reg = sin ? 0x0000 : (~mascara & 0xFFFF);
      var filas = '';
      PINES.forEach(function (p) {
        var analog = !((reg >> p.an) & 1);
        var lect;
        if (p.an === canal) lect = 'lo convierte el A/D; como bit de ' + (p.an < 2 ? 'PORTA' : 'PORTB') + ' se lee 0';
        else if (analog) lect = '<span class="sadc-mal">siempre 0</span>' + (p.an === 4 ? ' (SW2 parecería pulsado)' : '');
        else lect = 'nivel del pin' + (p.an === 4 ? ' (SW2: suelto = 1, pulsado = 0)' : '');
        filas += '<tr class="' + (p.an === canal ? 'sadc-fila-canal' : (analog ? 'sadc-fila-mal' : '')) + '">' +
          '<td>AN' + p.an + '</td><td>' + p.port + ' (' + p.pin + ')</td><td>' + ((reg >> p.an) & 1) + '</td>' +
          '<td>' + (analog ? 'analógico' : 'digital') + '</td><td>' + lect + '</td></tr>';
      });
      tbPcfg.innerHTML = filas;
      txtPcfg.innerHTML = 'AD1PCFGL = <b>' + hex4(reg) + '</b>. ' + (sin
        ? 'La conversión de ' + anTxt + ' sigue funcionando (su pin ya es analógico tras el reset), pero <strong>todos</strong> los pines AN0-AN5 ' +
          'quedan analógicos: las lecturas digitales de RA0-RA1 y RB0-RB3 devuelven 0 (el buffer de entrada digital está desconectado). ' +
          'Por eso la plantilla de main pone <code>AD1PCFGL = 0xFFFF</code> y <code>init_ad</code> deja analógicos solo los canales pedidos.'
        : 'Con <code>AD1PCFGL = ~canales</code> solo ' + anTxt + ' es analógico; el resto de RA0-RA1 y RB0-RB3 se leen como entradas digitales normales.');
    }

    // ---------------- Traza de get_ad ----------------
    var fase = -1, t = 0, corriendo = false, ultimo = null, espera = 0;
    var muestra = null, ifPrevio = 0;
    var VEL = 4;   // TAD por segundo en pantalla

    function samp() { return fase >= 1 && fase <= 3 && t < SAMC ? 1 : 0; }
    function ad1if() {
      if (fase >= 3 && t >= NTAD) return 1;
      if (fase >= 2) return 0;
      return ifPrevio;
    }
    function pintarTraza() {
      var lnAct = fase >= 0 ? LINEA_FASE[fase] : -1;
      var lns = preCod.querySelectorAll('.sadc-ln');
      for (var i = 0; i < lns.length; i++) lns[i].classList.toggle('sadc-ln-act', i === lnAct);
      prog.style.width = (Math.min(t, NTAD) / NTAD * 100) + '%';
      var tTxt = (fase < 1 ? '—' : sig(Math.min(t, NTAD), 3) + ' TAD');
      vT.textContent = tTxt;
      vSamp.textContent = fase < 0 ? '0' : String(samp());
      var f = ad1if();
      vIf.textContent = String(f);
      vIf.classList.toggle('sadc-on-txt', f === 1);
      // Registro de aproximaciones sucesivas: un bit por TAD tras el muestreo.
      var c = muestra != null ? muestra : codigo(v, vref);
      var n = fase >= 3 ? Math.max(0, Math.min(10, Math.floor(t - SAMC + 1e-9))) : 0;
      if (fase >= 4) n = 10;
      var sar = '';
      for (var b = 9; b >= 0; b--) {
        sar += (9 - b) < n ? ((c >> b) & 1) : '·';
        if (b % 4 === 0 && b) sar += ' ';
      }
      vSar.textContent = sar;
      cajaBuf.classList.toggle('sadc-destaca', fase === 4);
      if (cajaPb) cajaPb.classList.toggle('sadc-destaca', fase === 5);
      el.classList.toggle('sadc-leds-destaca', fase === 5);
      estado.innerHTML = textoEstado(c);
      btnRun.textContent = corriendo ? '⏸ Pausa' : '▶ Ejecutar';
      btnRun.setAttribute('aria-pressed', String(corriendo));
    }
    function textoEstado(c) {
      switch (fase) {
        case -1: return 'Pulsa «Ejecutar» para ver una llamada completa o «Paso» para avanzar línea a línea.';
        case 0: return '<code>AD1CHS0 = ' + canal + '</code>: CH0SA = ' + canal + ' conecta ' + anTxt + ' (' + P.port + ', pin ' + P.pin + ') al muestreador del canal 0.';
        case 1: return '<code>SAMP = 1</code>: empieza el muestreo; el condensador del muestreador se carga con la tensión de ' + anTxt + '.';
        case 2: return '<code>AD1IF = 0</code>: borra el flag de la conversión anterior. Da tiempo: toda la conversión dura ' + NTAD + ' TAD = ' +
          Math.round(NTAD * TAD / TCY) + ' TCY.';
        case 3:
          if (t < SAMC) return 'Muestreando ' + anTxt + ' (SAMC = ' + SAMC + ' TAD). El programa ya espera en el <code>while</code>.';
          if (t < NTAD) {
            var k = Math.min(NCONV, Math.floor(t - SAMC) + 1);
            return 'Conversión, T<sub>AD</sub> ' + k + ' de 12: ' + (k <= 10 ? 'el SAR está decidiendo el bit b' + (10 - k) + '.' : 'los 10 bits ya están; 2 T<sub>AD</sub> más para terminar.') +
              ' SAMP = 0: la tensión queda retenida aunque cambie el pin.';
          }
          return 'Fin de conversión: el hardware escribe ADC1BUF0 y pone <b>AD1IF = 1</b>; el <code>while</code> termina.';
        case 4: return '<code>return ADC1BUF0;</code> devuelve <b>' + c + ' = ' + hexN(c, 3) + '</b>.';
        case 5:
          if (!conLeds) return 'Fin de la llamada: get_ad devuelve ' + c + '.';
          var pb = (c << 6) & 0xF000, enc = [];
          LEDS.forEach(function (l) { if (!((pb >> l.rb) & 1)) enc.push(l.nom); });
          return '<code>PORTB = (' + c + ' &lt;&lt; 6) &amp; 0xF000</code> = <b>' + hex4(pb) + '</b>: ' +
            (enc.length ? 'encendidos ' + enc.join(', ') : 'los cuatro LEDs apagados') + '. El <code>while (1)</code> vuelve a llamar a get_ad.';
      }
      return '';
    }
    function capturar() { if (muestra == null && t >= SAMC) muestra = codigo(v, vref); }

    function frame(ts) {
      if (!vivo(el)) { corriendo = false; return; }
      if (!corriendo) { ultimo = null; return; }
      if (ultimo == null) ultimo = ts;
      var dt = Math.min(0.1, Math.max(0, (ts - ultimo) / 1000));
      ultimo = ts;
      if (fase === 0) {
        espera += dt;
        if (espera > 0.8) { fase = 1; t = 0; espera = 0; }
      } else if (fase >= 1 && fase <= 3) {
        t += dt * VEL;
        if (fase === 1 && t >= 0.35) fase = 2;
        if (fase === 2 && t >= 0.7) fase = 3;
        capturar();
        if (t >= NTAD) {
          t = NTAD;
          espera += dt;
          if (espera > 0.9) { fase = 4; espera = 0; }
        }
      } else if (fase === 4) {
        espera += dt;
        if (espera > 1.1) { fase = 5; espera = 0; }
      } else if (fase === 5) {
        espera += dt;
        if (espera > 0.3) { corriendo = false; ifPrevio = 1; }
      }
      pintarTraza();
      if (corriendo) requestAnimationFrame(frame);
    }
    function nuevaLlamada() { fase = 0; t = 0; espera = 0; muestra = null; }

    btnRun.addEventListener('click', function () {
      if (corriendo) { corriendo = false; pintarTraza(); return; }
      if (fase === -1 || fase === 5) { if (fase === 5) ifPrevio = 1; nuevaLlamada(); }
      if (sinMovimiento()) {
        // Sin animación: se muestra directamente el estado final de la llamada.
        t = NTAD; muestra = codigo(v, vref); fase = 5; ifPrevio = 1;
        pintarTraza();
        return;
      }
      corriendo = true; ultimo = null;
      pintarTraza();
      requestAnimationFrame(frame);
    });
    btnPaso.addEventListener('click', function () {
      corriendo = false;
      if (fase === -1 || fase === 5) { if (fase === 5) ifPrevio = 1; nuevaLlamada(); }
      else if (fase === 0) { fase = 1; t = 0; }
      else if (fase === 1) { fase = 2; t = 0.5; }
      else if (fase === 2) { fase = 3; t = SAMC; capturar(); }
      else if (fase === 3) {
        if (t < NTAD) { t = Math.min(NTAD, Math.floor(t + 1e-9) + 1); capturar(); }
        else fase = 4;
      } else if (fase === 4) fase = 5;
      espera = 0;
      pintarTraza();
    });
    btnReini.addEventListener('click', function () {
      corriendo = false; fase = -1; t = 0; muestra = null; ifPrevio = 0;
      pintarTraza();
    });

    function fijarV(x) {
      v = Math.max(0, Math.min(vref, x));
      inV.value = String(v);
      pintarCadena();
      if (!corriendo) pintarTraza();
    }
    inV.addEventListener('input', function () { fijarV(parseFloat(inV.value)); });
    el.querySelector('.sadc-rapidos').addEventListener('click', function (e) {
      var bt = e.target.closest ? e.target.closest('.sadc-rapido') : null;
      if (bt) fijarV(parseFloat(bt.getAttribute('data-v')));
    });
    chkPcfg.addEventListener('change', pintarPcfg);

    pintarCadena();
    pintarPcfg();
    pintarTraza();
  }

  // =====================================================================
  //  MODO ESCANEO: CSCNA = 1, AD1CSSL, ADC1BUF0..BUFn−1
  // =====================================================================
  function modoEscaneo(el, cfg) {
    var uid = 'sadc' + (++ID);
    var vref = Number(cfg.vref) > 0 ? Number(cfg.vref) : 3.3;
    var pines = leerHex(cfg.pines, 0x3F) & 0x3F;
    var vs = [0.50, 1.20, 2.00, 2.80, 3.30, 1.65].map(function (x) { return Math.min(vref, x * vref / 3.3); });
    var VEL = 5;    // TAD por segundo en pantalla

    var filas = '';
    PINES.forEach(function (p) {
      filas += '<div class="sadc-pin" data-an="' + p.an + '">' +
        '<div class="sadc-pin-cab">' +
          '<label class="sadc-chk"><input type="checkbox" class="sadc-pin-chk" data-an="' + p.an + '"' + ((pines >> p.an) & 1 ? ' checked' : '') + '>' +
            ' <span><b>AN' + p.an + '</b> ' + p.port + ' · pin ' + p.pin + '</span></label>' +
          '<span class="sadc-placa">' + p.placa + '</span>' +
        '</div>' +
        '<div class="sadc-slider-fila">' +
          '<label class="sadc-sr" for="' + uid + '-an' + p.an + '">Tensión en AN' + p.an + '</label>' +
          '<input id="' + uid + '-an' + p.an + '" class="sadc-pin-v" data-an="' + p.an + '" type="range" min="0" max="' + vref + '" step="0.01" value="' + vs[p.an] + '">' +
          '<output class="sadc-vout" for="' + uid + '-an' + p.an + '"></output>' +
        '</div>' +
        '<div class="sadc-pin-cod"></div>' +
      '</div>';
    });

    el.classList.add('mpi-sim-adc-dspic', 'sadc-escaneo');
    el.innerHTML =
      '<div class="mpi-sim-cab">Conversor A/D · escaneo automático (CSCNA = 1) <span class="sadc-cab-sub">modo escaneo</span></div>' +
      '<p class="sadc-intro">Marca los pines que entran en <code>AD1CSSL</code>. El módulo los convierte solo, <strong>en orden ascendente</strong>, ' +
        'y deja cada resultado en ADC1BUF0, ADC1BUF1… <strong>por orden de conversión</strong>, no por número de canal.</p>' +
      '<div class="sadc-pines">' + filas + '</div>' +
      '<div class="sadc-scroll"><table class="sadc-tabla sadc-regs"><thead><tr><th scope="col">Registro</th><th scope="col">Valor</th><th scope="col">De dónde sale</th></tr></thead><tbody></tbody></table></div>' +
      '<pre class="sadc-esc-init"></pre>' +
      '<div class="sadc-ctl">' +
        '<button type="button" class="sadc-btn sadc-run">▶ Barrido</button>' +
        '<button type="button" class="sadc-btn sadc-paso">Paso › (una conversión)</button>' +
        '<button type="button" class="sadc-btn sadc-reini">Reiniciar</button>' +
      '</div>' +
      '<div class="sadc-barra sadc-esc-barra" role="img"><div class="sadc-segs sadc-esc-segs"></div><div class="sadc-prog"></div></div>' +
      '<div class="sadc-regs-vivos"><div>t = <b class="sadc-t"></b></div><div>conversiones = <b class="sadc-k"></b></div>' +
        '<div>AD1IF = <b class="sadc-if"></b></div></div>' +
      '<p class="sadc-estado" aria-live="polite"></p>' +
      '<div class="sadc-scroll"><table class="sadc-tabla sadc-bufs"><thead><tr><th scope="col">Buffer</th><th scope="col">Dirección</th>' +
        '<th scope="col">Pin convertido</th><th scope="col">Valor</th></tr></thead><tbody></tbody></table></div>' +
      '<p class="sadc-nota sadc-bufs-nota"></p>' +
      '<pre class="sadc-esc-get"></pre>' +
      '<p class="sadc-nota"><code>pBuf</code> es un puntero a <code>int</code> (2 bytes): <code>*(pBuf+i)</code> lee la dirección 0x0300 + 2·i, es decir, ADC1BUF<i>i</i>.</p>';

    var q = function (x) { return el.querySelector(x); };
    var tbRegs = q('.sadc-regs tbody'), tbBufs = q('.sadc-bufs tbody'), notaBufs = q('.sadc-bufs-nota');
    var preInit = q('.sadc-esc-init'), segsEl = q('.sadc-esc-segs'), prog = q('.sadc-esc-barra .sadc-prog'), barra = q('.sadc-esc-barra');
    var vT = q('.sadc-t'), vK = q('.sadc-k'), vIf = q('.sadc-if'), estado = q('.sadc-estado');
    var btnRun = q('.sadc-run'), btnPaso = q('.sadc-paso'), btnReini = q('.sadc-reini');

    pintarCodigo(q('.sadc-esc-get'),
      'void get_ad(int n_pines, int* valores) {\n' +
      '    int * pBuf = 0x300;  // 0x300 es la dirección de memoria del AD1CBUF0\n' +
      '    IFS0bits.AD1IF = 0;\n' +
      '    while (!IFS0bits.AD1IF);  // conversión terminada?\n' +
      '    for (int i = 0; i < n_pines; i++)\n' +
      '        valores[i] = *(pBuf+i);\n' +
      '}');

    var orden = [], buf = [], t = 0, corriendo = false, ultimo = null;

    function lista() { var o = []; for (var i = 0; i < 6; i++) if ((pines >> i) & 1) o.push(i); return o; }
    function hechas() { return Math.min(orden.length, Math.floor(t / NTAD + 1e-9)); }

    function pintarPines() {
      var nodos = el.querySelectorAll('.sadc-pin');
      for (var i = 0; i < nodos.length; i++) {
        var an = +nodos[i].getAttribute('data-an');
        var c = codigo(vs[an], vref);
        var dentro = !!((pines >> an) & 1);
        nodos[i].classList.toggle('sadc-pin-fuera', !dentro);
        nodos[i].querySelector('.sadc-vout').textContent = volt(vs[an]);
        nodos[i].querySelector('.sadc-pin-v').setAttribute('aria-valuetext', volt(vs[an]).replace(NBSP, ' ') + ', código ' + c);
        var pos = orden.indexOf(an);
        nodos[i].querySelector('.sadc-pin-cod').innerHTML = dentro
          ? 'código ' + c + ' = ' + hexN(c, 3) + ' → <b>ADC1BUF' + pos.toString(16).toUpperCase() + '</b>'
          : '<span class="sadc-tenue">fuera del escaneo (digital)</span>';
      }
    }

    function pintarRegs() {
      var n = orden.length;
      var pcfg = ~pines & 0xFFFF;
      var con2 = 0x0400 | (((n || 1) - 1) << 2);
      var r = '';
      r += '<tr><th scope="row">AD1CSSL</th><td>' + hex4(pines) + '</td><td>= pines: un 1 por cada ANx que se escanea</td></tr>';
      r += '<tr><th scope="row">AD1PCFGL</th><td>' + hex4(pcfg) + '</td><td>= ~pines: 0 = analógico</td></tr>';
      r += '<tr><th scope="row">n_pines</th><td>' + n + '</td><td>pines marcados</td></tr>';
      r += '<tr><th scope="row">AD1CON2</th><td>' + (n ? hex4(con2) : '—') + '</td><td>= 0x0400 | ((n−1) &lt;&lt; 2): CSCNA = 1, SMPI = ' + (n ? n - 1 : '—') + '</td></tr>';
      r += '<tr><th scope="row">AD1CON3</th><td>0x0105</td><td>SAMC = 1, ADCS = 5 → ' + NTAD + ' T<sub>AD</sub> = ' + fmtT(NTAD * TAD) + ' por conversión</td></tr>';
      r += '<tr><th scope="row">AD1CON1</th><td>0x80E4</td><td>ADON = 1, SSRC = 111, ASAM = 1 (muestreo automático)</td></tr>';
      tbRegs.innerHTML = r;
      pintarCodigo(preInit, n
        ? 'init_ad(' + hex4(pines) + ', ' + n + ');   // pines, n_pines\n' +
          '// AD1CON2 = 0x0400 | (' + n + '-1 << 2) = ' + hex4(con2)
        : '// Marca al menos un pin para llamar a init_ad');
      var segs = '';
      orden.forEach(function (an) { segs += '<span class="sadc-seg sadc-seg-esc">AN' + an + '</span>'; });
      segsEl.innerHTML = segs || '<span class="sadc-seg sadc-seg-esc">—</span>';
      barra.setAttribute('aria-label', n ? 'Barrido de ' + n + ' conversiones de ' + NTAD + ' TAD: ' + fmtT(n * NTAD * TAD) + ' en total; AD1IF salta al final.' : 'Sin pines en el escaneo.');
      btnRun.disabled = btnPaso.disabled = !n;
    }

    function pintarBufs() {
      var n = orden.length, k = hechas();
      var filas = '';
      for (var i = 0; i < n; i++) {
        var p = PINES[orden[i]];
        var escrito = i < k && buf[i] != null;
        var enCurso = corriendo && i === k && k < n;
        filas += '<tr class="' + (escrito ? 'sadc-buf-ok' : (enCurso ? 'sadc-buf-act' : '')) + '">' +
          '<td>ADC1BUF' + i.toString(16).toUpperCase() + '</td><td>' + hex4(0x0300 + 2 * i) + '</td>' +
          '<td>AN' + p.an + ' (' + p.port + ')</td>' +
          '<td>' + (escrito ? hex4(buf[i]) + ' = ' + buf[i] : (enCurso ? 'convirtiendo…' : '—')) + '</td></tr>';
      }
      tbBufs.innerHTML = filas || '<tr><td colspan="4">Sin pines marcados.</td></tr>';
      notaBufs.textContent = n
        ? (n < 16 ? 'ADC1BUF' + n.toString(16).toUpperCase() + '…ADC1BUFF no se usan: con SMPI = ' + (n - 1) + ' el puntero del buffer vuelve a ADC1BUF0 tras ' + n + ' conversiones. ' : '') +
          'Como ASAM = 1, el módulo sigue barriendo y el siguiente barrido sobrescribe los buffers; por eso get_ad borra AD1IF y espera a un barrido completo.'
        : '';
      var hk = hechas();
      vT.textContent = sig(Math.min(t, n * NTAD), 3) + ' TAD = ' + fmtT(Math.min(t, n * NTAD) * TAD);
      vK.textContent = hk + ' de ' + n;
      var f = n && hk >= n ? 1 : 0;
      vIf.textContent = String(f);
      vIf.classList.toggle('sadc-on-txt', !!f);
      prog.style.width = n ? (Math.min(t, n * NTAD) / (n * NTAD) * 100) + '%' : '0';
      var segs = segsEl.querySelectorAll('.sadc-seg');
      for (var s2 = 0; s2 < segs.length; s2++) segs[s2].classList.toggle('sadc-seg-hecho', s2 < hk);
      if (!n) estado.textContent = 'Marca al menos un pin para escanear.';
      else if (hk >= n) estado.innerHTML = '<b>AD1IF = 1</b> tras ' + n + ' conversiones (SMPI = ' + (n - 1) + '), ' + fmtT(n * NTAD * TAD) + ' después de empezar el barrido.';
      else if (t === 0 && !corriendo) estado.textContent = 'Pulsa «Barrido» para ver cómo se llenan los buffers.';
      else if (corriendo) estado.innerHTML = 'Convirtiendo AN' + orden[hk] + ' → ADC1BUF' + hk.toString(16).toUpperCase() + ' (conversión ' + (hk + 1) + ' de ' + n + '). AD1IF sigue a 0.';
      else estado.innerHTML = hk + ' de ' + n + ' conversiones hechas; AD1IF sigue a 0. La siguiente es AN' + orden[hk] + ' → ADC1BUF' + hk.toString(16).toUpperCase() + '.';
      btnRun.textContent = corriendo ? '⏸ Pausa' : '▶ Barrido';
      btnRun.setAttribute('aria-pressed', String(corriendo));
    }

    function registrar() {
      // Escribe los buffers de las conversiones ya terminadas (muestra al final del muestreo).
      var hk = hechas();
      for (var i = 0; i < hk; i++) if (buf[i] == null) buf[i] = codigo(vs[orden[i]], vref);
    }
    function reiniciar() { corriendo = false; t = 0; buf = []; pintarBufs(); }
    function recalcular() {
      orden = lista();
      reiniciar();
      pintarRegs();
      pintarPines();
      pintarBufs();
    }

    function frame(ts) {
      if (!vivo(el)) { corriendo = false; return; }
      if (!corriendo) { ultimo = null; return; }
      if (ultimo == null) ultimo = ts;
      var dt = Math.min(0.1, Math.max(0, (ts - ultimo) / 1000));
      ultimo = ts;
      var fin = orden.length * NTAD;
      t = Math.min(fin, t + dt * VEL);
      registrar();
      if (t >= fin) corriendo = false;
      pintarBufs();
      if (corriendo) requestAnimationFrame(frame);
    }

    btnRun.addEventListener('click', function () {
      if (!orden.length) return;
      if (corriendo) { corriendo = false; pintarBufs(); return; }
      if (hechas() >= orden.length) { t = 0; buf = []; }
      if (sinMovimiento()) { t = orden.length * NTAD; registrar(); pintarBufs(); return; }
      corriendo = true; ultimo = null;
      pintarBufs();
      requestAnimationFrame(frame);
    });
    btnPaso.addEventListener('click', function () {
      if (!orden.length) return;
      corriendo = false;
      if (hechas() >= orden.length) { t = 0; buf = []; }
      else { t = (hechas() + 1) * NTAD; registrar(); }
      pintarBufs();
    });
    btnReini.addEventListener('click', reiniciar);

    el.querySelector('.sadc-pines').addEventListener('change', function (e) {
      var c = e.target;
      if (!c.classList.contains('sadc-pin-chk')) return;
      var an = +c.getAttribute('data-an');
      if (c.checked) pines |= (1 << an); else pines &= ~(1 << an);
      recalcular();
    });
    el.querySelector('.sadc-pines').addEventListener('input', function (e) {
      var s = e.target;
      if (!s.classList.contains('sadc-pin-v')) return;
      vs[+s.getAttribute('data-an')] = parseFloat(s.value);
      pintarPines();
    });

    recalcular();
  }

  MPI.componentes['sim-adc-dspic'] = function (el, cfg) {
    cfg = cfg || {};
    if (cfg.modo === 'escaneo') modoEscaneo(el, cfg);
    else modoSimple(el, cfg);
  };
})();
