/*
 * Componente "sim-adc-scan": escaneo multicanal del AD (sección 9.9).
 * Marcas qué canales ANx entran en el barrido (AD1CSSL); el secuenciador los
 * mide solo, en orden de canal creciente, y deja cada resultado en
 * ADC1BUF0, BUF1, … EN ORDEN DE BARRIDO (no indexado por nº de canal). El
 * punto clave del tema: ADC1BUFk es el k-ésimo canal escaneado, no ANk.
 * Coherente con el ejemplo AN0–AN5 → AD1CSSL = 0x003F, SMPI = 5.
 *
 * Uso: <div class="mpi-mount" data-componente="sim-adc-scan" data-config='{}'></div>
 */
window.MPI = window.MPI || {};
MPI.componentes = MPI.componentes || {};

(function () {
  var VREF = 3.3, Q = VREF / 1024;
  // Canales AN0..AN7 con una tensión simulada fija (determinista) por sensor.
  var V = [1.65, 0.82, 2.40, 3.10, 0.33, 2.05, 1.20, 2.75];
  var NCAN = V.length;

  function code(v) { return Math.min(1023, Math.round(v / Q)); }
  function fmtV(v) { return v.toFixed(2).replace('.', ',') + ' V'; }
  function hex4(d) {
    var s = (d >>> 0).toString(16).toUpperCase();
    while (s.length < 4) s = '0' + s;
    return '0x' + s;
  }

  MPI.componentes['sim-adc-scan'] = function (el, cfg) {
    var sel = [true, true, true, true, true, true, false, false];   // AN0–AN5
    var buffers = [];   // {canal, valor} en orden de barrido, se llena al animar
    var paso = -1, timer = null;

    el.classList.add('mpi-adc-scan');
    el.innerHTML =
      '<div class="mpi-sim-cab">Escaneo multicanal: varios sensores con un solo AD</div>' +
      '<p class="acs-intro">Marca los canales que entran en el barrido (cada bit de ' +
        '<code class="reg">AD1CSSL</code>). El secuenciador los mide solo, <strong>en orden de ' +
        'canal creciente</strong>, y deja cada resultado en <code class="reg">ADC1BUF0</code>, ' +
        '<code class="reg">BUF1</code>… <strong>en orden de barrido</strong>.</p>' +
      '<div class="acs-canales"></div>' +
      '<div class="acs-cfg"></div>' +
      '<div class="acs-botones">' +
        '<button type="button" class="acs-run">Ejecutar barrido ▶</button>' +
        '<button type="button" class="acs-reset">Reiniciar ↺</button>' +
      '</div>' +
      '<div class="acs-cuerpo">' +
        '<div class="acs-col acs-orden"><div class="acs-coltit">Barrido (orden de canal)</div><div class="acs-lista-c"></div></div>' +
        '<div class="acs-col acs-bufs"><div class="acs-coltit">Buffer del AD</div><div class="acs-lista-b"></div></div>' +
      '</div>' +
      '<div class="acs-estado nota"></div>' +
      '<pre class="acs-codigo"><code class="lang-c"></code></pre>';

    function orden() {
      var o = [];
      for (var x = 0; x < NCAN; x++) if (sel[x]) o.push(x);
      return o;
    }

    function pintar() {
      var o = orden();
      // chips de canales
      var chips = '';
      for (var x = 0; x < NCAN; x++) {
        chips += '<button type="button" class="acs-chip' + (sel[x] ? ' acs-sel' : '') +
          '" data-c="' + x + '">AN' + x + '<small>' + fmtV(V[x]) + '</small></button>';
      }
      el.querySelector('.acs-canales').innerHTML = chips;

      // configuración
      var mask = 0;
      o.forEach(function (x) { mask |= (1 << x); });
      var smpi = o.length > 0 ? o.length - 1 : 0;
      el.querySelector('.acs-cfg').innerHTML = o.length === 0
        ? '<span class="acs-warn">Marca al menos un canal.</span>'
        : '<code class="reg">AD1CSSL</code> = <strong>' + hex4(mask) + '</strong> · ' +
          '<code class="reg">SMPI</code> = <strong>' + smpi + '</strong> (' + o.length +
          ' conversiones por barrido) · <code class="reg">CSCNA</code> = 1';

      // lista de canales en orden de barrido
      var lc = '';
      o.forEach(function (x, k) {
        var act = (k === paso) ? ' acs-activo' : '';
        var hecho = (k < paso || (k <= paso && paso >= o.length)) ? ' acs-hecho' : '';
        lc += '<div class="acs-citem' + act + hecho + '" data-k="' + k + '">' +
          '<span class="acs-cn">AN' + x + '</span><span class="acs-cv">' + fmtV(V[x]) +
          ' → ' + code(V[x]) + '</span></div>';
      });
      el.querySelector('.acs-lista-c').innerHTML = lc || '<div class="acs-vacio">—</div>';

      // buffers
      var lb = '';
      o.forEach(function (x, k) {
        var lleno = !!buffers[k];
        var act = (k === paso) ? ' acs-activo' : '';
        lb += '<div class="acs-bitem' + act + (lleno ? ' acs-lleno' : '') + '">' +
          '<span class="acs-bn">ADC1BUF' + k + '</span>' +
          '<span class="acs-bv">' + (lleno ? '← AN' + buffers[k].canal + ' = ' + buffers[k].valor : '—') + '</span>' +
          '</div>';
      });
      el.querySelector('.acs-lista-b').innerHTML = lb || '<div class="acs-vacio">—</div>';

      // estado
      var est;
      if (o.length === 0) est = 'Sin canales seleccionados.';
      else if (paso < 0) est = 'Listo. Pulsa «Ejecutar barrido» para que el AD recorra los ' + o.length + ' canales.';
      else if (paso < o.length) est = 'Midiendo el canal ' + (paso + 1) + ' de ' + o.length +
        ': <strong>AN' + o[paso] + '</strong> → su resultado va a <strong>ADC1BUF' + paso + '</strong>.';
      else est = '✔ Barrido completo: ' + o.length + ' conversiones. Se alcanza SMPI+1 → salta la ' +
        'interrupción del AD (<code class="reg">AD1IF</code>, vector 23). ' +
        (o.some(function (c, k) { return c !== k; })
          ? '<br>Fíjate: <strong>ADC1BUF' + (o.length - 1) + ' es AN' + o[o.length - 1] +
            '</strong>, no AN' + (o.length - 1) + '. El índice del buffer es la <em>posición en el barrido</em>, no el número de canal.'
          : '');
      el.querySelector('.acs-estado').innerHTML = est;

      // código
      var comaCh = o.map(function (x) { return 'AN' + x; }).join(', ');
      var cod = el.querySelector('.acs-codigo code');
      if (o.length === 0) { cod.textContent = ''; }
      else {
        var lectura = o.map(function (x, k) { return 'ADC1BUF' + k; }).join(' + ');
        cod.textContent =
          'AD1CON2 = (' + smpi + ' << 2) | (1 << 10);   // SMPI = ' + smpi + ', CSCNA = 1\n' +
          'AD1CSSL = ' + hex4(mask) + ';                  // escanea ' + comaCh + '\n\n' +
          '// En la ISR, los resultados estan en ORDEN DE BARRIDO:\n' +
          'suma = ' + lectura + ';';
      }
      if (MPI.resaltarTodo) MPI.resaltarTodo(el);

      el.querySelector('.acs-run').disabled = (o.length === 0);
    }

    function reinicia() {
      if (timer) { clearInterval(timer); timer = null; }
      buffers = []; paso = -1;
      pintar();
    }

    function ejecuta() {
      var o = orden();
      if (o.length === 0) return;
      if (timer) { clearInterval(timer); timer = null; }
      buffers = []; paso = 0; pintar();
      timer = setInterval(function () {
        var oo = orden();
        if (paso < oo.length) {
          var x = oo[paso];
          buffers[paso] = { canal: x, valor: code(V[x]) };
          paso++;
          pintar();
        } else {
          clearInterval(timer); timer = null;
          pintar();
        }
      }, 650);
    }

    el.querySelector('.acs-canales').addEventListener('click', function (e) {
      var b = e.target.closest('.acs-chip');
      if (!b) return;
      var x = parseInt(b.getAttribute('data-c'), 10);
      sel[x] = !sel[x];
      reinicia();
    });
    el.querySelector('.acs-run').addEventListener('click', ejecuta);
    el.querySelector('.acs-reset').addEventListener('click', reinicia);

    pintar();
  };
})();
