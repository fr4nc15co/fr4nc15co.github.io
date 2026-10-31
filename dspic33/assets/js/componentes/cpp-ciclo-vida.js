/*
 * Componente "cpp-ciclo-vida": ejecuta paso a paso un main del capítulo 10 (CComplex) con la
 * pila (marcos de llamada y objetos con m_d_real / m_d_imag), el heap (con la flecha desde el
 * puntero), la función que se está ejecutando, un registro de llamadas (constructor, copia,
 * operator=, destructor), la salida por pantalla y un contador de objetos vivos.
 *
 * Uso en el contenido:
 *   <div class="mpi-mount" data-componente="cpp-ciclo-vida" data-config='{"escenario":"10.8"}'></div>
 *   <div class="mpi-mount" data-componente="cpp-ciclo-vida" data-config='{"escenario":"10.5"}'></div>
 *
 * Claves de data-config:
 *   escenario  "10.8" (ejemplo completo: c1, c2, c3 en pila, *c4 en el heap) o
 *              "10.5" (c2 = c1 con operator= por valor frente a const&, y CComplex c3(c1)).
 *   variante   (opcional) variante inicial. 10.8: "elision" (defecto) | "sin-elision".
 *              10.5: "valor" (defecto) | "ref".
 *
 * Las trazas NO están deducidas: salen de compilar los programas del libro con
 * Apple clang 21 (-std=c++17 -Wall -Wextra, macOS arm64) añadiendo un printf en cada
 * constructor, destructor y operador. Las direcciones son las de esa ejecución (cambian en
 * cada ejecución; lo que importa es cuáles coinciden).
 */
window.MPI = window.MPI || {};
MPI.componentes = MPI.componentes || {};

