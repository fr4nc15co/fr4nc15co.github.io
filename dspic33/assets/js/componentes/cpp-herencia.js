/*
 * Componente "cpp-herencia" (tema 21, capítulo 13 del libro): jerarquía
 * CGeometry → CSegment / CCircle en tres pestañas.
 *
 *   polimorfismo  13.5-13.8: whoAmI llamado a través de CGeometry* (vector de 13.8)
 *                 con «virtual» en CGeometry::whoAmI activado o no; se ve si la
 *                 llamada pasa por la tabla virtual del objeto real o se fija por el
 *                 tipo estático del puntero.
 *   recorte       13.8.2-13.8.4: std::list<CGeometry> (copia solo la parte base)
 *                 frente a std::list<CGeometry*> y std::list<std::unique_ptr<CGeometry>>.
 *   construccion  13.5 y 13.7: orden base → miembros → cuerpo al construir un CCircle,
 *                 orden inverso al destruirlo, y delete a través de CGeometry* con y
 *                 sin destructor virtual (sin él: comportamiento indefinido).
 *
 * Uso: <div class="mpi-mount" data-componente="cpp-herencia" data-config='{"modo":"polimorfismo"}'></div>
 *   modo: "polimorfismo" (por defecto) | "recorte" | "construccion" → pestaña inicial.
 *
 * Todas las salidas son las REALES de compilar los programas con
 *   Apple clang 21.0.0, clang++ -std=c++17 -Wall -Wextra (macOS, 64 bits),
 * con un cout añadido en cada constructor y destructor (el libro no los tiene) y un
 * CPoint mínimo (el libro no lo define). Los tamaños sizeof son los de ese PC.
 */
window.MPI = window.MPI || {};
MPI.componentes = MPI.componentes || {};

