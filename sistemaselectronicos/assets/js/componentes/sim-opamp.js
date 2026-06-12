/*
 * Componente "sim-opamp": configurador interactivo de amplificador operacional.
 * Eliges la configuración (no inversor, inversor, buffer, sumador, diferencial,
 * comparador) y ajustas las tensiones de entrada, las resistencias R1/R2 y la
 * alimentación (Vcc/Vee). El componente recalcula en vivo la salida Vo con la
 * fórmula propia de cada montaje, la SATURA al rango [Vee, Vcc] de la
 * alimentación y avisa cuando la salida ideal se sale de ese margen.
 *
 * Coherente con las fórmulas del tema (datos/_specs/amplificadores-operacionales.json):
 *   no inversor   Vo = Vin·(1 + R2/R1)
 *   inversor      Vo = -Vin·(R2/R1)
 *   buffer        Vo = Vin
 *   sumador       Vo = -(v1 + v2)               (R iguales)
 *   diferencial   Vo = (R2/R1)·(v2 - v1)
 *   comparador    Vo = Vcc si Vin > Vref, si no Vee
 * y satura siempre a [Vee, Vcc].
 *
 * Uso: <div class="mpi-mount" data-componente="sim-opamp" data-config='{}'></div>
 */
window.MPI = window.MPI || {};
MPI.componentes = MPI.componentes || {};

