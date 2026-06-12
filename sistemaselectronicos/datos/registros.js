/*
 * Definiciones de registros de campos de bits, para el componente "visor-bits".
 * (Opcional: solo si tu asignatura tiene registros que explicar.)
 *
 * Formato de cada campo:
 *   { bit: n, ... }            campo de 1 bit
 *   { bits: [hi, lo], ... }    campo de varios bits (hi >= lo)
 *   valores: { v: 'texto' }    (opcional) significado de cada valor del campo
 */
window.MPI = window.MPI || {};
MPI.registros = {

  // Ejemplo: un registro de control genérico de 8 bits.
  CTRL: {
    nombre: 'CTRL',
    titulo: 'Registro de control de ejemplo',
    nota: 'Sustituye esto por los registros de tu asignatura (o borra el archivo si no aplica).',
    ancho: 8,
    campos: [
      { bit: 7, nombre: 'ON',   desc: 'Habilita el módulo.', valores: { 0: 'Apagado', 1: 'Encendido' } },
      { bits: [5, 4], nombre: 'MODO', desc: 'Modo de funcionamiento.', valores: { 0: 'A', 1: 'B', 2: 'C', 3: 'D' } },
      { bit: 0, nombre: 'IF',   desc: 'Flag de evento.', valores: { 0: 'Sin evento', 1: 'Evento pendiente' } }
    ]
  }

};
