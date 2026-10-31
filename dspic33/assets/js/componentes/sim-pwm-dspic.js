/*
 * Componente "sim-pwm-dspic": módulo PWM1 del dsPIC33FJ32MC202 con el driver de 14.4
 * (datasheet 15.0 Motor Control PWM).
 *
 *   Ejecuta, con la aritmética entera del C de XC16 (int de 16 bits, long de 32), el driver:
 *     init_pwm(frec, pines):
 *       if (frec < 20) return 1;
 *       preesc = Fcy/frec/32767  → 0 (1:1) si < 1, 1 (1:4) si < 4, 2 (1:16) si < 16, si no 3 (1:64)
 *       PTPER   = Fcy/frec/(1 << (preesc*2))           (= Fcy/frec/4^preesc)
 *       PWMCON1 = 0x700 | (maskH << 4) | maskL         (pines: bit0 L1, bit1 H1, bit2 L2, bit3 H2, bit4 L3, bit5 H3)
 *       PTCON   = 0x8000 | (preesc << 2)
 *     set_dc(pin, dc): *(0x1D6 + 2·pin) = dc*(2*PTPER/100)   (pin 0 → PDC1, 1 → PDC2, 2 → PDC3)
 *   Nombres: PTCON = P1TCON, PTPER = P1TPER, PWMCON1 = PWM1CON1, PDCx = P1DCx (0x01D6, 0x01D8, 0x01DA).
 *
 *   Hardware (datasheet): P1TPER solo implementa 15 bits (PTPER<14:0>): si el driver calcula un valor
 *   > 32 767 el registro se queda con los 15 bits bajos. En free-running el periodo es (PTPER + 1) cuentas
 *   (valor exacto: PTPER = FCY/(FPWM·presc) − 1) y el ciclo de trabajo se compara con resolución doble:
 *   PDC = PTPER → 50 %, PDC = 2·(PTPER + 1) → 100 %.
 *   PMOD = 1 (driver, 0x0700): par independiente → H y L sacan la misma señal.
 *   PMOD = 0: par complementario → L = H invertida (sin tiempo muerto).
 *
 *   LEDs de la PicTrainer (activos a nivel bajo): D6 = RB15 = PWM1L1, D7 = RB14 = PWM1H1,
 *   D8 = RB13 = PWM1L2, D9 = RB12 = PWM1H2. Brillo ∝ fracción del periodo en que el pin está a 0.
 *
 * Uso: <div class="mpi-mount" data-componente="sim-pwm-dspic"
 *        data-config='{"fcy":40000000,"frec":50,"pines":"0x3F","dc":[0,51,0]}'></div>
 *
 * Claves de data-config (todas opcionales):
 *   fcy     40000000 (defecto) o 39613750: los únicos seleccionables
 *   frec    frecuencia pedida a init_pwm en Hz (int de 16 bits: 1-32 767; defecto 50)
 *   pines   máscara del driver, número o "0x3F" (defecto 0x3F)
 *   dc      [dc1, dc2, dc3] en % para set_dc(0..2, dc) (defecto [0, 51, 0])
 *   pmod    1 (defecto, como el driver: 0x0700) o 0 (pares complementarios)
 *   pdc     "set_dc" (defecto: dc entero, como el driver) o "exacto" (PDC = round(dc·2·PTPER/100))
 */
window.MPI = window.MPI || {};
MPI.componentes = MPI.componentes || {};

