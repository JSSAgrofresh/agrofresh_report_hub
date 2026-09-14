import { useRef, useState } from 'react'
import type { DragEvent } from 'react'
import { Button } from '@/components/ui/Button'
import { leerExcel, confirmarCarga } from '@/features/ingest'
import type { FilaIngest } from '@/features/ingest'
import { validarExcel } from '@/features/datacore'
import type { FilaValidada, CeldaValidada } from '@/features/datacore'
import styles from './IngestaExcelPanel.module.css'

type CampoKey = 'sold_to' | 'ship_to' | 'especie' | 'variedad'
const ETIQUETA: Record<CampoKey, string> = {
  sold_to: 'Sold To',
  ship_to: 'Ship To',
  especie: 'Especie',
  variedad: 'Variedad',
}

interface ModalState {
  fila: number
  campo: CampoKey
  celda: CeldaValidada
}

export function IngestaExcelPanel() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [arrastrando, setArrastrando] = useState(false)
  const [cargando, setCargando] = useState(false)
  const [filas, setFilas] = useState<FilaIngest[] | null>(null)
  const [resultado, setResultado] = useState<FilaValidada[] | null>(null)
  // Resoluciones manuales: { "n-campo": valor_canonico_elegido }
  const [resoluciones, setResoluciones] = useState<Record<string, string>>({})
  const [modal, setModal] = useState<ModalState | null>(null)
  const [inputModal, setInputModal] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [confirmando, setConfirmando] = useState(false)
  const [exito, setExito] = useState<string | null>(null)

  async function procesarArchivo(file: File) {
    if (!/\.(xlsx|xls)$/i.test(file.name)) {
      setError('Por favor sube un archivo .xlsx o .xls')
      return
    }
    setError(null)
    setResultado(null)
    setResoluciones({})
    setExito(null)
    setCargando(true)
    try {
      const { rows } = await leerExcel(file)
      if (!rows.length) { setError('El archivo no tiene filas de datos.'); return }
      setFilas(rows)
      const res = await validarExcel(rows)
      setResultado(res.filas)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo procesar el archivo.')
    } finally {
      setCargando(false)
    }
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setArrastrando(false)
    const f = e.dataTransfer.files[0]
    if (f) void procesarArchivo(f)
  }

  function abrirModal(fila: FilaValidada, campo: CampoKey) {
    const celda = fila[campo]
    setModal({ fila: fila.n, campo, celda })
    setInputModal('')
  }

  function elegirSugerencia(valor: string) {
    if (!modal) return
    const clave = `${modal.fila}-${modal.campo}`
    setResoluciones((prev) => ({ ...prev, [clave]: valor }))
    setModal(null)
  }

  function confirmarManual() {
    if (!modal || !inputModal.trim()) return
    elegirSugerencia(inputModal.trim())
  }

  // Construye las filas finales con resoluciones manuales aplicadas
  function filasFinales(): FilaValidada[] {
    if (!resultado) return []
    return resultado.map((f) => {
      const campos: CampoKey[] = ['sold_to', 'ship_to', 'especie', 'variedad']
      const parcheada = { ...f }
      for (const campo of campos) {
        const clave = `${f.n}-${campo}`
        const elegido = resoluciones[clave]
        if (elegido) {
          parcheada[campo] = { ...f[campo], canonico: elegido, estado: 'homogenizado' }
        }
      }
      parcheada.valida = (['sold_to', 'ship_to', 'especie', 'variedad'] as CampoKey[]).every(
        (c) => parcheada[c].estado !== 'sin_match'
      )
      return parcheada
    })
  }

  const filasConEstado = filasFinales()
  const totalOk = filasConEstado.filter((f) => f.valida).length
  const totalError = filasConEstado.length - totalOk
  const todasValidas = totalError === 0 && filasConEstado.length > 0

  async function enviarABase() {
    if (!filas || !todasValidas) return
    setConfirmando(true)
    try {
      const r = await confirmarCarga(filas)
      setExito(`${r.resumen.pendientes_revision ?? 0} filas enviadas a auditoría en Data Core.`)
      setResultado(null)
      setFilas(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo confirmar la carga.')
    } finally {
      setConfirmando(false)
    }
  }

  function renderCelda(fila: FilaValidada, campo: CampoKey) {
    const clave = `${fila.n}-${campo}`
    const elegido = resoluciones[clave]
    const celda = elegido ? { ...fila[campo], canonico: elegido, estado: 'homogenizado' as const } : fila[campo]

    if (!celda.crudo) return <td key={campo} className={styles.vacio}>—</td>

    if (celda.estado === 'sin_match') {
      return (
        <td key={campo} className={styles.error} onClick={() => abrirModal(fila, campo)} title="Clic para resolver">
          {celda.crudo}
          <span className={`${styles.tag} ${styles.tagRojo ?? ''}`}>sin match</span>
        </td>
      )
    }

    const textoMostrar = celda.canonico && celda.canonico !== celda.crudo ? celda.canonico : celda.crudo
    const esHomo = celda.estado === 'homogenizado'
    return (
      <td key={campo} className={esHomo ? styles.homo : styles.ok}>
        {textoMostrar}
        {esHomo && <span className={`${styles.tag} ${styles.tagHomo}`}>≈</span>}
      </td>
    )
  }

  return (
    <div>
      {/* Zona de drop */}
      <div
        className={`${styles.zona} ${arrastrando ? styles.zonaActiva : ''}`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setArrastrando(true) }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={onDrop}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
        aria-label="Zona para subir Excel"
      >
        <strong>Arrastra el Excel aquí o haz clic para seleccionarlo</strong>
        <p>Se validan Sold To, Ship To, Especie y Variedad contra los catálogos antes de subir.</p>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls"
          hidden
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void procesarArchivo(f) }}
        />
      </div>

      {cargando && <p>Validando…</p>}
      {error && <p style={{ color: '#c62828' }}>{error}</p>}
      {exito && <p style={{ color: '#2e7d32', fontWeight: 600 }}>{exito}</p>}

      {filasConEstado.length > 0 && (
        <>
          <div className={styles.resumen}>
            <span className={`${styles.resumenChip} ${styles.chipGris}`}>
              {filasConEstado.length} filas
            </span>
            <span className={`${styles.resumenChip} ${styles.chipVerde}`}>
              ✓ {totalOk} válidas
            </span>
            {totalError > 0 && (
              <span className={`${styles.resumenChip} ${styles.chipRojo}`}>
                ✗ {totalError} con errores
              </span>
            )}
            <div className={styles.resumenAcciones}>
              {totalError > 0 && (
                <p style={{ margin: 0, color: '#826200', fontSize: 13 }}>
                  Haz clic en las celdas rojas para resolverlas.
                </p>
              )}
              <Button
                disabled={!todasValidas || confirmando}
                onClick={() => void enviarABase()}
              >
                {confirmando ? 'Enviando…' : 'Enviar a auditoría'}
              </Button>
            </div>
          </div>

          <div className={styles.tablaWrap}>
            <table className={styles.tabla}>
              <thead>
                <tr>
                  <th className={styles.nFila}>#</th>
                  <th>N° Informe</th>
                  <th>Sold To</th>
                  <th>Ship To</th>
                  <th>Especie</th>
                  <th>Variedad</th>
                </tr>
              </thead>
              <tbody>
                {filasConEstado.map((fila) => (
                  <tr key={fila.n}>
                    <td className={styles.nFila}>{fila.n}</td>
                    <td>{fila.nro_informe ?? '—'}</td>
                    {(['sold_to', 'ship_to', 'especie', 'variedad'] as CampoKey[]).map(
                      (campo) => renderCelda(fila, campo)
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Modal de resolución */}
      {modal && (
        <div className={styles.overlay} onClick={() => setModal(null)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h3>Resolver {ETIQUETA[modal.campo]}</h3>
            <p>Valor en el Excel: <strong>{modal.celda.crudo}</strong></p>

            {modal.celda.sugerencias.length > 0 && (
              <>
                <p style={{ marginBottom: 8 }}>Sugerencias del catálogo:</p>
                <div className={styles.sugerencias}>
                  {modal.celda.sugerencias.map((s) => (
                    <button
                      key={s.valor}
                      className={styles.sugerenciaBtn}
                      onClick={() => elegirSugerencia(s.valor)}
                      type="button"
                    >
                      <span>{s.valor}</span>
                      <span className={styles.confianza}>{Math.round(s.confianza * 100)}%</span>
                    </button>
                  ))}
                </div>
              </>
            )}

            <label style={{ display: 'grid', gap: 5, marginBottom: 8, fontSize: 13, color: '#526057' }}>
              O escribe el valor oficial exacto:
              <input
                style={{ padding: '8px 10px', border: '1px solid #cbd3cd', borderRadius: 5, font: 'inherit' }}
                value={inputModal}
                onChange={(e) => setInputModal(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && confirmarManual()}
                placeholder="Nombre exacto del catálogo…"
                autoFocus
              />
            </label>

            <div className={styles.modalAcciones}>
              <Button variant="secondary" onClick={() => setModal(null)}>Cancelar</Button>
              <Button disabled={!inputModal.trim()} onClick={confirmarManual}>Usar este valor</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
