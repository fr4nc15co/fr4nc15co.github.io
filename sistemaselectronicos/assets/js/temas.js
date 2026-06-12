/*
 * Registro ordenado de los temas del sitio. El contenido de cada tema se
 * carga aparte en datos/temas/<slug>.js (que rellena MPI.contenidoTemas).
 * "disponible:true" marca los temas ya construidos (los demás salen "pronto").
 *
 * Añade una línea por tema, en orden, y su <script> en index.html.
 */
window.MPI = window.MPI || {};
MPI.temas = [
  { num: 1,    slug: 'introduccion',                 titulo: 'Introducción a los sistemas electrónicos',  disponible: true },
  { num: 2,    slug: 'teoria-circuitos',             titulo: 'Teoría de circuitos',                        disponible: true },
  { num: 3,    slug: 'entradas-salidas-digitales',   titulo: 'Entradas y salidas digitales',               disponible: false },
  { num: 4,    slug: 'temporizadores-pwm',           titulo: 'Temporizadores y PWM',                       disponible: false },
  { num: 5,    slug: 'amplificadores-operacionales', titulo: 'Amplificadores operacionales',               disponible: true },
  { num: 6,    slug: 'sensores-resistivos',          titulo: 'Sensores resistivos de grandes variaciones', disponible: true },
  { num: 7,    slug: 'programacion-modular',          titulo: 'Programación modular en Python',             disponible: false },
  { num: 8,    slug: 'maquinas-estados',             titulo: 'Máquinas de estados finitos',                disponible: false },
  { num: '9a', slug: 'comunicacion-asincrona',       titulo: 'Comunicación asíncrona (UART)',              disponible: false },
  { num: '9b', slug: 'i2c-spi',                      titulo: 'I²C y SPI',                                  disponible: false },
  { num: 10,   slug: 'conversion-ad',                titulo: 'Conversión analógico-digital',               disponible: false }
];
