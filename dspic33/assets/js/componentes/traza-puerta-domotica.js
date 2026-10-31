/*
 * Componente "traza-puerta-domotica": problema resuelto 9.5.1 (puerta domótica).
 *
 * Uso: <div class="mpi-mount" data-componente="traza-puerta-domotica"
 *           data-config='{"pr":15625,"tckps":3,"decimasHora":36000}'></div>
 * Claves opcionales: "fcy" (Hz, 40 000 000 por defecto), "vel" (1, 100 o 10000).
 *
 * Final de carrera sin rebotes en RA0 (1 = puerta cerrada). El main detecta por
 * polling el flanco de subida de RA0 y hace cuenta++. La ISR del Timer 1 salta
 * cada PR1·presc/FCY = 15 625 · 256 / 40 MHz = 0,1 s, cuenta décimas y, a las
 * 36 000 (1 h), escribe PORTB = ~(cuenta & 0x3F) y pone cuenta = 0.
 * 6 LEDs en RB0-RB5, activos a nivel bajo (lucen con el bit a 0).
 * Comprobación: 5 cierres → PORTB = ~0x0005 = 0xFFFA → lucen RB0 y RB2.
 * PORTB no se inicializa en el listado: tras el reset vale xxxx (datasheet,
 * tabla de registros de PORTB), por eso los LEDs empiezan en estado «?».
 *
 * Modo carrera (nota «A verificar» del spec): si cuenta++ se traduce en
 * leer-incrementar-escribir y la ISR entra entre la lectura y la escritura, el
 * main escribe el valor antiguo + 1 y el reinicio de la ISR se pierde. Se
 * muestra también la corrección con IEC0bits.T1IE = 0 / 1.
 */
window.MPI = window.MPI || {};
MPI.componentes = MPI.componentes || {};

