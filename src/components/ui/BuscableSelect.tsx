import { useMemo, useRef, useState } from 'react'
import { cn } from '@/lib/cn'
import styles from './BuscableSelect.module.css'

interface BuscableSelectProps {
  etiqueta: string
  opciones: string[]
  valor: string
  onChange: (valor: string) => void
  placeholderTodos?: string
  disabled?: boolean
}

export function BuscableSelect({
  etiqueta,
  opciones,
  valor,
  onChange,
  placeholderTodos = 'Todos',
  disabled,
}: BuscableSelectProps) {
  const [abierto, setAbierto] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    if (!q) return opciones
    return opciones.filter((o) => o.toLowerCase().includes(q))
  }, [opciones, busqueda])

  function abrir() {
    if (disabled) return
    setBusqueda('')
    setAbierto(true)
    requestAnimationFrame(() => inputRef.current?.select())
  }

  function elegir(o: string) {
    onChange(o)
    setAbierto(false)
    setBusqueda('')
  }

  return (
    <div className={styles.contenedor}>
      <span className={styles.etiqueta}>{etiqueta}</span>
      <div className={styles.caja}>
        <input
          ref={inputRef}
          className={cn(styles.input, disabled && styles.deshabilitado)}
          value={abierto ? busqueda : valor}
          placeholder={placeholderTodos}
          onFocus={abrir}
          onChange={(e) => setBusqueda(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setAbierto(false)
              inputRef.current?.blur()
            }
            if (e.key === 'Enter' && filtradas.length > 0) elegir(filtradas[0])
          }}
          disabled={disabled}
        />
        {valor && !abierto && (
          <button
            type="button"
            className={styles.limpiar}
            aria-label={`Limpiar ${etiqueta}`}
            onClick={() => onChange('')}
          >
            ✕
          </button>
        )}
      </div>

      {abierto && (
        <>
          <div className={styles.fondo} onClick={() => setAbierto(false)} />
          <div className={styles.lista}>
            <button
              type="button"
              className={cn(styles.opcion, styles.opcionTodos, !valor && styles.opcionActiva)}
              onClick={() => elegir('')}
            >
              {placeholderTodos}
            </button>
            {filtradas.length === 0 ? (
              <p className={styles.sinResultados}>Sin resultados para "{busqueda}"</p>
            ) : (
              filtradas.slice(0, 200).map((o) => (
                <button
                  key={o}
                  type="button"
                  className={cn(styles.opcion, o === valor && styles.opcionActiva)}
                  onClick={() => elegir(o)}
                >
                  {o}
                </button>
              ))
            )}
          </div>
        </>
      )}
    </div>
  )
}
