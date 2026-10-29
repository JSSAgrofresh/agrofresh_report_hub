"""
Limpia Storage -> Informes (R2, prefijo `informes/`): deja SOLO los PDF de informes que estan en Report Y cruzados con
una OT (solicitud de Toma de muestras). Un informe que esta en Report pero no tiene OT (p. ej. los de prueba que dicen
«N° SOLICITUD —») sobra en Storage; con `--incluir-sin-ot` se vuelve a la regla anterior (basta con estar en Report).
«Cruzado con una OT» = su registro de Report trae una `referencia` que es una OT existente, o su PDF subido por el
Converter quedo amarrado a una solicitud (`informe_auditoria`).

Cada vez que se genera un informe propio de AgroFresh (Ingreso al laboratorio) el sistema deja una copia en
`informes/<PLANTA>/<FECHA>/<ANALISIS>/AgroFresh/<folio>.pdf`, este o no cargado en Report; con el tiempo se juntan
informes que nunca existieron para el cliente. Un PDF se CONSERVA si su nombre corresponde al N° de informe de algun
informe que esta en Report (`solicitud.nro_solicitud`, lo mismo que usa la ficha del informe para encontrar su PDF):
el N° es el nombre completo («AGF2026-26.pdf») o aparece en el nombre sin pegarse a otras letras o numeros
(«2026-1885-PC Copefrut.pdf»; «AGF2026-2» NO calza con «AGF2026-26»). Todo lo demas es sobrante, SALVO lo de Diagnofruit: sus PDF (carpeta `Diagnofruit`) no se juzgan y siempre se conservan.

Seguro por defecto:
  * mira primero: sin `--aplicar` solo cuenta y deja la lista completa (conserva / sobra) en logs/;
  * con `--aplicar` NO borra: MUEVE los sobrantes a `informes_papelera/<fecha>/...` (se pueden devolver copiandolos
    de vuelta); `--definitivo` los borra de verdad;
  * si en Report no hay ningun informe con N°, se detiene (nunca trataria todo como sobrante);
  * solo toca PDF dentro de `informes/`; otros archivos y el resto del bucket no se tocan.

Uso:
    cd backend
    .venv\\Scripts\\python.exe scripts\\limpiar_informes_storage.py                 # solo mira
    .venv\\Scripts\\python.exe scripts\\limpiar_informes_storage.py --aplicar       # mueve los sobrantes a la papelera
    .venv\\Scripts\\python.exe scripts\\limpiar_informes_storage.py --aplicar --definitivo   # los borra
"""
from __future__ import annotations

import argparse
import csv
import re
import sys
from datetime import datetime
from pathlib import Path

_BACKEND = Path(__file__).resolve().parent.parent
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

RAIZ = "informes/"
PAPELERA = "informes_papelera/"


def _nombre(clave: str) -> str:
    return clave.rsplit("/", 1)[-1].rsplit(".", 1)[0].strip().casefold()


def calza(nombre: str, nro: str) -> bool:
    """El N° de informe es el nombre entero o aparece en él sin pegarse a otra letra o numero."""
    if nombre == nro:
        return True
    return re.search(rf"(?<![0-9a-z]){re.escape(nro)}(?![0-9a-z])", nombre) is not None


def clasificar(claves: list[str], numeros: set[str]) -> tuple[list[tuple[str, str]], list[str], list[str]]:
    """(conservar [(clave, N° que calza)], sobrantes, no_pdf). Solo los PDF se juzgan; lo demas no se toca."""
    base = {n.strip().casefold() for n in numeros if n and n.strip()}
    # Diagnofruit guarda «253522-DIAG0007» pero nombra su PDF «253522 - Agrofresh.pdf»: vale también el N° de su informe.
    alias = {m.group(1) for n in base if (m := re.match(r"^(\d{5,})-[a-z]+\d+$", n))}
    nros = sorted(base | alias, key=lambda n: (-len(n), n))
    conservar: list[tuple[str, str]] = []
    sobran: list[str] = []
    otros: list[str] = []
    for clave in sorted(claves):
        if clave.endswith("/"):
            continue
        if not clave.lower().endswith(".pdf"):
            otros.append(clave)
            continue
        if "diagnofruit" in {parte.strip().casefold() for parte in clave.split("/")[:-1]}:
            conservar.append((clave, "Diagnofruit: no se toca"))
            continue
        nombre = _nombre(clave)
        hallado = next((n for n in nros if calza(nombre, n)), None)
        if hallado:
            conservar.append((clave, hallado))
        else:
            sobran.append(clave)
    return conservar, sobran, otros


