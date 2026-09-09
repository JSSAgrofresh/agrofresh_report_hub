"""
La vista de detalle del archivo del GC.

Reproduce lo que hacía un convertidor HTML aparte: pasar el reporte del equipo
a planilla. Se comprueba contra el archivo real de una corrida y contra el
Excel que aquella herramienta generaba, porque el objetivo es que dé lo mismo.
"""
import io
import os

import openpyxl
import pytest

from app import emitir
from app.gc_parser import (
    es_codigo_puro,
    parsear_cabecera_gc,
    parsear_gc_txt,
    parsear_reporte_gc,
    parsear_ubicaciones_gc,
)

ARCHIVO = os.path.join(os.path.dirname(__file__), "datos", "GLPrprtB.txt")

pytestmark = pytest.mark.skipif(
    not os.path.exists(ARCHIVO), reason="falta el reporte de GC de ejemplo"
)


@pytest.fixture(scope="module")
def cabecera():
    return [
        emitir.CampoCabeceraOut(seccion=s, campo=c, valor=v)
        for s, c, v in parsear_cabecera_gc(open(ARCHIVO, "rb").read())
    ]


@pytest.fixture(scope="module")
def ubicaciones():
    return parsear_ubicaciones_gc(open(ARCHIVO, "rb").read())


@pytest.fixture(scope="module")
def reporte():
    return parsear_reporte_gc(open(ARCHIVO, "rb").read())


@pytest.fixture(scope="module")
def muestras(ubicaciones, reporte):
    por_linea = {int(f["Line"]): f for f in reporte.secuencia if f.get("Line", "").isdigit()}
    return [
        emitir.MuestraGCDetalleOut(
            codigo=m.codigo,
            seq_line=m.seq_line,
            fecha_inyeccion=m.fecha_inyeccion,
            es_muestra=es_codigo_puro(m.codigo),
            ubicacion=ubicaciones.get(m.seq_line),
            datos=m.datos,
            secuencia=por_linea.get(m.seq_line, {}),
            totales=m.totales,
            advertencias=m.advertencias,
            recalibrado=m.recalibrado,
            resultados=[
                emitir.ResultadoAnalitoOut(
                    analito=r.analito,
                    codigo=None,
                    area=r.area,
                    amount=r.amount,
                    rettime=r.rettime,
                    tipo=r.tipo,
                    amt_area=r.amt_area,
                    grp=r.grp,
                )
                for r in m.resultados
            ],
        )
        for m in reporte.muestras
    ]


@pytest.fixture(scope="module")
def secciones(reporte):
    """Todo lo que va a las hojas nuevas, tal como lo manda la pantalla."""
    return dict(
        metodo=[emitir.CampoCabeceraOut(seccion=s, campo=c, valor=v) for s, c, v in reporte.metodo],
        auditoria=[emitir.CambioMetodoOut(**a) for a in reporte.auditoria],
        curva=[emitir.FilaCurvaOut(**f) for f in reporte.curva],
        estadistica=[emitir.FilaEstadisticaOut(**f) for f in reporte.estadistica],
        resumen=[emitir.FilaResumenOut(**f) for f in reporte.resumen],
        bitacora=[emitir.EventoBitacoraOut(**e) for e in reporte.bitacora],
    )


def _respuesta(muestras, cabecera=(), **sec):
    return emitir.generar_excel_detalle_gc(
        emitir.DetalleGCIn(muestras=muestras, cabecera=list(cabecera), **sec)
    )


def _libro(muestras, cabecera=(), **sec):
    import asyncio

    resp = _respuesta(muestras, cabecera, **sec)
    trozos: list[bytes] = []

    async def leer():
        async for t in resp.body_iterator:
            trozos.append(t)

    asyncio.run(leer())
    return openpyxl.load_workbook(io.BytesIO(b"".join(trozos)))


class TestParseo:
    def test_lee_la_corrida_completa(self, muestras):
        """53 viales: 13 de cliente y 40 entre curvas, blancos y controles.
        El detalle los muestra todos — la curva de calibración es justamente
        lo que se mira para saber si el equipo estaba midiendo bien."""
        assert len(muestras) == 53
        assert sum(1 for m in muestras if m.es_muestra) == 13

    def test_conserva_el_tiempo_de_retencion(self, muestras):
        """Se descartaba al parsear. Sin él, la hoja de datos completos no
        puede reproducir el reporte del equipo."""
        assert muestras[0].resultados[0].rettime == 7.63

    def test_un_valor_medido_llega_entero(self, muestras):
        vial_1 = next(m for m in muestras if m.codigo == "1")
        tebu = next(r for r in vial_1.resultados if r.analito == "TEBUCONAZOLE")
        assert tebu.area == pytest.approx(1.00441)
        assert tebu.amount == pytest.approx(0.0488688)


