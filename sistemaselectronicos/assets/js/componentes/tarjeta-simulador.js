/*
 * Componente "tarjeta-simulador": tarjeta de acceso al simulador interactivo
 * del puesto de laboratorio (Raspberry Pi 4 + iMAT HAT), al estilo de la
 * tarjeta del juego de la web de Microprocesadores pero con el dibujo de la
 * placa en pequeño en lugar de un icono.
 *
 * El dibujo es assets/img/placa-lab.svg, generado desde el propio simulador
 * (src/placas/raspberry-pi-4: tarjeta/svg.ts + hat-imat/svg.ts, sin las
 * etiquetas de serigrafía, que a este tamaño no se leen).
 *
 * Uso: <div class="mpi-mount" data-componente="tarjeta-simulador" data-config='{}'></div>
 * Config opcional: { url, titulo, subtitulo, cta, img }
 */
window.MPI = window.MPI || {};
MPI.componentes = MPI.componentes || {};

(function () {
  var DEF = {
    url: 'https://icai-interactive-lab.netlify.app/',
    img: 'assets/img/placa-lab.svg',
    titulo: 'Simulador del puesto de laboratorio',
    subtitulo: 'La Raspberry Pi 4 con la iMAT HAT en el navegador: LED, pulsadores, ' +
               'entradas analógicas del MCP3008 y salidas PWM, sin tocar el hardware.',
    cta: 'Abrir el simulador →'
  };

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  MPI.componentes['tarjeta-simulador'] = function (el, cfg) {
    cfg = cfg || {};
    var o = {};
    for (var k in DEF) o[k] = (cfg[k] !== undefined && cfg[k] !== null) ? cfg[k] : DEF[k];

    var a = document.createElement('a');
    a.className = 'mpi-tarjeta-sim';
    a.href = o.url;
    a.target = '_blank';
    a.rel = 'noopener';
    a.innerHTML =
      '<img src="' + esc(o.img) + '" alt="Raspberry Pi 4 con la tarjeta iMAT HAT montada encima" loading="lazy" decoding="async">' +
      '<span class="mpi-tarjeta-sim-txt">' +
        '<span class="mpi-tarjeta-sim-tit">' + esc(o.titulo) + '</span>' +
        '<span class="mpi-tarjeta-sim-sub">' + esc(o.subtitulo) + '</span>' +
        '<span class="mpi-tarjeta-sim-cta">' + esc(o.cta) + '</span>' +
      '</span>';

    el.innerHTML = '';
    el.appendChild(a);
  };
})();
