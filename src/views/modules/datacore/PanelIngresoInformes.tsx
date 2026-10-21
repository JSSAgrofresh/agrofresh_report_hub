import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { panelIngreso, ultimoSondeo } from '@/features/correoInformes'
import type { PanelIngreso, UltimoSondeo } from '@/features/correoInformes'
import { AuditoriaHero } from '@/views/modules/auditoria-interna/AuditoriaHero'
import { BandejaCorreo } from './BandejaCorreo'
import type { FiltroInicialBandeja } from './BandejaCorreo'
import { BarraRevision } from './BarraRevision'
import { TableroIngreso } from './TableroIngreso'
import styles from './PanelIngresoInformes.module.css'

type Pestana = 'tablero' | 'informes' | 'carga'

const PERIODOS = [30, 60, 90]

/**
 * Ingreso de informes (lo ve el administrador principal): un tablero de trabajo con todo a la vista, la lista
 * completa de informes del correo para buscar y la carga manual de siempre.
 */
export function PanelIngresoInformes({ cargaManual }: { cargaManual: ReactNode }) {
  const [pestana, setPestana] = useState<Pestana>('tablero')
  const [dias, setDias] = useState(60)
  const [laboratorios, setLaboratorios] = useState<string[]>([])
  const [panel, setPanel] = useState<PanelIngreso | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ultimo, setUltimo] = useState<UltimoSondeo | null>(null)
  const [version, setVersion] = useState(0)
  const [busqueda, setBusqueda] = useState<{ clave: number; informes: FiltroInicialBandeja }>({ clave: 0, informes: {} })

  useEffect(() => {
    let vigente = true
    panelIngreso(dias, laboratorios)
      .then((p) => {
        if (!vigente) return
        setPanel(p)
        setError(null)
      })
      .catch((e: unknown) => {
        if (vigente) setError(e instanceof Error ? e.message : 'No se pudo leer el panel.')
      })
    ultimoSondeo()
      .then((s) => {
        if (vigente) setUltimo(s)
      })
      .catch(() => undefined)
    return () => {
      vigente = false
    }
  }, [dias, laboratorios, version])

  const leerUltimo = useCallback(async () => {
    const s = await ultimoSondeo()
    setUltimo(s)
    return s
  }, [])
  const recargar = useCallback(() => setVersion((v) => v + 1), [])

  function verInforme(nro: string) {
    setBusqueda((previo) => ({ clave: previo.clave + 1, informes: { q: nro } }))
    setPestana('informes')
  }

  const pestanas: { id: Pestana; etiqueta: string; conteo?: number }[] = [
    { id: 'tablero', etiqueta: 'Tablero', conteo: panel?.kpis.pendientes },
    { id: 'informes', etiqueta: 'Todos los informes' },
    { id: 'carga', etiqueta: 'Carga manual' },
  ]

  return (
    <div className={styles.pagina}>
      <AuditoriaHero
        etiqueta="Ingreso de informes"
        titulo="Informes de laboratorio"
        descripcion="Lo que falta por llegar, lo que se puede aceptar, los envíos que salieron mal y cuánto demoran los laboratorios, todo en un solo tablero."
        tono="azul"
      />

      {pestana !== 'carga' && <BarraRevision ultimo={ultimo} leerUltimo={leerUltimo} onTerminada={recargar} />}

      <div className={styles.barra}>
        <div className={styles.pestanas} role="tablist" aria-label="Secciones de Ingreso de informes">
          {pestanas.map((p) => (
            <button
              key={p.id}
              type="button"
              role="tab"
              id={`tab-${p.id}`}
              aria-selected={pestana === p.id}
              aria-controls={`panel-${p.id}`}
              className={styles.pestana}
              onClick={() => setPestana(p.id)}
            >
              {p.etiqueta}
              {p.conteo ? <span className={styles.conteo}>{p.conteo}</span> : null}
            </button>
          ))}
        </div>
        {pestana === 'tablero' && (
          <label className={styles.periodo}>
            Período
            <select value={dias} onChange={(e) => setDias(Number(e.target.value))}>
              {PERIODOS.map((d) => (
                <option key={d} value={d}>
                  últimos {d} días
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <div role="tabpanel" id={`panel-${pestana}`} aria-labelledby={`tab-${pestana}`}>
        {pestana === 'tablero' && <TableroIngreso panel={panel} errorPanel={error} version={version} laboratorios={laboratorios} onLaboratorios={setLaboratorios} onCambio={recargar} onVerInforme={verInforme} />}
        {pestana === 'informes' && <BandejaCorreo key={busqueda.clave} version={version} inicial={busqueda.informes} onCambio={recargar} />}
        {pestana === 'carga' && cargaManual}
      </div>
    </div>
  )
}
