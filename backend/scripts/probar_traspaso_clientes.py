"""
Prueba de traspaso: por cada cuenta de cliente, compara lo que VE con lo que LE CORRESPONDE. Solo lee.

· Lo que VE: se consulta Report con el MISMO filtro que usa el sistema para un cliente real (`reportes._filtro_alcance`
  con la cuenta tal como está guardada en la base), no una copia.
· Lo que LE CORRESPONDE: sale de la lista de distribución (los contactos «Resultado a clientes» del correo de la
  cuenta), sin pasar por la cuenta. Así también salta un acceso mal creado.
· Resultado exacto, sin porcentajes: cada cuenta termina en «sin traspaso» o «con traspaso»; si es con traspaso, dice
  qué Sold To / Ship To / especie ve de más o le faltan. También revisa Storage: ninguna carpeta de una planta donde
  solo tiene acceso por especie.
Un solo caso con traspaso detiene el envío: el script termina con código 1 y deja el detalle en un Excel en `logs/`.

Uso (ya dentro de backend):
    .venv\\Scripts\\python.exe scripts\\probar_traspaso_clientes.py
    .venv\\Scripts\\python.exe scripts\\probar_traspaso_clientes.py --servicio todas
    .venv\\Scripts\\python.exe scripts\\probar_traspaso_clientes.py --solo a@x.cl,b@y.cl
"""
from __future__ import annotations

import argparse
import os
import sys
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import config_store, informes_cliente, reportes  # noqa: E402
from app.accesos_clientes import accesos_por_correo, comparar, plano, tipo_de_cuenta, triples_esperados  # noqa: E402
from app.auth import Usuario, usuario_de_fila  # noqa: E402
from app.db import conexion, cursor_dict  # noqa: E402
from app.informes_storage import carpeta_planta  # noqa: E402
from app.listas_distribucion import ARCHIVO_CONTACTOS  # noqa: E402

SERVICIOS = {"linea": [""], "actimist": ["actimist"], "ecofog": ["ecofog"], "ryd": ["ryd"], "todas": ["", "actimist", "ecofog", "ryd"]}

_CONSULTA = """
    SELECT DISTINCT COALESCE(c.nombre, s.sold_to_raw) AS sold_to, COALESCE(p.nombre, s.ship_to_raw) AS ship_to,
           COALESCE(s.especie, '') AS especie
    FROM solicitud s
    LEFT JOIN planta p ON p.id = s.planta_id
    LEFT JOIN cliente c ON c.id = p.cliente_id
    WHERE s.vigente {filtro}
"""


def _triples(cur, usuario: Usuario) -> set[tuple[str, str, str]]:
    filtro, params = reportes._filtro_alcance(usuario, None, None)
    cur.execute(_CONSULTA.format(filtro=filtro), params)
    return {(f["sold_to"] or "", f["ship_to"] or "", f["especie"] or "") for f in cur.fetchall()}


def _carpetas_de_mas(usuario: Usuario, accesos: list[dict]) -> list[str]:
    """Carpetas de Storage que la cuenta puede abrir en plantas donde su acceso es solo por especie."""
    permitidas = informes_cliente.carpetas_permitidas(usuario)
    con_toda_la_planta = {
        carpeta_planta(a["plantaNombre"], a["clienteNombre"]).casefold()
        for a in accesos if a.get("plantaNombre") and not a.get("especie")
    }
    return sorted(permitidas - con_toda_la_planta)


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--servicio", choices=sorted(SERVICIOS), default="linea", help="Qué listas leer (por defecto, Línea de proceso).")
    p.add_argument("--solo", default="", help="Probar solo estos correos (separados por coma).")
    args = p.parse_args()

    accesos, _ = accesos_por_correo(config_store.leer(ARCHIVO_CONTACTOS, []), SERVICIOS[args.servicio])
    solo = {c.strip().casefold() for c in args.solo.split(",") if c.strip()}
    admin = Usuario(id="0", email="x@agrofresh.com", nombre="prueba", tipoAcceso="admin_general")

    resultados: list[dict] = []
    sin_lista: list[str] = []
    with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
        universo = _triples(cur, admin)  # todo lo que Report puede mostrar hoy (con el filtro de Funciones)
        cur.execute(
            "SELECT id, email, nombre, tipo_acceso, area, cliente_nombre, planta_nombre, modulos, reportes, plantas_asignadas, "
            "password_hash, debe_cambiar FROM usuario WHERE tipo_acceso = 'cliente' ORDER BY email"
        )
        cuentas = [usuario_de_fila(f) for f in cur.fetchall()]
        for u in cuentas:
            correo = u.email.casefold()
            if solo and correo not in solo:
                continue
            if correo not in accesos:
                sin_lista.append(u.email)  # cuenta antigua o de otro servicio: no hay contra qué compararla
                continue
            lista = accesos[correo]
            r = comparar(_triples(cur, u), triples_esperados(lista, universo))
            carpetas = _carpetas_de_mas(u, lista)
            if carpetas:
                r["estado"] = "con traspaso"
            resultados.append({"correo": u.email, "tipo": tipo_de_cuenta(lista), "carpetas_de_mas": carpetas, **r})
        sin_cuenta = sorted(c for c in accesos if c not in {u.email.casefold() for u in cuentas} and (not solo or c in solo))

    malas = [r for r in resultados if r["estado"] == "con traspaso"]
    print(f"\nCuentas de cliente probadas: {len(resultados)}   sin traspaso: {len(resultados) - len(malas)}   CON TRASPASO: {len(malas)}")
    if sin_lista:
        print(f"Cuentas de cliente que no figuran en esas listas (no se pueden comparar): {len(sin_lista)}")
    if sin_cuenta:
        print(f"Correos de las listas que todavía no tienen cuenta: {len(sin_cuenta)}")
    for r in malas:
        print(f"\n  ✗ {r['correo']} (Tipo {r['tipo']})")
        for s, sh, e in r["ve_de_mas"][:8]:
            print(f"      VE DE MÁS: {s} / {sh} / {e or '(sin especie)'}")
        for s, sh, e in r["le_falta"][:8]:
            print(f"      LE FALTA:  {s} / {sh} / {e or '(sin especie)'}")
        for c in r["carpetas_de_mas"][:8]:
            print(f"      CARPETA DE MÁS en Storage: {c}")

    carpeta = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "logs")
    os.makedirs(carpeta, exist_ok=True)
    ruta = os.path.join(carpeta, f"traspaso_clientes_{datetime.now():%Y%m%d_%H%M%S}.xlsx")
    import openpyxl
    from openpyxl.styles import Font

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Resultado"
    ws.append(["Correo", "Tipo", "Resultado", "Ve de más", "Le falta", "Carpetas de más"])
    for r in resultados:
        ws.append([
            r["correo"], r["tipo"], r["estado"],
            "; ".join(" / ".join(t) for t in r["ve_de_mas"]), "; ".join(" / ".join(t) for t in r["le_falta"]),
            "; ".join(r["carpetas_de_mas"]),
        ])
    for c in ws[1]:
        c.font = Font(bold=True)
    wb.save(ruta)
    print(f"\nDetalle: {ruta}")
    if malas:
        print("\nHAY TRASPASO: NO se envía nada hasta corregirlo.")
        raise SystemExit(1)
    print("\nTodas SIN TRASPASO." + ("" if resultados else " (No había cuentas para probar.)"))


if __name__ == "__main__":
    main()
