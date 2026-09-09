"""
El día de verificaciones, guardado.

Necesita Postgres con la migración 0026 aplicada; sin base se salta entero.
Lo que se prueba acá es lo que el cálculo puro no puede: que guardar dos veces
el mismo día no cree dos, que borrar una pesada la deje borrada, y que el
veredicto del día que queda en la base sea el que corresponde.
"""
import pytest

from tests.utiles_bd import hay_base

pytestmark = pytest.mark.skipif(
    not hay_base("verif_registro"), reason="sin Postgres con la migración 0026 aplicada"
)

from datetime import date  # noqa: E402

from fastapi import HTTPException  # noqa: E402

from app import verificaciones as v  # noqa: E402
from app.auth import Usuario  # noqa: E402
from app.db import conexion, cursor_dict  # noqa: E402

ANALISTA = Usuario(id="1", email="paz@agrofresh.com", nombre="Paz Salazar", tipoAcceso="admin_general")
FECHA = date(2020, 1, 15)  # una fecha vieja, para no pisar datos reales


@pytest.fixture
def limpio():
    def borrar():
        with conexion() as conn, cursor_dict(conn) as cur:
            cur.execute("DELETE FROM verif_registro WHERE fecha = %s", [FECHA])

    borrar()
    yield
    borrar()


@pytest.fixture
def config():
    return v.obtener_config()


def _dia(config, **cambios) -> v.RegistroIn:
    """Un día completo y correcto, sobre los catálogos que haya sembrados."""
    base = dict(
        temperatura_agua=20,
        fugas_visibles="No",
        revisado_por="Romina Garrido",
        micropipetas=[
            v.MicropipetaMedicionIn(
                micropipeta_id=m.id,
                analista="Paz Salazar",
                peso_1=m.volumen_nominal,
                peso_2=m.volumen_nominal,
                peso_3=m.volumen_nominal,
            )
            for m in config.micropipetas
        ],
        balanza=[
            v.BalanzaMedicionIn(
                pesa_id=p.id,
                analista="Paz Salazar",
                lectura_1=p.valor_nominal,
                lectura_2=p.valor_nominal,
                lectura_3=p.valor_nominal,
            )
            for p in config.pesas
        ],
        temperaturas=[
            v.TemperaturaMedicionIn(punto_id=p.id, analista="Paz Salazar", lectura=(p.minimo + p.maximo) / 2)
            for p in config.puntos_temperatura
        ],
        gases=[
            v.GasMedicionIn(
                gas_id=g.id, analista="Paz Salazar", codigo_cilindro="C-1",
                presion_contenido=500, presion_trabajo=100,
            )
            for g in config.gases
        ],
        inyector=v.InyectorIn(analista="Paz Salazar", limpieza_aguja="Sí", aguja_danada="No", aguja_reemplazada="No", cambio_septa="No"),
        detector=v.DetectorIn(analista="Paz Salazar", voltaje_perla=0.86, metodo_correcto="Sí", output_detector=20.3),
    )
    base.update(cambios)
    return v.RegistroIn(**base)


def guardar(cuerpo) -> v.Registro:
    return v.guardar_registro(FECHA, cuerpo, usuario=ANALISTA)


# --- Guardar y leer ---------------------------------------------------------


def test_un_dia_completo_y_correcto_queda_aceptable(limpio, config):
    registro = guardar(_dia(config))
    assert registro.resultado == v.ACEPTABLE
    assert set(registro.resultados_seccion) == set(v.SECCIONES)
    assert all(r == v.ACEPTABLE for r in registro.resultados_seccion.values())


def test_el_factor_z_del_dia_queda_guardado(limpio, config):
    """El Z que se usó ese día es parte del registro, aunque mañana alguien
    corrija la tabla de referencia."""
    registro = guardar(_dia(config, temperatura_agua=25))
    assert registro.factor_z == 1.0037
    with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
        cur.execute("SELECT factor_z FROM verif_registro WHERE fecha = %s", [FECHA])
        assert float(cur.fetchone()["factor_z"]) == 1.0037


def test_lo_guardado_se_puede_volver_a_leer(limpio, config):
    guardar(_dia(config))
    leido = v.obtener_registro(FECHA)
    assert leido.resultado == v.ACEPTABLE
    assert len(leido.micropipetas) == len(config.micropipetas)
    assert leido.revisado_por == "Romina Garrido"


def test_un_dia_sin_registrar_da_404(limpio):
    with pytest.raises(HTTPException) as e:
        v.obtener_registro(FECHA)
    assert e.value.status_code == 404


# --- Un día, un registro ----------------------------------------------------


def test_guardar_dos_veces_el_mismo_dia_no_crea_dos(limpio, config):
    """En el Excel la macro apendaba: era fácil terminar con el mismo día dos
    veces, con datos distintos."""
    guardar(_dia(config))
    guardar(_dia(config, temperatura_agua=22))
    with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
        cur.execute("SELECT COUNT(*) AS n FROM verif_registro WHERE fecha = %s", [FECHA])
        assert cur.fetchone()["n"] == 1
    assert v.obtener_registro(FECHA).temperatura_agua == 22


def test_borrar_una_medicion_y_guardar_la_deja_borrada(limpio, config):
    """El formulario manda siempre todo lo que tiene en pantalla: si se borró
    una pesada, guardar tiene que dejarla borrada y no conservar la anterior."""
    guardar(_dia(config))
    guardar(_dia(config, micropipetas=[]))
    assert v.obtener_registro(FECHA).micropipetas == []


