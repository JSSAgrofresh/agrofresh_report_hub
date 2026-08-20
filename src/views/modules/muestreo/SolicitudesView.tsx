import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Header } from '@/components/layout/Header'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { useAuth } from '@/features/auth'
import { esAdminGeneral } from '@/features/usuarios'
import { ROUTES } from '@/constants/routes'
import { formatDateCL } from '@/lib/locale'
import { eliminarSolicitud, listarSolicitudes } from '@/features/tomaMuestras'
import type { Solicitud } from '@/features/tomaMuestras'
import { SolicitudDetalleModal } from './SolicitudDetalleModal'
import styles from './SolicitudesView.module.css'

export function SolicitudesView() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const puedeEliminar = Boolean(user && esAdminGeneral(user))

  const [solicitudes, setSolicitudes] = useState<Solicitud[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [seleccionada, setSeleccionada] = useState<Solicitud | null>(null)

  const refrescar = useCallback(async () => {
    try {
      const resultado = await listarSolicitudes()
      setSolicitudes(resultado)
      setError(null)
    } catch {
      setError('No se pudo conectar con el backend.')
    }
  }, [])

  useEffect(() => {
    refrescar()
  }, [refrescar])

  async function onEliminar(solicitud: Solicitud) {
    if (!confirm(`¿Eliminar la solicitud "${solicitud.numero_solicitud}"? Esta acción no se puede deshacer.`)) return
    try {
      await eliminarSolicitud(solicitud.archivo)
      await refrescar()
    } catch {
      setError('No se pudo eliminar la solicitud.')
    }
  }

  return (
    <div>
      <Header
        title="Solicitudes de muestreo"
        description="Listado de todas las solicitudes registradas."
        acciones={<Button onClick={() => navigate(ROUTES.tomaMuestrasNueva)}>+ Nueva solicitud</Button>}
      />

      <Card>
        {error && <p className={styles.error}>{error}</p>}

        {solicitudes === null ? (
          <p className={styles.estado}>Cargando…</p>
        ) : solicitudes.length === 0 ? (
          <p className={styles.estado}>Todavía no hay solicitudes registradas.</p>
        ) : (
          <>
            <div className={styles.cabeceraTabla}>
              <p className={styles.contador}>
                {solicitudes.length} solicitud{solicitudes.length === 1 ? '' : 'es'}
              </p>
            </div>
            <div className={styles.tablaCaja}>
              <table className={styles.tabla}>
                <thead>
                  <tr>
                    <th>N° Solicitud</th>
                    <th>Fecha</th>
                    <th>Laboratorio</th>
                    <th>Sold To</th>
                    <th>Ship To</th>
                    <th>Especie</th>
                    <th>Tipo Muestra</th>
                    <th>Generado por</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {solicitudes.map((s) => (
                    <tr key={s.archivo}>
                      <td className={styles.nombre}>{s.numero_solicitud}</td>
                      <td>{formatDateCL(s.fecha_solicitud)}</td>
                      <td>{s.laboratorio}</td>
                      <td>{s.sold_to}</td>
                      <td>{s.ship_to ?? '—'}</td>
                      <td>{s.especie ?? '—'}</td>
                      <td>{s.tipo_muestra ?? '—'}</td>
                      <td>{s.generado_por}</td>
                      <td className={styles.acciones}>
                        <button className={styles.boton} onClick={() => setSeleccionada(s)}>
                          Ver
                        </button>
                        {puedeEliminar && (
                          <button className={styles.botonEliminar} onClick={() => onEliminar(s)}>
                            Eliminar
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>

      {seleccionada && <SolicitudDetalleModal solicitud={seleccionada} onCerrar={() => setSeleccionada(null)} />}
    </div>
  )
}
