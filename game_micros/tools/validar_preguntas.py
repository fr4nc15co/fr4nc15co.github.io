#!/usr/bin/env python3
"""Valida la coherencia de los ficheros de preguntas del juego.

Uso:  python3 tools/validar_preguntas.py
(desde la raíz del proyecto; no necesita dependencias)

Comprueba, para cada prueba listada en assets/questions/tests.json:
- que el JSON es válido (si no, este script ya falla al cargarlo)
- MC: que la letra de CORRECTA existe entre las opciones y su texto coincide
- DD: que hay tantos marcadores ___(n) como HUECOS y que cada ENTRADA n
      existe texto-idéntico (salvo mayúsculas/espacios) entre las OPCION X
- FG: que hay tantos marcadores ___ como HUECOS y que existe cada RESPUESTA n
"""
import json
import re
import sys
from pathlib import Path

QUESTIONS = Path(__file__).resolve().parent.parent / "assets" / "questions"


def norm(s):
    return re.sub(r"\s+", " ", str(s if s is not None else "")).strip().lower()


def main():
    tests = json.loads((QUESTIONS / "tests.json").read_text(encoding="utf-8"))
    issues = []
    total = 0

    for t in tests:
        qs = json.loads((QUESTIONS / (t["FileName"] + ".json")).read_text(encoding="utf-8"))
        total += len(qs)
        for i, q in enumerate(qs, 1):
            tag = f"{t['FileName']}#{i}"

            if t["TestType"] == "MC":
                letters = {}
                for k in range(1, 5):
                    o = q.get(f"OPCION {k}")
                    if o and str(o).strip():
                        m = re.match(r"\s*([a-dA-D])[.)]", str(o))
                        if m:
                            letters[m.group(1).lower()] = str(o)
                        else:
                            issues.append(f"{tag}: la OPCION {k} no empieza por letra ('a. ...')")
                c = str(q.get("CORRECTA", "")).strip()[:1].lower()
                if c not in letters:
                    issues.append(f"{tag}: CORRECTA '{c}' no está entre {sorted(letters)}")
                elif norm(letters[c]) != norm(q["CORRECTA"]):
                    issues.append(f"{tag}: el texto de CORRECTA no coincide con la opción {c}")

            elif t["TestType"] == "DD":
                n = int(q["HUECOS"])
                found = len(re.findall(r"_{2,}\s*\((\d+)\)", str(q["PREGUNTA"])))
                if found != n:
                    issues.append(f"{tag}: {n} HUECOS pero {found} marcadores ___(n) "
                                  "(sin marcadores el juego pinta controles numerados debajo)")
                opts = [norm(q[f"OPCION {chr(65+k)}"])
                        for k in range(int(q["OPCIONES"])) if f"OPCION {chr(65+k)}" in q]
                if len(opts) != int(q["OPCIONES"]):
                    issues.append(f"{tag}: OPCIONES={q['OPCIONES']} pero hay {len(opts)} OPCION X")
                for b in range(1, n + 1):
                    a = q.get(f"ENTRADA {b}")
                    if a is None:
                        issues.append(f"{tag}: falta ENTRADA {b}")
                    elif norm(a) not in opts:
                        issues.append(f"{tag}: ENTRADA {b} '{a}' no coincide con ninguna opción")

            else:  # FG
                n = int(q["HUECOS"])
                found = len(re.findall(r"_{2,}\s*(?:\((\d+)\))?", str(q["PREGUNTA"])))
                if found != n:
                    issues.append(f"{tag}: {n} HUECOS pero {found} marcadores ___")
                for b in range(1, n + 1):
                    if q.get(f"RESPUESTA {b}") is None:
                        issues.append(f"{tag}: falta RESPUESTA {b}")

    print(f"{total} preguntas validadas en {len(tests)} pruebas")
    if issues:
        print("\n".join(issues))
        sys.exit(1)
    print("SIN PROBLEMAS")


if __name__ == "__main__":
    main()
