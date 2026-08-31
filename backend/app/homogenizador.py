"""
Núcleo de homogenización: dado un valor crudo del Excel, decide a qué valor
oficial del catálogo corresponde.

Es la versión automatizada de lo que hoy se hace a mano en Data Core. Se
diseñó midiendo contra un archivo real de 4.561 filas donde cada `SOLD TO`
venía acompañado de su `SOLD TO2` ya homogenizado por una persona, así que
cada regla de acá reproduce una decisión que alguien tomó de verdad.

La resolución va en cascada, de la evidencia más fuerte a la más débil, y se
detiene en la primera que acierta:

    1. ALIAS_CTX  ya resuelto antes PARA ESE CLIENTE ("LONTUE" de DOLE).
    2. ALIAS      ya resuelto antes por una persona, sin depender del contexto.
    3. EXACTO     coincide con el catálogo salvo mayúsculas/tildes/puntuación.
    4. NUCLEO     coincide al quitar la forma legal (S.A., SPA, LTDA).
    5. PREFIJO    es el comienzo de un único oficial ("THOMSEN" → "THOMSEN CHILE SA").
    6. SUGERENCIA se parece a uno o más, pero no lo suficiente para decidir solo.

Los cinco primeros se aplican solos. El último NO se aplica: se propone y la
persona confirma —así el sistema nunca inventa un cliente en silencio—. Lo que
no cae en ninguno queda sin resolver y va a la cola de revisión.

La diferencia entre 4 y 5 es deliberada: un prefijo único es reversible y
verificable, mientras que "se parece" no lo es. `CENKIWI` → `COPEFRUT SA` es
conocimiento del negocio, no parecido de texto: eso solo puede venir de la
tabla de alias.
"""
from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field
from difflib import SequenceMatcher

# Formas jurídicas y sus variantes de escritura. Se quitan del final del
# nombre para comparar el núcleo: "DOLE CHILE S.A." y "DOLE CHILE SA" son la
# misma empresa escrita distinto, no dos clientes.
_FORMAS_LEGALES = (
    "sociedad anonima", "limitada", "ltda", "ltd",
    "spa", "sa", "sac", "eirl", "srl", "inc", "cia",
)

# Palabras que describen el giro, no identifican a la empresa. Se quitan solo
# al comparar, nunca del valor guardado, y solo si queda algo distintivo
# detrás -sin esto "EXPORTADORA MAGNA" y "EXPORTADORA GEOFRUT" colapsarían.
_GIROS = (
    "comercializadora", "comercial", "exportadora", "agroindustrial",
    "sociedad agricola", "soc agricola", "inversiones", "inmobiliaria",
    "servicios", "agricola", "fruticola", "comer",
)

# Bajo este parecido ni siquiera se sugiere: son nombres distintos.
_UMBRAL_SUGERENCIA = 0.82

# Nombres de especie en inglés con los que algunos laboratorios prefijan la
# variedad ("PEARS - PACKHAMS"). Se reconocen para poder quedarse con la
# variedad sola. Es el mismo vocabulario que `ingest._PREFIJO_VARIEDAD_A_ESPECIE`,
# repetido acá para no arrastrar la dependencia de ingest a este módulo.
_ESPECIES_PREFIJO = frozenset("""
    apple apples pear pears blueberry blueberries cherry cherries plum plums
    grape grapes nectarine nectarines peach peaches kiwi kiwifruit kiwis
    avocado avocados orange oranges lemon lemons mandarin mandarins
    clementine clementines apricot apricots pomegranate pomegranates
    manzana manzanas pera peras cereza cerezas ciruela ciruelas uva uvas
    arandano arandanos durazno duraznos nectarin nectarines limon limones
    naranja naranjas palta paltas granada granadas damasco damascos
""".split())


def _sin_prefijo_especie(valor: str | None) -> str | None:
    """'PEARS - PACKHAMS' -> 'PACKHAMS'. None si no lleva ese prefijo.

    Solo corta cuando lo que va antes del guion es un nombre de especie: así
    no parte al medio una variedad que legítimamente lleva guion.
    """
    if not valor or "-" not in valor:
        return None
    izquierda, _, derecha = valor.partition("-")
    derecha = derecha.strip()
    if not derecha:
        return None
    return derecha if clave(izquierda) in _ESPECIES_PREFIJO else None


