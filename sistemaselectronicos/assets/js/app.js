/*
 * app.js — núcleo de la web (navegación + montaje de componentes).
 * Sin frameworks, sin fetch, sin módulos ES: funciona bajo file:// y en
 * GitHub Pages. La navegación es por #hash (#/tema/<slug>).
 *
 * GENÉRICO (reutilizable entre asignaturas). Lo único específico de cada
 * asignatura está en MPI.config (abajo) y en las secciones de inicio.
 */
window.MPI = window.MPI || {};
MPI.contenidoTemas = MPI.contenidoTemas || {};

// --- Personaliza tu asignatura aquí ---------------------------------------
MPI.config = {
  titulo: 'Sistemas Electrónicos',
  subtitulo: 'IMAT · ICAI — Estudio por temas con Raspberry Pi y Python: teoría, simuladores y ejercicios.',
  mostrarExamen: false   // botón «modo examen» en la portada
};
// --------------------------------------------------------------------------

(function () {
  function $(sel, raiz) { return (raiz || document).querySelector(sel); }

  function gaEvent(name, params) { if (typeof gtag === 'function') gtag('event', name, params); }

  function construirMenu() {
    var nav = $('#mpi-nav');
    var html = '<a class="mpi-nav-inicio" href="#/">Inicio</a><ol class="mpi-nav-lista">';
    MPI.temas.forEach(function (t) {
      var cls = 'mpi-nav-item' + (t.disponible ? '' : ' mpi-nav-pendiente');
      html += '<li class="' + cls + '"><a href="#/tema/' + t.slug + '" data-slug="' + t.slug + '">' +
        '<span class="mpi-nav-num">' + t.num + '</span>' +
        '<span class="mpi-nav-tit">' + t.titulo + '</span>' +
        (t.disponible ? '' : '<span class="mpi-nav-badge">pronto</span>') +
        '</a></li>';
    });
    html += '</ol>';
    nav.innerHTML = html;
  }

  function montarComponentes(raiz) {
    var nodos = raiz.querySelectorAll('.mpi-mount');
    for (var i = 0; i < nodos.length; i++) {
      var el = nodos[i];
      if (el.getAttribute('data-montado')) continue;
      var nombre = el.getAttribute('data-componente');
      var cfg = {};
      var raw = el.getAttribute('data-config');
      if (raw) { try { cfg = JSON.parse(raw); } catch (e) { console.error('config inválida en', nombre, e); } }
      var fn = MPI.componentes && MPI.componentes[nombre];
      if (fn) { fn(el, cfg); el.setAttribute('data-montado', '1'); }
      else el.innerHTML = '<p class="mpi-error">Componente no encontrado: ' + nombre + '</p>';
    }
  }

  function vistaInicio() {
    var hechos = MPI.temas.filter(function (t) { return t.disponible; }).length;
    var html = '<header class="mpi-hero">' +
      '<h1>' + MPI.config.titulo + '</h1>' +
      '<p class="mpi-sub">' + MPI.config.subtitulo + '</p>' +
      '<p class="mpi-progreso">' + hechos + ' de ' + MPI.temas.length + ' temas disponibles</p>' +
      (MPI.config.mostrarExamen
        ? '<p><a class="mpi-boton-examen" href="#/examen">🎓 Modo examen — 10 preguntas al azar, con nota</a></p>'
        : '') +
      '</header><div class="mpi-tarjetas">';
    MPI.temas.forEach(function (t) {
      html += '<a class="mpi-tarjeta' + (t.disponible ? '' : ' mpi-tarjeta-pendiente') + '" href="#/tema/' + t.slug + '">' +
        '<span class="mpi-tarjeta-num">Tema ' + t.num + '</span>' +
        '<span class="mpi-tarjeta-tit">' + t.titulo + '</span>' +
        '<span class="mpi-tarjeta-est">' + (t.disponible ? 'Disponible' : 'En construcción') + '</span>' +
        '</a>';
    });
    html += '</div>';

    html += '<section class="mpi-inicio-seccion"><h2>Cómo usar esta web</h2>' +
      '<p>Cada tema combina <strong>teoría</strong> (con fórmulas en MathML nativo), ' +
      '<strong>simuladores y visualizadores interactivos</strong> y <strong>ejercicios autocorregidos</strong>. ' +
      'Toda la programación es <strong>Python sobre Raspberry Pi 4</strong> ' +
      '(librería <code>gpiozero</code>). Funciona sin conexión.</p></section>';

    html += '<section class="mpi-inicio-seccion"><h2>Antes de ir a clase</h2>' +
      '<iframe style="border-radius:12px" src="https://open.spotify.com/embed/show/6s0F8jXYRTIjrWTdMzUJNy?utm_source=generator" width="100%" height="152" frameBorder="0" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy"></iframe>' +
      '</section>';

    html += '<section class="mpi-inicio-seccion"><h2>Referencias</h2><ul>' +
      '<li><strong>Libro de apuntes:</strong> Dr. José Daniel Muñoz Frías — <em>Sistemas Electrónicos</em> (IMAT): teoría de circuitos, ' +
      'amplificadores operacionales, sensores resistivos, E/S, temporizadores/PWM, máquinas de estados, ' +
      'comunicaciones (UART, I²C, SPI) y conversión A/D sobre Raspberry Pi.</li>' +
      '<li><strong>Transparencias de clase:</strong> Dr. Francisco Martín Martínez — definen el temario vigente.</li>' +
      '<li><strong>Plataforma:</strong> Raspberry Pi 4 (BCM2711) + Python con <code>gpiozero</code>, ' +
      '<code>spidev</code>/<code>smbus</code>; ADC <code>MCP3008</code> sobre la placa iMAT HAT.</li>' +
      '</ul></section>';
    return html;
  }

  function vistaTema(slug) {
    var meta = MPI.temas.filter(function (t) { return t.slug === slug; })[0];
    var cont = MPI.contenidoTemas[slug];
    if (!cont) {
      var tit = meta ? meta.titulo : slug;
      return '<article class="mpi-tema"><div class="mpi-pendiente-aviso">' +
        '<h1>' + tit + '</h1><p>Este tema todavía no está construido.</p>' +
        '<p><a href="#/">← Volver al índice</a></p></div></article>';
    }
    return '<article class="mpi-tema">' + cont.html + '</article>';
  }

  function marcarActivo(slug) {
    var items = document.querySelectorAll('#mpi-nav a[data-slug]');
    for (var i = 0; i < items.length; i++) {
      items[i].parentNode.classList.toggle('mpi-activo', items[i].getAttribute('data-slug') === slug);
    }
  }

  function enrutar() {
    var main = $('#mpi-main');
    var hash = location.hash || '#/';
    var m = hash.match(/^#\/tema\/(.+)$/);
    if (hash === '#/examen' && MPI.vistaExamen) {
      MPI.vistaExamen(main);
      marcarActivo(null);
    } else if (m) {
      var slug = decodeURIComponent(m[1]);
      var meta = MPI.temas.filter(function (t) { return t.slug === slug; })[0];
      main.innerHTML = vistaTema(slug);
      marcarActivo(slug);
      gaEvent('tema_visto', { slug: slug, titulo: meta ? meta.titulo : slug, site: 'sistemaselectronicos' });
    } else {
      main.innerHTML = vistaInicio();
      marcarActivo(null);
    }
    if (MPI.resaltarTodo) MPI.resaltarTodo(main);
    montarComponentes(main);
    main.scrollTop = 0;
    window.scrollTo(0, 0);
  }

  function init() {
    construirMenu();
    window.addEventListener('hashchange', enrutar);
    enrutar();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
