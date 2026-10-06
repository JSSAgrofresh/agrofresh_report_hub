"""
Genera el informe PDF de las cargas de Post Venta (Accu-Tab) que ya estaban
guardadas y no lo tienen (las demo tambien, salvo con --sin-demo).

Por defecto solo MIRA y cuenta lo que haria. Con --aplicar escribe:
  * Storage/Accutab/<carga>/informe.pdf y la marca tiene_pdf en su registro.json
  * el PDF en R2, ordenado por cliente y fecha (accutab/mail/<CLIENTE>/<FECHA>/).
    La fecha es la de LLEGADA de la carga (la de su carpeta), no la de hoy.

Uso (desde backend):
    .venv\\Scripts\\python.exe scripts\\generar_informes_accutab.py
    .venv\\Scripts\\python.exe scripts\\generar_informes_accutab.py --aplicar
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

_BACKEND = Path(__file__).resolve().parent.parent
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

from app import accutab_informe, config  # noqa: E402
from app.postventa import ARCHIVO_PDF, ARCHIVO_REGISTRO, _PATRON_CARPETA, _raiz_accutab  # noqa: E402


def es_demo(registro: dict) -> bool:
    return any("demo" in str(registro.get(k) or "").lower() for k in ("cliente", "equipo", "planta"))


def hecho_por_el_sistema(registro: dict) -> bool:
    """El PDF lo generó el servidor (correo, o Trace sin PDF propio): se puede rehacer.
    Un PDF que adjuntó Trace NO se toca."""
    return bool(registro.get("informe_generado")) or registro.get("origen") == "email"


def procesar(aplicar: bool, rehacer: bool = False, sin_demo: bool = False, aviso=None) -> dict[str, int]:
    cuenta = {"generados": 0, "demo": 0, "ya_tenian": 0, "sin_datos": 0, "errores": 0}
    raiz = _raiz_accutab()
    for marca in sorted(os.listdir(raiz)):
        ruta_json = os.path.join(raiz, marca, ARCHIVO_REGISTRO)
        if not _PATRON_CARPETA.match(marca) or not os.path.isfile(ruta_json):
            continue
        try:
            with open(ruta_json, encoding="utf-8") as f:
                registro = json.load(f)
            if registro.get("tiene_pdf") and os.path.isfile(os.path.join(raiz, marca, ARCHIVO_PDF)):
                if not (rehacer and hecho_por_el_sistema(registro)):
                    cuenta["ya_tenian"] += 1
                    continue
            if sin_demo and es_demo(registro):
                cuenta["demo"] += 1
                continue
            if not registro.get("filas"):
                cuenta["sin_datos"] += 1
                continue
            if not aplicar:
                cuenta["generados"] += 1
                continue
            pdf = accutab_informe.generar_pdf(registro)
            with open(os.path.join(raiz, marca, ARCHIVO_PDF), "wb") as f:
                f.write(pdf)
            # Las cargas de correo no guardaron cliente: sale del asunto (equipo).
            para_r2 = dict(registro)
            para_r2["cliente"] = registro.get("cliente") or accutab_informe.cliente_desde_asunto(registro.get("equipo"))
            claves = accutab_informe.archivar_en_r2(para_r2, marca, pdf, None)
            registro["tiene_pdf"] = True
            registro["informe_generado"] = True
            registro["r2_claves"] = list(dict.fromkeys(list(registro.get("r2_claves") or []) + claves))
            with open(ruta_json, "w", encoding="utf-8") as f:
                json.dump(registro, f, ensure_ascii=False)
            cuenta["generados"] += 1
            if aviso and cuenta["generados"] % 25 == 0:
                aviso(cuenta["generados"])
        except Exception as exc:  # noqa: BLE001
            print(f"  ERROR {marca}: {exc}")
            cuenta["errores"] += 1
    return cuenta


def main() -> int:
    ap = argparse.ArgumentParser(description="Genera los informes PDF faltantes de Post Venta.")
    ap.add_argument("--aplicar", action="store_true", help="Escribe los PDF (sin esto solo cuenta).")
    ap.add_argument("--rehacer", action="store_true",
                    help="Tambien vuelve a generar los que ya tenian un informe hecho por el sistema "
                         "(no toca los PDF que adjunto Trace).")
    ap.add_argument("--sin-demo", action="store_true", help="Se salta las cargas demo.")
    args = ap.parse_args()
    c = procesar(args.aplicar, args.rehacer, args.sin_demo,
                 aviso=lambda n: print(f"  ... {n} informes generados", flush=True))
    print(f"Carpeta: {_raiz_accutab()}  (STORAGE_DIR={config.STORAGE_DIR})")
    print(f"{'Generados' if args.aplicar else 'Se generarian'}: {c['generados']}")
    print(f"Saltadas por ser demo: {c['demo']} · ya tenian informe: {c['ya_tenian']} · sin datos: {c['sin_datos']} · errores: {c['errores']}")
    if not args.aplicar:
        print("No se escribio nada. Con --aplicar se generan.")
    return 0 if not c["errores"] else 2


if __name__ == "__main__":
    sys.exit(main())
