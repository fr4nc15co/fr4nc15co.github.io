/*
 * Registro ordenado de los temas del sitio. El contenido de cada tema se
 * carga aparte en datos/temas/<slug>.js (que rellena MPI.contenidoTemas).
 * "disponible:true" marca los temas ya construidos (los demás salen "pronto").
 *
 * Añade una línea por tema, en orden, y su <script> en index.html.
 */
window.MPI = window.MPI || {};
MPI.temas = [
  { num: 1,  slug: 'introduccion',                 titulo: 'Introducción a los sistemas electrónicos',  disponible: true },
  { num: 2,  slug: 'teoria-circuitos',             titulo: 'Teoría de circuitos (Básicos)',              disponible: true },
  { num: 3,  slug: 'teoria-circuitos-componentes', titulo: 'Teoría de circuitos (Componentes)',          disponible: true },
  { num: 4,  slug: 'teoria-circuitos-ii',          titulo: 'Teoría de circuitos (C y L)',                disponible: true },
  { num: 5,  slug: 'entradas-salidas-digitales',   titulo: 'Entradas y salidas digitales',               disponible: true },
  { num: 6,  slug: 'temporizadores-pwm',           titulo: 'Temporizadores y PWM',                       disponible: true },
  { num: 7,  slug: 'teoria-circuitos-teoremas',    titulo: 'Teoría de circuitos (Teoremas)',             disponible: true },
  { num: 8,  slug: 'amplificadores-operacionales', titulo: 'Amplificadores operacionales',               disponible: true },
  { num: 9,  slug: 'conversion-ad',                titulo: 'Conversión analógico-digital',               disponible: true },
  { num: 10, slug: 'sensores-resistivos',          titulo: 'Sensores resistivos de grandes variaciones', disponible: true },
  { num: 11, slug: 'programacion-modular',          titulo: 'Programación modular en Python',             disponible: true },
  { num: 12, slug: 'maquinas-estados',             titulo: 'Máquinas de estados finitos',                disponible: true },
  { num: 13, slug: 'comunicacion-asincrona',       titulo: 'Comunicación asíncrona (UART)',              disponible: true },
  { num: 14, slug: 'i2c-spi',                      titulo: 'I²C y SPI',                                  disponible: true },
  { num: 15, slug: 'laboratorio',                  titulo: 'Laboratorio: pines de la iMAT HAT y avisos', disponible: true }
];
