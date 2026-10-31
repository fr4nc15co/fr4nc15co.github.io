/*
 * Componente "sinfonia-player": problema 19.6.1 «Sinfonía» (tema 13).
 * Un altavoz en RB0; la ISR del Timer 1 (PR1 = 2000, T1CON = 0x8000 → un tick cada 50 µs
 * a 40 MHz) genera una onda cuadrada de PER ticks durante «duracion» ticks por nota.
 *
 * Uso:
 *   <div class="mpi-mount" data-componente="sinfonia-player"
 *        data-config='{"per":[20,13,40,10,20,100],"duracion":[10000,20000,8000,40000,4000,60000],"tickUs":50}'></div>
 *
 * Claves de data-config (todas opcionales; por defecto, los arrays de la solución):
 *   per      : periodo de cada nota en ticks (enteros ≥ 2), hasta 12 notas.
 *   duracion : duración de cada nota en ticks (misma longitud que per).
 *   tickUs   : periodo de la interrupción en µs (por defecto 50).
 *
 * Muestra: periodo (ticks y ms), frecuencia = 1 / (PER·tick) y su comparación con la frecuencia
 * pedida, duración (ticks y ms); reproduce la secuencia con Web Audio (OscillatorNode de onda
 * cuadrada, volumen moderado; se detiene al salir del tema), resalta la nota que suena y dibuja
 * la forma de onda de RB0 de la nota actual (cont = 0..PER-1; alto mientras cont < PER/2).
 */
window.MPI = window.MPI || {};
MPI.componentes = MPI.componentes || {};

