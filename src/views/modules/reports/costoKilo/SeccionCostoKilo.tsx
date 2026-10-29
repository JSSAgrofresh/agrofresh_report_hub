import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { Card } from '@/components/ui/Card'
import { IconArchivoPlano, IconClock, IconDatabase } from '@/components/ui/icons'
import {
  COLOR_LAMINA,
  COLOR_MANT,
  COLOR_TOTAL,
  activosConConsumo,
  colorDeActivo,
  descargarExcelCostoKilo,
  descargarPdfCostoKilo,
  fmt,
  nombreDeActivo,
  seriesDeDias,
  verCostoKilo,
} from '@/features/costoKilo'
import type { DetalleCostoKilo, ModoCostoKilo, ResumenCostoKilo } from '@/features/costoKilo'
import { fechaDeCarpeta } from '@/features/postventa'
import { Kpi } from '../Kpi'
import estilosReporte from '../ReporteView.module.css'
import botones from '../SeccionesReport.module.css'
import { CabeceraSeccion } from '../SeccionesReport'
import { GraficoCostoKilo } from './GraficoCostoKilo'
import styles from './SeccionCostoKilo.module.css'

export const ID_COSTO_KILO = 'costo-kilo'

const ICONO_BAJAR = (
  <svg viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M10 3v9m0 0-3.5-3.5M10 12l3.5-3.5M4 14v1.5A1.5 1.5 0 0 0 5.5 17h9a1.5 1.5 0 0 0 1.5-1.5V14" />
  </svg>
)

function titulo(r: ResumenCostoKilo): string {
  const donde = [r.cliente, r.planta, r.linea].filter(Boolean).join(' · ')
  return `${fechaDeCarpeta(r.carpeta)} · ${donde}${r.semanas ? ` · ${r.semanas}` : ''}`
}

/**
 * «Costo por kilo» (equipo C&M-500): cuánto producto se gastó cada día. El mismo bloque lo ven el equipo y el cliente
 * (que solo recibe lo de su planta, lo acota el servidor). Elige un informe y muestra sus dos gráficos, sus cifras y los
 * botones para bajar el PDF y el Excel.
 */
