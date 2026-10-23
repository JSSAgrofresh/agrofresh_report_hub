import { describe, expect, it } from 'vitest'
import { contarFiltros, cumpleFiltro, estadoDe, filtrarRegistro } from './registro'
import type { FilaRegistro } from './registro'

const f = (o: Partial<FilaRegistro>): FilaRegistro => ({
  id: 'x', situacion: 'cargado', laboratorio: 'Quiteca', ot: 'OT-QUI0049', informe: '2026-1908-PC', sold_to: 'AGRICOLA X', ship_to: 'PLANTA X', especie: 'Manzana',
  tipo_aplicacion: 'Ecofog', emitida: '2026-10-01T12:00:00Z', enviada_lab: '2026-10-02T12:00:00Z', fecha_muestreo: '2026-10-08', fecha_informe: '2026-10-09',
  llegada: '2026-10-10T12:00:00Z', llegada_por: 'correo', cargado: '2026-10-13T12:00:00Z', cargado_por: 'Jorge', carga_archivo: null, origen: 'manual',
  enviado_cliente: null, correo_id: null, envios: 0, problemas: [], ...o,
})

const FILAS = [
  f({ id: 'a', origen: 'automatica', cargado: '2026-10-20T12:00:00Z' }),
  f({ id: 'b', origen: 'manual', problemas: [{ codigo: 'X', gravedad: 'alto', texto: 'mal', origen: 'datos' }] }),
  f({ id: 'c', origen: 'ingreso_lab', problemas: [{ codigo: 'Y', gravedad: 'info', texto: 'solo info', origen: 'datos' }] }),
  f({ id: 'd', situacion: 'por_aceptar', origen: 'sin_cargar', cargado: null }),
  f({ id: 'e', situacion: 'rechazado', origen: 'sin_cargar', cargado: null }),
  f({ id: 'f', situacion: 'esperando', origen: 'sin_cargar', informe: null, cargado: null, llegada: null }),
]
const base = { filtro: 'todos' as const, texto: '', laboratorio: '', dias: 0, ahora: Date.parse('2026-10-23T12:00:00Z') }

describe('registro de informes', () => {
  it('«Todos» no incluye las solicitudes que aún esperan su informe', () => {
    expect(filtrarRegistro(FILAS, base).map((x) => x.id)).not.toContain('f')
    expect(cumpleFiltro(FILAS[5], 'esperando')).toBe(true)
  })

  it('cuenta cada filtro', () => {
    const c = contarFiltros(FILAS)
    expect(c).toMatchObject({ todos: 5, problemas: 1, automatica: 1, manual: 1, ingreso_lab: 1, por_aceptar: 1, rechazado: 1, esperando: 1 })
  })

  it('«Con problemas» ignora lo meramente informativo', () => {
    expect(filtrarRegistro(FILAS, { ...base, filtro: 'problemas' }).map((x) => x.id)).toEqual(['b'])
  })

  it('separa lo cargado automático de lo cargado a mano', () => {
    expect(filtrarRegistro(FILAS, { ...base, filtro: 'automatica' }).map((x) => x.id)).toEqual(['a'])
    expect(filtrarRegistro(FILAS, { ...base, filtro: 'manual' }).map((x) => x.id)).toEqual(['b'])
  })

  it('lo más reciente primero', () => {
    expect(filtrarRegistro(FILAS, base).map((x) => x.id)[0]).toBe('a')
  })

  it('busca por OT, informe, cliente o quien lo cargó, sin tildes', () => {
    expect(filtrarRegistro(FILAS, { ...base, texto: 'agricola jorge' })).toHaveLength(5)
    expect(filtrarRegistro(FILAS, { ...base, texto: 'zzz' })).toHaveLength(0)
    expect(filtrarRegistro([f({ ship_to: 'FÁTIMA' })], { ...base, texto: 'fatima' })).toHaveLength(1)
  })

  it('el período y el laboratorio', () => {
    expect(filtrarRegistro(FILAS, { ...base, dias: 5 }).map((x) => x.id)).toEqual(['a'])      // solo lo del 20-10 en adelante
    expect(filtrarRegistro(FILAS, { ...base, laboratorio: 'ALS' })).toHaveLength(0)
    expect(filtrarRegistro(FILAS, { ...base, laboratorio: 'quiteca' })).toHaveLength(5)
  })

  it('el estado de cada fila', () => {
    expect(estadoDe(FILAS[0])).toEqual({ texto: 'Sin problemas', tono: 'ok' })
    expect(estadoDe(FILAS[1])).toEqual({ texto: '1 problema', tono: 'alto' })
    expect(estadoDe(FILAS[2]).tono).toBe('ok')
    expect(estadoDe(FILAS[3]).texto).toBe('Por aceptar')
    expect(estadoDe(FILAS[5]).texto).toBe('Esperando informe')
  })
})
