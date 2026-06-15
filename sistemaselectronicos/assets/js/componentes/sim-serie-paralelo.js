/*
 * Componente "sim-serie-paralelo": ejercicio interactivo de identificar qué
 * resistencias están en serie y cuáles en paralelo entre A y B.
 * Topología: A —R₁— C —(R₂∥R₃)— D —(R₄∥R₅)— B.
 * Se revela paso a paso, resaltando cada bloque, hasta la R_eq.
 * Valores de ejemplo: R₁=1k, R₂=4k, R₃=12k, R₄=2k, R₅=2k → R_eq = 5 kΩ.
 *
 * Uso: <div class="mpi-mount" data-componente="sim-serie-paralelo" data-config='{}'></div>
 */
window.MPI = window.MPI || {};
MPI.componentes = MPI.componentes || {};

(function () {
  function res(id, x, y, etq) {
    return '<rect class="spr-r" data-r="' + id + '" x="' + x + '" y="' + y + '" width="58" height="18" rx="2.5" ' +
      'fill="var(--bg-3)" stroke="var(--borde)" stroke-width="1.6"/>' +
      '<text x="' + (x + 29) + '" y="' + (y + 13) + '" font-size="11" fill="var(--txt)" text-anchor="middle">' + etq + '</text>';
  }
  function W(x1, y1, x2, y2) { return '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '" stroke="var(--txt-2)" stroke-width="1.6"/>'; }
  function dot(x, y, etq) {
    return '<circle cx="' + x + '" cy="' + y + '" r="3.5" fill="var(--azul-cl)"/>' +
      (etq ? '<text x="' + x + '" y="' + (y - 8) + '" font-size="11" fill="var(--azul-cl)" text-anchor="middle" font-style="italic">' + etq + '</text>' : '');
  }

  // pasos: qué resistencias se resaltan y el texto explicativo
  var PASOS = [
    { hl: [], cls: '',
      msg: 'Cinco resistencias entre <strong>A</strong> y <strong>B</strong>. ¿Cuáles están en serie y cuáles en paralelo? Pulsa «Siguiente» para verlo bloque a bloque.' },
    { hl: ['2', '3'], cls: 'spr-par',
      msg: '<strong>R₂ y R₃</strong> arrancan en el mismo nodo (C) y terminan en el mismo nodo (D): comparten sus dos extremos → están en <strong>PARALELO</strong>. R₂∥R₃ = 4k·12k/(4k+12k) = <strong>3 kΩ</strong>.' },
    { hl: ['4', '5'], cls: 'spr-par',
      msg: '<strong>R₄ y R₅</strong> comparten los nodos D y B → también en <strong>PARALELO</strong>. R₄∥R₅ = 2k·2k/(2k+2k) = <strong>1 kΩ</strong>.' },
    { hl: ['1', '2', '3', '4', '5'], cls: 'spr-ser',
      msg: 'Los tres bloques —<strong>R₁</strong>, <strong>(R₂∥R₃)</strong> y <strong>(R₄∥R₅)</strong>— se recorren uno tras otro por la <em>misma corriente</em>: están en <strong>SERIE</strong>, así que se suman.' },
    { hl: ['1', '2', '3', '4', '5'], cls: 'spr-ser',
      msg: '✔ <strong>R_eq = R₁ + (R₂∥R₃) + (R₄∥R₅) = 1k + 3k + 1k = 5 kΩ.</strong> Regla de oro: primero los paralelos, luego se suman las series.' }
  ];

  MPI.componentes['sim-serie-paralelo'] = function (el, cfg) {
    var paso = 0;
    el.classList.add('mpi-spr');

    var svg = '<svg viewBox="0 0 520 200" class="spr-svg" aria-label="Cinco resistencias entre A y B">' +
      // A — R1 — C
      W(24, 100, 56, 100) + res('1', 56, 91, 'R₁') + W(114, 100, 150, 100) +
      dot(24, 100, 'A') + dot(150, 100, 'C') +
      // R2 ∥ R3 entre C(150) y D(310)
      W(150, 100, 150, 60) + W(150, 60, 200, 60) + res('2', 200, 51, 'R₂') + W(258, 60, 310, 60) + W(310, 60, 310, 100) +
      W(150, 100, 150, 140) + W(150, 140, 200, 140) + res('3', 200, 131, 'R₃') + W(258, 140, 310, 140) + W(310, 140, 310, 100) +
      dot(310, 100, 'D') +
      // R4 ∥ R5 entre D(310) y B(470)
      W(310, 100, 310, 60) + W(310, 60, 360, 60) + res('4', 360, 51, 'R₄') + W(418, 60, 470, 60) + W(470, 60, 470, 100) +
      W(310, 100, 310, 140) + W(310, 140, 360, 140) + res('5', 360, 131, 'R₅') + W(418, 140, 470, 140) + W(470, 140, 470, 100) +
      W(470, 100, 496, 100) + dot(496, 100, 'B') +
      '</svg>';

    el.innerHTML =
      '<div class="mpi-sim-cab">Serie o paralelo: 5 resistencias entre A y B</div>' +
      svg +
      '<div class="spr-msg nota"></div>' +
      '<div class="spr-botones">' +
        '<button type="button" class="spr-paso">Siguiente ▶</button>' +
        '<button type="button" class="spr-reset">Reiniciar ↺</button>' +
      '</div>';

    function pintar() {
      var p = PASOS[paso];
      el.querySelectorAll('.spr-r').forEach(function (r) {
        r.classList.remove('spr-par', 'spr-ser');
        if (p.hl.indexOf(r.getAttribute('data-r')) >= 0 && p.cls) r.classList.add(p.cls);
      });
      el.querySelector('.spr-msg').innerHTML = p.msg;
      el.querySelector('.spr-paso').disabled = (paso >= PASOS.length - 1);
    }

    el.querySelector('.spr-paso').addEventListener('click', function () {
      if (paso < PASOS.length - 1) { paso++; pintar(); }
    });
    el.querySelector('.spr-reset').addEventListener('click', function () { paso = 0; pintar(); });
    pintar();
  };
})();
