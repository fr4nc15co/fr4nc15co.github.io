#!/usr/bin/env python3
"""Prepara los assets del juego web a partir del repo libGDX original:
- Sanea los JSON (saltos de línea literales dentro de strings -> \\n)
- Extrae la rejilla de colisiones del TMX (capa "Colisiones")
- Copia mapa, sprites, retratos, vidas, música y título
"""
import json, re, shutil, sys
import xml.etree.ElementTree as ET
from pathlib import Path

REPO = Path(sys.argv[1])
DEST = Path(sys.argv[2])
A = REPO / "assets"


def sanitize_json(text: str) -> str:
    """Convierte JSON laxo (newlines/tabs crudos dentro de strings) en JSON válido."""
    out = []
    in_str = False
    esc = False
    for ch in text:
        if in_str:
            if esc:
                out.append(ch); esc = False
            elif ch == "\\":
                out.append(ch); esc = True
            elif ch == '"':
                out.append(ch); in_str = False
            elif ch == "\n":
                out.append("\\n")
            elif ch == "\r":
                pass
            elif ch == "\t":
                out.append("\\t")
            else:
                out.append(ch)
        else:
            if ch == '"':
                in_str = True
            out.append(ch)
    return "".join(out)


def add_missing_commas(text: str) -> str:
    """Tras sanitize_json ya no hay saltos de línea dentro de strings, así que se
    puede trabajar por líneas: libGDX tolera comas ausentes entre pares clave-valor."""
    lines = text.split("\n")
    for i in range(len(lines) - 1):
        cur = lines[i].rstrip()
        nxt = None
        for j in range(i + 1, len(lines)):
            if lines[j].strip():
                nxt = lines[j].strip()
                break
        if not cur or nxt is None:
            continue
        if cur[-1] in '"0123456789}]' and nxt[0] in '"{[':
            lines[i] = cur + ","
        elif cur[-1] == "," and nxt[0] in "}]":  # coma sobrante (también tolerada por libGDX)
            lines[i] = cur[:-1]
    return "\n".join(lines)


def copy_json_sanitized(src: Path, dst: Path):
    raw = src.read_text(encoding="utf-8")
    clean = add_missing_commas(sanitize_json(raw))
    data = json.loads(clean)  # valida
    dst.parent.mkdir(parents=True, exist_ok=True)
    dst.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"json  {dst.relative_to(DEST)}")


def copy_file(src: Path, dst: Path):
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dst)


# ---- Colisiones desde el TMX ----
tree = ET.parse(A / "Map" / "icaiMap.tmx")
root = tree.getroot()
W, H = int(root.get("width")), int(root.get("height"))
grid = None
for layer in root.iter("layer"):
    if layer.get("name") == "Colisiones":
        csv = layer.find("data").text.strip()
        rows = [r for r in csv.split("\n") if r.strip()]
        grid = []
        for r in rows:
            cells = [c for c in r.strip().rstrip(",").split(",")]
            grid.append("".join("1" if int(c) != 0 else "0" for c in cells))
        break
assert grid and len(grid) == H and all(len(r) == W for r in grid), "rejilla inválida"
(DEST / "assets" / "map").mkdir(parents=True, exist_ok=True)
# fila 0 = fila superior del mapa (coordenadas de pantalla); el juego usa Y hacia arriba y lo invierte
(DEST / "assets" / "map" / "collisions.json").write_text(
    json.dumps({"width": W, "height": H, "rows": grid}), encoding="utf-8")
print(f"grid  assets/map/collisions.json ({W}x{H})")

# ---- Mapa ----
copy_file(A / "Map" / "icaiMap.png", DEST / "assets" / "map" / "icaiMap.png")

# ---- Preguntas ----
tests = json.loads(sanitize_json((A / "Questions" / "tests.json").read_text(encoding="utf-8")))
copy_json_sanitized(A / "Questions" / "tests.json", DEST / "assets" / "questions" / "tests.json")
for t in tests:
    fn = t["FileName"] + ".json"
    copy_json_sanitized(A / "Questions" / fn, DEST / "assets" / "questions" / fn)

# ---- Personas ----
copy_json_sanitized(A / "People" / "people.json", DEST / "assets" / "data" / "people.json")

for gender_src, gender_dst in [("ChicoProtagonista", "chico"), ("ChicaProtagonista", "chica")]:
    for f in (A / "People" / gender_src).glob("*.png"):
        copy_file(f, DEST / "assets" / "people" / gender_dst / f.name)

for name in [f"prueba{i}" for i in range(1, 14)] + ["Zipi", "Zape", "Pau", "Edu"]:
    copy_file(A / "People" / "Secundarios" / f"{name}.png",
              DEST / "assets" / "people" / "npc" / f"{name}.png")

for f in (A / "People" / "Retratos").glob("*.png"):
    copy_file(f, DEST / "assets" / "people" / "retratos" / f.name)

# ---- Vidas, música y título ----
for f in (A / "Lives").glob("*.png"):
    copy_file(f, DEST / "assets" / "lives" / f.name)
copy_file(A / "Music" / "song.ogg", DEST / "assets" / "music" / "song.ogg")
for f in (A / "Title").glob("*.png"):
    copy_file(f, DEST / "assets" / "title" / f.name)

print("OK")
