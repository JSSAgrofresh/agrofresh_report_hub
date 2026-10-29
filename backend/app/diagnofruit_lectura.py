"""
Lector del informe de Diagnofruit («REPORTE DE RESULTADOS», cuantificación de microorganismos): lo que hace el
Converter (`leerDiagnofruit` en public/modules/converter.html), escrito en Python para que Ingreso de Informes pueda
cargar un informe que llegó por correo.

**Formato nuevo (28-10-2026).** Diagnofruit pega en el encabezado de la hoja 1 lo que sale de la hoja «Para el
informe» del Excel de la solicitud (`app/hoja_informe.py`):

  * «Predio/planta:» = `Sold To // Ship To` (los nombres OFICIALES de Listados);
  * «Nombre de muestra:» = la cadena de la solicitud, separada por « // », en la posición fija de `CAMPOS_CADENA`
    (OT, tipo de servicio, fecha solicitud, fecha muestreo, hora, especie, variedad, línea, CSG, lote, posición, cámara,
    orden, kilos, producto, tipo de muestra, muestreador, email, gasto, observación). La cadena es larga y el PDF la
    parte en dos líneas: se lee hasta la etiqueta siguiente («Especie:»).

Con eso el informe trae todo lo necesario y no depende de buscar la solicitud. Si la solicitud existe, su dato manda
(como en el Converter); si el informe es del formato anterior (sin cadena), se completa desde la solicitud por la OT.

Devuelve la misma forma que `quiteca_lectura.leer_quiteca`, así que `fila_cruda` y el resto del camino son los mismos.
**Si cambias el lector del Converter, revisa este.**
"""
from __future__ import annotations

import re
from typing import Any

from . import quiteca_lectura as q
from .hoja_informe import CAMPOS_CADENA, partes_de_cadena

_POS = {clave: i for i, (clave, _) in enumerate(CAMPOS_CADENA)}


def es_informe_diagnofruit(texto: str) -> bool:
    return "diagnofruit" in q.plano(texto)


def _fecha(texto: str, etiqueta: str, nombre: str, desde: str | None, avisos: list[str]) -> str | None:
    """«Fecha de muestreo: 1/10/2026», «Fecha de recepción: 10/1/2026»: la recepción, la ejecución y el informe no
    pueden quedar ANTES del muestreo, así que se queda con la lectura que no queda antes (espejo de `fechaDiagnofruit`)."""
    m = re.search(etiqueta + r":\s*([\d/\-]+)", texto, re.I)
    if not m:
        return None
    f = q.a_fecha(m.group(1), avisos)
    dm = re.search(r"(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})", m.group(1))
    if f and desde and (q.a_iso(f) or "") < (q.a_iso(desde) or "") and dm:
        vuelta = q.a_fecha(f"{dm.group(2)}/{dm.group(1)}/{dm.group(3)}", None)
        if vuelta and (q.a_iso(vuelta) or "") >= (q.a_iso(desde) or ""):
            avisos.append(f"La fecha {nombre} venía como {m.group(1)} (antes del muestreo): se leyó {vuelta} (mes/día)")
            f = vuelta
    return f


def _nombre_de_muestra(texto: str) -> str:
    """Lo que dice «Nombre de muestra:», aunque el PDF lo parta en varias líneas (hasta la etiqueta que sigue)."""
    m = re.search(r"Nombre de muestra:\s*([\s\S]*?)\s*(?:\n\s*(?:Especie|Localidad|An[áa]lisis realizado):|$)", texto)
    nombre = re.sub(r"\s+", " ", m.group(1)).strip() if m else ""
    return "" if re.fullmatch(r"[-\s]*", nombre) else nombre


def _cadena(nombre_muestra: str) -> dict[str, str]:
    """La cadena de la solicitud dentro del nombre de muestra («M1 - OT -DIAG0009 // Línea de proceso // …»), por clave.
    Vacío si el nombre no es una cadena (informe del formato anterior)."""
    if nombre_muestra.count("//") < 6:
        return {}
    partes = partes_de_cadena(nombre_muestra)
    return {clave: (partes[i] if i < len(partes) else "") for clave, i in _POS.items()}


def _servicio(tipo_aplicacion: str) -> str:
    t = q.plano(tipo_aplicacion or "")
    return "Actimist" if ("fogger" in t or "actimist" in t) else "Linea de Proceso"


