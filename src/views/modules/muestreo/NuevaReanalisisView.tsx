import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Header } from '@/components/layout/Header'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { listarSolicitudesElegiblesReanalisis } from '@/features/tomaMuestras'
import type { Solicitud } from '@/features/tomaMuestras'
import { rutaTomaMuestrasReanalisis } from '@/constants/routes'
import { formatDateCL } from '@/lib/locale'
import styles from './NuevaReanalisisView.module.css'

export function NuevaReanalisisView() {
  const navigate = useNavigate()
  const [solicitudes, setSolicitudes] = useState<Solicitud[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busqueda, setBusqueda] = useState('')

  useEffect(() => {
    listarSolicitudesElegiblesReanalisis()
      .then(setSolicitudes)
      .catch(() => setError('No se pudo cargar el listado de solicitudes elegibles.'))
  }, [])

  const filtradas = (solicitudes ?? []).filter((s) => {
    const q = busqueda.toLowerCase()
    return (
      !q ||
      s.numero_solicitud.toLowerCase().includes(q) ||
      (s.sold_to ?? '').toLowerCase().includes(q) ||
      (s.ship_to ?? '').toLowerCase().includes(q) ||
      (s.especie ?? '').toLowerCase().includes(q) ||
      (s.laboratorio ?? '').toLowerCase().includes(q)
    )
  })

  return (
    <div>
      <Header
        title="Nueva solicitud de reanálisis"
        description="Selecciona la solicitud original sobre la que se solicita el reanálisis. Solo se muestran solicitudes enviadas y sin reanálisis previo."
      />

      <Card>
        {error && <p className={styles.error}>{error}</p>}

        {solicitudes === null && !error && (
          <p className={styles.estado}>Cargando solicitudes elegibles…</p>
        )}

        {solicitudes !== null && (
          <>
            <div className={styles.buscador}>
              <input
                type="search"
                placeholder="Buscar por N° solicitud, cliente, planta, especie o laboratorio…"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                className={styles.inputBusqueda}
              />
            </div>

            {filtradas.length === 0 ? (
              <p className={styles.estado}>
                {busqueda
                  ? 'No hay solicitudes que coincidan con la búsqueda.'
                  : 'No hay solicitudes elegibles para reanálisis. Una solicitud debe estar enviada y no tener reanálisis previo.'}
              </p>
            ) : (
              <div className={styles.tabla}>
                <table>
                  <thead>
                    <tr>
                      <th>N° Solicitud</th>
                      <th>Fecha</th>
                      <th>Laboratorio</th>
                      <th>Cliente</th>
                      <th>Planta</th>
                      <th>Especie</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtradas.map((s) => (
                      <tr key={s.archivo}>
                        <td className={styles.folio}>{s.numero_solicitud}</td>
                        <td>{formatDateCL(s.fecha_solicitud)}</td>
                        <td>{s.laboratorio}</td>
                        <td>{s.sold_to || '—'}</td>
                        <td>{s.ship_to || '—'}</td>
                        <td>{s.especie || '—'}</td>
                        <td>
                          <Button
                            onClick={() => navigate(rutaTomaMuestrasReanalisis(s.archivo))}
                          >
                            Solicitar reanálisis
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  )
}
