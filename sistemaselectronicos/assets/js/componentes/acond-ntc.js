/*
 * Componente "acond-ntc": acondicionamiento de un termistor NTC.
 * Reproduce el ejemplo GUINNESS del Tema 6 (termometro de frigorifico,
 * rango 0-5 grados C). Modelo de la NTC:
 *     R(T) = R0 * exp(beta * (1/T - 1/T0))   con T en kelvin
 *     R0 = 1000 ohm,  beta = 5000 K,  T0 = 273,15 K,  T[K] = t[C] + 273,15
 * Comprobaciones del tema: R(0) = 1000, R(2,5) = 847,03, R(5) = 719,61 ohm.
 *
 * Dos modos conmutables:
 *   (a) SIN linealizar  -> se acondiciona R(T) directamente.
 *   (b) CON linealización por Rp = 679 ohm en paralelo:
 *           R' = R * Rp / (R + Rp).
 * En ambos: fuente de corriente I = 1 mA -> vA = -I*R ; ajuste de cero con
 * Ez = I*R(0 C) (= 1 V sin linealizar, = 0,404 V con Rp) -> vB = -(vA + Ez) ;
 * ganancia para llegar a 5 V (mapeada al rango 0-3,3 V del ADC).
 *
 * Uso: <div class="mpi-mount" data-componente="acond-ntc" data-config='{}'></div>
 */
window.MPI = window.MPI || {};
MPI.componentes = MPI.componentes || {};

