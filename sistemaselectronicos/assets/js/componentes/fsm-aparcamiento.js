/*
 * Componente "fsm-aparcamiento": el control del aparcamiento de 4 plazas del
 * tema 8 (flancos como entrada), animado con su diagrama de estados y las plazas
 * en vivo. Adaptado a la Raspberry Pi 4: sensor de entrada en GPIO16 y de salida
 * en GPIO17 (1 al pasar un coche), semáforo rojo en GPIO20 y verde en GPIO21.
 * Estados VACIO / UNO / DOS / TRES / CUATRO (= nº de coches).
 *
 * Uso: <div class="mpi-mount" data-componente="fsm-aparcamiento" data-config='{}'></div>
 */
window.MPI = window.MPI || {};
MPI.componentes = MPI.componentes || {};

(function () {
  MPI.componentes['fsm-aparcamiento'] = function (el, cfg) {
    var ESTADOS = ['VACIO', 'UNO', 'DOS', 'TRES', 'CUATRO'];
    var n = 0;   // número de coches = índice del estado

    el.classList.add('mpi-fsm');
    var svg = ['<svg viewBox="0 0 650 120" class="fsm-svg" aria-label="Diagrama de estados del aparcamiento">'];
    svg.push('<defs><marker id="flep" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto">' +
             '<path d="M0 0 L9 4.5 L0 9 Z" fill="var(--txt-tenue,#6a737d)"/></marker></defs>');
    for (var i = 0; i < 4; i++) {
      var a = 64 + i * 128, b = 64 + (i + 1) * 128;
      svg.push('<line x1="' + (a + 46) + '" y1="52" x2="' + (b - 48) + '" y2="52" stroke="var(--txt-tenue)" stroke-width="1.5" marker-end="url(#flep)"/>');
      svg.push('<line x1="' + (b - 46) + '" y1="68" x2="' + (a + 48) + '" y2="68" stroke="var(--txt-tenue)" stroke-width="1.5" marker-end="url(#flep)"/>');
    }
    ESTADOS.forEach(function (nom, i) {
      var x = 64 + i * 128;
      svg.push('<g class="fsm-nodo" data-estado="' + nom + '">' +
        '<ellipse cx="' + x + '" cy="60" rx="46" ry="22" fill="var(--bg-3)" stroke="var(--borde)" stroke-width="2"/>' +
        '<text x="' + x + '" y="64" text-anchor="middle" font-size="12.5" fill="var(--txt)">' + nom + '</text></g>');
    });
    svg.push('</svg>');

    el.innerHTML =
      '<div class="mpi-sim-cab">El aparcamiento, en vivo</div>' +
      svg.join('') +
      '<p class="fsm-leyenda">fila superior → flanco del sensor de <strong>entrada</strong> (GPIO16) · fila inferior ← flanco del de <strong>salida</strong> (GPIO17)</p>' +
      '<div class="fsm-cuerpo">' +
        '<div class="fsm-izq">' +
          '<div class="fsm-controles">' +
            '<button type="button" class="fsm-entra">🚗 Pasa por la ENTRADA (GPIO16)</button>' +
            '<button type="button" class="fsm-sale">🚙 Pasa por la SALIDA (GPIO17)</button>' +
            '<button type="button" class="fsm-reset">Vaciar</button>' +
          '</div>' +
        '</div>' +
        '<div class="fsm-der">' +
          '<div class="fsm-plazas"></div>' +
          '<div class="fsm-salidas">' +
            '<span class="fsm-led fsm-led-verde" data-led="verde">GPIO21 · verde</span>' +
            '<span class="fsm-led fsm-led-roja" data-led="rojo">GPIO20 · roja</span>' +
          '</div>' +
          '<div class="fsm-info nota"></div>' +
        '</div>' +
      '</div>';

    var info = el.querySelector('.fsm-info');

    function pintar(msj) {
      el.querySelectorAll('.fsm-nodo').forEach(function (g) {
        g.classList.toggle('fsm-activo', g.getAttribute('data-estado') === ESTADOS[n]);
      });
      var plazas = '';
      for (var i = 0; i < 4; i++) {
        plazas += '<span class="fsm-plaza">' + (i < n ? '🚗' : '') + '</span>';
      }
      el.querySelector('.fsm-plazas').innerHTML = plazas;
      el.querySelector('[data-led="verde"]').classList.toggle('fsm-led-on', n < 4);
      el.querySelector('[data-led="rojo"]').classList.toggle('fsm-led-on', n === 4);
      info.innerHTML = '<strong>' + ESTADOS[n] + '</strong> (' + n + ' coches) — semáforo ' +
        (n < 4 ? 'VERDE' : 'ROJO') + (msj ? '<br>' + msj : '');
    }

    el.querySelector('.fsm-entra').addEventListener('click', function () {
      if (n < 4) { n++; pintar('Flanco en el sensor de entrada: <strong>' + ESTADOS[n - 1] + ' → ' + ESTADOS[n] + '</strong>.' + (n === 4 ? ' Cuarta plaza ocupada: el semáforo pasa a <strong>rojo</strong>.' : '')); }
      else pintar('Estado <strong>CUATRO</strong> y entra otro flanco: la máquina <em>no cambia</em> — quien se salte el rojo no tendrá sitio, y no procede contarlo.');
    });
    el.querySelector('.fsm-sale').addEventListener('click', function () {
      if (n > 0) { n--; pintar('Flanco en el sensor de salida: <strong>' + ESTADOS[n + 1] + ' → ' + ESTADOS[n] + '</strong>.' + (n === 3 ? ' Vuelve el <strong>verde</strong>.' : '')); }
      else pintar('Aparcamiento <strong>vacío</strong>: el flanco de salida no cambia nada (no hay coches que restar).');
    });
    el.querySelector('.fsm-reset').addEventListener('click', function () {
      n = 0; pintar('Vaciado. Mete y saca coches; fíjate en qué pasa al llegar al cuarto… y al intentar meter el quinto.');
    });
    pintar('Mete y saca coches; fíjate en qué pasa al llegar al cuarto… y al intentar meter el quinto.');
  };
})();
