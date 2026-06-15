/*
 * Componente "filtro-pwm": un filtro RC actuando sobre una señal PWM, en el
 * dominio del tiempo. Se ve la entrada (onda cuadrada PWM con un offset de
 * continua) y la salida filtrada.
 *
 *   La PWM está CENTRADA en el offset V_dc, con amplitud (pico-pico) V_in:
 *   V_bajo = V_dc - V_in/2, V_alto = V_dc + V_in/2. (Ej.: offset 0 y amplitud
 *   2 V -> de -1 a +1; offset 1 V -> de 0 a 2 V.) Su valor medio (la CONTINUA,
 *   f = 0) es V_dc + V_in*(D - 1/2); con D = 50 % coincide con el offset V_dc.
 *
 *   Paso bajo (salida en C): v_C sigue dv_C/dt = (v_in - v_C)/tau,
 *     tau = R*C = 1/(2*pi*f_c). En régimen permanente la salida tiende al
 *     VALOR MEDIO (la continua pasa íntegra: en f=0 el condensador es un
 *     circuito abierto) -> un "DAC" sencillo; el rizado baja si tau >> T.
 *   Paso alto (salida en R): v_o = v_in - v_C; ELIMINA la continua (en f=0 no
 *     pasa corriente por R, media -> 0) y deja pasar los flancos, que decaen
 *     con tau.
 *
 * El régimen permanente se calcula de forma exacta (sin transitorio inicial).
 *
 * Uso: <div class="mpi-mount" data-componente="filtro-pwm" data-config='{}'></div>
 *   data-config opcional: {"tipo":"pb"|"pa"}
 */
window.MPI = window.MPI || {};
MPI.componentes = MPI.componentes || {};

