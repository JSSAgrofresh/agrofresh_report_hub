import { useEffect, useRef, useState } from 'react'
import styles from './Escaner.module.css'

interface EscanerProps<T> {
  /** Busca lo escaneado. Devuelve `null` mientras el código venga a medias. */
  buscar: (texto: string) => T | null
  onEncontrado: (item: T) => void
  /** Lo tecleado hasta ahora, para que la tabla de al lado filtre en vivo. */
  onTexto?: (texto: string) => void
  placeholder: string
  /** Qué decir cuando el código está completo y no corresponde a nada. */
  mensajeNoEncontrado: (escaneado: string) => string
  /** Verde: lo escaneado ya está listo para cruzar. */
  resuelto?: boolean
  deshabilitado?: boolean
  motivoDeshabilitado?: string
  /** Cada vez que cambia, la caja se vacía. Sirve para dejarla lista después
   * de un cruce sin que el operador tenga que borrar lo anterior. */
  reinicio?: number
  /** Toma el foco al vaciarse: es la caja por donde empieza el siguiente par,
   * y así se pueden encadenar sin tocar el mouse. */
  tomarFocoAlReiniciar?: boolean
}

/**
 * La caja de escaneo, igual para los dos lados.
 *
 * Un lector USB se comporta como un teclado: "tipea" el código y —si está
 * configurado así— manda Enter. Muchos vienen sin ese sufijo, así que acá no
 * se espera ninguna tecla de cierre: se busca en cada carácter que entra y lo
 * escaneado aparece solo apenas el código está completo.
 *
 * Solo resuelve con el código EXACTO, nunca con un prefijo: a media lectura,
 * "OT001" calza con varios y elegir ahí sería elegir cualquiera.
 */
export function Escaner<T>({
  buscar,
  onEncontrado,
  onTexto,
  placeholder,
  mensajeNoEncontrado,
  resuelto = false,
  deshabilitado = false,
  motivoDeshabilitado,
  reinicio = 0,
  tomarFocoAlReiniciar = false,
}: EscanerProps<T>) {
  const [texto, setTexto] = useState('')
  const [sinResultado, setSinResultado] = useState<string | null>(null)
  const [activo, setActivo] = useState(false)
  const entrada = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (activo && !deshabilitado) entrada.current?.focus()
  }, [activo, deshabilitado])

  const primeraVez = useRef(true)
  useEffect(() => {
    if (primeraVez.current) {
      primeraVez.current = false
      return
    }
    setTexto('')
    setSinResultado(null)
    if (tomarFocoAlReiniciar) entrada.current?.focus()
  }, [reinicio, tomarFocoAlReiniciar])

  function resolver(valor: string, forzado: boolean) {
    const escaneado = valor.trim()
    if (!escaneado) {
      setSinResultado(null)
      return
    }
    const encontrado = buscar(escaneado)
    if (!encontrado) {
      // Mientras el lector todavía escribe, un código a medias no encuentra
      // nada: eso no es un error, solo faltan caracteres. Se avisa recién si
      // alguien cerró con Enter, que sí es una pregunta terminada.
      if (forzado) setSinResultado(escaneado)
      return
    }
    setSinResultado(null)
    onEncontrado(encontrado)
    // Deja el texto seleccionado para que el próximo disparo lo reemplace en
    // vez de pegarse al anterior.
    entrada.current?.select()
  }

  return (
    <div
      className={[styles.caja, resuelto && styles.listo, deshabilitado && styles.apagada]
        .filter(Boolean)
        .join(' ')}
      onClick={() => setActivo(true)}
    >
      <form
        className={styles.linea}
        onSubmit={(e) => {
          e.preventDefault()
          resolver(texto, true)
        }}
      >
        <span className={styles.icono} aria-hidden="true">
          ▌▏▌▌▏▌
        </span>
        <input
          ref={entrada}
          className={styles.entrada}
          value={texto}
          disabled={deshabilitado}
          onChange={(e) => {
            setTexto(e.target.value)
            onTexto?.(e.target.value)
            resolver(e.target.value, false)
          }}
          onFocus={() => setActivo(true)}
          onBlur={() => setActivo(false)}
          onKeyDown={(e) => {
            // Hay lectores configurados para cerrar con Tab en vez de Enter.
            if (e.key === 'Tab' && texto.trim()) {
              e.preventDefault()
              resolver(texto, true)
            }
          }}
          placeholder={deshabilitado ? (motivoDeshabilitado ?? placeholder) : placeholder}
          aria-label={placeholder}
          autoComplete="off"
          spellCheck={false}
        />
        {texto && !deshabilitado && (
          <button
            type="button"
            className={styles.limpiar}
            onClick={() => {
              setTexto('')
              onTexto?.('')
              setSinResultado(null)
            }}
          >
            Limpiar
          </button>
        )}
        {!deshabilitado && (
          <span className={activo ? styles.activo : styles.dormido}>
            {activo ? 'Listo para escanear' : 'Haz clic acá'}
          </span>
        )}
      </form>

      {sinResultado && <p className={styles.noEncontrada}>{mensajeNoEncontrado(sinResultado)}</p>}
    </div>
  )
}
