/*
 * Componente "divisor-potenciometro": repaso de por qué un potenciómetro es,
 * eléctricamente, un divisor de tensión. RV1 (10 kΩ) tiene sus dos extremos
 * entre +3,3 V y masa; el cursor reparte esos 10 kΩ en dos tramos, R1 (de
 * +3,3 V al cursor) y R2 (del cursor a masa), con R1 + R2 = 10 kΩ siempre.
 * La tensión del cursor (la que llega a AN5) es:
 *   Vo = Vin · R2/(R1+R2) = 3,3 V · (posición del cursor, 0 a 1)
 * Mueve el cursor y se recalculan R1, R2, Vo y una lectura orientativa del
 * conversor A/D (N ≈ Vo/3,3 · 1023; el cálculo exacto está en el tema
 * "Módulo conversor A/D").
 *
 * Uso: <div class="mpi-mount" data-componente="divisor-potenciometro" data-config='{}'></div>
 */
window.MPI = window.MPI || {};
MPI.componentes = MPI.componentes || {};

(function () {
  var VIN = 3.3, RTOTAL = 10000;   // RV1: 10 kΩ entre +3,3 V y masa

  function coma(s) { return String(s).replace('.', ','); }
  function fmtV(v) { return coma(v.toFixed(2)) + ' V'; }
  function fmtR(r) {
    var k = r / 1000;
    var s = (Math.round(k * 10) / 10).toFixed(1);
    if (s.slice(-2) === '.0') s = s.slice(0, -2);
    return coma(s) + ' kΩ';
  }

  MPI.componentes['divisor-potenciometro'] = function (el, cfg) {
    el.classList.add('mpi-divisor-potenciometro');
    var pos = 0.5;   // 0 = cursor pegado a masa, 1 = cursor pegado a +3,3 V

    el.innerHTML =
      '<div class="mpi-sim-cab">RV1 como divisor de tensión</div>' +
      '<div class="dp-cuerpo">' +
        '<div class="dp-esquema">' +
          '<svg viewBox="0 0 220 240" class="dp-svg" aria-hidden="true">' +
            '<line x1="60" y1="20" x2="160" y2="20" stroke="var(--rojo)" stroke-width="2"/>' +
            '<text x="52" y="16" font-size="11" fill="var(--rojo)" text-anchor="end">+3,3 V</text>' +
            '<line x1="110" y1="20" x2="110" y2="48" stroke="var(--txt-2)" stroke-width="2"/>' +
            '<rect class="dp-r1-box" x="92" y="48" width="36" height="44" rx="3" fill="var(--bg-3)" stroke="var(--acento-2)" stroke-width="2"/>' +
            '<text x="84" y="66" font-size="11" fill="var(--acento-2)" text-anchor="end">R<tspan font-size="8" dy="2">1</tspan></text>' +
            '<text class="dp-r1-val" x="84" y="81" font-size="9" fill="var(--txt-2)" text-anchor="end"></text>' +
            '<line x1="110" y1="92" x2="110" y2="124" stroke="var(--txt-2)" stroke-width="2"/>' +
            '<circle class="dp-nodo" cx="110" cy="108" r="3.5" fill="var(--amarillo)"/>' +
            '<line x1="110" y1="108" x2="190" y2="108" stroke="var(--amarillo)" stroke-width="2"/>' +
            '<circle cx="190" cy="108" r="3.5" fill="var(--amarillo)"/>' +
            '<text x="196" y="105" font-size="11" fill="var(--amarillo)">AN5</text>' +
            '<text class="dp-vo-val" x="150" y="100" font-size="10" fill="var(--amarillo)" text-anchor="middle"></text>' +
            '<rect class="dp-r2-box" x="92" y="124" width="36" height="44" rx="3" fill="var(--bg-3)" stroke="var(--azul-cl)" stroke-width="2"/>' +
            '<text x="84" y="142" font-size="11" fill="var(--azul-cl)" text-anchor="end">R<tspan font-size="8" dy="2">2</tspan></text>' +
            '<text class="dp-r2-val" x="84" y="157" font-size="9" fill="var(--txt-2)" text-anchor="end"></text>' +
            '<line x1="110" y1="168" x2="110" y2="200" stroke="var(--txt-2)" stroke-width="2"/>' +
            '<line x1="92" y1="200" x2="128" y2="200" stroke="var(--txt-2)" stroke-width="2"/>' +
            '<line x1="98" y1="206" x2="122" y2="206" stroke="var(--txt-tenue)" stroke-width="1.6"/>' +
            '<line x1="104" y1="212" x2="116" y2="212" stroke="var(--txt-tenue)" stroke-width="1.3"/>' +
            '<text x="138" y="230" font-size="9" fill="var(--txt-tenue)" text-anchor="start">RV1 = R1 + R2 = 10 kΩ, siempre</text>' +
          '</svg>' +
        '</div>' +
        '<div class="dp-panel">' +
          '<label class="dp-lab">Cursor de RV1: <strong class="dp-pos-lab"></strong></label>' +
          '<input type="range" class="dp-cursor" min="0" max="100" step="1" value="50">' +
          '<div class="dp-botones">' +
            '<button type="button" class="dp-ej" data-pos="0">Tope masa (0 %)</button>' +
            '<button type="button" class="dp-ej" data-pos="50">Mitad (50 %)</button>' +
            '<button type="button" class="dp-ej" data-pos="100">Tope +3,3 V (100 %)</button>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="dp-resultados">' +
        '<div class="dp-res"><span class="dp-res-tit">V<sub>o</sub> (AN5)</span><strong class="dp-out-vo"></strong></div>' +
        '<div class="dp-res"><span class="dp-res-tit">R<sub>1</sub></span><strong class="dp-out-r1"></strong></div>' +
        '<div class="dp-res"><span class="dp-res-tit">R<sub>2</sub></span><strong class="dp-out-r2"></strong></div>' +
        '<div class="dp-res"><span class="dp-res-tit">N = get_ad(5)</span><strong class="dp-out-n"></strong></div>' +
      '</div>' +
      '<div class="dp-nota"></div>';

    var slCursor = el.querySelector('.dp-cursor');

    function pintar() {
      var r2 = RTOTAL * pos, r1 = RTOTAL - r2;
      var vo = VIN * pos;
      var n = Math.round(vo / VIN * 1023);

      el.querySelector('.dp-pos-lab').textContent = coma((pos * 100).toFixed(0)) + ' %';
      el.querySelector('.dp-r1-val').textContent = fmtR(r1);
      el.querySelector('.dp-r2-val').textContent = fmtR(r2);
      el.querySelector('.dp-vo-val').textContent = fmtV(vo);
      el.querySelector('.dp-r1-box').setAttribute('stroke-width', (1.5 + 3 * (1 - pos)).toFixed(2));
      el.querySelector('.dp-r2-box').setAttribute('stroke-width', (1.5 + 3 * pos).toFixed(2));

      el.querySelector('.dp-out-vo').textContent = fmtV(vo);
      el.querySelector('.dp-out-r1').textContent = fmtR(r1);
      el.querySelector('.dp-out-r2').textContent = fmtR(r2);
      el.querySelector('.dp-out-n').textContent = n + ' (0x' + n.toString(16).toUpperCase().padStart(3, '0') + ')';

      el.querySelector('.dp-nota').innerHTML =
        'Los dos tramos del potenciómetro suman siempre <strong>10 kΩ</strong>: al mover el cursor, <em>R<sub>1</sub></em> y ' +
        '<em>R<sub>2</sub></em> cambian pero su suma no, así que <code>V<sub>o</sub> = V<sub>in</sub>·R<sub>2</sub>/(R<sub>1</sub>+R<sub>2</sub>) = 3,3 V · ' +
        coma((pos).toFixed(2)) + '</code>. Esa tensión es la que llega a <strong>AN5</strong> (RB3) y el conversor A/D la convierte en el código ' +
        '<code>N</code> de 10 bits que devuelve <code>get_ad(5)</code> (detalle de la fórmula en el tema <em>Módulo conversor A/D</em>).';

      if (MPI.resaltarTodo) MPI.resaltarTodo(el);
    }

    slCursor.addEventListener('input', function () {
      pos = parseInt(slCursor.value, 10) / 100;
      pintar();
    });
    el.querySelectorAll('.dp-ej').forEach(function (b) {
      b.addEventListener('click', function () {
        pos = parseInt(b.getAttribute('data-pos'), 10) / 100;
        slCursor.value = pos * 100;
        pintar();
      });
    });

    pintar();
  };
})();
