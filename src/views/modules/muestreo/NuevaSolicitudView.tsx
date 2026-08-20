import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Header } from '@/components/layout/Header'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { BuscableSelect } from '@/components/ui/BuscableSelect'
import { useAuth } from '@/features/auth'
import { listarAnalitos } from '@/features/reportes'
import { crearSolicitud } from '@/features/tomaMuestras'
import { ROUTES } from '@/constants/routes'
import { formatDateCL } from '@/lib/locale'
import styles from './NuevaSolicitudView.module.css'

export function NuevaSolicitudView() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [laboratoriosDisponibles, setLaboratoriosDisponibles] = useState<string[]>([])
  const [laboratorio, setLaboratorio] = useState('')
  const [tipoAplicacion, setTipoAplicacion] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    listarAnalitos()
      .then((analitos) => {
        const unicos = Array.from(new Set(analitos.map((a) => a.laboratorio))).sort()
        setLaboratoriosDisponibles(unicos)
      })
      .catch(() => setLaboratoriosDisponibles([]))
  }, [])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (!laboratorio.trim()) {
      setError('Selecciona un laboratorio.')
      return
    }
    if (!tipoAplicacion.trim()) {
      setError('Ingresa el tipo de aplicación.')
      return
    }

    setGuardando(true)
    try {
      await crearSolicitud({
        generado_por: user?.nombre ?? '',
        laboratorio: laboratorio.trim(),
        tipo_aplicacion: tipoAplicacion.trim(),
      })
      navigate(ROUTES.tomaMuestras)
    } catch {
      setError('No se pudo crear la solicitud. Revisa que el backend esté corriendo.')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div>
      <Header title="Nueva solicitud" description="Registra una nueva solicitud de muestreo." />

      <Card>
        <form className={styles.form} onSubmit={onSubmit}>
          <div className={styles.fila}>
            <label className={styles.campo}>
              <span>Fecha de solicitud</span>
              <input value={formatDateCL(new Date())} disabled />
            </label>
            <label className={styles.campo}>
              <span>Generado por</span>
              <input value={user?.nombre ?? ''} disabled required />
            </label>
          </div>

          <div className={styles.campo}>
            <BuscableSelect
              etiqueta="Laboratorio"
              opciones={laboratoriosDisponibles}
              valor={laboratorio}
              onChange={setLaboratorio}
              placeholderTodos="— elegir laboratorio —"
            />
          </div>

          <label className={styles.campo}>
            <span>Tipo de aplicación</span>
            <input
              value={tipoAplicacion}
              onChange={(e) => setTipoAplicacion(e.target.value)}
              placeholder="Ej. Foliar, Suelo, Poscosecha…"
              required
            />
          </label>

          {error && <p className={styles.error}>{error}</p>}

          <div className={styles.acciones}>
            <Button type="button" variant="secondary" onClick={() => navigate(ROUTES.tomaMuestras)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={guardando}>
              {guardando ? 'Guardando…' : 'Guardar'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}