(function () {
  var FC_MIN = 10, FC_MAX = 50000;        // Hz
  var FP_MIN = 100, FP_MAX = 50000;       // Hz
  var VIN_DEF = 2, VDC_DEF = 1, FC_DEF = 100, FP_DEF = 1000, DUTY_DEF = 0.5;
  var VDC_LIM = 2;                        // |offset| máximo (fija la ventana vertical)
  var WN = 4;                             // periodos de PWM mostrados

  // --- Geometria del SVG (viewBox 0 0 480 248) --------------------------------
  var X0 = 50, X1 = 470, Y0 = 18, Y1 = 206;

  function coma(s) { return String(s).replace('.', ','); }
  function fmtV(v) {
    var a = Math.abs(v);
    if (a >= 1 || v === 0) return coma(v.toFixed(2)) + ' V';
    return coma((v * 1000).toFixed(0)) + ' mV';
  }
  function fmtHz(f) {
    var val, uni;
    if (f >= 1e6)      { val = f / 1e6; uni = 'MHz'; }
    else if (f >= 1e3) { val = f / 1e3; uni = 'kHz'; }
    else               { val = f;       uni = 'Hz'; }
    var s = (Math.round(val * 100) / 100).toFixed(2).replace(/\.?0+$/, '');
    return coma(s) + ' ' + uni;
  }
  function fmtT(t) {
    var val, uni;
    if (t >= 1)         { val = t;        uni = 's'; }
    else if (t >= 1e-3) { val = t / 1e-3; uni = 'ms'; }
    else if (t >= 1e-6) { val = t / 1e-6; uni = 'µs'; }
    else                { val = t / 1e-9; uni = 'ns'; }
    var s = (Math.round(val * 100) / 100).toFixed(2).replace(/\.?0+$/, '');
    return coma(s) + ' ' + uni;
  }
  function fmtPct(d) {
    var s = (Math.round(d * 1000) / 10).toFixed(1).replace(/\.0$/, '');
    return coma(s) + ' %';
  }
  function posAval(pos, min, max) {
    var lmin = Math.log10(min), lmax = Math.log10(max);
    return Math.pow(10, lmin + (pos / 1000) * (lmax - lmin));
  }
  function valApos(val, min, max) {
    var lmin = Math.log10(min), lmax = Math.log10(max);
    return Math.round((Math.log10(val) - lmin) / (lmax - lmin) * 1000);
  }

  MPI.componentes['filtro-pwm'] = function (el, cfg) {
    el.classList.add('mpi-filtro-pwm');

    var tipo = (cfg && cfg.tipo === 'pa') ? 'pa' : 'pb';
    var Vin = VIN_DEF, Vdc = VDC_DEF, fc = FC_DEF, fpwm = FP_DEF, duty = DUTY_DEF;

    // rejilla de periodos (posiciones fijas: siempre WN periodos a lo ancho)
    var grid = '';
    for (var g = 1; g < WN; g++) {
      var xg = X0 + g / WN * (X1 - X0);
      grid += '<line x1="' + xg + '" y1="' + Y0 + '" x2="' + xg + '" y2="' + Y1 + '" stroke="var(--borde)" stroke-width="1" stroke-dasharray="2 4" opacity="0.4"/>';
    }

    el.innerHTML =
      '<div class="mpi-sim-cab">Filtro RC sobre una señal PWM</div>' +
      '<div class="fp-cuerpo">' +
        '<div class="fp-grafica">' +
          '<svg viewBox="0 0 480 248" class="fp-svg" aria-label="Entrada PWM y salida filtrada">' +
            grid +
            // ejes
            '<line x1="' + X0 + '" y1="' + Y1 + '" x2="' + X1 + '" y2="' + Y1 + '" stroke="var(--borde)" stroke-width="1.5"/>' +
            '<line x1="' + X0 + '" y1="' + Y0 + '" x2="' + X0 + '" y2="' + Y1 + '" stroke="var(--borde)" stroke-width="1.5"/>' +
            // etiquetas eje Y
            '<text class="fp-eje-hi" x="' + (X0 - 6) + '" y="0" font-size="9" fill="var(--txt-tenue)" text-anchor="end"></text>' +
            '<text class="fp-eje-0" x="' + (X0 - 6) + '" y="0" font-size="9" fill="var(--txt-tenue)" text-anchor="end">0</text>' +
            '<text class="fp-eje-lo" x="' + (X0 - 6) + '" y="0" font-size="9" fill="var(--txt-tenue)" text-anchor="end"></text>' +
            '<text x="' + ((X0 + X1) / 2) + '" y="' + (Y1 + 18) + '" font-size="9" fill="var(--txt-2)" text-anchor="middle">tiempo (' + WN + ' periodos de PWM)</text>' +
            // linea del offset V_dc (centro de la PWM)
            '<line class="fp-ldc" x1="' + X0 + '" y1="0" x2="' + X1 + '" y2="0" stroke="var(--txt-tenue)" stroke-width="1" stroke-dasharray="1 3" opacity="0.7"/>' +
            '<text class="fp-ldc-t" x="' + (X0 + 4) + '" y="0" font-size="8" fill="var(--txt-tenue)" text-anchor="start"></text>' +
            // linea del valor medio de la salida
            '<line class="fp-media" x1="' + X0 + '" y1="0" x2="' + X1 + '" y2="0" stroke="var(--amarillo)" stroke-width="1.2" stroke-dasharray="4 3" opacity="0.85"/>' +
            '<text class="fp-media-t" x="' + (X1 - 4) + '" y="0" font-size="8" fill="var(--amarillo)" text-anchor="end"></text>' +
            // ondas
            '<path class="fp-in" fill="none" stroke="var(--azul-cl)" stroke-width="1.6" stroke-dasharray="4 3" opacity="0.85"/>' +
            '<path class="fp-out" fill="none" stroke="var(--acento)" stroke-width="2.4"/>' +
            // leyenda
            '<line x1="' + (X1 - 168) + '" y1="12" x2="' + (X1 - 150) + '" y2="12" stroke="var(--azul-cl)" stroke-width="1.6" stroke-dasharray="4 3"/>' +
            '<text x="' + (X1 - 146) + '" y="15" font-size="8.5" fill="var(--azul-cl)" text-anchor="start">PWM (v_in)</text>' +
            '<line x1="' + (X1 - 78) + '" y1="12" x2="' + (X1 - 60) + '" y2="12" stroke="var(--acento)" stroke-width="2.4"/>' +
            '<text x="' + (X1 - 56) + '" y="15" font-size="8.5" fill="var(--acento)" text-anchor="start">salida</text>' +
          '</svg>' +
        '</div>' +
        '<div class="fp-panel">' +
          '<div class="fp-ctrl">' +
            '<span class="fp-lab">Tipo de filtro</span>' +
            '<div class="fp-seg">' +
              '<button type="button" class="fp-tipo" data-tipo="pb">Paso bajo</button>' +
              '<button type="button" class="fp-tipo" data-tipo="pa">Paso alto</button>' +
            '</div>' +
          '</div>' +
          '<div class="fp-ctrl">' +
            '<label class="fp-lab"><span>Amplitud V<sub>in</sub> (pico-pico) =</span> <strong class="fp-vin-lab"></strong></label>' +
            '<input type="range" class="fp-vin" min="0.5" max="4" step="0.1">' +
          '</div>' +
          '<div class="fp-ctrl">' +
            '<label class="fp-lab"><span>Offset V<sub>dc</sub> (centro) =</span> <strong class="fp-vdc-lab"></strong></label>' +
            '<input type="range" class="fp-vdc" min="-2" max="2" step="0.1">' +
          '</div>' +
          '<div class="fp-ctrl">' +
            '<label class="fp-lab"><span>Ciclo de trabajo D =</span> <strong class="fp-duty-lab"></strong></label>' +
            '<input type="range" class="fp-duty" min="0" max="100" step="1">' +
          '</div>' +
          '<div class="fp-ctrl">' +
            '<label class="fp-lab"><span>f<sub>pwm</sub> =</span> <strong class="fp-fp-lab"></strong></label>' +
            '<input type="range" class="fp-fp" min="0" max="1000" step="1">' +
          '</div>' +
          '<div class="fp-ctrl">' +
            '<label class="fp-lab"><span>f<sub>c</sub> del filtro =</span> <strong class="fp-fc-lab"></strong></label>' +
            '<input type="range" class="fp-fc" min="0" max="1000" step="1">' +
          '</div>' +
          '<div class="fp-tarjetas">' +
            '<div class="fp-tar fp-tar-med"><span class="fp-tar-tit">V<sub>o</sub> media (f=0)</span><strong class="fp-out-media"></strong></div>' +
            '<div class="fp-tar"><span class="fp-tar-tit">Rizado (pp)</span><strong class="fp-out-pp"></strong></div>' +
            '<div class="fp-tar"><span class="fp-tar-tit">τ = R·C</span><strong class="fp-out-tau"></strong></div>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="fp-formula"></div>' +
      '<div class="fp-nota nota"></div>';

    var slVin = el.querySelector('.fp-vin');
    var slVdc = el.querySelector('.fp-vdc');
    var slDuty = el.querySelector('.fp-duty');
    var slFp = el.querySelector('.fp-fp');
    var slFc = el.querySelector('.fp-fc');
    var botTipo = el.querySelectorAll('.fp-tipo');

    // Simulación del régimen permanente (exacto por tramos exponenciales).
    // La PWM está centrada en Vdc: V_bajo = Vdc - Vin/2, V_alto = Vdc + Vin/2.
    function simula() {
      var tau = 1 / (2 * Math.PI * fc);
      var T = 1 / fpwm;
      var th = duty * T, tl = T - th;
      var Vh = Vdc + Vin / 2, Vl = Vdc - Vin / 2;
      var a = Math.exp(-th / tau), b = Math.exp(-tl / tau);
      var den = 1 - a * b;
      // tensión del condensador al inicio del tramo alto, en régimen permanente
      var vC0 = den !== 0 ? (Vl * (1 - b) + b * Vh * (1 - a)) / den : (duty >= 1 ? Vh : Vl);

      var K = 44, inPts = [], outPts = [], vmin = Infinity, vmax = -Infinity, suma = 0, nsum = 0;
      var t = 0, vC = vC0;
      function muestra(tt, vin, vc) {
        var vo = tipo === 'pb' ? vc : (vin - vc);
        inPts.push([tt, vin]);
        outPts.push([tt, vo]);
        if (vo < vmin) vmin = vo;
        if (vo > vmax) vmax = vo;
        suma += vo; nsum++;
      }
      for (var p = 0; p < WN; p++) {
        if (th > 0) {
          for (var i = 0; i <= K; i++) {
            var dt = th * i / K;
            muestra(t + dt, Vh, Vh + (vC - Vh) * Math.exp(-dt / tau));
          }
          vC = Vh + (vC - Vh) * Math.exp(-th / tau);
          t += th;
        }
        if (tl > 0) {
          for (var j = 0; j <= K; j++) {
            var dt2 = tl * j / K;
            muestra(t + dt2, Vl, Vl + (vC - Vl) * Math.exp(-dt2 / tau));
          }
          vC = Vl + (vC - Vl) * Math.exp(-tl / tau);
          t += tl;
        }
      }
      return {
        inPts: inPts, outPts: outPts, T: T, tau: tau, Vh: Vh, Vl: Vl,
        vmin: vmin, vmax: vmax, pp: (vmax - vmin)
      };
    }

    function pintar() {
      // continua (valor medio) de la PWM = Vdc + Vin·(D − ½); con D=50% es Vdc.
      var media0 = Vdc + Vin * (duty - 0.5);

      // etiquetas de controles
      el.querySelector('.fp-vin-lab').textContent = fmtV(Vin);
      el.querySelector('.fp-vdc-lab').textContent = fmtV(Vdc);
      el.querySelector('.fp-duty-lab').textContent = fmtPct(duty);
      el.querySelector('.fp-fp-lab').textContent = fmtHz(fpwm);
      el.querySelector('.fp-fc-lab').textContent = fmtHz(fc);
      botTipo.forEach(function (b) { b.classList.toggle('fp-tipo-on', b.getAttribute('data-tipo') === tipo); });

      var s = simula();
      // valor medio EXACTO (el muestreo por tramos no es uniforme en el tiempo):
      // paso bajo -> media de la entrada V_dc + V_in·D; paso alto -> 0 (sin continua).
      var media = tipo === 'pb' ? media0 : 0;

      // rango vertical FIJO (no sigue al offset): así mover V_dc DESPLAZA la señal
      // en pantalla en vez de reescalar el eje. Cubre todo el recorrido del offset
      // (±VDC_LIM) más la amplitud, y el 0 queda siempre centrado.
      var escala = VDC_LIM + Vin / 2;
      var mrg = escala * 0.10;
      var hi = escala + mrg, lo = -escala - mrg;
      function vy(v) { return Y1 - (v - lo) / (hi - lo) * (Y1 - Y0); }
      function tx(t) { return X0 + (t / (WN * s.T)) * (X1 - X0); }

      // etiquetas del eje Y: niveles de la señal (V_alto y V_bajo, que se mueven
      // con el offset) y el 0 de referencia
      var eHi = el.querySelector('.fp-eje-hi'), e0 = el.querySelector('.fp-eje-0'), eLo = el.querySelector('.fp-eje-lo');
      if (Math.abs(s.Vh) > 0.04) { eHi.setAttribute('y', vy(s.Vh) + 3); eHi.textContent = fmtV(s.Vh); eHi.style.display = ''; }
      else { eHi.style.display = 'none'; }
      e0.setAttribute('y', vy(0) + 3);
      if (Math.abs(s.Vl) > 0.04) { eLo.setAttribute('y', vy(s.Vl) + 3); eLo.textContent = fmtV(s.Vl); eLo.style.display = ''; }
      else { eLo.style.display = 'none'; }

      // ondas
      function dpath(pts) {
        var d = '';
        for (var i = 0; i < pts.length; i++) d += (i === 0 ? 'M' : 'L') + tx(pts[i][0]).toFixed(2) + ' ' + vy(pts[i][1]).toFixed(2) + ' ';
        return d.trim();
      }
      el.querySelector('.fp-in').setAttribute('d', dpath(s.inPts));
      el.querySelector('.fp-out').setAttribute('d', dpath(s.outPts));

      // linea de continua V_dc (nivel bajo de la entrada): solo si está dentro del marco (pb)
      var ldc = el.querySelector('.fp-ldc'), ldct = el.querySelector('.fp-ldc-t');
      if (Math.abs(Vdc) > 0.01) {
        var yd = vy(Vdc);
        ldc.style.display = ''; ldct.style.display = '';
        ldc.setAttribute('y1', yd); ldc.setAttribute('y2', yd);
        ldct.setAttribute('y', yd - 3 < Y0 ? yd + 11 : yd - 3); ldct.textContent = 'offset V_dc = ' + fmtV(Vdc);
      } else { ldc.style.display = 'none'; ldct.style.display = 'none'; }

      // linea del valor medio de la salida
      var ym = vy(media);
      var lm = el.querySelector('.fp-media');
      lm.setAttribute('y1', ym); lm.setAttribute('y2', ym);
      var lmt = el.querySelector('.fp-media-t');
      lmt.setAttribute('y', ym - 3 < Y0 ? ym + 11 : ym - 3);
      lmt.textContent = 'media V_o = ' + fmtV(media);

      // tarjetas
      el.querySelector('.fp-out-media').textContent = fmtV(media);
      el.querySelector('.fp-out-pp').textContent = fmtV(s.pp);
      el.querySelector('.fp-out-tau').textContent = fmtT(s.tau);

      // formula
      el.querySelector('.fp-formula').innerHTML = tipo === 'pb'
        ? '<span class="fp-fmla">Paso bajo: salida → valor medio de la PWM = V<sub>dc</sub> + V<sub>in</sub>·(D &#8722; ½)</span>' +
          '<span class="fp-fmla-num">= ' + fmtV(Vdc) + ' + ' + fmtV(Vin) + '·(' + fmtPct(duty) + ' &#8722; 50&#160;%) = ' + fmtV(media0) + ' &#160;&#160;(τ = R·C = ' + fmtT(s.tau) + ')</span>'
        : '<span class="fp-fmla">Paso alto: v<sub>o</sub> = v<sub>in</sub> &#8722; v<sub>C</sub> &#8594; quita la continua (f=0) y deja los <strong>flancos</strong></span>' +
          '<span class="fp-fmla-num">media → 0 V aunque V<sub>dc</sub> = ' + fmtV(Vdc) + '; cada flanco decae con τ = R·C = ' + fmtT(s.tau) + '</span>';

      // nota pedagogica (con el comportamiento en f=0)
      var rel = s.tau * fpwm;
      var suave = rel >= 3 ? 'mucho mayor' : rel >= 0.7 ? 'comparable' : 'menor';
      if (tipo === 'pb') {
        el.querySelector('.fp-nota').innerHTML =
          'La <strong>continua</strong> de la PWM (su <strong>valor medio = ' + fmtV(media0) + '</strong>; con D=50&#160;% coincide con el offset <em>V<sub>dc</sub></em>) <strong>pasa íntegra</strong>: ' +
          'en <strong>f = 0</strong> el condensador es un circuito abierto, no cae tensión en <em>R</em> y la salida copia el nivel de continua. ' +
          'Así un paso bajo convierte la PWM en una tensión analógica (un <strong>DAC</strong>): cambiando <em>D</em> o <em>V<sub>dc</sub></em> cambias la salida. ' +
          'El <strong>rizado</strong> (' + fmtV(s.pp) + ' pp) baja cuanto mayor sea <strong>τ = ' + fmtT(s.tau) + '</strong> frente a <strong>T = ' + fmtT(s.T) + '</strong> ' +
          '(aquí τ es ' + suave + ' que T). Ver <em>«Temporizadores y PWM»</em>.';
      } else {
        el.querySelector('.fp-nota').innerHTML =
          'La <strong>continua se pierde</strong>: en <strong>f = 0</strong> el condensador es un circuito abierto, no circula corriente por <em>R</em> y la salida media cae a <strong>≈ 0 V</strong>, ' +
          'da igual cuánto valga <em>V<sub>dc</sub></em> (' + fmtV(Vdc) + '). El paso alto <strong>elimina el nivel de continua</strong> y deja pasar solo los <strong>flancos</strong> ' +
          '(los cambios bruscos), que aparecen como picos que decaen con <strong>τ = ' + fmtT(s.tau) + '</strong>. Cuanto más rápido el filtro (τ pequeño frente a T = ' + fmtT(s.T) + '), más finos los picos.';
      }
    }

    function sincronizaSliders() {
      slVin.value = String(Vin);
      slVdc.value = String(Vdc);
      slDuty.value = String(Math.round(duty * 100));
      slFp.value = valApos(fpwm, FP_MIN, FP_MAX);
      slFc.value = valApos(fc, FC_MIN, FC_MAX);
    }

    slVin.addEventListener('input', function () { Vin = Math.round(parseFloat(slVin.value) * 10) / 10; pintar(); });
    slVdc.addEventListener('input', function () { Vdc = Math.round(parseFloat(slVdc.value) * 10) / 10; pintar(); });
    slDuty.addEventListener('input', function () { duty = parseInt(slDuty.value, 10) / 100; pintar(); });
    slFp.addEventListener('input', function () { fpwm = posAval(parseInt(slFp.value, 10), FP_MIN, FP_MAX); pintar(); });
    slFc.addEventListener('input', function () { fc = posAval(parseInt(slFc.value, 10), FC_MIN, FC_MAX); pintar(); });
    botTipo.forEach(function (b) {
      b.addEventListener('click', function () { tipo = b.getAttribute('data-tipo'); pintar(); });
    });

    sincronizaSliders();
    pintar();
  };
})();
