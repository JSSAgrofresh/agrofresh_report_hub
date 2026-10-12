"""Qué secciones de AgroFresh Lab ve cada cuenta.

AgroFresh Lab es UN módulo (`agrofresh_lab`) con tres puertas: Ingreso al laboratorio,
Verificaciones diarias y Envío de informes. El administrador general puede dejar a una
cuenta con solo algunas (Administración → Usuarios → «Secciones de AgroFresh Lab»).

**Sin migración**: las secciones elegidas viajan en la misma lista `modulos` de la cuenta,
con ids propios (`lab_ingreso`, `lab_verificaciones`, `lab_envio`).
  · Ninguno de esos ids en la lista  → la cuenta ve las tres (como siempre).
  · Alguno                           → ve solo esas.
Es el espejo de `seccionesLabPermitidas` en `src/features/usuarios/permisos.ts`
(mismos casos en `tests/test_lab_secciones.py` y `permisos.test.ts`).
"""
from __future__ import annotations

from fastapi import Depends, HTTPException

from .auth import Usuario, usuario_actual

LAB_INGRESO = "lab_ingreso"
LAB_VERIFICACIONES = "lab_verificaciones"
LAB_ENVIO = "lab_envio"
SECCIONES = (LAB_INGRESO, LAB_VERIFICACIONES, LAB_ENVIO)


def secciones_de(usuario: Usuario) -> tuple[str, ...]:
    """Las secciones que la cuenta puede abrir dentro de AgroFresh Lab."""
    if usuario.tipoAcceso in ("admin_general", "gerencia"):
        return SECCIONES
    elegidas = tuple(s for s in SECCIONES if s in (usuario.modulos or []))
    return elegidas or SECCIONES


def permite(usuario: Usuario, seccion: str) -> bool:
    return seccion in secciones_de(usuario)


def exigir(seccion: str):
    """Dependencia de FastAPI: 403 (nunca 401: un 401 cierra la sesión en el navegador)
    si la cuenta no tiene esa sección. Va ADEMÁS de `SOLO_AGROFRESH`."""

    def _revisar(usuario: Usuario = Depends(usuario_actual)) -> None:
        if not permite(usuario, seccion):
            raise HTTPException(403, "Tu cuenta no tiene acceso a esta sección de AgroFresh Lab.")

    return Depends(_revisar)
