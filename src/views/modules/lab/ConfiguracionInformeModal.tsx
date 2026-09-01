import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { obtenerConfiguracionInforme, guardarConfiguracionInforme } from '@/features/emitir'
import type { InformeConfig } from '@/features/emitir'
import styles from './ConfiguracionInformeModal.module.css'

interface ConfiguracionInformeModalProps {
  onCerrar: () => void
}

const CONFIG_VACIA: InformeConfig = {
  analizado_por_nombre: '',
  analizado_por_cargo: '',
  aprobado_por_nombre: '',
  aprobado_por_cargo: '',
  incluir_analista: true,
}

export function ConfiguracionInformeModal({ onCerrar }: ConfiguracionInformeModalProps) {
  const [config, setConfig] = useState<InformeConfig | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [guardado, setGuardado] = useState(false)

  useEffect(() => {
    obtenerConfiguracionInforme()
      .then(setConfig)
      .catch(() => setError('No se pudo cargar la configuración.'))
  }, [])

  function actualizar(campo: keyof InformeConfig, valor: string | boolean) {
    setConfig((prev) => ({ ...(prev ?? CONFIG_VACIA), [campo]: valor }))
    setGuardado(false)
  }

  const conAnalista = config?.incluir_analista ?? true

  async function guardar() {
    if (!config) return
    setGuardando(true)
    setError(null)
    try {
      const guardada = await guardarConfiguracionInforme(config)
      setConfig(guardada)
      setGuardado(true)
    } catch {
      setError('No se pudo guardar la configuración.')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className={styles.overlay} onClick={onCerrar}>
      <div className={styles.modalBox} onClick={(e) => e.stopPropagation()}>
        <div className={styles.cabecera}>
          <div>
            <h3>Configurar informe</h3>
            <p className={styles.resumen}>Quién firma los PDF que se generen desde ahora. Queda guardado hasta que lo edites de nuevo.</p>
          </div>
          <button className={styles.cerrar} onClick={onCerrar} aria-label="Cerrar">
            ✕
          </button>
        </div>

        {error && <p className={styles.error}>{error}</p>}

        {config === null && !error ? (
          <p className={styles.estado}>Cargando…</p>
        ) : (
          <div className={styles.formulario}>
            <div className={styles.grupo}>
              <label className={styles.interruptor}>
                <input
                  type="checkbox"
                  checked={conAnalista}
                  onChange={(e) => actualizar('incluir_analista', e.target.checked)}
                />
                <span>
                  <h4>Analizado por</h4>
                  {/* No siempre hay analista que firme -turnos, reemplazos-, y
                      un bloque en blanco con una raya se lee como un informe
                      al que le faltó algo. */}
                  <small>
                    {conAnalista
                      ? 'Aparece a la izquierda de la firma de aprobación.'
                      : 'El informe sale solo con la firma de aprobación, abajo a la derecha.'}
                  </small>
                </span>
              </label>
              <label>
                Nombre
                <input
                  type="text"
                  value={config?.analizado_por_nombre ?? ''}
                  onChange={(e) => actualizar('analizado_por_nombre', e.target.value)}
                  placeholder="Nombre de quien analiza"
                  disabled={!conAnalista}
                />
              </label>
              <label>
                Cargo
                <input
                  type="text"
                  value={config?.analizado_por_cargo ?? ''}
                  onChange={(e) => actualizar('analizado_por_cargo', e.target.value)}
                  placeholder="Analista de Laboratorio"
                  disabled={!conAnalista}
                />
              </label>
            </div>

            <div className={styles.grupo}>
              <h4>Aprobado por</h4>
              <label>
                Nombre
                <input
                  type="text"
                  value={config?.aprobado_por_nombre ?? ''}
                  onChange={(e) => actualizar('aprobado_por_nombre', e.target.value)}
                  placeholder="Nombre de quien aprueba"
                />
              </label>
              <label>
                Cargo
                <input
                  type="text"
                  value={config?.aprobado_por_cargo ?? ''}
                  onChange={(e) => actualizar('aprobado_por_cargo', e.target.value)}
                  placeholder="Jefe(a) Laboratorio de Cromatografía"
                />
              </label>
            </div>

            <div className={styles.acciones}>
              {guardado && <span className={styles.ok}>Guardado ✓</span>}
              <Button variant="secondary" onClick={guardar} disabled={guardando}>
                {guardando ? 'Guardando…' : 'Guardar'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
