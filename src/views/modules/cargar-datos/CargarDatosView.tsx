import { useRef, useState } from 'react'
import type { DragEvent } from 'react'
import { Header } from '@/components/layout/Header'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import {
  confirmarCarga,
  leerExcel,
  previsualizarCarga,
  validarEstructuraExcel,
} from '@/features/ingest'
import type {
  FilaIngest,
  RespuestaCarga,
  ResultadoValidacionEstructura,
} from '@/features/ingest'
import { DataCoreView } from '@/views/modules/datacore/DataCoreView'
import type { Vista as VistaDataCore } from '@/views/modules/datacore/DataCoreView'
import { HttpError } from '@/services/http/client'
import styles from './CargarDatosView.module.css'

interface PasoDef {
  numero: 1 | 2 | 3 | 4 | 5
  nombre: string
}

const PASOS: PasoDef[] = [
  { numero: 1, nombre: 'Cargar archivo' },
  { numero: 2, nombre: 'Validar archivo' },
  { numero: 3, nombre: 'Homogeneizar datos' },
  { numero: 4, nombre: 'Revisar resultados' },
  { numero: 5, nombre: 'Subir a base de datos' },
]

const VISTA_DATACORE_POR_PASO: Record<3 | 4 | 5, VistaDataCore> = {
  3: 'homogenizar',
  4: 'auditoria',
  // Después de subir a la base es cuando tiene sentido chequear que lo recién
  // ingresado calce con Listados -antes de eso todavía no hay nada nuevo que
  // auditar en `solicitud`-.
  5: 'chequeo_listados',
}

