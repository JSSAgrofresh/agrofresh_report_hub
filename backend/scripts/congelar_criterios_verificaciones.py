"""
Congela los criterios de las verificaciones diarias que se guardaron antes de
la migración 0040.

Hasta la 0040 el veredicto de cada día se recalculaba con los criterios
VIGENTES, así que cambiar un criterio reescribía la historia: al mover el
rango del output del detector, días que se aprobaron con 19–22 pasaron a
"No aceptable". Desde la 0040 cada día guarda los criterios con que se juzgó
(`verif_registro.criterios`), pero los días anteriores quedaron sin ellos y
siguen usando los vigentes hasta que se congelen con este script.

Los criterios que se congelan son los vigentes, salvo los parámetros que se
indiquen con --param: esos son los valores que regían ANTES del cambio. El
script no inventa ninguno; hay que decírselos.

Para cada día muestra tres veredictos:
  - con los criterios de hoy (lo que se ve ahora en la pantalla)
  - con los criterios que se van a congelar
  - el que quedó escrito en la base cuando se guardó el día (se calculó con
    los criterios de ESE momento, así que es la mejor referencia)
Si los dos últimos no coinciden, se marca con «!!»: revisar antes de aplicar.

Uso:
    cd backend
    # solo mirar
    python scripts/congelar_criterios_verificaciones.py --param output_min=19 --param output_max=22
    # aplicar
    python scripts/congelar_criterios_verificaciones.py --param output_min=19 --param output_max=22 --aplicar
    # solo hasta cierta fecha (los días posteriores quedan con los vigentes)
    python scripts/congelar_criterios_verificaciones.py --param output_min=19 --param output_max=22 --hasta 2026-09-23
"""
from __future__ import annotations

import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import verificaciones as v  # noqa: E402
from app.db import conexion, cursor_dict  # noqa: E402


def _parametros(pares: list[str]) -> dict[str, float]:
    salida = {}
    for par in pares:
        clave, _, valor = par.partition("=")
        if not clave or not valor:
            raise SystemExit(f"--param mal escrito: {par!r}. Va como clave=valor, p. ej. output_min=19")
        salida[clave.strip()] = float(valor.replace(",", "."))
    return salida


def config_con_parametros(config: dict, cambios: dict[str, float]) -> dict:
    """Los catálogos vigentes con los parámetros indicados reemplazados."""
    pendientes = dict(cambios)
    parametros = []
    for p in config["parametros"]:
        parametros.append({**p, "valor": pendientes.pop(p["clave"])} if p["clave"] in pendientes else p)
    parametros += [
        {"clave": c, "valor": val, "descripcion": "", "unidad": "", "orden": 999} for c, val in pendientes.items()
    ]
    return {**config, "parametros": parametros}


def _veredicto_guardado(cur, registro_id: int) -> str:
    cur.execute("SELECT resultado FROM verif_registro WHERE id = %s", [registro_id])
    return cur.fetchone()["resultado"] or v.SIN_DATOS


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--param", action="append", default=[], help="clave=valor que regía antes del cambio")
    p.add_argument("--hasta", help="Solo días hasta esta fecha (YYYY-MM-DD), inclusive")
    p.add_argument("--aplicar", action="store_true", help="Escribir de verdad. Sin esto solo muestra.")
    args = p.parse_args()
    cambios = _parametros(args.param)

    with conexion(escribir=args.aplicar) as conn, cursor_dict(conn) as cur:
        vigente = v._leer_config(cur)
        desconocidos = set(cambios) - {q["clave"] for q in vigente["parametros"]}
        if desconocidos:
            print(f"\nOjo: estos parámetros no existen hoy en el catálogo: {', '.join(sorted(desconocidos))}")
        propuesta = config_con_parametros(vigente, cambios)
        criterios = v.criterios_del_dia(propuesta)

        condicion, valores = "criterios IS NULL", []
        if args.hasta:
            condicion += " AND fecha <= %s"
            valores.append(args.hasta)
        cur.execute(f"SELECT * FROM verif_registro WHERE {condicion} ORDER BY fecha", valores)
        dias = [dict(f) for f in cur.fetchall()]

        if not dias:
            print("\nNo hay días sin criterios congelados. Nada que hacer.\n")
            return

        print(f"\nParámetros que se congelan distintos de los vigentes: {cambios or 'ninguno'}\n")
        print(f"{'Fecha':<12} {'Con los de hoy':<15} {'Congelado':<15} {'Guardado':<15} Secciones que cambian")
        dudosos = 0
        for dia in dias:
            hoy = v._armar_registro(cur, {**dia, "criterios": None}, vigente)
            # Solo se congelan las secciones que ya tienen datos. Una sección
            # sin medir (p. ej. el detector de hoy, que se hace en la tarde)
            # queda libre y congelará los criterios vigentes cuando se guarde.
            del_dia = {
                s: c for s, c in criterios.items() if hoy.resultados_seccion.get(s, v.SIN_MEDIR) != v.SIN_MEDIR
            }
            congelado = v._armar_registro(cur, {**dia, "criterios": del_dia}, vigente)
            guardado = _veredicto_guardado(cur, dia["id"])
            cambian = [
                s for s in v.SECCIONES if hoy.resultados_seccion.get(s) != congelado.resultados_seccion.get(s)
            ]
            marca = "" if congelado.resultado == guardado else "  !!"
            dudosos += bool(marca)
            print(
                f"{dia['fecha']!s:<12} {hoy.resultado:<15} {congelado.resultado:<15} {guardado:<15}"
                f" {', '.join(cambian) or '-'}{marca}"
            )
            if args.aplicar:
                cur.execute(
                    "UPDATE verif_registro SET criterios = %s::jsonb WHERE id = %s AND criterios IS NULL",
                    [json.dumps(del_dia), dia["id"]],
                )
                v._guardar_resultados(cur, dia["id"], congelado)

        print(f"\n{len(dias)} día(s).", end=" ")
        if dudosos:
            print(f"{dudosos} con «!!»: el veredicto congelado no calza con el que se guardó ese día.")
        else:
            print("Todos calzan con el veredicto que se guardó ese día.")
        if args.aplicar:
            print("Criterios congelados.\n")
        else:
            print("No se escribió nada. Para aplicar, agrega --aplicar.\n")


if __name__ == "__main__":
    main()
