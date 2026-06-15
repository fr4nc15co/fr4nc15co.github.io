/*
 * Componente "fsm-cerradura": la cerradura electrónica del tema 8 (flancos en
 * los estados), animada con su cadena de estados y una cerradura en vivo.
 * Adaptado a la Raspberry Pi 4: pulsadores p1 = Button(17) y p0 = Button(16),
 * relé de salida en GPIO20. La secuencia que abre es p1 → p0 → p0; la salida
 * permanece activa mientras se mantenga pulsado el último p0.
 *
 * Los botones son de MANTENER PULSADO: al apretar/soltar se ejecuta un ciclo de
 * scan (igual que el bucle real, que ve cada flanco en iteraciones distintas).
 *
 * Uso: <div class="mpi-mount" data-componente="fsm-cerradura" data-config='{}'></div>
 */
window.MPI = window.MPI || {};
MPI.componentes = MPI.componentes || {};

(function () {
  var CHAIN = ['REPOSO', 'PUL_P1', 'LIB_P1', 'PUL_P0', 'LIB_P0', 'SEC_OK'];
  var LABELS = ['p1 ↓', 'p1 ↑', 'p0 ↓', 'p0 ↑', 'p0 ↓'];
  // δ: primera fila cuyo (p1,p0) casa; si ninguna casa, se mantiene el estado.
  var DELTA = {
    REPOSO: [{ p1: 1, p0: 0, a: 'PUL_P1' }],
    PUL_P1: [{ p1: 0, p0: 0, a: 'LIB_P1' }, { p1: 0, p0: 1, a: 'PUL_P0' }, { p1: 1, p0: 1, a: 'REPOSO' }],
    LIB_P1: [{ p1: 1, p0: 0, a: 'PUL_P1' }, { p1: 0, p0: 1, a: 'PUL_P0' }, { p1: 1, p0: 1, a: 'REPOSO' }],
    PUL_P0: [{ p1: 1, p0: 0, a: 'PUL_P1' }, { p1: 0, p0: 0, a: 'LIB_P0' }, { p1: 1, p0: 1, a: 'REPOSO' }],
    LIB_P0: [{ p1: 1, p0: 0, a: 'PUL_P1' }, { p1: 0, p0: 1, a: 'SEC_OK' }, { p1: 1, p0: 1, a: 'REPOSO' }],
    SEC_OK: [{ p1: 1, p0: 0, a: 'PUL_P1' }, { p1: 0, p0: 0, a: 'REPOSO' }, { p1: 1, p0: 1, a: 'REPOSO' }]
  };

  MPI.componentes['fsm-cerradura'] = function (el, cfg) {
    var estado = 'REPOSO';
    var p1 = 0, p0 = 0;

    el.classList.add('mpi-fsm');
    var svg = ['<svg viewBox="0 0 740 110" class="fsm-svg" aria-label="Cadena de estados de la cerradura">'];
    svg.push('<defs><marker id="flcr" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto">' +
             '<path d="M0 0 L9 4.5 L0 9 Z" fill="var(--txt-tenue,#6a737d)"/></marker></defs>');
    var cx = CHAIN.map(function (_, i) { return 58 + i * 125; });
    for (var i = 0; i < CHAIN.length - 1; i++) {
      svg.push('<line x1="' + (cx[i] + 48) + '" y1="58" x2="' + (cx[i + 1] - 48) + '" y2="58" stroke="var(--txt-tenue)" stroke-width="1.5" marker-end="url(#flcr)"/>');
      svg.push('<text x="' + (cx[i] + 62) + '" y="46" font-size="11" fill="var(--txt-2)" text-anchor="middle">' + LABELS[i] + '</text>');
    }
    CHAIN.forEach(function (nom, i) {
      svg.push('<g class="fsm-nodo" data-estado="' + nom + '">' +
        '<ellipse cx="' + cx[i] + '" cy="58" rx="48" ry="22" fill="var(--bg-3)" stroke="var(--borde)" stroke-width="2"/>' +
        '<text x="' + cx[i] + '" y="62" text-anchor="middle" font-size="11" fill="var(--txt)">' + nom + '</text></g>');
    });
    svg.push('</svg>');

    el.innerHTML =
      '<div class="mpi-sim-cab">La cerradura electrónica, en vivo · secuencia p1 → p0 → p0</div>' +
      svg.join('') +
      '<p class="fsm-leyenda">Botones de <strong>mantener pulsado</strong>: cada apretar/soltar es un ciclo de scan. Cualquier movimiento fuera de la secuencia vuelve a <strong>REPOSO</strong>.</p>' +
      '<div class="fsm-cuerpo">' +
        '<div class="fsm-izq">' +
          '<div class="fsm-controles">' +
            '<button type="button" class="fsm-p1">🔘 p1 · GPIO17<small>(mantén pulsado)</small></button>' +
            '<button type="button" class="fsm-p0">🔘 p0 · GPIO16<small>(mantén pulsado)</small></button>' +
            '<button type="button" class="fsm-reset">Reiniciar</button>' +
          '</div>' +
        '</div>' +
        '<div class="fsm-der">' +
          '<div class="fsm-escena"><span class="fsm-cerr">🔒</span></div>' +
          '<div class="fsm-salidas">' +
            '<span class="fsm-led" data-led="p1">p1 (GPIO17)</span>' +
            '<span class="fsm-led" data-led="p0">p0 (GPIO16)</span>' +
            '<span class="fsm-led" data-led="rele">GPIO20 · relé</span>' +
          '</div>' +
          '<div class="fsm-info nota"></div>' +
        '</div>' +
      '</div>';

    var info = el.querySelector('.fsm-info');

    function abierta() { return estado === 'SEC_OK'; }

    function pintar(msj) {
      el.querySelectorAll('.fsm-nodo').forEach(function (g) {
        g.classList.toggle('fsm-activo', g.getAttribute('data-estado') === estado);
      });
      el.querySelector('.fsm-cerr').textContent = abierta() ? '🔓' : '🔒';
      el.querySelector('[data-led="p1"]').classList.toggle('fsm-led-on', p1 === 1);
      el.querySelector('[data-led="p0"]').classList.toggle('fsm-led-on', p0 === 1);
      el.querySelector('[data-led="rele"]').classList.toggle('fsm-led-on', abierta());
      info.innerHTML = '<strong>' + estado + '</strong> — p1 = ' + p1 + ', p0 = ' + p0 +
        ' · relé GPIO20 = ' + (abierta() ? 1 : 0) + (msj ? '<br>' + msj : '');
    }

    function scan() {
      var reglas = DELTA[estado] || [];
      var destino = estado;
      for (var i = 0; i < reglas.length; i++) {
        if (reglas[i].p1 === p1 && reglas[i].p0 === p0) { destino = reglas[i].a; break; }
      }
      var ant = estado;
      var msj;
      if (destino === ant) {
        msj = 'δ: en <strong>' + ant + '</strong> con (p1=' + p1 + ', p0=' + p0 + ') no hay transición → se mantiene.';
      } else if (destino === 'SEC_OK') {
        msj = 'δ: <strong>' + ant + ' → SEC_OK</strong>. ¡Secuencia correcta! λ: GPIO20 = 1 mientras mantengas p0.';
      } else if (destino === 'REPOSO' && ant !== 'SEC_OK' && ant !== 'LIB_P0') {
        msj = 'δ: movimiento fuera de la secuencia → vuelta a <strong>REPOSO</strong>.';
      } else {
        msj = 'δ: <strong>' + ant + ' → ' + destino + '</strong>.';
      }
      estado = destino;
      pintar(msj);
    }

    // p1 / p0 como botones de mantener pulsado; cada flanco dispara un scan
    (function () {
      var b1 = el.querySelector('.fsm-p1'), b0 = el.querySelector('.fsm-p0');
      function bind(btn, setLevel) {
        var nivel = 0;
        function set(v) { nivel = v; setLevel(v); btn.classList.toggle('fsm-pulsado', v === 1); scan(); }
        btn.addEventListener('pointerdown', function (e) { e.preventDefault(); set(1); });
        btn.addEventListener('pointerup', function (e) { e.preventDefault(); if (nivel) set(0); });
        btn.addEventListener('pointerleave', function () { if (nivel) set(0); });
      }
      bind(b1, function (v) { p1 = v; });
      bind(b0, function (v) { p0 = v; });
    })();

    el.querySelector('.fsm-reset').addEventListener('click', function () {
      estado = 'REPOSO'; p1 = 0; p0 = 0;
      pintar('Reiniciado. Mantén pulsado y suelta: <strong>p1</strong>, luego <strong>p0</strong>, y por último <strong>p0</strong> (mantenlo para ver la cerradura abierta).');
    });

    pintar('Mantén pulsado y suelta: <strong>p1</strong>, luego <strong>p0</strong>, y por último <strong>p0</strong> (mantenlo para ver la cerradura abierta).');
  };
})();
