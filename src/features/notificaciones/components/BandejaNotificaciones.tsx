import { createPortal } from 'react-dom'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { ROUTES } from '@/constants/routes'
import type { CategoriaNotificacion, Notificacion } from '../types'
import { useNotificaciones } from '../hooks/useNotificaciones'
import { notificacionesApi } from '../api/notificacionesApi'
import { fechaHoraCorta, fechaHoraLarga, palabrasDe, resaltar } from '../lib/formato'
import styles from './BandejaNotificaciones.module.css'

// ── Renderer de cuerpo estilo Markdown ─────────────────────────────────

function renderInline(text: string): ReactNode {
  const partes = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g)
  return partes.map((parte, i) => {
    if (/^\*\*[^*]+\*\*$/.test(parte)) return <strong key={i}>{parte.slice(2, -2)}</strong>
    if (/^\*[^*]+\*$/.test(parte))     return <em key={i}>{parte.slice(1, -1)}</em>
    if (/^`[^`]+`$/.test(parte))       return <code key={i}>{parte.slice(1, -1)}</code>
    return parte
  })
}

function RenderCuerpo({ texto }: { texto: string }) {
  const bloques = texto.split(/\n{2,}/)
  const nodos = bloques.map((bloque, i) => {
    const lineas = bloque.trim().split('\n')

    if (/^###\s/.test(lineas[0])) return <h3 key={i}>{renderInline(lineas[0].replace(/^###\s/, ''))}</h3>
    if (/^##\s/.test(lineas[0]))  return <h2 key={i}>{renderInline(lineas[0].replace(/^##\s/, ''))}</h2>
    if (/^#\s/.test(lineas[0]))   return <h1 key={i}>{renderInline(lineas[0].replace(/^#\s/, ''))}</h1>
    if (/^---+$/.test(lineas[0])) return <hr key={i} />

    const esBullet = lineas.every((l) => /^[-*]\s/.test(l.trim()) || l.trim() === '')
    if (esBullet) {
      return (
        <ul key={i}>
          {lineas.filter((l) => /^[-*]\s/.test(l.trim())).map((l, j) => (
            <li key={j}>{renderInline(l.replace(/^[-*]\s/, '').trim())}</li>
          ))}
        </ul>
      )
    }

    return <p key={i}>{lineas.map((l, j) => (j === 0 ? renderInline(l) : [<br key={j} />, renderInline(l)]))}</p>
  })

  return <div className={styles.cuerpoContenido}>{nodos}</div>
}

// ── Helpers ─────────────────────────────────────────────────────────────

const CATEGORIAS: { id: CategoriaNotificacion; label: string; color: string }[] = [
  { id: 'actualizacion', label: 'Actualizaciones', color: '#16a34a' },
  { id: 'sistema',       label: 'Sistema',          color: '#2563eb' },
  { id: 'cromatografia', label: 'Cromatografía',    color: '#7c3aed' },
]

function badgeClass(cat: CategoriaNotificacion) {
  return cn(styles.badge, styles[cat as keyof typeof styles])
}

/** El texto con las palabras buscadas resaltadas. */
function Resaltado({ texto, palabras }: { texto: string; palabras: string[] }) {
  return (
    <>
      {resaltar(texto, palabras).map((t, i) =>
        t.coincide ? <mark key={i} className={styles.coincide}>{t.texto}</mark> : t.texto,
      )}
    </>
  )
}

/** Lo que devolvió el servidor para una búsqueda. */
interface ResultadoBusqueda {
  q: string
  items: Notificacion[]
  error?: boolean
}

// El servidor corta la búsqueda en las 200 más recientes (`listar` en
// app/notificaciones.py).
const TOPE_BUSQUEDA = 200

// ── Componente principal ─────────────────────────────────────────────────

interface Props {
  onCerrar: () => void
}

function BandejaInterna({ onCerrar }: Props) {
  const navigate = useNavigate()
  const { notificaciones, noLeidas, cargando, marcarLeida, marcarTodasLeidas } = useNotificaciones()
  const [seleccionada, setSeleccionada] = useState<Notificacion | null>(null)
  const [filtro, setFiltro] = useState<CategoriaNotificacion | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [resultado, setResultado] = useState<ResultadoBusqueda | null>(null)
  // Las que se leyeron mientras se miraban resultados de búsqueda (esas no
  // están en la lista del hook, que solo trae las 60 recientes).
  const [leidasAca, setLeidasAca] = useState<Set<number>>(() => new Set())
  const [todasLeidas, setTodasLeidas] = useState(false)

  const q = busqueda.trim()
  const palabras = palabrasDe(q)

  // La búsqueda va al servidor -busca en TODAS, no solo en las 60 cargadas-,
  // con una pausa de 300 ms para no consultar a cada tecla.
  useEffect(() => {
    if (!q) return
    let activo = true
    const t = setTimeout(() => {
      notificacionesApi
        .listar(q)
        .then((items) => { if (activo) setResultado({ q, items }) })
        .catch(() => { if (activo) setResultado({ q, items: [], error: true }) })
    }, 300)
    return () => {
      activo = false
      clearTimeout(t)
    }
  }, [q])

  const buscando = q !== '' && resultado?.q !== q
  const encontradas = q ? (resultado?.q === q ? resultado.items : []) : null
  const base = encontradas ?? notificaciones
  const visibles = filtro ? base.filter((n) => n.categoria === filtro) : base
  const esLeida = (n: Notificacion) => n.leida || todasLeidas || leidasAca.has(n.id)

  function seleccionar(n: Notificacion) {
    setSeleccionada(n)
    if (!esLeida(n)) {
      marcarLeida(n.id)
      setLeidasAca((prev) => new Set(prev).add(n.id))
    }
  }

  function leerTodas() {
    marcarTodasLeidas()
    setTodasLeidas(true)
  }

  const haySplit = seleccionada !== null

  return (
    <>
      <div className={styles.backdrop} onClick={onCerrar} />
      <div className={styles.panel} role="dialog" aria-modal="true" aria-label="Notificaciones">

        {/* Cabecera */}
        <div className={styles.cabecera}>
          <span className={styles.titulo}>
            Notificaciones{noLeidas > 0 ? ` · ${noLeidas}` : ''}
          </span>
          {noLeidas > 0 && (
            <button type="button" className={styles.btnLeerTodas} onClick={leerTodas}>
              Marcar todas como leídas
            </button>
          )}
          <button type="button" className={styles.btnCerrar} onClick={onCerrar} aria-label="Cerrar">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="3" y1="3" x2="13" y2="13" />
              <line x1="13" y1="3" x2="3" y2="13" />
            </svg>
          </button>
        </div>

        {/* Buscador */}
        <div className={styles.buscador}>
          <svg className={styles.buscadorIcono} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
            <circle cx="7" cy="7" r="4.5" />
            <line x1="10.5" y1="10.5" x2="14" y2="14" />
          </svg>
          <input
            type="search"
            className={styles.buscadorInput}
            placeholder="Buscar por nombre, OT, número…"
            aria-label="Buscar notificaciones"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape' && busqueda) { e.stopPropagation(); setBusqueda('') } }}
          />
          {busqueda && (
            <button
              type="button"
              className={styles.buscadorLimpiar}
              onClick={() => setBusqueda('')}
              aria-label="Limpiar búsqueda"
            >
              ×
            </button>
          )}
        </div>
        {q && !buscando && encontradas && (
          <p className={styles.buscadorEstado} role="status">
            {resultado?.error
              ? 'No se pudo buscar. Revisa la conexión e intenta de nuevo.'
              : encontradas.length === 0
                ? `Sin resultados para «${q}».`
                : `${encontradas.length === TOPE_BUSQUEDA ? `Las ${TOPE_BUSQUEDA} más recientes` : encontradas.length} ${encontradas.length === 1 ? 'resultado' : 'resultados'} para «${q}»${encontradas.length === TOPE_BUSQUEDA ? ': agrega otra palabra para acotar' : ''}.`}
          </p>
        )}

        {/* Filtros de categoría */}
        <div className={styles.filtros}>
          <button
            type="button"
            className={cn(styles.filtroBtn, filtro === null && styles.filtroBtnActivo)}
            onClick={() => setFiltro(null)}
          >
            Todas
          </button>
          {CATEGORIAS.map((c) => (
            <button
              key={c.id}
              type="button"
              className={cn(styles.filtroBtn, filtro === c.id && styles.filtroBtnActivo)}
              onClick={() => setFiltro(filtro === c.id ? null : c.id)}
            >
              <span
                className={styles.filtroDot}
                style={filtro !== c.id ? { background: c.color } : { background: '#fff' }}
              />
              {c.label}
            </button>
          ))}
        </div>

        {/* Lista */}
        <div className={haySplit ? styles.listaSplit : styles.lista}>
          {(q ? buscando : cargando) && (
            <p className={styles.vacia}>{q ? 'Buscando…' : 'Cargando notificaciones…'}</p>
          )}
          {!q && !cargando && visibles.length === 0 && (
            <p className={styles.vacia}>No hay notificaciones{filtro ? ' en esta categoría' : ''}.</p>
          )}
          {q && !buscando && encontradas && encontradas.length > 0 && visibles.length === 0 && (
            <p className={styles.vacia}>Ningún resultado en esta categoría.</p>
          )}
          {!(q ? buscando : cargando) && visibles.map((n) => (
            <div
              key={n.id}
              className={cn(styles.item, seleccionada?.id === n.id && styles.itemActivo)}
              onClick={() => seleccionar(n)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') seleccionar(n) }}
            >
              <div className={styles.itemCuerpo}>
                <div className={styles.itemTitulo}>
                  {!esLeida(n) && <span className={styles.puntito} aria-label="No leída" />}
                  {/* Un solo span: el título es flex y separaría cada tramo resaltado. */}
                  <span><Resaltado texto={n.titulo} palabras={palabras} /></span>
                </div>
                <div className={styles.itemResumen}>
                  <Resaltado texto={n.resumen} palabras={palabras} />
                </div>
                <div className={styles.itemMeta}>
                  <span className={badgeClass(n.categoria)}>
                    {CATEGORIAS.find((c) => c.id === n.categoria)?.label ?? n.categoria}
                  </span>
                  {n.creado_en && (
                    <time className={styles.fecha} dateTime={n.creado_en} title={fechaHoraLarga(n.creado_en)}>
                      {fechaHoraCorta(n.creado_en)}
                    </time>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Vista detalle (abajo de la lista, cuando hay selección) */}
        {seleccionada && (
          <>
            <div className={styles.separador} />
            <div className={styles.detalle}>
              <div className={styles.detalleHeader}>
                <h2 className={styles.detalleTitulo}>{seleccionada.titulo}</h2>
                <div className={styles.detalleMeta}>
                  <span className={badgeClass(seleccionada.categoria)}>
                    {CATEGORIAS.find((c) => c.id === seleccionada.categoria)?.label ?? seleccionada.categoria}
                  </span>
                  {seleccionada.creado_por && (
                    <span className={styles.detalleAutor}>Por {seleccionada.creado_por}</span>
                  )}
                  {seleccionada.creado_en && (
                    <time dateTime={seleccionada.creado_en}>{fechaHoraLarga(seleccionada.creado_en)}</time>
                  )}
                </div>
              </div>
              {seleccionada.cuerpo ? (
                <RenderCuerpo texto={seleccionada.cuerpo} />
              ) : (
                <div className={styles.cuerpoContenido}><p>{seleccionada.resumen}</p></div>
              )}
              {seleccionada.metadata?.tipo === 'verificacion' && (
                <button
                  type="button"
                  className={styles.btnVerificacion}
                  onClick={() => {
                    navigate(
                      `${ROUTES.agrofreshLabVerificacionesHistorico}?fecha=${seleccionada.metadata!.fecha}`,
                    )
                    onCerrar()
                  }}
                >
                  Ir a la verificación del {seleccionada.metadata.fecha} →
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </>
  )
}

export function BandejaNotificaciones(props: Props) {
  return createPortal(<BandejaInterna {...props} />, document.body)
}
