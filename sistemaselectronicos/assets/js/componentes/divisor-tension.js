/*
 * Componente "divisor-tension": un divisor de tensión resistivo en vivo.
 * Vin alimenta R1 y R2 en serie; la salida Vo se toma en el punto medio
 * (sobre R2). Mueve los sliders de Vin, R1 y R2 y se recalculan al instante:
 *   Vo = Vin * R2/(R1+R2),  I = Vin/(R1+R2).
 * El botón de preset reproduce el ejemplo de diseño del tema (2.5):
 *   Vin = 7,5 V  ->  Vo = 2,75 V  con R1 = 237,5 ohm, R2 = 137,5 ohm, I = 20 mA.
 *
 * Uso: <div class="mpi-mount" data-componente="divisor-tension" data-config='{}'></div>
 */
window.MPI = window.MPI || {};
MPI.componentes = MPI.componentes || {};

(function () {
  var R_MIN = 100, R_MAX = 100000;   // ohm
  var V_MIN = 0, V_MAX = 12;         // V

  // --- Formato con coma decimal ---------------------------------------------
  function coma(s) { return String(s).replace('.', ','); }

  function fmtV(v) {
    if (v >= 1 || v === 0) return coma(v.toFixed(2)) + ' V';
    return coma((v * 1000).toFixed(0)) + ' mV';
  }
  function fmtR(r) {
    if (r >= 1000) {
      var k = r / 1000;
      // hasta una decimal en kohm, sin ceros sobrantes
      var s = (Math.round(k * 10) / 10).toFixed(1);
      if (s.slice(-2) === '.0') s = s.slice(0, -2);
      return coma(s) + ' kΩ';
    }
    var o = (Math.round(r * 10) / 10).toFixed(1);
    if (o.slice(-2) === '.0') o = o.slice(0, -2);
    return coma(o) + ' Ω';
  }
  function fmtImA(i) {
    var ma = i * 1000;
    if (ma >= 1) {
      var s = (Math.round(ma * 100) / 100).toFixed(2);
      return coma(s) + ' mA';
    }
    var ua = i * 1e6;   // A -> uA
    return coma((Math.round(ua * 10) / 10).toFixed(1)) + ' µA';
  }

  MPI.componentes['divisor-tension'] = function (el, cfg) {
    el.classList.add('mpi-divisor-tension');

    // Estado inicial: el ejemplo sencillo del tema (Vin=5 V, R1=3k, R2=2k -> 2 V).
    var vin = 5, r1 = 3000, r2 = 2000;

    el.innerHTML =
      '<div class="mpi-sim-cab">Divisor de tensión en vivo</div>' +
      '<div class="dv-cuerpo">' +
        // --- Esquema SVG ---
        '<div class="dv-esquema">' +
          '<svg viewBox="0 0 220 260" class="dv-svg" aria-label="Esquema del divisor de tensión">' +
            // rail Vin (arriba)
            '<line x1="60" y1="20" x2="160" y2="20" stroke="var(--txt-2)" stroke-width="2"/>' +
            '<circle cx="60" cy="20" r="3.5" fill="var(--rojo)"/>' +
            '<text x="52" y="16" font-size="11" fill="var(--rojo)" text-anchor="end">V<tspan font-size="8" dy="2">in</tspan></text>' +
            '<text class="dv-vin-val" x="110" y="14" font-size="10" fill="var(--rojo)" text-anchor="middle"></text>' +
            // bajante hasta R1
            '<line x1="110" y1="20" x2="110" y2="50" stroke="var(--txt-2)" stroke-width="2"/>' +
            // R1 (caja)
            '<rect class="dv-r1-box" x="92" y="50" width="36" height="46" rx="3" fill="var(--bg-3)" stroke="var(--acento-2)" stroke-width="2"/>' +
            '<text x="84" y="68" font-size="11" fill="var(--acento-2)" text-anchor="end">R<tspan font-size="8" dy="2">1</tspan></text>' +
            '<text class="dv-r1-val" x="84" y="84" font-size="9" fill="var(--txt-2)" text-anchor="end"></text>' +
            // tramo nodo medio (Vo)
            '<line x1="110" y1="96" x2="110" y2="130" stroke="var(--txt-2)" stroke-width="2"/>' +
            '<circle class="dv-nodo" cx="110" cy="113" r="3.5" fill="var(--amarillo)"/>' +
            // toma de salida Vo a la derecha
            '<line x1="110" y1="113" x2="190" y2="113" stroke="var(--amarillo)" stroke-width="2"/>' +
            '<circle cx="190" cy="113" r="3.5" fill="var(--amarillo)"/>' +
            '<text x="196" y="110" font-size="11" fill="var(--amarillo)">V<tspan font-size="8" dy="2">o</tspan></text>' +
            '<text class="dv-vo-val" x="150" y="108" font-size="10" fill="var(--amarillo)" text-anchor="middle"></text>' +
            // R2 (caja)
            '<rect class="dv-r2-box" x="92" y="130" width="36" height="46" rx="3" fill="var(--bg-3)" stroke="var(--azul-cl)" stroke-width="2"/>' +
            '<text x="84" y="148" font-size="11" fill="var(--azul-cl)" text-anchor="end">R<tspan font-size="8" dy="2">2</tspan></text>' +
            '<text class="dv-r2-val" x="84" y="164" font-size="9" fill="var(--txt-2)" text-anchor="end"></text>' +
            // bajante a tierra
            '<line x1="110" y1="176" x2="110" y2="210" stroke="var(--txt-2)" stroke-width="2"/>' +
            // simbolo de masa
            '<line x1="92" y1="210" x2="128" y2="210" stroke="var(--txt-2)" stroke-width="2"/>' +
            '<line x1="98" y1="216" x2="122" y2="216" stroke="var(--txt-2)" stroke-width="2"/>' +
            '<line x1="104" y1="222" x2="116" y2="222" stroke="var(--txt-2)" stroke-width="2"/>' +
            // indicador de corriente
            '<text class="dv-i-val" x="135" y="118" font-size="9" fill="var(--verde)" text-anchor="start"></text>' +
          '</svg>' +
        '</div>' +
        // --- Controles ---
        '<div class="dv-panel">' +
          '<div class="dv-ctrl">' +
            '<label class="dv-lab">V<sub>in</sub> = <strong class="dv-vin-lab"></strong></label>' +
            '<input type="range" class="dv-vin" min="0" max="12" step="0.1" value="5">' +
          '</div>' +
          '<div class="dv-ctrl">' +
            '<label class="dv-lab"><span class="dv-c1">R<sub>1</sub></span> = <strong class="dv-r1-lab"></strong></label>' +
            '<input type="range" class="dv-r1" min="100" max="100000" step="100" value="3000">' +
          '</div>' +
          '<div class="dv-ctrl">' +
            '<label class="dv-lab"><span class="dv-c2">R<sub>2</sub></span> = <strong class="dv-r2-lab"></strong></label>' +
            '<input type="range" class="dv-r2" min="100" max="100000" step="100" value="2000">' +
          '</div>' +
          '<div class="dv-botones">' +
            '<button type="button" class="dv-preset">Ejemplo de diseño (7,5 V &#8594; 2,75 V)</button>' +
            '<button type="button" class="dv-reset">Reiniciar &#8634;</button>' +
          '</div>' +
        '</div>' +
      '</div>' +
      // --- Formula y resultados ---
      '<div class="dv-formula"></div>' +
      '<div class="dv-resultados">' +
        '<div class="dv-res dv-res-vo"><span class="dv-res-tit">V<sub>o</sub></span><strong class="dv-out-vo"></strong></div>' +
        '<div class="dv-res dv-res-i"><span class="dv-res-tit">I del divisor</span><strong class="dv-out-i"></strong></div>' +
        '<div class="dv-res dv-res-req"><span class="dv-res-tit">R<sub>1</sub> + R<sub>2</sub></span><strong class="dv-out-req"></strong></div>' +
      '</div>' +
      '<div class="dv-nota nota"></div>' +
      '<pre class="dv-codigo"><code class="lang-python"></code></pre>';

    var slVin = el.querySelector('.dv-vin');
    var slR1 = el.querySelector('.dv-r1');
    var slR2 = el.querySelector('.dv-r2');

    function pintar() {
      var req = r1 + r2;
      var vo = vin * r2 / req;
      var iA = req > 0 ? vin / req : 0;        // amperios

      // etiquetas de los sliders
      el.querySelector('.dv-vin-lab').textContent = fmtV(vin);
      el.querySelector('.dv-r1-lab').textContent = fmtR(r1);
      el.querySelector('.dv-r2-lab').textContent = fmtR(r2);

      // textos del SVG
      el.querySelector('.dv-vin-val').textContent = fmtV(vin);
      el.querySelector('.dv-vo-val').textContent = fmtV(vo);
      el.querySelector('.dv-r1-val').textContent = fmtR(r1);
      el.querySelector('.dv-r2-val').textContent = fmtR(r2);
      el.querySelector('.dv-i-val').textContent = 'I = ' + fmtImA(iA);

      // grosor de las cajas proporcional (cualitativo) al reparto de tensión
      var fracR2 = req > 0 ? r2 / req : 0.5;
      el.querySelector('.dv-r1-box').setAttribute('stroke-width', (1.5 + 3 * (1 - fracR2)).toFixed(2));
      el.querySelector('.dv-r2-box').setAttribute('stroke-width', (1.5 + 3 * fracR2).toFixed(2));

      // formula con valores sustituidos
      el.querySelector('.dv-formula').innerHTML =
        '<span class="dv-fmla">V<sub>o</sub> = V<sub>in</sub> &#8901; ' +
        '<span class="dv-frac"><span class="dv-num">R<sub>2</sub></span>' +
        '<span class="dv-den">R<sub>1</sub> + R<sub>2</sub></span></span></span>' +
        '<span class="dv-fmla-num">= ' + fmtV(vin) + ' &#8901; ' +
        '<span class="dv-frac"><span class="dv-num">' + fmtR(r2) + '</span>' +
        '<span class="dv-den">' + fmtR(r1) + ' + ' + fmtR(r2) + '</span></span>' +
        ' = <strong>' + fmtV(vo) + '</strong></span>';

      // tarjetas de resultado
      el.querySelector('.dv-out-vo').textContent = fmtV(vo);
      el.querySelector('.dv-out-i').textContent = fmtImA(iA);
      el.querySelector('.dv-out-req').textContent = fmtR(req);

      // nota pedagogica según el reparto
      var pct = (fracR2 * 100);
      var pctTxt = coma((Math.round(pct * 10) / 10).toFixed(1));
      el.querySelector('.dv-nota').innerHTML =
        'La misma corriente <em>I</em> = V<sub>in</sub>/(R<sub>1</sub>+R<sub>2</sub>) = <strong>' +
        fmtImA(iA) + '</strong> recorre las dos resistencias. La salida se queda con el <strong>' +
        pctTxt + ' %</strong> de V<sub>in</sub>, la fraccion que R<sub>2</sub> representa del total. ' +
        'Cuanto mayor es R<sub>2</sub> frente a R<sub>1</sub>, mas se acerca V<sub>o</sub> a V<sub>in</sub>. ' +
        'Recuerda: una carga conectada en V<sub>o</sub> debe cumplir R<sub>L</sub> &#8811; R<sub>2</sub> para no perturbar el divisor.';

      // código Python equivalente
      el.querySelector('.dv-codigo code').textContent =
        'Vin = ' + coma(vin) + '       # V\n' +
        'R1  = ' + r1 + '      # ohm\n' +
        'R2  = ' + r2 + '      # ohm\n' +
        '\n' +
        'Vo = Vin * R2 / (R1 + R2)   # = ' + coma((Math.round(vo * 1000) / 1000)) + ' V\n' +
        'I  = Vin / (R1 + R2)        # = ' + coma((Math.round(iA * 1e6) / 1e3)) + ' mA';

      if (MPI.resaltarTodo) MPI.resaltarTodo(el);
    }

    function sincronizaSliders() {
      slVin.value = vin;
      slR1.value = r1;
      slR2.value = r2;
    }

    slVin.addEventListener('input', function () {
      vin = parseFloat(slVin.value);
      pintar();
    });
    slR1.addEventListener('input', function () {
      r1 = parseInt(slR1.value, 10);
      pintar();
    });
    slR2.addEventListener('input', function () {
      r2 = parseInt(slR2.value, 10);
      pintar();
    });

    // Preset: ejemplo de diseño del tema. R1=237,5 y R2=137,5 no caen en el
    // paso de 100 ohm, asi que ampliamos el rango de los sliders y fijamos el
    // valor exacto para que Vo salga 2,75 V e I = 20 mA tal cual.
    el.querySelector('.dv-preset').addEventListener('click', function () {
      vin = 7.5; r1 = 237.5; r2 = 137.5;
      slVin.value = vin;
      // permitir valores no multiplos de 100 en este preset
      slR1.step = 0.5; slR2.step = 0.5;
      slR1.value = r1; slR2.value = r2;
      pintar();
    });

    el.querySelector('.dv-reset').addEventListener('click', function () {
      vin = 5; r1 = 3000; r2 = 2000;
      slR1.step = 100; slR2.step = 100;
      sincronizaSliders();
      pintar();
    });

    sincronizaSliders();
    pintar();
  };
})();
