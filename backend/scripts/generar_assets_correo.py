"""
Genera las imágenes de los correos con plantilla (aviso a clientes) en `app/correo_assets/`:

  banner_<clave>.png   el encabezado de cada plantilla (1200 px de ancho, se muestra a 600)
  mini_<clave>.png     la miniatura que se ve en el selector de plantillas

Los PNG ya generados van en el repositorio: el servidor no corre este script. Solo hace falta si
cambian las portadas de marca (`app/correo_assets/fuentes/`) o el logo.

    python scripts/generar_assets_correo.py        (necesita numpy y Pillow)

Cómo se hace cada encabezado
  * Las portadas de marca (azul, marino, clara, verde con foto) traen textos de ejemplo («The
    Journey of Fresh Produce», «[Presenter Name]»...). Se borran rellenando cada punto que no sea
    de la paleta de la portada con el color vecino, y encima se ponen el logo y la bajada
    «Science. Solutions. Sustainability.» de AgroFresh. El título del correo NO va en la imagen:
    es texto editable debajo.
  * El logo en colores sale de la imagen de marca (`fuente_marca.jpg`, color a transparencia);
    el logo blanco es el mismo sin color.
  * Los correos no soportan CSS avanzado ni SVG de forma confiable, por eso todo va como imagen.
"""
from __future__ import annotations

import os

import numpy as np
from PIL import Image, ImageDraw, ImageFont

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(AQUI)
ASSETS = os.path.join(RAIZ, "app", "correo_assets")
FUENTES = os.path.join(ASSETS, "fuentes")
MARCA = os.path.join(ASSETS, "fuente_marca.jpg")
LOGO_APP = os.path.join(os.path.dirname(RAIZ), "src", "assets", "agrofresh-logo.png")

ANCHO = 1200
BAJADA = "Science. Solutions. Sustainability."
FUENTE_NEGRITA = [
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    "C:/Windows/Fonts/arialbd.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
]

AMARILLO = (241, 195, 24)
VERDE = (64, 174, 73)
VERDE_OSCURO = (49, 95, 56)
TEXTO_VERDE = (29, 87, 36)
FONDO_SUAVE = (244, 246, 241)
BLANCO = (255, 255, 255)


def _hex(c: str) -> tuple[int, int, int]:
    return tuple(int(c[i:i + 2], 16) for i in (1, 3, 5))  # type: ignore[return-value]


# --------------------------------------------------------------------------- logo y letra

def _fuente(px: int) -> ImageFont.FreeTypeFont:
    for ruta in FUENTE_NEGRITA:
        if os.path.exists(ruta):
            return ImageFont.truetype(ruta, px)
    raise RuntimeError("No hay una fuente en negrita para dibujar la bajada.")


def logo_marca(color: bool, alto: int) -> Image.Image:
    """El logo de la imagen de marca con fondo transparente, en sus colores exactos o todo blanco.
    El JPG trae el logo sobre blanco: de cada punto se saca cuánto es logo (transparencia) y se
    le pone el color de marca (verde para «Agro», amarillo para «Fresh»)."""
    a = np.array(Image.open(MARCA).convert("RGB")).astype(float)[54 - 4:161 + 5, 59 - 4:489 + 5]
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    amarillo = r > g                      # mezclado con blanco, «Fresh» sigue con R > G y «Agro» con G > R
    alfa_verde = (255 - r) / (255 - VERDE[0])
    alfa_amar = (255 - b) / (255 - AMARILLO[2])
    alfa = np.clip(np.where(amarillo, alfa_amar, alfa_verde), 0, 1)
    alfa[alfa < 0.05] = 0
    rgb = np.zeros_like(a)
    if color:
        rgb[amarillo] = AMARILLO
        rgb[~amarillo] = VERDE
    else:
        rgb[:] = 255
    img = np.dstack([rgb, alfa * 255]).astype(np.uint8)
    logo = Image.fromarray(img, "RGBA")
    ancho = round(logo.width * alto / logo.height)
    return logo.resize((ancho, alto), Image.LANCZOS)


