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
  filtrarPorFolio,
  descargarInformesPDF,
  listarSolicitudes,
  parsearGC,
  subirCruceABaseDeDatos,
} from '@/features/emitir'
import type { FilaCruce, FilaSubida, MuestraGC, ResultadoAnalito, Solicitud } from '@/features/emitir'
import { EscanerSolicitud } from './EscanerSolicitud'
import { EscanerVial } from './EscanerVial'
import { SolicitudFichaModal } from './SolicitudFichaModal'
import { ConfiguracionInformeModal } from './ConfiguracionInformeModal'
import styles from './CromatografiaEmitirView.module.css'

const TIPO_ARRASTRE_SOLICITUD = 'application/x-solicitud-archivo'

interface FilaEnCruce {
  solicitud: Solicitud
  codigoAsignado: string | null
  fechaRecepcion: string
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
  const [filtroFolio, setFiltroFolio] = useState('')

  // El par que se está armando con la pistola: una solicitud y su vial. Es el
  // flujo normal —escanear la hoja, escanear el vial, cruzar—; la zona de
  // asignación manual de más abajo queda para los casos raros.
  const [solicitudEscaneada, setSolicitudEscaneada] = useState<Solicitud | null>(null)
  const [vialEscaneado, setVialEscaneado] = useState<MuestraGC | null>(null)
  const [fechaRecepcion, setFechaRecepcion] = useState('')
  const [mostrarManual, setMostrarManual] = useState(false)
  // Sube en cada cruce: vacía las dos cajas y deja el foco listo para el par
  // siguiente, para poder pasar veinte hojas sin tocar el mouse.
  const [cruces, setCruces] = useState(0)

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
    if (solicitud) agregarACruce(solicitud)
  }

  function agregarACruce(solicitud: Solicitud) {
    setFilasCruce((prev) =>
      prev.some((f) => f.solicitud.archivo === solicitud.archivo)
        ? prev
        : [...prev, { solicitud, codigoAsignado: null, fechaRecepcion: '' }],
    )
  }

  function asignarCodigo(archivo: string, codigo: string) {
    setFilasCruce((prev) =>
      prev.map((f) => (f.solicitud.archivo === archivo ? { ...f, codigoAsignado: codigo || null } : f)),
    )
  }

  function asignarFechaRecepcion(archivo: string, fecha: string) {
    setFilasCruce((prev) => prev.map((f) => (f.solicitud.archivo === archivo ? { ...f, fechaRecepcion: fecha } : f)))
  }

  function quitarDeCruce(archivo: string) {
    setFilasCruce((prev) => prev.filter((f) => f.solicitud.archivo !== archivo))
  }

  // Un cruce solo se puede hacer con los dos lados escaneados. Y se avisa
  // -sin bloquear- cuando los analitos no calzan: puede ser el vial
  // equivocado, y es mejor verlo antes de generar el informe que después.
  const parListo = Boolean(solicitudEscaneada && vialEscaneado)
  const validacionDelPar = useMemo(
    () =>
      solicitudEscaneada && vialEscaneado
        ? validarCruce(solicitudEscaneada.analitos_solicitados, vialEscaneado.resultados)
        : null,
    [solicitudEscaneada, vialEscaneado],
  )

  function hacerCruce() {
    if (!solicitudEscaneada || !vialEscaneado) return
    setFilasCruce((prev) => [
      ...prev.filter((f) => f.solicitud.archivo !== solicitudEscaneada.archivo),
      { solicitud: solicitudEscaneada, codigoAsignado: vialEscaneado.codigo, fechaRecepcion },
    ])
    // Se limpian los dos lados para poder seguir con el siguiente par sin
    // tocar el mouse: escanear hoja, escanear vial, cruzar, repetir.
    setSolicitudEscaneada(null)
    setVialEscaneado(null)
    setCruces((n) => n + 1)
  }

  // La tabla muestra lo mismo que el escáner está buscando: así se ve al tiro
  // qué alcanzó a leer la pistola, aunque el folio venga a medias.
  const solicitudesVisibles = useMemo(
    () => filtrarPorFolio(solicitudes ?? [], filtroFolio),
    [solicitudes, filtroFolio],
  )

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
        fecha_recepcion: f.fechaRecepcion || null,
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
        description="Escanea la solicitud impresa y el vial del GC. Cuando los dos queden en verde, crúzalos y genera el informe."
        acciones={
          <button type="button" className={styles.botonChico} onClick={() => setMostrarConfiguracion(true)}>
            Configurar informe
          </button>
        }
      />

      <div className={styles.lienzo}>
        <Card className={styles.panel}>
          <div className={styles.panelCabecera}>
            <h3>Solicitudes de análisis</h3>
            <button type="button" className={styles.botonChico} onClick={refrescarSolicitudes}>
              Actualizar
            </button>
          </div>
          <p className={styles.panelAyuda}>
            Solicitudes de análisis del laboratorio AGROFRESH (Toma de muestras → Nueva solicitud). Escanea el
            código de barras de la hoja impresa, o haz clic en una fila para ver su ficha.
          </p>
          <EscanerSolicitud
            solicitudes={solicitudes}
            elegida={solicitudEscaneada}
            onElegir={setSolicitudEscaneada}
            onFiltroCambia={setFiltroFolio}
            listo={parListo}
            reinicio={cruces}
            onVerFicha={setSolicitudEnFicha}
          />
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
                  {solicitudesVisibles.map((s) => (
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
                  {solicitudesVisibles.length === 0 && (
                    <tr>
                      <td colSpan={5} className={styles.estado}>
                        Ninguna solicitud tiene el folio “{filtroFolio}”.
                      </td>
                    </tr>
                  )}
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

          <EscanerVial
            muestras={muestrasGC}
            elegida={vialEscaneado}
            onElegir={setVialEscaneado}
            listo={parListo}
            reinicio={cruces}
          />

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

      <div className={styles.zonaBotonCruce}>
        {validacionDelPar?.severidad === 'sospechoso' && (
          <p className={styles.avisoPar}>⚠ {validacionDelPar.mensaje}</p>
        )}
        <div className={styles.lineaCruce}>
          <label className={styles.campoFecha}>
            <span>Fecha de recepción</span>
            <input
              type="date"
              value={fechaRecepcion}
              onChange={(e) => setFechaRecepcion(e.target.value)}
            />
          </label>
          <Button onClick={hacerCruce} disabled={!parListo} className={styles.botonCruce}>
            Hacer cruce
          </Button>
        </div>
        <p className={styles.ayudaCruce}>
          {parListo
            ? 'Los dos lados están listos. Al cruzar, el par pasa a los datos del informe.'
            : 'Escanea la solicitud impresa y el vial del GC para poder cruzarlos.'}
        </p>
      </div>

      {filasCruce.length > 0 && (
        <Card className={styles.panelDatos}>
          <div className={styles.panelCabecera}>
            <h3>Datos del informe</h3>
            <span className={styles.contadorDatos}>
              {filasCruce.length} cruce{filasCruce.length === 1 ? '' : 's'}
            </span>
          </div>
          <p className={styles.panelAyuda}>
            Esto es exactamente lo que va a salir en el informe. No se edita acá: si algo está
            mal, quita el cruce y vuelve a escanear.
          </p>
          <div className={styles.tablaCaja}>
            <table className={styles.tabla}>
              <thead>
                <tr>
                  <th>N° Solicitud</th>
                  <th>Sold To</th>
                  <th>Especie</th>
                  <th>Variedad</th>
                  <th>Código de vial</th>
                  <th>Fecha inyección</th>
                  <th>Fecha recepción</th>
                  {columnasAnalito.map((a) => (
                    <th key={a}>{a}</th>
                  ))}
                  <th>Estado</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filasConValidacion.map((f) => {
                  const porCodigo = new Map((f.muestra?.resultados ?? []).map((r) => [r.codigo, r]))
                  return (
                    <tr
                      key={f.solicitud.archivo}
                      className={cn(
                        f.validacion?.severidad === 'ok' && styles.filaOk,
                        f.validacion?.severidad === 'sospechoso' && styles.filaSospechosa,
                      )}
                    >
                      <td className={styles.nombre}>
                        {f.solicitud.campos['N° Solicitud'] || f.solicitud.archivo}
                      </td>
                      <td>{f.solicitud.campos['Sold To (Nombre)'] || '—'}</td>
                      <td>{f.solicitud.campos['Especie'] || '—'}</td>
                      <td>{f.solicitud.campos['Variedad'] || '—'}</td>
                      <td className={styles.mono}>{f.codigoAsignado ?? '—'}</td>
                      <td className={styles.mono}>{f.muestra?.fecha_inyeccion ?? '—'}</td>
                      <td className={styles.mono}>{f.fechaRecepcion || '—'}</td>
                      {columnasAnalito.map((a) => (
                        <td key={a} className={styles.mono}>
                          {porCodigo.get(a)?.amount ?? '—'}
                        </td>
                      ))}
                      <td>
                        {!f.muestra ? (
                          <span className={styles.estadoPendiente}>Sin vial</span>
                        ) : f.validacion?.severidad === 'sospechoso' ? (
                          <span className={styles.estadoSospechoso} title={f.validacion.mensaje ?? undefined}>
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

          <div className={styles.exportarAcciones}>
            <div className={styles.exportarBotones}>
              <Button
                onClick={descargarInformes}
                disabled={descargandoPDF || hayCrucesSospechosos || cantidadExportable === 0}
              >
                {descargandoPDF
                  ? 'Generando…'
                  : cantidadExportable > 1
                    ? `Generar ${cantidadExportable} informes (PDF)`
                    : 'Generar informe (PDF)'}
              </Button>
              <Button
                variant="secondary"
                onClick={descargarExcel}
                disabled={descargando || hayCrucesSospechosos || cantidadExportable === 0}
              >
                {descargando ? 'Generando…' : 'Descargar Excel'}
              </Button>
              <Button
                variant="secondary"
                onClick={subirABaseDeDatos}
                disabled={subiendo || hayCrucesSospechosos || cantidadExportable === 0}
              >
                {subiendo ? 'Subiendo…' : 'Subir a base de datos'}
              </Button>
            </div>
            {hayCrucesSospechosos && (
              <p className={styles.avisoBloqueo}>
                Hay cruces marcados "⚠ Revisar" — corrígelos o quítalos antes de generar el informe.
              </p>
            )}
            {!hayCrucesSospechosos && cantidadExportable === 0 && (
              <p className={styles.avisoBloqueo}>
                Ningún cruce tiene vial asignado todavía.
              </p>
            )}
          </div>
        </Card>
      )}

      <button
        type="button"
        className={styles.botonManual}
        onClick={() => setMostrarManual((v) => !v)}
      >
        {mostrarManual ? '▾' : '▸'} Asignación manual
      </button>

      {mostrarManual && (
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
                  <th>Fecha recepción</th>
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
                      <td>
                        <input
                          type="date"
                          value={f.fechaRecepcion}
                          onChange={(e) => asignarFechaRecepcion(f.solicitud.archivo, e.target.value)}
                          className={styles.selectCodigo}
                        />
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

        {resultadoSubida && (
          <div className={styles.exportarAcciones}>
            {(
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
      )}

      {solicitudEnFicha && <SolicitudFichaModal solicitud={solicitudEnFicha} onCerrar={() => setSolicitudEnFicha(null)} />}
      {mostrarConfiguracion && <ConfiguracionInformeModal onCerrar={() => setMostrarConfiguracion(false)} />}
    </div>
  )
}