class TestUbicaciones:
    """La posición del carrusel. El reporte de resultados solo trae el número
    de línea; sin la ubicación no se puede volver al vial físico."""

    def test_lee_la_ubicacion_de_cada_linea(self, ubicaciones):
        assert len(ubicaciones) == 53
        assert ubicaciones[1] == "1"
        assert ubicaciones[3] == "1"
        assert ubicaciones[5] == "3"

    def test_no_confunde_injection_location_con_la_del_vial(self, ubicaciones):
        """Cada inyección trae además `Injection Location: Back`, que es el
        inyector y no el vial."""
        assert "Back" not in ubicaciones.values()


class TestCabecera:
    """Con qué se midió: instrumento, columna y parámetros de la secuencia.
    Es lo que respalda un resultado si alguien lo cuestiona."""

    def test_lee_los_campos_del_equipo(self, cabecera):
        valores = {c.campo: c.valor for c in cabecera}
        assert valores["Instrument"] == "GC 2"
        assert valores["Column Description"] == "TG-OCP-II"
        assert valores["Operator"] == "SYSTEM"

    def test_junta_los_dos_pares_de_una_misma_linea(self, cabecera):
        """`Model# : 26077-5720   Manufacturer: Thermo` son dos campos en una
        sola línea; leer solo el primero perdía la mitad de la ficha."""
        valores = {c.campo: c.valor for c in cabecera}
        assert valores["Model#"] == "26077-5720"
        assert valores["Manufacturer"] == "Thermo"
        assert valores["Diameter"] == "250.00 µm"
        assert valores["Length"] == "30.0 m"

    def test_no_parte_una_etiqueta_en_la_barra(self, cabecera):
        """`Shutdown Cmd/Macro` se leía como `Macro` a secas."""
        assert {c.campo for c in cabecera} >= {"Shutdown Cmd/Macro"}

    def test_une_un_valor_partido_en_dos_lineas(self, cabecera):
        """La ruta de la secuencia no cabe en una línea y el equipo la corta.
        Separada, el valor quedaba a la mitad."""
        secuencia = next(c.valor for c in cabecera if c.campo == "Sequence")
        assert secuencia.endswith("GCNPD SECUENCIA 28-08-26.S")

    def test_una_ruta_de_windows_no_parece_un_campo(self, cabecera):
        """`C:\\Chem32` tiene dos puntos: si se tomara como etiqueta, el valor
        se cortaría ahí."""
        directorio = next(c.valor for c in cabecera if c.campo == "Data Directory")
        assert directorio.startswith("C:\\Chem32\\1\\Data")

    def test_conserva_el_orden_del_archivo(self, cabecera):
        secciones = [c.seccion for c in cabecera]
        assert secciones == sorted(secciones, key=lambda s: 0 if s == secciones[0] else 1)


