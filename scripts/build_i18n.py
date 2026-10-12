#!/usr/bin/env python3
"""Pre-renderiza la web en cada idioma para que Google indexe ambas versiones.

Fuente única: /index.html (su diccionario I18N en JS es la referencia de textos).
Genera:
  - /index.html     -> español, texto estático en español
  - /en/index.html  -> inglés (generado, no editar a mano)
  - /sitemap.xml    -> <lastmod> y alternativas hreflang

Uso:  python3 scripts/build_i18n.py
"""
import datetime
import html
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SITE = 'https://fr4nc15co.github.io'
SOURCE = ROOT / 'index.html'

PAGES = {
    'es': {
        'path': '/',
        'file': ROOT / 'index.html',
        'locale': 'es_ES',
        'title': 'Francisco Martín Martínez · Investigador en energía · IIT Comillas',
        'description': 'Profesor e investigador en el IIT Comillas (ICAI): respuesta y flexibilidad de la demanda '
                       '(demand response), renovables y planificación energética.',
    },
    'en': {
        'path': '/en/',
        'file': ROOT / 'en' / 'index.html',
        'locale': 'en_GB',
        'title': 'Francisco Martín Martínez · Energy Systems Researcher · IIT Comillas',
        'description': 'Associate Professor at IIT Comillas (ICAI): demand response and demand flexibility, '
                       'renewable integration and energy system planning.',
    },
}
DEFAULT_LANG = 'es'

MONTHS = {
    'es': ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
           'septiembre', 'octubre', 'noviembre', 'diciembre'],
    'en': ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
           'September', 'October', 'November', 'December'],
}

GENERATED_NOTE = '<!-- Generado por scripts/build_i18n.py a partir de /index.html: no editar a mano -->\n'


def parse_i18n(src):
    """Lee el objeto `const I18N = { en: {...}, es: {...} }` del JS de la página."""
    block = re.search(r'const I18N = \{\n(.*?)\n        \};', src, re.S).group(1)
    dicts, current = {}, None
    for line in block.splitlines():
        if m := re.match(r'\s*(\w+): \{$', line):
            current = dicts.setdefault(m.group(1), {})
        elif m := re.match(r"\s*(\w+): '((?:[^'\\]|\\.)*)',?$", line):
            current[m.group(1)] = re.sub(r'\\(.)', r'\1', m.group(2))
    return dicts


OPEN_TAG = re.compile(r'<([a-zA-Z][\w-]*)((?:\s+[^\s=>/]+(?:\s*=\s*(?:"[^"]*"|\'[^\']*\'|[^\s>]+))?)*)\s*(/?)>')


def elements_with(src, attr):
    """(inicio, fin_apertura, inicio_cierre, tag, valor) de cada elemento con `attr`, de último a primero."""
    found = []
    for m in OPEN_TAG.finditer(src):
        a = re.search(r'\s' + attr + r'="([^"]*)"', m.group(2))
        if not a:
            continue
        tag, depth, close = m.group(1).lower(), 1, None
        for t in re.finditer(r'<(/?)' + tag + r'\b[^>]*>', src[m.end():], re.I):
            depth += -1 if t.group(1) else 1
            if depth == 0:
                close = m.end() + t.start()
                break
        found.append((m.start(), m.end(), close, tag, a.group(1)))
    return sorted(found, reverse=True)


def set_attr(tag_html, name, value):
    value = html.escape(value, quote=True)
    if re.search(r'\s' + name + r'="[^"]*"', tag_html):
        return re.sub(r'(\s' + name + r'=")[^"]*(")', lambda m: m.group(1) + value + m.group(2), tag_html, count=1)
    return re.sub(r'\s*/?>$', lambda m: f' {name}="{value}"' + m.group(0), tag_html, count=1)


def rootify(value):
    """Rutas relativas -> absolutas desde la raíz, para que funcionen también en /en/."""
    if re.match(r'^(?:[a-z][a-z0-9+.-]*:|/|#)', value, re.I) or not value:
        return value
    return '/' + value


