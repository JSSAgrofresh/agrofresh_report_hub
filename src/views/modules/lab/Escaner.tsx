import { useEffect, useRef, useState } from 'react'
import styles from './Escaner.module.css'

interface EscanerProps<T> {
  buscar: (texto: string) => T | null
  onEncontrado: (item: T) => void
  onLimpiar?: () => void
  onTexto?: (texto: string) => void
  placeholder: string
  mensajeNoEncontrado: (escaneado: string) => string
  resuelto?: boolean
  deshabilitado?: boolean
  motivoDeshabilitado?: string
  reinicio?: number
  tomarFocoAlReiniciar?: boolean
  tomarFoco?: boolean
  /** Para códigos libres, donde cualquier prefijo también parece válido,
   * espera esta pausa antes de resolver. Los lectores escriben el código
   * completo en pocos milisegundos. */
  esperaFinEscaneoMs?: number
}

export function Escaner<T>({
  buscar,
  onEncontrado,
  onLimpiar,
  onTexto,
  placeholder,
  mensajeNoEncontrado,
  resuelto = false,
  deshabilitado = false,
  motivoDeshabilitado,
  reinicio = 0,
  tomarFocoAlReiniciar = false,
  tomarFoco = false,
  esperaFinEscaneoMs = 0,
}: EscanerProps<T>) {
  const [texto, setTexto] = useState('')
  const [sinResultado, setSinResultado] = useState<string | null>(null)
  const [activo, setActivo] = useState(false)
  const entrada = useRef<HTMLInputElement>(null)
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null)

  function cancelarEspera() {
    if (temporizador.current !== null) {
      clearTimeout(temporizador.current)
      temporizador.current = null
    }
  }

  useEffect(() => () => cancelarEspera(), [])

  useEffect(() => {
    if (activo && !deshabilitado) entrada.current?.focus()
  }, [activo, deshabilitado])

  useEffect(() => {
    // Basta con enfocar: el propio onFocus del campo marca la caja como
    // activa. Llamar acá a setActivo encadenaba un render de más.
    if (tomarFoco && !deshabilitado) entrada.current?.focus()
  }, [tomarFoco, deshabilitado])

  const primeraVez = useRef(true)
  useEffect(() => {
    if (primeraVez.current) {
      primeraVez.current = false
      return
    }
    cancelarEspera()
    setTexto('')
    setSinResultado(null)
    if (tomarFocoAlReiniciar) entrada.current?.focus()
  }, [reinicio, tomarFocoAlReiniciar])

  function limpiar() {
    cancelarEspera()
    setTexto('')
    onTexto?.('')
    setSinResultado(null)
    onLimpiar?.()
    entrada.current?.focus()
  }

  function resolver(valor: string, forzado: boolean) {
    const escaneado = valor.trim()
    if (!escaneado) {
      setSinResultado(null)
      return
    }
    const encontrado = buscar(escaneado)
    if (!encontrado) {
      if (forzado) setSinResultado(escaneado)
      return
    }
    setSinResultado(null)
    onEncontrado(encontrado)
    // Con códigos de catálogo se selecciona para que el próximo disparo los
    // reemplace. En códigos libres no: resolver el primer carácter y
    // seleccionarlo era justamente lo que convertía GCNPD10065 en "5".
    if (esperaFinEscaneoMs === 0) entrada.current?.select()
  }

  function resolverCambio(valor: string) {
    cancelarEspera()
    if (esperaFinEscaneoMs === 0) {
      resolver(valor, false)
      return
    }
    temporizador.current = setTimeout(() => {
      temporizador.current = null
      resolver(valor, false)
    }, esperaFinEscaneoMs)
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
          cancelarEspera()
          resolver(texto, true)
        }}
      >
        <span className={styles.icono} aria-hidden="true">▌▏▌▌▏▌</span>
        <input
          ref={entrada}
          className={styles.entrada}
          value={texto}
          disabled={deshabilitado}
          onChange={(e) => {
            setTexto(e.target.value)
            onTexto?.(e.target.value)
            resolverCambio(e.target.value)
          }}
          onFocus={() => setActivo(true)}
          onBlur={() => setActivo(false)}
          onKeyDown={(e) => {
            if (e.key === 'Tab' && texto.trim()) {
              e.preventDefault()
              cancelarEspera()
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
            onMouseDown={(e) => {
              e.preventDefault()
              limpiar()
            }}
            onClick={limpiar}
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