def _numeros_en_report() -> set[str]:
    from app.db import conexion, cursor_dict

    with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
        cur.execute("SELECT DISTINCT btrim(nro_solicitud) AS n FROM solicitud WHERE nro_solicitud IS NOT NULL AND btrim(nro_solicitud) <> ''")
        return {str(f["n"]) for f in cur.fetchall()}


def repetidos(conservar: list[tuple[str, str]]) -> dict[str, list[str]]:
    """{N° de informe: [PDF...]} para los N° que tienen mas de un PDF en Storage (copias en otras carpetas)."""
    por_numero: dict[str, list[str]] = {}
    for clave, nro in conservar:
        if nro.endswith("no se toca"):
            continue
        por_numero.setdefault(nro, []).append(clave)
    return {n: sorted(cs) for n, cs in sorted(por_numero.items()) if len(cs) > 1}


def formato_antiguo(clave: str) -> bool:
    """`informes/<PLANTA>/<FECHA>/<archivo>.pdf`: el orden viejo (sin carpetas de analisis ni de laboratorio), el que
    dejaba `emitir._archivar_informe` al generar un informe propio."""
    return len(clave.split("/")) == 4


def copias_sobrantes(copias: dict[str, list[str]], plantas_de_report: dict[str, set[str]] | None = None) -> dict[str, str]:
    """De los N° con mas de un PDF, cuales copias sobran ({clave: motivo}):
      1. la del formato antiguo, si existe otra en el orden nuevo;
      2. si quedan varias, las que estan en una carpeta de planta distinta a la que Report indica (solo si al menos
         una copia calza con la planta de Report: nunca se decide a ciegas)."""
    sacar: dict[str, str] = {}
    for nro, cs in copias.items():
        nuevas = [c for c in cs if not formato_antiguo(c)]
        antiguas = [c for c in cs if formato_antiguo(c)]
        if nuevas and antiguas:
            sacar.update({c: "copia del formato antiguo (hay otra en el orden nuevo)" for c in antiguas})
        quedan = nuevas if (nuevas and antiguas) else cs
        esperadas = {e.casefold() for e in (plantas_de_report or {}).get(nro, set())}
        if len(quedan) > 1 and esperadas:
            calzan = [c for c in quedan if c.split("/")[1].casefold() in esperadas]
            if calzan and len(calzan) < len(quedan):
                sacar.update({c: "carpeta de otra planta distinta a la de Report" for c in quedan if c not in calzan})
    return sacar


def _plantas_de_report() -> dict[str, set[str]]:
    """{N° de informe (en minusculas): carpetas de planta que le corresponden segun Report}."""
    from app import informes_storage
    from app.db import conexion, cursor_dict

    with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
        cur.execute(
            """SELECT DISTINCT btrim(s.nro_solicitud) AS n, COALESCE(p.nombre, s.ship_to_raw) AS planta,
                      COALESCE(c.nombre, s.sold_to_raw) AS cliente
                 FROM solicitud s LEFT JOIN planta p ON p.id = s.planta_id LEFT JOIN cliente c ON c.id = p.cliente_id
                WHERE s.nro_solicitud IS NOT NULL AND btrim(s.nro_solicitud) <> ''"""
        )
        filas = cur.fetchall()
    salida: dict[str, set[str]] = {}
    for f in filas:
        salida.setdefault(str(f["n"]).casefold(), set()).add(informes_storage.carpeta_planta(f["planta"], f["cliente"]))
    return salida


