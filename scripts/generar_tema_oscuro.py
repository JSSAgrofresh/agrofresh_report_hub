#!/usr/bin/env python3
"""
Genera `src/styles/mejoras-visuales-oscuro.css`: el tema oscuro de las pantallas que traen colores fijos
(fondos casi blancos, textos oscuros, bordes claros) escritos a mano en sus CSS Modules.

Qué hace: recorre todos los `*.module.css`, toma cada regla que fija un fondo / texto / borde con un color
hexadecimal claro (o un texto oscuro) y emite la regla equivalente para `html[data-mejoras][data-tema="oscuro"]`,
apuntando a la misma clase con `[class*="_nombre_"]` (los nombres de clase de un CSS Module son `_nombre_hash`).

Cuándo volver a correrlo: cuando se agregue una pantalla o se cambie un color fijo en un CSS Module.
    python scripts/generar_tema_oscuro.py

Lo que NO toca: reglas con `:global(...)` (el portal de clientes tiene su propio estilo y no usa este tema),
animaciones y colores de significado (rojos, azules, amarillos intensos de estados), que siguen igual.
"""
import colorsys
import glob
import re
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
SALIDA = RAIZ / "src" / "styles" / "mejoras-visuales-oscuro.css"
PREFIJO = 'html[data-mejoras][data-tema="oscuro"]'

# Colores del tema oscuro (los mismos de mejoras-visuales.css).
SUPERFICIE = "#142019"
SUPERFICIE_2 = "#1b2b20"
VERDE_SUAVE = "#173422"
VERDE_FUERTE = "#1f4a2a"
ROJO_SUAVE = "#37191a"
AMARILLO_SUAVE = "#2e2610"
AZUL_SUAVE = "#10283f"
TEXTO = "#dfe9dc"
BORDE = "#25382b"


def rgb(h):
    h = h.lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    return tuple(int(h[i : i + 2], 16) / 255 for i in (0, 2, 4))


def clasificar_fondo(h):
    """Devuelve el fondo oscuro equivalente a un fondo claro, o None si no es un fondo claro."""
    r, g, b = rgb(h)
    hh, l, s = colorsys.rgb_to_hls(r, g, b)
    if l < 0.78:
        return None
    hue = hh * 360
    if s < 0.15 or l > 0.965:  # blanco o gris muy claro
        return SUPERFICIE if l > 0.93 else SUPERFICIE_2
    if 70 <= hue < 170:  # verdes
        return VERDE_FUERTE if l < 0.86 else VERDE_SUAVE
    if hue < 20 or hue >= 330:  # rojos / rosas
        return ROJO_SUAVE
    if 20 <= hue < 70:  # amarillos / naranjas claros
        return AMARILLO_SUAVE
    if 170 <= hue < 270:  # azules
        return AZUL_SUAVE
    return SUPERFICIE_2


def es_texto_oscuro(h):
    r, g, b = rgb(h)
    _, l, s = colorsys.rgb_to_hls(r, g, b)
    return l < 0.42 and s < 0.40


def es_borde_claro(h):
    r, g, b = rgb(h)
    _, l, s = colorsys.rgb_to_hls(r, g, b)
    return l > 0.80 and s < 0.25


def selector_oscuro(sel):
    """`.lista td` -> `[class*="_lista_"] td`. Devuelve None si el selector no se puede traducir."""
    if ":global" in sel or "@" in sel or "%" in sel or sel.strip() in ("from", "to"):
        return None
    if not re.search(r"\.[A-Za-z_]", sel):
        return None  # sin clase local: es un selector de etiqueta, no se toca
    return re.sub(r"\.([A-Za-z_][\w-]*)", r'[class*="_\1_"]', sel)


NO_BARRA = ":not(:where(aside[class*=\"_sidebar_\"] *))"
HEX = r"#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b"


def reglas_de(css):
    css = re.sub(r"/\*.*?\*/", "", css, flags=re.S)
    for m in re.finditer(r"([^{}]+)\{([^{}]*)\}", css):
        yield m.group(1).strip(), m.group(2)


# Ya tienen su propio diseño oscuro (barra lateral) o no usan este tema (portal de clientes).
EXCLUIDOS = ("components/layout/Sidebar.module.css", "components/layout/portal/")


def main():
    salida = {}
    for archivo in sorted(glob.glob(str(RAIZ / "src/**/*.module.css"), recursive=True)):
        if any(x in archivo.replace("\\", "/") for x in EXCLUIDOS):
            continue
        css = Path(archivo).read_text(encoding="utf-8")
        for sel, cuerpo in reglas_de(css):
            props = []
            for decl in cuerpo.split(";"):
                if ":" not in decl:
                    continue
                prop, valor = (x.strip() for x in decl.split(":", 1))
                valor_sin_imp = valor.replace("!important", "").strip()
                if prop in ("background", "background-color") and re.fullmatch(HEX, valor_sin_imp):
                    nuevo = clasificar_fondo(valor_sin_imp)
                    if nuevo:
                        props.append(f"background-color:{nuevo}!important")
                elif prop == "color" and re.fullmatch(HEX, valor_sin_imp):
                    if es_texto_oscuro(valor_sin_imp):
                        props.append(f"color:{TEXTO}!important")
                elif prop.startswith("border") and not prop.endswith(("radius", "width", "style")):
                    for h in re.findall(HEX, valor_sin_imp):
                        if es_borde_claro(h):
                            lado = prop if prop.endswith("-color") else prop + "-color"
                            if prop == "border" or prop.endswith("-color") or prop in (
                                "border-top", "border-right", "border-bottom", "border-left"
                            ):
                                props.append(f"{lado}:{BORDE}!important")
                            break
            if not props:
                continue
            nuevo_sel = selector_oscuro(sel)
            if not nuevo_sel:
                continue
            for parte in (p.strip() for p in nuevo_sel.split(",") if p.strip()):
                # Los nombres de clase de distintos módulos pueden coincidir (`_marco_`, `_etiqueta_`): lo que está dentro
                # de la barra lateral nunca se toca. `:where` mantiene la especificidad igual a la de la regla original.
                if "::" in parte:
                    parte = parte.replace("::", NO_BARRA + "::", 1)
                else:
                    parte += NO_BARRA
                clave = f"{PREFIJO} {parte}"
                salida.setdefault(clave, [])
                for p in props:
                    if p not in salida[clave]:
                        salida[clave].append(p)

    cabecera = (
        "/* GENERADO por scripts/generar_tema_oscuro.py: no editar a mano (se pierde al volver a correrlo).\n"
        "   Tema oscuro de las pantallas con colores fijos claros en sus CSS Modules. Va ANTES de mejoras-visuales.css\n"
        "   para que las reglas escritas a mano de ese archivo ganen cuando coinciden. */\n"
    )
    cuerpo = "\n".join(f"{k} {{{';'.join(v)}}}" for k, v in salida.items())
    SALIDA.write_text(cabecera + cuerpo + "\n", encoding="utf-8")
    print(f"{len(salida)} reglas -> {SALIDA.relative_to(RAIZ)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