(function () {
  // --- Parametros fisicos del ejemplo (no tocar: cuadran con el tema) ---
  var R0 = 1000;        // ohm a T0
  var BETA = 5000;      // K
  var T0K = 273.15;     // K
  var RP = 679;         // ohm en paralelo (linealización por incrementos)
  var I = 0.001;        // A, corriente de la fuente (1 mA, sin autocalentar)
  var VADC = 3.3;       // V, fondo de escala del ADC de la Raspberry Pi
  var VFS = 5;          // V, salida a fondo de escala según el diseño del tema
  var TMIN = 0, TMAX = 5;   // grados C, rango de medida (GUINNESS)

  // --- Modelo ---
  function R(t) { return R0 * Math.exp(BETA * (1 / (t + T0K) - 1 / T0K)); }
  function Rprima(t) { var r = R(t); return r * RP / (r + RP); }

  // --- Formato con coma decimal ---
  function num(x, dec) { return x.toFixed(dec).replace('.', ','); }
  function ohm(x) {
    return x >= 1000 ? num(x / 1000, 3) + ' k&#8486;' : num(x, 1) + ' &#8486;';
  }
  function volt(v) {
    return Math.abs(v) >= 1 ? num(v, 3) + ' V'
                            : num(v * 1000, 1) + ' mV';
  }

  MPI.componentes['acond-ntc'] = function (el, cfg) {
    el.classList.add('mpi-acond-ntc');

    var lineal = false;    // false = sin linealizar ; true = con Rp
    var t = 2.7;           // grados C (GUINNESS sirve a 2,7 grados C)

    el.innerHTML =
      '<div class="mpi-sim-cab">Acondicionamiento de una NTC (termometro GUINNESS, 0-5 &#176;C)</div>' +
      '<p class="nt-intro">Mueve la temperatura y observa la resistencia de la NTC y la tensión ' +
        'que sale de la cadena de acondicionamiento hacia el ADC (0-3,3 V). Conmuta entre el ' +
        'diseño <strong>sin linealizar</strong> y el que pone <strong>R<sub>p</sub> = 679 &#937;</strong> ' +
        'en paralelo para enderezar la curva.</p>' +

      '<div class="nt-controles">' +
        '<div class="nt-modo" role="group" aria-label="Modo de acondicionamiento">' +
          '<button type="button" class="nt-btn nt-sel" data-modo="0">Sin linealizar</button>' +
          '<button type="button" class="nt-btn" data-modo="1">Con R<sub>p</sub> = 679 &#937;</button>' +
        '</div>' +
        '<label class="nt-tlab">Temperatura: <strong class="nt-tval"></strong>' +
          '<input type="range" class="nt-t" min="0" max="5" step="0.1" value="2.7"></label>' +
      '</div>' +

      '<div class="nt-cuerpo">' +
        '<div class="nt-grafico">' +
          '<svg viewBox="0 0 360 240" class="nt-svg" aria-label="Curva de resistencia frente a temperatura">' +
            '<line class="nt-eje" x1="46" y1="200" x2="344" y2="200"/>' +
            '<line class="nt-eje" x1="46" y1="20" x2="46" y2="200"/>' +
            '<g class="nt-rejilla"></g>' +
            '<polyline class="nt-cuerda" points=""/>' +
            '<polyline class="nt-curva" points=""/>' +
            '<line class="nt-vline" x1="0" y1="20" x2="0" y2="200"/>' +
            '<circle class="nt-punto" r="4.5" cx="0" cy="0"/>' +
            '<text class="nt-eqy" x="14" y="14">R [&#937;]</text>' +
            '<text class="nt-eqx" x="344" y="222">t [&#176;C]</text>' +
            '<text class="nt-leyenda" x="60" y="34"></text>' +
          '</svg>' +
        '</div>' +

        '<div class="nt-panel">' +
          '<div class="nt-lecturas">' +
            '<div class="nt-fila"><span class="nt-k">R(t)</span><span class="nt-v nt-vr"></span></div>' +
            '<div class="nt-fila nt-filarp"><span class="nt-k">R&#8242; = R &#8741; R<sub>p</sub></span>' +
              '<span class="nt-v nt-vrp"></span></div>' +
          '</div>' +
          '<div class="nt-cadena"></div>' +
          '<div class="nt-salida"></div>' +
        '</div>' +
      '</div>' +

      '<p class="nt-cod-desc">El procesador de la Raspberry Pi lee el código del ADC y deshace ' +
        'el mapeo para recuperar la temperatura (linealización digital del resto de la curva):</p>' +
      '<pre class="nt-codigo"><code class="lang-python"></code></pre>';

    var slT = el.querySelector('.nt-t');
    var btns = el.querySelectorAll('.nt-btn');
    var svg = el.querySelector('.nt-svg');
    var curva = el.querySelector('.nt-curva');
    var cuerda = el.querySelector('.nt-cuerda');
    var vline = el.querySelector('.nt-vline');
    var punto = el.querySelector('.nt-punto');
    var leyenda = el.querySelector('.nt-leyenda');
    var rejilla = el.querySelector('.nt-rejilla');

    // --- Geometria del SVG ---
    var X0 = 46, X1 = 344, Y0 = 200, Y1 = 20;   // marco del area de dibujo
    function sx(tt) { return X0 + (tt - TMIN) / (TMAX - TMIN) * (X1 - X0); }
    // El eje Y se reescala según el modo para usar bien el alto disponible.
    var rLo, rHi;
    function sy(rr) { return Y0 - (rr - rLo) / (rHi - rLo) * (Y0 - Y1); }

    function fnActual(tt) { return lineal ? Rprima(tt) : R(tt); }

    function dibujaRejilla() {
      var html = '';
      // lineas verticales en 0..5 grados C
      for (var k = 0; k <= 5; k++) {
        var x = sx(k);
        html += '<line class="nt-grid" x1="' + x + '" y1="' + Y1 + '" x2="' + x + '" y2="' + Y0 + '"/>';
        html += '<text class="nt-tick" x="' + x + '" y="' + (Y0 + 14) + '">' + k + '</text>';
      }
      // tres marcas horizontales (min, medio, max del eje)
      var marcas = [rLo, (rLo + rHi) / 2, rHi];
      for (var j = 0; j < marcas.length; j++) {
        var y = sy(marcas[j]);
        html += '<line class="nt-grid" x1="' + X0 + '" y1="' + y + '" x2="' + X1 + '" y2="' + y + '"/>';
        html += '<text class="nt-ytick" x="' + (X0 - 4) + '" y="' + (y + 3) + '">' +
                Math.round(marcas[j]) + '</text>';
      }
      rejilla.innerHTML = html;
    }

    function dibujaCurva() {
      // escala del eje Y al rango de la función del modo activo
      var lo = fnActual(TMAX), hi = fnActual(TMIN);   // NTC: baja con t
      var margen = (hi - lo) * 0.12;
      rLo = lo - margen; rHi = hi + margen;
      dibujaRejilla();

      var pts = '';
      for (var k = 0; k <= 50; k++) {
        var tt = TMIN + (TMAX - TMIN) * k / 50;
        pts += sx(tt).toFixed(1) + ',' + sy(fnActual(tt)).toFixed(1) + ' ';
      }
      curva.setAttribute('points', pts.trim());

      // cuerda recta entre los extremos: visualiza cuanto se aparta de la recta
      cuerda.setAttribute('points',
        sx(TMIN) + ',' + sy(fnActual(TMIN)) + ' ' + sx(TMAX) + ',' + sy(fnActual(TMAX)));

      leyenda.innerHTML = lineal
        ? 'R&#8242;(t) = R &#8741; R<sub>p</sub> (mas recta)'
        : 'R(t) sin linealizar (curva)';
    }

    function pintaPunto() {
      var x = sx(t), y = sy(fnActual(t));
      punto.setAttribute('cx', x); punto.setAttribute('cy', y);
      vline.setAttribute('x1', x); vline.setAttribute('x2', x);
    }

    function cadenaHTML() {
      // Resistencia que ve la fuente de corriente según el modo
      var rAct = fnActual(t);
      var rIni = fnActual(TMIN);          // valor al inicio del rango (0 C)
      var rFin = fnActual(TMAX);          // valor al final del rango (5 C)

      var vA = -I * rAct;                 // (a) fuente de corriente: vA = -I*R
      var Ez = I * rIni;                  // (b) ajuste de cero: Ez = -vA(0 C)
      var vB = -(vA + Ez);                // sumador inversor con R iguales
      // (c) ganancia. El tema diseña la cadena para 5 V a fondo de escala
      // (|Av| = 5 / |vB(5 C)| ~= 17,8 sin linealizar, ~= 90,9 con Rp). Aqui ademas
      // mapeamos esa salida al rango real del ADC (0-3,3 V).
      var vBfin = -(-I * rFin + Ez);      // vB en el extremo del rango
      var Gtema = vBfin !== 0 ? VFS / vBfin : 0;  // ganancia del tema (a 5 V)
      var G = vBfin !== 0 ? VADC / vBfin : 0;     // ganancia mapeada al ADC (a 3,3 V)
      var vO = vB * G;                    // salida acondicionada (0..VADC)
      if (vO < 0) vO = 0; if (vO > VADC) vO = VADC;

      // código del ADC (10 bits, MCP3008 de la iMAT HAT)
      var q = VADC / 1024;
      var D = Math.min(1023, Math.max(0, Math.round(vO / q)));

      var html =
        '<div class="nt-etapa"><span class="nt-num">a</span>' +
          '<div class="nt-etxt"><b>Fuente de corriente</b> (I = 1 mA): ' +
            'v<sub>A</sub> = &#8722;I&#183;' + (lineal ? 'R&#8242;' : 'R') +
            ' = <strong>' + volt(vA) + '</strong></div></div>' +
        '<div class="nt-etapa"><span class="nt-num">b</span>' +
          '<div class="nt-etxt"><b>Ajuste de cero</b> (sumador, E<sub>z</sub> = ' + volt(Ez) +
            '): v<sub>B</sub> = &#8722;(v<sub>A</sub> + E<sub>z</sub>) = <strong>' +
            volt(vB) + '</strong></div></div>' +
        '<div class="nt-etapa"><span class="nt-num">c</span>' +
          '<div class="nt-etxt"><b>Ganancia</b> (inversor): para 5 V a fondo de escala ' +
            '|A<sub>v</sub>| &#8776; ' + num(Math.abs(Gtema), 1) +
            '; mapeada al ADC (3,3 V) |A<sub>v</sub>| &#8776; ' + num(Math.abs(G), 1) +
            '. v<sub>O</sub> = A<sub>v</sub>&#183;v<sub>B</sub></div></div>';

      el.querySelector('.nt-cadena').innerHTML = html;

      el.querySelector('.nt-salida').innerHTML =
        '<div class="nt-out-v">Salida hacia el ADC: <strong>' + volt(vO) + '</strong>' +
          ' <span class="nt-out-rng">/ 3,3 V</span></div>' +
        '<div class="nt-barra"><div class="nt-barra-int" style="width:' +
          (vO / VADC * 100).toFixed(1) + '%"></div></div>' +
        '<div class="nt-out-cod">Código del ADC (10 bits): <strong>D = ' + D + '</strong>' +
          ' <small>(de 1023)</small></div>';

      return { vO: vO, D: D, Ez: Ez, G: G };
    }

    function codigoPython(r) {
      var ez = num(r.Ez, 3).replace(',', '.');
      var g = num(r.G, 2).replace(',', '.');
      // En modo lineal la cadena mide R' = R || Rp, asi que primero hay que
      // deshacer la resistencia en paralelo (1/R = 1/R' - 1/Rp) y luego invertir
      // el modelo de la NTC. Sin linealizar, R' = R directamente.
      var desRp = lineal
        ? '    r   = 1 / (1 / rp - 1 / ' + RP + ')   # deshago la Rp en paralelo\n'
        : '';
      var nombreEq = lineal ? 'rp' : 'r';
      el.querySelector('.nt-codigo code').textContent =
        '# Lectura del termometro NTC acondicionado (Raspberry Pi 4 + iMAT HAT)\n' +
        'import math\n\n' +
        'VADC = 3.3            # fondo de escala del ADC\n' +
        'EZ   = ' + ez + '          # ajuste de cero de la cadena (V)\n' +
        'G    = ' + g + '         # ganancia de la etapa final (mapeada al ADC)\n\n' +
        'def temperatura(código):\n' +
        '    v_o = código * VADC / 1024        # tensión reconstruida (V)\n' +
        '    v_b = v_o / G                     # deshago la ganancia\n' +
        '    ' + nombreEq + '  = (v_b + EZ) / 1e-3        # deshago cero y fuente de 1 mA\n' +
        desRp +
        '    # linealización digital: invierto el modelo de la NTC\n' +
        '    inv_t = 1 / 273.15 + math.log(r / 1000) / 5000\n' +
        '    return 1 / inv_t - 273.15         # grados centigrados\n\n' +
        'print(temperatura(adc.read(canal=0)))';
      if (MPI.resaltarTodo) MPI.resaltarTodo(el);
    }

    function pinta() {
      el.querySelector('.nt-tval').innerHTML = num(t, 1) + ' &#176;C';
      el.querySelector('.nt-vr').innerHTML = ohm(R(t));
      el.querySelector('.nt-vrp').innerHTML = ohm(Rprima(t));
      el.querySelector('.nt-filarp').style.opacity = lineal ? '1' : '.45';

      dibujaCurva();
      pintaPunto();
      var r = cadenaHTML();
      codigoPython(r);
    }

    // --- Eventos ---
    slT.addEventListener('input', function () {
      t = parseFloat(slT.value);
      pinta();
    });
    for (var b = 0; b < btns.length; b++) {
      btns[b].addEventListener('click', function () {
        lineal = this.getAttribute('data-modo') === '1';
        for (var j = 0; j < btns.length; j++) btns[j].classList.remove('nt-sel');
        this.classList.add('nt-sel');
        pinta();
      });
    }

    pinta();
  };
})();
