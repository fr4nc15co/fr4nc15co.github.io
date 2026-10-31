/*
 * Componente "tabla-bit-pin": Tabla 4 del tema de puertos paralelo, interactiva.
 * Relaciona cada bit de PORTB/TRISB (15..0) y PORTA/TRISA (4..0) del
 * dsPIC33FJ32MC202 (encapsulado de 28 pines) con su pin físico, el nombre
 * completo del pin y su uso en la tarjeta PicTrainer. Funciona en los dos
 * sentidos: bit → pin (rejilla) y pin → bit (campo numérico y dibujo del chip).
 * Modo «pregúntame»: pide el pin físico de un RBx al azar y corrige.
 *
 * Uso en el contenido:
 *   <div class="mpi-mount" data-componente="tabla-bit-pin"
 *        data-config='{"pinesB":[4,5,6,7,11,14,15,16,17,18,21,22,23,24,25,26],
 *                      "pinesA":[2,3,9,10,12],"resaltar":["RB2","RB12"]}'></div>
 *
 * Claves de data-config (todas opcionales):
 *   pinesB   : 16 números de pin para RB0..RB15 (por defecto, Tabla 4).
 *   pinesA   : 5 números de pin para RA0..RA4 (por defecto, Tabla 4).
 *   resaltar : nombres de líneas a resaltar, p. ej. ["RB2","RB12"].
 *   pregunta : false para ocultar el modo «pregúntame» (por defecto se muestra).
 */
window.MPI = window.MPI || {};
MPI.componentes = MPI.componentes || {};

