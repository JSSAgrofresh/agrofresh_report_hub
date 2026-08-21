"""
Mantenedor "Listados": fuente de verdad de los valores estandarizados y
seleccionables de Especie y Variedad (Sold To / Ship To siguen viviendo en
cliente/planta -ver catalogo.py-, ya son la fuente de verdad de esos dos y no
se duplican acá).

Cada valor vive en `valor_lista` (tipo, valor, activo). La normalización
distingue dos casos:
- Especie/Variedad: se guardan en formato "Primera Letra Mayúscula".
- Sold To/Ship To: NUNCA pasan por acá -no se tocan-.

"Homogenizar" agrupa valores que son claramente el mismo dato escrito de
formas distintas (mayúsculas, acentos, espacios, puntuación -alta confianza,
agrupados automáticamente-, o variantes ortográficas obvias -confianza
"revisar", solo sugeridas-) para que un administrador las confirme y las
fusione en un único valor estándar. Fusionar NUNCA borra el valor original:
lo desactiva y lo deja apuntando al valor estándar (fusionado_en_id), así
las solicitudes históricas -que guardan el texto tal cual, no un ID- no se
ven afectadas.
"""
import re
import unicodedata
from collections import Counter
from difflib import SequenceMatcher
from typing import Any

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from .db import conexion, cursor_dict

router = APIRouter(prefix="/api/listados", tags=["listados"])

TIPOS_VALIDOS = ("especie", "variedad")


def _validar_tipo(tipo: str) -> str:
    if tipo not in TIPOS_VALIDOS:
        raise HTTPException(404, f"Listado '{tipo}' no existe. Tipos disponibles: {', '.join(TIPOS_VALIDOS)}")
    return tipo


def normalizar_texto_general(valor: str) -> str:
    """"uva"/"UVA"/"uVa" -> "Uva". Solo para listas de texto general
    (Especie, Variedad) -NUNCA para Sold To/Ship To, que se guardan tal cual
    los entrega el cliente o SAP-."""
    limpio = re.sub(r"\s+", " ", (valor or "").strip())
    return limpio.title() if limpio else limpio


def clave_normalizada(valor: str) -> str:
    """Clave de agrupación insensible a mayúsculas, acentos, espacios y
    puntuación: 'Thompson', 'THOMPSON' y ' thompson  ' comparten la misma
    clave, pero 'Thompson' y 'Thompson Seedless' NO (esas se detectan aparte,
    como candidatas "a revisar", no como duplicado automático)."""
    v = unicodedata.normalize("NFKD", valor or "")
    v = "".join(c for c in v if not unicodedata.combining(c))
    v = re.sub(r"[^a-z0-9]+", " ", v.lower()).strip()
    return re.sub(r"\s+", " ", v)


class ValorListaIn(BaseModel):
    valor: str
    activo: bool = True


class HomogenizarIn(BaseModel):
    ids: list[int]
    valor_estandar: str


@router.get("/{tipo}")
def listar_valores(
    tipo: str,
    incluir_inactivos: bool = Query(False),
    buscar: str | None = Query(None),
) -> list[dict[str, Any]]:
    _validar_tipo(tipo)
    with conexion() as conn, cursor_dict(conn) as cur:
        sql = "SELECT id, tipo, valor, activo, fusionado_en_id, creado_en FROM valor_lista WHERE tipo = %s"
        params: list[Any] = [tipo]
        if not incluir_inactivos:
            sql += " AND activo = true"
        if buscar:
            sql += " AND valor ILIKE %s"
            params.append(f"%{buscar}%")
        sql += " ORDER BY valor"
        cur.execute(sql, params)
        return cur.fetchall()


@router.post("/{tipo}")
def crear_valor(tipo: str, body: ValorListaIn) -> dict[str, Any]:
    _validar_tipo(tipo)
    valor = normalizar_texto_general(body.valor)
    if not valor:
        raise HTTPException(400, "El valor no puede estar vacío.")
    clave = clave_normalizada(valor)
    with conexion() as conn, cursor_dict(conn) as cur:
        cur.execute("SELECT id FROM valor_lista WHERE tipo = %s AND valor_normalizado = %s", (tipo, clave))
        if cur.fetchone():
            raise HTTPException(409, f"Ya existe un valor equivalente en {tipo}.")
        cur.execute(
            "INSERT INTO valor_lista (tipo, valor, valor_normalizado, activo) VALUES (%s, %s, %s, %s) RETURNING id",
            (tipo, valor, clave, body.activo),
        )
        return {"id": cur.fetchone()["id"]}