def _ver(numero: str, claves: list[str]) -> None:
    """Que dice Report de UN informe y que PDF tiene en Storage (para entender un caso raro)."""
    from app.db import conexion, cursor_dict

    nro = numero.strip()
    with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
        cur.execute(
            """SELECT s.id, s.nro_solicitud, s.referencia, s.laboratorio, s.fecha_muestreo, s.servicio,
                      COALESCE(p.nombre, s.ship_to_raw) AS planta, COALESCE(c.nombre, s.sold_to_raw) AS cliente,
                      (SELECT sa.numero_solicitud FROM solicitud_archivo sa
                        WHERE upper(btrim(sa.numero_solicitud)) = upper(btrim(s.referencia)) LIMIT 1) AS ot_existente
                 FROM solicitud s LEFT JOIN planta p ON p.id = s.planta_id LEFT JOIN cliente c ON c.id = p.cliente_id
                WHERE upper(btrim(s.nro_solicitud)) = upper(%s)""",
            (nro,),
        )
        filas = cur.fetchall()
        cur.execute(
            "SELECT laboratorio, nro_informe, archivo_solicitud, numero_solicitud, r2_key FROM informe_auditoria WHERE upper(btrim(nro_informe)) = upper(%s)",
            (nro,),
        )
        auditoria = cur.fetchall()
    print(f"\nInforme {nro}")
    print(f"  En Report ({len(filas)}):")
    for f in filas:
        print(f"    id {f['id']} · {f['laboratorio']} · {f['cliente']} / {f['planta']} · muestreo {f['fecha_muestreo']} · servicio {f['servicio']}")
        print(f"      referencia (OT): {f['referencia'] or '—'}  ->  OT que existe: {f['ot_existente'] or 'NINGUNA'}")
    print(f"  Informe subido por el Converter ({len(auditoria)}):")
    for a in auditoria:
        print(f"    amarrado a: {a['numero_solicitud'] or a['archivo_solicitud'] or 'ninguna solicitud'} · {a['r2_key']}")
    pdfs = [c for c in claves if calza(_nombre(c), nro.casefold())]
    print(f"  PDF en Storage ({len(pdfs)}):")
    for c in pdfs:
        print(f"    {c}")


