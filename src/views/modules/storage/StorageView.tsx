import { useCallback, useEffect, useRef, useState } from 'react'
import type { DragEvent } from 'react'
import { Header } from '@/components/layout/Header'
import { Card } from '@/components/ui/Card'
import { IconCarpeta, IconArchivoPlano } from '@/components/ui/icons'
import { cn } from '@/lib/cn'
import { formatDateTimeCL } from '@/lib/locale'
import {
  crearCarpeta,
  eliminar,
  listar,
  listarR2,
  mover,
  renombrar,
  subirArchivos,
  urlDescarga,
  urlDescargaR2,
} from '@/features/storage'
import type { EntradaStorage } from '@/features/storage'
import styles from './StorageView.module.css'

type Pestana = 'local' | 'r2'

const TIPO_MOVER = 'application/x-storage-ruta'

function formatoTamano(bytes: number | null): string {
  if (bytes === null) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// ---------------------------------------------------------------------------
// Panel local (mismo que antes)
// ---------------------------------------------------------------------------

function PanelLocal() {
  const [rutaActual, setRutaActual] = useState('')
  const [entradas, setEntradas] = useState<EntradaStorage[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [arrastrandoArchivos, setArrastrandoArchivos] = useState(false)
  const [carpetaSobrevolada, setCarpetaSobrevolada] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const refrescar = useCallback(async (ruta: string) => {
    try {
      const resultado = await listar(ruta)
      setEntradas(resultado.entradas)
      setError(null)
    } catch {
      setError('No se pudo conectar con el backend.')
    }
  }, [])

  useEffect(() => {
    setEntradas(null)
    refrescar(rutaActual)
  }, [rutaActual, refrescar])

  async function subir(lista: FileList | File[]) {
    const archivosArray = Array.from(lista)
    if (archivosArray.length === 0) return
    setOcupado(true)
    setError(null)
    try {
      await subirArchivos(rutaActual, archivosArray)
      await refrescar(rutaActual)
    } catch {
      setError('No se pudo subir el archivo. Revisa que el backend esté corriendo.')
    } finally {
      setOcupado(false)
    }
  }

  async function crear() {
    const nombre = prompt('Nombre de la nueva carpeta:')
    if (!nombre || !nombre.trim()) return
    setError(null)
    try {
      await crearCarpeta(rutaActual, nombre.trim())
      await refrescar(rutaActual)
    } catch {
      setError('No se pudo crear la carpeta.')
    }
  }

  async function renombrarEntrada(entrada: EntradaStorage) {
    const nombreNuevo = prompt(`Nuevo nombre para "${entrada.nombre}":`, entrada.nombre)
    if (!nombreNuevo || !nombreNuevo.trim() || nombreNuevo.trim() === entrada.nombre) return
    setError(null)
    try {
      await renombrar(entrada.ruta, nombreNuevo.trim())
      await refrescar(rutaActual)
    } catch {
      setError('No se pudo renombrar (¿ya existe algo con ese nombre?).')
    }
  }

  async function eliminarEntrada(entrada: EntradaStorage) {
    const aviso =
      entrada.tipo === 'carpeta'
        ? `¿Eliminar la carpeta "${entrada.nombre}" y todo su contenido?`
        : `¿Eliminar "${entrada.nombre}"?`
    if (!confirm(aviso)) return
    setError(null)
    try {
      await eliminar(entrada.ruta)
      await refrescar(rutaActual)
    } catch {
      setError('No se pudo eliminar.')
    }
  }

  async function moverEntrada(rutaOrigen: string, rutaDestino: string) {
    setError(null)
    try {
      await mover(rutaOrigen, rutaDestino)
      await refrescar(rutaActual)
    } catch {
      setError('No se pudo mover (¿ya existe algo con ese nombre en esa carpeta?).')
    }
  }

  function onDropZona(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setArrastrandoArchivos(false)
    if (e.dataTransfer.types.includes(TIPO_MOVER)) {
      const rutaOrigen = e.dataTransfer.getData(TIPO_MOVER)
      if (rutaOrigen) moverEntrada(rutaOrigen, rutaActual)
      return
    }
    subir(e.dataTransfer.files)
  }

  function onDropCarpeta(e: DragEvent<HTMLTableRowElement>, carpeta: EntradaStorage) {
    e.preventDefault()
    e.stopPropagation()
    setCarpetaSobrevolada(null)
    const rutaOrigen = e.dataTransfer.getData(TIPO_MOVER)
    if (rutaOrigen && rutaOrigen !== carpeta.ruta) moverEntrada(rutaOrigen, carpeta.ruta)
  }

  const migas = rutaActual ? rutaActual.split('/') : []

  return (
    <>
      <div className={styles.barraSuperior}>
        <nav className={styles.migas}>
          <button
            type="button"
            onClick={() => setRutaActual('')}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              const rutaOrigen = e.dataTransfer.getData(TIPO_MOVER)
              if (rutaOrigen) moverEntrada(rutaOrigen, '')
            }}
            className={cn(!rutaActual && styles.migaActiva)}
          >
            Storage
          </button>
          {migas.map((nombre, i) => {
            const ruta = migas.slice(0, i + 1).join('/')
            return (
              <span key={ruta} className={styles.migaGrupo}>
                <span className={styles.migaSeparador}>/</span>
                <button
                  type="button"
                  onClick={() => setRutaActual(ruta)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault()
                    const rutaOrigen = e.dataTransfer.getData(TIPO_MOVER)
                    if (rutaOrigen) moverEntrada(rutaOrigen, ruta)
                  }}
                  className={cn(i === migas.length - 1 && styles.migaActiva)}
                >
                  {nombre}
                </button>
              </span>
            )
          })}
        </nav>
        <button type="button" className={styles.botonCarpeta} onClick={crear}>
          + Nueva carpeta
        </button>
      </div>

      <div
        className={cn(styles.zona, arrastrandoArchivos && styles.zonaActiva)}
        onDragOver={(e) => {
          e.preventDefault()
          setArrastrandoArchivos(true)
        }}
        onDragLeave={() => setArrastrandoArchivos(false)}
        onDrop={onDropZona}
        onClick={() => inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          hidden
          onChange={(e) => e.target.files && subir(e.target.files)}
        />
        <p className={styles.zonaTexto}>
          {ocupado ? 'Subiendo…' : 'Arrastra archivos aquí, o haz clic para elegirlos'}
        </p>
      </div>

      {error && <p className={styles.error}>{error}</p>}

      <TablaEntradas
        entradas={entradas}
        onNavegar={setRutaActual}
        onRenombrar={renombrarEntrada}
        onEliminar={eliminarEntrada}
        carpetaSobrevolada={carpetaSobrevolada}
        onDropCarpeta={onDropCarpeta}
        onDragLeave={(ruta) => setCarpetaSobrevolada((c) => (c === ruta ? null : c))}
        onDragOverCarpeta={(ruta) => setCarpetaSobrevolada(ruta)}
        urlDescarga={urlDescarga}
        draggable
      />

      <p className={styles.ayuda}>
        Puedes arrastrar un archivo o carpeta hacia otra carpeta de la lista para moverlo, o hacia las migas de arriba.
      </p>
    </>
  )
}

