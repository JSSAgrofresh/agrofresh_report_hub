import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { Header } from '@/components/layout/Header'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { areaDeModulo } from '@/constants/areas'
import {
  auditar,
  corregirGrupo,
  crearStaging,
  descartarStaging,
  estadoStaging,
  listarTablas,
  promover,
  verTabla,
} from '@/features/auditoria'
import type { EstadoStaging, GrupoInconsistencia, InfoTabla, PaginaTabla, ResultadoAuditoria } from '@/features/auditoria'
import { HttpError } from '@/services/http/client'
import { ErDiagrama } from './ErDiagrama'
import styles from './DataCoreView.module.css'

type Vista = 'tabla' | 'modelo'
const TAMANO_PAGINA = 30

interface Corregido {
  clave: string
  etiqueta: string
  valor: string
  filas: number
}

export function DataCoreView() {
  const acento = areaDeModulo('datacore')?.colorPrimario ?? 'var(--color-primary)'
  const wrapStyle = { '--acento': acento } as CSSProperties

  const [vista, setVista] = useState<Vista>('modelo')

  const [tablas, setTablas] = useState<InfoTabla[] | null>(null)
  const [tablaActiva, setTablaActiva] = useState<string>('solicitud')
  const [pagina, setPagina] = useState(1)
  const [datosTabla, setDatosTabla] = useState<PaginaTabla | null>(null)
  const [cargandoTabla, setCargandoTabla] = useState(false)

  const [staging, setStaging] = useState<EstadoStaging | null>(null)
  const [staginBusy, setStagingBusy] = useState(false)

  const [auditoria, setAuditoria] = useState<ResultadoAuditoria | null>(null)
  const [auditando, setAuditando] = useState(false)
  const [grupoAbierto, setGrupoAbierto] = useState<number | null>(null)
  const [corrigiendo, setCorrigiendo] = useState<string | null>(null)
  const [corregidos, setCorregidos] = useState<Corregido[]>([])
  const [error, setError] = useState<string | null>(null)
  const [promoviendo, setPromoviendo] = useState(false)

  useEffect(() => {
    listarTablas()
      .then(setTablas)
      .catch((err: unknown) => setError(err instanceof HttpError ? err.message : 'No se pudo cargar el listado de tablas.'))
    estadoStaging()
      .then(setStaging)
      .catch(() => undefined)
  }, [])

  useEffect(() => {
    if (vista !== 'tabla') return
    setCargandoTabla(true)
    verTabla(tablaActiva, pagina, TAMANO_PAGINA)
      .then(setDatosTabla)
      .catch((err: unknown) => setError(err instanceof HttpError ? err.message : 'No se pudo cargar la tabla.'))
      .finally(() => setCargandoTabla(false))
  }, [vista, tablaActiva, pagina])

  async function refrescarTablas() {
    listarTablas()
      .then(setTablas)
      .catch(() => undefined)
    if (vista === 'tabla') {
      verTabla(tablaActiva, pagina, TAMANO_PAGINA)
        .then(setDatosTabla)
        .catch(() => undefined)
    }
  }

  async function ejecutarAuditoria() {
    setAuditando(true)
    setError(null)
    try {
      setAuditoria(await auditar())
    } catch (err) {
      setError(err instanceof HttpError ? err.message : 'No se pudo auditar la base de datos.')
    } finally {
      setAuditando(false)
    }
  }

  async function crearCopia() {
    setStagingBusy(true)
    setError(null)
    try {
      setStaging(await crearStaging())
      setCorregidos([])
      setAuditoria(await auditar())
      await refrescarTablas()
    } catch (err) {
      setError(err instanceof HttpError ? err.message : 'No se pudo crear la copia de trabajo.')
    } finally {
      setStagingBusy(false)
    }
  }

  async function descartarCopia() {
    if (!confirm('¿Descartar la copia de trabajo? Se pierden las correcciones que todavía no se aplicaron a producción.')) return
    setStagingBusy(true)
    setError(null)
    try {
      setStaging(await descartarStaging())
      setCorregidos([])
      setAuditoria(await auditar())
      await refrescarTablas()
    } catch (err) {
      setError(err instanceof HttpError ? err.message : 'No se pudo descartar la copia de trabajo.')
    } finally {
      setStagingBusy(false)
    }
  }

  async function corregir(g: GrupoInconsistencia, valor: string) {
    const clave = `${g.tabla}.${g.campo}.${g.clave}`
    setCorrigiendo(clave)
    setError(null)
    try {
      const r = await corregirGrupo({ tabla: g.tabla, campo: g.campo, clave: g.clave, valor })
      setAuditoria(r.auditoria)
      setCorregidos((prev) => [...prev, { clave, etiqueta: g.etiqueta, valor, filas: r.filas_actualizadas }])
      if (vista === 'tabla') void refrescarTablas()
    } catch (err) {
      setError(err instanceof HttpError ? err.message : 'No se pudo aplicar la corrección.')
    } finally {
      setCorrigiendo(null)
    }
  }

  async function aplicarProduccion() {
    if (
      !confirm(
        'Esto reemplaza la base de datos en vivo por esta copia ya homogenizada. La base anterior queda guardada como respaldo. ¿Aplicar a producción?',
      )
    )
      return
    setPromoviendo(true)
    setError(null)
    try {
      await promover()
      setStaging({ activo: false })
      setCorregidos([])
      setAuditoria(await auditar())
      await refrescarTablas()
    } catch (err) {
      setError(err instanceof HttpError ? err.message : 'No se pudo aplicar a producción.')
    } finally {
      setPromoviendo(false)
    }
  }

  return (
    <div className={styles.wrap} style={wrapStyle}>
      <Header
        title="DataCore"
        description="La base de datos completa: modelo entidad-relación, exploración por tabla y auditoría de homogenización."
      />

      <Card className={styles.bannerStaging}>
        {staging?.activo ? (
          <>
            <span className={styles.bannerPuntoCopia} />
            <span>
              Trabajando sobre una copia
              {staging.creado_en && ` creada el ${new Date(staging.creado_en).toLocaleString('es-CL')}`}. Producción no se
              toca hasta que apliques los cambios.
            </span>
            <div className={styles.bannerAcciones}>
              <Button variant="secondary" onClick={() => void descartarCopia()} disabled={staginBusy}>
                Descartar copia
              </Button>
              <Button
                onClick={() => void aplicarProduccion()}
                disabled={staginBusy || promoviendo || !auditoria || auditoria.total_inconsistencias > 0}
              >
                {promoviendo ? 'Aplicando…' : 'Aplicar a producción'}
              </Button>
            </div>
          </>
        ) : (
          <>
            <span className={styles.bannerPuntoVivo} />
            <span>Viendo la base en vivo, de solo lectura. Para corregir algo, crea una copia de trabajo primero.</span>
            <div className={styles.bannerAcciones}>
              <Button onClick={() => void crearCopia()} disabled={staginBusy}>
                {staginBusy ? 'Creando…' : 'Crear copia de trabajo'}
              </Button>
            </div>
          </>
        )}
      </Card>

      <Card className={styles.panelAudit}>
        <div className={styles.panelAuditCabecera}>
          <div>
            <h3>Auditoría de homogenización</h3>
            <p className={styles.panelAuditNota}>
              Busca valores que representan lo mismo pero están escritos de más de una forma (mayúsculas, espacios) en
              especie, variedad, tipo de servicio, laboratorio, Sold To y Ship To.
            </p>
          </div>
          <Button onClick={() => void ejecutarAuditoria()} disabled={auditando}>
            {auditando ? 'Auditando…' : 'Auditar'}
          </Button>
        </div>

        {auditoria && (
          <>
            <div className={styles.statsAudit}>
              <div className={`${styles.statCard} ${auditoria.total_inconsistencias > 0 ? styles.warn : styles.ok}`}>
                <span className={styles.statNum}>{auditoria.total_inconsistencias}</span>
                <span className={styles.statLbl}>grupos de inconsistencias</span>
              </div>
              <div className={`${styles.statCard} ${auditoria.total_filas_afectadas > 0 ? styles.warn : styles.ok}`}>
                <span className={styles.statNum}>{auditoria.total_filas_afectadas.toLocaleString('es-CL')}</span>
                <span className={styles.statLbl}>filas afectadas</span>
              </div>
              <div className={`${styles.statCard} ${auditoria.total_inconsistencias === 0 ? styles.ok : styles.warn}`}>
                <span className={styles.statNum}>{auditoria.total_inconsistencias === 0 ? 'Lista' : 'No lista'}</span>
                <span className={styles.statLbl}>para subir a producción</span>
              </div>
            </div>

            {corregidos.length > 0 && (
              <div className={styles.listaCorregidos}>
                {corregidos
                  .slice()
                  .reverse()
                  .map((c, i) => (
                    <div key={`${c.clave}-${i}`} className={styles.filaCorregido}>
                      <span className={styles.filaCorregidoEtiqueta}>{c.etiqueta}</span>
                      <span>
                        → unificado a <code>{c.valor}</code>
                      </span>
                      <span className={styles.filaGrupoFilas}>{c.filas.toLocaleString('es-CL')} filas</span>
                    </div>
                  ))}
              </div>
            )}

            {auditoria.total_inconsistencias === 0 ? (
              <p className={styles.panelAuditNota}>Sin inconsistencias de homogenización pendientes.</p>
            ) : (
              <ListaGrupos
                grupos={auditoria.grupos}
                abierto={grupoAbierto}
                onAbrir={setGrupoAbierto}
                puedeCorregir={Boolean(staging?.activo)}
                corrigiendo={corrigiendo}
                onCorregir={corregir}
              />
            )}
          </>
        )}
      </Card>

      {error && <p className={styles.error}>{error}</p>}

      <div className={styles.toolbar}>
        <div className={styles.tabs}>
          <button
            className={vista === 'modelo' ? styles.tabActivo : styles.tab}
            onClick={() => setVista('modelo')}
          >
            Modelo entidad-relación
          </button>
          <button className={vista === 'tabla' ? styles.tabActivo : styles.tab} onClick={() => setVista('tabla')}>
            Vista de tabla
          </button>
        </div>
      </div>

      {vista === 'modelo' ? (
        <Card>
          <ErDiagrama />
        </Card>
      ) : (
        <Card>
          <div className={styles.selectorTabla}>
            <select
              value={tablaActiva}
              onChange={(e) => {
                setTablaActiva(e.target.value)
                setPagina(1)
              }}
            >
              {(tablas ?? []).map((t) => (
                <option key={t.nombre} value={t.nombre}>
                  {t.nombre} ({t.total.toLocaleString('es-CL')})
                </option>
              ))}
            </select>
          </div>

          {cargandoTabla || !datosTabla ? (
            <p className={styles.panelAuditNota}>Cargando…</p>
          ) : (
            <>
              <div className={styles.tablaScroll}>
                <table className={styles.tablaDatos}>
                  <thead>
                    <tr>
                      {datosTabla.columnas.map((c) => (
                        <th key={c}>{c}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {datosTabla.filas.map((fila, i) => (
                      <tr key={i}>
                        {datosTabla.columnas.map((c) => (
                          <td key={c}>{fila[c] === null || fila[c] === undefined ? '—' : String(fila[c])}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className={styles.paginacion}>
                <button disabled={pagina <= 1} onClick={() => setPagina((p) => p - 1)}>
                  ← Anterior
                </button>
                <span>
                  Página {pagina} de {Math.max(1, Math.ceil(datosTabla.total / TAMANO_PAGINA))} ·{' '}
                  {datosTabla.total.toLocaleString('es-CL')} filas
                  {staging?.activo && ' (copia de trabajo)'}
                </span>
                <button
                  disabled={pagina >= Math.ceil(datosTabla.total / TAMANO_PAGINA)}
                  onClick={() => setPagina((p) => p + 1)}
                >
                  Siguiente →
                </button>
              </div>
            </>
          )}
        </Card>
      )}
    </div>
  )
}

function ListaGrupos({
  grupos,
  abierto,
  onAbrir,
  puedeCorregir,
  corrigiendo,
  onCorregir,
}: {
  grupos: GrupoInconsistencia[]
  abierto: number | null
  onAbrir: (i: number | null) => void
  puedeCorregir: boolean
  corrigiendo: string | null
  onCorregir: (g: GrupoInconsistencia, valor: string) => void
}) {
  return (
    <div className={styles.listaGrupos}>
      {grupos.map((g, i) => (
        <GrupoFila
          key={`${g.tabla}-${g.campo}-${g.clave}`}
          g={g}
          abierto={abierto === i}
          onAbrir={() => onAbrir(abierto === i ? null : i)}
          puedeCorregir={puedeCorregir}
          corrigiendo={corrigiendo === `${g.tabla}.${g.campo}.${g.clave}`}
          onCorregir={(valor) => onCorregir(g, valor)}
        />
      ))}
    </div>
  )
}

function GrupoFila({
  g,
  abierto,
  onAbrir,
  puedeCorregir,
  corrigiendo,
  onCorregir,
}: {
  g: GrupoInconsistencia
  abierto: boolean
  onAbrir: () => void
  puedeCorregir: boolean
  corrigiendo: boolean
  onCorregir: (valor: string) => void
}) {
  const variantes = Object.entries(g.conteo_variantes).sort((a, b) => b[1] - a[1])
  const [elegido, setElegido] = useState(g.sugerido)

  return (
    <div className={styles.filaGrupo}>
      <button className={styles.filaGrupoCabecera} onClick={onAbrir}>
        <span className={styles.filaGrupoEtiqueta}>{g.etiqueta}</span>
        <span className={styles.filaGrupoVariantes}>
          {variantes.map(([v]) => v).join('  ≠  ')}
        </span>
        <span className={styles.filaGrupoFilas}>{g.filas.toLocaleString('es-CL')} filas</span>
      </button>
      {abierto && (
        <div className={styles.filaGrupoDetalle}>
          <p>
            Tabla <code>{g.tabla}</code>, campo <code>{g.campo}</code>. Variantes encontradas para el mismo valor:
          </p>
          <ul>
            {variantes.map(([v, n]) => (
              <li key={v}>
                <code>{v}</code> — {n.toLocaleString('es-CL')} filas
              </li>
            ))}
          </ul>

          {puedeCorregir ? (
            <div className={styles.corregirBloque}>
              <span>Unificar todo a:</span>
              <select value={elegido} onChange={(e) => setElegido(e.target.value)}>
                {variantes.map(([v]) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
              <Button onClick={() => onCorregir(elegido)} disabled={corrigiendo}>
                {corrigiendo ? 'Aplicando…' : 'Corregir'}
              </Button>
            </div>
          ) : (
            <p className={styles.panelAuditNota}>Crea una copia de trabajo para poder corregir este grupo.</p>
          )}
        </div>
      )}
    </div>
  )
}