def _numeros_con_ot() -> set[str]:
    """N° de informe de Report que estan cruzados con una OT."""
    from app.db import conexion, cursor_dict

    sql = """
        SELECT DISTINCT btrim(s.nro_solicitud) AS n
          FROM solicitud s
         WHERE s.nro_solicitud IS NOT NULL AND btrim(s.nro_solicitud) <> ''
           AND (
                EXISTS (SELECT 1 FROM solicitud_archivo sa
                         WHERE s.referencia IS NOT NULL AND btrim(s.referencia) <> ''
                           AND upper(btrim(sa.numero_solicitud)) = upper(btrim(s.referencia)))
             OR EXISTS (SELECT 1 FROM informe_auditoria ia
                         WHERE btrim(ia.nro_informe) = btrim(s.nro_solicitud)
                           AND (ia.archivo_solicitud IS NOT NULL OR ia.numero_solicitud IS NOT NULL))
           )
    """
    with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
        cur.execute(sql)
        return {str(f["n"]) for f in cur.fetchall()}


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--aplicar", action="store_true", help="Mover los sobrantes a la papelera. Sin esto solo muestra.")
    ap.add_argument("--incluir-sin-ot", action="store_true", help="Conservar tambien los informes de Report que no tienen OT.")
    ap.add_argument("--ver", metavar="N°", help="Muestra que dice Report y que PDF hay en Storage de UN informe (ej. AGF2026-10).")
    ap.add_argument("--definitivo", action="store_true", help="Con --aplicar: borrarlos de verdad en vez de moverlos.")
    args = ap.parse_args(argv)

    from app import r2

    if not r2.disponible():
        print("R2 no esta configurado en este equipo: nada que revisar.")
        return 1
    if args.ver:
        _ver(args.ver, r2.listar_keys(RAIZ))
        return 0
    en_report = _numeros_en_report()
    if not en_report:
        print("En Report no hay ningun informe con N° de informe: me detengo para no marcar todo como sobrante.")
        return 1
    con_ot = en_report if args.incluir_sin_ot else _numeros_con_ot()
    if not con_ot:
        print("Ningun informe de Report esta cruzado con una OT: me detengo para no marcar todo como sobrante.")
        return 1
    numeros = con_ot
    claves = r2.listar_keys(RAIZ)
    conservar, sobran, otros = clasificar(claves, numeros)
    _, sobran_en_report, _ = clasificar(sobran, en_report)  # los que NO calzan ni con Report
    no_en_report = set(sobran_en_report)
    sin_ot = [c for c in sobran if c not in no_en_report]
    print(f"\nStorage -> Informes ({RAIZ})")
    print(f"  Informes en Report con N°:  {len(en_report)}  (cruzados con una OT: {len(con_ot)})")
    print(f"  PDF que SE CONSERVAN:       {len(conservar)}")
    print(f"  PDF SOBRANTES:              {len(sobran)}")
    print(f"      en Report pero SIN OT:  {len(sin_ot)}")
    print(f"      que no estan en Report: {len(no_en_report)}")
    print(f"  Otros archivos (no se tocan): {len(otros)}")
    copias = repetidos(conservar)
    de_copias = copias_sobrantes(copias, _plantas_de_report())
    if de_copias:
        conservar = [(c, n) for c, n in conservar if c not in de_copias]
        sobran = sorted(sobran + list(de_copias))
        copias = repetidos(conservar)
    print(f"  Copias repetidas que sobran: {len(de_copias)}")
    for c, motivo in list(de_copias.items())[:8]:
        print(f"    sobra: {c}   ({motivo})")
    print(f"  N° que siguen con MAS DE UN PDF: {len(copias)}")
    for n, cs in list(copias.items())[:10]:
        print(f"    {n}: {len(cs)} PDF")
        for c in cs:
            print(f"        {c}")
    if len(copias) > 10:
        print(f"    ... y {len(copias) - 10} más (están en la lista)")

    marca = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
    logs = _BACKEND / "logs"
    logs.mkdir(exist_ok=True)
    ruta = logs / f"limpiar_informes_storage_{marca}.csv"
    with open(ruta, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f, delimiter=";")
        w.writerow(["decision", "clave", "calza con el N° / motivo"])
        w.writerows([["CONSERVAR", c, n] for c, n in conservar])
        w.writerows([["SOBRA", c, de_copias.get(c) or ("en Report pero sin OT" if c in sin_ot else "no está en Report")] for c in sobran])
        w.writerows([["NO SE TOCA", c, ""] for c in otros])
        w.writerows([["COPIA REPETIDA", c, n] for n, cs in copias.items() for c in cs])
    print(f"  Lista completa: {ruta}")
    for c in sobran[:15]:
        print(f"    sobra: {c}")
    if len(sobran) > 15:
        print(f"    ... y {len(sobran) - 15} mas (estan en la lista)")

    if not sobran:
        print("\nNo hay nada que limpiar.")
        return 0
    if not args.aplicar:
        print("\nSolo miré. Revisa la lista y, si está bien, repite con --aplicar.")
        return 0

    hechos = 0
    for clave in sobran:
        try:
            if not args.definitivo:
                datos = r2.descargar(clave)
                if datos is None:
                    continue
                r2.subir(f"{PAPELERA}{marca}/{clave[len(RAIZ):]}", datos, "application/pdf")
            r2.eliminar(clave)
            hechos += 1
        except Exception as exc:  # noqa: BLE001
            print(f"  No se pudo {'borrar' if args.definitivo else 'mover'} {clave}: {exc}")
    donde = "borrados" if args.definitivo else f"movidos a {PAPELERA}{marca}/"
    print(f"\n{hechos} de {len(sobran)} PDF sobrantes {donde}.")
    return 0 if hechos == len(sobran) else 2


if __name__ == "__main__":
    raise SystemExit(main())
