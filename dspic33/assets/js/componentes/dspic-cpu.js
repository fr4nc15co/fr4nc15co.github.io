/*
 * Motor "dspic-cpu" (NO es un componente): CPU dsPIC33F simplificada para el
 * simulador de ensamblador paso a paso (componente "sim-asm-dspic").
 * Debe cargarse ANTES que sim-asm-dspic.js.
 *
 *   MPI.dspic.ensamblar(texto, origen) → { instrucciones, etiquetas, errores,
 *                                           lineas, porDir, nombreDir, inicio }
 *   MPI.dspic.crear(opciones) → cpu
 *       opciones: { programa, regs:{W0:..}, sr, mem:{dir:word}, pc, w15, splim }
 *       cpu.cargar(programa)  cpu.reiniciar()  cpu.paso() → info
 *       cpu.ejecutar(limite) → {pasos, limite}  cpu.atras() → bool
 *       cpu.estado()  cpu.leerByte(d)  cpu.leerWord(d)  cpu.fin() → null | {tipo, msg}
 *
 * Modelo (datasheet dsPIC33FJ32MC202, 3.0 CPU y 22.0 INSTRUCTION SET SUMMARY):
 *  - W0-W15 de 16 bits; W15 = puntero de pila (crece hacia direcciones altas).
 *    W0-W15 están mapeados en memoria de datos 0x0000-0x001F, SPLIM en 0x0020
 *    y SR en 0x0042.
 *  - SR: C (bit 0), Z (1), OV (2), N (3), RA (4), IPL<2:0> (7-5), DC (8).
 *  - PC en direcciones de programa: cada instrucción suma 2; CALL lit23 y
 *    GOTO lit23 ocupan 2 words (suman 4).
 *  - Memoria de datos de 64 KB direccionable por byte, little endian; las
 *    words van en dirección par (si no, error de dirección / address error trap).
 *  - En restas (SUB, SUBB, CP, NEG, DEC…) C = 1 significa que NO hubo préstamo.
 *  - Z es «sticky» en ADDC, SUBB, SUBBR y CPB: solo puede pasar a 0.
 */
window.MPI = window.MPI || {};

