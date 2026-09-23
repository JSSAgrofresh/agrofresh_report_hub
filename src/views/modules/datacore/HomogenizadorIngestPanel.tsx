import { useCallback, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import {
  analizarExcel,
  cancelarIngesta,
  confirmarIngesta,
} from '@/features/homogenizadorIngesta'
import type { AnalisisIngesta, ValorAnalizado } from '@/features/homogenizadorIngesta'
import styles from './HomogenizadorIngestPanel.module.css'

type Col = 'sold_to' | 'ship_to' | 'especie' | 'variedad'

const ETIQUETAS: Record<Col, string> = {
  sold_to: 'Sold To',
  ship_to: 'Ship To',
  especie: 'Especie',
  variedad: 'Variedad',
}

const COLUMNAS: Col[] = ['sold_to', 'ship_to', 'especie', 'variedad']

/** Estado del mapeo para cada valor crudo de una columna.
 * "" significa "descartar todas las filas con este valor".
 * undefined significa "sin resolver todavía". */
type Mapeos = Record<Col, Record<string, string>>

function mapeoInicial(analisis: AnalisisIngesta): Mapeos {
  const m: Mapeos = { sold_to: {}, ship_to: {}, especie: {}, variedad: {} }
  for (const col of COLUMNAS) {
    for (const v of analisis.columnas[col]) {
      if (v.automatico && v.sugerencia_auto) {
        m[col][v.valor_crudo] = v.sugerencia_auto
      }
    }
  }
  return m
}

function contarPendientes(_col: Col, valores: ValorAnalizado[], mapeos: Record<string, string>): number {
  return valores.filter((v) => mapeos[v.valor_crudo] === undefined).length
}

// ────────────────────────────────────────────────────────────
//  Sub-componente: tarjeta de un valor individual
// ────────────────────────────────────────────────────────────

interface TarjetaProps {
  v: ValorAnalizado
  destino: string | undefined
  onAsignar: (crudo: string, canonico: string) => void
  onDescartar: (crudo: string) => void
  onLimpiar: (crudo: string) => void
}

function Tarjeta({ v, destino, onAsignar, onDescartar, onLimpiar }: TarjetaProps) {
  const [editando, setEditando] = useState(false)
  const [texto, setTexto] = useState('')

  const estado =
    destino === undefined
      ? 'pendiente'
      : destino === ''
        ? 'descartado'
        : 'asignado'

  function confirmarTexto() {
    const t = texto.trim()
    if (t) onAsignar(v.valor_crudo, t)
    setEditando(false)
    setTexto('')
  }

  return (
    <div className={`${styles.tarjeta} ${styles[`tarjeta_${estado}`]}`}>
      <div className={styles.tarjetaEncabezado}>
        <span className={styles.tarjetaValor} title={v.valor_crudo}>
          {v.valor_crudo || <em className={styles.vacio}>(vacío)</em>}
        </span>
        <span className={styles.tarjetaFilas}>{v.filas} fila{v.filas !== 1 ? 's' : ''}</span>
      </div>

      {estado === 'asignado' && (
        <div className={styles.tarjetaMapeo}>
          <span className={styles.flecha}>→</span>
          <span className={styles.tarjetaDestino} title={destino}>{destino}</span>
          <button
            type="button"
            className={styles.btnQuitar}
            onClick={() => onLimpiar(v.valor_crudo)}
            title="Quitar mapeo"
          >
            ×
          </button>
        </div>
      )}

      {estado === 'descartado' && (
        <div className={styles.tarjetaDescartado}>
          <span>Filas descartadas</span>
          <button type="button" className={styles.btnQuitar} onClick={() => onLimpiar(v.valor_crudo)}>
            ×
          </button>
        </div>
      )}

      {estado === 'pendiente' && (
        <div className={styles.tarjetaSugerencias}>
          {v.sugerencias.slice(0, 3).map((s) => (
            <button
              key={s.valor}
              type="button"
              className={styles.chip}
              title={`${Math.round(s.confianza * 100)}% de confianza`}
              onClick={() => onAsignar(v.valor_crudo, s.valor)}
            >
              {s.valor}
              <span className={styles.chipPct}>{Math.round(s.confianza * 100)}%</span>
            </button>
          ))}
        </div>
      )}

      {estado === 'pendiente' && !editando && (
        <div className={styles.tarjetaAcciones}>
          <button type="button" className={styles.btnAsignar} onClick={() => setEditando(true)}>
            Asignar…
          </button>
          <button type="button" className={styles.btnDescartar} onClick={() => onDescartar(v.valor_crudo)}>
            Descartar
          </button>
        </div>
      )}

      {editando && (
        <div className={styles.tarjetaEdicion}>
          <input
            autoFocus
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') confirmarTexto()
              if (e.key === 'Escape') { setEditando(false); setTexto('') }
            }}
            placeholder="Nombre oficial exacto…"
          />
          <button type="button" className={styles.btnOk} onClick={confirmarTexto}>
            OK
          </button>
          <button type="button" className={styles.btnCancelarEdit} onClick={() => { setEditando(false); setTexto('') }}>
            ×
          </button>
        </div>
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────────
//  Panel principal
// ────────────────────────────────────────────────────────────

export function HomogenizadorIngestPanel() {
  const [etapa, setEtapa] = useState<'subir' | 'mapear' | 'listo'>('subir')
  const [analisis, setAnalisis] = useState<AnalisisIngesta | null>(null)
  const [mapeos, setMapeos] = useState<Mapeos>({ sold_to: {}, ship_to: {}, especie: {}, variedad: {} })
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resumen, setResumen] = useState<Record<string, number> | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // ── Subir y analizar ──────────────────────────────
  async function onSubir(archivo: File) {
    setCargando(true)
    setError(null)
    try {
      const r = await analizarExcel(archivo)
      setAnalisis(r)
      setMapeos(mapeoInicial(r))
      setEtapa('mapear')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo analizar el archivo.')
    } finally {
      setCargando(false)
    }
  }

  // ── Operaciones de mapeo ──────────────────────────
  const asignar = useCallback((col: Col, crudo: string, canonico: string) => {
    setMapeos((m) => ({ ...m, [col]: { ...m[col], [crudo]: canonico } }))
  }, [])

  const descartar = useCallback((col: Col, crudo: string) => {
    setMapeos((m) => ({ ...m, [col]: { ...m[col], [crudo]: '' } }))
  }, [])

  const limpiar = useCallback((col: Col, crudo: string) => {
    setMapeos((m) => {
      const copia = { ...m[col] }
      delete copia[crudo]
      return { ...m, [col]: copia }
    })
  }, [])

  // ── Smart match: aplica sugerencias automáticas ───
  function smartMatch() {
    if (!analisis) return
    setMapeos((m) => {
      const nuevo = { ...m }
      for (const col of COLUMNAS) {
        const parcial: Record<string, string> = { ...nuevo[col] }
        for (const v of analisis.columnas[col]) {
          if (parcial[v.valor_crudo] === undefined && v.automatico && v.sugerencia_auto) {
            parcial[v.valor_crudo] = v.sugerencia_auto
          }
        }
        nuevo[col] = parcial
      }
      return nuevo
    })
  }

  // ── Descartar todos los pendientes ────────────────
  function descartarPendientes() {
    if (!analisis) return
    setMapeos((m) => {
      const nuevo = { ...m }
      for (const col of COLUMNAS) {
        const parcial: Record<string, string> = { ...nuevo[col] }
        for (const v of analisis.columnas[col]) {
          if (parcial[v.valor_crudo] === undefined) {
            parcial[v.valor_crudo] = ''
          }
        }
        nuevo[col] = parcial
      }
      return nuevo
    })
  }

  // ── Confirmar ingesta ─────────────────────────────
  async function confirmar(preview = false) {
    if (!analisis) return
    setCargando(true)
    setError(null)
    try {
      const r = await confirmarIngesta(
        analisis.token,
        { sold_to: mapeos.sold_to, ship_to: mapeos.ship_to, especie: mapeos.especie, variedad: mapeos.variedad },
        preview,
      )
      if (!preview) {
        setResumen(r as unknown as Record<string, number>)
        setEtapa('listo')
      } else {
        setResumen(r as unknown as Record<string, number>)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al ingestar.')
    } finally {
      setCargando(false)
    }
  }

  async function cancelar() {
    if (analisis?.token) {
      try { await cancelarIngesta(analisis.token) } catch { /* ignorar */ }
    }
    setEtapa('subir')
    setAnalisis(null)
    setMapeos({ sold_to: {}, ship_to: {}, especie: {}, variedad: {} })
    setResumen(null)
    setError(null)
  }

  // ── Estadísticas rápidas ──────────────────────────
  const totalPendientes = analisis
    ? COLUMNAS.reduce((s, c) => s + contarPendientes(c, analisis.columnas[c], mapeos[c]), 0)
    : 0
  const totalDescartadas = analisis
    ? COLUMNAS.slice(0, 1).reduce(  // solo sold_to define si la fila entera se descarta
        (s, c) => s + Object.values(mapeos[c]).filter((v) => v === '').length,
        0,
      )
    : 0

  // ════════════════════════════════════════════════
  //  ETAPA 1: Subir archivo
  // ════════════════════════════════════════════════
  if (etapa === 'subir') {
    return (
      <div className={styles.wrapper}>
        <div className={styles.subir}>
          <h2 className={styles.titulo}>Cargar datos</h2>
          <p className={styles.bajada}>
            Sube el Excel de resultados. Antes de que nada entre a la base, revisarás
            los valores de <b>Sold To</b>, <b>Ship To</b>, <b>Especie</b> y <b>Variedad</b> y
            confirmarás a qué valores oficiales corresponden. Las filas sin asociación
            se pueden descartar con un clic.
          </p>
          <div
            className={styles.zona}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              const f = e.dataTransfer.files[0]
              if (f) void onSubir(f)
            }}
            onClick={() => inputRef.current?.click()}
          >
            {cargando ? (
              <span className={styles.zonaCargando}>Analizando archivo…</span>
            ) : (
              <>
                <span className={styles.zonaIcono}>📂</span>
                <span>Arrastra el Excel aquí, o haz clic para seleccionarlo</span>
                <span className={styles.zonaHint}>.xlsx</span>
              </>
            )}
          </div>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx"
            style={{ display: 'none' }}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void onSubir(f) }}
          />
          {error && <p className={styles.error}>{error}</p>}
        </div>
      </div>
    )
  }

  // ════════════════════════════════════════════════
  //  ETAPA 3: Listo
  // ════════════════════════════════════════════════
  if (etapa === 'listo' && resumen) {
    return (
      <div className={styles.wrapper}>
        <div className={styles.listo}>
          <div className={styles.listoIcono}>✓</div>
          <h2 className={styles.titulo}>Datos ingresados correctamente</h2>
          <div className={styles.resumeGrid}>
            <div className={styles.resumeStat}>
              <span className={styles.resumeNum}>{resumen.solicitudes_nuevas ?? 0}</span>
              <span>solicitudes nuevas</span>
            </div>
            <div className={styles.resumeStat}>
              <span className={styles.resumeNum}>{resumen.solicitudes_existentes ?? 0}</span>
              <span>ya existían</span>
            </div>
            <div className={styles.resumeStat}>
              <span className={styles.resumeNum}>{resumen.resultados ?? 0}</span>
              <span>resultados</span>
            </div>
            <div className={styles.resumeStat}>
              <span className={styles.resumeNum}>{resumen.descartadas ?? 0}</span>
              <span>filas descartadas</span>
            </div>
            {(resumen.pendientes_revision ?? 0) > 0 && (
              <div className={styles.resumeStat}>
                <span className={styles.resumeNum}>{resumen.pendientes_revision}</span>
                <span>pendientes de revisión</span>
              </div>
            )}
          </div>
          <Button onClick={() => { void cancelar() }}>Cargar otro archivo</Button>
        </div>
      </div>
    )
  }

  // ════════════════════════════════════════════════
  //  ETAPA 2: Mapear
  // ════════════════════════════════════════════════
  if (!analisis) return null

  return (
    <div className={styles.wrapper}>
      {/* Barra superior */}
      <div className={styles.topBar}>
        <div className={styles.topInfo}>
          <strong>{analisis.total_filas.toLocaleString('es-CL')}</strong> filas · {' '}
          {totalPendientes > 0
            ? <span className={styles.alert}>{totalPendientes} valor(es) sin asignar</span>
            : <span className={styles.ok}>Todos los valores mapeados</span>
          }
          {totalDescartadas > 0 && (
            <span className={styles.muted}> · {totalDescartadas} valor(es) de Sold To descartarán sus filas</span>
          )}
        </div>
        <div className={styles.topAcciones}>
          <button type="button" className={styles.btnSecundario} onClick={smartMatch} disabled={cargando}>
            ✨ Smart match
          </button>
          <button type="button" className={styles.btnSecundario} onClick={descartarPendientes} disabled={cargando}>
            Descartar pendientes
          </button>
          <button type="button" className={styles.btnSecundario} onClick={() => void cancelar()} disabled={cargando}>
            ← Cambiar archivo
          </button>
        </div>
      </div>

      {/* Tablero de 4 columnas */}
      <div className={styles.tablero}>
        {COLUMNAS.map((col) => {
          const valores = analisis.columnas[col]
          const pendientes = contarPendientes(col, valores, mapeos[col])
          const asignados = valores.filter((v) => mapeos[col][v.valor_crudo] !== undefined && mapeos[col][v.valor_crudo] !== '').length
          const descartados = valores.filter((v) => mapeos[col][v.valor_crudo] === '').length

          return (
            <div key={col} className={styles.columna}>
              <div className={styles.columnaHeader}>
                <span className={styles.columnaTitulo}>{ETIQUETAS[col]}</span>
                <span className={styles.columnaStats}>
                  {asignados > 0 && <span className={styles.ok}>{asignados} ✓</span>}
                  {descartados > 0 && <span className={styles.muted}>{descartados} ✕</span>}
                  {pendientes > 0 && <span className={styles.alert}>{pendientes} ·</span>}
                </span>
              </div>
              <div className={styles.columnaCuerpo}>
                {valores.length === 0 ? (
                  <p className={styles.columnaVacia}>Sin valores en el Excel</p>
                ) : (
                  valores.map((v) => (
                    <Tarjeta
                      key={v.valor_crudo}
                      v={v}
                      destino={mapeos[col][v.valor_crudo]}
                      onAsignar={(crudo, can) => asignar(col, crudo, can)}
                      onDescartar={(crudo) => descartar(col, crudo)}
                      onLimpiar={(crudo) => limpiar(col, crudo)}
                    />
                  ))
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Preview */}
      {resumen && (
        <div className={styles.previewBanner}>
          <strong>Preview:</strong>{' '}
          {resumen.solicitudes_nuevas} solicitudes nuevas, {resumen.resultados} resultados,{' '}
          {resumen.descartadas} filas descartadas, {resumen.pendientes_revision} pendientes de revisión.
        </div>
      )}

      {error && <p className={styles.error}>{error}</p>}

      {/* Barra de acción */}
      <div className={styles.accionesBar}>
        <button
          type="button"
          className={styles.btnSecundario}
          disabled={cargando}
          onClick={() => void confirmar(true)}
        >
          Vista previa
        </button>
        <Button
          disabled={cargando || totalPendientes > 0}
          onClick={() => {
            if (totalDescartadas > 0) {
              const msg = `Se descartarán filas con ${totalDescartadas} valor(es) de Sold To sin mapeo. ¿Continuar?`
              if (!confirm(msg)) return
            }
            void confirmar(false)
          }}
        >
          {cargando ? 'Procesando…' : 'Ingestar a la base de datos'}
        </Button>
        {totalPendientes > 0 && (
          <span className={styles.hint}>
            Asigna o descarta todos los valores pendientes antes de ingestar.
          </span>
        )}
      </div>
    </div>
  )
}
