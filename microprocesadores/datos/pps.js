/*
 * Datos de Peripheral Pin Select (PPS) — entradas de reloj de los timers.
 * Reconstruido desde TABLE 11-1 (INPUT PIN SELECTION) del datasheet
 * PIC32MX1XX/2XX 28/36/44-PIN + la referencia técnica de la asignatura.
 *
 * El PIC32MX230F064D es de 44 pines: todos los pines listados están
 * disponibles. T1CK NO es remapeable (fijo al pin 34 por el cuarzo).
 *
 * Para cada entrada TxCK, el registro TxCKR selecciona a qué pin remapeable
 * se conecta, escribiendo el valor indicado (0–7).
 */
window.MPI = window.MPI || {};

MPI.SYSKEY = { unlock1: '0xAA996655', unlock2: '0x556699AA', lock: '0x1CA11CA1' };

MPI.ppsTimers = {
  T2CK: { reg: 'T2CKR', pines: [
    { v: 0, pin: 'RPA0' }, { v: 1, pin: 'RPB3' }, { v: 2, pin: 'RPB4' }, { v: 3, pin: 'RPB15' },
    { v: 4, pin: 'RPB7' }, { v: 5, pin: 'RPC7' }, { v: 6, pin: 'RPC0' }, { v: 7, pin: 'RPC5' } ] },
  T3CK: { reg: 'T3CKR', pines: [
    { v: 0, pin: 'RPA1' }, { v: 1, pin: 'RPB5' }, { v: 2, pin: 'RPB1' }, { v: 3, pin: 'RPB11' },
    { v: 4, pin: 'RPB8' }, { v: 5, pin: 'RPA8' }, { v: 6, pin: 'RPC8' }, { v: 7, pin: 'RPA9' } ] },
  T4CK: { reg: 'T4CKR', pines: [
    { v: 0, pin: 'RPA2' }, { v: 1, pin: 'RPB6' }, { v: 2, pin: 'RPA4' }, { v: 3, pin: 'RPB13' },
    { v: 4, pin: 'RPB2' }, { v: 5, pin: 'RPC6' }, { v: 6, pin: 'RPC1' }, { v: 7, pin: 'RPC3' } ] },
  T5CK: { reg: 'T5CKR', pines: [
    { v: 0, pin: 'RPA3' }, { v: 1, pin: 'RPB14' }, { v: 2, pin: 'RPB0' }, { v: 3, pin: 'RPB10' },
    { v: 4, pin: 'RPB9' }, { v: 5, pin: 'RPC9' }, { v: 6, pin: 'RPC2' }, { v: 7, pin: 'RPC4' } ] }
};
