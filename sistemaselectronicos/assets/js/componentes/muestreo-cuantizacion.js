/*
 * Componente "muestreo-cuantizacion": visualizador de las dos etapas de la
 * conversión A/D (tema 1.3). Una senoidal continua x(t) = A·sin(2·pi·f·t) se
 * MUESTREA cada Ts = 1/fs y cada muestra se CUANTIZA al nivel mas proximo de
 * los 2^N disponibles. El SVG superpone:
 *   (1) la senoidal continua,
 *   (2) los puntos de muestreo,
 *   (3) la rejilla horizontal de 2^N niveles de cuantización,
 *   (4) la señal reconstruida en escalera (sample & hold cuantizado).
 * Avisa de ALIASING cuando fs < 2·f (teorema de Nyquist-Shannon, 1.3.1) y
 * recuerda que el ADC del curso (MCP3008) es de 10 bits = 1024 niveles.
 *
 * Uso: <div class="mpi-mount" data-componente="muestreo-cuantizacion" data-config='{}'></div>
 */
window.MPI = window.MPI || {};
MPI.componentes = MPI.componentes || {};

(function () {
  // Geometria del lienzo (coordenadas viewBox).
  var W = 720, H = 340;          // tamano total del SVG
  var MX = 56, MD = 44;          // margen izquierdo / inferior (ejes)
  var X0 = MX, X1 = W - 16;      // x del trazado: de X0 a X1
  var Y0 = 16, Y1 = H - MD;      // y del trazado: de Y0 (arriba) a Y1 (abajo)
  var T = 1.0;                   // ventana temporal mostrada: 1 segundo
  var AMP = 1.0;                 // amplitud de la senoidal (normalizada a +-1)

  function coma(x, dec) {
    return x.toFixed(dec).replace('.', ',');
  }

  // Mapea tiempo (0..T) -> x de pantalla; magnitud (-AMP..+AMP) -> y de pantalla.
  function sx(t) { return X0 + (t / T) * (X1 - X0); }
  function sy(v) { return Y1 - ((v + AMP) / (2 * AMP)) * (Y1 - Y0); }

  // Cuantiza un valor en [-AMP, +AMP] a uno de los 2^N niveles (redondeo).
  function cuantiza(v, niveles) {
    var paso = (2 * AMP) / niveles;             // tamano de cada escalon
    var k = Math.round((v + AMP) / paso - 0.5); // indice de nivel 0..niveles-1
    if (k < 0) k = 0;
    if (k > niveles - 1) k = niveles - 1;
    return -AMP + (k + 0.5) * paso;             // centro del escalon
  }

  MPI.componentes['muestreo-cuantizacion'] = function (el, cfg) {
    el.classList.add('mpi-muestreo-cuantizacion');

    var f = 3;     // frecuencia de la señal (Hz)
    var fs = 20;   // frecuencia de muestreo (Hz)
    var N = 3;     // número de bits de cuantización

    el.innerHTML =
      '<div class="mpi-sim-cab">Muestreo y cuantización: de la señal continua a números</div>' +
      '<div class="mq-controles">' +
        '<label class="mq-ctrl"><span class="mq-ctrl-tit">Frecuencia de la señal&nbsp; f = <strong class="mq-fval"></strong></span>' +
          '<input type="range" class="mq-f" min="1" max="10" step="1" value="3"></label>' +
        '<label class="mq-ctrl"><span class="mq-ctrl-tit">Frecuencia de muestreo&nbsp; f<sub>s</sub> = <strong class="mq-fsval"></strong></span>' +
          '<input type="range" class="mq-fs" min="1" max="60" step="1" value="20"></label>' +
        '<label class="mq-ctrl"><span class="mq-ctrl-tit">Bits de cuantización&nbsp; N = <strong class="mq-nval"></strong></span>' +
          '<input type="range" class="mq-n" min="1" max="6" step="1" value="3"></label>' +
        '<label class="mq-chk"><input type="checkbox" class="mq-ver-rec" checked> ver señal reconstruida</label>' +
      '</div>' +
      '<svg viewBox="0 0 ' + W + ' ' + H + '" class="mq-svg" role="img" ' +
           'aria-label="Muestreo y cuantización de una senoidal">' +
        '<g class="mq-rejilla"></g>' +
        '<line class="mq-eje" x1="' + X0 + '" y1="' + Y0 + '" x2="' + X0 + '" y2="' + Y1 + '"/>' +
        '<line class="mq-eje" x1="' + X0 + '" y1="' + sy(0) + '" x2="' + X1 + '" y2="' + sy(0) + '"/>' +
        '<text class="mq-ejetxt" x="' + (X0 - 8) + '" y="' + (Y0 + 4) + '" text-anchor="end">+A</text>' +
        '<text class="mq-ejetxt" x="' + (X0 - 8) + '" y="' + (Y1) + '" text-anchor="end">-A</text>' +
        '<text class="mq-ejetxt" x="' + X1 + '" y="' + (Y1 + 16) + '" text-anchor="end">t = 1 s</text>' +
        '<path class="mq-escalera"/>' +
        '<path class="mq-onda"/>' +
        '<g class="mq-muestras"></g>' +
      '</svg>' +
      '<div class="mq-leyenda">' +
        '<span class="mq-lg mq-lg-onda">señal continua x(t)</span>' +
        '<span class="mq-lg mq-lg-mues">muestras (cada 1/f<sub>s</sub>)</span>' +
        '<span class="mq-lg mq-lg-esc">reconstruida (S&amp;H cuantizado)</span>' +
        '<span class="mq-lg mq-lg-niv">niveles 2<sup>N</sup></span>' +
      '</div>' +
      '<div class="mq-datos"></div>' +
      '<div class="mq-aviso nota"></div>' +
      '<pre class="mq-codigo"><code class="lang-python"></code></pre>';

    var slF = el.querySelector('.mq-f');
    var slFs = el.querySelector('.mq-fs');
    var slN = el.querySelector('.mq-n');
    var chkRec = el.querySelector('.mq-ver-rec');
    var gRej = el.querySelector('.mq-rejilla');
    var gMues = el.querySelector('.mq-muestras');
    var pOnda = el.querySelector('.mq-onda');
    var pEsc = el.querySelector('.mq-escalera');

    var SVGNS = 'http://www.w3.org/2000/svg';

    function x(t) { return AMP * Math.sin(2 * Math.PI * f * t); }

    function dibujaRejilla(niveles) {
      gRej.textContent = '';
      var paso = (2 * AMP) / niveles;
      // Lineas en los limites entre escalones (niveles+1 fronteras).
      for (var k = 0; k <= niveles; k++) {
        var v = -AMP + k * paso;
        var yy = sy(v);
        var ln = document.createElementNS(SVGNS, 'line');
        ln.setAttribute('x1', X0);
        ln.setAttribute('x2', X1);
        ln.setAttribute('y1', yy);
        ln.setAttribute('y2', yy);
        ln.setAttribute('class', 'mq-niv');
        gRej.appendChild(ln);
      }
    }

    function dibujaOnda() {
      // Muestreo fino para trazar la senoidal continua (independiente de fs).
      var pasos = 480, d = '';
      for (var i = 0; i <= pasos; i++) {
        var t = (i / pasos) * T;
        d += (i === 0 ? 'M' : 'L') + coma2(sx(t)) + ' ' + coma2(sy(x(t)));
      }
      pOnda.setAttribute('d', d);
    }

    // Punto con coma -> punto, pero limitando decimales para un 'd' compacto.
    function coma2(n) { return (Math.round(n * 100) / 100).toString(); }

    function dibujaMuestrasYEscalera(niveles) {
      gMues.textContent = '';
      var Ts = 1 / fs;
      var nMues = Math.floor(T / Ts) + 1;
      var dEsc = '';
      var xPrev = null, yPrev = null;
      for (var i = 0; i < nMues; i++) {
        var t = i * Ts;
        if (t > T + 1e-9) break;
        var v = x(t);
        var vq = cuantiza(v, niveles);
        var cx = sx(t), cyMue = sy(v), cyQ = sy(vq);

        // Escalera (sample & hold del valor cuantizado): tramo horizontal
        // desde la muestra anterior y salto vertical en esta muestra.
        if (xPrev === null) {
          dEsc += 'M' + coma2(cx) + ' ' + coma2(cyQ);
        } else {
          dEsc += 'L' + coma2(cx) + ' ' + coma2(yPrev);
          dEsc += 'L' + coma2(cx) + ' ' + coma2(cyQ);
        }
        xPrev = cx; yPrev = cyQ;

        // Punto de muestreo sobre la senoidal.
        var pt = document.createElementNS(SVGNS, 'circle');
        pt.setAttribute('cx', cx);
        pt.setAttribute('cy', cyMue);
        pt.setAttribute('r', 3.2);
        pt.setAttribute('class', 'mq-pt');
        gMues.appendChild(pt);
      }
      // Prolonga la escalera hasta el borde derecho.
      if (xPrev !== null) dEsc += 'L' + coma2(X1) + ' ' + coma2(yPrev);
      pEsc.setAttribute('d', dEsc);
      return nMues;
    }

    function pintar() {
      var niveles = 1 << N;            // 2^N
      el.querySelector('.mq-fval').textContent = f + ' Hz';
      el.querySelector('.mq-fsval').textContent = fs + ' Hz';
      el.querySelector('.mq-nval').textContent = N + (N === 1 ? ' bit' : ' bits');

      dibujaRejilla(niveles);
      dibujaOnda();
      var nMues = dibujaMuestrasYEscalera(niveles);
      pEsc.style.display = chkRec.checked ? '' : 'none';

      var q = (2 * AMP) / niveles;     // resolución (escalon) en unidades de A

      el.querySelector('.mq-datos').innerHTML =
        '<span class="mq-dato">f<sub>s</sub> = <strong>' + fs + ' Hz</strong></span>' +
        '<span class="mq-dato">2·f = <strong>' + (2 * f) + ' Hz</strong></span>' +
        '<span class="mq-dato">muestras en 1 s: <strong>' + (nMues - 1) + '</strong></span>' +
        '<span class="mq-dato">niveles = 2<sup>' + N + '</sup> = <strong>' + niveles + '</strong></span>' +
        '<span class="mq-dato">q = 2A/2<sup>N</sup> = <strong>' + coma(q, 3) + ' A</strong></span>';

      var aviso = el.querySelector('.mq-aviso');
      if (fs < 2 * f) {
        aviso.className = 'mq-aviso nota mq-alias';
        aviso.innerHTML =
          '<strong>Aliasing.</strong> Con f<sub>s</sub> = ' + fs + ' Hz &lt; 2·f = ' + (2 * f) +
          ' Hz se incumple el teorema de <strong>Nyquist-Shannon</strong> (' +
          '<code>f<sub>s</sub> &#8805; 2·f<sub>max</sub></code>, seccion 1.3.1). Hay muy pocas ' +
          'muestras por ciclo: la señal reconstruida aparenta una frecuencia <em>menor</em> que la ' +
          'real (frecuencia alias) y ya <strong>no</strong> se puede recuperar x(t). Sube f<sub>s</sub> ' +
          'o baja f hasta que f<sub>s</sub> &#8805; ' + (2 * f) + ' Hz.';
      } else {
        aviso.className = 'mq-aviso nota mq-ok';
        aviso.innerHTML =
          '<strong>Muestreo correcto.</strong> f<sub>s</sub> = ' + fs + ' Hz &#8805; 2·f = ' + (2 * f) +
          ' Hz, asi que se cumple <strong>Nyquist-Shannon</strong> (seccion 1.3.1) y la señal se ' +
          'podria reconstruir. El escalon visible es <strong>cuantización</strong>: con N = ' + N +
          ' bits solo hay <strong>2<sup>' + N + '</sup> = ' + niveles + '</strong> niveles, ' +
          'as&iacute; que cada muestra se redondea al nivel m&aacute;s pr&oacute;ximo. ' +
          'Sube N para afinar los escalones. El ADC del curso (<strong>MCP3008</strong>) es de ' +
          '<strong>10 bits = 1024 niveles</strong>.';
      }

      el.querySelector('.mq-codigo code').textContent =
        'import numpy as np\n' +
        '\n' +
        'A, f, fs, N = 1.0, ' + f + ', ' + fs + ', ' + N + '\n' +
        'niveles = 2 ** N                 # = ' + niveles + ' niveles\n' +
        'q = 2 * A / niveles              # escalon = ' + coma(q, 3) + ' A\n' +
        '\n' +
        't = np.arange(0, 1, 1 / fs)      # muestreo cada Ts = 1/fs\n' +
        'x = A * np.sin(2 * np.pi * f * t)\n' +
        'k = np.clip(np.round((x + A) / q - 0.5), 0, niveles - 1)\n' +
        'xq = -A + (k + 0.5) * q          # muestra cuantizada (centro del nivel)\n' +
        '\n' +
        'if fs < 2 * f:\n' +
        '    print("Aliasing: fs < 2f, se incumple Nyquist-Shannon")';
      if (MPI.resaltarTodo) MPI.resaltarTodo(el);
    }

    slF.addEventListener('input', function () { f = parseInt(slF.value, 10); pintar(); });
    slFs.addEventListener('input', function () { fs = parseInt(slFs.value, 10); pintar(); });
    slN.addEventListener('input', function () { N = parseInt(slN.value, 10); pintar(); });
    chkRec.addEventListener('change', function () { pEsc.style.display = chkRec.checked ? '' : 'none'; });

    pintar();
  };
})();
