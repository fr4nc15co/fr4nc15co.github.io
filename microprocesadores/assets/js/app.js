/*
 * app.js — núcleo de la web (navegación + montaje de componentes).
 * Sin frameworks, sin fetch, sin módulos ES: funciona bajo file:// y en
 * GitHub Pages. La navegación es por #hash (#/tema/<slug>).
 */
window.MPI = window.MPI || {};
MPI.contenidoTemas = MPI.contenidoTemas || {};

(function () {
  function $(sel, raiz) { return (raiz || document).querySelector(sel); }

  function gaEvent(name, params) { if (typeof gtag === 'function') gtag('event', name, params); }

  function gaPageView(data) {
    if (typeof gtag !== 'function') return;
    gtag('event', 'page_view', data || {});
  }

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
      '<h1>Microprocesadores — PIC32MX230F064D</h1>' +
      '<p class="mpi-sub">Web interactiva de estudio: teoría, visualizadores de registros, simuladores y ejercicios de diseño de drivers.</p>' +
      '<p class="mpi-progreso">' + hechos + ' de ' + MPI.temas.length + ' temas disponibles</p>' +
      // Modo examen oculto por el momento (la ruta #/examen sigue operativa):
      // '<p><a class="mpi-boton-examen" href="#/examen">🎓 Modo examen — 10 preguntas al azar, con nota</a></p>' +
      '</header><div class="mpi-tarjetas">';
    MPI.temas.forEach(function (t) {
      html += '<a class="mpi-tarjeta' + (t.disponible ? '' : ' mpi-tarjeta-pendiente') + '" href="#/tema/' + t.slug + '">' +
        '<span class="mpi-tarjeta-num">Tema ' + t.num + '</span>' +
        '<span class="mpi-tarjeta-tit">' + t.titulo + '</span>' +
        '<span class="mpi-tarjeta-est">' + (t.disponible ? 'Disponible' : 'En construcción') + '</span>' +
        '</a>';
    });
    html += '</div>';
    html += '<section class="mpi-inicio-seccion"><h2>Antes de ir a clase</h2>' +
      '<p>10 minutos de podcast — lo principal de cada tema en Spotify:</p>' +
      '<iframe style="border-radius:12px; margin-top:1em;" src="https://open.spotify.com/embed/show/71kXCYVjY8jtbpBc2Z9AhU?utm_source=generator" width="100%" height="152" frameBorder="0" allowfullscreen="" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy"></iframe>' +
      '</section>';
    html += '<section class="mpi-inicio-seccion"><h2>Referencias</h2>' +
      '<ul>' +
      '<li><strong>Datasheet:</strong> PIC32MX1XX/2XX 32-bit Microcontroller (DS60001168L) — Microchip Technology — especificaciones de registros, periféricos, vectores de interrupción.</li>' +
      '<li><strong>Transparencias:</strong> 14 temas del curso — Dr. Francisco Martín Martínez — definiciones del temario vigente (no incluye MIPS assembler).</li>' +
      '<li><strong>Libro de apuntes:</strong> Dr. José Daniel Muñoz Frías — teoría integrada de arquitectura, periféricos (timers, UART, ADC, PWM, I²C/SPI) y patrones de programación.</li>' +
      '</ul>' +
      '</section>';
    return html;
  }

  function vistaTema(slug) {
    var meta = MPI.temas.filter(function (t) { return t.slug === slug; })[0];
    var cont = MPI.contenidoTemas[slug];
    if (!cont) {
      var tit = meta ? meta.titulo : slug;
      return '<article class="mpi-tema"><div class="mpi-pendiente-aviso">' +
        '<h1>' + tit + '</h1><p>Este tema todavía no está construido. ' +
        'Estamos generando el contenido a partir del libro y las transparencias, ' +
        'con los registros y el código verificados contra el datasheet del PIC32MX.</p>' +
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
    var pageTitle = 'Microprocesadores · PIC32MX230F064D';
    var pagePath = '/microprocesadores/' + (hash === '#/' ? '' : hash.slice(1));
    if (hash === '#/examen' && MPI.vistaExamen) {
      MPI.vistaExamen(main);
      marcarActivo(null);
      pageTitle = 'Modo examen · Microprocesadores';
    } else if (m) {
      var slug = decodeURIComponent(m[1]);
      var meta = MPI.temas.filter(function (t) { return t.slug === slug; })[0];
      main.innerHTML = vistaTema(slug);
      marcarActivo(slug);
      pageTitle = (meta ? meta.titulo : slug) + ' · Microprocesadores';
      gaEvent('tema_visto', { slug: slug, titulo: meta ? meta.titulo : slug, site: 'microprocesadores' });
    } else {
      main.innerHTML = vistaInicio();
      marcarActivo(null);
      pageTitle = 'Inicio · Microprocesadores';
    }

    gaPageView({
      page_title: pageTitle,
      page_location: location.href,
      page_path: pagePath
    });

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
