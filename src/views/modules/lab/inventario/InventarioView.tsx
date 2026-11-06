import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Indicador } from '@/components/ui/Indicador'
import { AuditoriaHero } from '@/views/modules/auditoria-interna/AuditoriaHero'
import { EscanerCamara } from '../EscanerCamara'
import {
  CATEGORIAS_INVENTARIO, DIAS_POR_VENCER, STOCK_BAJO, buscarPorCodigo, corregirItem, crearItem, cumpleFiltro, etiquetaVencimiento,
  formatearFecha, formatearStock, listarInventario, listarMovimientos, moverStock, ordenar, requierenAtencion, resumir, siguienteCodigo,
} from '@/features/inventarioLab'
import type { Columna, Filtro, ItemEditable, ItemInventario, MovimientoInventario, TipoMovimiento } from '@/features/inventarioLab'
import { HttpError } from '@/services/http/client'
import { EtiquetaCodigo } from './EtiquetaCodigo'
import { FormularioItem } from './FormularioItem'
import { GraficosInventario } from './GraficosInventario'
import { TarjetaItem } from './TarjetaItem'
import styles from './Inventario.module.css'

type Pestana = 'inventario' | 'movimientos'
interface Pistoleo { id: number; hora: string; codigo: string; descripcion: string; estado: ItemInventario['estado_vencimiento'] | 'nada'; n: number }

const quitarTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const mensaje = (e: unknown, defecto: string) => (e instanceof HttpError && e.message ? e.message : defecto)
const hoyChile = () => new Date().toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-')
const ORDEN_GRAVEDAD = ['vencido', 'por_vencer', 'vigente', 'sin_fecha'] as const
const TEXTO_ESTADO = { vencido: 'Vencido', por_vencer: 'Por vencer', vigente: 'Vigente', sin_fecha: 'Sin fecha', nada: 'No está' } as const

const COLUMNAS: { col: Columna; titulo: string; num?: boolean }[] = [
  { col: 'codigo', titulo: 'Código' }, { col: 'descripcion', titulo: 'Descripción' }, { col: 'categoria', titulo: 'Tipo' },
  { col: 'ubicacion', titulo: 'Ubicación' }, { col: 'lote', titulo: 'Lote' }, { col: 'vencimiento', titulo: 'Vence' }, { col: 'stock', titulo: 'Stock', num: true },
]

