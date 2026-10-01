import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { ETIQUETA_VIA, INFO_CAMPO, mismaLista, separarCorreos } from '@/features/listasDistribucion'
import type { CampoLista } from '@/features/listasDistribucion'
import styles from './EditorCelda.module.css'

export interface EditorAbierto {
  /** celda a la que se ancla la ventana */
  ancla: DOMRect
  titulo: string
  /** lo que ocupa esta celda: si son varias especies a la vez, se avisa */
  campo: CampoLista
  todasLasEspecies: boolean
  guardado: string[]
  actual: string[]
  copiaMal: string[]
  /** ya hay un ajuste de copia propuesto para esta celda */
  ajusteYaPropuesto?: boolean
  /** `ajustar`: correos de esta celda cuya copia se corrige al guardar */
  onGuardar: (lista: string[], ajustar: string[]) => void
}

/** Ventana para editar los correos de UNA celda: chips que se quitan con ✕ y un
 * campo donde se escribe o se pega (separados por «;», coma, espacio o línea). */
export function EditorCelda({ editor, onCerrar }: { editor: EditorAbierto; onCerrar: () => void }) {
  const [lista, setLista] = useState<string[]>(editor.actual)
  const [texto, setTexto] = useState('')
  const [aviso, setAviso] = useState<string | null>(null)
  const [corregir, setCorregir] = useState(true)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const ventana = useRef<HTMLDivElement>(null)
  const entrada = useRef<HTMLInputElement>(null)
  const info = INFO_CAMPO[editor.campo]

  useLayoutEffect(() => {
    const v = ventana.current
    if (!v) return
    const margen = 12
    const left = Math.min(Math.max(margen, editor.ancla.left), window.innerWidth - v.offsetWidth - margen)
    const abajo = editor.ancla.bottom + 6
    const top = abajo + v.offsetHeight > window.innerHeight - margen ? Math.max(margen, editor.ancla.top - v.offsetHeight - 6) : abajo
    setPos({ top, left })
  }, [editor.ancla])

  useEffect(() => {
    entrada.current?.focus()
  }, [])

  useEffect(() => {
    function alTeclear(e: KeyboardEvent) {
      if (e.key === 'Escape') onCerrar()
    }
    window.addEventListener('keydown', alTeclear)
    return () => window.removeEventListener('keydown', alTeclear)
  }, [onCerrar])

  /** Suma lo escrito a la lista; devuelve la lista resultante. */
  function sumar(origen: string, base: string[]): string[] {
    const { validos, invalidos } = separarCorreos(origen)
    setAviso(invalidos.length ? `«${invalidos.join('», «')}» no ${invalidos.length === 1 ? 'es un correo' : 'son correos'}: no se agregó.` : null)
    const sig = [...base]
    for (const e of validos) if (!sig.includes(e)) sig.push(e)
    setLista(sig)
    setTexto('')
    return sig
  }

  function guardar() {
    const final = texto.trim() ? sumar(texto, lista) : lista
    const ajustar = corregir ? editor.copiaMal.filter((e) => final.includes(e.toLowerCase())) : []
    editor.onGuardar(final, ajustar)
    onCerrar()
  }

  const cambio = !mismaLista(lista, editor.actual) || texto.trim() !== '' || (editor.copiaMal.length > 0 && corregir && editor.copiaMal.some((e) => lista.includes(e.toLowerCase())) && !editor.ajusteYaPropuesto)

  return (
    <div className={styles.fondo} onMouseDown={(e) => e.target === e.currentTarget && onCerrar()}>
      <div ref={ventana} className={styles.ventana} style={pos} role="dialog" aria-label={`Editar ${editor.titulo}`}>
        <header>
          <strong>{editor.titulo}</strong>
          <span className={`${styles.via} ${styles[info.via]}`}>{ETIQUETA_VIA[info.via]}</span>
        </header>
        <p className={styles.ayuda}>{info.ayuda}</p>
        {editor.todasLasEspecies && <p className={styles.aviso}>Esta lista vale para <b>todas las especies</b>. Para dar una distinta a una especie, sepárala primero.</p>}
        {editor.copiaMal.length > 0 && (
          <label className={styles.aviso}>
            <input type="checkbox" checked={corregir} onChange={(e) => setCorregir(e.target.checked)} /> Corregir la copia de{' '}
            <b>{editor.copiaMal.join(', ')}</b>: hoy {editor.copiaMal.length === 1 ? 'va' : 'van'} en {INFO_CAMPO[editor.campo].via === 'CCO' ? 'copia visible y debe ir en copia oculta' : 'copia oculta y debe ir en copia'}.
          </label>
        )}

        <ul className={styles.chips} aria-label="Correos de la celda">
          {lista.length === 0 && <li className={styles.vacio}>Sin correos</li>}
          {lista.map((e) => (
            <li key={e} className={editor.guardado.map((g) => g.toLowerCase()).includes(e) ? undefined : styles.nuevo}>
              <span title={e}>{e}</span>
              <button type="button" aria-label={`Quitar ${e}`} onClick={() => setLista(lista.filter((x) => x !== e))}>✕</button>
            </li>
          ))}
        </ul>

        <input
          ref={entrada}
          className={styles.campo}
          placeholder="Escribe o pega correos y apreta Enter"
          aria-label="Agregar correos"
          value={texto}
          onChange={(e) => {
            const v = e.target.value
            if (/[;,\n]/.test(v)) sumar(v, lista)
            else setTexto(v)
          }}
          onPaste={(e) => {
            const pegado = e.clipboardData.getData('text')
            if (/[;,\s]/.test(pegado.trim())) {
              e.preventDefault()
              sumar(pegado, lista)
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              if (texto.trim()) sumar(texto, lista)
              else if (e.ctrlKey || e.metaKey || cambio) guardar()
            }
            if (e.key === 'Backspace' && !texto && lista.length) setLista(lista.slice(0, -1))
          }}
        />
        {aviso && <p className={styles.error} role="alert">{aviso}</p>}

        <footer>
          <button type="button" className={styles.reset} onClick={() => { setLista(editor.guardado); setTexto(''); setAviso(null) }} disabled={mismaLista(lista, editor.guardado) && !texto}>
            Volver a lo guardado
          </button>
          <span className={styles.espacio} />
          <Button variant="ghost" onClick={onCerrar}>Cancelar</Button>
          <Button onClick={guardar} disabled={!cambio}>Listo</Button>
        </footer>
      </div>
    </div>
  )
}
