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
from app.gc_parser import es_codigo_puro, parsear_gc_txt

ARCHIVO = os.path.join(os.path.dirname(__file__), "datos", "GLPrprtB.txt")

pytestmark = pytest.mark.skipif(
    not os.path.exists(ARCHIVO), reason="falta el reporte de GC de ejemplo"
)


@pytest.fixture(scope="module")
def muestras():
    crudas = parsear_gc_txt(open(ARCHIVO, "rb").read())
    return [
        emitir.MuestraGCDetalleOut(
            codigo=m.codigo,
            seq_line=m.seq_line,
            fecha_inyeccion=m.fecha_inyeccion,
            es_muestra=es_codigo_puro(m.codigo),
            resultados=[
                emitir.ResultadoAnalitoOut(
                    analito=r.analito, codigo=None, area=r.area, amount=r.amount, rettime=r.rettime
                )
                for r in m.resultados
            ],
        )
        for m in crudas
    ]


def _libro(muestras):
    import asyncio

    resp = emitir.generar_excel_detalle_gc(emitir.DetalleGCIn(muestras=muestras))
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


class TestExcel:
    def test_tiene_las_dos_hojas(self, muestras):
        assert _libro(muestras).sheetnames == [emitir.HOJA_DETALLE, emitir.HOJA_POR_VIAL]

    def test_datos_completos_calza_con_el_convertidor_viejo(self, muestras):
        """371 filas es exactamente lo que sacaba la herramienta anterior con
        este mismo archivo."""
        ws = _libro(muestras)[emitir.HOJA_DETALLE]
        assert ws.max_row - 1 == 371

    def test_por_vial_lleva_ppm_y_area_juntos(self, muestras):
        """Antes eran dos hojas separadas: leer un vial obligaba a saltar de
        una a otra para comparar su concentración contra su área."""
        ws = _libro(muestras)[emitir.HOJA_POR_VIAL]
        encabezados = [c.value for c in ws[1]]
        assert encabezados[:3] == ["Seq Line", "Vial", "Tipo"]
        assert encabezados[3] == "DIFENILAMINA ppm"
        assert encabezados[4] == "DIFENILAMINA área"
        assert ws.max_row - 1 == 53

    def test_un_vial_medido_queda_bien_ubicado(self, muestras):
        ws = _libro(muestras)[emitir.HOJA_POR_VIAL]
        encabezados = [c.value for c in ws[1]]
        fila = next(f for f in ws.iter_rows(min_row=2, values_only=True) if f[1] == "1")
        assert fila[encabezados.index("TEBUCONAZOLE ppm")] == pytest.approx(0.0488688)
        assert fila[encabezados.index("TEBUCONAZOLE área")] == pytest.approx(1.00441)

    def test_sin_muestras_no_genera_nada(self):
        with pytest.raises(Exception):
            emitir.generar_excel_detalle_gc(emitir.DetalleGCIn(muestras=[]))
