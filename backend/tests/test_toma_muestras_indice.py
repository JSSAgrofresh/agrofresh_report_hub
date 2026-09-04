"""
Crear, listar y borrar solicitudes contra el índice.

`test_indice_solicitudes.py` prueba el índice por dentro. Esto prueba lo que
de verdad importa: que el módulo de Toma de muestras siga haciendo lo mismo
que antes ahora que lee de la base en vez de abrir todos los archivos.

Lo más delicado es la ida y vuelta por el jsonb. Si el índice perdiera un
campo, el listado mostraría solicitudes incompletas y nadie se daría cuenta
hasta que faltara un analito en un informe. Hay una prueba que compara,
campo por campo, lo que devuelve el índice contra lo que devuelve el archivo.

Necesita Postgres con el esquema aplicado. Sin base se salta entera.
"""
import pytest
from fastapi import HTTPException

from tests.utiles_bd import hay_base

pytestmark = pytest.mark.skipif(
    not hay_base("solicitud_archivo"), reason="sin Postgres con el esquema aplicado"
)

from app import config, indice_solicitudes as indice, toma_muestras as tm  # noqa: E402
from app.auth import Usuario  # noqa: E402
from app.db import conexion, cursor_dict  # noqa: E402

# `crear_solicitud` ahora exige la sesión que está creando la solicitud -para
# poder forzar `email_solicitante` cuando es un muestreador-. Estas pruebas no
# cubren esa regla (tiene la suya propia en test_acceso_solicitudes.py), así
# que usan una cuenta interna cualquiera que no le tuerza nada al cuerpo.
ADMIN = Usuario(id="1", email="admin@agrofresh.com", nombre="Admin", tipoAcceso="admin_general")


@pytest.fixture
def limpio(tmp_path, monkeypatch):
    """Un almacenamiento vacío en disco y un índice vacío. Sin R2: en las
    pruebas no hay credenciales, así que `r2.disponible()` es False y todo
    pasa por el disco temporal."""
    monkeypatch.setattr(config, "STORAGE_DIR", str(tmp_path))
    with conexion() as conn, cursor_dict(conn) as cur:
        cur.execute("DELETE FROM solicitud_archivo")
        cur.execute("SELECT setval('folio_solicitud', 1, false)")
    yield
    with conexion() as conn, cursor_dict(conn) as cur:
        cur.execute("DELETE FROM solicitud_archivo")


def cuerpo(**extra):
    datos = dict(
        laboratorio="AGROFRESH", solicitante="Jorge", sold_to="ZZ-TEST Agricom",
        ship_to="ZZ-TEST Planta", especie="Arándano", variedad="Duke",
        generado_por="Jorge", tipo_muestra="Fruta", fecha_muestreo="2026-08-31",
        campos_laboratorio={"FDL ppm": "1"}, analitos_solicitados=["FDL"],
    )
    datos.update(extra)
    return tm.SolicitudIn(**datos)


class TestRedDeSeguridad:
    """Mientras el índice esté vacío -entre actualizar el sistema y correr
    scripts/indexar_solicitudes.py- todo tiene que seguir funcionando como
    antes. Sin esto, actualizar dejaría a todos sin ver sus solicitudes."""

    def test_con_indice_vacio_se_leen_los_archivos(self, limpio):
        assert indice.esta_poblado() is False
        assert tm.leer_todas_las_solicitudes() == []

    def test_con_indice_vacio_el_folio_se_cuenta_sobre_los_archivos(self, limpio):
        assert tm._siguiente_numero() == "OT-0001"


