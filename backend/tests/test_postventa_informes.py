"""Post Venta: el informe PDF se emite solo, ordenado por cliente y fecha, y se
pueden borrar varias cargas de una vez."""
import os

import pytest
from fastapi import HTTPException

from app import accutab_informe, config, postventa

FILAS = [
    {"ts": i, "fecha": "2026-10-01", "hora": f"10:{i:02d}", "ph": 7.0 + i / 100, "mv": 650 + i, "temp": 20, "archivo": "a.csv"}
    for i in range(30)
]
EST = {"n": 30, "ph": {"min": 7, "max": 7.3, "prom": 7.15, "desv": 0.09}, "mv": {"min": 650, "max": 680, "prom": 665, "desv": 9}}


@pytest.fixture
def storage(monkeypatch, tmp_path):
    monkeypatch.setattr(config, "STORAGE_DIR", str(tmp_path))
    return tmp_path


def _guardar(**extra):
    return postventa.guardar_registro(postventa.RegistroIn(
        cliente="DOLE", planta="DOLE LONTUE", ubicacion="Línea 2", filas=FILAS, estadisticas=EST, **extra,
    ))


def test_cliente_desde_asunto_quita_el_contador_del_correo():
    assert accutab_informe.cliente_desde_asunto("AGROFRESH_DEMO (1307)") == "AGROFRESH_DEMO"
    assert accutab_informe.cliente_desde_asunto("Dole Lontué") == "Dole Lontue"
    assert accutab_informe.cliente_desde_asunto("") == accutab_informe.SIN_CLIENTE


def test_carpeta_por_cliente_y_fecha():
    assert accutab_informe.carpeta_cliente_fecha("DOLE", "2026-10-06") == "accutab/mail/DOLE/2026-10-06/"


def test_pdf_generado_es_un_pdf():
    pdf = accutab_informe.generar_pdf({"cliente": "DOLE", "filas": FILAS, "estadisticas": EST, "origen": "manual"})
    assert pdf.startswith(b"%PDF")
    # Sin filas tampoco se cae.
    assert accutab_informe.generar_pdf({"filas": [], "estadisticas": None}).startswith(b"%PDF")


def test_guardar_sin_pdf_lo_genera_solo(storage):
    r = _guardar()
    assert r["resumen"]["tiene_pdf"] is True and r["resumen"]["ubicacion"] == "Línea 2"
    assert (storage / "Accutab" / r["carpeta"] / "informe.pdf").read_bytes().startswith(b"%PDF")


def test_guardar_archiva_en_r2_por_cliente_y_fecha_y_al_borrar_lo_quita(storage, monkeypatch):
    subidos, borrados = [], []
    monkeypatch.setattr("app.r2.disponible", lambda: True)
    monkeypatch.setattr("app.r2.subir", lambda k, d, ct="": subidos.append(k))
    monkeypatch.setattr("app.r2.eliminar", lambda k: borrados.append(k))
    r = _guardar()
    fecha = r["carpeta"][:10]
    assert subidos == [f"accutab/mail/DOLE/{fecha}/Informe {r['carpeta'][11:]}.pdf"]
    postventa.eliminar_registro(r["carpeta"])
    assert borrados == subidos


def test_eliminar_varios_borra_las_que_existen_y_avisa_de_las_otras(storage):
    a, b = _guardar()["carpeta"], None
    os.makedirs(storage / "Accutab" / "2000-01-01_00-00-00")  # existe pero sin registro: igual es borrable
    r = postventa.eliminar_varios(postventa.EliminarVariosIn(carpetas=[a, "2020-01-01_00-00-00", "../x"]))
    assert r["borradas"] == [a] and r["fallidas"] == ["2020-01-01_00-00-00", "../x"]
    assert [c["carpeta"] for c in postventa.listar_registros()] == []


def test_eliminar_varios_sin_nada_es_400(storage):
    with pytest.raises(HTTPException) as e:
        postventa.eliminar_varios(postventa.EliminarVariosIn(carpetas=[]))
    assert e.value.status_code == 400


def test_generar_informe_de_una_carga_ya_guardada(storage):
    r = _guardar()
    os.remove(storage / "Accutab" / r["carpeta"] / "informe.pdf")
    assert postventa.generar_informe(r["carpeta"]) == {"ok": True, "tiene_pdf": True}
    assert (storage / "Accutab" / r["carpeta"] / "informe.pdf").read_bytes().startswith(b"%PDF")


# ── Portal de cliente ───────────────────────────────────────────────────

from app.auth import Usuario


def _cuenta(tipo="cliente", cliente="Dole", planta=None):
    return Usuario(id="1", email="x@y.cl", nombre="X", tipoAcceso=tipo, clienteNombre=cliente, plantaNombre=planta)


def test_cliente_solo_ve_sus_informes_con_pdf(storage):
    a = _guardar()["carpeta"]
    otro = postventa.guardar_registro(postventa.RegistroIn(cliente="AGRICOM", planta="X", filas=FILAS, estadisticas=EST))["carpeta"]
    lista = postventa.informes_del_cliente(cliente="AGRICOM", planta=None, usuario=_cuenta(cliente="dole"))
    assert [r["carpeta"] for r in lista] == [a]  # lo pedido se descarta: manda su cuenta; sin tildes ni mayúsculas
    with pytest.raises(HTTPException) as e:
        postventa.pdf_del_cliente(otro, _cuenta(cliente="Dole"))
    assert e.value.status_code == 404
    assert postventa.pdf_del_cliente(a, _cuenta(cliente="Dole")).path.endswith("informe.pdf")


def test_cuenta_de_sucursal_solo_ve_su_ship_to(storage):
    _guardar()  # planta DOLE LONTUE
    assert postventa.informes_del_cliente(None, None, _cuenta(cliente="DOLE", planta="Dole Lontué")) != []
    assert postventa.informes_del_cliente(None, None, _cuenta(cliente="DOLE", planta="Dole Molina")) == []


def test_cliente_sin_cliente_asignado_no_ve_nada(storage):
    _guardar()
    assert postventa.informes_del_cliente(None, None, _cuenta(cliente=None)) == []


def test_las_cargas_del_correo_se_reconocen_por_el_asunto(storage):
    d = storage / "Accutab" / "2026-10-01_10-00-00"
    d.mkdir(parents=True)
    (d / "informe.pdf").write_bytes(b"%PDF")
    (d / "registro.json").write_text('{"origen":"email","equipo":"AGROFRESH_DEMO (12)","filas":[{}],"tiene_pdf":true}')
    r = postventa.informes_del_cliente(None, None, _cuenta(cliente="Agrofresh Demo"))
    assert [x["cliente"] for x in r] == ["AGROFRESH_DEMO"]
