/*
 * Componente "vis-muestreo-mcd": periodo de muestreo de un sistema muestreado como
 * máximo común divisor de los periodos de sus tareas (libro, cap. 19, 19.2 y 19.3).
 *
 * Uso:
 *   <div class="mpi-mount" data-componente="vis-muestreo-mcd"
 *        data-config='{"tareas":[{"nombre":"Resolución de la medida","periodoUs":1000},
 *                                {"nombre":"Pulso de salida","periodoUs":350}],"fcy":40000000}'></div>
 *
 * Claves de data-config (todas opcionales):
 *   tareas : lista de {nombre, periodoUs} (1 a 6 tareas; periodo en µs, hasta 3 decimales).
 *            Por defecto, el ejemplo del libro: 1000 µs y 350 µs.
 *   fcy    : 40000000 (por defecto) o 39613750 (valor exacto). Solo esos dos.
 *
 * Calcula:
 *   - Tmuestreo = mcd de los periodos, con los pasos del algoritmo de Euclides
 *     (internamente en ns enteros, para admitir periodos como 6,4 µs).
 *   - PR1 = Tmuestreo·FCY/presc con el menor pre-escalado (1, 8, 64, 256) que quepa
 *     en 16 bits; T1CON = 0x8000 | (TCKPS << 4). Convención del libro: periodo = PR1
 *     cuentas (el datasheet da PR1 + 1; se indica la diferencia).
 *   - Ticks de cada tarea = Ti / Tmuestreo; interrupciones por segundo = 1/Tmuestreo;
 *     ciclos de instrucción entre dos interrupciones = Tmuestreo·FCY.
 *   - Línea de tiempo SVG de 0 al mcm (o una ventana si el mcm es muy grande) con los
 *     ticks del Timer 1 y las ejecuciones de cada tarea; cursor por tick.
 *   - Esqueleto de la ISR con un contador por tarea (estilo de la Figura 112).
 * Libro: mcd(1000 µs, 350 µs) = 50 µs → PR1 = 2000, T1CON = 0x8000, 20 y 7 ticks,
 *        20 000 interrupciones/s.
 */
window.MPI = window.MPI || {};
MPI.componentes = MPI.componentes || {};

