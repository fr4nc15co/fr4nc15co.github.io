/*
 * Componente "sim-timer-dspic": Timer 1 del dsPIC33FJ32MC202 (tema 4, cap. 5).
 *
 * Dos modos (data-config):
 *
 *  a) Directo (por defecto):
 *     {"fcy":40000000,"tckps":3,"pr":65535,"led":"RB12",
 *      "ejemplos":[{"tckps":3,"pr":65535},{"tckps":0,"pr":40000},{"tckps":1,"pr":247}]}
 *     FCY (solo 40 000 000 Hz aprox. o 39 613 750 Hz exacto), TCKPS y PR1 →
 *     tiempo por cuenta, periodo (fórmula del libro t = PR·presc/FCY y, en
 *     pequeño, la del datasheet (PR+1)·presc/FCY), frecuencia de T1IF, T1CON
 *     en hex y código C de inicialización. Animación del diente de sierra de
 *     TMR1, del flag T1IF y del LED (programa por polling del ejemplo 5.7:
 *     PORTB ^= 0x1000; LED activo a nivel bajo).
 *
 *  b) Inverso: {"modo":"inverso","t":0.2,"fcy":40000000}
 *     Tiempo deseado → PR = t·FCY/presc para cada TCKPS, si cabe en 16 bits y
 *     el error de redondeo; destaca el menor pre-escalado válido.
 *
 * Comportamiento del hardware (datasheet, 11.0 Timer1): TMR1 cuenta hasta
 * coincidir con PR1; entonces vuelve a 0 y se pone a 1 T1IF. Por eso el
 * periodo exacto es (PR1+1) cuentas; el libro usa PR1 cuentas (diferencia
 * despreciable para PR grandes).
 */
window.MPI = window.MPI || {};
MPI.componentes = MPI.componentes || {};

