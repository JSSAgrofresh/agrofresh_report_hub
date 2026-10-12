"""
Tests unitarios para accutab_mail_ingest.py.
No requieren conexion a Gmail ni a R2.
"""
import io
import re
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


# ---------------------------------------------------------------------------
# Un correo no se sube dos veces (bug: Gmail no lo sacaba de PENDIENTE y cada
# corrida volvia a subir todos: "AGROFRESH_DEMO (582)", "(583)"...)
# ---------------------------------------------------------------------------

from email.message import EmailMessage as _EmailMessage


def _correo(message_id: str = "<demo-1@accutab>") -> bytes:
    m = _EmailMessage()
    m["Subject"] = "AGROFRESH_DEMO"
    m["Message-ID"] = message_id
    m.set_content("datos")
    m.add_attachment(b"Date,Time,pH,ORP\n2026-10-01,10:00,7.1,650\n",
                     maintype="text", subtype="csv", filename="datos.csv")
    return m.as_bytes()


class _GmailFalso:
    """IMAP minimo de Gmail sobre la carpeta ACCUTAB_PENDIENTE. Como el Gmail
    real, ignora `-X-GM-LABELS` sobre la etiqueta de la carpeta abierta: el
    correo solo sale con \\Deleted + EXPUNGE."""

    def __init__(self, correos: dict[bytes, bytes]):
        self.pendientes = dict(correos)
        self.borrados: set[bytes] = set()
        self.etiquetas: dict[bytes, set[str]] = {u: set() for u in correos}

    def uid(self, cmd, *args):
        if cmd == "FETCH":
            return "OK", [(b"x", self.pendientes[args[0]])]
        if cmd == "STORE":
            uid, op, valor = args
            if op == "+X-GM-LABELS":
                self.etiquetas[uid].add(valor.strip('()"'))
            elif op == "+FLAGS" and "Deleted" in valor:
                self.borrados.add(uid)
            return "OK", [b""]
        if cmd == "SEARCH":
            if args[1] == "ALL":
                return "OK", [b" ".join(self.pendientes)]
            uid = args[1].split()[1].encode()
            return "OK", [uid if uid in self.pendientes else b""]
        raise AssertionError(cmd)

    def expunge(self):
        for u in self.borrados:
            self.pendientes.pop(u, None)
        self.borrados.clear()
        return "OK", [b""]


@pytest.fixture
def entorno(monkeypatch, tmp_path):
    from scripts import accutab_mail_ingest as mod
    subidos: list[str] = []
    r2_json: dict[str, object] = {}
    monkeypatch.setattr(mod._r2, "disponible", lambda: True)
    monkeypatch.setattr(mod._r2, "subir", lambda k, d, ct="": subidos.append(k))
    monkeypatch.setattr(mod._r2, "leer_json", lambda k, d: r2_json.get(k, d))
    monkeypatch.setattr(mod._r2, "escribir_json", lambda k, d: r2_json.__setitem__(k, json.loads(json.dumps(d))))
    monkeypatch.setattr(mod.config, "STORAGE_DIR", str(tmp_path))
    return mod, subidos, r2_json


import json  # noqa: E402


class TestNoReprocesa:
    def test_procesa_y_saca_de_pendientes(self, entorno):
        mod, subidos, r2_json = entorno
        gmail = _GmailFalso({b"1": _correo()})
        r = mod._procesar_email(gmail, b"1", set(), mod._leer_procesados())
        assert r["ok"] and not r["repetido"] and r["reporte"] is True
        assert len(subidos) == 2  # los datos del equipo y el informe PDF, ordenados por cliente y fecha
        datos, informe = sorted(subidos, key=lambda k: k.endswith(".pdf"))
        assert re.fullmatch(r"accutab/mail/AGROFRESH_DEMO/\d{4}-\d{2}-\d{2}/Datos \d{2}-\d{2}-\d{2}/datos\.csv", datos)
        assert re.fullmatch(r"accutab/mail/AGROFRESH_DEMO/\d{4}-\d{2}-\d{2}/Informe \d{2}-\d{2}-\d{2}\.pdf", informe)
        assert gmail.pendientes == {}
        assert mod.LABEL_PROCESADO in gmail.etiquetas[b"1"]
        assert "<demo-1@accutab>" in r2_json[mod.R2_REGISTRO_PROCESADOS]

    def test_correo_ya_anotado_no_se_vuelve_a_subir(self, entorno, tmp_path):
        mod, subidos, _ = entorno
        mod._procesar_email(_GmailFalso({b"1": _correo()}), b"1", set(), mod._leer_procesados())
        # Sigue en PENDIENTE (como pasaba con Gmail): la segunda corrida lo ve.
        gmail = _GmailFalso({b"1": _correo()})
        r = mod._procesar_email(gmail, b"1", {"AGROFRESH_DEMO"}, mod._leer_procesados())
        assert r["ok"] and r["repetido"]
        assert len(subidos) == 2  # los de la primera vez, nada nuevo
        assert len(list((tmp_path / "Accutab").iterdir())) == 1  # un solo reporte
        assert gmail.pendientes == {}

    def test_si_falla_la_etiqueta_igual_queda_anotado(self, entorno, monkeypatch):
        mod, subidos, _ = entorno
        gmail = _GmailFalso({b"1": _correo()})
        monkeypatch.setattr(gmail, "expunge", lambda: ("OK", [b""]))  # Gmail no lo saca
        r = mod._procesar_email(gmail, b"1", set(), mod._leer_procesados())
        assert not r["ok"] and "PENDIENTE" in r["error"]
        r2 = mod._procesar_email(_GmailFalso({b"1": _correo()}), b"1", {"AGROFRESH_DEMO"}, mod._leer_procesados())
        assert r2["repetido"] and len(subidos) == 2

    def test_solo_marcar_no_sube_nada(self, entorno, tmp_path):
        mod, subidos, r2_json = entorno
        gmail = _GmailFalso({b"1": _correo("<a@x>"), b"2": _correo("<b@x>")})
        procesados = mod._leer_procesados()
        for uid in (b"1", b"2"):
            assert mod._procesar_email(gmail, uid, set(), procesados, solo_marcar=True)["ok"]
        assert subidos == []
        assert not (tmp_path / "Accutab").exists() or not any((tmp_path / "Accutab").iterdir())
        assert gmail.pendientes == {}
        assert set(r2_json[mod.R2_REGISTRO_PROCESADOS]) == {"<a@x>", "<b@x>"}

    def test_correos_distintos_se_suben_los_dos(self, entorno):
        mod, subidos, _ = entorno
        gmail = _GmailFalso({b"1": _correo("<a@x>"), b"2": _correo("<b@x>")})
        procesados = mod._leer_procesados()
        existentes: set[str] = set()
        for uid in (b"1", b"2"):
            mod._procesar_email(gmail, uid, existentes, procesados)
        assert len([k for k in subidos if k.endswith("datos.csv")]) == 2
        assert len(set(subidos)) == 4  # dos correos, dos informes: nada se pisa
