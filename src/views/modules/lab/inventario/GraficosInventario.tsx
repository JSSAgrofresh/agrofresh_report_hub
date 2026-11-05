import { formatearStock, porAnio, porTipo, stockBajo, topStock, STOCK_BAJO, TOP_STOCK } from '@/features/inventarioLab'
import type { ItemInventario, Reparto } from '@/features/inventarioLab'
import styles from './Inventario.module.css'

/** Colores de la marca para el estado: verde = vigente, amarillo = por vencer, rojo = vencido. */
const COLOR = { vigente: '#6dad3c', porVencer: '#e8c32e', vencido: '#b0271f' } as const
const CLAVES = ['vigente', 'porVencer', 'vencido'] as const
const NOMBRE = { vigente: 'Vigente', porVencer: 'Por vencer', vencido: 'Vencido' } as const
const total = (r: Reparto) => r.vigente + r.porVencer + r.vencido

function Leyenda({ incluirSinFecha }: { incluirSinFecha?: boolean }) {
  return (
    <div className={styles.leyenda}>
      {CLAVES.map((k) => (
        <span key={k}><i style={{ background: COLOR[k] }} />{k === 'vigente' && incluirSinFecha ? 'Vigente o sin fecha' : NOMBRE[k]}</span>
      ))}
    </div>
  )
}

function Tarjeta({ titulo, nota, children }: { titulo: string; nota: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className={styles.grafTarjeta}>
      <h2>{titulo}</h2>
      <p className={styles.grafNota}>{nota}</p>
      {children}
    </section>
  )
}

/** Barras horizontales apiladas: una fila por tipo de material. */
function EstadoPorTipo({ items }: { items: ItemInventario[] }) {
  const datos = porTipo(items)
  const max = Math.max(1, ...datos.map((d) => total(d.reparto)))
  return (
    <div className={styles.barrasH}>
      {datos.map(({ tipo, reparto }) => (
        <div key={tipo} className={styles.filaBarra}>
          <span className={styles.filaEtiqueta}>{tipo}</span>
          <div className={styles.pista} role="img" aria-label={`${tipo}: ${CLAVES.map((k) => `${reparto[k]} ${NOMBRE[k].toLowerCase()}`).join(', ')}`}>
            {CLAVES.filter((k) => reparto[k] > 0).map((k) => (
              <span key={k} style={{ width: `${(reparto[k] / max) * 100}%`, background: COLOR[k] }} title={`${NOMBRE[k]}: ${reparto[k]}`} />
            ))}
          </div>
          <b className={styles.filaValor}>{total(reparto)}</b>
        </div>
      ))}
      {datos.length === 0 && <p className={styles.nota}>Sin datos.</p>}
    </div>
  )
}

/** Columnas apiladas: una por año de vencimiento. */
function VencimientosPorAnio({ items }: { items: ItemInventario[] }) {
  const datos = porAnio(items)
  const max = Math.max(1, ...datos.map((d) => total(d.reparto)))
  return (
    <div className={styles.columnas} role="list">
      {datos.map(({ anio, reparto }) => (
        <div key={anio} className={styles.columna} role="listitem" aria-label={`${anio}: ${total(reparto)} registros`}>
          <b>{total(reparto)}</b>
          <div className={styles.pilar}>
            <div style={{ height: `${(total(reparto) / max) * 100}%` }}>
              {[...CLAVES].reverse().filter((k) => reparto[k] > 0).map((k) => (
                <span key={k} style={{ flex: reparto[k], background: COLOR[k] }} title={`${NOMBRE[k]}: ${reparto[k]}`} />
              ))}
            </div>
          </div>
          <span>{anio}</span>
        </div>
      ))}
      {datos.length === 0 && <p className={styles.nota}>Sin fechas de vencimiento.</p>}
    </div>
  )
}

function MasStock({ items }: { items: ItemInventario[] }) {
  const datos = topStock(items)
  const max = Math.max(1, ...datos.map((d) => d.stock))
  return (
    <div className={styles.barrasH}>
      {datos.map((i) => (
        <div key={i.id} className={styles.filaBarra}>
          <span className={styles.filaEtiqueta} title={i.descripcion}><b>{i.codigo}</b> {i.descripcion}</span>
          <div className={styles.pista}><span style={{ width: `${(i.stock / max) * 100}%`, background: 'var(--color-primary)' }} /></div>
          <b className={styles.filaValor}>{formatearStock(i.stock)}</b>
        </div>
      ))}
      {datos.length === 0 && <p className={styles.nota}>Sin insumos con stock.</p>}
    </div>
  )
}

function TablaStockBajo({ items, onVer }: { items: ItemInventario[]; onVer: (codigo: string) => void }) {
  const datos = stockBajo(items)
  return (
    <div className={styles.tablaCaja}>
      <table className={styles.tabla}>
        <thead><tr><th>Código</th><th>Descripción</th><th className={styles.num}>Stock</th></tr></thead>
        <tbody>
          {datos.map((i) => (
            <tr key={i.id} onClick={() => onVer(i.codigo)}>
              <td><strong>{i.codigo}</strong></td><td>{i.descripcion}</td>
              <td className={`${styles.num} ${i.stock <= 0 ? styles.malo : styles.aviso}`}>{formatearStock(i.stock)}</td>
            </tr>
          ))}
          {datos.length === 0 && <tr><td colSpan={3} className={styles.nota}>Ningún insumo con stock bajo.</td></tr>}
        </tbody>
      </table>
    </div>
  )
}

/** Los cuatro gráficos de la maqueta: estado por tipo, vencimientos por año, más stock y stock bajo. */
export function GraficosInventario({ items, onVer }: { items: ItemInventario[]; onVer: (codigo: string) => void }) {
  return (
    <div className={styles.grafGrilla}>
      <Tarjeta titulo="Estado por tipo de material" nota="Registros con stock de cada tipo según su fecha de vencimiento. Los insumos no tienen fecha y cuentan como vigentes.">
        <Leyenda incluirSinFecha /><EstadoPorTipo items={items} />
      </Tarjeta>
      <Tarjeta titulo="Vencimientos por año" nota="Registros con fecha y stock, agrupados por el año en que vencen.">
        <Leyenda /><VencimientosPorAnio items={items} />
      </Tarjeta>
      <Tarjeta titulo="Insumos con más stock" nota={`Los ${TOP_STOCK} primeros por unidades registradas.`}>
        <MasStock items={items} />
      </Tarjeta>
      <Tarjeta titulo="Stock bajo" nota={`Insumos con ${STOCK_BAJO} unidades o menos. Conviene reponerlos.`}>
        <TablaStockBajo items={items} onVer={onVer} />
      </Tarjeta>
    </div>
  )
}
