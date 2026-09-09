import { useMemo, useState } from 'react'
import agrofreshLogo from '@/assets/agrofresh-logo.png'
import { Button } from '@/components/ui/Button'
import { descargarDetalleGCExcel } from '@/features/emitir'
import type { DetalleGC, MuestraGCDetalle, ResultadoAnalito } from '@/features/emitir'
import { VisorGC } from './VisorGC'
import styles from './DetalleGCModal.module.css'

type Hoja = 'archivo' | 'cabecera' | 'completos' | 'porVial'

/** Los compuestos en el orden en que aparecen en el reporte, que es el orden
 * del método del equipo — no alfabético, que a nadie le sirve. */
function compuestosEnOrden(muestras: MuestraGCDetalle[]): string[] {
  const vistos: string[] = []
  for (const m of muestras) {
    for (const r of m.resultados) if (!vistos.includes(r.analito)) vistos.push(r.analito)
  }
  return vistos
}

/** El mismo título que encabeza la primera hoja del Excel. La vista previa y
 * el archivo descargado tienen que verse igual: si no, quien revisa en
 * pantalla y quien abre el Excel no están mirando lo mismo. */
const TITULO = 'RESULTADOS DE ANÁLISIS CROMATOGRÁFICOS'

const num = (v: number | null | undefined) =>
  v === null || v === undefined ? '—' : v.toLocaleString('es-CL', { maximumFractionDigits: 6 })

/** Lo que se muestra de cada compuesto en la vista por vial, en el mismo orden
 * que las columnas del Excel (ver COLUMNAS_POR_COMPUESTO en emitir.py). El
 * tiempo de retención va pegado a la concentración: es lo que confirma que el
 * pico integrado es el del compuesto y no el de un vecino. */
const COLUMNAS_POR_COMPUESTO = [
  { clave: 'ppm', titulo: 'ppm', valor: (r?: ResultadoAnalito) => r?.amount, tenue: false },
  { clave: 'rt', titulo: 'tiempo ret.', valor: (r?: ResultadoAnalito) => r?.rettime, tenue: false },
  { clave: 'area', titulo: 'área', valor: (r?: ResultadoAnalito) => r?.area, tenue: true },
] as const

/**
 * El archivo del GC visto como planilla, igual que lo hacía el convertidor
 * HTML que se usaba antes.
 *
 * Dos hojas: el reporte tal como sale del equipo —una fila por compuesto de
 * cada vial— y el resumen por vial, con ppm, tiempo de retención y área de
 * cada compuesto. Aquel convertidor sacaba el resumen en dos hojas separadas,
 * una de área y otra de ppm; acá van juntas, porque leer un vial obligaba a
 * saltar entre hojas para comparar su concentración contra su área, que es
 * exactamente lo que se hace al revisar una corrida.
 *
 * No se edita nada: es una vista para mirar y, si hace falta, bajar a Excel.
 */
