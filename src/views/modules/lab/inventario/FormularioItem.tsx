import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { CATEGORIAS_INVENTARIO } from '@/features/inventarioLab'
import type { CategoriaInventario, ItemEditable, ItemInventario } from '@/features/inventarioLab'
import styles from './Inventario.module.css'

interface Props {
  /** Producto a corregir; sin él, es uno nuevo. */
  item?: ItemInventario
  /** Valores de partida de un producto nuevo (el código escaneado, o los datos de otro con el mismo código). */
  inicial?: Partial<ItemEditable>
  guardando: boolean
  error: string | null
  onGuardar: (datos: ItemEditable) => void
  onCerrar: () => void
}

const texto = (v: string | null | undefined) => v ?? ''

/** Alta o corrección de un producto. El stock solo se escribe al crear; después se mueve con + / −. */
export function FormularioItem({ item, inicial, guardando, error, onGuardar, onCerrar }: Props) {
  const base = item ?? inicial ?? {}
  const [codigo, setCodigo] = useState(texto(base.codigo))
  const [categoria, setCategoria] = useState<CategoriaInventario>(base.categoria ?? 'Insumo')
  const [descripcion, setDescripcion] = useState(texto(base.descripcion))
  const [detalle, setDetalle] = useState(texto(base.detalle))
  const [ubicacion, setUbicacion] = useState(texto(base.ubicacion))
  const [almacenamiento, setAlmacenamiento] = useState(texto(base.almacenamiento))
  const [presentacion, setPresentacion] = useState(texto(base.presentacion))
  const [lote, setLote] = useState(texto(base.lote))
  const [vencimiento, setVencimiento] = useState(texto(base.vencimiento))
  const [referencia, setReferencia] = useState(texto(base.referencia))
  const [stock, setStock] = useState(item ? String(item.stock) : '1')
  const stockNum = parseFloat(stock.replace(',', '.'))
  const listo = codigo.trim() !== '' && descripcion.trim() !== '' && (item !== undefined || (Number.isFinite(stockNum) && stockNum >= 0))

  function enviar(e: React.FormEvent) {
    e.preventDefault()
    if (!listo || guardando) return
    onGuardar({
      codigo, categoria, descripcion, detalle: detalle || null, ubicacion: ubicacion || null,
      almacenamiento: almacenamiento || null, presentacion: presentacion || null, lote: lote || null,
      vencimiento: vencimiento || null, referencia: referencia || null, stock: item ? item.stock : stockNum,
    })
  }

  return (
    <Modal
      titulo={item ? `Corregir ${item.codigo}` : 'Producto nuevo'}
      subtitulo={item ? 'El stock no se cambia acá: usa + y − en la tarjeta.' : 'Completa lo que tenga la etiqueta; lo que no, déjalo vacío.'}
      onCerrar={onCerrar}
      ancho="medio"
    >
      <form className={styles.formulario} onSubmit={enviar}>
        <label>Código<input value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="INS-57" required /></label>
        <label>Tipo
          <select value={categoria} onChange={(e) => setCategoria(e.target.value as CategoriaInventario)}>
            {CATEGORIAS_INVENTARIO.map((c) => <option key={c}>{c}</option>)}
          </select>
        </label>
        <label className={styles.ancho}>Qué es<input data-foco value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Azoxystrobin CAS:131860-33-8" required /></label>
        <label className={styles.ancho}>Detalle (opcional)<input value={detalle} onChange={(e) => setDetalle(e.target.value)} /></label>
        <label>Ubicación<input value={ubicacion} onChange={(e) => setUbicacion(e.target.value)} placeholder="Congelador, Refrigerador, Laboratorio…" list="ubicaciones-lab" /></label>
        <datalist id="ubicaciones-lab"><option value="Congelador" /><option value="Refrigerador" /><option value="Laboratorio" /></datalist>
        <label>Almacenamiento<input value={almacenamiento} onChange={(e) => setAlmacenamiento(e.target.value)} placeholder="2-8°C" /></label>
        <label>Formato<input value={presentacion} onChange={(e) => setPresentacion(e.target.value)} placeholder="100mg, 3x10ml…" /></label>
        <label>Lote<input value={lote} onChange={(e) => setLote(e.target.value)} /></label>
        <label>Vencimiento<input type="date" value={vencimiento} onChange={(e) => setVencimiento(e.target.value)} /></label>
        <label>Ref. del proveedor<input value={referencia} onChange={(e) => setReferencia(e.target.value)} /></label>
        {!item && <label>Cantidad que entra<input inputMode="decimal" value={stock} onChange={(e) => setStock(e.target.value)} /></label>}
        {error && <p className={styles.error} role="alert">{error}</p>}
        <div className={styles.pie}>
          <Button type="button" variant="ghost" onClick={onCerrar}>Cancelar</Button>
          <Button type="submit" disabled={!listo || guardando}>{guardando ? 'Guardando…' : item ? 'Guardar cambios' : 'Crear producto'}</Button>
        </div>
      </form>
    </Modal>
  )
}
