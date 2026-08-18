import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { Header } from '@/components/layout/Header'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { areaDeModulo } from '@/constants/areas'
import { auditar, listarTablas, verTabla } from '@/features/auditoria'
import type { GrupoInconsistencia, InfoTabla, PaginaTabla, ResultadoAuditoria } from '@/features/auditoria'
import { HttpError } from '@/services/http/client'
import { ErDiagrama } from './ErDiagrama'
import styles from './DataCoreView.module.css'

type Vista = 'tabla' | 'modelo'
const TAMANO_PAGINA = 30

export function DataCoreView() {
  const acento = areaDeModulo('datacore')?.colorPrimario ?? 'var(--color-primary)'
  const wrapStyle = { '--acento': acento } as CSSProperties

  const [vista, setVista] = useState<Vista>('modelo')

  const [tablas, setTablas] = useState<InfoTabla[] | null>(null)
  const [tablaActiva, setTablaActiva] = useState<string>('solicitud')
  const [pagina, setPagina] = useState(1)
  const [datosTabla, setDatosTabla] = useState<PaginaTabla | null>(null)
  const [cargandoTabla, setCargandoTabla] = useState(false)

  const [auditoria, setAuditoria] = useState<ResultadoAuditoria | null>(null)
  const [auditando, setAuditando] = useState(false)
  const [grupoAbierto, setGrupoAbierto] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    listarTablas()
      .then(setTablas)
      .catch((err: unknown) => setError(err instanceof HttpError ? err.message : 'No se pudo cargar el listado de tablas.'))
  }, [])

  useEffect(() => {
    if (vista !== 'tabla') return
    setCargandoTabla(true)
    verTabla(tablaActiva, pagina, TAMANO_PAGINA)
      .then(setDatosTabla)
      .catch((err: unknown) => setError(err instanceof HttpError ? err.message : 'No se pudo cargar la tabla.'))
      .finally(() => setCargandoTabla(false))
  }, [vista, tablaActiva, pagina])

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

  return (
    <div className={styles.wrap} style={wrapStyle}>
      <Header
        title="DataCore"
        description="La base de datos completa: modelo entidad-relación, exploración por tabla y auditoría de homogenización."
      />

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

            {auditoria.total_inconsistencias === 0 ? (
              <p className={styles.panelAuditNota}>Sin inconsistencias de homogenización detectadas.</p>
            ) : (
              <ListaGrupos grupos={auditoria.grupos} abierto={grupoAbierto} onAbrir={setGrupoAbierto} />
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
}: {
  grupos: GrupoInconsistencia[]
  abierto: number | null
  onAbrir: (i: number | null) => void
}) {
  return (
    <div className={styles.listaGrupos}>
      {grupos.map((g, i) => (
        <div key={`${g.tabla}-${g.campo}-${g.clave}`} className={styles.filaGrupo}>
          <button className={styles.filaGrupoCabecera} onClick={() => onAbrir(abierto === i ? null : i)}>
            <span className={styles.filaGrupoEtiqueta}>{g.etiqueta}</span>
            <span className={styles.filaGrupoVariantes}>{g.variantes.join('  ≠  ')}</span>
            <span className={styles.filaGrupoFilas}>{g.filas.toLocaleString('es-CL')} filas</span>
          </button>
          {abierto === i && (
            <div className={styles.filaGrupoDetalle}>
              <p>
                Tabla <code>{g.tabla}</code>, campo <code>{g.campo}</code>. Variantes encontradas para el mismo valor:
              </p>
              <ul>
                {g.variantes.map((v) => (
                  <li key={v}>
                    <code>{v}</code>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