def _poner_centrado(base: Image.Image, logo: Image.Image, cx: int, cy: int) -> None:
    base.paste(logo, (cx - logo.width // 2, cy - logo.height // 2), logo)


def _bajada(base: Image.Image, cx: int, cy: int, px: int, color: tuple[int, int, int]) -> None:
    d = ImageDraw.Draw(base)
    f = _fuente(px)
    caja = d.textbbox((0, 0), BAJADA, font=f)
    ancho, alto = caja[2] - caja[0], caja[3] - caja[1]
    d.text((cx - ancho // 2 - caja[0], cy - alto // 2 - caja[1]), BAJADA, font=f, fill=color)


# --------------------------------------------------------------------------- limpiar portadas

def _direcciones(etiqueta: np.ndarray, valido: np.ndarray) -> list[float]:
    """Las dos inclinaciones (dx por cada dy) de los bordes de la portada, medidas sobre los puntos
    que no son texto: la que más veces deja el mismo color a 24 px hacia arriba y hacia abajo."""
    h, w = etiqueta.shape
    paso = 24
    puntos = []
    for s in np.arange(-0.60, 0.601, 0.01):
        dx = int(round(s * paso))
        y0, y1 = 0, h - paso
        arriba = etiqueta[y0:y1, max(0, -dx):w - max(0, dx)]
        abajo = etiqueta[y0 + paso:y1 + paso, max(0, dx):w - max(0, -dx)]
        va = valido[y0:y1, max(0, -dx):w - max(0, dx)] & valido[y0 + paso:y1 + paso, max(0, dx):w - max(0, -dx)]
        puntos.append(((arriba == abajo) & va).sum() / max(1, va.sum()))
    puntos = np.array(puntos)
    s1 = -0.60 + 0.01 * int(puntos.argmax())
    puntos[max(0, int(puntos.argmax()) - 12):int(puntos.argmax()) + 13] = 0     # otra dirección distinta
    s2 = -0.60 + 0.01 * int(puntos.argmax())
    return [s1, s2]


def _limpiar(ruta: str, paleta: list[str], x0: float = 0.18, x1: float = 0.82, y0: float = 0.17,
             umbral: int = 8, borde: int = 3, x0_abajo: float | None = None, radio: int = 2) -> Image.Image:
    """Borra los textos de ejemplo de una portada. Dentro de la zona de textos, todo punto que no
    sea de la paleta (letras y su borde suavizado) se vuelve a pintar: primero con el color de sus
    vecinos y, donde un borde diagonal cruza el texto, siguiendo la inclinación del borde hacia
    arriba y hacia abajo hasta dar con color de portada, así el borde sigue siendo una recta."""
    a = np.array(Image.open(ruta).convert("RGB")).astype(int)[1:-1, 1:-1]   # sin el borde de la captura
    h, w, _ = a.shape
    pal = np.array([_hex(c) for c in paleta])
    dist = np.abs(a[:, :, None, :] - pal[None, None, :, :]).sum(axis=3).min(axis=2)
    zona = np.zeros((h, w), bool)
    zona[int(h * y0):, int(w * x0):int(w * x1)] = True
    if x0_abajo is not None:  # más a la izquierda desde donde empieza la bajada (la foto no llega ahí)
        zona[int(h * 0.62):, int(w * x0_abajo):int(w * x1)] = True
    malo = zona & (dist > umbral)
    for _ in range(borde):  # se agranda para llevarse también el borde suavizado de las letras
        m = malo.copy()
        m[1:, :] |= malo[:-1, :]; m[:-1, :] |= malo[1:, :]; m[:, 1:] |= malo[:, :-1]; m[:, :-1] |= malo[:, 1:]
        malo = m & zona
    valido = ~malo
    d_todos = np.abs(a[:, :, None, :] - pal[None, None, :, :]).sum(axis=3)
    etiqueta = d_todos.argmin(axis=2)

    # 1) Relleno por vecinos (respaldo).
    rell = a.copy()
    v = valido.copy()
    for _ in range(120):
        if v.all():
            break
        nuevo = v.copy()
        for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
            vec = np.roll(v, (dy, dx), axis=(0, 1))
            col = np.roll(rell, (dy, dx), axis=(0, 1))
            toma = (~nuevo) & vec
            rell[toma] = col[toma]
            nuevo |= toma
        v = nuevo
    etiqueta_rell = d_todos.argmin(axis=2) if False else np.abs(rell[:, :, None, :] - pal[None, None, :, :]).sum(axis=3).argmin(axis=2)

    # 2) Siguiendo los bordes: por cada dirección, el color que hay arriba y abajo; si coincide, es ese.
    final = np.where(valido, etiqueta, etiqueta_rell)
    dirs = _direcciones(etiqueta, valido)
    ys, xs = np.where(malo)
    for y, x in zip(ys, xs):
        mejor = None
        for s in dirs:
            colores = []
            pasos = 0
            for sentido in (-1, 1):
                yy, xx = y, float(x)
                color = None
                for k in range(1, 260):
                    yy = y + sentido * k
                    xx = x + sentido * k * s
                    xi = int(round(xx))
                    if yy < 0 or yy >= h or xi < 0 or xi >= w:
                        break
                    if valido[yy, xi]:
                        color = etiqueta[yy, xi]
                        pasos += k
                        break
                colores.append(color)
            if colores[0] is not None and colores[0] == colores[1]:
                if mejor is None or pasos < mejor[0]:
                    mejor = (pasos, colores[0])
        if mejor is not None:
            final[y, x] = mejor[1]

    # 3) Un filtro de moda chico quita los puntos sueltos que hayan quedado.
    if radio > 0:
        votos = np.zeros((len(pal), h, w), np.int32)
        for k in range(len(pal)):
            uno = np.pad((final == k).astype(np.int32), radio + 1, mode="edge")
            acum = uno.cumsum(axis=0).cumsum(axis=1)
            vv = (acum[2 * radio + 1:, 2 * radio + 1:] - acum[:-2 * radio - 1, 2 * radio + 1:]
                  - acum[2 * radio + 1:, :-2 * radio - 1] + acum[:-2 * radio - 1, :-2 * radio - 1])
            votos[k] = vv[:h, :w]
        final = np.where(zona, votos.argmax(axis=0), final)
    plano = pal[final]
    a = np.where(zona[..., None], plano, a)
    return Image.fromarray(a.astype(np.uint8), "RGB")


def _a_ancho(img: Image.Image) -> Image.Image:
    return img.resize((ANCHO, round(img.height * ANCHO / img.width)), Image.LANCZOS)


# --------------------------------------------------------------------------- encabezados

RADIO_MODA = 2


def _con_marca(ruta: str, paleta: list[str], recorte: tuple[float, float], logo_color: bool,
               color_bajada: tuple[int, int, int], alto: int = 340) -> Image.Image:
    # Zona completa (todo el ancho y alto): así no quedan costuras donde empezaba la zona de textos.
    limpia = _a_ancho(_limpiar(os.path.join(FUENTES, ruta), paleta, x0=0.0, x1=1.0, y0=0.0, radio=RADIO_MODA))
    # `recorte[0]` = 0 → desde arriba; 1 → desde el borde de abajo.
    y = round(recorte[0] * (limpia.height - alto))
    banda = limpia.crop((0, y, ANCHO, y + alto))
    _poner_centrado(banda, logo_marca(logo_color, 112), ANCHO // 2, 112)
    _bajada(banda, ANCHO // 2, 252, 44, color_bajada)
    return banda


def banner_azul() -> Image.Image:
    return _con_marca("portada_azul.png", ["#368ecd", "#62c0ed", "#1e6fb4", "#297d39", "#40ae49"], (0.0, 0), False, BLANCO)


def banner_marino() -> Image.Image:
    return _con_marca("portada_marino.png", ["#19315b", "#29456c", "#02183c"], (0.0, 0), True, BLANCO)


def banner_clara_amarillo() -> Image.Image:
    # De la mitad de abajo hacia el borde: ahí está el triángulo amarillo de la portada.
    return _con_marca("portada_clara_amarillo.png", ["#f4f2f1", "#ffffff", "#ece8e7", "#f1c319"], (1.0, 0), True, TEXTO_VERDE)


def banner_clara_verde() -> Image.Image:
    return _con_marca("portada_clara_verde.png", ["#f4f2f1", "#ffffff", "#ece8e7", "#40ae49"], (1.0, 0), True, TEXTO_VERDE)


def banner_verde_foto() -> Image.Image:
    """La portada con la foto (a la izquierda, intacta); a la derecha, sobre el verde, el logo
    blanco y la bajada."""
    limpia = _limpiar(
        os.path.join(FUENTES, "portada_verde_foto.webp"),
        ["#40ae49", "#61c0ed", "#305f39", "#f1c418", "#378ece"], x0=0.435, x1=1.0, y0=0.17, umbral=30, borde=6, x0_abajo=0.42,
    )
    img = _a_ancho(limpia)
    banda = img.crop((0, 0, ANCHO, 540))
    cx = 885
    _poner_centrado(banda, logo_marca(False, 120), cx, 215)
    _bajada(banda, cx, 340, 34, BLANCO)
    return banda


def _curva(p0, p1, p2, p3, pasos=60):
    pts = []
    for i in range(pasos + 1):
        t = i / pasos
        pts.append((
            (1 - t) ** 3 * p0[0] + 3 * (1 - t) ** 2 * t * p1[0] + 3 * (1 - t) * t ** 2 * p2[0] + t ** 3 * p3[0],
            (1 - t) ** 3 * p0[1] + 3 * (1 - t) ** 2 * t * p1[1] + 3 * (1 - t) * t ** 2 * p2[1] + t ** 3 * p3[1],
        ))
    return pts


def banner_corporativo() -> Image.Image:
    """Banda clara con el logo a la izquierda y tres curvas de marca cruzando desde la derecha."""
    alto, k = 220, 4
    lienzo = Image.new("RGB", (ANCHO * k, alto * k), FONDO_SUAVE)
    d = ImageDraw.Draw(lienzo)

    def banda(color, x_ini, ond):
        sup = _curva((x_ini + 160, 0), (x_ini + 220, alto * 0.30), (x_ini + 60, alto * ond), (x_ini, alto))
        d.polygon([(x * k, y * k) for x, y in sup] + [(ANCHO * k, alto * k), (ANCHO * k, 0)], fill=color)

    banda(AMARILLO, 860, 0.62)
    banda(VERDE, 930, 0.56)
    banda(VERDE_OSCURO, 1030, 0.50)
    lienzo = lienzo.resize((ANCHO, alto), Image.LANCZOS)
    logo = logo_marca(True, 100)
    lienzo.paste(logo, (56, (alto - logo.height) // 2), logo)
    return lienzo


def banner_estandar() -> Image.Image | None:
    return None


BANNERS = {
    "corporativa": banner_corporativo,
    "clara_amarillo": banner_clara_amarillo,
    "clara_verde": banner_clara_verde,
    "azul": banner_azul,
    "marino": banner_marino,
    "verde_foto": banner_verde_foto,
}


FOTOGRAFICAS = {"verde_foto"}


def miniatura_estandar() -> Image.Image:
    """El correo sobrio de siempre, en chico: logo a la izquierda, título y línea fina."""
    w, h = 240, 150
    img = Image.new("RGB", (w, h), (255, 255, 255))
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, w - 1, h - 1], outline=(225, 229, 220))
    logo = logo_marca(True, 20)
    img.paste(logo, (14, 14), logo)
    d.text((176, 24), "TÍTULO", fill=(17, 17, 17), font=_fuente(13), anchor="mm")
    d.line([(14, 50), (w - 14, 50)], fill=(17, 17, 17), width=2)
    for i, ancho in enumerate((190, 205, 150, 0, 195, 120)):
        if ancho:
            d.rectangle([14, 66 + i * 11, 14 + ancho, 70 + i * 11], fill=(205, 208, 203))
    return img


def main() -> None:
    os.makedirs(ASSETS, exist_ok=True)
    for clave, hacer in BANNERS.items():
        banner = hacer()
        if clave in FOTOGRAFICAS:
            # Con foto, el PNG pesa casi medio MB y viaja en cada correo: va como JPEG.
            ruta = os.path.join(ASSETS, f"banner_{clave}.jpg")
            banner.save(ruta, quality=86, optimize=True, progressive=False)  # Outlook de escritorio no pinta JPEG progresivos
        else:
            ruta = os.path.join(ASSETS, f"banner_{clave}.png")
            banner.save(ruta, optimize=True)
        mini = banner.resize((240, round(banner.height * 240 / banner.width)), Image.LANCZOS)
        # Todas las miniaturas miden lo mismo para que el selector quede parejo.
        marco = Image.new("RGB", (240, 150), (255, 255, 255))
        marco.paste(mini, (0, 0))
        d = ImageDraw.Draw(marco)
        for i, ancho in enumerate((200, 215, 160)):
            d.rectangle([14, max(mini.height + 12, 74) + i * 11, 14 + ancho, max(mini.height + 12, 74) + i * 11 + 4], fill=(205, 208, 203))
        marco.save(os.path.join(ASSETS, f"mini_{clave}.png"), optimize=True)
        print(f"{os.path.basename(ruta)}: {banner.size[0]}x{banner.size[1]} ({os.path.getsize(ruta) // 1024} KB)")
    miniatura_estandar().save(os.path.join(ASSETS, "mini_estandar.png"), optimize=True)
    print("mini_estandar.png")


if __name__ == "__main__":
    main()
