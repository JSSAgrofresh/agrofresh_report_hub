"""Arma la portada vertical con los colores y el logo de la marca (recursos/portada_vertical.png)."""
from pathlib import Path

from PIL import Image, ImageDraw

AQUI = Path(__file__).parent
R = AQUI / "recursos"
orig = Image.open(R / "portada_marca.png").convert("RGB")
W, H = 2480, 3508  # A4 vertical a 300 ppp
im = Image.new("RGB", (W, H), "white")
# Franja de formas de marca (se toma la franja derecha de la portada original y se estira a lo alto)
franja = orig.crop((1660, 0, 2000, 1125)).resize((520, H), Image.LANCZOS)
im.paste(franja, (W - 520, 0))
# Logo y lema del original, ampliados
logo = Image.open(R / "logo_agrofresh.png").convert("RGB")
lema = Image.open(R / "lema.png").convert("RGB")
lw = 1150
logo = logo.resize((lw, int(logo.height * lw / logo.width)), Image.LANCZOS)
im.paste(logo, (200, 230))
mw = 780
lema = lema.resize((mw, int(lema.height * mw / lema.width)), Image.LANCZOS)
im.paste(lema, (200, 230 + logo.height + 60))
# línea fina de acento
d = ImageDraw.Draw(im)
d.rectangle([200, 1330, 1150, 1338], fill="#f0c419")
im.save(R / "portada_vertical.png")
print(im.size)
