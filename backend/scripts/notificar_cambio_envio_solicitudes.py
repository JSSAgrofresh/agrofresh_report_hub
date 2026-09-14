"""
Notifica a todos los usuarios y contactos configurados sobre el nuevo
comportamiento de guardar solicitudes: desde ahora el correo se envía
automáticamente al guardar, sin paso manual.

Uso (solo lectura por defecto):
    cd backend
    .venv\Scripts\python.exe scripts\notificar_cambio_envio_solicitudes.py

Para enviar de verdad:
    .venv\Scripts\python.exe scripts\notificar_cambio_envio_solicitudes.py --enviar
"""

import argparse
import json
import os
import sys
from pathlib import Path

# Permite importar desde app/ sin instalar como paquete
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import correo, config


def _correos_usuarios() -> list[str]:
    """Todos los emails activos de la tabla `usuario`. Si no hay BD, retorna []."""
    try:
        from app.db import conexion, cursor_dict  # noqa: PLC0415
        with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
            cur.execute("SELECT email FROM usuario WHERE activo = true ORDER BY nombre")
            return [r["email"] for r in cur.fetchall()]
    except Exception as exc:
        print(f"  [!] No se pudo leer usuarios de la BD: {exc}")
        return []


def _correos_contactos_lab() -> list[str]:
    """Emails activos de contactos de laboratorio (tipo=solicitud)."""
    ruta = config.ruta_datos() / "contactos_laboratorio.json"
    if not ruta.exists():
        return []
    try:
        datos: list[dict] = json.loads(ruta.read_text(encoding="utf-8"))
        return list({
            c["email"]
            for c in datos
            if c.get("activo", True) and c.get("email")
        })
    except Exception as exc:
        print(f"  [!] No se pudo leer contactos de laboratorio: {exc}")
        return []


