import { useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { EtiquetaServicio } from '@/components/ui/SelectorServicio'
import { IconoAlerta, IconoExcel } from '@/components/ui/iconosAccion'
import { importarListadoActimist } from '@/features/catalogo'
import type { PlanImportacionActimist } from '@/features/catalogo'
import styles from './ImportarActimistDialog.module.css'

interface Props {
  onCerrar: () => void
  /** Se llama después de cargar, para refrescar el listado. */
  onCargado: () => void
}

const nf = new Intl.NumberFormat('es-CL')
const TOPE_VISTA = 300

type Paso =
  | { tipo: 'elegir' }
  | { tipo: 'revisando'; archivo: File }
  | { tipo: 'plan'; archivo: File; plan: PlanImportacionActimist }
  | { tipo: 'cargando'; archivo: File; plan: PlanImportacionActimist }
  | { tipo: 'listo'; plan: PlanImportacionActimist }

/**
 * Carga el listado de Actimist desde la dinámica del Planner (Sold to Number,
 * Sold to Name, Ship to Number, Ship to Name). Primero muestra qué haría -sin
 * escribir nada- y recién al confirmar crea lo nuevo. Nunca modifica ni borra
 * lo que ya está, y no toca el listado de Línea de proceso.
 */
export function ImportarActimistDialog({ onCerrar, onCargado }: Props) {
  const entrada = useRef<HTMLInputElement>(null)
  const [paso, setPaso] = useState<Paso>({ tipo: 'elegir' })
  const [error, setError] = useState<string | null>(null)
  const [verTodas, setVerTodas] = useState(false)

  async function revisar(archivo: File) {
    setError(null)
    setPaso({ tipo: 'revisando', archivo })
    try {
      const plan = await importarListadoActimist(archivo, false)
      setPaso({ tipo: 'plan', archivo, plan })
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'No se pudo leer el archivo.')
      setPaso({ tipo: 'elegir' })
    }
  }

  async function cargar() {
    if (paso.tipo !== 'plan') return
    setError(null)
    setPaso({ tipo: 'cargando', archivo: paso.archivo, plan: paso.plan })
    try {
      const hecho = await importarListadoActimist(paso.archivo, true)
      setPaso({ tipo: 'listo', plan: hecho })
      onCargado()
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'No se pudo cargar el listado.')
      setPaso({ tipo: 'plan', archivo: paso.archivo, plan: paso.plan })
    }
  }

  const plan = paso.tipo === 'plan' || paso.tipo === 'cargando' || paso.tipo === 'listo' ? paso.plan : null
  const nuevos = plan ? plan.clientes_nuevos.length + plan.plantas_nuevas.length : 0
  const plantasVista = plan ? (verTodas ? plan.plantas_nuevas : plan.plantas_nuevas.slice(0, TOPE_VISTA)) : []
  const omitidas = plan ? plan.avisos.filter((a) => a.omitida).length : 0

  const pie =
    paso.tipo === 'listo' ? (
      <Button onClick={onCerrar}>Listo</Button>
    ) : (
      <>
        <Button variant="secondary" onClick={onCerrar}>Cancelar</Button>
        {plan && (
          <Button onClick={() => void cargar()} disabled={paso.tipo === 'cargando' || nuevos === 0}>
            {paso.tipo === 'cargando'
              ? 'Cargando…'
              : nuevos === 0
                ? 'No hay nada nuevo'
                : `Cargar ${nf.format(plan.clientes_nuevos.length)} Sold To y ${nf.format(plan.plantas_nuevas.length)} Ship To`}
          </Button>
        )}
      </>
    )

  return (
    <Modal
      titulo="Importar listado de Actimist"
      subtitulo={paso.tipo === 'elegir' ? 'Dinámica del Planner: Sold to Number, Sold to Name, Ship to Number y Ship to Name.' : ('archivo' in paso ? paso.archivo.name : undefined)}
      onCerrar={onCerrar}
      ancho="grande"
      pie={pie}
    >
      <div className={styles.cuerpo}>
        <div className={styles.encabezado}>
          <EtiquetaServicio servicio="actimist" />
          <span>Solo se escribe en el listado de Actimist. El de Línea de proceso no se toca.</span>
        </div>

        {error && (
          <div className={styles.error} role="alert">
            <IconoAlerta width={16} height={16} />
            <span>{error}</span>
          </div>
        )}

        {(paso.tipo === 'elegir' || paso.tipo === 'revisando') && (
          <button
            type="button"
            className={styles.zona}
            onClick={() => entrada.current?.click()}
            disabled={paso.tipo === 'revisando'}
            data-foco
          >
            <IconoExcel width={34} height={34} />
            <strong>{paso.tipo === 'revisando' ? 'Revisando el archivo…' : 'Elegir el Excel'}</strong>
            <span>Primero te muestro qué se va a crear. Nada se guarda hasta que confirmes.</span>
          </button>
        )}
        <input
          ref={entrada}
          type="file"
          accept=".xlsx,.xlsm"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            e.currentTarget.value = ''
            if (f) void revisar(f)
          }}
        />

        {plan && (
          <>
            {paso.tipo === 'listo' && (
              <div className={styles.exito} role="status">
                Listo: se crearon {nf.format(plan.creados?.clientes ?? 0)} Sold To y{' '}
                {nf.format(plan.creados?.plantas ?? 0)} Ship To en el listado de Actimist.
              </div>
            )}

            <div className={styles.cifras}>
              <Cifra valor={plan.clientes_nuevos.length} etiqueta="Sold To nuevos" destacada />
              <Cifra valor={plan.plantas_nuevas.length} etiqueta="Ship To nuevos" destacada />
              <Cifra valor={plan.clientes_existentes} etiqueta="Sold To que ya estaban" />
              <Cifra valor={plan.plantas_existentes} etiqueta="Ship To que ya estaban" />
            </div>
            <p className={styles.nota}>
              {nf.format(plan.filas)} filas leídas. Lo que ya estaba se reconoce por su código SAP (o por el nombre) y
              queda igual.
            </p>

            {plan.avisos.length > 0 && (
              <section className={styles.seccion}>
                <h3>
                  Para revisar <span className={styles.contador}>{plan.avisos.length}</span>
                  {omitidas > 0 && <span className={styles.omitidas}>{omitidas} no se cargan</span>}
                </h3>
                <ul className={styles.avisos}>
                  {plan.avisos.map((a, i) => (
                    <li key={`${a.fila}-${i}`} className={a.omitida ? styles.avisoGrave : undefined}>
                      <span className={styles.fila}>Fila {a.fila}</span>
                      <span className={styles.planta}>
                        <strong>{a.sold_to}</strong>
                        {a.ship_to && <> · {a.ship_to}</>}
                      </span>
                      <span className={styles.motivo}>{a.motivo}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {plan.plantas_nuevas.length > 0 && (
              <section className={styles.seccion}>
                <h3>
                  {paso.tipo === 'listo' ? 'Lo que se creó' : 'Lo que se va a crear'}{' '}
                  <span className={styles.contador}>{plan.plantas_nuevas.length}</span>
                </h3>
                <div className={styles.tablaCaja}>
                  <table className={styles.tabla}>
                    <thead>
                      <tr>
                        <th>Sold To</th>
                        <th>Ship To</th>
                        <th>N° Ship To</th>
                      </tr>
                    </thead>
                    <tbody>
                      {plantasVista.map((p, i) => (
                        <tr key={`${p.sold_to}-${p.nombre}-${i}`}>
                          <td className={styles.soldTo}>{p.sold_to}</td>
                          <td>{p.nombre}</td>
                          <td className={styles.mono}>{p.codigo_sap ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!verTodas && plan.plantas_nuevas.length > TOPE_VISTA && (
                  <button type="button" className={styles.verMas} onClick={() => setVerTodas(true)}>
                    Ver las {nf.format(plan.plantas_nuevas.length)}
                  </button>
                )}
              </section>
            )}
          </>
        )}
      </div>
    </Modal>
  )
}

function Cifra({ valor, etiqueta, destacada }: { valor: number; etiqueta: string; destacada?: boolean }) {
  return (
    <div className={destacada ? `${styles.cifra} ${styles.cifraDestacada}` : styles.cifra}>
      <span className={styles.valor}>{nf.format(valor)}</span>
      <span className={styles.etiquetaCifra}>{etiqueta}</span>
    </div>
  )
}