export function DetalleGCModal({
  detalle,
  nombreArchivo,
  onCerrar,
}: {
  detalle: DetalleGC
  nombreArchivo: string | null
  onCerrar: () => void
}) {
  const { cabecera, muestras, texto, regiones, categorias } = detalle
  // Con el archivo a la vista se parte por ahí: es de dónde salen los números
  // de las otras pestañas, y de un vistazo se ve qué trae el reporte.
  const hayVisor = Boolean(texto && regiones?.length && categorias?.length)
  const [hoja, setHoja] = useState<Hoja>(hayVisor ? 'archivo' : 'cabecera')
  const [soloMuestras, setSoloMuestras] = useState(false)
  const [bajando, setBajando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const compuestos = useMemo(() => compuestosEnOrden(muestras), [muestras])
  const visibles = useMemo(
    () => (soloMuestras ? muestras.filter((m) => m.es_muestra) : muestras),
    [muestras, soloMuestras],
  )
  const cuantasMuestras = useMemo(() => muestras.filter((m) => m.es_muestra).length, [muestras])

  const filasLargas = useMemo(
    () => visibles.flatMap((m) => m.resultados.map((r) => ({ m, r }))),
    [visibles],
  )

  async function bajarExcel() {
    setBajando(true)
    setError(null)
    try {
      const { blob, nombre } = await descargarDetalleGCExcel(detalle)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = nombre ?? 'Resultados_GC.xlsx'
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      setError('No se pudo generar el Excel.')
    } finally {
      setBajando(false)
    }
  }

  return (
    <div className={styles.fondo} onClick={onCerrar}>
      <div className={styles.caja} onClick={(e) => e.stopPropagation()}>
        <header className={styles.cabecera}>
          <div>
            <h3>Detalle del archivo del GC</h3>
            <p className={styles.subtitulo}>
              {nombreArchivo ?? 'Reporte del GC'} · {muestras.length} vial(es), {cuantasMuestras} de
              cliente · {compuestos.length} compuesto(s)
            </p>
          </div>
          <button type="button" className={styles.cerrar} onClick={onCerrar} aria-label="Cerrar">
            ✕
          </button>
        </header>

        <div className={styles.barra}>
          <div className={styles.pestanas} role="tablist">
            {hayVisor && (
              <button
                type="button"
                role="tab"
                aria-selected={hoja === 'archivo'}
                className={hoja === 'archivo' ? styles.pestanaActiva : styles.pestana}
                onClick={() => setHoja('archivo')}
              >
                Archivo del GC
              </button>
            )}
            <button
              type="button"
              role="tab"
              aria-selected={hoja === 'cabecera'}
              className={hoja === 'cabecera' ? styles.pestanaActiva : styles.pestana}
              onClick={() => setHoja('cabecera')}
            >
              Información del GC
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={hoja === 'completos'}
              className={hoja === 'completos' ? styles.pestanaActiva : styles.pestana}
              onClick={() => setHoja('completos')}
            >
              Datos completos
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={hoja === 'porVial'}
              className={hoja === 'porVial' ? styles.pestanaActiva : styles.pestana}
              onClick={() => setHoja('porVial')}
            >
              Área y PPM por vial
            </button>
          </div>

          <label className={styles.filtro} hidden={hoja === 'cabecera' || hoja === 'archivo'}>
            <input
              type="checkbox"
              checked={soloMuestras}
              onChange={(e) => setSoloMuestras(e.target.checked)}
            />
            Ocultar curvas, blancos y controles
          </label>
        </div>

        <div className={styles.tablaCaja}>
          {hoja === 'archivo' ? (
            <VisorGC texto={texto ?? ''} regiones={regiones ?? []} categorias={categorias ?? []} />
          ) : hoja === 'cabecera' ? (
            <>
            <div className={styles.membrete}>
              <img src={agrofreshLogo} alt="AgroFresh" className={styles.logo} />
              <span className={styles.titulo}>{TITULO}</span>
            </div>
            <table className={styles.tabla}>
              <thead>
                <tr>
                  <th>Sección</th>
                  <th>Campo</th>
                  <th>Valor</th>
                </tr>
              </thead>
              <tbody>
                {cabecera.map((c, i) => {
                  const abreSeccion = i === 0 || cabecera[i - 1].seccion !== c.seccion
                  return (
                    <tr key={`${c.seccion}-${c.campo}-${i}`}>
                      <td className={styles.seccion}>{abreSeccion ? c.seccion : ''}</td>
                      <td className={styles.campo}>{c.campo}</td>
                      <td className={styles.valorLargo}>{c.valor || '—'}</td>
                    </tr>
                  )
                })}
                {cabecera.length === 0 && (
                  <tr>
                    <td className={styles.vacio} colSpan={3}>
                      El archivo no trae la cabecera con la configuración del equipo.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            </>
          ) : hoja === 'completos' ? (
            <table className={styles.tabla}>
              <thead>
                <tr>
                  <th>Vial</th>
                  <th>Tipo</th>
                  <th className={styles.num}>Seq</th>
                  <th>Fecha inyección</th>
                  <th className={styles.num}>RetTime</th>
                  <th className={styles.num}>Área</th>
                  <th className={styles.num}>ppm</th>
                  <th>Compuesto</th>
                </tr>
              </thead>
              <tbody>
                {filasLargas.map(({ m, r }, i) => (
                  <tr key={`${m.codigo}-${r.analito}-${i}`} className={m.es_muestra ? undefined : styles.control}>
                    <td className={styles.mono}>{m.codigo}</td>
                    <td className={styles.tipo}>{m.es_muestra ? 'Muestra' : 'Control'}</td>
                    <td className={styles.num}>{m.seq_line ?? '—'}</td>
                    <td className={styles.mono}>{m.fecha_inyeccion ?? '—'}</td>
                    <td className={styles.num}>{num(r.rettime)}</td>
                    <td className={styles.num}>{num(r.area)}</td>
                    <td className={styles.num}>{num(r.amount)}</td>
                    <td>{r.analito}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table className={styles.tabla}>
              <thead>
                <tr>
                  <th className={styles.num}>Seq</th>
                  <th>Ubicación de la muestra</th>
                  <th>Vial</th>
                  <th>Tipo</th>
                  {compuestos.map((c) => (
                    <th key={c} colSpan={COLUMNAS_POR_COMPUESTO.length} className={styles.grupo}>
                      {c}
                    </th>
                  ))}
                </tr>
                <tr>
                  <th /><th /><th /><th />
                  {compuestos.map((c) =>
                    COLUMNAS_POR_COMPUESTO.map((col) => (
                      <th key={`${c}-${col.clave}`} className={styles.num}>
                        {col.titulo}
                      </th>
                    )),
                  )}
                </tr>
              </thead>
              <tbody>
                {visibles.map((m) => {
                  const porAnalito = new Map(m.resultados.map((r) => [r.analito, r]))
                  return (
                    <tr key={`${m.seq_line}-${m.codigo}`} className={m.es_muestra ? undefined : styles.control}>
                      <td className={styles.num}>{m.seq_line ?? '—'}</td>
                      <td className={styles.mono}>{m.ubicacion ?? '—'}</td>
                      <td className={styles.mono}>{m.codigo}</td>
                      <td className={styles.tipo}>{m.es_muestra ? 'Muestra' : 'Control'}</td>
                      {compuestos.map((c) =>
                        COLUMNAS_POR_COMPUESTO.map((col) => (
                          <td
                            key={`${c}-${col.clave}`}
                            className={col.tenue ? styles.numTenue : styles.num}
                          >
                            {num(col.valor(porAnalito.get(c)))}
                          </td>
                        )),
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        <footer className={styles.pie}>
          <span className={styles.conteo}>
            {hoja === 'archivo'
              ? `${(texto ? texto.split('\n').length : 0).toLocaleString('es-CL')} línea(s) · ${regiones?.length ?? 0} tramo(s)`
              : hoja === 'cabecera'
              ? `${cabecera.length} campo(s)`
              : hoja === 'completos'
              ? `${filasLargas.length.toLocaleString('es-CL')} fila(s)`
              : `${visibles.length} vial(es)`}
          </span>
          {error && <span className={styles.error}>{error}</span>}
          <Button onClick={() => void bajarExcel()} disabled={bajando}>
            {bajando ? 'Generando…' : 'Descargar Excel'}
          </Button>
        </footer>
      </div>
    </div>
  )
}
