"""JSON de la solicitud para ALS (FSMA), con los campos de la cabecera de SU informe.

ALS copia estos valores a su informe, así que el JSON usa los mismos nombres que
la cabecera y no trae resultados (los pone el laboratorio). Solo lo usan las
solicitudes de ALS creadas desde que existe la marca `json_als_v2`; las
anteriores y las de otros laboratorios siguen con el JSON de siempre.

Todo se separa con « // » (el OT lleva guion). Un dato vacío del final no se
escribe; uno vacío en el medio queda en blanco y conserva sus separadores, para
que cada dato mantenga su posición.
"""
from __future__ import annotations

import re

MARCA_JSON_ALS = "json_als_v2"
SEP = " // "


def es_als(laboratorio: object) -> bool:
    return str(laboratorio or "").strip().casefold() == "als"


def _txt(valor: object) -> str:
    """Texto limpio de un dato; None, vacío y «—» cuentan como vacío."""
    if valor is None or isinstance(valor, bool):
        return ""
    if isinstance(valor, float) and valor == int(valor):
        valor = int(valor)
    s = re.sub(r"\s+", " ", str(valor)).strip()
    return "" if s in ("—", "-") else s


def _unir(partes: list[object]) -> str:
    limpias = [_txt(p) for p in partes]
    while limpias and not limpias[-1]:
        limpias.pop()
    return re.sub(r"\s+", " ", SEP.join(limpias)).strip()


def _dmy(iso: object) -> str:
    m = re.fullmatch(r"(\d{4})-(\d{2})-(\d{2})", _txt(iso))
    return f"{m.group(3)}-{m.group(2)}-{m.group(1)}" if m else _txt(iso)


def _dmy_corto(iso: object) -> str:
    m = re.fullmatch(r"(\d{4})-(\d{2})-(\d{2})", _txt(iso))
    return f"{m.group(3)}-{m.group(2)}-{m.group(1)[2:]}" if m else _txt(iso)


def identificacion_muestra(datos: dict) -> str:
    """«Identificación Muestra (NI)»: hasta 10 datos, siempre en este orden."""
    return _unir([
        datos.get("numero_solicitud"),
        datos.get("posicion_muestreo"),
        _dmy(datos.get("fecha_muestreo")),
        datos.get("lote"),
        datos.get("csg_productor"),
        datos.get("csg_packing"),
        datos.get("numero_camara"),
        datos.get("numero_orden"),
        datos.get("kilos_procesados"),
        datos.get("producto_utilizado"),
    ])


def construir(datos: dict) -> dict:
    """Campos del informe de ALS (sin `correos`, que se agrega al final)."""
    hora = _txt(datos.get("hora_muestreo"))
    campos = datos.get("campos_laboratorio") or {}
    return {
        "Solicitante": _unir([datos.get("sold_to"), datos.get("ship_to")]),
        "Contacto": _unir([datos.get("nombre_muestreador"), datos.get("email_solicitante")]),
        "Solicitud Muestreo/Análisis": _dmy(datos.get("fecha_solicitud")),
        "Tipo de Muestras": "Agua",
        "Nº de Muestras": 1,
        "Fecha y Entidad de Muestreo": f"{_dmy_corto(datos.get('fecha_muestreo'))} {hora}".strip(),
        "Fecha y Hora de Ingreso": None,
        "Fecha y Hora de Inicio": None,
        "Identificación Muestra (NI)": identificacion_muestra(datos),
        "Muestreo": {
            "Fecha": _dmy(datos.get("fecha_muestreo")),
            "Horario": hora,
            "Lugar de muestreo": _unir([
                datos.get("linea_proceso"),
                campos.get("Tipo Aplicación") if isinstance(campos, dict) else None,
                datos.get("especie"),
                datos.get("variedad"),
            ]),
        },
    }
