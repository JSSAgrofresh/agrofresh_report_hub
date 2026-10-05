import { useId, useState } from 'react'
import type { ClipboardEvent, KeyboardEvent } from 'react'
import { esCorreoValido, quitarCorreo, separarCorreos, sumarCorreos } from '@/features/envioInformes'
import styles from './EnvioInformes.module.css'

interface ListaCorreosProps {
  etiqueta: string
  ayuda?: string
  valor: string[]
  onChange: (lista: string[]) => void
  deshabilitado?: boolean
  /** Para marcar el campo cuando es obligatorio y está vacío. */
  alerta?: boolean
}

/** Una lista de correos que se arma con chips: se escribe o se pega (Excel,
 * Outlook, «a@x.cl; b@x.cl») y cada dirección queda como una etiqueta que se
 * quita con un clic. Las que no tienen forma de correo se marcan en rojo. */
export function ListaCorreos({ etiqueta, ayuda, valor, onChange, deshabilitado, alerta }: ListaCorreosProps) {
  const [texto, setTexto] = useState('')
  const id = useId()

  function agregar(crudo: string) {
    const nuevos = separarCorreos(crudo)
    if (nuevos.length) onChange(sumarCorreos(valor, nuevos))
    setTexto('')
  }

  function alTeclear(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ';' || e.key === ',' || e.key === ' ') {
      if (texto.trim()) {
        e.preventDefault()
        agregar(texto)
      }
    } else if (e.key === 'Backspace' && !texto && valor.length) {
      onChange(valor.slice(0, -1))
    }
  }

  function alPegar(e: ClipboardEvent<HTMLInputElement>) {
    const pegado = e.clipboardData.getData('text')
    if (/[\s,;]/.test(pegado.trim())) {
      e.preventDefault()
      agregar(pegado)
    }
  }

  return (
    <div className={styles.campoCorreos}>
      <label htmlFor={id} className={styles.etiquetaCampo}>
        {etiqueta}
        <span className={styles.contador}>{valor.length}</span>
      </label>
      <div className={`${styles.cajaCorreos} ${alerta ? styles.cajaAlerta : ''}`}>
        {valor.map((c) => (
          <span key={c} className={`${styles.chip} ${esCorreoValido(c) ? '' : styles.chipMalo}`}>
            {c}
            {!deshabilitado && (
              <button
                type="button"
                className={styles.chipQuitar}
                onClick={() => onChange(quitarCorreo(valor, c))}
                aria-label={`Quitar ${c}`}
              >
                ×
              </button>
            )}
          </span>
        ))}
        <input
          id={id}
          className={styles.entradaCorreo}
          value={texto}
          disabled={deshabilitado}
          placeholder={valor.length ? 'Agregar otro…' : 'nombre@empresa.cl'}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={alTeclear}
          onPaste={alPegar}
          onBlur={() => texto.trim() && agregar(texto)}
        />
      </div>
      {ayuda && <p className={styles.ayudaCampo}>{ayuda}</p>}
    </div>
  )
}
