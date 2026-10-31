/*
 * Componente "cpp-list-vector" (tema 19, C++: STL, capítulo 11 del libro).
 * Dibuja std::list como nodos enlazados (prev/next, nodo centinela end()) y
 * std::vector como un bloque contiguo con size() y capacity(). Un iterador «it»
 * que el alumno mueve (begin, ++, --, end) y las operaciones de 11.6-11.8; tras
 * cada una se muestra la línea C++ equivalente y qué iteradores quedan inválidos.
 *
 * Uso:
 *   <div class="mpi-mount" data-componente="cpp-list-vector"
 *        data-config='{"modo":"ambos","inicial":[10,20,30],"capacidad":4}'></div>
 *
 * Claves de data-config:
 *   modo       "list" | "vector" | "ambos" (defecto "ambos"): vista inicial.
 *   inicial    elementos iniciales (enteros; también se aceptan cadenas cortas,
 *              y entonces el contenedor es de std::string). Máximo 16.
 *   capacidad  capacidad inicial del vector (opcional; defecto = tamaño inicial,
 *              que es lo que da el constructor con lista de inicialización).
 *
 * Crecimiento del vector: el de libc++ (Apple clang 21) medido compilando con
 * clang++ -std=c++17: nueva capacidad = máx(2 × capacity, tamaño necesario);
 * reserve(n) reserva exactamente n. Depende de la biblioteca.
 */
window.MPI = window.MPI || {};
MPI.componentes = MPI.componentes || {};

