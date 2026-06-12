/*
 * Componente "ejercicio-driver": ejercicio guiado de diseño de drivers. Plantea
 * un sistema con sensores/actuadores y guía al alumno, pregunta a pregunta, a
 * decidir el periférico/modo/configuración, con corrección y explicación.
 *
 * Config:
 * {
 *   titulo, enunciado (html), contexto (html opcional con E/S),
 *   preguntas: [ { texto, opciones:[str...], correcta: idx, explicacion: html } ]
 * }
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

    var html = '<div class="ej-cab"><span class="ej-tag">Ejercicio · diseño de drivers</span>';
    if (config.titulo) html += '<h4>' + config.titulo + '</h4>';
    html += '</div>';
    if (config.enunciado) html += '<div class="ej-enunciado">' + config.enunciado + '</div>';
    if (config.contexto) html += '<div class="ej-contexto">' + config.contexto + '</div>';

    html += '<ol class="ej-preguntas">';
    preguntas.forEach(function (p, i) {
      html += '<li class="ej-pregunta" data-i="' + i + '"><p class="ej-texto">' + p.texto + '</p><div class="ej-opciones">';
      p.opciones.forEach(function (op, j) {
        html += '<button type="button" class="ej-opcion" data-i="' + i + '" data-j="' + j + '">' + op + '</button>';
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
      botones.forEach(function (b, k) {
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
