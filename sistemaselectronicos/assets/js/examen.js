/*
 * Modo examen: monta un test de N preguntas elegidas al azar entre todos los
 * ejercicios de los 12 temas, con corrección y nota al final. Todo ocurre en
 * el navegador: no se envía ni se guarda nada.
 *
 * app.js enruta #/examen hacia MPI.vistaExamen(main).
 */
window.MPI = window.MPI || {};

(function () {
  function gaEvent(name, params) { if (typeof gtag === 'function') gtag('event', name, params); }

  function barajar(v) {
    for (var i = v.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = v[i]; v[i] = v[j]; v[j] = t;
    }
    return v;
  }

  function temaDeRef(ref) {
    // las referencias son "<slug>-N"
    var slug = ref.replace(/-\d+$/, '');
    var t = (MPI.temas || []).filter(function (x) { return x.slug === slug; })[0];
    return t ? 'Tema ' + t.num + ' · ' + t.titulo : '';
  }

  function montarTest(el, n) {
    // 1) reunir todas las preguntas de todos los ejercicios
    var banco = [];
    Object.keys(MPI.ejercicios || {}).forEach(function (ref) {
      var ej = MPI.ejercicios[ref];
      (ej.preguntas || []).forEach(function (p) {
        banco.push({ ref: ref, ej: ej, p: p });
      });
    });
    barajar(banco);
    var elegidas = banco.slice(0, Math.min(n, banco.length));
    gaEvent('examen_inicio', { total_preguntas: elegidas.length, site: 'sistemaselectronicos' });

    // 2) barajar también las opciones de cada pregunta (remapeando la correcta)
    var items = elegidas.map(function (it) {
      var orden = barajar(it.p.opciones.map(function (_, i) { return i; }));
      return { ref: it.ref, ej: it.ej, p: it.p, orden: orden,
               correcta: orden.indexOf(it.p.correcta), respuesta: null };
    });

    // 3) pintar
    var html = ['<header class="tema-cab"><span class="tema-num">Modo examen</span>' +
      '<h1>Test de ' + items.length + ' preguntas</h1>' +
      '<p class="tema-lead">Preguntas al azar de los 12 temas (banco de ' + banco.length +
      '). Responde y pulsa <strong>Corregir</strong> al final. Nada sale de tu navegador.</p></header>'];

    items.forEach(function (it, qi) {
      html.push('<section class="ex-pregunta" data-q="' + qi + '">');
      html.push('<h2>Pregunta ' + (qi + 1) + ' <small class="ex-origen">' + temaDeRef(it.ref) + '</small></h2>');
      html.push('<details class="ex-contexto"><summary>Ver el enunciado del ejercicio («' +
                it.ej.titulo + '»)</summary>' + (it.ej.enunciado || '') + (it.ej.contexto || '') + '</details>');
      html.push('<p class="ex-texto">' + it.p.texto + '</p>');
      it.orden.forEach(function (oi, k) {
        html.push('<label class="ex-opcion"><input type="radio" name="q' + qi + '" value="' + k + '"> ' +
                  '<span>' + it.p.opciones[oi] + '</span></label>');
      });
      html.push('<div class="ex-feedback"></div>');
      html.push('</section>');
    });
    html.push('<div class="ex-pie">' +
      '<button type="button" class="ex-corregir">Corregir</button>' +
      '<button type="button" class="ex-otro">Otro test</button>' +
      '<span class="ex-nota"></span></div>');

    el.innerHTML = '<article class="mpi-tema mpi-examen">' + html.join('') + '</article>';
    if (MPI.resaltarTodo) MPI.resaltarTodo(el);

    el.querySelector('.ex-corregir').addEventListener('click', function () {
      var aciertos = 0, sinResponder = 0;
      items.forEach(function (it, qi) {
        var sec = el.querySelector('[data-q="' + qi + '"]');
        var marcado = sec.querySelector('input:checked');
        var fb = sec.querySelector('.ex-feedback');
        var labels = sec.querySelectorAll('.ex-opcion');
        labels[it.correcta].classList.add('ex-buena');
        if (!marcado) {
          sinResponder++;
          fb.innerHTML = '<div class="nota">⚠ Sin responder. La correcta está marcada en verde. ' + (it.p.explicacion || '') + '</div>';
        } else if (parseInt(marcado.value, 10) === it.correcta) {
          aciertos++;
          fb.innerHTML = '<div class="nota ex-ok">✔ Correcta. ' + (it.p.explicacion || '') + '</div>';
        } else {
          marcado.closest('.ex-opcion').classList.add('ex-mala');
          fb.innerHTML = '<div class="nota ex-ko">✘ No es esa. ' + (it.p.explicacion || '') + '</div>';
        }
        sec.querySelectorAll('input').forEach(function (i) { i.disabled = true; });
      });
      var sobre10 = Math.round(aciertos / items.length * 100) / 10;
      el.querySelector('.ex-nota').innerHTML =
        'Nota: <strong>' + aciertos + ' / ' + items.length + '</strong> (' +
        String(sobre10).replace('.', ',') + ' sobre 10)' +
        (sinResponder ? ' — ' + sinResponder + ' sin responder' : '');
      gaEvent('examen_resultado', { aciertos: aciertos, total: items.length, nota: sobre10, site: 'sistemaselectronicos' });
      this.disabled = true;
      el.querySelector('.ex-nota').scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
    el.querySelector('.ex-otro').addEventListener('click', function () { gaEvent('examen_reintentar', { site: 'sistemaselectronicos' }); montarTest(el, n); window.scrollTo(0, 0); });
  }

  MPI.vistaExamen = function (el) {
    montarTest(el, 10);
  };
})();