(function () {
  var uid = 0;
  var MAXN = 16, MAXRES = 32;

  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function hx(n) { return '0x' + n.toString(16).toUpperCase(); }
  function c(s) { return '<code>' + esc(s) + '</code>'; }

  // ---------------- Modelo ----------------
  var nid = 0;
  function Cont(kind, o) {
    this.kind = kind;
    this.tipo = o.tipo;
    this.nombre = o.nombre || (kind === 'list' ? 'lst' : 'vec');
    this.itN = o.itN || 'it';
    this.semilla = kind === 'list' ? 11 : 5;
    this.dirUsadas = {};
    this.base = 0x1000;
    this.esz = this.tipo === 'int' ? 4 : 24;
    var self = this;
    this.els = o.vals.map(function (v) { return self.nuevo(v); });
    this.cap = kind === 'vector' ? Math.max(o.cap || 0, this.els.length) : 0;
    this.it = o.sinIt ? null : { idx: 0, id: this.els.length ? this.els[0].id : 'end', valid: true };
    this.ult = null;
    this.decl = null;
    this.decl = o.decl || this.declaracion();   // se fija al crear: no cambia con las operaciones
    this.log = [];
  }
  Cont.prototype.nuevo = function (v) {
    var e = { id: ++nid, v: v };
    if (this.kind === 'list') {
      var a;
      do {
        this.semilla = (this.semilla * 1103515245 + 12345) & 0x7fffffff;
        a = 0x7000 + ((this.semilla >> 8) % 160) * 0x30;
      } while (this.dirUsadas[a]);
      this.dirUsadas[a] = 1;
      e.addr = a;
    }
    return e;
  };
  Cont.prototype.lit = function (v) {
    return this.tipo === 'int' ? String(v) : '"' + String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
  };
  Cont.prototype.defecto = function () { return this.tipo === 'int' ? 0 : ''; };
  // Índice del iterador (list: se busca su nodo; end = size).
  Cont.prototype.itIdx = function () {
    var it = this.it;
    if (!it) return null;
    if (this.kind === 'vector') return it.idx;
    if (it.id === 'end') return this.els.length;
    for (var i = 0; i < this.els.length; i++) if (this.els[i].id === it.id) return i;
    return it.idx;
  };
  Cont.prototype.ponIt = function (idx) {
    this.it = { idx: idx, id: idx < this.els.length ? this.els[idx].id : 'end', valid: true };
  };
  Cont.prototype.fmt = function (v) {
    if (this.tipo === 'int') return String(v);
    return v === '' ? '""' : String(v);
  };
  Cont.prototype.contenido = function () {
    var self = this;
    return this.els.map(function (e) { return self.fmt(e.v); }).join(', ');
  };
  Cont.prototype.declaracion = function () {
    if (this.decl) return this.decl.slice();
    var self = this;
    var t = (this.kind === 'list' ? 'std::list<' : 'std::vector<') + (this.tipo === 'int' ? 'int' : 'std::string') + '> ' + this.nombre;
    var l = [t + (this.els.length ? ' {' + this.els.map(function (e) { return self.lit(e.v); }).join(', ') + '}' : '') + ';'];
    if (this.kind === 'vector' && this.cap > this.els.length) l.push(this.nombre + '.reserve(' + this.cap + ');');
    if (this.it) l.push('auto ' + this.itN + ' = ' + this.nombre + '.begin();');
    return l;
  };

  var MSG_INVALIDO = function (c) {
    return ' → <strong class="clv-mal">' + esc(c.itN) + ' queda inválido</strong>: no se puede usar (ni <code>*' + esc(c.itN) + '</code> ni <code>++' + esc(c.itN) +
      '</code>) hasta volver a asignarlo con <code>begin()</code>, <code>end()</code> o el valor que devuelven <code>insert</code>/<code>erase</code>.';
  };

  // Tras una operación que NO reasigna it: aplica las reglas de invalidación.
  //   vector: inv.realoc → todos; inv.desde = k → los de posición ≥ k (incluido end()).
  //   list:   inv.borrados = {id: 1} → solo los de los nodos borrados.
  function invalidar(c, inv, idxAntes) {
    var it = c.it;
    if (!it || !it.valid) return '';
    if (c.kind === 'vector') {
      if (inv.realoc || (inv.desde != null && idxAntes >= inv.desde)) {
        it.valid = false; it.recien = true;
        it.idx = idxAntes;
        if (inv.realoc) inv.realoc.itIdx = idxAntes;
        return MSG_INVALIDO(c);
      }
      return '';
    }
    if (inv.borrados && it.id !== 'end' && inv.borrados[it.id]) {
      it.valid = false; it.recien = true;
      it.idx = idxAntes;
      return MSG_INVALIDO(c);
    }
    return '';
  }

  // Reserva un bloque nuevo en el vector (realojamiento) y devuelve la foto del viejo.
  function realojar(c, nuevaCap) {
    var self = c;
    var viejo = { base: c.base, cap: c.cap, vals: c.els.map(function (e) { return self.fmt(e.v); }), size: c.els.length, itIdx: null };
    c.base = c.base + Math.max(0x200, Math.ceil((c.cap * c.esz + 0x40) / 0x100) * 0x100);
    c.cap = nuevaCap;
    return viejo;
  }
  function crec(c, need) { return Math.max(2 * c.cap, need); }

  function opErr(c, code, expl) { return { ok: false, code: [code], expl: expl }; }
  function requiereIt(c, code) {
    if (!c.it) return opErr(c, code, 'Todavía no hay ningún iterador: pide uno con <code>begin()</code> o <code>end()</code>.');
    if (!c.it.valid) return opErr(c, '// ✗ ' + code + '   comportamiento indefinido', '<strong class="clv-mal">Comportamiento indefinido:</strong> <code>' + esc(c.itN) +
      '</code> es un iterador inválido. Vuelve a asignarlo con <code>begin()</code> o <code>end()</code>.');
    return null;
  }

  // a: {val, n, cnt, reasig, pos ('it' | 'begin' | 'end' | número), code}
  function ejecutar(c, op, a) {
    var N = c.nombre, I = c.itN, isL = c.kind === 'list', size = c.els.length, r, x, k, i;
    var idxAntes = c.itIdx();
    if (c.it) c.it.recien = false;
    function posTxt(p) { return p === 'it' ? I : p === 'begin' ? N + '.begin()' : p === 'end' ? N + '.end()' : String(p); }
    function posIdx(p) { return p === 'it' ? c.itIdx() : p === 'begin' ? 0 : p === 'end' ? size : p; }

    switch (op) {
      case 'begin':
        c.ponIt(0);
        return { ok: true, code: [I + ' = ' + N + '.begin();'], expl: '<code>begin()</code> señala el primer elemento' + (size ? ' (' + esc(c.fmt(c.els[0].v)) + ').' : '; el contenedor está vacío, así que <code>begin() == end()</code>.') };
      case 'end':
        c.ponIt(size);
        return { ok: true, code: [I + ' = ' + N + '.end();'], expl: '<code>end()</code> es la posición <strong>posterior</strong> al último elemento' + (isL ? ' (el nodo centinela, sin dato)' : '') + '. Nunca se desreferencia: <code>*' + esc(I) + '</code> sería comportamiento indefinido.' };
      case 'inc':
        if ((r = requiereIt(c, '++' + I + ';'))) return r;
        if (idxAntes >= size) return opErr(c, '// ✗ ++' + I + ';   ' + I + ' ya es end()', '<strong class="clv-mal">Comportamiento indefinido:</strong> no se puede avanzar más allá de <code>end()</code>. En un bucle se compara <code>' + esc(I) + ' != ' + esc(N) + '.end()</code> antes de avanzar.');
        c.ponIt(idxAntes + 1);
        return { ok: true, code: ['++' + I + ';'], expl: isL ? 'En la lista, <code>++' + esc(I) + '</code> sigue el puntero <code>next</code> del nodo actual.' : 'En el vector, <code>++' + esc(I) + '</code> suma el tamaño de un elemento a la dirección (memoria contigua; iterador de acceso aleatorio).' };
      case 'dec':
        if ((r = requiereIt(c, '--' + I + ';'))) return r;
        if (idxAntes <= 0) return opErr(c, '// ✗ --' + I + ';   ' + I + ' ya es begin()', '<strong class="clv-mal">Comportamiento indefinido:</strong> no hay nada antes de <code>begin()</code>. Para recorrer al revés se usan <code>rbegin()</code> y <code>rend()</code>.');
        c.ponIt(idxAntes - 1);
        return { ok: true, code: ['--' + I + ';'], expl: isL ? 'En la lista, <code>--' + esc(I) + '</code> sigue el puntero <code>prev</code> (iterador bidireccional).' : '<code>--' + esc(I) + '</code> resta un elemento a la dirección.' };

      case 'asig':
        var p0 = a.pos == null ? 'it' : a.pos;
        if (p0 === 'it') {
          if ((r = requiereIt(c, '*' + I + ' = ' + c.lit(a.val) + ';'))) return r;
          if (idxAntes >= size) return opErr(c, '// ✗ *' + I + ' = ' + c.lit(a.val) + ';   ' + I + ' == end()', '<strong class="clv-mal">Comportamiento indefinido:</strong> <code>end()</code> no señala ningún elemento.');
        }
        k = posIdx(p0);
        if (k >= size) return opErr(c, '// ✗ ' + N + '[' + k + '] fuera de rango', 'Posición fuera de rango.');
        c.els[k].v = a.val;
        return { ok: true, code: [p0 === 'it' ? '*' + I + ' = ' + c.lit(a.val) + ';' : N + '[' + k + '] = ' + c.lit(a.val) + ';'], expl: 'Se modifica el elemento en su sitio: no cambia el tamaño ni se invalida nada.', nuevos: [c.els[k].id] };

      case 'push_front':
        if (!isL) return { ok: false, code: ['// ✗ ' + N + '.push_front(' + c.lit(a.val) + ');   error: std::vector no tiene push_front'],
          expl: '<code>std::vector</code> no tiene <code>push_front</code>: insertar al principio obliga a desplazar todos los elementos. Si de verdad hace falta: <code>' + esc(N) + '.insert(' + esc(N) + '.begin(), ' + esc(c.lit(a.val)) + ')</code>.',
          ofrece: 'insFront' };
        a = { val: a.val, cnt: 1, reasig: false, pos: 'begin', code: a.code };
        r = ejecutar(c, 'insert', a);
        r.code = [N + '.push_front(' + c.lit(a.val) + ');'];
        return r;
      case 'push_back':
        if (size >= MAXN) return opErr(c, '// (límite del interactivo: ' + MAXN + ' elementos)', 'El interactivo admite como máximo ' + MAXN + ' elementos.');
        if (isL) {
          x = c.nuevo(a.val); c.els.push(x);
          return { ok: true, code: [N + '.push_back(' + c.lit(a.val) + ');'], nuevos: [x.id],
            expl: 'Se reserva un nodo nuevo en el heap y se enlaza delante de <code>end()</code> ajustando dos punteros (<code>next</code> del último y <code>prev</code> del centinela). <strong>No se invalida ningún iterador.</strong>' };
        }
        r = { ok: true, code: [N + '.push_back(' + c.lit(a.val) + ');'] };
        if (size === c.cap) {
          var nc = crec(c, size + 1);
          r.realoc = realojar(c, nc);
          r.expl = '<code>size() == capacity() == ' + size + '</code>: no cabe. Se reserva un bloque nuevo de ' + nc + ' elementos (libc++: máx(2 × ' + r.realoc.cap + ', ' + (size + 1) + ')), se mueven los ' + size +
            ' elementos y se libera el bloque viejo. <strong>Todos</strong> los iteradores, punteros y referencias anteriores quedan inválidos.';
        } else {
          r.desde = size;
          r.expl = 'Cabe (<code>size() = ' + size + ' &lt; capacity() = ' + c.cap + '</code>): se construye en la celda [' + size + '] sin mover nada. Solo deja de valer <code>end()</code>.';
        }
        x = c.nuevo(a.val); c.els.push(x); r.nuevos = [x.id];
        r.expl += invalidar(c, { realoc: r.realoc, desde: r.desde }, idxAntes);
        return r;

      case 'insert':
        var p = a.pos == null ? 'it' : a.pos, cnt = a.cnt == null ? 1 : a.cnt;
        var codeIns = N + '.insert(' + posTxt(p) + ', ' + (cnt !== 1 ? cnt + ', ' : '') + c.lit(a.val) + ');';
        if (a.reasig) codeIns = I + ' = ' + codeIns;
        if (p === 'it' && (r = requiereIt(c, codeIns))) return r;
        if (size + cnt > MAXN) return opErr(c, '// (límite del interactivo: ' + MAXN + ' elementos)', 'El interactivo admite como máximo ' + MAXN + ' elementos.');
        k = posIdx(p);
        var nuevos = [];
        for (i = 0; i < cnt; i++) nuevos.push(c.nuevo(a.val));
        r = { ok: true, code: [codeIns], nuevos: nuevos.map(function (e) { return e.id; }) };
        var antesDe = k < size ? 'antes de ' + esc(c.fmt(c.els[k].v)) : 'antes de <code>end()</code> (al final)';
        if (isL) {
          c.els.splice.apply(c.els, [k, 0].concat(nuevos));
          r.expl = 'Se ' + (cnt === 1 ? 'crea un nodo' : 'crean ' + cnt + ' nodos') + ' y se ' + (cnt === 1 ? 'enlaza ' : 'enlazan ') + antesDe + ': solo se tocan los punteros <code>prev</code>/<code>next</code> vecinos. ' +
            '<strong>En std::list insertar no invalida ningún iterador.</strong>';
          if (a.reasig) { c.ponIt(k); r.expl += ' <code>insert</code> devuelve un iterador al ' + (cnt === 1 ? 'nuevo elemento' : 'primero de los nuevos') + ', que se guarda en <code>' + esc(I) + '</code>.'; }
          else if (c.it && c.it.valid && p === 'it') r.expl += ' <code>' + esc(I) + '</code> sigue señalando al mismo nodo, que ahora queda detrás del nuevo.';
          return r;
        }
        var desp = size - k;
        if (size + cnt > c.cap) {
          var nc2 = crec(c, size + cnt);
          r.realoc = realojar(c, nc2);
          r.expl = 'No cabe (' + size + ' + ' + cnt + ' &gt; capacity() = ' + r.realoc.cap + '): <strong>realojamiento</strong> a un bloque de ' + nc2 + ' (libc++: máx(2 × ' + r.realoc.cap + ', ' + (size + cnt) +
            ')). Se copian los elementos dejando hueco ' + antesDe + '. <strong>Todos</strong> los iteradores anteriores quedan inválidos.';
        } else {
          r.desde = k;
          r.expl = 'Cabe en la capacidad, pero hay que <strong>desplazar ' + desp + ' elemento' + (desp === 1 ? '' : 's') + '</strong> una posición' + (cnt > 1 ? ' (' + cnt + ' huecos)' : '') + ' para hacer hueco ' + antesDe +
            '. Quedan inválidos los iteradores desde la posición [' + k + '] (incluido <code>end()</code>).';
        }
        c.els.splice.apply(c.els, [k, 0].concat(nuevos));
        if (a.reasig) {
          if (c.it && !c.it.valid) c.it.valid = true;
          c.ponIt(k);
          r.expl += ' <code>insert</code> devuelve un iterador <strong>válido</strong> al ' + (cnt === 1 ? 'nuevo elemento' : 'primero de los nuevos') + ': <code>' + esc(I) + ' = …</code> lo recoge.';
          if (r.realoc) r.realoc.itIdx = null;
        } else r.expl += invalidar(c, { realoc: r.realoc, desde: r.desde }, idxAntes);
        return r;

      case 'erase':
        var pe = a.pos == null ? 'it' : a.pos;
        var codeEr = N + '.erase(' + posTxt(pe) + ');';
        if (a.reasig) codeEr = I + ' = ' + codeEr;
        if (pe === 'it' && (r = requiereIt(c, codeEr))) return r;
        k = posIdx(pe);
        if (k >= size) return opErr(c, '// ✗ ' + codeEr + '   ' + (pe === 'it' ? I + ' == end()' : 'contenedor vacío'), '<strong class="clv-mal">Comportamiento indefinido:</strong> <code>erase(end())</code> no borra nada válido: <code>end()</code> no señala ningún elemento.');
        x = c.els[k];
        r = { ok: true, code: [codeEr] };
        if (isL) {
          r.borrados = [{ v: c.fmt(x.v), addr: x.addr, it: false }];
          var bor = {}; bor[x.id] = 1;
          c.els.splice(k, 1);
          r.expl = 'Se desenlaza el nodo de ' + esc(c.fmt(x.v)) + ' (sus vecinos pasan a apuntarse entre sí) y se libera su memoria. Solo dejan de valer los iteradores a <strong>ese</strong> nodo; los demás siguen valiendo.';
          if (a.reasig) { c.ponIt(k); r.expl += ' <code>erase</code> devuelve el iterador al <strong>siguiente</strong> (' + (k < c.els.length ? esc(c.fmt(c.els[k].v)) : '<code>end()</code>') + '), que se guarda en <code>' + esc(I) + '</code>.'; }
          else {
            var m = invalidar(c, { borrados: bor }, idxAntes);
            if (m) r.borrados[0].it = true;
            r.expl += m;
          }
          return r;
        }
        c.els.splice(k, 1);
        r.desde = k;
        r.expl = 'Se destruye el elemento [' + k + '] (' + esc(c.fmt(x.v)) + ') y se <strong>desplazan ' + (size - k - 1) + '</strong> posteriores una posición hacia la izquierda. capacity() no cambia. Quedan inválidos los iteradores desde [' + k + '] (incluido <code>end()</code>).';
        if (a.reasig) { c.ponIt(k); r.expl += ' <code>erase</code> devuelve un iterador válido al <strong>siguiente</strong> (' + (k < c.els.length ? esc(c.fmt(c.els[k].v)) : '<code>end()</code>') + '), que ahora ocupa la posición [' + k + '].'; }
        else r.expl += invalidar(c, { desde: k }, idxAntes);
        return r;

      case 'pop_front':
        if (!isL) return { ok: false, code: ['// ✗ ' + N + '.pop_front();   error: std::vector no tiene pop_front'],
          expl: '<code>std::vector</code> no tiene <code>pop_front</code>. El equivalente es <code>' + esc(N) + '.erase(' + esc(N) + '.begin())</code>, que desplaza todos los demás elementos.' };
        if (!size) return opErr(c, '// ✗ ' + N + '.pop_front();   lista vacía', '<strong class="clv-mal">Comportamiento indefinido</strong> sobre un contenedor vacío: compruébalo antes con <code>empty()</code>.');
        r = ejecutar(c, 'erase', { pos: 'begin', reasig: false });
        r.code = [N + '.pop_front();'];
        return r;
      case 'pop_back':
        if (!size) return opErr(c, '// ✗ ' + N + '.pop_back();   contenedor vacío', '<strong class="clv-mal">Comportamiento indefinido</strong> sobre un contenedor vacío: compruébalo antes con <code>empty()</code>.');
        var ultV = c.fmt(c.els[size - 1].v), validoAntes = !!(c.it && c.it.valid);
        r = ejecutar(c, 'erase', { pos: size - 1, reasig: false });
        r.code = [N + '.pop_back();'];
        if (!isL) r.expl = 'Se destruye el último elemento (' + esc(ultV) + '): no se mueve nada y <code>capacity()</code> no cambia. Quedan inválidos los iteradores al último y <code>end()</code>.' +
          (validoAntes && !c.it.valid ? MSG_INVALIDO(c) : '');
        return r;

      case 'reserve':
        var n = a.n;
        if (isL) return { ok: false, code: ['// ✗ ' + N + '.reserve(' + n + ');   error: std::list no tiene reserve'],
          expl: '<code>std::list</code> no tiene <code>reserve</code> ni <code>capacity</code>: cada nodo se reserva por separado al insertarlo.' };
        if (n <= c.cap) return { ok: true, code: [N + '.reserve(' + n + ');'], expl: '<code>' + n + ' ≤ capacity() = ' + c.cap + '</code>: no hace nada (reserve nunca reduce la capacidad). No se invalida ningún iterador.' };
        if (n > MAXRES) return opErr(c, '// (límite del interactivo: capacidad ' + MAXRES + ')', 'El interactivo dibuja como máximo ' + MAXRES + ' celdas.');
        r = { ok: true, code: [N + '.reserve(' + n + ');'] };
        r.realoc = realojar(c, n);
        r.expl = 'Se reserva un bloque de exactamente ' + n + ' elementos y se mueven ahí los ' + size + ' existentes; <code>size()</code> no cambia. Al cambiar de bloque, <strong>todos</strong> los iteradores anteriores quedan inválidos.' +
          ' Por eso se llama a <code>reserve</code> al principio, cuando se conoce el crecimiento previsto.';
        r.expl += invalidar(c, { realoc: r.realoc }, idxAntes);
        return r;

      case 'resize':
        var m2 = a.n;
        if (m2 > MAXN) return opErr(c, '// (límite del interactivo: ' + MAXN + ' elementos)', 'El interactivo admite como máximo ' + MAXN + ' elementos.');
        r = { ok: true, code: [N + '.resize(' + m2 + ');'] };
        var dflt = c.tipo === 'int' ? '<code>0</code>' : 'cadenas vacías <code>""</code>';
        if (m2 === size) { r.expl = 'El tamaño ya es ' + size + ': no hace nada.'; return r; }
        if (m2 < size) {
          var quit = c.els.slice(m2);
          if (isL) {
            var bor2 = {};
            r.borrados = quit.map(function (e) { bor2[e.id] = 1; return { v: c.fmt(e.v), addr: e.addr, it: false }; });
            c.els = c.els.slice(0, m2);
            r.expl = 'Se borran los ' + quit.length + ' últimos nodos. Solo se invalidan los iteradores a esos nodos.';
            var mm = invalidar(c, { borrados: bor2 }, idxAntes);
            if (mm) r.borrados[idxAntes - m2].it = true;
            r.expl += mm;
            return r;
          }
          c.els = c.els.slice(0, m2);
          r.desde = m2;
          r.expl = 'Se destruyen los ' + quit.length + ' últimos elementos; <code>capacity()</code> sigue en ' + c.cap + '. Quedan inválidos los iteradores desde [' + m2 + '].';
          r.expl += invalidar(c, { desde: m2 }, idxAntes);
          return r;
        }
        var add = [];
        for (i = size; i < m2; i++) add.push(c.nuevo(c.defecto()));
        r.nuevos = add.map(function (e) { return e.id; });
        if (isL) {
          c.els = c.els.concat(add);
          r.expl = 'Se añaden ' + add.length + ' nodos al final con el valor por defecto (' + dflt + '). No se invalida ningún iterador.';
          return r;
        }
        if (m2 > c.cap) {
          var nc3 = crec(c, m2);
          r.realoc = realojar(c, nc3);
          r.expl = 'No cabe (' + m2 + ' &gt; capacity() = ' + r.realoc.cap + '): realojamiento a ' + nc3 + ' (libc++: máx(2 × ' + r.realoc.cap + ', ' + m2 + ')) y se construyen ' + add.length + ' elementos por defecto (' + dflt + '). <strong>Todos</strong> los iteradores quedan inválidos.';
        } else {
          r.desde = size;
          r.expl = 'Cabe: se construyen ' + add.length + ' elementos por defecto (' + dflt + ') en las celdas reservadas. Solo deja de valer <code>end()</code>.';
        }
        c.els = c.els.concat(add);
        r.expl += invalidar(c, { realoc: r.realoc, desde: r.desde }, idxAntes);
        return r;

      case 'clear':
        r = { ok: true, code: [N + '.clear();'] };
        if (isL) {
          r.borrados = c.els.map(function (e) { return { v: c.fmt(e.v), addr: e.addr, it: !!(c.it && c.it.valid && c.it.id === e.id) }; });
          var hayIt = r.borrados.some(function (b) { return b.it; });
          c.els = [];
          r.expl = 'Se liberan todos los nodos; <code>size()</code> pasa a 0. Todos los iteradores a elementos quedan inválidos.';
          if (hayIt) { c.it.valid = false; c.it.recien = true; r.expl += MSG_INVALIDO(c); }
          return r;
        }
        c.els = [];
        r.desde = 0;
        r.expl = 'Se destruyen todos los elementos: <code>size()</code> pasa a 0 pero <strong><code>capacity()</code> sigue en ' + c.cap + '</strong> (la memoria no se devuelve). Todos los iteradores quedan inválidos.';
        r.expl += invalidar(c, { desde: 0 }, idxAntes);
        return r;
      case 'nada':
        return { ok: true, code: [], expl: '' };
    }
    return opErr(c, '// operación desconocida', '');
  }

  // ---------------- Ejemplos del libro (resultados compilados con clang++ -std=c++17) ----------------
  function ejemplos() {
    var e72 = [{ op: 'begin', code: 'auto it = items.begin();   // primera vuelta del for', nota: 'Bucle de 19.6.2 desenrollado: <code>for (auto it = items.begin(); it != items.end(); ++it) items.insert(it, std::to_string(number++));</code>' }];
    for (var k = 0; k < 4; k++) {
      e72.push({ op: 'insert', val: String(k), reasig: false, code: 'items.insert(it, std::to_string(number++));   // inserta "' + k + '"' });
      e72.push({ op: 'inc', code: '++it;' + (k === 3 ? '   // it == items.end(): fin del bucle' : '') });
    }
    e72[e72.length - 1].nota = 'Fin del bucle. Salida compilada: <code>0 A1 1 B2 2 C3 3 D4</code>. El segundo bucle del libro (<code>it = items.erase(it)</code> si la cadena está vacía) no borra nada con estos datos: ninguna cadena está vacía.' +
      ' En un <code>std::vector</code> este mismo bucle es comportamiento indefinido: el primer <code>insert</code> realoja e invalida <code>it</code>.';
    return [
      { id: '11.6', titulo: '19.5.1-19.5.2 · list values', modo: 'list', tipo: 'string', nombre: 'values', itN: 'position2', sinIt: true, vals: [],
        decl: ['#include <list>', 'std::list<std::string> values;       // lista inicialmente vacía'],
        pasos: [
          { op: 'push_back', val: 'B2', code: 'values.push_back("B2");             // añade B2 al final' },
          { op: 'push_front', val: 'A1', code: 'values.push_front("A1");            // añade A1 al principio' },
          { op: 'begin', code: 'auto position2 = values.begin();      // apunta al primer elemento' },
          { op: 'inc', code: '++position2;                          // avanza hasta el segundo elemento' },
          { op: 'insert', val: 'A2', reasig: false, code: 'values.insert(position2, "A2");     // inserta A2 antes de position2', nota: 'Contenido: A1 A2 B2. <code>position2</code> sigue valiendo y apunta a B2 (comprobado compilando).' },
          { op: 'pop_front', code: 'if (!values.empty())\n    values.pop_front();', nota: 'Queda A2 B2.' },
          { op: 'pop_back', code: 'values.pop_back();', nota: 'Queda A2. Se ha borrado B2, el nodo al que apuntaba <code>position2</code>.' },
          { op: 'clear', code: 'values.clear();' }
        ] },
      { id: '11.7.2', titulo: '19.6.2 · insertar durante el recorrido', modo: 'list', permiteAmbos: true, tipo: 'string', nombre: 'items', itN: 'it', sinIt: true, vals: ['A1', 'B2', 'C3', 'D4'],
        decl: ['std::list<std::string> items {"A1", "B2", "C3", "D4"};', 'int number = 0;'], declV: ['std::vector<std::string> items {"A1", "B2", "C3", "D4"};', 'int number = 0;'],
        pasos: e72 },
      { id: '11.8', titulo: '19.7.1-19.7.2 · vector data', modo: 'vector', tipo: 'string', nombre: 'data', sinIt: true, vals: [''], cap: 1,
        decl: ['#include <vector>', 'std::vector<std::string> data(1);     // crea un vector con un elemento vacío'],
        pasos: [
          { op: 'asig', pos: 0, val: 'A1', code: 'data[0] = "A1";                     // modifica el primer elemento' },
          { op: 'push_back', val: 'B2', code: 'data.push_back("B2");               // añade un elemento al final', nota: 'Salida: <code>data[0]</code> → A1; <code>data.front() &lt;&lt; \' \' &lt;&lt; data.back()</code> → A1 B2.' },
          { op: 'push_back', val: 'C3', code: 'data.push_back("C3");               // el vector pasa a contener tres elementos' },
          { op: 'resize', n: 8, code: 'data.resize(8);' },
          { op: 'asig', pos: 7, val: '8', code: 'data[7] = "8";' },
          { op: 'insert', pos: 'end', cnt: 2, val: '9', reasig: false, code: 'data.insert(data.end(), 2, "9");', nota: 'size() = 10, capacity() = 16. Recorrido de 11.8.2: <code>A1  B2  C3  ""  ""  ""  ""  8  9  9</code> (al revés: <code>9  9  8  ""  …  C3  B2  A1</code>).' },
          { op: 'pop_back', code: 'data.pop_back();' },
          { op: 'erase', pos: 'begin', reasig: false, code: 'if (!data.empty())\n    data.erase(data.begin());' },
          { op: 'clear', code: 'data.clear();', nota: 'size() = 0 y capacity() = 16 (comprobado): clear no libera la memoria.' }
        ] }
    ];
  }

  // ---------------- Dibujo ----------------
  function marcas(lista) {
    return lista.map(function (m) { return '<span class="clv-m clv-m-' + m.t + '">' + esc(m.txt) + '</span>'; }).join('');
  }

  function dibujarVector(c) {
    var r = c.ult || {}, h = '', i;
    var size = c.els.length, itI = c.it ? c.itIdx() : null;
    var nuevos = {};
    (r.nuevos || []).forEach(function (id) { nuevos[id] = 1; });

    function bloque(vals, cap, base, sz, opt) {
      var tot = cap + (sz === cap && !opt.fantasma ? 1 : 0);
      var b = '<div class="clv-bloque' + (opt.fantasma ? ' clv-fantasma' : '') + '">';
      b += '<div class="clv-celdas">';
      for (var k = 0; k < tot; k++) {
        var cls = 'clv-celda', val, mk = [];
        if (k >= cap) cls += ' clv-fuera';
        else if (k < sz) cls += ' clv-constr';
        else cls += ' clv-reserv';
        if (!opt.fantasma) {
          if (k < sz && nuevos[c.els[k].id]) cls += ' clv-nueva';
          if (r.desde != null && k >= r.desde && k <= sz && !r.realoc) cls += ' clv-inval';
          if (k === 0 && sz > 0) mk.push({ t: 'beg', txt: 'begin' });
          if (k === sz) mk.push({ t: 'end', txt: 'end' });
          if (itI === k && c.it && (c.it.valid || (c.it.recien && !(r.realoc && r.realoc.itIdx != null)))) mk.push(c.it.valid ? { t: 'it', txt: c.itN } : { t: 'itx', txt: c.itN + ' ✗' });
        } else {
          cls += ' clv-inval';
          if (opt.itIdx === k) mk.push({ t: 'itx', txt: c.itN + ' ✗' });
        }
        if (k < sz) val = esc(vals[k]);
        else if (k < cap) val = '<span class="clv-tenue">—</span>';
        else val = '<span class="clv-tenue">fuera</span>';
        b += '<div class="' + cls + '"><span class="clv-idx">' + (k < cap ? '[' + k + ']' : '') + '</span><span class="clv-val">' + val + '</span>' +
          '<span class="clv-addr">' + (k < cap ? hx(base + k * c.esz) : '') + '</span><span class="clv-marcas">' + marcas(mk) + '</span></div>';
      }
      b += '</div>';
      if (!opt.fantasma) {
        b += '<div class="clv-barra clv-barra-size" style="--k:' + sz + '"><span>size() = ' + sz + '</span></div>' +
             '<div class="clv-barra clv-barra-cap" style="--k:' + cap + '"><span>capacity() = ' + cap + '</span></div>';
      }
      return b + '</div>';
    }
    if (r.realoc) {
      h += '<p class="clv-fila-tit clv-mal">Bloque anterior en ' + hx(r.realoc.base) + ' (capacity ' + r.realoc.cap + '): liberado al realojar</p>';
      h += bloque(r.realoc.vals, r.realoc.cap, r.realoc.base, r.realoc.size, { fantasma: true, itIdx: r.realoc.itIdx });
      h += '<p class="clv-fila-tit">Bloque nuevo en ' + hx(c.base) + '</p>';
    } else {
      h += '<p class="clv-fila-tit">Bloque contiguo en ' + hx(c.base) + ' · ' + c.esz + ' bytes por elemento</p>';
    }
    var vals = c.els.map(function (e) { return c.fmt(e.v); });
    h += bloque(vals, c.cap, c.base, size, {});
    return h;
  }

  function dibujarList(c) {
    var r = c.ult || {}, h = '', size = c.els.length, itI = c.it ? c.itIdx() : null;
    var nuevos = {};
    (r.nuevos || []).forEach(function (id) { nuevos[id] = 1; });
    h += '<p class="clv-fila-tit">Nodos sueltos en el heap, enlazados por punteros</p><div class="clv-cadena">';
    for (var k = 0; k <= size; k++) {
      var mk = [];
      if (k === 0 && size > 0) mk.push({ t: 'beg', txt: 'begin' });
      if (k === size) mk.push({ t: 'end', txt: 'end' });
      if (itI === k && c.it && c.it.valid) mk.push({ t: 'it', txt: c.itN });
      if (k > 0) h += '<div class="clv-enlace" aria-hidden="true"><span>next →</span><span>← prev</span></div>';
      if (k < size) {
        var e = c.els[k];
        h += '<div class="clv-nodo' + (nuevos[e.id] ? ' clv-nueva' : '') + '"><span class="clv-addr">@' + hx(e.addr) + '</span><span class="clv-val">' + esc(c.fmt(e.v)) + '</span><span class="clv-marcas">' + marcas(mk) + '</span></div>';
      } else {
        h += '<div class="clv-nodo clv-centinela"><span class="clv-addr">centinela</span><span class="clv-val clv-tenue">sin dato</span><span class="clv-marcas">' + marcas(mk) + '</span></div>';
      }
    }
    h += '</div>';
    if (r.borrados && r.borrados.length) {
      h += '<p class="clv-fila-tit clv-mal">Nodos liberados por la última operación</p><div class="clv-cadena">';
      r.borrados.forEach(function (b) {
        h += '<div class="clv-nodo clv-fantasma clv-inval"><span class="clv-addr">@' + hx(b.addr) + '</span><span class="clv-val">' + esc(b.v) + '</span><span class="clv-marcas">' +
          (b.it ? marcas([{ t: 'itx', txt: c.itN + ' ✗' }]) : '') + '</span></div>';
      });
      h += '</div>';
    }
    return h;
  }

  function lecturaIt(c) {
    if (!c.it) return '<code>' + esc(c.itN) + '</code>: sin declarar';
    if (!c.it.valid) return '<code>' + esc(c.itN) + '</code>: <strong class="clv-mal">inválido ✗</strong>';
    var k = c.itIdx();
    if (k >= c.els.length) return '<code>' + esc(c.itN) + ' == ' + esc(c.nombre) + '.end()</code> (no se desreferencia)';
    return '<code>*' + esc(c.itN) + ' == ' + esc(c.lit(c.els[k].v)) + '</code>' + (c.kind === 'vector' ? ' (posición [' + k + '])' : '');
  }

  // ---------------- Componente ----------------
  MPI.componentes['cpp-list-vector'] = function (el, cfg) {
    cfg = cfg || {};
    var id = 'clv' + (++uid);
    var modoIni = ({ list: 1, vector: 1, ambos: 1 })[cfg.modo] ? cfg.modo : 'ambos';
    var ini = Array.isArray(cfg.inicial) ? cfg.inicial.slice(0, MAXN) : [10, 20, 30];
    var tipo = ini.every(function (v) { return typeof v === 'number' && isFinite(v) && Math.floor(v) === v; }) ? 'int' : 'string';
    if (tipo === 'string') ini = ini.map(function (v) { return String(v).slice(0, 8); });
    var capIni = (typeof cfg.capacidad === 'number' && cfg.capacidad > 0) ? Math.min(Math.floor(cfg.capacidad), MAXRES) : 0;
    var EJ = ejemplos();

    var modo = modoIni, L, V, ej = null, paso = 0;

    function reiniciar() {
      ej = null;
      L = new Cont('list', { tipo: tipo, vals: ini.slice() });
      V = new Cont('vector', { tipo: tipo, vals: ini.slice(), cap: capIni });
    }
    function conts() { return modo === 'list' ? [L] : modo === 'vector' ? [V] : [L, V]; }

    el.classList.add('mpi-cpp-list-vector');
    el.innerHTML =
      '<div class="mpi-sim-cab">std::list frente a std::vector <span class="clv-sub">iteradores e invalidación · 19.5-19.7</span></div>' +
      '<div class="clv-modos" role="group" aria-label="Contenedor que se muestra">' +
        '<button type="button" data-modo="list" aria-pressed="false">std::list</button>' +
        '<button type="button" data-modo="vector" aria-pressed="false">std::vector</button>' +
        '<button type="button" data-modo="ambos" aria-pressed="false">Los dos</button>' +
      '</div>' +
      '<div class="clv-ctl">' +
        '<div class="clv-grupo" role="group" aria-label="Mover el iterador"><span class="clv-etq">Iterador</span>' +
          '<button type="button" data-op="begin">it = begin()</button><button type="button" data-op="dec">--it</button>' +
          '<button type="button" data-op="inc">++it</button><button type="button" data-op="end">it = end()</button></div>' +
        '<div class="clv-grupo" role="group" aria-label="Insertar"><label class="clv-etq" for="' + id + '-val">Valor</label>' +
          '<input id="' + id + '-val" class="clv-in-val" type="text" maxlength="8" value="' + (tipo === 'int' ? '7' : 'X') + '" spellcheck="false" autocomplete="off">' +
          '<label class="clv-etq" for="' + id + '-cnt">copias</label><input id="' + id + '-cnt" class="clv-in-cnt" type="number" min="1" max="5" value="1">' +
          '<button type="button" data-op="push_back">push_back</button><button type="button" data-op="push_front">push_front</button>' +
          '<button type="button" data-op="insert">insert(it, …)</button><button type="button" data-op="asig">*it = …</button></div>' +
        '<div class="clv-grupo" role="group" aria-label="Borrar"><span class="clv-etq">Borrar</span>' +
          '<button type="button" data-op="erase">erase(it)</button><button type="button" data-op="pop_back">pop_back</button><button type="button" data-op="pop_front">pop_front</button>' +
          '<label class="clv-chk"><input type="checkbox" class="clv-reasig" checked> recoger el iterador devuelto (<code>it = …</code>) en insert y erase</label></div>' +
        '<div class="clv-grupo" role="group" aria-label="Tamaño y capacidad"><label class="clv-etq" for="' + id + '-n">n</label>' +
          '<input id="' + id + '-n" class="clv-in-n" type="number" min="0" max="' + MAXRES + '" value="8">' +
          '<button type="button" data-op="reserve">reserve(n)</button><button type="button" data-op="resize">resize(n)</button>' +
          '<button type="button" data-op="clear">clear()</button><button type="button" class="clv-reset">Reiniciar</button></div>' +
        '<p class="clv-error" role="alert"></p>' +
      '</div>' +
      '<div class="clv-ejs"><span class="clv-etq">Ejemplos del libro</span>' +
        EJ.map(function (e, i) { return '<button type="button" class="clv-ej" data-ej="' + i + '" aria-pressed="false">' + esc(e.titulo) + '</button>'; }).join('') +
        '<div class="clv-ej-barra" hidden><span class="clv-ej-sig" aria-live="polite"></span>' +
        '<button type="button" class="clv-ej-paso">Siguiente ▶</button><button type="button" class="clv-ej-salir">Salir del ejemplo</button></div>' +
      '</div>' +
      '<div class="clv-paneles"></div>' +
      '<p class="clv-nota">Direcciones ilustrativas. Crecimiento del vector al realojar: el de <strong>libc++</strong> (Apple clang 21, medido compilando): nueva capacidad = máx(2 × capacity, tamaño necesario), es decir 1 → 2 → 4 → 8 → 16…; ' +
      '<code>reserve(n)</code> reserva exactamente n. <strong>Depende de la biblioteca</strong>: otras implementaciones usan otro factor (MSVC, ×1,5).</p>';

    function $(s) { return el.querySelector(s); }

    function panel(c, k) {
      var tit = c.kind === 'list' ? 'std::list' : 'std::vector';
      var r = c.ult;
      var lineas = c.declaracion().join('\n').split('\n').map(function (l) { return { t: l, u: false }; });
      var log = c.log.slice(-12);
      if (c.log.length > 12) lineas.push({ t: '// …', u: false });
      log.forEach(function (l) { lineas.push(l); });
      var stats = 'size() = ' + c.els.length + (c.kind === 'vector' ? ' · capacity() = ' + c.cap : '');
      var resumen = tit + ' ' + c.nombre + ': ' + (c.els.length ? c.contenido() : 'vacío') + '. ' + stats + '.';
      return '<section class="clv-panel" aria-labelledby="' + id + '-t' + k + '">' +
        '<h4 class="clv-panel-tit" id="' + id + '-t' + k + '"><code>' + esc(tit) + '</code> <span class="clv-stats">' + stats + '</span></h4>' +
        '<p class="clv-oculto">' + esc(resumen) + '</p>' +
        '<div class="clv-dibujo" role="region" tabindex="0" aria-label="Memoria de ' + esc(tit) + ' (desplazable)">' + (c.kind === 'list' ? dibujarList(c) : dibujarVector(c)) + '</div>' +
        '<p class="clv-it">' + lecturaIt(c) + '</p>' +
        '<div class="clv-res' + (r && !r.ok ? ' clv-res-mal' : '') + '" aria-live="polite">' + (r ? r.expl + (r.ofrece ? ' <button type="button" class="clv-ofrece" data-k="' + k + '">Hacer ' + esc(c.nombre) + '.insert(' + esc(c.nombre) + '.begin(), …)</button>' : '') + (r.nota ? '<span class="clv-nota-ej">' + r.nota + '</span>' : '') : 'Elige una operación. El código C++ equivalente aparece debajo.') + '</div>' +
        '<pre class="clv-pre">' + lineas.map(function (l) { return '<span class="clv-ln' + (l.u ? ' clv-ult' : '') + (/^\/\/ ✗/.test(l.t) ? ' clv-ln-mal' : '') + '"><code class="lang-cpp">' + esc(l.t) + '</code></span>'; }).join('') + '</pre>' +
        (c.kind === 'vector' ? '<p class="clv-ley"><span class="clv-ley-inv"></span> posiciones cuyos iteradores, punteros o referencias de antes de la operación ya no valen</p>'
                             : '<p class="clv-ley"><span class="clv-ley-inv"></span> en std::list solo se invalidan los iteradores a los nodos borrados</p>') +
        '</section>';
    }

    function pintar() {
      var bm = el.querySelectorAll('[data-modo]');
      for (var i = 0; i < bm.length; i++) bm[i].setAttribute('aria-pressed', bm[i].getAttribute('data-modo') === modo ? 'true' : 'false');
      var be = el.querySelectorAll('.clv-ej');
      for (i = 0; i < be.length; i++) be[i].setAttribute('aria-pressed', ej && ej.id === EJ[i].id ? 'true' : 'false');
      var bar = $('.clv-ej-barra');
      bar.hidden = !ej;
      if (ej) {
        var s = ej.pasos[paso];
        $('.clv-ej-sig').innerHTML = s ? 'Paso ' + (paso + 1) + ' de ' + ej.pasos.length + ': <code>' + esc(s.code.split('\n').join(' ')) + '</code>' : 'Ejemplo terminado (' + ej.pasos.length + ' pasos).';
        $('.clv-ej-paso').disabled = !s;
      }
      var cs = conts();
      var pn = $('.clv-paneles');
      pn.classList.toggle('clv-dos', cs.length === 2);
      pn.innerHTML = cs.map(panel).join('');
      if (MPI.resaltarTodo) MPI.resaltarTodo(pn);
    }

    function registrar(c, r, codeLibro) {
      c.log.forEach(function (l) { l.u = false; });
      var lines = codeLibro && r.ok ? codeLibro.split('\n') : r.code;
      lines.forEach(function (t) { c.log.push({ t: t, u: true }); });
      c.ult = r;
    }

    function leerVal() {
      var inp = $('.clv-in-val'), v = inp.value.trim();
      if (tipo === 'int') {
        if (!/^-?\d{1,6}$/.test(v)) { inp.setAttribute('aria-invalid', 'true'); return null; }
        inp.removeAttribute('aria-invalid');
        return parseInt(v, 10);
      }
      inp.removeAttribute('aria-invalid');
      return v.slice(0, 8);
    }
    function leerNum(sel, min, max) {
      var inp = $(sel), n = parseInt(inp.value, 10);
      if (!(n >= min && n <= max)) { inp.setAttribute('aria-invalid', 'true'); return null; }
      inp.removeAttribute('aria-invalid');
      return n;
    }

    function hacer(op) {
      var a = { reasig: $('.clv-reasig').checked }, err = '';
      if (/^(push_back|push_front|insert|asig)$/.test(op)) {
        a.val = leerVal();
        if (a.val === null) err = 'El valor debe ser un entero (std::list<int> / std::vector<int>).';
        if (op === 'insert') { a.cnt = leerNum('.clv-in-cnt', 1, 5); if (a.cnt === null) err = 'Copias: de 1 a 5.'; }
      }
      if (op === 'reserve' || op === 'resize') {
        a.n = leerNum('.clv-in-n', 0, op === 'reserve' ? MAXRES : MAXN);
        if (a.n === null) err = 'n: de 0 a ' + (op === 'reserve' ? MAXRES : MAXN) + '.';
      }
      $('.clv-error').textContent = err;
      if (err) return;
      if (ej) { ej = null; }
      conts().forEach(function (c) { registrar(c, ejecutar(c, op, a)); });
      pintar();
    }

    function cargarEjemplo(i) {
      var e = EJ[i];
      ej = e; paso = 0;
      modo = (e.permiteAmbos && modo === 'ambos') ? 'ambos' : e.modo;
      var o = { tipo: e.tipo, vals: e.vals.slice(), cap: e.cap, nombre: e.nombre, itN: e.itN, sinIt: e.sinIt, decl: e.decl };
      L = new Cont('list', o);
      V = new Cont('vector', { tipo: e.tipo, vals: e.vals.slice(), cap: e.cap, nombre: e.nombre, itN: e.itN, sinIt: e.sinIt, decl: e.declV || e.decl });
      $('.clv-error').textContent = '';
      pintar();
    }
    function pasoEjemplo() {
      var s = ej && ej.pasos[paso];
      if (!s) return;
      var a = { val: s.val, n: s.n, cnt: s.cnt, reasig: !!s.reasig, pos: s.pos };
      conts().forEach(function (c) {
        var r = ejecutar(c, s.op, a);
        if (r.ok && s.nota && c.kind === ej.modo) r.nota = s.nota;
        registrar(c, r, s.code);
      });
      paso++;
      pintar();
    }

    el.addEventListener('click', function (ev) {
      var t = ev.target.closest('button');
      if (!t || !el.contains(t)) return;
      if (t.hasAttribute('data-modo')) {
        var nm = t.getAttribute('data-modo');
        if (ej && !(nm === 'ambos' && ej.permiteAmbos) && nm !== ej.modo) reiniciar();
        modo = nm; pintar(); return;
      }
      if (t.hasAttribute('data-op')) { hacer(t.getAttribute('data-op')); return; }
      if (t.classList.contains('clv-ej')) { cargarEjemplo(+t.getAttribute('data-ej')); return; }
      if (t.classList.contains('clv-ej-paso')) { pasoEjemplo(); return; }
      if (t.classList.contains('clv-ej-salir')) { reiniciar(); pintar(); return; }
      if (t.classList.contains('clv-reset')) { reiniciar(); $('.clv-error').textContent = ''; pintar(); return; }
      if (t.classList.contains('clv-ofrece')) {
        var v = leerVal(); if (v === null) return;
        ej = null;
        registrar(V, ejecutar(V, 'insert', { val: v, cnt: 1, pos: 'begin', reasig: false }));
        pintar();
      }
    });

    reiniciar();
    pintar();
  };

  // Expuesto para pruebas.
  MPI.componentes['cpp-list-vector']._Cont = Cont;
  MPI.componentes['cpp-list-vector']._ejecutar = ejecutar;
  MPI.componentes['cpp-list-vector']._ejemplos = ejemplos;
})();
