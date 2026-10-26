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


# ── Correos mal escritos en la lista (con nombres, separados por «/» o «:», repetidos) ──────────────

_SEPARADORES = re.compile(r"[\s/:;,<>()\[\]]+")


def separar_correos(texto: str) -> list[str]:
    """Los correos COMPLETOS que hay en un texto, sin repetir y en el orden en que aparecen. Solo separa por espacios,
    «/», «:», «;» y «,»: no corrige ni adivina nada de lo escrito (ni dominios ni letras). Lo que no es un correo
    (nombres, palabras sueltas) se descarta; dos correos pegados sin separador no se tocan (no son un correo válido)."""
    salida: list[str] = []
    for parte in _SEPARADORES.split(texto or ""):
        if _PAT_EMAIL.match(parte) and parte.casefold() not in {c.casefold() for c in salida}:
            salida.append(parte)
    return salida


def corregir_contactos(contactos: list[dict]) -> tuple[list[dict], list[dict], list[dict]]:
    """(contactos corregidos, cambios [{antes, despues, contacto}], contactos sin arreglo).

    Un contacto cuyo correo no es UN correo válido se reemplaza por uno por cada correo que se le pueda leer (mismos
    datos, otro correo). No agrega a nadie que ya figure igual en esa planta y especie, y los que no tienen ningún
    correo legible se dejan como están y se informan."""
    def llave(c: dict, correo: str) -> tuple:
        return (c.get("servicio") or "", c.get("tipo"), plano(c.get("sold_to")), plano(c.get("ship_to")),
                plano(c.get("especie")), correo.casefold())

    existentes = {llave(c, str(c.get("email") or "").strip()) for c in contactos if _PAT_EMAIL.match(str(c.get("email") or "").strip())}
    sig_id = max((c.get("id", 0) for c in contactos if isinstance(c.get("id", 0), int)), default=0) + 1
    nuevos: list[dict] = []
    cambios: list[dict] = []
    sin_arreglo: list[dict] = []
    for c in contactos:
        texto = str(c.get("email") or "").strip()
        if not texto or _PAT_EMAIL.match(texto):
            nuevos.append(c)
            continue
        correos = separar_correos(texto)
        if not correos:
            nuevos.append(c)
            sin_arreglo.append(c)
            continue
        agregados: list[str] = []
        for correo in correos:
            k = llave(c, correo)
            if k in existentes:
                continue
            existentes.add(k)
            copia = dict(c)
            copia["email"] = correo
            if str(c.get("nombre") or "").strip() in ("", texto):
                copia["nombre"] = correo
            if agregados:
                copia["id"] = sig_id
                sig_id += 1
            nuevos.append(copia)
            agregados.append(correo)
        cambios.append({"antes": texto, "despues": agregados or correos, "contacto": c})
    return nuevos, cambios, sin_arreglo