(function () {

  // --- formato con coma decimal -------------------------------------------
  function fmtV(v) {
    var s = (Math.abs(v) < 0.0005 ? 0 : v).toFixed(3);
    // quita ceros sobrantes pero deja al menos un decimal
    s = s.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '.0');
    return s.replace('.', ',') + ' V';
  }
  function fmtR(kohm) {
    var s = kohm.toFixed(kohm % 1 === 0 ? 0 : 1).replace('.', ',');
    return s + ' kΩ';
  }
  function fmtGan(g) {
    var s = (Math.round(g * 100) / 100).toString().replace('.', ',');
    return s;
  }
  function pyNum(v) {
    return (Math.round(v * 1000) / 1000).toString();   // punto decimal para Python
  }

  // --- catálogo de configuraciones ----------------------------------------
  // Cada una sabe qué entradas mostrar, cómo calcular Vo (ideal) y cómo
  // describirse (fórmula simbólica + sustitución numérica + esquema SVG).
  var CONFIGS = {
    noinv: {
      nombre: 'No inversor',
      usa: { vin: true },
      formula: 'V<sub>o</sub> = V<sub>in</sub> · (1 + R2 / R1)',
      vo: function (s) { return s.vin * (1 + s.r2 / s.r1); },
      calculo: function (s) {
        var g = 1 + s.r2 / s.r1;
        return 'V<sub>o</sub> = ' + fmtV(s.vin) + ' · (1 + ' + fmtR(s.r2) + ' / ' + fmtR(s.r1) +
          ') = ' + fmtV(s.vin) + ' · ' + fmtGan(g) + ' = <strong>' + fmtV(s.vin * g) + '</strong>' +
          ' &nbsp;<span class="oa-gan">(A<sub>v</sub> = ' + fmtGan(g) + ' V/V)</span>';
      },
      svg: 'noinv'
    },
    inv: {
      nombre: 'Inversor',
      usa: { vin: true },
      formula: 'V<sub>o</sub> = − V<sub>in</sub> · (R2 / R1)',
      vo: function (s) { return -s.vin * (s.r2 / s.r1); },
      calculo: function (s) {
        var g = s.r2 / s.r1;
        return 'V<sub>o</sub> = −' + fmtV(s.vin) + ' · (' + fmtR(s.r2) + ' / ' + fmtR(s.r1) +
          ') = −' + fmtV(s.vin) + ' · ' + fmtGan(g) + ' = <strong>' + fmtV(-s.vin * g) + '</strong>' +
          ' &nbsp;<span class="oa-gan">(A<sub>v</sub> = −' + fmtGan(g) + ' V/V)</span>';
      },
      svg: 'inv'
    },
    buffer: {
      nombre: 'Buffer (seguidor)',
      usa: { vin: true },
      formula: 'V<sub>o</sub> = V<sub>in</sub>',
      vo: function (s) { return s.vin; },
      calculo: function (s) {
        return 'V<sub>o</sub> = V<sub>in</sub> = <strong>' + fmtV(s.vin) + '</strong>' +
          ' &nbsp;<span class="oa-gan">(A<sub>v</sub> = 1 V/V; R2 = 0, R1 = ∞)</span>';
      },
      svg: 'buffer'
    },
    sumador: {
      nombre: 'Sumador inversor',
      usa: { v1: true, v2: true },
      formula: 'V<sub>o</sub> = − (v<sub>1</sub> + v<sub>2</sub>)',
      vo: function (s) { return -(s.v1 + s.v2); },
      calculo: function (s) {
        return 'V<sub>o</sub> = −(' + fmtV(s.v1) + ' + ' + fmtV(s.v2) + ') = <strong>' +
          fmtV(-(s.v1 + s.v2)) + '</strong>' +
          ' &nbsp;<span class="oa-gan">(R iguales → suma con signo cambiado)</span>';
      },
      svg: 'sumador'
    },
    dif: {
      nombre: 'Diferencial',
      usa: { v1: true, v2: true },
      formula: 'V<sub>o</sub> = (R2 / R1) · (v<sub>2</sub> − v<sub>1</sub>)',
      vo: function (s) { return (s.r2 / s.r1) * (s.v2 - s.v1); },
      calculo: function (s) {
        var g = s.r2 / s.r1;
        return 'V<sub>o</sub> = (' + fmtR(s.r2) + ' / ' + fmtR(s.r1) + ') · (' + fmtV(s.v2) +
          ' − ' + fmtV(s.v1) + ') = ' + fmtGan(g) + ' · ' + fmtV(s.v2 - s.v1) +
          ' = <strong>' + fmtV(g * (s.v2 - s.v1)) + '</strong>' +
          ' &nbsp;<span class="oa-gan">(A<sub>v</sub> = ' + fmtGan(g) + ' V/V)</span>';
      },
      svg: 'dif'
    },
    comp: {
      nombre: 'Comparador (lazo abierto)',
      usa: { vin: true, vref: true },
      formula: 'V<sub>o</sub> = V<sub>cc</sub> si V<sub>in</sub> &gt; V<sub>ref</sub>; si no, V<sub>ee</sub>',
      vo: function (s) { return s.vin > s.vref ? s.vcc : s.vee; },
      calculo: function (s) {
        var mayor = s.vin > s.vref;
        return 'V<sub>in</sub> = ' + fmtV(s.vin) + (mayor ? ' &gt; ' : ' ≤ ') + 'V<sub>ref</sub> = ' +
          fmtV(s.vref) + ' → V<sub>o</sub> = <strong>' + fmtV(mayor ? s.vcc : s.vee) + '</strong>' +
          ' &nbsp;<span class="oa-gan">(' + (mayor ? 'salta al raíl alto V_cc' : 'salta al raíl bajo V_ee') + ')</span>';
      },
      svg: 'comp'
    }
  };

  var ORDEN = ['noinv', 'inv', 'buffer', 'sumador', 'dif', 'comp'];

  // --- esquemas SVG (triángulo de AO + red de resistencias por config) -----
  // viewBox común 0 0 240 150. Reutilizamos un triángulo base.
  function tri(extra) {
    return '<polygon points="120,40 120,110 190,75" fill="var(--bg-3)" stroke="var(--borde)" stroke-width="1.5"/>' +
      '<text x="128" y="68" font-size="11" fill="var(--txt-2)">−</text>' +
      '<text x="128" y="92" font-size="11" fill="var(--txt-2)">+</text>' +
      '<line x1="190" y1="75" x2="222" y2="75" stroke="var(--acento)" stroke-width="1.5"/>' +
      '<text x="214" y="68" font-size="10" fill="var(--acento)">Vₒ</text>' +
      (extra || '');
  }
  function esquemaSVG(tipo) {
    var c = 'stroke="var(--azul-cl)" stroke-width="1.5" fill="none"';
    var lbl = 'font-size="9" fill="var(--txt-tenue)"';
    var inn = '';
    if (tipo === 'noinv') {
      inn =
        // V_in al terminal no inversor (v+), sin cruzar la rama de R1
        '<line x1="60" y1="95" x2="120" y2="95" ' + c + '/>' +
        '<text x="58" y="90" ' + lbl + '>V_in (v+)</text>' +
        // carril de v−: del triángulo hasta la rama de R1
        '<line x1="120" y1="55" x2="30" y2="55" ' + c + '/>' +
        // R1: de v− a masa
        '<line x1="30" y1="55" x2="30" y2="120" ' + c + '/>' +
        '<rect x="23" y="80" width="14" height="28" fill="none" stroke="var(--naranja)" stroke-width="1.5"/>' +
        '<text x="42" y="98" ' + lbl + '>R1</text>' +
        '<line x1="30" y1="120" x2="30" y2="132" ' + c + '/>' +
        '<line x1="22" y1="132" x2="38" y2="132" stroke="var(--txt-tenue)" stroke-width="1.5"/>' +
        // R2: de v− a la salida (lazo de realimentación)
        '<line x1="80" y1="55" x2="80" y2="27" ' + c + '/>' +
        '<line x1="80" y1="27" x2="95" y2="27" ' + c + '/>' +
        '<rect x="95" y="20" width="30" height="14" fill="none" stroke="var(--naranja)" stroke-width="1.5"/>' +
        '<text x="98" y="16" ' + lbl + '>R2</text>' +
        '<line x1="125" y1="27" x2="200" y2="27" ' + c + '/>' +
        '<line x1="200" y1="27" x2="200" y2="75" ' + c + '/>';
    } else if (tipo === 'inv') {
      inn =
        '<line x1="8" y1="55" x2="40" y2="55" ' + c + '/>' +
        '<text x="8" y="50" ' + lbl + '>V_in</text>' +
        '<rect x="40" y="48" width="30" height="14" fill="none" stroke="var(--naranja)" stroke-width="1.5"/>' +
        '<text x="44" y="44" ' + lbl + '>R1</text>' +
        '<line x1="70" y1="55" x2="120" y2="55" ' + c + '/>' +
        '<line x1="90" y1="55" x2="90" y2="25" ' + c + '/>' +
        '<rect x="115" y="18" width="30" height="14" fill="none" stroke="var(--naranja)" stroke-width="1.5"/>' +
        '<text x="118" y="14" ' + lbl + '>R2</text>' +
        '<line x1="145" y1="25" x2="200" y2="25" ' + c + '/>' +
        '<line x1="200" y1="25" x2="200" y2="75" ' + c + '/>' +
        '<line x1="120" y1="95" x2="100" y2="95" ' + c + '/>' +
        '<line x1="100" y1="95" x2="100" y2="118" ' + c + '/>' +
        '<line x1="92" y1="118" x2="108" y2="118" stroke="var(--txt-tenue)" stroke-width="1.5"/>';
    } else if (tipo === 'buffer') {
      inn =
        '<line x1="8" y1="95" x2="120" y2="95" ' + c + '/>' +
        '<text x="8" y="90" ' + lbl + '>V_in (v+)</text>' +
        '<line x1="120" y1="55" x2="100" y2="55" ' + c + '/>' +
        '<line x1="100" y1="55" x2="100" y2="20" ' + c + '/>' +
        '<line x1="100" y1="20" x2="200" y2="20" ' + c + '/>' +
        '<line x1="200" y1="20" x2="200" y2="75" ' + c + '/>' +
        '<text x="150" y="15" ' + lbl + '>realimentación directa</text>';
    } else if (tipo === 'sumador') {
      inn =
        '<line x1="8" y1="48" x2="38" y2="48" ' + c + '/>' +
        '<text x="8" y="43" ' + lbl + '>v1</text>' +
        '<rect x="38" y="41" width="24" height="12" fill="none" stroke="var(--naranja)" stroke-width="1.5"/>' +
        '<line x1="62" y1="48" x2="90" y2="48" ' + c + '/>' +
        '<line x1="8" y1="68" x2="38" y2="68" ' + c + '/>' +
        '<text x="8" y="63" ' + lbl + '>v2</text>' +
        '<rect x="38" y="61" width="24" height="12" fill="none" stroke="var(--naranja)" stroke-width="1.5"/>' +
        '<line x1="62" y1="68" x2="90" y2="68" ' + c + '/>' +
        '<line x1="90" y1="48" x2="90" y2="68" ' + c + '/>' +
        '<line x1="90" y1="55" x2="120" y2="55" ' + c + '/>' +
        '<line x1="90" y1="55" x2="90" y2="28" ' + c + '/>' +
        '<rect x="115" y="21" width="30" height="14" fill="none" stroke="var(--naranja)" stroke-width="1.5"/>' +
        '<text x="118" y="17" ' + lbl + '>Rf</text>' +
        '<line x1="145" y1="28" x2="200" y2="28" ' + c + '/>' +
        '<line x1="200" y1="28" x2="200" y2="75" ' + c + '/>' +
        '<line x1="120" y1="95" x2="104" y2="95" ' + c + '/>' +
        '<line x1="104" y1="95" x2="104" y2="115" ' + c + '/>' +
        '<line x1="96" y1="115" x2="112" y2="115" stroke="var(--txt-tenue)" stroke-width="1.5"/>';
    } else if (tipo === 'dif') {
      inn =
        '<line x1="8" y1="55" x2="40" y2="55" ' + c + '/>' +
        '<text x="8" y="50" ' + lbl + '>v1</text>' +
        '<rect x="40" y="48" width="26" height="12" fill="none" stroke="var(--naranja)" stroke-width="1.5"/>' +
        '<text x="44" y="45" ' + lbl + '>R1</text>' +
        '<line x1="66" y1="55" x2="120" y2="55" ' + c + '/>' +
        '<line x1="88" y1="55" x2="88" y2="26" ' + c + '/>' +
        '<rect x="113" y="19" width="28" height="12" fill="none" stroke="var(--naranja)" stroke-width="1.5"/>' +
        '<text x="116" y="16" ' + lbl + '>R2</text>' +
        '<line x1="141" y1="26" x2="200" y2="26" ' + c + '/>' +
        '<line x1="200" y1="26" x2="200" y2="75" ' + c + '/>' +
        '<line x1="8" y1="95" x2="40" y2="95" ' + c + '/>' +
        '<text x="8" y="90" ' + lbl + '>v2</text>' +
        '<rect x="40" y="89" width="26" height="12" fill="none" stroke="var(--naranja)" stroke-width="1.5"/>' +
        '<text x="44" y="112" ' + lbl + '>R3=R1</text>' +
        '<line x1="66" y1="95" x2="120" y2="95" ' + c + '/>';
    } else if (tipo === 'comp') {
      inn =
        '<line x1="8" y1="95" x2="120" y2="95" ' + c + '/>' +
        '<text x="8" y="90" ' + lbl + '>V_in (v+)</text>' +
        '<line x1="8" y1="55" x2="120" y2="55" stroke="var(--amarillo)" stroke-width="1.5" fill="none"/>' +
        '<text x="8" y="50" ' + lbl + '>V_ref (v−)</text>' +
        '<text x="150" y="100" ' + lbl + '>sin realimentación</text>';
    }
    return '<svg viewBox="0 0 240 150" class="oa-svg" aria-label="Esquema del montaje">' +
      tri(inn) + '</svg>';
  }

  MPI.componentes['sim-opamp'] = function (el, cfg) {
    el.classList.add('mpi-sim-opamp');

    // estado (valores por defecto coherentes con el ejemplo del tema:
    // no inversor R1=1k, R2=9k -> Av=10; ±5 V satura en ±5)
    var st = {
      conf: 'noinv',
      vin: 0.30,   // 0,30 V -> Vo=3,0 V con Av=10 (dentro de ±5)
      v1: 1.00,
      v2: 2.00,
      vref: 2.50,
      r1: 1,       // kΩ
      r2: 9,       // kΩ
      vcc: 5,
      vee: -5
    };
    if (cfg && cfg.conf && CONFIGS[cfg.conf]) st.conf = cfg.conf;

    var opciones = '';
    for (var i = 0; i < ORDEN.length; i++) {
      var k = ORDEN[i];
      opciones += '<option value="' + k + '"' + (k === st.conf ? ' selected' : '') + '>' +
        CONFIGS[k].nombre + '</option>';
    }

    el.innerHTML =
      '<div class="mpi-sim-cab">Configurador de amplificador operacional</div>' +
      '<div class="oa-cuerpo">' +
        '<div class="oa-panel-izq">' +
          '<label class="oa-campo oa-conf">Configuración' +
            '<select class="oa-sel-conf">' + opciones + '</select></label>' +
          '<div class="oa-entradas"></div>' +
          '<div class="oa-resist">' +
            '<label class="oa-campo"><span class="oa-campo-tit">R1 = <strong class="oa-r1val"></strong></span>' +
              '<input type="range" class="oa-r1" min="1" max="100" step="1" value="1"></label>' +
            '<label class="oa-campo"><span class="oa-campo-tit">R2 = <strong class="oa-r2val"></strong></span>' +
              '<input type="range" class="oa-r2" min="1" max="100" step="1" value="9"></label>' +
          '</div>' +
          '<label class="oa-campo oa-alim">Alimentación' +
            '<select class="oa-sel-alim">' +
              '<option value="5,-5" selected>V_cc = +5 V / V_ee = −5 V</option>' +
              '<option value="15,-15">V_cc = +15 V / V_ee = −15 V</option>' +
              '<option value="5,0">V_cc = +5 V / V_ee = 0 V (unipolar)</option>' +
              '<option value="3.3,0">V_cc = +3,3 V / V_ee = 0 V (unipolar)</option>' +
            '</select></label>' +
        '</div>' +
        '<div class="oa-panel-der">' +
          '<div class="oa-esquema"></div>' +
          '<div class="oa-formula"></div>' +
          '<div class="oa-calculo nota"></div>' +
          '<div class="oa-salida">' +
            '<div class="oa-vo-tit">Salida V<sub>o</sub></div>' +
            '<div class="oa-barra"><div class="oa-barra-cero"></div><div class="oa-barra-nivel"></div></div>' +
            '<div class="oa-vo-val"></div>' +
          '</div>' +
          '<div class="oa-aviso"></div>' +
        '</div>' +
      '</div>' +
      '<pre class="oa-codigo"><code class="lang-python"></code></pre>';

    var selConf = el.querySelector('.oa-sel-conf');
    var selAlim = el.querySelector('.oa-sel-alim');
    var slR1 = el.querySelector('.oa-r1');
    var slR2 = el.querySelector('.oa-r2');
    var divEnt = el.querySelector('.oa-entradas');
    var divResist = el.querySelector('.oa-resist');

    // construye los sliders de tensión de entrada según la config activa
    function pintarEntradas() {
      var usa = CONFIGS[st.conf].usa;
      var h = '';
      function sliderV(clave, etiqueta) {
        return '<label class="oa-campo"><span class="oa-campo-tit">' + etiqueta + ' = <strong class="oa-' + clave + 'val"></strong></span>' +
          '<input type="range" class="oa-' + clave + '" min="-5000" max="5000" step="50" value="' +
          Math.round(st[clave] * 1000) + '"></label>';
      }
      if (usa.vin) h += sliderV('vin', 'V<sub>in</sub>');
      if (usa.v1) h += sliderV('v1', 'v<sub>1</sub>');
      if (usa.v2) h += sliderV('v2', 'v<sub>2</sub>');
      if (usa.vref) h += sliderV('vref', 'V<sub>ref</sub>');
      divEnt.innerHTML = h;

      // las resistencias solo importan en no inv / inv / diferencial
      var usaR = (st.conf === 'noinv' || st.conf === 'inv' || st.conf === 'dif');
      divResist.style.display = usaR ? '' : 'none';

      // reengancha los listeners de los sliders de tensión recién creados
      ['vin', 'v1', 'v2', 'vref'].forEach(function (clave) {
        var sl = el.querySelector('.oa-' + clave);
        if (sl) sl.addEventListener('input', function () {
          st[clave] = parseInt(sl.value, 10) / 1000;
          recalcular();
        });
      });
    }

    function recalcular() {
      var c = CONFIGS[st.conf];

      // refresca etiquetas numéricas de los controles
      ['vin', 'v1', 'v2', 'vref'].forEach(function (clave) {
        var lab = el.querySelector('.oa-' + clave + 'val');
        if (lab) lab.textContent = fmtV(st[clave]);
      });
      el.querySelector('.oa-r1val').textContent = fmtR(st.r1);
      el.querySelector('.oa-r2val').textContent = fmtR(st.r2);

      // esquema + fórmula + cálculo
      el.querySelector('.oa-esquema').innerHTML = esquemaSVG(c.svg);
      el.querySelector('.oa-formula').innerHTML = '<span class="oa-formula-tit">Fórmula activa:</span> ' + c.formula;
      el.querySelector('.oa-calculo').innerHTML = c.calculo(st);

      // Vo ideal -> saturación a [Vee, Vcc]
      var voIdeal = c.vo(st);
      var vo = voIdeal;
      var satura = false, donde = '';
      if (vo > st.vcc) { vo = st.vcc; satura = true; donde = 'alto (V_cc = ' + fmtV(st.vcc) + ')'; }
      else if (vo < st.vee) { vo = st.vee; satura = true; donde = 'bajo (V_ee = ' + fmtV(st.vee) + ')'; }

      el.querySelector('.oa-vo-val').innerHTML = '<strong>V<sub>o</sub> = ' + fmtV(vo) + '</strong>' +
        (satura ? ' <span class="oa-vo-sat">(saturada)</span>' : '');

      // barra: posición de Vo dentro de [Vee, Vcc]
      var rango = st.vcc - st.vee || 1;
      var pos = Math.max(0, Math.min(100, (vo - st.vee) / rango * 100));
      var posCero = Math.max(0, Math.min(100, (0 - st.vee) / rango * 100));
      var nivel = el.querySelector('.oa-barra-nivel');
      nivel.style.left = Math.min(pos, posCero) + '%';
      nivel.style.width = Math.abs(pos - posCero) + '%';
      nivel.style.background = vo >= 0 ? 'var(--acento)' : 'var(--naranja)';
      el.querySelector('.oa-barra-cero').style.left = posCero + '%';

      var aviso = el.querySelector('.oa-aviso');
      if (satura) {
        aviso.className = 'oa-aviso oa-aviso-on';
        aviso.innerHTML = '⚠ La salida ideal sería ' + fmtV(voIdeal) +
          ', pero el AO <strong>satura</strong> en el raíl ' + donde +
          '. La salida real se queda recortada en <strong>' + fmtV(vo) + '</strong>.';
      } else {
        aviso.className = 'oa-aviso';
        aviso.innerHTML = '';
      }

      pintarCodigo(vo, voIdeal, satura);
    }

    function pintarCodigo(vo, voIdeal, satura) {
      var c = CONFIGS[st.conf];
      var lineas = [];
      lineas.push('# Configurador de AO en Raspberry Pi 4 (modelo ideal, salida saturada)');
      lineas.push('Vcc, Vee = ' + pyNum(st.vcc) + ', ' + pyNum(st.vee) + '  # alimentacion');
      if (st.conf === 'noinv') {
        lineas.push('R1, R2 = ' + pyNum(st.r1 * 1000) + ', ' + pyNum(st.r2 * 1000) + '  # ohmios');
        lineas.push('Vin = ' + pyNum(st.vin));
        lineas.push('vo = Vin * (1 + R2 / R1)');
      } else if (st.conf === 'inv') {
        lineas.push('R1, R2 = ' + pyNum(st.r1 * 1000) + ', ' + pyNum(st.r2 * 1000) + '  # ohmios');
        lineas.push('Vin = ' + pyNum(st.vin));
        lineas.push('vo = -Vin * (R2 / R1)');
      } else if (st.conf === 'buffer') {
        lineas.push('Vin = ' + pyNum(st.vin));
        lineas.push('vo = Vin');
      } else if (st.conf === 'sumador') {
        lineas.push('v1, v2 = ' + pyNum(st.v1) + ', ' + pyNum(st.v2) + '  # R iguales');
        lineas.push('vo = -(v1 + v2)');
      } else if (st.conf === 'dif') {
        lineas.push('R1, R2 = ' + pyNum(st.r1 * 1000) + ', ' + pyNum(st.r2 * 1000) + '  # ohmios');
        lineas.push('v1, v2 = ' + pyNum(st.v1) + ', ' + pyNum(st.v2));
        lineas.push('vo = (R2 / R1) * (v2 - v1)');
      } else if (st.conf === 'comp') {
        lineas.push('Vin, Vref = ' + pyNum(st.vin) + ', ' + pyNum(st.vref));
        lineas.push('vo = Vcc if Vin > Vref else Vee');
      }
      lineas.push('vo = max(Vee, min(Vcc, vo))   # satura a [Vee, Vcc]');
      lineas.push('print(round(vo, 3))           # -> ' + pyNum(vo) +
        (satura ? '  (recortada desde ' + pyNum(voIdeal) + ')' : ''));
      el.querySelector('.oa-codigo code').textContent = lineas.join('\n');
      if (MPI.resaltarTodo) MPI.resaltarTodo(el);
    }

    // --- listeners de controles persistentes --------------------------------
    selConf.addEventListener('change', function () {
      st.conf = selConf.value;
      pintarEntradas();
      recalcular();
    });
    selAlim.addEventListener('change', function () {
      var p = selAlim.value.split(',');
      st.vcc = parseFloat(p[0]);
      st.vee = parseFloat(p[1]);
      recalcular();
    });
    slR1.addEventListener('input', function () { st.r1 = parseInt(slR1.value, 10); recalcular(); });
    slR2.addEventListener('input', function () { st.r2 = parseInt(slR2.value, 10); recalcular(); });

    pintarEntradas();
    recalcular();
  };
})();
