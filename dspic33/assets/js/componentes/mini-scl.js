/*
 * Componente "mini-scl": intérprete reducido del lenguaje SCL (Stimulus Control
 * Language) del simulador de MPLAB X, para practicar el capítulo 22 del libro
 * (tema 16 de la web) sin tener MPLAB X delante.
 *
 * Uso:
 *   <div class="mpi-mount" data-componente="mini-scl"
 *        data-config='{"ejemplo":"medir-pulso","fcy":40000000}'></div>
 *
 * Claves de data-config:
 *   ejemplo  "medir-pulso" (now() del libro, 22.3.3.6) o "ventana-dc" (if/elsif/else
 *            del libro, 22.3.3.3, con 4990 ic / 5010 ic). Por defecto "medir-pulso".
 *   fcy      40000000 (defecto, valor aproximado del curso) o 39613750 (exacto).
 *            Solo se admiten esos dos valores (ficha de la asignatura).
 *
 * Modelo:
 *   - No hay CPU. El «micro» es un generador de señal: el programa saca por RB15
 *     (LED D6 de la PicTrainer) un tren de pulsos con tiempo alto y bajo en µs
 *     editables (125 µs = 5000 ic y 500 µs a 40 MHz por defecto).
 *   - El tiempo simulado se cuenta en ciclos de instrucción (ic) a FCY.
 *   - Un solo process. Al llegar a «end process;» vuelve a empezar (como en VHDL).
 *   - «wait until» sigue sin esperar si la condición ya se cumple.
 *   - «wait until PC == N» se aproxima con PC = 2 × ciclos (programa en línea recta).
 *   - Subconjunto: configuration/testbench/process, variable (integer, byte, word,
 *     boolean, bit, character, cycle, time, string), <= a pines (RA0-RA4, RB0-RB14,
 *     AN0-AN5), := a variables, report, wait (5 formas), if/elsif/else, loop/exit
 *     [when], while, now(), not/and/or, comparaciones y + − * / con unidades.
 *
 * El motor (analizar + Sim) queda en MPI.componentes['mini-scl'].motor para pruebas.
 */
window.MPI = window.MPI || {};
MPI.componentes = MPI.componentes || {};

