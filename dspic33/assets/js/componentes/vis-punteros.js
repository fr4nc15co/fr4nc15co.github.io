/*
 * Componente "vis-punteros": memoria byte a byte del dsPIC (little endian: byte
 * bajo en la dirección par) y ejecución paso a paso de dos programas con punteros:
 *   1) Figura 27: int i; char c; int *pti; char *ptc; pti = &i; *pti = 78; pti++; ptc++;
 *   2) Cuestión 7: int temp[] = {2,...,9}; int *p; int var; p = temp; ... var = *(p+1);
 *
 * Uso en el contenido:
 *   <div class="mpi-mount" data-componente="vis-punteros"
 *        data-config='{"i":{"dir":"0x0200","valor":5},"c":{"dir":"0x0202","valor":"0x10"},
 *                      "pti":{"dir":"0x0204"},"ptc":{"dir":"0x0208"}}'></div>
 *
 * Claves de data-config (todas opcionales):
 *   i, c          {dir, valor}  dirección y valor inicial (defecto 0x0200 = 5, 0x0202 = 0x10)
 *   pti, ptc      {dir}         dirección de cada puntero (defecto 0x0204 y 0x0208)
 *   bytesPuntero  2 o 4: bytes reservados por puntero en la Fig. 27 (defecto 4, como el libro)
 *   asigna        valor de «*pti = …» (defecto 78)
 *   cuestion7     {dir, p, var} direcciones del vector temp[] (defecto 0x0800), de p y de var
 *                 (defecto justo detrás del vector)
 *   programa      "fig27" (defecto) o "cuestion7": programa inicial
 */
window.MPI = window.MPI || {};
MPI.componentes = MPI.componentes || {};