(function () {
  var FCY_APROX = 40000000;
  var FCY_EXACTO = 39613750;
  var PRESC = [1, 8, 64, 256];          // TCKPS = 00, 01, 10, 11
  var MAX_TAREAS = 6;
  var MAX_NS = 10e9;                    // 10 s por tarea
  var MAX_TICKS_DIBUJO = 300;           // por encima, los ticks se dibujan como banda
  var MAX_MARCAS = 400;
  var NBSP = '\u00A0';
  var COLORES = ['var(--acento)', 'var(--amarillo)', 'var(--morado)', 'var(--azul-cl)', 'var(--naranja)', 'var(--acento-2)'];
  var EJEMPLO = [{ nombre: 'Resolución de la medida', periodoUs: 1000 }, { nombre: 'Pulso de salida', periodoUs: 350 }];
  var EJEMPLO_FECHADO = [{ nombre: 'Evento 1', periodoUs: 1000000 }, { nombre: 'Evento 2', periodoUs: 350000 }];

  // ---------- Formato español ----------
  function agrupar(entero) {
    var s = String(entero);
    var neg = s.charAt(0) === '-';
    if (neg) s = s.slice(1);
    if (s.length >= 5) s = s.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
    return (neg ? '−' : '') + s;
  }
  // x con hasta nd decimales (sin ceros sobrantes), coma decimal.
  function num(x, nd) {
    if (!isFinite(x)) return '—';
    var s = Math.abs(x).toFixed(nd == null ? 3 : nd);
    if (s.indexOf('.') >= 0) s = s.replace(/0+$/, '').replace(/\.$/, '');
    var p = s.split('.');
    return (x < 0 && Number(s) !== 0 ? '−' : '') + agrupar(p[0]) + (p[1] ? ',' + p[1] : '');
  }
  function us(ns) { return num(ns / 1000, 3) + NBSP + 'µs'; }
  // Tiempo legible (ns enteros) eligiendo la unidad.
  function fmtT(ns) {
    var a = Math.abs(ns);
    if (a >= 1e9) return num(ns / 1e9, 4) + NBSP + 's';
    if (a >= 1e6) return num(ns / 1e6, 4) + NBSP + 'ms';
    return num(ns / 1e3, 3) + NBSP + 'µs';
  }
  function hex4(v) {
    var s = ((v >>> 0) & 0xFFFF).toString(16).toUpperCase();
    while (s.length < 4) s = '0' + s;
    return '0x' + s;
  }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function normFcy(v) {
    v = Number(v);
    return Math.abs(v - FCY_EXACTO) < 1000 ? FCY_EXACTO : FCY_APROX;
  }
  // Lee un periodo en µs (coma o punto, hasta 3 decimales) y lo devuelve en ns enteros.
  function leerUs(txt) {
    var s = String(txt).replace(/[\s\u00A0\u202F]/g, '').replace(',', '.');
    if (!/^\d+(\.\d{1,3})?$/.test(s) && !/^\.\d{1,3}$/.test(s)) return null;
    var p = s.split('.');
    var ns = parseInt(p[0] || '0', 10) * 1000 + (p[1] ? parseInt((p[1] + '00').slice(0, 3), 10) : 0);
    if (!(ns >= 1 && ns <= MAX_NS)) return null;
    return ns;
  }
  function mcd2(a, b) { while (b) { var r = a % b; a = b; b = r; } return a; }

  var ID = 0;

  MPI.componentes['vis-muestreo-mcd'] = function (el, cfg) {
    cfg = cfg || {};
    var uid = 'vmm' + (++ID);
    var fcy = normFcy(cfg.fcy != null ? cfg.fcy : FCY_APROX);
    var lista = Array.isArray(cfg.tareas) && cfg.tareas.length ? cfg.tareas : EJEMPLO;
    var tareas = [];          // {nombre, txt}
    lista.slice(0, MAX_TAREAS).forEach(function (t) {
      tareas.push({ nombre: String(t && t.nombre != null ? t.nombre : 'Tarea').slice(0, 40), txt: num(Number(t && t.periodoUs), 3) });
    });
    var cursorTick = 0;
    var ultimo = null;        // último resultado (para el cursor)

    el.classList.add('mpi-vis-muestreo-mcd');
    el.innerHTML =
      '<div class="mpi-sim-cab">Periodo de muestreo = mcd de los periodos de las tareas <span class="vmm-cab-sub">sistema muestreado</span></div>' +
      '<div class="vmm-top">' +
        '<label class="vmm-fcy-l" for="' + uid + '-fcy"><span>F<sub>CY</sub></span>' +
          '<select id="' + uid + '-fcy" class="vmm-fcy">' +
            '<option value="' + FCY_APROX + '"' + (fcy === FCY_APROX ? ' selected' : '') + '>40' + NBSP + '000' + NBSP + '000 Hz (libro)</option>' +
            '<option value="' + FCY_EXACTO + '"' + (fcy === FCY_EXACTO ? ' selected' : '') + '>39' + NBSP + '613' + NBSP + '750 Hz (exacto)</option>' +
          '</select></label>' +
        '<div class="vmm-presets">' +
          '<button type="button" class="vmm-btn vmm-ej" data-ej="libro">Ejemplo del libro: 1 ms y 350 µs</button>' +
          '<button type="button" class="vmm-btn vmm-ej" data-ej="fechado">Fechado (Fig. 112): 1 s y 350 ms</button>' +
        '</div>' +
      '</div>' +
      '<div class="vmm-cab-tareas" aria-hidden="true"><span>Tarea</span><span>Periodo o duración (µs)</span></div>' +
      '<div class="vmm-tareas" role="list" aria-label="Tareas del sistema y su periodo"></div>' +
      '<div class="vmm-acc"><button type="button" class="vmm-btn vmm-add">+ Añadir tarea</button> <span class="vmm-ayuda">Hasta ' + MAX_TAREAS +
        ' tareas; periodo en µs con hasta 3 decimales (p. ej. 6,4).</span></div>' +
      '<div class="vmm-res" aria-live="polite"></div>' +
      '<div class="vmm-avisos"></div>' +
      '<div class="vmm-linea">' +
        '<div class="vmm-sub">Línea de tiempo</div>' +
        '<div class="vmm-scroll vmm-svg-caja"></div>' +
        '<div class="vmm-cursor-fila">' +
          '<label for="' + uid + '-cur">Tick</label>' +
          '<input id="' + uid + '-cur" class="vmm-cur" type="range" min="0" max="1" step="1" value="0" aria-describedby="' + uid + '-curtxt">' +
          '<output class="vmm-cur-out" id="' + uid + '-curtxt" for="' + uid + '-cur"></output>' +
        '</div>' +
      '</div>' +
      '<div class="vmm-sub">Esqueleto de la ISR (un contador por tarea, como en la Figura 112)</div>' +
      '<pre class="vmm-codigo"><code class="lang-c"></code></pre>' +
      '<p class="vmm-nota">Regla del libro (19.2): 1) determinar el periodo de cada tarea; 2) escoger el máximo común divisor de todos ellos. ' +
        'Si el periodo de muestreo es demasiado pequeño la CPU no queda libre; si es demasiado grande se pierde resolución. ' +
        'Una duración que hay que medir o generar (el pulso de 350 µs) cuenta igual que un periodo: debe ser un número entero de ticks.</p>';

    var q = function (s) { return el.querySelector(s); };
    var selFcy = q('.vmm-fcy'), tbody = q('.vmm-tareas'), btnAdd = q('.vmm-add');
    var resEl = q('.vmm-res'), avEl = q('.vmm-avisos'), svgCaja = q('.vmm-svg-caja');
    var inCur = q('.vmm-cur'), outCur = q('.vmm-cur-out'), codeEl = q('.vmm-codigo code');

    function pintarFilas() {
      var h = '';
      tareas.forEach(function (t, i) {
        var id = uid + '-t' + i;
        h += '<div class="vmm-fila" role="listitem" data-i="' + i + '">' +
          '<span class="vmm-color" style="background:' + COLORES[i % COLORES.length] + '" aria-hidden="true"></span>' +
          '<input class="vmm-nom" type="text" maxlength="40" spellcheck="false" aria-label="Nombre de la tarea ' + (i + 1) + '" value="' + esc(t.nombre) + '">' +
          '<span class="vmm-per-caja"><input id="' + id + '" class="vmm-per" type="text" inputmode="decimal" spellcheck="false" autocomplete="off" ' +
            'aria-label="Periodo de la tarea ' + (i + 1) + ' en microsegundos" aria-describedby="' + id + '-e" value="' + esc(t.txt) + '">' +
            '<span class="vmm-uni">µs</span></span>' +
          '<span class="vmm-ticks" aria-live="off">—</span>' +
          '<button type="button" class="vmm-btn vmm-del" aria-label="Quitar la tarea ' + (i + 1) + '"' + (tareas.length <= 1 ? ' disabled' : '') + '>✕</button>' +
          '<span class="vmm-err" id="' + id + '-e" role="alert"></span>' +
        '</div>';
      });
      tbody.innerHTML = h;
      btnAdd.disabled = tareas.length >= MAX_TAREAS;
    }

    // Pasos de Euclides de mcd(a, b), en ns.
    function pasosEuclides(a, b) {
      var pasos = [];
      if (a < b) { var t = a; a = b; b = t; }
      while (b) {
        var qq = Math.floor(a / b), r = a % b;
        pasos.push(us(a).replace(NBSP + 'µs', '') + ' = ' + qq + ' · ' + us(b).replace(NBSP + 'µs', '') + ' + ' + us(r).replace(NBSP + 'µs', ''));
        a = b; b = r;
      }
      return { mcd: a, pasos: pasos };
    }

    function calcular() {
      // Leer y validar
      var validas = [];
      var filas = tbody.querySelectorAll('.vmm-fila');
      tareas.forEach(function (t, i) {
        var fila = filas[i];
        var inP = fila.querySelector('.vmm-per'), err = fila.querySelector('.vmm-err');
        var ns = leerUs(t.txt);
        t.ns = ns;
        if (ns == null) {
          inP.setAttribute('aria-invalid', 'true');
          err.textContent = 'Periodo positivo en µs (máx. 10 s, hasta 3 decimales).';
        } else {
          inP.removeAttribute('aria-invalid');
          err.textContent = '';
          validas.push({ i: i, nombre: t.nombre || ('Tarea ' + (i + 1)), ns: ns });
        }
      });
      if (!validas.length) {
        resEl.innerHTML = '<p class="vmm-vacio">Escribe al menos un periodo válido.</p>';
        avEl.innerHTML = ''; svgCaja.innerHTML = ''; codeEl.textContent = ''; outCur.textContent = '';
        ultimo = null;
        return;
      }

      // mcd con pasos
      var g = validas[0].ns, bloques = [];
      for (var k = 1; k < validas.length; k++) {
        var e = pasosEuclides(g, validas[k].ns);
        bloques.push({ a: g, b: validas[k].ns, e: e });
        g = e.mcd;
      }
      // mcm (con tope para no perder precisión)
      var mcm = validas[0].ns, mcmEnorme = false;
      for (k = 1; k < validas.length; k++) {
        mcm = mcm / mcd2(mcm, validas[k].ns) * validas[k].ns;
        if (mcm > 1e15) { mcmEnorme = true; break; }
      }

      // Timer 1
      var cuentasExactas = g * fcy / 1e9;   // a 1:1
      var t1 = null;
      for (k = 0; k < PRESC.length; k++) {
        var c = Math.round(cuentasExactas / PRESC[k]);
        if (c <= 65535) { t1 = { tckps: k, presc: PRESC[k], pr: c, exacto: cuentasExactas / PRESC[k] }; break; }
      }
      var ciclos = cuentasExactas;          // ciclos de instrucción entre interrupciones
      var intPorS = 1e9 / g;

      validas.forEach(function (v) {
        v.ticks = v.ns / g;
        filas[v.i].querySelector('.vmm-ticks').innerHTML = '→ <b>' + agrupar(v.ticks) + '</b> ' + (v.ticks === 1 ? 'tick' : 'ticks');
      });
      tareas.forEach(function (t, i) { if (t.ns == null) filas[i].querySelector('.vmm-ticks').textContent = '—'; });

      // ---- Resultados ----
      var h = '<div class="vmm-bloque"><div class="vmm-bloque-tit">1 · Máximo común divisor (algoritmo de Euclides)</div>';
      if (validas.length === 1) {
        h += '<p class="vmm-pasos-txt">Con una sola tarea, el periodo de muestreo es su propio periodo.</p>';
      } else {
        bloques.forEach(function (b) {
          h += '<div class="vmm-mcd-tit">mcd(' + us(b.a) + ', ' + us(b.b) + ')</div><ol class="vmm-pasos">';
          b.e.pasos.forEach(function (p, j) {
            h += '<li>' + p + (j === b.e.pasos.length - 1 ? ' <span class="vmm-tenue">→ resto 0: el último divisor es el mcd</span>' : '') + '</li>';
          });
          h += '</ol>';
        });
      }
      h += '<div class="vmm-kv"><span>T<sub>muestreo</sub> =</span> <b class="vmm-grande">' + us(g) + '</b>' +
        (mcmEnorme ? '' : ' <span class="vmm-tenue">· mcm = ' + fmtT(mcm) + ' (todas las tareas coinciden de nuevo)</span>') + '</div></div>';

      h += '<div class="vmm-bloque"><div class="vmm-bloque-tit">2 · Timer 1</div>';
      if (!t1) {
        h += '<p class="vmm-mal">T<sub>muestreo</sub> = ' + fmtT(g) + ' no cabe en el Timer 1 de 16 bits ni con pre-escalado 1:256 ' +
          '(máximo ' + fmtT(65535 * 256 * 1e9 / fcy) + '). Usa un timer de 32 bits (Timer2/3) o cuenta varias interrupciones por software.</p>';
      } else if (t1.pr < 1) {
        h += '<p class="vmm-mal">T<sub>muestreo</sub> = ' + fmtT(g) + ' es menor que un ciclo de instrucción (' + num(1e9 / fcy, 3) + ' ns): imposible con el Timer 1.</p>';
      } else {
        var inexacto = Math.abs(t1.exacto - t1.pr) > 1e-6;
        var tReal = t1.pr * t1.presc * 1e9 / fcy;
        h += '<ol class="vmm-pasos">' +
          '<li>T<sub>muestreo</sub> · F<sub>CY</sub> = ' + us(g) + ' · ' + agrupar(fcy) + ' Hz = <b>' + num(cuentasExactas, 4) + '</b> ciclos</li>' +
          (t1.presc > 1 ? '<li>No cabe en 16 bits (&gt; 65' + NBSP + '535): con pre-escalado 1:' + t1.presc + ' → ' + num(cuentasExactas, 4) + ' / ' + t1.presc + ' = <b>' + num(t1.exacto, 4) + '</b></li>' : '') +
          (inexacto ? '<li>No es entero: se redondea a <b>' + agrupar(t1.pr) + '</b></li>' : '') +
          '</ol>' +
          '<div class="vmm-kv"><span>PR1 =</span> <b class="vmm-grande">' + agrupar(t1.pr) + '</b> <span class="vmm-tenue">(' + hex4(t1.pr) + ')</span></div>' +
          '<div class="vmm-kv"><span>T1CON =</span> <b class="vmm-grande">' + hex4(0x8000 | (t1.tckps << 4)) + '</b> <span class="vmm-tenue">TON = 1, pre-escalado 1:' + t1.presc + ' (TCKPS = ' + ((t1.tckps >> 1) & 1) + (t1.tckps & 1) + ')</span></div>' +
          (inexacto ? '<p class="vmm-aviso">Con F<sub>CY</sub> = ' + agrupar(fcy) + ' Hz el periodo no es exacto: PR1 = ' + agrupar(t1.pr) + ' da ' + fmtT(tReal) +
            ' (' + (tReal >= g ? '+' : '−') + num(Math.abs(tReal - g) / g * 100, 3) + NBSP + '%).</p>' : '') +
          '<p class="vmm-tenue vmm-p">Convención del libro: periodo = PR1 cuentas. Según el datasheet la cuenta recorre 0…PR1, es decir, PR1 + 1 cuentas: ' +
            'para ' + fmtT(g) + ' exactos sería PR1 = ' + agrupar(Math.max(0, Math.round(t1.exacto) - 1)) + ' (con ' + agrupar(t1.pr) + ' salen ' +
            fmtT((t1.pr + 1) * t1.presc * 1e9 / fcy) + ').</p>';
      }
      h += '</div>';

      h += '<div class="vmm-bloque"><div class="vmm-bloque-tit">3 · Ticks y carga</div><ul class="vmm-lista">';
      validas.forEach(function (v) {
        h += '<li><span class="vmm-color" style="background:' + COLORES[v.i % COLORES.length] + '" aria-hidden="true"></span>' + esc(v.nombre) + ': ' +
          us(v.ns) + ' / ' + us(g) + ' = <b>' + agrupar(v.ticks) + (v.ticks === 1 ? ' tick' : ' ticks') + '</b></li>';
      });
      h += '</ul>' +
        '<div class="vmm-kv"><span>Interrupciones por segundo</span> <b>' + num(intPorS, 3) + '</b> <span class="vmm-tenue">= 1 / ' + us(g) + '</span></div>' +
        '<div class="vmm-kv"><span>Ciclos de instrucción entre interrupciones</span> <b>' + num(ciclos, 2) + '</b> <span class="vmm-tenue">= T<sub>muestreo</sub> · F<sub>CY</sub></span></div>' +
        '</div>';
      resEl.innerHTML = h;

      // ---- Avisos ----
      var av = '';
      if (ciclos < 200 && t1 && t1.pr >= 1) {
        av += '<p class="vmm-aviso vmm-aviso-mal"><strong>Muestreo muy rápido.</strong> Entre dos interrupciones solo hay ' + num(ciclos, 2) +
          ' ciclos de instrucción: la entrada y salida de la ISR y su código se los comen y la CPU no queda libre (19.2).</p>';
      }
      if (validas.length > 1) {
        var maxT = 0; validas.forEach(function (v) { if (v.ticks > maxT) maxT = v.ticks; });
        if (maxT > 1e5) av += '<p class="vmm-aviso">Alguna tarea necesita ' + agrupar(maxT) + ' ticks: los contadores <code>int</code> de 16 bits del dsPIC llegan a 32' + NBSP + '767 (o 65' + NBSP + '535 sin signo).</p>';
        else if (maxT > 32767) av += '<p class="vmm-aviso">Alguna tarea necesita ' + agrupar(maxT) + ' ticks: no cabe en un <code>int</code> de 16 bits (máx. 32' + NBSP + '767); usa <code>unsigned int</code> o <code>long</code>.</p>';
      }
      avEl.innerHTML = av;

      ultimo = { g: g, mcm: mcm, mcmEnorme: mcmEnorme, validas: validas, t1: t1 };
      dibujar();
      generarCodigo();
    }

    // ---- Línea de tiempo ----
    var X0 = 150, X1 = 700, FILA = 30, Y0 = 34;
    function ventanaTicks() {
      var u = ultimo, mcmT = u.mcmEnorme ? Infinity : Math.round(u.mcm / u.g);
      if (mcmT <= MAX_TICKS_DIBUJO) return { W: mcmT, completo: true };
      var maxT = 0; u.validas.forEach(function (v) { if (v.ticks > maxT) maxT = v.ticks; });
      var W = Math.min(mcmT, Math.max(MAX_TICKS_DIBUJO, 2 * maxT));
      return { W: W, completo: W === mcmT };
    }
    function dibujar() {
      var u = ultimo; if (!u) return;
      var v = ventanaTicks(), W = v.W;
      var n = u.validas.length;
      var alto = Y0 + (n + 1) * FILA + 26;
      var sx = function (t) { return X0 + (X1 - X0) * t / W; };
      var s = '<svg class="vmm-svg" viewBox="0 0 720 ' + alto + '" role="img" aria-labelledby="' + uid + '-svgt">' +
        '<title id="' + uid + '-svgt">Línea de tiempo de 0 a ' + fmtT(W * u.g) + ': un tick cada ' + us(u.g) + '; ' +
        u.validas.map(function (t) { return esc(t.nombre) + ' cada ' + agrupar(t.ticks) + ' ticks'; }).join('; ') + '</title>';
      // fila de ticks
      var yT = Y0;
      s += '<text class="vmm-svg-lab" x="6" y="' + (yT + 4) + '">Ticks T1 (' + us(u.g) + ')</text>';
      s += '<line class="vmm-svg-eje" x1="' + X0 + '" x2="' + X1 + '" y1="' + yT + '" y2="' + yT + '"/>';
      if (W <= MAX_TICKS_DIBUJO) {
        var d = '';
        for (var k = 0; k <= W; k++) { var x = sx(k).toFixed(2); d += 'M' + x + ' ' + (yT - 6) + 'V' + (yT + 6); }
        s += '<path class="vmm-svg-tick" d="' + d + '"/>';
      } else {
        s += '<rect class="vmm-svg-banda" x="' + X0 + '" y="' + (yT - 6) + '" width="' + (X1 - X0) + '" height="12"/>' +
          '<text class="vmm-svg-mini" x="' + ((X0 + X1) / 2) + '" y="' + (yT + 3.5) + '" text-anchor="middle">' + agrupar(W) + ' ticks (demasiado juntos para dibujarlos)</text>';
      }
      // filas de tareas
      u.validas.forEach(function (t, j) {
        var y = Y0 + (j + 1) * FILA, col = COLORES[t.i % COLORES.length];
        var nom = t.nombre.length > 22 ? t.nombre.slice(0, 21) + '…' : t.nombre;
        s += '<text class="vmm-svg-lab" x="6" y="' + (y + 4) + '">' + esc(nom) + '</text>';
        s += '<line class="vmm-svg-eje vmm-svg-eje-2" x1="' + X0 + '" x2="' + X1 + '" y1="' + y + '" y2="' + y + '"/>';
        var marcas = Math.floor(W / t.ticks) + 1;
        if (marcas > MAX_MARCAS) {
          s += '<rect x="' + X0 + '" y="' + (y - 7) + '" width="' + (X1 - X0) + '" height="14" fill="' + col + '" opacity=".35"/>';
        } else {
          var dd = '';
          for (var m = 0; m * t.ticks <= W; m++) { var xm = sx(m * t.ticks).toFixed(2); dd += 'M' + xm + ' ' + (y - 9) + 'V' + (y + 9); }
          s += '<path d="' + dd + '" stroke="' + col + '" stroke-width="2.5" stroke-linecap="round"/>';
        }
      });
      // eje de tiempos
      var yE = Y0 + (n + 1) * FILA - 6;
      s += '<text class="vmm-svg-ax" x="' + X0 + '" y="' + yE + '" text-anchor="start">0</text>' +
        '<text class="vmm-svg-ax" x="' + X1 + '" y="' + yE + '" text-anchor="end">' + fmtT(W * u.g) + (v.completo && !u.mcmEnorme ? ' (mcm)' : '') + '</text>';
      if (!v.completo) {
        s += '<text class="vmm-svg-ax" x="' + ((X0 + X1) / 2) + '" y="' + yE + '" text-anchor="middle">ventana; el mcm (' + (u.mcmEnorme ? '&gt; 10⁶ s' : fmtT(u.mcm)) + ') queda fuera</text>';
      }
      // cursor
      s += '<line class="vmm-svg-cur" x1="0" x2="0" y1="' + (Y0 - 14) + '" y2="' + (Y0 + n * FILA + 12) + '"/>';
      s += '</svg>';
      svgCaja.innerHTML = s;

      inCur.max = String(W);
      if (cursorTick > W) cursorTick = W;
      inCur.value = String(cursorTick);
      moverCursor();
    }
    function moverCursor() {
      var u = ultimo; if (!u) return;
      var W = +inCur.max, k = cursorTick;
      var x = X0 + (X1 - X0) * k / W;
      var cur = svgCaja.querySelector('.vmm-svg-cur');
      if (cur) { cur.setAttribute('x1', x.toFixed(2)); cur.setAttribute('x2', x.toFixed(2)); }
      var quien = u.validas.filter(function (t) { return k % t.ticks === 0; }).map(function (t) { return t.nombre; });
      var txt = 'Tick ' + agrupar(k) + ' (t = ' + fmtT(k * u.g) + '): ' +
        (quien.length ? 'se ejecuta ' + quien.join(' y ') : 'ninguna tarea; la ISR solo incrementa los contadores');
      outCur.textContent = txt;
      inCur.setAttribute('aria-valuetext', txt);
    }

    // ---- Código ----
    function generarCodigo() {
      var u = ultimo; if (!u) return;
      var lim = function (s) { return String(s).replace(/\*\//g, '* /').replace(/[\r\n]+/g, ' '); };
      var c = '// Tmuestreo = mcd(' + u.validas.map(function (t) { return us(t.ns).replace(NBSP, ' '); }).join(', ') + ') = ' + us(u.g).replace(NBSP, ' ') + '\n';
      var decl = u.validas.map(function (t, j) { return 'cont' + (j + 1) + ' = 0'; }).join(', ');
      c += 'unsigned int ' + decl + ';   // un contador de ticks por tarea\n\n';
      c += 'void inicializa_timer1(void) {\n';
      if (u.t1 && u.t1.pr >= 1) {
        c += '    T1CON = 0;\n    TMR1 = 0;\n    PR1 = ' + u.t1.pr + ';            // ' + us(u.g).replace(NBSP, ' ') + ' con F_CY = ' + fcy + ' Hz\n' +
          '    IFS0bits.T1IF = 0;\n    IEC0bits.T1IE = 1;      // ¡habilitar la interrupción!\n' +
          '    T1CON = ' + hex4(0x8000 | (u.t1.tckps << 4)) + ';       // TON = 1, pre-escalado 1:' + u.t1.presc + '\n';
      } else {
        c += '    // El periodo no cabe en el Timer 1 de 16 bits (véase arriba)\n';
      }
      c += '}\n\nvoid __attribute__((interrupt, no_auto_psv)) _T1Interrupt(void) {\n    IFS0bits.T1IF = 0;\n';
      u.validas.forEach(function (t, j) {
        var n = 'cont' + (j + 1);
        c += '    ' + n + '++;\n    if (' + n + ' >= ' + t.ticks + ') {      // ' + lim(t.nombre) + ': cada ' + us(t.ns).replace(NBSP, ' ') + '\n' +
          '        ' + n + ' = 0;\n        /* tarea ' + (j + 1) + ' */\n    }\n';
      });
      c += '}\n';
      codeEl.className = 'lang-c';
      codeEl.textContent = c;
      if (MPI.resaltarTodo) MPI.resaltarTodo(codeEl.parentNode);
    }

    // ---- Eventos ----
    function cargar(lst) {
      tareas = lst.map(function (t) { return { nombre: t.nombre, txt: num(t.periodoUs, 3) }; });
      cursorTick = 0;
      pintarFilas(); calcular();
    }
    selFcy.addEventListener('change', function () { fcy = normFcy(selFcy.value); calcular(); });
    tbody.addEventListener('input', function (e) {
      var fila = e.target.closest ? e.target.closest('.vmm-fila') : null;
      if (!fila) return;
      var i = +fila.getAttribute('data-i');
      if (e.target.classList.contains('vmm-nom')) tareas[i].nombre = e.target.value;
      else if (e.target.classList.contains('vmm-per')) tareas[i].txt = e.target.value;
      calcular();
    });
    tbody.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('.vmm-del') : null;
      if (!b || tareas.length <= 1) return;
      var i = +b.closest('.vmm-fila').getAttribute('data-i');
      tareas.splice(i, 1);
      pintarFilas(); calcular();
      var sig = tbody.querySelectorAll('.vmm-del')[Math.min(i, tareas.length - 1)];
      if (sig && !sig.disabled) sig.focus(); else btnAdd.focus();
    });
    btnAdd.addEventListener('click', function () {
      if (tareas.length >= MAX_TAREAS) return;
      tareas.push({ nombre: 'Tarea ' + (tareas.length + 1), txt: '500' });
      pintarFilas(); calcular();
      var ins = tbody.querySelectorAll('.vmm-nom');
      if (ins.length) ins[ins.length - 1].focus();
    });
    q('.vmm-presets').addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('.vmm-ej') : null;
      if (!b) return;
      cargar(b.getAttribute('data-ej') === 'fechado' ? EJEMPLO_FECHADO : EJEMPLO);
    });
    inCur.addEventListener('input', function () { cursorTick = +inCur.value; moverCursor(); });

    pintarFilas();
    calcular();
  };
})();
