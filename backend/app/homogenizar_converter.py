"""
Port a Python de `homogenizar` del Converter (public/modules/converter.html): lleva el texto que trae el informe a su
forma oficial de Listados. Si se toca una regla allá, se toca acá (`tests/test_homogenizar_converter.py`).

Orden de las reglas (igual que el Converter): valor ya oficial → alias conocido (que apunte a un valor válido para ESTE
informe) → mismo texto sin espacios/guiones → nombre comercial entre paréntesis → nombre abreviado único (≥ 5 letras) →
solo en Ship To, la única planta del cliente que contiene las palabras. Nada se adivina: ante la duda no cambia nada.
"""
from __future__ import annotations

import json
import re
import unicodedata
from functools import lru_cache
from pathlib import Path
from typing import Any

_ALIAS = Path(__file__).parent / "data" / "alias_converter.json"


@lru_cache(maxsize=1)
def _alias() -> dict[str, dict[str, str]]:
    try:
        return json.loads(_ALIAS.read_text(encoding="utf-8"))
    except Exception:  # noqa: BLE001 — sin la tabla igual rigen las demás reglas
        return {}


def plano(s: Any) -> str:
    t = unicodedata.normalize("NFKD", str(s))
    t = "".join(c for c in t if not unicodedata.combining(c))
    return re.sub(r"\s+", " ", t).strip().lower()


def palabras(s: Any) -> str:
    return re.sub(r"[^a-z0-9]+", " ", plano(s)).strip()


def compacto(s: Any) -> str:
    return re.sub(r"[\s'’\-/]", "", plano(s))


def homogenizar(campo: str, valor: str, oficiales: list[str], de_un_cliente: bool = False) -> dict[str, Any]:
    """{valor, estado: vacio|ok|corregido|fuera_de_catalogo, antes?, sugerencias?}"""
    if not valor:
        return {"valor": valor, "estado": "vacio"}
    ali = _alias().get(campo, {})
    bruto = str(valor).strip()
    if bruto in oficiales:
        return {"valor": bruto, "estado": "ok"}
    p = plano(bruto)
    if p in ali and ali[p] in oficiales:
        return {"valor": ali[p], "estado": "ok" if ali[p] == bruto else "corregido", "antes": bruto}
    c = compacto(bruto)
    for o in oficiales:
        if compacto(o) == c:
            return {"valor": o, "estado": "corregido", "antes": bruto}
    for o in oficiales:
        m = re.search(r"\(([^)]+)\)", o)
        if m and compacto(m.group(1)) == c:
            return {"valor": o, "estado": "corregido", "antes": bruto}
    cand = [o for o in oficiales if compacto(o).startswith(c) and len(c) >= 5]
    if len(cand) == 1:
        return {"valor": cand[0], "estado": "corregido", "antes": bruto}
    if de_un_cliente:
        pal = " " + palabras(bruto) + " "
        contienen = [o for o in oficiales if pal in " " + palabras(o) + " "]
        if len(pal.strip()) >= 3 and len(contienen) == 1:
            return {"valor": contienen[0], "estado": "corregido", "antes": bruto}
    return {"valor": bruto, "estado": "fuera_de_catalogo", "sugerencias": cand[:4]}


def homogenizar_campos(campos: dict[str, str], opciones: dict[str, Any]) -> tuple[dict[str, str], list[dict[str, str]]]:
    """Sold To → Especie → Ship To (entre las plantas de su Sold To) → Variedad (entre las de su Especie).
    Devuelve los campos corregidos y qué se cambió solo."""
    final = dict(campos)
    cambios: list[dict[str, str]] = []

    def aplicar(campo: str, oficiales: list[str], de_un_cliente: bool = False) -> None:
        r = homogenizar(campo, final.get(campo, ""), oficiales, de_un_cliente)
        if r["estado"] == "corregido" and r["valor"] != final[campo]:
            cambios.append({"campo": campo, "antes": final[campo], "despues": r["valor"]})
            final[campo] = r["valor"]

    aplicar("sold_to", opciones.get("sold_to", []))
    aplicar("especie", opciones.get("especie", []))
    plantas = opciones.get("ship_to", {}).get(final.get("sold_to", ""))
    if plantas is not None:
        aplicar("ship_to", plantas, True)
    variedades = opciones.get("variedad", {}).get(final.get("especie", ""))
    if variedades is not None:
        aplicar("variedad", variedades)
    return final, cambios
