/*
 * Componente "cpp-const-explorer": los tres punteros const de 10.2.1 (pLectura, pFijo,
 * pFijoLectura) sobre el vector valores[LON]. Para cada puntero, «modificar el dato apuntado»
 * y «apuntar a otro sitio» dicen si la línea compila y, si no, el error del compilador (en
 * español, con el original de clang) y la regla: const a la izquierda del * protege el dato;
 * a la derecha, el puntero. Lo que compila se ejecuta sobre el dibujo de la memoria.
 *
 * Uso en el contenido:
 *   <div class="mpi-mount" data-componente="cpp-const-explorer" data-config='{"ejemplo":"10.2.1"}'></div>
 *
 * Mensajes: Apple clang 21 (-std=c++17 -Wall -Wextra), compilando cada línea del libro por
 * separado. Las cinco líneas que el libro marca como ERROR son exactamente las que rechaza.
 */
window.MPI = window.MPI || {};
MPI.componentes = MPI.componentes || {};

(function () {
  var uid = 0;
  var LON = 5;
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function res(linea) { return MPI.resaltarC ? MPI.resaltarC(linea) : esc(linea); }

  var DECL = [
    'const int LON = 5;',
    'int valores[LON] = {};',
    'const int* pLectura = valores;            // el dato apuntado es constante',
    'int* const pFijo = valores;               // el puntero es constante',
    'const int* const pFijoLectura = valores;  // ambos son constantes'];

  function errSoloLectura() {
    return { es: 'error: la variable de solo lectura no es asignable',
             en: 'error: read-only variable is not assignable' };
  }
  function errConst(nombre, tipo) {
    return { es: "error: no se puede asignar a la variable '" + nombre + "', cuyo tipo '" + tipo + "' es const",
             nota: "nota: la variable '" + nombre + "' se declaró const aquí",
             en: "error: cannot assign to variable '" + nombre + "' with const-qualified type '" + tipo + "'" };
  }

  // Punteros del libro. partes: trozos de la declaración con su papel (dato / ptr / resto).
  var PTRS = [
    { n: 'pLectura', tipo: 'const int *', color: 0,
      partes: [['const', 'dato'], [' int', ''], ['*', 'ast'], [' pLectura', '']],
      lee: '<code>pLectura</code> es un puntero (<code>*</code>) a un <code>int</code> <strong>constante</strong>.',
      dato: { linea: '*pLectura = 2;', comentario: 'ERROR: no se puede modificar el dato mediante pLectura', ok: false, err: errSoloLectura(),
        porque: 'El <code>const</code> está a la <strong>izquierda</strong> del <code>*</code>: protege el <strong>dato</strong>. A través de <code>pLectura</code> solo se puede leer (el vector en sí no es const: otro puntero sí podría cambiarlo).' },
      mover: { linea: '++pLectura;', comentario: 'correcto: el puntero puede avanzar', ok: true,
        porque: 'A la derecha del <code>*</code> no hay <code>const</code>: la dirección guardada en <code>pLectura</code> puede cambiar.' } },
    { n: 'pFijo', tipo: 'int *const', color: 1,
      partes: [['int', ''], ['*', 'ast'], [' const', 'ptr'], [' pFijo', '']],
      lee: '<code>pFijo</code> es un puntero <strong>constante</strong> a <code>int</code>.',
      dato: { linea: 'pFijo[0] = 2;', comentario: 'correcto: el dato apuntado no es const', ok: true,
        porque: 'A la izquierda del <code>*</code> no hay <code>const</code>: el dato se puede modificar a través de <code>pFijo</code> (<code>pFijo[0]</code> ≡ <code>*pFijo</code>).' },
      mover: { linea: '++pFijo;', comentario: 'ERROR: pFijo no puede cambiar de dirección', ok: false, err: errConst('pFijo', 'int *const'),
        porque: 'El <code>const</code> está a la <strong>derecha</strong> del <code>*</code>: protege el <strong>puntero</strong>. <code>pFijo</code> apuntará siempre a <code>valores[0]</code>.' } },
    { n: 'pFijoLectura', tipo: 'const int *const', color: 2,
      partes: [['const', 'dato'], [' int', ''], ['*', 'ast'], [' const', 'ptr'], [' pFijoLectura', '']],
      lee: '<code>pFijoLectura</code> es un puntero <strong>constante</strong> a un <code>int</code> <strong>constante</strong>.',
      dato: { linea: '*pFijoLectura = 2;', comentario: 'ERROR: el dato apuntado también es const', ok: false, err: errSoloLectura(),
        porque: 'Hay <code>const</code> a la izquierda del <code>*</code>: el dato está protegido.' },
      mover: { linea: '++pFijoLectura;', comentario: 'ERROR: el puntero es const', ok: false, err: errConst('pFijoLectura', 'const int *const'),
        porque: 'Y también a la derecha: el puntero está protegido. Con <code>pFijoLectura</code> solo se puede leer <code>valores[0]</code>.' } }
  ];
  var OP_LON = { linea: 'LON = 6;', comentario: 'ERROR: LON fue declarado const', ok: false, err: errConst('LON', 'const int'),
    porque: '<code>LON</code> es una constante: se fija al declararla y ya no cambia. Por eso puede usarse como tamaño de <code>valores[LON]</code>.' };

  MPI.componentes['cpp-const-explorer'] = function (el, cfg) {
    cfg = cfg || {};
    var id = 'ce' + (++uid);
    var valores, pos;
    function reiniciarEstado() { valores = [0, 0, 0, 0, 0]; pos = [0, 0, 0]; }
    reiniciarEstado();

    el.classList.add('mpi-cpp-const-explorer');
    var h = '<div class="mpi-sim-cab">Punteros y const <span class="ce-sub">18.1.1 · ¿compila o no?</span></div>' +
      '<pre class="ce-pre">' + DECL.map(function (l) { return '<code class="ce-l">' + res(l) + '</code>'; }).join('\n') + '</pre>' +
      '<p class="ce-regla">Regla: lee la declaración <strong>de derecha a izquierda</strong> y mira a qué lado del <code>*</code> está <code>const</code>. ' +
      '<span class="ce-chip ce-k-dato">const ← *</span> a la izquierda protege el <strong>dato</strong>; ' +
      '<span class="ce-chip ce-k-ptr">* → const</span> a la derecha protege el <strong>puntero</strong>.</p>' +
      '<div class="ce-mem" role="img" aria-label="Memoria"></div>' +
      '<div class="ce-tarjetas">';
    PTRS.forEach(function (p, i) {
      h += '<section class="ce-tarjeta ce-c' + p.color + '" aria-labelledby="' + id + '-t' + i + '">' +
        '<div class="ce-tit" id="' + id + '-t' + i + '"><code>' + p.n + '</code></div>' +
        '<div class="ce-decl">' + p.partes.map(function (x) {
          return x[1] === 'dato' ? '<span class="ce-tok ce-k-dato" title="protege el dato">' + esc(x[0].trim()) + '</span>'
            : x[1] === 'ptr' ? ' <span class="ce-tok ce-k-ptr" title="protege el puntero">' + esc(x[0].trim()) + '</span>'
            : x[1] === 'ast' ? '<span class="ce-ast">*</span>' : esc(x[0]);
        }).join('') + '</div>' +
        '<p class="ce-lee">' + p.lee + '</p>' +
        '<div class="ce-botones">' +
          '<button type="button" data-p="' + i + '" data-op="dato">Modificar el dato apuntado</button>' +
          '<button type="button" data-p="' + i + '" data-op="mover">Apuntar a otro sitio</button>' +
        '</div>' +
        '<div class="ce-res" aria-live="polite"></div>' +
      '</section>';
    });
    h += '<section class="ce-tarjeta ce-lon" aria-labelledby="' + id + '-tl"><div class="ce-tit" id="' + id + '-tl"><code>LON</code></div>' +
      '<div class="ce-decl"><span class="ce-tok ce-k-dato">const</span> int LON = 5;</div>' +
      '<p class="ce-lee">Sin puntero: <code>LON</code> es un <code>int</code> constante.</p>' +
      '<div class="ce-botones"><button type="button" data-p="lon" data-op="dato">Modificar LON</button></div>' +
      '<div class="ce-res" aria-live="polite"></div></section>';
    h += '</div><div class="ce-pie"><button type="button" class="ce-reset">Reiniciar la memoria</button>' +
      '<span class="ce-nota">Mensajes de Apple clang 21 (<code>-std=c++17</code>), traducidos; debajo, el original.</span></div>';
    el.innerHTML = h;

    function pintarMem() {
      var m = '<div class="ce-celdas">';
      for (var k = 0; k <= LON; k++) {
        var tags = '';
        PTRS.forEach(function (p, i) { if (pos[i] === k) tags += '<span class="ce-tag ce-c' + p.color + '">↑ ' + p.n + '</span>'; });
        m += '<div class="ce-celda' + (k === LON ? ' ce-fin' : '') + '">' +
          '<div class="ce-idx">' + (k === LON ? 'fin' : 'valores[' + k + ']') + '</div>' +
          '<div class="ce-val">' + (k === LON ? '—' : valores[k]) + '</div>' +
          '<div class="ce-tags">' + tags + '</div></div>';
      }
      m += '</div>';
      el.querySelector('.ce-mem').innerHTML = m;
      el.querySelector('.ce-mem').setAttribute('aria-label', 'Memoria: valores = {' + valores.join(', ') + '}; ' +
        PTRS.map(function (p, i) { return p.n + ' apunta a ' + (pos[i] === LON ? 'una posición después del final' : 'valores[' + pos[i] + ']'); }).join('; '));
    }

    function bloqueCodigo(op) {
      return '<pre class="ce-pre ce-pre-op"><code>' + res(op.linea + '\n// ' + op.comentario) + '</code></pre>';
    }

    function ejecutar(i, tipo, caja) {
      var op = i === 'lon' ? OP_LON : PTRS[i][tipo];
      var r = bloqueCodigo(op);
      if (!op.ok) {
        r += '<p class="ce-veredicto ce-no">✘ No compila</p>' +
          '<div class="ce-error"><div>' + esc(op.err.es) + '</div>' + (op.err.nota ? '<div class="ce-error-nota">' + esc(op.err.nota) + '</div>' : '') +
          '<div class="ce-error-en" lang="en">' + esc(op.err.en) + '</div></div>' +
          '<p class="ce-porque">' + op.porque + '</p>';
      } else {
        var efecto;
        if (tipo === 'dato') {
          valores[pos[i]] = 2;
          efecto = 'Se ejecuta: <code>valores[' + pos[i] + ']</code> pasa a valer 2.';
        } else if (pos[i] < LON) {
          pos[i]++;
          efecto = pos[i] < LON ? 'Se ejecuta: <code>' + PTRS[i].n + '</code> avanza un <code>int</code> y apunta a <code>valores[' + pos[i] + ']</code>; <code>*' + PTRS[i].n + '</code> = ' + valores[pos[i]] + '.'
            : 'Se ejecuta: ahora apunta justo detrás del último elemento. Es una dirección válida para comparar, pero no se puede desreferenciar.';
        } else {
          efecto = 'Compilaría igual, pero <code>' + PTRS[i].n + '</code> ya está justo detrás del final de <code>valores</code>: avanzar más es comportamiento indefinido y el compilador no lo detecta. No se mueve.';
        }
        r += '<p class="ce-veredicto ce-si">✔ Compila</p><p class="ce-efecto">' + efecto + '</p><p class="ce-porque">' + op.porque + '</p>';
      }
      caja.innerHTML = r;
      pintarMem();
    }

    el.addEventListener('click', function (e) {
      var t = e.target.closest('button');
      if (!t || !el.contains(t)) return;
      if (t.classList.contains('ce-reset')) {
        reiniciarEstado();
        var cs = el.querySelectorAll('.ce-res');
        for (var k = 0; k < cs.length; k++) cs[k].innerHTML = '';
        pintarMem();
        return;
      }
      var p = t.getAttribute('data-p');
      if (p == null) return;
      ejecutar(p === 'lon' ? 'lon' : +p, t.getAttribute('data-op'), t.closest('.ce-tarjeta').querySelector('.ce-res'));
    });

    pintarMem();
  };

  MPI.componentes['cpp-const-explorer']._punteros = PTRS;
})();
