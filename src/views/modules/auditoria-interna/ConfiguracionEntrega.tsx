import { useCallback, useMemo, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { RECEPCION_ESTIMADA_DIAS, clavePlazoAnalisis } from '@/features/auditoriaInterna'
import type { Definicion, ReglasEntrega } from '@/features/auditoriaInterna'
import { formatDateCL } from '@/lib/locale'
import styles from './ConfiguracionEntrega.module.css'

interface Props {
  reglas: ReglasEntrega
  /** laboratorios (mayúsculas) */
  labs: string[]
  /** los Análisis (FSMA, residuos en fruta…) que se han pedido a cada laboratorio: cada uno puede tener su propio plazo */
  analisisPorLab: Map<string, string[]>
  guardar: (entregado: Definicion, plazos: Record<string, number | null>) => Promise<unknown>
  onCerrar: () => void
}

const DEFINICIONES: { v: Definicion; titulo: string; detalle: string }[] = [
  { v: 'concretado', titulo: 'PDF + Report', detalle: 'Está entregado cuando el informe está guardado y sus resultados ya se ven en Report.' },
  { v: 'cliente', titulo: 'Enviado al cliente', detalle: 'Está entregado cuando el informe se marcó como enviado al cliente.' },
]

/**
 * Los pasos de la entrega, editables: qué cuenta como «entregado» y el plazo prometido (en días
 * hábiles) de cada laboratorio y, si hace falta, de cada análisis. Solo la abre el administrador
 * general (el servidor lo exige también). Sin plazo cargado no se juzga: nunca se asume uno.
 */
export function ConfiguracionEntrega({ reglas, labs, analisisPorLab, guardar, onCerrar }: Props) {
  const claves = useMemo(
    () => labs.flatMap((l) => [l, ...(analisisPorLab.get(l) ?? []).map((a) => clavePlazoAnalisis(l, a))]),
    [labs, analisisPorLab],
  )
  const [entregado, setEntregado] = useState<Definicion>(reglas.entregado)
  const [plazos, setPlazos] = useState<Record<string, string>>(
    () => Object.fromEntries(claves.map((k) => [k, String(reglas.plazos[k] ?? '')])),
  )
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const cerrar = useCallback(() => onCerrar(), [onCerrar])

  const sucio = entregado !== reglas.entregado || claves.some((k) => (plazos[k] ?? '') !== String(reglas.plazos[k] ?? ''))

  async function aplicar() {
    setGuardando(true)
    setError(null)
    try {
      const p: Record<string, number | null> = {}
      claves.forEach((k) => {
        const n = Number(plazos[k])
        p[k] = plazos[k] && Number.isInteger(n) && n >= 1 && n <= 365 ? n : null
      })
      await guardar(entregado, p)
      onCerrar()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar.')
    } finally {
      setGuardando(false)
    }
  }

  const campo = (k: string, etiqueta: string, unidad: string) => (
    <label key={k} className={styles.plazo} htmlFor={`plazo-${k}`}>
      <span>{etiqueta}</span>
      <span className={styles.entrada}>
        <input
          id={`plazo-${k}`}
          type="number"
          min={1}
          max={365}
          inputMode="numeric"
          placeholder="—"
          value={plazos[k] ?? ''}
          onChange={(e) => setPlazos((p) => ({ ...p, [k]: e.target.value }))}
        />
        <small>{unidad}</small>
      </span>
    </label>
  )

  return (
    <Modal
      titulo="Pasos de la entrega"
      subtitulo="Solo lo ve el administrador general"
      onCerrar={cerrar}
      ancho="grande"
      pie={
        <>
          <Button variant="ghost" onClick={cerrar}>Cancelar</Button>
          <Button onClick={() => void aplicar()} disabled={!sucio || guardando}>{guardando ? 'Guardando…' : 'Guardar'}</Button>
        </>
      }
    >
      <div className={styles.cuerpo}>
        <section>
          <h3>¿Cuándo está entregado un informe?</h3>
          <div className={styles.opciones} role="radiogroup" aria-label="Definición de entregado">
            {DEFINICIONES.map((d) => (
              <label key={d.v} className={`${styles.opcion} ${entregado === d.v ? styles.activa : ''}`}>
                <input type="radio" name="entregado" checked={entregado === d.v} onChange={() => setEntregado(d.v)} />
                <span>
                  <b>{d.titulo}</b>
                  <small>{d.detalle}</small>
                </span>
              </label>
            ))}
          </div>
        </section>

        <section>
          <h3>Plazo prometido, en días hábiles</h3>
          <p className={styles.nota}>
            Cuenta desde la recepción estimada (emisión + {RECEPCION_ESTIMADA_DIAS} día), solo de lunes a viernes. Cada laboratorio tiene un plazo general
            y, si un tipo de análisis tarda distinto (FSMA, residuos en fruta, patógenos…), su propio plazo: gana el análisis más lento de la solicitud del informe. Vacío = no se juzga.
          </p>
          {labs.map((l) => (
            <div key={l} className={styles.lab}>
              <div className={styles.general}>{campo(l, `${l} · plazo general`, 'd háb.')}</div>
              {(analisisPorLab.get(l) ?? []).length > 0 && (
                <div className={styles.analisis}>
                  <small>Plazo propio por análisis (vacío = rige el general)</small>
                  <div className={styles.grilla}>
                    {(analisisPorLab.get(l) ?? []).map((a) => campo(clavePlazoAnalisis(l, a), a, 'd háb.'))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </section>

        {error && <p className={styles.error} role="alert">{error}</p>}
        {reglas.cambiado_en && (
          <p className={styles.nota}>Última vez guardado por {reglas.cambiado_por ?? '—'} el {formatDateCL(reglas.cambiado_en)}.</p>
        )}
      </div>
    </Modal>
  )
}
