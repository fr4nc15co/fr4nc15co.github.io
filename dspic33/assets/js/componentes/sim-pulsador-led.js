/*
 * Componente "sim-pulsador-led": repaso de cómo se conecta un pulsador o un
 * LED a un pin digital del dsPIC. Dos modos (data-config):
 *
 *  - modo "pulsador": el pulsador se puede montar con una resistencia de
 *    pull-up (a +3,3 V) o de pull-down (a masa). En la PicTrainer, SW2 lleva
 *    pull-up de 10 kΩ -> reposo = 1, pulsado = 0 ("activo a nivel bajo").
 *    Mantén pulsado el botón y observa el nivel que se lee en RB2.
 *
 *  - modo "led": el LED se puede montar activo a nivel alto o a nivel bajo.
 *    En la PicTrainer, D9 (y D6-D8) llevan el ánodo a +3,3 V a través de una
 *    resistencia de 270 Ω y el cátodo al pin: el pin hace de sumidero de
 *    corriente y el LED luce con un 0 ("activo a nivel bajo"). Cambia el bit
 *    de RB12 y mira cuándo luce.
 *
 * El código mostrado usa máscaras sobre PORTB, igual que el resto del tema
 * (RB2 = 0x0004 para SW2, RB12 = 0x1000 para D9).
 *
 * Uso:
 *   <div class="mpi-mount" data-componente="sim-pulsador-led" data-config='{"modo":"pulsador"}'></div>
 *   <div class="mpi-mount" data-componente="sim-pulsador-led" data-config='{"modo":"led"}'></div>
 */
window.MPI = window.MPI || {};
MPI.componentes = MPI.componentes || {};

