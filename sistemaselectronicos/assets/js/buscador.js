/*
 * Buscador global (Ctrl+K / Cmd+K): busca en los títulos de sección, los
 * registros y los ejercicios de los 12 temas. Todo local: el índice se
 * construye en el navegador la primera vez que se abre.
 */
window.MPI = window.MPI || {};

(function () {
  var indice = null;
  var overlay, input, lista;

  function gaEvent(name, params) { if (typeof gtag === 'function') gtag('event', name, params); }

  function normaliza(s) {
    return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  }

  function construirIndice() {
    indice = [];
    var parser = new DOMParser();
    (MPI.temas || []).forEach(function (t) {
      var cont = MPI.contenidoTemas[t.slug];
      if (!cont) return;
      var doc = parser.parseFromString('<div>' + cont.html + '</div>', 'text/html');
      doc.querySelectorAll('h2, h3').forEach(function (h) {
        var sig = h.nextElementSibling;
        var snippet = sig ? sig.textContent.trim().slice(0, 130) : '';
        indice.push({ tipo: 'sección', slug: t.slug, tema: 'Tema ' + t.num,
                      titulo: h.textContent.trim(), snippet: snippet, busca: normaliza(h.textContent + ' ' + snippet) });
      });
      // registros montados en este tema
      Object.keys(MPI.registros || {}).forEach(function (r) {
        if (cont.html.indexOf('"registro": "' + r + '"') !== -1) {
          indice.push({ tipo: 'registro', slug: t.slug, tema: 'Tema ' + t.num,
                        titulo: r, snippet: (MPI.registros[r].titulo || ''), busca: normaliza(r + ' ' + (MPI.registros[r].titulo || '')) });
        }
      });
    });
    Object.keys(MPI.ejercicios || {}).forEach(function (ref) {
      var slug = ref.replace(/-\d+$/, '');
      var t = (MPI.temas || []).filter(function (x) { return x.slug === slug; })[0];
      indice.push({ tipo: 'ejercicio', slug: slug, ref: ref, tema: t ? 'Tema ' + t.num : '',
                    titulo: MPI.ejercicios[ref].titulo, snippet: '', busca: normaliza(MPI.ejercicios[ref].titulo) });
    });
  }

  function buscar(q) {
    q = normaliza(q.trim());
    if (q.length < 2) return [];
    var palabras = q.split(/\s+/);
    return indice.filter(function (e) {
      return palabras.every(function (p) { return e.busca.indexOf(p) !== -1; });
    }).slice(0, 20);
  }

  function irA(e) {
    gaEvent('search', { search_term: input.value.trim(), site: 'sistemaselectronicos' });
    gaEvent('busqueda_resultado', { tipo: e.tipo, slug: e.slug, titulo: e.titulo, site: 'sistemaselectronicos' });
    cerrar();
    location.hash = '#/tema/' + e.slug;
    setTimeout(function () {
      var destino = null;
      if (e.tipo === 'sección') {
        destino = Array.prototype.filter.call(
          document.querySelectorAll('#mpi-main h2, #mpi-main h3'),
          function (h) { return h.textContent.trim() === e.titulo; })[0];
      } else if (e.tipo === 'registro') {
        destino = Array.prototype.filter.call(
          document.querySelectorAll('#mpi-main .vb-nombre'),
          function (x) { return x.textContent === e.titulo; })[0];
      } else if (e.tipo === 'ejercicio') {
        destino = document.querySelector('#mpi-main [data-config*="' + e.ref + '"]');
      }
      if (destino) {
        destino.scrollIntoView({ block: 'start', behavior: 'smooth' });
        var caja = destino.closest('.mpi-visor-bits, .mpi-mount, section') || destino;
        caja.classList.add('mpi-destacado');
        setTimeout(function () { caja.classList.remove('mpi-destacado'); }, 2200);
      }
    }, 250);
  }

  function pintarResultados(q) {
    var res = buscar(q);
    if (!q.trim()) { lista.innerHTML = '<p class="bq-pista">Escribe al menos 2 letras…</p>'; return; }
    if (!res.length) { lista.innerHTML = '<p class="bq-pista">Sin resultados para «' + q + '».</p>'; return; }
    lista.innerHTML = res.map(function (e, i) {
      return '<button type="button" class="bq-res" data-i="' + i + '">' +
        '<span class="bq-tipo bq-' + e.tipo.replace('ó', 'o') + '">' + e.tipo + '</span>' +
        '<span class="bq-tit">' + e.titulo + '</span>' +
        '<span class="bq-meta">' + e.tema + (e.snippet ? ' — ' + e.snippet + '…' : '') + '</span>' +
        '</button>';
    }).join('');
    lista._res = res;
  }

  function abrir() {
    if (!indice) construirIndice();
    overlay.style.display = 'flex';
    input.value = '';
    pintarResultados('');
    input.focus();
    gaEvent('busqueda_abierta', { site: 'sistemaselectronicos' });
  }
  function cerrar() { overlay.style.display = 'none'; }

  function init() {
    overlay = document.createElement('div');
    overlay.className = 'bq-overlay';
    overlay.innerHTML =
      '<div class="bq-caja">' +
        '<input class="bq-input" type="text" placeholder="Buscar secciones, registros, ejercicios…  (Esc para cerrar)" spellcheck="false">' +
        '<div class="bq-lista"></div>' +
      '</div>';
    document.body.appendChild(overlay);
    input = overlay.querySelector('.bq-input');
    lista = overlay.querySelector('.bq-lista');

    input.addEventListener('input', function () { pintarResultados(input.value); });
    input.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter' && lista._res && lista._res.length) irA(lista._res[0]);
    });
    lista.addEventListener('click', function (ev) {
      var b = ev.target.closest('.bq-res');
      if (b) irA(lista._res[parseInt(b.getAttribute('data-i'), 10)]);
    });
    overlay.addEventListener('click', function (ev) { if (ev.target === overlay) cerrar(); });

    document.addEventListener('keydown', function (ev) {
      if ((ev.ctrlKey || ev.metaKey) && (ev.key === 'k' || ev.key === 'K')) { ev.preventDefault(); abrir(); }
      else if (ev.key === 'Escape') cerrar();
    });

    // botón en la barra lateral
    var nav = document.getElementById('mpi-nav');
    if (nav) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.id = 'mpi-buscar-btn';
      btn.innerHTML = '🔍 Buscar <kbd>Ctrl K</kbd>';
      nav.parentNode.insertBefore(btn, nav);
      btn.addEventListener('click', abrir);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
