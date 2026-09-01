import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { descargarDetalleGCExcel } from '@/features/emitir'
import type { DetalleGC, MuestraGCDetalle } from '@/features/emitir'
import styles from './DetalleGCModal.module.css'

type Hoja = 'cabecera' | 'completos' | 'porVial'

/** Los compuestos en el orden en que aparecen en el reporte, que es el orden
 * del método del equipo — no alfabético, que a nadie le sirve. */
function compuestosEnOrden(muestras: MuestraGCDetalle[]): string[] {
  const vistos: string[] = []
  for (const m of muestras) {
    for (const r of m.resultados) if (!vistos.includes(r.analito)) vistos.push(r.analito)
  }
  return vistos
}

const num = (v: number | null | undefined) =>
  v === null || v === undefined ? '—' : v.toLocaleString('es-CL', { maximumFractionDigits: 6 })

/**
 * El archivo del GC visto como planilla, igual que lo hacía el convertidor
 * HTML que se usaba antes.
 *
 * Dos hojas: el reporte tal como sale del equipo —una fila por compuesto de
 * cada vial— y el resumen por vial. Aquel convertidor sacaba el resumen en dos
 * hojas separadas, una de área y otra de ppm; acá van juntas, porque leer un
 * vial obligaba a saltar entre hojas para comparar su concentración contra su
 * área, que es exactamente lo que se hace al revisar una corrida.
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
  const { cabecera, muestras } = detalle
  const [hoja, setHoja] = useState<Hoja>('cabecera')
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

          <label className={styles.filtro} hidden={hoja === 'cabecera'}>
            <input
              type="checkbox"
              checked={soloMuestras}
              onChange={(e) => setSoloMuestras(e.target.checked)}
            />
            Ocultar curvas, blancos y controles
          </label>
        </div>

        <div className={styles.tablaCaja}>
          {hoja === 'cabecera' ? (
            <table className={styles.tabla}>
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
                    <td className={styles.vacio}>
                      El archivo no trae la cabecera con la configuración del equipo.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
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
                  <th>Vial</th>
                  <th>Tipo</th>
                  {compuestos.map((c) => (
                    <th key={c} colSpan={2} className={styles.grupo}>
                      {c}
                    </th>
                  ))}
                </tr>
                <tr>
                  <th /><th /><th />
                  {compuestos.map((c) => [
                    <th key={`${c}-ppm`} className={styles.num}>ppm</th>,
                    <th key={`${c}-area`} className={styles.num}>área</th>,
                  ])}
                </tr>
              </thead>
              <tbody>
                {visibles.map((m) => {
                  const porAnalito = new Map(m.resultados.map((r) => [r.analito, r]))
                  return (
                    <tr key={`${m.seq_line}-${m.codigo}`} className={m.es_muestra ? undefined : styles.control}>
                      <td className={styles.num}>{m.seq_line ?? '—'}</td>
                      <td className={styles.mono}>{m.codigo}</td>
                      <td className={styles.tipo}>{m.es_muestra ? 'Muestra' : 'Control'}</td>
                      {compuestos.map((c) => [
                        <td key={`${c}-ppm`} className={styles.num}>{num(porAnalito.get(c)?.amount)}</td>,
                        <td key={`${c}-area`} className={styles.numTenue}>{num(porAnalito.get(c)?.area)}</td>,
                      ])}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        <footer className={styles.pie}>
          <span className={styles.conteo}>
            {hoja === 'cabecera'
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
