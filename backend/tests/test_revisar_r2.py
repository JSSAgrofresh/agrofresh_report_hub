"""Inventario de R2 (solo lectura): carpetas vacías, gemelas y claves raras."""
import importlib.util
import os

_spec = importlib.util.spec_from_file_location("revisar_r2", os.path.join(os.path.dirname(__file__), "..", "scripts", "revisar_r2.py"))
mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(mod)


def test_las_carpetas_con_el_mismo_nombre_escrito_distinto_se_detectan():
    claves = [
        "informes/PLANTA/2026-10-01/Linea de Proceso/Quiteca/a.pdf",
        "informes/PLANTA/2026-10-01/Línea de proceso/Quiteca/b.pdf",
        "informes/PLANTA/2026-10-01/Actimist/Quiteca/c.pdf",
    ]
    gemelas = mod.carpetas_gemelas(claves)
    assert len(gemelas) == 1 and gemelas[0][1] == ["Linea de Proceso", "Línea de proceso"]


def test_sin_gemelas_no_avisa_y_los_archivos_no_cuentan_como_carpetas():
    assert mod.carpetas_gemelas(["a/b/x.pdf", "a/c/x.pdf", "A.txt"]) == []


def test_carpeta_vacia_solo_si_no_tiene_nada_dentro():
    claves = ["a/", "a/b/", "a/b/x.pdf", "vacia/", "otra/"]
    assert mod.carpetas_vacias(claves) == ["otra/", "vacia/"]


def test_claves_raras():
    r = dict(mod.claves_raras(["a//b.pdf", "a/ b /c.pdf", "a/sinextension", "a/ok.pdf", "a/carpeta/"]))
    assert r["a//b.pdf"] == "barra doble" and "espacio" in r["a/ b /c.pdf"] and r["a/sinextension"] == "archivo sin extensión"
    assert "a/ok.pdf" not in r and "a/carpeta/" not in r


def test_resumen_por_carpeta_suma_archivos_y_bytes():
    objetos = [{"clave": "informes/a.pdf", "tamano": 10, "fecha": None}, {"clave": "informes/b.pdf", "tamano": 5, "fecha": None},
               {"clave": "informes/", "tamano": 0, "fecha": None}, {"clave": "suelto.txt", "tamano": 1, "fecha": None}]
    r = mod.resumen_por_carpeta(objetos)
    assert r["informes"] == {"archivos": 2, "bytes": 15, "ultimo": None} and r["(raíz)"]["archivos"] == 1
