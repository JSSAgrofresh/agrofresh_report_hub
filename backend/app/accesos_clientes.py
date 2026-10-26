"""Accesos de las cuentas de cliente (Sold To, Ship To y especie) a partir de las listas de distribución.

Lógica PURA (sin base ni R2) que comparten `scripts/crear_clientes.py` (crea las cuentas) y
`scripts/probar_traspaso_clientes.py` (comprueba que cada cuenta ve solo lo suyo). La fuente es la lista de
distribución de «Resultado a clientes»: un contacto es un correo en una planta y, si trae especie, solo en ella.
"""
from __future__ import annotations

import re
from typing import Iterable

from .listas_distribucion import del_servicio

_PAT_EMAIL = re.compile(r"^[^@\s;,]+@[^@\s;,]+\.[^@\s;,]+$")
DOMINIOS_INTERNOS = ("agrofresh.com",)
CORREOS_INTERNOS = ("agrofreshreporthub@gmail.com",)


def plano(valor: str | None) -> str:
    return " ".join(str(valor or "").split()).casefold()


def es_interno(correo: str) -> bool:
    c = correo.strip().casefold()
    return c in CORREOS_INTERNOS or c.split("@")[-1] in DOMINIOS_INTERNOS


def accesos_por_correo(
    contactos: list[dict], servicios: Iterable[str] = ("",)
) -> tuple[dict[str, list[dict]], list[str]]:
    """(correo en minúsculas → accesos [{clienteNombre, plantaNombre, especie?}], textos que no son un correo).

    Una fila por (planta, especie). Si el correo figura en una planta SIN especie (= todas), esa fila cubre a las
    demás de la misma planta y no se repiten. Se dejan fuera los correos internos de AgroFresh y los inactivos."""
    por_correo: dict[str, dict[tuple[str, str], dict[str | None, str]]] = {}
    invalidos: list[str] = []
    for servicio in servicios:
        for c in del_servicio(contactos, servicio):
            if c.get("tipo") != "resultado_cliente" or not c.get("activo", True):
                continue
            correo = str(c.get("email") or "").strip()
            sold_to = " ".join(str(c.get("sold_to") or "").split())
            ship_to = " ".join(str(c.get("ship_to") or "").split())
            if not correo or not sold_to or not ship_to:
                continue
            if not _PAT_EMAIL.match(correo):
                if correo not in invalidos:
                    invalidos.append(correo)
                continue
            if es_interno(correo):
                continue
            especie = " ".join(str(c.get("especie") or "").split()) or None
            plantas = por_correo.setdefault(correo.casefold(), {})
            plantas.setdefault((sold_to, ship_to), {})[especie.casefold() if especie else None] = especie or ""
    salida: dict[str, list[dict]] = {}
    for correo, plantas in sorted(por_correo.items()):
        accesos: list[dict] = []
        for (sold_to, ship_to), especies in sorted(plantas.items(), key=lambda x: (x[0][0].casefold(), x[0][1].casefold())):
            if None in especies:
                accesos.append({"clienteNombre": sold_to, "plantaNombre": ship_to})
            else:
                for esp in sorted(especies.values(), key=str.casefold):
                    accesos.append({"clienteNombre": sold_to, "plantaNombre": ship_to, "especie": esp})
        salida[correo] = accesos
    return salida, invalidos


def tipo_de_cuenta(accesos: list[dict]) -> int:
    """El tipo de correo de bienvenida: 1 = una planta y una especie; 2 = una planta y varias especies (o todas);
    3 = varias plantas."""
    plantas = {(plano(a["clienteNombre"]), plano(a.get("plantaNombre"))) for a in accesos}
    if len(plantas) > 1:
        return 3
    return 1 if len(accesos) == 1 and accesos[0].get("especie") else 2


def triples_esperados(accesos: list[dict], universo: Iterable[tuple[str, str, str]]) -> set[tuple[str, str, str]]:
    """De los (Sold To, Ship To, Especie) que existen en Report, los que estos accesos deberían mostrar."""
    cubiertos = set()
    for sold_to, ship_to, especie in universo:
        for a in accesos:
            if plano(a["clienteNombre"]) != plano(sold_to):
                continue
            if a.get("plantaNombre") and plano(a["plantaNombre"]) != plano(ship_to):
                continue
            if a.get("especie") and plano(a["especie"]) != plano(especie):
                continue
            cubiertos.add((sold_to, ship_to, especie))
            break
    return cubiertos


def comparar(visto: set[tuple[str, str, str]], esperado: set[tuple[str, str, str]]) -> dict:
    """Resultado exacto de una cuenta: «sin traspaso» solo si ve lo mismo que le corresponde, ni más ni menos."""
    de_mas = sorted(visto - esperado)
    falta = sorted(esperado - visto)
    return {"estado": "sin traspaso" if not de_mas and not falta else "con traspaso", "ve_de_mas": de_mas, "le_falta": falta}
