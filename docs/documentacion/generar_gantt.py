"""Dibuja el Gantt de 11 semanas con la paleta de marca (png/gantt.png)."""
from datetime import date
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

AQUI = Path(__file__).parent
REG = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
NEG = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
F = lambda p, s: ImageFont.truetype(p, s)

FILAS = [
    ("Semanas 1 y 2", "Estructura React, Vite y TypeScript", date(2026, 8, 11), date(2026, 8, 24), 5, "Fundación"),
    ("Semana 3", "Correo, Cloudflare R2 y optimización de la Ingesta", date(2026, 8, 25), date(2026, 8, 31), 57, "Backend y datos"),
    ("Semana 4", "Cruce con escáner e informe final", date(2026, 9, 1), date(2026, 9, 7), 51, "Backend y datos"),
    ("Semana 5", "Solicitudes en móvil, Listados y homogenizador", date(2026, 9, 8), date(2026, 9, 14), 64, "Solicitudes y listados"),
    ("Semana 6", "JSON adjunto, correos Actimist y analitos", date(2026, 9, 15), date(2026, 9, 21), 50, "Solicitudes y listados"),
    ("Semana 7", "Gmail SMTP, áreas, reanálisis y módulo de Ingesta", date(2026, 9, 22), date(2026, 9, 28), 36, "Plataforma"),
    ("Semana 8", "BD Excel, Converter con memoria y Auditoría interna", date(2026, 9, 29), date(2026, 10, 5), 83, "Plataforma"),
    ("Semana 9", "Post Venta Accu-Tab y portal de informes", date(2026, 10, 6), date(2026, 10, 12), 60, "Post venta e indicadores"),
    ("Semana 10", "Plan de entregables, lead time y verificaciones", date(2026, 10, 13), date(2026, 10, 19), 95, "Post venta e indicadores"),
    ("Semana 11", "Portal de clientes, comerciales e informes por correo", date(2026, 10, 20), date(2026, 10, 26), 89, "Portal y correo"),
    ("Semana 12", "Vista de cliente, simulación y Storage de informes", date(2026, 10, 27), date(2026, 10, 30), 41, "Portal y correo"),
]
COLORES = {"Fundación": "#9aa59c", "Backend y datos": "#3b8fd6", "Solicitudes y listados": "#43b049",
           "Plataforma": "#7a55d6", "Post venta e indicadores": "#e98a1c", "Portal y correo": "#2f5f3a"}

W = 1200
fila_h = 78
top = 170
H = top + fila_h * len(FILAS) + 140
im = Image.new("RGB", (W, H), "white")
d = ImageDraw.Draw(im)
inicio, fin = date(2026, 8, 10), date(2026, 11, 2)
x0, x1 = 500, W - 90
dias = (fin - inicio).days
px = lambda dt: x0 + (x1 - x0) * (dt - inicio).days / dias

d.text((30, 24), "Cronograma de desarrollo", font=F(NEG, 34), fill="#2f5f3a")
d.text((30, 72), "11 de agosto al 30 de octubre de 2026 · una barra por semana · PR = pull requests", font=F(REG, 20), fill="#555f58")
# semanas (lunes)
lunes = date(2026, 8, 10)
k = 0
while lunes < fin:
    x = px(lunes)
    d.line([(x, top - 18), (x, top + fila_h * len(FILAS))], fill="#e3e8e3", width=2)
    if k % 2 == 0:
        d.text((x + 3, top - 40), lunes.strftime("%d-%m"), font=F(REG, 19), fill="#555f58")
    k += 1
    lunes = date.fromordinal(lunes.toordinal() + 7)
for i, (sem, foco, a, b, prs, sec) in enumerate(FILAS):
    y = top + i * fila_h
    if i % 2 == 0:
        d.rectangle([20, y, W - 20, y + fila_h], fill="#f4f6f4")
    d.text((30, y + 8), sem, font=F(NEG, 24), fill="#2f5f3a")
    d.text((30, y + 42), foco if len(foco) < 36 else foco[:34] + "…", font=F(REG, 18), fill="#555f58")
    xa, xb = px(a), px(date.fromordinal(b.toordinal() + 1))
    d.rounded_rectangle([xa, y + 12, xb, y + fila_h - 12], radius=8, fill=COLORES[sec])
    d.text((xb + 12, y + fila_h / 2), f"{prs} PR", font=F(NEG, 21), fill="#2f5f3a", anchor="lm")
# leyenda
x = 30
y = top + fila_h * len(FILAS) + 34
for nombre, col in COLORES.items():
    if x + 60 + d.textlength(nombre, font=F(REG, 19)) > W - 20:
        x = 30
        y += 38
    d.rounded_rectangle([x, y, x + 24, y + 24], radius=6, fill=col)
    d.text((x + 32, y + 12), nombre, font=F(REG, 19), fill="#333", anchor="lm")
    x += 56 + int(d.textlength(nombre, font=F(REG, 19))) + 18
im.save(AQUI / "png" / "gantt.png")
print(im.size)
