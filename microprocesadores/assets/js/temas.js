/*
 * Registro ordenado de los temas del sitio. El contenido de cada tema se
 * carga aparte en datos/temas/<slug>.js (que rellena MPI.contenidoTemas).
 * "disponible:true" marca los temas ya construidos.
 */
window.MPI = window.MPI || {};
MPI.temas = [
  { num: 1,  slug: 'introduccion-microcontroladores', titulo: 'Introducción a los microcontroladores', disponible: true },
  { num: 2,  slug: 'lenguaje-c-bajo-nivel',           titulo: 'Lenguaje C para bajo nivel',            disponible: true },
  { num: 3,  slug: 'puertos-entrada-salida',          titulo: 'Puertos de E/S digital (GPIO)',         disponible: true },
  { num: 4,  slug: 'temporizadores',                  titulo: 'Temporizadores',                        disponible: true },
  { num: 5,  slug: 'arquitectura-mips',               titulo: 'Arquitectura hardware y software',      disponible: true },
  { num: 6,  slug: 'interrupciones',                  titulo: 'Interrupciones',                        disponible: true },
  { num: 7,  slug: 'comunicacion-serie-uart',         titulo: 'Comunicación serie (UART)',             disponible: true },
  { num: 8,  slug: 'buses-i2c-spi',                   titulo: 'Buses I²C y SPI',                       disponible: true },
  { num: 9,  slug: 'conversor-analogico-digital',     titulo: 'Conversor A/D (ADC)',                   disponible: true },
  { num: 10, slug: 'pwm-output-compare',              titulo: 'PWM y Output Compare',                  disponible: true },
  { num: 11, slug: 'tecnicas-programacion-fsm',       titulo: 'Técnicas de programación y FSM',        disponible: true },
  { num: 12, slug: 'ejemplo-integrador-termostato',   titulo: 'Ejemplo integrador: termostato',        disponible: true }
];