(function () {
  'use strict';

  // ------------------------------------------------------------------ datos
  var SFR = {
    SPLIM: 0x0020, SR: 0x0042,
    TRISA: 0x02C0, PORTA: 0x02C2, LATA: 0x02C4,
    TRISB: 0x02C8, PORTB: 0x02CA, LATB: 0x02CC
  };
  var B_C = 0x0001, B_Z = 0x0002, B_OV = 0x0004, B_N = 0x0008, B_RA = 0x0010, B_DC = 0x0100;
  var BITS_FLAG = { C: B_C, Z: B_Z, OV: B_OV, N: B_N, DC: B_DC, RA: B_RA };
  var PILA_MIN = 0x0800;     // por debajo: stack error (underflow)

  // Condiciones de BRA (datasheet, tabla 22-2).
  var CONDS = {
    C:   { usa: ['C'], txt: 'C = 1', sig: 'hay acarreo / no hay préstamo', f: function (s) { return s.C; } },
    NC:  { usa: ['C'], txt: 'C = 0', sig: 'no hay acarreo / hay préstamo', f: function (s) { return !s.C; } },
    Z:   { usa: ['Z'], txt: 'Z = 1', sig: 'cero, igual', f: function (s) { return s.Z; } },
    NZ:  { usa: ['Z'], txt: 'Z = 0', sig: 'distinto de cero, distinto', f: function (s) { return !s.Z; } },
    N:   { usa: ['N'], txt: 'N = 1', sig: 'negativo', f: function (s) { return s.N; } },
    NN:  { usa: ['N'], txt: 'N = 0', sig: 'no negativo', f: function (s) { return !s.N; } },
    OV:  { usa: ['OV'], txt: 'OV = 1', sig: 'desbordamiento con signo', f: function (s) { return s.OV; } },
    NOV: { usa: ['OV'], txt: 'OV = 0', sig: 'sin desbordamiento', f: function (s) { return !s.OV; } },
    GT:  { usa: ['Z', 'N', 'OV'], txt: 'Z = 0 y N = OV', sig: 'mayor que, con signo', f: function (s) { return !s.Z && s.N === s.OV; } },
    GE:  { usa: ['N', 'OV'], txt: 'N = OV', sig: 'mayor o igual, con signo', f: function (s) { return s.N === s.OV; } },
    LT:  { usa: ['N', 'OV'], txt: 'N ≠ OV', sig: 'menor que, con signo', f: function (s) { return s.N !== s.OV; } },
    LE:  { usa: ['Z', 'N', 'OV'], txt: 'Z = 1 o N ≠ OV', sig: 'menor o igual, con signo', f: function (s) { return s.Z || s.N !== s.OV; } },
    GTU: { usa: ['C', 'Z'], txt: 'C = 1 y Z = 0', sig: 'mayor que, sin signo', f: function (s) { return s.C && !s.Z; } },
    GEU: { usa: ['C'], txt: 'C = 1', sig: 'mayor o igual, sin signo', f: function (s) { return s.C; } },
    LTU: { usa: ['C'], txt: 'C = 0', sig: 'menor que, sin signo', f: function (s) { return !s.C; } },
    LEU: { usa: ['C', 'Z'], txt: 'C = 0 o Z = 1', sig: 'menor o igual, sin signo', f: function (s) { return !s.C || s.Z; } }
  };
  // Nombres que usa la tabla del libro (8.8.1) para las condiciones con signo.
  var ALIAS_COND = { GTS: 'GT', GES: 'GE', LTS: 'LT', LES: 'LE' };

  // ------------------------------------------------------------ utilidades
  function hex(v, n) {
    n = n || 4;
    var s = (v >>> 0).toString(16).toUpperCase();
    while (s.length < n) s = '0' + s;
    return '0x' + s;
  }
  function hx(v, bits) { return bits === 8 ? hex(v & 0xFF, 2) : hex(v & 0xFFFF, 4); }
  function sgn(v, bits) {
    var m = bits === 8 ? 0x80 : 0x8000;
    v &= (m << 1) - 1;
    return (v & m) ? v - (m << 1) : v;
  }
  function dec(n) { return n < 0 ? '−' + (-n) : String(n); }
  function decP(n) { return n < 0 ? '(' + dec(n) + ')' : dec(n); }
  function bin(v, bits) {
    var s = (v >>> 0).toString(2);
    while (s.length < bits) s = '0' + s;
    return s.replace(/(\d{4})(?=\d)/g, '$1 ');
  }
  function leerNum(s) {
    s = String(s).trim();
    var m = /^([+-]?)\s*(?:0x([0-9a-f]+)|0b([01]+)|(\d+))$/i.exec(s);
    if (!m) return NaN;
    var v = m[2] ? parseInt(m[2], 16) : (m[3] ? parseInt(m[3], 2) : parseInt(m[4], 10));
    return m[1] === '-' ? -v : v;
  }
  function trapErr(msg) { var e = new Error(msg); e.trap = msg; throw e; }

  // ------------------------------------------------- definición de mnemónicos
  var DEF = {};
  function def(nombres, d) { nombres.split(' ').forEach(function (n) { DEF[n] = d; }); }
  def('ADD ADDC SUB SUBB AND IOR XOR', { clase: 'ar2', formas: ['L,R', 'R,L,S', 'R,S,S', 'F', 'F,G'], byte: true });
  def('SUBR SUBBR', { clase: 'ar2', formas: ['R,L,S', 'R,S,S', 'F', 'F,G'], byte: true });
  def('INC INC2 DEC DEC2 NEG COM RLC RRC RLNC RRNC', { clase: 'una', formas: ['S,S', 'R', 'F', 'F,G'], byte: true });
  def('SL LSR ASR', { clase: 'una', formas: ['S,S', 'R', 'F', 'F,G', 'R,R,R', 'R,L,R'], byte: true });
  def('CLR SETM', { clase: 'clr', formas: ['S', 'F'], byte: true });
  def('MOV', { clase: 'mov', formas: ['L,R', 'F,R', 'R,F', 'F', 'S,S'], byte: true });
  def('PUSH POP', { clase: 'pila', formas: ['S', 'F'] });
  def('SE ZE', { clase: 'ext', formas: ['S,R'] });
  def('CP CPB', { clase: 'cp', formas: ['R,L', 'R,S', 'F'], byte: true });
  def('CP0', { clase: 'cp0', formas: ['S', 'F'], byte: true });
  def('MUL', { clase: 'mul', formas: ['R,S,R', 'R,L,R', 'F'], sufijos: ['SS', 'SU', 'US', 'UU'] });
  def('DIV', { clase: 'div', formas: ['R,R'], sufijos: ['S', 'U', 'SW', 'UW', 'SD', 'UD'] });
  def('REPEAT', { clase: 'repeat', formas: ['L', 'R'] });
  def('BRA', { clase: 'bra', formas: ['X', 'C,X'] });
  def('CALL GOTO RCALL', { clase: 'salto', formas: ['X', 'R'] });
  def('RETURN NOP', { clase: 'nada', formas: [''] });
  def('BSET BCLR BTG BTST BTSC BTSS', { clase: 'bit', formas: ['S,L', 'F,L'], byte: true });

  var SINTAXIS = {
    ar2: '#lit10,Wn · Wb,#lit5,Wd · Wb,Ws,Wd · f · f,WREG',
    una: 'Ws,Wd · f · f,WREG',
    clr: 'Wd · f · WREG',
    mov: '#lit16,Wn · #lit8,Wn (.B) · f,Wn · Wn,f · f · Wso,Wdo',
    pila: 'Wso · f',
    ext: 'Ws,Wnd',
    cp: 'Wb,#lit5 · Wb,Ws · f',
    cp0: 'Ws · f',
    mul: 'MUL.SS/.SU/.US/.UU Wb,Ws,Wnd · MUL.SU/.UU Wb,#lit5,Wnd · MUL f',
    div: 'DIV.S/.U Wm,Wn (precedida de REPEAT #17)',
    repeat: '#lit14 · Wn',
    bra: 'etiqueta · condición,etiqueta',
    salto: 'etiqueta o dirección · Wn',
    nada: 'sin operandos',
    bit: 'Ws,#bit4 · f,#bit4'
  };
  var SINTAXIS_SH = 'Ws,Wd · f · f,WREG · Wb,#lit4,Wnd · Wb,Wns,Wnd';

  // ------------------------------------------------------------ analizador
  function partirOperandos(s) {
    var out = [], prof = 0, ini = 0;
    for (var i = 0; i < s.length; i++) {
      var c = s.charAt(i);
      if (c === '[') prof++;
      else if (c === ']') prof--;
      else if (c === ',' && prof === 0) { out.push(s.slice(ini, i)); ini = i + 1; }
    }
    out.push(s.slice(ini));
    return out.map(function (x) { return x.trim(); });
  }

  function regNum(t) {
    var m = /^W(\d{1,2})$/i.exec(t);
    if (m && +m[1] <= 15) return +m[1];
    if (/^WREG$/i.test(t)) return 0;
    return -1;
  }

  function analizarOperando(t) {
    if (t === '') return { err: 'falta un operando (hay una coma de más o de menos).' };
    if (t.charAt(0) === '#') {
      var s = t.slice(1).trim();
      var v = leerNum(s);
      if (!isNaN(v)) return { t: 'lit', v: v, txt: t };
      if (/^[A-Za-z_][\w]*$/.test(s)) return { t: 'lit', sym: s, txt: t };
      return { err: 'literal no válido «' + t + '» (usa decimal, 0x… hexadecimal o 0b… binario).' };
    }
    var n = regNum(t);
    if (n >= 0) return { t: 'reg', n: n, txt: t, wreg: /^WREG$/i.test(t) };
    if (t.charAt(0) === '[') {
      if (t.charAt(t.length - 1) !== ']') return { err: 'falta el corchete de cierre en «' + t + '».' };
      var c = t.slice(1, -1).replace(/\s+/g, '');
      var m, modos = [
        [/^(W\d{1,2})$/i, 'ind'], [/^(W\d{1,2})\+\+$/i, 'pos+'], [/^(W\d{1,2})--$/i, 'pos-'],
        [/^\+\+(W\d{1,2})$/i, 'pre+'], [/^--(W\d{1,2})$/i, 'pre-']
      ];
      for (var k = 0; k < modos.length; k++) {
        m = modos[k][0].exec(c);
        if (m) {
          var r = regNum(m[1]);
          if (r < 0) return { err: '«' + m[1] + '» no es un registro (W0…W15).' };
          return { t: 'ind', n: r, modo: modos[k][1], txt: t };
        }
      }
      m = /^(W\d{1,2})\+(W\d{1,2})$/i.exec(c);
      if (m && regNum(m[1]) >= 0 && regNum(m[2]) >= 0) return { t: 'ind', n: regNum(m[1]), nb: regNum(m[2]), modo: 'idx', txt: t };
      return { err: 'modo de direccionamiento no válido «' + t + '» (admitidos: [Wn], [Wn++], [Wn--], [++Wn], [--Wn], [Wn+Wb]).' };
    }
    var num = leerNum(t);
    if (!isNaN(num)) return { t: 'num', v: num, txt: t };
    if (/^[A-Za-z_.$][\w.$]*$/.test(t)) return { t: 'sym', nombre: t, txt: t };
    return { err: 'operando no reconocido «' + t + '».' };
  }

  var DIRECTIVAS_IGNORADAS = { text: 1, global: 1, globl: 1, end: 1, section: 1, data: 1, bss: 1, extern: 1, type: 1, size: 1, align: 1, include: 1, list: 1, nolist: 1, title: 1, sbttl: 1 };

  // Devuelve { dir, etiquetas[], org, mnem, suf, ops[], texto, err }
  function analizarLinea(linea) {
    var r = { dir: null, etiquetas: [], org: null, mnem: null, suf: '', ops: [], texto: '', err: null };
    var s = linea;
    var ic = s.indexOf(';');
    if (ic >= 0) s = s.slice(0, ic);
    s = s.replace(/\t/g, ' ').trim();
    var m;
    for (;;) {
      m = /^(0x[0-9a-f]+|\d+)\s*:\s*/i.exec(s);
      if (m) { r.dir = leerNum(m[1]); s = s.slice(m[0].length); continue; }
      m = /^([A-Za-z_$][\w.$]*)\s*:\s*/.exec(s);
      if (m) { r.etiquetas.push(m[1]); s = s.slice(m[0].length); continue; }
      break;
    }
    if (!s) return r;
    if (s.charAt(0) === '.') {
      m = /^\.([A-Za-z]+)\b\s*(.*)$/.exec(s);
      if (!m) { r.err = 'directiva no válida «' + s + '».'; return r; }
      var dname = m[1].toLowerCase();
      if (dname === 'org') {
        var v = leerNum(m[2]);
        if (isNaN(v)) r.err = '.org necesita una dirección (p. ej. .org 0x0300).';
        else r.org = v;
        return r;
      }
      if (DIRECTIVAS_IGNORADAS[dname]) return r;
      r.err = 'directiva «.' + m[1] + '» no admitida en el simulador (se ignoran .text, .global, .end…).';
      return r;
    }
    m = /^([A-Za-z][A-Za-z0-9]*)(?:\.([A-Za-z]+))?(?:\s+(.*))?$/.exec(s);
    if (!m) { r.err = 'no se entiende «' + s + '».'; return r; }
    r.mnem = m[1].toUpperCase();
    r.suf = (m[2] || '').toUpperCase();
    r.texto = s.replace(/\s+/g, ' ');
    var resto = (m[3] || '').trim();
    if (resto) {
      var partes = partirOperandos(resto);
      for (var i = 0; i < partes.length; i++) {
        var op = analizarOperando(partes[i]);
        if (op.err) { r.err = 'operando ' + (i + 1) + ': ' + op.err; return r; }
        r.ops.push(op);
      }
    }
    return r;
  }

  function encajaUno(op, p) {
    switch (p) {
      case 'R': return op.t === 'reg';
      case 'G': return op.t === 'reg' && op.n === 0;
      case 'S': return op.t === 'reg' || op.t === 'ind';
      case 'L': return op.t === 'lit';
      case 'F': return op.t === 'num' || (op.t === 'sym' && SFR.hasOwnProperty(op.nombre.toUpperCase()));
      case 'X': return op.t === 'num' || op.t === 'sym';
      case 'C': return op.t === 'sym' && (CONDS.hasOwnProperty(op.nombre.toUpperCase()) || ALIAS_COND.hasOwnProperty(op.nombre.toUpperCase()));
    }
    return false;
  }
  function encaja(ops, forma) {
    var pats = forma === '' ? [] : forma.split(',');
    if (pats.length !== ops.length) return false;
    for (var i = 0; i < pats.length; i++) if (!encajaUno(ops[i], pats[i])) return false;
    return true;
  }

  // Elige la forma y comprueba sufijo. Devuelve {forma} o {err}.
  function elegirForma(p) {
    var d = DEF[p.mnem];
    var nom = p.mnem + (p.suf ? '.' + p.suf : '');
    if (!d) return { err: '«' + nom + '» no es una instrucción del subconjunto que simula esta web.' };
    var suf = p.suf;
    if (d.sufijos) {
      if (suf && d.sufijos.indexOf(suf) < 0) return { err: 'sufijo «.' + suf + '» no válido para ' + p.mnem + ' (admitidos: .' + d.sufijos.join(', .') + ').' };
      if (p.mnem === 'DIV' && !suf) return { err: 'DIV necesita sufijo: DIV.S (con signo) o DIV.U (sin signo).' };
    } else if (p.mnem === 'BTST') {
      if (suf && ['B', 'W', 'C', 'Z'].indexOf(suf) < 0) return { err: 'sufijo «.' + suf + '» no válido para BTST (.C, .Z o .B).' };
    } else if (suf === 'B') {
      if (!d.byte) return { err: p.mnem + ' no tiene versión de byte (.B).' };
    } else if (suf && suf !== 'W') {
      return { err: 'sufijo «.' + suf + '» no válido para ' + p.mnem + ' (solo .B o .W).' };
    }
    // Operandos que son símbolos desconocidos fuera de saltos.
    if (d.clase !== 'bra' && d.clase !== 'salto') {
      for (var i = 0; i < p.ops.length; i++) {
        var o = p.ops[i];
        if (o.t === 'sym' && !SFR.hasOwnProperty(o.nombre.toUpperCase())) {
          return { err: '«' + o.nombre + '» no es un registro (W0…W15, WREG), ni un literal (#…), ni un SFR conocido (' + Object.keys(SFR).join(', ') + ').' };
        }
      }
    }
    for (var k = 0; k < d.formas.length; k++) {
      if (encaja(p.ops, d.formas[k])) return { forma: d.formas[k] };
    }
    // Mensajes de ayuda para los errores típicos.
    var regs = p.ops.every(function (o) { return o.t === 'reg'; });
    if (d.clase === 'ar2' && p.ops.length === 2 && regs) {
      return { err: p.mnem + ' con dos registros no existe en el dsPIC: escribe los tres operandos, p. ej. ' + p.mnem + ' ' + p.ops[1].txt + ', ' + p.ops[0].txt + ', ' + p.ops[1].txt + '.' };
    }
    if (p.mnem === 'MOV' && p.ops.length === 2 && p.ops[0].t === 'lit') {
      return { err: 'MOV #literal solo admite un registro Wn como destino (no memoria ni [Wn]).' };
    }
    if (p.mnem === 'BRA' && p.ops.length === 1 && encajaUno(p.ops[0], 'C')) {
      return { err: 'falta el destino del salto: BRA ' + p.ops[0].txt + ', etiqueta.' };
    }
    var sx = (p.mnem === 'SL' || p.mnem === 'LSR' || p.mnem === 'ASR') ? SINTAXIS_SH : SINTAXIS[d.clase];
    return { err: 'operandos no válidos para ' + nom + '. Formas admitidas: ' + sx + '.' };
  }

  function rangoLit(o, min, max, nombre) {
    if (o.v < min || o.v > max) return 'el literal ' + o.txt + ' no cabe en ' + nombre + ' (' + min + ' … ' + max + ').';
    return null;
  }

  // Comprobaciones que dependen de valores (tras resolver símbolos).
  function validar(ins) {
    var o = ins.ops, f = ins.forma, b = ins.size === 1, m = ins.mnem, c = ins.clase, e;
    var esF = function (i, bits13) {
      var v = o[i].v;
      if (v < 0 || v > 0xFFFF) return 'dirección de memoria fuera de rango: ' + o[i].txt + '.';
      if (bits13 && v > 0x1FFF) return 'en esta forma la dirección f tiene 13 bits (0x0000 … 0x1FFF): ' + o[i].txt + ' no llega. Usa MOV ' + o[i].txt + ', Wn y opera con registros.';
      if (!b && (v & 1)) return 'operación de word sobre la dirección impar ' + hex(v) + ': las words están en direcciones pares.';
      return null;
    };
    if (b && (f === 'R,R,R' || f === 'R,L,R')) return 'el desplazamiento de varios bits solo existe para words (sin .B).';
    switch (c) {
      case 'ar2':
        if (f === 'L,R') return rangoLit(o[0], 0, b ? 255 : 1023, b ? '8 bits en modo byte' : 'lit10');
        if (f === 'R,L,S') return rangoLit(o[1], 0, 31, 'lit5');
        if (f === 'F' || f === 'F,G') return esF(0, true);
        return null;
      case 'una':
        if (f === 'R,L,R') return rangoLit(o[1], 0, 15, 'lit4');
        if (f === 'F' || f === 'F,G') return esF(0, true);
        return null;
      case 'clr': case 'cp0':
        return f === 'F' ? esF(0, true) : null;
      case 'cp':
        if (f === 'R,L') return rangoLit(o[1], 0, 31, 'lit5');
        if (f === 'F') return esF(0, true);
        return null;
      case 'mov':
        if (f === 'L,R') return b ? rangoLit(o[0], -128, 255, 'lit8') : rangoLit(o[0], -32768, 65535, 'lit16');
        if (f === 'F,R' || f === 'R,F') {
          var fi = f === 'F,R' ? 0 : 1, ri = 1 - fi;
          if (b && o[ri].n !== 0) return 'MOV.B con una dirección de memoria directa solo funciona con WREG (W0); para otros registros usa direccionamiento indirecto [Wn].';
          return esF(fi, b);
        }
        if (f === 'F') return esF(0, true);
        return null;
      case 'pila':
        if (f === 'F') return esF(0, false);
        return null;
      case 'mul':
        if (f === 'F') { if (ins.suf) return 'MUL f no lleva sufijo (W3:W2 = f × WREG).'; return esF(0, false); }
        if (!ins.suf) return 'MUL con registros necesita sufijo: MUL.SS, MUL.SU, MUL.US o MUL.UU.';
        if (f === 'R,L,R') {
          if (ins.suf !== 'SU' && ins.suf !== 'UU') return 'con literal solo existen MUL.SU y MUL.UU.';
          e = rangoLit(o[1], 0, 31, 'lit5'); if (e) return e;
        }
        if (o[2].n & 1 || o[2].n > 14) return 'Wnd debe ser par (W0, W2, …, W14): el resultado ocupa Wnd (parte baja) y Wnd+1 (parte alta).';
        return null;
      case 'div':
        if ((ins.suf === 'SD' || ins.suf === 'UD') && (o[0].n & 1 || o[0].n > 14)) return 'en DIV.SD/DIV.UD el dividendo es W(m+1):Wm, con Wm par.';
        return null;
      case 'repeat':
        return f === 'L' ? rangoLit(o[0], 0, 16383, 'lit14') : null;
      case 'bit':
        e = rangoLit(o[1], 0, b ? 7 : 15, b ? 'el número de bit de un byte' : 'bit4');
        if (e) return e;
        if (f === 'F,L') return esF(0, true);
        if (m === 'BTST' && ins.suf === 'B') return null;
        return null;
      case 'bra': case 'salto':
        if (ins.destino != null) {
          if (ins.destino & 1) return 'el destino del salto ' + hex(ins.destino) + ' es impar: las instrucciones están en direcciones pares.';
          if (ins.destino < 0 || ins.destino > 0x7FFFFE) return 'destino de salto fuera de la memoria de programa.';
        }
        return null;
    }
    return null;
  }

  function ensamblar(texto, origen) {
    var res = { instrucciones: [], etiquetas: {}, errores: [], lineas: [], porDir: {}, nombreDir: {}, inicio: null };
    var lineas = String(texto == null ? '' : texto).replace(/\r\n?/g, '\n').split('\n');
    var lc = (typeof origen === 'number' && origen >= 0) ? (origen & 0x7FFFFE) : 0x0200;
    var pendientes = [];
    function error(num, msg) { res.errores.push({ linea: num, msg: msg }); }

    for (var i = 0; i < lineas.length; i++) {
      var L = { num: i + 1, texto: lineas[i], dir: null, idx: null, error: null };
      res.lineas.push(L);
      var p = analizarLinea(lineas[i]);
      if (p.dir != null) {
        if (p.dir & 1) { L.error = 'la dirección ' + hex(p.dir) + ' es impar: las instrucciones van en direcciones pares.'; error(L.num, L.error); continue; }
        lc = p.dir;
      }
      for (var k = 0; k < p.etiquetas.length; k++) {
        var et = p.etiquetas[k];
        if (res.etiquetas.hasOwnProperty(et) || pendientes.indexOf(et) >= 0) {
          L.error = 'la etiqueta «' + et + '» está definida dos veces.'; error(L.num, L.error);
        } else if (regNum(et) >= 0 || CONDS.hasOwnProperty(et.toUpperCase())) {
          L.error = '«' + et + '» no puede ser una etiqueta (es un registro o una condición).'; error(L.num, L.error);
        } else pendientes.push(et);
      }
      if (p.err) { L.error = p.err; error(L.num, p.err); continue; }
      if (p.org != null) {
        if (p.org & 1) { L.error = '.org con dirección impar.'; error(L.num, L.error); }
        else lc = p.org;
        continue;
      }
      if (!p.mnem) continue;
      var fz = elegirForma(p);
      if (fz.err) { L.error = fz.err; error(L.num, fz.err); continue; }
      var d = DEF[p.mnem];
      var ins = {
        dir: lc, linea: L.num, texto: p.texto, mnem: p.mnem, suf: p.suf, clase: d.clase,
        forma: fz.forma, ops: p.ops, size: p.suf === 'B' ? 1 : 2, palabras: 1
      };
      if ((p.mnem === 'CALL' || p.mnem === 'GOTO') && fz.forma === 'X') ins.palabras = 2;
      if (p.mnem === 'BRA' && fz.forma === 'C,X') {
        var cn = p.ops[0].nombre.toUpperCase();
        ins.cond = ALIAS_COND[cn] || cn;
        ins.condTxt = cn;
      }
      var solapa = false;
      for (var w = 0; w < ins.palabras; w++) if (res.porDir[lc + 2 * w]) solapa = true;
      if (solapa) {
        L.error = 'la dirección ' + hex(lc) + ' ya está ocupada por otra instrucción.'; error(L.num, L.error); continue;
      }
      for (var q = 0; q < pendientes.length; q++) res.etiquetas[pendientes[q]] = lc;
      pendientes = [];
      ins.idx = res.instrucciones.length;
      res.instrucciones.push(ins);
      res.porDir[lc] = ins;
      if (ins.palabras === 2) res.porDir[lc + 2] = { segunda: ins };
      L.dir = lc; L.idx = ins.idx;
      lc += 2 * ins.palabras;
    }
    for (var q2 = 0; q2 < pendientes.length; q2++) res.etiquetas[pendientes[q2]] = lc;

    // Segunda pasada: resolver símbolos y validar valores.
    for (var e in res.etiquetas) if (res.etiquetas.hasOwnProperty(e) && res.nombreDir[res.etiquetas[e]] == null) res.nombreDir[res.etiquetas[e]] = e;
    res.instrucciones.forEach(function (ins) {
      var err = null;
      ins.ops.forEach(function (o, i) {
        if (err) return;
        if (o.t === 'lit' && o.sym != null) {
          var up = o.sym.toUpperCase();
          if (SFR.hasOwnProperty(up)) o.v = SFR[up];
          else if (res.etiquetas.hasOwnProperty(o.sym)) o.v = res.etiquetas[o.sym];
          else err = 'el símbolo «' + o.sym + '» no está definido.';
        } else if (o.t === 'sym') {
          if (ins.clase === 'bra' && ins.cond && i === 0) return;
          if (ins.clase === 'bra' || ins.clase === 'salto') {
            if (res.etiquetas.hasOwnProperty(o.nombre)) { o.v = res.etiquetas[o.nombre]; o.etiqueta = o.nombre; }
            else err = 'la etiqueta «' + o.nombre + '» no está definida.';
          } else {
            o.v = SFR[o.nombre.toUpperCase()];
            o.sfr = o.nombre.toUpperCase();
          }
        }
      });
      if (!err && (ins.clase === 'bra' || ins.clase === 'salto') && ins.forma !== 'R') {
        ins.destino = ins.ops[ins.ops.length - 1].v;
      }
      if (!err) err = validar(ins);
      if (err) {
        var L = res.lineas[ins.linea - 1];
        L.error = err;
        error(ins.linea, err);
      }
    });
    if (!res.instrucciones.length && !res.errores.length) error(0, 'el programa no tiene ninguna instrucción.');
    res.errores.sort(function (a, b) { return a.linea - b.linea; });
    res.inicio = res.instrucciones.length ? res.instrucciones[0].dir : lc;
    return res;
  }

  // ===================================================================== CPU
  function crear(opc) {
    opc = opc || {};
    var W = [], SR = 0, PC = 0, SPLIM = null, mem = new Uint8Array(65536);
    var prog = null, rep = 0, repIns = null;
    var hist = [], reg = null, usadas = [], usadasSet = {};
    var detenido = null, bucle = false, pasos = 0, ultimo = null, pilaUsada = false;
    var motivos = {}, expl = {};

    function num(v, def) {
      if (v == null || v === '') return def;
      if (typeof v === 'number') return v;
      var n = leerNum(v);
      return isNaN(n) ? def : n;
    }

    // ---- acceso a memoria ----
    function marcarUso(a) {
      var w = a & 0xFFFE;
      if (!usadasSet[w]) { usadasSet[w] = 1; usadas.push(w); }
    }
    function rdB(a) {
      a &= 0xFFFF;
      if (a < 0x20) { var r = W[a >> 1]; return (a & 1) ? (r >> 8) & 0xFF : r & 0xFF; }
      if (a === 0x20 || a === 0x21) { var s = SPLIM || 0; return (a & 1) ? (s >> 8) & 0xFF : s & 0xFF; }
      if (a === 0x42 || a === 0x43) return (a & 1) ? (SR >> 8) & 0xFF : SR & 0xFF;
      marcarUso(a);
      return mem[a];
    }
    function wrB(a, v) {
      a &= 0xFFFF; v &= 0xFF;
      if (a < 0x20) { var n = a >> 1; W[n] = (a & 1) ? (W[n] & 0x00FF) | (v << 8) : (W[n] & 0xFF00) | v; return; }
      if (a === 0x20 || a === 0x21) { var s = SPLIM || 0; SPLIM = (a & 1) ? (s & 0xFF) | (v << 8) : (s & 0xFF00) | v; return; }
      if (a === 0x42 || a === 0x43) { SR = (a & 1) ? (SR & 0xFF) | (v << 8) : (SR & 0xFF00) | v; return; }
      marcarUso(a);
      if (reg) reg.mem.push([a, mem[a]]);
      mem[a] = v;
    }
    function rdW(a) {
      a &= 0xFFFF;
      if (a & 1) trapErr('Error de dirección (address error trap): se intenta leer una word en la dirección impar ' + hex(a) + '.');
      return rdB(a) | (rdB(a + 1) << 8);
    }
    function wrW(a, v) {
      a &= 0xFFFF;
      if (a & 1) trapErr('Error de dirección (address error trap): se intenta escribir una word en la dirección impar ' + hex(a) + '.');
      wrB(a, v & 0xFF); wrB(a + 1, (v >> 8) & 0xFF);
    }
    function setW(n, v, motivo) { W[n] = v & 0xFFFF; if (motivo) motivos[n] = motivo; }

    // Dirección efectiva (aplica pre/post modificación del puntero).
    function ea(op, sz) {
      if (op.t === 'reg') return { reg: op.n };
      if (op.t === 'num' || op.t === 'sym') return { mem: op.v & 0xFFFF };
      var n = op.n, a, w = 'W' + n;
      switch (op.modo) {
        case 'ind': a = W[n]; break;
        case 'pos+': a = W[n]; setW(n, W[n] + sz, '[' + w + '++]: post-incremento de ' + sz); break;
        case 'pos-': a = W[n]; setW(n, W[n] - sz, '[' + w + '--]: post-decremento de ' + sz); break;
        case 'pre+': setW(n, W[n] + sz, '[++' + w + ']: pre-incremento de ' + sz); a = W[n]; break;
        case 'pre-': setW(n, W[n] - sz, '[--' + w + ']: pre-decremento de ' + sz); a = W[n]; break;
        case 'idx': a = W[n] + W[op.nb]; break;
      }
      return { mem: a & 0xFFFF };
    }
    function rd(loc, sz) {
      if (loc.reg != null) return sz === 1 ? W[loc.reg] & 0xFF : W[loc.reg];
      return sz === 1 ? rdB(loc.mem) : rdW(loc.mem);
    }
    function wr(loc, sz, v) {
      if (loc.reg != null) W[loc.reg] = sz === 1 ? (W[loc.reg] & 0xFF00) | (v & 0xFF) : v & 0xFFFF;
      else if (sz === 1) wrB(loc.mem, v);
      else wrW(loc.mem, v);
    }
    function nomLoc(loc, sz) {
      if (loc.reg != null) return 'W' + loc.reg + (sz === 1 ? '<7:0>' : '');
      return '(' + hex(loc.mem) + ')' + (sz === 1 ? ' [byte]' : '');
    }

    // ---- flags ----
    function fl(b) { return (SR & b) ? 1 : 0; }
    function pon(b, v) { SR = v ? (SR | b) : (SR & ~b & 0xFFFF); }
    function flagsObj() { return { C: fl(B_C), Z: fl(B_Z), OV: fl(B_OV), N: fl(B_N), DC: fl(B_DC) }; }

    function ponNZ(r, bits) {
      var msb = bits === 8 ? 0x80 : 0x8000, n = (r & msb) ? 1 : 0, z = (r & ((msb << 1) - 1)) === 0 ? 1 : 0;
      pon(B_N, n); pon(B_Z, z);
      expl.N = 'N = ' + n + ': el bit ' + (bits - 1) + ' (signo) del resultado ' + hx(r, bits) + ' vale ' + n + '.';
      expl.Z = z ? 'Z = 1: el resultado es 0.' : 'Z = 0: el resultado no es 0.';
    }

    // Suma o resta con todos los flags. ci: acarreo de entrada (en resta,
    // 1 = sin préstamo). sticky: Z solo puede bajar (ADDC/SUBB/CPB).
    function aritmetica(a, b, ci, bits, resta, sticky) {
      var mask = bits === 8 ? 0xFF : 0xFFFF, msb = bits === 8 ? 0x80 : 0x8000, dcb = bits === 8 ? 0x10 : 0x100;
      a &= mask; b &= mask;
      var bb = resta ? (~b) & mask : b;
      var s = a + bb + ci, r = s & mask;
      var C = s > mask ? 1 : 0;
      var DC = ((a & (dcb - 1)) + (bb & (dcb - 1)) + ci) >= dcb ? 1 : 0;
      var OV = ((~(a ^ bb)) & (a ^ r) & msb) ? 1 : 0;
      var N = (r & msb) ? 1 : 0;
      var zPrev = fl(B_Z);
      var Z = sticky ? ((r === 0 && zPrev) ? 1 : 0) : (r === 0 ? 1 : 0);
      pon(B_C, C); pon(B_DC, DC); pon(B_OV, OV); pon(B_N, N); pon(B_Z, Z);

      var extra = resta ? 1 - ci : ci;
      var hb = bits === 8 ? 3 : 5;
      var bitDC = bits === 8 ? 3 : 7;
      var parte = bits === 8 ? 'nibble bajo' : 'byte bajo';
      if (!resta) {
        expl.C = C
          ? 'C = 1: la suma sin signo ' + hx(a, bits) + ' + ' + hx(b, bits) + (extra ? ' + 1' : '') + ' = ' + hex(s, hb) + ' no cabe en ' + bits + ' bits: sale un acarreo del bit ' + (bits - 1) + '.'
          : 'C = 0: la suma sin signo cabe en ' + bits + ' bits (no hay acarreo del bit ' + (bits - 1) + ').';
        expl.DC = 'DC = ' + DC + ': ' + (DC ? 'hay' : 'no hay') + ' acarreo del bit ' + bitDC + ' al ' + (bitDC + 1) + ' (' + parte + ').';
      } else {
        var cmpTxt = hx(a, bits) + (C ? ' ≥ ' : ' < ') + hx(b, bits) + (extra ? ' + 1' : '');
        expl.C = C
          ? 'C = 1: no hay préstamo (' + cmpTxt + ' sin signo). En el dsPIC, tras una resta C = 1 significa «sin préstamo».'
          : 'C = 0: hay préstamo (' + cmpTxt + ' sin signo).';
        expl.DC = 'DC = ' + DC + ': ' + (DC ? 'no hay' : 'hay') + ' préstamo del bit ' + (bitDC + 1) + ' al ' + bitDC + ' (' + parte + ').';
      }
      var sa = sgn(a, bits), sb = sgn(b, bits);
      var exacto = resta ? sa - sb - extra : sa + sb + extra;
      var expr = dec(sa) + (resta ? ' − ' : ' + ') + decP(sb) + (extra ? (resta ? ' − 1' : ' + 1') : '') + ' = ' + dec(exacto);
      var rango = bits === 8 ? '−128 … 127' : '−32768 … 32767';
      expl.OV = OV
        ? 'OV = 1: con signo, ' + expr + ', que no cabe en ' + bits + ' bits (' + rango + '): el resultado ' + hx(r, bits) + ' (' + dec(sgn(r, bits)) + ') sale con el signo cambiado.'
        : 'OV = 0: con signo, ' + expr + ', que cabe en ' + bits + ' bits.';
      expl.N = 'N = ' + N + ': el bit ' + (bits - 1) + ' (signo) del resultado ' + hx(r, bits) + ' vale ' + N + '.';
      if (!sticky) expl.Z = Z ? 'Z = 1: el resultado es 0.' : 'Z = 0: el resultado no es 0.';
      else if (r !== 0) expl.Z = 'Z = 0: el resultado no es 0.';
      else if (Z) expl.Z = 'Z = 1: el resultado es 0 y Z ya valía 1 (en ADDC/SUBB/CPB Z es «sticky»: solo puede pasar a 0).';
      else expl.Z = 'Z = 0: aunque el resultado es 0, Z no sube porque ya valía 0 (Z «sticky» en ADDC/SUBB/CPB: indica cero en toda la operación multipalabra).';
      return r;
    }

    // ---- pila ----
    function push16(v) {
      var sp = W[15];
      wrW(sp, v);
      setW(15, sp + 2, 'puntero de pila (W15)');
      pilaUsada = true;
      if (SPLIM != null && W[15] > SPLIM) trapErr('Error de pila (stack error trap): W15 = ' + hex(W[15]) + ' supera SPLIM = ' + hex(SPLIM) + '.');
    }
    function pop16() {
      var sp = (W[15] - 2) & 0xFFFF;
      if (sp < PILA_MIN) trapErr('Error de pila (stack error trap): la pila está vacía; W15 bajaría a ' + hex(sp) + ', por debajo de 0x0800.');
      setW(15, sp, 'puntero de pila (W15)');
      pilaUsada = true;
      return rdW(sp);
    }

    function nomDir(d) {
      var n = prog && prog.nombreDir[d];
      return n ? n + ' (' + hex(d) + ')' : hex(d);
    }

    // ---- ejecución de una instrucción ----
    function ejec(ins) {
      var o = ins.ops, sz = ins.size, bits = sz * 8, m = ins.mnem, f = ins.forma, d = {};
      var sig = PC + 2 * ins.palabras;
      var a, b, x, r, src, dst, v, loc;
      switch (ins.clase) {
        case 'ar2': {
          switch (f) {
            case 'L,R': dst = { reg: o[1].n }; a = rd(dst, sz); b = o[0].v; break;
            case 'R,L,S': a = rd({ reg: o[0].n }, sz); b = o[1].v; dst = ea(o[2], sz); break;
            case 'R,S,S': a = rd({ reg: o[0].n }, sz); b = rd(ea(o[1], sz), sz); dst = ea(o[2], sz); break;
            case 'F': dst = { mem: o[0].v }; a = rd(dst, sz); b = rd({ reg: 0 }, sz); break;
            case 'F,G': a = rd({ mem: o[0].v }, sz); b = rd({ reg: 0 }, sz); dst = { reg: 0 }; break;
          }
          if (m === 'SUBR' || m === 'SUBBR') { x = a; a = b; b = x; }
          var c0 = fl(B_C), sim;
          switch (m) {
            case 'ADD': r = aritmetica(a, b, 0, bits, false); sim = ' + '; break;
            case 'ADDC': r = aritmetica(a, b, c0, bits, false, true); sim = ' + '; break;
            case 'SUB': case 'SUBR': r = aritmetica(a, b, 1, bits, true); sim = ' − '; break;
            case 'SUBB': case 'SUBBR': r = aritmetica(a, b, c0, bits, true, true); sim = ' − '; break;
            case 'AND': r = a & b; sim = ' AND '; ponNZ(r, bits); break;
            case 'IOR': r = a | b; sim = ' IOR '; ponNZ(r, bits); break;
            case 'XOR': r = a ^ b; sim = ' XOR '; ponNZ(r, bits); break;
          }
          var cola = '';
          if (m === 'ADDC') cola = ' + C(' + c0 + ')';
          if (m === 'SUBB' || m === 'SUBBR') cola = ' − !C(' + (1 - c0) + ')';
          d.op = nomLoc(dst, sz) + ' ← ' + hx(a, bits) + sim + hx(b, bits) + cola + ' = ' + hx(r, bits);
          if (m === 'AND' || m === 'IOR' || m === 'XOR') {
            d.bin = [bin(a, bits) + '   ' + hx(a, bits), bin(b, bits) + '   ' + hx(b, bits) + '   ' + m, bin(r, bits) + '   ' + hx(r, bits)];
          }
          wr(dst, sz, r);
          if (sz === 1 && dst.reg != null) d.nota = 'Operación de byte: solo cambia el byte bajo de W' + dst.reg + '; el byte alto se conserva.';
          break;
        }
        case 'una': {
          if (f === 'R,R,R' || f === 'R,L,R') {
            x = W[o[0].n];
            var k = f === 'R,L,R' ? o[1].v : (W[o[1].n] & 0x1F);
            if (m === 'SL') r = k > 15 ? 0 : (x << k) & 0xFFFF;
            else if (m === 'LSR') r = k > 15 ? 0 : x >>> k;
            else r = k > 15 ? ((x & 0x8000) ? 0xFFFF : 0) : (sgn(x, 16) >> k) & 0xFFFF;
            ponNZ(r, 16);
            W[o[2].n] = r;
            var nomSh = { SL: '<<', LSR: '>>', ASR: '>>' }[m];
            d.op = 'W' + o[2].n + ' ← ' + hex(x) + ' ' + nomSh + ' ' + k + ' = ' + hex(r) + (m === 'ASR' ? ' (aritmético: entra el bit de signo)' : '');
            d.bin = [bin(x, 16) + '   ' + hex(x), bin(r, 16) + '   ' + hex(r) + '   (' + m + ' ' + k + ')'];
            break;
          }
          if (f === 'S,S') { src = ea(o[0], sz); x = rd(src, sz); dst = ea(o[1], sz); }
          else if (f === 'R') { src = dst = { reg: o[0].n }; x = rd(src, sz); }
          else if (f === 'F') { src = dst = { mem: o[0].v }; x = rd(src, sz); }
          else { src = { mem: o[0].v }; x = rd(src, sz); dst = { reg: 0 }; }
          var msb = bits === 8 ? 0x80 : 0x8000, mask = bits === 8 ? 0xFF : 0xFFFF;
          var cIn = fl(B_C), sale;
          switch (m) {
            case 'INC': r = aritmetica(x, 1, 0, bits, false); d.op = hx(x, bits) + ' + 1 = ' + hx(r, bits); break;
            case 'INC2': r = aritmetica(x, 2, 0, bits, false); d.op = hx(x, bits) + ' + 2 = ' + hx(r, bits); break;
            case 'DEC': r = aritmetica(x, 1, 1, bits, true); d.op = hx(x, bits) + ' − 1 = ' + hx(r, bits); break;
            case 'DEC2': r = aritmetica(x, 2, 1, bits, true); d.op = hx(x, bits) + ' − 2 = ' + hx(r, bits); break;
            case 'NEG': r = aritmetica(0, x, 1, bits, true); d.op = '0 − ' + hx(x, bits) + ' = ' + hx(r, bits) + ' (complemento a 2: ' + dec(sgn(x, bits)) + ' → ' + dec(sgn(r, bits)) + ')'; break;
            case 'COM': r = (~x) & mask; ponNZ(r, bits); d.op = 'NOT ' + hx(x, bits) + ' = ' + hx(r, bits) + ' (complemento a 1)'; d.bin = [bin(x, bits), bin(r, bits)]; break;
            case 'SL':
              sale = (x & msb) ? 1 : 0; r = (x << 1) & mask;
              pon(B_C, sale); pon(B_OV, 0); ponNZ(r, bits);
              expl.C = 'C = ' + sale + ': es el bit ' + (bits - 1) + ' que sale por la izquierda.';
              expl.OV = 'OV = 0: los desplazamientos de un bit lo ponen a 0.';
              d.op = hx(x, bits) + ' << 1 = ' + hx(r, bits); d.bin = [bin(x, bits), bin(r, bits) + '   C = ' + sale]; break;
            case 'LSR':
              sale = x & 1; r = x >>> 1;
              pon(B_C, sale); pon(B_OV, 0); ponNZ(r, bits);
              expl.C = 'C = ' + sale + ': es el bit 0 que sale por la derecha.';
              expl.OV = 'OV = 0: los desplazamientos de un bit lo ponen a 0.';
              d.op = hx(x, bits) + ' >> 1 = ' + hx(r, bits) + ' (lógico: entra un 0)'; d.bin = [bin(x, bits), bin(r, bits) + '   C = ' + sale]; break;
            case 'ASR':
              sale = x & 1; r = (x >> 1) | (x & msb);
              pon(B_C, sale); pon(B_OV, 0); ponNZ(r, bits);
              expl.C = 'C = ' + sale + ': es el bit 0 que sale por la derecha.';
              expl.OV = 'OV = 0: los desplazamientos de un bit lo ponen a 0.';
              d.op = hx(x, bits) + ' >> 1 = ' + hx(r, bits) + ' (aritmético: se repite el bit de signo)'; d.bin = [bin(x, bits), bin(r, bits) + '   C = ' + sale]; break;
            case 'RLC':
              sale = (x & msb) ? 1 : 0; r = ((x << 1) | cIn) & mask;
              pon(B_C, sale); ponNZ(r, bits);
              expl.C = 'C = ' + sale + ': es el bit ' + (bits - 1) + ' que sale por la izquierda (el C anterior, ' + cIn + ', entra por el bit 0).';
              d.op = 'rota a la izquierda a través de C: ' + hx(x, bits) + ' → ' + hx(r, bits);
              d.bin = ['C = ' + cIn + '   ' + bin(x, bits), 'C = ' + sale + '   ' + bin(r, bits)]; break;
            case 'RRC':
              sale = x & 1; r = (x >>> 1) | (cIn ? msb : 0);
              pon(B_C, sale); ponNZ(r, bits);
              expl.C = 'C = ' + sale + ': es el bit 0 que sale por la derecha (el C anterior, ' + cIn + ', entra por el bit ' + (bits - 1) + ').';
              d.op = 'rota a la derecha a través de C: ' + hx(x, bits) + ' → ' + hx(r, bits);
              d.bin = [bin(x, bits) + '   C = ' + cIn, bin(r, bits) + '   C = ' + sale]; break;
            case 'RLNC':
              r = ((x << 1) | ((x & msb) ? 1 : 0)) & mask; ponNZ(r, bits);
              d.op = 'rota a la izquierda sin C: ' + hx(x, bits) + ' → ' + hx(r, bits) + ' (el bit ' + (bits - 1) + ' vuelve por el bit 0)';
              d.bin = [bin(x, bits), bin(r, bits)]; break;
            case 'RRNC':
              r = (x >>> 1) | ((x & 1) ? msb : 0); ponNZ(r, bits);
              d.op = 'rota a la derecha sin C: ' + hx(x, bits) + ' → ' + hx(r, bits) + ' (el bit 0 vuelve por el bit ' + (bits - 1) + ')';
              d.bin = [bin(x, bits), bin(r, bits)]; break;
          }
          d.op = nomLoc(dst, sz) + ' ← ' + d.op;
          wr(dst, sz, r);
          if (sz === 1 && dst.reg != null) d.nota = 'Operación de byte: solo cambia el byte bajo de W' + dst.reg + '; el byte alto se conserva.';
          break;
        }
        case 'clr': {
          loc = f === 'F' ? { mem: o[0].v } : ea(o[0], sz);
          v = m === 'CLR' ? 0 : (sz === 1 ? 0xFF : 0xFFFF);
          wr(loc, sz, v);
          d.op = nomLoc(loc, sz) + ' ← ' + hx(v, bits) + ' (' + m + ' no modifica los flags)';
          break;
        }
        case 'mov': {
          if (f === 'L,R') { v = o[0].v & (sz === 1 ? 0xFF : 0xFFFF); dst = { reg: o[1].n }; wr(dst, sz, v); d.op = nomLoc(dst, sz) + ' ← ' + hx(v, bits); }
          else if (f === 'F,R') { src = { mem: o[0].v }; v = rd(src, sz); dst = { reg: o[1].n }; wr(dst, sz, v); d.op = nomLoc(dst, sz) + ' ← ' + nomLoc(src, sz) + (o[0].sfr ? ' = ' + o[0].sfr : '') + ' = ' + hx(v, bits); }
          else if (f === 'R,F') { src = { reg: o[0].n }; v = rd(src, sz); dst = { mem: o[1].v }; wr(dst, sz, v); d.op = nomLoc(dst, sz) + (o[1].sfr ? ' = ' + o[1].sfr : '') + ' ← ' + nomLoc(src, sz) + ' = ' + hx(v, bits); }
          else if (f === 'F') { src = { mem: o[0].v }; v = rd(src, sz); wr(src, sz, v); ponNZ(v, bits); d.op = nomLoc(src, sz) + ' ← ' + nomLoc(src, sz) + ' = ' + hx(v, bits) + ' (solo para actualizar N y Z)'; }
          else { src = ea(o[0], sz); v = rd(src, sz); dst = ea(o[1], sz); wr(dst, sz, v); d.op = nomLoc(dst, sz) + ' ← ' + nomLoc(src, sz) + ' = ' + hx(v, bits); }
          if (sz === 1 && dst && dst.reg != null) d.nota = 'MOV.B a un registro: solo cambia su byte bajo.';
          break;
        }
        case 'pila': {
          if (m === 'PUSH') {
            var sp0 = W[15];
            v = f === 'F' ? rdW(o[0].v) : rd(ea(o[0], 2), 2);
            push16(v);
            d.op = '(' + hex(sp0) + ') ← ' + hex(v) + ' y W15 = ' + hex(sp0) + ' + 2 = ' + hex(W[15]);
          } else {
            v = pop16();
            loc = f === 'F' ? { mem: o[0].v } : ea(o[0], 2);
            wr(loc, 2, v);
            d.op = 'W15 = W15 − 2 = ' + hex(W[15]) + ' y ' + nomLoc(loc, 2) + ' ← (' + hex(W[15]) + ') = ' + hex(v);
            d.nota = 'POP no borra el dato de la memoria: solo mueve W15. El valor sigue en (' + hex(W[15]) + ') hasta que otro PUSH o CALL lo sobrescriba.';
          }
          break;
        }
        case 'ext': {
          src = ea(o[0], 1); x = rd(src, 1);
          if (m === 'SE') {
            r = (x & 0x80) ? (x | 0xFF00) : x;
            var nS = (r & 0x8000) ? 1 : 0;
            pon(B_N, nS); pon(B_Z, r === 0); pon(B_C, !nS);
            expl.N = 'N = ' + nS + ': el bit 15 del resultado ' + hex(r) + ' vale ' + nS + '.';
            expl.Z = r === 0 ? 'Z = 1: el resultado es 0.' : 'Z = 0: el resultado no es 0.';
            expl.C = 'C = ' + (1 - nS) + ': SE pone C = complemento de N.';
            d.op = 'W' + o[1].n + ' ← ' + hex(x, 2) + ' extendido con signo = ' + hex(r) + ' (' + dec(sgn(r, 16)) + ')';
          } else {
            r = x;
            pon(B_N, 0); pon(B_Z, r === 0); pon(B_C, 1);
            expl.N = 'N = 0: tras extender con ceros el bit 15 siempre es 0.';
            expl.Z = r === 0 ? 'Z = 1: el resultado es 0.' : 'Z = 0: el resultado no es 0.';
            expl.C = 'C = 1: ZE siempre pone C a 1.';
            d.op = 'W' + o[1].n + ' ← ' + hex(x, 2) + ' extendido con ceros = ' + hex(r) + ' (' + r + ')';
          }
          W[o[1].n] = r;
          break;
        }
        case 'cp': case 'cp0': {
          if (ins.clase === 'cp0') {
            loc = f === 'F' ? { mem: o[0].v } : ea(o[0], sz);
            a = rd(loc, sz); b = 0;
            aritmetica(a, 0, 1, bits, true);
            d.op = 'compara ' + nomLoc(loc, sz) + ' = ' + hx(a, bits) + ' con 0 (resta ' + hx(a, bits) + ' − 0, sin guardar el resultado)';
          } else {
            if (f === 'R,L') { a = rd({ reg: o[0].n }, sz); b = o[1].v; }
            else if (f === 'R,S') { a = rd({ reg: o[0].n }, sz); b = rd(ea(o[1], sz), sz); }
            else { a = rd({ mem: o[0].v }, sz); b = rd({ reg: 0 }, sz); }
            var cb = fl(B_C);
            r = m === 'CPB' ? aritmetica(a, b, cb, bits, true, true) : aritmetica(a, b, 1, bits, true);
            d.op = 'resta ' + hx(a, bits) + ' − ' + hx(b, bits) + (m === 'CPB' ? ' − !C(' + (1 - cb) + ')' : '') + ' = ' + hx(r, bits) + ' solo para actualizar los flags (no guarda el resultado)';
          }
          break;
        }
        case 'mul': {
          var p, sa_, sb_;
          if (f === 'F') {
            a = rdW(o[0].v); b = W[0]; p = a * b;
            W[2] = p & 0xFFFF; W[3] = Math.floor(p / 65536) & 0xFFFF;
            d.op = 'W3:W2 ← ' + hex(a) + ' × WREG ' + hex(b) + ' = ' + p + ' = ' + hex(p >>> 0, 8);
          } else {
            a = W[o[0].n];
            b = f === 'R,L,R' ? o[1].v : rd(ea(o[1], 2), 2);
            var s1 = ins.suf.charAt(0) === 'S', s2 = ins.suf.charAt(1) === 'S';
            sa_ = s1 ? sgn(a, 16) : a; sb_ = s2 ? sgn(b, 16) : b;
            p = sa_ * sb_;
            var nd = o[2].n;
            W[nd] = p & 0xFFFF; W[nd + 1] = Math.floor(p / 65536) & 0xFFFF;
            d.op = 'W' + (nd + 1) + ':W' + nd + ' ← ' + dec(sa_) + ' × ' + decP(sb_) + ' = ' + dec(p) + ' = ' + hex(W[nd + 1]) + ':' + hex(W[nd]).slice(2);
            d.nota = 'MUL no modifica ningún flag. El resultado de 32 bits ocupa dos registros: W' + nd + ' (parte baja) y W' + (nd + 1) + ' (parte alta).';
          }
          break;
        }
        case 'div': {
          var mm = o[0].n, nn = o[1].n, con = ins.suf.charAt(0) === 'S', doble = ins.suf.charAt(1) === 'D';
          var dvd, dvs, q, rr;
          if (doble) { dvd = W[mm + 1] * 65536 + W[mm]; if (con && (W[mm + 1] & 0x8000)) dvd -= 4294967296; }
          else dvd = con ? sgn(W[mm], 16) : W[mm];
          dvs = con ? sgn(W[nn], 16) : W[nn];
          if (dvs === 0) trapErr('Error matemático (math error trap): división por cero (W' + nn + ' = 0).');
          q = dvd / dvs; q = q < 0 ? Math.ceil(q) : Math.floor(q);
          rr = dvd - q * dvs;
          var ovf = con ? (q < -32768 || q > 32767) : (q > 65535);
          W[0] = ((q % 65536) + 65536) % 65536;
          W[1] = ((rr % 65536) + 65536) % 65536;
          pon(B_OV, ovf); pon(B_Z, rr === 0); pon(B_N, con && rr < 0);
          expl.OV = ovf ? 'OV = 1: el cociente ' + dec(q) + ' no cabe en 16 bits.' : 'OV = 0: el cociente cabe en 16 bits.';
          expl.Z = rr === 0 ? 'Z = 1: el resto es 0.' : 'Z = 0: el resto no es 0.';
          expl.N = con ? (rr < 0 ? 'N = 1: el resto es negativo.' : 'N = 0: el resto no es negativo.') : 'N = 0: en DIV.U el resto nunca es negativo.';
          expl.C = 'C: el algoritmo iterativo de división lo usa internamente; su valor final no debe usarse (aquí se deja como estaba).';
          d.op = dec(dvd) + ' / ' + decP(dvs) + ' → W0 = cociente = ' + dec(q) + ' (' + hex(W[0]) + '), W1 = resto = ' + dec(rr) + ' (' + hex(W[1]) + ')';
          break;
        }
        case 'repeat': {
          var cnt = f === 'L' ? o[0].v : (W[o[0].n] & 0x3FFF);
          rep = cnt + 1; repIns = ins;
          pon(B_RA, 1);
          expl.RA = 'RA = 1: hay un bucle REPEAT en curso.';
          d.op = 'la siguiente instrucción se ejecutará ' + (cnt + 1) + ' veces (1 + ' + cnt + ')';
          break;
        }
        case 'bra': {
          var dest = ins.destino;
          if (!ins.cond) {
            d.pc = dest;
            d.salto = 'Salto incondicional a ' + nomDir(dest) + '.';
            d.op = 'PC ← ' + nomDir(dest);
          } else {
            var cd = CONDS[ins.cond], st = flagsObj();
            var t = !!cd.f({ C: st.C, Z: st.Z, N: st.N, OV: st.OV });
            var ahora = cd.usa.map(function (k) { return k + ' = ' + st[k]; }).join(', ');
            var alias = ins.condTxt !== ins.cond ? ' (' + ins.condTxt + ' es el nombre del libro; el ensamblador usa ' + ins.cond + ')' : '';
            d.salto = (t ? 'Salta' : 'No salta') + ': BRA ' + ins.cond + alias + ' comprueba ' + cd.txt + ' («' + cd.sig + '») y ahora ' + ahora + '. ' +
              (t ? 'El PC pasa a ' + nomDir(dest) + '.' : 'Sigue con la instrucción siguiente (' + hex(sig) + ').');
            d.op = 'BRA ' + ins.cond + ': condición ' + (t ? 'verdadera' : 'falsa');
            if (t) d.pc = dest;
            if (/U$|^N?C$/.test(ins.cond)) d.nota = 'Recuerda: tras CP o SUB, C = 1 significa que NO hubo préstamo (minuendo ≥ sustraendo sin signo).';
          }
          if (d.pc === ins.dir) d.bucle = true;
          break;
        }
        case 'salto': {
          var to;
          if (m === 'GOTO') {
            to = f === 'X' ? ins.destino : W[o[0].n] & 0xFFFE;
            d.pc = to; d.op = 'PC ← ' + nomDir(to);
            if (to === ins.dir) d.bucle = true;
          } else {
            var ret = sig;
            if (f === 'X') to = ins.destino;
            else if (m === 'CALL') to = W[o[0].n] & 0xFFFE;
            else to = (sig + 2 * sgn(W[o[0].n], 16)) & 0x7FFFFE;
            var sp1 = W[15];
            push16(ret & 0xFFFF);
            push16((ret >>> 16) & 0x7F);
            d.pc = to;
            d.op = 'apila la dirección de retorno ' + hex(ret) + ' en dos words — (' + hex(sp1) + ') ← ' + hex(ret & 0xFFFF) + ' (parte baja) y (' + hex(sp1 + 2) + ') ← ' + hex((ret >>> 16) & 0x7F) + ' (parte alta) —, W15 = ' + hex(W[15]) + ' y salta a ' + nomDir(to);
            d.nota = m === 'CALL' && f === 'X' ? 'CALL ocupa 2 words de programa: la dirección de retorno es PC + 4.' : 'Esta forma ocupa 1 word: la dirección de retorno es PC + 2.';
          }
          break;
        }
        case 'nada': {
          if (m === 'RETURN') {
            var sp2 = W[15];
            var hi = pop16(), lo = pop16();
            d.pc = ((hi & 0x7F) << 16) | lo;
            d.op = 'desapila la dirección de retorno: (' + hex(sp2 - 2) + ') = ' + hex(hi) + ' (parte alta), (' + hex(sp2 - 4) + ') = ' + hex(lo) + ' (parte baja); W15 = ' + hex(W[15]) + ' y PC ← ' + nomDir(d.pc);
          } else d.op = 'no hace nada (solo PC + 2)';
          break;
        }
        case 'bit': {
          var bn = o[1].v, mk = 1 << bn;
          loc = f === 'F,L' ? { mem: o[0].v } : ea(o[0], sz);
          v = rd(loc, sz);
          var bv = (v & mk) ? 1 : 0;
          if (m === 'BSET' || m === 'BCLR' || m === 'BTG') {
            r = m === 'BSET' ? v | mk : (m === 'BCLR' ? v & ~mk : v ^ mk);
            wr(loc, sz, r);
            d.op = nomLoc(loc, sz) + ' ← ' + hx(v, bits) + ' con el bit ' + bn + (m === 'BSET' ? ' a 1' : (m === 'BCLR' ? ' a 0' : ' invertido')) + ' = ' + hx(r, bits) + ' (no modifica flags)';
            d.bin = [bin(v, bits), bin(r, bits)];
          } else if (m === 'BTST') {
            if (ins.suf === 'C' && f === 'S,L') { pon(B_C, bv); expl.C = 'C = ' + bv + ': copia del bit ' + bn + ' de ' + nomLoc(loc, sz) + '.'; }
            else { pon(B_Z, !bv); expl.Z = 'Z = ' + (1 - bv) + ': complemento del bit ' + bn + ' (que vale ' + bv + ').'; }
            d.op = 'prueba el bit ' + bn + ' de ' + nomLoc(loc, sz) + ' = ' + hx(v, bits) + ': vale ' + bv;
          } else {
            var salta = m === 'BTSC' ? !bv : !!bv;
            var nx = prog && prog.porDir[sig];
            if (salta) d.pc = sig + 2 * (nx && nx.palabras ? nx.palabras : 1);
            d.op = 'el bit ' + bn + ' de ' + nomLoc(loc, sz) + ' vale ' + bv;
            d.salto = (salta ? 'Se salta la instrucción siguiente' : 'No se salta') + ' (' + m + ' salta si el bit vale ' + (m === 'BTSC' ? '0' : '1') + ').';
          }
          break;
        }
      }
      PC = (d.pc != null ? d.pc : sig) & 0x7FFFFE;
      return d;
    }

    var NO_REPETIBLE = { bra: 1, salto: 1, repeat: 1 };

    function paso() {
      if (!prog) return { error: 'No hay programa cargado.' };
      var finAhora = fin();
      if (finAhora && finAhora.tipo !== 'bucle') return { fin: finAhora };
      var ins = prog.porDir[PC];
      reg = {
        W: W.slice(), SR: SR, PC: PC, SPLIM: SPLIM, rep: rep, repIns: repIns, mem: [], usadas: usadas.length,
        ultimo: ultimo, pasos: pasos, detenido: detenido, bucle: bucle, pilaUsada: pilaUsada
      };
      motivos = {}; expl = {};
      var info = { dir: PC, ins: ins, notas: [], veces: 1, flags: null };
      var srAntes = SR;
      try {
        var n = 1, d;
        if (rep > 0) { n = rep; rep = 0; }
        if (n > 1 || reg.rep > 0) {
          if (NO_REPETIBLE[ins.clase] || ins.mnem === 'RETURN' || ins.mnem === 'BTSC' || ins.mnem === 'BTSS') {
            trapErr('REPEAT no puede repetir ' + ins.mnem + ': solo se repiten instrucciones que no cambian el flujo del programa.');
          }
          if (ins.clase === 'div') {
            d = ejec(ins);
            info.veces = n;
            info.notas.push(n === 18
              ? 'REPEAT #17 hace que ' + ins.mnem + '.' + ins.suf + ' se ejecute 18 veces (1 + 17): la división es iterativa y calcula un bit del cociente en cada iteración. El simulador muestra las 18 iteraciones como un solo paso.'
              : 'Aviso: DIV necesita exactamente 18 iteraciones (REPEAT #17) y aquí hay ' + n + ' (REPEAT #' + (n - 1) + '). En el micro el resultado no sería válido; el simulador muestra el resultado correcto.');
          } else {
            var pc0 = PC;
            for (var k = 0; k < n; k++) { PC = pc0; d = ejec(ins); }
            info.veces = n;
            if (n > 1) info.notas.push('Se ha ejecutado ' + n + ' veces seguidas por el REPEAT anterior (como un solo paso). Los flags y la operación mostrados son los de la última repetición.');
          }
          pon(B_RA, 0);
          expl.RA = 'RA = 0: el bucle REPEAT ha terminado.';
          repIns = null;
        } else {
          d = ejec(ins);
          if (ins.clase === 'div') info.notas.push('Aviso: DIV debe ir precedida de REPEAT #17 (18 iteraciones). Sin ella, en el micro el resultado no sería válido; el simulador muestra el resultado correcto.');
        }
        info.op = d.op; info.bin = d.bin; info.salto = d.salto;
        if (d.nota) info.notas.push(d.nota);
        bucle = !!d.bucle;
      } catch (e) {
        if (!e || !e.trap) throw e;
        for (var j = reg.mem.length - 1; j >= 0; j--) mem[reg.mem[j][0]] = reg.mem[j][1];
        W = reg.W.slice(); SR = reg.SR; PC = reg.PC; SPLIM = reg.SPLIM; rep = reg.rep; repIns = reg.repIns;
        info.error = e.trap;
        info.cambios = []; info.memCambiada = {}; info.bytesCambiados = {};
        info.flags = {};
        info.srAntes = SR; info.srDespues = SR;
        detenido = e.trap;
        reg.mem = [];
        hist.push(reg); reg = null;
        ultimo = info;
        return info;
      }
      // Diferencias para la interfaz.
      var cambios = [];
      for (var i = 0; i < 16; i++) {
        if (W[i] !== reg.W[i]) cambios.push({ nombre: 'W' + i, antes: reg.W[i], despues: W[i], motivo: motivos[i] || '' });
      }
      if (SPLIM !== reg.SPLIM) cambios.push({ nombre: 'SPLIM', antes: reg.SPLIM || 0, despues: SPLIM || 0, motivo: '' });
      if (SR !== srAntes) cambios.push({ nombre: 'SR', antes: srAntes, despues: SR, motivo: '' });
      var viejo = {}, memC = {}, bytesC = {};
      reg.mem.forEach(function (e) { if (!(e[0] in viejo)) viejo[e[0]] = e[1]; });
      Object.keys(viejo).forEach(function (k) {
        var a = +k;
        if (viejo[a] !== mem[a]) bytesC[a] = true;
      });
      Object.keys(bytesC).forEach(function (k) {
        var wa = (+k) & 0xFFFE;
        if (memC[wa]) return;
        var lo = (wa in viejo) ? viejo[wa] : mem[wa], hi = ((wa + 1) in viejo) ? viejo[wa + 1] : mem[wa + 1];
        memC[wa] = true;
        cambios.push({ nombre: '(' + hex(wa) + ')', dir: wa, antes: lo | (hi << 8), despues: mem[wa] | (mem[wa + 1] << 8), motivo: '' });
      });
      info.cambios = cambios; info.memCambiada = memC; info.bytesCambiados = bytesC;
      info.srAntes = srAntes; info.srDespues = SR;
      info.flags = expl;
      info.pc = PC;
      pasos++;
      hist.push(reg); reg = null;
      ultimo = info;
      return info;
    }

    function fin() {
      if (!prog) return { tipo: 'sin', msg: 'No hay programa.' };
      if (detenido) return { tipo: 'error', msg: detenido };
      if (bucle) return { tipo: 'bucle', msg: 'El programa ha llegado a un salto a sí mismo (bucle infinito, una forma habitual de «parar» un programa en el micro).' };
      var ins = prog.porDir[PC];
      if (!ins || ins.segunda) return { tipo: 'fin', msg: 'Fin del programa: no hay ninguna instrucción en ' + hex(PC) + '.' };
      return null;
    }

    function ejecutar(limite) {
      limite = limite || 10000;
      var k = 0, ultimoInfo = null;
      while (k < limite) {
        var f = fin();
        if (f) break;
        ultimoInfo = paso();
        k++;
        if (ultimoInfo.error) break;
      }
      return { pasos: k, limite: k >= limite && !fin(), info: ultimoInfo };
    }

    function atras() {
      if (!hist.length) return false;
      var r = hist.pop();
      for (var j = r.mem.length - 1; j >= 0; j--) mem[r.mem[j][0]] = r.mem[j][1];
      W = r.W.slice(); SR = r.SR; PC = r.PC; SPLIM = r.SPLIM; rep = r.rep; repIns = r.repIns;
      while (usadas.length > r.usadas) delete usadasSet[usadas.pop()];
      ultimo = r.ultimo; pasos = r.pasos; detenido = r.detenido; bucle = r.bucle; pilaUsada = r.pilaUsada;
      return true;
    }

    function reiniciar() {
      var regs = opc.regs || {};
      for (var i = 0; i < 16; i++) {
        var v = regs['W' + i];
        if (v == null && i === 0) v = regs.WREG;
        W[i] = num(v, 0) & 0xFFFF;
      }
      var w15 = opc.w15 != null ? opc.w15 : regs.W15;
      W[15] = num(w15, 0x0800) & 0xFFFF;
      SR = num(opc.sr, 0) & 0xFFFF;
      SPLIM = opc.splim != null ? num(opc.splim, null) : null;
      mem = new Uint8Array(65536);
      var mm = opc.mem || {};
      Object.keys(mm).forEach(function (k) {
        var a = num(k, NaN), v2 = num(mm[k], 0);
        if (isNaN(a)) return;
        a &= 0xFFFE;
        mem[a] = v2 & 0xFF; mem[a + 1] = (v2 >> 8) & 0xFF;
      });
      PC = opc.pc != null ? num(opc.pc, 0) & 0x7FFFFE : (prog ? prog.inicio : 0);
      if (prog && !prog.porDir[PC] && opc.pc != null && prog.instrucciones.length && !prog.porDir[PC]) PC = prog.inicio;
      rep = 0; repIns = null; hist = []; reg = null; usadas = []; usadasSet = {};
      detenido = null; bucle = false; pasos = 0; ultimo = null; pilaUsada = false;
    }

    function cargar(p) { prog = p; reiniciar(); }

    var cpu = {
      cargar: cargar,
      reiniciar: reiniciar,
      paso: paso,
      ejecutar: ejecutar,
      atras: atras,
      fin: fin,
      leerByte: function (a) { a &= 0xFFFF; if (a < 0x22 || a === 0x42 || a === 0x43) return rdB(a); return mem[a]; },
      leerWord: function (a) { a &= 0xFFFE; return cpu.leerByte(a) | (cpu.leerByte(a + 1) << 8); },
      estado: function () {
        return {
          W: W.slice(), SR: SR, PC: PC, SPLIM: SPLIM, pasos: pasos, rep: rep, repIns: repIns,
          detenido: detenido, bucle: bucle, fin: fin(), pilaUsada: pilaUsada,
          puedeAtras: hist.length > 0, ultimo: ultimo, usadas: usadas.slice(), programa: prog
        };
      },
      programa: function () { return prog; }
    };
    if (opc.programa) cargar(opc.programa); else reiniciar();
    return cpu;
  }

  // Compara el estado de la CPU con los valores esperados (del libro).
  // esperado: { W0…W15|WREG|PC|SPLIM: v, sr|SR: v, C|Z|OV|N|DC: 0/1,
  //             "0x0804": word, mem: { "0x0804": word } }
  // sr se compara con máscara 0x000F (C, Z, OV, N): el libro no muestra DC.
  function comprobar(cpu, esperado) {
    var out = [], st = cpu.estado();
    function n(v) { return typeof v === 'number' ? v : leerNum(v); }
    function add(k, v, nivelMem) {
      var lib = n(v), kU = String(k).toUpperCase(), r;
      if (isNaN(lib)) { out.push({ clave: k, ok: false, texto: 'valor esperado no válido: ' + v }); return; }
      var m;
      if (!nivelMem && (m = /^W(\d{1,2})$/.exec(kU)) && +m[1] <= 15) r = { nombre: 'W' + m[1], sim: st.W[+m[1]], lib: lib & 0xFFFF };
      else if (!nivelMem && kU === 'WREG') r = { nombre: 'WREG', sim: st.W[0], lib: lib & 0xFFFF };
      else if (!nivelMem && kU === 'PC') r = { nombre: 'PC', sim: st.PC, lib: lib, ancho: 6 };
      else if (!nivelMem && kU === 'SPLIM') r = { nombre: 'SPLIM', sim: st.SPLIM || 0, lib: lib & 0xFFFF };
      else if (!nivelMem && kU === 'SR') {
        var ok = (st.SR & 0x000F) === (lib & 0x000F);
        var it = { clave: k, nombre: 'SR', libro: lib, sim: st.SR, ok: ok, nota: '' };
        var dcSim = (st.SR >> 8) & 1, dcLib = (lib >> 8) & 1;
        if (ok && dcSim !== dcLib) it.nota = 'el libro no muestra DC (bit 8); el dsPIC real da SR = ' + hex(st.SR) + ' (DC = ' + dcSim + ').';
        it.texto = ok
          ? 'SR = ' + hex(lib & 0x000F) + ' (C, Z, OV, N) coincide con el libro'
          : 'SR: el libro da ' + hex(lib) + ', el simulador da ' + hex(st.SR) + ' (se comparan C, Z, OV y N)';
        out.push(it); return;
      }
      else if (!nivelMem && BITS_FLAG[kU] && kU !== 'RA') r = { nombre: kU, sim: (st.SR & BITS_FLAG[kU]) ? 1 : 0, lib: lib ? 1 : 0, bit: true };
      else {
        var a = n(k);
        if (isNaN(a)) { out.push({ clave: k, ok: false, texto: 'clave esperada desconocida: ' + k }); return; }
        a &= 0xFFFE;
        r = { nombre: '(' + hex(a) + ')', sim: cpu.leerWord(a), lib: lib & 0xFFFF, dir: a };
      }
      var f = r.bit ? function (x) { return String(x); } : function (x) { return hex(x, r.ancho || 4); };
      var okr = r.sim === r.lib;
      out.push({
        clave: k, nombre: r.nombre, libro: r.lib, sim: r.sim, ok: okr, dir: r.dir,
        texto: okr ? r.nombre + ' = ' + f(r.lib) + ' coincide con el libro'
          : r.nombre + ': el libro da ' + f(r.lib) + ', el simulador da ' + f(r.sim)
      });
    }
    esperado = esperado || {};
    Object.keys(esperado).forEach(function (k) {
      if (k === 'mem' && esperado.mem && typeof esperado.mem === 'object') {
        Object.keys(esperado.mem).forEach(function (a) { add(a, esperado.mem[a], true); });
      } else add(k, esperado[k], false);
    });
    return out;
  }

  MPI.dspic = {
    comprobar: comprobar,
    crear: crear,
    ensamblar: ensamblar,
    SFR: SFR,
    CONDS: CONDS,
    BITS_FLAG: BITS_FLAG,
    hex: hex,
    sgn: sgn,
    leerNum: leerNum
  };
})();