class TestCrear:
    def test_la_solicitud_nueva_queda_indexada_sola(self, limpio):
        """Sin esto habría que correr un script después de cada solicitud."""
        creada = tm.crear_solicitud(cuerpo(), usuario=ADMIN)
        assert creada.numero_solicitud == "OT-0001"
        assert indice.buscar("OT-0001.xlsx") is not None

    def test_los_folios_siguen_siendo_correlativos(self, limpio):
        folios = [tm.crear_solicitud(cuerpo(), usuario=ADMIN).numero_solicitud for _ in range(3)]
        assert folios == ["OT-0001", "OT-0002", "OT-0003"]

    def test_el_indice_dice_lo_mismo_que_el_archivo(self, limpio):
        """La prueba que importa: si el jsonb perdiera un campo por el camino,
        el listado mostraría solicitudes incompletas.

        El índice suma `codigo_muestra` y `recepcion_en`, que no están en el
        archivo: se asignan al recibir la muestra, mucho después de crear la
        solicitud.
        """
        tm.crear_solicitud(cuerpo(), usuario=ADMIN)
        por_indice = dict(tm.leer_todas_las_solicitudes())["OT-0001.xlsx"]
        por_archivo = dict(tm._leer_todas_desde_archivos())["OT-0001.xlsx"]
        assert por_indice == {**por_archivo, "codigo_muestra": None, "recepcion_en": None}

    def test_conserva_los_analitos_solicitados(self, limpio):
        """Es lo que usa Emitir informe para cruzar con el resultado del GC."""
        tm.crear_solicitud(cuerpo(analitos_solicitados=["FDL", "PYR", "IMZ"]), usuario=ADMIN)
        assert indice.buscar("OT-0001.xlsx")["analitos_solicitados"] == ["FDL", "PYR", "IMZ"]


class TestPropiedadDeLaSolicitud:
    """Un muestreador no puede fingir ser otro cambiando `email_solicitante`
    en el request: el backend lo pisa siempre con el correo de la sesión
    autenticada que está creando la solicitud.

    Si esto fallara, cualquier muestreador podría escribir el correo de otro
    en el formulario -o llamando a la API directo- y hacer que la solicitud
    quedara atribuida a esa otra persona."""

    def test_ignora_el_email_solicitante_que_manda_el_cliente(self, limpio):
        usuario_a = Usuario(id="10", email="ana@agrofresh.com", nombre="Ana", tipoAcceso="muestreador")
        creada = tm.crear_solicitud(
            cuerpo(email_solicitante="usuariob@agrofresh.com"), usuario=usuario_a
        )
        assert creada.email_solicitante == "ana@agrofresh.com"

    def test_normaliza_trim_y_minusculas(self, limpio):
        usuario_a = Usuario(id="10", email="  Ana@AgroFresh.com ", nombre="Ana", tipoAcceso="muestreador")
        creada = tm.crear_solicitud(cuerpo(), usuario=usuario_a)
        assert creada.email_solicitante == "ana@agrofresh.com"

    def test_cuenta_interna_conserva_el_flujo_actual(self, limpio):
        """admin_general/admin_area pueden crear a nombre de otra persona
        -ej. cargando algo a pedido de un muestreador-: para esas cuentas no
        se pisa nada."""
        creada = tm.crear_solicitud(cuerpo(email_solicitante="quien-sea@agrofresh.com"), usuario=ADMIN)
        assert creada.email_solicitante == "quien-sea@agrofresh.com"

    def test_usuario_b_no_puede_consultar_la_solicitud_de_a(self, limpio):
        usuario_a = Usuario(id="10", email="ana@agrofresh.com", nombre="Ana", tipoAcceso="muestreador")
        usuario_b = Usuario(id="11", email="beto@agrofresh.com", nombre="Beto", tipoAcceso="muestreador")
        # Aunque Ana haya intentado escribir el correo de Beto, la solicitud
        # quedó atribuida a Ana -y solo Ana puede verla-.
        tm.crear_solicitud(cuerpo(email_solicitante="beto@agrofresh.com"), usuario=usuario_a)

        with pytest.raises(HTTPException) as exc:
            tm.obtener_solicitud("OT-0001.xlsx", usuario=usuario_b)
        assert exc.value.status_code == 403

        # Ana sí puede.
        assert tm.obtener_solicitud("OT-0001.xlsx", usuario=usuario_a).numero_solicitud == "OT-0001"

    def test_usuario_b_no_puede_reenviar_la_solicitud_de_a(self, limpio):
        usuario_a = Usuario(id="10", email="ana@agrofresh.com", nombre="Ana", tipoAcceso="muestreador")
        usuario_b = Usuario(id="11", email="beto@agrofresh.com", nombre="Beto", tipoAcceso="muestreador")
        tm.crear_solicitud(cuerpo(), usuario=usuario_a)

        with pytest.raises(HTTPException) as exc:
            tm.enviar_solicitud_por_correo("OT-0001.xlsx", tm.EnvioSolicitudIn(), usuario=usuario_b)
        assert exc.value.status_code == 403


