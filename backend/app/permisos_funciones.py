"""Las «mini funciones» que el administrador general reparte a cuentas concretas.

Son permisos sueltos dentro de un módulo (p. ej. editar los Criterios de las verificaciones diarias).
**Sin migración**: viajan en la misma lista `modulos` de la cuenta, con ids propios, igual que las
secciones de AgroFresh Lab (`lab_secciones.py`). Espejo de `src/features/usuarios/permisos.ts`
(mismos casos en `tests/test_permisos_funciones.py` y `permisos.test.ts`).

  · Administrador general: las tiene todas.
  · Gerencia y clientes: ninguna (son de escritura; gerencia es solo lectura).
  · El resto: solo las que el administrador le marcó.
"""
from __future__ import annotations

from fastapi import Depends, HTTPException

from .auth import Usuario, usuario_actual

VERIF_CRITERIOS = "verif_criterios"
VERIF_FIRMAR = "verif_firmar"
TOMA_REANALISIS = "toma_reanalisis"
FUNCIONES = (VERIF_CRITERIOS, VERIF_FIRMAR, TOMA_REANALISIS)

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
    if usuario.tipoAcceso in ("gerencia", "cliente"):
        return False
    return funcion in (usuario.modulos or [])


def exigir(funcion: str, mensaje: str):
    """Dependencia de FastAPI: 403 (nunca 401: un 401 cierra la sesión en el navegador)."""

    def _revisar(usuario: Usuario = Depends(usuario_actual)) -> Usuario:
        if not tiene(usuario, funcion):
            raise HTTPException(403, mensaje)
        return usuario

    return _revisar


def normalizar_cuenta(
    tipo: str, area: str | None, modulos: list[str] | None, reportes: list[str] | None
) -> tuple[str | None, list[str] | None, list[str] | None]:
    """Deja `area`, `modulos` y `reportes` coherentes con el tipo de cuenta. Devuelve (area, modulos, reportes).

    · Una cuenta de **cliente** no pertenece a un área: solo se le asigna qué ve (`reportes`: Report de
      laboratorio y/o informes Accu-Tab). Nunca lleva módulos internos. El área que se guarda se deduce
      de lo que ve (compatibilidad con el panel de inicio por tipo).
    · Administrador general y gerencia no guardan módulos (ven todo, o todo menos Auditoría).
    · El resto: solo ids conocidos; los de administración (Usuarios, Listados…) no existen como permiso.
    """
    reps = [r for r in (reportes or []) if r in REPORTES_VALIDOS]
    reps = [r for r in REPORTES_VALIDOS if r in reps]
    if tipo == "cliente":
        if not reps:
            reps = {"cromatografia": ["laboratorio"], "postventa": ["postventa"]}.get(area or "", [])
        if not reps:
            raise HTTPException(400, "Elige qué ve el cliente: Report de laboratorio y/o informes Accu-Tab.")
        return ("cromatografia" if "laboratorio" in reps else "postventa"), None, reps
    if tipo in ("admin_general", "gerencia"):
        return None, None, None
    # Lo que no existe (ids viejos) se descarta; lo reservado al administrador general nunca está en la lista.
    limpios = [m for m in dict.fromkeys(modulos) if m in MODULOS_VALIDOS] if modulos is not None else None
    return area, limpios, (reps if reportes is not None else None)
