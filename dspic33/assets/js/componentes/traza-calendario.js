/*
 * Componente "traza-calendario": calendario por interrupción del Timer 1
 * (libro, ejemplo 5.8 / figura 42).
 *
 * Uso: <div class="mpi-mount" data-componente="traza-calendario"
 *           data-config='{"pr":40000,"tickMs":1}'></div>
 *
 * _T1Interrupt salta cada PR1·presc/FCY (40 000 · 25 ns = 1 ms): ticks++;
 * cada 1000 ticks sec++ (60 → min++, 60 → hour++, 24 → 0).
 * El main escribe sin parar:
 *   if (PORTB & 0x4) PORTB = ~(sec << 10); else PORTB = ~(min << 12);
 * SW2 está en RB2 con pull-up (suelto = 1, pulsado = 0).
 * LEDs de la PicTrainer, activos a nivel bajo (lucen con el bit a 0):
 *   D6 = RB15, D7 = RB14, D8 = RB13, D9 = RB12 (esquemático, fig. 126).
 * Comprobación: sec = 4, RB2 = 1 → PORTB = ~0x1000 = 0xEFFF → solo D9 (RB12).
 */
window.MPI = window.MPI || {};
MPI.componentes = MPI.componentes || {};

(function () {
  var NBSP = ' ';

  function agrupar(n) {
    var s = String(n);
    if (s.length >= 5) s = s.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
    return s;
  }
  function dec(x, nd) {
    var s = x.toFixed(nd);
    if (s.indexOf('.') >= 0) s = s.replace(/0+$/, '').replace(/\.$/, '');
    var p = s.split('.');
    return agrupar(p[0]) + (p[1] ? ',' + p[1] : '');
  }
  function fmtMs(ms) {
    if (ms >= 1000) return dec(ms / 1000, 4) + NBSP + 's';
    if (ms >= 1) return dec(ms, 4) + NBSP + 'ms';
    return dec(ms * 1000, 3) + NBSP + 'µs';
  }
  function hex4(v) {
    var s = (v & 0xFFFF).toString(16).toUpperCase();
    while (s.length < 4) s = '0' + s;
    return '0x' + s;
  }
  function bin(v, n) {
    var s = (v >>> 0).toString(2);
    while (s.length < n) s = '0' + s;
    return s;
  }
  function dos(n) { return (n < 10 ? '0' : '') + n; }

  var COD_MAIN =
    '#include "config.h"\n' +
    '\n' +
    'int sec = 0, min = 0, hour = 0, ticks = 0;    // globales: comunican la ISR con el main\n' +
    '\n' +
    'int main(void) {\n' +
    '    InicializarReloj();         // F_CY = 40 MHz\n' +
    '    AD1PCFGL = 0xFFFF;          // todos los pines en digital (RB2 = AN4)\n' +
    '    PORTB = 0x0FFF;\n' +
    '    TRISB = 0x0FFF;             // LEDs como salidas\n' +
    '    TMR1 = 0;\n' +
    '    PR1 = 40000;                // termina en 40000 cuentas\n' +
    '    IFS0bits.T1IF = 0;\n' +
    '    IEC0bits.T1IE = 1;          // se habilitan interrupciones\n' +
    '    T1CON = 0x8000;             // pre-escalado 0 y ON -> 1 ms\n' +
    '    while (1) {\n' +
    '        if (PORTB & 0x4)                // RB2 = 1 (sin pulsar): segundos\n' +
    '            PORTB = ~(sec << 10);\n' +
    '        else                            // RB2 = 0 (pulsado): minutos\n' +
    '            PORTB = ~(min << 12);\n' +
    '    }\n' +
    '    return 0;\n' +
    '}';

  var COD_ISR =
    'void __attribute__((interrupt, no_auto_psv)) _T1Interrupt(void) {\n' +
    '    IFS0bits.T1IF = 0;          // limpieza del flag\n' +
    '    ticks++;\n' +
    '    if (ticks == 1000) {        // 1000 ticks de 1 ms = 1 s\n' +
    '        ticks = 0;\n' +
    '        sec++;\n' +
    '        if (sec == 60) {\n' +
    '            sec = 0;\n' +
    '            min++;\n' +
    '            if (min == 60) {\n' +
    '                min = 0;\n' +
    '                hour++;\n' +
    '                if (hour == 24)\n' +
    '                    hour = 0;\n' +
    '            }\n' +
    '        }\n' +
    '    }\n' +
    '}';

  // Pinta el código resaltado y envuelve cada línea en un <span> para poder
  // marcar líneas (el resaltador no genera spans que crucen saltos de línea).
  function pintarCodigo(pre, texto) {
    pre.innerHTML = '<code class="lang-c"></code>';
    var code = pre.firstChild;
    code.textContent = texto;
    if (MPI.resaltarTodo) MPI.resaltarTodo(pre);
    var lineas = code.innerHTML.split('\n');
    code.innerHTML = lineas.map(function (l, i) {
      return '<span class="tc-ln" data-i="' + i + '">' + (l || ' ') + '</span>';
    }).join('');
    var textos = texto.split('\n');
    return function (sub) {   // devuelve el <span> de la primera línea que contiene 'sub'
      for (var i = 0; i < textos.length; i++) if (textos[i].indexOf(sub) >= 0) return code.children[i];
      return null;
    };
  }

  MPI.componentes['traza-calendario'] = function (el, cfg) {
    cfg = cfg || {};
    var pr = (cfg.pr >= 1 && cfg.pr <= 65535) ? (cfg.pr | 0) : 40000;
    var fcy = Number(cfg.fcy) > 0 ? Number(cfg.fcy) : 40000000;
    var tickMs = Number(cfg.tickMs) > 0 ? Number(cfg.tickMs) : pr / fcy * 1000;

    var ticks = 0, sec = 0, min = 0, hour = 0;
    var rb2 = 1, swHold = false, swFijo = false;
    var vel = 1, pausado = false, corriendo = false, ultimo = null, acum = 0;
    var ev = { sec: -1e9, min: -1e9, hour: -1e9 };  // instante (ms de pantalla) del último evento
    var ahora = 0;

    el.classList.add('mpi-traza-calendario');
    el.innerHTML =
      '<div class="mpi-sim-cab">Calendario por interrupción del Timer 1 <span class="tc-cab-sub">sección 5.4</span></div>' +
      '<p class="tc-sub">PR1 = ' + agrupar(pr) + ', TCKPS = 0 (1:1), T1CON = 0x8000 → <code>_T1Interrupt</code> cada ' +
        agrupar(pr) + ' · 25 ns = <b>' + fmtMs(tickMs) + '</b> (con F<sub>CY</sub> = 40 MHz).</p>' +
      '<div class="tc-contadores">' +
        '<div class="tc-cont"><span class="tc-et">ticks</span><b class="tc-v-ticks">0</b><span class="tc-barra"><span class="tc-barra-in"></span></span></div>' +
        '<div class="tc-cont"><span class="tc-et">sec</span><b class="tc-v-sec">0</b></div>' +
        '<div class="tc-cont"><span class="tc-et">min</span><b class="tc-v-min">0</b></div>' +
        '<div class="tc-cont"><span class="tc-et">hour</span><b class="tc-v-hour">0</b></div>' +
        '<div class="tc-cont tc-reloj"><span class="tc-et">reloj</span><b class="tc-v-reloj">00:00:00</b></div>' +
      '</div>' +
      '<div class="tc-ctl">' +
        '<button type="button" class="tc-pausa" aria-pressed="false">⏸ Pausa</button>' +
        '<span class="tc-vel" role="group" aria-label="Velocidad de la simulación">' +
          '<button type="button" data-v="1" aria-pressed="true">×1</button>' +
          '<button type="button" data-v="10" aria-pressed="false">×10</button>' +
          '<button type="button" data-v="100" aria-pressed="false">×100</button>' +
          '<button type="button" data-v="1000" aria-pressed="false">×1000</button>' +
        '</span>' +
        '<button type="button" class="tc-mas-s">+1 s</button>' +
        '<button type="button" class="tc-mas-m">+1 min</button>' +
        '<button type="button" class="tc-reini">Reiniciar</button>' +
      '</div>' +
      '<div class="tc-io">' +
        '<div class="tc-sw">' +
          '<button type="button" class="tc-sw-btn" aria-pressed="false" aria-describedby="tc-sw-ayuda">SW2</button>' +
          '<div><div class="tc-sw-est"></div>' +
          '<label class="tc-sw-fijo"><input type="checkbox"> mantener SW2 pulsado</label>' +
          '<div class="tc-ayuda">Mantén pulsado el botón (ratón, dedo, Espacio o Intro). Pull-up: suelto → RB2 = 1; pulsado → RB2 = 0.</div></div>' +
        '</div>' +
        '<div class="tc-puerto">' +
          '<div class="tc-expr"></div>' +
          '<div class="tc-bits" aria-hidden="true"></div>' +
          '<div class="tc-leds" role="group" aria-label="LEDs D6 a D9"></div>' +
          '<div class="tc-lectura"></div>' +
        '</div>' +
      '</div>' +
      '<div class="tc-codigos">' +
        '<div><div class="tc-cod-tit">main</div><pre class="tc-cod-main"></pre></div>' +
        '<div><div class="tc-cod-tit">ISR del Timer 1 (cada ' + fmtMs(tickMs) + ')</div><pre class="tc-cod-isr"></pre></div>' +
      '</div>';

    var q = function (s) { return el.querySelector(s); };
    var vT = q('.tc-v-ticks'), vS = q('.tc-v-sec'), vM = q('.tc-v-min'), vH = q('.tc-v-hour'), vR = q('.tc-v-reloj');
    var barra = q('.tc-barra-in');
    var btnPausa = q('.tc-pausa'), grpVel = q('.tc-vel');
    var swBtn = q('.tc-sw-btn'), swEst = q('.tc-sw-est'), swChk = q('.tc-sw-fijo input');
    var expr = q('.tc-expr'), bitsEl = q('.tc-bits'), ledsEl = q('.tc-leds'), lectura = q('.tc-lectura');

    // id único para aria-describedby
    var ayuda = q('.tc-ayuda');
    ayuda.id = 'tc-sw-ayuda-' + Math.random().toString(36).slice(2, 8);
    swBtn.setAttribute('aria-describedby', ayuda.id);

    // LEDs en el orden de los bits (MSB a la izquierda): RB15..RB12 = D6..D9.
    var leds = [];
    for (var b = 15; b >= 12; b--) {
      var d = document.createElement('div');
      d.className = 'tc-led';
      d.setAttribute('role', 'img');
      d.innerHTML = '<span class="tc-led-luz" aria-hidden="true"></span><span class="tc-led-n">D' + (21 - b) + '</span><span class="tc-led-rb">RB' + b + '</span>';
      ledsEl.appendChild(d);
      leds.push({ bit: b, el: d });
    }

    var lnMain = pintarCodigo(q('.tc-cod-main'), COD_MAIN);
    var lnIsr = pintarCodigo(q('.tc-cod-isr'), COD_ISR);
    var L = {
      ifRama: lnMain('if (PORTB & 0x4)'), secRama: lnMain('~(sec << 10)'),
      elseRama: lnMain('else'), minRama: lnMain('~(min << 12)'),
      ticks: [lnIsr('ticks++'), lnIsr('IFS0bits.T1IF = 0')],
      sec: [lnIsr('if (ticks == 1000)'), lnIsr('ticks = 0'), lnIsr('sec++')],
      min: [lnIsr('if (sec == 60)'), lnIsr('sec = 0'), lnIsr('min++')],
      hour: [lnIsr('if (min == 60)'), lnIsr('min = 0'), lnIsr('hour++')]
    };
    function marcar(lineas, on, cls) {
      (Array.isArray(lineas) ? lineas : [lineas]).forEach(function (x) { if (x) x.classList.toggle(cls || 'tc-activa', on); });
    }

    // ---------- modelo ----------
    function sumarHoras(h) { hour = (hour + h) % 24; ev.hour = ahora; }
    function sumarMin(m) {
      var tot = min + m; min = tot % 60;
      var h = Math.floor(tot / 60);
      if (h) sumarHoras(h);
      ev.min = ahora;
    }
    function sumarSeg(s) {
      var tot = sec + s; sec = tot % 60;
      var m = Math.floor(tot / 60);
      if (m) sumarMin(m);
      ev.sec = ahora;
    }
    function sumarTicks(n) {
      var tot = ticks + n; ticks = tot % 1000;
      var s = Math.floor(tot / 1000);
      if (s) sumarSeg(s);
    }

    function portb() {
      return rb2 ? (~(sec << 10)) & 0xFFFF : (~(min << 12)) & 0xFFFF;
    }

    var cache = {};
    function set(nodo, clave, txt, html) {
      if (cache[clave] === txt) return;
      cache[clave] = txt;
      if (html) nodo.innerHTML = txt; else nodo.textContent = txt;
    }

    function pintar() {
      set(vT, 't', String(ticks));
      barra.style.width = (ticks / 10) + '%';
      set(vS, 's', String(sec));
      set(vM, 'm', String(min));
      set(vH, 'h', String(hour));
      set(vR, 'r', dos(hour) + ':' + dos(min) + ':' + dos(sec));

      var pb = portb();
      var dato, desc, mostrado;
      if (rb2) {
        dato = (sec << 10) & 0xFFFF;
        mostrado = (sec >> 2) & 0xF;
        desc = 'RB2 = 1 → <code>PORTB = ~(sec &lt;&lt; 10)</code> = ~' + hex4(dato) + ' = <b>' + hex4(pb) + '</b>';
      } else {
        dato = (min << 12) & 0xFFFF;
        mostrado = min & 0xF;
        desc = 'RB2 = 0 → <code>PORTB = ~(min &lt;&lt; 12)</code> = ~' + hex4(dato) + ' = <b>' + hex4(pb) + '</b>' +
          (min >= 16 ? ' <span class="tc-nota">(los bits de min que pasan del bit 15 se pierden)</span>' : '');
      }
      set(expr, 'expr', desc, true);

      var bh = '';
      for (var b = 15; b >= 0; b--) {
        var v = (pb >> b) & 1;
        var cls = 'tc-bit' + (b >= 12 ? ' tc-bit-led' : '') + (b === 2 ? ' tc-bit-sw' : '');
        bh += '<span class="' + cls + '" title="RB' + b + '"><i>' + b + '</i>' + v + '</span>';
      }
      set(bitsEl, 'bits', bh, true);

      leds.forEach(function (l) {
        var on = ((pb >> l.bit) & 1) === 0;
        l.el.classList.toggle('tc-on', on);
        var lab = 'D' + (21 - l.bit) + ' (RB' + l.bit + ') ' + (on ? 'encendido' : 'apagado');
        if (l.el.getAttribute('aria-label') !== lab) l.el.setAttribute('aria-label', lab);
      });
      set(lectura, 'lect', (rb2 ? 'Los LEDs muestran sec / 4 = ' : 'Los LEDs muestran min mód 16 = ') + mostrado +
        ' = ' + bin(mostrado, 4) + ' en binario (D6 = RB15 … D9 = RB12; luce el que tiene el bit de PORTB a 0).');

      swBtn.classList.toggle('tc-pulsado', !rb2);
      swBtn.setAttribute('aria-pressed', String(!rb2));
      set(swEst, 'sw', rb2 ? 'SW2 suelto → RB2 = 1' : 'SW2 pulsado → RB2 = 0');

      marcar([L.ifRama, L.secRama], !!rb2);
      marcar([L.elseRama, L.minRama], !rb2);
      marcar(L.ticks, !pausado, 'tc-flash');
      marcar(L.sec, ahora - ev.sec < 350, 'tc-flash');
      marcar(L.min, ahora - ev.min < 600, 'tc-flash');
      marcar(L.hour, ahora - ev.hour < 900, 'tc-flash');
    }

    // ---------- bucle ----------
    function frame(ts) {
      if (!document.body.contains(el)) { corriendo = false; return; }
      if (pausado) { corriendo = false; ultimo = null; pintar(); return; }
      if (ultimo == null) ultimo = ts;
      var dt = Math.min(100, Math.max(0, ts - ultimo));   // ms de pantalla
      ultimo = ts;
      ahora += dt;
      acum += dt * vel;                                    // ms simulados
      var n = Math.floor(acum / tickMs);
      if (n > 0) { acum -= n * tickMs; sumarTicks(n); }
      pintar();
      requestAnimationFrame(frame);
    }
    function arrancar() {
      if (corriendo || pausado) return;
      corriendo = true; ultimo = null;
      requestAnimationFrame(frame);
    }

    // ---------- eventos ----------
    btnPausa.addEventListener('click', function () {
      pausado = !pausado;
      btnPausa.textContent = pausado ? '▶ Seguir' : '⏸ Pausa';
      btnPausa.setAttribute('aria-pressed', String(pausado));
      if (pausado) pintar(); else arrancar();
    });
    grpVel.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('button') : null;
      if (!b) return;
      vel = +b.getAttribute('data-v');
      var bs = grpVel.querySelectorAll('button');
      for (var i = 0; i < bs.length; i++) bs[i].setAttribute('aria-pressed', String(bs[i] === b));
    });
    q('.tc-mas-s').addEventListener('click', function () { sumarSeg(1); pintar(); });
    q('.tc-mas-m').addEventListener('click', function () { sumarMin(1); pintar(); });
    q('.tc-reini').addEventListener('click', function () {
      ticks = sec = min = hour = 0; acum = 0;
      ev = { sec: -1e9, min: -1e9, hour: -1e9 };
      pintar();
    });

    function actualizarSW() { rb2 = (swHold || swFijo) ? 0 : 1; pintar(); }
    function pulsar(e) { swHold = true; actualizarSW(); if (e && e.preventDefault && e.type !== 'keydown') e.preventDefault(); }
    function soltar() { if (!swHold) return; swHold = false; actualizarSW(); }
    swBtn.addEventListener('pointerdown', function (e) {
      pulsar(e);
      if (swBtn.setPointerCapture && e.pointerId != null) { try { swBtn.setPointerCapture(e.pointerId); } catch (x) {} }
    });
    swBtn.addEventListener('pointerup', soltar);
    swBtn.addEventListener('pointercancel', soltar);
    swBtn.addEventListener('lostpointercapture', soltar);
    swBtn.addEventListener('keydown', function (e) {
      if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); pulsar(e); }
    });
    swBtn.addEventListener('keyup', function (e) { if (e.key === ' ' || e.key === 'Enter') soltar(); });
    swBtn.addEventListener('blur', soltar);
    swBtn.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    swChk.addEventListener('change', function () { swFijo = swChk.checked; actualizarSW(); });

    pintar();
    arrancar();
  };
})();