@router.put("/{tipo}/{valor_id}")
def editar_valor(tipo: str, valor_id: int, body: ValorListaIn) -> dict[str, str]:
    _validar_tipo(tipo)
    valor = normalizar_texto_general(body.valor)
    if not valor:
        raise HTTPException(400, "El valor no puede estar vacío.")
    clave = clave_normalizada(valor)
    with conexion() as conn, cursor_dict(conn) as cur:
        cur.execute(
            "SELECT id FROM valor_lista WHERE tipo = %s AND valor_normalizado = %s AND id != %s",
            (tipo, clave, valor_id),
        )
        if cur.fetchone():
            raise HTTPException(409, f"Ya existe otro valor equivalente en {tipo}.")
        cur.execute(
            "UPDATE valor_lista SET valor = %s, valor_normalizado = %s, activo = %s WHERE id = %s AND tipo = %s",
            (valor, clave, body.activo, valor_id, tipo),
        )
        if cur.rowcount == 0:
            raise HTTPException(404, "Valor no encontrado")
        return {"estado": "ok"}


@router.delete("/{tipo}/{valor_id}")
def eliminar_valor(tipo: str, valor_id: int) -> dict[str, str]:
    _validar_tipo(tipo)
    with conexion() as conn, cursor_dict(conn) as cur:
        # No se borra físicamente un valor que ya fue absorbido por otro en
        # una homogenización -se perdería la trazabilidad-; ahí solo cabe
        # desactivar (PUT con activo=false).
        cur.execute("SELECT 1 FROM valor_lista WHERE fusionado_en_id = %s", (valor_id,))
        if cur.fetchone():
            raise HTTPException(
                409,
                "Este valor es el resultado de una homogenización: no se puede eliminar, solo desactivar.",
            )
        cur.execute("DELETE FROM valor_lista WHERE id = %s AND tipo = %s", (valor_id, tipo))
        if cur.rowcount == 0:
            raise HTTPException(404, "Valor no encontrado")
        return {"estado": "ok"}


