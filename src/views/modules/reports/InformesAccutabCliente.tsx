import { useEffect, useMemo, useState } from 'react'
import { Card } from '@/components/ui/Card'
import { EstadoModulo } from '@/components/ui/EstadoModulo'
import { Skeleton } from '@/components/ui/Skeleton'
import {
  FILTRO_CARGAS_VACIO,
  descargarPdfCliente,
  fechaDeCarga,
  fechaDeCarpeta,
  filtrarCargas,
  listarInformesCliente,
  nombreEquipo,
  opcionesDeCampo,
  verPdfCliente,
} from '@/features/postventa'
import type { Periodo, ResumenCargaTrace } from '@/features/postventa'
import styles from './InformesAccutabCliente.module.css'

const PERIODOS: { valor: Periodo; texto: string }[] = [
  { valor: 'todo', texto: 'Todos' },
  { valor: '365', texto: 'Últimos 12 meses' },
  { valor: '90', texto: 'Últimos 90 días' },
  { valor: '30', texto: 'Últimos 30 días' },
]

const POR_PAGINA = 12

function num(v: number | null | undefined, dec: number): string {
  if (v == null || Number.isNaN(v)) return '—'
  return v.toLocaleString('es-CL', { minimumFractionDigits: dec, maximumFractionDigits: dec })
}

/** «2026-10» -> «Octubre 2026». */
function nombreMes(aaaaMm: string): string {
  const [a, m] = aaaaMm.split('-').map(Number)
  const t = new Date(a, m - 1, 1).toLocaleDateString('es-CL', { month: 'long', year: 'numeric' })
  return t.charAt(0).toUpperCase() + t.slice(1)
}

/**
 * Portal de cliente: todos los informes Accu-Tab de su cuenta, agrupados por mes,
 * con lo esencial de cada uno y un botón para verlo o bajarlo. El servidor ya
 * entrega solo lo de esta cuenta; acá solo se filtra y se ordena.
 */
export function InformesAccutabCliente() {
  const [informes, setInformes] = useState<ResumenCargaTrace[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [periodo, setPeriodo] = useState<Periodo>('todo')
  const [posicion, setPosicion] = useState('')
  const [visibles, setVisibles] = useState(POR_PAGINA)

  useEffect(() => {
    let vigente = true
    listarInformesCliente()
      .then((l) => vigente && setInformes(l))
      .catch(() => {
        if (!vigente) return
        setInformes([])
        setError('No pudimos cargar tus informes. Intenta de nuevo en unos minutos.')
      })
    return () => {
      vigente = false
    }
  }, [])

  const posiciones = useMemo(() => opcionesDeCampo(informes ?? [], 'ubicacion'), [informes])
  const filtrados = useMemo(
    () => filtrarCargas(informes ?? [], { ...FILTRO_CARGAS_VACIO, periodo, ubicacion: posicion }),
    [informes, periodo, posicion],
  )
  const mostrados = filtrados.slice(0, visibles)
  const porMes = useMemo(() => {
    const grupos = new Map<string, ResumenCargaTrace[]>()
    mostrados.forEach((c) => {
      const mes = (fechaDeCarga(c) ?? '').slice(0, 7)
      grupos.set(mes, [...(grupos.get(mes) ?? []), c])
    })
    return [...grupos.entries()]
  }, [mostrados])

  if (informes === null) return <Skeleton />

  return (
    <section className={styles.wrap} aria-label="Tus informes Accu-Tab">
      <div className={styles.cabecera}>
        <h2 className={styles.titulo}>Tus informes Accu-Tab</h2>
        <p className={styles.nota}>
          Cada informe resume las mediciones de pH y ORP de tu equipo. Ábrelo para verlo o descárgalo en PDF.
        </p>
      </div>

      {error && <p className={styles.error}>{error}</p>}

      {informes.length === 0 && !error ? (
        <EstadoModulo
          etiqueta="Sin informes todavía"
          titulo="Aún no hay informes disponibles"
          descripcion="Cuando tu equipo Accu-Tab envíe sus mediciones, el informe aparecerá aquí automáticamente."
        />
      ) : (
        <>
          <div className={styles.filtros}>
            <div className={styles.segmentos} role="group" aria-label="Período">
              {PERIODOS.map((p) => (
                <button
                  key={p.valor}
                  type="button"
                  aria-pressed={periodo === p.valor}
                  className={periodo === p.valor ? styles.segmentoActivo : undefined}
                  onClick={() => {
                    setPeriodo(p.valor)
                    setVisibles(POR_PAGINA)
                  }}
                >
                  {p.texto}
                </button>
              ))}
            </div>
            {posiciones.length > 1 && (
              <label className={styles.campo}>
                <span>Posición de muestreo</span>
                <select
                  value={posicion}
                  onChange={(e) => {
                    setPosicion(e.target.value)
                    setVisibles(POR_PAGINA)
                  }}
                >
                  <option value="">Todas</option>
                  {posiciones.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>

          {filtrados.length === 0 && <Card className={styles.vacio}>No hay informes con ese filtro.</Card>}

          {porMes.map(([mes, lista]) => (
            <div key={mes} className={styles.mes}>
              <h3 className={styles.mesTitulo}>{mes ? nombreMes(mes) : 'Sin fecha'}</h3>
              <div className={styles.grilla}>
                {lista.map((c) => (
                  <Card key={c.carpeta} className={styles.informe}>
                    <div className={styles.fecha}>{fechaDeCarpeta(c.carpeta)}</div>
                    <div className={styles.donde}>
                      {[c.planta, c.ubicacion].filter(Boolean).join(' · ') ||
                        (c.equipo ? nombreEquipo(c.equipo) : 'Equipo Accu-Tab')}
                    </div>
                    <div className={styles.cifras}>
                      <span>
                        <b>{num(c.ph_promedio, 2)}</b> pH promedio
                      </span>
                      <span>
                        <b>{num(c.mv_promedio, 0)}</b> mV promedio
                      </span>
                      <span>
                        <b>{c.n_registros.toLocaleString('es-CL')}</b> lecturas
                      </span>
                    </div>
                    <div className={styles.acciones}>
                      <button type="button" className={styles.ver} onClick={() => void verPdfCliente(c.carpeta)}>
                        Ver informe
                      </button>
                      <button type="button" className={styles.bajar} onClick={() => void descargarPdfCliente(c.carpeta)}>
                        Descargar PDF
                      </button>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          ))}

          {filtrados.length > visibles && (
            <button type="button" className={styles.verMas} onClick={() => setVisibles((v) => v + POR_PAGINA)}>
              Ver más informes ({filtrados.length - visibles} restantes)
            </button>
          )}
        </>
      )}
    </section>
  )
}
