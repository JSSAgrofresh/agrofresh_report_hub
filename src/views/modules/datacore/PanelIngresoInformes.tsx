import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { panelIngreso, ultimoSondeo } from '@/features/correoInformes'
import type { EstadoInforme, DecisionInforme, PanelIngreso, UltimoSondeo } from '@/features/correoInformes'
import { AuditoriaHero } from '@/views/modules/auditoria-interna/AuditoriaHero'
import { BandejaCorreo } from './BandejaCorreo'
import type { FiltroInicialBandeja } from './BandejaCorreo'
import { BarraRevision } from './BarraRevision'
import { PorHacer } from './PorHacer'
import { ResumenIngreso } from './ResumenIngreso'
import type { DestinoIngreso } from './ResumenIngreso'
import { SolicitudesIngreso } from './SolicitudesIngreso'
import styles from './PanelIngresoInformes.module.css'

type Pestana = 'porhacer' | 'resumen' | 'informes' | 'solicitudes' | 'carga'

const PERIODOS = [30, 60, 90]

/**
 * Ingreso de informes (lo ve el administrador principal): un panel con las cifras del día, los informes que
 * llegaron al correo, las solicitudes que faltan y la carga manual de siempre.
 */
export function PanelIngresoInformes({ cargaManual }: { cargaManual: ReactNode }) {
  const [pestana, setPestana] = useState<Pestana>('porhacer')
  const [dias, setDias] = useState(60)
  const [panel, setPanel] = useState<PanelIngreso | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ultimo, setUltimo] = useState<UltimoSondeo | null>(null)
  const [version, setVersion] = useState(0)
  // Cada vez que se toca una cifra del resumen, la pestaña de destino se arma de nuevo con ese filtro.
  const [destino, setDestino] = useState<{ clave: number; informes: FiltroInicialBandeja; solicitud?: string }>({ clave: 0, informes: {} })

  useEffect(() => {
    let vigente = true
    panelIngreso(dias)
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
  }, [dias, version])

  const leerUltimo = useCallback(async () => {
    const s = await ultimoSondeo()
    setUltimo(s)
    return s
  }, [])
  const recargar = useCallback(() => setVersion((v) => v + 1), [])

  function ir(d: DestinoIngreso) {
    setDestino((previo) => ({
      clave: previo.clave + 1,
      informes: d.pestana === 'informes' ? { estado: d.estado as EstadoInforme | undefined, decision: d.decision as DecisionInforme | undefined } : {},
      solicitud: d.pestana === 'solicitudes' ? d.estado : undefined,
    }))
    setPestana(d.pestana)
  }

  function verInforme(nro: string) {
    setDestino((previo) => ({ clave: previo.clave + 1, informes: { q: nro }, solicitud: undefined }))
    setPestana('informes')
  }

  const pestanas: { id: Pestana; etiqueta: string; conteo?: number }[] = [
    { id: 'porhacer', etiqueta: 'Por hacer', conteo: panel?.kpis.pendientes },
    { id: 'resumen', etiqueta: 'Resumen' },
    { id: 'informes', etiqueta: 'Todos los informes' },
    { id: 'solicitudes', etiqueta: 'Solicitudes', conteo: panel?.kpis.esperando },
    { id: 'carga', etiqueta: 'Carga manual' },
  ]

  return (
    <div className={styles.pagina}>
      <AuditoriaHero
        etiqueta="Ingreso de informes"
        titulo="Informes de laboratorio"
        descripcion="Acepta, rechaza y da seguimiento a los informes que llegan al correo; las cifras y la demora de los laboratorios están en Resumen."
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
        {pestana === 'resumen' && (
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
        {pestana === 'porhacer' && <PorHacer version={version} onCambio={recargar} onVerDetalle={verInforme} />}
        {pestana === 'resumen' && <ResumenIngreso panel={panel} error={error} onIr={ir} />}
        {pestana === 'informes' && <BandejaCorreo key={destino.clave} version={version} inicial={destino.informes} onCambio={recargar} />}
        {pestana === 'solicitudes' && (
          <SolicitudesIngreso
            key={destino.clave}
            panel={panel}
            filtroInicial={destino.solicitud as 'esperando' | undefined}
            onVerInforme={verInforme}
          />
        )}
        {pestana === 'carga' && cargaManual}
      </div>
    </div>
  )
}