(function () {
  var NBSP = ' ';
  var PRESC = [1, 8, 64, 256];

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
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  var COD_MAIN =
    '#include "config.h"\n' +
    '\n' +
    'int cuenta = 0;\n' +
    'unsigned int decimas = 0;\n' +
    '\n' +
    'int main(void)\n' +
    '{\n' +
    '    unsigned int act, ant;\n' +
    '    InicializarReloj();  // F_CY = 40 MHz\n' +
    '    AD1PCFGL = 0xFFFF;   // todos los pines en digital (RA0 = AN0)\n' +
    '    TRISB = 0;          // configura entradas y salidas\n' +
    '    TRISA = 1;\n' +
    '    T1CON = 0x8030;     // configura el timer\n' +
    '    PR1 = 15625;\n' +
    '    TMR1 = 0;\n' +
    '    IFS0bits.T1IF = 0;\n' +
    '    IEC0bits.T1IE = 1;\n' +
    '    act = PORTA & 1;\n' +
    '    while (1) {\n' +
    '        ant = act;\n' +
    '        act = PORTA & 1;\n' +
    '        if (ant != act && act == 1)\n' +
    '            cuenta++;\n' +
    '    }\n' +
    '}';

  var COD_ISR =
    'void __attribute__((interrupt, no_auto_psv)) _T1Interrupt(void)\n' +
    '{\n' +
    '    IFS0bits.T1IF = 0;\n' +
    '    decimas++;\n' +
    '    if (decimas >= 36000) {\n' +
    '        decimas = 0;\n' +
    '        PORTB = ~(cuenta & 0x3F);\n' +
    '        cuenta = 0;\n' +
    '    }\n' +
    '}';

  function pintarCodigo(pre, texto) {
    pre.innerHTML = '<code class="lang-c"></code>';
    var code = pre.firstChild;
    code.textContent = texto;
    if (MPI.resaltarTodo) MPI.resaltarTodo(pre);
    var lineas = code.innerHTML.split('\n');
    code.innerHTML = lineas.map(function (l) { return '<span class="tpd-ln">' + (l || ' ') + '</span>'; }).join('');
    var textos = texto.split('\n');
    return function (sub) {
      for (var i = 0; i < textos.length; i++) if (textos[i].indexOf(sub) >= 0) return code.children[i];
      return null;
    };
  }

  MPI.componentes['traza-puerta-domotica'] = function (el, cfg) {
    cfg = cfg || {};
    var pr = (cfg.pr >= 1 && cfg.pr <= 65535) ? (cfg.pr | 0) : 15625;
    var tckps = (cfg.tckps >= 0 && cfg.tckps <= 3) ? (cfg.tckps | 0) : 3;
    var presc = PRESC[tckps];
    var fcy = Number(cfg.fcy) > 0 ? Number(cfg.fcy) : 40000000;
    var H = (cfg.decimasHora >= 2 && cfg.decimasHora <= 65535) ? (cfg.decimasHora | 0) : 36000;
    var tickMs = pr * presc / fcy * 1000;              // 100 ms
    var reducido = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    var vel = [1, 100, 10000].indexOf(Number(cfg.vel)) >= 0 ? Number(cfg.vel) : 100;

    var codIsr = COD_ISR.replace('36000', String(H));
    var codMain = COD_MAIN.replace('15625', String(pr)).replace('0x8030', hex4(0x8000 | (tckps << 4)));

    // ---------- estado ----------
    var decimas = 0, cuenta = 0, horas = 0, portb = null, ra0 = 0, ultima = null;
    var pausado = reducido, corriendo = false, ultimo = null, acum = 0, ahora = 0;
    var ev = { cuenta: -1e9, hora: -1e9 };
    var carrera = null;

    el.classList.add('mpi-traza-puerta-domotica');
    el.innerHTML =
      '<div class="mpi-sim-cab">Puerta domótica: cierres por hora <span class="tpd-cab-sub">sección 5.6</span></div>' +
      '<p class="tpd-sub">T1CON = ' + hex4(0x8000 | (tckps << 4)) + ' (1:' + presc + '), PR1 = ' + agrupar(pr) + ' → <code>_T1Interrupt</code> cada ' +
        agrupar(pr) + ' · ' + presc + ' / ' + dec(fcy / 1e6, 4) + NBSP + 'MHz = <b>' + dec(tickMs / 1000, 4) + NBSP + 's</b>; ' +
        agrupar(H) + ' décimas = <b>' + dec(H * tickMs / 3600000, 4) + NBSP + 'h</b>.</p>' +
      '<div class="tpd-contadores">' +
        '<div class="tpd-cont"><span class="tpd-et">decimas</span><b class="tpd-v-dec">0</b><span class="tpd-barra"><span class="tpd-barra-in"></span></span></div>' +
        '<div class="tpd-cont"><span class="tpd-et">tiempo en la hora</span><b class="tpd-v-t">00:00,0</b></div>' +
        '<div class="tpd-cont"><span class="tpd-et">cuenta</span><b class="tpd-v-cuenta">0</b></div>' +
        '<div class="tpd-cont"><span class="tpd-et">horas completas</span><b class="tpd-v-horas">0</b></div>' +
      '</div>' +
      '<div class="tpd-ctl">' +
        '<button type="button" class="tpd-pausa" aria-pressed="false"></button>' +
        '<span class="tpd-vel" role="group" aria-label="Velocidad de la simulación">' +
          '<button type="button" data-v="1">×1</button>' +
          '<button type="button" data-v="100">×100</button>' +
          '<button type="button" data-v="10000">×10' + NBSP + '000</button>' +
        '</span>' +
        '<button type="button" class="tpd-saltar">Saltar al final de la hora</button>' +
        '<button type="button" class="tpd-comprobar">Comprobar: 5 cierres</button>' +
        '<button type="button" class="tpd-reini">Reiniciar</button>' +
      '</div>' +
      '<div class="tpd-io">' +
        '<div class="tpd-puerta">' +
          '<div class="tpd-dibujo" aria-hidden="true"><span class="tpd-hoja"></span><span class="tpd-fc"></span></div>' +
          '<div class="tpd-puerta-ctl">' +
            '<button type="button" class="tpd-cerrar" aria-pressed="false">Cerrar puerta</button>' +
            '<button type="button" class="tpd-ciclo">Cerrar y abrir (+1)</button>' +
            '<div class="tpd-ra0"></div>' +
          '</div>' +
        '</div>' +
        '<div class="tpd-puerto">' +
          '<div class="tpd-expr"></div>' +
          '<div class="tpd-bits" aria-hidden="true"></div>' +
          '<div class="tpd-leds" role="group" aria-label="LEDs en RB5 a RB0"></div>' +
          '<div class="tpd-lectura" aria-live="polite"></div>' +
        '</div>' +
      '</div>' +
      '<div class="tpd-codigos">' +
        '<div><div class="tpd-cod-tit">main (polling de RA0)</div><pre class="tpd-cod-main"></pre></div>' +
        '<div><div class="tpd-cod-tit">ISR del Timer 1 (cada ' + dec(tickMs / 1000, 4) + NBSP + 's)</div><pre class="tpd-cod-isr"></pre></div>' +
      '</div>' +
      '<details class="tpd-carrera">' +
        '<summary>Modo carrera: ¿y si la ISR entra en mitad de <code>cuenta++</code>?</summary>' +
        '<p class="tpd-sub">Si el compilador traduce <code>cuenta++</code> en tres instrucciones (leer, incrementar, escribir) y el fin de hora llega entre la lectura y la escritura, la ISR pone <code>cuenta = 0</code>… y el <code>main</code> escribe encima el valor antiguo + 1. Prepara la carrera con la cuenta actual y avanza paso a paso.</p>' +
        '<div class="tpd-car-ctl">' +
          '<label class="tpd-chk"><input type="checkbox" class="tpd-proteger"> proteger con <code>IEC0bits.T1IE = 0</code> … <code>= 1</code></label>' +
          '<button type="button" class="tpd-car-prep">Preparar la carrera</button>' +
          '<button type="button" class="tpd-car-paso" disabled>Paso ▶</button>' +
        '</div>' +
        '<pre class="tpd-asm" aria-label="Traducción de cuenta++"></pre>' +
        '<div class="tpd-car-estado" aria-hidden="true"></div>' +
        '<div class="tpd-car-exp" aria-live="polite"></div>' +
      '</details>' +
      '<p class="tpd-nota">Con el reloj exacto (39 613 750 Hz) cada décima dura 15 625 · 256 / 39 613 750 Hz ≈ 0,101 s y la «hora» se alarga unos 35 s. ' +
        'Con 6 LEDs solo caben 63 cierres: más allá, <code>cuenta &amp; 0x3F</code> muestra el resto módulo 64. Aquí el <code>main</code> detecta el flanco al instante (su bucle tarda microsegundos).</p>';

    var q = function (s) { return el.querySelector(s); };
    var vDec = q('.tpd-v-dec'), vT = q('.tpd-v-t'), vCu = q('.tpd-v-cuenta'), vHo = q('.tpd-v-horas'), barra = q('.tpd-barra-in');
    var btnPausa = q('.tpd-pausa'), grpVel = q('.tpd-vel');
    var btnCerrar = q('.tpd-cerrar'), ra0El = q('.tpd-ra0'), dibujo = q('.tpd-dibujo');
    var expr = q('.tpd-expr'), bitsEl = q('.tpd-bits'), ledsEl = q('.tpd-leds'), lectura = q('.tpd-lectura');

    var leds = [];
    for (var b = 5; b >= 0; b--) {
      var d = document.createElement('div');
      d.className = 'tpd-led';
      d.setAttribute('role', 'img');
      d.innerHTML = '<span class="tpd-led-luz" aria-hidden="true"></span><span class="tpd-led-rb">RB' + b + '</span>';
      ledsEl.appendChild(d);
      leds.push({ bit: b, el: d });
    }

    var lnMain = pintarCodigo(q('.tpd-cod-main'), codMain);
    var lnIsr = pintarCodigo(q('.tpd-cod-isr'), codIsr);
    var L = {
      polling: [lnMain('ant = act;'), lnMain('        act = PORTA & 1;'), lnMain('if (ant != act')],
      cuenta: [lnMain('cuenta++')],
      tick: [lnIsr('IFS0bits.T1IF = 0'), lnIsr('decimas++')],
      hora: [lnIsr('if (decimas >='), lnIsr('decimas = 0'), lnIsr('PORTB = ~'), lnIsr('cuenta = 0')]
    };
    function marcar(lineas, on, cls) {
      lineas.forEach(function (x) { if (x) x.classList.toggle(cls, !!on); });
    }

    // ---------- modelo ----------
    function finHora() {
      decimas = 0;
      portb = (~(cuenta & 0x3F)) & 0xFFFF;
      ultima = { cuenta: cuenta, portb: portb };
      cuenta = 0;
      horas++;
      ev.hora = ahora;
    }
    function sumarTicks(n) {
      while (n > 0) {
        var hasta = H - decimas;               // ticks hasta completar la hora
        if (n >= hasta) { n -= hasta; decimas = H; finHora(); }
        else { decimas += n; n = 0; }
      }
    }
    function flanco() { cuenta++; ev.cuenta = ahora; }
    function ponerRA0(v) {
      if (v === ra0) return;
      if (v === 1) flanco();                  // flanco de subida: la puerta se cierra
      ra0 = v;
    }

    function ledsEncendidos(pb) {
      var r = [];
      for (var i = 0; i <= 5; i++) if (((pb >> i) & 1) === 0) r.push('RB' + i);
      return r;
    }

    var cache = {};
    function set(nodo, clv, txt, html) {
      if (cache[clv] === txt) return;
      cache[clv] = txt;
      if (html) nodo.innerHTML = txt; else nodo.textContent = txt;
    }

    function pintar() {
      set(vDec, 'dec', agrupar(decimas));
      barra.style.width = (decimas / H * 100).toFixed(2) + '%';
      var ds = decimas * tickMs / 100;            // décimas de segundo reales
      var tot = Math.floor(ds / 10), m = Math.floor(tot / 60), s = tot % 60, dd = Math.floor(ds % 10);
      set(vT, 't', dos(m) + ':' + dos(s) + ',' + dd);
      set(vCu, 'cu', String(cuenta));
      set(vHo, 'ho', String(horas));

      btnCerrar.textContent = ra0 ? 'Abrir puerta' : 'Cerrar puerta';
      btnCerrar.setAttribute('aria-pressed', String(!!ra0));
      dibujo.classList.toggle('tpd-cerrada', !!ra0);
      set(ra0El, 'ra0', ra0 ? 'Puerta cerrada · final de carrera pulsado · RA0 = 1' : 'Puerta abierta · RA0 = 0');

      if (portb == null) {
        set(expr, 'expr', 'PORTB aún no se ha escrito: el listado no lo inicializa y tras el reset vale <b>xxxx</b> (indeterminado). Se actualiza al completar la primera hora.', true);
      } else {
        set(expr, 'expr', 'Última hora: <code>PORTB = ~(cuenta &amp; 0x3F)</code> = ~(' + ultima.cuenta + ' &amp; 0x3F) = ~' + hex4(ultima.cuenta & 0x3F) + ' = <b>' + hex4(portb) + '</b>', true);
      }
      var bh = '';
      for (var bb = 15; bb >= 0; bb--) {
        var v = portb == null ? '?' : (portb >> bb) & 1;
        bh += '<span class="tpd-bit' + (bb <= 5 ? ' tpd-bit-led' : '') + '" title="RB' + bb + '"><i>' + bb + '</i>' + v + '</span>';
      }
      set(bitsEl, 'bits', bh, true);
      leds.forEach(function (l) {
        var on = portb != null && ((portb >> l.bit) & 1) === 0;
        l.el.classList.toggle('tpd-on', on);
        l.el.classList.toggle('tpd-desc', portb == null);
        var lab = 'LED RB' + l.bit + ' ' + (portb == null ? 'en estado desconocido' : on ? 'encendido' : 'apagado');
        if (l.el.getAttribute('aria-label') !== lab) l.el.setAttribute('aria-label', lab);
      });
      if (portb == null) set(lectura, 'lect', 'Primera hora en curso.');
      else {
        var enc = ledsEncendidos(portb);
        set(lectura, 'lect', 'Hora ' + horas + ' completada: ' + ultima.cuenta + ' cierres → ' + (ultima.cuenta & 0x3F) + ' = ' + bin(ultima.cuenta & 0x3F, 6) +
          ' en binario → ' + (enc.length ? 'LEDs encendidos: ' + enc.join(', ') : 'ningún LED encendido') + ' (luce el LED cuyo bit vale 0).');
      }

      var anim = !pausado && !reducido;
      marcar(L.polling, true, 'tpd-activa');
      marcar(L.cuenta, ahora - ev.cuenta < 600, 'tpd-flash');
      marcar(L.tick, anim, 'tpd-flash');
      marcar(L.hora, ahora - ev.hora < 1200, 'tpd-flash');
    }

    // ---------- bucle ----------
    function frame(ts) {
      if (!document.body.contains(el)) { corriendo = false; return; }
      if (pausado) { corriendo = false; ultimo = null; pintar(); return; }
      if (ultimo == null) ultimo = ts;
      var dt = Math.min(100, Math.max(0, ts - ultimo));
      ultimo = ts;
      ahora += dt;
      acum += dt * vel;
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
    function ponerPausa(p) {
      pausado = p;
      btnPausa.textContent = pausado ? '▶ Seguir' : '⏸ Pausa';
      btnPausa.setAttribute('aria-pressed', String(pausado));
      if (pausado) pintar(); else arrancar();
    }
    function ponerVel(v) {
      vel = v;
      var bs = grpVel.querySelectorAll('button');
      for (var i = 0; i < bs.length; i++) bs[i].setAttribute('aria-pressed', String(+bs[i].getAttribute('data-v') === v));
    }

    // ---------- eventos ----------
    btnPausa.addEventListener('click', function () { ponerPausa(!pausado); });
    grpVel.addEventListener('click', function (e) {
      var bt = e.target.closest ? e.target.closest('button') : null;
      if (bt) ponerVel(+bt.getAttribute('data-v'));
    });
    btnCerrar.addEventListener('click', function () { ponerRA0(ra0 ? 0 : 1); pintar(); });
    q('.tpd-ciclo').addEventListener('click', function () {
      if (ra0) ponerRA0(0);
      ponerRA0(1);
      ponerRA0(0);
      pintar();
    });
    q('.tpd-saltar').addEventListener('click', function () {
      decimas = Math.max(decimas, H - 30);     // 3 s antes del final de la hora
      acum = 0;
      pintar();
      if (pausado) ponerPausa(false);
    });
    q('.tpd-comprobar').addEventListener('click', function () {
      reiniciar();
      for (var i = 0; i < 5; i++) { ponerRA0(1); ponerRA0(0); }
      decimas = H - 30;
      pintar();
      ponerPausa(false);
    });
    q('.tpd-reini').addEventListener('click', function () { reiniciar(); pintar(); });
    function reiniciar() {
      decimas = 0; cuenta = 0; horas = 0; portb = null; ra0 = 0; ultima = null; acum = 0;
      ev = { cuenta: -1e9, hora: -1e9 };
    }

    // ---------- modo carrera ----------
    var chkProt = q('.tpd-proteger'), bPrep = q('.tpd-car-prep'), bCPaso = q('.tpd-car-paso');
    var asmEl = q('.tpd-asm'), carEst = q('.tpd-car-estado'), carExp = q('.tpd-car-exp');
    var ASM_SIN = [
      '; cuenta++ en tres instrucciones (ilustrativo)',
      'mov     _cuenta, w0      ; 1) lee cuenta de memoria',
      'inc     w0, w0           ; 2) incrementa en W0',
      'mov     w0, _cuenta      ; 3) escribe el resultado'
    ];
    var ASM_CON = [
      '; cuenta++ protegido (sección crítica)',
      'bclr.b  _IEC0bits, #3    ; IEC0bits.T1IE = 0',
      'mov     _cuenta, w0      ; 1) lee cuenta de memoria',
      'inc     w0, w0           ; 2) incrementa en W0',
      'mov     w0, _cuenta      ; 3) escribe el resultado',
      'bset.b  _IEC0bits, #3    ; IEC0bits.T1IE = 1'
    ];
    function pintarAsm() {
      var a = chkProt.checked ? ASM_CON : ASM_SIN;
      asmEl.innerHTML = a.map(function (l, i) {
        return '<span class="tpd-ln' + (i === 0 ? ' tpd-asm-com' : '') + '">' + esc(l) + '</span>';
      }).join('') + '<span class="tpd-ln tpd-asm-isr">  ⤷ _T1Interrupt (fin de hora)</span>';
    }
    function generarCarrera() {
      var prot = chkProt.checked;
      var c = cuenta >= 1 ? cuenta : 4;
      var supuesto = cuenta < 1;
      var pb0 = portb;
      var E = [];
      var s = { l: -1, isr: false, w0: null, cu: c, dec: H - 1, t1if: 0, t1ie: 1, pb: pb0 };
      function add(mod, txt) {
        var n = {}; for (var p in s) n[p] = s[p];
        n.l = -1; n.isr = false;
        for (p in mod) n[p] = mod[p];
        n.txt = txt; E.push(n); s = n;
      }
      var pbIsr = function (v) { return (~(v & 0x3F)) & 0xFFFF; };
      add({}, 'La puerta se cierra: el <code>main</code> va a ejecutar <code>cuenta++</code> con cuenta = ' + c +
        (supuesto ? ' (no había cierres: se supone que ya había 4 en esta hora)' : '') +
        '. Falta una décima para el final de la hora: decimas = ' + agrupar(H - 1) + '.');
      var o = prot ? 1 : 0;
      if (prot) add({ l: 1, t1ie: 0 }, '<code>IEC0bits.T1IE = 0</code>: se deshabilita la interrupción del Timer 1 durante el incremento. El timer sigue contando.');
      add({ l: 1 + o, w0: c }, 'Lectura: W0 = cuenta = ' + c + '.');
      if (!prot) {
        add({ isr: true, t1if: 1 }, 'TMR1 alcanza PR1: T1IF = 1. Prioridad 4 &gt; IPL 0 y T1IE = 1 → la CPU termina la lectura, apila PC y SR y entra en <code>_T1Interrupt</code> (W0 lo guarda y restaura la propia ISR).');
        add({ isr: true, t1if: 0, dec: 0, pb: pbIsr(c), cu: 0 },
          'ISR: decimas = ' + agrupar(H) + ' → hora completa: decimas = 0, <code>PORTB = ~(' + c + ' &amp; 0x3F)</code> = ' + hex4(pbIsr(c)) + ', <b>cuenta = 0</b>. RETFIE vuelve al <code>main</code>, justo después de la lectura.');
        add({ l: 2, w0: c + 1 }, 'Incremento: W0 = ' + c + ' + 1 = ' + (c + 1) + '. W0 todavía tiene el valor leído <b>antes</b> de la ISR.');
        add({ l: 3, cu: c + 1 }, 'Escritura: cuenta = ' + (c + 1) + '. <b>El reinicio se ha perdido</b>: la hora nueva debería empezar con cuenta = 1 y empieza con ' + (c + 1) +
          '; los ' + c + ' cierres de la hora anterior se mostrarán otra vez dentro de una hora. <code>volatile</code> no lo evita: hay que impedir la interrupción durante el incremento (marca la casilla).');
      } else {
        add({ t1if: 1 }, 'TMR1 alcanza PR1: T1IF = 1, pero T1IE = 0 → la petición queda <b>pendiente</b> (el flag no se pierde).');
        add({ l: 3, w0: c + 1 }, 'Incremento: W0 = ' + (c + 1) + '.');
        add({ l: 4, cu: c + 1 }, 'Escritura: cuenta = ' + (c + 1) + '. El incremento ha terminado entero.');
        add({ l: 5, t1ie: 1, isr: true, t1if: 0, dec: 0, pb: pbIsr(c + 1), cu: 0 },
          '<code>IEC0bits.T1IE = 1</code>: la petición pendiente entra ya. ISR: decimas = 0, <code>PORTB = ~(' + (c + 1) + ' &amp; 0x3F)</code> = ' + hex4(pbIsr(c + 1)) +
          ', cuenta = 0. <b>Correcto</b>: el cierre cuenta en la hora que termina y la nueva empieza en 0. La ISR se retrasa unas instrucciones, nada más.');
      }
      return E;
    }
    function pintarCarrera() {
      var e = carrera.E[carrera.i];
      var lin = asmEl.children;
      for (var i = 0; i < lin.length; i++) {
        lin[i].classList.toggle('tpd-activa', i === e.l);
        if (lin[i].classList.contains('tpd-asm-isr')) lin[i].classList.toggle('tpd-flash', e.isr);
      }
      carEst.innerHTML =
        '<span>W0 = <b>' + (e.w0 == null ? '?' : e.w0) + '</b></span>' +
        '<span>cuenta = <b>' + e.cu + '</b></span>' +
        '<span>decimas = <b>' + agrupar(e.dec) + '</b></span>' +
        '<span>T1IF = <b>' + e.t1if + '</b></span>' +
        '<span>T1IE = <b>' + e.t1ie + '</b></span>' +
        '<span>PORTB = <b>' + (e.pb == null ? 'xxxx' : hex4(e.pb)) + '</b></span>';
      carExp.innerHTML = '<b>' + (carrera.i + 1) + '/' + carrera.E.length + '.</b> ' + e.txt;
      bCPaso.disabled = carrera.i >= carrera.E.length - 1;
      if (carrera.i === carrera.E.length - 1 && !carrera.aplicada) {
        carrera.aplicada = true;
        // Se vuelca el resultado al simulador principal.
        cuenta = e.cu; decimas = e.dec; portb = e.pb; horas++;
        ultima = { cuenta: carrera.mostrado, portb: e.pb };
        ev.hora = ahora;
        pintar();
      }
    }
    bPrep.addEventListener('click', function () {
      ponerPausa(true);
      pintarAsm();
      carrera = { E: generarCarrera(), i: 0, aplicada: false };
      // Valor que muestran los LEDs al acabar: el que vio la ISR.
      carrera.mostrado = chkProt.checked ? carrera.E[0].cu + 1 : carrera.E[0].cu;
      pintarCarrera();
    });
    bCPaso.addEventListener('click', function () {
      if (!carrera || carrera.i >= carrera.E.length - 1) return;
      carrera.i++;
      pintarCarrera();
    });
    chkProt.addEventListener('change', function () {
      pintarAsm();
      carrera = null;
      bCPaso.disabled = true;
      carEst.innerHTML = '';
      carExp.innerHTML = 'Pulsa «Preparar la carrera».';
    });

    pintarAsm();
    carExp.innerHTML = 'Pulsa «Preparar la carrera».';
    ponerVel(vel);
    ponerPausa(pausado);
    pintar();
  };
})();