def render(src, lang, dicts):
    dict_ = dicts[lang]
    page = PAGES[lang]
    url = SITE + page['path']

    # Textos marcados con data-i18n
    missing = set()
    for start, open_end, close, _, key in elements_with(src, 'data-i18n'):
        if key not in dict_:
            missing.add(key)
            continue
        src = src[:open_end] + dict_[key] + src[close:]
    for start, open_end, _, _, key in elements_with(src, 'data-i18n-label'):
        if key in dict_:
            src = src[:start] + set_attr(src[start:open_end], 'aria-label', dict_[key]) + src[open_end:]
    if missing:
        print(f'[{lang}] claves sin traducción: {", ".join(sorted(missing))}')

    # Selector de idioma: marca el actual
    def switch(m):
        tag = m.group(0)
        on = re.search(r'data-lang="(\w+)"', tag).group(1) == lang
        tag = re.sub(r'\s+aria-current="[^"]*"', '', tag)
        tag = re.sub(r'class="lang-btn(?: active)?"', 'class="lang-btn active"' if on else 'class="lang-btn"', tag)
        return set_attr(tag, 'aria-current', 'page') if on else tag
    src = re.sub(r'<a class="lang-btn[^"]*"[^>]*>', switch, src)

    # Fecha de última actualización
    def date(m):
        y, mo, d = map(int, m.group(2).split('-'))
        text = f'{d} de {MONTHS["es"][mo - 1]} de {y}' if lang == 'es' else f'{MONTHS["en"][mo - 1]} {d}, {y}'
        return m.group(1) + text + m.group(3)
    src = re.sub(r'(<time id="last-updated" datetime="([\d-]+)">)[^<]*(</time>)', lambda m: date(m), src)

    # Rutas relativas
    src = re.sub(r'(\s(?:href|src|data-map-src)=")([^"]*)(")', lambda m: m.group(1) + rootify(m.group(2)) + m.group(3), src)
    src = re.sub(r'(\ssrcset=")([^"]*)(")', lambda m: m.group(1) + ', '.join(
        ' '.join([rootify(part.split()[0])] + part.split()[1:]) for part in m.group(2).split(',')) + m.group(3), src)

    # <head>: idioma, título, descripciones, canonical y hreflang
    esc = lambda v: html.escape(v, quote=True)
    src = re.sub(r'<html lang="[^"]*">', f'<html lang="{lang}">', src, count=1)
    src = re.sub(r'<title>.*?</title>', lambda _: f'<title>{html.escape(page["title"], quote=False)}</title>', src, count=1)
    for pattern, value in [
        (r'<meta name="description" content="[^"]*">', f'<meta name="description" content="{esc(page["description"])}">'),
        (r'<meta property="og:title" content="[^"]*">', f'<meta property="og:title" content="{esc(page["title"])}">'),
        (r'<meta property="og:description" content="[^"]*">', f'<meta property="og:description" content="{esc(page["description"])}">'),
        (r'<meta property="og:url" content="[^"]*">', f'<meta property="og:url" content="{url}">'),
        (r'<meta name="twitter:title" content="[^"]*">', f'<meta name="twitter:title" content="{esc(page["title"])}">'),
        (r'<meta name="twitter:description" content="[^"]*">', f'<meta name="twitter:description" content="{esc(page["description"])}">'),
    ]:
        assert re.search(pattern, src), pattern
        src = re.sub(pattern, lambda _: value, src, count=1)

    locales = [f'    <meta property="og:locale" content="{page["locale"]}">'] + [
        f'    <meta property="og:locale:alternate" content="{p["locale"]}">' for l, p in PAGES.items() if l != lang]
    src = re.sub(r'(?:    <meta property="og:locale(?::alternate)?" content="[^"]*">\n)+', lambda _: '\n'.join(locales) + '\n', src, count=1)

    links = [f'    <link rel="canonical" href="{url}">'] + [
        f'    <link rel="alternate" hreflang="{l}" href="{SITE + p["path"]}">' for l, p in PAGES.items()] + [
        f'    <link rel="alternate" hreflang="x-default" href="{SITE + PAGES[DEFAULT_LANG]["path"]}">']
    src = re.sub(r'    <link rel="canonical" href="[^"]*">\n(?:    <link rel="alternate" hreflang="[^"]*" href="[^"]*">\n)*',
                 lambda _: '\n'.join(links) + '\n', src, count=1)

    src = src.replace(GENERATED_NOTE, '')
    if lang != DEFAULT_LANG:
        src = src.replace('<!DOCTYPE html>\n', '<!DOCTYPE html>\n' + GENERATED_NOTE, 1)
    return src


def lastmod(rel):
    """Fecha del último commit que tocó la ruta, u hoy si tiene cambios sin confirmar."""
    target = str(ROOT / rel) if rel else str(ROOT / 'index.html')
    git = lambda *a: subprocess.run(['git', '-C', str(ROOT), *a], capture_output=True, text=True).stdout.strip()
    if git('status', '--porcelain', '--', target):
        return datetime.date.today().isoformat()
    return git('log', '-1', '--format=%cs', '--', target) or datetime.date.today().isoformat()


def build_sitemap():
    entries = [('', PAGES['es']['path'], True), ('en/index.html', PAGES['en']['path'], True),
               ('microprocesadores', '/microprocesadores/', False),
               ('sistemaselectronicos', '/sistemaselectronicos/', False),
               ('game_micros', '/game_micros/', False),
               ('privacidad.html', '/privacidad.html', False)]
    alternates = ''.join(f'\n    <xhtml:link rel="alternate" hreflang="{l}" href="{SITE + p["path"]}"/>' for l, p in PAGES.items()) + \
        f'\n    <xhtml:link rel="alternate" hreflang="x-default" href="{SITE + PAGES[DEFAULT_LANG]["path"]}"/>'
    urls = ''.join(
        f'  <url>\n    <loc>{SITE + path}</loc>\n    <lastmod>{lastmod(rel)}</lastmod>{alternates if alt else ""}\n  </url>\n'
        for rel, path, alt in entries)
    (ROOT / 'sitemap.xml').write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"\n'
        '        xmlns:xhtml="http://www.w3.org/1999/xhtml">\n' + urls + '</urlset>\n', encoding='utf-8')


def main():
    src = SOURCE.read_text(encoding='utf-8')
    dicts = parse_i18n(src)
    outputs = {lang: render(src, lang, dicts) for lang in PAGES}
    for lang, out in outputs.items():
        PAGES[lang]['file'].parent.mkdir(exist_ok=True)
        PAGES[lang]['file'].write_text(out, encoding='utf-8')
        print(f'[{lang}] {PAGES[lang]["file"].relative_to(ROOT)}')
    build_sitemap()
    print('sitemap.xml')


if __name__ == '__main__':
    main()
