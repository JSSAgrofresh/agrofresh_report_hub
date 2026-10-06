from datetime import datetime, timezone

from scripts import ordenar_r2_accutab as o

UTC = timezone.utc


class _S3:
    def __init__(self):
        self.copiados, self.borrados = [], []

    def copy_object(self, Bucket, CopySource, Key):
        self.copiados.append((CopySource["Key"], Key))

    def delete_object(self, Bucket, Key):
        self.borrados.append(Key)


def test_ordena_carpetas_viejas_por_cliente_y_fecha_y_no_toca_las_nuevas():
    t = datetime(2026, 10, 6, 15, 30, 5, tzinfo=UTC)  # 12:30:05 en Chile (UTC-3)
    objs = [
        ("accutab/mail/AGROFRESH_DEMO (11)/PH/a.csv", t),
        ("accutab/mail/AGROFRESH_DEMO (11)/ORP/b.csv", t),
        ("accutab/mail/AGROFRESH_DEMO (12)/a.csv", t),            # mismo segundo: no se pisa
        ("accutab/mail/DOLE/2026-10-01/Informe 10-00-00.pdf", t),  # ya ordenada
        ("accutab/mail/suelto.txt", t),
    ]
    plan = o.planear(objs)
    assert set(plan) == {"AGROFRESH_DEMO (11)", "AGROFRESH_DEMO (12)"}
    nueva11, pares = plan["AGROFRESH_DEMO (11)"]
    assert nueva11 == "AGROFRESH_DEMO/2026-10-06/Datos 12-30-05"
    assert ("accutab/mail/AGROFRESH_DEMO (11)/PH/a.csv", f"accutab/mail/{nueva11}/PH/a.csv") in pares
    assert plan["AGROFRESH_DEMO (12)"][0] == "AGROFRESH_DEMO/2026-10-06/Datos 12-30-05 (2)"
    s3 = _S3()
    assert o.aplicar(s3, "b", plan) == 3
    assert sorted(s3.borrados) == sorted(v for v, _ in s3.copiados)
    assert o.planear([(n, t) for _, n in s3.copiados]) == {}  # volver a correr no hace nada
