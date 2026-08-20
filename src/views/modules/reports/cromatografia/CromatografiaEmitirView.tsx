import { useCallback, useEffect, useMemo, useState } from 'react'
import type { DragEvent } from 'react'
import { Header } from '@/components/layout/Header'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/cn'
import { crearCarpeta } from '@/features/storage'
import { HttpError } from '@/services/http/client'
import { descargarExcelCruce, listarSolicitudes, parsearGC } from '@/features/emitir'
import type { FilaCruce, MuestraGC, ResultadoAnalito, Solicitud } from '@/features/emitir'
import { SolicitudFichaModal } from './SolicitudFichaModal'
import styles from './CromatografiaEmitirView.module.css'

const CARPETA_SOLICITUDES = 'Solicitud de Muestreo'
const TIPO_ARRASTRE_SOLICITUD = 'application/x-solicitud-archivo'

interface FilaEnCruce {
  solicitud: Solicitud
  codigoAsignado: string | null
}

interface ResultadoValidacion {
  severidad: 'ok' | 'info' | 'sospechoso'
  mensaje: string | null
}

/** Compara lo que la solicitud pidió contra lo que el resultado del GC realmente
 * trae. Un analito no detectado (null/0) es normal -significa "no se encontró
 * rastro", no que algo esté mal-. Lo que sí es señal de alerta es que el
 * resultado no traiga NINGUNO de los analitos pedidos pero sí detecte otros
 * -típico indicio de haber asignado el código de vial equivocado-. */
function validarCruce(analitosSolicitados: string[], resultados: ResultadoAnalito[]): ResultadoValidacion {
  if (analitosSolicitados.length === 0) return { severidad: 'ok', mensaje: null }

  const cubiertos = resultados.map((r) => r.codigo).filter((c): c is string => Boolean(c))
  const detectados = resultados
    .filter((r) => r.codigo && r.amount != null && r.amount > 0)
    .map((r) => r.codigo as string)
  const noMedidos = analitosSolicitados.filter((a) => !cubiertos.includes(a))
  const solicitadosDetectados = analitosSolicitados.filter((a) => detectados.includes(a))
  const otrosDetectados = detectados.filter((c) => !analitosSolicitados.includes(c))

  if (noMedidos.length > 0) {
    return {
      severidad: 'sospechoso',
      mensaje: `Este resultado no midió ${noMedidos.join(', ')}, que sí se solicitó.`,
    }
  }
  if (solicitadosDetectados.length === 0 && otrosDetectados.length > 0) {
    return {
      severidad: 'sospechoso',
      mensaje: `Se solicitó ${analitosSolicitados.join(', ')}, pero el resultado solo detectó ${otrosDetectados.join(', ')}. Revisa si es el código correcto.`,
    }
  }
  if (otrosDetectados.length > 0) {
    return { severidad: 'info', mensaje: `También detectó ${otrosDetectados.join(', ')}, que no fue solicitado.` }
  }
  return { severidad: 'ok', mensaje: null }
}

