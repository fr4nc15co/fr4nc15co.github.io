/*
 * Registro ordenado de los temas del sitio. El contenido de cada tema se
 * carga aparte en datos/temas/<slug>.js (que rellena MPI.contenidoTemas).
 * "disponible:true" marca los temas ya construidos (los demás salen "pronto").
 *
 * Microprocesadores (GITI, ICAI) — dsPIC33FJ32MC202. Orden validado:
 * micro primero (1-17, incluido el laboratorio) y C++ al final (18-21).
 * La programación en C (tema 2) va antes que los puertos (tema 3), a petición del profesor.
 * El laboratorio (tema 17) está partido en dos: "17" hardware (tarjeta, periféricos,
 * alimentación) y "17b" software (plantilla, MPLAB X, drivers, comunicación con el PC);
 * "num" es solo texto para mostrar, el orden real lo da la posición en este array.
 * Los temas se generan desde datos/_specs/<slug>.json con herramientas/spec_a_tema.py.
 */
window.MPI = window.MPI || {};
MPI.temas = [
  { num:  1, slug: "introduccion-dspic", titulo: "Introducción al dsPIC33FJ32MC202", disponible: true },
  { num:  2, slug: "programacion-c-micros", titulo: "Programación en C para micros", disponible: true },
  { num:  3, slug: "puertos-paralelo", titulo: "Puertos paralelo", disponible: true },
  { num:  4, slug: "timers", titulo: "Timers", disponible: true },
  { num:  5, slug: "interrupciones-timer", titulo: "Interrupciones aplicadas a timer", disponible: true },
  { num:  6, slug: "arquitectura-micro", titulo: "Arquitectura de un micro", disponible: true },
  { num:  7, slug: "arquitectura-dspic", titulo: "Arquitectura y mapa de memoria del dsPIC", disponible: true },
  { num:  8, slug: "ensamblador", titulo: "Ensamblador del dsPIC", disponible: true },
  { num:  9, slug: "uart", titulo: "Comunicación serie: la UART", disponible: true },
  { num: 10, slug: "drivers", titulo: "Drivers", disponible: true },
  { num: 11, slug: "conversor-ad", titulo: "Módulo conversor A/D", disponible: true },
  { num: 12, slug: "organizacion-sistema-digital", titulo: "Organización de un sistema digital", disponible: true },
  { num: 13, slug: "sistemas-digitales-complejos", titulo: "Sistemas digitales complejos: muestreo, fechado y máquinas de estados", disponible: true },
  { num: 14, slug: "pwm", titulo: "Módulo PWM", disponible: true },
  { num: 15, slug: "encoders", titulo: "Módulo de encoders (QEI)", disponible: true },
  { num: 16, slug: "depuracion-simulador", titulo: "Depuración del sistema y simulador (SCL)", disponible: true },
  { num: 17, slug: "laboratorio-pictrainer-hw", titulo: "Laboratorio: la tarjeta PicTrainer v3.0 (hardware)", disponible: true },
  { num: "17b", slug: "laboratorio-pictrainer-sw", titulo: "Laboratorio: entorno y programación (software)", disponible: true },
  { num: 18, slug: "cpp-clases-objetos", titulo: "C++: programación orientada a objetos", disponible: true },
  { num: 19, slug: "cpp-stl", titulo: "C++: STL", disponible: true },
  { num: 20, slug: "cpp-moderno", titulo: "C++: antes vs. ahora (C++11 y posteriores)", disponible: true },
  { num: 21, slug: "cpp-herencia-polimorfismo", titulo: "C++: herencia y polimorfismo", disponible: true }
];
