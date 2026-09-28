"""
Pone a una persona en copia oculta en TODAS las plantas donde ya está otra.

Caso de uso: se incorpora alguien que tiene que recibir los resultados igual
que un administrador que ya existe. En vez de entrar a Laboratorios →
Resultado a clientes planta por planta, este script toma al contacto de
referencia y, en cada grupo (laboratorio, cliente, planta, especie) donde
figura como copia oculta de resultados, agrega al nuevo contacto con los
mismos datos: mismo grupo, mismo `bcc`, mismo estado activo/inactivo.

No sirve crear un único contacto "global" (sin cliente ni planta): la
búsqueda de destinatarios se queda con el nivel más específico que tenga
contactos y no suma el global, así que en las plantas ya configuradas nunca
llegaría.

Uso (desde la carpeta backend):
  .venv\\Scripts\\python.exe scripts\\copiar_bcc_contacto.py --lista
      Muestra quiénes están hoy en copia oculta y en cuántos grupos.

  .venv\\Scripts\\python.exe scripts\\copiar_bcc_contacto.py --referencia tu.correo@agrofresh.com --nuevo cguerrero@agrofresh.com --nombre "Claudia Guerrero"
      Muestra lo que haría, sin escribir nada.

  (lo mismo) --aplicar
      Guarda los cambios.

Es idempotente: donde el nuevo contacto ya existe (en cualquier tipo de
copia) no se agrega de nuevo, así que se puede volver a correr cuando se
configuren plantas nuevas.
"""

import argparse
import sys
from collections import Counter
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))

ARCHIVO = "contactos_laboratorio.json"
TIPOS_RESULTADO = ("resultado_cliente", "resultado_interno")


def _norm(email) -> str:
    return str(email or "").strip().casefold()


def _clave_grupo(c: dict) -> tuple:
    """Un grupo de destinatarios de resultados, tal como lo resuelve
    `_contactos_resultado`: laboratorio + cliente + planta + especie."""
    return (
        (c.get("laboratorio") or "").strip(),
        (c.get("sold_to") or "").strip(),
        (c.get("ship_to") or "").strip(),
        (c.get("especie") or "").strip(),
    )


def es_bcc_resultado(c: dict) -> bool:
    return c.get("tipo") == "resultado_interno" and c.get("tipo_copia") == "bcc"


def resumen_bcc(contactos: list[dict]) -> Counter:
    """Correos en copia oculta de resultados y en cuántos grupos está cada uno."""
    return Counter(_norm(c.get("email")) for c in contactos if es_bcc_resultado(c) and c.get("email"))


def planificar(
    contactos: list[dict], referencia: str, nuevo_email: str, nuevo_nombre: str
) -> tuple[list[dict], list[tuple]]:
    """Devuelve (contactos a crear, grupos que se saltan porque ya lo tienen).

    No modifica `contactos`.
    """
    ref = _norm(referencia)
    nuevo = _norm(nuevo_email)

    # Grupos donde el nuevo contacto ya figura (en cualquier rol de resultados).
    ya_esta = {
        _clave_grupo(c) for c in contactos
        if c.get("tipo") in TIPOS_RESULTADO and _norm(c.get("email")) == nuevo
    }
    orden_max: dict[tuple, int] = {}
    for c in contactos:
        if c.get("tipo") in TIPOS_RESULTADO:
            g = _clave_grupo(c)
            orden_max[g] = max(orden_max.get(g, 0), int(c.get("orden") or 0))

    siguiente_id = max((int(c.get("id") or 0) for c in contactos), default=0) + 1
    nuevos: list[dict] = []
    saltados: list[tuple] = []
    vistos: set[tuple] = set()
    for c in contactos:
        if not es_bcc_resultado(c) or _norm(c.get("email")) != ref:
            continue
        g = _clave_grupo(c)
        if g in vistos:
            continue
        vistos.add(g)
        if g in ya_esta:
            saltados.append(g)
            continue
        copia = dict(c)
        copia.update(
            id=siguiente_id,
            nombre=nuevo_nombre or nuevo_email.strip(),
            email=nuevo_email.strip(),
            orden=orden_max.get(g, 0) + 1,
        )
        nuevos.append(copia)
        siguiente_id += 1
    return nuevos, saltados


def _fmt(g: tuple) -> str:
    lab, sold_to, ship_to, especie = g
    return f"{lab or '(sin lab)'} · {sold_to or '(todos)'} · {ship_to or '(todas)'} · {especie or '(todas)'}"


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--lista", action="store_true", help="solo lista quiénes están en copia oculta")
    p.add_argument("--referencia", help="correo de quien ya está en copia oculta (se copia su configuración)")
    p.add_argument("--nuevo", help="correo de la persona a agregar")
    p.add_argument("--nombre", default="", help="nombre que se muestra en la pantalla de contactos")
    p.add_argument("--aplicar", action="store_true", help="guarda los cambios (sin esto, solo muestra)")
    args = p.parse_args()

    from app import config_store, r2

    contactos: list[dict] = config_store.leer(ARCHIVO, [])
    resumen = resumen_bcc(contactos)

    if args.lista or not (args.referencia and args.nuevo):
        print("Correos en copia oculta de resultados (grupos donde figura):")
        for email, n in resumen.most_common():
            print(f"  {n:4d}  {email}")
        if not resumen:
            print("  (ninguno)")
        if not args.lista:
            print("\nFaltan --referencia y --nuevo. Ver --help.")
        return

    if "@" not in args.nuevo:
        sys.exit(f"'{args.nuevo}' no parece un correo.")
    if _norm(args.referencia) not in resumen:
        sys.exit(
            f"'{args.referencia}' no está en copia oculta en ningún grupo.\n"
            "Corre con --lista para ver los correos disponibles."
        )

    nuevos, saltados = planificar(contactos, args.referencia, args.nuevo, args.nombre)

    print(f"Referencia: {args.referencia} (copia oculta en {resumen[_norm(args.referencia)]} grupos)")
    print(f"Nuevo:      {args.nombre or '(sin nombre)'} <{args.nuevo}>")
    print(f"  Grupos donde se agrega:        {len(nuevos)}")
    print(f"  Grupos donde ya estaba (skip): {len(saltados)}")
    print()
    for c in nuevos[:15]:
        estado = "" if c.get("activo", True) else "  [inactivo, igual que la referencia]"
        print(f"  + {_fmt(_clave_grupo(c))}{estado}")
    if len(nuevos) > 15:
        print(f"  ... y {len(nuevos) - 15} grupos más.")
    print()

    if not nuevos:
        print("Nada que agregar.")
        return
    if not args.aplicar:
        print(">> DRY RUN: no se escribió nada. Agrega --aplicar para guardar.")
        return

    config_store.escribir(ARCHIVO, contactos + nuevos)
    print(f"✓ Guardado en {'R2' if r2.disponible() else 'disco'}. Contactos ahora: {len(contactos) + len(nuevos)}")


if __name__ == "__main__":
    main()
