# fr4nc15co.github.io

## Idiomas

`index.html` es la fuente (español) y contiene el diccionario `I18N` con los textos en ambos idiomas.
Tras editarla, regenera la versión inglesa (`en/index.html`) y el `sitemap.xml`:

```bash
python3 scripts/build_i18n.py
```

Título y descripción de cada idioma se definen en `PAGES` dentro del script.

## Licencia

© 2026 Francisco Martín. Este trabajo está bajo licencia
[CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/deed.es):
se permite su uso y adaptación **citando al autor**, las obras derivadas deben compartirse **bajo la misma licencia**, y no se permite el **uso
comercial**. Ver [LICENSE.md](LICENSE.md).
