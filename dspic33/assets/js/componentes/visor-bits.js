/*
 * Componente "visor-bits": visualizador interactivo de un registro de campos
 * de bits del PIC32. Reconstruye (de forma manipulable) las tablas de bits que
 * Docling corrompió. Se instancia con un registro de datos/registros.js.
 *
 * Uso en el contenido:
 *   <div class="mpi-mount" data-componente="visor-bits"
 *        data-config='{"registro":"T1CON","valor":"0x8010"}'></div>
 *
 * Interacción: clic en un bit para conmutar 0/1, o escribir un valor hex.
 * El panel inferior decodifica cada campo y su significado.
 */
window.MPI = window.MPI || {};
MPI.componentes = MPI.componentes || {};

(function () {
  // Paleta para distinguir campos (se asigna por orden de aparición).
  var PALETA = ['#4ec9b0', '#569cd6', '#c586c0', '#dcdcaa', '#ce9178', '#9cdcfe', '#d16969', '#b5cea8'];

  function hex(v, ancho) {
    var n = ancho > 16 ? 8 : 4;
    var s = (v >>> 0).toString(16).toUpperCase();
    while (s.length < n) s = '0' + s;
    return '0x' + s;
  }

  function valorCampo(valor, campo) {
    if (campo.bit != null) return (valor >>> campo.bit) & 1;
    var hi = campo.bits[0], lo = campo.bits[1];
    var mask = (1 << (hi - lo + 1)) - 1;
    return (valor >>> lo) & mask;
  }

  MPI.componentes['visor-bits'] = function (el, config) {
    var reg = MPI.registros[config.registro];
    if (!reg) { el.innerHTML = '<p class="mpi-error">Registro desconocido: ' + config.registro + '</p>'; return; }

    var ancho = reg.ancho || 16;
    var valor = config.valor != null ? (parseInt(config.valor, 16) || parseInt(config.valor, 10) || 0) : 0;

    // Mapa bit -> campo (y color por campo).
    var bitCampo = new Array(ancho).fill(null);
    reg.campos.forEach(function (c, i) {
      c._color = PALETA[i % PALETA.length];
      if (c.bit != null) bitCampo[c.bit] = c;
      else for (var b = c.bits[1]; b <= c.bits[0]; b++) bitCampo[b] = c;
    });

    // Restricción opcional: solo algunos campos son editables
    // (config.editables = ["ON", "BRGH", ...]); el resto se muestra fijo.
    var editables = config.editables || null;
    var bitEditable = null;
    if (editables) {
      bitEditable = {};
      reg.campos.forEach(function (c) {
        if (editables.indexOf(c.nombre) === -1) return;
        if (c.bit != null) bitEditable[c.bit] = true;
        else for (var b = c.bits[1]; b <= c.bits[0]; b++) bitEditable[b] = true;
      });
    }

    el.classList.add('mpi-visor-bits');
    el.innerHTML =
      '<div class="vb-cab">' +
        '<span class="vb-nombre">' + reg.nombre + '</span>' +
        '<span class="vb-titulo">' + (reg.titulo || '') + '</span>' +
      '</div>' +
      (reg.nota ? '<p class="vb-nota">' + reg.nota + '</p>' : '') +
      '<div class="vb-rejilla" role="group" aria-label="Bits de ' + reg.nombre + '"></div>' +
      '<div class="vb-controles">' +
        '<label>Valor (hex): <input class="vb-hex" type="text" spellcheck="false" value="' + hex(valor, ancho) + '"></label>' +
        '<button class="vb-cero" type="button">Poner a 0</button>' +
      '</div>' +
      '<table class="vb-decod"><thead><tr><th>Campo</th><th>Bits</th><th>Valor</th><th>Significado</th></tr></thead><tbody></tbody></table>';

    var rejilla = el.querySelector('.vb-rejilla');
    var inputHex = el.querySelector('.vb-hex');
    var tbody = el.querySelector('.vb-decod tbody');

    // Construir celdas de bits (MSB a la izquierda).
    var celdas = [];
    for (var b = ancho - 1; b >= 0; b--) {
      var campo = bitCampo[b];
      var celda = document.createElement('button');
      celda.type = 'button';
      celda.className = 'vb-bit' + (campo ? '' : ' vb-reservado');
      celda.setAttribute('data-bit', b);
      if (campo) {
        celda.style.borderColor = campo._color;
        celda.title = campo.nombre + ' — ' + campo.desc;
        if (bitEditable && !bitEditable[b]) {
          celda.classList.add('vb-fijo');
          celda.title += ' (fijo en este ejemplo)';
        }
      } else {
        celda.title = 'Bit ' + b + ' (no usado)';
        celda.disabled = true;
      }
      celda.innerHTML = '<span class="vb-bn">' + b + '</span><span class="vb-bv">0</span>';
      rejilla.appendChild(celda);
      celdas[b] = celda;
    }

    function pintar() {
      // Bits
      for (var b = 0; b < ancho; b++) {
        var on = (valor >>> b) & 1;
        var c = celdas[b];
        c.querySelector('.vb-bv').textContent = on;
        c.classList.toggle('vb-on', !!on);
      }
      inputHex.value = hex(valor, ancho);
      // Decodificación
      tbody.innerHTML = '';
      reg.campos.forEach(function (campo) {
        var v = valorCampo(valor, campo);
        var bits = campo.bit != null ? campo.bit : (campo.bits[0] + ':' + campo.bits[1]);
        var signif = campo.valores && campo.valores[v] != null ? campo.valores[v] : '';
        var tr = document.createElement('tr');
        if (editables && editables.indexOf(campo.nombre) === -1) tr.className = 'vb-fijo';
        tr.innerHTML =
          '<td><span class="vb-chip" style="background:' + campo._color + '"></span>' + campo.nombre + '</td>' +
          '<td>' + bits + '</td>' +
          '<td class="vb-val">' + v + '</td>' +
          '<td>' + signif + '</td>';
        tbody.appendChild(tr);
      });
    }

    rejilla.addEventListener('click', function (e) {
      var btn = e.target.closest('.vb-bit');
      if (!btn || btn.disabled) return;
      var b = parseInt(btn.getAttribute('data-bit'), 10);
      if (bitEditable && !bitEditable[b]) return;
      valor = (valor ^ (1 << b)) >>> 0;
      pintar();
    });

    if (editables) {
      inputHex.readOnly = true;
      el.querySelector('.vb-cero').style.display = 'none';
      var hint = document.createElement('span');
      hint.className = 'vb-edit-hint';
      hint.textContent = 'Campos editables: ' + editables.join(', ') + ' (el resto no se toca en la asignatura)';
      el.querySelector('.vb-controles').appendChild(hint);
    }

    inputHex.addEventListener('change', function () {
      var v = parseInt(inputHex.value, 16);
      if (isNaN(v)) { pintar(); return; }
      var maxBit = ancho - 1;
      valor = (v & (ancho >= 32 ? 0xFFFFFFFF : (Math.pow(2, ancho) - 1))) >>> 0;
      pintar();
    });

    el.querySelector('.vb-cero').addEventListener('click', function () { valor = 0; pintar(); });

    pintar();
  };
})();
