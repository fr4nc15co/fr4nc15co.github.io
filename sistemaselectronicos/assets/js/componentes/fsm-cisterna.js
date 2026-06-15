/*
 * Componente "fsm-cisterna": la cisterna automática del tema 8 (Moore), animada
 * con su diagrama de estados y una escena en vivo (estilo de la web de micro,
 * adaptado a la Raspberry Pi 4). Sensor en GPIO16 (1 = nadie, 0 = persona
 * delante) y electroválvula en GPIO20. Estados REPOSO / ESPERA / DESCARGA.
 *
 * Uso: <div class="mpi-mount" data-componente="fsm-cisterna" data-config='{}'></div>
 */
window.MPI = window.MPI || {};
MPI.componentes = MPI.componentes || {};

(function () {
  MPI.componentes['fsm-cisterna'] = function (el, cfg) {
    var estado = 'REPOSO';
    var sensor = 1;            // GPIO16: 1 = nadie, 0 = persona delante
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
            '<text x="185" y="44" font-size="10.5" fill="var(--txt-2)" text-anchor="middle">llega alguien (GPIO16 = 0)</text>' +
            '<line x1="285" y1="80" x2="232" y2="135" stroke="var(--txt-tenue)" stroke-width="1.5" marker-end="url(#flec)"/>' +
            '<text x="300" y="115" font-size="10.5" fill="var(--txt-2)">se retira (GPIO16 = 1)</text>' +
            '<line x1="155" y1="140" x2="92" y2="83" stroke="var(--txt-tenue)" stroke-width="1.5" marker-end="url(#flec)"/>' +
            '<text x="78" y="120" font-size="10.5" fill="var(--txt-2)" text-anchor="middle">1 ciclo de scan</text>' +
            '<g class="fsm-nodo" data-estado="REPOSO"><ellipse cx="70" cy="55" rx="48" ry="22" fill="var(--bg-3)" stroke="var(--borde)" stroke-width="2"/><text x="70" y="59" text-anchor="middle" font-size="12.5" fill="var(--txt)">REPOSO</text></g>' +
            '<g class="fsm-nodo" data-estado="ESPERA"><ellipse cx="300" cy="55" rx="48" ry="22" fill="var(--bg-3)" stroke="var(--borde)" stroke-width="2"/><text x="300" y="59" text-anchor="middle" font-size="12.5" fill="var(--txt)">ESPERA</text></g>' +
            '<g class="fsm-nodo" data-estado="DESCARGA"><ellipse cx="190" cy="155" rx="52" ry="22" fill="var(--bg-3)" stroke="var(--borde)" stroke-width="2"/><text x="190" y="159" text-anchor="middle" font-size="12.5" fill="var(--txt)">DESCARGA</text></g>' +
          '</svg>' +
          '<div class="fsm-controles">' +
            '<button type="button" class="fsm-persona"></button>' +
            '<button type="button" class="fsm-reset">Reiniciar</button>' +
          '</div>' +
        '</div>' +
        '<div class="fsm-der">' +
          '<div class="fsm-escena"><span class="fsm-wc">🚽</span><span class="fsm-agua"></span><span class="fsm-figura"></span></div>' +
          '<div class="fsm-salidas">' +
            '<span class="fsm-led" data-led="g16">GPIO16 · sensor (0 = persona)</span>' +
            '<span class="fsm-led" data-led="g20">GPIO20 · electroválvula</span>' +
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
        ? '🧍 Llega una persona (GPIO16 → 0)' : '🚶 La persona se retira (GPIO16 → 1)';
      el.querySelector('.fsm-figura').textContent = sensor === 0 ? '🧍' : '';
      el.querySelector('.fsm-agua').textContent = descargando ? '💦' : '';
      el.querySelector('[data-led="g16"]').classList.toggle('fsm-led-on', sensor === 0);
      el.querySelector('[data-led="g20"]').classList.toggle('fsm-led-on', descargando);
      info.innerHTML = '<strong>' + estado + '</strong> — sensor GPIO16 = ' + sensor +
        ' · electroválvula GPIO20 = ' + (descargando ? 1 : 0) + (msj ? '<br>' + msj : '');
    }

    el.querySelector('.fsm-persona').addEventListener('click', function () {
      if (descargando) return;
      if (sensor === 1) {                       // llega alguien
        sensor = 0;
        if (estado === 'REPOSO') { estado = 'ESPERA'; pintar('δ: <strong>REPOSO → ESPERA</strong> al detectar a la persona. Ahora hay que <em>recordar</em> que está ahí: esa es la memoria que un combinacional no tiene.'); }
        else pintar();
      } else {                                  // se retira
        sensor = 1;
        if (estado === 'ESPERA') {
          estado = 'DESCARGA'; descargando = true;
          pintar('δ: <strong>ESPERA → DESCARGA</strong>. λ (Moore): la salida solo depende del estado → GPIO20 = 1.');
          setTimeout(function () {
            estado = 'REPOSO'; descargando = false;
            pintar('Y de vuelta a <strong>REPOSO</strong>. En el programa real la descarga dura <em>un ciclo de scan</em>; aquí la alargamos para que se vea.');
          }, 1600);
        } else pintar();
      }
    });
    el.querySelector('.fsm-reset').addEventListener('click', function () {
      estado = 'REPOSO'; sensor = 1; descargando = false;
      pintar('Reiniciado. Haz que llegue alguien y luego que se retire: la descarga salta <em>al irse</em>, no al llegar.');
    });
    pintar('Haz que llegue alguien y luego que se retire: la descarga salta <em>al irse</em>, no al llegar.');
  };
})();