def _html_correo() -> str:
    verde = "#2d5a27"
    verde_claro = "#e8f5e9"
    gris = "#f5f5f5"
    borde = "#e0e0e0"

    return f"""
<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f0f0f0;font-family:Arial,sans-serif;">

<div style="max-width:620px;margin:32px auto;background:#ffffff;border-radius:8px;
            overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.12);">

  <!-- Cabecera -->
  <div style="background:{verde};padding:28px 32px;">
    <p style="margin:0;color:#c8e6c9;font-size:13px;letter-spacing:.5px;">AGROFRESH REPORT HUB</p>
    <h1 style="margin:8px 0 0;color:#ffffff;font-size:22px;font-weight:700;line-height:1.3;">
      Nuevo flujo de solicitudes de análisis
    </h1>
  </div>

  <!-- Intro -->
  <div style="padding:28px 32px 16px;">
    <p style="margin:0 0 12px;color:#333;font-size:15px;line-height:1.6;">
      A partir de hoy, al guardar una solicitud el sistema la
      <strong>envía automáticamente</strong> a los destinatarios configurados
      — sin que tengas que hacer ningún paso adicional.
    </p>
    <p style="margin:0;color:#555;font-size:14px;line-height:1.6;">
      También se habilitó la <strong>edición de solicitudes ya enviadas</strong>:
      al guardar los cambios, el correo actualizado se reenvía al tiro.
    </p>
  </div>

  <!-- Sección: Antes -->
  <div style="margin:8px 32px;background:{gris};border:1px solid {borde};border-radius:6px;padding:20px 24px;">
    <p style="margin:0 0 14px;font-size:12px;color:#888;text-transform:uppercase;letter-spacing:.6px;">
      ANTES
    </p>

    <!-- Paso 1 -->
    <div style="display:flex;align-items:flex-start;gap:12px;margin-bottom:14px;">
      <div style="min-width:24px;height:24px;background:#bbb;border-radius:50%;
                  display:flex;align-items:center;justify-content:center;
                  color:#fff;font-weight:700;font-size:13px;text-align:center;line-height:24px;">1</div>
      <div>
        <div style="background:#fff;border:1px solid {borde};border-radius:4px;padding:8px 14px;
                    font-size:13px;color:#333;display:inline-block;">
          Completar formulario → click en <strong>"Guardar solicitud"</strong>
        </div>
        <p style="margin:4px 0 0;font-size:12px;color:#888;">→ te llevaba al <em>listado</em> general</p>
      </div>
    </div>

    <!-- Paso 2 -->
    <div style="display:flex;align-items:flex-start;gap:12px;margin-bottom:14px;">
      <div style="min-width:24px;height:24px;background:#bbb;border-radius:50%;
                  display:flex;align-items:center;justify-content:center;
                  color:#fff;font-weight:700;font-size:13px;text-align:center;line-height:24px;">2</div>
      <div>
        <div style="background:#fff;border:1px solid {borde};border-radius:4px;padding:8px 14px;
                    font-size:13px;color:#333;display:inline-block;">
          Buscar la solicitud en el listado → abrir el detalle
        </div>
      </div>
    </div>

    <!-- Paso 3 -->
    <div style="display:flex;align-items:flex-start;gap:12px;">
      <div style="min-width:24px;height:24px;background:#bbb;border-radius:50%;
                  display:flex;align-items:center;justify-content:center;
                  color:#fff;font-weight:700;font-size:13px;text-align:center;line-height:24px;">3</div>
      <div>
        <div style="background:#fff;border:1px solid {borde};border-radius:4px;padding:8px 14px;
                    font-size:13px;color:#333;display:inline-block;">
          Click en <strong>"Enviar por correo"</strong> → confirmar y enviar
        </div>
        <p style="margin:4px 0 0;font-size:12px;color:#888;">3 pasos distintos</p>
      </div>
    </div>
  </div>

  <!-- Flecha -->
  <div style="text-align:center;padding:12px 0;font-size:24px;color:{verde};">▼</div>

  <!-- Sección: Ahora -->
  <div style="margin:0 32px 24px;background:{verde_claro};border:2px solid {verde};border-radius:6px;padding:20px 24px;">
    <p style="margin:0 0 14px;font-size:12px;color:{verde};text-transform:uppercase;letter-spacing:.6px;font-weight:700;">
      AHORA
    </p>

    <!-- Paso único -->
    <div style="display:flex;align-items:flex-start;gap:12px;">
      <div style="min-width:24px;height:24px;background:{verde};border-radius:50%;
                  display:flex;align-items:center;justify-content:center;
                  color:#fff;font-weight:700;font-size:13px;text-align:center;line-height:24px;">1</div>
      <div>
        <div style="background:#fff;border:1px solid {verde};border-radius:4px;padding:8px 14px;
                    font-size:13px;color:#333;display:inline-block;">
          Completar formulario → click en <strong>"Guardar y enviar"</strong>
        </div>
        <p style="margin:4px 0 0;font-size:12px;color:{verde};font-weight:600;">
          → el correo sale automáticamente y te lleva al <em>detalle</em> de la solicitud
        </p>
      </div>
    </div>
  </div>

  <!-- Mockup del botón -->
  <div style="margin:0 32px 28px;text-align:center;">
    <p style="margin:0 0 12px;font-size:13px;color:#555;">Así se ve el botón ahora:</p>
    <div style="display:inline-block;background:{verde};color:#fff;padding:10px 28px;
                border-radius:5px;font-size:15px;font-weight:700;letter-spacing:.3px;">
      Guardar y enviar
    </div>
    <p style="margin:10px 0 0;font-size:12px;color:#888;">
      (mientras guarda y envía, dice <em>"Guardando y enviando…"</em>)
    </p>
  </div>

  <!-- Novedad 2: Editar solicitudes enviadas -->
  <div style="margin:0 32px 24px;background:#fff8e1;border:1px solid #ffe082;border-radius:6px;padding:20px 24px;">
    <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#e65100;">
      ✏️  Ahora también puedes editar solicitudes ya enviadas
    </p>
    <p style="margin:0;font-size:14px;color:#555;line-height:1.6;">
      Antes, una vez enviada la solicitud quedaba bloqueada. Ahora el botón
      <strong>"Editar"</strong> aparece siempre. Al guardar los cambios, el
      correo actualizado se reenvía automáticamente a los mismos destinatarios.
    </p>
  </div>

  <!-- Mockup detalle -->
  <div style="margin:0 32px 28px;">
    <p style="margin:0 0 10px;font-size:13px;color:#555;">Vista del detalle tras guardar:</p>
    <!-- Header simulado -->
    <div style="border:1px solid {borde};border-radius:6px;overflow:hidden;font-size:13px;">
      <div style="background:{verde};padding:10px 16px;color:#fff;font-weight:700;">
        Solicitud N°1234 · Enviada
      </div>
      <div style="background:{gris};padding:8px 16px;display:flex;gap:8px;flex-wrap:wrap;">
        <span style="background:#fff;border:1px solid {borde};padding:5px 12px;border-radius:4px;color:#333;">Volver</span>
        <span style="background:#fff;border:1px solid {verde};padding:5px 12px;border-radius:4px;color:{verde};font-weight:600;">Editar</span>
        <span style="background:#fff;border:1px solid {borde};padding:5px 12px;border-radius:4px;color:#333;">Descargar Excel</span>
        <span style="background:#fff;border:1px solid {borde};padding:5px 12px;border-radius:4px;color:#333;">Descargar PDF</span>
        <span style="background:{verde};padding:5px 12px;border-radius:4px;color:#fff;font-weight:600;">Reenviar por correo</span>
      </div>
    </div>
  </div>

  <!-- Cierre -->
  <div style="padding:24px 32px;background:{gris};border-top:1px solid {borde};">
    <p style="margin:0 0 6px;font-size:14px;color:#333;">
      Si tienes dudas, contáctate con el equipo de sistemas.
    </p>
    <p style="margin:0;font-size:12px;color:#888;">
      — AgroFresh Report Hub · {config.settings.APP_ENV if hasattr(config, "settings") else "Producción"}
    </p>
  </div>

</div>
</body>
</html>
"""


