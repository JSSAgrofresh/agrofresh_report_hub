import type { ReactNode } from 'react'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { cn } from '@/lib/cn'
import type { Respuesta, Resultado, ResultadoDia } from '@/features/verificaciones'
import styles from './Verificaciones.module.css'

/**
 * Las piezas que se repiten en las tres pantallas del módulo.
 *
 * Están acá y no en `components/ui` a propósito: son de este formulario -un
 * campo que distingue "cero" de "vacío", un veredicto de tres estados- y no
 * han hecho falta en ninguna otra parte del sistema todavía.
 */

/**
 * Un número que puede estar vacío.
 *
 * El detalle importante es que `null` (no medido) y `0` (medido, dio cero) son
 * cosas distintas: un `0` que se guarda como "vacío" borraría una medición
 * real, y un vacío que se guarda como `0` inventaría una que nadie hizo.
 */
interface CampoNumeroProps {
  valor: number | null
  onCambio: (valor: number | null) => void
  placeholder?: string
  ancho?: number
  titulo?: string
}

export function CampoNumero({ valor, onCambio, placeholder, ancho, titulo }: CampoNumeroProps) {
  return (
    <input
      type="number"
      inputMode="decimal"
      step="any"
      title={titulo}
      className={cn(styles.input, styles.inputNumero)}
      style={ancho ? { width: ancho } : undefined}
      placeholder={placeholder}
      value={valor === null ? '' : valor}
      onChange={(e) => {
        const texto = e.target.value
        if (texto === '') return onCambio(null)
        const numero = Number(texto)
        onCambio(Number.isNaN(numero) ? null : numero)
      }}
    />
  )
}

interface SelectorRespuestaProps {
  valor: Respuesta
  onCambio: (valor: Respuesta) => void
  opciones?: Respuesta[]
}

/** Sí / No / N.A. como botones y no como desplegable: son dos o tres
 * opciones que se contestan de corrido, y un clic es más rápido que abrir,
 * elegir y cerrar. Volver a tocar la opción activa la deja sin responder. */
export function SelectorRespuesta({
  valor,
  onCambio,
  opciones = ['Sí', 'No'],
}: SelectorRespuestaProps) {
  return (
    <span className={styles.opciones}>
      {opciones.map((opcion) => (
        <button
          key={opcion}
          type="button"
          className={cn(styles.opcion, valor === opcion && styles.opcionActiva)}
          aria-pressed={valor === opcion}
          onClick={() => onCambio(valor === opcion ? '' : opcion)}
        >
          {opcion}
        </button>
      ))}
    </span>
  )
}

/** El veredicto de una fila. Tres estados: cumple, no cumple, y todavía no se
 * midió —que no es lo mismo que no cumplir—. */
export function Veredicto({ resultado }: { resultado: Resultado }) {
  return (
    <span
      className={cn(
        styles.veredicto,
        resultado === 'Aceptable' && styles.veredictoOk,
        resultado === 'No aceptable' && styles.veredictoMal,
      )}
    >
      {resultado || 'Sin medir'}
    </span>
  )
}

export function VeredictoDia({ resultado }: { resultado: ResultadoDia }) {
  return (
    <span
      className={cn(
        styles.veredictoDia,
        resultado === 'Aceptable' && styles.veredictoDiaOk,
        resultado === 'No aceptable' && styles.veredictoDiaMal,
      )}
    >
      {resultado}
    </span>
  )
}

interface SeccionProps {
  numero: number
  titulo: string
  nota?: string
  analista?: { valor: string; onCambio: (valor: string) => void; deshabilitado?: boolean }
  resultado?: Resultado
  id?: string
  children: ReactNode
}

/**
 * Una sección del formulario: número, título, su analista y su veredicto.
 *
 * El analista va por sección porque así se trabaja de verdad: una persona
 * hace las micropipetas y otra la balanza, y el registro tiene que decir
 * quién hizo qué.
 */
export function Seccion({ numero, titulo, nota, analista, resultado, id, children }: SeccionProps) {
  return (
    <Card className={styles.seccion} id={id}>
      <div className={styles.seccionCabecera}>
        <span className={styles.numero}>{numero}</span>
        <h3 className={styles.seccionTitulo}>{titulo}</h3>
        <div className={styles.seccionDerecha}>
          {analista && (
            <label className={styles.analista}>
              <span className={styles.etiqueta}>Responsable</span>
              <input
                className={styles.input}
                value={analista.valor}
                placeholder="Nombre"
                disabled={analista.deshabilitado}
                onChange={(e) => analista.onCambio(e.target.value)}
              />
            </label>
          )}
          {resultado !== undefined && <Veredicto resultado={resultado} />}
        </div>
        {nota && <p className={styles.seccionNota}>{nota}</p>}
      </div>
      <div className={styles.seccionCuerpo}>{children}</div>
    </Card>
  )
}

/** Un número calculado por el sistema. Se muestra siempre, aunque esté vacío,
 * para que la columna no cambie de ancho mientras se escribe. */
export function Calculado({ valor, decimales = 2 }: { valor: number | null; decimales?: number }) {
  const mostrado = valor === null ? '—' : Number(valor.toFixed(decimales)).toString()

  return (
    <span className={styles.calculado}>
      {mostrado}
    </span>
  )
}

interface ObservacionModalProps {
  valor: string
  onCambio: (v: string) => void
  soloVer?: boolean
  titulo?: string
}

/** Botón compacto de observación por fila. Verde si tiene contenido, gris si
 * está vacío. Al hacer clic abre un modal con un textarea para escribir. */
export function ObservacionModal({ valor, onCambio, soloVer, titulo }: ObservacionModalProps) {
  const [abierto, setAbierto] = useState(false)
  const tieneContenido = valor.trim().length > 0

  return (
    <>
      <button
        type="button"
        className={cn(
          styles.botonObservacion,
          tieneContenido ? styles.botonObservacionCon : styles.botonObservacionSin,
        )}
        title={tieneContenido ? valor : 'Sin observación — clic para agregar'}
        onClick={() => setAbierto(true)}
      >
        {tieneContenido ? '● Obs.' : '○ Obs.'}
      </button>
      {abierto && (
        <div className={styles.modalOverlay} onClick={() => setAbierto(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h4>{titulo ?? 'Observación'}</h4>
            <textarea
              className={styles.textarea}
              value={valor}
              placeholder="Observación opcional para esta fila…"
              rows={4}
              autoFocus
              disabled={soloVer}
              onChange={(e) => onCambio(e.target.value)}
            />
            <div>
              <Button onClick={() => setAbierto(false)}>Cerrar</Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
