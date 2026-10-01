import { useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Indicador } from '@/components/ui/Indicador'
import { Modal } from '@/components/ui/Modal'
import { IconoAlerta, IconoBuscar, IconoCerrar } from '@/components/ui/iconosAccion'
import {
  ETIQUETA_FILTRO,
  ORDEN_FILTROS,
  agruparPorPlanta,
  aplicarListas,
  coincideFiltro,
  compararListas,
  contarCorreos,
  exportarListas,
  filtrarCambios,
} from '@/features/listasDistribucion'
import type { CambioLista, FiltroCambios, ResultadoAplicar, ResultadoComparacion } from '@/features/listasDistribucion'
import styles from './ListasDistribucionPanel.module.css'

const nf = new Intl.NumberFormat('es-CL')

function mensaje(e: unknown, defecto: string) {
  return e instanceof Error && e.message ? e.message : defecto
}

/**
 * Actualizar las listas de distribución de resultados sin tocar el servidor:
 * se exporta lo que el sistema tiene, se edita el Excel, se sube, y acá se ve
 * cada cambio (+ agregar, − quitar) para confirmar uno por uno. Nada se guarda
 * hasta apretar «Aplicar»; antes de guardar se deja un respaldo.
 */
export function ListasDistribucionPanel() {
  const entrada = useRef<HTMLInputElement>(null)
  const [conSinLista, setConSinLista] = useState(false)
  const [exportando, setExportando] = useState(false)
  const [comparando, setComparando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [resultado, setResultado] = useState<ResultadoComparacion | null>(null)
  const [archivo, setArchivo] = useState<string | null>(null)
  const [marcados, setMarcados] = useState<Set<string>>(new Set())
  const [filtro, setFiltro] = useState<FiltroCambios>('todos')
  const [texto, setTexto] = useState('')

  const [confirmando, setConfirmando] = useState(false)
  const [aplicando, setAplicando] = useState(false)
  const [errorAplicar, setErrorAplicar] = useState<string | null>(null)
  const [hecho, setHecho] = useState<ResultadoAplicar | null>(null)

  const visibles = useMemo(() => filtrarCambios(resultado?.cambios ?? [], filtro, texto), [resultado, filtro, texto])
  const grupos = useMemo(() => agruparPorPlanta(visibles), [visibles])
  const elegidos = useMemo(() => (resultado?.cambios ?? []).filter((c) => marcados.has(c.id)), [resultado, marcados])
  const totales = useMemo(() => contarCorreos(elegidos), [elegidos])
  const conteoFiltro = (f: FiltroCambios) => (resultado?.cambios ?? []).filter((c) => coincideFiltro(c, f)).length

  async function exportar() {
    setExportando(true)
    setError(null)
    try {
      await exportarListas(conSinLista)
    } catch (e) {
      setError(mensaje(e, 'No se pudo exportar el Excel.'))
    } finally {
      setExportando(false)
    }
  }

  async function subir(file: File) {
    setComparando(true)
    setError(null)
    setHecho(null)
    try {
      const r = await compararListas(file)
      setResultado(r)
      setArchivo(file.name)
      setMarcados(new Set())
      setFiltro('todos')
      setTexto('')
    } catch (e) {
      setResultado(null)
      setError(mensaje(e, 'No se pudo leer el Excel.'))
    } finally {
      setComparando(false)
      if (entrada.current) entrada.current.value = ''
    }
  }

  function alternar(id: string) {
    setMarcados((prev) => {
      const sig = new Set(prev)
      if (!sig.delete(id)) sig.add(id)
      return sig
    })
  }

  function marcar(lista: CambioLista[]) {
    setMarcados((prev) => new Set([...prev, ...lista.map((c) => c.id)]))
  }

  async function confirmar() {
    setAplicando(true)
    setErrorAplicar(null)
    try {
      const r = await aplicarListas(elegidos)
      setHecho(r)
      const aplicados = new Set(elegidos.map((c) => c.id))
      setResultado((prev) => (prev ? { ...prev, cambios: prev.cambios.filter((c) => !aplicados.has(c.id)) } : prev))
      setMarcados(new Set())
      setConfirmando(false)
    } catch (e) {
      setErrorAplicar(mensaje(e, 'No se pudieron aplicar los cambios.'))
    } finally {
      setAplicando(false)
    }
  }

  const resumen = resultado?.resumen
  const pendientes = resultado?.cambios.length ?? 0

  return (
    <div className={styles.panel}>
      <section className={styles.pasos} aria-label="Cómo actualizar las listas">
        <ol>
          <li><b>Exporta</b> el Excel con lo que el sistema tiene hoy.</li>
          <li><b>Edítalo</b>: agrega o corrige correos (celda vacía = sin cambios; para sacar a alguien, quita su correo de la celda).</li>
          <li><b>Súbelo</b> y confirma cada cambio. Nada se guarda hasta que apretes «Aplicar».</li>
        </ol>
        <div className={styles.acciones}>
          <Button variant="secondary" onClick={() => void exportar()} disabled={exportando}>
            {exportando ? 'Exportando…' : 'Exportar Excel'}
          </Button>
          <label className={styles.check}>
            <input type="checkbox" checked={conSinLista} onChange={(e) => setConSinLista(e.target.checked)} />
            Incluir plantas de Listados que aún no tienen lista
          </label>
          <span className={styles.espacio} />
          <input
            ref={entrada}
            type="file"
            accept=".xlsx"
            className={styles.oculto}
            aria-label="Subir Excel con cambios"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void subir(f) }}
          />
          <Button onClick={() => entrada.current?.click()} disabled={comparando}>
            {comparando ? 'Comparando…' : 'Subir Excel con cambios'}
          </Button>
        </div>
      </section>

      {error && (
        <div className={styles.errorCaja} role="alert">
          <IconoAlerta /> <span>{error}</span>
        </div>
      )}

      {hecho && (
        <div className={styles.exito} role="status">
          <b>Listo: {nf.format(hecho.aplicados)} {hecho.aplicados === 1 ? 'cambio aplicado' : 'cambios aplicados'}</b> en {nf.format(hecho.plantas)} {hecho.plantas === 1 ? 'planta' : 'plantas'}.
          Respaldo guardado como <code>{hecho.respaldo}</code>.
          {hecho.ignorados.length > 0 && <> Se omitieron {hecho.ignorados.length}: {hecho.ignorados.join(' · ')}</>}
        </div>
      )}

      {resumen && (
        <>
          <div className={styles.indicadores}>
            <Indicador etiqueta="Cambios por revisar" valor={nf.format(pendientes)} sub={archivo ? `en ${archivo}` : undefined} />
            <Indicador etiqueta="Plantas sin cambios" valor={nf.format(resumen.plantas_sin_cambios)} sub={`de ${nf.format(resumen.plantas_excel)} en el Excel`} />
            <Indicador
              etiqueta="Solo en el sistema"
              valor={nf.format(resumen.plantas_solo_sistema)}
              sub="plantas que el Excel no trae (no se tocan)"
            />
          </div>

          {resumen.avisos && resumen.avisos.length > 0 && (
            <details className={styles.avisos}>
              <summary><IconoAlerta width={15} height={15} /> {resumen.avisos.length} {resumen.avisos.length === 1 ? 'aviso' : 'avisos'} al leer el Excel</summary>
              <ul>{resumen.avisos.map((a, i) => <li key={i}>{a}</li>)}</ul>
            </details>
          )}

          {pendientes === 0 ? (
            <div className={styles.vacio}>
              <h3>{hecho ? 'No quedan cambios por revisar' : 'El sistema ya coincide con el Excel'}</h3>
              <p>No hay nada que agregar, quitar ni ajustar.</p>
            </div>
          ) : (
            <>
              <div className={styles.barra}>
                <div className={styles.segmentado} role="group" aria-label="Tipo de cambio">
                  {ORDEN_FILTROS.map((f) => (
                    <button key={f} type="button" aria-pressed={filtro === f} className={filtro === f ? styles.segActivo : ''} onClick={() => setFiltro(f)}>
                      {ETIQUETA_FILTRO[f]} <span>{nf.format(conteoFiltro(f))}</span>
                    </button>
                  ))}
                </div>
                <label className={styles.buscar}>
                  <IconoBuscar className={styles.lupa} width={16} height={16} />
                  <input type="search" placeholder="Buscar planta, cliente o correo…" aria-label="Buscar" value={texto} onChange={(e) => setTexto(e.target.value)} />
                </label>
                {(filtro !== 'todos' || texto) && (
                  <button type="button" className={styles.limpiar} onClick={() => { setFiltro('todos'); setTexto('') }}>
                    <IconoCerrar width={14} height={14} /> Limpiar
                  </button>
                )}
              </div>

              <div className={styles.seleccion}>
                <button type="button" className={styles.atajo} onClick={() => marcar(visibles.filter((c) => c.quitar.length === 0 && c.tipo !== 'planta_nueva'))}>
                  Marcar los que solo agregan
                </button>
                <button type="button" className={styles.atajo} onClick={() => marcar(visibles)}>Marcar todos los visibles</button>
                <button type="button" className={styles.atajo} onClick={() => setMarcados(new Set())} disabled={marcados.size === 0}>Desmarcar todos</button>
                <span className={styles.espacio} />
                <span className={styles.contador}>
                  {nf.format(elegidos.length)} {elegidos.length === 1 ? 'confirmado' : 'confirmados'}
                </span>
                <Button onClick={() => { setErrorAplicar(null); setConfirmando(true) }} disabled={elegidos.length === 0}>
                  Aplicar {elegidos.length > 0 ? nf.format(elegidos.length) : ''} {elegidos.length === 1 ? 'cambio' : 'cambios'}
                </Button>
              </div>

              {grupos.length === 0 ? (
                <div className={styles.vacio}><h3>Nada coincide con el filtro</h3></div>
              ) : (
                <ul className={styles.plantas}>
                  {grupos.map((g) => (
                    <li key={g.clave} className={styles.planta}>
                      <header>
                        <strong>{g.planta.ship_to}</strong>
                        <span>{g.planta.sold_to}</span>
                      </header>
                      <ul className={styles.cambios}>
                        {g.cambios.map((c) => (
                          <li key={c.id} className={marcados.has(c.id) ? styles.marcado : undefined}>
                            <label>
                              <input type="checkbox" checked={marcados.has(c.id)} onChange={() => alternar(c.id)} />
                              <span className={styles.etiqueta}>{c.etiqueta}</span>
                            </label>
                            <div className={styles.lineas}>
                              {c.agregar.map((e) => <span key={`+${e}`} className={styles.mas}>+ {e}</span>)}
                              {c.quitar.map((e) => <span key={`-${e}`} className={styles.menos}>− {e}</span>)}
                              {c.corregir.map((e) => <span key={`~${e}`} className={styles.ajuste}>↻ {e}</span>)}
                              {c.fila && <FilaNueva fila={c.fila} />}
                              {c.aviso && <span className={styles.aviso}><IconoAlerta width={14} height={14} /> {c.aviso}</span>}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </>
      )}

      {confirmando && (
        <Modal
          titulo="¿Aplicar los cambios confirmados?"
          onCerrar={() => !aplicando && setConfirmando(false)}
          pie={
            <>
              <Button variant="ghost" onClick={() => setConfirmando(false)} disabled={aplicando} data-foco>Cancelar</Button>
              <Button onClick={() => void confirmar()} disabled={aplicando}>{aplicando ? 'Aplicando…' : 'Aplicar'}</Button>
            </>
          }
        >
          <p>
            Se aplicarán <b>{nf.format(elegidos.length)}</b> {elegidos.length === 1 ? 'cambio' : 'cambios'}:{' '}
            <b>{nf.format(totales.agregan)}</b> {totales.agregan === 1 ? 'correo agregado' : 'correos agregados'}
            {totales.quitan > 0 && <>, <b className={styles.rojo}>{nf.format(totales.quitan)} {totales.quitan === 1 ? 'correo quitado' : 'correos quitados'}</b></>}
            {totales.ajustan > 0 && <>, {nf.format(totales.ajustan)} {totales.ajustan === 1 ? 'ajuste' : 'ajustes'} de copia</>}.
          </p>
          <p>Antes de guardar se deja un respaldo de las listas actuales. Lo que no marcaste no se toca.</p>
          {errorAplicar && <p className={styles.errorTexto} role="alert">{errorAplicar}</p>}
        </Modal>
      )}
    </div>
  )
}

function FilaNueva({ fila }: { fila: NonNullable<CambioLista['fila']> }) {
  const clientes = Object.entries(fila.clientes).filter(([, l]) => l.length)
  return (
    <>
      {fila.comercial.length > 0 && <span className={styles.mas}>+ Comercial (copia): {fila.comercial.join('; ')}</span>}
      {fila.tecnico.length > 0 && <span className={styles.mas}>+ Técnico (copia oculta): {fila.tecnico.join('; ')}</span>}
      {fila.admin.length > 0 && <span className={styles.mas}>+ Admin Report Hub (copia oculta): {fila.admin.join('; ')}</span>}
      {clientes.map(([cat, l]) => <span key={cat} className={styles.mas}>+ {cat}: {l.join('; ')}</span>)}
    </>
  )
}
