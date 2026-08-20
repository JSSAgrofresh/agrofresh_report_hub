import { useCallback, useEffect, useMemo, useState } from 'react'
import type { DragEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Header } from '@/components/layout/Header'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/cn'
import { ROUTES } from '@/constants/routes'
import { HttpError } from '@/services/http/client'
import {
  descargarExcelCruce,
  descargarInformesPDF,
  listarSolicitudes,
  parsearGC,
  subirCruceABaseDeDatos,
} from '@/features/emitir'
import type { FilaCruce, FilaSubida, MuestraGC, ResultadoAnalito, Solicitud } from '@/features/emitir'
import { SolicitudFichaModal } from './SolicitudFichaModal'
import { ConfiguracionInformeModal } from './ConfiguracionInformeModal'
import styles from './CromatografiaEmitirView.module.css'

const TIPO_ARRASTRE_SOLICITUD = 'application/x-solicitud-archivo'

interface FilaEnCruce {
  solicitud: Solicitud
  codigoAsignado: string | null
}

interface ResultadoValidacion {
  severidad: 'ok' | 'sospechoso'
  mensaje: string | null
}

/** Regla exacta: el conjunto de analitos detectados en el resultado debe ser
 * idéntico al conjunto de analitos que la solicitud pidió -ni de más ni de
 * menos-. Cualquier diferencia (detectó algo no solicitado, o no detectó algo
 * que sí se pidió) se marca como cruce sospechoso y bloquea la exportación:
 * mejor forzar a revisar el código asignado que dejar pasar un cruce dudoso. */
function validarCruce(analitosSolicitados: string[], resultados: ResultadoAnalito[]): ResultadoValidacion {
  if (analitosSolicitados.length === 0) return { severidad: 'ok', mensaje: null }

  const cubiertos = resultados.map((r) => r.codigo).filter((c): c is string => Boolean(c))
  const detectados = resultados
    .filter((r) => r.codigo && r.amount != null && r.amount > 0)
    .map((r) => r.codigo as string)
  const noMedidos = analitosSolicitados.filter((a) => !cubiertos.includes(a))
  const faltantes = analitosSolicitados.filter((a) => !detectados.includes(a))
  const sobrantes = detectados.filter((c) => !analitosSolicitados.includes(c))

  if (noMedidos.length > 0) {
    return {
      severidad: 'sospechoso',
      mensaje: `Este resultado no midió ${noMedidos.join(', ')}, que sí se solicitó.`,
    }
  }
  if (faltantes.length === 0 && sobrantes.length === 0) {
    return { severidad: 'ok', mensaje: null }
  }
  const motivos: string[] = []
  if (sobrantes.length > 0) motivos.push(`detectó ${sobrantes.join(', ')}, que no fue solicitado`)
  if (faltantes.length > 0) motivos.push(`no detectó ${faltantes.join(', ')}, que sí fue solicitado`)
  return { severidad: 'sospechoso', mensaje: `Cruce sospechoso: ${motivos.join(' y ')}. Revisa si es el código correcto.` }
}