class TestExcel:
    def test_trae_una_hoja_por_seccion_del_reporte(self, muestras, cabecera, secciones):
        """El reporte del GC no son solo los resultados: cada sección -método,
        curva, estadística, bitácora- va a su hoja."""
        assert _libro(muestras, cabecera, **secciones).sheetnames == [
            emitir.HOJA_GUIA,
            emitir.HOJA_CABECERA,
            emitir.HOJA_POR_VIAL,
            emitir.HOJA_DETALLE,
            emitir.HOJA_SECUENCIA,
            emitir.HOJA_METODO,
            emitir.HOJA_AUDITORIA,
            emitir.HOJA_CURVA,
            emitir.HOJA_ESTADISTICA,
            emitir.HOJA_RESUMEN,
            emitir.HOJA_BITACORA,
        ]

    def test_solo_se_abren_las_tres_hojas_de_siempre(self, muestras, cabecera, secciones):
        """Once pestañas de golpe no las mira nadie. Las otras ocho son el
        respaldo: quedan ocultas, a un clic derecho de distancia."""
        wb = _libro(muestras, cabecera, **secciones)
        visibles = [h.title for h in wb.worksheets if h.sheet_state == "visible"]
        assert visibles == [emitir.HOJA_GUIA, emitir.HOJA_CABECERA, emitir.HOJA_POR_VIAL]
        assert len(wb.sheetnames) == 11

    def test_la_guia_dice_que_hay_hojas_ocultas(self, muestras, cabecera, secciones):
        """Es la primera hoja que se abre: si no avisa, nadie sabe que el
        respaldo está ahí."""
        ws = _libro(muestras, cabecera, **secciones)[emitir.HOJA_GUIA]
        assert "Mostrar" in ws["C3"].value
        hojas = {f[1]: f[3] for f in ws.iter_rows(min_row=7, values_only=True)}
        assert hojas[emitir.HOJA_POR_VIAL] == "visible"
        assert hojas[emitir.HOJA_BITACORA] == "oculta"
        assert set(hojas) <= set(_libro(muestras, cabecera, **secciones).sheetnames)

    def test_ninguna_tabla_lleva_autofiltro_encima(self, muestras, cabecera, secciones):
        """Una tabla de Excel ya trae su propio filtro. Declarar además un
        `auto_filter` sobre el mismo rango deja el archivo roto: Excel lo abre
        pidiendo repararlo y pierde el formato."""
        wb = _libro(muestras, cabecera, **secciones)
        for hoja in wb.worksheets:
            if hoja.tables:
                assert not hoja.auto_filter.ref, hoja.title

    def test_la_hoja_del_equipo_trae_los_campos(self, muestras, cabecera):
        """El encabezado va en la fila 6: arriba quedan el logo y el título."""
        ws = _libro(muestras, cabecera)[emitir.HOJA_CABECERA]
        assert [c.value for c in ws["B6:D6"][0]] == ["Sección", "Campo", "Valor"]
        filas = {f[2]: f[3] for f in ws.iter_rows(min_row=7, values_only=True)}
        assert filas["Instrument"] == "GC 2"
        assert filas["Operator"] == "SYSTEM"

    def test_la_primera_hoja_lleva_titulo_y_logo(self, muestras, cabecera):
        ws = _libro(muestras, cabecera)[emitir.HOJA_CABECERA]
        assert ws["C2"].value == emitir.TITULO_EXCEL
        assert ws["C2"].font.bold and ws["C2"].font.size == 18
        assert ws.sheet_view.showGridLines is False
        assert len(ws._images) == 1

    def test_la_seccion_no_se_repite_en_cada_fila(self, muestras, cabecera):
        """Repetirla en las 25 filas tapa el dato que se viene a leer."""
        ws = _libro(muestras, cabecera)[emitir.HOJA_CABECERA]
        secciones = [f[1] for f in ws.iter_rows(min_row=7, values_only=True)]
        assert secciones[0] == "Instrumento y columna"
        assert secciones[1] is None
        assert [s for s in secciones if s] == [
            "Instrumento y columna",
            "Parámetros de la secuencia",
        ]

    def test_todas_las_hojas_son_tablas_de_excel(self, muestras, cabecera, secciones):
        """Como tabla se filtra y ordena sin darle formato a mano cada vez.
        Los nombres tienen que ser únicos en todo el libro: dos tablas con el
        mismo nombre rompen el archivo."""
        wb = _libro(muestras, cabecera, **secciones)
        estilos = {
            hoja: [t.tableStyleInfo.name for t in wb[hoja].tables.values()]
            for hoja in wb.sheetnames
        }
        assert estilos[emitir.HOJA_CABECERA] == [emitir.ESTILO_TABLA_CABECERA]
        assert estilos[emitir.HOJA_GUIA] == [emitir.ESTILO_TABLA_CABECERA]
        assert all(estilos[h] for h in wb.sheetnames)
        nombres = [n for hoja in wb.worksheets for n in hoja.tables]
        assert len(nombres) == len(set(nombres))

    def test_el_nombre_sale_del_data_directory(self, muestras, cabecera):
        """La carpeta de la corrida ya identifica la secuencia; el nombre del
        archivo no tiene por qué inventar otro."""
        cd = _respuesta(muestras, cabecera).headers["Content-Disposition"]
        assert "GCNPD_SECUENCIA_280826_" in cd
        assert cd.endswith('.xlsx"')

    def test_sin_data_directory_cae_a_la_fecha(self, muestras):
        cd = _respuesta(muestras).headers["Content-Disposition"]
        assert "Resultados_GC_" in cd

    def test_datos_completos_calza_con_el_convertidor_viejo(self, muestras):
        """371 filas es exactamente lo que sacaba la herramienta anterior con
        este mismo archivo."""
        ws = _libro(muestras)[emitir.HOJA_DETALLE]
        assert ws.max_row - 1 == 371

    def test_por_vial_lleva_ppm_retencion_y_area_juntos(self, muestras):
        """Antes eran dos hojas separadas: leer un vial obligaba a saltar de
        una a otra para comparar su concentración contra su área. El tiempo de
        retención va en el mismo bloque: es lo que confirma que el pico
        integrado es el del compuesto y no el de un vecino."""
        ws = _libro(muestras)[emitir.HOJA_POR_VIAL]
        encabezados = [c.value for c in ws[1]]
        assert encabezados[:4] == [
            "Seq Line", "Ubicación de la Muestra", "Vial", "Tipo",
        ]
        primero = encabezados.index("DIFENILAMINA ppm")
        assert encabezados[primero : primero + 5] == [
            "DIFENILAMINA ppm",
            "DIFENILAMINA tiempo retención (min)",
            "DIFENILAMINA área",
            "DIFENILAMINA tipo de pico",
            "DIFENILAMINA Amt/Area",
        ]
        assert encabezados[primero + 5] == "PYRYMETHANIL ppm"
        assert ws.max_row - 1 == 53

    def test_por_vial_trae_los_campos_con_que_el_equipo_declara_el_vial(self, muestras):
        """Los 12 campos de la tabla de la secuencia, con la etiqueta del
        equipo. `Sample Type` es el que dice qué es el vial: antes se adivinaba
        por el nombre, que es justo lo que falla al cambiar la nomenclatura."""
        ws = _libro(muestras)[emitir.HOJA_POR_VIAL]
        encabezados = [c.value for c in ws[1]]
        assert encabezados[4:16] == list(emitir.CAMPOS_DE_LA_SECUENCIA)
        fila = next(f for f in ws.iter_rows(min_row=2, values_only=True) if f[2] == "1")
        assert fila[encabezados.index("Sample Type")] == "Sample"
        assert fila[encabezados.index("Method Name")].startswith("NPD_ANALISIS")
        assert fila[encabezados.index("Injection Location")] == "Back"

    def test_por_vial_avisa_cuando_el_equipo_forzo_un_cero(self, muestras):
        """"Negative results set to zero" es la diferencia entre "no se
        detectó nada" y "dio negativo y lo dejé en cero". En la planilla vieja
        las dos cosas se veían como un cero pelado."""
        ws = _libro(muestras)[emitir.HOJA_POR_VIAL]
        encabezados = [c.value for c in ws[1]]
        avisos = [f[encabezados.index("Advertencias")] for f in ws.iter_rows(min_row=2, values_only=True)]
        assert any(a and "Calibrated compound(s) not found" in a for a in avisos)

    def test_cada_compuesto_ocupa_su_propio_bloque(self, muestras):
        """Un bloque de columnas por compuesto, después de las del vial: si
        los bloques se pisaran, un ppm quedaría bajo el compuesto equivocado.
        Y ningún encabezado puede repetirse -Excel no abre una tabla con dos
        columnas del mismo nombre-."""
        ws = _libro(muestras)[emitir.HOJA_POR_VIAL]
        encabezados = [c.value for c in ws[1]]
        de_compuestos = 7 * len(emitir.COLUMNAS_POR_COMPUESTO)
        assert len(encabezados) == len(emitir.COLUMNAS_FIJAS_POR_VIAL) + de_compuestos
        assert encabezados[-de_compuestos:][0] == "DIFENILAMINA ppm"
        assert all(e for e in encabezados)
        assert len(encabezados) == len(set(encabezados))

    def test_la_ubicacion_del_carrusel_llega_a_la_planilla(self, muestras):
        """Es la columna que el laboratorio usa para volver al vial físico."""
        ws = _libro(muestras)[emitir.HOJA_POR_VIAL]
        filas = {f[0]: f[1] for f in ws.iter_rows(min_row=2, values_only=True)}
        assert filas[1] == "1"
        assert filas[3] == "1"
        assert filas[5] == "3"
        assert all(v for v in filas.values())

    def test_un_vial_medido_queda_bien_ubicado(self, muestras):
        ws = _libro(muestras)[emitir.HOJA_POR_VIAL]
        encabezados = [c.value for c in ws[1]]
        fila = next(f for f in ws.iter_rows(min_row=2, values_only=True) if f[2] == "1")
        assert fila[encabezados.index("TEBUCONAZOLE ppm")] == pytest.approx(0.0488688)
        assert fila[encabezados.index("TEBUCONAZOLE área")] == pytest.approx(1.00441)
        assert fila[
            encabezados.index("TEBUCONAZOLE tiempo retención (min)")
        ] == pytest.approx(14.667)

    def test_el_tiempo_de_retencion_sale_aunque_no_haya_area(self, muestras):
        """El equipo reporta el tiempo de retención de todo el panel del
        método, incluso de los compuestos que no midió nada en ese vial. Es
        justamente lo que se mira al revisar una curva."""
        ws = _libro(muestras)[emitir.HOJA_POR_VIAL]
        encabezados = [c.value for c in ws[1]]
        fila = next(f for f in ws.iter_rows(min_row=2, values_only=True) if f[2] == "1")
        assert fila[encabezados.index("DIFENILAMINA ppm")] is None
        assert fila[
            encabezados.index("DIFENILAMINA tiempo retención (min)")
        ] == pytest.approx(7.63)

    def test_una_corrida_sin_muestras_de_cliente_se_exporta_igual(self, muestras):
        """Una corrida puede ser solo curvas, blancos y controles -sin ningún
        código GCNPD adentro- y pasarla a planilla sigue siendo válido: trae
        los ppm y los tiempos de retención de la curva, que es lo que se va a
        revisar. Antes la pantalla rechazaba el archivo entero por esto."""
        solo_controles = [m for m in muestras if not m.es_muestra]
        assert solo_controles and len(solo_controles) < len(muestras)
        ws = _libro(solo_controles)[emitir.HOJA_POR_VIAL]
        assert ws.max_row - 1 == len(solo_controles)
        assert {f[3] for f in ws.iter_rows(min_row=2, values_only=True)} == {"Control"}

    def test_sin_muestras_no_genera_nada(self):
        with pytest.raises(Exception):
            emitir.generar_excel_detalle_gc(emitir.DetalleGCIn(muestras=[]))


