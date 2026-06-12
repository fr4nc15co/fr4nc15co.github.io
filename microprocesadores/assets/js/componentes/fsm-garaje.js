/*
 * Componente "fsm-garaje": la máquina de estados de la puerta de garaje
 * (sección 11.9) animada. Seis estados (Cerrado, Abriendo, Abierto, Cerrando,
 * Par_Abri, Par_Cerr), una única entrada (pulsación del mando en RB2) y dos
 * salidas (RB0 = motor, RB1 = sentido). El recorrido completo dura 30 s; aquí
 * el tiempo corre acelerado (x10) para no aburrir.
 *
 * Uso: <div class="mpi-mount" data-componente="fsm-garaje" data-config='{}'></div>
 */
window.MPI = window.MPI || {};
MPI.componentes = MPI.componentes || {};

(function () {
  // estado: { nombre, x, y, motor, sentido }
  var ESTADOS = {
    Cerrado:  { x: 95,  y: 215, motor: 0, sentido: 0 },
    Abriendo: { x: 95,  y: 75,  motor: 1, sentido: 0 },
    Abierto:  { x: 330, y: 75,  motor: 0, sentido: 0 },
    Cerrando: { x: 330, y: 215, motor: 1, sentido: 1 },
    Par_Abri: { x: 212, y: 125, motor: 0, sentido: 0 },
    Par_Cerr: { x: 212, y: 165, motor: 0, sentido: 0 }
  };
  // transiciones: de -> { mando: a, fin30s: a }
  var TRANS = {
    Cerrado:  { mando: 'Abriendo' },
    Abriendo: { mando: 'Par_Abri', tiempo: 'Abierto' },
    Abierto:  { mando: 'Cerrando' },
    Cerrando: { mando: 'Par_Cerr', tiempo: 'Cerrado' },
    Par_Abri: { mando: 'Cerrando' },
    Par_Cerr: { mando: 'Abriendo' }
  };
  var FLECHAS = [
    ['Cerrado', 'Abriendo', 'mando', 75, 145, 'O'],
    ['Abriendo', 'Abierto', '30 s', 212, 55, 'N'],
    ['Abriendo', 'Par_Abri', 'mando', 138, 95, 'C'],
    ['Par_Abri', 'Cerrando', 'mando', 290, 142, 'C'],
    ['Abierto', 'Cerrando', 'mando', 350, 145, 'E'],
    ['Cerrando', 'Cerrado', '30 s', 212, 235, 'S'],
    ['Cerrando', 'Par_Cerr', 'mando', 285, 195, 'C'],
    ['Par_Cerr', 'Abriendo', 'mando', 140, 195, 'C']
  ];

  MPI.componentes['fsm-garaje'] = function (el, cfg) {
    var estado = 'Cerrado';
    var pos = 0;          // 0 = cerrada, 100 = abierta (en %)
    var timer = null;

    el.classList.add('mpi-fsm');
    var svg = ['<svg viewBox="0 0 430 270" class="fsm-svg" aria-label="Diagrama de estados de la puerta de garaje">'];
    svg.push('<defs><marker id="fle" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto">' +
             '<path d="M0 0 L9 4.5 L0 9 Z" fill="var(--txt-tenue,#6a737d)"/></marker></defs>');
    FLECHAS.forEach(function (f) {
      var a = ESTADOS[f[0]], b = ESTADOS[f[1]];
      svg.push('<line x1="' + a.x + '" y1="' + a.y + '" x2="' + b.x + '" y2="' + b.y +
               '" stroke="var(--txt-tenue,#6a737d)" stroke-width="1.5" marker-end="url(#fle)" class="fsm-arco" data-de="' + f[0] + '" data-a="' + f[1] + '"/>');
      svg.push('<text x="' + f[3] + '" y="' + f[4] + '" font-size="10.5" fill="var(--txt-2,#9da5b4)" text-anchor="middle">' + f[2] + '</text>');
    });
    Object.keys(ESTADOS).forEach(function (n) {
      var e = ESTADOS[n];
      svg.push('<g class="fsm-nodo" data-estado="' + n + '">' +
        '<ellipse cx="' + e.x + '" cy="' + e.y + '" rx="48" ry="22" fill="var(--bg-3,#2d2d30)" stroke="var(--borde,#3c3c3c)" stroke-width="2"/>' +
        '<text x="' + e.x + '" y="' + (e.y + 4) + '" text-anchor="middle" font-size="12.5" fill="var(--txt,#d4d4d4)">' + n.replace('_', '_') + '</text></g>');
    });
    svg.push('</svg>');

    el.innerHTML =
      '<div class="mpi-sim-cab">La puerta de garaje, en vivo (tiempo acelerado ×10)</div>' +
      '<div class="fsm-cuerpo">' +
        '<div class="fsm-izq">' + svg.join('') +
          '<div class="fsm-controles">' +
            '<button type="button" class="fsm-mando">📡 Pulsación del mando (RB2)</button>' +
            '<button type="button" class="fsm-reset">Reiniciar</button>' +
          '</div>' +
        '</div>' +
        '<div class="fsm-der">' +
          '<div class="fsm-puerta-marco"><div class="fsm-puerta"></div><div class="fsm-hueco">🚗</div></div>' +
          '<div class="fsm-salidas">' +
            '<span class="fsm-led" data-led="motor">RB0 · motor</span>' +
            '<span class="fsm-led" data-led="sentido">RB1 · sentido (1 = cierra)</span>' +
          '</div>' +
          '<div class="fsm-info nota"></div>' +
        '</div>' +
      '</div>';

    var info = el.querySelector('.fsm-info');

    function pintar(msj) {
      el.querySelectorAll('.fsm-nodo').forEach(function (g) {
        g.classList.toggle('fsm-activo', g.getAttribute('data-estado') === estado);
      });
      var e = ESTADOS[estado];
      el.querySelector('[data-led="motor"]').classList.toggle('fsm-led-on', !!e.motor);
      el.querySelector('[data-led="sentido"]').classList.toggle('fsm-led-on', !!e.sentido);
      // puerta: la lama baja desde arriba; pos 100 = abierta (lama recogida)
      el.querySelector('.fsm-puerta').style.height = (100 - pos) + '%';
      var t_restante = estado === 'Abriendo' ? (100 - pos) : pos;   // % que queda
      info.innerHTML = '<strong>' + estado + '</strong> — motor ' + (e.motor ? 'EN MARCHA' : 'parado') +
        (e.motor ? (', sentido ' + (e.sentido ? 'cerrar' : 'abrir') + ' · quedan ' + Math.ceil(t_restante * 0.3) + ' s (de 30)') : '') +
        (msj ? '<br>' + msj : '');
    }

    function para() { if (timer) { clearInterval(timer); timer = null; } }

    function arrancaMovimiento() {
      para();
      timer = setInterval(function () {
        if (estado === 'Abriendo') {
          pos += 100 / 30;                     // 30 ticks = recorrido entero
          if (pos >= 100) { pos = 100; para(); estado = 'Abierto'; pintar('Fin de los 30 s: transición automática <strong>Abriendo → Abierto</strong> (la cuenta de la ISR del Timer 1 llegó a 30).'); return; }
        } else if (estado === 'Cerrando') {
          pos -= 100 / 30;
          if (pos <= 0) { pos = 0; para(); estado = 'Cerrado'; pintar('Fin de los 30 s: transición automática <strong>Cerrando → Cerrado</strong>.'); return; }
        }
        pintar();
      }, 100);                                  // 100 ms reales = 1 s simulado
    }

    el.querySelector('.fsm-mando').addEventListener('click', function () {
      var sig = TRANS[estado].mando;
      var ant = estado;
      estado = sig;
      if (estado === 'Abriendo' || estado === 'Cerrando') {
        arrancaMovimiento();
        pintar('Pulsación: <strong>' + ant + ' → ' + sig + '</strong>. ' +
          (ant.indexOf('Par_') === 0 ? 'Se reanuda en sentido contrario aprovechando t<sub>abrir</sub> = 30 − t<sub>cerrar</sub>.' :
           'El detector de flanco del mando dispara la transición.'));
      } else {
        para();
        pintar('Pulsación: <strong>' + ant + ' → ' + sig + '</strong>. El estado de parada recuerda <em>en qué sentido</em> se movía la puerta (por eso hacen falta dos).');
      }
    });

    el.querySelector('.fsm-reset').addEventListener('click', function () {
      para(); estado = 'Cerrado'; pos = 0;
      pintar('Reiniciado: puerta cerrada. Dale al mando y observa el diagrama y los relés.');
    });

    pintar('Dale al mando 📡 y observa: el ciclo es abrir → parar → cerrar → parar → abrir…');
  };
})();
