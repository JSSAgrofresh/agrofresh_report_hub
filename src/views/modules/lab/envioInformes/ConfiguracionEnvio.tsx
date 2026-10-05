import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { TemplateMailEditor } from '@/views/admin/laboratorios/TemplateMailEditor'
import adminStyles from '@/views/admin/laboratorios/LaboratoriosView.module.css'
import {
  guardarInternos,
  guardarTemplateInforme,
  obtenerTemplateInforme,
  PLANTILLA_PREDETERMINADA,
} from '@/features/envioInformes'
import type { EstadoEnvio, Internos } from '@/features/envioInformes'
import { HttpError } from '@/services/http/client'
import { ListaCorreos } from './ListaCorreos'
import styles from './EnvioInformes.module.css'

interface ConfiguracionEnvioProps {
  estado: EstadoEnvio
  onEstado: (estado: EstadoEnvio) => void
}

type Pestana = 'plantilla' | 'internos'

/** Lo que Paz puede configurar sin pedirle nada a nadie: la plantilla del
 * correo (el mismo editor de Administración → Laboratorios)
 * y las copias internas que se proponen en cada envío. */
export function ConfiguracionEnvio({
  estado, onEstado,
}: ConfiguracionEnvioProps) {
  const [pestana, setPestana] = useState<Pestana>('plantilla')
  const [error, setError] = useState<string | null>(null)
  const [internos, setInternos] = useState<Internos>(estado.internos)
  const [guardando, setGuardando] = useState(false)
  const [guardado, setGuardado] = useState(false)

  const sinCambios =
    JSON.stringify(internos) === JSON.stringify(estado.internos)

  async function guardar() {
    setGuardando(true)
    setError(null)
    setGuardado(false)
    try {
      onEstado(await guardarInternos(internos))
      setGuardado(true)
    } catch (e) {
      setError(e instanceof HttpError ? e.message : 'No se pudieron guardar las copias internas.')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <section className={styles.configuracion} aria-label="Configuración del envío">
      <div className={styles.pestanas} role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={pestana === 'plantilla'}
          className={pestana === 'plantilla' ? styles.pestanaActiva : styles.pestana}
          onClick={() => setPestana('plantilla')}
        >
          Plantilla del correo
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={pestana === 'internos'}
          className={pestana === 'internos' ? styles.pestanaActiva : styles.pestana}
          onClick={() => setPestana('internos')}
        >
          Copias internas
        </button>
      </div>

      {error && <p className={styles.error} role="alert">{error}</p>}

      {pestana === 'plantilla' ? (
        <div className={styles.configCuerpo}>
          <p className={styles.ayudaCampo}>
            Es la plantilla predeterminada: la usan todos los informes. Más adelante podrá haber una por servicio
            (Línea de proceso, Actimist…). Para cambiar un correo en particular usa «Editar este correo» en el
            informe. Las variables se reemplazan con los datos de la planta y del archivo.
          </p>
          <div className={adminStyles.templatePanel}>
            <TemplateMailEditor
              clave={PLANTILLA_PREDETERMINADA}
              cargar={() => obtenerTemplateInforme(PLANTILLA_PREDETERMINADA)}
              guardar={(datos) => guardarTemplateInforme(PLANTILLA_PREDETERMINADA, datos)}
              onError={setError}
            />
          </div>
        </div>
      ) : (
        <div className={styles.configCuerpo}>
          <p className={styles.ayudaCampo}>
            Estas direcciones se proponen en cada envío, junto a la lista de distribución del cliente. No cambian la
            lista de la planta ni los contactos de los laboratorios. Hoy van en copia oculta; el detalle de quién va
            en copia se define más adelante.
          </p>
          <ListaCorreos
            etiqueta="Copia (CC)"
            valor={internos.cc}
            onChange={(cc) => { setInternos({ ...internos, cc }); setGuardado(false) }}
          />
          <ListaCorreos
            etiqueta="Copia oculta (CCO)"
            valor={internos.bcc}
            onChange={(bcc) => { setInternos({ ...internos, bcc }); setGuardado(false) }}
          />
          <div className={styles.accionesConfig}>
            {guardado && <span className={styles.guardado}>Copias guardadas</span>}
            <Button onClick={guardar} disabled={guardando || sinCambios}>
              {guardando ? 'Guardando…' : 'Guardar copias'}
            </Button>
          </div>
        </div>
      )}
    </section>
  )
}
