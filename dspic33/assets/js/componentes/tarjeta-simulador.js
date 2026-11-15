/*
 * Componente "tarjeta-simulador": tarjeta de acceso al simulador interactivo
 * del puesto de laboratorio (PicTrainer v3.0 con el dsPIC33FJ32MC202), al
 * estilo de la tarjeta del juego pero con el dibujo de la placa en pequeño
 * en lugar de un icono.
 *
 * El dibujo es assets/img/placa-dspic33.svg, generado desde el propio simulador
 * (src/placas/dspic33/tarjeta/svg.ts, sin las etiquetas de serigrafía, que a
 * este tamaño no se leen).
 *
 * Uso: <div class="mpi-mount" data-componente="tarjeta-simulador" data-config='{}'></div>
 * Config opcional: { url, titulo, subtitulo, cta, img }
 */
window.MPI = window.MPI || {};
MPI.componentes = MPI.componentes || {};

(function () {
  var DEF = {
    url: 'https://icai-interactive-lab.netlify.app/#/banco/dspic33',
    img: 'assets/img/placa-dspic33.svg',
    titulo: 'Simulador del puesto de laboratorio',
    subtitulo: 'La PicTrainer v3.0 (dsPIC33FJ32MC202) en el navegador: LED, pulsadores, ' +
               'potenciómetros y salidas PWM, sin tocar el hardware.',
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
      '<img src="' + esc(o.img) + '" alt="Tarjeta PicTrainer v3.0 con el dsPIC33FJ32MC202" loading="lazy" decoding="async">' +
      '<span class="mpi-tarjeta-sim-txt">' +
        '<span class="mpi-tarjeta-sim-tit">' + esc(o.titulo) + '</span>' +
        '<span class="mpi-tarjeta-sim-sub">' + esc(o.subtitulo) + '</span>' +
        '<span class="mpi-tarjeta-sim-cta">' + esc(o.cta) + '</span>' +
      '</span>';

    el.innerHTML = '';
    el.appendChild(a);
  };
})();
