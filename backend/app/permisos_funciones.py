"""Las «mini funciones» que el administrador general reparte a cuentas concretas.

Son permisos sueltos dentro de un módulo (p. ej. editar los Criterios de las verificaciones diarias).
**Sin migración**: viajan en la misma lista `modulos` de la cuenta, con ids propios, igual que las
secciones de AgroFresh Lab (`lab_secciones.py`). Espejo de `src/features/usuarios/permisos.ts`
(mismos casos en `tests/test_permisos_funciones.py` y `permisos.test.ts`).

  · Administrador general: las tiene todas.
  · Gerencia, comerciales y clientes: ninguna (gerencia y comerciales son de solo lectura).
  · El resto: solo las que el administrador le marcó.

«Modificar criterios» (`lab_criterios`) nació en `lab_secciones.py` (`puede_editar_criterios`) y se reusa tal cual.
"""
from __future__ import annotations

from fastapi import Depends, HTTPException

from .auth import Usuario, usuario_actual
from .lab_secciones import LAB_CRITERIOS

VERIF_FIRMAR = "verif_firmar"
TOMA_REANALISIS = "toma_reanalisis"
FUNCIONES = (LAB_CRITERIOS, VERIF_FIRMAR, TOMA_REANALISIS)

# Todo lo que puede viajar en `modulos`: módulos, puertas de AgroFresh Lab y mini funciones.
MODULOS_VALIDOS = frozenset(
    {
        "ingesta", "trace", "converter", "reports", "agrofresh_lab", "auditoria_interna", "storage",
        "toma_muestras", "lab_ingreso", "lab_verificaciones", "lab_envio", *FUNCIONES,
    }
)
REPORTES_VALIDOS = ("laboratorio", "postventa")


def tiene(usuario: Usuario, funcion: str) -> bool:
    if usuario.tipoAcceso == "admin_general":
        return True
    if usuario.tipoAcceso in ("gerencia", "cliente", "comercial"):
        return False
    return funcion in (usuario.modulos or [])


def exigir(funcion: str, mensaje: str):
    """Dependencia de FastAPI: 403 (nunca 401: un 401 cierra la sesión en el navegador)."""

    def _revisar(usuario: Usuario = Depends(usuario_actual)) -> Usuario:
        if not tiene(usuario, funcion):
            raise HTTPException(403, mensaje)
        return usuario

    return _revisar


MODULOS_CLIENTE = ("reports", "storage")
# Lo que se le puede dar a un comercial: solo lo que acota a sus plantas.
MODULOS_COMERCIAL = ("reports", "storage", "auditoria_interna", "toma_muestras")


def normalizar_cuenta(
    tipo: str, area: str | None, modulos: list[str] | None, reportes: list[str] | None
) -> tuple[str | None, list[str] | None, list[str] | None]:
    """Deja `area`, `modulos` y `reportes` coherentes con el tipo de cuenta. Devuelve (area, modulos, reportes).

    · Una cuenta de **cliente** no pertenece a un área: se le asigna qué ve. Solo puede llevar los módulos
      `reports` (Report de laboratorio) y `storage` (sus informes), y en `reportes` `laboratorio` (con `reports`)
      y `postventa` (= sus informes Accu-Tab en el panel). Nunca lleva módulos internos. El área que se guarda se
      deduce de lo que ve (compatibilidad con el panel de inicio por tipo). Sin ninguna lista (llamada antigua) se
      toma lo que daba su área.
    · Administrador general no guarda módulos (ve todo). Gerencia sí: sin lista (cuentas antiguas) ve todo menos Auditoría; con lista, solo lo marcado.
    · El resto: solo ids conocidos; los de administración (Usuarios, Listados…) no existen como permiso.
    """
    reps = [r for r in REPORTES_VALIDOS if r in (reportes or [])]
    if tipo == "cliente":
        if modulos is None and reportes is None:
            if area == "postventa":
                reps, mods = ["postventa"], []
            else:
                reps, mods = (["laboratorio"], ["reports"]) if area == "cromatografia" else ([], [])
        else:
            mods = [m for m in MODULOS_CLIENTE if m in (modulos or [])]
            if "reports" in mods and "laboratorio" not in reps:
                reps = ["laboratorio", *reps]
            if "reports" not in mods:
                reps = [r for r in reps if r != "laboratorio"]
        if not mods and not reps:
            raise HTTPException(400, "Elige qué ve el cliente: Report, Storage y/o informes Accu-Tab.")
        return ("postventa" if reps == ["postventa"] and not mods else "cromatografia"), mods, reps
    if tipo == "comercial":
        # Solo lectura y solo lo que el administrador le marque entre Report (laboratorio y/o informes Accu-Tab), Storage, Panel de
        # control interno y Solicitudes e informes (lo único cuya API acota a sus plantas). Sin área: no pertenece a una.
        mods = [m for m in MODULOS_COMERCIAL if m in (modulos or [])]
        if not mods:
            raise HTTPException(400, "Elige qué abre el comercial: Report, Storage, Panel de control interno y/o Solicitudes e informes.")
        # Con Report puede llevar el de laboratorio y/o los informes Accu-Tab (`postventa`); sin elegir, el de laboratorio.
        reps_com = [r for r in ("laboratorio", "postventa") if r in (reportes or [])]
        return None, mods, ((reps_com or ["laboratorio"]) if "reports" in mods else [])
    if tipo == "admin_general":
        return None, None, None
    # Lo que no existe (ids viejos) se descarta; lo reservado al administrador general nunca está en la lista.
    limpios = [m for m in dict.fromkeys(modulos) if m in MODULOS_VALIDOS] if modulos is not None else None
    return area, limpios, (reps if reportes is not None else None)
