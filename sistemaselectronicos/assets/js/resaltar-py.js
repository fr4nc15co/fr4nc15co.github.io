/*
 * Resaltado de sintaxis Python minimalista, sin dependencias (funciona offline
 * y bajo file://). Devuelve HTML con <span class="tok-*"> para colorear.
 *
 * Reconoce, en orden de prioridad: comentarios (#), cadenas (incluidas las de
 * triple comilla), decoradores (@property…), números, palabras clave de Python
 * y un puñado de builtins/clases de gpiozero habituales en la asignatura.
 *
 * Sustituye a resaltar-c.js (la asignatura es Raspberry Pi 4 + Python).
 * app.js llama a MPI.resaltarTodo(raiz) sobre <code class="lang-python">.
 */
window.MPI = window.MPI || {};

(function () {
  var KEYWORDS = ['def', 'class', 'return', 'if', 'elif', 'else', 'while',
    'for', 'in', 'import', 'from', 'as', 'with', 'try', 'except', 'finally',
    'raise', 'pass', 'break', 'continue', 'lambda', 'global', 'nonlocal',
    'yield', 'assert', 'del', 'async', 'await', 'and', 'or', 'not', 'is',
    'None', 'True', 'False', 'self', 'cls'];

  // Builtins / clases gpiozero más usadas: se colorean como "registro" (acento).
  var BUILTINS = ['print', 'range', 'len', 'int', 'float', 'str', 'bool',
    'list', 'dict', 'tuple', 'enumerate', 'super', 'time', 'sleep',
    'Button', 'LED', 'PWMLED', 'LEDBoard', 'OutputDevice', 'InputDevice',
    'MCP3008', 'Servo', 'AngularServo', 'PWMOutputDevice', 'Enum', 'auto',
    'Timer', 'Thread', 'scheduler', 'HardwarePWM'];

  function escaparHTML(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // Regex combinada (sobre texto YA escapado a HTML).
  // Grupos: 1=comentario 2=cadena 3=decorador 4=número 5=keyword 6=builtin
  var RE = new RegExp(
    '(#[^\\n]*)' +                                                  // 1 comentarios
    '|("""[\\s\\S]*?"""|\'\'\'[\\s\\S]*?\'\'\'' +                   // 2a cadenas triple
    '|"(?:\\\\.|[^"\\\\])*"|\'(?:\\\\.|[^\'\\\\])*\')' +            // 2b cadenas simples
    '|(^[ \\t]*@[A-Za-z_][\\w.]*)' +                               // 3 decoradores
    '|(\\b0[xX][0-9A-Fa-f]+\\b|\\b\\d+\\.?\\d*\\b)' +              // 4 números
    '|\\b(' + KEYWORDS.join('|') + ')\\b' +                        // 5 keywords
    '|\\b(' + BUILTINS.join('|') + ')\\b',                         // 6 builtins
    'gm');

  MPI.resaltarPython = function (codigo) {
    var esc = escaparHTML(codigo);
    return esc.replace(RE, function (m, comment, str, deco, num, kw, bi) {
      if (comment) return '<span class="tok-com">' + comment + '</span>';
      if (str) return '<span class="tok-str">' + str + '</span>';
      if (deco) return '<span class="tok-pre">' + deco + '</span>';
      if (num) return '<span class="tok-num">' + num + '</span>';
      if (kw) return '<span class="tok-kw">' + kw + '</span>';
      if (bi) return '<span class="tok-reg">' + bi + '</span>';
      return m;
    });
  };

  // Aplica resaltado a todos los <code class="lang-python"> dentro de un contenedor.
  MPI.resaltarTodo = function (raiz) {
    var bloques = (raiz || document).querySelectorAll('code.lang-python');
    for (var i = 0; i < bloques.length; i++) {
      var el = bloques[i];
      if (el.getAttribute('data-resaltado')) continue;
      el.innerHTML = MPI.resaltarPython(el.textContent);
      el.setAttribute('data-resaltado', '1');
    }
  };
})();