(function () {
  var NBSP = ' ';
  var FCY_APROX = 40000000, FCY_EXACTO = 39613750;
  var PRESC = [1, 4, 16, 64];
  var DIR_PDC = [0x01D6, 0x01D8, 0x01DA];
  // Bits de 'pines' del driver (figura 117) → pin del micro y LED de la PicTrainer
  var PINES = [
    { bit: 0, nom: 'PWM1L1', rb: 15, fis: 26, canal: 0, h: false, led: 'D6' },
    { bit: 1, nom: 'PWM1H1', rb: 14, fis: 25, canal: 0, h: true, led: 'D7' },
    { bit: 2, nom: 'PWM1L2', rb: 13, fis: 24, canal: 1, h: false, led: 'D8' },
    { bit: 3, nom: 'PWM1H2', rb: 12, fis: 23, canal: 1, h: true, led: 'D9' },
    { bit: 4, nom: 'PWM1L3', rb: 11, fis: 22, canal: 2, h: false, led: null },
    { bit: 5, nom: 'PWM1H3', rb: 10, fis: 21, canal: 2, h: true, led: null }
  ];
  var uid = 0;

  // ---------- formato español ----------
  function agrupar(n) {
    var s = String(Math.abs(Math.round(n)));
    if (s.length >= 5) s = s.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
    return (n < 0 ? '−' : '') + s;
  }
  function fx(x, nd) {
    if (!isFinite(x)) return '—';
    var s = Math.abs(x).toFixed(nd);
    if (s.indexOf('.') >= 0) s = s.replace(/0+$/, '').replace(/\.$/, '');
    var p = s.split('.');
    var cero = /^0(\.0*)?$/.test(s);
    return (x < 0 && !cero ? '−' : '') + agrupar(+p[0]) + (p[1] ? ',' + p[1] : '');
  }
  // n cifras significativas
  function sig(x, n) {
    if (!isFinite(x)) return '—';
    if (x === 0) return '0';
    var d = Math.max(0, n - 1 - Math.floor(Math.log(Math.abs(x)) / Math.LN10));
    return fx(x, Math.min(d, 9));
  }
  function fmtF(f) {
    if (!isFinite(f)) return '—';
    if (f >= 1e3) return sig(f / 1e3, 6) + NBSP + 'kHz';
    return sig(f, 6) + NBSP + 'Hz';
  }
  function fmtT(s) {
    if (!isFinite(s)) return '—';
    if (s >= 1) return sig(s, 5) + NBSP + 's';
    if (s >= 1e-3) return sig(s * 1e3, 5) + NBSP + 'ms';
    return sig(s * 1e6, 4) + NBSP + 'µs';
  }
  function hex4(v) { var s = ((v & 0xFFFF) >>> 0).toString(16).toUpperCase(); while (s.length < 4) s = '0' + s; return '0x' + s; }
  function hex2(v) { var s = (v >>> 0).toString(16).toUpperCase(); while (s.length < 2) s = '0' + s; return '0x' + s; }
  function bin(v, n) { var s = (v >>> 0).toString(2); while (s.length < n) s = '0' + s; return s; }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function fcyTxt(f) { return agrupar(f) + NBSP + 'Hz'; }
  function leerMascara(v) {
    if (typeof v === 'number') return v & 0x3F;
    var s = String(v || '').trim();
    var n = /^0x[0-9a-f]+$/i.test(s) ? parseInt(s.slice(2), 16) : parseInt(s, 10);
    return isFinite(n) ? n & 0x3F : 0x3F;
  }
  function pintarCodigo(pre, texto) {
    pre.innerHTML = '<code class="lang-c"></code>';
    pre.firstChild.textContent = texto;
    if (MPI.resaltarTodo) MPI.resaltarTodo(pre);
  }
  function pad(s, n) { s = String(s); while (s.length < n) s += ' '; return s; }

  // ---------- el driver de la figura 117, con aritmética entera de XC16 ----------
  function initPwm(fcy, frec, pines, pmod) {
    var r = { frec: frec, pines: pines, error: false };
    if (frec < 20) { r.error = true; return r; }          // if (frec < 20) return 1;
    var q = Math.floor(fcy / frec);                          // Fcy/frec (long)
    r.raw = Math.floor(q / 32767);                           // Fcy/frec/32767
    r.preesc = r.raw < 1 ? 0 : (r.raw < 4 ? 1 : (r.raw < 16 ? 2 : 3));
    r.presc = PRESC[r.preesc];
    r.ptperC = Math.floor(q / (1 << (r.preesc * 2)));     // valor calculado (long)
    r.ptperReg = r.ptperC & 0x7FFF;                          // P1TPER solo guarda PTPER<14:0>
    r.desborda = r.ptperC > 32767;
    r.maskL = ((pines & 0x10) >> 2) | ((pines & 0x4) >> 1) | (pines & 1);
    r.maskH = ((pines & 0x20) >> 3) | ((pines & 0x8) >> 2) | ((pines & 2) >> 1);
    r.pwmcon1 = (pmod ? 0x700 : 0) | (r.maskH << 4) | r.maskL;
    r.ptcon = 0x8000 | (r.preesc << 2);
    return r;
  }
  // set_dc: dc*(2*PTPER/100) en unsigned int de 16 bits (PTPER es un SFR unsigned int)
  function setDc(ptper, dc) {
    var k = Math.floor(((2 * ptper) & 0xFFFF) / 100);
    return { k: k, pdc: (Math.trunc(dc) * k) & 0xFFFF };
  }

  MPI.componentes['sim-pwm-dspic'] = function (el, cfg) {
    cfg = cfg || {};
    var id = 'spw' + (++uid);
    var reducido = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

    function normFcy(v) { return Math.abs(Number(v) - FCY_EXACTO) < 1000 ? FCY_EXACTO : FCY_APROX; }
    function inicial() {
      var dc = Array.isArray(cfg.dc) ? cfg.dc : [0, 51, 0];
      return {
        fcy: normFcy(cfg.fcy != null ? cfg.fcy : FCY_APROX),
        frec: Math.max(1, Math.min(32767, Math.round(Number(cfg.frec) || 50))),
        pines: cfg.pines != null ? leerMascara(cfg.pines) : 0x3F,
        dc: [0, 1, 2].map(function (i) { var x = Number(dc[i]); return isFinite(x) ? Math.max(0, Math.min(100, x)) : 0; }),
        pmod: cfg.pmod === 0 || cfg.pmod === '0' ? 0 : 1,
        exacto: cfg.pdc === 'exacto'
      };
    }
    var st = inicial();
    if (!st.exacto) st.dc = st.dc.map(Math.round);

    // ---------- HTML ----------
    var chk = PINES.map(function (p) {
      return '<label class="spw-pin"><input type="checkbox" class="spw-chk" data-bit="' + p.bit + '">' +
        '<span class="spw-pin-n">' + p.nom + '</span>' +
        '<span class="spw-pin-d">RB' + p.rb + ' · pin ' + p.fis + (p.led ? ' · ' + p.led : '') + '</span>' +
        '<span class="spw-pin-b">bit ' + p.bit + '</span></label>';
    }).join('');
    var filasDc = [0, 1, 2].map(function (i) {
      return '<div class="spw-dc"><label for="' + id + '-dc' + i + '">Canal ' + (i + 1) + ' <span class="spw-tenue">set_dc(' + i + ', dc) → PDC' + (i + 1) + '</span></label>' +
        '<input type="range" id="' + id + '-dc' + i + '" class="spw-dc-r" data-i="' + i + '" min="0" max="100" step="1">' +
        '<input type="number" class="spw-dc-n" data-i="' + i + '" min="0" max="100" step="1" aria-label="Ciclo de trabajo del canal ' + (i + 1) + ' en %">' +
        '<span class="spw-pct">%</span></div>';
    }).join('');

    el.classList.add('mpi-sim-pwm-dspic');
    el.innerHTML =
      '<div class="mpi-sim-cab">Módulo PWM1 · driver init_pwm / set_dc <span class="spw-sub">PTPER = F<sub>CY</sub> / (frec · presc)</span></div>' +
      '<div class="spw-ctl">' +
        '<div class="spw-fila">' +
          '<label><span>F<sub>CY</sub></span> <select class="spw-fcy" aria-label="Frecuencia de instrucción FCY"></select></label>' +
          '<label for="' + id + '-f"><span>Frecuencia (frec)</span> <input id="' + id + '-f" class="spw-frec" type="number" min="1" max="32767" step="1" aria-describedby="' + id + '-ferr"> Hz</label>' +
          '<label>PMOD3-1 <select class="spw-pmod" aria-label="Modo de los pares PMOD">' +
            '<option value="1">1 · independientes (driver)</option><option value="0">0 · complementarios</option></select></label>' +
          '<label>PDC <select class="spw-modo" aria-label="Cómo se calcula PDC">' +
            '<option value="set_dc">con set_dc (dc entero)</option><option value="exacto">escrito a mano (exacto)</option></select></label>' +
        '</div>' +
        '<p class="spw-err" id="' + id + '-ferr" role="alert"></p>' +
        '<fieldset class="spw-pines"><legend>Pines (argumento <code>pines</code> = <b class="spw-mask"></b>)</legend>' + chk + '</fieldset>' +
        '<div class="spw-dcs">' + filasDc + '</div>' +
        '<div class="spw-botones" role="group" aria-label="Ejemplos">' +
          '<button type="button" class="spw-b-servo">Servo: 1,5 ms a 50 Hz</button>' +
          '<button type="button" class="spw-b-ini">Valores iniciales</button>' +
        '</div>' +
      '</div>' +
      '<p class="spw-resumen" aria-live="polite"></p>' +
      '<div class="spw-avisos"></div>' +
      '<div class="spw-scroll"><table class="spw-tabla"><tbody></tbody></table></div>' +
      '<div class="spw-cuerpo">' +
        '<figure class="spw-fig"><div class="spw-ondas"></div><figcaption>Dos periodos de cada salida PWM1 (PTMOD = 00, free-running, sin tiempo muerto)</figcaption></figure>' +
        '<figure class="spw-fig spw-fig-leds"><div class="spw-leds"></div>' +
          '<label class="spw-chk-parp"><input type="checkbox" class="spw-parp"> Parpadeo en tiempo real (solo por debajo de 25 Hz)</label>' +
          '<figcaption>LEDs de la PicTrainer (activos a nivel bajo)</figcaption></figure>' +
      '</div>' +
      '<pre class="spw-codigo"></pre>';

    function $(s) { return el.querySelector(s); }
    var selFcy = $('.spw-fcy'), inF = $('.spw-frec'), errF = $('.spw-err'), selPmod = $('.spw-pmod'), selModo = $('.spw-modo');
    var chks = el.querySelectorAll('.spw-chk'), rDc = el.querySelectorAll('.spw-dc-r'), nDc = el.querySelectorAll('.spw-dc-n');
    var spanMask = $('.spw-mask'), resumen = $('.spw-resumen'), avisos = $('.spw-avisos'), tbody = $('.spw-tabla tbody');
    var divOndas = $('.spw-ondas'), divLeds = $('.spw-leds'), chkParp = $('.spw-parp'), preCod = $('.spw-codigo');
    var btnServo = $('.spw-b-servo'), btnIni = $('.spw-b-ini');
    chkParp.checked = !reducido;

    function opcionesFcy() {
      var h = '<option value="' + FCY_APROX + '">40' + NBSP + '000' + NBSP + '000 Hz (aproximado)</option>' +
        '<option value="' + FCY_EXACTO + '">39' + NBSP + '613' + NBSP + '750 Hz (exacto)</option>';
      selFcy.innerHTML = h;
      selFcy.value = String(st.fcy);
    }
    function fcyActual() { return st.fcy; }

    function sincronizarControles() {
      opcionesFcy();
      inF.value = String(st.frec);
      selPmod.value = String(st.pmod);
      selModo.value = st.exacto ? 'exacto' : 'set_dc';
      for (var i = 0; i < chks.length; i++) chks[i].checked = !!(st.pines & (1 << +chks[i].getAttribute('data-bit')));
      for (var k = 0; k < 3; k++) {
        rDc[k].step = st.exacto ? '0.1' : '1'; nDc[k].step = st.exacto ? '0.1' : '1';
        rDc[k].value = String(st.dc[k]); nDc[k].value = String(st.dc[k]);
      }
    }

    // ---------- cálculo ----------
    var R = null;   // resultado actual
    function calcular() {
      var fcy = fcyActual();
      var r = initPwm(fcy, st.frec, st.pines, st.pmod);
      r.fcy = fcy;
      if (!r.error) {
        r.canales = [0, 1, 2].map(function (i) {
          var c = { dc: st.dc[i] };
          if (st.exacto) { c.pdc = Math.min(0xFFFF, Math.round(st.dc[i] / 100 * 2 * r.ptperReg)); c.k = null; }
          else { var s = setDc(r.ptperReg, st.dc[i]); c.pdc = s.pdc; c.k = s.k; }
          var den = 2 * (r.ptperReg + 1);
          c.dcHw = Math.min(1, c.pdc / den);                       // fracción en alto de PWM1Hx (hardware)
          return c;
        });
        r.Tcuenta = r.presc / fcy;
        r.T = (r.ptperReg + 1) * r.Tcuenta;                        // periodo real (datasheet)
        r.fAprox = r.ptperReg > 0 ? fcy / (r.presc * r.ptperReg) : NaN;
        r.fHw = 1 / r.T;
        r.ptperDs = fcy / (st.frec * r.presc) - 1;
        r.fMin = fcy / (64 * 32767);
      }
      R = r;
      return r;
    }

    function filaReg(nomLibro, nomDs, valorHtml, detalle) {
      return '<tr><th scope="row"><span class="spw-reg">' + nomLibro + '</span>' + (nomDs ? ' <span class="spw-regds">= ' + nomDs + '</span>' : '') + '</th>' +
        '<td>' + valorHtml + (detalle ? '<span class="spw-calc">' + detalle + '</span>' : '') + '</td></tr>';
    }

    function pintarTabla(r) {
      var fcy = r.fcy, h = '';
      var mask = st.pines;
      spanMask.textContent = hex2(mask);
      if (r.error) {
        tbody.innerHTML = '<tr><td colspan="2"><span class="spw-mal">init_pwm(' + st.frec + ', ' + hex2(mask) + ') devuelve 1</span>: con frec &lt; 15 el driver sale sin escribir ningún registro (el módulo sigue apagado).</td></tr>';
        return;
      }
      var cocTxt = agrupar(Math.floor(fcy / st.frec));
      h += '<tr><th scope="row">preesc</th><td><b>' + r.preesc + ' → 1:' + r.presc + '</b>' +
        '<span class="spw-calc">Fcy/frec/32767 = ' + agrupar(fcy) + ' / ' + agrupar(st.frec) + ' / 32' + NBSP + '767 = ' + r.raw +
        ' (división entera) → ' + (r.raw < 1 ? '&lt; 1 → 0' : r.raw < 4 ? '&lt; 4 → 1' : r.raw < 16 ? '&lt; 16 → 2' : '≥ 16 → 3') + '</span></td></tr>';
      var ptVal = '<b>' + agrupar(r.ptperReg) + '</b> <code>' + hex4(r.ptperReg) + '</code>';
      var ptDet = 'Fcy/frec/4^preesc = ' + cocTxt + ' / ' + r.presc + ' = ' + agrupar(r.ptperC) +
        (r.desborda ? ' → <span class="spw-mal">no cabe en 15 bits: el registro guarda ' + agrupar(r.ptperC) + ' &amp; 0x7FFF = ' + agrupar(r.ptperReg) + '</span>' : '') +
        '<br><span class="spw-ds">Datasheet (free-running): PTPER = F<sub>CY</sub>/(F<sub>PWM</sub>·presc) − 1 = ' + fx(r.ptperDs, 2) +
        (r.ptperDs > 32767 ? ' (tampoco cabe)' : (Math.abs(r.ptperDs - Math.round(r.ptperDs)) < 1e-6 ? '' : ' → ' + agrupar(Math.round(r.ptperDs)))) + '</span>';
      h += filaReg('PTPER', 'P1TPER', ptVal, ptDet);
      h += filaReg('PWMCON1', 'PWM1CON1', '<b>' + hex4(r.pwmcon1) + '</b>',
        'PMOD3-1 = ' + bin(st.pmod ? 7 : 0, 3) + (st.pmod ? ' (independientes)' : ' (complementarios)') +
        ' · PEN3H-1H = ' + bin(r.maskH, 3) + ' · PEN3L-1L = ' + bin(r.maskL, 3) +
        '<br>= ' + (st.pmod ? '0x0700' : '0x0000') + ' | (maskH &lt;&lt; 4) | maskL, maskH = ' + r.maskH + ', maskL = ' + r.maskL);
      h += filaReg('PTCON', 'P1TCON', '<b>' + hex4(r.ptcon) + '</b>',
        'PTEN = 1 · PTOPS = 0000 (1:1) · PTCKPS = ' + bin(r.preesc, 2) + ' (1:' + r.presc + ') · PTMOD = 00 (free-running)');
      r.canales.forEach(function (c, i) {
        var det = st.exacto
          ? 'escrito a mano: round(' + fx(c.dc, 1) + ' % · 2 · ' + agrupar(r.ptperReg) + ') = ' + agrupar(c.pdc)
          : 'set_dc(' + i + ', ' + Math.trunc(c.dc) + '): ' + Math.trunc(c.dc) + ' · (2·' + agrupar(r.ptperReg) + '/100 = ' + c.k + ') = ' + agrupar(c.pdc);
        det += ' · dirección ' + hex4(DIR_PDC[i]) + (st.exacto ? '' : ' = 0x1D6 + 2·' + i);
        h += filaReg('PDC' + (i + 1), 'P1DC' + (i + 1), '<b>' + agrupar(c.pdc) + '</b> <code>' + hex4(c.pdc) + '</code>', det);
      });
      h += '<tr><th scope="row">Frecuencia real</th><td><b>' + fmtF(r.fHw) + '</b> <span class="spw-tenue">(T = ' + fmtT(r.T) + ')</span>' +
        '<span class="spw-calc">Datasheet: F<sub>CY</sub>/(presc·(PTPER+1)) = ' + agrupar(fcy) + '/(' + r.presc + '·' + agrupar(r.ptperReg + 1) + ')' +
        ' · aproximada: F<sub>CY</sub>/(presc·PTPER) = ' + fmtF(r.fAprox) + ' · pedida: ' + fmtF(st.frec) + '</span></td></tr>';
      var dcs = r.canales.map(function (c, i) {
        return 'PDC' + (i + 1) + ': <b>' + fx(c.dcHw * 100, 2) + NBSP + '%</b> (' + fmtT(c.dcHw * r.T) + ' en alto)';
      }).join(' · ');
      h += '<tr><th scope="row">Ciclo de trabajo real</th><td>' + dcs +
        '<span class="spw-calc">DC = PDC / (2·(PTPER+1)) (comparación con resolución doble: PDC = PTPER → 50 %). El driver usa la fórmula aproximada PDC/(2·PTPER).</span></td></tr>';
      h += '<tr><th scope="row">Resolución</th><td>' + agrupar(2 * (r.ptperReg + 1)) + ' pasos de ciclo de trabajo (≈ ' + fx(Math.log(2 * (r.ptperReg + 1)) / Math.LN2, 1) + ' bits); ' +
        'una cuenta de PTMR = ' + fmtT(r.Tcuenta) + '</td></tr>';
      tbody.innerHTML = h;
    }

    function pintarAvisos(r) {
      var a = [];
      if (r.error) {
        a.push('<strong>init_pwm devuelve 1.</strong> El driver rechaza frec &lt; 20 Hz y no configura nada.');
      } else {
        if (r.desborda) {
          a.push('<strong>⚠ PTPER no cabe en 15 bits.</strong> El driver calcula ' + agrupar(r.ptperC) + ' (&gt; 32' + NBSP + '767) con 1:64, pero P1TPER solo guarda PTPER&lt;14:0&gt; = ' +
            agrupar(r.ptperReg) + ': la PWM sale a ' + fmtF(r.fHw) + ' en vez de ' + fmtF(st.frec) + '. ' +
            'Con F<sub>CY</sub> = ' + fcyTxt(r.fcy) + ' la frecuencia mínima es F<sub>CY</sub>/(64·32' + NBSP + '768) ≈ ' + fx(r.fcy / (64 * 32768), 2) + NBSP + 'Hz.');
        }
        if (!st.exacto && st.dc.some(function (d) { return d !== Math.trunc(d); })) {
          a.push('set_dc recibe un <code>int</code>: los decimales del ciclo de trabajo se pierden.');
        }
        var trunc = (2 * r.ptperReg) % 100;
        if (!st.exacto && trunc !== 0) {
          a.push('<code>2*PTPER/100</code> es una división entera: ' + agrupar(2 * r.ptperReg) + '/100 = ' + Math.floor(2 * r.ptperReg / 100) +
            ' (se pierden ' + fx(trunc / 100, 2) + '), así que el ciclo de trabajo sale algo menor que el pedido.');
        }
      }
      avisos.innerHTML = a.map(function (t) { return '<p class="spw-aviso">' + t + '</p>'; }).join('');
    }

    // ---------- formas de onda (SVG) ----------
    var X0 = 74, X1 = 352, ROW = 34;
    function dutyPin(p, r) {
      var d = r.canales[p.canal].dcHw;
      return p.h ? d : (st.pmod ? d : 1 - d);
    }
    function pintarOndas(r) {
      var H = 6 * ROW + 26;
      var s = '<svg viewBox="0 0 360 ' + H + '" class="spw-svg" role="img" aria-label="' + esc(textoOndas(r)) + '">';
      var P = (X1 - X0) / 2;
      for (var k = 0; k <= 2; k++) s += '<line x1="' + (X0 + k * P) + '" y1="4" x2="' + (X0 + k * P) + '" y2="' + (6 * ROW + 4) + '" class="spw-rej"/>';
      [1, 0, 3, 2, 5, 4].map(function (b) { return PINES[b]; }).forEach(function (p, fila) {
        var y0 = 4 + fila * ROW, yA = y0 + 7, yB = y0 + 25;
        var on = !r.error && !!(st.pines & (1 << p.bit));
        var d = on ? dutyPin(p, r) : 0;
        s += '<text x="2" y="' + (y0 + 13) + '" class="spw-on-n' + (on ? '' : ' spw-off') + '">' + p.nom + '</text>' +
          '<text x="2" y="' + (y0 + 26) + '" class="spw-on-s">RB' + p.rb + (on ? ' · ' + fx(d * 100, 1) + NBSP + '%' : ' · E/S') + '</text>';
        if (!on) {
          s += '<line x1="' + X0 + '" y1="' + (y0 + 16) + '" x2="' + X1 + '" y2="' + (y0 + 16) + '" class="spw-on-x"/>';
          return;
        }
        var pts = [];
        for (var c = 0; c < 2; c++) {
          var xs = X0 + c * P, xa = xs + d * P;
          if (d >= 1) pts.push([xs, yA], [xs + P, yA]);
          else if (d <= 0) pts.push([xs, yB], [xs + P, yB]);
          else pts.push([xs, yA], [xa, yA], [xa, yB], [xs + P, yB]);
        }
        s += '<polyline points="' + pts.map(function (q) { return q[0].toFixed(1) + ',' + q[1]; }).join(' ') + '" class="spw-on-d' + (p.h ? '' : ' spw-on-l') + '"/>';
      });
      if (!r.error) {
        s += '<text x="' + X0 + '" y="' + (H - 6) + '" class="spw-on-t">0</text>' +
          '<text x="' + (X0 + P) + '" y="' + (H - 6) + '" class="spw-on-t" text-anchor="middle">T = ' + fmtT(r.T) + '</text>' +
          '<text x="' + X1 + '" y="' + (H - 6) + '" class="spw-on-t" text-anchor="end">2T</text>';
      }
      divOndas.innerHTML = s + '</svg>';
    }
    function textoOndas(r) {
      if (r.error) return 'Sin señal PWM: init_pwm ha devuelto 1.';
      var t = [];
      PINES.forEach(function (p) {
        if (st.pines & (1 << p.bit)) t.push(p.nom + ' en alto el ' + fx(dutyPin(p, r) * 100, 1) + ' %');
      });
      return t.length ? 'Formas de onda: ' + t.join('; ') + '.' : 'Ningún pin habilitado para PWM.';
    }

    // ---------- LEDs ----------
    var ledEls = [];
    function pintarLeds(r) {
      var h = '<div class="spw-led-fila">';
      PINES.filter(function (p) { return p.led; }).forEach(function (p) {
        h += '<div class="spw-led-caja" data-bit="' + p.bit + '"><span class="spw-led" aria-hidden="true"></span>' +
          '<span class="spw-led-n">' + p.led + '</span><span class="spw-led-p">RB' + p.rb + ' · ' + p.nom + '</span>' +
          '<span class="spw-led-v"></span></div>';
      });
      divLeds.innerHTML = h + '</div><p class="spw-led-nota"></p>';
      ledEls = Array.prototype.slice.call(divLeds.querySelectorAll('.spw-led-caja'));
      actualizarLeds(r);
    }
    function actualizarLeds(r) {
      ledEls.forEach(function (caja) {
        var p = PINES[+caja.getAttribute('data-bit')];
        var on = !r.error && !!(st.pines & (1 << p.bit));
        var led = caja.querySelector('.spw-led'), v = caja.querySelector('.spw-led-v');
        caja.classList.toggle('spw-led-es', !on);
        if (!on) { led.style.opacity = ''; v.textContent = 'E/S normal'; caja.setAttribute('aria-label', p.led + ': pin ' + p.nom + ' no es PWM'); return; }
        var bajo = 1 - dutyPin(p, r);
        led.style.opacity = String(0.12 + 0.88 * bajo);
        v.textContent = 'luce ' + fx(bajo * 100, 1) + NBSP + '%';
        caja.setAttribute('aria-label', p.led + ' (RB' + p.rb + '): luce el ' + fx(bajo * 100, 1) + ' % del tiempo');
      });
      var nota = divLeds.querySelector('.spw-led-nota');
      if (r.error) nota.textContent = 'Sin PWM: los LEDs dependen de PORTB.';
      else if (parpadeo()) nota.textContent = 'A ' + fmtF(r.fHw) + ' el ojo ve el parpadeo: se muestra en tiempo real (brillo: tiempo en bajo).';
      else nota.textContent = 'Brillo ∝ (100 − dc en alto) %: el LED luce cuando el pin está a 0.' + (r.fHw < 25 ? ' (A esta frecuencia se vería parpadear.)' : '');
    }

    // parpadeo en tiempo real si la PWM es lenta
    var corriendo = false, visible = true;
    function parpadeo() { return R && !R.error && R.fHw < 25 && chkParp.checked; }
    function frame(ts) {
      if (!document.body.contains(el)) { corriendo = false; return; }
      if (!parpadeo() || !visible) { corriendo = false; actualizarLeds(R); return; }
      var t = ts / 1000, fase = (t * R.fHw) % 1;
      ledEls.forEach(function (caja) {
        var p = PINES[+caja.getAttribute('data-bit')];
        if (!(st.pines & (1 << p.bit))) return;
        var alto = fase < dutyPin(p, R);
        caja.querySelector('.spw-led').style.opacity = alto ? '0.12' : '1';
      });
      requestAnimationFrame(frame);
    }
    function arrancar() {
      if (corriendo || !parpadeo() || !visible) return;
      corriendo = true;
      requestAnimationFrame(frame);
    }

    // ---------- código C ----------
    function pintarCod(r) {
      var mask = hex2(st.pines);
      var L = [];
      L.push('#define Fcy ' + r.fcy);
      if (r.error) {
        L.push('init_pwm(' + st.frec + ', ' + mask + ');   // devuelve 1: frec < 15, no escribe nada');
        pintarCodigo(preCod, L.join('\n'));
        return;
      }
      L.push(pad('init_pwm(' + st.frec + ', ' + mask + ');', 30) + '// preesc = ' + r.preesc + ' (1:' + r.presc + ')');
      if (!st.exacto) {
        r.canales.forEach(function (c, i) {
          L.push(pad('set_dc(' + i + ', ' + Math.trunc(c.dc) + ');', 30) + '// PDC' + (i + 1) + ' = ' + c.pdc);
        });
      }
      L.push('');
      L.push('/* Equivale a escribir directamente los registros: */');
      L.push(pad('PTPER = ' + r.ptperReg + ';', 30) + '// P1TPER' + (r.desborda ? ' (el driver calcula ' + r.ptperC + ': no cabe)' : ''));
      L.push(pad('PWMCON1 = ' + hex4(r.pwmcon1) + ';', 30) + '// PWM1CON1' + (st.pmod ? '' : ' (driver modificado: 0x0000 | ...)'));
      r.canales.forEach(function (c, i) {
        L.push(pad('PDC' + (i + 1) + ' = ' + c.pdc + ';', 30) + '// P1DC' + (i + 1) + ' (' + hex4(DIR_PDC[i]) + '): ' + fx(c.dcHw * 100, 2) + ' %');
      });
      L.push(pad('PTCON = ' + hex4(r.ptcon) + ';', 30) + '// P1TCON: PTEN = 1, 1:' + r.presc + ' (siempre la última)');
      pintarCodigo(preCod, L.join('\n'));
    }

    function pintarResumen(r) {
      if (r.error) { resumen.textContent = 'init_pwm devuelve 1: frecuencia menor que 15 Hz.'; return; }
      resumen.innerHTML = 'preesc = <b>' + r.preesc + '</b> (1:' + r.presc + ') · PTPER = <b>' + agrupar(r.ptperReg) + '</b> · PWMCON1 = <b>' + hex4(r.pwmcon1) + '</b> · ' +
        'PTCON = <b>' + hex4(r.ptcon) + '</b> · f real = <b>' + fmtF(r.fHw) + '</b>' + (r.desborda ? ' <span class="spw-mal">⚠ PTPER desbordado</span>' : '');
    }

    function aplicar() {
      var r = calcular();
      pintarResumen(r);
      pintarAvisos(r);
      pintarTabla(r);
      pintarOndas(r);
      if (!ledEls.length) pintarLeds(r); else actualizarLeds(r);
      pintarCod(r);
      arrancar();
    }

    // ---------- eventos ----------
    selFcy.addEventListener('change', function () {
      st.fcy = normFcy(selFcy.value);
      sincronizarControles();
      aplicar();
    });
    function leerFrec() {
      var v = Number(String(inF.value).replace(',', '.'));
      if (!isFinite(v) || v < 1 || v > 32767 || Math.round(v) !== v) {
        errF.textContent = 'frec es un int del dsPIC: escribe un entero entre 1 y 32 767 Hz.';
        inF.setAttribute('aria-invalid', 'true');
        return;
      }
      errF.textContent = ''; inF.removeAttribute('aria-invalid');
      if (v === st.frec) return;
      st.frec = v;
      aplicar();
    }
    inF.addEventListener('change', leerFrec);
    inF.addEventListener('keydown', function (e) { if (e.key === 'Enter') leerFrec(); });
    selPmod.addEventListener('change', function () { st.pmod = +selPmod.value; aplicar(); });
    selModo.addEventListener('change', function () {
      st.exacto = selModo.value === 'exacto';
      if (!st.exacto) st.dc = st.dc.map(Math.trunc);
      sincronizarControles();
      aplicar();
    });
    Array.prototype.forEach.call(chks, function (c) {
      c.addEventListener('change', function () {
        var b = 1 << +c.getAttribute('data-bit');
        st.pines = c.checked ? (st.pines | b) : (st.pines & ~b);
        aplicar();
      });
    });
    function ponDc(i, v, origen) {
      v = Number(String(v).replace(',', '.'));
      if (!isFinite(v)) return;
      v = Math.max(0, Math.min(100, st.exacto ? Math.round(v * 10) / 10 : Math.round(v)));
      st.dc[i] = v;
      if (origen !== rDc[i]) rDc[i].value = String(v);
      if (origen !== nDc[i]) nDc[i].value = String(v);
      aplicar();
    }
    Array.prototype.forEach.call(rDc, function (r) { r.addEventListener('input', function () { ponDc(+r.getAttribute('data-i'), r.value, r); }); });
    Array.prototype.forEach.call(nDc, function (n) { n.addEventListener('change', function () { ponDc(+n.getAttribute('data-i'), n.value, null); }); });
    btnServo.addEventListener('click', function () {
      st.fcy = FCY_APROX; st.frec = 50; st.exacto = true; st.dc = [7.5, st.dc[1], st.dc[2]];
      st.pines = st.pines | 0x02;
      errF.textContent = ''; inF.removeAttribute('aria-invalid');
      sincronizarControles();
      aplicar();
    });
    btnIni.addEventListener('click', function () {
      st = inicial();
      if (!st.exacto) st.dc = st.dc.map(Math.round);
      errF.textContent = ''; inF.removeAttribute('aria-invalid');
      sincronizarControles();
      aplicar();
    });
    chkParp.addEventListener('change', function () { actualizarLeds(R); arrancar(); });
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (ents) {
        if (!document.body.contains(el)) { io.disconnect(); return; }
        visible = ents[ents.length - 1].isIntersecting;
        if (visible) arrancar();
      });
      io.observe(el);
    }

    sincronizarControles();
    aplicar();
  };
})();
