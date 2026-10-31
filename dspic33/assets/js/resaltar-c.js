/*
 * Resaltado de sintaxis C minimalista, sin dependencias (funciona offline y
 * bajo file://). Devuelve HTML con <span class="tok-*"> para colorear.
 *
 * Reconoce, en orden de prioridad: comentarios, cadenas/char, líneas de
 * preprocesador, números (incluido hex), palabras clave y registros del
 * PIC32 (identificadores en MAYÚSCULAS de 3+ caracteres, p.ej. T1CON).
 */
window.MPI = window.MPI || {};

(function () {
  var KEYWORDS = ['int', 'void', 'char', 'short', 'long', 'float', 'double',
    'unsigned', 'signed', 'const', 'volatile', 'static', 'extern', 'struct',
    'union', 'enum', 'typedef', 'sizeof', 'return', 'if', 'else', 'while',
    'for', 'do', 'switch', 'case', 'break', 'continue', 'default', 'goto',
    // C++ (la asignatura usa C y C++; mismo resaltador para lang-c y lang-cpp)
    'class', 'public', 'private', 'protected', 'virtual', 'override', 'friend',
    'new', 'delete', 'this', 'template', 'typename', 'namespace', 'using',
    'auto', 'bool', 'true', 'false', 'nullptr', 'explicit', 'inline', 'operator',
    'try', 'catch', 'throw', 'static_cast', 'dynamic_cast', 'std'];

  function escaparHTML(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // Regex combinada (sobre texto YA escapado a HTML).
  // Grupos: 1=comentario 2=cadena/char 3=preprocesador 4=número 5=keyword 6=registro
  var RE = new RegExp(
    '(\\/\\*[\\s\\S]*?\\*\\/|\\/\\/[^\\n]*)' +              // 1 comentarios
    '|("(?:\\\\.|[^"\\\\])*"|\'(?:\\\\.|[^\'\\\\])*\')' +    // 2 cadenas y char
    '|(^[ \\t]*#[^\\n]*)' +                                  // 3 preprocesador
    '|(\\b0[xX][0-9A-Fa-f]+\\b|\\b\\d+\\b)' +                // 4 números
    '|\\b(' + KEYWORDS.join('|') + ')\\b' +                  // 5 keywords
    '|\\b([A-Z][A-Z0-9_]{2,})\\b',                           // 6 registros (MAYÚS)
    'gm');

  MPI.resaltarC = function (codigo) {
    var esc = escaparHTML(codigo);
    return esc.replace(RE, function (m, comment, str, pre, num, kw, reg) {
      if (comment) return '<span class="tok-com">' + comment + '</span>';
      if (str) return '<span class="tok-str">' + str + '</span>';
      if (pre) return '<span class="tok-pre">' + pre + '</span>';
      if (num) return '<span class="tok-num">' + num + '</span>';
      if (kw) return '<span class="tok-kw">' + kw + '</span>';
      if (reg) return '<span class="tok-reg">' + reg + '</span>';
      return m;
    });
  };

  // Aplica resaltado a todos los <code class="lang-c"> dentro de un contenedor.
  MPI.resaltarTodo = function (raiz) {
    var bloques = (raiz || document).querySelectorAll('code.lang-c, code.lang-cpp');
    for (var i = 0; i < bloques.length; i++) {
      var el = bloques[i];
      if (el.getAttribute('data-resaltado')) continue;
      el.innerHTML = MPI.resaltarC(el.textContent);
      el.setAttribute('data-resaltado', '1');
    }
  };
})();