export function CargarDatosView() {
  const [paso, setPaso] = useState<PasoDef['numero']>(1)
  const [archivo, setArchivo] = useState<File | null>(null)
  const [filas, setFilas] = useState<FilaIngest[] | null>(null)
  const [headers, setHeaders] = useState<string[]>([])
  const [estructura, setEstructura] = useState<ResultadoValidacionEstructura | null>(null)
  const [previsualizacion, setPrevisualizacion] = useState<RespuestaCarga | null>(null)
  const [procesandoArchivo, setProcesandoArchivo] = useState(false)
  const [validandoDatos, setValidandoDatos] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [arrastrando, setArrastrando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [confirmado, setConfirmado] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const maxPasoAlcanzado = confirmado ? 5 : filas ? 2 : 1

  function mensajeErrorBackend(err: unknown): string {
    if (err instanceof HttpError) return `⚠ ${err.message}`
    return '⚠ No se pudo conectar con el backend. Revisa que esté corriendo.'
  }

  function mostrarToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 5000)
  }

  async function procesarArchivo(file: File) {
    setError(null)
    setProcesandoArchivo(true)
    try {
      const { rows, headers: hs } = await leerExcel(file)
      if (!rows.length) {
        setError('El archivo no tiene filas de datos (¿solo trae el encabezado?).')
        return
      }
      setArchivo(file)
      setFilas(rows)
      setHeaders(hs)
      setPrevisualizacion(null)
      setConfirmado(false)
      const resultado = await validarEstructuraExcel(hs)
      setEstructura(resultado)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo leer el archivo.')
    } finally {
      setProcesandoArchivo(false)
    }
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setArrastrando(false)
    const f = e.dataTransfer.files[0]
    if (f && /\.(xlsx|xls)$/i.test(f.name)) void procesarArchivo(f)
    else setError('Por favor sube un archivo .xlsx o .xls')
  }

  async function irAValidar() {
    if (!filas) return
    setPaso(2)
    if (previsualizacion) return
    setValidandoDatos(true)
    try {
      const resultado = await previsualizarCarga(filas)
      setPrevisualizacion(resultado)
    } catch (err) {
      mostrarToast(mensajeErrorBackend(err))
    } finally {
      setValidandoDatos(false)
    }
  }

  async function enviarADataCore() {
    if (!filas) return
    setEnviando(true)
    try {
      const resultado = await confirmarCarga(filas)
      const r = resultado.resumen
      setConfirmado(true)
      setPaso(3)
      mostrarToast(
        `✅ ${r.pendientes_revision} fila(s) enviadas a Data Core para homogeneizar y revisar. La base de datos todavía no cambió.`,
      )
    } catch (err) {
      mostrarToast(mensajeErrorBackend(err))
    } finally {
      setEnviando(false)
    }
  }

  function irAPaso(n: PasoDef['numero']) {
    if (n > maxPasoAlcanzado) return
    setPaso(n)
  }

  const conflictosSinInforme = previsualizacion?.resumen.conflictos_sin_informe ?? 0
  const duplicadosEnArchivo = previsualizacion?.resumen.duplicados_en_archivo ?? 0
  const pendientesRevision = previsualizacion?.resumen.pendientes_revision ?? 0
  const filasConflicto = (previsualizacion?.detalle ?? []).filter(
    (d) => d.sin_informe || (d.pendiente_revision && !d.omitida),
  )

  return (
    <div className={styles.wrap}>
      <Header
        title="Cargar Datos"
        description="Flujo oficial para incorporar resultados de laboratorio al sistema: valida, homogeneiza y sube a la base de datos."
      />

      <nav className={styles.stepper} aria-label="Pasos de Cargar Datos">
        {PASOS.map((p, i) => {
          const alcanzable = p.numero <= maxPasoAlcanzado
          const activo = p.numero === paso
          const completo = p.numero < paso || (p.numero <= maxPasoAlcanzado && p.numero < maxPasoAlcanzado)
          return (
            <div className={styles.paso} key={p.numero}>
              <button
                type="button"
                className={`${styles.pasoBoton} ${activo ? styles.pasoActivo : ''} ${completo ? styles.pasoCompleto : ''}`}
                onClick={() => irAPaso(p.numero)}
                disabled={!alcanzable}
                title={p.nombre}
              >
                <span className={styles.pasoCirculo}>{completo ? '✓' : p.numero}</span>
                <span className={styles.pasoTextos}>
                  <span className={styles.pasoNumeroLabel}>Paso {p.numero}</span>
                  <span className={styles.pasoNombre}>{p.nombre}</span>
                </span>
              </button>
              {i < PASOS.length - 1 && (
                <span className={`${styles.pasoLinea} ${p.numero < maxPasoAlcanzado ? styles.pasoLineaCompleta : ''}`} />
              )}
            </div>
          )
        })}
      </nav>

      {error && <p className={styles.error}>⚠ {error}</p>}

      {paso === 1 && (
        <Card className={styles.tarjeta}>
          <div
            className={`${styles.zona} ${arrastrando ? styles.zonaActiva : ''}`}
            onDragOver={(e) => { e.preventDefault(); setArrastrando(true) }}
            onDragLeave={() => setArrastrando(false)}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls"
              className={styles.inputOculto}
              onChange={(e) => e.target.files?.[0] && void procesarArchivo(e.target.files[0])}
            />
            <div className={styles.zonaIcono}>📂</div>
            <h2>{procesandoArchivo ? 'Leyendo…' : 'Arrastra el Excel o haz clic para seleccionarlo'}</h2>
            <p>Plantilla de 69 columnas · Solo archivos .xlsx / .xls</p>
          </div>

          {archivo && filas && (
            <div className={styles.archivoElegido}>
              <div className={styles.archivoInfo}>
                <span className={styles.archivoNombre}>{archivo.name}</span>
                <span className={styles.archivoSub}>{filas.length.toLocaleString('es-CL')} filas · {headers.length} columnas</span>
              </div>
            </div>
          )}

          {estructura && (
            <div className={`${styles.bannerEstructura} ${estructura.valido ? styles.bannerOk : styles.bannerErrores}`}>
              {estructura.valido ? (
                <p className={styles.bannerTitulo}>✓ La estructura coincide con la plantilla oficial de 69 columnas.</p>
              ) : (
                <>
                  <p className={styles.bannerTitulo}>⚠ La estructura no coincide con la plantilla oficial ({estructura.errores.length} problema{estructura.errores.length === 1 ? '' : 's'})</p>
                  <ul className={styles.listaErrores}>
                    {estructura.errores.map((e, i) => <li key={i}>{e}</li>)}
                  </ul>
                  <p className={styles.archivoSub}>
                    Puedes continuar igual si este archivo usa el formato antiguo del sistema — se procesa exactamente como
                    antes. Esta validación es solo una ayuda para detectar archivos armados a mano con nombres o columnas
                    equivocadas.
                  </p>
                </>
              )}
            </div>
          )}

          <div className={styles.acciones}>
            <span />
            <div className={styles.accionesDerecha}>
              <Button disabled={!filas || procesandoArchivo} onClick={() => void irAValidar()}>
                Continuar →
              </Button>
            </div>
          </div>
        </Card>
      )}

      {paso === 2 && (
        <Card className={styles.tarjeta}>
          {validandoDatos || !previsualizacion ? (
            <p>Analizando el archivo contra la base de datos…</p>
          ) : (
            <>
              <div className={styles.statsGrid}>
                <Card className={styles.statCard}>
                  <span className={styles.statNum}>{previsualizacion.resumen.solicitudes_nuevas.toLocaleString('es-CL')}</span>
                  <span className={styles.statLbl}>Informes nuevos</span>
                </Card>
                <Card className={styles.statCard}>
                  <span className={styles.statNum}>{previsualizacion.resumen.solicitudes_existentes.toLocaleString('es-CL')}</span>
                  <span className={styles.statLbl}>Ya existen en la BD</span>
                </Card>
                <Card className={`${styles.statCard} ${pendientesRevision ? styles.statAlerta : ''}`}>
                  <span className={styles.statNum}>{pendientesRevision.toLocaleString('es-CL')}</span>
                  <span className={styles.statLbl}>Requieren revisión</span>
                </Card>
                <Card className={`${styles.statCard} ${conflictosSinInforme ? styles.statPeligro : ''}`}>
                  <span className={styles.statNum}>{conflictosSinInforme.toLocaleString('es-CL')}</span>
                  <span className={styles.statLbl}>Sin N° Informe</span>
                </Card>
                <Card className={`${styles.statCard} ${duplicadosEnArchivo ? styles.statPeligro : ''}`}>
                  <span className={styles.statNum}>{duplicadosEnArchivo.toLocaleString('es-CL')}</span>
                  <span className={styles.statLbl}>Duplicados en archivo</span>
                </Card>
                <Card className={styles.statCard}>
                  <span className={styles.statNum}>{previsualizacion.resumen.filas_omitidas.toLocaleString('es-CL')}</span>
                  <span className={styles.statLbl}>Filas vacías descartadas</span>
                </Card>
              </div>

              {filasConflicto.length > 0 && (
                <div className={styles.filasConflicto}>
                  {filasConflicto.slice(0, 30).map((f, i) => (
                    <div className={styles.filaConflicto} key={i}>
                      <div className={styles.filaConflictoCabecera}>
                        <span>Fila {f.fila}</span>
                        {f.nro_solicitud && <span>· N° Informe {f.nro_solicitud}</span>}
                      </div>
                      {f.motivos.map((m, j) => <span key={j}>{m}</span>)}
                    </div>
                  ))}
                  {filasConflicto.length > 30 && (
                    <p className={styles.archivoSub}>… y {filasConflicto.length - 30} fila(s) más con conflictos.</p>
                  )}
                </div>
              )}

              <p className={styles.archivoSub}>
                Sold To, Ship To, Especie y Variedad se homologan en el siguiente paso, dentro de Data Core. Ningún dato entra
                todavía a la base — recién se guarda como copia de trabajo aislada al confirmar.
              </p>
            </>
          )}

          <div className={styles.acciones}>
            <Button variant="secondary" onClick={() => setPaso(1)}>← Atrás</Button>
            <div className={styles.accionesDerecha}>
              <Button disabled={!previsualizacion || enviando} onClick={() => void enviarADataCore()}>
                {enviando ? 'Enviando…' : 'Enviar a Data Core →'}
              </Button>
            </div>
          </div>
        </Card>
      )}

      {(paso === 3 || paso === 4 || paso === 5) && (
        <>
          <div className={styles.avisoFase}>
            {paso === 3 && 'Homogeneiza Sold To, Ship To, Especie y Variedad contra los listados oficiales.'}
            {paso === 4 && 'Revisa el resultado consolidado antes de la carga definitiva.'}
            {paso === 5 && 'Cuando no queden conflictos pendientes, sube el lote completo a la base de datos.'}
          </div>
          <div className={styles.embebidoDataCore}>
            <DataCoreView key={VISTA_DATACORE_POR_PASO[paso]} vistaInicial={VISTA_DATACORE_POR_PASO[paso]} />
          </div>
        </>
      )}

      {toast && <div className={styles.toast}>{toast}</div>}
    </div>
  )
}
