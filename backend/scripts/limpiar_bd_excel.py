"""
Limpia y normaliza el Excel maestro BD_formato_69_columnas.xlsx (hoja "BD")
para dejarlo listo para ingestar en el módulo Cargar Datos.

Problemas que resuelve:
  1. Laboratorio = "Agrofresh"  →  "Quiteca / AgroFresh"  (valor que espera el sistema)
  2. N° Informe con código GC (ej. "GCNPD-123")  →  lo mueve a "N° Orden" y deja el
     campo informe vacío (es un código de inyección de GC, no un folio de informe).
  3. Celdas con el valor "-" (guion) → las vacía (son nulos disfrazados).
  4. Espacios sobrantes en encabezados y en celdas de texto.
  5. Informa qué columnas de la hoja NO están mapeadas en mapeo.py (no las borra,
     solo avisa para que se decida si agregarlas al sistema).

Uso:
    cd backend
    python scripts/limpiar_bd_excel.py ARCHIVO.xlsx              # solo analizar
    python scripts/limpiar_bd_excel.py ARCHIVO.xlsx --aplicar    # escribir archivo limpio
    python scripts/limpiar_bd_excel.py ARCHIVO.xlsx --aplicar --salida LIMPIO.xlsx
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

# ---------------------------------------------------------------------------
# Columnas que el sistema sí conoce (mapeo.py + campos de solicitud hardcodeados
# en ingest.py). Se usa solo para el reporte de "no mapeadas".
# ---------------------------------------------------------------------------
CAMPOS_SOLICITUD = {
    "Temporada",
    "N° Solicitud",
    "Fecha de Entrada",
    "Fecha de Muestreo",
    "Hora de Muestreo",
    "Fecha Informe",
    "Fecha Análisis",
    "Hora Muestreo",
    "Laboratorio",
    # Nombres del formato BD (estándar actual)
    "Sold To",
    "Ship To",
    "Especie",
    "Variedad",
    "CSG",
    "Solicitante",
    "Línea Proceso",
    "Línea de Proceso",
    "Posición Muestreo",
    "N° Cámara",
    "Lote",
    # Nombres del formato antiguo (alias)
    "Cliente",
    "Planta",
    "Producto",
    "Código de Muestra",
    "Código Packing",
    "Código del Productor",
    "Código del Packing",
    "N° Orden",
    "N° Informe",
    "Observaciones",
    "Observación",
    "Norma",
    "Analista",
    "Nombre Muestreador",
    "Generado Por",
    "Email Solicitante",
    "Email Laboratorio",
    "Tipo de Muestra",
    "Tipo Muestra",
    "Producto Utilizado",
    "Kilos Procesados (KG)",
    "SEMANA",
    "MES",
    # alias conocidos del Excel nativo
    "Nro. Solicitud",
    "Número de Solicitud",
    "Fecha Entrada",
    "Fecha Muestreo",
    "Fecha Solicitud",
    "Codigo Muestra",
    "Codigo del Packing",
    "Numero Orden",
    "Numero Informe",
    "Obs",
    "Tipo Aplicación",
    "Gasto",
    "Solicitante",
}

ANALITOS_CONOCIDOS = {
    # Pesticidas (resultado + dosis)
    "FDL", "FDL Dosis", "FDL_dosis",
    "IMZ", "IMZ Dosis", "IMZ_dosis",
    "PYR", "PYR Dosis", "PYR_dosis",
    "TBZ", "TBZ Dosis", "TBZ_dosis",
    "AZOX", "AZOX Dosis", "AZOX_dosis",
    "TEBU", "TEBU Dosis", "TEBU_dosis",
    "DPA", "DPA Dosis",
    "DFN", "DFN FINAL",
    # Resultado (nombre largo de columna)
    "FDL FINAL", "FDL ppm",
    "IMZ FINAL", "IMZ ppm",
    "PYR FINAL", "PYR ppm",
    "TBZ FINAL", "TBZ ppm",
    "AZOXFINAL", "AZOX ppm",
    "TEBU FINAL", "TEBU ppm",
    "DPA FINAL", "DPA ppm",
    # Tipo aplicación / gasto
    "Tipo Aplicación", "Gasto",
    # Diagnofruit / Agua
    "Levaduras UFC/mL",
    "Botrytis conidia/mL",
    "Alternaria conidia/mL",
    "Geotrichum esporas/mL",
    "Penicillium conidia/mL",
    "E. Coli UFC/100mL",
    "Coliformes Totales UFC/100mL",
    # ALS / Metales
    "Plomo mg/kg",
    "Mercurio mg/kg",
    "Arsénico mg/kg",
    "Cadmio mg/kg",
    "Aluminio mg/kg",
    # ALS / Microbiología alimento
    "Hongos UFC/g",
    "Levaduras UFC/g",
    "Coliformes Totales UFC/g",
    "Escherichia coli UFC/g",
    "Recuento Enterobacterias UFC/g",
    "Salmonella 25g (P/A)",
    "Cenizas Insolubles en Ácido (%)",
    "Aflatoxinas Totales B1+B2+G1+G2 (µg/kg)",
    # Casilleros libres de pesticidas
    "Analito Pesticida 1", "Resultado Pesticida 1",
    "Analito Pesticida 2", "Resultado Pesticida 2",
    "Analito Pesticida 3", "Resultado Pesticida 3",
}

TODAS_CONOCIDAS = CAMPOS_SOLICITUD | ANALITOS_CONOCIDOS


def _importar_openpyxl():
    try:
        import openpyxl
        return openpyxl
    except ImportError:
        print("ERROR: falta openpyxl.  Instálalo con:  pip install openpyxl")
        sys.exit(1)


def _hoja_datos(wb, modo: str = "r") -> object:
    """Devuelve la hoja de datos principal: 'Solicitudes', 'BD' o la primera hoja."""
    for nombre in ("Solicitudes", "BD"):
        if nombre in wb.sheetnames:
            return wb[nombre]
    # Fallback: primera hoja (formatos alternativos)
    return wb[wb.sheetnames[0]]


def analizar(ruta: Path) -> dict:
    """Lee la hoja de datos y devuelve un resumen de los problemas encontrados."""
    ox = _importar_openpyxl()
    wb = ox.load_workbook(ruta, read_only=True, data_only=True)

    hojas_conocidas = [h for h in ("Solicitudes", "BD") if h in wb.sheetnames]
    if not hojas_conocidas:
        print(f"AVISO: no se encontró hoja 'Solicitudes' ni 'BD'. Usando la primera: '{wb.sheetnames[0]}'")

    ws = _hoja_datos(wb)
    filas = list(ws.iter_rows(values_only=True))
    if not filas:
        print(f"ERROR: la hoja '{ws.title}' está vacía.")
        sys.exit(1)

    encabezados_raw = [str(c).strip() if c is not None else "" for c in filas[0]]
    encabezados = encabezados_raw  # ya sin espacios sobrantes tras strip

    datos = filas[1:]
    total = len(datos)

    # Índices de columnas clave (case-insensitive para robusted)
    enc_lower = {h.lower(): i for i, h in enumerate(encabezados)}

    idx_lab       = enc_lower.get("laboratorio")
    idx_informe   = enc_lower.get("n° informe") or enc_lower.get("numero informe") or enc_lower.get("nro. informe")
    idx_orden     = enc_lower.get("n° orden") or enc_lower.get("numero orden") or enc_lower.get("nro. orden")

    # ---------- conteo de problemas ----------
    labs_mal: dict[str, int] = {}
    gc_en_informe = 0
    guiones = 0

    for fila in datos:
        if idx_lab is not None:
            lab = str(fila[idx_lab]).strip() if fila[idx_lab] is not None else ""
            if lab and lab not in ("Quiteca / AgroFresh",):
                labs_mal[lab] = labs_mal.get(lab, 0) + 1

        if idx_informe is not None:
            inf = str(fila[idx_informe]).strip() if fila[idx_informe] is not None else ""
            if inf.upper().startswith("GC"):
                gc_en_informe += 1

        for v in fila:
            if str(v).strip() == "-":
                guiones += 1

    # ---------- columnas no mapeadas ----------
    no_mapeadas = [h for h in encabezados if h and h not in TODAS_CONOCIDAS]

    wb.close()
    return {
        "total": total,
        "encabezados": encabezados,
        "labs_mal": labs_mal,
        "gc_en_informe": gc_en_informe,
        "guiones": guiones,
        "no_mapeadas": no_mapeadas,
        "idx_lab": idx_lab,
        "idx_informe": idx_informe,
        "idx_orden": idx_orden,
    }


def imprimir_resumen(info: dict) -> None:
    print(f"\n{'='*60}")
    print(f"  Hoja BD — {info['total']} filas de datos")
    print(f"{'='*60}")

    print(f"\n[1] Laboratorio mal etiquetado:")
    if info["labs_mal"]:
        for lab, n in sorted(info["labs_mal"].items(), key=lambda x: -x[1]):
            print(f"      '{lab}'  →  {n} filas  (se corrige a 'Quiteca / AgroFresh')")
    else:
        print("      OK — todos dicen 'Quiteca / AgroFresh'")

    print(f"\n[2] N° Informe con código GC (hay que mover a N° Orden):")
    print(f"      {info['gc_en_informe']} filas afectadas")

    print(f"\n[3] Celdas con guion '-' (nulos disfrazados):")
    print(f"      {info['guiones']} celdas")

    print(f"\n[4] Columnas de la hoja BD que el sistema NO mapea aún:")
    if info["no_mapeadas"]:
        for col in info["no_mapeadas"]:
            print(f"      '{col}'")
        print("      → Decidir si agregarlas a mapeo.py o ignorarlas.")
    else:
        print("      Todas mapeadas.")
    print()


def limpiar_y_guardar(ruta: Path, salida: Path) -> None:
    """Carga, limpia y guarda el Excel como archivo nuevo."""
    ox = _importar_openpyxl()
    # load_workbook sin read_only para poder escribir
    wb = ox.load_workbook(ruta, data_only=True)
    ws = _hoja_datos(wb)

    filas = list(ws.iter_rows())
    if not filas:
        print(f"ERROR: la hoja '{ws.title}' está vacía.")
        sys.exit(1)

    # Encabezados (fila 0)
    encabezados = {}
    for cell in filas[0]:
        if cell.value is not None:
            enc_limpio = str(cell.value).strip()
            cell.value = enc_limpio
            encabezados[cell.column - 1] = enc_limpio.lower()

    idx_lab     = next((i for i, h in encabezados.items() if h == "laboratorio"), None)
    idx_informe = next((i for i, h in encabezados.items() if h in ("n° informe", "numero informe", "nro. informe")), None)
    idx_orden   = next((i for i, h in encabezados.items() if h in ("n° orden", "numero orden", "nro. orden")), None)

    correcciones_lab = 0
    correcciones_gc  = 0
    correcciones_gui = 0

    for fila in filas[1:]:
        for cell in fila:
            v = cell.value

            # --- guiones ---
            if isinstance(v, str) and v.strip() == "-":
                cell.value = None
                correcciones_gui += 1
                continue

            # --- trim de texto ---
            if isinstance(v, str):
                cell.value = v.strip() or None

        # --- laboratorio ---
        if idx_lab is not None:
            cell_lab = fila[idx_lab]
            lab = str(cell_lab.value).strip() if cell_lab.value else ""
            if lab and lab != "Quiteca / AgroFresh":
                cell_lab.value = "Quiteca / AgroFresh"
                correcciones_lab += 1

        # --- N° Informe con GC → mover a N° Orden ---
        if idx_informe is not None:
            cell_inf = fila[idx_informe]
            inf = str(cell_inf.value).strip() if cell_inf.value else ""
            if inf.upper().startswith("GC"):
                correcciones_gc += 1
                if idx_orden is not None:
                    cell_ord = fila[idx_orden]
                    # Solo mueve si N° Orden está vacío
                    if not cell_ord.value:
                        cell_ord.value = inf
                cell_inf.value = None

    wb.save(salida)
    print(f"\nArchivo limpio guardado en: {salida}")
    print(f"  Laboratorio corregido:      {correcciones_lab} filas")
    print(f"  Códigos GC movidos:         {correcciones_gc} filas")
    print(f"  Guiones vaciados:           {correcciones_gui} celdas\n")


def main() -> None:
    p = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    p.add_argument("archivo", help="Ruta al Excel maestro (hoja BD)")
    p.add_argument("--aplicar", action="store_true", help="Escribir archivo limpio. Sin esto solo analiza.")
    p.add_argument("--salida", help="Nombre del archivo de salida (por defecto: ARCHIVO_limpio.xlsx)")
    args = p.parse_args()

    ruta = Path(args.archivo)
    if not ruta.exists():
        print(f"ERROR: no existe el archivo '{ruta}'")
        sys.exit(1)

    info = analizar(ruta)
    imprimir_resumen(info)

    if not args.aplicar:
        print("Modo análisis (sin --aplicar). Para escribir el archivo limpio agrega --aplicar.\n")
        return

    salida = Path(args.salida) if args.salida else ruta.with_stem(ruta.stem + "_limpio")
    limpiar_y_guardar(ruta, salida)


if __name__ == "__main__":
    main()
