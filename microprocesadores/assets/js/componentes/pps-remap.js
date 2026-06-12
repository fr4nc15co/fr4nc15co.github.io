/*
 * Componente "pps-remap": explorador del Peripheral Pin Select para la entrada
 * de reloj externo de los temporizadores (T2CK–T5CK). El usuario elige la
 * señal y el pin remapeable; el componente muestra el valor de TxCKR y anima
 * la secuencia SYSKEY de desbloqueo/bloqueo, generando el código C.
 *
 * Datos: MPI.ppsTimers (datos/pps.js).
 */
window.MPI = window.MPI || {};
MPI.componentes = MPI.componentes || {};

(function () {
  MPI.componentes['pps-remap'] = function (el, config) {
    var señales = Object.keys(MPI.ppsTimers);
    var señalSel = config.señal && MPI.ppsTimers[config.señal] ? config.señal : 'T3CK';
    var pinIdx = 1; // por defecto el segundo pin (suele ser un RPB cómodo)
    var paso = -1;  // -1 = sin ejecutar; 0..3 = línea resaltada de la secuencia

    el.classList.add('mpi-pps');
    el.innerHTML =
      '<div class="pps-cab">' +
        '<label>Entrada de reloj: <select class="pps-señal"></select></label>' +
        '<span class="pps-estado pps-bloqueado">🔒 bloqueado</span>' +
      '</div>' +
      '<p class="pps-ayuda">Elige a qué pin remapeable conectar la entrada (haz clic):</p>' +
      '<div class="pps-pines" role="group"></div>' +
      '<div class="pps-acc">' +
        '<button type="button" class="pps-paso">▶ Ejecutar secuencia SYSKEY</button>' +
        '<button type="button" class="pps-reset">↺ Reiniciar</button>' +
      '</div>' +
      '<pre class="pps-codigo"><code class="lang-c"></code></pre>';

    var selSeñal = el.querySelector('.pps-señal');
    señales.forEach(function (s) {
      var o = document.createElement('option'); o.value = s; o.textContent = s + ' (' + MPI.ppsTimers[s].reg + ')';
      if (s === señalSel) o.selected = true; selSeñal.appendChild(o);
    });
    var divPines = el.querySelector('.pps-pines');
    var badge = el.querySelector('.pps-estado');
    var codeEl = el.querySelector('.pps-codigo code');
    var btnPaso = el.querySelector('.pps-paso');

    function pintarPines() {
      var pines = MPI.ppsTimers[señalSel].pines;
      divPines.innerHTML = '';
      pines.forEach(function (p, i) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'pps-pin' + (i === pinIdx ? ' pps-pin-sel' : '');
        b.setAttribute('data-i', i);
        b.innerHTML = '<span class="pps-pin-nom">' + p.pin + '</span><span class="pps-pin-val">' + MPI.ppsTimers[señalSel].reg + ' = ' + p.v + '</span>';
        divPines.appendChild(b);
      });
    }

    function lineas() {
      var info = MPI.ppsTimers[señalSel];
      var pin = info.pines[pinIdx];
      return [
        { c: 'SYSKEY = ' + MPI.SYSKEY.unlock1 + ';   // 1) Desbloquear PPS', estado: 'bloqueado' },
        { c: 'SYSKEY = ' + MPI.SYSKEY.unlock2 + ';   // 2) ...segundo valor', estado: 'desbloqueado' },
        { c: info.reg + ' = ' + pin.v + ';' + relleno(info.reg, pin.v) + '// 3) ' + señalSel + ' -> ' + pin.pin, estado: 'desbloqueado' },
        { c: 'SYSKEY = ' + MPI.SYSKEY.lock + ';   // 4) Bloquear PPS de nuevo', estado: 'bloqueado' }
      ];
    }
    function relleno(reg, v) { var s = reg + ' = ' + v + ';'; var r = '                '.slice(Math.min(s.length, 15)); return r + ' '; }

    function pintarCodigo() {
      var L = lineas();
      var html = L.map(function (ln, i) {
        var cls = (paso === i) ? 'pps-linea-activa' : (paso > i ? 'pps-linea-hecha' : '');
        return '<span class="pps-linea ' + cls + '">' + escapar(ln.c) + '</span>';
      }).join('\n');
      codeEl.innerHTML = html;
      // Estado del candado según el último paso ejecutado
      var est = paso >= 0 ? L[paso].estado : 'bloqueado';
      var desbloq = est === 'desbloqueado';
      badge.textContent = desbloq ? '🔓 desbloqueado' : '🔒 bloqueado';
      badge.className = 'pps-estado ' + (desbloq ? 'pps-desbloqueado' : 'pps-bloqueado');
      btnPaso.textContent = paso < 0 ? '▶ Ejecutar secuencia SYSKEY' : (paso >= 3 ? '✓ secuencia completa' : '▶ Siguiente paso (' + (paso + 1) + '/4)');
      btnPaso.disabled = paso >= 3;
    }
    function escapar(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

    function refresco() { pintarPines(); pintarCodigo(); }

    selSeñal.addEventListener('change', function () { señalSel = selSeñal.value; pinIdx = 1; paso = -1; refresco(); });
    divPines.addEventListener('click', function (e) {
      var b = e.target.closest('.pps-pin'); if (!b) return;
      pinIdx = parseInt(b.getAttribute('data-i'), 10); paso = -1; refresco();
    });
    btnPaso.addEventListener('click', function () { if (paso < 3) { paso++; pintarCodigo(); } });
    el.querySelector('.pps-reset').addEventListener('click', function () { paso = -1; pintarCodigo(); });

    refresco();
  };
})();
