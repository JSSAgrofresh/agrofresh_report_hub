import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  borrarFortificado,
  corregirFortificado,
  crearFortificado,
  listarFortificados,
} from '@/features/emitir'
import type { Fortificado } from '@/features/emitir'
import { HttpError } from '@/services/http/client'
import { EliminarConClave } from '@/components/ui/EliminarConClave'
import { Escaner } from './Escaner'
import styles from './TablaSolicitudes.module.css'


function formatearFecha(iso: string): string {
  const [anio, mes, dia] = iso.split('-')
  return dia ? `${dia}-${mes}-${anio}` : iso
}

/** El peso se digita tal cual lo marca la balanza: acepta coma o punto. */
function leerPeso(texto: string): number | null {
  const n = parseFloat(texto.replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? n : null
}

function mensaje(e: unknown, defecto: string): string {
  return e instanceof HttpError && e.message ? e.message : defecto
}


/** Una fila ya guardada: se puede corregir su N° o su peso (la fecha y la hora
 * de ingreso no cambian). */
function FilaFortificado({
  fortificado, puedeBorrar, onCambio,
}: { fortificado: Fortificado; puedeBorrar: boolean; onCambio: () => void | Promise<void> }) {
  const [numero, setNumero] = useState(fortificado.numero)
  const [peso, setPeso] = useState(String(fortificado.peso_extraido))
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pesoNum = leerPeso(peso)
  const cambio = numero.trim() !== '' && pesoNum !== null
    && (numero.trim() !== fortificado.numero || pesoNum !== fortificado.peso_extraido)

  async function guardar() {
    if (!cambio || pesoNum === null) return
    setGuardando(true)
    setError(null)
    try {
      await corregirFortificado(fortificado.id, numero, pesoNum)
      await onCambio()
    } catch (e) {
      setError(mensaje(e, 'No se pudo guardar.'))
    } finally {
      setGuardando(false)
    }
  }

  return (
    <tr className={styles.listaCompleta}>
      <td>
        <input
          className={styles.inputNumero}
          aria-label={`N° de fortificado ${fortificado.numero}`}
          value={numero}
          disabled={guardando}
          onChange={(e) => setNumero(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void guardar()}
        />
      </td>
      <td>
        <div className={styles.pesoExtraido}>
          <input
            type="number"
            inputMode="decimal"
            step="0.0001"
            min="0"
            className={styles.inputPeso}
            aria-label={`Peso extraído del fortificado ${fortificado.numero} en gramos`}
            value={peso}
            disabled={guardando}
            onChange={(e) => setPeso(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void guardar()}
          />
          <span className={styles.unidad}>g</span>
          <button
            type="button"
            className={cambio ? styles.tiketPendiente : styles.tiket}
            onClick={() => void guardar()}
            disabled={!cambio || guardando}
            title={cambio ? 'Guardar el cambio' : 'Guardado'}
            aria-label={`Guardar fortificado ${fortificado.numero}`}
          >
            {guardando ? '…' : '✓'}
          </button>
          {error && <span className={styles.errorPeso} role="alert">{error}</span>}
        </div>
      </td>
      <td className={styles.mono}>{formatearFecha(fortificado.fecha_ingreso)}</td>
      <td className={styles.mono}>{fortificado.hora_ingreso}</td>
      <td className={styles.acciones}>
        {puedeBorrar && (
          <EliminarConClave
            etiqueta="Borrar"
            titulo={`Borrar el fortificado ${fortificado.numero}`}
            descripcion="Se saca del listado y de la descarga. No se puede deshacer."
            onConfirmar={async () => { await borrarFortificado(fortificado.id); await onCambio() }}
          />
        )}
      </td>
    </tr>
  )
}


/**
 * Ingreso de fortificados: N° de fortificado y peso extraído. La fecha y la hora
 * de ingreso las pone el servidor al guardar. Más abajo, lo ya ingresado.
 */
export function TablaFortificados({
  buscar, puedeBorrar,
}: { buscar: string; puedeBorrar: boolean }) {
  const [lista, setLista] = useState<Fortificado[] | null>(null)
  const [errorCarga, setErrorCarga] = useState<string | null>(null)
  const [numero, setNumero] = useState('')
  const [peso, setPeso] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [errorNuevo, setErrorNuevo] = useState<string | null>(null)
  const [reinicio, setReinicio] = useState(0)
  const campoPeso = useRef<HTMLInputElement>(null)

  const cargar = useCallback(async () => {
    try {
      setLista(await listarFortificados())
      setErrorCarga(null)
    } catch (e) {
      setLista((prev) => prev ?? [])
      setErrorCarga(mensaje(e, 'No se pudo cargar el listado de fortificados.'))
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void cargar()
  }, [cargar])

  const pesoNum = leerPeso(peso)
  const puedeIngresar = numero.trim() !== '' && pesoNum !== null && !guardando

  async function ingresar() {
    if (!puedeIngresar || pesoNum === null) return
    setGuardando(true)
    setErrorNuevo(null)
    try {
      await crearFortificado(numero, pesoNum)
      setNumero('')
      setPeso('')
      setReinicio((r) => r + 1)
      await cargar()
    } catch (e) {
      setErrorNuevo(mensaje(e, 'No se pudo guardar el fortificado.'))
    } finally {
      setGuardando(false)
    }
  }

  const visibles = useMemo(() => {
    const q = buscar.trim().toLowerCase()
    return (lista ?? []).filter((f) => !q || f.numero.toLowerCase().includes(q))
  }, [lista, buscar])

  return (
    <>
      <div className={styles.nuevoFortificado}>
        {/* El N° se puede escanear (lector o cámara) o escribir, como el N° de muestra. */}
        <div className={styles.escanerNumero}>
          <Escaner
            buscar={(t) => (t.trim() ? { codigo: t.trim() } : null)}
            onEncontrado={(f) => { setNumero(f.codigo); campoPeso.current?.focus() }}
            onTexto={setNumero}
            onLimpiar={() => setNumero('')}
            placeholder="N° de fortificado nuevo"
            mensajeNoEncontrado={() => ''}
            resuelto={numero.trim() !== ''}
            deshabilitado={guardando}
            reinicio={reinicio}
            tomarFocoAlReiniciar
            esperaFinEscaneoMs={80}
            tituloCamara="Escanear N° de fortificado"
          />
        </div>
        <input
          type="number"
          inputMode="decimal"
          step="0.0001"
          min="0"
          placeholder="Peso extraído, ej. 10.0086"
          aria-label="Peso extraído del fortificado nuevo en gramos"
          className={styles.inputPesoAncho}
          ref={campoPeso}
          value={peso}
          disabled={guardando}
          onChange={(e) => setPeso(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void ingresar() } }}
        />
        <span className={styles.unidad}>g</span>
        <button
          type="button"
          className={styles.botonVerde}
          disabled={!puedeIngresar}
          onClick={() => void ingresar()}
        >
          {guardando ? 'Guardando…' : 'Ingresar fortificado'}
        </button>
        {errorNuevo && <span className={styles.errorPeso} role="alert">{errorNuevo}</span>}
      </div>

      {errorCarga && <p className={styles.errorPeso} role="alert">{errorCarga}</p>}

      <div className={styles.tablaCaja}>
        <table className={styles.tabla}>
          <thead>
            <tr>
              <th>N° Fortificado</th>
              <th>Peso extraído</th>
              <th>Fecha ingreso</th>
              <th>Hora ingreso</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {visibles.map((f) => (
              <FilaFortificado
                key={`${f.id}|${f.numero}|${f.peso_extraido}`}
                fortificado={f}
                puedeBorrar={puedeBorrar}
                onCambio={cargar}
              />
            ))}
            {visibles.length === 0 && (
              <tr>
                <td colSpan={5} className={styles.vacio}>
                  {lista === null
                    ? 'Cargando…'
                    : buscar
                      ? `Sin resultados para “${buscar}”.`
                      : 'Todavía no hay fortificados ingresados.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}