class TestSeccionesDelReporte:
    """El archivo del GC no son solo los resultados: trae con qué método se
    midió, con qué curva se calculó cada ppm, la estadística de los picos y la
    bitácora de la corrida. Antes se leía ~el 6% del archivo y todo eso -el
    respaldo de los números- se quedaba en el .txt."""

    def test_la_secuencia_trae_todos_los_campos_del_vial(self, reporte):
        """Antes se leía solo `Location`. `Sample Type` es el que dice si un
        vial es muestra, blanco o punto de curva: sin él hay que adivinarlo
        por el nombre, que es justo lo que se rompe al cambiar la
        nomenclatura."""
        assert len(reporte.secuencia) == 53
        linea = next(f for f in reporte.secuencia if f["Line"] == "3")
        assert linea["Sample Type"] == "Sample"
        assert linea["Injection Location"] == "Back"
        assert linea["Method Name"].startswith("NPD_ANALISIS")
        assert "Lims ID2" in linea

    def test_el_pico_llega_con_sus_siete_columnas(self, reporte):
        """De la tabla de resultados se descartaban tres: cómo se integró el
        pico, con qué factor pasó de área a ppm y en qué grupo va."""
        vial = next(m for m in reporte.muestras if m.codigo == "1")
        tebu = next(r for r in vial.resultados if r.analito == "TEBUCONAZOLE")
        assert tebu.tipo == "BB"
        assert tebu.amt_area == pytest.approx(0.0486541)

    def test_las_advertencias_del_equipo_no_se_pierden(self, reporte):
        """Un cero puede ser "no se detectó nada" o "dio negativo y se forzó a
        cero". El equipo lo dice; la planilla no lo mostraba."""
        con_aviso = [m for m in reporte.muestras if m.advertencias]
        assert con_aviso
        assert any("not found" in a for m in con_aviso for a in m.advertencias)

    def test_guarda_la_suma_del_vial_y_la_ficha_de_la_inyeccion(self, reporte):
        vial = next(m for m in reporte.muestras if m.codigo == "1")
        assert vial.totales == pytest.approx(0.0488688)
        assert vial.datos["Acq. Instrument"] == "GC 2"
        assert vial.datos["Inj Volume"] == "2 µl"

    def test_lee_el_metodo_instrumental(self, reporte):
        """La rampa del horno y las condiciones del detector: es lo que hay
        que mostrar si preguntan por qué un resultado dio lo que dio."""
        assert reporte.metodo
        por_bloque = {(b, c): v for b, c, v in reporte.metodo}
        assert por_bloque[("Agilent 7890B", "Hold Time")] == "0.8 min"
        assert any(c == "Signal 1 Type" for _, c, _ in reporte.metodo)

    def test_lee_la_auditoria_del_metodo(self, reporte):
        assert reporte.auditoria
        primero = reporte.auditoria[0]
        assert primero["operador"] and primero["fecha"]
        assert "method" in primero["cambio"].lower()

    def test_lee_la_curva_con_que_se_calculo_cada_ppm(self, reporte):
        """Sin la curva ningún resultado se puede recalcular ni verificar. El
        nombre del compuesto solo va en la fila del primer nivel: los demás lo
        heredan."""
        assert reporte.curva
        assert all(f["compuesto"] for f in reporte.curva)
        niveles = [f for f in reporte.curva if f["compuesto"] == "DIFENILAMINA"]
        assert len(niveles) >= 2
        assert niveles[0]["factor_respuesta"] is not None

    def test_lee_la_estadistica_de_los_picos(self, reporte):
        """Alto, ancho y simetría no están en ninguna otra parte del archivo, y
        el RSD es el criterio con que se acepta o rechaza una curva."""
        assert reporte.estadistica
        corridas = [f for f in reporte.estadistica if f["corrida"] is not None]
        assert corridas and corridas[0]["alto"] is not None
        assert {"Mean", "S.D.", "RSD", "95% CI"} <= {f["estadistico"] for f in reporte.estadistica}

    def test_lee_el_resumen_de_viales(self, reporte):
        """Trae cuántos compuestos se detectaron en cada vial: un control de
        calidad de un vistazo que no está en ninguna otra parte."""
        assert len(reporte.resumen) == 53
        assert all(f["vial"] for f in reporte.resumen)
        assert any(f["compuestos_detectados"] for f in reporte.resumen)

    def test_lee_la_bitacora_juntando_los_mensajes_cortados(self, reporte):
        """El equipo corta los mensajes largos con un ">" y los sigue en la
        línea de abajo."""
        assert reporte.bitacora
        assert all(e["fecha"] for e in reporte.bitacora)
        assert any(e["mensaje"].endswith(".M") for e in reporte.bitacora)
        assert not any(e["mensaje"].endswith(">") for e in reporte.bitacora)