(function () {
  // Datos de la Tabla 4 (spec puertos-paralelo, verificada con el datasheet).
  var PINES_B = [4, 5, 6, 7, 11, 14, 15, 16, 17, 18, 21, 22, 23, 24, 25, 26];
  var PINES_A = [2, 3, 9, 10, 12];
  var FUNC_B = [
    'AN2, RP0, PGED1', 'AN3, RP1, PGEC1', 'AN4, RP2', 'AN5, RP3',
    'RP4, SOSCI', 'RP5, PGED3', 'RP6, PGEC3', 'RP7, INT0',
    'RP8, PWM2H1', 'RP9, PWM2L1', 'RP10, PWM1H3, PGED2', 'RP11, PWM1L3, PGEC2',
    'RP12, PWM1H2', 'RP13, PWM1L2', 'RP14, PWM1H1', 'RP15, PWM1L1'
  ];
  var FUNC_A = ['AN0', 'AN1', 'OSC1', 'OSC2', 'SOSCO, T1CK'];
  // Asignación verificada en el esquemático de la PicTrainer (figura 126):
  // D6 = RB15, D7 = RB14, D8 = RB13, D9 = RB12 (todos activos a nivel bajo).
  var USO_B = {
    0: 'PGED1 (datos) del conector de programación P4',
    1: 'PGEC1 (reloj) del conector de programación P4',
    2: 'Pulsador SW2 (pull-up: suelto = 1, pulsado = 0; jumper JP1)',
    3: 'Potenciómetro RV1 (entrada analógica AN5; jumper JP2)',
    4: 'U1TX de la UART (va a la vez al USB y al conector Arduino P8-2)',
    5: 'U1RX de la UART (llega del USB o de P8-1 según el selector K2)',
    12: 'LED D9 (activo a nivel bajo: 0 = encendido; jumper JP3)',
    13: 'LED D8 (activo a nivel bajo: 0 = encendido; jumper JP3)',
    14: 'LED D7 (activo a nivel bajo: 0 = encendido; jumper JP3)',
    15: 'LED D6 (activo a nivel bajo: 0 = encendido; jumper JP3)'
  };
  // Pines que no pertenecen a ningún puerto (28 pines SPDIP/SOIC).
  var NO_PUERTO = {
    1: 'MCLR (reset, activo a nivel bajo)',
    8: 'VSS (masa)',
    13: 'VDD (alimentación)',
    19: 'VSS (masa)',
    20: 'VCAP (condensador del regulador interno)',
    27: 'AVSS (masa analógica)',
    28: 'AVDD (alimentación analógica)'
  };

  function hex4(v) {
    var s = (v >>> 0).toString(16).toUpperCase();
    while (s.length < 4) s = '0' + s;
    return '0x' + s;
  }

  function listaValida(lista, n) {
    if (!lista || lista.length !== n) return null;
    for (var i = 0; i < n; i++) {
      var p = parseInt(lista[i], 10);
      if (isNaN(p) || p < 1 || p > 28) return null;
    }
    return lista.map(function (p) { return parseInt(p, 10); });
  }

  var contador = 0;

  MPI.componentes['tabla-bit-pin'] = function (el, cfg) {
    cfg = cfg || {};
    var uid = 'tbp' + (++contador);
    var pinesB = listaValida(cfg.pinesB, 16) || PINES_B;
    var pinesA = listaValida(cfg.pinesA, 5) || PINES_A;
    var resaltar = (cfg.resaltar || []).map(function (s) { return String(s).toUpperCase(); });
    var conPregunta = cfg.pregunta !== false;

    // Líneas: {id:'RB12', puerto:'B', bit:12, pin:23, func:'…', uso:'…'}
    var lineas = [];
    var porPin = {};
    var i;
    for (i = 0; i < 16; i++) {
      lineas.push({ id: 'RB' + i, puerto: 'B', bit: i, pin: pinesB[i], func: FUNC_B[i], uso: USO_B[i] || '' });
    }
    for (i = 0; i < 5; i++) {
      lineas.push({ id: 'RA' + i, puerto: 'A', bit: i, pin: pinesA[i], func: FUNC_A[i], uso: '' });
    }
    var porId = {};
    lineas.forEach(function (l) { porId[l.id] = l; porPin[l.pin] = l; });

    function nombreCompleto(l) {
      return l.id + ' / ' + l.func.split(', ').join(' / ');
    }

    // ---------- Maquetación ----------
    function celdaBit(l) {
      var res = resaltar.indexOf(l.id) !== -1;
      return '<button type="button" class="tbp-bit' + (res ? ' tbp-res' : '') + '" data-id="' + l.id + '"' +
        ' aria-label="Bit ' + l.bit + ' de PORT' + l.puerto + ' (' + l.id + '), pin ' + l.pin + '">' +
        '<span class="tbp-bn">' + l.bit + '</span>' +
        '<span class="tbp-id">' + l.id + '</span>' +
        '<span class="tbp-pn"><small>pin</small>' + l.pin + '</span>' +
        '</button>';
    }

    var htmlB = '', htmlA = '';
    for (i = 15; i >= 0; i--) htmlB += celdaBit(porId['RB' + i]);
    for (i = 4; i >= 0; i--) htmlA += celdaBit(porId['RA' + i]);

    // Chip DIP de 28 pines: 1-14 a la izquierda (arriba → abajo), 15-28 a la
    // derecha (abajo → arriba), como en el diagrama de pines del datasheet.
    function etiquetaPin(p) {
      var l = porPin[p];
      if (l) return l.id;
      return (NO_PUERTO[p] || '').split(' ')[0];
    }
    function botonPin(p, lado, fila) {
      var l = porPin[p];
      var res = l && resaltar.indexOf(l.id) !== -1;
      return '<button type="button" class="tbp-pin tbp-pin-' + lado + (l ? '' : ' tbp-pin-np') + (res ? ' tbp-res' : '') +
        '" style="grid-row:' + fila + '" data-pin="' + p + '" aria-label="Pin ' + p + ': ' + (l ? l.id : NO_PUERTO[p]) + '">' +
        (lado === 'izq'
          ? '<span class="tbp-pin-nom">' + etiquetaPin(p) + '</span><span class="tbp-pin-num">' + p + '</span>'
          : '<span class="tbp-pin-num">' + p + '</span><span class="tbp-pin-nom">' + etiquetaPin(p) + '</span>') +
        '</button>';
    }
    var htmlChip = '';
    for (i = 1; i <= 14; i++) {
      htmlChip += botonPin(i, 'izq', i) +
        (i === 1 ? '<div class="tbp-cuerpo" aria-hidden="true"><span>dsPIC33FJ32MC202</span></div>' : '') +
        botonPin(29 - i, 'der', i);
    }

    el.classList.add('mpi-tabla-bit-pin');
    el.innerHTML =
      '<div class="mpi-sim-cab">Tabla 4 interactiva: bit ↔ pin físico</div>' +
      '<p class="tbp-ayuda">Pasa el ratón o haz clic en un bit para ver su pin; escribe un número de pin o pulsa sobre el chip para ver su bit.' +
        (resaltar.length ? ' Resaltados: <strong>' + resaltar.join(', ') + '</strong>.' : '') + '</p>' +
      '<div class="tbp-cuerpo-sim">' +
        '<div class="tbp-izq">' +
          '<div class="tbp-reg"><div class="tbp-reg-tit">PORTB / TRISB <small>bits 15..0</small></div>' +
            '<div class="tbp-rejilla tbp-rejilla-b" role="group" aria-label="Bits de PORTB">' + htmlB + '</div></div>' +
          '<div class="tbp-reg"><div class="tbp-reg-tit">PORTA / TRISA <small>bits 4..0 (los bits 5..15 no existen)</small></div>' +
            '<div class="tbp-rejilla tbp-rejilla-a" role="group" aria-label="Bits de PORTA">' + htmlA + '</div></div>' +
          '<div class="tbp-inverso">' +
            '<label for="' + uid + '-pin">Pin físico → bit:</label> ' +
            '<input id="' + uid + '-pin" class="tbp-pin-in" type="number" min="1" max="28" inputmode="numeric" placeholder="1-28">' +
          '</div>' +
          '<div class="tbp-info" aria-live="polite"></div>' +
        '</div>' +
        '<div class="tbp-chip" role="group" aria-label="Chip de 28 pines">' + htmlChip + '</div>' +
      '</div>' +
      (conPregunta
        ? '<div class="tbp-quiz">' +
            '<button type="button" class="tbp-btn tbp-quiz-ini" aria-expanded="false">Pregúntame</button>' +
            '<div class="tbp-quiz-panel" hidden>' +
              '<p class="tbp-quiz-preg"></p>' +
              '<div class="tbp-quiz-fila">' +
                '<label for="' + uid + '-resp">Pin físico:</label> ' +
                '<input id="' + uid + '-resp" class="tbp-quiz-in" type="number" min="1" max="28" inputmode="numeric">' +
                '<button type="button" class="tbp-btn tbp-quiz-ok">Comprobar</button>' +
                '<button type="button" class="tbp-btn tbp-quiz-otra">Otra</button>' +
              '</div>' +
              '<p class="tbp-quiz-fb" aria-live="polite"></p>' +
              '<p class="tbp-quiz-marca"></p>' +
            '</div>' +
          '</div>'
        : '');

    var info = el.querySelector('.tbp-info');
    var inPin = el.querySelector('.tbp-pin-in');
    var fijo = null;   // línea o pin seleccionado con clic (persistente)

    function marcar(idLinea, pin) {
      var bits = el.querySelectorAll('.tbp-bit');
      for (var k = 0; k < bits.length; k++) {
        var on = bits[k].getAttribute('data-id') === idLinea;
        bits[k].classList.toggle('tbp-sel', on);
        bits[k].setAttribute('aria-pressed', on ? 'true' : 'false');
      }
      var pins = el.querySelectorAll('.tbp-pin');
      for (k = 0; k < pins.length; k++) {
        pins[k].classList.toggle('tbp-sel', parseInt(pins[k].getAttribute('data-pin'), 10) === pin);
      }
    }

    function mostrarLinea(l) {
      var mascara = hex4(1 << l.bit);
      info.innerHTML =
        '<div class="tbp-info-tit"><span class="tbp-info-id">' + l.id + '</span> → <strong>pin ' + l.pin + '</strong></div>' +
        '<dl>' +
          '<dt>Bit</dt><dd>bit ' + l.bit + ' de <code>PORT' + l.puerto + '</code> y de <code>TRIS' + l.puerto + '</code> (máscara <code>' + mascara + '</code>)</dd>' +
          '<dt>Nombre del pin</dt><dd><code>' + nombreCompleto(l) + '</code></dd>' +
          '<dt>PicTrainer</dt><dd>' + (l.puerto === 'B'
            ? (l.uso || 'Sin uso en la tarjeta')
            : 'Sin uso en la tarjeta (la PicTrainer usa el puerto B)') + '</dd>' +
        '</dl>' +
        (/AN\d/.test(l.func) ? '<p class="tbp-aviso">Pin con función analógica: tras el reset es analógico y se lee como 0 en PORT' + l.puerto + ' hasta escribir <code>AD1PCFGL = 0xFFFF;</code>.</p>' : '');
      marcar(l.id, l.pin);
    }

    function mostrarPin(p) {
      var l = porPin[p];
      if (l) { mostrarLinea(l); return; }
      if (NO_PUERTO[p]) {
        info.innerHTML = '<div class="tbp-info-tit"><strong>Pin ' + p + '</strong> → ningún bit</div>' +
          '<p>Es <strong>' + NO_PUERTO[p] + '</strong>: no pertenece a ningún puerto paralelo.</p>';
        marcar(null, p);
        return;
      }
      info.innerHTML = '<p class="tbp-aviso">El encapsulado tiene 28 pines: escribe un número entre 1 y 28.</p>';
      marcar(null, null);
    }

    function restaurar() {
      if (fijo && fijo.l) mostrarLinea(fijo.l);
      else if (fijo && fijo.pin) mostrarPin(fijo.pin);
      else {
        info.innerHTML = '<p class="tbp-vacio">Selecciona un bit o un pin.</p>';
        marcar(null, null);
      }
    }

    function lineaDe(t) {
      var b = t.closest('.tbp-bit');
      if (b) return { l: porId[b.getAttribute('data-id')] };
      var p = t.closest('.tbp-pin');
      if (p) return { pin: parseInt(p.getAttribute('data-pin'), 10) };
      return null;
    }

    function previsualizar(sel) {
      if (!sel) return;
      if (sel.l) mostrarLinea(sel.l); else mostrarPin(sel.pin);
    }

    var zona = el.querySelector('.tbp-cuerpo-sim');
    zona.addEventListener('mouseover', function (e) { previsualizar(lineaDe(e.target)); });
    zona.addEventListener('focusin', function (e) { previsualizar(lineaDe(e.target)); });
    zona.addEventListener('mouseleave', restaurar);
    zona.addEventListener('click', function (e) {
      var sel = lineaDe(e.target);
      if (!sel) return;
      fijo = sel;
      inPin.value = sel.l ? sel.l.pin : sel.pin;
      previsualizar(sel);
    });

    inPin.addEventListener('input', function () {
      var p = parseInt(inPin.value, 10);
      if (isNaN(p)) { fijo = null; restaurar(); return; }
      fijo = { pin: p };
      mostrarPin(p);
    });

    // ---------- Modo «pregúntame» ----------
    if (conPregunta) {
      var btnIni = el.querySelector('.tbp-quiz-ini');
      var panel = el.querySelector('.tbp-quiz-panel');
      var preg = el.querySelector('.tbp-quiz-preg');
      var inResp = el.querySelector('.tbp-quiz-in');
      var fb = el.querySelector('.tbp-quiz-fb');
      var marca = el.querySelector('.tbp-quiz-marca');
      var actual = null, aciertos = 0, intentos = 0, contestada = false;

      function nueva() {
        var anterior = actual;
        do { actual = porId['RB' + Math.floor(Math.random() * 16)]; } while (actual === anterior);
        preg.innerHTML = '¿En qué pin físico está <strong>' + actual.id + '</strong> (bit ' + actual.bit + ' de PORTB)?';
        inResp.value = '';
        fb.textContent = '';
        fb.className = 'tbp-quiz-fb';
        contestada = false;
        inResp.focus();
      }
      function comprobar() {
        var r = parseInt(inResp.value, 10);
        if (isNaN(r)) { fb.textContent = 'Escribe un número de pin.'; fb.className = 'tbp-quiz-fb'; return; }
        if (!contestada) { intentos++; }
        var ok = r === actual.pin;
        if (ok && !contestada) aciertos++;
        contestada = true;
        fb.className = 'tbp-quiz-fb ' + (ok ? 'tbp-ok' : 'tbp-mal');
        fb.innerHTML = ok
          ? '✔ Correcto: ' + actual.id + ' es el pin ' + actual.pin + '.'
          : '✘ No: ' + actual.id + ' es el pin <strong>' + actual.pin + '</strong>' +
            (porPin[r] ? ' (el pin ' + r + ' es ' + porPin[r].id + ')' : (NO_PUERTO[r] ? ' (el pin ' + r + ' es ' + NO_PUERTO[r].split(' ')[0] + ')' : '')) + '.';
        marca.textContent = 'Aciertos: ' + aciertos + ' de ' + intentos;
        fijo = { l: actual };
        mostrarLinea(actual);
      }
      btnIni.addEventListener('click', function () {
        var abrir = panel.hidden;
        panel.hidden = !abrir;
        btnIni.setAttribute('aria-expanded', abrir ? 'true' : 'false');
        btnIni.textContent = abrir ? 'Cerrar «pregúntame»' : 'Pregúntame';
        if (abrir) nueva();
      });
      el.querySelector('.tbp-quiz-ok').addEventListener('click', comprobar);
      el.querySelector('.tbp-quiz-otra').addEventListener('click', nueva);
      inResp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); comprobar(); } });
    }

    // Selección inicial: el primero de «resaltar», si existe.
    if (resaltar.length && porId[resaltar[0]]) fijo = { l: porId[resaltar[0]] };
    restaurar();
  };
})();
