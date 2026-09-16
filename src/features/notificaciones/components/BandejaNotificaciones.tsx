import { createPortal } from 'react-dom'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { ROUTES } from '@/constants/routes'
import type { CategoriaNotificacion, Notificacion } from '../types'
import { useNotificaciones } from '../hooks/useNotificaciones'
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

function formatFecha(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' })
}

// ── Componente principal ─────────────────────────────────────────────────

interface Props {
  onCerrar: () => void
}

function BandejaInterna({ onCerrar }: Props) {
  const navigate = useNavigate()
  const { notificaciones, noLeidas, cargando, marcarLeida, marcarTodasLeidas } = useNotificaciones()
  const [seleccionada, setSeleccionada] = useState<Notificacion | null>(null)
  const [filtro, setFiltro] = useState<CategoriaNotificacion | null>(null)

  const visibles = filtro ? notificaciones.filter((n) => n.categoria === filtro) : notificaciones

  function seleccionar(n: Notificacion) {
    setSeleccionada(n)
    if (!n.leida) marcarLeida(n.id)
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
            <button type="button" className={styles.btnLeerTodas} onClick={marcarTodasLeidas}>
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
          {cargando && (
            <p className={styles.vacia}>Cargando notificaciones…</p>
          )}
          {!cargando && visibles.length === 0 && (
            <p className={styles.vacia}>No hay notificaciones{filtro ? ' en esta categoría' : ''}.</p>
          )}
          {!cargando && visibles.map((n) => (
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
                  {!n.leida && <span className={styles.puntito} aria-label="No leída" />}
                  {n.titulo}
                </div>
                <div className={styles.itemResumen}>{n.resumen}</div>
                <div className={styles.itemMeta}>
                  <span className={badgeClass(n.categoria)}>
                    {CATEGORIAS.find((c) => c.id === n.categoria)?.label ?? n.categoria}
                  </span>
                  {n.creado_en && (
                    <span className={styles.fecha}>{formatFecha(n.creado_en)}</span>
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
                    <span>{formatFecha(seleccionada.creado_en)}</span>
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