// ---------------------------------------------------------------------------
// Panel R2 (solo lectura)
// ---------------------------------------------------------------------------

const R2_RAIZ = 'accutab/mail'

function PanelR2() {
  const [prefijoActual, setPrefijoActual] = useState(R2_RAIZ)
  const [entradas, setEntradas] = useState<EntradaStorage[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refrescar = useCallback(async (prefijo: string) => {
    setEntradas(null)
    try {
      const resultado = await listarR2(prefijo)
      setEntradas(resultado.entradas)
      setError(null)
    } catch {
      setError('No se pudo conectar con R2. Verifica que el backend tenga las credenciales R2 en .env.')
    }
  }, [])

  useEffect(() => {
    refrescar(prefijoActual)
  }, [prefijoActual, refrescar])

  // Migas de pan relativas a R2_RAIZ
  const migas = prefijoActual.split('/').filter(Boolean)
  const migasRaiz = R2_RAIZ.split('/').filter(Boolean)

  return (
    <>
      <div className={styles.barraSuperior}>
        <nav className={styles.migas}>
          {migas.map((nombre, i) => {
            const ruta = migas.slice(0, i + 1).join('/')
            const esRaiz = i < migasRaiz.length
            return (
              <span key={ruta} className={styles.migaGrupo}>
                {i > 0 && <span className={styles.migaSeparador}>/</span>}
                <button
                  type="button"
                  onClick={() => !esRaiz && setPrefijoActual(ruta)}
                  className={cn(i === migas.length - 1 ? styles.migaActiva : !esRaiz && '')}
                  style={esRaiz ? { color: 'var(--color-text-faint)', cursor: 'default' } : undefined}
                >
                  {nombre}
                </button>
              </span>
            )
          })}
        </nav>
        <span style={{ fontSize: 12, color: 'var(--color-text-faint)' }}>Solo lectura</span>
      </div>

      {error && <p className={styles.error}>{error}</p>}

      <TablaEntradas
        entradas={entradas}
        onNavegar={setPrefijoActual}
        urlDescarga={urlDescargaR2}
        draggable={false}
      />
    </>
  )
}

// ---------------------------------------------------------------------------
// Tabla reutilizable
// ---------------------------------------------------------------------------

interface TablaEntradasProps {
  entradas: EntradaStorage[] | null
  onNavegar: (ruta: string) => void
  onRenombrar?: (e: EntradaStorage) => void
  onEliminar?: (e: EntradaStorage) => void
  carpetaSobrevolada?: string | null
  onDropCarpeta?: (ev: DragEvent<HTMLTableRowElement>, carpeta: EntradaStorage) => void
  onDragLeave?: (ruta: string) => void
  onDragOverCarpeta?: (ruta: string) => void
  urlDescarga: (ruta: string) => string
  draggable?: boolean
}

function TablaEntradas({
  entradas,
  onNavegar,
  onRenombrar,
  onEliminar,
  carpetaSobrevolada,
  onDropCarpeta,
  onDragLeave,
  onDragOverCarpeta,
  urlDescarga: getUrl,
  draggable = false,
}: TablaEntradasProps) {
  if (entradas === null) return <p className={styles.estado}>Cargando…</p>
  if (entradas.length === 0) return <p className={styles.estado}>Esta carpeta está vacía.</p>

  return (
    <div className={styles.tablaCaja}>
      <table className={styles.tabla}>
        <thead>
          <tr>
            <th>Nombre</th>
            <th>Tamaño</th>
            <th>Modificado</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {entradas.map((e) => (
            <tr
              key={e.ruta}
              draggable={draggable}
              onDragStart={draggable ? (ev) => ev.dataTransfer.setData(TIPO_MOVER, e.ruta) : undefined}
              onDragOver={
                e.tipo === 'carpeta' && onDragOverCarpeta
                  ? (ev) => { ev.preventDefault(); onDragOverCarpeta(e.ruta) }
                  : undefined
              }
              onDragLeave={onDragLeave ? () => onDragLeave(e.ruta) : undefined}
              onDrop={e.tipo === 'carpeta' && onDropCarpeta ? (ev) => onDropCarpeta(ev, e) : undefined}
              className={cn(carpetaSobrevolada === e.ruta && styles.filaSobrevolada)}
            >
              <td className={styles.nombre}>
                {e.tipo === 'carpeta' ? (
                  <button type="button" className={styles.nombreCarpeta} onClick={() => onNavegar(e.ruta)}>
                    <IconCarpeta className={styles.icono} />
                    {e.nombre}
                  </button>
                ) : (
                  <span className={styles.nombreArchivo}>
                    <IconArchivoPlano className={styles.icono} />
                    {e.nombre}
                  </span>
                )}
              </td>
              <td className={styles.mono}>{formatoTamano(e.tamano_bytes)}</td>
              <td className={styles.mono}>{e.modificado ? formatDateTimeCL(e.modificado) : '—'}</td>
              <td className={styles.acciones}>
                {e.tipo === 'archivo' && (
                  <a className={styles.boton} href={getUrl(e.ruta)} target="_blank" rel="noreferrer">
                    Descargar
                  </a>
                )}
                {onRenombrar && (
                  <button className={styles.boton} onClick={() => onRenombrar(e)}>
                    Renombrar
                  </button>
                )}
                {onEliminar && (
                  <button className={styles.botonEliminar} onClick={() => onEliminar(e)}>
                    Eliminar
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Vista principal
// ---------------------------------------------------------------------------

export function StorageView() {
  const [pestana, setPestana] = useState<Pestana>('local')

  return (
    <div>
      <Header
        title="Storage"
        description="Archivos y carpetas guardados en el servidor de AgroFresh."
      />

      <Card>
        <div className={styles.pestanas}>
          <button
            type="button"
            className={cn(styles.pestana, pestana === 'local' && styles.pestanaActiva)}
            onClick={() => setPestana('local')}
          >
            Local
          </button>
          <button
            type="button"
            className={cn(styles.pestana, pestana === 'r2' && styles.pestanaActiva)}
            onClick={() => setPestana('r2')}
          >
            Accutab
            <span className={styles.badgeR2}>R2</span>
          </button>
        </div>

        {pestana === 'local' ? <PanelLocal /> : <PanelR2 />}
      </Card>
    </div>
  )
}
