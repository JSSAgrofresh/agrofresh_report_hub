import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Header } from '@/components/layout/Header'
import { Button } from '@/components/ui/Button'
import { EscanerCamara } from '../EscanerCamara'
import {
  buscarPorCodigo, corregirItem, crearItem, formatearFecha, formatearStock, etiquetaVencimiento,
  listarInventario, listarMovimientos, moverStock, siguienteCodigo, CATEGORIAS_INVENTARIO, cumpleFiltro,
} from '@/features/inventarioLab'
import type { Filtro, ItemEditable, ItemInventario, MovimientoInventario, TipoMovimiento } from '@/features/inventarioLab'
import { HttpError } from '@/services/http/client'
import { FormularioItem } from './FormularioItem'
import { TarjetaItem } from './TarjetaItem'
import styles from './Inventario.module.css'

type Pestana = 'inventario' | 'movimientos'

const quitarTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const mensaje = (e: unknown, defecto: string) => (e instanceof HttpError && e.message ? e.message : defecto)

export function InventarioView() {
  const [items, setItems] = useState<ItemInventario[]>([])
  const [movs, setMovs] = useState<MovimientoInventario[]>([])
  const [cargando, setCargando] = useState(true)
  const [errorCarga, setErrorCarga] = useState<string | null>(null)
  const [codigoLeido, setCodigoLeido] = useState('')
  const [resultado, setResultado] = useState<{ codigo: string; items: ItemInventario[] } | null>(null)
  const [camara, setCamara] = useState(false)
  const [formulario, setFormulario] = useState<{ item?: ItemInventario; inicial?: Partial<ItemEditable> } | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [errorForm, setErrorForm] = useState<string | null>(null)
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const [categoria, setCategoria] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [pestana, setPestana] = useState<Pestana>('inventario')
  const entrada = useRef<HTMLInputElement>(null)

  const recargar = useCallback(async () => {
    try {
      const [lista, historial] = await Promise.all([listarInventario(), listarMovimientos(100)])
      setItems(lista); setMovs(historial); setErrorCarga(null)
    } catch (e) {
      setErrorCarga(mensaje(e, 'No se pudo cargar el inventario.'))
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    // La primera carga: los setState van en el callback (no sincrónicos dentro del efecto).
    void Promise.all([listarInventario(), listarMovimientos(100)])
      .then(([lista, historial]) => { setItems(lista); setMovs(historial) })
      .catch((e) => setErrorCarga(mensaje(e, 'No se pudo cargar el inventario.')))
      .finally(() => setCargando(false))
  }, [])

  const conteo = useMemo(() => ({
    total: items.length,
    por_vencer: items.filter((i) => cumpleFiltro(i, 'por_vencer')).length,
    vencido: items.filter((i) => cumpleFiltro(i, 'vencido')).length,
    sin_stock: items.filter((i) => cumpleFiltro(i, 'sin_stock')).length,
  }), [items])

  const visibles = useMemo(() => {
    const q = quitarTildes(busqueda.trim())
    return items.filter((i) =>
      cumpleFiltro(i, filtro) && (!categoria || i.categoria === categoria) &&
      (!q || quitarTildes([i.codigo, i.descripcion, i.detalle, i.lote, i.referencia, i.ubicacion].join(' ')).includes(q)))
  }, [items, filtro, categoria, busqueda])

  async function escanear(texto: string) {
    const codigo = texto.trim().toUpperCase()
    if (!codigo) return
    setCodigoLeido('')
    try {
      setResultado({ codigo, items: await buscarPorCodigo(codigo) })
    } catch (e) {
      setErrorCarga(mensaje(e, 'No se pudo buscar el código.'))
    }
    entrada.current?.focus()
  }

  async function mover(item: ItemInventario, tipo: TipoMovimiento, cantidad: number, nota: string) {
    try {
      await moverStock(item.id, tipo, cantidad, nota)
    } catch (e) {
      throw new Error(mensaje(e, 'No se pudo registrar el movimiento.'), { cause: e })
    }
    // La tarjeta se vuelve a pedir al servidor: el stock que se ve es siempre el guardado.
    await recargar()
    if (resultado) setResultado({ codigo: resultado.codigo, items: await buscarPorCodigo(resultado.codigo) })
    entrada.current?.focus()
  }

  async function nuevo(codigo: string, partida?: ItemInventario) {
    setErrorForm(null)
    let c = codigo
    if (!c) { try { c = (await siguienteCodigo()).codigo } catch { c = '' } }
    setFormulario({
      inicial: partida
        ? { codigo: c, categoria: partida.categoria, descripcion: partida.descripcion, detalle: partida.detalle, ubicacion: partida.ubicacion,
            almacenamiento: partida.almacenamiento, presentacion: partida.presentacion, referencia: partida.referencia }
        : { codigo: c },
    })
  }

  async function guardar(datos: ItemEditable) {
    setGuardando(true); setErrorForm(null)
    try {
      const guardado = formulario?.item ? await corregirItem(formulario.item.id, datos) : await crearItem(datos)
      setFormulario(null)
      await recargar()
      setResultado({ codigo: guardado.codigo, items: await buscarPorCodigo(guardado.codigo) })
    } catch (e) {
      setErrorForm(mensaje(e, 'No se pudo guardar.'))
    } finally {
      setGuardando(false)
    }
  }

  const chips: { clave: Filtro; etiqueta: string; n: number; tono: string }[] = [
    { clave: 'todos', etiqueta: 'Productos', n: conteo.total, tono: 'neutro' },
    { clave: 'por_vencer', etiqueta: 'Por vencer (60 d)', n: conteo.por_vencer, tono: 'aviso' },
    { clave: 'vencido', etiqueta: 'Vencidos', n: conteo.vencido, tono: 'malo' },
    { clave: 'sin_stock', etiqueta: 'Sin stock', n: conteo.sin_stock, tono: 'gris' },
  ]

  return (
    <div className={styles.pagina}>
      <Header title="Inventario del laboratorio" description="Escanea el código de la etiqueta: aparece el producto y con + y − registras lo que entra y lo que sale." />

      <section className={styles.kpis} aria-label="Resumen">
        {chips.map((c) => (
          <button key={c.clave} type="button" className={`${styles.kpi} ${styles[`kpi_${c.tono}`]} ${filtro === c.clave ? styles.kpiActivo : ''}`}
            onClick={() => { setFiltro(c.clave); setPestana('inventario') }}>
            <strong>{c.n}</strong><span>{c.etiqueta}</span>
          </button>
        ))}
      </section>

      <section className={styles.escaner}>
        <form onSubmit={(e) => { e.preventDefault(); void escanear(codigoLeido) }}>
          <span aria-hidden="true" className={styles.barras}>▌▏▌▌▏▌</span>
          <input ref={entrada} autoFocus className={styles.entradaCodigo} value={codigoLeido} onChange={(e) => setCodigoLeido(e.target.value)}
            placeholder="Escanea o escribe el código (INS-01)…" aria-label="Código del producto" autoComplete="off" spellCheck={false} />
          <Button type="submit" disabled={!codigoLeido.trim()}>Buscar</Button>
          <Button type="button" variant="secondary" onClick={() => setCamara(true)}>Cámara</Button>
          <Button type="button" variant="secondary" onClick={() => void nuevo('')}>+ Producto nuevo</Button>
        </form>
      </section>
      {camara && <EscanerCamara titulo="Escanear código del producto" onLeido={(c) => { setCamara(false); void escanear(c) }} onCerrar={() => setCamara(false)} />}
      {errorCarga && <p className={styles.error} role="alert">{errorCarga}</p>}

      {resultado && (
        <section className={styles.resultado} aria-label={`Resultado de ${resultado.codigo}`}>
          <div className={styles.resultadoCabecera}>
            <h2>{resultado.codigo} <small>{resultado.items.length === 1 ? '1 producto' : `${resultado.items.length} productos`}</small></h2>
            <button type="button" className={styles.enlace} onClick={() => setResultado(null)}>Cerrar</button>
          </div>
          {resultado.items.length === 0 ? (
            <div className={styles.vacio}>
              <p>El código <strong>{resultado.codigo}</strong> no está en el inventario. ¿Es un producto nuevo?</p>
              <Button onClick={() => void nuevo(resultado.codigo)}>Crear {resultado.codigo}</Button>
            </div>
          ) : (
            <div className={styles.tarjetas}>
              {resultado.items.map((i) => (
                <TarjetaItem key={i.id} item={i} onMover={mover} onEditar={(it) => { setErrorForm(null); setFormulario({ item: it }) }}
                  onOtroConEsteCodigo={(it) => void nuevo(it.codigo, it)} />
              ))}
            </div>
          )}
        </section>
      )}

      <nav className={styles.pestanas} role="tablist">
        <button role="tab" aria-selected={pestana === 'inventario'} className={pestana === 'inventario' ? styles.pestanaActiva : ''} onClick={() => setPestana('inventario')}>Todo el inventario</button>
        <button role="tab" aria-selected={pestana === 'movimientos'} className={pestana === 'movimientos' ? styles.pestanaActiva : ''} onClick={() => setPestana('movimientos')}>Movimientos</button>
      </nav>

      {cargando ? <p className={styles.nota}>Cargando…</p> : pestana === 'inventario' ? (
        <section>
          <div className={styles.filtros}>
            <input type="search" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar por código, nombre, lote…" aria-label="Buscar en el inventario" />
            <select value={categoria} onChange={(e) => setCategoria(e.target.value)} aria-label="Tipo">
              <option value="">Todos los tipos</option>
              {CATEGORIAS_INVENTARIO.map((c) => <option key={c}>{c}</option>)}
            </select>
            <span className={styles.nota}>{visibles.length} de {items.length}</span>
          </div>
          <div className={styles.tablaCaja}>
            <table className={styles.tabla}>
              <thead><tr><th>Código</th><th>Producto</th><th>Tipo</th><th>Ubicación</th><th>Lote</th><th>Vence</th><th className={styles.num}>Stock</th></tr></thead>
              <tbody>
                {visibles.map((i) => (
                  <tr key={i.id} onClick={() => setResultado({ codigo: i.codigo, items: items.filter((x) => x.codigo.toUpperCase() === i.codigo.toUpperCase()) })}>
                    <td><strong>{i.codigo}</strong></td>
                    <td>{i.descripcion}</td>
                    <td>{i.categoria}</td>
                    <td>{i.ubicacion ?? '—'}</td>
                    <td>{i.lote ?? '—'}</td>
                    <td>{formatearFecha(i.vencimiento)} <span className={`${styles.estado} ${styles[`estado_${i.estado_vencimiento}`]}`}>{etiquetaVencimiento(i)}</span></td>
                    <td className={styles.num}>{formatearStock(i.stock)}</td>
                  </tr>
                ))}
                {visibles.length === 0 && <tr><td colSpan={7} className={styles.nota}>Nada con esos filtros.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <section className={styles.tablaCaja}>
          <table className={styles.tabla}>
            <thead><tr><th>Cuándo</th><th>Código</th><th>Producto</th><th>Movimiento</th><th className={styles.num}>Cantidad</th><th className={styles.num}>Stock</th><th>Quién</th><th>Nota</th></tr></thead>
            <tbody>
              {movs.map((m) => (
                <tr key={m.id}>
                  <td>{m.fecha}</td><td><strong>{m.codigo}</strong></td><td>{m.descripcion}{m.lote ? ` · lote ${m.lote}` : ''}</td>
                  <td><span className={`${styles.mov} ${styles[`mov_${m.tipo}`]}`}>{{ alta: 'Alta', ingreso: 'Ingreso', salida: 'Salida', ajuste: 'Ajuste' }[m.tipo]}</span></td>
                  <td className={styles.num}>{m.tipo === 'salida' ? '−' : m.tipo === 'ingreso' ? '+' : ''}{formatearStock(m.cantidad)}</td>
                  <td className={styles.num}>{formatearStock(m.stock_antes)} → {formatearStock(m.stock_despues)}</td>
                  <td>{m.usuario ?? '—'}</td><td>{m.nota ?? ''}</td>
                </tr>
              ))}
              {movs.length === 0 && <tr><td colSpan={8} className={styles.nota}>Aún no hay movimientos.</td></tr>}
            </tbody>
          </table>
        </section>
      )}

      {formulario && (
        <FormularioItem item={formulario.item} inicial={formulario.inicial} guardando={guardando} error={errorForm} onGuardar={(d) => void guardar(d)} onCerrar={() => setFormulario(null)} />
      )}
    </div>
  )
}
