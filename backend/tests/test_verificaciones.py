"""
Verificaciones diarias (REG-03).

Dos partes bien separadas:

  * El cálculo. Son funciones puras -sin base, sin FastAPI- y por eso corren
    en cualquier parte. Es lo que decide si una micropipeta pasa o no, así
    que es lo que más importa que esté probado.

  * El guardado del día. Necesita Postgres con la migración 0026 aplicada;
    sin base se salta solo.
"""
import pytest

from app.verificaciones import (
    ACEPTABLE,
    NO_ACEPTABLE,
    SIN_DATOS,
    SIN_MEDIR,
    calcular_balanza,
    calcular_detector,
    calcular_fugas,
    calcular_gas,
    calcular_inyector,
    calcular_micropipeta,
    calcular_temperatura,
    factor_z,
    resultado_del_dia,
    resumir,
)

TABLA_Z = {18: 1.0022, 20: 1.0026, 25: 1.0037}


# --- Factor Z ---------------------------------------------------------------


def test_el_factor_z_sale_de_la_tabla():
    assert factor_z(20, TABLA_Z) == 1.0026


def test_la_temperatura_se_redondea_al_grado():
    """La tabla es por grado entero, igual que en el Excel."""
    assert factor_z(19.7, TABLA_Z) == 1.0026


def test_sin_temperatura_no_hay_factor():
    assert factor_z(None, TABLA_Z) is None


def test_una_temperatura_fuera_de_tabla_no_inventa_un_factor():
    """Un Z inventado daría un volumen inventado, y ese volumen es el que
    decide si la micropipeta se acepta."""
    assert factor_z(40, TABLA_Z) is None


# --- Micropipetas -----------------------------------------------------------


def test_micropipeta_dentro_de_tolerancia():
    # 0.9 g × 1000 × 1.0 = 900 µL, desv = 0 ≤ 8 → Aceptable
    r = calcular_micropipeta([0.9, 0.9, 0.9], 1.0, 900, 8)
    assert r["volumen_medio"] == pytest.approx(900, abs=0.001)
    assert r["desviacion"] == pytest.approx(0, abs=0.001)
    assert r["resultado"] == ACEPTABLE


def test_micropipeta_fuera_de_tolerancia():
    # 0.880 g × 1000 × 1.0 = 880 µL, desv = 20 > 8 → No aceptable
    r = calcular_micropipeta([0.88, 0.88, 0.88], 1.0, 900, 8)
    assert r["resultado"] == NO_ACEPTABLE
    assert r["desviacion"] == pytest.approx(20, abs=0.001)


def test_micropipeta_justo_en_el_borde_es_aceptable():
    """El criterio del laboratorio es «± 8 µL», y ± incluye el 8."""
    # 0.892 g × 1000 × 1.0 = 892 µL, desv = 8 = tolerancia → Aceptable
    r = calcular_micropipeta([0.892, 0.892, 0.892], 1.0, 900, 8)
    assert r["resultado"] == ACEPTABLE


def test_micropipeta_aplica_el_factor_z():
    """0.890 g a 25 °C: 0.890 × 1000 × 1.0037 = 893.293 µL.
    Sin corregir por Z sería 890 µL → rechazada por 10 µL que no existen."""
    r = calcular_micropipeta([0.890, 0.890, 0.890], 1.0037, 900, 8)
    assert r["volumen_medio"] == pytest.approx(893.293, abs=0.01)
    assert r["resultado"] == ACEPTABLE


def test_micropipeta_con_menos_de_tres_pesadas_no_concluye():
    r = calcular_micropipeta([0.9, 0.9, None], 1.0, 900, 8)
    assert r["resultado"] == SIN_MEDIR
    assert r["volumen_medio"] is None


def test_micropipeta_sin_factor_z_no_concluye():
    """Si la temperatura del agua quedó fuera de la tabla no hay volumen que
    comparar, y eso NO es un rechazo: es un dato que falta."""
    r = calcular_micropipeta([0.9, 0.9, 0.9], None, 900, 8)
    assert r["resultado"] == SIN_MEDIR


def test_micropipeta_informa_el_error_sistematico():
    # 0.909 g × 1000 × 1.0 = 909 µL, error = (909-900)/900 × 100 = 1%
    r = calcular_micropipeta([0.909, 0.909, 0.909], 1.0, 900, 8)
    assert r["error_pct"] == pytest.approx(1.0, abs=0.001)


# --- Balanza ----------------------------------------------------------------


def test_balanza_dentro_de_tolerancia():
    r = calcular_balanza([0.1, 0.1, 0.10001], 100, 0.03)
    assert r["resultado"] == ACEPTABLE
    assert r["promedio"] == pytest.approx(100.0033)


