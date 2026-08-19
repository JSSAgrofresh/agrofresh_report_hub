import { useCallback, useEffect, useMemo, useState } from 'react'
import type { DragEvent } from 'react'
import { Header } from '@/components/layout/Header'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { IconArchivoPlano } from '@/components/ui/icons'
import { cn } from '@/lib/cn'
import { crearCarpeta, listar } from '@/features/storage'
import type { EntradaStorage } from '@/features/storage'
import { HttpError } from '@/services/http/client'
import { descargarExcelCruce, parsearGC } from '@/features/emitir'
import type { FilaCruce, MuestraGC } from '@/features/emitir'
import styles from './CromatografiaEmitirView.module.css'

const CARPETA_SOLICITUDES = 'Solicitud de Muestreo'

function extraerCodigo(nombreArchivo: string): string | null {
  const m = nombreArchivo.match(/[A-Za-z]{2,}\d{3,}/)
  return m ? m[0].toUpperCase() : null
}

export function CromatografiaEmitirView() {
  const [solicitudes, setSolicitudes] = useState<EntradaStorage[] | null>(null)
  const [errorSolicitudes, setErrorSolicitudes] = useState<string | null>(null)
  const [carpetaNoExiste, setCarpetaNoExiste] = useState(false)
  const [creandoCarpeta, setCreandoCarpeta] = useState(false)
  const [seleccionadas, setSeleccionadas] = useState<Set<string>>(new Set())

  const [muestrasGC, setMuestrasGC] = useState<MuestraGC[] | null>(null)
  const [nombreArchivoGC, setNombreArchivoGC] = useState<string | null>(null)
  const [cargandoGC, setCargandoGC] = useState(false)
  const [errorGC, setErrorGC] = useState<string | null>(null)
  const [arrastrando, setArrastrando] = useState(false)

  const [filasCruce, setFilasCruce] = useState<FilaCruce[] | null>(null)
  const [descargando, setDescargando] = useState(false)

  const refrescarSolicitudes = useCallback(async () => {
    try {
      const resultado = await listar(CARPETA_SOLICITUDES)
      setSolicitudes(resultado.entradas.filter((e) => e.tipo === 'archivo'))
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

  function alternarSeleccion(ruta: string) {
    setSeleccionadas((prev) => {
      const nuevo = new Set(prev)
      if (nuevo.has(ruta)) nuevo.delete(ruta)
      else nuevo.add(ruta)
      return nuevo
    })
  }

  async function subirGC(archivo: File) {
    setCargandoGC(true)
    setErrorGC(null)
    setFilasCruce(null)
    try {
      const muestras = await parsearGC(archivo)
      setMuestrasGC(muestras)
      setNombreArchivoGC(archivo.name)
    } catch {
      setErrorGC('No se pudo leer el archivo. ¿Es el reporte de texto del GC?')
      setMuestrasGC(null)
      setNombreArchivoGC(null)
    } finally {
      setCargandoGC(false)
    }
  }

  function onDropGC(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setArrastrando(false)
    const archivo = e.dataTransfer.files[0]
    if (archivo) subirGC(archivo)
  }

  const solicitudesSeleccionadas = useMemo(
    () => (solicitudes ?? []).filter((s) => seleccionadas.has(s.ruta)),
    [solicitudes, seleccionadas],
  )

  const puedeCruzar = solicitudesSeleccionadas.length > 0 && muestrasGC !== null

  function cruzar() {
    if (!muestrasGC) return
    const porCodigo = new Map(muestrasGC.map((m) => [m.codigo.toUpperCase(), m]))
    const filas: FilaCruce[] = solicitudesSeleccionadas.map((s) => {
      const codigo = extraerCodigo(s.nombre)
      const muestra = codigo ? porCodigo.get(codigo) : undefined
      return {
        codigo: codigo ?? s.nombre,
        archivo_solicitud: s.nombre,
        seq_line: muestra?.seq_line ?? null,
        fecha_inyeccion: muestra?.fecha_inyeccion ?? null,
        resultados: muestra?.resultados ?? [],
      }
    })
    setFilasCruce(filas)
  }

  const analitos = useMemo(() => {
    const vistos: string[] = []
    for (const fila of filasCruce ?? []) {
      for (const r of fila.resultados) {
        if (!vistos.includes(r.analito)) vistos.push(r.analito)
      }
    }
    return vistos
  }, [filasCruce])

  async function descargarExcel() {
    if (!filasCruce) return
    setDescargando(true)
    try {
      const blob = await descargarExcelCruce(filasCruce)
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
        description="Cruza las solicitudes de muestreo (Storage) con los resultados del GC para armar el registro final."
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
            Archivos en Storage / {CARPETA_SOLICITUDES}. Haz clic para seleccionar los que vas a cruzar.
          </p>
          {errorSolicitudes && <p className={styles.error}>{errorSolicitudes}</p>}
          {carpetaNoExiste ? (
            <div className={styles.avisoCarpeta}>
              <p>
                Todavía no existe la carpeta "{CARPETA_SOLICITUDES}" en Storage.
              </p>
              <Button variant="secondary" onClick={crearCarpetaSolicitudes} disabled={creandoCarpeta}>
                {creandoCarpeta ? 'Creando…' : 'Crear carpeta'}
              </Button>
            </div>
          ) : solicitudes === null ? (
            <p className={styles.estado}>Cargando…</p>
          ) : solicitudes.length === 0 ? (
            <p className={styles.estado}>
              No hay archivos en la carpeta "{CARPETA_SOLICITUDES}" de Storage todavía.
            </p>
          ) : (
            <div className={styles.grillaArchivos}>
              {solicitudes.map((s) => (
                <button
                  key={s.ruta}
                  type="button"
                  className={cn(styles.archivoIcono, seleccionadas.has(s.ruta) && styles.archivoSeleccionado)}
                  onClick={() => alternarSeleccion(s.ruta)}
                  title={s.nombre}
                >
                  <IconArchivoPlano className={styles.icono} />
                  <span className={styles.archivoNombre}>{s.nombre}</span>
                </button>
              ))}
            </div>
          )}
        </Card>

        <Card className={styles.panel}>
          <div className={styles.panelCabecera}>
            <h3>Resultados del GC</h3>
          </div>
          <div
            className={cn(styles.zona, arrastrando && styles.zonaActiva)}
            onDragOver={(e) => {
              e.preventDefault()
              setArrastrando(true)
            }}
            onDragLeave={() => setArrastrando(false)}
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
            <div className={styles.listaMuestras}>
              {muestrasGC.map((m) => {
                const detecciones = m.resultados.filter((r) => r.amount != null && r.amount > 0)
                return (
                  <div key={m.codigo} className={styles.filaMuestra}>
                    <span className={styles.muestraCodigo}>{m.codigo}</span>
                    <span className={styles.muestraDetalle}>
                      {detecciones.length === 0
                        ? 'sin detecciones'
                        : detecciones.map((r) => `${r.analito} ${r.amount}`).join(' · ')}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </Card>
      </div>

      <Card className={styles.panelCruce}>
        <div className={styles.cruceAcciones}>
          <p className={styles.panelAyuda}>
            {solicitudesSeleccionadas.length} solicitud(es) seleccionada(s) · {muestrasGC ? `${muestrasGC.length} muestras leídas del GC` : 'sin resultados del GC todavía'}
          </p>
          <Button disabled={!puedeCruzar} onClick={cruzar}>
            Cruzar solicitudes con resultados
          </Button>
        </div>

        {filasCruce && (
          <>
            <div className={styles.tablaCaja}>
              <table className={styles.tabla}>
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Archivo solicitud</th>
                    <th>Fecha inyección</th>
                    {analitos.map((a) => (
                      <th key={a}>{a}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filasCruce.map((f) => {
                    const porAnalito = new Map(f.resultados.map((r) => [r.analito, r]))
                    const sinCruce = f.resultados.length === 0
                    return (
                      <tr key={f.archivo_solicitud ?? f.codigo} className={cn(sinCruce && styles.filaSinCruce)}>
                        <td className={styles.nombre}>{f.codigo}</td>
                        <td>{f.archivo_solicitud}</td>
                        <td className={styles.mono}>{f.fecha_inyeccion ?? (sinCruce ? 'sin resultado en el GC' : '—')}</td>
                        {analitos.map((a) => {
                          const r = porAnalito.get(a)
                          return (
                            <td key={a} className={styles.mono}>
                              {r?.amount != null ? r.amount : '—'}
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className={styles.exportarAcciones}>
              <Button variant="secondary" onClick={descargarExcel} disabled={descargando}>
                {descargando ? 'Generando…' : 'Descargar Excel'}
              </Button>
              <button type="button" className={styles.botonProximamente} disabled title="Falta definir cómo se completan los datos de cliente/especie/etc. para cada solicitud antes de subir a producción.">
                Subir a base de datos (próximamente)
              </button>
            </div>
          </>
        )}
      </Card>
    </div>
  )
}