export function CromatografiaEmitirView() {
  const navigate = useNavigate()
  const [solicitudes, setSolicitudes] = useState<Solicitud[] | null>(null)
  const [errorSolicitudes, setErrorSolicitudes] = useState<string | null>(null)
  const [sinSolicitudes, setSinSolicitudes] = useState(false)
  const [solicitudEnFicha, setSolicitudEnFicha] = useState<Solicitud | null>(null)
  const [mostrarConfiguracion, setMostrarConfiguracion] = useState(false)

  const [muestrasGC, setMuestrasGC] = useState<MuestraGC[] | null>(null)
  const [nombreArchivoGC, setNombreArchivoGC] = useState<string | null>(null)
  const [cargandoGC, setCargandoGC] = useState(false)
  const [errorGC, setErrorGC] = useState<string | null>(null)
  const [arrastrandoGC, setArrastrandoGC] = useState(false)

  const [filasCruce, setFilasCruce] = useState<FilaEnCruce[]>([])
  const [arrastrandoZonaCruce, setArrastrandoZonaCruce] = useState(false)
  const [descargando, setDescargando] = useState(false)
  const [descargandoPDF, setDescargandoPDF] = useState(false)
  const [subiendo, setSubiendo] = useState(false)
  const [resultadoSubida, setResultadoSubida] = useState<FilaSubida[] | null>(null)

  const refrescarSolicitudes = useCallback(async () => {
    try {
      const resultado = await listarSolicitudes()
      setSolicitudes(resultado)
      setErrorSolicitudes(null)
      setSinSolicitudes(false)
    } catch (e) {
      if (e instanceof HttpError && e.status === 404) {
        setSinSolicitudes(true)
        setErrorSolicitudes(null)
        setSolicitudes([])
      } else {
        setErrorSolicitudes('No se pudo conectar con el backend.')
      }
    }
  }, [])

  useEffect(() => {
    refrescarSolicitudes()
  }, [refrescarSolicitudes])

  async function subirGC(archivo: File) {
    setCargandoGC(true)
    setErrorGC(null)
    try {
      const muestras = await parsearGC(archivo)
      setMuestrasGC(muestras)
      setNombreArchivoGC(archivo.name)
    } catch (e) {
      setErrorGC(e instanceof HttpError ? e.message : 'No se pudo leer el archivo. ¿Es el reporte de texto del GC?')
      setMuestrasGC(null)
      setNombreArchivoGC(null)
    } finally {
      setCargandoGC(false)
    }
  }

  function onDropGC(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setArrastrandoGC(false)
    const archivo = e.dataTransfer.files[0]
    if (archivo) subirGC(archivo)
  }

  function onDropZonaCruce(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setArrastrandoZonaCruce(false)
    const archivo = e.dataTransfer.getData(TIPO_ARRASTRE_SOLICITUD)
    if (!archivo || !solicitudes) return
    const solicitud = solicitudes.find((s) => s.archivo === archivo)
    if (!solicitud) return
    setFilasCruce((prev) =>
      prev.some((f) => f.solicitud.archivo === archivo) ? prev : [...prev, { solicitud, codigoAsignado: null }],
    )
  }

  function asignarCodigo(archivo: string, codigo: string) {
    setFilasCruce((prev) =>
      prev.map((f) => (f.solicitud.archivo === archivo ? { ...f, codigoAsignado: codigo || null } : f)),
    )
  }

  function quitarDeCruce(archivo: string) {
    setFilasCruce((prev) => prev.filter((f) => f.solicitud.archivo !== archivo))
  }

  const codigosDisponibles = useMemo(() => (muestrasGC ?? []).map((m) => m.codigo), [muestrasGC])

  const filasConValidacion = useMemo(
    () =>
      filasCruce.map((f) => {
        const muestra = muestrasGC?.find((m) => m.codigo === f.codigoAsignado) ?? null
        const validacion = muestra ? validarCruce(f.solicitud.analitos_solicitados, muestra.resultados) : null
        return { ...f, muestra, validacion }
      }),
    [filasCruce, muestrasGC],
  )

  const hayCrucesSospechosos = filasConValidacion.some((f) => f.validacion?.severidad === 'sospechoso')
  const cantidadExportable = filasConValidacion.filter((f) => f.muestra && f.validacion?.severidad !== 'sospechoso').length

  const columnasAnalito = useMemo(() => {
    const vistos: string[] = []
    for (const f of filasCruce) {
      for (const a of f.solicitud.analitos_solicitados) {
        if (!vistos.includes(a)) vistos.push(a)
      }
      const muestra = muestrasGC?.find((m) => m.codigo === f.codigoAsignado)
      for (const r of muestra?.resultados ?? []) {
        if (r.codigo && !vistos.includes(r.codigo)) vistos.push(r.codigo)
      }
    }
    return vistos
  }, [filasCruce, muestrasGC])

  function construirFilasExportables(): FilaCruce[] {
    const asignadas = filasConValidacion.filter((f) => f.muestra && f.validacion?.severidad !== 'sospechoso')
    return asignadas.map((f) => {
      const resultadosPorCodigo: Record<string, number | null> = {}
      for (const r of f.muestra?.resultados ?? []) {
        if (r.codigo) resultadosPorCodigo[r.codigo] = r.amount
      }
      return {
        campos: f.solicitud.campos,
        analitos_solicitados: f.solicitud.analitos_solicitados,
        resultados_por_codigo: resultadosPorCodigo,
        codigo_vial: f.muestra?.codigo ?? null,
        fecha_inyeccion: f.muestra?.fecha_inyeccion ?? null,
      }
    })
  }

  async function descargarExcel() {
    const filas = construirFilasExportables()
    if (filas.length === 0) return
    setDescargando(true)
    try {
      const blob = await descargarExcelCruce(filas)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'resultados_cromatografia.xlsx'
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      setErrorGC('No se pudo generar el Excel.')
    } finally {
      setDescargando(false)
    }
  }

  async function descargarInformes() {
    const filas = construirFilasExportables()
    if (filas.length === 0) return
    setDescargandoPDF(true)
    try {
      const { blob, nombre } = await descargarInformesPDF(filas)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = nombre ?? (filas.length > 1 ? 'informes_cromatografia.zip' : 'informe.pdf')
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      setErrorGC('No se pudo generar el informe.')
    } finally {
      setDescargandoPDF(false)
    }
  }

  async function subirABaseDeDatos() {
    const filas = construirFilasExportables()
    if (filas.length === 0) return
    setSubiendo(true)
    setResultadoSubida(null)
    try {
      const resultado = await subirCruceABaseDeDatos(filas)
      setResultadoSubida(resultado)
      // La fila se deja en la zona de cruce (igual que tras descargar Excel/PDF):
      // volver a subirla no duplica nada, el backend ya detecta que esa
      // solicitud + vial ya se subió antes y avisa "ya estaba subida".
    } catch {
      setErrorGC('No se pudo subir a la base de datos.')
    } finally {
      setSubiendo(false)
    }
  }

  return (
    <div>
      <Header
        title="Reporte análisis cromatografía"
        description="Arrastra una solicitud a la zona de cruce y asígnale el código de vial del GC que le corresponde."
        acciones={
          <button type="button" className={styles.botonChico} onClick={() => setMostrarConfiguracion(true)}>
            Configurar informe
          </button>
        }
      />

      <div className={styles.lienzo}>
        <Card className={styles.panel}>
          <div className={styles.panelCabecera}>
            <h3>Solicitudes de muestreo</h3>
            <button type="button" className={styles.botonChico} onClick={refrescarSolicitudes}>
              Actualizar
            </button>
          </div>
          <p className={styles.panelAyuda}>
            Solicitudes de muestreo del laboratorio AGROFRESH (Toma de muestras → Nueva solicitud). Arrastra una
            fila hacia la zona de cruce; haz clic para ver la ficha completa.
          </p>
          {errorSolicitudes && <p className={styles.error}>{errorSolicitudes}</p>}
          {sinSolicitudes ? (
            <div className={styles.avisoCarpeta}>
              <p>Todavía no hay solicitudes de AGROFRESH creadas.</p>
              <Button variant="secondary" onClick={() => navigate(ROUTES.tomaMuestrasNueva)}>
                Ir a Nueva solicitud
              </Button>
            </div>
          ) : solicitudes === null ? (
            <p className={styles.estado}>Cargando…</p>
          ) : solicitudes.length === 0 ? (
            <p className={styles.estado}>No hay solicitudes de AGROFRESH todavía.</p>
          ) : (
            <div className={styles.tablaCaja}>
              <table className={styles.tabla}>
                <thead>
                  <tr>
                    <th>N° Solicitud</th>
                    <th>Fecha muestreo</th>
                    <th>Sold To</th>
                    <th>Especie</th>
                    <th>Analitos solicitados</th>
                  </tr>
                </thead>
                <tbody>
                  {solicitudes.map((s) => (
                    <tr
                      key={s.archivo}
                      draggable
                      onDragStart={(e) => e.dataTransfer.setData(TIPO_ARRASTRE_SOLICITUD, s.archivo)}
                      onClick={() => setSolicitudEnFicha(s)}
                      className={styles.filaClicable}
                    >
                      <td className={styles.nombre}>{s.campos['N° Solicitud'] || s.archivo}</td>
                      <td className={styles.mono}>{s.campos['Fecha Muestreo'] || '—'}</td>
                      <td>{s.campos['Sold To (Nombre)'] || '—'}</td>
                      <td>{s.campos['Especie'] || '—'}</td>
                      <td>
                        {s.analitos_solicitados.length === 0
                          ? '—'
                          : s.analitos_solicitados.map((a) => (
                              <span key={a} className={styles.chipAnalito}>
                                {a}
                              </span>
                            ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card className={styles.panel}>
          <div className={styles.panelCabecera}>
            <h3>Resultados del GC</h3>
          </div>
          <div
            className={cn(styles.zona, arrastrandoGC && styles.zonaActiva)}
            onDragOver={(e) => {
              e.preventDefault()
              setArrastrandoGC(true)
            }}
            onDragLeave={() => setArrastrandoGC(false)}
            onDrop={onDropGC}
          >
            <input
              type="file"
              id="gc-input"
              hidden
              onChange={(e) => e.target.files?.[0] && subirGC(e.target.files[0])}
            />
            <label htmlFor="gc-input" className={styles.zonaTexto}>
              {cargandoGC
                ? 'Leyendo…'
                : nombreArchivoGC
                  ? `Cargado: ${nombreArchivoGC} (arrastra otro para reemplazar)`
                  : 'Arrastra aquí el reporte de texto del GC, o haz clic para elegirlo'}
            </label>
          </div>
          {errorGC && <p className={styles.error}>{errorGC}</p>}
          {muestrasGC && (
            <div className={styles.tablaCaja}>
              <table className={styles.tabla}>
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Fecha inyección</th>
                    {Array.from(new Set(muestrasGC.flatMap((m) => m.resultados.map((r) => r.codigo).filter(Boolean)))).map(
                      (c) => (
                        <th key={c}>{c}</th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {muestrasGC.map((m) => {
                    const codigosCol = Array.from(
                      new Set(muestrasGC.flatMap((x) => x.resultados.map((r) => r.codigo).filter(Boolean))),
                    )
                    const porCodigo = new Map(m.resultados.map((r) => [r.codigo, r]))
                    return (
                      <tr key={m.codigo}>
                        <td className={styles.nombre}>{m.codigo}</td>
                        <td className={styles.mono}>{m.fecha_inyeccion ?? '—'}</td>
                        {codigosCol.map((c) => (
                          <td key={c} className={styles.mono}>
                            {porCodigo.get(c)?.amount ?? '—'}
                          </td>
                        ))}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <Card
        className={cn(styles.panelCruce, arrastrandoZonaCruce && styles.zonaCruceActiva)}
        onDragOver={(e) => {
          e.preventDefault()
          setArrastrandoZonaCruce(true)
        }}
        onDragLeave={() => setArrastrandoZonaCruce(false)}
        onDrop={onDropZonaCruce}
      >
        <div className={styles.panelCabecera}>
          <h3>Zona de cruce</h3>
        </div>

        {filasCruce.length === 0 ? (
          <p className={styles.estado}>Arrastra aquí una solicitud desde la tabla de la izquierda para empezar.</p>
        ) : (
          <div className={styles.tablaCaja}>
            <table className={styles.tabla}>
              <thead>
                <tr>
                  <th>N° Solicitud</th>
                  <th>Sold To</th>
                  <th>Especie</th>
                  <th>Analitos solicitados</th>
                  <th>Código de vial</th>
                  {columnasAnalito.map((a) => (
                    <th key={a}>{a}</th>
                  ))}
                  <th>Estado</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filasConValidacion.map((f) => {
                  const muestra = f.muestra
                  const porCodigo = new Map((muestra?.resultados ?? []).map((r) => [r.codigo, r]))
                  const validacion = f.validacion
                  return (
                    <tr
                      key={f.solicitud.archivo}
                      className={cn(
                        muestra && validacion?.severidad === 'ok' && styles.filaOk,
                        muestra && validacion?.severidad === 'sospechoso' && styles.filaSospechosa,
                      )}
                    >
                      <td className={styles.nombre}>{f.solicitud.campos['N° Solicitud'] || f.solicitud.archivo}</td>
                      <td>{f.solicitud.campos['Sold To (Nombre)'] || '—'}</td>
                      <td>{f.solicitud.campos['Especie'] || '—'}</td>
                      <td>
                        {f.solicitud.analitos_solicitados.map((a) => (
                          <span key={a} className={styles.chipAnalito}>
                            {a}
                          </span>
                        ))}
                      </td>
                      <td>
                        <select
                          value={f.codigoAsignado ?? ''}
                          onChange={(e) => asignarCodigo(f.solicitud.archivo, e.target.value)}
                          className={styles.selectCodigo}
                        >
                          <option value="">— elegir —</option>
                          {codigosDisponibles.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      </td>
                      {columnasAnalito.map((a) => (
                        <td key={a} className={styles.mono}>
                          {muestra ? (porCodigo.get(a)?.amount ?? '—') : '—'}
                        </td>
                      ))}
                      <td>
                        {!muestra ? (
                          <span className={styles.estadoPendiente}>Sin asignar</span>
                        ) : validacion?.severidad === 'sospechoso' ? (
                          <span className={styles.estadoSospechoso} title={validacion.mensaje ?? undefined}>
                            ⚠ Revisar
                          </span>
                        ) : (
                          <span className={styles.estadoOk}>✓ OK</span>
                        )}
                      </td>
                      <td>
                        <button
                          type="button"
                          className={styles.botonQuitar}
                          onClick={() => quitarDeCruce(f.solicitud.archivo)}
                        >
                          Quitar
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {filasCruce.some((f) => f.codigoAsignado) && (
          <div className={styles.exportarAcciones}>
            <div className={styles.exportarBotones}>
              <Button variant="secondary" onClick={descargarExcel} disabled={descargando || hayCrucesSospechosos}>
                {descargando ? 'Generando…' : 'Descargar Excel'}
              </Button>
              <Button variant="secondary" onClick={descargarInformes} disabled={descargandoPDF || hayCrucesSospechosos}>
                {descargandoPDF
                  ? 'Generando…'
                  : cantidadExportable > 1
                    ? `Descargar ${cantidadExportable} informes (PDF)`
                    : 'Descargar informe (PDF)'}
              </Button>
              <Button variant="secondary" onClick={subirABaseDeDatos} disabled={subiendo || hayCrucesSospechosos}>
                {subiendo ? 'Subiendo…' : 'Subir a base de datos'}
              </Button>
            </div>
            {hayCrucesSospechosos && (
              <p className={styles.avisoBloqueo}>
                Hay cruces marcados "⚠ Revisar" — corrígelos o quítalos de la zona de cruce antes de descargar.
              </p>
            )}
            {resultadoSubida && (
              <ul className={styles.resultadoSubida}>
                {resultadoSubida.map((r, i) => (
                  <li
                    key={`${r.nro_solicitud_original}-${r.codigo_vial}-${i}`}
                    className={r.estado === 'error' ? styles.resultadoSubidaError : styles.resultadoSubidaOk}
                  >
                    {r.nro_solicitud_original} ({r.codigo_vial ?? '—'}):{' '}
                    {r.estado === 'creada' && `subida — folio ${r.folio}`}
                    {r.estado === 'ya_existia' && `ya estaba subida (folio ${r.folio})`}
                    {r.estado === 'error' && r.mensaje}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Card>

      {solicitudEnFicha && <SolicitudFichaModal solicitud={solicitudEnFicha} onCerrar={() => setSolicitudEnFicha(null)} />}
      {mostrarConfiguracion && <ConfiguracionInformeModal onCerrar={() => setMostrarConfiguracion(false)} />}
    </div>
  )
}
