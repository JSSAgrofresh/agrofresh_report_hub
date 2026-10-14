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
