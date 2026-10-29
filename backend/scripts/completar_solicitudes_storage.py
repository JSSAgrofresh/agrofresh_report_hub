"""
Deja en Storage -> Informes el PDF de la SOLICITUD de cada informe, al lado del informe:

    informes/<PLANTA>/<LABORATORIO>/Informes/<FECHA>/<archivo>.pdf          (ya existe)
    informes/<PLANTA>/<LABORATORIO>/Solicitudes/<FECHA>/<OT>.pdf            (lo que crea este script)

Para cada informe de Report cuya `referencia` es una OT existente, busca su PDF en la carpeta de su planta (por N° de
informe, como la ficha de Report), toma de esa ruta el laboratorio y la fecha, genera el PDF de la solicitud con la misma
rutina que «Descargar PDF» y lo sube. No pisa nada: si ya esta, lo salta. Lo nuevo (Converter y correo) ya la guarda solo.
El portal de cliente NUNCA ve esa carpeta (lleva la lista de distribucion).

Uso:
    cd backend
    .venv\\Scripts\\python.exe scripts\\completar_solicitudes_storage.py            # solo mira
    .venv\\Scripts\\python.exe scripts\\completar_solicitudes_storage.py --aplicar  # sube las que faltan
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

_BACKEND = Path(__file__).resolve().parent.parent
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))


def plan(filas: list[dict], claves_por_planta: dict[str, list[str]], elegir) -> tuple[list[tuple[str, str]], list[str], list[str]]:
    """([(OT, clave destino)], sin_pdf, ya_estan). `filas` = {nro, ot, carpeta} (carpeta = carpeta de la planta);
    `elegir(claves, nro)` es `ficha_informe.elegir_clave`."""
    existentes = {k for ks in claves_por_planta.values() for k in ks}
    crear: dict[str, str] = {}
    sin_pdf: list[str] = []
    ya: list[str] = []
    for f in filas:
        claves = [k for k in claves_por_planta.get(f["carpeta"], []) if k.split("/")[3:4] == ["Informes"]]
        clave = elegir(claves, f["nro"])
        partes = clave.split("/") if clave else []
        if len(partes) != 6:
            sin_pdf.append(f["nro"])
            continue
        destino = "/".join([*partes[:3], "Solicitudes", partes[4], f"{f['ot']}.pdf"])
        if destino in existentes:
            ya.append(f["ot"])
        else:
            crear[f["ot"]] = destino
    return sorted(crear.items()), sin_pdf, ya


def _filas() -> list[dict]:
    from app import informes_storage
    from app.db import conexion, cursor_dict

    with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
        cur.execute(
            """SELECT DISTINCT btrim(s.nro_solicitud) AS nro, sa.numero_solicitud AS ot,
                      COALESCE(p.nombre, s.ship_to_raw) AS planta, COALESCE(c.nombre, s.sold_to_raw) AS cliente
                 FROM solicitud s
                 JOIN solicitud_archivo sa ON upper(btrim(sa.numero_solicitud)) = upper(btrim(s.referencia))
                 LEFT JOIN planta p ON p.id = s.planta_id LEFT JOIN cliente c ON c.id = p.cliente_id
                WHERE s.nro_solicitud IS NOT NULL AND btrim(s.nro_solicitud) <> ''"""
        )
        filas = cur.fetchall()
    return [
        {"nro": f["nro"], "ot": f["ot"], "carpeta": informes_storage.carpeta_planta(f["planta"], f["cliente"])}
        for f in filas
    ]


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--aplicar", action="store_true", help="Subir de verdad. Sin esto solo muestra.")
    args = ap.parse_args(argv)

    from app import indice_solicitudes, r2, toma_muestras
    from app.ficha_informe import elegir_clave

    if not r2.disponible():
        print("R2 no esta configurado en este equipo.")
        return 1
    por_planta: dict[str, list[str]] = {}
    for k in r2.listar_keys("informes/"):
        partes = k.split("/")
        if len(partes) > 2:
            por_planta.setdefault(partes[1], []).append(k)
    crear, sin_pdf, ya = plan(_filas(), por_planta, elegir_clave)
    print(f"\nSolicitudes por guardar: {len(crear)}")
    print(f"  Ya estan:                         {len(ya)}")
    print(f"  Informe sin PDF en Storage:       {len(sin_pdf)}")
    for ot, d in crear[:8]:
        print(f"    {ot}  ->  {d}")
    if not crear:
        print("\nNada que completar.")
        return 0
    if not args.aplicar:
        print("\nSolo miré. Si está bien, repite con --aplicar.")
        return 0

    hechos = 0
    for ot, destino in crear:
        try:
            par = indice_solicitudes.buscar_por_numero(ot)
            if par is None:
                print(f"  {ot}: la solicitud ya no existe, se salta.")
                continue
            r2.subir(destino, toma_muestras.pdf_de_datos(par[1]), "application/pdf")
            hechos += 1
        except Exception as exc:  # noqa: BLE001
            print(f"  No se pudo guardar {ot}: {exc}")
    print(f"\n{hechos} de {len(crear)} solicitudes guardadas.")
    return 0 if hechos == len(crear) else 2


if __name__ == "__main__":
    raise SystemExit(main())
