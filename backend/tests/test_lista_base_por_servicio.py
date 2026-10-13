"""La columna «Lista de Distribución» de las bases en Excel respeta el tipo de servicio:
Línea de proceso, Actimist, Ecofog y RYD (antes RYD, y todo en la BD de Report, caían en Línea de
proceso y mostraban a Claudia)."""
import pytest

from app import columnas_base

CLAUDIA = "CGUERRERO@AGROFRESH.COM"


def _lista(servicio, contactos=None):
    calcular = columnas_base.calculador_listas(contactos if contactos is not None else [])
    return calcular("SOLD TO X", "PLANTA X", "Cereza", servicio)


def test_linea_de_proceso_sin_lista_sigue_con_jorge_y_claudia():
    d = _lista("Línea de proceso")
    assert CLAUDIA in d["lista_para"]
    assert "JORGE.SANDOVAL@AGROFRESH.COM" in d["lista_para"]


@pytest.mark.parametrize("servicio", ["Actimist", "Ecofog", "actimist", "ecofog"])
def test_actimist_y_ecofog_llevan_a_carlos_y_cristian_sin_claudia(servicio):
    d = _lista(servicio)
    assert "CJIMENEZ@AGROFRESH.COM" in d["lista_para"] and "CVALENZUELA@AGROFRESH.COM" in d["lista_para"]
    assert CLAUDIA not in "; ".join(d.values())


@pytest.mark.parametrize("servicio", ["RYD", "ryd", " Ryd "])
def test_ryd_lleva_a_carla_y_fran_en_para_y_jorge_y_report_hub_en_copia_nunca_claudia(servicio):
    d = _lista(servicio)
    assert d["lista_para"] == "CCACERES@AGROFRESH.COM; FGONZALEZ@AGROFRESH.COM"
    assert d["lista_cc"] == "JORGE.SANDOVAL@AGROFRESH.COM; AGROFRESHREPORTHUB@GMAIL.COM"
    assert CLAUDIA not in "; ".join(d.values())


def test_ryd_saca_a_claudia_aunque_este_cargada_en_alguna_lista():
    contactos = [
        {"tipo": "resultado_interno", "email": "cguerrero@agrofresh.com", "activo": True, "tipo_copia": "cc",
         "ship_to": "PLANTA X", "sold_to": "SOLD TO X", "servicio": "ryd"},
    ]
    assert CLAUDIA not in "; ".join(_lista("RYD", contactos).values())


def test_sin_servicio_rige_linea_de_proceso():
    assert _lista(None) == _lista("Línea de proceso") == _lista("Cromatografía")
