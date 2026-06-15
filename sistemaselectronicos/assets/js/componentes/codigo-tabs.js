/*
 * Componente "codigo-tabs": pestañas para alternar entre variantes de un mismo
 * ejemplo de código (p. ej. la misma lógica escrita con RPi.GPIO y con gpiozero).
 *
 * El markup (barra de pestañas + paneles con <pre><code class="lang-python">) lo
 * genera el spec (herramientas/spec_a_tema.py, bloque "codigo-tabs"), de modo
 * que el resaltador ya ha coloreado TODOS los paneles aunque estén ocultos.
 * Este componente solo cablea el cambio de pestaña (clic y flechas ←/→).
 *
 * Uso (lo emite el generador):
 *   <div class="mpi-mount codigo-tabs" data-componente="codigo-tabs">
 *     <div class="ct-bar" role="tablist">
 *       <button class="ct-tab ct-activa" role="tab" ...>RPi.GPIO</button>
 *       <button class="ct-tab" role="tab" ...>gpiozero</button>
 *     </div>
 *     <div class="ct-panel ct-activa" role="tabpanel">…</div>
 *     <div class="ct-panel" role="tabpanel">…</div>
 *   </div>
 */
window.MPI = window.MPI || {};
MPI.componentes = MPI.componentes || {};

MPI.componentes['codigo-tabs'] = function (el) {
  var tabs = el.querySelectorAll('.ct-tab');
  var panels = el.querySelectorAll('.ct-panel');
  if (!tabs.length) return;

  function activar(idx) {
    for (var j = 0; j < tabs.length; j++) {
      var on = (j === idx);
      tabs[j].classList.toggle('ct-activa', on);
      tabs[j].setAttribute('aria-selected', on ? 'true' : 'false');
      tabs[j].setAttribute('tabindex', on ? '0' : '-1');
      if (panels[j]) panels[j].classList.toggle('ct-activa', on);
    }
  }

  for (var i = 0; i < tabs.length; i++) {
    (function (idx) {
      tabs[idx].addEventListener('click', function () { activar(idx); });
      tabs[idx].addEventListener('keydown', function (e) {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
        e.preventDefault();
        var n = tabs.length;
        var next = (idx + (e.key === 'ArrowRight' ? 1 : n - 1)) % n;
        activar(next);
        tabs[next].focus();
      });
    })(i);
  }
};