(function () {
  var uid = 0;
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function res(linea) { return MPI.resaltarC ? MPI.resaltarC(linea) : esc(linea); }
  function fmt(x) { return x == null ? '??' : String(x); }

  // ---------- Funciones miembro de CComplex (código del libro, cap. 10) ----------
  var FN = {
    ctor2: { nombre: 'CComplex(double, double)', c: [
      'CComplex::CComplex(double real, double imag)',
      '    : m_d_real(real), m_d_imag(imag) {}'] },
    ctor0: { nombre: 'CComplex()', c: [
      'CComplex::CComplex() : m_d_real(0.0), m_d_imag(0.0) {}'] },
    copia: { nombre: 'CComplex(const CComplex&)', c: [
      'CComplex::CComplex(const CComplex& other) {',
      '    *this = other;',
      '}'] },
    copiaLista: { nombre: 'CComplex(const CComplex&)', nota: 'Copia miembro a miembro (no es la del libro: ver la nota de abajo).', c: [
      'CComplex::CComplex(const CComplex& other)',
      '    : m_d_real(other.m_d_real), m_d_imag(other.m_d_imag) {}'] },
    asigRef: { nombre: 'operator=(const CComplex&)', c: [
      'CComplex& CComplex::operator=(const CComplex& other) {',
      '    if (this != &other) {              // evita trabajo en c1 = c1',
      '        m_d_real = other.m_d_real;',
      '        m_d_imag = other.m_d_imag;',
      '    }',
      '    return *this;                      // permite a = b = c',
      '}'] },
    asigVal: { nombre: 'operator=(CComplex)', c: [
      'CComplex& CComplex::operator=(CComplex other) {',
      '    if (this != &other) {',
      '        m_d_real = other.m_d_real;',
      '        m_d_imag = other.m_d_imag;',
      '    }',
      '    return *this;',
      '}'] },
    opmas: { nombre: 'operator+(const CComplex&) const', c: [
      'CComplex CComplex::operator+(const CComplex& other) const {',
      '    CComplex result(*this);',
      '    result += other;',
      '    return result;',
      '}'] },
    opmasig: { nombre: 'operator+=(const CComplex&)', c: [
      'CComplex& CComplex::operator+=(const CComplex& other) {',
      '    m_d_real += other.m_d_real;',
      '    m_d_imag += other.m_d_imag;',
      '    return *this;',
      '}'] },
    dtor: { nombre: '~CComplex()', c: [
      'CComplex::~CComplex() = default;'] }
  };

  // Operaciones de cada paso:
  //   obj  {id, etq, marco, re, im, dir}  construye un CComplex (re/im null = sin valor aún)
  //   set  {id, re, im}   etq {id, etq}   dtor {id}   free {id} (heap liberado)
  //   push {id, nombre, refs:[[nombre, idObjeto, nota]]}   ref {id, r:[...]}   pop {id}
  //   ptr  {id, etq, marco, dst}  (dst: id de objeto o null = nullptr)   out {txt}
  function O(o, a) { a = a || {}; a.o = o; return a; }

  // ---------------- Escenario 10.8 ----------------
  var MAIN_108 = [
    '#include "CComplex.h"',
    '#include <iostream>',
    '',
    'int main() {',
    '    CComplex c1(0.0, 1.0);',
    '    CComplex c2(2.0, 3.0);',
    '    CComplex c3 = c1 + c2;',
    '    std::cout << "c3 = " << c3 << std::endl;',
    '    CComplex* c4 = new CComplex(4.0, 5.0); // objeto dinámico',
    '    std::cout << "c4 = " << *c4 << std::endl;',
    '    delete c4;                             // ejecuta el destructor de c4',
    '    c4 = nullptr;                          // evita conservar un puntero colgante',
    '    return 0;',
    '}'];

  function finales108(d) {
    return [
      { l: 9, ops: [O('out', { txt: 'c4 = (4,5)\n' })],
        expl: 'Se imprime <code>*c4</code>: el objeto del heap, al que se llega a través del puntero. Salida: <code>c4 = (4,5)</code>.' },
      { l: 10, fn: ['dtor', 0], log: ['dtor', '~CComplex() → *c4 (4, 5) en el heap, por <code>delete c4</code>'],
        ops: [O('dtor', { id: 'h4' }), O('free', { id: 'h4' })],
        expl: '<code>delete c4</code> ejecuta el <strong>destructor</strong> del objeto dinámico y libera su memoria. Ocurre aquí, no al final de <code>main</code>. ' +
          'Pero <code>c4</code> sigue guardando la dirección ' + d.heap + ': ahora es un <strong>puntero colgante</strong> (apunta a memoria que ya no es suya).' },
      { l: 11, ops: [O('ptr', { id: 'c4', dst: null })],
        expl: '<code>c4 = nullptr</code>: el puntero deja de apuntar a la memoria liberada. Un <code>delete</code> posterior por error no haría nada y un acceso fallaría de forma detectable.' },
      { l: 12,
        expl: '<code>return 0;</code> todavía no destruye nada. Los objetos automáticos de <code>main</code> se destruyen al salir de su ámbito (la <code>}</code>), en <strong>orden inverso a su creación</strong>: c3, c2, c1.' },
      { l: 13, fn: ['dtor', 0], log: ['dtor', '~CComplex() → c3 (2, 4)'], ops: [O('dtor', { id: 'c3' })],
        expl: 'Fin de ámbito: primero se destruye <code>c3</code>, el último objeto automático creado. (El puntero <code>c4</code> también desaparece, pero un puntero no tiene destructor.)' },
      { l: 13, fn: ['dtor', 0], log: ['dtor', '~CComplex() → c2 (2, 3)'], ops: [O('dtor', { id: 'c2' })],
        expl: 'Después <code>c2</code>.' },
      { l: 13, fn: ['dtor', 0], log: ['dtor', '~CComplex() → c1 (0, 1)'], ops: [O('dtor', { id: 'c1' })],
        expl: 'Por último <code>c1</code>, el primero que se creó. Cada objeto construido ha tenido su destrucción: ' + d.resumen }
    ];
  }

  function comunes108(d) {
    return [
      { l: 4, fn: ['ctor2', 1], log: ['ctor', 'CComplex(double, double) → c1 (0, 1)'],
        ops: [O('obj', { id: 'c1', etq: 'c1', marco: 'main', re: 0, im: 1, dir: d.c1 })],
        expl: 'Se reserva <code>c1</code> en la pila de <code>main</code> y se ejecuta el <strong>constructor</strong> con dos parámetros: la lista de inicialización pone <code>m_d_real = 0</code> y <code>m_d_imag = 1</code>.' },
      { l: 5, fn: ['ctor2', 1], log: ['ctor', 'CComplex(double, double) → c2 (2, 3)'],
        ops: [O('obj', { id: 'c2', etq: 'c2', marco: 'main', re: 2, im: 3, dir: d.c2 })],
        expl: 'Lo mismo para <code>c2</code> = (2, 3). Fíjate en las direcciones: la pila crece hacia direcciones más bajas.' },
      { l: 6, fn: ['opmas', 0], log: ['llamada', 'c1.operator+(c2)'],
        ops: [O('push', { id: 'Fmas', nombre: 'operator+', refs: [['this', 'c1', 'puntero al operando izquierdo'], ['other', 'c2', 'referencia: no se copia']] })],
        expl: '<code>c1 + c2</code> llama a la función miembro <code>operator+</code> <strong>de c1</strong>: <code>this</code> apunta a <code>c1</code> y <code>other</code> es una referencia constante a <code>c2</code> (no se construye ningún objeto).' }
    ];
  }

  function esc108elision() {
    var d = { c1: '0x16fad26f8', c2: '0x16fad26e8', c3: '0x16fad26c8', heap: '0x1009f5230',
      resumen: '<strong>4 construidos y 4 destruidos</strong> (c1, c2, c3 y *c4), como dice el libro: aquí no ha aparecido ningún temporal.' };
    var pasos = comunes108(d).concat([
      { l: 6, fn: ['copia', 0], log: ['copia', 'constructor de copia → result ← c1 (construido ya en el sitio de c3)'],
        ops: [O('obj', { id: 'c3', etq: 'c3 ≡ result', marco: 'main', re: null, im: null, dir: d.c3 }),
              O('ref', { id: 'Fmas', r: ['result', 'c3', 'mismo objeto que c3 (NRVO)'] }),
              O('push', { id: 'Fcop', nombre: 'CComplex(const CComplex&)', refs: [['this', 'c3', 'objeto que se construye'], ['other', 'c1', 'referencia']] })],
        expl: '<code>CComplex result(*this);</code> copia <code>c1</code> con el <strong>constructor de copia</strong>. clang construye <code>result</code> directamente en el hueco de <code>c3</code> (misma dirección ' + d.c3 + '): es la optimización del valor de retorno con nombre (<strong>NRVO</strong>). ' +
          'El constructor de copia del libro no tiene lista de inicialización: al entrar, <code>m_d_real</code> y <code>m_d_imag</code> aún no tienen valor (??).' },
      { l: 6, fn: ['asigRef', 1], log: ['asig', 'operator=(const CComplex&) → result = c1 (desde el constructor de copia)'],
        ops: [O('push', { id: 'Fasig', nombre: 'operator=', refs: [['this', 'c3', ''], ['other', 'c1', 'referencia']] }), O('set', { id: 'c3', re: 0, im: 1 })],
        expl: 'El cuerpo del constructor de copia es <code>*this = other;</code>, así que se llama a <code>operator=</code> con referencia constante: copia los dos miembros de <code>c1</code>. <code>result</code> vale (0, 1).' },
      { l: 6, fn: ['opmasig', 1], log: ['llamada', 'result.operator+=(c2) → (2, 4)'],
        ops: [O('pop', { id: 'Fasig' }), O('pop', { id: 'Fcop' }),
              O('push', { id: 'Fmasig', nombre: 'operator+=', refs: [['this', 'c3', 'es result'], ['other', 'c2', 'referencia']] }), O('set', { id: 'c3', re: 2, im: 4 })],
        expl: 'Vuelve a <code>operator+</code>: <code>result += other;</code> suma <code>c2</code> sobre la copia. <code>c1</code> no cambia: eso es lo que distingue <code>+</code> de <code>+=</code>.' },
      { l: 6, fn: ['opmas', 3], log: ['nota', 'return result: sin copia (NRVO)'],
        ops: [O('pop', { id: 'Fmasig' }), O('pop', { id: 'Fmas' }), O('etq', { id: 'c3', etq: 'c3' })],
        expl: '<code>return result;</code> no copia nada: <code>result</code> ya era <code>c3</code>. Sale <code>operator+</code> sin llamar a ningún constructor ni destructor más. <code>c3</code> = (2, 4).' },
      { l: 7, ops: [O('out', { txt: 'c3 = (2,4)\n' })],
        expl: '<code>operator&lt;&lt;</code> recibe <code>c3</code> por referencia constante: no hay copia. Salida: <code>c3 = (2,4)</code>.' },
      { l: 8, fn: ['ctor2', 1], log: ['ctor', 'new CComplex(4.0, 5.0) → *c4 (4, 5) en el heap'],
        ops: [O('obj', { id: 'h4', etq: '*c4', marco: 'heap', re: 4, im: 5, dir: d.heap }), O('ptr', { id: 'c4', etq: 'c4', marco: 'main', dst: 'h4' })],
        expl: '<code>new</code> reserva memoria en el <strong>heap</strong> y ejecuta el constructor allí. <code>c4</code> es un puntero en la pila que guarda la dirección del objeto (' + d.heap + '). El objeto no tiene nombre: se llega a él con <code>*c4</code>.' }
    ]).concat(finales108(d));
    return pasos;
  }

  function esc108sinElision() {
    var d = { c1: '0x16f5666f8', c2: '0x16f5666e8', c3: '0x16f5666c8', r: '0x16f566638', heap: '0x100e55230',
      resumen: '<strong>5 construidos y 5 destruidos</strong>: los cuatro objetos con nombre más <code>result</code>, el temporal que la NRVO había eliminado. Por eso el libro dice que el recuento de temporales «puede variar».' };
    var pasos = comunes108(d).concat([
      { l: 6, fn: ['copia', 0], log: ['copia', 'constructor de copia → result ← c1'],
        ops: [O('obj', { id: 'r', etq: 'result', marco: 'Fmas', re: null, im: null, dir: d.r }),
              O('push', { id: 'Fcop', nombre: 'CComplex(const CComplex&)', refs: [['this', 'r', 'objeto que se construye'], ['other', 'c1', 'referencia']] })],
        expl: '<code>CComplex result(*this);</code>: sin NRVO, <code>result</code> es una variable local de <code>operator+</code> con su propia dirección (' + d.r + '). Al entrar en el constructor de copia sus miembros aún no tienen valor (??).' },
      { l: 6, fn: ['asigRef', 1], log: ['asig', 'operator=(const CComplex&) → result = c1 (desde el constructor de copia)'],
        ops: [O('push', { id: 'Fasig', nombre: 'operator=', refs: [['this', 'r', ''], ['other', 'c1', 'referencia']] }), O('set', { id: 'r', re: 0, im: 1 })],
        expl: '<code>*this = other;</code> llama a <code>operator=</code>: <code>result</code> = (0, 1).' },
      { l: 6, fn: ['opmasig', 1], log: ['llamada', 'result.operator+=(c2) → (2, 4)'],
        ops: [O('pop', { id: 'Fasig' }), O('pop', { id: 'Fcop' }),
              O('push', { id: 'Fmasig', nombre: 'operator+=', refs: [['this', 'r', ''], ['other', 'c2', 'referencia']] }), O('set', { id: 'r', re: 2, im: 4 })],
        expl: '<code>result += other;</code>: <code>result</code> = (2, 4).' },
      { l: 6, fn: ['copia', 0], log: ['copia', 'constructor de copia → c3 ← result (valor de retorno)'],
        ops: [O('pop', { id: 'Fmasig' }),
              O('obj', { id: 'c3', etq: 'c3', marco: 'main', re: null, im: null, dir: d.c3 }),
              O('push', { id: 'Fcop2', nombre: 'CComplex(const CComplex&)', refs: [['this', 'c3', 'objeto que se construye'], ['other', 'r', 'referencia']] })],
        expl: '<code>return result;</code> ahora sí copia: se construye <code>c3</code> a partir de <code>result</code>. (En C++17 el valor devuelto inicializa <code>c3</code> directamente, sin otro temporal intermedio; lo que <code>-fno-elide-constructors</code> suprime es la NRVO de <code>result</code>.)' },
      { l: 6, fn: ['asigRef', 1], log: ['asig', 'operator=(const CComplex&) → c3 = result (desde el constructor de copia)'],
        ops: [O('push', { id: 'Fasig2', nombre: 'operator=', refs: [['this', 'c3', ''], ['other', 'r', 'referencia']] }), O('set', { id: 'c3', re: 2, im: 4 })],
        expl: 'De nuevo <code>*this = other;</code>: <code>c3</code> = (2, 4).' },
      { l: 6, fn: ['dtor', 0], log: ['dtor', '~CComplex() → result (2, 4), al salir de operator+'],
        ops: [O('pop', { id: 'Fasig2' }), O('pop', { id: 'Fcop2' }), O('dtor', { id: 'r' })],
        expl: 'Al terminar <code>operator+</code> se destruye su variable local <code>result</code>: es el destructor «de más» que no aparece cuando hay NRVO.' },
      { l: 7, ops: [O('pop', { id: 'Fmas' }), O('out', { txt: 'c3 = (2,4)\n' })],
        expl: 'De vuelta en <code>main</code>. Salida: <code>c3 = (2,4)</code>; el resultado es el mismo con y sin elisión, solo cambia el número de objetos.' },
      { l: 8, fn: ['ctor2', 1], log: ['ctor', 'new CComplex(4.0, 5.0) → *c4 (4, 5) en el heap'],
        ops: [O('obj', { id: 'h4', etq: '*c4', marco: 'heap', re: 4, im: 5, dir: d.heap }), O('ptr', { id: 'c4', etq: 'c4', marco: 'main', dst: 'h4' })],
        expl: '<code>new</code> reserva memoria en el <strong>heap</strong> y ejecuta el constructor allí. <code>c4</code> es un puntero en la pila que guarda la dirección del objeto (' + d.heap + ').' }
    ]).concat(finales108(d));
    return pasos;
  }

  // ---------------- Escenario 10.5 ----------------
  function main105(valor) {
    return [
      '#include "CComplex.h"',
      '',
      'int main() {',
      '    CComplex c1(0.0, 1.0);   // objeto 1',
      '    CComplex c2;             // objeto 2',
      valor ? '    c2 = c1;                 // objeto 3: parámetro other, después destruido'
            : '    c2 = c1;                 // sin copia: other es una referencia a c1',
      '    CComplex c3(c1);         // constructor de copia',
      '    return 0;',
      '}'];
  }

  function inicio105(d) {
    return [
      { l: 3, fn: ['ctor2', 1], log: ['ctor', 'CComplex(double, double) → c1 (0, 1)'],
        ops: [O('obj', { id: 'c1', etq: 'c1', marco: 'main', re: 0, im: 1, dir: d.c1 })],
        expl: 'Objeto 1: <code>c1</code> = (0, 1).' },
      { l: 4, fn: ['ctor0', 0], log: ['ctor', 'CComplex() → c2 (0, 0)'],
        ops: [O('obj', { id: 'c2', etq: 'c2', marco: 'main', re: 0, im: 0, dir: d.c2 })],
        expl: 'Objeto 2: <code>c2</code> con el constructor por defecto = (0, 0).' }
    ];
  }
  function final105(d) {
    return [
      { l: 8, fn: ['dtor', 0], log: ['dtor', '~CComplex() → c3 (0, 1)'], ops: [O('dtor', { id: 'c3' })],
        expl: 'Fin de ámbito: destrucción en orden inverso. Primero <code>c3</code>…' },
      { l: 8, fn: ['dtor', 0], log: ['dtor', '~CComplex() → c2 (0, 1)'], ops: [O('dtor', { id: 'c2' })],
        expl: '…después <code>c2</code>…' },
      { l: 8, fn: ['dtor', 0], log: ['dtor', '~CComplex() → c1 (0, 1)'], ops: [O('dtor', { id: 'c1' })],
        expl: '…y por último <code>c1</code>. ' + d.resumen }
    ];
  }

  function esc105valor() {
    var d = { c1: '0x16d14e708', c2: '0x16d14e6f8', o: '0x16d14e6d8', c3: '0x16d14e6c8',
      resumen: 'Total: <strong>4 construidos y 4 destruidos</strong> (c1, c2, other y c3). Sin la línea de <code>c3</code> son los 3 y 3 que cuenta el libro.' };
    return inicio105(d).concat([
      { l: 5, fn: ['copiaLista', 1], log: ['copia', 'constructor de copia → other ← c1 (parámetro por valor)'],
        ops: [O('push', { id: 'Fasig', nombre: 'operator=', refs: [['this', 'c2', '']] }),
              O('obj', { id: 'o', etq: 'other', marco: 'Fasig', re: 0, im: 1, dir: d.o })],
        expl: '<code>c2 = c1</code> llama a <code>c2.operator=(c1)</code>. Como el parámetro se recibe <strong>por valor</strong>, antes de entrar se construye el objeto 3: <code>other</code>, copia de <code>c1</code>, con el constructor de copia.' },
      { l: 5, fn: ['asigVal', 2], log: ['asig', 'operator=(CComplex) → c2 = other (0, 1)'],
        ops: [O('set', { id: 'c2', re: 0, im: 1 })],
        expl: 'Se copian los miembros de <code>other</code> en <code>c2</code>. Aquí <code>this != &amp;other</code> es siempre cierto: <code>other</code> es otro objeto, así que la comprobación sobra.' },
      { l: 5, fn: ['dtor', 0], log: ['dtor', '~CComplex() → other, al terminar operator='],
        ops: [O('dtor', { id: 'o' })],
        expl: 'Al terminar <code>operator=</code> se destruye su parámetro <code>other</code>. Hasta aquí, como dice el libro: <strong>3 construidos</strong> (c1, c2, other); c1 y c2 se destruirán al final → 3 y 3. La copia no aportaba nada: <code>operator=</code> solo necesita leer.' },
      { l: 6, fn: ['copiaLista', 1], log: ['copia', 'constructor de copia → c3 ← c1'],
        ops: [O('pop', { id: 'Fasig' }), O('obj', { id: 'c3', etq: 'c3', marco: 'main', re: 0, im: 1, dir: d.c3 })],
        expl: '<code>CComplex c3(c1);</code> construye un objeto <strong>nuevo</strong> como copia de <code>c1</code>: constructor de copia, no <code>operator=</code> (que trabaja sobre un objeto que ya existía).' },
      { l: 7, expl: '<code>return 0;</code>: quedan vivos c1, c2 y c3; se destruirán en la <code>}</code>.' }
    ]).concat(final105(d));
  }

  function esc105ref() {
    var d = { c1: '0x16f4ce708', c2: '0x16f4ce6f8', c3: '0x16f4ce6d8',
      resumen: 'Total: <strong>3 construidos y 3 destruidos</strong> (c1, c2 y c3). Sin la línea de <code>c3</code> son los 2 y 2 que cuenta el libro.' };
    return inicio105(d).concat([
      { l: 5, fn: ['asigRef', 2], log: ['asig', 'operator=(const CComplex&) → c2 = c1, sin copia'],
        ops: [O('push', { id: 'Fasig', nombre: 'operator=', refs: [['this', 'c2', ''], ['other', 'c1', 'referencia: es el propio c1']] }), O('set', { id: 'c2', re: 0, im: 1 })],
        expl: 'Con <code>const CComplex&amp; other</code> no se construye nada: <code>other</code> es otro nombre de <code>c1</code>, y <code>const</code> garantiza que no se modifica. Aquí <code>this != &amp;other</code> sí sirve: evita trabajo en <code>c1 = c1</code>.' },
      { l: 6, fn: ['copia', 0], log: ['copia', 'constructor de copia → c3 ← c1'],
        ops: [O('pop', { id: 'Fasig' }), O('obj', { id: 'c3', etq: 'c3', marco: 'main', re: null, im: null, dir: d.c3 }),
              O('push', { id: 'Fcop', nombre: 'CComplex(const CComplex&)', refs: [['this', 'c3', 'objeto que se construye'], ['other', 'c1', 'referencia']] })],
        expl: '<code>CComplex c3(c1);</code>: constructor de copia del libro. Recibe <code>other</code> por referencia (por valor necesitaría copiarse a sí mismo). Al entrar, los miembros de <code>c3</code> aún no tienen valor (??).' },
      { l: 6, fn: ['asigRef', 2], log: ['asig', 'operator=(const CComplex&) → c3 = c1 (desde el constructor de copia)'],
        ops: [O('push', { id: 'Fasig2', nombre: 'operator=', refs: [['this', 'c3', ''], ['other', 'c1', 'referencia']] }), O('set', { id: 'c3', re: 0, im: 1 })],
        expl: 'El cuerpo <code>*this = other;</code> reutiliza <code>operator=</code>: <code>c3</code> = (0, 1). En la traza aparece un <code>operator=</code> aunque la línea de <code>main</code> no tenga ningún <code>=</code>.' },
      { l: 7, ops: [O('pop', { id: 'Fasig2' }), O('pop', { id: 'Fcop' })],
        expl: '<code>return 0;</code>: quedan vivos c1, c2 y c3; se destruirán en la <code>}</code>.' }
    ]).concat(final105(d));
  }

  var ESCENARIOS = {
    '10.8': {
      titulo: '18.7 · Ejemplo completo de uso',
      grupo: 'Elisión de copias',
      variantes: [
        { id: 'elision', txt: 'clang por defecto (NRVO)', codigo: MAIN_108, pasos: esc108elision(),
          nota: 'Traza real: Apple clang 21, <code>-std=c++17</code> (igual con <code>-O0</code> y <code>-O2</code>), con un <code>printf</code> añadido en cada constructor, destructor y operador. Salida del programa: <code>c3 = (2,4)</code> y <code>c4 = (4,5)</code>.' },
        { id: 'sin-elision', txt: '-fno-elide-constructors', codigo: MAIN_108, pasos: esc108sinElision(),
          nota: 'Misma compilación con <code>-fno-elide-constructors</code>: aparece el objeto <code>result</code> como temporal (una copia y un destructor más). La salida del programa no cambia.' }
      ]
    },
    '10.5': {
      titulo: '18.4 · Asignación y constructor de copia',
      grupo: 'Parámetro de operator=',
      variantes: [
        { id: 'valor', txt: 'por valor: CComplex other', codigo: main105(true), pasos: esc105valor(),
          nota: 'Traza real (Apple clang 21, <code>-std=c++17</code>). En esta versión el constructor de copia <strong>no puede</strong> ser el del libro (<code>*this = other;</code>): llamaría a <code>operator=</code>, que para recibir <code>other</code> por valor necesita el constructor de copia, que vuelve a llamar a <code>operator=</code>… Compilado así, clang no avisa y el programa aborta por desbordamiento de pila. Por eso aquí la copia es miembro a miembro.' },
        { id: 'ref', txt: 'por referencia: const CComplex& other', codigo: main105(false), pasos: esc105ref(),
          nota: 'Traza real (Apple clang 21, <code>-std=c++17</code>) con la versión definitiva del libro: <code>operator=(const CComplex&amp;)</code> y el constructor de copia que la reutiliza con <code>*this = other;</code>.' }
      ]
    }
  };

  var TIPOS = { ctor: 'constructor', copia: 'copia', asig: 'operator=', dtor: 'destructor', llamada: 'llamada', nota: 'sin llamada' };

  // Ejecuta los k primeros pasos desde cero.
  function ejecutar(pasos, k) {
    var E = { objs: [], porId: {}, marcos: [{ id: 'main', nombre: 'main()', refs: [] }], out: '', cons: 0, dest: 0, nuevo: {}, cambio: {}, muere: {} };
    function marco(id) { for (var i = 0; i < E.marcos.length; i++) if (E.marcos[i].id === id) return E.marcos[i]; return null; }
    for (var i = 0; i < k; i++) {
      var ult = i === k - 1;
      (pasos[i].ops || []).forEach(function (op) {
        var o = E.porId[op.id];
        switch (op.o) {
          case 'obj':
            o = { id: op.id, tipo: 'obj', etq: op.etq, marco: op.marco, re: op.re, im: op.im, dir: op.dir, vivo: true };
            E.objs.push(o); E.porId[op.id] = o; E.cons++;
            if (ult) E.nuevo[op.id] = 1;
            break;
          case 'ptr':
            if (!o) { o = { id: op.id, tipo: 'ptr', etq: op.etq, marco: op.marco, vivo: true }; E.objs.push(o); E.porId[op.id] = o; if (ult) E.nuevo[op.id] = 1; }
            else if (ult) E.cambio[op.id] = 1;
            o.dst = op.dst;
            break;
          case 'set': o.re = op.re; o.im = op.im; if (ult) E.cambio[op.id] = 1; break;
          case 'etq': o.etq = op.etq; break;
          case 'dtor': o.vivo = false; E.dest++; if (ult) E.muere[op.id] = 1; break;
          case 'free': o.liberado = true; break;
          case 'push': E.marcos.push({ id: op.id, nombre: op.nombre, refs: op.refs.slice() }); break;
          case 'ref': marco(op.id).refs.push(op.r); break;
          case 'pop':
            E.marcos = E.marcos.filter(function (m) { return m.id !== op.id; });
            E.objs = E.objs.filter(function (x) { return x.marco !== op.id; });
            break;
          case 'out': E.out += op.txt; break;
        }
      });
    }
    return E;
  }

  MPI.componentes['cpp-ciclo-vida'] = function (el, cfg) {
    cfg = cfg || {};
    var id = 'cv' + (++uid);
    var esc0 = ESCENARIOS[cfg.escenario] ? cfg.escenario : '10.8';
    var S = ESCENARIOS[esc0];
    var vi = 0;
    S.variantes.forEach(function (v, i) { if (v.id === cfg.variante) vi = i; });
    var paso = 0, logN = 0;

    el.classList.add('mpi-cpp-ciclo-vida');
    el.innerHTML =
      '<div class="mpi-sim-cab">Ciclo de vida de los objetos <span class="cv-sub">' + esc(S.titulo) + '</span></div>' +
      '<div class="cv-variantes" role="group" aria-label="' + esc(S.grupo) + '"><span class="cv-grupo">' + esc(S.grupo) + ':</span>' +
        S.variantes.map(function (v, i) { return '<button type="button" class="cv-var" data-v="' + i + '" aria-pressed="false">' + esc(v.txt) + '</button>'; }).join('') +
      '</div>' +
      '<div class="cv-cuerpo">' +
        '<div class="cv-izq">' +
          '<div class="cv-codigo" role="region" aria-label="Código de main" tabindex="0"></div>' +
          '<div class="cv-controles">' +
            '<button type="button" class="cv-paso">Paso ▶</button>' +
            '<button type="button" class="cv-atras">◀ Atrás</button>' +
            '<button type="button" class="cv-reset">Reiniciar</button>' +
            '<span class="cv-contador"></span>' +
          '</div>' +
          '<div class="cv-expl" aria-live="polite"></div>' +
          '<div class="cv-fn"></div>' +
        '</div>' +
        '<div class="cv-der">' +
          '<div class="cv-vivos" aria-live="polite"></div>' +
          '<div class="cv-mem">' +
            '<div class="cv-pila"><div class="cv-tit">Pila</div><div class="cv-marcos"></div></div>' +
            '<div class="cv-heap"><div class="cv-tit">Heap</div><div class="cv-heap-in"></div></div>' +
            '<svg class="cv-flechas" aria-hidden="true" focusable="false"><defs><marker id="' + id + '-pt" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="cv-punta"/></marker>' +
              '<marker id="' + id + '-ptc" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="cv-punta-col"/></marker></defs><path class="cv-flecha"/></svg>' +
          '</div>' +
          (esc0 === '10.8' ? '<div class="cv-tit cv-tit-sal">Salida por pantalla</div><pre class="cv-salida"></pre>' : '') +
          '<div class="cv-tit cv-tit-sal" id="' + id + '-lt">Registro de llamadas</div>' +
          '<ol class="cv-log" aria-labelledby="' + id + '-lt" aria-live="polite" aria-relevant="additions"></ol>' +
        '</div>' +
      '</div>' +
      '<p class="cv-nota"></p>';

    function $(s) { return el.querySelector(s); }
    function V() { return S.variantes[vi]; }

    function pintarCodigo() {
      var h = '<pre class="cv-pre">';
      V().codigo.forEach(function (c, i) {
        h += '<span class="cv-linea" data-l="' + i + '"><span class="cv-marca" aria-hidden="true"></span><span class="cv-num" aria-hidden="true">' + (i + 1) + '</span><code>' + (c ? res(c) : ' ') + '</code></span>';
      });
      $('.cv-codigo').innerHTML = h + '</pre>';
      $('.cv-nota').innerHTML = V().nota;
      $('.cv-log').innerHTML = ''; logN = 0;
    }

    function cajaObj(o, E) {
      var cls = 'cv-obj' + (o.vivo ? '' : (o.liberado ? ' cv-liberado' : ' cv-muerto')) + (E.nuevo[o.id] ? ' cv-nuevo' : '') + (E.cambio[o.id] ? ' cv-cambio' : '') + (E.muere[o.id] ? ' cv-muere' : '');
      if (o.tipo === 'ptr') {
        var dst = o.dst ? E.porId[o.dst] : null;
        var val, col = false;
        if (!dst) val = '<span class="cv-null">nullptr</span>';
        else { col = !dst.vivo; val = esc(dst.dir) + (col ? ' <span class="cv-colg">(colgante)</span>' : ' → <code>' + esc(dst.etq) + '</code>'); }
        return '<div class="' + cls + ' cv-ptr"' + (dst ? ' data-src="' + o.dst + '"' + (col ? ' data-col="1"' : '') : '') + '>' +
          '<div class="cv-obj-cab"><code>' + esc(o.etq) + '</code><span class="cv-tipo">CComplex*</span></div>' +
          '<div class="cv-campo"><span>valor</span><span class="cv-v">' + val + '</span></div></div>';
      }
      var est = !o.vivo ? (o.liberado ? 'memoria liberada' : 'destruido') : (E.nuevo[o.id] ? 'recién construido' : '');
      return '<div class="' + cls + '"' + (o.marco === 'heap' ? ' data-dst="' + o.id + '"' : '') + '>' +
        '<div class="cv-obj-cab"><code>' + esc(o.etq) + '</code><span class="cv-tipo">CComplex</span><span class="cv-dir">' + esc(o.dir) + '</span></div>' +
        '<div class="cv-campo"><span>m_d_real</span><span class="cv-v' + (o.re == null ? ' cv-basura' : '') + '">' + fmt(o.re) + '</span></div>' +
        '<div class="cv-campo"><span>m_d_imag</span><span class="cv-v' + (o.im == null ? ' cv-basura' : '') + '">' + fmt(o.im) + '</span></div>' +
        (est ? '<div class="cv-estado">' + est + '</div>' : '') + '</div>';
    }

    function pintar() {
      var pasos = V().pasos, n = pasos.length;
      var E = ejecutar(pasos, paso);
      var bv = el.querySelectorAll('.cv-var');
      for (var i = 0; i < bv.length; i++) bv[i].setAttribute('aria-pressed', i === vi ? 'true' : 'false');

      var act = paso > 0 ? pasos[paso - 1].l : -1, sig = paso < n ? pasos[paso].l : -1;
      var ls = el.querySelectorAll('.cv-codigo .cv-linea');
      for (i = 0; i < ls.length; i++) {
        ls[i].classList.toggle('cv-actual', i === act);
        ls[i].querySelector('.cv-marca').textContent = i === sig && sig !== act ? '▶' : '';
      }
      $('.cv-paso').disabled = paso >= n;
      $('.cv-atras').disabled = paso === 0;
      $('.cv-contador').textContent = 'Paso ' + paso + ' de ' + n;
      $('.cv-expl').innerHTML = paso === 0
        ? 'Pulsa <strong>Paso</strong> para empezar a ejecutar <code>main</code>. Cada paso es una llamada (constructor, copia, <code>operator=</code>, destructor…) o una línea de <code>main</code>.'
        : '<strong>Paso ' + paso + ':</strong> ' + pasos[paso - 1].expl;

      // Función en ejecución
      var f = paso > 0 ? pasos[paso - 1].fn : null;
      if (f) {
        var F = FN[f[0]];
        $('.cv-fn').innerHTML = '<div class="cv-tit">Función en ejecución: <code>' + esc(F.nombre) + '</code></div><pre class="cv-pre cv-pre-fn">' +
          F.c.map(function (c, j) { return '<span class="cv-linea' + (j === f[1] ? ' cv-actual' : '') + '"><code>' + res(c) + '</code></span>'; }).join('') + '</pre>' +
          (F.nota ? '<p class="cv-fn-nota">' + F.nota + '</p>' : '');
      } else {
        $('.cv-fn').innerHTML = '<div class="cv-tit">Función en ejecución: <code>main()</code></div>';
      }

      // Contador
      var vivos = E.cons - E.dest;
      $('.cv-vivos').innerHTML = '<span class="cv-vivos-n">' + vivos + '</span><span class="cv-vivos-t">objeto' + (vivos === 1 ? '' : 's') + ' CComplex vivo' + (vivos === 1 ? '' : 's') + '</span>' +
        '<span class="cv-vivos-d">construidos ' + E.cons + ' · destruidos ' + E.dest + '</span>';

      // Pila: marcos (main arriba, la llamada más interna abajo)
      var h = '';
      E.marcos.forEach(function (m, k) {
        var objs = E.objs.filter(function (o) { return o.marco === m.id; });
        h += '<section class="cv-marco' + (k === E.marcos.length - 1 && k > 0 ? ' cv-marco-act' : '') + '" style="margin-left:' + Math.min(k, 3) * 0.6 + 'rem">' +
          '<div class="cv-marco-cab">' + (k === 0 ? 'marco de <code>main()</code>' : 'llamada a <code>' + esc(m.nombre) + '</code>') + '</div>';
        if (m.refs.length) {
          h += '<ul class="cv-refs">' + m.refs.map(function (r) {
            var t = E.porId[r[1]];
            return '<li><code>' + esc(r[0]) + '</code> → <code>' + esc(t ? t.etq : r[1]) + '</code>' + (r[2] ? ' <span class="cv-tenue">' + esc(r[2]) + '</span>' : '') + '</li>';
          }).join('') + '</ul>';
        }
        if (objs.length) h += '<div class="cv-objs">' + objs.map(function (o) { return cajaObj(o, E); }).join('') + '</div>';
        else if (!m.refs.length) h += '<p class="cv-vacio">Sin variables todavía.</p>';
        h += '</section>';
      });
      $('.cv-marcos').innerHTML = h;
      var heap = E.objs.filter(function (o) { return o.marco === 'heap'; });
      $('.cv-heap-in').innerHTML = heap.length ? '<div class="cv-objs">' + heap.map(function (o) { return cajaObj(o, E); }).join('') + '</div>'
        : '<p class="cv-vacio">' + (esc0 === '10.8' ? 'Vacío: aún no se ha hecho ningún <code>new</code>.' : 'Este programa no usa <code>new</code>: todo está en la pila.') + '</p>';
      if ($('.cv-salida')) $('.cv-salida').textContent = E.out || ' ';

      // Registro: se añaden o quitan entradas (aria-live solo anuncia las nuevas)
      var entradas = [];
      for (i = 0; i < paso; i++) if (pasos[i].log) entradas.push(pasos[i].log);
      var ol = $('.cv-log');
      while (logN > entradas.length) { ol.removeChild(ol.lastChild); logN--; }
      while (logN < entradas.length) {
        var e = entradas[logN], li = document.createElement('li');
        li.className = 'cv-l-' + e[0];
        li.innerHTML = '<span class="cv-badge">' + TIPOS[e[0]] + '</span> <span>' + e[1] + '</span>';
        ol.appendChild(li); logN++;
      }
      var lis = ol.children;
      for (i = 0; i < lis.length; i++) lis[i].classList.toggle('cv-l-ult', i === lis.length - 1 && paso > 0 && !!pasos[paso - 1].log);
      if (ol.lastChild && ol.lastChild.classList.contains('cv-l-ult')) ol.scrollTop = ol.scrollHeight;
      dibujarFlecha();
    }

    // Flecha del puntero al objeto del heap (SVG superpuesto a la zona de memoria)
    function dibujarFlecha() {
      var mem = $('.cv-mem'), path = $('.cv-flecha'), svg = $('.cv-flechas');
      var src = mem.querySelector('[data-src]');
      var dst = src ? mem.querySelector('[data-dst="' + src.getAttribute('data-src') + '"]') : null;
      if (!src || !dst) { path.setAttribute('d', ''); return; }
      var R = mem.getBoundingClientRect(), a = src.getBoundingClientRect(), b = dst.getBoundingClientRect();
      svg.setAttribute('width', R.width); svg.setAttribute('height', R.height);
      var d;
      if (b.left >= a.right - 4) {               // heap a la derecha
        var x1 = a.right - R.left, y1 = a.top + a.height / 2 - R.top, x2 = b.left - R.left - 2, y2 = b.top + Math.min(b.height / 2, 24) - R.top;
        var mx = (x1 + x2) / 2;
        d = 'M' + x1 + ',' + y1 + ' C' + mx + ',' + y1 + ' ' + mx + ',' + y2 + ' ' + x2 + ',' + y2;
      } else {                                    // heap debajo (pantalla estrecha)
        var sx = a.right - R.left - 14, sy = a.bottom - R.top, ex = b.left - R.left + 30, ey = b.top - R.top - 2;
        d = 'M' + sx + ',' + sy + ' C' + sx + ',' + (sy + ey) / 2 + ' ' + ex + ',' + (sy + ey) / 2 + ' ' + ex + ',' + ey;
      }
      var col = src.getAttribute('data-col') === '1';
      path.setAttribute('d', d);
      path.setAttribute('class', 'cv-flecha' + (col ? ' cv-flecha-col' : ''));
      path.setAttribute('marker-end', 'url(#' + id + (col ? '-ptc' : '-pt') + ')');
    }
    if (window.ResizeObserver) new ResizeObserver(dibujarFlecha).observe($('.cv-mem'));
    else window.addEventListener('resize', dibujarFlecha);

    el.addEventListener('click', function (e) {
      var t = e.target.closest('button');
      if (!t || !el.contains(t)) return;
      if (t.classList.contains('cv-var')) { vi = +t.getAttribute('data-v'); paso = 0; pintarCodigo(); pintar(); return; }
      if (t.classList.contains('cv-paso') && paso < V().pasos.length) paso++;
      else if (t.classList.contains('cv-atras') && paso > 0) paso--;
      else if (t.classList.contains('cv-reset')) paso = 0;
      else return;
      pintar();
    });

    pintarCodigo();
    pintar();
  };

  // Expuesto para pruebas.
  MPI.componentes['cpp-ciclo-vida']._escenarios = ESCENARIOS;
  MPI.componentes['cpp-ciclo-vida']._ejecutar = ejecutar;
})();