(function () {
  var FCY_APROX = 40000000;
  var FCY_EXACTO = 39613750;
  var PRESC = [1, 8, 64, 256];
  var NBSP = ' ';

  // ---------- Formato español ----------
  function agrupar(entero) {
    var s = String(entero);
    var neg = s.charAt(0) === '-';
    if (neg) s = s.slice(1);
    if (s.length >= 5) s = s.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
    return (neg ? '−' : '') + s;
  }
  // x con n cifras significativas, coma decimal, sin ceros finales.
  function sig(x, n) {
    if (!isFinite(x)) return '—';
    if (x === 0) return '0';
    var d = Math.max(0, n - 1 - Math.floor(Math.log(Math.abs(x)) / Math.LN10));
    var s = Math.abs(x).toFixed(Math.min(d, 12));
    if (s.indexOf('.') >= 0) s = s.replace(/0+$/, '').replace(/\.$/, '');
    var p = s.split('.');
    return (x < 0 ? '−' : '') + agrupar(p[0]) + (p[1] ? ',' + p[1] : '');
  }
  // x con como mucho 'dec' decimales (sin ceros finales).
  function dec(x, nd) {
    var s = Math.abs(x).toFixed(nd);
    if (s.indexOf('.') >= 0) s = s.replace(/0+$/, '').replace(/\.$/, '');
    var p = s.split('.');
    return (x < 0 ? '−' : '') + agrupar(p[0]) + (p[1] ? ',' + p[1] : '');
  }
  function fmtT(s, n) {
    n = n || 4;
    var a = Math.abs(s);
    if (a >= 0.1 || a === 0) return sig(s, n) + NBSP + 's';
    if (a >= 1e-3) return sig(s * 1e3, n) + NBSP + 'ms';
    if (a >= 1e-6) return sig(s * 1e6, n) + NBSP + 'µs';
    return sig(s * 1e9, n) + NBSP + 'ns';
  }
  function fmtF(f) {
    if (f >= 1e6) return sig(f / 1e6, 4) + NBSP + 'MHz';
    if (f >= 1e3) return sig(f / 1e3, 4) + NBSP + 'kHz';
    return sig(f, 4) + NBSP + 'Hz';
  }
  function hex4(v) {
    var s = (v >>> 0).toString(16).toUpperCase();
    while (s.length < 4) s = '0' + s;
    return '0x' + s;
  }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  function normFcy(v) {
    v = Number(v);
    if (Math.abs(v - FCY_EXACTO) < 1000) return FCY_EXACTO;
    return FCY_APROX;
  }
  function selectFcy(clase, valor) {
    return '<label>F<sub>CY</sub> ' +
      '<select class="' + clase + '" aria-label="Frecuencia de instrucción FCY">' +
        '<option value="' + FCY_APROX + '"' + (valor === FCY_APROX ? ' selected' : '') + '>40' + NBSP + '000' + NBSP + '000 Hz (aproximado)</option>' +
        '<option value="' + FCY_EXACTO + '"' + (valor === FCY_EXACTO ? ' selected' : '') + '>39' + NBSP + '613' + NBSP + '750 Hz (exacto)</option>' +
      '</select></label>';
  }

  // Pinta un bloque de código C y lo resalta con el resaltador de la web.
  function pintarCodigo(pre, texto) {
    pre.innerHTML = '<code class="lang-c"></code>';
    pre.firstChild.textContent = texto;
    if (MPI.resaltarTodo) MPI.resaltarTodo(pre);
  }

  function codigoInit(pr, tckps, prHex) {
    var prTxt = prHex ? hex4(pr) : String(pr);
    var t1con = 0x8000 | (tckps << 4);
    return 'TMR1 = 0;               // cuenta desde 0\n' +
      'PR1 = ' + prTxt + ';' + new Array(Math.max(1, 18 - prTxt.length)).join(' ') + '// final de cuenta\n' +
      'IFS0bits.T1IF = 0;      // borra el flag\n' +
      'T1CON = ' + hex4(t1con) + ';         // TON = 1, TCKPS = ' + tckps + ' (1:' + PRESC[tckps] + ')';
  }

  // Lee PR en decimal o hex (0x…, o con letras A-F). Devuelve {v, hex} o null.
  function leerPR(txt) {
    var s = String(txt).replace(/[\s  ._]/g, '');
    if (!s) return null;
    var v, h = false;
    if (/^0x[0-9a-f]+$/i.test(s)) { v = parseInt(s.slice(2), 16); h = true; }
    else if (/^[0-9a-f]*[a-f][0-9a-f]*h?$/i.test(s)) { v = parseInt(s.replace(/h$/i, ''), 16); h = true; }
    else if (/^\d+$/.test(s)) v = parseInt(s, 10);
    else return null;
    if (isNaN(v) || v < 0 || v > 65535) return null;
    return { v: v, hex: h };
  }

  var ID = 0;

  // =====================================================================
  //  MODO DIRECTO
  // =====================================================================
  function modoDirecto(el, cfg) {
    var uid = 'stx' + (++ID);
    var fcy = normFcy(cfg.fcy != null ? cfg.fcy : FCY_APROX);
    var tckps = (cfg.tckps >= 0 && cfg.tckps <= 3) ? (cfg.tckps | 0) : 3;
    var pr0 = leerPR(cfg.pr != null ? cfg.pr : 65535) || { v: 65535, hex: false };
    var pr = pr0.v;
    var prHex = pr0.hex || pr === 65535;
    var led = /^RB(\d{1,2})$/i.test(cfg.led || '') ? cfg.led.toUpperCase() : 'RB12';
    var ledBit = parseInt(led.slice(2), 10);
    if (ledBit > 15) { ledBit = 12; led = 'RB12'; }
    var ledMask = 1 << ledBit;
    // PicTrainer (esquemático, fig. 126): D6 = RB15, D7 = RB14, D8 = RB13, D9 = RB12.
    var ledNombre = (ledBit >= 12 && ledBit <= 15) ? 'D' + (21 - ledBit) : 'LED';
    // Bit tras PORTB = 0xEFFF y la primera conmutación del bucle.
    var bitIni = ((0xEFFF >> ledBit) & 1) ^ 1;
    var ejemplos = Array.isArray(cfg.ejemplos) ? cfg.ejemplos : [
      { tckps: 3, pr: 65535 }, { tckps: 0, pr: 40000 }, { tckps: 1, pr: 247 }];
    var reducido = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    var opcT = '';
    for (var i = 0; i < 4; i++) {
      opcT += '<option value="' + i + '"' + (i === tckps ? ' selected' : '') + '>' + i + ' — 1:' + PRESC[i] + '</option>';
    }
    var botEj = '';
    ejemplos.forEach(function (e, k) {
      var p = leerPR(e.pr);
      if (!p || !(e.tckps >= 0 && e.tckps <= 3)) return;
      var txt = (p.v === 65535 || p.hex) ? hex4(p.v) : agrupar(p.v);
      botEj += '<button type="button" class="stx-ej" data-k="' + k + '" aria-pressed="false">PR1 = ' + txt + ' · 1:' + PRESC[e.tckps] + '</button>';
    });

    el.classList.add('mpi-sim-timer-dspic', 'mpi-sim-timer');
    el.innerHTML =
      '<div class="mpi-sim-cab">Timer 1 · TMR1 cuenta hasta PR1 <span class="stx-cab-sub">simulador</span></div>' +
      '<div class="st-form">' +
        '<div class="st-fila">' +
          selectFcy('stx-fcy', fcy) +
          '<label>TCKPS <select class="stx-tckps" aria-label="Pre-escalado TCKPS">' + opcT + '</select></label>' +
          '<label for="' + uid + '-pr">PR1 <input id="' + uid + '-pr" class="stx-pr" type="text" inputmode="text" spellcheck="false" autocomplete="off" ' +
            'aria-describedby="' + uid + '-prerr" value="' + (prHex ? hex4(pr) : pr) + '"></label>' +
        '</div>' +
        '<p class="stx-ayuda">PR1 en decimal (40000) o en hexadecimal (0xFFFF), de 0 a 65' + NBSP + '535.</p>' +
        '<p class="stx-err" id="' + uid + '-prerr" role="alert"></p>' +
        (botEj ? '<div class="stx-ejemplos" role="group" aria-label="Ejemplos del libro"><span class="stx-ej-tit">Ejemplos del libro:</span>' + botEj + '</div>' : '') +
      '</div>' +
      '<div class="stx-scroll"><table class="st-tabla stx-tabla"><tbody></tbody></table></div>' +
      '<pre class="stx-codigo"></pre>' +
      '<div class="stx-anim">' +
        '<div class="stx-anim-ctl">' +
          '<button type="button" class="stx-pausa" aria-pressed="false"></button>' +
          '<label>Velocidad <select class="stx-vel" aria-label="Velocidad de la animación">' +
            '<option value="0.25">×0,25</option><option value="0.5">×0,5</option><option value="1" selected>×1</option>' +
            '<option value="2">×2</option><option value="4">×4</option></select></label>' +
          '<button type="button" class="stx-reini">Reiniciar (TMR1 = 0)</button>' +
          '<span class="stx-escala"></span>' +
        '</div>' +
        '<canvas class="stx-canvas" role="img"></canvas>' +
        '<div class="stx-estado">' +
          '<div class="stx-led-caja"><span class="stx-led" aria-hidden="true"></span>' +
            '<span class="stx-led-txt"></span></div>' +
          '<div class="stx-vals">' +
            '<div>TMR1 = <b class="stx-v-tmr"></b></div>' +
            '<div>T1IF = <b class="stx-v-if"></b></div>' +
            '<div>PORTB = <b class="stx-v-portb"></b></div>' +
          '</div>' +
          '<div class="stx-prog"></div>' +
        '</div>' +
        '<p class="stx-nota">Programa del ejemplo 4.6: <code>PORTB ^= 0x' + ledMask.toString(16).toUpperCase() +
          ';</code> y espera en <code>while (IFS0bits.T1IF == 0);</code>. En el micro la reacción al flag dura unos pocos ciclos; ' +
          'aquí se alarga para que se vea el pulso de T1IF. ' + ledNombre + ' (' + led + ') es activo a nivel bajo: luce cuando el bit vale 0.</p>' +
      '</div>';

    var q = function (s) { return el.querySelector(s); };
    var selFcy = q('.stx-fcy'), selT = q('.stx-tckps'), inPR = q('.stx-pr'), errP = q('.stx-err');
    var tbody = q('.stx-tabla tbody'), preCod = q('.stx-codigo');
    var btnPausa = q('.stx-pausa'), selVel = q('.stx-vel'), btnReini = q('.stx-reini');
    var spanEsc = q('.stx-escala'), canvas = q('.stx-canvas');
    var ledEl = q('.stx-led'), ledTxt = q('.stx-led-txt');
    var vTmr = q('.stx-v-tmr'), vIf = q('.stx-v-if'), vPortb = q('.stx-v-portb'), progEl = q('.stx-prog');

    // ---- estado de la simulación (tiempos en segundos "reales" del micro) ----
    var tSim = 0, pausado = reducido, corriendo = false, ultimo = null, vel = 1;
    var Tc, Tp, escala, d;   // tiempo por cuenta, periodo hardware, escala base, retardo visible del flag
    var colores = null;
    var cacheTxt = {};

    function setTxt(nodo, clave, txt) {
      if (cacheTxt[clave] === txt) return;
      cacheTxt[clave] = txt;
      nodo.textContent = txt;
    }

    function leerColores() {
      var cs = getComputedStyle(el);
      function v(n, def) { var x = cs.getPropertyValue(n).trim(); return x || def; }
      colores = {
        fondo: v('--bg', '#1e1e1e'), borde: v('--borde', '#3c3c3c'), txt: v('--txt', '#d4d4d4'),
        tenue: v('--txt-tenue', '#6a737d'), acento: v('--acento', '#4ec9b0'), acento2: v('--acento-2', '#569cd6'),
        amarillo: v('--amarillo', '#dcdcaa'), rojo: v('--rojo', '#f48771'), mono: v('--mono', 'monospace')
      };
    }

    function calcular() {
      var presc = PRESC[tckps];
      Tc = presc / fcy;
      Tp = (pr + 1) * Tc;
      var tLibro = pr * Tc;
      var t1con = 0x8000 | (tckps << 4);
      var prTxt = agrupar(pr);
      var fcyTxt = agrupar(fcy) + NBSP + 'Hz';
      var filas = '';
      filas += '<tr><th scope="row">Pre-escalado</th><td><b>1:' + presc + '</b> (TCKPS = ' + tckps + ' = <code>' +
        ((tckps >> 1) & 1) + (tckps & 1) + '</code>)</td></tr>';
      filas += '<tr><th scope="row">Tiempo por cuenta</th><td><b>' + fmtT(Tc) + '</b> <span class="stx-calc">= ' + presc + ' / ' + fcyTxt + '</span></td></tr>';
      if (pr === 0) {
        filas += '<tr><th scope="row">Periodo de T1IF</th><td><span class="st-aviso">Con PR1 = 0 la fórmula del libro da 0: el timer no llega a contar.</span><br>' +
          '<span class="st-exacto">Datasheet: (PR1+1)·presc/F<sub>CY</sub> = ' + fmtT(Tp) + '</span></td></tr>';
        filas += '<tr><th scope="row">Frecuencia de T1IF</th><td><span class="stx-calc">(datasheet) ' + fmtF(1 / Tp) + '</span></td></tr>';
      } else {
        filas += '<tr><th scope="row">Periodo de T1IF</th><td><b>' + fmtT(tLibro) + '</b> <span class="stx-calc">= ' + prTxt + ' · ' + presc + ' / ' + fcyTxt + '</span><br>' +
          '<span class="st-exacto">Datasheet, (PR1+1)·presc/F<sub>CY</sub> = ' + fmtT(Tp, 5) + '</span></td></tr>';
        filas += '<tr><th scope="row">Frecuencia de T1IF</th><td><b>' + fmtF(1 / tLibro) + '</b> <span class="stx-calc">= 1 / t</span></td></tr>';
        filas += '<tr><th scope="row">LED ' + ledNombre + ' (' + led + ')</th><td>conmuta cada ' + fmtT(tLibro) + ' → parpadea con periodo ' + fmtT(2 * tLibro) + '</td></tr>';
      }
      filas += '<tr><th scope="row">T1CON</th><td><b>' + hex4(t1con) + '</b> <span class="stx-calc">= 0x8000 | (' + tckps + ' &lt;&lt; 4): TON = 1, TCKPS = ' + tckps + '</span></td></tr>';
      tbody.innerHTML = filas;
      pintarCodigo(preCod, codigoInit(pr, tckps, prHex));

      // Escala de tiempo: tiempo real si el periodo es visible (≥ 0,25 s);
      // si no, cámara lenta para que un periodo dure ~1 s en pantalla.
      escala = Tp >= 0.25 ? 1 : Tp / 1.0;
      actualizarEscala();
      canvas.setAttribute('aria-label', 'Cronograma: TMR1 sube en diente de sierra de 0 a ' + prTxt +
        ' cada ' + fmtT(Tp) + '; en cada final de cuenta T1IF se pone a 1, el programa lo borra y conmuta ' + led + '.');
      // marcar ejemplo activo
      var bs = el.querySelectorAll('.stx-ej');
      for (var i = 0; i < bs.length; i++) {
        var e = ejemplos[+bs[i].getAttribute('data-k')];
        var p = leerPR(e.pr);
        bs[i].setAttribute('aria-pressed', String(p && p.v === pr && e.tckps === tckps));
      }
    }

    function escalaEf() { return escala * vel; }

    function actualizarEscala() {
      var e = escalaEf();
      var txt;
      if (Math.abs(e - 1) < 1e-12) txt = 'Tiempo real';
      else txt = '1 s en pantalla = ' + fmtT(e, 3) + ' del micro';
      spanEsc.textContent = txt;
    }

    function reiniciar() {
      tSim = 0;
      cacheTxt = {};
      dibujar();
    }

    // ---- modelo analítico del programa por polling ----
    function retardo() { return Math.min(0.07 * escalaEf(), 0.12 * Tp); }
    function valorTMR(t) { return Math.floor(t / Tc + 1e-7) % (pr + 1); }
    function flag(t) {
      var k = Math.floor(t / Tp);
      return k >= 1 && (t - k * Tp) < d;
    }
    function nConmut(t) { return Math.max(0, Math.floor((t - d) / Tp)); }
    // Tras PORTB = 0xEFFF y la primera conmutación, RB12 vale 1 (LED apagado).
    function bitLed(t) { return bitIni ^ (nConmut(t) % 2); }

    function ajustarCanvas() {
      var w = canvas.clientWidth || 300;
      var h = w < 480 ? 170 : 200;
      var dpr = window.devicePixelRatio || 1;
      var W = Math.round(w * dpr), H = Math.round(h * dpr);
      if (canvas.width !== W || canvas.height !== H) {
        canvas.width = W; canvas.height = H;
        canvas.style.height = h + 'px';
        leerColores();
      }
      return { w: w, h: h, dpr: dpr };
    }

    function dibujar() {
      if (!colores) leerColores();
      d = retardo();
      var dim = ajustarCanvas();
      var ctx = canvas.getContext('2d');
      if (!ctx) return;
      var w = dim.w, h = dim.h;
      ctx.setTransform(dim.dpr, 0, 0, dim.dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      var izq = 54, der = 8;
      var anchoG = Math.max(40, w - izq - der);
      var yTop = 14, hSaw = h - 104, yIfB = yTop + hSaw + 30, yLedB = yIfB + 34, hDig = 16;
      var Wt = 2.5 * Tp;
      var t0 = tSim - Wt;
      ctx.font = '11px ' + colores.mono;
      ctx.textBaseline = 'middle';

      // Ejes y etiquetas
      ctx.strokeStyle = colores.borde; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(izq, yTop); ctx.lineTo(izq, yLedB + 2);
      ctx.moveTo(izq, yTop + hSaw); ctx.lineTo(izq + anchoG, yTop + hSaw);
      ctx.stroke();
      ctx.fillStyle = colores.tenue;
      ctx.textAlign = 'right';
      ctx.fillText('TMR1', izq - 6, yTop + hSaw / 2);
      ctx.fillText('T1IF', izq - 6, yIfB - hDig / 2);
      ctx.fillText(led, izq - 6, yLedB - hDig / 2);

      // Línea de PR1
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = colores.amarillo;
      ctx.beginPath(); ctx.moveTo(izq, yTop); ctx.lineTo(izq + anchoG, yTop); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = colores.amarillo;
      ctx.textAlign = 'right';
      ctx.fillText('PR1 = ' + agrupar(pr), izq + anchoG, yTop - 7 < 6 ? 6 : yTop - 7);

      // Marcas de final de cuenta (k·Tp)
      ctx.strokeStyle = colores.borde;
      ctx.setLineDash([2, 4]);
      var kIni = Math.max(1, Math.ceil(t0 / Tp));
      for (var k = kIni; k * Tp <= tSim; k++) {
        var xk = izq + (k * Tp - t0) / Wt * anchoG;
        ctx.beginPath(); ctx.moveTo(xk, yTop); ctx.lineTo(xk, yLedB); ctx.stroke();
      }
      ctx.setLineDash([]);

      // Diente de sierra + señales digitales, muestreando por píxel
      var n = Math.ceil(anchoG);
      function traza(fy, color, lw) {
        ctx.strokeStyle = color; ctx.lineWidth = lw;
        ctx.beginPath();
        var empezado = false, yPrev = null;
        for (var px = 0; px <= n; px++) {
          var t = t0 + px / n * Wt;
          if (t < 0) continue;
          var y = fy(t);
          var x = izq + px;
          if (!empezado) { ctx.moveTo(x, y); empezado = true; }
          else { if (yPrev !== y) ctx.lineTo(x, yPrev); ctx.lineTo(x, y); }
          yPrev = y;
        }
        ctx.stroke();
      }
      traza(function (t) { return yTop + hSaw - valorTMR(t) / (pr || 1) * hSaw; }, colores.acento, 2);
      traza(function (t) { return flag(t) ? yIfB - hDig : yIfB; }, colores.rojo, 2);
      traza(function (t) { return bitLed(t) ? yLedB - hDig : yLedB; }, colores.acento2, 2);

      // Punto "ahora"
      var vNow = valorTMR(tSim);
      ctx.fillStyle = colores.acento;
      ctx.beginPath();
      ctx.arc(izq + anchoG, yTop + hSaw - vNow / (pr || 1) * hSaw, 3.5, 0, 2 * Math.PI);
      ctx.fill();

      // Leyenda temporal
      ctx.fillStyle = colores.tenue;
      ctx.textAlign = 'left';
      ctx.fillText('ventana = ' + fmtT(Wt, 3) + ' (2,5 periodos)', izq + 4, h - 8);

      // Estado textual
      var fl = flag(tSim);
      var bit = bitLed(tSim);
      var portb = (bit ? (0xEFFF | ledMask) : (0xEFFF & ~ledMask)) & 0xFFFF;
      setTxt(vTmr, 'tmr', agrupar(vNow) + ' (' + hex4(vNow) + ')');
      setTxt(vIf, 'if', fl ? '1' : '0');
      vIf.classList.toggle('stx-on', fl);
      setTxt(vPortb, 'pb', hex4(portb));
      ledEl.classList.toggle('stx-encendido', bit === 0);
      setTxt(ledTxt, 'led', ledNombre + ' (' + led + ' = ' + bit + '): ' + (bit === 0 ? 'encendido' : 'apagado'));
      setTxt(progEl, 'prog', fl
        ? 'T1IF = 1 → el programa sale del while, hace IFS0bits.T1IF = 0 y conmuta ' + led + '.'
        : 'Programa esperando en while (IFS0bits.T1IF == 0);');
      progEl.classList.toggle('stx-prog-activo', fl);
    }

    function frame(ts) {
      if (!document.body.contains(el)) { corriendo = false; return; }
      if (pausado) { corriendo = false; ultimo = null; return; }
      if (ultimo == null) ultimo = ts;
      var dt = Math.min(0.1, Math.max(0, (ts - ultimo) / 1000));
      ultimo = ts;
      tSim += dt * escalaEf();
      if (tSim > 1000 * Tp) tSim -= 2 * Tp * Math.floor((tSim - 10 * Tp) / (2 * Tp));
      dibujar();
      requestAnimationFrame(frame);
    }
    function arrancar() {
      if (corriendo || pausado) return;
      corriendo = true; ultimo = null;
      requestAnimationFrame(frame);
    }
    function pintarPausa() {
      btnPausa.textContent = pausado ? '▶ Seguir' : '⏸ Pausa';
      btnPausa.setAttribute('aria-pressed', String(pausado));
      btnPausa.setAttribute('aria-label', pausado ? 'Reanudar la animación' : 'Pausar la animación');
    }

    // ---- eventos ----
    function aplicar() {
      calcular();
      reiniciar();
    }
    selFcy.addEventListener('change', function () { fcy = normFcy(selFcy.value); aplicar(); });
    selT.addEventListener('change', function () { tckps = +selT.value; aplicar(); });
    function leerInput() {
      var p = leerPR(inPR.value);
      if (!p) {
        errP.textContent = 'Valor no válido: escribe un número entre 0 y 65 535 (o 0x0000 a 0xFFFF).';
        inPR.setAttribute('aria-invalid', 'true');
        return;
      }
      errP.textContent = '';
      inPR.removeAttribute('aria-invalid');
      if (p.v === pr && p.hex === prHex) return;
      pr = p.v; prHex = p.hex;
      aplicar();
    }
    inPR.addEventListener('change', leerInput);
    inPR.addEventListener('keydown', function (e) { if (e.key === 'Enter') leerInput(); });
    el.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('.stx-ej') : null;
      if (!b || !el.contains(b)) return;
      var ej = ejemplos[+b.getAttribute('data-k')];
      var p = leerPR(ej.pr);
      tckps = ej.tckps | 0; pr = p.v; prHex = p.hex || p.v === 65535;
      selT.value = String(tckps);
      inPR.value = prHex ? hex4(pr) : String(pr);
      errP.textContent = ''; inPR.removeAttribute('aria-invalid');
      aplicar();
    });
    btnPausa.addEventListener('click', function () {
      pausado = !pausado;
      pintarPausa();
      if (!pausado) arrancar();
    });
    selVel.addEventListener('change', function () { vel = parseFloat(selVel.value) || 1; actualizarEscala(); if (pausado) dibujar(); });
    btnReini.addEventListener('click', reiniciar);
    window.addEventListener('resize', function () { if (document.body.contains(el) && pausado) dibujar(); });

    pintarPausa();
    calcular();
    dibujar();
    arrancar();
  }

  // =====================================================================
  //  MODO INVERSO
  // =====================================================================
  function modoInverso(el, cfg) {
    var uid = 'stx' + (++ID);
    var fcy = normFcy(cfg.fcy != null ? cfg.fcy : FCY_APROX);
    var t = Number(cfg.t) > 0 ? Number(cfg.t) : 0.2;
    var unidad = t >= 0.1 ? 1 : (t >= 1e-4 ? 1e-3 : 1e-6);
    var valIni = dec(t / unidad, 6).replace(/ /g, '');

    el.classList.add('mpi-sim-timer-dspic', 'mpi-sim-timer', 'stx-inverso');
    el.innerHTML =
      '<div class="mpi-sim-cab">Timer 1 · del tiempo deseado a TCKPS y PR1 <span class="stx-cab-sub">modo inverso</span></div>' +
      '<div class="st-form">' +
        '<div class="st-fila">' +
          '<label for="' + uid + '-t">Tiempo deseado <input id="' + uid + '-t" class="stx-t" type="text" inputmode="decimal" spellcheck="false" autocomplete="off" ' +
            'aria-describedby="' + uid + '-terr" value="' + valIni + '"></label>' +
          '<select class="stx-uni" aria-label="Unidad del tiempo">' +
            '<option value="1"' + (unidad === 1 ? ' selected' : '') + '>s</option>' +
            '<option value="0.001"' + (unidad === 1e-3 ? ' selected' : '') + '>ms</option>' +
            '<option value="0.000001"' + (unidad === 1e-6 ? ' selected' : '') + '>µs</option></select>' +
          selectFcy('stx-fcy', fcy) +
        '</div>' +
        '<p class="stx-err" id="' + uid + '-terr" role="alert"></p>' +
      '</div>' +
      '<p class="stx-formula">PR1 = t · F<sub>CY</sub> / presc &nbsp;(fórmula del libro), y debe caber en 16 bits: PR1 ≤ 65' + NBSP + '535.</p>' +
      '<div class="stx-scroll"><table class="stx-inv"><thead><tr>' +
        '<th scope="col">TCKPS</th><th scope="col">Presc.</th><th scope="col">PR = t·F<sub>CY</sub>/presc</th>' +
        '<th scope="col">¿Cabe?</th><th scope="col">PR1 (redondeado)</th><th scope="col">t obtenido</th><th scope="col">Error</th>' +
      '</tr></thead><tbody></tbody></table></div>' +
      '<div class="stx-veredicto" aria-live="polite"></div>' +
      '<pre class="stx-codigo"></pre>';

    var q = function (s) { return el.querySelector(s); };
    var inT = q('.stx-t'), selU = q('.stx-uni'), selFcy = q('.stx-fcy'), errP = q('.stx-err');
    var tbody = q('.stx-inv tbody'), ver = q('.stx-veredicto'), preCod = q('.stx-codigo');

    function calcular() {
      var filas = '', mejor = -1, datos = [];
      for (var i = 0; i < 4; i++) {
        var presc = PRESC[i];
        var exacto = t * fcy / presc;
        var redon = Math.round(exacto);
        var cabe = redon <= 65535 && redon >= 1;
        var tObt = redon * presc / fcy;
        var err = (tObt - t) / t * 100;
        datos.push({ presc: presc, exacto: exacto, redon: redon, cabe: cabe, tObt: tObt, err: err, grande: redon > 65535 });
        if (cabe && mejor < 0) mejor = i;
      }
      datos.forEach(function (r, i) {
        var exTxt = Math.abs(r.exacto - Math.round(r.exacto)) < 1e-9 ? agrupar(Math.round(r.exacto)) : dec(r.exacto, 2);
        var cabeTxt = r.cabe ? '<span class="stx-si">sí</span>' : (r.grande ? '<span class="stx-no">no (&gt; 65' + NBSP + '535)</span>' : '<span class="stx-no">no (PR = 0)</span>');
        var errTxt;
        if (!r.cabe) errTxt = '—';
        else if (Math.abs(r.err) < 1e-9) errTxt = '0 %';
        else errTxt = (r.err > 0 ? '+' : '') + sig(r.err, 3) + NBSP + '%';
        filas += '<tr class="' + (i === mejor ? 'stx-mejor' : (r.cabe ? '' : 'stx-nocabe')) + '">' +
          '<td>' + i + '</td><td>1:' + r.presc + '</td><td>' + exTxt + '</td><td>' + cabeTxt + '</td>' +
          '<td>' + (r.cabe ? agrupar(r.redon) : '—') + '</td>' +
          '<td>' + (r.cabe ? fmtT(r.tObt, 5) : '—') + '</td>' +
          '<td>' + errTxt + (i === mejor ? ' <span class="stx-marca">◀ menor válido</span>' : '') + '</td></tr>';
      });
      tbody.innerHTML = filas;

      if (mejor >= 0) {
        var r = datos[mejor];
        var t1con = 0x8000 | (mejor << 4);
        ver.innerHTML = 'Menor pre-escalado válido: <b>1:' + r.presc + '</b> → <b>TCKPS = ' + mejor + '</b>, ' +
          '<b>PR1 = ' + agrupar(r.redon) + '</b>, <b>T1CON = ' + hex4(t1con) + '</b>.' +
          '<span class="stx-calc"> El menor pre-escalado da la mayor resolución (' + fmtT(r.presc / fcy) + ' por cuenta).' +
          ' Según el datasheet el periodo real es (PR1+1) cuentas = ' + fmtT((r.redon + 1) * r.presc / fcy, 5) +
          '; para clavarlo habría que cargar PR1 = ' + agrupar(r.redon - 1) + '.</span>';
        preCod.style.display = '';
        pintarCodigo(preCod, codigoInit(r.redon, mejor, false));
      } else {
        var tMax = 65535 * 256 / fcy;
        var demasiadoCorto = datos[0].redon < 1;
        ver.innerHTML = demasiadoCorto
          ? '<span class="st-aviso">Tiempo demasiado corto: ni con 1:1 llega a una cuenta (' + fmtT(1 / fcy) + ').</span>'
          : '<span class="st-aviso">No cabe en 16 bits con ningún pre-escalado: el máximo con 1:256 es 65' + NBSP + '535 · 256 / F<sub>CY</sub> = ' +
            fmtT(tMax) + '. Habría que contar varios finales de cuenta por software (como el calendario del apartado 4.6).</span>';
        preCod.style.display = 'none';
      }
    }

    function leer() {
      var s = String(inT.value).replace(/[\s  ]/g, '').replace(',', '.');
      var v = parseFloat(s);
      if (!/^\d*\.?\d+(e-?\d+)?$/i.test(s) || !(v > 0)) {
        errP.textContent = 'Escribe un tiempo positivo (p. ej. 0,2).';
        inT.setAttribute('aria-invalid', 'true');
        return;
      }
      errP.textContent = '';
      inT.removeAttribute('aria-invalid');
      t = v * parseFloat(selU.value);
      calcular();
    }
    inT.addEventListener('input', leer);
    selU.addEventListener('change', leer);
    selFcy.addEventListener('change', function () { fcy = normFcy(selFcy.value); calcular(); });

    calcular();
  }

  MPI.componentes['sim-timer-dspic'] = function (el, cfg) {
    cfg = cfg || {};
    if (cfg.modo === 'inverso') modoInverso(el, cfg);
    else modoDirecto(el, cfg);
  };
})();
