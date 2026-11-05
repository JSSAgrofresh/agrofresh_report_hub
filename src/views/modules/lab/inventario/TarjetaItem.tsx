import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { etiquetaVencimiento, formatearFecha, formatearStock } from '@/features/inventarioLab'
import type { ItemInventario, TipoMovimiento } from '@/features/inventarioLab'
import styles from './Inventario.module.css'

interface Props {
  item: ItemInventario
  /** Mueve el stock; lanza si el servidor lo rechaza (p. ej. sacar más de lo que hay). */
  onMover: (item: ItemInventario, tipo: TipoMovimiento, cantidad: number, nota: string) => Promise<void>
  onEditar: (item: ItemInventario) => void
  onOtroConEsteCodigo?: (item: ItemInventario) => void
}

/** Una tarjeta = un frasco / caja / lote. «−» saca y «+» agrega; ambos piden la cantidad (1 por defecto). */
export function TarjetaItem({ item, onMover, onEditar, onOtroConEsteCodigo }: Props) {
  const [accion, setAccion] = useState<'ingreso' | 'salida' | null>(null)
  const [cantidad, setCantidad] = useState('1')
  const [nota, setNota] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const n = parseFloat(cantidad.replace(',', '.'))
  const valida = Number.isFinite(n) && n > 0

  function abrir(tipo: 'ingreso' | 'salida') {
    setAccion(tipo); setCantidad('1'); setNota(''); setError(null)
  }

  async function confirmar(e: React.FormEvent) {
    e.preventDefault()
    if (!accion || !valida || enviando) return
    setEnviando(true); setError(null)
    try {
      await onMover(item, accion, n, nota)
      setAccion(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <article className={`${styles.tarjeta} ${styles[`venc_${item.estado_vencimiento}`]}`} aria-label={`${item.codigo} ${item.descripcion}`}>
      <header className={styles.tarjetaCabecera}>
        <span className={styles.codigo}>{item.codigo}</span>
        <span className={styles.chip}>{item.categoria}</span>
        <button type="button" className={styles.enlace} onClick={() => onEditar(item)}>Corregir</button>
      </header>
      <h3 className={styles.nombre}>{item.descripcion}</h3>
      {item.detalle && <p className={styles.detalle}>{item.detalle}</p>}
      <dl className={styles.datos}>
        <div><dt>Ubicación</dt><dd>{item.ubicacion ?? '—'}</dd></div>
        <div><dt>Almacenamiento</dt><dd>{item.almacenamiento ?? '—'}</dd></div>
        <div><dt>Formato</dt><dd>{item.presentacion ?? '—'}</dd></div>
        <div><dt>Lote</dt><dd>{item.lote ?? '—'}</dd></div>
        <div><dt>Ref.</dt><dd>{item.referencia ?? '—'}</dd></div>
        <div>
          <dt>Vence</dt>
          <dd>{formatearFecha(item.vencimiento)} <span className={`${styles.estado} ${styles[`estado_${item.estado_vencimiento}`]}`}>{etiquetaVencimiento(item)}</span></dd>
        </div>
      </dl>

      <div className={styles.mando}>
        <button type="button" className={`${styles.paso} ${styles.menos}`} onClick={() => abrir('salida')} aria-label={`Sacar de ${item.codigo}`} disabled={item.stock <= 0}>−</button>
        <div className={styles.stock} aria-live="polite">
          <strong>{formatearStock(item.stock)}</strong>
          <span>en stock</span>
        </div>
        <button type="button" className={`${styles.paso} ${styles.mas}`} onClick={() => abrir('ingreso')} aria-label={`Agregar a ${item.codigo}`}>+</button>
      </div>

      {accion && (
        <form className={styles.movimiento} onSubmit={confirmar} onKeyDown={(e) => e.key === 'Escape' && setAccion(null)}>
          <label>
            {accion === 'salida' ? 'Cuántos salen' : 'Cuántos entran'}
            <input data-foco autoFocus inputMode="decimal" value={cantidad} onChange={(e) => setCantidad(e.target.value)} onFocus={(e) => e.target.select()} />
          </label>
          <label>Nota (opcional)<input value={nota} onChange={(e) => setNota(e.target.value)} placeholder={accion === 'salida' ? 'Para qué se usó' : 'Factura, proveedor…'} /></label>
          {error && <p className={styles.error} role="alert">{error}</p>}
          <div className={styles.pie}>
            <Button type="button" variant="ghost" onClick={() => setAccion(null)}>Cancelar</Button>
            <Button type="submit" disabled={!valida || enviando}>{enviando ? '…' : accion === 'salida' ? 'Registrar salida' : 'Registrar ingreso'}</Button>
          </div>
        </form>
      )}
      {onOtroConEsteCodigo && (
        <button type="button" className={styles.enlace} onClick={() => onOtroConEsteCodigo(item)}>Llegó otro con este mismo código</button>
      )}
    </article>
  )
}
