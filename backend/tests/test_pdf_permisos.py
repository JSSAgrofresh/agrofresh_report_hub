import io

from pypdf import PdfReader, PdfWriter

from app.pdf_permisos import sin_restricciones


def _pdf(clave_dueno: str | None = None, clave_usuario: str = "") -> bytes:
    w = PdfWriter()
    w.add_blank_page(width=200, height=200)
    if clave_dueno:
        w.encrypt(user_password=clave_usuario, owner_password=clave_dueno)
    b = io.BytesIO()
    w.write(b)
    return b.getvalue()


def test_pdf_con_restricciones_sale_sin_cifrado_y_con_sus_paginas():
    original = _pdf("dueno")
    assert PdfReader(io.BytesIO(original)).is_encrypted
    r = PdfReader(io.BytesIO(sin_restricciones(original)))
    assert not r.is_encrypted
    assert len(r.pages) == 1


def test_pdf_normal_se_devuelve_tal_cual():
    normal = _pdf()
    assert sin_restricciones(normal) is normal


def test_pdf_con_clave_real_o_roto_no_se_toca():
    con_clave = _pdf("dueno", clave_usuario="secreta")
    assert sin_restricciones(con_clave) == con_clave
    assert sin_restricciones(b"no es un pdf") == b"no es un pdf"


def _pdf_firmado(con_otro_campo: bool = False) -> bytes:
    """Un PDF con un campo de firma visible (el recuadro que Chrome dibuja sobre la hoja en los de ALS)."""
    from pypdf.generic import ArrayObject, DictionaryObject, FloatObject, NameObject, NumberObject, TextStringObject

    w = PdfWriter()
    pagina = w.add_blank_page(width=200, height=200)

    def widget(tipo: str, nombre: str):
        return w._add_object(
            DictionaryObject(
                {
                    NameObject("/Type"): NameObject("/Annot"),
                    NameObject("/Subtype"): NameObject("/Widget"),
                    NameObject("/FT"): NameObject(tipo),
                    NameObject("/T"): TextStringObject(nombre),
                    NameObject("/Rect"): ArrayObject([FloatObject(0), FloatObject(0), FloatObject(100), FloatObject(50)]),
                }
            )
        )

    firma = widget("/Sig", "Firma1")
    campos = [firma] + ([widget("/Tx", "Nombre")] if con_otro_campo else [])
    pagina[NameObject("/Annots")] = ArrayObject(campos)
    w._root_object[NameObject("/AcroForm")] = DictionaryObject(
        {NameObject("/Fields"): ArrayObject(campos), NameObject("/SigFlags"): NumberObject(3)}
    )
    b = io.BytesIO()
    w.write(b)
    return b.getvalue()


def test_pdf_firmado_sale_sin_el_recuadro_de_firma():
    from app.pdf_permisos import _tiene_firma

    original = _pdf_firmado()
    assert _tiene_firma(PdfReader(io.BytesIO(original)))
    salida = PdfReader(io.BytesIO(sin_restricciones(original)))
    assert not _tiene_firma(salida)
    assert "/Annots" not in salida.pages[0]
    assert "/AcroForm" not in salida.trailer["/Root"]
    assert len(salida.pages) == 1


def test_pdf_firmado_conserva_sus_otros_campos():
    salida = PdfReader(io.BytesIO(sin_restricciones(_pdf_firmado(con_otro_campo=True))))
    anotaciones = [a.get_object() for a in salida.pages[0]["/Annots"]]
    assert [str(a["/FT"]) for a in anotaciones] == ["/Tx"]
    assert len(salida.trailer["/Root"]["/AcroForm"]["/Fields"]) == 1