(function () {
  'use strict';

  var ID = 0;
  var NBSP = ' ';
  var LIMITE_PASOS = 20000;        // pasos por cada «Ejecutar todo»
  var LIMITE_SIN_AVANCE = 5000;    // pasos seguidos sin que avance el tiempo
  var LIMITE_REPORTS = 500;
  var LIMITE_SEG = 10;             // segundos simulados
  var LIMITE_ITER_ESPERA = 2000000;
  var MICRO = 'dsPIC33FJ32MC202';

  // ------------------------------------------------------------ utilidades
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function agrupar(ent) { return ent.length >= 5 ? ent.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP) : ent; }
  function fmtEnt(n) { n = Math.round(n); return (n < 0 ? '−' : '') + agrupar(String(Math.abs(n))); }
  function fmtDec(x, nd) {
    var neg = x < 0; x = Math.abs(x);
    var p = x.toFixed(nd).split('.');
    var dec = p[1] ? p[1].replace(/0+$/, '') : '';
    return (neg ? '−' : '') + agrupar(p[0]) + (dec ? ',' + dec : '');
  }
  function fmtUs(us) {
    if (Math.abs(us) >= 1e6) return fmtDec(us / 1e6, 4) + NBSP + 's';
    if (Math.abs(us) >= 1000) return fmtDec(us / 1000, 3) + NBSP + 'ms';
    return fmtDec(us, 3) + NBSP + 'µs';
  }
  function fmtPs(ps) {
    var a = Math.abs(ps);
    if (a >= 1e12) return fmtDec(ps / 1e12, 4) + NBSP + 'sec';
    if (a >= 1e9) return fmtDec(ps / 1e9, 4) + NBSP + 'ms';
    if (a >= 1e6) return fmtDec(ps / 1e6, 4) + NBSP + 'us';
    if (a >= 1e3) return fmtDec(ps / 1e3, 3) + NBSP + 'ns';
    return fmtEnt(ps) + NBSP + 'ps';
  }
  function fmtFcy(f) { return f === 40000000 ? '40 MHz' : fmtEnt(f) + ' Hz'; }
  function errSCL(linea, msg) { var e = new Error(msg); e.linea = linea; e.scl = true; return e; }

  // Distancia de edición con trasposición (para sugerir «dc» si se escribe «cd»).
  function distancia(a, b) {
    var d = [], i, j;
    for (i = 0; i <= a.length; i++) { d[i] = [i]; }
    for (j = 0; j <= b.length; j++) d[0][j] = j;
    for (i = 1; i <= a.length; i++) {
      for (j = 1; j <= b.length; j++) {
        var c = a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1;
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c);
        if (i > 1 && j > 1 && a.charAt(i - 1) === b.charAt(j - 2) && a.charAt(i - 2) === b.charAt(j - 1)) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
    return d[a.length][b.length];
  }

  // ------------------------------------------------------------ léxico y tablas
  var PALABRAS = ('configuration for is end testbench begin process variable if then elsif else loop while exit when ' +
    'wait on until report and or not true false now null').split(' ');
  var ES_PALABRA = {};
  PALABRAS.forEach(function (p) { ES_PALABRA[p] = 1; });

  var PINES = {};
  var AN_FISICO = ['RA0', 'RA1', 'RB0', 'RB1', 'RB2', 'RB3'];
  var NOTA_PIN = { RB15: 'D6', RB14: 'D7', RB13: 'D8', RB12: 'D9', RB2: 'SW2', RB4: 'U1TX', RB5: 'U1RX' };
  (function () {
    var i;
    for (i = 0; i <= 4; i++) PINES['RA' + i] = { tipo: 'bit' };
    for (i = 0; i <= 15; i++) PINES['RB' + i] = { tipo: 'bit' };
    for (i = 0; i <= 5; i++) { PINES['AN' + i] = { tipo: 'mv', fisico: AN_FISICO[i] }; PINES[AN_FISICO[i]].an = 'AN' + i; }
  })();

  var TIPOS = { integer: 'int', byte: 'int', word: 'int', boolean: 'bool', bit: 'bit', character: 'char', cycle: 'cycle', time: 'time', string: 'str' };
  var NOMBRE_TIPO = { int: 'integer', bool: 'boolean', bit: 'bit', char: 'character', cycle: 'cycle', time: 'time', str: 'string', mv: 'tensión (mV)', now: 'cycle' };
  var UNIDADES = {
    ps: { tipo: 'time', f: 1 }, ns: { tipo: 'time', f: 1e3 }, us: { tipo: 'time', f: 1e6 }, ms: { tipo: 'time', f: 1e9 },
    sec: { tipo: 'time', f: 1e12 }, min: { tipo: 'time', f: 60e12 }, hr: { tipo: 'time', f: 3600e12 },
    ic: { tipo: 'cycle', f: 1 }, mv: { tipo: 'mv', f: 1 }, v: { tipo: 'mv', f: 1000 }
  };
  var UNIDAD_MENOR = { v: ['mv', 1000], hr: ['min', 60], min: ['sec', 60], sec: ['ms', 1000], ms: ['us', 1000], us: ['ns', 1000], ns: ['ps', 1000] };
  var UNIDAD_TIPO = { cycle: 'ic', time: 'us', mv: 'mv' };
  var NUMERICO = { int: 1, cycle: 1, time: 1, mv: 1 };
  var OPS_CMP = ['==', '=', '!=', '/=', '<', '>', '<=', '>='];

  function lexer(src) {
    var toks = [], i = 0, n = src.length, linea = 1, m;
    function push(k, v, len, extra) {
      var t = { k: k, v: v, linea: linea, ini: i, fin: i + len, raw: src.substr(i, len) };
      if (extra) for (var x in extra) t[x] = extra[x];
      toks.push(t); i += len;
    }
    while (i < n) {
      var c = src.charAt(i);
      if (c === '\n') { linea++; i++; continue; }
      if (c === ' ' || c === '\t' || c === '\r' || c === '\f' || c === ' ') { i++; continue; }
      if ((c === '/' && src.charAt(i + 1) === '/') || (c === '-' && src.charAt(i + 1) === '-')) {
        while (i < n && src.charAt(i) !== '\n') i++;
        continue;
      }
      var resto = src.slice(i, i + 400);
      if (c === '#') {
        m = /^#(\d+)#([0-9A-Za-z_]+)#/.exec(resto);
        var base = m ? +m[1] : 0, val = m ? parseInt(m[2].replace(/_/g, ''), base) : NaN;
        if (!m || base < 2 || base > 16 || isNaN(val)) throw errSCL(linea, 'Número en base mal escrito: el formato es #base#cifras# (por ejemplo #16#FF#).');
        push('num', val, m[0].length); continue;
      }
      if ((c === 'B' || c === 'b') && src.charAt(i + 1) === '"') {
        m = /^[Bb]"([01_]+)"/.exec(resto);
        if (!m) throw errSCL(linea, 'Número binario mal escrito: el formato es B"1010".');
        push('num', parseInt(m[1].replace(/_/g, ''), 2), m[0].length); continue;
      }
      if (/[0-9]/.test(c)) {
        m = /^(\d[\d_]*)(?:([.,])(\d+))?(?:[eE](\d+))?/.exec(resto);
        if (m[2]) push('num', parseFloat(m[1].replace(/_/g, '') + '.' + m[3]), m[0].length, { dec: true, sep: m[2] });
        else push('num', parseInt(m[1].replace(/_/g, ''), 10) * (m[4] ? Math.pow(10, +m[4]) : 1), m[0].length);
        continue;
      }
      if (/[A-Za-z_]/.test(c)) {
        m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(resto);
        push('id', m[0], m[0].length); continue;
      }
      if (c === '"') {
        m = /^"([^"\n]*)"/.exec(resto);
        if (!m) throw errSCL(linea, 'Cadena sin cerrar: falta la comilla doble final («"»).');
        push('str', m[1], m[0].length); continue;
      }
      if (c === "'") {
        m = /^'([^'\n]{0,3})'/.exec(resto);
        if (!m) throw errSCL(linea, "Comilla simple sin cerrar: un bit se escribe '0' o '1'.");
        push('chr', m[1], m[0].length); continue;
      }
      if (/[“”‘’«»]/.test(c)) throw errSCL(linea, 'Comillas tipográficas «' + c + '» (suelen venir de copiar de un PDF): usa comillas rectas, " para cadenas y \' para bits.');
      if (c === 'µ' || c === 'μ') throw errSCL(linea, 'En SCL los microsegundos se escriben «us» (sin «µ»).');
      var dos = src.substr(i, 2);
      if (['<=', '>=', '==', '!=', '/=', ':='].indexOf(dos) >= 0) { push('op', dos, 2); continue; }
      if ('<>=+-*/();:,.'.indexOf(c) >= 0) { push('op', c, 1); continue; }
      throw errSCL(linea, 'Carácter no válido «' + c + '».');
    }
    toks.push({ k: 'eof', v: '', linea: linea, ini: n, fin: n, raw: '' });
    return toks;
  }

  // ------------------------------------------------------------ análisis
  // Devuelve { errores:[{linea,msg}], avisos:[{linea,msg}], ops, vars, pines, lineasBlanco }
  function analizar(src, opc) {
    opc = opc || {};
    var fcy = opc.fcy || 40000000;
    var res = { errores: [], avisos: [], ops: null, vars: [], pines: [], lineasBlanco: 0 };
    var lineas = src.split('\n');
    var ultimaNoBlanca = 0;
    lineas.forEach(function (l, k) { if (l.trim()) ultimaNoBlanca = k; });
    for (var k = 0; k < ultimaNoBlanca; k++) if (!lineas[k].trim()) res.lineasBlanco++;

    var toks;
    try { toks = lexer(src); } catch (e) { if (!e.scl) throw e; res.errores.push({ linea: e.linea, msg: e.message }); return res; }

    var p = 0, ultimo = null, vars = {}, pinesSet = {}, nLoop = 0;
    function peek(d) { return toks[Math.min(p + (d || 0), toks.length - 1)]; }
    function sig() { ultimo = toks[p]; if (p < toks.length - 1) p++; return ultimo; }
    function esKw(t, kw) { return t.k === 'id' && t.v.toLowerCase() === kw; }
    function esOp(t, o) { return t.k === 'op' && t.v === o; }
    function desc(t) { return t.k === 'eof' ? 'el final del fichero' : '«' + t.raw + '»'; }
    function fallo(t, msg) { throw errSCL(t.linea, msg); }
    function sem(linea, msg) { res.errores.push({ linea: linea, msg: msg }); }
    function texto(n) { return src.slice(n.ini, n.fin).replace(/\s+/g, ' '); }
    function conUnidad(n, u) {
      if (n.k === 'lit') return texto(n) + ' ' + u;
      return texto(n).replace(/(^|[^\w.])(\d+)(?![\w.])/g, '$1$2 ' + u);
    }
    function pedirKw(kw, ctx) {
      var t = peek();
      if (!esKw(t, kw)) {
        if (ultimo && t.linea > ultimo.linea && kw === 'then') fallo(ultimo, 'Falta «then» al final de la condición del if (línea ' + ultimo.linea + ').');
        fallo(t, 'Se esperaba «' + kw + '»' + (ctx ? ' ' + ctx : '') + ' y aparece ' + desc(t) + '.');
      }
      return sig();
    }
    function pedirOp(o, ctx) {
      var t = peek();
      if (!esOp(t, o)) fallo(t, 'Se esperaba «' + o + '»' + (ctx ? ' ' + ctx : '') + ' y aparece ' + desc(t) + '.');
      return sig();
    }
    function puntoYComa() {
      var t = peek();
      if (esOp(t, ';')) return sig();
      if (ultimo && (t.linea > ultimo.linea || t.k === 'eof')) throw errSCL(ultimo.linea, 'Falta «;» al final de la línea ' + ultimo.linea + '. En SCL cada instrucción y cada «end …» terminan en «;» (libro 22.3.5 c).');
      fallo(t, 'Se esperaba «;» antes de ' + desc(t) + '.');
    }
    function nombreLibre(t) {
      if (t.k !== 'id') fallo(t, 'Se esperaba el nombre de la variable y aparece ' + desc(t) + '.');
      var low = t.v.toLowerCase(), up = t.v.toUpperCase();
      if (ES_PALABRA[low] || TIPOS[low]) fallo(t, '«' + t.v + '» es una palabra reservada de SCL: elige otro nombre.');
      if (PINES[up] || /^PORT[AB]$/.test(up) || up === 'PC') fallo(t, '«' + t.v + '» es una señal del micro; las variables necesitan otro nombre.');
      return t;
    }

    // --- fichero
    var micro1 = null;
    try {
      if (esKw(peek(), 'configuration')) {
        sig(); pedirKw('for'); var tm = peek();
        if (tm.k !== 'str') fallo(tm, 'Se esperaba el nombre del micro entre comillas: configuration for "' + MICRO + '" is');
        micro1 = sig(); pedirKw('is'); pedirKw('end', 'para cerrar la configuración'); pedirKw('configuration'); puntoYComa();
      }
      if (!esKw(peek(), 'testbench')) fallo(peek(), 'Se esperaba «testbench for "' + MICRO + '" is» y aparece ' + desc(peek()) + '.');
      sig(); pedirKw('for');
      var tm2 = peek();
      if (tm2.k !== 'str') fallo(tm2, 'Se esperaba el nombre del micro entre comillas: testbench for "' + MICRO + '" is');
      sig();
      [micro1, tm2].forEach(function (t) {
        if (t && t.v !== MICRO) res.avisos.push({ linea: t.linea, msg: 'El micro de la asignatura es "' + MICRO + '" (aquí pone "' + t.v + '").' });
      });
      pedirKw('is'); pedirKw('begin');
      if (!esKw(peek(), 'process')) fallo(peek(), 'Se esperaba «process is» y aparece ' + desc(peek()) + '.');
      var cuerpo = proceso();
      if (esKw(peek(), 'process')) fallo(peek(), 'Este mini-simulador solo ejecuta un process (MPLAB X admite varios en paralelo).');
      pedirKw('end', 'para cerrar el testbench'); pedirKw('testbench'); puntoYComa();
      if (peek().k !== 'eof') fallo(peek(), 'Sobra texto después de «end testbench;»: ' + desc(peek()) + '.');
      if (!res.errores.length) res.ops = compilar(cuerpo);
    } catch (e) {
      if (!e.scl) throw e;
      res.errores.push({ linea: e.linea, msg: e.message });
    }
    res.errores.sort(function (a, b) { return a.linea - b.linea; });
    var vistos = {};
    res.errores = res.errores.filter(function (e) { var c = e.linea + '|' + e.msg; if (vistos[c]) return false; vistos[c] = 1; return true; });
    if (res.errores.length) res.ops = null;
    res.vars = Object.keys(vars).map(function (k) { return vars[k]; });
    res.pines = Object.keys(pinesSet);
    return res;

    function proceso() {
      sig(); pedirKw('is');
      while (esKw(peek(), 'variable')) {
        var tv = sig();
        var tn = nombreLibre(sig());
        pedirOp(':', 'entre el nombre y el tipo');
        var tt = peek();
        if (tt.k !== 'id') fallo(tt, 'Se esperaba el tipo de la variable y aparece ' + desc(tt) + '.');
        sig();
        var tl = tt.v.toLowerCase();
        if (!TIPOS[tl]) {
          if (/^(paddress|daddress|frequency)$/.test(tl)) sem(tt.linea, 'El tipo «' + tt.v + '» existe en SCL pero este mini-simulador no lo admite (usa integer, cycle, time, string, boolean, bit o character).');
          else fallo(tt, 'Tipo desconocido «' + tt.v + '». Los tipos de SCL son integer, byte, word, boolean, bit, character, cycle, time, string…');
        }
        var clave = tn.v.toLowerCase();
        if (vars[clave]) sem(tn.linea, 'La variable «' + tn.v + '» ya está declarada en la línea ' + vars[clave].linea + '.');
        else vars[clave] = { clave: clave, nombre: tn.v, tipo: TIPOS[tl] || 'int', tipoTxt: tl, linea: tv.linea };
        puntoYComa();
      }
      if (esKw(peek(), 'variable') === false && peek().k === 'id' && !esKw(peek(), 'begin')) {
        var tx = peek();
        if (esOp(peek(1), ':')) fallo(tx, 'Las variables se declaran con «variable ' + tx.v + ' : tipo;».');
      }
      pedirKw('begin', 'tras las declaraciones de variables');
      var cuerpo = instrucciones();
      cerrar('process');
      return cuerpo;
    }

    function cerrar(que, abre) {
      var t = peek();
      if (t.k === 'eof') fallo(t, 'Falta «end ' + que + ';»' + (abre ? ' para cerrar el ' + que + ' de la línea ' + abre : '') + '.');
      pedirKw('end');
      var t2 = peek();
      if (!esKw(t2, que)) fallo(t2, 'Se esperaba «end ' + que + ';»' + (abre ? ' (cierra el ' + que + ' de la línea ' + abre + ')' : '') + ' y aparece «end ' + t2.raw + '».');
      sig(); puntoYComa();
    }

    function instrucciones() {
      var lista = [];
      while (true) {
        var t = peek();
        if (t.k === 'eof' || esKw(t, 'end') || esKw(t, 'elsif') || esKw(t, 'else')) break;
        lista.push(instruccion());
      }
      return lista;
    }

    function instruccion() {
      var t = peek(), low = t.k === 'id' ? t.v.toLowerCase() : '';
      if (low === 'wait') return espera();
      if (low === 'report') {
        sig();
        if (!esOp(peek(), '(')) fallo(peek(), 'report lleva la cadena entre paréntesis: report("texto");');
        sig();
        var e = expr();
        pedirOp(')', 'para cerrar report(');
        puntoYComa();
        if (e.tipo && e.tipo !== 'str') sem(t.linea, 'report solo muestra cadenas (string): no admite números ni variables numéricas ni construir textos (libro 22.3.3.1). El valor de «' + texto(e) + '» se ve en el panel Variables.');
        return { k: 'report', e: e, linea: t.linea };
      }
      if (low === 'if') return si();
      if (low === 'loop') {
        sig(); nLoop++;
        var cuerpo = instrucciones();
        nLoop--;
        cerrar('loop', t.linea);
        return { k: 'loop', cuerpo: cuerpo, linea: t.linea, lineaFin: ultimo.linea };
      }
      if (low === 'while') {
        sig();
        var c = condicion(expr(), 'while');
        pedirKw('loop', 'después de la condición del while');
        nLoop++;
        var cw = instrucciones();
        nLoop--;
        cerrar('loop', t.linea);
        return { k: 'while', c: c, cuerpo: cw, linea: t.linea, lineaFin: ultimo.linea };
      }
      if (low === 'exit') {
        sig();
        var ce = null;
        if (esKw(peek(), 'when')) { sig(); ce = condicion(expr(), 'exit when'); }
        puntoYComa();
        if (!nLoop) sem(t.linea, '«exit» solo puede ir dentro de un loop o un while.');
        return { k: 'exit', c: ce, linea: t.linea };
      }
      if (low === 'null') { sig(); puntoYComa(); return { k: 'null', linea: t.linea }; }
      if (low === 'elseif' || low === 'elif') fallo(t, 'En SCL se escribe «elsif» (sin «e» final ni espacio).');
      if (low === 'endif' || low === 'end_if') fallo(t, 'Se escribe «end if;» (dos palabras).');
      if (low === 'variable') fallo(t, 'Las variables se declaran antes del «begin» del process.');
      if (low === 'then') fallo(t, '«then» sin «if».');
      if (t.k === 'id' && !ES_PALABRA[low]) return asignacion();
      fallo(t, 'Se esperaba una instrucción y aparece ' + desc(t) + '.');
    }

    function asignacion() {
      var t = peek();
      var ref = senal(true);
      var op = peek();
      if (esOp(op, '<=')) {
        sig();
        var e = expr();
        puntoYComa();
        if (ref.malo) { /* ya se ha dado el error */ }
        else if (ref.clase === 'var') sem(t.linea, '«' + ref.nombre + '» es una variable: a las variables se asigna con «:=» («<=» es para señales, los pines).');
        else comprobarSenal(ref, e, t.linea);
        return { k: 'sig', ref: ref, e: e, linea: t.linea };
      }
      if (esOp(op, ':=')) {
        sig();
        var e2 = expr();
        puntoYComa();
        if (ref.malo) { /* ya se ha dado el error */ }
        else if (ref.clase !== 'var') sem(t.linea, '«' + ref.nombre + '» es una señal del micro: a las señales se asigna con «<=» («:=» es para variables).');
        else comprobarVar(ref, e2, t.linea);
        return { k: 'var', ref: ref, e: e2, linea: t.linea };
      }
      if (esOp(op, '=')) fallo(op, 'Para asignar se usa «:=» (variables) o «<=» (señales); «=» solo compara.');
      if (ultimo && op.linea > ultimo.linea) fallo(ultimo, 'Instrucción incompleta en la línea ' + ultimo.linea + ': falta «<= valor;» o «:= valor;».');
      fallo(op, 'Se esperaba «<=» o «:=» después de «' + ref.nombre + '» y aparece ' + desc(op) + '.');
    }

    function comprobarSenal(ref, e, linea) {
      if (ref.clase === 'pc') { sem(linea, 'El PC no se puede asignar desde SCL en este mini-simulador.'); return; }
      if (ref.clase === 'port') { sem(linea, 'Asigna los pines de uno en uno (por ejemplo RB0 <= \'1\';): este mini-simulador no escribe ' + ref.nombre + ' entero.'); return; }
      if (ref.nombre === 'RB15') { sem(linea, 'RB15 la maneja el «micro» de este simulador (es la salida que se mide): el SCL no puede inyectarle un valor. Usa otro pin.'); return; }
      var pin = PINES[ref.nombre];
      if (!e.tipo) return;
      if (pin.tipo === 'bit') {
        if (e.tipo === 'bit') return;
        if (e.tipo === 'int' && e.k === 'lit' && (e.v === 0 || e.v === 1)) sem(linea, 'Un pin digital se asigna con \'0\' o \'1\' entre comillas simples: ' + ref.nombre + ' <= \'' + e.v + '\';');
        else if (e.tipo === 'mv') sem(linea, pin.an ? 'Para dar una tensión usa el nombre analógico del pin: ' + pin.an + ' <= ' + texto(e) + '; (' + pin.an + ' = ' + ref.nombre + ').' : ref.nombre + ' no tiene entrada analógica en el ' + MICRO + ' (solo AN0-AN5 = RA0, RA1, RB0-RB3).');
        else sem(linea, ref.nombre + ' es un pin digital: se le asigna \'0\' o \'1\' (aquí el valor es de tipo ' + NOMBRE_TIPO[e.tipo] + ').');
      } else {
        if (e.tipo === 'mv') return;
        if (e.tipo === 'int') sem(linea, 'Faltan las unidades: ' + ref.nombre + ' es una entrada analógica; escribe ' + ref.nombre + ' <= ' + conUnidad(e, 'mv') + '; (en milivoltios, sin decimales).');
        else sem(linea, ref.nombre + ' es una entrada analógica (' + ref.nombre + ' = ' + pin.fisico + '): se le asigna una tensión, por ejemplo ' + ref.nombre + ' <= 3300 mv;');
      }
    }

    function comprobarVar(ref, e, linea) {
      var tv = ref.tipo, te = e.tipo;
      if (!te || !tv) return;
      if (te === tv) return;
      if (te === 'now' && (tv === 'cycle' || tv === 'time')) return;
      if (tv === 'char' && te === 'bit') return;
      if ((tv === 'cycle' || tv === 'time') && te === 'int') { sem(linea, 'Faltan las unidades: «' + ref.nombre + '» es de tipo ' + NOMBRE_TIPO[tv] + '; escribe el valor con su unidad (por ejemplo ' + conUnidad(e, UNIDAD_TIPO[tv]) + ').'); return; }
      if (tv === 'cycle' && te === 'time') { sem(linea, 'No se mezclan unidades: «' + ref.nombre + '» es cycle (ciclos, ic) y «' + texto(e) + '» es time. Pásalo a ciclos (a ' + fmtFcy(fcy) + ', 1 us = ' + fmtDec(fcy / 1e6, 4) + ' ic).'); return; }
      if (tv === 'time' && te === 'cycle') { sem(linea, 'No se mezclan unidades: «' + ref.nombre + '» es time y «' + texto(e) + '» es cycle (ciclos, ic).'); return; }
      sem(linea, 'No coinciden los tipos: «' + ref.nombre + '» es ' + NOMBRE_TIPO[tv] + ' y el valor es ' + NOMBRE_TIPO[te] + '.');
    }

    function si() {
      var t = sig();
      var ramas = [];
      var c = condicion(expr(), 'if');
      pedirKw('then', 'después de la condición del if');
      ramas.push({ c: c, cuerpo: instrucciones(), linea: t.linea });
      var otro = null;
      while (true) {
        var u = peek();
        if (esKw(u, 'elsif')) {
          sig();
          var c2 = condicion(expr(), 'elsif');
          pedirKw('then', 'después de la condición del elsif');
          ramas.push({ c: c2, cuerpo: instrucciones(), linea: u.linea });
        } else if (esKw(u, 'else')) {
          sig();
          if (esKw(peek(), 'if') && peek().linea === u.linea) fallo(peek(), 'En SCL se escribe «elsif»: «else if» abre un if nuevo que necesitaría su propio «end if;».');
          otro = { cuerpo: instrucciones(), linea: u.linea };
          if (esKw(peek(), 'else') || esKw(peek(), 'elsif')) fallo(peek(), 'Después del «else» solo puede venir «end if;».');
        } else break;
      }
      cerrar('if', t.linea);
      return { k: 'if', ramas: ramas, otro: otro, linea: t.linea, lineaFin: ultimo.linea };
    }

    function espera() {
      var t = sig();
      var u = peek();
      if (esOp(u, ';')) { sig(); return { k: 'halt', linea: t.linea }; }
      if (esKw(u, 'for')) { sig(); var d = duracion(expr()); puntoYComa(); return { k: 'waitFor', d: d, linea: t.linea }; }
      if (esKw(u, 'on')) {
        sig();
        var s = senal(false);
        var d2 = null;
        if (esKw(peek(), 'for')) { sig(); d2 = duracion(expr()); }
        puntoYComa();
        return { k: 'waitOn', s: s, d: d2, linea: t.linea };
      }
      if (esKw(u, 'until')) {
        sig();
        var c = condicion(expr(), 'wait until');
        var d3 = null;
        if (esKw(peek(), 'for')) { sig(); d3 = duracion(expr()); }
        puntoYComa();
        if (c.lee && c.lee.pc && c.k === 'cmp' && (c.op === '==' || c.op === '=') && c.r.k === 'lit' && c.r.tipo === 'int' && c.r.v % 2)
          res.avisos.push({ linea: t.linea, msg: 'El PC del dsPIC siempre es par (avanza de 2 en 2): PC == ' + c.r.v + ' no se cumplirá nunca.' });
        return { k: 'waitUntil', c: c, d: d3, linea: t.linea };
      }
      if (u.k === 'num') fallo(u, 'Para esperar un tiempo se escribe «wait for ' + u.raw + ' …;».');
      fallo(u, 'Después de «wait» va «;», «for», «on» o «until»; aparece ' + desc(u) + '.');
    }

    function duracion(e) {
      if (!e.tipo) return e;
      if (e.tipo === 'cycle' || e.tipo === 'time' || e.tipo === 'now') return e;
      if (e.tipo === 'int') sem(e.linea, 'Faltan las unidades del tiempo: «' + texto(e) + '». Escribe por ejemplo ' + conUnidad(e, 'ic') + ', ' + conUnidad(e, 'us') + ' o ' + conUnidad(e, 'ms') + '.');
      else sem(e.linea, 'El tiempo de espera debe ser de tipo time (ps, ns, us, ms, sec) o cycle (ic); «' + texto(e) + '» es ' + NOMBRE_TIPO[e.tipo] + '.');
      return e;
    }

    function condicion(e, que) {
      if (!e.tipo || e.tipo === 'bool') return e;
      if (e.tipo === 'bit') sem(e.linea, 'La condición del ' + que + ' tiene que ser una comparación: escribe «' + texto(e) + " == '1'».");
      else sem(e.linea, 'La condición del ' + que + ' tiene que ser una comparación (==, !=, <, >, <=, >=) y «' + texto(e) + '» es de tipo ' + NOMBRE_TIPO[e.tipo] + '.');
      return e;
    }

    // --- señales y referencias
    function senal(paraAsignar) {
      var t = peek();
      if (t.k !== 'id') fallo(t, 'Se esperaba el nombre de una señal o variable y aparece ' + desc(t) + '.');
      sig();
      var up = t.v.toUpperCase(), low = t.v.toLowerCase();
      if (/^PORT[AB]$/.test(up) && esOp(peek(), '.')) {
        sig();
        var tb = peek();
        if (tb.k !== 'id') fallo(tb, 'Después de ' + up + '. va el nombre de un bit (por ejemplo ' + up + '.R' + up.charAt(4) + '0).');
        sig();
        var b = tb.v.toUpperCase();
        if (!PINES[b] || b.charAt(1) !== up.charAt(4) || b.charAt(0) !== 'R') fallo(tb, '«' + tb.v + '» no es un bit de ' + up + '.');
        return refPin(b, t, tb);
      }
      if (/^PORT[C-Z]$/.test(up) && esOp(peek(), '.') && peek(1).k === 'id') {
        sig(); var tbit = sig();
        noExiste(tbit.v.toUpperCase().charAt(1) === up.charAt(4) ? tbit : t, paraAsignar);
        return { k: 'ref', clase: 'var', nombre: t.v, clave: low, tipo: null, linea: t.linea, ini: t.ini, fin: tbit.fin, lee: {}, malo: true };
      }
      if (PINES[up]) return refPin(up, t, t);
      if (/^PORT[AB]$/.test(up)) { return { k: 'ref', clase: 'port', nombre: up, tipo: 'int', linea: t.linea, ini: t.ini, fin: t.fin, lee: up === 'PORTB' ? { gen: 1 } : {} }; }
      if (up === 'PC') return { k: 'ref', clase: 'pc', nombre: 'PC', tipo: 'int', linea: t.linea, ini: t.ini, fin: t.fin, lee: { pc: 1 } };
      if (vars[low]) { var v = vars[low]; return { k: 'ref', clase: 'var', nombre: v.nombre, clave: low, tipo: v.tipo, linea: t.linea, ini: t.ini, fin: t.fin, lee: {} }; }
      noExiste(t, paraAsignar);
      return { k: 'ref', clase: 'var', nombre: t.v, clave: low, tipo: null, linea: t.linea, ini: t.ini, fin: t.fin, lee: {}, malo: true };
    }

    function refPin(nombre, t0, t1) {
      pinesSet[nombre] = 1;
      return { k: 'ref', clase: 'pin', nombre: nombre, tipo: PINES[nombre].tipo, linea: t0.linea, ini: t0.ini, fin: t1.fin, lee: nombre === 'RB15' ? { gen: 1 } : {} };
    }

    function noExiste(t, paraAsignar) {
      var up = t.v.toUpperCase();
      var m = /^R([A-Z])(\d+)$/.exec(up);
      if (m) {
        if (m[1] === 'A' || m[1] === 'B') sem(t.linea, '«' + t.v + '» no existe: el ' + MICRO + ' tiene RA0-RA4 y RB0-RB15.');
        else sem(t.linea, '«' + t.v + '» no existe en el ' + MICRO + ': solo tiene los puertos A (RA0-RA4) y B (RB0-RB15). Los ejemplos del libro con RD0-RD3 y PORTD vienen de la documentación de SCL de otro micro: usa pines RB.');
        return;
      }
      if (/^PORT[C-Z]$/.test(up)) { sem(t.linea, '«' + t.v + '» no existe en el ' + MICRO + ': solo tiene PORTA y PORTB.'); return; }
      if (/^AN\d+$/.test(up)) { sem(t.linea, '«' + t.v + '» no existe: el ' + MICRO + ' tiene las entradas analógicas AN0-AN5.'); return; }
      if (/^(TRIS|LAT|AD1|T\d?CON|TMR|PR\d|U1|IFS|IEC|SR$|STATUS|ADCON)/.test(up)) { sem(t.linea, 'Este mini-simulador no modela registros como «' + t.v + '»: solo pines (RA, RB, AN), PORTA/PORTB (lectura) y PC.'); return; }
      var mejor = null, dmin = 3;
      Object.keys(vars).forEach(function (k) { var d = distancia(t.v.toLowerCase(), k); if (d < dmin) { dmin = d; mejor = vars[k].nombre; } });
      sem(t.linea, 'La variable «' + t.v + '» no está declarada' + (mejor ? '. ¿Querías decir «' + mejor + '»?' : ' (declárala antes del begin: variable ' + t.v + ' : integer;).'));
    }

    // --- expresiones (cada nodo lleva tipo, línea, posición y qué lee)
    function nodo(k, props, a, b) {
      props.k = k;
      props.ini = a.ini; props.fin = (b || a).fin;
      props.linea = a.linea;
      var lee = {};
      [props.l, props.r, props.e].forEach(function (h) { if (h && h.lee) for (var x in h.lee) lee[x] = 1; });
      if (k === 'now') lee.pc = 1;
      props.lee = lee;
      return props;
    }
    function expr() { return o_(); }
    function o_() {
      var l = y_();
      while (esKw(peek(), 'or')) { sig(); var r = y_(); l = nodo('log', { op: 'or', l: l, r: r, tipo: logTipo(l, r, 'or') }, l, r); }
      return l;
    }
    function y_() {
      var l = no_();
      while (esKw(peek(), 'and')) { sig(); var r = no_(); l = nodo('log', { op: 'and', l: l, r: r, tipo: logTipo(l, r, 'and') }, l, r); }
      return l;
    }
    function logTipo(l, r, op) {
      if (!l.tipo || !r.tipo) return null;
      if (l.tipo === 'bool' && r.tipo === 'bool') return 'bool';
      sem(l.linea, '«' + op + '» une comparaciones (boolean): ' + texto(l) + ' ' + op + ' ' + texto(r) + '.');
      return null;
    }
    function no_() {
      if (esKw(peek(), 'not')) {
        var t = sig();
        var e = no_();
        var tipo = null;
        if (e.tipo === 'bool' || e.tipo === 'bit') tipo = e.tipo;
        else if (e.tipo) sem(t.linea, '«not» se aplica a un bit o a una condición (boolean), no a ' + NOMBRE_TIPO[e.tipo] + '.');
        return nodo('un', { op: 'not', e: e, tipo: tipo }, t, e);
      }
      return cmp_();
    }
    function cmp_() {
      var l = suma_();
      var t = peek();
      if (t.k === 'op' && OPS_CMP.indexOf(t.v) >= 0) {
        sig();
        var r = suma_();
        return nodo('cmp', { op: t.v, l: l, r: r, tipo: cmpTipo(t.v, l, r) }, l, r);
      }
      return l;
    }
    function cmpTipo(op, l, r) {
      var a = l.tipo, b = r.tipo;
      if (!a || !b) return 'bool';
      if (a === 'now') a = b === 'time' ? 'time' : 'cycle';
      if (b === 'now') b = a === 'time' ? 'time' : 'cycle';
      if (a === b) {
        if (!NUMERICO[a] && ['<', '>', '<=', '>='].indexOf(op) >= 0) sem(l.linea, 'Con valores de tipo ' + NOMBRE_TIPO[a] + ' solo se puede comparar con == o !=.');
        return 'bool';
      }
      var ni = a === 'int' ? l : (b === 'int' ? r : null), nu = a === 'int' ? r : l;
      var tu = a === 'int' ? b : a;
      if (ni && UNIDAD_TIPO[tu]) {
        if (ni.k === 'lit' || (ni.k === 'par' && /\d/.test(texto(ni)))) sem(l.linea, 'Faltan las unidades: comparas «' + texto(nu) + '» (' + NOMBRE_TIPO[tu] + ') con «' + texto(ni) + '», que no tiene unidades. Escribe «' + conUnidad(ni, UNIDAD_TIPO[tu]) + '» (libro 22.3.5 b).');
        else sem(l.linea, 'No se mezclan tipos: «' + texto(nu) + '» es ' + NOMBRE_TIPO[tu] + ' y «' + texto(ni) + '» es integer.');
        return 'bool';
      }
      if ((a === 'cycle' && b === 'time') || (a === 'time' && b === 'cycle')) {
        var tt = a === 'time' ? l : r, tc = a === 'time' ? r : l;
        var sugerencia = '';
        if (tt.k === 'lit') sugerencia = ' A ' + fmtFcy(fcy) + ', ' + texto(tt) + ' son ' + fmtDec(tt.v * fcy / 1e12, 3) + ' ic.';
        sem(l.linea, 'No se mezclan unidades: «' + texto(tc) + '» es cycle (ciclos, ic) y «' + texto(tt) + '» es time.' + sugerencia);
        return 'bool';
      }
      if ((a === 'bit' && b === 'int') || (a === 'int' && b === 'bit')) {
        var nb = a === 'int' ? l : r;
        sem(l.linea, 'Los pines digitales se comparan con \'0\' o \'1\' entre comillas simples (no con ' + texto(nb) + ').');
        return 'bool';
      }
      if ((a === 'bit' && b === 'char') || (a === 'char' && b === 'bit')) return 'bool';
      sem(l.linea, 'No se pueden comparar «' + texto(l) + '» (' + NOMBRE_TIPO[a] + ') y «' + texto(r) + '» (' + NOMBRE_TIPO[b] + ').');
      return 'bool';
    }
    function suma_() {
      var l = mult_();
      while (esOp(peek(), '+') || esOp(peek(), '-')) {
        var t = sig();
        var r = mult_();
        l = nodo('bin', { op: t.v, l: l, r: r, tipo: aritTipo(t.v, l, r) }, l, r);
      }
      return l;
    }
    function mult_() {
      var l = unario_();
      while (esOp(peek(), '*') || esOp(peek(), '/')) {
        var t = sig();
        var r = unario_();
        l = nodo('bin', { op: t.v, l: l, r: r, tipo: aritTipo(t.v, l, r) }, l, r);
      }
      return l;
    }
    function aritTipo(op, l, r) {
      var a = l.tipo, b = r.tipo;
      if (!a || !b) return null;
      if (a === 'now' && b === 'now') return 'cycle';
      if (a === 'now') a = b === 'time' ? 'time' : 'cycle';
      if (b === 'now') b = a === 'time' ? 'time' : 'cycle';
      if (!NUMERICO[a] || !NUMERICO[b]) { sem(l.linea, 'No se puede operar con «' + op + '» entre ' + NOMBRE_TIPO[a] + ' y ' + NOMBRE_TIPO[b] + ' (en SCL no se construyen cadenas).'); return null; }
      if (op === '+' || op === '-') {
        if (a === b) return a;
        if (a === 'int' || b === 'int') {
          var ni = a === 'int' ? l : r, tu = a === 'int' ? b : a;
          sem(l.linea, 'No se mezclan unidades: «' + texto(ni) + '» no lleva unidades y se ' + (op === '+' ? 'suma' : 'resta') + ' con un valor de tipo ' + NOMBRE_TIPO[tu] + '. Escribe «' + conUnidad(ni, UNIDAD_TIPO[tu]) + '» (libro 22.3.5 e).');
          return tu;
        }
        sem(l.linea, 'No se mezclan unidades: «' + texto(l) + '» es ' + NOMBRE_TIPO[a] + ' y «' + texto(r) + '» es ' + NOMBRE_TIPO[b] + '.');
        return a;
      }
      if (op === '*') {
        if (a === 'int') return b;
        if (b === 'int') return a;
        sem(l.linea, 'No se pueden multiplicar dos magnitudes con unidades (' + NOMBRE_TIPO[a] + ' × ' + NOMBRE_TIPO[b] + ').');
        return a;
      }
      if (b === 'int') return a;
      if (a === b) return 'int';
      sem(l.linea, 'No se puede dividir ' + NOMBRE_TIPO[a] + ' entre ' + NOMBRE_TIPO[b] + '.');
      return null;
    }
    function unario_() {
      if (esOp(peek(), '-')) {
        var t = sig();
        var e = unario_();
        if (e.tipo && !NUMERICO[e.tipo] && e.tipo !== 'now') sem(t.linea, 'El signo «−» solo se aplica a números.');
        return nodo('un', { op: '-', e: e, tipo: e.tipo === 'now' ? 'cycle' : e.tipo }, t, e);
      }
      if (esKw(peek(), 'not')) return no_();
      return primario();
    }
    function unidadTras(tNum) {
      var u = peek();
      if (u.k !== 'id' || u.linea !== tNum.linea) return null;
      var low = u.v.toLowerCase();
      if (UNIDADES[low]) { sig(); return { u: low, tok: u }; }
      if (ES_PALABRA[low]) return null;
      if (vars[low] || PINES[u.v.toUpperCase()]) return null;
      if (/^(s|seg|segundos?)$/.test(low)) fallo(u, 'La unidad de segundos en SCL es «sec» (escribe ' + tNum.raw + ' sec).');
      if (/^(hz|khz|mhz)$/.test(low)) fallo(u, 'Las frecuencias (' + u.v + ') no se admiten en este mini-simulador.');
      fallo(u, 'Unidad desconocida «' + u.v + '». Unidades de SCL: ps, ns, us, ms, sec, min, hr (time), ic (cycle) y mv (tensión).');
    }
    function primario() {
      var t = peek();
      if (t.k === 'num') {
        sig();
        var un = unidadTras(t);
        var tFin = un ? un.tok : t;
        if (t.dec) {
          var val = t.v, uu = un ? un.u : null, sug = '';
          while (uu && UNIDAD_MENOR[uu] && Math.abs(val - Math.round(val)) > 1e-9) { val = val * UNIDAD_MENOR[uu][1]; uu = UNIDAD_MENOR[uu][0]; }
          val = Math.round(val * 1e6) / 1e6;
          if (uu && un && uu !== un.u && val === Math.round(val)) sug = ' Pasa a una unidad menor: «' + val + ' ' + uu + '».';
          else if (un && un.u === 'ic') sug = ' Los ciclos de instrucción son siempre enteros.';
          else if (!un) sug = ' Usa números enteros.';
          sem(t.linea, 'SCL no admite decimales: «' + src.slice(t.ini, tFin.fin) + '».' + sug + (t.sep === ',' ? ' (Y el separador decimal tampoco sería la coma.)' : '') + ' (libro 22.3.5 d)');
          if (uu && un) return nodo('lit', { tipo: UNIDADES[un.u].tipo, v: Math.round(t.v * UNIDADES[un.u].f) }, t, tFin);
          return nodo('lit', { tipo: 'int', v: Math.round(t.v) }, t, tFin);
        }
        if (un) return nodo('lit', { tipo: UNIDADES[un.u].tipo, v: t.v * UNIDADES[un.u].f, unidad: un.u }, t, tFin);
        return nodo('lit', { tipo: 'int', v: t.v }, t, t);
      }
      if (t.k === 'str') { sig(); return nodo('lit', { tipo: 'str', v: t.v }, t); }
      if (t.k === 'chr') {
        sig();
        var cont = t.v;
        if (cont.length !== 1 && /^\s*[01]\s*$/.test(cont)) sem(t.linea, "El bit «'" + cont + "'» lleva espacios dentro de las comillas: escribe '" + cont.trim() + "'.");
        var tr = cont.trim();
        if (tr === '0' || tr === '1') return nodo('lit', { tipo: 'bit', v: tr }, t);
        if (cont.length !== 1) sem(t.linea, 'Entre comillas simples va un solo carácter (para textos usa comillas dobles).');
        return nodo('lit', { tipo: 'char', v: cont.charAt(0) }, t);
      }
      if (esKw(t, 'true') || esKw(t, 'false')) { sig(); return nodo('lit', { tipo: 'bool', v: esKw(t, 'true') }, t); }
      if (esKw(t, 'now')) {
        sig();
        if (!esOp(peek(), '(')) fallo(peek(), 'now se escribe con paréntesis: now()');
        sig();
        var tc = pedirOp(')', 'en now()');
        return nodo('now', { tipo: 'now' }, t, tc);
      }
      if (esOp(t, '(')) {
        sig();
        var e = expr();
        var tcp = pedirOp(')', 'para cerrar el paréntesis');
        var u = peek();
        if (u.k === 'id' && u.linea === tcp.linea && UNIDADES[u.v.toLowerCase()]) {
          sig();
          var dentro = src.slice(t.fin, tcp.ini);
          var bien = '(' + dentro.replace(/(^|[^\w.])(\d+)(?![\w.])/g, '$1$2 ' + u.v) + ')';
          sem(t.linea, 'Unidades mal puestas: «' + src.slice(t.ini, u.fin) + '». En SCL cada número lleva su unidad y no se mezclan números sin unidades con valores con unidades: escribe «' + bien + '» (libro 22.3.5 e).');
          var ut = UNIDADES[u.v.toLowerCase()];
          var res2 = nodo('par', { e: e, tipo: e.tipo === 'int' ? ut.tipo : e.tipo, mult: e.tipo === 'int' ? ut.f : 1 }, t, u);
          return res2;
        }
        return nodo('par', { e: e, tipo: e.tipo, mult: 1 }, t, tcp);
      }
      if (t.k === 'id') {
        var low = t.v.toLowerCase();
        if (UNIDADES[low] && !vars[low]) fallo(t, 'La unidad «' + t.v + '» necesita un número delante (por ejemplo 10 ' + t.v + ').');
        if (ES_PALABRA[low]) fallo(t, 'Se esperaba un valor y aparece la palabra reservada «' + t.v + '».');
        return senal(false);
      }
      if (t.k === 'eof') fallo(t, 'El fichero se acaba en mitad de una expresión.');
      fallo(t, 'Se esperaba un valor y aparece ' + desc(t) + '.');
    }

    // --- compilación a una lista de operaciones con saltos
    function compilar(cuerpo) {
      var ops = [];
      var pilaLoops = [];
      function emitir(o) { ops.push(o); return ops.length - 1; }
      function bloque(lista) { lista.forEach(instr); }
      function instr(s) {
        switch (s.k) {
          case 'sig': emitir({ op: 'sig', ref: s.ref, e: s.e, linea: s.linea }); break;
          case 'var': emitir({ op: 'var', ref: s.ref, e: s.e, linea: s.linea }); break;
          case 'report': emitir({ op: 'report', e: s.e, linea: s.linea }); break;
          case 'halt': emitir({ op: 'halt', linea: s.linea }); break;
          case 'waitFor': emitir({ op: 'waitFor', d: s.d, linea: s.linea }); break;
          case 'waitOn': emitir({ op: 'waitOn', s: s.s, d: s.d, linea: s.linea }); break;
          case 'waitUntil': emitir({ op: 'waitUntil', c: s.c, d: s.d, linea: s.linea }); break;
          case 'null': emitir({ op: 'nop', linea: s.linea }); break;
          case 'if':
            var saltosFin = [];
            s.ramas.forEach(function (r, i) {
              var j = emitir({ op: 'jf', c: r.c, linea: r.linea, que: i === 0 ? 'if' : 'elsif' });
              bloque(r.cuerpo);
              saltosFin.push(emitir({ op: 'jmp', linea: s.lineaFin, que: 'finif' }));
              ops[j].a = ops.length;
            });
            if (s.otro) { emitir({ op: 'nop', linea: s.otro.linea, que: 'else' }); bloque(s.otro.cuerpo); }
            var fin = emitir({ op: 'nop', linea: s.lineaFin, que: 'endif' });
            saltosFin.forEach(function (k) { ops[k].a = fin; });
            break;
          case 'loop':
            var ini = ops.length;
            pilaLoops.push([]);
            emitir({ op: 'nop', linea: s.linea, que: 'loop' });
            bloque(s.cuerpo);
            emitir({ op: 'jmp', a: ini, linea: s.lineaFin, que: 'endloop', lineaIni: s.linea });
            pilaLoops.pop().forEach(function (k) { ops[k].a = ops.length; });
            break;
          case 'while':
            var iw = ops.length;
            pilaLoops.push([]);
            var jw = emitir({ op: 'jf', c: s.c, linea: s.linea, que: 'while' });
            bloque(s.cuerpo);
            emitir({ op: 'jmp', a: iw, linea: s.lineaFin, que: 'endloop', lineaIni: s.linea });
            ops[jw].a = ops.length;
            pilaLoops.pop().forEach(function (k) { ops[k].a = ops.length; });
            break;
          case 'exit':
            var ke = emitir(s.c ? { op: 'jt', c: s.c, linea: s.linea, que: 'exit' } : { op: 'jmp', linea: s.linea, que: 'exit' });
            pilaLoops[pilaLoops.length - 1].push(ke);
            break;
        }
      }
      bloque(cuerpo);
      emitir({ op: 'fin', linea: lineaEndProcess() });
      return ops;
    }
    function lineaEndProcess() {
      for (var k = toks.length - 1; k > 0; k--) if (esKw(toks[k], 'process') && esKw(toks[k - 1], 'end')) return toks[k].linea;
      return 1;
    }
  }

  // ------------------------------------------------------------ simulación
  function Sim(prog, o) {
    this.prog = prog;
    this.fcy = o.fcy || 40000000;
    this.alto = o.altoUs; this.bajo = o.bajoUs;
    this.fase = o.empiezaAlto ? this.bajo + this.alto / 2 : 0;
    this.fc = this.fcy / 1e6;   // ciclos por µs
    this.periodo = (this.alto + this.bajo) * this.fc;
    this.limiteCiclos = LIMITE_SEG * this.fcy;
    this.reiniciar();
  }
  var SP = Sim.prototype;
  SP.reiniciar = function () {
    var self = this;
    this.t = 0; this.ip = 0; this.pasos = 0; this.sinAvance = 0; this.vueltas = 0;
    this.vars = {};
    (this.prog.vars || []).forEach(function (v) { self.vars[v.clave] = { v: inicial(v.tipo), asignada: false }; });
    this.pines = {};
    Object.keys(PINES).forEach(function (p) { self.pines[p] = PINES[p].tipo === 'mv' ? 0 : '0'; });
    this.hist = {};
    this.salida = [];
    this.nReports = 0;
    this.fin = null; this.ultimo = null;
  };
  function inicial(tipo) { return tipo === 'str' ? '' : tipo === 'bool' ? false : tipo === 'bit' ? '0' : tipo === 'char' ? ' ' : 0; }

  // Generador: flancos de la onda base (bajo [0,bajo), alto [bajo, P)) desplazada «fase» µs.
  SP.flancoBase = function (j) { var k = Math.floor(j / 2); return j % 2 === 0 ? k * (this.alto + this.bajo) + this.bajo : (k + 1) * (this.alto + this.bajo); };
  SP.j0 = function () {
    if (this._j0 != null) return this._j0;
    var j = 0; while (this.flancoBase(j) - this.fase <= 0) j++;
    this._j0 = j; return j;
  };
  SP.flanco = function (n) { return Math.round((this.flancoBase(this.j0() + n) - this.fase) * this.fc); };
  SP.flancoSube = function (n) { return (this.j0() + n) % 2 === 0; };
  SP.nivelInicial = function () { var x = this.fase % (this.alto + this.bajo); return x >= this.bajo ? '1' : '0'; };
  SP.indiceTras = function (t) {      // primer flanco con instante > t
    var n = Math.max(0, Math.floor(2 * t / this.periodo) - 3);
    while (n > 0 && this.flanco(n) > t) n -= 2;
    if (n < 0) n = 0;
    while (this.flanco(n) <= t) n++;
    return n;
  };
  SP.nivelRB15 = function (t) {
    var n = this.indiceTras(t);
    if (n === 0) return this.nivelInicial();
    return this.flancoSube(n - 1) ? '1' : '0';
  };
  SP.siguienteFlanco = function (t) { return this.flanco(this.indiceTras(t)); };

  SP.cycAps = function (c) { return Math.round(c * 1e12 / this.fcy); };
  SP.psAcyc = function (ps) { return Math.round(ps * this.fcy / 1e12); };

  SP.leer = function (ref) {
    if (ref.clase === 'var') return this.vars[ref.clave].v;
    if (ref.clase === 'pc') return 2 * this.t;
    if (ref.clase === 'port') {
      var v = 0, pref = ref.nombre === 'PORTA' ? 'RA' : 'RB', n = pref === 'RA' ? 5 : 16;
      for (var i = 0; i < n; i++) if (this.leerPin(pref + i) === '1') v |= (1 << i);
      return v;
    }
    return this.leerPin(ref.nombre);
  };
  SP.leerPin = function (p) { return p === 'RB15' ? this.nivelRB15(this.t) : this.pines[p]; };

  SP.eval = function (e) {
    var a, b;
    switch (e.k) {
      case 'lit': return { tipo: e.tipo, v: e.v };
      case 'ref': return { tipo: e.tipo, v: this.leer(e) };
      case 'now': return { tipo: 'now', v: this.t };
      case 'par':
        a = this.eval(e.e);
        return e.mult !== 1 ? { tipo: e.tipo, v: a.v * e.mult } : a;
      case 'un':
        a = this.eval(e.e);
        if (e.op === '-') return { tipo: a.tipo === 'now' ? 'cycle' : a.tipo, v: -a.v };
        if (a.tipo === 'bit') return { tipo: 'bit', v: a.v === '1' ? '0' : '1' };
        return { tipo: 'bool', v: !a.v };
      case 'log':
        a = this.eval(e.l);
        if (e.op === 'and' && !a.v) return { tipo: 'bool', v: false };
        if (e.op === 'or' && a.v) return { tipo: 'bool', v: true };
        return { tipo: 'bool', v: !!this.eval(e.r).v };
      case 'bin':
        a = this.eval(e.l); b = this.eval(e.r);
        this.alinear(a, b);
        var v;
        if (e.op === '+') v = a.v + b.v;
        else if (e.op === '-') v = a.v - b.v;
        else if (e.op === '*') v = a.v * b.v;
        else v = b.v === 0 ? 0 : (a.v / b.v < 0 ? Math.ceil(a.v / b.v) : Math.floor(a.v / b.v));
        if (e.op === '/' && b.v === 0) this.avisoDiv = true;
        return { tipo: e.tipo || a.tipo, v: v };
      case 'cmp':
        a = this.eval(e.l); b = this.eval(e.r);
        this.alinear(a, b);
        var x = a.v, y = b.v, r;
        switch (e.op) {
          case '==': case '=': r = x === y; break;
          case '!=': case '/=': r = x !== y; break;
          case '<': r = x < y; break;
          case '>': r = x > y; break;
          case '<=': r = x <= y; break;
          default: r = x >= y;
        }
        return { tipo: 'bool', v: r };
    }
    return { tipo: null, v: 0 };
  };
  SP.alinear = function (a, b) {
    if (a.tipo === 'now') { if (b.tipo === 'time') { a.tipo = 'time'; a.v = this.cycAps(a.v); } else a.tipo = 'cycle'; }
    if (b.tipo === 'now') { if (a.tipo === 'time') { b.tipo = 'time'; b.v = this.cycAps(b.v); } else b.tipo = 'cycle'; }
  };
  SP.ciclos = function (e) {
    var d = this.eval(e);
    if (d.tipo === 'time') return this.psAcyc(d.v);
    return Math.round(d.v);
  };
  SP.tTxt = function (t) { return fmtEnt(t) + NBSP + 'ic (' + fmtUs(t / this.fc) + ')'; };
  SP.durTxt = function (c) { return fmtEnt(c) + NBSP + 'ic = ' + fmtUs(c / this.fc); };

  SP.fmtValor = function (tipo, v) {
    switch (tipo) {
      case 'cycle': return fmtEnt(v) + NBSP + 'ic';
      case 'time': return fmtPs(v);
      case 'mv': return fmtEnt(v) + NBSP + 'mV';
      case 'str': return '"' + v + '"';
      case 'bool': return v ? 'true' : 'false';
      case 'bit': case 'char': return "'" + v + "'";
      default: return fmtEnt(v);
    }
  };

  SP.anotarPin = function (p, v) {
    var h = this.hist[p] || (this.hist[p] = []);
    if (h.length && h[h.length - 1].t === this.t) h[h.length - 1].v = v;
    else if (h.length < 5000) h.push({ t: this.t, v: v });
  };

  // Espera hasta que se cumpla «cond» o cambie «senal», con plazo opcional (ciclos).
  SP.esperar = function (cond, senal, plazo) {
    var t0 = this.t, lim = plazo == null ? Infinity : t0 + Math.max(0, plazo);
    var lee = cond ? cond.lee : senal.lee;
    var ini = senal ? this.leer(senal) : null;
    if (cond && this.eval(cond).v) return { ok: true, inmediato: true };
    var tc = t0, iter = 0;
    while (true) {
      var nx = Infinity;
      if (lee.gen) nx = Math.min(nx, this.siguienteFlanco(tc));
      if (lee.pc) nx = Math.min(nx, tc + 1);
      if (nx > lim || nx > this.limiteCiclos) break;
      tc = nx; this.t = tc;
      if (cond ? this.eval(cond).v : this.leer(senal) !== ini) return { ok: true };
      if (++iter > LIMITE_ITER_ESPERA) return { ok: false, iter: true };
    }
    if (lim !== Infinity && lim <= this.limiteCiclos) { this.t = lim; return { ok: false, plazo: true }; }
    if (lim !== Infinity || lee.gen || lee.pc) { this.t = Math.max(this.t, Math.min(lim, this.limiteCiclos)); return { ok: false, limite: true }; }
    return { ok: false, nunca: true };
  };

  // Ejecuta una operación. Devuelve false si la simulación ya había terminado.
  SP.paso = function () {
    if (this.fin) return false;
    var op = this.prog.ops[this.ip];
    var t0 = this.t, d = '', cambio = null, r, c;
    this.avisoDiv = false;
    switch (op.op) {
      case 'sig':
        var val = this.eval(op.e).v, p = op.ref.nombre, antes = this.pines[p];
        this.pines[p] = val; this.anotarPin(p, val);
        d = p + ' <= ' + this.fmtValor(PINES[p].tipo, val) + (antes === val ? ' (ya valía eso)' : ' (antes ' + this.fmtValor(PINES[p].tipo, antes) + ')') + '.';
        cambio = 'pin:' + p;
        this.ip++;
        break;
      case 'var':
        var rv = this.eval(op.e), v = op.ref, vv = rv.v;
        if (v.tipo === 'time' && (rv.tipo === 'now' || rv.tipo === 'cycle')) vv = this.cycAps(vv);
        this.vars[v.clave].v = vv; this.vars[v.clave].asignada = true;
        d = v.nombre + ' := ' + this.fmtValor(v.tipo, vv) + (op.e.k === 'now' ? ' (el instante actual)' : '') + '.';
        cambio = 'var:' + v.clave;
        this.ip++;
        break;
      case 'report':
        var txt = this.eval(op.e).v;
        this.nReports++;
        this.salida.push({ t: this.t, txt: String(txt), tipo: 'report', n: this.nReports, linea: op.linea });
        d = 'report: aparece «' + txt + '» en Output · Simulator.';
        this.ip++;
        if (this.nReports >= LIMITE_REPORTS) this.terminar('limite', 'Se ha parado tras ' + LIMITE_REPORTS + ' report.');
        break;
      case 'halt':
        d = 'wait; termina el process: ya no ejecuta nada más.';
        this.terminar('wait', 'wait; en la línea ' + op.linea + ': el process termina en t = ' + this.tTxt(this.t) + '.');
        break;
      case 'waitFor':
        c = this.ciclos(op.d);
        if (c < 0) c = 0;
        this.t += c;
        d = 'Espera ' + this.durTxt(c) + '.';
        this.ip++;
        break;
      case 'waitOn':
        r = this.esperar(null, op.s, op.d ? this.ciclos(op.d) : null);
        d = this.textoEspera(r, op, t0, 'cambia ' + op.s.nombre);
        if (!r.nunca && !r.iter && !r.limite) this.ip++;
        break;
      case 'waitUntil':
        r = this.esperar(op.c, null, op.d ? this.ciclos(op.d) : null);
        d = this.textoEspera(r, op, t0, 'se cumple la condición');
        if (op.c.lee.pc && !this.avisoPC) {
          this.avisoPC = true;
          this.salida.push({ t: this.t, txt: 'Aproximación: aquí no hay CPU; se toma PC = 2 × ciclos (programa en línea recta, una instrucción por ciclo). En MPLAB X la condición se cumple cuando la CPU llega de verdad a esa dirección.', tipo: 'aviso' });
        }
        if (!r.nunca && !r.iter && !r.limite) this.ip++;
        break;
      case 'jf':
        c = this.eval(op.c).v;
        if (op.que === 'while') d = 'while: la condición es ' + (c ? 'verdadera → ejecuta el cuerpo.' : 'falsa → sale del bucle.');
        else d = op.que + ': la condición es ' + (c ? 'verdadera → ejecuta su rama.' : 'falsa → pasa a la siguiente rama.');
        this.ip = c ? this.ip + 1 : op.a;
        break;
      case 'jt':
        c = this.eval(op.c).v;
        d = 'exit when: la condición es ' + (c ? 'verdadera → sale del loop.' : 'falsa → sigue dentro del loop.');
        this.ip = c ? op.a : this.ip + 1;
        break;
      case 'jmp':
        if (op.que === 'endloop') d = 'end loop: vuelve al principio del bucle (línea ' + op.lineaIni + ').';
        else if (op.que === 'exit') d = 'exit: sale del loop.';
        else d = 'Fin de la rama: salta a «end if».';
        this.ip = op.a;
        break;
      case 'nop':
        d = op.que === 'loop' ? 'loop: empieza una vuelta del bucle.' : op.que === 'else' ? 'else: ninguna condición anterior se cumple.' : op.que === 'endif' ? 'end if.' : 'null: no hace nada.';
        this.ip++;
        break;
      case 'fin':
        this.vueltas++;
        d = 'end process sin «wait;»: el process vuelve a empezar desde su begin (como en VHDL).';
        this.salida.push({ t: this.t, txt: 'end process: el process vuelve a empezar (vuelta ' + (this.vueltas + 1) + ').', tipo: 'sis' });
        this.ip = 0;
        break;
    }
    if (this.avisoDiv) d += ' (División entre 0: se toma 0.)';
    this.pasos++;
    this.ultimo = { linea: op.linea, desc: d, cambio: cambio, t0: t0, t: this.t };
    if (this.t === t0) this.sinAvance++; else this.sinAvance = 0;
    if (!this.fin && this.t > this.limiteCiclos) this.terminar('limite', 'Se ha parado al llegar a ' + LIMITE_SEG + ' s de tiempo simulado.');
    if (!this.fin && this.sinAvance >= LIMITE_SIN_AVANCE) this.terminar('bucle0', 'Se ha parado: ' + fmtEnt(LIMITE_SIN_AVANCE) + ' pasos seguidos sin que avance el tiempo. Hay un bucle sin ningún wait (como «loop AN1 <= 3500 mv; end loop;» del libro): en MPLAB X la simulación se quedaría colgada.');
    return true;
  };
  SP.textoEspera = function (r, op, t0, que) {
    var dur = this.t - t0;
    if (r.inmediato) return 'La condición ya se cumplía: no espera (t = ' + this.tTxt(this.t) + ').';
    if (r.ok) return 'Espera ' + this.durTxt(dur) + ' hasta que ' + que + ' en t = ' + this.tTxt(this.t) + '.';
    if (r.plazo) return 'Pasa el plazo de ' + this.durTxt(dur) + ' sin que ' + que + '; sigue en t = ' + this.tTxt(this.t) + '.';
    if (r.nunca) {
      this.terminar('bloqueado', 'El process se queda esperando para siempre en la línea ' + op.linea + ': lo que espera depende solo de pines o variables que nadie cambia (aquí solo el micro mueve RB15).');
      return 'Nada puede hacer que ' + que + ': espera indefinida.';
    }
    this.terminar('limite', r.iter ? 'Se ha parado: la condición de la línea ' + op.linea + ' no se cumple en ' + fmtEnt(LIMITE_ITER_ESPERA) + ' ciclos.' : 'Se ha parado al llegar a ' + LIMITE_SEG + ' s de tiempo simulado esperando en la línea ' + op.linea + '.');
    return 'La espera no termina dentro del límite.';
  };
  SP.terminar = function (tipo, msg) {
    this.fin = { tipo: tipo, msg: msg };
    this.salida.push({ t: this.t, txt: msg, tipo: tipo === 'wait' ? 'sis' : 'aviso' });
  };
  SP.ejecutarTodo = function () {
    var n = 0;
    while (!this.fin && n < LIMITE_PASOS) { this.paso(); n++; }
    if (!this.fin && n >= LIMITE_PASOS) return { limite: true };
    return { limite: false };
  };
  SP.siguienteLinea = function () { return this.fin ? null : this.prog.ops[this.ip].linea; };

  // ------------------------------------------------------------ ejemplos
  var CAB = 'configuration for "dsPIC33FJ32MC202" is\nend configuration;\ntestbench for "dsPIC33FJ32MC202" is\nbegin\n';
  var EJEMPLOS = {
    'medir-pulso': {
      titulo: 'Medir un pulso con now()',
      intro: 'Ejemplo de <code>now()</code> del libro (22.3.3.6), completado para 40 MHz: espera a que RB15 esté a 0 (para no medir un pulso a medias), guarda el instante del flanco de subida y el de bajada en variables <code>cycle</code> y los resta. Ejecútalo <b>paso a paso</b> y mira cómo avanza el tiempo en cada <code>wait</code>; el ancho queda en <code>ancho_pulso</code> (panel Variables), porque <code>report</code> no puede mostrar números.',
      codigo: CAB +
        '    process is\n' +
        '        variable t_ini : cycle;        -- Tiempo inicial del pulso\n' +
        '        variable t_fin : cycle;        -- Tiempo final del pulso\n' +
        '        variable ancho_pulso : cycle;\n' +
        '    begin\n' +
        '        report("Comienza la simulacion");\n' +
        "        wait until RB15 == '0';        -- Medimos el pulso de salida\n" +
        "        wait until RB15 == '1';\n" +
        '        t_ini := now();                -- El tiempo se mide en ciclos\n' +
        "        wait until RB15 == '0';\n" +
        '        t_fin := now();\n' +
        '        ancho_pulso := (t_fin - t_ini); -- Ancho en ciclos. Reloj a 40 MHz\n' +
        '        -- El ancho del pulso ha de ser de 125 us,\n' +
        '        -- que a 40 MHz son 125 us * 40 MHz = 5000 ciclos\n' +
        '        if ancho_pulso == 5000 ic then\n' +
        '            report("Ancho correcto: 5000 ic");\n' +
        '        else\n' +
        '            report("El ancho no es 5000 ic: mira ancho_pulso en Variables");\n' +
        '        end if;\n' +
        '        wait;\n' +
        '    end process;\n' +
        'end testbench;\n',
      errores: [
        { nombre: 'Comparación sin unidades (22.3.5 b)', de: 'if ancho_pulso == 5000 ic then', a: 'if ancho_pulso == 5000 then' },
        { nombre: 'Unidades a un paréntesis (22.3.5 e)', de: 'if ancho_pulso == 5000 ic then', a: 'if ancho_pulso == (4990 + 10) ic then' },
        { nombre: 'Decimales (22.3.5 d)', de: 'report("Comienza la simulacion");', a: 'AN5 <= 3.3 v;' },
        { nombre: 'Falta un «;» (22.3.5 c)', de: 't_ini := now();', a: 't_ini := now()' },
        { nombre: 'Pin de otro micro (RD0)', de: "wait until RB15 == '0';        -- Medimos", a: "wait until RD0 == '0';         -- Medimos" },
        { nombre: '«=» en vez de «:=»', de: 't_fin := now();', a: 't_fin = now();' }
      ]
    },
    'ventana-dc': {
      titulo: 'Comprobar el ancho con if / elsif / else',
      intro: 'El <code>if … elsif … else</code> del libro (22.3.3.3) comprueba que el ancho del pulso <code>dc</code> (en ciclos) está entre 4990 ic y 5010 ic: a 40 MHz, 125 µs ± 250 ns. Cambia el tiempo alto del pulso (por ejemplo a 124 µs o a 126 µs) o FCY y vuelve a ejecutar para ver cada rama.',
      nota: 'Las dos condiciones comparan la misma variable, <code>dc</code> (prueba el error «cd» de la lista de abajo para ver qué pasa si una rama usa una variable sin declarar). El ejemplo está adaptado al pulso de RB15.',
      codigo: CAB +
        '    process is\n' +
        '        variable t_ini : cycle;\n' +
        '        variable t_fin : cycle;\n' +
        '        variable dc : cycle;\n' +
        '    begin\n' +
        '        report("Comienza la medida del pulso en RB15");\n' +
        "        wait until RB15 == '0';\n" +
        "        wait until RB15 == '1';\n" +
        '        t_ini := now();\n' +
        "        wait until RB15 == '0';\n" +
        '        t_fin := now();\n' +
        '        dc := (t_fin - t_ini);       -- 125 us a 40 MHz = 5000 ic\n' +
        '        if dc < 4990 ic then\n' +
        '            report("dc erróneo. Demasiado pequeño.");\n' +
        '        elsif dc > 5010 ic then\n' +
        '            report("dc erróneo. Demasiado grande.");\n' +
        '        else\n' +
        '            report("dc OK");\n' +
        '        end if;\n' +
        '        wait;\n' +
        '    end process;\n' +
        'end testbench;\n',
      errores: [
        { nombre: '«cd» como en el libro', de: 'elsif dc > 5010 ic then', a: 'elsif cd > 5010 ic then' },
        { nombre: 'Comparación sin unidades (22.3.5 b)', de: 'if dc < 4990 ic then', a: 'if dc < 4990 then' },
        { nombre: 'Unidades a un paréntesis (22.3.5 e)', de: 'elsif dc > 5010 ic then', a: 'elsif dc > (5000 + 10) ic then' },
        { nombre: 'Decimales (22.3.5 d)', de: 'report("Comienza la medida del pulso en RB15");', a: 'AN5 <= 3.3 v;' },
        { nombre: 'Falta un «;» (22.3.5 c)', de: '        end if;\n', a: '        end if\n' },
        { nombre: 'cycle comparado con time', de: 'if dc < 4990 ic then', a: 'if dc < 125 us then' },
        { nombre: '«else if» en vez de «elsif»', de: 'elsif dc > 5010 ic then', a: 'else if dc > 5010 ic then' }
      ]
    }
  };

  // ------------------------------------------------------------ componente
  MPI.componentes['mini-scl'] = function (el, cfg) {
    cfg = cfg || {};
    var uid = 'msc' + (++ID);
    var claveEj = EJEMPLOS[cfg.ejemplo] ? cfg.ejemplo : 'medir-pulso';
    var ej = EJEMPLOS[claveEj];
    var fcy = Number(cfg.fcy) === 39613750 ? 39613750 : 40000000;
    el.classList.add('mpi-mini-scl');

    var opcErr = ej.errores.map(function (x, i) { return '<option value="' + i + '">' + esc(x.nombre) + '</option>'; }).join('');
    el.innerHTML =
      '<div class="mpi-sim-cab"><span>Mini-simulador SCL</span><span class="msc-cab-sub">estímulos del simulador de MPLAB X · ' + esc(ej.titulo) + '</span></div>' +
      '<p class="msc-intro">' + ej.intro + '</p>' +
      (ej.nota ? '<p class="msc-nota">' + ej.nota + '</p>' : '') +
      '<fieldset class="msc-micro">' +
        '<legend>El «micro»: el programa saca por RB15 (LED D6) un tren de pulsos</legend>' +
        '<div class="msc-micro-fila">' +
          '<label>Alto <input type="number" class="msc-in-alto" min="1" max="100000" step="1" value="125" inputmode="numeric"> µs</label>' +
          '<span class="msc-eq msc-eq-alto"></span>' +
          '<label>Bajo <input type="number" class="msc-in-bajo" min="1" max="100000" step="1" value="500" inputmode="numeric"> µs</label>' +
          '<span class="msc-eq msc-eq-bajo"></span>' +
        '</div>' +
        '<div class="msc-micro-fila">' +
          '<label>FCY del simulador <select class="msc-in-fcy">' +
            '<option value="40000000"' + (fcy === 40000000 ? ' selected' : '') + '>40 MHz (aproximado)</option>' +
            '<option value="39613750"' + (fcy === 39613750 ? ' selected' : '') + '>39 613 750 Hz (exacto)</option>' +
          '</select></label>' +
          '<label>RB15 al empezar <select class="msc-in-ini">' +
            '<option value="1" selected>a 1, a mitad de un pulso</option>' +
            '<option value="0">a 0, justo antes de un pulso</option>' +
          '</select></label>' +
        '</div>' +
      '</fieldset>' +
      '<div class="msc-ed-cab">' +
        '<label for="' + uid + '-ta" class="msc-lbl">Fichero <code>.scl</code> <span class="msc-tenue">(editable; se analiza al escribir)</span></label>' +
        '<span class="msc-ed-bot">' +
          '<button type="button" class="msc-b-rest">Restaurar ejemplo</button>' +
        '</span>' +
      '</div>' +
      '<div class="msc-ed">' +
        '<div class="msc-gutter" aria-hidden="true"><div class="msc-gutter-in"></div></div>' +
        '<div class="msc-ed-area">' +
          '<div class="msc-fondo" aria-hidden="true"><div class="msc-fondo-in"></div></div>' +
          '<textarea id="' + uid + '-ta" class="msc-ta" wrap="off" spellcheck="false" autocapitalize="off" autocomplete="off" autocorrect="off" rows="14"></textarea>' +
        '</div>' +
      '</div>' +
      '<div class="msc-err-prueba">' +
        '<label>Prueba un error frecuente del libro <select class="msc-sel-err">' + opcErr + '</select></label>' +
        '<button type="button" class="msc-b-err">Insertar en el ejemplo</button>' +
      '</div>' +
      '<div class="msc-errores" role="alert" hidden></div>' +
      '<div class="msc-avisos" hidden></div>' +
      '<div class="msc-barra" role="toolbar" aria-label="Controles de la simulación">' +
        '<button type="button" class="msc-b-todo">Ejecutar todo ▸▸</button>' +
        '<button type="button" class="msc-b-paso">Paso ▸</button>' +
        '<button type="button" class="msc-b-reini">Reiniciar</button>' +
        '<span class="msc-estado" aria-live="polite"></span>' +
      '</div>' +
      '<div class="msc-ult" aria-live="polite"></div>' +
      '<div class="msc-cuerpo">' +
        '<section class="msc-panel" aria-labelledby="' + uid + '-tout">' +
          '<h4 class="msc-h" id="' + uid + '-tout">Output · Simulator</h4>' +
          '<div class="msc-out" role="log" aria-live="polite" tabindex="0"></div>' +
        '</section>' +
        '<section class="msc-panel" aria-labelledby="' + uid + '-tvar">' +
          '<h4 class="msc-h" id="' + uid + '-tvar">Variables <span class="msc-h-sub">del process</span></h4>' +
          '<div class="msc-vars"></div>' +
        '</section>' +
      '</div>' +
      '<section class="msc-panel msc-la-panel" aria-labelledby="' + uid + '-tla">' +
        '<h4 class="msc-h" id="' + uid + '-tla">Logic Analyzer <span class="msc-h-sub">pines que usa el SCL · ▼n = report número n</span></h4>' +
        '<div class="msc-la"></div>' +
      '</section>' +
      '<details class="msc-notas"><summary>Qué simula y qué no este mini-simulador</summary><ul>' +
        '<li>No hay CPU: el «micro» es solo el generador de pulsos de RB15. El pulso está definido en µs; al cambiar FCY cambia cuántos ciclos son. (Si el programa del micro contase ciclos, con un timer calculado a 40 MHz, el pulso duraría 5000 ic con cualquier FCY y lo que cambiaría sería su duración en µs.)</li>' +
        '<li>Los ejemplos del libro usan RD0-RD3 y PORTD, que el dsPIC33FJ32MC202 no tiene (solo RA0-RA4 y RB0-RB15): aquí se usan pines RB.</li>' +
        '<li><code>wait until PC == N</code> es una aproximación: se toma PC = 2 × ciclos (programa en línea recta). En MPLAB X se cumple cuando la CPU llega de verdad a esa dirección.</li>' +
        '<li><code>wait until</code> sigue sin esperar si la condición ya se cumple (por eso el primer <code>wait until RB15 == \'0\'</code> sincroniza la medida); así lo simula este mini-intérprete.</li>' +
        '<li>Al llegar a <code>end process;</code> el process vuelve a empezar, como en VHDL; por eso los ejemplos terminan con <code>wait;</code>; así lo simula este mini-intérprete.</li>' +
        '<li>Un solo process. Tipos integer, byte, word, boolean, bit, character, cycle, time y string (no paddress, daddress ni frequency). Señales: RA0-RA4, RB0-RB14, AN0-AN5 (AN0 = RA0, AN1 = RA1, AN2-AN5 = RB0-RB3) y, solo para leer, RB15, PORTA, PORTB y PC.</li>' +
        '<li>Los números de línea de los errores son los del editor. Según el libro (22.3.5 a), MPLAB X puede dar otro número si hay líneas en blanco: es mejor no dejarlas.</li>' +
        '<li>Límites: ' + fmtEnt(LIMITE_PASOS) + ' pasos por ejecución, ' + LIMITE_REPORTS + ' report y ' + LIMITE_SEG + ' s de tiempo simulado.</li>' +
      '</ul></details>';

    var q = function (s) { return el.querySelector(s); };
    var ta = q('.msc-ta'), gutterIn = q('.msc-gutter-in'), fondoIn = q('.msc-fondo-in');
    var inAlto = q('.msc-in-alto'), inBajo = q('.msc-in-bajo'), inFcy = q('.msc-in-fcy'), inIni = q('.msc-in-ini');
    var eqAlto = q('.msc-eq-alto'), eqBajo = q('.msc-eq-bajo');
    var divErr = q('.msc-errores'), divAv = q('.msc-avisos');
    var bTodo = q('.msc-b-todo'), bPaso = q('.msc-b-paso'), bReini = q('.msc-b-reini'), spEstado = q('.msc-estado');
    var divUlt = q('.msc-ult'), divOut = q('.msc-out'), divVars = q('.msc-vars'), divLA = q('.msc-la');
    var selErr = q('.msc-sel-err'), bErr = q('.msc-b-err'), bRest = q('.msc-b-rest');

    ta.value = ej.codigo;
    var analisis = null, sim = null, temporizador = null, avisoLimite = '';

    function leerNum(inp, def) {
      var v = Math.round(Number(inp.value));
      var ok = v >= 1 && v <= 100000;
      inp.setAttribute('aria-invalid', ok ? 'false' : 'true');
      return ok ? v : def;
    }
    function opciones() {
      return { fcy: Number(inFcy.value) === 39613750 ? 39613750 : 40000000, altoUs: leerNum(inAlto, 125), bajoUs: leerNum(inBajo, 500), empiezaAlto: inIni.value === '1' };
    }

    function analizarYPreparar() {
      temporizador = null;
      var o = opciones();
      analisis = analizar(ta.value, { fcy: o.fcy });
      sim = analisis.ops ? new Sim(analisis, o) : null;
      if (!sim) sim = new Sim({ ops: [], vars: analisis.vars }, o);   // solo para el generador del cronograma
      avisoLimite = '';
      pintar();
    }
    function pendiente() { if (temporizador) { clearTimeout(temporizador); analizarYPreparar(); } }

    // ------------------------------------------------ pintado
    function pintar() {
      var o = opciones();
      var fc = o.fcy / 1e6;
      eqAlto.textContent = '= ' + fmtDec(o.altoUs * fc, 2) + NBSP + 'ic';
      eqBajo.textContent = '= ' + fmtDec(o.bajoUs * fc, 2) + NBSP + 'ic';
      var ok = !!analisis.ops;
      bTodo.disabled = !ok || !!sim.fin;
      bPaso.disabled = !ok || !!sim.fin;
      bReini.disabled = !ok || (!sim.pasos && !sim.fin);
      var est;
      if (!ok) est = 'Hay errores: corrígelos para poder simular';
      else {
        est = 't = ' + sim.tTxt(sim.t) + ' · ' + sim.pasos + (sim.pasos === 1 ? ' paso' : ' pasos');
        if (sim.fin) est += sim.fin.tipo === 'wait' ? ' · process terminado' : ' · detenido';
        else if (!sim.pasos) est = 'Listo para simular (t = 0)';
      }
      spEstado.textContent = est;
      pintarEditor();
      pintarErrores();
      pintarUltimo();
      pintarSalida();
      pintarVars();
      pintarLA();
    }

    function pintarEditor() {
      var n = ta.value.split('\n').length;
      var lAct = sim && sim.ultimo ? sim.ultimo.linea : -1;
      var lSig = analisis.ops && sim && sim.pasos ? sim.siguienteLinea() : (analisis.ops ? analisis.ops[0].linea : -1);
      var errL = {};
      analisis.errores.forEach(function (e) { errL[e.linea] = 1; });
      var g = '', f = '';
      for (var i = 1; i <= n; i++) {
        var cls = 'msc-fl' + (errL[i] ? ' msc-fl-err' : '') + (i === lAct ? ' msc-fl-act' : '') + (i === lSig && analisis.ops && !sim.fin ? ' msc-fl-sig' : '');
        g += '<div class="msc-gl' + (errL[i] ? ' msc-gl-err' : '') + '">' + (i === lSig && analisis.ops && !sim.fin ? '▶' : '') + i + '</div>';
        f += '<div class="' + cls + '"> </div>';
      }
      gutterIn.innerHTML = g;
      fondoIn.innerHTML = f;
      sincronizarScroll();
    }
    function sincronizarScroll() {
      gutterIn.style.transform = 'translateY(' + (-ta.scrollTop) + 'px)';
      fondoIn.style.transform = 'translate(' + (-ta.scrollLeft) + 'px,' + (-ta.scrollTop) + 'px)';
    }
    function verLinea(l) {
      if (l < 1) return;
      var fila = fondoIn.children[l - 1];
      if (!fila) return;
      var alto = fila.offsetHeight || 20, top = fila.offsetTop;
      if (top < ta.scrollTop + 2) ta.scrollTop = Math.max(0, top - alto * 2);
      else if (top + alto > ta.scrollTop + ta.clientHeight - 2) ta.scrollTop = top + alto * 3 - ta.clientHeight;
      sincronizarScroll();
    }

    function pintarErrores() {
      var e = analisis.errores;
      if (!e.length) { divErr.hidden = true; divErr.innerHTML = ''; }
      else {
        divErr.hidden = false;
        divErr.innerHTML = '<p class="msc-err-tit">El SCL no se puede cargar (' + e.length + (e.length === 1 ? ' error' : ' errores') + '):</p><ul>' +
          e.map(function (x) { return '<li><b>Línea ' + x.linea + ':</b> ' + esc(x.msg) + '</li>'; }).join('') + '</ul>';
      }
      var av = analisis.avisos.slice();
      if (analisis.lineasBlanco) av.push({ linea: 0, msg: 'Hay ' + analisis.lineasBlanco + (analisis.lineasBlanco === 1 ? ' línea' : ' líneas') + ' en blanco: el libro (22.3.5 a) recomienda no dejarlas, porque MPLAB X puede dar mal el número de línea de un error. Para separar, usa un comentario o report("----").' });
      if (!av.length) { divAv.hidden = true; divAv.innerHTML = ''; return; }
      divAv.hidden = false;
      divAv.innerHTML = '<ul>' + av.map(function (x) { return '<li>' + (x.linea ? '<b>Línea ' + x.linea + ':</b> ' : '') + esc(x.msg) + '</li>'; }).join('') + '</ul>';
    }

    function pintarUltimo() {
      var h;
      if (!analisis.ops) h = '<span class="msc-tenue">Sin simulación: el fichero tiene errores.</span>';
      else if (!sim.ultimo) h = '<span class="msc-tenue">Pulsa <b>Paso</b> para ejecutar la primera instrucción (línea ' + analisis.ops[0].linea + ') o <b>Ejecutar todo</b>.</span>';
      else {
        var u = sim.ultimo;
        h = '<span class="msc-ult-l">Línea ' + u.linea + '</span> ' + esc(u.desc);
        if (u.t !== u.t0) h += ' <span class="msc-ult-t">t: ' + esc(sim.tTxt(u.t0)) + ' → ' + esc(sim.tTxt(u.t)) + '</span>';
      }
      if (avisoLimite) h += '<p class="msc-ult-av">' + esc(avisoLimite) + '</p>';
      divUlt.innerHTML = h;
    }

    // La salida se añade línea a línea (role="log"): así el lector de pantalla
    // anuncia solo los mensajes nuevos.
    var outSim = null, outN = 0;
    function lineaSalida(s) {
      var cls = s.tipo === 'report' ? 'msc-o' : s.tipo === 'aviso' ? 'msc-o msc-o-av' : 'msc-o msc-o-sis';
      return '<p class="' + cls + '">' + (s.n ? '<span class="msc-o-n" aria-hidden="true">▼' + s.n + '</span>' : '') + esc(s.txt) +
        '<span class="msc-o-t">' + esc(sim.tTxt(s.t)) + '</span></p>';
    }
    function pintarSalida() {
      if (!analisis.ops) { divOut.innerHTML = '<p class="msc-tenue">—</p>'; outSim = null; return; }
      if (outSim !== sim || outN > sim.salida.length || !sim.pasos) {
        divOut.innerHTML = '<p class="msc-o msc-o-sis">Simulador: FCY = ' + esc(fmtFcy(sim.fcy)) + ' · 1 ic = ' + esc(fmtDec(1e9 / sim.fcy, 3)) + NBSP + 'ns</p>' +
          (sim.pasos ? '' : '<p class="msc-tenue msc-o-vacio">Aquí saldrán los mensajes de <code>report</code>.</p>');
        outSim = sim; outN = 0;
      }
      var vacio = divOut.querySelector('.msc-o-vacio');
      if (vacio && sim.salida.length) vacio.parentNode.removeChild(vacio);
      var h = '';
      for (; outN < sim.salida.length; outN++) h += lineaSalida(sim.salida[outN]);
      if (h) divOut.insertAdjacentHTML('beforeend', h);
      divOut.scrollTop = divOut.scrollHeight;
    }

    function pintarVars() {
      var vs = analisis.vars;
      if (!vs.length) { divVars.innerHTML = '<p class="msc-tenue">El process no declara variables.</p>'; return; }
      var cambio = sim && sim.ultimo ? sim.ultimo.cambio : null;
      var h = '<table class="msc-vt"><thead><tr><th scope="col">Variable</th><th scope="col">Tipo</th><th scope="col">Valor</th></tr></thead><tbody>';
      vs.forEach(function (v) {
        var st = sim && analisis.ops ? sim.vars[v.clave] : null;
        var val = !st || !st.asignada ? '<span class="msc-tenue">sin asignar</span>' : esc(sim.fmtValor(v.tipo, st.v));
        if (st && st.asignada && v.tipo === 'cycle') val += ' <span class="msc-tenue">= ' + esc(fmtUs(st.v / sim.fc)) + '</span>';
        if (st && st.asignada && v.tipo === 'time') val += ' <span class="msc-tenue">= ' + esc(fmtEnt(sim.psAcyc(st.v))) + NBSP + 'ic</span>';
        var cam = cambio === 'var:' + v.clave;
        h += '<tr class="' + (cam ? 'msc-cambio' : '') + '"><th scope="row"><code>' + esc(v.nombre) + '</code></th><td>' + esc(v.tipoTxt) + '</td><td>' + val + (cam ? '<span class="msc-sr"> (acaba de cambiar)</span>' : '') + '</td></tr>';
      });
      divVars.innerHTML = h + '</tbody></table>';
    }

    function pintarLA() {
      var s = sim, pins = ['RB15'];
      (analisis.pines || []).forEach(function (p) { if (pins.indexOf(p) < 0) pins.push(p); });
      var tEnd = analisis.ops ? s.t : 0;
      var P = s.periodo;
      var fin = tEnd > 0 ? Math.max(tEnd * 1.06, tEnd + P * 0.15) : 2 * P;
      var ini = Math.max(0, fin - 12 * P);
      var span = fin - ini;
      function x(t) { return ((t - ini) / span * 1000).toFixed(2); }
      var Y1 = 4, Y0 = 22;
      var filas = '';
      pins.forEach(function (p) {
        var info = PINES[p], analog = info.tipo === 'mv';
        var pts = [], futuro = '';
        if (p === 'RB15') {
          var nv = s.nivelRB15(ini), n = s.indiceTras(ini);
          pts.push(x(ini) + ',' + (nv === '1' ? Y1 : Y0));
          var guard = 0;
          while (guard++ < 2000) {
            var tf = s.flanco(n);
            if (tf > fin) break;
            var nuevo = s.flancoSube(n) ? '1' : '0';
            pts.push(x(tf) + ',' + (nv === '1' ? Y1 : Y0)); pts.push(x(tf) + ',' + (nuevo === '1' ? Y1 : Y0));
            nv = nuevo; n++;
          }
          pts.push(x(fin) + ',' + (nv === '1' ? Y1 : Y0));
        } else {
          var h = s.hist[p] || [], maxmv = 3300;
          if (analog) h.forEach(function (e) { if (e.v > maxmv) maxmv = e.v; });
          var yv = function (v) { return analog ? (Y0 - (Y0 - Y1) * Math.max(0, v) / maxmv).toFixed(2) : (v === '1' ? Y1 : Y0); };
          var tope = Math.max(ini, Math.min(fin, tEnd));
          var vAct = analog ? 0 : '0';
          h.forEach(function (e) { if (e.t <= ini) vAct = e.v; });
          pts.push(x(ini) + ',' + yv(vAct));
          h.forEach(function (e) {
            if (e.t > ini && e.t <= tope) { pts.push(x(e.t) + ',' + yv(vAct)); pts.push(x(e.t) + ',' + yv(e.v)); vAct = e.v; }
          });
          pts.push(x(tope) + ',' + yv(vAct));
          if (tope < fin) futuro = '<line class="msc-la-fut" x1="' + x(tope) + '" x2="1000" y1="' + yv(vAct) + '" y2="' + yv(vAct) + '" vector-effect="non-scaling-stroke"/>';
        }
        var valAct = analisis.ops ? (p === 'RB15' ? s.nivelRB15(tEnd) : s.pines[p]) : (p === 'RB15' ? s.nivelRB15(0) : (analog ? 0 : '0'));
        var etiqueta = p + (info.fisico ? ' · ' + info.fisico : '') + (NOTA_PIN[p] ? ' · ' + NOTA_PIN[p] : '');
        filas += '<div class="msc-la-fila">' +
          '<div class="msc-la-nom"><b>' + esc(etiqueta) + '</b><span class="msc-la-val">' + esc(analog ? fmtEnt(valAct) + NBSP + 'mV' : valAct) + '</span></div>' +
          '<svg class="msc-la-svg" viewBox="0 0 1000 26" preserveAspectRatio="none" role="img" aria-label="Señal ' + esc(p) + ' entre ' + esc(fmtUs(ini / s.fc)) + ' y ' + esc(fmtUs(fin / s.fc)) + '">' +
            (tEnd > 0 && tEnd < fin ? '<rect class="msc-la-sombra" x="' + x(tEnd) + '" y="0" width="' + (1000 - x(tEnd)) + '" height="26"/>' : '') +
            '<polyline class="msc-la-linea' + (p === 'RB15' ? ' msc-la-gen' : analog ? ' msc-la-an' : '') + '" points="' + pts.join(' ') + '" vector-effect="non-scaling-stroke"/>' + futuro +
            (tEnd > 0 && tEnd <= fin ? '<line class="msc-la-ahora" x1="' + x(tEnd) + '" x2="' + x(tEnd) + '" y1="0" y2="26" vector-effect="non-scaling-stroke"/>' : '') +
          '</svg></div>';
      });
      // Marcas de report
      var marcas = '';
      if (analisis.ops) {
        var visibles = s.salida.filter(function (o) { return o.n && o.t >= ini && o.t <= fin; });
        if (visibles.length <= 40) visibles.forEach(function (o) {
          var pc = (o.t - ini) / span * 100;
          marcas += '<span class="msc-la-mk" style="left:' + pc.toFixed(2) + '%" title="' + esc('report ' + o.n + ': ' + o.txt) + '">▼' + o.n + '</span>';
        });
      }
      var eje = '<div class="msc-la-eje"><span style="left:0">' + esc(fmtUs(ini / s.fc)) + '</span>' +
        '<span style="left:50%" class="msc-la-eje-c">' + esc(fmtUs((ini + span / 2) / s.fc)) + '</span>' +
        '<span style="left:100%" class="msc-la-eje-d">' + esc(fmtUs(fin / s.fc)) + '</span></div>';
      var pie = tEnd > 0 ? 'Línea vertical: instante actual de la simulación (t = ' + s.tTxt(tEnd) + '). A la derecha, lo que aún no se ha simulado.' : 'Vista previa de la señal del micro antes de simular.';
      if (ini > 0) pie += ' Se muestran los últimos 12 periodos.';
      divLA.innerHTML = '<div class="msc-la-filas">' + filas +
        '<div class="msc-la-fila msc-la-fila-mk"><div class="msc-la-nom"><span class="msc-tenue">report</span></div><div class="msc-la-mks">' + marcas + '</div></div>' +
        '<div class="msc-la-fila msc-la-fila-eje"><div class="msc-la-nom"></div>' + eje + '</div></div>' +
        '<p class="msc-la-pie">' + esc(pie) + '</p>';
    }

    // ------------------------------------------------ acciones
    function paso() {
      pendiente();
      if (bPaso.disabled) return;
      avisoLimite = '';
      sim.paso();
      pintar();
      var l = sim.siguienteLinea() || (sim.ultimo && sim.ultimo.linea);
      if (l) verLinea(l);
    }
    function todo() {
      pendiente();
      if (bTodo.disabled) return;
      var r = sim.ejecutarTodo();
      avisoLimite = r.limite ? 'Se ha parado tras ' + fmtEnt(LIMITE_PASOS) + ' pasos sin terminar: el process no acaba (bucle sin fin). En MPLAB X un process así sigue mientras dure la simulación. Pulsa otra vez para continuar.' : '';
      pintar();
    }
    function reiniciar() {
      pendiente();
      if (!analisis.ops) return;
      avisoLimite = '';
      sim.reiniciar();
      pintar();
      verLinea(analisis.ops[0].linea);
    }
    function reprogramar() { if (temporizador) clearTimeout(temporizador); temporizador = setTimeout(analizarYPreparar, 300); }

    bTodo.addEventListener('click', todo);
    bPaso.addEventListener('click', paso);
    bReini.addEventListener('click', reiniciar);
    bRest.addEventListener('click', function () { ta.value = ej.codigo; if (temporizador) clearTimeout(temporizador); analizarYPreparar(); ta.focus(); });
    bErr.addEventListener('click', function () {
      var x = ej.errores[Number(selErr.value)];
      if (!x) return;
      ta.value = ej.codigo.replace(x.de, x.a);
      if (temporizador) clearTimeout(temporizador);
      analizarYPreparar();
      var lin = ta.value.slice(0, ta.value.indexOf(x.a)).split('\n').length;
      verLinea(lin);
    });
    ta.addEventListener('input', reprogramar);
    ta.addEventListener('scroll', sincronizarScroll);
    ta.addEventListener('keydown', function (e) {
      if (e.key === 'Tab' && !e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey && ta.selectionStart === ta.selectionEnd) {
        // Tab inserta 4 espacios (Esc y luego Tab sale del editor).
        if (ta._escape) { ta._escape = false; return; }
        e.preventDefault();
        var p = ta.selectionStart;
        ta.value = ta.value.slice(0, p) + '    ' + ta.value.slice(p);
        ta.selectionStart = ta.selectionEnd = p + 4;
        reprogramar();
      } else if (e.key === 'Escape') ta._escape = true;
      else ta._escape = false;
    });
    [inAlto, inBajo].forEach(function (inp) { inp.addEventListener('input', reprogramar); inp.addEventListener('change', analizarYPreparar); });
    [inFcy, inIni].forEach(function (s) { s.addEventListener('change', analizarYPreparar); });

    analizarYPreparar();
  };

  MPI.componentes['mini-scl'].motor = { analizar: analizar, Sim: Sim, EJEMPLOS: EJEMPLOS, lexer: lexer };
})();
