/*
 * Componente "sim-servo": posición de un servo según el ancho del pulso (libro, 17.5.3 y figura 104).
 *
 *   Pulso de 0,5 ms a 2,5 ms repetido cada 20 ms (50 Hz); escala lineal sobre 180°:
 *     0,5 ms → −90°   1 ms → −45°   1,5 ms → 0°   2 ms → +45°   2,5 ms → +90°
 *     ancho (ms) = 1,5 + ángulo / 90
 *   Fuera de 0,5-2,5 ms el servo fuerza el tope mecánico y aumenta mucho el consumo.
 *
 * Uso: <div class="mpi-mount" data-componente="sim-servo" data-config='{"anchoMs":1.5,"periodoMs":20}'></div>
 *
 * Claves de data-config (opcionales):
 *   anchoMs    ancho inicial del pulso en ms (defecto 1,5; el deslizador admite 0,2-2,8 para ver el aviso)
 *   periodoMs  periodo de la señal en ms (defecto 20; admite 5-40)
 *   fcy        40000000 (defecto) o 39613750: solo para la ampliación (cuentas de timer y PWM)
 *
 * Ampliación: cuentas para generarlo
 *   a) con el Timer 1 a ticks de 0,5 ms, como el espantador del libro (19.6.2): PR1 = 0,5 ms · FCY = 20 000,
 *      periodo = 40 ticks y DC = 1…5 ticks;
 *   b) con el módulo PWM (cap. 20, fórmulas del driver del libro): PTPER = FCY / (f · presc) y
 *      PDC = 2 · PTPER · ancho / periodo (a 40 MHz y 50 Hz: presc 1:64, PTPER = 12 500, 1,5 ms → PDC1 = 1 875).
 */
window.MPI = window.MPI || {};
MPI.componentes = MPI.componentes || {};

