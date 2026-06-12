/*
 * Componentes "fsm-cisterna" y "fsm-aparcamiento": las otras dos máquinas de
 * estados del tema 11, animadas como la puerta de garaje. Reutilizan las
 * clases CSS .fsm-* de fsm-garaje.js.
 *
 * Uso:
 *   <div class="mpi-mount" data-componente="fsm-cisterna" data-config='{}'></div>
 *   <div class="mpi-mount" data-componente="fsm-aparcamiento" data-config='{}'></div>
 */
window.MPI = window.MPI || {};
MPI.componentes = MPI.componentes || {};

(function () {

  /* ============================== CISTERNA (11.6) ======================= */
  MPI.componentes['fsm-cisterna'] = function (el, cfg) {
    var estado = 'Reposo';
    var sensor = 1;            // RC4: 1 = nadie, 0 = persona delante
    var descargando = false;

    el.classList.add('mpi-fsm');
    el.innerHTML =
      '<div class="mpi-sim-cab">La cisterna automática, en vivo</div>' +
      '<div class="fsm-cuerpo">' +
        '<div class="fsm-izq">' +
          '<svg viewBox="0 0 430 200" class="fsm-svg" aria-label="Diagrama de estados de la cisterna">' +
            '<defs><marker id="flec" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto">' +
              '<path d="M0 0 L9 4.5 L0 9 Z" fill="var(--txt-tenue,#6a737d)"/></marker></defs>' +
            '<line x1="118" y1="55" x2="252" y2="55" stroke="var(--txt-tenue)" stroke-width="1.5" marker-end="url(#flec)"/>' +
            '<text x="185" y="44" font-size="10.5" fill="var(--txt-2)" text-anchor="middle">llega alguien (RC4 = 0)</text>' +
            '<line x1="285" y1="80" x2="232" y2="135" stroke="var(--txt-tenue)" stroke-width="1.5" marker-end="url(#flec)"/>' +
            '<text x="298" y="115" font-size="10.5" fill="var(--txt-2)">se retira (RC4 = 1)</text>' +
            '<line x1="155" y1="140" x2="92" y2="83" stroke="var(--txt-tenue)" stroke-width="1.5" marker-end="url(#flec)"/>' +
            '<text x="78" y="120" font-size="10.5" fill="var(--txt-2)" text-anchor="middle">1 ciclo de scan</text>' +
            '<g class="fsm-nodo" data-estado="Reposo"><ellipse cx="70" cy="55" rx="48" ry="22" fill="var(--bg-3)" stroke="var(--borde)" stroke-width="2"/><text x="70" y="59" text-anchor="middle" font-size="12.5" fill="var(--txt)">Reposo</text></g>' +
            '<g class="fsm-nodo" data-estado="Espera"><ellipse cx="300" cy="55" rx="48" ry="22" fill="var(--bg-3)" stroke="var(--borde)" stroke-width="2"/><text x="300" y="59" text-anchor="middle" font-size="12.5" fill="var(--txt)">Espera</text></g>' +
            '<g class="fsm-nodo" data-estado="Descarga"><ellipse cx="190" cy="155" rx="48" ry="22" fill="var(--bg-3)" stroke="var(--borde)" stroke-width="2"/><text x="190" y="159" text-anchor="middle" font-size="12.5" fill="var(--txt)">Descarga</text></g>' +
          '</svg>' +
          '<div class="fsm-controles">' +
            '<button type="button" class="fsm-persona"></button>' +
            '<button type="button" class="fsm-reset">Reiniciar</button>' +
          '</div>' +
        '</div>' +
        '<div class="fsm-der">' +
          '<div class="fsm-escena"><span class="fsm-wc">🚽</span><span class="fsm-agua"></span><span class="fsm-figura"></span></div>' +
          '<div class="fsm-salidas">' +
            '<span class="fsm-led" data-led="rc4">RC4 · sensor (0 = persona)</span>' +
            '<span class="fsm-led" data-led="rc5">RC5 · electroválvula</span>' +
          '</div>' +
          '<div class="fsm-info nota"></div>' +
        '</div>' +
      '</div>';

    var info = el.querySelector('.fsm-info');

    function pintar(msj) {
      el.querySelectorAll('.fsm-nodo').forEach(function (g) {
        g.classList.toggle('fsm-activo', g.getAttribute('data-estado') === estado);
      });
      el.querySelector('.fsm-persona').innerHTML = sensor === 1
        ? '🧍 Llega una persona (RC4 → 0)' : '🚶 La persona se retira (RC4 → 1)';
      el.querySelector('.fsm-figura').textContent = sensor === 0 ? '🧍' : '';
      el.querySelector('.fsm-agua').textContent = descargando ? '💦' : '';
      el.querySelector('[data-led="rc4"]').classList.toggle('fsm-led-on', sensor === 0);
      el.querySelector('[data-led="rc5"]').classList.toggle('fsm-led-on', descargando);
      info.innerHTML = '<strong>' + estado + '</strong> — sensor RC4 = ' + sensor +
        ' · electroválvula RC5 = ' + (descargando ? 1 : 0) + (msj ? '<br>' + msj : '');
    }

    el.querySelector('.fsm-persona').addEventListener('click', function () {
      if (descargando) return;
      if (sensor === 1) {                       // llega alguien
        sensor = 0;
        if (estado === 'Reposo') { estado = 'Espera'; pintar('δ: <strong>Reposo → Espera</strong> al detectar a la persona. Ahora hay que <em>recordar</em> que está ahí: esa es la memoria que un combinacional no tiene.'); }
        else pintar();
      } else {                                  // se retira
        sensor = 1;
        if (estado === 'Espera') {
          estado = 'Descarga'; descargando = true;
          pintar('δ: <strong>Espera → Descarga</strong>. λ (Moore): la salida solo depende del estado → RC5 = 1.');
          setTimeout(function () {
            estado = 'Reposo'; descargando = false;
            pintar('Y de vuelta a <strong>Reposo</strong>. En el programa real la descarga dura <em>un ciclo de scan</em>; aquí la alargamos para que se vea.');
          }, 1600);
        } else pintar();
      }
    });
    el.querySelector('.fsm-reset').addEventListener('click', function () {
      estado = 'Reposo'; sensor = 1; descargando = false;
      pintar('Reiniciado. Haz que llegue alguien y luego que se retire: la descarga salta <em>al irse</em>, no al llegar.');
    });
    pintar('Haz que llegue alguien y luego que se retire: la descarga salta <em>al irse</em>, no al llegar.');
  };

  /* ============================ APARCAMIENTO (11.8) ===================== */
  MPI.componentes['fsm-aparcamiento'] = function (el, cfg) {
    var ESTADOS = ['Vacio', 'Uno', 'Dos', 'Tres', 'Cuatro'];
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
      '<p class="fsm-leyenda">fila superior → flanco del sensor de <strong>entrada</strong> · fila inferior ← flanco del de <strong>salida</strong></p>' +
      '<div class="fsm-cuerpo">' +
        '<div class="fsm-izq">' +
          '<div class="fsm-controles">' +
            '<button type="button" class="fsm-entra">🚗 Pasa por la ENTRADA (RC4)</button>' +
            '<button type="button" class="fsm-sale">🚙 Pasa por la SALIDA (RC5)</button>' +
            '<button type="button" class="fsm-reset">Vaciar</button>' +
          '</div>' +
        '</div>' +
        '<div class="fsm-der">' +
          '<div class="fsm-plazas"></div>' +
          '<div class="fsm-salidas">' +
            '<span class="fsm-led fsm-led-verde" data-led="verde">RC7 · verde</span>' +
            '<span class="fsm-led fsm-led-roja" data-led="rojo">RC6 · roja</span>' +
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
      else pintar('Estado <strong>Cuatro</strong> y entra otro flanco: la máquina <em>no cambia</em> — quien se salte el rojo no tendrá sitio, y no procede contarlo.');
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
