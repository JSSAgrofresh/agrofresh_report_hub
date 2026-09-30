"""La configuración de envío automático: regla general + una por tipo de aplicación."""
from app import toma_muestras as tm


def test_config_antigua_solo_con_activo(monkeypatch):
    monkeypatch.setattr(tm, "_leer_config", lambda nombre, defecto: {"activo": False})
    cfg = tm._config_envio_automatico()
    assert cfg.activo is False
    assert cfg.por_tipo == {}


def test_config_con_reglas_por_tipo(monkeypatch):
    monkeypatch.setattr(
        tm, "_leer_config",
        lambda nombre, defecto: {"activo": True, "por_tipo": {"Actimist": False}},
    )
    cfg = tm._config_envio_automatico()
    assert cfg.activo is True
    assert cfg.por_tipo == {"Actimist": False}


def test_sin_archivo_rige_el_defecto_activo(monkeypatch):
    monkeypatch.setattr(tm, "_leer_config", lambda nombre, defecto: defecto)
    assert tm._config_envio_automatico().activo is True
