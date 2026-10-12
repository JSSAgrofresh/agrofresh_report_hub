"""
Informes que ya estaban en Report antes de la migración 0055: se les deduce el servicio (Actimist, Ecofog,
RYD) de lo que quedó guardado, para que Report deje de mostrarlos mientras no se enciendan en Funciones.
"""
import pytest

from app.clasificar_servicio import clasificar, servicio_de_tipo
from tests.utiles_bd import hay_base


def test_el_tipo_de_aplicacion_se_reconoce_como_servicio():
    assert servicio_de_tipo("Actimist") == "actimist"
    assert servicio_de_tipo("FOGGER") == "actimist"          # Quiteca: FOGGER y ACTIMIST son el mismo tratamiento
    assert servicio_de_tipo(" ecofog ") == "ecofog"
    assert servicio_de_tipo("RYD") == "ryd"
    assert servicio_de_tipo("Línea de proceso") == "" and servicio_de_tipo(None) == "" and servicio_de_tipo("Agua") == ""


def test_manda_la_solicitud_de_toma_de_muestras_y_despues_los_productos():
    assert clasificar("RYD", ["Línea de proceso"], "Cromatografía") == ("ryd", "solicitud")
    assert clasificar("Línea de proceso", ["Ecofog"], None) == ("", "solicitud")      # la solicitud dice Línea: se respeta
    assert clasificar(None, ["Ecofog", "Ecofog", "RYD"], "Cromatografía") == ("ecofog", "productos")
    assert clasificar("", ["Línea de proceso", "Línea de proceso"], "Actimist") == ("", "productos")
    assert clasificar(None, [], "Actimist") == ("actimist", "tipo_servicio")
    assert clasificar(None, [], "Linea de Proceso") == ("", "sin_dato")


pytestmark_bd = pytest.mark.skipif(not hay_base("solicitud"), reason="sin Postgres con el esquema aplicado")


@pytestmark_bd
def test_clasifica_lo_viejo_sin_pisar_lo_ya_marcado_ni_tocar_la_linea_de_proceso():
    from app.clasificar_servicio import clasificar_todas
    from app.db import conexion, cursor_dict

    def crear(cur, nro, referencia=None, tipo_servicio="Cromatografía", servicio=None, tipos=()):
        cur.execute("INSERT INTO solicitud (nro_solicitud, laboratorio, referencia, tipo_servicio, servicio)"
                    " VALUES (%s, 'Agrofresh', %s, %s, %s) RETURNING id", (nro, referencia, tipo_servicio, servicio))
        sid = cur.fetchone()["id"]
        for i, t in enumerate(tipos):
            cur.execute("INSERT INTO producto_aplicado (solicitud_id, analito_raw, tipo_aplicacion) VALUES (%s, %s, %s)",
                        (sid, f"A{i}", t))
        return sid

    with conexion() as conn, cursor_dict(conn) as cur:
        cur.execute("INSERT INTO solicitud_archivo (archivo, numero_solicitud, laboratorio, datos) VALUES"
                    " ('OT-ZZCL1.xlsx', 'OT-ZZCL1', 'AGROFRESH', %s::jsonb) ON CONFLICT (archivo) DO NOTHING",
                    ('{"campos_laboratorio": {"Tipo Aplicación": "RYD"}}',))
        con_toma = crear(cur, "ZZ-CL-1", referencia="OT-ZZCL1", tipos=("Línea de proceso",))
        por_producto = crear(cur, "ZZ-CL-2", tipos=("Ecofog", "Ecofog"))
        linea = crear(cur, "ZZ-CL-3", tipos=("Línea de proceso",))
        sin_dato = crear(cur, "ZZ-CL-4")
        marcada = crear(cur, "ZZ-CL-5", servicio="actimist", tipos=("RYD",))
    try:
        with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
            mia = clasificar_todas(cur, aplicar=False)
            assert con_toma in mia["ids"]["ryd"] and por_producto in mia["ids"]["ecofog"]
            assert linea not in sum(mia["ids"].values(), []) and sin_dato not in sum(mia["ids"].values(), [])
            assert marcada not in sum(mia["ids"].values(), [])
        with conexion() as conn, cursor_dict(conn) as cur:
            assert clasificar_todas(cur, aplicar=True)["escritos"] >= 2
        with conexion(escribir=False) as conn, cursor_dict(conn) as cur:
            cur.execute("SELECT id, servicio FROM solicitud WHERE nro_solicitud LIKE 'ZZ-CL-%'")
            quedo = {f["id"]: f["servicio"] for f in cur.fetchall()}
        assert quedo[con_toma] == "ryd" and quedo[por_producto] == "ecofog"
        assert quedo[linea] is None and quedo[sin_dato] is None and quedo[marcada] == "actimist"
    finally:
        with conexion() as conn, cursor_dict(conn) as cur:
            cur.execute("DELETE FROM solicitud WHERE nro_solicitud LIKE 'ZZ-CL-%'")
            cur.execute("DELETE FROM solicitud_archivo WHERE archivo = 'OT-ZZCL1.xlsx'")
