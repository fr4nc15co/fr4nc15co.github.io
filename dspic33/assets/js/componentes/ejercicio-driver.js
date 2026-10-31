/*
 * Componente "ejercicio-driver": ejercicio guiado de opción múltiple. Plantea un
 * enunciado y guía al alumno, pregunta a pregunta, con corrección y explicación
 * inmediatas. Genérico para cualquier asignatura.
 *
 * Config:
 * {
 *   titulo, enunciado (html), contexto (html opcional),
 *   tag,                          // etiqueta de la cabecera (por defecto "Ejercicio")
 *   preguntas: [ { texto, opciones:[str...], correcta: idx, explicacion: html, fijas?: bool } ],
 *   barajar                       // por defecto true: las opciones se muestran en orden aleatorio
 * }
 * Las opciones se barajan al mostrarse (así la posición de la correcta no da pistas);
 * `correcta` sigue siendo el índice en el array original. `fijas: true` en una pregunta
 * (p. ej. «Todas las anteriores») o `barajar: false` en el ejercicio lo desactivan.
 */
window.MPI = window.MPI || {};
MPI.componentes = MPI.componentes || {};

(function () {
  MPI.componentes['ejercicio-driver'] = function (el, config) {
    // El contenido puede venir inline o por referencia a MPI.ejercicios[ref]
    // (más cómodo para texto rico con comillas).
    if (config && config.ref && MPI.ejercicios && MPI.ejercicios[config.ref]) {
      config = MPI.ejercicios[config.ref];
    }
    el.classList.add('mpi-ejercicio');
    var preguntas = config.preguntas || [];
    var respondidas = new Array(preguntas.length).fill(-1);

    var html = '<div class="ej-cab"><span class="ej-tag">' + (config.tag || 'Ejercicio') + '</span>';
    if (config.titulo) html += '<h4>' + config.titulo + '</h4>';
    html += '</div>';
    if (config.enunciado) html += '<div class="ej-enunciado">' + config.enunciado + '</div>';
    if (config.contexto) html += '<div class="ej-contexto">' + config.contexto + '</div>';

    function orden(n, fijo) {
      var o = []; for (var k = 0; k < n; k++) o.push(k);
      if (fijo) return o;
      for (var a = n - 1; a > 0; a--) { var b = Math.floor(Math.random() * (a + 1)); var t = o[a]; o[a] = o[b]; o[b] = t; }
      return o;
    }

    html += '<ol class="ej-preguntas">';
    preguntas.forEach(function (p, i) {
      html += '<li class="ej-pregunta" data-i="' + i + '"><p class="ej-texto">' + p.texto + '</p><div class="ej-opciones">';
      // data-j guarda el índice ORIGINAL de la opción, sea cual sea su posición en pantalla.
      orden(p.opciones.length, config.barajar === false || p.fijas).forEach(function (j) {
        html += '<button type="button" class="ej-opcion" data-i="' + i + '" data-j="' + j + '">' + p.opciones[j] + '</button>';
      });
      html += '</div><div class="ej-feedback" hidden></div></li>';
    });
    html += '</ol><div class="ej-progreso"></div>';
    el.innerHTML = html;

    var progreso = el.querySelector('.ej-progreso');

    function actualizarProgreso() {
      var aciertos = 0, hechas = 0;
      respondidas.forEach(function (r, i) { if (r !== -1) { hechas++; if (r === preguntas[i].correcta) aciertos++; } });
      progreso.textContent = hechas < preguntas.length
        ? 'Respondidas ' + hechas + ' de ' + preguntas.length
        : '✓ Completado · ' + aciertos + '/' + preguntas.length + ' correctas';
      progreso.className = 'ej-progreso' + (hechas === preguntas.length ? ' ej-progreso-fin' : '');
    }

    el.addEventListener('click', function (e) {
      var btn = e.target.closest('.ej-opcion'); if (!btn) return;
      var i = parseInt(btn.getAttribute('data-i'), 10);
      var j = parseInt(btn.getAttribute('data-j'), 10);
      var p = preguntas[i];
      respondidas[i] = j;

      var li = el.querySelector('.ej-pregunta[data-i="' + i + '"]');
      var botones = li.querySelectorAll('.ej-opcion');
      botones.forEach(function (b) {
        var k = parseInt(b.getAttribute('data-j'), 10);
        b.classList.remove('ej-ok', 'ej-mal');
        if (k === p.correcta) b.classList.add('ej-ok');
        else if (k === j) b.classList.add('ej-mal');
      });
      var fb = li.querySelector('.ej-feedback');
      var acierto = j === p.correcta;
      fb.hidden = false;
      fb.className = 'ej-feedback ' + (acierto ? 'ej-feedback-ok' : 'ej-feedback-mal');
      fb.innerHTML = '<strong>' + (acierto ? '✓ Correcto. ' : '✗ No exactamente. ') + '</strong>' + (p.explicacion || '');
      actualizarProgreso();
    });

    actualizarProgreso();
  };
})();
