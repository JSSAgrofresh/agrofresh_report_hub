"""Cruce de los clientes del plan de entregables con las plantas del sistema.

El plan nombra a los clientes por planta y con abreviaturas de los comerciales («DOLE LONTUE»,
«VERFRUT RAPEL»); el sistema usa los nombres oficiales de Listados (Sold To + Ship To). Como la
lista de distribución ya dice qué plantas atiende cada comercial, el cruce se acota a ESAS plantas:
un cliente del plan de Labarca solo se busca entre las plantas donde Labarca es el comercial.

Todo es lectura y funciones puras: se prueba sin base. No confirma nada: propone, y una persona
elige el nombre oficial.
"""
from __future__ import annotations

import re
import unicodedata
from typing import Any, Iterable

# Palabras que no distinguen una planta de otra.
RUIDO = {
    "PLANTA", "SPA", "SA", "S", "A", "LTDA", "LIMITADA", "SOCIEDAD", "DE", "DEL", "LA", "LAS", "LOS", "Y", "E", "CIA",
    "EIRL", "P", "AGRICOLA", "AGRICOLAS", "COMERCIALIZADORA", "EXPORTADORA", "FRUTICOLA", "SERVICIOS", "INVERSIONES",
    "AGROINDUSTRIAL", "CHILE", "CHILENA", "PACKING", "FRIGORIFICO",
}


def _sin_tildes(texto: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", str(texto or "")) if unicodedata.category(c) != "Mn")


def normalizar(texto: str | None) -> str:
    t = _sin_tildes(texto or "").upper().replace(".", "")
    return " ".join(re.sub(r"[^A-Z0-9 ]+", " ", t).split())


def tokens(texto: str | None, con_ruido: bool = False) -> set[str]:
    t = set(normalizar(texto).split())
    return t if con_ruido else {x for x in t if x not in RUIDO}


# ── ¿quién es el comercial en la lista de distribución? ──

def correos_de_comercial(nombre_plan: str, contactos: Iterable[dict]) -> list[str]:
    """Correos de la lista de distribución que corresponden al comercial del plan
    («JC Labarca», «R. TRAVERSO»…). Compara las palabras largas del nombre con el correo y con
    el nombre del contacto; devuelve los de mejor puntaje (puede haber más de uno: se muestran)."""
    palabras = [p for p in normalizar(nombre_plan).lower().split() if len(p) >= 4]
    if not palabras:
        return []
    puntajes: dict[str, int] = {}
    for c in contactos:
        email = str(c.get("email") or "").strip().lower()
        if not email:
            continue
        texto = _sin_tildes(email.split("@")[0] + " " + str(c.get("nombre") or "")).lower()
        p = sum(1 for w in palabras if w in texto)
        if p:
            puntajes[email] = max(puntajes.get(email, 0), p)
    if not puntajes:
        return []
    mejor = max(puntajes.values())
    return sorted(e for e, p in puntajes.items() if p == mejor)


def plantas_de(estado: dict[Any, dict], correos: Iterable[str]) -> list[tuple[str, str]]:
    """Plantas (Sold To, Ship To) donde alguno de esos correos es el comercial.
    `estado` es lo que arma `listas_distribucion.estado_desde_contactos`."""
    quiero = {c.casefold() for c in correos}
    return sorted(
        (f["sold_to"], f["ship_to"])
        for f in estado.values()
        if quiero & {e.casefold() for e in f.get("comercial", [])}
    )


# ── cliente del plan → planta del sistema ──

def _sin_planta(ship_to: str) -> str:
    return normalizar(re.sub(r"(?i)^planta\s+|\s+planta\b", "", ship_to or ""))


def proponer(cliente_plan: str, plantas: Iterable[tuple[str, str]], n: int = 3) -> dict[str, Any]:
    """Qué planta del sistema es este cliente del plan.

    estado: «Igual» (mismo nombre que un Ship To), «Probable» (una sola planta contiene todas las
    palabras del cliente), «Varias» (más de una las contiene), «Revisar» (comparten algunas) o
    «Sin candidato»."""
    plan_norm = normalizar(cliente_plan)
    tp = tokens(cliente_plan)
    puntuadas: list[tuple[float, bool, tuple[str, str]]] = []
    for sold, ship in plantas:
        if plan_norm and plan_norm in (normalizar(ship), _sin_planta(ship)):
            return {"estado": "Igual", "propuesta": (sold, ship), "candidatas": [(sold, ship)]}
        if not tp:
            continue
        t_ship, t_sold = tokens(ship), tokens(sold)
        cobertura = len(tp & (t_ship | t_sold)) / len(tp)
        puntuadas.append((cobertura, bool(tp & t_ship), (sold, ship)))
    puntuadas.sort(key=lambda x: (-x[0], not x[1], x[2]))
    top = [x for x in puntuadas if x[0] >= 0.5][:n]
    if not top:
        return {"estado": "Sin candidato", "propuesta": None, "candidatas": []}
    completas = [x for x in puntuadas if x[0] >= 0.999 and x[1]]
    if len(completas) == 1:
        return {"estado": "Probable", "propuesta": completas[0][2], "candidatas": [completas[0][2]]}
    if len(completas) > 1:
        return {"estado": "Varias", "propuesta": None, "candidatas": [x[2] for x in completas[:n]]}
    return {"estado": "Revisar", "propuesta": None, "candidatas": [x[2] for x in top]}