def clave(valor: str | None) -> str:
    """Insensible a mayúsculas, tildes, espacios y puntuación.

    Misma definición que `listados.clave_normalizada`; se repite acá para que
    este módulo no dependa de la capa de endpoints y pueda usarse desde un
    script sin levantar la aplicación.
    """
    v = unicodedata.normalize("NFKD", valor or "")
    v = "".join(c for c in v if not unicodedata.combining(c))
    v = re.sub(r"[^a-z0-9]+", " ", v.lower()).strip()
    return re.sub(r"\s+", " ", v)


def _juntar_iniciales(t: str) -> str:
    """'s a' -> 'sa', 'c y d' -> 'cyd'. Las siglas escritas con puntos quedan
    separadas al quitar la puntuación, y sin esto 'DOLE CHILE S.A.' no calza
    con 'DOLE CHILE SA'."""
    return re.sub(
        r"\b(?:[a-z0-9]\s){1,3}[a-z0-9]\b",
        lambda m: m.group(0).replace(" ", ""),
        t,
    )


def nucleo(valor: str | None, quitar_giro: bool = True) -> str:
    """Nombre sin forma jurídica ni palabras de giro: lo que de verdad
    identifica a la empresa."""
    t = _juntar_iniciales(clave(valor))
    if not t:
        return ""

    # El ampersand se pierde al normalizar ("C&D" -> "c d" -> "cd"), pero en
    # los nombres oficiales suele estar escrito "Y" ("CYD INTERNACIONAL").
    t = re.sub(r"\bcd\b", "cyd", t)

    cambio = True
    while cambio:
        cambio = False
        for forma in sorted(_FORMAS_LEGALES, key=len, reverse=True):
            f = forma.replace(" ", "")
            if t.endswith(" " + f):
                t = t[: -len(f) - 1].strip()
                cambio = True

    if quitar_giro:
        for giro in sorted(_GIROS, key=len, reverse=True):
            if t.startswith(giro + " ") and len(t) > len(giro) + 3:
                t = t[len(giro) + 1:].strip()
                break
    return t


@dataclass
class Resolucion:
    """Resultado de homogenizar un valor.

    `valor` es None cuando no se pudo decidir: el llamador lo manda a revisión.
    `automatico` distingue lo que se puede aplicar solo de lo que necesita que
    una persona confirme.
    """

    valor: str | None
    regla: str
    automatico: bool
    sugerencias: list[tuple[str, float]] = field(default_factory=list)