export function InventarioView() {
  const [items, setItems] = useState<ItemInventario[]>([])
  const [movs, setMovs] = useState<MovimientoInventario[]>([])
  const [cargando, setCargando] = useState(true)
  const [errorCarga, setErrorCarga] = useState<string | null>(null)
  const [codigoLeido, setCodigoLeido] = useState('')
  const [resultado, setResultado] = useState<{ codigo: string; items: ItemInventario[] } | null>(null)
  const [disparo, setDisparo] = useState(0)
  const [pistoleos, setPistoleos] = useState<Pistoleo[]>([])
  const [camara, setCamara] = useState(false)
  const [formulario, setFormulario] = useState<{ item?: ItemInventario; inicial?: Partial<ItemEditable> } | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [errorForm, setErrorForm] = useState<string | null>(null)
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const [categoria, setCategoria] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [orden, setOrden] = useState<{ col: Columna; asc: boolean }>({ col: 'codigo', asc: true })
  const [pestana, setPestana] = useState<Pestana>('inventario')
  const entrada = useRef<HTMLInputElement>(null)
  const baseRef = useRef<HTMLElement>(null)

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

  const resumen = useMemo(() => resumir(items), [items])
  const atencion = useMemo(() => requierenAtencion(items), [items])

  const visibles = useMemo(() => {
    const q = quitarTildes(busqueda.trim())
    const filtradas = items.filter((i) =>
      cumpleFiltro(i, filtro) && (!categoria || i.categoria === categoria) &&
      (!q || quitarTildes([i.codigo, i.descripcion, i.detalle, i.lote, i.referencia, i.ubicacion].join(' ')).includes(q)))
    return ordenar(filtradas, orden.col, orden.asc)
  }, [items, filtro, categoria, busqueda, orden])

  function ordenarPor(col: Columna) {
    setOrden((o) => (o.col === col ? { col, asc: !o.asc } : { col, asc: true }))
  }

  /** Lo que se ve en el panel del pistoleo: el estado más grave entre los productos con ese código. */
  const ultimo = resultado
  const peor: Pistoleo['estado'] = ultimo?.items.length ? ORDEN_GRAVEDAD.find((e) => ultimo.items.some((i) => i.estado_vencimiento === e)) ?? 'sin_fecha' : 'nada'

  async function escanear(texto: string) {
    const codigo = texto.trim().toUpperCase()
    if (!codigo) return
    setCodigoLeido('')
    try {
      const encontrados = await buscarPorCodigo(codigo)
      setResultado({ codigo, items: encontrados })
      setDisparo((d) => d + 1)
      const estado: Pistoleo['estado'] = encontrados.length ? ORDEN_GRAVEDAD.find((e) => encontrados.some((i) => i.estado_vencimiento === e)) ?? 'sin_fecha' : 'nada'
      setPistoleos((l) => [{
        id: Date.now() + l.length, hora: new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        codigo, descripcion: encontrados[0]?.descripcion ?? 'Código no registrado', estado, n: encontrados.length,
      }, ...l].slice(0, 8))
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
      setDisparo((d) => d + 1)
    } catch (e) {
      setErrorForm(mensaje(e, 'No se pudo guardar.'))
    } finally {
      setGuardando(false)
    }
  }

  /** Abre las tarjetas de un código (desde una tabla o un gráfico) y sube al panel del pistoleo. */
  function verCodigo(codigo: string) {
    setResultado({ codigo, items: items.filter((x) => x.codigo.toUpperCase() === codigo.toUpperCase()) })
    setDisparo((d) => d + 1)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function irA(f: Filtro) {
    setFiltro(f); setPestana('inventario')
    baseRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const chips: { clave: Filtro; etiqueta: string }[] = [
    { clave: 'todos', etiqueta: 'Todos' }, { clave: 'por_vencer', etiqueta: 'Por vencer' },
    { clave: 'vencido', etiqueta: 'Vencidos' }, { clave: 'sin_stock', etiqueta: 'Sin stock' },
  ]

  return (
    <div className={styles.pagina}>
      <AuditoriaHero
        etiqueta="AgroFresh Lab · Estándares, reactivos e insumos"
        titulo="Inventario de laboratorio"
        descripcion={`Al ${hoyChile()} hay ${resumen.vencidos} registros vencidos, ${resumen.porVencer} que vencen en los próximos ${DIAS_POR_VENCER} días y ${resumen.stockBajo} insumos con stock bajo.`}
        acciones={<Button variant="secondary" onClick={() => void nuevo('')}>+ Producto nuevo</Button>}
      />

      <section className={styles.escanerFila} aria-label="Pistoleo de códigos">
        <div className={`${styles.panel} ${styles.escaner}`}>
          <h2>Pistoleo de códigos</h2>
          <p className={styles.grafNota}>Dispara la pistola sobre el campo o escribe un código y presiona Enter. Con + y − registras lo que entra y lo que sale.</p>
          <form className={styles.escanerForm} onSubmit={(e) => { e.preventDefault(); void escanear(codigoLeido) }}>
            <label htmlFor="inv-codigo">Código de barras</label>
            <input id="inv-codigo" ref={entrada} autoFocus className={styles.entradaCodigo} value={codigoLeido} onChange={(e) => setCodigoLeido(e.target.value)}
              placeholder="INS-00" aria-label="Código del producto" autoComplete="off" spellCheck={false} />
            <Button type="submit" disabled={!codigoLeido.trim()}>Buscar</Button>
            <Button type="button" variant="secondary" onClick={() => setCamara(true)}>Cámara</Button>
          </form>
          <div className={styles.vista}>
            <EtiquetaCodigo codigo={ultimo?.codigo ?? ''} disparo={disparo} />
            <div className={styles.vistaInfo}>
              <span className={`${styles.veredicto} ${styles[`ver_${peor}`]}`}>{ultimo ? TEXTO_ESTADO[peor] : 'Sin pistolear'}</span>
              <div className={styles.vistaNombre}>{ultimo ? (ultimo.items[0]?.descripcion ?? 'Código no registrado') : '—'}</div>
              <dl className={styles.datosCorridos}>
                <dt>Registros con este código</dt><dd>{ultimo ? ultimo.items.length : '—'}</dd>
                <dt>Stock total</dt><dd>{ultimo?.items.length ? formatearStock(ultimo.items.reduce((s, i) => s + i.stock, 0)) : '—'}</dd>
              </dl>
            </div>
          </div>
        </div>

        <div className={`${styles.panel} ${styles.ultimos}`}>
          <h2>Últimos pistoleos</h2>
          <p className={styles.grafNota}>Los más recientes arriba (de esta sesión).</p>
          {pistoleos.length === 0 ? <p className={styles.nota}>Aún no has pistoleado nada.</p> : (
            <ol className={styles.log}>
              {pistoleos.map((p) => (
                <li key={p.id}>
                  <span className={styles.logHora}>{p.hora}</span>
                  <button type="button" className={styles.logCodigo} onClick={() => verCodigo(p.codigo)}>{p.codigo}</button>
                  <span className={`${styles.logEstado} ${styles[`ver_${p.estado}`]}`}>{TEXTO_ESTADO[p.estado]}</span>
                  <span className={styles.logDesc}>{p.descripcion}{p.n > 1 ? ` · ${p.n} registros` : ''}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
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

      <section className={styles.kpis} aria-label="Resumen">
        <Indicador etiqueta="Registros" valor={String(resumen.registros)} sub="filas de la planilla" onClick={() => irA('todos')} activo={filtro === 'todos'} />
        <Indicador etiqueta="Códigos distintos" valor={String(resumen.codigos)} sub="algunos con varios lotes" />
        <Indicador etiqueta="Vencidos" valor={String(resumen.vencidos)} sub="con stock y fecha anterior a hoy" alerta={resumen.vencidos > 0} onClick={() => irA('vencido')} activo={filtro === 'vencido'} />
        <Indicador etiqueta="Por vencer" valor={String(resumen.porVencer)} sub={`dentro de ${DIAS_POR_VENCER} días`} alerta={resumen.porVencer > 0} onClick={() => irA('por_vencer')} activo={filtro === 'por_vencer'} />
        <Indicador etiqueta="Stock bajo" valor={String(resumen.stockBajo)} sub={`insumos con ${STOCK_BAJO} o menos`} alerta={resumen.stockBajo > 0} />
        <Indicador etiqueta="Sin stock" valor={String(resumen.sinStock)} sub="insumos en cero" onClick={() => irA('sin_stock')} activo={filtro === 'sin_stock'} />
      </section>

      {!cargando && <GraficosInventario items={items} onVer={verCodigo} />}

      <section className={styles.panel}>
        <h2>Requieren atención</h2>
        <p className={styles.grafNota}>Registros vencidos o que vencen pronto, del más urgente al menos urgente.</p>
        <div className={styles.tablaCaja}>
          <table className={styles.tabla}>
            <thead><tr><th>Código</th><th>Descripción</th><th>Lote</th><th>Vence</th><th>Estado</th><th className={styles.num}>Stock</th></tr></thead>
            <tbody>
              {atencion.map((i) => (
                <tr key={i.id} onClick={() => verCodigo(i.codigo)}>
                  <td><strong>{i.codigo}</strong></td><td>{i.descripcion}</td><td>{i.lote ?? '—'}</td><td>{formatearFecha(i.vencimiento)}</td>
                  <td><span className={`${styles.estado} ${styles[`estado_${i.estado_vencimiento}`]}`}>{etiquetaVencimiento(i)}</span></td>
                  <td className={styles.num}>{formatearStock(i.stock)}</td>
                </tr>
              ))}
              {atencion.length === 0 && <tr><td colSpan={6} className={styles.nota}>Nada vencido ni por vencer.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className={styles.panel} ref={baseRef}>
        <nav className={styles.pestanas} role="tablist">
          <button role="tab" aria-selected={pestana === 'inventario'} className={pestana === 'inventario' ? styles.pestanaActiva : ''} onClick={() => setPestana('inventario')}>Base de inventario</button>
          <button role="tab" aria-selected={pestana === 'movimientos'} className={pestana === 'movimientos' ? styles.pestanaActiva : ''} onClick={() => setPestana('movimientos')}>Movimientos</button>
        </nav>
        {cargando ? <p className={styles.nota}>Cargando…</p> : pestana === 'inventario' ? (
          <>
            <div className={styles.filtros}>
              <input type="search" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar por código, nombre, lote…" aria-label="Buscar en el inventario" />
              <select value={categoria} onChange={(e) => setCategoria(e.target.value)} aria-label="Tipo">
                <option value="">Todos los tipos</option>
                {CATEGORIAS_INVENTARIO.map((c) => <option key={c}>{c}</option>)}
              </select>
              <div className={styles.chips}>
                {chips.map((c) => <button key={c.clave} type="button" className={`${styles.chipFiltro} ${filtro === c.clave ? styles.chipOn : ''}`} aria-pressed={filtro === c.clave} onClick={() => setFiltro(c.clave)}>{c.etiqueta}</button>)}
              </div>
              <span className={styles.nota}>{visibles.length} de {items.length}</span>
            </div>
            <div className={styles.tablaCaja}>
              <table className={styles.tabla}>
                <thead>
                  <tr>
                    {COLUMNAS.map(({ col, titulo, num }) => (
                      <th key={col} className={num ? styles.num : ''} aria-sort={orden.col === col ? (orden.asc ? 'ascending' : 'descending') : 'none'}>
                        <button type="button" className={styles.thBtn} onClick={() => ordenarPor(col)}>{titulo}{orden.col === col ? (orden.asc ? ' ↑' : ' ↓') : ''}</button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibles.map((i) => (
                    <tr key={i.id} onClick={() => verCodigo(i.codigo)}>
                      <td><strong>{i.codigo}</strong></td><td>{i.descripcion}</td><td>{i.categoria}</td><td>{i.ubicacion ?? '—'}</td><td>{i.lote ?? '—'}</td>
                      <td>{formatearFecha(i.vencimiento)} {i.vencimiento && <span className={`${styles.estado} ${styles[`estado_${i.estado_vencimiento}`]}`}>{etiquetaVencimiento(i)}</span>}</td>
                      <td className={styles.num}>{formatearStock(i.stock)}</td>
                    </tr>
                  ))}
                  {visibles.length === 0 && <tr><td colSpan={7} className={styles.nota}>Nada con esos filtros.</td></tr>}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className={styles.tablaCaja}>
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
          </div>
        )}
      </section>

      {formulario && (
        <FormularioItem item={formulario.item} inicial={formulario.inicial} guardando={guardando} error={errorForm} onGuardar={(d) => void guardar(d)} onCerrar={() => setFormulario(null)} />
      )}
    </div>
  )
}