(function () {
  var uid = 0;

  function hx(v, n) {
    var s = (v >>> 0).toString(16).toUpperCase();
    while (s.length < (n || 4)) s = '0' + s;
    return '0x' + s;
  }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function num(v, def) {
    if (typeof v === 'number' && isFinite(v)) return v;
    if (typeof v === 'string') {
      var t = v.trim();
      if (/^0x[0-9a-f]+$/i.test(t)) return parseInt(t, 16);
      if (/^-?\d+$/.test(t)) return parseInt(t, 10);
    }
    return def;
  }
  function sig16(v) { v &= 0xFFFF; return (v & 0x8000) ? v - 0x10000 : v; }

  // ---------------- Memoria ----------------
  function Memoria() { this.b = {}; this.escritos = {}; this.leidos = null; }
  Memoria.prototype.escribir = function (dir, valor, tam) {
    for (var k = 0; k < tam; k++) { this.b[dir + k] = (valor >>> (8 * k)) & 0xFF; this.escritos[dir + k] = 1; }
  };
  Memoria.prototype.leer = function (dir, tam) {
    var v = 0;
    for (var k = 0; k < tam; k++) {
      var x = this.b[dir + k];
      if (x == null) return null;
      v |= x << (8 * k);
    }
    return v >>> 0;
  };

  // Variables: {nombre, tipo, dir, tam, elem (bytes del dato apuntado / del elemento), n (vector), color}
  function valorPtr(M, v) { return M.leer(v.dir, 2); }  // 16 bits bajos (modelo corto)
  function escribirPtr(M, v, dirDestino) {
    M.escribir(v.dir, dirDestino & 0xFFFF, 2);
    if (v.tam > 2) M.escribir(v.dir + 2, 0, v.tam - 2);
  }

  // ---------------- Programa 1: Figura 27 ----------------
  function progFig27(cfg) {
    var I = { nombre: 'i', tipo: 'int', dir: num(cfg.i && cfg.i.dir, 0x0200), tam: 2 };
    var C = { nombre: 'c', tipo: 'char', dir: num(cfg.c && cfg.c.dir, 0x0202), tam: 1 };
    var bp = num(cfg.bytesPuntero, 4) === 2 ? 2 : 4;
    var PTI = { nombre: 'pti', tipo: 'int *', dir: num(cfg.pti && cfg.pti.dir, 0x0204), tam: bp, elem: 2, ptr: true, color: 0 };
    var PTC = { nombre: 'ptc', tipo: 'char *', dir: num(cfg.ptc && cfg.ptc.dir, 0x0208), tam: bp, elem: 1, ptr: true, color: 1 };
    var vi = num(cfg.i && cfg.i.valor, 5) & 0xFFFF;
    var vc = num(cfg.c && cfg.c.valor, 0x10) & 0xFF;
    var asg = num(cfg.asigna, 78) & 0xFFFF;
    var vars = [I, C, PTI, PTC];
    var ini = Math.min(I.dir, C.dir, PTI.dir, PTC.dir), fin = 0;
    vars.forEach(function (v) { fin = Math.max(fin, v.dir + v.tam - 1); });
    if (fin - ini > 63) {  // configuración incoherente: vuelve a la de la figura
      return progFig27({});
    }
    ini &= ~1;
    function rango(v) { return hx(v.dir) + (v.tam > 1 ? '–' + hx(v.dir + v.tam - 1) : ''); }
    function byteTxt(v) { return hx(v & 0xFF, 2); }

    return {
      id: 'fig27',
      titulo: 'Figura 27: i, c, pti, ptc',
      ini: ini, fin: fin, porFila: 1, vars: vars,
      nota: 'La figura del libro reserva <strong>' + bp + ' bytes por puntero</strong> (direcciones de 24 bits); aquí el valor del puntero va en los 2 bytes bajos' +
        (bp > 2 ? ' y <code>0x00</code> en los altos' : '') + '. En el modelo corto del curso un puntero ocupa <strong>16 bits</strong>.',
      lineas: [
        { c: 'int i = ' + vi + ';', decl: [I], run: function (M) {
          M.escribir(I.dir, vi, 2);
          return 'Se reservan 2 bytes para <code>i</code> (' + rango(I) + ') y se guarda ' + vi + ' = <code>' + hx(vi) + '</code>: byte bajo <code>' + byteTxt(vi) +
            '</code> en la dirección par ' + hx(I.dir) + ' y byte alto <code>' + byteTxt(vi >> 8) + '</code> en ' + hx(I.dir + 1) + ' (little endian).';
        } },
        { c: 'char c = ' + hx(vc, 2) + ';', decl: [C], run: function (M) {
          M.escribir(C.dir, vc, 1);
          return 'Un <code>char</code> ocupa 1 byte: <code>c</code> queda en ' + hx(C.dir) + ' con <code>' + hx(vc, 2) + '</code>.';
        } },
        { c: 'int *pti;', decl: [PTI], run: function () {
          return 'Se reservan ' + bp + ' bytes para <code>pti</code> (' + rango(PTI) + '). Todavía no se le ha dado valor: contiene <strong>basura</strong> (??) y no se debe usar <code>*pti</code>.';
        } },
        { c: 'char *ptc;', decl: [PTC], run: function () {
          return 'Lo mismo para <code>ptc</code> (' + rango(PTC) + '). Ambos punteros tienen el mismo tamaño; solo cambia el tipo del dato apuntado.';
        } },
        { c: 'pti = &i;', run: function (M) {
          escribirPtr(M, PTI, I.dir);
          return '<code>&amp;i</code> es la dirección de <code>i</code>, ' + hx(I.dir) + '. Se guarda en <code>pti</code>: bytes <code>' + byteTxt(I.dir) + ' ' + byteTxt(I.dir >> 8) +
            '</code> (byte bajo primero). Ahora <code>pti</code> «apunta» a <code>i</code>.';
        } },
        { c: 'ptc = &c;', run: function (M) {
          escribirPtr(M, PTC, C.dir);
          return '<code>ptc</code> = <code>&amp;c</code> = ' + hx(C.dir) + ': <code>ptc</code> apunta a <code>c</code>.';
        } },
        { c: '*pti = ' + asg + ';', run: function (M) {
          var d = valorPtr(M, PTI);
          M.escribir(d, asg, 2);
          return '<code>*pti</code> es el <code>int</code> guardado en la dirección que contiene <code>pti</code> (' + hx(d) + '), es decir, <code>i</code>. Se escribe ' + asg + ' = <code>' + hx(asg) +
            '</code> sin nombrar a <code>i</code>: ahora <code>i</code> vale ' + asg + '.';
        } },
        { c: 'pti++;', run: function (M) {
          var d = valorPtr(M, PTI);
          escribirPtr(M, PTI, d + 2);
          return '<code>pti++</code> avanza un <code>int</code> completo: suma <code>sizeof(int)</code> = <strong>2</strong> → ' + hx(d) + ' + 2 = <strong>' + hx(d + 2) + '</strong>. ' +
            'Ahora apunta detrás de <code>i</code> (donde está <code>c</code>): <code>*pti</code> ya no corresponde a ninguna variable <code>int</code>.';
        } },
        { c: 'ptc++;', run: function (M) {
          var d = valorPtr(M, PTC);
          escribirPtr(M, PTC, d + 1);
          return '<code>ptc++</code> avanza un <code>char</code>: suma <code>sizeof(char)</code> = <strong>1</strong> → ' + hx(d) + ' + 1 = <strong>' + hx(d + 1) + '</strong>. ' +
            'Misma operación <code>++</code>, distinto incremento: lo decide el tipo apuntado.';
        } }
      ]
    };
  }

  // ---------------- Programa 2: Cuestión 7 ----------------
  function progCuestion7(cfg) {
    var q = cfg.cuestion7 || {};
    var base = num(q.dir, 0x0800) & ~1;
    var datos = [2, 3, 4, 5, 6, 7, 8, 9];
    var T = { nombre: 'temp', tipo: 'int []', dir: base, tam: 16, elem: 2, n: 8 };
    var P = { nombre: 'p', tipo: 'int *', dir: num(q.p, base + 16) & ~1, tam: 2, elem: 2, ptr: true, color: 0 };
    var V = { nombre: 'var', tipo: 'int', dir: num(q['var'], base + 18) & ~1, tam: 2 };
    var vars = [T, P, V];
    var ini = Math.min(T.dir, P.dir, V.dir), fin = 0;
    vars.forEach(function (v) { fin = Math.max(fin, v.dir + v.tam - 1); });
    if (fin - ini > 63) return progCuestion7({});
    function idx(d) { return (d - T.dir) / 2; }
    function nomElem(d) {
      var k = idx(d);
      return (k >= 0 && k < 8 && k === Math.floor(k)) ? 'temp[' + k + ']' : 'la dirección ' + hx(d);
    }
    function leerVar(M, d, etq) {
      var v = M.leer(d, 2);
      M.escribir(V.dir, v == null ? 0 : v, 2);
      M.leidos = { dir: d, tam: 2, etq: etq };
      return v == null ? 0 : sig16(v);
    }
    return {
      id: 'cuestion7',
      titulo: 'Cuestión 7: vector temp[]',
      ini: ini, fin: fin, porFila: 2, vars: vars,
      nota: 'Cada fila es una palabra de 16 bits: el byte de la dirección par es el <strong>bajo</strong>. Aquí <code>p</code> ocupa 16 bits (modelo corto del curso).',
      lineas: [
        { c: 'int temp[] = {2,3,4,5,6,7,8,9};', decl: [T], run: function (M) {
          datos.forEach(function (x, k) { M.escribir(T.dir + 2 * k, x, 2); });
          return 'El vector ocupa 8 × 2 = 16 bytes seguidos, de ' + hx(T.dir) + ' a ' + hx(T.dir + 15) + '. <code>temp[k]</code> está en ' + hx(T.dir) + ' + 2·k.';
        } },
        { c: 'int *p;', decl: [P], run: function () { return 'Se reserva <code>p</code> en ' + hx(P.dir) + ' (2 bytes); todavía contiene basura.'; } },
        { c: 'int var;', decl: [V], run: function () { return 'Se reserva <code>var</code> en ' + hx(V.dir) + '; todavía contiene basura.'; } },
        { c: 'p = temp;', run: function (M) {
          escribirPtr(M, P, T.dir);
          return 'El nombre de un vector es la dirección de su primer elemento: <code>temp</code> ≡ <code>&amp;temp[0]</code> = ' + hx(T.dir) + '.';
        } },
        { c: 'var = *p;', run: function (M) {
          var d = valorPtr(M, P), v = leerVar(M, d, '*p');
          return '<code>*p</code> lee el <code>int</code> de ' + hx(d) + ' (' + nomElem(d) + '): <strong>var = ' + v + '</strong>.';
        } },
        { c: 'p = &temp[3];', run: function (M) {
          var d = T.dir + 6;
          escribirPtr(M, P, d);
          return '<code>&amp;temp[3]</code> = ' + hx(T.dir) + ' + 3·2 = ' + hx(d) + '.';
        } },
        { c: 'var = *p;', run: function (M) {
          var d = valorPtr(M, P), v = leerVar(M, d, '*p');
          return '<code>*p</code> lee ' + nomElem(d) + ' en ' + hx(d) + ': <strong>var = ' + v + '</strong>.';
        } },
        { c: 'var = p[2];', run: function (M) {
          var d0 = valorPtr(M, P), d = (d0 + 4) & 0xFFFF, v = leerVar(M, d, 'p[2]');
          return '<code>p[2]</code> ≡ <code>*(p + 2)</code>: ' + hx(d0) + ' + 2·sizeof(int) = ' + hx(d) + ' → ' + nomElem(d) + ': <strong>var = ' + v + '</strong>. <code>p</code> no cambia.';
        } },
        { c: 'p++;', run: function (M) {
          var d = valorPtr(M, P);
          escribirPtr(M, P, d + 2);
          return '<code>p++</code> avanza un <code>int</code>: ' + hx(d) + ' + 2 = <strong>' + hx(d + 2) + '</strong> (' + nomElem(d + 2) + ').';
        } },
        { c: 'var = *(p+1);', run: function (M) {
          var d0 = valorPtr(M, P), d = (d0 + 2) & 0xFFFF, v = leerVar(M, d, '*(p+1)');
          return '<code>*(p+1)</code>: ' + hx(d0) + ' + 1·2 = ' + hx(d) + ' → ' + nomElem(d) + ': <strong>var = ' + v + '</strong>. Valores de var en la traza: 2, 5, 7, 7.';
        } }
      ]
    };
  }

  // Ejecuta las k primeras líneas desde cero.
  function ejecutar(prog, k) {
    var M = new Memoria(), decl = {}, expl = '';
    for (var i = 0; i < k; i++) {
      M.escritos = {}; M.leidos = null;
      var l = prog.lineas[i];
      (l.decl || []).forEach(function (v) { decl[v.nombre] = 1; });
      expl = l.run(M);
    }
    if (k === 0) M.escritos = {};
    return { M: M, decl: decl, expl: expl };
  }

  MPI.componentes['vis-punteros'] = function (el, cfg) {
    cfg = cfg || {};
    var id = 'vp' + (++uid);
    var progs = [progFig27(cfg), progCuestion7(cfg)];
    var actual = cfg.programa === 'cuestion7' ? 1 : 0;
    var paso = 0;

    el.classList.add('mpi-vis-punteros');
    el.innerHTML =
      '<div class="mpi-sim-cab">Memoria y punteros <span class="vp-sub">dsPIC33 · int 2 bytes, char 1 byte, little endian</span></div>' +
      '<div class="vp-progs" role="group" aria-label="Programa">' +
        progs.map(function (p, i) { return '<button type="button" class="vp-prog-btn" data-prog="' + i + '" aria-pressed="false">' + p.titulo + '</button>'; }).join('') +
      '</div>' +
      '<div class="vp-cuerpo">' +
        '<div class="vp-izq">' +
          '<div class="vp-codigo"></div>' +
          '<div class="vp-controles">' +
            '<button type="button" class="vp-paso">Paso ▶</button>' +
            '<button type="button" class="vp-atras">◀ Atrás</button>' +
            '<button type="button" class="vp-reset">Reiniciar</button>' +
            '<span class="vp-contador" aria-live="polite"></span>' +
          '</div>' +
          '<div class="vp-expl" id="' + id + '-ex" aria-live="polite"></div>' +
          '<table class="vp-vars"><caption>Variables</caption><thead><tr><th scope="col">Variable</th><th scope="col">Dirección</th><th scope="col">Valor</th></tr></thead><tbody></tbody></table>' +
        '</div>' +
        '<div class="vp-der">' +
          '<div class="vp-mem-wrap" tabindex="0" role="region" aria-label="Mapa de memoria"><table class="vp-mem"></table></div>' +
          '<p class="vp-nota"></p>' +
        '</div>' +
      '</div>';

    function $(s) { return el.querySelector(s); }

    function pintarCodigo() {
      var p = progs[actual];
      var h = '<pre class="vp-pre">';
      p.lineas.forEach(function (l, i) {
        h += '<span class="vp-linea" data-l="' + i + '"><span class="vp-marca" aria-hidden="true"></span><span class="vp-num" aria-hidden="true">' + (i + 1) + '</span><code class="lang-c">' + esc(l.c) + '</code></span>';
      });
      $('.vp-codigo').innerHTML = h + '</pre>';
      if (MPI.resaltarTodo) MPI.resaltarTodo($('.vp-codigo'));
    }

    // Unidades a mostrar (una por variable simple o por elemento del vector).
    function unidades(p, decl) {
      var u = [];
      p.vars.forEach(function (v) {
        if (!decl[v.nombre]) return;
        if (v.n) for (var k = 0; k < v.n; k++) u.push({ etq: v.nombre + '[' + k + ']', dir: v.dir + 2 * k, tam: 2, v: v, tipo: 'int' });
        else u.push({ etq: v.nombre, dir: v.dir, tam: v.tam, v: v, tipo: v.tipo });
      });
      return u;
    }
    function textoValor(M, u) {
      var t = u.tipo;
      if (u.v.ptr) {
        var d = M.leer(u.v.dir, 2);
        return d == null ? '?? (sin inicializar)' : hx(d);
      }
      var x = M.leer(u.dir, u.tam);
      if (x == null) return '??';
      if (t === 'char') return hx(x, 2) + ' (' + x + ')';
      return sig16(x) + ' (' + hx(x) + ')';
    }

    function pintar() {
      var p = progs[actual];
      var r = ejecutar(p, paso), M = r.M;
      var bp = el.querySelectorAll('.vp-prog-btn');
      for (var i = 0; i < bp.length; i++) bp[i].setAttribute('aria-pressed', i === actual ? 'true' : 'false');

      // Líneas: la recién ejecutada resaltada; ▶ en la siguiente.
      var ls = el.querySelectorAll('.vp-linea');
      for (i = 0; i < ls.length; i++) {
        ls[i].classList.toggle('vp-hecha', i < paso);
        ls[i].classList.toggle('vp-actual', i === paso - 1);
        ls[i].classList.toggle('vp-sig', i === paso);
        ls[i].querySelector('.vp-marca').textContent = i === paso ? '▶' : '';
      }
      $('.vp-paso').disabled = paso >= p.lineas.length;
      $('.vp-atras').disabled = paso === 0;
      $('.vp-contador').textContent = 'Paso ' + paso + ' de ' + p.lineas.length;
      $('.vp-expl').innerHTML = paso === 0
        ? 'Pulsa <strong>Paso</strong> para ejecutar la primera línea. La memoria empieza con contenido desconocido (??).'
        : '<strong>Línea ' + paso + ':</strong> <code>' + esc(p.lineas[paso - 1].c) + '</code><br>' + r.expl;
      $('.vp-nota').innerHTML = p.nota;

      // Punteros declarados con valor: destino [dir, dir+elem)
      var punteros = [];
      p.vars.forEach(function (v) {
        if (!v.ptr || !r.decl[v.nombre]) return;
        var d = M.leer(v.dir, 2);
        if (d != null) punteros.push({ v: v, dir: d, tam: v.elem });
      });

      // --- Tabla de memoria ---
      var us = unidades(p, r.decl);
      var pf = p.porFila;
      var h = '<caption class="vp-oculto">Memoria de ' + hx(p.ini) + ' a ' + hx(p.fin) + '</caption><thead><tr><th scope="col">Dirección</th>' +
        (pf === 1 ? '<th scope="col">Byte</th>' : '<th scope="col">Byte bajo<br><span>(par)</span></th><th scope="col">Byte alto<br><span>(impar)</span></th>') +
        '<th scope="col">Variable</th><th scope="col">Valor</th><th scope="col">Apuntado por</th></tr></thead><tbody>';
      for (var a = p.ini; a <= p.fin; a += pf) {
        var cls = [];
        var badges = '';
        punteros.forEach(function (pt) {
          if (pt.dir < a + pf && pt.dir + pt.tam > a) {
            cls.push('vp-ptr' + pt.v.color);
            if (pt.dir >= a) badges += '<span class="vp-badge vp-b' + pt.v.color + '">← ' + pt.v.nombre + '</span>';
          }
        });
        if (M.leidos && M.leidos.dir < a + pf && M.leidos.dir + M.leidos.tam > a) {
          cls.push('vp-leido');
          if (M.leidos.dir >= a) badges += '<span class="vp-badge vp-bl">lee ' + esc(M.leidos.etq) + '</span>';
        }
        h += '<tr class="' + cls.join(' ') + '"><th scope="row">' + hx(a) + '</th>';
        for (var k = 0; k < pf; k++) {
          var x = M.b[a + k];
          var cb = 'vp-byte' + (M.escritos[a + k] ? ' vp-cambio' : '') + (x == null ? ' vp-basura' : '');
          h += '<td class="' + cb + '">' + (x == null ? '??' : hx(x, 2).slice(2)) + '</td>';
        }
        // Variable y valor (rowspan si la unidad ocupa varias filas)
        var enFila = us.filter(function (u) { return u.dir < a + pf && u.dir + u.tam > a; });
        if (enFila.length === 1) {
          var u = enFila[0];
          var primeraFila = u.dir >= a || a === p.ini;
          if (primeraFila) {
            var filas = 0;
            for (var b = a; b <= p.fin && b < u.dir + u.tam; b += pf) filas++;
            var rs = filas > 1 ? ' rowspan="' + filas + '"' : '';
            h += '<td class="vp-var"' + rs + '><code>' + esc(u.etq) + '</code><span class="vp-tipo">' + esc(u.tipo) + '</span></td>' +
                 '<td class="vp-val"' + rs + '>' + textoValor(M, u) + '</td>';
          }
        } else if (enFila.length === 0) {
          h += '<td class="vp-var vp-libre">—</td><td class="vp-val vp-libre">' + (p.vars.some(function (v) { return v.dir < a + pf && v.dir + v.tam > a; }) ? 'aún no reservada' : 'no usada') + '</td>';
        } else {
          h += '<td class="vp-var">' + enFila.map(function (u) { return '<code>' + esc(u.etq) + '</code>'; }).join(', ') + '</td><td class="vp-val">' +
            enFila.map(function (u) { return textoValor(M, u); }).join(' · ') + '</td>';
        }
        h += '<td class="vp-apunta">' + badges + '</td></tr>';
      }
      h += '</tbody>';
      $('.vp-mem').innerHTML = h;

      // --- Variables ---
      var filasV = '';
      p.vars.forEach(function (v) {
        if (!r.decl[v.nombre]) return;
        var val;
        if (v.n) {
          var xs = [];
          for (var k = 0; k < v.n; k++) { var e = M.leer(v.dir + 2 * k, 2); xs.push(e == null ? '??' : sig16(e)); }
          val = '{' + xs.join(', ') + '}';
        } else if (v.ptr) {
          var d = M.leer(v.dir, 2);
          if (d == null) val = '?? <span class="vp-tenue">(sin inicializar)</span>';
          else {
            var obj = M.leer(d, v.elem);
            var objTxt = obj == null ? '??' : (v.elem === 1 ? hx(obj, 2) : String(sig16(obj)));
            val = '<span class="vp-b' + v.color + ' vp-badge">' + hx(d) + '</span> → <code>*' + v.nombre + '</code> = ' + objTxt;
          }
        } else {
          val = textoValor(M, { v: v, dir: v.dir, tam: v.tam, tipo: v.tipo });
        }
        var declTxt = v.tipo.replace(/\s*[*\[\]]+/g, '') + ' ' + (v.ptr ? '*' : '') + v.nombre + (v.n ? '[' + v.n + ']' : '');
        filasV += '<tr><td><code>' + esc(declTxt) + '</code></td><td class="vp-dir">' + hx(v.dir) + '</td><td>' + val + '</td></tr>';
      });
      $('.vp-vars tbody').innerHTML = filasV || '<tr><td colspan="3" class="vp-tenue">Ninguna variable declarada todavía.</td></tr>';
    }

    el.addEventListener('click', function (e) {
      var t = e.target.closest('button');
      if (!t || !el.contains(t)) return;
      if (t.classList.contains('vp-prog-btn')) {
        actual = +t.getAttribute('data-prog'); paso = 0; pintarCodigo(); pintar(); return;
      }
      if (t.classList.contains('vp-paso') && paso < progs[actual].lineas.length) paso++;
      else if (t.classList.contains('vp-atras') && paso > 0) paso--;
      else if (t.classList.contains('vp-reset')) paso = 0;
      else return;
      pintar();
    });

    pintarCodigo();
    pintar();
  };

  // Expuesto para pruebas.
  MPI.componentes['vis-punteros']._ejecutar = ejecutar;
  MPI.componentes['vis-punteros']._programas = function (cfg) { return [progFig27(cfg || {}), progCuestion7(cfg || {})]; };
})();
