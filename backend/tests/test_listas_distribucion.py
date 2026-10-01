"""Listas de distribución desde Administración General: comparar un Excel con
lo que hay y aplicar SOLO lo confirmado."""
import io

import openpyxl
import pytest

from app import listas_distribucion as ld

ADM = ["jorge.sandoval@agrofresh.com", "cguerrero@agrofresh.com", "agrofreshreporthub@gmail.com"]


def _c(id_, tipo, email, especie="", cargo="", copia="cc", activo=True, orden=1, sold="CLI SA", ship="PLANTA UNO"):
    return {"id": id_, "tipo": tipo, "email": email, "especie": especie, "cargo": cargo, "tipo_copia": copia,
            "activo": activo, "orden": orden, "sold_to": sold, "ship_to": ship, "laboratorio": "AGROFRESH", "nombre": email}


def _sistema():
    """Planta con lista general de cliente, un comercial, un técnico MAL puesto (cc) y dos admin."""
    return [
        _c(1, "resultado_cliente", "cli@x.cl"),
        _c(2, "resultado_interno", "com@agrofresh.com", cargo="Comercial", copia="cc"),
        _c(3, "resultado_interno", "tec@agrofresh.com", cargo="Técnico", copia="cc"),
        _c(4, "resultado_interno", ADM[0], cargo="Admin", copia="bcc"),
        _c(5, "resultado_interno", ADM[1], cargo="Admin", copia="bcc"),
    ]


def _fila(**kw):
    base = {"sold_to": "CLI SA", "ship_to": "PLANTA UNO", "admin": [], "comercial": [], "tecnico": [],
            "clientes": {c: [] for c in ld.CATEGORIAS}}
    base.update(kw)
    return base


def _cambios(contactos, fila, listados=None):
    return ld.comparar(ld.estado_desde_contactos(contactos), [fila], listados)["cambios"]


def test_estado_expande_la_lista_general_a_todas_las_categorias_y_marca_copia_mal():
    e = ld.estado_desde_contactos(_sistema())[ld.clave_planta("CLI SA", "PLANTA UNO")]
    assert all(e["clientes"][c] == ["cli@x.cl"] for c in ld.CATEGORIAS)
    assert e["tecnico"] == ["tec@agrofresh.com"] and e["copia_mal"] == ["tec@agrofresh.com"]
    assert e["admin"] == ADM[:2]


def test_celda_vacia_no_quita_a_nadie_y_sin_diferencias_no_hay_cambios():
    fila = _fila(comercial=["com@agrofresh.com"], tecnico=["tec@agrofresh.com"], admin=ADM[:2],
                 clientes={c: ["cli@x.cl"] for c in ld.CATEGORIAS})
    assert [c["tipo"] for c in _cambios(_sistema(), fila)] == ["copia"]  # solo falta ajustar el técnico
    # una fila totalmente vacía tampoco quita a nadie: lo único que queda es el ajuste de copia
    assert [c["tipo"] for c in _cambios(_sistema(), _fila())] == ["copia"]


def test_agregar_el_correo_del_sistema_y_quitar_a_alguien():
    fila = _fila(admin=ADM, comercial=["otro@agrofresh.com"])
    por_campo = {c["campo"]: c for c in _cambios(_sistema(), fila)}
    assert por_campo["admin"]["agregar"] == [ADM[2]] and por_campo["admin"]["quitar"] == []
    assert por_campo["comercial"]["agregar"] == ["otro@agrofresh.com"]
    assert por_campo["comercial"]["quitar"] == ["com@agrofresh.com"]


def test_aplicar_solo_lo_confirmado():
    fila = _fila(admin=ADM, comercial=["otro@agrofresh.com"])
    cambios = _cambios(_sistema(), fila)
    solo_admin = [c for c in cambios if c["campo"] == "admin"]
    nuevos, r = ld.aplicar(_sistema(), solo_admin)
    assert r["aplicados"] == 1 and r["plantas"] == 1
    emails = {(c["email"], c["tipo_copia"]) for c in nuevos if c["tipo"] == "resultado_interno" and c["cargo"] == "Admin"}
    assert (ADM[2], "bcc") in emails
    assert any(c["email"] == "com@agrofresh.com" for c in nuevos)  # el comercial NO se tocó


def test_ajustar_copia_pasa_el_tecnico_a_copia_oculta():
    cambios = [c for c in _cambios(_sistema(), _fila(tecnico=["tec@agrofresh.com"])) if c["tipo"] == "copia"]
    nuevos, _ = ld.aplicar(_sistema(), cambios)
    assert [c["tipo_copia"] for c in nuevos if c["email"] == "tec@agrofresh.com"] == ["bcc"]