(function () {
  function pintarCodigo(el, sel, texto) {
    var code = el.querySelector(sel);
    code.textContent = texto;
    code.removeAttribute('data-resaltado');
    if (MPI.resaltarTodo) MPI.resaltarTodo(el);
  }

  // ------------------------------------------------------------------
  // Piezas de esquema SVG reutilizables (mismas convenciones visuales que
  // pictrainer-board.js: resistencia como caja, símbolo de masa de 3 barras).
  // ------------------------------------------------------------------
  function raizVcc(x1, x2, y) {
    return '<line x1="' + x1 + '" y1="' + y + '" x2="' + x2 + '" y2="' + y + '" stroke="var(--rojo)" stroke-width="2"/>' +
      '<text x="' + x1 + '" y="' + (y - 7) + '" font-size="11" fill="var(--rojo)" text-anchor="start">+3,3 V</text>';
  }
  function masa(x, y) {
    return '<line x1="' + x + '" y1="' + y + '" x2="' + x + '" y2="' + (y + 8) + '" stroke="var(--txt-2)" stroke-width="2"/>' +
      '<line x1="' + (x - 9) + '" y1="' + (y + 8) + '" x2="' + (x + 9) + '" y2="' + (y + 8) + '" stroke="var(--txt-tenue)" stroke-width="2"/>' +
      '<line x1="' + (x - 5) + '" y1="' + (y + 13) + '" x2="' + (x + 5) + '" y2="' + (y + 13) + '" stroke="var(--txt-tenue)" stroke-width="1.6"/>' +
      '<line x1="' + (x - 2) + '" y1="' + (y + 17) + '" x2="' + (x + 2) + '" y2="' + (y + 17) + '" stroke="var(--txt-tenue)" stroke-width="1.3"/>';
  }
  function hilo(x1, y1, x2, y2, color) {
    return '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '" stroke="' + (color || 'var(--txt-2)') + '" stroke-width="2"/>';
  }
  function resistencia(x, y, h, etq, cls) {
    return '<rect class="' + (cls || '') + '" x="' + (x - 10) + '" y="' + y + '" width="20" height="' + h + '" rx="3" ' +
      'fill="var(--bg-3)" stroke="var(--acento-2)" stroke-width="1.8"/>' +
      '<text x="' + (x + 22) + '" y="' + (y + h / 2 + 4) + '" font-size="11" fill="var(--acento-2)" text-anchor="start">' + etq + '</text>';
  }
  function nodoPin(x, y, etq) {
    return '<circle cx="' + x + '" cy="' + y + '" r="4" fill="var(--amarillo)"/>' +
      '<text x="' + (x + 10) + '" y="' + (y + 4) + '" font-size="11" fill="var(--amarillo)" text-anchor="start">' + etq + '</text>';
  }
  // Condensador en paralelo (rama vertical a la derecha, dos placas horizontales).
  function condensadorParalelo(x, y1, y2, etqArriba, etqAbajo) {
    var ymid = (y1 + y2) / 2, hueco = 5;
    return hilo(x, y1, x, ymid - hueco, 'var(--verde)') +
      '<line x1="' + (x - 9) + '" y1="' + (ymid - hueco) + '" x2="' + (x + 9) + '" y2="' + (ymid - hueco) + '" stroke="var(--verde)" stroke-width="2"/>' +
      '<line x1="' + (x - 9) + '" y1="' + (ymid + hueco) + '" x2="' + (x + 9) + '" y2="' + (ymid + hueco) + '" stroke="var(--verde)" stroke-width="2"/>' +
      hilo(x, ymid + hueco, x, y2, 'var(--verde)') +
      '<text x="' + (x + 13) + '" y="' + (ymid - 1) + '" font-size="10" fill="var(--verde)" text-anchor="start">' + etqArriba + '</text>' +
      '<text x="' + (x + 13) + '" y="' + (ymid + 11) + '" font-size="10" fill="var(--verde)" text-anchor="start">' + etqAbajo + '</text>';
  }

  function esquemaPulsador(montaje) {
    // Nodo del pin a media altura; pull-up: R arriba (Vcc->nodo), switch abajo
    // (nodo->masa). Pull-down: switch arriba (Vcc->nodo), R abajo (nodo->masa).
    var yTop = 18, yNodo = 95, yBot = 172;
    var s = '<svg viewBox="0 0 230 190" class="spl-svg" aria-hidden="true">';
    s += raizVcc(30, 90, yTop);
    s += masa(60, yBot);
    s += hilo(60, yTop, 60, yBot, 'var(--borde)'); // guía vertical tenue de fondo
    if (montaje === 'pullup') {
      s += hilo(60, yTop, 60, 45);
      s += resistencia(60, 45, 30, '10 kΩ', 'spl-r');
      s += hilo(60, 75, 60, yNodo);
      s += '<g class="spl-sw">' +
             hilo(60, yNodo, 60, 130) +
             '<circle class="spl-sw-dot" cx="60" cy="130" r="3" fill="var(--txt-2)"/>' +
             '<line class="spl-sw-brazo" x1="60" y1="130" x2="80" y2="152" stroke="var(--txt-2)" stroke-width="2"/>' +
           '</g>';
      s += hilo(60, 152, 60, yBot);
      // C13: condensador de 100 nF en paralelo con el pulsador (antirrebote parcial)
      s += hilo(60, yBot, 100, yBot, 'var(--verde)');
      s += condensadorParalelo(100, yNodo, yBot, 'C13', '100 nF');
    } else {
      s += '<g class="spl-sw">' +
             hilo(60, yTop, 60, 38) +
             '<circle class="spl-sw-dot" cx="60" cy="38" r="3" fill="var(--txt-2)"/>' +
             '<line class="spl-sw-brazo" x1="60" y1="38" x2="80" y2="60" stroke="var(--txt-2)" stroke-width="2"/>' +
           '</g>';
      s += hilo(60, 60, 60, yNodo);
      s += hilo(60, yNodo, 60, 142);
      s += resistencia(60, 142, 30, '10 kΩ', 'spl-r');
      s += hilo(60, 172, 60, yBot);
      // El condensador antirrebote va en paralelo con el pulsador en cualquier montaje
      s += hilo(60, yTop, 100, yTop, 'var(--verde)');
      s += condensadorParalelo(100, yTop, yNodo, 'C13', '100 nF');
    }
    s += hilo(60, yNodo, 130, yNodo);
    s += nodoPin(130, yNodo, 'RB2');
    s += '</svg>';
    return s;
  }

  function esquemaLed(montaje) {
    // Importante: RB12 NUNCA se dibuja unido por un hilo a +3,3 V ni a masa a
    // la vez (sería un cortocircuito). Cada montaje traza una única cadena en
    // serie entre un extremo fijo (el raíl o masa) y el pin, sin más uniones.
    var s = '<svg viewBox="0 0 200 190" class="spl-svg" aria-hidden="true">';
    if (montaje === 'bajo') {
      // +3,3 V -> R (270) -> LED -> RB12 (el pin absorbe la corriente; no hay
      // ningún hilo de RB12 a masa: el "retorno" es interno, por el pin).
      s += raizVcc(30, 90, 18);
      s += hilo(60, 18, 60, 45);
      s += resistencia(60, 45, 28, '270 Ω', 'spl-r');
      s += hilo(60, 73, 60, 95);
      s += '<g class="spl-led">' +
             '<circle cx="60" cy="110" r="13" fill="var(--bg-3)" stroke="var(--naranja)" stroke-width="2" class="spl-led-dibujo"/>' +
           '</g>';
      s += hilo(60, 123, 60, 140);
      s += hilo(60, 140, 130, 140);
      s += nodoPin(130, 140, 'RB12');
    } else {
      // RB12 (el pin entrega la corriente) -> LED -> R (270) -> masa. No hay
      // ningún hilo de RB12 al raíl de +3,3 V: el pin hace de fuente él solo.
      s += masa(60, 172);
      s += nodoPin(130, 18, 'RB12');
      s += hilo(60, 18, 130, 18);
      s += hilo(60, 18, 60, 40);
      s += '<g class="spl-led">' +
             '<circle cx="60" cy="55" r="13" fill="var(--bg-3)" stroke="var(--naranja)" stroke-width="2" class="spl-led-dibujo"/>' +
           '</g>';
      s += hilo(60, 68, 60, 90);
      s += resistencia(60, 90, 28, '270 Ω', 'spl-r');
      s += hilo(60, 118, 60, 172);
    }
    s += '</svg>';
    return s;
  }

  // ------------------------------------------------------------------
  function montarPulsador(el) {
    var montaje = 'pullup';   // SW2 en la PicTrainer: pull-up -> pulsado = 0
    var pulsado = false;

    el.innerHTML =
      '<div class="mpi-sim-cab">Pruébalo: ¿qué nivel se lee en RB2?</div>' +
      '<div class="spl-cuerpo">' +
        '<div class="spl-esquema"></div>' +
        '<div class="spl-panel">' +
          '<div class="spl-radios">' +
            '<label><input type="radio" name="spl-m-pul" value="pullup" checked> Pull-up (como SW2 en la PicTrainer)</label>' +
            '<label><input type="radio" name="spl-m-pul" value="pulldown"> Pull-down</label>' +
          '</div>' +
          '<button type="button" class="spl-boton">SW2<small>(mantén pulsado)</small></button>' +
          '<div class="spl-lectura"><span class="spl-bit">1</span><small>nivel en RB2</small></div>' +
          '<div class="spl-estado"></div>' +
        '</div>' +
      '</div>' +
      '<pre class="spl-codigo"><code class="lang-c"></code></pre>';

    function pintar() {
      el.querySelector('.spl-esquema').innerHTML = esquemaPulsador(montaje);
      var nivel = (montaje === 'pullup') ? (pulsado ? 0 : 1) : (pulsado ? 1 : 0);
      var bitEl = el.querySelector('.spl-bit');
      bitEl.textContent = nivel;
      bitEl.classList.toggle('spl-bit-uno', nivel === 1);
      el.querySelector('.spl-boton').classList.toggle('spl-apretado', pulsado);
      el.querySelector('.spl-esquema .spl-sw').classList.toggle('spl-sw-cerrado', pulsado);
      el.querySelector('.spl-estado').innerHTML =
        'SW2 <strong>' + (pulsado ? 'pulsado' : 'suelto') + '</strong> → en RB2 hay un <code>' + nivel + '</code>' +
        '<br><small>' + (montaje === 'pullup'
          ? 'pull-up: reposo a 1 (la resistencia tira del pin hacia +3,3 V), pulsado a 0 (el pulsador lo cortocircuita a masa) — «activo a nivel bajo»'
          : 'pull-down: reposo a 0, pulsado a 1 — «activo a nivel alto» (así NO está montado SW2 en la PicTrainer)') + '</small>' +
        '<br><small>' + (montaje === 'pullup'
          ? 'SW2 lleva además <strong>C13 (100 nF)</strong> en paralelo: al soltar, el pin no sube a 1 de golpe, sino que se carga poco a poco por la resistencia de pull-up (filtro RC), lo que suaviza los rebotes del contacto.'
          : 'con pull-down, el mismo condensador se cargaría poco a poco a través de la resistencia al <em>soltar</em> el pulsador (filtro RC): el antirrebote funciona igual, solo cambia qué transición se suaviza.') + '</small>';
      pintarCodigo(el, '.spl-codigo code',
        (montaje === 'pullup'
          ? 'if ((PORTB & 0x0004) == 0) {\n    /* SW2 pulsado */\n}'
          : 'if ((PORTB & 0x0004) != 0) {\n    /* SW2 pulsado, si estuviera en pull-down */\n}') +
        '   // nivel leído = ' + nivel);
    }

    var btn;
    function aprieta(e) { if (e) e.preventDefault(); pulsado = true; pintar(); }
    function suelta() { if (pulsado) { pulsado = false; pintar(); } }

    function engancha() {
      btn = el.querySelector('.spl-boton');
      btn.addEventListener('pointerdown', aprieta);
      btn.addEventListener('pointerup', suelta);
      btn.addEventListener('pointerleave', suelta);
      btn.addEventListener('keydown', function (e) { if (e.key === ' ' || e.key === 'Enter') aprieta(e); });
      btn.addEventListener('keyup', function (e) { if (e.key === ' ' || e.key === 'Enter') suelta(); });
    }

    el.querySelectorAll('input[name="spl-m-pul"]').forEach(function (r) {
      r.addEventListener('change', function () { montaje = this.value; pulsado = false; pintar(); });
    });
    engancha();
    pintar();
  }

  function montarLed(el) {
    var montaje = 'bajo';   // D6-D9 en la PicTrainer: activos a nivel bajo
    var bit = 1;            // valor escrito en RB12 (1 = apagado en el montaje real)

    el.innerHTML =
      '<div class="mpi-sim-cab">Pruébalo: ¿cuándo luce D9?</div>' +
      '<div class="spl-cuerpo">' +
        '<div class="spl-esquema"></div>' +
        '<div class="spl-panel">' +
          '<div class="spl-radios">' +
            '<label><input type="radio" name="spl-m-led" value="bajo" checked> Activo a nivel BAJO (como D9 en la PicTrainer)</label>' +
            '<label><input type="radio" name="spl-m-led" value="alto"> Activo a nivel ALTO</label>' +
          '</div>' +
          '<button type="button" class="spl-interruptor" aria-label="Conmutar el bit de RB12">' +
            '<span class="spl-int-tit">RB12</span><span class="spl-int-val">1</span>' +
            '<span class="spl-int-pista">clic para conmutar</span>' +
          '</button>' +
          '<div class="spl-estado"></div>' +
        '</div>' +
      '</div>' +
      '<pre class="spl-codigo"><code class="lang-c"></code></pre>';

    function pintar() {
      el.querySelector('.spl-esquema').innerHTML = esquemaLed(montaje);
      var encendido = (montaje === 'bajo') ? bit === 0 : bit === 1;
      el.querySelector('.spl-int-val').textContent = bit;
      var dibujo = el.querySelector('.spl-led-dibujo');
      if (dibujo) dibujo.classList.toggle('spl-on', encendido);
      el.querySelector('.spl-estado').innerHTML =
        '<code>RB12 = ' + bit + '</code> → D9 <strong>' + (encendido ? 'ENCENDIDO' : 'apagado') + '</strong>' +
        '<br><small>' + (montaje === 'bajo'
          ? 'activo a nivel bajo: el ánodo va a +3,3 V por 270 Ω y el cátodo al pin, que absorbe corriente; luce con 0'
          : 'activo a nivel alto: el pin alimenta el LED y la resistencia va a masa; luce con 1 (así NO están montados D6-D9)') + '</small>';
      pintarCodigo(el, '.spl-codigo code',
        montaje === 'bajo'
          ? (bit === 0 ? 'PORTB &= ~0x1000;   // enciende D9' : 'PORTB |= 0x1000;    // apaga D9')
          : (bit === 1 ? 'PORTB |= 0x1000;    // encendería D9, si estuviera activo a nivel alto' : 'PORTB &= ~0x1000;   // lo apagaría'));
    }

    el.querySelector('.spl-interruptor').addEventListener('click', function () {
      bit = 1 - bit; pintar();
    });
    el.querySelectorAll('input[name="spl-m-led"]').forEach(function (r) {
      r.addEventListener('change', function () { montaje = this.value; pintar(); });
    });
    pintar();
  }

  MPI.componentes['sim-pulsador-led'] = function (el, cfg) {
    el.classList.add('mpi-sim-pulsador-led');
    if (cfg && cfg.modo === 'led') montarLed(el);
    else montarPulsador(el);
  };
})();
