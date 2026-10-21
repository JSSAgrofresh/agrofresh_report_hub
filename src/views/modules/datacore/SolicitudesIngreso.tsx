import { useMemo, useState } from 'react'
import { dias, filtrarSolicitudes } from '@/features/correoInformes'
import type { EstadoSolicitud, FiltroSolicitudes, PanelIngreso } from '@/features/correoInformes'
import { fechaHoraCorta } from '@/features/notificaciones'
import styles from './SolicitudesIngreso.module.css'

type Filtro = FiltroSolicitudes

const FILTROS: { id: Filtro; etiqueta: string }[] = [
  { id: 'esperando', etiqueta: 'Esperando informe' },
  { id: 'recibido', etiqueta: 'Informe recibido' },
  { id: 'cargado', etiqueta: 'Cargado' },
  { id: 'rechazado', etiqueta: 'Rechazado' },
  { id: 'todas', etiqueta: 'Todas' },
]

const ETIQUETA: Record<EstadoSolicitud, string> = {
  esperando: 'Esperando',
  recibido: 'Informe recibido',
  cargado: 'Cargado',
  rechazado: 'Rechazado',
}

interface Props {
  panel: PanelIngreso | null
  /** Cuál se muestra al abrir (lo decide la cifra que se tocó en el resumen). */
  filtroInicial?: EstadoSolicitud
  onVerInforme: (nroInforme: string) => void
}

/** Las solicitudes que salieron al laboratorio, con su informe: cuáles faltan, cuáles llegaron y cuáles ya están cargadas. */
export function SolicitudesIngreso({ panel, filtroInicial, onVerInforme }: Props) {
  const [filtro, setFiltro] = useState<Filtro>(filtroInicial ?? 'esperando')
  const [texto, setTexto] = useState('')
  const todas = useMemo(() => panel?.solicitudes ?? [], [panel])
  const cuentas = useMemo(() => {
    const c: Record<Filtro, number> = { esperando: 0, recibido: 0, cargado: 0, rechazado: 0, todas: todas.length }
    for (const s of todas) c[s.estado] += 1
    return c
  }, [todas])
  const visibles = useMemo(() => filtrarSolicitudes(todas, filtro, texto), [todas, filtro, texto])

  return (
    <div className={styles.pagina}>
      <div className={styles.barra}>
        <div className={styles.vistas} role="group" aria-label="Estado de la solicitud">
          {FILTROS.map((f) => (
            <button key={f.id} type="button" className={styles.vista} aria-pressed={filtro === f.id} onClick={() => setFiltro(f.id)}>
              {f.etiqueta}
              <span className={styles.conteo}>{cuentas[f.id]}</span>
            </button>
          ))}
        </div>
        <input
          type="search"
          className={styles.buscador}
          placeholder="Buscar por OT, laboratorio, planta o informe"
          aria-label="Buscar solicitudes"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
        />
      </div>

      <div className={styles.tablaWrap}>
        <table className={styles.tabla}>
          <thead>
            <tr>
              <th>Solicitud</th>
              <th>Laboratorio</th>
              <th>Cliente y planta</th>
              <th>Salió al laboratorio</th>
              <th>Estado</th>
              <th>Demora</th>
              <th>Informe</th>
            </tr>
          </thead>
          <tbody>
            {visibles.length === 0 ? (
              <tr>
                <td colSpan={7} className={styles.vacio}>
                  {todas.length === 0 ? 'No hay solicitudes enviadas en este período.' : 'Ninguna solicitud coincide con lo que buscas.'}
                </td>
              </tr>
            ) : (
              visibles.map((s) => (
                <tr key={s.ot}>
                  <td><span className={styles.ot}>{s.ot}</span></td>
                  <td>{s.laboratorio ?? '—'}</td>
                  <td>
                    <div className={styles.doble}>
                      <span>{s.sold_to ?? '—'}</span>
                      <span className={styles.tenue}>{s.ship_to ?? ''}</span>
                    </div>
                  </td>
                  <td className={styles.nowrap}>{fechaHoraCorta(s.enviada_en)}</td>
                  <td><span className={`${styles.estado} ${styles[s.estado]}`}>{ETIQUETA[s.estado]}</span></td>
                  <td className={styles.nowrap}>
                    {s.estado === 'esperando' ? (
                      <span className={styles.espera}>lleva {dias(s.dias_esperando)}</span>
                    ) : (
                      dias(s.demora)
                    )}
                  </td>
                  <td>
                    {s.nro_informe ? (
                      <button type="button" className={styles.enlace} onClick={() => onVerInforme(s.nro_informe as string)}>
                        {s.nro_informe}
                      </button>
                    ) : (
                      <span className={styles.tenue}>—</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