def test_agregar_un_cliente_a_una_categoria_separa_por_especie_sin_perder_a_nadie():
    fila = _fila(clientes={**{c: ["cli@x.cl"] for c in ld.CATEGORIAS}, "Kiwi": ["cli@x.cl", "nuevo@x.cl"]})
    cambios = _cambios(_sistema(), fila)
    assert [(c["campo"], c["agregar"]) for c in cambios if c["tipo"] == "campo"] == [("Kiwi", ["nuevo@x.cl"])]
    nuevos, _ = ld.aplicar(_sistema(), [c for c in cambios if c["tipo"] == "campo"])
    cli = [c for c in nuevos if c["tipo"] == "resultado_cliente"]
    assert not any(c["especie"] == "" for c in cli)  # ya no hay lista general
    assert {c["email"] for c in cli if c["especie"] == "Kiwi"} == {"cli@x.cl", "nuevo@x.cl"}
    assert {c["email"] for c in cli if c["especie"] == "Manzana"} == {"cli@x.cl"}
    assert len({c["id"] for c in nuevos}) == len(nuevos)  # ids únicos


def test_agregar_lo_mismo_a_todas_las_categorias_vuelve_a_la_lista_general():
    fila = _fila(clientes={c: ["cli@x.cl", "nuevo@x.cl"] for c in ld.CATEGORIAS})
    cambios = [c for c in _cambios(_sistema(), fila) if c["tipo"] == "campo"]
    assert len(cambios) == len(ld.CATEGORIAS)
    nuevos, _ = ld.aplicar(_sistema(), cambios)
    cli = [c for c in nuevos if c["tipo"] == "resultado_cliente"]
    assert {c["especie"] for c in cli} == {""} and {c["email"] for c in cli} == {"cli@x.cl", "nuevo@x.cl"}


def test_planta_nueva_se_crea_con_sus_roles_y_avisa_si_no_esta_en_listados():
    fila = _fila(sold_to="OTRO SA", ship_to="PLANTA DOS", comercial=["c@agrofresh.com"], tecnico=["t@agrofresh.com"],
                 admin=ADM[:1], clientes={"Kiwi": ["k@x.cl"]})
    cambios = _cambios(_sistema(), fila, listados={})
    assert cambios[0]["tipo"] == "planta_nueva" and "Listados" in cambios[0]["aviso"]
    nuevos, _ = ld.aplicar(_sistema(), cambios)
    copia = {c["email"]: c["tipo_copia"] for c in nuevos if c["ship_to"] == "PLANTA DOS" and c["tipo"] == "resultado_interno"}
    assert copia == {"c@agrofresh.com": "cc", "t@agrofresh.com": "bcc", ADM[0]: "bcc"}
    assert {c["especie"] for c in nuevos if c["ship_to"] == "PLANTA DOS" and c["tipo"] == "resultado_cliente"} == {"Kiwi"}


def test_el_nombre_de_listados_manda_al_crear():
    fila = _fila(sold_to="otro  sa", ship_to="planta  dos", comercial=["c@agrofresh.com"])
    lis = {ld.clave_planta("otro sa", "planta dos"): ("OTRO SA", "PLANTA DOS")}
    assert _cambios(_sistema(), fila, lis)[0]["planta"] == {"sold_to": "OTRO SA", "ship_to": "PLANTA DOS"}


def test_exportar_y_volver_a_subir_no_propone_cambios():
    ok = _sistema()
    ok[2]["tipo_copia"] = "bcc"  # técnico bien puesto
    estado = ld.estado_desde_contactos(ok)
    filas, avisos = ld.leer_filas_excel(ld.construir_excel(estado))
    assert avisos == []
    resultado = ld.comparar(estado, filas)
    assert resultado["cambios"] == [] and resultado["resumen"]["plantas_sin_cambios"] == 1


def test_lee_la_hoja_del_maestro_y_avisa_de_textos_que_no_son_correo():
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = ld.HOJA_MAESTRO
    ws.append(["#", "ñ", "VIGENTE POST VENTA", "S NUMBER", "SOLD TO NAME", "SHIP TO NUMBER", "SHIP TO NAME",
               "Admin Report Hub", "Comercial a cargo", "Técnico a cargo", "Manzana y Pera", "Kiwi", "Carozos",
               "Cerezas", "Citricos", "Arandanos ", "Paltas", "Nueces y Pasas", "Granada", "FSIN CORREO"])
    ws.append([1, 1, "SI", 1, "CLI SA", 1, "PLANTA UNO", "a@x.cl;cguerrero", "#N/A", "NA", "m@x.cl", None, None,
               None, None, None, None, None, None, "OK"])
    ws.append([2, 2, "NO", 2, "CLI SA", 2, "PLANTA NO VIGENTE", None, None, None, None, None, None,
               None, None, None, None, None, None, "OK"])
    buf = io.BytesIO()
    wb.save(buf)
    filas, avisos = ld.leer_filas_excel(buf.getvalue())
    assert len(filas) == 1 and filas[0]["admin"] == ["a@x.cl"] and filas[0]["comercial"] == []
    assert filas[0]["clientes"]["Manzana y Pera"] == ["m@x.cl"]
    assert any("cguerrero" in a for a in avisos)


def test_un_excel_sin_las_columnas_da_error_claro():
    wb = openpyxl.Workbook()
    wb.active.append(["a", "b"])
    buf = io.BytesIO()
    wb.save(buf)
    with pytest.raises(ValueError, match="SOLD TO NAME"):
        ld.leer_filas_excel(buf.getvalue())
