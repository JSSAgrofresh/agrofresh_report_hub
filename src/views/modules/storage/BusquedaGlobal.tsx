import { useEffect, useRef, useState } from 'react'
import { buscar, ESPACIOS, espacioDeRuta, espacioLocalDeRuta, partirResaltado } from '@/features/storage'
import type { EntradaStorage, Espacio } from '@/features/storage'
import { cn } from '@/lib/cn'
import { IconoArchivo, IconoCarpeta } from './IconoArchivo'
import styles from './BusquedaGlobal.module.css'

interface Resultado {
  entrada: EntradaStorage
  espacio: Espacio
}

interface BusquedaGlobalProps {
  /** Abre una carpeta, o la carpeta que contiene el archivo y lo resalta. */
  onAbrir: (espacioId: Espacio['id'], ruta: string, resaltar: string | null) => void
}

const ESPERA_MS = 280

function carpetaContenedora(ruta: string): string {
  return ruta.split('/').slice(0, -1).join('/')
}

/** Busca por nombre en TODO Storage (disco y R2) sin tener que entrar carpeta
 * por carpeta. Se enfoca con «/». */
export function BusquedaGlobal({ onAbrir }: BusquedaGlobalProps) {
  const [texto, setTexto] = useState('')
  const [abierto, setAbierto] = useState(false)
  const [resultados, setResultados] = useState<Resultado[] | null>(null)
  const [fallo, setFallo] = useState(false)
  const [activo, setActivo] = useState(0)
  const entrada = useRef<HTMLInputElement>(null)
  const caja = useRef<HTMLDivElement>(null)
  const consulta = texto.trim()

  useEffect(() => {
    function alTeclear(e: KeyboardEvent) {
      const t = e.target as HTMLElement
      if (e.key === '/' && !t.closest('input,textarea,select,[contenteditable]')) {
        e.preventDefault()
        entrada.current?.focus()
      }
    }
    function alHacerClic(e: MouseEvent) {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false)
    }
    window.addEventListener('keydown', alTeclear)
    window.addEventListener('mousedown', alHacerClic)
    return () => {
      window.removeEventListener('keydown', alTeclear)
      window.removeEventListener('mousedown', alHacerClic)
    }
  }, [])

  useEffect(() => {
    if (!consulta) return
    let vigente = true
    const temporizador = window.setTimeout(() => {
      Promise.allSettled([buscar(consulta, 'local'), buscar(consulta, 'r2')]).then(([local, r2]) => {
        if (!vigente) return
        const lista: Resultado[] = []
        if (local.status === 'fulfilled') {
          lista.push(
            ...local.value.map((entrada) => ({
              entrada,
              espacio: ESPACIOS.find((x) => x.id === espacioLocalDeRuta(entrada.ruta)) ?? ESPACIOS[0],
            })),
          )
        }
        if (r2.status === 'fulfilled') {
          lista.push(
            ...r2.value.map((entrada) => ({
              entrada,
              espacio: ESPACIOS.find((x) => x.id === espacioDeRuta(entrada.ruta)) ?? ESPACIOS[1],
            })),
          )
        }
        setFallo(local.status === 'rejected' && r2.status === 'rejected')
        setResultados(lista)
        setActivo(0)
      })
    }, ESPERA_MS)
    return () => {
      vigente = false
      window.clearTimeout(temporizador)
    }
  }, [consulta])

  function elegir(r: Resultado) {
    setAbierto(false)
    if (r.entrada.tipo === 'carpeta') onAbrir(r.espacio.id, r.entrada.ruta, null)
    else onAbrir(r.espacio.id, carpetaContenedora(r.entrada.ruta) || r.espacio.raiz, r.entrada.ruta)
  }

  function alTeclearEnCaja(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      setAbierto(false)
      entrada.current?.blur()
    } else if (e.key === 'ArrowDown' && resultados?.length) {
      e.preventDefault()
      setActivo((a) => Math.min(a + 1, resultados.length - 1))
    } else if (e.key === 'ArrowUp' && resultados?.length) {
      e.preventDefault()
      setActivo((a) => Math.max(a - 1, 0))
    } else if (e.key === 'Enter' && resultados?.[activo]) {
      elegir(resultados[activo])
    }
  }

  const buscando = consulta !== '' && resultados === null && !fallo

  return (
    <div className={styles.caja} ref={caja}>
      <div className={cn(styles.campo, abierto && styles.campoActivo)}>
        <svg className={styles.lupa} viewBox="0 0 24 24" aria-hidden>
          <circle cx="11" cy="11" r="6.5" />
          <path d="m16 16 4.5 4.5" />
        </svg>
        <input
          ref={entrada}
          type="search"
          value={texto}
          placeholder="Buscar archivos y carpetas en todo Storage…"
          aria-label="Buscar en todo Storage"
          onChange={(e) => {
            setTexto(e.target.value)
            if (!e.target.value.trim()) setResultados(null)
            setAbierto(true)
          }}
          onFocus={() => setAbierto(true)}
          onKeyDown={alTeclearEnCaja}
        />
        <kbd className={styles.atajo} aria-hidden>
          /
        </kbd>
      </div>

      {abierto && consulta && (
        <div className={styles.panel} role="listbox" aria-label="Resultados de la búsqueda">
          {buscando && (
            <p className={styles.estado}>
              <span className={styles.giro} aria-hidden /> Buscando…
            </p>
          )}
          {fallo && <p className={styles.estado}>No se pudo buscar. Revisa que el backend esté corriendo.</p>}
          {resultados?.length === 0 && <p className={styles.estado}>Nada coincide con «{consulta}».</p>}
          {resultados?.map((r, i) => {
            const carpeta = r.entrada.tipo === 'carpeta'
            const donde = carpetaContenedora(r.entrada.ruta)
            return (
              <button
                key={`${r.espacio.id}|${r.entrada.ruta}`}
                type="button"
                role="option"
                aria-selected={i === activo}
                className={cn(styles.resultado, i === activo && styles.resultadoActivo)}
                style={{ animationDelay: `${Math.min(i, 10) * 18}ms` }}
                onMouseEnter={() => setActivo(i)}
                onClick={() => elegir(r)}
              >
                {carpeta ? <IconoCarpeta color={r.espacio.acento} /> : <IconoArchivo nombre={r.entrada.nombre} />}
                <span className={styles.textos}>
                  <span className={styles.nombre}>
                    {partirResaltado(r.entrada.nombre, consulta).map((t, k) =>
                      t.marca ? <mark key={k}>{t.texto}</mark> : <span key={k}>{t.texto}</span>,
                    )}
                  </span>
                  <span className={styles.ruta}>{donde || r.espacio.etiqueta}</span>
                </span>
                <span className={styles.espacio} style={{ '--acento': r.espacio.acento } as React.CSSProperties}>
                  {r.espacio.etiqueta}
                </span>
              </button>
            )
          })}
          {resultados && resultados.length >= 80 && (
            <p className={styles.estado}>Se muestran los primeros resultados; afina la búsqueda para ver otros.</p>
          )}
        </div>
      )}
    </div>
  )
}