(function () {
  var uid = 0;
  var MODOS = ['polimorfismo', 'recorte', 'construccion'];
  var COMPILADOR = 'Apple clang 21.0.0 · clang++ -std=c++17 -Wall -Wextra · macOS 64 bits';

  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function c(s) { return '<code>' + esc(s) + '</code>'; }

  // Listado con una línea por <span>, resaltable y marcable.
  function listado(lineas, marcadas, clase) {
    var h = '<pre class="chr-pre">';
    lineas.forEach(function (l, i) {
      var cls = 'chr-ln' + (marcadas && marcadas[i] ? ' ' + marcadas[i] : '');
      h += '<span class="' + cls + '"><code class="lang-cpp">' + esc(l === '' ? ' ' : l) + '</code></span>';
    });
    return h + '</pre>';
  }
  function resaltar(raiz) { if (MPI.resaltarTodo) MPI.resaltarTodo(raiz); }

  // ======================================================================
  // Pestaña 1: polimorfismo
  // ======================================================================
  var OBJ = [
    { cls: 'CSegment', var: 'segment', sal: 'I am a segment',
      campos: [['m_p1, m_p2', 'CPoint'], ['m_length', 'double = 0'], ['m_slope', 'double = 0']] },
    { cls: 'CCircle', var: 'circle', sal: 'I am a circle',
      campos: [['m_center', 'CPoint'], ['m_diameter', 'double = 0']] }
  ];

  function codigoPoli(virt) {
    return [
      '// CGeometry.h (21.4)',
      'class CGeometry {',
      '    ...',
      'public:',
      '    ' + (virt ? 'virtual ' : '') + 'void whoAmI(std::ostream& out) const;',
      '    virtual ~CGeometry() {};',
      '};',
      '',
      '// main (21.7)',
      'CSegment segment;',
      'CCircle circle;',
      'std::vector<CGeometry*> geometries;',
      'geometries.push_back(&segment);',
      'geometries.push_back(&circle);',
      'for (std::vector<CGeometry*>::iterator it = geometries.begin();',
      '     it != geometries.end(); ++it) {',
      '    (*it)->whoAmI(std::cout);',
      '}'
    ];
  }
  var LN_SW = 4, LN_LLAMADA = 16;

  function diagrama(virt, ejec) {
    // ejec: nombre de la función ejecutada ('CGeometry', 'CSegment', 'CCircle') o null
    function fila(sim, txt, extra) {
      return '<li' + (extra ? ' class="' + extra + '"' : '') + '><span class="chr-vis" aria-hidden="true">' + sim + '</span>' + txt + '</li>';
    }
    function who(cls) { return ejec === cls ? ' chr-ejec' : ''; }
    var base = '<div class="chr-caja chr-caja-base"><div class="chr-caja-tit">CGeometry</div><ul>' +
      fila('−', c('m_opacity : double')) +
      fila('#', c('m_message : std::string')) +
      fila('+', c('CGeometry()') + ' ' + c('CGeometry(double)')) +
      fila('+', (virt ? '<b class="chr-virt">virtual</b> ' : '<s class="chr-virt-no">virtual</s> ') + c('whoAmI(std::ostream&) const'), 'chr-sw' + who('CGeometry')) +
      fila('+', '<b class="chr-virt">virtual</b> ' + c('~CGeometry()')) +
      '</ul></div>';
    var hijos = OBJ.map(function (o) {
      return '<div class="chr-hijo"><div class="chr-hereda" aria-hidden="true">▲ : public CGeometry</div>' +
        '<div class="chr-caja"><div class="chr-caja-tit">' + o.cls + ' <span class="chr-sr">deriva públicamente de CGeometry</span></div><ul>' +
        o.campos.map(function (f) { return fila('−', c(f[0] + ' : ' + f[1].replace(/ = 0$/, ''))); }).join('') +
        fila('+', c('whoAmI(std::ostream&) const') + '<span class="chr-nota-f">' +
          (virt ? 'sobrescribe la de CGeometry' : 'no sobrescribe: oculta la de la base') + '</span>', who(o.cls)) +
        '</ul></div></div>';
    }).join('');
    return '<figure class="chr-jer" aria-label="Jerarquía de clases del capítulo 13">' + base +
      '<div class="chr-hijos">' + hijos + '</div>' +
      '<figcaption class="chr-leyenda">− private · # protected · + public (13.3)</figcaption></figure>';
  }

  function tarjetaObjeto(o, i, virt, act) {
    var on = act && act.i === i;
    var porVt = on && act.tipo === 'ptr' && virt;
    var h = '<div class="chr-obj-cab"><span class="chr-ptr' + (on && act.tipo === 'ptr' ? ' chr-on' : '') + '">' +
      c('geometries[' + i + ']') + ' <small>CGeometry*</small></span><span class="chr-flecha" aria-hidden="true">→</span>' +
      '<span class="chr-real">' + c(o.cls + ' ' + o['var']) + ' <small>objeto real</small></span></div>';
    h += '<div class="chr-capas">' +
      '<div class="chr-capa chr-capa-base"><span class="chr-capa-tit">parte CGeometry</span>' +
        '<div class="chr-campo' + (porVt ? ' chr-on' : '') + '">' + c('vptr') + ' → vtable de ' + o.cls + '</div>' +
        '<div class="chr-campo">' + c('m_opacity = 0') + ' ' + c('m_message = "I am a geometry:"') + '</div></div>' +
      '<div class="chr-capa chr-capa-der"><span class="chr-capa-tit">parte ' + o.cls + '</span><div class="chr-campo">' +
        o.campos.map(function (f) { return c(f[0]); }).join(' ') + '</div></div></div>';
    h += '<div class="chr-vt"><div class="chr-vt-tit">vtable de ' + o.cls + '</div><ul>' +
      '<li>' + c('~CGeometry') + ' → ' + c('~' + o.cls) + '</li>' +
      (virt
        ? '<li class="' + (porVt ? 'chr-on' : '') + '">' + c('whoAmI') + ' → ' + c(o.cls + '::whoAmI') + '</li>'
        : '<li class="chr-tenue">' + c(o.cls + '::whoAmI') + ' <small>virtual nueva de ' + o.cls + ': un CGeometry* no la conoce</small></li>') +
      '</ul></div>';
    return h;
  }

  function montarPoli(P, id) {
    var st = { virt: true, act: null, salida: [] };
    P.innerHTML =
      '<div class="chr-jer-wrap"></div>' +
      '<div class="chr-sw-fila"><label class="chr-switch"><input type="checkbox" role="switch" checked class="chr-sw-poli">' +
        '<span class="chr-pista" aria-hidden="true"></span><span><code>virtual</code> en <code>CGeometry::whoAmI</code></span></label></div>' +
      '<p class="chr-ovr"></p>' +
      '<div class="chr-cols">' +
        '<div class="chr-codigo"></div>' +
        '<div class="chr-objs"><div class="chr-zona-tit">' + c('std::vector<CGeometry*> geometries') + '</div>' +
          OBJ.map(function (o, i) {
            return '<div class="chr-obj"><div class="chr-obj-vis" data-i="' + i + '"></div><div class="chr-obj-btns">' +
              '<button type="button" data-acc="ptr" data-i="' + i + '">' + esc('geometries[' + i + ']->whoAmI(std::cout)') + '</button>' +
              '<button type="button" data-acc="dir" data-i="' + i + '">' + esc(o['var'] + '.whoAmI(std::cout)') + '</button>' +
              '</div></div>';
          }).join('') +
        '</div>' +
      '</div>' +
      '<div class="chr-ctl"><button type="button" class="chr-prim" data-acc="bucle">Ejecutar el bucle de 21.7</button>' +
        '<button type="button" data-acc="limpiar">Limpiar salida</button></div>' +
      '<div class="chr-expl" aria-live="polite"></div>' +
      '<div class="chr-consola-wrap"><div class="chr-zona-tit">Salida (std::cout)</div><pre class="chr-consola" tabindex="0" aria-label="Salida del programa"></pre></div>';

    function q(s) { return P.querySelector(s); }

    function rutaPtr(i) {
      var o = OBJ[i];
      if (st.virt) {
        return '<ol class="chr-ruta">' +
          '<li>' + c('geometries[' + i + ']') + ' es un ' + c('CGeometry*') + ': en compilación solo se sabe que apunta a «algo que es un CGeometry».</li>' +
          '<li>' + c('whoAmI') + ' es <b>virtual</b>: el código generado lee el <b>vptr</b> del objeto apuntado, que es ' + c(o['var']) + ' (un ' + o.cls + ').</li>' +
          '<li>En la tabla virtual de ' + o.cls + ' la entrada ' + c('whoAmI') + ' apunta a ' + c(o.cls + '::whoAmI') + ' → se ejecuta y escribe <b>«' + o.sal + '»</b>.</li>' +
          '</ol><p>La función se elige <b>en tiempo de ejecución</b> según el tipo real del objeto (enlace dinámico).</p>';
      }
      return '<ol class="chr-ruta">' +
        '<li>' + c('geometries[' + i + ']') + ' es un ' + c('CGeometry*') + '.</li>' +
        '<li>' + c('CGeometry::whoAmI') + ' <b>no es virtual</b>: el compilador elige la función por el <b>tipo estático</b> del puntero, sin mirar el objeto ni su tabla virtual.</li>' +
        '<li>Se ejecuta ' + c('CGeometry::whoAmI') + ', que escribe ' + c('m_message') + ': <b>«I am a geometry:»</b>, aunque el objeto real sea un ' + o.cls + '.</li>' +
        '</ol><p>El objeto sigue teniendo vptr (porque ' + c('~CGeometry') + ' es virtual), pero esta llamada no lo consulta.</p>';
    }
    function rutaDir(i) {
      var o = OBJ[i];
      return '<p>' + c(o['var'] + '.whoAmI(std::cout)') + ': la llamada se hace sobre el propio objeto, cuyo tipo estático ya es ' + o.cls +
        '. El compilador llama directamente a ' + c(o.cls + '::whoAmI') + ' (con o sin <code>virtual</code> en la base): <b>«' + o.sal + '»</b>. ' +
        'El polimorfismo solo aparece al llamar mediante un puntero o una referencia a la base.</p>';
    }
    function salidaPtr(i) { return st.virt ? OBJ[i].sal : 'I am a geometry:'; }

    function pintar() {
      var a = st.act;
      var ejec = null;
      if (a && a.tipo === 'ptr') ejec = st.virt ? OBJ[a.i].cls : 'CGeometry';
      if (a && a.tipo === 'dir') ejec = OBJ[a.i].cls;
      q('.chr-jer-wrap').innerHTML = diagrama(st.virt, ejec);
      var marcas = {}; marcas[LN_SW] = 'chr-ln-sw';
      if (a && (a.tipo === 'ptr' || a.tipo === 'bucle')) marcas[LN_LLAMADA] = 'chr-ln-act';
      q('.chr-codigo').innerHTML = listado(codigoPoli(st.virt), marcas);
      resaltar(q('.chr-codigo'));
      var vis = P.querySelectorAll('.chr-obj-vis');
      for (var i = 0; i < vis.length; i++) vis[i].innerHTML = tarjetaObjeto(OBJ[i], i, st.virt, a && a.tipo === 'bucle' ? { tipo: 'ptr', i: i } : a);
      q('.chr-ovr').innerHTML = st.virt
        ? 'Con <code>virtual</code>, las derivadas <b>sobrescriben</b> ' + c('whoAmI') + ' (misma signatura, incluido ' + c('const') + '). Desde C++11 conviene marcarlas con ' + c('override') + ' (21.5.1).'
        : 'Sin <code>virtual</code> en la base, el ' + c('whoAmI') + ' de las derivadas solo <b>oculta</b> al de CGeometry. Si las derivadas usaran ' + c('override') +
          ' (21.5.1) el programa no compilaría: ' + c("error: only virtual member functions can be marked 'override'") + '.';
      var ex = '';
      if (!a) ex = 'Pulsa una llamada. ' + (st.virt ? 'Ahora ' + c('whoAmI') + ' es virtual en CGeometry.' : 'Ahora ' + c('whoAmI') + ' NO es virtual en CGeometry.');
      else if (a.tipo === 'ptr') ex = '<p><b>' + esc('geometries[' + a.i + ']->whoAmI(std::cout)') + '</b></p>' + rutaPtr(a.i);
      else if (a.tipo === 'dir') ex = rutaDir(a.i);
      else ex = st.virt
        ? '<p>El bucle de 21.7 recorre el vector y llama ' + c('(*it)->whoAmI(std::cout)') + ' dos veces. Con <code>virtual</code>, cada llamada va a la tabla virtual de su objeto real: <b>«I am a segment»</b> y <b>«I am a circle»</b>, la salida que describe el libro.</p>'
        : '<p>Sin <code>virtual</code>, las dos llamadas se resuelven por el tipo ' + c('CGeometry*') + ': <b>«I am a geometry:»</b> dos veces. El vector ya no distingue segmentos de círculos.</p>';
      q('.chr-expl').innerHTML = ex;
      var con = q('.chr-consola');
      con.textContent = st.salida.length ? st.salida.join('\n') : '(vacía)';
      con.classList.toggle('chr-vacia', !st.salida.length);
      con.scrollTop = con.scrollHeight;
    }

    P.addEventListener('change', function (e) {
      if (!e.target.classList.contains('chr-sw-poli')) return;
      st.virt = e.target.checked; st.act = null; st.salida = [];
      pintar();
    });
    P.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-acc]');
      if (!b) return;
      var acc = b.getAttribute('data-acc'), i = +b.getAttribute('data-i');
      if (acc === 'limpiar') { st.salida = []; st.act = null; }
      else if (acc === 'ptr') { st.act = { tipo: 'ptr', i: i }; st.salida.push(salidaPtr(i)); }
      else if (acc === 'dir') { st.act = { tipo: 'dir', i: i }; st.salida.push(OBJ[i].sal); }
      else if (acc === 'bucle') { st.act = { tipo: 'bucle' }; st.salida.push(salidaPtr(0), salidaPtr(1)); }
      pintar();
    });
    pintar();
  }

  // ======================================================================
  // Pestaña 2: recorte de objetos
  // ======================================================================
  // Tamaños medidos en el PC (sizeof con clang 21, 64 bits, libc++).
  var CAMPOS_CIRCLE = [
    { n: 'vptr', v: '→ vtable de CCircle', b: 8, p: 'base' },
    { n: 'm_opacity', v: '0', b: 8, p: 'base' },
    { n: 'm_message', v: '"I am a geometry:"', b: 24, p: 'base' },
    { n: 'm_center', v: 'CPoint (0, 0)', b: 16, p: 'der' },
    { n: 'm_diameter', v: '0', b: 8, p: 'der' }
  ];

  // Cada opción: líneas del listado y pasos; cada paso = índice de línea + trazas reales.
  var RECORTE = [
    { tit: 'std::list<CGeometry>', corto: 'por valor',
      lineas: ['{', '    CCircle circle;', '    std::list<CGeometry> geometries;', '    geometries.push_back(circle);   // copia',
        '    geometries.back().whoAmI(std::cout);', '}'],
      pasos: [
        { l: 1, out: ['CGeometry()', '  CPoint()', 'CCircle()'], st: { pila: 'vivo' },
          ex: 'Se construye ' + c('circle') + ' en la pila: un CCircle completo de <b>64 B</b> (parte CGeometry de 40 B + ' + c('m_center') + ' y ' + c('m_diameter') + ').' },
        { l: 2, out: [], st: { pila: 'vivo', lista: 'vacia' },
          ex: 'Lista vacía. Cada nodo guardará <b>un objeto CGeometry</b> (40 B), no un CCircle.' },
        { l: 3, out: ['CGeometry(const CGeometry&)'], st: { pila: 'vivo', lista: 'copia' },
          ex: c('push_back(circle)') + ' copia el objeto dentro del nodo con el <b>constructor de copia de CGeometry</b>: solo cabe la parte base. ' +
            c('m_center') + ' y ' + c('m_diameter') + ' se pierden y el vptr de la copia apunta a la tabla de <b>CGeometry</b>: el nodo ya no es un círculo. Esto es el <b>recorte de objetos</b> (object slicing, 13.8.2).' },
        { l: 4, out: ['I am a geometry:', true], st: { pila: 'vivo', lista: 'copia', vt: 'copia' },
          ex: c('whoAmI') + ' es virtual, pero el objeto del nodo es de verdad un CGeometry: su vtable lleva a ' + c('CGeometry::whoAmI') + ' → <b>«I am a geometry:»</b>.' },
        { l: 5, out: ['~CGeometry()', '~CCircle()', '  ~CPoint()', '~CGeometry()'], st: { pila: 'muerto', lista: 'copia-muerta' },
          ex: 'Al cerrar el bloque se destruye primero ' + c('geometries') + ' (declarada después): su copia es un CGeometry y solo llama a ' + c('~CGeometry()') +
            '. Luego ' + c('circle') + ': ' + c('~CCircle()') + ', ' + c('~CPoint()') + ', ' + c('~CGeometry()') + '.' }
      ] },
    { tit: 'std::list<CGeometry*>', corto: 'punteros',
      lineas: ['{', '    CCircle circle;', '    std::list<CGeometry*> geometries;', '    geometries.push_back(&circle);',
        '    geometries.back()->whoAmI(std::cout);', '}'],
      pasos: [
        { l: 1, out: ['CGeometry()', '  CPoint()', 'CCircle()'], st: { pila: 'vivo' },
          ex: 'Se construye ' + c('circle') + ' en la pila (CCircle, 64 B).' },
        { l: 2, out: [], st: { pila: 'vivo', lista: 'vacia' },
          ex: 'Cada nodo guardará un <b>puntero</b> (8 B), sea cual sea el tamaño del objeto apuntado.' },
        { l: 3, out: [], st: { pila: 'vivo', lista: 'ptr' },
          ex: 'Se copia solo la <b>dirección</b> de ' + c('circle') + ': no se construye nada (ninguna traza) y el objeto sigue completo.' },
        { l: 4, out: ['I am a circle', true], st: { pila: 'vivo', lista: 'ptr', vt: 'pila' },
          ex: 'A través del puntero se llega al objeto real: su vptr lleva a la tabla de CCircle → ' + c('CCircle::whoAmI') + ' → <b>«I am a circle»</b>. Por eso los contenedores polimórficos almacenan punteros (13.8.2).' },
        { l: 5, out: ['~CCircle()', '  ~CPoint()', '~CGeometry()'], st: { pila: 'muerto', lista: 'ptr-muerta' },
          ex: 'La lista se destruye sin tocar el objeto (los punteros no lo poseen). Después se destruye ' + c('circle') + '. El puntero no debe usarse más allá de la vida de ' + c('circle') + '.' }
      ] },
    { tit: 'std::list<std::unique_ptr<CGeometry>>', corto: 'unique_ptr',
      lineas: ['{', '    std::list<std::unique_ptr<CGeometry>> geometries;', '    geometries.push_back(std::make_unique<CCircle>());',
        '    geometries.back()->whoAmI(std::cout);', '}'],
      pasos: [
        { l: 1, out: [], st: { lista: 'vacia' },
          ex: 'Lista de punteros <b>propietarios</b> (13.8.4): cada nodo guarda un ' + c('std::unique_ptr<CGeometry>') + ' (8 B).' },
        { l: 2, out: ['CGeometry()', '  CPoint()', 'CCircle()'], st: { lista: 'uptr', heap: 'vivo' },
          ex: c('std::make_unique<CCircle>()') + ' (C++14) crea un CCircle completo en el <b>heap</b> y el nodo pasa a ser su único propietario.' },
        { l: 3, out: ['I am a circle', true], st: { lista: 'uptr', heap: 'vivo', vt: 'heap' },
          ex: 'Igual que con el puntero normal: vtable de CCircle → <b>«I am a circle»</b>.' },
        { l: 4, out: ['~CCircle()', '  ~CPoint()', '~CGeometry()'], st: { lista: 'uptr-muerta', heap: 'muerto' },
          ex: 'Al destruirse la lista, cada ' + c('unique_ptr') + ' hace ' + c('delete') + ' de su objeto. Como ' + c('~CGeometry') +
            ' es virtual, se destruye el CCircle completo sin escribir ningún ' + c('delete') + ' (compárese con el doble bucle de 13.8.3).' }
      ] }
  ];

  function bloqueObjeto(tit, campos, estado, opts) {
    opts = opts || {};
    var muerto = estado === 'muerto';
    var h = '<div class="chr-bloque' + (muerto ? ' chr-muerto' : '') + '"><div class="chr-bloque-tit">' + tit +
      (muerto ? ' <span class="chr-tag">destruido</span>' : '') + '</div><ul class="chr-campos">';
    var parte = null;
    campos.forEach(function (f) {
      if (f.p !== parte) {
        parte = f.p;
        h += '<li class="chr-parte">' + (f.p === 'base' ? 'parte CGeometry' : f.p === 'der' ? 'parte CCircle' : 'perdido en la copia') + '</li>';
      }
      var cls = 'chr-f chr-f-' + f.p + (opts.vt && f.n === 'vptr' ? ' chr-on' : '');
      h += '<li class="' + cls + '">' + c(f.n) + ' <span class="chr-fv">' + esc(f.v) + '</span><span class="chr-fb">' + (f.b ? f.b + ' B' : '') + '</span></li>';
    });
    return h + '</ul></div>';
  }

  function montarRecorte(P) {
    var st = { op: 0, paso: 0 };
    P.innerHTML =
      '<div class="chr-ops" role="group" aria-label="Tipo de lista">' +
        RECORTE.map(function (o, i) { return '<button type="button" class="chr-op" data-op="' + i + '" aria-pressed="false">' + esc(o.tit) + '</button>'; }).join('') +
      '</div>' +
      '<div class="chr-cols">' +
        '<div><div class="chr-codigo"></div>' +
          '<div class="chr-ctl"><button type="button" class="chr-prim" data-acc="paso">Paso ▶</button>' +
          '<button type="button" data-acc="atras">◀ Atrás</button><button type="button" data-acc="reset">Reiniciar</button>' +
          '<span class="chr-cont" aria-live="polite"></span></div>' +
          '<div class="chr-expl" aria-live="polite"></div></div>' +
        '<div class="chr-mem"></div>' +
      '</div>' +
      '<div class="chr-consola-wrap"><div class="chr-zona-tit">Salida (trazas y std::cout)</div><pre class="chr-consola" tabindex="0" aria-label="Salida del programa"></pre></div>' +
      '<p class="chr-nota">Tamaños medidos en el PC donde corre el servidor C++ (clang, 64 bits): ' + c('sizeof(CGeometry) = 40') + ', ' +
        c('sizeof(CCircle) = 64') + ', ' + c('sizeof(CSegment) = 88') + '. En otra plataforma cambian; el recorte, no. Lo mismo ocurre con una variable: ' +
        c('CGeometry g = circle;') + ' también llama a ' + c('CGeometry(const CGeometry&)') + ' y ' + c('g.whoAmI') + ' escribe «I am a geometry:» (ejercicio de 13.13).</p>';

    function q(s) { return P.querySelector(s); }

    function pintarMem(s) {
      s = s || {};
      var h = '';
      // Pila
      if (st.op !== 2) {
        h += '<div class="chr-zona"><div class="chr-zona-tit">Pila</div>' +
          (s.pila ? bloqueObjeto(c('CCircle circle') + ' <small>64 B</small>', CAMPOS_CIRCLE, s.pila, { vt: s.vt === 'pila' }) : '<p class="chr-vacio">' + c('circle') + ' aún no existe</p>') + '</div>';
      }
      // Lista
      var lt = RECORTE[st.op].tit;
      h += '<div class="chr-zona"><div class="chr-zona-tit">' + c(lt + ' geometries') + '</div>';
      if (!s.lista) h += '<p class="chr-vacio">aún no declarada</p>';
      else if (s.lista === 'vacia') h += '<p class="chr-vacio">lista vacía (size = 0)</p>';
      else if (/^copia/.test(s.lista)) {
        h += bloqueObjeto('nodo 0: ' + c('CGeometry') + ' <small>40 B</small>', [
          { n: 'vptr', v: '→ vtable de CGeometry', b: 8, p: 'base' },
          { n: 'm_opacity', v: '0', b: 8, p: 'base' },
          { n: 'm_message', v: '"I am a geometry:"', b: 24, p: 'base' },
          { n: 'm_center', v: 'no se copia', b: 0, p: 'perdido' },
          { n: 'm_diameter', v: 'no se copia', b: 0, p: 'perdido' }
        ], s.lista === 'copia-muerta' ? 'muerto' : 'vivo', { vt: s.vt === 'copia' });
      } else {
        var dest = s.lista.indexOf('uptr') === 0 ? 'el CCircle del heap' : c('circle') + ' (pila)';
        var tipo = s.lista.indexOf('uptr') === 0 ? 'std::unique_ptr<CGeometry>' : 'CGeometry*';
        var muerta = /muerta$/.test(s.lista);
        h += '<div class="chr-bloque' + (muerta ? ' chr-muerto' : '') + '"><div class="chr-bloque-tit">nodo 0: ' + c(tipo) + ' <small>8 B</small>' +
          (muerta ? ' <span class="chr-tag">destruido</span>' : '') + '</div><p class="chr-apunta">→ ' + dest + '</p></div>';
      }
      h += '</div>';
      if (st.op === 2) {
        h += '<div class="chr-zona"><div class="chr-zona-tit">Heap</div>' +
          (s.heap ? bloqueObjeto(c('CCircle') + ' <small>64 B</small>', CAMPOS_CIRCLE, s.heap, { vt: s.vt === 'heap' }) : '<p class="chr-vacio">vacío</p>') + '</div>';
      }
      q('.chr-mem').innerHTML = h;
    }

    function pintar() {
      var o = RECORTE[st.op];
      var bs = P.querySelectorAll('.chr-op');
      for (var i = 0; i < bs.length; i++) bs[i].setAttribute('aria-pressed', i === st.op ? 'true' : 'false');
      var actual = st.paso ? o.pasos[st.paso - 1] : null;
      var sig = st.paso < o.pasos.length ? o.pasos[st.paso] : null;
      var marcas = {};
      if (actual) marcas[actual.l] = 'chr-ln-act';
      if (sig) marcas[sig.l] = (marcas[sig.l] ? marcas[sig.l] + ' ' : '') + 'chr-ln-sig';
      q('.chr-codigo').innerHTML = listado(o.lineas, marcas);
      resaltar(q('.chr-codigo'));
      q('[data-acc="paso"]').disabled = !sig;
      q('[data-acc="atras"]').disabled = st.paso === 0;
      q('.chr-cont').textContent = 'Paso ' + st.paso + ' de ' + o.pasos.length;
      q('.chr-expl').innerHTML = actual ? '<p><b>' + esc(o.lineas[actual.l].trim()) + '</b></p><p>' + actual.ex + '</p>'
        : 'Pulsa <b>Paso</b> para ejecutar el programa con ' + c(o.tit) + '.';
      pintarMem(actual ? actual.st : null);
      var lineas = [];
      for (var k = 0; k < st.paso; k++) {
        var out = o.pasos[k].out;
        if (out[1] === true) lineas.push('<span class="chr-out">' + esc(out[0]) + '</span>');
        else out.forEach(function (t) { lineas.push('<span class="chr-traza">' + esc(t) + '</span>'); });
      }
      var con = q('.chr-consola');
      con.innerHTML = lineas.length ? lineas.join('\n') : '<span class="chr-traza">(vacía)</span>';
      con.scrollTop = con.scrollHeight;
    }

    P.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b || !P.contains(b)) return;
      if (b.hasAttribute('data-op')) { st.op = +b.getAttribute('data-op'); st.paso = 0; pintar(); return; }
      var acc = b.getAttribute('data-acc');
      if (acc === 'paso' && st.paso < RECORTE[st.op].pasos.length) st.paso++;
      else if (acc === 'atras' && st.paso > 0) st.paso--;
      else if (acc === 'reset') st.paso = 0;
      else return;
      pintar();
    });
    pintar();
  }

  // ======================================================================
  // Pestaña 3: construcción y destrucción
  // ======================================================================
  var CAPAS = [
    { k: 'base', t: 'parte CGeometry', d: 'CGeometry()' },
    { k: 'miem', t: 'miembro m_center : CPoint', d: 'CPoint()' },
    { k: 'cuer', t: 'cuerpo de CCircle()', d: 'CCircle()' }
  ];
  var LINEAS_CON = ['{', '    CCircle c;', '}', 'CGeometry* p = new CCircle();', 'delete p;'];

  // Eventos reales (una línea de traza cada uno). o: objeto ('c' o 'p'), capa, nuevo estado.
  function eventosCon(virt) {
    var ev = [
      { l: 1, t: 'CGeometry()', o: 'c', capa: 'base', e: 'vivo', ex: 'Primero la <b>parte base</b>: la lista de inicialización de ' + c('CCircle()') + ' llama a ' + c('CGeometry()') + ' (' + c('m_opacity') + ' y ' + c('m_message') + ').' },
      { l: 1, t: '  CPoint()', o: 'c', capa: 'miem', e: 'vivo', ex: 'Después los <b>miembros</b> de CCircle en orden de declaración: ' + c('m_center') + ' (CPoint). ' + c('m_diameter') + ' es un double: se inicializa a 0.0 sin constructor ni traza.' },
      { l: 1, t: 'CCircle()', o: 'c', capa: 'cuer', e: 'vivo', ex: 'Por último el <b>cuerpo</b> del constructor de CCircle: el objeto está completo. Orden: base → miembros → derivada (13.7).' },
      { l: 2, t: '~CCircle()', o: 'c', capa: 'cuer', e: 'muerto', ex: 'Al cerrar el bloque, ' + c('c') + ' se destruye en <b>orden inverso</b>: primero el cuerpo del destructor de la derivada…' },
      { l: 2, t: '  ~CPoint()', o: 'c', capa: 'miem', e: 'muerto', ex: '…después sus miembros (' + c('m_center') + ')…' },
      { l: 2, t: '~CGeometry()', o: 'c', capa: 'base', e: 'muerto', ex: '…y al final la parte base. Derivada → miembros → base.' },
      { l: 3, t: 'CGeometry()', o: 'p', capa: 'base', e: 'vivo', ex: c('new') + ' reserva 64 B en el heap y construye igual: primero la parte base…' },
      { l: 3, t: '  CPoint()', o: 'p', capa: 'miem', e: 'vivo', ex: '…luego ' + c('m_center') + '…' },
      { l: 3, t: 'CCircle()', o: 'p', capa: 'cuer', e: 'vivo', ex: '…y el cuerpo de CCircle. ' + c('p') + ' es un ' + c('CGeometry*') + ' que apunta a la parte CGeometry del objeto.' }
    ];
    if (virt) {
      ev.push(
        { l: 4, t: '~CCircle()', o: 'p', capa: 'cuer', e: 'muerto', ex: c('delete p') + ' llama al destructor a través del puntero a base. Como ' + c('~CGeometry') + ' es <b>virtual</b>, se busca en la tabla virtual del objeto real → ' + c('~CCircle()') + '…' },
        { l: 4, t: '  ~CPoint()', o: 'p', capa: 'miem', e: 'muerto', ex: '…sus miembros…' },
        { l: 4, t: '~CGeometry()', o: 'p', capa: 'base', e: 'muerto', ex: '…y la base. Destrucción completa; después se libera la memoria del heap.' });
    } else {
      ev.push({ l: 4, t: '~CGeometry()', o: 'p', capa: 'base', e: 'muerto', ub: true,
        ex: 'Con ' + c('~CGeometry') + ' <b>no virtual</b>, ' + c('delete p') + ' elige el destructor por el tipo estático (' + c('CGeometry*') + '): solo se ejecuta ' +
          c('~CGeometry()') + '. ' + c('~CCircle()') + ' y ' + c('~CPoint()') + ' no se llaman. <b>Comportamiento indefinido.</b>' });
    }
    return ev;
  }

  function montarCons(P) {
    var st = { virt: true, paso: 0 };
    P.innerHTML =
      '<div class="chr-sw-fila"><label class="chr-switch"><input type="checkbox" role="switch" checked class="chr-sw-con">' +
        '<span class="chr-pista" aria-hidden="true"></span><span><code>virtual</code> en <code>~CGeometry()</code></span></label></div>' +
      '<div class="chr-cols">' +
        '<div><div class="chr-codigo"></div>' +
          '<div class="chr-ctl"><button type="button" class="chr-prim" data-acc="paso">Paso ▶</button>' +
          '<button type="button" data-acc="atras">◀ Atrás</button><button type="button" data-acc="reset">Reiniciar</button>' +
          '<span class="chr-cont" aria-live="polite"></span></div>' +
          '<div class="chr-expl" aria-live="polite"></div></div>' +
        '<div class="chr-mem"></div>' +
      '</div>' +
      '<div class="chr-ub" hidden></div>' +
      '<div class="chr-consola-wrap"><div class="chr-zona-tit">Salida (trazas de constructores y destructores)</div><pre class="chr-consola" tabindex="0" aria-label="Salida del programa"></pre></div>';

    function q(s) { return P.querySelector(s); }

    function capasHTML(tit, estados, final, ub) {
      var h = '<div class="chr-bloque"><div class="chr-bloque-tit">' + tit + '</div><ol class="chr-orden">';
      CAPAS.forEach(function (k) {
        var e = estados[k.k] || 'pend';
        if (e === 'vivo' && ub) e = 'ub';
        var txt = { pend: 'sin construir', vivo: 'construido', muerto: 'destruido', ub: 'nunca destruido' }[e];
        h += '<li class="chr-c chr-c-' + e + '"><span>' + esc(k.t) + '</span><span class="chr-tag">' + txt + '</span></li>';
      });
      return h + '</ol></div>';
    }

    function pintar() {
      var ev = eventosCon(st.virt);
      var est = { c: {}, p: {} }, ub = false;
      for (var k = 0; k < st.paso; k++) { est[ev[k].o][ev[k].capa] = ev[k].e; if (ev[k].ub) ub = true; }
      var act = st.paso ? ev[st.paso - 1] : null, sig = ev[st.paso] || null;
      var marcas = {};
      if (act) marcas[act.l] = 'chr-ln-act';
      if (sig) marcas[sig.l] = (marcas[sig.l] ? marcas[sig.l] + ' ' : '') + 'chr-ln-sig';
      if (!sig && st.paso) marcas[4] = 'chr-ln-act';
      q('.chr-codigo').innerHTML = listado(LINEAS_CON, marcas);
      resaltar(q('.chr-codigo'));
      q('[data-acc="paso"]').disabled = !sig;
      q('[data-acc="atras"]').disabled = st.paso === 0;
      q('.chr-cont').textContent = 'Paso ' + st.paso + ' de ' + ev.length;
      q('.chr-expl').innerHTML = act ? '<p><b>' + esc(LINEAS_CON[act.l].trim()) + '</b> → ' + c(act.t.trim()) + '</p><p>' + act.ex + '</p>'
        : 'Cada paso es una línea de la salida real. ' + (st.virt ? 'Ahora el destructor de CGeometry es virtual (como en el libro).' : 'Ahora el destructor de CGeometry NO es virtual.');

      var pCreado = st.paso >= 7, pBorrado = st.paso >= ev.length && ev.length;
      var h = '<div class="chr-zona"><div class="chr-zona-tit">Pila</div>' + capasHTML(c('CCircle c'), est.c) +
        '<div class="chr-bloque"><div class="chr-bloque-tit">' + c('CGeometry* p') + ' <small>8 B</small></div><p class="chr-apunta">' +
        (!pCreado ? 'aún no existe' : pBorrado ? 'apunta a memoria ya liberada' : '→ parte CGeometry del CCircle del heap') + '</p></div></div>' +
        '<div class="chr-zona"><div class="chr-zona-tit">Heap</div>' +
        (pCreado ? capasHTML(c('CCircle') + ' <small>64 B</small>' + (pBorrado ? ' <span class="chr-tag">memoria liberada</span>' : ''), est.p, false, ub) : '<p class="chr-vacio">vacío</p>') + '</div>';
      q('.chr-mem').innerHTML = h;

      var u = q('.chr-ub');
      if (!st.virt) {
        u.hidden = false;
        u.innerHTML = '<p><b>Comportamiento indefinido.</b> El estándar no define qué ocurre al borrar un CCircle mediante ' + c('CGeometry*') +
          ' si el destructor de la base no es virtual. En esta compilación (' + esc(COMPILADOR) + ') solo se imprime ' + c('~CGeometry()') +
          ' y el programa sigue: ' + c('~CCircle()') + ' y ' + c('~CPoint()') + ' no se ejecutan. Otro compilador u otras opciones pueden dar otra cosa.</p>' +
          '<p>clang ya avisa con ' + c('-Wall') + ': ' + c("warning: delete called on non-final 'CGeometry' that has virtual functions but non-virtual destructor [-Wdelete-non-abstract-non-virtual-dtor]") + '.</p>' +
          '<p>Si además ' + c('whoAmI') + ' tampoco fuera virtual en la base, CGeometry no tendría vptr y su parte quedaría 8 bytes dentro del objeto: ' + c('p') +
          ' ya no coincide con la dirección que devolvió ' + c('new') + ', y en la prueba el programa abortó justo después de ' + c('~CGeometry()') + ' (código de salida 133).</p>';
      } else u.hidden = true;

      var lin = [];
      for (k = 0; k < st.paso; k++) lin.push('<span class="chr-traza' + (k === st.paso - 1 ? ' chr-ultima' : '') + '">' + esc(ev[k].t) + '</span>');
      var con = q('.chr-consola');
      con.innerHTML = lin.length ? lin.join('\n') : '<span class="chr-traza">(vacía)</span>';
      con.scrollTop = con.scrollHeight;
    }

    P.addEventListener('change', function (e) {
      if (!e.target.classList.contains('chr-sw-con')) return;
      st.virt = e.target.checked; st.paso = 0; pintar();
    });
    P.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-acc]');
      if (!b) return;
      var acc = b.getAttribute('data-acc'), n = eventosCon(st.virt).length;
      if (acc === 'paso' && st.paso < n) st.paso++;
      else if (acc === 'atras' && st.paso > 0) st.paso--;
      else if (acc === 'reset') st.paso = 0;
      else return;
      pintar();
    });
    pintar();
  }

  // ======================================================================
  var CODIGO_TRAZAS = [
    'struct CPoint {                    // el libro no define CPoint',
    '    double m_x, m_y;',
    '    CPoint() : m_x(0.0), m_y(0.0) { std::cout << "  CPoint()" << std::endl; }',
    '    ~CPoint() { std::cout << "  ~CPoint()" << std::endl; }',
    '};',
    'class CGeometry {',
    '    ...',
    '    CGeometry() : m_opacity(0.0), m_message("I am a geometry:")',
    '        { std::cout << "CGeometry()" << std::endl; }',
    '    CGeometry(const CGeometry& o)',
    '        : m_opacity(o.m_opacity), m_message(o.m_message)',
    '        { std::cout << "CGeometry(const CGeometry&)" << std::endl; }',
    '    virtual ~CGeometry() { std::cout << "~CGeometry()" << std::endl; }',
    '};',
    'class CCircle : public CGeometry {',
    '    ...',
    '    CCircle() : CGeometry(), m_diameter(0.0)',
    '        { std::cout << "CCircle()" << std::endl; }',
    '    ~CCircle() { std::cout << "~CCircle()" << std::endl; }',
    '};'
  ];

  MPI.componentes['cpp-herencia'] = function (el, cfg) {
    cfg = cfg || {};
    var id = 'chr' + (++uid);
    var ini = MODOS.indexOf(cfg.modo); if (ini < 0) ini = 0;
    var TITS = ['Polimorfismo', 'Recorte de objetos', 'Construcción y destrucción'];

    el.classList.add('mpi-cpp-herencia');
    el.innerHTML =
      '<div class="mpi-sim-cab">Herencia y polimorfismo <span class="chr-sub">CGeometry → CSegment / CCircle</span></div>' +
      '<div class="chr-tabs" role="tablist" aria-label="Vistas">' +
        TITS.map(function (t, i) {
          return '<button type="button" role="tab" class="chr-tab" id="' + id + '-t' + i + '" aria-controls="' + id + '-p' + i + '" aria-selected="false" tabindex="-1">' + t + '</button>';
        }).join('') +
      '</div>' +
      TITS.map(function (t, i) {
        return '<div class="chr-panel" role="tabpanel" id="' + id + '-p' + i + '" aria-labelledby="' + id + '-t' + i + '" hidden></div>';
      }).join('') +
      '<details class="chr-detalles"><summary>Cómo se han obtenido las salidas</summary>' +
        '<p>Programas compilados y ejecutados con ' + c(COMPILADOR) + ', en las variantes con y sin ' + c('virtual') +
        ' en ' + c('whoAmI') + ' y en el destructor. A las clases del libro se les añadió un ' + c('cout') + ' en cada constructor y destructor (y un CPoint mínimo):</p>' +
        '<div class="chr-codigo-trazas">' + listado(CODIGO_TRAZAS) + '</div></details>';

    montarPoli(el.querySelector('#' + id + '-p0'), id);
    montarRecorte(el.querySelector('#' + id + '-p1'));
    montarCons(el.querySelector('#' + id + '-p2'));
    resaltar(el.querySelector('.chr-detalles'));

    var tabs = el.querySelectorAll('.chr-tab');
    function activar(i, foco) {
      for (var k = 0; k < tabs.length; k++) {
        var sel = k === i;
        tabs[k].setAttribute('aria-selected', sel ? 'true' : 'false');
        tabs[k].tabIndex = sel ? 0 : -1;
        el.querySelector('#' + tabs[k].getAttribute('aria-controls')).hidden = !sel;
      }
      if (foco) tabs[i].focus();
    }
    Array.prototype.forEach.call(tabs, function (t, i) {
      t.addEventListener('click', function () { activar(i, false); });
      t.addEventListener('keydown', function (e) {
        var n = tabs.length, d = null;
        if (e.key === 'ArrowRight') d = (i + 1) % n;
        else if (e.key === 'ArrowLeft') d = (i + n - 1) % n;
        else if (e.key === 'Home') d = 0;
        else if (e.key === 'End') d = n - 1;
        if (d !== null) { e.preventDefault(); activar(d, true); }
      });
    });
    activar(ini, false);
  };

  // Expuesto para pruebas.
  MPI.componentes['cpp-herencia']._datos = { recorte: RECORTE, eventosCon: eventosCon, modos: MODOS };
})();