class TestVisorPorCategorias:
    """Después de subir el archivo, la pantalla lo muestra tal como salió del
    equipo y le pone color a cada parte, diciendo a qué hoja va a parar."""

    def test_cada_linea_del_archivo_queda_clasificada(self, reporte):
        cubiertas = sum(fin - inicio + 1 for inicio, fin, _ in reporte.regiones)
        assert cubiertas == len(reporte.texto.split("\n"))

    def test_las_regiones_van_en_orden_y_sin_huecos(self, reporte):
        assert reporte.regiones[0][0] == 1
        for (_, fin, _), (inicio, _, _) in zip(reporte.regiones, reporte.regiones[1:]):
            assert inicio == fin + 1

    def test_reconoce_las_partes_que_importan(self, reporte):
        categorias = {c for _, _, c in reporte.regiones}
        assert {"equipo", "secuencia", "ident", "resultado", "metodo", "curva",
                "bitacora", "estadistica", "resumen"} <= categorias

    def test_la_tabla_de_resultados_cae_en_resultados(self, reporte):
        """La categoría de una línea tiene que ser la de lo que dice: si el
        corte se corre, la pantalla colorea cualquier cosa."""
        lineas = reporte.texto.split("\n")
        for inicio, fin, categoria in reporte.regiones:
            for i in range(inicio, fin + 1):
                if "External Standard Report" in lineas[i - 1]:
                    assert categoria == "resultado"
                    return
        raise AssertionError("no se encontró la tabla de resultados")

    def test_todas_las_categorias_estan_declaradas(self, reporte):
        from app.gc_parser import CATEGORIAS_GC

        declaradas = {i for i, _, _ in CATEGORIAS_GC}
        assert {c for _, _, c in reporte.regiones} <= declaradas
        assert all(nombre for _, nombre, _ in CATEGORIAS_GC)