def leer_diagnofruit(texto: str) -> dict[str, Any]:
    inf: dict[str, Any] = {"datos": {}, "resultados": {}, "sueltos": [], "avisos": []}
    d, avisos = inf["datos"], inf["avisos"]
    d["Laboratorio"] = "Diagnofruit"
    tipo = q.campo(texto, "Tipo de muestra:", "Fecha")
    d["Tipo Muestra"] = "Agua" if tipo and "agua" in q.plano(tipo) else tipo

    f_muestreo = _fecha(texto, "Fecha de muestreo", "de muestreo", None, avisos)
    d["Fecha entrada"] = _fecha(texto, r"Fecha de recepci[óo]n", "de recepción", f_muestreo, avisos)
    d["Fecha Análisis"] = _fecha(texto, r"Fecha de ejecuci[óo]n", "de ejecución", f_muestreo, avisos)
    d["Fecha Informe"] = _fecha(texto, "Fecha de Informe", "del informe", f_muestreo, avisos)
    d["Fecha Muestreo"] = f_muestreo

    reporte = re.search(r"Reporte n[úu]mero:\s*(\S+)", texto)
    if reporte:
        d["N° Solicitud"] = reporte.group(1)
    nombre = _nombre_de_muestra(texto)
    cad = _cadena(nombre)

    # La OT es lo único que hace falta para traer el resto: «M1 - OT -DIAG0007» → OT-DIAG0007.
    cod = (re.search(r"\b(DIAG\d+)\b", cad.get("numero_solicitud") or nombre, re.I) or re.search(r"\b(?:OT-?\s*)?(DIAG\d+)\b", texto, re.I))
    if cod:
        d["OT"] = "OT-" + cod.group(1).upper()

    obs = []
    if reporte:
        obs.append("Reporte Diagnofruit N° " + reporte.group(1))
    if cad:
        # Predio/planta = «Sold To // Ship To» oficiales.
        planta = q.campo(texto, "Predio/planta:") or ""
        if "//" in planta:
            sold, ship = (p.strip() for p in planta.split("//", 1))
            d["Sold To"], d["Ship To"] = sold or None, ship or None
        d["Tipo Aplicación"] = cad["tipo_aplicacion"] or None
        d["Fecha Solicitud"] = q.a_fecha(cad["fecha_solicitud"], avisos)
        f_sol = q.a_fecha(cad["fecha_muestreo"], avisos)
        if f_sol:
            if f_muestreo and f_sol != f_muestreo:
                avisos.append(f"Diagnofruit anota el muestreo el {f_muestreo} y la solicitud el {f_sol}: se usó el de la solicitud")
            d["Fecha Muestreo"] = f_sol
        d["Hora Muestreo"] = q.a_hora(cad["hora_muestreo"])
        for clave, columna in (
            ("especie", "Especie"), ("variedad", "Variedad"), ("linea_proceso", "Línea Proceso"), ("csg_productor", "CSG"),
            ("lote", "Lote"), ("posicion_muestreo", "Posición Muestreo"), ("numero_camara", "N° Cámara"),
            ("numero_orden", "N° Orden"), ("producto_utilizado", "Producto Utilizado"), ("nombre_muestreador", "Nombre Muestreador"),
            ("email_solicitante", "Email Solicitante"),
        ):
            d[columna] = cad[clave] or None
        d["Kilos Procesados (KG)"] = q.a_numero(cad["kilos_procesados"])
        d["Gasto"] = q.a_numero(cad["gasto"])
        if cad["tipo_muestra"]:
            d["Tipo Muestra"] = cad["tipo_muestra"]
        if d.get("OT"):
            obs.append("Solicitud " + d["OT"])
        if cad["observacion"]:
            obs.append(cad["observacion"])
    else:
        # Formato anterior: lo que escribe Diagnofruit no es el nombre oficial; queda solo como pista.
        if nombre:
            obs.append("Muestra: " + nombre)
        planta = q.campo(texto, "Predio/planta:")
        if planta and not q.plano(planta).startswith("no "):
            obs.append("Planta según Diagnofruit: " + planta)
        loc = q.campo(texto, "Localidad:", r"U\. prod")
        if loc and not q.plano(loc).startswith("no "):
            obs.append("Localidad: " + loc)
    d["Observación"] = " · ".join(obs) or None
    d["Tipo de servicio"] = _servicio(d.get("Tipo Aplicación") or "") if d.get("Tipo Aplicación") else None

    dentro = False
    for linea in texto.split("\n"):
        p = q.plano(linea)
        if p.startswith("pat") and "resultado" in p:
            dentro = True
            continue
        if not dentro:
            continue
        # La tabla de umbrales (Óptimo, Moderado, Peligroso) viene justo debajo de los resultados.
        if p.startswith(("nivel", "carozos", "metodologia", "umbrales")):
            break
        mayor = re.match(r"^\s*([A-Za-zÁÉÍÓÚáéíóúñÑ.\s]+?)\s+Mayor a\s+([\d.,]+)\s+(\S+)", linea, re.I)
        if mayor:
            q.guardar(inf, mayor.group(1), ">" + mayor.group(2))
            continue
        r = re.match(r"^\s*([A-Za-zÁÉÍÓÚáéíóúñÑ.\s]+?)\s+(BLD|ND|[\d.,]+)\s+(\S+)", linea)
        if r:
            q.guardar(inf, r.group(1), r.group(2))
    return _cerrar(inf)


