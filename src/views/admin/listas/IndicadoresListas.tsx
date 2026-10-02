import { IconoAlerta } from '@/components/ui/iconosAccion'
import { ETIQUETA_FILTRO_TABLA } from '@/features/listasDistribucion'
import type { EstadoListas, FiltroTabla, Indicadores } from '@/features/listasDistribucion'
import styles from './IndicadoresListas.module.css'

const nf = new Intl.NumberFormat('es-CL')

interface Props {
  ind: Indicadores
  resumen: EstadoListas['resumen']
  filtro: FiltroTabla
  onFiltro: (f: FiltroTabla) => void
}

const ALERTAS: { filtro: Exclude<FiltroTabla, 'todas' | 'cambios'>; ayuda: string }[] = [
  { filtro: 'sin_tecnico', ayuda: 'Nadie en copia oculta que haga seguimiento técnico.' },
  { filtro: 'sin_comercial', ayuda: 'Nadie del área comercial en copia.' },
  { filtro: 'sin_cliente', ayuda: 'Los resultados llegan solo a Jorge, Claudia y el Report Hub: el cliente no recibe nada.' },
  { filtro: 'fuera_listados', ayuda: 'El nombre no existe en Listados: ninguna solicitud encontrará estos contactos.' },
  { filtro: 'copia_mal', ayuda: 'Un técnico o admin va en copia visible, o un comercial en copia oculta.' },
  { filtro: 'sin_lista_listados', ayuda: 'Plantas de Listados que todavía no tienen ningún contacto.' },
]

function Cobertura({ titulo, ayuda, n, de }: { titulo: string; ayuda: string; n: number; de: number }) {
  const pct = de > 0 ? Math.round((n / de) * 100) : 0
  return (
    <div className={styles.tile} role="group" aria-label={titulo}>
      <span className={styles.titulo}>{titulo}</span>
      <span className={styles.numero}>
        {nf.format(n)} <small>de {nf.format(de)}</small>
      </span>
      <div className={styles.pista} role="img" aria-label={`${pct}% de las plantas`}>
        <div className={styles.relleno} style={{ width: `${pct}%` }} />
      </div>
      <span className={styles.ayuda}>{pct}% · {ayuda}</span>
    </div>
  )
}

/** El panel de arriba: qué tan completas están las listas y dónde mirar primero. */
export function IndicadoresListas({ ind, resumen, filtro, onFiltro }: Props) {
  return (
    <section className={styles.panel} aria-label="Estado de las listas de distribución">
      <div className={styles.tiles}>
        <div className={styles.tile} role="group" aria-label="Plantas con lista">
          <span className={styles.titulo}>Plantas con lista</span>
          <span className={styles.numero}>{nf.format(ind.plantas)}</span>
          <span className={styles.ayuda}>
            {resumen.plantas_listados != null
              ? `de ${nf.format(resumen.plantas_listados)} en Listados reciben el correo de resultados`
              : 'reciben el correo de resultados'}
          </span>
        </div>
        <Cobertura titulo="Correos del cliente · Para" ayuda="reciben los resultados" n={ind.conCliente} de={ind.plantas} />
        <Cobertura titulo="Comercial · Copia" ayuda="tienen ejecutivo en copia" n={ind.conComercial} de={ind.plantas} />
        <Cobertura titulo="Técnico · Copia oculta" ayuda="tienen técnico asignado" n={ind.conTecnico} de={ind.plantas} />
        <Cobertura titulo="Admin Report Hub · Copia oculta" ayuda="incluyen al sistema" n={ind.conAdmin} de={ind.plantas} />
      </div>

      <div className={styles.alertas}>
        <span className={styles.preg}>¿Qué miro primero?</span>
        {ALERTAS.map(({ filtro: f, ayuda }) => {
          const n = ind.alertas[f]
          const activo = filtro === f
          return (
            <button
              key={f}
              type="button"
              className={`${styles.alerta} ${n > 0 ? styles.hay : styles.ok} ${activo ? styles.activa : ''}`}
              aria-pressed={activo}
              title={ayuda}
              onClick={() => onFiltro(activo ? 'todas' : f)}
            >
              {n > 0 ? <IconoAlerta width={14} height={14} /> : <span aria-hidden>✓</span>}
              {ETIQUETA_FILTRO_TABLA[f]}
              <b>{nf.format(n)}</b>
            </button>
          )
        })}
      </div>
    </section>
  )
}
