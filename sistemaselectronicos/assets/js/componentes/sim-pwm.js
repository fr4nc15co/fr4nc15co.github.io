/*
 * Componente "sim-pwm": ilustra la definición de PWM y su uso como conversor
 * D/A de bajo coste. Mueve el factor de servicio (duty) y observa la onda
 * cuadrada, su valor medio (la línea de puntos), la tensión continua que se
 * obtendría tras un filtro paso bajo y el brillo percibido por el ojo (que es
 * un filtro paso bajo con corte ~60 Hz).
 *   V_media = duty · Vcc      (con Vcc = 3,3 V en la Raspberry Pi)
 *
 * Uso: <div class="mpi-mount" data-componente="sim-pwm" data-config='{}'></div>
 */
window.MPI = window.MPI || {};
MPI.componentes = MPI.componentes || {};

(function () {
  function num(x, dec) { return x.toFixed(dec).replace('.', ','); }

  var VCC = 3.3;
  var X0 = 12, Y_HI = 24, Y_LO = 104, T = 96, NPER = 3;   // geometría del SVG

  MPI.componentes['sim-pwm'] = function (el, cfg) {
    el.classList.add('mpi-pwm');
    el.innerHTML =
      '<div class="mpi-sim-cab">PWM como conversor D/A: el valor medio</div>' +
      '<div class="sp-cuerpo">' +
        '<div class="sp-col">' +
          '<label class="sp-slider">Factor de servicio: <strong class="sp-duty">50 %</strong>' +
            '<input type="range" min="0" max="100" step="5" value="50"></label>' +
          '<table class="cb-tabla">' +
            '<tr><td>Factor de servicio (duty)</td><td class="sp-duty2"></td></tr>' +
            '<tr><td>value que escribirías (duty/100)</td><td class="sp-value"></td></tr>' +
            '<tr><td>V media = duty · 3,3 V</td><td class="sp-vdc"></td></tr>' +
          '</table>' +
        '</div>' +
        '<div class="sp-col sp-centro">' +
          '<svg class="sp-onda" viewBox="0 0 312 120" aria-label="Onda PWM y su valor medio">' +
            '<line x1="12" y1="104" x2="306" y2="104" stroke="var(--borde)" stroke-width="1"/>' +
            '<polyline class="sp-traza" fill="none" stroke="var(--acento)" stroke-width="2.5" points=""/>' +
            '<line class="sp-media" x1="12" y1="64" x2="306" y2="64" stroke="var(--azul-cl)" stroke-width="1.5" stroke-dasharray="5 4"/>' +
            '<text class="sp-media-t" x="306" y="60" font-size="10" fill="var(--azul-cl)" text-anchor="end">V media</text>' +
          '</svg>' +
          '<div class="sp-luz-fila"><div class="sp-led"><div class="sp-led-luz"></div></div>' +
            '<small>brillo percibido (el ojo promedia)</small></div>' +
        '</div>' +
      '</div>' +
      '<pre class="sp-codigo"><code class="lang-python"></code></pre>';

    var slider = el.querySelector('input[type="range"]');

    function pintar() {
      var duty = parseInt(slider.value, 10);
      var value = duty / 100;
      var vdc = value * VCC;

      el.querySelector('.sp-duty').textContent = duty + ' %';
      el.querySelector('.sp-duty2').textContent = duty + ' %';
      el.querySelector('.sp-value').textContent = num(value, 2);
      el.querySelector('.sp-vdc').textContent = num(vdc, 2) + ' V';

      // construir la onda: NPER periodos, alta el duty % de cada uno
      var wh = value * T;
      var pts = [X0 + ',' + Y_LO];
      for (var i = 0; i < NPER; i++) {
        var x = X0 + i * T;
        pts.push(x + ',' + Y_HI, (x + wh) + ',' + Y_HI, (x + wh) + ',' + Y_LO, (x + T) + ',' + Y_LO);
      }
      el.querySelector('.sp-traza').setAttribute('points', pts.join(' '));

      // línea de valor medio
      var yMedia = Y_LO - value * (Y_LO - Y_HI);
      var media = el.querySelector('.sp-media');
      media.setAttribute('y1', yMedia); media.setAttribute('y2', yMedia);
      var mt = el.querySelector('.sp-media-t');
      mt.setAttribute('y', yMedia - 4 < Y_HI ? yMedia + 12 : yMedia - 4);

      el.querySelector('.sp-led-luz').style.opacity = (0.12 + 0.88 * value).toFixed(2);

      var cod = el.querySelector('.sp-codigo code');
      cod.textContent =
        'from gpiozero import PWMLED\n' +
        'salida = PWMLED(18)\n' +
        'salida.value = ' + num(value, 2) + '      # duty ' + duty + ' % → V media ≈ ' + num(vdc, 2) + ' V tras el filtro';
      cod.removeAttribute('data-resaltado');
      if (MPI.resaltarTodo) MPI.resaltarTodo(el);
    }

    slider.addEventListener('input', pintar);
    pintar();
  };
})();