def _cerrar(inf: dict[str, Any]) -> dict[str, Any]:
    """Lo que `analizar` del Converter hace después de leer: quita lo vacío y avisa lo obligatorio que falta."""
    d, avisos = inf["datos"], inf["avisos"]
    for k in [k for k, v in d.items() if v is None or v == "" or v == "-"]:
        del d[k]
    faltan = [c for c in q.OBLIGATORIOS if not d.get(c)]
    avisos[:] = [a for a in avisos if not a.startswith("Sin dato para")]
    if faltan:
        avisos.append("Sin dato para: " + ", ".join(faltan))
    if not inf["resultados"] and not inf["sueltos"]:
        avisos.append("No se encontró ningún resultado en el informe")
    return inf


def completar_desde_solicitud(inf: dict[str, Any], solicitud: dict[str, Any]) -> None:
    """Como `completarDesdeSolicitud` del Converter: Sold To, Ship To, Especie y Variedad los manda la solicitud (lo que
    escribe el laboratorio puede no ser el nombre oficial); el resto solo se completa si el informe no lo trae."""
    d = inf["datos"]
    for columna, clave in (("Sold To", "sold_to"), ("Ship To", "ship_to"), ("Especie", "especie"), ("Variedad", "variedad")):
        if solicitud.get(clave):
            d[columna] = str(solicitud[clave]).strip()
    tipo = (solicitud.get("campos_laboratorio") or {}).get("Tipo Aplicación")
    if tipo:
        d["Tipo Aplicación"] = tipo
        d["Tipo de servicio"] = _servicio(tipo)
    for columna, clave in (
        ("Posición Muestreo", "posicion_muestreo"), ("Línea Proceso", "linea_proceso"), ("Lote", "lote"), ("CSG", "csg_productor"),
        ("Nombre Muestreador", "nombre_muestreador"),
    ):
        if not d.get(columna) and solicitud.get(clave):
            d[columna] = str(solicitud[clave]).strip()
    _cerrar(inf)


def datos_para_cruce(inf: dict[str, Any]) -> dict[str, str]:
    """Lo que Ingreso de Informes necesita para cruzar el informe con su solicitud (`correo_informes_lectura`)."""
    d = inf["datos"]
    return {
        "laboratorio": "Diagnofruit",
        "nro_informe": d.get("N° Solicitud") or "",
        "ot": d.get("OT") or "",
        "sold_to": d.get("Sold To") or "",
        "ship_to": d.get("Ship To") or "",
        "especie": d.get("Especie") or "",
        "fecha_muestreo": q.a_iso(d.get("Fecha Muestreo")) or "",
        "fecha_recepcion": q.a_iso(d.get("Fecha entrada")) or "",
        "tipo_aplicacion": d.get("Tipo Aplicación") or "",
    }


def muestras(texto: str) -> int:
    """Cuántas muestras trae el PDF (una página por muestra más una de observaciones). Con más de una, cada muestra es un
    informe distinto y se carga con el Converter."""
    paginas = re.split(r"(?=REPORTE DE RESULTADOS)", texto)
    return sum(
        1 for p in paginas
        if re.search(r"Nombre de muestra:\s*(?!-+\s*$)\S", p, re.M) and re.search(r"Pat[óo]geno\s+Resultado", p, re.I)
    )
