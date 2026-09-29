import { useEffect, useState } from 'react'
import type { DragEvent } from 'react'
import { cn } from '@/lib/cn'
import { TIPO_MOVER, estaDentro, leerArrastre, nombreVisible, operaciones } from '@/features/storage'
import type { EntradaStorage, Espacio } from '@/features/storage'
import { IconoCarpeta } from './IconoArchivo'
import styles from './ArbolCarpetas.module.css'

function carpetasDe(espacio: Espacio, ruta: string): Promise<EntradaStorage[]> {
  return operaciones(espacio).listar(ruta).then((r) => r.entradas.filter((e) => e.tipo === 'carpeta'))
}

interface ArbolProps {
  espacio: Espacio
  /** Carpeta resaltada; null si este espacio no es el que se está mirando. */
  rutaActual: string | null
  onNavegar: (ruta: string) => void
  /** Cambia cuando algo se creó, movió o borró: las ramas abiertas se releen. */
  version: number
  /** Suelta algo arrastrado sobre una carpeta del árbol. Solo donde se puede mover. */
  onSoltar?: (rutasOrigen: string[], destino: string) => void
  /** Carpetas que no se pueden elegir (la que se está moviendo y lo de adentro). */
  bloqueadas?: string[]
}

export function ArbolCarpetas({ espacio, rutaActual, onNavegar, version, onSoltar, bloqueadas = [] }: ArbolProps) {
  return (
    <div role="tree" aria-label={espacio.etiqueta} className={styles.arbol}>
      <Nodo
        espacio={espacio}
        ruta={espacio.raiz}
        etiqueta={espacio.etiqueta}
        nivel={0}
        rutaActual={rutaActual}
        onNavegar={onNavegar}
        version={version}
        onSoltar={onSoltar}
        bloqueadas={bloqueadas}
      />
    </div>
  )
}

interface NodoProps extends Omit<ArbolProps, 'espacio'> {
  espacio: Espacio
  ruta: string
  etiqueta: string
  nivel: number
  restringida?: boolean
}

function Nodo({ espacio, ruta, etiqueta, nivel, restringida, rutaActual, onNavegar, version, onSoltar, bloqueadas = [] }: NodoProps) {
  // `manual` es lo que el usuario decidió con la flecha; sin decisión, un nodo
  // está abierto si el espacio es el activo y la carpeta actual cuelga de él.
  const [manual, setManual] = useState<boolean | null>(null)
  const [hijos, setHijos] = useState<EntradaStorage[] | null>(null)
  const [fallo, setFallo] = useState(false)
  const [encima, setEncima] = useState(false)

  const esActual = rutaActual === ruta
  const cuelgaDeAqui = rutaActual !== null && rutaActual !== ruta && estaDentro(rutaActual, ruta)
  const abierto = manual ?? (cuelgaDeAqui || (nivel === 0 && rutaActual !== null))
  const bloqueada = bloqueadas.some((b) => estaDentro(ruta, b))

  useEffect(() => {
    if (!abierto) return
    let vigente = true
    carpetasDe(espacio, ruta)
      .then((c) => {
        if (!vigente) return
        setHijos(c)
        setFallo(false)
      })
      .catch(() => vigente && setFallo(true))
    return () => {
      vigente = false
    }
  }, [abierto, espacio, ruta, version])

  function alSoltar(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setEncima(false)
    if (!onSoltar) return
    const arrastre = leerArrastre(e.dataTransfer.getData(TIPO_MOVER))
    // Solo se mueve dentro del mismo espacio: disco y bucket son mundos distintos.
    if (arrastre && arrastre.espacio === espacio.id && arrastre.rutas.length) onSoltar(arrastre.rutas, ruta)
  }

  return (
    <div role="none">
      <div
        role="treeitem"
        aria-selected={esActual}
        aria-expanded={abierto}
        className={cn(styles.fila, esActual && styles.actual, encima && styles.encima, bloqueada && styles.bloqueada)}
        style={{ paddingLeft: 6 + nivel * 14 }}
        onDragOver={onSoltar ? (e) => { e.preventDefault(); setEncima(true) } : undefined}
        onDragLeave={onSoltar ? () => setEncima(false) : undefined}
        onDrop={onSoltar ? alSoltar : undefined}
      >
        <button
          type="button"
          className={styles.flecha}
          aria-label={abierto ? `Cerrar ${etiqueta}` : `Abrir ${etiqueta}`}
          onClick={() => setManual(!abierto)}
        >
          <span className={cn(styles.chevron, abierto && styles.chevronAbierto)} aria-hidden />
        </button>
        <button
          type="button"
          className={styles.nombre}
          disabled={bloqueada}
          onClick={() => {
            onNavegar(ruta)
            if (!abierto) setManual(true)
          }}
        >
          <IconoCarpeta color={nivel === 0 ? espacio.acento : undefined} restringida={restringida} className={styles.icono} />
          <span className={styles.texto}>{nivel === 0 ? etiqueta : nombreVisible(etiqueta)}</span>
        </button>
      </div>
      {abierto && (
        <div role="group" className={styles.grupo}>
          {fallo && <p className={styles.aviso} style={{ paddingLeft: 26 + nivel * 14 }}>No se pudo leer.</p>}
          {!fallo && hijos === null && <p className={styles.aviso} style={{ paddingLeft: 26 + nivel * 14 }}>Cargando…</p>}
          {hijos?.map((h) => (
            <NodoHijo
              key={h.ruta}
              entrada={h}
              espacio={espacio}
              nivel={nivel + 1}
              rutaActual={rutaActual}
              onNavegar={onNavegar}
              version={version}
              onSoltar={onSoltar}
              bloqueadas={bloqueadas}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function NodoHijo({ entrada, ...resto }: Omit<NodoProps, 'ruta' | 'etiqueta'> & { entrada: EntradaStorage }) {
  return (
    <div className={styles.hijo}>
      <Nodo {...resto} ruta={entrada.ruta} etiqueta={entrada.nombre} restringida={entrada.restringida} />
    </div>
  )
}
