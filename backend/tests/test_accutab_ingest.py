"""
Tests unitarios para accutab_mail_ingest.py.
No requieren conexion a Gmail ni a R2.
"""
import io
import sys
import zipfile
from pathlib import Path

import pytest

# Asegurar que el paquete raiz sea importable
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from scripts.accutab_mail_ingest import sanitizar_nombre, _nombre_unico


# ---------------------------------------------------------------------------
# sanitizar_nombre
# ---------------------------------------------------------------------------

class TestSanitizarNombre:
    def test_asunto_normal(self):
        r = sanitizar_nombre("AccuTab Resultados Enero 2025")
        assert r == "AccuTab Resultados Enero 2025"

    def test_remueve_caracteres_invalidos(self):
        r = sanitizar_nombre('Asunto: "test" / cosa')
        assert '"' not in r
        assert "/" not in r
        assert ":" not in r

    def test_colapsa_espacios(self):
        r = sanitizar_nombre("Hola   Mundo  ")
        assert r == "Hola Mundo"

    def test_acentos_normalizados(self):
        r = sanitizar_nombre("Análisis año 2025")
        assert r == "Analisis ano 2025"

    def test_asunto_vacio(self):
        r = sanitizar_nombre("")
        assert r == "sin_asunto"

    def test_trunca_largo(self):
        r = sanitizar_nombre("A" * 300)
        assert len(r) <= 200

    def test_barras_invertidas(self):
        r = sanitizar_nombre("Resultado\\Especie")
        assert "\\" not in r


# ---------------------------------------------------------------------------
# _nombre_unico
# ---------------------------------------------------------------------------

class TestNombreUnico:
    def test_no_conflicto(self):
        assert _nombre_unico("AccuTab Jan", set()) == "AccuTab Jan"

    def test_sufijo_2(self):
        existentes = {"AccuTab Jan"}
        assert _nombre_unico("AccuTab Jan", existentes) == "AccuTab Jan (2)"

    def test_sufijo_3(self):
        existentes = {"AccuTab Jan", "AccuTab Jan (2)"}
        assert _nombre_unico("AccuTab Jan", existentes) == "AccuTab Jan (3)"

    def test_nombre_vacio(self):
        assert _nombre_unico("sin_asunto", set()) == "sin_asunto"


# ---------------------------------------------------------------------------
# ZIP traversal: _procesar_zip no escapa de la carpeta destino
# ---------------------------------------------------------------------------

def _crear_zip(entradas: dict[str, bytes]) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        for nombre, data in entradas.items():
            zf.writestr(nombre, data)
    return buf.getvalue()


class TestProcesarZip:
    """Verifica que _procesar_zip sube solo al prefijo correcto."""

    def test_archivos_planos(self, monkeypatch):
        from scripts import accutab_mail_ingest as mod

        subidos: list[tuple[str, bytes]] = []

        def _fake_subir(key, data, ct):
            subidos.append((key, data))

        monkeypatch.setattr(mod._r2, "subir", _fake_subir)

        zip_data = _crear_zip({"resultado.csv": b"a,b,c", "info.txt": b"hola"})
        keys, _contenidos = mod._procesar_zip(zip_data, "accutab/mail/Prueba/")

        nombres = {Path(k).name for k in keys}
        assert "resultado.csv" in nombres
        assert "info.txt" in nombres
        for k, _ in subidos:
            assert k.startswith("accutab/mail/Prueba/")

    def test_estructura_ph_orp(self, monkeypatch):
        from scripts import accutab_mail_ingest as mod

        subidos: list[str] = []

        def _fake_subir(key, data, ct):
            subidos.append(key)

        monkeypatch.setattr(mod._r2, "subir", _fake_subir)

        zip_data = _crear_zip({
            "PH/muestra1.csv": b"ph",
            "ORP/muestra1.csv": b"orp",
        })
        keys, _contenidos = mod._procesar_zip(zip_data, "accutab/mail/Prueba/")

        assert any("PH/muestra1.csv" in k for k in keys)
        assert any("ORP/muestra1.csv" in k for k in keys)

    def test_salta_directorios(self, monkeypatch):
        from scripts import accutab_mail_ingest as mod

        subidos: list[str] = []

        def _fake_subir(key, data, ct):
            subidos.append(key)

        monkeypatch.setattr(mod._r2, "subir", _fake_subir)

        zip_data = _crear_zip({"archivo.csv": b"x"})
        # Agregar entrada de directorio manualmente
        buf = io.BytesIO(zip_data)
        with zipfile.ZipFile(buf, "a") as zf:
            zf.mkdir("carpeta_vacia")  # type: ignore[attr-defined]
        zip_data2 = buf.getvalue()

        keys, _contenidos = mod._procesar_zip(zip_data2, "accutab/mail/Prueba/")
        assert all(not k.endswith("/") for k in keys)


# ---------------------------------------------------------------------------
# content_type helper
# ---------------------------------------------------------------------------

class TestContentType:
    def test_csv(self):
        from scripts.accutab_mail_ingest import _content_type
        assert _content_type("resultado.csv") == "text/csv"

    def test_zip(self):
        from scripts.accutab_mail_ingest import _content_type
        assert _content_type("datos.zip") == "application/zip"

    def test_desconocido(self):
        from scripts.accutab_mail_ingest import _content_type
        assert _content_type("archivo.xyz") == "application/octet-stream"

    def test_mayusculas(self):
        from scripts.accutab_mail_ingest import _content_type
        assert _content_type("DATOS.CSV") == "text/csv"
