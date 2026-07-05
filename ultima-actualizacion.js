/* Actualiza "Última actualización" con la fecha del último commit del repo.
   Cada elemento con clase .ult-act se rellena consultando la API de GitHub.
   Si el elemento tiene data-ruta, usa el último commit que tocó esa carpeta;
   si no, el último commit del repositorio. En caso de error se conserva el
   texto por defecto que ya trae el HTML (respaldo para file:// o sin red). */
(function () {
  'use strict';
  var REPO = 'fr4nc15co/fr4nc15co.github.io';
  var MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
    'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

  function formatea(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return null;
    return MESES[d.getMonth()] + ' ' + d.getFullYear();
  }

  function actualiza(el) {
    var ruta = el.getAttribute('data-ruta') || '';
    var url = 'https://api.github.com/repos/' + REPO + '/commits?per_page=1' +
      (ruta ? '&path=' + encodeURIComponent(ruta) : '');
    fetch(url)
      .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
      .then(function (commits) {
        if (!commits || !commits.length || !commits[0].commit) return;
        var texto = formatea(commits[0].commit.committer.date);
        if (texto) el.textContent = texto;
      })
      .catch(function () { /* se mantiene el texto por defecto */ });
  }

  document.querySelectorAll('.ult-act').forEach(actualiza);
})();
