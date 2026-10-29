import { useCallback, useEffect, useMemo, useState } from 'react'
import { BuscableSelect } from '@/components/ui/BuscableSelect'
import { Button } from '@/components/ui/Button'
import { listarClientes, listarPlantas } from '@/features/catalogo'
import type { Cliente, Planta } from '@/features/catalogo'
import {
  activosConConsumo,
  archivoABase64,
  eliminarCostoKilo,
  fmt,
  guardarCostoKilo,
  listarCostoKilo,
  nombreDeActivo,
  previsualizarCostoKilo,
} from '@/features/costoKilo'
import type { PrevisualizacionCostoKilo, ResumenCostoKilo } from '@/features/costoKilo'
import { fechaDeCarpeta } from '@/features/postventa'
import { HttpError } from '@/services/http/client'
import styles from './SubirCostoKilo.module.css'

const mensaje = (e: unknown, alterno: string) => (e instanceof HttpError ? (e.message && e.status === 422 ? e.message : `El servidor respondió con un error (${e.status}).`) : alterno)

/**
 * Trace → Costo por kilo: se sube a mano el CSV original del C&M-500 (tal cual lo manda el equipo, sin tabularlo). El
 * servidor calcula el valor diario, genera el informe PDF y, al guardar, aparece solo en Reportes Accutab → «Costo por
 * kilo». Es solo del personal de AgroFresh: un cliente nunca llega a Trace.
 */