class TestBccDelMuestreador:
    """El muestreador que creó la solicitud recibe SIEMPRE una copia oculta
    de su propio envío -aparte de los destinatarios normales, sin
    reemplazarlos-, usando el correo que quedó guardado en la solicitud (el
    de su sesión, forzado por `crear_solicitud`)."""

    def _usuario_a(self):
        return Usuario(id="10", email="ana@agrofresh.com", nombre="Ana", tipoAcceso="muestreador")

    def test_recibe_copia_oculta_ademas_de_los_destinatarios(self, limpio, monkeypatch):
        capturado = {}
        monkeypatch.setattr(
            tm.correo, "enviar",
            lambda destinatario, *a, **kw: capturado.update(destinatario=destinatario, **kw),
        )
        usuario_a = self._usuario_a()
        tm.crear_solicitud(cuerpo(), usuario=usuario_a)
        tm.enviar_solicitud_por_correo(
            "OT-0001.xlsx", tm.EnvioSolicitudIn(destinatario="lab@laboratorio.cl"), usuario=usuario_a
        )
        assert capturado["destinatario"] == "lab@laboratorio.cl"
        assert capturado["bcc"] == ["ana@agrofresh.com"]

    def test_no_duplica_si_ya_esta_entre_los_destinatarios(self, limpio, monkeypatch):
        """Si el correo del muestreador ya quedó como destinatario normal
        -mismo correo, distinta mayúscula/espacio-, no se repite en BCC:
        recibiría el mensaje dos veces por nada."""
        capturado = {}
        monkeypatch.setattr(
            tm.correo, "enviar",
            lambda destinatario, *a, **kw: capturado.update(destinatario=destinatario, **kw),
        )
        usuario_a = self._usuario_a()
        tm.crear_solicitud(cuerpo(), usuario=usuario_a)
        tm.enviar_solicitud_por_correo(
            "OT-0001.xlsx", tm.EnvioSolicitudIn(destinatario="  ANA@AgroFresh.com "), usuario=usuario_a
        )
        assert capturado["bcc"] == []


class TestListar:
    def test_listar_no_abre_ningun_archivo(self, limpio, monkeypatch):
        """El punto entero del cambio: el trabajo deja de crecer con la
        cantidad de solicitudes."""
        tm.crear_solicitud(cuerpo(), usuario=ADMIN)
        llamadas = []
        monkeypatch.setattr(tm, "_leer_todas_desde_archivos", lambda: llamadas.append(1) or [])
        assert len(tm.leer_todas_las_solicitudes()) == 1
        assert llamadas == [], "volvió a abrir los archivos"

    def test_filtra_por_laboratorio(self, limpio):
        tm.crear_solicitud(cuerpo(), usuario=ADMIN)
        tm.crear_solicitud(cuerpo(laboratorio="QUITECA"), usuario=ADMIN)
        assert len(tm.leer_solicitudes_de("AGROFRESH")) == 1
        assert len(tm.leer_solicitudes_de("QUITECA")) == 1
        assert tm.leer_solicitudes_de("NO EXISTE") == []


class TestEliminar:
    def test_borrar_la_saca_del_indice(self, limpio):
        """Si quedara anotada, el listado mostraría una solicitud cuyo archivo
        ya no existe, y abrirla daría 404 sin explicación."""
        tm.crear_solicitud(cuerpo(), usuario=ADMIN)
        tm.eliminar_solicitud("OT-0001.xlsx")
        assert indice.buscar("OT-0001.xlsx") is None
        assert tm.leer_todas_las_solicitudes() == []


class TestFolioNoSeRepite:
    def test_aunque_la_secuencia_se_reinicie_a_mano(self, limpio):
        """Puede pasar al restaurar un respaldo viejo. Entregar OT-0001 de
        nuevo pisaría la solicitud que ya lo tiene."""
        tm.crear_solicitud(cuerpo(), usuario=ADMIN)
        tm.crear_solicitud(cuerpo(), usuario=ADMIN)
        with conexion() as conn, cursor_dict(conn) as cur:
            cur.execute("SELECT setval('folio_solicitud', 1, false)")
        assert tm.crear_solicitud(cuerpo(), usuario=ADMIN).numero_solicitud == "OT-0003"
