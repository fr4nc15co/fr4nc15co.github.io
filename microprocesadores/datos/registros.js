/*
 * Definiciones de registros de campos de bits del PIC32MX230F064D.
 *
 * IMPORTANTE: estas definiciones NO se transcriben del Markdown de Docling
 * (que llegó corrupto: caracteres CJK, "(L)NO" por ON, etc.), sino que se
 * reconstruyen desde el datasheet PIC32MX1XX/2XX + la referencia técnica de
 * la asignatura. Alimentan el componente "visor-bits".
 *
 * Formato de cada campo:
 *   { bit: n, ... }            campo de 1 bit
 *   { bits: [hi, lo], ... }    campo de varios bits (hi >= lo)
 *   valores: { v: 'texto' }    (opcional) significado de cada valor del campo
 */
window.MPI = window.MPI || {};
MPI.registros = {

  T1CON: {
    nombre: 'T1CON',
    titulo: 'Timer 1 Control Register',
    nota: 'Temporizador 1 — tipo A (prescaler 1, 8, 64 o 256; admite oscilador externo).',
    ancho: 16,
    campos: [
      { bit: 15, nombre: 'ON',    desc: 'Habilita el temporizador.', valores: { 0: 'Parado (mantiene la cuenta)', 1: 'Contando' } },
      { bit: 13, nombre: 'SIDL',  desc: 'Para el timer en modo Idle de la CPU.', valores: { 0: 'Sigue en Idle', 1: 'Se para en Idle' } },
      { bit: 7,  nombre: 'TGATE', desc: 'Modo gated: mide el ancho del pulso en T1CK (requiere TCS=0).', valores: { 0: 'Desactivado', 1: 'Medida de ancho de pulso' } },
      { bits: [5, 4], nombre: 'TCKPS', desc: 'Prescaler del reloj (tipo A).', valores: { 0: '1:1', 1: '1:8', 2: '1:64', 3: '1:256' } },
      { bit: 2,  nombre: 'TSYNC', desc: 'Sincroniza el reloj externo (solo con TCS=1).', valores: { 0: 'No sincronizado', 1: 'Sincronizado' } },
      { bit: 1,  nombre: 'TCS',   desc: 'Fuente de reloj del temporizador.', valores: { 0: 'PBCLK interno', 1: 'Pin externo T1CK' } }
    ]
  },

  T2CON: {
    nombre: 'T2CON',
    titulo: 'Timer x Control Register (tipo B)',
    nota: 'Representa T2CON–T5CON (tipo B): prescaler 1–256 y modo 32 bits encadenando con el timer impar siguiente.',
    ancho: 16,
    campos: [
      { bit: 15, nombre: 'ON',    desc: 'Habilita el temporizador.', valores: { 0: 'Parado (mantiene la cuenta)', 1: 'Contando' } },
      { bit: 13, nombre: 'SIDL',  desc: 'Para el timer en modo Idle de la CPU.', valores: { 0: 'Sigue en Idle', 1: 'Se para en Idle' } },
      { bit: 7,  nombre: 'TGATE', desc: 'Modo gated: mide el ancho del pulso en TxCK (requiere TCS=0).', valores: { 0: 'Desactivado', 1: 'Medida de ancho de pulso' } },
      { bits: [6, 4], nombre: 'TCKPS', desc: 'Prescaler del reloj (tipo B): divisor = 2^TCKPS, salvo 7 que es 256.', valores: { 0: '1:1', 1: '1:2', 2: '1:4', 3: '1:8', 4: '1:16', 5: '1:32', 6: '1:64', 7: '1:256' } },
      { bit: 3,  nombre: 'T32',   desc: 'Modo 32 bits: encadena este timer (par) con el impar siguiente.', valores: { 0: '16 bits', 1: '32 bits' } },
      { bit: 1,  nombre: 'TCS',   desc: 'Fuente de reloj del temporizador.', valores: { 0: 'PBCLK interno', 1: 'Pin externo TxCK' } }
    ]
  }

};