@router.get("/{tipo}/homogenizar")
def candidatos_homogenizacion(tipo: str) -> list[dict[str, Any]]:
    """Agrupa valores activos que probablemente son el mismo dato repetido.
    Nunca fusiona nada solo: solo propone -ver /homogenizar/aplicar-."""
    _validar_tipo(tipo)
    with conexion() as conn, cursor_dict(conn) as cur:
        cur.execute(
            "SELECT id, valor FROM valor_lista WHERE tipo = %s AND activo = true AND fusionado_en_id IS NULL ORDER BY valor",
            (tipo,),
        )
        filas = cur.fetchall()

    for f in filas:
        f["_clave"] = clave_normalizada(f["valor"])

    # Etapa 1 (alta confianza): misma clave normalizada -difieren solo en
    # mayúsculas, acentos, espacios o puntuación-.
    por_clave: dict[str, list[dict]] = {}
    for f in filas:
        por_clave.setdefault(f["_clave"], []).append(f)

    grupos: list[dict[str, Any]] = []
    usados_ids: set[int] = set()
    for miembros in por_clave.values():
        if len(miembros) > 1:
            propuesto = Counter(m["valor"] for m in miembros).most_common(1)[0][0]
            grupos.append(
                {
                    "confianza": "alta",
                    "valores": [{"id": m["id"], "valor": m["valor"]} for m in miembros],
                    "valor_propuesto": normalizar_texto_general(propuesto),
                }
            )
            usados_ids.update(m["id"] for m in miembros)

    # Etapa 2 (a revisar): variantes ortográficas obvias entre claves
    # DISTINTAS, nunca solo "se parecen un poco". Dos criterios, cada uno
    # pensado para no confundir nombres realmente distintos:
    #   (a) una clave es, palabra por palabra, PREFIJO completo de la otra
    #       -"Thompson" de "Thompson Seedless"-: nunca por substring suelto,
    #       porque eso encadenaría cualquier cosa que comparta un prefijo
    #       corto y genérico (ej. "Pears", "Summer").
    #   (b) mismo número de palabras y altísima similitud de caracteres
    #       -typos como "Honey Crips"/"Honey Crisp"-. El umbral es alto a
    #       propósito: a 0.90 ya agrupaba "Gala"/"Galaxy", que son
    #       variedades distintas, no un typo.
    # Se agrupan por conjuntos disjuntos (union-find) para juntar cadenas de
    # variantes (A~B~C).
    restantes = [f for f in filas if f["id"] not in usados_ids]
    padre = {f["id"]: f["id"] for f in restantes}

    def encontrar(x: int) -> int:
        while padre[x] != x:
            padre[x] = padre[padre[x]]
            x = padre[x]
        return x

    def unir(a: int, b: int) -> None:
        ra, rb = encontrar(a), encontrar(b)
        if ra != rb:
            padre[ra] = rb

    LARGO_MIN_PREFIJO = 6
    UMBRAL_TIPO = 0.93
    for i in range(len(restantes)):
        for j in range(i + 1, len(restantes)):
            a, b = restantes[i], restantes[j]
            if not a["_clave"] or not b["_clave"]:
                continue
            ta, tb = a["_clave"].split(" "), b["_clave"].split(" ")
            corta, larga = (ta, tb) if len(ta) <= len(tb) else (tb, ta)
            es_prefijo = (
                len(corta) < len(larga)
                and larga[: len(corta)] == corta
                and len(" ".join(corta)) >= LARGO_MIN_PREFIJO
            )
            ratio = SequenceMatcher(None, a["_clave"], b["_clave"]).ratio()
            mismo_n_palabras = len(ta) == len(tb)
            if es_prefijo or (mismo_n_palabras and ratio >= UMBRAL_TIPO):
                unir(a["id"], b["id"])

    por_raiz: dict[int, list[dict]] = {}
    for f in restantes:
        por_raiz.setdefault(encontrar(f["id"]), []).append(f)

    for miembros in por_raiz.values():
        if len(miembros) > 1:
            propuesto = min(miembros, key=lambda m: len(m["valor"]))["valor"]
            grupos.append(
                {
                    "confianza": "revisar",
                    "valores": [{"id": m["id"], "valor": m["valor"]} for m in miembros],
                    "valor_propuesto": normalizar_texto_general(propuesto),
                }
            )

    grupos.sort(key=lambda g: (g["confianza"] != "alta", -len(g["valores"])))
    return grupos


@router.post("/{tipo}/homogenizar/aplicar")
def aplicar_homogenizacion(tipo: str, body: HomogenizarIn) -> dict[str, Any]:
    """Fusiona los valores de `ids` en un único valor estándar activo. Los
    demás quedan desactivados y apuntando al estándar (fusionado_en_id) -no
    se borran, no se tocan solicitudes históricas ya guardadas con el texto
    original-."""
    _validar_tipo(tipo)
    if len(body.ids) < 2:
        raise HTTPException(400, "Selecciona al menos 2 valores para homogenizar.")
    valor_estandar = normalizar_texto_general(body.valor_estandar)
    if not valor_estandar:
        raise HTTPException(400, "El valor estándar no puede estar vacío.")
    clave = clave_normalizada(valor_estandar)

    with conexion() as conn, cursor_dict(conn) as cur:
        cur.execute("SELECT id FROM valor_lista WHERE tipo = %s AND id = ANY(%s)", (tipo, body.ids))
        filas = cur.fetchall()
        if len(filas) != len(set(body.ids)):
            raise HTTPException(404, "Alguno de los valores seleccionados ya no existe.")

        cur.execute("SELECT id FROM valor_lista WHERE tipo = %s AND valor_normalizado = %s", (tipo, clave))
        existente = cur.fetchone()
        if existente and existente["id"] in body.ids:
            canonico_id = existente["id"]
            cur.execute("UPDATE valor_lista SET valor = %s WHERE id = %s", (valor_estandar, canonico_id))
        elif existente:
            canonico_id = existente["id"]
        else:
            cur.execute(
                "INSERT INTO valor_lista (tipo, valor, valor_normalizado, activo) VALUES (%s, %s, %s, true) RETURNING id",
                (tipo, valor_estandar, clave),
            )
            canonico_id = cur.fetchone()["id"]

        otros = [i for i in body.ids if i != canonico_id]
        if otros:
            cur.execute(
                "UPDATE valor_lista SET activo = false, fusionado_en_id = %s WHERE id = ANY(%s)",
                (canonico_id, otros),
            )
        return {"estado": "ok", "valor_estandar_id": canonico_id}
