/*
 * Componente "cpp-shared-ptr": propiedad compartida en C++11 paso a paso (tema 20, cap. 12).
 * Pila con los shared_ptr / weak_ptr como cajas, heap con cada objeto y su bloque de control
 * (contador fuerte use_count y contador débil), flechas de propiedad (continuas: shared_ptr,
 * discontinuas: weak_ptr) y salida del programa. Cuando el contador fuerte llega a 0 el
 * objeto se destruye y su destructor aparece en la salida y en el registro.
 *
 * Uso en el contenido:
 *   <div class="mpi-mount" data-componente="cpp-shared-ptr" data-config='{"escenario":"12.6"}'></div>
 *
 * Claves de data-config:
 *   escenario  "12.6"   first / second, use_count() y reset()             (2 → 1)
 *              "12.6.1" mostrarUso() por valor (libro), por const& y con std::move (1 → 2 → 1)
 *              "12.6.2" ciclo Motor ↔ Pantalla: con shared_ptr (fuga) o con weak_ptr + lock()
 *              Cualquier otro valor → "12.6".
 *
 * Las trazas están comprobadas compilando con Apple clang 21 (clang++ -std=c++17 -Wall -Wextra);
 * para ver la destrucción, el destructor de CComplex lleva un cout (en el libro es = default).
 */
window.MPI = window.MPI || {};
MPI.componentes = MPI.componentes || {};

