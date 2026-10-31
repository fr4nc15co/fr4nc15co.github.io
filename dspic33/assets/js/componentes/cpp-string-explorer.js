/*
 * Componente "cpp-string-explorer" (tema 19, C++: STL, sección 11.3 del libro).
 * Muestra una std::string carácter a carácter con sus índices y aplica las
 * operaciones de 11.3: size/length, empty, operator[], at, substr(pos, len),
 * find(str[, pos]) con std::string::npos, erase(pos, len), operator+, operator+=,
 * operator== y c_str(). Cada operación muestra la línea C++ y su resultado.
 * Los ejemplos concretos de 11.3 vienen como botones (resultados compilados con
 * clang++ -std=c++17, Apple clang 21 / libc++).
 *
 * Uso:
 *   <div class="mpi-mount" data-componente="cpp-string-explorer" data-config='{"texto":"hello"}'></div>
 *
 * Claves de data-config:
 *   texto   contenido inicial de la cadena (defecto "hello"; máximo 24 caracteres).
 */
window.MPI = window.MPI || {};
MPI.componentes = MPI.componentes || {};

(function () {
  var uid = 0;
  var MAXS = 24;
  var NPOS = '18446744073709551615';   // std::string::npos con size_t de 64 bits (comprobado)

  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function lit(s) { return '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"'; }
  function litC(ch) { return ch === '\0' ? "'\\0'" : ch === "'" ? "'\\''" : ch === '\\' ? "'\\\\'" : "'" + ch + "'"; }

  // Ejecuta una operación. Devuelve {code, res, tipo, expl, marca:{a,b,clase}|null, nuevo (cadena modificada), mal}
  //   o: {op, nombre, s, pos, len (null = omitido), str, arg (nombre de variable del operando, opcional)}
  function operar(o) {
    var s = o.s, n = s.length, N = o.nombre, pos = o.pos, len = o.len, str = o.str;
    var arg = o.arg ? o.arg : lit(str);
    var r = { marca: null, nuevo: null, mal: false };
    switch (o.op) {
      case 'length':
      case 'size':
        r.code = N + '.' + o.op + '()'; r.res = String(n); r.tipo = 'std::size_t';
        r.expl = 'Número de caracteres. <code>size()</code> y <code>length()</code> son equivalentes. No cuenta ningún terminador.';
        r.marca = { a: 0, b: n, clase: 'sel' };
        return r;
      case 'empty':
        r.code = N + '.empty()'; r.res = n === 0 ? 'true' : 'false'; r.tipo = 'bool';
        r.expl = '<code>true</code> solo si <code>size() == 0</code>.';
        return r;
      case 'idx':
        r.code = N + '[' + pos + ']'; r.tipo = 'char&';
        if (pos < n) { r.res = litC(s[pos]); r.marca = { a: pos, b: pos + 1, clase: 'sel' }; r.expl = '<code>operator[]</code> devuelve una referencia al carácter de la posición ' + pos + ' (se cuenta desde 0). <strong>No comprueba los límites.</strong>'; }
        else if (pos === n) { r.res = "'\\0'"; r.marca = { a: n, b: n + 1, clase: 'sel' }; r.terminador = true; r.expl = 'Con <code>pos == size()</code>, <code>operator[]</code> devuelve el carácter nulo (desde C++11). No se debe modificar.'; }
        else { r.res = 'comportamiento indefinido'; r.mal = true; r.expl = '<strong class="cse-mal">Fuera de rango:</strong> <code>operator[]</code> no comprueba nada; leer más allá de <code>size()</code> es comportamiento indefinido. Para validar se usa <code>at()</code>.'; }
        return r;
      case 'at':
        r.code = N + '.at(' + pos + ')'; r.tipo = 'char&';
        if (pos < n) { r.res = litC(s[pos]); r.marca = { a: pos, b: pos + 1, clase: 'sel' }; r.expl = 'Igual que <code>[' + pos + ']</code>, pero comprobando que <code>pos &lt; size()</code>.'; }
        else { r.res = 'lanza std::out_of_range'; r.mal = true; r.expl = '<code>at()</code> comprueba el límite: con <code>pos = ' + pos + ' ≥ size() = ' + n + '</code> lanza la excepción <code>std::out_of_range</code> en vez de leer memoria ajena.'; }
        return r;
      case 'substr':
        r.code = N + '.substr(' + pos + (len == null ? '' : ', ' + len) + ')'; r.tipo = 'std::string';
        if (pos > n) { r.res = 'lanza std::out_of_range'; r.mal = true; r.expl = '<code>pos = ' + pos + ' &gt; size() = ' + n + '</code>: <code>substr</code> lanza <code>std::out_of_range</code>.'; return r; }
        var cnt = len == null ? n - pos : Math.min(len, n - pos);
        r.res = lit(s.substr(pos, cnt));
        r.marca = { a: pos, b: pos + cnt, clase: 'sel' };
        r.expl = 'Copia <strong>' + cnt + '</strong> caracteres a partir de la posición ' + pos + ' en una cadena <strong>nueva</strong>; <code>' + esc(N) + '</code> no cambia.' +
          (len == null ? ' Sin el segundo argumento llega hasta el final.' : (len > n - pos ? ' Se pidieron ' + len + ', pero solo quedan ' + (n - pos) + ': se recorta sin error.' : ''));
        return r;
      case 'find':
      case 'findpos':
        var desde = o.op === 'findpos' ? pos : 0;
        r.code = N + '.find(' + arg + (o.op === 'findpos' ? ', ' + pos : '') + ')'; r.tipo = 'std::size_t';
        var k = desde > n ? -1 : s.indexOf(str, desde);
        if (k < 0) {
          r.res = 'std::string::npos'; r.npos = true;
          r.expl = 'No aparece ' + esc(lit(str)) + (desde ? ' a partir de la posición ' + desde : '') + ': devuelve <code>std::string::npos</code>, el mayor valor de <code>std::size_t</code> (' + NPOS + ' con 64 bits). Por eso se compara <code>if (position != std::string::npos)</code> antes de usar la posición.';
          if (desde) r.marca = { a: Math.min(desde, n), b: n, clase: 'busca' };
        } else {
          r.res = String(k);
          r.marca = { a: k, b: k + str.length, clase: 'sel' };
          r.expl = 'Primera aparición de ' + esc(lit(str)) + (desde ? ' buscando desde la posición ' + desde : '') + ': empieza en el índice <strong>' + k + '</strong>.' + (str === '' ? ' (La cadena vacía se «encuentra» en la posición de partida.)' : '');
        }
        return r;
      case 'erase':
        r.code = N + '.erase(' + pos + (len == null ? '' : ', ' + len) + ')'; r.tipo = 'std::string&';
        if (pos > n) { r.res = 'lanza std::out_of_range'; r.mal = true; r.expl = '<code>pos = ' + pos + ' &gt; size() = ' + n + '</code>: <code>erase</code> lanza <code>std::out_of_range</code>.'; return r; }
        var ce = len == null ? n - pos : Math.min(len, n - pos);
        r.nuevo = s.slice(0, pos) + s.slice(pos + ce);
        r.res = lit(r.nuevo);
        r.marca = { a: pos, b: pos + ce, clase: 'borra' };
        r.expl = 'Elimina <strong>' + ce + '</strong> caracteres desde la posición ' + pos + ' y <strong>modifica</strong> <code>' + esc(N) + '</code> (los siguientes se desplazan a la izquierda).' + (len == null ? ' Sin el segundo argumento borra hasta el final.' : '');
        return r;
      case 'mas':
        r.code = N + ' + ' + arg; r.tipo = 'std::string';
        r.res = lit(s + str);
        r.expl = '<code>operator+</code> crea una cadena <strong>nueva</strong> con las dos seguidas; <code>' + esc(N) + '</code> no cambia.';
        r.concat = str;
        return r;
      case 'masig':
        r.code = N + ' += ' + arg; r.tipo = 'std::string&';
        r.nuevo = s + str;
        r.res = lit(r.nuevo);
        r.expl = '<code>operator+=</code> añade al final de <code>' + esc(N) + '</code> y la <strong>modifica</strong>. La memoria crece sola si hace falta.';
        r.marcaNueva = { a: n, b: n + str.length, clase: 'nueva' };
        return r;
      case 'igual':
        r.code = N + ' == ' + arg; r.tipo = 'bool';
        r.res = s === str ? 'true' : 'false';
        r.expl = 'Compara el <strong>contenido</strong> carácter a carácter (no direcciones, como pasaría con dos <code>char*</code>). ' + (s === str ? 'Son iguales.' : 'Son distintas.');
        return r;
      case 'cstr':
        r.code = N + '.c_str()'; r.tipo = 'const char*';
        r.res = lit(s); r.terminador = true;
        r.marca = { a: 0, b: n + 1, clase: 'sel' };
        r.expl = 'Puntero <code>const char*</code> al primer carácter de un vector terminado en <code>\'\\0\'</code> (' + (n + 1) + ' bytes), útil para funciones de C. Vale mientras <code>' + esc(N) + '</code> no se modifique ni se destruya, y no debe usarse para cambiarla.';
        return r;
    }
    return r;
  }

  // Ejemplos de 11.3 con los nombres del libro. Resultados de la ejecución real.
  var EJEMPLOS = [
    { sec: '19.2.1', nombre: 'first', s: 'hello', op: 'length', libro: 'std::cout << first.length() << \'\\n\';         // muestra 5 caracteres', salida: '5' },
    { sec: '19.2.1', nombre: 'first', s: 'hello', op: 'idx', pos: 3, libro: 'std::cout << first[3] << std::endl;', salida: 'l' },
    { sec: '19.2.1', nombre: 'first', s: 'hello', op: 'at', pos: 3, libro: 'std::cout << first.at(3) << std::endl;', salida: 'l' },
    { sec: '19.2.2', nombre: 'text', s: 'hello', op: 'substr', pos: 0, len: 3, libro: 'std::cout << text.substr(0, 3) << std::endl; // hel', salida: 'hel' },
    { sec: '19.2.2', nombre: 'text', s: 'hello', op: 'find', str: 'll', libro: 'std::size_t position = text.find("ll");', salida: '2 (se imprime con if (position != std::string::npos) std::cout << position;)' },
    { sec: '19.2.3', nombre: 'a', s: 'hello', op: 'erase', pos: 0, len: 2, libro: 'a.erase(0, 2);                 // "llo"', salida: 'a pasa a valer "llo"' },
    { sec: '19.2.3', nombre: 'a', s: 'llo', op: 'masig', str: 'hello2', arg: 'b', libro: 'a += b;   // b = "hello2"', salida: 'a pasa a valer "llohello2"' },
    { sec: '19.2.3', nombre: 'a', s: 'llohello2', op: 'mas', str: '!', libro: 'std::string c = a + "!";', salida: 'c = "llohello2!"' },
    { sec: '19.2.3', nombre: 'a', s: 'llohello2', op: 'igual', str: 'hello2', arg: 'b', libro: 'bool equal = (a == b);', salida: 'false' },
    { sec: '19.2.4', nombre: 'message', s: 'hello', op: 'cstr', libro: 'const char* raw = message.c_str();\nstd::cout << raw << std::endl;', salida: 'hello' }
  ];

  MPI.componentes['cpp-string-explorer'] = function (el, cfg) {
    cfg = cfg || {};
    var id = 'cse' + (++uid);
    var ini = typeof cfg.texto === 'string' ? cfg.texto.slice(0, MAXS) : 'hello';
    var st = { s: ini, nombre: 'text', ult: null, antes: null, ej: null };

    el.classList.add('mpi-cpp-string-explorer');
    el.innerHTML =
      '<div class="mpi-sim-cab">std::string <span class="cse-sub">índices, subcadenas y búsqueda · 19.2</span></div>' +
      '<div class="cse-fila">' +
        '<label class="cse-etq" for="' + id + '-s">Cadena</label>' +
        '<input id="' + id + '-s" class="cse-in-s" type="text" maxlength="' + MAXS + '" spellcheck="false" autocomplete="off">' +
        '<button type="button" class="cse-reset">Reiniciar</button>' +
      '</div>' +
      '<div class="cse-cad-wrap" role="region" tabindex="0" aria-label="Caracteres de la cadena con sus índices (desplazable)"><div class="cse-cad"></div></div>' +
      '<div class="cse-ctl">' +
        '<div class="cse-fila">' +
          '<label class="cse-etq" for="' + id + '-pos">pos</label><input id="' + id + '-pos" class="cse-in-pos" type="number" min="0" max="' + (MAXS + 5) + '" value="0">' +
          '<label class="cse-etq" for="' + id + '-len">len</label><input id="' + id + '-len" class="cse-in-len" type="number" min="0" max="99" value="3" placeholder="—">' +
          '<label class="cse-etq" for="' + id + '-str">texto</label><input id="' + id + '-str" class="cse-in-str" type="text" maxlength="12" value="ll" spellcheck="false" autocomplete="off">' +
        '</div>' +
        '<p class="cse-ayuda">Deja <em>len</em> vacío para omitir el segundo argumento. <em>texto</em> es lo que se busca, concatena o compara.</p>' +
        '<div class="cse-ops" role="group" aria-label="Operaciones">' +
          '<button type="button" data-op="size">size()</button><button type="button" data-op="length">length()</button><button type="button" data-op="empty">empty()</button>' +
          '<button type="button" data-op="idx">[pos]</button><button type="button" data-op="at">at(pos)</button>' +
          '<button type="button" data-op="substr">substr(pos, len)</button><button type="button" data-op="find">find(texto)</button><button type="button" data-op="findpos">find(texto, pos)</button>' +
          '<button type="button" data-op="erase">erase(pos, len)</button><button type="button" data-op="mas">+ texto</button><button type="button" data-op="masig">+= texto</button>' +
          '<button type="button" data-op="igual">== texto</button><button type="button" data-op="cstr">c_str()</button>' +
        '</div>' +
        '<p class="cse-error" role="alert"></p>' +
      '</div>' +
      '<div class="cse-res" aria-live="polite"></div>' +
      '<div class="cse-ejs"><span class="cse-etq">Ejemplos del libro</span><div class="cse-ejs-lista">' +
        EJEMPLOS.map(function (e, i) {
          return '<button type="button" class="cse-ej" data-ej="' + i + '" aria-pressed="false"><span class="cse-ej-sec">' + e.sec + '</span> <code>' + esc(operar({ op: e.op, nombre: e.nombre, s: e.s, pos: e.pos, len: e.len == null ? null : e.len, str: e.str, arg: e.arg }).code) + '</code></button>';
        }).join('') +
      '</div></div>';

    function $(s) { return el.querySelector(s); }

    function celdas(s, marca, opt) {
      opt = opt || {};
      var h = '<div class="cse-celdas' + (opt.antes ? ' cse-antes' : '') + '">';
      var tot = s.length + (opt.terminador ? 1 : 0);
      if (!tot) h += '<div class="cse-vacia">(cadena vacía: <code>size() == 0</code>)</div>';
      for (var i = 0; i < tot; i++) {
        var cls = 'cse-celda', ch = i < s.length ? s[i] : '\\0';
        if (i >= s.length) cls += ' cse-nul';
        [marca, opt.marca2].forEach(function (m) { if (m && i >= m.a && i < m.b) cls += ' cse-' + m.clase; });
        h += '<div class="' + cls + '"><span class="cse-ch">' + (ch === ' ' ? '␣' : esc(ch)) + '</span><span class="cse-i">' + i + '</span></div>';
      }
      return h + '</div>';
    }

    function pintar() {
      var r = st.ult;
      var cab = '<p class="cse-decl"><code class="lang-cpp">' + esc('std::string ' + st.nombre + ' = ' + lit(st.antes != null ? st.antes : st.s) + ';') + '</code> <span class="cse-n">size() = ' + (st.antes != null ? st.antes : st.s).length + '</span></p>';
      var h = '';
      if (r && st.antes != null) {
        h += '<p class="cse-fila-tit">Antes</p>' + cab + celdas(st.antes, r.marca, { antes: true });
        h += '<p class="cse-fila-tit">Después: <code>' + esc(st.nombre) + ' = ' + esc(lit(st.s)) + '</code> · size() = ' + st.s.length + '</p>' + celdas(st.s, r.marcaNueva);
      } else {
        h += cab + celdas(st.s, r && r.marca, { terminador: r && r.terminador });
      }
      if (r && r.concat != null) {
        h += '<p class="cse-fila-tit">Cadena nueva que devuelve <code>' + esc(r.code) + '</code></p>' + celdas(st.s + r.concat, { a: st.s.length, b: st.s.length + r.concat.length, clase: 'nueva' });
      }
      $('.cse-cad').innerHTML = h;

      var res = $('.cse-res');
      if (!r) {
        res.innerHTML = 'Elige una operación o un ejemplo del libro. Los índices empiezan en 0.';
        res.classList.remove('cse-res-mal');
      } else {
        var linea;
        if (r.mal || r.tipo === 'std::string&') linea = r.code + ';';
        else if (r.tipo === 'char&') linea = 'char r = ' + r.code + ';';
        else linea = r.tipo + ' r = ' + r.code + ';';
        res.classList.toggle('cse-res-mal', !!r.mal);
        res.innerHTML =
          '<pre class="cse-pre"><code class="lang-cpp">' + esc(linea + (r.mal ? '   // ' + r.res : '   // ' + (r.npos ? 'std::string::npos' : r.res))) + '</code></pre>' +
          '<p class="cse-resultado"><span class="cse-etq">Resultado</span> <span class="cse-val' + (r.mal ? ' cse-mal' : '') + '">' + esc(r.res) + '</span>' +
          (r.mal ? '' : ' <span class="cse-tipo">' + esc(r.tipo) + '</span>') + (r.npos ? ' <span class="cse-tipo">= ' + NPOS + '</span>' : '') + '</p>' +
          '<p class="cse-expl">' + r.expl + '</p>' +
          (st.ej ? '<div class="cse-libro"><span class="cse-etq">Libro ' + st.ej.sec + '</span><pre class="cse-pre"><code class="lang-cpp">' + esc(st.ej.libro) + '</code></pre>' +
            '<p class="cse-salida">Salida real (clang++ -std=c++17): <code>' + esc(st.ej.salida) + '</code></p></div>' : '');
      }
      var be = el.querySelectorAll('.cse-ej');
      for (var i = 0; i < be.length; i++) be[i].setAttribute('aria-pressed', st.ej === EJEMPLOS[i] ? 'true' : 'false');
      if (MPI.resaltarTodo) MPI.resaltarTodo(el);
    }

    function aplicar(o) {
      var r = operar(o);
      st.ult = r;
      if (r.nuevo != null) { st.antes = o.s; st.s = r.nuevo; }
      else st.antes = null;
      $('.cse-in-s').value = st.s;
    }

    function numero(sel, vacioOk) {
      var inp = $(sel), v = inp.value.trim();
      if (v === '' && vacioOk) { inp.removeAttribute('aria-invalid'); return null; }
      var n = parseInt(v, 10);
      if (!/^\d+$/.test(v) || n > 99) { inp.setAttribute('aria-invalid', 'true'); return undefined; }
      inp.removeAttribute('aria-invalid');
      return n;
    }

    el.addEventListener('click', function (ev) {
      var t = ev.target.closest('button');
      if (!t || !el.contains(t)) return;
      var err = $('.cse-error');
      if (t.classList.contains('cse-reset')) {
        st = { s: ini, nombre: 'text', ult: null, antes: null, ej: null };
        $('.cse-in-s').value = ini; err.textContent = ''; pintar(); return;
      }
      if (t.hasAttribute('data-ej')) {
        var e = EJEMPLOS[+t.getAttribute('data-ej')];
        st.ej = e; st.nombre = e.nombre; st.s = e.s;
        if (e.pos != null) $('.cse-in-pos').value = e.pos;
        if (e.len != null) $('.cse-in-len').value = e.len;
        if (e.str != null) $('.cse-in-str').value = e.str;
        err.textContent = '';
        aplicar({ op: e.op, nombre: e.nombre, s: e.s, pos: e.pos, len: e.len == null ? null : e.len, str: e.str, arg: e.arg });
        pintar(); return;
      }
      var op = t.getAttribute('data-op');
      if (!op) return;
      var pos = numero('.cse-in-pos', false), len = numero('.cse-in-len', true);
      if (pos === undefined || len === undefined) { err.textContent = 'pos y len deben ser enteros entre 0 y 99.'; return; }
      err.textContent = '';
      st.ej = null;
      if (op === 'masig' && (st.s + $('.cse-in-str').value).length > MAXS * 2) { err.textContent = 'El interactivo limita la cadena a ' + (MAXS * 2) + ' caracteres.'; return; }
      aplicar({ op: op, nombre: st.nombre, s: st.s, pos: pos, len: len, str: $('.cse-in-str').value });
      pintar();
    });

    $('.cse-in-s').addEventListener('input', function () {
      st.s = this.value.slice(0, MAXS); st.ult = null; st.antes = null; st.ej = null;
      pintar();
    });

    $('.cse-in-s').value = ini;
    pintar();
  };

  MPI.componentes['cpp-string-explorer']._operar = operar;
  MPI.componentes['cpp-string-explorer']._ejemplos = EJEMPLOS;
})();