(function () {
  var NBSP = ' ';
  var PER_DEF = [20, 13, 40, 10, 20, 100];
  var DUR_DEF = [10000, 20000, 8000, 40000, 4000, 60000];
  var FREC_ENUNCIADO = [1000, 1500, 500, 2000, 1000, 200];   // tabla del enunciado (19.6.1)
  var VOLUMEN = 0.06;
  var MAX_NOTAS = 12;

  function agrupar(entero) {
    var s = String(entero);
    if (s.length >= 5) s = s.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
    return s;
  }
  function num(x, nd) {
    if (!isFinite(x)) return '—';
    var s = Math.abs(x).toFixed(nd == null ? 1 : nd);
    if (s.indexOf('.') >= 0) s = s.replace(/0+$/, '').replace(/\.$/, '');
    var p = s.split('.');
    return (x < 0 ? '−' : '') + agrupar(p[0]) + (p[1] ? ',' + p[1] : '');
  }
  function enteros(arr, min) {
    if (!Array.isArray(arr)) return null;
    var r = [];
    for (var i = 0; i < arr.length && i < MAX_NOTAS; i++) {
      var v = Math.round(Number(arr[i]));
      if (!isFinite(v) || v < min) return null;
      r.push(v);
    }
    return r.length ? r : null;
  }

  var ID = 0;

  MPI.componentes['sinfonia-player'] = function (el, cfg) {
    cfg = cfg || {};
    var uid = 'sfp' + (++ID);
    var per = enteros(cfg.per, 2) || PER_DEF.slice();
    var dur = enteros(cfg.duracion, 1) || DUR_DEF.slice();
    var n = Math.min(per.length, dur.length);
    per = per.slice(0, n); dur = dur.slice(0, n);
    var tickUs = Number(cfg.tickUs) > 0 ? Number(cfg.tickUs) : 50;
    var reducido = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var AC = window.AudioContext || window.webkitAudioContext;

    var notas = per.map(function (p, i) {
      return {
        per: p, dur: dur[i],
        Tms: p * tickUs / 1000,
        f: 1e6 / (p * tickUs),
        ms: dur[i] * tickUs / 1000
      };
    });
    var totalMs = notas.reduce(function (a, b) { return a + b.ms; }, 0);
    var sel = 0;              // nota cuya onda se dibuja
    var juego = null;         // reproducción en curso

    var filas = '';
    notas.forEach(function (o, i) {
      var tieneObj = i < FREC_ENUNCIADO.length;
      var difEn = tieneObj && Math.abs(o.f - FREC_ENUNCIADO[i]) > 0.5;
      filas += '<tr data-i="' + i + '">' +
        '<th scope="row">' + (i + 1) + ' <span class="sfp-idx">[' + i + ']</span></th>' +
        '<td>' + o.per + ' <span class="sfp-t">· ' + num(o.Tms, 3) + NBSP + 'ms</span></td>' +
        '<td><b>' + num(o.f, 1) + NBSP + 'Hz</b></td>' +
        '<td' + (difEn ? ' class="sfp-dif"' : '') + '>' + (tieneObj ? agrupar(FREC_ENUNCIADO[i]) + NBSP + 'Hz' + (difEn ? ' <span aria-hidden="true">⚠</span><span class="sfp-sr"> (no coincide)</span>' : '') : '—') + '</td>' +
        '<td>' + agrupar(o.dur) + ' <span class="sfp-t">· ' + num(o.ms, 1) + NBSP + 'ms</span></td>' +
        '<td class="sfp-acc"><button type="button" class="sfp-btn sfp-ver" aria-pressed="false" aria-label="Ver la onda de la nota ' + (i + 1) + '">Onda</button>' +
          '<button type="button" class="sfp-btn sfp-una" aria-label="Escuchar solo la nota ' + (i + 1) + '">▶</button></td>' +
      '</tr>';
    });

    var tira = '';
    notas.forEach(function (o, i) {
      tira += '<span class="sfp-seg" data-i="' + i + '" style="flex-grow:' + o.ms + '"><span class="sfp-seg-fill"></span><span class="sfp-seg-lab">' + (i + 1) + '</span></span>';
    });

    el.classList.add('mpi-sinfonia-player');
    el.innerHTML =
      '<div class="mpi-sim-cab">Sinfonía (19.6.1) · notas generadas por la ISR del Timer 1 <span class="sfp-cab-sub">reproductor</span></div>' +
      '<p class="sfp-intro">Un tick = ' + num(tickUs, 3) + NBSP + 'µs' +
        (tickUs === 50 ? ' (PR1 = 2000, T1CON = 0x8000 a F<sub>CY</sub> = 40 MHz)' : '') +
        '. Frecuencia = 1 / (PER · tick); duración = duracion · tick. Melodía completa: ' + num(totalMs / 1000, 2) + NBSP + 's.</p>' +
      '<div class="sfp-scroll"><table class="sfp-tabla">' +
        '<caption class="sfp-sr">Notas de la melodía</caption>' +
        '<thead><tr><th scope="col">Nota <span class="sfp-idx">[índice]</span></th><th scope="col">PER (ticks · periodo)</th><th scope="col">Frecuencia</th>' +
          '<th scope="col">Enunciado</th>' +
          '<th scope="col">duracion (ticks · tiempo)</th><th scope="col"><span class="sfp-sr">Acciones</span></th></tr></thead>' +
        '<tbody>' + filas + '</tbody></table></div>' +
      '<div class="sfp-ctrl">' +
        '<button type="button" class="sfp-btn sfp-tocar" aria-pressed="false">▶ Tocar</button>' +
        '<label class="sfp-bucle"><input type="checkbox" class="sfp-loop"> En bucle (como el micro)</label>' +
        '<span class="sfp-estado" role="status" aria-live="polite"></span>' +
      '</div>' +
      '<div class="sfp-tira" aria-hidden="true">' + tira + '</div>' +
      '<p class="sfp-aviso sfp-noaudio" hidden>Este navegador no tiene Web Audio: no se puede reproducir el sonido, pero la tabla y la forma de onda siguen siendo válidas.</p>' +
      '<div class="sfp-sub">Forma de onda en RB0 · <span class="sfp-onda-tit"></span></div>' +
      '<div class="sfp-scroll sfp-svg-caja"></div>' +
      '<p class="sfp-onda-txt"></p>';

    var q = function (s) { return el.querySelector(s); };
    var btnTocar = q('.sfp-tocar'), chkLoop = q('.sfp-loop'), estado = q('.sfp-estado');
    var tbody = q('.sfp-tabla tbody'), svgCaja = q('.sfp-svg-caja'), ondaTit = q('.sfp-onda-tit'), ondaTxt = q('.sfp-onda-txt');
    var segs = el.querySelectorAll('.sfp-seg');

    if (!AC) {
      q('.sfp-noaudio').hidden = false;
      btnTocar.disabled = true;
      Array.prototype.forEach.call(el.querySelectorAll('.sfp-una'), function (b) { b.disabled = true; });
    }

    // ---------- Forma de onda ----------
    function dibujarOnda(i) {
      var o = notas[i], p = o.per, mitad = Math.floor(p / 2);
      var N = 2 * p;                          // dos periodos
      var X0 = 46, X1 = 700, yA = 26, yB = 76;
      var dx = (X1 - X0) / N;
      var d = '', prev = null;
      for (var j = 0; j < N; j++) {
        var cont = j % p;                     // valor de cont en la ISR j+1 (0..p-1)
        var alto = cont < mitad;
        var y = alto ? yA : yB, x = X0 + j * dx;
        d += (prev === null ? 'M' + x.toFixed(2) + ' ' + y : (prev !== y ? 'V' + y : '')) + 'H' + (x + dx).toFixed(2);
        prev = y;
      }
      var s = '<svg class="sfp-svg" viewBox="0 0 720 ' + (N <= 48 ? 120 : 104) + '" role="img" aria-labelledby="' + uid + '-ot">' +
        '<title id="' + uid + '-ot">RB0 durante dos periodos de la nota ' + (i + 1) + ': alto ' + mitad + ' ticks y bajo ' + (p - mitad) + ' ticks por periodo de ' + p + ' ticks</title>' +
        '<text class="sfp-svg-lab" x="6" y="' + (yA + 4) + '">1</text><text class="sfp-svg-lab" x="6" y="' + (yB + 4) + '">0</text>' +
        '<text class="sfp-svg-lab" x="20" y="' + ((yA + yB) / 2 + 4) + '">RB0</text>';
      // rejilla de ticks
      if (N <= 120) {
        var g = '';
        for (j = 0; j <= N; j++) g += 'M' + (X0 + j * dx).toFixed(2) + ' ' + (yA - 8) + 'V' + (yB + 6);
        s += '<path class="sfp-svg-rej" d="' + g + '"/>';
      }
      // separación de periodos
      s += '<path class="sfp-svg-per" d="M' + X0 + ' ' + (yA - 12) + 'V' + (yB + 8) + 'M' + (X0 + p * dx).toFixed(2) + ' ' + (yA - 12) + 'V' + (yB + 8) + 'M' + X1 + ' ' + (yA - 12) + 'V' + (yB + 8) + '"/>';
      s += '<path class="sfp-svg-onda" d="' + d + '"/>';
      if (N <= 48) {
        for (j = 0; j < N; j++) {
          s += '<text class="sfp-svg-cont" x="' + (X0 + (j + 0.5) * dx).toFixed(2) + '" y="' + (yB + 20) + '" text-anchor="middle">' + (j % p) + '</text>';
        }
        s += '<text class="sfp-svg-lab" x="6" y="' + (yB + 20) + '">cont</text>';
      }
      s += '<text class="sfp-svg-ax" x="' + X0 + '" y="' + (yA - 14) + '">0</text>' +
        '<text class="sfp-svg-ax" x="' + (X0 + p * dx).toFixed(2) + '" y="' + (yA - 14) + '" text-anchor="middle">' + num(o.Tms, 3) + ' ms</text>' +
        '<text class="sfp-svg-ax" x="' + X1 + '" y="' + (yA - 14) + '" text-anchor="end">' + num(2 * o.Tms, 3) + ' ms</text>';
      s += '</svg>';
      svgCaja.innerHTML = s;
      ondaTit.textContent = 'nota ' + (i + 1) + ' (PER = ' + p + ' ticks, ' + num(o.f, 1) + ' Hz)';
      var tA = mitad * tickUs, tB = (p - mitad) * tickUs;
      ondaTxt.innerHTML = 'La ISR comprueba <code>cont &lt; PER/2</code> antes de incrementar <code>cont</code>, que va de 0 a ' + (p - 1) + '. ' +
        'Alto mientras <code>cont &lt; PER/2 = ' + mitad + '</code>: ' + mitad + ' ticks (' + num(tA, 1) + NBSP + 'µs); ' +
        'bajo ' + (p - mitad) + ' ticks (' + num(tB, 1) + NBSP + 'µs). Periodo ' + p + ' ticks = ' + num(o.Tms, 3) + NBSP + 'ms → ' + num(o.f, 1) + NBSP + 'Hz; ' +
        'ciclo de trabajo ' + num(mitad / p * 100, 1) + NBSP + '%.';
      Array.prototype.forEach.call(tbody.querySelectorAll('.sfp-ver'), function (b, k) { b.setAttribute('aria-pressed', k === i ? 'true' : 'false'); });
      Array.prototype.forEach.call(tbody.querySelectorAll('tr'), function (tr, k) { tr.classList.toggle('sfp-sel', k === i); });
    }

    // ---------- Audio ----------
    function vivo() { return document.body.contains(el); }
    function marcarSonando(i) {
      Array.prototype.forEach.call(tbody.querySelectorAll('tr'), function (tr, k) { tr.classList.toggle('sfp-sonando', k === i); });
      Array.prototype.forEach.call(segs, function (sg, k) {
        sg.classList.toggle('sfp-seg-on', k === i);
        if (k !== i) sg.firstChild.style.width = '0';
      });
    }
    function parar() {
      if (!juego) return;
      var jg = juego; juego = null;
      clearInterval(jg.iv);
      try {
        var t = jg.ctx.currentTime;
        jg.gain.gain.cancelScheduledValues(t);
        jg.gain.gain.setTargetAtTime(0, t, 0.015);
        jg.osc.stop(t + 0.08);
      } catch (e) { /* ya parado */ }
      setTimeout(function () { try { jg.ctx.close(); } catch (e) { /* nada */ } }, 150);
      marcarSonando(-1);
      btnTocar.textContent = '▶ Tocar';
      btnTocar.setAttribute('aria-pressed', 'false');
      estado.textContent = '';
    }
    // Programa una pasada de la secuencia «orden» a partir del instante t (s, reloj del AudioContext).
    function programar(jg, t) {
      jg.orden.forEach(function (i) {
        jg.osc.frequency.setValueAtTime(notas[i].f, t);
        jg.tramos.push({ i: i, t0: t, t1: t + notas[i].ms / 1000 });
        t += notas[i].ms / 1000;
      });
      jg.fin = t;
    }
    function tocar(orden, bucle) {
      parar();
      if (!AC) return;
      var ctx;
      try { ctx = new AC(); } catch (e) { q('.sfp-noaudio').hidden = false; return; }
      var osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.type = 'square';
      gain.gain.value = 0;
      osc.connect(gain); gain.connect(ctx.destination);
      var t0 = ctx.currentTime + 0.06;
      gain.gain.setTargetAtTime(VOLUMEN, t0, 0.01);
      var jg = { ctx: ctx, osc: osc, gain: gain, orden: orden, bucle: bucle, tramos: [], actual: -2, fin: t0 };
      programar(jg, t0);
      osc.start(t0);
      if (ctx.state === 'suspended' && ctx.resume) ctx.resume();
      juego = jg;
      if (orden.length > 1) {
        btnTocar.textContent = '■ Parar';
        btnTocar.setAttribute('aria-pressed', 'true');
      }
      jg.iv = setInterval(function () {
        if (juego !== jg) return;
        if (!vivo()) { parar(); return; }
        var t = ctx.currentTime;
        if (jg.bucle && jg.fin - t < 1.5) programar(jg, jg.fin);
        if (!jg.bucle && t >= jg.fin) {
          jg.gain.gain.setTargetAtTime(0, jg.fin, 0.01);
          parar(); return;
        }
        while (jg.tramos.length > 1 && t >= jg.tramos[0].t1) jg.tramos.shift();
        var tr = jg.tramos[0];
        if (!tr || t < tr.t0) return;
        if (tr.i !== jg.actual) {
          jg.actual = tr.i;
          marcarSonando(tr.i);
          dibujarOnda(tr.i);
          sel = tr.i;
          estado.textContent = '♪ Suena la nota ' + (tr.i + 1) + ': ' + num(notas[tr.i].f, 1) + ' Hz durante ' + num(notas[tr.i].ms, 1) + ' ms';
        }
        if (!reducido) {
          var sg = segs[tr.i];
          if (sg) sg.firstChild.style.width = Math.min(100, (t - tr.t0) / (tr.t1 - tr.t0) * 100).toFixed(1) + '%';
        }
      }, 50);
    }

    btnTocar.addEventListener('click', function () {
      if (juego && juego.orden.length > 1) { parar(); return; }
      var orden = notas.map(function (o, i) { return i; });
      tocar(orden, chkLoop.checked);
    });
    chkLoop.addEventListener('change', function () { if (juego && juego.orden.length > 1) juego.bucle = chkLoop.checked; });
    tbody.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('button') : null;
      if (!b) return;
      var i = +b.closest('tr').getAttribute('data-i');
      if (b.classList.contains('sfp-ver')) { sel = i; if (!juego) dibujarOnda(i); else { parar(); dibujarOnda(i); } }
      else if (b.classList.contains('sfp-una')) { sel = i; dibujarOnda(i); tocar([i], false); }
    });
    // Parar al ocultar la pestaña o salir de la página.
    function alSalir(e) {
      if (!vivo()) {
        parar();
        document.removeEventListener('visibilitychange', alSalir);
        window.removeEventListener('pagehide', alSalir);
        return;
      }
      if (juego && (e.type === 'pagehide' || document.hidden)) parar();
    }
    document.addEventListener('visibilitychange', alSalir);
    window.addEventListener('pagehide', alSalir);

    dibujarOnda(sel);
  };
})();