(function () {
  var uid = 0;
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function clon(o) { return JSON.parse(JSON.stringify(o)); }

  // ---------------- Constructor de trazas ----------------
  // Estado: { pila: [{f, sale, vars: [{n, tipo, a, debil, ref, sale, toca}]}],
  //           heap: [{id, clase, valor, estado, miembros: [{n, tipo, a, debil}]}], salida: [] }
  // estado del objeto: vivo | destruyendo (se ejecuta su destructor) | destruido (objeto
  // destruido, bloque de control aún vivo por un weak_ptr) | liberado | fuga.
  // Los contadores NO se guardan: se calculan contando punteros (ver contadores()).
  function Traza() {
    this.st = { pila: [{ f: 'main', vars: [] }], heap: [], salida: [] };
    this.pasos = [];
  }
  Traza.prototype.marco = function (f) { this.st.pila.push({ f: f, vars: [] }); };
  Traza.prototype.finMarco = function () { this.st.pila[this.st.pila.length - 1].sale = true; };
  Traza.prototype.buscar = function (n, f) {
    for (var i = this.st.pila.length - 1; i >= 0; i--) {
      var m = this.st.pila[i];
      if (f && m.f !== f) continue;
      for (var k = 0; k < m.vars.length; k++) if (m.vars[k].n === n && !m.vars[k].sale) return m.vars[k];
    }
    throw new Error('variable ' + n);
  };
  Traza.prototype.decl = function (n, tipo, a, op) {
    op = op || {};
    this.st.pila[this.st.pila.length - 1].vars.push({ n: n, tipo: tipo, a: a, debil: !!op.debil, ref: op.ref || null, ambito: op.ambito || null, toca: true });
  };
  Traza.prototype.set = function (n, a, f) { var v = this.buscar(n, f); v.a = a; v.toca = true; };
  Traza.prototype.sale = function (n, f) { var v = this.buscar(n, f); v.sale = true; v.toca = true; };
  Traza.prototype.obj = function (id, clase, valor, miembros) {
    this.st.heap.push({ id: id, clase: clase, valor: valor || '', estado: 'vivo', miembros: miembros || [] });
  };
  Traza.prototype.o = function (id) {
    for (var i = 0; i < this.st.heap.length; i++) if (this.st.heap[i].id === id) return this.st.heap[i];
    throw new Error('objeto ' + id);
  };
  Traza.prototype.estado = function (id, e) { this.o(id).estado = e; };
  Traza.prototype.miembro = function (id, n, a) {
    var ms = this.o(id).miembros;
    for (var i = 0; i < ms.length; i++) if (ms[i].n === n) { ms[i].a = a; ms[i].toca = true; return; }
    throw new Error('miembro ' + n);
  };
  Traza.prototype.out = function (t) { this.st.salida.push(t); };
  Traza.prototype.paso = function (linea, expl, reg) {
    this.pasos.push({ linea: linea, expl: expl, reg: reg, st: clon(this.st) });
    // Limpieza para el paso siguiente: lo que «sale» desaparece y se borran las marcas.
    var st = this.st;
    st.pila = st.pila.filter(function (m) { return !m.sale; });
    st.pila.forEach(function (m) {
      m.vars = m.vars.filter(function (v) { return !v.sale; });
      m.vars.forEach(function (v) { v.toca = false; });
    });
    st.heap = st.heap.filter(function (o) { return o.estado !== 'liberado'; });
    st.heap.forEach(function (o) { o.miembros.forEach(function (m) { m.toca = false; }); });
    return this;
  };

  // Contadores fuerte (use_count) y débil de cada objeto, contando los punteros vivos.
  function contadores(st) {
    var c = {};
    st.heap.forEach(function (o) { c[o.id] = { fuerte: 0, debil: 0 }; });
    function cuenta(p) {
      if (!p.a || p.sale || p.ref || !c[p.a]) return;
      c[p.a][p.debil ? 'debil' : 'fuerte']++;
    }
    st.pila.forEach(function (m) { m.vars.forEach(cuenta); });
    st.heap.forEach(function (o) {
      if (o.estado === 'vivo' || o.estado === 'destruyendo' || o.estado === 'fuga') o.miembros.forEach(cuenta);
    });
    return c;
  }

  var SP = 'shared_ptr<CComplex>';
  var NOTA_CC = 'Para ver cuándo se destruye el objeto, el destructor de <code>CComplex</code> lleva un <code>cout</code> que imprime <code>~CComplex()</code> (en el libro es <code>= default</code>). ' +
    'Traza comprobada compilando con <code>clang++ -std=c++17</code>.';

  // ---------------- 12.6: copia y reset ----------------
  function v126() {
    var t = new Traza();
    t.obj('A', 'CComplex', '(3,4)');
    t.decl('first', SP, 'A');
    t.paso(2, '<code>make_shared&lt;CComplex&gt;(3.0, 4.0)</code> reserva <strong>un solo bloque</strong> en el heap con el objeto y su bloque de control, construye el <code>CComplex(3,4)</code> y devuelve el primer propietario, <code>first</code>. <strong>use_count = 1</strong>.',
      'L2 · make_shared crea CComplex(3,4): use_count = 1');
    t.decl('second', SP, 'A');
    t.paso(3, 'Copiar un <code>shared_ptr</code> no copia el objeto: <code>second</code> apunta al mismo <code>CComplex</code> y el contador de propietarios sube: <strong>use_count = 2</strong>.',
      'L3 · second = first: use_count 1 → 2');
    t.out('2');
    t.paso(4, '<code>first.use_count()</code> devuelve cuántos <code>shared_ptr</code> poseen el objeto: imprime <strong>2</strong> (igual que <code>second.use_count()</code>; el contador es del objeto, no de cada puntero).',
      'L4 · imprime 2');
    t.set('second', null);
    t.paso(5, '<code>second.reset()</code>: <code>second</code> deja de ser propietario y queda vacío (<code>nullptr</code>). El contador baja a <strong>1</strong>; el objeto sigue vivo porque <code>first</code> aún lo posee.',
      'L5 · second.reset(): use_count 2 → 1');
    t.out('1');
    t.paso(6, 'Imprime <strong>1</strong>: solo queda <code>first</code>.', 'L6 · imprime 1');
    t.sale('second'); t.sale('first'); t.finMarco();
    t.estado('A', 'liberado'); t.out('~CComplex()');
    t.paso(8, 'Al cerrar <code>main</code> se destruyen las variables locales en orden inverso: <code>second</code> (vacío, no hace nada) y <code>first</code>, el último propietario. use_count llega a <strong>0</strong>: se ejecuta <code>~CComplex()</code> y se libera el bloque. Nadie ha escrito <code>delete</code>.',
      'L8 · fin de main: use_count 1 → 0 → ~CComplex()');
    return t.pasos;
  }

  // ---------------- 12.6.1: por valor, const& y std::move ----------------
  var F1 = '    std::cout << "Dentro: " << value.use_count() << \'\\n\'; // muestra ';
  function codigo1261(firma, cDentro, llamada, cDespues) {
    return [
      'void mostrarUso(' + firma + ') {',
      F1 + cDentro,
      '}',
      '',
      'int main() {',
      '    std::shared_ptr<CComplex> value = std::make_shared<CComplex>(3.0, 4.0);',
      '    std::cout << "Antes: " << value.use_count() << \'\\n\';   // muestra 1',
      '    ' + llamada,
      '    std::cout << "Después: " << value.use_count() << \'\\n\'; // muestra ' + cDespues,
      '    return 0;',
      '}'
    ];
  }
  function inicio1261(t) {
    t.obj('A', 'CComplex', '(3,4)');
    t.decl('value', SP, 'A');
    t.paso(6, '<code>make_shared</code> crea el <code>CComplex(3,4)</code> con su bloque de control; <code>value</code> es su único propietario: <strong>use_count = 1</strong>.',
      'L6 · make_shared: use_count = 1');
    t.out('Antes: 1');
    t.paso(7, 'Imprime <strong>Antes: 1</strong>.', 'L7 · Antes: 1');
  }
  function fin1261(t, destruye) {
    t.sale('value'); t.finMarco();
    if (destruye) {
      t.estado('A', 'liberado'); t.out('~CComplex()');
      t.paso(11, 'Fin de <code>main</code>: se destruye <code>value</code>, el último propietario. use_count llega a <strong>0</strong> → <code>~CComplex()</code> y el bloque se libera.',
        'L11 · fin de main: use_count 1 → 0 → ~CComplex()');
    } else {
      t.paso(11, 'Fin de <code>main</code>: <code>value</code> está vacío y su destrucción no hace nada. El objeto ya se destruyó en la línea 3.',
        'L11 · fin de main: value vacío, nada que destruir');
    }
  }
  function v1261valor() {
    var t = new Traza();
    inicio1261(t);
    t.marco('mostrarUso'); t.decl('value', SP, 'A');
    t.paso(8, 'Llamada <strong>por valor</strong>: el parámetro <code>value</code> de <code>mostrarUso</code> se construye <strong>copiando</strong> el argumento. Es un segundo propietario durante la llamada: <strong>use_count = 2</strong>.',
      'L8 · copia al parámetro: use_count 1 → 2');
    t.out('Dentro: 2');
    t.paso(2, 'Dentro de la función hay dos propietarios (el <code>value</code> de <code>main</code> y el parámetro): imprime <strong>Dentro: 2</strong>.', 'L2 · Dentro: 2');
    t.sale('value', 'mostrarUso'); t.finMarco();
    t.paso(3, 'Al terminar la función se destruye su parámetro: use_count baja a <strong>1</strong>. El objeto no se destruye porque <code>main</code> sigue siendo propietario.',
      'L3 · fin de mostrarUso: use_count 2 → 1');
    t.out('Después: 1');
    t.paso(9, 'Imprime <strong>Después: 1</strong>. Secuencia del libro: 1 → 2 → 1.', 'L9 · Después: 1');
    fin1261(t, true);
    return t.pasos;
  }
  function v1261ref() {
    var t = new Traza();
    inicio1261(t);
    t.marco('mostrarUso'); t.decl('value', 'const shared_ptr<CComplex>&', null, { ref: 'value de main' });
    t.paso(8, 'Con <code>const std::shared_ptr&lt;CComplex&gt;&amp;</code> el parámetro es una <strong>referencia</strong> al <code>value</code> de <code>main</code>: no se copia, no hay nuevo propietario y <strong>use_count sigue en 1</strong>. Basta cuando la función solo necesita acceder al objeto.',
      'L8 · paso por const&: sin copia, use_count = 1');
    t.out('Dentro: 1');
    t.paso(2, 'Imprime <strong>Dentro: 1</strong>: el único propietario sigue siendo <code>value</code> de <code>main</code>.', 'L2 · Dentro: 1');
    t.sale('value', 'mostrarUso'); t.finMarco();
    t.paso(3, 'Al terminar la función desaparece la referencia sin tocar el contador.', 'L3 · fin de mostrarUso: use_count = 1');
    t.out('Después: 1');
    t.paso(9, 'Imprime <strong>Después: 1</strong>. Secuencia: 1 → 1 → 1.', 'L9 · Después: 1');
    fin1261(t, true);
    return t.pasos;
  }
  function v1261move() {
    var t = new Traza();
    inicio1261(t);
    t.marco('mostrarUso'); t.decl('value', SP, 'A');
    t.set('value', null, 'main');
    t.paso(8, '<code>std::move(value)</code> construye el parámetro <strong>trasladando</strong> esa instancia: el parámetro se queda con la propiedad y el <code>value</code> de <code>main</code> queda <strong>vacío</strong>. Sigue habiendo un solo propietario: <strong>use_count = 1</strong>.',
      'L8 · std::move: main::value vacío, use_count = 1');
    t.out('Dentro: 1');
    t.paso(2, 'Imprime <strong>Dentro: 1</strong>.', 'L2 · Dentro: 1');
    t.sale('value', 'mostrarUso'); t.finMarco();
    t.estado('A', 'liberado'); t.out('~CComplex()');
    t.paso(3, 'El parámetro era el <strong>único</strong> propietario: al terminar la función use_count llega a <strong>0</strong> y el <code>CComplex</code> se destruye <strong>aquí</strong>, antes de volver a <code>main</code>.',
      'L3 · fin de mostrarUso: use_count 1 → 0 → ~CComplex()');
    t.out('Después: 0');
    t.paso(9, '<code>value</code> está vacío y <code>use_count()</code> de un <code>shared_ptr</code> vacío vale <strong>0</strong>. std::move no hace exclusiva la propiedad: si antes de la llamada hubiera otra copia (<code>copia = value</code>), la salida sería Antes: 2, Dentro: 2, Después: 0 y <code>copia</code> seguiría siendo propietaria con use_count 1. Para una propiedad exclusiva y transferible: <code>unique_ptr</code>.',
      'L9 · Después: 0 (value vacío)');
    fin1261(t, false);
    return t.pasos;
  }

  // ---------------- 12.6.2: ciclo Motor ↔ Pantalla ----------------
  function codigo1262(debil) {
    var c = [
      'struct Pantalla;',
      '',
      'struct Motor {',
      '    std::shared_ptr<Pantalla> pantalla;  // el motor conoce a la pantalla',
      '    ~Motor() { std::cout << "~Motor()\\n"; }',
      '};',
      '',
      'struct Pantalla {',
      debil ? '    std::weak_ptr<Motor> motor;          // observa al motor sin poseerlo'
            : '    std::shared_ptr<Motor> motor;        // la pantalla también posee al motor',
      '    ~Pantalla() { std::cout << "~Pantalla()\\n"; }',
      '};',
      '',
      'int main() {',
      '    std::shared_ptr<Motor> m = std::make_shared<Motor>();',
      '    std::shared_ptr<Pantalla> p = std::make_shared<Pantalla>();',
      '    m->pantalla = p;',
      '    p->motor = m;',
      '    std::cout << m.use_count() << \' \' << p.use_count() << \'\\n\';'
    ];
    if (debil) c.push(
      '    if (std::shared_ptr<Motor> actual = p->motor.lock()) {',
      '        std::cout << "Motor vivo: " << actual.use_count() << \'\\n\';',
      '    }');
    c.push('    return 0;', '}');
    return c;
  }
  function inicio1262(t, debil) {
    t.obj('M', 'Motor', '', [{ n: 'pantalla', tipo: 'shared_ptr<Pantalla>', a: null, debil: false }]);
    t.decl('m', 'shared_ptr<Motor>', 'M');
    t.paso(14, 'Se crea el <code>Motor</code> con <code>make_shared</code>; su miembro <code>pantalla</code> empieza vacío. <code>m</code> es su propietario: <strong>use_count(Motor) = 1</strong>.',
      'L14 · make_shared<Motor>: use_count = 1');
    t.obj('P', 'Pantalla', '', [{ n: 'motor', tipo: debil ? 'weak_ptr<Motor>' : 'shared_ptr<Motor>', a: null, debil: debil }]);
    t.decl('p', 'shared_ptr<Pantalla>', 'P');
    t.paso(15, 'Se crea la <code>Pantalla</code>; <code>p</code> es su propietario: <strong>use_count(Pantalla) = 1</strong>.',
      'L15 · make_shared<Pantalla>: use_count = 1');
    t.miembro('M', 'pantalla', 'P');
    t.paso(16, '<code>m-&gt;pantalla = p</code> copia un <code>shared_ptr</code>: el motor pasa a ser también propietario de la pantalla. <strong>use_count(Pantalla) = 2</strong>.',
      'L16 · m->pantalla = p: use_count(Pantalla) 1 → 2');
    t.miembro('P', 'motor', 'M');
    if (debil) {
      t.paso(17, 'Asignar un <code>shared_ptr</code> a un <code>weak_ptr</code> <strong>no añade propietario</strong>: use_count(Motor) sigue en <strong>1</strong>; solo sube el contador <strong>débil</strong> del bloque de control (1). No hay ciclo de propiedad.',
        'L17 · p->motor = m (weak): use_count(Motor) = 1, débil = 1');
      t.out('1 2');
      t.paso(18, 'Imprime <strong>1 2</strong>: el motor tiene un propietario (<code>m</code>) y la pantalla dos (<code>p</code> y <code>Motor::pantalla</code>).', 'L18 · imprime 1 2');
    } else {
      t.paso(17, '<code>p-&gt;motor = m</code>: la pantalla también posee al motor. <strong>use_count(Motor) = 2</strong>. Cada objeto mantiene vivo al otro: <strong>ciclo de propiedad</strong>.',
        'L17 · p->motor = m: use_count(Motor) 1 → 2 (ciclo)');
      t.out('2 2');
      t.paso(18, 'Imprime <strong>2 2</strong>: cada objeto tiene dos propietarios, uno en la pila y el otro objeto.', 'L18 · imprime 2 2');
    }
  }
  function v1262ciclo() {
    var t = new Traza();
    inicio1262(t, false);
    t.sale('p');
    t.paso(20, 'Al cerrar <code>main</code> se destruyen las locales en orden inverso: primero <code>p</code>. use_count(Pantalla) baja a <strong>1</strong>: el motor aún la posee.',
      'L20 · se destruye p: use_count(Pantalla) 2 → 1');
    t.sale('m'); t.finMarco();
    t.estado('M', 'fuga'); t.estado('P', 'fuga');
    t.paso(20, 'Después se destruye <code>m</code>: use_count(Motor) baja a <strong>1</strong>, no a 0, porque la pantalla lo posee. Ningún contador llega a 0: <strong>no se ejecutan ~Motor() ni ~Pantalla()</strong> y la memoria no se libera. Ya no queda ningún puntero en la pila que los alcance: <strong>fuga de memoria</strong>.',
      'L20 · se destruye m: use_count Motor = 1, Pantalla = 1 → fuga, ningún destructor');
    return t.pasos;
  }
  function v1262weak() {
    var t = new Traza();
    inicio1262(t, true);
    t.decl('actual', 'shared_ptr<Motor>', 'M', { ambito: 'if' });
    t.paso(19, '<code>lock()</code> crea un <code>shared_ptr</code> temporal: como el motor sigue vivo, <code>actual</code> no está vacío, la condición es cierta y <strong>use_count(Motor) = 2</strong> mientras dure el bloque. Si el motor ya se hubiera destruido, <code>lock()</code> devolvería un puntero vacío y no se entraría.',
      'L19 · lock(): use_count(Motor) 1 → 2');
    t.out('Motor vivo: 2');
    t.paso(20, 'Imprime <strong>Motor vivo: 2</strong>.', 'L20 · Motor vivo: 2');
    t.sale('actual');
    t.paso(21, 'Fin del bloque del <code>if</code>: <code>actual</code> se destruye y use_count(Motor) vuelve a <strong>1</strong>.',
      'L21 · fin del if: use_count(Motor) 2 → 1');
    t.sale('p');
    t.paso(23, 'Al cerrar <code>main</code> se destruyen las locales en orden inverso: primero <code>p</code>. use_count(Pantalla) baja a <strong>1</strong>: el motor aún la posee.',
      'L23 · se destruye p: use_count(Pantalla) 2 → 1');
    t.sale('m'); t.finMarco();
    t.estado('M', 'destruyendo'); t.out('~Motor()');
    t.paso(5, 'Después se destruye <code>m</code>, el <strong>único</strong> propietario del motor (la pantalla solo lo observa): use_count(Motor) llega a <strong>0</strong> y se ejecuta <code>~Motor()</code>.',
      'L23 · se destruye m: use_count(Motor) 1 → 0 → ~Motor()');
    t.miembro('M', 'pantalla', null); t.estado('M', 'destruido');
    t.estado('P', 'destruyendo'); t.out('~Pantalla()');
    t.paso(10, 'Tras el cuerpo de <code>~Motor()</code> se destruyen sus miembros: <code>pantalla</code> suelta la <code>Pantalla</code>, cuyo use_count llega a <strong>0</strong> → <code>~Pantalla()</code>. El bloque de control del motor sigue en memoria porque un <code>weak_ptr</code> lo observa (débil = 1), aunque el objeto ya no existe (<code>expired()</code> sería <code>true</code>).',
      'L10 · Motor suelta pantalla: use_count(Pantalla) 1 → 0 → ~Pantalla()');
    t.miembro('P', 'motor', null);
    t.estado('M', 'liberado'); t.estado('P', 'liberado');
    t.paso(23, 'Al destruirse los miembros de la pantalla desaparece el <code>weak_ptr</code> <code>motor</code>: el contador débil del motor llega a 0 y se liberan los dos bloques. <strong>Heap vacío: sin fuga</strong>.',
      'L23 · débil(Motor) 1 → 0: memoria liberada, sin fuga');
    return t.pasos;
  }

  var ESCENARIOS = {
    '12.6': {
      titulo: '20.5 · copia y reset()',
      nota: NOTA_CC + ' El libro dice «normalmente muestra 2» y «1»: la salida real es 2 y 1.',
      variantes: [{ titulo: 'first y second', codigo: [
        'int main() {',
        '    std::shared_ptr<CComplex> first = std::make_shared<CComplex>(3.0, 4.0);',
        '    std::shared_ptr<CComplex> second = first; // comparten el mismo objeto',
        '    std::cout << first.use_count() << \'\\n\';  // normalmente muestra 2',
        '    second.reset();                            // second deja de ser propietario',
        '    std::cout << first.use_count() << \'\\n\';  // normalmente muestra 1',
        '    return 0;',
        '}'], pasos: v126 }]
    },
    '12.6.1': {
      titulo: '20.5.1 · copia y traslado de la propiedad',
      nota: NOTA_CC + ' La versión por valor es la del libro (1 → 2 → 1); las otras dos cambian solo la firma o la llamada.',
      variantes: [
        { titulo: 'Por valor (libro)', codigo: codigo1261('std::shared_ptr<CComplex> value', '2',
            'mostrarUso(value); // se copia: la función comparte la propiedad', '1'), pasos: v1261valor },
        { titulo: 'Por const&', codigo: codigo1261('const std::shared_ptr<CComplex>& value', '1',
            'mostrarUso(value); // const&: sin copia, no cambia el contador', '1'), pasos: v1261ref },
        { titulo: 'Con std::move', codigo: codigo1261('std::shared_ptr<CComplex> value', '1',
            'mostrarUso(std::move(value)); // se traslada: value queda vacío', '0'), pasos: v1261move }
      ]
    },
    '12.6.2': {
      titulo: '20.5.2 · ciclo Motor ↔ Pantalla',
      nota: 'El libro describe el ciclo Motor ↔ Pantalla (12.6.2 y 12.7) sin listado; este programa mínimo lo reproduce con <code>cout</code> en los destructores. ' +
        'Comprobado con <code>clang++ -std=c++17</code>: con <code>shared_ptr</code> solo imprime «2 2» (ningún destructor); con <code>weak_ptr</code> imprime «1 2», «Motor vivo: 2», «~Motor()» y «~Pantalla()».',
      variantes: [
        { titulo: 'Ciclo con shared_ptr', codigo: codigo1262(false), pasos: v1262ciclo },
        { titulo: 'Con weak_ptr', codigo: codigo1262(true), pasos: v1262weak }
      ]
    }
  };

  // ---------------- Componente ----------------
  MPI.componentes['cpp-shared-ptr'] = function (el, cfg) {
    cfg = cfg || {};
    var id = 'csp' + (++uid);
    var esc0 = ESCENARIOS[cfg.escenario] ? cfg.escenario : '12.6';
    var E = ESCENARIOS[esc0];
    var vi = 0, paso = 0, pasos = E.variantes[0].pasos();
    var flechas = [];

    el.classList.add('mpi-cpp-shared-ptr');
    el.innerHTML =
      '<div class="mpi-sim-cab">shared_ptr y weak_ptr paso a paso <span class="csp-sub">' + esc(E.titulo) + '</span></div>' +
      (E.variantes.length > 1
        ? '<div class="csp-variantes" role="group" aria-label="Versión del programa">' +
          E.variantes.map(function (v, i) { return '<button type="button" class="csp-var-btn" data-v="' + i + '" aria-pressed="false">' + esc(v.titulo) + '</button>'; }).join('') +
          '</div>'
        : '') +
      '<div class="csp-cuerpo">' +
        '<div class="csp-izq">' +
          '<div class="csp-codigo" tabindex="0" role="region" aria-label="Código del programa"></div>' +
          '<div class="csp-controles">' +
            '<button type="button" class="csp-paso">Paso ▶</button>' +
            '<button type="button" class="csp-atras">◀ Atrás</button>' +
            '<button type="button" class="csp-reset">Reiniciar</button>' +
            '<span class="csp-contador"></span>' +
          '</div>' +
          '<div class="csp-expl"></div>' +
        '</div>' +
        '<div class="csp-der">' +
          '<div class="csp-escena">' +
            '<div class="csp-col csp-pila"><div class="csp-col-tit">Pila</div><div class="csp-pila-in"></div></div>' +
            '<div class="csp-col csp-heap"><div class="csp-col-tit">Heap</div><div class="csp-heap-in"></div></div>' +
            '<svg class="csp-flechas" aria-hidden="true" focusable="false"><defs>' +
              '<marker id="' + id + '-ms" class="csp-mk-s" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z"/></marker>' +
              '<marker id="' + id + '-mw" class="csp-mk-w" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z"/></marker>' +
            '</defs><g></g></svg>' +
          '</div>' +
          '<div class="csp-leyenda"><span><i class="csp-ley-s" aria-hidden="true"></i>shared_ptr: propietario</span><span><i class="csp-ley-w" aria-hidden="true"></i>weak_ptr: observa sin poseer</span></div>' +
          '<div class="csp-panel"><div class="csp-panel-tit">Salida del programa</div><pre class="csp-salida"></pre></div>' +
          '<div class="csp-panel"><div class="csp-panel-tit" id="' + id + '-rt">Registro</div><ol class="csp-registro" role="log" aria-live="polite" aria-labelledby="' + id + '-rt"></ol></div>' +
        '</div>' +
      '</div>' +
      '<p class="csp-nota">' + E.nota + '</p>';

    function $(s) { return el.querySelector(s); }
    var escena = $('.csp-escena'), gFlechas = $('.csp-flechas g'), svg = $('.csp-flechas');

    function pintarCodigo() {
      var h = '<pre class="csp-pre">';
      E.variantes[vi].codigo.forEach(function (l, i) {
        h += '<span class="csp-linea" data-l="' + (i + 1) + '"><span class="csp-marca" aria-hidden="true"></span><span class="csp-num" aria-hidden="true">' + (i + 1) + '</span><code class="lang-cpp">' + (l ? esc(l) : ' ') + '</code></span>';
      });
      $('.csp-codigo').innerHTML = h + '</pre>';
      if (MPI.resaltarTodo) MPI.resaltarTodo($('.csp-codigo'));
    }

    function nombreObj(st, a) {
      for (var i = 0; i < st.heap.length; i++) if (st.heap[i].id === a) return st.heap[i].clase;
      return '?';
    }

    function pintar() {
      var total = pasos.length;
      var P = paso > 0 ? pasos[paso - 1] : null;
      var st = P ? P.st : { pila: [{ f: 'main', vars: [] }], heap: [], salida: [] };
      var cnt = contadores(st);
      var prev = paso > 1 ? contadores(pasos[paso - 2].st) : {};

      var bs = el.querySelectorAll('.csp-var-btn');
      for (var i = 0; i < bs.length; i++) bs[i].setAttribute('aria-pressed', i === vi ? 'true' : 'false');

      var ls = el.querySelectorAll('.csp-linea');
      for (i = 0; i < ls.length; i++) {
        var act = P && +ls[i].getAttribute('data-l') === P.linea;
        ls[i].classList.toggle('csp-actual', !!act);
        ls[i].querySelector('.csp-marca').textContent = act ? '▶' : '';
      }
      if (P) {
        var la = el.querySelector('.csp-linea.csp-actual'), cod = $('.csp-codigo');
        if (la) {
          var top = la.offsetTop, h = cod.clientHeight;
          if (top < cod.scrollTop || top > cod.scrollTop + h - 24) cod.scrollTop = Math.max(0, top - h / 3);
        }
      }
      $('.csp-paso').disabled = paso >= total;
      $('.csp-atras').disabled = paso === 0;
      $('.csp-contador').textContent = 'Paso ' + paso + ' de ' + total;
      $('.csp-expl').innerHTML = P
        ? '<strong>Línea ' + P.linea + '</strong> · ' + P.expl
        : 'Pulsa <strong>Paso</strong> para ejecutar el programa. Observa en el heap el contador fuerte (<code>use_count</code>) y el débil de cada objeto.';

      // ---- Pila ----
      flechas = [];
      var hp = '';
      st.pila.forEach(function (m, fi) {
        hp += '<div class="csp-marco' + (m.sale ? ' csp-sale' : '') + '"><div class="csp-marco-tit"><code>' + esc(m.f) + '()</code>' + (m.sale ? ' <span>termina</span>' : '') + '</div>';
        if (!m.vars.length) hp += '<div class="csp-vacio">sin variables todavía</div>';
        m.vars.forEach(function (v) {
          var pid = 'v' + fi + '-' + v.n;
          var estado;
          if (v.sale) estado = 'se destruye';
          else if (v.ref) estado = 'referencia a ' + v.ref + ' (no posee)';
          else if (v.a) estado = (v.debil ? '⇢ observa ' : '→ posee ') + nombreObj(st, v.a);
          else estado = 'vacío (nullptr)';
          hp += '<div class="csp-ptr' + (v.debil ? ' csp-debil' : '') + (v.ref ? ' csp-ref' : '') + (v.sale ? ' csp-sale' : '') + (v.toca ? ' csp-toca' : '') + (!v.a && !v.ref ? ' csp-nulo' : '') + '" data-pid="' + pid + '">' +
            '<code class="csp-ptr-n">' + esc(v.n) + '</code>' + (v.ambito ? ' <span class="csp-amb">(bloque ' + esc(v.ambito) + ')</span>' : '') +
            '<span class="csp-ptr-t">' + esc(v.tipo) + '</span>' +
            '<span class="csp-ptr-e">' + esc(estado) + '</span></div>';
          if (v.a && !v.sale && !v.ref) flechas.push({ de: pid, a: v.a, debil: v.debil, miembro: false });
        });
        hp += '</div>';
      });
      $('.csp-pila-in').innerHTML = hp;

      // ---- Heap ----
      var hh = '';
      if (!st.heap.length) hh = '<div class="csp-vacio">' + (paso === 0 ? 'vacío' : 'vacío: no queda ningún objeto') + '</div>';
      st.heap.forEach(function (o) {
        var c = cnt[o.id], q = prev[o.id] || null;
        var etq = { vivo: '', destruyendo: 'ejecutando ~' + o.clase + '()', destruido: 'objeto destruido · el bloque de control sigue (débil > 0)', liberado: 'memoria liberada', fuga: 'inalcanzable: fuga de memoria' }[o.estado];
        hh += '<div class="csp-obj csp-' + o.estado + '" data-oid="' + o.id + '">' +
          '<div class="csp-cb"><span class="csp-cb-tit">bloque de control</span>' +
            '<span class="csp-cnt">use_count <b class="' + (q && q.fuerte !== c.fuerte ? 'csp-cambio' : '') + (c.fuerte === 0 ? ' csp-cero' : '') + '">' + c.fuerte + '</b></span>' +
            '<span class="csp-cnt">débil <b class="' + (q && q.debil !== c.debil ? 'csp-cambio' : '') + '">' + c.debil + '</b></span></div>' +
          '<div class="csp-dato"><code>' + esc(o.clase) + '</code>' + (o.valor ? ' <span class="csp-valor">' + esc(o.valor) + '</span>' : '') +
            (etq ? '<span class="csp-etq">' + esc(etq) + '</span>' : '') + '</div>';
        var vivoMiembros = o.estado !== 'destruido' && o.estado !== 'liberado';
        o.miembros.forEach(function (mb) {
          var pid = 'm' + o.id + '-' + mb.n;
          var est = !vivoMiembros ? 'destruido' : mb.a ? (mb.debil ? '⇢ observa ' : '→ posee ') + nombreObj(st, mb.a) : 'vacío';
          hh += '<div class="csp-miembro' + (mb.debil ? ' csp-debil' : '') + (mb.toca ? ' csp-toca' : '') + '" data-pid="' + pid + '">' +
            '<code class="csp-ptr-n">' + esc(mb.n) + '</code><span class="csp-ptr-t">' + esc(mb.tipo) + '</span><span class="csp-ptr-e">' + esc(est) + '</span></div>';
          if (mb.a && vivoMiembros) flechas.push({ de: pid, a: mb.a, debil: mb.debil, miembro: true });
        });
        hh += '</div>';
      });
      $('.csp-heap-in').innerHTML = hh;

      // ---- Salida y registro ----
      $('.csp-salida').textContent = st.salida.length ? st.salida.join('\n') : ' ';
      var reg = '';
      for (i = 0; i < paso; i++) {
        var d = /~\w+\(\)/.test(pasos[i].reg) ? ' class="csp-reg-dtor"' : '';
        reg += '<li' + d + '>' + esc(pasos[i].reg) + '</li>';
      }
      var ol = $('.csp-registro');
      ol.innerHTML = reg || '<li class="csp-tenue">Aún no se ha ejecutado ninguna línea.</li>';
      ol.scrollTop = ol.scrollHeight;

      dibujarFlechas();
    }

    function caja(sel) {
      var n = escena.querySelector(sel);
      if (!n) return null;
      var r = n.getBoundingClientRect(), e = escena.getBoundingClientRect();
      var x = r.left - e.left + escena.scrollLeft, y = r.top - e.top + escena.scrollTop;
      return { l: x, t: y, r: x + r.width, b: y + r.height, cy: y + r.height / 2 };
    }
    function dibujarFlechas() {
      // Se encoge antes de medir para que un tamaño viejo no ensanche la escena.
      svg.setAttribute('width', 0); svg.setAttribute('height', 0);
      svg.setAttribute('width', escena.scrollWidth);
      svg.setAttribute('height', escena.scrollHeight);
      var h = '';
      flechas.forEach(function (f) {
        var s = caja('[data-pid="' + f.de + '"]'), d = caja('[data-oid="' + f.a + '"]');
        if (!s || !d) return;
        var path;
        if (f.miembro) {
          // De un miembro a otro objeto del heap: sale y entra por la derecha.
          var y2 = d.t + 16, X = Math.max(s.r, d.r) + 22;
          path = 'M' + s.r + ',' + s.cy + ' C' + X + ',' + s.cy + ' ' + X + ',' + y2 + ' ' + (d.r + 1) + ',' + y2;
        } else {
          var ye = Math.min(Math.max(s.cy, d.t + 12), d.b - 12);
          var dx = Math.max(14, (d.l - s.r) / 2);
          path = 'M' + s.r + ',' + s.cy + ' C' + (s.r + dx) + ',' + s.cy + ' ' + (d.l - dx) + ',' + ye + ' ' + (d.l - 1) + ',' + ye;
        }
        h += '<path class="' + (f.debil ? 'csp-fw' : 'csp-fs') + '" d="' + path + '" marker-end="url(#' + id + (f.debil ? '-mw' : '-ms') + ')"/>';
      });
      gFlechas.innerHTML = h;
    }

    el.addEventListener('click', function (e) {
      var t = e.target.closest('button');
      if (!t || !el.contains(t)) return;
      if (t.classList.contains('csp-var-btn')) {
        vi = +t.getAttribute('data-v'); pasos = E.variantes[vi].pasos(); paso = 0;
        pintarCodigo(); pintar(); return;
      }
      if (t.classList.contains('csp-paso') && paso < pasos.length) paso++;
      else if (t.classList.contains('csp-atras') && paso > 0) paso--;
      else if (t.classList.contains('csp-reset')) paso = 0;
      else return;
      pintar();
    });

    if (window.ResizeObserver) new ResizeObserver(function () { dibujarFlechas(); }).observe(escena);
    else window.addEventListener('resize', dibujarFlechas);

    pintarCodigo();
    pintar();
  };

  // Expuesto para pruebas.
  MPI.componentes['cpp-shared-ptr']._escenarios = ESCENARIOS;
  MPI.componentes['cpp-shared-ptr']._contadores = contadores;
})();
