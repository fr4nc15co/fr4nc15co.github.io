/*
 * app.js — núcleo de la web (navegación + montaje de componentes).
 * Sin frameworks, sin fetch, sin módulos ES: funciona bajo file:// y en
 * GitHub Pages. La navegación es por #hash (#/tema/<slug>).
 */
window.MPI = window.MPI || {};
MPI.contenidoTemas = MPI.contenidoTemas || {};

(function () {
  var tocObserver = null;

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

    // Buscar tema anterior y siguiente
    var idxActual = MPI.temas.findIndex(function (t) { return t.slug === slug; });
    var temaPrev = idxActual > 0 ? MPI.temas[idxActual - 1] : null;
    var temaSig = idxActual < MPI.temas.length - 1 ? MPI.temas[idxActual + 1] : null;

    // Construir navegación
    var navHTML = '<nav class="mpi-tema-nav">';
    if (temaPrev) {
      navHTML += '<a href="#/tema/' + temaPrev.slug + '" class="mpi-tema-nav-item mpi-tema-nav-prev">' +
        '<span class="mpi-tema-nav-label">← Anterior</span>' +
        '<span class="mpi-tema-nav-title">' + temaPrev.titulo + '</span>' +
        '</a>';
    }
    if (temaSig) {
      navHTML += '<a href="#/tema/' + temaSig.slug + '" class="mpi-tema-nav-item mpi-tema-nav-next">' +
        '<span class="mpi-tema-nav-label">Siguiente →</span>' +
        '<span class="mpi-tema-nav-title">' + temaSig.titulo + '</span>' +
        '</a>';
    }
    navHTML += '</nav>';

    // Índice lateral del tema (prototipo, solo para el ADC). Asignamos IDs a
    // los h2/h3 en runtime y construimos un TOC con scroll-spy.
    var htmlTema = cont.html;
    var tocHTML = '';
    {
      var parser = new DOMParser();
      var doc = parser.parseFromString('<div id="raiz">' + cont.html + '</div>', 'text/html');
      var heads = doc.querySelectorAll('h2, h3');
      var items = [];
      for (var i = 0; i < heads.length; i++) {
        var h = heads[i];
        var id = 'ap-' + i;
        h.setAttribute('id', id);
        items.push({ id: id, texto: h.textContent.trim(), nivel: h.tagName.toLowerCase() });
      }
      if (items.length >= 3) {
        htmlTema = doc.getElementById('raiz').innerHTML;
        tocHTML = '<aside class="mpi-toc"><div class="mpi-toc-tit">En este tema</div><ol class="mpi-toc-lista">';
        items.forEach(function (it) {
          tocHTML += '<li class="mpi-toc-' + it.nivel + '"><a href="#/tema/' + slug + '" data-ap="' + it.id + '">' + it.texto + '</a></li>';
        });
        tocHTML += '</ol></aside>';
      }
    }

    var articulo = '<article class="mpi-tema">' + htmlTema + navHTML + '</article>';
    if (tocHTML) return '<div class="mpi-con-toc">' + articulo + tocHTML + '</div>';
    return articulo;
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
    activarToc(main);
  }

  // Índice lateral del tema: salto suave al hacer click + scroll-spy que
  // resalta el apartado visible. Se desconecta el observer al re-enrutar.
  function activarToc(main) {
    if (tocObserver) { tocObserver.disconnect(); tocObserver = null; }
    var toc = $('.mpi-toc', main);
    if (!toc) return;

    var enlaces = {};
    var links = toc.querySelectorAll('a[data-ap]');
    for (var i = 0; i < links.length; i++) enlaces[links[i].getAttribute('data-ap')] = links[i];

    toc.addEventListener('click', function (ev) {
      var a = ev.target.closest('a[data-ap]');
      if (!a) return;
      ev.preventDefault();
      var destino = document.getElementById(a.getAttribute('data-ap'));
      if (destino) destino.scrollIntoView({ block: 'start', behavior: 'smooth' });
    });

    function marcar(id) {
      for (var k in enlaces) enlaces[k].parentNode.classList.toggle('mpi-toc-activo', k === id);
    }

    tocObserver = new IntersectionObserver(function (entradas) {
      entradas.forEach(function (e) {
        if (e.isIntersecting) marcar(e.target.id);
      });
    }, { rootMargin: '0px 0px -70% 0px', threshold: 0 });

    Object.keys(enlaces).forEach(function (id) {
      var h = document.getElementById(id);
      if (h) tocObserver.observe(h);
    });
  }

  function init() {
    construirMenu();
    window.addEventListener('hashchange', enrutar);
    enrutar();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