def _texto_plano() -> str:
    return """
NUEVO FLUJO DE SOLICITUDES DE ANÁLISIS — AgroFresh Report Hub
==============================================================

A partir de hoy, guardar una solicitud envía el correo AUTOMÁTICAMENTE.

ANTES:
  1. Guardar solicitud → iba al listado
  2. Abrir detalle de la solicitud
  3. Click "Enviar por correo"

AHORA:
  1. Click "Guardar y enviar" → el correo sale al instante y te lleva al detalle

ADEMÁS:
  • Ahora puedes editar solicitudes ya enviadas. Al guardar, el correo
    actualizado se reenvía automáticamente.

Si tienes dudas, contáctate con el equipo de sistemas.
"""


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--enviar", action="store_true", help="Realmente enviar el correo")
    args = parser.parse_args()

    print("Recopilando destinatarios…")
    usuarios = _correos_usuarios()
    contactos = _correos_contactos_lab()

    todos: list[str] = list({*usuarios, *contactos})
    todos.sort()

    print(f"  Usuarios en BD: {len(usuarios)}")
    print(f"  Contactos de laboratorio: {len(contactos)}")
    print(f"  Total únicos: {len(todos)}")

    if not todos:
        print("[!] No hay destinatarios. Revisa la BD y contactos_laboratorio.json.")
        return

    print("\nDestinatarios:")
    for e in todos:
        print(f"  • {e}")

    if not args.enviar:
        print("\n[SIMULACIÓN] No se envió nada. Agrega --enviar para enviar de verdad.")
        return

    asunto = "[AgroFresh] Nuevo flujo: solicitudes ahora se envían al guardar"
    html = _html_correo()
    texto = _texto_plano()

    print(f"\nEnviando a {len(todos)} destinatario(s)…")
    try:
        resultado = correo.enviar(
            destinatario=todos[0],
            asunto=asunto,
            cuerpo_html=html,
            cuerpo_texto=texto,
            cc=todos[1:] if len(todos) > 1 else None,
        )
        print(f"  ✓ Enviado. ID: {resultado.mensaje_id}")
        print(f"    To:  {resultado.to}")
        if resultado.cc:
            print(f"    CC:  {resultado.cc}")
    except Exception as exc:
        print(f"  ✗ Error al enviar: {exc}")
        sys.exit(1)


if __name__ == "__main__":
    main()