export function SeccionCostoKilo({
  informes,
  modo,
  numero,
  acento,
}: {
  informes: ResumenCostoKilo[]
  modo: ModoCostoKilo
  numero: number
  acento: string
}) {
  const [elegido, setElegido] = useState<string | null>(null)
  const actual = informes.find((i) => i.carpeta === elegido) ?? informes[0] ?? null
  const [detalle, setDetalle] = useState<{ carpeta: string; datos: DetalleCostoKilo } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [bajando, setBajando] = useState<'pdf' | 'excel' | null>(null)

  const carpeta = actual?.carpeta ?? null
  useEffect(() => {
    if (!carpeta) return
    let vigente = true
    verCostoKilo(modo, carpeta)
      .then((datos) => {
        if (!vigente) return
        setDetalle({ carpeta, datos })
        setError(null)
      })
      .catch(() => vigente && setError('No pudimos cargar este informe. Intenta de nuevo.'))
    return () => {
      vigente = false
    }
  }, [modo, carpeta])

  const datos = detalle && detalle.carpeta === carpeta ? detalle.datos : null
  const activos = useMemo(() => (datos ? activosConConsumo(datos) : []), [datos])
  const series = useMemo(() => (datos ? seriesDeDias(datos.resumen.dias, activos) : null), [datos, activos])

  async function bajar(tipo: 'pdf' | 'excel') {
    if (!carpeta) return
    setBajando(tipo)
    try {
      await (tipo === 'pdf' ? descargarPdfCostoKilo(modo, carpeta) : descargarExcelCostoKilo(modo, carpeta))
    } catch {
      setError(tipo === 'pdf' ? 'Este informe no tiene PDF.' : 'No pudimos generar el Excel. Intenta de nuevo.')
    } finally {
      setBajando(null)
    }
  }

  if (!actual) {
    if (modo !== 'equipo') return null
    return (
      <section className={styles.seccion} style={{ '--acento': acento } as CSSProperties} aria-label="Costo por kilo">
        <CabeceraSeccion id={ID_COSTO_KILO} titulo="Costo por kilo" numero={numero} acento={acento} laboratorios="Equipo C&M-500 · producto usado por día" />
        <Card className={styles.grafico}>
          <p className={styles.aviso}>Aún no hay informes de costo por kilo. Sube el primero en Trace → pestaña «Costo por kilo» y aparecerá aquí.</p>
        </Card>
      </section>
    )
  }
  const tot = datos?.resumen.totales

  return (
    <section className={styles.seccion} style={{ '--acento': acento } as CSSProperties} aria-label="Costo por kilo">
      <CabeceraSeccion id={ID_COSTO_KILO} titulo="Costo por kilo" numero={numero} acento={acento} laboratorios="Equipo C&M-500 · producto usado por día">
        <div className={`${botones.botones} ${styles.descargas}`}>
          <button type="button" className={`${botones.boton} ${botones.encendido}`} disabled={bajando !== null || !datos} onClick={() => void bajar('pdf')}>
            {ICONO_BAJAR}
            {bajando === 'pdf' ? 'Preparando…' : 'Informe PDF'}
          </button>
          <button type="button" className={`${botones.boton} ${botones.encendido}`} disabled={bajando !== null || !datos} onClick={() => void bajar('excel')}>
            {ICONO_BAJAR}
            {bajando === 'excel' ? 'Preparando…' : 'Excel'}
          </button>
        </div>
      </CabeceraSeccion>

      {informes.length > 1 && (
        <div className={styles.selector}>
          <label htmlFor="costo-kilo-informe">Informe</label>
          <select id="costo-kilo-informe" value={actual.carpeta} onChange={(e) => setElegido(e.target.value)}>
            {informes.map((i) => (
              <option key={i.carpeta} value={i.carpeta}>
                {titulo(i)}
              </option>
            ))}
          </select>
        </div>
      )}

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      <div className={estilosReporte.stats}>
        <Kpi icono={<IconArchivoPlano />} etiqueta="Fruta procesada" destacado tono={acento} sub={`${actual.dias} día${actual.dias === 1 ? '' : 's'} · ${actual.semanas ?? ''}`.trim()}>
          <span className={estilosReporte.statNum}>{fmt(tot?.kg ?? actual.kg_total, 0)} kg</span>
        </Kpi>
        <Kpi icono={<IconDatabase />} etiqueta="Solución madre" tono="#15627f" sub="litros en el período">
          <span className={estilosReporte.statNum}>{fmt(tot?.sm_total, 0)} L</span>
        </Kpi>
        <Kpi icono={<IconClock />} etiqueta="Período" tono="#16857a" sub={`${actual.lecturas?.toLocaleString('es-CL') ?? '—'} lecturas`}>
          <span className={estilosReporte.statNum}>{actual.desde && actual.hasta ? `${actual.desde.slice(5).split('-').reverse().join('-')} → ${actual.hasta.slice(5).split('-').reverse().join('-')}` : '—'}</span>
        </Kpi>
      </div>

      {datos && series && (
        <>
          {activos.length > 0 && (
            <ul className={styles.activos} aria-label="Producto usado por ingrediente activo">
              {activos.map((c) => (
                <li key={c} className={styles.activo} style={{ '--c': colorDeActivo(c, activos) } as CSSProperties}>
                  <i aria-hidden="true" />
                  <span>{nombreDeActivo(c, datos.nombres)}</span>
                  <b>{fmt(datos.resumen.totales.activos[c], 1)} L</b>
                  <span>· {fmt(datos.resumen.totales.ml_por_kg[c], 3)} ml/kg</span>
                </li>
              ))}
            </ul>
          )}

          <div className={styles.graficos}>
            <Card className={styles.grafico}>
              <GraficoCostoKilo
                titulo="Kg de fruta por día y solución madre del día"
                etiquetas={series.etiquetas}
                kg={series.kg}
                parciales={series.parciales}
                unidadLineas="litros de solución madre"
                lineas={[
                  { nombre: 'Solución madre: lámina', valores: series.lamina, color: COLOR_LAMINA },
                  { nombre: 'Solución madre: mantención', valores: series.mantencion, color: COLOR_MANT },
                  { nombre: 'Solución madre: total', valores: series.total, color: COLOR_TOTAL },
                ]}
              />
            </Card>
            {activos.length > 0 && (
              <Card className={styles.grafico}>
                <GraficoCostoKilo
                  titulo="Litros de producto comercial por día, según ingrediente activo"
                  etiquetas={series.etiquetas}
                  kg={series.kg}
                  parciales={series.parciales}
                  unidadLineas="litros de producto comercial"
                  decimales={2}
                  lineas={activos.map((c) => ({ nombre: `${nombreDeActivo(c, datos.nombres)} (litros)`, valores: series.activos[c], color: colorDeActivo(c, activos) }))}
                />
              </Card>
            )}
          </div>
          <p className={styles.aviso}>
            Cada punto es lo que se usó ese día (lo que subió el contador del equipo), no el acumulado. Los días con barra tenue son parciales: el primero, el último o
            los que tienen menos de 24 lecturas.
          </p>
        </>
      )}
    </section>
  )
}