export function SubirCostoKilo() {
  const [archivo, setArchivo] = useState<File | null>(null)
  const [previa, setPrevia] = useState<PrevisualizacionCostoKilo | null>(null)
  const [cliente, setCliente] = useState('')
  const [planta, setPlanta] = useState('')
  const [linea, setLinea] = useState('')
  const [equipo, setEquipo] = useState('C&M-500')
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [plantas, setPlantas] = useState<Planta[]>([])
  const [guardados, setGuardados] = useState<ResumenCostoKilo[]>([])

  const recargar = useCallback(async () => {
    try {
      setGuardados(await listarCostoKilo('equipo'))
    } catch {
      /* la lista es un extra: sin ella igual se puede subir */
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void recargar()
    void Promise.all([listarClientes(), listarPlantas()])
      .then(([c, p]) => {
        setClientes(c.filter((x) => x.activo))
        setPlantas(p.filter((x) => x.activo))
      })
      .catch(() => setError('No pudimos leer los clientes de Listados. Revisa la conexión.'))
  }, [recargar])

  const opcionesCliente = useMemo(() => clientes.map((c) => c.nombre).sort((a, b) => a.localeCompare(b, 'es')), [clientes])
  const opcionesPlanta = useMemo(
    () => plantas.filter((p) => p.cliente_nombre === cliente).map((p) => p.nombre).sort((a, b) => a.localeCompare(b, 'es')),
    [plantas, cliente],
  )

  async function elegirArchivo(f: File | null) {
    setArchivo(f)
    setPrevia(null)
    setError(null)
    setOk(null)
    if (!f) return
    setOcupado(true)
    try {
      setPrevia(await previsualizarCostoKilo(f.name, await archivoABase64(f)))
    } catch (e) {
      setError(mensaje(e, 'No se pudo leer el archivo.'))
    } finally {
      setOcupado(false)
    }
  }

  async function guardar() {
    if (!archivo || !previa) return
    setOcupado(true)
    setError(null)
    try {
      const r = await guardarCostoKilo({
        nombre: archivo.name,
        contenido_b64: await archivoABase64(archivo),
        cliente,
        planta: planta || null,
        linea: linea || null,
        equipo: equipo || null,
      })
      setOk(`Informe guardado (${fechaDeCarpeta(r.carpeta)}). Ya aparece en Reportes Accutab → Costo por kilo.`)
      setArchivo(null)
      setPrevia(null)
      await recargar()
    } catch (e) {
      setError(mensaje(e, 'No se pudo guardar el informe.'))
    } finally {
      setOcupado(false)
    }
  }

  async function quitar(carpeta: string) {
    if (!window.confirm('¿Eliminar este informe de costo por kilo? Dejará de verlo también el cliente.')) return
    try {
      await eliminarCostoKilo(carpeta)
      await recargar()
    } catch (e) {
      setError(mensaje(e, 'No se pudo eliminar el informe.'))
    }
  }

  const activos = previa ? activosConConsumo({ codigos: previa.resumen.codigos, resumen: previa.resumen }) : []

  return (
    <div className={styles.wrap}>
      <div>
        <h2 className={styles.titulo}>Costo por kilo · equipo C&M-500</h2>
        <p className={styles.ayuda}>
          Sube el CSV original tal como lo entrega el equipo (no hace falta tabularlo). El sistema calcula cuánto producto se usó cada día, arma el informe y lo deja
          en Reportes Accutab. Los correos que lleguen al buzón del sistema se procesarán igual cuando esté definida la matriz de asuntos.
        </p>
      </div>

      <div className={styles.zona}>
        <input type="file" accept=".csv,text/csv" aria-label="Archivo CSV del C&M-500" onChange={(e) => void elegirArchivo(e.target.files?.[0] ?? null)} disabled={ocupado} />
      </div>

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      {ok && (
        <p className={styles.ok} role="status">
          {ok}
        </p>
      )}

      {previa && (
        <>
          <ul className={styles.cifras} aria-label="Lo que se leyó">
            <li>
              <span>Período</span>
              <b>{previa.semanas ?? '—'}</b>
            </li>
            <li>
              <span>Días</span>
              <b>{previa.resumen.dias.length}</b>
            </li>
            <li>
              <span>Lecturas</span>
              <b>{previa.resumen.lecturas.toLocaleString('es-CL')}</b>
            </li>
            <li>
              <span>Fruta</span>
              <b>{fmt(previa.resumen.totales.kg, 0)} kg</b>
            </li>
            {activos.map((c) => (
              <li key={c}>
                <span>{nombreDeActivo(c, previa.nombres)}</span>
                <b>{fmt(previa.resumen.totales.activos[c], 1)} L</b>
              </li>
            ))}
          </ul>

          <div className={styles.campos}>
            <BuscableSelect etiqueta="Sold To" opciones={opcionesCliente} valor={cliente} onChange={(v) => { setCliente(v); setPlanta('') }} placeholderTodos="Elige un cliente" requerido />
            <BuscableSelect etiqueta="Ship To" opciones={opcionesPlanta} valor={planta} onChange={setPlanta} placeholderTodos={cliente ? 'Elige una planta' : 'Primero el Sold To'} disabled={!cliente} />
            <label className={styles.campo}>
              Línea
              <input value={linea} onChange={(e) => setLinea(e.target.value)} placeholder="Ej. Línea 2" />
            </label>
            <label className={styles.campo}>
              Equipo
              <input value={equipo} onChange={(e) => setEquipo(e.target.value)} />
            </label>
          </div>

          <div className={styles.acciones}>
            <Button onClick={() => void guardar()} disabled={ocupado || !cliente}>
              {ocupado ? 'Guardando…' : 'Guardar en el servidor'}
            </Button>
          </div>
        </>
      )}

      {guardados.length > 0 && (
        <div>
          <h3 className={styles.titulo}>Informes guardados</h3>
          <ul className={styles.lista}>
            {guardados.slice(0, 20).map((g) => (
              <li key={g.carpeta} className={styles.fila}>
                <span>
                  <b>{[g.cliente, g.planta, g.linea].filter(Boolean).join(' · ')}</b> <small>{g.semanas ?? ''} · {g.origen === 'email' ? 'correo' : 'subido a mano'} · {fechaDeCarpeta(g.carpeta)}</small>
                </span>
                <button type="button" className={styles.quitar} onClick={() => void quitar(g.carpeta)}>
                  Eliminar
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