def test_una_fila_vacia_no_se_guarda(limpio, config):
    """El formulario dibuja una fila por equipo aunque no se mida ninguno; esas
    filas en blanco no tienen por qué llegar al histórico."""
    vacias = [v.MicropipetaMedicionIn(micropipeta_id=m.id) for m in config.micropipetas]
    registro = guardar(_dia(config, micropipetas=vacias))
    assert registro.micropipetas == []
    assert registro.resultados_seccion["micropipetas"] == v.SIN_MEDIR


# --- Veredictos -------------------------------------------------------------


def test_una_micropipeta_fuera_de_tolerancia_tumba_el_dia(limpio, config):
    equipo = config.micropipetas[0]
    fuera = v.MicropipetaMedicionIn(
        micropipeta_id=equipo.id,
        peso_1=equipo.volumen_nominal * 0.5,
        peso_2=equipo.volumen_nominal * 0.5,
        peso_3=equipo.volumen_nominal * 0.5,
    )
    registro = guardar(_dia(config, micropipetas=[fuera]))
    assert registro.micropipetas[0].resultado == v.NO_ACEPTABLE
    assert registro.resultados_seccion["micropipetas"] == v.NO_ACEPTABLE
    assert registro.resultado == v.NO_ACEPTABLE


def test_una_fuga_visible_tumba_la_seccion_de_gases(limpio, config):
    """La pregunta de fugas es una sola para el día, pero pesa igual que la
    presión de cada cilindro."""
    registro = guardar(_dia(config, fugas_visibles="Sí"))
    assert registro.resultado_fugas == v.NO_ACEPTABLE
    assert registro.resultados_seccion["gases"] == v.NO_ACEPTABLE
    assert registro.resultado == v.NO_ACEPTABLE


def test_un_dia_en_blanco_dice_sin_datos(limpio):
    registro = guardar(v.RegistroIn())
    assert registro.resultado == v.SIN_DATOS


def test_el_resultado_tambien_queda_escrito_en_la_base(limpio, config):
    """Se recalcula al leer, pero además se guarda: quien mire la base
    directamente tiene que ver el veredicto sin correr el cálculo."""
    guardar(_dia(config, fugas_visibles="Sí"))
    with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
        cur.execute("SELECT resultado FROM verif_registro WHERE fecha = %s", [FECHA])
        assert cur.fetchone()["resultado"] == v.NO_ACEPTABLE


def test_cambiar_un_criterio_se_refleja_en_lo_ya_guardado(limpio, config):
    """Los resultados se recalculan al leer justamente para esto: apretar una
    tolerancia tiene que revisar la historia, no solo lo que venga."""
    equipo = config.micropipetas[0]
    medicion = v.MicropipetaMedicionIn(
        micropipeta_id=equipo.id,
        peso_1=equipo.volumen_nominal + equipo.tolerancia / 2,
        peso_2=equipo.volumen_nominal + equipo.tolerancia / 2,
        peso_3=equipo.volumen_nominal + equipo.tolerancia / 2,
    )
    # Z a 20 °C es 1.0026, así que el volumen queda un poco por sobre el peso;
    # con la tolerancia original entra, con una diez veces menor no.
    assert guardar(_dia(config, micropipetas=[medicion])).micropipetas[0].resultado == v.ACEPTABLE

    with conexion() as conn, cursor_dict(conn) as cur:
        cur.execute("UPDATE verif_micropipeta SET tolerancia = %s WHERE id = %s", [0.001, equipo.id])
    try:
        assert v.obtener_registro(FECHA).micropipetas[0].resultado == v.NO_ACEPTABLE
    finally:
        with conexion() as conn, cursor_dict(conn) as cur:
            cur.execute(
                "UPDATE verif_micropipeta SET tolerancia = %s WHERE id = %s",
                [equipo.tolerancia, equipo.id],
            )


# --- Listado y borrado ------------------------------------------------------


def test_el_dia_aparece_en_el_resumen(limpio, config):
    guardar(_dia(config))
    fila = next(r for r in v.listar_registros(desde=str(FECHA), hasta=str(FECHA)) if r.fecha == FECHA)
    assert fila.resultado == v.ACEPTABLE
    assert fila.balanza == v.ACEPTABLE


def test_borrar_el_dia_se_lleva_sus_mediciones(limpio, config):
    registro_id = None
    guardar(_dia(config))
    with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
        cur.execute("SELECT id FROM verif_registro WHERE fecha = %s", [FECHA])
        registro_id = cur.fetchone()["id"]

    v.eliminar_registro(FECHA, _=ANALISTA)

    with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
        for tabla in ("verif_micropipeta_medicion", "verif_balanza_medicion", "verif_inyector", "verif_detector"):
            cur.execute(f"SELECT COUNT(*) AS n FROM {tabla} WHERE registro_id = %s", [registro_id])
            assert cur.fetchone()["n"] == 0, f"quedaron filas huérfanas en {tabla}"


def test_borrar_un_dia_que_no_existe_da_404(limpio):
    with pytest.raises(HTTPException) as e:
        v.eliminar_registro(FECHA, _=ANALISTA)
    assert e.value.status_code == 404


# --- Exportación ------------------------------------------------------------


def test_el_excel_del_dia_se_genera(limpio, config):
    from app.verificaciones_excel import libro_del_dia

    wb = libro_del_dia(guardar(_dia(config)))
    hoja = wb["Verificación diaria"]
    textos = [c.value for fila in hoja.iter_rows() for c in fila if isinstance(c.value, str)]
    assert any("REG-03" in t for t in textos)
    assert any("MICROPIPETAS" in t for t in textos)


def test_el_libro_historico_trae_una_hoja_por_seccion(limpio, config):
    from app.verificaciones_excel import libro_historico

    wb = libro_historico([guardar(_dia(config))])
    assert wb.sheetnames == [
        "Resumen diario", "Micropipetas", "Balanza", "Temperatura", "Gases", "Inyector", "Detector y método"
    ]
