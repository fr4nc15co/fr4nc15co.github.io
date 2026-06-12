/*
 * Componente "niveles-logicos": visualizador de los niveles lógicos de la
 * Raspberry Pi 4 (SoC BCM2711, Vcc = 3,3 V). Una barra vertical 0–3,3 V
 * dividida en zonas muestra cómo una ENTRADA digital interpreta una tensión:
 *   Vin ≤ V_IL = 0,8 V          -> se lee «0» lógico
 *   Vin ≥ V_IH = 2,0 V          -> se lee «1» lógico
 *   V_IL < Vin < V_IH           -> zona PROHIBIDA / indeterminada
 * También dibuja las zonas de SALIDA (V_OL, V_OH) y los márgenes de ruido,
 * que es la holgura entre lo que garantiza una salida y lo que exige una
 * entrada. Coherente con la tabla del tema «Introducción» (1.4 Bits y
 * niveles lógicos): BCM2711, Vcc = 3,3 V, V_IL = 0,8 V, V_IH = 2,0 V.
 *
 * Uso: <div class="mpi-mount" data-componente="niveles-logicos" data-config='{}'></div>
 */
window.MPI = window.MPI || {};
MPI.componentes = MPI.componentes || {};

(function () {
  // Valores del chip BCM2711 (Raspberry Pi 4). Editables vía cfg.
  var DEF = {
    vcc: 3.3,
    vil: 0.8,    // máxima tensión vista como «0» en entrada
    vih: 2.0,    // mínima tensión vista como «1» en entrada
    vol: 0.4,    // máxima tensión de una salida en «0» (típico CMOS 3,3 V)
    voh: 2.9     // mínima tensión de una salida en «1» ≈ Vcc − 0,4 (CMOS 3,3 V)
  };

  function fmtV(v) {
    return v >= 1 ? v.toFixed(2).replace('.', ',') + ' V'
                  : (v * 1000).toFixed(0) + ' mV';
  }

  MPI.componentes['niveles-logicos'] = function (el, cfg) {
    cfg = cfg || {};
    var VCC = cfg.vcc || DEF.vcc;
    var VIL = (cfg.vil != null) ? cfg.vil : DEF.vil;
    var VIH = (cfg.vih != null) ? cfg.vih : DEF.vih;
    var VOL = (cfg.vol != null) ? cfg.vol : DEF.vol;
    var VOH = (cfg.voh != null) ? cfg.voh : DEF.voh;

    // Márgenes de ruido (diferencia salida–entrada).
    var NML = VIL - VOL;   // margen de ruido del «0»
    var NMH = VOH - VIH;   // margen de ruido del «1»

    el.classList.add('mpi-niveles-logicos');

    // --- Geometría del SVG -------------------------------------------------
    // viewBox 0 0 460 320; dos barras: ENTRADA (izq) y SALIDA (der).
    var TOP = 30, BOT = 290, H = BOT - TOP;     // zona útil vertical
    function y(v) { return BOT - (v / VCC) * H; } // tensión -> coordenada y
    var XE = 120, XS = 320, BW = 70;             // x de cada barra y ancho

    // Construye los rects de zonas de una barra dada un array {de,a,fill,op}.
    function zonas(x, tramos) {
      var s = '';
      for (var i = 0; i < tramos.length; i++) {
        var t = tramos[i], ya = y(t.a), yd = y(t.de);
        s += '<rect class="nl-zona" x="' + x + '" y="' + ya.toFixed(1) +
             '" width="' + BW + '" height="' + (yd - ya).toFixed(1) +
             '" fill="' + t.fill + '" fill-opacity="' + t.op + '"/>';
      }
      return s;
    }

    // Línea de umbral con etiqueta a la derecha de la barra.
    function umbral(x, v, color, txt) {
      var yy = y(v);
      return '<line x1="' + (x - 6) + '" y1="' + yy.toFixed(1) + '" x2="' +
             (x + BW + 6) + '" y2="' + yy.toFixed(1) + '" stroke="' + color +
             '" stroke-width="1.2" stroke-dasharray="3 2"/>' +
             '<text class="nl-umtxt" x="' + (x + BW + 9) + '" y="' +
             (yy + 3).toFixed(1) + '" fill="' + color + '">' + txt + '</text>';
    }

    var ENT_ZONAS = zonas(XE, [
      { de: VIH, a: VCC, fill: 'var(--acento)', op: 0.22 },   // «1»
      { de: VIL, a: VIH, fill: 'var(--rojo)', op: 0.20 },     // prohibida
      { de: 0, a: VIL, fill: 'var(--azul-cl)', op: 0.18 }     // «0»
    ]);
    var SAL_ZONAS = zonas(XS, [
      { de: VOH, a: VCC, fill: 'var(--acento)', op: 0.22 },   // «1»
      { de: VOL, a: VOH, fill: 'var(--bg-3)', op: 0.55 },     // sin uso
      { de: 0, a: VOL, fill: 'var(--azul-cl)', op: 0.18 }     // «0»
    ]);

    el.innerHTML =
      '<div class="mpi-sim-cab">Niveles lógicos de la Raspberry Pi 4 (BCM2711, V<sub>CC</sub> = 3,3 V)</div>' +
      '<div class="nl-cuerpo">' +
        '<svg viewBox="0 0 460 320" class="nl-svg" role="img" ' +
             'aria-label="Barras de niveles lógicos de entrada y salida de 0 a 3,3 V">' +
          // marco de las dos barras
          '<rect x="' + XE + '" y="' + TOP + '" width="' + BW + '" height="' + H +
            '" fill="none" stroke="var(--borde)"/>' +
          '<rect x="' + XS + '" y="' + TOP + '" width="' + BW + '" height="' + H +
            '" fill="none" stroke="var(--borde)"/>' +
          ENT_ZONAS + SAL_ZONAS +
          // títulos de cada barra
          '<text class="nl-titbar" x="' + (XE + BW / 2) + '" y="' + (TOP - 12) +
            '" text-anchor="middle" fill="var(--txt)">ENTRADA</text>' +
          '<text class="nl-titbar" x="' + (XS + BW / 2) + '" y="' + (TOP - 12) +
            '" text-anchor="middle" fill="var(--txt)">SALIDA</text>' +
          // eje de tensión a la izquierda de la barra de entrada
          '<text class="nl-ejetxt" x="' + (XE - 12) + '" y="' + (y(VCC) + 3) +
            '" text-anchor="end" fill="var(--txt-tenue)">' + fmtV(VCC) + '</text>' +
          '<text class="nl-ejetxt" x="' + (XE - 12) + '" y="' + (y(0) + 3) +
            '" text-anchor="end" fill="var(--txt-tenue)">0 V</text>' +
          // umbrales de entrada
          umbral(XE, VIH, 'var(--acento)', 'V_IH = ' + fmtV(VIH)) +
          umbral(XE, VIL, 'var(--azul-cl)', 'V_IL = ' + fmtV(VIL)) +
          // umbrales de salida
          umbral(XS, VOH, 'var(--acento)', 'V_OH = ' + fmtV(VOH)) +
          umbral(XS, VOL, 'var(--azul-cl)', 'V_OL = ' + fmtV(VOL)) +
          // etiquetas de zona de entrada
          '<text class="nl-zonatxt" x="' + (XE + BW / 2) + '" y="' +
            ((y(VIH) + y(VCC)) / 2 + 3) + '" text-anchor="middle" fill="var(--acento)">«1»</text>' +
          '<text class="nl-zonatxt nl-prohib" x="' + (XE + BW / 2) + '" y="' +
            ((y(VIL) + y(VIH)) / 2 + 3) + '" text-anchor="middle" fill="var(--rojo)">prohibida</text>' +
          '<text class="nl-zonatxt" x="' + (XE + BW / 2) + '" y="' +
            ((y(0) + y(VIL)) / 2 + 3) + '" text-anchor="middle" fill="var(--azul-cl)">«0»</text>' +
          // marcador de la tensión de entrada (se mueve)
          '<line class="nl-marca" x1="' + (XE - 6) + '" y1="0" x2="' + (XE + BW + 6) +
            '" y2="0" stroke="var(--amarillo)" stroke-width="2.5"/>' +
          '<polygon class="nl-puntero" points="0,0 0,0 0,0" fill="var(--amarillo)"/>' +
          '<text class="nl-marcatxt" x="' + (XE - 12) + '" y="0" text-anchor="end" ' +
            'fill="var(--amarillo)" font-weight="700"></text>' +
        '</svg>' +
        '<div class="nl-panel">' +
          '<div class="nl-lectura"></div>' +
          '<table class="nl-tabla"><tbody></tbody></table>' +
        '</div>' +
      '</div>' +
      '<div class="nl-controles">' +
        '<label class="nl-vlab">Tensión de entrada V<sub>in</sub> = ' +
          '<strong class="nl-vval"></strong>' +
          '<input type="range" class="nl-vin" min="0" max="' +
            Math.round(VCC * 1000) + '" step="10" value="1650"></label>' +
        '<div class="nl-presets">' +
          '<button type="button" class="nl-preset" data-v="0">0 V</button>' +
          '<button type="button" class="nl-preset" data-v="' + Math.round(VIL * 1000) + '">V<sub>IL</sub></button>' +
          '<button type="button" class="nl-preset" data-v="1400">1,4 V</button>' +
          '<button type="button" class="nl-preset" data-v="' + Math.round(VIH * 1000) + '">V<sub>IH</sub></button>' +
          '<button type="button" class="nl-preset" data-v="' + Math.round(VCC * 1000) + '">V<sub>CC</sub></button>' +
        '</div>' +
      '</div>' +
      '<div class="nl-margenes nota"></div>' +
      '<pre class="nl-codigo"><code class="lang-python"></code></pre>';

    var slVin = el.querySelector('.nl-vin');
    var marca = el.querySelector('.nl-marca');
    var punt = el.querySelector('.nl-puntero');
    var marcaTxt = el.querySelector('.nl-marcatxt');

    function clasifica(vin) {
      if (vin <= VIL) return { bit: '0', cls: 'nl-es0', color: 'var(--azul-cl)',
        nota: 'por debajo de V<sub>IL</sub> = ' + fmtV(VIL) };
      if (vin >= VIH) return { bit: '1', cls: 'nl-es1', color: 'var(--acento)',
        nota: 'por encima de V<sub>IH</sub> = ' + fmtV(VIH) };
      return { bit: '?', cls: 'nl-esx', color: 'var(--rojo)',
        nota: 'dentro de la zona prohibida (' + fmtV(VIL) + ' … ' + fmtV(VIH) + ')' };
    }

    function pintar() {
      var vin = parseInt(slVin.value, 10) / 1000;
      var yy = y(vin);
      var r = clasifica(vin);

      el.querySelector('.nl-vval').innerHTML = fmtV(vin);

      // marcador y puntero triangular
      marca.setAttribute('y1', yy.toFixed(1));
      marca.setAttribute('y2', yy.toFixed(1));
      marca.setAttribute('stroke', r.color);
      punt.setAttribute('points',
        (XE - 14) + ',' + (yy - 5).toFixed(1) + ' ' +
        (XE - 6) + ',' + yy.toFixed(1) + ' ' +
        (XE - 14) + ',' + (yy + 5).toFixed(1));
      punt.setAttribute('fill', r.color);
      marcaTxt.setAttribute('y', (yy + 3).toFixed(1));
      marcaTxt.setAttribute('fill', r.color);
      marcaTxt.textContent = '';   // el valor ya va en el control

      // lectura grande
      var bitTxt = r.bit === '?'
        ? '<span class="nl-bit nl-bitx">indeterminado</span>'
        : '<span class="nl-bit ' + r.cls + '">' + r.bit + '</span>';
      el.querySelector('.nl-lectura').innerHTML =
        'La entrada lee&nbsp;&rarr;&nbsp;' + bitTxt +
        '<div class="nl-lecnota">V<sub>in</sub> = ' + fmtV(vin) + ' está ' + r.nota + '.</div>';

      // tabla de niveles
      var tb = el.querySelector('.nl-tabla tbody');
      tb.innerHTML =
        '<tr><th>Nivel</th><th>Entrada</th><th>Salida</th></tr>' +
        '<tr><td><span class="nl-pill nl-p0">«0»</span></td>' +
          '<td>0 … ' + fmtV(VIL) + '</td><td>0 … ' + fmtV(VOL) + '</td></tr>' +
        '<tr class="nl-fprohib"><td><span class="nl-pill nl-px">indef.</span></td>' +
          '<td>' + fmtV(VIL) + ' … ' + fmtV(VIH) + '</td><td>—</td></tr>' +
        '<tr><td><span class="nl-pill nl-p1">«1»</span></td>' +
          '<td>' + fmtV(VIH) + ' … ' + fmtV(VCC) + '</td><td>' + fmtV(VOH) + ' … ' + fmtV(VCC) + '</td></tr>';

      // márgenes de ruido
      el.querySelector('.nl-margenes').innerHTML =
        '<strong>Márgenes de ruido.</strong> La salida garantiza un «0» por debajo de ' +
        'V<sub>OL</sub> = ' + fmtV(VOL) + ', y la entrada admite como «0» hasta ' +
        'V<sub>IL</sub> = ' + fmtV(VIL) + '; la holgura es el <em>margen de ruido bajo</em> ' +
        'NM<sub>L</sub> = V<sub>IL</sub> &minus; V<sub>OL</sub> = <strong>' + fmtV(NML) + '</strong>. ' +
        'Para el «1»: la salida da al menos V<sub>OH</sub> = ' + fmtV(VOH) + ' y la entrada exige ' +
        'V<sub>IH</sub> = ' + fmtV(VIH) + ', luego NM<sub>H</sub> = V<sub>OH</sub> &minus; V<sub>IH</sub> = ' +
        '<strong>' + fmtV(NMH) + '</strong>. Cualquier ruido menor que ese margen no cambia el bit leído.';

      // código de ejemplo (gpiozero, como en las prácticas de la Pi)
      var bitPy = (r.bit === '1') ? '1' : (r.bit === '0') ? '0' : '0 o 1 (¡indeterminado!)';
      el.querySelector('.nl-codigo code').textContent =
        'from gpiozero import Button\n' +
        '\n' +
        'botón = Button(17)                 # GPIO17 como entrada\n' +
        'estado = botón.value               # Vin = ' + fmtV(vin) + ' -> ' + bitPy + '\n' +
        '# V_IL = ' + fmtV(VIL) + ', V_IH = ' + fmtV(VIH) + ' (BCM2711, Vcc = 3,3 V)';
      if (MPI.resaltarTodo) MPI.resaltarTodo(el);
    }

    slVin.addEventListener('input', pintar);
    var presets = el.querySelectorAll('.nl-preset');
    for (var i = 0; i < presets.length; i++) {
      presets[i].addEventListener('click', function () {
        slVin.value = this.getAttribute('data-v');
        pintar();
      });
    }

    pintar();
  };
})();