export function CromatografiaEmitirView() {
  const [solicitudes, setSolicitudes] = useState<Solicitud[] | null>(null)
  const [errorSolicitudes, setErrorSolicitudes] = useState<string | null>(null)
  const [carpetaNoExiste, setCarpetaNoExiste] = useState(false)
  const [creandoCarpeta, setCreandoCarpeta] = useState(false)
  const [solicitudEnFicha, setSolicitudEnFicha] = useState<Solicitud | null>(null)

  const [muestrasGC, setMuestrasGC] = useState<MuestraGC[] | null>(null)
  const [nombreArchivoGC, setNombreArchivoGC] = useState<string | null>(null)
  const [cargandoGC, setCargandoGC] = useState(false)
  const [errorGC, setErrorGC] = useState<string | null>(null)
  const [arrastrandoGC, setArrastrandoGC] = useState(false)

  const [filasCruce, setFilasCruce] = useState<FilaEnCruce[]>([])
  const [arrastrandoZonaCruce, setArrastrandoZonaCruce] = useState(false)
  const [descargando, setDescargando] = useState(false)

  const refrescarSolicitudes = useCallback(async () => {
    try {
      const resultado = await listarSolicitudes()
      setSolicitudes(resultado)
      setErrorSolicitudes(null)
      setCarpetaNoExiste(false)
    } catch (e) {
      if (e instanceof HttpError && e.status === 404) {
        setCarpetaNoExiste(true)
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

  async function crearCarpetaSolicitudes() {
    setCreandoCarpeta(true)
    try {
      await crearCarpeta('', CARPETA_SOLICITUDES)
      await refrescarSolicitudes()
    } catch {
      setErrorSolicitudes('No se pudo crear la carpeta.')
    } finally {
      setCreandoCarpeta(false)
    }
  }

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

  async function descargarExcel() {
    const asignadas = filasCruce.filter((f) => f.codigoAsignado)
    if (asignadas.length === 0) return
    setDescargando(true)
    try {
      const filas: FilaCruce[] = asignadas.map((f) => {
        const muestra = muestrasGC?.find((m) => m.codigo === f.codigoAsignado)
        return {
          codigo: f.codigoAsignado as string,
          archivo_solicitud: f.solicitud.archivo,
          n_solicitud: f.solicitud.campos['N° Solicitud'] ?? null,
          seq_line: muestra?.seq_line ?? null,
          fecha_inyeccion: muestra?.fecha_inyeccion ?? null,
          resultados: muestra?.resultados ?? [],
        }
      })
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

  return (
    <div>
      <Header
        title="Reporte análisis cromatografía"
        description="Arrastra una solicitud a la zona de cruce y asígnale el código de vial del GC que le corresponde."
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
            Archivos en Storage / {CARPETA_SOLICITUDES}. Arrastra una fila hacia la zona de cruce; haz clic para ver
            la ficha completa.
          </p>
          {errorSolicitudes && <p className={styles.error}>{errorSolicitudes}</p>}
          {carpetaNoExiste ? (
            <div className={styles.avisoCarpeta}>
              <p>Todavía no existe la carpeta "{CARPETA_SOLICITUDES}" en Storage.</p>
              <Button variant="secondary" onClick={crearCarpetaSolicitudes} disabled={creandoCarpeta}>
                {creandoCarpeta ? 'Creando…' : 'Crear carpeta'}
              </Button>
            </div>
          ) : solicitudes === null ? (
            <p className={styles.estado}>Cargando…</p>
          ) : solicitudes.length === 0 ? (
            <p className={styles.estado}>No hay solicitudes en Storage todavía.</p>
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
                {filasCruce.map((f) => {
                  const muestra = muestrasGC?.find((m) => m.codigo === f.codigoAsignado)
                  const porCodigo = new Map((muestra?.resultados ?? []).map((r) => [r.codigo, r]))
                  const validacion = muestra
                    ? validarCruce(f.solicitud.analitos_solicitados, muestra.resultados)
                    : null
                  return (
                    <tr key={f.solicitud.archivo}>
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
                        ) : validacion?.severidad === 'info' ? (
                          <span className={styles.estadoInfo} title={validacion.mensaje ?? undefined}>
                            ℹ Info
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
            <Button variant="secondary" onClick={descargarExcel} disabled={descargando}>
              {descargando ? 'Generando…' : 'Descargar Excel'}
            </Button>
            <button
              type="button"
              className={styles.botonProximamente}
              disabled
              title="Falta definir cómo se completan los datos que aún no vienen en la solicitud antes de insertar a producción."
            >
              Subir a base de datos (próximamente)
            </button>
          </div>
        )}
      </Card>

      {solicitudEnFicha && <SolicitudFichaModal solicitud={solicitudEnFicha} onCerrar={() => setSolicitudEnFicha(null)} />}
    </div>
  )
}