(function () {
  var NBSP = ' ';
  var FCY_APROX = 40000000, FCY_EXACTO = 39613750;
  var PRESC_PWM = [1, 4, 16, 64];
  var uid = 0;

  // ---------- formato español ----------
  function agrupar(n) {
    var s = String(Math.abs(n));
    if (s.length >= 5) s = s.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
    return (n < 0 ? '−' : '') + s;
  }
  // como mucho nd decimales, sin ceros finales, coma decimal
  function fx(x, nd) {
    var s = Math.abs(x).toFixed(nd);
    if (s.indexOf('.') >= 0) s = s.replace(/0+$/, '').replace(/\.$/, '');
    var p = s.split('.');
    var neg = x < 0 && !/^0(\.0*)?$/.test(Math.abs(x).toFixed(nd));
    return (neg ? '−' : '') + agrupar(+p[0]) + (p[1] ? ',' + p[1] : '');
  }
  function grados(a) { var r = Math.round(a * 10) / 10; return (r > 0 ? '+' : '') + fx(r, 1) + '°'; }
  function hex4(v) { var s = (v >>> 0).toString(16).toUpperCase(); while (s.length < 4) s = '0' + s; return '0x' + s; }
  function numero(v, def, lo, hi) {
    var x = typeof v === 'string' ? parseFloat(v.replace(',', '.')) : Number(v);
    if (!isFinite(x)) return def;
    return Math.min(hi, Math.max(lo, x));
  }

  var VALORES = [ { w: 0.5, a: -90 }, { w: 1, a: -45 }, { w: 1.5, a: 0 }, { w: 2, a: 45 }, { w: 2.5, a: 90 } ];

  MPI.componentes['sim-servo'] = function (el, cfg) {
    cfg = cfg || {};
    var id = 'ssv' + (++uid);
    var W_MIN = 0.2, W_MAX = 2.8;
    var ancho = numero(cfg.anchoMs, 1.5, W_MIN, W_MAX);
    var T = numero(cfg.periodoMs, 20, 5, 40);
    var fcy = Math.abs(Number(cfg.fcy) - FCY_EXACTO) < 1000 ? FCY_EXACTO : FCY_APROX;

    var presets = VALORES.map(function (v) {
      return '<button type="button" data-w="' + v.w + '" aria-pressed="false">' + fx(v.w, 1) + NBSP + 'ms <span>' + grados(v.a) + '</span></button>';
    }).join('');

    el.classList.add('mpi-sim-servo');
    el.innerHTML =
      '<div class="mpi-sim-cab">Servo: el ancho del pulso fija el ángulo <span class="ssv-sub">pulso de 0,5 a 2,5 ms cada ' + fx(T, 2) + NBSP + 'ms</span></div>' +
      '<div class="ssv-ctl">' +
        '<div class="ssv-des"><label for="' + id + '-a">Ángulo</label>' +
          '<input type="range" id="' + id + '-a" class="ssv-in-a" min="-90" max="90" step="1">' +
          '<output for="' + id + '-a" class="ssv-out-a"></output></div>' +
        '<div class="ssv-des"><label for="' + id + '-w">Ancho del pulso</label>' +
          '<input type="range" id="' + id + '-w" class="ssv-in-w" min="' + W_MIN + '" max="' + W_MAX + '" step="0.01">' +
          '<output for="' + id + '-w" class="ssv-out-w"></output></div>' +
        '<div class="ssv-presets" role="group" aria-label="Valores del libro (ancho y ángulo)">' + presets + '</div>' +
      '</div>' +
      '<div class="ssv-panel" aria-live="polite"></div>' +
      '<div class="ssv-cuerpo">' +
        '<figure class="ssv-fig"><div class="ssv-servo"></div><figcaption>Servo visto desde arriba (brazo sobre el eje de salida)</figcaption></figure>' +
        '<figure class="ssv-fig"><div class="ssv-senal"></div><figcaption>Señal de control a escala y ampliación de 0 a 3 ms</figcaption></figure>' +
      '</div>' +
      '<section class="ssv-amp" aria-labelledby="' + id + '-amp">' +
        '<h4 id="' + id + '-amp">Ampliación: cómo generarlo con el dsPIC</h4>' +
        '<label class="ssv-fcy">F<sub>CY</sub> <select aria-label="Frecuencia de instrucción FCY">' +
          '<option value="' + FCY_APROX + '"' + (fcy === FCY_APROX ? ' selected' : '') + '>40' + NBSP + '000' + NBSP + '000 Hz (aproximado)</option>' +
          '<option value="' + FCY_EXACTO + '"' + (fcy === FCY_EXACTO ? ' selected' : '') + '>39' + NBSP + '613' + NBSP + '750 Hz (exacto)</option>' +
        '</select></label>' +
        '<div class="ssv-amp-cols">' +
          '<div class="ssv-amp-caja ssv-amp-timer"></div>' +
          '<div class="ssv-amp-caja ssv-amp-pwm"></div>' +
        '</div>' +
      '</section>';

    function $(s) { return el.querySelector(s); }
    var inA = $('.ssv-in-a'), inW = $('.ssv-in-w'), outA = $('.ssv-out-a'), outW = $('.ssv-out-w');
    var selF = $('.ssv-fcy select');

    function anguloDe(w) { return (w - 1.5) * 90; }
    function enRango(w) { return w >= 0.5 - 1e-9 && w <= 2.5 + 1e-9; }

    // ---------- dibujo del servo ----------
    var cx = 120, cy = 112, R = 70;
    (function servoEstatico() {
      var h = '<svg viewBox="0 0 240 204" class="ssv-svg ssv-svg-servo" role="img" aria-label="Servo con su brazo">';
      // cuerpo y orejetas de fijación
      h += '<rect x="6" y="4" width="228" height="196" rx="12" class="ssv-cuerpo-s"/>' +
        '<circle cx="20" cy="18" r="4.5" class="ssv-tornillo"/><circle cx="220" cy="18" r="4.5" class="ssv-tornillo"/>' +
        '<circle cx="20" cy="186" r="4.5" class="ssv-tornillo"/><circle cx="220" cy="186" r="4.5" class="ssv-tornillo"/>';
      // escala de ángulos
      for (var a = -90; a <= 90; a += 15) {
        var rad = a * Math.PI / 180, mayor = a % 45 === 0;
        var r1 = R + 4, r2 = R + (mayor ? 14 : 9);
        h += '<line x1="' + (cx + r1 * Math.sin(rad)).toFixed(1) + '" y1="' + (cy - r1 * Math.cos(rad)).toFixed(1) +
          '" x2="' + (cx + r2 * Math.sin(rad)).toFixed(1) + '" y2="' + (cy - r2 * Math.cos(rad)).toFixed(1) + '" class="ssv-marca' + (mayor ? ' ssv-marca-m' : '') + '"/>';
      }
      // topes mecánicos
      h += '<path d="' + arco(cx, cy, R + 4, 90, 100) + '" class="ssv-tope ssv-tope-d"/><path d="' + arco(cx, cy, R + 4, -100, -90) + '" class="ssv-tope ssv-tope-i"/>';
      [-90, -45, 0, 45, 90].forEach(function (a) {
        var rad = a * Math.PI / 180, r = R + 24;
        var x = cx + r * Math.sin(rad), y = cy - r * Math.cos(rad) + 4;
        if (a === 90 || a === -90) y = cy + 18;
        h += '<text x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" class="ssv-esc-t">' + grados(a) + '</text>';
      });
      h += '<circle cx="' + cx + '" cy="' + cy + '" r="' + R + '" class="ssv-disco"/>';
      h += '<g class="ssv-brazo" style="transform-origin:' + cx + 'px ' + cy + 'px">' +
        '<path d="M' + (cx - 11) + ',' + cy + ' L' + (cx - 6) + ',' + (cy - R + 6) + ' Q' + cx + ',' + (cy - R - 2) + ' ' + (cx + 6) + ',' + (cy - R + 6) + ' L' + (cx + 11) + ',' + cy + ' Z" class="ssv-brazo-p"/>' +
        '<circle cx="' + cx + '" cy="' + (cy - R + 14) + '" r="2.6" class="ssv-agujero"/><circle cx="' + cx + '" cy="' + (cy - R + 30) + '" r="2.6" class="ssv-agujero"/>' +
        '</g>';
      h += '<circle cx="' + cx + '" cy="' + cy + '" r="13" class="ssv-eje"/><text x="' + cx + '" y="' + (cy + 4) + '" class="ssv-eje-t">+</text>';
      h += '<text x="' + cx + '" y="148" class="ssv-ang-t"></text>';
      h += '<text x="' + cx + '" y="196" class="ssv-tope-aviso"></text>';
      $('.ssv-servo').innerHTML = h + '</svg>';
    })();
    function arco(x, y, r, a1, a2) {
      var p1 = [x + r * Math.sin(a1 * Math.PI / 180), y - r * Math.cos(a1 * Math.PI / 180)];
      var p2 = [x + r * Math.sin(a2 * Math.PI / 180), y - r * Math.cos(a2 * Math.PI / 180)];
      return 'M' + p1[0].toFixed(1) + ',' + p1[1].toFixed(1) + ' A' + r + ',' + r + ' 0 0 1 ' + p2[0].toFixed(1) + ',' + p2[1].toFixed(1);
    }

    // ---------- señal ----------
    function senal() {
      var Wv = 360, x0 = 34, xf = 350, ok = enRango(ancho);
      var h = '<svg viewBox="0 0 ' + Wv + ' 262" class="ssv-svg" role="img" aria-label="Señal de control: pulso de ' + fx(ancho, 3) + ' ms cada ' + fx(T, 2) + ' ms">';
      // --- a escala: dos periodos ---
      var esc = (xf - x0) / (2 * T), yb = 76, ya = 40;
      h += '<text x="4" y="14" class="ssv-tit">A escala (2 periodos)</text>';
      h += '<text x="' + (x0 - 6) + '" y="' + (ya + 4) + '" class="ssv-ylab">1</text><text x="' + (x0 - 6) + '" y="' + (yb + 4) + '" class="ssv-ylab">0</text>';
      var pts = [[x0, yb]];
      for (var k = 0; k < 2; k++) {
        var xs = x0 + k * T * esc, xe = xs + ancho * esc;
        pts.push([xs, yb], [xs, ya], [xe, ya], [xe, yb]);
      }
      pts.push([xf, yb]);
      h += '<polyline points="' + pts.map(function (p) { return p[0].toFixed(1) + ',' + p[1]; }).join(' ') + '" class="ssv-onda' + (ok ? '' : ' ssv-onda-mal') + '"/>';
      // cota del periodo
      var xT = x0 + T * esc;
      h += cotaH(x0, xT, yb + 16, fx(T, 2) + NBSP + 'ms (' + fx(1000 / T, 2) + NBSP + 'Hz)', 'ssv-cota');
      h += '<line x1="' + xT + '" y1="' + (ya - 4) + '" x2="' + xT + '" y2="' + (yb + 20) + '" class="ssv-guia"/>';
      // cota del ancho (texto a la derecha del pulso)
      var xe0 = x0 + ancho * esc;
      h += '<line x1="' + x0 + '" y1="' + (ya - 8) + '" x2="' + xe0 + '" y2="' + (ya - 8) + '" class="ssv-cota-l" marker-start="url(#' + id + '-fl)" marker-end="url(#' + id + '-fr)"/>' +
        '<text x="' + (xe0 + 5) + '" y="' + (ya - 5) + '" class="ssv-cota-t ssv-cota-t-i">' + fx(ancho, 3) + NBSP + 'ms</text>';

      // --- ampliación 0-3 ms ---
      var Z = 3, ez = (xf - x0) / Z, yb2 = 196, ya2 = 136;
      h += '<text x="4" y="118" class="ssv-tit">Ampliación de 0 a 3 ms</text>';
      h += '<rect x="' + (x0 + 0.5 * ez) + '" y="' + (ya2 - 6) + '" width="' + (2 * ez) + '" height="' + (yb2 - ya2 + 6) + '" class="ssv-banda"/>';
      VALORES.forEach(function (v) {
        var x = x0 + v.w * ez;
        h += '<line x1="' + x + '" y1="' + (ya2 - 6) + '" x2="' + x + '" y2="' + (yb2 + 4) + '" class="ssv-guia"/>' +
          '<text x="' + x + '" y="' + (yb2 + 16) + '" class="ssv-tick">' + fx(v.w, 1) + '</text>' +
          '<text x="' + x + '" y="' + (yb2 + 29) + '" class="ssv-tick ssv-tick-a">' + grados(v.a) + '</text>';
      });
      h += '<text x="' + (x0 - 6) + '" y="' + (yb2 + 16) + '" class="ssv-ylab">ms</text>';
      h += '<text x="' + (x0 + 1.5 * ez) + '" y="' + (ya2 - 10) + '" class="ssv-banda-t">zona válida del flanco de bajada</text>';
      var xw = x0 + Math.min(ancho, Z) * ez;
      h += '<polyline points="' + x0 + ',' + yb2 + ' ' + x0 + ',' + ya2 + ' ' + xw.toFixed(1) + ',' + ya2 + ' ' + xw.toFixed(1) + ',' + yb2 + ' ' + xf + ',' + yb2 + '" class="ssv-onda' + (ok ? '' : ' ssv-onda-mal') + '"/>';
      h += cotaH(x0, xw, ya2 + 22, fx(ancho, 3) + NBSP + 'ms', ok ? 'ssv-cota' : 'ssv-cota ssv-cota-mal');
      h += '<text x="' + x0 + '" y="' + (yb2 + 44) + '" class="ssv-pie">ciclo de trabajo = ' + fx(ancho, 3) + ' / ' + fx(T, 2) + ' = ' + fx(100 * ancho / T, 2) + NBSP + '%</text>';
      h += '<defs><marker id="' + id + '-fr" viewBox="0 0 8 8" refX="7.5" refY="4" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0 L8,4 L0,8 z" class="ssv-flecha"/></marker>' +
        '<marker id="' + id + '-fl" viewBox="0 0 8 8" refX="0.5" refY="4" markerWidth="6" markerHeight="6" orient="auto"><path d="M8,0 L0,4 L8,8 z" class="ssv-flecha"/></marker></defs>';
      $('.ssv-senal').innerHTML = h + '</svg>';
    }
    function cotaH(xa, xb, y, txt, cls) {
      return '<g class="' + cls + '"><line x1="' + xa + '" y1="' + y + '" x2="' + xb + '" y2="' + y + '" class="ssv-cota-l" marker-start="url(#' + id + '-fl)" marker-end="url(#' + id + '-fr)"/>' +
        '<text x="' + ((xa + xb) / 2) + '" y="' + (y - 4) + '" class="ssv-cota-t">' + txt + '</text></g>';
    }

    // ---------- ampliación ----------
    function ampliacion() {
      var tick = 0.5; // ms, como el espantador
      var pr1Exacto = tick / 1000 * fcy, pr1 = Math.round(pr1Exacto);
      var ticksT = Math.round(T / tick), ticksW = Math.round(ancho / tick);
      var exacto = Math.abs(ticksW * tick - ancho) < 1e-6;
      var hT = '<h5>Con el Timer 1 a ticks de 0,5 ms <span>(espantador, 19.6.2)</span></h5><table><tbody>' +
        '<tr><th scope="row">Tick</th><td>0,5' + NBSP + 'ms → <code>PR1 = ' + agrupar(pr1) + '</code>' + (Math.abs(pr1Exacto - pr1) > 1e-6 ? ' <small>(' + fx(pr1Exacto, 3) + ')</small>' : '') + ', <code>T1CON = 0x8000</code> (1:1)</td></tr>' +
        '<tr><th scope="row">Periodo</th><td><b>' + ticksT + '</b> ticks = ' + fx(ticksT * tick, 1) + NBSP + 'ms</td></tr>' +
        '<tr><th scope="row">DC (ticks a 1)</th><td><b>' + ticksW + '</b> ticks = ' + fx(ticksW * tick, 1) + NBSP + 'ms → ' + grados(Math.max(-90, Math.min(90, anguloDe(ticksW * tick)))) +
          (exacto ? '' : '<br><span class="ssv-nota-m">' + fx(ancho, 3) + NBSP + 'ms no es múltiplo de 0,5 ms: con este tick solo se consiguen 0,5 · 1 · 1,5 · 2 · 2,5 ms (pasos de 45°); se redondea a ' + ticksW + ' ticks.</span>') + '</td></tr>' +
        '</tbody></table><p class="ssv-amp-nota">En la ISR: <code>if (tick &lt; DC) salida = 1; else salida = 0;</code> y <code>tick</code> vuelve a 0 al llegar a ' + ticksT + '. El espantador usa DC = 1…5 (−90°…+90°) y DC = 3 en reposo.</p>';
      $('.ssv-amp-timer').innerHTML = hT;

      var f = 1000 / T, k = 0;
      while (k < 3 && fcy / (f * PRESC_PWM[k]) > 32767) k++;
      var presc = PRESC_PWM[k], ptperEx = fcy / (f * presc), ptper = Math.round(ptperEx);
      var pdc = Math.round(2 * ptper * ancho / T);
      var resUs = T * 1000 / (2 * ptper);
      var hP = '<h5>Con el módulo PWM <span>(cap. 20)</span></h5><table><tbody>' +
        '<tr><th scope="row">Frecuencia</th><td>' + fx(f, 2) + NBSP + 'Hz → F<sub>CY</sub>/f = ' + agrupar(Math.round(fcy / f)) + ' &gt; 32' + NBSP + '767 ⇒ pre-escalado <b>1:' + presc + '</b> (<code>PTCON = ' + hex4(0x8000 | (k << 2)) + '</code>)</td></tr>' +
        '<tr><th scope="row">PTPER</th><td><code>PTPER = ' + agrupar(ptper) + '</code> <small>= F<sub>CY</sub> / (f · ' + presc + ')' + (Math.abs(ptperEx - ptper) > 1e-6 ? ' = ' + fx(ptperEx, 2) : '') + '</small></td></tr>' +
        '<tr><th scope="row">PDC1</th><td><code>PDC1 = ' + agrupar(pdc) + '</code> <small>= 2 · PTPER · ' + fx(ancho, 3) + ' / ' + fx(T, 2) + '</small></td></tr>' +
        '<tr><th scope="row">Resolución</th><td>1 cuenta de PDC = ' + fx(resUs, 3) + NBSP + 'µs ≈ ' + fx(resUs / 1000 * 90, 3) + '°</td></tr>' +
        '</tbody></table><p class="ssv-amp-nota">Fórmulas del driver del libro: PTPER = F<sub>CY</sub>/(f·presc) y un PDC igual a PTPER da el 50 %. ' +
        'Su función <code>set_dc(pin, dc)</code> recibe el ciclo en % entero: 1 % de 20 ms son 0,2 ms (18°), demasiado grueso para un servo; mejor escribir PDC1 directamente.</p>';
      $('.ssv-amp-pwm').innerHTML = hP;
    }

    // ---------- pintar ----------
    function pintar(origen) {
      var ok = enRango(ancho);
      var ang = anguloDe(ancho), angServo = Math.max(-90, Math.min(90, ang));
      if (origen !== 'a') inA.value = String(Math.round(angServo));
      if (origen !== 'w') inW.value = String(ancho);
      outA.textContent = grados(angServo);
      outW.textContent = fx(ancho, 3) + NBSP + 'ms';
      inA.setAttribute('aria-valuetext', grados(angServo));
      inW.setAttribute('aria-valuetext', fx(ancho, 3) + ' milisegundos');
      var bs = el.querySelectorAll('.ssv-presets button');
      for (var i = 0; i < bs.length; i++) bs[i].setAttribute('aria-pressed', String(Math.abs(+bs[i].getAttribute('data-w') - ancho) < 1e-6));

      var brazo = el.querySelector('.ssv-brazo');
      brazo.style.transform = 'rotate(' + angServo + 'deg)';
      el.querySelector('.ssv-ang-t').textContent = grados(angServo);
      el.querySelector('.ssv-tope-aviso').textContent = ok ? '' : 'contra el tope';
      el.querySelector('.ssv-disco').classList.toggle('ssv-disco-mal', !ok);
      var topeD = el.querySelector('.ssv-tope-d'), topeI = el.querySelector('.ssv-tope-i');
      topeD.classList.toggle('ssv-tope-on', !ok && ang > 0);
      topeI.classList.toggle('ssv-tope-on', !ok && ang < 0);

      var p = '<div class="ssv-res"><span>Ancho <b>' + fx(ancho, 3) + NBSP + 'ms</b></span>' +
        '<span>Ángulo <b>' + grados(angServo) + '</b></span>' +
        '<span>Periodo <b>' + fx(T, 2) + NBSP + 'ms</b> (' + fx(1000 / T, 2) + NBSP + 'Hz)</span>' +
        '<span>Ciclo de trabajo <b>' + fx(100 * ancho / T, 2) + NBSP + '%</b></span></div>' +
        '<p class="ssv-formula">ancho (ms) = 1,5 + ángulo / 90  ⇔  ángulo = (ancho − 1,5) · 90 = (' + fx(ancho, 3) + ' − 1,5) · 90 = ' + grados(ang) + '</p>';
      if (!ok) {
        p += '<p class="ssv-aviso" role="alert"><strong>Fuera de rango (' + fx(ancho, 3) + NBSP + 'ms).</strong> El pulso pide ' + grados(ang) +
          ', más allá del tope de ' + grados(angServo) + ': el servo fuerza el tope, se bloquea y aumenta mucho el consumo (incluso se puede quemar). Mantén el ancho entre 0,5 y 2,5 ms.</p>';
      }
      if (Math.abs(T - 20) > 1e-6) p += '<p class="ssv-nota-m">El libro usa un periodo de unos 20 ms (50 Hz); la posición la da el ancho del pulso, no el ciclo de trabajo.</p>';
      $('.ssv-panel').innerHTML = p;
      senal();
      ampliacion();
    }

    inA.addEventListener('input', function () { ancho = 1.5 + (+inA.value) / 90; pintar('a'); });
    inW.addEventListener('input', function () { ancho = Math.round(+inW.value * 1000) / 1000; pintar('w'); });
    selF.addEventListener('change', function () { fcy = +selF.value; ampliacion(); });
    $('.ssv-presets').addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      ancho = +b.getAttribute('data-w');
      pintar();
    });

    pintar();
  };
})();