class Homogenizador:
    """Resuelve valores crudos contra un catálogo oficial.

    `oficiales` son los valores válidos de destino (ej. los 148 Sold To del
    catálogo). `alias` son decisiones ya tomadas por una persona: crudo →
    oficial. Se pasan tal cual vienen; acá se normalizan.
    """

    def __init__(
        self,
        oficiales: list[str],
        alias: dict[str, str] | None = None,
        alias_por_contexto: dict[tuple[str, str], str] | None = None,
    ):
        self.oficiales = [o for o in dict.fromkeys(v.strip() for v in oficiales if v and v.strip())]

        self._por_clave: dict[str, str] = {}
        self._por_nucleo: dict[str, list[str]] = {}
        for oficial in self.oficiales:
            self._por_clave.setdefault(clave(oficial), oficial)
            self._por_nucleo.setdefault(nucleo(oficial), []).append(oficial)

        # Un alias hacia un valor que no está en el catálogo se ignora: no se
        # puede homogenizar hacia algo que no existe.
        self._alias: dict[str, str] = {}
        for crudo, oficial in (alias or {}).items():
            destino = self._por_clave.get(clave(oficial))
            if destino and clave(crudo):
                self._alias[clave(crudo)] = destino

        # Alias que dependen de otro campo ya resuelto. Una sucursal "LONTUE"
        # es "DOLE LONTUE" si el cliente es DOLE, y "LONTUE" a secas para
        # cualquier otro: el nombre de planta solo identifica dentro de su
        # cliente. Sin esto, esos casos son irresolubles por texto.
        self._alias_ctx: dict[tuple[str, str], str] = {}
        for (contexto, crudo), oficial in (alias_por_contexto or {}).items():
            destino = self._por_clave.get(clave(oficial))
            if destino and clave(crudo) and clave(contexto):
                self._alias_ctx[(clave(contexto), clave(crudo))] = destino

    def aprender(self, crudo: str, oficial: str, contexto: str | None = None) -> None:
        """Registra una decisión tomada por una persona para que la próxima vez
        se resuelva sola."""
        destino = self._por_clave.get(clave(oficial))
        if not destino or not clave(crudo):
            return
        if contexto and clave(contexto):
            self._alias_ctx[(clave(contexto), clave(crudo))] = destino
        else:
            self._alias[clave(crudo)] = destino

    def resolver(self, crudo: str | None, contexto: str | None = None) -> Resolucion:
        k = clave(crudo)
        if not k:
            return Resolucion(None, "vacio", False)

        # 1. Alias con contexto: lo más específico que hay. Va primero porque
        #    el mismo texto puede significar cosas distintas según el cliente.
        if contexto:
            destino = self._alias_ctx.get((clave(contexto), k))
            if destino:
                return Resolucion(destino, "alias_contexto", True)

        # 2. Alias: una persona ya decidió esto antes.
        if k in self._alias:
            return Resolucion(self._alias[k], "alias", True)

        # 3. Coincide con el catálogo salvo forma de escritura.
        if k in self._por_clave:
            return Resolucion(self._por_clave[k], "exacto", True)

        # 3b. Variedad escrita como "ESPECIE - VARIEDAD" ("PEARS - PACKHAMS").
        #     Se reintenta con la parte de la variedad sola. Solo aplica si lo
        #     que queda calza exacto: si no, se sigue la cascada normal para
        #     no cortar por la mitad un nombre que de verdad lleva guion.
        sin_prefijo = _sin_prefijo_especie(crudo)
        if sin_prefijo:
            k2 = clave(sin_prefijo)
            if k2 in self._alias:
                return Resolucion(self._alias[k2], "alias", True)
            if k2 in self._por_clave:
                return Resolucion(self._por_clave[k2], "sin_prefijo_especie", True)

        n = nucleo(crudo)
        if not n:
            return Resolucion(None, "vacio", False)

        # 4. Mismo núcleo: cambia solo la forma jurídica o el giro.
        candidatos = self._por_nucleo.get(n, [])
        if len(candidatos) == 1:
            return Resolucion(candidatos[0], "nucleo", True)
        if len(candidatos) > 1:
            # Dos oficiales distintos con el mismo núcleo: elegir uno sería
            # adivinar. Se proponen ambos.
            return Resolucion(None, "nucleo_ambiguo", False, [(c, 1.0) for c in candidatos])

        # 5. Prefijo de un único oficial ("THOMSEN" -> "THOMSEN CHILE SA").
        #    Se exige que el corte caiga en un límite de palabra para que
        #    "SAN" no se lleve "SAN FERNANDO" y "SANTA MARTA" a la vez.
        prefijos = [
            o for o in self.oficiales
            if (no := nucleo(o)) != n and (no.startswith(n + " ") or n.startswith(no + " "))
        ]
        if len(prefijos) == 1:
            return Resolucion(prefijos[0], "prefijo", True)

        # 6. Parecido: se propone, nunca se aplica solo.
        puntajes = sorted(
            ((o, SequenceMatcher(None, n, nucleo(o)).ratio()) for o in self.oficiales),
            key=lambda par: -par[1],
        )
        sugerencias = [(o, round(r, 3)) for o, r in puntajes[:5] if r >= _UMBRAL_SUGERENCIA]
        if sugerencias:
            return Resolucion(None, "sugerencia", False, sugerencias)

        return Resolucion(None, "sin_match", False, [(o, round(r, 3)) for o, r in puntajes[:3]])
