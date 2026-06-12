/*
 * Componente "transitorio-rc": el transitorio de un circuito RC en vivo.
 * Una resistencia R en serie con un condensador C; al conmutar, la tensión
 * del condensador evoluciona exponencialmente hacia su valor final:
 *   tau = R * C,   v(t) = Vf + (Vi - Vf) * e^(-t/tau).
 * Se puede elegir CARGA (de 0 a Vf) o DESCARGA (de Vi=Vf a 0) y la tensión
 * de alimentacion (3,3 o 5 V). Los sliders de R y C recalculan al instante;
 * el botón "play" anima el punto sobre la curva. Se marcan tau (~63 %) y
 * 5*tau (~99,3 %).
 *
 * Estado inicial coherente con el ejemplo del tema (2.11 / ejercicio tc-rc):
 *   R = 10 kOhm, C = 10 uF  ->  tau = 100 ms,  5*tau = 500 ms.
 *
 * Uso: <div class="mpi-mount" data-componente="transitorio-rc" data-config='{}'></div>
 */
window.MPI = window.MPI || {};
MPI.componentes = MPI.componentes || {};

(function () {
  var R_MIN = 100, R_MAX = 100000;        // ohm
  var C_MIN = 1e-9, C_MAX = 1000e-6;      // faradios (1 nF .. 1000 uF)
  var T_FIN = 6;                          // eje horizontal: hasta 6*tau

  // --- Geometria del SVG (coordenadas internas, viewBox 0 0 460 240) -----------
  var X0 = 52, X1 = 440, Y0 = 24, Y1 = 196;   // marco del area de dibujo

  // --- Formato con coma decimal -----------------------------------------------
  function coma(s) { return String(s).replace('.', ','); }

  function fmtV(v) {
    if (v >= 1 || v === 0) return coma(v.toFixed(2)) + ' V';
    return coma((v * 1000).toFixed(0)) + ' mV';
  }
  function fmtR(r) {
    if (r >= 1000) {
      var k = r / 1000;
      var s = (Math.round(k * 10) / 10).toFixed(1);
      if (s.slice(-2) === '.0') s = s.slice(0, -2);
      return coma(s) + ' kΩ';
    }
    var o = (Math.round(r * 10) / 10).toFixed(1);
    if (o.slice(-2) === '.0') o = o.slice(0, -2);
    return coma(o) + ' Ω';
  }
  // Capacidad: elige nF / uF / mF según magnitud, sin ceros sobrantes.
  function fmtC(c) {
    var val, uni;
    if (c >= 1e-3)      { val = c / 1e-3;  uni = 'mF'; }
    else if (c >= 1e-6) { val = c / 1e-6;  uni = 'µF'; }
    else                { val = c / 1e-9;  uni = 'nF'; }
    var s = (Math.round(val * 100) / 100).toFixed(2);
    if (s.slice(-3) === '.00') s = s.slice(0, -3);
    else if (s.slice(-1) === '0') s = s.slice(0, -1);
    return coma(s) + ' ' + uni;
  }
  // Tiempo: elige ns / us / ms / s según magnitud, sin ceros sobrantes.
  function fmtT(t) {
    var val, uni;
    if (t >= 1)         { val = t;        uni = 's'; }
    else if (t >= 1e-3) { val = t / 1e-3; uni = 'ms'; }
    else if (t >= 1e-6) { val = t / 1e-6; uni = 'µs'; }
    else                { val = t / 1e-9; uni = 'ns'; }
    var s = (Math.round(val * 100) / 100).toFixed(2);
    if (s.slice(-3) === '.00') s = s.slice(0, -3);
    else if (s.slice(-1) === '0') s = s.slice(0, -1);
    return coma(s) + ' ' + uni;
  }

  // Slider logaritmico (0..1000) <-> valor en [min, max].
  function posAval(pos, min, max) {
    var lmin = Math.log10(min), lmax = Math.log10(max);
    return Math.pow(10, lmin + (pos / 1000) * (lmax - lmin));
  }
  function valApos(val, min, max) {
    var lmin = Math.log10(min), lmax = Math.log10(max);
    return Math.round((Math.log10(val) - lmin) / (lmax - lmin) * 1000);
  }

  MPI.componentes['transitorio-rc'] = function (el, cfg) {
    el.classList.add('mpi-transitorio-rc');

    // Estado: ejemplo del tema -> tau = 100 ms.
    var R = 10000;        // ohm
    var C = 10e-6;        // faradios
    var Vf = 5;           // tensión final / de alimentacion
    var modo = 'carga';   // 'carga' (0->Vf) o 'descarga' (Vi->0)
    var timer = null, anim = 0;   // anim: fraccion 0..1 del eje (t/(T_FIN*tau))

    el.innerHTML =
      '<div class="mpi-sim-cab">Transitorio RC: carga y descarga del condensador</div>' +
      '<div class="rc-cuerpo">' +
        // --- Grafica SVG ---
        '<div class="rc-grafica">' +
          '<svg viewBox="0 0 460 240" class="rc-svg" aria-label="Curva del transitorio RC">' +
            // ejes
            '<line x1="' + X0 + '" y1="' + Y1 + '" x2="' + X1 + '" y2="' + Y1 + '" stroke="var(--borde)" stroke-width="1.5"/>' +
            '<line x1="' + X0 + '" y1="' + Y0 + '" x2="' + X0 + '" y2="' + Y1 + '" stroke="var(--borde)" stroke-width="1.5"/>' +
            // etiquetas de eje
            '<text x="' + (X0 - 6) + '" y="' + (Y0 + 4) + '" font-size="9" fill="var(--txt-tenue)" text-anchor="end" class="rc-eje-vf"></text>' +
            '<text x="' + (X0 - 6) + '" y="' + (Y1 + 3) + '" font-size="9" fill="var(--txt-tenue)" text-anchor="end">0</text>' +
            '<text x="' + ((X0 + X1) / 2) + '" y="' + (Y1 + 18) + '" font-size="9" fill="var(--txt-2)" text-anchor="middle">tiempo (en multiplos de τ)</text>' +
            '<text x="36" y="' + ((Y0 + Y1) / 2) + '" font-size="9" fill="var(--txt-2)" text-anchor="middle" transform="rotate(-90 36 ' + ((Y0 + Y1) / 2) + ')">v(t)</text>' +
            // lineas de referencia tau (63%) y 5*tau (99,3%)
            '<line class="rc-ref63" x1="' + X0 + '" y1="0" x2="' + X1 + '" y2="0" stroke="var(--amarillo)" stroke-width="1" stroke-dasharray="3 3" opacity="0.6"/>' +
            '<text class="rc-ref63-t" x="' + (X1 - 4) + '" y="0" font-size="8" fill="var(--amarillo)" text-anchor="end"></text>' +
            // marca vertical en tau
            '<line class="rc-vtau" x1="0" y1="' + Y0 + '" x2="0" y2="' + Y1 + '" stroke="var(--amarillo)" stroke-width="1" stroke-dasharray="2 3" opacity="0.7"/>' +
            '<text class="rc-vtau-t" x="0" y="' + (Y1 + 12) + '" font-size="8" fill="var(--amarillo)" text-anchor="middle">τ</text>' +
            // marca vertical en 5*tau
            '<line class="rc-v5tau" x1="0" y1="' + Y0 + '" x2="0" y2="' + Y1 + '" stroke="var(--verde)" stroke-width="1" stroke-dasharray="2 3" opacity="0.7"/>' +
            '<text class="rc-v5tau-t" x="0" y="' + (Y1 + 12) + '" font-size="8" fill="var(--verde)" text-anchor="middle">5τ</text>' +
            // curva
            '<path class="rc-curva" fill="none" stroke="var(--acento)" stroke-width="2.5"/>' +
            // punto animado
            '<circle class="rc-punto" r="4.5" fill="var(--rojo)"/>' +
            '<text class="rc-punto-t" font-size="9" fill="var(--rojo)" text-anchor="middle"></text>' +
          '</svg>' +
        '</div>' +
        // --- Controles ---
        '<div class="rc-panel">' +
          '<div class="rc-ctrl">' +
            '<label class="rc-lab">R = <strong class="rc-r-lab"></strong></label>' +
            '<input type="range" class="rc-r" min="0" max="1000" step="1">' +
          '</div>' +
          '<div class="rc-ctrl">' +
            '<label class="rc-lab">C = <strong class="rc-c-lab"></strong></label>' +
            '<input type="range" class="rc-c" min="0" max="1000" step="1">' +
          '</div>' +
          '<div class="rc-ctrl rc-ctrl-fila">' +
            '<label class="rc-lab">Operacion ' +
              '<select class="rc-modo">' +
                '<option value="carga" selected>Carga (0 → V_f)</option>' +
                '<option value="descarga">Descarga (V_i → 0)</option>' +
              '</select>' +
            '</label>' +
            '<label class="rc-lab">V<sub>f</sub> ' +
              '<select class="rc-vf">' +
                '<option value="3.3">3,3 V</option>' +
                '<option value="5" selected>5 V</option>' +
              '</select>' +
            '</label>' +
          '</div>' +
          '<div class="rc-botones">' +
            '<button type="button" class="rc-play">▶ Animar</button>' +
            '<button type="button" class="rc-reset">Reiniciar ↺</button>' +
          '</div>' +
          '<div class="rc-tarjetas">' +
            '<div class="rc-tar rc-tar-tau"><span class="rc-tar-tit">τ = R·C</span><strong class="rc-out-tau"></strong></div>' +
            '<div class="rc-tar rc-tar-5tau"><span class="rc-tar-tit">5τ (≈ 99,3 %)</span><strong class="rc-out-5tau"></strong></div>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="rc-formula"></div>' +
      '<div class="rc-nota nota"></div>' +
      '<pre class="rc-codigo"><code class="lang-python"></code></pre>';

    var slR = el.querySelector('.rc-r');
    var slC = el.querySelector('.rc-c');
    var selModo = el.querySelector('.rc-modo');
    var selVf = el.querySelector('.rc-vf');
    var btnPlay = el.querySelector('.rc-play');

    // tensión inicial y final según el modo
    function vIni() { return modo === 'carga' ? 0 : Vf; }
    function vFin() { return modo === 'carga' ? Vf : 0; }

    // v(t) = Vf_curva + (Vi - Vf_curva) * e^(-t/tau)
    function vt(t, tau) {
      var vi = vIni(), vfc = vFin();
      return vfc + (vi - vfc) * Math.exp(-t / tau);
    }

    // mapeo a coordenadas SVG (s = t/tau en [0, T_FIN]; v en [0, Vf])
    function sx(s) { return X0 + (s / T_FIN) * (X1 - X0); }
    function vy(v) { return Y1 - (Vf > 0 ? (v / Vf) : 0) * (Y1 - Y0); }

    function detenAnim() {
      if (timer) { clearInterval(timer); timer = null; }
      btnPlay.innerHTML = '▶ Animar';
    }

    function pintar() {
      var tau = R * C;

      // etiquetas de sliders
      el.querySelector('.rc-r-lab').textContent = fmtR(R);
      el.querySelector('.rc-c-lab').textContent = fmtC(C);

      // tarjetas
      el.querySelector('.rc-out-tau').textContent = fmtT(tau);
      el.querySelector('.rc-out-5tau').textContent = fmtT(5 * tau);

      // etiqueta del eje vertical (valor final/maximo del eje = Vf)
      el.querySelector('.rc-eje-vf').textContent = coma(Vf.toFixed(1).replace(/\.0$/, '')) + ' V';

      // curva: muestreo de N puntos sobre 6*tau
      var N = 120, d = '';
      for (var i = 0; i <= N; i++) {
        var s = (i / N) * T_FIN;       // t/tau
        var t = s * tau;
        var v = vt(t, tau);
        d += (i === 0 ? 'M' : 'L') + sx(s).toFixed(2) + ' ' + vy(v).toFixed(2) + ' ';
      }
      el.querySelector('.rc-curva').setAttribute('d', d.trim());

      // linea de referencia 63 %: en t=tau el camino recorrido es el 63,2 %.
      var vTau = vt(tau, tau);
      var yRef = vy(vTau);
      var lref = el.querySelector('.rc-ref63');
      lref.setAttribute('y1', yRef); lref.setAttribute('y2', yRef);
      var tref = el.querySelector('.rc-ref63-t');
      tref.setAttribute('y', yRef - 3 < Y0 ? yRef + 10 : yRef - 3);
      tref.textContent = (modo === 'carga' ? '63 % de V_f' : 'queda 37 %') + ' en τ';

      // marca vertical en tau (s=1) y en 5*tau (s=5)
      var xTau = sx(1), x5 = sx(5);
      var ltau = el.querySelector('.rc-vtau'), l5 = el.querySelector('.rc-v5tau');
      ltau.setAttribute('x1', xTau); ltau.setAttribute('x2', xTau);
      l5.setAttribute('x1', x5);   l5.setAttribute('x2', x5);
      el.querySelector('.rc-vtau-t').setAttribute('x', xTau);
      el.querySelector('.rc-v5tau-t').setAttribute('x', x5);

      // punto animado
      var sP = anim * T_FIN;          // t/tau actual
      var tP = sP * tau;
      var vP = vt(tP, tau);
      var pt = el.querySelector('.rc-punto');
      var px = sx(sP), py = vy(vP);
      pt.setAttribute('cx', px); pt.setAttribute('cy', py);
      var ptt = el.querySelector('.rc-punto-t');
      ptt.setAttribute('x', px);
      ptt.setAttribute('y', py - 8 < Y0 ? py + 16 : py - 8);
      ptt.textContent = fmtV(vP);

      // formula con valores sustituidos
      var vi = vIni(), vfc = vFin();
      el.querySelector('.rc-formula').innerHTML =
        '<span class="rc-fmla">v(t) = V<sub>f</sub> + (V<sub>i</sub> &#8722; V<sub>f</sub>) &#8901; e<sup>&#8722;t/τ</sup></span>' +
        '<span class="rc-fmla-num">= ' + fmtV(vfc) + ' + (' + fmtV(vi) + ' &#8722; ' + fmtV(vfc) +
        ') &#8901; e<sup>&#8722;t/' + fmtT(tau) + '</sup></span>';

      // nota pedagogica
      var meta = modo === 'carga'
        ? 'parte de 0 V y sube hacia V<sub>f</sub> = ' + fmtV(Vf)
        : 'parte de V<sub>i</sub> = ' + fmtV(Vf) + ' y baja hacia 0 V';
      el.querySelector('.rc-nota').innerHTML =
        'Con R = <strong>' + fmtR(R) + '</strong> y C = <strong>' + fmtC(C) + '</strong> la constante de tiempo es ' +
        '<strong>τ = R&#8901;C = ' + fmtT(tau) + '</strong>. El condensador ' + meta + '. ' +
        'En <strong>t = τ</strong> la tensión ha recorrido el <strong>63 %</strong> del camino ' +
        '(' + fmtV(vt(tau, tau)) + '); en <strong>t = 5τ = ' + fmtT(5 * tau) + '</strong> ya esta al ' +
        '<strong>99,3 %</strong> (' + fmtV(vt(5 * tau, tau)) + ') y el transitorio se da por terminado.';

      // código Python equivalente (literales con punto decimal: código Python valido;
      // los comentarios tras # usan coma, como el resto del tema)
      el.querySelector('.rc-codigo code').textContent =
        'import math\n' +
        'R  = ' + R + '          # ohm\n' +
        'C  = ' + C.toExponential(2) + '   # faradios (' + coma(C.toExponential(2)) + ')\n' +
        'Vf = ' + (modo === 'carga' ? Vf : 0) + '          # V (valor final)\n' +
        'Vi = ' + (modo === 'carga' ? 0 : Vf) + '          # V (valor inicial)\n' +
        '\n' +
        'tau = R * C                       # = ' + coma((R * C).toExponential(2)) + ' s  (' + fmtT(tau) + ')\n' +
        'def v(t):\n' +
        '    return Vf + (Vi - Vf) * math.exp(-t / tau)\n' +
        '\n' +
        'v(tau)   # = ' + coma((Math.round(vt(tau, tau) * 1000) / 1000)) + ' V  (63 %)\n' +
        'v(5*tau) # = ' + coma((Math.round(vt(5 * tau, tau) * 1000) / 1000)) + ' V  (99,3 %)';

      if (MPI.resaltarTodo) MPI.resaltarTodo(el);
    }

    function sincronizaSliders() {
      slR.value = valApos(R, R_MIN, R_MAX);
      slC.value = valApos(C, C_MIN, C_MAX);
      selVf.value = String(Vf);
      selModo.value = modo;
    }

    // R cae a valores "redondos" dentro del rango log para que se lea bien.
    function redondeaR(r) {
      if (r >= 10000) return Math.round(r / 1000) * 1000;
      if (r >= 1000)  return Math.round(r / 100) * 100;
      if (r >= 100)   return Math.round(r / 10) * 10;
      return Math.round(r);
    }

    slR.addEventListener('input', function () {
      R = redondeaR(posAval(parseInt(slR.value, 10), R_MIN, R_MAX));
      detenAnim();
      pintar();
    });
    slC.addEventListener('input', function () {
      C = posAval(parseInt(slC.value, 10), C_MIN, C_MAX);
      detenAnim();
      pintar();
    });
    selModo.addEventListener('change', function () {
      modo = selModo.value;
      anim = 0;
      detenAnim();
      pintar();
    });
    selVf.addEventListener('change', function () {
      Vf = parseFloat(selVf.value);
      detenAnim();
      pintar();
    });

    btnPlay.addEventListener('click', function () {
      if (timer) { detenAnim(); return; }
      if (anim >= 1) anim = 0;
      btnPlay.innerHTML = '❚❚ Pausa';
      timer = setInterval(function () {
        anim += 0.02;
        if (anim >= 1) { anim = 1; detenAnim(); }
        pintar();
      }, 40);
    });

    el.querySelector('.rc-reset').addEventListener('click', function () {
      R = 10000; C = 10e-6; Vf = 5; modo = 'carga'; anim = 0;
      detenAnim();
      sincronizaSliders();
      pintar();
    });

    sincronizaSliders();
    pintar();
  };
})();
