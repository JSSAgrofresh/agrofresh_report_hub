"""
Mantenedor "Listados": fuente de verdad de los valores estandarizados y
seleccionables de Especie y Variedad (Sold To / Ship To siguen viviendo en
cliente/planta -ver catalogo.py-, ya son la fuente de verdad de esos dos y no
se duplican acá).

Modelo de datos (valor_lista, tipo especie/variedad):
- Valor "crudo": una fila normal (es_estandar=false). Si `fusionado_en_id` es
  NULL, es un valor seleccionable tal cual. Si apunta a otra fila, significa
  que un administrador lo asignó a esa variedad estandarizada -queda inactivo
  para no aparecer duplicado en los selects, pero NUNCA se borra: las
  solicitudes históricas guardan el texto tal cual, no un ID-.
- Variedad "estándar": una fila con es_estandar=true. Es el valor que
  realmente ofrecen los selects de la app junto con los valores crudos sin
  asignar. Se crea, renombra y elimina a mano desde /estandares.

"Homogenizar" (GET /{tipo}/homogenizar) NUNCA fusiona nada: solo agrupa
valores crudos que probablemente son el mismo dato mal escrito (mayúsculas,
acentos, espacios, puntuación -alta confianza-, o variantes ortográficas
obvias -a revisar-) como ayuda de revisión. Un mismo grupo de similitud puede
contener MÁS DE UNA variedad real (ej. "Packham" y "Packham's Triumph" caen
en el mismo grupo por nombre parecido, pero son variedades distintas), así
que el administrador decide libremente cuántas variedades estándar crea a
partir de un grupo y qué valores le asigna a cada una -ver /estandares y
/{tipo}/{id}/asignar-.
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


class AsignarIn(BaseModel):
    estandar_id: int | None = None


def _buscar_o_crear_estandar(cur, tipo: str, valor_crudo: str) -> int:
    """Encuentra la variedad estándar con ese nombre (para que crear
    "Packham" desde dos grupos de similitud distintos termine en la MISMA
    fila) o la crea si no existe. Caso normal: el nombre elegido para la
    variedad estándar coincide con uno de los valores crudos que se le están
    por asignar (ej. estandarizar "Packham" a partir de un grupo que incluye
    justamente "Packham") -en ese caso esa fila se "promueve" a variedad
    estándar en vez de tratarse como un choque."""
    valor = normalizar_texto_general(valor_crudo)
    clave = clave_normalizada(valor)
    cur.execute("SELECT id, es_estandar FROM valor_lista WHERE tipo = %s AND valor_normalizado = %s", (tipo, clave))
    existente = cur.fetchone()
    if existente:
        if not existente["es_estandar"]:
            cur.execute(
                "UPDATE valor_lista SET es_estandar = true, activo = true, fusionado_en_id = NULL, valor = %s WHERE id = %s",
                (valor, existente["id"]),
            )
        return existente["id"]
    cur.execute(
        "INSERT INTO valor_lista (tipo, valor, valor_normalizado, activo, es_estandar) VALUES (%s, %s, %s, true, true) RETURNING id",
        (tipo, valor, clave),
    )
    return cur.fetchone()["id"]


@router.get("/{tipo}")
def listar_valores(
    tipo: str,
    incluir_inactivos: bool = Query(False),
    buscar: str | None = Query(None),
) -> list[dict[str, Any]]:
    _validar_tipo(tipo)
    with conexion() as conn, cursor_dict(conn) as cur:
        sql = "SELECT id, tipo, valor, activo, es_estandar, fusionado_en_id, creado_en FROM valor_lista WHERE tipo = %s"
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
            "SELECT id, valor FROM valor_lista WHERE tipo = %s AND activo = true AND es_estandar = false AND fusionado_en_id IS NULL ORDER BY valor",
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


@router.get("/{tipo}/estandares")
def listar_estandares(tipo: str) -> dict[str, Any]:
    """Cada variedad estándar con los valores crudos que un administrador le
    asignó, más los valores crudos activos que todavía no se asignaron a
    ninguna. Es la vista de "clasificación final" -a diferencia de
    /homogenizar, que es solo la ayuda de revisión-."""
    _validar_tipo(tipo)
    with conexion() as conn, cursor_dict(conn) as cur:
        cur.execute(
            "SELECT id, valor, activo FROM valor_lista WHERE tipo = %s AND es_estandar = true ORDER BY valor",
            (tipo,),
        )
        estandares = cur.fetchall()
        cur.execute(
            "SELECT id, valor, fusionado_en_id FROM valor_lista WHERE tipo = %s AND es_estandar = false AND fusionado_en_id IS NOT NULL ORDER BY valor",
            (tipo,),
        )
        asignados = cur.fetchall()
        cur.execute(
            "SELECT id, valor FROM valor_lista WHERE tipo = %s AND es_estandar = false AND fusionado_en_id IS NULL AND activo = true ORDER BY valor",
            (tipo,),
        )
        sin_asignar = cur.fetchall()

    por_estandar: dict[int, list[dict]] = {}
    for a in asignados:
        por_estandar.setdefault(a["fusionado_en_id"], []).append({"id": a["id"], "valor": a["valor"]})

    return {
        "estandares": [
            {"id": e["id"], "valor": e["valor"], "activo": e["activo"], "valores_asignados": por_estandar.get(e["id"], [])}
            for e in estandares
        ],
        "sin_asignar": [{"id": s["id"], "valor": s["valor"]} for s in sin_asignar],
    }


@router.post("/{tipo}/estandares")
def crear_estandar(tipo: str, body: ValorListaIn) -> dict[str, Any]:
    """Crea una variedad estándar con nombre completamente libre -no tiene
    que derivarse del valor más común de ningún grupo-. Si el administrador
    reutiliza un nombre que ya existe como estándar, se reusa esa misma fila
    en vez de duplicarla (para que "Packham" propuesto desde dos grupos de
    similitud distintos termine en la misma variedad)."""
    _validar_tipo(tipo)
    if not body.valor.strip():
        raise HTTPException(400, "El nombre de la variedad estándar no puede estar vacío.")
    with conexion() as conn, cursor_dict(conn) as cur:
        estandar_id = _buscar_o_crear_estandar(cur, tipo, body.valor)
        return {"id": estandar_id}


@router.put("/{tipo}/estandares/{estandar_id}")
def editar_estandar(tipo: str, estandar_id: int, body: ValorListaIn) -> dict[str, str]:
    _validar_tipo(tipo)
    valor = normalizar_texto_general(body.valor)
    if not valor:
        raise HTTPException(400, "El valor no puede estar vacío.")
    clave = clave_normalizada(valor)
    with conexion() as conn, cursor_dict(conn) as cur:
        cur.execute(
            "SELECT id FROM valor_lista WHERE tipo = %s AND valor_normalizado = %s AND id != %s",
            (tipo, clave, estandar_id),
        )
        if cur.fetchone():
            raise HTTPException(409, f"Ya existe otro valor equivalente en {tipo}.")
        cur.execute(
            "UPDATE valor_lista SET valor = %s, valor_normalizado = %s, activo = %s WHERE id = %s AND tipo = %s AND es_estandar = true",
            (valor, clave, body.activo, estandar_id, tipo),
        )
        if cur.rowcount == 0:
            raise HTTPException(404, "Variedad estándar no encontrada")
        return {"estado": "ok"}


@router.delete("/{tipo}/estandares/{estandar_id}")
def eliminar_estandar(tipo: str, estandar_id: int) -> dict[str, str]:
    """Elimina la variedad estándar y libera a todos los valores crudos que
    tenía asignados -vuelven a quedar activos y sin asignar, no se borran-."""
    _validar_tipo(tipo)
    with conexion() as conn, cursor_dict(conn) as cur:
        cur.execute(
            "UPDATE valor_lista SET activo = true, fusionado_en_id = NULL WHERE tipo = %s AND fusionado_en_id = %s",
            (tipo, estandar_id),
        )
        cur.execute("DELETE FROM valor_lista WHERE id = %s AND tipo = %s AND es_estandar = true", (estandar_id, tipo))
        if cur.rowcount == 0:
            raise HTTPException(404, "Variedad estándar no encontrada")
        return {"estado": "ok"}


@router.post("/{tipo}/{valor_id}/asignar")
def asignar_valor(tipo: str, valor_id: int, body: AsignarIn) -> dict[str, str]:
    """Asigna (o desasigna, con estandar_id=null) un valor crudo a una
    variedad estándar. Es la operación atómica detrás de todo el flujo:
    "crear variedad(es) libremente desde un grupo de similitud" es, para el
    backend, una variedad nueva + N llamadas a este endpoint."""
    _validar_tipo(tipo)
    with conexion() as conn, cursor_dict(conn) as cur:
        cur.execute(
            "SELECT id, es_estandar FROM valor_lista WHERE id = %s AND tipo = %s",
            (valor_id, tipo),
        )
        fila = cur.fetchone()
        if not fila:
            raise HTTPException(404, "Valor no encontrado")
        if fila["es_estandar"]:
            # Puede pasar sin querer: el valor que se está "asignando" es el
            # mismo que acaba de promoverse a variedad estándar (ver
            # _buscar_o_crear_estandar). Asignarlo a sí mismo es un no-op.
            if body.estandar_id == valor_id:
                return {"estado": "ok"}
            raise HTTPException(400, "Una variedad estándar no se puede asignar a otra.")

        if body.estandar_id is None:
            cur.execute(
                "UPDATE valor_lista SET activo = true, fusionado_en_id = NULL WHERE id = %s",
                (valor_id,),
            )
            return {"estado": "ok"}

        cur.execute(
            "SELECT 1 FROM valor_lista WHERE id = %s AND tipo = %s AND es_estandar = true",
            (body.estandar_id, tipo),
        )
        if not cur.fetchone():
            raise HTTPException(404, "La variedad estándar de destino no existe.")
        cur.execute(
            "UPDATE valor_lista SET activo = false, fusionado_en_id = %s WHERE id = %s",
            (body.estandar_id, valor_id),
        )
        return {"estado": "ok"}