def test_balanza_fuera_de_tolerancia():
    r = calcular_balanza([0.1001, 0.1001, 0.1001], 100, 0.03)
    assert r["resultado"] == NO_ACEPTABLE
    assert r["desviacion"] == pytest.approx(0.1)


def test_balanza_con_menos_de_tres_lecturas_no_concluye():
    assert calcular_balanza([0.1, None, None], 100, 0.03)["resultado"] == SIN_MEDIR


# --- Temperatura ------------------------------------------------------------


@pytest.mark.parametrize(
    "lectura, esperado",
    [(20, ACEPTABLE), (15, ACEPTABLE), (25, ACEPTABLE), (14.9, NO_ACEPTABLE), (26, NO_ACEPTABLE)],
)
def test_temperatura_contra_su_rango(lectura, esperado):
    assert calcular_temperatura(lectura, 15, 25) == esperado


def test_temperatura_bajo_cero_del_congelador():
    """El congelador va de -20 a -18: con rangos negativos es fácil escribir
    la comparación al revés."""
    assert calcular_temperatura(-19, -20, -18) == ACEPTABLE
    assert calcular_temperatura(-17, -20, -18) == NO_ACEPTABLE


def test_temperatura_sin_lectura_no_concluye():
    assert calcular_temperatura(None, 15, 25) == SIN_MEDIR


# --- Gases ------------------------------------------------------------------


def test_gas_dentro_de_criterio():
    assert calcular_gas(500, 100, 200, 80, 120) == ACEPTABLE


def test_gas_con_poco_contenido():
    assert calcular_gas(150, 100, 200, 80, 120) == NO_ACEPTABLE


def test_gas_con_presion_de_trabajo_alta():
    assert calcular_gas(500, 130, 200, 80, 120) == NO_ACEPTABLE


def test_gas_a_medio_medir_no_concluye():
    """Media medición no alcanza para aprobar un cilindro."""
    assert calcular_gas(500, None, 200, 80, 120) == SIN_MEDIR
    assert calcular_gas(None, None, 200, 80, 120) == SIN_MEDIR


def test_fugas():
    assert calcular_fugas("No") == ACEPTABLE
    assert calcular_fugas("Sí") == NO_ACEPTABLE
    assert calcular_fugas("") == SIN_MEDIR


# --- Inyector ---------------------------------------------------------------


def test_inyector_aguja_sana_y_limpia():
    assert calcular_inyector("Sí", "No", "No") == ACEPTABLE


def test_inyector_aguja_danada_pero_reemplazada():
    assert calcular_inyector("Sí", "Sí", "Sí") == ACEPTABLE


def test_inyector_aguja_danada_sin_reemplazar():
    assert calcular_inyector("Sí", "Sí", "No") == NO_ACEPTABLE


def test_inyector_sin_limpiar():
    assert calcular_inyector("No", "No", "No") == NO_ACEPTABLE


def test_inyector_sin_responder_no_concluye():
    assert calcular_inyector("", "", "") == SIN_MEDIR


# --- Detector ---------------------------------------------------------------


def test_detector_todo_en_rango():
    r = calcular_detector(0.86, "Sí", 20.3, 0, 1, 19, 22)
    assert r["resultado"] == ACEPTABLE


def test_detector_con_output_fuera_de_rango():
    r = calcular_detector(0.86, "Sí", 25, 0, 1, 19, 22)
    assert r["resultado_output"] == NO_ACEPTABLE
    assert r["resultado"] == NO_ACEPTABLE


def test_detector_con_metodo_equivocado():
    r = calcular_detector(0.86, "No", 20.3, 0, 1, 19, 22)
    assert r["resultado_metodo"] == NO_ACEPTABLE
    assert r["resultado"] == NO_ACEPTABLE


def test_detector_vacio_no_concluye():
    assert calcular_detector(None, "", None, 0, 1, 19, 22)["resultado"] == SIN_MEDIR


# --- Resumen ----------------------------------------------------------------


def test_un_no_aceptable_manda_sobre_todo():
    assert resumir([ACEPTABLE, ACEPTABLE, NO_ACEPTABLE]) == NO_ACEPTABLE


def test_sin_mediciones_la_seccion_no_queda_aprobada_por_omision():
    assert resumir([SIN_MEDIR, SIN_MEDIR]) == SIN_MEDIR


def test_el_dia_sin_nada_medido_dice_sin_datos():
    assert resultado_del_dia([SIN_MEDIR] * 6) == SIN_DATOS


def test_el_dia_con_una_seccion_mala_es_no_aceptable():
    assert resultado_del_dia([ACEPTABLE, SIN_MEDIR, NO_ACEPTABLE]) == NO_ACEPTABLE


def test_el_dia_a_medio_llenar_pero_todo_bien_es_aceptable():
    assert resultado_del_dia([ACEPTABLE, SIN_MEDIR, SIN_MEDIR]) == ACEPTABLE
